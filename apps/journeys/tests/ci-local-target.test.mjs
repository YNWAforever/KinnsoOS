import { test } from 'node:test';
import assert from 'node:assert/strict';
import { localConfiguration, localTestEnvironment } from '../scripts/prepare-connected-ci.mjs';
const jwt = role => `test.${Buffer.from(JSON.stringify({ role })).toString('base64url')}.test`;
const status = () => ({ API_URL: 'http://127.0.0.1:58421', ANON_KEY: jwt('anon'), SERVICE_ROLE_KEY: jwt('service_role') });
test('CI configuration uses the isolated owned target and disables application seeds', () => {
 const config = localConfiguration('project_id = "kinnso-v3"\n[api]\nport = 54421\n[db]\nport = 54422\nshadow_port = 54420\n[db.seed]\nenabled = true\nsql_paths = ["./seed.sql"]\n[auth]\nsite_url = "http://127.0.0.1:3000"\n');
 assert.match(config, /project_id = "kinnsoos-b1-20261002"/); assert.match(config, /port = 58421/); assert.match(config, /shadow_port = 58420/); assert.match(config, /\[db.seed\]\nenabled = false/);
 assert.throws(() => localConfiguration('project_id = "unknown"\n[api]\nport = 54421\n'));
});
test('CI refuses a remote status URL, mismatched ownership or privileged publishable input before writing environment files', () => {
 for (const value of [{ ...status(), API_URL: 'https://production.supabase.co' }, { ...status(), ANON_KEY: jwt('service_role') }, { ...status(), SERVICE_ROLE_KEY: jwt('anon') }]) assert.throws(() => localTestEnvironment(value, 'kinnsoos-b1-20261002'));
 assert.throws(() => localTestEnvironment(status(), 'unrelated-local-project'));
 const env = localTestEnvironment(status(), 'kinnsoos-b1-20261002'); assert.equal(env.KINNSO_SUPABASE_URL, 'http://127.0.0.1:58421'); assert.equal(env.KINNSO_SUPABASE_PUBLISHABLE_KEY, status().ANON_KEY); assert.equal(env.KINNSO_TEST_TARGET, 'local'); assert.equal(env.KINNSO_SITE_URL, 'http://127.0.0.1:3495'); assert.match(env.KINNSO_ENABLED_CAPABILITIES, /creator/);
});

const mailConfig = 'project_id = "kinnso-v3"\n[api]\nport = 54421\n[inbucket]\nenabled = false\nport = 54424\n[auth]\nsite_url = "http://127.0.0.1:3000"\n[auth.rate_limit]\nemail_sent = 2\n[auth.email]\nenable_confirmations = false\n';
test('a separate fresh CI mailbox profile requires confirmation without changing the original profile', () => {
 const original = localConfiguration(mailConfig);
 const captured = localConfiguration(mailConfig, { mailbox: true });
 assert.match(captured, /\[inbucket\]\nenabled = true\nport = 58424/);
 assert.match(captured, /\[auth.email\]\nenable_confirmations = true/);
 assert.match(captured, /\[auth.rate_limit\]\nemail_sent = 100/);
 assert.match(original, /\[inbucket\]\nenabled = false/);
 assert.match(original, /enable_confirmations = false/);
 assert.throws(() => localConfiguration(mailConfig + '[auth.email.smtp]\nenabled = true\nhost = "external.example"\n', { mailbox: true }));
});
test('the mailbox environment requires the exact local Mailpit origin and emits no external provider settings', () => {
 for (const origin of [undefined, 'https://production.example', 'http://127.0.0.1:54324', 'http://127.0.0.1:58424/']) {
  assert.throws(() => localTestEnvironment({ ...status(), MAILPIT_URL: origin }, 'kinnsoos-b1-20261002', { mailbox: true }));
 }
 const env = localTestEnvironment({ ...status(), MAILPIT_URL: 'http://127.0.0.1:58424' }, 'kinnsoos-b1-20261002', { mailbox: true });
 assert.equal(env.KINNSO_TEST_MAILBOX_ORIGIN, 'http://127.0.0.1:58424');
 assert.equal(env.KINNSO_TEST_EMAIL_CONFIRMATION, 'required');
 assert.equal(localTestEnvironment(status(), 'kinnsoos-b1-20261002').KINNSO_TEST_MAILBOX_ORIGIN, undefined);
});
const pilotProject='kinnsoos-pilot-20261013';
test('the named pilot profile uses a fresh project volume without changing CI defaults',()=>{
 const canonical='project_id = "kinnso-v3"\n[api]\nport = 54421\n[db.seed]\nenabled = true\n';
 const pilot=localConfiguration(canonical,{projectRef:pilotProject});
 assert.match(pilot,/project_id = "kinnsoos-pilot-20261013"/);assert.match(pilot,/port = 58421/);assert.match(pilot,/enabled = false/);
 assert.match(localConfiguration(canonical),/project_id = "kinnsoos-b1-20261002"/);
});
test('pilot status binds the actual label and exact container with the same loopback and key-role restrictions',()=>{
 const options={projectRef:pilotProject};const env=localTestEnvironment(status(),pilotProject,options);
 assert.equal(env.KINNSO_TEST_PROJECT,pilotProject);assert.equal(env.KINNSO_TEST_DB_CONTAINER,'supabase_db_'+pilotProject);
 for(const [value,label] of [[status(),'kinnsoos-b1-20261002'],[{...status(),API_URL:'https://production.supabase.co'},pilotProject],[{...status(),ANON_KEY:jwt('service_role')},pilotProject]])assert.throws(()=>localTestEnvironment(value,label,options));
});
test('local setup refuses arbitrary project overrides rather than authorizing any local database',()=>{
 const canonical='project_id = "kinnso-v3"\n[api]\nport = 54421\n';
 for(const projectRef of ['unrelated-local-project','production','kinnsoos-pilot-20261013-other']){
  assert.throws(()=>localConfiguration(canonical,{projectRef}));assert.throws(()=>localTestEnvironment(status(),projectRef,{projectRef}));
 }
});

