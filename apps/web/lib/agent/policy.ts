/** Fixed cheap model for all traveller-agent requests — no tier policy needed,
 *  travellers have no tier (design doc D-R4-3). Same slug the copilot uses for its
 *  seed tier. */
export const AGENT_MODEL = 'anthropic/claude-haiku-4.5'

/** IP rate limit for POST /api/agent — a dedicated bucket (agent_rate_limits), never
 *  shared with the checkout rate limiter (plan PD note, Task 3). 20 requests/hour is
 *  generous enough for a real back-and-forth conversation while bounding abuse cost. */
export const AGENT_RATE_LIMIT = { maxRequests: 20, windowSeconds: 3600 } as const
