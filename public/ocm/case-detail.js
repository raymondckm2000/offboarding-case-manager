(() => {
  const auditTimeline =
    typeof require === "function"
      ? require("./audit-timeline")
      : window.offboardingAuditTimeline;
  const accessLayer =
    typeof require === "function"
      ? require("./access-layer")
      : window.offboardingAccessLayer;
  const { renderAuditTimelineSection } = auditTimeline;
  const {
    listTasks,
    listOffboardingCases,
    transitionOffboardingCaseStatus,
  } = accessLayer;

const STATUS_TRANSITIONS = {
  draft: [{ label: "Submit", toStatus: "submitted" }],
  submitted: [{ label: "Move to Under Review", toStatus: "under_review" }],
  under_review: [
    { label: "Approve", toStatus: "approved" },
    { label: "Reject", toStatus: "rejected" },
  ],
  rejected: [{ label: "Reopen", toStatus: "draft" }],
  approved: [{ label: "Close", toStatus: "closed" }],
  closed: [],
};

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

function formatCaseStatus(status) {
  const normalized = (status ?? "").toLowerCase();
  if (!normalized) {
    return "unknown";
  }
  return normalized
    .split("_")
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(" ");
}

function renderStatusHeader(container, caseRecord) {
  const section = document.createElement("section");
  section.className = "case-detail__status-header";

  const heading = document.createElement("h2");
  heading.textContent = "Case Status";
  section.appendChild(heading);

  const fields = document.createElement("div");
  fields.className = "case-detail__status-fields";

  const fieldItems = [
    ["Status", formatCaseStatus(caseRecord?.status)],
    ["Employee", caseRecord?.employee_name ?? "Unknown"],
    ["Department", caseRecord?.dept ?? "Unknown"],
    ["Position", caseRecord?.position ?? "Unknown"],
    ["Last Working Day", caseRecord?.last_working_day ?? "Unknown"],
  ];

  fieldItems.forEach(([label, value]) => {
    const item = document.createElement("div");
    item.className = "case-detail__status-field";

    const fieldLabel = document.createElement("div");
    fieldLabel.className = "case-detail__status-label";
    fieldLabel.textContent = label;

    const fieldValue = document.createElement("div");
    fieldValue.className = "case-detail__status-value";
    fieldValue.textContent = value;

    item.append(fieldLabel, fieldValue);
    fields.appendChild(item);
  });

  section.appendChild(fields);
  container.appendChild(section);
}

function summarizeTasks(tasks = []) {
  const required = tasks.filter((task) => task.is_required);
  const requiredComplete = required.filter(
    (task) => task.status === "complete"
  );
  const completed = tasks.filter((task) => task.status === "complete");

  return {
    totalCount: tasks.length,
    completedCount: completed.length,
    requiredCount: required.length,
    requiredCompleteCount: requiredComplete.length,
    requiredIncompleteCount: required.length - requiredComplete.length,
    optionalCount: tasks.length - required.length,
    optionalCompleteCount:
      completed.length - requiredComplete.length,
  };
}

function renderClosureReadinessPanel(container) {
  const section = document.createElement("section");
  section.className = "case-detail__readiness";

  const heading = document.createElement("h2");
  heading.textContent = "Closure Readiness (Read-only)";

  const statusLine = document.createElement("div");
  statusLine.className = "case-detail__readiness-status";
  statusLine.textContent = "Waiting for task data...";

  const details = document.createElement("div");
  details.className = "case-detail__readiness-details";
  details.textContent = "Server readiness will be mirrored when data loads.";

  section.append(heading, statusLine, details);
  container.appendChild(section);

  return { statusLine, details };
}

function renderCompletionSummary(container) {
  const section = document.createElement("section");
  section.className = "case-detail__completion-summary";

  const heading = document.createElement("h2");
  heading.textContent = "Completion Summary";

  const summary = document.createElement("div");
  summary.className = "case-detail__completion-body";
  summary.textContent = "Waiting for task data...";

  section.append(heading, summary);
  container.appendChild(section);

  return summary;
}

async function renderCaseDetailPage({
  container,
  caseRecord,
  baseUrl,
  anonKey,
  accessToken,
  onCaseTransition,
}) {
  if (!container) {
    throw new Error("container is required");
  }

  let activeCase = caseRecord;

  renderCaseHeader(container, activeCase);
  renderStatusHeader(container, activeCase);

  const lifecycleSection = document.createElement("section");
  lifecycleSection.className = "case-detail__status-header";

  const lifecycleHeading = document.createElement("h2");
  lifecycleHeading.textContent = "Lifecycle Actions";
  lifecycleSection.appendChild(lifecycleHeading);

  const lifecycleError = document.createElement("div");
  lifecycleError.className = "error";
  lifecycleSection.appendChild(lifecycleError);

  const lifecycleStatus = document.createElement("div");
  lifecycleStatus.className = "hint";
  lifecycleSection.appendChild(lifecycleStatus);

  const lifecycleActions = document.createElement("div");
  lifecycleActions.className = "actions-inline";
  lifecycleSection.appendChild(lifecycleActions);

  container.appendChild(lifecycleSection);

  const readinessPanel = renderClosureReadinessPanel(container);
  const completionSummary = renderCompletionSummary(container);

  const hasCaseId = Boolean(activeCase?.id);
  const hasOrgId = Boolean(activeCase?.org_id);

  if (hasCaseId && hasOrgId) {
    try {
      const tasks = await listTasks({
        baseUrl,
        anonKey,
        accessToken,
        orgId: activeCase.org_id,
        caseId: activeCase.id,
      });
      const summary = summarizeTasks(tasks ?? []);

      if (summary.requiredCount === 0) {
        readinessPanel.statusLine.textContent = "No required tasks detected.";
      } else if (summary.requiredIncompleteCount > 0) {
        readinessPanel.statusLine.textContent = `Required tasks incomplete (${summary.requiredIncompleteCount}/${summary.requiredCount}).`;
      } else {
        readinessPanel.statusLine.textContent = "All required tasks complete.";
      }

      if (activeCase?.status === "closed") {
        readinessPanel.details.textContent =
          "Read-only / Case closed.";
      } else {
        readinessPanel.details.textContent = `Server status: ${formatCaseStatus(activeCase?.status)} (read-only).`;
      }

      if (summary.totalCount === 0) {
        completionSummary.textContent = "No tasks available for this case.";
      } else {
        completionSummary.textContent =
          `Tasks complete: ${summary.completedCount}/${summary.totalCount}. ` +
          `Required complete: ${summary.requiredCompleteCount}/${summary.requiredCount}. ` +
          `Optional complete: ${summary.optionalCompleteCount}/${summary.optionalCount}.`;
      }
    } catch (error) {
      readinessPanel.statusLine.textContent =
        `Closure readiness unavailable (${error?.status ?? "error"}).`;
      readinessPanel.details.textContent =
        "Server state could not be mirrored due to task load failure.";
      completionSummary.textContent =
        `Completion summary unavailable (${error?.status ?? "error"}).`;
    }
  } else {
    const missing = hasCaseId ? "org" : "case";
    readinessPanel.statusLine.textContent =
      `Closure readiness unavailable (missing ${missing} identifier).`;
    readinessPanel.details.textContent =
      "Server state cannot be mirrored without identifiers.";
    completionSummary.textContent =
      `Completion summary unavailable (missing ${missing} identifier).`;
  }

  const auditContainer = document.createElement("div");
  container.appendChild(auditContainer);

  async function refreshAuditTimeline() {
    auditContainer.innerHTML = "";
    await renderAuditTimelineSection({
      container: auditContainer,
      baseUrl,
      anonKey,
      accessToken,
      caseId: activeCase?.id,
    });
  }

  function renderLifecycleActions() {
    lifecycleActions.innerHTML = "";
    lifecycleError.textContent = "";
    lifecycleStatus.textContent = "";

    const normalizedStatus = String(activeCase?.status ?? "").toLowerCase();
    const actions = STATUS_TRANSITIONS[normalizedStatus] ?? [];

    if (actions.length === 0) {
      lifecycleStatus.textContent = "No lifecycle actions available.";
      return;
    }

    actions.forEach((action) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "button";
      button.textContent = action.label;
      button.addEventListener("click", async () => {
        lifecycleError.textContent = "";
        lifecycleStatus.textContent = "Updating case status...";
        lifecycleActions.querySelectorAll("button").forEach((item) => {
          item.disabled = true;
        });

        try {
          await transitionOffboardingCaseStatus({
            baseUrl,
            anonKey,
            accessToken,
            caseId: activeCase?.id,
            toStatus: action.toStatus,
          });
          const refreshed = await listOffboardingCases({
            baseUrl,
            anonKey,
            accessToken,
            caseId: activeCase?.id,
            limit: 1,
          });
          activeCase = refreshed?.[0] ?? activeCase;
          if (typeof onCaseTransition === "function") {
            await onCaseTransition(activeCase);
          }
          container.innerHTML = "";
          await renderCaseDetailPage({
            container,
            caseRecord: activeCase,
            baseUrl,
            anonKey,
            accessToken,
            onCaseTransition,
          });
        } catch (error) {
          const statusCode = error?.status ? `HTTP ${error.status}` : "HTTP error";
          const message =
            error?.payload?.message ??
            error?.payload?.error_description ??
            error?.payload?.error ??
            error?.message ??
            "Unknown error";
          lifecycleError.textContent = `${statusCode}: ${message}`;
          lifecycleStatus.textContent = "";
          lifecycleActions.querySelectorAll("button").forEach((item) => {
            item.disabled = false;
          });
        }
      });
      lifecycleActions.appendChild(button);
    });
  }

  renderLifecycleActions();

  await refreshAuditTimeline();
}

const caseDetail = {
  renderCaseDetailPage,
};

  if (typeof module !== "undefined" && module.exports) {
    module.exports = caseDetail;
  }

  if (typeof window !== "undefined") {
    window.offboardingCaseDetail = caseDetail;
  }
})();
