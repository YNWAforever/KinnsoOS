'use client'
import { useState } from 'react'
import Link from 'next/link'
import { SectionShell } from '@/components/kinnso/editorial/SectionShell'
import { Eyebrow } from '@/components/kinnso/editorial/Eyebrow'
import { submitMerchantApplicationAction } from '@/lib/merchants/application-actions'
import type { MyMerchantApplication } from '@/lib/merchants/application-queries'
import type { Locale } from '@/lib/i18n/config'
import type { Messages } from '@/lib/i18n/messages/en'

type T = Messages['merchantApply']

export interface MerchantApplyViewProps {
  locale: Locale
  t: T
  application: MyMerchantApplication | null
}

const emptyForm = { companyName: '', contactName: '', contactEmail: '', websiteUrl: '', pitch: '' }

export function MerchantApplyView({ locale, t, application }: MerchantApplyViewProps) {
  const [form, setForm] = useState(emptyForm)
  const [hp, setHp] = useState('')
  const [pending, setPending] = useState(false)
  const [errors, setErrors] = useState<Record<string, string[]>>({})
  const [submittedId, setSubmittedId] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setPending(true)
    setErrors({})
    try {
      const res = await submitMerchantApplicationAction(form, hp)
      if (res.ok) setSubmittedId(res.id)
      else setErrors(res.errors)
    } finally {
      setPending(false)
    }
  }

  if (application?.status === 'pending' || submittedId) {
    return (
      <main className="bg-kinnso-cream font-sans">
        <SectionShell as="header">
          <Eyebrow>{t.title}</Eyebrow>
          <h1 className="k2-display mt-4 text-3xl font-semibold text-kinnso-ink md:text-4xl">{t.pendingTitle}</h1>
          <p className="mt-4 max-w-xl leading-relaxed text-kinnso-ink/70">{t.pendingBody}</p>
        </SectionShell>
      </main>
    )
  }

  if (application?.status === 'rejected') {
    return (
      <main className="bg-kinnso-cream font-sans">
        <SectionShell as="header">
          <Eyebrow>{t.title}</Eyebrow>
          <h1 className="k2-display mt-4 text-3xl font-semibold text-kinnso-ink md:text-4xl">{t.rejectedTitle}</h1>
          <p className="mt-4 max-w-xl leading-relaxed text-kinnso-ink/70">{t.rejectedBody}</p>
          {application.decisionReason ? (
            <p className="mt-2 max-w-xl text-sm text-kinnso-ink/60">{t.decisionReasonLabel}: {application.decisionReason}</p>
          ) : null}
          <button
            type="button"
            onClick={() => { setSubmittedId(null); setForm(emptyForm) }}
            className="k2-btn-primary mt-6"
          >
            {t.reapplyCta}
          </button>
        </SectionShell>
      </main>
    )
  }

  return (
    <main className="bg-kinnso-cream font-sans">
      <SectionShell as="header">
        <Eyebrow>{t.title}</Eyebrow>
        <h1 className="k2-display mt-4 text-3xl font-semibold text-kinnso-ink md:text-4xl">{t.title}</h1>
        <p className="mt-4 max-w-xl leading-relaxed text-kinnso-ink/70">{t.subtitle}</p>

        <form onSubmit={onSubmit} className="mt-8 flex max-w-lg flex-col gap-4">
          <input type="text" name="website" value={hp} onChange={(e) => setHp(e.target.value)}
            tabIndex={-1} autoComplete="off" aria-hidden="true"
            className="absolute -left-[9999px] h-0 w-0 opacity-0" />

          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-kinnso-ink">{t.formCompanyName}</span>
            <input required value={form.companyName} onChange={(e) => setForm((f) => ({ ...f, companyName: e.target.value }))}
              className="min-h-[44px] rounded-[3px] border border-kinnso-edge bg-white px-3 py-2 text-sm" />
            {errors.companyName ? <span className="text-sm text-red-600">{errors.companyName[0]}</span> : null}
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-kinnso-ink">{t.formContactName}</span>
            <input value={form.contactName} onChange={(e) => setForm((f) => ({ ...f, contactName: e.target.value }))}
              className="min-h-[44px] rounded-[3px] border border-kinnso-edge bg-white px-3 py-2 text-sm" />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-kinnso-ink">{t.formContactEmail}</span>
            <input required type="email" value={form.contactEmail} onChange={(e) => setForm((f) => ({ ...f, contactEmail: e.target.value }))}
              className="min-h-[44px] rounded-[3px] border border-kinnso-edge bg-white px-3 py-2 text-sm" />
            {errors.contactEmail ? <span className="text-sm text-red-600">{errors.contactEmail[0]}</span> : null}
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-kinnso-ink">{t.formWebsite}</span>
            <input value={form.websiteUrl} onChange={(e) => setForm((f) => ({ ...f, websiteUrl: e.target.value }))}
              className="min-h-[44px] rounded-[3px] border border-kinnso-edge bg-white px-3 py-2 text-sm" />
            {errors.websiteUrl ? <span className="text-sm text-red-600">{errors.websiteUrl[0]}</span> : null}
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-kinnso-ink">{t.formPitch}</span>
            <textarea value={form.pitch} onChange={(e) => setForm((f) => ({ ...f, pitch: e.target.value }))}
              placeholder={t.formPitchPlaceholder} rows={4}
              className="rounded-[3px] border border-kinnso-edge bg-white px-3 py-2 text-sm" />
          </label>

          {errors.form ? <p role="alert" className="text-sm text-red-600">{errors.form[0]}</p> : null}

          <button type="submit" disabled={pending} className="k2-btn-primary self-start disabled:opacity-60">
            {t.submitCta}
          </button>
        </form>
      </SectionShell>
    </main>
  )
}

export function MerchantApplySignedOutView({ locale, t }: { locale: Locale; t: T }) {
  const p = (path: string) => `/${locale}${path}`
  return (
    <main className="bg-kinnso-cream font-sans">
      <SectionShell as="header">
        <Eyebrow>{t.title}</Eyebrow>
        <h1 className="k2-display mt-4 text-3xl font-semibold text-kinnso-ink md:text-4xl">{t.signedOutTitle}</h1>
        <p className="mt-4 max-w-xl leading-relaxed text-kinnso-ink/70">{t.signedOutBody}</p>
        <div className="mt-6 flex gap-4">
          <Link href={p('/sign-in')} className="k2-btn-primary">{t.signInCta}</Link>
          <Link href={p('/sign-up')} className="k2-btn-ghost">{t.signUpCta}</Link>
        </div>
      </SectionShell>
    </main>
  )
}

export function MerchantApplyAlreadyMerchantView({ locale, t }: { locale: Locale; t: T }) {
  const p = (path: string) => `/${locale}${path}`
  return (
    <main className="bg-kinnso-cream font-sans">
      <SectionShell as="header">
        <Eyebrow>{t.title}</Eyebrow>
        <h1 className="k2-display mt-4 text-3xl font-semibold text-kinnso-ink md:text-4xl">{t.alreadyMerchantTitle}</h1>
        <p className="mt-4 max-w-xl leading-relaxed text-kinnso-ink/70">{t.alreadyMerchantBody}</p>
        <Link href={p('/merchants/dashboard')} className="k2-btn-primary mt-6 inline-flex">{t.alreadyMerchantCta}</Link>
      </SectionShell>
    </main>
  )
}

export default MerchantApplyView
