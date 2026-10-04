import type { MetadataRoute } from 'next';
// No routes are indexable before K25. Original public content stays on its canonical host.
export default function sitemap(): MetadataRoute.Sitemap { return []; }
