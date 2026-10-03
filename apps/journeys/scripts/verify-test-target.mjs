import { pathToFileURL } from 'node:url';
export function verifyTestTarget(env = process.env) {
  if (env.KINNSO_TEST_TARGET !== 'local' || env.KINNSO_TEST_PROJECT !== 'kinnsoos-b1-20261002' ||
    env.KINNSO_TEST_API_ORIGIN !== 'http://127.0.0.1:58421' ||
    env.KINNSO_TEST_DB_CONTAINER !== 'supabase_db_kinnsoos-b1-20261002' ||
    env.SUPABASE_URL !== env.KINNSO_TEST_API_ORIGIN ||
    (env.KINNSO_SUPABASE_URL && env.KINNSO_SUPABASE_URL !== env.KINNSO_TEST_API_ORIGIN)) {
    throw new Error('BLOCKED: integration target is missing or is not the approved isolated local project');
  }
  return { environment: 'local', projectRef: env.KINNSO_TEST_PROJECT,
    apiOrigin: env.KINNSO_TEST_API_ORIGIN, dbContainer: env.KINNSO_TEST_DB_CONTAINER };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  verifyTestTarget();
  console.log('Isolated local test target verified');
}
