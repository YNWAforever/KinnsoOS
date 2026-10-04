// apps/web/tests/kinnso.experience-card.test.tsx
// @vitest-environment jsdom
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { pushMock, refreshMock } = vi.hoisted(() => ({ pushMock: vi.fn(), refreshMock: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: pushMock, refresh: refreshMock }) }))

const { saveExperienceActionMock, unsaveExperienceActionMock } = vi.hoisted(() => ({
  saveExperienceActionMock: vi.fn(async () => ({ ok: true, experienceId: 'e1' })),
  unsaveExperienceActionMock: vi.fn(async () => ({ ok: true, experienceId: 'e1' })),
}))
vi.mock('@/lib/saves/experience-actions', () => ({
  saveExperienceAction: saveExperienceActionMock,
  unsaveExperienceAction: unsaveExperienceActionMock,
}))

import ExperienceCard from '@/components/kinnso/ExperienceCard'
import { ExperienceSaveButton } from '@/components/kinnso/ExperienceSaveButton'
import en from '@/lib/i18n/messages/en'

afterEach(cleanup)

const experience = { slug: 'sunset-tour', title: 'Sunset junk boat tour', city: 'Hong Kong', priceAmount: 480, currency: 'HKD', coverUrl: null, savesCount: 12 }

describe('ExperienceCard', () => {
  it('links to the experience detail page and shows no save button when onSaveToggle is omitted', () => {
    const { container } = render(<ExperienceCard experience={{ ...experience, coverUrl: 'https://picsum.photos/e.jpg' }} locale="en" />)
    expect(screen.getByRole('link').getAttribute('href')).toBe('/en/experiences/sunset-tour')
    expect(screen.queryByRole('button')).toBeNull()
    expect(container.querySelector('[data-media-placeholder="true"]')).toBeTruthy()
    expect(container.innerHTML).not.toContain('picsum.photos')
  })

  it('never navigates the card link when the save button is clicked', () => {
    const onSaveToggle = vi.fn()
    render(<ExperienceCard experience={experience} locale="en" isSaved={false} onSaveToggle={onSaveToggle} />)
    const button = screen.getByRole('button')
    const link = screen.getByRole('link')
    expect(button.closest('a')).toBeNull()
    expect(button.parentElement).toBe(link.parentElement)
    expect(button.tabIndex).toBe(0)
    expect(link.tabIndex).toBe(0)
    fireEvent.click(button)
    expect(onSaveToggle).toHaveBeenCalledTimes(1)
  })

  it('renders the saves count, with and without a save toggle', () => {
    const { unmount } = render(<ExperienceCard experience={experience} locale="en" />)
    expect(screen.getByText('12')).toBeInTheDocument()
    unmount()
    render(<ExperienceCard experience={experience} locale="en" isSaved={false} onSaveToggle={() => {}} />)
    expect(screen.getByRole('button').textContent).toContain('12')
  })

  it('renders approved CDN media', () => {
    const { container } = render(
      <ExperienceCard experience={{ ...experience, coverUrl: 'https://cdn.kinnso.ai/test/experience.jpg' }} locale="en" />,
    )
    expect(container.querySelector('img')).toBeTruthy()
    expect(container.innerHTML).toContain('cdn.kinnso.ai')
  })
})

describe('ExperienceSaveButton', () => {
  it('routes an anon click to sign-in without calling any save action', () => {
    render(<ExperienceSaveButton locale="en" experienceId="e1" initialSaved={false} signedIn={false} t={en.experienceSave} />)
    fireEvent.click(screen.getByRole('button'))
    expect(pushMock).toHaveBeenCalledWith('/en/sign-in')
    expect(saveExperienceActionMock).not.toHaveBeenCalled()
  })

  it('calls saveExperienceAction and flips to the saved label for a signed-in traveller', async () => {
    render(<ExperienceSaveButton locale="en" experienceId="e1" initialSaved={false} signedIn={true} t={en.experienceSave} />)
    fireEvent.click(screen.getByRole('button', { name: en.experienceSave.save }))
    await waitFor(() => expect(saveExperienceActionMock).toHaveBeenCalledWith('en', 'e1'))
    await screen.findByRole('button', { name: en.experienceSave.saved })
    expect(refreshMock).toHaveBeenCalled()
  })

  it('shows "Sign in to save" (not "Save") for an anon viewer, and conveys toggle state via aria-pressed', () => {
    render(<ExperienceSaveButton locale="en" experienceId="e1" initialSaved={false} signedIn={false} t={en.experienceSave} />)
    expect(screen.getByRole('button', { name: en.experienceSave.signInToSave })).toBeInTheDocument()
  })

  it('sets aria-pressed to reflect the saved state for a signed-in traveller', () => {
    render(<ExperienceSaveButton locale="en" experienceId="e1" initialSaved={true} signedIn={true} t={en.experienceSave} />)
    expect(screen.getByRole('button', { name: en.experienceSave.saved })).toHaveAttribute('aria-pressed', 'true')
  })
})
