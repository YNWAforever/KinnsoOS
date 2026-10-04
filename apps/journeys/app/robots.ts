import type { MetadataRoute } from 'next';
export default function robots(): MetadataRoute.Robots {
  // Crawl denial complements page-level noindex; neither opens on production env.
  return {rules:{userAgent:'*',disallow:'/'}};
}
