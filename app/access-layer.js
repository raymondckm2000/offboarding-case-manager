const DEFAULT_TIMEOUT_MS = 10000;

function buildUrl(baseUrl, path, query = {}) {
  const url = new URL(path, baseUrl);
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, value);
    }
  });
  return url.toString();
}

async function request({
  baseUrl,
  anonKey,
  jwt,
  path,
  method,
  body,
  query,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}) {
  if (!baseUrl) {
    throw new Error("baseUrl is required");
  }
  if (!anonKey) {
    throw new Error("anonKey is required");
  }
  if (!jwt) {
    throw new Error("jwt is required");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(buildUrl(baseUrl, path, query), {
      method,
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${jwt}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    const text = await response.text();
    const payload = text ? JSON.parse(text) : null;

    if (!response.ok) {
      const error = new Error("Supabase request failed");
      error.status = response.status;
      error.payload = payload;
      throw error;
    }

    return payload;
  } finally {
    clearTimeout(timeout);
  }
}

function listOffboardingCases({ baseUrl, anonKey, jwt, orgId }) {
  return request({
    baseUrl,
    anonKey,
    jwt,
    path: "/rest/v1/offboarding_cases",
    method: "GET",
    query: {
      select: "*",
      org_id: orgId ? `eq.${orgId}` : undefined,
    },
  });
}

function createOffboardingCase({
  baseUrl,
  anonKey,
  jwt,
  orgId,
  createdBy,
  employeeName,
  status = "open",
  caseNo,
  dept,
  position,
  lastWorkingDay,
}) {
  return request({
    baseUrl,
    anonKey,
    jwt,
    path: "/rest/v1/offboarding_cases",
    method: "POST",
    body: {
      org_id: orgId,
      created_by: createdBy,
      employee_name: employeeName,
      status,
      case_no: caseNo,
      dept,
      position,
      last_working_day: lastWorkingDay,
    },
  });
}

function listTasks({ baseUrl, anonKey, jwt, orgId, caseId }) {
  return request({
    baseUrl,
    anonKey,
    jwt,
    path: "/rest/v1/tasks",
    method: "GET",
    query: {
      select: "*",
      org_id: orgId ? `eq.${orgId}` : undefined,
      case_id: caseId ? `eq.${caseId}` : undefined,
    },
  });
}

function createTask({
  baseUrl,
  anonKey,
  jwt,
  orgId,
  createdBy,
  caseId,
  title,
  status = "open",
  isRequired = false,
}) {
  return request({
    baseUrl,
    anonKey,
    jwt,
    path: "/rest/v1/tasks",
    method: "POST",
    body: {
      org_id: orgId,
      created_by: createdBy,
      case_id: caseId,
      title,
      status,
      is_required: isRequired,
    },
  });
}

function listEvidence({ baseUrl, anonKey, jwt, orgId, taskId }) {
  return request({
    baseUrl,
    anonKey,
    jwt,
    path: "/rest/v1/evidence",
    method: "GET",
    query: {
      select: "*",
      org_id: orgId ? `eq.${orgId}` : undefined,
      task_id: taskId ? `eq.${taskId}` : undefined,
    },
  });
}

function listAuditLogs({ baseUrl, anonKey, jwt, caseId }) {
  if (!caseId) {
    throw new Error("caseId is required");
  }

  return request({
    baseUrl,
    anonKey,
    jwt,
    path: "/rest/v1/audit_logs",
    method: "GET",
    query: {
      select: "*",
      case_id: `eq.${caseId}`,
      order: "created_at.desc",
    },
  });
}

function closeOffboardingCase({ baseUrl, anonKey, jwt, caseId }) {
  if (!caseId) {
    throw new Error("caseId is required");
  }

  return request({
    baseUrl,
    anonKey,
    jwt,
    path: "/rest/v1/offboarding_cases",
    method: "PATCH",
    query: {
      id: `eq.${caseId}`,
    },
    body: {
      status: "closed",
    },
  });
}

function createEvidence({
  baseUrl,
  anonKey,
  jwt,
  orgId,
  createdBy,
  taskId,
  note,
}) {
  return request({
    baseUrl,
    anonKey,
    jwt,
    path: "/rest/v1/evidence",
    method: "POST",
    body: {
      org_id: orgId,
      created_by: createdBy,
      task_id: taskId,
      note,
    },
  });
}

module.exports = {
  createOffboardingCase,
  listOffboardingCases,
  createTask,
  listTasks,
  closeOffboardingCase,
  createEvidence,
  listEvidence,
  listAuditLogs,
};
