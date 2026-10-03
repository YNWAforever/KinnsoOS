export interface ParsedReview {
  rating: number
  body: string | null
}

export type ReviewValidationResult =
  | { ok: true; parsed: ParsedReview }
  | { ok: false; errors: Record<string, string[]> }

export function validateReviewInput(input: { rating: number; body: string }): ReviewValidationResult {
  const errors: Record<string, string[]> = {}
  if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) {
    errors.rating = ['Choose a rating from 1 to 5 stars']
  }
  const trimmedBody = input.body.trim()
  if (trimmedBody.length > 2000) {
    errors.body = ['Keep your review under 2000 characters']
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors }
  return { ok: true, parsed: { rating: input.rating, body: trimmedBody === '' ? null : trimmedBody } }
}
