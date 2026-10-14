import { pathToFileURL } from 'node:url';
// Explicit local projects only; CI keeps its original volume, pilot uses a new one.
export const approvedLocalProjects = Object.freeze(['kinnsoos-b1-20261002','kinnsoos-pilot-20261013']);
export function verifyTestTarget(env = process.env) {
  if (env.KINNSO_TEST_TARGET !== 'local' || !approvedLocalProjects.includes(env.KINNSO_TEST_PROJECT) ||
    env.KINNSO_TEST_API_ORIGIN !== 'http://127.0.0.1:58421' ||
    env.KINNSO_TEST_DB_CONTAINER !== 'supabase_db_' + env.KINNSO_TEST_PROJECT ||
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
