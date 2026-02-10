create or replace function is_platform_admin()
returns boolean
language sql
stable
as $$
  select coalesce(
    (auth.jwt() -> 'app_metadata' ->> 'platform_admin')::boolean,
    false
  );
$$;

drop function if exists admin_inspect_user(text, uuid);

create or replace function admin_inspect_user(
  p_email text default null,
  p_user_id uuid default null
)
returns table (
  user_id uuid,
  email text,
  is_platform_admin boolean,
  org_id uuid,
  role text,
  org_count integer,

  org_not_set boolean,
  error_code text,
  error_message text

  org_not_set boolean

)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not is_platform_admin() then
    raise exception 'admin access required';
  end if;

  if p_email is null and p_user_id is null then
    raise exception 'email or user_id required';
  end if;


  begin
    return query
    with target_user as (
      select auth.users.id, auth.users.email
      from auth.users
      where (p_user_id is null or auth.users.id = p_user_id)
        and (p_email is null or lower(auth.users.email) = lower(p_email))
      limit 1
    ),
    membership as (
      select org_members.org_id, org_members.role
      from org_members
      join target_user on org_members.user_id = target_user.id
    ),
    counts as (
      select count(*)::int as membership_count
      from membership
    )
    select
      target_user.id,
      target_user.email,
      case
        when coalesce(lower(au.raw_app_meta_data ->> 'platform_admin'), '') in ('true', 't', '1', 'yes', 'y') then true
        else false
      end as is_platform_admin,
      membership.org_id,
      membership.role,
      counts.membership_count as org_count,
      counts.membership_count = 0 as org_not_set,
      null::text as error_code,
      null::text as error_message
    from target_user
    join auth.users as au on au.id = target_user.id
    left join membership on true
    cross join counts;
  exception
    when others then
      return query
      select
        null::uuid as user_id,
        null::text as email,
        null::boolean as is_platform_admin,
        null::uuid as org_id,
        null::text as role,
        null::integer as org_count,
        null::boolean as org_not_set,
        SQLSTATE::text as error_code,
        left(SQLERRM, 200)::text as error_message;
  end;

  return query
  with target_user as (
    select auth.users.id, auth.users.email
    from auth.users
    where (p_user_id is null or auth.users.id = p_user_id)
      and (p_email is null or lower(auth.users.email) = lower(p_email))
    limit 1
  ),
  membership as (
    select org_members.org_id, org_members.role
    from org_members
    join target_user on org_members.user_id = target_user.id
  ),
  counts as (
    select count(*)::int as membership_count
    from membership
  )
  select
    target_user.id,
    target_user.email,
    coalesce((au.raw_app_meta_data ->> 'platform_admin')::boolean, false) as is_platform_admin,
    membership.org_id,
    membership.role,
    counts.membership_count as org_count,
    counts.membership_count = 0 as org_not_set
  from target_user
  join auth.users as au on au.id = target_user.id
  left join membership on true
  cross join counts;

end;
$$;

create or replace function admin_inspect_org(p_org_id uuid)
returns table (
  org_id uuid,
  member_count integer,
  case_count integer,
  cases_without_members boolean,
  members_without_cases boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member_count integer;
  v_case_count integer;
begin
  if not is_platform_admin() then
    raise exception 'admin access required';
  end if;

  select count(*)::int
    into v_member_count
    from org_members
    where org_members.org_id = p_org_id;

  select count(*)::int
    into v_case_count
    from offboarding_cases
    where offboarding_cases.org_id = p_org_id;

  return query
  select
    p_org_id,
    v_member_count,
    v_case_count,
    (v_case_count > 0 and v_member_count = 0),
    (v_member_count > 0 and v_case_count = 0);
end;
$$;

create or replace function admin_access_check(
  p_user_id uuid,
  p_case_id uuid
)
returns table (
  user_id uuid,
  case_id uuid,
  case_org_id uuid,
  is_visible boolean,
  reason text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_case_org_id uuid;
  v_membership_count integer;
begin
  if not is_platform_admin() then
    raise exception 'admin access required';
  end if;

  select offboarding_cases.org_id
    into v_case_org_id
    from offboarding_cases
    where offboarding_cases.id = p_case_id
    limit 1;

  select count(*)::int
    into v_membership_count
    from org_members
    where org_members.user_id = p_user_id;

  if v_membership_count = 0 then
    return query select p_user_id, p_case_id, v_case_org_id, false, 'no_org_membership';
    return;
  end if;

  if v_case_org_id is null then
    return query select p_user_id, p_case_id, null, false, 'case_not_found';
    return;
  end if;

  if exists (
    select 1
    from org_members
    where org_members.user_id = p_user_id
      and org_members.org_id = v_case_org_id
  ) then
    return query select p_user_id, p_case_id, v_case_org_id, true, 'visible';
  else
    return query select p_user_id, p_case_id, v_case_org_id, false, 'org_mismatch';
  end if;
end;
$$;

create or replace function admin_reporting_sanity(p_org_id uuid)
returns table (
  org_id uuid,
  case_count integer,
  reporting_case_sla_count integer,
  reporting_case_escalation_count integer,
  reporting_empty boolean,
  reporting_empty_reason text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_case_count integer;
  v_sla_count integer;
  v_escalation_count integer;
begin
  if not is_platform_admin() then
    raise exception 'admin access required';
  end if;

  select count(*)::int
    into v_case_count
    from offboarding_cases
    where offboarding_cases.org_id = p_org_id;

  select count(*)::int
    into v_sla_count
    from reporting_case_sla
    join offboarding_cases
      on offboarding_cases.id = reporting_case_sla.case_id
    where offboarding_cases.org_id = p_org_id;

  select count(*)::int
    into v_escalation_count
    from reporting_case_escalation
    join offboarding_cases
      on offboarding_cases.id = reporting_case_escalation.case_id
    where offboarding_cases.org_id = p_org_id;

  return query
  select
    p_org_id,
    v_case_count,
    v_sla_count,
    v_escalation_count,
    (v_sla_count = 0 and v_escalation_count = 0),
    case
      when v_case_count = 0 then 'no_cases'
      when v_sla_count = 0 and v_escalation_count = 0 then 'reporting_empty_with_cases'
      else 'reporting_present'
    end;
end;
$$;

grant execute on function is_platform_admin() to authenticated;
grant execute on function admin_inspect_user(text, uuid) to authenticated;
grant execute on function admin_inspect_org(uuid) to authenticated;
grant execute on function admin_access_check(uuid, uuid) to authenticated;
grant execute on function admin_reporting_sanity(uuid) to authenticated;
