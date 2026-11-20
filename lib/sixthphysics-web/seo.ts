import type { Metadata } from 'next';
import {
  ALEVEL_PHYSICS_SYLLABUS,
  IB_PHYSICS_SYLLABUS,
  NCUK_PHYSICS_SYLLABUS,
  type SyllabusSpecificationCatalogue,
} from '@/lib/constants/syllabi';
import type { SyllabusId } from '@/lib/sixthphysics-web/types';

export const SIXTHPHYSICS_SITE_URL = 'https://sixthphysics.github.io';
export const SIXTHPHYSICS_SITE_NAME = 'SixthPhysics';
export const SIXTHPHYSICS_OG_IMAGE_PATH = '/og-image.png';

export const SIXTHPHYSICS_EXTERNAL_LINKS = {
  githubOrg: 'https://github.com/sixthphysics',
  githubRepo: 'https://github.com/sixthphysics/sixthphysics',
  huggingFaceLora: 'https://huggingface.co/d4ydy/sixthphysics-qwen3.5-9b-lora',
  huggingFaceGguf: 'https://huggingface.co/d4ydy/sixthphysics-qwen3.5-9b-GGUF',
  huggingFaceDataset:
    'https://huggingface.co/datasets/d4ydy/sixthphysics-bench-and-bank',
  apicutsSponsor: 'https://apicuts.ai',
} as const;

export interface SyllabusSeoFaq {
  question: string;
  answer: string;
}

export interface SyllabusSeoCounts {
  questionCount: number;
  mcqCount: number;
  structuredCount: number;
  countsByLevel: Record<string, number>;
  topicCounts: Record<string, number>;
}

export interface SyllabusSeoConfig {
  syllabus: SyllabusId;
  slug: 'ib-physics' | 'a-level-physics' | 'ncuk-ify-physics';
  path: '/ib-physics/' | '/a-level-physics/' | '/ncuk-ify-physics/';
  navLabel: string;
  title: string;
  metaTitle: string;
  description: string;
  heroSummary: string;
  examBoardBadge: string;
  gravityBadge: string;
  keywords: readonly string[];
  faqs: readonly SyllabusSeoFaq[];
  catalogue: SyllabusSpecificationCatalogue;
  defaultCounts: SyllabusSeoCounts;
}

export const DEFAULT_TOTAL_BANK_ITEMS = 7643;
export const DEFAULT_TOTAL_MCQ_ITEMS = 4838;
export const DEFAULT_TOTAL_STRUCTURED_ITEMS = 2805;

