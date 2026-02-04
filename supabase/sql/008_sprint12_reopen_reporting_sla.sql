-- Sprint 12 migration: case reopen, reporting (read-only), SLA definitions + violations

create table if not exists sla_policies (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  time_to_review_days integer not null default 5 check (time_to_review_days > 0),
  time_to_close_days integer not null default 10 check (time_to_close_days > 0),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  unique (org_id)
);

alter table sla_policies enable row level security;

drop policy if exists sla_policies_select on sla_policies;
create policy sla_policies_select
on sla_policies
for select
to authenticated
using (is_org_member(org_id));

drop policy if exists sla_policies_insert on sla_policies;
create policy sla_policies_insert
on sla_policies
for insert
to authenticated
with check (is_org_admin(org_id));

drop policy if exists sla_policies_update on sla_policies;
create policy sla_policies_update
on sla_policies
for update
to authenticated
using (is_org_admin(org_id))
with check (is_org_admin(org_id));

drop policy if exists sla_policies_delete on sla_policies;
create policy sla_policies_delete
on sla_policies
for delete
to authenticated
using (is_org_admin(org_id));

insert into sla_policies (org_id, time_to_review_days, time_to_close_days, created_by)
select orgs.id, 5, 10, orgs.created_by
from orgs
where not exists (
  select 1
  from sla_policies
  where sla_policies.org_id = orgs.id
);

create or replace function reopen_offboarding_case(p_case_id uuid, p_org_id uuid, p_reason text)
returns offboarding_cases
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_case offboarding_cases;
  actor_id uuid;
  current_status text;
