import { NextResponse } from 'next/server'
import { resolveViewerRole } from '@/lib/auth/viewer-role'
import { getTravellerAnalyticsReport } from '@/lib/admin/analytics-queries'
import { createSupabaseServerClient } from '@/lib/supabase/server'

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/

function parseIsoTimestamp(value: string | null): string | null | undefined {
  if (value === null) return undefined
  if (!ISO_TIMESTAMP.test(value)) return null

  const timestamp = new Date(value)
  return Number.isNaN(timestamp.getTime()) ? null : timestamp.toISOString()
}

export async function GET(request: Request) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const role = await resolveViewerRole(supabase, user.id)
  if (role !== 'ops') return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const url = new URL(request.url)
  const parsedFrom = parseIsoTimestamp(url.searchParams.get('from'))
  const parsedTo = parseIsoTimestamp(url.searchParams.get('to'))
  if (parsedFrom === null || parsedTo === null) {
    return NextResponse.json({ error: 'invalid_window' }, { status: 400 })
  }

  const now = new Date()
  const to = parsedTo ?? now.toISOString()
  const from = parsedFrom ?? new Date(now.getTime() - SEVEN_DAYS_MS).toISOString()
  const duration = new Date(to).getTime() - new Date(from).getTime()
  if (duration <= 0 || duration > SEVEN_DAYS_MS) {
    return NextResponse.json({ error: 'invalid_window' }, { status: 400 })
  }

  try {
    const report = await getTravellerAnalyticsReport(supabase, { from, to })
    return NextResponse.json(report)
  } catch {
    return NextResponse.json({ error: 'unavailable' }, { status: 503 })
  }
}
