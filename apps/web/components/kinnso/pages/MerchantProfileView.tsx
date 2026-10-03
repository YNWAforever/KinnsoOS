'use client'
import { useState } from 'react'
import Link from 'next/link'
import { SectionShell } from '@/components/kinnso/editorial/SectionShell'
import { Eyebrow } from '@/components/kinnso/editorial/Eyebrow'
import { updateMerchantProfileAction } from '@/lib/merchants/profile-actions'
import type { MyMerchantProfile } from '@/lib/merchants/profile-queries'
import type { Locale } from '@/lib/i18n/config'
import type { Messages } from '@/lib/i18n/messages/en'

type T = Messages['merchantDashboard']

const err = (t: T, code?: string) =>
  code === 'required' ? t.errRequired
  : code === 'too_long' ? t.errTooLong
  : code === 'invalid_url' ? t.errInvalidUrl
  : code ? t.errorGeneric : ''

export function MerchantProfileView({ locale, t, profile }: { locale: Locale; t: T; profile: MyMerchantProfile }) {
  const [form, setForm] = useState({
    companyName: profile.companyName,
    contactName: profile.contactName ?? '',
    contactEmail: profile.contactEmail,
    websiteUrl: profile.websiteUrl ?? '',
    tagline: profile.tagline ?? '',
    city: profile.city ?? '',
    logoUrl: profile.logoUrl ?? '',
  })
  const [pending, setPending] = useState(false)
  const [saved, setSaved] = useState(false)
  const [errors, setErrors] = useState<Record<string, string[]>>({})

  const field = (key: keyof typeof form, label: string) => (
    <label key={key} className="flex flex-col gap-1">
      <span className="text-sm font-medium text-kinnso-ink">{label}</span>
      <input value={form[key]} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
        className="min-h-[44px] rounded-[3px] border border-kinnso-edge bg-white px-3 py-2 text-sm" />
      {errors[key] ? <span className="text-sm text-red-600">{err(t, errors[key][0])}</span> : null}
    </label>
  )

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setPending(true)
    setSaved(false)
    setErrors({})
    try {
      const res = await updateMerchantProfileAction(locale, form)
      if (res.ok) setSaved(true)
      else setErrors(res.errors)
    } finally {
      setPending(false)
    }
  }

  return (
    <main className="bg-kinnso-cream font-sans">
      <SectionShell as="header">
        <Eyebrow>{t.title}</Eyebrow>
        <h1 className="k2-display mt-4 text-3xl font-semibold text-kinnso-ink md:text-4xl">{t.profileTitle}</h1>
        <p className="mt-4 max-w-xl leading-relaxed text-kinnso-ink/70">{t.profileSubtitle}</p>
        {profile.slug ? (
          <p className="mt-4 text-sm text-kinnso-muted">
            {t.slugLabel}: <span className="font-mono text-kinnso-ink">/m/{profile.slug}</span> — {t.slugNote}
          </p>
        ) : null}
        <form onSubmit={onSubmit} className="mt-8 flex max-w-lg flex-col gap-4">
          {field('companyName', t.fieldCompanyName)}
          {field('tagline', t.fieldTagline)}
          {field('city', t.fieldCity)}
          {field('logoUrl', t.fieldLogoUrl)}
          {field('websiteUrl', t.fieldWebsite)}
          {field('contactName', t.fieldContactName)}
          {field('contactEmail', t.fieldContactEmail)}
          {errors.form ? <p role="alert" className="text-sm text-red-600">{t.errorGeneric}</p> : null}
          <div className="flex items-center gap-4">
            <button type="submit" disabled={pending} className="k2-btn-primary disabled:opacity-60">{t.saveCta}</button>
            <p aria-live="polite" className="text-sm text-kinnso-green">{saved ? t.savedNote : ''}</p>
          </div>
        </form>
        <Link href={`/${locale}/merchants/dashboard`} className="mt-8 inline-block text-sm font-semibold text-kinnso-orangeDark hover:underline">← {t.title}</Link>
      </SectionShell>
    </main>
  )
}

export default MerchantProfileView
