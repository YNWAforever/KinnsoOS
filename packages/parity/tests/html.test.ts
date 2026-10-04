import { describe, it, expect } from 'vitest'
import { extractJsonLd, extractHreflangs, extractMeta, extractCanonical } from '../src/html'

const HTML = `
<html><head>
<link rel="canonical" href="https://x.test/en/articles/dining/ramen-guide"/>
<link rel="alternate" hreflang="en" href="https://x.test/en/articles/dining/ramen-guide"/>
<link rel="alternate" hreflang="zh-hk" href="https://x.test/zh-hk/articles/dining/ramen-guide"/>
<link rel="alternate" hreflang="x-default" href="https://x.test/en/articles/dining/ramen-guide"/>
<meta property="og:type" content="article"/>
<meta name="robots" content="noindex, follow"/>
<script type="application/ld+json">[{"@type":"Article","dateModified":"2026-06-12"},{"@type":"BreadcrumbList"}]</script>
<script type="application/ld+json">{"@type":"FAQPage"}</script>
</head><body></body></html>`

describe('html extractors', () => {
  it('flattens JSON-LD across scripts and arrays', () => {
    const ld = extractJsonLd(HTML)
    const types = ld.map((o) => o['@type'])
    expect(types).toEqual(['Article', 'BreadcrumbList', 'FAQPage'])
  })

  it('skips malformed JSON-LD without throwing', () => {
    expect(extractJsonLd('<script type="application/ld+json">{not json}</script>')).toEqual([])
  })

  it('reads hreflang link map', () => {
    const map = extractHreflangs(HTML)
    expect([...map.keys()].sort()).toEqual(['en', 'x-default', 'zh-hk'])
    expect(map.get('x-default')).toContain('/en/')
  })

  it('reads meta by name and property, and canonical', () => {
    expect(extractMeta(HTML, 'property', 'og:type')).toBe('article')
    expect(extractMeta(HTML, 'name', 'robots')).toBe('noindex, follow')
    expect(extractMeta(HTML, 'name', 'missing')).toBeNull()
    expect(extractCanonical(HTML)).toContain('/en/articles/dining/ramen-guide')
  })
})
