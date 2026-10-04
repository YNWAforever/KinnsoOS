-- supabase/migrations/20260821100100_r12_0_claim_offer.sql
--
-- Validate -> lock -> write, same shape as admin_create_payout_batch (R10.2). Takes
-- `for update` on the merchant_offers row, which serializes every concurrent claim attempt
-- against that specific offer -- both per_visitor_limit and total_cap are enforced as plain
-- `if` checks under that lock, not a predicate update or unique index (per_visitor_limit can
-- be any positive integer, so a simple unique-per-visitor index can't express it).
create or replace function public.claim_offer(
  p_offer_id uuid,
  p_creator_id uuid,
  p_guide_id uuid default null,
  p_source text default 'profile'
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

  insert into public.offer_claims (offer_id, creator_id, guide_id, visitor_user_id, claim_token_hash, source_surface, expires_at)
    values (p_offer_id, p_creator_id, p_guide_id, v_visitor, v_token_hash, p_source, v_offer.valid_to)
    returning id into v_claim_id;

  return jsonb_build_object('claim_id', v_claim_id, 'raw_token', v_raw_token, 'expires_at', v_offer.valid_to);
end;
$$;

revoke all on function public.claim_offer(uuid, uuid, uuid, text) from public, anon;
grant execute on function public.claim_offer(uuid, uuid, uuid, text) to authenticated;
