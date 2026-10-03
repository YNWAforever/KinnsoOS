-- Phase 5C: Creator Copilot message log. One rolling thread per creator (v1).
-- Creator-private: ownership model is auth.uid() == creators.id == creator_id.
create table public.copilot_messages (
  id          uuid primary key default gen_random_uuid(),
  creator_id  uuid not null references public.creators(id) on delete cascade,
  role        text not null check (role in ('user','assistant')),
  content     text not null,
  tool_calls  jsonb,
  archived    boolean not null default false,
  created_at  timestamptz not null default now()
);

create index copilot_messages_creator_active_idx
  on public.copilot_messages (creator_id, created_at)
  where archived = false;

alter table public.copilot_messages enable row level security;

create policy copilot_messages_owner_select on public.copilot_messages
  for select using (creator_id = auth.uid());
create policy copilot_messages_owner_insert on public.copilot_messages
  for insert with check (creator_id = auth.uid());
create policy copilot_messages_owner_update on public.copilot_messages
  for update using (creator_id = auth.uid()) with check (creator_id = auth.uid());

-- Copilot content is private; never expose to anon.
revoke all on public.copilot_messages from anon;
