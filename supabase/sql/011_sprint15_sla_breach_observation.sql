-- Sprint 15 migration: SLA breach observation + audit

create unique index if not exists audit_logs_case_sla_breached_unique
on audit_logs (org_id, entity_type, entity_id, action)
where action = 'case_sla_breached'
  and entity_type = 'offboarding_case';

create or replace function log_case_sla_breach_if_needed(
  p_case_id uuid,
  p_org_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  case_status text;
  case_created_at timestamptz;
  close_days integer;
  breach_due_at timestamptz;
  is_breached boolean;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  if not is_org_admin(p_org_id) then
    raise exception 'insufficient permissions to log sla breach';
  end if;

  select offboarding_cases.status, offboarding_cases.created_at
    into case_status, case_created_at
  from offboarding_cases
  where id = p_case_id
    and org_id = p_org_id;

  if not found then
    return false;
  end if;

  if case_status = 'closed' then
    return false;
  end if;

  select coalesce(sla_policies.time_to_close_days, 10)
    into close_days
  from orgs
  left join sla_policies
    on sla_policies.org_id = orgs.id
  where orgs.id = p_org_id;

  if not found then
    return false;
  end if;

  breach_due_at := case_created_at + make_interval(days => close_days);
  is_breached := now() > breach_due_at;

  if not is_breached then
    return false;
  end if;

  insert into audit_logs (org_id, actor_user_id, action, entity_type, entity_id, metadata)
  select
    p_org_id,
    auth.uid(),
    'case_sla_breached',
    'offboarding_case',
    p_case_id,
    jsonb_build_object(
      'baseline_at', case_created_at,
      'breach_due_at', breach_due_at,
      'threshold_days', close_days,
      'evaluated_at', now()
    )
  where not exists (
    select 1
    from audit_logs
    where org_id = p_org_id
      and entity_type = 'offboarding_case'
      and entity_id = p_case_id
      and action = 'case_sla_breached'
  );

  return true;
end;
$$;

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
    end as closed_at
  from offboarding_cases
  join org_policies
    on org_policies.org_id = offboarding_cases.org_id
  left join review_signoffs
    on review_signoffs.case_id = offboarding_cases.id
   and review_signoffs.org_id = offboarding_cases.org_id
  left join case_closures
    on case_closures.case_id = offboarding_cases.id
   and case_closures.org_id = offboarding_cases.org_id
  where is_org_member(offboarding_cases.org_id)
)
select
  case_base.case_id,
  case_base.org_id,
  case_base.status,
  case_base.created_at,
  case_base.time_to_review_days,
  case_base.time_to_close_days,
  case_base.review_due_at,
  case_base.signoff_at as review_completed_at,
  (
    (case_base.signoff_at is null and now() > case_base.review_due_at)
    or (case_base.signoff_at is not null and case_base.signoff_at > case_base.review_due_at)
  ) as review_violation,
  case_base.close_due_at,
  case_base.closed_at as close_completed_at,
  (
    (case_base.closed_at is null and now() > case_base.close_due_at)
    or (case_base.closed_at is not null and case_base.closed_at > case_base.close_due_at)
  ) as close_violation,
  case
    when case_base.status = 'closed' then false
    else now() > case_base.close_due_at
  end as sla_breached,
  case
    when case_base.status = 'closed' then null
    when now() > case_base.close_due_at then case_base.close_due_at
    else null
  end as sla_breached_at,
  case_base.created_at as sla_breach_baseline_at,
  case_base.time_to_close_days as sla_breach_threshold_days
from case_base;

grant select on reporting_case_sla to authenticated;
