import { ImageResponse } from 'next/og'
import { getGuideBySlug } from '@/lib/guides/queries'
import { loadOgFonts } from '@/lib/seo/og/fonts'
import { GuideCard, DefaultCard, OG_SIZE } from '@/lib/seo/og/card'
import { truncate, loadRemoteImage } from '@/lib/seo/og/data'
import { isApprovedEntityMediaUrl } from '@/lib/media/entity-media'

export const alt = 'KINNSO guide'
export const size = OG_SIZE
export const contentType = 'image/png'

export default async function Image({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { slug } = await params
  const fonts = await loadOgFonts()
  const fontOpt = fonts.length ? { fonts } : {}
  try {
    const guide = await getGuideBySlug(slug)
    // Fetch the cover ourselves (SSRF-guarded + timed out) and inline it as a data URI so
    // satori never makes its own uncatchable, stream-time network fetch that could 500 the route.
    const approvedCover = guide && isApprovedEntityMediaUrl(guide.cover) ? guide.cover : null
    const cover = approvedCover ? await loadRemoteImage(approvedCover) : undefined
    const card = guide
      ? <GuideCard title={truncate(guide.title, 70)} city={guide.city} handle={guide.creatorHandle} cover={cover} />
      : <DefaultCard title="Guide" subtitle="KINNSO" />
    return new ImageResponse(card, { ...OG_SIZE, ...fontOpt })
  } catch {
    return new ImageResponse(<DefaultCard title="Guide" subtitle="KINNSO" />, { ...OG_SIZE, ...fontOpt })
  }
}
