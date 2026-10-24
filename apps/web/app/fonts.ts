import localFont from 'next/font/local'

// Shared font declarations live outside route modules so layout exports remain valid.
// The font files stay beside this module under app/fonts.
const jetBrainsMono = localFont({
  src: './fonts/JetBrainsMono-latin-wght.woff2',
  weight: '400 800',
  variable: '--font-jetbrains-mono',
})

// CJK/Thai fall through to the system serif stacks in the display token.
// The fallback is declared in globals.css instead of measured from the font's
// Black default instance, which would oversize it.
const fraunces = localFont({
  src: './fonts/Fraunces-latin-wght.woff2',
  weight: '100 900',
  variable: '--font-fraunces',
  adjustFontFallback: false,
  fallback: ['Fraunces Fallback'],
})

const inter = localFont({
  src: './fonts/Inter-latin-wght.woff2',
  weight: '100 900',
  variable: '--font-inter',
})

export const fontVariables = `${jetBrainsMono.variable} ${fraunces.variable} ${inter.variable}`
