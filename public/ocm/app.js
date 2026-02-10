(() => {
const {
  listOffboardingCases,
  signInWithPassword,
  getAuthUser,
  adminInspectUser,
  adminInspectOrg,
  adminAccessCheck,
  adminReportingSanity,
} = window.offboardingAccessLayer ?? {};
const { renderCaseDetailPage } = window.offboardingCaseDetail ?? {};

const SESSION_KEY = "ocm.session";
const CONFIG_KEY = "ocm.config";
const RUNTIME_CONFIG_ENDPOINT = "/api/runtime-config";
let runtimeConfigPromise;

function normalizeRuntimeConfig(payload) {
  return {
    baseUrl: payload?.supabaseUrl ?? payload?.baseUrl ?? undefined,
    anonKey: payload?.supabaseAnonKey ?? payload?.anonKey ?? undefined,
  };
}

function fetchRuntimeConfig() {
  if (runtimeConfigPromise) {
    return runtimeConfigPromise;
  }
  runtimeConfigPromise = (async () => {
    try {
      const response = await fetch(RUNTIME_CONFIG_ENDPOINT, { cache: "no-store" });
      if (!response.ok) {
        return {};
      }
      const data = await response.json();
      return normalizeRuntimeConfig(data);
    } catch (error) {
      return {};
    }
  })();
  return runtimeConfigPromise;
}

function formatCaseStatus(status) {
  const normalized = (status ?? "").toLowerCase();
  if (normalized === "closed") {
    return "Closed";
  }
  if (normalized === "ready_to_close" || normalized === "in_review") {
    return "In Review";
  }
  if (normalized === "open") {
    return "Open";
  }
  return status ?? "unknown";
}

async function loadConfig() {
  const stored = window.localStorage.getItem(CONFIG_KEY);
  let persisted = {};
  if (stored) {
    try {
      persisted = JSON.parse(stored);
    } catch (error) {
      persisted = {};
    }
  }
  const params = new URLSearchParams(window.location.search);
  const queryConfig = {
    baseUrl: params.get("baseUrl") || undefined,
    anonKey: params.get("anonKey") || undefined,
  };
  const runtimeConfig = await fetchRuntimeConfig();
  const devConfig = window.OCM_DEV_CONFIG ?? {};
  const config = {
    baseUrl:
      queryConfig.baseUrl ??
      persisted.baseUrl ??
      runtimeConfig.baseUrl ??
      devConfig.baseUrl,
    anonKey:
      queryConfig.anonKey ??
      persisted.anonKey ??
      runtimeConfig.anonKey ??
      devConfig.anonKey,
  };

  if (queryConfig.baseUrl || queryConfig.anonKey) {
    saveConfig(config);
  } else if (
    (!persisted.baseUrl || !persisted.anonKey) &&
    runtimeConfig.baseUrl &&
    runtimeConfig.anonKey
  ) {
    saveConfig({
      baseUrl: runtimeConfig.baseUrl,
      anonKey: runtimeConfig.anonKey,
    });
  }

  return config;
}

function saveConfig(config) {
  window.localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
}

function loadSession() {
  const stored = window.localStorage.getItem(SESSION_KEY);
  if (!stored) {
    return null;
  }
  try {
    return JSON.parse(stored);
  } catch (error) {
    return null;
  }
}

function saveSession(session) {
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

function clearSession() {
  window.localStorage.removeItem(SESSION_KEY);
}

function parseJwtClaims(token) {
  if (!token || typeof token !== "string") {
    return null;
  }
  const parts = token.split(".");
  if (parts.length < 2) {
    return null;
  }
  const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
  const padded = payload.padEnd(payload.length + ((4 - (payload.length % 4)) % 4), "=");
  try {
    const json = atob(padded);
    return JSON.parse(json);
  } catch (error) {
    return null;
  }
}

function deriveIdentity(user, claims) {
  const email = user?.email ?? claims?.email ?? "Not set";
  const role =
    user?.role ??
    user?.app_metadata?.role ??
    user?.user_metadata?.role ??
    claims?.role ??
    claims?.app_metadata?.role ??
    claims?.user_metadata?.role ??
    "Not set";
  const org =
    user?.app_metadata?.org_id ??
    user?.user_metadata?.org_id ??
    user?.app_metadata?.org ??
    user?.user_metadata?.org ??
    claims?.org_id ??
    claims?.org ??
    "Not set";

  return {
    email,
    role,
    org,
    platformAdmin:
      user?.app_metadata?.platform_admin === true ||
      claims?.app_metadata?.platform_admin === true,
  };
}

function isPlatformAdminSession(session) {
  const claims = parseJwtClaims(session?.accessToken);
  return (
    session?.user?.app_metadata?.platform_admin === true ||
    session?.identity?.platformAdmin === true ||
    claims?.app_metadata?.platform_admin === true
  );
}

async function hydrateIdentity(config, session) {
  if (!getAuthUser || !session?.accessToken) {
    return session;
  }
  try {
    const user = await getAuthUser({
      baseUrl: config.baseUrl,
      anonKey: config.anonKey,
      accessToken: session.accessToken,
    });
    const claims = parseJwtClaims(session.accessToken);
    const identity = deriveIdentity(user, claims);
    const updated = { ...session, user, identity };
    saveSession(updated);
    return updated;
  } catch (error) {
    return session;
  }
}

function navigate(hash) {
  window.location.hash = hash;
}

function buildShell({ title, showLogout, onLogout }) {
  const shell = document.createElement("div");
  shell.className = "app-shell";

  const header = document.createElement("header");
  header.className = "app-header";

  const appTitle = document.createElement("div");
  appTitle.className = "app-title";
  appTitle.textContent = title;

  header.appendChild(appTitle);

  if (showLogout) {
    const logout = document.createElement("button");
    logout.className = "button secondary";
    logout.textContent = "Log out";
    logout.addEventListener("click", onLogout);
    header.appendChild(logout);
  }

  const main = document.createElement("main");
  main.className = "app-main";

  shell.append(header, main);
  return { shell, main };
}

function renderIdentityPanel(container, session, config) {
  const panel = document.createElement("section");
  panel.className = "panel identity-panel";

  const heading = document.createElement("h2");
  heading.textContent = "Signed-in Identity";

  const grid = document.createElement("div");
  grid.className = "identity-grid";

  const emailValue = document.createElement("div");
  const roleValue = document.createElement("div");
  const orgValue = document.createElement("div");

  function renderValue(label, value, target) {
    const row = document.createElement("div");
    row.className = "identity-row";
    const labelEl = document.createElement("div");
    labelEl.className = "identity-label";
    labelEl.textContent = label;
    const valueEl = document.createElement("div");
    valueEl.className = "identity-value";
    valueEl.textContent = value;
    row.append(labelEl, valueEl);
    target.appendChild(row);
  }

  const identity = session?.identity;
  renderValue("Email", identity?.email ?? "Loading...", grid);
  renderValue("Role", identity?.role ?? "Loading...", grid);
  renderValue("Org", identity?.org ?? "Loading...", grid);

  panel.append(heading, grid);
  container.appendChild(panel);

  if (!identity && session?.accessToken) {
    hydrateIdentity(config, session).then((updated) => {
      const nextIdentity = updated?.identity ?? identity;
      if (!nextIdentity) {
        return;
      }
      grid.innerHTML = "";
      renderValue("Email", nextIdentity.email ?? "Not set", grid);
      renderValue("Role", nextIdentity.role ?? "Not set", grid);
      renderValue("Org", nextIdentity.org ?? "Not set", grid);
    });
  }
}

function renderKeyValueGrid(container, entries) {
  const grid = document.createElement("div");
  grid.className = "result-grid";
  entries.forEach(({ label, value }) => {
    const row = document.createElement("div");
    row.className = "result-row";
    const labelEl = document.createElement("div");
    labelEl.className = "result-label";
    labelEl.textContent = label;
    const valueEl = document.createElement("div");
    valueEl.className = "result-value";
    valueEl.textContent = value ?? "—";
    row.append(labelEl, valueEl);
    grid.appendChild(row);
  });
  container.appendChild(grid);
}

function renderResultTable(container, headers, rows) {
  const table = document.createElement("table");
  table.className = "case-table";
  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  headers.forEach((label) => {
    const th = document.createElement("th");
    th.textContent = label;
    headRow.appendChild(th);
  });
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  if (!rows.length) {
    const emptyRow = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = headers.length;
    cell.textContent = "No data returned.";
    emptyRow.appendChild(cell);
    tbody.appendChild(emptyRow);
  } else {
    rows.forEach((row) => {
      const tr = document.createElement("tr");
      row.forEach((value) => {
        const cell = document.createElement("td");
        cell.textContent = value ?? "—";
        tr.appendChild(cell);
      });
      tbody.appendChild(tr);
    });
  }
  table.appendChild(tbody);
  container.appendChild(table);
}

function renderLogin(container) {
  const { shell, main } = buildShell({
    title: "Offboarding Case Manager",
    showLogout: false,
  });

  const panel = document.createElement("section");
  panel.className = "panel";

  const heading = document.createElement("h1");
  heading.textContent = "Login";

  const hint = document.createElement("p");
  hint.className = "hint";
  hint.textContent =
    "Sign in with your email and password. Tokens stay in local storage and never appear in the URL.";

  const form = document.createElement("form");
  form.className = "form-grid";

  const wrapper = document.createElement("div");
  wrapper.className = "form-field";

  const label = document.createElement("label");
  label.setAttribute("for", "email");
  label.textContent = "Email";

  const emailInput = document.createElement("input");
  emailInput.id = "email";
  emailInput.type = "email";
  emailInput.required = true;
  emailInput.autocomplete = "email";

  wrapper.append(label, emailInput);
  form.appendChild(wrapper);

  const passwordWrapper = document.createElement("div");
  passwordWrapper.className = "form-field";

  const passwordLabel = document.createElement("label");
  passwordLabel.setAttribute("for", "password");
  passwordLabel.textContent = "Password";

  const passwordInput = document.createElement("input");
  passwordInput.id = "password";
  passwordInput.type = "password";
  passwordInput.required = true;
  passwordInput.autocomplete = "current-password";

  passwordWrapper.append(passwordLabel, passwordInput);
  form.appendChild(passwordWrapper);

  const error = document.createElement("div");
  error.className = "error";

  const status = document.createElement("div");
  status.className = "hint";

  const loginButton = document.createElement("button");
  loginButton.className = "button";
  loginButton.type = "submit";
  loginButton.textContent = "Log in";

  form.append(error, status, loginButton);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    error.textContent = "";
    status.textContent = "";
    loginButton.disabled = true;
    const previousText = loginButton.textContent;
    loginButton.textContent = "Signing in...";

    try {
      const config = await loadConfig();
      if (!config.baseUrl || !config.anonKey) {
        throw new Error("Supabase configuration missing");
      }
      if (!signInWithPassword) {
        throw new Error("Access layer not available");
      }
      const email = emailInput.value.trim();
      const password = passwordInput.value;
      if (!email || !password) {
        throw new Error("email and password required");
      }
      const response = await signInWithPassword({
        baseUrl: config.baseUrl,
        anonKey: config.anonKey,
        email,
        password,
      });
      const accessToken = response?.access_token;
      if (!accessToken) {
        throw new Error("Missing access token");
      }
      const session = {
        accessToken,
        refreshToken: response?.refresh_token ?? null,
        expiresIn: response?.expires_in ?? null,
        tokenType: response?.token_type ?? "bearer",
      };
      saveSession(session);
      hydrateIdentity(config, session);
      navigate("#/cases");
    } catch (err) {
      error.textContent =
        "Unable to sign in. Please check your credentials and access.";
    } finally {
      loginButton.textContent = previousText;
      loginButton.disabled = false;
    }
  });

  panel.append(heading, hint, form);
  main.appendChild(panel);
  container.appendChild(shell);
}

function renderAdminBlocked(container, session, config) {
  const { shell, main } = buildShell({
    title: "Admin Inspection",
    showLogout: true,
    onLogout: () => {
      clearSession();
      navigate("#/login");
    },
  });

  renderIdentityPanel(main, session, config);

  const panel = document.createElement("section");
  panel.className = "panel";

  const heading = document.createElement("h1");
  heading.textContent = "Admin Inspection Blocked";

  const message = document.createElement("p");
  message.className = "error";
  message.textContent =
    "Access denied: only users with app_metadata.platform_admin = true can view Admin Inspection.";

  const back = document.createElement("button");
  back.className = "button secondary";
  back.textContent = "Back to Case List";
  back.addEventListener("click", () => navigate("#/cases"));

  panel.append(heading, message, back);
  main.appendChild(panel);
  container.appendChild(shell);
}

function renderAdminInspection(container, session, config) {
  const { shell, main } = buildShell({
    title: "Admin Inspection (Platform Admin)",
    showLogout: true,
    onLogout: () => {
      clearSession();
      navigate("#/login");
    },
  });

  renderIdentityPanel(main, session, config);

  const back = document.createElement("button");
  back.className = "button secondary case-detail__back";
  back.textContent = "Back to Case List";
  back.addEventListener("click", () => navigate("#/cases"));
  main.appendChild(back);

  const userPanel = document.createElement("section");
  userPanel.className = "panel";
  const userHeading = document.createElement("h2");
  userHeading.textContent = "User Inspection";
  const userHint = document.createElement("p");
  userHint.className = "hint";
  userHint.textContent =
    "Look up a user by email or user ID to inspect read-only identity and org memberships.";
  const userForm = document.createElement("form");
  userForm.className = "form-grid";
  const userEmailField = document.createElement("div");
  userEmailField.className = "form-field";
  const userEmailLabel = document.createElement("label");
  userEmailLabel.textContent = "Email";
  const userEmailInput = document.createElement("input");
  userEmailInput.type = "email";
  userEmailInput.autocomplete = "email";
  userEmailField.append(userEmailLabel, userEmailInput);
  const userIdField = document.createElement("div");
  userIdField.className = "form-field";
  const userIdLabel = document.createElement("label");
  userIdLabel.textContent = "User ID";
  const userIdInput = document.createElement("input");
  userIdInput.type = "text";
  userIdInput.placeholder = "UUID";
  userIdField.append(userIdLabel, userIdInput);
  const userError = document.createElement("div");
  userError.className = "error";
  const userStatus = document.createElement("div");
  userStatus.className = "hint";
  const userSubmit = document.createElement("button");
  userSubmit.type = "submit";
  userSubmit.className = "button";
  userSubmit.textContent = "Lookup user";
  userForm.append(
    userEmailField,
    userIdField,
    userError,
    userStatus,
    userSubmit
  );
  const userResults = document.createElement("div");
  userResults.className = "results-block";
  userForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    userError.textContent = "";
    userStatus.textContent = "";
    userResults.innerHTML = "";
    if (!adminInspectUser) {
      userError.textContent = "Admin tooling not available.";
      return;
    }
    const email = userEmailInput.value.trim();
    const userId = userIdInput.value.trim();
    if (!email && !userId) {
      userError.textContent = "Provide an email or user ID.";
      return;
    }
    userSubmit.disabled = true;
    userSubmit.textContent = "Loading...";
    try {
      const results = await adminInspectUser({
        baseUrl: config.baseUrl,
        anonKey: config.anonKey,
        accessToken: session.accessToken,
        email: email || null,
        userId: userId || null,
      });
      const firstRow = results?.[0];
      if (!firstRow) {
        userStatus.textContent = "Not found.";
        return;
      }
      if (firstRow.error_code || firstRow.error_message) {
        userError.textContent = `[${firstRow.error_code ?? "UNKNOWN"}] ${
          firstRow.error_message ?? "Unknown admin_inspect_user error"
        }`;
        return;
      }
      renderKeyValueGrid(userResults, [
        { label: "User ID", value: firstRow.user_id },
        { label: "Email", value: firstRow.email },
        {
          label: "Platform admin",
          value: firstRow.is_platform_admin ? "true" : "false",
        },
        { label: "Org count", value: firstRow.org_count },
      ]);
      const memberships = (results ?? [])
        .filter((row) => row.org_id)
        .map((row) => [row.org_id, row.role]);
      const membershipsHeading = document.createElement("h3");
      membershipsHeading.textContent = "Org memberships";
      userResults.appendChild(membershipsHeading);
      renderResultTable(userResults, ["Org ID", "Role"], memberships);
    } catch (error) {
      if (error?.status === 401 || error?.status === 403) {
        userError.textContent = "Platform admin access required or lookup failed.";
      } else {
        userError.textContent = "Lookup failed.";
      }
    } finally {
      userSubmit.disabled = false;
      userSubmit.textContent = "Lookup user";
    }
  });
  userPanel.append(userHeading, userHint, userForm, userResults);

  const orgPanel = document.createElement("section");
  orgPanel.className = "panel";
  const orgHeading = document.createElement("h2");
  orgHeading.textContent = "Org Inspection";
  const orgHint = document.createElement("p");
  orgHint.className = "hint";
  orgHint.textContent =
    "Check read-only member/case counts and anomaly flags for an org.";
  const orgForm = document.createElement("form");
  orgForm.className = "form-grid";
  const orgField = document.createElement("div");
  orgField.className = "form-field";
  const orgLabel = document.createElement("label");
  orgLabel.textContent = "Org ID";
  const orgInput = document.createElement("input");
  orgInput.type = "text";
  orgInput.placeholder = "UUID";
  orgField.append(orgLabel, orgInput);
  const orgError = document.createElement("div");
  orgError.className = "error";
  const orgStatus = document.createElement("div");
  orgStatus.className = "hint";
  const orgSubmit = document.createElement("button");
  orgSubmit.type = "submit";
  orgSubmit.className = "button";
  orgSubmit.textContent = "Lookup org";
  orgForm.append(orgField, orgError, orgStatus, orgSubmit);
  const orgResults = document.createElement("div");
  orgResults.className = "results-block";
  orgForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    orgError.textContent = "";
    orgStatus.textContent = "";
    orgResults.innerHTML = "";
    if (!adminInspectOrg) {
      orgError.textContent = "Admin tooling not available.";
      return;
    }
    const orgId = orgInput.value.trim();
    if (!orgId) {
      orgError.textContent = "Provide an org ID.";
      return;
    }
    orgSubmit.disabled = true;
    orgSubmit.textContent = "Loading...";
    try {
      const results = await adminInspectOrg({
        baseUrl: config.baseUrl,
        anonKey: config.anonKey,
        accessToken: session.accessToken,
        orgId,
      });
      const record = results?.[0];
      if (!record) {
        orgStatus.textContent = "No org found.";
      } else {
        renderKeyValueGrid(orgResults, [
          { label: "Org ID", value: record.org_id },
          { label: "Member count", value: record.member_count },
          { label: "Case count", value: record.case_count },
          {
            label: "Cases but no members",
            value: record.cases_without_members ? "Yes" : "No",
          },
          {
            label: "Members but no cases",
            value: record.members_without_cases ? "Yes" : "No",
          },
        ]);
      }
    } catch (error) {
      orgError.textContent = "Platform admin access required or lookup failed.";
    } finally {
      orgSubmit.disabled = false;
      orgSubmit.textContent = "Lookup org";
    }
  });
  orgPanel.append(orgHeading, orgHint, orgForm, orgResults);

  const accessPanel = document.createElement("section");
  accessPanel.className = "panel";
  const accessHeading = document.createElement("h2");
  accessHeading.textContent = "Access Reasoning";
  const accessHint = document.createElement("p");
  accessHint.className = "hint";
  accessHint.textContent =
    "Check whether a user can see a case and why (case_not_found means no case exists).";
  const accessForm = document.createElement("form");
  accessForm.className = "form-grid";
  const accessUserField = document.createElement("div");
  accessUserField.className = "form-field";
  const accessUserLabel = document.createElement("label");
  accessUserLabel.textContent = "User ID";
  const accessUserInput = document.createElement("input");
  accessUserInput.type = "text";
  accessUserInput.placeholder = "UUID";
  accessUserField.append(accessUserLabel, accessUserInput);
  const accessCaseField = document.createElement("div");
  accessCaseField.className = "form-field";
  const accessCaseLabel = document.createElement("label");
  accessCaseLabel.textContent = "Case ID";
  const accessCaseInput = document.createElement("input");
  accessCaseInput.type = "text";
  accessCaseInput.placeholder = "UUID";
  accessCaseField.append(accessCaseLabel, accessCaseInput);
  const accessError = document.createElement("div");
  accessError.className = "error";
  const accessStatus = document.createElement("div");
  accessStatus.className = "hint";
  const accessSubmit = document.createElement("button");
  accessSubmit.type = "submit";
  accessSubmit.className = "button";
  accessSubmit.textContent = "Check access";
  accessForm.append(
    accessUserField,
    accessCaseField,
    accessError,
    accessStatus,
    accessSubmit
  );
  const accessResults = document.createElement("div");
  accessResults.className = "results-block";
  accessForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    accessError.textContent = "";
    accessStatus.textContent = "";
    accessResults.innerHTML = "";
    if (!adminAccessCheck) {
      accessError.textContent = "Admin tooling not available.";
      return;
    }
    const userId = accessUserInput.value.trim();
    const caseId = accessCaseInput.value.trim();
    if (!userId || !caseId) {
      accessError.textContent = "Provide both user ID and case ID.";
      return;
    }
    accessSubmit.disabled = true;
    accessSubmit.textContent = "Loading...";
    try {
      const results = await adminAccessCheck({
        baseUrl: config.baseUrl,
        anonKey: config.anonKey,
        accessToken: session.accessToken,
        userId,
        caseId,
      });
      const record = results?.[0];
      if (!record) {
        accessStatus.textContent = "No access details returned.";
      } else {
        renderKeyValueGrid(accessResults, [
          { label: "User ID", value: record.user_id },
          { label: "Case ID", value: record.case_id },
          { label: "Case org ID", value: record.case_org_id },
          { label: "Visible", value: record.is_visible ? "true" : "false" },
          { label: "Reason", value: record.reason },
        ]);
      }
    } catch (error) {
      accessError.textContent = "Platform admin access required or lookup failed.";
    } finally {
      accessSubmit.disabled = false;
      accessSubmit.textContent = "Check access";
    }
  });
  accessPanel.append(accessHeading, accessHint, accessForm, accessResults);

  const reportingPanel = document.createElement("section");
  reportingPanel.className = "panel";
  const reportingHeading = document.createElement("h2");
  reportingHeading.textContent = "Reporting Sanity";
  const reportingHint = document.createElement("p");
  reportingHint.className = "hint";
  reportingHint.textContent =
    "Compare read-only reporting rows to org case counts.";
  const reportingForm = document.createElement("form");
  reportingForm.className = "form-grid";
  const reportingField = document.createElement("div");
  reportingField.className = "form-field";
  const reportingLabel = document.createElement("label");
  reportingLabel.textContent = "Org ID";
  const reportingInput = document.createElement("input");
  reportingInput.type = "text";
  reportingInput.placeholder = "UUID";
  reportingField.append(reportingLabel, reportingInput);
  const reportingError = document.createElement("div");
  reportingError.className = "error";
  const reportingStatus = document.createElement("div");
  reportingStatus.className = "hint";
  const reportingSubmit = document.createElement("button");
  reportingSubmit.type = "submit";
  reportingSubmit.className = "button";
  reportingSubmit.textContent = "Check reporting";
  reportingForm.append(
    reportingField,
    reportingError,
    reportingStatus,
    reportingSubmit
  );
  const reportingResults = document.createElement("div");
  reportingResults.className = "results-block";
  reportingForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    reportingError.textContent = "";
    reportingStatus.textContent = "";
    reportingResults.innerHTML = "";
    if (!adminReportingSanity) {
      reportingError.textContent = "Admin tooling not available.";
      return;
    }
    const orgId = reportingInput.value.trim();
    if (!orgId) {
      reportingError.textContent = "Provide an org ID.";
      return;
    }
    reportingSubmit.disabled = true;
    reportingSubmit.textContent = "Loading...";
    try {
      const results = await adminReportingSanity({
        baseUrl: config.baseUrl,
        anonKey: config.anonKey,
        accessToken: session.accessToken,
        orgId,
      });
      const record = results?.[0];
      if (!record) {
        reportingStatus.textContent = "No org found.";
      } else {
        renderKeyValueGrid(reportingResults, [
          { label: "Org ID", value: record.org_id },
          { label: "Case count", value: record.case_count },
          {
            label: "Reporting SLA rows",
            value: record.reporting_case_sla_count,
          },
          {
            label: "Reporting escalation rows",
            value: record.reporting_case_escalation_count,
          },
          { label: "Reporting empty", value: record.reporting_empty ? "Yes" : "No" },
          { label: "Empty reason", value: record.reporting_empty_reason },
        ]);
      }
    } catch (error) {
      reportingError.textContent = "Platform admin access required or lookup failed.";
    } finally {
      reportingSubmit.disabled = false;
      reportingSubmit.textContent = "Check reporting";
    }
  });
  reportingPanel.append(
    reportingHeading,
    reportingHint,
    reportingForm,
    reportingResults
  );

  main.append(userPanel, orgPanel, accessPanel, reportingPanel);
  container.appendChild(shell);
}

