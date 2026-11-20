import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import manifest from '@/app/manifest';
import robots from '@/app/robots';
import sitemap from '@/app/sitemap';
import { SyllabusLandingPage } from '@/components/sixthphysics/syllabus-landing-page';
import {
  SIXTHPHYSICS_SITE_URL,
  SYLLABUS_SEO_CONFIGS,
  SYLLABUS_SEO_LIST,
  buildRootJsonLd,
  buildSyllabusJsonLd,
  buildSyllabusMetadata,
} from '@/lib/sixthphysics-web/seo';

describe('SixthPhysics SEO metadata, routes, and structured data', () => {
  it('emits crawlable robots.txt pointing to the canonical sitemap', () => {
    const result = robots();
    expect(result.sitemap).toBe(`${SIXTHPHYSICS_SITE_URL}/sitemap.xml`);
    expect(result.host).toBe(SIXTHPHYSICS_SITE_URL);
    const rules = Array.isArray(result.rules) ? result.rules : [result.rules];
    expect(rules[0]).toMatchObject({
      userAgent: '*',
      allow: '/',
    });
  });

  it('emits sitemap.xml covering the home page and all three syllabus hubs', () => {
    const entries = sitemap();
    const urls = entries.map((entry) => entry.url);
    expect(urls).toEqual([
      `${SIXTHPHYSICS_SITE_URL}/`,
      `${SIXTHPHYSICS_SITE_URL}/ib-physics/`,
      `${SIXTHPHYSICS_SITE_URL}/a-level-physics/`,
      `${SIXTHPHYSICS_SITE_URL}/ncuk-ify-physics/`,
    ]);
    for (const entry of entries) {
      expect(entry.priority).toBeGreaterThanOrEqual(0.9);
      expect(entry.lastModified).toBeInstanceOf(Date);
    }
  });

  it('emits a valid web app manifest with vector and fallback icons', () => {
    const result = manifest();
    expect(result.short_name).toBe('SixthPhysics');
    expect(result.start_url).toBe('/');
    expect(result.icons?.some((icon) => icon.src === '/icon.svg')).toBe(true);
  });

  it('builds root schema.org JSON-LD graph linking GitHub, Hugging Face, and all syllabi', () => {
    const jsonLd = buildRootJsonLd(7643);
    expect(jsonLd['@context']).toBe('https://schema.org');
    const types = jsonLd['@graph'].map((node) => node['@type']);
    expect(types).toEqual([
      'Organization',
      'WebSite',
      'WebApplication',
      'ItemList',
    ]);
    const webApp = jsonLd['@graph'][2] as {
      isAccessibleForFree: boolean;
      offers: { price: string };
      description: string;
    };
    expect(webApp.isAccessibleForFree).toBe(true);
    expect(webApp.offers.price).toBe('0');
    expect(webApp.description).toContain('7,643');
  });

  it.each(SYLLABUS_SEO_LIST)(
    'builds valid metadata, JSON-LD, and crawlable static HTML for $slug',
    (cfg) => {
      const meta = buildSyllabusMetadata(cfg.syllabus);
      expect(meta.alternates?.canonical).toBe(cfg.path);
      expect(meta.openGraph?.url).toBe(`${SIXTHPHYSICS_SITE_URL}${cfg.path}`);

      const jsonLd = buildSyllabusJsonLd(cfg.syllabus, cfg.defaultCounts);
      const types = jsonLd['@graph'].map((node) => node['@type']);
      expect(types).toEqual([
        'CollectionPage',
        'LearningResource',
        'BreadcrumbList',
        'FAQPage',
      ]);

      const html = renderToStaticMarkup(
        React.createElement(SyllabusLandingPage, {
          syllabus: cfg.syllabus,
          counts: cfg.defaultCounts,
        })
      );
      expect(html).toContain(cfg.title);
      expect(html).toContain(cfg.gravityBadge);
      expect(html).toContain(`/?syllabus=${cfg.syllabus}`);
      expect(html).toContain(`/?mode=mock&amp;syllabus=${cfg.syllabus}`);
      expect(html).toContain(`/?mode=pdf&amp;syllabus=${cfg.syllabus}`);
      expect(html).toContain('https://apicuts.ai');
      expect(html).toContain('APIcuts.ai');
      for (const topic of cfg.catalogue.topics) {
        expect(html).toContain(topic.title);
      }
    }
  );

  it('keeps IB, A-Level, and NCUK gravity conventions distinct in SEO badges', () => {
    expect(SYLLABUS_SEO_CONFIGS.ib.gravityBadge).toContain('9.8');
    expect(SYLLABUS_SEO_CONFIGS.alevel.gravityBadge).toContain('9.81');
    expect(SYLLABUS_SEO_CONFIGS.ncuk.gravityBadge).toContain('9.81');
  });
});
