import { notFound, redirect } from 'next/navigation'
import { resolveViewerRole } from '@/lib/auth/viewer-role'
import { isLocale } from '@/lib/i18n/config'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export default async function MerchantPostEntryPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()

  const supabase = await createSupabaseServerClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error && error.name !== 'AuthSessionMissingError') throw error
  if (!user) redirect(`/${locale}/merchants/apply`)

  const role = await resolveViewerRole(supabase, user.id)
  if (role === 'merchant') {
    redirect(`/${locale}/merchants/dashboard/post`)
  }

  redirect(`/${locale}/merchants/apply`)
}
