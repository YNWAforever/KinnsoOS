-- Read-only inventory, NOT an acceptance test. Execute only after live target
-- attestation and complete ordered migration replay. Never selects secret bytes.
begin read only;
set local statement_timeout = '10s';
select jsonb_build_object(
 'postgresVersion', current_setting('server_version'),
 'isolation', current_setting('transaction_isolation'),
 'database', current_database(),
 'tables', (select jsonb_agg(jsonb_build_object('schema',n.nspname,'name',c.relname,
   'rls',c.relrowsecurity,'forceRls',c.relforcerowsecurity,'acl',c.relacl::text) order by n.nspname,c.relname)
   from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where n.nspname in ('public','kinnso_internal','kinnso_share_api') and c.relkind in ('r','p','v')),
 'policies', (select jsonb_agg(to_jsonb(p) order by p.schemaname,p.tablename,p.policyname)
   from pg_policies p where p.schemaname in ('public','kinnso_internal','kinnso_share_api')),
 'functions', (select jsonb_agg(jsonb_build_object('schema',n.nspname,'name',p.proname,
   'args',oidvectortypes(p.proargtypes),'definer',p.prosecdef,'config',p.proconfig,
   'acl',p.proacl::text,'bodyMd5',md5(pg_get_functiondef(p.oid))) order by n.nspname,p.proname,p.oid)
   from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname in ('public','kinnso_internal','kinnso_share_api') and p.prokind='f'),
 'triggers', (select jsonb_agg(jsonb_build_object('schema',n.nspname,'table',c.relname,
   'name',t.tgname,'enabled',t.tgenabled,'definition',pg_get_triggerdef(t.oid)) order by n.nspname,c.relname,t.tgname)
   from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
   where not t.tgisinternal and n.nspname in ('public','kinnso_internal','kinnso_share_api')),
 'discoveryGates', (select jsonb_agg(jsonb_build_object('privateWrites',private_writes,'licensedWrites',licensed_writes)) from kinnso_internal.discovery_gate),
 'authorityKeyCount', (select count(*) from kinnso_internal.discovery_authority_keys),
 'rightsApprovalCount', (select count(*) from kinnso_internal.discovery_rights_approvals)
);
commit;
