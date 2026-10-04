-- Add only the R10.3 notifications prerequisite absent from the restored production
-- contract. Do not replay the financial backlog, install provider integrations,
-- reconstruct historical events, or replace an already compatible relation.
-- Existing relations are checked, never repaired or granted extra privileges.
do $prerequisite$
declare
  notification_relation oid := pg_catalog.to_regclass('public.notifications');
  expected record;
  actual record;
  id_column smallint;
  creator_column smallint;
  payload_column smallint;
  read_column smallint;
  created_column smallint;
  authenticated_role oid;
  service_role_id oid;
  relation_owner oid;
begin
  if notification_relation is null then
    create table public.notifications (
      id uuid primary key default pg_catalog.gen_random_uuid(),
      creator_id uuid not null references public.creators(id) on delete cascade,
      notification_type text not null,
      entity_type text not null,
      entity_id uuid not null,
      payload jsonb not null default '{}'::jsonb,
      read_at timestamptz,
      created_at timestamptz not null default pg_catalog.now(),
      constraint notifications_payload_size check (pg_catalog.pg_column_size(payload) <= 8192)
    );
    create index notifications_creator_created_idx on public.notifications (creator_id, created_at desc);
    create index notifications_creator_unread_idx on public.notifications (creator_id) where read_at is null;
    alter table public.notifications enable row level security;
    create policy notifications_select_own on public.notifications
      for select to authenticated using (creator_id = auth.uid());
    create policy notifications_update_own on public.notifications
      for update to authenticated using (creator_id = auth.uid()) with check (creator_id = auth.uid());
    -- Explicitly remove hosted/default grants. SECURITY DEFINER trigger/RPC owners
    -- write; users retain only the original own-row read and read_at update path.
    revoke all on public.notifications from public, anon, authenticated, service_role;
    grant select on public.notifications to authenticated;
    grant update (read_at) on public.notifications to authenticated;
    notification_relation := pg_catalog.to_regclass('public.notifications');
  end if;

  -- Fail closed on an incompatible existing object; there is no ALTER/repair path.
  select c.relowner into relation_owner from pg_catalog.pg_class c
    where c.oid = notification_relation and c.relkind = 'r'
      and c.relrowsecurity and not c.relforcerowsecurity;
  if not found then raise exception 'notifications_prerequisite_incompatible_relation_or_rls'; end if;
  select oid into authenticated_role from pg_catalog.pg_roles where rolname = 'authenticated';
  select oid into service_role_id from pg_catalog.pg_roles where rolname = 'service_role';
  if authenticated_role is null or service_role_id is null
    or exists(select 1 from pg_catalog.pg_roles where rolname in ('anon','authenticated') and (rolsuper or rolbypassrls))
    or relation_owner in (authenticated_role,service_role_id)
    or relation_owner = (select oid from pg_catalog.pg_roles where rolname = 'anon') then
    raise exception 'notifications_prerequisite_incompatible_owner_or_roles';
  end if;

  if (select count(*) from pg_catalog.pg_attribute where attrelid=notification_relation and attnum>0 and not attisdropped) <> 8 then
    raise exception 'notifications_prerequisite_incompatible_columns';
  end if;
  for expected in select * from (values
    ('id','uuid',true,'gen_random_uuid()'),
    ('creator_id','uuid',true,null),
    ('notification_type','text',true,null),
    ('entity_type','text',true,null),
    ('entity_id','uuid',true,null),
    ('payload','jsonb',true,'''{}''::jsonb'),
    ('read_at','timestamp with time zone',false,null),
    ('created_at','timestamp with time zone',true,'now()')
  ) as columns(name,type_name,required,default_expression) loop
    select a.attnum,a.atttypid,a.atttypmod,a.attnotnull,a.attidentity,a.attgenerated,
      pg_catalog.replace(pg_catalog.pg_get_expr(d.adbin,d.adrelid),'pg_catalog.','') as default_expression
      into actual from pg_catalog.pg_attribute a
      left join pg_catalog.pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
      where a.attrelid=notification_relation and a.attname=expected.name and a.attnum>0 and not a.attisdropped;
    if not found or actual.atttypid is distinct from pg_catalog.to_regtype(expected.type_name)::oid
      or actual.atttypmod <> -1 or actual.attnotnull is distinct from expected.required
      or actual.attidentity <> '' or actual.attgenerated <> ''
      or actual.default_expression is distinct from expected.default_expression then
      raise exception 'notifications_prerequisite_incompatible_column: %', expected.name;
    end if;
  end loop;
  select attnum into id_column from pg_catalog.pg_attribute where attrelid=notification_relation and attname='id';
  select attnum into creator_column from pg_catalog.pg_attribute where attrelid=notification_relation and attname='creator_id';
  select attnum into payload_column from pg_catalog.pg_attribute where attrelid=notification_relation and attname='payload';
  select attnum into read_column from pg_catalog.pg_attribute where attrelid=notification_relation and attname='read_at';
  select attnum into created_column from pg_catalog.pg_attribute where attrelid=notification_relation and attname='created_at';

  if (select count(*) from pg_catalog.pg_constraint where conrelid=notification_relation) <> 3
    or not exists(select 1 from pg_catalog.pg_constraint where conrelid=notification_relation and contype='p'
      and conkey=array[id_column] and convalidated and not condeferrable)
    or not exists(select 1 from pg_catalog.pg_constraint where conrelid=notification_relation and contype='f'
      and conkey=array[creator_column] and confrelid=pg_catalog.to_regclass('public.creators')
      and confkey=array[(select attnum from pg_catalog.pg_attribute where attrelid=pg_catalog.to_regclass('public.creators') and attname='id')]
      and confdeltype='c' and confupdtype='a' and convalidated and not condeferrable)
    or not exists(select 1 from pg_catalog.pg_constraint where conrelid=notification_relation and contype='c'
      and conkey=array[payload_column] and convalidated
      and pg_catalog.regexp_replace(pg_catalog.replace(pg_catalog.pg_get_expr(conbin,conrelid),'pg_catalog.',''),'[[:space:]()]','','g')='pg_column_sizepayload<=8192') then
    raise exception 'notifications_prerequisite_incompatible_constraints';
  end if;

  if (select count(*) from pg_catalog.pg_index where indrelid=notification_relation) <> 3
    or not exists(select 1 from pg_catalog.pg_index i join pg_catalog.pg_class x on x.oid=i.indexrelid
      join pg_catalog.pg_am am on am.oid=x.relam where i.indrelid=notification_relation
      and x.relname='notifications_creator_created_idx' and am.amname='btree'
      and i.indisvalid and i.indisready and not i.indisunique and i.indnkeyatts=2 and i.indnatts=2
      and i.indkey[0]=creator_column and i.indkey[1]=created_column and i.indoption[0]=0 and i.indoption[1]=3
      and i.indexprs is null and i.indpred is null)
    or not exists(select 1 from pg_catalog.pg_index i join pg_catalog.pg_class x on x.oid=i.indexrelid
      join pg_catalog.pg_am am on am.oid=x.relam where i.indrelid=notification_relation
      and x.relname='notifications_creator_unread_idx' and am.amname='btree'
      and i.indisvalid and i.indisready and not i.indisunique and i.indnkeyatts=1 and i.indnatts=1
      and i.indkey[0]=creator_column and i.indoption[0]=0 and i.indexprs is null
      and pg_catalog.lower(pg_catalog.regexp_replace(pg_catalog.pg_get_expr(i.indpred,i.indrelid),'[[:space:]()]','','g'))='read_atisnull') then
    raise exception 'notifications_prerequisite_incompatible_indexes';
  end if;

  -- Original R10.3 policies apply to PUBLIC; new creation restricts to authenticated.
  -- Either scope has the same effective own-row authority under the checked ACLs.
  if (select count(*) from pg_catalog.pg_policy where polrelid=notification_relation) <> 2
    or not exists(select 1 from pg_catalog.pg_policy where polrelid=notification_relation
      and polname='notifications_select_own' and polcmd='r' and polpermissive
      and polroles in (array[0::oid],array[authenticated_role]) and polwithcheck is null
      and pg_catalog.regexp_replace(pg_catalog.pg_get_expr(polqual,polrelid),'[[:space:]()]','','g')='creator_id=auth.uid')
    or not exists(select 1 from pg_catalog.pg_policy where polrelid=notification_relation
      and polname='notifications_update_own' and polcmd='w' and polpermissive
      and polroles in (array[0::oid],array[authenticated_role])
      and pg_catalog.regexp_replace(pg_catalog.pg_get_expr(polqual,polrelid),'[[:space:]()]','','g')='creator_id=auth.uid'
      and pg_catalog.regexp_replace(pg_catalog.pg_get_expr(polwithcheck,polrelid),'[[:space:]()]','','g')='creator_id=auth.uid') then
    raise exception 'notifications_prerequisite_incompatible_policies';
  end if;

  -- Preserve the historical trusted service_role ACL on an existing canonical
  -- table; never add it. Reject any public/anonymous or extra client write grant,
  -- including inherited privileges and column grants outside read_at UPDATE.
  if exists(select 1 from pg_catalog.pg_class c cross join lateral pg_catalog.aclexplode(c.relacl) acl
      where c.oid=notification_relation and acl.grantee not in (relation_owner,service_role_id)
      and (acl.grantee<>authenticated_role or acl.privilege_type<>'SELECT' or acl.is_grantable))
    or exists(select 1 from pg_catalog.pg_attribute a cross join lateral pg_catalog.aclexplode(a.attacl) acl
      where a.attrelid=notification_relation and acl.grantee not in (relation_owner,service_role_id)
      and (acl.grantee<>authenticated_role or acl.is_grantable
        or not(acl.privilege_type='SELECT' or (acl.privilege_type='UPDATE' and a.attnum=read_column))))
    or pg_catalog.has_table_privilege('anon',notification_relation,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
    or pg_catalog.has_any_column_privilege('anon',notification_relation,'SELECT,INSERT,UPDATE,REFERENCES')
    or pg_catalog.has_table_privilege('authenticated',notification_relation,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
    or pg_catalog.has_any_column_privilege('authenticated',notification_relation,'INSERT,REFERENCES')
    or not pg_catalog.has_table_privilege('authenticated',notification_relation,'SELECT')
    or not pg_catalog.has_column_privilege('authenticated',notification_relation,read_column,'UPDATE')
    or exists(select 1 from pg_catalog.pg_attribute a where a.attrelid=notification_relation and a.attnum>0 and not a.attisdropped
      and a.attnum<>read_column and pg_catalog.has_column_privilege('authenticated',notification_relation,a.attnum,'UPDATE')) then
    raise exception 'notifications_prerequisite_incompatible_grants';
  end if;
  if exists(select 1 from pg_catalog.pg_trigger where tgrelid=notification_relation and not tgisinternal) then
    raise exception 'notifications_prerequisite_unexpected_table_trigger';
  end if;
end;
$prerequisite$;
