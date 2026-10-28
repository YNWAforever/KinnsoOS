import { execFileSync } from 'node:child_process';
import { createHmac, timingSafeEqual } from 'node:crypto';
import process from 'node:process';
import { Buffer } from 'node:buffer';
import { assertNonProductionTarget } from './verify-kinnso-target.ts';

const blocked = () => { throw new Error('BLOCKED: worker tests require an attested synthetic local target and matching credentials'); };
const execute = (run, args) => String(run('docker', args, {
  encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 15000, maxBuffer: 2 * 1024 * 1024,
}));
const setting = (container, key) => {
  const values = container.Config.Env.filter(value => value.startsWith(key + '='));
  if (values.length !== 1) blocked();
  return values[0].slice(key.length + 1);
};

/** No HTTP or database clients are constructed here. The existing identity guard
 * attests Docker ownership, volume, port and auth/REST routing. Keys must also be
 * signed by that exact local auth service and accepted by its REST verifier. */
export function requireWorkerSupabaseTarget(env = process.env, run = execFileSync) {
  try {
    if (env.KINNSO_RUN_WORKER_DB_TESTS !== '1' || env.KINNSO_WORKER_TEST_DATA !== 'synthetic') blocked();
    if (!env.SUPABASE_ANON_KEY || !env.SUPABASE_SERVICE_ROLE_KEY) blocked();
    const target = assertNonProductionTarget(env, run);
    const containers = JSON.parse(execute(run, ['inspect', 'supabase_auth_' + target.projectRef, 'supabase_rest_' + target.projectRef]));
    const auth = containers.find(row => row.Id === target.identity.authId);
    const rest = containers.find(row => row.Id === target.identity.restId);
    const secret = setting(auth, 'GOTRUE_JWT_SECRET');
    if (!secret || secret.length < 32) blocked();
    const restSecret = setting(rest, 'PGRST_JWT_SECRET');
    // CLI 2.107 uses JWKS; older approved local fixtures may use the shared secret.
    if (restSecret !== secret) {
      const jwks = JSON.parse(restSecret);
      if (!jwks.keys?.some(key => key.kty === 'oct' && key.k === Buffer.from(secret).toString('base64url'))) blocked();
    }
    for (const [key, role] of [[env.SUPABASE_ANON_KEY, 'anon'], [env.SUPABASE_SERVICE_ROLE_KEY, 'service_role']]) {
      const parts = key.split('.');
      if (parts.length !== 3 || JSON.parse(Buffer.from(parts[0], 'base64url')).alg !== 'HS256') blocked();
      const claims = JSON.parse(Buffer.from(parts[1], 'base64url'));
      if (claims.role !== role || (claims.exp !== undefined && claims.exp <= Date.now() / 1000)) blocked();
      const expected = createHmac('sha256', secret).update(parts[0] + '.' + parts[1]).digest();
      const supplied = Buffer.from(parts[2], 'base64url');
      if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) blocked();
    }
    return { ...target, url: env.SUPABASE_URL, anonKey: env.SUPABASE_ANON_KEY, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY };
  } catch { blocked(); }
}

/** The optional reader contract accepts ONLY a dedicated disposable MySQL
 * fixture: synthetic label, owned port, exact database/user/password and no
 * persistent or host mounts. A configured legacy host alone never enables it. */
export function requireSyntheticMysqlTarget(env, target, run = execFileSync) {
  try {
    const name = 'kinnso_worker_mysql_' + target.projectRef;
    const port = target.projectRef === 'kinnso-v3' ? '54432' : '58432';
    if (env.LEGACY_DB_HOST !== '127.0.0.1' || env.LEGACY_DB_PORT !== port ||
        env.LEGACY_DB_DATABASE !== 'kinnso_sync_test' || env.LEGACY_DB_USERNAME !== 'kinnso_test' ||
        !env.LEGACY_DB_PASSWORD || env.LEGACY_DB_SSL !== 'disable') blocked();
    const rows = JSON.parse(execute(run, ['inspect', name]));
    const container = rows[0];
    if (rows.length !== 1 || container.Name !== '/' + name || !container.State?.Running ||
        !/^[a-f0-9]{64}$/.test(container.Id) || container.Config?.Labels?.['com.kinnso.test-data'] !== 'synthetic' ||
        container.Config?.Labels?.['com.kinnso.test-project'] !== target.projectRef ||
        container.Mounts?.some(mount => mount.Type !== 'tmpfs') ||
        container.HostConfig?.NetworkMode === 'host') blocked();
    const bindings = container.NetworkSettings.Ports?.['3306/tcp'];
    if (bindings?.length !== 1 || bindings[0].HostIp !== '127.0.0.1' || bindings[0].HostPort !== port) blocked();
    const owner = execute(run, ['ps', '--no-trunc', '--filter', 'publish=' + port, '--format', '{{.ID}} {{.Names}}']).trim();
    if (owner !== container.Id + ' ' + name) blocked();
    for (const [key, value] of [['MYSQL_DATABASE', env.LEGACY_DB_DATABASE], ['MYSQL_USER', env.LEGACY_DB_USERNAME], ['MYSQL_PASSWORD', env.LEGACY_DB_PASSWORD]]) {
      if (setting(container, key) !== value) blocked();
    }
    return { host: '127.0.0.1', port: Number(port), database: env.LEGACY_DB_DATABASE, user: env.LEGACY_DB_USERNAME, password: env.LEGACY_DB_PASSWORD, sslMode: 'disable' };
  } catch { blocked(); }
}
