-- R12.1: widen traveller_analytics_events to accept the three offer-funnel event names and
-- an 'offer' entity type. Postgres has no "add value to an existing CHECK" primitive, so both
-- constraints are dropped and recreated with the widened list -- the constraint names and
-- every other value are otherwise unchanged from 20260801090000_r8_0_measurement_baseline.sql.
--
-- Also adds the two columns that let a server-emitted offer_redeemed event (Task 3) still
-- attribute back to the visitor's own consented journey, captured at claim time (Task 2):
-- offer_claims has no other source for either value, since the party who redeems (merchant
-- staff) is not the party whose journey/locale should be recorded.

alter table public.traveller_analytics_events
  drop constraint traveller_analytics_events_event_name_check;
alter table public.traveller_analytics_events
  add constraint traveller_analytics_events_event_name_check check (event_name in (
    'journey_started',
    'entity_viewed',
    'agent_started',
    'booking_cta_clicked',
    'waitlist_submitted',
    'checkout_started',
    'signup_started',
    'signup_completed',
    'offer_viewed',
    'offer_claimed',
    'offer_redeemed'
  ));

alter table public.traveller_analytics_events
  drop constraint traveller_analytics_events_entity_type_check;
alter table public.traveller_analytics_events
  add constraint traveller_analytics_events_entity_type_check check (
    entity_type in ('guide', 'experience', 'creator', 'article', 'offer')
  );

alter table public.offer_claims
  add column analytics_journey_id uuid,
  add column analytics_locale text check (
    analytics_locale is null
    or analytics_locale in ('en', 'zh-hk', 'zh-tw', 'zh-cn', 'ja', 'ko', 'th')
  ),
  add constraint offer_claims_analytics_pair_check check (
    (analytics_journey_id is null and analytics_locale is null)
    or (analytics_journey_id is not null and analytics_locale is not null)
  );
