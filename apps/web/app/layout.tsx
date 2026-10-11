import localFont from 'next/font/local'

// Brand fonts wired via next/font so the @theme font tokens in globals.css resolve
// to real font files. The `<html>` element lives in app/[locale]/layout.tsx, so these
// variable classes are applied there.
//
// Self-hosted (app/fonts/README.md) so builds never fetch from Google Fonts. Each
// file is the Latin + Latin Extended variable font Google Fonts served before.
//
// JetBrains Mono stays for studio k-mono; Fraunces/Inter are the canonical display/body faces (R1C).
export const jetBrainsMono = localFont({
  src: './fonts/JetBrainsMono-latin-wght.woff2',
  weight: '400 800',
  variable: '--font-jetbrains-mono',
})

// Variable weight axes. Fraunces only covers Latin: CJK/Thai fall through to the
// system serif stacks declared in the --font-display token. Its metric-matched
// Times New Roman fallback is declared in globals.css: computing it from this file
// would measure the Black default instance and oversize the fallback.
export const fraunces = localFont({
  src: './fonts/Fraunces-latin-wght.woff2',
  weight: '100 900',
  variable: '--font-fraunces',
  adjustFontFallback: false,
  fallback: ['Fraunces Fallback'],
})

export const inter = localFont({
  src: './fonts/Inter-latin-wght.woff2',
  weight: '100 900',
  variable: '--font-inter',
})

export const fontVariables = `${jetBrainsMono.variable} ${fraunces.variable} ${inter.variable}`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return children
}
