import { cn } from "@/lib/utils";

interface Props {
  score: number;             // 0-100
  size?: "sm" | "md" | "lg";
  className?: string;
  label?: string;
  showOutOf?: boolean;
}

const SIZE = {
  sm: { d: 52, stroke: 5,  num: "text-base"  },
  md: { d: 96, stroke: 8,  num: "text-2xl"   },
  lg: { d: 140, stroke: 11, num: "text-4xl"  },
} as const;

const ScoreRing = ({ score, size = "md", className, label, showOutOf }: Props) => {
  const { d, stroke, num } = SIZE[size];
  const r = (d - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - Math.max(0, Math.min(100, score)) / 100);
  return (
    <div className={cn("relative inline-grid place-items-center", className)} style={{ width: d, height: d }}>
      <svg width={d} height={d} className="-rotate-90">
        <circle cx={d/2} cy={d/2} r={r} stroke="hsl(var(--k-cream2))" strokeWidth={stroke} fill="none" />
        <circle
          cx={d/2} cy={d/2} r={r}
          stroke="hsl(var(--k-orange))" strokeWidth={stroke} fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 1.2s ease-out" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={cn("font-black text-kinnso-ink leading-none", num)}>{score}</span>
        {showOutOf && size !== "sm" && <span className="mt-0.5 text-[10px] text-kinnso-muted">/ 100</span>}
        {label && <span className="mt-0.5 text-[10px] uppercase tracking-wider text-kinnso-muted">{label}</span>}
      </div>
    </div>
  );
};

export default ScoreRing;
