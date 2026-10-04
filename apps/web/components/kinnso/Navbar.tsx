'use client'
import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import LocaleSwitcher from "@/components/kinnso/LocaleSwitcher";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import type { ViewerRole } from "@/lib/auth/viewer-role";
import type { Locale } from "@/lib/i18n/config";
import type { Messages } from "@/lib/i18n/messages/en";

/**
 * R1A editorial navbar. Role is resolved CLIENT-side (useViewerRole in SiteChrome)
 * so public pages stay statically generable — this component only receives the
 * resolved role. IA (all roles): Explore · Destinations · Articles · Sessions ·
 * AI Agent · Creators; right side carries "For Merchants" (→ /for-merchants, the
 * R1C merchant acquisition landing) + the role-aware CTA.
 * Merchant deep links (mission queue / creator search / insights) live on a slim
 * second row under the main row — nine top-row anchors overflow the container at
 * every width — and merchants skip the redundant "For Merchants" link. Desktop
 * chrome uses a font-relative container query (tablets and enlarged text get the
 * same hamburger) so the desktop row only appears when its text can fit.
 */
export const Navbar: React.FC<{ locale: Locale; role: ViewerRole; sessionsLive: boolean; dashboardLabel: string; t: Messages["nav"] }> = ({ locale, role, sessionsLive, dashboardLabel, t }) => {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const p = (path: string) => `/${locale}${path}`;
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  // Active state is underline + clay (not color-only); the on-skin focus ring
  // overrides the legacy global orange focus rule.
  const navLinkClass = (active: boolean) =>
    `whitespace-nowrap px-3 py-2 text-sm font-medium tracking-wide transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kinnso-orange ${
      active ? "text-kinnso-orangeDark underline underline-offset-8 decoration-2 decoration-kinnso-orangeDark" : "text-kinnso-ink/75 hover:text-kinnso-ink"
    }`;

  const baseAnchors = [
    { to: "/explore",      label: t.linkExplore },
    { to: "/destinations", label: t.linkDestinations },
    { to: "/articles",     label: t.linkArticles },
    { to: "/sessions",     label: t.linkSessions },
    { to: "/agent",        label: t.linkAgent },
    { to: "/creators",     label: t.linkCreators },
    { to: "/merchants",    label: t.linkMerchants },
  ].filter((anchor) => sessionsLive || anchor.to !== "/sessions");
  // Merchant deep links: slim second row on desktop + tray entries on mobile —
  // never on the top row, which cannot fit nine anchors.
  const merchantAnchors = [
    { to: "/merchants/dashboard/missions", label: t.linkMissions },
    { to: "/merchants/dashboard/creators", label: t.linkFindCreators },
    { to: "/merchants/dashboard/insights", label: t.linkInsights },
  ];
  const trayAnchors = role === "merchant" ? [...baseAnchors, ...merchantAnchors] : baseAnchors;

  const cta = (() => {
    if (role === "creator") return { label: t.ctaOpenStudio, to: "/studio", className: "k2-btn-primary" };
    if (role === "creator-pending") return { label: t.ctaPending, to: "/creators/apply", className: "inline-flex min-h-[44px] items-center rounded-[3px] bg-kinnso-cream2 px-4 py-2 text-sm font-semibold text-kinnso-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kinnso-orange" };
    if (role === "merchant") return { label: t.ctaPostMission, to: "/merchants/dashboard/post", className: "k2-btn-primary" };
    if (role === "ops") return { label: dashboardLabel, to: "/admin", className: "k2-btn-primary" };
    if (role === "traveler") return { label: t.ctaMyTrips, to: "/trips", className: "k2-btn-primary" };
    return { label: t.signUp, to: "/sign-up", className: "k2-btn-primary" };
  })();

  // Audience links remain visible to complementary roles; anonymous viewers see both and the neutral sign-up CTA.
  const audienceAnchors = [
    ...(
      role === "creator" || role === "creator-pending"
        ? []
        : [{ to: "/for-creators", label: t.linkForCreators }]
    ),
    ...(role === "merchant" ? [] : [{ to: "/for-merchants", label: t.linkForMerchants }]),
  ];

  return (
    <header className="k2-navbar sticky top-0 z-40 border-b border-kinnso-edge bg-kinnso-cream/95 font-sans backdrop-blur">
      <Dialog open={open} onOpenChange={setOpen}>
      <div className="k2-navbar-layout">
      <div className="k2-container flex h-16 items-center justify-between gap-4">
        <Link href={p("")} aria-label="KINNSO" className="flex items-baseline gap-1.5">
          <span className="k2-display text-2xl font-semibold tracking-tight text-kinnso-ink">KINNSO</span>
          <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-kinnso-orange" />
        </Link>

        <nav className="k2-navbar-desktop items-center gap-1">
          {baseAnchors.map((a) => {
            const href = p(a.to);
            return (
              <Link key={a.to} href={href} aria-current={isActive(href) ? "page" : undefined} className={navLinkClass(isActive(href))}>
                {a.label}
              </Link>
            );
          })}
        </nav>

        <div className="k2-navbar-desktop items-center gap-3">
          {audienceAnchors.map((anchor) => {
            const href = p(anchor.to);
            return (
              <Link
                key={anchor.to}
                href={href}
                aria-current={isActive(href) ? 'page' : undefined}
                className={`whitespace-nowrap px-2 py-2 text-sm font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kinnso-orange ${
                  isActive(href)
                    ? 'text-kinnso-orangeDark underline underline-offset-8 decoration-2 decoration-kinnso-orangeDark'
                    : 'text-kinnso-ink/75 hover:text-kinnso-ink'
                }`}
              >
                {anchor.label}
              </Link>
            );
          })}
          <LocaleSwitcher locale={locale} t={t} />
          {role === "anon" && (
            <Link href={p("/sign-in")} className="whitespace-nowrap px-3 py-2 text-sm font-semibold text-kinnso-ink transition hover:text-kinnso-orangeDark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kinnso-orange">{t.signIn}</Link>
          )}
          <Link href={p(cta.to)} className={cta.className}>{cta.label}</Link>
        </div>

        <DialogTrigger asChild>
          <button
            type="button"
            className="k2-navbar-toggle grid h-10 w-10 place-items-center rounded-full text-kinnso-ink transition hover:bg-kinnso-cream2/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kinnso-orange"
            aria-label={t.menuToggle}
            aria-expanded={open}
            aria-controls={open ? "kinnso-mobile-menu" : undefined}
          >
            <Menu aria-hidden="true" />
          </button>
        </DialogTrigger>
      </div>

      {role === "merchant" && (
        <nav aria-label={t.merchantMenuLabel} className="k2-navbar-merchant border-t border-kinnso-edge">
          <div className="k2-container flex h-10 items-center gap-1">
            {merchantAnchors.map((a) => {
              const href = p(a.to);
              return (
                <Link key={a.to} href={href} aria-current={isActive(href) ? "page" : undefined} className={navLinkClass(isActive(href))}>
                  {a.label}
                </Link>
              );
            })}
          </div>
        </nav>
      )}
      </div>

        <DialogContent
          id="kinnso-mobile-menu"
          aria-describedby={undefined}
          className="top-16 bottom-0 left-0 right-0 max-h-[calc(100dvh-4rem)] w-full max-w-none translate-x-0 translate-y-0 overflow-y-auto rounded-none border-x-0 border-b-0 bg-kinnso-cream p-0"
        >
          <DialogTitle className="sr-only">{t.menuToggle}</DialogTitle>
          <div className="k2-container flex flex-col gap-1 py-3">
            <nav aria-label={t.menuToggle} className="flex flex-col gap-1">
              {trayAnchors.map((a) => (
                <Link key={a.to} href={p(a.to)} onClick={() => setOpen(false)} className="whitespace-nowrap px-3 py-2 text-sm font-medium text-kinnso-ink transition hover:text-kinnso-orangeDark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kinnso-orange">
                  {a.label}
                </Link>
              ))}
              {audienceAnchors.map((anchor) => (
                <Link
                  key={anchor.to}
                  href={p(anchor.to)}
                  onClick={() => setOpen(false)}
                  className="whitespace-nowrap px-3 py-2 text-sm font-medium text-kinnso-ink/75 transition hover:text-kinnso-orangeDark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kinnso-orange"
                >
                  {anchor.label}
                </Link>
              ))}
            </nav>
            <div className="mt-2 flex items-center justify-between gap-3">
              <LocaleSwitcher locale={locale} t={t} />
              <div className="flex items-center gap-2">
                {role === "anon" && (
                  <Link href={p("/sign-in")} onClick={() => setOpen(false)} className="whitespace-nowrap px-3 py-2 text-sm font-semibold text-kinnso-ink transition hover:text-kinnso-orangeDark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kinnso-orange">{t.signIn}</Link>
                )}
                <Link href={p(cta.to)} onClick={() => setOpen(false)} className={cta.className}>{cta.label}</Link>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </header>
  );
};

export default Navbar;
