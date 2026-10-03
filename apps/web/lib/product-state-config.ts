export type ProductState = {
  agentLive: boolean
  bookingLive: boolean
  sessionsLive: boolean
}

type Env = Partial<NodeJS.ProcessEnv>

function resolveFlag(env: Env, name: 'AGENT_LIVE' | 'BOOKING_LIVE', fallback: boolean): boolean {
  const configured = env[name]
  if (configured === undefined) return fallback

  const normalized = configured.trim().toLowerCase()
  if (normalized === 'true') return true
  if (normalized === 'false') return false

  throw new Error(`${name} must be true or false`)
}

export function resolveConfiguredProductState(
  env: Env = process.env,
): Pick<ProductState, 'agentLive' | 'bookingLive'> {
  return {
    agentLive: resolveFlag(env, 'AGENT_LIVE', true),
    bookingLive: resolveFlag(env, 'BOOKING_LIVE', false),
  }
}
