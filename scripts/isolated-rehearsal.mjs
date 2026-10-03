import process from 'node:process';
import console from 'node:console';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, copyFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { createServer } from 'node:net';

const repository = fileURLToPath(new URL('../', import.meta.url));
const baseline = '20260823090000';
const ports = [59420, 59421, 59422];

export function authorizeRehearsalTarget({ root, workdir, marker, config, inspection, linked }) {
  const project = marker.project;
  const sectionPort = section => Number(config.match(new RegExp(`^\\[${section}\\]\\s*\n(?:(?!\\[)[\\s\\S])*?^port\\s*=\\s*(\\d+)`, 'm'))?.[1]);
  if (!/^kinnsoos-rehearsal-[a-f0-9]{12}$/.test(project ?? '') || linked ||
      path.resolve(marker.repository) !== path.resolve(root) ||
      path.resolve(workdir) !== path.join(path.resolve(root), '.local-private', 'rehearsals', project) ||
      path.resolve(marker.workdir) !== path.resolve(workdir) ||
      !new RegExp(`^project_id\\s*=\\s*"${project}"\\s*$`, 'm').test(config) ||
      sectionPort('api') !== 59421 || sectionPort('db') !== 59422 ||
      inspection.Name !== `/supabase_db_${project}` ||
      inspection.Config?.Labels?.['com.supabase.cli.project'] !== project ||
      inspection.HostConfig?.PortBindings?.['5432/tcp']?.[0]?.HostPort !== '59422') {
    throw new Error('BLOCKED: rehearsal must target its newly created, unlinked local database');
  }
}

async function requireFreePorts() {
  for (const port of ports) await new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', () => reject(new Error(`BLOCKED: rehearsal port ${port} is occupied`)));
    server.listen(port, '127.0.0.1', () => server.close(resolve));
  });
}

export async function rehearse() {
  if (process.argv.slice(2).length) throw new Error('No target overrides are supported by this isolated runner');
  await requireFreePorts();
  const project = `kinnsoos-rehearsal-${randomUUID().replaceAll('-', '').slice(0, 12)}`;
  const workdir = path.join(repository, '.local-private', 'rehearsals', project);
  const supabase = path.join(workdir, 'supabase');
  const source = path.join(repository, 'supabase', 'migrations');
  const names = readdirSync(source).filter(name => /^\d+_.*\.sql$/.test(name)).sort();
  const expected = names.at(-1).split('_')[0];
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repository, encoding: 'utf8' }).trim();
  const manifest = names.map(name => ({ name, sha256: createHash('sha256').update(readFileSync(path.join(source, name))).digest('hex') }));
  if (existsSync(workdir)) throw new Error('BLOCKED: rehearsal directory already exists');
  mkdirSync(path.join(supabase, 'migrations'), { recursive: true });
  const configPath = path.join(supabase, 'config.toml');
  const markerPath = path.join(workdir, 'OWNER.json');
  writeFileSync(markerPath, JSON.stringify({ project, repository, workdir, head }, null, 2) + '\n');
  writeFileSync(configPath, readFileSync(path.join(repository, 'supabase/config.toml'), 'utf8')
    .replace(/^project_id\s*=.*$/m, `project_id = "${project}"`)
    .replace(/\b5442(\d)\b/g, '5942$1')
    .replace(/(\[db.seed\][\s\S]*?enabled\s*=\s*)true/, '$1false'));
  for (const name of names.filter(name => name.split('_')[0] <= baseline)) copyFileSync(path.join(source, name), path.join(supabase, 'migrations', name));
  const container = `supabase_db_${project}`;
  const cli = path.join(repository, 'node_modules/supabase/dist/supabase.js');
  const evidencePath = path.join(workdir, 'REHEARSAL.json');
  const evidence = { head, project, environment: 'disposable local database', baseline, migrationHead: expected,
    migrations: manifest, upgrade: 'NOT_RUN', cleanRebuild: 'NOT_RUN', cloudStaging: 'BLOCKED', production: 'NOT_RUN' };
  const save = () => writeFileSync(evidencePath, JSON.stringify({ ...evidence, observedAt: new Date().toISOString() }, null, 2) + '\n');
  const authorize = () => authorizeRehearsalTarget({ root: repository, workdir,
    marker: JSON.parse(readFileSync(markerPath, 'utf8')), config: readFileSync(configPath, 'utf8'),
    linked: existsSync(path.join(supabase, '.temp/project-ref')),
    inspection: JSON.parse(execFileSync('docker', ['inspect', container], { encoding: 'utf8' }))[0] });
  const sql = query => {
    authorize();
    return execFileSync('docker', ['exec', container, 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-Atc', query], { encoding: 'utf8' }).trim();
  };
  const run = (name, args, started = true) => {
    if (started) authorize();
    const log = path.join(workdir, `${name}.log`);
    try {
      const output = execFileSync(process.execPath, [cli, ...args, '--workdir', workdir, '--yes'],
        { cwd: repository, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
      writeFileSync(log, output);
    } catch (error) {
      writeFileSync(log, String(error.stdout ?? '') + String(error.stderr ?? ''));
      throw new Error(`${name} failed; diagnostic log: ${log}`);
    }
    console.log(`${name}: PASS on newly created isolated database`);
  };
  save();
  try {
    // A random project identity and a newly created workdir cannot select an existing stack.
    run('start-baseline', ['db', 'start'], false);
    run('main-reset', ['db', 'reset', '--local', '--no-seed', '--version', baseline]);
    if (sql('select max(version) from supabase_migrations.schema_migrations') !== baseline) throw new Error('Baseline ledger mismatch');
    const sentinel = '00000000-0000-0000-0000-000000000799';
    sql(`insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values ('${sentinel}', 'rehearsal@local.invalid', '{}', '{}')`);
    for (const name of names) copyFileSync(path.join(source, name), path.join(supabase, 'migrations', name));
    run('candidate-upgrade', ['db', 'push', '--local']);
    if (sql('select max(version) from supabase_migrations.schema_migrations') !== expected ||
        sql(`select count(*) from auth.users where id = '${sentinel}'`) !== '1') throw new Error('Upgrade ledger or existing identity preservation failed');
    evidence.upgrade = 'PASS';
    evidence.existingIdentityPreserved = true;
    save();
    run('candidate-clean-reset', ['db', 'reset', '--local', '--no-seed']);
    if (sql('select max(version) from supabase_migrations.schema_migrations') !== expected ||
        sql('select count(*) from supabase_migrations.schema_migrations') !== String(names.length)) throw new Error('Clean ledger mismatch');
    evidence.cleanRebuild = 'PASS';
    evidence.postgres = sql('select version()');
    evidence.extensions = JSON.parse(sql("select json_agg(json_build_object('name', extname, 'version', extversion)) from pg_extension"));
    evidence.status = 'PASS_LOCAL_MIGRATIONS';
    save();
  } catch (error) {
    evidence.status = 'FAIL';
    evidence.error = error.message;
    save();
    throw error;
  } finally {
    // Keep the isolated volume and private evidence for inspection; do not delete data or touch sibling stacks.
    if (existsSync(path.join(supabase, '.temp'))) {
      run('stop-owned-stack', ['stop']);
      evidence.ownedDatabaseStopped = true;
      save();
    }
  }
  console.log(`Evidence: ${evidencePath}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await rehearse();
}
