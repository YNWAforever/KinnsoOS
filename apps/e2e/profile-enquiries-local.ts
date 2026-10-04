import { createHmac } from 'node:crypto'

export const PROFILE_ENQUIRIES_LOCAL_OPT_IN = 'E2E_PROFILE_ENQUIRIES_LOCAL'
export const PROFILE_ENQUIRIES_LOCAL_DUMMY_SECRET = 'r7-7-e2e-local-only-dummy-not-a-production-secret'

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])
const SAFE_CONTAINER = /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/

export interface ProfileEnquiriesLocalConfig {
  baseURL: string
  supabaseUrl: string
  anonKey: string
  serviceRoleKey: string
  dbContainer: string
}

export function profileEnquiryRateBucketHash(ip: string) {
  return createHmac('sha256', PROFILE_ENQUIRIES_LOCAL_DUMMY_SECRET)
    .update(`r7.7:enquiry-rate-limit:v1\n${ip}`)
    .digest('hex')
}

function loopbackHttp(value: string, label: string) {
  let url: URL
  try { url = new URL(value) } catch { throw new Error(`${label} must be an http loopback URL`) }
  if (url.protocol !== 'http:' || !LOOPBACK_HOSTS.has(url.hostname.toLowerCase())) {
    throw new Error(`${label} must be an http loopback URL`)
  }
  return url
}

/**
 * Non-throwing variant for use at spec module scope.
 *
 * Playwright evaluates every collected spec module in one pass, so a throw while a spec
 * loads aborts collection for the entire run — the unrelated specs never even get listed.
 * A spec that cannot run in the current environment has to report that as a skip. The
 * throwing variant stays the contract for the dedicated config, which owns the decision
 * to start the local fixture and must refuse to start it against anything else.
 */
export function tryResolveProfileEnquiriesLocalConfig(env: NodeJS.ProcessEnv): ProfileEnquiriesLocalConfig | null {
  try {
    return resolveProfileEnquiriesLocalConfig(env)
  } catch {
    return null
  }
}

export function resolveProfileEnquiriesLocalConfig(env: NodeJS.ProcessEnv): ProfileEnquiriesLocalConfig {
  if (env[PROFILE_ENQUIRIES_LOCAL_OPT_IN] !== '1') {
    throw new Error(`${PROFILE_ENQUIRIES_LOCAL_OPT_IN}=1 is required for profile enquiries Playwright coverage`)
  }
  const baseURL = env.E2E_BASE_URL
  const supabaseUrl = env.SUPABASE_URL
  const anonKey = env.SUPABASE_ANON_KEY
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY
  const dbContainer = env.SUPABASE_DB_CONTAINER
  if (!baseURL || !supabaseUrl || !anonKey || !serviceRoleKey || !dbContainer) throw new Error('Local profile enquiries E2E credentials are incomplete')
  loopbackHttp(baseURL, 'E2E_BASE_URL')
  loopbackHttp(supabaseUrl, 'SUPABASE_URL')
  if (!SAFE_CONTAINER.test(dbContainer)) throw new Error('SUPABASE_DB_CONTAINER is not a safe local container name')
  return { baseURL, supabaseUrl, anonKey, serviceRoleKey, dbContainer }
}