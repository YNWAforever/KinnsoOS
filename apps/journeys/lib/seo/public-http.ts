export type PublicRowsOptions = {
  maxBytes?: number;
  unavailableCode?: string;
  schemaCode?: string;
};

/** Anonymous JSON-array transport shared by server-only public readers. */
export async function readPublicRows(
  url: URL,
  key: string,
  transport: typeof fetch,
  body?: Record<string, unknown>,
  options: PublicRowsOptions = {},
): Promise<unknown[]> {
  const unavailableCode = options.unavailableCode ?? 'public_unavailable';
  const schemaCode = options.schemaCode ?? 'public_schema';
  const maxBytes = options.maxBytes ?? 2_000_000;
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > 2_000_000) {
    throw new Error(schemaCode);
  }

  let response: Response;
  try {
    response = await transport(url, {
      method: body ? 'POST' : 'GET',
      headers: {
        apikey: key,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(8_000),
    });
  } catch {
    throw new Error(unavailableCode);
  }
  if (!response.ok) throw new Error(unavailableCode);

  const reader = response.body?.getReader();
  if (!reader) throw new Error(schemaCode);
  let size = 0;
  let source = '';
  const decoder = new TextDecoder('utf-8', { fatal: true });
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.length;
      if (size > maxBytes) throw new Error(schemaCode);
      source += decoder.decode(chunk.value, { stream: true });
    }
    source += decoder.decode();
    const value: unknown = JSON.parse(source);
    if (!Array.isArray(value)) throw new Error(schemaCode);
    return value;
  } catch {
    await reader.cancel().catch(() => {});
    throw new Error(schemaCode);
  }
}