begin
  actor_id := auth.uid();

  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'reopen reason is required';
  end if;

  select status
    into current_status
  from offboarding_cases
  where id = p_case_id
    and org_id = p_org_id
  for update;

  if not found then
    raise exception 'case not found';
  end if;

  if current_status <> 'closed' then
    raise exception 'case must be closed before reopen';
  end if;

  if not (is_org_admin(p_org_id) or is_case_reviewer(p_case_id, p_org_id)) then
    raise exception 'insufficient permissions to reopen case';
  end if;

  perform set_config('app.case_reopen', 'true', true);

  update offboarding_cases
  set status = 'reopened'
  where id = p_case_id
    and org_id = p_org_id
  returning * into updated_case;

  insert into audit_logs (org_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (
    p_org_id,
    actor_id,
    'case_reopened',
    'offboarding_case',
    p_case_id,
    jsonb_build_object(
      'status_before', current_status,
      'reason', p_reason,
      'reopened_at', now()
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
declare
  actor_id uuid;
begin
  if old.status = 'closed' then
    if new.status = 'reopened' then
      if current_setting('app.case_reopen', true) is distinct from 'true' then
        raise exception 'case reopen must use reopen_offboarding_case';
      end if;
      return new;
    end if;
    raise exception 'closed cases are immutable';
  end if;

  if new.status = 'closed' then
    actor_id := auth.uid();

    if not (is_org_admin(old.org_id) or is_case_reviewer(old.id, old.org_id)) then
      raise exception 'insufficient permissions to close case';
    end if;

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

drop trigger if exists offboarding_cases_closure_gate on offboarding_cases;
create trigger offboarding_cases_closure_gate
before update on offboarding_cases
for each row
execute function enforce_case_closure_gate();

create or replace view reporting_org_case_summary as
with case_closures as (
  select
    audit_logs.org_id,
    audit_logs.entity_id as case_id,
    max(audit_logs.created_at) as closed_at
  from audit_logs
  where audit_logs.entity_type = 'offboarding_case'
    and audit_logs.action in ('case_closed', 'case_closure', 'case.close')
  group by audit_logs.org_id, audit_logs.entity_id
),
case_reopens as (
  select
    audit_logs.org_id,
    audit_logs.entity_id as case_id,
    count(*) as reopen_count
  from audit_logs
  where audit_logs.entity_type = 'offboarding_case'
    and audit_logs.action = 'case_reopened'
  group by audit_logs.org_id, audit_logs.entity_id
)
select
  offboarding_cases.org_id,
  count(*) as total_cases,
  count(*) filter (where offboarding_cases.status = 'closed') as closed_cases,
  count(*) filter (where offboarding_cases.status = 'reopened') as reopened_cases,
  count(*) filter (where offboarding_cases.status not in ('closed', 'reopened')) as open_cases,
  coalesce(sum(case_reopens.reopen_count), 0) as reopen_events_count,
  count(*) filter (where case_reopens.reopen_count is not null) as reopened_case_count,
  case
    when count(*) = 0 then 0
    else round(
      count(*) filter (where case_reopens.reopen_count is not null)::numeric
      / count(*)::numeric,
      4
    )
  end as reopened_case_ratio,
  round(
    avg(extract(epoch from (case_closures.closed_at - offboarding_cases.created_at)) / 3600.0)
      filter (where case_closures.closed_at is not null)::numeric,
    2
  ) as avg_hours_to_close
from offboarding_cases
left join case_closures
  on case_closures.case_id = offboarding_cases.id
 and case_closures.org_id = offboarding_cases.org_id
left join case_reopens
  on case_reopens.case_id = offboarding_cases.id
 and case_reopens.org_id = offboarding_cases.org_id
where is_org_member(offboarding_cases.org_id)
group by offboarding_cases.org_id;

create or replace view reporting_reviewer_throughput as
with case_closures as (
  select
    audit_logs.org_id,
    audit_logs.entity_id as case_id,
    max(audit_logs.created_at) as closed_at
  from audit_logs
  where audit_logs.entity_type = 'offboarding_case'
    and audit_logs.action in ('case_closed', 'case_closure', 'case.close')
  group by audit_logs.org_id, audit_logs.entity_id
)
select
  offboarding_cases.org_id,
  offboarding_cases.reviewer_user_id,
  count(*) as closed_case_count,
  max(case_closures.closed_at) as last_closed_at
from offboarding_cases
join case_closures
  on case_closures.case_id = offboarding_cases.id
 and case_closures.org_id = offboarding_cases.org_id
where offboarding_cases.reviewer_user_id is not null
  and is_org_member(offboarding_cases.org_id)
group by offboarding_cases.org_id, offboarding_cases.reviewer_user_id;

create or replace view reporting_case_sla as
with org_policies as (
  select
    orgs.id as org_id,
    coalesce(sla_policies.time_to_review_days, 5) as time_to_review_days,
    coalesce(sla_policies.time_to_close_days, 10) as time_to_close_days
  from orgs
  left join sla_policies
    on sla_policies.org_id = orgs.id
),
review_signoffs as (
  select
    reviewer_signoffs.org_id,
    reviewer_signoffs.case_id,
    min(reviewer_signoffs.created_at) as signoff_at
  from reviewer_signoffs
  group by reviewer_signoffs.org_id, reviewer_signoffs.case_id
),
case_closures as (
  select
    audit_logs.org_id,
    audit_logs.entity_id as case_id,
    max(audit_logs.created_at) as closed_at
  from audit_logs
  where audit_logs.entity_type = 'offboarding_case'
    and audit_logs.action in ('case_closed', 'case_closure', 'case.close')
  group by audit_logs.org_id, audit_logs.entity_id
),
case_reopens as (
  select
    audit_logs.org_id,
    audit_logs.entity_id as case_id,
    max(audit_logs.created_at) as reopened_at
  from audit_logs
  where audit_logs.entity_type = 'offboarding_case'
    and audit_logs.action = 'case_reopened'
  group by audit_logs.org_id, audit_logs.entity_id
),
case_base as (
  select
    offboarding_cases.id as case_id,
    offboarding_cases.org_id,
    offboarding_cases.status,
    offboarding_cases.created_at,
    org_policies.time_to_review_days,
    org_policies.time_to_close_days,
    offboarding_cases.created_at
      + make_interval(days => org_policies.time_to_review_days) as review_due_at,
    offboarding_cases.created_at
      + make_interval(days => org_policies.time_to_close_days) as close_due_at,
    review_signoffs.signoff_at,
    case
      when offboarding_cases.status = 'closed' then case_closures.closed_at
      else null
    end as closed_at,
    case_reopens.reopened_at
  from offboarding_cases
  join org_policies
    on org_policies.org_id = offboarding_cases.org_id
  left join review_signoffs
    on review_signoffs.case_id = offboarding_cases.id
   and review_signoffs.org_id = offboarding_cases.org_id
  left join case_closures
    on case_closures.case_id = offboarding_cases.id
   and case_closures.org_id = offboarding_cases.org_id
  left join case_reopens
    on case_reopens.case_id = offboarding_cases.id
   and case_reopens.org_id = offboarding_cases.org_id
  where is_org_member(offboarding_cases.org_id)
)
select
  case_id,
  org_id,
  status,
  created_at,
  time_to_review_days,
  time_to_close_days,
  review_due_at,
  signoff_at as review_completed_at,
  (
    (signoff_at is null and now() > review_due_at)
    or (signoff_at is not null and signoff_at > review_due_at)
  ) as review_violation,
  close_due_at,
  closed_at as close_completed_at,
  (
    (closed_at is null and now() > close_due_at)
    or (closed_at is not null and closed_at > close_due_at)
  ) as close_violation,
  reopened_at as last_reopened_at
from case_base;

grant select on reporting_org_case_summary to authenticated;
grant select on reporting_reviewer_throughput to authenticated;
grant select on reporting_case_sla to authenticated;
