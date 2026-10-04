export function slugify(input: string): string {
  const slug = input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || 'guide'
}

/** Deterministic given a suffix; the action supplies a short random suffix for uniqueness. */
export function makeSlug(title: string, suffix: string): string {
  return `${slugify(title)}-${suffix}`
}
