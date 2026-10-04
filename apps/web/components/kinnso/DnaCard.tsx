'use client'
import React from "react";
import type { Tier } from "@/lib/creator-mock";
import type { Dna } from "@kinnso/scan";
import TierBadge from "./TierBadge";
import { CheckCircle2, MapPin, Sparkles } from "lucide-react";

interface DnaMetrics {
  engagementScore: number;
  tierSuggested: Tier;
  travelPosts: number;
  contentMix: { tag: string; pct: number }[];
  cities: { city: string; country: string }[];
}
interface Props {
  dna: Dna;
  metrics: DnaMetrics;
  compact?: boolean;
}

export const DnaCard: React.FC<Props> = ({ dna, metrics, compact }) => {
  void dna;
  const cities = metrics.cities.length;
  const countries = new Set(metrics.cities.map((c) => c.country)).size;

  return (
    <div className="k-card border border-kinnso-cream2 p-5 text-left animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-kinnso-orange" />
          <span className="text-xs font-bold uppercase tracking-wider text-kinnso-muted">Creator DNA</span>
        </div>
        <TierBadge tier={metrics.tierSuggested} />
      </div>

      <div className="mt-4 flex items-end gap-3">
        <div className="k-mono text-5xl font-bold text-kinnso-ink">{metrics.engagementScore}</div>
        <div className="pb-1 text-sm text-kinnso-muted">
          score · <span className="text-kinnso-green font-semibold">Qualified</span>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        <Stat label="Countries" value={countries} />
        <Stat label="Cities" value={cities} />
        <Stat label="Travel posts" value={metrics.travelPosts} />
      </div>

      {!compact && (
        <>
          <div className="mt-5 space-y-2">
            <p className="text-xs font-bold uppercase tracking-wider text-kinnso-muted">Content mix</p>
            {metrics.contentMix.map((c) => (
              <div key={c.tag} className="flex items-center gap-2 text-xs">
                <span className="w-20 text-kinnso-ink">{c.tag}</span>
                <div className="h-1.5 flex-1 rounded-pill bg-kinnso-cream2">
                  <div className="h-full rounded-pill bg-kinnso-orange" style={{ width: `${c.pct}%` }} />
                </div>
                <span className="k-mono w-8 text-right text-kinnso-muted">{c.pct}%</span>
              </div>
            ))}
          </div>

          <div className="mt-4">
            <p className="text-xs font-bold uppercase tracking-wider text-kinnso-muted">Top cities</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {metrics.cities.slice(0, 6).map((c) => (
                <span key={c.city} className="k-chip">
                  <MapPin className="mr-1 h-3 w-3 text-kinnso-orange" /> {c.city}
                </span>
              ))}
            </div>
          </div>
        </>
      )}

      <div className="mt-5 flex items-center gap-2 rounded-md bg-kinnso-cream2 px-3 py-2 text-xs text-kinnso-ink">
        <CheckCircle2 className="h-4 w-4 text-kinnso-green" />
        3 missions matched · avg payout <span className="k-mono ml-1">HK$420</span>
      </div>
    </div>
  );
};

const Stat: React.FC<{ label: string; value: number | string }> = ({ label, value }) => (
  <div className="rounded-md bg-kinnso-cream2 p-2">
    <div className="k-mono text-lg font-bold text-kinnso-ink">{value}</div>
    <div className="text-[10px] uppercase tracking-wider text-kinnso-muted">{label}</div>
  </div>
);

export default DnaCard;
