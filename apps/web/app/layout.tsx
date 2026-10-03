import { JetBrains_Mono, Fraunces, Inter } from 'next/font/google'

// Brand fonts wired via next/font so the @theme font tokens in globals.css resolve
// to real font files. The `<html>` element lives in app/[locale]/layout.tsx, so these
// variable classes are applied there.
//
// JetBrains Mono stays for studio k-mono; Fraunces/Inter are the canonical display/body faces (R1C).
export const jetBrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  variable: '--font-jetbrains-mono',
})

// Fraunces and Inter are variable fonts — no `weight` list needed; next/font
// serves the variable axis. Fraunces only covers Latin: CJK/Thai fall through
// to the system serif stacks declared in the --font-display token.
export const fraunces = Fraunces({
  subsets: ['latin'],
  variable: '--font-fraunces',
})

export const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
})

export const fontVariables = `${jetBrainsMono.variable} ${fraunces.variable} ${inter.variable}`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return children
}
