'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { Messages } from '@/lib/i18n/messages/en'
import type { Locale } from '@/lib/i18n/config'
import type { CreatorDetail } from '@/lib/admin/creators-queries'
import type { AuditEntry } from '@/lib/admin/audit'
import type { ActionResult } from '@/lib/admin/result'
import type { CreatorStatus } from '@/lib/admin/creators-validation'
import { StatusBadge, TierBadge, VerifiedBadge } from '@/components/kinnso/admin/creators/badges'
import { ProfileDnaTab } from '@/components/kinnso/admin/creators/detail/ProfileDnaTab'
import { MissionsTab } from '@/components/kinnso/admin/creators/detail/MissionsTab'
import { EarningsTab } from '@/components/kinnso/admin/creators/detail/EarningsTab'
import { ContentTab } from '@/components/kinnso/admin/creators/detail/ContentTab'
import { ModerationTab } from '@/components/kinnso/admin/creators/detail/ModerationTab'

type T = Messages['creators']

export interface CreatorDetailActions {
  setCreatorStatus: (locale: Locale, id: string, status: CreatorStatus, reason: string) => Promise<ActionResult<{ id: string; status: CreatorStatus }>>
  reinstateCreator: (locale: Locale, id: string, reason: string) => Promise<ActionResult<{ id: string; status: 'active' }>>
  setCreatorVerified: (locale: Locale, id: string, verified: boolean, reason: string) => Promise<ActionResult<{ id: string; verified: boolean }>>
  setCreatorListed: (locale: Locale, id: string, isListed: boolean, reason: string) => Promise<ActionResult<{ id: string; isListed: boolean }>>
  addCreatorNote: (locale: Locale, id: string, note: string) => Promise<ActionResult<{ id: string }>>
}

type TabKey = 'profile' | 'missions' | 'earnings' | 'content' | 'moderation'
type Pending =
  | { kind: 'status'; status: CreatorStatus }
  | { kind: 'reinstate' }
  | { kind: 'verify'; verified: boolean }
  | { kind: 'listing'; isListed: boolean }
  | null

const day = (s: string) => s.slice(0, 10)

