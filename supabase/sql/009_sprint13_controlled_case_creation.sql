-- Sprint 13 migration: controlled case creation + audit log

create or replace function create_offboarding_case(
  p_employee_name text,
  p_dept text,
  p_position text,
  p_last_working_day date
)
returns offboarding_cases
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid;
  resolved_org_id uuid;
  org_count integer;
  role_count integer;
  new_case offboarding_cases;
begin
  actor_id := auth.uid();

  if actor_id is null then
    raise exception 'authentication required';
  end if;

  if p_employee_name is null or btrim(p_employee_name) = '' then
    raise exception 'employee_name is required';
  end if;

  select count(*), min(org_members.org_id)
    into org_count, resolved_org_id
  from org_members
  where org_members.user_id = actor_id;

  if org_count = 0 then
    raise exception 'user has no org membership';
  end if;

  if org_count > 1 then
    raise exception 'org context is ambiguous';
  end if;

  select count(*)
    into role_count
  from org_members
  where org_members.user_id = actor_id
    and org_members.org_id = resolved_org_id
    and org_members.role in ('owner', 'admin');

  if role_count = 0 then
    raise exception 'insufficient permissions to create case';
  end if;

  perform set_config('app.case_create', 'true', true);

  insert into offboarding_cases (
    employee_name,
    dept,
    position,
    last_working_day,
    status,
    created_by,
    org_id
  )
  values (
    p_employee_name,
    p_dept,
    p_position,
    p_last_working_day,
    'open',
    actor_id,
    resolved_org_id
  )
  returning * into new_case;

  insert into audit_logs (org_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (
    resolved_org_id,
    actor_id,
    'case_created',
    'offboarding_case',
    new_case.id,
    jsonb_build_object(
      'status', new_case.status,
      'created_at', new_case.created_at
    )
  );

  return new_case;
end;
$$;

create or replace function enforce_case_creation_gate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if current_setting('app.case_create', true) is distinct from 'true' then
    raise exception 'case creation must use create_offboarding_case';
  end if;

  if new.created_by is distinct from auth.uid() then
    raise exception 'case creator must be the authenticated actor';
  end if;

  if not is_org_admin(new.org_id) then
    raise exception 'only org admins can create cases';
  end if;

  if new.status is distinct from 'open' then
    raise exception 'case must start in open status';
  end if;

  return new;
end;
$$;

drop trigger if exists offboarding_cases_creation_gate on offboarding_cases;
create trigger offboarding_cases_creation_gate
before insert on offboarding_cases
for each row
execute function enforce_case_creation_gate();

drop policy if exists offboarding_cases_insert on offboarding_cases;
create policy offboarding_cases_insert
on offboarding_cases
for insert
to authenticated
with check (
  current_setting('app.case_create', true) = 'true'
  and is_org_admin(org_id)
  and created_by = auth.uid()
  and status = 'open'
);
