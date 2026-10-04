import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@kinnso/db'

type Client = SupabaseClient<Database>

export interface MerchantOfferRow {
  id: string
  title: string
  terms: string
  discountKind: string
  discountValue: number
  commissionKind: string
  commissionValue: number
  validFrom: string
  validTo: string
  perVisitorLimit: number
  totalCap: number | null
  claimedCount: number
  redeemedCount: number
  status: string
}

export async function listMerchantOffers(supabase: Client, merchantProfileId: string): Promise<MerchantOfferRow[]> {
  const { data, error } = await supabase
    .from('merchant_offers')
    .select('id, title, terms, discount_kind, discount_value, commission_kind, commission_value, valid_from, valid_to, per_visitor_limit, total_cap, claimed_count, redeemed_count, status')
    .eq('merchant_profile_id', merchantProfileId)
    .order('created_at', { ascending: false })
  if (error) throw error

  return (data ?? []).map((row) => ({
    id: row.id, title: row.title, terms: row.terms,
    discountKind: row.discount_kind, discountValue: row.discount_value,
    commissionKind: row.commission_kind, commissionValue: row.commission_value,
    validFrom: row.valid_from, validTo: row.valid_to,
    perVisitorLimit: row.per_visitor_limit, totalCap: row.total_cap,
    claimedCount: row.claimed_count, redeemedCount: row.redeemed_count,
    status: row.status,
  }))
}

export interface OffersSummary {
  totalClaimed: number
  totalRedeemed: number
}

export function summarizeOffers(offers: MerchantOfferRow[]): OffersSummary {
  return {
    totalClaimed: offers.reduce((sum, o) => sum + o.claimedCount, 0),
    totalRedeemed: offers.reduce((sum, o) => sum + o.redeemedCount, 0),
  }
}
