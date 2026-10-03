export interface EnquiryLookupResult {
  data: Array<{ id: string }> | null
  error: unknown | null
}

type DeleteResult = { error?: unknown } | void

type DeleteOperation = (ids: readonly string[]) => PromiseLike<DeleteResult>

function errorText(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

export async function discoverOwnedEnquiryIds(
  lookup: (emails: readonly string[]) => PromiseLike<EnquiryLookupResult>,
  emails: readonly string[],
  trackedIds: readonly string[],
) {
  const result = await lookup(emails)
  if (result.error) throw result.error
  return [...new Set([...trackedIds, ...(result.data ?? []).map((row) => row.id)])]
}

export async function cleanupOwnedEnquiries(
  lookup: (emails: readonly string[]) => PromiseLike<EnquiryLookupResult>,
  emails: readonly string[],
  trackedIds: string[],
  deleteAuditRows: DeleteOperation,
  deleteEnquiries: DeleteOperation,
) {
  const errors: string[] = []
  try {
    const discovered = await discoverOwnedEnquiryIds(lookup, emails, trackedIds)
    trackedIds.splice(0, trackedIds.length, ...discovered)
  } catch (error) {
    errors.push(`discover run-owned enquiries: ${errorText(error)}`)
  }

  for (const [label, operation] of [
    ['enquiry audit rows', deleteAuditRows],
    ['enquiries', deleteEnquiries],
  ] as const) {
    if (!trackedIds.length) continue
    try {
      const result = await operation(trackedIds)
      if (result?.error) errors.push(`${label}: ${errorText(result.error)}`)
    } catch (error) {
      errors.push(`${label}: ${errorText(error)}`)
    }
  }

  return { errors }
}