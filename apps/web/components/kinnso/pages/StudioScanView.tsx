'use client'
import React, { useMemo, useState } from "react";
import { TicketCard } from "@/components/kinnso/MarketPassport";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Share2, ArrowRight, Lock } from "lucide-react";
import BearMascot from "@/components/kinnso/BearMascot";
import ScoreRing from "@/components/kinnso/ScoreRing";
import TierBadge from "@/components/kinnso/TierBadge";
import ScoreDeltaChip from "@/components/kinnso/ScoreDeltaChip";
import RescanStatusChip from "@/components/kinnso/RescanStatusChip";
import ScoreBreakdownPanel from "@/components/kinnso/ScoreBreakdownPanel";
import EngagementTrendChart from "@/components/kinnso/EngagementTrendChart";
import ContentMixDonut from "@/components/kinnso/ContentMixDonut";
import WorldHeatmap from "@/components/kinnso/WorldHeatmap";
import CityChip from "@/components/kinnso/CityChip";
import PlaceTagRow from "@/components/kinnso/PlaceTagRow";
import PostThumbnailGrid from "@/components/kinnso/PostThumbnailGrid";
import TagCloud from "@/components/kinnso/TagCloud";
import CityDetailDrawer from "@/components/kinnso/CityDetailDrawer";
import ShareDnaDialog from "@/components/kinnso/ShareDnaDialog";
import MissionCard from "@/components/kinnso/MissionCard";
import DnaCorePanel from "@/components/kinnso/DnaCorePanel";
import {
  creatorLocations, creatorPosts, creatorPlaceTags,
  engagementHistory, type CreatorLocation,
} from "@/lib/creator-mock";
import { missions, tierMeta, computeBreakdown, type Tier } from "@/lib/creator-mock";
import type { Dna } from "@kinnso/scan";
import type { ExtendedCreator } from "@/lib/creator-mock";
import type { StudioIdentity } from "@/lib/studio/identity";
import type { Messages } from "@/lib/i18n/messages/en";
import type { Locale } from "@/lib/i18n/config";

const SCAN_STEPS = [
  { label: "Connected to Instagram", delay: 0 },
  { label: "Fetched 412 posts",      delay: 1200 },
  { label: "Classified: 286 travel · 126 other", delay: 2400 },
  { label: "Extracted 41 cities across 12 countries", delay: 3600 },
  { label: "Photo scan complete · 22 landmarks identified", delay: 4800 },
  { label: "Engagement Score: ready",  delay: 6000 },
  { label: "6 missions matched",       delay: 7000 },
];

const TIER_ORDER: Tier[] = ["seed", "rising", "pro", "elite"];

const PLATFORM_EMOJI: Record<string, string> = {
  instagram: "📷",
  threads: "💬",
  youtube: "▶️",
};

export type StudioMode = "demo" | "real";

export interface StudioScanViewProps {
  locale: Locale;
  mode: StudioMode;
  /** Override the initial scan phase — used in tests to reach the intro screen. Defaults to "done". */
  initialPhase?: "intro" | "scanning" | "done";
  identity: StudioIdentity;
  dna: Dna;
  metrics: ExtendedCreator;
  isSample: boolean;
  t: Messages["studio"];
}

