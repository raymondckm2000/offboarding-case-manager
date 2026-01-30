alter table offboarding_cases
  add column if not exists reviewer_user_id uuid references auth.users(id);

create table if not exists reviewer_signoffs (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null,
  org_id uuid not null references orgs(id) on delete cascade,
  reviewer_user_id uuid not null references auth.users(id) default auth.uid(),
  created_by uuid not null references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  unique (case_id, reviewer_user_id),
  constraint reviewer_signoffs_case_org_fk foreign key (case_id, org_id)
    references offboarding_cases(id, org_id) on delete cascade
);

create or replace function is_case_reviewer(check_case_id uuid, check_org_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from offboarding_cases
    where offboarding_cases.id = check_case_id
      and offboarding_cases.org_id = check_org_id
      and offboarding_cases.reviewer_user_id = auth.uid()
  );
$$;

create or replace function set_reviewer_signoff_defaults()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.created_by := auth.uid();
  new.reviewer_user_id := auth.uid();
  return new;
end;
$$;

create or replace function log_reviewer_signoff()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into audit_logs (org_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (
    new.org_id,
    auth.uid(),
    'create',
    'reviewer_signoff',
    new.id,
    jsonb_build_object('case_id', new.case_id)
  );
  return new;
end;
$$;

drop trigger if exists reviewer_signoffs_defaults on reviewer_signoffs;
create trigger reviewer_signoffs_defaults
before insert on reviewer_signoffs
for each row
execute function set_reviewer_signoff_defaults();

drop trigger if exists reviewer_signoffs_audit on reviewer_signoffs;
create trigger reviewer_signoffs_audit
after insert on reviewer_signoffs
for each row
execute function log_reviewer_signoff();

alter table reviewer_signoffs enable row level security;

drop policy if exists reviewer_signoffs_select on reviewer_signoffs;
create policy reviewer_signoffs_select
on reviewer_signoffs
for select
to authenticated
using (is_org_member(org_id));

drop policy if exists reviewer_signoffs_insert on reviewer_signoffs;
create policy reviewer_signoffs_insert
on reviewer_signoffs
for insert
to authenticated
with check (
  is_org_member(org_id)
  and is_case_reviewer(case_id, org_id)
);
