create table kinnso_internal.pilot_runs (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 200),
  status text not null default 'draft' check (status in ('draft', 'recruiting', 'paused', 'running', 'completed', 'cancelled')),
  data_classification text not null check (data_classification in ('synthetic', 'real')),
  candidate_release_sha text not null check (char_length(btrim(candidate_release_sha)) between 1 and 80),
  environment_origin text not null check (environment_origin ~ '^https?://[^/@?#[:space:]]+$'),
  acceptance_started_at timestamptz,
  minimum_published_guides integer not null default 3 check (minimum_published_guides >= 3),
  participation_notice_version text check (char_length(btrim(participation_notice_version)) between 1 and 120),
  privacy_notice_version text check (char_length(btrim(privacy_notice_version)) between 1 and 120),
  content_consent_version text check (char_length(btrim(content_consent_version)) between 1 and 120),
  coordinator_reference text check (char_length(btrim(coordinator_reference)) between 1 and 200),
  support_owner_reference text check (char_length(btrim(support_owner_reference)) between 1 and 200),
  privacy_owner_reference text check (char_length(btrim(privacy_owner_reference)) between 1 and 200),
  alert_owner_reference text check (char_length(btrim(alert_owner_reference)) between 1 and 200),
  private_channel_reference text check (char_length(btrim(private_channel_reference)) between 1 and 200),
  synthetic_rehearsal_run_id uuid references kinnso_internal.pilot_runs(id),
  created_by_ops_member_id uuid not null references public.kinnso_ops_members(id),
  revision integer not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pilot_runs_real_release_check check (
    data_classification <> 'real' or (candidate_release_sha ~ '^[0-9a-f]{40}$' and environment_origin like 'https://%')
  ),
  constraint pilot_runs_rehearsal_check check (
    synthetic_rehearsal_run_id is null or (data_classification = 'real' and synthetic_rehearsal_run_id <> id)
  )
);

-- All live states compete for one slot, even when the run is paused.
create unique index pilot_runs_one_active_idx on kinnso_internal.pilot_runs ((true))
  where status in ('recruiting', 'paused', 'running');
create index pilot_runs_rehearsal_idx on kinnso_internal.pilot_runs (synthetic_rehearsal_run_id);
create index pilot_runs_created_by_idx on kinnso_internal.pilot_runs (created_by_ops_member_id);

comment on column kinnso_internal.pilot_runs.candidate_release_sha is
  'Set at creation and immutable through the command interface, as is data_classification.';

create table kinnso_internal.pilot_participants (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references kinnso_internal.pilot_runs(id),
  role text not null check (role in ('traveller', 'creator', 'merchant')),
  display_label text not null check (char_length(btrim(display_label)) between 1 and 80),
  user_id uuid references auth.users(id),
  pilot_cohort_role text not null check (pilot_cohort_role in ('required_traveller', 'required_creator', 'required_merchant', 'observer')),
  status text not null default 'invited' check (status in ('invited', 'joined', 'active', 'paused', 'withdrawn', 'completed')),
  consent_version text check (char_length(btrim(consent_version)) between 1 and 120),
  consented_at timestamptz,
  revision integer not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (run_id, role, display_label),
  unique (run_id, id),
  constraint pilot_participants_cohort_matches_role check (
    pilot_cohort_role = 'observer' or pilot_cohort_role = 'required_' || role
  ),
  constraint pilot_participants_consent_pair check ((consent_version is null) = (consented_at is null))
);

create unique index pilot_participants_run_user_idx on kinnso_internal.pilot_participants (run_id, user_id)
  where user_id is not null;
create unique index pilot_participants_required_slot_idx on kinnso_internal.pilot_participants (run_id, pilot_cohort_role)
  where pilot_cohort_role <> 'observer' and status <> 'withdrawn';
create index pilot_participants_run_status_idx on kinnso_internal.pilot_participants (run_id, status);
create index pilot_participants_user_idx on kinnso_internal.pilot_participants (user_id);

