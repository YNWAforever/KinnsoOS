import { describe, it, expect } from 'vitest'
import { VERSION } from '../src/index'

describe('@kinnso/parity', () => {
  it('exposes a version marker', () => {
    expect(VERSION).toBe('0.0.0')
  })
})
