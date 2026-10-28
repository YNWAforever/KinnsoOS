import { execFileSync } from 'node:child_process';
import { createHmac, timingSafeEqual } from 'node:crypto';
import process from 'node:process';
import { Buffer } from 'node:buffer';
import { URL } from 'node:url';
import { assertNonProductionTarget } from './verify-kinnso-target.ts';

const blocked = () => { throw new Error('BLOCKED: worker tests require an attested synthetic local target and matching credentials'); };
const execute = (run, args) => String(run('docker', args, {
  encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 15000, maxBuffer: 2 * 1024 * 1024,
}));

// Peer credentials identify the socket creator, which may be systemd when
// dockerd inherits a listener. Require namespace and daemon/activation evidence;
// a local pathname, context name or environment declaration is not proof.
const localPeerProof = String.raw`
import json, os, pathlib, socket, struct, subprocess, sys
path = os.path.realpath(sys.argv[1])
ports = set(map(int, sys.argv[2:]))
assert os.path.isabs(path)
before = os.stat(path)
sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
sock.settimeout(5)
sock.connect(path)
if sys.platform == 'linux':
    pid, uid, gid = struct.unpack('3i', sock.getsockopt(socket.SOL_SOCKET, socket.SO_PEERCRED, 12))
elif sys.platform == 'darwin':
    pid = sock.getsockopt(0, 2) # SOL_LOCAL, LOCAL_PEERPID
else:
    raise RuntimeError('unsupported peer proof')
assert pid > 0
if sys.platform == 'linux':
    def same_namespace(pid):
        # Unlike /proc/<root-pid>/ns/net, this table is readable by Docker-group
        # users. Our still-open socket's kernel inode can appear only in its own
        # network namespace. A pathname comparison would not prove this.
        inode = str(os.fstat(sock.fileno()).st_ino)
        return any(row.split()[6:7] == [inode] for row in pathlib.Path('/proc/%s/net/unix' % pid).read_text().splitlines()[1:])
    def executable(pid):
        try:
            return os.path.basename(os.readlink('/proc/%s/exe' % pid))
        except PermissionError:
            # Root's exe symlink may be protected even with Docker socket access.
            status = pathlib.Path('/proc/%s/status' % pid).read_text().splitlines()
            assert any(line.split() == ['Uid:', '0', '0', '0', '0'] for line in status)
            name = pathlib.Path('/proc/%s/comm' % pid).read_text().strip()
            assert name == 'dockerd' or (pid == 1 and name == 'systemd')
            return name
    def parent(pid):
        for line in pathlib.Path('/proc/%s/status' % pid).read_text().splitlines():
            if line.startswith('PPid:'):
                return int(line.split()[1])
        raise RuntimeError('no parent')
    def owns_ports(pid):
        # RootlessKit/Desktop must own IPv4 listeners in the client's namespace.
        # Merely observing an unrelated listener on the expected port is unsafe.
        assert same_namespace(pid)
        inodes = set()
        for fd in pathlib.Path('/proc/%s/fd' % pid).iterdir():
            try:
                inodes.add(os.readlink(fd))
            except FileNotFoundError:
                pass # Unrelated short-lived descriptors may close during the walk.
        found = set()
        for line in pathlib.Path('/proc/%s/net/tcp' % pid).read_text().splitlines()[1:]:
            row = line.split()
            address, port = row[1].split(':')
            if row[3] == '0A' and address in ('0100007F', '00000000') and 'socket:[%s]' % row[9] in inodes:
                found.add(int(port, 16))
        assert ports <= found
    def activated_dockerd():
        assert pid == 1 and uid == 0 and same_namespace(pid)
        def properties(unit, keys):
            # Always query the local system manager; inherited bus/host settings
            # must not substitute another systemd instance's activation evidence.
            output = subprocess.check_output(['/usr/bin/systemctl', '--system', 'show', '--no-pager', '--no-ask-password', '--property=' + ','.join(keys), unit],
                text=True, env={'PATH': os.defpath, 'LC_ALL': 'C'}, timeout=5)
            return dict(line.split('=', 1) for line in output.splitlines())
        listener = properties('docker.socket', ['ActiveState', 'Accept', 'Listen', 'Triggers'])
        service = properties('docker.service', ['ActiveState', 'MainPID', 'TriggeredBy', 'ControlGroup'])
        assert listener['ActiveState'] == service['ActiveState'] == 'active'
        assert listener['Accept'] == 'no' and listener['Triggers'] == 'docker.service' and service['TriggeredBy'] == 'docker.socket'
        listen = listener['Listen']
        assert listen.endswith(' (Stream)') and os.path.realpath(listen[:-9]) == path
        daemon = int(service['MainPID'])
        assert daemon > 1 and executable(daemon) == 'dockerd' and same_namespace(daemon)
        args = pathlib.Path('/proc/%s/cmdline' % daemon).read_bytes().split(b'\0')
        assert any(arg in (b'-Hfd://', b'--host=fd://') or (arg == b'fd://' and i > 0 and args[i-1] in (b'-H', b'--host')) for i, arg in enumerate(args))
        group = service['ControlGroup']
        assert group.endswith('/docker.service') and any(line.split(':', 2)[-1] == group for line in pathlib.Path('/proc/%s/cgroup' % daemon).read_text().splitlines())
        return daemon
    name = executable(pid)
    mode = 'native'
    owner = pid
    if name == 'dockerd':
        if not same_namespace(pid):
            # The standard rootless builtin port driver forwards from its parent
            # in the client namespace into dockerd's private namespace.
            owner = parent(pid)
            while owner > 1 and executable(owner) != 'rootlesskit':
                owner = parent(owner)
            assert executable(owner) == 'rootlesskit'
            if not same_namespace(owner):
                owner = parent(owner)
            assert executable(owner) == 'rootlesskit' and same_namespace(owner)
            args = pathlib.Path('/proc/%s/cmdline' % owner).read_bytes().split(b'\0')
            assert b'--port-driver=builtin' in args or any(args[i:i+2] == [b'--port-driver', b'builtin'] for i in range(len(args)))
            owns_ports(owner)
            mode = 'rootless'
    elif name == 'com.docker.backend':
        owns_ports(pid)
        mode = 'desktop'
    elif name == 'systemd':
        owner = activated_dockerd()
    else:
        raise RuntimeError('not a local Docker peer')
    namespace = os.readlink('/proc/self/ns/net')
    # Include process start time to reject PID reuse as well as socket replacement.
    def start_time(pid):
        return pathlib.Path('/proc/%s/stat' % pid).read_text().rsplit(')', 1)[1].split()[19]
    peer = [pid, start_time(pid), owner, start_time(owner)]
elif sys.platform == 'darwin':
    # Desktop's local backend owns both the API socket and published listeners.
    name = subprocess.check_output(['ps', '-p', str(pid), '-o', 'comm='], text=True).strip()
    assert name.endswith('/com.docker.backend')
    for port in ports:
        listeners = subprocess.check_output(['lsof', '-nP', '-a', '-p', str(pid), '-i4TCP:%s' % port, '-sTCP:LISTEN', '-Fn'], text=True).splitlines()
        assert 'n127.0.0.1:%s' % port in listeners or 'n*:%s' % port in listeners
    mode, namespace = 'desktop', 'darwin-host'
    peer = [pid, subprocess.check_output(['ps', '-p', str(pid), '-o', 'lstart='], text=True).strip()]
after = os.stat(path)
assert (before.st_dev, before.st_ino) == (after.st_dev, after.st_ino)
print(json.dumps(dict(endpoint='unix://' + path, socket=[after.st_dev, after.st_ino], peer=peer, namespace=namespace, mode=mode)))
sock.close()
`;

