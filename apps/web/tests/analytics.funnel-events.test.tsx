// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

const {
  createCheckoutSessionActionMock,
  joinFeatureInterestActionMock,
  pushMock,
  refreshMock,
  signUpMock,
  trackTravellerEventMock,
  hasAnalyticsConsentMock,
  subscribeToAnalyticsConsentMock,
  setConsentMock,
  resetConsentMock,
} = vi.hoisted(() => ({
  ...(() => {
    let consented = true
    const subscribers = new Set<() => void>()
    return {
      hasAnalyticsConsentMock: vi.fn(() => consented),
      subscribeToAnalyticsConsentMock: vi.fn((callback: () => void) => {
        subscribers.add(callback)
        return () => subscribers.delete(callback)
      }),
      setConsentMock: vi.fn((value: boolean) => {
        consented = value
        subscribers.forEach((callback) => callback())
      }),
      resetConsentMock: () => {
        consented = true
        subscribers.clear()
      },
    }
  })(),
  createCheckoutSessionActionMock: vi.fn(),
  joinFeatureInterestActionMock: vi.fn(),
  pushMock: vi.fn(),
  refreshMock: vi.fn(),
  signUpMock: vi.fn(),
  trackTravellerEventMock: vi.fn(),
}))

vi.mock('@ai-sdk/react', () => ({
  useChat: () => ({ messages: [], sendMessage: vi.fn(), status: 'ready', clearError: vi.fn() }),
}))
vi.mock('ai', () => ({ DefaultChatTransport: class {} }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, refresh: refreshMock }),
}))
vi.mock('@/lib/analytics/client', () => ({
  trackTravellerEvent: trackTravellerEventMock,
  hasAnalyticsConsent: hasAnalyticsConsentMock,
  subscribeToAnalyticsConsent: subscribeToAnalyticsConsentMock,
}))
vi.mock('@/lib/experiences/booking-actions', () => ({
  createCheckoutSessionAction: createCheckoutSessionActionMock,
}))
vi.mock('@/lib/feature-interest/actions', () => ({
  joinFeatureInterestAction: joinFeatureInterestActionMock,
}))
vi.mock('@/lib/supabase/client', () => ({
  createSupabaseBrowserClient: () => ({ auth: { signUp: signUpMock } }),
}))

import { AgentChatView } from '@/components/kinnso/pages/AgentChatView'
import { AgentWaitlistView } from '@/components/kinnso/pages/AgentWaitlistView'
import { BookingWidget } from '@/components/kinnso/pages/BookingWidget'
import { FeatureInterestForm } from '@/components/kinnso/FeatureInterestForm'
import { SignUpForm } from '@/app/[locale]/sign-up/SignUpForm'
import en from '@/lib/i18n/messages/en'

const experience = {
  id: 'experience-123', slug: 'tokyo-crawl', title: 'Tokyo After-Hours Izakaya Crawl', summary: null,
  description: null, city: 'Tokyo', priceAmount: 1200, currency: 'HKD', durationMinutes: 180,
  coverUrl: null, publishedAt: null, savesCount: 0, merchant: { slug: 'sunrise-stays', companyName: 'Sunrise Stays HK' },
}

const featureInterestT = {
  emailLabel: 'Email address',
  emailPlaceholder: 'you@example.com',
  submitAgent: 'Join the Agent waitlist',
  submitBooking: 'Get notified when booking opens',
  pending: 'Joining…',
  success: "You're on the list.",
  invalidEmail: 'Enter a valid email address.',
  retry: 'Could not save your interest. Please try again.',
}

const signUpProps = {
  locale: 'en' as const,
  labels: { email: 'Sign-up email', password: 'Sign-up password', submit: 'Sign up' },
  errorEmailTaken: 'That email is already registered.',
  errorInvalidEmail: 'Enter a valid email address.',
  errorRateLimited: 'Too many sign-up attempts. Please wait a minute and try again.',
  errorGeneric: 'Something went wrong.',
}

function submitFeatureInterest() {
  fireEvent.change(screen.getByLabelText(featureInterestT.emailLabel), { target: { value: 'traveller@example.com' } })
  fireEvent.submit(screen.getByRole('form'))
}

function submitSignUp() {
  fireEvent.change(screen.getByLabelText(signUpProps.labels.email), { target: { value: 'traveller@example.com' } })
  fireEvent.change(screen.getByLabelText(signUpProps.labels.password), { target: { value: 'hunter2pass' } })
  fireEvent.submit(screen.getByRole('form'))
}

beforeEach(() => {
  createCheckoutSessionActionMock.mockReset()
  joinFeatureInterestActionMock.mockReset()
  pushMock.mockReset()
  refreshMock.mockReset()
  signUpMock.mockReset()
  trackTravellerEventMock.mockReset()
  subscribeToAnalyticsConsentMock.mockClear()
  setConsentMock.mockClear()
  resetConsentMock()
})

afterEach(cleanup)

