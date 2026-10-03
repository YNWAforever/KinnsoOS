/**
 * Curated Travelpayouts affiliate catalog — single source of truth for the
 * seed migration (kinnso-v3/supabase/migrations/<ts>_seed_travelpayouts_offers.sql),
 * which is kept in sync by tests/missions.offer-catalog-parity.test.ts.
 *
 * externalProgramId values are placeholders (`tp-<slug>`); replace with the real
 * Travelpayouts campaign ids from your dashboard so affiliate-event attribution
 * resolves. Commission rates are forward-looking metadata: the current earnings
 * math derives from mission_settlements, not these fields.
 */
export type OfferCatalogCategory =
  | 'Hotels & stays'
  | 'Flights & hotels'
  | 'Tours & activities'
  | 'Travel eSIM'
  | 'Flights'

export type OfferCatalogEntry = {
  externalProgramId: string
  programName: string
  programUrl: string
  category: OfferCatalogCategory
  defaultCurrency: string
  commissionDescription: string
  title: string
  summary: string
  affiliateCommissionRate: number
  creatorCommissionRate: number
  kinnsoCommissionRate: number
}

export const OFFER_CATALOG: OfferCatalogEntry[] = [
  {
    externalProgramId: 'tp-booking-com',
    programName: 'Booking.com',
    programUrl: 'https://www.booking.com',
    category: 'Hotels & stays',
    defaultCurrency: 'USD',
    commissionDescription: 'Up to 4% per stay',
    title: 'Booking.com stays',
    summary: 'Earn commission when your audience books hotels and stays through Booking.com.',
    affiliateCommissionRate: 4,
    creatorCommissionRate: 70,
    kinnsoCommissionRate: 30,
  },
  {
    externalProgramId: 'tp-agoda',
    programName: 'Agoda',
    programUrl: 'https://www.agoda.com',
    category: 'Hotels & stays',
    defaultCurrency: 'USD',
    commissionDescription: 'Up to 5% per booking',
    title: 'Agoda hotels',
    summary: 'Strong in Asia — earn on hotel bookings across the region via Agoda.',
    affiliateCommissionRate: 5,
    creatorCommissionRate: 70,
    kinnsoCommissionRate: 30,
  },
  {
    externalProgramId: 'tp-trip-com',
    programName: 'Trip.com',
    programUrl: 'https://www.trip.com',
    category: 'Flights & hotels',
    defaultCurrency: 'USD',
    commissionDescription: 'Up to 4% per booking',
    title: 'Trip.com flights & hotels',
    summary: 'Flights, hotels and trains across Asia — earn on Trip.com bookings.',
    affiliateCommissionRate: 4,
    creatorCommissionRate: 70,
    kinnsoCommissionRate: 30,
  },
  {
    externalProgramId: 'tp-klook',
    programName: 'Klook',
    programUrl: 'https://www.klook.com',
    category: 'Tours & activities',
    defaultCurrency: 'USD',
    commissionDescription: 'Up to 5% per activity',
    title: 'Klook activities',
    summary: 'Tours, attractions and experiences — huge in HK and across Asia.',
    affiliateCommissionRate: 5,
    creatorCommissionRate: 70,
    kinnsoCommissionRate: 30,
  },
  {
    externalProgramId: 'tp-kkday',
    programName: 'KKday',
    programUrl: 'https://www.kkday.com',
    category: 'Tours & activities',
    defaultCurrency: 'USD',
    commissionDescription: 'Up to 5% per activity',
    title: 'KKday experiences',
    summary: 'Taiwan-born activities platform — earn on tours and experiences in Asia.',
    affiliateCommissionRate: 5,
    creatorCommissionRate: 70,
    kinnsoCommissionRate: 30,
  },
  {
    externalProgramId: 'tp-getyourguide',
    programName: 'GetYourGuide',
    programUrl: 'https://www.getyourguide.com',
    category: 'Tours & activities',
    defaultCurrency: 'USD',
    commissionDescription: 'Up to 8% per activity',
    title: 'GetYourGuide tours',
    summary: 'Global tours and activities — earn on bookings worldwide.',
    affiliateCommissionRate: 8,
    creatorCommissionRate: 70,
    kinnsoCommissionRate: 30,
  },
  {
    externalProgramId: 'tp-airalo',
    programName: 'Airalo',
    programUrl: 'https://www.airalo.com',
    category: 'Travel eSIM',
    defaultCurrency: 'USD',
    commissionDescription: 'Up to 10% per eSIM',
    title: 'Airalo travel eSIM',
    summary: 'Creator-favourite travel eSIM — earn when followers buy data abroad.',
    affiliateCommissionRate: 10,
    creatorCommissionRate: 70,
    kinnsoCommissionRate: 30,
  },
  {
    externalProgramId: 'tp-aviasales',
    programName: 'Aviasales',
    programUrl: 'https://www.aviasales.com',
    category: 'Flights',
    defaultCurrency: 'USD',
    commissionDescription: 'Approx. 1.6% per ticket',
    title: 'Aviasales flights',
    summary: 'Flight search and booking — earn on ticket sales via Aviasales.',
    affiliateCommissionRate: 1.6,
    creatorCommissionRate: 70,
    kinnsoCommissionRate: 30,
  },
]
