const { renderAuditTimelineSection } = require("./audit-timeline");
const { closeOffboardingCase, listTasks } = require("./access-layer");

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

function summarizeRequiredTasks(tasks = []) {
  const required = tasks.filter((task) => task.is_required);
  const incomplete = required.filter((task) => task.status !== "complete");

  return {
    requiredCount: required.length,
    incompleteCount: incomplete.length,
  };
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

  const statusSection = document.createElement("section");
  statusSection.className = "case-detail__status";

  const statusValue = document.createElement("div");
  statusValue.textContent = `Status: ${caseRecord?.status ?? "unknown"}`;

  const eligibility = document.createElement("div");
  eligibility.textContent = "Checking required tasks...";

  const message = document.createElement("div");
  message.className = "case-detail__close-message";

  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.textContent = "Close Case";

  let closeDisabledByEligibility = false;
  const hasCaseId = Boolean(caseRecord?.id);
  if (!hasCaseId || caseRecord?.status === "closed") {
    closeButton.disabled = true;
  }

  statusSection.append(statusValue, eligibility, closeButton, message);
  container.appendChild(statusSection);

  if (hasCaseId && caseRecord?.org_id) {
    try {
      const tasks = await listTasks({
        baseUrl,
        anonKey,
        jwt,
        orgId: caseRecord.org_id,
        caseId: caseRecord.id,
      });
      const { requiredCount, incompleteCount } = summarizeRequiredTasks(tasks);

      if (requiredCount === 0) {
        eligibility.textContent = "Required tasks: none.";
      } else if (incompleteCount > 0) {
        eligibility.textContent = `Required tasks incomplete (${incompleteCount}/${requiredCount}).`;
        closeDisabledByEligibility = true;
      } else {
        eligibility.textContent = "All required tasks complete.";
      }
    } catch (error) {
      eligibility.textContent = `Required task status unavailable (${error?.status ?? "error"}).`;
    }
  } else if (!caseRecord?.org_id) {
    eligibility.textContent = "Required task status unavailable (missing org).";
  }

  if (closeDisabledByEligibility || caseRecord?.status === "closed") {
    closeButton.disabled = true;
  }

  const auditContainer = document.createElement("div");
  container.appendChild(auditContainer);

  async function refreshAuditTimeline() {
    auditContainer.innerHTML = "";
    await renderAuditTimelineSection({
      container: auditContainer,
      baseUrl,
      anonKey,
      jwt,
      caseId: caseRecord?.id,
    });
  }

  closeButton.addEventListener("click", async () => {
    message.textContent = "Closing case...";
    closeButton.disabled = true;

    try {
      const updated = await closeOffboardingCase({
        baseUrl,
        anonKey,
        jwt,
        caseId: caseRecord?.id,
      });

      const updatedCase = Array.isArray(updated) ? updated[0] : updated;
      const newStatus = updatedCase?.status ?? "closed";

      caseRecord.status = newStatus;
      statusValue.textContent = `Status: ${newStatus}`;
      eligibility.textContent = "Case closed.";
      message.textContent = "Case closed successfully.";
      closeButton.disabled = true;

      await refreshAuditTimeline();
    } catch (error) {
      message.textContent = `Unable to close case (${error?.status ?? "error"}).`;
      closeButton.disabled = closeDisabledByEligibility || caseRecord?.status === "closed";
    }
  });

  await refreshAuditTimeline();
}

module.exports = {
  renderCaseDetailPage,
};
