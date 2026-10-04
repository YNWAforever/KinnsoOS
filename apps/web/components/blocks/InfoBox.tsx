import { cleanHtml } from '@/lib/articles/sanitize'
export function InfoBox({ id, content }: { id: string; content?: string }) {
  return (
    <aside id={id} className="scroll-mt-24 mb-8 rounded-card border-l-4 border-info bg-kinnso-cream p-4">
      {content && <div className="prose max-w-none" dangerouslySetInnerHTML={{ __html: cleanHtml(content) }} />}
    </aside>
  )
}
