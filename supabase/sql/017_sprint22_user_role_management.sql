-- Sprint 22: owner/admin user role management (no UUID manual input required by UI)

create or replace function list_manageable_orgs()
returns table (
  org_id uuid,
  org_name text,
  actor_role text
)
language sql
security definer
set search_path = public
as $$
  select orgs.id as org_id,
         orgs.name as org_name,
         org_members.role as actor_role
  from org_members
  join orgs on orgs.id = org_members.org_id
  where org_members.user_id = auth.uid()
    and org_members.role in ('owner', 'admin')
  order by orgs.name asc, orgs.id asc;
$$;

create or replace function search_users_by_email(p_email_query text)
returns table (
  user_id uuid,
  email text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid;
  normalized_query text;
begin
  actor_id := auth.uid();

  if actor_id is null then
    raise exception 'access denied';
  end if;

  if not exists (
    select 1
    from org_members
    where org_members.user_id = actor_id
      and org_members.role in ('owner', 'admin')
  ) then
    raise exception 'access denied';
  end if;

  normalized_query := trim(coalesce(p_email_query, ''));

  if normalized_query = '' then
    return;
  end if;

  return query
  select auth.users.id as user_id,
         auth.users.email
  from auth.users
  where auth.users.email is not null
    and auth.users.email ilike '%' || normalized_query || '%'
  order by auth.users.email asc
  limit 20;
end;
$$;

create or replace function list_roles()
returns table (
  role text
)
language sql
stable
as $$
  select unnest(array['owner'::text, 'admin'::text, 'member'::text]) as role;
$$;

create or replace function assign_user_to_org(
  p_user_id uuid,
  p_org_id uuid,
  p_role text
)
returns org_members
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid;
  normalized_role text;
  membership_row org_members;
  membership_existed boolean;
  role_before text;
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

grant execute on function list_manageable_orgs() to authenticated;
grant execute on function search_users_by_email(text) to authenticated;
grant execute on function list_roles() to authenticated;
grant execute on function assign_user_to_org(uuid, uuid, text) to authenticated;
