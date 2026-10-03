export const EXPERIENCE_CURRENCIES = ['HKD', 'USD', 'SGD', 'JPY', 'KRW', 'THB', 'TWD', 'CNY'] as const
export type ExperienceCurrency = (typeof EXPERIENCE_CURRENCIES)[number]

export type ExperienceInput = {
  title: string
  summary: string
  description: string
  city: string
  priceAmount: string // form-string; validated/parsed to number in validation
  currency: string
  durationMinutes: string // form-string; '' = not set
  coverUrl: string
}
