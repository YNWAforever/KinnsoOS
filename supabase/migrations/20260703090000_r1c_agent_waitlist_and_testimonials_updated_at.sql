-- R1C: (1) agent_waitlist — honest traveller-agent waitlist capture for /agent.
-- Insert-only for everyone (anon + authenticated); read is ops-only. No update/
-- delete policies (rows are append-only CRM capture; deletion is a manual ops SQL
-- decision until a console surface exists). Unique email = idempotent joins; the
-- server action treats 23505 as success.
-- DOCUMENTED §7 DEVIATION: this is an anon direct table INSERT, not an audited
-- SECURITY DEFINER RPC — acceptable because no money/state is touched, the table
-- is append-only, RLS blocks all reads, and the DB CHECK + unique constraint
-- bound the damage. Abuse control: honeypot in the form (see waitlist-actions);
-- per-IP rate limiting is a recorded carry-forward for the R4 agent hardening.
-- (2) testimonials.updated_at + touch trigger (R1B carry-forward #11).

create table if not exists public.agent_waitlist (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  locale text check (locale is null or locale in ('en','zh-hk','zh-tw','zh-cn','ja','ko','th')),
  created_at timestamptz not null default now(),
  constraint agent_waitlist_email_shape
    check (email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' and char_length(email) <= 254)
);

alter table public.agent_waitlist enable row level security;

drop policy if exists agent_waitlist_public_insert on public.agent_waitlist;
create policy agent_waitlist_public_insert on public.agent_waitlist
  for insert to anon, authenticated
  with check (true);

drop policy if exists agent_waitlist_ops_read on public.agent_waitlist;
create policy agent_waitlist_ops_read on public.agent_waitlist
  for select to authenticated
  using (public.is_active_ops());

revoke all on table public.agent_waitlist from anon, authenticated;
grant insert on table public.agent_waitlist to anon, authenticated;
grant select on table public.agent_waitlist to authenticated;

alter table public.testimonials
  add column if not exists updated_at timestamptz not null default now();

drop trigger if exists testimonials_set_updated_at on public.testimonials;
create trigger testimonials_set_updated_at
  before update on public.testimonials
  for each row execute procedure public.set_updated_at();
