# Sprint 11 Verification — Case Closure & Responsibility Finalization

> Goal: verify closed cases are immutable and closure is reviewer/admin-only, enforced server-side.

## Pre-req
- You have a case in `ready_to_close` status with:
  - reviewer assigned (`reviewer_user_id` not null)
  - at least one reviewer_signoff for the case
  - all required tasks complete

## 1) Attempt close without reviewer sign-off (must fail)
- Remove reviewer signoff (use a case without signoff), then call:
  - `POST /rest/v1/rpc/close_offboarding_case`
  - payload: `{ "p_case_id": "<CASE_ID>", "p_org_id": "<ORG_ID>" }`
- Expected: 401/403/400 and message `case requires reviewer signoff`.

## 2) Close case as admin/reviewer (must succeed)
- Call:
  - `POST /rest/v1/rpc/close_offboarding_case`
  - payload: `{ "p_case_id": "<CASE_ID>", "p_org_id": "<ORG_ID>" }`
- Expected: response row has `status = 'closed'`.

## 3) Verify audit log for closure
- `GET /rest/v1/audit_logs?entity_type=eq.offboarding_case&entity_id=eq.<CASE_ID>`
- Expected: latest entry includes:
  - `action = 'case_closed'`
  - `actor_user_id` set
  - `created_at` timestamp
  - metadata includes `closed_at`

## 4) Server-side immutability checks (must all fail)
> All of these must fail even if called directly via API.

- PATCH case metadata:
  - `PATCH /rest/v1/offboarding_cases?id=eq.<CASE_ID>`
  - payload: `{ "dept": "Post-close" }`
  - Expected: 401/403/400 with message indicating closed case immutability.

- Change reviewer assignment:
  - `PATCH /rest/v1/offboarding_cases?id=eq.<CASE_ID>`
  - payload: `{ "reviewer_user_id": "<OTHER_REVIEWER_ID>" }`
  - Expected: 401/403/400 with message indicating closed case immutability.

- Insert task:
  - `POST /rest/v1/tasks`
  - payload: `{ "case_id": "<CASE_ID>", "org_id": "<ORG_ID>", "title": "Post-close", "is_required": false }`
  - Expected: 401/403/400 with message indicating closed case immutability.

- Insert evidence:
  - `POST /rest/v1/evidence`
  - payload: `{ "task_id": "<TASK_ID>", "org_id": "<ORG_ID>", "note": "Post-close" }`
  - Expected: 401/403/400 with message indicating closed case immutability.

## 5) Read-only allowed
- `GET /rest/v1/offboarding_cases?id=eq.<CASE_ID>`
- `GET /rest/v1/tasks?case_id=eq.<CASE_ID>`
- `GET /rest/v1/evidence?org_id=eq.<ORG_ID>`
- `GET /rest/v1/audit_logs?entity_type=eq.offboarding_case&entity_id=eq.<CASE_ID>`
- Expected: all GET requests succeed.
