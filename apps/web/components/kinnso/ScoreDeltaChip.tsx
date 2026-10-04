import { ChevronDown, ChevronUp, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  delta: number; // signed
  className?: string;
}

const ScoreDeltaChip = ({ delta, className }: Props) => {
  if (delta === 0) {
    return (
      <span className={cn("inline-flex items-center gap-1 rounded-pill bg-kinnso-cream2 px-2.5 py-1 text-xs font-semibold text-kinnso-muted", className)}>
        <Minus className="h-3 w-3" /> Unchanged
      </span>
    );
  }
  const positive = delta > 0;
  return (
    <span className={cn(
      "inline-flex items-center gap-1 rounded-pill px-2.5 py-1 text-xs font-semibold",
      positive ? "bg-kinnso-green/15 text-kinnso-green" : "bg-kinnso-red/15 text-kinnso-red",
      className
    )}>
      {positive ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      {positive ? "+" : ""}{delta} since last scan
    </span>
  );
};

export default ScoreDeltaChip;
