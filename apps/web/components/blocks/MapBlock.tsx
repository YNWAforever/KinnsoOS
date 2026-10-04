import { cleanHtml } from '@/lib/articles/sanitize'
export function MapBlock({ id, content }: { id: string; content?: string }) {
  return (
    <section id={id} className="scroll-mt-24 mb-8">
      {content && <div className="rounded-card overflow-hidden" dangerouslySetInnerHTML={{ __html: cleanHtml(content) }} />}
    </section>
  )
}
