import { Instagram, MessageCircle, Youtube, Bookmark, Heart } from "lucide-react";
import type { CreatorPost } from "@/lib/creator-mock";
import { cn } from "@/lib/utils";

const PLATFORM_ICON = {
  instagram: Instagram,
  threads: MessageCircle,
  youtube: Youtube,
};

interface Props {
  posts: CreatorPost[];
  cols?: 2 | 3 | 6;
  className?: string;
  showOverlay?: boolean;
}

const PostThumbnailGrid = ({ posts, cols = 3, className, showOverlay = true }: Props) => {
  const colsCls = cols === 6 ? "grid-cols-3 sm:grid-cols-6" : cols === 2 ? "grid-cols-2" : "grid-cols-3";
  return (
    <div className={cn("grid gap-2", colsCls, className)}>
      {posts.map((p) => {
        const Icon = PLATFORM_ICON[p.platform];
        return (
          <a
            key={p.id}
            href={p.postUrl}
            target="_blank"
            rel="noreferrer"
            className="group relative block aspect-square overflow-hidden rounded-lg bg-kinnso-cream2"
          >
            <img src={p.thumbnail} alt={p.caption} width={300} height={300} loading="lazy" className="h-full w-full object-cover transition duration-300 group-hover:scale-105" />
            <span className="absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full bg-white/90 text-kinnso-ink">
              <Icon className="h-3 w-3" />
            </span>
            {showOverlay && (
              <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/70 to-transparent p-2 text-[10px] text-white opacity-0 transition group-hover:opacity-100">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-0.5"><Heart className="h-3 w-3" /> {p.likes.toLocaleString()}</span>
                  <span className="inline-flex items-center gap-0.5"><Bookmark className="h-3 w-3" /> {p.saves.toLocaleString()}</span>
                </div>
                {p.city && <div className="mt-0.5 truncate font-semibold">📍 {p.city}{p.placeName ? ` · ${p.placeName}` : ""}</div>}
              </div>
            )}
          </a>
        );
      })}
    </div>
  );
};

export default PostThumbnailGrid;