export function StudioScanView({ locale, mode, initialPhase = "done", identity, dna, metrics, isSample, t }: StudioScanViewProps) {
  const router = useRouter();
  const isDemo = mode === "demo";
  const studioMissionsHref = `/${locale}/studio/missions`;
  const publicProfileHref = `/${locale}/c/${metrics.handle}`;

  // Default to "done" so the report renders synchronously for tests and for
  // hosts that pass an already-scanned creator. The fake intro/scanning branch
  // is reachable only via the demo-only Start scan / Rescan buttons.
  // Pass initialPhase="intro" in tests to reach the intro input screen.
  const [phase, setPhase] = useState<"intro" | "scanning" | "done">(initialPhase);
  const [doneSteps, setDoneSteps] = useState<number>(0);
  const [igInput, setIgInput] = useState(metrics.handle);
  const [selectedCity, setSelectedCity] = useState<CreatorLocation | null>(null);
  const [shareOpen, setShareOpen] = useState(false);

  const startScan = () => {
    setPhase("scanning");
    setDoneSteps(0);
    SCAN_STEPS.forEach((s, i) => {
      setTimeout(() => {
        setDoneSteps(i + 1);
        if (i === SCAN_STEPS.length - 1) {
          setTimeout(() => {
            setPhase("done");
          }, 1000);
        }
      }, s.delay);
    });
  };

  // Numeric sections + drawers filter the mock fixtures by the mock handle.
  const locs = creatorLocations.filter((l) => l.creatorHandle === metrics.handle);
  const posts = creatorPosts.filter((p) => p.creatorHandle === metrics.handle);
  const places = creatorPlaceTags.filter((p) => p.creatorHandle === metrics.handle);
  const history = engagementHistory.filter((h) => h.creatorHandle === metrics.handle);
  const topPosts = useMemo(
    () => [...posts].filter((p) => p.isTravel).sort((a, b) => (b.likes + b.saves * 3 + b.comments * 2) - (a.likes + a.saves * 3 + a.comments * 2)).slice(0, 6),
    [posts],
  );
  const breakdown = useMemo(() => computeBreakdown(metrics), [metrics]);
  const delta = 3;

  const matched = missions.slice(0, 3);
  const tierIdx = TIER_ORDER.indexOf(metrics.tier);

  const sampleChip = isSample ? (
    <span className="k-pill ml-2 bg-kinnso-amber/50 text-kinnso-ink">{t.sampleBadge}</span>
  ) : null;

  // ───── INTRO + SCANNING SCREEN (demo only) ─────────────────
  if (isDemo && phase !== "done") {
    return (
      <div className="k-container py-16">
        <div className="mx-auto max-w-2xl">
          <div className="text-center">
            <BearMascot variant={phase === "scanning" ? "scanning" : "wave"} size="lg" />
            <h1 className="mt-6 text-3xl font-black text-kinnso-ink">
              {phase === "scanning" ? t.scanningHeading : t.introHeading}
            </h1>
            <p className="mt-2 text-sm text-kinnso-muted">{t.introSub}</p>
          </div>

          {phase === "intro" && (
            <div className="mt-8 space-y-3">
              <div>
                <label htmlFor="studio-ig-handle" className="mb-1 block text-xs font-bold uppercase tracking-wider text-kinnso-muted">{t.instagram}</label>
                <div className="flex items-center rounded-pill bg-white ring-1 ring-kinnso-cream2 focus-within:ring-kinnso-orange">
                  <span aria-hidden="true" className="k-mono pl-4 pr-1 text-kinnso-muted">@</span>
                  <input
                    id="studio-ig-handle"
                    name="instagramHandle"
                    autoComplete="username"
                    value={igInput}
                    onChange={(e) => setIgInput(e.target.value)}
                    className="k-mono flex-1 bg-transparent py-2.5 pr-4 text-sm outline-none"
                    placeholder={t.handlePlaceholder}
                  />
                </div>
              </div>
              <button type="button" onClick={startScan} className="k-btn-primary w-full">{t.startScan}</button>
            </div>
          )}

          {phase === "scanning" && (
            <div role="status" aria-live="polite">
              <div className="mt-8 h-1.5 overflow-hidden rounded-pill bg-kinnso-cream2">
                <div className="h-full bg-kinnso-orange transition-all duration-500" style={{ width: `${(doneSteps / SCAN_STEPS.length) * 100}%` }} />
              </div>
              <ul className="mt-6 space-y-3 text-sm">
                {SCAN_STEPS.map((s, i) => {
                  const done = i < doneSteps;
                  const active = i === doneSteps;
                  return (
                    <li key={i} className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        {done ? <span aria-hidden="true" className="grid h-5 w-5 place-items-center rounded-full bg-kinnso-green text-white">✓</span>
                              : active ? <Loader2 aria-hidden="true" className="h-5 w-5 animate-spin text-kinnso-orange" />
                              : <span aria-hidden="true" className="h-5 w-5 rounded-full bg-kinnso-cream2" />}
                        <span className={done ? "text-kinnso-ink" : "text-kinnso-muted"}>{s.label}</span>
                      </div>
                      {done && <span className="k-mono text-xs text-kinnso-muted">{(s.delay / 1000).toFixed(0)}s</span>}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ───── DNA REPORT ─────────────────────────────────────────
  return (
    <div className="bg-kinnso-cream">
      <div className="k-container py-12">
        <div className="mx-auto max-w-[720px] space-y-10">
          {/* 1 · Report-ready header */}
          <section className="text-center">
            <BearMascot variant="celebrating" size="md" />
            <h1 className="mt-3 text-2xl font-black text-kinnso-ink">{t.reportReadyHeading}</h1>
            {isSample && <p className="mt-2 text-xs text-kinnso-muted">{t.sampleNote}</p>}
          </section>

          {/* Demo banner — the anonymous demo is an explicit sample, never live data. */}
          {isDemo && (
            <div className="rounded-md bg-kinnso-amber/40 px-4 py-2 text-center text-sm font-semibold text-kinnso-ink">
              {t.demoBanner}
            </div>
          )}

          {/* 2 · Identity card */}
          <TicketCard as="section" className="p-5">
            <div className="flex items-start gap-4">
              {isDemo ? (
                <img src={metrics.avatar} alt={identity.name} className="h-20 w-20 rounded-full object-cover ring-2 ring-kinnso-cream2" />
              ) : (
                <div className="grid h-20 w-20 place-items-center rounded-full bg-kinnso-orange/15 text-2xl font-black text-kinnso-orange ring-2 ring-kinnso-cream2">
                  {identity.avatarInitials}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <h2 className="text-xl font-bold text-kinnso-ink">{identity.name}</h2>
                <p className="k-mono text-sm text-kinnso-muted">@{identity.handle}</p>
                {isDemo && (
                  <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
                    <span className="rounded-md bg-kinnso-cream2 px-2 py-0.5 text-kinnso-ink">{metrics.homeCity}</span>
                    <span className="rounded-md bg-kinnso-cream2 px-2 py-0.5 text-kinnso-ink">{metrics.category}</span>
                  </div>
                )}
                <div className="mt-2 flex flex-wrap gap-3 text-xs text-kinnso-muted">
                  {identity.followers.map((f) => (
                    <span key={f.platform}>
                      {PLATFORM_EMOJI[f.platform] ?? ""} {typeof f.count === "number" ? `${(f.count / 1000).toFixed(1)}k` : "—"}
                    </span>
                  ))}
                </div>
                <div className="mt-2 text-[11px] text-kinnso-muted">
                  {t.lastScanned} {identity.lastScanned}{isDemo ? ` · ${t.postsAnalyzed}` : ""}
                </div>
              </div>
              {isDemo && (
                <div className="flex flex-col items-end gap-2">
                  <RescanStatusChip lastScanned={identity.lastScanned} />
                  <button type="button" onClick={startScan} className="k-btn-ghost text-xs">{t.rescan}</button>
                </div>
              )}
            </div>
          </TicketCard>

          {/* 3 · Your Creator DNA (real or sample-shaped Dna) */}
          <DnaCorePanel dna={dna} t={t} />

          {/* Real mode stops here: identity + real qualitative DNA only. Every
              numeric section below is fabricated sample data (the maywanders
              overlay) and renders in the anonymous demo ONLY. */}
          {!isDemo && (
            <div>
              <Link href={studioMissionsHref} className="k-btn-primary inline-flex">
                {t.viewAllMissions} <ArrowRight aria-hidden="true" className="ml-1 h-4 w-4" />
              </Link>
            </div>
          )}

          {isDemo && (
          <>
          {/* 4 · Score ring + tier */}
          <TicketCard as="section" className="p-6 text-center">
            <div className="flex items-center justify-center">{sampleChip}</div>
            <div className="mt-1 flex justify-center"><ScoreRing score={metrics.score} size="lg" showOutOf /></div>
            <div className="mt-3"><ScoreDeltaChip delta={delta} /></div>
            <div className="mt-4 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
              <div className="rounded-md bg-kinnso-cream2 px-2 py-2"><div className="text-kinnso-muted">{t.avgLikes}</div><div className="k-mono font-bold text-kinnso-ink">3,400</div></div>
              <div className="rounded-md bg-kinnso-cream2 px-2 py-2"><div className="text-kinnso-muted">{t.avgSaves}</div><div className="k-mono font-bold text-kinnso-ink">980</div></div>
              <div className="rounded-md bg-kinnso-cream2 px-2 py-2"><div className="text-kinnso-muted">{t.er}</div><div className="k-mono font-bold text-kinnso-ink">{(metrics.er * 100).toFixed(1)}%</div></div>
              <div className="rounded-md bg-kinnso-cream2 px-2 py-2"><div className="text-kinnso-muted">{t.travel}</div><div className="k-mono font-bold text-kinnso-ink">69%</div></div>
            </div>
            <div className="mt-5"><TierBadge tier={metrics.tier} className="text-base" /></div>
            <p className="mt-2 text-xs text-kinnso-muted">{tierMeta[metrics.tier].payout} · {tierMeta[metrics.tier].commission} {t.commission}</p>
            <div className="mt-4 flex items-center justify-center gap-2">
              {TIER_ORDER.map((tier, i) => (
                <React.Fragment key={tier}>
                  <span className={`rounded-pill px-2.5 py-1 text-[11px] font-semibold ${i === tierIdx ? "bg-kinnso-orange text-white" : "bg-kinnso-cream2 text-kinnso-muted"}`}>{tier.charAt(0).toUpperCase() + tier.slice(1)}</span>
                  {i < TIER_ORDER.length - 1 && <span aria-hidden="true" className="text-kinnso-muted">▸</span>}
                </React.Fragment>
              ))}
            </div>
          </TicketCard>

          {/* 5 · Score breakdown */}
          <ScoreBreakdownPanel breakdown={breakdown} />

          {/* 6 · Trend */}
          <section className="k-card p-5">
            <h3 className="text-base font-bold text-kinnso-ink">{t.engagementOverTime}{sampleChip}</h3>
            <div className="mt-3"><EngagementTrendChart history={history} /></div>
          </section>

          {/* 7 · Audience */}
          <section className="k-card p-5">
            <h3 className="text-base font-bold text-kinnso-ink">{t.yourAudience}{sampleChip}</h3>
            <div className="mt-3 flex h-5 w-full overflow-hidden rounded-pill">
              <div className="bg-kinnso-orange" style={{ width: `${metrics.audience.hk}%` }} title={`HK ${metrics.audience.hk}%`} />
              <div className="bg-kinnso-amber"  style={{ width: `${metrics.audience.tw}%` }} title={`TW ${metrics.audience.tw}%`} />
              <div className="bg-kinnso-blue"   style={{ width: `${metrics.audience.sg}%` }} title={`SG ${metrics.audience.sg}%`} />
              <div className="bg-kinnso-cream2" style={{ width: `${metrics.audience.other}%` }} />
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-kinnso-muted">
              <span>🇭🇰 HK {metrics.audience.hk}%</span>
              <span>🇹🇼 TW {metrics.audience.tw}%</span>
              <span>🇸🇬 SG {metrics.audience.sg}%</span>
              <span>{t.audienceOther} {metrics.audience.other}%</span>
            </div>
          </section>

          {/* 8 · Content mix */}
          <section className="k-card p-5">
            <h3 className="text-base font-bold text-kinnso-ink">{t.whatYouCreate}{sampleChip}</h3>
            <div className="mt-3"><ContentMixDonut data={metrics.contentMix} size={180} /></div>
          </section>

          {/* 9 · Map + places */}
          <section className="k-card p-5">
            <h3 className="text-base font-bold text-kinnso-ink">{t.placesCovered}{sampleChip}</h3>
            <p className="text-xs text-kinnso-muted">{t.placesCoveredSub.replace("{countries}", String(metrics.countries)).replace("{cities}", String(metrics.cities))}</p>
            <div className="mt-3"><WorldHeatmap locations={locs} onCityClick={setSelectedCity} /></div>
            <div className="mt-4 flex flex-wrap gap-2">
              {locs.map((l) => <CityChip key={l.city} city={l.city} posts={l.postCount} flag={l.flag} onClick={() => setSelectedCity(l)} />)}
            </div>
            <h4 className="mt-6 text-xs font-bold uppercase tracking-wider text-kinnso-muted">{t.topVenues}</h4>
            <div className="mt-3 space-y-2">{places.slice(0, 5).map((p, i) => <PlaceTagRow key={i} place={p} />)}</div>
          </section>

          {/* 10 · Top posts */}
          <section className="k-card p-5">
            <h3 className="text-base font-bold text-kinnso-ink">{t.bestTravelPosts}{sampleChip}</h3>
            <p className="text-xs text-kinnso-muted">{t.rankedByEngagement}</p>
            <div className="mt-3"><PostThumbnailGrid posts={topPosts} cols={6} /></div>
          </section>

          {/* 11 · Tag cloud */}
          <section className="k-card p-5">
            <h3 className="text-base font-bold text-kinnso-ink">{t.knownFor}{sampleChip}</h3>
            <div className="mt-3"><TagCloud tags={metrics.topTags} /></div>
          </section>

          {/* 12 · Matched missions */}
          <section>
            <div className="-mx-4 mb-4 rounded-md bg-kinnso-orange/90 px-4 py-2 text-sm font-bold text-white sm:-mx-0 sm:rounded-lg">
              {t.matchedForYou}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {matched.map((m) => {
                const locked = TIER_ORDER.indexOf(m.tier) > tierIdx;
                return (
                  <div key={m.id} className={locked ? "relative opacity-80" : ""}>
                    {locked && (
                      <div className="absolute right-3 top-3 z-10 inline-flex items-center gap-1 rounded-pill bg-kinnso-red/15 px-2 py-1 text-[10px] font-bold text-kinnso-red">
                        <Lock className="h-3 w-3" /> {t.reachToUnlock.replace("{tier}", m.tier)}
                      </div>
                    )}
                    <MissionCard m={m} href={studioMissionsHref} />
                  </div>
                );
              })}
            </div>
            <button type="button" onClick={() => router.push(studioMissionsHref)} className="k-btn-ghost mt-4 text-sm">
              {t.viewAllMissions} <ArrowRight className="ml-1 inline h-3 w-3" />
            </button>
          </section>
          </>
          )}

          {/* Footer actions — demo only (real public profile + share land in a later slice) */}
          {isDemo && (
            <section className="space-y-3">
              <button
                type="button"
                onClick={() => { router.push(publicProfileHref); }}
                className="k-btn-primary w-full"
              >
                {t.publishProfile}
              </button>
              <button type="button" onClick={() => setShareOpen(true)} className="k-btn-ghost w-full">
                <Share2 className="mr-2 inline h-4 w-4" /> {t.shareDnaCard}
              </button>
            </section>
          )}
        </div>
      </div>

      {/* Share + city drawer are demo-only — they render mock fixture data and
          must not appear in a real-creator view. */}
      {isDemo && (
        <CityDetailDrawer open={!!selectedCity} onOpenChange={(o) => !o && setSelectedCity(null)} location={selectedCity} posts={posts} places={places} />
      )}
      {isDemo && (
        <ShareDnaDialog
          open={shareOpen}
          onOpenChange={setShareOpen}
          creator={metrics}
          profilePath={publicProfileHref}
        />
      )}
    </div>
  );
}

export default StudioScanView;
