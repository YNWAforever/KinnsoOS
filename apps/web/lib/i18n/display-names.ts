import type { Locale } from '@/lib/i18n/config'

export function displayName(locale: Locale, type: 'language' | 'region', code: string): string | null {
  try {
    const value = new Intl.DisplayNames([locale], { type }).of(code)
    if (!value || value.toLowerCase() === code.toLowerCase()) return null
    return type === 'language' ? value.replace('Hong Kong SAR China', 'Hong Kong') : value
  } catch {
    return null
  }
}
