import { describe, expect, it } from 'vitest'
import {
  FORBIDDEN_PLACEHOLDER_TOKENS,
  findForbiddenPlaceholderTokens,
} from '../src/forbidden-tokens'

describe('forbidden placeholder tokens', () => {
  it('reports nothing for honest content', () => {
    expect(findForbiddenPlaceholderTokens('Best Ramen in Tokyo — https://cdn.kinnso.ai/a.webp')).toEqual([])
  })

  it('matches regardless of the casing the caller happens to hold', () => {
    // The static sweep reads raw source lines and the Playwright assertion reads
    // lowercased HTML; both must land on the same canonical token.
    expect(findForbiddenPlaceholderTokens('Photo by JANE DOE')).toEqual(['Jane Doe'])
    expect(findForbiddenPlaceholderTokens('photo by jane doe')).toEqual(['Jane Doe'])
  })

  it('reports every distinct token found in one blob', () => {
    const html = '<img src="https://picsum.photos/600"><p>Lorem ipsum</p>'
    expect(findForbiddenPlaceholderTokens(html)).toEqual(['picsum.photos', 'lorem ipsum'])
  })

  it('keeps each token declared exactly once', () => {
    expect(new Set(FORBIDDEN_PLACEHOLDER_TOKENS).size).toBe(FORBIDDEN_PLACEHOLDER_TOKENS.length)
  })
})
