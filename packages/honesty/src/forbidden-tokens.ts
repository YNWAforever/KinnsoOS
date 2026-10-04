/**
 * Placeholder strings that must never survive into a rendered page, a seed row or a
 * fixture. They are the tells of scaffolded content standing in for real inventory, and
 * shipping one is a product-honesty failure rather than a cosmetic one.
 *
 * This list is the single source of truth for both enforcement points — the static sweep
 * over sources and seeds (scripts/honesty-lint.ts) and the assertion over rendered HTML
 * (apps/e2e/specs/honesty.spec.ts). Two hand-copied lists drift, and a token added to only
 * one of them produces a check that reports green while the other tier stays unguarded.
 */
export const FORBIDDEN_PLACEHOLDER_TOKENS = [
  'picsum.photos',
  'example.com',
  'maps.example',
  'Jane Doe',
  'lorem ipsum',
] as const

export type ForbiddenPlaceholderToken = (typeof FORBIDDEN_PLACEHOLDER_TOKENS)[number]

/**
 * Returns the canonical spelling of every forbidden token present in `text`, matched
 * case-insensitively — callers compare source lines and rendered HTML, neither of which
 * preserves the casing the token is written in here.
 */
export function findForbiddenPlaceholderTokens(text: string): ForbiddenPlaceholderToken[] {
  const haystack = text.toLowerCase()
  return FORBIDDEN_PLACEHOLDER_TOKENS.filter((token) => haystack.includes(token.toLowerCase()))
}
