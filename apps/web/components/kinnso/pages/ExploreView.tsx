import { Eyebrow } from '@/components/kinnso/editorial/Eyebrow'
import { SectionShell } from '@/components/kinnso/editorial/SectionShell'
import { ExploreDiscovery } from '@/components/kinnso/explore/ExploreDiscovery'
import type { Destination } from '@/lib/destinations/queries'
import type { Guide } from '@/lib/guides/types'
import type { Locale } from '@/lib/i18n/config'
import type { Messages } from '@/lib/i18n/messages/en'

export function ExploreView({ locale, t, guides, destinations }: {
  locale: Locale
  t: Messages['explore']
  guides: Guide[]
  destinations: Destination[]
}) {
  return (
    <div className="bg-kinnso-cream font-sans">
      <SectionShell>
        <Eyebrow>{t.pill}</Eyebrow>
        <h1 className="k2-display mt-4 max-w-3xl text-4xl font-semibold leading-[1.08] text-kinnso-ink md:text-6xl">
          {t.heading}
        </h1>
        <p className="mt-4 max-w-2xl text-lg leading-relaxed text-kinnso-ink/70">{t.subtitle}</p>
        <ExploreDiscovery locale={locale} t={t} guides={guides} destinations={destinations} />
      </SectionShell>
    </div>
  )
}

export default ExploreView
