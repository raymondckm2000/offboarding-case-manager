-- Sprint 16 migration: SLA escalation action layer (state + audit + outbox)

create table if not exists case_escalations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id),
  case_id uuid not null references offboarding_cases(id),
  breach_audit_id uuid not null references audit_logs(id),
  escalation_level text not null check (escalation_level in ('L1', 'L2', 'L3')),
  created_at timestamptz not null default now(),
  created_by uuid not null,
  acknowledged_at timestamptz null,
  acknowledged_by uuid null,
  unique (org_id, case_id, escalation_level)
);

create index if not exists case_escalations_org_case_idx
  on case_escalations (org_id, case_id);

create index if not exists case_escalations_org_level_created_idx
  on case_escalations (org_id, escalation_level, created_at desc);

alter table case_escalations enable row level security;

drop policy if exists case_escalations_select on case_escalations;
create policy case_escalations_select
  on case_escalations
  for select
  to authenticated
  using (is_org_member(org_id));

create table if not exists notification_outbox (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id),
  event_type text not null,
  entity_type text not null,
  entity_id uuid not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  processed_at timestamptz null
);

create unique index if not exists notification_outbox_unique_escalation
  on notification_outbox (
    org_id,
    event_type,
    entity_type,
    entity_id,
    (payload->>'escalation_level')
  );

alter table notification_outbox enable row level security;

drop policy if exists notification_outbox_select on notification_outbox;
create policy notification_outbox_select
  on notification_outbox
  for select
  to authenticated
  using (is_org_admin(org_id));

create or replace function escalate_case_sla_breach(
  p_case_id uuid,
  p_org_id uuid,
  p_level text
)
returns case_escalations
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid;
  case_status text;
  breach_audit_id uuid;
  breach_metadata jsonb;
  new_escalation case_escalations;
begin
  actor_id := auth.uid();

  if actor_id is null then
    raise exception 'authentication required';
  end if;

  if not is_org_admin(p_org_id) then
    raise exception 'insufficient permissions to escalate case';
  end if;

  if p_level not in ('L1', 'L2', 'L3') then
    raise exception 'invalid escalation level';
  end if;

  select offboarding_cases.status
    into case_status
  from offboarding_cases
  where id = p_case_id
    and org_id = p_org_id;

  if not found then
    raise exception 'case not found';
  end if;

  if case_status = 'closed' then
    raise exception 'case is closed';
  end if;

  select audit_logs.id, audit_logs.metadata
    into breach_audit_id, breach_metadata
  from audit_logs
  where org_id = p_org_id
    and entity_type = 'offboarding_case'
    and entity_id = p_case_id
    and action = 'case_sla_breached'
  order by audit_logs.created_at asc
  limit 1;

  if breach_audit_id is null then
    raise exception 'sla breach audit not found';
  end if;

  if exists (
    select 1
    from case_escalations
    where org_id = p_org_id
      and case_id = p_case_id
      and escalation_level = p_level
  ) then
    raise exception 'escalation already exists for level';
  end if;

  insert into case_escalations (
    org_id,
    case_id,
    breach_audit_id,
    escalation_level,
    created_by
  )
  values (
    p_org_id,
    p_case_id,
    breach_audit_id,
    p_level,
    actor_id
  )
  returning * into new_escalation;

  insert into audit_logs (org_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (
    p_org_id,
    actor_id,
    'case_escalated',
    'offboarding_case',
    p_case_id,
    jsonb_build_object(
      'level', p_level,
      'breach_audit_id', breach_audit_id,
      'triggered_at', now()
    )
  );

  insert into notification_outbox (
    org_id,
    event_type,
    entity_type,
    entity_id,
    payload
  )
  values (
    p_org_id,
    'case_escalated',
    'offboarding_case',
    p_case_id,
    jsonb_build_object(
      'org_id', p_org_id,
      'case_id', p_case_id,
      'escalation_level', p_level,
      'breach_audit_id', breach_audit_id,
      'breach_due_at', breach_metadata->'breach_due_at',
      'baseline_at', breach_metadata->'baseline_at',
      'triggered_at', now()
    )
  );

  return new_escalation;
end;
$$;

create or replace function ack_case_escalation(
  p_case_id uuid,
  p_org_id uuid,
  p_level text
)
returns case_escalations
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid;
  updated_escalation case_escalations;
begin
  actor_id := auth.uid();

  if actor_id is null then
    raise exception 'authentication required';
  end if;

  if not is_org_admin(p_org_id) then
    raise exception 'insufficient permissions to acknowledge escalation';
  end if;

  if p_level not in ('L1', 'L2', 'L3') then
    raise exception 'invalid escalation level';
  end if;

  select *
    into updated_escalation
  from case_escalations
  where org_id = p_org_id
    and case_id = p_case_id
    and escalation_level = p_level
  for update;

  if not found then
    raise exception 'escalation not found';
  end if;

  if updated_escalation.acknowledged_at is not null then
    raise exception 'escalation already acknowledged';
  end if;

  update case_escalations
  set acknowledged_at = now(),
      acknowledged_by = actor_id
  where id = updated_escalation.id
  returning * into updated_escalation;

  insert into audit_logs (org_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (
    p_org_id,
    actor_id,
    'case_escalation_acknowledged',
    'offboarding_case',
    p_case_id,
    jsonb_build_object(
      'level', p_level,
      'acknowledged_at', updated_escalation.acknowledged_at
    )
  );

  return updated_escalation;
end;
$$;

create or replace view reporting_case_escalation as
with latest_escalations as (
  select distinct on (org_id, case_id)
    org_id,
    case_id,
    escalation_level,
    created_at,
    acknowledged_at
  from case_escalations
  order by org_id, case_id, created_at desc
)
select
  latest_escalations.case_id,
  latest_escalations.org_id,
  latest_escalations.escalation_level as latest_escalation_level,
  latest_escalations.created_at as latest_escalated_at,
  latest_escalations.acknowledged_at as latest_acknowledged_at,
  (latest_escalations.acknowledged_at is not null) as is_acknowledged
from latest_escalations
where is_org_member(latest_escalations.org_id);

grant select on reporting_case_escalation to authenticated;
