import type { Platform } from './schema'
import type { NormalizedSignals } from './types'

/** Normalize raw Instagram API payload (RapidAPI instagram-scraper-stable-api). */
export function normalizeInstagram(handle: string, raw: unknown): NormalizedSignals {
  const r = raw as {
    data: {
      user: {
        username?: string
        biography?: string
        edge_followed_by?: { count?: number }
        edge_media_to_timeline_edge?: {
          edges?: Array<{
            node: { edge_media_to_caption?: { edges?: Array<{ node: { text?: string } }> } }
          }>
        }
        engagement_rate?: number
      }
    }
  }
  const user = r?.data?.user ?? {}
  const postEdges = user.edge_media_to_timeline_edge?.edges ?? []
  const recentText = postEdges
    .map((e) => e.node.edge_media_to_caption?.edges?.[0]?.node?.text ?? '')
    .filter((t) => t.length > 0)

  return {
    platform: 'instagram',
    handle,
    followers: user.edge_followed_by?.count,
    avg_engagement: user.engagement_rate,
    bio: user.biography,
    recent_text: recentText,
  }
}

/** Normalize raw YouTube Data API v3 combined payload (channel + recentVideos). */
export function normalizeYouTube(handle: string, raw: unknown): NormalizedSignals {
  const r = raw as {
    channel: {
      snippet?: { description?: string }
      statistics?: { subscriberCount?: string }
    }
    recentVideos?: Array<{
      snippet?: { title?: string; description?: string }
    }>
    avg_engagement?: number
    post_cadence?: string
  }
  const channel = r?.channel ?? {}
  const stats = channel.statistics ?? {}
  const followers = stats.subscriberCount != null ? parseInt(stats.subscriberCount, 10) : undefined
  const bio = channel.snippet?.description

  const recentText = (r.recentVideos ?? [])
    .map((v) => {
      const title = v.snippet?.title ?? ''
      const desc = v.snippet?.description ?? ''
      return [title, desc].filter((s) => s.length > 0).join(' — ')
    })
    .filter((t) => t.length > 0)

  return {
    platform: 'youtube',
    handle,
    followers: Number.isNaN(followers) ? undefined : followers,
    avg_engagement: r.avg_engagement,
    post_cadence: r.post_cadence,
    bio,
    recent_text: recentText,
  }
}

/** Normalize raw Threads API payload (RapidAPI threads-scraper-api2). */
export function normalizeThreads(handle: string, raw: unknown): NormalizedSignals {
  const r = raw as {
    user?: {
      username?: string
      biography?: string
      follower_count?: number
    }
    threads?: Array<{
      post?: { caption?: { text?: string } }
    }>
    avg_engagement?: number
  }
  const user = r?.user ?? {}
  const recentText = (r.threads ?? [])
    .map((t) => t.post?.caption?.text ?? '')
    .filter((t) => t.length > 0)

  return {
    platform: 'threads',
    handle,
    followers: user.follower_count,
    avg_engagement: r.avg_engagement,
    bio: user.biography,
    recent_text: recentText,
  }
}

/** Dispatch to the correct normalizer based on platform. */
export function normalize(platform: Platform, handle: string, raw: unknown): NormalizedSignals {
  switch (platform) {
    case 'instagram':
      return normalizeInstagram(handle, raw)
    case 'youtube':
      return normalizeYouTube(handle, raw)
    case 'threads':
      return normalizeThreads(handle, raw)
  }
}
