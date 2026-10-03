-- R8.0 — consented measurement baseline.
--
-- This is a deliberately minimal, private ledger. Browser clients can call only
-- the rate-limit RPC; application servers write events with the service role.
-- The report RPC returns aggregated counts only and never exposes ledger rows.

create table public.traveller_analytics_events (
  id uuid primary key default gen_random_uuid(),
  client_event_id uuid not null,
  journey_id uuid not null,
  consent_version text not null check (consent_version = 'v1'),
  event_name text not null check (event_name in (
    'journey_started',
    'entity_viewed',
    'agent_started',
    'booking_cta_clicked',
    'waitlist_submitted',
    'checkout_started',
    'signup_started',
    'signup_completed'
  )),
  occurred_at timestamptz not null,
  received_at timestamptz not null default now(),
  locale text not null check (locale in ('en', 'zh-hk', 'zh-tw', 'zh-cn', 'ja', 'ko', 'th')),
  route_key text not null check (char_length(route_key) between 1 and 120),
  entity_type text check (entity_type in ('guide', 'experience', 'creator', 'article')),
  entity_id text check (
    char_length(entity_id) between 1 and 120
    and entity_id ~ '^[A-Za-z0-9_-]+$'
  ),
  booking_state text not null default 'off' check (booking_state in ('off', 'on')),
  authenticated boolean not null default false,
  outcome text check (outcome in ('created', 'submitted', 'success', 'error')),
  error_category text check (error_category in ('invalid', 'rate_limited', 'unavailable', 'unknown')),
  account_id uuid references auth.users(id) on delete set null,
  unique (journey_id, client_event_id),
  constraint traveller_analytics_entity_pair_check check (
    (entity_type is null and entity_id is null)
    or (entity_type is not null and entity_id is not null)
  ),
  constraint traveller_analytics_error_outcome_check check (
    error_category is null or outcome = 'error'
  ),
  -- Keep event-time attribution bounded to the server receipt time. The ingest
  -- parser applies this same 15-minute skew allowance before it reaches the DB.
  constraint traveller_analytics_occurred_at_skew_check check (
    occurred_at >= received_at - interval '15 minutes'
    and occurred_at <= received_at + interval '15 minutes'
  )
);

create index traveller_analytics_events_occurred_at_idx
  on public.traveller_analytics_events (occurred_at desc);
create index traveller_analytics_events_name_occurred_at_idx
  on public.traveller_analytics_events (event_name, occurred_at desc);

create table public.traveller_analytics_rate_limits (
  journey_id uuid primary key,
  window_start timestamptz not null default now(),
  event_count integer not null default 1 check (event_count >= 0)
);

alter table public.traveller_analytics_events enable row level security;
alter table public.traveller_analytics_rate_limits enable row level security;
revoke all on table public.traveller_analytics_events from public, anon, authenticated;
revoke all on table public.traveller_analytics_rate_limits from public, anon, authenticated;
grant all on table public.traveller_analytics_events to service_role;
grant all on table public.traveller_analytics_rate_limits to service_role;

