import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync, execFileSync } from 'node:child_process';
import { createServer } from 'node:http';

const root = fileURLToPath(new URL('../', import.meta.url));
const workflow = readFileSync(path.join(root, '.github/workflows/nightly-funnel.yml'), 'utf8').replace(/\r\n/g, '\n');
const writer = path.join(root, 'scripts/write-nightly-evidence.mjs');
const source = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const origin = 'https://kinnso-os.vercel.app';

for (const [job, artifact] of [['production-funnel', 'nightly-funnel-artifacts'], ['production-sitemap', 'nightly-sitemap-artifacts']]) {
  test(`${job} retains a source-bound receipt and actual report on success or failure`, () => {
    const section = workflow.split(`  ${job}:\n`)[1]?.split(/^  [a-z][a-z-]+:\n/m)[0] ?? '';
    assert.match(section, /name: Record read-only evidence\n\s+if: always\(\)/);
    assert.match(section, /uses: actions\/upload-artifact@[a-f0-9]{40}[^\n]*\n\s+if: always\(\)/);
    assert.match(section, new RegExp(`name: ${artifact}\\n`));
    assert.match(section, /steps\.readonly_check\.outcome/);
    assert.match(section, /scripts\/write-nightly-evidence\.mjs/);
    assert.ok(section.includes(`--target ${origin}`));
    assert.ok(section.includes(`${job === 'production-funnel' ? 'E2E_BASE_URL' : 'BASE_URL'}: ${origin}`));
    assert.doesNotMatch(section, /continue-on-error:/);
  });
}

function receipt(surface, report, outcome = 'success', overrides = {}) {
  const directory = mkdtempSync(path.join(tmpdir(), 'kinnso-nightly-evidence-'));
  const input = path.join(directory, 'report.json'), output = path.join(directory, 'receipt.json');
  try {
    if (surface === 'funnel' && report && typeof report === 'object') report = {
      ...report, config: { ...report.config, metadata: {
        targetOrigin: origin, sourceRevision: source, bookingLive: false, remoteReadOnlyOptIn: true, runId: '42', runAttempt: '2',
        ...report.config?.metadata,
      } },
    };
    if (surface === 'sitemap' && report && typeof report === 'object') report = { sourceRevision: source, runId: '42', runAttempt: '2', ...report };
    if (report !== undefined) writeFileSync(input, typeof report === 'string' ? report : JSON.stringify(report));
    const run = spawnSync(process.execPath, [writer, '--surface', surface, '--report', input, '--output', output, '--outcome', outcome, '--target', origin], {
      cwd: root, encoding: 'utf8', env: { ...process.env, GITHUB_SHA: source, GITHUB_RUN_ID: '42', GITHUB_RUN_ATTEMPT: '2', GITHUB_EVENT_NAME: 'schedule', ...overrides },
    });
    return { code: run.status, stdout: run.stdout, stderr: run.stderr, value: existsSync(output) ? JSON.parse(readFileSync(output, 'utf8')) : null };
  } finally {
    assert.equal(path.dirname(directory), path.resolve(tmpdir()));
    assert.ok(path.basename(directory).startsWith('kinnso-nightly-evidence-'));
    rmSync(directory, { recursive: true, force: true });
  }
}

test('funnel evidence retains final failures, skips and flaky counts without private report content', () => {
  const result = receipt('funnel', { stats: { expected: 3, unexpected: 1, flaky: 2, skipped: 4 }, errors: [{ message: 'private sentinel' }], config: { metadata: { token: 'private sentinel' } } }, 'failure');
  assert.equal(result.code, 0);
  assert.deepEqual(result.value.counts, { total: 10, passed: 3, failed: 1, flaky: 2, skipped: 4 });
  assert.equal(result.value.executionOutcome, 'failure');
  assert.equal(result.value.sourceRevision, source);
  assert.equal(result.value.runAttempt, '2');
  assert.equal(result.value.targetOrigin, origin);
  assert.equal(result.value.signedInAcceptance, 'NOT_RUN');
  assert.doesNotMatch(JSON.stringify(result.value) + result.stdout + result.stderr, /private sentinel/);
});

test('successful command without its report fails the evidence gate instead of inventing counts', () => {
  const result = receipt('funnel', undefined);
  assert.equal(result.code, 1);
  assert.equal(result.value.reportStatus, 'MISSING');
  assert.equal(result.value.counts, null);
});

