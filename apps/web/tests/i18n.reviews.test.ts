import { describe, it, expect } from 'vitest'
import { LOCALES } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'

const KEYS = [
  'formHeading', 'ratingLabel', 'bodyLabel', 'bodyPlaceholder', 'submitCta',
  'submittingCta', 'submitted', 'alreadyReviewed', 'genericError',
  'ratingAverageLabel', 'countLabel', 'emptyState', 'anonymousReviewer',
] as const

describe('reviews i18n', () => {
  for (const locale of LOCALES) {
    it(`${locale} defines every reviews.* key`, async () => {
      const dict = await getDictionary(locale)
      for (const key of KEYS) {
        expect(dict.reviews[key], `${locale}.reviews.${key}`).toBeTruthy()
      }
    })
  }
})

describe('TravelerTripsMessages Saved-section keys', () => {
  for (const locale of LOCALES) {
    it(`${locale} trips group drops savesTabTitle/savesTabComingSoon and defines the real Saved-section keys`, async () => {
      const dict = await getDictionary(locale)
      const trips = dict.trips as unknown as Record<string, unknown>
      expect(trips.savesTabTitle).toBeUndefined()
      expect(trips.savesTabComingSoon).toBeUndefined()
      expect(trips.savedGuidesTitle).toBeTruthy()
      expect(trips.savedGuidesEmpty).toBeTruthy()
      expect(trips.savedExperiencesTitle).toBeTruthy()
      expect(trips.savedExperiencesEmpty).toBeTruthy()
      expect(trips.reviewCta).toBeTruthy()
      expect(trips.reviewedLabel).toBeTruthy()
    })
  }
})
