import {execFileSync} from 'node:child_process'
export function assertNonProductionTarget(env: Record<string, string | undefined>) {
  const isolated=env.KINNSO_TEST_PROJECT==='kinnsoos-b1-20261002'&&env.SUPABASE_URL==='http://127.0.0.1:58421'&&env.SUPABASE_DB_CONTAINER==='supabase_db_kinnsoos-b1-20261002'
  const ci=env.CI==='true'&&env.KINNSO_TEST_PROJECT==='kinnso-v3'&&env.SUPABASE_URL==='http://127.0.0.1:54421'
  if (env.KINNSO_TEST_TARGET !== 'local' || !env.SUPABASE_DB_CONTAINER || !(isolated||ci)) {
    throw new Error('BLOCKED: expected the verified isolated KinnsoOS local target');
  }
  const container=JSON.parse(execFileSync('docker',['inspect',env.SUPABASE_DB_CONTAINER],{encoding:'utf8'}))[0]
  if(container.Config.Labels['com.supabase.cli.project']!==env.KINNSO_TEST_PROJECT)throw new Error('BLOCKED: local container project mismatch')
}
