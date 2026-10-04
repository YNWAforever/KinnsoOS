'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import type { Messages } from '@/lib/i18n/messages/en'
import type { Locale } from '@/lib/i18n/config'
import type { CreatorsDirectory } from '@/lib/admin/creators-queries'
import type { ActionResult } from '@/lib/admin/result'
import type { CreatorStatus } from '@/lib/admin/creators-validation'
import { TicketCard } from '@/components/kinnso/MarketPassport'
import { StatusBadge, TierBadge, VerifiedBadge } from '@/components/kinnso/admin/creators/badges'
import { CreatorsTabs } from '@/components/kinnso/admin/creators/CreatorsTabs'

type T = Messages['creators']

export interface DirectoryActions {
  setCreatorStatus: (locale: Locale, id: string, status: CreatorStatus, reason: string) => Promise<ActionResult<{ id: string; status: CreatorStatus }>>
  reinstateCreator: (locale: Locale, id: string, reason: string) => Promise<ActionResult<{ id: string; status: 'active' }>>
  setCreatorVerified: (locale: Locale, id: string, verified: boolean, reason: string) => Promise<ActionResult<{ id: string; verified: boolean }>>
  addCreatorNote: (locale: Locale, id: string, note: string) => Promise<ActionResult<{ id: string }>>
  bulkSetCreatorStatus: (locale: Locale, ids: string[], status: CreatorStatus, reason: string) => Promise<ActionResult<{ count: number }>>
}

type Pending = { id: string; kind: 'status' | 'reinstate' | 'verify' | 'note'; status?: CreatorStatus; verified?: boolean } | null

