import Link from 'next/link'
export function Pagination({
  basePath, page, total, perPage, labels,
}: {
  basePath: string; page: number; total: number; perPage: number
  labels: { prev: string; next: string }
}) {
  const pages = Math.max(1, Math.ceil(total / perPage))
  if (pages <= 1) return null
  const safePage = Math.min(Math.max(1, page), pages)
  const href = (p: number) => `${basePath}?page=${p}`
  return (
    <nav className="flex items-center justify-center gap-4 mt-8">
      {safePage > 1 && <Link href={href(safePage - 1)} className="text-orange">{labels.prev}</Link>}
      <span className="text-kinnso-muted" aria-current="page">{safePage} / {pages}</span>
      {safePage < pages && <Link href={href(safePage + 1)} className="text-orange">{labels.next}</Link>}
    </nav>
  )
}
