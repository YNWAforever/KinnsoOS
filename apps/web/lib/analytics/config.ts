export type AnalyticsMode = 'disabled' | 'test' | 'production'

type AnalyticsEnvironment = Record<string, string | undefined>

const ANALYTICS_MODES = new Set<AnalyticsMode>(['disabled', 'test', 'production'])

export function getAnalyticsMode(env: AnalyticsEnvironment = process.env): AnalyticsMode {
  const mode = env.ANALYTICS_INGEST_MODE ?? env.NEXT_PUBLIC_ANALYTICS_MODE
  return mode !== undefined && ANALYTICS_MODES.has(mode as AnalyticsMode)
    ? (mode as AnalyticsMode)
    : 'disabled'
}
