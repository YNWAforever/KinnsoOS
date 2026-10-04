import { describe, expect, it } from 'vitest'
import { toStripeAmount } from '@/lib/stripe/client'

describe('toStripeAmount', () => {
  it('multiplies by 100 for standard (non-zero-decimal) currencies', () => {
    expect(toStripeAmount(1250, 'HKD')).toBe(125000)
    expect(toStripeAmount(19.99, 'USD')).toBe(1999)
  })
  it('does not multiply zero-decimal currencies (JPY, KRW)', () => {
    expect(toStripeAmount(5000, 'JPY')).toBe(5000)
    expect(toStripeAmount(30000, 'KRW')).toBe(30000)
  })
  it('is case-insensitive on the currency code', () => {
    expect(toStripeAmount(5000, 'jpy')).toBe(5000)
    expect(toStripeAmount(10, 'usd')).toBe(1000)
  })
  it('rounds fractional cent amounts rather than truncating', () => {
    expect(toStripeAmount(19.995, 'USD')).toBe(2000)
  })
})
