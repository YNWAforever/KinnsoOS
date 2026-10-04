'use client'

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { ScoreBreakdown } from "@/lib/creator-mock";

interface Props {
  breakdown: ScoreBreakdown;
}

const ROWS: { key: keyof ScoreBreakdown; label: string; weight: string; tip: string; max: number }[] = [
  { key: "reach",     label: "Reach",                 weight: "30%", max: 30, tip: "Based on your total followers across platforms" },
  { key: "er",        label: "Engagement rate",       weight: "25%", max: 25, tip: "Saves weighted 3× — they signal strong intent" },
  { key: "travel",    label: "Travel content focus",  weight: "20%", max: 20, tip: "Percentage of recent posts classified as travel" },
  { key: "diversity", label: "Country diversity",     weight: "15%", max: 15, tip: "More countries = broader merchant reach (capped at 10)" },
  { key: "recency",   label: "Recent travel activity",weight: "10%", max: 10, tip: "Are you still actively posting travel content?" },
];

const ScoreBreakdownPanel = ({ breakdown }: Props) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="k-card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-5 py-3.5 text-left"
      >
        <span className="text-sm font-bold text-kinnso-ink">How is my score calculated?</span>
        <ChevronDown className={`h-4 w-4 text-kinnso-muted transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="space-y-3 border-t border-kinnso-cream2 p-5">
          {ROWS.map((r) => {
            const val = breakdown[r.key] as number;
            const pct = Math.min(100, (val / r.max) * 100);
            return (
              <div key={r.key}>
                <div className="flex items-center justify-between text-sm">
                  <span className="font-semibold text-kinnso-ink">{r.label}</span>
                  <span className="k-mono text-kinnso-muted">{val} / {r.max} pts · {r.weight}</span>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-pill bg-kinnso-cream2">
                  <div className="h-full bg-kinnso-orange transition-all" style={{ width: `${pct}%` }} />
                </div>
                <p className="mt-1 text-xs text-kinnso-muted">{r.tip}</p>
              </div>
            );
          })}
          <div className="border-t border-kinnso-cream2 pt-3 text-sm font-bold text-kinnso-ink">
            Total: {breakdown.total} pts → score {Math.round(breakdown.total + 6)}
          </div>
        </div>
      )}
    </div>
  );
};

export default ScoreBreakdownPanel;
