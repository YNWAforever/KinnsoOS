/** Best-effort Vercel on-demand revalidation (non-fatal — ISR TTL is the backstop). */
export async function revalidate(paths: string[]): Promise<void> {
  const base = process.env.REVALIDATE_BASE_URL
  const secret = process.env.REVALIDATE_SECRET
  if (!base || !secret) return
  await Promise.allSettled(
    paths.map((p) =>
      fetch(`${base}/api/revalidate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-revalidate-secret': secret },
        body: JSON.stringify({ path: p }),
      }),
    ),
  )
}
