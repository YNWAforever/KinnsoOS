import { notFound, permanentRedirect } from 'next/navigation'
import { isLocale } from '@/lib/i18n/config'

// R2B: the merchant app moved under /merchants/dashboard/* (design spec D-R2-5).
export default async function LegacyMerchantMissionDetailPage({ params }: {
  params: Promise<{ locale: string; missionId: string }>
}) {
  const { locale, missionId } = await params
  if (!isLocale(locale)) notFound()
  permanentRedirect(`/${locale}/merchants/dashboard/missions/${missionId}`)
}
