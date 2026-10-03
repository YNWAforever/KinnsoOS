import { cleanHtml } from '@/lib/articles/sanitize'

export function TextBlock({
  id, title, subtitle, content, image, number,
}: {
  id: string; title?: string; subtitle?: string; content?: string; image?: string; number?: number | null
}) {
  return (
    <section id={id} className="scroll-mt-24 mb-8">
      {title && (
        <h2 className="text-2xl font-bold text-kinnso-ink mb-2 flex gap-2">
          {number != null && (
            <span className="text-orange" aria-hidden>{number}</span>
          )}
          <span>{title}</span>
        </h2>
      )}
      {subtitle && <p className="text-kinnso-muted mb-3">{subtitle}</p>}
      {image && <img src={image} alt={title ?? ''} loading="lazy" className="rounded-card mb-4 w-full" />}
      {content && (
        <div className="prose max-w-none" dangerouslySetInnerHTML={{ __html: cleanHtml(content) }} />
      )}
    </section>
  )
}
