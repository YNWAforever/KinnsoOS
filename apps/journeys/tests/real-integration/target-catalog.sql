-- Prepared only. Execute only on the newly approved, identity-attested target.
-- psql -X -q -t -A with default_transaction_read_only=on; no product RPCs.
begin read only;
set local statement_timeout='10s';
set local lock_timeout='3s';
with
functions(label,signature) as (values
 ('actor','kinnso_internal.actor()'),
 ('create','public.create_trip_v2(uuid,jsonb)'),
 ('adopt','public.adopt_guide_to_trip(uuid,integer,uuid,integer,uuid)'),
 ('receipt','public.get_trip_creation_receipt(uuid)')
),
metadata as (
 select f.label,p.oid,p.proowner,p.proacl,p.prosecdef,p.proconfig,p.prosrc,
 pg_catalog.pg_get_functiondef(p.oid) as definition
 from functions f left join pg_catalog.pg_proc p on p.oid=pg_catalog.to_regprocedure(f.signature)
),
receipt as (select * from metadata where label='receipt')
select pg_catalog.jsonb_build_object(
 'database',pg_catalog.current_database(),
 'serverVersionNum',pg_catalog.current_setting('server_version_num')::integer,
 'migrationVersions',(select pg_catalog.jsonb_agg(version::text order by version::text) from supabase_migrations.schema_migrations),
 'tripRequestsRls',coalesce((select relrowsecurity from pg_catalog.pg_class where oid='kinnso_internal.trip_requests'::regclass),false),
 'tripRequestsPrivate',not exists(
  select 1 from (values ('anon'),('authenticated')) roles(name)
  where pg_catalog.has_schema_privilege(roles.name,'kinnso_internal','USAGE')
   or pg_catalog.has_table_privilege(roles.name,'kinnso_internal.trip_requests','SELECT,INSERT,UPDATE,DELETE')
   or pg_catalog.has_any_column_privilege(roles.name,'kinnso_internal.trip_requests','SELECT,INSERT,UPDATE')
 ),
 'actorRequestPk',exists(select 1 from pg_catalog.pg_constraint c
  where c.conrelid='kinnso_internal.trip_requests'::regclass and c.contype='p' and c.convalidated
  and array(select a.attname::text from pg_catalog.unnest(c.conkey) with ordinality k(attnum,position)
   join pg_catalog.pg_attribute a on a.attrelid=c.conrelid and a.attnum=k.attnum order by k.position)=array['actor_id','request_id']),
 'receiptDefiner',coalesce((select prosecdef from receipt),false),
 'receiptSearchPathEmpty',coalesce((select 'search_path=""'=any(proconfig) or 'search_path='=any(proconfig) from receipt),false),
 'receiptExecuteAuthOnly',coalesce((select
  pg_catalog.has_function_privilege('authenticated',r.oid,'EXECUTE')
  and not pg_catalog.has_function_privilege('anon',r.oid,'EXECUTE')
  and not pg_catalog.has_function_privilege('service_role',r.oid,'EXECUTE')
  and not exists(select 1 from pg_catalog.aclexplode(coalesce(r.proacl,pg_catalog.acldefault('f',r.proowner))) acl
   where acl.privilege_type='EXECUTE' and acl.grantee not in (r.proowner,'authenticated'::regrole::oid))
  from receipt r),false),
 'cronJobsHeld',coalesce(pg_catalog.current_setting('cron.launch_active_jobs',true)='off',false),
 'baseline',pg_catalog.jsonb_build_object(
  'authUsers',case when not pg_catalog.row_security_active('auth.users'::regclass) then (select count(*) from auth.users) end,
  'trips',case when not pg_catalog.row_security_active('public.trips'::regclass) then (select count(*) from public.trips) end,
  'guides',case when not pg_catalog.row_security_active('public.guides'::regclass) then (select count(*) from public.guides) end,
  'tripRequests',case when not pg_catalog.row_security_active('kinnso_internal.trip_requests'::regclass) then (select count(*) from kinnso_internal.trip_requests) end
 ),
 'functionHashes',(select pg_catalog.jsonb_object_agg(label,pg_catalog.jsonb_build_object(
  'sha256',pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(definition,'UTF8')),'hex'),
  'bodySha256',pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.replace(pg_catalog.replace(prosrc,E'\r\n',E'\n'),E'\r',E'\n'),'UTF8')),'hex'))) from metadata),
 'receiptTripOwnershipCheck',coalesce((select
  pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.replace(pg_catalog.replace(prosrc,E'\r\n',E'\n'),E'\r',E'\n'),'UTF8')),'hex')
  ='74d243260df4d72d2f13fea3936b2f23297ea794471a271203239d515eced62c'
  from receipt),false)
) as target_catalog;
rollback;
