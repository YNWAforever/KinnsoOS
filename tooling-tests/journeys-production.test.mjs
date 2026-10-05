import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';

const execute = promisify(execFile);
const python = process.platform === 'win32' ? 'python' : 'python3';
const script = fileURLToPath(new URL('../scripts/verify-journeys-production.py', import.meta.url));

async function fixture(options, callback) {
  const directory = mkdtempSync(path.join(tmpdir(), 'kinnso-readonly-'));
  mkdirSync(path.join(directory, 'scripts'));
  writeFileSync(path.join(directory, 'scripts/source-manifest.json'), JSON.stringify({ files: ['README.md'] }));
  writeFileSync(path.join(directory, 'README.md'), 'fixture source\n');
  execFileSync('git', ['init', '--quiet', directory]);
  execFileSync('git', ['-C', directory, '-c', 'core.autocrlf=false', 'add', 'README.md', 'scripts/source-manifest.json']);
  execFileSync('git', ['-C', directory, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.test', 'commit', '--quiet', '-m', 'fixture']);
  const sha = execFileSync('git', ['-C', directory, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  if (options.crlf) writeFileSync(path.join(directory, 'README.md'), 'fixture source\r\n');
  const zip = execFileSync(python, ['-c', `import io,zipfile,json,hashlib,sys
b=io.BytesIO()
body=${options.changedSource ? 'b"changed source\\n"' : 'b"fixture source\\n"'}
with zipfile.ZipFile(b,'w',zipfile.ZIP_DEFLATED) as z:
 z.writestr('README.md',body)
 z.writestr('SOURCE_METADATA.json',json.dumps(${options.badMetadata ? '[]' : `{'sourceRevision':'${options.stale ? 'f'.repeat(40) : sha}','dirty':True,'sha256':{'README.md':hashlib.sha256(body).hexdigest()}}`}))
sys.stdout.buffer.write(b.getvalue())`]);
  const requests = [];
  const server = createServer((request, response) => {
    requests.push({ method: request.method, path: request.url, cookie: request.headers.cookie, authorization: request.headers.authorization });
    const url = new URL(request.url, 'http://127.0.0.1');
    if (url.pathname === '/source/kinnsoos-source.zip') {
      response.setHeader('Content-Type', 'application/zip'); response.end(zip); return;
    }
    if (url.pathname.startsWith('/api/')) {
      response.statusCode = options.leak && url.pathname === '/api/trips' ? 200 : 401;
      if (!options.cacheLeak) response.setHeader('Cache-Control', 'private, no-store');
      response.end('opaque response body must never appear in logs'); return;
    }
    if (url.pathname === '/' || url.pathname.includes('callback')) {
      response.statusCode = 307;
      response.setHeader('Location', url.pathname === '/' ? '/zh-HK' : options.foreign ? 'https://example.org/evil' : '/en/sign-in?error=failed&next=%2Fen%2Ftrips');
      response.setHeader('Cache-Control', 'private, no-store'); response.end(); return;
    }
    response.setHeader('Content-Type', 'text/html');
    const locale = url.pathname.startsWith('/zh-HK') ? 'zh-HK' : 'en';
    response.end(options.errorShell ? '<html lang="en"><title>404</title><h1>Not found</h1></html>' : `<html lang="${locale}"><title>Kinnso Journeys</title><h1>Journeys</h1></html>`);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await callback({ directory, base, requests, sha });
  } finally {
    await new Promise(resolve => server.close(resolve));
    assert.equal(path.dirname(directory), path.resolve(tmpdir()));
    assert.ok(path.basename(directory).startsWith('kinnso-readonly-'));
    rmSync(directory, { recursive: true, force: true });
  }
}

async function run(context, extra = []) {
  try {
    const result = await execute(python, [script, '--base-url', context.base, '--expected-sha', context.sha, '--source-root', context.directory, '--allow-loopback', ...extra], { timeout: 20000 });
    return { code: 0, ...result };
  } catch (error) {
    return { code: error.code, stdout: error.stdout, stderr: error.stderr };
  }
}

test('deployed source and anonymous fences pass using only credential-free GETs', async () => {
  await fixture({}, async context => {
    const result = await run(context);
    assert.equal(result.code, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.status, 'PASS');
    assert.equal(report.deployedSourceRevision, context.sha);
    assert.equal(report.sourceFilesVerified, 1);
    assert.equal(report.packagingWorkspaceDirty, true);
    assert.equal(report.signedInAcceptance, 'NOT_RUN');
    assert.ok(context.requests.length >= 8);
    assert.ok(context.requests.every(r => r.method === 'GET' && !r.cookie && !r.authorization));
    assert.doesNotMatch(result.stdout + result.stderr, /opaque response/);
  });
});

test('Windows working-tree line endings do not invalidate matching committed source', async () => {
  await fixture({ crlf: true }, async context => {
    const result = await run(context);
    assert.equal(result.code, 0, result.stdout + result.stderr);
    assert.equal(JSON.parse(result.stdout).sourceFilesVerified, 1);
  });
});

for (const [name, options] of [
  ['stale deployed revision cannot pass current-head acceptance', { stale: true }],
  ['self-consistent archive with different checkout bytes cannot pass', { changedSource: true }],
  ['anonymous trip access cannot pass even with HTTP200', { leak: true }],
  ['private API without no-store cannot pass', { cacheLeak: true }],
  ['foreign callback redirect fails before following it', { foreign: true }],
  ['branded 404 shell cannot pass as a healthy homepage', { errorShell: true }],
  ['malformed archive metadata fails with a sanitized JSON receipt', { badMetadata: true }],
]) {
  test(name, async () => {
    await fixture(options, async context => {
      const result = await run(context);
      assert.equal(result.code, 1, result.stderr);
      assert.equal(JSON.parse(result.stdout).status, 'FAIL');
      assert.doesNotMatch(result.stdout + result.stderr, /opaque response/);
    });
  });
}

test('unapproved production target is rejected before any request', async () => {
  await fixture({}, async context => {
    const result = await run(context, ['--base-url', 'https://example.org']);
    assert.equal(result.code, 1, result.stderr);
    assert.equal(context.requests.length, 0);
  });
});

test('malformed expected revision is rejected before any request', async () => {
  await fixture({}, async context => {
    const result = await run(context, ['--expected-sha', 'main']);
    assert.equal(result.code, 1, result.stderr);
    assert.equal(context.requests.length, 0);
  });
});
