-- Source only: apply separately after database authorization and runtime validation.
-- Internal receipts are not accessible to authenticated, so this narrow reader
-- needs definer access. actor() still verifies the actual current auth.sessions row.
create function public.get_trip_creation_receipt(p_request_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := kinnso_internal.actor();
  v_prior kinnso_internal.trip_requests;
  v_trip_id uuid;
  v_payload jsonb;
  v_mask integer;
begin
  if p_request_id is null then raise exception 'invalid_command'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_actor::text || p_request_id::text,0));
  select * into v_prior from kinnso_internal.trip_requests
    where actor_id=v_actor and request_id=p_request_id;
  if not found or v_prior.result->'revision' is distinct from '1'::jsonb
    or v_prior.result->>'id' is distinct from v_prior.trip_id::text then
    return jsonb_build_object('tripId',null);
  end if;

  -- Revision 1 alone is ambiguous: imports and no-op commands also retain it.
  -- Reconstruct only the eight optional-key combinations of a create payload,
  -- and require the exact existing SHA-256 create digest (including its type).
  -- A noncanonical destination UUID spelling/type or a legacy MD5 receipt cannot
  -- be reconstructed from the snapshot: fail closed with null, never infer success.
  for v_mask in 0..7 loop
    v_payload := jsonb_build_object('title',v_prior.result->'title');
    if (v_mask & 1) <> 0 then
      v_payload := v_payload || jsonb_build_object('timezone',v_prior.result->'timezone');
    end if;
    if (v_mask & 2) <> 0 then
      v_payload := v_payload || jsonb_build_object('startDate',v_prior.result->'startDate');
    end if;
    if (v_mask & 4) <> 0 then
      v_payload := v_payload || jsonb_build_object('destinationId',v_prior.result->'destinationId');
    end if;
    if v_prior.digest = kinnso_internal.request_digest(jsonb_build_object('type','create','payload',v_payload)::text) then
      select t.id into v_trip_id from public.trips t
        where t.id=v_prior.trip_id and t.owner_user_id=v_actor;
      return jsonb_build_object('tripId',v_trip_id);
    end if;
  end loop;
  return jsonb_build_object('tripId',null);
end $$;
revoke all on function public.get_trip_creation_receipt(uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_trip_creation_receipt(uuid) to authenticated;
