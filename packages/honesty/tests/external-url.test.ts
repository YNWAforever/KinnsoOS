import { describe, expect, it } from 'vitest'
import { isPublicExternalUrl, validatePublicExternalUrl } from '../src/external-url'

describe('public external URL policy', () => {
  it('accepts an absolute HTTPS URL', () => {
    expect(validatePublicExternalUrl('https://merchant.test/offers')).toBeNull()
    expect(isPublicExternalUrl('https://merchant.test/offers')).toBe(true)
  })

  it.each([
    ['not a url', 'invalid_url'],
    ['/relative', 'invalid_url'],
    ['http://merchant.test', 'https_required'],
    ['https://example.com/path', 'reserved_example_domain'],
    ['https://bloom-tea.example.com/path', 'reserved_example_domain'],
    ['https://example.co.uk/path', 'reserved_example_domain'],
  ] as const)('rejects %s', (value, issue) => {
    expect(validatePublicExternalUrl(value)).toBe(issue)
    expect(isPublicExternalUrl(value)).toBe(false)
  })
})
