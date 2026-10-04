const errorName = (error: unknown) => error instanceof Error ? error.name : 'UnknownError'

const OPTIONAL_SCHEMA_CODES = new Set([
  '42P01',
  '42703',
  '42883',
  'PGRST200',
  'PGRST202',
  'PGRST204',
  'PGRST205',
])

const OPTIONAL_TRANSIENT_CODES = new Set([
  '40001',
  '40P01',
  '53300',
  '57014',
  '57P01',
  'PGRST000',
  'PGRST001',
  'PGRST002',
])

function record(module: string, error: unknown) {
  console.error('optional-module-failed', { module, errorName: errorName(error) })
}

export async function optionalQuery<T>(
  module: string,
  load: () => Promise<T>,
  fallback: T,
): Promise<T> {
  try { return await load() } catch (error) { record(module, error); return fallback }
}

function optionalEnrichmentErrorCode(error: unknown): string | null {
  if (typeof error !== 'object' || error === null || !('code' in error)) return null
  return typeof error.code === 'string' ? error.code.toUpperCase() : null
}

function isPostgrestFetchNetworkError(error: unknown, code: string | null): boolean {
  if (code !== '' || typeof error !== 'object' || error === null) return false
  const value = error as Record<string, unknown>
  if (typeof value.message !== 'string' || typeof value.details !== 'string' || typeof value.hint !== 'string') {
    return false
  }
  return /^(?:TypeError: (?:fetch failed|Failed to fetch|Load failed|Network request failed)|FetchError: |NetworkError: |AbortError: )/.test(
    value.message,
  )
}

function isRecognizedOptionalEnrichmentError(error: unknown): boolean {
  const code = optionalEnrichmentErrorCode(error)
  return code !== null
    && (code.startsWith('08')
      || OPTIONAL_SCHEMA_CODES.has(code)
      || OPTIONAL_TRANSIENT_CODES.has(code)
      || isPostgrestFetchNetworkError(error, code))
}

export async function optionalEnrichmentQuery<T>(
  module: string, load: () => Promise<T>, fallback: T,
): Promise<T> {
  try { return await load() } catch (error) {
    if (!isRecognizedOptionalEnrichmentError(error)) throw error
    record(module, error)
    return fallback
  }
}

export function optionalValue<T>(module: string, build: () => T, fallback: T): T {
  try { return build() } catch (error) { record(module, error); return fallback }
}
