import { describe, it, expect } from 'vitest'
import { primaryCategory } from '../src/transform/category'

describe('primaryCategory', () => {
  it('picks highest weight, maps to supabase enum', () => {
    expect(primaryCategory([{ category_slug: 'dining', weight: 10 }, { category_slug: 'destination', weight: 3 }]).category).toBe('dining')
  })
  it('promotion or unknown → destination default, flagged', () => {
    expect(primaryCategory([{ category_slug: 'promotion', weight: 5 }])).toEqual({ category: 'destination', defaulted: true })
    expect(primaryCategory([])).toEqual({ category: 'destination', defaulted: true })
  })
  it('ties resolve deterministically (alphabetical)', () => {
    expect(primaryCategory([{ category_slug: 'shopping', weight: 5 }, { category_slug: 'dining', weight: 5 }]).category).toBe('dining')
  })
})
