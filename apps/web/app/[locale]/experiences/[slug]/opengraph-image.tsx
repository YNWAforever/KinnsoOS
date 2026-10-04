import { ImageResponse } from 'next/og'
import { getExperienceBySlug } from '@/lib/experiences/public-queries'
import { loadOgFonts } from '@/lib/seo/og/fonts'
import { ExperienceCard, DefaultCard, OG_SIZE } from '@/lib/seo/og/card'
import { truncate, loadRemoteImage } from '@/lib/seo/og/data'
import { isApprovedEntityMediaUrl } from '@/lib/media/entity-media'

export const alt = 'KINNSO experience'
export const size = OG_SIZE
export const contentType = 'image/png'

export default async function Image({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { slug } = await params
  const fonts = await loadOgFonts()
  const fontOpt = fonts.length ? { fonts } : {}
  try {
    const experience = await getExperienceBySlug(slug)
    const approvedCover = experience && isApprovedEntityMediaUrl(experience.coverUrl) ? experience.coverUrl : null
    const cover = approvedCover ? await loadRemoteImage(approvedCover) : undefined
    const card = experience
      ? <ExperienceCard title={truncate(experience.title, 70)} city={experience.city} merchantName={experience.merchant.companyName} cover={cover} />
      : <DefaultCard title="Experience" subtitle="KINNSO" />
    return new ImageResponse(card, { ...OG_SIZE, ...fontOpt })
  } catch {
    return new ImageResponse(<DefaultCard title="Experience" subtitle="KINNSO" />, { ...OG_SIZE, ...fontOpt })
  }
}
