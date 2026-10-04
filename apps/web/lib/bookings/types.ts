export type BookingStatus =
  | 'pending_payment'
  | 'confirmed'
  | 'completed'
  | 'cancelled'
  | 'refunded'

export interface MerchantBookingRow {
  id: string
  experienceTitle: string
  status: BookingStatus
  qty: number
  totalAmount: number
  currency: string
  travelerLabel: string // display name if signed-in, else masked guest email
  creatorLabel: string // creator handle/display name, or "Direct" when null
  createdAt: string
}

export interface TravelerBookingRow {
  id: string
  experienceTitle: string
  experienceSlug: string
  merchantName: string
  status: BookingStatus
  qty: number
  totalAmount: number
  currency: string
  bookingDate: string | null // experience_availability.date, if joinable
  createdAt: string
  experienceId: string
  guideId: string | null
  reviewId: string | null
}

export interface OpsBookingSettlementRow {
  id: string
  bookingId: string
  experienceTitle: string
  status: string
  merchantPayoutStatus: string
  merchantPayoutAmount: number
  creatorCommissionStatus: string | null
  creatorCommissionAmount: number | null
  kinnsoCommissionStatus: string
  kinnsoCommissionAmount: number
  currency: string
}