export function CreatorsDirectoryView({ t, locale, data, actions }: { t: T; locale: Locale; data: CreatorsDirectory; actions: DirectoryActions }) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  const [search, setSearch] = useState(params.get('q') ?? '')
  const [pending, setPending] = useState<Pending>(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [rowError, setRowError] = useState<Record<string, string>>({})
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [bulkStatus, setBulkStatus] = useState<'' | CreatorStatus>('')
  const [bulkReason, setBulkReason] = useState('')
  const [bulkError, setBulkError] = useState('')

  const setQuery = (mut: (sp: URLSearchParams) => void) => {
    const sp = new URLSearchParams(params.toString())
    // Any filter/search change resets keyset pagination to the first page.
    // "Next page" re-sets the cursor inside its own mutation, after this delete.
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
    if (pending.kind === 'status') res = await actions.setCreatorStatus(locale, pending.id, pending.status!, reason)
    else if (pending.kind === 'reinstate') res = await actions.reinstateCreator(locale, pending.id, reason)
    else if (pending.kind === 'verify') res = await actions.setCreatorVerified(locale, pending.id, pending.verified!, reason)
    else res = await actions.addCreatorNote(locale, pending.id, reason)
    setBusy(false)
    if (res.ok) {
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
    const res = await actions.bulkSetCreatorStatus(locale, [...checked], bulkStatus, bulkReason)
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
      <CreatorsTabs t={t} locale={locale} />
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
          <option value="onboarding">{t.dirStatus}: {t.statusOnboarding}</option>
          <option value="active">{t.dirStatus}: {t.statusActive}</option>
          <option value="suspended">{t.dirStatus}: {t.statusSuspended}</option>
          <option value="banned">{t.dirStatus}: {t.statusBanned}</option>
        </select>
        <select aria-label={t.dirTier} defaultValue={params.get('tier') ?? ''}
          onChange={(e) => setQuery((sp) => { if (e.target.value) sp.set('tier', e.target.value); else sp.delete('tier') })}
          className="rounded-full border border-kinnso-edge px-3 py-2 text-sm font-bold text-kinnso-ink">
          <option value="">{t.dirTier}: {t.dirAll}</option>
          <option value="seed">{t.tierSeed}</option>
          <option value="rising">{t.tierRising}</option>
          <option value="pro">{t.tierPro}</option>
          <option value="elite">{t.tierElite}</option>
        </select>
        <select aria-label={t.dirDna} defaultValue={params.get('dna') ?? ''}
          onChange={(e) => setQuery((sp) => { if (e.target.value) sp.set('dna', e.target.value); else sp.delete('dna') })}
          className="rounded-full border border-kinnso-edge px-3 py-2 text-sm font-bold text-kinnso-ink">
          <option value="">{t.dirDna}: {t.dirAll}</option>
          <option value="published">{t.dnaPublished}</option>
          <option value="draft">{t.dnaDraft}</option>
          <option value="none">{t.dnaNone}</option>
        </select>
        <label className="flex items-center gap-2 text-sm font-bold text-kinnso-ink">
          <input type="checkbox" defaultChecked={params.get('verified') === 'true'}
            onChange={(e) => setQuery((sp) => { if (e.target.checked) sp.set('verified', 'true'); else sp.delete('verified') })} />
          {t.dirVerifiedOnly}
        </label>
      </div>

      {checked.size > 0 && (
        <TicketCard className="mt-4 flex flex-wrap items-center gap-2 p-3">
          <span className="text-sm font-bold text-kinnso-ink">{checked.size} {t.bulkSelected}</span>
          <select data-testid="bulk-action-select" value={bulkStatus}
            onChange={(e) => setBulkStatus(e.target.value as '' | CreatorStatus)}
            aria-label={t.bulkChooseAction}
            className="rounded-full border border-kinnso-edge px-3 py-2 text-sm font-bold text-kinnso-ink">
            <option value="">{t.bulkChooseAction}</option>
            <option value="active">{t.actActivate}</option>
            <option value="suspended">{t.actSuspend}</option>
            <option value="banned">{t.actBan}</option>
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

      {data.rows.length === 0 ? (
        <p className="mt-6 text-kinnso-muted">{t.dirEmpty}</p>
      ) : (
        <div className="mt-4 grid gap-3">
          {data.rows.map((row) => {
            const name = row.displayName || row.handle || '—'
            const banned = row.status === 'banned'
            const active = row.status === 'active'
            const showActivate = row.status === 'onboarding' || row.status === 'suspended'
            return (
              <TicketCard key={row.id} className="p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <input type="checkbox" aria-label={`Select ${name}`}
                    checked={checked.has(row.id)}
                    onChange={(e) => setChecked((s) => { const n = new Set(s); if (e.target.checked) n.add(row.id); else n.delete(row.id); return n })} />
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-kinnso-ink">
                      <Link href={`/${locale}/admin/creators/${row.id}`} className="text-kinnso-ink hover:text-kinnso-orange hover:underline">{name}</Link>
                      {row.handle ? <span className="text-kinnso-muted"> @{row.handle}</span> : null}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                      <StatusBadge status={row.status} t={t} />
                      {row.tier ? <TierBadge tier={row.tier} t={t} /> : null}
                      <VerifiedBadge verified={row.verified} t={t} />
                      <span className="text-kinnso-muted">{t.colDna}: {row.dnaStatus ? (row.dnaStatus === 'published' ? t.dnaPublished : t.dnaDraft) : t.dnaNone}</span>
                      <span className="text-kinnso-muted">{t.colJoined} {new Date(row.createdAt).toLocaleDateString(locale, { timeZone: 'UTC' })}</span>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {showActivate && <button onClick={() => startAction({ id: row.id, kind: 'status', status: 'active' })}
                      aria-label={`${t.actActivate} ${name}`} className="k-chip">{t.actActivate}</button>}
                    {active && <button onClick={() => startAction({ id: row.id, kind: 'status', status: 'suspended' })}
                      aria-label={`${t.actSuspend} ${name}`} className="k-chip">{t.actSuspend}</button>}
                    {(active || row.status === 'suspended') && <button onClick={() => startAction({ id: row.id, kind: 'status', status: 'banned' })}
                      aria-label={`${t.actBan} ${name}`} className="k-chip">{t.actBan}</button>}
                    {banned && <button onClick={() => startAction({ id: row.id, kind: 'reinstate' })}
                      aria-label={`${t.actReinstate} ${name}`} className="k-chip">{t.actReinstate}</button>}
                    <button onClick={() => startAction({ id: row.id, kind: 'verify', verified: !row.verified })}
                      aria-label={`${row.verified ? t.actUnverify : t.actVerify} ${name}`} className="k-chip">
                      {row.verified ? t.actUnverify : t.actVerify}
                    </button>
                    <button onClick={() => startAction({ id: row.id, kind: 'note' })}
                      aria-label={`${t.actNote} ${name}`} className="k-chip">{t.actNote}</button>
                  </div>
                </div>

                {pending?.id === row.id && (
                  <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-kinnso-edge pt-3">
                    {pending.kind === 'status' && pending.status === 'banned' ? <p className="w-full text-sm text-red-600">{t.confirmBan}</p> : null}
                    {pending.kind === 'reinstate' ? <p className="w-full text-sm text-kinnso-ink">{t.confirmReinstate}</p> : null}
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

      {data.nextCursor && (
        <div className="mt-6 flex justify-center">
          <button
            onClick={() => setQuery((sp) => { sp.set('cursor_at', data.nextCursor!.createdAt); sp.set('cursor_id', data.nextCursor!.id) })}
            className="rounded-full border border-kinnso-edge px-5 py-2.5 text-sm font-bold text-kinnso-ink">{t.dirLoadMore}</button>
        </div>
      )}
    </main>
  )
}

export default CreatorsDirectoryView
