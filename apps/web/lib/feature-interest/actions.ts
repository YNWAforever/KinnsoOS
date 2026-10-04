'use server'

import type { Locale } from '@/lib/i18n/config'
import { isLocale } from '@/lib/i18n/config'
import { createSupabasePublicClient } from '@/lib/supabase/public'

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
const FEATURES = ['agent', 'booking', 'sessions'] as const

export type FeatureInterest = (typeof FEATURES)[number]
export type FeatureInterestResult = { ok: true } | { ok: false; code: 'invalid-email' | 'retry' }

export interface FeatureInterestInput {
  feature: FeatureInterest
  email: string
  locale: Locale
  company?: string
}

function isFeatureInterest(value: unknown): value is FeatureInterest {
  return typeof value === 'string' && (FEATURES as readonly string[]).includes(value)
}

export async function joinFeatureInterestAction(input: FeatureInterestInput): Promise<FeatureInterestResult> {
  if (typeof input?.company === 'string' && input.company.trim()) return { ok: true }

  if (!isFeatureInterest(input?.feature) || !isLocale(input?.locale)) {
    return { ok: false, code: 'retry' }
  }

  const email = typeof input?.email === 'string' ? input.email.trim().toLowerCase() : ''
  if (!EMAIL_RE.test(email) || email.length > 254) {
    return { ok: false, code: 'invalid-email' }
  }

  try {
    const { error } = await createSupabasePublicClient().rpc('join_feature_interest', {
      p_feature: input.feature,
      p_email: email,
      p_locale: input.locale,
    })

    if (error) {
      console.warn('feature-interest-rpc-failed')
      return { ok: false, code: 'retry' }
    }
  } catch {
    console.warn('feature-interest-rpc-failed')
    return { ok: false, code: 'retry' }
  }

  return { ok: true }
}
