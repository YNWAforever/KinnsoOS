// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { optionalEnrichmentQuery, optionalQuery, optionalValue } from '@/lib/resilience/optional'

afterEach(() => vi.restoreAllMocks())

describe('optional module containment', () => {
  it('returns the async fallback and logs only a safe error name', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    await expect(optionalQuery('experience-availability', async () => {
      throw new Error('secret database detail')
    }, [])).resolves.toEqual([])
    expect(log).toHaveBeenCalledWith('optional-module-failed', {
      module: 'experience-availability', errorName: 'Error',
    })
    expect(JSON.stringify(log.mock.calls)).not.toContain('secret database detail')
  })

  it('returns the sync fallback when JSON-LD construction throws', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    expect(optionalValue('guide-jsonld', () => { throw new TypeError('bad') }, [])).toEqual([])
  })

  it.each([
    ['missing table', { code: 'PGRST205', message: 'schema cache unavailable' }],
    ['missing column', { code: '42703', message: 'column unavailable' }],
    ['transient connection', { code: '08006', message: 'connection failed' }],
    ['transient timeout', { code: '57014', message: 'query canceled' }],
  ])('degrades a recognized %s enrichment failure', async (_label, error) => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    await expect(optionalEnrichmentQuery('creator-profile-guides', async () => {
      throw error
    }, [])).resolves.toEqual([])
  })

  it('degrades the PostgREST empty-code fetch failure shape without swallowing ordinary TypeErrors', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const fetchFailure = {
      code: '',
      message: 'TypeError: fetch failed',
      details: 'TypeError: fetch failed\nCaused by: Error: connect ECONNREFUSED',
      hint: '',
    }

    await expect(optionalEnrichmentQuery('merchant-featured-guides', async () => {
      throw fetchFailure
    }, [])).resolves.toEqual([])
  })

  it.each([
    new TypeError('programming bug'),
    { code: 'XX000', message: 'unknown database failure' },
  ])('rethrows unknown or programming enrichment failures', async (error) => {
    await expect(optionalEnrichmentQuery('creator-profile-guides', async () => {
      throw error
    }, [])).rejects.toBe(error)
  })
})
