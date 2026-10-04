export const RENDERED_TYPES = [
  'text', 'number-box', 'offer-box', 'detail-box', 'info-box', 'map', 'multiple-image',
] as const
export type RenderedType = (typeof RENDERED_TYPES)[number]

export interface BaseBlock { type: string; id: string; [k: string]: unknown }
export interface TextBlock extends BaseBlock { type: 'text' | 'number-box'; title?: string; subtitle?: string; content?: string; image?: string }
export interface OfferBlock extends BaseBlock { type: 'offer-box'; title?: string; content?: string }
export interface HtmlBlock extends BaseBlock { type: 'info-box' | 'map'; content?: string }
export interface DetailBlock extends BaseBlock {
  type: 'detail-box'; title?: string; time?: string; price?: string; phone?: string
  address?: { label?: string; link?: string }; website?: { label?: string; link?: string }
}
export interface ImageBlock extends BaseBlock {
  type: 'multiple-image'; images?: Array<{ thumbnail?: string; original?: string; desc?: string }>
}

/** content is jsonb (already an array) but tolerate string/null from older rows. */
export function parseBlocks(content: unknown): BaseBlock[] {
  let arr: unknown = content
  if (typeof content === 'string') {
    try { arr = JSON.parse(content) } catch { return [] }
  }
  if (!Array.isArray(arr)) return []
  return arr.filter((b): b is BaseBlock =>
    !!b && typeof b === 'object' && typeof (b as BaseBlock).type === 'string' && typeof (b as BaseBlock).id === 'string')
}

const isHeading = (b: BaseBlock): b is TextBlock =>
  (b.type === 'text' || b.type === 'number-box') &&
  typeof b.title === 'string' && b.title.length > 0 && b.title !== 'app.summary'

export function getPostDirectory(content: unknown): Array<{ id: string; title: string }> {
  return parseBlocks(content).filter(isHeading).map((b) => ({ id: b.id, title: b.title as string }))
}

/** 1-based position of a number-box among number-box blocks, or null if not one. */
export function numberBoxIndex(content: unknown, id: string): number | null {
  let n = 0
  for (const b of parseBlocks(content)) {
    if (b.type === 'number-box') { n++; if (b.id === id) return n }
  }
  return null
}
