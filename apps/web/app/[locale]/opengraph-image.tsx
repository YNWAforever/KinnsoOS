import { ImageResponse } from 'next/og'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { isLocale, DEFAULT_LOCALE, type Locale } from '@/lib/i18n/config'
import { loadOgFonts } from '@/lib/seo/og/fonts'
import { DefaultCard, OG_SIZE } from '@/lib/seo/og/card'

export const alt = 'KINNSO — Travel creators, real missions'
export const size = OG_SIZE
export const contentType = 'image/png'

export default async function Image({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  const loc: Locale = isLocale(locale) ? (locale as Locale) : DEFAULT_LOCALE
  const dict = await getDictionary(loc)
  const fonts = await loadOgFonts()
  const fontOpt = fonts.length ? { fonts } : {}
  return new ImageResponse(
    <DefaultCard title={dict.seo.brandTitle} subtitle={dict.seo.home.description} />,
    { ...OG_SIZE, ...fontOpt },
  )
}
