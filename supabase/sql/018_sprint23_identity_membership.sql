-- Sprint 23: membership-based identity source for UI role/org display and gating

create or replace function get_current_identity_membership()
returns table (
  org_id uuid,
  org_name text,
  role text
)
language sql
security definer
set search_path = public
as $$
  with my_memberships as (
    select org_members.org_id,
           orgs.name as org_name,
           org_members.role,
           case when org_members.role in ('owner', 'admin') then 0 else 1 end as priority
    from org_members
    join orgs on orgs.id = org_members.org_id
    where org_members.user_id = auth.uid()
  )
  select my_memberships.org_id,
         my_memberships.org_name,
         my_memberships.role
  from my_memberships
  order by my_memberships.priority asc,
           my_memberships.org_name asc,
           my_memberships.org_id asc
  limit 1;
$$;

grant execute on function get_current_identity_membership() to authenticated;
