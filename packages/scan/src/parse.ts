import { DnaSchema } from './schema'
import type { Dna } from './schema'

/**
 * True if the DNA has enough signal to be considered actionable.
 * Requires: non-empty bio AND at least one of niches or content_pillars.
 */
export function minViable(dna: Dna): boolean {
  return (
    dna.bio.trim().length > 0 &&
    (dna.niches.length > 0 || dna.content_pillars.length > 0)
  )
}

/**
 * Extract a JSON object from LLM text (tolerates code fences and whitespace),
 * validate it against DnaSchema, and compute the thin-signal flag.
 *
 * @throws Error with a descriptive message if no JSON is found, JSON is
 *   malformed, or the parsed value fails zod validation.
 */
export function parseDna(llmText: string): { dna: Dna; thin: boolean } {
  // Strip optional ```json or ``` fences
  let text = llmText.trim()
  const fenceMatch = text.match(/^```(?:json)?\s*([\s\S]*?)```\s*$/i)
  if (fenceMatch) {
    text = fenceMatch[1].trim()
  }

  // Find the first { ... } block in the text
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) {
    throw new Error(
      `parseDna: No JSON object found in LLM response. Received: ${text.slice(0, 200)}`
    )
  }

  const jsonStr = text.slice(start, end + 1)

  let raw: unknown
  try {
    raw = JSON.parse(jsonStr)
  } catch (err) {
    throw new Error(
      `parseDna: JSON.parse failed on extracted text. ${(err as Error).message}. Extract: ${jsonStr.slice(0, 200)}`
    )
  }

  // Throws ZodError with field-level messages if schema fails
  const dna = DnaSchema.parse(raw)
  const thin = !minViable(dna)

  return { dna, thin }
}
