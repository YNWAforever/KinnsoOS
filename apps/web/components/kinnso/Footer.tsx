import Link from "next/link";
import type { Locale } from "@/lib/i18n/config";
import type { Messages } from "@/lib/i18n/messages/en";

/** R1A editorial footer: dark-ink band with marketplace-positioned columns. */
const Footer = ({
  locale,
  bookingLive,
  t,
}: {
  locale: Locale
  bookingLive: boolean
  t: Messages["footer"]
}) => {
  const p = (path: string) => `/${locale}${path}`
  const cols = [
    {
      title: t.colExplore,
      links: [
        [t.lGuides, "/explore"],
        [t.lDestinations, "/destinations"],
        [t.lArticles, "/articles"],
        [t.lSessions, "/sessions"],
      ] as const,
    },
    ...(bookingLive ? [{
      title: t.colTravellers,
      links: [
        [t.lTrips, "/trips"],
        [t.lSaved, "/trips#saved"],
      ] as const,
    }] : []),
    {
      title: t.colCreators,
      links: [
        [t.lForCreators, "/for-creators"],
        [t.lApply, "/sign-up"],
        [t.lStudio, "/studio"],
        [t.lMissions, "/studio/missions"],
        [t.lEarnings, "/studio/earnings"],
      ] as const,
    },
    {
      title: t.colMerchants,
      links: [
        [t.lDirectory, "/merchants"],
        [t.lPostMission, "/merchants/post"],
        [t.lPricing, "/for-merchants"],
      ] as const,
    },
    {
      title: t.colCompany,
      links: [
        [t.lAbout, "/about"],
        [t.lAgent, "/agent"],
        [t.lContact, "/contact"],
        [t.lLegal, "/legal/creator-terms"],
      ] as const,
    },
  ]

  return (
    <footer className="bg-kinnso-ink font-sans text-kinnso-cream">
      <div
        className={`k2-container grid gap-10 py-14 md:grid-cols-3 ${
          bookingLive ? 'xl:grid-cols-6' : 'xl:grid-cols-5'
        }`}
      >
        <div>
          <span className="k2-display text-2xl font-semibold tracking-tight text-kinnso-cream">
            KINNSO
          </span>
          <p className="mt-3 max-w-xs text-sm leading-relaxed text-kinnso-cream/60">
            {t.tagline}
          </p>
        </div>
        {cols.map((column) => (
          <div key={column.title}>
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.22em] text-kinnso-amber">
              {column.title}
            </h2>
            <ul className="mt-4 space-y-2.5 text-sm">
              {column.links.map(([label, href]) => (
                <li key={`${label}-${href}`}>
                  <Link
                    href={p(href)}
                    className="text-kinnso-cream/80 transition hover:text-kinnso-cream"
                  >
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-kinnso-cream/15">
        <div className="k2-container flex items-center justify-center py-4 text-xs text-kinnso-cream/60 sm:justify-start">
          <span>{t.rights}</span>
        </div>
      </div>
    </footer>
  )
}

export default Footer
