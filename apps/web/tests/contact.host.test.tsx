// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

afterEach(cleanup)
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NEXT_NOT_FOUND') } }))

import ContactPage from '@/app/[locale]/contact/page'
import en from '@/lib/i18n/messages/en'

describe('/[locale]/contact host', () => {
  it('renders the contact page with a mailto link', async () => {
    const ui = await ContactPage({ params: Promise.resolve({ locale: 'en' }) })
    render(ui)
    expect(screen.getByRole('heading', { level: 1, name: en.contact.title })).toBeTruthy()
    expect(screen.getByRole('link', { name: en.contact.emailCta }).getAttribute('href')).toBe('mailto:business@kinnso.ai')
  })
})
