const { listAuditLogs } = require("./access-layer");

const ACTION_LABELS = {
  "case.create": "Case created",
  "case.close": "Case closed",
  "task.create": "Task created",
  "evidence.create": "Evidence created",
};

function formatAction(action) {
  if (!action) {
    return "Unknown action";
  }
  return ACTION_LABELS[action] ?? action;
}

function formatActor(log) {
  return log?.actor_user_id ?? log?.actor ?? log?.actor_id ?? "Unknown actor";
}

function formatTarget(log) {
  const entityType = log?.entity_type ?? "unknown";
  const entityId = log?.entity_id ?? "unknown";
  return `${entityType} (${entityId})`;
}

function formatMetadata(metadata) {
  if (metadata === null || metadata === undefined) {
    return "—";
  }
  if (typeof metadata === "string") {
    return metadata;
  }
  try {
    return JSON.stringify(metadata, null, 2);
  } catch (error) {
    return String(metadata);
  }
}

function buildRow(log) {
  const item = document.createElement("li");
  item.className = "audit-timeline__row";

  const createdAt = document.createElement("div");
  createdAt.className = "audit-timeline__created-at";
  createdAt.textContent = log?.created_at ?? "Unknown time";

  const actor = document.createElement("div");
  actor.className = "audit-timeline__actor";
  actor.textContent = `Actor: ${formatActor(log)}`;

  const action = document.createElement("div");
  action.className = "audit-timeline__action";
  action.textContent = `Action: ${formatAction(log?.action)}`;

  const target = document.createElement("div");
  target.className = "audit-timeline__target";
  target.textContent = `Target: ${formatTarget(log)}`;

  const metadata = document.createElement("pre");
  metadata.className = "audit-timeline__metadata";
  metadata.textContent = `Metadata: ${formatMetadata(log?.metadata)}`;

  item.append(createdAt, actor, action, target, metadata);
  return item;
}

function renderEmptyState(list) {
  const empty = document.createElement("li");
  empty.className = "audit-timeline__empty";
  empty.textContent = "No audit activity found.";
  list.appendChild(empty);
}

function renderErrorState(list, error) {
  const failure = document.createElement("li");
  failure.className = "audit-timeline__error";
  failure.textContent = `Unable to load audit timeline (${error?.status ?? "error"}).`;
  list.appendChild(failure);
}

async function renderAuditTimelineSection({
  container,
  baseUrl,
  anonKey,
  jwt,
  caseId,
}) {
  if (!container) {
    throw new Error("container is required");
  }

  const section = document.createElement("section");
  section.className = "audit-timeline";

  const heading = document.createElement("h2");
  heading.textContent = "Read-only Audit Timeline";
  section.appendChild(heading);

  const list = document.createElement("ul");
  list.className = "audit-timeline__list";
  section.appendChild(list);

  container.appendChild(section);

  try {
    const logs = await listAuditLogs({ baseUrl, anonKey, jwt, caseId });

    if (!logs || logs.length === 0) {
      renderEmptyState(list);
      return section;
    }

    logs.forEach((log) => list.appendChild(buildRow(log)));
    return section;
  } catch (error) {
    renderErrorState(list, error);
    return section;
  }
}

module.exports = {
  ACTION_LABELS,
  formatAction,
  renderAuditTimelineSection,
};
