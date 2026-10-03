-- supabase/migrations/20260816090100_r10_2_payout_processing_window_setting.sql
--
-- R10.2: ops-configurable processing-window length for payout batches.
--
-- admin_create_payout_batch() (Task 3) needs a default target_at when ops doesn't supply
-- one. A single-row settings table (rather than a hardcoded constant) lets ops tune the
-- promised turnaround without a code deploy. The row's primary key is `boolean` fixed to
-- `true` — the standard singleton-row trick: the CHECK constraint makes a second row
-- structurally impossible, not just conventionally avoided.
--
-- The audit trail for settings changes has no natural per-row entity id (there is only
-- ever one settings row), so it uses a fixed sentinel uuid rather than a fresh
-- gen_random_uuid() per call — a fresh id every time would mean ops_audit_log's
-- (entity_type, entity_id) index could never group these entries together.

create table public.creator_payout_settings (
  id                        boolean primary key default true,
  processing_window_days    integer not null default 7,
  updated_by_ops_member_id  uuid references public.kinnso_ops_members(id),
  updated_at                timestamptz not null default now(),
  constraint creator_payout_settings_singleton check (id),
  constraint creator_payout_settings_window_positive check (processing_window_days > 0)
);

insert into public.creator_payout_settings (id) values (true);

alter table public.creator_payout_settings enable row level security;
revoke all on public.creator_payout_settings from public, anon, authenticated;

create function public.payout_processing_window_days()
returns integer language sql stable security definer set search_path = public as $$
  select processing_window_days from public.creator_payout_settings where id = true;
$$;
revoke all on function public.payout_processing_window_days() from public, anon, authenticated;
grant execute on function public.payout_processing_window_days() to authenticated;

create or replace function public.admin_set_payout_processing_window(p_days integer, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_old integer;
begin
  if not public.is_active_ops_role('admin') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if coalesce(btrim(p_reason), '') = '' then raise exception 'reason_required'; end if;
  if length(btrim(p_reason)) > 500 then raise exception 'reason_too_long'; end if;
  if p_days is null or p_days <= 0 then raise exception 'bad_window'; end if;

  select processing_window_days into v_old from public.creator_payout_settings where id = true for update;

  update public.creator_payout_settings
    set processing_window_days = p_days,
        updated_by_ops_member_id = (select id from public.kinnso_ops_members where user_id = auth.uid() and status = 'active'),
        updated_at = now()
    where id = true;

  perform public.ops_audit_log_append('payout_settings', '99999999-9999-4999-8999-999999999999'::uuid,
    'payout_settings.window', p_reason,
    jsonb_build_object('processing_window_days', jsonb_build_object('from', v_old, 'to', p_days)));
end;
$$;
revoke all on function public.admin_set_payout_processing_window(integer, text) from public, anon;
grant execute on function public.admin_set_payout_processing_window(integer, text) to authenticated;
