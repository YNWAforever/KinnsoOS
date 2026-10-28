import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { requireWorkerSupabaseTarget, requireSyntheticMysqlTarget } from '../scripts/worker-test-target.mjs';
import { runtimeFixture, targetEnv } from '../apps/journeys/tests/helpers/target-runtime.mjs';

const endpoint = 'unix:///var/run/docker.sock';
const localProof = { endpoint, socket: [1, 2], peer: [123, '456', 123], namespace: 'net:[789]', mode: 'native' };
function localRuntime(dockerRun) {
  const calls = [];
  let context = 'default', host = endpoint, proof = localProof;
  const run = (command, args, options) => {
    calls.push({ command, args, options });
    if (command === 'python3') {
      if (proof instanceof Error) throw proof;
      return JSON.stringify(proof);
    }
    assert.equal(command, 'docker');
    if (args[0] === 'context' && args[1] === 'show') return context;
    if (args[0] === 'context' && args[1] === 'inspect') return JSON.stringify([{ Name: args[2], Endpoints: { docker: { Host: host } } }]);
    assert.deepEqual(args.slice(0, 2), ['--host', proof.endpoint]);
    assert.equal(options.env.DOCKER_CONTEXT, undefined);
    assert.equal(options.env.DOCKER_HOST, undefined);
    return dockerRun(command, args.slice(2), options);
  };
  return { run, calls, setContext: value => { context = value; }, setHost: value => { host = value; }, setProof: value => { proof = value; } };
}

const secret = 'synthetic-test-secret-never-used-outside-this-fixture';
const jwt = (role, key = secret) => {
  const message = [Buffer.from(JSON.stringify({ alg: 'HS256' })).toString('base64url'), Buffer.from(JSON.stringify({ role })).toString('base64url')].join('.');
  return message + '.' + createHmac('sha256', key).update(message).digest('base64url');
};
function fixture(project) {
  const docker = runtimeFixture(project);
  docker.containers[3].Config.Env.push('GOTRUE_JWT_SECRET=' + secret);
  docker.containers[2].Config.Env.push('PGRST_JWT_SECRET=' + JSON.stringify({ keys: [{ kty: 'oct', k: Buffer.from(secret).toString('base64url') }] }));
  const env = { ...targetEnv(project), KINNSO_RUN_WORKER_DB_TESTS: '1', KINNSO_WORKER_TEST_DATA: 'synthetic', SUPABASE_ANON_KEY: jwt('anon'), SUPABASE_SERVICE_ROLE_KEY: jwt('service_role') };
  const runtime = localRuntime(docker.run);
  return { docker: { ...docker, run: runtime.run }, env, runtime };
}

function mysqlFixture(target, env) {
  const name = 'kinnso_worker_mysql_' + target.projectRef;
  const mysqlEnv = { ...env, LEGACY_DB_HOST: '127.0.0.1', LEGACY_DB_PORT: '58432', LEGACY_DB_DATABASE: 'kinnso_sync_test', LEGACY_DB_USERNAME: 'kinnso_test', LEGACY_DB_PASSWORD: 'synthetic-password', LEGACY_DB_SSL: 'disable' };
  const mysql = { Id: 'f'.repeat(64), Name: '/' + name, State: { Running: true }, HostConfig: { NetworkMode: 'bridge' },
    Config: { Labels: { 'com.kinnso.test-data': 'synthetic', 'com.kinnso.test-project': target.projectRef }, Env: ['MYSQL_DATABASE=kinnso_sync_test', 'MYSQL_USER=kinnso_test', 'MYSQL_PASSWORD=synthetic-password'] },
    NetworkSettings: { Ports: { '3306/tcp': [{ HostIp: '127.0.0.1', HostPort: '58432' }] } }, Mounts: [{ Type: 'tmpfs' }] };
  const runtime = localRuntime((_command, args) => args[0] === 'inspect' ? JSON.stringify([mysql]) : mysql.Id + ' ' + name);
  return { mysql, env: mysqlEnv, runtime };
}

test('attests the actual isolated route and signing keys before returning client inputs', () => {
  const { docker, env } = fixture();
  const result = requireWorkerSupabaseTarget(env, docker.run);
  assert.equal(result.url, env.SUPABASE_URL);
  assert.equal(result.serviceRoleKey, env.SUPABASE_SERVICE_ROLE_KEY);
  assert.equal(result.identity.authId, docker.containers[3].Id);
});

