# SPRINT PLAN (0–7)

## Sprint 0 — Foundations & Scaffolding
**Goals**
- Establish repository structure and documentation baselines.
- Define global rules, decisions, and SaaS architecture scope.

**Acceptance Criteria**
- Required docs exist and are complete.
- Global rules are explicit and non-negotiable.
- SaaS architecture definition is clear for Sprint 1 DB/RLS work.

**Mandatory Negative Tests**
- Not logged in: access to any protected docs or admin paths is denied.
- Cross-org access: any org-scoped resource rejects other org_id.
- Rule bypass attempt: client-only filtering is rejected by server/RLS.

（中文補充：Sprint 0 需完成文件基礎與規範，並定義完整 SaaS 架構。）

## Sprint 1 — Database & RLS Core
**Goals**
- Define DB schema for core entities with org_id.
- Implement Supabase RLS policies for isolation.

**Acceptance Criteria**
- All tables include org_id.
- RLS enabled with least-privilege policies.
- Evidence storage paths scoped by org_id.

**Mandatory Negative Tests**
- Not logged in: all protected tables reject SELECT/INSERT/UPDATE/DELETE.
- Cross-org access: any org_id mismatch is blocked by RLS.
- Rule bypass attempt: direct API calls cannot change protected fields.

（中文補充：Sprint 1 需完成資料表與 RLS，確保跨 org 存取被阻擋。）

## Sprint 2 — Case Intake & Assignment
**Goals**
- Implement case creation flow with server-side validation.
- Assign requester/handler/approver roles.

**Acceptance Criteria**
- Case creation enforces required fields and org_id.
- Role assignment only by allowed org roles.
- case_no generation is race-condition safe.

**Mandatory Negative Tests**
- Not logged in: case creation is rejected.
- Cross-org access: cannot assign roles across orgs.
- Rule bypass attempt: client cannot set status directly.

（中文補充：Sprint 2 需完成案件建立與角色指派，並保證安全。）

## Sprint 3 — Task & Evidence Workflow
**Goals**
- Implement task tracking and evidence upload flow.
- Enforce phase gating: DATA → ACCESS → ASSET.

**Acceptance Criteria**
- Tasks are org-scoped and immutable for is_required.
- Evidence upload requires proper phase status.
- Access to evidence is org-bound.

**Mandatory Negative Tests**
- Not logged in: evidence upload denied.
- Cross-org access: cannot view or upload evidence across orgs.
- Rule bypass attempt: phase skipping rejected server-side.

（中文補充：Sprint 3 需完成任務與證據流程，並強制階段門檻。）

## Sprint 4 — Approvals & Completion
**Goals**
- Implement approval flow and completion records.
- Enforce strict completion gate.

**Acceptance Criteria**
- Only approver can generate completion records.
- completion_records include snapshot_json.
- Completion gate checks readiness.

**Mandatory Negative Tests**
- Not logged in: approval actions rejected.
- Cross-org access: cannot approve across orgs.
- Rule bypass attempt: non-approver cannot insert completion_records.

（中文補充：Sprint 4 需完成核准與結案流程，且只能由 approver 執行。）

## Sprint 5 — Audit & Reporting
**Goals**
- Provide audit logs and reporting views.
- Ensure read-only access follows RLS.

**Acceptance Criteria**
- Audit logs are org-scoped.
- Reports respect org_id filtering and RLS.
- Evidence references are consistent.

**Mandatory Negative Tests**
- Not logged in: report access denied.
- Cross-org access: cannot view another org’s reports.
- Rule bypass attempt: direct SQL/REST cannot bypass RLS.

（中文補充：Sprint 5 需完成稽核與報表並維持 RLS。）

## Sprint 6 — Hardening & QA
**Goals**
- Security review and negative test hardening.
- Improve resilience and failure handling.

**Acceptance Criteria**
- All critical flows have negative tests documented.
- Server-side validation covers all writes.
- RLS policies reviewed and verified.

**Mandatory Negative Tests**
- Not logged in: all write actions denied.
- Cross-org access: no data leakage under any endpoint.
- Rule bypass attempt: direct API calls cannot change protected fields.

（中文補充：Sprint 6 需完成安全與 QA 強化，負向測試完善。）

## Sprint 7 — Delivery & Closure
**Goals**
- Finalize MVP delivery and completion experience.
- Prepare documentation for production readiness.

**Acceptance Criteria**
- End-to-end flow complete with evidence and approval.
- Completion experience delivered (PDF optional).
- Docs updated for deployment and operations.

**Mandatory Negative Tests**
- Not logged in: completion view denied.
- Cross-org access: completion data isolated by org.
- Rule bypass attempt: cannot finalize without approvals.

**Note**
- Sprint 7 PDF is optional and may be replaced by HTML completion page in MVP.

（中文補充：Sprint 7 PDF 可選，MVP 可用 HTML 完成頁替代。）
