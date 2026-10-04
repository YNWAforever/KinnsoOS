// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - server-only is a Next.js runtime marker; this workspace does not install its types.
import 'server-only'

export type SocialPlatform = 'instagram' | 'threads'
export type ConfidenceStatus = 'verified_signal' | 'needs_review' | 'unavailable'

export type SocialSnapshotInput = {
  platform: SocialPlatform
  handle?: string | null
  proofUrl?: string | null
}

export type SocialSnapshotResult = {
  platform: SocialPlatform
  handle: string | null
  proofUrl: string | null
  followerCount: number | null
  profileMediaUrl: string | null
  postMediaUrl: string | null
  engagementCount: number | null
  confidenceStatus: ConfidenceStatus
  rawResponseChecksum: string | null
}

export async function fetchSocialSnapshot(input: SocialSnapshotInput): Promise<SocialSnapshotResult> {
  return {
    platform: input.platform,
    handle: input.handle ?? null,
    proofUrl: input.proofUrl ?? null,
    followerCount: null,
    profileMediaUrl: null,
    postMediaUrl: null,
    engagementCount: null,
    confidenceStatus: 'unavailable',
    rawResponseChecksum: null,
  }
}
