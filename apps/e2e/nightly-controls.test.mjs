import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath, URL } from 'node:url';
import { promisify, stripVTControlCharacters } from 'node:util';
import process from 'node:process';

const root = fileURLToPath(new URL('../../', import.meta.url));
const artifacts = new URL('../../.ci-evidence/nightly-softgate-controls/', import.meta.url);
const funnelTitle = 'home to a published guide to its linked experience';
const incompleteReason = guide => `pilot-incomplete-creator-link: guide /en/g/${guide} has no creator link`;

function testsIn(suites) {
  return suites.flatMap(suite => [
    ...(suite.specs ?? []).flatMap(spec => spec.tests.map(result => ({ title: spec.title, ...result }))),
    ...testsIn(suite.suites ?? []),
  ]);
}

test('actual Nightly specs preserve pilot skips and hard funnel failures on synthetic loopback HTML', async t => {
  await mkdir(artifacts, { recursive: true });
  let mode;
  let requests = [];
  const header = '<header><nav>' + [
    ['Explore', 'explore'], ['My trips', 'trips'], ['Record', 'record'],
    ['For creators', 'studio'], ['For business', 'merchants/dashboard'],
  ].map(([name, path]) => `<a href="/en/${path}">${name}</a>`).join('') + '</nav></header>';
  const server = createServer((request, response) => {
    requests.push({ method: request.method, path: request.url });
    response.setHeader('Content-Type', 'text/html');
    if (request.url === '/en') {
      response.statusCode = mode === 'home-failure' ? 503 : 200;
      const guides = mode === 'incomplete' ? ['first', 'second'] : mode.startsWith('mixed') ? ['first', 'complete'] : ['complete'];
      const catalog = mode === 'empty' ? '<p>No published guides yet.</p>' : mode === 'catalog-error'
        ? '<p>Published content could not be loaded. Please retry.</p>'
        : guides.map(guide => `<a href="/en/g/${guide}">${guide}</a>`).join('');
      response.end(`${header}<main><h1>Synthetic KinnsoOS fixture</h1>${catalog}</main>`);
    } else if (/^\/en\/g\/(first|second|complete)$/.test(request.url)) {
      const creator = request.url.endsWith('/complete') ? '<a href="/en/c/author">Creator</a>' : '';
      const experience = mode === 'mixed-no-experience' ? '' : '<a href="/en/experiences/linked?src=guide">Experience</a>';
      response.end(`<h1>Synthetic published guide</h1>${creator}${experience}`);
    } else if (request.url === '/en/c/author') {
      response.statusCode = mode === 'mixed-broken-creator' ? 500 : 200;
      response.end('<h1>Synthetic creator</h1>');
    } else if (request.url === '/en/experiences/linked?src=guide') {
      response.statusCode = mode === 'mixed-broken-experience' ? 500 : 200;
      response.end(`<h1>Synthetic experience</h1><p>${mode === 'mixed-no-price' ? 'Price unavailable' : 'HKD 100'}</p>`);
    } else {
      response.statusCode = mode === 'missing-failure' && request.url === '/en/experiences/r7-missing-experience' ? 200 : 404;
      response.end('<h1>Synthetic missing page</h1>');
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const funnel = ['funnel-smoke', '--grep', 'home to'];
  try {
    for (const scenario of [
      { mode: 'empty', specs: ['funnel-smoke', 'funnel-fixture', 'notfound'], skipped: true },
      { mode: 'full', specs: ['funnel-smoke', 'funnel-fixture', 'notfound'] },
      { mode: 'incomplete', specs: funnel, skipped: true, incomplete: ['first', 'second'] },
      { mode: 'mixed', specs: funnel, incomplete: ['first'], complete: true },
      { mode: 'home-failure', specs: funnel, failed: true, error: 'home should return HTTP 200' },
      { mode: 'missing-failure', specs: ['notfound', '--grep', 'r7-missing-experience'], failed: true, error: 'Expected: 404' },
      { mode: 'mixed-broken-creator', specs: funnel, incomplete: ['first'], failed: true, error: '/en/c/author should return HTTP 200' },
      { mode: 'mixed-broken-experience', specs: funnel, incomplete: ['first'], failed: true, error: '/en/experiences/linked?src=guide should return HTTP 200' },
      { mode: 'mixed-no-price', specs: funnel, incomplete: ['first'], failed: true, error: 'toContainText' },
      { mode: 'mixed-no-experience', specs: funnel, incomplete: ['first'], failed: true, error: 'CONTENT_MISSING' },
      { mode: 'catalog-error', specs: funnel, failed: true, error: 'toContainText' },
    ]) await t.test(scenario.mode, { timeout: 90_000 }, async t => {
      mode = scenario.mode;
      requests = [];
      const reportPath = fileURLToPath(new URL(`${mode}.json`, artifacts));
      const run = await promisify(execFile)('pnpm', [
        '--filter', '@kinnso/e2e', 'e2e', ...scenario.specs, '--reporter=json', '--workers=1',
      ], {
        cwd: root, env: { ...process.env, CI: '', E2E_BASE_URL: `http://127.0.0.1:${server.address().port}`,
          BOOKING_LIVE: 'false', PLAYWRIGHT_JSON_OUTPUT_NAME: reportPath },
        maxBuffer: 8 * 1024 * 1024, timeout: 80_000,
      }).then(result => ({ ...result, code: 0 })).catch(error => error);
      await writeFile(new URL(`${mode}.log`, artifacts), `${run.stdout ?? ''}\n${run.stderr ?? ''}`);
      assert.equal(run.code, scenario.failed ? 1 : 0, run.stderr);
      const report = JSON.parse(await readFile(reportPath, 'utf8'));
      assert.equal(report.stats.unexpected, scenario.failed ? 1 : 0);
      assert.equal(report.stats.skipped, scenario.skipped ? 1 : 0);
      assert.equal(report.stats.flaky, 0);
      const tests = testsIn(report.suites);
      const subject = tests.find(result => result.title === funnelTitle) ?? tests[0];
      const annotations = subject.annotations ?? [];
      assert.deepEqual(annotations.filter(annotation => annotation.type === 'pilot-incomplete-creator-link')
        .map(annotation => annotation.description), (scenario.incomplete ?? []).map(incompleteReason));
      if (scenario.mode === 'incomplete') {
        assert.equal(subject.status, 'skipped');
        assert.equal(annotations.find(annotation => annotation.type === 'skip')?.description,
          ['first', 'second'].map(incompleteReason).join('; '));
        assert.ok(!requests.some(request => request.path.startsWith('/en/c/') || request.path.startsWith('/en/experiences/')));
      }
      if (scenario.mode === 'empty') assert.match(annotations.find(annotation => annotation.type === 'skip')?.description, /^PILOT_EMPTY:/);
      if (scenario.complete || scenario.mode === 'full') {
        assert.equal(subject.status, 'expected');
        for (const path of ['/en/g/complete', '/en/c/author', '/en/experiences/linked?src=guide']) {
          assert.ok(requests.some(request => request.path === path), `${path} must be exercised`);
        }
      }
      if (scenario.failed) assert.ok(subject.results.some(result => result.errors.some(error => stripVTControlCharacters(error.message).includes(scenario.error))), JSON.stringify(subject.results));
      assert.ok(requests.every(request => request.method === 'GET'), 'controls only permit read-only GETs');
      assert.equal(report.stats.expected + report.stats.unexpected + report.stats.skipped, tests.length);
      t.diagnostic(JSON.stringify({ fixture: mode, exitCode: run.code, passed: report.stats.expected,
        failed: report.stats.unexpected, skipped: report.stats.skipped, annotations }));
    });
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
