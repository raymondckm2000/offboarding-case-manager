-- Sprint 25: invite flow for single-org onboarding

create extension if not exists "pgcrypto";

create table if not exists org_invites (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  email text,
  code text not null unique,
  role_to_assign text not null check (role_to_assign in ('owner', 'admin', 'member')),
  expires_at timestamptz not null,
  redeemed_at timestamptz,
  redeemed_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id),
  constraint org_invites_email_format check (email is null or position('@' in email) > 1)
);

create index if not exists org_invites_org_id_idx on org_invites (org_id);
create index if not exists org_invites_code_idx on org_invites (code);
create index if not exists org_invites_active_idx on org_invites (expires_at, redeemed_at);

alter table org_invites enable row level security;

create or replace function create_invite(
  p_email text,
  p_role text
)
returns table (
  org_id uuid,
  invite_code text,
  role_to_assign text,
  expires_at timestamptz,
  email text
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  actor_id uuid;
  normalized_role text;
  normalized_email text;
  context_row record;
  generated_code text;
  expiry timestamptz;
begin
  actor_id := auth.uid();
  if actor_id is null then
    raise exception 'access denied';
  end if;

  select * into context_row from get_current_org_context();
  if context_row.org_id is null then
    raise exception 'access denied';
  end if;

  if lower(coalesce(context_row.role, '')) not in ('owner', 'admin') then
    raise exception 'access denied';
  end if;

  normalized_role := lower(trim(coalesce(p_role, '')));
  if normalized_role not in ('owner', 'admin', 'member') then
    raise exception 'invalid role';
  end if;

  normalized_email := nullif(lower(trim(coalesce(p_email, ''))), '');

  generated_code := encode(gen_random_bytes(18), 'hex');
  expiry := now() + interval '7 days';

  insert into org_invites (org_id, email, code, role_to_assign, expires_at, created_by)
  values (context_row.org_id, normalized_email, generated_code, normalized_role, expiry, actor_id);

  insert into audit_logs (org_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (
    context_row.org_id,
    actor_id,
    'org_invite_created',
    'org_invite',
    actor_id,
    jsonb_build_object(
      'invite_code', generated_code,
      'email', normalized_email,
      'role_to_assign', normalized_role,
      'expires_at', expiry,
      'occurred_at', now()
    )
  );

  return query
  select context_row.org_id, generated_code, normalized_role, expiry, normalized_email;
end;
$$;

create or replace function redeem_invite(
  p_code text
)
returns org_members
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  actor_id uuid;
  normalized_code text;
  invite_row org_invites;
  membership_row org_members;
  existing_membership org_members;
begin
  actor_id := auth.uid();
  if actor_id is null then
    raise exception 'access denied';
  end if;

  normalized_code := lower(trim(coalesce(p_code, '')));
  if normalized_code = '' then
    raise exception 'invalid code';
  end if;

  select *
    into invite_row
  from org_invites
  where code = normalized_code
  limit 1;

  if invite_row.id is null then
    raise exception 'invalid code';
  end if;

  if invite_row.redeemed_at is not null then
    raise exception 'already redeemed';
  end if;

  if invite_row.expires_at <= now() then
    raise exception 'expired';
  end if;

  if invite_row.email is not null and not exists (
    select 1
    from auth.users
    where auth.users.id = actor_id
      and lower(auth.users.email) = invite_row.email
  ) then
    raise exception 'access denied';
  end if;

  select * into existing_membership
  from org_members
  where user_id = actor_id
  order by created_at asc
  limit 1;

  if existing_membership.org_id is not null and existing_membership.org_id <> invite_row.org_id then
    raise exception 'multi-org not supported';
  end if;

  insert into org_members (org_id, user_id, role, created_by)
  values (invite_row.org_id, actor_id, invite_row.role_to_assign, actor_id)
  on conflict (org_id, user_id)
  do update set role = excluded.role
  returning * into membership_row;

  update org_invites
  set redeemed_at = now(),
      redeemed_by = actor_id
  where id = invite_row.id;

  insert into audit_logs (org_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (
    invite_row.org_id,
    actor_id,
    'org_invite_redeemed',
    'org_invite',
    actor_id,
    jsonb_build_object(
      'invite_code', invite_row.code,
      'invite_email', invite_row.email,
      'role_assigned', membership_row.role,
      'occurred_at', now()
    )
  );

  return membership_row;
end;
$$;

grant execute on function create_invite(text, text) to authenticated;
grant execute on function redeem_invite(text) to authenticated;
