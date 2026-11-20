import fs from 'node:fs';
import path from 'node:path';

import type {
  PublicBankChunkFile,
  PublicBankItem,
} from '@/lib/sixthphysics-web/types';

export interface GraderCatalogPart {
  partId: string;
  prompt: string;
  marks: number;
  expectedAnswer: string;
  workingSteps: string[];
  dependsOnPartIds?: string[];
}

export interface GraderCatalogCriterion {
  key: string;
  code: string;
  partId?: string;
  marks: number;
  criterion: string;
}

export interface GraderCatalogItem {
  id: string;
  syllabi: string[];
  stem: string;
  totalMarks: number;
  parts: GraderCatalogPart[];
  markScheme: GraderCatalogCriterion[];
}

export interface GraderCatalogBundle {
  schemaVersion: 'sixthphysics-grader-catalog/1.0.0';
  generatedAt: string;
  itemCount: number;
  items: Record<string, GraderCatalogItem>;
}

function buildCriterionKey(
  point: { code: string; partId?: string },
  index: number
): string {
  return `${index}:${point.partId ?? 'q'}:${point.code}`;
}

export function exportGraderCatalog(options?: {
  chunksDir?: string;
  outPath?: string;
}): { outPath: string; itemCount: number; sizeBytes: number } {
  const repoRoot = process.cwd();
  const chunksDir = path.resolve(
    repoRoot,
    options?.chunksDir ?? path.join('public', 'sixthphysics-data', 'chunks')
  );
  const outPath = path.resolve(
    repoRoot,
    options?.outPath ?? path.join('dataset', 'grader-catalog.json')
  );

  if (!fs.existsSync(chunksDir)) {
    throw new Error(`Chunks directory not found: ${chunksDir}`);
  }

  const chunkFiles = fs
    .readdirSync(chunksDir)
    .filter((f) => f.endsWith('.json'))
    .sort();

  const items: Record<string, GraderCatalogItem> = {};

  for (const fileName of chunkFiles) {
    const parsed = JSON.parse(
      fs.readFileSync(path.join(chunksDir, fileName), 'utf8')
    ) as PublicBankChunkFile;

    for (const item of parsed.items ?? []) {
      if (item.format !== 'structured') continue;
      items[item.id] = serializeCatalogItem(item);
    }
  }

  const bundle: GraderCatalogBundle = {
    schemaVersion: 'sixthphysics-grader-catalog/1.0.0',
    generatedAt: new Date().toISOString(),
    itemCount: Object.keys(items).length,
    items,
  };

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const payload = JSON.stringify(bundle);
  fs.writeFileSync(outPath, payload, 'utf8');

  return {
    outPath,
    itemCount: bundle.itemCount,
    sizeBytes: Buffer.byteLength(payload, 'utf8'),
  };
}

function serializeCatalogItem(item: PublicBankItem): GraderCatalogItem {
  const parts: GraderCatalogPart[] = (item.parts ?? []).map((p) => ({
    partId: p.partId,
    prompt: p.prompt,
    marks: p.marks,
    expectedAnswer: p.expectedAnswer,
    workingSteps: p.workingSteps ?? [],
    ...(p.dependsOnPartIds && p.dependsOnPartIds.length > 0
      ? { dependsOnPartIds: p.dependsOnPartIds }
      : {}),
  }));

  const markScheme: GraderCatalogCriterion[] = (item.markScheme ?? []).map(
    (pt, idx) => ({
      key: buildCriterionKey(pt, idx),
      code: pt.code,
      ...(pt.partId ? { partId: pt.partId } : {}),
      marks: pt.marks > 0 ? pt.marks : 1,
      criterion: pt.criterion,
    })
  );

  const schemeTotal = markScheme.reduce((sum, pt) => sum + pt.marks, 0);
  const totalMarks =
    typeof item.totalMarks === 'number' && item.totalMarks > 0
      ? item.totalMarks
      : schemeTotal;

  const syllabi = Array.from(
    new Set((item.syllabi ?? []).map((tag) => tag.syllabus))
  ).sort();

  return {
    id: item.id,
    syllabi,
    stem: item.stem,
    totalMarks,
    parts,
    markScheme,
  };
}

if (require.main === module) {
  const outArgIndex = process.argv.indexOf('--out');
  const outPath =
    outArgIndex >= 0 && process.argv[outArgIndex + 1]
      ? process.argv[outArgIndex + 1]
      : undefined;
  const result = exportGraderCatalog({ outPath });
  console.log(JSON.stringify(result, null, 2));
}
