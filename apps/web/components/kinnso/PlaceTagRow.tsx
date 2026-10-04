import { Utensils, BedDouble, Star, MapPin, Coffee } from "lucide-react";
import type { CreatorPlaceTag } from "@/lib/creator-mock";

const ICON = {
  restaurant: Utensils,
  hotel: BedDouble,
  attraction: Star,
  neighbourhood: MapPin,
  cafe: Coffee,
} as const;

const PlaceTagRow = ({ place }: { place: CreatorPlaceTag }) => {
  const Icon = ICON[place.placeType];
  return (
    <div className="flex items-center justify-between gap-3 rounded-md bg-kinnso-cream2 px-3 py-2">
      <div className="flex min-w-0 items-center gap-3">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white text-kinnso-orange">
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-kinnso-ink">{place.placeName}</div>
          <div className="text-xs text-kinnso-muted">{place.city} · {place.visitCount} {place.visitCount === 1 ? "post" : "posts"}</div>
        </div>
      </div>
      <div className="k-mono shrink-0 text-xs text-kinnso-muted">{place.totalEngagement.toLocaleString()} eng.</div>
    </div>
  );
};

export default PlaceTagRow;
