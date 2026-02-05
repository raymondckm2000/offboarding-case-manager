# Sprint 14 Verification — Reviewer Assignment & Case Closure Control

> Scope: server-side enforced reviewer assignment, closure, audit trail, and reporting/SLA consistency.

## Assumptions
- `is_org_admin()` and `is_case_reviewer()` exist.
- `audit_logs` is append-only (no update/delete), as validated in prior sprints.
- Reviewer eligibility uses existing roles (owner/admin) in `org_members`.

## 1) Success: Assign Reviewer (Org Admin)
**Action**
```sql
select assign_case_reviewer(
  '<CASE_ID>',
  '<ORG_ID>',
  '<REVIEWER_USER_ID>'
);
```

**Expected**
- Returns `offboarding_cases` row with `reviewer_user_id = <REVIEWER_USER_ID>`.

## 2) Failure: Non-admin cannot assign reviewer
**Action**
```sql
select assign_case_reviewer(
  '<CASE_ID>',
  '<ORG_ID>',
  '<REVIEWER_USER_ID>'
);
```

**Expected**
- Error: `insufficient permissions to assign reviewer`.

## 3) Failure: Cross-org reviewer assignment rejected
**Action**
```sql
select assign_case_reviewer(
  '<CASE_ID_IN_ORG_A>',
  '<ORG_A>',
  '<USER_ID_IN_ORG_B>'
);
```

**Expected**
- Error: `reviewer must be org reviewer or admin`.

## 4) Failure: Client attempts direct reviewer update
**Action**
```http
PATCH /rest/v1/offboarding_cases?id=eq.<CASE_ID>
Content-Type: application/json

{
  "reviewer_user_id": "<REVIEWER_USER_ID>"
}
```

**Expected**
- Request rejected.
- Error includes `reviewer assignment must use assign_case_reviewer`.

## 5) Audit: Reviewer assignment recorded
**Action**
```http
GET /rest/v1/audit_logs?entity_type=eq.offboarding_case&entity_id=eq.<CASE_ID>&order=created_at.desc&limit=1
```

**Expected**
- Latest entry has `action = reviewer_assigned`.

## 6) Success: Close Case (Reviewer/Admin)
**Action**
```sql
select close_offboarding_case(
  '<CASE_ID>',
  '<ORG_ID>'
);
```

**Expected**
- Returns `offboarding_cases` row with `status = 'closed'`.

## 7) Failure: Close without reviewer assignment
**Action**
```sql
select close_offboarding_case(
  '<CASE_ID_NO_REVIEWER>',
  '<ORG_ID>'
);
```

**Expected**
- Error: `case must have reviewer assignment before closure`.

## 8) Failure: Non-authorized actor cannot close
**Action**
```sql
select close_offboarding_case(
  '<CASE_ID>',
  '<ORG_ID>'
);
```

**Expected**
- Error: `insufficient permissions to close case`.

## 9) Failure: Client attempts direct closure update
**Action**
```http
PATCH /rest/v1/offboarding_cases?id=eq.<CASE_ID>
Content-Type: application/json

{
  "status": "closed"
}
```

**Expected**
- Request rejected.
- Error includes `case closure must use close_offboarding_case`.

## 9a) Governance: RLS + trigger jointly block direct updates
**Action (RLS policy verification)**
```sql
select policyname, cmd, qual, with_check
from pg_policies
where tablename = 'offboarding_cases'
  and policyname = 'offboarding_cases_update';
```

**Expected**
- Policy exists and is enforced for authenticated users.
- Policy location: `supabase/sql/002_rls.sql` (`offboarding_cases_update`).

**Action (direct REST update attempt)**
```http
PATCH /rest/v1/offboarding_cases?id=eq.<CASE_ID>
Content-Type: application/json

{
  "reviewer_user_id": "<REVIEWER_USER_ID>",
  "status": "closed"
}
```

**Expected**
- Request rejected.
- Rejection can be from RLS or trigger; response should indicate permission/validation failure.
- Follow-up `GET /rest/v1/offboarding_cases?id=eq.<CASE_ID>` shows no change to `reviewer_user_id` or `status`.

## 10) Audit: Case closure recorded
**Action**
```http
GET /rest/v1/audit_logs?entity_type=eq.offboarding_case&entity_id=eq.<CASE_ID>&order=created_at.desc&limit=1
```

**Expected**
- Latest entry has `action = case_closed`.

## 11) Reporting: Closed case not counted as open
**Action**
```http
GET /rest/v1/reporting_org_case_summary?org_id=eq.<ORG_ID>
```

**Expected**
- `closed_cases` increased.
- `open_cases` decreased.

## 12) SLA: Closed case shows completion timestamp
**Action**
```http
GET /rest/v1/reporting_case_sla?org_id=eq.<ORG_ID>&case_id=eq.<CASE_ID>
```

**Expected**
- `close_completed_at` populated.
- `status = closed`.
