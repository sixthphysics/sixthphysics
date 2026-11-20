import type { MetadataRoute } from 'next';
import {
  SIXTHPHYSICS_SITE_URL,
  SYLLABUS_SEO_LIST,
  buildCanonicalUrl,
} from '@/lib/sixthphysics-web/seo';
import { loadSeoBankCounts } from '@/lib/sixthphysics-web/seo-counts.server';

export const dynamic = 'force-static';

export default function sitemap(): MetadataRoute.Sitemap {
  const { generatedAt } = loadSeoBankCounts();
  const lastModified = generatedAt ? new Date(generatedAt) : new Date();

  return [
    {
      url: `${SIXTHPHYSICS_SITE_URL}/`,
      lastModified,
      changeFrequency: 'weekly',
      priority: 1,
    },
    ...SYLLABUS_SEO_LIST.map((cfg) => ({
      url: buildCanonicalUrl(cfg.path),
      lastModified,
      changeFrequency: 'weekly' as const,
      priority: 0.95,
    })),
  ];
}
