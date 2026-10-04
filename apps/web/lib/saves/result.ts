import type { ValidationErrors } from '@/lib/admin/result'

/**
 * Why a save could not be completed, in terms the UI can actually act on.
 *
 * The save buttons need this because the two failures call for opposite
 * responses: an expired session should send the viewer to sign in and bring
 * them back to whatever they were saving, whereas a rejected write should leave
 * them where they are and let them retry. Without a discriminator the only way
 * to tell the two apart is to match on the English message text, which breaks
 * the moment that copy is reworded or translated.
 *
 * Named `SaveOutcome` rather than `SaveResult` because several admin components
 * already alias `SaveResult` locally to a plain `ActionResult<{ id: string }>`,
 * which carries no discriminator and means something different.
 */
export type SaveFailureReason =
  /** No session, or it expired between render and click — re-authenticate. */
  | 'auth'
  /** The write was rejected or the request failed — retrying is reasonable. */
  | 'failed'

export type SaveOutcomeFailure = {
  ok: false
  reason: SaveFailureReason
  errors: ValidationErrors
}

export type SaveOutcome<T extends Record<string, unknown> = Record<string, never>> =
  | ({ ok: true } & T)
  | SaveOutcomeFailure

/**
 * `errors` is carried through unchanged, so the shape stays readable by the
 * shared `ActionFailure` consumers; `reason` is purely additive.
 */
export const saveAuthFailure = (errors: ValidationErrors): SaveOutcomeFailure => ({
  ok: false,
  reason: 'auth',
  errors,
})

export const saveFailed = (message: string): SaveOutcomeFailure => ({
  ok: false,
  reason: 'failed',
  errors: { form: [message] },
})
