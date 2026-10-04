import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@kinnso/db'

type Client = SupabaseClient<Database>

export interface PublicOffer {
  id: string
  title: string
  terms: string
  discountKind: string
  discountValue: number
  merchantName: string
  validTo: string
}

export async function listOffersForCreator(supabase: Client, creatorId: string): Promise<PublicOffer[]> {
  const { data, error } = await supabase.rpc('list_offers_for_creator', { p_creator_id: creatorId })
  if (error) throw error
  return (data ?? []).map((row) => ({
    id: row.id, title: row.title, terms: row.terms,
    discountKind: row.discount_kind, discountValue: row.discount_value,
    merchantName: row.merchant_name, validTo: row.valid_to,
  }))
}
