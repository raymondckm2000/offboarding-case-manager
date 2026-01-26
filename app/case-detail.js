const { renderAuditTimelineSection } = require("./audit-timeline");

function renderCaseHeader(container, caseRecord) {
  const header = document.createElement("header");
  header.className = "case-detail__header";

  const title = document.createElement("h1");
  title.textContent = "Case Detail";
  header.appendChild(title);

  const caseId = document.createElement("div");
  caseId.textContent = `Case ID: ${caseRecord?.id ?? "Unknown"}`;
  header.appendChild(caseId);

  const caseNo = document.createElement("div");
  caseNo.textContent = `Case No: ${caseRecord?.case_no ?? "Unknown"}`;
  header.appendChild(caseNo);

  container.appendChild(header);
}

async function renderCaseDetailPage({
  container,
  caseRecord,
  baseUrl,
  anonKey,
  jwt,
}) {
  if (!container) {
    throw new Error("container is required");
  }

  renderCaseHeader(container, caseRecord);

  await renderAuditTimelineSection({
    container,
    baseUrl,
    anonKey,
    jwt,
    caseId: caseRecord?.id,
  });
}

module.exports = {
  renderCaseDetailPage,
};
