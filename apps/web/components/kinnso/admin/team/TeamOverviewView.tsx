'use client'
import Link from 'next/link'
import { useState } from 'react'
import { KpiCard } from '@/components/kinnso/admin/KpiCard'
import type { Messages } from '@/lib/i18n/messages/en'
import type { Locale } from '@/lib/i18n/config'
import type { TeamOverview } from '@/lib/admin/team-queries'
import type { ActionResult } from '@/lib/admin/result'

const ROLES = ['owner', 'admin', 'moderator', 'analyst'] as const

export function TeamOverviewView({ t, locale, overview, onInvite }: {
  t: Messages['team']
  locale: Locale
  overview: TeamOverview
  onInvite: (locale: Locale, email: string, role: string) => Promise<ActionResult<{ token: string }>>
}) {
  const roleLabel: Record<string, string> = {
    owner: t.roleOwner, admin: t.roleAdmin, moderator: t.roleModerator, analyst: t.roleAnalyst,
  }
  const [email, setEmail]   = useState('')
  const [role, setRole]     = useState<string>('analyst')
  const [copied, setCopied] = useState(false)
  const [err, setErr]       = useState<string | null>(null)

  async function handleGenerate() {
    setErr(null); setCopied(false)
    const res = await onInvite(locale, email, role)
    if (!res.ok) { setErr(res.errors.form?.[0] ?? 'An unexpected error occurred.'); return }
    const url = `${window.location.origin}/${locale}/ops/accept-invite?token=${res.token}`
    await navigator.clipboard.writeText(url)
    setCopied(true)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-kinnso-ink">{t.overviewTitle}</h1>
        <p className="text-sm text-kinnso-muted">{t.overviewSubtitle}</p>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <KpiCard label={t.kpiMembers}  value={overview.members.length} />
        <KpiCard label={t.kpiPending}  value={overview.pendingInvites} />
        {ROLES.map((r) => (
          <KpiCard key={r} label={roleLabel[r]} value={overview.byRole[r] ?? 0} />
        ))}
      </div>

      <div className="space-y-3 rounded-xl border border-kinnso-edge p-4">
        <h2 className="text-sm font-bold text-kinnso-ink">{t.invitePanelTitle}</h2>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t.inviteEmailLabel}
            className="flex-1 rounded-lg border border-kinnso-edge px-3 py-2 text-sm"
          />
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="rounded-lg border border-kinnso-edge px-3 py-2 text-sm"
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>{roleLabel[r]}</option>
            ))}
          </select>
          <button
            onClick={handleGenerate}
            className="rounded-lg bg-kinnso-orange px-4 py-2 text-sm font-bold text-white hover:opacity-90"
          >
            {copied ? t.inviteCopied : t.inviteGenerate}
          </button>
        </div>
        {err && <p className="text-xs text-red-600">{err}</p>}
        <p className="text-xs text-kinnso-muted">{t.inviteExpiry}</p>
      </div>

      <div>
        <Link href={`/${locale}/admin/team/directory`} className="text-sm font-semibold text-kinnso-orange hover:underline">
          {t.directoryTitle} →
        </Link>
      </div>
    </div>
  )
}
