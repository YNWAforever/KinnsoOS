'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { SectionShell } from '@/components/kinnso/editorial/SectionShell'
import { Eyebrow } from '@/components/kinnso/editorial/Eyebrow'
import { createExperienceAction, updateExperienceAction } from '@/lib/experiences/actions'
import { EXPERIENCE_CURRENCIES, type ExperienceInput } from '@/lib/experiences/types'
import type { MyExperienceDetail } from '@/lib/experiences/queries'
import type { Locale } from '@/lib/i18n/config'
import type { Messages } from '@/lib/i18n/messages/en'

type T = Messages['merchantDashboard']

const err = (t: T, code?: string) =>
  code === 'required' ? t.errRequired
  : code === 'too_long' ? t.errTooLong
  : code === 'invalid_url' ? t.errInvalidUrl
  : code === 'invalid_number' || code === 'invalid' ? t.errInvalidNumber
  : code ? t.errorGeneric : ''

export function ExperienceForm({ locale, t, existing }: {
  locale: Locale; t: T; existing: MyExperienceDetail | null
}) {
  const router = useRouter()
  const [form, setForm] = useState<ExperienceInput>({
    title: existing?.title ?? '',
    summary: existing?.summary ?? '',
    description: existing?.description ?? '',
    city: existing?.city ?? '',
    priceAmount: existing ? String(existing.priceAmount) : '',
    currency: existing?.currency ?? 'HKD',
    durationMinutes: existing?.durationMinutes ? String(existing.durationMinutes) : '',
    coverUrl: existing?.coverUrl ?? '',
  })
  const [pending, setPending] = useState(false)
  const [errors, setErrors] = useState<Record<string, string[]>>({})
  const listHref = `/${locale}/merchants/dashboard/experiences`

  const set = (key: keyof ExperienceInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }))

  async function submit(publish: boolean) {
    setPending(true)
    setErrors({})
    try {
      const res = existing
        ? await updateExperienceAction(existing.id, form, { publish, locale })
        : await createExperienceAction(form, { publish, locale })
      if (res.ok) router.push(listHref)
      else setErrors(res.errors)
    } finally {
      setPending(false)
    }
  }

  const fieldClass = 'min-h-[44px] rounded-[3px] border border-kinnso-edge bg-white px-3 py-2 text-sm'
  const fieldError = (key: string) =>
    errors[key] ? <span className="text-sm text-red-600">{err(t, errors[key][0])}</span> : null

  return (
    <main className="bg-kinnso-cream font-sans">
      <SectionShell as="header">
        <Eyebrow>{t.expTitle}</Eyebrow>
        <h1 className="k2-display mt-4 text-3xl font-semibold text-kinnso-ink md:text-4xl">
          {existing ? t.formTitleEdit : t.formTitleNew}
        </h1>
        <form onSubmit={(e) => { e.preventDefault(); void submit(false) }} className="mt-8 flex max-w-lg flex-col gap-4">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-kinnso-ink">{t.fieldTitle}</span>
            <input required value={form.title} onChange={set('title')} className={fieldClass} />
            {fieldError('title')}
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-kinnso-ink">{t.fieldSummary}</span>
            <input value={form.summary} onChange={set('summary')} className={fieldClass} />
            {fieldError('summary')}
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-kinnso-ink">{t.fieldDescription}</span>
            <textarea value={form.description} onChange={set('description')} rows={5}
              className="rounded-[3px] border border-kinnso-edge bg-white px-3 py-2 text-sm" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-kinnso-ink">{t.fieldExpCity}</span>
            <input required value={form.city} onChange={set('city')} className={fieldClass} />
            {fieldError('city')}
          </label>
          <div className="grid grid-cols-2 gap-4">
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-kinnso-ink">{t.fieldPrice}</span>
              <input required inputMode="decimal" value={form.priceAmount} onChange={set('priceAmount')} className={fieldClass} />
              {fieldError('priceAmount')}
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-kinnso-ink">{t.fieldCurrency}</span>
              <select value={form.currency} onChange={set('currency')} className={fieldClass}>
                {EXPERIENCE_CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              {fieldError('currency')}
            </label>
          </div>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-kinnso-ink">{t.fieldDuration}</span>
            <input inputMode="numeric" value={form.durationMinutes} onChange={set('durationMinutes')} className={fieldClass} />
            {fieldError('durationMinutes')}
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-kinnso-ink">{t.fieldCoverUrl}</span>
            <input value={form.coverUrl} onChange={set('coverUrl')} className={fieldClass} />
            {fieldError('coverUrl')}
          </label>
          {errors.form ? <p role="alert" className="text-sm text-red-600">{t.errorGeneric}</p> : null}
          <div className="flex flex-wrap items-center gap-4">
            <button type="submit" disabled={pending} className="k2-btn-ghost disabled:opacity-50">{t.saveDraftCta}</button>
            <button type="button" disabled={pending} onClick={() => void submit(true)} className="k2-btn-primary disabled:opacity-60">{t.publishCta}</button>
          </div>
        </form>
        <Link href={listHref} className="mt-8 inline-block text-sm font-semibold text-kinnso-orangeDark hover:underline">← {t.backToList}</Link>
      </SectionShell>
    </main>
  )
}

export default ExperienceForm
