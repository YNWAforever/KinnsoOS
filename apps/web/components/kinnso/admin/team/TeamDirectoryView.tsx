'use client'
import { useState } from 'react'
import type { Messages } from '@/lib/i18n/messages/en'
import type { Locale } from '@/lib/i18n/config'
import type { MemberRow } from '@/lib/admin/team-queries'
import type { ActionFailure } from '@/lib/admin/result'

type Void = { ok: true } | ActionFailure

export function TeamDirectoryView({ t, locale, members, onSetRole, onSuspend, onReactivate }: {
  t: Messages['team']
  locale: Locale
  members: MemberRow[]
  onSetRole:     (locale: Locale, memberId: string, role: string, reason: string) => Promise<Void>
  onSuspend:     (locale: Locale, memberId: string, reason: string) => Promise<Void>
  onReactivate:  (locale: Locale, memberId: string, reason: string) => Promise<Void>
}) {
  const roleLabel: Record<string, string> = {
    owner: t.roleOwner, admin: t.roleAdmin, moderator: t.roleModerator, analyst: t.roleAnalyst,
  }
  const statusLabel: Record<string, string> = {
    active: t.statusActive, suspended: t.statusSuspended,
  }
  const roleBadgeClass: Record<string, string> = {
    owner:     'bg-amber-100 text-amber-700',
    admin:     'bg-blue-100 text-blue-700',
    moderator: 'bg-purple-100 text-purple-700',
    analyst:   'bg-gray-100 text-gray-700',
  }
  const ROLES = ['owner', 'admin', 'moderator', 'analyst'] as const
  const [pendingRole,    setPendingRole]    = useState<{ id: string; role: string } | null>(null)
  const [pendingSuspend, setPendingSuspend] = useState<string | null>(null)
  const [reason, setReason]                 = useState('')
  const [err, setErr]                       = useState<string | null>(null)

  async function confirmRoleChange() {
    if (!pendingRole) return
    setErr(null)
    const res = await onSetRole(locale, pendingRole.id, pendingRole.role, reason)
    if (!res.ok) { setErr(res.errors.form?.[0] ?? 'An unexpected error occurred.'); return }
    setPendingRole(null); setReason('')
  }
  async function confirmSuspend() {
    if (!pendingSuspend) return
    setErr(null)
    const res = await onSuspend(locale, pendingSuspend, reason)
    if (!res.ok) { setErr(res.errors.form?.[0] ?? 'An unexpected error occurred.'); return }
    setPendingSuspend(null); setReason('')
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold text-kinnso-ink">{t.directoryTitle}</h2>
      <div className="overflow-x-auto rounded-xl border border-kinnso-edge">
        <table className="min-w-full divide-y divide-kinnso-edge text-sm">
          <thead className="bg-kinnso-cream2">
            <tr>
              {[t.colName, t.colRole, t.colStatus, t.colJoined, ''].map((h, i) => (
                <th key={i} className="px-4 py-3 text-left text-xs font-semibold text-kinnso-muted uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-kinnso-edge bg-white">
            {members.map((m) => (
              <tr key={m.id}>
                <td className="px-4 py-3 font-medium text-kinnso-ink">{m.displayName}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${roleBadgeClass[m.role] ?? 'bg-gray-100 text-gray-700'}`}>
                    {roleLabel[m.role] ?? m.role}
                  </span>
                </td>
                <td className="px-4 py-3 text-kinnso-muted">{statusLabel[m.status] ?? m.status}</td>
                <td className="px-4 py-3 text-kinnso-muted">{m.joinedAt.slice(0, 10)}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <select
                      aria-label={`${t.actionSetRole} ${m.displayName}`}
                      defaultValue=""
                      onChange={(e) => {
                        if (e.target.value) {
                          setPendingRole({ id: m.id, role: e.target.value })
                          setReason(''); setErr(null)
                          e.target.value = ''
                        }
                      }}
                      className="rounded border border-kinnso-edge px-2 py-1 text-xs"
                    >
                      <option value="" disabled>{t.actionSetRole}</option>
                      {ROLES.map((r) => <option key={r} value={r}>{roleLabel[r]}</option>)}
                    </select>
                    {m.status === 'active' ? (
                      <button
                        onClick={() => { setPendingSuspend(m.id); setReason(''); setErr(null) }}
                        className="rounded px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50"
                      >
                        {t.actionSuspend}
                      </button>
                    ) : (
                      <button
                        onClick={() => onReactivate(locale, m.id, 'Reactivated by owner')}
                        className="rounded px-2 py-1 text-xs font-semibold text-green-700 hover:bg-green-50"
                      >
                        {t.actionReactivate}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pendingRole && (
        <div className="space-y-2 rounded-xl border border-kinnso-edge p-4">
          <p className="text-sm font-semibold">{t.actionSetRole}: {roleLabel[pendingRole.role]}</p>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t.reasonPlaceholder}
            className="w-full rounded border border-kinnso-edge px-3 py-2 text-sm"
          />
          {err && <p className="text-xs text-red-600">{err}</p>}
          <div className="flex gap-2">
            <button onClick={confirmRoleChange} className="rounded bg-kinnso-orange px-3 py-1.5 text-xs font-bold text-white">
              {t.actionConfirm}
            </button>
            <button onClick={() => { setPendingRole(null); setErr(null) }} className="rounded border px-3 py-1.5 text-xs">
              {t.actionCancel}
            </button>
          </div>
        </div>
      )}

      {pendingSuspend && (
        <div className="space-y-2 rounded-xl border border-kinnso-edge p-4">
          <p className="text-sm font-semibold">{t.actionSuspend}</p>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t.reasonPlaceholder}
            className="w-full rounded border border-kinnso-edge px-3 py-2 text-sm"
          />
          {err && <p className="text-xs text-red-600">{err}</p>}
          <div className="flex gap-2">
            <button onClick={confirmSuspend} className="rounded bg-red-600 px-3 py-1.5 text-xs font-bold text-white">
              {t.actionConfirm}
            </button>
            <button onClick={() => { setPendingSuspend(null); setErr(null) }} className="rounded border px-3 py-1.5 text-xs">
              {t.actionCancel}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
