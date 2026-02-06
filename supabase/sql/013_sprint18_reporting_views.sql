-- Sprint 18 migration: reporting views for SLA + escalations

create or replace view reporting_case_sla as
with org_policies as (
  select
    orgs.id as org_id,
    coalesce(sla_policies.time_to_close_days, 10) as time_to_close_days
  from orgs
  left join sla_policies
    on sla_policies.org_id = orgs.id
),
case_base as (
  select
    offboarding_cases.id as case_id,
    offboarding_cases.status,
    offboarding_cases.created_at,
    org_policies.time_to_close_days,
    offboarding_cases.created_at
      + make_interval(days => org_policies.time_to_close_days) as close_due_at
  from offboarding_cases
  join org_policies
    on org_policies.org_id = offboarding_cases.org_id
)
select
  case_base.case_id,
  case_base.status,
  case
    when case_base.status = 'closed' then false
    else now() > case_base.close_due_at
  end as sla_breached
from case_base;

create or replace view reporting_case_escalation as
with latest_escalations as (
  select distinct on (case_escalations.org_id, case_escalations.case_id)
    case_escalations.org_id,
    case_escalations.case_id,
    case_escalations.escalation_level,
    case_escalations.created_at,
    case_escalations.acknowledged_at
  from case_escalations
  order by case_escalations.org_id, case_escalations.case_id, case_escalations.created_at desc
)
select
  offboarding_cases.id as case_id,
  latest_escalations.escalation_level as latest_escalation_level,
  (latest_escalations.acknowledged_at is not null) as is_acknowledged,
  latest_escalations.created_at as latest_escalated_at,
  latest_escalations.acknowledged_at as latest_acknowledged_at
from offboarding_cases
left join latest_escalations
  on latest_escalations.case_id = offboarding_cases.id
 and latest_escalations.org_id = offboarding_cases.org_id
;

grant select on reporting_case_sla to authenticated;
grant select on reporting_case_escalation to authenticated;

alter view reporting_case_sla enable row level security;
drop policy if exists reporting_case_sla_select on reporting_case_sla;
create policy reporting_case_sla_select
  on reporting_case_sla
  for select
  to authenticated
  using (
    exists (
      select 1
      from offboarding_cases
      where offboarding_cases.id = reporting_case_sla.case_id
        and is_org_member(offboarding_cases.org_id)
    )
  );

alter view reporting_case_escalation enable row level security;
drop policy if exists reporting_case_escalation_select on reporting_case_escalation;
create policy reporting_case_escalation_select
  on reporting_case_escalation
  for select
  to authenticated
  using (
    exists (
      select 1
      from offboarding_cases
      where offboarding_cases.id = reporting_case_escalation.case_id
        and is_org_member(offboarding_cases.org_id)
    )
  );
