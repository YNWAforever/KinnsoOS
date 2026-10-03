import { z } from 'zod'

export const PlatformEnum = z.enum(['instagram', 'youtube', 'threads'])
export type Platform = z.infer<typeof PlatformEnum>

export const PlatformSignalSchema = z.object({
  platform: PlatformEnum,
  followers: z.number().int().nonnegative().optional(),
  avg_engagement: z.number().nonnegative().optional(),
  post_cadence: z.string().optional(),
  verified: z.literal(false),
})
export type PlatformSignal = z.infer<typeof PlatformSignalSchema>

export const AudienceSchema = z.object({
  top_geos: z.array(z.string()).optional(),
  top_locales: z.array(z.string()).optional(),
})
export type Audience = z.infer<typeof AudienceSchema>

export const DnaSchema = z.object({
  bio: z.string(),
  niches: z.array(z.string()),
  content_pillars: z.array(z.string()),
  tone: z.array(z.string()),
  audience: AudienceSchema,
  platforms: z.array(PlatformSignalSchema),
  languages: z.array(z.string()),
})
export type Dna = z.infer<typeof DnaSchema>
