-- Trip completion for accepted booking requests.
--
-- An accepted request stays "accepted" forever today, so a creator's inbox fills with
-- trips that already happened and the traveller tracker never reaches a resting state.
-- The creator can now mark an accepted request completed once its last day has passed.
-- No money, no contact details and no new notification type are introduced; status is
-- visible in-product to both parties.
alter table public.booking_requests drop constraint if exists booking_requests_status_check;
alter table public.booking_requests add constraint booking_requests_status_check
  check (status in ('requested', 'accepted', 'declined', 'withdrawn', 'completed'));

create or replace function public.kinnso_creator_complete_booking(p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := kinnso_internal.actor();
  v_row public.booking_requests;
begin
  if v_actor is null then raise exception 'actor_required' using errcode = '42501'; end if;
  update public.booking_requests
     set status = 'completed', updated_at = now()
   where id = p_id and creator_id = v_actor and status = 'accepted'
     and coalesce(ends_on, starts_on) < current_date
   returning * into v_row;
  if not found then
    if exists (select 1 from public.booking_requests where id = p_id and creator_id = v_actor and status = 'accepted') then
      raise exception 'trip_not_finished';
    end if;
    raise exception 'request_not_found_or_decided';
  end if;
  return jsonb_build_object('id', v_row.id, 'status', v_row.status, 'updatedAt', v_row.updated_at);
end $$;

revoke all on function public.kinnso_creator_complete_booking(uuid) from public, anon;
grant execute on function public.kinnso_creator_complete_booking(uuid) to authenticated;