export const SYLLABUS_SEO_CONFIGS: Record<SyllabusId, SyllabusSeoConfig> = {
  ib: {
    syllabus: 'ib',
    slug: 'ib-physics',
    path: '/ib-physics/',
    navLabel: 'IB Physics (2025)',
    title: 'IB Physics 2025 Practice Questions (SL & HL)',
    metaTitle:
      'IB Physics 2025 Practice Questions (SL & HL) · Paper 1 MCQ & Paper 2',
    description:
      'Free IB Physics (First Assessment 2025) SL and HL practice bank with 6,400+ solver-verified Paper 1A multiple-choice and Paper 2 structured questions, deterministic SVG diagrams, worked solutions, examiner mark schemes, and PDF mock papers.',
    heroSummary:
      'Aligned to the IB Diploma Programme Physics First Assessment 2025 syllabus (Tools and Themes A–E, excluding retired 2016 options) using g = 9.8 m s⁻². Filter by SL or HL, Paper 1A MCQ or Paper 2 structured, and build printable mock exams with zero sign-up.',
    examBoardBadge: 'IB DP Physics · First Assessment 2025',
    gravityBadge: 'g = 9.8 m s⁻²',
    keywords: [
      'IB Physics 2025 practice questions',
      'IB Physics SL HL question bank',
      'IB Physics Paper 1A MCQ',
      'IB Physics Paper 2 structured questions',
      'IB Physics Themes A to E',
      'IB Physics mock exam generator',
      'IB Physics mark schemes',
      'free IB Physics revision',
    ],
    faqs: [
      {
        question:
          'Are these IB Physics questions aligned to the First Assessment 2025 syllabus?',
        answer:
          'Yes. Every IB Physics question is tagged to the 2025 IB specification structure (Tools for Physics and Themes A–E across SL and HL), uses g = 9.8 m s⁻², and excludes retired IB 2016 optional topics.',
      },
      {
        question:
          'What question formats are included for IB Physics SL and HL?',
        answer:
          'The bank includes both Paper 1A four-option multiple-choice questions with distractor trap explanations and Paper 2 multi-part structured questions with interactive M1/A1 examiner mark-scheme points.',
      },
      {
        question: 'Can I generate printable IB Physics mock papers?',
        answer:
          'Yes. Use the built-in Timed Mock Exam mode or PDF Paper Maker to assemble custom SL or HL topic sets with official-style diagrams, formula reference sheet, and separate mark schemes—completely free with no account required.',
      },
    ],
    catalogue: IB_PHYSICS_SYLLABUS,
    defaultCounts: {
      questionCount: 6448,
      mcqCount: 4072,
      structuredCount: 2376,
      countsByLevel: { SL: 2746, HL: 3702 },
      topicCounts: {
        'ib-tools': 206,
        'ib-theme-a': 1328,
        'ib-theme-b': 1762,
        'ib-theme-c': 1211,
        'ib-theme-d': 1353,
        'ib-theme-e': 588,
      },
    },
  },
  alevel: {
    syllabus: 'alevel',
    slug: 'a-level-physics',
    path: '/a-level-physics/',
    navLabel: 'UK A-Level Physics',
    title: 'UK A-Level Physics Practice Questions (AS & Year 13)',
    metaTitle:
      'UK A-Level Physics Practice Questions · AQA 7408, AS & Year 13 Bank',
    description:
      'Free UK A-Level Physics (DfE Core & AQA 7407/7408, OCR/CIE core overlap) practice bank with 6,600+ verified multiple-choice and structured exam questions across Year 12 (AS), Year 13, and Options 9–13.',
    heroSummary:
      'Structured around the DfE GCE AS/A-Level Physics core and AQA 7407/7408 (Sections 1–8 plus Year 13 Optional Modules 9–13) using g = 9.81 m s⁻². Practice Year 12 AS and full Year 13 questions with crisp diagrams, worked solutions, and printable mock papers.',
    examBoardBadge: 'UK GCE AS & A-Level · AQA 7407/7408 Core',
    gravityBadge: 'g = 9.81 m s⁻²',
    keywords: [
      'A-Level Physics practice questions',
      'AQA 7408 Physics question bank',
      'Year 12 AS Physics revision',
      'Year 13 A-Level Physics past paper style questions',
      'UK A-Level Physics multiple choice',
      'A-Level Physics structured questions mark schemes',
      'AQA Physics options Astrophysics Engineering Medical Turning Points',
      'free A-Level Physics mock paper generator',
    ],
    faqs: [
      {
        question:
          'Which UK A-Level Physics exam boards does SixthPhysics cover?',
        answer:
          'Questions are organized by the DfE GCE AS/A-Level Physics core and AQA 7407/7408 (Sections 1–8 plus Options 9–13: Astrophysics, Medical Physics, Engineering Physics, Turning Points, and Electronics), with extensive overlap across OCR A (H556), Edexcel, and CIE 9702 core topics.',
      },
      {
        question: 'Can I separate Year 12 (AS) from Year 13 A-Level topics?',
        answer:
          'Yes. Use the Y12 and Y13 level filter in the Practice Desk, Mock Exam builder, or PDF Paper Maker to focus exclusively on AS Year 12 foundations or full A-Level Year 13 content such as Further Mechanics, Thermal Physics, Fields, and Nuclear Physics.',
      },
      {
        question:
          'What gravitational field strength value is used for A-Level questions?',
        answer:
          'All UK A-Level Physics calculations and solver-verified mark schemes follow the standard g = 9.81 m s⁻² convention.',
      },
    ],
    catalogue: ALEVEL_PHYSICS_SYLLABUS,
    defaultCounts: {
      questionCount: 6604,
      mcqCount: 4068,
      structuredCount: 2536,
      countsByLevel: { Y12: 1863, Y13: 4741 },
      topicCounts: {
        'alevel-sec1-measurements-errors': 205,
        'alevel-sec2-particles-radiation': 199,
        'alevel-sec3-waves': 789,
        'alevel-sec4-mechanics-materials': 1241,
        'alevel-sec5-electricity': 937,
        'alevel-sec6-further-mechanics-thermal': 999,
        'alevel-sec7-fields-consequences': 1603,
        'alevel-sec8-nuclear-physics': 351,
        'alevel-options-9-13': 280,
      },
    },
  },
  ncuk: {
    syllabus: 'ncuk',
    slug: 'ncuk-ify-physics',
    path: '/ncuk-ify-physics/',
    navLabel: 'NCUK IFY Physics',
    title: 'NCUK IFY Physics (IFYPH005) Practice Questions',
    metaTitle:
      'NCUK IFY Physics (IFYPH005) Practice Questions · Modules AC1–AC8',
    description:
      'Free NCUK International Foundation Year (IFY) Physics (IFYPH005) practice bank with 6,100+ solver-verified Semester 1 and Semester 2 MCQ and structured questions covering Modules AC1–AC8, worked solutions, and printable mock exams.',
    heroSummary:
      'Built specifically for NCUK International Foundation Year Physics (IFYPH005) across Learning Outcomes AC1–AC8 (Semester 1, Semester 2, and full-year revision) using g = 9.81 m s⁻². Practice solver-verified questions with diagrams, formula references, and examiner-style mark schemes.',
    examBoardBadge: 'NCUK IFY Physics · IFYPH005 (AC1–AC8)',
    gravityBadge: 'g = 9.81 m s⁻²',
    keywords: [
      'NCUK IFY Physics practice questions',
      'IFYPH005 revision questions',
      'NCUK International Foundation Year Physics',
      'IFYPH005 past paper style questions',
      'NCUK Physics Semester 1 Semester 2',
      'NCUK Physics AC1 to AC8',
      'NCUK Physics mock exam',
      'free NCUK IFY Physics question bank',
    ],
    faqs: [
      {
        question: 'Does this cover the full NCUK IFYPH005 Physics syllabus?',
        answer:
          'Yes. All eight NCUK IFYPH005 assessment criteria modules (AC1 Units & Uncertainties through AC8 Quantum & Particle Physics) are covered with dedicated Semester 1 (IFY-S1), Semester 2 (IFY-S2), and full-year (IFY) filters.',
      },
      {
        question: 'Are numerical answers and diagrams verified for IFYPH005?',
        answer:
          'Every question is generated through a deterministic physics solver using g = 9.81 m s⁻² and standard SI units, with verified 3-significant-figure answers, crisp vector diagrams, and step-by-step mark schemes.',
      },
      {
        question:
          'Can I practice timed NCUK IFY Physics mocks or print PDF exam papers?',
        answer:
          'Yes. Launch a timed mock exam directly in your browser or export an exam-style PDF question paper and mark scheme tailored to specific AC1–AC8 modules with zero registration.',
      },
    ],
    catalogue: NCUK_PHYSICS_SYLLABUS,
    defaultCounts: {
      questionCount: 6193,
      mcqCount: 3908,
      structuredCount: 2285,
      countsByLevel: { IFY: 2876, 'IFY-S1': 1495, 'IFY-S2': 1822 },
      topicCounts: {
        'ncuk-ac1': 335,
        'ncuk-ac2': 1159,
        'ncuk-ac3': 564,
        'ncuk-ac4': 2164,
        'ncuk-ac5': 354,
        'ncuk-ac6': 1115,
        'ncuk-ac7': 303,
        'ncuk-ac8': 199,
      },
    },
  },
};

