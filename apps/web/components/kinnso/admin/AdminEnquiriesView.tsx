'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { ActionResult } from '@/lib/admin/result'
import type { Locale } from '@/lib/i18n/config'
import type { Messages } from '@/lib/i18n/messages/en'
import type { AdminEnquiry, AdminEnquiryCursor, EnquiryStatus, EnquiryStatusFilter, EnquiryTypeFilter } from '@/lib/admin/enquiries-queries'

type T = Messages['enquiriesAdmin']

function filterHref(locale: Locale, status: EnquiryStatusFilter, type: EnquiryTypeFilter) {
  const search = new URLSearchParams()
  if (status !== 'active') search.set('status', status)
  if (type !== 'all') search.set('type', type)
  const query = search.toString()
  return `/${locale}/admin/enquiries${query ? `?${query}` : ''}`
}

function nextHref(locale: Locale, filters: { status: EnquiryStatusFilter; type: EnquiryTypeFilter }, cursor: AdminEnquiryCursor) {
  const search = new URLSearchParams()
  if (filters.status !== 'active') search.set('status', filters.status)
  if (filters.type !== 'all') search.set('type', filters.type)
  search.set('cursorCreatedAt', cursor.createdAt)
  search.set('cursorId', cursor.id)
  return `/${locale}/admin/enquiries?${search.toString()}`
}

function targetHref(locale: Locale, enquiry: AdminEnquiry) {
  if (!enquiry.targetName || !enquiry.targetSlug) return null
  const segment = encodeURIComponent(enquiry.targetSlug)
  return enquiry.type === 'creator_collab' ? `/${locale}/c/${segment}` : `/${locale}/m/${segment}`
}
function allowedActions(status: EnquiryStatus): EnquiryStatus[] {
  if (status === 'new') return ['in_progress', 'resolved', 'spam']
  if (status === 'in_progress') return ['resolved', 'spam']
  return ['in_progress']
}

