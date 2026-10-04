drop function if exists public.create_travelpayouts_partner_link(
  uuid,
  uuid,
  uuid,
  text,
  text,
  text
);

create or replace function app_private.prepare_affiliate_partner_link_insert()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  participant_creator_id uuid;
begin
  if current_setting('request.jwt.claim.role', true) = 'service_role'
    or current_user = 'service_role' then
    return new;
  end if;

  select participant.creator_id
  into participant_creator_id
  from public.mission_participants participant
  where participant.id = new.mission_participant_id;

  if actor_id is not null and actor_id = participant_creator_id then
    new.sub_id := 'pending:' || gen_random_uuid()::text;
    new.partner_url := new.original_url;
    new.external_status := 'pending';
  end if;

  return new;
end;
$$;

revoke all on function app_private.prepare_affiliate_partner_link_insert() from public;
