'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { TicketCard } from '@/components/kinnso/MarketPassport'
import { SessionForm } from '@/components/kinnso/pages/SessionForm'
import type { ActionResult } from '@/lib/admin/result'
import type { AdminSession, SessionRsvp } from '@/lib/admin/sessions-queries'
import type { SessionInput, SessionType } from '@/lib/sessions/types'
import { canGoLive } from '@/lib/sessions/validation'
import type { Messages } from '@/lib/i18n/messages/en'

type MutateResult = ActionResult<{ id: string }>
type T = Messages['sessionsAdmin']

export function AdminSessionsView({
  t, sessions, creators, onCreate, onUpdate, onSetStatus, onDelete, onListRsvps,
}: {
  t: T
  sessions: AdminSession[]
  creators: { id: string; handle: string | null; displayName: string | null }[]
  onCreate: (hostCreatorId: string, input: SessionInput) => Promise<ActionResult<{ id: string; slug: string }>>
  onUpdate: (id: string, input: SessionInput) => Promise<MutateResult>
  onSetStatus: (id: string, status: 'live' | 'ended' | 'cancelled') => Promise<MutateResult>
  onDelete: (id: string) => Promise<MutateResult>
  onListRsvps: (id: string) => Promise<{ ok: boolean; rsvps: SessionRsvp[] }>
}) {
  const router = useRouter()
  const [editing, setEditing] = useState<AdminSession | 'new' | null>(null)
  const [hostId, setHostId] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({})
  const [rsvpsBySession, setRsvpsBySession] = useState<Record<string, SessionRsvp[]>>({})

  const typeLabel: Record<SessionType, string> = {
    destination_briefing: t.typeDestinationBriefing, ask_a_creator: t.typeAskACreator,
    merchant_spotlight: t.typeMerchantSpotlight, new_creator_intro: t.typeNewCreatorIntro,
  }
  const statusLabel: Record<AdminSession['status'], string> = {
    scheduled: t.statusScheduled, live: t.statusLive, ended: t.statusEnded, cancelled: t.statusCancelled,
  }

  async function mutate(id: string, run: () => Promise<MutateResult>, fallback: string) {
    setBusyId(id)
    setRowErrors((e) => ({ ...e, [id]: '' }))
    try {
      const res = await run()
      if (res.ok) router.refresh()
      else setRowErrors((e) => ({ ...e, [id]: res.errors.form?.[0] ?? fallback }))
    } catch {
      setRowErrors((e) => ({ ...e, [id]: fallback }))
    } finally {
      setBusyId(null)
    }
  }

  async function toggleRsvps(id: string) {
    if (rsvpsBySession[id]) {
      setRsvpsBySession((r) => { const next = { ...r }; delete next[id]; return next })
      return
    }
    const result = await onListRsvps(id)
    if (result.ok) setRsvpsBySession((r) => ({ ...r, [id]: result.rsvps }))
  }

  if (editing !== null) {
    const current = editing === 'new' ? null : editing
    return (
      <main>
        <h1 className="k-display">{current ? t.formEditTitle : t.formNewTitle}</h1>
        <div className="mt-6 max-w-2xl">
          <SessionForm
            t={t}
            typeLabel={typeLabel}
            initial={current ? {
              title: current.title, description: current.description, type: current.type as SessionType,
              startsAt: current.starts_at, durationMinutes: String(current.duration_minutes),
              embedUrl: current.embed_url ?? '', replayUrl: current.replay_url ?? '',
              destinationTags: (current.destination_tags ?? []).join(', '),
            } : null}
            hostPicker={current ? undefined : { creators, value: hostId, onChange: setHostId }}
            onSave={(input) => (current ? onUpdate(current.id, input) : onCreate(hostId, input))}
            onDoneHref="."
          />
        </div>
        <button type="button" onClick={() => setEditing(null)} className="mt-4 text-sm font-bold text-kinnso-ink">
          {t.formCancel}
        </button>
      </main>
    )
  }

  return (
    <main>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="k-display">{t.title}</h1>
          <p className="mt-2 text-kinnso-muted">{t.subtitle}</p>
        </div>
        <button onClick={() => { setHostId(''); setEditing('new') }} className="rounded-full bg-kinnso-orange px-5 py-2 font-bold text-white">
          {t.newCta}
        </button>
      </div>
      {sessions.length === 0 ? (
        <p className="mt-8 text-kinnso-muted">{t.empty}</p>
      ) : (
        <div className="mt-8 grid gap-4">
          {sessions.map((s) => (
            <TicketCard key={s.id} className="p-5">
              <p className="text-kinnso-ink">{s.title}</p>
              <p className="mt-1 text-sm text-kinnso-muted">
                {typeLabel[s.type as SessionType]} · {statusLabel[s.status as AdminSession['status']]} · {new Date(s.starts_at).toLocaleString()}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-4 text-sm font-bold">
                <button className="text-kinnso-ink hover:text-kinnso-orange" onClick={() => setEditing(s)}>{t.actEdit}</button>
                {s.status === 'scheduled' && canGoLive({ embedUrl: s.embed_url }) ? (
                  <button disabled={busyId === s.id} className="text-kinnso-ink hover:text-kinnso-orange" onClick={() => mutate(s.id, () => onSetStatus(s.id, 'live'), t.actGoLive)}>
                    {t.actGoLive}
                  </button>
                ) : null}
                {s.status === 'live' ? (
                  <button disabled={busyId === s.id} className="text-kinnso-ink hover:text-kinnso-orange" onClick={() => mutate(s.id, () => onSetStatus(s.id, 'ended'), t.actEnd)}>
                    {t.actEnd}
                  </button>
                ) : null}
                {s.status !== 'ended' && s.status !== 'cancelled' ? (
                  <button disabled={busyId === s.id} className="text-kinnso-ink hover:text-kinnso-orange" onClick={() => mutate(s.id, () => onSetStatus(s.id, 'cancelled'), t.actCancel)}>
                    {t.actCancel}
                  </button>
                ) : null}
                <button className="text-kinnso-ink hover:text-kinnso-orange" onClick={() => toggleRsvps(s.id)}>{t.actViewRsvps}</button>
                <button
                  disabled={busyId === s.id}
                  className="text-kinnso-ink hover:text-kinnso-orange"
                  onClick={() => { if (window.confirm(t.deleteConfirm)) void mutate(s.id, () => onDelete(s.id), t.actDelete) }}
                >
                  {t.actDelete}
                </button>
              </div>
              {rowErrors[s.id] ? <p className="mt-2 text-sm text-red-600">{rowErrors[s.id]}</p> : null}
              {rsvpsBySession[s.id] ? (
                <ul className="mt-3 rounded-lg bg-kinnso-cream2 p-3 text-sm text-kinnso-ink">
                  {rsvpsBySession[s.id].length === 0
                    ? <li>{t.rsvpsEmpty}</li>
                    : rsvpsBySession[s.id].map((r) => <li key={r.id}>{r.email}</li>)}
                </ul>
              ) : null}
            </TicketCard>
          ))}
        </div>
      )}
    </main>
  )
}

export default AdminSessionsView
