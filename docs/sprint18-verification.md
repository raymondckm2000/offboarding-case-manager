# Sprint 18 Verification خطوات

## Preconditions
1. Sign in to Offboarding Case Manager with an org admin account and a standard member account.
2. Ensure both accounts belong to different orgs for cross-org validation.

## Network checks (Dashboard)
1. Open `/public/ocm/#/dashboard` in the browser.
2. In the network tab, confirm the dashboard issues:
   - `GET /rest/v1/reporting_case_sla?select=*`
   - `GET /rest/v1/reporting_case_escalation?select=*`
3. Verify both requests return `200` and JSON payloads (no `404`).
4. With an org that has cases, confirm the dashboard table shows real rows and does not display the graceful-degradation fallback message.

## RLS checks
1. **Admin account (org-wide)**
   - Dashboard should return rows for all cases in the admin’s org.
2. **Member account (restricted)**
   - Dashboard rows should match the same visibility rules as the existing case list.
3. **Cross-org access**
   - Use a case ID from Org A while logged in to Org B.
   - Issue `GET /rest/v1/reporting_case_sla?case_id=eq.<ORG_A_CASE_ID>&select=*`.
   - Expected outcome: query returns `[]` (preferred) or `401/403` due to RLS policy rejection.

## Read-only proof
1. Confirm there are no POST/PATCH/DELETE endpoints introduced for reporting views.
2. Attempting any write action against `/rest/v1/reporting_case_sla` or `/rest/v1/reporting_case_escalation` should be rejected.
