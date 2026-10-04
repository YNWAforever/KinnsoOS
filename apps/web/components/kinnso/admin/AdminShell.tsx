'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'
import type { Locale } from '@/lib/i18n/config'
import type { Messages } from '@/lib/i18n/messages/en'

export function AdminShell({ locale, t, children }: { locale: Locale; t: Messages['admin']; children: ReactNode }) {
  const pathname = usePathname()
  const nav = [
    { href: `/${locale}/admin`, label: t.navDashboard },
    { href: `/${locale}/admin/creators`, label: t.navCreators },
    { href: `/${locale}/admin/merchants`, label: t.navMerchants },
    { href: `/${locale}/admin/missions`, label: t.navMissions },
    { href: `/${locale}/admin/bookings`, label: t.navBookings },
    { href: `/${locale}/admin/perks`, label: t.navPerks },
    { href: `/${locale}/admin/testimonials`, label: t.navTestimonials },
    { href: `/${locale}/admin/enquiries`, label: t.navEnquiries },
    { href: `/${locale}/admin/analytics`, label: t.navAnalytics },
    { href: `/${locale}/admin/sessions`, label: t.navSessions },
    { href: `/${locale}/admin/users`, label: t.navUsers },
    { href: `/${locale}/admin/team`, label: t.navTeam },
  ]
  return (
    <div className="k-container flex flex-col gap-6 py-8 md:flex-row">
      <aside className="md:w-56 md:shrink-0">
        <nav className="flex gap-2 md:flex-col">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={pathname === item.href ? 'page' : undefined}
              className={`rounded-lg px-3 py-2 text-sm font-bold ${pathname === item.href ? 'bg-kinnso-orange/10 text-kinnso-orange' : 'text-kinnso-muted hover:text-kinnso-ink'}`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>
      <section className="min-w-0 flex-1">{children}</section>
    </div>
  )
}

export default AdminShell
