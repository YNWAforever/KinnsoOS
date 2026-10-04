'use client'
import { useEffect } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'

/** Fire-and-forget view increment (anon RPC). One ping per page load. */
export function ViewPing({ url }: { url: string }) {
  useEffect(() => {
    const supabase = createSupabaseBrowserClient()
    supabase.rpc('increment_article_view', { p_url: url }).then(() => {}, () => {})
  }, [url])
  return null
}
