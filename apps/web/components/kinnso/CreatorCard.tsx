import Link from "next/link";
import { RouteMarkers, TicketCard, TicketDivider } from "./MarketPassport";
import TierBadge from "./TierBadge";
import type { Creator } from "@/lib/creator-mock";

const CreatorCard = ({ c, locale }: { c: Creator; locale?: string }) => (
  <Link href={locale ? `/${locale}/c/${c.handle}` : `/c/${c.handle}`} className="block w-64 shrink-0">
    <TicketCard className="p-4 transition hover:-translate-y-0.5 hover:shadow-lg">
      <div className="flex items-center gap-3">
        <img
          src={c.avatar}
          alt={c.name}
          width={80}
          height={80}
          loading="lazy"
          className="h-20 w-20 rounded-full object-cover ring-2 ring-kinnso-cream2"
        />
        <div className="min-w-0 text-left">
          <h4 className="truncate font-bold text-kinnso-ink">{c.name}</h4>
          <p className="k-mono truncate text-xs text-kinnso-muted">@{c.handle}</p>
          <p className="mt-1 text-xs text-kinnso-muted">{c.homeCity} / {c.category}</p>
        </div>
      </div>
      <TicketDivider className="my-4" />
      <RouteMarkers points={[c.homeCity.slice(0, 2).toUpperCase(), c.category.slice(0, 2).toUpperCase(), c.tier.toUpperCase()]} />
      <div className="mt-4 flex items-center justify-between gap-2">
        <TierBadge tier={c.tier} score={c.score} showScore />
        <p className="k-mono text-xs font-bold text-kinnso-muted">{c.guides} Guides</p>
      </div>
    </TicketCard>
  </Link>
);

export default CreatorCard;
