export type KinnsoActionResult = void | {
  ok: boolean
  errors?: Record<string, string[]>
}

export const actionErrorMessage = (result: KinnsoActionResult) => {
  if (!result || result.ok) return null

  const [message] = Object.values(result.errors ?? {}).flat()
  return message ?? 'Action could not be completed'
}

export const actionSucceeded = (result: KinnsoActionResult) => Boolean(result?.ok)
