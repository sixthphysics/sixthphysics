import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import {
  buildFamilyGroupKey,
  buildQwenDistillationTrace,
  buildSourceGroupKey,
  CandidateQuestionInput,
  CandidateQuestionPlan,
  compileBankFromShards,
  computeShingleSet,
  computeStemFingerprint,
  DEFAULT_NCUK_AC4_BASE_SEED,
  extractNumbersFromPhysicsText,
  FrozenEvaluationManifest,
  generateNcukAc4Candidates,
  generateNcukQualitativeExamCandidates,
  generateNcukStaticsFluidsCandidates,
  getDomainAdapter,
  ingestCandidatesIntoShard,
  McqOptionItem,
  NCUK_QUAL_EXAM_DEFAULT_BASE_SEED,
  NCUK_STATICS_FLUIDS_BASE_SEED,
  numbersAgreeWithinTolerance,
  parseFrozenManifest,
  QuestionStyleTag,
  QwenDistillationTrace,
  readShardRecords,
  SHARD_RECORD_SCHEMA_VERSION,
  shardAttemptsPath,
  shardJsonlPath,
  SIXTHPHYSICS_BANK_ITEM_SCHEMA_VERSION,
  SixthPhysicsBankItem,
  StructuredQuestionPart,
  SyllabusTag,
  textContainsNumericValue,
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
export const DEFAULT_V3_BANK_OUT_DIR = "dataset/sixthphysics-bank-v3";
export const DEFAULT_V3_TIMESTAMP = "2026-11-20T18:00:00.000Z";

export interface NcukV3ShardSpec {
  readonly shardId: string;
  readonly baseSeed: number;
  readonly generate: (options: {
    baseSeed: number;
    generatorModel: string;
  }) => CandidateQuestionInput[];
}

/**
 * Registered NCUK v3 shard generators (disjoint seed ranges 70_000_000+):
 *   - ncuk-v3-ac4            (baseSeed: 70_000_000)
 *   - ncuk-v3-statics-fluids (baseSeed: 71_000_000)
 *   - ncuk-v3-qual-exam      (baseSeed: 72_000_000)
 */
export const NCUK_V3_SHARD_SPECS: readonly NcukV3ShardSpec[] = [
  {
    shardId: "ncuk-v3-ac4",
    baseSeed: DEFAULT_NCUK_AC4_BASE_SEED,
    generate: ({ baseSeed, generatorModel }) =>
      generateNcukAc4Candidates({ baseSeed, generatorModel }),
  },
  {
    shardId: "ncuk-v3-statics-fluids",
    baseSeed: NCUK_STATICS_FLUIDS_BASE_SEED,
    generate: ({ baseSeed, generatorModel }) =>
      generateNcukStaticsFluidsCandidates({ baseSeed, generatorModel }),
  },
  {
    shardId: "ncuk-v3-qual-exam",
    baseSeed: NCUK_QUAL_EXAM_DEFAULT_BASE_SEED,
    generate: ({ baseSeed, generatorModel }) =>
      generateNcukQualitativeExamCandidates({ baseSeed, generatorModel }),
  },
];

/**
 * Deterministically assigns a clean `QuestionStyleTag` for NCUK v3 items when
 * unset on the raw generator candidate, aligned with both distillation metadata
 * and `lib/sixthphysics-web/mock-builder.ts` qualitative/quantitative slots.
 */
export function inferNcukV3QuestionStyle(
  candidate: CandidateQuestionInput,
): QuestionStyleTag {
  if (candidate.questionStyle) {
    return candidate.questionStyle;
  }

  const kind = String(candidate.scenarioSpec.kind ?? "");
  const archetype = candidate.templateArchetype.toLowerCase();

  if (candidate.format === "mcq") {
    if (candidate.targetMode === "qualitative") {
      if (/\b(?:define|definition of|best defines)\b/i.test(candidate.stem)) {
        return "definition";
      }
      if (
        kind === "false-origin-gradient-experiment" ||
        archetype.includes("precaution") ||
        archetype.includes("errors-precision")
      ) {
        return "experimental";
      }
      if (
        /\bsketch\b/i.test(candidate.stem) ||
        archetype.includes("sketch")
      ) {
        return "sketch";
      }
      return "qualitative";
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
    if (
      /^\s*define\b/i.test(firstPrompt) ||
      /^\s*state\s+(?:kirchhoff|lenz|boyle|charles|the\s+principle|how\s+acceleration)/i.test(
        firstPrompt,
      ) ||
      archetype.includes("definition")
    ) {
      return "definition";
    }
    if (/\bsketch\b/i.test(allPrompts) || archetype.includes("sketch")) {
      return "sketch";
    }
    if (
      archetype.includes("precaution") ||
      archetype.includes("errors-precision") ||
      /\b(?:random error|systematic error|parallax|zero error|experimental precaution)\b/i.test(
        allPrompts,
      )
    ) {
      return "experimental";
    }
    return "qualitative";
  }

  if (candidate.totalMarks >= 8) {
    return "mixed-exam";
  }

  if (kind === "false-origin-gradient-experiment") {
    return "experimental";
  }

  if (hasQualPart) {
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

export interface ParsedBuildBankV3Args {
  sourceBankDir: string;
  outDir: string;
  generatorModel: string;
  nearDuplicateThreshold: number;
  allowCustomManifest: boolean;
  help: boolean;
}

export interface BuildBankV3Options {
  readonly shardSpecs?: readonly NcukV3ShardSpec[];
  readonly compiledAt?: string;
}

export interface TrainRepairSummary {
  fieldsZeroClampRepaired: number;
  quantumNuclearZeroClampRepaired: number;
  emInductionZeroClampRepaired: number;
  articleGrammarRepaired: number;
  thermalFirstLawNcukRepaired: number;
  wavesDoubleSlitNcukRepaired: number;
  hydrostaticNcukTagRepaired: number;
  totalTrainRecordsRepaired: number;
  heldOutRecordsPreservedUntouched: number;
}

const SUPERSCRIPTS: Readonly<Record<string, string>> = {
  "-": "⁻",
  "+": "",
  "0": "⁰",
  "1": "¹",
  "2": "²",
  "3": "³",
  "4": "⁴",
  "5": "⁵",
  "6": "⁶",
  "7": "⁷",
  "8": "⁸",
  "9": "⁹",
};

function toSuperscript(expStr: string): string {
  return [...expStr].map((ch) => SUPERSCRIPTS[ch] ?? ch).join("");
}

function formatSci3sf(value: number, unit = "", asciiMinus = false): string {
  const suffix = unit ? ` ${unit}` : "";
  if (!Number.isFinite(value)) {
    throw new Error(`Cannot format non-finite value: ${String(value)}`);
  }
  if (Math.abs(value) < 1e-35) {
    return `0${suffix}`;
  }
  const abs = Math.abs(value);
  const sign = value < 0 ? (asciiMinus ? "-" : "−") : "";
  if (abs >= 0.01 && abs < 1000) {
    const plain = abs.toPrecision(3);
    if (!plain.includes("e")) {
      return `${sign}${plain}${suffix}`;
    }
  }
  const [mantissa, rawExp] = abs.toExponential(2).split("e");
  const cleanExp = String(Number.parseInt(rawExp, 10));
  return `${sign}${mantissa} × 10${toSuperscript(cleanExp)}${suffix}`;
}

function formatGivenClean(value: number, unit = ""): string {
  const suffix = unit ? ` ${unit}` : "";
  if (Math.abs(value) < 1e-35) {
    return `0${suffix}`;
  }
  const abs = Math.abs(value);
  const sign = value < 0 ? "−" : "";
  if (abs >= 0.001 && abs < 10_000) {
    return `${sign}${String(Number(abs.toPrecision(6)))}${suffix}`;
  }
  const [mantissa, rawExp] = abs.toExponential().split("e");
  const cleanMantissa = Number(Number(mantissa).toPrecision(4)).toString();
  const cleanExp = String(Number.parseInt(rawExp, 10));
  return `${sign}${cleanMantissa} × 10${toSuperscript(cleanExp)}${suffix}`;
}

function formatThermalSci(value: number, sigFigs = 3, unit = ""): string {
  const suffix = unit ? ` ${unit}` : "";
  if (Math.abs(value) < 1e-35) {
    return `0${suffix}`;
  }
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  if (abs >= 0.01 && abs < 1000) {
    return `${sign}${abs.toPrecision(sigFigs)}${suffix}`;
  }
  const [mantissa, rawExp] = abs.toExponential(sigFigs - 1).split("e");
  const exp = Number.parseInt(rawExp, 10);
  if (exp === 0) {
    return `${sign}${mantissa}${suffix}`;
  }
  return `${sign}${mantissa} × 10${toSuperscript(String(exp))}${suffix}`;
}

const ARTICLE_GRAMMAR_REGEX =
  /\b([Aa])\s+((?:electron|electrostatic|electromagnetic|electrodynamic|electric|electrical|electrometer|alpha|ion|isolated|ideal|inkjet|industrial|aerospace|alumina|insulated|insulator|optical|oscilloscope|oscillating|ammeter|acoustic|evacuated|induction|inductor|asteroidal)[a-z-]*)\b/gi;

function fixArticleGrammar(text: string): string {
  return text.replace(
    ARTICLE_GRAMMAR_REGEX,
    (_m, art: string, word: string) => `${art === "A" ? "An" : "an"} ${word}`,
  );
}

function hasArticleGrammarBug(text: string): boolean {
  ARTICLE_GRAMMAR_REGEX.lastIndex = 0;
  return ARTICLE_GRAMMAR_REGEX.test(text);
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
    "  npx tsx scripts/bank-generation/build-bank-v3.ts [options]",
    "",
    "Options:",
    `  --source-dir <dir>         Source locked v2 bank directory (default: ${DEFAULT_SOURCE_BANK_DIR})`,
    `  --out-dir <dir>            Target v3 bank directory (default: ${DEFAULT_V3_BANK_OUT_DIR})`,
    "  --generator-model <id>     Provenance generator model tag (default: gemini-4-carbon-high)",
    "  --allow-custom-manifest    Skip official SHA-256 constants check (still asserts exact parity with --source-dir)",
    "  --help                     Show this usage message",
  ].join("\n");
  console.log(usage);
}

export function parseBuildBankV3Args(
  argv: readonly string[],
): ParsedBuildBankV3Args {
  const parsed: ParsedBuildBankV3Args = {
    sourceBankDir: path.resolve(process.cwd(), DEFAULT_SOURCE_BANK_DIR),
    outDir: path.resolve(process.cwd(), DEFAULT_V3_BANK_OUT_DIR),
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

function collectRecordText(item: SixthPhysicsBankItem): string {
  return [
    item.stem,
    item.workedSolution,
    ...(item.options ?? []).map(
      (o) => `${o.text} ${o.distractorRationale ?? ""}`,
    ),
    ...(item.parts ?? []).map(
      (p) => `${p.prompt} ${p.expectedAnswer} ${p.workingSteps.join(" ")}`,
    ),
    ...item.markScheme.map((m) => m.criterion),
  ].join("\n");
}

function resolveMcqTargetQuantityKey(
  item: SixthPhysicsBankItem,
  hiddenQuantities: readonly string[],
): string | undefined {
  if (item.format !== "mcq" || !item.options) return undefined;
  if (hiddenQuantities.length === 1 && hiddenQuantities[0]?.trim()) {
    return hiddenQuantities[0].trim();
  }
  const correctOpt =
    item.correctOptionIndex !== undefined
      ? item.options[item.correctOptionIndex]
      : item.options.find((o) => o.isCorrect);
  if (!correctOpt) return undefined;
  const distractors = item.options.filter((o) => !o.isCorrect);

  const candidateKeys =
    hiddenQuantities.length > 0
      ? hiddenQuantities
      : Object.keys(item.verifiedQuantities);

  const strictTol = {
    significantFigures: 3,
    relativeTolerance: 0.01,
    absoluteZeroTolerance: 1e-35,
  };
  const optMentions = extractNumbersFromPhysicsText(correctOpt.text);

  const scoreKey = (key: string): number => {
    const val = item.verifiedQuantities[key];
    if (typeof val !== "number" || !Number.isFinite(val)) return -1;

    const matchesStrictSigned = textContainsNumericValue(
      correctOpt.text,
      val,
      strictTol,
    );
    const matchesStrictMag =
      !matchesStrictSigned &&
      val < 0 &&
      textContainsNumericValue(correctOpt.text, Math.abs(val), {
        ...strictTol,
        allowMagnitudeMatch: true,
      });
    if (!matchesStrictSigned && !matchesStrictMag) return -1;

    let score = matchesStrictSigned ? 100 : 80;

    // Strongly prefer keys that do NOT collide with any distractor under package-gate default tolerance
    const distractorCollision = distractors.some((d) =>
      textContainsNumericValue(d.text, val, {
        significantFigures: 3,
        relativeTolerance: 0.005,
      }),
    );
    if (!distractorCollision) {
      score += 50;
    }

    // Strongly prefer direct rawValue match (e.g., closestApproachFm = 12.1 for "12.1 fm", energyEv = 6.04 for "6.04 eV")
    const matchesRawDirectly = optMentions.some(
      (m) =>
        numbersAgreeWithinTolerance(m.rawValue, val, strictTol) ||
        (val < 0 &&
          numbersAgreeWithinTolerance(Math.abs(m.rawValue), Math.abs(val), strictTol)),
    );
    if (matchesRawDirectly) {
      score += 30;
    }

    // Unit-suffix disambiguation
    const optText = correctOpt.text;
    if (/\bfm\b/.test(optText) && /Fm$/i.test(key)) score += 20;
    else if (/\bnm\b/.test(optText) && /Nm$/i.test(key)) score += 20;
    else if (/\beV\b/.test(optText) && /Ev$/i.test(key)) score += 20;
    else if (/\bMeV\b/.test(optText) && /Mev$/i.test(key)) score += 20;
    else if (/\bHz\b/.test(optText) && /Hz$/i.test(key)) score += 20;
    else if (/\bJ\b/.test(optText) && /J$/i.test(key)) score += 20;
    else if (/\bV\b/.test(optText) && /V$/i.test(key)) score += 20;
    else if (/\bF\b/.test(optText) && /F$/i.test(key)) score += 20;
    else if (/\bm s/.test(optText) && /(?:Ms|Speed)$/i.test(key)) score += 20;
    else if (/\bN\b/.test(optText) && /N$/i.test(key)) score += 20;
    else if (/\bm\b/.test(optText) && /(?:M|Wavelength|Spacing|Position|Separation|Radius)$/i.test(key)) score += 15;

    return score;
  };

  let bestKey: string | undefined;
  let bestScore = -1;
  for (const key of candidateKeys) {
    const sc = scoreKey(key);
    if (sc > bestScore) {
      bestScore = sc;
      bestKey = key;
    }
  }
  if (bestKey !== undefined) {
    return bestKey;
  }

  // Fallback for qualitative MCQs
  for (const key of candidateKeys) {
    const val = item.verifiedQuantities[key];
    if (typeof val === "string" || typeof val === "boolean") {
      return key;
    }
  }
  return undefined;
}

interface RepairedRecordResult {
  record: VerifiedShardRecord;
  repaired: boolean;
  categories: {
    fieldsZero: boolean;
    qnZero: boolean;
    emZero: boolean;
    article: boolean;
    thermalNcuk: boolean;
    wavesNcuk: boolean;
    hydrostaticTag: boolean;
  };
}

function repairTrainShardRecord(rec: VerifiedShardRecord): RepairedRecordResult {
  const item = rec.bankItem;
  const allText = collectRecordText(item);
  const isNcuk = item.syllabi.some((s) => s.syllabus === "ncuk");

  const needsFieldsZero =
    item.provenance.domain === "fields" &&
    /\+0 C|\b0 kg\b|2 × 0 ×|\/ 0\)|\(0\)\(|= 0 J\b/.test(allText);
  const needsQnZero =
    item.provenance.domain === "quantum-nuclear" &&
    /(?:= 0\.00 J|\/ 0\.00|= 0\.00 \/|0\.00 \/ \(6\.63)/.test(allText);
  const needsEmZero =
    item.provenance.domain === "em-induction" &&
    /(?:\(0 ×|\/ \(0 ×)/.test(allText);
  const needsArticle = hasArticleGrammarBug(allText);
  const needsThermalNcuk =
    item.provenance.templateArchetype === "isobaric-isochoric-open-first-law" &&
    isNcuk &&
    /\bW_by\b|work done by the gas/i.test(allText);
  const needsWavesNcuk =
    item.provenance.domain === "waves" &&
    item.provenance.conceptId === "double-slit-interference" &&
    isNcuk &&
    !/w\s*=\s*λD\s*\/\s*s/.test(item.workedSolution);
  const needsHydrostaticTag =
    item.provenance.templateArchetype ===
      "hydrostatic-depth-pressure-uncertainty" &&
    item.syllabi.some(
      (s) => s.syllabus === "ncuk" && s.subtopicId === "ncuk-ac2-2",
    );

  const anyRepair =
    needsFieldsZero ||
    needsQnZero ||
    needsEmZero ||
    needsArticle ||
    needsThermalNcuk ||
    needsWavesNcuk ||
    needsHydrostaticTag;

  if (!anyRepair) {
    return {
      record: rec,
      repaired: false,
      categories: {
        fieldsZero: false,
        qnZero: false,
        emZero: false,
        article: false,
        thermalNcuk: false,
        wavesNcuk: false,
        hydrostaticTag: false,
      },
    };
  }

  const step1 = JSON.parse(rec.distillationTrace.messages[2].content) as {
    domain: SixthPhysicsBankItem["provenance"]["domain"];
    scenarioSpec: Record<string, unknown>;
    hiddenQuantities: string[];
    questionPlan?: CandidateQuestionPlan;
  };
  const scenarioSpec = step1.scenarioSpec;
  const hiddenQuantities = [...(step1.hiddenQuantities ?? [])];
  const questionPlan = step1.questionPlan
    ? {
        ...step1.questionPlan,
        ...(step1.questionPlan.distractorStrategy
          ? { distractorStrategy: [...step1.questionPlan.distractorStrategy] }
          : {}),
        ...(step1.questionPlan.subpartStrategy
          ? { subpartStrategy: [...step1.questionPlan.subpartStrategy] }
          : {}),
        ...(step1.questionPlan.assumptions
          ? { assumptions: [...step1.questionPlan.assumptions] }
          : {}),
      }
    : undefined;

  let stem = item.stem;
  let workedSolution = item.workedSolution;
  let options: McqOptionItem[] | undefined = item.options
    ? item.options.map((o) => ({ ...o }))
    : undefined;
  let parts: StructuredQuestionPart[] | undefined = item.parts
    ? item.parts.map((p) => ({
        ...p,
        workingSteps: [...p.workingSteps],
        ...(p.dependsOnPartIds
          ? { dependsOnPartIds: [...p.dependsOnPartIds] }
          : {}),
      }))
    : undefined;
  let markScheme = item.markScheme.map((m) => ({ ...m }));
  let syllabi: SyllabusTag[] = item.syllabi.map((s) => ({ ...s }));

  // 1. Fields zero-clamp repair (+0 C, 0 kg, (0)(V) = 0 J, √(2 × 0 × V / 0))
  if (needsFieldsZero) {
    const q = Number(scenarioSpec.chargeC);
    const m = Number(scenarioSpec.massKg);
    const dv = Number(scenarioSpec.potentialDifferenceV);
    const workJ = Number(item.verifiedQuantities.workJ);
    if (Number.isFinite(q) && Number.isFinite(m) && q !== 0 && m !== 0) {
      const qPlain = formatGivenClean(Math.abs(q));
      const mPlain = formatGivenClean(m);
      const qPlainC = formatGivenClean(Math.abs(q), "C");
      const mPlainKg = formatGivenClean(m, "kg");
      const workStr = Number.isFinite(workJ) ? formatSci3sf(workJ, "J") : "0 J";
      const workNoUnit = Number.isFinite(workJ) ? formatSci3sf(workJ) : "0";

      const fixFieldsText = (txt: string): string =>
        txt
          .replace(/\+0 C\b/g, `+${qPlainC}`)
          .replace(/\b0 kg\b/g, mPlainKg)
          .replace(
            new RegExp(`√\\(2 × 0 × ${String(dv).replace(".", "\\.")} / 0\\)`, "g"),
            `√(2 × ${qPlain} × ${dv} / ${mPlain})`,
          )
          .replace(
            new RegExp(`\\(0\\)\\(${String(dv).replace(".", "\\.")}\\) = 0 J`, "g"),
            `(${qPlain})(${dv}) = ${workStr}`,
          )
          .replace(
            new RegExp(`\\(0 C\\)\\(${String(dv).replace(".", "\\.")} V\\) = 0 J`, "g"),
            `(${qPlainC})(${dv} V) = ${workStr}`,
          )
          .replace(/\b0 J\b/g, workStr)
          .replace(/√\(2 × 0 \/ 0\)/g, `√(2 × ${workNoUnit} / ${mPlain})`);

      stem = fixFieldsText(stem);
      workedSolution = fixFieldsText(workedSolution);
      if (options) {
        options = options.map((o) => ({
          ...o,
          text: fixFieldsText(o.text),
          ...(o.distractorRationale
            ? { distractorRationale: fixFieldsText(o.distractorRationale) }
            : {}),
        }));
      }
      if (parts) {
        parts = parts.map((p) => ({
          ...p,
          prompt: fixFieldsText(p.prompt),
          expectedAnswer:
            p.targetQuantityKey === "workJ" && p.expectedAnswer === "0 J"
              ? workStr
              : fixFieldsText(p.expectedAnswer),
          workingSteps: p.workingSteps.map(fixFieldsText),
        }));
      }
      markScheme = markScheme.map((pt) => ({
        ...pt,
        criterion: fixFieldsText(pt.criterion),
      }));
    }
  }

  // 2. Quantum-nuclear zero-clamp repair (= 0.00 J & 0.00 / (6.63 × 10⁻³⁴))
  if (needsQnZero) {
    const energyJ = Number(
      item.verifiedQuantities.ionizationEnergyJ ??
        item.verifiedQuantities.photonEnergyJ ??
        item.verifiedQuantities.maxKineticEnergyJ,
    );
    if (Number.isFinite(energyJ) && Math.abs(energyJ) >= 1e-35) {
      const eJWithUnit = formatSci3sf(energyJ, "J");
      const eJPlain = formatSci3sf(energyJ);
      const fixQnText = (txt: string): string =>
        txt
          .replace(/=\s*0\.00 J\b/g, `= ${eJWithUnit}`)
          .replace(/=\s*0\.00\s*\/\s*\(/g, `= ${eJPlain} / (`)
          .replace(/\b0\.00\s*\/\s*\(/g, `${eJPlain} / (`)
          .replace(/\b0\.00 J\b/g, eJWithUnit);

      stem = fixQnText(stem);
      workedSolution = fixQnText(workedSolution);
      if (options) {
        options = options.map((o) => ({
          ...o,
          text: fixQnText(o.text),
          ...(o.distractorRationale
            ? { distractorRationale: fixQnText(o.distractorRationale) }
            : {}),
        }));
      }
      if (parts) {
        parts = parts.map((p) => ({
          ...p,
          prompt: fixQnText(p.prompt),
          expectedAnswer: fixQnText(p.expectedAnswer),
          workingSteps: p.workingSteps.map(fixQnText),
        }));
      }
      markScheme = markScheme.map((pt) => ({
        ...pt,
        criterion: fixQnText(pt.criterion),
      }));
    }
  }

  // 3. EM-induction zero-clamp repair (× 0 on elementary charge / particle mass)
  if (needsEmZero) {
    const q = Math.abs(Number(scenarioSpec.chargeC));
    const m = Number(scenarioSpec.massKg);
    const qStr = Number.isFinite(q) && q > 0 ? formatSci3sf(q) : undefined;
    const mStr = Number.isFinite(m) && m > 0 ? formatSci3sf(m) : undefined;
    const fixEmText = (txt: string): string => {
      let out = txt;
      if (qStr && mStr) {
        // e.g. a = (0 × 1390) / (0 × 0.04)
        out = out.replace(
          /\(0 × ([^)]+)\) \/ \(0 × ([^)]+)\)/g,
          `(${qStr} × $1) / (${mStr} × $2)`,
        );
      }
      if (qStr) {
        // e.g. / (0 × 0.7) in Bainbridge mass spectrometer
        out = out.replace(/\/ \(0 × ([^)]+)\)/g, `/ (${qStr} × $1)`);
      }
      return out;
    };

    stem = fixEmText(stem);
    workedSolution = fixEmText(workedSolution);
    if (parts) {
      parts = parts.map((p) => ({
        ...p,
        prompt: fixEmText(p.prompt),
        expectedAnswer: fixEmText(p.expectedAnswer),
        workingSteps: p.workingSteps.map(fixEmText),
      }));
    }
    markScheme = markScheme.map((pt) => ({
      ...pt,
      criterion: fixEmText(pt.criterion),
    }));
  }

  // 4. Thermal NCUK First Law sign convention repair (W_by -> ΔU = ΔQ + ΔW, work ON gas)
  if (needsThermalNcuk) {
    if (item.format === "mcq") {
      stem = stem
        .replace(
          /Taking thermal energy supplied to the gas and work done by the gas as positive, how much thermal energy Q is supplied to the gas during A → B\?/g,
          "Using the first law ΔU = ΔQ + ΔW (thermal energy supplied to the gas and work done on the gas positive), how much thermal energy ΔQ is supplied to the gas during A → B?",
        )
        .replace(
          /Defining heat transferred into the gas as positive \(with expansion work done by the gas positive\), calculate Q for process A → B\./g,
          "Defining thermal energy transferred into the gas and work done on the gas as positive (ΔU = ΔQ + ΔW), calculate ΔQ for process A → B.",
        )
        .replace(
          /Taking heat supplied to the gas and work done by the gas as positive, what is the total thermal energy Q supplied to the gas along A → B → C\?/g,
          "Using ΔU = ΔQ + ΔW (heat supplied to the gas and work done on the gas positive), what is the total thermal energy ΔQ supplied to the gas along A → B → C?",
        )
        .replace(
          /Defining expansion work done by the gas as positive, calculate the total thermal energy absorbed by the gas over A → B → C\./g,
          "Defining work done on the gas as positive (ΔU = ΔQ + ΔW), calculate the total thermal energy ΔQ absorbed by the gas over A → B → C.",
        );

      workedSolution = workedSolution
        .replace(
          /Work done by the gas W_by = P\(V_B − V_A\) = ([^=]+) = ([^=]+?) J\./g,
          "Work done on the gas during expansion is ΔW = −P(V_B − V_A) = −$1 = -$2 J.",
        )
        .replace(
          /By the first law, Q = ΔU \+ W_by =/g,
          "By the first law ΔU = ΔQ + ΔW, thermal energy supplied is ΔQ = ΔU − ΔW =",
        )
        .replace(
          /Along A → B → C, work done by the gas is W_by = 0 \+ P_B\(V_C − V_B\) = ([^=]+?) J\./g,
          "Along A → B → C, work done on the gas is ΔW = 0 − P_B(V_C − V_B) = -$1 J.",
        )
        .replace(
          /Hence Q = ΔU \+ W_by =/g,
          "By the first law ΔU = ΔQ + ΔW, thermal energy supplied is ΔQ = ΔU − ΔW =",
        );

      if (options) {
        options = options.map((o) =>
          o.distractorRationale
            ? {
                ...o,
                distractorRationale: o.distractorRationale
                  .replace(
                    /Reverses the work sign in the first law, evaluating Q = ΔU − W_by = \(3\/2 − 1\) P ΔV\./g,
                    "Reverses the work sign in ΔU = ΔQ + ΔW, adding negative expansion work ΔW instead of subtracting ΔW.",
                  )
                  .replace(
                    /Subtracts the positive expansion work done by the gas instead of adding Q = ΔU \+ W_by\./g,
                    "Reverses the sign of expansion work ΔW in ΔU = ΔQ + ΔW, adding negative ΔW instead of evaluating ΔQ = ΔU − ΔW.",
                  )
                  .replace(/work done by the gas/gi, "boundary work")
                  .replace(/done by the gas/gi, "during expansion"),
              }
            : o,
        );
      }
    } else if (parts) {
      const workOnGasJ = Number(
        item.verifiedQuantities["leg:1:workOnGasJ"] ??
          -Number(item.verifiedQuantities.netWorkJ),
      );
      const totalDeltaUJ = Number(item.verifiedQuantities.totalDeltaUJ);
      const netHeatJ = Number(item.verifiedQuantities.netHeatJ);
      const wOnAns = formatThermalSci(workOnGasJ, 3, "J");
      const duAns = formatThermalSci(totalDeltaUJ, 3, "J");
      const qAns = formatThermalSci(netHeatJ, 3, "J");

      if (!hiddenQuantities.includes("leg:1:workOnGasJ")) {
        hiddenQuantities.push("leg:1:workOnGasJ");
      }

      stem = stem
        .replace(
          /Throughout this question, take expansion work done by the gas and thermal energy supplied to the gas as positive\./g,
          "Throughout this question, use the first law ΔU = ΔQ + ΔW where thermal energy supplied to the gas (ΔQ) and work done on the gas (ΔW) are positive.",
        )
        .replace(
          /Take work done by the gas and heat transferred into the gas as positive\./g,
          "Use ΔU = ΔQ + ΔW with work done on the gas (ΔW) and heat transferred into the gas (ΔQ) taken as positive.",
        )
        .replace(
          /Use the convention where work done by the gas is positive\./g,
          "Use the sign convention ΔU = ΔQ + ΔW where work done on the gas is positive.",
        );

      parts = parts.map((p) => {
        if (p.partId === "a") {
          return {
            ...p,
            prompt:
              "Calculate the total mechanical work done on the gas ΔW along path A → B → C (including its sign).",
            targetQuantityKey: "leg:1:workOnGasJ",
            expectedAnswer: wOnAns,
            workingSteps: [
              "ΔW_AB = 0 (isochoric step).",
              `ΔW_BC = −P_B (V_C − V_B) = ${wOnAns}.`,
            ],
          };
        }
        if (p.partId === "c") {
          return {
            ...p,
            prompt:
              "Determine the total thermal energy ΔQ supplied to the gas over the complete path A → B → C.",
            workingSteps: [
              `By the first law of thermodynamics (ΔU = ΔQ + ΔW), ΔQ = ΔU_AC − ΔW = ${formatThermalSci(totalDeltaUJ, 4)} − (${formatThermalSci(workOnGasJ, 4)}) = ${qAns}.`,
            ],
          };
        }
        return p;
      });

      workedSolution = `(a) Work is done only along B → C: ΔW = −P_B(V_C − V_B) = ${wOnAns}. (b) ΔU_AC = (3/2)(P_C V_C − P_A V_A) = ${duAns}. (c) By ΔU = ΔQ + ΔW, total heat supplied ΔQ = ΔU_AC − ΔW = ${qAns}.`;
      markScheme = [
        {
          code: "M1",
          partId: "a",
          criterion: "Identifies ΔW_AB = 0 and computes ΔW = −P_B(V_C − V_B).",
          marks: 1,
        },
        {
          code: "A1",
          partId: "a",
          criterion: `Obtains ${wOnAns}.`,
          marks: 1,
        },
        {
          code: "M1",
          partId: "b",
          criterion: "Applies ΔU = (3/2)(P_C V_C − P_A V_A).",
          marks: 1,
        },
        {
          code: "A1",
          partId: "b",
          criterion: `Obtains ${duAns}.`,
          marks: 1,
        },
        {
          code: "M1",
          partId: "c",
          criterion:
            "Applies ΔU = ΔQ + ΔW ⇒ ΔQ = ΔU_AC − ΔW to obtain total heat supplied.",
          marks: 1,
        },
        {
          code: "A1",
          partId: "c",
          criterion: `Obtains ${qAns}.`,
          marks: 1,
        },
      ];
      if (questionPlan?.subpartStrategy && questionPlan.subpartStrategy.length > 0) {
        questionPlan.subpartStrategy[0] =
          "Total work done on the gas across isochoric and isobaric legs";
      }
    }
  }

  // 5. Waves NCUK double-slit notation note (w = λD / s)
  if (needsWavesNcuk) {
    workedSolution = `${workedSolution.trim()} (In NCUK/A-Level notation, w = λD / s where w is fringe spacing and s is slit separation.)`;
  }

  // 6. Indefinite article grammar cleanup across all prose fields
  if (needsArticle) {
    stem = fixArticleGrammar(stem);
    workedSolution = fixArticleGrammar(workedSolution);
    if (options) {
      options = options.map((o) => ({
        ...o,
        text: fixArticleGrammar(o.text),
        ...(o.distractorRationale
          ? { distractorRationale: fixArticleGrammar(o.distractorRationale) }
          : {}),
      }));
    }
    if (parts) {
      parts = parts.map((p) => ({
        ...p,
        prompt: fixArticleGrammar(p.prompt),
        expectedAnswer: fixArticleGrammar(p.expectedAnswer),
        workingSteps: p.workingSteps.map(fixArticleGrammar),
      }));
    }
    markScheme = markScheme.map((pt) => ({
      ...pt,
      criterion: fixArticleGrammar(pt.criterion),
    }));
  }

  // 7. Re-tag train-split hydrostatic-depth-pressure-uncertainty NCUK tag ncuk-ac2-2 -> ncuk-ac3-1
  if (needsHydrostaticTag) {
    syllabi = syllabi.map((tag) =>
      tag.syllabus === "ncuk" && tag.subtopicId === "ncuk-ac2-2"
        ? {
            syllabus: "ncuk",
            level: "IFY-S1",
            topicId: "ncuk-ac3",
            subtopicId: "ncuk-ac3-1",
          }
        : tag,
    );
  }

  // Reconstruct CandidateQuestionInput and run full deterministic gate verification
  const hiddenSet = new Set(hiddenQuantities);
  const reconstructedGivens = Object.entries(item.verifiedQuantities)
    .filter(
      ([key, val]) =>
        !hiddenSet.has(key) &&
        typeof val === "number" &&
        Number.isFinite(val) &&
        Math.abs(val) > 1e-12 &&
        textContainsNumericValue(stem, val, {
          significantFigures: 3,
          relativeTolerance: 0.01,
          allowMagnitudeMatch: true,
        }),
    )
    .map(([name, val]) => ({
      name,
      value: val as number,
      source: "stem" as const,
    }));

  const targetQuantityKey = resolveMcqTargetQuantityKey(item, hiddenQuantities);
  const repairedCandidate: CandidateQuestionInput = {
    id: item.id,
    conceptId: item.provenance.conceptId,
    templateArchetype: item.provenance.templateArchetype,
    ...(item.provenance.sourceParentId
      ? { sourceParentId: item.provenance.sourceParentId }
      : {}),
    seed: item.provenance.seed,
    syllabi,
    format: item.format,
    ...(item.questionStyle ? { questionStyle: item.questionStyle } : {}),
    difficulty: item.difficulty,
    domain: item.provenance.domain,
    scenarioSpec,
    hiddenQuantities,
    requiredGivens: reconstructedGivens,
    ...(questionPlan ? { questionPlan } : {}),
    stem,
    ...(options ? { options } : {}),
    ...(targetQuantityKey ? { targetQuantityKey } : {}),
    ...(parts ? { parts } : {}),
    workedSolution,
    markScheme,
    totalMarks: item.totalMarks,
    generatorModel: item.provenance.generatorModel,
  };

  const gateExec = verifyCandidateWithGate(repairedCandidate, {
    existingShardItems: [],
  });
  if (!gateExec.evaluation.valid || !gateExec.solveOutput) {
    throw new Error(
      `Repaired train item "${item.id}" failed package-gate: ${JSON.stringify(gateExec.evaluation.issues)}`,
    );
  }

  const adapter = getDomainAdapter(repairedCandidate.domain);
  const visualFamily =
    gateExec.renderOutput?.visualFamily ??
    (gateExec.effectiveSvgMarkup ? adapter.defaultVisualFamily : item.visualFamily);

  const repairedBankItem: SixthPhysicsBankItem = {
    schemaVersion: SIXTHPHYSICS_BANK_ITEM_SCHEMA_VERSION,
    id: item.id,
    familyGroupKey: item.familyGroupKey,
    syllabi,
    format: item.format,
    ...(item.questionStyle ? { questionStyle: item.questionStyle } : {}),
    difficulty: item.difficulty,
    visualFamily,
    stem: stem.trim(),
    ...(gateExec.effectiveSvgMarkup !== undefined
      ? { svgMarkup: gateExec.effectiveSvgMarkup }
      : item.svgMarkup !== undefined
        ? { svgMarkup: item.svgMarkup }
        : {}),
    ...(item.format === "mcq" && options
      ? {
          options: options as [
            McqOptionItem,
            McqOptionItem,
            McqOptionItem,
            McqOptionItem,
          ],
          correctOptionIndex: gateExec.correctOptionIndex,
        }
      : {}),
    ...(item.format === "structured" && parts ? { parts } : {}),
    workedSolution: workedSolution.trim(),
    markScheme,
    totalMarks: item.totalMarks,
    verifiedQuantities: gateExec.solveOutput.quantities,
    provenance: {
      ...item.provenance,
      solverId: gateExec.solveOutput.solverId,
      ...(gateExec.renderOutput?.rendererVersion
        ? { rendererVersion: gateExec.renderOutput.rendererVersion }
        : {}),
      stemFingerprint: gateExec.evaluation.stemFingerprint,
      ...(gateExec.evaluation.svgFingerprint
        ? { svgFingerprint: gateExec.evaluation.svgFingerprint }
        : {}),
      split: "train",
    },
  };

  const rebuiltTrace = buildQwenDistillationTrace({
    candidate: repairedCandidate,
    bankItem: repairedBankItem,
    split: "train",
    publicVisualLabels: gateExec.renderOutput?.publicLabels,
  });
  const traceCheck = validateQwenDistillationTrace(rebuiltTrace);
  if (!traceCheck.valid) {
    throw new Error(
      `Repaired train item "${item.id}" failed distillation trace validation: ${traceCheck.issues.join("; ")}`,
    );
  }

  return {
    record: {
      schemaVersion: SHARD_RECORD_SCHEMA_VERSION,
      shardId: rec.shardId,
      ingestedAt: rec.ingestedAt,
      bankItem: repairedBankItem,
      distillationTrace: rebuiltTrace,
      gateChecksPassed: gateExec.evaluation.passedChecks,
    },
    repaired: true,
    categories: {
      fieldsZero: needsFieldsZero,
      qnZero: needsQnZero,
      emZero: needsEmZero,
      article: needsArticle,
      thermalNcuk: needsThermalNcuk,
      wavesNcuk: needsWavesNcuk,
      hydrostaticTag: needsHydrostaticTag,
    },
  };
}

export interface BuildBankV3Result {
  outDir: string;
  sourceItemCount: number;
  newNcukV3ItemCount: number;
  totalCompiledItems: number;
  overallPassRate: number;
  zeroContaminationVerified: boolean;
  trainRepairs: TrainRepairSummary;
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
    trainV3NcukJsonl: string;
  };
}

export function runBuildBankV3(
  args: ParsedBuildBankV3Args,
  options: BuildBankV3Options = {},
): BuildBankV3Result {
  if (path.resolve(args.sourceBankDir) === path.resolve(args.outDir)) {
    throw new Error(
      "--source-dir and --out-dir must be distinct so concurrent readers of the source bank are undisturbed",
    );
  }

  const shardSpecs = options.shardSpecs ?? NCUK_V3_SHARD_SPECS;
  const compiledAt = options.compiledAt ?? DEFAULT_V3_TIMESTAMP;

  const srcManifestPath = path.join(
    args.sourceBankDir,
    "frozen-eval-manifest.json",
  );
  const srcValPath = path.join(args.sourceBankDir, "distillation", "val.jsonl");
  const srcTestPath = path.join(args.sourceBankDir, "distillation", "test.jsonl");
  const srcShardsDir = path.join(args.sourceBankDir, "shards");

  for (const requiredPath of [srcManifestPath, srcValPath, srcTestPath, srcShardsDir]) {
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
    throw new Error("Source frozen-eval-manifest.json must have lockHeldOut: true");
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

  const v3ShardsDir = path.join(args.outDir, "shards");
  fs.mkdirSync(v3ShardsDir, { recursive: true });
  fs.copyFileSync(
    srcManifestPath,
    path.join(args.outDir, "frozen-eval-manifest.json"),
  );

  // 1. Copy/repair existing shards: held-out records stay 100% byte-for-byte untouched;
  //    train-split bug records are deterministically repaired through verifyCandidateWithGate.
  const seenIds = new Set<string>();
  const seenSeeds = new Set<number>();
  const seenStemFingerprints = new Set<string>();
  const globalShinglesPool: Array<ReadonlySet<string>> = [];
  let sourceItemCount = 0;

  const trainRepairs: TrainRepairSummary = {
    fieldsZeroClampRepaired: 0,
    quantumNuclearZeroClampRepaired: 0,
    emInductionZeroClampRepaired: 0,
    articleGrammarRepaired: 0,
    thermalFirstLawNcukRepaired: 0,
    wavesDoubleSlitNcukRepaired: 0,
    hydrostaticNcukTagRepaired: 0,
    totalTrainRecordsRepaired: 0,
    heldOutRecordsPreservedUntouched: 0,
  };

  const srcShardFiles = fs.readdirSync(srcShardsDir).sort();
  for (const fileName of srcShardFiles) {
    if (!fileName.endsWith(".jsonl")) continue;
    const srcFile = path.join(srcShardsDir, fileName);
    const dstFile = path.join(v3ShardsDir, fileName);

    if (fileName.endsWith(".attempts.jsonl")) {
      fs.copyFileSync(srcFile, dstFile);
      continue;
    }

    const rawLines = fs
      .readFileSync(srcFile, "utf8")
      .split("\n")
      .filter((line) => line.trim().length > 0);
    const outLines: string[] = [];

    for (const rawLine of rawLines) {
      const rec = JSON.parse(rawLine) as VerifiedShardRecord;
      sourceItemCount += 1;

      if (heldOutIds.has(rec.bankItem.id)) {
        // 100% byte-for-byte untouched preservation for frozen val/test records
        outLines.push(rawLine);
        trainRepairs.heldOutRecordsPreservedUntouched += 1;
        seenIds.add(rec.bankItem.id);
        seenSeeds.add(rec.bankItem.provenance.seed);
        seenStemFingerprints.add(rec.bankItem.provenance.stemFingerprint);
        globalShinglesPool.push(computeShingleSet(rec.bankItem.stem));
        heldOutGroups.add(rec.bankItem.familyGroupKey);
        const srcKey = buildSourceGroupKey(rec.bankItem.provenance.sourceParentId);
        if (srcKey) heldOutGroups.add(srcKey);
        continue;
      }

      const result = repairTrainShardRecord(rec);
      if (result.repaired) {
        trainRepairs.totalTrainRecordsRepaired += 1;
        if (result.categories.fieldsZero) trainRepairs.fieldsZeroClampRepaired += 1;
        if (result.categories.qnZero) trainRepairs.quantumNuclearZeroClampRepaired += 1;
        if (result.categories.emZero) trainRepairs.emInductionZeroClampRepaired += 1;
        if (result.categories.article) trainRepairs.articleGrammarRepaired += 1;
        if (result.categories.thermalNcuk) trainRepairs.thermalFirstLawNcukRepaired += 1;
        if (result.categories.wavesNcuk) trainRepairs.wavesDoubleSlitNcukRepaired += 1;
        if (result.categories.hydrostaticTag) trainRepairs.hydrostaticNcukTagRepaired += 1;
        outLines.push(JSON.stringify(result.record));
      } else {
        outLines.push(rawLine);
      }

      const finalRec = result.record;
      seenIds.add(finalRec.bankItem.id);
      seenSeeds.add(finalRec.bankItem.provenance.seed);
      seenStemFingerprints.add(finalRec.bankItem.provenance.stemFingerprint);
      globalShinglesPool.push(computeShingleSet(finalRec.bankItem.stem));
    }

    fs.writeFileSync(
      dstFile,
      outLines.length > 0 ? `${outLines.join("\n")}\n` : "",
      "utf8",
    );
  }

  // 2. Generate, gate-verify, and ingest all registered NCUK v3 shards
  const v3ShardReports: Array<{
    shardId: string;
    generatedCount: number;
    ingestedCount: number;
  }> = [];
  const newNcukV3Traces: QwenDistillationTrace[] = [];

  for (const spec of shardSpecs) {
    const v3ShardFile = shardJsonlPath(v3ShardsDir, spec.shardId);
    const v3AttemptsFile = shardAttemptsPath(v3ShardsDir, spec.shardId);
    if (fs.existsSync(v3ShardFile)) fs.rmSync(v3ShardFile, { force: true });
    if (fs.existsSync(v3AttemptsFile)) fs.rmSync(v3AttemptsFile, { force: true });

    const generated = spec.generate({
      baseSeed: spec.baseSeed,
      generatorModel: args.generatorModel,
    });
    const styleById = new Map<string, CandidateQuestionInput["questionStyle"]>();
    const verifiedBatch: CandidateQuestionInput[] = [];

    for (const rawCand of generated) {
      const candidate: CandidateQuestionInput = {
        ...rawCand,
        questionStyle: rawCand.questionStyle ?? inferNcukV3QuestionStyle(rawCand),
        generatorModel: rawCand.generatorModel ?? args.generatorModel,
      };
      const familyGroupKey = buildFamilyGroupKey({
        conceptId: candidate.conceptId,
        templateArchetype: candidate.templateArchetype,
        sourceParentId: candidate.sourceParentId,
      });
      const sourceGroupKey = buildSourceGroupKey(candidate.sourceParentId);

      // Strict held-out isolation: never target a frozen val/test family or connected source
      if (
        heldOutGroups.has(familyGroupKey) ||
        (sourceGroupKey !== undefined && heldOutGroups.has(sourceGroupKey))
      ) {
        throw new Error(
          `NCUK v3 candidate "${candidate.id}" in shard "${spec.shardId}" collides with locked held-out family "${familyGroupKey}"`,
        );
      }
      if (seenIds.has(candidate.id)) {
        throw new Error(
          `Duplicate candidate id "${candidate.id}" in NCUK v3 shard "${spec.shardId}"`,
        );
      }
      if (seenSeeds.has(candidate.seed)) {
        throw new Error(
          `Duplicate seed ${candidate.seed} on candidate "${candidate.id}" in NCUK v3 shard "${spec.shardId}"`,
        );
      }

      const stemFp = computeStemFingerprint(candidate.stem);
      if (seenStemFingerprints.has(stemFp)) {
        throw new Error(
          `Duplicate stem fingerprint on NCUK v3 candidate "${candidate.id}" in shard "${spec.shardId}"`,
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
          `Near-duplicate stem (>= ${args.nearDuplicateThreshold}) on NCUK v3 candidate "${candidate.id}" in shard "${spec.shardId}"`,
        );
      }

      const gateExec = verifyCandidateWithGate(candidate, {
        existingShardItems: [],
        nearDuplicateSimilarityThreshold: args.nearDuplicateThreshold,
      });
      if (!gateExec.evaluation.valid || !gateExec.solveOutput) {
        throw new Error(
          `NCUK v3 candidate "${candidate.id}" in shard "${spec.shardId}" failed package-gate: ${JSON.stringify(gateExec.evaluation.issues)}`,
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
      shardsDir: v3ShardsDir,
      candidates: verifiedBatch,
      frozenManifest,
      now: () => compiledAt,
      nearDuplicateSimilarityThreshold: args.nearDuplicateThreshold,
    });
    if (ingestSummary.rejectedCount > 0 || ingestSummary.alreadyPresentCount > 0) {
      throw new Error(
        `Unexpected shard ingest issue in ${spec.shardId}: rejected=${ingestSummary.rejectedCount}, alreadyPresent=${ingestSummary.alreadyPresentCount}`,
      );
    }

    // Preserve optional questionStyle on bankItem inside the new v3 shard JSONL
    const shardRecords = readShardRecords(v3ShardsDir, spec.shardId);
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
        newNcukV3Traces.push(rec.distillationTrace);
      }
    } else {
      for (const rec of shardRecords) {
        newNcukV3Traces.push(rec.distillationTrace);
      }
    }

    v3ShardReports.push({
      shardId: spec.shardId,
      generatedCount: generated.length,
      ingestedCount: ingestSummary.ingestedCount,
    });
  }

  // 3. Compile full v3 bank with locked held-out evaluation splits
  const compiledSummary = compileBankFromShards({
    shardsDir: v3ShardsDir,
    outDir: args.outDir,
    frozenManifest,
    lockHeldOut: true,
    compiledAt,
    nearDuplicateSimilarityThreshold: args.nearDuplicateThreshold,
  });

  // 4. Write standalone distillation/train-v3-ncuk.jsonl containing all new NCUK v3 traces
  newNcukV3Traces.sort((a, b) => a.itemId.localeCompare(b.itemId));
  for (const trace of newNcukV3Traces) {
    const check = validateQwenDistillationTrace(trace);
    if (!check.valid) {
      throw new Error(
        `Invalid NCUK v3 trace "${trace.traceId}": ${check.issues.join("; ")}`,
      );
    }
  }
  const trainV3NcukPath = path.join(
    args.outDir,
    "distillation",
    "train-v3-ncuk.jsonl",
  );
  fs.writeFileSync(
    trainV3NcukPath,
    newNcukV3Traces.length > 0
      ? newNcukV3Traces.map((t) => JSON.stringify(t)).join("\n") + "\n"
      : "",
    "utf8",
  );

  // Ensure domain-tool-schemas.json exists in outDir
  const domainSchemasPath = path.join(args.outDir, "domain-tool-schemas.json");
  const schemaDoc = buildDeterministicDomainToolSchemas();
  fs.writeFileSync(
    domainSchemasPath,
    JSON.stringify(schemaDoc, null, 2) + "\n",
    "utf8",
  );

  // 5. HARD-ASSERT exact SHA-256 parity of frozen-eval-manifest.json, val.jsonl, and test.jsonl vs --source-dir
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
  const outTrainV3NcukSha = sha256File(trainV3NcukPath);

  if (outManifestSha !== srcManifestSha || outDistManifestSha !== srcManifestSha) {
    throw new Error(
      `v3 frozen-eval-manifest.json SHA-256 parity failure: source=${srcManifestSha}, out=${outManifestSha}, dist=${outDistManifestSha}`,
    );
  }
  if (outValSha !== srcValSha) {
    throw new Error(
      `v3 distillation/val.jsonl SHA-256 parity failure: source=${srcValSha}, out=${outValSha}`,
    );
  }
  if (outTestSha !== srcTestSha) {
    throw new Error(
      `v3 distillation/test.jsonl SHA-256 parity failure: source=${srcTestSha}, out=${outTestSha}`,
    );
  }
  if (!args.allowCustomManifest) {
    if (outManifestSha !== EXPECTED_FROZEN_MANIFEST_SHA256) {
      throw new Error(
        `v3 frozen-eval-manifest.json lock mismatch: expected ${EXPECTED_FROZEN_MANIFEST_SHA256}, got ${outManifestSha}`,
      );
    }
    if (outValSha !== EXPECTED_VAL_JSONL_SHA256) {
      throw new Error(
        `v3 distillation/val.jsonl lock mismatch: expected ${EXPECTED_VAL_JSONL_SHA256}, got ${outValSha}`,
      );
    }
    if (outTestSha !== EXPECTED_TEST_JSONL_SHA256) {
      throw new Error(
        `v3 distillation/test.jsonl lock mismatch: expected ${EXPECTED_TEST_JSONL_SHA256}, got ${outTestSha}`,
      );
    }
  }
  if (!compiledSummary.splitSummary.zeroContaminationVerified) {
    throw new Error("v3 zeroContaminationVerified is false!");
  }
  if (
    compiledSummary.deduplication.duplicateIdsSkipped.length > 0 ||
    compiledSummary.deduplication.nearDuplicateIdsSkipped.length > 0
  ) {
    throw new Error(
      `v3 deduplication skipped items unexpectedly: dupIds=${compiledSummary.deduplication.duplicateIdsSkipped.length}, nearDup=${compiledSummary.deduplication.nearDuplicateIdsSkipped.length}`,
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
    sourceItemCount,
    newNcukV3ItemCount: newNcukV3Traces.length,
    totalCompiledItems: compiledSummary.totalCompiledItems,
    overallPassRate: compiledSummary.attemptMetrics.overallPassRate,
    zeroContaminationVerified:
      compiledSummary.splitSummary.zeroContaminationVerified,
    trainRepairs,
    v3ShardReports,
    splitItemCounts: compiledSummary.splitSummary.itemCounts,
    sha256Receipts: {
      frozenEvalManifest: outManifestSha,
      valJsonl: outValSha,
      testJsonl: outTestSha,
      trainJsonl: outTrainSha,
      trainV3NcukJsonl: outTrainV3NcukSha,
    },
  };
}

export function runBuildBankV3Cli(argv: readonly string[]): number {
  const args = parseBuildBankV3Args(argv);
  if (args.help) {
    printUsage();
    return 0;
  }

  const result = runBuildBankV3(args);
  console.log(JSON.stringify(result, null, 2));
  return 0;
}

if (require.main === module) {
  try {
    process.exitCode = runBuildBankV3Cli(process.argv.slice(2));
  } catch (error) {
    console.error(
      JSON.stringify({
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    process.exitCode = 1;
  }
}
