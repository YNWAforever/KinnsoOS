import test from 'node:test';
import assert from 'node:assert/strict';
import {parseDockerDisk,validateDockerDiskMount,createIsolatedConfig,validateLocalCredentials,createReplayPlan} from './live-support.mjs';

test('docker disk evidence uses the engine-visible filesystem, not an unrelated host drive',()=>{
  const value=parseDockerDisk('Filesystem 1024-blocks Used Available Capacity Mounted on\n/dev/sdd 1055762868 201261000 800798396 20% /mnt/docker-desktop-disk\n');
  assert.deepEqual(value,{source:'/dev/sdd',totalBytes:1055762868*1024,usedBytes:201261000*1024,availableBytes:800798396*1024,mount:'/mnt/docker-desktop-disk'});
  assert.throws(()=>validateDockerDiskMount(value,'/var/lib/docker'),{code:'DOCKER_DISK_INVALID'});
  assert.equal(validateDockerDiskMount({...value,mount:'/var/lib/docker'},'/var/lib/docker').verified,true);
  assert.throws(()=>parseDockerDisk('df: /var/lib/docker: can not find mount point'),{code:'DOCKER_DISK_INVALID'});
});

test('isolated config changes names and loopback ports only, disables seed/services and keeps providers closed',async()=>{
  const source=`project_id = "old"\n[api]\n# local port comment\nenabled = true\nport = 1\n# trailing comment\n[db]\n# comment\nport = 2\n# comment\nshadow_port = 3\n[db.seed]\nenabled = true\n[realtime]\nenabled = true\n[studio]\nenabled = true\n[inbucket]\nenabled = true\n[storage]\nenabled = true\n[auth]\nsite_url = "http://old"\n`;
  const config=createIsolatedConfig(source,{project:'kinnsoos-native-acceptance-20261101',apiOrigin:'http://127.0.0.1:60021',ports:{api:60021,db:60022,shadow:60020}});
  assert.match(config,/project_id = "kinnsoos-native-acceptance-20261101"/);
  assert.match(config,/\[api\][\s\S]*port = 60021/);
  assert.match(config,/\[db\][\s\S]*port = 60022[\s\S]*shadow_port = 60020/);
  assert.match(config,/\[db.seed\][\s\S]*enabled = false/);
  for(const section of ['realtime','studio','inbucket','storage'])assert.match(config,new RegExp(`\\[${section}\\][\\s\\S]*enabled = false`));
  assert.match(config,/site_url = "http:\/\/127\.0\.0\.1:60021"/);
  assert.doesNotMatch(config,/SUPABASE_SECRET|SERVICE_ROLE|OPENAI_API_KEY=sk-/);
});

test('local credentials require exact API origin, loopback DB and nonempty local example keys',()=>{
  const good={API_URL:'http://127.0.0.1:60021',ANON_KEY:'a'.repeat(40),SERVICE_ROLE_KEY:'b'.repeat(40),DB_URL:'postgresql://postgres:secret@127.0.0.1:60022/postgres'};
  assert.deepEqual(validateLocalCredentials(good,'http://127.0.0.1:60021'),{apiUrl:good.API_URL,dbPort:'60022'});
  for(const delta of [{API_URL:'https://example.com'},{DB_URL:'postgresql://db.example/postgres'},{ANON_KEY:''},{SERVICE_ROLE_KEY:good.ANON_KEY}])
    assert.throws(()=>validateLocalCredentials({...good,...delta},'http://127.0.0.1:60021'),{code:'LOCAL_CREDENTIALS_INVALID'});
});

test('replay plan is ordered, complete and binds each byte hash before execution',()=>{
  const files=[{name:'20260101000000_a.sql',version:'20260101000000',sha256:'a'.repeat(64),bytes:10},{name:'20260101000001_b.sql',version:'20260101000001',sha256:'b'.repeat(64),bytes:20}];
  assert.equal(createReplayPlan({hash:'c'.repeat(64),files}).length,2);
  assert.throws(()=>createReplayPlan({hash:'c'.repeat(64),files:[files[1],files[0]]}),{code:'MIGRATION_ORDER_INVALID'});
  assert.throws(()=>createReplayPlan({hash:'c'.repeat(64),files:[files[0],files[0]]}),{code:'MIGRATION_ORDER_INVALID'});
});
