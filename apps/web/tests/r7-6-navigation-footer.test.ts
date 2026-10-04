// @vitest-environment node
import { describe, expect, it } from 'vitest'
import en from '@/lib/i18n/messages/en'
import ja from '@/lib/i18n/messages/ja'
import ko from '@/lib/i18n/messages/ko'
import th from '@/lib/i18n/messages/th'
import zhCn from '@/lib/i18n/messages/zh-cn'
import zhHk from '@/lib/i18n/messages/zh-hk'
import zhTw from '@/lib/i18n/messages/zh-tw'

// The whole-tree source scan that used to live here (and the walker test that
// guards it) moved to tests/source-contracts.test.ts, where one walk and one
// read are shared by every scan. See that file for why.

describe('R7.6 navigation and footer acceptance', () => {
  it.each([
    ['en', en, 'For Creators', 'The AI travel creator marketplace · Hong Kong · Taipei · Tokyo'],
    ['zh-hk', zhHk, '創作者專區', 'AI 旅遊創作者市集 · 香港 · 台北 · 東京'],
    ['zh-tw', zhTw, '創作者專區', 'AI 旅遊創作者市集 · 香港 · 台北 · 東京'],
    ['zh-cn', zhCn, '创作者专区', 'AI 旅行创作者平台 · 香港 · 台北 · 东京'],
    ['ja', ja, 'クリエイターの方へ', 'AI旅行クリエイターマーケットプレイス · 香港 · 台北 · 東京'],
    ['ko', ko, '크리에이터 안내', 'AI 여행 크리에이터 마켓플레이스 · 홍콩 · 타이베이 · 도쿄'],
    ['th', th, 'สำหรับครีเอเตอร์', 'มาร์เก็ตเพลสครีเอเตอร์ท่องเที่ยว AI · ฮ่องกง · ไทเป · โตเกียว'],
  ])('%s exposes complete R7.6 navigation/footer copy', (_locale, dictionary, forCreators, tagline) => {
    expect(dictionary.nav.linkForCreators).toBe(forCreators)
    expect(dictionary.nav.signUp.length).toBeGreaterThan(0)
    expect(dictionary.footer.tagline).toBe(tagline)
    expect(dictionary.footer.colTravellers.length).toBeGreaterThan(0)
    expect(dictionary.footer.lTrips.length).toBeGreaterThan(0)
    expect(dictionary.footer.lSaved.length).toBeGreaterThan(0)
  })
})
