import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const runnerPath = path.resolve('scripts/isolated-rehearsal.mjs');

test('historical rehearsal selects only a migration checkpoint in this checkout', async () => {
  const { resolveRehearsalBaseline } = await import(pathToFileURL(runnerPath));
  const migrations = ['20260718093422_cleanup.sql', '20260823090000_brief.sql', '20261002154501_return_visit.sql'];
  assert.equal(resolveRehearsalBaseline([], migrations), '20260823090000');
  assert.equal(resolveRehearsalBaseline(['--baseline', '20260718093422'], migrations), '20260718093422');
  for (const args of [
    ['--baseline', '20261003000000'], ['--baseline', '20260718'], ['--baseline'],
    ['--baseline', '20260718093422', '--linked'], ['--db-url', 'postgres://remote'],
    ['--workdir', '../another-stack'], ['--project-ref', 'production'], ['--local'],
  ]) assert.throws(() => resolveRehearsalBaseline(args, migrations), /BLOCKED/);
  assert.throws(() => resolveRehearsalBaseline([], ['20260718093422_cleanup.sql']), /BLOCKED/);
});

test('isolated rehearsal validates its owned workdir, config and Docker identity before resetting', async () => {
  assert.ok(existsSync(runnerPath), 'an isolated runner must exist without reusing the preview database');
  const { authorizeRehearsalTarget } = await import(pathToFileURL(runnerPath));
  const root = path.resolve('.');
  const project = 'kinnsoos-rehearsal-abcdef123456';
  const workdir = path.join(root, '.local-private/rehearsals', project);
  const marker = { project, repository: root, workdir };
  const config = `project_id = "${project}"\n[api]\nport = 59421\n[db]\nport = 59422\nshadow_port = 59420\n`;
  const inspection = { Name: `/supabase_db_${project}`, Config: { Labels: { 'com.supabase.cli.project': project } },
    HostConfig: { PortBindings: { '5432/tcp': [{ HostPort: '59422' }] } } };
  const target = { root, workdir, marker, config, inspection, linked: false };
  assert.doesNotThrow(() => authorizeRehearsalTarget(target));
  for (const change of [
    { workdir: path.join(root, '.local-private/local-stack') },
    { linked: true },
    { marker: { ...marker, repository: path.resolve('../another-checkout') } },
    { config: config.replace('59422', '58422') },
    { config: config.replace(project, 'kinnsoos-b1-20261002') },
    { inspection: { ...inspection, Config: { Labels: { 'com.supabase.cli.project': 'kinnso-v3' } } } },
    { inspection: { ...inspection, HostConfig: { PortBindings: { '5432/tcp': [{ HostPort: '54422' }] } } } },
  ]) assert.throws(() => authorizeRehearsalTarget({ ...target, ...change }), /BLOCKED/);
});
