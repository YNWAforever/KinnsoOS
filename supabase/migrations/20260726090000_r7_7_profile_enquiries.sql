-- R7.7: public profile trust fields and a narrow, audited enquiries boundary.

alter table public.creators
  add column if not exists avatar_url text;

alter table public.creators
  add constraint creators_avatar_url_http_check
  check (avatar_url is null or btrim(avatar_url) ~* '^https?://[^[:space:]]+$');

create or replace function public.creator_public_profile_json(p_final jsonb)
returns jsonb language sql immutable set search_path = public as $$
  select jsonb_build_object(
    'niches',           coalesce(p_final->'niches', '[]'::jsonb),
    'content_pillars',  coalesce(p_final->'content_pillars', '[]'::jsonb),
    'tone',             coalesce(p_final->'tone', '[]'::jsonb),
    'audience_geos',    coalesce(p_final->'audience'->'top_geos', '[]'::jsonb),
    'audience_locales', coalesce(p_final->'audience'->'top_locales', '[]'::jsonb),
    'languages',        coalesce(p_final->'languages', '[]'::jsonb),
    'platforms',        coalesce(
      (select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
                'platform', p->>'platform',
                'verified', coalesce((p->>'verified')::boolean, false),
                'followers', case
                  when jsonb_typeof(p->'followers') = 'number'
                    and (p->>'followers')::numeric >= 0
                  then p->'followers'
                  else null
                end)))
       from jsonb_array_elements(coalesce(p_final->'platforms', '[]'::jsonb)) as p),
      '[]'::jsonb)
  );
$$;

create table public.enquiries (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('creator_collab','merchant_contact')),
  creator_id uuid references public.creators(id) on delete restrict,
  merchant_profile_id uuid references public.merchant_profiles(id) on delete restrict,
  name text not null check (name = btrim(name) and char_length(name) between 1 and 120),
  email text not null check (
    email = lower(btrim(email))
    and char_length(email) <= 254
    and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
  ),
  message text not null check (
    message = btrim(message)
    and char_length(message) between 10 and 4000
  ),
  status text not null default 'new'
    check (status in ('new','in_progress','resolved','spam')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint enquiries_target_matches_type check (
    (type = 'creator_collab' and creator_id is not null and merchant_profile_id is null)
    or
    (type = 'merchant_contact' and merchant_profile_id is not null and creator_id is null)
  )
);

create index enquiries_queue_idx on public.enquiries (status, created_at desc, id desc);
create index enquiries_creator_history_idx on public.enquiries (creator_id, created_at desc) where creator_id is not null;
create index enquiries_merchant_history_idx on public.enquiries (merchant_profile_id, created_at desc) where merchant_profile_id is not null;

create trigger enquiries_set_updated_at before update on public.enquiries
  for each row execute procedure public.set_updated_at();

create table public.enquiry_rate_limits (
  ip_hash text not null,
  window_start timestamptz not null,
  request_count integer not null default 0 check (request_count >= 0),
  primary key (ip_hash, window_start)
);

alter table public.enquiries enable row level security;
alter table public.enquiry_rate_limits enable row level security;
revoke all on table public.enquiries from public, anon, authenticated;
revoke all on table public.enquiry_rate_limits from public, anon, authenticated;

create or replace function public.submit_enquiry(
  p_type text,
  p_creator_id uuid,
  p_merchant_profile_id uuid,
  p_name text,
  p_email text,
  p_message text,
  p_ip text,
  p_max_requests integer default 5,
  p_window_seconds integer default 3600
) returns uuid
language plpgsql security definer set search_path = public as $function$
declare
  v_type text := lower(btrim(p_type));
  v_name text := btrim(p_name);
  v_email text := lower(btrim(p_email));
  v_message text := btrim(p_message);
  v_request_headers jsonb := coalesce(current_setting('request.headers', true), '{}')::jsonb;
  v_attestation text;
  v_expiry_text text;
  v_expiry bigint;
  v_now_epoch bigint;
  v_attestation_hmac text;
  v_expected_hmac text;
  v_secret text;
  v_normalized_ip text;
  v_ip_hash text;
  v_window_start timestamptz;
  v_request_count integer;
  v_id uuid;
  v_effective_max_requests constant integer := 5;
  v_effective_window_seconds constant integer := 3600;
