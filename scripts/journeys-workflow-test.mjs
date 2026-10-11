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
