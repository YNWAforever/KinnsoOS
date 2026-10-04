// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'

afterEach(cleanup)

const pushMock = vi.hoisted(() => vi.fn())

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: pushMock }) }))

import { StudioScanView } from '@/components/kinnso/pages/StudioScanView'
import { getCreator, sampleDna } from '@/lib/creator-mock'
import { buildDemoIdentity, buildStudioIdentity, type HandleRow } from '@/lib/studio/identity'
import en from '@/lib/i18n/messages/en'

const metrics = getCreator('maywanders')!

function renderDemo() {
  return render(
    <StudioScanView
      locale="en"
      mode="demo"
      identity={buildDemoIdentity(metrics, '2026-06-16T00:00:00Z')}
      dna={sampleDna}
      metrics={metrics}
      isSample={false}
      t={en.studio}
    />,
  )
}

const handles: HandleRow[] = [{ platform: 'instagram', handle: 'maygram', url: null }]
function renderReal() {
  return render(
    <StudioScanView
      locale="en"
      mode="real"
      identity={buildStudioIdentity({ display_name: 'May Wong' }, handles, sampleDna, '2026-06-01T00:00:00Z')}
      dna={sampleDna}
      metrics={metrics}
      isSample={false}
      t={en.studio}
    />,
  )
}

describe('StudioScanView — demo mode', () => {
  afterEach(() => {
    pushMock.mockReset()
  })

  it('renders the report headings and the DNA core panel', () => {
    renderDemo()
    expect(screen.getByText(en.studio.reportReadyHeading)).toBeTruthy()
    expect(screen.getByText(en.studio.engagementOverTime)).toBeTruthy()
    expect(screen.getByText(en.studio.dnaCoreHeading)).toBeTruthy()
    expect(screen.getByText(en.studio.matchedForYou)).toBeTruthy()
    expect(document.querySelector('.k-ticket')).toBeTruthy()
  })

  it('intro screen has a labelled instagram input', () => {
    render(
      <StudioScanView
        locale="en"
        mode="demo"
        initialPhase="intro"
        identity={buildDemoIdentity(metrics, '2026-06-16T00:00:00Z')}
        dna={sampleDna}
        metrics={metrics}
        isSample={false}
        t={en.studio}
      />,
    )
    expect(screen.getByLabelText(en.studio.instagram)).toBeTruthy()
  })

  it('shows the mock identity and the publish/share footer; no sample note', () => {
    renderDemo()
    expect(screen.getByText(metrics.name)).toBeTruthy()
    expect(screen.getByText(`@${metrics.handle}`)).toBeTruthy()
    expect(screen.getByRole('button', { name: en.studio.publishProfile })).toBeTruthy()
    expect(screen.queryByText(en.studio.sampleNote)).toBeNull()
  })

  it('toggles the share dialog open', () => {
    renderDemo()
    fireEvent.click(screen.getByRole('button', { name: en.studio.shareDnaCard }))
    expect(screen.getByText(en.studio.shareDialogTitle)).toBeTruthy()
    expect(screen.getByText(`http://localhost:3000/en/c/${metrics.handle}`)).toBeTruthy()
  })

  it('keeps mission and profile navigation under the active locale', () => {
    const { container } = renderDemo()

    const missionLinks = Array.from(container.querySelectorAll<HTMLAnchorElement>('a[href="/en/studio/missions"]'))
    expect(missionLinks).toHaveLength(3)

    fireEvent.click(screen.getByRole('button', { name: new RegExp(en.studio.viewAllMissions) }))
    expect(pushMock).toHaveBeenCalledWith('/en/studio/missions')

    fireEvent.click(screen.getByRole('button', { name: en.studio.publishProfile }))
    expect(pushMock).toHaveBeenCalledWith(`/en/c/${metrics.handle}`)
  })
})

describe('StudioScanView — real mode', () => {
  it('renders the real identity (display_name + instagram handle) and the DNA core', () => {
    renderReal()
    expect(screen.getByText('May Wong')).toBeTruthy()
    expect(screen.getByText('@maygram')).toBeTruthy()
    expect(screen.getByText(en.studio.dnaCoreHeading)).toBeTruthy()
    // The DNA bio is unique prose rendered only by DnaCorePanel — it is the real,
    // qualitative DNA, which is all real mode shows.
    expect(screen.getByText(sampleDna.bio)).toBeTruthy()
  })

  it('shows real DNA only — no fabricated metric sections, no sample framing', () => {
    renderReal()
    // The maywanders numeric overlay is gone in real mode.
    expect(screen.queryByText(en.studio.engagementOverTime)).toBeNull()
    expect(screen.queryByText(en.studio.yourAudience)).toBeNull()
    expect(screen.queryByText(en.studio.whatYouCreate)).toBeNull()
    expect(screen.queryByText(en.studio.bestTravelPosts)).toBeNull()
    expect(screen.queryByText('3,400')).toBeNull() // fabricated avg likes
    // Real DNA is genuine, not a sample.
    expect(screen.queryByText(en.studio.sampleNote)).toBeNull()
    expect(screen.queryByText(en.studio.sampleBadge)).toBeNull()
  })

  it('offers an honest link to real missions and hides the publish/share footer', () => {
    renderReal()
    expect(screen.getByRole('link', { name: new RegExp(en.studio.viewAllMissions) }).getAttribute('href')).toBe('/en/studio/missions')
    expect(screen.queryByRole('button', { name: en.studio.publishProfile })).toBeNull()
    expect(screen.queryByRole('button', { name: en.studio.shareDnaCard })).toBeNull()
  })

  it('hides the rescan control (no fake-scan in real mode)', () => {
    renderReal()
    expect(screen.queryByRole('button', { name: en.studio.rescan })).toBeNull()
  })
})
