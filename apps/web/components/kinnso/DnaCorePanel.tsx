import type { Dna } from '@kinnso/scan'
import type { Messages } from '@/lib/i18n/messages/en'

const PLATFORM_LABEL: Record<string, string> = {
  instagram: 'Instagram',
  youtube: 'YouTube',
  threads: 'Threads',
}

function ChipRow({ label, items }: { label: string; items: string[] }) {
  if (!items || items.length === 0) return null
  return (
    <div className="mt-4">
      <div className="text-xs font-bold uppercase tracking-wider text-kinnso-muted">{label}</div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {items.map((it) => (
          <span key={it} className="k-chip">{it}</span>
        ))}
      </div>
    </div>
  )
}

/** Pure render of a real `Dna`. Reusable on /c/[handle] in a later slice. */
export function DnaCorePanel({ dna, t }: { dna: Dna; t: Messages['studio'] }) {
  const geos = dna.audience.top_geos ?? []
  const locales = dna.audience.top_locales ?? []
  return (
    <section className="k-card p-5">
      <h3 className="text-base font-bold text-kinnso-ink">{t.dnaCoreHeading}</h3>

      {dna.bio ? (
        <div className="mt-3">
          <div className="text-xs font-bold uppercase tracking-wider text-kinnso-muted">{t.dnaBio}</div>
          <p className="mt-1 text-sm text-kinnso-ink">{dna.bio}</p>
        </div>
      ) : null}

      <ChipRow label={t.dnaNiches} items={dna.niches} />
      <ChipRow label={t.dnaPillars} items={dna.content_pillars} />
      <ChipRow label={t.dnaTone} items={dna.tone} />
      <ChipRow label={t.dnaAudienceGeos} items={geos} />
      <ChipRow label={t.dnaLocales} items={locales} />
      <ChipRow label={t.dnaLanguages} items={dna.languages} />

      {dna.platforms.length > 0 ? (
        <div className="mt-4">
          <div className="text-xs font-bold uppercase tracking-wider text-kinnso-muted">{t.dnaPlatforms}</div>
          <ul className="mt-2 space-y-1.5">
            {dna.platforms.map((p) => (
              <li key={p.platform} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-kinnso-ink">
                <span className="font-semibold">{PLATFORM_LABEL[p.platform] ?? p.platform}</span>
                {typeof p.followers === 'number' ? (
                  <span className="text-kinnso-muted">· {p.followers.toLocaleString()}</span>
                ) : null}
                {typeof p.avg_engagement === 'number' ? (
                  <span className="text-kinnso-muted">· {(p.avg_engagement * 100).toFixed(1)}%</span>
                ) : null}
                {p.post_cadence ? <span className="text-kinnso-muted">· {p.post_cadence}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  )
}

export default DnaCorePanel
