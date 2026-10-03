create table public.kinnso_place_facts (
 place_id uuid primary key references public.places(id) on delete cascade,
 timezone text not null, opening_hours jsonb, verified_at timestamptz, source_url text,
 published boolean not null default false,
 check(source_url is null or source_url~'^https://[^\s]+$'),
 check(opening_hours is null or jsonb_typeof(opening_hours)='array')
);
alter table public.kinnso_place_facts enable row level security;
revoke all on public.kinnso_place_facts from public,anon,authenticated;
grant select on public.kinnso_place_facts to anon,authenticated;
create policy kinnso_place_facts_read on public.kinnso_place_facts for select to anon,authenticated using(published);
create table public.kinnso_place_reports (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
 place_id uuid not null references public.places(id) on delete cascade,
 reason text not null check(length(reason) between 10 and 2000),
 status text not null default 'open' check(status in ('open','reviewed','resolved')),
 created_at timestamptz not null default now()
);
alter table public.kinnso_place_reports enable row level security;
revoke all on public.kinnso_place_reports from public,anon,authenticated;
grant select on public.kinnso_place_reports to authenticated;
create policy kinnso_place_reports_owner on public.kinnso_place_reports for select to authenticated using(owner_id=(select auth.uid()));
create function public.report_kinnso_place(p_place_id uuid,p_reason text) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=kinnso_internal.actor(); id uuid;
begin
 if p_reason is null or length(btrim(p_reason)) not between 10 and 2000 or not exists(select 1 from public.places where public.places.id=p_place_id) then raise exception 'invalid_report'; end if;
 if (select count(*) from public.kinnso_place_reports where owner_id=actor and created_at>now()-interval '1 day')>=20 then raise exception 'invalid_report_quota'; end if;
 insert into public.kinnso_place_reports(owner_id,place_id,reason) values(actor,p_place_id,btrim(p_reason)) returning kinnso_place_reports.id into id;
 return jsonb_build_object('id',id,'status','open');
end $$;
create function public.kinnso_guide_authoring(p_guide_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=kinnso_internal.actor(); result jsonb;
begin
 if not exists(select 1 from public.creators where id=actor and status='active') then raise exception 'creator_required'; end if;
 if not exists(select 1 from public.guides where id=p_guide_id and creator_id=actor) then raise exception 'guide_not_found'; end if;
 select jsonb_build_object('version',version,'content',content) into result from public.guide_versions where guide_id=p_guide_id order by version desc limit 1;
 return coalesce(result,jsonb_build_object('version',0,'content',null));
end $$;
revoke all on function public.report_kinnso_place(uuid,text),public.kinnso_guide_authoring(uuid) from public,anon;
grant execute on function public.report_kinnso_place(uuid,text),public.kinnso_guide_authoring(uuid) to authenticated;