begin
  -- Reject direct RPC callers before validating fields or consuming a bucket.
  v_attestation := v_request_headers ->> 'x-kinnso-enquiry-attestation';
  if v_attestation is null or v_attestation !~ '^v1\.[0-9]{1,10}\.[0-9a-f]{64}$' then
    raise exception 'invalid_enquiry_attestation' using errcode = '42501';
  end if;

  v_expiry_text := split_part(v_attestation, '.', 2);
  v_expiry := v_expiry_text::bigint;
  v_now_epoch := floor(extract(epoch from clock_timestamp()))::bigint;
  if v_expiry < v_now_epoch or v_expiry > v_now_epoch + 300 then
    raise exception 'invalid_enquiry_attestation' using errcode = '42501';
  end if;

  select ds.decrypted_secret into v_secret
  from vault.decrypted_secrets ds
  where ds.name = 'r7_7_enquiry_submission_hmac';
  if v_secret is null then
    raise exception 'invalid_enquiry_attestation' using errcode = '42501';
  end if;

  begin
    v_normalized_ip := host(btrim(p_ip)::inet);
  exception when others then
    raise exception 'invalid_enquiry_attestation' using errcode = '42501';
  end;
  v_attestation_hmac := split_part(v_attestation, '.', 3);
  v_expected_hmac := encode(
    extensions.hmac(v_normalized_ip || E'\n' || v_expiry::text, v_secret, 'sha256'),
    'hex'
  );
  -- Both values are fixed-length lowercase hex; compare their fixed-length digests.
  if extensions.digest(v_attestation_hmac, 'sha256') <> extensions.digest(v_expected_hmac, 'sha256') then
    raise exception 'invalid_enquiry_attestation' using errcode = '42501';
  end if;

  if v_type not in ('creator_collab', 'merchant_contact') then raise exception 'invalid_enquiry_type' using errcode = '22023'; end if;
  if v_name is null or char_length(v_name) not between 1 and 120 then raise exception 'invalid_enquiry_name' using errcode = '22023'; end if;
  if v_email is null or char_length(v_email) > 254 or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then raise exception 'invalid_enquiry_email' using errcode = '22023'; end if;
  if v_message is null or char_length(v_message) not between 10 and 4000 then raise exception 'invalid_enquiry_message' using errcode = '22023'; end if;
  if (v_type = 'creator_collab' and (p_creator_id is null or p_merchant_profile_id is not null)) or (v_type = 'merchant_contact' and (p_merchant_profile_id is null or p_creator_id is not null)) then raise exception 'invalid_enquiry_target' using errcode = '22023'; end if;

  v_ip_hash := encode(
    extensions.hmac(E'r7.7:enquiry-rate-limit:v1\n' || v_normalized_ip, v_secret, 'sha256'),
    'hex'
  );
  v_window_start := to_timestamp(floor(extract(epoch from clock_timestamp()) / v_effective_window_seconds) * v_effective_window_seconds);
  insert into public.enquiry_rate_limits (ip_hash, window_start, request_count)
  values (v_ip_hash, v_window_start, 1)
  on conflict (ip_hash, window_start) do update set request_count = public.enquiry_rate_limits.request_count + 1
  returning request_count into v_request_count;
  if v_request_count > v_effective_max_requests then raise exception 'enquiry_rate_limited' using errcode = '22023'; end if;

  -- Invalid-but-well-formed targets still consume quota. Returning null avoids
  -- rolling back the rate bucket while revealing no target eligibility detail.
  if v_type = 'creator_collab' and not exists (
    select 1 from public.creators c
    where c.id = p_creator_id and c.status = 'active' and c.handle is not null and c.public_profile is not null
  ) then return null; end if;
  if v_type = 'merchant_contact' and not exists (
    select 1 from public.merchant_profiles m
    where m.id = p_merchant_profile_id and m.status = 'active' and m.slug is not null
  ) then return null; end if;

  insert into public.enquiries (type, creator_id, merchant_profile_id, name, email, message)
  values (v_type, p_creator_id, p_merchant_profile_id, v_name, v_email, v_message)
  returning id into v_id;
  return v_id;
