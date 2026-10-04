// apps/web/lib/search/sanitize-match-terms.ts

/**
 * Shared sanitizer for free-text city/region terms used as ILIKE match fragments in a
 * PostgREST `.or()`/`.ilike()` filter string. PostgREST treats commas and parens as
 * filter-string syntax, so terms must be stripped to [letters/numbers/spaces/hyphens]
 * before interpolation, with internal whitespace collapsed. Previously duplicated
 * verbatim across getGuidesForRegions (lib/guides/queries.ts), getExperiencesForCity,
 * and getExperiencesForCities (lib/experiences/public-queries.ts).
 */
export function sanitizeMatchTerm(term: string): string {
  return term.normalize('NFC').replace(/[^\p{L}\p{N}\s-]/gu, '').replace(/\s+/g, ' ').trim()
}

/** Same sanitization as {@link sanitizeMatchTerm}, applied across a list: sub-`minLength`
 * fragments are dropped as noise and duplicates are collapsed (order of first occurrence
 * preserved), since the caller builds a single `.or()` filter from the result. */
export function sanitizeMatchTerms(terms: string[], minLength = 2): string[] {
  return [...new Set(terms.map(sanitizeMatchTerm).filter((t) => t.length >= minLength))]
}
