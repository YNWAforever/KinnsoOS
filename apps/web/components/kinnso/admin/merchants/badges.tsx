import type { Messages } from '@/lib/i18n/messages/en'

type T = Messages['merchantsOps']

const STATUS_STYLE: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-800',
  paused: 'bg-amber-100 text-amber-800',
  suspended: 'bg-orange-100 text-orange-800',
  archived: 'bg-slate-100 text-slate-600',
}

const STATUS_LABEL = (t: T): Record<string, string> => ({
  active: t.statusActive,
  paused: t.statusPaused,
  suspended: t.statusSuspended,
  archived: t.statusArchived,
})

const TIER_LABEL = (t: T): Record<string, string> => ({
  free: t.tierFree,
  growth: t.tierGrowth,
})

const pill = 'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold'

export function MerchantStatusBadge({ status, t }: { status: string; t: T }) {
  return (
    <span className={`${pill} ${STATUS_STYLE[status] ?? 'bg-kinnso-cream2 text-kinnso-muted'}`}>
      {STATUS_LABEL(t)[status] ?? status}
    </span>
  )
}

export function MerchantTierBadge({ tier, t }: { tier: string; t: T }) {
  return (
    <span className={`${pill} bg-kinnso-cream2 text-kinnso-ink`}>
      {TIER_LABEL(t)[tier] ?? tier}
    </span>
  )
}
