import { spawnSync } from 'node:child_process';
import { rmSync, writeFileSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';
import { connectedArtifact, connectedSource } from './connected-build-identity.mjs';
import { verifyTestTarget } from './verify-test-target.mjs';

const app = fileURLToPath(new URL('../', import.meta.url));
process.chdir(app);
const manifest = '.next/connected-build.json';
rmSync(manifest, { force: true });
loadEnvFile('.env.test');
process.env.KINNSO_ENABLED_CAPABILITIES = [process.env.KINNSO_ENABLED_CAPABILITIES, 'pilot'].filter(Boolean).join(',');
verifyTestTarget();
const source = connectedSource(app);
const run = (file, args) => {
  const result = spawnSync(file, args, { stdio: 'inherit', windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) throw Error('Connected build step failed: ' + file);
};
run('python', ['scripts/package-source.py']);
run(process.execPath, ['node_modules/next/dist/bin/next', 'build', '--webpack']);
const artifact = connectedArtifact(app);
if (source.head !== artifact.head || source.tree !== artifact.tree) throw Error('Source changed during connected build');
writeFileSync(manifest, JSON.stringify(artifact), { flag: 'wx' });
console.log('Connected build:', artifact);
