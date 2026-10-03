export interface TrendPoint {
  label: string
  value: number
}

/** Minimal dependency-free bar sparkline. Heights are scaled to the series max. */
export function TrendChart({
  points,
  emptyText,
  ariaLabel,
}: {
  points: TrendPoint[]
  emptyText: string
  ariaLabel?: string
}) {
  if (points.length === 0) {
    return <p className="py-6 text-sm text-kinnso-muted">{emptyText}</p>
  }
  const max = Math.max(...points.map((p) => p.value), 1)
  return (
    <div className="flex h-24 items-end gap-1" role="img" aria-label={ariaLabel}>
      {points.map((p, i) => (
        <div
          key={`${p.label}-${i}`}
          data-testid="trend-bar"
          title={`${p.label}: ${p.value}`}
          className="flex-1 rounded-t bg-kinnso-orange/70"
          style={{ height: `${Math.round((p.value / max) * 100)}%` }}
        />
      ))}
    </div>
  )
}

export default TrendChart
