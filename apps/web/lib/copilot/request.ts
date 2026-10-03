import { validateChatMessages, type ChatMessagesResult } from '@/lib/ai/chat-messages'

// Caps live here (per-surface); the shared implementation is in
// lib/ai/chat-messages.ts so every chat route bounds payloads the same way.
export const MAX_COPILOT_MESSAGES = 100
export const MAX_COPILOT_TOTAL_CHARS = 50_000

export type CopilotMessagesResult = ChatMessagesResult

export function validateCopilotMessages(raw: unknown): CopilotMessagesResult {
  return validateChatMessages(raw, {
    maxMessages: MAX_COPILOT_MESSAGES,
    maxTotalChars: MAX_COPILOT_TOTAL_CHARS,
  })
}
