import { describe, it, expect, vi } from 'vitest'
import { makeAgentTools } from '@/lib/agent/tools'

describe('makeAgentTools', () => {
  it('exposes searchGuides, searchArticles, searchExperiences', () => {
    const supabase = { rpc: vi.fn() }
    const tools = makeAgentTools(supabase as never, 'en')
    expect(Object.keys(tools)).toEqual(['searchGuides', 'searchArticles', 'searchExperiences'])
  })

  it('searchGuides calls the search_guides RPC and degrades to [] on error, never throwing', async () => {
    const rpc = vi.fn(async () => ({ data: null, error: { message: 'boom' } }))
    const tools = makeAgentTools({ rpc } as never, 'en')
    const result = await tools.searchGuides.execute!({ query: 'Tokyo', city: 'Tokyo' }, { toolCallId: 't1', messages: [] })
    expect(rpc).toHaveBeenCalledWith('search_guides', { p_q: 'Tokyo', p_city: 'Tokyo', p_limit: 5, p_offset: 0 })
    expect(result).toEqual([])
  })

  it('searchArticles passes the caller\'s locale through to search_articles', async () => {
    const rpc = vi.fn(async () => ({ data: [{ url: '/a', title: 'A', summary: 's' }], error: null }))
    const tools = makeAgentTools({ rpc } as never, 'ja')
    const result = await tools.searchArticles.execute!({ query: 'ramen' }, { toolCallId: 't1', messages: [] })
    expect(rpc).toHaveBeenCalledWith('search_articles', { p_locale: 'ja', p_q: 'ramen', p_limit: 5, p_offset: 0 })
    expect(result).toEqual([{ url: '/a', title: 'A', summary: 's' }])
  })

  it('searchExperiences calls the search_experiences RPC', async () => {
    const rpc = vi.fn(async () => ({ data: [{ slug: 'e1', title: 'E' }], error: null }))
    const tools = makeAgentTools({ rpc } as never, 'en')
    const result = await tools.searchExperiences.execute!({ query: 'sunset tour', city: 'Hong Kong' }, { toolCallId: 't1', messages: [] })
    expect(rpc).toHaveBeenCalledWith('search_experiences', { p_q: 'sunset tour', p_city: 'Hong Kong', p_limit: 5, p_offset: 0 })
    expect(result).toEqual([{ slug: 'e1', title: 'E' }])
  })
})
