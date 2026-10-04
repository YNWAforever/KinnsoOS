// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import en from '@/lib/i18n/messages/en'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}))

// LiveProgress auto-starts a scan on mount; stub it so the idle test never hits the worker.
vi.mock('@/components/onboarding/LiveProgress', () => ({
  LiveProgress: () => <div data-testid="live-progress" />,
}))

import { StudioRescanButton } from '@/components/kinnso/StudioRescanButton'

afterEach(cleanup)

describe('StudioRescanButton', () => {
  it('shows the Rescan button and no progress when idle', () => {
    render(
      <StudioRescanButton
        creatorId="creator-1"
        platforms={['instagram']}
        activeJobId={null}
        progressT={en.onboarding.progressStep}
        t={en.studioDashboard}
      />,
    )
    expect(screen.getByRole('button', { name: en.studioDashboard.rescanCta })).toBeTruthy()
    expect(screen.queryByTestId('live-progress')).toBeNull()
  })

  it('mounts progress immediately when a scan is already running', () => {
    render(
      <StudioRescanButton
        creatorId="creator-1"
        platforms={['instagram']}
        activeJobId="job-1"
        progressT={en.onboarding.progressStep}
        t={en.studioDashboard}
      />,
    )
    expect(screen.getByTestId('live-progress')).toBeTruthy()
    expect(screen.queryByRole('button', { name: en.studioDashboard.rescanCta })).toBeNull()
  })
})
