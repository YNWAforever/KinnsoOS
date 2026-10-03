export type ValidationErrors = Record<string, string[]>
export type ActionFailure = { ok: false; errors: ValidationErrors }
export type ActionResult<T extends Record<string, unknown> = Record<string, never>> =
  | ({ ok: true } & T)
  | ActionFailure

export const formError = (message: string): ActionFailure => ({ ok: false, errors: { form: [message] } })
