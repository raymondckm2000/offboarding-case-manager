# Sprint 1 RLS setup and test plan

## Setup steps (Org A and Org B)

> All verification queries must be executed as authenticated users (User A or User B) using Supabase RLS test mode or a JWT-authenticated SQL session. Do **not** use the service role key for RLS verification.

1. Create two users in Supabase Auth: **User A** and **User B**.
2. Create Org A and Org B.

```sql
insert into orgs (name, created_by)
values ('Org A', '<USER_A_UUID>'), ('Org B', '<USER_B_UUID>')
returning id, name;
```

3. Add memberships (User A -> Org A, User B -> Org B).

```sql
insert into org_members (org_id, user_id, role, created_by)
values
  ('<ORG_A_UUID>', '<USER_A_UUID>', 'owner', '<USER_A_UUID>'),
  ('<ORG_B_UUID>', '<USER_B_UUID>', 'owner', '<USER_B_UUID>');
```

## Happy path tests (authenticated)

Run as **User A** (via Supabase SQL Editor in RLS test mode or client with JWT):

```sql
insert into offboarding_cases (
  case_no,
  employee_name,
  dept,
  position,
  last_working_day,
  status,
  created_by,
  org_id
)
values (
  'CASE-001',
  'Avery Lee',
  'IT',
  'Engineer',
  '2025-01-31',
  'open',
  auth.uid(),
  '<ORG_A_UUID>'
)
returning id, org_id;
```

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

```sql
insert into evidence (
  task_id,
  note,
  created_by,
  org_id
)
values (
  '<TASK_ID_FROM_ABOVE>',
  'Laptop returned to IT',
  auth.uid(),
  '<ORG_A_UUID>'
)
returning id, org_id;
```

## Negative tests (RLS)

### N1: Unauthenticated access denied

**Who**: Unauthenticated (no JWT)

**Action**:
```sql
select * from orgs;
```

**Expected**: `ERROR:  permission denied for table orgs` (RLS blocks unauthenticated access).

### N2: Cross-org read blocked

**Who**: User A (authenticated)

**Action**:
```sql
select * from offboarding_cases where org_id = '<ORG_B_UUID>';
```

**Expected**: 0 rows returned.

**Who**: User B (authenticated)

**Action**:
```sql
select * from offboarding_cases where org_id = '<ORG_A_UUID>';
```

**Expected**: 0 rows returned.

### N3: Cross-org write blocked

**Who**: User A (authenticated)

**Action**:
```sql
insert into tasks (case_id, title, status, is_required, created_by, org_id)
values ('<ORG_B_CASE_ID>', 'Attempt cross-org task', 'open', false, auth.uid(), '<ORG_B_UUID>');
```

**Expected**: `ERROR:  new row violates row-level security policy for table "tasks"`.

**Who**: User B (authenticated)

**Action**:
```sql
insert into tasks (case_id, title, status, is_required, created_by, org_id)
values ('<ORG_A_CASE_ID>', 'Attempt cross-org task', 'open', false, auth.uid(), '<ORG_A_UUID>');
```

**Expected**: `ERROR:  new row violates row-level security policy for table "tasks"`.

### N4: is_required protected

**Who**: User A with role = member (not owner/admin)

**Action**:
```sql
update tasks
set is_required = false
where id = '<TASK_ID_FROM_ABOVE>';
```

**Expected**: `ERROR: is_required can only be changed by org owners or admins`.
