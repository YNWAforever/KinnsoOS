interface BarRowProps {
  label: string
  value: number
  max: number
}

/**
 * Accessible labelled horizontal bar. The track is decorative (aria-hidden);
 * the row exposes an aria-label of "label: value" so screen readers get the datum.
 */
export function BarRow({ label, value, max }: BarRowProps) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="w-40 shrink-0 text-muted-foreground">{label}</span>
      <div
        role="img"
        aria-label={`${label}: ${value}`}
        className="relative h-2 flex-1 overflow-hidden rounded bg-kinnso-cream2"
      >
        <div aria-hidden="true" className="h-full rounded bg-primary" style={{ width: `${pct}%` }} />
      </div>
      <span className="w-10 shrink-0 text-right tabular-nums">{value}</span>
    </div>
  )
}
