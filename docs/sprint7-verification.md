# Sprint 7 Verification

## Preconditions (must be true)
- org_id = <ORG_ID>
- case_id = <CASE_ID>
- actor JWT sub = <ACTOR_USER_ID>
- offboarding_cases.status = 'ready_to_close'
- offboarding_cases.reviewer_user_id is not null
- org_members contains (org_id, user_id=sub) with role owner/admin OR case created_by = sub
- all required tasks are complete
- at least one reviewer_signoffs exists for case_id

## Server-side precheck (must pass)
Run the **唯一指定** precheck SQL (SQL editor / psql):
```
select
  table_name,
  column_name,
  data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'audit_logs'
  and column_name in ('org_id', 'actor_user_id', 'action', 'entity_type', 'entity_id', 'metadata')
order by column_name;
```
Paste the query output into the evidence template.

## Policy list consistency check (must pass)
Capture the policy list **before** and **after** applying `006_sprint7_case_closure.sql`.
You may use Supabase UI screenshots or SQL output as evidence.
**SQL (psql / SQL editor):**
```
select
  table_name,
  policyname,
  cmd
from pg_policies
where schemaname = 'public'
  and table_name in ('offboarding_cases', 'tasks', 'evidence', 'reviewer_signoffs')
order by table_name, policyname, cmd;
```
Success criteria: policy list and counts are identical before vs after migration.

## Closure gate verification (capture output)
1) Attempt direct PATCH (should fail)
   - PATCH /rest/v1/offboarding_cases?id=eq.<CASE_ID>
   - payload: {"status":"closed"}
   - Expected: 401/403/400 with message indicating closure must use server-side gate.

2) Call RPC closure (should succeed)
   - POST /rest/v1/rpc/close_offboarding_case
   - payload: {"p_case_id":"<CASE_ID>","p_org_id":"<ORG_ID>"}
   - Expected: 200 with status='closed'.

3) Verify case is closed
   - GET /rest/v1/offboarding_cases?id=eq.<CASE_ID>
   - Expected: status='closed'.

## Post-closure immutability verification
4) Attempt to mutate tasks (should fail)
   - POST /rest/v1/tasks
   - payload: {"case_id":"<CASE_ID>","org_id":"<ORG_ID>","title":"Post-close", "is_required":false}
   - Expected: 401/403/400 with message indicating closed case immutability.

5) Attempt to mutate evidence (should fail)
   - POST /rest/v1/evidence
   - payload: {"task_id":"<TASK_ID>","org_id":"<ORG_ID>","note":"Post-close"}
   - Expected: 401/403/400 with message indicating closed case immutability.

6) Attempt to insert reviewer_signoffs (should fail)
   - POST /rest/v1/reviewer_signoffs
   - payload: {"case_id":"<CASE_ID>","org_id":"<ORG_ID>"}
   - Expected: 401/403/400 with message indicating closed case immutability.

## Audit completion evidence
7) GET /rest/v1/audit_logs?entity_type=eq.offboarding_case&entity_id=eq.<CASE_ID>
   - Expected: latest entry contains action='case_closure' and metadata includes reviewer_signoff_count, required_tasks_incomplete=false.
