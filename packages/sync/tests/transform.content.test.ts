import { describe, it, expect } from 'vitest'
import { normalizeContent, deriveSummary } from '../src/transform/content'

const cdn = 'https://cdn.x'

describe('normalizeContent', () => {
  it('parses JSON text, assigns stable block-{index} ids, rewrites image refs, keeps unknown types verbatim', () => {
    const raw = JSON.stringify([
      { type: 'text', title: 'T', content: '<p>hi</p>', image: '{{image_path}}/a.webp' },
      { type: 'multiple-image', images: [{ thumbnail: 't.webp', original: 'o.webp', desc: 'd' }] },
      { type: 'attraction-box', attraction: 'x' },
    ])
    const blocks = normalizeContent(raw, cdn)
    expect(blocks[0].id).toBe('block-0')
    expect(blocks[0].image).toBe('https://cdn.x/a.webp')
    expect((blocks[1].images as any[])[0].original).toBe('https://cdn.x/o.webp')
    expect(blocks[2].type).toBe('attraction-box') // unknown-but-kept
  })
  it('returns [] for null/invalid JSON', () => {
    expect(normalizeContent(null, cdn)).toEqual([])
    expect(normalizeContent('not json', cdn)).toEqual([])
  })
})

describe('deriveSummary', () => {
  it('first block with content, HTML stripped, capped ~160', () => {
    const blocks = [
      { type: 'detail-box', id: 'block-0' },
      { type: 'text', id: 'block-1', content: '<p>The <b>best</b> ramen in town.</p>' },
    ] as any
    expect(deriveSummary(blocks)).toBe('The best ramen in town.')
  })
})
