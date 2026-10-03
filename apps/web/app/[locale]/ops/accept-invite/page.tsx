import { redirect } from 'next/navigation'
import { isLocale, type Locale, LOCALES } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }))
}

const ERROR_KEYS: Record<string, string> = {
  invite_expired:          'acceptExpired',
  invite_accepted:         'acceptExpired',
  invite_revoked:          'acceptExpired',
  email_mismatch:          'acceptEmailMismatch',
  not_found:               'acceptNotFound',
}

export default async function AcceptInvitePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>
  searchParams: Promise<{ token?: string }>
}) {
  const [{ locale }, { token }] = await Promise.all([params, searchParams])
  const loc: Locale = isLocale(locale) ? locale : 'en'
  const messages = await getDictionary(loc)
  const t = messages.team

  if (!token) {
    return (
      <div className="k-container py-16 text-center">
        <h1 className="text-xl font-bold">{t.acceptTitle}</h1>
        <p className="mt-2 text-kinnso-muted">{t.acceptNotFound}</p>
      </div>
    )
  }

  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    const next = encodeURIComponent(`/${loc}/ops/accept-invite?token=${token}`)
    redirect(`/${loc}/sign-in?next=${next}`)
  }

  const { error } = await supabase.rpc('admin_accept_ops_invite', { p_token: token })

  if (error) {
    const msgKey = Object.keys(ERROR_KEYS).find((k) => error.message.includes(k))
    const tKey = msgKey ? ERROR_KEYS[msgKey] : 'acceptNotFound'
    return (
      <div className="k-container py-16 text-center">
        <h1 className="text-xl font-bold">{t.acceptTitle}</h1>
        <p className="mt-2 text-kinnso-muted">{t[tKey as keyof typeof t] as string}</p>
      </div>
    )
  }

  return (
    <div className="k-container py-16 text-center">
      <h1 className="text-xl font-bold">{t.acceptTitle}</h1>
      <p className="mt-2 text-kinnso-muted">{t.acceptSuccess}</p>
      <a href={`/${loc}/admin`} className="mt-4 inline-block text-sm font-semibold text-kinnso-orange hover:underline">
        Go to admin →
      </a>
    </div>
  )
}
