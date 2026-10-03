import Link from 'next/link'
import { SectionShell } from '@/components/kinnso/editorial/SectionShell'
import { Eyebrow } from '@/components/kinnso/editorial/Eyebrow'
import { EntityMedia } from '@/components/kinnso/media/EntityMedia'
import type { PublicMerchant } from '@/lib/merchants/public-queries'
import type { Locale } from '@/lib/i18n/config'
import type { Messages } from '@/lib/i18n/messages/en'

export function MerchantsDirectoryView({ locale, t, merchants }: {
  locale: Locale; t: Messages['merchantsDirectory']; merchants: PublicMerchant[]
}) {
  const p = (path: string) => `/${locale}${path}`
  return (
    <div className="bg-kinnso-cream font-sans">
      <SectionShell as="header">
        <Eyebrow>{t.heading}</Eyebrow>
        <h1 className="k2-display mt-4 text-3xl font-semibold text-kinnso-ink md:text-5xl">{t.heading}</h1>
        <p className="mt-4 max-w-2xl leading-relaxed text-kinnso-ink/70">{t.subtitle}</p>
      </SectionShell>

      <SectionShell className="k2-hairline">
        {merchants.length === 0 ? (
          <p className="text-kinnso-muted">{t.empty}</p>
        ) : (
          <div className="grid gap-5 md:grid-cols-3">
            {merchants.map((m) => (
              <Link key={m.id} href={p(`/m/${m.slug}`)} className="k2-card block p-5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kinnso-orange">
                <EntityMedia src={m.logoUrl} title={m.companyName} location={m.city} sizes="48px" className="mb-4 h-12 w-12 rounded-full [&_[data-media-placeholder=true]>span]:hidden [&_[data-media-placeholder=true]]:p-0" />
                <h2 className="k2-display text-xl font-semibold text-kinnso-ink">{m.companyName}</h2>
                {m.tagline ? <p className="mt-2 text-sm text-kinnso-ink/70">{m.tagline}</p> : null}
                {m.city ? <p className="mt-1 text-xs text-kinnso-muted">{m.city}</p> : null}
                <span className="mt-4 block text-sm font-semibold text-kinnso-orangeDark">{t.viewProfile} →</span>
              </Link>
            ))}
          </div>
        )}
      </SectionShell>

      <SectionShell className="k2-hairline">
        <p className="text-kinnso-ink/70">{t.newHereNote}</p>
        <Link href={p('/for-merchants')} className="mt-4 inline-block font-semibold text-kinnso-orangeDark hover:underline">{t.newHereCta}</Link>
      </SectionShell>
    </div>
  )
}

export default MerchantsDirectoryView
