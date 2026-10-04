import 'server-only'
import { cache } from 'react'
import { createSupabasePublicClient } from '@/lib/supabase/public'
import {
  resolveConfiguredProductState,
  type ProductState,
} from '@/lib/product-state-config'

export { resolveConfiguredProductState }
export type { ProductState }

type PublicClient = ReturnType<typeof createSupabasePublicClient>

export async function getSessionsLive(client?: PublicClient): Promise<boolean> {
  try {
    const publicClient = client ?? createSupabasePublicClient()
    const upcoming = await publicClient
      .from('community_sessions')
      .select('id')
      .in('status', ['scheduled', 'live'])
      .limit(1)

    if (upcoming.error) throw upcoming.error
    if (upcoming.data?.length) return true

    const replay = await publicClient
      .from('community_sessions')
      .select('id')
      .eq('status', 'ended')
      .not('replay_url', 'is', null)
      .limit(1)

    if (replay.error) throw replay.error
    return Boolean(replay.data?.length)
  } catch {
    console.warn('product-state-sessions-query-failed')
    return false
  }
}

export const getProductState = cache(async (): Promise<ProductState> => ({
  ...resolveConfiguredProductState(),
  sessionsLive: await getSessionsLive(),
}))