function renderCaseList(container, session, config) {
  const { shell, main } = buildShell({
    title: "Case List",
    showLogout: true,
    onLogout: () => {
      clearSession();
      navigate("#/login");
    },
  });

  renderIdentityPanel(main, session, config);

  const panel = document.createElement("section");
  panel.className = "panel";

  const header = document.createElement("div");
  header.className = "case-list__meta";

  const titleBlock = document.createElement("div");
  titleBlock.className = "case-list__title";

  const heading = document.createElement("h1");
  heading.textContent = "Case List";

  const note = document.createElement("div");
  note.className = "hint";
  note.textContent = "Read-only view of cases you can access.";

  titleBlock.append(heading, note);

  const adminButton = document.createElement("button");
  adminButton.className = "button secondary";
  adminButton.textContent = "Admin Inspection";
  const platformAdmin = isPlatformAdminSession(session);
  if (!platformAdmin) {
    adminButton.disabled = true;
    adminButton.title =
      "Only users with app_metadata.platform_admin = true can open Admin Inspection.";
  }
  adminButton.addEventListener("click", () => {
    navigate("#/admin");
  });

  header.append(titleBlock, adminButton);
  panel.appendChild(header);

  const status = document.createElement("div");
  status.className = "hint";
  status.textContent = "Loading cases...";
  panel.appendChild(status);

  const table = document.createElement("table");
  table.className = "case-table";
  panel.appendChild(table);

  main.appendChild(panel);
  container.appendChild(shell);

  listOffboardingCases({
    baseUrl: config.baseUrl,
    anonKey: config.anonKey,
    accessToken: session.accessToken,
  })
    .then((cases = []) => {
      status.textContent = "";
      const thead = document.createElement("thead");
      const headRow = document.createElement("tr");
      ["Case No", "Employee", "Status", "Last working day"].forEach((label) => {
        const th = document.createElement("th");
        th.textContent = label;
        headRow.appendChild(th);
      });
      thead.appendChild(headRow);

      const tbody = document.createElement("tbody");
      if (!cases || cases.length === 0) {
        status.textContent = "No access / no data available for this account.";
      } else {
        cases.forEach((record) => {
          const row = document.createElement("tr");
          row.addEventListener("click", () => {
            navigate(`#/cases/${record.id}`);
          });

          const caseNo = document.createElement("td");
          caseNo.textContent = record.case_no ?? "—";

          const employee = document.createElement("td");
          employee.textContent = record.employee_name ?? "—";

          const statusCell = document.createElement("td");
          const pill = document.createElement("span");
          pill.className = "status-pill";
          pill.textContent = formatCaseStatus(record.status);
          statusCell.appendChild(pill);

          const lastDay = document.createElement("td");
          lastDay.textContent = record.last_working_day ?? "—";

          row.append(caseNo, employee, statusCell, lastDay);
          tbody.appendChild(row);
        });
      }

      table.append(thead, tbody);
    })
    .catch((error) => {
      status.textContent =
        "Unable to load cases. Please verify login and try again.";
      table.innerHTML = "";
    });
}

