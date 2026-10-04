import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { isLocale, type Locale } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { noindexMetadata } from '@/lib/seo/metadata'
import { ResetPasswordForm } from './ResetPasswordForm'

export const metadata: Metadata = noindexMetadata()

export default async function ResetPasswordPage({
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
        <h1 className="k2-display text-2xl font-semibold text-kinnso-ink">{dict.auth.newPasswordTitle}</h1>

        <div className="mt-6">
          <ResetPasswordForm
            locale={locale as Locale}
            labels={{
              newPassword: dict.auth.newPasswordLabel,
              confirmPassword: dict.auth.confirmPasswordLabel,
              submit: dict.auth.newPasswordSubmit,
            }}
            errorGeneric={dict.auth.errorGeneric}
            errorPasswordMismatch={dict.auth.errorPasswordMismatch}
            errorPasswordTooShort={dict.auth.errorPasswordTooShort}
            linkInvalidTitle={dict.auth.resetLinkInvalidTitle}
            linkInvalidDesc={dict.auth.resetLinkInvalidDesc}
            forgotPasswordHref={`/${locale}/forgot-password`}
            forgotPasswordLinkLabel={dict.auth.forgotPassword}
          />
        </div>
      </div>
    </main>
  )
}
