// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { refreshMock } = vi.hoisted(() => ({
  refreshMock: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshMock }),
}))

import { CreatorMissionsView, type CreatorMissionCard } from '@/components/kinnso/pages/CreatorMissionsView'
import en from '@/lib/i18n/messages/en'

afterEach(() => {
  cleanup()
  refreshMock.mockReset()
})

const baseAvailable: CreatorMissionCard = {
  id: 'm1',
  title: 'Boutique hotels program',
  summary: 'Join and create tracked links.',
  missionSource: 'merchant',
  missionType: 'coupon_affiliate',
  status: 'published',
  participant: null,
  partnerLinks: [],
  programUrl: null,
  compensation: '12% commission',
  milestoneCount: 0,
  submittedCount: 0,
  locked: false,
  requiredTier: null,
  funded: false,
}

const baseMine: CreatorMissionCard = {
  ...baseAvailable,
  id: 'm9',
  title: 'Summer in Shibuya',
  participant: { id: 'p9', status: 'active', source: 'self' },
  missionType: 'hybrid',
  compensation: 'HK$5,000 + 15% commission',
  milestoneCount: 3,
  submittedCount: 1,
}

const baseInvited: CreatorMissionCard = {
  ...baseAvailable,
  id: 'm-inv',
  title: 'Invited collab',
  participant: { id: 'pi', status: 'invited', source: 'merchant_invite' },
}

