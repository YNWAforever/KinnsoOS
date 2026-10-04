// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import en from '@/lib/i18n/messages/en'

const { upsertMock, refreshMock } = vi.hoisted(() => ({
  upsertMock: vi.fn(async () => ({ error: null })),
  refreshMock: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshMock }),
}))

vi.mock('@/lib/supabase/client', () => ({
  createSupabaseBrowserClient: () => ({
    from: () => ({ upsert: upsertMock }),
  }),
}))

import { AddHandleDialog } from '@/components/kinnso/AddHandleDialog'

afterEach(cleanup)
beforeEach(() => {
  upsertMock.mockClear()
  upsertMock.mockResolvedValue({ error: null })
  refreshMock.mockClear()
})

describe('AddHandleDialog', () => {
  it('opens to the first missing platform and rejects an invalid handle without calling supabase', async () => {
    render(<AddHandleDialog creatorId="creator-1" missing={['youtube', 'threads']} t={en.studioDashboard} />)
    fireEvent.click(screen.getByRole('button', { name: en.studioDashboard.itemConnectCta }))
    const input = screen.getByPlaceholderText(en.studioDashboard.addHandlePlaceholder)
    fireEvent.change(input, { target: { value: 'bad handle!' } })
    fireEvent.click(screen.getByRole('button', { name: en.studioDashboard.addHandleSave }))
    expect(await screen.findByText(en.studioDashboard.addHandleErrorFormat)).toBeTruthy()
    expect(upsertMock).not.toHaveBeenCalled()
  })

  it('upserts a valid handle, shows the saved note and refreshes', async () => {
    render(<AddHandleDialog creatorId="creator-1" missing={['youtube']} t={en.studioDashboard} />)
    fireEvent.click(screen.getByRole('button', { name: en.studioDashboard.itemConnectCta }))
    fireEvent.change(screen.getByPlaceholderText(en.studioDashboard.addHandlePlaceholder), { target: { value: 'mychannel' } })
    fireEvent.click(screen.getByRole('button', { name: en.studioDashboard.addHandleSave }))
    await waitFor(() => expect(upsertMock).toHaveBeenCalledTimes(1))
    expect(upsertMock).toHaveBeenCalledWith(
      [{ creator_id: 'creator-1', platform: 'youtube', handle: 'mychannel', url: 'https://www.youtube.com/@mychannel' }],
      { onConflict: 'creator_id,platform' },
    )
    expect(await screen.findByText(en.studioDashboard.addHandleSaved)).toBeTruthy()
    expect(refreshMock).toHaveBeenCalled()
  })
})
