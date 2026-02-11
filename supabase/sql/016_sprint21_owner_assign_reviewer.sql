-- Sprint 21 mutation: owner/admin reviewer assignment RPC
-- Pre-req:
--   1) Existing schema + prior migrations (001-015) already applied.
--   2) Execute in Supabase SQL editor as a privileged role.
-- Run:
--   Open Supabase Dashboard -> SQL Editor -> New query -> paste this file -> Run.

create or replace function is_org_owner_or_admin(
  check_org_id uuid,
  check_user_id uuid default auth.uid()
)
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

create or replace function owner_assign_case_reviewer(
  p_case_id uuid,
  p_reviewer_user_id uuid
)
returns offboarding_cases
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid;
  case_org_id uuid;
  current_reviewer uuid;
  current_status text;
  updated_case offboarding_cases;
begin
  actor_id := auth.uid();

  if actor_id is null then
    raise exception 'authentication required';
  end if;

  if p_case_id is null then
    raise exception 'case_id is required';
  end if;

  if p_reviewer_user_id is null then
    raise exception 'reviewer_user_id is required';
  end if;

  select offboarding_cases.org_id,
         offboarding_cases.reviewer_user_id,
         offboarding_cases.status
    into case_org_id, current_reviewer, current_status
  from offboarding_cases
  where offboarding_cases.id = p_case_id
  for update;

  if not found then
    raise exception 'case not found';
  end if;

  if not exists (
    select 1
    from org_members
    where org_members.org_id = case_org_id
      and org_members.user_id = actor_id
  ) then
    raise exception 'access denied';
  end if;

  if not is_org_owner_or_admin(case_org_id, actor_id) then
    raise exception 'access denied';
  end if;

  if not exists (
    select 1
    from org_members
    where org_members.org_id = case_org_id
      and org_members.user_id = p_reviewer_user_id
  ) then
    raise exception 'reviewer not in org';
  end if;

  perform set_config('app.reviewer_assignment', 'true', true);

  update offboarding_cases
  set reviewer_user_id = p_reviewer_user_id
  where offboarding_cases.id = p_case_id
    and offboarding_cases.org_id = case_org_id
  returning * into updated_case;

  insert into audit_logs (org_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (
    case_org_id,
    actor_id,
    'owner_reviewer_assigned',
    'offboarding_case',
    p_case_id,
    jsonb_build_object(
      'status_before', current_status,
      'reviewer_before', current_reviewer,
      'reviewer_after', p_reviewer_user_id,
      'assigned_at', now(),
      'source', 'owner_assign_case_reviewer'
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

    if new.reviewer_user_id is null then
      raise exception 'reviewer assignment requires reviewer_user_id';
    end if;

    if not is_org_owner_or_admin(old.org_id) then
      raise exception 'insufficient permissions to assign reviewer';
    end if;

    if not exists (
      select 1
      from org_members
      where org_members.org_id = old.org_id
        and org_members.user_id = new.reviewer_user_id
    ) then
      raise exception 'reviewer not in org';
    end if;
  end if;

  return new;
end;
$$;

grant execute on function is_org_owner_or_admin(uuid, uuid) to authenticated;
grant execute on function owner_assign_case_reviewer(uuid, uuid) to authenticated;