test('accepts canonical CI only with CI=true and its attested port/container', () => {
  const { docker, env } = fixture('kinnso-v3');
  for (const key of ['SUPABASE_URL', 'KINNSO_TEST_API_ORIGIN']) env[key] = 'http://127.0.0.1:54421';
  docker.containers[1].NetworkSettings.Ports['8000/tcp'][0].HostPort = '54421';
  assert.throws(() => requireWorkerSupabaseTarget(env, docker.run), /BLOCKED/);
  assert.equal(requireWorkerSupabaseTarget({ ...env, CI: 'true' }, docker.run).projectRef, 'kinnso-v3');
});

test('credentials alone, cloud/mismatched origins and missing synthetic attestation fail without Docker', () => {
  const { env } = fixture();
  for (const change of [
    { KINNSO_RUN_WORKER_DB_TESTS: undefined }, { KINNSO_WORKER_TEST_DATA: undefined },
    { KINNSO_TEST_TARGET: 'cloud' }, { SUPABASE_URL: 'https://unapproved.supabase.co' },
    { NEXT_PUBLIC_SUPABASE_URL: 'https://unapproved.supabase.co' },
    { KINNSO_TEST_PROJECT: 'unknown' }, { SUPABASE_ANON_KEY: undefined }, { SUPABASE_SERVICE_ROLE_KEY: undefined },
  ]) {
    let calls = 0;
    assert.throws(() => requireWorkerSupabaseTarget({ ...env, ...change }, () => { calls++; throw Error('unexpected Docker'); }), /BLOCKED/);
    assert.equal(calls, 0);
  }
});

test('cloud-signed, swapped-role, unsigned credentials fail on an otherwise attested target', () => {
  const { docker, env } = fixture();
  for (const change of [
    { SUPABASE_SERVICE_ROLE_KEY: jwt('service_role', 'different-cloud-signing-secret') },
    { SUPABASE_ANON_KEY: jwt('anon', 'different-cloud-signing-secret') },
    { SUPABASE_SERVICE_ROLE_KEY: jwt('anon') }, { SUPABASE_ANON_KEY: jwt('service_role') },
    { SUPABASE_SERVICE_ROLE_KEY: 'header.payload.' },
  ]) assert.throws(() => requireWorkerSupabaseTarget({ ...env, ...change }, docker.run), /BLOCKED/);
  docker.containers[2].Config.Env[1] = 'PGRST_JWT_SECRET=different-rest-secret';
  assert.throws(() => requireWorkerSupabaseTarget(env, docker.run), /BLOCKED/);
});

test('unavailable or changed Docker identity fails closed without exposing stderr or secrets', () => {
  const { docker, env } = fixture();
  assert.throws(() => requireWorkerSupabaseTarget(env, () => { throw Error(secret); }), value => !value.message.includes(secret) && /BLOCKED/.test(value.message));
  docker.containers[2].Config.Env[0] = 'PGRST_DB_URI=postgresql://role:secret@cloud.invalid:5432/postgres';
  assert.throws(() => requireWorkerSupabaseTarget(env, docker.run), /BLOCKED/);
});

test('reader accepts only the ephemeral, labeled, loopback synthetic MySQL fixture with matching credentials', () => {
  const { env, docker } = fixture();
  const target = requireWorkerSupabaseTarget(env, docker.run);
  const { mysql, env: mysqlEnv, runtime: { run } } = mysqlFixture(target, env);
  assert.equal(requireSyntheticMysqlTarget(mysqlEnv, target, run).database, 'kinnso_sync_test');
  for (const change of [{ LEGACY_DB_HOST: 'cloud.invalid' }, { LEGACY_DB_PASSWORD: 'wrong' }, { LEGACY_DB_PORT: '3306' }, { LEGACY_DB_DATABASE: 'production' }]) {
    assert.throws(() => requireSyntheticMysqlTarget({ ...mysqlEnv, ...change }, target, run), /BLOCKED/);
  }
  mysql.Mounts = [{ Type: 'bind' }];
  assert.throws(() => requireSyntheticMysqlTarget(mysqlEnv, target, run), /BLOCKED/);
});

test('rejects remote explicit hosts, explicit contexts and implicit current contexts before inspections', () => {
  for (const remote of ['ssh://remote.invalid', 'tcp://remote.invalid:2376', 'tcp://127.0.0.1:2375', 'npipe:////./pipe/docker_engine']) {
    for (const selection of ['host', 'context', 'implicit']) {
      const { env, runtime } = fixture();
      if (selection === 'host') env.DOCKER_HOST = remote;
      if (selection === 'context') env.DOCKER_CONTEXT = 'remote';
      runtime.setContext('remote');
      runtime.setHost(remote);
      assert.throws(() => requireWorkerSupabaseTarget(env, runtime.run), /BLOCKED/);
      assert.ok(runtime.calls.every(call => call.command === 'docker' && call.args[0] === 'context'));
    }
  }
});

