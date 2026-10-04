-- Slice 3c: creator-authored guides.
-- Owner CRUD via auth.uid(); published rows are publicly readable (anon) to
-- power the ISR /explore grid and /g/[slug] detail. Mirrors creator_* + grants
-- conventions (20260614000009/10/11/12, 20260613000006).

create table public.guides (
  id             uuid primary key default gen_random_uuid(),
  creator_id     uuid not null references public.creators(id) on delete cascade,
  creator_handle text not null,
  creator_name   text not null,
  slug           text not null unique,
  title          text not null,
  summary        text not null,
  cover_url      text not null,
  city           text not null,
  status         text not null default 'draft' check (status in ('draft','published')),
  saves_count    integer not null default 0,
  published_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint guides_published_requires_published_at
    check (status <> 'published' or published_at is not null)
);

create index guides_explore_idx on public.guides (status, published_at desc);
create index guides_creator_idx on public.guides (creator_id);

create trigger guides_set_updated_at
  before update on public.guides
  for each row execute procedure public.set_updated_at();

-- RLS
alter table public.guides enable row level security;

-- Public read of published guides (applies to all roles incl. anon).
create policy "guides_public_read_published" on public.guides
  for select using (status = 'published');

-- Owner can read all own guides (incl. drafts).
create policy "guides_owner_select" on public.guides
  for select using (creator_id = auth.uid());

create policy "guides_owner_insert" on public.guides
  for insert with check (creator_id = auth.uid());

create policy "guides_owner_update" on public.guides
  for update using (creator_id = auth.uid()) with check (creator_id = auth.uid());

create policy "guides_owner_delete" on public.guides
  for delete using (creator_id = auth.uid());

-- Grants (RLS is only checked when the role also has table privilege).
grant select on public.guides to anon, authenticated;
grant insert, update, delete on public.guides to authenticated;

-- Hosted Supabase project-level default privileges auto-grant ALL to anon on
-- every new public table. Published guides are intentionally anon-readable
-- (the select grant above), but anon must never write — revoke explicitly to
-- enforce that at the grant layer (defense-in-depth alongside RLS).
-- Idempotent: a no-op where anon was never auto-granted.
revoke insert, update, delete on public.guides from anon;
