import type { MetadataRoute } from 'next';
import { SIXTHPHYSICS_SITE_URL } from '@/lib/sixthphysics-web/seo';

export const dynamic = 'force-static';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/review/', '/demo/', '/settings/'],
      },
    ],
    sitemap: `${SIXTHPHYSICS_SITE_URL}/sitemap.xml`,
    host: SIXTHPHYSICS_SITE_URL,
  };
}
