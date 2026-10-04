import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/seo/metadata'
import { ROBOTS_DISALLOW } from '@/lib/seo/routes'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{
      userAgent: '*',
      allow: '/',
      disallow: [...ROBOTS_DISALLOW],
    }],
    sitemap: `${SITE_URL}/sitemap/0.xml`,
  }
}
