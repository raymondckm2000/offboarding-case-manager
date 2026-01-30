create or replace function is_org_member(check_org_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from org_members
    where org_members.org_id = check_org_id
      and org_members.user_id = auth.uid()
  );
$$;

create or replace function is_org_admin(check_org_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from org_members
    where org_members.org_id = check_org_id
      and org_members.user_id = auth.uid()
      and org_members.role in ('owner', 'admin')
  );
$$;

create or replace function case_has_incomplete_required_tasks(check_case_id uuid, check_org_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from tasks
    where tasks.case_id = check_case_id
      and tasks.org_id = check_org_id
      and tasks.is_required
      and tasks.status <> 'complete'
  );
$$;

create or replace function enforce_task_required_protection()
returns trigger
language plpgsql
security definer
as $$
begin
  if new.is_required is distinct from old.is_required then
    if not is_org_admin(old.org_id) then
      raise exception 'is_required can only be changed by org owners or admins';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists tasks_is_required_guard on tasks;
create trigger tasks_is_required_guard
before update on tasks
for each row
execute function enforce_task_required_protection();

alter table orgs enable row level security;
alter table org_members enable row level security;
alter table offboarding_cases enable row level security;
alter table tasks enable row level security;
alter table evidence enable row level security;

create policy orgs_select
on orgs
for select
to authenticated
using (is_org_member(id));

create policy orgs_insert
on orgs
for insert
to authenticated
with check (created_by = auth.uid());

create policy orgs_update
on orgs
for update
to authenticated
using (is_org_admin(id))
with check (is_org_admin(id));

create policy orgs_delete
on orgs
for delete
to authenticated
using (is_org_admin(id));

create policy org_members_select
on org_members
for select
to authenticated
using (is_org_member(org_id));

create policy org_members_insert_owner
on org_members
for insert
to authenticated
with check (
  user_id = auth.uid()
  and role = 'owner'
  and exists (
    select 1
    from orgs
    where orgs.id = org_members.org_id
      and orgs.created_by = auth.uid()
  )
);

create policy org_members_insert_admin
on org_members
for insert
to authenticated
with check (is_org_admin(org_id));

create policy org_members_update
on org_members
for update
to authenticated
using (is_org_admin(org_id))
with check (is_org_admin(org_id));

create policy org_members_delete
on org_members
for delete
to authenticated
using (is_org_admin(org_id));

create policy offboarding_cases_select
on offboarding_cases
for select
to authenticated
using (is_org_member(org_id));

create policy offboarding_cases_insert
on offboarding_cases
for insert
to authenticated
with check (
  is_org_member(org_id)
  and created_by = auth.uid()
);

create policy offboarding_cases_update
on offboarding_cases
for update
to authenticated
using (is_org_member(org_id))
with check (
  is_org_member(org_id)
  and (
    status <> 'closed'
    or not case_has_incomplete_required_tasks(id, org_id)
  )
);

create policy offboarding_cases_delete
on offboarding_cases
for delete
to authenticated
using (is_org_member(org_id));

create policy tasks_select
on tasks
for select
to authenticated
using (is_org_member(org_id));

create policy tasks_insert
on tasks
for insert
to authenticated
with check (
  is_org_member(org_id)
  and created_by = auth.uid()
);

create policy tasks_update
on tasks
for update
to authenticated
using (is_org_member(org_id))
with check (is_org_member(org_id));

create policy tasks_delete
on tasks
for delete
to authenticated
using (is_org_member(org_id));

create policy evidence_select
on evidence
for select
to authenticated
using (is_org_member(org_id));

create policy evidence_insert
on evidence
for insert
to authenticated
with check (
  is_org_member(org_id)
  and created_by = auth.uid()
);

create policy evidence_update
on evidence
for update
to authenticated
using (is_org_member(org_id))
with check (is_org_member(org_id));

create policy evidence_delete
on evidence
for delete
to authenticated
using (is_org_member(org_id));
