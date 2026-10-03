import { beforeEach, describe, expect, it, vi } from 'vitest'

const { configuredStateMock } = vi.hoisted(() => ({
  configuredStateMock: vi.fn(() => ({ agentLive: true, bookingLive: false })),
}))

vi.mock('@/lib/product-state', () => ({ resolveConfiguredProductState: configuredStateMock }))

import { generateMetadata } from '@/app/[locale]/agent/page'
import en from '@/lib/i18n/messages/en'

beforeEach(() => {
  configuredStateMock.mockReturnValue({ agentLive: true, bookingLive: false })
})

describe('Agent metadata state', () => {
  it('uses the visible live-page dictionary branch when Agent is ON', async () => {
    const metadata = await generateMetadata({ params: Promise.resolve({ locale: 'en' }) })
    expect(metadata.title).toBe(en.seo.agentLive.title)
    expect(metadata.description).toBe(en.seo.agentLive.description)
  })

  it('uses the visible waitlist-page dictionary branch when Agent is OFF', async () => {
    configuredStateMock.mockReturnValueOnce({ agentLive: false, bookingLive: false })
    const metadata = await generateMetadata({ params: Promise.resolve({ locale: 'en' }) })
    expect(metadata.title).toBe(en.seo.agentWaitlist.title)
    expect(metadata.description).toBe(en.seo.agentWaitlist.description)
  })
})
