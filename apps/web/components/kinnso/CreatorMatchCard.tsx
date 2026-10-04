'use client'
import React from "react";
import { Bookmark, ExternalLink, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Messages } from "@/lib/i18n/messages/en";
import type { RankedCreator, Reason } from "@/lib/merchants/relevance";

type SearchMessages = Messages['merchantSearch'];

interface Props {
  ranked: RankedCreator;
  saved: boolean;
  invited?: boolean;
  t: SearchMessages;
  onSave: (creatorId: string) => void;
  onView: (handle: string) => void;
  onSendBrief: (creatorId: string) => void;
}

const REASON_LABEL: Record<Reason['dimension'], keyof SearchMessages> = {
  niche: 'reasonNiche',
  geo: 'reasonGeo',
  language: 'reasonLanguage',
  platform: 'reasonPlatform',
};

export const CreatorMatchCard: React.FC<Props> = ({ ranked, saved, invited = false, t, onSave, onView, onSendBrief }) => {
  const { creator, reasons } = ranked;

  return (
    <article className="k-ticket overflow-hidden">
      <div className="grid gap-4 p-5 md:grid-cols-[1fr_180px] md:gap-6">
        {/* Public attributes only */}
        <div className="min-w-0">
          <div className="text-base font-bold text-kinnso-ink">{creator.name}</div>
          <div className="k-mono text-xs text-kinnso-muted">@{creator.handle}</div>

          {/* Reason chips from RankedCreator.reasons */}
          {reasons.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {reasons.map((r) => (
                <span
                  key={r.dimension}
                  className="inline-flex items-center gap-1 rounded-md bg-kinnso-cream2 px-2 py-0.5 text-xs text-kinnso-ink"
                >
                  {t[REASON_LABEL[r.dimension]]}
                  {r.values.length > 0 && (
                    <span className="text-kinnso-muted">· {r.values.join(", ")}</span>
                  )}
                </span>
              ))}
            </div>
          )}

          {/* Niches */}
          {creator.niches.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {creator.niches.map((n) => (
                <span key={n} className="rounded-pill bg-white px-2 py-0.5 text-xs text-kinnso-ink ring-1 ring-kinnso-cream2">
                  {n}
                </span>
              ))}
            </div>
          )}

          <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-kinnso-muted">
            <span>{t.guidesLabel.replace('{count}', String(creator.guideCount))}</span>
            {creator.audienceGeos.length > 0 && <span>{creator.audienceGeos.join(" · ")}</span>}
            {creator.languages.length > 0 && <span>{creator.languages.join(" · ")}</span>}
            {creator.platforms.length > 0 && <span>{creator.platforms.join(" · ")}</span>}
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-2">
          <button type="button" onClick={() => onView(creator.handle)} className="k-btn-ghost text-xs">
            <ExternalLink className="mr-1 inline h-3 w-3" /> {t.viewProfile}
          </button>
          <button
            type="button"
            onClick={() => onSendBrief(creator.id)}
            disabled={invited}
            aria-disabled={invited}
            className="k-btn-primary text-xs disabled:opacity-50"
          >
            <Send className="mr-1 inline h-3 w-3" /> {invited ? t.invited : t.sendBrief}
          </button>
          <button
            type="button"
            onClick={() => onSave(creator.id)}
            className={cn("k-btn-ghost text-xs", saved && "bg-kinnso-amber/40 text-kinnso-ink")}
          >
            <Bookmark className={cn("mr-1 inline h-3 w-3", saved && "fill-current")} /> {saved ? t.saved : t.save}
          </button>
        </div>
      </div>
    </article>
  );
};

export default CreatorMatchCard;
