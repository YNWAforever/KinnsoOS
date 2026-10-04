// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'

afterEach(cleanup)
const push = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  usePathname: () => '/en/studio/scan',
}))

import LocaleSwitcher from '@/components/kinnso/LocaleSwitcher'
import en from '@/lib/i18n/messages/en'

describe('LocaleSwitcher', () => {
  it('renders the current locale and all options', () => {
    render(<LocaleSwitcher locale="en" t={en.nav} />)
    const select = screen.getByLabelText(en.nav.language) as HTMLSelectElement
    expect(select.value).toBe('en')
    expect(screen.getByRole('option', { name: /日本語/ })).toBeTruthy()
  })

  it('swaps the first path segment, preserving the rest', () => {
    window.history.replaceState(null, '', '/en/studio/scan?q=ramen&page=2')
    render(<LocaleSwitcher locale="en" t={en.nav} />)
    fireEvent.change(screen.getByLabelText(en.nav.language), { target: { value: 'ja' } })
    expect(push).toHaveBeenCalledWith('/ja/studio/scan?q=ramen&page=2')
  })
})
