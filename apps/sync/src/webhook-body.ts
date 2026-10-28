/** Webhooks contain an event and post ID, not article content. */
export const MAX_WEBHOOK_BODY_BYTES = 64 * 1024

/** Count actual bytes even when Content-Length is absent or understated. Never
 * retain the chunk that exceeds the bound, and stop consuming immediately. */
export async function readWebhookBody(request: Request): Promise<Uint8Array | null> {
  const declared = request.headers.get('content-length')
  if (declared && /^\d+$/.test(declared) && Number(declared) > MAX_WEBHOOK_BODY_BYTES) {
    void request.body?.cancel().catch(() => {})
    return null
  }
  const reader = request.body?.getReader()
  if (!reader) return new Uint8Array()
  const buffer = new Uint8Array(MAX_WEBHOOK_BODY_BYTES)
  let size = 0
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) return buffer.subarray(0, size)
      if (value.byteLength > MAX_WEBHOOK_BODY_BYTES - size) {
        // Cancellation can await a slow producer; the 413 must not wait for it.
        void reader.cancel().catch(() => {})
        return null
      }
      buffer.set(value, size)
      size += value.byteLength
    }
  } finally {
    reader.releaseLock()
  }
}
