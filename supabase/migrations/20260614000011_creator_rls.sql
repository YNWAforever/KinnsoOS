-- SP2 1a: RLS for creator tables
-- Pattern: owner-scoped via auth.uid(); no anon access to any creator table.
-- No `to <role>` clause — mirrors existing articles RLS style.

alter table public.creators                enable row level security;
alter table public.creator_social_handles  enable row level security;
alter table public.creator_scan_jobs       enable row level security;
alter table public.creator_dna             enable row level security;

-- creators: owner select + update (insert is handled by auth trigger, SECURITY DEFINER)
create policy "creators_owner_select" on public.creators
  for select using (id = auth.uid());

create policy "creators_owner_update" on public.creators
  for update using (id = auth.uid()) with check (id = auth.uid());

-- creator_social_handles: owner full CRUD (creator_id must equal auth.uid())
create policy "creator_social_handles_owner_select" on public.creator_social_handles
  for select using (creator_id = auth.uid());

create policy "creator_social_handles_owner_insert" on public.creator_social_handles
  for insert with check (creator_id = auth.uid());

create policy "creator_social_handles_owner_update" on public.creator_social_handles
  for update using (creator_id = auth.uid()) with check (creator_id = auth.uid());

create policy "creator_social_handles_owner_delete" on public.creator_social_handles
  for delete using (creator_id = auth.uid());

-- creator_scan_jobs: owner select only (service_role writes, bypassing RLS)
create policy "creator_scan_jobs_owner_select" on public.creator_scan_jobs
  for select using (creator_id = auth.uid());

-- creator_dna: owner select + update (service_role inserts after scan)
create policy "creator_dna_owner_select" on public.creator_dna
  for select using (creator_id = auth.uid());

create policy "creator_dna_owner_update" on public.creator_dna
  for update using (creator_id = auth.uid()) with check (creator_id = auth.uid());
