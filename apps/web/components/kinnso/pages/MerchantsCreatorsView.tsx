'use client'
import React, { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Filter, Search, X, Lock } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import CreatorMatchCard from "@/components/kinnso/CreatorMatchCard";
import CreatorFilterDrawer, { defaultFilters, type Facets } from "@/components/kinnso/CreatorFilterDrawer";
import { rankCreators, type RankedCreator, type CreatorFilters } from "@/lib/merchants/relevance";
import { tierPolicy, type MerchantTier } from "@/lib/merchants/tier-policy";
import type { ActionResult } from "@/lib/admin/result";
import type { Locale } from "@/lib/i18n/config";
import type { Messages } from "@/lib/i18n/messages/en";

type SearchMessages = Messages['merchantSearch'];

type InviteResult = ActionResult<{ inviteId: string }>;
type SavedResult = ActionResult<{ creatorId: string }>;

interface PublishedMission {
  id: string;
  title: string;
}

interface Props {
  locale: Locale;
  t: SearchMessages;
  ranked: RankedCreator[];
  tier: MerchantTier;
  facets: Facets;
  savedIds: string[];
  workingHandles: string[];
  invitesRemaining: number;
  publishedMissions: PublishedMission[];
  onInvite: (missionId: string, creatorId: string) => InviteResult | Promise<InviteResult>;
  onSave: (creatorId: string) => SavedResult | Promise<SavedResult>;
  onUnsave: (creatorId: string) => SavedResult | Promise<SavedResult>;
  onNote: (creatorId: string, note: string) => SavedResult | Promise<SavedResult>;
}

