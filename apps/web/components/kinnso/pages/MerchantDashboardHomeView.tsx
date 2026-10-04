import Link from 'next/link'
import { CalendarCheck, FileText, LineChart, MapPin, QrCode, Store, Tag, Users, Briefcase, Wallet } from 'lucide-react'
import { EditorialCard } from '@/components/kinnso/editorial/EditorialCard'
import { Eyebrow } from '@/components/kinnso/editorial/Eyebrow'
import { SectionShell } from '@/components/kinnso/editorial/SectionShell'
import type { Locale } from '@/lib/i18n/config'
import type { Messages } from '@/lib/i18n/messages/en'

export function MerchantDashboardHomeView({ locale, t }: { locale: Locale; t: Messages['merchantDashboard'] }) {
  const p = (path: string) => `/${locale}${path}`
  const cards = [
    { title: t.cardPostTitle, body: t.cardPostBody, href: p('/merchants/dashboard/post'), icon: <FileText aria-hidden="true" className="h-5 w-5" /> },
    { title: t.cardMissionsTitle, body: t.cardMissionsBody, href: p('/merchants/dashboard/missions'), icon: <Briefcase aria-hidden="true" className="h-5 w-5" /> },
    { title: t.cardCreatorsTitle, body: t.cardCreatorsBody, href: p('/merchants/dashboard/creators'), icon: <Users aria-hidden="true" className="h-5 w-5" /> },
    { title: t.cardInsightsTitle, body: t.cardInsightsBody, href: p('/merchants/dashboard/insights'), icon: <LineChart aria-hidden="true" className="h-5 w-5" /> },
    { title: t.cardExperiencesTitle, body: t.cardExperiencesBody, href: p('/merchants/dashboard/experiences'), icon: <MapPin aria-hidden="true" className="h-5 w-5" /> },
    { title: t.cardBookingsTitle, body: t.cardBookingsBody, href: p('/merchants/dashboard/bookings'), icon: <CalendarCheck aria-hidden="true" className="h-5 w-5" /> },
    // /offers and /redeem shipped with R12.0 but were linked from nowhere, so
    // merchant staff could not reach the redemption scanner from the product at
    // all -- the visit loop was only completable by typing the URL.
    { title: t.cardOffersTitle, body: t.cardOffersBody, href: p('/merchants/dashboard/offers'), icon: <Tag aria-hidden="true" className="h-5 w-5" /> },
    { title: t.cardRedeemTitle, body: t.cardRedeemBody, href: p('/merchants/dashboard/redeem'), icon: <QrCode aria-hidden="true" className="h-5 w-5" /> },
    { title: t.cardProfileTitle, body: t.cardProfileBody, href: p('/merchants/dashboard/profile'), icon: <Store aria-hidden="true" className="h-5 w-5" /> },
    { title: t.cardBudgetTitle, body: t.cardBudgetBody, href: p('/merchants/dashboard/budget'), icon: <Wallet aria-hidden="true" className="h-5 w-5" /> },
  ]
  return (
    <main className="bg-kinnso-cream font-sans">
      <SectionShell as="header">
        <Eyebrow>{t.title}</Eyebrow>
        <h1 className="k2-display mt-4 text-3xl font-semibold text-kinnso-ink md:text-5xl">{t.title}</h1>
        <p className="mt-4 max-w-2xl leading-relaxed text-kinnso-ink/70">{t.subtitle}</p>
      </SectionShell>
      <SectionShell className="k2-hairline">
        <div className="grid gap-5 md:grid-cols-3">
          {cards.map((c) => (
            <Link key={c.href} href={c.href} className="group block focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kinnso-orange">
              <EditorialCard title={c.title}>
                <span className="mb-2 grid h-9 w-9 place-items-center rounded-full bg-kinnso-cream2 text-kinnso-orangeDark">{c.icon}</span>
                {c.body}
                <span className="mt-3 block text-sm font-semibold text-kinnso-orangeDark">{t.open} →</span>
              </EditorialCard>
            </Link>
          ))}
        </div>
      </SectionShell>
    </main>
  )
}

export default MerchantDashboardHomeView
