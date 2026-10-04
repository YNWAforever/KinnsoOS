import { Clock } from "lucide-react";

interface Props {
  lastScanned: string; // ISO or YYYY-MM-DD
  cooldownDays?: number;
}

const RescanStatusChip = ({ lastScanned, cooldownDays = 7 }: Props) => {
  const last = new Date(lastScanned);
  const days = Math.floor((Date.now() - last.getTime()) / (1000 * 60 * 60 * 24));
  const remaining = Math.max(0, cooldownDays - days);
  return (
    <span className="inline-flex items-center gap-1 rounded-pill bg-kinnso-cream2 px-2.5 py-1 text-xs text-kinnso-muted">
      <Clock className="h-3 w-3" />
      {remaining > 0 ? `Rescan in ${remaining}d` : `Last scanned ${days}d ago`}
    </span>
  );
};

export default RescanStatusChip;
