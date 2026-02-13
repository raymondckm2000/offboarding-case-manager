# Sprint 29 Verification — Case Lifecycle Governance

## Scope covered
- DB-side lifecycle state machine for `offboarding_cases.status`.
- Server-side only status transitions via `transition_offboarding_case_status(case_id, to_status)`.
- Direct status update blocked (trigger enforcement).
- Transition authorization enforced in DB layer.
- Audit entry auto-written for each legal transition only.
- Case creation gate via `create_offboarding_case(...)` only.
- Direct INSERT into `offboarding_cases` blocked unless DB gate/policy conditions are satisfied.

## Lifecycle contract (transition matrix)

### States
- `draft`
- `submitted`
- `under_review`
- `approved`
- `closed`
- `rejected`

### Allowed transitions
- `draft -> submitted` (case owner)
- `submitted -> under_review` (org owner/admin)
- `under_review -> approved` (assigned reviewer)
- `under_review -> rejected` (assigned reviewer)
- `rejected -> draft` (case owner only rollback)
- `approved -> closed` (org owner/admin, or service role)

### Hard rules
- No skip-level transitions.
- No rollback except `rejected -> draft`.
- `closed` is terminal.

---

## Test data setup (once)

### Preconditions
1. One org with users:
   - `owner_user` (org owner/admin)
   - `member_user` (case owner)
   - `reviewer_user` (assigned reviewer)
   - `other_user` (wrong role for negative tests)
2. Case `CASE_ID` exists and `created_by = member_user`.
3. Case reviewer assigned as `reviewer_user`.

### Suggested helper checks
```sql
select id, org_id, created_by, reviewer_user_id, status
from offboarding_cases
where id = '<CASE_ID>';

select action, metadata, actor_user_id, created_at
from audit_logs
where entity_type = 'offboarding_case'
  and entity_id = '<CASE_ID>'
order by created_at desc;
```

---

## A) Legal transitions (positive)

> For each item: transition succeeds and audit count increases by exactly 1.

### A1. `draft -> submitted` by case owner
- Preconditions: case status = `draft`; session user = `member_user`.
- Step:
```sql
select transition_offboarding_case_status('<CASE_ID>', 'submitted');
```
- Expected:
  - Function returns updated row with `status = submitted`.
  - New audit row with metadata `from_status=draft`, `to_status=submitted`.

### A2. `submitted -> under_review` by org owner/admin
- Preconditions: case status = `submitted`; session user = `owner_user`.
- Step:
```sql
select transition_offboarding_case_status('<CASE_ID>', 'under_review');
```
- Expected: success + exactly 1 new audit row (`submitted -> under_review`).

### A3. `under_review -> approved` by reviewer
- Preconditions: case status = `under_review`; session user = `reviewer_user`.
- Step:
```sql
select transition_offboarding_case_status('<CASE_ID>', 'approved');
```
- Expected: success + exactly 1 new audit row (`under_review -> approved`).

### A4. `approved -> closed` by org owner/admin
- Preconditions: case status = `approved`; session user = `owner_user`.
- Step:
```sql
select transition_offboarding_case_status('<CASE_ID>', 'closed');
```
- Expected: success + exactly 1 new audit row (`approved -> closed`).

### A5. `under_review -> rejected` by reviewer and rollback `rejected -> draft` by case owner
- Preconditions:
  - reset/create another case to `under_review`.
  - reviewer assigned.
- Steps:
```sql
select transition_offboarding_case_status('<CASE_ID_2>', 'rejected');
select transition_offboarding_case_status('<CASE_ID_2>', 'draft');
```
- Expected:
  - Both calls succeed.
  - Each call appends exactly 1 audit row with matching `from_status` / `to_status`.

---

## B) Illegal transitions (negative)

> For each item: transition must fail and audit count must not increase.

### B1. Skip-level: `draft -> approved`
- Preconditions: case status = `draft`.
- Step:
```sql
select transition_offboarding_case_status('<CASE_ID>', 'approved');
```
- Expected:
  - Error: invalid transition.
  - No new audit row.

### B2. Forbidden rollback: `approved -> under_review`
- Preconditions: case status = `approved`.
- Step:
```sql
select transition_offboarding_case_status('<CASE_ID>', 'under_review');
```
- Expected: fail + no new audit row.

### B3. Closed terminal: `closed -> draft` (or any)
- Preconditions: case status = `closed`.
- Step:
```sql
select transition_offboarding_case_status('<CASE_ID>', 'draft');
```
- Expected: fail + no new audit row.

---

## C) Direct update blocked

### C1. SQL direct update must fail
- Preconditions: case status known.
- Step:
```sql
update offboarding_cases
set status = 'approved'
where id = '<CASE_ID>';
```
- Expected:
  - Statement fails with message similar to: `case status changes must use transition_offboarding_case_status`.
  - No new audit row.

### C2. REST patch direct status change must fail
- Step:
  - `PATCH /rest/v1/offboarding_cases?id=eq.<CASE_ID>` body `{"status":"approved"}`
- Expected:
  - HTTP error (or zero-row no-op if blocked by RLS path), and status unchanged.
  - No new audit row.

---

## D) Case creation gate verification

### D1. Positive: create via `create_offboarding_case(...)`
- Preconditions:
  - session user is org member (`owner/admin/member`) and has current org context.
- Step:
```sql
select create_offboarding_case('Sprint29 Candidate', current_date + 7, 'creation gate test');
```
- Expected:
  - Insert succeeds.
  - Returned/new row has `status = 'draft'`.
  - Exactly one new `audit_logs` row with action `case_created` for that `entity_id`.

### D2. Negative: direct INSERT into `offboarding_cases`
- Preconditions:
  - session user authenticated (same user as D1).
- Step:
```sql
insert into offboarding_cases (employee_name, status, created_by, org_id)
values ('Bypass Attempt', 'draft', auth.uid(), '<ORG_ID>');
```
- Expected:
  - Statement fails (creation gate trigger and/or insert policy blocks direct insert).
  - No new `audit_logs` row with action `case_created` for the attempted row.

---

## E) Role enforcement

> Use a transition that is legal in matrix but executed by wrong role.

### D1. Non-reviewer tries `under_review -> approved`
- Preconditions: case status = `under_review`; session user = `other_user` (not assigned reviewer).
- Step:
```sql
select transition_offboarding_case_status('<CASE_ID>', 'approved');
```
- Expected: fail (`only assigned reviewer can approve/reject case`) + no new audit row.

### D2. Non-owner tries `draft -> submitted`
- Preconditions: case status = `draft`; session user = `other_user`.
- Step:
```sql
select transition_offboarding_case_status('<CASE_ID>', 'submitted');
```
- Expected: fail (`only case owner can submit draft`) + no new audit row.

### D3. Member (not admin/owner) tries `submitted -> under_review`
- Preconditions: case status = `submitted`; session user = `member_user`.
- Step:
```sql
select transition_offboarding_case_status('<CASE_ID>', 'under_review');
```
- Expected: fail (`only org owner/admin can move case to under_review`) + no new audit row.

---

## Acceptance checklist mapping
- [x] Illegal transitions rejected in DB layer.
- [x] Direct status updates rejected.
- [x] Only server-side entry allowed.
- [x] Every legal transition auto-appends audit log.
- [x] Case creation allowed only via server-side creation function.
- [x] Verification steps are executable and deterministic.
