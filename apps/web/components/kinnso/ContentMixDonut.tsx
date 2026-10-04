interface Slice { tag: string; pct: number; color: string }

interface Props {
  data: Slice[];
  size?: number;
  showLegend?: boolean;
}

const ContentMixDonut = ({ data, size = 180, showLegend = true }: Props) => {
  const total = data.reduce((s, d) => s + d.pct, 0) || 1;
  const r = size / 2 - 14;
  const c = 2 * Math.PI * r;
  // Pre-compute cumulative offsets outside JSX to avoid mutation inside map
  const offsets = data.reduce<number[]>((acc, d) => {
    const prev = acc.length > 0 ? acc[acc.length - 1] : 0;
    const len = (d.pct / total) * c;
    return [...acc, prev + len];
  }, []);
  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90 shrink-0">
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="hsl(var(--k-cream2))" strokeWidth="20" />
        {data.map((d, i) => {
          const len = (d.pct / total) * c;
          const offset = i === 0 ? 0 : offsets[i - 1];
          return <circle
            key={d.tag}
            cx={size/2} cy={size/2} r={r}
            fill="none"
            stroke={d.color}
            strokeWidth="20"
            strokeDasharray={`${len} ${c}`}
            strokeDashoffset={-offset}
          />;
        })}
      </svg>
      {showLegend && (
        <ul className="space-y-1.5 text-sm">
          {data.map((d) => (
            <li key={d.tag} className="flex items-center gap-2">
              <span className="inline-block h-3 w-3 rounded-sm" style={{ background: d.color }} />
              <span className="font-semibold text-kinnso-ink">{d.tag}</span>
              <span className="k-mono text-kinnso-muted">{d.pct}%</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default ContentMixDonut;
