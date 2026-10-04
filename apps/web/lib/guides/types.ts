/** Public guide-card shape (R1C: relocated from creator-mock — it was never mock data). */
export interface Guide {
  slug: string
  title: string
  cover: string | null
  city: string
  saves: number
  creatorHandle: string
}

/** Raw form input from the GuideForm. */
export interface GuideInput {
  title: string
  city: string
  coverUrl: string
  summary: string
}

/** A row in the My-guides list (owner view). */
export interface GuideListItem {
  id: string
  slug: string
  title: string
  city: string
  cover: string | null
  status: 'draft' | 'published'
}

/** Detail-page shape: the public Guide plus detail-only fields. */
export interface GuideDetail extends Guide {
  id: string
  creatorId: string | null
  summary: string | null
  creatorName: string | null
  publishedAt: string | null
  source: 'db' | 'mock'
}
