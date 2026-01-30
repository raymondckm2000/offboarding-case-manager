const { listOffboardingCases } = window.offboardingAccessLayer ?? {};
const { renderCaseDetailPage } = window.offboardingCaseDetail ?? {};

const STORAGE_KEY = "ocm.auth";

function loadAuth() {
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (!stored) {
    return null;
  }
  try {
    return JSON.parse(stored);
  } catch (error) {
    return null;
  }
}

function saveAuth(auth) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(auth));
}

function clearAuth() {
  window.localStorage.removeItem(STORAGE_KEY);
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
    "Enter your Supabase credentials. This app is read-only and uses GET requests.";

  const form = document.createElement("form");
  form.className = "form-grid";

  const fields = [
    { id: "baseUrl", label: "Supabase URL", type: "text" },
    { id: "anonKey", label: "Anon Key", type: "text" },
    { id: "jwt", label: "JWT (Bearer Token)", type: "password" },
    { id: "orgId", label: "Org ID (optional)", type: "text" },
  ];

  const stored = loadAuth() ?? {};
  const inputs = {};

  fields.forEach((field) => {
    const wrapper = document.createElement("div");
    wrapper.className = "form-field";

    const label = document.createElement("label");
    label.setAttribute("for", field.id);
    label.textContent = field.label;

    const input = document.createElement("input");
    input.id = field.id;
    input.type = field.type;
    input.required = field.id !== "orgId";
    input.value = stored[field.id] ?? "";

    inputs[field.id] = input;
    wrapper.append(label, input);
    form.appendChild(wrapper);
  });

  const error = document.createElement("div");
  error.className = "error";

  const submit = document.createElement("button");
  submit.className = "button";
  submit.type = "submit";
  submit.textContent = "Log in";

  form.append(error, submit);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    error.textContent = "";
    submit.disabled = true;
    submit.textContent = "Signing in...";

    const auth = {
      baseUrl: inputs.baseUrl.value.trim(),
      anonKey: inputs.anonKey.value.trim(),
      jwt: inputs.jwt.value.trim(),
      orgId: inputs.orgId.value.trim(),
    };

    try {
      if (!listOffboardingCases) {
        throw new Error("Access layer not available");
      }
      await listOffboardingCases({
        baseUrl: auth.baseUrl,
        anonKey: auth.anonKey,
        jwt: auth.jwt,
        orgId: auth.orgId || undefined,
        limit: 1,
      });
      saveAuth(auth);
      navigate("#/cases");
    } catch (err) {
      error.textContent =
        "Unable to authenticate. Please verify credentials and access.";
    } finally {
      submit.disabled = false;
      submit.textContent = "Log in";
    }
  });

  panel.append(heading, hint, form);
  main.appendChild(panel);
  container.appendChild(shell);
}

function renderCaseList(container, auth) {
  const { shell, main } = buildShell({
    title: "Case List",
    showLogout: true,
    onLogout: () => {
      clearAuth();
      navigate("#/login");
    },
  });

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
    baseUrl: auth.baseUrl,
    anonKey: auth.anonKey,
    jwt: auth.jwt,
    orgId: auth.orgId || undefined,
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
        status.textContent = "No cases available for this account.";
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
          pill.textContent = record.status ?? "unknown";
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

function renderCaseDetail(container, auth, caseId) {
  const { shell, main } = buildShell({
    title: "Case Detail",
    showLogout: true,
    onLogout: () => {
      clearAuth();
      navigate("#/login");
    },
  });

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
    baseUrl: auth.baseUrl,
    anonKey: auth.anonKey,
    jwt: auth.jwt,
    orgId: auth.orgId || undefined,
    caseId,
    limit: 1,
  })
    .then(async (records = []) => {
      panel.innerHTML = "";
      const record = records?.[0];
      if (!record) {
        panel.textContent = "Case not found or access denied.";
        return;
      }
      await renderCaseDetailPage({
        container: panel,
        caseRecord: record,
        baseUrl: auth.baseUrl,
        anonKey: auth.anonKey,
        jwt: auth.jwt,
      });
    })
    .catch((error) => {
      panel.textContent =
        "Unable to load case detail. Please check credentials.";
    });
}

function renderRoute() {
  const appRoot = document.getElementById("app");
  if (!appRoot) {
    return;
  }
  appRoot.innerHTML = "";

  const auth = loadAuth();
  const hash = window.location.hash || "#/login";

  if (!auth && hash !== "#/login") {
    navigate("#/login");
    return;
  }

  if (hash === "#/login") {
    renderLogin(appRoot);
    return;
  }

  if (!auth) {
    renderLogin(appRoot);
    return;
  }

  if (hash === "#/cases") {
    renderCaseList(appRoot, auth);
    return;
  }

  if (hash.startsWith("#/cases/")) {
    const caseId = hash.replace("#/cases/", "");
    renderCaseDetail(appRoot, auth, caseId);
    return;
  }

  navigate(auth ? "#/cases" : "#/login");
}

window.addEventListener("hashchange", renderRoute);
window.addEventListener("DOMContentLoaded", renderRoute);
