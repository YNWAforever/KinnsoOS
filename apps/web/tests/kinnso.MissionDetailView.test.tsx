// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { refreshMock } = vi.hoisted(() => ({
  refreshMock: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshMock }),
}))

import { MissionDetailView } from '@/components/kinnso/pages/MissionDetailView'
import en from '@/lib/i18n/messages/en'

afterEach(() => {
  cleanup()
  refreshMock.mockReset()
})

describe('MissionDetailView', () => {
  const mission = {
    id: 'm1',
    title: 'Hybrid mission',
    participants: [{ id: 'p1', creatorName: 'Creator One', status: 'applied' }],
    submissions: [],
  }

  it('lets merchant approve an applicant', () => {
    const onReviewParticipant = vi.fn()
    render(<MissionDetailView locale="en" t={en.missions} mission={mission} onReviewParticipant={onReviewParticipant} onReviewSubmission={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: en.missions.approve }))
    expect(onReviewParticipant).toHaveBeenCalledWith('p1', 'approve')
  })

  it('shows review errors returned by the server', async () => {
    const onReviewParticipant = vi.fn(async () => ({
      ok: false,
      errors: { form: ['Merchant access is required'] },
    }))
    render(<MissionDetailView locale="en" t={en.missions} mission={mission} onReviewParticipant={onReviewParticipant} onReviewSubmission={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: en.missions.approve }))

    expect((await screen.findByRole('alert')).textContent).toContain('Merchant access is required')
  })

  it('disables review buttons while pending and refreshes after success', async () => {
    let resolveReview!: (result: { ok: true }) => void
    const onReviewParticipant = vi.fn(() => new Promise<{ ok: true }>((resolve) => {
      resolveReview = resolve
    }))
    render(<MissionDetailView locale="en" t={en.missions} mission={mission} onReviewParticipant={onReviewParticipant} onReviewSubmission={vi.fn()} />)

    const button = screen.getByRole('button', { name: en.missions.approve })
    fireEvent.click(button)

    expect(button).toHaveProperty('disabled', true)
    resolveReview({ ok: true })
    await waitFor(() => expect(refreshMock).toHaveBeenCalledTimes(1))
  })

  it('links back to the mission queue', () => {
    render(<MissionDetailView locale="en" t={en.missions} mission={mission} onReviewParticipant={vi.fn()} onReviewSubmission={vi.fn()} />)
    expect(screen.getByRole('link', { name: en.missions.backToQueue }).getAttribute('href')).toBe('/en/merchants/dashboard/missions')
  })

  it('links a participant name to the public profile when a handle exists', () => {
    const mission = {
      id: 'm1',
      title: 'Hybrid mission',
      participants: [
        { id: 'p1', creatorName: 'Maya Wanders', creatorHandle: 'maya', status: 'active' },
        { id: 'p2', creatorName: 'Creator', creatorHandle: null, status: 'applied' },
      ],
      submissions: [],
    }
    render(<MissionDetailView locale="en" t={en.missions} mission={mission} onReviewParticipant={vi.fn()} onReviewSubmission={vi.fn()} />)
    expect(screen.getByRole('link', { name: 'Maya Wanders' }).getAttribute('href')).toBe('/en/c/maya')
    expect(screen.queryByRole('link', { name: 'Creator' })).toBeNull()
    expect(screen.getByText('Creator')).toBeTruthy()
  })
})
