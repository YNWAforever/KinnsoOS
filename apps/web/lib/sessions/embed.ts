// apps/web/lib/sessions/embed.ts
export type ParsedSessionEmbed = { id: string; embedUrl: string; watchUrl: string }

/**
 * YouTube-only in P1 (D-R5-2) — validates and normalizes a host-supplied embed_url
 * or replay_url into a sandboxed youtube-nocookie.com embed src plus the original
 * watch URL. Mirrors lib/missions/proof-url.ts's YouTube branch (watch/shorts/embed/
 * live/youtu.be forms), scoped to this one platform rather than shared, since the
 * two features' URL shapes and callers differ.
 */
export function parseSessionEmbedUrl(input: string): ParsedSessionEmbed | null {
  let url: URL
  try {
    url = new URL(input.trim())
  } catch {
    return null
  }
  const host = url.hostname.replace(/^(?:www|m)\./i, '').toLowerCase()
  const parts = url.pathname.split('/').filter(Boolean)
  let id: string | null = null

  if (host === 'youtube.com') {
    if (parts[0] === 'watch') {
      id = url.searchParams.get('v')
    } else {
      const i = parts.findIndex((p) => p === 'shorts' || p === 'embed' || p === 'live')
      if (i >= 0 && parts[i + 1]) id = parts[i + 1]
    }
  } else if (host === 'youtu.be') {
    id = parts[0] ?? null
  }

  if (!id) return null
  return {
    id,
    embedUrl: `https://www.youtube-nocookie.com/embed/${id}`,
    watchUrl: `https://www.youtube.com/watch?v=${id}`,
  }
}
