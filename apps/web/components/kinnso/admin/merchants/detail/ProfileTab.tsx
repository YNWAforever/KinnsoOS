import type { Messages } from '@/lib/i18n/messages/en'
import type { MerchantDetailProfile } from '@/lib/admin/merchants-queries'
import { MerchantStatusBadge, MerchantTierBadge } from '@/components/kinnso/admin/merchants/badges'

type T = Messages['merchantsOps']
const day = (s: string | null) => (s ? s.slice(0, 10) : '—')
// Merchant-supplied URL: only link http(s); anything else (javascript:, data:, …) renders as inert text.
const isHttpUrl = (u: string) => /^https?:\/\//i.test(u)

export function ProfileTab({ t, profile }: { t: T; profile: MerchantDetailProfile }) {
  const hasContact = profile.contactName || profile.contactEmail
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <section className="rounded-xl border border-kinnso-edge p-4">
        <p className="mb-2 text-sm font-bold text-kinnso-ink">{t.secContact}</p>
        {hasContact ? (
          <dl className="text-sm text-kinnso-muted">
            {profile.contactName ? <div className="flex justify-between gap-2"><dt>{t.contactName}</dt><dd className="text-kinnso-ink">{profile.contactName}</dd></div> : null}
            {profile.contactEmail ? <div className="flex justify-between gap-2"><dt>{t.contactEmail}</dt><dd className="min-w-0 truncate text-right text-kinnso-ink">{profile.contactEmail}</dd></div> : null}
          </dl>
        ) : <p className="text-sm text-kinnso-muted">{t.noContact}</p>}
      </section>
      <section className="rounded-xl border border-kinnso-edge p-4">
        <p className="mb-2 text-sm font-bold text-kinnso-ink">{t.secWebsite}</p>
        {profile.websiteUrl
          ? (isHttpUrl(profile.websiteUrl)
              ? <a href={profile.websiteUrl} target="_blank" rel="noreferrer" className="text-sm text-kinnso-orange hover:underline">{profile.websiteUrl}</a>
              : <p className="text-sm text-kinnso-ink break-all">{profile.websiteUrl}</p>)
          : <p className="text-sm text-kinnso-muted">—</p>}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <MerchantStatusBadge status={profile.status} t={t} />
          <MerchantTierBadge tier={profile.tier} t={t} />
        </div>
        <p className="mt-3 text-sm text-kinnso-muted">{t.detailJoined} {day(profile.createdAt)} · {t.detailUpdated} {day(profile.updatedAt)}</p>
      </section>
    </div>
  )
}

export default ProfileTab