function renderCaseDetail(container, session, config, caseId) {
  const { shell, main } = buildShell({
    title: "Case Detail",
    showLogout: true,
    onLogout: () => {
      clearSession();
      navigate("#/login");
    },
  });

  renderIdentityPanel(main, session, config);

  const back = document.createElement("button");
  back.className = "button secondary case-detail__back";
  back.textContent = "Back to Case List";
  back.addEventListener("click", () => navigate("#/cases"));
  main.appendChild(back);

  const panel = document.createElement("section");
  panel.className = "panel";
  main.appendChild(panel);

  container.appendChild(shell);

  if (!caseId) {
    panel.textContent = "Missing case identifier.";
    return;
  }

  const loading = document.createElement("div");
  loading.className = "hint";
  loading.textContent = "Loading case detail...";
  panel.appendChild(loading);

  listOffboardingCases({
    baseUrl: config.baseUrl,
    anonKey: config.anonKey,
    accessToken: session.accessToken,
    caseId,
    limit: 1,
  })
    .then(async (records = []) => {
      panel.innerHTML = "";
      const record = records?.[0];
      if (!record) {
        panel.textContent = "No access / no data for this case.";
        return;
      }
      await renderCaseDetailPage({
        container: panel,
        caseRecord: record,
        baseUrl: config.baseUrl,
        anonKey: config.anonKey,
        accessToken: session.accessToken,
      });
    })
    .catch((error) => {
      panel.textContent =
        "Unable to load case detail. Please check credentials.";
    });
}

async function renderRoute() {
  const appRoot = document.getElementById("app");
  if (!appRoot) {
    return;
  }
  appRoot.innerHTML = "";

  const config = await loadConfig();
  const session = loadSession();
  const hash = window.location.hash || "#/login";

  if (!session && hash !== "#/login") {
    navigate("#/login");
    return;
  }

  if (hash === "#/login") {
    renderLogin(appRoot);
    return;
  }

  if (!session || !session.accessToken) {
    renderLogin(appRoot);
    return;
  }

  if (hash === "#/cases") {
    renderCaseList(appRoot, session, config);
    return;
  }

  if (hash === "#/admin") {
    if (isPlatformAdminSession(session)) {
      renderAdminInspection(appRoot, session, config);
    } else {
      renderAdminBlocked(appRoot, session, config);
    }
    return;
  }

  if (hash.startsWith("#/cases/")) {
    const caseId = hash.replace("#/cases/", "");
    renderCaseDetail(appRoot, session, config, caseId);
    return;
  }

  navigate(session ? "#/cases" : "#/login");
}

window.addEventListener("hashchange", () => {
  renderRoute();
});
window.addEventListener("DOMContentLoaded", () => {
  renderRoute();
});
})();
