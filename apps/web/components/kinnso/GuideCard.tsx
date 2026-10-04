import Link from "next/link";
import { Bookmark, MapPin } from "lucide-react";
import { EditorialCard } from "@/components/kinnso/editorial/EditorialCard";
import { EntityMedia } from '@/components/kinnso/media/EntityMedia';
import type { Guide } from '@/lib/guides/types';
import type { Locale } from "@/lib/i18n/config";

const GuideCard = ({ g, locale, savesLabel = 'Saves', isSaved, onSaveToggle }: {
  g: Guide; locale: Locale; savesLabel?: string
  isSaved?: boolean
  onSaveToggle?: () => void
}) => (
  <div className="group relative">
    <Link href={`/${locale}/g/${g.slug}`} className="block">
      <EditorialCard
        media={
          <EntityMedia
            src={g.cover}
            title={g.title}
            location={g.city}
            sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
            className="h-full w-full"
            imageClassName="transition duration-300 group-hover:scale-[1.02]"
          />
        }
        kicker={<span className="inline-flex items-center gap-1"><MapPin aria-hidden="true" className="h-3 w-3" /> {g.city}</span>}
        title={g.title}
        footer={
          <div className={`flex items-center border-t border-kinnso-edge pt-3 text-xs text-kinnso-muted ${onSaveToggle ? 'pr-8' : ''}`}>
            <span>@{g.creatorHandle}</span>
          </div>
        }
      />
    </Link>
    {onSaveToggle ? (
      <button
        type="button"
        aria-pressed={isSaved}
        onClick={onSaveToggle}
        className="absolute bottom-5 right-5 z-10 inline-flex items-center gap-1 text-xs text-kinnso-muted"
      >
        <Bookmark aria-hidden="true" className={isSaved ? 'h-3 w-3 fill-current' : 'h-3 w-3'} />
        <span className="sr-only">{savesLabel}</span>
      </button>
    ) : null}
  </div>
);

export default GuideCard;
