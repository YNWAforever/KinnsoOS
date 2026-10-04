import { Instagram, MessageCircle, Youtube } from "lucide-react";

interface Props {
  platform: "instagram" | "threads" | "youtube";
  followers: number;
  avgEng: number;
  travelPct: number;
}

const META = {
  instagram: { label: "Instagram", Icon: Instagram },
  threads:   { label: "Threads",   Icon: MessageCircle },
  youtube:   { label: "YouTube",   Icon: Youtube },
};

const PlatformStatCard = ({ platform, followers, avgEng, travelPct }: Props) => {
  const { label, Icon } = META[platform];
  const disabled = followers === 0;
  return (
    <div className="k-card p-5">
      <div className="flex items-center gap-2 text-kinnso-muted">
        <Icon className="h-4 w-4" />
        <span className="text-xs font-bold uppercase tracking-wider">{label}</span>
      </div>
      {disabled ? (
        <p className="mt-3 text-sm text-kinnso-muted">Not connected</p>
      ) : (
        <>
          <div className="mt-2 text-2xl font-black text-kinnso-ink">{followers.toLocaleString()}</div>
          <div className="text-xs text-kinnso-muted">followers</div>
          <div className="mt-3 flex items-center justify-between text-xs text-kinnso-muted">
            <span>Avg eng. <span className="k-mono text-kinnso-ink">{avgEng.toLocaleString()}</span></span>
            <span className="rounded-pill bg-kinnso-orange/15 px-2 py-0.5 font-semibold text-kinnso-orange">
              {travelPct}% travel
            </span>
          </div>
        </>
      )}
    </div>
  );
};

export default PlatformStatCard;
