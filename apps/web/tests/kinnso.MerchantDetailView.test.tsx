// @vitest-environment jsdom
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import en from '@/lib/i18n/messages/en'
import { MerchantDetailView } from '@/components/kinnso/admin/merchants/MerchantDetailView'
import type { MerchantDetail } from '@/lib/admin/merchants-queries'
import type { AuditEntry } from '@/lib/admin/audit'

const { refreshMock } = vi.hoisted(() => ({ refreshMock: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: refreshMock, push: vi.fn() }) }))
afterEach(cleanup)
beforeEach(() => refreshMock.mockReset())

const detail: MerchantDetail = {
  profile: { id: 'm1', companyName: 'Acme Co', contactName: 'Pat', contactEmail: 'pat@acme.test', websiteUrl: null, status: 'active', tier: 'free', createdAt: '2026-06-01T00:00:00Z', updatedAt: '2026-06-20T00:00:00Z' },
  missions: [{ id: 'mi1', title: 'Tokyo eats', status: 'live', visibility: 'public', participantsCount: 4, milestonesTotal: 3, milestonesApproved: 1, createdAt: '2026-06-02T00:00:00Z' }],
  creators: { engaged: [], savedCount: 0 },
  billing: { settlements: [], owed: [], settled: [] },
}
const audit: AuditEntry[] = [{ id: 'a1', entityType: 'merchant', entityId: 'm1', action: 'status.paused', reason: 'review', metadata: {}, createdAt: '2026-06-10T00:00:00Z' }]

function makeActions() {
  return {
    setMerchantStatus: vi.fn(async () => ({ ok: true as const, id: 'm1', status: 'suspended' as const })),
    setMerchantTier: vi.fn(async () => ({ ok: true as const, id: 'm1', tier: 'growth' as const })),
    addMerchantNote: vi.fn(async () => ({ ok: true as const, id: 'm1' })),
  }
}

function renderView(actions = makeActions()) {
  render(<MerchantDetailView t={en.merchantsOps} locale="en" detail={detail} audit={audit} actions={actions} budget={null} budgetActions={{ credit: vi.fn(), enforce: vi.fn() }} />)
  return actions
}

describe('MerchantDetailView', () => {
  it('renders the header with company name, status and tier', () => {
    renderView()
    expect(screen.getByRole('heading', { name: 'Acme Co' })).toBeTruthy()
    expect(screen.getAllByText(en.merchantsOps.statusActive).length).toBeGreaterThan(0)
  })
  it('switches to the Missions tab and shows a mission', () => {
    renderView()
    fireEvent.click(screen.getByRole('button', { name: en.merchantsOps.tabMissions }))
    expect(screen.getByText('Tokyo eats')).toBeTruthy()
  })
  it('sets a status with a reason via the header action', async () => {
    const actions = renderView()
    fireEvent.click(screen.getByRole('button', { name: en.merchantsOps.actSetStatus }))
    fireEvent.change(screen.getByDisplayValue(en.merchantsOps.statusActive), { target: { value: 'suspended' } })
    fireEvent.change(screen.getByPlaceholderText(en.merchantsOps.reasonPlaceholder), { target: { value: 'fraud' } })
    fireEvent.click(screen.getByRole('button', { name: en.merchantsOps.actApply }))
    await waitFor(() => expect(actions.setMerchantStatus).toHaveBeenCalledWith('en', 'm1', 'suspended', 'fraud'))
    await waitFor(() => expect(refreshMock).toHaveBeenCalled())
  })
  it('adds a note from the Moderation tab', async () => {
    const actions = renderView()
    fireEvent.click(screen.getByRole('button', { name: en.merchantsOps.tabModeration }))
    fireEvent.change(screen.getByPlaceholderText(en.merchantsOps.notePlaceholder), { target: { value: 'called them' } })
    fireEvent.click(screen.getByRole('button', { name: en.merchantsOps.saveNote }))
    await waitFor(() => expect(actions.addMerchantNote).toHaveBeenCalledWith('en', 'm1', 'called them'))
  })
  it('surfaces an action failure instead of refreshing', async () => {
    const actions = makeActions()
    actions.setMerchantTier.mockResolvedValueOnce({ ok: false, errors: { form: ['Active ops access is required.'] } } as never)
    renderView(actions)
    fireEvent.click(screen.getByRole('button', { name: en.merchantsOps.actSetTier }))
    fireEvent.change(screen.getByPlaceholderText(en.merchantsOps.reasonPlaceholder), { target: { value: 'upgrade' } })
    fireEvent.click(screen.getByRole('button', { name: en.merchantsOps.actApply }))
    expect(await screen.findByText('Active ops access is required.')).toBeTruthy()
    expect(refreshMock).not.toHaveBeenCalled()
  })
})
