'use client'
import { useState, useTransition, useEffect, useRef } from 'react'
import Link from 'next/link'
import { CreatorsTabs } from '@/components/kinnso/admin/creators/CreatorsTabs'
import type { PayoutRow, PayoutsQueue, SettlementSource } from '@/lib/admin/creators-queries'
import type { SettlementStatusInput } from '@/lib/admin/creators-actions'
import type { ActionResult } from '@/lib/admin/result'
import type { Messages } from '@/lib/i18n/messages/en'
import type { Locale } from '@/lib/i18n/config'

type T = Messages['creators']
type ActionFn = (locale: Locale, id: string, input: SettlementStatusInput, reason: string) => Promise<ActionResult<{ id: string }>>

const STATUS_ORDER = ['not_started', 'pending', 'partially_paid', 'paid', 'disputed'] as const
const SOURCE_ORDER: SettlementSource[] = ['affiliate', 'mission_fee', 'manual']

const money = (n: number | null) => (n === null ? '—' : n.toFixed(2))

function statusLabel(t: T, s: string): string {
  switch (s) {
    case 'not_started': return t.setNotStarted
    case 'pending': return t.setPending
    case 'partially_paid': return t.setPartiallyPaid
    case 'paid': return t.setPaid
    case 'disputed': return t.setDisputed
    default: return s
  }
}

function legLabel(t: T, s: string | null): string {
  if (s === 'paid') return t.setPaid
  if (s === 'pending') return t.setPending
  return '—'
}

// The two forward, money-safe actions the UI exposes (reverts are not surfaced in v1).
type PendingAction = { row: PayoutRow; kind: 'paid' | 'disputed' } | null

