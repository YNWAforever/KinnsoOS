import { describe, it, expect } from 'vitest'
import { LOCALES } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'

describe('guideSave / experienceSave i18n', () => {
  for (const locale of LOCALES) {
    it(`${locale} defines guideSave.{save,saved,signInToSave} and experienceSave.{save,saved,signInToSave}`, async () => {
      const dict = await getDictionary(locale)
      expect(dict.guideSave.save).toBeTruthy()
      expect(dict.guideSave.saved).toBeTruthy()
      expect(dict.guideSave.signInToSave).toBeTruthy()
      expect(dict.experienceSave.save).toBeTruthy()
      expect(dict.experienceSave.saved).toBeTruthy()
      expect(dict.experienceSave.signInToSave).toBeTruthy()
    })
  }
})