const MerchantsCreatorsView: React.FC<Props> = ({
  locale,
  t,
  ranked,
  tier,
  facets,
  savedIds,
  workingHandles,
  invitesRemaining,
  publishedMissions,
  onInvite,
  onSave,
  onUnsave,
  onNote,
}) => {
  const router = useRouter();
  const policy = tierPolicy(tier);
  const [filterOpen, setFilterOpen] = useState(false);
  const [filters, setFilters] = useState<CreatorFilters>(defaultFilters);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<"recommended" | "saved" | "working">("recommended");
  const [briefCreatorId, setBriefCreatorId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Optimistic local state, reconciled with the server via router.refresh() on
  // every successful mutation. Keyed on creatorId (not handle).
  const [savedSet, setSavedSet] = useState<Set<string>>(() => new Set(savedIds));
  const [invitedSet, setInvitedSet] = useState<Set<string>>(() => new Set());
  const [invitesLeft, setInvitesLeft] = useState(invitesRemaining);

  // Re-rank the underlying creators against the active honest filters (Growth
  // only — Free can't open the drawer). Then apply the free-text name/handle
  // search. Recommended is capped on Free via the tier policy.
  const filteredRanked = useMemo(() => {
    const base = policy.filtersUnlocked
      ? rankCreators(ranked.map((r) => r.creator), filters)
      : ranked;
    const q = query.trim().toLowerCase();
    if (!q) return base;
    return base.filter((r) => `${r.creator.name} @${r.creator.handle}`.toLowerCase().includes(q));
  }, [ranked, filters, query, policy.filtersUnlocked]);

  const recommended = useMemo(
    () => (policy.resultCap == null ? filteredRanked : filteredRanked.slice(0, policy.resultCap)),
    [filteredRanked, policy.resultCap],
  );
  const isCapped = policy.resultCap != null && filteredRanked.length > policy.resultCap;

  const savedCreators = useMemo(
    () => ranked.filter((r) => savedSet.has(r.creator.id)),
    [ranked, savedSet],
  );
  const workingCreators = useMemo(
    () => ranked.filter((r) => workingHandles.includes(r.creator.handle)),
    [ranked, workingHandles],
  );

  const openFilters = () => {
    if (policy.filtersUnlocked) setFilterOpen(true);
  };

  // Save/unsave: optimistically toggle the local saved set so the bookmark fills
  // immediately, then reconcile with the revalidated server truth on success.
  const toggleSave = async (creatorId: string) => {
    setActionError(null);
    const wasSaved = savedSet.has(creatorId);
    const result = wasSaved ? await onUnsave(creatorId) : await onSave(creatorId);
    if (result.ok) {
      setSavedSet((prev) => {
        const next = new Set(prev);
        if (wasSaved) next.delete(creatorId);
        else next.add(creatorId);
        return next;
      });
      router.refresh();
    } else {
      setActionError(result.errors.form?.[0] ?? t.inviteFailed);
    }
  };

  // Persist the merchant's private note, then reconcile.
  const saveNote = async (creatorId: string, note: string) => {
    setActionError(null);
    const result = await onNote(creatorId, note);
    if (result.ok) router.refresh();
    else setActionError(result.errors.form?.[0] ?? t.inviteFailed);
  };

  // Invite: on success mark the creator "Invited", decrement the displayed
  // counter (spec §6), then reconcile with the server.
  const sendInvite = async (missionId: string, creatorId: string) => {
    setActionError(null);
    const result = await onInvite(missionId, creatorId);
    if (result.ok) {
      setInvitedSet((prev) => new Set(prev).add(creatorId));
      setInvitesLeft((n) => Math.max(0, n - 1));
      router.refresh();
    } else {
      setActionError(result.errors.form?.[0] ?? t.inviteFailed);
    }
  };

  const viewProfile = (handle: string) => {
    if (typeof window !== "undefined") window.open(`/${locale}/c/${handle}`, "_blank");
  };

  return (
    <>
      <div className="k-container py-10">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-black text-kinnso-ink md:text-4xl">{t.heading}</h1>
            <p className="mt-1 text-sm text-kinnso-muted">{t.sub}</p>
          </div>
          <div className="k-ticket px-4 py-2 text-xs">
            <span className="rounded-pill bg-white px-2 py-0.5 text-kinnso-ink">
              {t.invitesLeft.replace('{count}', String(invitesLeft))}
            </span>
          </div>
        </div>

        {/* Mutation errors surface here, mirroring the sibling views. */}
        {actionError && (
          <p
            role="alert"
            className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700"
          >
            {actionError}
          </p>
        )}

        {/* Search + filter bar */}
        <div className="sticky top-16 z-30 -mx-4 mt-6 bg-kinnso-cream/90 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-pill sm:px-2">
          <div className="flex items-center gap-2">
            <div className="flex flex-1 items-center gap-2 rounded-pill bg-white px-4 py-2 ring-1 ring-kinnso-cream2">
              <Search className="h-4 w-4 text-kinnso-muted" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t.searchPlaceholder}
                className="flex-1 bg-transparent text-sm outline-none"
              />
              {query && (
                <button type="button" onClick={() => setQuery("")}>
                  <X className="h-4 w-4 text-kinnso-muted" />
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={openFilters}
              disabled={!policy.filtersUnlocked}
              aria-disabled={!policy.filtersUnlocked}
              title={!policy.filtersUnlocked ? t.filtersLocked : undefined}
              className="k-btn-ghost shrink-0 disabled:opacity-50"
            >
              {policy.filtersUnlocked ? (
                <Filter className="mr-1 inline h-4 w-4" />
              ) : (
                <Lock className="mr-1 inline h-4 w-4" />
              )}{" "}
              {t.filter}
            </button>
          </div>
        </div>

        {/* Upgrade banner (free only) */}
        {!policy.filtersUnlocked && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-kinnso-amber/30 px-5 py-4">
            <div>
              <h3 className="text-sm font-black text-kinnso-ink">{t.upgradeTitle}</h3>
              <p className="text-xs text-kinnso-muted">{t.upgradeBlurb}</p>
            </div>
            <button type="button" className="k-btn-primary text-sm">{t.upgradeCta}</button>
          </div>
        )}

        {/* Tabs */}
        <Tabs value={tab} onValueChange={(value) => setTab(value as typeof tab)} className="mt-6">
          <TabsList className="bg-kinnso-cream2">
            <TabsTrigger value="recommended">
              {t.tabRecommended}{" "}
              <span className="ml-2 rounded-pill bg-kinnso-orange/20 px-1.5 py-0.5 text-[10px] text-kinnso-orange">{recommended.length}</span>
            </TabsTrigger>
            <TabsTrigger value="saved">
              {t.tabSaved}{" "}
              <span className="ml-2 rounded-pill bg-kinnso-amber/40 px-1.5 py-0.5 text-[10px] text-kinnso-ink">{savedCreators.length}</span>
            </TabsTrigger>
            <TabsTrigger value="working">
              {t.tabWorking}{" "}
              <span className="ml-2 rounded-pill bg-kinnso-green/15 px-1.5 py-0.5 text-[10px] text-kinnso-green">{workingCreators.length}</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="recommended" className="mt-5 space-y-4">
            {recommended.length === 0 && <p className="text-sm text-kinnso-muted">{t.emptyRecommended}</p>}
            {recommended.map((r) => (
              <CreatorMatchCard
                key={r.creator.id}
                ranked={r}
                saved={savedSet.has(r.creator.id)}
                invited={invitedSet.has(r.creator.id)}
                t={t}
                onSave={toggleSave}
                onView={viewProfile}
                onSendBrief={setBriefCreatorId}
              />
            ))}
            {isCapped && <p className="text-center text-xs text-kinnso-muted">{t.resultsCapped}</p>}
          </TabsContent>

          <TabsContent value="saved" className="mt-5 space-y-4">
            {savedCreators.length === 0 && <p className="text-sm text-kinnso-muted">{t.emptySaved}</p>}
            {savedCreators.map((r) => (
              <div key={r.creator.id}>
                <CreatorMatchCard
                  ranked={r}
                  saved
                  invited={invitedSet.has(r.creator.id)}
                  t={t}
                  onSave={toggleSave}
                  onView={viewProfile}
                  onSendBrief={setBriefCreatorId}
                />
                <div className="-mt-1 rounded-b-lg bg-kinnso-cream2 px-4 py-2">
                  <input
                    placeholder={t.addNote}
                    defaultValue=""
                    onBlur={(e) => saveNote(r.creator.id, e.target.value)}
                    className="w-full bg-transparent text-xs text-kinnso-ink outline-none placeholder:text-kinnso-muted"
                  />
                </div>
              </div>
            ))}
          </TabsContent>

          <TabsContent value="working" className="mt-5 space-y-4">
            {workingCreators.length === 0 && <p className="text-sm text-kinnso-muted">{t.emptyWorking}</p>}
            {workingCreators.map((r) => (
              <CreatorMatchCard
                key={r.creator.id}
                ranked={r}
                saved={savedSet.has(r.creator.id)}
                invited={invitedSet.has(r.creator.id)}
                t={t}
                onSave={toggleSave}
                onView={viewProfile}
                onSendBrief={setBriefCreatorId}
              />
            ))}
          </TabsContent>
        </Tabs>
      </div>

      <CreatorFilterDrawer
        open={filterOpen}
        onOpenChange={setFilterOpen}
        value={filters}
        onChange={setFilters}
        facets={facets}
        t={t}
      />

      {/* Send-brief mission picker */}
      <Dialog open={!!briefCreatorId} onOpenChange={(o) => !o && setBriefCreatorId(null)}>
        <DialogContent className="bg-kinnso-cream">
          <DialogHeader>
            <DialogTitle className="text-kinnso-ink">{t.pickMissionTitle}</DialogTitle>
            <DialogDescription className="sr-only">{t.sub}</DialogDescription>
          </DialogHeader>
          {publishedMissions.length === 0 ? (
            <p className="text-sm text-kinnso-muted">{t.pickMissionEmpty}</p>
          ) : (
            <div className="space-y-2">
              {publishedMissions.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    const creatorId = briefCreatorId;
                    setBriefCreatorId(null);
                    if (creatorId) void sendInvite(m.id, creatorId);
                  }}
                  disabled={invitesLeft <= 0}
                  aria-disabled={invitesLeft <= 0}
                  className="block w-full rounded-lg bg-white px-4 py-3 text-left text-sm text-kinnso-ink ring-1 ring-kinnso-cream2 hover:bg-kinnso-cream2 disabled:opacity-50"
                >
                  {m.title}
                </button>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

export { MerchantsCreatorsView };
export default MerchantsCreatorsView;