export function CreatorPayoutsView({
  t, locale, queue, status, source, action,
}: {
  t: T; locale: Locale; queue: PayoutsQueue; status: string | undefined; source?: SettlementSource; action: ActionFn
}) {
  const [pending, setPending] = useState<PendingAction>(null)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const reasonRef = useRef<HTMLTextAreaElement>(null)

  // Focus the reason field when the confirm dialog opens (a11y for the money action).
  useEffect(() => { if (pending) reasonRef.current?.focus() }, [pending])

  const open = (row: PayoutRow, kind: 'paid' | 'disputed') => { setPending({ row, kind }); setReason(''); setError(null) }
  const cancel = () => { setPending(null); setReason(''); setError(null) }

  const confirm = () => {
    if (!pending) return
    if (!reason.trim()) { setError(t.reasonRequired); return }
    const input: SettlementStatusInput = pending.kind === 'paid'
      ? { status: 'paid', creatorPayoutStatus: 'paid', kinnsoCommissionStatus: 'paid', affiliateCommissionStatus: 'paid' }
      : { status: 'disputed' }
    startTransition(async () => {
      const res = await action(locale, pending.row.id, input, reason.trim())
      if (res.ok) cancel()
      else setError(res.errors.form?.[0] ?? t.actionFailed)
    })
  }

  // Builds a filter link that always carries BOTH facets forward — picking a status must
  // not drop an active source filter, and picking a source must not drop an active status.
  const filterHref = (next: { status?: string; source?: string }) => {
    const params = new URLSearchParams()
    if (next.status) params.set('status', next.status)
    if (next.source) params.set('source', next.source)
    const qs = params.toString()
    return `/${locale}/admin/creators/payouts${qs ? `?${qs}` : ''}`
  }

  return (
    <div>
      <h1 className="mb-1 text-2xl font-black text-kinnso-ink">{t.title}</h1>
      <p className="mb-4 text-sm text-kinnso-muted">{t.subtitle}</p>
      <CreatorsTabs t={t} locale={locale} />

      {/* Money-flow summary cards (always reflect the full queue). */}
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-xl border border-kinnso-edge p-4">
          <p className="text-xs font-bold uppercase text-kinnso-muted">{t.payoutsQueue}</p>
          <p className="mt-1 text-2xl font-black text-kinnso-ink">{queue.summary.total}</p>
        </div>
        <div className="rounded-xl border border-kinnso-edge p-4">
          <p className="text-xs font-bold uppercase text-kinnso-muted">{t.kpiPayoutsPending}</p>
          <p className="mt-1 text-2xl font-black text-kinnso-ink">
            {(queue.summary.byStatus.pending ?? 0) + (queue.summary.byStatus.partially_paid ?? 0)}
          </p>
        </div>
        <div className="rounded-xl border border-kinnso-edge p-4">
          <p className="text-xs font-bold uppercase text-kinnso-muted">{t.payoutsOwed}</p>
          <p className="mt-1 text-sm font-black text-kinnso-ink">
            {queue.summary.owed.length === 0 ? '—' : queue.summary.owed.map((o) => `${money(o.amount)} ${o.currency}`).join(' · ')}
          </p>
        </div>
        <div className="rounded-xl border border-kinnso-edge p-4">
          <p className="text-xs font-bold uppercase text-kinnso-muted">{t.payoutsSettled}</p>
          <p className="mt-1 text-sm font-black text-kinnso-ink">
            {queue.summary.settled.length === 0 ? '—' : queue.summary.settled.map((o) => `${money(o.amount)} ${o.currency}`).join(' · ')}
          </p>
        </div>
      </div>

      {/* Status filter. */}
      <nav className="mb-2 flex flex-wrap gap-2">
        <Link href={filterHref({ source })} aria-current={!status ? 'page' : undefined}
          className={`rounded-full px-3 py-1 text-xs font-bold ${!status ? 'bg-kinnso-orange text-white' : 'bg-kinnso-edge/40 text-kinnso-muted'}`}>
          {t.dirAll}
        </Link>
        {STATUS_ORDER.map((s) => (
          <Link key={s} href={filterHref({ status: s, source })} aria-current={status === s ? 'page' : undefined}
            className={`rounded-full px-3 py-1 text-xs font-bold ${status === s ? 'bg-kinnso-orange text-white' : 'bg-kinnso-edge/40 text-kinnso-muted'}`}>
            {statusLabel(t, s)} {queue.summary.byStatus[s] ? `(${queue.summary.byStatus[s]})` : ''}
          </Link>
        ))}
      </nav>

      {/* Source filter — same link pattern as the status filter above, carrying the
          active status forward so switching source never clears it. */}
      <nav className="mb-4 flex flex-wrap gap-2" aria-label={t.colSource}>
        <Link href={filterHref({ status })} aria-current={!source ? 'page' : undefined}
          className={`rounded-full px-3 py-1 text-xs font-bold ${!source ? 'bg-kinnso-orange text-white' : 'bg-kinnso-edge/40 text-kinnso-muted'}`}>
          {t.dirAll}
        </Link>
        {SOURCE_ORDER.map((s) => (
          <Link key={s} href={filterHref({ status, source: s })} aria-current={source === s ? 'page' : undefined}
            className={`rounded-full px-3 py-1 text-xs font-bold ${source === s ? 'bg-kinnso-orange text-white' : 'bg-kinnso-edge/40 text-kinnso-muted'}`}>
            {s}
          </Link>
        ))}
      </nav>

      {queue.rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-kinnso-muted">{t.payoutsEmpty}</p>
      ) : (
        <table className="w-full text-left text-sm">
          <thead className="text-kinnso-muted">
            <tr className="border-b border-kinnso-edge">
              <th className="py-2 font-bold">{t.colMission}</th>
              <th className="py-2 font-bold">{t.colSource}</th>
              <th className="py-2 font-bold">{t.colName}</th>
              <th className="py-2 font-bold">{t.colAmount}</th>
              <th className="py-2 font-bold">{t.colPayout}</th>
              <th className="py-2 font-bold">{t.colStatus}</th>
              <th className="py-2 font-bold">{t.colOpsNote}</th>
              <th className="py-2 font-bold">{t.colActions}</th>
            </tr>
          </thead>
          <tbody>
            {queue.rows.map((r) => (
              <tr key={r.id} className="border-b border-kinnso-edge/60 align-top">
                <td className="py-2 font-bold text-kinnso-ink">{r.missionTitle}</td>
                <td className="py-2 text-kinnso-muted">{r.source}</td>
                <td className="py-2 text-kinnso-muted">
                  {r.creatorId
                    ? <Link href={`/${locale}/admin/creators/${r.creatorId}`} className="text-kinnso-orange hover:underline">{r.creatorId.slice(0, 8)}</Link>
                    : '—'}
                </td>
                <td className="py-2 text-kinnso-muted">{money(r.creatorCommissionAmount)} <span className="text-kinnso-ink">{r.currency ?? ''}</span></td>
                <td className="py-2 text-kinnso-muted">{legLabel(t, r.creatorPayoutStatus)}</td>
                <td className="py-2 text-kinnso-muted">{statusLabel(t, r.status)}</td>
                <td className="py-2 text-kinnso-muted">{r.opsNote ?? '—'}</td>
                <td className="py-2">
                  <div className="flex flex-col gap-1">
                    <button type="button" onClick={() => open(r, 'paid')}
                      className="rounded-md bg-kinnso-orange px-2 py-1 text-xs font-bold text-white disabled:opacity-50"
                      disabled={r.status === 'paid'}>{t.actMarkPaid}</button>
                    <button type="button" onClick={() => open(r, 'disputed')}
                      className="rounded-md border border-kinnso-edge px-2 py-1 text-xs font-bold text-kinnso-ink disabled:opacity-50"
                      disabled={r.status === 'disputed'}>{t.actMarkDisputed}</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Confirm + reason panel (money-touching → required per spec §6). */}
      {pending && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" role="dialog" aria-modal="true"
          aria-labelledby="payout-confirm-title" onKeyDown={(e) => { if (e.key === 'Escape') cancel() }}>
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
            <p id="payout-confirm-title" className="mb-3 text-sm font-bold text-kinnso-ink">
              {pending.kind === 'paid' ? t.confirmMarkPaid : t.confirmMarkDisputed}
            </p>
            <p className="mb-2 text-xs text-kinnso-muted">{pending.row.missionTitle}</p>
            <textarea ref={reasonRef} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t.reasonPlaceholder}
              aria-label={t.reasonPlaceholder}
              className="mb-2 w-full rounded-md border border-kinnso-edge p-2 text-sm" rows={3} />
            {error && <p className="mb-2 text-xs font-bold text-red-600">{error}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={cancel} disabled={isPending}
                className="rounded-md border border-kinnso-edge px-3 py-1 text-sm font-bold text-kinnso-ink">{t.actCancel}</button>
              <button type="button" onClick={confirm} disabled={isPending || !reason.trim()}
                className="rounded-md bg-kinnso-orange px-3 py-1 text-sm font-bold text-white disabled:opacity-50">{t.actApply}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default CreatorPayoutsView
