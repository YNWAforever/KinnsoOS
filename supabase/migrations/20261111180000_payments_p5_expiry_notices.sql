-- P5d: tell travellers and creators when a payment window expires.
--
-- P5c made expired windows sweep automatically, but the transition only wrote the
-- payment ledger; a traveller's trip could be cancelled and a creator's dates freed
-- with no notice. This migration widens the notice vocabularies (inbox, mutes, email
-- outbox) and emits both notices from the same authoritative transaction as the
-- expiry, honouring mutes exactly like the paid notices in P3.
alter table kinnso_internal.inbox_events drop constraint if exists inbox_events_event_type_check;
alter table kinnso_internal.inbox_events add constraint inbox_events_event_type_check check (
  event_type = any (array['place.report_revision','place.report_resolved','support.updated',
                           'booking.requested','booking.accepted','booking.declined','booking.withdrawn',
                           'booking.dates_blocked','booking.paid','booking.payment_received',
                           'booking.payment_expired','booking.payment_window_expired']));

alter table public.notification_mutes drop constraint if exists notification_mutes_event_type_check;
alter table public.notification_mutes add constraint notification_mutes_event_type_check
  check (event_type in ('booking.requested','booking.withdrawn','booking.accepted','booking.declined',
                        'booking.dates_blocked','booking.paid','booking.payment_received',
                        'booking.payment_expired','booking.payment_window_expired'));

alter table public.email_outbox drop constraint if exists email_outbox_event_type_check;
alter table public.email_outbox add constraint email_outbox_event_type_check
  check (event_type in ('booking.requested','booking.withdrawn','booking.accepted','booking.declined',
                        'booking.dates_blocked','booking.paid','booking.payment_received',
                        'booking.payment_expired','booking.payment_window_expired'));

create or replace function public.kinnso_get_notification_mutes() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'eventType', t.event_type,
      'muted', coalesce(m.muted, false)) order by t.position), '[]'::jsonb)
  from (values
    ('booking.requested', 1), ('booking.withdrawn', 2), ('booking.accepted', 3),
    ('booking.declined', 4), ('booking.dates_blocked', 5),
    ('booking.paid', 6), ('booking.payment_received', 7),
    ('booking.payment_expired', 8), ('booking.payment_window_expired', 9)) as t(event_type, position)
  left join public.notification_mutes m
    on m.user_id = kinnso_internal.actor() and m.event_type = t.event_type
  where kinnso_internal.actor() is not null;
$$;

create or replace function public.kinnso_set_notification_mute(p_event_type text, p_muted boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := kinnso_internal.actor();
begin
  if v_actor is null then raise exception 'actor_required' using errcode = '42501'; end if;
  if p_event_type is null or p_event_type not in ('booking.requested','booking.withdrawn','booking.accepted',
       'booking.declined','booking.dates_blocked','booking.paid','booking.payment_received',
       'booking.payment_expired','booking.payment_window_expired') then
    raise exception 'invalid_event_type';
  end if;
  if p_muted is null then raise exception 'invalid_preference'; end if;
  insert into public.notification_mutes (user_id, event_type, muted)
    values (v_actor, p_event_type, p_muted)
    on conflict (user_id, event_type) do update set muted = excluded.muted, updated_at = now();
  return jsonb_build_object('eventType', p_event_type, 'muted', p_muted);
end $$;

-- The sweep emits its notices in the same transaction as the expiry. The loop is
-- intentional: the email payload needs the guide title and booking facts, and a
-- batch is small (only windows past their deadline, normally zero rows).
create or replace function kinnso_internal.expire_payment_windows() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_row record;
  v_count integer := 0;
  v_title text;
  v_starts date;
  v_ends date;
  v_party integer;
  v_payload jsonb;
begin
  for v_row in
    update public.booking_payments
       set status = 'expired', updated_at = now()
     where status in ('requires_payment', 'processing') and deadline_at < now()
     returning id, booking_request_id, traveler_user_id, creator_id, amount_minor, currency
  loop
    v_count := v_count + 1;
    update public.booking_requests r
       set status = 'payment_expired', updated_at = now()
     where r.id = v_row.booking_request_id and r.status = 'awaiting_payment';
    insert into public.payment_events (booking_payment_id, kind, payload)
      values (v_row.id, 'payment.expired', '{}'::jsonb);
    select b.starts_on, b.ends_on, b.party_size, g.title
      into v_starts, v_ends, v_party, v_title
      from public.booking_requests b
      left join public.guides g on g.id = b.guide_id
     where b.id = v_row.booking_request_id;
    v_payload := jsonb_build_object(
      'guideTitle', v_title, 'startsOn', v_starts, 'endsOn', v_ends,
      'partySize', v_party, 'status', 'payment_expired',
      'amountMinor', v_row.amount_minor, 'currency', btrim(v_row.currency::text));
    insert into kinnso_internal.inbox_events (recipient_id, event_type, entity_type, entity_id)
      select v_row.traveler_user_id, 'booking.payment_expired', 'booking_request', v_row.booking_request_id
      where v_row.traveler_user_id is not null
        and not exists (select 1 from public.notification_mutes nm
                         where nm.user_id = v_row.traveler_user_id
                           and nm.event_type = 'booking.payment_expired' and nm.muted);
    insert into kinnso_internal.inbox_events (recipient_id, event_type, entity_type, entity_id)
      select v_row.creator_id, 'booking.payment_window_expired', 'booking_request_creator', v_row.booking_request_id
      where v_row.creator_id is not null
        and not exists (select 1 from public.notification_mutes nm
                         where nm.user_id = v_row.creator_id
                           and nm.event_type = 'booking.payment_window_expired' and nm.muted);
    perform kinnso_internal.enqueue_booking_email(v_row.traveler_user_id, 'booking.payment_expired',
      'booking_request', v_row.booking_request_id, v_payload);
    perform kinnso_internal.enqueue_booking_email(v_row.creator_id, 'booking.payment_window_expired',
      'booking_request', v_row.booking_request_id, v_payload);
  end loop;
  return v_count;
end $$;
revoke all on function kinnso_internal.expire_payment_windows() from public, anon, authenticated;
