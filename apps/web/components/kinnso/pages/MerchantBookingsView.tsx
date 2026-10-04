'use client'

import { useState, useTransition } from 'react'
import type { Locale } from '@/lib/i18n/config'
import type { MerchantBookingsMessages } from '@/lib/i18n/messages/en'
import type { MerchantBookingRow } from '@/lib/bookings/types'
import type { ActionResult } from '@/lib/admin/result'

const STATUS_KEY: Record<MerchantBookingRow['status'], keyof MerchantBookingsMessages> = {
  pending_payment: 'statusPendingPayment',
  confirmed: 'statusConfirmed',
  completed: 'statusCompleted',
  cancelled: 'statusCancelled',
  refunded: 'statusRefunded',
}

type MerchantBookingsViewProps = {
  locale: Locale
  t: MerchantBookingsMessages
  bookings: MerchantBookingRow[]
  onComplete: (bookingId: string) => Promise<ActionResult<{ id: string }>>
}

export function MerchantBookingsView({ t, bookings, onComplete }: MerchantBookingsViewProps) {
  const [rows, setRows] = useState(bookings)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleComplete(bookingId: string) {
    setBusyId(bookingId)
    startTransition(async () => {
      const result = await onComplete(bookingId)
      if (result.ok) {
        setRows((prev) =>
          prev.map((row) => (row.id === bookingId ? { ...row, status: 'completed' } : row)),
        )
      }
      setBusyId(null)
    })
  }

  return (
    <main className="k-container py-10">
      <h1 className="text-3xl font-black text-kinnso-ink">{t.title}</h1>
      <div className="mt-6 overflow-hidden rounded-2xl border border-kinnso-cream2 bg-white shadow-kinnso">
        <div className="grid grid-cols-1 gap-3 border-b border-kinnso-cream2 px-4 py-3 text-xs font-bold uppercase text-kinnso-muted sm:grid-cols-[1fr_140px_120px_80px_120px_120px_140px]">
          <span>{t.colExperience}</span>
          <span>{t.colTraveler}</span>
          <span>{t.colCreator}</span>
          <span>{t.colQty}</span>
          <span>{t.colAmount}</span>
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
              className="grid grid-cols-1 gap-3 border-b border-kinnso-cream2 px-4 py-4 last:border-b-0 sm:grid-cols-[1fr_140px_120px_80px_120px_120px_140px] sm:items-center"
            >
              <h2 className="font-bold text-kinnso-ink">{row.experienceTitle}</h2>
              <span className="text-sm text-kinnso-muted">{row.travelerLabel}</span>
              <span className="text-sm text-kinnso-muted">
                {row.creatorLabel === 'Direct' ? t.directLabel : row.creatorLabel}
              </span>
              <span className="text-sm text-kinnso-muted">{row.qty}</span>
              <span className="text-sm text-kinnso-muted">
                {row.currency} {row.totalAmount.toFixed(2)}
              </span>
              <span className="text-sm text-kinnso-muted">{t[STATUS_KEY[row.status]]}</span>
              <span>
                {row.status === 'confirmed' && (
                  <button
                    type="button"
                    disabled={isPending && busyId === row.id}
                    onClick={() => handleComplete(row.id)}
                    aria-label={`${t.markCompleteButton} ${row.experienceTitle}`}
                    className="k-btn-ghost text-sm disabled:opacity-50"
                  >
                    {t.markCompleteButton}
                  </button>
                )}
              </span>
            </div>
          ))
        )}
      </div>
    </main>
  )
}

export default MerchantBookingsView
