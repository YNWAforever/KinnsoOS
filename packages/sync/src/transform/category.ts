export type Category = 'destination' | 'dining' | 'shopping'
const VALID: Category[] = ['destination', 'dining', 'shopping']

export function primaryCategory(
  weights: Array<{ category_slug: string; weight: number | null }>,
): { category: Category; defaulted: boolean } {
  const sorted = [...weights].sort(
    (a, b) => (b.weight ?? 0) - (a.weight ?? 0) || a.category_slug.localeCompare(b.category_slug),
  )
  const top = sorted.find((w) => (VALID as string[]).includes(w.category_slug))
  if (top) return { category: top.category_slug as Category, defaulted: false }
  return { category: 'destination', defaulted: true } // promotion / none / orphan
}
