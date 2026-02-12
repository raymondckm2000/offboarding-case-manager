-- Sprint 24: enforce single-org membership semantics and block cross-org reassignment

create or replace function get_current_org_context()
returns table (
  org_id uuid,
  org_name text,
  role text
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  membership_count integer;
begin
  select count(*)
    into membership_count
  from org_members
  where org_members.user_id = auth.uid();

  if membership_count = 0 then
    return;
  end if;

  if membership_count > 1 then
    raise exception 'multi-org not supported';
  end if;

  return query
  select org_members.org_id,
         orgs.name as org_name,
         org_members.role
  from org_members
  join orgs on orgs.id = org_members.org_id
  where org_members.user_id = auth.uid();
end;
$$;

create or replace function assign_user_to_org(
  p_user_id uuid,
  p_org_id uuid,
  p_role text
)
returns org_members
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  actor_id uuid;
  normalized_role text;
  membership_row org_members;
  membership_existed boolean;
  role_before text;
  existing_org_id uuid;
begin
  actor_id := auth.uid();
  normalized_role := lower(trim(coalesce(p_role, '')));

  if actor_id is null then
    raise exception 'access denied';
  end if;

  if p_org_id is null or not exists (select 1 from orgs where orgs.id = p_org_id) then
    raise exception 'org not found';
  end if;

  if not exists (
    select 1
    from org_members
    where org_members.org_id = p_org_id
      and org_members.user_id = actor_id
      and org_members.role in ('owner', 'admin')
  ) then
    raise exception 'access denied';
  end if;

  if p_user_id is null or not exists (select 1 from auth.users where auth.users.id = p_user_id) then
    raise exception 'user not found';
  end if;

  if normalized_role not in ('owner', 'admin', 'member') then
    raise exception 'invalid role';
  end if;

  select org_members.org_id
    into existing_org_id
  from org_members
  where org_members.user_id = p_user_id
  order by org_members.created_at asc,
           org_members.org_id asc
  limit 1;

  if existing_org_id is not null and existing_org_id <> p_org_id then
    insert into audit_logs (org_id, actor_user_id, action, entity_type, entity_id, metadata)
    values (
      p_org_id,
      actor_id,
      'org_membership_assignment_blocked',
      'org_member',
      p_user_id,
      jsonb_build_object(
        'target_user_id', p_user_id,
        'role_after', normalized_role,
        'path', 'blocked',
        'source', 'assign_user_to_org',
        'blocked_reason', 'multi-org not supported',
        'existing_org_id', existing_org_id,
        'requested_org_id', p_org_id,
        'occurred_at', now()
      )
    );

    raise exception 'multi-org not supported';
  end if;

  membership_existed := exists (
    select 1
    from org_members
    where org_members.org_id = p_org_id
      and org_members.user_id = p_user_id
  );

  if membership_existed then
    select org_members.role
      into role_before
    from org_members
    where org_members.org_id = p_org_id
      and org_members.user_id = p_user_id;

    update org_members
    set role = normalized_role
    where org_members.org_id = p_org_id
      and org_members.user_id = p_user_id
    returning * into membership_row;
  else
    role_before := 'none';

    insert into org_members (org_id, user_id, role, created_by)
    values (p_org_id, p_user_id, normalized_role, actor_id)
    returning * into membership_row;
  end if;

  insert into audit_logs (org_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (
    p_org_id,
    actor_id,
    case when membership_existed then 'org_membership_role_updated' else 'org_membership_created' end,
    'org_member',
    p_user_id,
    jsonb_build_object(
      'target_user_id', p_user_id,
      'role_before', role_before,
      'role_after', normalized_role,
      'path', case when membership_existed then 'update' else 'insert' end,
      'source', 'assign_user_to_org',
      'occurred_at', now()
    )
  );

  return membership_row;
end;
$$;

grant execute on function get_current_org_context() to authenticated;
grant execute on function assign_user_to_org(uuid, uuid, text) to authenticated;
