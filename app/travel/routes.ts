import { fixtures } from "./model";
/** Supported amendments plus preserved original entry points. */
const pages = new Set([
  "sessions",
  "merchants",
  "studio/opportunities",
  "studio/outcomes",
  "offers/demo-offer-hk",
  "",
  "explore",
  "destinations",
  "trips",
  "saved",
  "bookmarks",
  "trip-planner",
  "agent",
  "studio/copilot",
  "record",
  "studio/adventures/new",
  "studio",
  "studio/adventures",
  "studio/guides",
  "studio/earnings",
  "studio/missions",
  "studio/offers",
  "studio/receipts",
  "missions",
  "receipts",
  "bookings",
  "ticket-wallet",
  "merchant",
  "ops",
  "me",
  "settings",
  "demo-lab",
  "creators",
  "experiences",
  "tickets",
  "events",
  "gift-cards",
  "articles",
  "for-business",
  "for-creators",
  "about",
  "contact",
  "help",
  "booking-support",
  "creator-stories",
  "how-kinnso-works",
  "credits",
]);
const retained = new Set([
  "for-creators/apply",
  "for-creators/host-an-experience",
  "for-creators/how-it-works",
  "for-creators/earnings",
  "for-creators/quality-standards",
  "for-business/work-with-creators",
  "for-business/post-a-mission",
  "for-business/list-an-experience",
  "for-business/ticketing",
  "for-business/merchant-offers",
  "for-business/attribution",
  "for-business/pricing",
  "for-business/case-studies",
  "for-business/contact",
  "legal/booking-terms",
  "legal/creator-terms",
  "legal/merchant-terms",
  "legal/refund-policy",
  "legal/privacy",
  "legal/traveller-terms",
  "legal/payment-handling",
]);
export function isKnownRoute(path: string) {
  if (
    /^(articles\/[^/]+(?:\/[^/]+)?|sessions\/[^/]+|m\/[^/]+)$/.test(path) &&
    !path.split("/").includes("..")
  )
    return true;
  if (
    /^merchants\/dashboard(?:\/(post|missions|creators|offers|redeem|insights|profile|experiences|bookings|budget)(?:\/demo-[a-zA-Z0-9-]+)?)?$/.test(
      path,
    )
  )
    return true;
  if (/^creators\/(mika|chloe|ines|you)$/.test(path)) return true;
  if (pages.has(path) || retained.has(path)) return true;
  if (path.startsWith("legacy/")) return true;
  if (
    /^destinations\/(kyoto|hong-kong|lisbon|tokyo|seoul|singapore)$/.test(path)
  )
    return true;
  if (/^c\/(mika|chloe|ines|you|creator-passport)$/.test(path)) return true;
  if (
    /^(trips\/[^/]+|studio\/adventures\/[^/]+\/edit|bookings\/[^/]+)$/.test(
      path,
    )
  )
    return true;
  if (
    /^(merchant|ops)\/(missions|redemption|content|conversions|payouts|reconciliation)$/.test(
      path,
    )
  )
    return true;
  if (/^(g|collections)\//.test(path)) {
    const slug = path.split("/")[1];
    return (
      fixtures.some((a) => a.slug === slug) ||
      /^journal-demo-trip-[a-f0-9-]+$/.test(slug)
    );
  }
  return false;
}
