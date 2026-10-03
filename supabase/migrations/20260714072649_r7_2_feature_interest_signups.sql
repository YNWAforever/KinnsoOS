create table public.feature_interest_signups (
  id uuid primary key default gen_random_uuid(),
  feature text not null check (feature in ('agent', 'booking', 'sessions')),
  email text not null,
  locale text not null check (locale in ('en', 'zh-hk', 'zh-tw', 'zh-cn', 'ja', 'ko', 'th')),
  created_at timestamptz not null default now(),
  unique (feature, email)
);

alter table public.feature_interest_signups enable row level security;
revoke all on table public.feature_interest_signups from anon, authenticated;
grant select on table public.feature_interest_signups to authenticated;

create policy feature_interest_signups_ops_read
  on public.feature_interest_signups for select to authenticated
  using (public.is_active_ops());

create or replace function public.join_feature_interest(p_feature text, p_email text, p_locale text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(btrim(p_email));
begin
  if p_feature is null or p_feature not in ('agent', 'booking', 'sessions') then
    raise exception 'invalid_feature' using errcode = '22023';
  end if;

  if v_email is null
     or v_email !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
     or not (char_length(v_email) <= 254) then
    raise exception 'invalid_email' using errcode = '22023';
  end if;

  if p_locale is null or p_locale not in ('en', 'zh-hk', 'zh-tw', 'zh-cn', 'ja', 'ko', 'th') then
    raise exception 'invalid_locale' using errcode = '22023';
  end if;

  insert into public.feature_interest_signups (feature, email, locale)
  values (p_feature, v_email, p_locale)
  on conflict (feature, email) do nothing;

  return true;
end;
$$;

revoke all on function public.join_feature_interest(text, text, text) from public;
grant execute on function public.join_feature_interest(text, text, text) to anon, authenticated;
