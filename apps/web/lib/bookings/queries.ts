import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@kinnso/db'
import type { MerchantBookingRow, OpsBookingSettlementRow, TravelerBookingRow } from './types'

function maskGuestEmail(email: string): string {
  const [local, domain] = email.split('@')
  if (!domain) return email
  const visible = local.slice(0, 2)
  return `${visible}${'*'.repeat(Math.max(local.length - 2, 1))}@${domain}`
}

interface MerchantBookingQueryRow {
  id: string
  status: string
  qty: number
  total_amount: number
  currency: string
  traveler_user_id: string | null
  guest_email: string | null
  creator_id: string | null
  created_at: string
  experiences: { title: string } | { title: string }[] | null
  creators?: { handle: string; display_name: string | null } | { handle: string; display_name: string | null }[] | null
}

function one<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value
}

export async function listMerchantBookings(
  supabase: SupabaseClient<Database>,
  merchantProfileId: string,
): Promise<MerchantBookingRow[]> {
  const { data, error } = await supabase
    .from('bookings')
    .select(
      'id, status, qty, total_amount, currency, traveler_user_id, guest_email, creator_id, created_at, experiences!inner(title, merchant_profile_id), creators(handle, display_name)',
    )
    .eq('experiences.merchant_profile_id', merchantProfileId)
    .order('created_at', { ascending: false })

  if (error) throw error

  return ((data ?? []) as unknown as MerchantBookingQueryRow[]).map((row) => {
    const experience = one(row.experiences)
    const creator = one(row.creators ?? null)
    return {
      id: row.id,
      experienceTitle: experience?.title ?? 'Untitled experience',
      status: row.status as MerchantBookingRow['status'],
      qty: row.qty,
      totalAmount: row.total_amount,
      currency: row.currency,
      travelerLabel: row.guest_email ? maskGuestEmail(row.guest_email) : (row.traveler_user_id ?? 'Traveller'),
      creatorLabel: creator?.display_name ?? creator?.handle ?? 'Direct',
      createdAt: row.created_at,
    }
  })
}

interface TravelerBookingQueryRow {
  id: string
  status: string
  qty: number
  total_amount: number
  currency: string
  created_at: string
  experience_id: string
  guide_id: string | null
  experiences: { title: string; slug: string; merchant_profiles: { company_name: string } | { company_name: string }[] | null } | Array<{ title: string; slug: string; merchant_profiles: { company_name: string } | { company_name: string }[] | null }> | null
  experience_availability: { date: string } | { date: string }[] | null
  reviews: { id: string } | { id: string }[] | null
}

export async function listMyBookings(
  supabase: SupabaseClient<Database>,
  travelerUserId: string,
): Promise<TravelerBookingRow[]> {
  const { data, error } = await supabase
    .from('bookings')
    .select(
      'id, status, qty, total_amount, currency, created_at, experience_id, guide_id, experiences(title, slug, merchant_profiles(company_name)), experience_availability(date), reviews(id)',
    )
    .eq('traveler_user_id', travelerUserId)
    .order('created_at', { ascending: false })

  if (error) throw error

  return ((data ?? []) as unknown as TravelerBookingQueryRow[]).map((row) => {
    const experience = one(row.experiences)
    const merchant = experience ? one(experience.merchant_profiles) : null
    const availability = one(row.experience_availability)
    const review = one(row.reviews)
    return {
      id: row.id,
      experienceTitle: experience?.title ?? 'Untitled experience',
      experienceSlug: experience?.slug ?? '',
      merchantName: merchant?.company_name ?? 'Merchant',
      status: row.status as TravelerBookingRow['status'],
      qty: row.qty,
      totalAmount: row.total_amount,
      currency: row.currency,
      bookingDate: availability?.date ?? null,
      createdAt: row.created_at,
      experienceId: row.experience_id,
      guideId: row.guide_id,
      reviewId: review?.id ?? null,
    }
  })
}

interface OpsSettlementQueryRow {
  id: string
  booking_id: string
  status: string
  merchant_payout_status: string
  merchant_payout_amount: number
  creator_commission_status: string | null
  creator_commission_amount: number | null
  kinnso_commission_status: string
  kinnso_commission_amount: number
  currency: string
  bookings: { experiences: { title: string } | { title: string }[] | null } | Array<{ experiences: { title: string } | { title: string }[] | null }> | null
}

export async function listOpsBookingSettlements(
  supabase: SupabaseClient<Database>,
): Promise<OpsBookingSettlementRow[]> {
  const { data, error } = await supabase
    .from('booking_settlements')
    .select(
      'id, booking_id, status, merchant_payout_status, merchant_payout_amount, creator_commission_status, creator_commission_amount, kinnso_commission_status, kinnso_commission_amount, currency, bookings(experiences(title))',
    )
    .order('created_at', { ascending: false })

  if (error) throw error

  return ((data ?? []) as unknown as OpsSettlementQueryRow[]).map((row) => {
    const booking = one(row.bookings)
    const experience = booking ? one(booking.experiences) : null
    return {
      id: row.id,
      bookingId: row.booking_id,
      experienceTitle: experience?.title ?? 'Untitled experience',
      status: row.status,
      merchantPayoutStatus: row.merchant_payout_status,
      merchantPayoutAmount: row.merchant_payout_amount,
      creatorCommissionStatus: row.creator_commission_status,
      creatorCommissionAmount: row.creator_commission_amount,
      kinnsoCommissionStatus: row.kinnso_commission_status,
      kinnsoCommissionAmount: row.kinnso_commission_amount,
      currency: row.currency,
    }
  })
}
