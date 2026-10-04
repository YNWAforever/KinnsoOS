/**
 * Shared plumbing for the OUTBOUND (third-party) side of the worker.
 *
 * Everything here exists because apps/scan runs every job in-process on a single
 * container: a stalled socket or an oversized response body does not fail one
 * job, it starves or OOMs the whole worker and takes every other in-flight job
 * with it. So each upstream call must be bounded in BOTH dimensions — wall time
 * (`AbortSignal.timeout`, applied per attempt by `fetchWithRetry`) and bytes
 * (the capped readers below).
 */

// ---------------------------------------------------------------------------
// Per-upstream budgets
// ---------------------------------------------------------------------------

/**
 * Per-attempt wall-clock budgets. These are per ATTEMPT, not per call: the
 * retry loop multiplies them by up to `MAX_RETRIES + 1`, and `JOB_STALE_AFTER_MS`
 * in policy.ts is derived from the resulting worst-case job runtime — keep the
 * two in sync if these change.
 *
 * The LLM budget is deliberately far larger: it is a generation call, and
 * starving it would turn slow-but-successful analyses into hard failures.
 */
export const RAPIDAPI_TIMEOUT_MS = 15_000
export const YOUTUBE_TIMEOUT_MS = 10_000
export const LLM_TIMEOUT_MS = 60_000

/**
 * Byte ceilings per upstream. Generous relative to real payloads (an IG posts
 * page is tens of KiB, a YouTube channels response a few KiB, an LLM completion
 * well under 100 KiB) — they are a backstop against a hostile or broken
 * upstream streaming forever, not a tuning knob.
 */
export const MAX_RAPIDAPI_BODY_BYTES = 2 * 1024 * 1024
export const MAX_YOUTUBE_BODY_BYTES = 1 * 1024 * 1024
export const MAX_LLM_BODY_BYTES = 1 * 1024 * 1024
/** Provider error payloads only need enough bytes to be diagnosable. */
export const MAX_LLM_ERROR_BODY_BYTES = 8 * 1024

// ---------------------------------------------------------------------------
// Body handling
// ---------------------------------------------------------------------------

export class ResponseTooLargeError extends Error {
  constructor(limitBytes: number) {
    super(`response body exceeded ${limitBytes} bytes`)
    this.name = 'ResponseTooLargeError'
  }
}

/**
 * Releases a response whose body we are never going to read.
 *
 * An unconsumed, uncancelled body keeps its socket checked out of the undici
 * pool until the peer or a keep-alive timer closes it, so abandoning bodies on
 * the retry/early-return paths slowly strangles the worker's own connection
 * capacity. Always safe to call — a body-less response is a no-op.
 */
export async function discardBody(res: Pick<Response, 'body'>): Promise<void> {
  await res.body?.cancel().catch(() => {})
}

/** True when the response exposes a real readable stream we can meter. */
function isStreamable(res: Response): boolean {
  return Boolean(res.body) && typeof res.body?.getReader === 'function'
}

/**
 * Reads a response body, aborting as soon as it exceeds `limitBytes` rather
 * than after the fact — `res.json()` / `res.text()` buffer the entire body into
 * memory first, which is exactly the failure mode being prevented.
 */
async function readCappedBytes(res: Response, limitBytes: number): Promise<Uint8Array> {
  // Trust a declared content-length only to reject early; a lying or absent
  // header still gets caught by the streaming counter below.
  const declared = Number(res.headers?.get('content-length') ?? '')
  if (Number.isFinite(declared) && declared > limitBytes) {
    await discardBody(res)
    throw new ResponseTooLargeError(limitBytes)
  }

  const reader = res.body!.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > limitBytes) {
      await reader.cancel().catch(() => {})
      throw new ResponseTooLargeError(limitBytes)
    }
    chunks.push(value)
  }

  const out = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.byteLength
  }
  return out
}

/** `res.text()` with a hard byte ceiling. */
export async function readCappedText(res: Response, limitBytes: number): Promise<string> {
  if (!isStreamable(res)) return await res.text()
  return new TextDecoder().decode(await readCappedBytes(res, limitBytes))
}

/** `res.json()` with a hard byte ceiling. */
export async function readCappedJson<T>(res: Response, limitBytes: number): Promise<T> {
  if (!isStreamable(res)) return (await res.json()) as T
  return JSON.parse(new TextDecoder().decode(await readCappedBytes(res, limitBytes))) as T
}
