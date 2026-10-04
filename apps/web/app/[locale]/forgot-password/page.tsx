import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { isLocale, type Locale } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { noindexMetadata } from '@/lib/seo/metadata'
import { ForgotPasswordForm } from './ForgotPasswordForm'

export const metadata: Metadata = noindexMetadata()

export default async function ForgotPasswordPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const dict = await getDictionary(locale as Locale)

  return (
    <main className="bg-kinnso-cream font-sans flex min-h-screen flex-col items-center justify-center p-6">
      <div className="k-auth-card k2-card w-full max-w-sm p-8">
        <h1 className="k2-display text-2xl font-semibold text-kinnso-ink">{dict.auth.resetPasswordTitle}</h1>
        <p className="mt-2 text-sm text-kinnso-muted">{dict.auth.resetPasswordRequestDesc}</p>

        <div className="mt-6">
          <ForgotPasswordForm
            locale={locale as Locale}
            labels={{ email: dict.auth.email, submit: dict.auth.resetPasswordSubmit }}
            errorGeneric={dict.auth.errorGeneric}
            emailSentDesc={dict.auth.resetPasswordEmailSentDesc}
          />
        </div>

        <p className="mt-4 text-sm text-kinnso-muted">
          <Link href={`/${locale}/sign-in`} className="underline text-kinnso-ink">
            {dict.auth.backToSignIn}
          </Link>
        </p>
      </div>
    </main>
  )
}
