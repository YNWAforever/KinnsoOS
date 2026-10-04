import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET() {
  let db = 'down'
  try {
    const c = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY!,
    )
    const { error } = await c.from('articles').select('id').limit(1)
    db = error ? 'down' : 'up'
  } catch {
    db = 'down'
  }
  return NextResponse.json({ ok: db === 'up', db })
}
