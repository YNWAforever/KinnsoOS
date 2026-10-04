import { resolveConfiguredProductState } from './product-state-config'

type Env = Partial<NodeJS.ProcessEnv>

const value = (env: Env, name: string) => env[name]?.trim() || undefined

function missing(feature: string, requirement: string): never {
  throw new Error(
    `R7 env validation failed for ${feature}: missing ${requirement}. ` +
    'Configure it in the deployment environment before enabling this feature.',
  )
}

function oneOf(env: Env, feature: string, names: string[]): string {
  for (const name of names) {
    const found = value(env, name)
    if (found) return found
  }
  return missing(feature, names.join(' or '))
}

export function getSupabasePublicEnv(env: Env = process.env) {
  return {
    url: oneOf(env, 'core web', ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_URL']),
    anonKey: oneOf(env, 'core web', ['NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_ANON_KEY']),
  }
}

export function getStripeSecretKey(env: Env = process.env): string {
  return oneOf(env, 'booking', ['STRIPE_SECRET_KEY'])
}

export function validateBuildEnv(env: Env = process.env): void {
  const { agentLive, bookingLive } = resolveConfiguredProductState(env)

  getSupabasePublicEnv(env)
  if (bookingLive) {
    oneOf(env, 'booking', ['STRIPE_SECRET_KEY'])
    oneOf(env, 'booking', ['STRIPE_WEBHOOK_SECRET'])
    oneOf(env, 'booking', ['NEXT_PUBLIC_SITE_URL'])
  }
  if (agentLive && !value(env, 'AI_GATEWAY_API_KEY') && value(env, 'VERCEL') !== '1') {
    missing('agent', 'AI_GATEWAY_API_KEY or VERCEL=1')
  }
}
