-- Sprint 29: case lifecycle governance (DB-side state machine + controlled transitions + case creation gate + audit)
-- Governance scope in this migration:
--   1) Status transitions: enforce matrix + role checks + server-side-only entrypoint.
--   2) Case creation: enforce create_offboarding_case() as the only insert path.
-- Impact:
--   - Data rewrite for legacy statuses: open -> draft, ready_to_close -> approved.
--   - offboarding_cases status default/check updated to Sprint 29 lifecycle states.
--   - offboarding_cases insert policy now requires app.case_create flag and draft start state.

update offboarding_cases
set status = case
  when status = 'open' then 'draft'
  when status = 'ready_to_close' then 'approved'
  else status
end
where status in ('open', 'ready_to_close');

alter table offboarding_cases
  alter column status set default 'draft';

alter table offboarding_cases
  drop constraint if exists offboarding_cases_status_lifecycle_check;

alter table offboarding_cases
  add constraint offboarding_cases_status_lifecycle_check
  check (status in ('draft', 'submitted', 'under_review', 'approved', 'closed', 'rejected'));

create or replace function is_service_role()
returns boolean
language sql
stable
as $$
  select coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role';
$$;

create or replace function is_case_owner(check_case_id uuid, check_org_id uuid, check_user_id uuid default auth.uid())
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from offboarding_cases
    where offboarding_cases.id = check_case_id
      and offboarding_cases.org_id = check_org_id
      and offboarding_cases.created_by = check_user_id
  );
$$;

create or replace function is_valid_case_status_transition(from_status text, to_status text)
returns boolean
language sql
stable
as $$
  select (from_status, to_status) in (
    ('draft', 'submitted'),
    ('submitted', 'under_review'),
    ('under_review', 'approved'),
    ('under_review', 'rejected'),
    ('rejected', 'draft'),
    ('approved', 'closed')
  );
$$;

create or replace function enforce_case_status_transition_gate()
returns trigger
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
begin
  if new.status is distinct from old.status then
    if current_setting('app.case_status_transition', true) is distinct from 'true' then
      raise exception 'case status changes must use transition_offboarding_case_status';
    end if;
  end if;

  return new;
end;
$$;

create or replace function transition_offboarding_case_status(
  p_case_id uuid,
  p_to_status text
)
returns offboarding_cases
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  actor_id uuid;
  case_row offboarding_cases;
  normalized_to_status text;
  updated_case offboarding_cases;
begin
  actor_id := auth.uid();

  if p_case_id is null then
    raise exception 'case_id is required';
  end if;

  normalized_to_status := lower(btrim(coalesce(p_to_status, '')));

  if normalized_to_status = '' then
    raise exception 'to_status is required';
  end if;

  select *
    into case_row
  from offboarding_cases
  where id = p_case_id
  for update;

  if not found then
    raise exception 'case not found';
  end if;

  if actor_id is not null and not is_org_member(case_row.org_id) then
    raise exception 'access denied';
  end if;

  if not is_valid_case_status_transition(case_row.status, normalized_to_status) then
    raise exception 'invalid case status transition: % -> %', case_row.status, normalized_to_status;
  end if;

  if case_row.status = 'draft' and normalized_to_status = 'submitted' then
    if not is_case_owner(case_row.id, case_row.org_id, actor_id) then
      raise exception 'only case owner can submit draft';
    end if;
  elsif case_row.status = 'submitted' and normalized_to_status = 'under_review' then
    if not is_org_admin(case_row.org_id) then
      raise exception 'only org owner/admin can move case to under_review';
    end if;
  elsif case_row.status = 'under_review' and normalized_to_status in ('approved', 'rejected') then
    if not is_case_reviewer(case_row.id, case_row.org_id) then
      raise exception 'only assigned reviewer can approve/reject case';
    end if;
  elsif case_row.status = 'rejected' and normalized_to_status = 'draft' then
    if not is_case_owner(case_row.id, case_row.org_id, actor_id) then
      raise exception 'only case owner can move rejected case back to draft';
    end if;
  elsif case_row.status = 'approved' and normalized_to_status = 'closed' then
    if not (is_org_admin(case_row.org_id) or is_service_role()) then
      raise exception 'only org owner/admin (or service role) can close approved case';
    end if;
  else
    raise exception 'transition rule is not implemented';
  end if;

  perform set_config('app.case_status_transition', 'true', true);

  update offboarding_cases
  set status = normalized_to_status
  where id = case_row.id
    and org_id = case_row.org_id
  returning * into updated_case;

  insert into audit_logs (org_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (
    case_row.org_id,
    actor_id,
    'case_status_transition',
    'offboarding_case',
    case_row.id,
    jsonb_build_object(
      'case_id', case_row.id,
      'from_status', case_row.status,
      'to_status', normalized_to_status,
      'action_type', 'case_status_transition',
      'occurred_at', now()
    )
  );

  return updated_case;
end;
$$;

create or replace function close_offboarding_case(p_case_id uuid, p_org_id uuid)
returns offboarding_cases
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  case_org_id uuid;
begin
  select org_id
    into case_org_id
  from offboarding_cases
  where id = p_case_id;

  if not found then
    raise exception 'case not found';
  end if;

  if p_org_id is distinct from case_org_id then
    raise exception 'case/org mismatch';
  end if;

  return transition_offboarding_case_status(p_case_id, 'closed');
end;
$$;

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
    'draft',
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

  if new.status is distinct from 'draft' then
    raise exception 'case must start in draft status';
  end if;

  return new;
end;
$$;

drop trigger if exists offboarding_cases_closure_gate on offboarding_cases;

drop trigger if exists offboarding_cases_status_transition_gate on offboarding_cases;
create trigger offboarding_cases_status_transition_gate
before update on offboarding_cases
for each row
execute function enforce_case_status_transition_gate();

drop policy if exists offboarding_cases_insert on offboarding_cases;
create policy offboarding_cases_insert
on offboarding_cases
for insert
to authenticated
with check (
  current_setting('app.case_create', true) = 'true'
  and is_org_member(org_id)
  and created_by = auth.uid()
  and status = 'draft'
);

grant execute on function is_service_role() to authenticated;
grant execute on function is_case_owner(uuid, uuid, uuid) to authenticated;
grant execute on function is_valid_case_status_transition(text, text) to authenticated;
grant execute on function transition_offboarding_case_status(uuid, text) to authenticated;
grant execute on function close_offboarding_case(uuid, uuid) to authenticated;
