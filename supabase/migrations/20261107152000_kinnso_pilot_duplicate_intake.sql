-- The participant RPC locks the run before writing an intake, serializing
-- competing fresh requests. Exact request replay returns before this trigger.
create function kinnso_internal.pilot_reject_duplicate_intake()
returns trigger language plpgsql set search_path = '' as $$
begin
 if new.status <> 'withdrawn' and exists (
  select 1 from kinnso_internal.pilot_content_intakes i
  where i.run_id = new.run_id
    and i.creator_participant_id = new.creator_participant_id
    and i.consent_digest = new.consent_digest
    and i.id <> new.id
    and i.status <> 'withdrawn'
 ) then
  raise exception 'CONFLICT';
 end if;
 return new;
end;
$$;

create trigger pilot_intake_reject_duplicate
before insert or update of consent_digest on kinnso_internal.pilot_content_intakes
for each row execute function kinnso_internal.pilot_reject_duplicate_intake();

revoke all on function kinnso_internal.pilot_reject_duplicate_intake()
from public, anon, authenticated, service_role;
