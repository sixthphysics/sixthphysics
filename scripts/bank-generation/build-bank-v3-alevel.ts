import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import {
  ALEVEL_CORE_A2_DEFAULT_BASE_SEED,
  ALEVEL_CORE_AS_DEFAULT_BASE_SEED,
  ALEVEL_OPT_AM_DEFAULT_BASE_SEED,
  ALEVEL_OPT_EE_DEFAULT_BASE_SEED,
  ALEVEL_PRACTICALS_DEFAULT_BASE_SEED,
  buildFamilyGroupKey,
  buildSourceGroupKey,
  CandidateQuestionInput,
  compileBankFromShards,
  computeShingleSet,
  computeStemFingerprint,
  FrozenEvaluationManifest,
  generateAlevelCoreA2Candidates,
  generateAlevelCoreAsCandidates,
  generateAlevelOptionsAstromedCandidates,
  generateAlevelOptionsEngElecCandidates,
  generateAlevelPracticalsCandidates,
  ingestCandidatesIntoShard,
  parseFrozenManifest,
  QuestionStyleTag,
  QwenDistillationTrace,
  readShardRecords,
  shardAttemptsPath,
  shardJsonlPath,
  validateQwenDistillationTrace,
  VerifiedShardRecord,
  verifyCandidateWithGate,
} from "../../lib/bank-pipeline";
import { buildDeterministicDomainToolSchemas } from "./export-domain-schemas";

export const EXPECTED_FROZEN_MANIFEST_SHA256 =
  "0a0d1bc071c8250107864a4dc7db44575c4d8e5f1c56978ade15b64f124c4c67" as const;
export const EXPECTED_VAL_JSONL_SHA256 =
  "a094cab46b48ea1c08300ed172fc13d8660a0a1cc5fe1021e273552d1ac6c846" as const;
export const EXPECTED_TEST_JSONL_SHA256 =
  "fd6888e53f0c98ccd0b5f792e1f6bf223f6067ef400b270dd2cb9463310b1252" as const;

export const DEFAULT_SOURCE_BANK_DIR = "dataset/sixthphysics-bank";
export const DEFAULT_V3_ALEVEL_BANK_OUT_DIR =
  "dataset/sixthphysics-bank-v3-alevel";
export const DEFAULT_V3_ALEVEL_TIMESTAMP = "2026-11-21T03:00:00.000Z";

export interface AlevelV3ShardSpec {
  readonly shardId: string;
  readonly baseSeed: number;
  readonly generate: (options: {
    baseSeed: number;
    generatorModel: string;
  }) => CandidateQuestionInput[];
}

/**
 * Registered UK A-Level v3 shard generators (disjoint seed ranges 73_000_000+):
 *   - alevel-v3-practicals       (baseSeed: 73_000_000)
 *   - alevel-v3-core-as          (baseSeed: 74_000_000)
 *   - alevel-v3-core-a2          (baseSeed: 75_000_000)
 *   - alevel-v3-options-astromed (baseSeed: 76_000_000)
 *   - alevel-v3-options-eng-elec (baseSeed: 77_000_000)
 */
export const ALEVEL_V3_SHARD_SPECS: readonly AlevelV3ShardSpec[] = [
  {
    shardId: "alevel-v3-practicals",
    baseSeed: ALEVEL_PRACTICALS_DEFAULT_BASE_SEED,
    generate: ({ baseSeed, generatorModel }) =>
      generateAlevelPracticalsCandidates({ baseSeed, generatorModel }),
  },
  {
    shardId: "alevel-v3-core-as",
    baseSeed: ALEVEL_CORE_AS_DEFAULT_BASE_SEED,
    generate: ({ baseSeed, generatorModel }) =>
      generateAlevelCoreAsCandidates({ baseSeed, generatorModel }),
  },
  {
    shardId: "alevel-v3-core-a2",
    baseSeed: ALEVEL_CORE_A2_DEFAULT_BASE_SEED,
    generate: ({ baseSeed, generatorModel }) =>
      generateAlevelCoreA2Candidates({ baseSeed, generatorModel }),
  },
  {
    shardId: "alevel-v3-options-astromed",
    baseSeed: ALEVEL_OPT_AM_DEFAULT_BASE_SEED,
    generate: ({ baseSeed, generatorModel }) =>
      generateAlevelOptionsAstromedCandidates({ baseSeed, generatorModel }),
  },
  {
    shardId: "alevel-v3-options-eng-elec",
    baseSeed: ALEVEL_OPT_EE_DEFAULT_BASE_SEED,
    generate: ({ baseSeed, generatorModel }) =>
      generateAlevelOptionsEngElecCandidates({ baseSeed, generatorModel }),
  },
];