for (const outcome of ['failure', 'skipped', 'cancelled']) test(`missing report after ${outcome} stays unverified and preserves original outcome`, () => {
  const result = receipt('funnel', undefined, outcome);
  assert.equal(result.code, 0);
  assert.equal(result.value.executionOutcome, outcome);
  assert.equal(result.value.reportStatus, 'MISSING');
  assert.equal(result.value.counts, null);
});

for (const report of ['not JSON', { stats: { expected: -1, unexpected: 0, flaky: 0, skipped: 0 } }, { stats: { expected: 1, unexpected: 0, flaky: 0 } }]) test('malformed or incomplete report cannot satisfy a successful check', () => {
  const result = receipt('funnel', report);
  assert.equal(result.code, 1);
  assert.equal(result.value.reportStatus, 'INVALID');
  assert.equal(result.value.counts, null);
});

test('sitemap receipt records separate actual page count and failure count without inferring passed pages', () => {
  const result = receipt('sitemap', { checked: 2, failureCount: 3, targetOrigin: origin }, 'failure');
  assert.equal(result.code, 0);
  assert.deepEqual(result.value.counts, { checkedUrls: 2, failures: 3 });
  assert.equal(result.value.targetOrigin, origin);
});

test('report and checkout identity mismatches cannot produce a valid source-bound receipt', () => {
  const foreign = receipt('sitemap', { checked: 2, failureCount: 0, targetOrigin: 'https://foreign.test' });
  assert.ok(foreign.value, 'source-bound receipt must exist');
  assert.equal(foreign.value.reportStatus, 'INVALID');
  const result = receipt('funnel', { stats: { expected: 1, unexpected: 0, flaky: 0, skipped: 0 } }, 'success', { GITHUB_SHA: 'f'.repeat(40) });
  assert.equal(result.code, 1);
  assert.equal(result.value, null);
});

for (const metadata of [{ targetOrigin: 'http://127.0.0.1:3467' }, { bookingLive: true }, { remoteReadOnlyOptIn: false }]) test('actual Playwright target and read-only scope must match the receipt label', () => {
  const result = receipt('funnel', { stats: { expected: 1, unexpected: 0, flaky: 0, skipped: 0 }, config: { metadata } });
  assert.equal(result.code, 1);
  assert.equal(result.value.reportStatus, 'INVALID');
  assert.equal(result.value.counts, null);
});

for (const outcome of ['skipped', 'cancelled']) test('an unrun check cannot relabel an existing report as current counts', () => {
  const result = receipt('funnel', { stats: { expected: 5, unexpected: 0, flaky: 0, skipped: 0 } }, outcome);
  assert.equal(result.code, 0);
  assert.equal(result.value.reportStatus, 'NOT_RUN');
  assert.equal(result.value.counts, null);
});

for (const metadata of [{ runId: '41' }, { runAttempt: '1' }]) test('report from another run or attempt cannot pass current evidence', () => {
  const result = receipt('funnel', { stats: { expected: 5, unexpected: 0, flaky: 0, skipped: 0 }, config: { metadata } });
  assert.equal(result.code, 1);
  assert.equal(result.value.reportStatus, 'INVALID');
});

for (const binding of [{ sourceRevision: 'f'.repeat(40) }, { runId: '41' }, { runAttempt: '1' }]) test('sitemap counts must belong to the actual checkout, run and attempt', () => {
  const result = receipt('sitemap', { checked: 2, failureCount: 0, targetOrigin: origin, ...binding });
  assert.equal(result.code, 1);
  assert.equal(result.value.reportStatus, 'INVALID');
  assert.equal(result.value.counts, null);
});

test('an empty funnel report and contradictory successful result cannot satisfy evidence', () => {
  const empty = receipt('funnel', { stats: { expected: 0, unexpected: 0, flaky: 0, skipped: 0 } });
  assert.equal(empty.code, 1);
  assert.equal(empty.value.reportStatus, 'EMPTY');
  const failure = receipt('funnel', { stats: { expected: 1, unexpected: 1, flaky: 0, skipped: 0 } });
  assert.equal(failure.code, 1);
  assert.equal(failure.value.counts.failed, 1);
});

