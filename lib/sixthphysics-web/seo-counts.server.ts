import fs from 'node:fs';
import path from 'node:path';
import {
  DEFAULT_TOTAL_BANK_ITEMS,
  SYLLABUS_SEO_CONFIGS,
  type SyllabusSeoCounts,
} from '@/lib/sixthphysics-web/seo';
import type { PublicBankManifest, SyllabusId } from '@/lib/sixthphysics-web/types';

interface LoadedManifestSummary {
  totalItems: number;
  generatedAt?: string;
  syllabi: Record<SyllabusId, SyllabusSeoCounts>;
}

let cachedSummary: LoadedManifestSummary | null = null;

function buildDefaultSummary(): LoadedManifestSummary {
  return {
    totalItems: DEFAULT_TOTAL_BANK_ITEMS,
    syllabi: {
      ib: SYLLABUS_SEO_CONFIGS.ib.defaultCounts,
      alevel: SYLLABUS_SEO_CONFIGS.alevel.defaultCounts,
      ncuk: SYLLABUS_SEO_CONFIGS.ncuk.defaultCounts,
    },
  };
}

export function loadSeoBankCounts(): LoadedManifestSummary {
  if (cachedSummary) {
    return cachedSummary;
  }

  const manifestPath = path.join(
    process.cwd(),
    'public',
    'sixthphysics-data',
    'manifest.json'
  );

  if (!fs.existsSync(manifestPath)) {
    cachedSummary = buildDefaultSummary();
    return cachedSummary;
  }

  try {
    const raw = fs.readFileSync(manifestPath, 'utf8');
    const parsed = JSON.parse(raw) as Partial<PublicBankManifest>;
    const defaults = buildDefaultSummary();

    const syllabi: Record<SyllabusId, SyllabusSeoCounts> = {
      ib: defaults.syllabi.ib,
      alevel: defaults.syllabi.alevel,
      ncuk: defaults.syllabi.ncuk,
    };

    for (const id of ['ib', 'alevel', 'ncuk'] as const) {
      const entry = parsed.syllabi?.[id];
      if (!entry) {
        continue;
      }
      const topicCounts: Record<string, number> = {
        ...defaults.syllabi[id].topicCounts,
      };
      for (const topic of entry.topics ?? []) {
        topicCounts[topic.id] = topic.questionCount;
      }
      syllabi[id] = {
        questionCount: entry.questionCount ?? defaults.syllabi[id].questionCount,
        mcqCount: entry.mcqCount ?? defaults.syllabi[id].mcqCount,
        structuredCount:
          entry.structuredCount ?? defaults.syllabi[id].structuredCount,
        countsByLevel:
          entry.countsByLevel ?? defaults.syllabi[id].countsByLevel,
        topicCounts,
      };
    }

    cachedSummary = {
      totalItems: parsed.totalItems ?? defaults.totalItems,
      generatedAt: parsed.generatedAt,
      syllabi,
    };
    return cachedSummary;
  } catch {
    cachedSummary = buildDefaultSummary();
    return cachedSummary;
  }
}
