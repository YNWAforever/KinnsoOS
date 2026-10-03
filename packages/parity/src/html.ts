// Targeted, dependency-free extractors for the few deterministic <head> tags Next emits.
// (Regex on HTML is acceptable here because the inputs are framework-generated and well-formed;
//  unit tests pin the exact shapes we rely on.)

export function extractJsonLd(html: string): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = []
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  for (const m of html.matchAll(re)) {
    try {
      const parsed = JSON.parse(m[1].trim())
      if (Array.isArray(parsed)) out.push(...parsed)
      else out.push(parsed)
    } catch {
      // skip malformed block
    }
  }
  return out
}

export function extractHreflangs(html: string): Map<string, string> {
  const map = new Map<string, string>()
  for (const m of html.matchAll(/<link\b[^>]*\brel=["']alternate["'][^>]*>/gi)) {
    const tag = m[0]
    const hreflang = /\bhreflang=["']([^"']+)["']/i.exec(tag)?.[1]
    const href = /\bhref=["']([^"']+)["']/i.exec(tag)?.[1]
    if (hreflang && href) map.set(hreflang, href)
  }
  return map
}

export function extractMeta(html: string, attr: 'name' | 'property', key: string): string | null {
  const safe = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const tag = new RegExp(`<meta\\b[^>]*\\b${attr}=["']${safe}["'][^>]*>`, 'i').exec(html)?.[0]
  if (!tag) return null
  return /\bcontent=["']([^"']*)["']/i.exec(tag)?.[1] ?? null
}

export function extractCanonical(html: string): string | null {
  const tag = /<link\b[^>]*\brel=["']canonical["'][^>]*>/i.exec(html)?.[0]
  if (!tag) return null
  return /\bhref=["']([^"']+)["']/i.exec(tag)?.[1] ?? null
}
