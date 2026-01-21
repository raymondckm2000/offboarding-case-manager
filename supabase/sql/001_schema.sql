create extension if not exists "pgcrypto";

create table if not exists orgs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

create table if not exists org_members (
  org_id uuid not null references orgs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  primary key (org_id, user_id)
);

create table if not exists offboarding_cases (
  id uuid primary key default gen_random_uuid(),
  case_no text,
  employee_name text not null,
  dept text,
  position text,
  last_working_day date,
  status text not null default 'open',
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  org_id uuid not null references orgs(id) on delete cascade,
  unique (id, org_id)
);

create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null,
  title text not null,
  status text not null default 'open',
  is_required boolean not null default false,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  org_id uuid not null references orgs(id) on delete cascade,
  unique (id, org_id),
  constraint tasks_case_org_fk foreign key (case_id, org_id)
    references offboarding_cases(id, org_id) on delete cascade
);

create table if not exists evidence (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null,
  note text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  org_id uuid not null references orgs(id) on delete cascade,
  constraint evidence_task_org_fk foreign key (task_id, org_id)
    references tasks(id, org_id) on delete cascade
);
