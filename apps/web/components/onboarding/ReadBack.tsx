'use client'

import type { Dna } from '@kinnso/scan'
import type { Messages } from '@/lib/i18n/messages/en'

type DnaDict = Messages['dna']

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs font-medium text-kinnso-ink/50">{label}</span>
      <span className="text-sm">{value}</span>
    </div>
  )
}

export function ReadBack({
  dna,
  t,
  dashboardHref,
  signOutHref,
  signOutLabel,
}: {
  dna: Dna
  t: DnaDict
  dashboardHref: string
  signOutHref: string
  signOutLabel: string
}) {
  return (
    <section className="w-full max-w-lg space-y-4">
      <h2 className="text-xl font-semibold">{t.readBackHeading}</h2>
      <p className="text-sm text-kinnso-ink/70">{t.readBackIntro}</p>

      <div className="space-y-3">
        <Row label={t.bio} value={dna.bio} />
        <Row label={t.niches} value={dna.niches.join(', ')} />
        <Row label={t.contentPillars} value={dna.content_pillars.join(', ')} />
        <Row label={t.tone} value={dna.tone.join(', ')} />
        <Row label={t.topGeos} value={(dna.audience.top_geos ?? []).join(', ')} />
        <Row label={t.topLocales} value={(dna.audience.top_locales ?? []).join(', ')} />
        <Row label={t.languages} value={dna.languages.join(', ')} />
        <Row
          label={t.platforms}
          value={dna.platforms.map((p) => `${p.platform} (${t.unverified})`).join(', ')}
        />
      </div>

      <div className="flex flex-wrap items-center gap-4 pt-1">
        <a
          href={dashboardHref}
          className="inline-flex items-center justify-center rounded-md bg-kinnso-ink px-4 py-2 text-sm font-medium text-white hover:bg-kinnso-ink/90"
        >
          {t.enterStudio}
        </a>
        <a href={signOutHref} className="text-sm underline text-kinnso-ink/70 hover:text-kinnso-ink">
          {signOutLabel}
        </a>
      </div>
    </section>
  )
}
