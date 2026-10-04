import { meetsTier, type GatedTier, type Tier } from '@/lib/contribution/tiers'
import type { ActivePerk } from '@/lib/perks/queries'

export type PerkCardState = 'locked' | 'redeemable' | 'redeemed'

export interface PerkCard {
  id: string
  slug: string
  partnerName: string
  title: string
  summary: string
  category: string
  discountLabel: string
  minTier: GatedTier | null
  redemptionType: 'code' | 'link'
  state: PerkCardState
}

/** Derive the card state: redeemed (in set) > redeemable (meets tier) > locked. */
export function mapPerkCard(row: ActivePerk, creatorTier: Tier, redeemedIds: Set<string>): PerkCard {
  const minTier = (row.min_tier ?? null) as GatedTier | null
  const state: PerkCardState = redeemedIds.has(row.id)
    ? 'redeemed'
    : meetsTier(creatorTier, minTier)
      ? 'redeemable'
      : 'locked'
  return {
    id: row.id,
    slug: row.slug,
    partnerName: row.partner_name,
    title: row.title,
    summary: row.summary,
    category: row.category,
    discountLabel: row.discount_label,
    minTier,
    redemptionType: row.redemption_type as 'code' | 'link',
    state,
  }
}
