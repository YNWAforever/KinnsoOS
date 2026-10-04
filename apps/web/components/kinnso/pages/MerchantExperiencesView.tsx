'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { SectionShell } from '@/components/kinnso/editorial/SectionShell'
import { Eyebrow } from '@/components/kinnso/editorial/Eyebrow'
import { setExperienceStatusAction } from '@/lib/experiences/actions'
import type { MyExperience } from '@/lib/experiences/queries'
import type { Locale } from '@/lib/i18n/config'
import type { Messages } from '@/lib/i18n/messages/en'

type T = Messages['merchantDashboard']

export function MerchantExperiencesView({ locale, t, experiences }: {
  locale: Locale; t: T; experiences: MyExperience[]
}) {
  const router = useRouter()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [rowError, setRowError] = useState<Record<string, string>>({})
  const p = (path: string) => `/${locale}${path}`

  const statusLabel = (s: MyExperience['status']) =>
    s === 'draft' ? t.statusDraft : s === 'published' ? t.statusPublished : t.statusPaused

  async function setStatus(id: string, status: 'published' | 'paused') {
    setBusyId(id)
    setRowError((m) => ({ ...m, [id]: '' }))
    try {
      const res = await setExperienceStatusAction(id, status, { locale })
      if (res.ok) router.refresh()
      else setRowError((m) => ({ ...m, [id]: res.errors.form?.[0] ?? t.errorGeneric }))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <main className="bg-kinnso-cream font-sans">
      <SectionShell as="header">
        <Eyebrow>{t.title}</Eyebrow>
        <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="k2-display text-3xl font-semibold text-kinnso-ink md:text-4xl">{t.expTitle}</h1>
            <p className="mt-3 max-w-xl leading-relaxed text-kinnso-ink/70">{t.expSubtitle}</p>
          </div>
          <Link href={p('/merchants/dashboard/experiences/new')} className="k2-btn-primary">{t.expNew}</Link>
        </div>
      </SectionShell>
      <SectionShell className="k2-hairline">
        {experiences.length === 0 ? (
          <p className="text-kinnso-muted">{t.expEmpty}</p>
        ) : (
          <div className="grid gap-3">
            {experiences.map((exp) => (
              <div key={exp.id} className="k2-card flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="font-semibold text-kinnso-ink">{exp.title}</p>
                  <p className="mt-1 text-sm text-kinnso-muted">
                    {exp.city} · {exp.currency} {exp.priceAmount.toLocaleString()} · {statusLabel(exp.status)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <Link href={p(`/merchants/dashboard/experiences/${exp.id}/edit`)}
                    className="text-sm font-semibold text-kinnso-orangeDark hover:underline">{t.actEdit}</Link>
                  <Link href={p(`/merchants/dashboard/experiences/${exp.id}/availability`)}
                    className="text-sm font-semibold text-kinnso-orangeDark hover:underline">{t.actAvailability}</Link>
                  {exp.status !== 'published' ? (
                    <button onClick={() => setStatus(exp.id, 'published')} disabled={busyId === exp.id}
                      className="k2-btn-ghost text-sm disabled:opacity-50">{t.actPublish}</button>
                  ) : (
                    <button onClick={() => setStatus(exp.id, 'paused')} disabled={busyId === exp.id}
                      className="k2-btn-ghost text-sm disabled:opacity-50">{t.actPause}</button>
                  )}
                </div>
                {rowError[exp.id] ? <p className="w-full text-sm text-red-600">{rowError[exp.id]}</p> : null}
              </div>
            ))}
          </div>
        )}
      </SectionShell>
    </main>
  )
}

export default MerchantExperiencesView