// Original f61a push could not start Docker: its DB host port58422 was occupied.
// A bounded generated CI DB profile must leave API/Mailpit and developer/pilot contracts intact.
const databaseMailConfig = mailConfig.replace('[inbucket]', '[db]\nport = 54422\nshadow_port = 54420\n[db.seed]\nenabled = true\n[inbucket]');
for (const mailbox of [false, true]) test(`generated CI database ports avoid the original collision range (mailbox=${mailbox})`, async () => {
 const output=localConfiguration(databaseMailConfig,{mailbox,ciDatabasePorts:true});
 const database=output.split('[db]\n')[1].split('[')[0];
 assert.match(database,/^port = 18422$/m);assert.match(database,/^shadow_port = 18420$/m);
 assert.match(output,/\[api\]\nport = 58421/);assert.match(output,/\[inbucket\]\nenabled = (?:true|false)\nport = 58424/);
 assert.match(output,/\[db.seed\]\nenabled = false/);assert.match(output,/project_id = "kinnsoos-b1-20261002"/);
 if(mailbox)assert.match(output,/\[auth.email\]\nenable_confirmations = true/);
 // Actual loopback bind, no DB/SMTP connection or change to an existing listener.
 const {createServer}=await import('node:net');const probe=createServer();
 await new Promise((resolve,reject)=>{probe.once('error',reject);probe.listen({host:'127.0.0.1',port:18422},resolve);});
 await new Promise((resolve,reject)=>probe.close(error=>error?reject(error):resolve()));
});
test('CI port profile is explicit boolean and keeps named developer/pilot profiles unchanged',()=>{
 for(const projectRef of ['kinnsoos-b1-20261002','kinnsoos-pilot-20261013']){
  const output=localConfiguration(databaseMailConfig,{projectRef});assert.match(output,/\[db\]\nport = 58422\nshadow_port = 58420/);
 }
 for(const ciDatabasePorts of ['yes',null,18422])assert.throws(()=>localConfiguration(databaseMailConfig,{ciDatabasePorts}));
});
test('generated CI DB profile rejects changed canonical database ports instead of broadening the target',()=>{
 for(const source of [databaseMailConfig.replace('port = 54422','port = 54425'),databaseMailConfig.replace('shadow_port = 54420','shadow_port = 54425')])assert.throws(()=>localConfiguration(source,{ciDatabasePorts:true}));
 assert.throws(()=>localConfiguration(databaseMailConfig,{ciDatabasePorts:true,projectRef:'production'}));
});
