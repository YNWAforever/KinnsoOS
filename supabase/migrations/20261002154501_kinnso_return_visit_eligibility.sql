-- A return visit means revisiting the connected app with an existing owned journey.
create or replace function public.record_kinnso_return_visit() returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=kinnso_internal.actor();
begin
 if not exists(select 1 from public.trips where owner_user_id=actor) then return jsonb_build_object('accepted',false); end if;
 perform kinnso_internal.record_traveller_event(actor,'return_visit',null,to_char(now() at time zone 'UTC','YYYY-MM-DD'));
 return jsonb_build_object('accepted',true);
end $$;
