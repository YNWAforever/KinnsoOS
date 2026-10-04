import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { loadEnvFile } from 'node:process';
import { verifyTestTarget } from './verify-test-target.mjs';
loadEnvFile('.env.test');
verifyTestTarget();
const files = readdirSync(new URL('../tests/integration/', import.meta.url))
  .filter(name => name.endsWith('.test.mjs')).map(name => `tests/integration/${name}`);
if (!files.length) throw new Error('BLOCKED: integration cases have not been installed');
// Some cases temporarily change the shared isolated schema to verify missing-capability
// behavior. Run files sequentially; individual cases still exercise concurrent commands.
const result = spawnSync(process.execPath, ['--experimental-strip-types', '--test', '--test-concurrency=1', ...files], { stdio: 'inherit' });
process.exit(result.status ?? 1);