export const SYLLABUS_SEO_LIST: readonly SyllabusSeoConfig[] = [
  SYLLABUS_SEO_CONFIGS.ib,
  SYLLABUS_SEO_CONFIGS.alevel,
  SYLLABUS_SEO_CONFIGS.ncuk,
];

export function buildCanonicalUrl(pathname: string): string {
  const normalized = pathname.startsWith('/') ? pathname : `/${pathname}`;
  return `${SIXTHPHYSICS_SITE_URL}${normalized}`;
}

export function buildSyllabusMetadata(syllabus: SyllabusId): Metadata {
  const cfg = SYLLABUS_SEO_CONFIGS[syllabus];
  const canonicalUrl = buildCanonicalUrl(cfg.path);

  return {
    title: cfg.metaTitle,
    description: cfg.description,
    keywords: [...cfg.keywords],
    alternates: {
      canonical: cfg.path,
    },
    openGraph: {
      type: 'website',
      locale: 'en_GB',
      url: canonicalUrl,
      siteName: SIXTHPHYSICS_SITE_NAME,
      title: `${cfg.metaTitle} · ${SIXTHPHYSICS_SITE_NAME}`,
      description: cfg.description,
      images: [
        {
          url: SIXTHPHYSICS_OG_IMAGE_PATH,
          width: 1440,
          height: 900,
          alt: `${cfg.title} on SixthPhysics`,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: `${cfg.metaTitle} · ${SIXTHPHYSICS_SITE_NAME}`,
      description: cfg.description,
      images: [SIXTHPHYSICS_OG_IMAGE_PATH],
    },
  };
}

export function buildRootJsonLd(totalItems = DEFAULT_TOTAL_BANK_ITEMS) {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${SIXTHPHYSICS_SITE_URL}/#organization`,
        name: SIXTHPHYSICS_SITE_NAME,
        url: `${SIXTHPHYSICS_SITE_URL}/`,
        logo: `${SIXTHPHYSICS_SITE_URL}/icon.svg`,
        sameAs: [
          SIXTHPHYSICS_EXTERNAL_LINKS.githubOrg,
          SIXTHPHYSICS_EXTERNAL_LINKS.githubRepo,
          SIXTHPHYSICS_EXTERNAL_LINKS.huggingFaceLora,
          SIXTHPHYSICS_EXTERNAL_LINKS.huggingFaceGguf,
          SIXTHPHYSICS_EXTERNAL_LINKS.huggingFaceDataset,
        ],
      },
      {
        '@type': 'WebSite',
        '@id': `${SIXTHPHYSICS_SITE_URL}/#website`,
        url: `${SIXTHPHYSICS_SITE_URL}/`,
        name: SIXTHPHYSICS_SITE_NAME,
        description:
          'Free solver-verified pre-university physics practice bank for IB Physics (2025 SL & HL), UK A-Level Physics (AQA 7408), and NCUK IFY Physics (IFYPH005).',
        publisher: {
          '@id': `${SIXTHPHYSICS_SITE_URL}/#organization`,
        },
        inLanguage: 'en',
      },
      {
        '@type': 'WebApplication',
        '@id': `${SIXTHPHYSICS_SITE_URL}/#webapp`,
        name: 'SixthPhysics Practice Desk & Mock Paper Maker',
        url: `${SIXTHPHYSICS_SITE_URL}/`,
        applicationCategory: 'EducationalApplication',
        operatingSystem: 'Any',
        browserRequirements: 'Requires JavaScript',
        isAccessibleForFree: true,
        offers: {
          '@type': 'Offer',
          price: '0',
          priceCurrency: 'USD',
        },
        educationalLevel: [
          'IB Diploma Programme (SL & HL)',
          'UK GCE AS & A-Level (Year 12 & Year 13)',
          'NCUK International Foundation Year (IFYPH005)',
        ],
        about: {
          '@type': 'Thing',
          name: 'Pre-University Physics',
        },
        description: `${totalItems.toLocaleString('en-US')} solver-verified Paper 1 multiple-choice and Paper 2 structured physics questions with deterministic SVG diagrams, KaTeX math, worked solutions, examiner mark schemes, timed mock exams, and printable PDF mock papers.`,
        image: `${SIXTHPHYSICS_SITE_URL}${SIXTHPHYSICS_OG_IMAGE_PATH}`,
        creator: {
          '@id': `${SIXTHPHYSICS_SITE_URL}/#organization`,
        },
      },
      {
        '@type': 'ItemList',
        '@id': `${SIXTHPHYSICS_SITE_URL}/#syllabi`,
        name: 'Supported Pre-University Physics Syllabi',
        itemListElement: SYLLABUS_SEO_LIST.map((cfg, index) => ({
          '@type': 'ListItem',
          position: index + 1,
          name: cfg.title,
          url: buildCanonicalUrl(cfg.path),
        })),
      },
    ],
  };
}

