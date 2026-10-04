// @vitest-environment jsdom
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import en from '@/lib/i18n/messages/en'
import { CreatorsDirectoryView } from '@/components/kinnso/admin/creators/CreatorsDirectoryView'
import type { CreatorsDirectory } from '@/lib/admin/creators-queries'

const { pushMock, refreshMock, spHolder } = vi.hoisted(() => ({
  pushMock: vi.fn(), refreshMock: vi.fn(), spHolder: { value: '' },
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, refresh: refreshMock }),
  usePathname: () => '/en/admin/creators/directory',
  useSearchParams: () => new URLSearchParams(spHolder.value),
}))

afterEach(cleanup)
beforeEach(() => { pushMock.mockReset(); refreshMock.mockReset(); spHolder.value = '' })

const data: CreatorsDirectory = {
  rows: [
    { id: 'c1', displayName: 'Mia', handle: 'mia', status: 'active', verified: true, tier: 'pro', dnaStatus: 'published', contributionPoints: 320, createdAt: '2026-06-28T10:00:00Z' },
    { id: 'c2', displayName: null, handle: 'lee', status: 'banned', verified: false, tier: null, dnaStatus: null, contributionPoints: 0, createdAt: '2026-06-27T10:00:00Z' },
  ],
  nextCursor: null,
}

const actions = {
  setCreatorStatus: vi.fn(async () => ({ ok: true as const, id: 'c1', status: 'suspended' as const })),
  reinstateCreator: vi.fn(async () => ({ ok: true as const, id: 'c2', status: 'active' as const })),
  setCreatorVerified: vi.fn(async () => ({ ok: true as const, id: 'c1', verified: false })),
  addCreatorNote: vi.fn(async () => ({ ok: true as const, id: 'c1' })),
  bulkSetCreatorStatus: vi.fn(async (): Promise<{ ok: true; count: number } | { ok: false; errors: Record<string, string[]> }> => ({ ok: true, count: 1 })),
}

function renderView() {
  return render(<CreatorsDirectoryView t={en.creators} locale="en" data={data} actions={actions} />)
}

describe('CreatorsDirectoryView', () => {
  it('renders a row per creator with name/handle and status', () => {
    renderView()
    expect(screen.getByText('Mia')).toBeTruthy()
    expect(screen.getByText('lee')).toBeTruthy()
    expect(screen.getByText(en.creators.statusBanned)).toBeTruthy()
  })
  it('links each creator name to its 360 detail page', () => {
    renderView()
    const link = screen.getByRole('link', { name: 'Mia' })
    expect(link.getAttribute('href')).toBe('/en/admin/creators/c1')
  })
  it('shows Suspend for an active creator and requires a reason before calling the action', async () => {
    renderView()
    fireEvent.click(screen.getByRole('button', { name: `${en.creators.actSuspend} Mia` }))
    // reason input appears; Apply is disabled until a reason is entered
    const reason = screen.getByPlaceholderText(en.creators.reasonPlaceholder)
    fireEvent.change(reason, { target: { value: 'spam' } })
    fireEvent.click(screen.getByRole('button', { name: en.creators.actApply }))
    await waitFor(() => expect(actions.setCreatorStatus).toHaveBeenCalledWith('en', 'c1', 'suspended', 'spam'))
  })
  it('shows Reinstate (not Activate) for a banned creator', () => {
    renderView()
    expect(screen.getByRole('button', { name: `${en.creators.actReinstate} lee` })).toBeTruthy()
    expect(screen.queryByRole('button', { name: `${en.creators.actActivate} lee` })).toBeNull()
  })
  it('updates the URL query when searching', () => {
    renderView()
    fireEvent.change(screen.getByPlaceholderText(en.creators.dirSearch), { target: { value: 'mi' } })
    fireEvent.submit(screen.getByTestId('directory-search-form'))
    expect(pushMock).toHaveBeenCalled()
    expect(String(pushMock.mock.calls[0][0])).toContain('q=mi')
  })
  it('applies a bulk status to checked rows', async () => {
    renderView()
    fireEvent.click(screen.getByLabelText('Select Mia'))
    fireEvent.change(screen.getByTestId('bulk-action-select'), { target: { value: 'suspended' } })
    fireEvent.change(screen.getByTestId('bulk-reason'), { target: { value: 'cleanup' } })
    fireEvent.click(screen.getByRole('button', { name: en.creators.bulkApply }))
    await waitFor(() => expect(actions.bulkSetCreatorStatus).toHaveBeenCalledWith('en', ['c1'], 'suspended', 'cleanup'))
  })
  it('surfaces a bulk action failure instead of swallowing it', async () => {
    actions.bulkSetCreatorStatus.mockResolvedValueOnce({ ok: false, errors: { form: ['Select between 1 and 100 creators.'] } })
    renderView()
    fireEvent.click(screen.getByLabelText('Select Mia'))
    fireEvent.change(screen.getByTestId('bulk-action-select'), { target: { value: 'banned' } })
    fireEvent.change(screen.getByTestId('bulk-reason'), { target: { value: 'cleanup' } })
    fireEvent.click(screen.getByRole('button', { name: en.creators.bulkApply }))
    expect(await screen.findByText('Select between 1 and 100 creators.')).toBeTruthy()
    expect(refreshMock).not.toHaveBeenCalled()
  })
  it('resets the keyset cursor to page 1 when a filter changes', () => {
    spHolder.value = 'cursor_at=2026-06-27T10:00:00Z&cursor_id=c2'
    renderView()
    fireEvent.change(screen.getByLabelText(en.creators.dirStatus), { target: { value: 'active' } })
    expect(pushMock).toHaveBeenCalled()
    const url = String(pushMock.mock.calls[0][0])
    expect(url).toContain('status=active')
    expect(url).not.toContain('cursor_at')
    expect(url).not.toContain('cursor_id')
  })
})
