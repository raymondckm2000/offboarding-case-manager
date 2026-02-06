# Sprint 17 Verification — Read-only Operations Dashboard UI

> Purpose: Sprint 17 exists to **reduce risk**, not to speed up operations. The dashboard is **read-only**.

## Schema Contract (Canonical Keys)
## Current DB Status Note (Important)

At the time of Sprint 17 verification, the following reporting views
are **not yet present** in the database:

- `reporting_case_sla`
- `reporting_case_escalation`

Sprint 17 validates the **UI routing, schema contract, and read-only behavior only**.
No assumptions are made about data availability.

Actual reporting view implementation and RLS verification
will be completed in **Sprint 18**.


Sprint 17 dashboard UI is served from the `/public/ocm/` assets in this repo.

### reporting_case_sla (exact keys used)
- `case_id`
- `status`
- `sla_breached`

### reporting_case_escalation (exact keys used)
- `case_id`
- `latest_escalation_level`
- `is_acknowledged`
- `latest_escalated_at`
- `latest_acknowledged_at`

**Dashboard does not rely on any manual configuration.** No config/queryparam/runtime-config is used to map columns.

## Network Expectations (GET-only for domain data)
**Domain data (GET only)**
- `GET /rest/v1/reporting_case_sla`
- `GET /rest/v1/reporting_case_escalation`
- `GET /rest/v1/audit_logs?case_id=eq.<CASE_ID>&order=created_at.desc`

**Auth exceptions (allowed)**
- `POST /auth/v1/token`
- `GET /auth/v1/user`

## Audit Module Degradation
- If the audit timeline module is missing in the build, the UI shows **“Audit module unavailable.”**
- This does **not** affect Sprint 17 read-only dashboard acceptance.

## Admin vs Member (RLS)
1. Log in as Admin → open `#/dashboard` → verify org-wide rows visible.
2. Log out → log in as Member → open `#/dashboard` → verify rows limited to RLS.

## Read-only Proof
- Opening the dashboard and loading audit logs **must not** change any DB state.
- Network tab shows **no POST/PATCH/DELETE** for domain data.