describe('CreatorMissionsView', () => {
  it('renders an available mission and calls join', () => {
    const onJoin = vi.fn()
    render(<CreatorMissionsView locale="en" t={en.missions} missions={[baseAvailable]} onJoin={onJoin} onAccept={vi.fn()} />)
    expect(screen.getByText('Boutique hotels program')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: en.missions.joinMission }))
    expect(onJoin).toHaveBeenCalledWith('m1')
    expect(document.querySelector('.k-ticket')).toBeTruthy()
  })

  it('shows join action errors returned by the server', async () => {
    const onJoin = vi.fn(async () => ({ ok: false, errors: { form: ['Creator access is required'] } }))
    render(<CreatorMissionsView locale="en" t={en.missions} missions={[baseAvailable]} onJoin={onJoin} onAccept={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: en.missions.joinMission }))
    expect((await screen.findByRole('alert')).textContent).toContain('Creator access is required')
  })

  it('disables actions while pending and refreshes after success', async () => {
    let resolveJoin!: (result: { ok: true }) => void
    const onJoin = vi.fn(() => new Promise<{ ok: true }>((resolve) => { resolveJoin = resolve }))
    render(<CreatorMissionsView locale="en" t={en.missions} missions={[baseAvailable]} onJoin={onJoin} onAccept={vi.fn()} />)
    const button = screen.getByRole('button', { name: en.missions.joinMission })
    fireEvent.click(button)
    expect(button).toHaveProperty('disabled', true)
    resolveJoin({ ok: true })
    await waitFor(() => expect(refreshMock).toHaveBeenCalledTimes(1))
  })

  it('only disables the mission whose action is in flight', () => {
    const onJoin = vi.fn(() => new Promise<{ ok: true }>(() => {}))
    render(
      <CreatorMissionsView
        locale="en"
        t={en.missions}
        missions={[
          { ...baseAvailable, id: 'm1', missionType: 'coupon_affiliate' },
          { ...baseAvailable, id: 'm2', title: 'Paid reel', missionType: 'paid' },
        ]}
        onJoin={onJoin}
        onAccept={vi.fn()}
      />,
    )
    const joinButton = screen.getByRole('button', { name: en.missions.joinMission })
    const applyButton = screen.getByRole('button', { name: en.missions.applyMission })
    fireEvent.click(joinButton)
    expect(joinButton).toHaveProperty('disabled', true)
    expect(applyButton).toHaveProperty('disabled', false)
  })

  it('uses apply copy for paid missions', () => {
    const onJoin = vi.fn()
    render(
      <CreatorMissionsView
        locale="en"
        t={en.missions}
        missions={[{ ...baseAvailable, id: 'm2', missionType: 'paid' }]}
        onJoin={onJoin}
        onAccept={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: en.missions.applyMission }))
    expect(onJoin).toHaveBeenCalledWith('m2')
  })

  it('uses apply copy (not join) for receipt_cashback missions', () => {
    const onJoin = vi.fn()
    render(
      <CreatorMissionsView
        locale="en"
        t={en.missions}
        missions={[{ ...baseAvailable, id: 'm3', missionType: 'receipt_cashback' }]}
        onJoin={onJoin}
        onAccept={vi.fn()}
      />,
    )
    expect(screen.queryByRole('button', { name: en.missions.joinMission })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: en.missions.applyMission }))
    expect(onJoin).toHaveBeenCalledWith('m3')
  })

  it('renders joined missions under My missions with progress and no join button', () => {
    render(<CreatorMissionsView locale="en" t={en.missions} missions={[baseMine]} onJoin={vi.fn()} onAccept={vi.fn()} />)
    expect(screen.getByText('Summer in Shibuya')).toBeTruthy()
    expect(screen.getByText(`1 / 3 ${en.missions.milestoneProgress}`)).toBeTruthy()
    expect(screen.queryByRole('button', { name: en.missions.applyMission })).toBeNull()
  })

  it('shows an empty state for each band', () => {
    render(<CreatorMissionsView locale="en" t={en.missions} missions={[]} onJoin={vi.fn()} onAccept={vi.fn()} />)
    expect(screen.getByText(en.missions.myMissionsEmpty)).toBeTruthy()
    expect(screen.getByText(en.missions.availableEmpty)).toBeTruthy()
  })

  it('links each card to its detail page', () => {
    render(<CreatorMissionsView locale="en" t={en.missions} missions={[baseMine, baseAvailable]} onJoin={vi.fn()} onAccept={vi.fn()} />)
    const links = screen.getAllByRole('link', { name: en.missions.viewDetails })
    expect(links.map((a) => a.getAttribute('href'))).toEqual(
      expect.arrayContaining(['/en/studio/missions/m9', '/en/studio/missions/m1']),
    )
  })

  it('renders a locked mission with a disabled join and the required tier', () => {
    const onJoin = vi.fn()
    const locked: CreatorMissionCard = {
      ...baseAvailable,
      id: 'm-locked',
      title: 'Pro-only mission',
      locked: true,
      requiredTier: 'pro',
    }
    render(<CreatorMissionsView locale="en" t={en.missions} missions={[locked]} onJoin={onJoin} onAccept={vi.fn()} />)
    expect(screen.getByText('Pro-only mission')).toBeTruthy()
    expect(screen.getByText(en.missions.locked)).toBeTruthy()
    // the requirement badge renders the tier label
    expect(screen.getByText('Pro')).toBeTruthy()
    const joinBtn = screen.getByRole('button', { name: en.missions.joinMission })
    expect(joinBtn.hasAttribute('disabled')).toBe(true)
    fireEvent.click(joinBtn)
    expect(onJoin).not.toHaveBeenCalled()
  })

  it('groups merchant invitations into an Invitations section and accepts them', async () => {
    const onAccept = vi.fn(async () => ({ ok: true as const }))
    render(
      <CreatorMissionsView
        locale="en"
        t={en.missions}
        missions={[baseInvited]}
        onJoin={vi.fn()}
        onAccept={onAccept}
      />,
    )
    expect(screen.getByText(en.missions.invitationsTitle)).toBeTruthy()
    expect(screen.getByText('Invited collab')).toBeTruthy()
    // An invited merchant mission must not appear in the open "available" join flow.
    expect(screen.queryByRole('button', { name: en.missions.joinMission })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: en.missions.acceptInvite }))
    expect(onAccept).toHaveBeenCalledWith('m-inv')
    await waitFor(() => expect(refreshMock).toHaveBeenCalledTimes(1))
  })

  it('shows a Funded badge only on funded missions', () => {
    const fundedMission: CreatorMissionCard = {
      ...baseAvailable,
      id: 'm-funded',
      title: 'Funded paid mission',
      missionType: 'paid',
      funded: true,
    }
    const unfundedMission: CreatorMissionCard = {
      ...baseAvailable,
      id: 'm-unfunded',
      title: 'Unfunded paid mission',
      missionType: 'paid',
      funded: false,
    }
    render(
      <CreatorMissionsView
        locale="en"
        t={en.missions}
        missions={[fundedMission, unfundedMission]}
        onJoin={vi.fn()}
        onAccept={vi.fn()}
      />,
    )
    const fundedCard = screen.getByText('Funded paid mission').closest('article')!
    const unfundedCard = screen.getByText('Unfunded paid mission').closest('article')!
    expect(within(fundedCard).getByText(en.missions.fundedBadge)).toBeTruthy()
    expect(within(unfundedCard).queryByText(en.missions.fundedBadge)).toBeNull()
  })

  it('keeps a normal open mission in the available band, not Invitations', () => {
    render(
      <CreatorMissionsView
        locale="en"
        t={en.missions}
        missions={[baseAvailable]}
        onJoin={vi.fn()}
        onAccept={vi.fn()}
      />,
    )
    expect(screen.queryByText(en.missions.invitationsTitle)).toBeNull()
    expect(screen.getByRole('button', { name: en.missions.joinMission })).toBeTruthy()
  })
})
