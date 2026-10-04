// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'

afterEach(cleanup)

import { HowItWorks } from '@/components/kinnso/home/HowItWorks'
import en from '@/lib/i18n/messages/en'

describe('HowItWorks (section 3)', () => {
  it('defaults to the traveller steps', () => {
    render(<HowItWorks t={en.home} bookingLive={false} />)
    expect(screen.getByRole('tab', { name: en.home.howTabTravellers }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByText(en.home.howT1Title)).toBeTruthy()
    expect(screen.getByText(en.home.howT3DescWaitlist)).toBeTruthy()
    expect(screen.queryByText(en.home.howC1Title)).toBeNull()
    expect(screen.queryByText(en.home.howM1Title)).toBeNull()
  })

  it('uses the live traveller booking promise when booking is on', () => {
    render(<HowItWorks t={en.home} bookingLive />)
    expect(screen.getByText(en.home.howT3DescLive)).toBeTruthy()
    expect(screen.queryByText(en.home.howT3DescWaitlist)).toBeNull()
  })

  it('switches to creator steps on tab click (pure client state — no URL change)', () => {
    render(<HowItWorks t={en.home} bookingLive={false} />)
    fireEvent.click(screen.getByRole('tab', { name: en.home.howTabCreators }))
    expect(screen.getByRole('tab', { name: en.home.howTabCreators }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByText(en.home.howC1Title)).toBeTruthy()
    expect(screen.queryByText(en.home.howT1Title)).toBeNull()
  })

  it('switches to merchant steps', () => {
    render(<HowItWorks t={en.home} bookingLive={false} />)
    fireEvent.click(screen.getByRole('tab', { name: en.home.howTabMerchants }))
    expect(screen.getByRole('tab', { name: en.home.howTabMerchants }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByText(en.home.howM1Title)).toBeTruthy()
    expect(screen.getByText(en.home.howM3Desc)).toBeTruthy()
  })

  it('follows the APG keyboard pattern: roving tabindex, wrapping arrows, End', () => {
    render(<HowItWorks t={en.home} bookingLive={false} />)
    const traveller = screen.getByRole('tab', { name: en.home.howTabTravellers })
    const creator = screen.getByRole('tab', { name: en.home.howTabCreators })
    const merchant = screen.getByRole('tab', { name: en.home.howTabMerchants })
    traveller.focus()
    fireEvent.keyDown(traveller, { key: 'ArrowRight' })
    expect(creator.getAttribute('aria-selected')).toBe('true')
    expect(document.activeElement).toBe(creator)
    expect(creator.tabIndex).toBe(0)
    expect(traveller.tabIndex).toBe(-1)
    fireEvent.keyDown(creator, { key: 'End' })
    expect(merchant.getAttribute('aria-selected')).toBe('true')
    fireEvent.keyDown(merchant, { key: 'ArrowRight' })
    expect(traveller.getAttribute('aria-selected')).toBe('true')
  })

  it('Home key returns to the first tab', () => {
    render(<HowItWorks t={en.home} bookingLive={false} />)
    const merchant = screen.getByRole('tab', { name: en.home.howTabMerchants })
    fireEvent.click(merchant)
    fireEvent.keyDown(merchant, { key: 'Home' })
    expect(screen.getByRole('tab', { name: en.home.howTabTravellers }).getAttribute('aria-selected')).toBe('true')
  })
})