test('a pilot-empty funnel skip stays visible beside the checks that actually passed', () => {
  const description = 'PILOT_EMPTY: no published /en/g/ guides are available; guide-to-experience funnel not exercised.';
  const result = receipt('funnel', { stats: { expected: 8, unexpected: 0, flaky: 0, skipped: 1 },
    suites: [{ specs: [{ tests: [{ status: 'skipped', annotations: [{ type: 'skip', description }] }] }] }] });
  assert.equal(result.code, 0);
  assert.equal(result.value.reportStatus, 'VALID');
  assert.equal(result.value.targetOrigin, origin);
  assert.equal(result.value.scope, 'kinnso_os_anonymous_readonly_plus_labelled_funnel_fixture');
  assert.deepEqual(result.value.counts, { total: 9, passed: 8, failed: 0, flaky: 0, skipped: 1 });
  assert.deepEqual(result.value.pilotContent, [{ reason: 'pilot-empty', description, testOutcome: 'skipped' }]);
});

const incompleteAnnotation = guide => ({ type: 'pilot-incomplete-creator-link',
  description: `pilot-incomplete-creator-link: guide /en/g/${guide} has no creator link` });
const annotatedSuites = (status, annotations) => [{ suites: [{ specs: [{ tests: [{ status, annotations }] }] }] }];

test('all incomplete creator links produce classified skip evidence with every affected guide', () => {
  const annotations = ['first', 'second'].map(incompleteAnnotation);
  const result = receipt('funnel', { stats: { expected: 8, unexpected: 0, flaky: 0, skipped: 1 },
    suites: annotatedSuites('skipped', [...annotations, { type: 'skip', description: annotations.map(item => item.description).join('; ') }]) });
  assert.equal(result.code, 0);
  assert.equal(result.value.reportStatus, 'VALID');
  assert.equal(result.value.executionOutcome, 'success');
  assert.deepEqual(result.value.counts, { total: 9, passed: 8, failed: 0, flaky: 0, skipped: 1 });
  assert.deepEqual(result.value.pilotContent, annotations.map(annotation => ({ reason: annotation.type,
    description: annotation.description, testOutcome: 'skipped' })));
});

test('a complete selected funnel retains annotations for earlier incomplete guides without inventing a skip', () => {
  const annotation = incompleteAnnotation('first');
  const result = receipt('funnel', { stats: { expected: 9, unexpected: 0, flaky: 0, skipped: 0 },
    suites: annotatedSuites('expected', [annotation]) });
  assert.equal(result.code, 0);
  assert.deepEqual(result.value.counts, { total: 9, passed: 9, failed: 0, flaky: 0, skipped: 0 });
  assert.deepEqual(result.value.pilotContent, [{ reason: annotation.type, description: annotation.description, testOutcome: 'expected' }]);
});

test('pilot annotations cannot turn an actual selected-funnel failure into successful evidence', () => {
  const annotation = incompleteAnnotation('first');
  const report = { stats: { expected: 8, unexpected: 1, flaky: 0, skipped: 0 }, suites: annotatedSuites('unexpected', [annotation]) };
  const contradictory = receipt('funnel', report);
  assert.equal(contradictory.code, 1);
  assert.equal(contradictory.value.counts.failed, 1);
  assert.deepEqual(contradictory.value.pilotContent, [{ reason: annotation.type, description: annotation.description, testOutcome: 'unexpected' }]);
  const failed = receipt('funnel', report, 'failure');
  assert.equal(failed.code, 0);
  assert.equal(failed.value.executionOutcome, 'failure');
  assert.equal(failed.value.counts.failed, 1);
});

test('pilot evidence only retains known public reasons, without arbitrary report annotations or duplicates', () => {
  const annotation = incompleteAnnotation('first');
  const result = receipt('funnel', { stats: { expected: 1, unexpected: 0, flaky: 0, skipped: 0 },
    suites: annotatedSuites('expected', [annotation, annotation,
      { type: 'skip', description: 'private sentinel' },
      { type: 'pilot-incomplete-creator-link', description: 'private sentinel' },
      { type: 'pilot-incomplete-creator-link', description: 'pilot-incomplete-creator-link: guide /en/g/first?token=private sentinel has no creator link' },
      { type: 'note', description: 'private sentinel' }]) });
  assert.equal(result.code, 0);
  assert.deepEqual(result.value.pilotContent, [{ reason: annotation.type, description: annotation.description, testOutcome: 'expected' }]);
  assert.doesNotMatch(JSON.stringify(result.value) + result.stdout + result.stderr, /private sentinel/);
});

