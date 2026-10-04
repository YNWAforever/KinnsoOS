'use client'

import { cn } from "@/lib/utils";

interface Props {
  city: string;
  posts?: number;
  flag?: string;
  onClick?: () => void;
  active?: boolean;
  className?: string;
}

const CityChip = ({ city, posts, flag, onClick, active, className }: Props) => (
  <button
    type="button"
    onClick={onClick}
    className={cn(
      "inline-flex items-center gap-1.5 rounded-pill border px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] transition",
      active
        ? "border-kinnso-orange bg-kinnso-orange text-white"
        : "border-kinnso-ink bg-white text-kinnso-ink hover:bg-kinnso-cream2",
      className
    )}
  >
    {flag && <span aria-hidden>{flag}</span>}
    <span>{city}</span>
    {posts !== undefined && <span className="opacity-70">({posts})</span>}
  </button>
);

export default CityChip;
