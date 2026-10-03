import { describe, expect, it } from 'vitest'
import * as actions from '@/lib/enquiries/actions'

describe('enquiry server-action module', () => {
  it('exports async actions only, as required by Next server-action modules', () => {
    for (const exported of Object.values(actions)) {
      expect(typeof exported).toBe('function')
      expect(exported.constructor.name).toBe('AsyncFunction')
    }
  })
})
