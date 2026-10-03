import { describe, it, expect } from 'vitest'
import { LOCALES } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import en from '@/lib/i18n/messages/en'

/** Recursively collect dotted key paths, sorted. */
function keyPaths(obj: unknown, prefix = ''): string[] {
  if (obj === null || typeof obj !== 'object') return [prefix]
  return Object.entries(obj as Record<string, unknown>)
    .flatMap(([k, v]) => keyPaths(v, prefix ? `${prefix}.${k}` : k))
    .sort()
}

// Every top-level group in the en dictionary is parity-checked — nothing can be
// forgotten (R1C carry-forward #6: 'agent', 'breadcrumb', 'categories' were live
// but unregistered under the old hand list).
const GROUPS = Object.keys(en).sort() as (keyof typeof en)[]

describe('i18n locale parity for new creator-profile groups', () => {
  const enPaths = Object.fromEntries(
    GROUPS.map((g) => [g, keyPaths((en as unknown as Record<string, unknown>)[g])]),
  )

  it('en defines the three new groups', () => {
    for (const g of GROUPS) {
      expect(enPaths[g].length).toBeGreaterThan(0)
    }
  })

  it('defines the complete Explore discovery contract', () => {
    expect(Object.keys(en.explore).sort()).toEqual([
      'activeFilters', 'allDestinations', 'closeFilters', 'destinationFilterLabel',
      'emptyFilteredBody', 'emptyFilteredTitle', 'emptyNote', 'filters',
      'filtersDescription', 'gridHeading', 'heading', 'loadMore', 'mostSaved',
      'newest', 'pill', 'resetFilters', 'resultsLabel', 'savesLabel',
      'searchLabel', 'searchPlaceholder', 'showResults', 'sortLabel', 'subtitle',
    ].sort())
  })

  it('states the analytics trust metadata in every locale', async () => {
    const dictionaries = await Promise.all(LOCALES.map(async (locale) => [locale, await getDictionary(locale)] as const))
    for (const [locale, dict] of dictionaries) {
      expect(dict.admin.analyticsRetentionNote, `${locale} retention note`).toMatch(/8/)
      expect(dict.admin.analyticsAttributionNote, `${locale} attribution note`).toMatch(/7/)
      expect(dict.admin.analyticsSampleFloorNote, `${locale} sample-floor note`).toMatch(/10/)
    }
    expect(en.admin.analyticsRetentionNote).toBe('Analytics data is retained for 8 days.')
    expect(en.admin.analyticsAttributionNote).toBe('Attribution uses a 7-day window.')
    expect(en.admin.analyticsSampleFloorNote).toBe('Rates are withheld when the denominator is below 10.')
  })

  it('defines the complete analytics measurement-health contract in every locale', async () => {
    const healthKeys = [
      'analyticsHealthTitle', 'analyticsHealthStatus', 'analyticsHealthAvailable',
      'analyticsHealthNoMatching', 'analyticsHealthObservedZero', 'analyticsHealthInsufficient',
      'analyticsHealthUnavailable', 'analyticsHealthReturnedRows', 'analyticsHealthOkRows',
      'analyticsHealthInsufficientRows', 'analyticsHealthObservedZeroRows',
    ] as const
    const dictionaries = await Promise.all(LOCALES.map(async (locale) => [locale, await getDictionary(locale)] as const))
    for (const [locale, dict] of dictionaries) {
      for (const key of healthKeys) expect(dict.admin[key], `${locale} ${key}`).toBeTruthy()
    }
    expect(Object.fromEntries(healthKeys.map((key) => [key, en.admin[key]]))).toEqual({
      analyticsHealthTitle: 'Measurement health',
      analyticsHealthStatus: 'Status',
      analyticsHealthAvailable: 'Available',
      analyticsHealthNoMatching: 'No matching rows',
      analyticsHealthObservedZero: 'Observed zero',
      analyticsHealthInsufficient: 'Insufficient sample',
      analyticsHealthUnavailable: 'Unavailable',
      analyticsHealthReturnedRows: 'Rows returned',
      analyticsHealthOkRows: 'Interpretable rows',
      analyticsHealthInsufficientRows: 'Withheld rows',
      analyticsHealthObservedZeroRows: 'Observed-zero rows',
    })
  })

  it('explains observed-zero aggregates and non-interpretable insufficient rates in every locale', async () => {
    const semanticMarkers: Record<string, string[]> = {
      en: ['observed aggregate', 'insufficient samples', 'not interpretable rates'],
      'zh-hk': ['觀察到的匯總', '樣本不足', '無法解讀'],
      'zh-tw': ['觀察到的彙總', '樣本不足', '無法解讀'],
      'zh-cn': ['观察到的聚合', '样本不足', '无法解读'],
      ja: ['観測された集計', 'サンプル不足', '解釈できません'],
      ko: ['관찰된 집계', '표본 부족', '해석할 수 없습니다'],
      th: ['ค่ารวมที่สังเกตได้', 'ตัวอย่างไม่เพียงพอ', 'ตีความไม่ได้'],
    }
    const dictionaries = await Promise.all(LOCALES.map(async (locale) => [locale, await getDictionary(locale)] as const))
    for (const [locale, dict] of dictionaries) {
      for (const marker of semanticMarkers[locale]) {
        expect(dict.admin.analyticsObservedZero, `${locale} observed-zero copy`).toContain(marker)
      }
    }
    expect(en.admin.analyticsObservedZero).toBe('Zero is an observed aggregate; insufficient samples are not interpretable rates.')
  })

  // Key parity below proves the strings EXIST. These two prove they still SAY the
  // thing: a translation that drops an interpolation placeholder renders "pts to
  // unlocks:" with no number and no tier, which key parity cannot see.
  it('keeps every interpolation placeholder in the next-tier unlocks copy in each locale', async () => {
    const dictionaries = await Promise.all(LOCALES.map(async (l) => [l, await getDictionary(l)] as const))
    for (const [locale, dict] of dictionaries) {
      expect(dict.tier.nextUnlocksIntro, `${locale} intro points`).toContain('{points}')
      expect(dict.tier.nextUnlocksIntro, `${locale} intro tier`).toContain('{tier}')
      expect(dict.tier.nextUnlocksNone, `${locale} empty-tier copy`).toContain('{tier}')
      expect(dict.tier.nextUnlocksMaxed, `${locale} top-tier copy`).toContain('{tier}')
    }
  })

  // Key parity proves the templated notification strings EXIST in every locale, but a
  // translation can drop an interpolation placeholder (e.g. {amount}) and still be a
  // non-empty string, which key parity cannot see. That silently breaks the notification —
  // e.g. "A payout of  has been promised to you" with no amount or currency substituted.
  it('keeps the same set of interpolation placeholders as en for every templated notification key in each locale', async () => {
    const templatedKeys = [
      'submission.approved',
      'submission.rejected',
      'submission.revision_requested',
      'settlement.created',
      'payout_batch.created',
      'payout_batch.paid',
      'payout_batch.cancelled',
    ] as const

    const placeholders = (s: string) => new Set(s.match(/\{\w+\}/g) ?? [])

    const dictionaries = await Promise.all(LOCALES.map(async (l) => [l, await getDictionary(l)] as const))
    for (const [locale, dict] of dictionaries) {
      for (const key of templatedKeys) {
        const enPlaceholders = placeholders(en.notifications[key])
        const localePlaceholders = placeholders(dict.notifications[key])
        expect([...localePlaceholders].sort(), `${locale} notifications['${key}']`).toEqual([...enPlaceholders].sort())
      }
    }
  })

  // The directory rule is one a creator acts on, so each locale must actually name
  // the published-guide requirement rather than a vaguer "finish your profile".
  it('names the published-guide requirement for the directory in every locale', async () => {
    const guideMarker: Record<string, string> = {
      en: 'Publish a guide', 'zh-hk': '發布', 'zh-tw': '發布', 'zh-cn': '发布',
      ja: '公開', ko: '게시', th: 'เผยแพร่',
    }
    // Drafts not counting is the whole point of stating the rule, so each locale
    // must say that too — otherwise the copy reads as "write a guide", which the
    // checklist already said and which is not the rule.
    const draftMarker: Record<string, string> = {
      en: 'drafts do not count', 'zh-hk': '草稿', 'zh-tw': '草稿', 'zh-cn': '草稿',
      ja: '下書き', ko: '임시 저장본', th: 'ฉบับร่าง',
    }
    const dictionaries = await Promise.all(LOCALES.map(async (l) => [l, await getDictionary(l)] as const))
    for (const [locale, dict] of dictionaries) {
      expect(dict.studioDashboard.directoryNeedsGuide, `${locale} directory copy`).toContain(guideMarker[locale])
      expect(dict.studioDashboard.directoryNeedsGuide, `${locale} drafts caveat`).toContain(draftMarker[locale])
    }
  })

  for (const locale of LOCALES) {
    it(`${locale} has identical keys to en for each group`, async () => {
      const dict = (await getDictionary(locale)) as unknown as Record<string, unknown>
      for (const g of GROUPS) {
        expect(dict[g], `${locale} is missing group "${g}"`).toBeDefined()
        expect(keyPaths(dict[g])).toEqual(enPaths[g])
      }
    })
  }
})

