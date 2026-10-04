export function entityMediaHue(seed: string): number {
  let hash = 0
  for (const char of seed.normalize('NFKC').trim().toLowerCase()) {
    hash = (hash * 31 + char.codePointAt(0)!) >>> 0
  }
  return hash % 360
}

export function isApprovedEntityMediaUrl(value: string | null | undefined): boolean {
  if (!value) return false

  try {
    const url = new URL(value)
    return url.protocol === 'https:' && url.hostname === 'cdn.kinnso.ai'
  } catch {
    return false
  }
}
