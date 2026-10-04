export interface Review {
  id: string
  rating: number
  body: string | null
  createdAt: string
}

export interface RatingAggregate {
  average: number
  count: number
}
