'use client'

import Link from 'next/link'
import { useRef, useState } from 'react'
import type { Messages } from '@/lib/i18n/messages/en'
import type { GuideInput } from '@/lib/guides/types'
import { validateGuideInput } from '@/lib/guides/validation'
import { TicketCard } from '@/components/kinnso/MarketPassport'

type SubmitResult = void | { ok: true } | { ok: false; errors?: Record<string, string[]> }

interface Props {
  t: Messages['studioGuides']
  mode: 'new' | 'edit'
  initial?: GuideInput
  backHref?: string
  onSubmit: (input: GuideInput, opts: { publish: boolean }) => SubmitResult | Promise<SubmitResult>
}

const FIELD_ORDER = ['title', 'summary', 'city', 'coverUrl'] as const
type Field = (typeof FIELD_ORDER)[number]

const REQUIRED_ERROR_KEY: Record<Field, keyof Messages['studioGuides']> = {
  title: 'errorTitleRequired',
  summary: 'errorSummaryRequired',
  city: 'errorCityRequired',
  coverUrl: 'errorCoverRequired',
}

export function GuideForm({ t, mode, initial, backHref, onSubmit }: Props) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [city, setCity] = useState(initial?.city ?? '')
  const [coverUrl, setCoverUrl] = useState(initial?.coverUrl ?? '')
  const [summary, setSummary] = useState(initial?.summary ?? '')
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<Field, string>>>({})
  const [formError, setFormError] = useState('')
  const [pending, setPending] = useState<null | 'draft' | 'publish'>(null)
  const pendingRef = useRef(false)

  const messageForField = (field: Field, codes: string[]): string => {
    if (field === 'coverUrl' && codes.includes('invalid_url')) return t.errorCoverInvalid
    return t[REQUIRED_ERROR_KEY[field]]
  }

  const collectFieldErrors = (errors: Record<string, string[]>): Partial<Record<Field, string>> => {
    const next: Partial<Record<Field, string>> = {}
    for (const field of FIELD_ORDER) {
      const codes = errors[field]
      if (codes?.length) next[field] = messageForField(field, codes)
    }
    return next
  }

  const submit = async (publish: boolean) => {
    if (pendingRef.current) return
    const input: GuideInput = { title, city, coverUrl, summary }
    const validation = validateGuideInput(input)
    if (!validation.ok) {
      setFieldErrors(collectFieldErrors(validation.errors))
      setFormError('')
      return
    }
    setFieldErrors({})
    setFormError('')
    pendingRef.current = true
    setPending(publish ? 'publish' : 'draft')
    try {
      const result = await onSubmit(input, { publish })
      if (result && result.ok === false) {
        const collected = result.errors ? collectFieldErrors(result.errors) : {}
        if (Object.keys(collected).length > 0) setFieldErrors(collected)
        else setFormError(t.errorGeneric)
      }
    } catch {
      setFormError(t.errorGeneric)
    } finally {
      pendingRef.current = false
      setPending(null)
    }
  }

  const requiredMark = <span aria-hidden="true" className="text-kinnso-red"> *</span>

  return (
    <main>
      <section className="k-container max-w-2xl py-12">
        {backHref && (
          <Link
            href={backHref}
            className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-kinnso-muted transition hover:text-kinnso-ink"
          >
            ← {t.backToGuides}
          </Link>
        )}
        <h1 className="text-3xl font-black tracking-tight text-kinnso-ink md:text-4xl">
          {mode === 'new' ? t.formNewHeading : t.formEditHeading}
        </h1>

        <TicketCard className="mt-8 grid gap-5 p-6">
          <label htmlFor="guide-title" className="grid gap-1.5">
            <span className="text-sm font-bold text-kinnso-ink">{t.titleLabel}{requiredMark}</span>
            <input
              id="guide-title"
              className="k-input"
              aria-required="true"
              aria-invalid={!!fieldErrors.title}
              value={title}
              placeholder={t.titlePlaceholder}
              onChange={(e) => setTitle(e.target.value)}
            />
            {fieldErrors.title && (
              <p className="text-xs font-semibold text-kinnso-red" role="alert">
                {fieldErrors.title}
              </p>
            )}
          </label>

          <label htmlFor="guide-city" className="grid gap-1.5">
            <span className="text-sm font-bold text-kinnso-ink">{t.cityLabel}{requiredMark}</span>
            <input
              id="guide-city"
              className="k-input"
              aria-required="true"
              aria-invalid={!!fieldErrors.city}
              value={city}
              placeholder={t.cityPlaceholder}
              onChange={(e) => setCity(e.target.value)}
            />
            {fieldErrors.city && (
              <p className="text-xs font-semibold text-kinnso-red" role="alert">
                {fieldErrors.city}
              </p>
            )}
          </label>

          <label htmlFor="guide-cover" className="grid gap-1.5">
            <span className="text-sm font-bold text-kinnso-ink">{t.coverLabel}{requiredMark}</span>
            <input
              id="guide-cover"
              className="k-input"
              type="url"
              inputMode="url"
              autoComplete="url"
              aria-required="true"
              aria-invalid={!!fieldErrors.coverUrl}
              value={coverUrl}
              placeholder={t.coverPlaceholder}
              onChange={(e) => setCoverUrl(e.target.value)}
            />
            {fieldErrors.coverUrl && (
              <p className="text-xs font-semibold text-kinnso-red" role="alert">
                {fieldErrors.coverUrl}
              </p>
            )}
          </label>
          {coverUrl.trim() !== '' && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={coverUrl} alt={title || t.coverLabel} className="aspect-[4/3] w-full rounded-lg object-cover" />
          )}

          <label htmlFor="guide-summary" className="grid gap-1.5">
            <span className="text-sm font-bold text-kinnso-ink">{t.summaryLabel}{requiredMark}</span>
            <textarea
              id="guide-summary"
              className="k-input min-h-[120px]"
              aria-required="true"
              aria-invalid={!!fieldErrors.summary}
              value={summary}
              placeholder={t.summaryPlaceholder}
              onChange={(e) => setSummary(e.target.value)}
            />
            {fieldErrors.summary && (
              <p className="text-xs font-semibold text-kinnso-red" role="alert">
                {fieldErrors.summary}
              </p>
            )}
          </label>

          {formError && (
            <p className="text-sm font-semibold text-kinnso-red" role="alert">
              {formError}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="k-btn-ghost min-h-[44px] cursor-pointer disabled:opacity-50"
              disabled={pending !== null}
              onClick={() => void submit(false)}
            >
              {pending === 'draft' ? t.saving : t.saveDraft}
            </button>
            <button
              type="button"
              className="k-btn-primary min-h-[44px] cursor-pointer disabled:opacity-50"
              disabled={pending !== null}
              onClick={() => void submit(true)}
            >
              {pending === 'publish' ? t.saving : t.publish}
            </button>
          </div>
        </TicketCard>
      </section>
    </main>
  )
}

export default GuideForm
