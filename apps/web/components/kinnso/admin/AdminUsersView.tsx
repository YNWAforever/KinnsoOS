'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { Messages } from '@/lib/i18n/messages/en'
import type { Locale } from '@/lib/i18n/config'
import type { AdminUsers } from '@/lib/admin/users-queries'
import type { ActionResult } from '@/lib/admin/result'
import type { UserKind, UserStatus } from '@/lib/admin/users-actions'
import { TicketCard } from '@/components/kinnso/MarketPassport'

type T = Messages['users']
type SetStatus = (kind: UserKind, id: string, status: UserStatus) => Promise<ActionResult<{ id: string; status: UserStatus }>>
type Row = { id: string; name: string; status: string; joined: string }

function statusLabel(t: T, status: string): string {
  switch (status) {
    case 'active': return t.statusActive
    case 'suspended': return t.statusSuspended
    case 'onboarding': return t.statusOnboarding
    case 'paused': return t.statusPaused
    case 'archived': return t.statusArchived
    default: return status
  }
}

function UserSection({ t, locale, heading, kind, rows, onSetStatus }: {
  t: T; locale: Locale; heading: string; kind: UserKind; rows: Row[]; onSetStatus: SetStatus
}) {
  const router = useRouter()
  const [items, setItems] = useState(rows)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})

  async function toggle(row: Row) {
    const next: UserStatus = row.status === 'suspended' ? 'active' : 'suspended'
    setBusyId(row.id)
    setErrors((e) => ({ ...e, [row.id]: '' }))
    const res = await onSetStatus(kind, row.id, next)
    setBusyId(null)
    if (res.ok) {
      setItems((list) => list.map((r) => (r.id === row.id ? { ...r, status: res.status } : r)))
      router.refresh() // reconcile the optimistic flip with the revalidated server truth
    } else {
      setErrors((e) => ({ ...e, [row.id]: res.errors.form?.[0] ?? t.errorGeneric }))
    }
  }

  return (
    <section className="mt-8">
      <h2 className="text-lg font-bold text-kinnso-ink">{heading}</h2>
      {items.length === 0 ? (
        <p className="mt-3 text-kinnso-muted">{t.empty}</p>
      ) : (
        <div className="mt-3 grid gap-3">
          {items.map((row) => {
            const suspended = row.status === 'suspended'
            return (
              <TicketCard key={row.id} className="flex items-center justify-between p-4">
                <div>
                  <p className="font-bold text-kinnso-ink">{row.name}</p>
                  <p className="text-sm text-kinnso-muted">
                    <span className={suspended ? 'font-bold text-red-600' : 'font-bold text-kinnso-orange'}>
                      {statusLabel(t, row.status)}
                    </span>
                    {' · '}{t.joined} {new Date(row.joined).toLocaleDateString(locale, { timeZone: 'UTC' })}
                  </p>
                  {errors[row.id] ? <p className="mt-1 text-sm text-red-600">{errors[row.id]}</p> : null}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => toggle(row)}
                    disabled={busyId === row.id}
                    aria-busy={busyId === row.id}
                    aria-label={`${suspended ? t.activate : t.suspend} ${row.name}`}
                    className="rounded-full border border-kinnso-edge px-4 py-2 text-sm font-bold text-kinnso-ink disabled:opacity-50"
                  >
                    {suspended ? t.activate : t.suspend}
                  </button>
                </div>
              </TicketCard>
            )
          })}
        </div>
      )}
    </section>
  )
}

export function AdminUsersView({ t, locale, users, onSetStatus }: {
  t: T; locale: Locale; users: AdminUsers; onSetStatus: SetStatus
}) {
  return (
    <main>
      <h1 className="k-display">{t.title}</h1>
      <p className="mt-2 text-kinnso-muted">{t.subtitle}</p>
      <UserSection t={t} locale={locale} heading={t.sectionCreators} kind="creator"
        rows={users.creators.map((c) => ({ id: c.id, name: c.display_name || c.handle || t.unnamed, status: c.status, joined: c.created_at }))}
        onSetStatus={onSetStatus} />
      <section className="mt-8">
        <h2 className="text-lg font-bold text-kinnso-ink">{t.sectionMerchants}</h2>
        {users.merchants.length === 0 ? (
          <p className="mt-3 text-kinnso-muted">{t.empty}</p>
        ) : (
          <div className="mt-3 grid gap-3">
            {users.merchants.map((m) => (
              <TicketCard key={m.id} className="flex items-center justify-between p-4">
                <div>
                  <Link href={`/${locale}/admin/merchants/${m.id}`} className="font-bold text-kinnso-ink hover:text-kinnso-orange hover:underline">
                    {m.company_name}
                  </Link>
                  <p className="text-sm text-kinnso-muted">
                    {statusLabel(t, m.status)}{' · '}{t.joined} {new Date(m.created_at).toLocaleDateString(locale, { timeZone: 'UTC' })}
                  </p>
                </div>
                <Link href={`/${locale}/admin/merchants/${m.id}`} className="rounded-full border border-kinnso-edge px-4 py-2 text-sm font-bold text-kinnso-ink">
                  {t.manageInConsole}
                </Link>
              </TicketCard>
            ))}
          </div>
        )}
      </section>
      <UserSection t={t} locale={locale} heading={t.sectionOps} kind="ops"
        rows={users.ops.map((o) => ({ id: o.id, name: o.display_name, status: o.status, joined: o.created_at }))}
        onSetStatus={onSetStatus} />
    </main>
  )
}

export default AdminUsersView
