import { parseBlocks, type BaseBlock } from '@/lib/articles/blocks'
import { TextBlock } from '@/components/blocks/TextBlock'
import { OfferBox } from '@/components/blocks/OfferBox'
import { InfoBox } from '@/components/blocks/InfoBox'
import { MapBlock } from '@/components/blocks/MapBlock'
import { DetailBox } from '@/components/blocks/DetailBox'
import { MultipleImage } from '@/components/blocks/MultipleImage'

export function ArticleBlockRenderer({ blocks }: { blocks: unknown }) {
  const list = parseBlocks(blocks)
  const numberByBlockId = new Map<string, number>()
  let n = 0
  for (const b of list) {
    if (b.type === 'number-box') { n++; numberByBlockId.set(b.id, n) }
  }
  return (
    <>
      {list.map((b: BaseBlock) => {
        switch (b.type) {
          case 'text':
            return <TextBlock key={b.id} id={b.id} title={b.title as string} subtitle={b.subtitle as string}
                              content={b.content as string} image={b.image as string} />
          case 'number-box':
            return <TextBlock key={b.id} id={b.id} title={b.title as string} subtitle={b.subtitle as string}
                              content={b.content as string} image={b.image as string}
                              number={numberByBlockId.get(b.id) ?? null} />
          case 'offer-box':
            return <OfferBox key={b.id} id={b.id} title={b.title as string} content={b.content as string} />
          case 'info-box':
            return <InfoBox key={b.id} id={b.id} content={b.content as string} />
          case 'map':
            return <MapBlock key={b.id} id={b.id} content={b.content as string} />
          case 'detail-box':
            return <DetailBox key={b.id} id={b.id} title={b.title as string} time={b.time as string}
                              price={b.price as string} phone={b.phone as string}
                              address={b.address as { label?: string; link?: string }}
                              website={b.website as { label?: string; link?: string }} />
          case 'multiple-image':
            return <MultipleImage key={b.id} id={b.id}
                              images={b.images as Array<{ thumbnail?: string; original?: string; desc?: string }>} />
          default:
            return null   // unknown types render nothing (parity with legacy)
        }
      })}
    </>
  )
}
