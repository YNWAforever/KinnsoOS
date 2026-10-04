import { describe, it, expect } from 'vitest'
import { csvToArray, cdnUrl } from '../src/transform/arrays'

describe('csvToArray', () => {
  it('splits, trims, drops empties', () => {
    expect(csvToArray('a.webp, b.webp,')).toEqual(['a.webp', 'b.webp'])
    expect(csvToArray(null)).toEqual([])
    expect(csvToArray('  ')).toEqual([])
  })
})

describe('cdnUrl', () => {
  it('rewrites {{image_path}} and bare filenames to absolute CDN urls; leaves absolute urls', () => {
    expect(cdnUrl('hero.webp', 'https://cdn.x')).toBe('https://cdn.x/hero.webp')
    expect(cdnUrl('{{image_path}}/hero.webp', 'https://cdn.x')).toBe('https://cdn.x/hero.webp')
    expect(cdnUrl('https://other/h.webp', 'https://cdn.x')).toBe('https://other/h.webp')
    expect(cdnUrl('', 'https://cdn.x')).toBe('')
  })
})
