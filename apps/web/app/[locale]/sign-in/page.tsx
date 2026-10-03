import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { isLocale, type Locale } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { noindexMetadata } from '@/lib/seo/metadata'
import { safeNext } from '@/lib/auth/safe-next'
import { SignInForm } from './SignInForm'

export const metadata: Metadata = noindexMetadata()

export default async function SignInPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>
  searchParams: Promise<{ error?: string; next?: string }>
}) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const { error, next } = await searchParams
  const dict = await getDictionary(locale as Locale)

  // Map the attacker-controllable ?error= param through a whitelist of known
  // codes to a localized string. Anything unrecognized renders no banner —
  // never reflect the raw query value into the alert (text-injection/phishing).
  // The auth callback route emits ?error=callback on exchange failure.
  const serverError = error === 'callback' ? dict.auth.errorGeneric : undefined

  // `next` is attacker-controllable, so it is validated as an in-app path for
  // this locale or dropped entirely — never reflected into a redirect as given.
  const nextPath = safeNext(next, locale) ?? undefined

  // If already signed in, honour `next` (an invitee who is already authenticated
  // still needs to reach the invite) and otherwise route through the role-aware
  // hub (/studio sends merchant/ops/creator to the right place).
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (user) redirect(nextPath ?? `/${locale}/studio`)

  return (
    <main className="bg-kinnso-cream font-sans flex min-h-screen flex-col items-center justify-center p-6">
      <div className="k-auth-card k2-card w-full max-w-sm p-8">
        <h1 className="k2-display text-2xl font-semibold text-kinnso-ink">{dict.auth.signIn}</h1>

        <div className="mt-6">
          <SignInForm
            locale={locale as Locale}
            labels={{
              email: dict.auth.email,
              password: dict.auth.password,
              submit: dict.auth.signIn,
            }}
            errorInvalidCredentials={dict.auth.errorInvalidCredentials}
            errorGeneric={dict.auth.errorGeneric}
            serverError={serverError}
            nextPath={nextPath}
          />
        </div>

        <p className="mt-4 text-sm text-kinnso-muted">
          <Link href={`/${locale}/forgot-password`} className="underline text-kinnso-ink">
            {dict.auth.forgotPassword}
          </Link>
        </p>

        <p className="mt-2 text-sm text-kinnso-muted">
          {dict.auth.noAccount}{' '}
          <Link href={`/${locale}/sign-up`} className="underline text-kinnso-ink">
            {dict.auth.signUp}
          </Link>
        </p>
      </div>
    </main>
  )
}