test('local endpoint evidence supports explicit hosts and named rootless/Desktop contexts with Docker precedence', () => {
  for (const [mode, host] of [['native', endpoint], ['rootless', 'unix:///run/user/1000/docker.sock'], ['desktop', 'unix:///home/test user/.docker/desktop/docker.sock']]) {
    for (const selection of ['host', 'context', 'implicit']) {
      const { env, runtime } = fixture();
      runtime.setContext(mode);
      runtime.setHost(host);
      runtime.setProof({ ...localProof, endpoint: host, mode });
      if (selection === 'host') env.DOCKER_HOST = host;
      if (selection === 'context') Object.assign(env, { DOCKER_CONTEXT: mode, DOCKER_HOST: 'ssh://ignored.invalid' });
      assert.equal(requireWorkerSupabaseTarget(env, runtime.run).url, env.SUPABASE_URL);
      const proofCalls = runtime.calls.filter(call => call.command === 'python3');
      assert.equal(proofCalls.length, 2);
      assert.deepEqual(proofCalls[0].args.slice(0, 2), ['-I', '-c']);
      assert.deepEqual(proofCalls[0].args.slice(3), [host.slice(7), '58421']);
    }
  }
});

test('unavailable namespace/peer proof and replaced endpoints fail closed without leaking details', () => {
  for (const failure of [new Error(secret), {}, { ...localProof, mode: 'unproven' }]) {
    const { env, runtime, docker } = fixture();
    runtime.setProof(failure);
    assert.throws(() => requireWorkerSupabaseTarget(env, runtime.run), error => /BLOCKED/.test(error.message) && !error.message.includes(secret));
    assert.equal(docker.calls.length, 0);
  }
  const { env, runtime, docker } = fixture();
  const run = (command, args, options) => {
    const result = runtime.run(command, args, options);
    if (command === 'docker' && args.includes('supabase_auth_' + env.KINNSO_TEST_PROJECT) && docker.calls.length > 1) {
      runtime.setProof({ ...localProof, socket: [1, 999] });
    }
    return result;
  };
  assert.throws(() => requireWorkerSupabaseTarget(env, run), /BLOCKED/);
});

test('pins endpoint and environment through database ID, identity, routing, key and owner checks', () => {
  const { env, runtime, docker } = fixture();
  env.SUPABASE_DB_CONTAINER = docker.containers[0].Id.slice(0, 12);
  env.DOCKER_CONTEXT = 'local';
  const run = (command, args, options) => {
    const result = runtime.run(command, args, options);
    if (command === 'python3') {
      env.DOCKER_CONTEXT = 'remote';
      env.SUPABASE_URL = 'https://unapproved.supabase.co';
      runtime.setHost('ssh://remote.invalid');
    }
    return result;
  };
  // The shared fixture normally returns all containers; ID resolution needs one.
  const inspectId = (command, args, options) => {
    const result = run(command, args, options);
    return command === 'docker' && args[2] === 'inspect' && args[3] === env.SUPABASE_DB_CONTAINER ? JSON.stringify([docker.containers[0]]) : result;
  };
  assert.equal(requireWorkerSupabaseTarget(env, inspectId).url, 'http://127.0.0.1:58421');
  const daemonCalls = runtime.calls.filter(call => call.args[0] === '--host');
  assert.equal(daemonCalls.length, 5);
  assert.ok(daemonCalls.every(call => call.args[1] === endpoint && call.options.env.DOCKER_CONTEXT === undefined));
});

test('MySQL independently rejects remote contexts, missing proof and a daemon different from Supabase', () => {
  const { env, docker } = fixture();
  const target = requireWorkerSupabaseTarget(env, docker.run);
  for (const selection of ['host', 'context', 'implicit', 'unavailable', 'mismatched', 'forged target']) {
    const mysql = mysqlFixture(target, env);
    if (selection === 'host') mysql.env.DOCKER_HOST = 'ssh://remote.invalid';
    if (selection === 'context') mysql.env.DOCKER_CONTEXT = 'remote';
    if (['context', 'implicit'].includes(selection)) mysql.runtime.setHost('ssh://remote.invalid');
    if (selection === 'unavailable') mysql.runtime.setProof(new Error('namespace not available'));
    if (selection === 'mismatched') mysql.runtime.setProof({ ...localProof, endpoint: 'unix:///another.sock', peer: [999] });
    assert.throws(() => requireSyntheticMysqlTarget(mysql.env, selection === 'forged target' ? { ...target } : target, mysql.runtime.run), /BLOCKED/);
    assert.ok(mysql.runtime.calls.every(call => call.args[0] !== '--host'));
  }
});

