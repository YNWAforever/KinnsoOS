// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
afterEach(cleanup)

import { TeamDirectoryView } from '@/components/kinnso/admin/team/TeamDirectoryView'
import en from '@/lib/i18n/messages/en'

const members = [
  { id: 'm1', displayName: 'Alice', userId: 'u1', role: 'owner',     status: 'active',    joinedAt: '2026-01-01T00:00:00Z' },
  { id: 'm2', displayName: 'Bob',   userId: 'u2', role: 'moderator', status: 'suspended', joinedAt: '2026-02-01T00:00:00Z' },
]

const onSetRole    = vi.fn(async () => ({ ok: true as const }))
const onSuspend    = vi.fn(async () => ({ ok: true as const }))
const onReactivate = vi.fn(async () => ({ ok: true as const }))

describe('TeamDirectoryView', () => {
  it('renders column headers', () => {
    render(<TeamDirectoryView t={en.team} locale="en" members={members} onSetRole={onSetRole} onSuspend={onSuspend} onReactivate={onReactivate} />)
    expect(screen.getByText(en.team.colName)).toBeTruthy()
    expect(screen.getByText(en.team.colRole)).toBeTruthy()
    expect(screen.getByText(en.team.colStatus)).toBeTruthy()
  })
  it('renders each member display name', () => {
    render(<TeamDirectoryView t={en.team} locale="en" members={members} onSetRole={onSetRole} onSuspend={onSuspend} onReactivate={onReactivate} />)
    expect(screen.getByText('Alice')).toBeTruthy()
    expect(screen.getByText('Bob')).toBeTruthy()
  })
  it('renders role labels', () => {
    render(<TeamDirectoryView t={en.team} locale="en" members={members} onSetRole={onSetRole} onSuspend={onSuspend} onReactivate={onReactivate} />)
    expect(screen.getAllByText(en.team.roleOwner).length).toBeGreaterThan(0)
    expect(screen.getAllByText(en.team.roleModerator).length).toBeGreaterThan(0)
  })
  it('renders status labels', () => {
    render(<TeamDirectoryView t={en.team} locale="en" members={members} onSetRole={onSetRole} onSuspend={onSuspend} onReactivate={onReactivate} />)
    expect(screen.getByText(en.team.statusActive)).toBeTruthy()
    expect(screen.getByText(en.team.statusSuspended)).toBeTruthy()
  })
  it('renders a suspend button for active members and a reactivate button for suspended members', () => {
    render(<TeamDirectoryView t={en.team} locale="en" members={members} onSetRole={onSetRole} onSuspend={onSuspend} onReactivate={onReactivate} />)
    expect(screen.getAllByRole('button', { name: en.team.actionSuspend })).toHaveLength(1)
    expect(screen.getAllByRole('button', { name: en.team.actionReactivate })).toHaveLength(1)
  })
})