export function buildSyllabusJsonLd(
  syllabus: SyllabusId,
  counts: SyllabusSeoCounts = SYLLABUS_SEO_CONFIGS[syllabus].defaultCounts
) {
  const cfg = SYLLABUS_SEO_CONFIGS[syllabus];
  const pageUrl = buildCanonicalUrl(cfg.path);

  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'CollectionPage',
        '@id': `${pageUrl}#webpage`,
        url: pageUrl,
        name: cfg.title,
        description: cfg.description,
        isPartOf: {
          '@id': `${SIXTHPHYSICS_SITE_URL}/#website`,
        },
        inLanguage: 'en',
        about: {
          '@type': 'Course',
          name: cfg.catalogue.title,
          courseCode: cfg.catalogue.specificationCode,
          provider: {
            '@type': 'Organization',
            name: cfg.catalogue.awardingBody,
          },
        },
      },
      {
        '@type': 'LearningResource',
        '@id': `${pageUrl}#resource`,
        name: cfg.title,
        description: cfg.description,
        url: pageUrl,
        learningResourceType: 'Practice problem set',
        educationalAlignment: {
          '@type': 'AlignmentObject',
          alignmentType: 'teaches',
          educationalFramework: cfg.catalogue.title,
          targetName: cfg.catalogue.specificationCode,
        },
        isAccessibleForFree: true,
        inLanguage: 'en',
        keywords: cfg.keywords.join(', '),
        numberOfItems: counts.questionCount,
        provider: {
          '@id': `${SIXTHPHYSICS_SITE_URL}/#organization`,
        },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          {
            '@type': 'ListItem',
            position: 1,
            name: SIXTHPHYSICS_SITE_NAME,
            item: `${SIXTHPHYSICS_SITE_URL}/`,
          },
          {
            '@type': 'ListItem',
            position: 2,
            name: cfg.navLabel,
            item: pageUrl,
          },
        ],
      },
      {
        '@type': 'FAQPage',
        mainEntity: cfg.faqs.map((faq) => ({
          '@type': 'Question',
          name: faq.question,
          acceptedAnswer: {
            '@type': 'Answer',
            text: faq.answer,
          },
        })),
      },
    ],
  };
}
