// @vitest-environment jsdom
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import en from '@/lib/i18n/messages/en'
import { CreatorDetailView } from '@/components/kinnso/admin/creators/CreatorDetailView'
import type { CreatorDetail } from '@/lib/admin/creators-queries'
import type { AuditEntry } from '@/lib/admin/audit'

const { refreshMock } = vi.hoisted(() => ({ refreshMock: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: refreshMock, push: vi.fn() }) }))
afterEach(cleanup)
beforeEach(() => refreshMock.mockReset())

const detail: CreatorDetail = {
  creator: { id: 'c1', displayName: 'Mia', handle: 'mia', status: 'active', verified: false, isListed: false, bio: 'Hi', createdAt: '2026-06-01T00:00:00Z', updatedAt: '2026-06-20T00:00:00Z' },
  contribution: { points: 320, tier: 'pro', tierUpdatedAt: null },
  dna: null, scan: null, socials: [],
  missions: [{ participantId: 'p1', missionId: 'm1', title: 'Tokyo eats', status: 'active', source: 'applied', approvedAt: null, createdAt: '2026-06-02T00:00:00Z', submissionsTotal: 3, submissionsApproved: 1, submissionsPending: 2 }],
  settlements: [], pointsEvents: [],
  content: [{ id: 'g1', title: 'Best ramen', slug: 'best-ramen', status: 'published', savesCount: 12, publishedAt: null, createdAt: '2026-06-06T00:00:00Z' }],
}
const audit: AuditEntry[] = [{ id: 'a1', entityType: 'creator', entityId: 'c1', action: 'status.suspend', reason: 'spam', metadata: {}, createdAt: '2026-06-10T00:00:00Z' }]

function makeActions() {
  return {
    setCreatorStatus: vi.fn(async () => ({ ok: true as const, id: 'c1', status: 'suspended' as const })),
    reinstateCreator: vi.fn(async () => ({ ok: true as const, id: 'c1', status: 'active' as const })),
    setCreatorVerified: vi.fn(async (): Promise<{ ok: true; id: string; verified: boolean } | { ok: false; errors: Record<string, string[]> }> => ({ ok: true, id: 'c1', verified: true })),
    setCreatorListed: vi.fn(async () => ({ ok: true as const, id: 'c1', isListed: true })),
    addCreatorNote: vi.fn(async () => ({ ok: true as const, id: 'c1' })),
  }
}

function renderView(actions = makeActions()) {
  render(<CreatorDetailView t={en.creators} locale="en" detail={detail} audit={audit} actions={actions} />)
  return actions
}

describe('CreatorDetailView', () => {
  it('renders the header with name, handle and tier/status', () => {
    renderView()
    expect(screen.getByRole('heading', { name: 'Mia' })).toBeTruthy()
    expect(screen.getByText('@mia')).toBeTruthy()
    expect(screen.getByText(en.creators.statusActive)).toBeTruthy()
  })
  it('switches to the Missions tab and shows a mission', () => {
    renderView()
    fireEvent.click(screen.getByRole('button', { name: en.creators.tabMissions }))
    expect(screen.getByText('Tokyo eats')).toBeTruthy()
  })
  it('suspends with a reason via the header action', async () => {
    const actions = renderView()
    fireEvent.click(screen.getByRole('button', { name: en.creators.actSuspend }))
    fireEvent.change(screen.getByPlaceholderText(en.creators.reasonPlaceholder), { target: { value: 'spam' } })
    fireEvent.click(screen.getByRole('button', { name: en.creators.actApply }))
    await waitFor(() => expect(actions.setCreatorStatus).toHaveBeenCalledWith('en', 'c1', 'suspended', 'spam'))
    await waitFor(() => expect(refreshMock).toHaveBeenCalled())
  })
  it('adds a note from the Moderation tab', async () => {
    const actions = renderView()
    fireEvent.click(screen.getByRole('button', { name: en.creators.tabModeration }))
    fireEvent.change(screen.getByPlaceholderText(en.creators.notePlaceholder), { target: { value: 'looks fine' } })
    fireEvent.click(screen.getByRole('button', { name: en.creators.saveNote }))
    await waitFor(() => expect(actions.addCreatorNote).toHaveBeenCalledWith('en', 'c1', 'looks fine'))
  })
  it('lists a guide-less creator from the Moderation tab with a reason', async () => {
    const actions = renderView()
    fireEvent.click(screen.getByRole('button', { name: en.creators.tabModeration }))
    expect(screen.getByText(en.creators.listingGuideBased)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: en.creators.actListCreator }))
    fireEvent.change(screen.getByPlaceholderText(en.creators.reasonPlaceholder), { target: { value: 'Launch cohort' } })
    fireEvent.click(screen.getByRole('button', { name: en.creators.actApply }))
    await waitFor(() => expect(actions.setCreatorListed).toHaveBeenCalledWith('en', 'c1', true, 'Launch cohort'))
    await waitFor(() => expect(refreshMock).toHaveBeenCalled())
  })

  it('surfaces an action failure instead of refreshing', async () => {
    const actions = makeActions()
    actions.setCreatorVerified.mockResolvedValueOnce({ ok: false, errors: { form: ['Active ops access is required.'] } })
    renderView(actions)
    fireEvent.click(screen.getByRole('button', { name: en.creators.actVerify }))
    fireEvent.change(screen.getByPlaceholderText(en.creators.reasonPlaceholder), { target: { value: 'trust' } })
    fireEvent.click(screen.getByRole('button', { name: en.creators.actApply }))
    expect(await screen.findByText('Active ops access is required.')).toBeTruthy()
    expect(refreshMock).not.toHaveBeenCalled()
  })
})
