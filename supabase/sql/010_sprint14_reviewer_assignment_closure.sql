-- Sprint 14 migration: reviewer assignment + case closure control

create or replace function is_org_reviewer(check_org_id uuid, check_user_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from org_members
    where org_members.org_id = check_org_id
      and org_members.user_id = check_user_id
      and org_members.role in ('owner', 'admin')
  );
$$;

create or replace function assign_case_reviewer(
  p_case_id uuid,
  p_org_id uuid,
  p_reviewer_user_id uuid
)
returns offboarding_cases
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid;
  current_reviewer uuid;
  updated_case offboarding_cases;
  current_status text;
begin
  actor_id := auth.uid();

  if actor_id is null then
    raise exception 'authentication required';
  end if;

  if not is_org_admin(p_org_id) then
    raise exception 'insufficient permissions to assign reviewer';
  end if;

  if p_reviewer_user_id is null then
    raise exception 'reviewer_user_id is required';
  end if;

  if not is_org_reviewer(p_org_id, p_reviewer_user_id) then
    raise exception 'reviewer must be org reviewer or admin';
  end if;

  select reviewer_user_id, status
    into current_reviewer, current_status
  from offboarding_cases
  where id = p_case_id
    and org_id = p_org_id
  for update;

  if not found then
    raise exception 'case not found';
  end if;

  if current_reviewer is not null then
    raise exception 'case already has reviewer';
  end if;

  perform set_config('app.reviewer_assignment', 'true', true);

  update offboarding_cases
  set reviewer_user_id = p_reviewer_user_id
  where id = p_case_id
    and org_id = p_org_id
  returning * into updated_case;

  insert into audit_logs (org_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (
    p_org_id,
    actor_id,
    'reviewer_assigned',
    'offboarding_case',
    p_case_id,
    jsonb_build_object(
      'status_before', current_status,
      'reviewer_user_id', p_reviewer_user_id,
      'assigned_at', now()
    )
  );

  return updated_case;
end;
$$;

create or replace function enforce_reviewer_assignment_gate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.reviewer_user_id is distinct from old.reviewer_user_id then
    if current_setting('app.reviewer_assignment', true) is distinct from 'true' then
      raise exception 'reviewer assignment must use assign_case_reviewer';
    end if;

    if old.reviewer_user_id is not null then
      raise exception 'case already has reviewer';
    end if;

    if new.reviewer_user_id is null then
      raise exception 'reviewer assignment requires reviewer_user_id';
    end if;

    if not is_org_admin(old.org_id) then
      raise exception 'insufficient permissions to assign reviewer';
    end if;

    if not is_org_reviewer(old.org_id, new.reviewer_user_id) then
      raise exception 'reviewer must be org reviewer or admin';
    end if;
  end if;

  return new;
end;
$$;

create or replace function close_offboarding_case(p_case_id uuid, p_org_id uuid)
returns offboarding_cases
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_case offboarding_cases;
  actor_id uuid;
  current_status text;
  reviewer_id uuid;
begin
  actor_id := auth.uid();

  if actor_id is null then
    raise exception 'authentication required';
  end if;

  select status, reviewer_user_id
    into current_status, reviewer_id
  from offboarding_cases
  where id = p_case_id
    and org_id = p_org_id
  for update;

  if not found then
    raise exception 'case not found';
  end if;

  if not (is_org_admin(p_org_id) or is_case_reviewer(p_case_id, p_org_id)) then
    raise exception 'insufficient permissions to close case';
  end if;

  if current_status <> 'open' then
    raise exception 'case must be open before closure';
  end if;

  if reviewer_id is null then
    raise exception 'case must have reviewer assignment before closure';
  end if;

  perform set_config('app.case_closure', 'true', true);

  update offboarding_cases
  set status = 'closed'
  where id = p_case_id
    and org_id = p_org_id
  returning * into updated_case;

  insert into audit_logs (org_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (
    p_org_id,
    actor_id,
    'case_closed',
    'offboarding_case',
    p_case_id,
    jsonb_build_object(
      'status_before', current_status,
      'reviewer_user_id', reviewer_id,
      'closed_at', now()
    )
  );

  return updated_case;
end;
$$;

create or replace function enforce_case_closure_gate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status = 'closed' then
    raise exception 'closed cases are immutable';
  end if;

  if new.status = 'closed' then
    if not (is_org_admin(old.org_id) or is_case_reviewer(old.id, old.org_id)) then
      raise exception 'insufficient permissions to close case';
    end if;

    if current_setting('app.case_closure', true) is distinct from 'true' then
      raise exception 'case closure must use close_offboarding_case';
    end if;

    if old.status <> 'open' then
      raise exception 'case must be open before closure';
    end if;

    if new.reviewer_user_id is null then
      raise exception 'case must have reviewer assignment before closure';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists offboarding_cases_reviewer_assignment_gate on offboarding_cases;
create trigger offboarding_cases_reviewer_assignment_gate
before update on offboarding_cases
for each row
execute function enforce_reviewer_assignment_gate();

drop trigger if exists offboarding_cases_closure_gate on offboarding_cases;
create trigger offboarding_cases_closure_gate
before update on offboarding_cases
for each row
execute function enforce_case_closure_gate();
