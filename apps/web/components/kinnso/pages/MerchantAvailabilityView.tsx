'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { SectionShell } from '@/components/kinnso/editorial/SectionShell'
import { Eyebrow } from '@/components/kinnso/editorial/Eyebrow'
import { addAvailabilityDateAction, closeAvailabilityDateAction } from '@/lib/experiences/availability-actions'
import type { ExperienceAvailability } from '@/lib/experiences/availability-queries'
import type { Locale } from '@/lib/i18n/config'
import type { Messages } from '@/lib/i18n/messages/en'

type T = Messages['merchantDashboard']

const err = (t: T, code?: string) =>
  code === 'invalid_date' ? t.errInvalidDate
  : code === 'invalid_number' ? t.errInvalidNumber
  : code ? t.errorGeneric : ''

export function MerchantAvailabilityView({ locale, t, experienceId, experienceTitle, availability }: {
  locale: Locale; t: T; experienceId: string; experienceTitle: string; availability: ExperienceAvailability[]
}) {
  const router = useRouter()
  const [date, setDate] = useState('')
  const [capacity, setCapacity] = useState('')
  const [formError, setFormError] = useState('')
  const [busy, setBusy] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [rowError, setRowError] = useState<Record<string, string>>({})
  const p = (path: string) => `/${locale}${path}`
  const fieldClass = 'min-h-[44px] rounded-[3px] border border-kinnso-edge bg-white px-3 py-2 text-sm'

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setFormError('')
    try {
      const res = await addAvailabilityDateAction(experienceId, { date, capacity }, { locale })
      if (res.ok) {
        setDate('')
        setCapacity('')
        router.refresh()
      } else {
        setFormError(res.errors.form?.[0] ?? (err(t, res.errors.date?.[0]) || err(t, res.errors.capacity?.[0]) || t.errorGeneric))
      }
    } finally {
      setBusy(false)
    }
  }

  async function handleClose(id: string) {
    setBusyId(id)
    setRowError((m) => ({ ...m, [id]: '' }))
    try {
      const res = await closeAvailabilityDateAction(experienceId, id, { locale })
      if (res.ok) router.refresh()
      else setRowError((m) => ({ ...m, [id]: res.errors.form?.[0] ?? t.errorGeneric }))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <main className="bg-kinnso-cream font-sans">
      <SectionShell as="header">
        <Eyebrow>{experienceTitle}</Eyebrow>
        <h1 className="k2-display mt-4 text-3xl font-semibold text-kinnso-ink md:text-4xl">{t.availTitle}</h1>
        <p className="mt-3 max-w-xl leading-relaxed text-kinnso-ink/70">{t.availSubtitle}</p>
        <Link href={p('/merchants/dashboard/experiences')} className="mt-4 inline-block text-sm font-semibold text-kinnso-orangeDark hover:underline">
          {t.availBackToExperience}
        </Link>
      </SectionShell>
      <SectionShell className="k2-hairline">
        <h2 className="text-lg font-semibold text-kinnso-ink">{t.availAddHeading}</h2>
        <form onSubmit={handleAdd} className="mt-4 flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm">
            {t.fieldDate}
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={fieldClass} required />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {t.fieldCapacity}
            <input type="number" min={1} value={capacity} onChange={(e) => setCapacity(e.target.value)} className={`${fieldClass} w-28`} required />
          </label>
          <button type="submit" disabled={busy} className="k2-btn-primary disabled:opacity-50">{t.addDateCta}</button>
          {formError ? <p className="w-full text-sm text-red-600">{formError}</p> : null}
        </form>
      </SectionShell>
      <SectionShell className="k2-hairline">
        {availability.length === 0 ? (
          <p className="text-kinnso-muted">{t.availEmpty}</p>
        ) : (
          <div className="grid gap-3">
            {availability.map((a) => (
              <div key={a.id} className="k2-card flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="font-semibold text-kinnso-ink">{a.date}</p>
                  <p className="mt-1 text-sm text-kinnso-muted">
                    {t.colBooked}: {a.bookedCount}/{a.capacity} · {a.status === 'open' ? t.statusOpen : t.statusClosed}
                  </p>
                </div>
                {a.status === 'open' ? (
                  <button onClick={() => handleClose(a.id)} disabled={busyId === a.id}
                    className="k2-btn-ghost text-sm disabled:opacity-50">{t.actClose}</button>
                ) : null}
                {rowError[a.id] ? <p className="w-full text-sm text-red-600">{rowError[a.id]}</p> : null}
              </div>
            ))}
          </div>
        )}
      </SectionShell>
    </main>
  )
}

export default MerchantAvailabilityView
