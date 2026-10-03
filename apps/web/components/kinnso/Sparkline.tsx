interface SparklineProps {
  values: number[]
  label: string
  width?: number
  height?: number
}

/**
 * Tiny accessible line chart. `values` are plotted in order, scaled to fit.
 * The SVG is role="img" with an aria-label; shapes are aria-hidden. No deps.
 */
export function Sparkline({ values, label, width = 280, height = 64 }: SparklineProps) {
  const pad = 4
  const max = Math.max(1, ...values)
  const min = Math.min(0, ...values)
  const span = max - min || 1
  const stepX = values.length > 1 ? (width - pad * 2) / (values.length - 1) : 0
  const points = values
    .map((v, i) => {
      const x = pad + i * stepX
      const y = height - pad - ((v - min) / span) * (height - pad * 2)
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      height={height}
      preserveAspectRatio="none"
    >
      {values.length > 1 && (
        <polyline
          aria-hidden="true"
          points={points}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      )}
    </svg>
  )
}
