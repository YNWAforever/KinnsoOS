-- Atomically replay the original Ops perk-create result and audit at most once.
create or replace function public.admin_create_partner_perk(
  p_request_id uuid,
  p_partner_name text,
  p_title text,
  p_summary text,
  p_category text,
  p_discount_label text,
  p_min_tier text default null,
  p_redemption_type text default 'code',
  p_redemption_value text default null,
  p_sort_order integer default 0,
  p_active boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_partner_name text := pg_catalog.btrim(p_partner_name);
  v_title text := pg_catalog.btrim(p_title);
  v_summary text := pg_catalog.btrim(p_summary);
  v_category text := pg_catalog.btrim(p_category);
  v_discount_label text := pg_catalog.btrim(p_discount_label);
  v_redemption_value text := pg_catalog.btrim(p_redemption_value);
  v_created_id uuid;
  v_actor uuid;
  v_digest text;
  v_prior kinnso_internal.requests%rowtype;
  v_result jsonb;
begin
  if not public.is_active_ops_role('moderator') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_request_id is null or p_active is distinct from false then
    raise exception 'invalid_perk' using errcode = '22023';
  end if;
  if v_partner_name is null or char_length(v_partner_name) not between 1 and 120
     or v_title is null or char_length(v_title) not between 1 and 160
     or v_summary is null or char_length(v_summary) not between 1 and 1000
     or v_category is null or char_length(v_category) not between 1 and 80
     or v_discount_label is null or char_length(v_discount_label) not between 1 and 80
     or v_redemption_value is null or char_length(v_redemption_value) not between 1 and 2048 then
    raise exception 'invalid_perk_text' using errcode = '22023';
  end if;
  if p_min_tier is not null and p_min_tier not in ('rising','pro','elite') then
    raise exception 'invalid_perk_tier' using errcode = '22023';
  end if;
  if p_redemption_type not in ('code','link') then
    raise exception 'invalid_perk_redemption_type' using errcode = '22023';
  end if;
  if p_redemption_type = 'link'
     and v_redemption_value !~* '^https?://[^/[:space:]@]+([/?#][^[:space:]]*)?$' then
    raise exception 'invalid_perk_link' using errcode = '22023';
  end if;

  v_actor := kinnso_internal.actor();
  v_digest := kinnso_internal.request_digest(pg_catalog.jsonb_build_array(
    'ops.perk.create', v_partner_name, v_title, v_summary, v_category,
    v_discount_label, p_min_tier, p_redemption_type, v_redemption_value, p_sort_order, p_active
  )::text);

  -- Serialize every replay on the same actor/request pair, including other
  -- commands sharing the receipt table. Do not persist the redemption value.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_actor::text || p_request_id::text, 0));
  if not public.is_active_ops_role('moderator') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into v_prior from kinnso_internal.requests
   where actor_id = v_actor and request_id = p_request_id;
  if found then
    if v_prior.digest is distinct from v_digest then
      raise exception 'request_id_reused' using errcode = '23505';
    end if;
    return v_prior.result;
  end if;

  insert into public.partner_perks
    (id, slug, partner_name, title, summary, category, discount_label,
     min_tier, redemption_type, redemption_value, sort_order, active)
  values
    (p_request_id, 'ops-perk-' || p_request_id::text, v_partner_name,
     v_title, v_summary, v_category, v_discount_label, p_min_tier,
     p_redemption_type, v_redemption_value, p_sort_order, false)
  on conflict do nothing
  returning id into v_created_id;

  -- An occupied ID or slug without this actor's receipt is not a replay.
  if v_created_id is null then
    raise exception 'perk_conflict' using errcode = '23505';
  end if;

  perform public.ops_audit_log_append(
    'partner_perk', p_request_id, 'perk.create', null,
    pg_catalog.jsonb_build_object('active', false)
  );
  v_result := pg_catalog.jsonb_build_object('id', p_request_id, 'active', false);
  insert into kinnso_internal.requests (actor_id, request_id, digest, result)
    values (v_actor, p_request_id, v_digest, v_result);
  return v_result;
end
$$;

revoke all on function public.admin_create_partner_perk(
  uuid, text, text, text, text, text, text, text, text, integer, boolean
) from public, anon, authenticated;
grant execute on function public.admin_create_partner_perk(
  uuid, text, text, text, text, text, text, text, text, integer, boolean
) to authenticated;