test('MySQL pins all inspections and owner checks and rechecks namespace/socket identity', () => {
  const { env, docker } = fixture();
  const target = requireWorkerSupabaseTarget(env, docker.run);
  for (const replace of [false, true]) {
    const mysql = mysqlFixture(target, env);
    const run = (command, args, options) => {
      const result = mysql.runtime.run(command, args, options);
      if (command === 'docker' && args[2] === 'inspect') {
        mysql.env.DOCKER_HOST = 'ssh://remote.invalid';
        mysql.runtime.setHost('ssh://remote.invalid');
      }
      if (replace && command === 'docker' && args[2] === 'ps') mysql.runtime.setProof({ ...localProof, namespace: 'net:[different]' });
      return result;
    };
    if (replace) assert.throws(() => requireSyntheticMysqlTarget(mysql.env, target, run), /BLOCKED/);
    else assert.equal(requireSyntheticMysqlTarget(mysql.env, target, run).port, 58432);
    assert.equal(mysql.runtime.calls.filter(call => call.args[0] === '--host').length, 2);
    assert.deepEqual(mysql.runtime.calls.find(call => call.command === 'python3').args.slice(3), ['/var/run/docker.sock', '58421', '58432']);
  }
});

function peerProofRunner() {
  const { env, runtime } = fixture();
  requireWorkerSupabaseTarget(env, runtime.run);
  const script = runtime.calls.find(call => call.command === 'python3').args[2];
  const harness = String.raw`
from unittest.mock import patch
from types import SimpleNamespace
import json, os, pathlib, socket, struct, subprocess, sys
case = json.loads(sys.argv[1])
kind = case.get('kind', 'native')
pid = 1 if kind == 'systemd' else 123
def readlink(path):
    path = str(path)
    if path == '/proc/self/ns/net': return 'net:[789]'
    if path.endswith('/exe'):
        if case.get('protected_exe'): raise PermissionError()
        name = 'ssh' if case.get('proxy_peer') else 'com.docker.backend' if kind == 'desktop' else 'dockerd'
        if case.get('daemon_not_docker') and path == '/proc/123/exe': name = 'socat'
        return '/usr/bin/' + ({'/proc/124/exe':'rootlesskit', '/proc/125/exe':'rootlesskit', '/proc/1/exe':'systemd' if kind == 'systemd' else 'init'}.get(path, name))
    if '/fd/' in path: return 'socket:[%s]' % ('9999' if case.get('wrong_owner') else ('4444' if path.endswith('/3') else '4445'))
    raise RuntimeError(path)
def read_text(path, *args, **kwargs):
    path = str(path)
    if path.endswith('/net/unix'):
        visible = not case.get('wrong_namespace') and (kind != 'rootless' or path == '/proc/125/net/unix') and not (case.get('daemon_wrong_namespace') and path == '/proc/123/net/unix')
        return 'header\n' + ('0: 2 0 10000 1 01 5555\n' if visible else '')
    if path.endswith('/net/tcp'):
        ports = [58421] if case.get('missing_mysql_port') else [58421, 58432]
        return 'header\n' + '\n'.join('0: 0100007F:%04X 0:0 0A 0 0 0 1000 0 %s' % (port, 4444+i) for i, port in enumerate(ports))
    if path.endswith('/status'):
        parent = 124 if path == '/proc/123/status' and kind == 'rootless' else 125 if path == '/proc/124/status' else 1
        return 'PPid: %s\nUid: 0 0 0 0\n' % parent
    if path.endswith('/stat'): return '123 (dockerd) ' + ' '.join(['0'] * 19 + ['456'])
    if path.endswith('/comm'): return 'systemd\n' if path == '/proc/1/comm' else 'dockerd\n'
    if path.endswith('/cgroup'): return '0::/system.slice/docker.service\n'
    raise RuntimeError(path)
def read_bytes(path):
    if kind == 'systemd': return b'dockerd\0-H\0' + (b'unix:///other.sock' if case.get('not_inherited') else b'fd://') + b'\0'
    return b'rootlesskit\0--port-driver=builtin\0'
def check_output(args, **kwargs):
    if args[0] == '/usr/bin/systemctl':
        assert kwargs['env'] == {'PATH': os.defpath, 'LC_ALL': 'C'}
        if case.get('unavailable_activation'): raise PermissionError()
        if args[-1] == 'docker.socket':
            return 'ActiveState=active\nAccept=no\nListen=%s (Stream)\nTriggers=%s\n' % ('/other.sock' if case.get('wrong_listener') else '/var/run/docker.sock', 'proxy.service' if case.get('proxy_service') else 'docker.service')
        return 'ActiveState=active\nMainPID=123\nTriggeredBy=docker.socket\nControlGroup=/system.slice/docker.service\n'
    if args[0] == 'lsof':
        return 'n127.0.0.1:%s\n' % (args[5].split(':')[1] if not case.get('wrong_owner') else '1')
    return '/Applications/Docker.app/Contents/MacOS/com.docker.backend\n' if args[-1] == 'comm=' else 'start time\n'
class FakeSocket:
    def __init__(self, *args): pass
    def settimeout(self, value): pass
    def connect(self, path):
        if case.get('unavailable'): raise PermissionError()
    def getsockopt(self, *args):
        peer_pid = 0 if case.get('hidden_peer') else pid
        return peer_pid if case.get('darwin') else struct.pack('3i', peer_pid, 0 if case.get('protected_exe') or kind == 'systemd' else 1000, 1000)
    def fileno(self): return 99
    def close(self): pass
sys.argv = ['proof', '/var/run/docker.sock', '58421', '58432']
with patch.object(sys, 'platform', 'darwin' if case.get('darwin') else 'linux'), \
     patch.object(socket, 'socket', FakeSocket), \
     patch.object(os.path, 'realpath', lambda path: path), \
     patch.object(os, 'stat', lambda path: SimpleNamespace(st_dev=1, st_ino=2)), \
     patch.object(os, 'fstat', lambda fd: SimpleNamespace(st_ino=5555)), \
     patch.object(os, 'readlink', readlink), \
     patch.object(pathlib.Path, 'read_text', read_text), \
     patch.object(pathlib.Path, 'read_bytes', read_bytes), \
     patch.object(pathlib.Path, 'iterdir', lambda path: [path / '3', path / '4']), \
     patch.object(subprocess, 'check_output', check_output):
`;
  return options => {
    try {
      return execFileSync('python3', ['-I', '-c', harness + '\n    exec(compile(' + JSON.stringify(script) + ', "peer-proof", "exec"))\n', JSON.stringify(options)], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (error) { throw new Error(JSON.stringify(options) + ': ' + error.stderr.slice(-1000)); }
  };
}

test('peer proof requires the daemon namespace or the local rootless/Desktop port owner (all OS/socket reads synthetic)', () => {
  const proof = peerProofRunner();
  for (const options of [{}, { protected_exe: true }, { kind: 'rootless' }, { kind: 'desktop' }, { kind: 'desktop', darwin: true }]) {
    assert.equal(JSON.parse(proof(options)).mode, options.kind || 'native');
  }
  for (const options of [
    { wrong_namespace: true }, { hidden_peer: true }, { unavailable: true }, { proxy_peer: true },
    { kind: 'rootless', wrong_owner: true }, { kind: 'rootless', missing_mysql_port: true },
    { kind: 'desktop', wrong_owner: true }, { kind: 'desktop', missing_mysql_port: true },
    { kind: 'desktop', wrong_namespace: true }, { kind: 'desktop', darwin: true, wrong_owner: true },
  ]) assert.throws(() => proof(options));
});

test('systemd listener creator requires matching local socket activation and an actual dockerd in the client namespace', () => {
  const proof = peerProofRunner();
  for (const protected_exe of [false, true]) {
    const result = JSON.parse(proof({ kind: 'systemd', protected_exe }));
    assert.equal(result.mode, 'native');
    assert.equal(result.peer[0], 1);
    assert.equal(result.peer[2], 123);
  }
  for (const options of [
    { wrong_namespace: true }, { daemon_wrong_namespace: true }, { daemon_not_docker: true },
    { unavailable_activation: true }, { wrong_listener: true }, { not_inherited: true }, { proxy_service: true },
  ]) assert.throws(() => proof({ kind: 'systemd', ...options }));
});
