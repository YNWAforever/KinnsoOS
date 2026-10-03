// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import DestinationsIndexView from '@/components/kinnso/pages/DestinationsIndexView'
import en from '@/lib/i18n/messages/en'

afterEach(cleanup)

describe('destination index count accessibility', () => {
  it('exposes the localized count separator in the linked card name', () => {
    render(
      <DestinationsIndexView
        locale="en"
        t={en.destinations}
        destinations={[{
          slug: 'tokyo', name: 'Tokyo', heroImageUrl: null, description: null, matchTerms: ['Tokyo'],
          guideCount: 1, experienceCount: 2, latestPublishedAt: null,
        }]}
      />,
    )

    expect(screen.getByRole('link', { name: /Tokyo.*1 guide\s*·\s*2 experiences/ })).toBeTruthy()
  })
})
