-- Sprint 23 hotfix: align search_users_by_email() RETURN QUERY columns/types with signature

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
  select auth.users.id::uuid as user_id,
         auth.users.email::text as email
  from auth.users
  where auth.users.email is not null
    and auth.users.email ilike '%' || normalized_query || '%'
  order by auth.users.email asc
  limit 20;
end;
$$;

grant execute on function search_users_by_email(text) to authenticated;
