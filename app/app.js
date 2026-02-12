(() => {
const {
  listOffboardingCases,
  signInWithPassword,
  signUpWithPassword,
  getAuthUser,
  redeemInvite,
  adminInspectUser,
  adminInspectOrg,
  adminAccessCheck,
  adminReportingSanity,
  ownerAssignCaseReviewer,
  listManageableOrgs,
  getCurrentOrgContext,
  searchUsersByEmail,
  listRoles,
  assignUserToOrg,
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

function buildIdentity(user, membership) {
  const email = user?.email ?? "Not set";
  const role = membership?.role ?? "Not set";
  const org = membership?.org_name ?? "Not set";

  return { email, role, org, orgNotSet: !membership };
}

async function getIdentityMembership(config, accessToken) {
  if (!getCurrentOrgContext || !accessToken) {
    return { membership: null, error: null };
  }

  try {
    const rows = await getCurrentOrgContext({
      baseUrl: config.baseUrl,
      anonKey: config.anonKey,
      accessToken,
    });
    return {
      membership: Array.isArray(rows) ? rows[0] ?? null : rows ?? null,
      error: null,
    };
  } catch (error) {
    return { membership: null, error };
  }
}

async function hydrateIdentity(config, session) {
  if (!session?.accessToken) {
    return session;
  }

  let user = session.user ?? null;
  if (getAuthUser) {
    try {
      user = await getAuthUser({
        baseUrl: config.baseUrl,
        anonKey: config.anonKey,
        accessToken: session.accessToken,
      });
    } catch (error) {
      user = session.user ?? null;
    }
  }

  const { membership, error: membershipError } = await getIdentityMembership(config, session.accessToken);
  const identity = buildIdentity(user, membership);
  const updated = { ...session, user, membership, identity, membershipError };
  saveSession(updated);
  return updated;
}

function navigate(hash) {
  window.location.hash = hash;
}

function getHashRoute() {
  return (window.location.hash || "#/login").split("?")[0];
}

function isOwnerOrAdmin(session) {
  const role = String(session?.membership?.role ?? "").toLowerCase();
  return role === "owner" || role === "admin";
}

function getRpcErrorMessage(error) {
  const details = [
    error?.payload?.message,
    error?.payload?.error_description,
    error?.payload?.error,
    error?.message,
  ]
    .find((item) => typeof item === "string" && item.trim().length > 0)
    ?.toLowerCase();

  if (!details) {
    return "Request failed. Please try again.";
  }
  if (details.includes("case not found")) {
    return "Not found: case not found.";
  }
  if (details.includes("access denied") || details.includes("insufficient") || details.includes("permission")) {
    return "Access denied.";
  }
  if (details.includes("user not found")) {
    return "user not found";
  }
  if (details.includes("org not found")) {
    return "org not found";
  }
  if (details.includes("invalid role")) {
    return "invalid role";
  }
  if (details.includes("multi-org not supported")) {
    return "multi-org not supported";
  }
  if (details.includes("reviewer not in org") || details.includes("reviewer must")) {
    return "reviewer not in org.";
  }
  if (details.includes("expired")) {
    return "Invite expired.";
  }
  if (details.includes("invalid code")) {
    return "Invalid invite code.";
  }
  if (details.includes("already redeemed")) {
    return "Invite already redeemed.";
  }
  return details;
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

  const identityHint = document.createElement("div");
  identityHint.className = "hint";

  function renderIdentityHint(nextSession, nextIdentity) {
    identityHint.textContent = "";
    if (nextSession?.membershipError) {
      identityHint.textContent = `Identity context error: ${getRpcErrorMessage(nextSession.membershipError)}.`;
    } else if (nextIdentity?.orgNotSet) {
      if (redeemInvite) {
        identityHint.textContent = "Org: Not set. Ask an org owner/admin to assign your membership, then redeem invite code.";
        const joinLink = document.createElement("a");
        joinLink.href = "#/join";
        joinLink.textContent = " Open join page.";
        identityHint.appendChild(joinLink);
      } else {
        identityHint.textContent = "Org: Not set. Ask an org owner/admin to assign your membership.";
      }
    }
  }

  renderIdentityHint(session, identity);

  panel.append(heading, grid, identityHint);
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
      renderIdentityHint(updated, nextIdentity);
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

  const registerHint = document.createElement("p");
  registerHint.className = "hint";
  registerHint.innerHTML = `No account yet? <a href="#/register">Register</a>.`;

  panel.append(heading, hint, form, registerHint);
  main.appendChild(panel);
  container.appendChild(shell);
}

function renderRegister(container) {
  const { shell, main } = buildShell({
    title: "Offboarding Case Manager",
    showLogout: false,
  });

  const panel = document.createElement("section");
  panel.className = "panel";

  const heading = document.createElement("h1");
  heading.textContent = "Register";

  const hint = document.createElement("p");
  hint.className = "hint";
  hint.textContent = "Create an account with email/password. Do not enter user ID or org ID.";

  const form = document.createElement("form");
  form.className = "form-grid";

  function buildField(id, labelText, type, autocomplete, required = true) {
    const field = document.createElement("div");
    field.className = "form-field";
    const label = document.createElement("label");
    label.setAttribute("for", id);
    label.textContent = labelText;
    const input = document.createElement("input");
    input.id = id;
    input.type = type;
    input.required = required;
    if (autocomplete) {
      input.autocomplete = autocomplete;
    }
    field.append(label, input);
    return { field, input };
  }

  const emailField = buildField("register-email", "Email", "email", "email");
  const passwordField = buildField("register-password", "Password", "password", "new-password");
  const confirmField = buildField("register-confirm", "Confirm password", "password", "new-password");
  const inviteField = buildField("register-invite", "Invite code (optional)", "text", "off", false);

  const error = document.createElement("div");
  error.className = "error";

  const status = document.createElement("div");
  status.className = "hint";

  const submitButton = document.createElement("button");
  submitButton.className = "button";
  submitButton.type = "submit";
  submitButton.textContent = "Register";

  form.append(
    emailField.field,
    passwordField.field,
    confirmField.field,
    inviteField.field,
    error,
    status,
    submitButton,
  );

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    error.textContent = "";
    status.textContent = "";

    const email = emailField.input.value.trim();
    const password = passwordField.input.value;
    const confirmPassword = confirmField.input.value;
    const inviteCode = inviteField.input.value.trim();

    if (!email || !password || !confirmPassword) {
      error.textContent = "Email, password, and confirm password are required.";
      return;
    }

    if (password !== confirmPassword) {
      error.textContent = "Confirm password does not match.";
      return;
    }

    submitButton.disabled = true;
    const previousText = submitButton.textContent;
    submitButton.textContent = "Registering...";

    try {
      const config = await loadConfig();
      if (!config.baseUrl || !config.anonKey) {
        throw new Error("Supabase configuration missing");
      }
      if (!signUpWithPassword) {
        throw new Error("Access layer not available");
      }

      const response = await signUpWithPassword({
        baseUrl: config.baseUrl,
        anonKey: config.anonKey,
        email,
        password,
      });

      const accessToken = response?.access_token ?? response?.session?.access_token ?? null;
      const session = accessToken
        ? {
            accessToken,
            refreshToken: response?.refresh_token ?? response?.session?.refresh_token ?? null,
            expiresIn: response?.expires_in ?? response?.session?.expires_in ?? null,
            tokenType: response?.token_type ?? response?.session?.token_type ?? "bearer",
          }
        : null;

      if (session) {
        saveSession(session);
      }

      if (inviteCode && session?.accessToken && redeemInvite) {
        await redeemInvite({
          baseUrl: config.baseUrl,
          anonKey: config.anonKey,
          accessToken: session.accessToken,
          code: inviteCode,
        });
        const hydrated = await hydrateIdentity(config, session);
        status.textContent = "Invite redeemed. Redirecting to case list...";
        setTimeout(() => {
          navigate(hydrated?.accessToken ? "#/cases" : "#/login");
        }, 500);
        return;
      }

      if (inviteCode && !session?.accessToken) {
        status.textContent = "Registration success. Please verify email, then login to redeem invite code.";
        setTimeout(() => navigate("#/login"), 1000);
        return;
      }

      if (!session?.accessToken) {
        status.textContent = "請到 email 完成驗證後再 login";
        setTimeout(() => navigate("#/login"), 1000);
        return;
      }

      status.textContent = "Registration success. Redirecting to login...";
      setTimeout(() => navigate("#/login"), 500);
    } catch (requestError) {
      error.textContent = getRpcErrorMessage(requestError);
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = previousText;
    }
  });

  const loginHint = document.createElement("p");
  loginHint.className = "hint";
  loginHint.innerHTML = `Already have an account? <a href="#/login">Back to login</a>.`;

  panel.append(heading, hint, form, loginHint);

  main.appendChild(panel);
  container.appendChild(shell);
}

function renderJoin(container, session, config) {
  const { shell, main } = buildShell({
    title: "Redeem Invite",
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
  heading.textContent = "Join Organization";

  const hint = document.createElement("p");
  hint.className = "hint";
  hint.textContent = "Already have an account? Enter invite code to redeem membership.";

  const form = document.createElement("form");
  form.className = "form-grid";

  const codeField = document.createElement("div");
  codeField.className = "form-field";
  const codeLabel = document.createElement("label");
  codeLabel.setAttribute("for", "join-code");
  codeLabel.textContent = "Invite code";
  const codeInput = document.createElement("input");
  codeInput.id = "join-code";
  codeInput.type = "text";
  codeInput.required = true;
  codeInput.autocomplete = "off";
  codeField.append(codeLabel, codeInput);

  const error = document.createElement("div");
  error.className = "error";

  const status = document.createElement("div");
  status.className = "hint";

  const submit = document.createElement("button");
  submit.type = "submit";
  submit.className = "button";
  submit.textContent = "Redeem invite";

  form.append(codeField, error, status, submit);
  panel.append(heading, hint, form);


  main.appendChild(panel);
  container.appendChild(shell);

  if (!redeemInvite) {
    error.textContent = "Invite redeem API unavailable.";
    submit.disabled = true;
    return;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    error.textContent = "";
    status.textContent = "";
    const code = codeInput.value.trim();
    if (!code) {
      error.textContent = "Invite code is required.";
      return;
    }

    submit.disabled = true;
    submit.textContent = "Redeeming...";
    try {
      await redeemInvite({
        baseUrl: config.baseUrl,
        anonKey: config.anonKey,
        accessToken: session.accessToken,
        code,
      });
      status.textContent = "Invite redeemed. Refreshing identity...";
      await hydrateIdentity(config, session);
      navigate("#/cases");
    } catch (requestError) {
      error.textContent = getRpcErrorMessage(requestError);
    } finally {
      submit.disabled = false;
      submit.textContent = "Redeem invite";
    }
  });
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
    "Look up a user by email or user ID to see org membership and Org-not-set state (platform admin only).";
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
      const rows = (results ?? []).map((row) => [
        row.user_id,
        row.email,
        row.org_id,
        row.role,
        row.org_not_set ? "Yes" : "No",
        row.membership_count,
      ]);
      renderResultTable(
        userResults,
        ["User ID", "Email", "Org ID", "Role", "Org not set", "Org count"],
        rows
      );
    } catch (error) {
      userError.textContent = "Platform admin access required or lookup failed.";
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
    "Check member/case counts and anomaly flags for an org (platform admin only).";
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
        orgStatus.textContent = "No org data returned.";
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
          { label: "Visible", value: record.is_visible ? "Yes" : "No" },
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
    "Compare reporting rows to org case counts (platform admin only).";
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
        reportingStatus.textContent = "No reporting data returned.";
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


function renderAdminUsersPage(container, session, config) {
  const { shell, main } = buildShell({
    title: "Admin User Role Management",
    showLogout: true,
    onLogout: () => {
      clearSession();
      navigate("#/login");
    },
  });

  renderIdentityPanel(main, session, config);

  const back = document.createElement("button");
  back.className = "button secondary";
  back.textContent = "Back to Case List";
  back.addEventListener("click", () => navigate("#/cases"));
  main.appendChild(back);

  const panel = document.createElement("section");
  panel.className = "panel";

  const heading = document.createElement("h1");
  heading.textContent = "Assign User Role";

  const hint = document.createElement("p");
  hint.className = "hint";
  hint.textContent = "Owner/Admin only. Single-org mode: assign role within your org.";

  const form = document.createElement("form");
  form.className = "form-grid";

  const orgField = document.createElement("div");
  orgField.className = "form-field";
  const orgLabel = document.createElement("label");
  orgLabel.textContent = "Organization";
  const orgDisplay = document.createElement("input");
  orgDisplay.type = "text";
  orgDisplay.readOnly = true;
  orgDisplay.disabled = true;
  orgField.append(orgLabel, orgDisplay);

  const emailField = document.createElement("div");
  emailField.className = "form-field";
  const emailLabel = document.createElement("label");
  emailLabel.textContent = "User Email Search";
  const emailInput = document.createElement("input");
  emailInput.type = "search";
  emailInput.placeholder = "Search email";
  emailInput.autocomplete = "off";
  const emailResults = document.createElement("select");
  emailResults.required = true;
  emailField.append(emailLabel, emailInput, emailResults);

  const roleField = document.createElement("div");
  roleField.className = "form-field";
  const roleLabel = document.createElement("label");
  roleLabel.textContent = "Role";
  const roleSelect = document.createElement("select");
  roleSelect.required = true;
  roleField.append(roleLabel, roleSelect);

  const error = document.createElement("div");
  error.className = "error";
  const status = document.createElement("div");
  status.className = "hint";

  const submit = document.createElement("button");
  submit.type = "submit";
  submit.className = "button";
  submit.textContent = "Assign role";

  form.append(orgField, emailField, roleField, error, status, submit);
  panel.append(heading, hint, form);
  main.appendChild(panel);
  container.appendChild(shell);

  const userOptions = [];
  let searchTimer = null;

  function setOptions(select, rows, mapFn) {
    select.innerHTML = "";
    rows.forEach((row, index) => {
      const option = document.createElement("option");
      const mapped = mapFn(row);
      option.value = mapped.value;
      option.textContent = mapped.label;
      if (index === 0) {
        option.selected = true;
      }
      select.appendChild(option);
    });
  }

  function showPlaceholder(select, text) {
    select.innerHTML = "";
    const option = document.createElement("option");
    option.value = "";
    option.textContent = text;
    option.selected = true;
    option.disabled = true;
    select.appendChild(option);
  }

  async function loadLookups() {
    if (!listManageableOrgs || !listRoles) {
      error.textContent = "Role management API unavailable.";
      submit.disabled = true;
      return;
    }

    try {
      const [orgRows, roleRows] = await Promise.all([
        listManageableOrgs({
          baseUrl: config.baseUrl,
          anonKey: config.anonKey,
          accessToken: session.accessToken,
        }),
        listRoles({
          baseUrl: config.baseUrl,
          anonKey: config.anonKey,
          accessToken: session.accessToken,
        }),
      ]);

      if (!orgRows?.length) {
        orgDisplay.value = "No manageable org";
        submit.disabled = true;
        return;
      }

      const currentOrgId = session?.membership?.org_id;
      const ownOrg = (orgRows ?? []).find((row) => row.org_id === currentOrgId) ?? null;

      if (!ownOrg) {
        error.textContent = "Current org is not manageable by this account.";
        submit.disabled = true;
        return;
      }

      const orgName = String(ownOrg.org_name ?? "").trim() || "(unnamed org)";
      orgDisplay.value = `${orgName} (${ownOrg.actor_role})`;

      const roles = (roleRows ?? []).filter((row) => ["owner", "admin", "member"].includes(row.role));
      if (!roles.length) {
        showPlaceholder(roleSelect, "No roles");
        submit.disabled = true;
        return;
      }

      setOptions(roleSelect, roles, (row) => ({ value: row.role, label: row.role }));
      showPlaceholder(emailResults, "Type email to search users");
    } catch (lookupError) {
      error.textContent = getRpcErrorMessage(lookupError);
      submit.disabled = true;
    }
  }

  async function runEmailSearch() {
    const query = emailInput.value.trim();
    if (!query) {
      userOptions.splice(0, userOptions.length);
      showPlaceholder(emailResults, "Type email to search users");
      return;
    }
    if (!searchUsersByEmail) {
      error.textContent = "User search API unavailable.";
      return;
    }

    try {
      error.textContent = "";
      const rows = await searchUsersByEmail({
        baseUrl: config.baseUrl,
        anonKey: config.anonKey,
        accessToken: session.accessToken,
        emailQuery: query,
      });
      userOptions.splice(0, userOptions.length, ...(rows ?? []));
      if (!userOptions.length) {
        showPlaceholder(emailResults, "No users found");
        return;
      }
      setOptions(emailResults, userOptions, (row) => {
        const email = String(row.email ?? "").trim() || "(no email)";
        return {
          value: row.user_id,
          label: email,
        };
      });
    } catch (searchError) {
      userOptions.splice(0, userOptions.length);
      showPlaceholder(emailResults, "Search failed");
      error.textContent = getRpcErrorMessage(searchError);
    }
  }

  emailInput.addEventListener("input", () => {
    if (searchTimer) {
      window.clearTimeout(searchTimer);
    }
    searchTimer = window.setTimeout(() => {
      runEmailSearch();
    }, 250);
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    error.textContent = "";
    status.textContent = "";

    if (!assignUserToOrg) {
      error.textContent = "Role assignment API unavailable.";
      return;
    }

    const orgId = session?.membership?.org_id ?? "";
    const userId = emailResults.value;
    const role = roleSelect.value;

    if (!orgId || !userId || !role) {
      error.textContent = "Please select user email and role.";
      return;
    }

    submit.disabled = true;
    submit.textContent = "Assigning...";

    try {
      await assignUserToOrg({
        baseUrl: config.baseUrl,
        anonKey: config.anonKey,
        accessToken: session.accessToken,
        userId,
        orgId,
        role,
      });
      status.textContent = "Success: role assigned.";
    } catch (requestError) {
      error.textContent = getRpcErrorMessage(requestError);
    } finally {
      submit.disabled = false;
      submit.textContent = "Assign role";
    }
  });

  if (!session?.membership?.org_id) {
    status.textContent = "Org not set. Role management is unavailable.";
    submit.disabled = true;
  } else if (!isOwnerOrAdmin(session)) {
    status.textContent = "Access denied.";
    submit.disabled = true;
  } else {
    loadLookups();
  }
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

  const adminActions = document.createElement("div");
  adminActions.className = "actions-inline";

  const adminButton = document.createElement("button");
  adminButton.className = "button secondary";
  adminButton.textContent = "Admin Inspection";
  adminButton.addEventListener("click", () => {
    navigate("#/admin");
  });

  const usersButton = document.createElement("button");
  usersButton.className = "button secondary";
  usersButton.textContent = "Manage Users";
  const canManageUsers = Boolean(session?.membership?.org_id) && isOwnerOrAdmin(session);
  usersButton.disabled = !canManageUsers;
  if (!session?.membership?.org_id) {
    usersButton.title = "Org not set";
  } else if (!isOwnerOrAdmin(session)) {
    usersButton.title = "Owner/Admin only";
  }
  usersButton.addEventListener("click", () => {
    if (!canManageUsers) {
      return;
    }
    navigate("#/admin/users");
  });

  adminActions.append(adminButton, usersButton);

  header.append(titleBlock, adminActions);
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
      ["Case No", "Employee", "Status", "Last working day", "Owner"].forEach((label) => {
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

          const ownerCell = document.createElement("td");
          const ownerButton = document.createElement("button");
          ownerButton.className = "button secondary";
          ownerButton.textContent = "Owner";
          const canAssign = isOwnerOrAdmin(session);
          ownerButton.disabled = !canAssign;
          if (!canAssign) {
            ownerButton.title = "Only org owner/admin can assign reviewer.";
          }
          ownerButton.addEventListener("click", (event) => {
            event.stopPropagation();
            if (!canAssign) {
              return;
            }
            navigate(`#/owner?case_id=${encodeURIComponent(record.id)}`);
          });
          ownerCell.appendChild(ownerButton);

          row.append(caseNo, employee, statusCell, lastDay, ownerCell);
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

function renderOwnerPage(container, session, config) {
  const { shell, main } = buildShell({
    title: "Owner Assign Reviewer",
    showLogout: true,
    onLogout: () => {
      clearSession();
      navigate("#/login");
    },
  });

  renderIdentityPanel(main, session, config);

  const back = document.createElement("button");
  back.className = "button secondary";
  back.textContent = "Back to Case List";
  back.addEventListener("click", () => navigate("#/cases"));
  main.appendChild(back);

  const panel = document.createElement("section");
  panel.className = "panel";

  const heading = document.createElement("h1");
  heading.textContent = "Owner Assign Reviewer";

  const hint = document.createElement("p");
  hint.className = "hint";
  hint.textContent = "Owner/Admin only mutation path.";

  const error = document.createElement("div");
  error.className = "error";

  const status = document.createElement("div");
  status.className = "hint";

  const form = document.createElement("form");
  form.className = "form-grid";

  const caseField = document.createElement("div");
  caseField.className = "form-field";
  const caseLabel = document.createElement("label");
  caseLabel.textContent = "Case ID";
  const caseInput = document.createElement("input");
  caseInput.type = "text";
  caseInput.required = true;
  caseInput.autocomplete = "off";
  caseInput.value = new URLSearchParams(window.location.hash.split("?")[1] ?? "").get("case_id") ?? "";
  caseField.append(caseLabel, caseInput);

  const reviewerField = document.createElement("div");
  reviewerField.className = "form-field";
  const reviewerLabel = document.createElement("label");
  reviewerLabel.textContent = "Reviewer User ID";
  const reviewerInput = document.createElement("input");
  reviewerInput.type = "text";
  reviewerInput.required = true;
  reviewerInput.autocomplete = "off";
  reviewerField.append(reviewerLabel, reviewerInput);

  const submit = document.createElement("button");
  submit.type = "submit";
  submit.className = "button";
  submit.textContent = "Assign reviewer";

  form.append(caseField, reviewerField, error, status, submit);
  panel.append(heading, hint, form);
  main.appendChild(panel);
  container.appendChild(shell);

  if (!isOwnerOrAdmin(session)) {
    status.textContent = "Access denied.";
    submit.disabled = true;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    error.textContent = "";
    status.textContent = "";

    if (!ownerAssignCaseReviewer) {
      error.textContent = "Owner assignment API unavailable.";
      return;
    }

    const caseId = caseInput.value.trim();
    const reviewerUserId = reviewerInput.value.trim();
    if (!caseId || !reviewerUserId) {
      error.textContent = "case_id and reviewer_user_id are required.";
      return;
    }

    submit.disabled = true;
    submit.textContent = "Assigning...";

    try {
      await ownerAssignCaseReviewer({
        baseUrl: config.baseUrl,
        anonKey: config.anonKey,
        accessToken: session.accessToken,
        caseId,
        reviewerUserId,
      });
      status.textContent = "Success: reviewer assigned.";
    } catch (requestError) {
      error.textContent = getRpcErrorMessage(requestError);
    } finally {
      submit.disabled = false;
      submit.textContent = "Assign reviewer";
    }
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
  const route = getHashRoute();

  if (!session && route !== "#/login" && route !== "#/register") {
    navigate("#/login");
    return;
  }

  if (route === "#/login") {
    renderLogin(appRoot);
    return;
  }

  if (route === "#/register") {
    renderRegister(appRoot);
    return;
  }

  if (!session || !session.accessToken) {
    renderLogin(appRoot);
    return;
  }

  const hydratedSession = await hydrateIdentity(config, session);


  if (route === "#/join") {
    renderJoin(appRoot, hydratedSession, config);
    return;
  }



  if (route === "#/cases") {
    renderCaseList(appRoot, hydratedSession, config);
    return;
  }

  if (route === "#/admin") {
    renderAdminInspection(appRoot, hydratedSession, config);
    return;
  }

  if (route === "#/admin/users") {
    renderAdminUsersPage(appRoot, hydratedSession, config);
    return;
  }

  if (route.startsWith("#/owner")) {
    renderOwnerPage(appRoot, hydratedSession, config);
    return;
  }

  if (route.startsWith("#/cases/")) {
    const caseId = route.replace("#/cases/", "");
    renderCaseDetail(appRoot, hydratedSession, config, caseId);
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
