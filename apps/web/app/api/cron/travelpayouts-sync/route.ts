// apps/web/app/api/cron/travelpayouts-sync/route.ts
import { NextResponse } from 'next/server'
import { fetchTravelpayoutsActions } from '@/lib/missions/travelpayouts'
import { createSupabaseServiceClient } from '@/lib/supabase/service'
import { safeEqual } from '@/lib/http/safe-equal'

/**
 * D-R3-9: Vercel-Cron-triggered repair job. Vercel Cron authenticates by
 * sending `Authorization: Bearer $CRON_SECRET` automatically (not a custom
 * header — this is Vercel's actual, non-configurable cron invocation
 * convention) whenever `vercel.json`'s `crons` entry fires. Second sanctioned
 * service-role exception alongside the Stripe webhook (lib/supabase/service.ts)
 * — same trust shape: no user session, shared-secret-gated, server-to-server,
 * narrow set of writes (two read-only lookups + one upsert).
 */

// fetchTravelpayoutsActions' default maxPages=10 sequential fetches, plus this
// route's 2 lookups + 1 upsert, could plausibly approach Vercel's default
// timeout on a slow day. 60s comfortably fits Hobby tier's Fluid Compute limit
// (300s, per vercel.com/docs/functions/configuring-functions/duration as of
// 2026-06-19) with margin, matching the precedent set by app/api/copilot/route.ts.
export const maxDuration = 60

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization')
  if (!secret || !safeEqual(auth, `Bearer ${secret}`)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  let actions
  try {
    const from = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    actions = await fetchTravelpayoutsActions({ from })
  } catch (err) {
    console.error('[cron:travelpayouts-sync] fetch failed', err)
    return NextResponse.json({ ok: false, error: 'fetch failed' }, { status: 502 })
  }

  const withActionId = actions.filter((a) => a.externalActionId !== null)
  if (withActionId.length === 0) {
    return NextResponse.json({ ok: true, synced: 0 })
  }

  const supabase = createSupabaseServiceClient()

  const programIds = [...new Set(withActionId.map((a) => a.externalProgramId).filter((id): id is string => id !== null))]
  const { data: programs, error: programsError } = await supabase
    .from('affiliate_network_programs')
    .select('id, external_program_id')
    .eq('network', 'travelpayouts')
    .in('external_program_id', programIds.length > 0 ? programIds : ['__none__'])
  if (programsError) {
    console.error('[cron:travelpayouts-sync] program lookup failed', programsError)
    return NextResponse.json({ ok: false, error: 'program lookup failed' }, { status: 500 })
  }
  const programIdMap = new Map((programs ?? []).map((p) => [p.external_program_id as string, p.id as string]))

  const subIds = [...new Set(withActionId.map((a) => a.subId).filter((id): id is string => id !== null))]
  const { data: links, error: linksError } = await supabase
    .from('affiliate_partner_links')
    .select('sub_id, mission_id, mission_participant_id, creator_id')
    .eq('network', 'travelpayouts')
    .in('sub_id', subIds.length > 0 ? subIds : ['__none__'])
  if (linksError) {
    console.error('[cron:travelpayouts-sync] partner link lookup failed', linksError)
    return NextResponse.json({ ok: false, error: 'link lookup failed' }, { status: 500 })
  }
  const linkMap = new Map((links ?? []).map((l) => [l.sub_id as string, l]))

  const rows = withActionId.map((a) => {
    const link = a.subId ? linkMap.get(a.subId) : undefined
    return {
      network: 'travelpayouts' as const,
      external_action_id: a.externalActionId as string,
      affiliate_network_program_id: a.externalProgramId ? (programIdMap.get(a.externalProgramId) ?? null) : null,
      mission_id: link?.mission_id ?? null,
      mission_participant_id: link?.mission_participant_id ?? null,
      creator_id: link?.creator_id ?? null,
      sub_id: a.subId,
      event_state: a.eventState ?? 'unknown',
      price_amount: a.priceAmount,
      profit_amount: a.profitAmount,
      currency: a.currency,
      booked_at: a.bookedAt,
      external_updated_at: a.updatedAt,
    }
  })

  const { error: upsertError } = await supabase
    .from('affiliate_network_events')
    .upsert(rows, { onConflict: 'network,external_action_id' })
  if (upsertError) {
    console.error('[cron:travelpayouts-sync] upsert failed', upsertError)
    return NextResponse.json({ ok: false, error: 'upsert failed' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, synced: rows.length })
}
