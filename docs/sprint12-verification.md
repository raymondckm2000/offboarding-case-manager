# Sprint 12 Verification — Case Reopen, Reporting, SLA

> Goal: verify server-side enforcement for Case Reopen, Reporting (read-only aggregation), and SLA violations.

## Pre-req
- Two orgs: OrgA, OrgB
- Two users: UserA (member of OrgA, admin role), UserB (member of OrgB, admin role)
- At least one case in each org
- For OrgA: a case that is `closed` with reviewer assigned and signoff completed

## A) Case Reopen (controlled)

### 0) Closure audit action consistency (source of truth)
- **System actual action name for closure:** `case_closed` (from `close_offboarding_case` RPC audit insert).
- Verify the system is emitting `case_closed`:
  - `GET /rest/v1/audit_logs?entity_type=eq.offboarding_case&entity_id=eq.<CLOSED_CASE_ID>&order=created_at.desc&limit=1`
- **Expected:** latest closure entry shows `action = 'case_closed'`.
- Reporting/throughput/SLA are required to use the **same observable source of truth** for closure events:
  - `reporting_org_case_summary`, `reporting_reviewer_throughput`, `reporting_case_sla` must reflect the same closure event stream visible in `audit_logs`.

### 1) Reopen without permission (must fail)
- As UserA **without admin/reviewer role** (or a different member who is not org admin/reviewer):
  - `POST /rest/v1/rpc/reopen_offboarding_case`
  - payload: `{ "p_case_id": "<CLOSED_CASE_ID>", "p_org_id": "<ORGA_ID>", "p_reason": "Data correction" }`
- **Expected:** 401/403/400 with message `insufficient permissions to reopen case`.

### 2) Reopen with missing reason (must fail)
- As OrgA admin/reviewer:
  - `POST /rest/v1/rpc/reopen_offboarding_case`
  - payload: `{ "p_case_id": "<CLOSED_CASE_ID>", "p_org_id": "<ORGA_ID>", "p_reason": "" }`
- **Expected:** 401/403/400 with message `reopen reason is required`.

### 3) Reopen success (must succeed)
- As OrgA admin/reviewer:
  - `POST /rest/v1/rpc/reopen_offboarding_case`
  - payload: `{ "p_case_id": "<CLOSED_CASE_ID>", "p_org_id": "<ORGA_ID>", "p_reason": "Incorrect exit date" }`
- **Expected:** response row has `status = 'reopened'`.

### 4) Verify audit log appended (no history rewrite)
- `GET /rest/v1/audit_logs?entity_type=eq.offboarding_case&entity_id=eq.<CLOSED_CASE_ID>&order=created_at.asc`
- **Expected:**
  - A new entry with `action = 'case_reopened'`.
  - `metadata.reason` matches the reopen reason.
  - Older closure/audit entries remain unchanged and still present.

## B) Reporting (read-only aggregation)

### 1) OrgA reporting summary (must succeed)
- `GET /rest/v1/reporting_org_case_summary?select=*`
- **Expected:**
  - Only OrgA rows visible to UserA.
  - Contains `open_cases`, `closed_cases`, `reopened_cases`, `avg_hours_to_close`, `reopen_events_count`, `reopened_case_ratio`.

### 2) OrgA reviewer throughput (must succeed)
- `GET /rest/v1/reporting_reviewer_throughput?select=*`
- **Expected:**
  - Only OrgA reviewer rows visible to UserA.
  - `closed_case_count` reflects OrgA closures.

### 3) Cross-org reporting access (must be empty or denied)
- As UserA, attempt to access OrgB data indirectly:
  - `GET /rest/v1/reporting_org_case_summary?org_id=eq.<ORGB_ID>`
- **Expected:** empty result set **or** explicit 401/403 denial.

### 4) Reporting read-only enforcement (must fail)
- Attempt to write:
  - `POST /rest/v1/reporting_org_case_summary` with any payload
- **Expected:** 401/403/405 or error indicating view is read-only / not insertable.

## C) SLA (definition + violation)

> SLA defaults (server-side): time_to_review_days = 5, time_to_close_days = 10

### 0) SLA immediate validation (no waiting required)
- Update OrgA SLA policy to short windows (admin only):
  - `PATCH /rest/v1/sla_policies?org_id=eq.<ORGA_ID>`
  - payload: `{ "time_to_review_days": 1, "time_to_close_days": 1 }`
- Backdate the test case `created_at` via **test-only, controlled SQL** (run by a DB admin in a non-prod environment):
  - Example (psql/SQL editor in test): `update offboarding_cases set created_at = now() - interval '2 days' where id = '<CASE_ID>' and org_id = '<ORGA_ID>';`
  - Ensure this is executed only in test fixtures or isolated QA data.
- **Expected:** `GET /rest/v1/reporting_case_sla?case_id=eq.<CASE_ID>` returns `review_violation = true` and `close_violation = true` immediately.
- **Note:** Production flow does **not** permit modifying `created_at`; this step is for controlled test verification only.

### 1) SLA not violated (must show false)
- Create a new OrgA case and complete reviewer signoff + close within SLA windows.
- `GET /rest/v1/reporting_case_sla?case_id=eq.<CASE_ID>`
- **Expected:** `review_violation = false`, `close_violation = false`.

### 2) SLA violated (must show true)
- Create a new OrgA case and wait past SLA windows (or backdate `created_at` in test data).
- `GET /rest/v1/reporting_case_sla?case_id=eq.<CASE_ID>`
- **Expected:** `review_violation = true` and/or `close_violation = true` (depending on which deadline elapsed).

### 3) Reopen effect on SLA (must be verifiable)
- Reopen a closed case:
  - `POST /rest/v1/rpc/reopen_offboarding_case` (as admin/reviewer)
- `GET /rest/v1/reporting_case_sla?case_id=eq.<CASE_ID>`
- **Expected:** SLA is evaluated against original `created_at` (Option A: no reset). If deadlines are already past, violation remains `true`.