const ALEVEL_PRACTICAL_HINT_RE =
  /\b(?:required practical|rp\d+|error bar|worst[- ]fit|micrometer|vernier|oscilloscope|uncertainty|percentage uncertainty|precaution|log[- ]linear|lineariz|search coil|top[- ]pan|inverse[- ]square)\b/i;

/**
 * Deterministically assigns a clean `QuestionStyleTag` for UK A-Level v3 items
 * when unset on the raw generator candidate, aligned with both distillation
 * metadata and `lib/sixthphysics-web/mock-builder.ts` qualitative/practical
 * exam blueprint slots.
 */
export function inferAlevelV3QuestionStyle(
  candidate: CandidateQuestionInput,
): QuestionStyleTag {
  if (candidate.questionStyle) {
    return candidate.questionStyle;
  }

  const kind = String(candidate.scenarioSpec.kind ?? "").toLowerCase();
  const archetype = candidate.templateArchetype.toLowerCase();
  const isPracticalKind =
    kind.startsWith("al-prac-") ||
    archetype.startsWith("al-prac-") ||
    ALEVEL_PRACTICAL_HINT_RE.test(archetype);

  if (candidate.format === "mcq") {
    if (candidate.targetMode === "qualitative") {
      if (
        /\b(?:define|definition of|best defines|state what is meant by)\b/i.test(
          candidate.stem,
        )
      ) {
        return "definition";
      }
      if (isPracticalKind || ALEVEL_PRACTICAL_HINT_RE.test(candidate.stem)) {
        return "experimental";
      }
      if (/\bsketch\b/i.test(candidate.stem) || archetype.includes("sketch")) {
        return "sketch";
      }
      return "qualitative";
    }
    if (isPracticalKind) {
      return "experimental";
    }
    return "calculation";
  }

  const parts = candidate.parts ?? [];
  const hasQualPart = parts.some((p) => p.targetMode === "qualitative");
  const allQual =
    candidate.targetMode === "qualitative" ||
    (parts.length > 0 && parts.every((p) => p.targetMode === "qualitative"));
  const firstPrompt = parts[0]?.prompt ?? "";
  const allPrompts = [candidate.stem, ...parts.map((p) => p.prompt)].join(" ");

  if (allQual) {
    if (isPracticalKind || ALEVEL_PRACTICAL_HINT_RE.test(allPrompts)) {
      return "experimental";
    }
    if (
      /^\s*(?:define|state what is meant by)\b/i.test(firstPrompt) ||
      archetype.includes("definition")
    ) {
      return "definition";
    }
    if (/\bsketch\b/i.test(allPrompts) || archetype.includes("sketch")) {
      return "sketch";
    }
    return "qualitative";
  }

  if (isPracticalKind) {
    return "experimental";
  }

  if (candidate.totalMarks >= 8 || hasQualPart) {
    return "mixed-exam";
  }

  if (
    parts.some((p) =>
      /\b(?:show\s+(?:clearly\s+)?that|derive|prove\s+that)\b/i.test(p.prompt),
    )
  ) {
    return "derivation";
  }

  return "calculation";
}

export interface ParsedBuildBankV3AlevelArgs {
  sourceBankDir: string;
  outDir: string;
  generatorModel: string;
  nearDuplicateThreshold: number;
  allowCustomManifest: boolean;
  help: boolean;
}

