import type { Messages } from '@/lib/i18n/messages/en'

type T = Messages['creators']

const STATUS_STYLE: Record<string, string> = {
  onboarding: 'bg-amber-100 text-amber-800',
  active: 'bg-emerald-100 text-emerald-800',
  suspended: 'bg-orange-100 text-orange-800',
  banned: 'bg-red-100 text-red-800',
}

const STATUS_LABEL = (t: T): Record<string, string> => ({
  onboarding: t.statusOnboarding,
  active: t.statusActive,
  suspended: t.statusSuspended,
  banned: t.statusBanned,
})

const TIER_LABEL = (t: T): Record<string, string> => ({
  seed: t.tierSeed,
  rising: t.tierRising,
  pro: t.tierPro,
  elite: t.tierElite,
})

const pill = 'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold'

export function StatusBadge({ status, t }: { status: string; t: T }) {
  return (
    <span className={`${pill} ${STATUS_STYLE[status] ?? 'bg-kinnso-cream2 text-kinnso-muted'}`}>
      {STATUS_LABEL(t)[status] ?? status}
    </span>
  )
}

export function TierBadge({ tier, t }: { tier: string; t: T }) {
  return (
    <span className={`${pill} bg-kinnso-cream2 text-kinnso-ink`}>
      {TIER_LABEL(t)[tier] ?? tier}
    </span>
  )
}

export function VerifiedBadge({ verified, t }: { verified: boolean; t: T }) {
  if (!verified) return null
  return (
    <span className={`${pill} bg-blue-100 text-blue-800`}>
      <span aria-hidden="true">✓ </span>
      {t.verified}
    </span>
  )
}