create table kinnso_internal.pilot_invites (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null references kinnso_internal.pilot_participants(id),
  code_hash bytea not null unique check (octet_length(code_hash) = 32),
  status text not null default 'active' check (status in ('active', 'claimed', 'revoked', 'expired')),
  expires_at timestamptz not null,
  claimed_at timestamptz,
  created_by_ops_member_id uuid not null references public.kinnso_ops_members(id),
  created_at timestamptz not null default now(),
  constraint pilot_invites_expiry_check check (expires_at > created_at),
  constraint pilot_invites_claim_check check (
    (status = 'claimed') = (claimed_at is not null)
    and (claimed_at is null or (claimed_at >= created_at and claimed_at < expires_at))
  )
);

create index pilot_invites_participant_idx on kinnso_internal.pilot_invites (participant_id);
create index pilot_invites_created_by_idx on kinnso_internal.pilot_invites (created_by_ops_member_id);

create table kinnso_internal.pilot_content_intakes (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references kinnso_internal.pilot_runs(id),
  creator_participant_id uuid not null,
  guide_id uuid references public.guides(id),
  guide_draft_revision integer check (guide_draft_revision > 0),
  reviewed_guide_version integer check (reviewed_guide_version > 0),
  content_digest text check (content_digest ~ '^[0-9a-f]{64}$'),
  title text not null check (char_length(btrim(title)) between 1 and 160),
  destination text not null check (char_length(btrim(destination)) between 1 and 160),
  authored_locale text not null check (char_length(btrim(authored_locale)) between 2 and 20),
  source_summary text not null check (char_length(btrim(source_summary)) between 1 and 4000),
  source_urls text[] not null default '{}',
  rights_basis text not null check (rights_basis in ('original', 'licence', 'permission')),
  rights_evidence_reference text not null check (char_length(btrim(rights_evidence_reference)) between 1 and 500),
  author_consent_version text not null check (char_length(btrim(author_consent_version)) between 1 and 120),
  author_consented_at timestamptz not null,
  consent_digest text not null check (consent_digest ~ '^[0-9a-f]{64}$'),
  cover_rights_confirmed boolean,
  cover_rights_evidence_reference text check (char_length(btrim(cover_rights_evidence_reference)) between 1 and 500),
  status text not null default 'draft' check (status in ('draft', 'submitted', 'approved', 'rejected', 'published', 'withdrawn')),
  review_reason text check (char_length(btrim(review_reason)) between 1 and 1000),
  reviewed_by_ops_member_id uuid references public.kinnso_ops_members(id),
  reviewed_at timestamptz,
  revision integer not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (run_id, creator_participant_id) references kinnso_internal.pilot_participants(run_id, id),
  constraint pilot_intakes_source_urls_check check (
    cardinality(source_urls) <= 20 and coalesce(array_ndims(source_urls), 1) = 1
    and array_to_string(source_urls, '', ' ') !~ '[[:space:]]'
    and (cardinality(source_urls) = 0 or array_to_string(source_urls, E'\n')
      ~ E'^https?://[^/@?#[:space:]]+([/?#][^[:space:]]*)?(\\nhttps?://[^/@?#[:space:]]+([/?#][^[:space:]]*)?)*$'
      and array_to_string(source_urls, '') !~ '[[:space:]]')
  ),
  constraint pilot_intakes_cover_rights_check check (
    (cover_rights_confirmed is true and cover_rights_evidence_reference is not null)
    or (cover_rights_confirmed is not true and cover_rights_evidence_reference is null)
  ),
  -- Approval binds a review to a specific draft and exact digest. The publication RPC
  -- must compare these with the authoritative guide and its published digest.
  constraint pilot_intakes_approval_check check (
    status not in ('approved', 'published') or (
      guide_id is not null and guide_draft_revision is not null and content_digest is not null
      and reviewed_by_ops_member_id is not null and reviewed_at is not null and review_reason is not null
    )
  ),
  constraint pilot_intakes_publication_check check (
    status <> 'published' or (
      reviewed_guide_version is not null and reviewed_guide_version = guide_draft_revision
    )
  )
);

create unique index pilot_intakes_guide_idx on kinnso_internal.pilot_content_intakes (guide_id)
  where guide_id is not null;
create index pilot_intakes_run_status_idx on kinnso_internal.pilot_content_intakes (run_id, status);
create index pilot_intakes_run_creator_idx on kinnso_internal.pilot_content_intakes (run_id, creator_participant_id);
create index pilot_intakes_creator_idx on kinnso_internal.pilot_content_intakes (creator_participant_id);
create index pilot_intakes_reviewer_idx on kinnso_internal.pilot_content_intakes (reviewed_by_ops_member_id);