for (const binding of [{ sourceRevision: 'f'.repeat(40) }, { runId: '41' }, { runAttempt: '1' }]) {
  test('pilot content annotations from another source, run or attempt are never accepted', () => {
    const result = receipt('funnel', { config: { metadata: binding }, stats: { expected: 0, unexpected: 0, flaky: 0, skipped: 1 },
      suites: annotatedSuites('skipped', [incompleteAnnotation('first')]) });
    assert.equal(result.code, 1);
    assert.equal(result.value.reportStatus, 'INVALID');
    assert.deepEqual(result.value.pilotContent, []);
  });
}

for (const outcome of ['skipped', 'cancelled']) test('an unrun check cannot reuse pilot-content annotations', () => {
  const result = receipt('funnel', { stats: { expected: 0, unexpected: 0, flaky: 0, skipped: 1 },
    suites: annotatedSuites('skipped', [incompleteAnnotation('first')]) }, outcome);
  assert.equal(result.code, 0);
  assert.equal(result.value.reportStatus, 'NOT_RUN');
  assert.deepEqual(result.value.pilotContent, []);
});

test('actual crawler CLI defaults to KinnsoOS and records an empty sitemap without remote requests', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'kinnso-nightly-default-'));
  const preload = path.join(directory, 'fetch.mjs'), output = path.join(directory, 'crawl.json');
  try {
    writeFileSync(preload, `import assert from 'node:assert/strict';
      globalThis.fetch = async input => {
        assert.equal(input, ${JSON.stringify(`${origin}/sitemap.xml`)});
        return new Response('<urlset/>');
      };`);
    const env = { ...process.env, KINNSO_CRAWL_REPORT: output, GITHUB_RUN_ID: '42', GITHUB_RUN_ATTEMPT: '2' };
    delete env.BASE_URL;
    const run = spawnSync(process.execPath, ['--experimental-strip-types', '--import', preload, path.join(root, 'scripts/crawl-sitemap.ts')], { cwd: root, encoding: 'utf8', env });
    assert.equal(run.status, 0, run.stderr);
    assert.match(run.stdout, /Checked 0 sitemap URLs; 0 failures/);
    assert.deepEqual(JSON.parse(readFileSync(output, 'utf8')), { checked: 0, failureCount: 0, targetOrigin: origin, sourceRevision: source, runId: '42', runAttempt: '2' });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('actual crawler CLI writes aggregate evidence for public success and sitemap failure', async () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'kinnso-nightly-crawl-'));
  let failing = true;
  const server = createServer((request, response) => {
    if (request.url === '/sitemap.xml') {
      response.setHeader('Content-Type', 'application/xml');
      response.end(`<urlset><url><loc>http://127.0.0.1:${server.address().port}/ok</loc></url><url><loc>http://127.0.0.1:${server.address().port}/bad</loc></url></urlset>`);
    } else { response.statusCode = failing && request.url === '/bad' ? 404 : 200; response.end('<html>fixture page</html>'); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const target = `http://127.0.0.1:${server.address().port}`, output = path.join(directory, 'crawl.json');
    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    await assert.rejects(promisify(execFile)(process.execPath, ['--experimental-strip-types', path.join(root, 'scripts/crawl-sitemap.ts')], { cwd: root, env: { ...process.env, BASE_URL: target, KINNSO_CRAWL_REPORT: output, GITHUB_RUN_ID: '42', GITHUB_RUN_ATTEMPT: '2' } }), error => error.code === 1);
    assert.ok(existsSync(output), 'a failed actual crawl still must retain aggregate evidence');
    assert.deepEqual(JSON.parse(readFileSync(output, 'utf8')), { checked: 2, failureCount: 1, targetOrigin: target, sourceRevision: source, runId: '42', runAttempt: '2' });
    failing = false;
    const successOutput = path.join(directory, 'success.json');
    const positive = await promisify(execFile)(process.execPath, ['--experimental-strip-types', path.join(root, 'scripts/crawl-sitemap.ts')], { cwd: root, env: { ...process.env, BASE_URL: target, KINNSO_CRAWL_REPORT: successOutput, GITHUB_RUN_ID: '42', GITHUB_RUN_ATTEMPT: '2' } });
    assert.match(positive.stdout, /Checked 2 sitemap URLs/);
    assert.deepEqual(JSON.parse(readFileSync(successOutput, 'utf8')), { checked: 2, failureCount: 0, targetOrigin: target, sourceRevision: source, runId: '42', runAttempt: '2' });
  } finally {
    await new Promise(resolve => server.close(resolve));
    assert.equal(path.dirname(directory), path.resolve(tmpdir()));
    assert.ok(path.basename(directory).startsWith('kinnso-nightly-crawl-'));
    rmSync(directory, { recursive: true, force: true });
  }
});


