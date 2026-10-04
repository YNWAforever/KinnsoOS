import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { verifyTestTarget } from './verify-test-target.mjs';
const project = 'kinnsoos-b1-20261002', api = 'http://127.0.0.1:58421';
export function localConfiguration(source) {
 if (!/^project_id = "kinnso-v3"$/m.test(source) || !/^port = 54421$/m.test(source)) throw Error('Canonical local config required');
 let section = '';
 return source.split(/\r?\n/).map(line => {
  if (line.startsWith('[')) section = line;
  if (line === 'project_id = "kinnso-v3"') return `project_id = "${project}"`;
  const port = line.match(/^(port|shadow_port) = (544\d\d)$/); if (port) return `${port[1]} = ${Number(port[2]) + 4000}`;
  if (section === '[db.seed]' && /^enabled =/.test(line)) return 'enabled = false';
  if (section === '[auth]' && /^site_url =/.test(line)) return 'site_url = "http://127.0.0.1:3495"';
  if (section === '[auth]' && /^additional_redirect_urls =/.test(line)) return 'additional_redirect_urls = ["http://127.0.0.1:3495/auth/callback"]';
  return line;
 }).join('\n');
}
function role(key) { try { return JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()).role; } catch { return null; } }
export function localTestEnvironment(status, label) {
 if (label !== project || status.API_URL !== api || role(status.ANON_KEY) !== 'anon' || role(status.SERVICE_ROLE_KEY) !== 'service_role') throw Error('Owned local status and test keys required');
 const env = { KINNSO_TEST_TARGET: 'local', KINNSO_TEST_PROJECT: project, KINNSO_TEST_API_ORIGIN: api, KINNSO_TEST_DB_CONTAINER: 'supabase_db_' + project,
  SUPABASE_URL: api, SUPABASE_ANON_KEY: status.ANON_KEY, SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
  KINNSO_ENVIRONMENT: 'local', KINNSO_SUPABASE_URL: api, KINNSO_SUPABASE_PUBLISHABLE_KEY: status.ANON_KEY,
  KINNSO_APPROVED_SUPABASE_ORIGIN: api, KINNSO_LEGACY_AUTH_ORIGIN: api,
  KINNSO_ENABLED_CAPABILITIES: 'trips,bookmarks,media,sharing,creator,ops,merchant,notifications,agent,telemetry', KINNSO_MEDIA_RUNTIME: 'unified', KINNSO_SITE_URL: 'http://127.0.0.1:3495',KINNSO_CANONICAL_SOURCE_ORIGIN:'https://remix-kinnso-web.vercel.app' };
 verifyTestTarget(env); return env;
}
export function prepare(command, env = process.env) {
 if (env.CI !== 'true' || env.GITHUB_ACTIONS !== 'true') throw Error('CI-only setup; preserve existing developer environments');
 const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), root = path.resolve(app, '../..'), stack = path.join(root, '.local-private', 'connected-ci-stack');
 if (!fs.existsSync(path.join(root, 'pnpm-workspace.yaml'))) throw Error('Unified repository required');
 if (command === 'config') {
  if (fs.existsSync(stack)) throw Error('Fresh owned CI stack directory required');
  const config = localConfiguration(fs.readFileSync(path.join(root, 'supabase/config.toml'), 'utf8'));
  fs.mkdirSync(path.join(stack, 'supabase/migrations'), { recursive: true });
  fs.writeFileSync(path.join(stack, 'supabase/config.toml'), config, { flag: 'wx' });
  for (const file of fs.readdirSync(path.join(root, 'supabase/migrations'))) if (/^\d{14}_[a-z0-9_]+\.sql$/.test(file)) fs.copyFileSync(path.join(root, 'supabase/migrations', file), path.join(stack, 'supabase/migrations', file), fs.constants.COPYFILE_EXCL);
 } else if (command === 'env') {
  const container = JSON.parse(execFileSync('docker', ['inspect', 'supabase_db_' + project], { encoding: 'utf8' }))[0];
  if (!container.State.Running || !container.Config.Labels) throw Error('Owned CI database required');
  const status = JSON.parse(execFileSync('supabase', ['status', '--workdir', stack, '--output', 'json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
  const values = localTestEnvironment(status, container.Config.Labels['com.supabase.cli.project']);
  fs.writeFileSync(path.join(app, '.env.test'), Object.entries(values).map(([k, v]) => `${k}=${v}`).join('\n') + '\n', { flag: 'wx', mode: 0o600 });
 } else throw Error('Use config or env');
 console.log('Owned isolated connected CI setup complete; no production target or provider writes.');
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) prepare(process.argv[2]);