export function CreatorDetailView({
  t, locale, detail, audit, actions,
}: { t: T; locale: Locale; detail: CreatorDetail; audit: AuditEntry[]; actions: CreatorDetailActions }) {
  const router = useRouter()
  const { creator } = detail
  const [tab, setTab] = useState<TabKey>('profile')
  const [pending, setPending] = useState<Pending>(null)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const [noteError, setNoteError] = useState<string | null>(null)

  const firstError = (r: ActionResult<Record<string, unknown>>): string =>
    (!r.ok && Object.values(r.errors)[0]?.[0]) || t.actionFailed

  function start(p: Exclude<Pending, null>) { setPending(p); setReason(''); setError(null) }
  function cancel() { setPending(null); setReason(''); setError(null) }

  async function apply() {
    if (!pending) return
    setBusy(true); setError(null)
    let res: ActionResult<Record<string, unknown>>
    if (pending.kind === 'status') res = await actions.setCreatorStatus(locale, creator.id, pending.status, reason)
    else if (pending.kind === 'reinstate') res = await actions.reinstateCreator(locale, creator.id, reason)
    else if (pending.kind === 'verify') res = await actions.setCreatorVerified(locale, creator.id, pending.verified, reason)
    else res = await actions.setCreatorListed(locale, creator.id, pending.isListed, reason)
    setBusy(false)
    if (res.ok) { cancel(); router.refresh() }
    else setError(firstError(res))
  }

  async function saveNote() {
    setNoteError(null); setBusy(true)
    const res = await actions.addCreatorNote(locale, creator.id, note)
    setBusy(false)
    if (res.ok) { setNote(''); router.refresh() }
    else setNoteError(firstError(res))
  }

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'profile', label: t.tabProfile },
    { key: 'missions', label: t.tabMissions },
    { key: 'earnings', label: t.tabEarnings },
    { key: 'content', label: t.tabContent },
    { key: 'moderation', label: t.tabModeration },
  ]

  const btn = 'rounded-lg border border-kinnso-edge px-3 py-1.5 text-sm font-bold text-kinnso-ink hover:bg-kinnso-cream2 disabled:opacity-50'

  return (
    <main>
      <Link href={`/${locale}/admin/creators/directory`} className="text-sm font-bold text-kinnso-muted hover:text-kinnso-ink">
        ← {t.detailBack}
      </Link>

      <header className="mt-3 flex flex-wrap items-center gap-3">
        <h1 className="k-display">{creator.displayName ?? creator.handle ?? creator.id}</h1>
        {creator.handle ? <span className="text-kinnso-muted">@{creator.handle}</span> : null}
        <StatusBadge status={creator.status} t={t} />
        {detail.contribution ? <TierBadge tier={detail.contribution.tier} t={t} /> : null}
        <VerifiedBadge verified={creator.verified} t={t} />
        <span className="text-sm text-kinnso-muted">{t.detailJoined} {day(creator.createdAt)}</span>
      </header>

      <div className="mt-4 flex flex-wrap gap-2">
        {(creator.status === 'onboarding' || creator.status === 'suspended') && (
          <button type="button" className={btn} onClick={() => start({ kind: 'status', status: 'active' })}>{t.actActivate}</button>
        )}
        {creator.status === 'active' && (
          <button type="button" className={btn} onClick={() => start({ kind: 'status', status: 'suspended' })}>{t.actSuspend}</button>
        )}
        {(creator.status === 'active' || creator.status === 'suspended') && (
          <button type="button" className={btn} onClick={() => start({ kind: 'status', status: 'banned' })}>{t.actBan}</button>
        )}
        {creator.status === 'banned' && (
          <button type="button" className={btn} onClick={() => start({ kind: 'reinstate' })}>{t.actReinstate}</button>
        )}
        <button type="button" className={btn} onClick={() => start({ kind: 'verify', verified: !creator.verified })}>
          {creator.verified ? t.actUnverify : t.actVerify}
        </button>
      </div>

      {pending && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-kinnso-edge bg-kinnso-cream2 p-3">
          <input
            className="min-w-[16rem] flex-1 rounded-lg border border-kinnso-edge px-3 py-1.5 text-sm"
            placeholder={t.reasonPlaceholder} value={reason} onChange={(e) => setReason(e.target.value)}
          />
          <button type="button" className={btn} disabled={busy || reason.trim() === ''} onClick={apply}>{t.actApply}</button>
          <button type="button" className={btn} disabled={busy} onClick={cancel}>{t.actCancel}</button>
          {error ? <p className="w-full text-sm text-red-700">{error}</p> : null}
        </div>
      )}

      <nav className="mt-6 flex gap-2 border-b border-kinnso-edge">
        {tabs.map((x) => (
          <button
            key={x.key} type="button" aria-current={tab === x.key ? 'page' : undefined}
            onClick={() => setTab(x.key)}
            className={`px-3 py-2 text-sm font-bold ${tab === x.key ? 'border-b-2 border-kinnso-orange text-kinnso-orange' : 'text-kinnso-muted hover:text-kinnso-ink'}`}
          >{x.label}</button>
        ))}
      </nav>

      <div className="mt-6">
        {tab === 'profile' && <ProfileDnaTab t={t} detail={detail} />}
        {tab === 'missions' && <MissionsTab t={t} missions={detail.missions} />}
        {tab === 'earnings' && <EarningsTab t={t} contribution={detail.contribution} settlements={detail.settlements} pointsEvents={detail.pointsEvents} />}
        {tab === 'content' && <ContentTab t={t} content={detail.content} />}
        {tab === 'moderation' && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-kinnso-edge p-3">
              <p className="text-sm font-bold text-kinnso-ink">
                {creator.isListed ? t.listingOverrideOn : t.listingGuideBased}
              </p>
              <button type="button" className={btn} onClick={() => start({ kind: 'listing', isListed: !creator.isListed })}>
                {creator.isListed ? t.actRemoveListingOverride : t.actListCreator}
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                className="min-w-[16rem] flex-1 rounded-lg border border-kinnso-edge px-3 py-1.5 text-sm"
                placeholder={t.notePlaceholder} value={note} onChange={(e) => setNote(e.target.value)}
              />
              <button type="button" className={btn} disabled={busy || note.trim() === ''} onClick={saveNote}>{t.saveNote}</button>
              {noteError ? <p className="w-full text-sm text-red-700">{noteError}</p> : null}
            </div>
            <ModerationTab t={t} entries={audit} />
          </div>
        )}
      </div>
    </main>
  )
}

export default CreatorDetailView
