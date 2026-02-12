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
  accessToken,
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
  if (!accessToken) {
    throw new Error("accessToken is required");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(buildUrl(baseUrl, path, query), {
      method,
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${accessToken}`,
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

async function authRequest({
  baseUrl,
  anonKey,
  accessToken,
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

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const headers = {
      apikey: anonKey,
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken ?? anonKey}`,
    };

    const response = await fetch(buildUrl(baseUrl, path, query), {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    const text = await response.text();
    const payload = text ? JSON.parse(text) : null;

    if (!response.ok) {
      const error = new Error("Supabase auth request failed");
      error.status = response.status;
      error.payload = payload;
      throw error;
    }

    return payload;
  } finally {
    clearTimeout(timeout);
  }
}

function signInWithPassword({ baseUrl, anonKey, email, password }) {
  if (!email) {
    throw new Error("email is required");
  }
  if (!password) {
    throw new Error("password is required");
  }

  return authRequest({
    baseUrl,
    anonKey,
    path: "/auth/v1/token",
    method: "POST",
    query: {
      grant_type: "password",
    },
    body: {
      email,
      password,
    },
  });
}

function getAuthUser({ baseUrl, anonKey, accessToken }) {
  if (!accessToken) {
    throw new Error("accessToken is required");
  }

  return authRequest({
    baseUrl,
    anonKey,
    accessToken,
    path: "/auth/v1/user",
    method: "GET",
  });
}

function listOffboardingCases({
  baseUrl,
  anonKey,
  accessToken,
  orgId,
  caseId,
  limit,
}) {
  return request({
    baseUrl,
    anonKey,
    accessToken,
    path: "/rest/v1/offboarding_cases",
    method: "GET",
    query: {
      select: "*",
      org_id: orgId ? `eq.${orgId}` : undefined,
      id: caseId ? `eq.${caseId}` : undefined,
      limit: limit ?? undefined,
    },
  });
}

function listTasks({ baseUrl, anonKey, accessToken, orgId, caseId }) {
  return request({
    baseUrl,
    anonKey,
    accessToken,
    path: "/rest/v1/tasks",
    method: "GET",
    query: {
      select: "*",
      org_id: orgId ? `eq.${orgId}` : undefined,
      case_id: caseId ? `eq.${caseId}` : undefined,
    },
  });
}

function listEvidence({ baseUrl, anonKey, accessToken, orgId, taskId }) {
  return request({
    baseUrl,
    anonKey,
    accessToken,
    path: "/rest/v1/evidence",
    method: "GET",
    query: {
      select: "*",
      org_id: orgId ? `eq.${orgId}` : undefined,
      task_id: taskId ? `eq.${taskId}` : undefined,
    },
  });
}

function listAuditLogs({ baseUrl, anonKey, accessToken, caseId }) {
  if (!caseId) {
    throw new Error("caseId is required");
  }

  return request({
    baseUrl,
    anonKey,
    accessToken,
    path: "/rest/v1/audit_logs",
    method: "GET",
    query: {
      select: "*",
      case_id: `eq.${caseId}`,
      order: "created_at.desc",
    },
  });
}

function callRpc({ baseUrl, anonKey, accessToken, functionName, body }) {
  return request({
    baseUrl,
    anonKey,
    accessToken,
    path: `/rest/v1/rpc/${functionName}`,
    method: "POST",
    body,
  });
}

function adminInspectUser({ baseUrl, anonKey, accessToken, email, userId }) {
  return callRpc({
    baseUrl,
    anonKey,
    accessToken,
    functionName: "admin_inspect_user",
    body: {
      p_email: email ?? null,
      p_user_id: userId ?? null,
    },
  });
}

function adminInspectOrg({ baseUrl, anonKey, accessToken, orgId }) {
  return callRpc({
    baseUrl,
    anonKey,
    accessToken,
    functionName: "admin_inspect_org",
    body: {
      p_org_id: orgId ?? null,
    },
  });
}

function adminAccessCheck({ baseUrl, anonKey, accessToken, userId, caseId }) {
  return callRpc({
    baseUrl,
    anonKey,
    accessToken,
    functionName: "admin_access_check",
    body: {
      p_user_id: userId ?? null,
      p_case_id: caseId ?? null,
    },
  });
}

function adminReportingSanity({ baseUrl, anonKey, accessToken, orgId }) {
  return callRpc({
    baseUrl,
    anonKey,
    accessToken,
    functionName: "admin_reporting_sanity",
    body: {
      p_org_id: orgId ?? null,
    },
  });
}

function ownerAssignCaseReviewer({
  baseUrl,
  anonKey,
  accessToken,
  caseId,
  reviewerUserId,
}) {
  return callRpc({
    baseUrl,
    anonKey,
    accessToken,
    functionName: "owner_assign_case_reviewer",
    body: {
      p_case_id: caseId ?? null,
      p_reviewer_user_id: reviewerUserId ?? null,
    },
  });
}

function listManageableOrgs({ baseUrl, anonKey, accessToken }) {
  return callRpc({
    baseUrl,
    anonKey,
    accessToken,
    functionName: "list_manageable_orgs",
    body: {},
  });
}

function searchUsersByEmail({ baseUrl, anonKey, accessToken, emailQuery }) {
  return callRpc({
    baseUrl,
    anonKey,
    accessToken,
    functionName: "search_users_by_email",
    body: {
      p_email_query: emailQuery ?? null,
    },
  });
}

function listRoles({ baseUrl, anonKey, accessToken }) {
  return callRpc({
    baseUrl,
    anonKey,
    accessToken,
    functionName: "list_roles",
    body: {},
  });
}

function assignUserToOrg({ baseUrl, anonKey, accessToken, userId, orgId, role }) {
  return callRpc({
    baseUrl,
    anonKey,
    accessToken,
    functionName: "assign_user_to_org",
    body: {
      p_user_id: userId ?? null,
      p_org_id: orgId ?? null,
      p_role: role ?? null,
    },
  });
}

const accessLayer = {
  listOffboardingCases,
  listTasks,
  listEvidence,
  listAuditLogs,
  adminInspectUser,
  adminInspectOrg,
  adminAccessCheck,
  adminReportingSanity,
  ownerAssignCaseReviewer,
  listManageableOrgs,
  searchUsersByEmail,
  listRoles,
  assignUserToOrg,
  signInWithPassword,
  getAuthUser,
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = accessLayer;
}

if (typeof window !== "undefined") {
  window.offboardingAccessLayer = accessLayer;
}
