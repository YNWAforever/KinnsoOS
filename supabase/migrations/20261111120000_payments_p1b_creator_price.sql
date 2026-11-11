-- P1b: creator-facing flat guide price (flag-gated). Still inert: the payments
-- runtime flag stays off in production, nothing here charges, and no traveller
-- surface reads the price yet. This migration
--   1. adds a creator-scoped read for one guide's price plus the payments flag,
--   2. lets a price-only update pass the studio write guard (a commercial scalar,
--      not authored content; the owner-only RPC stays the only write path), and
--   3. refuses price writes while the payments flag is off, so production stays
--      inert even for a direct authenticated API call.
-- Additive and reversible by dropping the new function; the guard replacement is
-- the only behavioural change, and only for the price_minor column.
create or replace function public.kinnso_creator_guide_price(p_guide_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_actor uuid := kinnso_internal.actor();
  v_price integer;
begin
  if v_actor is null then raise exception 'actor_required' using errcode = '42501'; end if;
  if not exists (select 1 from public.creators c where c.id = v_actor and c.status = 'active') then
    raise exception 'creator_required';
  end if;
  select g.price_minor into v_price from public.guides g where g.id = p_guide_id and g.creator_id = v_actor;
  if not found then raise exception 'guide_not_found'; end if;
  return jsonb_build_object(
    'guideId', p_guide_id,
    'priceMinor', v_price,
    'currency', 'HKD',
    'paymentsEnabled', kinnso_internal.payments_enabled(),
    'minMinor', 100,
    'maxMinor', 10000000);
end $$;
revoke all on function public.kinnso_creator_guide_price(uuid) from public, anon;
grant execute on function public.kinnso_creator_guide_price(uuid) to authenticated;

-- Same guard as 20261031090100_guard_studio_guide_writes.sql, with `price_minor`
-- added to the ignored columns: the owner-only price RPC updates one commercial
-- scalar, never authored content or identity. price_minor is not in the
-- authenticated column grant, so the SECURITY DEFINER RPC remains the only path.
create or replace function kinnso_internal.guard_studio_guide_mutation() returns trigger
language plpgsql security definer set search_path = '' as $$
declare guide uuid; h kinnso_internal.studio_handoffs;
begin
 if tg_table_name='guide_versions' then guide:=new.guide_id; else guide:=new.id; end if;
 if exists(select 1 from kinnso_internal.studio_guide_tombstones where guide_id=guide) then raise exception 'studio_restricted'; end if;
 if not exists(select 1 from kinnso_internal.studio_guide_bindings where guide_id=guide) then return new; end if;
 if tg_table_name='guides' then
  -- Original bookmark triggers maintain counters; authenticated column grants
  -- still forbid direct counter writes. Every content/identity field stays guarded.
  if (to_jsonb(new)-array['saves_count','updated_at','tsv','price_minor']) is not distinct from (to_jsonb(old)-array['saves_count','updated_at','tsv','price_minor']) then return new; end if;
 end if;
 select h1.* into h from kinnso_internal.studio_write_permits p join kinnso_internal.studio_handoffs h1 on h1.id=p.handoff_id
 where p.transaction_id=txid_current() and p.guide_id=guide and p.actor_id=kinnso_internal.actor();
 if not found then raise exception 'studio_confirmation_required'; end if;
 perform kinnso_internal.assert_studio_refs(h.source_refs,h.actor_id,h.thread_id,true);
 if tg_table_name='guide_versions' then
  if h.operation<>'publish' then raise exception 'studio_confirmation_required'; end if;
 elsif new.creator_id<>h.actor_id or new.title is distinct from h.payload->>'title'
  or new.city is distinct from h.payload->>'city' or new.summary is distinct from h.payload->>'summary' then
  raise exception 'invalid_studio_projection';
 end if;
 return new;
end $$;
revoke all on function kinnso_internal.guard_studio_guide_mutation() from public, anon, authenticated, service_role;

-- Owner-only write: now also requires an active creator and the payments flag.
create or replace function public.kinnso_creator_set_guide_price(p_guide_id uuid, p_price_minor integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := kinnso_internal.actor();
  v_guide public.guides;
begin
  if v_actor is null then raise exception 'actor_required' using errcode = '42501'; end if;
  if not exists (select 1 from public.creators c where c.id = v_actor and c.status = 'active') then
    raise exception 'creator_required';
  end if;
  if not kinnso_internal.payments_enabled() then raise exception 'payments_disabled'; end if;
  if p_price_minor is not null and (p_price_minor < 100 or p_price_minor > 10000000) then
    raise exception 'invalid_price';
  end if;
  update public.guides set price_minor = p_price_minor
   where id = p_guide_id and creator_id = v_actor
   returning * into v_guide;
  if not found then raise exception 'guide_not_found'; end if;
  return jsonb_build_object('guideId', v_guide.id, 'priceMinor', v_guide.price_minor, 'currency', 'HKD');
end $$;
revoke all on function public.kinnso_creator_set_guide_price(uuid, integer) from public, anon;
grant execute on function public.kinnso_creator_set_guide_price(uuid, integer) to authenticated;

-- Ops status gains a priced-guide count so enabling payments can be audited
-- before any traveller can be asked to pay.
create or replace function public.kinnso_ops_payments_status() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_active_ops() then raise exception 'forbidden' using errcode = '42501'; end if;
  return jsonb_build_object(
    'enabled', coalesce((select enabled from kinnso_internal.runtime_flags where flag = 'payments'), false),
    'pricedGuides', (select count(*) from public.guides where price_minor is not null),
    'requiresPayment', (select count(*) from public.booking_payments where status = 'requires_payment'),
    'paid', (select count(*) from public.booking_payments where status = 'paid'),
    'refunded', (select count(*) from public.booking_payments where status = 'refunded'),
    'expired', (select count(*) from public.booking_payments where status = 'expired'),
    'overdueCheckouts', (select count(*) from public.booking_payments where status = 'requires_payment' and deadline_at < now()));
end $$;
revoke all on function public.kinnso_ops_payments_status() from public, anon;
grant execute on function public.kinnso_ops_payments_status() to authenticated;
