-- supabase/migrations/20260704160000_r3b_merchant_booking_access_and_completion.sql

-- Closes the confirmed gap: no merchant-facing SELECT policy exists on `bookings` today.
create policy bookings_merchant_select on public.bookings
  for select
  to authenticated
  using (
    experience_id in (
      select e.id from public.experiences e
      where e.merchant_profile_id in (
        select mp.id from public.merchant_profiles mp where mp.user_id = auth.uid()
      )
    )
  );

create or replace function public.mark_booking_completed(p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_is_owner boolean;
begin
  select b.status,
    exists (
      select 1 from public.experiences e
      join public.merchant_profiles mp on mp.id = e.merchant_profile_id
      where e.id = b.experience_id and mp.user_id = auth.uid()
    )
  into v_status, v_is_owner
  from public.bookings b
  where b.id = p_booking_id
  for update;

  if not found then raise exception 'not_found'; end if;
  if not v_is_owner then raise exception 'forbidden' using errcode = '42501'; end if;
  if v_status <> 'confirmed' then raise exception 'bad_transition'; end if;

  update public.bookings set status = 'completed', updated_at = now() where id = p_booking_id;

  insert into public.booking_events (booking_id, event_type, metadata)
  values (p_booking_id, 'merchant_completed', '{}'::jsonb);
end;
$$;

revoke all on function public.mark_booking_completed from public, anon, authenticated;
grant execute on function public.mark_booking_completed to authenticated;
