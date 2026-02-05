# Sprint 16 Verification — SLA Escalation & Notification Action Layer

## Assumptions
- `is_org_admin()` covers org owner/admin (Sprint 15 PO Decision A).
- Breach depends on existing `audit_logs.action = 'case_sla_breached'`.
- `breach_audit_id` selection strategy: use the **earliest** `case_sla_breached` audit row for the case.

## Notes (Governance / Non-goals)
- Direct client writes are blocked by RLS / no insert/update policies (validated below).
- Reporting view is read-only and has **no side effects** (query-only).
- No UI, no cron/automatic jobs, no external notifications (outbox only).

## Test identities / role switching
- **Admin/Owner user** (org_id = `<org_id>`): use for happy path escalation and acknowledgement.
- **Org member (non-admin)** (org_id = `<org_id>`): use for non-admin failure and reporting view access.
- **Non-member or other org member** (org_id = `<other_org_id>`): use for org mismatch and cross-org access checks.

## Happy path (Admin/Owner)
Precondition: the case already has a `case_sla_breached` audit row.
1) Escalate L1:
   ```sql
   select escalate_case_sla_breach('<case_id>', '<org_id>', 'L1');
   ```
2) Verify escalation row:
   ```sql
   select *
   from case_escalations
   where org_id = '<org_id>'
     and case_id = '<case_id>'
     and escalation_level = 'L1';
   ```
3) Verify audit log:
   ```sql
   select *
   from audit_logs
   where org_id = '<org_id>'
     and action = 'case_escalated'
     and entity_id = '<case_id>';
   ```
4) Verify outbox event:
   ```sql
   select *
   from notification_outbox
   where org_id = '<org_id>'
     and event_type = 'case_escalated'
     and entity_id = '<case_id>';
   ```

## Non-admin failure
1) As non-admin, call:
   ```sql
   select escalate_case_sla_breach('<case_id>', '<org_id>', 'L1');
   ```
2) Expect error; confirm **no inserts**:
   ```sql
   select count(*)
   from case_escalations
   where org_id = '<org_id>' and case_id = '<case_id>';
   ```
   ```sql
   select count(*)
   from audit_logs
   where org_id = '<org_id>' and action = 'case_escalated' and entity_id = '<case_id>';
   ```
   ```sql
   select count(*)
   from notification_outbox
   where org_id = '<org_id>' and event_type = 'case_escalated' and entity_id = '<case_id>';
   ```

## Duplicate escalation blocked
1) Run escalation twice:
   ```sql
   select escalate_case_sla_breach('<case_id>', '<org_id>', 'L1');
   select escalate_case_sla_breach('<case_id>', '<org_id>', 'L1');
   ```
2) Expect second call to fail; count remains 1:
   ```sql
   select count(*)
   from case_escalations
   where org_id = '<org_id>' and case_id = '<case_id>' and escalation_level = 'L1';
   ```

## Negative guard: closed case
1) Use a case with `status = 'closed'`:
   ```sql
   select id
   from offboarding_cases
   where org_id = '<org_id>' and status = 'closed'
   limit 1;
   ```
2) Attempt escalation and expect failure:
   ```sql
   select escalate_case_sla_breach('<closed_case_id>', '<org_id>', 'L1');
   ```
3) Verify no inserts:
   ```sql
   select count(*)
   from case_escalations
   where org_id = '<org_id>' and case_id = '<closed_case_id>';
   ```
   ```sql
   select count(*)
   from audit_logs
   where org_id = '<org_id>' and action = 'case_escalated' and entity_id = '<closed_case_id>';
   ```
   ```sql
   select count(*)
   from notification_outbox
   where org_id = '<org_id>' and event_type = 'case_escalated' and entity_id = '<closed_case_id>';
   ```

## Negative guard: org mismatch
1) Use a real case id from `<org_id>` but pass `<other_org_id>`:
   ```sql
   select id
   from offboarding_cases
   where org_id = '<org_id>'
   limit 1;
   ```
2) Attempt escalation and expect failure:
   ```sql
   select escalate_case_sla_breach('<case_id>', '<other_org_id>', 'L1');
   ```
3) Verify no inserts under `<other_org_id>`:
   ```sql
   select count(*)
   from case_escalations
   where org_id = '<other_org_id>' and case_id = '<case_id>';
   ```
   ```sql
   select count(*)
   from audit_logs
   where org_id = '<other_org_id>' and action = 'case_escalated' and entity_id = '<case_id>';
   ```
   ```sql
   select count(*)
   from notification_outbox
   where org_id = '<other_org_id>' and event_type = 'case_escalated' and entity_id = '<case_id>';
   ```

## Acknowledge path
1) Acknowledge L1:
   ```sql
   select ack_case_escalation('<case_id>', '<org_id>', 'L1');
   ```
2) Verify ack fields populated:
   ```sql
   select acknowledged_at, acknowledged_by
   from case_escalations
   where org_id = '<org_id>' and case_id = '<case_id>' and escalation_level = 'L1';
   ```
3) Verify audit log:
   ```sql
   select *
   from audit_logs
   where org_id = '<org_id>'
     and action = 'case_escalation_acknowledged'
     and entity_id = '<case_id>';
   ```

## Client spoof attempt (Supabase REST direct POST/PATCH)
Token usage notes:
- `<jwt>` can be an admin or member access token.
- Expect **all roles** to be rejected because direct writes have no insert/update policy.
- This verifies the “function-only writes” governance.

1) Attempt direct **insert** into `case_escalations` (expect 401/403 or permission denied):
   ```bash
   curl -i \
     -H "apikey: <anon_key>" \
     -H "Authorization: Bearer <jwt>" \
     -H "Content-Type: application/json" \
     -X POST "https://<project_ref>.supabase.co/rest/v1/case_escalations" \
     -d '{"org_id":"<org_id>","case_id":"<case_id>","breach_audit_id":"<audit_id>","escalation_level":"L1","created_by":"<user_id>"}'
   ```
2) Attempt direct **insert** into `notification_outbox` (expect 401/403 or permission denied):
   ```bash
   curl -i \
     -H "apikey: <anon_key>" \
     -H "Authorization: Bearer <jwt>" \
     -H "Content-Type: application/json" \
     -X POST "https://<project_ref>.supabase.co/rest/v1/notification_outbox" \
     -d '{"org_id":"<org_id>","event_type":"case_escalated","entity_type":"offboarding_case","entity_id":"<case_id>","payload":{"escalation_level":"L1"}}'
   ```
3) Attempt direct **update** on `case_escalations` (expect 401/403 or permission denied):
   ```bash
   curl -i \
     -H "apikey: <anon_key>" \
     -H "Authorization: Bearer <jwt>" \
     -H "Content-Type: application/json" \
     -X PATCH "https://<project_ref>.supabase.co/rest/v1/case_escalations?id=eq.<escalation_id>" \
     -d '{"acknowledged_at":"2024-01-01T00:00:00Z"}'
   ```
4) Verify no changes:
   ```sql
   select *
   from case_escalations
   where org_id = '<org_id>' and case_id = '<case_id>';
   ```
   ```sql
   select *
   from notification_outbox
   where org_id = '<org_id>' and entity_id = '<case_id>';
   ```

## Reporting view
1) As org member, query:
   ```sql
   select *
   from reporting_case_escalation
   where org_id = '<org_id>';
   ```
2) Verify latest escalation status is visible:
   - `latest_escalation_level`
   - `latest_escalated_at`
   - `latest_acknowledged_at`
   - `is_acknowledged`
