import Link from 'next/link'
import { Eyebrow } from '@/components/kinnso/editorial/Eyebrow'
import { SectionShell } from '@/components/kinnso/editorial/SectionShell'
import type { Locale } from '@/lib/i18n/config'
import type { Messages } from '@/lib/i18n/messages/en'

/** Section 8 — merchant value prop: three honest benefit bullets on paper. */
export function MerchantValue({ locale, t }: { locale: Locale; t: Messages['home'] }) {
  const bullets = [t.merchantBullet1, t.merchantBullet2, t.merchantBullet3]
  return (
    <SectionShell className="k2-hairline">
      <div className="grid gap-10 lg:grid-cols-2">
        <div>
          <Eyebrow>{t.merchantEyebrow}</Eyebrow>
          <h2 className="k2-display mt-3 max-w-md text-3xl font-semibold text-kinnso-ink md:text-4xl">
            {t.merchantHeading}
          </h2>
        </div>
        <div>
          <ul className="space-y-4">
            {bullets.map((b) => (
              <li key={b} className="flex gap-3 leading-relaxed text-kinnso-ink/80">
                <span aria-hidden="true" className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-kinnso-orange" />
                {b}
              </li>
            ))}
          </ul>
          <Link href={`/${locale}/for-merchants`} className="k2-btn-ghost mt-8">{t.merchantCta}</Link>
        </div>
      </div>
    </SectionShell>
  )
}