test('zero-page pilot sitemap satisfies successful evidence without hiding failures', () => {
  const empty = receipt('sitemap', { checked: 0, failureCount: 0, targetOrigin: origin });
  assert.equal(empty.code, 0);
  assert.equal(empty.value.reportStatus, 'EMPTY');
  assert.deepEqual(empty.value.counts, { checkedUrls: 0, failures: 0 });
  assert.equal(empty.value.targetOrigin, origin);
  assert.equal(empty.value.scope, 'kinnso_os_anonymous_sitemap_gets');
  const contradictory = receipt('sitemap', { checked: 0, failureCount: 1, targetOrigin: origin });
  assert.equal(contradictory.code, 1);
  assert.deepEqual(contradictory.value.counts, { checkedUrls: 0, failures: 1 });
  const failed = receipt('sitemap', { checked: 0, failureCount: 1, targetOrigin: origin }, 'failure');
  assert.equal(failed.code, 0);
  assert.equal(failed.value.executionOutcome, 'failure');
  assert.deepEqual(failed.value.counts, { checkedUrls: 0, failures: 1 });
});

for (const [label, body, expectedFailures] of [['empty-urlset', '<urlset/>', 0], ['non-sitemap-html', '<!doctype html><html><h1>Unavailable</h1></html>', 1]]) {
  test(`actual zero-page ${label} retains truthful crawl and receipt outcomes`, async () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'kinnso-nightly-empty-'));
    const requested = [];
    const server = createServer((request, response) => {
      requested.push(request.url);
      if (request.url === '/robots.txt') {
        response.end('User-Agent: *\nDisallow: /\n');
        return;
      }
      response.setHeader('Content-Type', label === 'empty-urlset' ? 'application/xml' : 'text/html');
      response.end(body);
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
      const target = `http://127.0.0.1:${server.address().port}`, output = path.join(directory, 'crawl.json');
      const { execFile } = await import('node:child_process');
      const { promisify } = await import('node:util');
      const run = await promisify(execFile)(process.execPath, ['--experimental-strip-types', path.join(root, 'scripts/crawl-sitemap.ts')], { cwd: root, env: { ...process.env, BASE_URL: target, KINNSO_CRAWL_REPORT: output, GITHUB_RUN_ID: '42', GITHUB_RUN_ATTEMPT: '2' } })
        .then(result => ({ ...result, code: 0 })).catch(error => error);
      assert.equal(run.code, expectedFailures);
      assert.match(run.stdout, new RegExp(`Checked 0 sitemap URLs; ${expectedFailures} failures`));
      const aggregate = JSON.parse(readFileSync(output, 'utf8'));
      assert.deepEqual(aggregate, { checked: 0, failureCount: expectedFailures, targetOrigin: target, sourceRevision: source, runId: '42', runAttempt: '2' });
      assert.deepEqual(requested, ['/sitemap.xml'], 'synthetic reads only the sitemap; robots disallow is not a failure');
      // Receipt unit control substitutes the allowed origin; it claims no remote crawl.
      const result = receipt('sitemap', { ...aggregate, targetOrigin: origin });
      assert.equal(result.code, expectedFailures);
      assert.equal(result.value.reportStatus, 'EMPTY');
      assert.deepEqual(result.value.counts, { checkedUrls: 0, failures: expectedFailures });
    } finally {
      await new Promise(resolve => server.close(resolve));
      assert.equal(path.dirname(directory), path.resolve(tmpdir()));
      assert.ok(path.basename(directory).startsWith('kinnso-nightly-empty-'));
      rmSync(directory, { recursive: true, force: true });
    }
  });
}
