import { describe, expect, it } from 'vitest'
import { canSubmitMilestone } from '@/lib/missions/submission-state'

describe('canSubmitMilestone', () => {
  it('allows a first submission for an active participant', () => {
    expect(canSubmitMilestone('active', 'none')).toBe(true)
  })
  it('allows editing a still-pending submission', () => {
    expect(canSubmitMilestone('active', 'submitted')).toBe(true)
  })
  it('allows resubmitting after a revision request', () => {
    expect(canSubmitMilestone('active', 'revision_requested')).toBe(true)
  })
  it('blocks once approved', () => {
    expect(canSubmitMilestone('active', 'approved')).toBe(false)
  })
  it('blocks once rejected', () => {
    expect(canSubmitMilestone('active', 'rejected')).toBe(false)
  })
  it('blocks when the participant is not active', () => {
    expect(canSubmitMilestone('completed', 'none')).toBe(false)
    expect(canSubmitMilestone(null, 'none')).toBe(false)
  })
})
