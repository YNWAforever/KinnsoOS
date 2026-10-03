// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

afterEach(cleanup)

import { AgentTeaser } from '@/components/kinnso/home/AgentTeaser'
import { HowItWorks } from '@/components/kinnso/home/HowItWorks'
import { MerchantValue } from '@/components/kinnso/home/MerchantValue'
import { CreatorCta } from '@/components/kinnso/home/CreatorCta'
import en from '@/lib/i18n/messages/en'

describe('AgentTeaser (section 5)', () => {
  it('shows booking-waitlist live copy when Agent is ON and Booking is OFF', () => {
    const { container } = render(
      <AgentTeaser locale="en" t={en.home} featureInterest={en.featureInterest} agentLive bookingLive={false} />,
    )
    expect(screen.getByText(en.home.agentLiveTitle)).toBeTruthy()
    expect(screen.getByText(en.home.agentLiveBodyBookingWaitlist)).toBeTruthy()
    expect(screen.getByText(en.home.agentLiveNote)).toBeTruthy()
    expect(screen.getByRole('link', { name: new RegExp(en.home.agentLiveCta) }).getAttribute('href')).toBe('/en/agent')
    expect(container.querySelector('input')).toBeNull()
    expect(container.querySelector('form')).toBeNull()
  })

  it('shows direct-booking live copy when Agent and Booking are ON', () => {
    render(
      <AgentTeaser locale="en" t={en.home} featureInterest={en.featureInterest} agentLive bookingLive />,
    )
    expect(screen.getByText(en.home.agentLiveBodyBookingLive)).toBeTruthy()
  })
  it('shows interest capture and no live CTA when Agent is OFF', () => {
    render(
      <AgentTeaser locale="en" t={en.home} featureInterest={en.featureInterest} agentLive={false} bookingLive />,
    )
    expect(screen.getByText(en.home.agentWaitlistTitle)).toBeTruthy()
    expect(screen.getByText(en.home.agentWaitlistBody)).toBeTruthy()
    expect(screen.getByRole('form', { name: en.featureInterest.submitAgent })).toBeTruthy()
    expect(screen.queryByRole('link', { name: new RegExp(en.home.agentLiveCta) })).toBeNull()
  })
})
describe('HowItWorks booking state', () => {
  it('uses waitlist step-three title and body when Booking is OFF', () => {
    render(<HowItWorks t={en.home} bookingLive={false} />)
    expect(screen.getByText(en.home.howT3TitleWaitlist)).toBeTruthy()
    expect(screen.getByText(en.home.howT3DescWaitlist)).toBeTruthy()
  })

  it('uses direct-booking step-three title and body when Booking is ON', () => {
    render(<HowItWorks t={en.home} bookingLive />)
    expect(screen.getByText(en.home.howT3TitleLive)).toBeTruthy()
    expect(screen.getByText(en.home.howT3DescLive)).toBeTruthy()
  })
})
describe('MerchantValue (section 8)', () => {
  it('renders the three benefit bullets and the CTA to /for-merchants', () => {
    render(<MerchantValue locale="en" t={en.home} />)
    for (const b of [en.home.merchantBullet1, en.home.merchantBullet2, en.home.merchantBullet3]) {
      expect(screen.getByText(b)).toBeTruthy()
    }
    expect(screen.getByRole('link', { name: en.home.merchantCta }).getAttribute('href')).toBe('/en/for-merchants')
  })
})

describe('CreatorCta (section 9)', () => {
  it('renders the three bullets and the CTA to /for-creators', () => {
    render(<CreatorCta locale="en" t={en.home} />)
    for (const b of [en.home.creatorBullet1, en.home.creatorBullet2, en.home.creatorBullet3]) {
      expect(screen.getByText(b)).toBeTruthy()
    }
    expect(screen.getByRole('link', { name: en.home.creatorCta }).getAttribute('href')).toBe('/en/for-creators')
    expect(screen.getByText(en.home.creatorBullet1).className).toContain('text-white/90')
  })
})
