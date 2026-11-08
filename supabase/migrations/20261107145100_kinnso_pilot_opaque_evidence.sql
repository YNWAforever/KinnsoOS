-- Evidence references are identifiers, never URLs or participant content.
create function kinnso_internal.pilot_opaque_evidence_reference(value text)
returns boolean language sql immutable strict set search_path = '' as $$
 select value ~* '^ref:([0-9]{1,20}|[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12})$';
$$;

create function kinnso_internal.pilot_require_opaque_evidence_reference()
returns trigger language plpgsql set search_path = '' as $$
begin
 if new.evidence_reference is not null
   and not kinnso_internal.pilot_opaque_evidence_reference(new.evidence_reference) then
  raise exception 'INVALID';
 end if;
 return new;
end;
$$;

create trigger pilot_evidence_require_opaque_reference
before insert or update of evidence_reference on kinnso_internal.pilot_evidence
for each row execute function kinnso_internal.pilot_require_opaque_evidence_reference();

create trigger pilot_checks_require_opaque_reference
before insert or update of evidence_reference on kinnso_internal.pilot_checks
for each row execute function kinnso_internal.pilot_require_opaque_evidence_reference();

-- Previously stored free text must not substantiate a manual pass.
create or replace function kinnso_internal.pilot_manual_evidence(
 rid uuid, code text, reference text, as_of timestamptz
) returns boolean language sql stable set search_path = '' as $$
 select kinnso_internal.pilot_opaque_evidence_reference(reference) is true and exists(
  select 1 from kinnso_internal.pilot_evidence e
  join kinnso_internal.pilot_runs r on r.id=e.run_id
  join public.kinnso_ops_members m on m.id=e.captured_by_ops_member_id and m.status='active'
  where e.run_id=rid and e.check_code=code and e.evidence_reference=reference
   and e.captured_at>r.acceptance_started_at and e.captured_at<=as_of
   and kinnso_internal.pilot_reference_allowed(
    e.run_id,e.check_code,e.entity_type,e.entity_id,e.participant_id
   )
 );
$$;

revoke all on function kinnso_internal.pilot_opaque_evidence_reference(text),
 kinnso_internal.pilot_require_opaque_evidence_reference() from public, anon, authenticated, service_role;
