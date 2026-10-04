export interface R73LocalLiveConfig {
  url: string
  anonKey: string
  serviceRoleKey: string
  dbContainer: string
}

type Env = Record<string, string | undefined>

const localHostnames = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])
const safeContainerName = /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/

export function resolveR73LocalLiveConfig(env: Env): R73LocalLiveConfig | null {
  if (env.RUN_R7_3_LOCAL_LIVE_TESTS !== '1') return null

  const rawUrl = env.SUPABASE_URL
  const anonKey = env.SUPABASE_ANON_KEY
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY
  const dbContainer = env.SUPABASE_DB_CONTAINER
  if (!rawUrl || !anonKey || !serviceRoleKey || !dbContainer) return null
  if (!safeContainerName.test(dbContainer)) return null

  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    return null
  }

  if (url.protocol !== 'http:' || !localHostnames.has(url.hostname.toLowerCase())) return null

  return { url: rawUrl, anonKey, serviceRoleKey, dbContainer }
}
