-- Compare the actual stored input fields after RPC canonicalization. The
-- consent digest remains the receipt of the submitted consent payload.
create or replace function kinnso_internal.pilot_reject_duplicate_intake()
returns trigger language plpgsql set search_path = '' as $$
begin
 if new.status <> 'withdrawn' and exists (
  select 1 from kinnso_internal.pilot_content_intakes i
  where i.run_id = new.run_id
    and i.creator_participant_id = new.creator_participant_id
    and i.id <> new.id
    and i.status <> 'withdrawn'
    and row(i.title, i.destination, i.authored_locale, i.source_summary,
      i.source_urls, i.rights_basis, i.rights_evidence_reference,
      i.author_consent_version, i.author_consent_digest,
      i.cover_rights_confirmed, i.cover_rights_evidence_reference)
    is not distinct from
    row(new.title, new.destination, new.authored_locale, new.source_summary,
      new.source_urls, new.rights_basis, new.rights_evidence_reference,
      new.author_consent_version, new.author_consent_digest,
      new.cover_rights_confirmed, new.cover_rights_evidence_reference)
 ) then
  raise exception 'CONFLICT';
 end if;
 return new;
end;
$$;

revoke all on function kinnso_internal.pilot_reject_duplicate_intake()
from public, anon, authenticated, service_role;
