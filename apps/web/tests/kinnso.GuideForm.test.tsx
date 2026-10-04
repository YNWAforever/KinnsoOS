// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import en from '@/lib/i18n/messages/en'
import { GuideForm } from '@/components/kinnso/GuideForm'

afterEach(cleanup)

describe('GuideForm', () => {
  it('renders the four fields and both submit buttons', () => {
    render(<GuideForm t={en.studioGuides} mode="new" onSubmit={vi.fn()} />)
    expect(screen.getByLabelText(en.studioGuides.titleLabel, { exact: false })).toBeTruthy()
    expect(screen.getByLabelText(en.studioGuides.cityLabel, { exact: false })).toBeTruthy()
    expect(screen.getByLabelText(en.studioGuides.coverLabel, { exact: false })).toBeTruthy()
    expect(screen.getByLabelText(en.studioGuides.summaryLabel, { exact: false })).toBeTruthy()
    expect(screen.getByRole('button', { name: en.studioGuides.saveDraft })).toBeTruthy()
    expect(screen.getByRole('button', { name: en.studioGuides.publish })).toBeTruthy()
    expect(document.querySelector('.k-ticket')).toBeTruthy()
  })

  it('shows a validation error and does not call onSubmit when title is blank', () => {
    const onSubmit = vi.fn()
    render(<GuideForm t={en.studioGuides} mode="new" onSubmit={onSubmit} />)
    fireEvent.click(screen.getByRole('button', { name: en.studioGuides.publish }))
    expect(onSubmit).not.toHaveBeenCalled()
    const alerts = screen.getAllByRole('alert').map((a) => a.textContent)
    expect(alerts).toContain(en.studioGuides.errorTitleRequired)
  })
})
