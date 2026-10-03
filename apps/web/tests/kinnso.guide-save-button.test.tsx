// apps/web/tests/kinnso.guide-save-button.test.tsx
// @vitest-environment jsdom
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { pushMock, refreshMock } = vi.hoisted(() => ({ pushMock: vi.fn(), refreshMock: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: pushMock, refresh: refreshMock }) }))

// Typed against the real outcome so a failure case with `reason` is assignable;
// inferring from the success default narrows it to { ok: boolean; guideId: string }.
type GuideSaveOutcome =
  | { ok: true; guideId: string }
  | { ok: false; reason: 'auth' | 'failed'; errors: Record<string, string[]> }

const { saveGuideActionMock, unsaveGuideActionMock } = vi.hoisted(() => ({
  saveGuideActionMock: vi.fn(async (): Promise<GuideSaveOutcome> => ({ ok: true, guideId: 'g1' })),
  unsaveGuideActionMock: vi.fn(async (): Promise<GuideSaveOutcome> => ({ ok: true, guideId: 'g1' })),
}))
vi.mock('@/lib/saves/guide-actions', () => ({
  saveGuideAction: saveGuideActionMock,
  unsaveGuideAction: unsaveGuideActionMock,
}))

import { GuideSaveButton } from '@/components/kinnso/GuideSaveButton'
import { safeNext } from '@/lib/auth/safe-next'
import en from '@/lib/i18n/messages/en'

afterEach(() => {
  cleanup()
  pushMock.mockClear()
  refreshMock.mockClear()
  saveGuideActionMock.mockClear()
  unsaveGuideActionMock.mockClear()
})

