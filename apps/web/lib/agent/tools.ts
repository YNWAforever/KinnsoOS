import { tool, type ToolSet } from 'ai'
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@kinnso/db'
import type { Locale } from '@/lib/i18n/config'

type Client = SupabaseClient<Database>

/** Every tool degrades to [] on any RPC error rather than throwing into the model's
 *  tool-call loop — same "reads never crash the page" stance as every other public
 *  query in this codebase (getGuidesForRegions, getExperiencesForCity, etc.). A flaky
 *  search just means the agent says it couldn't find anything for that query. */
async function safeRpc(supabase: Client, fn: string, args: Record<string, unknown>): Promise<unknown[]> {
  const { data, error } = await supabase.rpc(fn as never, args as never)
  if (error) {
    console.error(`[agent:tools] ${fn} failed`, error)
    return []
  }
  return (data as unknown[]) ?? []
}

export function makeAgentTools(supabase: Client, locale: Locale): ToolSet {
  return {
    searchGuides: tool({
      description: 'Search published creator guides by free-text query and/or city.',
      inputSchema: z.object({
        query: z.string().describe('Free-text search query, e.g. "quiet beaches" or "street food"'),
        city: z.string().optional().describe('Optional city filter, e.g. "Tokyo"'),
      }),
      execute: async ({ query, city }) =>
        safeRpc(supabase, 'search_guides', { p_q: query, p_city: city ?? null, p_limit: 5, p_offset: 0 }),
    }),
    searchArticles: tool({
      description: "Search published articles by free-text query, in the traveller's current locale.",
      inputSchema: z.object({
        query: z.string().describe('Free-text search query'),
      }),
      execute: async ({ query }) =>
        safeRpc(supabase, 'search_articles', { p_locale: locale, p_q: query, p_limit: 5, p_offset: 0 }),
    }),
    searchExperiences: tool({
      description: 'Search published, bookable experiences by free-text query and/or city.',
      inputSchema: z.object({
        query: z.string().describe('Free-text search query, e.g. "sunset boat tour"'),
        city: z.string().optional().describe('Optional city filter'),
      }),
      execute: async ({ query, city }) =>
        safeRpc(supabase, 'search_experiences', { p_q: query, p_city: city ?? null, p_limit: 5, p_offset: 0 }),
    }),
  }
}
