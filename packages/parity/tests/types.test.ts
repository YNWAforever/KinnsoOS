import { describe, it, expect } from 'vitest'
import { LOCALES, DEFAULT_LOCALE } from '../src/locales'

describe('locales', () => {
  it('declares the 7 KINNSO locales with en default', () => {
    expect(LOCALES).toEqual(['en', 'zh-hk', 'zh-tw', 'ja', 'ko', 'th', 'zh-cn'])
    expect(DEFAULT_LOCALE).toBe('en')
  })
})
