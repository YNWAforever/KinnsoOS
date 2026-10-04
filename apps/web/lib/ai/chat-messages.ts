import type { UIMessage } from 'ai'

/**
 * `useChat` posts the ENTIRE conversation on every turn, so an attacker (or a
 * runaway client) can grow the payload unbounded and feed it straight to the
 * LLM — defeating per-caller request limits and driving cost/DoS. Every chat
 * route must bound both the message COUNT and the total text size before the
 * model is ever called.
 */
export type ChatMessageLimits = { maxMessages: number; maxTotalChars: number }

export type ChatMessagesResult =
  | { ok: true; messages: UIMessage[] }
  | { ok: false; reason: 'invalid' | 'too_large' }

/** Total length of every text part (plus any top-level string `content`). */
export function totalMessageChars(raw: readonly unknown[]): number {
  let total = 0
  for (const message of raw) {
    const parts = (message as {
      parts?: Array<{ text?: unknown; url?: unknown; data?: unknown }>
    } | null)?.parts
    if (Array.isArray(parts)) {
      for (const part of parts) {
        // `text` is the common case, but a file part carries its payload in
        // `url` (often a base64 data: URI) or `data` — charging only `text`
        // would let an oversized attachment through the cap untouched.
        for (const value of [part?.text, part?.url, part?.data]) {
          if (typeof value === 'string') total += value.length
        }
      }
    }
    // Defensively account for any top-level string `content` some clients send.
    const content = (message as { content?: unknown } | null)?.content
    if (typeof content === 'string') total += content.length
  }
  return total
}

export function validateChatMessages(raw: unknown, limits: ChatMessageLimits): ChatMessagesResult {
  if (!Array.isArray(raw) || raw.length === 0) return { ok: false, reason: 'invalid' }
  if (raw.length > limits.maxMessages) return { ok: false, reason: 'too_large' }
  if (totalMessageChars(raw) > limits.maxTotalChars) return { ok: false, reason: 'too_large' }
  return { ok: true, messages: raw as UIMessage[] }
}
