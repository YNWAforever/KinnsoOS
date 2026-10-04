'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { Messages } from '@/lib/i18n/messages/en'
import type { Locale } from '@/lib/i18n/config'

export function CreatorsTabs({ t, locale }: { t: Messages['creators']; locale: Locale }) {
  const pathname = usePathname()
  const tabs = [
    { href: `/${locale}/admin/creators`, label: t.tabOverview },
    { href: `/${locale}/admin/creators/directory`, label: t.tabDirectory },
    { href: `/${locale}/admin/creators/payouts`, label: t.tabPayouts },
  ]
  return (
    <nav className="mb-6 flex gap-2 border-b border-kinnso-edge">
      {tabs.map((tab) => {
        const active = pathname === tab.href
        return (
          <Link key={tab.href} href={tab.href} aria-current={active ? 'page' : undefined}
            className={`px-3 py-2 text-sm font-bold ${active ? 'border-b-2 border-kinnso-orange text-kinnso-orange' : 'text-kinnso-muted hover:text-kinnso-ink'}`}>
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}

export default CreatorsTabs
