import type { NormalizedSignals, LlmMessage } from './types'

const SYSTEM_PROMPT = `You are a creator-intelligence assistant.
Given public social media signals for one creator, return ONLY a JSON object matching this exact schema — no markdown, no explanation, no code fences:

{
  "bio": "<string — a factual, public-derived one-sentence bio>",
  "niches": ["<topic>", ...],
  "content_pillars": ["<recurring content theme>", ...],
  "tone": ["<tone descriptor>", ...],
  "audience": {
    "top_geos": ["<ISO country code>", ...],
    "top_locales": ["<BCP-47 locale>", ...]
  },
  "platforms": [
    {
      "platform": "<instagram|youtube|threads>",
      "followers": <number or omit>,
      "avg_engagement": <number or omit>,
      "post_cadence": "<string or omit>",
      "verified": false
    }
  ],
  "languages": ["<BCP-47>", ...]
}

Rules:
- Use ONLY public information provided below. Do not fabricate statistics.
- "verified" MUST always be false (v1 public-fetch only).
- If a field cannot be determined, use an empty array [] or omit optional fields.
- Output ONLY the JSON object. No other text.`

function formatSignal(s: NormalizedSignals): string {
  const lines: string[] = [
    `Platform: ${s.platform}`,
    `Handle: ${s.handle}`,
  ]
  if (s.bio) lines.push(`Bio: ${s.bio}`)
  if (s.followers != null) lines.push(`Followers: ${s.followers}`)
  if (s.avg_engagement != null) lines.push(`Avg engagement rate: ${s.avg_engagement}%`)
  if (s.post_cadence) lines.push(`Post cadence: ${s.post_cadence}`)
  if (s.recent_text.length > 0) {
    lines.push('Recent posts (public captions / titles):')
    s.recent_text.forEach((t, i) => lines.push(`  ${i + 1}. ${t}`))
  }
  return lines.join('\n')
}

/**
 * Build the LLM prompt messages from one or more normalized platform signals.
 * Returns [systemMessage, userMessage].
 */
export function buildPrompt(signals: NormalizedSignals[]): LlmMessage[] {
  const userContent =
    signals.length === 0
      ? 'No platform signals provided. Return an empty DNA object with empty arrays and an empty bio string.'
      : signals.map((s, i) => `--- Signal ${i + 1} ---\n${formatSignal(s)}`).join('\n\n')

  return [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userContent },
  ]
}