export interface BuildBankV3AlevelOptions {
  readonly shardSpecs?: readonly AlevelV3ShardSpec[];
  readonly compiledAt?: string;
}

export interface BuildBankV3AlevelResult {
  outDir: string;
  sourceShardCount: number;
  sourceItemCount: number;
  heldOutRecordsPreservedUntouched: number;
  newAlevelV3ItemCount: number;
  totalCompiledItems: number;
  overallPassRate: number;
  zeroContaminationVerified: boolean;
  preservedArtifacts: string[];
  v3ShardReports: Array<{
    shardId: string;
    generatedCount: number;
    ingestedCount: number;
  }>;
  splitItemCounts: { train: number; val: number; test: number };
  sha256Receipts: {
    frozenEvalManifest: string;
    valJsonl: string;
    testJsonl: string;
    trainJsonl: string;
    trainV3AlevelJsonl: string;
    trainV3NcukJsonl?: string;
  };
}

function sha256File(filePath: string): string {
  const buf = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function hasHighShingleSimilarity(
  candidateShingles: ReadonlySet<string>,
  pool: readonly ReadonlySet<string>[],
  threshold: number,
): boolean {
  for (const existing of pool) {
    if (candidateShingles.size === 0 && existing.size === 0) {
      if (1 >= threshold) return true;
      continue;
    }
    if (candidateShingles.size === 0 || existing.size === 0) {
      continue;
    }
    const minSize = Math.min(candidateShingles.size, existing.size);
    const maxSize = Math.max(candidateShingles.size, existing.size);
    if (minSize < threshold * maxSize) {
      continue;
    }
    const smaller =
      candidateShingles.size <= existing.size ? candidateShingles : existing;
    const larger =
      candidateShingles.size <= existing.size ? existing : candidateShingles;
    let intersection = 0;
    for (const token of smaller) {
      if (larger.has(token)) {
        intersection += 1;
      }
    }
    const union = candidateShingles.size + existing.size - intersection;
    if (union > 0 && intersection / union >= threshold) {
      return true;
    }
  }
  return false;
}

function printUsage(): void {
  const usage = [
    "Usage:",
    "  npx tsx scripts/bank-generation/build-bank-v3-alevel.ts [options]",
    "",
    "Options:",
    `  --source-dir <dir>         Source locked bank directory (default: ${DEFAULT_SOURCE_BANK_DIR})`,
    `  --out-dir <dir>            Target v3 A-Level bank directory (default: ${DEFAULT_V3_ALEVEL_BANK_OUT_DIR})`,
    "  --generator-model <id>     Provenance generator model tag (default: gemini-4-carbon-high)",
    "  --allow-custom-manifest    Skip official SHA-256 constants check (still asserts exact parity with --source-dir)",
    "  --help                     Show this usage message",
  ].join("\n");
  console.log(usage);
}

export function parseBuildBankV3AlevelArgs(
  argv: readonly string[],
): ParsedBuildBankV3AlevelArgs {
  const parsed: ParsedBuildBankV3AlevelArgs = {
    sourceBankDir: path.resolve(process.cwd(), DEFAULT_SOURCE_BANK_DIR),
    outDir: path.resolve(process.cwd(), DEFAULT_V3_ALEVEL_BANK_OUT_DIR),
    generatorModel: "gemini-4-carbon-high",
    nearDuplicateThreshold: 0.9,
    allowCustomManifest: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      parsed.help = true;
    } else if (arg === "--allow-custom-manifest") {
      parsed.allowCustomManifest = true;
    } else if (arg === "--source-dir") {
      const next = argv[i + 1];
      if (!next) throw new Error("--source-dir requires a directory path");
      parsed.sourceBankDir = path.resolve(process.cwd(), next);
      i += 1;
    } else if (arg === "--out-dir") {
      const next = argv[i + 1];
      if (!next) throw new Error("--out-dir requires a directory path");
      parsed.outDir = path.resolve(process.cwd(), next);
      i += 1;
    } else if (arg === "--generator-model") {
      const next = argv[i + 1];
      if (!next) throw new Error("--generator-model requires a string");
      parsed.generatorModel = next;
      i += 1;
    } else {
      throw new Error(`Unrecognized argument: ${arg}`);
    }
  }

  return parsed;
}