describe('studioEarnings tracked-volume honesty', () => {
  // The tracked section reports affiliate volume that is recorded but NOT settled.
  // Key parity cannot detect a translation that drops the negation and implies the
  // money is payable, so each locale's disclaimer is pinned to a marker it must contain.
  const NOT_PAYABLE_MARKER: Record<string, string> = {
    en: 'not settled',
    'zh-hk': '尚未結算',
    'zh-tw': '尚未結算',
    'zh-cn': '尚未结算',
    ja: '精算されていません',
    ko: '정산되지 않았습니다',
    th: 'ยังไม่ได้ชำระเงิน',
  }

  // The heading needs its own marker. A bare non-empty check would pass for ANY text,
  // including a heading that implied the money was available — which is precisely the
  // failure this block exists to prevent.
  const HEADING_MARKER: Record<string, string> = {
    en: 'not yet payable',
    'zh-hk': '尚未可支付',
    'zh-tw': '尚未可支付',
    'zh-cn': '尚不可支付',
    ja: '未精算',
    ko: '지급 불가',
    th: 'ยังจ่ายไม่ได้',
  }

  for (const locale of LOCALES) {
    it(`${locale} states that tracked volume is not settled`, async () => {
      const dict = await getDictionary(locale)
      expect(dict.studioEarnings.trackedNote).toContain(NOT_PAYABLE_MARKER[locale])
      expect(dict.studioEarnings.trackedHeading).toContain(HEADING_MARKER[locale])
    })
  }
})