const dockerSessions = new WeakMap();
function localDocker(env, run, ports) {
  // Snapshot the effective CLI environment once. The supplied env is authoritative
  // for Docker settings, including their absence (important for offline callers).
  const cliEnv = { ...process.env };
  for (const key of Object.keys(cliEnv)) if (key.startsWith('DOCKER_')) delete cliEnv[key];
  Object.assign(cliEnv, env);
  const options = { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 15000, maxBuffer: 2 * 1024 * 1024 };
  const contextRun = args => String(run('docker', args, { ...options, env: { ...cliEnv } }));
  let endpoint = cliEnv.DOCKER_HOST;
  // DOCKER_CONTEXT takes precedence over DOCKER_HOST, just as in the Docker CLI.
  if (cliEnv.DOCKER_CONTEXT || !endpoint) {
    const context = cliEnv.DOCKER_CONTEXT || contextRun(['context', 'show']).trim();
    if (!context || context.startsWith('-')) blocked();
    const rows = JSON.parse(contextRun(['context', 'inspect', context]));
    if (rows.length !== 1 || rows[0].Name !== context) blocked();
    endpoint = rows[0].Endpoints?.docker?.Host;
  }
  // Even loopback TCP can be an SSH tunnel to a remote daemon. Only a local Unix
  // peer with namespace evidence is supported; unknown transports fail closed.
  if (typeof endpoint !== 'string' || !/^unix:\/\/\/[^%?#\0\r\n\t]+$/.test(endpoint)) blocked();
  const prove = endpoint => {
    const proof = JSON.parse(String(run('python3', ['-I', '-c', localPeerProof, endpoint.slice(7), ...ports], { ...options, env: { ...cliEnv } })));
    if (!proof.endpoint?.startsWith('unix:///') || !proof.namespace || !proof.peer?.length || !proof.socket?.length ||
        !['native', 'rootless', 'desktop'].includes(proof.mode)) blocked();
    return proof;
  };
  const proof = prove(endpoint);
  // Resolve symlinks once, then use --host for EVERY identity/key/port command.
  // Ambient context/config changes cannot redirect subsequent Docker calls.
  for (const key of ['DOCKER_HOST', 'DOCKER_CONTEXT', 'DOCKER_TLS', 'DOCKER_TLS_VERIFY', 'DOCKER_CERT_PATH']) delete cliEnv[key];
  return {
    proof,
    run: (command, args, opts) => {
      if (command !== 'docker') blocked();
      return run(command, ['--host', proof.endpoint, ...args], { ...opts, env: { ...cliEnv } });
    },
    verify: () => { if (JSON.stringify(prove(proof.endpoint)) !== JSON.stringify(proof)) blocked(); },
  };
}
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
    env = { ...env };
    if (env.KINNSO_RUN_WORKER_DB_TESTS !== '1' || env.KINNSO_WORKER_TEST_DATA !== 'synthetic') blocked();
    if (!env.SUPABASE_ANON_KEY || !env.SUPABASE_SERVICE_ROLE_KEY) blocked();
    let docker;
    const pinnedRun = (command, args, options) => {
      docker ??= localDocker(env, run, [new URL(env.SUPABASE_URL).port]);
      return docker.run(command, args, options);
    };
    const target = assertNonProductionTarget(env, pinnedRun);
    const containers = JSON.parse(execute(pinnedRun, ['inspect', 'supabase_auth_' + target.projectRef, 'supabase_rest_' + target.projectRef]));
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
    docker.verify();
    const result = { ...target, url: env.SUPABASE_URL, anonKey: env.SUPABASE_ANON_KEY, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY };
    dockerSessions.set(result, docker.proof);
    return result;
  } catch { blocked(); }
}

