import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const sources = Object.fromEntries(await Promise.all(['ci','journeys'].map(async name=>[name,await readFile(new URL(`../.github/workflows/${name}.yml`,import.meta.url),'utf8')])));
function job(workflow,name){
 const body=sources[workflow].split(new RegExp(`^  ${name}:\\r?$`,'m'))[1]?.split(/^  [a-z][a-z0-9-]*:\r?$/m)[0];
 assert.ok(body,`${workflow}/${name} must exist`);return body;
}
for(const [workflow,name] of [['ci','quality'],['ci','e2e'],['journeys','connected'],['journeys','auth-mailbox'],['journeys','operations-performance']]){
 test(`${workflow}/${name} authenticates pinned image pulls with only the ephemeral read token`,()=>{
  const body=job(workflow,name).replace(/^\s*#.*$/gm,'');
  const login=body.match(/      - name: Authenticate Supabase image downloads\r?\n([\s\S]*?)(?=      - |$)/)?.[1];
  assert.ok(login,'anonymous GHCR pulls exhausted the shared runner limit before database startup');
  assert.match(login,/uses: docker\/login-action@[a-f0-9]{40}(?:\s|$)/,'pin the registry action to immutable source');
  assert.match(login,/registry: ghcr\.io/);
  assert.match(login,/username: \$\{\{ github\.actor \}\}/);
  assert.match(login,/password: \$\{\{ secrets\.GITHUB_TOKEN \}\}/,'no PAT or provider credential');
  assert.match(login,/logout: true/,'the action must discard registry authentication on job completion');
  assert.doesNotMatch(login,/continue-on-error|if:|pull_request_target/,'do not silently fall back to anonymous download or privileged PR execution');
  assert.match(body,/    permissions:\r?\n      contents: read\r?\n      packages: read\r?\n/);
  assert.doesNotMatch(body,/packages: write|write-all/);
  const setup=body.match(/      - name: Isolate ephemeral registry configuration\r?\n([\s\S]*?)(?=      - |$)/)?.[1];
  assert.ok(setup,'create the registry environment in a step where RUNNER_TEMP is available');
  assert.match(setup,/DOCKER_CONFIG=%s\/kinnso-ghcr/);
  assert.match(setup,/"\$RUNNER_TEMP".*"\$GITHUB_ENV"/);
  assert.ok(body.indexOf('Isolate ephemeral registry configuration')<body.indexOf('Authenticate Supabase image downloads'));
  assert.doesNotMatch(body.split('    steps:')[0],/runner\./,'runner context is unavailable in job-level env');
  assert.ok(body.indexOf('Authenticate Supabase image downloads')<body.indexOf('supabase start'),'login precedes the only database start');
  if(workflow==='ci')assert.ok(body.indexOf('Authenticate Supabase image downloads')<body.indexOf('docker pull ghcr.io/'),'type-generation cache also uses authenticated downloads');
  assert.equal((body.match(/(?:pnpm )?supabase start/g)||[]).length,1,'registry failure must not replay migrations');
  assert.doesNotMatch(body,/supabase start[^\n]*(?:\|\||--ignore-health-check)/,'retain startup failures and health gates');
 });
}
test('non-database jobs keep the default contents-only token',()=>{
 for(const [workflow,names] of [['ci',['scan-image']],['journeys',['verify','workspace-fixtures']]]){
  for(const name of names){const body=job(workflow,name);assert.doesNotMatch(body,/packages:|login-action|GITHUB_TOKEN/);}
 }
});
