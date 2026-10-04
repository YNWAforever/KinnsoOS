import Link from 'next/link'
import { ArrowRight, BarChart2, Bot, Gift, Inbox, PenSquare, Sparkles, Tag, Target, Trophy, Video, Wallet } from 'lucide-react'
import type { Locale } from '@/lib/i18n/config'
import type { Messages } from '@/lib/i18n/messages/en'
import { RouteStamp, TicketCard } from '@/components/kinnso/MarketPassport'

/** Secondary launcher grid for the Studio dashboard. */
export function StudioQuickLinks({ locale, t, unreadNotificationCount }: { locale: Locale; t: Messages['studioHome']; unreadNotificationCount: number }) {
  const p = (path: string) => `/${locale}${path}`
  const tools = [
    { href: '/studio/scan', title: t.scanTitle, desc: t.scanDesc, live: true, icon: <Sparkles aria-hidden="true" className="h-5 w-5" /> },
    { href: '/studio/copilot', title: t.copilotTitle, desc: t.copilotDesc, live: true, icon: <Bot aria-hidden="true" className="h-5 w-5" /> },
    { href: '/studio/missions', title: t.missionsTitle, desc: t.missionsDesc, live: true, icon: <Target aria-hidden="true" className="h-5 w-5" /> },
    { href: '/studio/tier', title: t.tierTitle, desc: t.tierDesc, live: true, icon: <Trophy aria-hidden="true" className="h-5 w-5" /> },
    { href: '/studio/earnings', title: t.earningsTitle, desc: t.earningsDesc, live: true, icon: <Wallet aria-hidden="true" className="h-5 w-5" /> },
    { href: '/studio/offers', title: t.offersTitle, desc: t.offersDesc, live: true, icon: <Tag aria-hidden="true" className="h-5 w-5" /> },
    { href: '/studio/perks', title: t.perksTitle, desc: t.perksDesc, live: true, icon: <Gift aria-hidden="true" className="h-5 w-5" /> },
    { href: '/studio/inbox', title: t.inboxTitle, desc: t.inboxDesc, live: true, icon: <Inbox aria-hidden="true" className="h-5 w-5" /> },
    { href: '/studio/guides', title: t.guidesTitle, desc: t.guidesDesc, live: true, icon: <PenSquare aria-hidden="true" className="h-5 w-5" /> },
    { href: '/studio/insights', title: t.insightsTitle, desc: t.insightsDesc, live: true, icon: <BarChart2 aria-hidden="true" className="h-5 w-5" /> },
    { href: '/studio/sessions', title: t.sessionsTitle, desc: t.sessionsDesc, live: true, icon: <Video aria-hidden="true" className="h-5 w-5" /> },
  ]
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {tools.map((tool) => {
        // Only the inbox tile ever carries a count, and only while it's positive —
        // everything else keeps the browser's own flattened accessible name.
        const hasUnreadBadge = tool.href === '/studio/inbox' && unreadNotificationCount > 0
        const header = (
          <>
            <div className="flex items-center justify-between">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-kinnso-cream2 text-kinnso-orange">{tool.icon}</span>
              <RouteStamp className={tool.live ? 'bg-kinnso-orange/10 text-kinnso-orange' : 'bg-kinnso-cream2 text-kinnso-muted'}>
                {tool.live ? t.liveBadge : t.soonBadge}
              </RouteStamp>
              {hasUnreadBadge && (
                // Visually shows the count, but contributes nothing to the link's
                // accessible name — that's composed once, cleanly, on the link itself.
                <span
                  aria-hidden="true"
                  className="ml-2 grid h-5 min-w-5 place-items-center rounded-full bg-kinnso-orange px-1.5 text-xs font-bold text-white"
                >
                  {unreadNotificationCount}
                </span>
              )}
            </div>
            <h3 className="mt-3 text-lg font-bold text-kinnso-ink">{tool.title}</h3>
            <p className="mt-1 text-sm text-kinnso-muted">{tool.desc}</p>
          </>
        )
        if (!tool.live) {
          // Backlog tool: visible but not clickable — no dead link to a Coming-Soon stub.
          return (
            <TicketCard key={tool.href} className="p-5 opacity-70">
              {header}
            </TicketCard>
          )
        }
        return (
          <TicketCard
            key={tool.href}
            as={Link}
            href={p(tool.href)}
            aria-label={hasUnreadBadge ? `${tool.title}, ${t.unreadBadgeLabel.replace('{count}', String(unreadNotificationCount))}` : undefined}
            className="group p-5 transition hover:border-kinnso-orange"
          >
            {header}
            <span className="mt-3 inline-flex items-center text-sm font-bold text-kinnso-orange">
              {t.open} <ArrowRight aria-hidden="true" className="ml-1 h-4 w-4 transition group-hover:translate-x-0.5" />
            </span>
          </TicketCard>
        )
      })}
    </div>
  )
}

export default StudioQuickLinks
