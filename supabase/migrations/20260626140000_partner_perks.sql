-- Phase 6B — Partner Perks: ops-owned catalog + tier-gated creator redemption.
-- Reuses public.is_active_ops()        (6A, 20260626130000) — do NOT redefine here.
-- Reuses public.contribution_tier_rank (5A, 20260625090000).

-- 1. Ops-owned perk catalog. Creators/anon get NO direct table access.
create table if not exists public.partner_perks (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  partner_name text not null,
  title text not null,
  summary text not null,
  category text not null,
  discount_label text not null,
  min_tier text check (min_tier in ('rising','pro','elite')),  -- null = open to all
  redemption_type text not null check (redemption_type in ('code','link')),
  redemption_value text not null,
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.partner_perks enable row level security;
revoke all on public.partner_perks from anon, authenticated;
drop policy if exists partner_perks_ops_all on public.partner_perks;
create policy partner_perks_ops_all on public.partner_perks
  for all to authenticated using (public.is_active_ops()) with check (public.is_active_ops());
grant select, insert, update on public.partner_perks to authenticated; -- gated by the policy above

-- 2. Redemption log (owner-private).
create table if not exists public.perk_redemptions (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.creators(id) on delete cascade,
  perk_id uuid not null references public.partner_perks(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (creator_id, perk_id)
);
alter table public.perk_redemptions enable row level security;
revoke all on public.perk_redemptions from anon, authenticated;
drop policy if exists perk_redemptions_owner_select on public.perk_redemptions;
create policy perk_redemptions_owner_select on public.perk_redemptions
  for select to authenticated using (creator_id = auth.uid());
grant select on public.perk_redemptions to authenticated; -- inserts happen only via redeem_perk

-- 3. Creator read path: metadata only, NEVER redemption_value.
create or replace function public.list_active_perks()
returns table (id uuid, slug text, partner_name text, title text, summary text,
               category text, discount_label text, min_tier text, redemption_type text, sort_order int)
language sql security definer set search_path = public stable as $$
  select id, slug, partner_name, title, summary, category, discount_label,
         min_tier, redemption_type, sort_order
  from public.partner_perks where active order by sort_order, created_at
$$;
-- Revoke from BOTH public and anon: Supabase default privileges re-grant EXECUTE to
-- anon on new public functions, so revoke-from-public alone leaves an anon grant.
revoke all on function public.list_active_perks() from public, anon;
grant execute on function public.list_active_perks() to authenticated;

-- 4. Creator redeem path: tier-gated (hard), idempotent, returns the value + logs.
create or replace function public.redeem_perk(p_perk_id uuid)
returns table (redemption_type text, redemption_value text)
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_min text; v_type text; v_val text;
begin
  if v_uid is null then raise exception 'unauthorized' using errcode = '42501'; end if;
  select min_tier, redemption_type, redemption_value into v_min, v_type, v_val
    from public.partner_perks where id = p_perk_id and active;
  if not found then raise exception 'perk_not_found' using errcode = 'P0002'; end if;
  if v_min is not null and
     public.contribution_tier_rank(coalesce((select tier from public.creator_contribution
        where creator_id = v_uid), 'seed')) < public.contribution_tier_rank(v_min)
  then raise exception 'below_tier' using errcode = '42501'; end if;
  insert into public.perk_redemptions (creator_id, perk_id)
    values (v_uid, p_perk_id) on conflict (creator_id, perk_id) do nothing;
  return query select v_type, v_val;
end $$;
revoke all on function public.redeem_perk(uuid) from public, anon;
grant execute on function public.redeem_perk(uuid) to authenticated;

-- 5. Extend the 6A dashboard RPC with perk + redemption metrics (gate unchanged).
-- DROP first: the 6A version returns 3 OUT columns; create-or-replace can't widen the row type.
drop function if exists public.admin_overview_counts();
create or replace function public.admin_overview_counts()
returns table (creators bigint, merchants bigint, ops bigint,
               perks_active bigint, perks_total bigint, redemptions bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_active_ops() then raise exception 'forbidden' using errcode = '42501'; end if;
  return query select
    (select count(*) from public.creators),
    (select count(*) from public.merchant_profiles),
    (select count(*) from public.kinnso_ops_members where status = 'active'),
    (select count(*) from public.partner_perks where active),
    (select count(*) from public.partner_perks),
    (select count(*) from public.perk_redemptions);
end $$;
revoke all on function public.admin_overview_counts() from public, anon;
grant execute on function public.admin_overview_counts() to authenticated;
