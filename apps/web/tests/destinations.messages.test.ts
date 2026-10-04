import { describe, expect, it } from 'vitest'
import en from '@/lib/i18n/messages/en'
import zhHk from '@/lib/i18n/messages/zh-hk'
import zhTw from '@/lib/i18n/messages/zh-tw'
import zhCn from '@/lib/i18n/messages/zh-cn'
import ja from '@/lib/i18n/messages/ja'
import ko from '@/lib/i18n/messages/ko'
import th from '@/lib/i18n/messages/th'

describe('destination inventory messages', () => {
  it('formats singular and plural English inventory labels', () => {
    expect(en.destinations.guideCount(1)).toBe('1 guide')
    expect(en.destinations.guideCount(2)).toBe('2 guides')
    expect(en.destinations.experienceCount(1)).toBe('1 experience')
    expect(en.destinations.experienceCount(2)).toBe('2 experiences')
  })

  it('defines destination inventory messages in every non-English dictionary', () => {
    for (const dictionary of [zhHk, zhTw, zhCn, ja, ko, th]) {
      expect(dictionary.destinations.guideCount(2)).toBeTruthy()
      expect(dictionary.destinations.experienceCount(2)).toBeTruthy()
    }
  })
})
