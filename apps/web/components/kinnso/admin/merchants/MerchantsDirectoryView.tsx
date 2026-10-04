'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import type { Messages } from '@/lib/i18n/messages/en'
import type { Locale } from '@/lib/i18n/config'
import type { MerchantsDirectory } from '@/lib/admin/merchants-queries'
import type { ActionResult } from '@/lib/admin/result'
import type { MerchantStatus, MerchantTier } from '@/lib/admin/merchants-validation'
import { TicketCard } from '@/components/kinnso/MarketPassport'
import { MerchantStatusBadge, MerchantTierBadge } from '@/components/kinnso/admin/merchants/badges'
import { MerchantsTabs } from '@/components/kinnso/admin/merchants/MerchantsTabs'

type T = Messages['merchantsOps']

type Pending = { id: string; kind: 'status' | 'tier' | 'note'; status?: MerchantStatus; tier?: MerchantTier } | null

export interface MerchantsDirectoryViewProps {
  t: T
  locale: Locale
  directory: MerchantsDirectory
  onSetStatus: (locale: Locale, id: string, status: MerchantStatus, reason: string) => Promise<ActionResult<{ id: string; status: MerchantStatus }>>
  onSetTier: (locale: Locale, id: string, tier: MerchantTier, reason: string) => Promise<ActionResult<{ id: string; tier: MerchantTier }>>
  onAddNote: (locale: Locale, id: string, note: string) => Promise<ActionResult<{ id: string }>>
  onBulkSetStatus: (locale: Locale, ids: string[], status: MerchantStatus, reason: string) => Promise<ActionResult<{ count: number }>>
}

