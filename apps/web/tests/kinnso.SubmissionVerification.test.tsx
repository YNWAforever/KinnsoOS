// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const removeChannelMock = vi.fn()

// Track channels created per call so we can assert the first channel is removed on retry.
const channelObjects: Array<{ id: string }> = []

const { fromMock, retryMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  retryMock: vi.fn(),
}))

vi.mock('@/lib/supabase/client', () => ({
  createSupabaseBrowserClient: () => ({
    channel: (name: string) => {
      const obj = { id: name }
      channelObjects.push(obj)
      return { on: () => ({ subscribe: () => obj }) }
    },
    removeChannel: (ch: { id: string }) => { removeChannelMock(ch) },
    from: fromMock,
  }),
}))
vi.mock('@/lib/missions/verify-client', () => ({
  startVerification: vi.fn(),
  retryVerification: retryMock,
}))

import { SubmissionVerification } from '@/components/kinnso/SubmissionVerification'
import en from '@/lib/i18n/messages/en'

afterEach(() => { cleanup(); vi.clearAllMocks(); channelObjects.length = 0 })

const jobSelect = (row: unknown) => ({
  select: () => ({ eq: () => ({ single: async () => ({ data: row }) }) }),
})

describe('SubmissionVerification', () => {
  it('shows the verifying state for a queued job', async () => {
    fromMock.mockReturnValue(jobSelect({ id: 'job-1', status: 'queued', confidence_status: null, error: null }))
    render(<SubmissionVerification jobId="job-1" t={en.missionDetail} />)
    await waitFor(() => expect(screen.getByText(en.missionDetail.verifying)).toBeTruthy())
  })

  it('shows the verified signal when ready + verified_signal', async () => {
    fromMock.mockReturnValue(jobSelect({ id: 'job-1', status: 'ready', confidence_status: 'verified_signal', error: null }))
    render(<SubmissionVerification jobId="job-1" t={en.missionDetail} />)
    await waitFor(() => expect(screen.getByText(en.missionDetail.verifiedSignal)).toBeTruthy())
  })

  it('shows the failure + retry on a failed job', async () => {
    fromMock.mockReturnValue(jobSelect({ id: 'job-1', status: 'failed', confidence_status: null, error: 'boom' }))
    render(<SubmissionVerification jobId="job-1" t={en.missionDetail} />)
    await waitFor(() => expect(screen.getByRole('button', { name: en.missionDetail.retry })).toBeTruthy())
  })

  it('tears down the prior channel subscription when Retry is clicked', async () => {
    // First render: job-1 fails
    fromMock.mockImplementation((table: string) => {
      if (table === 'mission_verification_jobs') {
        return jobSelect({ id: 'job-1', status: 'failed', confidence_status: null, error: 'boom' })
      }
      return jobSelect(null)
    })

    render(<SubmissionVerification jobId="job-1" t={en.missionDetail} />)

    // Wait for the Retry button to appear (job-1 failed)
    const retryBtn = await screen.findByRole('button', { name: en.missionDetail.retry })

    // retryVerification returns a new job id
    retryMock.mockResolvedValueOnce('job-2')

    // After retry, return a queued job for job-2
    fromMock.mockImplementation((table: string) => {
      if (table === 'mission_verification_jobs') {
        return jobSelect({ id: 'job-2', status: 'queued', confidence_status: null, error: null })
      }
      return jobSelect(null)
    })

    fireEvent.click(retryBtn)

    // The old channel (for job-1) must have been torn down via removeChannel
    await waitFor(() => {
      expect(removeChannelMock).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'verify-job-job-1' }),
      )
    })

    // retryVerification must have been called with the original job id
    expect(retryMock).toHaveBeenCalledWith('job-1')
  })
})
