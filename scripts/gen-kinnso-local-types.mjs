import process from 'node:process';
import console from 'node:console';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import path from 'node:path';

export function resolveGenerationTarget(env, root) {
  const isolated = env.KINNSO_TEST_PROJECT === 'kinnsoos-b1-20261002' &&
    env.SUPABASE_URL === 'http://127.0.0.1:58421' &&
    env.SUPABASE_DB_CONTAINER === 'supabase_db_kinnsoos-b1-20261002';
  const ci = env.CI === 'true' && env.KINNSO_TEST_PROJECT === 'kinnso-v3' &&
    env.SUPABASE_URL === 'http://127.0.0.1:54421' && env.SUPABASE_DB_CONTAINER;
  if (env.KINNSO_TEST_TARGET !== 'local' || !(isolated || ci) ||
      (isolated && !env.KINNSO_LOCAL_STACK_DIR)) {
    throw new Error('BLOCKED: explicit approved local schema generation target is required');
  }
  return { project: env.KINNSO_TEST_PROJECT, container: env.SUPABASE_DB_CONTAINER,
    url: env.SUPABASE_URL, workdir: isolated ? env.KINNSO_LOCAL_STACK_DIR : root };
}

export function addNullableDefaults(output, definitions) {
  const nullable = new Map(definitions.map(def => [def.name,
    Array.from(def.args.matchAll(/\b(p_\w+)\s+[^,]*DEFAULT NULL\b/g), match => match[1])]));
  const amend = (name, body) => {
    for (const arg of nullable.get(name) ?? []) {
      body = body.replace(new RegExp('(\\b' + arg + '\\??:\\s*)(string(?:\\[\\])?|number|boolean|Json)(?!\\s*\\| null)', 'g'), '$1$2 | null');
    }
    return body;
  };
  return output.replace(/^( {6}(\w+): \{\n)([\s\S]*?)(^ {6}\})/gm,
    (_whole, start, name, body, end) => start + amend(name, body) + end)
    .replace(/^ {6}(\w+): (\{[^\n]+\})$/gm,
      (_whole, name, body) => '      ' + name + ': ' + amend(name, body));
}

export function generate(env = process.env) {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const target = resolveGenerationTarget(env, root);
  const config = readFileSync(path.join(target.workdir, 'supabase/config.toml'), 'utf8');
  if (!new RegExp('^project_id\\s*=\\s*"' + target.project + '"', 'm').test(config)) {
    throw new Error('BLOCKED: local stack directory identity mismatch');
  }
  const inspect = JSON.parse(execFileSync('docker', ['inspect', target.container], { encoding: 'utf8' }))[0];
  if (inspect.Config.Labels['com.supabase.cli.project'] !== target.project) {
    throw new Error('BLOCKED: container identity mismatch');
  }
  const cli = fileURLToPath(new URL('../node_modules/supabase/dist/supabase.js', import.meta.url));
  const output = execFileSync(process.execPath, [cli, 'gen', 'types', 'typescript', '--local', '--workdir', target.workdir],
    { cwd: root, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
  if (!output.includes('export type Database =')) throw new Error('Invalid type generation result');
  const definitions = JSON.parse(execFileSync('docker', ['exec', target.container, 'psql', '-U', 'postgres', '-d', 'postgres', '-Atc',
    "select coalesce(json_agg(json_build_object('name',proname,'args',pg_get_function_arguments(oid))),'[]'::json) from pg_proc where pronamespace='public'::regnamespace and pg_get_function_arguments(oid) like '%DEFAULT NULL%'"], { encoding: 'utf8' }));
  writeFileSync(new URL('../packages/db/types.ts', import.meta.url), addNullableDefaults(output, definitions).trimEnd() + '\n');
  console.log('Database types generated from the verified local migration head (ignored build input).');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) generate();
