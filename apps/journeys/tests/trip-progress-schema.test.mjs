import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';

// This is a source-package/API compatibility gate, not a substitute for the
// owned database tests. It catches an omitted RPC or an incompatible overload.
const name = '20261024120000_kinnso_private_trip_progress.sql';
const packaged = new URL('./contracts/' + name, import.meta.url);
const canonical = new URL('../../../supabase/migrations/' + name, import.meta.url);
const file = existsSync(packaged) ? packaged : canonical;
const sql = existsSync(file) ? readFileSync(file, 'utf8').replace(/--[^\n]*|\/\*[\s\S]*?\*\//g, '') : '';
const declarations = new Map([...sql.matchAll(
  /create\s+(?:or\s+replace\s+)?function\s+public\.(\w+)\s*\(([^)]*)\)\s*returns\s+jsonb/gi,
)].map(([, rpc, args]) => [rpc.toLowerCase(), args.split(',').map(arg => arg.trim().toLowerCase().replace(/\s+/g, ' '))]));

for (const [rpc, args] of [
  ['get_trip_progress', ['p_trip_id uuid']],
  ['apply_trip_progress', [
    'p_trip_id uuid', 'p_request_id uuid', 'p_stop_id uuid', 'p_state text',
    'p_expected_trip_revision integer', 'p_expected_progress_revision integer',
  ]],
]) test(`the shipped schema supplies the ${rpc} API contract`, () => {
  assert.deepEqual(declarations.get(rpc), args, `${rpc} must be supplied by the shipped migration, with the API's named arguments and JSONB result`);
});
