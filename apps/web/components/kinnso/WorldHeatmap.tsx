'use client'
import React, { useState } from "react";
import { ComposableMap, Geographies, Geography, Marker } from "react-simple-maps";
import { cn } from "@/lib/utils";
import type { CreatorLocation } from "@/lib/creator-mock";

// Free public TopoJSON for world map (110m resolution).
const GEO_URL = "/world-110m.json";

interface Props {
  locations: CreatorLocation[];
  height?: number;
  interactive?: boolean;
  onCityClick?: (loc: CreatorLocation) => void;
  className?: string;
}

export const WorldHeatmap: React.FC<Props> = ({ locations, height = 320, interactive = true, onCityClick, className }) => {
  const [tip, setTip] = useState<{ x: number; y: number; text: string } | null>(null);
  const visited = new Set(locations.map((l) => l.country));
  const maxPosts = Math.max(1, ...locations.map((l) => l.postCount));

  return (
    <div className={cn("relative w-full overflow-hidden rounded-lg bg-kinnso-cream2", className)} style={{ height }}>
      <ComposableMap
        projectionConfig={{ scale: 145, center: [40, 15] }}
        width={900}
        height={height * (900 / 900)}
        style={{ width: "100%", height: "100%" }}
      >
        <Geographies geography={GEO_URL}>
          {({ geographies }) =>
            geographies.map((geo) => {
              const iso = geo.properties.iso_a2 || geo.id;
              const isVisited = visited.has(iso);
              return (
                <Geography
                  key={geo.rsmKey}
                  geography={geo}
                  fill={isVisited ? "hsl(var(--k-orange))" : "hsl(var(--k-muted) / 0.35)"}
                  stroke="hsl(var(--k-cream))"
                  strokeWidth={0.4}
                  style={{
                    default: { outline: "none" },
                    hover:   { outline: "none", opacity: 0.85 },
                    pressed: { outline: "none" },
                  }}
                />
              );
            })
          }
        </Geographies>
        {locations.map((loc) => {
          const r = 4 + 6 * (loc.postCount / maxPosts);
          return (
            <Marker
              key={`${loc.creatorHandle}-${loc.city}`}
              coordinates={[loc.lon, loc.lat]}
              onMouseEnter={(e) => setTip({ x: (e as React.MouseEvent).clientX, y: (e as React.MouseEvent).clientY, text: `${loc.city} · ${loc.postCount} posts` })}
              onMouseLeave={() => setTip(null)}
              onClick={() => interactive && onCityClick?.(loc)}
              style={{ cursor: interactive ? "pointer" : "default" } as unknown as React.ComponentProps<typeof Marker>["style"]}
            >
              <circle r={r} fill="hsl(var(--k-amber))" stroke="white" strokeWidth={1.2} />
            </Marker>
          );
        })}
      </ComposableMap>
      {tip && (
        <div className="pointer-events-none absolute rounded-md bg-kinnso-ink px-2 py-1 text-xs font-medium text-white shadow-lg"
             style={{ left: tip.x, top: tip.y - 28 }}>
          {tip.text}
        </div>
      )}
    </div>
  );
};

export default WorldHeatmap;
