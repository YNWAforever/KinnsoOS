// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'

// ---- Mock the browser Supabase client BEFORE importing the component ----
const upsert = vi.fn().mockResolvedValue({ error: null })
const del = vi.fn().mockReturnValue({ in: vi.fn().mockResolvedValue({ error: null }) })
const from = vi.fn().mockReturnValue({ upsert, delete: del })
vi.mock('@/lib/supabase/client', () => ({
  createSupabaseBrowserClient: () => ({ from }),
}))

afterEach(cleanup)

import { HandlesStep } from '@/components/onboarding/HandlesStep'
import en from '@/lib/i18n/messages/en'

const dict = en.onboarding.handlesStep

function renderStep(onRun = vi.fn()) {
  return render(
    <HandlesStep creatorId="creator-1" initialHandles={[]} t={dict} onRun={onRun} />,
  )
}

describe('HandlesStep', () => {
  beforeEach(() => {
    upsert.mockClear()
    from.mockClear()
  })

  it('disables Run with no valid handle', () => {
    renderStep()
    expect(screen.getByRole('button', { name: dict.run })).toBeDisabled()
  })

  it('enables Run after entering a valid handle', () => {
    renderStep()
    fireEvent.change(screen.getAllByPlaceholderText(dict.placeholder)[0], {
      target: { value: 'travel.hk' },
    })
    expect(screen.getByRole('button', { name: dict.run })).not.toBeDisabled()
  })

  it('shows a format error and keeps Run disabled for an invalid handle', () => {
    renderStep()
    fireEvent.change(screen.getAllByPlaceholderText(dict.placeholder)[0], {
      target: { value: 'bad handle!' },
    })
    expect(screen.getByText(dict.errorFormat)).toBeTruthy()
    expect(screen.getByRole('button', { name: dict.run })).toBeDisabled()
  })

  it('upserts handles and calls onRun', async () => {
    const onRun = vi.fn()
    renderStep(onRun)
    fireEvent.change(screen.getAllByPlaceholderText(dict.placeholder)[0], {
      target: { value: '@TravelHK' },
    })
    fireEvent.click(screen.getByRole('button', { name: dict.run }))
    await waitFor(() => expect(onRun).toHaveBeenCalledTimes(1))
    expect(from).toHaveBeenCalledWith('creator_social_handles')
    expect(upsert).toHaveBeenCalledWith(
      [
        {
          creator_id: 'creator-1',
          platform: 'instagram',
          handle: 'TravelHK',
          url: 'https://www.instagram.com/TravelHK/',
        },
      ],
      { onConflict: 'creator_id,platform' },
    )
  })

  it('runs on Enter in the handle field (no dead "type then nothing" state)', async () => {
    const onRun = vi.fn()
    renderStep(onRun)
    const input = screen.getAllByPlaceholderText(dict.placeholder)[0]
    fireEvent.change(input, { target: { value: 'travel.with.pang' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => expect(onRun).toHaveBeenCalledTimes(1))
    expect(upsert).toHaveBeenCalledWith(
      [
        {
          creator_id: 'creator-1',
          platform: 'instagram',
          handle: 'travel.with.pang',
          url: 'https://www.instagram.com/travel.with.pang/',
        },
      ],
      { onConflict: 'creator_id,platform' },
    )
  })

  it('does NOT run on Enter when the handle is invalid', () => {
    const onRun = vi.fn()
    renderStep(onRun)
    const input = screen.getAllByPlaceholderText(dict.placeholder)[0]
    fireEvent.change(input, { target: { value: 'bad handle!' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onRun).not.toHaveBeenCalled()
    expect(upsert).not.toHaveBeenCalled()
  })

  it('flags a duplicate platform and keeps Run disabled', () => {
    renderStep()
    fireEvent.change(screen.getAllByPlaceholderText(dict.placeholder)[0], {
      target: { value: 'a' },
    })
    fireEvent.click(screen.getByRole('button', { name: dict.add }))
    const inputs = screen.getAllByPlaceholderText(dict.placeholder)
    // second row default platform is also instagram -> duplicate
    fireEvent.change(inputs[1], { target: { value: 'b' } })
    expect(screen.getByText(dict.errorDuplicate)).toBeTruthy()
    expect(screen.getByRole('button', { name: dict.run })).toBeDisabled()
  })
})
