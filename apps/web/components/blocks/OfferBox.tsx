import { cleanHtml } from '@/lib/articles/sanitize'
export function OfferBox({ id, title, content }: { id: string; title?: string; content?: string }) {
  return (
    <section id={id} className="scroll-mt-24 mb-8 rounded-card bg-kinnso-cream2 p-5">
      {title && <h3 className="text-xl font-bold text-kinnso-orangeDark mb-2">{title}</h3>}
      {content && <div className="prose max-w-none" dangerouslySetInnerHTML={{ __html: cleanHtml(content) }} />}
    </section>
  )
}
