import { Lightbox } from '@/components/Lightbox'
export function MultipleImage({
  id, images,
}: { id: string; images?: Array<{ thumbnail?: string; original?: string; desc?: string }> }) {
  const imgs = (images ?? []).filter((im) => im.thumbnail || im.original)
  if (imgs.length === 0) return null
  return (
    <section id={id} className="scroll-mt-24 mb-8">
      <Lightbox images={imgs} />
    </section>
  )
}
