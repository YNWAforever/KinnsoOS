// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

afterEach(cleanup)

import HomeView from '@/components/kinnso/pages/HomeView'
import en from '@/lib/i18n/messages/en'

const guides = [
  { slug: 'real-osaka', title: 'Real Osaka Guide', cover: 'https://cdn.kinnso.ai/test/entity.jpg', city: 'Osaka', saves: 12, creatorHandle: 'mei' },
  { slug: 'real-seoul', title: 'Real Seoul Guide', cover: 'https://cdn.kinnso.ai/test/seoul.jpg', city: 'Seoul', saves: 7, creatorHandle: 'jun' },
  { slug: 'real-tokyo', title: 'Real Tokyo Guide', cover: 'https://cdn.kinnso.ai/test/tokyo.jpg', city: 'Tokyo', saves: 5, creatorHandle: 'aki' },
]
const stats = { activeCreators: 12, publishedGuides: 48, destinations: 9, completedBookings: 4, upcomingSessions: 6 }
const testimonials = [
  { id: 't1', quote: 'KINNSO paid me for what I already knew.', authorName: 'Mei', authorRole: 'creator' as const },
]
const articles = [
  {
    url: 'osaka-food-streets', category: 'destination', thumbnails: ['https://cdn.kinnso.ai/test/article.jpg'], rating: null,
    published_at: '2026-06-01T00:00:00Z', edit_at: null, title: 'Osaka food streets', summary: 'Where locals actually eat.',
  },
]
// hostHandle intentionally distinct from any guides[].creatorHandle above ('aki' collided
// with the real-tokyo guide's `@aki` card text, making the assertion below ambiguous).
const sessions = [{ id: 's1', slug: 'tokyo-briefing', title: 'Tokyo briefing', hostHandle: 'sora', startsAt: '2026-08-01T10:00:00Z' }]

const productState = { agentLive: true, bookingLive: false, sessionsLive: true }
const base = { locale: 'en' as const, t: en.home, featureInterest: en.featureInterest, guides, stats, testimonials, articles, sessions, productState }

describe('HomeView (R1B 10-section homepage)', () => {
  it('renders the locked hero with both CTAs and a real-cover collage', () => {
    const { container } = render(<HomeView {...base} />)
    expect(
      screen.getByRole('heading', { level: 1, name: 'Real creators. Real places. Book the trip you actually want.' }),
    ).toBeTruthy()
    expect(screen.getByRole('link', { name: new RegExp(en.home.heroPrimaryCta) }).getAttribute('href')).toBe('/en/explore')
    expect(screen.getByRole('link', { name: en.home.heroSecondaryCta }).getAttribute('href')).toBe('/en/creators')
    expect(container.innerHTML).toContain('cdn.kinnso.ai')
  })

  it('renders passing stats and the testimonial pull-quote with its role label', () => {
    render(<HomeView {...base} />)
    expect(screen.getByText('12')).toBeTruthy()
    expect(screen.getByText(en.home.statGuides)).toBeTruthy()
    expect(screen.getByText(/KINNSO paid me for what I already knew\./)).toBeTruthy()
    expect(screen.getByText(new RegExp(`Mei.*${en.home.roleCreator}`))).toBeTruthy()
  })

  it('renders guides as editorial cards linking to guide detail routes', () => {
    render(<HomeView {...base} />)
    expect(screen.getByRole('link', { name: /Real Osaka Guide/ }).getAttribute('href')).toBe('/en/g/real-osaka')
    expect(screen.getByRole('link', { name: new RegExp(en.home.featuredSeeAll) }).getAttribute('href')).toBe('/en/explore')
  })

  it('renders the articles highlight linking into /articles/<category>/<url>', () => {
    render(<HomeView {...base} />)
    expect(screen.getByRole('link', { name: /Osaka food streets/ }).getAttribute('href')).toBe(
      '/en/articles/destinations/osaka-food-streets',
    )
  })

  it('renders sessions when real ones exist', () => {
    render(<HomeView {...base} />)
    expect(screen.getByText(en.home.sessionsHeading)).toBeTruthy()
    expect(screen.getByText('Tokyo briefing')).toBeTruthy()
    expect(screen.getByText('@sora')).toBeTruthy()
  })

  it('hides sessions when the product gate is off even if rows exist', () => {
    render(<HomeView {...base} productState={{ ...productState, sessionsLive: false }} />)
    expect(screen.queryByText(en.home.sessionsHeading)).toBeNull()
    expect(screen.queryByText('Tokyo briefing')).toBeNull()
  })

  it('links each Sessions band card to its detail page', () => {
    render(<HomeView locale="en" t={en.home} featureInterest={en.featureInterest} productState={productState} guides={[]} stats={null} testimonials={[]} articles={[]} sessions={[
      { id: 's1', slug: 'tokyo-briefing', title: 'Tokyo briefing', hostHandle: 'sora', startsAt: '2026-08-01T10:00:00Z' },
    ]} />)
    expect(screen.getByRole('link', { name: /Tokyo briefing/ }).getAttribute('href')).toBe('/en/sessions/tokyo-briefing')
  })

  it('merchant and creator CTAs land on their locked routes', () => {
    render(<HomeView {...base} />)
    expect(screen.getByRole('link', { name: en.home.merchantCta }).getAttribute('href')).toBe('/en/for-merchants')
    expect(screen.getByRole('link', { name: en.home.creatorCta }).getAttribute('href')).toBe('/en/for-creators')
    expect(screen.getByRole('link', { name: new RegExp(en.home.agentLiveCta) }).getAttribute('href')).toBe('/en/agent')
  })

  it('AgentTeaser links straight to /agent with live-chat copy, not waitlist copy', () => {
    render(<HomeView {...base} />)
    expect(screen.getByText(en.home.agentLiveCta)).toBeTruthy()
    const link = screen.getByText(en.home.agentLiveCta).closest('a')
    expect(link?.getAttribute('href')).toBe('/en/agent')
  })

  it('data-gates every proof section: nothing fake when the data is empty', () => {
    const { container } = render(
      <HomeView {...base} guides={[]} stats={null} testimonials={[]} articles={[]} sessions={[]} />,
    )
    expect(screen.getByText(en.home.featuredEmpty)).toBeTruthy()
    expect(screen.queryByText(en.home.sessionsHeading)).toBeNull()
    expect(screen.queryByText(en.home.articlesHeading)).toBeNull()
    expect(container.querySelector('blockquote')).toBeNull()
    expect(container.querySelector('img')).toBeNull() // typographic hero, no empty frames
  })

  it('contains no Unsplash imagery and no legacy mock widgets', () => {
    const { container } = render(<HomeView {...base} />)
    expect(container.querySelector('img[src*="unsplash"]')).toBeNull()
    expect(container.querySelector('.k-ticket')).toBeNull()
  })
})
  it('renders placeholders without leaking non-CDN media', () => {
    const invalidGuides = guides.map((guide) => ({ ...guide, cover: `https://picsum.photos/${guide.slug}.jpg` }))
    const invalidArticles = articles.map((article) => ({ ...article, thumbnails: ['https://picsum.photos/article.jpg'] }))
    const { container } = render(
      <HomeView {...base} guides={invalidGuides} articles={invalidArticles} />,
    )
    expect(container.querySelector('[data-media-placeholder="true"]')).toBeTruthy()
    expect(container.innerHTML).not.toContain('picsum.photos')
  })