describe('traveller funnel analytics', () => {
  it('records agent entry once for each public Agent surface', () => {
    render(
      <>
        <AgentChatView locale="en" t={en.agent} configured bookingLive anonSessionId="anon-1" viewerSignedIn={false} />
        <AgentWaitlistView locale="en" t={en.agent} featureInterest={featureInterestT} />
      </>,
    )

    expect(trackTravellerEventMock).toHaveBeenCalledTimes(2)
    expect(trackTravellerEventMock).toHaveBeenNthCalledWith(1, 'agent_started', { locale: 'en', routeKey: 'agent' })
    expect(trackTravellerEventMock).toHaveBeenNthCalledWith(2, 'agent_started', { locale: 'en', routeKey: 'agent' })
  })

  it('records an Agent entry when consent is granted after mount', async () => {
    setConsentMock(false)
    render(<AgentChatView locale="en" t={en.agent} configured bookingLive anonSessionId="anon-1" viewerSignedIn={false} />)

    expect(trackTravellerEventMock).not.toHaveBeenCalled()
    setConsentMock(true)

    await waitFor(() => {
      expect(trackTravellerEventMock).toHaveBeenCalledOnce()
    })
    expect(trackTravellerEventMock).toHaveBeenCalledWith('agent_started', { locale: 'en', routeKey: 'agent' })
  })

  it('records booking-on CTA and checkout only after a successful checkout action', async () => {
    createCheckoutSessionActionMock.mockResolvedValue({ ok: true, checkoutUrl: '#checkout' })
    render(
      <BookingWidget
        locale="en"
        t={en.booking}
        experience={experience}
        availability={[{ id: 'availability-1', date: '2026-08-01', remaining: 4 }]}
        viewerEmail="traveller@example.com"
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: en.booking.submitCta }))

    await waitFor(() => {
      expect(trackTravellerEventMock).toHaveBeenCalledWith('checkout_started', {
        locale: 'en',
        routeKey: 'experience_detail',
        entityType: 'experience',
        entityId: 'experience-123',
        bookingState: 'on',
        outcome: 'created',
      })
    })
    expect(trackTravellerEventMock).toHaveBeenNthCalledWith(1, 'booking_cta_clicked', {
      locale: 'en',
      routeKey: 'experience_detail',
      entityType: 'experience',
      entityId: 'experience-123',
      bookingState: 'on',
    })
  })

  it('records a constrained checkout error when the booking-on action fails', async () => {
    createCheckoutSessionActionMock.mockResolvedValue({ ok: false, errors: { form: ['Unavailable'] } })
    render(
      <BookingWidget
        locale="en"
        t={en.booking}
        experience={experience}
        availability={[{ id: 'availability-1', date: '2026-08-01', remaining: 4 }]}
        viewerEmail="traveller@example.com"
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: en.booking.submitCta }))

    expect(await screen.findByText('Unavailable')).toBeInTheDocument()
    expect(trackTravellerEventMock).toHaveBeenCalledWith('booking_cta_clicked', expect.objectContaining({ bookingState: 'on' }))
    expect(trackTravellerEventMock).toHaveBeenCalledWith('checkout_started', expect.objectContaining({
      bookingState: 'on',
      outcome: 'error',
      errorCategory: 'unavailable',
    }))
  })

  it('records booking-off CTA and successful waitlist submission without form data', async () => {
    joinFeatureInterestActionMock.mockResolvedValue({ ok: true })
    render(
      <FeatureInterestForm
        feature="booking"
        locale="en"
        t={featureInterestT}
        analyticsEntityType="experience"
        analyticsEntityId="experience-123"
      />,
    )

    submitFeatureInterest()

    await waitFor(() => {
      expect(trackTravellerEventMock).toHaveBeenCalledWith('waitlist_submitted', {
        locale: 'en',
        routeKey: 'experience_detail',
        entityType: 'experience',
        entityId: 'experience-123',
        bookingState: 'off',
        outcome: 'submitted',
      })
    })
    expect(trackTravellerEventMock).toHaveBeenNthCalledWith(1, 'booking_cta_clicked', {
      locale: 'en',
      routeKey: 'experience_detail',
      entityType: 'experience',
      entityId: 'experience-123',
      bookingState: 'off',
    })
    expect(JSON.stringify(trackTravellerEventMock.mock.calls)).not.toContain('traveller@example.com')
  })

  it('records a constrained booking-off waitlist error when the action fails', async () => {
    joinFeatureInterestActionMock.mockResolvedValue({ ok: false, code: 'retry' })
    render(
      <FeatureInterestForm
        feature="booking"
        locale="en"
        t={featureInterestT}
        analyticsEntityType="experience"
        analyticsEntityId="experience-123"
      />,
    )

    submitFeatureInterest()

    expect(await screen.findByText(featureInterestT.retry)).toBeInTheDocument()
    expect(trackTravellerEventMock).toHaveBeenCalledWith('booking_cta_clicked', expect.objectContaining({ bookingState: 'off' }))
    expect(trackTravellerEventMock).toHaveBeenCalledWith('waitlist_submitted', expect.objectContaining({
      bookingState: 'off',
      outcome: 'error',
      errorCategory: 'unavailable',
    }))
  })

  it('records sign-up start before auth and completion after a successful response without credentials', async () => {
    signUpMock.mockResolvedValue({ data: { user: { identities: [{ id: 'identity-1' }] }, session: null }, error: null })
    render(<SignUpForm {...signUpProps} />)

    submitSignUp()

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/en/sign-up?sent=1'))
    expect(trackTravellerEventMock).toHaveBeenNthCalledWith(1, 'signup_started', { locale: 'en', routeKey: 'sign_up' })
    expect(trackTravellerEventMock).toHaveBeenNthCalledWith(2, 'signup_completed', {
      locale: 'en',
      routeKey: 'sign_up',
      outcome: 'success',
    })
    expect(JSON.stringify(trackTravellerEventMock.mock.calls)).not.toContain('traveller@example.com')
    expect(JSON.stringify(trackTravellerEventMock.mock.calls)).not.toContain('hunter2pass')
  })
})
