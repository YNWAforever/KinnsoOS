import Link from 'next/link'
import type { Locale } from '@/lib/i18n/config'
import type { Messages } from '@/lib/i18n/messages/en'

/**
 * Section 9 — creator recruitment. R1C: the original-brand orange band replaces
 * the retired moss band. All text is FULL-OPACITY ink (5.6:1 — D-R1C-2: ink/80
 * on orange fails AA for small text); the button/dots are ink fills.
 * CTA → /for-creators (master spec §4.1 §9).
 */
export function CreatorCta({ locale, t }: { locale: Locale; t: Messages['home'] }) {
  const bullets = [t.creatorBullet1, t.creatorBullet2, t.creatorBullet3]
  return (
    <section className="bg-kinnso-orange py-16 md:py-24">
      <div className="k2-container">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white">{t.creatorEyebrow}</p>
        <h2 className="k2-display mt-4 max-w-2xl text-3xl font-semibold text-white md:text-4xl">{t.creatorHeading}</h2>
        <ul className="mt-6 max-w-2xl space-y-3">
          {bullets.map((b) => (
            <li key={b} className="flex gap-3 leading-relaxed text-white/90">
              <span aria-hidden="true" className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-white" />
              {b}
            </li>
          ))}
        </ul>
        <Link
          href={`/${locale}/for-creators`}
          className="mt-8 inline-flex min-h-[44px] items-center justify-center gap-2 rounded-[3px] bg-kinnso-ink px-6 py-2.5 text-sm font-semibold tracking-wide text-white transition hover:bg-black focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          {t.creatorCta}
        </Link>
      </div>
    </section>
  )
}