export function MerchantsDirectoryView({ t, locale, directory, onSetStatus, onSetTier, onAddNote, onBulkSetStatus }: MerchantsDirectoryViewProps) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  const [search, setSearch] = useState(params.get('q') ?? '')
  const [pending, setPending] = useState<Pending>(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [rowError, setRowError] = useState<Record<string, string>>({})
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [bulkStatus, setBulkStatus] = useState<'' | MerchantStatus>('')
  const [bulkReason, setBulkReason] = useState('')
  const [bulkError, setBulkError] = useState('')

  const setQuery = (mut: (sp: URLSearchParams) => void) => {
    const sp = new URLSearchParams(params.toString())
    sp.delete('cursor_at')
    sp.delete('cursor_id')
    mut(sp)
    router.push(`${pathname}?${sp.toString()}`)
  }

  function onSearch(e: React.FormEvent) {
    e.preventDefault()
    setQuery((sp) => { if (search) sp.set('q', search); else sp.delete('q') })
  }

  function startAction(p: NonNullable<Pending>) {
    setPending(p)
    setReason('')
    setRowError((m) => ({ ...m, [p.id]: '' }))
  }

  async function applyPending() {
    if (!pending) return
    setBusy(true)
    let res: ActionResult<Record<string, unknown>>
    if (pending.kind === 'status') res = await onSetStatus(locale, pending.id, pending.status!, reason)
    else if (pending.kind === 'tier') res = await onSetTier(locale, pending.id, pending.tier!, reason)
    else res = await onAddNote(locale, pending.id, reason)
    setBusy(false)
    if (res.ok) {
      setRowError((m) => { const n = { ...m }; delete n[pending.id]; return n })
      setPending(null)
      router.refresh()
    } else {
      setRowError((m) => ({ ...m, [pending.id]: res.errors.form?.[0] ?? t.actionFailed }))
    }
  }

  async function applyBulk() {
    if (!bulkStatus || checked.size === 0) return
    setBusy(true)
    setBulkError('')
    const res = await onBulkSetStatus(locale, [...checked], bulkStatus, bulkReason)
    setBusy(false)
    if (res.ok) {
      setChecked(new Set())
      setBulkStatus('')
      setBulkReason('')
      router.refresh()
    } else {
      setBulkError(res.errors.form?.[0] ?? t.actionFailed)
    }
  }

  const reasonValid = reason.trim().length > 0
  const isNote = pending?.kind === 'note'

  return (
    <main>
      <MerchantsTabs t={t} locale={locale} />
      <h1 className="k-display">{t.title}</h1>

      <form data-testid="directory-search-form" onSubmit={onSearch} className="mt-6 flex gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t.dirSearch}
          className="k-input max-w-sm"
          aria-label={t.dirSearch}
        />
      </form>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <select aria-label={t.dirStatus} defaultValue={params.get('status') ?? ''}
          onChange={(e) => setQuery((sp) => { if (e.target.value) sp.set('status', e.target.value); else sp.delete('status') })}
          className="rounded-full border border-kinnso-edge px-3 py-2 text-sm font-bold text-kinnso-ink">
          <option value="">{t.dirStatus}: {t.dirAll}</option>
          <option value="active">{t.statusActive}</option>
          <option value="paused">{t.statusPaused}</option>
          <option value="suspended">{t.statusSuspended}</option>
          <option value="archived">{t.statusArchived}</option>
        </select>
        <select aria-label={t.dirTier} defaultValue={params.get('tier') ?? ''}
          onChange={(e) => setQuery((sp) => { if (e.target.value) sp.set('tier', e.target.value); else sp.delete('tier') })}
          className="rounded-full border border-kinnso-edge px-3 py-2 text-sm font-bold text-kinnso-ink">
          <option value="">{t.dirTier}: {t.dirAll}</option>
          <option value="free">{t.tierFree}</option>
          <option value="growth">{t.tierGrowth}</option>
        </select>
      </div>

      {checked.size > 0 && (
        <TicketCard className="mt-4 flex flex-wrap items-center gap-2 p-3">
          <span className="text-sm font-bold text-kinnso-ink">{checked.size} {t.bulkSelected}</span>
          <select data-testid="bulk-action-select" value={bulkStatus}
            onChange={(e) => setBulkStatus(e.target.value as '' | MerchantStatus)}
            aria-label={t.bulkChooseAction}
            className="rounded-full border border-kinnso-edge px-3 py-2 text-sm font-bold text-kinnso-ink">
            <option value="">{t.bulkChooseAction}</option>
            <option value="active">{t.statusActive}</option>
            <option value="paused">{t.statusPaused}</option>
            <option value="suspended">{t.statusSuspended}</option>
            <option value="archived">{t.statusArchived}</option>
          </select>
          <input data-testid="bulk-reason" value={bulkReason} onChange={(e) => setBulkReason(e.target.value)}
            placeholder={t.reasonPlaceholder} className="k-input max-w-xs" aria-label={t.reasonPlaceholder} />
          <button onClick={applyBulk} disabled={busy || !bulkStatus || bulkReason.trim().length === 0}
            className="rounded-full border border-kinnso-edge px-4 py-2 text-sm font-bold text-kinnso-ink disabled:opacity-50">
            {t.bulkApply}
          </button>
          {bulkError ? <p className="w-full text-sm text-red-600">{bulkError}</p> : null}
        </TicketCard>
      )}

      {directory.rows.length === 0 ? (
        <p className="mt-6 text-kinnso-muted">{t.dirEmpty}</p>
      ) : (
        <div className="mt-4 grid gap-3">
          {directory.rows.map((row) => {
            return (
              <TicketCard key={row.id} className="p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <input type="checkbox" aria-label={`Select ${row.companyName}`}
                    checked={checked.has(row.id)}
                    onChange={(e) => setChecked((s) => { const n = new Set(s); if (e.target.checked) n.add(row.id); else n.delete(row.id); return n })} />
                  <div className="min-w-0 flex-1">
                    <p className="font-bold">
                      <Link href={`/${locale}/admin/merchants/${row.id}`} className="text-kinnso-ink hover:text-kinnso-orange hover:underline">
                        {row.companyName}
                      </Link>
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                      <MerchantStatusBadge status={row.status} t={t} />
                      <MerchantTierBadge tier={row.tier} t={t} />
                      <span className="text-kinnso-muted">{t.colJoined} {new Date(row.createdAt).toLocaleDateString(locale, { timeZone: 'UTC' })}</span>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button onClick={() => startAction({ id: row.id, kind: 'status', status: row.status as MerchantStatus })}
                      aria-label={`${t.actSetStatus} ${row.companyName}`} className="k-chip">{t.actSetStatus}</button>
                    <button onClick={() => startAction({ id: row.id, kind: 'tier', tier: row.tier as MerchantTier })}
                      aria-label={`${t.actSetTier} ${row.companyName}`} className="k-chip">{t.actSetTier}</button>
                    <button onClick={() => startAction({ id: row.id, kind: 'note' })}
                      aria-label={`${t.actNote} ${row.companyName}`} className="k-chip">{t.actNote}</button>
                  </div>
                </div>

                {pending?.id === row.id && (
                  <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-kinnso-edge pt-3">
                    {pending.kind === 'status' ? (
                      <>
                        {pending.status === 'archived' ? <p className="w-full text-sm text-red-600">{t.confirmArchive}</p> : null}
                        <select value={pending.status ?? ''}
                          onChange={(e) => setPending({ ...pending, status: e.target.value as MerchantStatus })}
                          className="rounded-full border border-kinnso-edge px-3 py-2 text-sm font-bold text-kinnso-ink">
                          <option value="active">{t.statusActive}</option>
                          <option value="paused">{t.statusPaused}</option>
                          <option value="suspended">{t.statusSuspended}</option>
                          <option value="archived">{t.statusArchived}</option>
                        </select>
                      </>
                    ) : pending.kind === 'tier' ? (
                      <select value={pending.tier ?? ''}
                        onChange={(e) => setPending({ ...pending, tier: e.target.value as MerchantTier })}
                        className="rounded-full border border-kinnso-edge px-3 py-2 text-sm font-bold text-kinnso-ink">
                        <option value="free">{t.tierFree}</option>
                        <option value="growth">{t.tierGrowth}</option>
                      </select>
                    ) : null}
                    <input value={reason} onChange={(e) => setReason(e.target.value)}
                      placeholder={isNote ? t.notePlaceholder : t.reasonPlaceholder}
                      aria-label={isNote ? t.notePlaceholder : t.reasonPlaceholder}
                      className="k-input max-w-sm" />
                    <button onClick={applyPending} disabled={busy || !reasonValid}
                      className="rounded-full border border-kinnso-edge px-4 py-2 text-sm font-bold text-kinnso-ink disabled:opacity-50">{t.actApply}</button>
                    <button onClick={() => setPending(null)} disabled={busy}
                      className="rounded-full px-4 py-2 text-sm font-bold text-kinnso-muted">{t.actCancel}</button>
                  </div>
                )}
                {rowError[row.id] ? <p className="mt-2 text-sm text-red-600">{rowError[row.id]}</p> : null}
              </TicketCard>
            )
          })}
        </div>
      )}

      {directory.nextCursor && (
        <div className="mt-6 flex justify-center">
          <button
            onClick={() => setQuery((sp) => { sp.set('cursor_at', directory.nextCursor!.createdAt); sp.set('cursor_id', directory.nextCursor!.id) })}
            className="rounded-full border border-kinnso-edge px-5 py-2.5 text-sm font-bold text-kinnso-ink">{t.dirLoadMore}</button>
        </div>
      )}
    </main>
  )
}

export default MerchantsDirectoryView
