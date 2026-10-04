'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { Messages } from '@/lib/i18n/messages/en'
import type { Locale } from '@/lib/i18n/config'
import type { MerchantDetail, OpsMerchantBudget } from '@/lib/admin/merchants-queries'
import type { AuditEntry } from '@/lib/admin/audit'
import type { ActionResult } from '@/lib/admin/result'
import type { MerchantStatus, MerchantTier } from '@/lib/admin/merchants-validation'
import { MerchantStatusBadge, MerchantTierBadge } from '@/components/kinnso/admin/merchants/badges'
import { ProfileTab } from '@/components/kinnso/admin/merchants/detail/ProfileTab'
import { MissionsTab } from '@/components/kinnso/admin/merchants/detail/MissionsTab'
import { CreatorsTab } from '@/components/kinnso/admin/merchants/detail/CreatorsTab'
import { BillingTab } from '@/components/kinnso/admin/merchants/detail/BillingTab'
import { ModerationTab } from '@/components/kinnso/admin/merchants/detail/ModerationTab'
import { MerchantBudgetPanel, type CreditFn, type EnforceFn } from '@/components/kinnso/admin/merchants/MerchantBudgetPanel'

type T = Messages['merchantsOps']

export interface MerchantDetailActions {
  setMerchantStatus: (locale: Locale, id: string, status: MerchantStatus, reason: string) => Promise<ActionResult<{ id: string; status: MerchantStatus }>>
  setMerchantTier: (locale: Locale, id: string, tier: MerchantTier, reason: string) => Promise<ActionResult<{ id: string; tier: MerchantTier }>>
  addMerchantNote: (locale: Locale, id: string, note: string) => Promise<ActionResult<{ id: string }>>
}

export interface MerchantBudgetActions {
  credit: CreditFn
  enforce: EnforceFn
}

type TabKey = 'profile' | 'missions' | 'creators' | 'billing' | 'moderation'
type Pending = { kind: 'status'; status: MerchantStatus } | { kind: 'tier'; tier: MerchantTier } | null

const day = (s: string) => s.slice(0, 10)

