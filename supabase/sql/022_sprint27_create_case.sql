-- Sprint 27: member case creation flow with single-org context + audit

alter table offboarding_cases
  add column if not exists notes text;

create or replace function create_offboarding_case(
  p_employee_name text,
  p_last_working_day date,
  p_notes text
)
returns offboarding_cases
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  actor_id uuid;
  context_row record;
  new_case offboarding_cases;
  normalized_employee_name text;
begin
  actor_id := auth.uid();

  if actor_id is null then
    raise exception 'access denied';
  end if;

  select *
    into context_row
  from get_current_org_context();

  if context_row.org_id is null then
    raise exception 'access denied';
  end if;

  if not exists (
    select 1
    from org_members
    where org_members.org_id = context_row.org_id
      and org_members.user_id = actor_id
      and org_members.role in ('owner', 'admin', 'member')
  ) then
    raise exception 'access denied';
  end if;

  normalized_employee_name := btrim(coalesce(p_employee_name, ''));
  if normalized_employee_name = '' then
    raise exception 'employee_name is required';
  end if;

  perform set_config('app.case_create', 'true', true);

  insert into offboarding_cases (
    employee_name,
    last_working_day,
    notes,
    status,
    created_by,
    org_id
  )
  values (
    normalized_employee_name,
    p_last_working_day,
    nullif(btrim(coalesce(p_notes, '')), ''),
    'open',
    actor_id,
    context_row.org_id
  )
  returning * into new_case;

  insert into audit_logs (org_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (
    context_row.org_id,
    actor_id,
    'case_created',
    'offboarding_case',
    new_case.id,
    jsonb_build_object(
      'employee_name', new_case.employee_name,
      'last_working_day', new_case.last_working_day,
      'occurred_at', now()
    )
  );

  return new_case;
end;
$$;

create or replace function enforce_case_creation_gate()
returns trigger
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
begin
  if current_setting('app.case_create', true) is distinct from 'true' then
    raise exception 'case creation must use create_offboarding_case';
  end if;

  if new.created_by is distinct from auth.uid() then
    raise exception 'case creator must be the authenticated actor';
  end if;

  if not is_org_member(new.org_id) then
    raise exception 'only org members can create cases';
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
  and is_org_member(org_id)
  and created_by = auth.uid()
  and status = 'open'
);

grant execute on function create_offboarding_case(text, date, text) to authenticated;
