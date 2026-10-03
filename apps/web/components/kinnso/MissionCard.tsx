import Link from "next/link";
import { Calendar, MapPin } from "lucide-react";
import { ReceiptRow, RouteStamp, TicketCard, TicketDivider } from "./MarketPassport";
import TierBadge from "./TierBadge";
import type { Mission } from "@/lib/creator-mock";

const MissionCard = ({ m, href }: { m: Mission; href: string }) => (
  <Link href={href} className="block">
    <TicketCard as="article" className="group relative h-full overflow-hidden p-5 transition hover:-translate-y-0.5 hover:shadow-lg">
      <div className="flex items-start justify-between gap-3">
        <div>
          <RouteStamp>{m.category}</RouteStamp>
          <h3 className="mt-2 text-lg font-bold leading-snug text-kinnso-ink">{m.title}</h3>
          <p className="mt-1 text-sm text-kinnso-muted">by {m.merchant}</p>
        </div>
        <TierBadge tier={m.tier} />
      </div>

      <p className="mt-3 line-clamp-2 text-sm text-kinnso-ink/80">{m.brief}</p>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-kinnso-muted">
        <span className="inline-flex items-center"><MapPin aria-hidden="true" className="mr-1 h-3 w-3" /> {m.cities.join(", ")}</span>
        <span className="inline-flex items-center"><Calendar aria-hidden="true" className="mr-1 h-3 w-3" /> {m.travelWindow}</span>
      </div>

      <TicketDivider className="mt-4" />
      <ReceiptRow
        label="Payout"
        meta={`+${m.commission}% comm.`}
        value={`HK$${m.payout.toLocaleString()}`}
        tone="positive"
        className="mt-3"
      />
    </TicketCard>
  </Link>
);

export default MissionCard;
