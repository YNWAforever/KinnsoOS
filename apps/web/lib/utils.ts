import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Builds a safe double-quoted CSS url() token from an arbitrary URL string.
// Percent-encodes the URL, then backslash-escapes any backslash or double-quote
// so the result is safe to interpolate inside `url("...")`. encodeURI leaves
// ( ) ' unescaped, so percent-encode those explicitly — they are exactly the
// characters that can break out of a CSS url("...") token.
export function cssUrl(url: string) {
  const escaped = encodeURI(url)
    .replace(/\(/g, '%28')
    .replace(/\)/g, '%29')
    .replace(/'/g, '%27')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
  return `url("${escaped}")`
}
