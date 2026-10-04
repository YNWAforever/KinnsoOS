import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@kinnso/db'
import type { GatedTier } from '@/lib/contribution/tiers'

export const merchantMissionSelect = `
  id,title,summary,mission_source,mission_type,visibility,status,published_at,
  coupon_code,coupon_url,paid_fee_amount,paid_fee_currency,
  mission_participants(
    id,status,source,creator_id,application_note,merchant_review_note,approved_at,
    mission_milestone_submissions(id,status,mission_social_snapshots(confidence_status))
  ),
  mission_milestones(id,title,description,due_at,sort_order),
  mission_settlements(id,status,creator_payout_status,kinnso_commission_status,affiliate_commission_status)
`

export const creatorMissionSelect = `
  id,title,summary,mission_source,mission_type,visibility,status,published_at,min_tier,merchant_profile_id,
  coupon_code,coupon_url,affiliate_commission_rate,creator_commission_rate,kinnso_commission_rate,
  paid_fee_amount,paid_fee_currency,affiliate_network_program_id,
  affiliate_network_programs(id,program_name,program_url,default_commission_description,status),
  mission_milestones(id,title,description,due_at,sort_order),
  mission_participants(id,status,source,creator_id,mission_milestone_submissions(id,status,mission_milestone_id)),
  affiliate_partner_links(id,partner_url,original_url,sub_id)
`

export const affiliateOfferSelect = `
  id,title,summary,mission_source,mission_type,status,published_at,
  affiliate_network_programs(id,program_name,program_url,category,default_commission_description,status),
  mission_participants(id,status,source,creator_id),
  affiliate_partner_links(id,partner_url,original_url,sub_id)
`

export const opsSettlementSelect = `
  id,status,merchant_invoice_status,merchant_payment_status,creator_payout_status,
  kinnso_commission_status,affiliate_commission_status,amount_currency,
  paid_fee_amount,affiliate_commission_amount,kinnso_commission_amount,creator_commission_amount,ops_note,
  missions(id,title,mission_source,mission_type),
  mission_participants(id,creator_id,status),
  affiliate_network_events(id,network,external_action_id,sub_id,event_state,profit_amount,currency)
`

export const creatorSettlementSelect = `
  id,status,creator_payout_status,amount_currency,
  creator_commission_amount,paid_fee_amount,
  missions(title,mission_type,mission_source)
`

export async function getMerchantProfile(
  supabase: SupabaseClient<Database>,
  userId: string,
) {
  return supabase.from('merchant_profiles').select('id, company_name, contact_email, status').eq('user_id', userId).maybeSingle()
}

export async function listMerchantMissions(
  supabase: SupabaseClient<Database>,
  merchantProfileId: string,
) {
  return supabase
    .from('missions')
    .select(merchantMissionSelect)
    .eq('merchant_profile_id', merchantProfileId)
    .order('created_at', { ascending: false })
}

export async function listAffiliateOffers(
  supabase: SupabaseClient<Database>,
) {
  return supabase
    .from('missions')
    .select(affiliateOfferSelect)
    .eq('status', 'published')
    .eq('mission_source', 'travelpayouts')
    .order('published_at', { ascending: false })
}

export async function listCreatorMerchantMissions(
  supabase: SupabaseClient<Database>,
) {
  return supabase
    .from('missions')
    .select(creatorMissionSelect)
    .eq('status', 'published')
    .neq('mission_source', 'travelpayouts')
    .order('published_at', { ascending: false })
}

export const creatorMissionDetailSelect = `
  id,title,summary,mission_source,mission_type,visibility,status,published_at,min_tier,
  coupon_code,coupon_url,affiliate_commission_rate,creator_commission_rate,kinnso_commission_rate,
  paid_fee_amount,paid_fee_currency,affiliate_network_program_id,max_receipts_per_creator,
  deliverables,requirements,dos,donts,key_messages,reference_links,effort,
  affiliate_network_programs(id,program_name,program_url,default_commission_description,status),
  mission_milestones(id,title,description,due_at,sort_order,repeatable),
  mission_participants(id,status,source,creator_id,application_note,
    mission_milestone_submissions(id,mission_milestone_id,status,proof_urls,notes,merchant_feedback,submitted_at,
      mission_social_snapshots(confidence_status),
      mission_verification_jobs(id,status,confidence_status,created_at),
      mission_review_events(reason_category,reason_text,action,created_at))),
  affiliate_partner_links(id,partner_url,original_url,sub_id)
`

export async function getCreatorMissionDetail(
  supabase: SupabaseClient<Database>,
  missionId: string,
) {
  return supabase
    .from('missions')
    .select(creatorMissionDetailSelect)
    .eq('id', missionId)
    .eq('status', 'published')
    .maybeSingle()
}

export async function listCreatorSettlements(
  supabase: SupabaseClient<Database>,
) {
  return supabase
    .from('mission_settlements')
    .select(creatorSettlementSelect)
    .order('updated_at', { ascending: false })
}

export async function listOpsSettlements(supabase: SupabaseClient<Database>) {
  return supabase
    .from('mission_settlements')
    .select(opsSettlementSelect)
    .order('updated_at', { ascending: false })
}

export async function countGatedMissionsByTier(
  supabase: SupabaseClient<Database>,
): Promise<Record<GatedTier, number>> {
  const counts: Record<GatedTier, number> = { rising: 0, pro: 0, elite: 0 }
  const { data } = await supabase
    .from('missions')
    .select('min_tier')
    .eq('status', 'published')
    .eq('mission_source', 'merchant')
    .eq('visibility', 'open')
    .not('min_tier', 'is', null)
  for (const row of (data ?? []) as Array<{ min_tier: string | null }>) {
    const tier = row.min_tier as GatedTier | null
    if (tier && tier in counts) counts[tier] += 1
  }
  return counts
}
