import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';

const readiness = await import('../lib/contracts/readiness.ts').catch(() => ({}));
const configured = {
  KINNSO_SUPABASE_URL:'https://readiness-test.supabase.co',
  KINNSO_APPROVED_SUPABASE_ORIGIN:'https://readiness-test.supabase.co',
  KINNSO_LEGACY_AUTH_ORIGIN:'https://readiness-test.supabase.co',
  KINNSO_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_FAKE_PRIVATE_VALUE',
  KINNSO_SITE_URL:'https://readiness-test.example',
  KINNSO_ENABLED_CAPABILITIES:'creator,merchant,ops,notifications,booking,payment',
};
function diagnose(env) {
  assert.equal(typeof readiness.diagnoseReadiness,'function','readiness diagnostic must exist');
  return readiness.diagnoseReadiness(env);
}
const status = (report,code) => report.checks.find(check => check.code===code)?.status;

test('configured target reports only config gates and permanently unavailable commerce',() => {
  const report=diagnose(configured);
  assert.equal(report.schemaVersion,1);
  assert.equal(report.backend,'configured');
  assert.equal(report.schema,'not_checked');
  assert.deepEqual(report.checks,[
    {code:'SUPABASE_ORIGIN',status:'pass'}, {code:'APPROVED_ORIGIN_MATCH',status:'pass'},
    {code:'AUTH_ORIGIN_MATCH',status:'pass'}, {code:'PUBLISHABLE_KEY',status:'pass'},
    {code:'SITE_ORIGIN',status:'pass'},
  ]);
  assert.equal(report.capabilities.creator,'connected');
  assert.equal(report.capabilities.merchant,'connected');
  assert.equal(report.capabilities.booking,'unavailable');
  assert.equal(report.capabilities.payment,'unavailable');
});
test('missing origin cannot claim matches while independent key and site checks still run',() => {
  const report=diagnose({...configured,KINNSO_SUPABASE_URL:undefined});
  assert.equal(report.backend,'unavailable');
  assert.equal(status(report,'SUPABASE_ORIGIN'),'fail');
  assert.equal(status(report,'APPROVED_ORIGIN_MATCH'),'unknown');
  assert.equal(status(report,'AUTH_ORIGIN_MATCH'),'unknown');
  assert.equal(status(report,'PUBLISHABLE_KEY'),'pass');
});
test('approved and auth origin mismatches remain separate failed gates',() => {
  for(const [key,code] of [['KINNSO_APPROVED_SUPABASE_ORIGIN','APPROVED_ORIGIN_MATCH'],['KINNSO_LEGACY_AUTH_ORIGIN','AUTH_ORIGIN_MATCH']]) {
    const report=diagnose({...configured,[key]:'https://other.example'});
    assert.equal(status(report,code),'fail'); assert.equal(report.backend,'unavailable');
    assert.equal(report.capabilities.creator,'unavailable');
  }
});
test('unsafe URL suffixes and non-local HTTP cannot become configured targets',() => {
  for(const url of ['https://user:FAKE_PASSWORD@readiness-test.supabase.co','https://readiness-test.supabase.co/path','https://readiness-test.supabase.co/?key=FAKE_SECRET','https://readiness-test.supabase.co/#secret','http://readiness-test.supabase.co']) {
    const report=diagnose({...configured,KINNSO_SUPABASE_URL:url});
    assert.equal(status(report,'SUPABASE_ORIGIN'),'fail'); assert.equal(report.backend,'unavailable');
  }
});
test('secret and non-anon JWT keys fail without leaking values or exceptions',() => {
  for(const key of ['sb_secret_FAKE_SECRET','broken-key','header.'+Buffer.from(JSON.stringify({role:'service_role',ref:'FAKE_REF'})).toString('base64url')+'.signature']) {
    const report=diagnose({...configured,KINNSO_SUPABASE_PUBLISHABLE_KEY:key});
    assert.equal(status(report,'PUBLISHABLE_KEY'),'fail'); assert.equal(report.backend,'unavailable');
    const encoded=JSON.stringify(report);
    assert.ok(!encoded.includes(key)); assert.ok(!encoded.includes('FAKE_')); assert.ok(!encoded.includes('https://'));
  }
  const report=diagnose(configured);
  const encoded=JSON.stringify(report);
  for(const value of Object.values(configured)) assert.ok(!encoded.includes(value));
  assert.deepEqual(Object.keys(report).sort(),['backend','capabilities','checks','schema','schemaVersion']);
});
test('site origin failures do not misstate backend configuration or schema readiness',() => {
  for(const site of [undefined,'https://user:password@example.com','https://example.com/path','http://example.com','https://example.com/?secret=1']) {
    const report=diagnose({...configured,KINNSO_SITE_URL:site});
    assert.equal(status(report,'SITE_ORIGIN'),'fail'); assert.equal(report.backend,'configured');
    assert.equal(report.schema,'not_checked');
  }
});
test('owned loopback and legacy anon-key configurations preserve existing target compatibility',() => {
  const origin='http://127.0.0.1:58421';
  const key='header.'+Buffer.from(JSON.stringify({role:'anon'})).toString('base64url')+'.signature';
  const report=diagnose({...configured,KINNSO_ENVIRONMENT:'local',KINNSO_SUPABASE_URL:origin,KINNSO_APPROVED_SUPABASE_ORIGIN:origin,KINNSO_LEGACY_AUTH_ORIGIN:origin,KINNSO_SUPABASE_PUBLISHABLE_KEY:key,KINNSO_SITE_URL:'http://localhost:3000'});
  assert.equal(report.backend,'configured'); assert.equal(status(report,'SITE_ORIGIN'),'pass');
  assert.equal(status(report,'PUBLISHABLE_KEY'),'pass');
});

function cli(values={},args=[]) {
  const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>!key.startsWith('KINNSO_')));
  return spawnSync(process.execPath,['--experimental-strip-types','scripts/check-readiness.mjs',...args],{env:{...env,...values},encoding:'utf8'});
}
test('CLI fails missing config and required capability; succeeds only the config gate',() => {
  for(const [env,args,want] of [[{},[],1],[configured,['--require=creator,merchant'],0],[{...configured,KINNSO_ENABLED_CAPABILITIES:'creator'},['--require=merchant'],1],[configured,['--require=payment'],1],[{...configured,KINNSO_SITE_URL:''},[],1]]) {
    const run=cli(env,args); assert.equal(run.status,want,run.stderr);
    assert.ok(run.stdout.startsWith('{'),'CLI must emit a safe JSON report');
    const report=JSON.parse(run.stdout); assert.equal(report.schema,'not_checked');
    assert.ok(!run.stdout.includes('FAKE_PRIVATE_VALUE')); assert.ok(!run.stdout.includes('https://'));
  }
});
test('CLI rejects unknown options without printing values or making a success claim',() => {
  const run=cli(configured,['--unknown=FAKE_SECRET']); assert.equal(run.status,1);
  assert.ok(run.stdout.startsWith('{'),'invalid options still produce the safe diagnostic');
  assert.ok(!run.stdout.includes('FAKE_SECRET')); assert.ok(!run.stderr.includes('FAKE_SECRET'));
});
