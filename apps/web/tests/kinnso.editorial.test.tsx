// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { SectionShell } from '@/components/kinnso/editorial/SectionShell'
import { Eyebrow } from '@/components/kinnso/editorial/Eyebrow'
import { EditorialCard } from '@/components/kinnso/editorial/EditorialCard'

afterEach(cleanup)

describe('editorial primitives (R1A)', () => {
  it('SectionShell wraps children in the k2 container band', () => {
    render(
      <SectionShell>
        <p>INNER</p>
      </SectionShell>,
    )
    const inner = screen.getByText('INNER')
    expect(inner.closest('.k2-container')).toBeTruthy()
    expect(inner.closest('section')).toBeTruthy()
  })

  it('SectionShell can render as a div and merge classes', () => {
    render(
      <SectionShell as="div" className="bg-kinnso-cream">
        <p>INNER2</p>
      </SectionShell>,
    )
    const band = screen.getByText('INNER2').closest('div.bg-kinnso-cream')
    expect(band).toBeTruthy()
  })

  it('SectionShell className override wins over the default rhythm', () => {
    render(
      <SectionShell className="py-8">
        <p>INNER3</p>
      </SectionShell>,
    )
    const section = screen.getByText('INNER3').closest('section')
    expect(section?.className).toContain('py-8')
    // tailwind-merge drops the conflicting py-14 default so the caller wins
    expect(section?.className).not.toContain('py-14')
  })

  it('Eyebrow renders a small-caps kicker', () => {
    render(<Eyebrow>From the journal</Eyebrow>)
    expect(screen.getByText('From the journal').className).toContain('k2-eyebrow')
  })

  it('EditorialCard renders media slot, kicker, title, body and footer', () => {
    render(
      // external href: @next/next/no-html-link-for-pages forbids raw <a> to app pages
      <EditorialCard media={<span>MEDIA</span>} kicker="Tokyo" title="Night markets" footer={<a href="https://example.com/read">Read</a>}>
        Body copy
      </EditorialCard>,
    )
    expect(screen.getByText('MEDIA')).toBeTruthy()
    expect(screen.getByText('Tokyo')).toBeTruthy()
    expect(screen.getByRole('heading', { level: 3, name: 'Night markets' })).toBeTruthy()
    expect(screen.getByText('Body copy')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Read' })).toBeTruthy()
  })

  it('EditorialCard omits the media band when no media is given', () => {
    const { container } = render(<EditorialCard title="No photo" />)
    expect(container.querySelector('[data-slot="media"]')).toBeNull()
  })

  it('EditorialCard titleAs="h2" renders a level-2 heading', () => {
    render(<EditorialCard titleAs="h2" title="Top story" />)
    expect(screen.getByRole('heading', { level: 2, name: 'Top story' })).toBeTruthy()
  })
})