describe('GuideSaveButton', () => {
  it('routes an anon click to sign-in carrying this guide as the return destination', () => {
    window.history.replaceState({}, '', '/en/g/kowloon-noodles')
    render(<GuideSaveButton locale="en" guideId="g1" initialSaved={false} signedIn={false} t={en.guideSave} />)
    fireEvent.click(screen.getByRole('button'))

    expect(pushMock).toHaveBeenCalledWith('/en/sign-in?next=%2Fen%2Fg%2Fkowloon-noodles')
    expect(saveGuideActionMock).not.toHaveBeenCalled()
  })

  it('preserves the query string of the page it interrupted', () => {
    window.history.replaceState({}, '', '/en/g/kowloon-noodles?from=explore')
    render(<GuideSaveButton locale="en" guideId="g1" initialSaved={false} signedIn={false} t={en.guideSave} />)
    fireEvent.click(screen.getByRole('button'))

    const href = pushMock.mock.calls.at(-1)?.[0] as string
    const next = new URLSearchParams(href.split('?')[1]).get('next')
    expect(safeNext(next ?? undefined, 'en')).toBe('/en/g/kowloon-noodles?from=explore')
  })

  it('falls back to a bare sign-in when the current page is not under this locale', () => {
    // Defence in depth: the destination must be vouched for, never reflected.
    window.history.replaceState({}, '', '/zh-hk/g/kowloon-noodles')
    render(<GuideSaveButton locale="en" guideId="g1" initialSaved={false} signedIn={false} t={en.guideSave} />)
    fireEvent.click(screen.getByRole('button'))

    expect(pushMock).toHaveBeenCalledWith('/en/sign-in')
  })

  it('shows "Sign in to save" (not "Save") for an anon viewer, and conveys toggle state via aria-pressed', () => {
    render(<GuideSaveButton locale="en" guideId="g1" initialSaved={false} signedIn={false} t={en.guideSave} />)
    expect(screen.getByRole('button', { name: en.guideSave.signInToSave })).toBeInTheDocument()
  })

  it('sets aria-pressed to reflect the saved state for a signed-in traveller', () => {
    render(<GuideSaveButton locale="en" guideId="g1" initialSaved={true} signedIn={true} t={en.guideSave} />)
    expect(screen.getByRole('button', { name: en.guideSave.saved })).toHaveAttribute('aria-pressed', 'true')
  })

  it('calls saveGuideAction and flips to the saved label for a signed-in traveller', async () => {
    render(<GuideSaveButton locale="en" guideId="g1" initialSaved={false} signedIn={true} t={en.guideSave} />)
    fireEvent.click(screen.getByRole('button', { name: en.guideSave.save }))
    await waitFor(() => expect(saveGuideActionMock).toHaveBeenCalledWith('en', 'g1'))
    await screen.findByRole('button', { name: en.guideSave.saved })
    expect(refreshMock).toHaveBeenCalled()
  })

  it('calls unsaveGuideAction when already saved', async () => {
    render(<GuideSaveButton locale="en" guideId="g1" initialSaved={true} signedIn={true} t={en.guideSave} />)
    fireEvent.click(screen.getByRole('button', { name: en.guideSave.saved }))
    await waitFor(() => expect(unsaveGuideActionMock).toHaveBeenCalledWith('en', 'g1'))
    await screen.findByRole('button', { name: en.guideSave.save })
  })

  // B4: a failed save used to render nothing at all -- the button simply stopped
  // responding, which reads as a broken page rather than a save that did not
  // happen. The two failures need opposite responses, hence the `reason`
  // discriminator rather than matching on English message text.
  it('states that a save failed instead of silently doing nothing', async () => {
    saveGuideActionMock.mockResolvedValueOnce({
      ok: false, reason: 'failed', errors: { form: ['Guide could not be saved'] },
    })
    render(<GuideSaveButton locale="en" guideId="g1" initialSaved={false} signedIn={true} t={en.guideSave} />)

    fireEvent.click(screen.getByRole('button', { name: en.guideSave.save }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(en.guideSave.saveFailed)
  })

  it('leaves the button un-flipped when the save failed', async () => {
    saveGuideActionMock.mockResolvedValueOnce({
      ok: false, reason: 'failed', errors: { form: ['Guide could not be saved'] },
    })
    render(<GuideSaveButton locale="en" guideId="g1" initialSaved={false} signedIn={true} t={en.guideSave} />)

    fireEvent.click(screen.getByRole('button', { name: en.guideSave.save }))

    await screen.findByRole('alert')
    // Claiming "Saved" for a write that did not land is the failure mode worth
    // guarding: only server evidence marks a save as saved.
    expect(screen.getByRole('button', { name: en.guideSave.save })).toHaveAttribute('aria-pressed', 'false')
    expect(refreshMock).not.toHaveBeenCalled()
  })

  it('asks an expired session to re-authenticate, carrying the guide back', async () => {
    // The viewer was signed in at render and the session lapsed before the
    // click, so `signedIn` was stale. This is a sign-in, not a broken save.
    window.history.replaceState({}, '', '/en/g/kowloon-noodles')
    saveGuideActionMock.mockResolvedValueOnce({
      ok: false, reason: 'auth', errors: { form: ['Sign in is required'] },
    })
    render(<GuideSaveButton locale="en" guideId="g1" initialSaved={false} signedIn={true} t={en.guideSave} />)

    fireEvent.click(screen.getByRole('button', { name: en.guideSave.save }))

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/en/sign-in?next=%2Fen%2Fg%2Fkowloon-noodles'))
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('clears a previous failure when the viewer retries', async () => {
    saveGuideActionMock.mockResolvedValueOnce({
      ok: false, reason: 'failed', errors: { form: ['Guide could not be saved'] },
    })
    render(<GuideSaveButton locale="en" guideId="g1" initialSaved={false} signedIn={true} t={en.guideSave} />)

    fireEvent.click(screen.getByRole('button', { name: en.guideSave.save }))
    await screen.findByRole('alert')

    saveGuideActionMock.mockResolvedValueOnce({ ok: true, guideId: 'g1' })
    fireEvent.click(screen.getByRole('button', { name: en.guideSave.save }))

    await screen.findByRole('button', { name: en.guideSave.saved })
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('shows no alert before the viewer has tried to save', () => {
    render(<GuideSaveButton locale="en" guideId="g1" initialSaved={false} signedIn={true} t={en.guideSave} />)
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
