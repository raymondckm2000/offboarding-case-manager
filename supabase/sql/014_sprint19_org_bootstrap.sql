create or replace function bootstrap_org_owner(p_org_id uuid)
returns org_members
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid;
  org_record orgs%rowtype;
  member_count integer;
  new_member org_members%rowtype;
begin
  actor_id := auth.uid();
  if actor_id is null then
    raise exception 'authentication required';
  end if;

  select *
    into org_record
    from orgs
   where id = p_org_id;

  if not found then
    raise exception 'org not found';
  end if;

  select count(*)
    into member_count
    from org_members
   where org_id = p_org_id;

  if member_count > 0 then
    raise exception 'org already has members';
  end if;

  if org_record.created_by is distinct from actor_id then
    raise exception 'only org creator can bootstrap membership';
  end if;

  insert into org_members (org_id, user_id, role, created_by)
  values (p_org_id, actor_id, 'owner', actor_id)
  returning * into new_member;

  return new_member;
end;
$$;

grant execute on function bootstrap_org_owner(uuid) to authenticated;

create or replace function add_org_member(
  p_org_id uuid,
  p_user_id uuid,
  p_role text default 'member'
)
returns org_members
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid;
  new_member org_members%rowtype;
begin
  actor_id := auth.uid();
  if actor_id is null then
    raise exception 'authentication required';
  end if;

  if not is_org_admin(p_org_id) then
    raise exception 'only org admins can add members';
  end if;

  if p_role not in ('admin', 'member') then
    raise exception 'role must be admin or member';
  end if;

  insert into org_members (org_id, user_id, role, created_by)
  values (p_org_id, p_user_id, p_role, actor_id)
  on conflict (org_id, user_id)
  do update set role = excluded.role
  returning * into new_member;

  return new_member;
end;
$$;

grant execute on function add_org_member(uuid, uuid, text) to authenticated;
