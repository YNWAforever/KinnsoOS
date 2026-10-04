'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Messages } from '@/lib/i18n/messages/en'
import type { Locale } from '@/lib/i18n/config'
import type { AdminMerchantApplication } from '@/lib/admin/merchant-applications-queries'
import type { ActionResult } from '@/lib/admin/result'
import { TicketCard } from '@/components/kinnso/MarketPassport'
import { MerchantsTabs } from '@/components/kinnso/admin/merchants/MerchantsTabs'

type T = Messages['merchantApplicationsOps']
type Pending = { id: string; kind: 'approve' | 'reject' } | null

export interface MerchantApplicationsViewProps {
  t: T
  tabsT: Messages['merchantsOps']
  locale: Locale
  pending: AdminMerchantApplication[]
  decided: AdminMerchantApplication[]
  onApprove: (locale: Locale, id: string, reason: string) => Promise<ActionResult<{ id: string; merchantProfileId: string }>>
  onReject: (locale: Locale, id: string, reason: string) => Promise<ActionResult<{ id: string }>>
}

export function MerchantApplicationsView({ t, tabsT, locale, pending, decided, onApprove, onReject }: MerchantApplicationsViewProps) {
  const router = useRouter()
  const [action, setAction] = useState<Pending>(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [rowError, setRowError] = useState<Record<string, string>>({})

  function start(id: string, kind: 'approve' | 'reject') {
    setAction({ id, kind })
    setReason('')
    setRowError((m) => ({ ...m, [id]: '' }))
  }

  async function confirm() {
    if (!action) return
    setBusy(true)
    const res = action.kind === 'approve'
      ? await onApprove(locale, action.id, reason)
      : await onReject(locale, action.id, reason)
    setBusy(false)
    if (res.ok) {
      setAction(null)
      router.refresh()
    } else {
      setRowError((m) => ({ ...m, [action.id]: res.errors.form?.[0] ?? t.actionFailed }))
    }
  }

  const statusLabel = (s: AdminMerchantApplication['status']) =>
    s === 'pending' ? t.statusPending : s === 'approved' ? t.statusApproved : t.statusRejected

  return (
    <main>
      <MerchantsTabs t={tabsT} locale={locale} />

      <h2 className="k-display mt-4">{t.pendingHeading}</h2>
      {pending.length === 0 ? (
        <p className="mt-4 text-kinnso-muted">{t.pendingEmpty}</p>
      ) : (
        <div className="mt-4 grid gap-3">
          {pending.map((app) => (
            <TicketCard key={app.id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-bold text-kinnso-ink">{app.companyName}</p>
                  <p className="text-sm text-kinnso-muted">{app.contactEmail}</p>
                  <p className="text-sm text-kinnso-muted">{app.websiteUrl ?? t.noWebsite}</p>
                  <p className="mt-2 text-sm text-kinnso-ink/80">{t.pitchLabel}: {app.pitch ?? t.noPitch}</p>
                  <p className="mt-1 text-xs text-kinnso-muted">{t.colSubmitted}: {new Date(app.createdAt).toLocaleDateString(locale)}</p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button onClick={() => start(app.id, 'approve')} aria-label={`${t.actApprove} ${app.companyName}`} className="k-chip">{t.actApprove}</button>
                  <button onClick={() => start(app.id, 'reject')} aria-label={`${t.actReject} ${app.companyName}`} className="k-chip">{t.actReject}</button>
                </div>
              </div>

              {action?.id === app.id && (
                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-kinnso-edge pt-3">
                  <input value={reason} onChange={(e) => setReason(e.target.value)}
                    placeholder={t.reasonPlaceholder} aria-label={t.reasonPlaceholder}
                    className="k-input max-w-sm" />
                  <button onClick={confirm} disabled={busy || reason.trim().length === 0}
                    className="rounded-full border border-kinnso-edge px-4 py-2 text-sm font-bold text-kinnso-ink disabled:opacity-50">{t.actConfirm}</button>
                  <button onClick={() => setAction(null)} disabled={busy}
                    className="rounded-full px-4 py-2 text-sm font-bold text-kinnso-muted">{t.actCancel}</button>
                </div>
              )}
              {rowError[app.id] ? <p className="mt-2 text-sm text-red-600">{rowError[app.id]}</p> : null}
            </TicketCard>
          ))}
        </div>
      )}

      <h2 className="k-display mt-10">{t.decidedHeading}</h2>
      {decided.length === 0 ? (
        <p className="mt-4 text-kinnso-muted">{t.decidedEmpty}</p>
      ) : (
        <div className="mt-4 grid gap-2">
          {decided.map((app) => (
            <TicketCard key={app.id} className="p-3 text-sm">
              <span className="font-bold text-kinnso-ink">{app.companyName}</span>
              {' — '}{statusLabel(app.status)}
              {app.decisionReason ? ` — ${app.decisionReason}` : ''}
            </TicketCard>
          ))}
        </div>
      )}
    </main>
  )
}

export default MerchantApplicationsView
