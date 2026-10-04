create table public.session_waitlist (
  id uuid primary key default gen_random_uuid(),
  email text not null check (
    email = lower(btrim(email))
    and char_length(email) <= 254
    and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
  ),
  user_id uuid references auth.users(id) on delete set null,
  locale text not null check (locale in ('en', 'zh-hk', 'zh-tw', 'ja', 'ko', 'th', 'zh-cn')),
  created_at timestamptz not null default now()
);

create unique index session_waitlist_email_lower_key
  on public.session_waitlist (lower(email));

alter table public.session_waitlist enable row level security;

-- Public callers must use the validated, rate-limited server action. The table is
-- appendable only through the existing server-only service-role client after that
-- action has completed its honeypot and rate-limit checks.
revoke all on table public.session_waitlist from public, anon, authenticated;
revoke insert on table public.session_waitlist from anon, authenticated;
grant select on table public.session_waitlist to authenticated;

create policy session_waitlist_ops_read
  on public.session_waitlist for select to authenticated
  using ((select public.is_active_ops()));
