'use client'
import Link from 'next/link'
import { useTransition } from 'react'
import type { NotificationRow } from '@/lib/notifications/queries'
import type { ActionResult } from '@/lib/admin/result'
import type { Messages } from '@/lib/i18n/messages/en'
import type { Locale } from '@/lib/i18n/config'

type T = Messages['notifications']
type MarkReadFn = (locale: Locale, id: string) => Promise<ActionResult<{ id: string }>>

/** Every entity_type this phase's triggers write, mapped to where a click should land.
 *  Settlements and payout batches aren't individually routable -- both render on the
 *  earnings page, so both point there. */
function targetHref(locale: Locale, entityType: string, entityId: string): string {
  if (entityType === 'mission') return `/${locale}/studio/missions/${entityId}`
  return `/${locale}/studio/earnings`
}

function interpolate(template: string, payload: Record<string, unknown>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => String(payload[key] ?? ''))
}

function NotificationRowItem({
  t, locale, notification, markReadAction,
}: {
  t: T; locale: Locale; notification: NotificationRow; markReadAction: MarkReadFn
}) {
  const [, startTransition] = useTransition()
  const template = (t as unknown as Record<string, string>)[notification.notificationType] ?? notification.notificationType
  const isUnread = !notification.readAt

  const onClick = () => {
    if (!isUnread) return
    startTransition(() => { void markReadAction(locale, notification.id) })
  }

  return (
    <li className="border-b border-kinnso-edge/60 py-3">
      <Link
        href={targetHref(locale, notification.entityType, notification.entityId)}
        onClick={onClick}
        className={`block text-sm ${isUnread ? 'font-bold text-kinnso-ink' : 'text-kinnso-muted'}`}
      >
        {interpolate(template, notification.payload)}
        {' · '}
        <span className="ml-2 text-xs text-kinnso-muted">
          {new Date(notification.createdAt).toLocaleDateString(locale)}
        </span>
      </Link>
    </li>
  )
}

export function StudioInboxView({
  t, locale, notifications, markReadAction,
}: {
  t: T; locale: Locale; notifications: NotificationRow[]; markReadAction: MarkReadFn
}) {
  return (
    <main className="k-container py-10">
      <h1 className="text-3xl font-black text-kinnso-ink">{t.heading}</h1>
      <p className="mt-2 text-sm text-kinnso-muted">{t.subtitle}</p>
      {notifications.length === 0 ? (
        <p className="mt-8 text-sm text-kinnso-muted">{t.empty}</p>
      ) : (
        <ul className="mt-6">
          {notifications.map((n) => (
            <NotificationRowItem key={n.id} t={t} locale={locale} notification={n} markReadAction={markReadAction} />
          ))}
        </ul>
      )}
    </main>
  )
}

export default StudioInboxView
