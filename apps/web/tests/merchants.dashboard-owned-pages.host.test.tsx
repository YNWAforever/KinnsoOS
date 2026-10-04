// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  merchantPageGateMock,
  createSupabaseServerClientMock,
  getMyExperienceMock,
  listExperienceAvailabilityMock,
  supabase,
} = vi.hoisted(() => ({
  merchantPageGateMock: vi.fn(),
  createSupabaseServerClientMock: vi.fn(),
  getMyExperienceMock: vi.fn(),
  listExperienceAvailabilityMock: vi.fn(),
  supabase: { source: 'server' },
}))

const experience = {
  id: 'experience-1',
  slug: 'sunset-tour-abc123',
  title: 'Sunset tour',
  summary: null,
  description: null,
  city: 'Hong Kong',
  priceAmount: 480,
  currency: 'HKD',
  durationMinutes: null,
  coverUrl: null,
  status: 'draft' as const,
  updatedAt: '2026-08-01T00:00:00Z',
}

vi.mock('next/navigation', () => ({
  notFound: () => { throw new Error('NEXT_NOT_FOUND') },
  redirect: (path: string) => { throw new Error(`NEXT_REDIRECT:${path}`) },
}))
vi.mock('@/lib/admin/guard', () => ({ requireMerchantPage: merchantPageGateMock }))
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: createSupabaseServerClientMock,
}))
vi.mock('@/lib/experiences/queries', () => ({ getMyExperience: getMyExperienceMock }))
vi.mock('@/lib/experiences/availability-queries', () => ({
  listExperienceAvailability: listExperienceAvailabilityMock,
}))
vi.mock('@/lib/i18n/dictionaries', () => ({
  getDictionary: async () => ({ merchantDashboard: {} }),
}))
vi.mock('@/components/kinnso/pages/ExperienceForm', () => ({
  ExperienceForm: ({ existing }: { existing: typeof experience }) => <p>Edit: {existing.title}</p>,
}))
vi.mock('@/components/kinnso/pages/MerchantAvailabilityView', () => ({
  MerchantAvailabilityView: ({ experienceTitle }: { experienceTitle: string }) => (
    <p>Availability: {experienceTitle}</p>
  ),
}))

import ExperienceAvailabilityPage from '@/app/[locale]/merchants/dashboard/experiences/[experienceId]/availability/page'
import EditExperiencePage from '@/app/[locale]/merchants/dashboard/experiences/[experienceId]/edit/page'

afterEach(cleanup)

beforeEach(() => {
  merchantPageGateMock.mockReset()
  createSupabaseServerClientMock.mockReset()
  getMyExperienceMock.mockReset()
  listExperienceAvailabilityMock.mockReset()

  merchantPageGateMock.mockResolvedValue({ user: { id: 'u1' }, merchantId: 'merchant-from-guard' })
  createSupabaseServerClientMock.mockResolvedValue(supabase)
  getMyExperienceMock.mockResolvedValue(experience)
  listExperienceAvailabilityMock.mockResolvedValue([])
})

describe('merchant-owned experience pages', () => {
  it('passes the guarded merchant ID and requested experience ID to availability ownership lookup', async () => {
    const ui = await ExperienceAvailabilityPage({
      params: Promise.resolve({ locale: 'en', experienceId: 'requested-experience' }),
    })

    render(ui)

    expect(getMyExperienceMock).toHaveBeenCalledWith(
      supabase,
      'merchant-from-guard',
      'requested-experience',
    )
    expect(screen.getByText('Availability: Sunset tour')).toBeTruthy()
  })

  it('not-founds missing or non-owned availability before loading availability', async () => {
    getMyExperienceMock.mockResolvedValueOnce(null)

    await expect(ExperienceAvailabilityPage({
      params: Promise.resolve({ locale: 'en', experienceId: 'not-owned' }),
    })).rejects.toThrow('NEXT_NOT_FOUND')

    expect(listExperienceAvailabilityMock).not.toHaveBeenCalled()
  })

  it('passes the guarded merchant ID and requested experience ID to edit ownership lookup', async () => {
    const ui = await EditExperiencePage({
      params: Promise.resolve({ locale: 'en', experienceId: 'requested-experience' }),
    })

    render(ui)

    expect(getMyExperienceMock).toHaveBeenCalledWith(
      supabase,
      'merchant-from-guard',
      'requested-experience',
    )
    expect(screen.getByText('Edit: Sunset tour')).toBeTruthy()
  })

  it('not-founds a missing or non-owned edit experience', async () => {
    getMyExperienceMock.mockResolvedValueOnce(null)

    await expect(EditExperiencePage({
      params: Promise.resolve({ locale: 'en', experienceId: 'not-owned' }),
    })).rejects.toThrow('NEXT_NOT_FOUND')
  })
})
