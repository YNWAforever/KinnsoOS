import { cn } from "@/lib/utils";
import { tierMeta, type Tier } from "@/lib/creator-mock";

interface Props {
  tier: Tier;
  score?: number;
  className?: string;
  showScore?: boolean;
}

const TierBadge = ({ tier, score, className, showScore }: Props) => {
  const meta = tierMeta[tier];
  return (
    <span className={cn("k-pill", meta.tone, className)}>
      {meta.label}
      {showScore && score !== undefined && <span className="k-mono ml-2 opacity-70">· {score}</span>}
    </span>
  );
};

export default TierBadge;
