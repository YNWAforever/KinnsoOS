-- E2a: sending support for the email outbox.
--
-- Adds the public flag probe the sender cron needs (it has no user session) and
-- explicit service-role table grants; the outbox keeps no client grants. No
-- provider is configured by this migration, so nothing sends until E2b sets one.
create or replace function public.kinnso_email_delivery_enabled() returns boolean
language sql stable security definer set search_path = '' as $$
  select kinnso_internal.email_outbox_enabled();
$$;
revoke all on function public.kinnso_email_delivery_enabled() from public, authenticated;
grant execute on function public.kinnso_email_delivery_enabled() to anon, authenticated;

grant select, insert, update on public.email_outbox to service_role;
