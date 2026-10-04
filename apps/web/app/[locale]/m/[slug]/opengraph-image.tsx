import { ImageResponse } from 'next/og'
import { getMerchantBySlug } from '@/lib/merchants/public-queries'
import { loadOgFonts } from '@/lib/seo/og/fonts'
import { MerchantCard, DefaultCard, OG_SIZE } from '@/lib/seo/og/card'

export const alt = 'KINNSO merchant'
export const size = OG_SIZE
export const contentType = 'image/png'

export default async function Image({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { slug } = await params
  const fonts = await loadOgFonts()
  const fontOpt = fonts.length ? { fonts } : {}
  try {
    const merchant = await getMerchantBySlug(slug)
    const card = merchant
      ? <MerchantCard name={merchant.companyName} tagline={merchant.tagline} city={merchant.city} />
      : <DefaultCard title="Merchant" subtitle="KINNSO" />
    return new ImageResponse(card, { ...OG_SIZE, ...fontOpt })
  } catch {
    return new ImageResponse(<DefaultCard title="Merchant" subtitle="KINNSO" />, { ...OG_SIZE, ...fontOpt })
  }
}
