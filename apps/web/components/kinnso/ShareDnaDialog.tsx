'use client'
import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Copy, Check } from "lucide-react";
import ScoreRing from "./ScoreRing";
import TierBadge from "./TierBadge";
import type { ExtendedCreator } from "@/lib/creator-mock";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  creator: ExtendedCreator;
  profilePath: string;
}

export const ShareDnaDialog: React.FC<Props> = ({ open, onOpenChange, creator, profilePath }) => {
  const [copied, setCopied] = useState(false);
  const link = `${typeof window !== "undefined" ? window.location.origin : ""}${profilePath}`;
  const copy = async () => {
    try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {}
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-kinnso-cream">
        <DialogHeader>
          <DialogTitle className="text-kinnso-ink">Share your DNA card</DialogTitle>
        </DialogHeader>
        <div className="mt-2 rounded-lg bg-gradient-to-br from-kinnso-orange to-kinnso-amber p-5 text-white">
          <div className="flex items-center gap-4">
            <img src={creator.avatar} alt={creator.name} className="h-16 w-16 rounded-full ring-2 ring-white" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-lg font-black">{creator.name}</div>
              <div className="k-mono text-sm opacity-80">@{creator.handle}</div>
            </div>
            <div className="rounded-xl bg-white p-2">
              <ScoreRing score={creator.score} size="sm" />
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between text-xs">
            <TierBadge tier={creator.tier} className="bg-white text-kinnso-ink" />
            <span className="opacity-90">{creator.countries} countries · {creator.cities} cities</span>
          </div>
        </div>
        <div className="mt-4 flex items-center gap-2 rounded-pill bg-white px-3 py-2 ring-1 ring-kinnso-cream2">
          <span className="k-mono flex-1 truncate text-xs text-kinnso-muted">{link}</span>
          <button onClick={copy} className="rounded-pill bg-kinnso-orange px-3 py-1 text-xs font-semibold text-white">
            {copied ? <span className="inline-flex items-center gap-1"><Check className="h-3 w-3" /> Copied</span> : <span className="inline-flex items-center gap-1"><Copy className="h-3 w-3" /> Copy link</span>}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ShareDnaDialog;
