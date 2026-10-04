import { describe, it, expect } from 'vitest'
import { parseBlocks, getPostDirectory, numberBoxIndex, RENDERED_TYPES } from '@/lib/articles/blocks'

const content = [
  { type: 'text', id: 'block-0', title: 'Intro', content: '<p>hi</p>' },
  { type: 'text', id: 'block-1', title: 'app.summary', content: '<p>skip me</p>' },
  { type: 'number-box', id: 'block-2', title: 'First', content: '<p>1</p>' },
  { type: 'number-box', id: 'block-3', title: 'Second', content: '<p>2</p>' },
  { type: 'attraction-box', id: 'block-4', attraction: 'x' },
]

describe('blocks', () => {
  it('parseBlocks tolerates null/garbage and returns an array', () => {
    expect(parseBlocks(null)).toEqual([])
    expect(parseBlocks('not-json')).toEqual([])
    expect(parseBlocks(content).length).toBe(5)
  })
  it('getPostDirectory lists only text/number-box titled blocks, skipping app.summary', () => {
    expect(getPostDirectory(content)).toEqual([
      { id: 'block-0', title: 'Intro' },
      { id: 'block-2', title: 'First' },
      { id: 'block-3', title: 'Second' },
    ])
  })
  it('numberBoxIndex numbers number-box blocks in document order (1-based)', () => {
    expect(numberBoxIndex(content, 'block-2')).toBe(1)
    expect(numberBoxIndex(content, 'block-3')).toBe(2)
    expect(numberBoxIndex(content, 'block-0')).toBeNull()
  })
  it('exposes the 7 rendered types', () => {
    expect(RENDERED_TYPES).toEqual(
      ['text', 'number-box', 'offer-box', 'detail-box', 'info-box', 'map', 'multiple-image'])
  })
})