create table kinnso_internal.pilot_collaborations (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references kinnso_internal.pilot_runs(id),
  merchant_participant_id uuid not null,
  creator_participant_id uuid not null,
  mission_id uuid references public.missions(id),
  revision integer not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (run_id),
  foreign key (run_id, merchant_participant_id) references kinnso_internal.pilot_participants(run_id, id),
  foreign key (run_id, creator_participant_id) references kinnso_internal.pilot_participants(run_id, id)
);

create index pilot_collaborations_merchant_idx on kinnso_internal.pilot_collaborations (run_id, merchant_participant_id);
create index pilot_collaborations_creator_idx on kinnso_internal.pilot_collaborations (run_id, creator_participant_id);
create index pilot_collaborations_mission_idx on kinnso_internal.pilot_collaborations (mission_id);

create table kinnso_internal.pilot_checks (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references kinnso_internal.pilot_runs(id),
  code text not null check (char_length(btrim(code)) between 1 and 100),
  category text not null check (char_length(btrim(category)) between 1 and 100),
  status text not null default 'not_run' check (status in ('not_run', 'pass', 'fail', 'blocked')),
  evidence_reference text check (char_length(btrim(evidence_reference)) between 1 and 500),
  observed_summary text check (char_length(btrim(observed_summary)) between 1 and 1000),
  revision integer not null default 1 check (revision > 0),
  updated_by_ops_member_id uuid references public.kinnso_ops_members(id),
  updated_at timestamptz not null default now(),
  unique (run_id, code),
  constraint pilot_checks_manual_pass_check check (
    status <> 'pass' or (category <> 'manual' and code not in (
      'guide_discovered', 'trip_recovered', 'privacy_support', 'alert_owner', 'physical_ios', 'physical_android', 'voiceover', 'nvda'
    )) or (evidence_reference is not null and observed_summary is not null)
  )
);

create index pilot_checks_updated_by_idx on kinnso_internal.pilot_checks (updated_by_ops_member_id);

create table kinnso_internal.pilot_evidence (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references kinnso_internal.pilot_runs(id),
  check_code text not null,
  entity_type text not null check (entity_type in (
    'guide', 'trip', 'mission', 'mission_participant', 'mission_submission', 'notification', 'support_case'
  )),
  entity_id uuid not null,
  evidence_reference text check (char_length(btrim(evidence_reference)) between 1 and 500),
  captured_by_ops_member_id uuid not null references public.kinnso_ops_members(id),
  captured_at timestamptz not null default now(),
  foreign key (run_id, check_code) references kinnso_internal.pilot_checks(run_id, code)
);

create index pilot_evidence_run_check_idx on kinnso_internal.pilot_evidence (run_id, check_code);
create index pilot_evidence_captured_by_idx on kinnso_internal.pilot_evidence (captured_by_ops_member_id);

comment on table kinnso_internal.pilot_evidence is
  'References to authoritative records only. Never copy private trip notes, support messages, source documents or credentials.';

alter table kinnso_internal.pilot_runs enable row level security;
revoke all on table kinnso_internal.pilot_runs from public, anon, authenticated, service_role;

alter table kinnso_internal.pilot_participants enable row level security;
revoke all on table kinnso_internal.pilot_participants from public, anon, authenticated, service_role;

alter table kinnso_internal.pilot_invites enable row level security;
revoke all on table kinnso_internal.pilot_invites from public, anon, authenticated, service_role;

alter table kinnso_internal.pilot_content_intakes enable row level security;
revoke all on table kinnso_internal.pilot_content_intakes from public, anon, authenticated, service_role;

alter table kinnso_internal.pilot_collaborations enable row level security;
revoke all on table kinnso_internal.pilot_collaborations from public, anon, authenticated, service_role;

alter table kinnso_internal.pilot_checks enable row level security;
revoke all on table kinnso_internal.pilot_checks from public, anon, authenticated, service_role;

alter table kinnso_internal.pilot_evidence enable row level security;
revoke all on table kinnso_internal.pilot_evidence from public, anon, authenticated, service_role;
