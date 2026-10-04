import { describe, it, expect } from 'vitest'
import {
  LOCALES, DEFAULT_LOCALE, isLocale, parsePathname, htmlLang,
  toDbCategory, toUrlCategory, URL_CATEGORIES,
} from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'

describe('i18n config', () => {
  it('declares the 7 locales with en default', () => {
    expect(LOCALES).toEqual(['en', 'zh-hk', 'zh-tw', 'ja', 'ko', 'th', 'zh-cn'])
    expect(DEFAULT_LOCALE).toBe('en')
  })
  it('isLocale narrows known locales', () => {
    expect(isLocale('zh-hk')).toBe(true)
    expect(isLocale('xx')).toBe(false)
  })
  it('parsePathname splits a locale prefix from the rest', () => {
    expect(parsePathname('/zh-hk/articles/dining/x')).toEqual({ locale: 'zh-hk', rest: '/articles/dining/x' })
    expect(parsePathname('/post/my-slug')).toEqual({ locale: null, rest: '/post/my-slug' })
    expect(parsePathname('/')).toEqual({ locale: null, rest: '/' })
  })
  it('maps html lang for CJK locales', () => {
    expect(htmlLang('zh-hk')).toBe('zh-Hant-HK')
    expect(htmlLang('zh-cn')).toBe('zh-Hans-CN')
    expect(htmlLang('en')).toBe('en')
  })
  it('htmlLang returns correct value for all 7 locales', () => {
    expect(htmlLang('en')).toBe('en')
    expect(htmlLang('zh-hk')).toBe('zh-Hant-HK')
    expect(htmlLang('zh-tw')).toBe('zh-Hant-TW')
    expect(htmlLang('zh-cn')).toBe('zh-Hans-CN')
    expect(htmlLang('ja')).toBe('ja')
    expect(htmlLang('ko')).toBe('ko')
    expect(htmlLang('th')).toBe('th')
  })
  it('toDbCategory and toUrlCategory return null for prototype keys', () => {
    expect(toDbCategory('constructor')).toBeNull()
    expect(toDbCategory('toString')).toBeNull()
    expect(toUrlCategory('hasOwnProperty')).toBeNull()
  })
  it('maps plural URL category <-> singular db category', () => {
    expect(URL_CATEGORIES).toEqual(['destinations', 'dining', 'shopping'])
    expect(toDbCategory('destinations')).toBe('destination')
    expect(toUrlCategory('destination')).toBe('destinations')
    expect(toDbCategory('promotion')).toBeNull()
  })
})

describe('dictionaries', () => {
  it('returns a dictionary for every locale with the same keys', async () => {
    const en = await getDictionary('en')
    for (const l of LOCALES) {
      const d = await getDictionary(l)
      expect(Object.keys(d).sort()).toEqual(Object.keys(en).sort())
      expect(d.categories.dining).toBeTruthy()
    }
  })
})
