// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { MerchantMissionsView } from '@/components/kinnso/pages/MerchantMissionsView'
import en from '@/lib/i18n/messages/en'

afterEach(cleanup)

describe('MerchantMissionsView', () => {
  it('shows mission status and counts, and links each row to its detail page', () => {
    render(<MerchantMissionsView locale="en" t={en.missions} missions={[{
      id: 'm1',
      title: 'Paid reel campaign',
      status: 'published',
      participantCount: 2,
      pendingCount: 1,
      settlementStatus: 'pending',
    }]} />)
    expect(screen.getByText('Paid reel campaign')).toBeTruthy()
    expect(screen.getByText(/2/)).toBeTruthy()
    expect(screen.getByText(/pending/i)).toBeTruthy()
    expect(screen.getByRole('link', { name: /Paid reel campaign/ }).getAttribute('href')).toBe('/en/merchants/dashboard/missions/m1')
  })

  it('shows a post-a-mission CTA when there are no missions', () => {
    render(<MerchantMissionsView locale="en" t={en.missions} missions={[]} />)
    expect(screen.getByText(en.missions.missionsEmptyTitle)).toBeTruthy()
    expect(screen.getByRole('link', { name: en.missions.postMissionCta }).getAttribute('href')).toBe('/en/merchants/dashboard/post')
  })
})
