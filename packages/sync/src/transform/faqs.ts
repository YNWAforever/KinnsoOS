import type { FaqRow, LegacyPostBundle } from '../types'

export function transformFaqs(legacyFaqs: LegacyPostBundle['faqs']): Omit<FaqRow, 'article_id'>[] {
  return [...legacyFaqs]
    .sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0))
    .map((f) => ({ locale: f.language, question: f.question, answer: f.answer, weight: f.weight ?? 0 }))
}
