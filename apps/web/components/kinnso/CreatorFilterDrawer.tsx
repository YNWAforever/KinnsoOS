'use client'

import type { ReactNode } from "react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { Checkbox } from "@/components/ui/checkbox";
import { TicketDivider } from "@/components/kinnso/MarketPassport";
import type { Messages } from "@/lib/i18n/messages/en";
import type { CreatorFilters } from "@/lib/merchants/relevance";

type SearchMessages = Messages['merchantSearch'];

const PILL_FOCUS =
  "outline-none transition focus-visible:ring-2 focus-visible:ring-kinnso-orange focus-visible:ring-offset-1";

export const defaultFilters: CreatorFilters = {
  niches: [],
  audienceGeos: [],
  languages: [],
  platforms: [],
  hasGuides: false,
};

export interface Facets {
  niches: string[];
  audienceGeos: string[];
  languages: string[];
  platforms: string[];
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  value: CreatorFilters;
  onChange: (v: CreatorFilters) => void;
  facets: Facets;
  t: SearchMessages;
}

function toggle<T>(arr: T[], v: T): T[] {
  return arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
}

const Section = ({ title, children }: { title: string; children: ReactNode }) => (
  <section className="py-4">
    <TicketDivider className="mb-4" />
    <h4 className="mb-3 text-xs font-bold uppercase tracking-wider text-kinnso-muted">{title}</h4>
    {children}
  </section>
);

const PillGroup = ({
  values,
  selected,
  onToggle,
}: {
  values: string[];
  selected: string[];
  onToggle: (v: string) => void;
}) => (
  <div className="flex flex-wrap gap-2">
    {values.map((v) => (
      <button
        key={v}
        type="button"
        onClick={() => onToggle(v)}
        className={`rounded-pill px-3 py-1 text-xs font-semibold ${PILL_FOCUS} ${
          selected.includes(v) ? "bg-kinnso-orange text-white" : "bg-kinnso-cream2 text-kinnso-ink"
        }`}
      >
        {v}
      </button>
    ))}
  </div>
);

export const CreatorFilterDrawer = ({ open, onOpenChange, value, onChange, facets, t }: Props) => {
  const v = value;
  const set = (patch: Partial<CreatorFilters>) => onChange({ ...v, ...patch });
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full max-w-md overflow-y-auto bg-kinnso-cream">
        <SheetHeader className="text-left">
          <SheetTitle className="text-kinnso-ink">{t.filter}</SheetTitle>
          <SheetDescription className="sr-only">{t.sub}</SheetDescription>
        </SheetHeader>

        <Section title={t.filterNiches}>
          <PillGroup values={facets.niches} selected={v.niches} onToggle={(x) => set({ niches: toggle(v.niches, x) })} />
        </Section>

        <Section title={t.filterGeos}>
          <PillGroup values={facets.audienceGeos} selected={v.audienceGeos} onToggle={(x) => set({ audienceGeos: toggle(v.audienceGeos, x) })} />
        </Section>

        <Section title={t.filterLanguages}>
          <PillGroup values={facets.languages} selected={v.languages} onToggle={(x) => set({ languages: toggle(v.languages, x) })} />
        </Section>

        <Section title={t.filterPlatforms}>
          <PillGroup values={facets.platforms} selected={v.platforms} onToggle={(x) => set({ platforms: toggle(v.platforms, x) })} />
        </Section>

        <Section title={t.filterHasGuides}>
          <label className="inline-flex items-center gap-2 text-sm text-kinnso-ink">
            <Checkbox checked={v.hasGuides} onCheckedChange={() => set({ hasGuides: !v.hasGuides })} />
            <span>{t.filterHasGuides}</span>
          </label>
        </Section>

        <SheetFooter className="mt-4 flex gap-2 sm:flex-row">
          <button type="button" onClick={() => onOpenChange(false)} className="k-btn-primary flex-1">{t.filter}</button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};

export default CreatorFilterDrawer;
