import { describe, expect, it } from 'vitest'
import { legacyToIso } from '../src/transform/datetime'
import { transformPost } from '../src/transform'
import { legacyPost } from './fixtures/legacyPost'

describe('legacyToIso', () => {
  it('treats a zone-less legacy datetime as UTC by default', () => {
    expect(legacyToIso('2026-06-01 00:00:00')).toBe('2026-06-01T00:00:00.000Z')
  })

  it('interprets the wall clock in the configured fixed offset', () => {
    // 00:00 in +08:00 is the previous day at 16:00 UTC — the whole point of the setting.
    expect(legacyToIso('2026-06-01 00:00:00', '+08:00')).toBe('2026-05-31T16:00:00.000Z')
    expect(legacyToIso('2026-06-01 00:00:00', '-05:00')).toBe('2026-06-01T05:00:00.000Z')
  })

  it('returns null for null and for an unparseable value instead of throwing', () => {
    expect(legacyToIso(null)).toBeNull()
    expect(legacyToIso('0000-00-00 00:00:00')).toBeNull()
  })
})

describe('transformPost timezone threading', () => {
  it('applies the legacy timezone to every datetime column, including translations', () => {
    const utc = transformPost(legacyPost, 'https://cdn.x')
    const hk = transformPost(legacyPost, 'https://cdn.x', { legacyTimezone: '+08:00' })

    expect(utc.article.published_at).toBe('2026-06-01T00:00:00.000Z')
    expect(hk.article.published_at).toBe('2026-05-31T16:00:00.000Z')
    expect(utc.article.edit_at).toBe('2026-06-10T00:00:00.000Z')
    expect(hk.article.edit_at).toBe('2026-06-09T16:00:00.000Z')

    // The second conversion site: article_translations.validated_at used to hardcode 'Z'
    // independently of buildArticleRow, so the two could disagree.
    const validatedUtc = utc.translations.find((t) => t.locale === 'zh-hk')!.validated_at
    const validatedHk = hk.translations.find((t) => t.locale === 'zh-hk')!.validated_at
    expect(validatedUtc).toBe('2026-06-09T00:00:00.000Z')
    expect(validatedHk).toBe('2026-06-08T16:00:00.000Z')
  })

  it('defaults to UTC when no option is passed, keeping 2-arg call sites unchanged', () => {
    expect(transformPost(legacyPost, 'https://cdn.x', {}).article.published_at)
      .toBe(transformPost(legacyPost, 'https://cdn.x').article.published_at)
  })
})
