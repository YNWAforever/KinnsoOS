import Stripe from 'stripe'
import { getStripeSecretKey } from '@/lib/env'

let client: Stripe | null = null

/**
 * Lazily-constructed Stripe SDK singleton. `apiVersion` is intentionally left
 * unset — this uses the installed SDK version's own bundled default rather
 * than a hand-typed date string that would silently drift stale. If a future
 * `stripe` package major version makes `apiVersion` a required config field,
 * use that package's own exported `Stripe.LATEST_API_VERSION` constant, never
 * a guessed date string.
 */
export function getStripeClient(): Stripe {
  if (!client) {
    const secretKey = getStripeSecretKey()
    client = new Stripe(secretKey)
  }
  return client
}

// Stripe's documented zero-decimal currencies, restricted to this codebase's
// supported booking currencies (HKD/USD/SGD/JPY/KRW/THB/TWD/CNY) — only JPY
// and KRW qualify. https://stripe.com/docs/currencies#zero-decimal
const ZERO_DECIMAL_CURRENCIES = new Set(['JPY', 'KRW'])

/**
 * Converts a decimal currency amount (e.g. 1250.00 HKD, as stored in
 * `bookings.unit_amount`/`total_amount`) to the integer unit Stripe's API
 * expects: cents for most currencies, the amount as-is for zero-decimal ones.
 */
export function toStripeAmount(amount: number, currency: string): number {
  const upper = currency.toUpperCase()
  if (ZERO_DECIMAL_CURRENCIES.has(upper)) return Math.round(amount)
  return Math.round(amount * 100)
}
