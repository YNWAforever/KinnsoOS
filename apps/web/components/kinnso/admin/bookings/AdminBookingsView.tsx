'use client'

import { useState, useTransition } from 'react'
import type { Locale } from '@/lib/i18n/config'
import type { Messages } from '@/lib/i18n/messages/en'
import type { OpsBookingSettlementRow } from '@/lib/bookings/types'
import type { ActionResult } from '@/lib/admin/result'

export type AdminBookingsMessages = Messages['bookingsOps']

export interface AdminBookingsViewProps {
  locale: Locale
  t: AdminBookingsMessages
  settlements: OpsBookingSettlementRow[]
  onMarkPaid: (
    settlementId: string,
    reason: string,
    hasCreatorLeg: boolean,
  ) => Promise<ActionResult<{ id: string }>>
}

// NOTE: this first cut only ships the settlement-status ("mark paid") side of
// the UI. `adminCancelAndRefundBookingAction` already exists in
// lib/bookings/actions.ts and now takes only `{ bookingId, reason }` — it
// resolves the payment intent and validates the booking's status server-side —
// so wiring a "Cancel & refund" button here needs nothing from this row shape
// beyond a booking id.
export function AdminBookingsView({ t, settlements, onMarkPaid }: AdminBookingsViewProps) {
  const [rows, setRows] = useState(settlements)
  const [reasons, setReasons] = useState<Record<string, string>>({})
  const [busyId, setBusyId] = useState<string | null>(null)
  const [rowError, setRowError] = useState<Record<string, string>>({})
  const [isPending, startTransition] = useTransition()

  function handleMarkPaid(row: OpsBookingSettlementRow) {
    const reason = reasons[row.id]?.trim()
    if (!reason) return
    setBusyId(row.id)
    setRowError((m) => ({ ...m, [row.id]: '' }))
    // Direct bookings (no creator_id) never get a creator_commission_status leg
    // (it stays null from Task 1's confirm-time trigger) — only ask the RPC to
    // touch that leg when one actually exists, otherwise
    // admin_set_booking_settlement_status raises `no_creator_leg`.
    const hasCreatorLeg = row.creatorCommissionStatus !== null
    startTransition(async () => {
      const result = await onMarkPaid(row.id, reason, hasCreatorLeg)
      setBusyId(null)
      if (result.ok) {
        setRows((prev) =>
          prev.map((r) =>
            r.id === row.id
              ? {
                  ...r,
                  status: 'paid',
                  merchantPayoutStatus: 'paid',
                  kinnsoCommissionStatus: 'paid',
                  creatorCommissionStatus: r.creatorCommissionStatus ? 'paid' : null,
                }
              : r,
          ),
        )
      } else {
        setRowError((m) => ({ ...m, [row.id]: result.errors.form?.[0] ?? t.actionFailed }))
      }
    })
  }

  return (
    <main className="k-container py-10">
      <h1 className="text-3xl font-black text-kinnso-ink">{t.title}</h1>
      <div className="mt-6 overflow-hidden rounded-2xl border border-kinnso-cream2 bg-white shadow-kinnso">
        <div className="grid grid-cols-1 gap-3 border-b border-kinnso-cream2 px-4 py-3 text-xs font-bold uppercase text-kinnso-muted sm:grid-cols-[1fr_160px_160px_160px_120px_180px]">
          <span>{t.colExperience}</span>
          <span>{t.colMerchantPayout}</span>
          <span>{t.colCreatorCommission}</span>
          <span>{t.colKinnsoCommission}</span>
          <span>{t.colStatus}</span>
          <span />
        </div>
        {rows.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <p className="text-sm text-kinnso-muted">{t.empty}</p>
          </div>
        ) : (
          rows.map((row) => (
            <div
              key={row.id}
              className="grid grid-cols-1 gap-3 border-b border-kinnso-cream2 px-4 py-4 last:border-b-0 sm:grid-cols-[1fr_160px_160px_160px_120px_180px] sm:items-center"
            >
              <h2 className="font-bold text-kinnso-ink">{row.experienceTitle}</h2>
              <span className="text-sm text-kinnso-muted">
                {row.currency} {row.merchantPayoutAmount.toFixed(2)} ({row.merchantPayoutStatus})
              </span>
              <span className="text-sm text-kinnso-muted">
                {row.creatorCommissionAmount === null
                  ? t.noCreatorLeg
                  : `${row.currency} ${row.creatorCommissionAmount.toFixed(2)} (${row.creatorCommissionStatus})`}
              </span>
              <span className="text-sm text-kinnso-muted">
                {row.currency} {row.kinnsoCommissionAmount.toFixed(2)} ({row.kinnsoCommissionStatus})
              </span>
              <span className="text-sm text-kinnso-muted">{row.status}</span>
              <span>
                {row.status !== 'paid' && (
                  <div className="flex flex-col gap-1">
                    <input
                      type="text"
                      placeholder={t.reasonPlaceholder}
                      aria-label={t.reasonPlaceholder}
                      value={reasons[row.id] ?? ''}
                      onChange={(e) => setReasons((prev) => ({ ...prev, [row.id]: e.target.value }))}
                      className="k-input text-sm"
                    />
                    <button
                      type="button"
                      disabled={(isPending && busyId === row.id) || !reasons[row.id]?.trim()}
                      onClick={() => handleMarkPaid(row)}
                      aria-label={`${t.markPaidButton} ${row.experienceTitle}`}
                      className="k-btn-ghost text-sm disabled:opacity-50"
                    >
                      {t.markPaidButton}
                    </button>
                    {rowError[row.id] ? <p className="text-sm text-red-600">{rowError[row.id]}</p> : null}
                  </div>
                )}
              </span>
            </div>
          ))
        )}
      </div>
    </main>
  )
}

export default AdminBookingsView
