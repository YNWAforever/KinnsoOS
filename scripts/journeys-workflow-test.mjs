import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {URL} from 'node:url';

const workflow = await readFile(new URL('../.github/workflows/journeys.yml', import.meta.url), 'utf8');
const evaluate = (expression, github, cancelled = false) =>
  Function('github', 'always', 'cancelled', `return (${expression.trim().replace(/^\$\{\{\s*|\s*\}\}$/g, '')})`)(github, () => true, () => cancelled);
const group = github => {
  const value = workflow.match(/^ {2}group: (.+)$/m)?.[1];
  assert.ok(value, 'workflow must declare its group');
  return value.replace(/\$\{\{(.*?)\}\}/g, (_, expression) => evaluate(expression, github));
};

test('a stuck old owned Journeys run cannot serialize mandatory acceptance for another source SHA', () => {
  for (const event_name of ['push', 'pull_request']) {
    // Missing properties evaluate to null in the GitHub expression context.
    const context = sha => ({event_name, sha, ref: 'refs/heads/codex/owned-test', event: {pull_request: {number: event_name === 'pull_request' ? 65 : null}}});
    assert.notEqual(group(context('source-a')), group(context('source-b')));
    assert.equal(group(context('source-a')), group(context('source-a')), 'duplicate same-source runs still share one group');
  }
});

test('mandatory browser collection runs after latency failure, but stops when the run is cancelled', () => {
  const condition = workflow.match(/- name: Collect all traveller and private workspace cold\/warm navigation evidence\r?\n\s+if: (.+)/)?.[1];
  assert.ok(condition, 'failure/cancellation behavior must be explicit');
  assert.equal(evaluate(condition, {}, false), true, 'a failed latency step still requires every browser denominator');
  assert.equal(evaluate(condition, {}, true), false, 'cancellation must stop this potentially long collection');
});

test('standalone corresponding source runs its entire Node suite after locked install', () => {
  const step = workflow.split('- name: Rebuild distributed corresponding source')[1]?.split('- uses:')[0];
  assert.ok(step, 'source extraction gate must exist');
  assert.match(step, /npm ci[\s\S]*npm test[\s\S]*npm run build[\s\S]*npm run typecheck/);
});

test('operations release assessment is required after collection and retains evidence on rejection',()=>{
 const job=workflow.split('  operations-performance:')[1];
 const gate=job?.split('- name: Enforce the source-bound operations assessment')[1]?.split('- uses:')[0];
 assert.ok(gate,'collector success alone must not pass the operations prerequisite');
 assert.match(gate,/if:.*!cancelled\(\)/);
 assert.match(gate,/assert-operations-assessment\.mjs/);
 assert.match(gate,/GITHUB_SHA/);assert.match(gate,/CANDIDATE_HEAD/);assert.match(gate,/CANDIDATE_BASE/);
 assert.doesNotMatch(gate,/continue-on-error/);
 assert.match(job,/Enforce the source-bound operations assessment[\s\S]*if: always\(\)[\s\S]*journeys-operations-performance/);
 assert.match(job,/fetch-depth: 2/,'the PR mapping needs both verified parents and their trees');
});

test('every owned browser job prepares its mirror before the unchanged complete dependency installer',()=>{
 for(const name of ['workspace-fixtures','connected','auth-mailbox','operations-performance']){
  const job=workflow.split('  '+name+':')[1]?.split(/\n {2}[a-z][a-z-]*:/)[0];
  assert.ok(job,'browser job must exist: '+name);
  const installer=job.indexOf('npm exec playwright install -- --with-deps chromium');
  const mirror=job.indexOf('node scripts/ci-browser-mirror.mjs');
  assert.ok(mirror>=0&&mirror<installer,'mirror preflight must precede full dependency installation: '+name);
  assert.match(job,/KINNSO_CI_RUNNER_ENVIRONMENT:.*runner\.environment/);
  assert.doesNotMatch(job,/continue-on-error/);
 }
 assert.match(workflow.split('  workspace-fixtures:')[1].split('  verify:')[0],/timeout-minutes: 10/);
 assert.match(workflow.split('  operations-performance:')[1],/timeout-minutes: 45/);
});
