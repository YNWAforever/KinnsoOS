'use client'

import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { CreatorLocation, CreatorPost, CreatorPlaceTag } from "@/lib/creator-mock";
import PlaceTagRow from "./PlaceTagRow";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  location: CreatorLocation | null;
  posts: CreatorPost[];
  places: CreatorPlaceTag[];
}

const CityDetailDrawer = ({ open, onOpenChange, location, posts, places }: Props) => {
  if (!location) return null;
  const cityPosts = posts.filter((p) => p.city === location.city).slice(0, 12);
  const cityPlaces = places.filter((p) => p.city === location.city);
  const totalEng = cityPosts.reduce((s, p) => s + p.likes + p.comments * 2 + p.saves * 3, 0);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-2xl bg-kinnso-cream">
        <SheetHeader className="text-left">
          <SheetTitle className="flex items-center gap-2 text-2xl font-black text-kinnso-ink">
            <span>{location.flag}</span> {location.city}
          </SheetTitle>
          <div className="mt-1 flex flex-wrap gap-2">
            <span className="rounded-pill bg-kinnso-amber/30 px-3 py-1 text-xs font-semibold text-kinnso-ink">
              {location.postCount} posts
            </span>
            <span className="rounded-pill bg-kinnso-green/15 px-3 py-1 text-xs font-semibold text-kinnso-green">
              {totalEng.toLocaleString()} total engagement
            </span>
            <span className="text-xs text-kinnso-muted">{location.countryName}</span>
          </div>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          <section>
            <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-kinnso-muted">Posts from this city</h3>
            <div className="space-y-2">
              {cityPosts.map((p) => (
                <a key={p.id} href={p.postUrl} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-md bg-white p-2 transition hover:bg-kinnso-cream2">
                  <img src={p.thumbnail} alt={p.caption} className="h-14 w-14 rounded-md object-cover" />
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-xs text-kinnso-ink">{p.caption}</p>
                    <div className="mt-1 flex items-center gap-2 text-[11px] text-kinnso-muted">
                      <span className="capitalize">{p.platform}</span>
                      <span>·</span>
                      <span>{p.likes.toLocaleString()} likes</span>
                      <span>·</span>
                      <span>{p.postedAt}</span>
                    </div>
                  </div>
                </a>
              ))}
              {cityPosts.length === 0 && <p className="text-sm text-kinnso-muted">No posts yet.</p>}
            </div>
          </section>

          {cityPlaces.length > 0 && (
            <section>
              <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-kinnso-muted">Places in this city</h3>
              <div className="space-y-2">
                {cityPlaces.map((pl, i) => <PlaceTagRow key={i} place={pl} />)}
              </div>
            </section>
          )}

          <section className="rounded-lg bg-kinnso-cream2 p-4 text-xs text-kinnso-muted">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div><div className="text-kinnso-muted">First visited</div><div className="font-semibold text-kinnso-ink">{location.firstVisited}</div></div>
              <div><div className="text-kinnso-muted">Last visited</div><div className="font-semibold text-kinnso-ink">{location.lastVisited}</div></div>
              <div><div className="text-kinnso-muted">Posts</div><div className="font-semibold text-kinnso-ink">{location.postCount}</div></div>
              <div><div className="text-kinnso-muted">Avg eng.</div><div className="k-mono font-semibold text-kinnso-ink">{Math.round(totalEng / Math.max(1, cityPosts.length)).toLocaleString()}</div></div>
            </div>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default CityDetailDrawer;
