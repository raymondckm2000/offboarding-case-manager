# Sprint 1 verification (DB-level evidence)

This document provides concrete, DB-level verification steps for the Sprint 1 schema and RLS.

## Where the schema and RLS live

- Schema SQL: `supabase/sql/001_schema.sql`
- RLS SQL: `supabase/sql/002_rls.sql`

## How to list enabled RLS and policies

Run these queries in an authenticated session (or as a privileged admin user) to verify that RLS is enabled and policies exist.

```sql
select
  n.nspname as schema,
  c.relname as table,
  c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'orgs',
    'org_members',
    'offboarding_cases',
    'tasks',
    'evidence'
  )
order by c.relname;
```

```sql
select
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual as using_expression,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename in (
    'orgs',
    'org_members',
    'offboarding_cases',
    'tasks',
    'evidence'
  )
order by tablename, policyname;
```

## Cross-org access proof (DB enforced)

Execute the following in **authenticated sessions** using Supabase RLS test mode or JWT sessions.

1. **User A** (Org A member) attempts to read Org B rows:
```sql
select * from offboarding_cases where org_id = '<ORG_B_UUID>';
```
**Expected**: 0 rows returned.

2. **User B** (Org B member) attempts to read Org A rows:
```sql
select * from offboarding_cases where org_id = '<ORG_A_UUID>';
```
**Expected**: 0 rows returned.

3. **User A** attempts to write into Org B:
```sql
insert into tasks (case_id, title, status, is_required, created_by, org_id)
values ('<ORG_B_CASE_ID>', 'Attempt cross-org task', 'open', false, auth.uid(), '<ORG_B_UUID>');
```
**Expected**: `ERROR:  new row violates row-level security policy for table "tasks"`.

4. **User B** attempts to write into Org A:
```sql
insert into tasks (case_id, title, status, is_required, created_by, org_id)
values ('<ORG_A_CASE_ID>', 'Attempt cross-org task', 'open', false, auth.uid(), '<ORG_A_UUID>');
```
**Expected**: `ERROR:  new row violates row-level security policy for table "tasks"`.
