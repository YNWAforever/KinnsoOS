import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (relativePath: string) =>
  readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8')

describe('R7.3 public route media contracts', () => {
  it('guards guide and experience OG fetches with the approved-media predicate', () => {
    const guideOg = read('app/[locale]/g/[slug]/opengraph-image.tsx')
    const experienceOg = read('app/[locale]/experiences/[slug]/opengraph-image.tsx')

    expect(guideOg).toContain('isApprovedEntityMediaUrl(guide.cover)')
    expect(guideOg).toContain('loadRemoteImage(approvedCover)')
    expect(guideOg).not.toContain('loadRemoteImage(guide.cover)')
    expect(experienceOg).toContain('isApprovedEntityMediaUrl(experience.coverUrl)')
    expect(experienceOg).toContain('loadRemoteImage(approvedCover)')
    expect(experienceOg).not.toContain('loadRemoteImage(experience.coverUrl)')
  })

  it('filters article metadata, JSON-LD, and the detail hero', () => {
    const article = read('app/[locale]/articles/[category]/[url]/page.tsx')

    expect(article).toContain('approvedOgImage')
    expect(article).toContain('approvedThumbnails')
    expect(article).toContain('<EntityMedia')
    expect(article).not.toContain('<img src={a.thumbnails[0]}')
    expect(article).not.toContain('images: a.thumbnails')
  })

  it('filters guide and experience JSON-LD media', () => {
    const guide = read('app/[locale]/g/[slug]/page.tsx')
    const experience = read('app/[locale]/experiences/[slug]/page.tsx')

    expect(guide).toContain('images: approvedCover ? [approvedCover] : []')
    expect(experience).toContain('image: approvedCover')
  })
})
