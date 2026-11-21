import fs from "node:fs";
import path from "node:path";

import {
  PHYSICS_DOMAIN_IDS,
  QUESTION_DIFFICULTIES,
  SYLLABUS_IDS,
  type PhysicsDomainId,
  type QuestionDifficulty,
  type SixthPhysicsBankItem,
  type SyllabusId,
  type SyllabusTag,
} from "../../lib/bank-pipeline/types";
import {
  ALEVEL_PHYSICS_SYLLABUS,
  IB_PHYSICS_SYLLABUS,
  NCUK_PHYSICS_SYLLABUS,
  type SyllabusLevel,
  type SyllabusSpecificationCatalogue,
} from "../../lib/constants/syllabi";
import { resolveEffectiveAlevelLevels } from "../../lib/sixthphysics-web/alevel-levels";
import { resolveEffectiveNcukLevels } from "../../lib/sixthphysics-web/ncuk-levels";
import {
  PUBLIC_BANK_CHUNK_SCHEMA_VERSION,
  PUBLIC_BANK_MANIFEST_SCHEMA_VERSION,
  type PublicBankChunkFile,
  type PublicBankItem,
  type PublicBankManifest,
  type PublicDomainChunkSummary,
  type PublicQuestionIndexRow,
  type PublicSubtopicSummary,
  type PublicSyllabusSummary,
  type PublicTopicSummary,
} from "../../lib/sixthphysics-web/types";

export const DEFAULT_SOURCE_ALL_ITEMS_PATH =
  "dataset/sixthphysics-bank/bank/all-items.json";
export const DEFAULT_SOURCE_INDEX_PATH =
  "dataset/sixthphysics-bank/bank/index.json";
export const DEFAULT_PUBLIC_OUT_DIR = "public/sixthphysics-data";
export const DEFAULT_SEED_FALLBACK_PATH =
  "lib/sixthphysics-web/seed-fallback.ts";
export const DEFAULT_MAX_ITEMS_PER_FAMILY = 12;

export type RawPublicBankInput = SixthPhysicsBankItem & {
  questionStyle?: string;
  scenarioSpec?: Record<string, unknown>;
};

const DETERMINISTIC_FALLBACK_GENERATED_AT = "2026-11-17T23:21:18.834Z";

const SYLLABUS_CATALOGUES: Record<SyllabusId, SyllabusSpecificationCatalogue> =
  {
    ib: IB_PHYSICS_SYLLABUS,
    alevel: ALEVEL_PHYSICS_SYLLABUS,
    ncuk: NCUK_PHYSICS_SYLLABUS,
  };

const SYLLABUS_META: Record<
  SyllabusId,
  {
    shortLabel: string;
    gravityConvention: string;
    levels: SyllabusLevel[];
  }
> = {
  ib: {
    shortLabel: "IB Physics",
    gravityConvention: "g = 9.8 m s⁻²",
    levels: ["SL", "HL"],
  },
  alevel: {
    shortLabel: "UK A-Level",
    gravityConvention: "g = 9.81 m s⁻²",
    levels: ["Y12", "Y13"],
  },
  ncuk: {
    shortLabel: "NCUK IFY",
    gravityConvention: "g = 9.81 m s⁻²",
    levels: ["IFY", "IFY-S1", "IFY-S2"],
  },
};

const SUPERSCRIPT_CHAR_MAP: Record<string, string> = {
  "-": "⁻",
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

function toSuperscriptExponent(exp: number): string {
  return String(exp)
    .split("")
    .map((ch) => SUPERSCRIPT_CHAR_MAP[ch] ?? ch)
    .join("");
}

/**
 * Formats micro/atomic physical constants to 3 significant figures in clean
 * Unicode scientific notation (e.g. `1.60 × 10⁻¹⁹`, `9.11 × 10⁻³¹`).
 */
export function formatMicroScientific(value: number): string {
  if (!Number.isFinite(value) || value === 0) {
    return "0";
  }
  const sign = value < 0 ? "−" : "";
  const abs = Math.abs(value);
  const [mantissa, rawExp] = abs.toExponential(2).split("e");
  const exp = Number.parseInt(rawExp ?? "0", 10);
  if (exp === 0) {
    return `${sign}${mantissa}`;
  }
  return `${sign}${mantissa} × 10${toSuperscriptExponent(exp)}`;
}

const INDEFINITE_ARTICLE_VOWEL_RE =
  /(^|[\s,;:–—])([aA])\s+(electron(?:-[a-z]+)?|electromagnetic|electrostatic|alpha(?:-particle)?|ion(?:-[a-z]+)?|isochoric|isobaric|isothermal|adiabatic|industrial|isolated|accelerator(?:-[a-z]+)*|oscilloscope|optical|autonomous|aircraft|asteroidal|avionics|audio|atomic(?:-[a-z]+)?|inclined|iodine-\d+|ammeter|alternating)\b/g;

/**
 * Clean, non-destructive student-facing grammar sanitizer for locked bank items
 * (fixes `a electron` -> `an electron`, `a electromagnetic` -> `an electromagnetic`,
 * `a electrostatic` -> `an electrostatic`, etc., without touching physics variable `a`).
 */
export function sanitizeStudentText(text: string): string {
  return text.replace(
    INDEFINITE_ARTICLE_VOWEL_RE,
    (match, prefix: string, article: string, word: string, offset: number, full: string) => {
      const before = full.slice(Math.max(0, offset - 14), offset).toLowerCase();
      if (/\bacceleration\s*$/.test(before) || /\bconstant\s*$/.test(before)) {
        return match;
      }
      return `${prefix}${article}n ${word}`;
    },
  );
}

function getFinitePositiveNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : undefined;
}

function getFiniteNonZeroNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value !== 0
    ? value
    : undefined;
}

function inferParticleChargeAndMass(
  raw: RawPublicBankInput,
): { chargeC?: number; massKg?: number } {
  const spec = raw.scenarioSpec;
  const vq = raw.verifiedQuantities ?? {};

  let chargeC =
    getFiniteNonZeroNumber(spec?.chargeC) ??
    getFiniteNonZeroNumber(spec?.particleChargeC) ??
    getFiniteNonZeroNumber(vq.chargeC) ??
    getFinitePositiveNumber(vq.chargeMagnitudeC);

  let massKg =
    getFinitePositiveNumber(spec?.massKg) ??
    getFinitePositiveNumber(spec?.particleMassKg) ??
    getFinitePositiveNumber(vq.massKg);

  const workJ = getFinitePositiveNumber(vq.workJ);
  const finalSpeedMs = getFinitePositiveNumber(vq.finalSpeedMs);
  const fieldNC = getFinitePositiveNumber(vq.fieldNC);
  const accelerationMs2 = getFinitePositiveNumber(vq.accelerationMs2);

  if (chargeC === undefined && workJ !== undefined) {
    const vMatch =
      raw.workedSolution.match(/2\s*×\s*0\s*×\s*(\d+(?:\.\d+)?)\s*\//) ??
      raw.stem.match(/potential difference\s+(\d+(?:\.\d+)?)\s*V\b/i) ??
      raw.stem.match(/\+(\d+(?:\.\d+)?)\s*V\b/) ??
      raw.stem.match(/from the\s+(\d+(?:\.\d+)?)\s*V\s+plate/i);
    const voltage = vMatch ? Number.parseFloat(vMatch[1]) : Number.NaN;
    if (Number.isFinite(voltage) && voltage > 0) {
      chargeC = workJ / voltage;
    }
  }

  if (massKg === undefined && workJ !== undefined && finalSpeedMs !== undefined) {
    massKg = (2 * workJ) / (finalSpeedMs * finalSpeedMs);
  } else if (
    massKg === undefined &&
    chargeC !== undefined &&
    fieldNC !== undefined &&
    accelerationMs2 !== undefined
  ) {
    massKg = (Math.abs(chargeC) * fieldNC) / accelerationMs2;
  }

  // Clean physical fallback by particle name when neither scenarioSpec nor verifiedQuantities provides q/m
  const lowerStem = raw.stem.toLowerCase();
  if (chargeC === undefined || massKg === undefined) {
    if (lowerStem.includes("deuteron")) {
      chargeC ??= 1.6e-19;
      massKg ??= 3.34e-27;
    } else if (lowerStem.includes("alpha")) {
      chargeC ??= 3.2e-19;
      massKg ??= 6.64e-27;
    } else if (lowerStem.includes("electron")) {
      chargeC ??= -1.6e-19;
      massKg ??= 9.11e-31;
    } else if (lowerStem.includes("lithium")) {
      chargeC ??= 1.6e-19;
      massKg ??= 1.16e-26;
    } else if (lowerStem.includes("sodium")) {
      chargeC ??= 1.6e-19;
      massKg ??= 3.82e-26;
    } else if (lowerStem.includes("proton")) {
      chargeC ??= 1.6e-19;
      massKg ??= 1.67e-27;
    }
  }

  return { chargeC, massKg };
}

function createNumericDefectSanitizer(
  raw: RawPublicBankInput,
): (text: string) => string {
  const vq = raw.verifiedQuantities ?? {};
  const needsZeroClampRepair =
    raw.familyGroupKey.includes("parallel-plate-ion-acceleration-speed") ||
    raw.familyGroupKey.includes("accelerated-ion-beam-magnetic-deflection") ||
    /charge\s*\+0\s*C|carrying\s*\+0\s*C|\bmass\s+0\s*kg|×\s*0\s*×|= 0\.00 (?:J|N s)|\/\s*0\.00\b|= 0\.00 \//i.test(
      `${raw.stem}\n${raw.workedSolution}\n${(raw.parts ?? []).map((p) => `${p.expectedAnswer} ${p.workingSteps.join(" ")}`).join("\n")}`,
    );

  if (!needsZeroClampRepair) {
    return sanitizeStudentText;
  }

  const { chargeC, massKg } = inferParticleChargeAndMass(raw);
  const qMagText =
    chargeC !== undefined ? formatMicroScientific(Math.abs(chargeC)) : undefined;
  const signedChargeText =
    chargeC !== undefined
      ? chargeC < 0
        ? formatMicroScientific(chargeC)
        : `+${formatMicroScientific(chargeC)}`
      : undefined;
  const massText = massKg !== undefined ? formatMicroScientific(massKg) : undefined;

  const ionizationEnergyJ = getFinitePositiveNumber(vq.ionizationEnergyJ);
  const workFunctionJ = getFinitePositiveNumber(vq.workFunctionJ);
  const photonEnergyJ = getFinitePositiveNumber(vq.photonEnergyJ);
  const maxKineticEnergyJ = getFinitePositiveNumber(vq.maxKineticEnergyJ);
  const kineticEnergyJ = getFinitePositiveNumber(vq.kineticEnergyJ);
  const momentumNs = getFinitePositiveNumber(vq.momentumNs);

  return (input: string): string => {
    let out = sanitizeStudentText(input);

    if (signedChargeText) {
      out = out.replace(
        /\b(charge|carrying)\s*\+0\s*C\b/gi,
        `$1 ${signedChargeText} C`,
      );
    }
    if (massText) {
      out = out.replace(/\bmass\s+0\s*kg\b/gi, `mass ${massText} kg`);
    }
    if (qMagText && massText) {
      out = out.replace(
        /√\(2\s*×\s*0\s*×\s*([0-9.]+(?:\s*×\s*10[⁻⁰¹²³⁴⁵⁶⁷⁸⁹]+)?)\s*\/\s*0\)/g,
        `√(2 × ${qMagText} × $1 / ${massText})`,
      );
    }
    if (qMagText) {
      out = out.replace(/√\(2\s*×\s*0\s*×\s*/g, `√(2 × ${qMagText} × `);
    }

    if (ionizationEnergyJ !== undefined) {
      const ionText = formatMicroScientific(ionizationEnergyJ);
      out = out.replace(
        /(ΔE(?:[^.\n]|\.\d)*?=\s*)0\.00\s*J\b/g,
        `$1${ionText} J`,
      );
      out = out.replace(
        /(hc\s*\/\s*ΔE\s*=\s*\([^)]+\)\s*\/\s*)0\.00(?=\s*=)/g,
        `$1(${ionText})`,
      );
      out = out.replace(
        /(ΔE\s*\/\s*h\s*=\s*)0\.00(?=\s*\/\s*\()/g,
        `$1${ionText}`,
      );
    }

    if (photonEnergyJ !== undefined) {
      const photonText = formatMicroScientific(photonEnergyJ);
      out = out.replace(
        /(E(?:_J)?\s*=\s*hc\s*\/\s*λ(?:[^.\n]|\.\d)*?=\s*)0\.00\s*J\b/g,
        `$1${photonText} J`,
      );
    }

    if (workFunctionJ !== undefined) {
      const phiText = formatMicroScientific(workFunctionJ);
      out = out.replace(
        /(Φ\s*=\s*(?:[^.\n;]|\.\d)*?=\s*)0\.00\s*J\b/g,
        `$1${phiText} J`,
      );
      out = out.replace(
        /(Φ\s*\/\s*h\s*=\s*)0\.00(?=\s*\/\s*\()/g,
        `$1${phiText}`,
      );
    }

    if (maxKineticEnergyJ !== undefined) {
      const ekMaxText = formatMicroScientific(maxKineticEnergyJ);
      out = out.replace(
        /(Eₖ,ₘₐₓ\s*=\s*)0\.00\s*J\b/g,
        `$1${ekMaxText} J`,
      );
      out = out.replace(
        /(vₘₐₓ\s*=\s*√\(2\s*×\s*)0\.00(?=\s*\/)/g,
        `$1${ekMaxText}`,
      );
    }

    if (kineticEnergyJ !== undefined) {
      const ekText = formatMicroScientific(kineticEnergyJ);
      out = out.replace(
        /(Eₖ(?:,J)?\s*=\s*(?:qV|½\([^)]+\)\([^)]+\)²)\s*=\s*)0\.00\s*J\b/g,
        `$1${ekText} J`,
      );
    }

    if (massText) {
      out = out.replace(/(p\s*=\s*mv\s*=\s*\()0\.00(\)\()/g, `$1${massText}$2`);
    }

    if (momentumNs !== undefined) {
      const pText = formatMicroScientific(momentumNs);
      out = out.replace(
        /(p\s*=\s*(?:√\([^)]+\)|mv|mₙv)(?:[^.\n]|\.\d)*?=\s*)0\.00\s*N\s*s\b/g,
        `$1${pText} N s`,
      );
      out = out.replace(
        /(λ\s*=\s*h\s*\/\s*p\s*=\s*[^/\n]+\/\s*)0\.00(?=\s*=)/g,
        `$1(${pText})`,
      );
    }

    return out;
  };
}

export function toPublicBankItem(raw: RawPublicBankInput): PublicBankItem {
  const sanitize = createNumericDefectSanitizer(raw);

  const item: PublicBankItem = {
    id: raw.id,
    syllabi: raw.syllabi,
    format: raw.format,
    difficulty: raw.difficulty,
    visualFamily: raw.visualFamily,
    stem: sanitize(raw.stem),
    workedSolution: sanitize(raw.workedSolution),
    markScheme: raw.markScheme.map((point) => ({
      ...point,
      criterion: sanitize(point.criterion),
    })),
    totalMarks: raw.totalMarks,
    conceptId: raw.provenance.conceptId,
    familyGroupKey: raw.familyGroupKey,
  };

  if (typeof raw.questionStyle === "string" && raw.questionStyle.trim() !== "") {
    item.questionStyle = raw.questionStyle.trim();
  }
  if (raw.svgMarkup) {
    item.svgMarkup = raw.svgMarkup;
  }
  if (raw.options) {
    item.options = raw.options.map((opt) => ({
      ...opt,
      text: sanitize(opt.text),
      ...(typeof opt.distractorRationale === "string"
        ? { distractorRationale: sanitize(opt.distractorRationale) }
        : {}),
    }));
  }
  if (typeof raw.correctOptionIndex === "number") {
    item.correctOptionIndex = raw.correctOptionIndex;
  }
  if (raw.parts) {
    item.parts = raw.parts.map((part) => ({
      ...part,
      prompt: sanitize(part.prompt),
      expectedAnswer: sanitize(part.expectedAnswer),
      workingSteps: part.workingSteps.map((step) => sanitize(step)),
    }));
  }

  return item;
}

export function toPublicIndexRow(
  item: PublicBankItem,
  chunkKey: PhysicsDomainId,
): PublicQuestionIndexRow {
  const row: PublicQuestionIndexRow = {
    id: item.id,
    syllabi: item.syllabi,
    format: item.format,
    difficulty: item.difficulty,
    visualFamily: item.visualFamily,
    totalMarks: item.totalMarks,
    hasSvg: Boolean(item.svgMarkup && item.svgMarkup.trim().length > 0),
    chunkKey,
    conceptId: item.conceptId,
    familyGroupKey: item.familyGroupKey,
  };
  if (item.questionStyle) {
    row.questionStyle = item.questionStyle;
  }
  return row;
}

function collectEffectiveLevelsForRow(
  tags: readonly SyllabusTag[],
  syllabusId: SyllabusId,
): Set<string> {
  const levels = new Set<string>();
  for (const tag of tags) {
    if (syllabusId === "ncuk") {
      for (const lvl of resolveEffectiveNcukLevels(tag)) {
        levels.add(lvl);
      }
    } else if (syllabusId === "alevel") {
      for (const lvl of resolveEffectiveAlevelLevels(tag)) {
        levels.add(lvl);
      }
    } else if (tag.level) {
      levels.add(tag.level);
    }
  }
  return levels;
}

function incrementLevelCountsForTags(
  counts: Record<string, number>,
  tags: readonly SyllabusTag[],
  syllabusId: SyllabusId,
): void {
  for (const level of collectEffectiveLevelsForRow(tags, syllabusId)) {
    counts[level] = (counts[level] ?? 0) + 1;
  }
}

export interface BuildManifestMetadataOptions {
  fullBankTotalItems?: number;
  maxItemsPerFamily?: number;
}

export function buildPublicBankManifest(
  rows: readonly PublicQuestionIndexRow[],
  generatedAt: string,
  metaOptions?: BuildManifestMetadataOptions,
): PublicBankManifest {
  const syllabiSummary = {} as Record<SyllabusId, PublicSyllabusSummary>;

  for (const syllabusId of SYLLABUS_IDS) {
    const catalogue = SYLLABUS_CATALOGUES[syllabusId];
    const meta = SYLLABUS_META[syllabusId];

    const syllabusRows = rows.filter((row) =>
      row.syllabi.some((tag) => tag.syllabus === syllabusId),
    );

    const syllabusLevelCounts: Record<string, number> = {};
    for (const lvl of meta.levels) {
      syllabusLevelCounts[lvl] = 0;
    }

    let syllabusMcqCount = 0;
    let syllabusStructuredCount = 0;

    for (const row of syllabusRows) {
      if (row.format === "mcq") {
        syllabusMcqCount += 1;
      } else {
        syllabusStructuredCount += 1;
      }
      const matchingTags = row.syllabi.filter((t) => t.syllabus === syllabusId);
      incrementLevelCountsForTags(syllabusLevelCounts, matchingTags, syllabusId);
    }

    const topics: PublicTopicSummary[] = catalogue.topics.map((topicSpec) => {
      const topicRows = syllabusRows.filter((row) =>
        row.syllabi.some(
          (tag) => tag.syllabus === syllabusId && tag.topicId === topicSpec.id,
        ),
      );

      const topicLevelCounts: Record<string, number> = {};
      for (const lvl of meta.levels) {
        topicLevelCounts[lvl] = 0;
      }

      let topicMcqCount = 0;
      let topicStructuredCount = 0;
      for (const row of topicRows) {
        if (row.format === "mcq") {
          topicMcqCount += 1;
        } else {
          topicStructuredCount += 1;
        }
        const matchingTags = row.syllabi.filter(
          (t) => t.syllabus === syllabusId && t.topicId === topicSpec.id,
        );
        incrementLevelCountsForTags(topicLevelCounts, matchingTags, syllabusId);
      }

      const subtopics: PublicSubtopicSummary[] = topicSpec.subtopics.map(
        (subSpec) => {
          const subRows = topicRows.filter((row) =>
            row.syllabi.some(
              (tag) =>
                tag.syllabus === syllabusId &&
                tag.topicId === topicSpec.id &&
                tag.subtopicId === subSpec.id,
            ),
          );

          const subLevelCounts: Record<string, number> = {};
          for (const lvl of meta.levels) {
            subLevelCounts[lvl] = 0;
          }

          let subMcqCount = 0;
          let subStructuredCount = 0;
          for (const row of subRows) {
            if (row.format === "mcq") {
              subMcqCount += 1;
            } else {
              subStructuredCount += 1;
            }
            const matchingTags = row.syllabi.filter(
              (t) =>
                t.syllabus === syllabusId &&
                t.topicId === topicSpec.id &&
                t.subtopicId === subSpec.id,
            );
            incrementLevelCountsForTags(
              subLevelCounts,
              matchingTags,
              syllabusId,
            );
          }

          const subSummary: PublicSubtopicSummary = {
            id: subSpec.id,
            code: subSpec.code,
            title: subSpec.title,
            level: subSpec.level,
            levelsCovered: [...subSpec.levelsCovered],
            questionCount: subRows.length,
            mcqCount: subMcqCount,
            structuredCount: subStructuredCount,
            countsByLevel: subLevelCounts,
          };
          if (subSpec.isOption) {
            subSummary.isOption = true;
          }
          return subSummary;
        },
      );

      const topicSummary: PublicTopicSummary = {
        id: topicSpec.id,
        code: topicSpec.code,
        title: topicSpec.title,
        syllabus: syllabusId,
        levelsCovered: [...topicSpec.levelsCovered],
        questionCount: topicRows.length,
        mcqCount: topicMcqCount,
        structuredCount: topicStructuredCount,
        countsByLevel: topicLevelCounts,
        subtopics,
      };
      if (topicSpec.isOption) {
        topicSummary.isOption = true;
      }
      return topicSummary;
    });

    syllabiSummary[syllabusId] = {
      syllabus: syllabusId,
      title: catalogue.title,
      shortLabel: meta.shortLabel,
      specificationCode: catalogue.specificationCode,
      levels: [...meta.levels],
      gravityConvention: meta.gravityConvention,
      questionCount: syllabusRows.length,
      mcqCount: syllabusMcqCount,
      structuredCount: syllabusStructuredCount,
      countsByLevel: syllabusLevelCounts,
      topics,
    };
  }

  const chunks = {} as Record<PhysicsDomainId, PublicDomainChunkSummary>;
  for (const domainId of PHYSICS_DOMAIN_IDS) {
    const domainCount = rows.filter((row) => row.chunkKey === domainId).length;
    chunks[domainId] = {
      chunkKey: domainId,
      itemCount: domainCount,
    };
  }

  const manifest: PublicBankManifest = {
    schemaVersion: PUBLIC_BANK_MANIFEST_SCHEMA_VERSION,
    generatedAt,
    totalItems: rows.length,
    syllabi: syllabiSummary,
    items: [...rows],
    chunks,
  };
  if (typeof metaOptions?.fullBankTotalItems === "number") {
    manifest.fullBankTotalItems = metaOptions.fullBankTotalItems;
  }
  if (typeof metaOptions?.maxItemsPerFamily === "number") {
    manifest.maxItemsPerFamily = metaOptions.maxItemsPerFamily;
  }
  return manifest;
}

export interface CompiledPublicRecord {
  item: PublicBankItem;
  chunkKey: PhysicsDomainId;
}

function fnv1a32(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function orderByDifficultyRoundRobin(
  records: readonly CompiledPublicRecord[],
): CompiledPublicRecord[] {
  const buckets: Record<QuestionDifficulty, CompiledPublicRecord[]> = {
    foundation: [],
    standard: [],
    higher: [],
  };
  for (const rec of records) {
    buckets[rec.item.difficulty].push(rec);
  }
  for (const diff of QUESTION_DIFFICULTIES) {
    buckets[diff].sort(
      (a, b) =>
        fnv1a32(a.item.id) - fnv1a32(b.item.id) ||
        a.item.id.localeCompare(b.item.id),
    );
  }

  const ordered: CompiledPublicRecord[] = [];
  const diffOrder: readonly QuestionDifficulty[] = [
    "standard",
    "foundation",
    "higher",
  ];
  let idx = 0;
  while (ordered.length < records.length) {
    let added = false;
    for (const diff of diffOrder) {
      const candidate = buckets[diff][idx];
      if (candidate) {
        ordered.push(candidate);
        added = true;
      }
    }
    if (!added) break;
    idx += 1;
  }
  return ordered;
}

function interleaveFamilyFormats(
  mcqs: readonly CompiledPublicRecord[],
  structured: readonly CompiledPublicRecord[],
  familyGroupKey: string,
): CompiledPublicRecord[] {
  const startWithStructured = (fnv1a32(familyGroupKey) & 1) === 1;
  const result: CompiledPublicRecord[] = [];
  let mIdx = 0;
  let sIdx = 0;
  let takeStructured = startWithStructured;

  while (mIdx < mcqs.length || sIdx < structured.length) {
    if (takeStructured && sIdx < structured.length) {
      result.push(structured[sIdx]);
      sIdx += 1;
    } else if (!takeStructured && mIdx < mcqs.length) {
      result.push(mcqs[mIdx]);
      mIdx += 1;
    } else if (mIdx < mcqs.length) {
      result.push(mcqs[mIdx]);
      mIdx += 1;
    } else if (sIdx < structured.length) {
      result.push(structured[sIdx]);
      sIdx += 1;
    }
    takeStructured = !takeStructured;
  }
  return result;
}

/**
 * Deterministically caps each `familyGroupKey` to at most `maxItemsPerFamily`
 * items (default `12`, targeting `7` MCQ + `5` Structured with format backfill
 * and balanced `foundation`/`standard`/`higher` difficulties), then interleaves
 * records round-robin across families in deterministic hash order so no two
 * adjacent items in any topic/syllabus filter share the same template.
 */
export function capAndInterleaveRecords(
  records: readonly CompiledPublicRecord[],
  maxItemsPerFamily: number = DEFAULT_MAX_ITEMS_PER_FAMILY,
): CompiledPublicRecord[] {
  const byFamily = new Map<string, CompiledPublicRecord[]>();
  for (const rec of records) {
    const key = rec.item.familyGroupKey;
    const list = byFamily.get(key);
    if (list) {
      list.push(rec);
    } else {
      byFamily.set(key, [rec]);
    }
  }

  const effectiveCap =
    Number.isFinite(maxItemsPerFamily) && maxItemsPerFamily > 0
      ? Math.floor(maxItemsPerFamily)
      : 0;

  const familyGroups: Array<{
    familyGroupKey: string;
    hash: number;
    items: CompiledPublicRecord[];
  }> = [];

  for (const [familyGroupKey, group] of byFamily.entries()) {
    const mcqOrdered = orderByDifficultyRoundRobin(
      group.filter((r) => r.item.format === "mcq"),
    );
    const structuredOrdered = orderByDifficultyRoundRobin(
      group.filter((r) => r.item.format === "structured"),
    );

    let chosenMcq = mcqOrdered;
    let chosenStructured = structuredOrdered;

    if (effectiveCap > 0 && group.length > effectiveCap) {
      const targetMcq = Math.round((effectiveCap * 7) / 12);
      const targetStructured = effectiveCap - targetMcq;

      const primaryMcqCount = Math.min(mcqOrdered.length, targetMcq);
      const primaryStructuredCount = Math.min(
        structuredOrdered.length,
        targetStructured,
      );
      let remaining = effectiveCap - primaryMcqCount - primaryStructuredCount;

      const extraMcq = Math.min(
        remaining,
        mcqOrdered.length - primaryMcqCount,
      );
      remaining -= extraMcq;
      const extraStructured = Math.min(
        remaining,
        structuredOrdered.length - primaryStructuredCount,
      );

      chosenMcq = mcqOrdered.slice(0, primaryMcqCount + extraMcq);
      chosenStructured = structuredOrdered.slice(
        0,
        primaryStructuredCount + extraStructured,
      );
    }

    const interleavedFamilyItems = interleaveFamilyFormats(
      chosenMcq,
      chosenStructured,
      familyGroupKey,
    );

    familyGroups.push({
      familyGroupKey,
      hash: fnv1a32(familyGroupKey),
      items: interleavedFamilyItems,
    });
  }

  // Sort larger families first so round boundaries stay free of adjacent duplicates
  // even when family sizes are uneven; ties (the common case at cap=12) sort by
  // deterministic FNV-1a hash of familyGroupKey (never alphabetical).
  familyGroups.sort(
    (a, b) =>
      b.items.length - a.items.length ||
      a.hash - b.hash ||
      a.familyGroupKey.localeCompare(b.familyGroupKey),
  );

  const maxRounds = familyGroups.reduce(
    (max, g) => Math.max(max, g.items.length),
    0,
  );
  const interleaved: CompiledPublicRecord[] = [];
  for (let round = 0; round < maxRounds; round += 1) {
    for (const group of familyGroups) {
      const rec = group.items[round];
      if (rec) {
        interleaved.push(rec);
      }
    }
  }

  return interleaved;
}

/**
 * Deterministically selects 18 compact, verified sample items spanning all 3 syllabi,
 * both MCQ and Structured formats, all difficulties, and rich deterministic SVGs,
 * with 18 distinct `familyGroupKey`s.
 */
export function selectSeedFallbackRecords(
  records: ReadonlyArray<{ item: PublicBankItem; chunkKey: PhysicsDomainId }>,
): Array<{ item: PublicBankItem; chunkKey: PhysicsDomainId }> {
  const targetCount = 18;
  const selected: Array<{ item: PublicBankItem; chunkKey: PhysicsDomainId }> =
    [];
  const usedIds = new Set<string>();
  const usedFamilies = new Set<string>();

  const sortedByCompactness = [...records].sort((a, b) => {
    const lenA = a.item.svgMarkup ? a.item.svgMarkup.length : 999999;
    const lenB = b.item.svgMarkup ? b.item.svgMarkup.length : 999999;
    if (lenA !== lenB) return lenA - lenB;
    return a.item.id.localeCompare(b.item.id);
  });

  const visualDomains = PHYSICS_DOMAIN_IDS.filter(
    (d) => d !== "pure-calculation",
  );

  // Pass 1: 9 compact SVG MCQs + 8 compact SVG Structured across visual domains + 1 pure-calculation
  // ensuring all 3 syllabi, MCQ + Structured, and distinct familyGroupKeys.
  for (let idx = 0; idx < visualDomains.length; idx += 1) {
    const domain = visualDomains[idx];
    const primaryFormat = idx % 2 === 0 ? "mcq" : "structured";
    const candidate = sortedByCompactness.find(
      (r) =>
        r.chunkKey === domain &&
        r.item.format === primaryFormat &&
        Boolean(r.item.svgMarkup) &&
        r.item.syllabi.length === 3 &&
        !usedFamilies.has(r.item.familyGroupKey) &&
        !usedIds.has(r.item.id),
    );
    if (candidate) {
      selected.push(candidate);
      usedIds.add(candidate.item.id);
      usedFamilies.add(candidate.item.familyGroupKey);
    }
  }

  // Pass 2: Second pass across visual domains with opposite format (so we have balanced MCQ + Structured with SVGs)
  for (let idx = 0; idx < visualDomains.length; idx += 1) {
    if (selected.length >= targetCount - 1) break;
    const domain = visualDomains[idx];
    const oppositeFormat = idx % 2 === 0 ? "structured" : "mcq";
    const candidate = sortedByCompactness.find(
      (r) =>
        r.chunkKey === domain &&
        r.item.format === oppositeFormat &&
        Boolean(r.item.svgMarkup) &&
        r.item.syllabi.length >= 2 &&
        !usedFamilies.has(r.item.familyGroupKey) &&
        !usedIds.has(r.item.id),
    );
    if (candidate) {
      selected.push(candidate);
      usedIds.add(candidate.item.id);
      usedFamilies.add(candidate.item.familyGroupKey);
    }
  }

  // Pass 3: Include 1 pure-calculation item so all 11 chunk domains are represented in fallback
  if (selected.length < targetCount) {
    const pureCandidate = sortedByCompactness.find(
      (r) =>
        r.chunkKey === "pure-calculation" &&
        r.item.syllabi.length === 3 &&
        !usedFamilies.has(r.item.familyGroupKey) &&
        !usedIds.has(r.item.id),
    );
    if (pureCandidate) {
      selected.push(pureCandidate);
      usedIds.add(pureCandidate.item.id);
      usedFamilies.add(pureCandidate.item.familyGroupKey);
    }
  }

  // Fill any remaining slots up to 18 deterministically
  for (const r of sortedByCompactness) {
    if (selected.length >= targetCount) break;
    if (usedIds.has(r.item.id) || usedFamilies.has(r.item.familyGroupKey)) {
      continue;
    }
    selected.push(r);
    usedIds.add(r.item.id);
    usedFamilies.add(r.item.familyGroupKey);
  }

  return selected;
}

function renderSeedFallbackModuleSource(
  seedRecords: ReadonlyArray<{
    item: PublicBankItem;
    chunkKey: PhysicsDomainId;
  }>,
  seedManifest: PublicBankManifest,
): string {
  const seedItems = seedRecords.map((r) => r.item);
  const chunkMap: Record<string, PhysicsDomainId> = {};
  for (const r of seedRecords) {
    chunkMap[r.item.id] = r.chunkKey;
  }

  return [
    'import type { PhysicsDomainId, PublicBankItem, PublicBankManifest } from "./types";',
    "",
    "/**",
    " * Deterministic 18-item verified fallback seed across IB Physics (SL/HL),",
    " * UK A-Level Physics (Y12/Y13), and NCUK IFY Physics (IFY/S1/S2) so unit tests",
    " * and fresh builds work cleanly even when `dataset/` is absent.",
    " */",
    `export const SEED_FALLBACK_ITEMS: readonly PublicBankItem[] = ${JSON.stringify(seedItems, null, 2)};`,
    "",
    `export const SEED_FALLBACK_CHUNK_BY_ID: Readonly<Record<string, PhysicsDomainId>> = ${JSON.stringify(chunkMap, null, 2)};`,
    "",
    `export const SEED_FALLBACK_MANIFEST: PublicBankManifest = ${JSON.stringify(seedManifest, null, 2)};`,
    "",
  ].join("\n");
}

export interface CompilePublicBankOptions {
  sourceItemsPath?: string;
  sourceIndexPath?: string;
  outDir?: string;
  seedFallbackPath?: string;
  writeSeedFallback?: boolean;
  /** Maximum items retained per `familyGroupKey` in the compiled web bank (default 12; 0 = unlimited). */
  maxItemsPerFamily?: number;
}

export interface CompilePublicBankResult {
  usedSeedFallbackInput: boolean;
  outDir: string;
  manifestPath: string;
  totalItems: number;
  fullBankTotalItems: number;
  maxItemsPerFamily: number;
  chunkCounts: Record<PhysicsDomainId, number>;
  syllabusCounts: Record<SyllabusId, number>;
  seedFallbackCount: number;
}

export async function compilePublicBank(
  options: CompilePublicBankOptions = {},
): Promise<CompilePublicBankResult> {
  const cwd = process.cwd();
  const sourceItemsPath = path.resolve(
    cwd,
    options.sourceItemsPath ?? DEFAULT_SOURCE_ALL_ITEMS_PATH,
  );
  const sourceIndexPath = path.resolve(
    cwd,
    options.sourceIndexPath ?? DEFAULT_SOURCE_INDEX_PATH,
  );
  const outDir = path.resolve(cwd, options.outDir ?? DEFAULT_PUBLIC_OUT_DIR);
  const seedFallbackPath = path.resolve(
    cwd,
    options.seedFallbackPath ?? DEFAULT_SEED_FALLBACK_PATH,
  );
  const writeSeedFallback = options.writeSeedFallback ?? true;
  const requestedCap =
    options.maxItemsPerFamily !== undefined
      ? options.maxItemsPerFamily
      : DEFAULT_MAX_ITEMS_PER_FAMILY;
  const effectiveMaxPerFamily =
    Number.isFinite(requestedCap) && requestedCap > 0
      ? Math.floor(requestedCap)
      : 0;

  let records: CompiledPublicRecord[] = [];
  let generatedAt = DETERMINISTIC_FALLBACK_GENERATED_AT;
  let usedSeedFallbackInput = false;

  if (fs.existsSync(sourceItemsPath)) {
    if (fs.existsSync(sourceIndexPath)) {
      try {
        const parsedIndex = JSON.parse(
          fs.readFileSync(sourceIndexPath, "utf8"),
        ) as { compiledAt?: string };
        if (typeof parsedIndex.compiledAt === "string") {
          generatedAt = parsedIndex.compiledAt;
        }
      } catch {
        // Keep deterministic default timestamp if index metadata cannot be read.
      }
    }

    const rawItems = JSON.parse(
      fs.readFileSync(sourceItemsPath, "utf8"),
    ) as RawPublicBankInput[];

    const seenIds = new Set<string>();
    for (const raw of rawItems) {
      if (seenIds.has(raw.id)) {
        continue;
      }
      seenIds.add(raw.id);
      const chunkKey = raw.provenance.domain;
      records.push({
        item: toPublicBankItem(raw),
        chunkKey,
      });
    }
  } else {
    usedSeedFallbackInput = true;
    const fallbackModule = (await import(seedFallbackPath)) as {
      SEED_FALLBACK_ITEMS: readonly PublicBankItem[];
      SEED_FALLBACK_CHUNK_BY_ID: Readonly<Record<string, PhysicsDomainId>>;
    };
    records = fallbackModule.SEED_FALLBACK_ITEMS.map((item) => ({
      item,
      chunkKey: fallbackModule.SEED_FALLBACK_CHUNK_BY_ID[item.id] ?? "waves",
    }));
  }

  const fullBankTotalItems = records.length;
  const compiledRecords = capAndInterleaveRecords(
    records,
    effectiveMaxPerFamily,
  );

  const indexRows = compiledRecords.map((r) =>
    toPublicIndexRow(r.item, r.chunkKey),
  );
  const manifest = buildPublicBankManifest(indexRows, generatedAt, {
    fullBankTotalItems,
    maxItemsPerFamily: effectiveMaxPerFamily,
  });

  const chunksDir = path.join(outDir, "chunks");
  fs.mkdirSync(chunksDir, { recursive: true });

  const chunkCounts = {} as Record<PhysicsDomainId, number>;
  for (const domainId of PHYSICS_DOMAIN_IDS) {
    const domainItems = compiledRecords
      .filter((r) => r.chunkKey === domainId)
      .map((r) => r.item);
    chunkCounts[domainId] = domainItems.length;

    const chunkPayload: PublicBankChunkFile = {
      schemaVersion: PUBLIC_BANK_CHUNK_SCHEMA_VERSION,
      chunkKey: domainId,
      generatedAt,
      itemCount: domainItems.length,
      items: domainItems,
    };

    // Compact single-line JSON for fast network transfer on GitHub Pages
    fs.writeFileSync(
      path.join(chunksDir, `${domainId}.json`),
      JSON.stringify(chunkPayload),
      "utf8",
    );
  }

  const manifestPath = path.join(outDir, "manifest.json");
  fs.writeFileSync(manifestPath, JSON.stringify(manifest), "utf8");

  let seedFallbackCount = 0;
  if (!usedSeedFallbackInput && writeSeedFallback) {
    const seedRecords = selectSeedFallbackRecords(compiledRecords);
    seedFallbackCount = seedRecords.length;
    const seedRows = seedRecords.map((r) =>
      toPublicIndexRow(r.item, r.chunkKey),
    );
    const seedManifest = buildPublicBankManifest(
      seedRows,
      DETERMINISTIC_FALLBACK_GENERATED_AT,
    );
    const nextSeedSource = renderSeedFallbackModuleSource(
      seedRecords,
      seedManifest,
    );

    fs.mkdirSync(path.dirname(seedFallbackPath), { recursive: true });
    const prevSeedSource = fs.existsSync(seedFallbackPath)
      ? fs.readFileSync(seedFallbackPath, "utf8")
      : null;
    if (prevSeedSource !== nextSeedSource) {
      fs.writeFileSync(seedFallbackPath, nextSeedSource, "utf8");
    }
  } else {
    seedFallbackCount = compiledRecords.length;
  }

  return {
    usedSeedFallbackInput,
    outDir,
    manifestPath,
    totalItems: manifest.totalItems,
    fullBankTotalItems,
    maxItemsPerFamily: effectiveMaxPerFamily,
    chunkCounts,
    syllabusCounts: {
      ib: manifest.syllabi.ib.questionCount,
      alevel: manifest.syllabi.alevel.questionCount,
      ncuk: manifest.syllabi.ncuk.questionCount,
    },
    seedFallbackCount,
  };
}

export function parseCompileCliArgs(
  argv: readonly string[],
): CompilePublicBankOptions {
  const opts: CompilePublicBankOptions = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--max-per-family" && i + 1 < argv.length) {
      const parsed = Number.parseInt(argv[i + 1], 10);
      if (Number.isFinite(parsed) && parsed >= 0) {
        opts.maxItemsPerFamily = parsed;
      }
      i += 1;
    } else if (arg.startsWith("--max-per-family=")) {
      const parsed = Number.parseInt(arg.slice("--max-per-family=".length), 10);
      if (Number.isFinite(parsed) && parsed >= 0) {
        opts.maxItemsPerFamily = parsed;
      }
    } else if (arg === "--source" && i + 1 < argv.length) {
      opts.sourceItemsPath = argv[i + 1];
      i += 1;
    } else if (arg === "--out" && i + 1 < argv.length) {
      opts.outDir = argv[i + 1];
      i += 1;
    } else if (arg === "--no-seed-fallback") {
      opts.writeSeedFallback = false;
    }
  }
  return opts;
}

async function runCli(): Promise<void> {
  const options = parseCompileCliArgs(process.argv.slice(2));
  const result = await compilePublicBank(options);
  console.log(JSON.stringify(result, null, 2));
}

if (require.main === module) {
  runCli().catch((error: unknown) => {
    console.error(
      JSON.stringify({
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    process.exitCode = 1;
  });
}