export function AdminEnquiriesView({
  locale, t, enquiries, filters, nextCursor = null, onSetStatus,
}: {
  locale: Locale
  t: T
  enquiries: AdminEnquiry[]
  filters: { status: EnquiryStatusFilter; type: EnquiryTypeFilter }
  nextCursor?: AdminEnquiryCursor | null
  onSetStatus: (id: string, status: EnquiryStatus, reason: string) => Promise<ActionResult<{ status: EnquiryStatus }>>
}) {
  const router = useRouter()
  const [busyIds, setBusyIds] = useState<Set<string>>(() => new Set())
  const [reasons, setReasons] = useState<Record<string, string>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})

  const actionLabel: Record<EnquiryStatus, string> = {
    new: t.statusNew,
    in_progress: t.markInProgress,
    resolved: t.markResolved,
    spam: t.markSpam,
  }
  const statusLabel: Record<EnquiryStatus, string> = {
    new: t.statusNew,
    in_progress: t.statusInProgress,
    resolved: t.statusResolved,
    spam: t.statusSpam,
  }

  async function mutate(enquiry: AdminEnquiry, next: EnquiryStatus) {
    if (busyIds.has(enquiry.id)) return
    const reason = reasons[enquiry.id] ?? ''
    const requiresReason = next === 'resolved' || next === 'spam' || enquiry.status === 'resolved' || enquiry.status === 'spam'
    if (requiresReason && !reason.trim()) {
      setErrors((current) => ({ ...current, [enquiry.id]: t.reasonRequired }))
      return
    }
    setBusyIds((current) => new Set(current).add(enquiry.id))
    setErrors((current) => ({ ...current, [enquiry.id]: '' }))
    try {
      const result = await onSetStatus(enquiry.id, next, reason)
      if (result.ok) router.refresh()
      else setErrors((current) => ({ ...current, [enquiry.id]: t.actionFailed }))
    } catch {
      setErrors((current) => ({ ...current, [enquiry.id]: t.actionFailed }))
    } finally {
      setBusyIds((current) => { const updated = new Set(current); updated.delete(enquiry.id); return updated })
    }
  }

  return (
    <main>
      <h1 className="k-display">{t.title}</h1>
      <p className="mt-2 text-kinnso-muted">{t.subtitle}</p>
      <nav className="mt-6 flex flex-wrap gap-2" aria-label={t.title}>
        {(['active', 'resolved', 'spam'] as const).map((status) => (
          <Link key={status} href={filterHref(locale, status, filters.type)} aria-current={filters.status === status ? 'page' : undefined} className="rounded-lg px-3 py-2 text-sm font-bold text-kinnso-ink">
            {status === 'active' ? t.filterActive : status === 'resolved' ? t.filterResolved : t.filterSpam}
          </Link>
        ))}
        {(['all', 'creator_collab', 'merchant_contact'] as const).map((type) => (
          <Link key={type} href={filterHref(locale, filters.status, type)} aria-current={filters.type === type ? 'page' : undefined} className="rounded-lg px-3 py-2 text-sm font-bold text-kinnso-ink">
            {type === 'all' ? t.filterAllTypes : type === 'creator_collab' ? t.typeCreator : t.typeMerchant}
          </Link>
        ))}
      </nav>
      {enquiries.length === 0 ? <p className="mt-8 text-kinnso-muted">{t.empty}</p> : (
        <div className="mt-8 grid gap-4">
          {enquiries.map((enquiry) => {
            const href = targetHref(locale, enquiry)
            const hasReasonAction = allowedActions(enquiry.status).some((next) => next === 'resolved' || next === 'spam' || enquiry.status === 'resolved' || enquiry.status === 'spam')
            const busy = busyIds.has(enquiry.id)
            return (
              <article key={enquiry.id} className="rounded-xl border border-kinnso-ink/10 bg-white p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-bold text-kinnso-ink">{enquiry.type === 'creator_collab' ? t.typeCreator : t.typeMerchant}</p>
                  <p className="text-sm text-kinnso-muted">{statusLabel[enquiry.status]}</p>
                </div>
                <p className="mt-3 text-sm text-kinnso-muted">{t.target}: {href ? <Link href={href} className="font-bold text-kinnso-ink underline">{enquiry.targetName}</Link> : enquiry.targetName ?? '—'}</p>
                <p className="mt-3 font-bold text-kinnso-ink">{enquiry.name}</p>
                <p className="text-sm text-kinnso-muted">{enquiry.email}</p>
                <p className="mt-3 whitespace-pre-wrap text-kinnso-ink">{enquiry.message}</p>
                <p className="mt-3 text-sm text-kinnso-muted">{t.receivedAt}: {new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(enquiry.createdAt))}</p>
                {hasReasonAction ? <label className="mt-4 block text-sm font-bold text-kinnso-ink">{t.reasonLabel}<input value={reasons[enquiry.id] ?? ''} onChange={(event) => setReasons((current) => ({ ...current, [enquiry.id]: event.target.value }))} className="mt-1 block w-full rounded-lg border border-kinnso-ink/20 px-3 py-2" /></label> : null}
                <div className="mt-4 flex flex-wrap gap-3">
                  {allowedActions(enquiry.status).map((next) => (
                    <button key={next} type="button" disabled={busy} onClick={() => void mutate(enquiry, next)} className="rounded-lg bg-kinnso-orange px-3 py-2 text-sm font-bold text-white disabled:opacity-60">
                      {next === 'in_progress' && (enquiry.status === 'resolved' || enquiry.status === 'spam') ? t.reopen : actionLabel[next]}
                    </button>
                  ))}
                </div>
                {errors[enquiry.id] ? <p role="alert" className="mt-3 text-sm text-red-600">{errors[enquiry.id]}</p> : null}
              </article>
            )
          })}
        </div>
      )}
      {nextCursor ? <Link href={nextHref(locale, filters, nextCursor)} className="mt-6 inline-block rounded-lg px-3 py-2 text-sm font-bold text-kinnso-ink">{t.next}</Link> : null}
    </main>
  )
}
