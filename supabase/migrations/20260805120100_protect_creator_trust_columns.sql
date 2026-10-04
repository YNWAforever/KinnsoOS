-- R8.2: stop creators from moderating themselves.
--
-- 20260717124836 re-granted column-level UPDATE on public.creators to
-- `authenticated` and included `status` and `verified` in the list, while
-- `creators_owner_update` (20260614000011) allows a row owner to update their
-- own row. Those two columns are the moderation and trust signals that
-- `admin_set_creator_status` / `admin_set_creator_verified` exist to own, so a
-- suspended or banned creator could restore themselves, and anyone could award
-- themselves the verified badge, with a single PostgREST update:
--
--   update public.creators set status = 'active', verified = true
--   where id = auth.uid();
--
-- `verified` is never written by application code (only by the moderator RPC),
-- so its column privilege is simply withdrawn.
--
-- `status` cannot be withdrawn the same way: finishing onboarding is a
-- self-service step — components/onboarding/DnaReviewForm.tsx sets
-- status = 'active' on the creator's own row through the browser client. So the
-- column stays writable and a trigger constrains WHICH transition an owner may
-- make: only 'onboarding' -> 'active'. Every other transition, in particular
-- anything leaving 'suspended' or 'banned', stays a moderation decision.
--
-- SECURITY DEFINER moderation RPCs are unaffected: they run as the function
-- owner, so neither the column grant nor the `is_active_ops()` branch applies.

revoke update on public.creators from authenticated;
grant update (
  id, display_name, status, created_at, updated_at, handle, bio, public_profile
) on public.creators to authenticated;

create or replace function public.protect_creator_trust_columns()
returns trigger language plpgsql set search_path = public as $$
begin
  -- Only the browser-facing roles are constrained. Trusted backends
  -- (service_role: the scan worker, ops backfills, test fixtures) and the
  -- SECURITY DEFINER moderation RPCs — which execute as the function owner,
  -- not as `authenticated` — must pass through untouched.
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  -- An ops member editing their own creator row directly is still moderation.
  if public.is_active_ops() then
    return new;
  end if;

  if new.verified is distinct from old.verified then
    raise exception 'forbidden_verified_override' using errcode = '42501';
  end if;

  if new.status is distinct from old.status
     and not (old.status = 'onboarding' and new.status = 'active') then
    raise exception 'forbidden_status_override' using errcode = '42501';
  end if;

  return new;
end $$;

revoke all on function public.protect_creator_trust_columns()
  from public, anon, authenticated, service_role;

drop trigger if exists creators_protect_trust_columns on public.creators;
create trigger creators_protect_trust_columns
  before update on public.creators
  for each row execute procedure public.protect_creator_trust_columns();
