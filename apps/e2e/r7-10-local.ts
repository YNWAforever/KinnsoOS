const LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1'])

export type R710BookingState = 'off' | 'on'

export interface R710LocalConfig {
  bookingState: R710BookingState
  baseURL: string
  bookingLive: 'true' | 'false'
  supabaseUrl: string
  anonKey: string
  stripeSecretKey?: string
  stripeWebhookSecret?: string
}

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]
  if (!value) throw new Error(`${name} is required for R7.10 local E2E`)
  return value
}

function requireLoopback(value: string, name: string) {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error(`${name} must be loopback`)
  }
  const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase()
  if (!LOOPBACK.has(hostname)) throw new Error(`${name} must be loopback`)
  return value
}

export function resolveR710LocalConfig(env: NodeJS.ProcessEnv): R710LocalConfig {
  if (env.R7_10_LOCAL !== '1') throw new Error('R7_10_LOCAL=1 is required for R7.10 local E2E')

  const bookingState = env.R7_10_BOOKING_STATE ?? 'off'
  if (bookingState !== 'off' && bookingState !== 'on') {
    throw new Error('R7_10_BOOKING_STATE must be off or on')
  }

  const baseURL = requireLoopback(required(env, 'E2E_BASE_URL'), 'E2E_BASE_URL')
  const supabaseUrl = requireLoopback(
    required(env, 'NEXT_PUBLIC_SUPABASE_URL'),
    'NEXT_PUBLIC_SUPABASE_URL',
  )
  const anonKey = required(env, 'NEXT_PUBLIC_SUPABASE_ANON_KEY')
  const bookingLive = bookingState === 'on' ? 'true' : 'false'

  if (bookingState === 'off') return { bookingState, bookingLive, baseURL, supabaseUrl, anonKey }

  const stripeSecretKey = env.STRIPE_SECRET_KEY
  if (!stripeSecretKey) throw new Error('STRIPE_SECRET_KEY is required for Booking ON')
  if (!stripeSecretKey.startsWith('sk_test_')) {
    throw new Error('STRIPE_SECRET_KEY must start with sk_test_')
  }
  const stripeWebhookSecret = env.STRIPE_WEBHOOK_SECRET
  if (!stripeWebhookSecret) throw new Error('STRIPE_WEBHOOK_SECRET is required for Booking ON')

  return { bookingState, bookingLive, baseURL, supabaseUrl, anonKey, stripeSecretKey, stripeWebhookSecret }
}