-- The route calls this through its request-scoped client. The signature retains
-- explicit policy arguments for the caller interface, but the function fixes the
-- actual policy so a direct RPC caller cannot loosen its own quota.
create or replace function public.check_and_increment_traveller_analytics_rate_limit(
  p_journey_id uuid,
  p_max_requests integer,
  p_window_seconds integer
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_count integer;
  v_max_requests constant integer := 120;
  v_window_seconds constant integer := 600;
begin
  if p_journey_id is null then
    raise exception 'analytics_journey_required' using errcode = '22023';
  end if;

  insert into public.traveller_analytics_rate_limits (journey_id, window_start, event_count)
  values (p_journey_id, now(), 1)
  on conflict (journey_id) do update
    set window_start = case
          when public.traveller_analytics_rate_limits.window_start < now() - make_interval(secs => v_window_seconds)
          then now()
          else public.traveller_analytics_rate_limits.window_start
        end,
        event_count = case
          when public.traveller_analytics_rate_limits.window_start < now() - make_interval(secs => v_window_seconds)
          then 1
          else public.traveller_analytics_rate_limits.event_count + 1
        end
  returning event_count into v_event_count;

  return v_event_count <= v_max_requests;
end;
$$;

revoke all on function public.check_and_increment_traveller_analytics_rate_limit(uuid, integer, integer) from public;
grant execute on function public.check_and_increment_traveller_analytics_rate_limit(uuid, integer, integer) to anon, authenticated;

-- This is intentionally invoker-security: only the service role has table and
-- function privileges, so no browser role can trigger retention deletion.
create or replace function public.purge_traveller_analytics_events()
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  delete from public.traveller_analytics_events
  where received_at < now() - interval '8 days';

  delete from public.traveller_analytics_rate_limits
  where window_start < now() - interval '8 days';
end;
$$;

revoke all on function public.purge_traveller_analytics_events() from public, anon, authenticated;
grant execute on function public.purge_traveller_analytics_events() to service_role;

create or replace function public.admin_traveller_analytics_report(
  p_window_start timestamptz,
  p_window_end timestamptz
) returns table (
  metric_key text,
  locale text,
  entity_type text,
  booking_state text,
  numerator bigint,
  denominator bigint,
  rate numeric,
  sample_count bigint,
  status text,
  attribution_window_days integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_sample_floor constant integer := 10;
begin
  if not public.is_active_ops() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_window_start is null or p_window_end is null or p_window_end <= p_window_start then
    raise exception 'invalid_analytics_window' using errcode = '22023';
  end if;
  if p_window_end - p_window_start > interval '7 days' then
    raise exception 'analytics_window_too_large' using errcode = '22023';
  end if;

  return query
  with source_events as (
    select
      se.event_name,
      se.journey_id,
      se.locale,
      se.entity_type,
      se.entity_id,
      se.booking_state,
      se.outcome,
      se.error_category,
      se.occurred_at
    from public.traveller_analytics_events as se
    where se.received_at >= p_window_start
      and se.received_at < p_window_end
      and se.received_at >= now() - interval '8 days'
  ),
  -- Target events may arrive after the requested report window. Keep them in
  -- the retained ledger so each source event can receive its full seven-day
  -- attribution window, without querying data older than retention allows.
  retained_target_events as (
    select
      te.event_name,
      te.journey_id,
      te.locale,
      te.entity_type,
      te.entity_id,
      te.booking_state,
      te.outcome,
      te.occurred_at
    from public.traveller_analytics_events as te
    where te.received_at >= p_window_start
      and te.received_at >= now() - interval '8 days'
      and te.received_at < now()
  ),
  source_journey_starts as (
    select se.journey_id, se.locale, min(se.occurred_at) as occurred_at
    from source_events as se
    where se.event_name = 'journey_started'
    group by se.journey_id, se.locale
  ),
  source_entity_views as (
    select se.journey_id, se.locale, se.entity_type, se.entity_id, min(se.occurred_at) as occurred_at
    from source_events as se
    where se.event_name = 'entity_viewed'
    group by se.journey_id, se.locale, se.entity_type, se.entity_id
  ),
  target_entity_views as (
    select te.journey_id, te.locale, te.entity_type, te.entity_id, te.occurred_at
    from retained_target_events as te
    where te.event_name = 'entity_viewed'
  ),
  target_agent_starts as (
    select te.journey_id, te.locale, te.occurred_at
    from retained_target_events as te
    where te.event_name = 'agent_started'
  ),
  source_booking_ctas as (
    select se.journey_id, se.locale, se.entity_type, se.entity_id, se.booking_state,
      min(se.occurred_at) as occurred_at
    from source_events as se
    where se.event_name = 'booking_cta_clicked'
    group by se.journey_id, se.locale, se.entity_type, se.entity_id, se.booking_state
  ),
  target_booking_ctas as (
    select te.journey_id, te.locale, te.entity_type, te.entity_id, te.booking_state, te.occurred_at
    from retained_target_events as te
    where te.event_name = 'booking_cta_clicked'
  ),
  target_booking_outcomes as (
    select te.journey_id, te.locale, te.entity_type, te.entity_id, te.booking_state,
      te.event_name, te.occurred_at
    from retained_target_events as te
    where (te.event_name = 'waitlist_submitted' and te.booking_state = 'off' and te.outcome = 'submitted')
       or (te.event_name = 'checkout_started' and te.booking_state = 'on' and te.outcome = 'created')
  ),
  source_signup_starts as (
    select se.journey_id, se.locale, min(se.occurred_at) as occurred_at
    from source_events as se
    where se.event_name = 'signup_started'
    group by se.journey_id, se.locale
  ),
  target_signup_completions as (
    select te.journey_id, te.locale, te.occurred_at
    from retained_target_events as te
    where te.event_name = 'signup_completed' and te.outcome = 'success'
  ),
  known_locales as (
    select unnest(array['en', 'zh-hk', 'zh-tw', 'zh-cn', 'ja', 'ko', 'th']::text[]) as locale
  ),
  known_entity_types as (
    select unnest(array['guide', 'experience', 'creator', 'article']::text[]) as entity_type
  ),
  known_booking_states as (
    select unnest(array['off', 'on']::text[]) as booking_state
  ),
  known_error_categories as (
    select unnest(array['invalid', 'rate_limited', 'unavailable', 'unknown']::text[]) as error_category
  ),
  error_events as (
    select se.journey_id, se.locale, se.entity_type, se.booking_state, se.error_category
    from source_events as se
    where se.outcome = 'error' and se.error_category is not null
  ),
  funnel_metrics as (
    -- Every discovery journey is eligible for each entity-type discovery slice.
    select
      'discovery_to_entity'::text as metric_key,
      source.locale as locale,
      entity_type.entity_type as entity_type,
      'off'::text as booking_state,
      count(distinct target.journey_id)::bigint as numerator,
      count(distinct source.journey_id)::bigint as denominator
    from source_journey_starts as source
    cross join known_entity_types as entity_type
    left join target_entity_views as target
      on target.journey_id = source.journey_id
      and target.locale = source.locale
      and target.entity_type = entity_type.entity_type
      and target.occurred_at >= source.occurred_at
      and target.occurred_at <= source.occurred_at + interval '7 days'
    group by source.locale, entity_type.entity_type

    union all

    select
      'entity_to_agent'::text,
      source.locale,
      source.entity_type,
      'off'::text,
      count(distinct target.journey_id)::bigint,
      count(distinct source.journey_id)::bigint
    from source_entity_views as source
    left join target_agent_starts as target
      on target.journey_id = source.journey_id
      and target.locale = source.locale
      and target.occurred_at >= source.occurred_at
      and target.occurred_at <= source.occurred_at + interval '7 days'
    group by source.locale, source.entity_type

    union all

    -- Booking state is unknown until CTA activation, so each entity-view cohort
    -- is the explicit common denominator for the off/on CTA comparison.
    select
      'entity_to_cta'::text,
      source.locale,
      source.entity_type,
      booking_state.booking_state,
      count(distinct target.journey_id)::bigint,
      count(distinct source.journey_id)::bigint
    from source_entity_views as source
    cross join known_booking_states as booking_state
    left join target_booking_ctas as target
      on target.journey_id = source.journey_id
      and target.locale = source.locale
      and target.entity_type = source.entity_type
      and target.entity_id = source.entity_id
      and target.booking_state = booking_state.booking_state
      and target.occurred_at >= source.occurred_at
      and target.occurred_at <= source.occurred_at + interval '7 days'
    group by source.locale, source.entity_type, booking_state.booking_state

    union all

    select
      case when source.booking_state = 'off'
        then 'cta_to_waitlist_submitted'
        else 'cta_to_checkout_started'
      end,
      source.locale,
      source.entity_type,
      source.booking_state,
      count(distinct target.journey_id)::bigint,
      count(distinct source.journey_id)::bigint
    from source_booking_ctas as source
    left join target_booking_outcomes as target
      on target.journey_id = source.journey_id
      and target.locale = source.locale
      and target.entity_type = source.entity_type
      and target.entity_id = source.entity_id
      and target.booking_state = source.booking_state
      and target.event_name = case when source.booking_state = 'off'
        then 'waitlist_submitted'
        else 'checkout_started'
      end
      and target.occurred_at >= source.occurred_at
      and target.occurred_at <= source.occurred_at + interval '7 days'
    group by source.locale, source.entity_type, source.booking_state

    union all

    select
      'agent_start_rate'::text,
      source.locale,
      null::text,
      'off'::text,
      count(distinct target.journey_id)::bigint,
      count(distinct source.journey_id)::bigint
    from source_journey_starts as source
    left join target_agent_starts as target
      on target.journey_id = source.journey_id
      and target.locale = source.locale
      and target.occurred_at >= source.occurred_at
      and target.occurred_at <= source.occurred_at + interval '7 days'
    group by source.locale

    union all

    select
      'signup_start_to_completion'::text,
      source.locale,
      null::text,
      'off'::text,
      count(distinct target.journey_id)::bigint,
      count(distinct source.journey_id)::bigint
    from source_signup_starts as source
    left join target_signup_completions as target
      on target.journey_id = source.journey_id
      and target.locale = source.locale
      and target.occurred_at >= source.occurred_at
      and target.occurred_at <= source.occurred_at + interval '7 days'
    group by source.locale
  ),
  error_metrics as (
    -- Error rows carry no identifiers. `error_<category>` is a stable report
    -- metric: numerator is the aggregate rejected-event count and denominator
    -- is the aggregate number of affected journeys in the same public slice.
    select
      'error_' || errors.error_category as metric_key,
      errors.locale,
      errors.entity_type,
      coalesce(errors.booking_state, 'off') as booking_state,
      count(*)::bigint as numerator,
      count(distinct errors.journey_id)::bigint as denominator
    from error_events as errors
    group by errors.error_category, errors.locale, errors.entity_type, coalesce(errors.booking_state, 'off')
  ),
  report_metrics as (
    select
      funnel.metric_key,
      funnel.locale,
      funnel.entity_type,
      funnel.booking_state,
      funnel.numerator,
      funnel.denominator
    from funnel_metrics as funnel
    union all
    select
      errors.metric_key,
      errors.locale,
      errors.entity_type,
      errors.booking_state,
      errors.numerator,
      errors.denominator
    from error_metrics as errors
  ),
  -- Keep the report shape stable even when a locale, entity type, booking
  -- state, or error category has no events in the requested window. This lets
  -- the ops UI distinguish an honest zero from an omitted dimension.
  metric_grid as (
    select metric.metric_key, locale.locale, entity.entity_type, 'off'::text as booking_state
    from unnest(array['discovery_to_entity', 'entity_to_agent']::text[]) as metric(metric_key)
    cross join known_locales as locale
    cross join known_entity_types as entity
    union all
    select 'entity_to_cta'::text, locale.locale, entity.entity_type, booking.booking_state
    from known_locales as locale
    cross join known_entity_types as entity
    cross join known_booking_states as booking
    union all
    select 'cta_to_waitlist_submitted'::text, locale.locale, entity.entity_type, 'off'::text
    from known_locales as locale
    cross join known_entity_types as entity
    union all
    select 'cta_to_checkout_started'::text, locale.locale, entity.entity_type, 'on'::text
    from known_locales as locale
    cross join known_entity_types as entity
    union all
    select metric.metric_key, locale.locale, null::text, 'off'::text
    from unnest(array['agent_start_rate', 'signup_start_to_completion']::text[]) as metric(metric_key)
    cross join known_locales as locale
    union all
    select 'error_' || category.error_category, locale.locale, entity.entity_type, booking.booking_state
    from known_error_categories as category
    cross join known_locales as locale
    cross join known_entity_types as entity
    cross join known_booking_states as booking
    union all
    -- Agent and signup failures have no entity context. Keep their NULL
    -- entity-type/off-state cells visible instead of dropping the aggregates
    -- when the fixed entity grid is joined below.
    select 'error_' || category.error_category, locale.locale, null::text, 'off'::text
    from known_error_categories as category
    cross join known_locales as locale
  ),
  coalesced_metrics as (
    select
      grid.metric_key,
      grid.locale,
      grid.entity_type,
      grid.booking_state,
      coalesce(metrics.numerator, 0)::bigint as numerator,
      coalesce(metrics.denominator, 0)::bigint as denominator
    from metric_grid as grid
    left join report_metrics as metrics
      on metrics.metric_key = grid.metric_key
      and metrics.locale = grid.locale
      and metrics.entity_type is not distinct from grid.entity_type
      and metrics.booking_state = grid.booking_state
  )
  select
    cells.metric_key,
    cells.locale,
    cells.entity_type,
    cells.booking_state,
    cells.numerator,
    cells.denominator,
    case
      when cells.denominator < v_sample_floor or cells.denominator = 0 then null
      else round(cells.numerator::numeric / cells.denominator::numeric, 4)
    end as rate,
    cells.denominator as sample_count,
    case when cells.denominator < v_sample_floor then 'insufficient_sample' else 'ok' end as status,
    7 as attribution_window_days
  from coalesced_metrics as cells
  order by cells.metric_key, cells.locale, cells.entity_type nulls first, cells.booking_state;
end;
$$;

revoke all on function public.admin_traveller_analytics_report(timestamptz, timestamptz) from public, anon;
grant execute on function public.admin_traveller_analytics_report(timestamptz, timestamptz) to authenticated;
