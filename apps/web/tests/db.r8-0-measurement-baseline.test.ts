import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = resolve(
  import.meta.dirname,
  '../../../supabase/migrations/20260801090000_r8_0_measurement_baseline.sql',
)

describe('R8.0 private traveller analytics ledger migration', () => {
  const sql = () => readFileSync(migration, 'utf8').toLowerCase()

  it('creates only the minimal private event ledger and its retry key', () => {
    const text = sql()
    const ledgerStart = text.indexOf('create table public.traveller_analytics_events')
    const ledgerDefinition = text.slice(ledgerStart, text.indexOf('create index', ledgerStart))
    expect(text).toContain('create table public.traveller_analytics_events')
    expect(text).toContain('client_event_id uuid not null')
    expect(text).toContain('journey_id uuid not null')
    expect(text).toMatch(/entity_id text check \(\s*char_length\(entity_id\) between 1 and 120\s*and entity_id ~ '\^\[a-za-z0-9_-\]\+\$'/)
    expect(text).toContain('unique (journey_id, client_event_id)')
    expect(text).toContain('account_id uuid')
    for (const eventName of [
      'journey_started',
      'entity_viewed',
      'agent_started',
      'booking_cta_clicked',
      'waitlist_submitted',
      'checkout_started',
      'signup_started',
      'signup_completed',
    ]) {
      expect(text).toContain(`'${eventName}'`)
    }
    for (const prohibitedColumn of ['email', 'ip', 'user_agent', 'prompt', 'title', 'query', 'jsonb']) {
      expect(ledgerDefinition).not.toMatch(new RegExp(`\\b${prohibitedColumn}\\b`, 'i'))
    }
  })

  it('locks both private tables to the service role', () => {
    const text = sql()
    for (const tableName of ['traveller_analytics_events', 'traveller_analytics_rate_limits']) {
      expect(text).toContain(`alter table public.${tableName} enable row level security`)
      expect(text).toContain(`revoke all on table public.${tableName} from public, anon, authenticated`)
      expect(text).toContain(`grant all on table public.${tableName} to service_role`)
    }
  })

  it('uses a fixed, narrow throttle and eight-day retention', () => {
    const text = sql()
    expect(text).toContain('check_and_increment_traveller_analytics_rate_limit')
    expect(text).toContain('security definer')
    expect(text).toContain('set search_path = public')
    expect(text).toContain('120')
    expect(text).toContain('600')
    expect(text).toContain("interval '8 days'")
    expect(text).toContain('purge_traveller_analytics_events')
    expect(text).toContain('grant execute on function public.purge_traveller_analytics_events() to service_role')
  })

  it('bounds client timestamps at the ledger boundary', () => {
    const text = sql()
    expect(text).toContain('traveller_analytics_occurred_at_skew_check')
    expect(text).toContain("occurred_at >= received_at - interval '15 minutes'")
    expect(text).toContain("occurred_at <= received_at + interval '15 minutes'")
  })

  it('exposes only an ops-gated aggregate report to authenticated callers', () => {
    const text = sql()
    expect(text).toContain('admin_traveller_analytics_report')
    expect(text).toContain('stable')
    expect(text).toContain('if not public.is_active_ops() then')
    expect(text).toContain("interval '7 days'")
    expect(text).toContain('insufficient_sample')
    expect(text).toContain('sample_floor constant integer := 10')
    expect(text).toContain('count(distinct')
    expect(text).toContain('booking_state')
    expect(text).toContain('revoke all on function public.admin_traveller_analytics_report')
    expect(text).toContain('grant execute on function public.admin_traveller_analytics_report(timestamptz, timestamptz) to authenticated')
    expect(text).toContain('7 as attribution_window_days')
    expect(text).not.toContain('v_window_days')
  })

  it('uses stage-specific funnel denominators instead of all-event cohorts', () => {
    const text = sql()
    expect(text).not.toContain('cohorts as')
    expect(text).toContain('funnel_metrics as')
    expect(text).toContain("'discovery_to_entity'")
    expect(text).toContain("'entity_to_agent'")
    expect(text).toContain("'entity_to_cta'")
    expect(text).toContain("'cta_to_waitlist_submitted'")
    expect(text).toContain("'cta_to_checkout_started'")
    expect(text).toContain("'agent_start_rate'")
    expect(text).toContain("'signup_start_to_completion'")
    expect(text).toContain('and target.occurred_at >= source.occurred_at')
    expect(text).toContain('target.occurred_at <= source.occurred_at + interval \'7 days\'')
    expect(text).toContain("te.event_name = 'checkout_started' and te.booking_state = 'on' and te.outcome = 'created'")
    expect(text).not.toContain("te.event_name = 'checkout_started' and te.booking_state = 'on' and te.outcome = 'success'")
  })

  it('qualifies report columns and keeps zero-volume dimensions visible', () => {
    const text = sql()
    expect(text).toContain('from public.traveller_analytics_events as se')
    expect(text).toContain('from public.traveller_analytics_events as te')
    expect(text).toContain('metric_grid as (')
    expect(text).toContain("known_locales as (")
    expect(text).toContain("known_entity_types as (")
    expect(text).toContain("known_booking_states as (")
    expect(text).toContain("known_error_categories as (")
    expect(text).toContain('left join report_metrics as metrics')
    expect(text).toContain('metrics.entity_type is not distinct from grid.entity_type')
    expect(text).toContain('coalesce(metrics.numerator, 0)::bigint')
    expect(text).toContain('coalesce(metrics.denominator, 0)::bigint')
    expect(text).toContain('from coalesced_metrics as cells')
    expect(text).toContain('order by cells.metric_key, cells.locale, cells.entity_type nulls first, cells.booking_state')
  })

  it('keeps source cohorts in the requested range while retaining seven-day targets after it', () => {
    const text = sql()
    const sourceStart = text.indexOf('source_events as')
    const targetStart = text.indexOf('retained_target_events as')
    const sourceJourneyStarts = text.indexOf('source_journey_starts as')
    const sourceScope = text.slice(sourceStart, targetStart)
    const targetScope = text.slice(targetStart, sourceJourneyStarts)

    expect(sourceScope).toContain('e.received_at >= p_window_start')
    expect(sourceScope).toContain('e.received_at < p_window_end')
    expect(targetScope).toContain('e.received_at >= p_window_start')
    expect(targetScope).not.toContain('p_window_end')
    expect(text).toContain('from retained_target_events')
    expect(text).toContain('target.occurred_at <= source.occurred_at + interval \'7 days\'')
  })

  it('returns privacy-safe error aggregates for every allowed error category', () => {
    const text = sql()
    expect(text).toContain('error_category')
    expect(text).toContain('error_events as')
    expect(text).toContain("outcome = 'error'")
    for (const errorCategory of ['invalid', 'rate_limited', 'unavailable', 'unknown']) {
      expect(text).toContain(`'${errorCategory}'`)
    }
    expect(text).toContain("'error_' || errors.error_category")
    expect(text).toContain("coalesce(errors.booking_state, 'off') as booking_state")
    expect(text).toContain('count(*)::bigint as numerator')
    expect(text).toContain('count(distinct errors.journey_id)::bigint as denominator')
  })
})
