-- SP2 1a: creator schema — four tables
-- creators: one row per auth user (bootstrapped by trigger in migration 000014)
create table public.creators (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  status       text not null default 'onboarding' check (status in ('onboarding','active')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- creator_social_handles: instagram / youtube / threads handles for a creator
create table public.creator_social_handles (
  id         uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.creators(id) on delete cascade,
  platform   text not null check (platform in ('instagram','youtube','threads')),
  handle     text not null,
  url        text,
  created_at timestamptz not null default now(),
  unique (creator_id, platform)
);

create index creator_social_handles_creator_idx
  on public.creator_social_handles (creator_id);

-- creator_scan_jobs: background analysis jobs (service_role writes; owner reads)
create table public.creator_scan_jobs (
  id           uuid primary key default gen_random_uuid(),
  creator_id   uuid not null references public.creators(id) on delete cascade,
  status       text not null default 'queued'
                 check (status in ('queued','fetching','analyzing','ready','failed')),
  progress     jsonb not null default '{}',
  error        text,
  started_at   timestamptz,
  completed_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index creator_scan_jobs_creator_idx
  on public.creator_scan_jobs (creator_id);

create index creator_scan_jobs_creator_created_idx
  on public.creator_scan_jobs (creator_id, created_at desc);

-- creator_dna: AI-generated creator profile (service_role inserts; owner reads + updates final)
create table public.creator_dna (
  id             uuid primary key default gen_random_uuid(),
  creator_id     uuid not null unique references public.creators(id) on delete cascade,
  status         text not null default 'draft'
                   check (status in ('draft','published')),
  ai_draft       jsonb,
  final          jsonb,
  source         jsonb,
  scan_job_id    uuid references public.creator_scan_jobs(id) on delete set null,
  draft_ready_at timestamptz,
  model          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  -- invariant: published requires a final value
  check (status <> 'published' or final is not null)
);
