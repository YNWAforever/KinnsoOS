// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
afterEach(cleanup)

import { TeamOverviewView } from '@/components/kinnso/admin/team/TeamOverviewView'
import en from '@/lib/i18n/messages/en'

const overview = {
  members: [
    { id: 'm1', displayName: 'Alice', userId: 'u1', role: 'owner',     status: 'active',    joinedAt: '2026-01-01T00:00:00Z' },
    { id: 'm2', displayName: 'Bob',   userId: 'u2', role: 'moderator', status: 'active',    joinedAt: '2026-02-01T00:00:00Z' },
  ],
  byRole: { owner: 1, admin: 0, moderator: 1, analyst: 0 },
  pendingInvites: 0,
}

const onInvite = vi.fn(async () => ({ ok: true as const, token: 'tok' }))

describe('TeamOverviewView', () => {
  it('renders the overview title', () => {
    render(<TeamOverviewView t={en.team} locale="en" overview={overview} onInvite={onInvite} />)
    expect(screen.getByRole('heading', { name: en.team.overviewTitle })).toBeTruthy()
  })
  it('shows total member count', () => {
    render(<TeamOverviewView t={en.team} locale="en" overview={overview} onInvite={onInvite} />)
    expect(screen.getByText('2')).toBeTruthy()
  })
  it('links to the team directory', () => {
    render(<TeamOverviewView t={en.team} locale="en" overview={overview} onInvite={onInvite} />)
    const links = screen.getAllByRole('link')
    expect(links.some((l) => l.getAttribute('href') === '/en/admin/team/directory')).toBe(true)
  })
  it('shows pending invites count (0 in 12A)', () => {
    render(<TeamOverviewView t={en.team} locale="en" overview={overview} onInvite={onInvite} />)
    expect(screen.getByText(en.team.kpiPending).previousElementSibling?.textContent).toBe('0')
  })
  it('renders the invite panel with email input and generate button', () => {
    render(<TeamOverviewView t={en.team} locale="en" overview={overview} onInvite={onInvite} />)
    expect(screen.getByPlaceholderText(en.team.inviteEmailLabel)).toBeTruthy()
    expect(screen.getByRole('button', { name: en.team.inviteGenerate })).toBeTruthy()
  })
})
