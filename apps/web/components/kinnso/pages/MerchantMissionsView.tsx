import Link from 'next/link'
import { MissionStatusBadge } from '@/components/kinnso/MissionStatusBadge'
import type { Locale } from '@/lib/i18n/config'
import type { Messages } from '@/lib/i18n/messages/en'

export type MerchantMissionRow = {
  id: string
  title: string
  status: string
  participantCount: number
  pendingCount: number
  settlementStatus: string | null
}

type MerchantMissionsViewProps = {
  locale: Locale
  t: Messages['missions']
  missions: MerchantMissionRow[]
}

export function MerchantMissionsView({ locale, t, missions }: MerchantMissionsViewProps) {
  return (
    <main className="k-container py-10">
      <h1 className="text-3xl font-black text-kinnso-ink">{t.missionQueue}</h1>
      <div className="mt-6 overflow-hidden rounded-2xl border border-kinnso-cream2 bg-white shadow-kinnso">
        <div className="grid grid-cols-1 gap-3 border-b border-kinnso-cream2 px-4 py-3 text-xs font-bold uppercase text-kinnso-muted sm:grid-cols-[1fr_120px]">
          <span>{t.title}</span>
          <span>Status</span>
        </div>
        {missions.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <h2 className="text-lg font-black text-kinnso-ink">{t.missionsEmptyTitle}</h2>
            <p className="mt-1 text-sm text-kinnso-muted">{t.missionsEmptyBody}</p>
            <Link href={`/${locale}/merchants/dashboard/post`} className="k-btn-primary mt-5 inline-flex">
              {t.postMissionCta}
            </Link>
          </div>
        ) : (
          missions.map((mission) => (
            <Link
              key={mission.id}
              href={`/${locale}/merchants/dashboard/missions/${mission.id}`}
              className="grid grid-cols-1 gap-3 border-b border-kinnso-cream2 px-4 py-4 transition last:border-b-0 hover:bg-kinnso-cream2 sm:grid-cols-[1fr_120px] sm:items-center"
            >
              <div>
                <h2 className="font-bold text-kinnso-ink">{mission.title}</h2>
                <p className="mt-1 text-sm text-kinnso-muted">
                  {t.participants}: {mission.participantCount} / {t.pendingApplications}: {mission.pendingCount} / {t.settlement}: {mission.settlementStatus ?? '-'}
                </p>
              </div>
              <MissionStatusBadge status={mission.status} />
            </Link>
          ))
        )}
      </div>
    </main>
  )
}