export function runBuildBankV3Alevel(
  args: ParsedBuildBankV3AlevelArgs,
  options: BuildBankV3AlevelOptions = {},
): BuildBankV3AlevelResult {
  if (path.resolve(args.sourceBankDir) === path.resolve(args.outDir)) {
    throw new Error(
      "--source-dir and --out-dir must be distinct so concurrent readers of the source bank are undisturbed",
    );
  }

  const shardSpecs = options.shardSpecs ?? ALEVEL_V3_SHARD_SPECS;
  const compiledAt = options.compiledAt ?? DEFAULT_V3_ALEVEL_TIMESTAMP;

  const srcManifestPath = path.join(
    args.sourceBankDir,
    "frozen-eval-manifest.json",
  );
  const srcValPath = path.join(
    args.sourceBankDir,
    "distillation",
    "val.jsonl",
  );
  const srcTestPath = path.join(
    args.sourceBankDir,
    "distillation",
    "test.jsonl",
  );
  const srcShardsDir = path.join(args.sourceBankDir, "shards");

  for (const requiredPath of [
    srcManifestPath,
    srcValPath,
    srcTestPath,
    srcShardsDir,
  ]) {
    if (!fs.existsSync(requiredPath)) {
      throw new Error(`Missing required source path: ${requiredPath}`);
    }
  }

  const srcManifestSha = sha256File(srcManifestPath);
  const srcValSha = sha256File(srcValPath);
  const srcTestSha = sha256File(srcTestPath);

  if (!args.allowCustomManifest) {
    if (srcManifestSha !== EXPECTED_FROZEN_MANIFEST_SHA256) {
      throw new Error(
        `Source frozen-eval-manifest.json SHA-256 mismatch: expected ${EXPECTED_FROZEN_MANIFEST_SHA256}, got ${srcManifestSha}`,
      );
    }
    if (srcValSha !== EXPECTED_VAL_JSONL_SHA256) {
      throw new Error(
        `Source distillation/val.jsonl SHA-256 mismatch: expected ${EXPECTED_VAL_JSONL_SHA256}, got ${srcValSha}`,
      );
    }
    if (srcTestSha !== EXPECTED_TEST_JSONL_SHA256) {
      throw new Error(
        `Source distillation/test.jsonl SHA-256 mismatch: expected ${EXPECTED_TEST_JSONL_SHA256}, got ${srcTestSha}`,
      );
    }
  }

  const frozenManifest: FrozenEvaluationManifest = parseFrozenManifest(
    fs.readFileSync(srcManifestPath, "utf8"),
  );
  if (!frozenManifest.lockHeldOut) {
    throw new Error(
      "Source frozen-eval-manifest.json must have lockHeldOut: true",
    );
  }

  const heldOutValIds = new Set(frozenManifest.heldOutItemIds.val);
  const heldOutTestIds = new Set(frozenManifest.heldOutItemIds.test);
  const heldOutIds = new Set([...heldOutValIds, ...heldOutTestIds]);
  const heldOutGroups = new Set<string>();
  for (const [groupKey, split] of Object.entries(frozenManifest.frozenGroups)) {
    if (split === "val" || split === "test") {
      heldOutGroups.add(groupKey);
    }
  }

  const outShardsDir = path.join(args.outDir, "shards");
  fs.mkdirSync(outShardsDir, { recursive: true });
  fs.copyFileSync(
    srcManifestPath,
    path.join(args.outDir, "frozen-eval-manifest.json"),
  );

  // 1. Copy ALL existing shards (25 shards = 8,271 items, keeping all 628 NCUK
  //    v3 items AND all 645 val + 586 test held-out records 100% byte-for-byte
  //    untouched) while indexing IDs, seeds, stem fingerprints, and shingles.
  const seenIds = new Set<string>();
  const seenSeeds = new Set<number>();
  const seenStemFingerprints = new Set<string>();
  const globalShinglesPool: Array<ReadonlySet<string>> = [];
  const copiedShardIds = new Set<string>();
  let sourceShardCount = 0;
  let sourceItemCount = 0;
  let heldOutRecordsPreservedUntouched = 0;

  const srcShardFiles = fs.readdirSync(srcShardsDir).sort();
  for (const fileName of srcShardFiles) {
    if (!fileName.endsWith(".jsonl")) continue;
    const srcFile = path.join(srcShardsDir, fileName);
    const dstFile = path.join(outShardsDir, fileName);

    fs.copyFileSync(srcFile, dstFile);

    if (fileName.endsWith(".attempts.jsonl")) {
      continue;
    }

    sourceShardCount += 1;
    copiedShardIds.add(fileName.slice(0, -".jsonl".length));

    const rawLines = fs
      .readFileSync(srcFile, "utf8")
      .split("\n")
      .filter((line) => line.trim().length > 0);

    for (const rawLine of rawLines) {
      const rec = JSON.parse(rawLine) as VerifiedShardRecord;
      sourceItemCount += 1;

      if (heldOutIds.has(rec.bankItem.id)) {
        heldOutRecordsPreservedUntouched += 1;
        heldOutGroups.add(rec.bankItem.familyGroupKey);
        const srcKey = buildSourceGroupKey(
          rec.bankItem.provenance.sourceParentId,
        );
        if (srcKey) heldOutGroups.add(srcKey);
      }

      seenIds.add(rec.bankItem.id);
      seenSeeds.add(rec.bankItem.provenance.seed);
      seenStemFingerprints.add(rec.bankItem.provenance.stemFingerprint);
      globalShinglesPool.push(computeShingleSet(rec.bankItem.stem));
    }
  }

  // 2. Generate, gate-verify, and ingest all registered A-Level v3 shards
  const v3ShardReports: Array<{
    shardId: string;
    generatedCount: number;
    ingestedCount: number;
  }> = [];
  const newAlevelV3Traces: QwenDistillationTrace[] = [];

  for (const spec of shardSpecs) {
    if (copiedShardIds.has(spec.shardId)) {
      throw new Error(
        `A-Level v3 shard "${spec.shardId}" collides with an existing copied source shard in ${srcShardsDir}`,
      );
    }

    const v3ShardFile = shardJsonlPath(outShardsDir, spec.shardId);
    const v3AttemptsFile = shardAttemptsPath(outShardsDir, spec.shardId);
    if (fs.existsSync(v3ShardFile)) fs.rmSync(v3ShardFile, { force: true });
    if (fs.existsSync(v3AttemptsFile)) {
      fs.rmSync(v3AttemptsFile, { force: true });
    }

    const generated = spec.generate({
      baseSeed: spec.baseSeed,
      generatorModel: args.generatorModel,
    });
    const styleById = new Map<
      string,
      CandidateQuestionInput["questionStyle"]
    >();
    const verifiedBatch: CandidateQuestionInput[] = [];

    for (const rawCand of generated) {
      const candidate: CandidateQuestionInput = {
        ...rawCand,
        questionStyle:
          rawCand.questionStyle ?? inferAlevelV3QuestionStyle(rawCand),
        generatorModel: rawCand.generatorModel ?? args.generatorModel,
      };
      const familyGroupKey = buildFamilyGroupKey({
        conceptId: candidate.conceptId,
        templateArchetype: candidate.templateArchetype,
        sourceParentId: candidate.sourceParentId,
      });
      const sourceGroupKey = buildSourceGroupKey(candidate.sourceParentId);

      // Strict held-out isolation: never collide with frozen val/test families
      if (
        heldOutGroups.has(familyGroupKey) ||
        (sourceGroupKey !== undefined && heldOutGroups.has(sourceGroupKey))
      ) {
        throw new Error(
          `A-Level v3 candidate "${candidate.id}" in shard "${spec.shardId}" collides with locked held-out family "${familyGroupKey}"`,
        );
      }
      if (seenIds.has(candidate.id)) {
        throw new Error(
          `Duplicate candidate id "${candidate.id}" in A-Level v3 shard "${spec.shardId}"`,
        );
      }
      if (seenSeeds.has(candidate.seed)) {
        throw new Error(
          `Duplicate seed ${candidate.seed} on candidate "${candidate.id}" in A-Level v3 shard "${spec.shardId}"`,
        );
      }

      const stemFp = computeStemFingerprint(candidate.stem);
      if (seenStemFingerprints.has(stemFp)) {
        throw new Error(
          `Duplicate stem fingerprint on A-Level v3 candidate "${candidate.id}" in shard "${spec.shardId}"`,
        );
      }
      const shingles = computeShingleSet(candidate.stem);
      if (
        hasHighShingleSimilarity(
          shingles,
          globalShinglesPool,
          args.nearDuplicateThreshold,
        )
      ) {
        throw new Error(
          `Near-duplicate stem (>= ${args.nearDuplicateThreshold}) on A-Level v3 candidate "${candidate.id}" in shard "${spec.shardId}"`,
        );
      }

      const gateExec = verifyCandidateWithGate(candidate, {
        existingShardItems: [],
        nearDuplicateSimilarityThreshold: args.nearDuplicateThreshold,
      });
      if (!gateExec.evaluation.valid || !gateExec.solveOutput) {
        throw new Error(
          `A-Level v3 candidate "${candidate.id}" in shard "${spec.shardId}" failed package-gate: ${JSON.stringify(gateExec.evaluation.issues)}`,
        );
      }

      seenIds.add(candidate.id);
      seenSeeds.add(candidate.seed);
      seenStemFingerprints.add(gateExec.evaluation.stemFingerprint);
      globalShinglesPool.push(shingles);
      if (candidate.questionStyle) {
        styleById.set(candidate.id, candidate.questionStyle);
      }
      verifiedBatch.push(candidate);
    }

    const ingestSummary = ingestCandidatesIntoShard({
      shardId: spec.shardId,
      shardsDir: outShardsDir,
      candidates: verifiedBatch,
      frozenManifest,
      now: () => compiledAt,
      nearDuplicateSimilarityThreshold: args.nearDuplicateThreshold,
    });
    if (
      ingestSummary.rejectedCount > 0 ||
      ingestSummary.alreadyPresentCount > 0
    ) {
      throw new Error(
        `Unexpected shard ingest issue in ${spec.shardId}: rejected=${ingestSummary.rejectedCount}, alreadyPresent=${ingestSummary.alreadyPresentCount}`,
      );
    }

    // Preserve optional questionStyle on bankItem inside the new v3 shard JSONL
    const shardRecords = readShardRecords(outShardsDir, spec.shardId);
    if (styleById.size > 0) {
      const updatedRecords = shardRecords.map((rec) => {
        const style = styleById.get(rec.bankItem.id);
        if (!style || rec.bankItem.questionStyle === style) return rec;
        return {
          ...rec,
          bankItem: {
            ...rec.bankItem,
            questionStyle: style,
          },
        };
      });
      fs.writeFileSync(
        v3ShardFile,
        updatedRecords.map((r) => JSON.stringify(r)).join("\n") + "\n",
        "utf8",
      );
      for (const rec of updatedRecords) {
        newAlevelV3Traces.push(rec.distillationTrace);
      }
    } else {
      for (const rec of shardRecords) {
        newAlevelV3Traces.push(rec.distillationTrace);
      }
    }

    v3ShardReports.push({
      shardId: spec.shardId,
      generatedCount: generated.length,
      ingestedCount: ingestSummary.ingestedCount,
    });
  }

  // 3. Compile full v3 A-Level bank with locked held-out evaluation splits
  const compiledSummary = compileBankFromShards({
    shardsDir: outShardsDir,
    outDir: args.outDir,
    frozenManifest,
    lockHeldOut: true,
    compiledAt,
    nearDuplicateSimilarityThreshold: args.nearDuplicateThreshold,
  });

  // 4. Preserve historical & NCUK v3 baseline artifacts from --source-dir
  const preservedArtifacts: string[] = [];
  const artifactsToPreserve = [
    path.join("distillation", "train-v1-2413.jsonl"),
    path.join("distillation", "train-v3-ncuk.jsonl"),
    "SUMMARY.v1-3644.json",
  ];
  for (const relPath of artifactsToPreserve) {
    const srcArtifact = path.join(args.sourceBankDir, relPath);
    const dstArtifact = path.join(args.outDir, relPath);
    if (fs.existsSync(srcArtifact)) {
      fs.mkdirSync(path.dirname(dstArtifact), { recursive: true });
      fs.copyFileSync(srcArtifact, dstArtifact);
      preservedArtifacts.push(relPath.replace(/\\/g, "/"));
    }
  }

  // 5. Write standalone distillation/train-v3-alevel.jsonl containing all new
  //    A-Level v3 traces alongside the updated combined train.jsonl.
  newAlevelV3Traces.sort((a, b) => a.itemId.localeCompare(b.itemId));
  for (const trace of newAlevelV3Traces) {
    const check = validateQwenDistillationTrace(trace);
    if (!check.valid) {
      throw new Error(
        `Invalid A-Level v3 trace "${trace.traceId}": ${check.issues.join("; ")}`,
      );
    }
  }
  const trainV3AlevelPath = path.join(
    args.outDir,
    "distillation",
    "train-v3-alevel.jsonl",
  );
  fs.writeFileSync(
    trainV3AlevelPath,
    newAlevelV3Traces.length > 0
      ? newAlevelV3Traces.map((t) => JSON.stringify(t)).join("\n") + "\n"
      : "",
    "utf8",
  );

  // Write fresh deterministic domain-tool-schemas.json into outDir
  const domainSchemasPath = path.join(args.outDir, "domain-tool-schemas.json");
  const schemaDoc = buildDeterministicDomainToolSchemas();
  fs.writeFileSync(
    domainSchemasPath,
    JSON.stringify(schemaDoc, null, 2) + "\n",
    "utf8",
  );

  // 6. HARD-ASSERT exact SHA-256 parity of frozen-eval-manifest.json, val.jsonl,
  //    and test.jsonl vs --source-dir and official frozen lock hashes.
  const outManifestSha = sha256File(
    path.join(args.outDir, "frozen-eval-manifest.json"),
  );
  const outDistManifestSha = sha256File(
    path.join(args.outDir, "distillation", "frozen-eval-manifest.json"),
  );
  const outValSha = sha256File(
    path.join(args.outDir, "distillation", "val.jsonl"),
  );
  const outTestSha = sha256File(
    path.join(args.outDir, "distillation", "test.jsonl"),
  );
  const outTrainSha = sha256File(
    path.join(args.outDir, "distillation", "train.jsonl"),
  );
  const outTrainV3AlevelSha = sha256File(trainV3AlevelPath);
  const preservedNcukPath = path.join(
    args.outDir,
    "distillation",
    "train-v3-ncuk.jsonl",
  );
  const outTrainV3NcukSha = fs.existsSync(preservedNcukPath)
    ? sha256File(preservedNcukPath)
    : undefined;

  if (
    outManifestSha !== srcManifestSha ||
    outDistManifestSha !== srcManifestSha
  ) {
    throw new Error(
      `v3-alevel frozen-eval-manifest.json SHA-256 parity failure: source=${srcManifestSha}, out=${outManifestSha}, dist=${outDistManifestSha}`,
    );
  }
  if (outValSha !== srcValSha) {
    throw new Error(
      `v3-alevel distillation/val.jsonl SHA-256 parity failure: source=${srcValSha}, out=${outValSha}`,
    );
  }
  if (outTestSha !== srcTestSha) {
    throw new Error(
      `v3-alevel distillation/test.jsonl SHA-256 parity failure: source=${srcTestSha}, out=${outTestSha}`,
    );
  }
  if (!args.allowCustomManifest) {
    if (outManifestSha !== EXPECTED_FROZEN_MANIFEST_SHA256) {
      throw new Error(
        `v3-alevel frozen-eval-manifest.json lock mismatch: expected ${EXPECTED_FROZEN_MANIFEST_SHA256}, got ${outManifestSha}`,
      );
    }
    if (outValSha !== EXPECTED_VAL_JSONL_SHA256) {
      throw new Error(
        `v3-alevel distillation/val.jsonl lock mismatch: expected ${EXPECTED_VAL_JSONL_SHA256}, got ${outValSha}`,
      );
    }
    if (outTestSha !== EXPECTED_TEST_JSONL_SHA256) {
      throw new Error(
        `v3-alevel distillation/test.jsonl lock mismatch: expected ${EXPECTED_TEST_JSONL_SHA256}, got ${outTestSha}`,
      );
    }
  }
  if (!compiledSummary.splitSummary.zeroContaminationVerified) {
    throw new Error("v3-alevel zeroContaminationVerified is false!");
  }
  if (
    compiledSummary.deduplication.duplicateIdsSkipped.length > 0 ||
    compiledSummary.deduplication.nearDuplicateIdsSkipped.length > 0
  ) {
    throw new Error(
      `v3-alevel deduplication skipped items unexpectedly: dupIds=${compiledSummary.deduplication.duplicateIdsSkipped.length}, nearDup=${compiledSummary.deduplication.nearDuplicateIdsSkipped.length}`,
    );
  }
  if (
    compiledSummary.splitSummary.itemCounts.val !== heldOutValIds.size ||
    compiledSummary.splitSummary.itemCounts.test !== heldOutTestIds.size
  ) {
    throw new Error(
      `Held-out item counts changed unexpectedly: val=${compiledSummary.splitSummary.itemCounts.val} (expected ${heldOutValIds.size}), test=${compiledSummary.splitSummary.itemCounts.test} (expected ${heldOutTestIds.size})`,
    );
  }

  return {
    outDir: args.outDir,
    sourceShardCount,
    sourceItemCount,
    heldOutRecordsPreservedUntouched,
    newAlevelV3ItemCount: newAlevelV3Traces.length,
    totalCompiledItems: compiledSummary.totalCompiledItems,
    overallPassRate: compiledSummary.attemptMetrics.overallPassRate,
    zeroContaminationVerified:
      compiledSummary.splitSummary.zeroContaminationVerified,
    preservedArtifacts,
    v3ShardReports,
    splitItemCounts: compiledSummary.splitSummary.itemCounts,
    sha256Receipts: {
      frozenEvalManifest: outManifestSha,
      valJsonl: outValSha,
      testJsonl: outTestSha,
      trainJsonl: outTrainSha,
      trainV3AlevelJsonl: outTrainV3AlevelSha,
      ...(outTrainV3NcukSha ? { trainV3NcukJsonl: outTrainV3NcukSha } : {}),
    },
  };
}

export function runBuildBankV3AlevelCli(argv: readonly string[]): number {
  const args = parseBuildBankV3AlevelArgs(argv);
  if (args.help) {
    printUsage();
    return 0;
  }

  const result = runBuildBankV3Alevel(args);
  console.log(JSON.stringify(result, null, 2));
  return 0;
}

if (require.main === module) {
  try {
    process.exitCode = runBuildBankV3AlevelCli(process.argv.slice(2));
  } catch (error) {
    console.error(
      JSON.stringify({
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    process.exitCode = 1;
  }
}
