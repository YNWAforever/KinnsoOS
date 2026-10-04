import { ImageResponse } from 'next/og'
import { getCreatorByHandle } from '@/lib/creators/queries'
import { loadOgFonts } from '@/lib/seo/og/fonts'
import { CreatorCard, DefaultCard, OG_SIZE } from '@/lib/seo/og/card'
import { pickNiches } from '@/lib/seo/og/data'

export const alt = 'KINNSO creator'
export const size = OG_SIZE
export const contentType = 'image/png'

export default async function Image({ params }: { params: Promise<{ locale: string; handle: string }> }) {
  const { handle } = await params
  const fonts = await loadOgFonts()
  const fontOpt = fonts.length ? { fonts } : {}
  try {
    const creator = await getCreatorByHandle(handle)
    const card = creator
      ? <CreatorCard name={creator.name} handle={creator.handle} niches={pickNiches(creator.profile.niches)} guideCount={creator.guides.length} />
      : <DefaultCard title="Creator" subtitle="KINNSO" />
    return new ImageResponse(card, { ...OG_SIZE, ...fontOpt })
  } catch {
    return new ImageResponse(<DefaultCard title="Creator" subtitle="KINNSO" />, { ...OG_SIZE, ...fontOpt })
  }
}
