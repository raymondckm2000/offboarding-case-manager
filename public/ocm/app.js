(() => {
const {
  listOffboardingCases,
  listReportingCaseSla,
  listReportingCaseEscalation,
  signInWithPassword,
  getAuthUser,
  ownerAssignCaseReviewer,
} = window.offboardingAccessLayer ?? {};
const { renderCaseDetailPage } = window.offboardingCaseDetail ?? {};
const { renderAuditTimelineSection } = window.offboardingAuditTimeline ?? {};

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

function formatValue(value) {
  if (value === null || value === undefined || value === "") {
    return "—";
  }
  return String(value);
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

  return { email, role, org };
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

function isOwnerOrAdmin(session) {
  const role = String(session?.identity?.role ?? "").toLowerCase();
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
  if (details.includes("reviewer not in org") || details.includes("reviewer must")) {
    return "reviewer not in org.";
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

  const heading = document.createElement("h1");
  heading.textContent = "Case List";

  const note = document.createElement("div");
  note.className = "hint";
  note.textContent = "Read-only view of cases you can access.";

  header.append(heading, note);
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

function renderOperationsDashboard(container, session, config) {
  const { shell, main } = buildShell({
    title: "Operations Dashboard (Read-only)",
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

  const heading = document.createElement("h1");
  heading.textContent = "Operations Dashboard";

  const note = document.createElement("div");
  note.className = "hint";
  note.textContent =
    "Read-only reporting view. Rows are rendered directly from reporting views.";

  const back = document.createElement("button");
  back.className = "button secondary";
  back.textContent = "Back to Case List";
  back.addEventListener("click", () => navigate("#/cases"));

  header.append(heading, note, back);
  panel.appendChild(header);

  const status = document.createElement("div");
  status.className = "hint";
  status.textContent = "Loading reporting views...";
  panel.appendChild(status);

  const table = document.createElement("table");
  table.className = "case-table";
  panel.appendChild(table);

  main.appendChild(panel);
  container.appendChild(shell);

  const slaRequest = listReportingCaseSla({
    baseUrl: config.baseUrl,
    anonKey: config.anonKey,
    accessToken: session.accessToken,
  });
  const escalationRequest = listReportingCaseEscalation({
    baseUrl: config.baseUrl,
    anonKey: config.anonKey,
    accessToken: session.accessToken,
  });

  Promise.allSettled([slaRequest, escalationRequest])
    .then(([slaResult, escalationResult]) => {
      const slaRecords =
        slaResult.status === "fulfilled" ? slaResult.value ?? [] : null;
      const escalationRecords =
        escalationResult.status === "fulfilled"
          ? escalationResult.value ?? []
          : null;

      const escalationByCase = new Map();
      (escalationRecords ?? []).forEach((record) => {
        if (record?.case_id !== undefined && record?.case_id !== null) {
          escalationByCase.set(record.case_id, record);
        }
      });

      let statusMessage = "";
      const hasReportingFailure =
        slaResult.status === "rejected" || escalationResult.status === "rejected";
      if (hasReportingFailure) {
        statusMessage = "Reporting views not yet available (Sprint 18).";
      } else if (slaRecords.length === 0) {
        statusMessage = "No case data returned for this account.";
      }
      status.textContent = statusMessage;

      const thead = document.createElement("thead");
      const headRow = document.createElement("tr");
      [
        "Case ID",
        "Status",
        "SLA breached",
        "Escalation level",
        "Escalation acknowledged",
        "Last escalated at",
        "Last acknowledged at",
      ].forEach((label) => {
        const th = document.createElement("th");
        th.textContent = label;
        headRow.appendChild(th);
      });
      thead.appendChild(headRow);

      const tbody = document.createElement("tbody");
      (slaRecords ?? []).forEach((record) => {
        const row = document.createElement("tr");
        const escalationRecord = escalationByCase.get(record?.case_id) ?? null;

        const columns = [
          record?.case_id,
          record?.status,
          record?.sla_breached,
          escalationRecord?.latest_escalation_level,
          escalationRecord?.is_acknowledged,
          escalationRecord?.latest_escalated_at,
          escalationRecord?.latest_acknowledged_at,
        ];

        columns.forEach((value) => {
          const cell = document.createElement("td");
          cell.textContent = formatValue(value);
          row.appendChild(cell);
        });
        tbody.appendChild(row);
      });

      table.append(thead, tbody);
    })
    .catch(() => {
      status.textContent = "Reporting views not yet available (Sprint 18).";
      table.innerHTML = "";
    });

  const auditPanel = document.createElement("section");
  auditPanel.className = "panel";

  const auditHeading = document.createElement("h2");
  auditHeading.textContent = "Audit Timeline Viewer";

  const auditNote = document.createElement("p");
  auditNote.className = "hint";
  auditNote.textContent =
    "Filter by case ID. Read-only view of audit_logs.";

  const auditForm = document.createElement("form");
  auditForm.className = "form-grid";

  const auditWrapper = document.createElement("div");
  auditWrapper.className = "form-field";

  const auditLabel = document.createElement("label");
  auditLabel.setAttribute("for", "audit-case-id");
  auditLabel.textContent = "Case ID";

  const auditInput = document.createElement("input");
  auditInput.id = "audit-case-id";
  auditInput.type = "text";
  auditInput.autocomplete = "off";
  auditInput.spellcheck = false;

  auditWrapper.append(auditLabel, auditInput);
  auditForm.appendChild(auditWrapper);

  const auditButton = document.createElement("button");
  auditButton.className = "button";
  auditButton.type = "submit";
  auditButton.textContent = "Load audit log";
  auditForm.appendChild(auditButton);

  const auditStatus = document.createElement("div");
  auditStatus.className = "hint";

  const auditContainer = document.createElement("div");

  auditPanel.append(
    auditHeading,
    auditNote,
    auditForm,
    auditStatus,
    auditContainer
  );
  main.appendChild(auditPanel);

  auditForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    auditStatus.textContent = "";
    auditContainer.innerHTML = "";
    if (!renderAuditTimelineSection) {
      auditStatus.textContent = "Audit module unavailable.";
      return;
    }
    const caseId = auditInput.value.trim();
    if (!caseId) {
      auditStatus.textContent = "Enter a case ID to load audit activity.";
      return;
    }
    auditStatus.textContent = "Loading audit activity...";
    await renderAuditTimelineSection({
      container: auditContainer,
      baseUrl: config.baseUrl,
      anonKey: config.anonKey,
      accessToken: session.accessToken,
      caseId,
    });
    auditStatus.textContent = "";
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

  if (hash === "#/dashboard") {
    renderOperationsDashboard(appRoot, session, config);
    return;
  }

  if (hash.startsWith("#/owner")) {
    renderOwnerPage(appRoot, session, config);
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
