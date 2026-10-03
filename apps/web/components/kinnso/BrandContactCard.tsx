'use client'
import Link from "next/link";
import type { ExtendedCreator } from "@/lib/creator-mock";
import { tierMeta } from "@/lib/creator-mock";
import type { ViewerRole } from "@/lib/auth/viewer-role";
import type { Locale } from "@/lib/i18n/config";
import type { Messages } from "@/lib/i18n/messages/en";
import { TicketCard } from "@/components/kinnso/MarketPassport";

interface Props {
  creator: ExtendedCreator;
  role: ViewerRole;
  locale: Locale;
  t: Messages["creatorProfile"];
}

export function BrandContactCard({ creator, role, locale, t }: Props) {
  const meta = tierMeta[creator.tier];
  const firstName = creator.name.split(" ")[0];
  const p = (path: string) => `/${locale}${path}`;
  const creatorBriefHref = `${p("/merchants/dashboard/post")}?creator=${encodeURIComponent(creator.handle)}`;

  return (
    <TicketCard className="bg-kinnso-amber/40 p-6 md:flex md:items-center md:justify-between md:gap-8">
      <div>
        <h3 className="text-xl font-black text-kinnso-ink">{t.brandWorkWith.replace("{name}", firstName)}</h3>
        <p className="mt-1 text-sm text-kinnso-ink/80">
          {t.brandTierLine.replace("{payout}", String(meta.payout)).replace("{commission}", String(meta.commission)).replace("{tier}", meta.label)}
        </p>
        <p className="mt-1 text-xs text-kinnso-muted">
          {t.brandReachLine.replace("{reach}", creator.driven90dReach.toLocaleString()).replace("{countries}", String(creator.countries)).replace("{score}", String(creator.score))}
        </p>
      </div>
      <div className="mt-4 flex flex-wrap gap-2 md:mt-0">
        {role === "merchant" ? (
          <>
            <Link href={creatorBriefHref} className="k-btn-primary">{t.brandSendBrief}</Link>
            <button type="button" className="k-btn-ghost">{t.brandSaveToList}</button>
          </>
        ) : role === "anon" ? (
          <span className="rounded-pill bg-white/70 px-4 py-2 text-sm font-semibold text-kinnso-ink">{t.brandSignInToContact}</span>
        ) : (
          <Link href={p("/merchants/dashboard/post")} className="k-btn-primary">{t.brandSendBrief}</Link>
        )}
      </div>
    </TicketCard>
  );
}
export default BrandContactCard;
