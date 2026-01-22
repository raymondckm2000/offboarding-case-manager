# Sprint 2 verification (app access layer + RLS alignment)

This document validates Sprint 2 payloads against the Sprint 1 schema and RLS rules.

## Requirements

- Use **authenticated** sessions (JWT / Supabase RLS test mode). Do **not** use a service role key.
- Always provide `org_id` and `created_by = auth.uid()` in inserts so RLS checks pass.

## Payloads that satisfy NOT NULL columns

### Create an org (orgs)

```sql
insert into orgs (name, created_by)
values ('Org A', auth.uid())
returning id, name;
```

### Add org member (org_members)

```sql
insert into org_members (org_id, user_id, role, created_by)
values ('<ORG_A_UUID>', auth.uid(), 'owner', auth.uid())
returning org_id, user_id, role;
```

### Create offboarding case (offboarding_cases)

```sql
insert into offboarding_cases (
  employee_name,
  status,
  created_by,
  org_id
)
values (
  'Avery Lee',
  'open',
  auth.uid(),
  '<ORG_A_UUID>'
)
returning id, org_id;
```

### Create task (tasks)

```sql
insert into tasks (
  case_id,
  title,
  status,
  is_required,
  created_by,
  org_id
)
values (
  '<CASE_ID_FROM_ABOVE>',
  'Collect laptop',
  'open',
  true,
  auth.uid(),
  '<ORG_A_UUID>'
)
returning id, org_id;
```

### Create evidence (evidence)

```sql
insert into evidence (
  task_id,
  created_by,
  org_id,
  note
)
values (
  '<TASK_ID_FROM_ABOVE>',
  auth.uid(),
  '<ORG_A_UUID>',
  'Laptop returned to IT'
)
returning id, org_id;
```
