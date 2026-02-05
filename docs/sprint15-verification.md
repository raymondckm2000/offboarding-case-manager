# Sprint 15 Verification — SLA Breach Handling & Escalation Governance (Observation Layer)

> Scope: server-side SLA breach derivation, reporting visibility, and append-only breach audit (0/1 per case).

## Assumptions
- SLA breach threshold uses `time_to_close_days` (default 10 days) from `sla_policies`.
- Breach baseline time is `offboarding_cases.created_at`.
- `is_org_admin()` covers both `owner` and `admin` roles for server-side enforcement.
- PO Decision: A — Only Org Admin / Owner may trigger SLA breach audit.

## Role Definition (Owner)
- **Owner** is a member whose `org_members.role = 'owner'` (verifiable via `org_members`).

## 1) Not Breached: Open case within SLA
**Action**
```http
GET /rest/v1/reporting_case_sla?org_id=eq.<ORG_ID>&case_id=eq.<OPEN_CASE_ID>
```

**Expected**
- `status` is not `closed`.
- `sla_breached = false`.
- `sla_breached_at` is `null`.

## 2) Breached: Open case over SLA
**Action**
```http
GET /rest/v1/reporting_case_sla?org_id=eq.<ORG_ID>&case_id=eq.<BREACHED_CASE_ID>
```

**Expected**
- `status` is not `closed`.
- `sla_breached = true`.
- `sla_breached_at` equals `close_due_at`.

## 3) Closed Case: Never flagged as breached
**Action**
```http
GET /rest/v1/reporting_case_sla?org_id=eq.<ORG_ID>&case_id=eq.<CLOSED_CASE_ID>
```

**Expected**
- `status = closed`.
- `sla_breached = false`.
- `sla_breached_at` is `null` (even if closed after the due date).

## 4) Audit: First breach writes exactly one audit log entry
**Action (server-side audit trigger)**
```sql
select log_case_sla_breach_if_needed('<BREACHED_CASE_ID>', '<ORG_ID>');
```

**Action (audit check)**
```http
GET /rest/v1/audit_logs?entity_type=eq.offboarding_case&entity_id=eq.<BREACHED_CASE_ID>&order=created_at.asc
```

**Expected**
- A single `action = case_sla_breached` entry exists.
- `metadata` includes `baseline_at`, `breach_due_at`, `threshold_days`, `evaluated_at`.

## 5) Audit: Repeated breach checks do not append more entries
**Action (repeat)**
```sql
select log_case_sla_breach_if_needed('<BREACHED_CASE_ID>', '<ORG_ID>');
```

**Action (audit re-check)**
```http
GET /rest/v1/audit_logs?entity_type=eq.offboarding_case&entity_id=eq.<BREACHED_CASE_ID>&order=created_at.asc
```

**Expected**
- The count of `case_sla_breached` entries remains 1.

## 6) Reporting: SLA breach visibility (admin view)
**Action**
```http
GET /rest/v1/reporting_case_sla?org_id=eq.<ORG_ID>
```

**Expected**
- Breached cases are identifiable via `sla_breached = true`.
- `sla_breached_at`, `sla_breach_baseline_at`, and `sla_breach_threshold_days` are present.
- Existing `open/closed` counts in `reporting_org_case_summary` remain unchanged.

## 7) Governance: audit_logs policy denies direct writes
**Action (policy check)**
```sql
select policyname, cmd, roles, qual, with_check
from pg_policies
where tablename = 'audit_logs';
```

**Expected**
- No insert/update/delete policy permits direct client writes to `audit_logs` (see Step 10 for the primary proof via REST spoof attempt).

## 8) Admin path: trigger → audit exists → count=1 → repeat count still 1
**Action (admin/owner trigger, use <BREACHED_CASE_ID_ADMIN>)**
```sql
select log_case_sla_breach_if_needed('<BREACHED_CASE_ID_ADMIN>', '<ORG_ID>');
```

**Expected**
- Call succeeds for admin/owner.

**Action (audit exists)**
```http
GET /rest/v1/audit_logs?entity_type=eq.offboarding_case&entity_id=eq.<BREACHED_CASE_ID_ADMIN>&action=eq.case_sla_breached&order=created_at.asc
```

**Expected**
- At least one `case_sla_breached` entry exists.

**Action (count=1, repeat remains 1)**
```sql
select count(*) as breach_audit_count
from audit_logs
where entity_type = 'offboarding_case'
  and entity_id = '<BREACHED_CASE_ID_ADMIN>'
  and action = 'case_sla_breached';
```

**Expected**
- `breach_audit_count` is 1 after the first trigger; remains 1 on repeat.

## 9) Non-admin path: trigger rejected/false → count remains 0
Use a different case ID from Step 8 to avoid prior audit side effects.
**Action (non-admin trigger, use <BREACHED_CASE_ID_NON_ADMIN>)**
```sql
select log_case_sla_breach_if_needed('<BREACHED_CASE_ID_NON_ADMIN>', '<ORG_ID>');
```

**Expected**
- Call is rejected (error or returns false).
- `case_sla_breached` audit count remains 0 for that case.

## 10) Client spoof attempt: direct breach write rejected
**Action**
```http
POST /rest/v1/audit_logs
Content-Type: application/json

{
  "org_id": "<ORG_ID>",
  "actor_user_id": "<USER_ID>",
  "action": "case_sla_breached",
  "entity_type": "offboarding_case",
  "entity_id": "<CASE_ID>",
  "metadata": {
    "baseline_at": "2024-01-01T00:00:00Z",
    "breach_due_at": "2024-01-11T00:00:00Z",
    "threshold_days": 10,
    "evaluated_at": "2024-01-12T00:00:00Z"
  }
}
```

**Expected**
- Request rejected by RLS/append-only controls.
- No new `case_sla_breached` entry is created.
