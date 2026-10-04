import { notFound, redirect } from 'next/navigation'
import { isLocale } from '@/lib/i18n/config'

/**
 * Legacy route (R10.2): the settlement write path that used to live here — a direct
 * mission_settlements .update() with no audit trail — is gone. This page exists only so an
 * old bookmark or link still lands somewhere useful: the audited batch flow at
 * /admin/creators/payouts, which requireOpsPage there gates on its own.
 */
export default async function OpsSettlementsPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  redirect(`/${locale}/admin/creators/payouts`)
}
