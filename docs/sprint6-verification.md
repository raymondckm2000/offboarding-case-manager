# Sprint 6 Verification

## Preconditions (must be true)
- org_id = c4d6f4e6-00dc-45ca-b6d7-7fbccfe1f814
- case_id = 78f0c7ff-636b-484e-8d27-4e28b3590492
- reviewer JWT sub = <REVIEWER_USER_ID>
- org_members contains (org_id, user_id=sub)
- offboarding_cases.reviewer_user_id = sub

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
If any column is missing or table name mismatch, treat as blocker and stop verification.

## Audit trigger behavior
- audit_logs insert is performed by DB trigger on reviewer_signoffs insert.
- Client must not insert into audit_logs directly.

## Verification (capture output)
1) POST /rest/v1/reviewer_signoffs (payload: org_id, case_id only) → capture returned reviewer_signoffs.id
2) GET /rest/v1/reviewer_signoffs?id=eq.<reviewer_signoffs.id>
3) GET /rest/v1/audit_logs?entity_type=eq.reviewer_signoff&entity_id=eq.<reviewer_signoffs.id>
   - Success criteria: audit GET returns ≥ 1 row and matches:
     entity_type = 'reviewer_signoff', entity_id = <signoff id>, metadata.case_id = <case_id> (if metadata contains case_id)
