-- Phase 7 — Merchant Depth. Real creator search + ops-set tier/quota + invite loop.

-- 1. Merchant tier (ops-set; quotas are tier→constants in code).
alter table public.merchant_profiles
  add column if not exists tier text not null default 'free'
  check (tier in ('free','growth'));

-- 2. Saved creators (merchant-private CRM).
create table if not exists public.merchant_saved_creators (
  merchant_id uuid not null references public.merchant_profiles(id) on delete cascade,
  creator_id  uuid not null references public.creators(id) on delete cascade,
  note        text not null default '',
  created_at  timestamptz not null default now(),
  primary key (merchant_id, creator_id)
);
alter table public.merchant_saved_creators enable row level security;
drop policy if exists merchant_saved_creators_owner on public.merchant_saved_creators;
create policy merchant_saved_creators_owner on public.merchant_saved_creators
  for all using (exists (select 1 from public.merchant_profiles m
    where m.id = merchant_id and m.user_id = auth.uid()))
  with check (exists (select 1 from public.merchant_profiles m
    where m.id = merchant_id and m.user_id = auth.uid()));
revoke all on public.merchant_saved_creators from anon;
grant select, insert, update, delete on public.merchant_saved_creators to authenticated;

-- 3. Invite a creator to one of the merchant's published missions (quota-enforced).
--    Intentionally bypasses the Phase-5B tier gate (merchant's explicit choice;
--    avoids leaking the creator's private tier).
create or replace function public.merchant_invite_creator(p_mission_id uuid, p_creator_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_merchant uuid; v_tier text; v_used int; v_limit int; v_pid uuid;
begin
  select m.id, m.tier into v_merchant, v_tier
    from public.merchant_profiles m
    join public.missions mi on mi.merchant_profile_id = m.id
    where mi.id = p_mission_id and m.user_id = auth.uid()
      and m.status = 'active' and mi.status = 'published' and mi.mission_source = 'merchant';
  if v_merchant is null then raise exception 'not_authorized'; end if;
  v_limit := case v_tier when 'growth' then 30 else 3 end;
  select count(*) into v_used from public.mission_participants mp
    join public.missions mi on mi.id = mp.mission_id
    where mi.merchant_profile_id = v_merchant and mp.source = 'merchant_invite'
      and mp.created_at >= date_trunc('month', now());
  if v_used >= v_limit then raise exception 'invite_quota_exceeded'; end if;
  if not exists (select 1 from public.creators where id = p_creator_id and status = 'active')
    then raise exception 'creator_not_found'; end if;
  if exists (select 1 from public.mission_participants
    where mission_id = p_mission_id and creator_id = p_creator_id)
    then raise exception 'already_participant'; end if;
  insert into public.mission_participants (mission_id, creator_id, status, source)
    values (p_mission_id, p_creator_id, 'invited', 'merchant_invite')
    returning id into v_pid;
  return v_pid;
end $$;

-- 4. Creator accepts a direct invite (tier-gate-exempt — they were invited).
create or replace function public.accept_mission_invite(p_mission_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.mission_participants set status = 'active'
    where mission_id = p_mission_id and creator_id = auth.uid()
      and status = 'invited' and source = 'merchant_invite';
  if not found then raise exception 'no_invite'; end if;
end $$;

-- 5. Ops sets a merchant's tier.
create or replace function public.admin_set_merchant_tier(p_id uuid, p_tier text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_active_ops() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_tier not in ('free','growth') then raise exception 'bad_tier'; end if;
  update public.merchant_profiles set tier = p_tier where id = p_id;
  if not found then raise exception 'not_found'; end if;
end $$;

-- 6. Widen admin_list_merchants to include tier (drop+recreate; can't widen a RETURNS row).
drop function if exists public.admin_list_merchants();
create or replace function public.admin_list_merchants()
returns table (id uuid, company_name text, contact_email text, status text, tier text, created_at timestamptz)
language plpgsql security definer stable set search_path = public as $$
begin
  if not public.is_active_ops() then raise exception 'forbidden' using errcode = '42501'; end if;
  return query select m.id, m.company_name, m.contact_email, m.status, m.tier, m.created_at
    from public.merchant_profiles m order by m.created_at desc;
end $$;

-- 7. Grants: revoke implicit public+anon EXECUTE, grant authenticated.
revoke all on function public.merchant_invite_creator(uuid, uuid) from public, anon;
revoke all on function public.accept_mission_invite(uuid) from public, anon;
revoke all on function public.admin_set_merchant_tier(uuid, text) from public, anon;
revoke all on function public.admin_list_merchants() from public, anon;
grant execute on function public.merchant_invite_creator(uuid, uuid) to authenticated;
grant execute on function public.accept_mission_invite(uuid) to authenticated;
grant execute on function public.admin_set_merchant_tier(uuid, text) to authenticated;
grant execute on function public.admin_list_merchants() to authenticated;
