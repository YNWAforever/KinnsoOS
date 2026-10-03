-- supabase/migrations/20260821120100_r12_1_claim_offer_journey_capture.sql
--
-- Widens claim_offer (R12.0, 20260821100100_r12_0_claim_offer.sql) with two new optional
-- trailing params so it can capture the visitor's own consented journey_id/locale at claim
-- time -- offer_claims has no other source for either value, since the party who later
-- redeems (merchant staff, Task 3) is not the party whose journey/locale should be recorded.
-- Both are default null so existing callers (apps/web/lib/offers/actions.ts, not yet updated
-- until Task 8) keep working unchanged. Every other line of the function body is unchanged
-- from the shipped R12.0 version -- validate -> lock -> write, same shape as
-- admin_create_payout_batch (R10.2).
-- CREATE OR REPLACE with appended trailing-default params creates a second, coexisting
-- overload rather than replacing the original signature -- drop the old 4-arg version first
-- so existing 4-arg named-argument calls don't become ambiguous.
drop function if exists public.claim_offer(uuid, uuid, uuid, text);

create or replace function public.claim_offer(
  p_offer_id uuid,
  p_creator_id uuid,
  p_guide_id uuid default null,
  p_source text default 'profile',
  p_journey_id uuid default null,
  p_locale text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_visitor uuid := auth.uid();
  v_offer record;
  v_raw_token text;
  v_token_hash text;
  v_claim_id uuid;
  v_active_count integer;
begin
  if v_visitor is null then raise exception 'unauthorized' using errcode = '42501'; end if;
  if p_source not in ('guide', 'profile') then raise exception 'bad_source'; end if;
  if p_source = 'guide' and p_guide_id is null then raise exception 'guide_id_required'; end if;

  select id, merchant_profile_id, mission_id, status, valid_from, valid_to, per_visitor_limit, total_cap, claimed_count
    into v_offer
    from public.merchant_offers
    where id = p_offer_id
    for update;
  if not found then raise exception 'offer_not_found' using errcode = 'P0002'; end if;
  if v_offer.status <> 'live' then raise exception 'offer_not_live'; end if;
  if now() < v_offer.valid_from or now() > v_offer.valid_to then raise exception 'offer_not_in_window'; end if;

  if not exists (
    select 1 from public.mission_participants mp
    where mp.mission_id = v_offer.mission_id
      and mp.creator_id = p_creator_id
      and mp.status in ('active', 'completed')
  ) then
    raise exception 'creator_not_eligible' using errcode = '42501';
  end if;

  if p_guide_id is not null and not exists (
    select 1 from public.guides g where g.id = p_guide_id and g.creator_id = p_creator_id
  ) then
    raise exception 'guide_mismatch' using errcode = '42501';
  end if;

  if v_offer.total_cap is not null and v_offer.claimed_count >= v_offer.total_cap then
    raise exception 'offer_cap_reached';
  end if;

  select count(*) into v_active_count
    from public.offer_claims
    where offer_id = p_offer_id and visitor_user_id = v_visitor and status = 'active';
  if v_active_count >= v_offer.per_visitor_limit then
    raise exception 'visitor_limit_reached';
  end if;

  v_raw_token := encode(extensions.gen_random_bytes(24), 'hex');
  v_token_hash := encode(extensions.digest(v_raw_token, 'sha256'), 'hex');

  update public.merchant_offers
    set claimed_count = claimed_count + 1, updated_at = now()
    where id = p_offer_id;

  insert into public.offer_claims (
    offer_id, creator_id, guide_id, visitor_user_id, claim_token_hash, source_surface, expires_at,
    analytics_journey_id, analytics_locale
  )
    values (
      p_offer_id, p_creator_id, p_guide_id, v_visitor, v_token_hash, p_source, v_offer.valid_to,
      p_journey_id, p_locale
    )
    returning id into v_claim_id;

  return jsonb_build_object('claim_id', v_claim_id, 'raw_token', v_raw_token, 'expires_at', v_offer.valid_to);
end;
$$;

revoke all on function public.claim_offer(uuid, uuid, uuid, text, uuid, text) from public, anon;
grant execute on function public.claim_offer(uuid, uuid, uuid, text, uuid, text) to authenticated;