/** The optional reader contract accepts ONLY a dedicated disposable MySQL
 * fixture: synthetic label, owned port, exact database/user/password and no
 * persistent or host mounts. A configured legacy host alone never enables it. */
export function requireSyntheticMysqlTarget(env, target, run = execFileSync) {
  try {
    env = { ...env };
    const name = 'kinnso_worker_mysql_' + target.projectRef;
    const port = target.projectRef === 'kinnso-v3' ? '54432' : '58432';
    if (env.LEGACY_DB_HOST !== '127.0.0.1' || env.LEGACY_DB_PORT !== port ||
        env.LEGACY_DB_DATABASE !== 'kinnso_sync_test' || env.LEGACY_DB_USERNAME !== 'kinnso_test' ||
        !env.LEGACY_DB_PASSWORD || env.LEGACY_DB_SSL !== 'disable') blocked();
    const supabaseProof = dockerSessions.get(target);
    if (!supabaseProof) blocked();
    const docker = localDocker(env, run, [new URL(target.url).port, port]);
    if (JSON.stringify(docker.proof) !== JSON.stringify(supabaseProof)) blocked();
    const rows = JSON.parse(execute(docker.run, ['inspect', name]));
    const container = rows[0];
    if (rows.length !== 1 || container.Name !== '/' + name || !container.State?.Running ||
        !/^[a-f0-9]{64}$/.test(container.Id) || container.Config?.Labels?.['com.kinnso.test-data'] !== 'synthetic' ||
        container.Config?.Labels?.['com.kinnso.test-project'] !== target.projectRef ||
        container.Mounts?.some(mount => mount.Type !== 'tmpfs') ||
        container.HostConfig?.NetworkMode === 'host') blocked();
    const bindings = container.NetworkSettings.Ports?.['3306/tcp'];
    if (bindings?.length !== 1 || bindings[0].HostIp !== '127.0.0.1' || bindings[0].HostPort !== port) blocked();
    const owner = execute(docker.run, ['ps', '--no-trunc', '--filter', 'publish=' + port, '--format', '{{.ID}} {{.Names}}']).trim();
    if (owner !== container.Id + ' ' + name) blocked();
    for (const [key, value] of [['MYSQL_DATABASE', env.LEGACY_DB_DATABASE], ['MYSQL_USER', env.LEGACY_DB_USERNAME], ['MYSQL_PASSWORD', env.LEGACY_DB_PASSWORD]]) {
      if (setting(container, key) !== value) blocked();
    }
    docker.verify();
    return { host: '127.0.0.1', port: Number(port), database: env.LEGACY_DB_DATABASE, user: env.LEGACY_DB_USERNAME, password: env.LEGACY_DB_PASSWORD, sslMode: 'disable' };
  } catch { blocked(); }
}
