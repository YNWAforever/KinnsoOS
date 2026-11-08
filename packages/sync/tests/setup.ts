import { config } from 'dotenv'
// Only the explicit integration/reader configs load this file. Never default tests.
if (process.env.KINNSO_RUN_WORKER_DB_TESTS !== '1') throw new Error('BLOCKED: explicit worker integration entrypoint required')
config({ path: '.env.test', quiet: true })
