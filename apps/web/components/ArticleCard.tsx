import Link from 'next/link'
import { EntityMedia } from '@/components/kinnso/media/EntityMedia'
export function ArticleCard({
  href, title, thumbnail, summary,
}: { href: string; title: string; thumbnail?: string; summary?: string | null }) {
  return (
    <Link href={href} aria-label={title} className="block rounded-card overflow-hidden bg-white shadow-sm hover:shadow-md transition">
      <EntityMedia src={thumbnail} title={title} sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw" className="h-44 w-full" />
      <div className="p-4">
        <h3 className="font-semibold text-kinnso-ink line-clamp-2">{title}</h3>
        {summary && <p className="text-sm text-kinnso-muted mt-1 line-clamp-2">{summary}</p>}
        <span aria-hidden="true" className="mt-2 inline-block text-sm font-bold text-kinnso-orange">→</span>
      </div>
    </Link>
  )
}
