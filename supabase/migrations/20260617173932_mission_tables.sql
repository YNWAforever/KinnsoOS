create schema if not exists app_private;

create table public.merchant_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  company_name text not null,
  contact_name text,
  contact_email text not null,
  website_url text,
  status text not null default 'active' check (status in ('active','paused','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.kinnso_ops_members (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  display_name text not null,
  status text not null default 'active' check (status in ('active','paused')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.affiliate_network_programs (
  id uuid primary key default gen_random_uuid(),
  network text not null check (network in ('travelpayouts')),
  external_program_id text not null,
  program_name text not null,
  program_url text,
  category text,
  description text,
  default_currency text,
  default_commission_description text,
  join_policy text not null default 'auto_join' check (join_policy in ('auto_join')),
  status text not null default 'active' check (status in ('active','paused','archived')),
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (network, external_program_id)
);

create table public.missions (
  id uuid primary key default gen_random_uuid(),
  merchant_profile_id uuid references public.merchant_profiles(id) on delete cascade,
  created_by_ops_member_id uuid references public.kinnso_ops_members(id) on delete set null,
  affiliate_network_program_id uuid references public.affiliate_network_programs(id) on delete set null,
  title text not null,
  summary text not null,
  mission_source text not null default 'merchant' check (mission_source in ('merchant','travelpayouts')),
  mission_type text not null check (mission_type in ('coupon_affiliate','hybrid','paid')),
  visibility text not null default 'open' check (visibility in ('open','targeted')),
  status text not null default 'draft' check (status in ('draft','published','paused','completed','cancelled')),
  coupon_code text,
  coupon_description text,
  coupon_url text,
  affiliate_commission_rate numeric(8,2),
  kinnso_commission_rate numeric(8,2),
  creator_commission_rate numeric(8,2),
  paid_fee_amount numeric(12,2),
  paid_fee_currency text,
  application_instructions text,
  starts_at timestamptz,
  ends_at timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (mission_source = 'merchant' and merchant_profile_id is not null)
    or
    (mission_source = 'travelpayouts' and created_by_ops_member_id is not null and affiliate_network_program_id is not null)
  )
);

create table public.mission_participants (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null references public.missions(id) on delete cascade,
  creator_id uuid not null references public.creators(id) on delete cascade,
  status text not null check (status in ('invited','applied','rejected','active','completed','cancelled')),
  source text not null check (source in ('open_join','application','merchant_invite','affiliate_network_join')),
  application_note text,
  merchant_review_note text,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (mission_id, creator_id)
);

create table public.mission_milestones (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null references public.missions(id) on delete cascade,
  title text not null,
  description text not null,
  due_at timestamptz,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.mission_milestone_submissions (
  id uuid primary key default gen_random_uuid(),
  mission_milestone_id uuid not null references public.mission_milestones(id) on delete cascade,
  mission_participant_id uuid not null references public.mission_participants(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','submitted','revision_requested','approved','rejected')),
  proof_urls text[] not null default '{}',
  notes text,
  merchant_feedback text,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (mission_milestone_id, mission_participant_id)
);

create table public.mission_social_snapshots (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid references public.missions(id) on delete cascade,
  mission_participant_id uuid references public.mission_participants(id) on delete cascade,
  mission_milestone_submission_id uuid references public.mission_milestone_submissions(id) on delete cascade,
  platform text not null check (platform in ('instagram','threads')),
  handle text,
  profile_url text,
  proof_url text,
  follower_count integer,
  profile_media_url text,
  post_media_url text,
  engagement_count integer,
  confidence_status text not null default 'unavailable' check (confidence_status in ('verified_signal','needs_review','unavailable')),
  raw_response_checksum text,
  fetched_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.affiliate_partner_links (
  id uuid primary key default gen_random_uuid(),
  affiliate_network_program_id uuid not null references public.affiliate_network_programs(id) on delete cascade,
  mission_id uuid not null references public.missions(id) on delete cascade,
  mission_participant_id uuid not null references public.mission_participants(id) on delete cascade,
  creator_id uuid not null references public.creators(id) on delete cascade,
  network text not null check (network in ('travelpayouts')),
  original_url text not null,
  partner_url text not null,
  sub_id text not null,
  external_status text not null default 'success',
  generated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (network, sub_id, original_url)
);

create table public.affiliate_network_events (
  id uuid primary key default gen_random_uuid(),
  network text not null check (network in ('travelpayouts')),
  affiliate_network_program_id uuid references public.affiliate_network_programs(id) on delete set null,
  mission_id uuid references public.missions(id) on delete set null,
  mission_participant_id uuid references public.mission_participants(id) on delete set null,
  creator_id uuid references public.creators(id) on delete set null,
  external_action_id text not null,
  sub_id text,
  event_state text not null default 'unknown' check (event_state in ('processing','paid','cancelled','unknown')),
  price_amount numeric(12,2),
  profit_amount numeric(12,2),
  currency text,
  booked_at timestamptz,
  external_updated_at timestamptz,
  raw_response_checksum text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (network, external_action_id)
);

create table public.mission_settlements (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null references public.missions(id) on delete cascade,
  mission_participant_id uuid references public.mission_participants(id) on delete cascade,
  affiliate_network_event_id uuid references public.affiliate_network_events(id) on delete set null,
  status text not null default 'not_started' check (status in ('not_started','pending','partially_paid','paid','disputed')),
  merchant_invoice_status text,
  merchant_payment_status text,
  creator_payout_status text,
  kinnso_commission_status text,
  affiliate_commission_status text,
  amount_currency text,
  paid_fee_amount numeric(12,2),
  affiliate_commission_amount numeric(12,2),
  kinnso_commission_amount numeric(12,2),
  creator_commission_amount numeric(12,2),
  ops_note text,
  updated_by_ops_member_id uuid references public.kinnso_ops_members(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function app_private.enforce_mission_submission_integrity()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  participant_creator_id uuid;
  participant_status text;
  participant_mission_id uuid;
  milestone_mission_id uuid;
begin
  select participant.creator_id, participant.status, participant.mission_id, milestone.mission_id
  into participant_creator_id, participant_status, participant_mission_id, milestone_mission_id
  from public.mission_participants participant
  join public.mission_milestones milestone on milestone.id = new.mission_milestone_id
  where participant.id = new.mission_participant_id;

  if participant_creator_id is null then
    raise exception 'Invalid mission participant or milestone';
  end if;

  if participant_mission_id <> milestone_mission_id then
    raise exception 'Mission milestone and participant mismatch';
  end if;

  if actor_id is not null and actor_id = participant_creator_id then
    if participant_status <> 'active' then
      raise exception 'Creator submissions require an active participant';
    end if;

    if new.status not in ('pending','submitted') then
      raise exception 'Creators cannot set reviewed submission status';
    end if;

    if tg_op = 'INSERT' then
      if new.merchant_feedback is not null or new.reviewed_at is not null or new.reviewed_by is not null then
        raise exception 'Creators cannot set review fields';
      end if;
    elsif old.status not in ('pending','submitted') then
      raise exception 'Creators cannot update reviewed submissions';
    elsif new.merchant_feedback is distinct from old.merchant_feedback
      or new.reviewed_at is distinct from old.reviewed_at
      or new.reviewed_by is distinct from old.reviewed_by then
      raise exception 'Creators cannot update review fields';
    end if;
  end if;

  return new;
end;
$$;

create trigger mission_submissions_integrity
  before insert or update on public.mission_milestone_submissions
  for each row execute function app_private.enforce_mission_submission_integrity();

create or replace function app_private.prepare_affiliate_partner_link_insert()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  participant_creator_id uuid;
begin
  select participant.creator_id
  into participant_creator_id
  from public.mission_participants participant
  where participant.id = new.mission_participant_id;

  if actor_id is not null and actor_id = participant_creator_id then
    new.sub_id := 'pending:' || gen_random_uuid()::text;
    new.partner_url := new.original_url;
    new.external_status := 'pending';
  end if;

  return new;
end;
$$;

create trigger affiliate_partner_links_prepare
  before insert on public.affiliate_partner_links
  for each row execute function app_private.prepare_affiliate_partner_link_insert();

revoke all on function app_private.enforce_mission_submission_integrity() from public;
revoke all on function app_private.prepare_affiliate_partner_link_insert() from public;

create index merchant_profiles_user_idx on public.merchant_profiles(user_id);
create index kinnso_ops_members_user_idx on public.kinnso_ops_members(user_id);
create index missions_merchant_idx on public.missions(merchant_profile_id);
create index missions_ops_idx on public.missions(created_by_ops_member_id);
create index missions_affiliate_program_idx on public.missions(affiliate_network_program_id);
create index missions_status_idx on public.missions(status, visibility);
create index mission_participants_mission_idx on public.mission_participants(mission_id);
create index mission_participants_creator_idx on public.mission_participants(creator_id);
create index mission_milestones_mission_idx on public.mission_milestones(mission_id, sort_order);
create index mission_submissions_milestone_idx on public.mission_milestone_submissions(mission_milestone_id);
create index mission_submissions_participant_idx on public.mission_milestone_submissions(mission_participant_id);
create index mission_submissions_reviewed_by_idx on public.mission_milestone_submissions(reviewed_by);
create index mission_social_snapshots_mission_idx on public.mission_social_snapshots(mission_id);
create index mission_social_snapshots_participant_idx on public.mission_social_snapshots(mission_participant_id);
create index mission_social_snapshots_submission_idx on public.mission_social_snapshots(mission_milestone_submission_id);
create index affiliate_partner_links_program_idx on public.affiliate_partner_links(affiliate_network_program_id);
create index affiliate_partner_links_mission_idx on public.affiliate_partner_links(mission_id);
create index affiliate_partner_links_participant_idx on public.affiliate_partner_links(mission_participant_id);
create index affiliate_partner_links_creator_idx on public.affiliate_partner_links(creator_id);
create index affiliate_events_program_idx on public.affiliate_network_events(affiliate_network_program_id);
create index affiliate_events_mission_idx on public.affiliate_network_events(mission_id);
create index affiliate_events_participant_idx on public.affiliate_network_events(mission_participant_id);
create index affiliate_events_creator_idx on public.affiliate_network_events(creator_id);
create index affiliate_events_sub_id_idx on public.affiliate_network_events(network, sub_id);
create index mission_settlements_mission_idx on public.mission_settlements(mission_id);
create index mission_settlements_participant_idx on public.mission_settlements(mission_participant_id);
create index mission_settlements_affiliate_event_idx on public.mission_settlements(affiliate_network_event_id);
create index mission_settlements_ops_member_idx on public.mission_settlements(updated_by_ops_member_id);
