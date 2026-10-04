-- SP2 1a: shared updated_at trigger function + per-table triggers
-- (no prior set_updated_at function exists; this is net-new)
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger creators_set_updated_at
  before update on public.creators
  for each row execute procedure public.set_updated_at();

create trigger creator_scan_jobs_set_updated_at
  before update on public.creator_scan_jobs
  for each row execute procedure public.set_updated_at();

create trigger creator_dna_set_updated_at
  before update on public.creator_dna
  for each row execute procedure public.set_updated_at();
