export type ViewerRole = 'anon' | 'creator' | 'creator-pending' | 'merchant' | 'traveler' | 'ops'

export type ViewerRoleFacts = {
  authenticated: boolean
  hasActiveOps: boolean
  hasMerchantProfile: boolean
  hasActiveCreator: boolean
  hasCreatorHandle: boolean
}

export function resolveViewerRoleFromFacts(facts: ViewerRoleFacts): ViewerRole {
  if (!facts.authenticated) return 'anon'
  if (facts.hasActiveOps) return 'ops'
  if (facts.hasMerchantProfile) return 'merchant'
  if (facts.hasActiveCreator) return 'creator'
  if (facts.hasCreatorHandle) return 'creator-pending'
  return 'traveler'
}
