import { describe, expect, it } from 'vitest'
import {
  resolveViewerRoleFromFacts,
  type ViewerRoleFacts,
} from '@/lib/auth/viewer-role-policy'

const facts = (overrides: Partial<ViewerRoleFacts> = {}): ViewerRoleFacts => ({
  authenticated: true,
  hasActiveOps: false,
  hasMerchantProfile: false,
  hasActiveCreator: false,
  hasCreatorHandle: false,
  ...overrides,
})

describe('resolveViewerRoleFromFacts', () => {
  it('returns anon before considering role facts when there is no session', () => {
    expect(resolveViewerRoleFromFacts(facts({ authenticated: false, hasActiveOps: true }))).toBe('anon')
  })

  it('gives active Ops membership precedence over merchant and creator facts', () => {
    expect(resolveViewerRoleFromFacts(facts({
      hasActiveOps: true,
      hasMerchantProfile: true,
      hasActiveCreator: true,
    }))).toBe('ops')
  })

  it('gives merchant profile precedence over active creator', () => {
    expect(resolveViewerRoleFromFacts(facts({
      hasMerchantProfile: true,
      hasActiveCreator: true,
    }))).toBe('merchant')
  })

  it('returns creator only for an active creator fact', () => {
    expect(resolveViewerRoleFromFacts(facts({ hasActiveCreator: true }))).toBe('creator')
  })

  it('returns creator-pending for an onboarding creator with a saved handle', () => {
    expect(resolveViewerRoleFromFacts(facts({ hasCreatorHandle: true }))).toBe('creator-pending')
  })

  it('keeps active creator precedence over a saved onboarding handle', () => {
    expect(resolveViewerRoleFromFacts(facts({
      hasActiveCreator: true,
      hasCreatorHandle: true,
    }))).toBe('creator')
  })

  it('falls back to traveler for an authenticated user without a higher role', () => {
    expect(resolveViewerRoleFromFacts(facts())).toBe('traveler')
  })
})
