'use client'
import { useRouter, usePathname } from 'next/navigation'
import { LOCALES, isLocale, type Locale } from '@/lib/i18n/config'
import type { Messages } from '@/lib/i18n/messages/en'

const LABELS: Record<Locale, string> = {
  en: 'EN', 'zh-hk': '繁中(HK)', 'zh-tw': '繁中(TW)', 'zh-cn': '简中',
  ja: '日本語', ko: '한국어', th: 'ไทย',
}

/** Swaps the first path segment to the chosen locale, preserving the rest. */
export function LocaleSwitcher({ locale, t }: { locale: Locale; t: Messages['nav'] }) {
  const router = useRouter()
  const pathname = usePathname() || `/${locale}`

  const onChange = (next: string) => {
    if (!isLocale(next) || next === locale) return
    const segs = pathname.split('/')
    // segs[0] === '' (leading slash); segs[1] is the current locale (or a non-locale path)
    if (isLocale(segs[1] ?? '')) segs[1] = next
    else segs.splice(1, 0, next)
    const nextPath = segs.join('/') || `/${next}`
    router.push(`${nextPath}${window.location.search}`)
  }

  return (
    <label className="inline-flex items-center">
      <span className="sr-only">{t.language}</span>
      <select
        aria-label={t.language}
        value={locale}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-[3px] border border-kinnso-edge bg-white px-2.5 py-1.5 text-xs font-semibold text-kinnso-ink outline-none transition focus-visible:border-kinnso-orange focus-visible:ring-2 focus-visible:ring-kinnso-orange focus-visible:ring-offset-1"
      >
        {LOCALES.map((l) => (
          <option key={l} value={l}>{LABELS[l]}</option>
        ))}
      </select>
    </label>
  )
}

export default LocaleSwitcher
