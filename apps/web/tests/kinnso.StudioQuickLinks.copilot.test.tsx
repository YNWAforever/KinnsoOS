// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import en from '@/lib/i18n/messages/en'
import { StudioQuickLinks } from '@/components/kinnso/StudioQuickLinks'

afterEach(cleanup)

describe('StudioQuickLinks copilot tile', () => {
  it('renders a live Copilot tile linking to /studio/copilot', () => {
    render(<StudioQuickLinks locale="en" t={en.studioHome} unreadNotificationCount={0} />)
    const link = screen.getByRole('link', { name: new RegExp(en.studioHome.copilotTitle) })
    expect(link.getAttribute('href')).toBe('/en/studio/copilot')
  })
})
