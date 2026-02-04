# Sprint 13 Verification — Controlled Case Creation

> Scope: server-side enforced creation with audit + reporting/SLA visibility.

## Assumptions
- PO decision not provided; implemented most conservative policy: **Org Admin only** can create cases.

## PR/Delivery Notes (Sprint 13)
- **PO Decision Record:** Sprint 13 adopts **Org Admin / Owner only** for case creation policy.
- **Dependency Assumptions:** `is_org_admin()` exists; `audit_logs` is append-only; reporting/SLA views are existing assets and this sprint only verifies visibility.
- **Future Extension Note:** If member-create or configurable policy is required, open a separate sprint to avoid silent rule changes.

## 1) Success: Create Case (Org Admin)
**Action**
```sql
select create_offboarding_case(
  'Ada Lovelace',
  'Engineering',
  'Software Engineer',
  '2024-12-31'
);
```

**Expected**
- Returns a new `offboarding_cases` row.
- `org_id` matches admin's org.
- `created_by` equals current user.
- `status = 'open'`.

## 2) Failure: Non-admin cannot create
**Action**
```sql
select create_offboarding_case(
  'Unauthorized User',
  'HR',
  'Coordinator',
  '2024-12-15'
);
```

**Expected**
- Error: `insufficient permissions to create case`.

## 3) Failure: User has no org
**Action**
```sql
select create_offboarding_case(
  'No Org User',
  'HR',
  'Coordinator',
  '2024-12-15'
);
```

**Expected**
- Error: `user has no org membership`.

## 4) Failure: Org context ambiguous
**Action** (user belongs to multiple orgs)
```sql
select create_offboarding_case(
  'Multi Org User',
  'Finance',
  'Analyst',
  '2024-12-20'
);
```

**Expected**
- Error: `org context is ambiguous`.

## 5) Failure: Client attempts direct insert with forbidden fields
**Action**
```http
POST /rest/v1/offboarding_cases
Content-Type: application/json

{
  "employee_name": "Bypass Attempt",
  "status": "closed",
  "org_id": "<other-org>",
  "created_by": "<other-user>"
}
```

**Expected**
- Request rejected.
- Error includes `case creation must use create_offboarding_case`.

## 6) Audit Log: case_created recorded
**Action**
```http
GET /rest/v1/audit_logs?entity_type=eq.offboarding_case&entity_id=eq.<CASE_ID>&order=created_at.desc&limit=1
```

**Expected**
- Latest entry has `action = case_created`.

## 7) Reporting: new case appears
**Action**
```http
GET /rest/v1/reporting_org_case_summary?org_id=eq.<ORG_ID>
```

**Expected**
- `total_cases` increased.
- `open_cases` increased.

## 8) SLA: new case appears
**Action**
```http
GET /rest/v1/reporting_case_sla?org_id=eq.<ORG_ID>
```

**Expected**
- New case row present, status `open` with SLA timers based on `created_at`.
