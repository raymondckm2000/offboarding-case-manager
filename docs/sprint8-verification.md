# Sprint 8 Verification Guide (Read-only Case Detail UI)

## A) UI steps

1. Navigate: **Case list → open a case detail**.
2. Confirm the **Case Status** header renders (status, employee, department, position, last working day).
3. Confirm the **Closure Readiness (Read-only)** panel renders and mirrors server state:
   - Shows server status (open/closed/unknown).
   - Shows required task completion counts when tasks load.
4. Confirm the **Completion Summary** view renders with task counts.
5. Confirm the **Read-only Audit Timeline** section is visible and behaves as before.

## B) Read-only enforcement (strict)

- UI provides **no close/reopen/override** actions.
- UI provides **no inline edit/delete** actions.
- All UI data loads use **existing GET requests** only:
  - `GET /rest/v1/tasks` (case task summary)
  - `GET /rest/v1/audit_logs` (audit timeline)

## C) Degraded states (required)

1. Missing `case_id` or `org_id`
   - Expected: readiness + completion panels show **missing identifier** message.
2. Task list fetch failure
   - Expected: readiness + completion panels show **unavailable** message with status code.
3. Zero tasks
   - Expected: completion summary shows **No tasks available**.
