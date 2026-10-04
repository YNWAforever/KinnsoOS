import { NextResponse } from 'next/server'

import { createSupabaseServiceClient } from '@/lib/supabase/service'
import { safeEqual } from '@/lib/http/safe-equal'

/**
 * Vercel invokes this endpoint once per day. The database function owns the
 * eight-day retention boundary; this route only authenticates the scheduler
 * and invokes the service-role-only purge function.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  const authorization = req.headers.get('authorization')

  if (!secret || !safeEqual(authorization, `Bearer ${secret}`)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  try {
    const { error } = await createSupabaseServiceClient().rpc('purge_traveller_analytics_events')

    if (error) {
      return NextResponse.json({ ok: false, error: 'retention failed' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch {
    // Never expose service-client or database details from a cron endpoint.
    return NextResponse.json({ ok: false, error: 'retention failed' }, { status: 500 })
  }
}
