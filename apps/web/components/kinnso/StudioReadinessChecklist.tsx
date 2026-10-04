import type { DirectoryGap } from '@/lib/creators/eligibility'
import Link from 'next/link'
import { Check } from 'lucide-react'
import type { ReactNode } from 'react'
import type { Locale } from '@/lib/i18n/config'
import type { Messages } from '@/lib/i18n/messages/en'
import type { Readiness, ReadinessItem, ReadinessItemId } from '@/lib/studio/readiness'
import { TicketCard } from '@/components/kinnso/MarketPassport'

const PLATFORM_LABEL: Record<string, string> = {
  instagram: 'Instagram',
  youtube: 'YouTube',
  threads: 'Threads',
}

type T = Messages['studioDashboard']

function titleFor(id: ReadinessItemId, t: T): string {
  switch (id) {
    case 'dna-ready': return t.itemDnaReadyTitle
    case 'write-guide': return t.itemWriteGuideTitle
    case 'connect-platforms': return t.itemConnectTitle
    case 'dna-fresh': return t.itemFreshTitle
  }
}

function detailFor(item: ReadinessItem, t: T): string | null {
  if (item.id === 'connect-platforms') {
    const gap = item.detail.platformGap
    if (!gap) return null
    if (gap.missing.length === 0) return t.itemConnectAllDone
    const names = gap.missing.map((p) => PLATFORM_LABEL[p] ?? p).join(', ')
    return t.itemConnectGap
      .replace('{done}', String(gap.connected))
      .replace('{total}', String(gap.total))
      .replace('{missing}', names)
  }
  if (item.id === 'dna-fresh') {
    const f = item.detail.freshness
    if (!f) return null
    return f.days === 0 ? t.itemFreshScannedToday : t.itemFreshScanned.replace('{days}', String(f.days))
  }
  return null
}

/** Default (non-slot) CTA for an item. Returns null when the item is done. */
function DefaultCta({ item, t, p }: { item: ReadinessItem; t: T; p: (s: string) => string }) {
  if (item.done) return null
  switch (item.id) {
    case 'write-guide':
      return <Link href={p('/studio/guides/new')} className="text-sm font-bold text-kinnso-orange">{t.itemWriteGuideCta}</Link>
    case 'connect-platforms':
      return <span className="text-sm font-bold text-kinnso-orange">{t.itemConnectCta}</span>
    case 'dna-fresh':
      return <span className="text-sm font-bold text-kinnso-orange">{t.rescanCta}</span>
    case 'dna-ready':
      return null
  }
}

export function StudioReadinessChecklist({
  locale,
  t,
  readiness,
  directory,
  slots = {},
}: {
  locale: Locale
  t: T
  readiness: Readiness
  directory: { listed: boolean; gaps: DirectoryGap[] }
  slots?: Partial<Record<ReadinessItemId, ReactNode>>
}) {
  const p = (path: string) => `/${locale}${path}`
  const pct = Math.round((readiness.doneCount / readiness.total) * 100)
  const progress = t.checklistProgress
    .replace('{done}', String(readiness.doneCount))
    .replace('{total}', String(readiness.total))

  // data-testid lives on a plain inner div (not TicketCard) so tests can find the
  // checklist regardless of whether TicketCard forwards arbitrary DOM props.
  return (
    <TicketCard className="border-2 border-kinnso-orange p-5">
      <div data-testid="readiness">
      <div className="flex items-center justify-between">
        <h2 id="readiness-heading" className="text-lg font-black text-kinnso-ink">
          {t.checklistTitle} · {progress}
        </h2>
      </div>
      {/* Named from the heading, which already reads "Setup checklist · 2/4", and
          aria-valuetext so it is announced as steps rather than a bare percentage.
          An unnamed progressbar is a serious axe violation. */}
      <div
        className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-kinnso-orange/20"
        role="progressbar"
        aria-labelledby="readiness-heading"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuetext={progress}
      >
        <div className="h-full rounded-full bg-kinnso-orange transition-[width]" style={{ width: `${pct}%` }} />
      </div>

      <ul className="mt-4 space-y-3">
        {readiness.items.map((item) => {
          const detail = detailFor(item, t)
          // dna-ready always links to the report even when done.
          const dnaReadyCta =
            item.id === 'dna-ready' ? (
              <Link href={p('/studio/scan')} className="text-sm font-bold text-kinnso-orange">{t.itemDnaReadyCta}</Link>
            ) : null
          return (
            <li key={item.id} data-testid={`readiness-${item.id}`} data-done={item.done} className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className={`grid h-5 w-5 flex-none place-items-center rounded-full ${item.done ? 'bg-green-100 text-green-700' : 'border-2 border-kinnso-orange/40'}`}>
                  {item.done ? <Check aria-hidden="true" className="h-3.5 w-3.5" /> : null}
                </span>
                <div>
                  <p className="text-sm font-bold text-kinnso-ink">{titleFor(item.id, t)}</p>
                  {detail ? <p className="text-xs text-kinnso-muted">{detail}</p> : null}
                </div>
              </div>
              <div className="flex-none">
                {dnaReadyCta ?? slots[item.id] ?? <DefaultCta item={item} t={t} p={p} />}
              </div>
            </li>
          )
        })}
      </ul>

      {/* The directory rule, stated because the product enforces it silently: a
          creator can finish everything above and still not appear, since listing
          needs a PUBLISHED guide (or an ops override) — and the guide item above
          counts drafts. Shared predicate, so this cannot drift from the rule. */}
      {/* Static explanatory text, not a live region: the page already has one
          role=status for the next step, and competing live regions make a screen
          reader announce both on every update. */}
      <p className="mt-4 border-t border-kinnso-edge pt-3 text-xs text-kinnso-muted">
        {directory.listed
          ? t.directoryListed
          : directory.gaps.includes('no_published_guide')
            ? t.directoryNeedsGuide
            : t.directoryNotListed}
      </p>
      </div>
    </TicketCard>
  )
}

export default StudioReadinessChecklist