export function MerchantDetailView({
  t, locale, detail, audit, actions, budget, budgetActions,
}: { t: T; locale: Locale; detail: MerchantDetail; audit: AuditEntry[]; actions: MerchantDetailActions; budget: OpsMerchantBudget | null; budgetActions: MerchantBudgetActions }) {
  const router = useRouter()
  const { profile } = detail
  const [tab, setTab] = useState<TabKey>('profile')
  const [pending, setPending] = useState<Pending>(null)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const [noteError, setNoteError] = useState<string | null>(null)

  function firstError(r: ActionResult<Record<string, unknown>>): string {
    if (r.ok) return t.actionFailed
    return Object.values(r.errors)[0]?.[0] ?? t.actionFailed
  }

  function start(p: NonNullable<Pending>) { setPending(p); setReason(''); setError(null) }
  function cancel() { setPending(null); setReason(''); setError(null) }

  async function apply() {
    if (!pending) return
    setBusy(true)
    setError(null)
    let res: ActionResult<Record<string, unknown>>
    if (pending.kind === 'status') {
      res = await actions.setMerchantStatus(locale, profile.id, pending.status, reason)
    } else {
      res = await actions.setMerchantTier(locale, profile.id, pending.tier, reason)
    }
    setBusy(false)
    if (res.ok) {
      cancel()
      router.refresh()
    } else {
      setError(firstError(res))
    }
  }

  async function saveNote() {
    setNoteError(null)
    const res = await actions.addMerchantNote(locale, profile.id, note)
    if (res.ok) {
      setNote('')
      router.refresh()
    } else {
      setNoteError(firstError(res))
    }
  }

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'profile', label: t.tabProfile },
    { key: 'missions', label: t.tabMissions },
    { key: 'creators', label: t.tabCreators },
    { key: 'billing', label: t.tabBilling },
    { key: 'moderation', label: t.tabModeration },
  ]

  const btn = 'rounded-lg border border-kinnso-edge px-3 py-1.5 text-sm font-bold text-kinnso-ink hover:bg-kinnso-cream2 disabled:opacity-50'

  return (
    <main>
      <Link href={`/${locale}/admin/merchants/directory`} className="text-sm font-bold text-kinnso-muted hover:text-kinnso-ink">
        ← {t.detailBack}
      </Link>

      <header className="mt-3 flex flex-wrap items-center gap-3">
        <h1 className="k-display">{profile.companyName}</h1>
        <MerchantStatusBadge status={profile.status} t={t} />
        <MerchantTierBadge tier={profile.tier} t={t} />
        <span className="text-sm text-kinnso-muted">{t.detailJoined} {day(profile.createdAt)}</span>
      </header>

      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" className={btn} onClick={() => start({ kind: 'status', status: profile.status as MerchantStatus })}>{t.actSetStatus}</button>
        <button type="button" className={btn} onClick={() => start({ kind: 'tier', tier: profile.tier as MerchantTier })}>{t.actSetTier}</button>
      </div>

      {pending && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-kinnso-edge bg-kinnso-cream2 p-3">
          {pending.kind === 'status' ? (
            <>
              {pending.status === 'archived' ? <p className="w-full text-sm text-red-600">{t.confirmArchive}</p> : null}
              <select value={pending.status} onChange={(e) => setPending({ kind: 'status', status: e.target.value as MerchantStatus })}
                className="rounded-lg border border-kinnso-edge px-3 py-1.5 text-sm font-bold text-kinnso-ink">
                <option value="active">{t.statusActive}</option>
                <option value="paused">{t.statusPaused}</option>
                <option value="suspended">{t.statusSuspended}</option>
                <option value="archived">{t.statusArchived}</option>
              </select>
            </>
          ) : (
            <select value={pending.tier} onChange={(e) => setPending({ kind: 'tier', tier: e.target.value as MerchantTier })}
              className="rounded-lg border border-kinnso-edge px-3 py-1.5 text-sm font-bold text-kinnso-ink">
              <option value="free">{t.tierFree}</option>
              <option value="growth">{t.tierGrowth}</option>
            </select>
          )}
          <input className="min-w-[16rem] flex-1 rounded-lg border border-kinnso-edge px-3 py-1.5 text-sm"
            placeholder={t.reasonPlaceholder} value={reason} onChange={(e) => setReason(e.target.value)} />
          <button type="button" className={btn} disabled={busy || reason.trim() === ''} onClick={apply}>{t.actApply}</button>
          <button type="button" className={btn} disabled={busy} onClick={cancel}>{t.actCancel}</button>
          {error ? <p className="w-full text-sm text-red-700">{error}</p> : null}
        </div>
      )}

      <nav className="mt-6 flex gap-2 border-b border-kinnso-edge">
        {tabs.map((x) => (
          <button key={x.key} type="button" aria-current={tab === x.key ? 'page' : undefined}
            onClick={() => setTab(x.key)}
            className={`px-3 py-2 text-sm font-bold ${tab === x.key ? 'border-b-2 border-kinnso-orange text-kinnso-orange' : 'text-kinnso-muted hover:text-kinnso-ink'}`}
          >{x.label}</button>
        ))}
      </nav>

      <div className="mt-6">
        {tab === 'profile' && <ProfileTab t={t} profile={detail.profile} />}
        {tab === 'missions' && <MissionsTab t={t} missions={detail.missions} />}
        {tab === 'creators' && <CreatorsTab t={t} creators={detail.creators} />}
        {tab === 'billing' && <BillingTab t={t} billing={detail.billing} />}
        {tab === 'moderation' && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <input className="min-w-[16rem] flex-1 rounded-lg border border-kinnso-edge px-3 py-1.5 text-sm"
                placeholder={t.notePlaceholder} value={note} onChange={(e) => setNote(e.target.value)} />
              <button type="button" className={btn} disabled={note.trim() === ''} onClick={saveNote}>{t.saveNote}</button>
              {noteError ? <p className="w-full text-sm text-red-700">{noteError}</p> : null}
            </div>
            <ModerationTab t={t} entries={audit} />
          </div>
        )}
      </div>

      <MerchantBudgetPanel
        t={t}
        locale={locale}
        merchantId={profile.id}
        budget={budget}
        credit={budgetActions.credit}
        enforce={budgetActions.enforce}
      />
    </main>
  )
}

export default MerchantDetailView