end;
$function$;
revoke all on function public.submit_enquiry(text, uuid, uuid, text, text, text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.submit_enquiry(text, uuid, uuid, text, text, text, text, integer, integer) to anon, authenticated;

create or replace function public.admin_list_enquiries(
  p_status_group text default 'active', p_type text default null, p_limit integer default 25,
  p_cursor_created_at timestamptz default null, p_cursor_id uuid default null
) returns table (
  id uuid, type text, name text, email text, message text, status text,
  created_at timestamptz, updated_at timestamptz, target_id uuid, target_name text, target_slug text
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_active_ops() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_status_group not in ('active', 'resolved', 'spam') then raise exception 'invalid_enquiry_status_group' using errcode = '22023'; end if;
  if p_type is not null and p_type not in ('creator_collab', 'merchant_contact') then raise exception 'invalid_enquiry_type' using errcode = '22023'; end if;
  return query
    select e.id, e.type, e.name, e.email, e.message, e.status, e.created_at, e.updated_at,
      coalesce(e.creator_id, e.merchant_profile_id), coalesce(c.display_name, m.company_name), coalesce(c.handle, m.slug)
    from public.enquiries e
    left join public.creators c on c.id = e.creator_id
    left join public.merchant_profiles m on m.id = e.merchant_profile_id
    where ((p_status_group = 'active' and e.status in ('new', 'in_progress'))
       or (p_status_group = 'resolved' and e.status = 'resolved')
       or (p_status_group = 'spam' and e.status = 'spam'))
      and (p_type is null or e.type = p_type)
      and (p_cursor_created_at is null or (e.created_at, e.id) < (p_cursor_created_at, p_cursor_id))
    order by e.created_at desc, e.id desc
    limit least(greatest(coalesce(p_limit, 25), 1), 100);
end;
$$;
revoke all on function public.admin_list_enquiries(text, text, integer, timestamptz, uuid) from public, anon, authenticated;
grant execute on function public.admin_list_enquiries(text, text, integer, timestamptz, uuid) to authenticated;

create or replace function public.admin_set_enquiry_status(
  p_id uuid, p_status text, p_reason text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_from text;
  v_reason text := nullif(btrim(p_reason), '');
begin
  if not public.is_active_ops() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_status not in ('new', 'in_progress', 'resolved', 'spam') then raise exception 'invalid_enquiry_status' using errcode = '22023'; end if;
  if v_reason is not null and char_length(v_reason) > 500 then raise exception 'enquiry_reason_too_long' using errcode = '22023'; end if;
  select status into v_from from public.enquiries where id = p_id for update;
  if v_from is null then raise exception 'enquiry_not_found' using errcode = 'P0002'; end if;
  if v_from = p_status then raise exception 'enquiry_status_no_change' using errcode = '22023'; end if;
  if not ((v_from = 'new' and p_status in ('in_progress', 'resolved', 'spam')) or (v_from = 'in_progress' and p_status in ('resolved', 'spam')) or (v_from in ('resolved', 'spam') and p_status = 'in_progress')) then raise exception 'invalid_enquiry_transition' using errcode = '22023'; end if;
  if (p_status in ('resolved', 'spam') or v_from in ('resolved', 'spam')) and v_reason is null then raise exception 'enquiry_reason_required' using errcode = '22023'; end if;
  update public.enquiries set status = p_status, updated_at = now() where id = p_id;
  perform public.ops_audit_log_append('enquiry', p_id, 'status.' || p_status, nullif(btrim(p_reason), ''),
    jsonb_build_object('from', v_from, 'to', p_status)
  );
end;
$$;
revoke all on function public.admin_set_enquiry_status(uuid, text, text) from public, anon, authenticated;
grant execute on function public.admin_set_enquiry_status(uuid, text, text) to authenticated;

create or replace function public.get_attributed_guides_for_merchant(
  p_merchant_id uuid, p_limit integer default 9
) returns table (
  slug text, title text, cover_url text, city text, saves_count integer, creator_handle text
)
language sql stable security definer set search_path = public as $$
  select attributed.slug, attributed.title, attributed.cover_url, attributed.city, attributed.saves_count, attributed.creator_handle
  from (
    select distinct on (g.id)
      g.id, g.slug, g.title, g.cover_url, g.city, g.saves_count, g.creator_handle, g.published_at
    from public.bookings b
    join public.experiences e on e.id = b.experience_id
    join public.merchant_profiles m on m.id = e.merchant_profile_id
    join public.guides g on g.id = b.guide_id
    where m.id = p_merchant_id
      and m.status = 'active'
      and m.slug is not null
      and b.status in ('confirmed','completed')
      and g.status = 'published'
    order by g.id, g.published_at desc nulls last, g.created_at desc
  ) attributed
  order by attributed.published_at desc nulls last, attributed.id desc
  limit least(greatest(coalesce(p_limit, 9), 1), 20);
$$;
revoke all on function public.get_attributed_guides_for_merchant(uuid, integer) from public, anon, authenticated;
grant execute on function public.get_attributed_guides_for_merchant(uuid, integer) to anon, authenticated;
