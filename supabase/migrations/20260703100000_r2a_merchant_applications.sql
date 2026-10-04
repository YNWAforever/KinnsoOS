-- Phase R2A — Merchant self-serve application funnel.
-- (1) merchant_applications: owner-insert-only (one pending row per user), owner-read-own,
--     ops-read-all. Immutable once submitted — no owner update/delete; the only mutations
--     are the two audited RPCs below (moderator+, reason-required, row-locked, no-op
--     guarded, audited — same shape as the Phase 11 merchant lifecycle RPCs).
-- (2) SECURITY FIX: merchant_profiles_owner_insert let ANY authenticated user insert their
--     OWN merchant_profiles row (any status/tier — no UI ever used this, but the RLS policy
--     was live). Application creation is now RPC-only. Also column-restrict owner UPDATE so
--     an owner can never rewrite their own status/tier via a hand-crafted API call.

create table public.merchant_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company_name text not null,
  contact_name text,
  contact_email text not null
    constraint merchant_applications_email_shape
    check (contact_email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' and char_length(contact_email) <= 254),
  website_url text,
  pitch text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  decided_by_ops_member_id uuid references public.kinnso_ops_members(id),
  decided_at timestamptz,
  decision_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index merchant_applications_one_pending_per_user
  on public.merchant_applications(user_id) where status = 'pending';
create index merchant_applications_user_idx on public.merchant_applications(user_id);
create index merchant_applications_status_idx on public.merchant_applications(status, created_at desc);

alter table public.merchant_applications enable row level security;

create policy merchant_applications_owner_insert on public.merchant_applications
  for insert to authenticated
  with check (user_id = (select auth.uid()) and status = 'pending');

create policy merchant_applications_owner_select on public.merchant_applications
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy merchant_applications_ops_select on public.merchant_applications
  for select to authenticated
  using (public.is_active_ops());

create trigger merchant_applications_set_updated_at
  before update on public.merchant_applications
  for each row execute procedure public.set_updated_at();

-- No owner update/delete policies — an application is immutable once submitted.
revoke all on table public.merchant_applications from anon;
grant select, insert on table public.merchant_applications to authenticated;

-- 2. Approve: creates the real merchant_profiles row, stamps the application, audits.
create or replace function public.admin_approve_merchant_application(p_id uuid, p_reason text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_app public.merchant_applications%rowtype;
  v_existing uuid;
  v_profile_id uuid;
begin
  if not public.is_active_ops_role('moderator') then raise exception 'forbidden' using errcode = '42501'; end if;
  if coalesce(btrim(p_reason), '') = '' then raise exception 'reason_required'; end if;

  select * into v_app from public.merchant_applications where id = p_id for update;
  if not found then raise exception 'not_found'; end if;
  if v_app.status <> 'pending' then raise exception 'not_pending'; end if;

  select id into v_existing from public.merchant_profiles where user_id = v_app.user_id;
  if v_existing is not null then raise exception 'already_merchant'; end if;

  insert into public.merchant_profiles (user_id, company_name, contact_name, contact_email, website_url, status, tier)
  values (v_app.user_id, v_app.company_name, v_app.contact_name, v_app.contact_email, v_app.website_url, 'active', 'free')
  returning id into v_profile_id;

  update public.merchant_applications set
    status = 'approved',
    decided_by_ops_member_id = (select id from public.kinnso_ops_members where user_id = auth.uid() and status = 'active'),
    decided_at = now(),
    decision_reason = p_reason,
    updated_at = now()
  where id = p_id;

  perform public.ops_audit_log_append('merchant_application', p_id, 'application.approved', p_reason,
    jsonb_build_object('merchant_profile_id', v_profile_id));

  return v_profile_id;
end $$;
revoke all on function public.admin_approve_merchant_application(uuid, text) from public, anon;
grant execute on function public.admin_approve_merchant_application(uuid, text) to authenticated;

-- 3. Reject: records the decision only, no merchant_profiles write.
create or replace function public.admin_reject_merchant_application(p_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare v_status text;
begin
  if not public.is_active_ops_role('moderator') then raise exception 'forbidden' using errcode = '42501'; end if;
  if coalesce(btrim(p_reason), '') = '' then raise exception 'reason_required'; end if;

  select status into v_status from public.merchant_applications where id = p_id for update;
  if v_status is null then raise exception 'not_found'; end if;
  if v_status <> 'pending' then raise exception 'not_pending'; end if;

  update public.merchant_applications set
    status = 'rejected',
    decided_by_ops_member_id = (select id from public.kinnso_ops_members where user_id = auth.uid() and status = 'active'),
    decided_at = now(),
    decision_reason = p_reason,
    updated_at = now()
  where id = p_id;

  perform public.ops_audit_log_append('merchant_application', p_id, 'application.rejected', p_reason, '{}'::jsonb);
end $$;
revoke all on function public.admin_reject_merchant_application(uuid, text) from public, anon;
grant execute on function public.admin_reject_merchant_application(uuid, text) to authenticated;

-- 4. SECURITY FIX: close the pre-existing merchant_profiles self-grant hole.
drop policy if exists merchant_profiles_owner_insert on public.merchant_profiles;
revoke insert on public.merchant_profiles from authenticated;
revoke update on public.merchant_profiles from authenticated;
grant update (company_name, contact_name, contact_email, website_url) on public.merchant_profiles to authenticated;
