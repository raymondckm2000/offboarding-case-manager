-- Sprint 7 migration: case closure gate + immutability + audit

create or replace function case_has_reviewer_signoff(check_case_id uuid, check_org_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from reviewer_signoffs
    where reviewer_signoffs.case_id = check_case_id
      and reviewer_signoffs.org_id = check_org_id
  );
$$;

create or replace function case_is_closed(check_case_id uuid, check_org_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from offboarding_cases
    where offboarding_cases.id = check_case_id
      and offboarding_cases.org_id = check_org_id
      and offboarding_cases.status = 'closed'
  );
$$;

create or replace function task_case_is_closed(check_task_id uuid, check_org_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from tasks
    join offboarding_cases
      on offboarding_cases.id = tasks.case_id
     and offboarding_cases.org_id = tasks.org_id
    where tasks.id = check_task_id
      and tasks.org_id = check_org_id
      and offboarding_cases.status = 'closed'
  );
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
    if current_setting('app.case_closure', true) is distinct from 'true' then
      raise exception 'case closure must use close_offboarding_case';
    end if;

    if old.status <> 'ready_to_close' then
      raise exception 'case must be ready_to_close before closure';
    end if;

    if new.reviewer_user_id is null then
      raise exception 'case must have reviewer assignment before closure';
    end if;

    if case_has_incomplete_required_tasks(old.id, old.org_id) then
      raise exception 'case has incomplete required tasks';
    end if;

    if not case_has_reviewer_signoff(old.id, old.org_id) then
      raise exception 'case requires reviewer signoff';
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
  reviewer_signoff_count integer;
  actor_id uuid;
  case_owner uuid;
  current_status text;
  reviewer_assigned boolean;
  has_incomplete_required boolean;
begin
  actor_id := auth.uid();

  select created_by, status, reviewer_user_id is not null
    into case_owner, current_status, reviewer_assigned
  from offboarding_cases
  where id = p_case_id
    and org_id = p_org_id
  for update;

  if not found then
    raise exception 'case not found';
  end if;

  if not (is_org_admin(p_org_id) or case_owner = actor_id) then
    raise exception 'insufficient permissions to close case';
  end if;

  if current_status <> 'ready_to_close' then
    raise exception 'case must be ready_to_close before closure';
  end if;

  if not reviewer_assigned then
    raise exception 'case must have reviewer assignment before closure';
  end if;

  has_incomplete_required := case_has_incomplete_required_tasks(p_case_id, p_org_id);
  if has_incomplete_required then
    raise exception 'case has incomplete required tasks';
  end if;

  select count(*)
    into reviewer_signoff_count
  from reviewer_signoffs
  where case_id = p_case_id
    and org_id = p_org_id;

  if reviewer_signoff_count < 1 then
    raise exception 'case requires reviewer signoff';
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
    'case_closure',
    'offboarding_case',
    p_case_id,
    jsonb_build_object(
      'status_before', current_status,
      'reviewer_assigned', reviewer_assigned,
      'reviewer_signoff_count', reviewer_signoff_count,
      'required_tasks_incomplete', has_incomplete_required,
      'closed_at', now()
    )
  );

  return updated_case;
end;
$$;

create or replace function enforce_task_case_open()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  check_case_id uuid;
  check_org_id uuid;
begin
  check_case_id := coalesce(new.case_id, old.case_id);
  check_org_id := coalesce(new.org_id, old.org_id);

  if case_is_closed(check_case_id, check_org_id) then
    raise exception 'cannot mutate tasks for closed case';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

create or replace function enforce_evidence_case_open()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  check_task_id uuid;
  check_org_id uuid;
begin
  check_task_id := coalesce(new.task_id, old.task_id);
  check_org_id := coalesce(new.org_id, old.org_id);

  if task_case_is_closed(check_task_id, check_org_id) then
    raise exception 'cannot mutate evidence for closed case';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

create or replace function enforce_reviewer_signoff_case_open()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  check_case_id uuid;
  check_org_id uuid;
begin
  check_case_id := new.case_id;
  check_org_id := new.org_id;

  if case_is_closed(check_case_id, check_org_id) then
    raise exception 'cannot mutate reviewer signoffs for closed case';
  end if;

  return new;
end;
$$;

drop trigger if exists offboarding_cases_closure_gate on offboarding_cases;
create trigger offboarding_cases_closure_gate
before update on offboarding_cases
for each row
execute function enforce_case_closure_gate();

drop trigger if exists tasks_case_closed_guard on tasks;
create trigger tasks_case_closed_guard
before insert or update or delete on tasks
for each row
execute function enforce_task_case_open();

drop trigger if exists evidence_case_closed_guard on evidence;
create trigger evidence_case_closed_guard
before insert or update or delete on evidence
for each row
execute function enforce_evidence_case_open();

drop trigger if exists reviewer_signoffs_case_closed_guard on reviewer_signoffs;
create trigger reviewer_signoffs_case_closed_guard
before insert on reviewer_signoffs
for each row
execute function enforce_reviewer_signoff_case_open();
