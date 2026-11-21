import {
  ALEVEL_GRAVITY_MS2,
  ALEVEL_OPTIONS_ASTROMED_PLUGINS,
} from "@/lib/visuals/alevel-options-astromed";

import { buildOptionEquivalenceKey } from "../numeric-checker";
import {
  CandidateQuestionInput,
  MarkSchemePoint,
  MCQ_OPTION_LABELS,
  McqOptionItem,
  PhysicsDomainId,
  QuestionDifficulty,
  QuestionStyleTag,
  RequiredGivenSpec,
  StructuredQuestionPart,
  SyllabusTag,
} from "../types";

export const ALEVEL_OPT_AM_DEFAULT_BASE_SEED = 76_000_000;
export const ALEVEL_OPT_AM_ID_PREFIX = "sp-v3-al-optam";
export const ALEVEL_OPT_AM_DEFAULT_MODEL =
  "deterministic-alevel-options-astromed-v3/1.0.0";

export interface GenerateAlevelOptionsAstromedOptions {
  readonly baseSeed?: number;
  readonly generatorModel?: string;
}

/* -------------------------------------------------------------------------- */
/*  Formatting & deterministic helper utilities                               */
/* -------------------------------------------------------------------------- */

const SUP_DIGITS: Readonly<Record<string, string>> = {
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

function toSupInt(exp: number): string {
  return [...String(exp)].map((ch) => SUP_DIGITS[ch] ?? ch).join("");
}

function fmtSig(value: number, sf = 3, unit?: string): string {
  if (!Number.isFinite(value)) {
    throw new Error(`Non-finite numeric value: ${String(value)}`);
  }
  if (Object.is(value, -0) || Math.abs(value) < 1e-35) {
    if (!unit) return "0";
    return unit === "%" ? "0%" : `0 ${unit}`;
  }
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  const rounded = Number(abs.toPrecision(sf));
  let numStr: string;
  if (rounded >= 1e4 || rounded < 1e-2) {
    let exp = Math.floor(Math.log10(abs));
    let mant = abs / 10 ** exp;
    if (Number(mant.toPrecision(sf)) >= 10) {
      exp += 1;
      mant /= 10;
    }
    numStr = `${sign}${mant.toPrecision(sf)} × 10${toSupInt(exp)}`;
  } else {
    numStr = `${sign}${abs.toPrecision(sf)}`;
  }
  if (!unit) return numStr;
  return unit === "%" ? `${numStr}%` : `${numStr} ${unit}`;
}

function fmt3(value: number, unit?: string): string {
  return fmtSig(value, 3, unit);
}

function fmt2(value: number, unit?: string): string {
  return fmtSig(value, 2, unit);
}

function solveKind(
  kind: string,
  spec: Record<string, unknown>,
): Record<string, number | string | boolean> {
  const plugin = ALEVEL_OPTIONS_ASTROMED_PLUGINS.find((p) => p.kind === kind);
  if (!plugin) {
    throw new Error(`Unknown plugin kind "${kind}"`);
  }
  const check = plugin.validate(spec);
  if (!check.valid) {
    throw new Error(
      `Invalid spec for "${kind}": ${check.issues.join("; ")}`,
    );
  }
  return plugin.solve(spec).quantities;
}

function numQ(
  q: Record<string, number | string | boolean>,
  key: string,
): number {
  const v = q[key];
  if (typeof v !== "number" || !Number.isFinite(v)) {
    throw new Error(`Expected finite number for solver key "${key}", got ${String(v)}`);
  }
  return v;
}

function strQ(
  q: Record<string, number | string | boolean>,
  key: string,
): string {
  const v = q[key];
  if (typeof v !== "string" || !v.trim()) {
    throw new Error(`Expected non-empty string for solver key "${key}", got ${String(v)}`);
  }
  return v;
}

function alevelOptionTag(
  subtopicId:
    | "alevel-3-9-astrophysics"
    | "alevel-3-10-medical-physics"
    | "alevel-3-12-turning-points",
): SyllabusTag[] {
  return [
    {
      syllabus: "alevel",
      level: "Y13",
      topicId: "alevel-options-9-13",
      subtopicId,
    },
  ];
}

interface NumDistractor {
  readonly value: number;
  readonly rationale: string;
}

interface VerbalDistractor {
  readonly text: string;
  readonly rationale: string;
}

function distinct3sf(a: number, b: number): boolean {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  const scale = Math.max(Math.abs(a), Math.abs(b), 1e-35);
  if (Math.abs(a - b) / scale < 0.04) return false;
  return a.toPrecision(3) !== b.toPrecision(3);
}

function buildNumericOptions(
  correctValue: number,
  unit: string | undefined,
  distractors: readonly NumDistractor[],
  seed: number,
  formatter: (v: number, u?: string) => string = fmt3,
): McqOptionItem[] {
  const correctText = formatter(correctValue, unit);
  const usedKeys = new Set<string>([buildOptionEquivalenceKey(correctText)]);
  const usedVals: number[] = [correctValue];
  const chosen: Array<{ text: string; rationale: string }> = [];

  const fallbacks: NumDistractor[] = [
    {
      value: correctValue * 2,
      rationale: "Applies an erroneous factor of two during rearrangement.",
    },
    {
      value: correctValue * 0.5,
      rationale: "Halves the final expression through a factor-of-two slip.",
    },
    {
      value: correctValue * 1.45,
      rationale: "Misapplies a power or unit-prefix conversion factor.",
    },
    {
      value: correctValue * 0.68,
      rationale: "Uses an inverted or truncated intermediate ratio.",
    },
  ];

  for (const cand of [...distractors, ...fallbacks]) {
    if (chosen.length >= 3) break;
    if (!Number.isFinite(cand.value) || Math.abs(cand.value) < 1e-35) continue;
    if (!usedVals.every((v) => distinct3sf(cand.value, v))) continue;
    const text = formatter(cand.value, unit);
    const key = buildOptionEquivalenceKey(text);
    if (usedKeys.has(key)) continue;
    usedKeys.add(key);
    usedVals.push(cand.value);
    chosen.push({ text, rationale: cand.rationale });
  }

  const slot = ((seed % 4) + 4) % 4;
  const out: McqOptionItem[] = [];
  let dIdx = 0;
  for (let i = 0; i < 4; i += 1) {
    if (i === slot) {
      out.push({
        label: MCQ_OPTION_LABELS[i],
        text: correctText,
        isCorrect: true,
      });
    } else {
      const d = chosen[dIdx];
      dIdx += 1;
      out.push({
        label: MCQ_OPTION_LABELS[i],
        text: d.text,
        isCorrect: false,
        distractorRationale: d.rationale,
      });
    }
  }
  return out;
}

function buildVerbalOptions(
  correctText: string,
  distractors: readonly [VerbalDistractor, VerbalDistractor, VerbalDistractor],
  seed: number,
): McqOptionItem[] {
  const slot = ((seed % 4) + 4) % 4;
  const out: McqOptionItem[] = [];
  let dIdx = 0;
  for (let i = 0; i < 4; i += 1) {
    if (i === slot) {
      out.push({
        label: MCQ_OPTION_LABELS[i],
        text: correctText,
        isCorrect: true,
      });
    } else {
      const d = distractors[dIdx];
      dIdx += 1;
      out.push({
        label: MCQ_OPTION_LABELS[i],
        text: d.text,
        isCorrect: false,
        distractorRationale: d.rationale,
      });
    }
  }
  return out;
}

interface BuilderContext {
  nextSeed: () => number;
  generatorModel: string;
  items: CandidateQuestionInput[];
}

interface CalcMcqArgs {
  slug: string;
  conceptId: string;
  kind: string;
  domain: PhysicsDomainId;
  subtopicId:
    | "alevel-3-9-astrophysics"
    | "alevel-3-10-medical-physics"
    | "alevel-3-12-turning-points";
  difficulty: QuestionDifficulty;
  scenarioSpec: Record<string, unknown>;
  hiddenQuantities: string[];
  requiredGivens: RequiredGivenSpec[];
  targetQuantityKey: string;
  unit?: string;
  stem: string;
  distractors: (q: Record<string, number | string | boolean>) => NumDistractor[];
  workedSolution: (
    q: Record<string, number | string | boolean>,
    ansText: string,
  ) => string;
  planSummary: string;
  formatter?: (v: number, u?: string) => string;
}

function pushCalcMcq(ctx: BuilderContext, args: CalcMcqArgs): void {
  const seed = ctx.nextSeed();
  const q = solveKind(args.kind, args.scenarioSpec);
  const val = numQ(q, args.targetQuantityKey);
  const fmt = args.formatter ?? fmt3;
  const ansText = fmt(val, args.unit);
  const options = buildNumericOptions(
    val,
    args.unit,
    args.distractors(q),
    seed,
    fmt,
  );
  const ws = args.workedSolution(q, ansText);
  ctx.items.push({
    id: `${ALEVEL_OPT_AM_ID_PREFIX}-${args.slug}`,
    conceptId: args.conceptId,
    templateArchetype: args.kind,
    seed,
    syllabi: alevelOptionTag(args.subtopicId),
    format: "mcq",
    questionStyle: "calculation",
    difficulty: args.difficulty,
    domain: args.domain,
    scenarioSpec: args.scenarioSpec,
    hiddenQuantities: args.hiddenQuantities,
    requiredGivens: args.requiredGivens,
    questionPlan: {
      targetSummary: args.planSummary,
      distractorStrategy: [
        "algebraic inversion error",
        "missing geometric or prefix factor",
        "wrong formula substitution",
      ],
    },
    stem: args.stem,
    options,
    targetMode: "quantitative",
    targetQuantityKey: args.targetQuantityKey,
    workedSolution: ws,
    markScheme: [
      {
        code: "A1",
        criterion: `Correct calculated value ${ansText}.`,
        marks: 1,
      },
    ],
    totalMarks: 1,
    generatorModel: ctx.generatorModel,
  });
}

interface QualMcqArgs {
  slug: string;
  conceptId: string;
  kind: string;
  domain: PhysicsDomainId;
  subtopicId:
    | "alevel-3-9-astrophysics"
    | "alevel-3-10-medical-physics"
    | "alevel-3-12-turning-points";
  difficulty: QuestionDifficulty;
  questionStyle?: "qualitative" | "definition";
  scenarioSpec: Record<string, unknown>;
  targetQuantityKey: string;
  stem: string;
  correctOption: (anchor: string) => string;
  distractors: readonly [VerbalDistractor, VerbalDistractor, VerbalDistractor];
  workedSolution: (anchor: string) => string;
  planSummary: string;
}

function pushQualMcq(ctx: BuilderContext, args: QualMcqArgs): void {
  const seed = ctx.nextSeed();
  const q = solveKind(args.kind, args.scenarioSpec);
  const anchor = strQ(q, args.targetQuantityKey);
  const correctText = args.correctOption(anchor);
  const options = buildVerbalOptions(correctText, args.distractors, seed);
  ctx.items.push({
    id: `${ALEVEL_OPT_AM_ID_PREFIX}-${args.slug}`,
    conceptId: args.conceptId,
    templateArchetype: args.kind,
    seed,
    syllabi: alevelOptionTag(args.subtopicId),
    format: "mcq",
    questionStyle: args.questionStyle ?? "qualitative",
    difficulty: args.difficulty,
    domain: args.domain,
    scenarioSpec: args.scenarioSpec,
    hiddenQuantities: [args.targetQuantityKey],
    requiredGivens: [],
    questionPlan: {
      targetSummary: args.planSummary,
      distractorStrategy: [
        "reversed physical relationship",
        "confused experimental mechanism",
        "common AQA syllabus misconception",
      ],
    },
    stem: args.stem,
    options,
    targetMode: "qualitative",
    targetQuantityKey: args.targetQuantityKey,
    workedSolution: args.workedSolution(anchor),
    markScheme: [
      {
        code: "B1",
        criterion: `Identifies that ${anchor}.`,
        marks: 1,
      },
    ],
    totalMarks: 1,
    generatorModel: ctx.generatorModel,
  });
}

interface StructuredArgs {
  slug: string;
  conceptId: string;
  kind: string;
  domain: PhysicsDomainId;
  subtopicId:
    | "alevel-3-9-astrophysics"
    | "alevel-3-10-medical-physics"
    | "alevel-3-12-turning-points";
  difficulty: QuestionDifficulty;
  questionStyle: QuestionStyleTag;
  scenarioSpec: Record<string, unknown>;
  hiddenQuantities: string[];
  requiredGivens: RequiredGivenSpec[];
  stem: string;
  build: (q: Record<string, number | string | boolean>) => {
    parts: StructuredQuestionPart[];
    markScheme: MarkSchemePoint[];
    workedSolution: string;
  };
  planSummary: string;
  subpartPlan: string[];
}

function pushStructured(ctx: BuilderContext, args: StructuredArgs): void {
  const seed = ctx.nextSeed();
  const q = solveKind(args.kind, args.scenarioSpec);
  const built = args.build(q);
  const totalMarks = built.parts.reduce((acc, p) => acc + p.marks, 0);
  ctx.items.push({
    id: `${ALEVEL_OPT_AM_ID_PREFIX}-${args.slug}`,
    conceptId: args.conceptId,
    templateArchetype: args.kind,
    seed,
    syllabi: alevelOptionTag(args.subtopicId),
    format: "structured",
    questionStyle: args.questionStyle,
    difficulty: args.difficulty,
    domain: args.domain,
    scenarioSpec: args.scenarioSpec,
    hiddenQuantities: args.hiddenQuantities,
    requiredGivens: args.requiredGivens,
    questionPlan: {
      targetSummary: args.planSummary,
      subpartStrategy: args.subpartPlan,
    },
    stem: args.stem,
    parts: built.parts,
    workedSolution: built.workedSolution,
    markScheme: built.markScheme,
    totalMarks,
    generatorModel: ctx.generatorModel,
  });
}

interface SixMarkLorArgs {
  slug: string;
  conceptId: string;
  kind: string;
  domain: PhysicsDomainId;
  subtopicId:
    | "alevel-3-9-astrophysics"
    | "alevel-3-10-medical-physics"
    | "alevel-3-12-turning-points";
  scenarioSpec: Record<string, unknown>;
  targetQuantityKey: string;
  stem: string;
  prompt: string;
  expectedAnswer: (anchor: string) => string;
  workingSteps: string[];
  criteriaSix: readonly [string, string, string, string, string, string];
  workedSolution: (anchor: string) => string;
  planSummary: string;
}

function pushSixMarkLor(ctx: BuilderContext, args: SixMarkLorArgs): void {
  const seed = ctx.nextSeed();
  const q = solveKind(args.kind, args.scenarioSpec);
  const anchor = strQ(q, args.targetQuantityKey);
  const codes = ["L1", "L1", "L2", "L2", "L3", "L3"] as const;
  const markScheme: MarkSchemePoint[] = args.criteriaSix.map((crit, idx) => ({
    code: codes[idx],
    criterion: crit,
    marks: 1,
    partId: "a",
  }));

  ctx.items.push({
    id: `${ALEVEL_OPT_AM_ID_PREFIX}-${args.slug}`,
    conceptId: args.conceptId,
    templateArchetype: args.kind,
    seed,
    syllabi: alevelOptionTag(args.subtopicId),
    format: "structured",
    questionStyle: "qualitative",
    difficulty: "higher",
    domain: args.domain,
    scenarioSpec: args.scenarioSpec,
    hiddenQuantities: [args.targetQuantityKey],
    requiredGivens: [],
    targetMode: "qualitative",
    questionPlan: {
      targetSummary: args.planSummary,
      subpartStrategy: [
        "extended level of response qualitative synthesis across physical principles and experimental evidence",
      ],
    },
    stem: args.stem,
    parts: [
      {
        partId: "a",
        prompt: args.prompt,
        marks: 6,
        targetMode: "qualitative",
        targetQuantityKey: args.targetQuantityKey,
        expectedAnswer: args.expectedAnswer(anchor),
        workingSteps: args.workingSteps,
      },
    ],
    workedSolution: args.workedSolution(anchor),
    markScheme,
    totalMarks: 6,
    generatorModel: ctx.generatorModel,
  });
}

/* ========================================================================== */
/*  SECTION A — OPTION 3.9 ASTROPHYSICS (4 plugins × 12 = 48 items)           */
/* ========================================================================== */

function populateAstroTelescopeOptics(ctx: BuilderContext): void {
  const kind = "al-opt-astro-telescope-optics";
  const conceptId = "thin-lenses-geometric-optics";
  const sub = "alevel-3-9-astrophysics" as const;

  // 4 Calc MCQs
  pushCalcMcq(ctx, {
    slug: "astro-tele-calc-01",
    conceptId,
    kind,
    domain: "optics-shm",
    subtopicId: sub,
    difficulty: "foundation",
    scenarioSpec: {
      kind,
      mode: "refractor",
      objectiveFocalLengthM: 1.44,
      eyepieceFocalLengthM: 0.024,
      apertureDiameterM: 0.12,
    },
    hiddenQuantities: ["angularMagnification"],
    requiredGivens: [
      { name: "objectiveFocalLengthM", value: 1.44, unit: "m", source: "either" },
      { name: "eyepieceFocalLengthM", value: 0.024, unit: "m", source: "either" },
    ],
    targetQuantityKey: "angularMagnification",
    stem: "An amateur observatory sets up an astronomical refracting telescope in normal adjustment with an objective focal length of 1.44 m, an eyepiece focal length of 0.024 m, and an aperture diameter of 0.12 m. What is the angular magnification of the telescope?",
    distractors: (q) => {
      const m = numQ(q, "angularMagnification");
      return [
        { value: m * 0.5, rationale: "Halves the ratio of focal lengths erroneously." },
        { value: 1.44 + 0.024, rationale: "Adds the focal lengths (tube length) instead of dividing them." },
        { value: 1.44 / 0.12, rationale: "Computes the f-number f_o / D instead of f_o / f_e." },
      ];
    },
    workedSolution: (_q, ans) =>
      `In normal adjustment, angular magnification is $M = \\frac{f_o}{f_e} = \\frac{1.44}{0.024} = ${ans}$.`,
    planSummary: "Compute normal-adjustment angular magnification of an astronomical refractor.",
  });

  pushCalcMcq(ctx, {
    slug: "astro-tele-calc-02",
    conceptId,
    kind,
    domain: "optics-shm",
    subtopicId: sub,
    difficulty: "standard",
    scenarioSpec: {
      kind,
      mode: "refractor",
      objectiveFocalLengthM: 2.1,
      eyepieceFocalLengthM: 0.035,
      apertureDiameterM: 0.18,
    },
    hiddenQuantities: ["tubeLengthM", "eyepieceFocalLengthM"],
    requiredGivens: [
      { name: "objectiveFocalLengthM", value: 2.1, unit: "m", source: "stem" },
      { name: "angularMagnification", value: 60, source: "stem" },
    ],
    targetQuantityKey: "tubeLengthM",
    unit: "m",
    stem: "A planetary refracting telescope operating in normal adjustment has an objective lens of focal length 2.10 m and produces an angular magnification of 60. Calculate the distance between the objective and eyepiece lenses.",
    distractors: () => [
      { value: 2.1 - 0.035, rationale: "Subtracts the eyepiece focal length instead of adding f_o + f_e." },
      { value: 2.1 * 2, rationale: "Assumes the lenses are separated by twice the objective focal length." },
      { value: 2.1 + 0.35, rationale: "Makes a factor-of-ten decimal error when computing f_e = f_o / M." },
    ],
    workedSolution: (_q, ans) =>
      `From $M = \\frac{f_o}{f_e}$, the eyepiece focal length is $f_e = \\frac{2.10}{60} = 0.035\\text{ m}$. In normal adjustment, the lens separation is $L = f_o + f_e = 2.10 + 0.035 = ${ans}$.`,
    planSummary: "Determine normal-adjustment tube length from objective focal length and magnification.",
  });

  pushCalcMcq(ctx, {
    slug: "astro-tele-calc-03",
    conceptId,
    kind,
    domain: "optics-shm",
    subtopicId: sub,
    difficulty: "standard",
    scenarioSpec: {
      kind,
      mode: "cassegrain",
      objectiveFocalLengthM: 14.0,
      eyepieceFocalLengthM: 0.05,
      apertureDiameterM: 2.8,
      secondaryDiameterM: 0.7,
    },
    hiddenQuantities: ["effectiveCollectingAreaM2", "blockagePercent"],
    requiredGivens: [
      { name: "apertureDiameterM", value: 2.8, unit: "m", source: "either" },
      { name: "secondaryDiameterM", value: 0.7, unit: "m", source: "stem" },
    ],
    targetQuantityKey: "effectiveCollectingAreaM2",
    unit: "m²",
    stem: "A hilltop Cassegrain reflecting telescope has a parabolic primary mirror of diameter 2.80 m and a central convex secondary mirror housing of diameter 0.70 m that blocks incoming starlight. What is the net light-collecting area of the primary mirror?",
    distractors: (q) => {
      const a = numQ(q, "collectingAreaM2");
      return [
        { value: a, rationale: "Ignores the area obstructed by the secondary mirror." },
        { value: Math.PI * (2.8 - 0.7) ** 2 * 0.25, rationale: "Subtracts diameters before squaring instead of subtracting squared radii." },
        { value: numQ(q, "effectiveCollectingAreaM2") * 4, rationale: "Uses diameters directly in pi r squared without halving to radii." },
      ];
    },
    workedSolution: (_q, ans) =>
      `The unobstructed area is $A = \\pi(R^2 - r^2) = \\pi(1.40^2 - 0.35^2) = \\pi(1.96 - 0.1225) = ${ans}$.`,
    planSummary: "Calculate effective collecting area of a Cassegrain primary mirror minus secondary obstruction.",
  });

  pushCalcMcq(ctx, {
    slug: "astro-tele-calc-04",
    conceptId,
    kind,
    domain: "optics-shm",
    subtopicId: sub,
    difficulty: "higher",
    scenarioSpec: {
      kind,
      mode: "refractor",
      objectiveFocalLengthM: 1.65,
      eyepieceFocalLengthM: 0.025,
      apertureDiameterM: 0.14,
      lensBlueFocalM: 1.624,
      lensRedFocalM: 1.662,
    },
    hiddenQuantities: ["chromaticSpreadMm"],
    requiredGivens: [
      { name: "lensBlueFocalM", value: 1.624, unit: "m", source: "stem" },
      { name: "lensRedFocalM", value: 1.662, unit: "m", source: "stem" },
    ],
    targetQuantityKey: "chromaticSpreadMm",
    unit: "mm",
    stem: "A simple crown-glass objective lens in a refractor suffers from longitudinal chromatic aberration, focusing blue light at 1.624 m and red light at 1.662 m along the principal axis. What is the longitudinal axial separation between the blue and red focal points?",
    distractors: () => [
      { value: 19.0, rationale: "Halves the focal difference erroneously." },
      { value: 76.0, rationale: "Doubles the focal separation." },
      { value: 3.8, rationale: "Makes a tenfold metres-to-millimetres conversion slip." },
    ],
    workedSolution: (_q, ans) =>
      `Blue light has a larger refractive index in glass and bends more strongly ($f_{\\text{blue}} < f_{\\text{red}}$). The axial focal spread is $\\Delta f = 1.662 - 1.624 = 0.038\\text{ m} = ${ans}$.`,
    planSummary: "Compute longitudinal chromatic focal spread between blue and red wavelengths.",
  });

  // 3 Pure Qual MCQs
  pushQualMcq(ctx, {
    slug: "astro-tele-qual-01",
    conceptId,
    kind,
    domain: "optics-shm",
    subtopicId: sub,
    difficulty: "foundation",
    questionStyle: "definition",
    scenarioSpec: {
      kind,
      mode: "cassegrain",
      objectiveFocalLengthM: 8.0,
      eyepieceFocalLengthM: 0.04,
      apertureDiameterM: 1.6,
    },
    targetQuantityKey: "primaryMirrorShape",
    stem: "Which combination of mirror geometries is used in a standard Cassegrain reflecting telescope to eliminate on-axis spherical aberration and direct starlight through the central aperture?",
    correctOption: (a) => `A ${a}.`,
    distractors: [
      {
        text: "A spherical concave primary mirror and a flat plane secondary mirror.",
        rationale: "A spherical primary introduces spherical aberration and a plane secondary is Newtonian rather than Cassegrain.",
      },
      {
        text: "A convex parabolic primary mirror and a concave secondary mirror.",
        rationale: "Reverses the mirror curvatures; a convex primary would diverge incoming parallel starlight.",
      },
      {
        text: "A concave parabolic primary mirror and a concave spherical secondary mirror.",
        rationale: "A Cassegrain secondary mirror is convex to increase effective focal length before passing through the primary hole.",
      },
    ],
    workedSolution: (a) =>
      `A Cassegrain reflector uses a ${a} so on-axis rays focus sharply behind the primary mirror without spherical aberration.`,
    planSummary: "Identify Cassegrain primary and secondary mirror geometries.",
  });

  pushQualMcq(ctx, {
    slug: "astro-tele-qual-02",
    conceptId,
    kind,
    domain: "optics-shm",
    subtopicId: sub,
    difficulty: "standard",
    scenarioSpec: {
      kind,
      mode: "refractor",
      objectiveFocalLengthM: 1.2,
      eyepieceFocalLengthM: 0.03,
      apertureDiameterM: 0.1,
    },
    targetQuantityKey: "aberrationClassification",
    stem: "When a star is viewed through a refracting telescope fitted with a single-element glass objective lens, coloured fringes appear around the image. Which physical explanation is correct?",
    correctOption: (a) => `The lens suffers from ${a}.`,
    distractors: [
      {
        text: "The lens suffers from chromatic aberration because red light refracts more strongly than blue light.",
        rationale: "Reverses dispersion in glass: shorter-wavelength blue light has higher refractive index and shorter focal length.",
      },
      {
        text: "The lens suffers from spherical aberration caused solely by diffraction at the aperture edges.",
        rationale: "Conflates geometric spherical aberration with wave diffraction and misidentifies coloured fringing.",
      },
      {
        text: "The eyepiece reflects longer wavelengths while transmitting only blue light to the retina.",
        rationale: "Chromatic fringes arise from wavelength-dependent refraction, not selective reflection.",
      },
    ],
    workedSolution: (a) =>
      `Glass has a slightly larger refractive index for shorter wavelengths, causing ${a}.`,
    planSummary: "Explain origin of chromatic aberration in a single-element refractor objective.",
  });

  pushQualMcq(ctx, {
    slug: "astro-tele-qual-03",
    conceptId,
    kind,
    domain: "optics-shm",
    subtopicId: sub,
    difficulty: "foundation",
    scenarioSpec: {
      kind,
      mode: "refractor",
      objectiveFocalLengthM: 1.5,
      eyepieceFocalLengthM: 0.025,
      apertureDiameterM: 0.12,
    },
    targetQuantityKey: "imageNature",
    stem: "An astronomer adjusts a two-lens refracting telescope into normal adjustment to observe a distant nebula comfortably with a relaxed eye. Which description accurately characterises the final image seen by the observer?",
    correctOption: (a) => `A ${a}.`,
    distractors: [
      {
        text: "A real upright image formed at the focal plane of the eyepiece.",
        rationale: "The intermediate image is real and inverted, whereas the final image viewed through the eyepiece is virtual and at infinity.",
      },
      {
        text: "A virtual upright image formed at the eye's near point.",
        rationale: "An astronomical two-lens refractor inverts the image and normal adjustment places the final image at infinity, not the near point.",
      },
      {
        text: "A real inverted image projected directly onto the cornea.",
        rationale: "Parallel rays emerge from the eyepiece, corresponding to a virtual image at infinity.",
      },
    ],
    workedSolution: (a) =>
      `With $F_o$ and $F_e$ coincident, rays leave the eyepiece parallel so the observer sees a ${a}.`,
    planSummary: "State the nature and position of the final image in normal adjustment.",
  });

  // 4 Multi-part Structured
  pushStructured(ctx, {
    slug: "astro-tele-str-01",
    conceptId,
    kind,
    domain: "optics-shm",
    subtopicId: sub,
    difficulty: "standard",
    questionStyle: "mixed-exam",
    scenarioSpec: {
      kind,
      mode: "refractor",
      objectiveFocalLengthM: 2.4,
      eyepieceFocalLengthM: 0.04,
      apertureDiameterM: 0.2,
    },
    hiddenQuantities: ["angularMagnification", "tubeLengthM", "imageNature"],
    requiredGivens: [
      { name: "objectiveFocalLengthM", value: 2.4, unit: "m", source: "either" },
      { name: "eyepieceFocalLengthM", value: 0.04, unit: "m", source: "either" },
    ],
    stem: "A university rooftop refracting telescope has an objective lens of focal length 2.40 m and an eyepiece lens of focal length 0.040 m arranged in normal adjustment.",
    build: (q) => {
      const m = numQ(q, "angularMagnification");
      const l = numQ(q, "tubeLengthM");
      const img = strQ(q, "imageNature");
      return {
        parts: [
          {
            partId: "a",
            prompt: "Calculate the angular magnification of the telescope in normal adjustment.",
            marks: 2,
            targetQuantityKey: "angularMagnification",
            expectedAnswer: fmt3(m),
            workingSteps: [
              "State $M = \\frac{f_o}{f_e}$.",
              `Substitute $M = \\frac{2.40}{0.040} = ${fmt3(m)}$.`,
            ],
          },
          {
            partId: "b",
            prompt: "Calculate the separation between the objective and eyepiece lenses.",
            marks: 2,
            targetQuantityKey: "tubeLengthM",
            expectedAnswer: fmt3(l, "m"),
            workingSteps: [
              "In normal adjustment the principal foci coincide: $L = f_o + f_e$.",
              `Compute $L = 2.40 + 0.040 = ${fmt3(l, "m")}$.`,
            ],
          },
          {
            partId: "c",
            prompt: "State the nature and location of the final image viewed by an observer with a relaxed eye.",
            marks: 2,
            targetMode: "qualitative",
            targetQuantityKey: "imageNature",
            expectedAnswer: `The final image is a ${img}.`,
            workingSteps: [
              "Rays emerge parallel from the eyepiece after passing through the inverted real intermediate image.",
              "Hence the observer sees a virtual, inverted image at infinity.",
            ],
          },
        ],
        markScheme: [
          { code: "M1", criterion: "Uses $M = f_o / f_e = 2.40 / 0.040$.", marks: 1, partId: "a" },
          { code: "A1", criterion: `Correct magnification ${fmt3(m)}.`, marks: 1, partId: "a" },
          { code: "M1", criterion: "States $L = f_o + f_e$ for normal adjustment.", marks: 1, partId: "b" },
          { code: "A1", criterion: `Correct lens separation ${fmt3(l, "m")}.`, marks: 1, partId: "b" },
          { code: "B1", criterion: "States the image is virtual and inverted.", marks: 1, partId: "c" },
          { code: "B1", criterion: "States the final image is formed at infinity.", marks: 1, partId: "c" },
        ],
        workedSolution: `(a) $M = \\frac{2.40}{0.040} = ${fmt3(m)}$. (b) $L = 2.40 + 0.040 = ${fmt3(l, "m")}$. (c) The observer views a ${img}.`,
      };
    },
    planSummary: "Evaluate refractor magnification, normal-adjustment tube length, and final image properties.",
    subpartPlan: ["magnification calculation", "lens separation calculation", "final image nature"],
  });

  pushStructured(ctx, {
    slug: "astro-tele-str-02",
    conceptId,
    kind,
    domain: "optics-shm",
    subtopicId: sub,
    difficulty: "standard",
    questionStyle: "calculation",
    scenarioSpec: {
      kind,
      mode: "cassegrain",
      objectiveFocalLengthM: 16.0,
      eyepieceFocalLengthM: 0.032,
      apertureDiameterM: 3.2,
      secondaryDiameterM: 0.8,
    },
    hiddenQuantities: [
      "angularMagnification",
      "blockagePercent",
      "effectiveCollectingAreaM2",
    ],
    requiredGivens: [
      { name: "objectiveFocalLengthM", value: 16.0, unit: "m", source: "stem" },
      { name: "eyepieceFocalLengthM", value: 0.032, unit: "m", source: "stem" },
      { name: "apertureDiameterM", value: 3.2, unit: "m", source: "either" },
      { name: "secondaryDiameterM", value: 0.8, unit: "m", source: "stem" },
    ],
    stem: "A mountain-top Cassegrain reflecting telescope has an effective primary focal length of 16.0 m, an eyepiece focal length of 0.032 m, a primary mirror diameter of 3.20 m, and a secondary mirror diameter of 0.80 m.",
    build: (q) => {
      const m = numQ(q, "angularMagnification");
      const blk = numQ(q, "blockagePercent");
      const eff = numQ(q, "effectiveCollectingAreaM2");
      return {
        parts: [
          {
            partId: "a",
            prompt: "Calculate the angular magnification in normal adjustment.",
            marks: 2,
            targetQuantityKey: "angularMagnification",
            expectedAnswer: fmt3(m),
            workingSteps: [`$M = \\frac{16.0}{0.032} = ${fmt3(m)}$.`],
          },
          {
            partId: "b",
            prompt: "Calculate the percentage of incident light blocked by the secondary mirror.",
            marks: 2,
            targetQuantityKey: "blockagePercent",
            expectedAnswer: fmt3(blk, "%"),
            workingSteps: [
              "Area scales with diameter squared: fraction $= (d_s / D)^2 = (0.80 / 3.20)^2 = 0.0625$.",
              `Convert to percentage: ${fmt3(blk, "%")}.`,
            ],
          },
          {
            partId: "c",
            prompt: "Hence find the effective light-collecting area of the primary mirror.",
            marks: 2,
            dependsOnPartIds: ["b"],
            targetQuantityKey: "effectiveCollectingAreaM2",
            expectedAnswer: fmt3(eff, "m²"),
            workingSteps: [
              `Total primary area $= \\pi (1.60)^2 = 8.04\\text{ m}^2$.`,
              `Subtract blocked area: $A_{\\text{eff}} = 8.04 \\times (1 - 0.0625) = ${fmt3(eff, "m²")}$.`,
            ],
          },
        ],
        markScheme: [
          { code: "M1", criterion: "Applies $M = f_o / f_e$.", marks: 1, partId: "a" },
          { code: "A1", criterion: `Correct magnification ${fmt3(m)}.`, marks: 1, partId: "a" },
          { code: "M1", criterion: "Computes $(0.80 / 3.20)^2 \\times 100$.", marks: 1, partId: "b" },
          { code: "A1", criterion: `Correct percentage blocked ${fmt3(blk, "%")}.`, marks: 1, partId: "b" },
          { code: "M1", criterion: "Subtracts secondary mirror area from primary mirror area.", marks: 1, partId: "c" },
          { code: "A1", criterion: `Correct effective collecting area ${fmt3(eff, "m²")}.`, marks: 1, partId: "c" },
        ],
        workedSolution: `(a) $M = ${fmt3(m)}$. (b) Blockage $= (0.80/3.20)^2 \\times 100 = ${fmt3(blk, "%")}$. (c) $A_{\\text{eff}} = \\pi(1.60^2 - 0.40^2) = ${fmt3(eff, "m²")}$.`,
      };
    },
    planSummary: "Analyse Cassegrain magnification, secondary mirror obstruction percentage, and net area.",
    subpartPlan: ["magnification", "blockage percentage", "effective collecting area"],
  });

  pushStructured(ctx, {
    slug: "astro-tele-str-03",
    conceptId,
    kind,
    domain: "optics-shm",
    subtopicId: sub,
    difficulty: "standard",
    questionStyle: "mixed-exam",
    scenarioSpec: {
      kind,
      mode: "refractor",
      objectiveFocalLengthM: 1.9,
      eyepieceFocalLengthM: 0.038,
      apertureDiameterM: 0.16,
      lensBlueFocalM: 1.872,
      lensRedFocalM: 1.918,
    },
    hiddenQuantities: [
      "chromaticSpreadMm",
      "collectingAreaM2",
      "aberrationClassification",
    ],
    requiredGivens: [
      { name: "apertureDiameterM", value: 0.16, unit: "m", source: "either" },
      { name: "lensBlueFocalM", value: 1.872, unit: "m", source: "stem" },
      { name: "lensRedFocalM", value: 1.918, unit: "m", source: "stem" },
    ],
    stem: "A school refracting telescope uses a single converging glass objective of diameter 0.16 m. Laboratory measurements show that it focuses blue light at 1.872 m and red light at 1.918 m.",
    build: (q) => {
      const spread = numQ(q, "chromaticSpreadMm");
      const area = numQ(q, "collectingAreaM2");
      const ab = strQ(q, "aberrationClassification");
      return {
        parts: [
          {
            partId: "a",
            prompt: "Calculate the longitudinal focal separation between blue and red light in millimetres.",
            marks: 2,
            targetQuantityKey: "chromaticSpreadMm",
            expectedAnswer: fmt3(spread, "mm"),
            workingSteps: [`$\\Delta f = 1.918 - 1.872 = 0.046\\text{ m} = ${fmt3(spread, "mm")}$.`],
          },
          {
            partId: "b",
            prompt: "Explain why this defect occurs in a glass objective lens and state why a Cassegrain reflector avoids it.",
            marks: 2,
            targetMode: "qualitative",
            targetQuantityKey: "aberrationClassification",
            expectedAnswer: `The glass lens exhibits ${ab}, whereas reflection obeys the same angle of reflection for all wavelengths.`,
            workingSteps: [
              "Glass refractive index is greater for shorter-wavelength blue light than red light.",
              "Mirrors reflect all wavelengths at identical angles, eliminating chromatic aberration.",
            ],
          },
          {
            partId: "c",
            prompt: "Calculate the light-collecting area of the 0.16 m objective lens.",
            marks: 2,
            targetQuantityKey: "collectingAreaM2",
            expectedAnswer: fmt3(area, "m²"),
            workingSteps: [`$A = \\pi (0.080)^2 = ${fmt3(area, "m²")}$.`],
          },
        ],
        markScheme: [
          { code: "M1", criterion: "Subtracts $1.918 - 1.872$ and converts to mm.", marks: 1, partId: "a" },
          { code: "A1", criterion: `Correct axial spread ${fmt3(spread, "mm")}.`, marks: 1, partId: "a" },
          { code: "B1", criterion: "Explains blue light refracts more strongly than red light in glass.", marks: 1, partId: "b" },
          { code: "B1", criterion: "States reflection at a mirror is independent of wavelength.", marks: 1, partId: "b" },
          { code: "M1", criterion: "Uses $A = \\pi (D/2)^2$ with radius 0.080 m.", marks: 1, partId: "c" },
          { code: "A1", criterion: `Correct area ${fmt3(area, "m²")}.`, marks: 1, partId: "c" },
        ],
        workedSolution: `(a) $\\Delta f = 1.918 - 1.872 = ${fmt3(spread, "mm")}$. (b) ${ab}; mirrors reflect all wavelengths identically. (c) $A = \\pi(0.080)^2 = ${fmt3(area, "m²")}$.`,
      };
    },
    planSummary: "Assess chromatic aberration spread, dispersion explanation, and lens collecting area.",
    subpartPlan: ["chromatic focal spread", "refractor vs mirror explanation", "collecting area"],
  });

  pushStructured(ctx, {
    slug: "astro-tele-str-04",
    conceptId,
    kind,
    domain: "optics-shm",
    subtopicId: sub,
    difficulty: "higher",
    questionStyle: "derivation",
    scenarioSpec: {
      kind,
      mode: "cassegrain",
      objectiveFocalLengthM: 18.0,
      eyepieceFocalLengthM: 0.045,
      apertureDiameterM: 4.0,
    },
    hiddenQuantities: ["eyepieceFocalLengthM", "fNumber", "primaryMirrorShape"],
    requiredGivens: [
      { name: "objectiveFocalLengthM", value: 18.0, unit: "m", source: "stem" },
      { name: "apertureDiameterM", value: 4.0, unit: "m", source: "either" },
      { name: "angularMagnification", value: 400, source: "stem" },
    ],
    stem: "A research Cassegrain telescope has a 4.00 m diameter primary mirror with an effective focal length of 18.0 m. When fitted with a visual eyepiece in normal adjustment, its angular magnification is 400.",
    build: (q) => {
      const fe = numQ(q, "eyepieceFocalLengthM");
      const fn = numQ(q, "fNumber");
      const shape = strQ(q, "primaryMirrorShape");
      return {
        parts: [
          {
            partId: "a",
            prompt: "Calculate the required focal length of the eyepiece lens.",
            marks: 2,
            targetQuantityKey: "eyepieceFocalLengthM",
            expectedAnswer: fmt3(fe, "m"),
            workingSteps: [`$f_e = \\frac{f_o}{M} = \\frac{18.0}{400} = ${fmt3(fe, "m")}$.`],
          },
          {
            partId: "b",
            prompt: "Determine the focal ratio (f-number $= f_o / D$) of the optical system.",
            marks: 2,
            targetQuantityKey: "fNumber",
            expectedAnswer: fmt3(fn),
            workingSteps: [`$f\\text{-number} = \\frac{18.0}{4.00} = ${fmt3(fn)}$.`],
          },
          {
            partId: "c",
            prompt: "State the shapes of the primary and secondary mirrors and explain how the primary shape prevents spherical aberration.",
            marks: 2,
            targetMode: "qualitative",
            targetQuantityKey: "primaryMirrorShape",
            expectedAnswer: `The Cassegrain uses a ${shape}; the parabolic profile brings both marginal and paraxial parallel rays to a single focal point.`,
            workingSteps: [
              "Identify concave parabolic primary and convex secondary mirrors.",
              "Explain that a parabolic surface reflects all parallel axial rays to a single focus.",
            ],
          },
        ],
        markScheme: [
          { code: "M1", criterion: "Rearranges $M = f_o / f_e$ to $f_e = 18.0 / 400$.", marks: 1, partId: "a" },
          { code: "A1", criterion: `Correct eyepiece focal length ${fmt3(fe, "m")}.`, marks: 1, partId: "a" },
          { code: "M1", criterion: "Divides effective focal length by aperture diameter.", marks: 1, partId: "b" },
          { code: "A1", criterion: `Correct focal ratio ${fmt3(fn)}.`, marks: 1, partId: "b" },
          { code: "B1", criterion: "States concave parabolic primary and convex secondary mirrors.", marks: 1, partId: "c" },
          { code: "B1", criterion: "Explains parabolic curvature focuses outer and inner parallel rays to one point.", marks: 1, partId: "c" },
        ],
        workedSolution: `(a) $f_e = 18.0 / 400 = ${fmt3(fe, "m")}$. (b) $f_o / D = 18.0 / 4.00 = ${fmt3(fn)}$. (c) Uses a ${shape}, eliminating spherical aberration for on-axis parallel rays.`,
      };
    },
    planSummary: "Calculate Cassegrain eyepiece focal length, focal ratio, and mirror aberration control.",
    subpartPlan: ["eyepiece focal length", "focal ratio", "parabolic mirror geometry"],
  });

  // 1 Authentic 6-Mark LoR
  pushSixMarkLor(ctx, {
    slug: "astro-tele-lor-01",
    conceptId,
    kind,
    domain: "optics-shm",
    subtopicId: sub,
    scenarioSpec: {
      kind,
      mode: "cassegrain",
      objectiveFocalLengthM: 12.0,
      eyepieceFocalLengthM: 0.04,
      apertureDiameterM: 2.5,
      secondaryDiameterM: 0.55,
    },
    targetQuantityKey: "lorComparisonAnchor",
    stem: "An astrophysics consortium must choose between a large refracting telescope and a Cassegrain reflecting telescope of much larger aperture for deep-sky observations of faint galaxies.",
    prompt:
      "Compare the optical performance and practical construction of a refracting telescope and a Cassegrain reflecting telescope, addressing image brightness, resolving power, optical aberrations, and mechanical limitations.",
    expectedAnswer: (anchor) =>
      `A Cassegrain reflector outperforms a large refractor for faint deep-sky work because mirrors can be supported across their entire rear surface, enabling huge apertures with ${anchor} so far more photons are gathered per second and fainter galaxies become visible. Larger aperture diameter also improves angular resolution via $\\theta \\approx \\lambda / D$. Unlike a glass refracting objective, reflection from the concave parabolic primary and convex secondary mirrors introduces zero chromatic aberration, and the parabolic curvature prevents on-axis spherical aberration. Large glass lenses can only be supported around their rim, causing sagging under gravity, glass absorption, bubbles, and very long heavy tubes. However, the Cassegrain secondary mirror and spider vanes obstruct a small fraction of incoming light and introduce slight diffraction spikes, and mirrors require periodic re-aluminising and collimation.`,
    workingSteps: [
      "Link large mirror diameter to brighter images via collecting power proportional to diameter squared.",
      "Link larger diameter to finer detail via Rayleigh criterion $\\theta \\approx \\lambda / D$.",
      "Contrast chromatic aberration in refractors with wavelength-independent reflection in Cassegrains.",
      "Explain parabolic primary curvature eliminating on-axis spherical aberration.",
      "Contrast rear-surface mirror support and compact folded path with rim-supported sagging lenses.",
      "Note Cassegrain trade-offs: secondary mirror blockage, spider-vane diffraction, and alignment maintenance.",
    ],
    criteriaSix: [
      "States that mirrors can be built much larger than lenses because they are supported across the back rather than only at the edge.",
      "Links larger aperture diameter to greater image brightness because collecting power is proportional to diameter squared.",
      "Links larger aperture diameter to better angular resolution via the Rayleigh relation $\\theta \\approx \\lambda / D$.",
      "Explains that reflectors avoid chromatic aberration because reflection does not depend on wavelength, unlike glass refraction.",
      "Explains that a parabolic primary mirror eliminates spherical aberration whereas thick lenses suffer glass absorption and sagging.",
      "Evaluates reflector drawbacks accurately: secondary mirror and support struts block some light and cause additional diffraction.",
    ],
    workedSolution: (anchor) =>
      `Level 3 response covers: (1) Brightness & resolution — larger mirror diameters give ${anchor} and smaller $\\theta \\approx \\lambda / D$; (2) Aberrations — mirrors eliminate chromatic aberration and a parabolic primary eliminates spherical aberration; (3) Engineering — mirrors are rear-supported and folded compactly whereas heavy lenses sag and absorb light; (4) Trade-offs — secondary obstruction reduces effective area slightly and introduces diffraction.`,
    planSummary: "Six-mark level-of-response comparison of refracting versus Cassegrain reflecting telescopes.",
  });
}

function populateAstroResolutionCcd(ctx: BuilderContext): void {
  const kind = "al-opt-astro-resolution-ccd";
  const conceptId = "single-slit-diffraction-gratings";
  const sub = "alevel-3-9-astrophysics" as const;

  // 4 Calc MCQs
  pushCalcMcq(ctx, {
    slug: "astro-res-calc-01",
    conceptId,
    kind,
    domain: "waves",
    subtopicId: sub,
    difficulty: "foundation",
    scenarioSpec: {
      kind,
      mode: "airy-rayleigh",
      wavelengthM: 5.4e-7,
      apertureDiameterM: 2.7,
    },
    hiddenQuantities: ["rayleighAngleRad"],
    requiredGivens: [
      { name: "wavelengthM", value: 5.4e-7, unit: "m", source: "stem" },
      { name: "apertureDiameterM", value: 2.7, unit: "m", source: "stem" },
    ],
    targetQuantityKey: "rayleighAngleRad",
    unit: "rad",
    stem: "An optical reflecting telescope with an aperture diameter of 2.70 m observes a close binary star system at a mean wavelength of 540 nm. Using the Rayleigh criterion $\\theta \\approx \\frac{\\lambda}{D}$, what is the minimum angular separation the telescope can resolve?",
    distractors: (q) => {
      const th = numQ(q, "rayleighAngleRad");
      return [
        { value: th * 2, rationale: "Uses aperture radius instead of diameter in theta = lambda / D." },
        { value: th * 0.5, rationale: "Doubles the diameter erroneously." },
        { value: 2.7 / 5.4e-7, rationale: "Inverts the Rayleigh formula as D / lambda." },
      ];
    },
    workedSolution: (_q, ans) =>
      `Applying the AQA Rayleigh criterion $\\theta \\approx \\frac{\\lambda}{D} = \\frac{5.40 \\times 10^{-7}}{2.70} = ${ans}$.`,
    planSummary: "Apply AQA Rayleigh criterion theta equals lambda over D for an optical telescope.",
  });

  pushCalcMcq(ctx, {
    slug: "astro-res-calc-02",
    conceptId,
    kind,
    domain: "waves",
    subtopicId: sub,
    difficulty: "standard",
    scenarioSpec: {
      kind,
      mode: "airy-rayleigh",
      wavelengthM: 5.0e-7,
      apertureDiameterM: 1.6,
      distanceM: 3.84e8,
    },
    hiddenQuantities: ["linearResolutionM", "rayleighAngleRad"],
    requiredGivens: [
      { name: "wavelengthM", value: 5.0e-7, unit: "m", source: "stem" },
      { name: "apertureDiameterM", value: 1.6, unit: "m", source: "stem" },
      { name: "distanceM", value: 3.84e8, unit: "m", source: "stem" },
    ],
    targetQuantityKey: "linearResolutionM",
    unit: "m",
    stem: "A lunar-mapping reflector of diameter 1.60 m observes craters on the Moon at a distance of 3.84 × 10⁸ m using green light of wavelength 500 nm. Neglecting atmospheric distortion, what is the smallest surface feature separation just resolved?",
    distractors: (q) => {
      const s = numQ(q, "linearResolutionM");
      return [
        { value: s * 2, rationale: "Substitutes mirror radius instead of diameter into the Rayleigh criterion." },
        { value: s * 0.5, rationale: "Divides the resolved linear separation by two erroneously." },
        { value: s * 10, rationale: "Makes a factor-of-ten power error converting nanometres to metres." },
      ];
    },
    workedSolution: (q, ans) =>
      `$\\theta \\approx \\frac{\\lambda}{D} = \\frac{5.00 \\times 10^{-7}}{1.60} = ${fmt3(numQ(q, "rayleighAngleRad"), "rad")}$. The linear separation is $s = r\\theta = 3.84 \\times 10^{8} \\times ${fmt3(numQ(q, "rayleighAngleRad"))} = ${ans}$.`,
    planSummary: "Calculate smallest resolvable linear separation on the Moon using Rayleigh criterion.",
  });

  pushCalcMcq(ctx, {
    slug: "astro-res-calc-03",
    conceptId,
    kind,
    domain: "waves",
    subtopicId: sub,
    difficulty: "foundation",
    scenarioSpec: {
      kind,
      mode: "aperture-compare",
      wavelengthM: 5.5e-7,
      apertureDiameterM: 1.5,
      secondApertureDiameterM: 6.0,
    },
    hiddenQuantities: ["collectingPowerRatio"],
    requiredGivens: [
      { name: "apertureDiameterM", value: 1.5, unit: "m", source: "either" },
      { name: "secondApertureDiameterM", value: 6.0, unit: "m", source: "either" },
    ],
    targetQuantityKey: "collectingPowerRatio",
    stem: "An observatory upgrades from a 1.50 m primary mirror to a 6.00 m primary mirror operating at the same optical wavelength. By what factor does the collecting power increase?",
    distractors: () => [
      { value: 4.0, rationale: "Assumes collecting power scales linearly with diameter D rather than D squared." },
      { value: 8.0, rationale: "Multiplies the diameter ratio by two instead of squaring it." },
      { value: 64.0, rationale: "Cubes the diameter ratio instead of squaring it." },
    ],
    workedSolution: (_q, ans) =>
      `Collecting power is proportional to collecting area and hence $D^2$: $\\frac{P_2}{P_1} = \\left(\\frac{6.00}{1.50}\\right)^2 = 4^2 = ${ans}$.`,
    planSummary: "Compute collecting power ratio from two telescope diameters.",
  });

  pushCalcMcq(ctx, {
    slug: "astro-res-calc-04",
    conceptId,
    kind,
    domain: "waves",
    subtopicId: sub,
    difficulty: "higher",
    scenarioSpec: {
      kind,
      mode: "aperture-compare",
      wavelengthM: 0.21,
      apertureDiameterM: 64,
      secondApertureDiameterM: 0.2,
      secondWavelengthM: 5.0e-7,
    },
    hiddenQuantities: ["rayleighAngleRad", "meshToleranceM"],
    requiredGivens: [
      { name: "wavelengthM", value: 0.21, unit: "m", source: "either" },
      { name: "apertureDiameterM", value: 64, unit: "m", source: "either" },
    ],
    targetQuantityKey: "rayleighAngleRad",
    unit: "rad",
    stem: "A steerable radio dish of diameter 64.0 m monitors neutral hydrogen emission at a wavelength of 0.210 m. What is the minimum angular resolution of this single radio dish?",
    distractors: (q) => {
      const th = numQ(q, "rayleighAngleRad");
      return [
        { value: th * 2, rationale: "Uses the dish radius 32 m instead of diameter 64 m." },
        { value: 64 / 0.21, rationale: "Inverts the Rayleigh equation to D / lambda." },
        { value: th / 20, rationale: "Confuses dish angular resolution with the lambda / 20 mesh tolerance rule." },
      ];
    },
    workedSolution: (_q, ans) =>
      `Using $\\theta \\approx \\frac{\\lambda}{D} = \\frac{0.210}{64.0} = ${ans}$.`,
    planSummary: "Compute minimum angular resolution of a radio telescope observing the hydrogen line.",
  });

  // 3 Pure Qual MCQs
  pushQualMcq(ctx, {
    slug: "astro-res-qual-01",
    conceptId,
    kind,
    domain: "waves",
    subtopicId: sub,
    difficulty: "foundation",
    questionStyle: "definition",
    scenarioSpec: {
      kind,
      mode: "airy-rayleigh",
      wavelengthM: 5.5e-7,
      apertureDiameterM: 2.0,
    },
    targetQuantityKey: "rayleighCriterionRule",
    stem: "According to the Rayleigh criterion, when are two point-like stars of equal brightness considered to be just resolved by a circular telescope aperture?",
    correctOption: (a) => `When the ${a}.`,
    distractors: [
      {
        text: "When the first minima of both diffraction patterns overlap at the same angle.",
        rationale: "Overlapping first minima leaves the central peaks completely superposed and unresolved.",
      },
      {
        text: "When the first secondary maxima of both patterns touch without any central overlap.",
        rationale: "This describes well-separated sources rather than the threshold of just-resolved images.",
      },
      {
        text: "When the central maxima coincide and produce double peak intensity.",
        rationale: "Coincident central maxima appear as a single unresolved source.",
      },
    ],
    workedSolution: (a) =>
      `By definition, two sources are just resolved under the Rayleigh criterion when the ${a}.`,
    planSummary: "State the Rayleigh criterion for resolving two circular diffraction patterns.",
  });

  pushQualMcq(ctx, {
    slug: "astro-res-qual-02",
    conceptId,
    kind,
    domain: "waves",
    subtopicId: sub,
    difficulty: "standard",
    scenarioSpec: {
      kind,
      mode: "aperture-compare",
      wavelengthM: 5.5e-7,
      apertureDiameterM: 2.4,
      secondApertureDiameterM: 40,
    },
    targetQuantityKey: "ccdAdvantageAnchor",
    stem: "Why have charge-coupled devices (CCDs) largely replaced direct visual observation by the unaided human eye at research optical observatories?",
    correctOption: (a) => `CCDs offer ${a}.`,
    distractors: [
      {
        text: "CCDs reduce the diffraction wavelength of incoming starlight inside silicon pixels.",
        rationale: "A detector cannot alter the wavelength or diffraction limit set by the telescope aperture.",
      },
      {
        text: "CCDs have lower quantum efficiency than the eye but eliminate atmospheric turbulence completely.",
        rationale: "CCDs have far higher quantum efficiency than the eye and do not remove atmospheric seeing.",
      },
      {
        text: "CCDs produce a logarithmic response identical to the eye while operating only in green light.",
        rationale: "CCDs have a linear response and detect across UV, visible, and near-infrared wavelengths.",
      },
    ],
    workedSolution: (a) =>
      `CCDs convert roughly seventy to eighty percent of incident photons into electron-hole pairs compared with roughly one percent for the eye, giving ${a}.`,
    planSummary: "Identify principal advantages of astronomical CCD detectors over the human eye.",
  });

  pushQualMcq(ctx, {
    slug: "astro-res-qual-03",
    conceptId,
    kind,
    domain: "waves",
    subtopicId: sub,
    difficulty: "standard",
    scenarioSpec: {
      kind,
      mode: "aperture-compare",
      wavelengthM: 0.15,
      apertureDiameterM: 50,
      secondApertureDiameterM: 2.0,
    },
    targetQuantityKey: "atmospherePositioningAnchor",
    stem: "Which statement correctly explains how Earth's atmosphere dictates the siting of telescopes across the electromagnetic spectrum?",
    correctOption: (a) => `Ground observatories work where ${a}.`,
    distractors: [
      {
        text: "X-ray and ultraviolet radiation penetrate cleanly to sea level while radio waves are blocked by water vapour.",
        rationale: "Reverses atmospheric transmission: ozone and air absorb X-rays and UV while radio waves pass easily.",
      },
      {
        text: "Only optical telescopes require space deployment because glass mirrors absorb infrared radiation.",
        rationale: "Optical telescopes operate well from high dry mountains; infrared and X-ray bands suffer strong atmospheric absorption.",
      },
      {
        text: "Atmospheric absorption affects all wavelengths equally, so space siting is chosen solely to avoid clouds.",
        rationale: "Atmospheric transparency varies sharply with wavelength, leaving distinct optical and radio windows.",
      },
    ],
    workedSolution: (a) =>
      `Earth's atmosphere absorbs high-energy and most infrared wavelengths; hence ${a}.`,
    planSummary: "Explain atmospheric transmission windows and telescope siting.",
  });

  // 4 Multi-part Structured
  pushStructured(ctx, {
    slug: "astro-res-str-01",
    conceptId,
    kind,
    domain: "waves",
    subtopicId: sub,
    difficulty: "standard",
    questionStyle: "mixed-exam",
    scenarioSpec: {
      kind,
      mode: "airy-rayleigh",
      wavelengthM: 6.0e-7,
      apertureDiameterM: 2.4,
      distanceM: 1.2e11,
    },
    hiddenQuantities: [
      "rayleighAngleRad",
      "linearResolutionKm",
      "rayleighCriterionRule",
    ],
    requiredGivens: [
      { name: "wavelengthM", value: 6.0e-7, unit: "m", source: "stem" },
      { name: "apertureDiameterM", value: 2.4, unit: "m", source: "stem" },
      { name: "distanceM", value: 1.2e11, unit: "m", source: "stem" },
    ],
    stem: "A space-based optical reflector of diameter 2.40 m observes an asteroid pair at a distance of 1.20 × 10¹¹ m using light of wavelength 600 nm.",
    build: (q) => {
      const th = numQ(q, "rayleighAngleRad");
      const km = numQ(q, "linearResolutionKm");
      const rule = strQ(q, "rayleighCriterionRule");
      return {
        parts: [
          {
            partId: "a",
            prompt: "State the Rayleigh criterion for the resolution of two point sources.",
            marks: 2,
            targetMode: "qualitative",
            targetQuantityKey: "rayleighCriterionRule",
            expectedAnswer: `Two point sources are just resolved when the ${rule}.`,
            workingSteps: [
              "Describe the diffraction Airy patterns of both sources.",
              "Specify coincidence of central maximum and first minimum.",
            ],
          },
          {
            partId: "b",
            prompt: "Calculate the minimum resolvable angular separation of the telescope.",
            marks: 2,
            targetQuantityKey: "rayleighAngleRad",
            expectedAnswer: fmt3(th, "rad"),
            workingSteps: [`$\\theta \\approx \\frac{\\lambda}{D} = \\frac{6.00 \\times 10^{-7}}{2.40} = ${fmt3(th, "rad")}$.`],
          },
          {
            partId: "c",
            prompt: "Determine the minimum linear separation in kilometres between the two asteroids if they are to be resolved.",
            marks: 2,
            dependsOnPartIds: ["b"],
            targetQuantityKey: "linearResolutionKm",
            expectedAnswer: fmt3(km, "km"),
            workingSteps: [
              `$s = r \\theta = 1.20 \\times 10^{11} \\times ${fmt3(th)} = ${fmt3(km * 1000, "m")} = ${fmt3(km, "km")}$.`,
            ],
          },
        ],
        markScheme: [
          { code: "B1", criterion: "Refers to the Airy / central diffraction maxima of the two images.", marks: 1, partId: "a" },
          { code: "B1", criterion: "States central maximum of one coincides with the first minimum of the other.", marks: 1, partId: "a" },
          { code: "M1", criterion: "Uses $\\theta \\approx \\lambda / D = 6.00 \\times 10^{-7} / 2.40$.", marks: 1, partId: "b" },
          { code: "A1", criterion: `Correct angle ${fmt3(th, "rad")}.`, marks: 1, partId: "b" },
          { code: "M1", criterion: "Multiplies distance by $\\theta$ and converts to km.", marks: 1, partId: "c" },
          { code: "A1", criterion: `Correct linear separation ${fmt3(km, "km")}.`, marks: 1, partId: "c" },
        ],
        workedSolution: `(a) ${rule}. (b) $\\theta \\approx ${fmt3(th, "rad")}$. (c) $s = r\\theta = ${fmt3(km, "km")}$.`,
      };
    },
    planSummary: "Apply Rayleigh criterion statement and compute angular and linear resolution for a space telescope.",
    subpartPlan: ["state Rayleigh criterion", "compute angular resolution", "compute linear separation"],
  });

  pushStructured(ctx, {
    slug: "astro-res-str-02",
    conceptId,
    kind,
    domain: "waves",
    subtopicId: sub,
    difficulty: "standard",
    questionStyle: "calculation",
    scenarioSpec: {
      kind,
      mode: "aperture-compare",
      wavelengthM: 0.18,
      apertureDiameterM: 45,
      secondApertureDiameterM: 3.0,
      secondWavelengthM: 5.0e-7,
    },
    hiddenQuantities: [
      "meshToleranceM",
      "rayleighAngleRad",
      "secondRayleighAngleRad",
    ],
    requiredGivens: [
      { name: "wavelengthM", value: 0.18, unit: "m", source: "either" },
      { name: "apertureDiameterM", value: 45, unit: "m", source: "either" },
      { name: "secondApertureDiameterM", value: 3.0, unit: "m", source: "either" },
      { name: "secondWavelengthM", value: 5.0e-7, unit: "m", source: "stem" },
    ],
    stem: "A 45.0 m diameter wire-mesh radio telescope observes emissions at wavelength 0.180 m, while a 3.00 m optical reflector observes at wavelength 500 nm.",
    build: (q) => {
      const mesh = numQ(q, "meshToleranceM");
      const thR = numQ(q, "rayleighAngleRad");
      const thO = numQ(q, "secondRayleighAngleRad");
      return {
        parts: [
          {
            partId: "a",
            prompt: "Calculate the maximum surface irregularity (or wire mesh spacing $\\lambda / 20$) permitted on the radio dish.",
            marks: 2,
            targetQuantityKey: "meshToleranceM",
            expectedAnswer: fmt3(mesh, "m"),
            workingSteps: [`$\\Delta x_{\\max} = \\frac{0.180}{20} = ${fmt3(mesh, "m")}$.`],
          },
          {
            partId: "b",
            prompt: "Calculate the minimum resolvable angle of the 45.0 m radio telescope.",
            marks: 2,
            targetQuantityKey: "rayleighAngleRad",
            expectedAnswer: fmt3(thR, "rad"),
            workingSteps: [`$\\theta_{\\text{radio}} \\approx \\frac{0.180}{45.0} = ${fmt3(thR, "rad")}$.`],
          },
          {
            partId: "c",
            prompt: "Calculate the minimum resolvable angle of the 3.00 m optical reflector and comment on which resolves finer detail.",
            marks: 2,
            targetQuantityKey: "secondRayleighAngleRad",
            expectedAnswer: `${fmt3(thO, "rad")} (optical telescope resolves far finer detail).`,
            workingSteps: [
              `$\\theta_{\\text{opt}} \\approx \\frac{5.00 \\times 10^{-7}}{3.00} = ${fmt3(thO, "rad")}$.`,
              "Despite the smaller aperture, the vastly shorter optical wavelength yields a much smaller minimum angle.",
            ],
          },
        ],
        markScheme: [
          { code: "M1", criterion: "Applies the $\\lambda / 20$ surface accuracy criterion.", marks: 1, partId: "a" },
          { code: "A1", criterion: `Correct mesh limit ${fmt3(mesh, "m")}.`, marks: 1, partId: "a" },
          { code: "M1", criterion: "Uses $\\theta \\approx 0.180 / 45.0$.", marks: 1, partId: "b" },
          { code: "A1", criterion: `Correct radio resolution ${fmt3(thR, "rad")}.`, marks: 1, partId: "b" },
          { code: "M1", criterion: "Computes $\\theta \\approx 5.00 \\times 10^{-7} / 3.00$.", marks: 1, partId: "c" },
          { code: "A1", criterion: `Correct optical resolution ${fmt3(thO, "rad")} and identifies superior optical detail.`, marks: 1, partId: "c" },
        ],
        workedSolution: `(a) $\\lambda/20 = ${fmt3(mesh, "m")}$. (b) $\\theta_{\\text{radio}} = ${fmt3(thR, "rad")}$. (c) $\\theta_{\\text{opt}} = ${fmt3(thO, "rad")}$, orders of magnitude finer than the radio dish.`,
      };
    },
    planSummary: "Compare radio dish mesh tolerance and angular resolution against an optical reflector.",
    subpartPlan: ["radio mesh tolerance", "radio angular resolution", "optical angular resolution comparison"],
  });

  pushStructured(ctx, {
    slug: "astro-res-str-03",
    conceptId,
    kind,
    domain: "waves",
    subtopicId: sub,
    difficulty: "standard",
    questionStyle: "mixed-exam",
    scenarioSpec: {
      kind,
      mode: "aperture-compare",
      wavelengthM: 5.5e-7,
      apertureDiameterM: 0.4,
      secondApertureDiameterM: 2.0,
      ccdQuantumEfficiencyPct: 80,
      eyeQuantumEfficiencyPct: 1,
    },
    hiddenQuantities: [
      "collectingPowerRatio",
      "qeAdvantageFactor",
      "ccdAdvantageAnchor",
    ],
    requiredGivens: [
      { name: "apertureDiameterM", value: 0.4, unit: "m", source: "either" },
      { name: "secondApertureDiameterM", value: 2.0, unit: "m", source: "either" },
      { name: "ccdQuantumEfficiencyPct", value: 80, unit: "%", source: "stem" },
      { name: "eyeQuantumEfficiencyPct", value: 1, unit: "%", source: "stem" },
    ],
    stem: "A 0.40 m visual telescope (viewed with an eye of quantum efficiency 1.0%) is compared with a 2.00 m observatory telescope equipped with a cooled CCD camera of quantum efficiency 80%.",
    build: (q) => {
      const cp = numQ(q, "collectingPowerRatio");
      const qe = numQ(q, "qeAdvantageFactor");
      const adv = strQ(q, "ccdAdvantageAnchor");
      return {
        parts: [
          {
            partId: "a",
            prompt: "Calculate the ratio of the light-collecting power of the 2.00 m mirror to the 0.40 m mirror.",
            marks: 2,
            targetQuantityKey: "collectingPowerRatio",
            expectedAnswer: fmt3(cp),
            workingSteps: [`$\\frac{P_2}{P_1} = \\left(\\frac{2.00}{0.40}\\right)^2 = ${fmt3(cp)}$.`],
          },
          {
            partId: "b",
            prompt: "Calculate the ratio of the CCD quantum efficiency to that of the human eye.",
            marks: 2,
            targetQuantityKey: "qeAdvantageFactor",
            expectedAnswer: fmt3(qe),
            workingSteps: [`$\\frac{80\\%}{1.0\\%} = ${fmt3(qe)}$.`],
          },
          {
            partId: "c",
            prompt: "State two further advantages of using a CCD detector over the human eye besides quantum efficiency.",
            marks: 2,
            targetMode: "qualitative",
            targetQuantityKey: "ccdAdvantageAnchor",
            expectedAnswer: `CCDs provide ${adv}, plus digital integration for long exposures.`,
            workingSteps: [
              "Mention linear output proportional to incident photon count.",
              "Mention wider spectral sensitivity extending into UV and near-IR.",
            ],
          },
        ],
        markScheme: [
          { code: "M1", criterion: "Applies collecting power ratio $(2.00 / 0.40)^2$.", marks: 1, partId: "a" },
          { code: "A1", criterion: `Correct collecting power ratio ${fmt3(cp)}.`, marks: 1, partId: "a" },
          { code: "M1", criterion: "Divides 80% by 1.0%.", marks: 1, partId: "b" },
          { code: "A1", criterion: `Correct QE factor ${fmt3(qe)}.`, marks: 1, partId: "b" },
          { code: "B1", criterion: "States wider spectral sensitivity (e.g. near-IR / UV).", marks: 1, partId: "c" },
          { code: "B1", criterion: "States linear response or digital storage / long-exposure image stacking.", marks: 1, partId: "c" },
        ],
        workedSolution: `(a) Collecting power ratio $= (2.00/0.40)^2 = ${fmt3(cp)}$. (b) QE ratio $= ${fmt3(qe)}$. (c) Beyond QE, ${adv}.`,
      };
    },
    planSummary: "Compare collecting power and CCD versus human eye detector performance.",
    subpartPlan: ["collecting power ratio", "quantum efficiency factor", "qualitative CCD benefits"],
  });

  pushStructured(ctx, {
    slug: "astro-res-str-04",
    conceptId,
    kind,
    domain: "waves",
    subtopicId: sub,
    difficulty: "higher",
    questionStyle: "mixed-exam",
    scenarioSpec: {
      kind,
      mode: "airy-rayleigh",
      wavelengthM: 4.5e-7,
      apertureDiameterM: 3.6,
      distanceM: 9.46e16,
    },
    hiddenQuantities: [
      "rayleighAngleRad",
      "collectingAreaM2",
      "atmospherePositioningAnchor",
    ],
    requiredGivens: [
      { name: "wavelengthM", value: 4.5e-7, unit: "m", source: "stem" },
      { name: "apertureDiameterM", value: 3.6, unit: "m", source: "stem" },
    ],
    stem: "An orbital ultraviolet-optical survey telescope has a primary mirror of diameter 3.60 m and records blue starlight at 450 nm.",
    build: (q) => {
      const th = numQ(q, "rayleighAngleRad");
      const area = numQ(q, "collectingAreaM2");
      const atm = strQ(q, "atmospherePositioningAnchor");
      return {
        parts: [
          {
            partId: "a",
            prompt: "Calculate the primary mirror collecting area.",
            marks: 2,
            targetQuantityKey: "collectingAreaM2",
            expectedAnswer: fmt3(area, "m²"),
            workingSteps: [`$A = \\pi (1.80)^2 = ${fmt3(area, "m²")}$.`],
          },
          {
            partId: "b",
            prompt: "Calculate the theoretical minimum angular resolution at 450 nm.",
            marks: 2,
            targetQuantityKey: "rayleighAngleRad",
            expectedAnswer: fmt3(th, "rad"),
            workingSteps: [`$\\theta \\approx \\frac{4.50 \\times 10^{-7}}{3.60} = ${fmt3(th, "rad")}$.`],
          },
          {
            partId: "c",
            prompt: "Explain why space deployment is essential when the same observatory switches from visible light to ultraviolet wavelengths.",
            marks: 2,
            targetMode: "qualitative",
            targetQuantityKey: "atmospherePositioningAnchor",
            expectedAnswer: `Space placement avoids ozone absorption and atmospheric turbulence because ${atm}.`,
            workingSteps: [
              "State that Earth's ozone layer strongly absorbs ultraviolet radiation.",
              "Note that orbiting above the atmosphere also removes seeing distortion.",
            ],
          },
        ],
        markScheme: [
          { code: "M1", criterion: "Uses $A = \\pi (D/2)^2$ with $r = 1.80\\text{ m}$.", marks: 1, partId: "a" },
          { code: "A1", criterion: `Correct area ${fmt3(area, "m²")}.`, marks: 1, partId: "a" },
          { code: "M1", criterion: "Applies $\\theta \\approx 4.50 \\times 10^{-7} / 3.60$.", marks: 1, partId: "b" },
          { code: "A1", criterion: `Correct angle ${fmt3(th, "rad")}.`, marks: 1, partId: "b" },
          { code: "B1", criterion: "Explains that Earth's atmosphere / ozone absorbs UV radiation.", marks: 1, partId: "c" },
          { code: "B1", criterion: "Notes absence of atmospheric refraction turbulence improves achieved resolution.", marks: 1, partId: "c" },
        ],
        workedSolution: `(a) $A = ${fmt3(area, "m²")}$. (b) $\\theta \\approx ${fmt3(th, "rad")}$. (c) ${atm}.`,
      };
    },
    planSummary: "Compute orbital telescope area and Rayleigh limit and justify space siting for UV.",
    subpartPlan: ["collecting area", "angular resolution", "space siting justification"],
  });

  // 1 Authentic 6-Mark LoR
  pushSixMarkLor(ctx, {
    slug: "astro-res-lor-01",
    conceptId,
    kind,
    domain: "waves",
    subtopicId: sub,
    scenarioSpec: {
      kind,
      mode: "aperture-compare",
      wavelengthM: 0.21,
      apertureDiameterM: 76,
      secondApertureDiameterM: 4.0,
      secondWavelengthM: 5.5e-7,
    },
    targetQuantityKey: "lorComparisonAnchor",
    stem: "Modern astrophysics combines data from giant ground-based radio dishes and high-altitude optical reflectors.",
    prompt:
      "Compare the structure, siting, collecting power, and resolving power of a single-dish radio telescope and a ground-based optical reflecting telescope.",
    expectedAnswer: (anchor) =>
      `Both telescopes use parabolic reflectors to focus incoming electromagnetic waves, where ${anchor}. Because radio wavelengths (centimetres to metres) are roughly $10^5$ to $10^6$ times longer than visible wavelengths, a radio dish must have a far larger diameter to achieve useful resolution, yet even a huge single dish still has poorer angular resolution than a modest optical mirror. Radio dishes can be constructed from lightweight wire mesh because surface precision only needs to be better than about $\\lambda / 20$, whereas optical mirrors require precision-ground glass polished to fractions of a micrometre. Both optical and radio waves pass through atmospheric windows, but optical reflectors must be sited on high, dry, dark mountain peaks away from light pollution, clouds, and turbulent air, whereas radio telescopes can operate day and night in cloudy weather at lower altitudes, sited away from human radio-frequency interference.`,
    workingSteps: [
      "State both rely on parabolic reflecting surfaces with collecting power proportional to diameter squared.",
      "Compare minimum resolvable angle $\\theta \\approx \\lambda / D$ across radio vs visible wavelengths.",
      "Explain why radio dishes can use open wire mesh ($\\sim \\lambda / 20$ tolerance) vs precision-polished optical mirrors.",
      "Explain atmospheric windows allowing ground operation for both bands.",
      "Contrast siting constraints: high dry dark mountains for optical vs radio-quiet valleys for radio (24-hour, cloud-penetrating).",
      "Note linking multiple radio dishes as an interferometer overcomes single-dish resolution limits.",
    ],
    criteriaSix: [
      "States that both telescopes use parabolic reflectors with collecting power proportional to $D^2$.",
      "Applies $\\theta \\approx \\lambda / D$ to explain why radio telescopes have much poorer angular resolution than optical telescopes despite far larger diameters.",
      "Explains why radio dishes can use lightweight wire mesh (mesh spacing smaller than $\\lambda / 20$) whereas optical mirrors need sub-wavelength smooth glass.",
      "Identifies that both bands pass through Earth's atmospheric windows allowing ground-based operation.",
      "Explains optical siting requirements: high, dry, dark sites to minimise cloud cover, atmospheric turbulence, and light pollution.",
      "Explains radio siting advantages and constraints: operates in daylight/clouds at sea level, but must avoid terrestrial radio interference.",
    ],
    workedSolution: (anchor) =>
      `Level 3 synthesis: ${anchor}; radio wavelengths are orders of magnitude longer so dishes are huge wire-mesh structures ($\\lambda/20$ tolerance) with coarser single-dish resolution than precision mountain-top optical reflectors, while both use ground atmospheric windows with distinct siting requirements.`,
    planSummary: "Six-mark level-of-response comparison of single-dish radio and ground optical telescopes.",
  });
}

function populateAstroMagnitudeSupernovae(ctx: BuilderContext): void {
  const kind = "al-opt-astro-magnitude-supernovae";
  const conceptId = "cosmology-hubble-law";
  const sub = "alevel-3-9-astrophysics" as const;

  // 4 Calc MCQs
  pushCalcMcq(ctx, {
    slug: "astro-mag-calc-01",
    conceptId,
    kind,
    domain: "grav-astro",
    subtopicId: sub,
    difficulty: "foundation",
    scenarioSpec: {
      kind,
      mode: "supernova-lightcurve",
      apparentMagnitude: 15.7,
      absoluteMagnitude: -19.3,
    },
    hiddenQuantities: ["distanceMpc", "distancePc"],
    requiredGivens: [
      { name: "apparentMagnitude", value: 15.7, source: "stem" },
      { name: "absoluteMagnitude", value: -19.3, source: "either" },
    ],
    targetQuantityKey: "distanceMpc",
    unit: "Mpc",
    stem: "A Type Ia supernova reaches a peak apparent magnitude of 15.7 in a distant spiral galaxy. Taking the standard peak absolute magnitude of a Type Ia supernova to be -19.3, calculate the distance to the host galaxy in megaparsecs.",
    distractors: () => [
      { value: 10.0, rationale: "Forgets the factor of 10 pc in m - M = 5 lg(d / 10)." },
      { value: 0.191, rationale: "Reverses the sign of M, computing m + M = -3.6 instead of m - M = 35.0." },
      { value: 1000, rationale: "Applies an extra factor of ten when converting parsecs to megaparsecs." },
    ],
    workedSolution: (_q, ans) =>
      `Using $m - M = 5 \\lg(d/10)$ with $d$ in pc: $15.7 - (-19.3) = 35.0 = 5 \\lg(d/10)$, so $\\lg(d/10) = 7.00$, giving $d = 10 \\times 10^{7}\\text{ pc} = 1.00 \\times 10^{8}\\text{ pc} = ${ans}$.`,
    planSummary: "Compute host galaxy distance in Mpc from Type Ia peak apparent and absolute magnitudes.",
  });

  pushCalcMcq(ctx, {
    slug: "astro-mag-calc-02",
    conceptId,
    kind,
    domain: "grav-astro",
    subtopicId: sub,
    difficulty: "foundation",
    scenarioSpec: {
      kind,
      mode: "supernova-lightcurve",
      apparentMagnitude: 1.4,
      absoluteMagnitude: -0.6,
      secondApparentMagnitude: 4.4,
    },
    hiddenQuantities: ["brightnessRatio"],
    requiredGivens: [
      { name: "apparentMagnitude", value: 1.4, source: "stem" },
      { name: "secondApparentMagnitude", value: 4.4, source: "stem" },
    ],
    targetQuantityKey: "brightnessRatio",
    stem: "Two main-sequence stars observed in the same constellation have apparent magnitudes $m_1 = 1.4$ and $m_2 = 4.4$. Using the Hipparcos magnitude scale, how many times greater is the intensity received from star 1 than from star 2?",
    distractors: () => [
      { value: 7.53, rationale: "Multiplies 2.51 by the magnitude difference 3.0 instead of raising 2.51 to the power 3.0." },
      { value: 3.0, rationale: "Treats the apparent magnitude scale as linear rather than logarithmic." },
      { value: 60.0, rationale: "Assumes each magnitude step equals a factor of 20 rather than 2.51." },
    ],
    workedSolution: (_q, ans) =>
      `On the Hipparcos scale, $\\frac{I_1}{I_2} = 2.51^{m_2 - m_1} = 2.51^{4.4 - 1.4} = 2.51^{3.0} = ${ans}$.`,
    planSummary: "Calculate Hipparcos intensity ratio between two stars from apparent magnitudes.",
  });

  pushCalcMcq(ctx, {
    slug: "astro-mag-calc-03",
    conceptId,
    kind,
    domain: "grav-astro",
    subtopicId: sub,
    difficulty: "standard",
    scenarioSpec: {
      kind,
      mode: "hubble-expansion",
      apparentMagnitude: 16.5,
      absoluteMagnitude: -19.3,
      redshiftZ: 0.039,
      hubbleConstantKmSMpc: 65,
    },
    hiddenQuantities: ["hubbleDistanceMpc", "recessionSpeedKmS"],
    requiredGivens: [
      { name: "redshiftZ", value: 0.039, source: "stem" },
      { name: "hubbleConstantKmSMpc", value: 65, unit: "km s⁻¹ Mpc⁻¹", source: "stem" },
    ],
    targetQuantityKey: "hubbleDistanceMpc",
    unit: "Mpc",
    stem: "Hydrogen absorption lines from a receding galaxy show a cosmological redshift magnitude $|z| = 0.0390$. Taking $c = 3.00 \\times 10^8\\text{ m s}^{-1}$ and the Hubble constant $H = 65\\text{ km s}^{-1}\\text{ Mpc}^{-1}$, estimate the distance to the galaxy.",
    distractors: (q) => {
      const d = numQ(q, "hubbleDistanceMpc");
      return [
        { value: d * 1000, rationale: "Leaves recession velocity in m s⁻¹ instead of converting to km s⁻¹." },
        { value: d * 0.5, rationale: "Divides recession speed by two erroneously." },
        { value: 65 / 0.039, rationale: "Divides H directly by z without multiplying by c." },
      ];
    },
    workedSolution: (q, ans) =>
      `The recession speed is $v = |z|c = 0.0390 \\times 3.00 \\times 10^{5}\\text{ km s}^{-1} = ${fmt3(numQ(q, "recessionSpeedKmS"), "km s⁻¹")}$. By Hubble's law, $d = \\frac{v}{H} = \\frac{11700}{65} = ${ans}$.`,
    planSummary: "Estimate galaxy distance in Mpc from spectral redshift and AQA Hubble constant.",
  });

  pushCalcMcq(ctx, {
    slug: "astro-mag-calc-04",
    conceptId,
    kind,
    domain: "grav-astro",
    subtopicId: sub,
    difficulty: "higher",
    scenarioSpec: {
      kind,
      mode: "hubble-expansion",
      apparentMagnitude: 14.2,
      absoluteMagnitude: -19.3,
      hubbleConstantKmSMpc: 65,
    },
    hiddenQuantities: ["hubbleAgeS", "hubbleConstantSI"],
    requiredGivens: [
      { name: "hubbleConstantKmSMpc", value: 65, unit: "km s⁻¹ Mpc⁻¹", source: "stem" },
    ],
    targetQuantityKey: "hubbleAgeS",
    unit: "s",
    stem: "Using the AQA Data Sheet values $H = 65\\text{ km s}^{-1}\\text{ Mpc}^{-1}$ and $1\\text{ Mpc} = 3.08 \\times 10^{22}\\text{ m}$, estimate the age of the Universe in seconds assuming a constant expansion rate.",
    distractors: (q) => {
      const t = numQ(q, "hubbleAgeS");
      return [
        { value: t * 1000, rationale: "Omits the km-to-m factor of 1000 when converting H to SI units." },
        { value: 1 / 65, rationale: "Takes the reciprocal of 65 directly without unit conversion." },
        { value: t / 1000, rationale: "Divides instead of multiplying by 1000 during km conversion." },
      ];
    },
    workedSolution: (q, ans) =>
      `Convert $H$ to SI: $H = \\frac{65 \\times 10^3}{3.08 \\times 10^{22}} = ${fmt3(numQ(q, "hubbleConstantSI"), "s⁻¹")}$. Then $t \\approx \\frac{1}{H} = ${ans}$.`,
    planSummary: "Convert AQA Hubble constant into SI units and calculate Hubble age of the Universe in seconds.",
  });

  // 3 Pure Qual MCQs
  pushQualMcq(ctx, {
    slug: "astro-mag-qual-01",
    conceptId,
    kind,
    domain: "grav-astro",
    subtopicId: sub,
    difficulty: "foundation",
    scenarioSpec: {
      kind,
      mode: "supernova-lightcurve",
      apparentMagnitude: 16.0,
      absoluteMagnitude: -19.3,
    },
    targetQuantityKey: "standardCandleAnchor",
    stem: "Why are Type Ia supernovae especially valuable as extragalactic standard candles for measuring cosmological distances?",
    correctOption: (a) => `They reach a ${a}.`,
    distractors: [
      {
        text: "They occur only in nearby galaxies where trigonometric parallax is straightforward.",
        rationale: "Type Ia supernovae are extraordinarily luminous and used far beyond parallax limits.",
      },
      {
        text: "Their peak apparent magnitude is identical regardless of how far away the galaxy lies.",
        rationale: "Peak absolute magnitude M is consistent, whereas apparent magnitude m increases with distance.",
      },
      {
        text: "They result from core collapse of red supergiants whose masses vary widely.",
        rationale: "Core collapse of massive stars produces Type II supernovae with variable luminosities, not Type Ia.",
      },
    ],
    workedSolution: (a) =>
      `Type Ia supernovae serve as reliable standard candles because they exhibit a ${a}.`,
    planSummary: "Explain why Type Ia supernovae act as standard candles.",
  });

  pushQualMcq(ctx, {
    slug: "astro-mag-qual-02",
    conceptId,
    kind,
    domain: "grav-astro",
    subtopicId: sub,
    difficulty: "standard",
    scenarioSpec: {
      kind,
      mode: "hubble-expansion",
      apparentMagnitude: 22.1,
      absoluteMagnitude: -19.3,
      redshiftZ: 0.35,
    },
    targetQuantityKey: "darkEnergyAnchor",
    stem: "What unexpected observational discovery from high-redshift Type Ia supernovae led cosmologists to propose the existence of dark energy?",
    correctOption: (a) => `Measurements revealed that ${a}.`,
    distractors: [
      {
        text: "Distant Type Ia supernovae appear brighter than predicted indicating rapid deceleration of space.",
        rationale: "Reverses the actual observation: distant supernovae were fainter (further away) than constant-rate models predicted.",
      },
      {
        text: "Supernova light curves showed blueshifted absorption lines at large distances.",
        rationale: "Distant galaxies are redshifted, not blueshifted.",
      },
      {
        text: "Supernovae failed to appear in galaxies older than one billion years.",
        rationale: "Dark energy inference came from luminosity-distance versus redshift comparison, not supernova absence.",
      },
    ],
    workedSolution: (a) =>
      `Comparing Type Ia luminosity distances with redshifts showed that ${a}.`,
    planSummary: "Explain observational evidence for dark energy from distant Type Ia supernovae.",
  });

  pushQualMcq(ctx, {
    slug: "astro-mag-qual-03",
    conceptId,
    kind,
    domain: "grav-astro",
    subtopicId: sub,
    difficulty: "standard",
    scenarioSpec: {
      kind,
      mode: "hubble-expansion",
      apparentMagnitude: 15.0,
      absoluteMagnitude: -19.3,
      redshiftZ: 0.025,
    },
    targetQuantityKey: "lorCosmologyAnchor",
    stem: "How do astronomers combine measurements of Type Ia supernovae and galaxy spectra to evaluate the Hubble constant?",
    correctOption: (a) => `Observing ${a}.`,
    distractors: [
      {
        text: "Measuring Wien peak wavelength gives distance while Stefan's law directly yields recession speed.",
        rationale: "Wien's law gives temperature and Stefan's law gives luminosity, not cosmological recession speed.",
      },
      {
        text: "Parallax determines extragalactic distances while Hipparcos apparent magnitudes give velocity.",
        rationale: "Parallax cannot reach distant galaxies and apparent magnitude does not measure velocity.",
      },
      {
        text: "Distance modulus gives recession speed while spectral line width determines distance in megaparsecs.",
        rationale: "Swaps the roles of distance modulus and Doppler redshift.",
      },
    ],
    workedSolution: (a) =>
      `Plotting $v$ against $d$ gives gradient $H$ because ${a}.`,
    planSummary: "Explain how distance modulus and redshift combine to measure Hubble's constant.",
  });

  // 4 Multi-part Structured
  pushStructured(ctx, {
    slug: "astro-mag-str-01",
    conceptId,
    kind,
    domain: "grav-astro",
    subtopicId: sub,
    difficulty: "standard",
    questionStyle: "mixed-exam",
    scenarioSpec: {
      kind,
      mode: "supernova-lightcurve",
      apparentMagnitude: 13.2,
      absoluteMagnitude: -19.3,
      secondApparentMagnitude: 15.7,
    },
    hiddenQuantities: ["distanceMpc", "brightnessRatio", "standardCandleAnchor"],
    requiredGivens: [
      { name: "apparentMagnitude", value: 13.2, source: "stem" },
      { name: "absoluteMagnitude", value: -19.3, source: "either" },
      { name: "secondApparentMagnitude", value: 15.7, source: "stem" },
    ],
    stem: "Two Type Ia supernovae, SN-Alpha and SN-Beta, are recorded with peak apparent magnitudes of 13.2 and 15.7 respectively. Take the peak absolute magnitude of a Type Ia supernova to be -19.3.",
    build: (q) => {
      const dMpc = numQ(q, "distanceMpc");
      const ratio = numQ(q, "brightnessRatio");
      const sc = strQ(q, "standardCandleAnchor");
      return {
        parts: [
          {
            partId: "a",
            prompt: "Calculate the distance to SN-Alpha in megaparsecs.",
            marks: 3,
            targetQuantityKey: "distanceMpc",
            expectedAnswer: fmt3(dMpc, "Mpc"),
            workingSteps: [
              "$m - M = 5 \\lg(d/10) \\Rightarrow 13.2 - (-19.3) = 32.5$.",
              "$\\lg(d/10) = 6.50 \\Rightarrow d = 10 \\times 10^{6.50}\\text{ pc} = 3.16 \\times 10^7\\text{ pc}$.",
              `Convert to Mpc: ${fmt3(dMpc, "Mpc")}.`,
            ],
          },
          {
            partId: "b",
            prompt: "Calculate how many times greater the peak intensity received on Earth is from SN-Alpha than from SN-Beta.",
            marks: 2,
            targetQuantityKey: "brightnessRatio",
            expectedAnswer: fmt3(ratio),
            workingSteps: [`$I_1 / I_2 = 2.51^{15.7 - 13.2} = 2.51^{2.5} = ${fmt3(ratio)}$.`],
          },
          {
            partId: "c",
            prompt: "Explain why Type Ia supernovae have a predictable peak absolute magnitude.",
            marks: 2,
            targetMode: "qualitative",
            targetQuantityKey: "standardCandleAnchor",
            expectedAnswer: `They produce a ${sc}.`,
            workingSteps: [
              "A white dwarf accretes mass from a binary companion until reaching the Chandrasekhar limit.",
              "Because the exploding mass is fixed, the peak energy output and absolute magnitude are nearly identical.",
            ],
          },
        ],
        markScheme: [
          { code: "M1", criterion: "Substitutes $13.2 - (-19.3) = 32.5$ into $m - M = 5\\lg(d/10)$.", marks: 1, partId: "a" },
          { code: "M1", criterion: "Evaluates $d = 10 \\times 10^{6.50}$ pc correctly.", marks: 1, partId: "a" },
          { code: "A1", criterion: `Correct distance ${fmt3(dMpc, "Mpc")}.`, marks: 1, partId: "a" },
          { code: "M1", criterion: "Applies $I_1 / I_2 = 2.51^{15.7 - 13.2}$.", marks: 1, partId: "b" },
          { code: "A1", criterion: `Correct intensity ratio ${fmt3(ratio)}.`, marks: 1, partId: "b" },
          { code: "B1", criterion: "Explains white dwarf accretion reaches the fixed Chandrasekhar mass limit.", marks: 1, partId: "c" },
          { code: "B1", criterion: "Links fixed critical mass to consistent peak absolute magnitude.", marks: 1, partId: "c" },
        ],
        workedSolution: `(a) $d = ${fmt3(dMpc, "Mpc")}$. (b) $I_1/I_2 = 2.51^{2.5} = ${fmt3(ratio)}$. (c) ${sc}.`,
      };
    },
    planSummary: "Calculate Type Ia distance, Hipparcos intensity ratio, and physical origin of standard-candle peak.",
    subpartPlan: ["distance modulus in Mpc", "Hipparcos intensity ratio", "Chandrasekhar explanation"],
  });

  pushStructured(ctx, {
    slug: "astro-mag-str-02",
    conceptId,
    kind,
    domain: "grav-astro",
    subtopicId: sub,
    difficulty: "standard",
    questionStyle: "calculation",
    scenarioSpec: {
      kind,
      mode: "hubble-expansion",
      apparentMagnitude: 15.2,
      absoluteMagnitude: -19.3,
      redshiftZ: 0.0172,
      hubbleConstantKmSMpc: 65,
    },
    hiddenQuantities: ["recessionSpeedKmS", "hubbleDistanceMpc", "hubbleAgeGyr"],
    requiredGivens: [
      { name: "redshiftZ", value: 0.0172, source: "stem" },
      { name: "hubbleConstantKmSMpc", value: 65, unit: "km s⁻¹ Mpc⁻¹", source: "stem" },
    ],
    stem: "A spectral line in a distant galaxy has a fractional wavelength shift of $+0.0172$. Take $c = 3.00 \\times 10^8\\text{ m s}^{-1}$, $H = 65\\text{ km s}^{-1}\\text{ Mpc}^{-1}$, and $1\\text{ Mpc} = 3.08 \\times 10^{22}\\text{ m}$.",
    build: (q) => {
      const v = numQ(q, "recessionSpeedKmS");
      const d = numQ(q, "hubbleDistanceMpc");
      const age = numQ(q, "hubbleAgeGyr");
      return {
        parts: [
          {
            partId: "a",
            prompt: "Calculate the recession velocity of the galaxy in $\\text{km s}^{-1}$.",
            marks: 2,
            targetQuantityKey: "recessionSpeedKmS",
            expectedAnswer: fmt3(v, "km s⁻¹"),
            workingSteps: [`$v = |z|c = 0.0172 \\times 3.00 \\times 10^5 = ${fmt3(v, "km s⁻¹")}$.`],
          },
          {
            partId: "b",
            prompt: "Estimate the distance to the galaxy in megaparsecs.",
            marks: 2,
            dependsOnPartIds: ["a"],
            targetQuantityKey: "hubbleDistanceMpc",
            expectedAnswer: fmt3(d, "Mpc"),
            workingSteps: [`$d = \\frac{v}{H} = \\frac{${fmt3(v)}}{65} = ${fmt3(d, "Mpc")}$.`],
          },
          {
            partId: "c",
            prompt: "Estimate the age of the Universe in gigayears (1 Gyr $= 3.156 \\times 10^{16}\\text{ s}$) implied by $H = 65\\text{ km s}^{-1}\\text{ Mpc}^{-1}$.",
            marks: 2,
            targetQuantityKey: "hubbleAgeGyr",
            expectedAnswer: fmt3(age, "Gyr"),
            workingSteps: [
              "$H_{\\text{SI}} = 65000 / 3.08 \\times 10^{22} = 2.11 \\times 10^{-18}\\text{ s}^{-1}$.",
              `$t = 1/H_{\\text{SI}} = 4.74 \\times 10^{17}\\text{ s} = ${fmt3(age, "Gyr")}$.`,
            ],
          },
        ],
        markScheme: [
          { code: "M1", criterion: "Applies $v = |z| c$ and converts to km s⁻¹.", marks: 1, partId: "a" },
          { code: "A1", criterion: `Correct recession speed ${fmt3(v, "km s⁻¹")}.`, marks: 1, partId: "a" },
          { code: "M1", criterion: "Divides recession speed by $H = 65\\text{ km s}^{-1}\\text{ Mpc}^{-1}$.", marks: 1, partId: "b" },
          { code: "A1", criterion: `Correct distance ${fmt3(d, "Mpc")}.`, marks: 1, partId: "b" },
          { code: "M1", criterion: "Converts $H$ to $\\text{s}^{-1}$ and evaluates $1/H$.", marks: 1, partId: "c" },
          { code: "A1", criterion: `Correct age estimate ${fmt3(age, "Gyr")}.`, marks: 1, partId: "c" },
        ],
        workedSolution: `(a) $v = ${fmt3(v, "km s⁻¹")}$. (b) $d = ${fmt3(d, "Mpc")}$. (c) $t = 1/H = ${fmt3(age, "Gyr")}$.`,
      };
    },
    planSummary: "Determine galaxy recession velocity, Hubble distance, and age of the Universe in Gyr.",
    subpartPlan: ["recession velocity", "Hubble distance", "Hubble age in Gyr"],
  });

  pushStructured(ctx, {
    slug: "astro-mag-str-03",
    conceptId,
    kind,
    domain: "grav-astro",
    subtopicId: sub,
    difficulty: "standard",
    questionStyle: "calculation",
    scenarioSpec: {
      kind,
      mode: "supernova-lightcurve",
      apparentMagnitude: 2.3,
      absoluteMagnitude: -1.7,
    },
    hiddenQuantities: ["distancePc", "distanceLy"],
    requiredGivens: [
      { name: "apparentMagnitude", value: 2.3, source: "stem" },
      { name: "absoluteMagnitude", value: -1.7, source: "stem" },
    ],
    stem: "A luminous blue-white star has an apparent magnitude of 2.30 and an absolute magnitude of -1.70. Take $1\\text{ pc} = 3.08 \\times 10^{16}\\text{ m}$ and $1\\text{ ly} = 9.46 \\times 10^{15}\\text{ m}$.",
    build: (q) => {
      const pc = numQ(q, "distancePc");
      const ly = numQ(q, "distanceLy");
      return {
        parts: [
          {
            partId: "a",
            prompt: "Calculate the distance to the star in parsecs.",
            marks: 3,
            targetQuantityKey: "distancePc",
            expectedAnswer: fmt3(pc, "pc"),
            workingSteps: [
              "$m - M = 2.30 - (-1.70) = 4.00$.",
              "$\\lg(d/10) = 4.00 / 5 = 0.800$.",
              `$d = 10 \\times 10^{0.800} = ${fmt3(pc, "pc")}$.`,
            ],
          },
          {
            partId: "b",
            prompt: "Convert this distance into light-years.",
            marks: 2,
            dependsOnPartIds: ["a"],
            targetQuantityKey: "distanceLy",
            expectedAnswer: fmt3(ly, "ly"),
            workingSteps: [
              `$d_{\\text{ly}} = ${fmt3(pc)} \\times \\frac{3.08 \\times 10^{16}}{9.46 \\times 10^{15}} = ${fmt3(ly, "ly")}$.`,
            ],
          },
        ],
        markScheme: [
          { code: "M1", criterion: "Calculates $m - M = 4.00$.", marks: 1, partId: "a" },
          { code: "M1", criterion: "Evaluates $d = 10 \\times 10^{0.800}$.", marks: 1, partId: "a" },
          { code: "A1", criterion: `Correct distance ${fmt3(pc, "pc")}.`, marks: 1, partId: "a" },
          { code: "M1", criterion: "Multiplies parsecs by $3.08 \\times 10^{16} / 9.46 \\times 10^{15} \\approx 3.26$.", marks: 1, partId: "b" },
          { code: "A1", criterion: `Correct distance ${fmt3(ly, "ly")}.`, marks: 1, partId: "b" },
        ],
        workedSolution: `(a) $d = 10 \\times 10^{0.80} = ${fmt3(pc, "pc")}$. (b) $d = ${fmt3(ly, "ly")}$.`,
      };
    },
    planSummary: "Compute stellar distance in parsecs from distance modulus and convert to light-years.",
    subpartPlan: ["distance in parsecs", "conversion to light-years"],
  });

  pushStructured(ctx, {
    slug: "astro-mag-str-04",
    conceptId,
    kind,
    domain: "grav-astro",
    subtopicId: sub,
    difficulty: "higher",
    questionStyle: "mixed-exam",
    scenarioSpec: {
      kind,
      mode: "hubble-expansion",
      apparentMagnitude: 18.2,
      absoluteMagnitude: -19.3,
      redshiftZ: 0.068,
      hubbleConstantKmSMpc: 65,
    },
    hiddenQuantities: ["distanceMpc", "recessionSpeedKmS", "darkEnergyAnchor"],
    requiredGivens: [
      { name: "apparentMagnitude", value: 18.2, source: "stem" },
      { name: "absoluteMagnitude", value: -19.3, source: "stem" },
      { name: "redshiftZ", value: 0.068, source: "stem" },
    ],
    stem: "A Type Ia supernova in a galaxy cluster peaks at apparent magnitude $m = 18.2$ (with standard peak absolute magnitude $M = -19.3$). Spectroscopy of the host galaxy shows a redshift magnitude $|z| = 0.0680$.",
    build: (q) => {
      const d = numQ(q, "distanceMpc");
      const v = numQ(q, "recessionSpeedKmS");
      const de = strQ(q, "darkEnergyAnchor");
      return {
        parts: [
          {
            partId: "a",
            prompt: "Calculate the distance to the galaxy cluster in megaparsecs using the distance modulus.",
            marks: 2,
            targetQuantityKey: "distanceMpc",
            expectedAnswer: fmt3(d, "Mpc"),
            workingSteps: [
              "$m - M = 18.2 - (-19.3) = 37.5 \\Rightarrow \\lg(d/10) = 7.50$.",
              `$d = 10 \\times 10^{7.50}\\text{ pc} = ${fmt3(d, "Mpc")}$.`,
            ],
          },
          {
            partId: "b",
            prompt: "Calculate the galaxy cluster's recession speed in $\\text{km s}^{-1}$ using $c = 3.00 \\times 10^8\\text{ m s}^{-1}$.",
            marks: 2,
            targetQuantityKey: "recessionSpeedKmS",
            expectedAnswer: fmt3(v, "km s⁻¹"),
            workingSteps: [`$v = 0.0680 \\times 3.00 \\times 10^5 = ${fmt3(v, "km s⁻¹")}$.`],
          },
          {
            partId: "c",
            prompt: "Explain how comparing luminosity distance with redshift across many much more distant Type Ia supernovae provided evidence for dark energy.",
            marks: 2,
            targetMode: "qualitative",
            targetQuantityKey: "darkEnergyAnchor",
            expectedAnswer: `Surveys found that ${de}.`,
            workingSteps: [
              "High-redshift supernovae were systematically dimmer (larger apparent magnitude) than constant-rate expansion predicts.",
              "This implies expansion is accelerating, requiring a repulsive dark-energy component.",
            ],
          },
        ],
        markScheme: [
          { code: "M1", criterion: "Uses $18.2 - (-19.3) = 5 \\lg(d/10)$.", marks: 1, partId: "a" },
          { code: "A1", criterion: `Correct distance ${fmt3(d, "Mpc")}.`, marks: 1, partId: "a" },
          { code: "M1", criterion: "Computes $v = 0.0680 \\times 3.00 \\times 10^5\\text{ km s}^{-1}$.", marks: 1, partId: "b" },
          { code: "A1", criterion: `Correct speed ${fmt3(v, "km s⁻¹")}.`, marks: 1, partId: "b" },
          { code: "B1", criterion: "Notes very distant Type Ia supernovae appear dimmer than expected.", marks: 1, partId: "c" },
          { code: "B1", criterion: "Concludes cosmic expansion is accelerating due to dark energy.", marks: 1, partId: "c" },
        ],
        workedSolution: `(a) $d = ${fmt3(d, "Mpc")}$. (b) $v = ${fmt3(v, "km s⁻¹")}$. (c) ${de}.`,
      };
    },
    planSummary: "Combine supernova distance modulus and galaxy redshift and explain dark-energy evidence.",
    subpartPlan: ["distance modulus", "recession speed", "dark-energy inference"],
  });

  // 1 Authentic 6-Mark LoR
  pushSixMarkLor(ctx, {
    slug: "astro-mag-lor-01",
    conceptId,
    kind,
    domain: "grav-astro",
    subtopicId: sub,
    scenarioSpec: {
      kind,
      mode: "hubble-expansion",
      apparentMagnitude: 17.5,
      absoluteMagnitude: -19.3,
      redshiftZ: 0.05,
      hubbleConstantKmSMpc: 65,
    },
    targetQuantityKey: "lorCosmologyAnchor",
    stem: "Cosmologists use surveys of Type Ia supernovae in remote galaxies both to determine the Hubble constant and to investigate the expansion history of the Universe.",
    prompt:
      "Explain how astronomers use Type Ia supernovae and spectral measurements to determine the Hubble constant, discuss uncertainties in estimating the age of the Universe from $H$, and explain why very distant supernovae led to the dark-energy hypothesis.",
    expectedAnswer: (anchor) =>
      `In this method, ${anchor}. A Type Ia supernova occurs when a white dwarf accretes matter up to the Chandrasekhar limit, producing a predictable peak absolute magnitude ($M \\approx -19.3$). Measuring peak apparent magnitude $m$ gives distance $d$ in parsecs from $m - M = 5\\lg(d/10)$, which is converted into megaparsecs. Simultaneously, comparing shifted absorption lines in the host galaxy's spectrum against laboratory wavelengths yields redshift $|z| = \\Delta\\lambda / \\lambda$ and recession velocity $v = |z|c$ in $\\text{km s}^{-1}$. Plotting $v$ against $d$ yields a straight line through the origin whose gradient is $H$ in $\\text{km s}^{-1}\\text{ Mpc}^{-1}$. Estimating age via $t \\approx 1/H$ assumes a constant expansion rate and is limited by distance-calibration uncertainties, interstellar dust dimming, and local peculiar galaxy velocities. For very high-redshift supernovae, objects appeared dimmer than predicted by steady or decelerating expansion, indicating that cosmic expansion is accelerating under dark energy.`,
    workingSteps: [
      "Explain why Type Ia supernovae have known peak absolute magnitude (Chandrasekhar limit).",
      "Show how $m - M = 5\\lg(d/10)$ gives distance in pc and converts to Mpc.",
      "Explain how spectral redshift gives recession speed $v = |z|c$.",
      "Explain plotting $v$ against $d$ and taking gradient $H$ with units $\\text{km s}^{-1}\\text{ Mpc}^{-1}$.",
      "Discuss limitations of $t \\approx 1/H$: non-constant expansion rate, dust extinction, local peculiar velocities.",
      "Explain dark-energy conclusion from distant supernovae appearing dimmer than expected.",
    ],
    criteriaSix: [
      "Explains Type Ia supernovae act as standard candles with known peak absolute magnitude due to the Chandrasekhar mass limit.",
      "States how measuring peak apparent magnitude $m$ yields distance $d$ via $m - M = 5\\lg(d/10)$ (with conversion from pc to Mpc).",
      "Explains how measuring fractional wavelength shift of host galaxy spectral lines gives recession velocity $v = |z|c$.",
      "Explains plotting recession speed $v$ against distance $d$ so the straight-line gradient equals $H$ (in $\\text{km s}^{-1}\\text{ Mpc}^{-1}$).",
      "Evaluates limitations of $t \\approx 1/H$ (assumes constant expansion rate, dust absorption, or local galaxy motions).",
      "Explains that distant supernovae appeared dimmer than expected, showing accelerating expansion driven by dark energy.",
    ],
    workedSolution: (anchor) =>
      `Level 3 synthesis: ${anchor}; graph gradient gives $H$ in $\\text{km s}^{-1}\\text{ Mpc}^{-1}$, $t \\approx 1/H$ assumes constant rate, and fainter high-$z$ supernovae reveal accelerating expansion and dark energy.`,
    planSummary: "Six-mark level-of-response explanation of Type Ia Hubble measurement and dark energy.",
  });
}

function populateAstroExoplanetsBlackholes(ctx: BuilderContext): void {
  const kind = "al-opt-astro-exoplanets-blackholes";
  const conceptId = "gravitational-potential-orbits";
  const sub = "alevel-3-9-astrophysics" as const;

  // 4 Calc MCQs
  pushCalcMcq(ctx, {
    slug: "astro-exo-calc-01",
    conceptId,
    kind,
    domain: "grav-astro",
    subtopicId: sub,
    difficulty: "foundation",
    scenarioSpec: {
      kind,
      mode: "transit",
      starRadiusM: 8.0e8,
      planetRadiusM: 6.4e7,
      orbitalPeriodDays: 3.6,
    },
    hiddenQuantities: ["transitDipPercent", "transitDipFraction"],
    requiredGivens: [
      { name: "starRadiusM", value: 8.0e8, unit: "m", source: "stem" },
      { name: "planetRadiusM", value: 6.4e7, unit: "m", source: "stem" },
    ],
    targetQuantityKey: "transitDipPercent",
    unit: "%",
    stem: "A gas-giant exoplanet of radius 6.40 × 10⁷ m transits directly across the face of a host star of radius 8.00 × 10⁸ m. What percentage dip in the star's observed intensity occurs during full transit?",
    distractors: () => [
      { value: 8.0, rationale: "Uses the linear radius ratio r_p / R_s instead of squaring for area ratio." },
      { value: 0.32, rationale: "Halves the squared radius ratio erroneously." },
      { value: 1.28, rationale: "Doubles the squared radius ratio." },
    ],
    workedSolution: (_q, ans) =>
      `The fractional intensity dip equals the cross-sectional area ratio $\\frac{\\Delta I}{I} = \\left(\\frac{r_p}{R_s}\\right)^2 = \\left(\\frac{6.40 \\times 10^7}{8.00 \\times 10^8}\\right)^2 = 0.080^2 = 0.00640 = ${ans}$.`,
    planSummary: "Calculate exoplanet transit percentage intensity dip from stellar and planetary radii.",
  });

  pushCalcMcq(ctx, {
    slug: "astro-exo-calc-02",
    conceptId,
    kind,
    domain: "grav-astro",
    subtopicId: sub,
    difficulty: "standard",
    scenarioSpec: {
      kind,
      mode: "transit",
      starRadiusM: 6.96e8,
      planetRadiusM: 9.84e7,
      orbitalPeriodDays: 5.2,
    },
    hiddenQuantities: ["planetRadiusM", "radiusRatio"],
    requiredGivens: [
      { name: "starRadiusM", value: 6.96e8, unit: "m", source: "stem" },
      { name: "transitDipPercent", value: 2.0, unit: "%", source: "stem" },
    ],
    targetQuantityKey: "planetRadiusM",
    unit: "m",
    stem: "During an exoplanet transit across a Sun-like star of radius 6.96 × 10⁸ m, the star's brightness drops by 2.00%. Estimate the radius of the transiting exoplanet.",
    distractors: (q) => {
      const rp = numQ(q, "planetRadiusM");
      return [
        { value: 6.96e8 * 0.02, rationale: "Multiplies stellar radius by 0.02 without taking the square root." },
        { value: rp * 0.5, rationale: "Divides the deduced radius by two erroneously." },
        { value: rp * 10, rationale: "Forgets to divide percentage 2.00 by 100 before taking the square root." },
      ];
    },
    workedSolution: (_q, ans) =>
      `$\\frac{r_p}{R_s} = \\sqrt{0.0200} = 0.1414$, so $r_p = 0.1414 \\times 6.96 \\times 10^8 = ${ans}$.`,
    planSummary: "Infer exoplanet radius from percentage transit light-curve dip and host star radius.",
  });

  pushCalcMcq(ctx, {
    slug: "astro-exo-calc-03",
    conceptId,
    kind,
    domain: "grav-astro",
    subtopicId: sub,
    difficulty: "foundation",
    scenarioSpec: {
      kind,
      mode: "blackhole-quasar",
      blackHoleMassSolar: 12.0,
    },
    hiddenQuantities: ["schwarzschildRadiusKm", "schwarzschildRadiusM"],
    requiredGivens: [
      { name: "blackHoleMassSolar", value: 12.0, source: "stem" },
    ],
    targetQuantityKey: "schwarzschildRadiusKm",
    unit: "km",
    stem: "A stellar-mass black hole in an X-ray binary has a mass equal to 12.0 solar masses ($M_\\odot = 1.99 \\times 10^{30}\\text{ kg}$). Taking $G = 6.67 \\times 10^{-11}\\text{ N m}^2\\text{ kg}^{-2}$ and $c = 3.00 \\times 10^8\\text{ m s}^{-1}$, calculate its Schwarzschild radius.",
    distractors: (q) => {
      const rKm = numQ(q, "schwarzschildRadiusKm");
      return [
        { value: rKm * 0.5, rationale: "Omits the factor of 2 in R_s = 2GM / c squared." },
        { value: rKm * 2, rationale: "Computes the event-horizon diameter instead of radius." },
        { value: rKm * 3.0e8, rationale: "Forgets to square c in the denominator." },
      ];
    },
    workedSolution: (_q, ans) =>
      `$M = 12.0 \\times 1.99 \\times 10^{30} = 2.39 \\times 10^{31}\\text{ kg}$. Then $R_s = \\frac{2GM}{c^2} = \\frac{2 \\times 6.67 \\times 10^{-11} \\times 2.39 \\times 10^{31}}{(3.00 \\times 10^8)^2} = 3.54 \\times 10^4\\text{ m} = ${ans}$.`,
    planSummary: "Calculate Schwarzschild radius of a stellar-mass black hole.",
  });

  pushCalcMcq(ctx, {
    slug: "astro-exo-calc-04",
    conceptId,
    kind,
    domain: "grav-astro",
    subtopicId: sub,
    difficulty: "higher",
    scenarioSpec: {
      kind,
      mode: "transit",
      starRadiusM: 7.0e8,
      planetRadiusM: 7.0e7,
      orbitalPeriodDays: 4.0,
      stellarWobbleSpeedMs: 85,
      referenceWavelengthNm: 589,
    },
    hiddenQuantities: ["dopplerShiftPm", "dopplerShiftNm"],
    requiredGivens: [
      { name: "stellarWobbleSpeedMs", value: 85, unit: "m s⁻¹", source: "stem" },
      { name: "referenceWavelengthNm", value: 589, unit: "nm", source: "stem" },
    ],
    targetQuantityKey: "dopplerShiftPm",
    unit: "pm",
    stem: "Using the radial-velocity method, an exoplanet causes its host star to oscillate along our line of sight with a maximum speed of 85.0 m s⁻¹. Calculate the maximum Doppler shift in picometres of a sodium absorption line of rest wavelength 589 nm.",
    distractors: (q) => {
      const pm = numQ(q, "dopplerShiftPm");
      return [
        { value: pm * 2, rationale: "Reports peak-to-peak wavelength swing rather than maximum shift from rest." },
        { value: pm * 1000, rationale: "Confuses nanometres and picometres by a factor of 1000." },
        { value: pm * 0.5, rationale: "Halves the non-relativistic Doppler shift erroneously." },
      ];
    },
    workedSolution: (_q, ans) =>
      `$\\Delta\\lambda = \\lambda \\frac{v}{c} = 589\\text{ nm} \\times \\frac{85.0}{3.00 \\times 10^8} = 1.67 \\times 10^{-4}\\text{ nm} = ${ans}$.`,
    planSummary: "Calculate maximum radial-velocity Doppler wavelength shift of a star orbited by an exoplanet.",
  });

  // 3 Pure Qual MCQs
  pushQualMcq(ctx, {
    slug: "astro-exo-qual-01",
    conceptId,
    kind,
    domain: "grav-astro",
    subtopicId: sub,
    difficulty: "foundation",
    scenarioSpec: {
      kind,
      mode: "transit",
      starRadiusM: 7.0e8,
      planetRadiusM: 6.5e7,
      orbitalPeriodDays: 6.2,
    },
    targetQuantityKey: "transitLimitationAnchor",
    stem: "Why does the transit photometry method fail to detect the majority of exoplanets orbiting nearby stars?",
    correctOption: (a) => `For a transit dip to occur, the planet's ${a}.`,
    distractors: [
      {
        text: "Only exoplanets larger than their host stars can block measurable starlight.",
        rationale: "Planets are far smaller than stars; precision photometry detects fractional dips well below one percent.",
      },
      {
        text: "Transits can only be observed using space-based X-ray telescopes.",
        rationale: "Transits are detected at optical and infrared wavelengths, not X-rays.",
      },
      {
        text: "Orbital periods must be shorter than one hour to register a periodic signal.",
        rationale: "Longer periods still produce transits if aligned, though they repeat less frequently.",
      },
    ],
    workedSolution: (a) =>
      `The transit method is geometrically selective because the ${a}.`,
    planSummary: "Identify the primary geometric limitation of the exoplanet transit method.",
  });

  pushQualMcq(ctx, {
    slug: "astro-exo-qual-02",
    conceptId,
    kind,
    domain: "grav-astro",
    subtopicId: sub,
    difficulty: "standard",
    scenarioSpec: {
      kind,
      mode: "transit",
      starRadiusM: 7.2e8,
      planetRadiusM: 8.0e7,
      orbitalPeriodDays: 7.5,
      stellarWobbleSpeedMs: 52,
    },
    targetQuantityKey: "radialVelocityAnchor",
    stem: "What physical observation allows astronomers to detect an unseen exoplanet via the radial-velocity (wobble) method?",
    correctOption: (a) => `Measuring the ${a}.`,
    distractors: [
      {
        text: "Direct photography of reflected starlight from the planet's surface at all orbital phases.",
        rationale: "Direct imaging is distinct from radial-velocity spectroscopy and suffers severe glare.",
      },
      {
        text: "Periodic changes in the host star's absolute magnitude caused by nuclear fusion cycles.",
        rationale: "Radial-velocity detection tracks spectral wavelength shifts, not fusion-driven brightness changes.",
      },
      {
        text: "Permanent redshift of the star's spectrum caused by cosmic expansion alone.",
        rationale: "An orbiting planet creates a periodic oscillation between redshift and blueshift.",
      },
    ],
    workedSolution: (a) =>
      `The radial-velocity method relies on detecting the ${a}.`,
    planSummary: "Explain the physical basis of the radial-velocity exoplanet detection technique.",
  });

  pushQualMcq(ctx, {
    slug: "astro-exo-qual-03",
    conceptId,
    kind,
    domain: "grav-astro",
    subtopicId: sub,
    difficulty: "standard",
    scenarioSpec: {
      kind,
      mode: "blackhole-quasar",
      blackHoleMassSolar: 1.5e9,
      quasarRedshiftZ: 2.1,
    },
    targetQuantityKey: "quasarOriginAnchor",
    stem: "What astrophysical engine is widely accepted as powering the immense electromagnetic output of a quasar?",
    correctOption: (a) => `A ${a}.`,
    distractors: [
      {
        text: "A single rotating neutron star inside the Milky Way emitting radio pulses.",
        rationale: "That describes a galactic pulsar, not an extragalactic high-redshift quasar.",
      },
      {
        text: "A globular cluster of white dwarfs cooling slowly in intergalactic space.",
        rationale: "Cooling white dwarfs cannot produce quasar luminosities exceeding entire galaxies.",
      },
      {
        text: "Thermonuclear fusion in a single supergiant star located within ten parsecs of Earth.",
        rationale: "Quasars have massive cosmological redshifts and outshine entire host galaxies.",
      },
    ],
    workedSolution: (a) =>
      `Quasars are powered by gravitational energy released by a ${a}.`,
    planSummary: "Identify the physical engine of quasars.",
  });

  // 4 Multi-part Structured
  pushStructured(ctx, {
    slug: "astro-exo-str-01",
    conceptId,
    kind,
    domain: "grav-astro",
    subtopicId: sub,
    difficulty: "standard",
    questionStyle: "mixed-exam",
    scenarioSpec: {
      kind,
      mode: "transit",
      starRadiusM: 6.4e8,
      planetRadiusM: 8.0e7,
      orbitalPeriodDays: 4.5,
    },
    hiddenQuantities: [
      "transitDipPercent",
      "orbitalPeriodS",
      "transitLimitationAnchor",
    ],
    requiredGivens: [
      { name: "starRadiusM", value: 6.4e8, unit: "m", source: "stem" },
      { name: "planetRadiusM", value: 8.0e7, unit: "m", source: "stem" },
      { name: "orbitalPeriodDays", value: 4.5, unit: "d", source: "either" },
    ],
    stem: "A transiting exoplanet of radius 8.00 × 10⁷ m orbits a star of radius 6.40 × 10⁸ m with an orbital period of 4.50 days, as shown in the transit light curve.",
    build: (q) => {
      const dip = numQ(q, "transitDipPercent");
      const pSec = numQ(q, "orbitalPeriodS");
      const lim = strQ(q, "transitLimitationAnchor");
      return {
        parts: [
          {
            partId: "a",
            prompt: "Calculate the percentage decrease in received stellar intensity during full transit.",
            marks: 2,
            targetQuantityKey: "transitDipPercent",
            expectedAnswer: fmt3(dip, "%"),
            workingSteps: [
              `$\\frac{\\Delta I}{I} = \\left(\\frac{8.00 \\times 10^7}{6.40 \\times 10^8}\\right)^2 = 0.015625 = ${fmt3(dip, "%")}$.`,
            ],
          },
          {
            partId: "b",
            prompt: "Convert the orbital period of 4.50 days into seconds.",
            marks: 2,
            targetQuantityKey: "orbitalPeriodS",
            expectedAnswer: fmt3(pSec, "s"),
            workingSteps: [`$T = 4.50 \\times 86400 = ${fmt3(pSec, "s")}$.`],
          },
          {
            partId: "c",
            prompt: "State one major observational limitation of the transit method for discovering Earth-sized planets in wide orbits.",
            marks: 2,
            targetMode: "qualitative",
            targetQuantityKey: "transitLimitationAnchor",
            expectedAnswer: `The ${lim}, and a small rocky planet creates a tiny brightness dip that repeats infrequently.`,
            workingSteps: [
              "State strict alignment along Earth's line of sight.",
              "Note tiny fractional dip and long intervals between repeat transits.",
            ],
          },
        ],
        markScheme: [
          { code: "M1", criterion: "Applies $(r_p / R_s)^2 \\times 100$.", marks: 1, partId: "a" },
          { code: "A1", criterion: `Correct dip ${fmt3(dip, "%")}.`, marks: 1, partId: "a" },
          { code: "M1", criterion: "Multiplies 4.50 days by $24 \\times 3600$.", marks: 1, partId: "b" },
          { code: "A1", criterion: `Correct period ${fmt3(pSec, "s")}.`, marks: 1, partId: "b" },
          { code: "B1", criterion: "States orbital plane must lie almost along our line of sight.", marks: 1, partId: "c" },
          { code: "B1", criterion: "Notes very small transit dip or long wait to confirm periodicity.", marks: 1, partId: "c" },
        ],
        workedSolution: `(a) Dip $= ${fmt3(dip, "%")}$. (b) $T = ${fmt3(pSec, "s")}$. (c) ${lim}.`,
      };
    },
    planSummary: "Analyse exoplanet transit dip percentage, orbital period in seconds, and detection limits.",
    subpartPlan: ["transit dip percentage", "period in seconds", "transit limitation"],
  });

  pushStructured(ctx, {
    slug: "astro-exo-str-02",
    conceptId,
    kind,
    domain: "grav-astro",
    subtopicId: sub,
    difficulty: "standard",
    questionStyle: "calculation",
    scenarioSpec: {
      kind,
      mode: "blackhole-quasar",
      blackHoleMassSolar: 5.0e8,
      quasarRedshiftZ: 1.6,
      restWavelengthNm: 486,
    },
    hiddenQuantities: ["schwarzschildRadiusAU", "observedWavelengthNm"],
    requiredGivens: [
      { name: "blackHoleMassSolar", value: 5.0e8, source: "stem" },
      { name: "quasarRedshiftZ", value: 1.6, source: "stem" },
      { name: "restWavelengthNm", value: 486, unit: "nm", source: "stem" },
    ],
    stem: "A distant quasar is powered by a supermassive black hole of mass $5.00 \\times 10^8\\,M_\\odot$ ($M_\\odot = 1.99 \\times 10^{30}\\text{ kg}$) and has cosmological redshift $z = 1.60$. Take $G = 6.67 \\times 10^{-11}\\text{ N m}^2\\text{ kg}^{-2}$, $c = 3.00 \\times 10^8\\text{ m s}^{-1}$, and $1\\text{ AU} = 1.50 \\times 10^{11}\\text{ m}$.",
    build: (q) => {
      const rAu = numQ(q, "schwarzschildRadiusAU");
      const obsNm = numQ(q, "observedWavelengthNm");
      return {
        parts: [
          {
            partId: "a",
            prompt: "Calculate the Schwarzschild radius of the supermassive black hole in astronomical units (AU).",
            marks: 3,
            targetQuantityKey: "schwarzschildRadiusAU",
            expectedAnswer: fmt3(rAu, "AU"),
            workingSteps: [
              "$M = 5.00 \\times 10^8 \\times 1.99 \\times 10^{30} = 9.95 \\times 10^{38}\\text{ kg}$.",
              "$R_s = \\frac{2GM}{c^2} = 1.475 \\times 10^{12}\\text{ m}$.",
              `Convert to AU: $R_s = \\frac{1.475 \\times 10^{12}}{1.50 \\times 10^{11}} = ${fmt3(rAu, "AU")}$.`,
            ],
          },
          {
            partId: "b",
            prompt: "A hydrogen Balmer emission line has laboratory wavelength 486 nm. Calculate its observed wavelength in the quasar spectrum using $\\lambda_{\\text{obs}} = \\lambda_0 (1 + z)$.",
            marks: 2,
            targetQuantityKey: "observedWavelengthNm",
            expectedAnswer: fmt3(obsNm, "nm"),
            workingSteps: [
              `$\\lambda_{\\text{obs}} = 486 \\times (1 + 1.60) = ${fmt3(obsNm, "nm")}$.`,
            ],
          },
        ],
        markScheme: [
          { code: "M1", criterion: "Converts black hole mass to kg and applies $R_s = 2GM / c^2$.", marks: 1, partId: "a" },
          { code: "M1", criterion: "Divides $R_s$ in metres by $1.50 \\times 10^{11}\\text{ m AU}^{-1}$.", marks: 1, partId: "a" },
          { code: "A1", criterion: `Correct Schwarzschild radius ${fmt3(rAu, "AU")}.`, marks: 1, partId: "a" },
          { code: "M1", criterion: "Applies $\\lambda_{\\text{obs}} = 486 \\times (1 + 1.60)$.", marks: 1, partId: "b" },
          { code: "A1", criterion: `Correct redshifted wavelength ${fmt3(obsNm, "nm")}.`, marks: 1, partId: "b" },
        ],
        workedSolution: `(a) $R_s = ${fmt3(rAu, "AU")}$. (b) $\\lambda_{\\text{obs}} = ${fmt3(obsNm, "nm")}$ (shifted into the near-infrared).`,
      };
    },
    planSummary: "Calculate quasar supermassive black hole Schwarzschild radius in AU and redshifted Balmer wavelength.",
    subpartPlan: ["Schwarzschild radius in AU", "redshifted spectral line wavelength"],
  });

  pushStructured(ctx, {
    slug: "astro-exo-str-03",
    conceptId,
    kind,
    domain: "grav-astro",
    subtopicId: sub,
    difficulty: "standard",
    questionStyle: "mixed-exam",
    scenarioSpec: {
      kind,
      mode: "transit",
      starRadiusM: 7.5e8,
      planetRadiusM: 5.0e7,
      orbitalPeriodDays: 9.2,
      stellarWobbleSpeedMs: 42,
      referenceWavelengthNm: 656,
    },
    hiddenQuantities: [
      "dopplerShiftPm",
      "transitDipPercent",
      "radialVelocityAnchor",
    ],
    requiredGivens: [
      { name: "starRadiusM", value: 7.5e8, unit: "m", source: "stem" },
      { name: "planetRadiusM", value: 5.0e7, unit: "m", source: "stem" },
      { name: "stellarWobbleSpeedMs", value: 42, unit: "m s⁻¹", source: "stem" },
      { name: "referenceWavelengthNm", value: 656, unit: "nm", source: "stem" },
    ],
    stem: "An exoplanet of radius 5.00 × 10⁷ m orbits a star of radius 7.50 × 10⁸ m, inducing a maximum radial-velocity wobble of 42.0 m s⁻¹ measured on the H-alpha line at 656 nm.",
    build: (q) => {
      const pm = numQ(q, "dopplerShiftPm");
      const dip = numQ(q, "transitDipPercent");
      const rv = strQ(q, "radialVelocityAnchor");
      return {
        parts: [
          {
            partId: "a",
            prompt: "Calculate the maximum Doppler shift of the 656 nm line in picometres.",
            marks: 2,
            targetQuantityKey: "dopplerShiftPm",
            expectedAnswer: fmt3(pm, "pm"),
            workingSteps: [`$\\Delta\\lambda = 656\\text{ nm} \\times \\frac{42.0}{3.00 \\times 10^8} = ${fmt3(pm, "pm")}$.`],
          },
          {
            partId: "b",
            prompt: "Calculate the expected percentage transit dip if the orbit is viewed edge-on.",
            marks: 2,
            targetQuantityKey: "transitDipPercent",
            expectedAnswer: fmt3(dip, "%"),
            workingSteps: [`$100 \\times (5.00 \\times 10^7 / 7.50 \\times 10^8)^2 = ${fmt3(dip, "%")}$.`],
          },
          {
            partId: "c",
            prompt: "Explain briefly how the radial-velocity method reveals the presence of the planet.",
            marks: 2,
            targetMode: "qualitative",
            targetQuantityKey: "radialVelocityAnchor",
            expectedAnswer: `Spectrometers track the ${rv}.`,
            workingSteps: [
              "Star and planet both orbit their shared centre of mass.",
              "Periodic motion toward and away from Earth causes alternating blueshifts and redshifts.",
            ],
          },
        ],
        markScheme: [
          { code: "M1", criterion: "Applies $\\Delta\\lambda / \\lambda = v / c$.", marks: 1, partId: "a" },
          { code: "A1", criterion: `Correct shift ${fmt3(pm, "pm")}.`, marks: 1, partId: "a" },
          { code: "M1", criterion: "Computes $(r_p / R_s)^2 \\times 100$.", marks: 1, partId: "b" },
          { code: "A1", criterion: `Correct transit dip ${fmt3(dip, "%")}.`, marks: 1, partId: "b" },
          { code: "B1", criterion: "States star and planet orbit their common centre of mass.", marks: 1, partId: "c" },
          { code: "B1", criterion: "Links line-of-sight wobble to periodic Doppler shift of stellar absorption lines.", marks: 1, partId: "c" },
        ],
        workedSolution: `(a) $\\Delta\\lambda = ${fmt3(pm, "pm")}$. (b) Dip $= ${fmt3(dip, "%")}$. (c) ${rv}.`,
      };
    },
    planSummary: "Combine radial-velocity Doppler shift and transit photometry calculations for an exoplanet.",
    subpartPlan: ["Doppler shift in pm", "transit dip percentage", "radial-velocity mechanism"],
  });

  pushStructured(ctx, {
    slug: "astro-exo-str-04",
    conceptId,
    kind,
    domain: "grav-astro",
    subtopicId: sub,
    difficulty: "higher",
    questionStyle: "derivation",
    scenarioSpec: {
      kind,
      mode: "blackhole-quasar",
      blackHoleMassSolar: 4.3e6,
    },
    hiddenQuantities: ["schwarzschildRadiusM", "quasarOriginAnchor"],
    requiredGivens: [
      { name: "blackHoleMassSolar", value: 4.3e6, source: "stem" },
    ],
    stem: "Radio-interferometric tracking of stars orbiting the centre of a spiral galaxy indicates a central supermassive black hole of mass $4.30 \\times 10^6\\,M_\\odot$ ($M_\\odot = 1.99 \\times 10^{30}\\text{ kg}$).",
    build: (q) => {
      const rM = numQ(q, "schwarzschildRadiusM");
      const qo = strQ(q, "quasarOriginAnchor");
      return {
        parts: [
          {
            partId: "a",
            prompt: "Calculate the Schwarzschild radius of this supermassive black hole in metres using $G = 6.67 \\times 10^{-11}\\text{ N m}^2\\text{ kg}^{-2}$ and $c = 3.00 \\times 10^8\\text{ m s}^{-1}$.",
            marks: 3,
            targetQuantityKey: "schwarzschildRadiusM",
            expectedAnswer: fmt3(rM, "m"),
            workingSteps: [
              "$M = 4.30 \\times 10^6 \\times 1.99 \\times 10^{30} = 8.56 \\times 10^{36}\\text{ kg}$.",
              `$R_s = \\frac{2GM}{c^2} = ${fmt3(rM, "m")}$.`,
            ],
          },
          {
            partId: "b",
            prompt: "Explain why a dormant galactic centre black hole does not shine as a quasar today, whereas early-Universe active nuclei did.",
            marks: 2,
            targetMode: "qualitative",
            targetQuantityKey: "quasarOriginAnchor",
            expectedAnswer: `A quasar requires a ${qo}; without abundant infalling gas forming a luminous accretion disc, the black hole remains quiescent.`,
            workingSteps: [
              "Identify active gas accretion onto a supermassive black hole as the quasar power source.",
              "Note that early galaxy mergers fed vast gas supplies into central black holes.",
            ],
          },
        ],
        markScheme: [
          { code: "M1", criterion: "Computes mass in kg from solar masses.", marks: 1, partId: "a" },
          { code: "M1", criterion: "Substitutes into $R_s = 2GM / c^2$.", marks: 1, partId: "a" },
          { code: "A1", criterion: `Correct radius ${fmt3(rM, "m")}.`, marks: 1, partId: "a" },
          { code: "B1", criterion: "States quasar luminosity comes from matter accreting into a supermassive black hole.", marks: 1, partId: "b" },
          { code: "B1", criterion: "Explains dormant black holes lack sufficient infalling gas compared with early galaxy mergers.", marks: 1, partId: "b" },
        ],
        workedSolution: `(a) $R_s = ${fmt3(rM, "m")}$. (b) Quasar emission demands a ${qo}.`,
      };
    },
    planSummary: "Compute galactic-centre Schwarzschild radius and explain active versus dormant SMBHs.",
    subpartPlan: ["Schwarzschild radius in metres", "accretion-powered quasar explanation"],
  });

  // 1 Authentic 6-Mark LoR
  pushSixMarkLor(ctx, {
    slug: "astro-exo-lor-01",
    conceptId,
    kind,
    domain: "grav-astro",
    subtopicId: sub,
    scenarioSpec: {
      kind,
      mode: "blackhole-quasar",
      blackHoleMassSolar: 2.0e9,
      quasarRedshiftZ: 2.4,
    },
    targetQuantityKey: "lorQuasarAnchor",
    stem: "When quasars were first identified as star-like radio sources in the mid-twentieth century, their optical spectra baffled astronomers until hydrogen lines were recognised at extreme redshifts.",
    prompt:
      "Explain the key observational properties of quasars, how astronomers deduce their distances, power outputs, and compact physical sizes, and describe the astrophysical mechanism believed to power them.",
    expectedAnswer: (anchor) =>
      `Astronomers deduce that ${anchor}. First, optical spectra exhibit enormous cosmological redshifts ($z$ often exceeding $1$), which via Hubble's law indicate distances of billions of light-years—meaning we observe quasars in the early Universe. Second, despite these immense distances, quasars are easily detectable across radio to X-ray bands; applying the inverse-square law reveals luminosities thousands of times greater than an entire normal galaxy. Third, their brightness fluctuates noticeably over days or weeks; since no causal signal can cross a source faster than $c$, the emitting region must be no larger than a few light-days across (comparable to the Solar System). The only mechanism capable of producing such huge power in such a compact volume is gravitational energy released as gas spirals into an accretion disc around a supermassive black hole at the core of a young, often merging active galaxy, driving intense thermal radiation and relativistic bipolar jets.`,
    workingSteps: [
      "State quasars appear point-like with strong broad-spectrum emission and very large cosmological redshifts.",
      "Link huge redshift via Hubble's law to immense cosmological distances and early cosmic epochs.",
      "Apply inverse-square law to deduce extreme power output surpassing entire galaxies.",
      "Use rapid variability timescales and finite speed of light $c$ to infer solar-system-scale compact emitting size.",
      "Identify supermassive black hole accretion disc as the gravitational energy source.",
      "Note feeding via abundant gas in early-Universe galaxy collisions and relativistic jets.",
    ],
    criteriaSix: [
      "Identifies large cosmological redshift of quasar spectral lines and links this via Hubble's law to immense distance.",
      "Deduces extreme luminosity / power output (exceeding entire galaxies) using observed brightness and the inverse-square law.",
      "Explains that rapid intensity variations imply a compact emitting region roughly the size of the Solar System (limited by speed $c$).",
      "Identifies the central engine as a supermassive black hole at the centre of an active galaxy.",
      "Explains that infalling matter forms a hot accretion disc converting gravitational potential energy into radiation across the EM spectrum.",
      "Links quasar abundance at high redshift to early-Universe galaxy interactions supplying ample gas to the central black hole.",
    ],
    workedSolution: (anchor) =>
      `Level 3 synthesis: ${anchor}; rapid brightness variations bound source size via $c\\Delta t$, inverse-square law proves immense power, and SMBH accretion during early galaxy mergers explains the engine.`,
    planSummary: "Six-mark level-of-response synthesis on quasar redshift, power, compact size, and SMBH accretion.",
  });
}

/* ========================================================================== */
/*  SECTION B — OPTION 3.10 MEDICAL PHYSICS (5 plugins × 12 = 60 items)       */
/* ========================================================================== */

function populateMedEyeDefects(ctx: BuilderContext): void {
  const kind = "al-opt-med-eye-defects";
  const conceptId = "thin-lenses-geometric-optics";
  const sub = "alevel-3-10-medical-physics" as const;

  // 4 Calc MCQs
  pushCalcMcq(ctx, {
    slug: "med-eye-calc-01",
    conceptId,
    kind,
    domain: "optics-shm",
    subtopicId: sub,
    difficulty: "foundation",
    scenarioSpec: {
      kind,
      mode: "myopia",
      unaidedFarPointM: 0.625,
    },
    hiddenQuantities: ["correctivePowerD", "focalLengthM"],
    requiredGivens: [
      { name: "unaidedFarPointM", value: 0.625, unit: "m", source: "stem" },
    ],
    targetQuantityKey: "correctivePowerD",
    unit: "D",
    stem: "A short-sighted (myopic) patient has an unaided far point of 0.625 m in front of the eye. Using the real-is-positive convention $\\frac{1}{f} = \\frac{1}{u} + \\frac{1}{v}$, what corrective spectacle lens power is needed to focus distant objects clearly?",
    distractors: () => [
      { value: 1.6, rationale: "Uses a positive virtual image distance v = +0.625 m instead of v = -0.625 m." },
      { value: -0.625, rationale: "Quotes the focal length in metres rather than taking its reciprocal P = 1 / f." },
      { value: -3.2, rationale: "Doubles the optical power erroneously." },
    ],
    workedSolution: (_q, ans) =>
      `For a distant object ($u = \\infty$), the lens must form a virtual image at the unaided far point ($v = -0.625\\text{ m}$). Hence $P = \\frac{1}{f} = \\frac{1}{\\infty} + \\frac{1}{-0.625} = ${ans}$.`,
    planSummary: "Compute signed dioptre power for correcting myopia from unaided far point.",
  });

  pushCalcMcq(ctx, {
    slug: "med-eye-calc-02",
    conceptId,
    kind,
    domain: "optics-shm",
    subtopicId: sub,
    difficulty: "standard",
    scenarioSpec: {
      kind,
      mode: "hypermetropia",
      unaidedNearPointM: 0.8,
      targetNearPointM: 0.25,
    },
    hiddenQuantities: ["correctivePowerD", "focalLengthM"],
    requiredGivens: [
      { name: "unaidedNearPointM", value: 0.8, unit: "m", source: "stem" },
      { name: "targetNearPointM", value: 0.25, unit: "m", source: "stem" },
    ],
    targetQuantityKey: "correctivePowerD",
    unit: "D",
    stem: "A long-sighted (hypermetropic) reader has an unaided near point of 0.800 m. What spectacle lens power is required so that a book held at the normal near point of 0.250 m can be read sharply?",
    distractors: () => [
      { value: 5.25, rationale: "Substitutes v = +0.800 m instead of a negative virtual image distance v = -0.800 m." },
      { value: -2.75, rationale: "Reverses the sign of the converging lens power." },
      { value: 1.25, rationale: "Computes only 1 / 0.800 without including the 1 / 0.250 object term." },
    ],
    workedSolution: (_q, ans) =>
      `With $u = +0.250\\text{ m}$ and virtual image at $v = -0.800\\text{ m}$, $P = \\frac{1}{f} = \\frac{1}{0.250} + \\frac{1}{-0.800} = 4.00 - 1.25 = ${ans}$.`,
    planSummary: "Compute corrective converging spectacle power for hypermetropia.",
  });

  pushCalcMcq(ctx, {
    slug: "med-eye-calc-03",
    conceptId,
    kind,
    domain: "optics-shm",
    subtopicId: sub,
    difficulty: "higher",
    scenarioSpec: {
      kind,
      mode: "myopia",
      unaidedFarPointM: 0.5,
      unaidedNearPointM: 0.125,
    },
    hiddenQuantities: ["correctedNearPointM", "focalLengthM", "correctivePowerD"],
    requiredGivens: [
      { name: "unaidedFarPointM", value: 0.5, unit: "m", source: "stem" },
      { name: "unaidedNearPointM", value: 0.125, unit: "m", source: "stem" },
    ],
    targetQuantityKey: "correctedNearPointM",
    unit: "m",
    stem: "A myopic student has an unaided far point of 0.500 m and an unaided near point of 0.125 m. While wearing spectacles prescribed to correct distant vision, what is the student's new closest clear-viewing distance?",
    distractors: () => [
      { value: 0.1, rationale: "Adds +2.0 D instead of -2.0 D to 1 / 0.125." },
      { value: 0.375, rationale: "Subtracts the unaided near point directly from the far point." },
      { value: 0.25, rationale: "Assumes corrective spectacles automatically restore a 0.25 m near point." },
    ],
    workedSolution: (_q, ans) =>
      `The spectacles have power $P = -\\frac{1}{0.500} = -2.00\\text{ D}$. For a virtual image at the eye's unaided near point ($v = -0.125\\text{ m}$), $\\frac{1}{u} = \\frac{1}{f} - \\frac{1}{v} = -2.00 - (-8.00) = 6.00\\text{ m}^{-1}$, giving $u = ${ans}$.`,
    planSummary: "Determine shifted near point of a myopic eye wearing distance-correcting lenses.",
  });

  pushCalcMcq(ctx, {
    slug: "med-eye-calc-04",
    conceptId,
    kind,
    domain: "optics-shm",
    subtopicId: sub,
    difficulty: "standard",
    scenarioSpec: {
      kind,
      mode: "hypermetropia",
      unaidedNearPointM: 1.25,
      targetNearPointM: 0.25,
    },
    hiddenQuantities: ["correctedFarPointM", "focalLengthM", "correctivePowerD"],
    requiredGivens: [
      { name: "unaidedNearPointM", value: 1.25, unit: "m", source: "stem" },
      { name: "targetNearPointM", value: 0.25, unit: "m", source: "stem" },
    ],
    targetQuantityKey: "correctedFarPointM",
    unit: "m",
    stem: "A hypermetropic eye with an unaided near point of 1.25 m and normal distant vision (unaided far point at infinity) wears reading glasses prescribed for objects at 0.250 m. What is the furthest distance at which objects remain sharp while wearing these reading glasses?",
    distractors: () => [
      { value: 0.208, rationale: "Computes 1 / (4.00 + 0.80) by using a positive virtual image distance." },
      { value: 1.25, rationale: "Assumes the corrected far point equals the unaided near point." },
      { value: 0.5, rationale: "Halves the unaided near point erroneously." },
    ],
    workedSolution: (_q, ans) =>
      `Lens power is $P = \\frac{1}{0.250} - \\frac{1}{1.25} = 4.00 - 0.80 = +3.20\\text{ D}$, so $f = \\frac{1}{3.20} = ${ans}$. For the relaxed eye ($v = -\\infty$), $\\frac{1}{u} = \\frac{1}{f}$, hence the new far point is ${ans}.`,
    planSummary: "Find reduced far point of a hypermetropic eye wearing reading glasses.",
  });

  // 3 Pure Qual MCQs
  pushQualMcq(ctx, {
    slug: "med-eye-qual-01",
    conceptId,
    kind,
    domain: "optics-shm",
    subtopicId: sub,
    difficulty: "foundation",
    scenarioSpec: {
      kind,
      mode: "astigmatism",
      cylinderPowerD: -1.75,
      cylinderAxisDeg: 90,
    },
    targetQuantityKey: "defectCauseAnchor",
    stem: "An optometrist diagnoses a patient with corneal astigmatism because vertical lines appear sharp while horizontal lines at the same distance appear blurred. What is the structural cause of astigmatism?",
    correctOption: (a) => `The ${a}.`,
    distractors: [
      {
        text: "The eyeball is symmetrically too long along the principal optical axis.",
        rationale: "An elongated symmetric eyeball causes myopia rather than directional meridian blur.",
      },
      {
        text: "The retina lacks cones in the central fovea while retaining peripheral rods.",
        rationale: "Astigmatism is a refractive curvature defect of the cornea, not a retinal photoreceptor defect.",
      },
      {
        text: "The crystalline lens refracts red light more strongly than violet light.",
        rationale: "That describes chromatic dispersion rather than meridian-dependent astigmatism.",
      },
    ],
    workedSolution: (a) =>
      `Astigmatism occurs when the ${a}, so perpendicular planes focus at different distances.`,
    planSummary: "Identify the optical cause of astigmatism.",
  });

  pushQualMcq(ctx, {
    slug: "med-eye-qual-02",
    conceptId,
    kind,
    domain: "optics-shm",
    subtopicId: sub,
    difficulty: "foundation",
    scenarioSpec: {
      kind,
      mode: "astigmatism",
      cylinderPowerD: 1.25,
      cylinderAxisDeg: 45,
    },
    targetQuantityKey: "lensTypeAnchor",
    stem: "What prescription information must an optician specify on a spectacle lens designed solely to correct astigmatism?",
    correctOption: (a) => `A ${a}.`,
    distractors: [
      {
        text: "A spherical diverging lens specifying only focal length in millimetres.",
        rationale: "A spherical lens alters focusing equally in every meridian and cannot correct astigmatism.",
      },
      {
        text: "A plane tinted glass lens specifying only refractive index.",
        rationale: "A flat lens has zero refractive power in all planes.",
      },
      {
        text: "A symmetric converging lens specifying only aperture diameter.",
        rationale: "Correcting astigmatism requires cylindrical curvature along a defined axis orientation.",
      },
    ],
    workedSolution: (a) =>
      `Astigmatism requires a ${a} so extra refractive power acts only along the misshapen meridian.`,
    planSummary: "Identify cylindrical lens prescription requirements for astigmatism.",
  });

  pushQualMcq(ctx, {
    slug: "med-eye-qual-03",
    conceptId,
    kind,
    domain: "optics-shm",
    subtopicId: sub,
    difficulty: "standard",
    scenarioSpec: {
      kind,
      mode: "hypermetropia",
      unaidedNearPointM: 0.9,
      targetNearPointM: 0.25,
    },
    targetQuantityKey: "lorEyeAnchor",
    stem: "A student claims that hypermetropic reading spectacles work by making text look larger like a magnifying glass. Why is this statement physically misleading in A-Level Medical Physics?",
    correctOption: (a) => `A corrective spectacle lens actually ${a}.`,
    distractors: [
      {
        text: "A corrective spectacle lens forms a real inverted image directly in front of the cornea.",
        rationale: "The intermediate image formed by spectacles is virtual and upright, located behind the object.",
      },
      {
        text: "A corrective spectacle lens increases the refractive index of the eye's vitreous humour.",
        rationale: "External spectacles alter ray vergence before the cornea without modifying eye fluids.",
      },
      {
        text: "A corrective spectacle lens narrows the pupil so diffraction sharpens blurred text.",
        rationale: "Spectacles supply converging optical power rather than acting as a pinhole aperture.",
      },
    ],
    workedSolution: (a) =>
      `Corrective spectacles work because the lens ${a}, enabling the eye's lens to focus the rays onto the retina.`,
    planSummary: "Debunk the magnification misconception for corrective eye spectacles.",
  });

  // 4 Multi-part Structured
  pushStructured(ctx, {
    slug: "med-eye-str-01",
    conceptId,
    kind,
    domain: "optics-shm",
    subtopicId: sub,
    difficulty: "standard",
    questionStyle: "mixed-exam",
    scenarioSpec: {
      kind,
      mode: "myopia",
      unaidedFarPointM: 0.4,
      unaidedNearPointM: 0.16,
    },
    hiddenQuantities: [
      "correctivePowerD",
      "correctedNearPointM",
      "defectCauseAnchor",
    ],
    requiredGivens: [
      { name: "unaidedFarPointM", value: 0.4, unit: "m", source: "stem" },
      { name: "unaidedNearPointM", value: 0.16, unit: "m", source: "stem" },
    ],
    stem: "An eye examination shows a patient can focus unaided only on objects between 0.160 m and 0.400 m from the eye.",
    build: (q) => {
      const p = numQ(q, "correctivePowerD");
      const near = numQ(q, "correctedNearPointM");
      const cause = strQ(q, "defectCauseAnchor");
      return {
        parts: [
          {
            partId: "a",
            prompt: "Name the eye defect and explain its physical cause.",
            marks: 2,
            targetMode: "qualitative",
            targetQuantityKey: "defectCauseAnchor",
            expectedAnswer: `The defect is myopia (short sight), caused by the ${cause}.`,
            workingSteps: [
              "Identify myopia from the finite far point of 0.400 m.",
              "State eyeball too long or cornea/lens too converging.",
            ],
          },
          {
            partId: "b",
            prompt: "Calculate the power of the spectacle lens required to restore clear distant vision, stating its sign.",
            marks: 2,
            targetQuantityKey: "correctivePowerD",
            expectedAnswer: fmt3(p, "D"),
            workingSteps: [
              "$u = \\infty$, $v = -0.400\\text{ m}$.",
              `$P = \\frac{1}{\\infty} + \\frac{1}{-0.400} = ${fmt3(p, "D")}$.`,
            ],
          },
          {
            partId: "c",
            prompt: "Calculate the patient's new near point while wearing these spectacles.",
            marks: 2,
            dependsOnPartIds: ["b"],
            targetQuantityKey: "correctedNearPointM",
            expectedAnswer: fmt3(near, "m"),
            workingSteps: [
              "$\\frac{1}{u} = P - \\frac{1}{v} = -2.50 - \\frac{1}{-0.160} = -2.50 + 6.25 = 3.75\\text{ m}^{-1}$.",
              `$u = \\frac{1}{3.75} = ${fmt3(near, "m")}$.`,
            ],
          },
        ],
        markScheme: [
          { code: "B1", criterion: "Identifies myopia (short sight).", marks: 1, partId: "a" },
          { code: "B1", criterion: "Explains eyeball too long or lens too strong so parallel rays focus in front of retina.", marks: 1, partId: "a" },
          { code: "M1", criterion: "Applies $P = 1/\\infty + 1/(-0.400)$ with negative $v$.", marks: 1, partId: "b" },
          { code: "A1", criterion: `Correct signed power ${fmt3(p, "D")}.`, marks: 1, partId: "b" },
          { code: "M1", criterion: "Substitutes $v = -0.160\\text{ m}$ and $P = -2.50\\text{ D}$ into $1/f = 1/u + 1/v$.", marks: 1, partId: "c" },
          { code: "A1", criterion: `Correct new near point ${fmt3(near, "m")}.`, marks: 1, partId: "c" },
        ],
        workedSolution: `(a) Myopia: ${cause}. (b) $P = ${fmt3(p, "D")}$. (c) $u = ${fmt3(near, "m")}$.`,
      };
    },
    planSummary: "Diagnose myopia, calculate corrective lens power, and find shifted near point.",
    subpartPlan: ["diagnose myopia and cause", "calculate negative lens power", "calculate new near point"],
  });

  pushStructured(ctx, {
    slug: "med-eye-str-02",
    conceptId,
    kind,
    domain: "optics-shm",
    subtopicId: sub,
    difficulty: "standard",
    questionStyle: "calculation",
    scenarioSpec: {
      kind,
      mode: "hypermetropia",
      unaidedNearPointM: 1.0,
      targetNearPointM: 0.25,
    },
    hiddenQuantities: ["correctivePowerD", "focalLengthM", "correctedFarPointM"],
    requiredGivens: [
      { name: "unaidedNearPointM", value: 1.0, unit: "m", source: "stem" },
      { name: "targetNearPointM", value: 0.25, unit: "m", source: "stem" },
    ],
    stem: "A hypermetropic patient has an unaided near point of 1.00 m and an unaided far point at infinity. Reading spectacles are prescribed to restore clear vision at 0.250 m.",
    build: (q) => {
      const p = numQ(q, "correctivePowerD");
      const f = numQ(q, "focalLengthM");
      return {
        parts: [
          {
            partId: "a",
            prompt: "Calculate the required power of the reading spectacles.",
            marks: 3,
            targetQuantityKey: "correctivePowerD",
            expectedAnswer: fmt3(p, "D"),
            workingSteps: [
              "State $P = \\frac{1}{u} + \\frac{1}{v}$ with $u = +0.250\\text{ m}$ and virtual image $v = -1.00\\text{ m}$.",
              `$P = 4.00 - 1.00 = ${fmt3(p, "D")}$.`,
            ],
          },
          {
            partId: "b",
            prompt: "Determine the focal length of the spectacles and state the patient's new far point while wearing them.",
            marks: 2,
            dependsOnPartIds: ["a"],
            targetQuantityKey: "focalLengthM",
            expectedAnswer: `${fmt3(f, "m")} (which is also the new far point).`,
            workingSteps: [
              `$f = \\frac{1}{3.00} = ${fmt3(f, "m")}$.`,
              `For distant viewing with relaxed eye ($v = -\\infty$), $u = f = ${fmt3(f, "m")}$.`,
            ],
          },
        ],
        markScheme: [
          { code: "M1", criterion: "Uses $u = +0.250\\text{ m}$ and negative virtual image $v = -1.00\\text{ m}$.", marks: 1, partId: "a" },
          { code: "M1", criterion: "Computes $P = 1/0.250 - 1/1.00$.", marks: 1, partId: "a" },
          { code: "A1", criterion: `Correct power ${fmt3(p, "D")}.`, marks: 1, partId: "a" },
          { code: "M1", criterion: "Calculates $f = 1 / P$.", marks: 1, partId: "b" },
          { code: "A1", criterion: `States focal length and new far point ${fmt3(f, "m")}.`, marks: 1, partId: "b" },
        ],
        workedSolution: `(a) $P = 4.00 - 1.00 = ${fmt3(p, "D")}$. (b) $f = ${fmt3(f, "m")}$, so objects beyond ${fmt3(f, "m")} appear blurred through these reading glasses.`,
      };
    },
    planSummary: "Calculate hypermetropia reading power, focal length, and resulting far point.",
    subpartPlan: ["calculate converging power", "calculate focal length and new far point"],
  });

  pushStructured(ctx, {
    slug: "med-eye-str-03",
    conceptId,
    kind,
    domain: "optics-shm",
    subtopicId: sub,
    difficulty: "standard",
    questionStyle: "mixed-exam",
    scenarioSpec: {
      kind,
      mode: "astigmatism",
      cylinderPowerD: -2.0,
      cylinderAxisDeg: 135,
    },
    hiddenQuantities: ["cylinderFocalLengthM", "lensTypeAnchor", "defectCauseAnchor"],
    requiredGivens: [
      { name: "cylinderPowerD", value: -2.0, unit: "D", source: "stem" },
      { name: "cylinderAxisDeg", value: 135, source: "stem" },
    ],
    stem: "An optometrist records an astigmatic correction with cylindrical power -2.00 D oriented at an axis angle of 135°.",
    build: (q) => {
      const f = numQ(q, "cylinderFocalLengthM");
      const cause = strQ(q, "defectCauseAnchor");
      const lens = strQ(q, "lensTypeAnchor");
      return {
        parts: [
          {
            partId: "a",
            prompt: "Calculate the focal length of the cylindrical component along its active meridian.",
            marks: 2,
            targetQuantityKey: "cylinderFocalLengthM",
            expectedAnswer: fmt3(f, "m"),
            workingSteps: [`$f = \\frac{1}{P} = \\frac{1}{-2.00} = ${fmt3(f, "m")}$.`],
          },
          {
            partId: "b",
            prompt: "Explain why astigmatism occurs and why the prescription must include an axis orientation.",
            marks: 3,
            targetMode: "qualitative",
            targetQuantityKey: "defectCauseAnchor",
            expectedAnswer: `Astigmatism occurs because the ${cause}; correcting it requires a ${lens} aligned with the misshapen corneal plane.`,
            workingSteps: [
              "State unequal corneal curvature in perpendicular planes.",
              "State cylindrical lens provides power in one meridian only.",
              "Explain axis orientation aligns the lens power with the defective meridian.",
            ],
          },
        ],
        markScheme: [
          { code: "M1", criterion: "Uses $f = 1 / (-2.00)$.", marks: 1, partId: "a" },
          { code: "A1", criterion: `Correct focal length ${fmt3(f, "m")}.`, marks: 1, partId: "a" },
          { code: "B1", criterion: "States non-spherical cornea has different curvatures in orthogonal planes.", marks: 1, partId: "b" },
          { code: "B1", criterion: "Identifies cylindrical lens acts along one plane only.", marks: 1, partId: "b" },
          { code: "B1", criterion: "Explains axis angle aligns cylindrical power with the affected meridian.", marks: 1, partId: "b" },
        ],
        workedSolution: `(a) $f = ${fmt3(f, "m")}$. (b) ${cause}; ${lens} aligns power precisely with the defective meridian.`,
      };
    },
    planSummary: "Compute cylindrical focal length and explain corneal astigmatism prescription.",
    subpartPlan: ["cylindrical focal length", "astigmatism cause and axis explanation"],
  });

  pushStructured(ctx, {
    slug: "med-eye-str-04",
    conceptId,
    kind,
    domain: "optics-shm",
    subtopicId: sub,
    difficulty: "higher",
    questionStyle: "mixed-exam",
    scenarioSpec: {
      kind,
      mode: "myopia",
      unaidedFarPointM: 1.25,
      unaidedNearPointM: 0.2,
    },
    hiddenQuantities: ["correctivePowerD", "correctedNearPointM", "lensTypeAnchor"],
    requiredGivens: [
      { name: "unaidedFarPointM", value: 1.25, unit: "m", source: "stem" },
      { name: "unaidedNearPointM", value: 0.2, unit: "m", source: "stem" },
    ],
    stem: "A driver with mild myopia has an unaided far point of 1.25 m and an unaided near point of 0.200 m.",
    build: (q) => {
      const p = numQ(q, "correctivePowerD");
      const near = numQ(q, "correctedNearPointM");
      const lens = strQ(q, "lensTypeAnchor");
      return {
        parts: [
          {
            partId: "a",
            prompt: "State the type of corrective spectacle lens needed and calculate its power in dioptres.",
            marks: 2,
            targetQuantityKey: "correctivePowerD",
            expectedAnswer: `${fmt3(p, "D")} (${lens}).`,
            workingSteps: [`$P = -\\frac{1}{1.25} = ${fmt3(p, "D")}$ using a ${lens}.`],
          },
          {
            partId: "b",
            prompt: "Calculate the driver's new near point when wearing these driving spectacles.",
            marks: 3,
            dependsOnPartIds: ["a"],
            targetQuantityKey: "correctedNearPointM",
            expectedAnswer: fmt3(near, "m"),
            workingSteps: [
              "$\\frac{1}{u} = -0.800 - \\frac{1}{-0.200} = -0.800 + 5.00 = 4.20\\text{ m}^{-1}$.",
              `$u = \\frac{1}{4.20} = ${fmt3(near, "m")}$.`,
            ],
          },
        ],
        markScheme: [
          { code: "M1", criterion: "Identifies diverging lens and applies $P = -1 / 1.25$.", marks: 1, partId: "a" },
          { code: "A1", criterion: `Correct power ${fmt3(p, "D")}.`, marks: 1, partId: "a" },
          { code: "M1", criterion: "Applies $1/f = 1/u + 1/v$ with $v = -0.200\\text{ m}$.", marks: 1, partId: "b" },
          { code: "M1", criterion: "Evaluates $1/u = 4.20\\text{ m}^{-1}$.", marks: 1, partId: "b" },
          { code: "A1", criterion: `Correct shifted near point ${fmt3(near, "m")}.`, marks: 1, partId: "b" },
        ],
        workedSolution: `(a) ${lens}, $P = ${fmt3(p, "D")}$. (b) $u = ${fmt3(near, "m")}$.`,
      };
    },
    planSummary: "Compute mild myopia driving prescription and resulting near-point shift.",
    subpartPlan: ["lens type and dioptre power", "shifted near point"],
  });

  // 1 Authentic 6-Mark LoR
  pushSixMarkLor(ctx, {
    slug: "med-eye-lor-01",
    conceptId,
    kind,
    domain: "optics-shm",
    subtopicId: sub,
    scenarioSpec: {
      kind,
      mode: "hypermetropia",
      unaidedNearPointM: 0.85,
      targetNearPointM: 0.25,
    },
    targetQuantityKey: "lorEyeAnchor",
    stem: "Opticians routinely correct myopia and hypermetropia using thin spectacle lenses placed just in front of the cornea.",
    prompt:
      "Compare the physical causes and ray paths of myopia and hypermetropia, and explain how each corrective spectacle lens works—explicitly addressing the common misconception that spectacles merely magnify or shrink objects.",
    expectedAnswer: (anchor) =>
      `In myopia (short sight), the eyeball is too long or the cornea and eye lens are too powerful, causing parallel rays from distant objects to converge and focus in front of the retina. A diverging (concave) spectacle lens with negative power diverges incoming parallel rays before they reach the eye so they appear to originate from a virtual image at the patient's unaided far point, allowing the relaxed eye to focus them sharply onto the retina. In hypermetropia (long sight), the eyeball is too short or the eye lens is too weak, so rays from a nearby object at $0.25\\text{ m}$ would focus behind the retina. A converging (convex) spectacle lens with positive power reduces ray divergence so the lens ${anchor}. Crucially, spectacles do not work by magnifying text; instead, they place an upright virtual image inside the patient's unaided range of accommodation so the eye can form a sharp real image on the retina.`,
    workingSteps: [
      "Explain myopia anatomy: eyeball too long or cornea/lens too powerful; parallel rays focus in front of retina.",
      "Explain myopia correction: negative-power diverging lens spreads parallel rays as if coming from unaided far point.",
      "Explain hypermetropia anatomy: eyeball too short or lens too weak; near rays focus behind retina.",
      "Explain hypermetropia correction: positive-power converging lens bends rays from 0.25 m to appear from unaided near point.",
      "Clarify virtual upright intermediate image placement within the eye's natural range of accommodation.",
      "Explicitly refute the misconception that spectacles work by magnifying the object.",
    ],
    criteriaSix: [
      "Correctly states myopia is caused by an elongated eyeball or overly powerful cornea/lens focusing parallel rays in front of the retina.",
      "Correctly explains myopia correction uses a diverging (negative power) lens creating a virtual image of distant objects at the unaided far point.",
      "Correctly states hypermetropia is caused by a short eyeball or weak lens focusing near rays behind the retina.",
      "Correctly explains hypermetropia correction uses a converging (positive power) lens creating a virtual image of a 0.25 m object at the unaided near point.",
      "Clearly describes the ray path change before entering the cornea so the final real image lands sharply on the retina.",
      "Explicitly refutes the magnification misconception by explaining spectacles reposition a virtual intermediate image into the eye's accommodation range.",
    ],
    workedSolution: (anchor) =>
      `Level 3 synthesis: compares myopia (front-of-retina focus, diverging $P < 0$) and hypermetropia (behind-retina focus, converging $P > 0$) and clarifies that each lens ${anchor}.`,
    planSummary: "Six-mark level-of-response comparison of myopia and hypermetropia optics and correction.",
  });
}

function populateMedRetinaEarDb(ctx: BuilderContext): void {
  const kind = "al-opt-med-retina-ear-db";
  const conceptId = "progressive-waves-polarization";
  const sub = "alevel-3-10-medical-physics" as const;

  // 4 Calc MCQs
  pushCalcMcq(ctx, {
    slug: "med-ear-calc-01",
    conceptId,
    kind,
    domain: "waves",
    subtopicId: sub,
    difficulty: "foundation",
    scenarioSpec: {
      kind,
      mode: "ear-db",
      sourcePowerW: 0.05,
      distanceM: 5.0,
    },
    hiddenQuantities: ["intensityLevelDb", "intensityWm2"],
    requiredGivens: [
      { name: "sourcePowerW", value: 0.05, unit: "W", source: "stem" },
      { name: "distanceM", value: 5.0, unit: "m", source: "stem" },
    ],
    targetQuantityKey: "intensityLevelDb",
    unit: "dB",
    stem: "An isotropic laboratory buzzer radiates acoustic power of 0.050 W uniformly in all directions. Taking the threshold of hearing as $I_0 = 1.0 \\times 10^{-12}\\text{ W m}^{-2}$, what is the sound intensity level at a distance of 5.00 m from the buzzer?",
    distractors: (q) => {
      const db = numQ(q, "intensityLevelDb");
      return [
        { value: db / 10, rationale: "Omits the factor of 10 in dB = 10 lg(I / I_0)." },
        { value: 10 * Math.log10(0.05 / (4 * Math.PI * 5) / 1e-12), rationale: "Forgets to square distance r in the inverse-square law 4 pi r squared." },
        { value: db + 20, rationale: "Applies an erroneous factor of 20 instead of 10 to the power ratio." },
      ];
    },
    workedSolution: (q, ans) =>
      `$I = \\frac{P}{4\\pi r^2} = \\frac{0.050}{4\\pi(5.00)^2} = ${fmt3(numQ(q, "intensityWm2"), "W m⁻²")}$. Intensity level $= 10\\lg\\left(\\frac{I}{1.0 \\times 10^{-12}}\\right) = ${ans}$.`,
    planSummary: "Compute sound intensity level in dB from isotropic source power and distance.",
  });

  pushCalcMcq(ctx, {
    slug: "med-ear-calc-02",
    conceptId,
    kind,
    domain: "waves",
    subtopicId: sub,
    difficulty: "standard",
    scenarioSpec: {
      kind,
      mode: "ear-db",
      sourcePowerW: 0.4,
      distanceM: 3.0,
      secondDistanceM: 30.0,
    },
    hiddenQuantities: ["intensityRatio", "levelDifferenceDb"],
    requiredGivens: [
      { name: "distanceM", value: 3.0, unit: "m", source: "stem" },
      { name: "secondDistanceM", value: 30.0, unit: "m", source: "stem" },
    ],
    targetQuantityKey: "levelDifferenceDb",
    unit: "dB",
    stem: "An acoustic technician walks radially away from a point siren, moving from 3.00 m to 30.0 m in an open field. By how many decibels does the sound intensity level decrease?",
    distractors: () => [
      { value: 10.0, rationale: "Assumes intensity falls as 1 / r rather than 1 / r squared." },
      { value: 100.0, rationale: "Reports the intensity factor 100 directly instead of taking 10 lg(100)." },
      { value: 6.02, rationale: "Uses the decrease for doubling distance rather than increasing tenfold." },
    ],
    workedSolution: (_q, ans) =>
      `Increasing distance by a factor of 10 reduces intensity by $10^2 = 100$. Thus $\\Delta L = 10\\lg(100) = ${ans}$.`,
    planSummary: "Determine decibel drop when moving tenfold further from a point sound source.",
  });

  pushCalcMcq(ctx, {
    slug: "med-ear-calc-03",
    conceptId,
    kind,
    domain: "waves",
    subtopicId: sub,
    difficulty: "higher",
    scenarioSpec: {
      kind,
      mode: "ear-db",
      sourcePowerW: 1.2,
      distanceM: 2.0,
      targetLevelDb: 80,
    },
    hiddenQuantities: ["safeDistanceM", "targetIntensityWm2"],
    requiredGivens: [
      { name: "sourcePowerW", value: 1.2, unit: "W", source: "stem" },
      { name: "targetLevelDb", value: 80, unit: "dB", source: "stem" },
    ],
    targetQuantityKey: "safeDistanceM",
    unit: "m",
    stem: "An outdoor warning horn outputs 1.20 W of acoustic power isotropically. Taking $I_0 = 1.0 \\times 10^{-12}\\text{ W m}^{-2}$, what is the minimum safe distance from the horn so that the sound intensity level does not exceed 80.0 dB?",
    distractors: (q) => {
      const r = numQ(q, "safeDistanceM");
      return [
        { value: r * r, rationale: "Forgets to take the square root of r squared." },
        { value: r * Math.sqrt(4 * Math.PI), rationale: "Omits the 4 pi spherical spreading factor." },
        { value: r / 10, rationale: "Uses 10^(-8) W m^-2 erroneously as 10^(-6) W m^-2." },
      ];
    },
    workedSolution: (_q, ans) =>
      `At 80.0 dB, $I = 1.0 \\times 10^{-12} \\times 10^{8.0} = 1.0 \\times 10^{-4}\\text{ W m}^{-2}$. Rearranging $I = \\frac{P}{4\\pi r^2}$ gives $r = \\sqrt{\\frac{1.20}{4\\pi \\times 1.0 \\times 10^{-4}}} = ${ans}$.`,
    planSummary: "Calculate minimum safe distance from an isotropic acoustic source for a decibel limit.",
  });

  pushCalcMcq(ctx, {
    slug: "med-ear-calc-04",
    conceptId,
    kind,
    domain: "waves",
    subtopicId: sub,
    difficulty: "standard",
    scenarioSpec: {
      kind,
      mode: "retina-cones",
      coneDiameterUm: 2.0,
      eyeFocalLengthMm: 17,
      objectDistanceM: 8.5,
    },
    hiddenQuantities: ["minObjectSeparationMm", "minRetinalSeparationUm"],
    requiredGivens: [
      { name: "coneDiameterUm", value: 2.0, unit: "μm", source: "stem" },
      { name: "eyeFocalLengthMm", value: 17, unit: "mm", source: "stem" },
      { name: "objectDistanceM", value: 8.5, unit: "m", source: "stem" },
    ],
    targetQuantityKey: "minObjectSeparationMm",
    unit: "mm",
    stem: "Cones packed at a patient's fovea have diameter 2.00 μm, and the distance from the eye lens to the retina is 17.0 mm. Assuming resolution requires at least one unstimulated cone between two stimulated cones, what is the smallest separation between two bright dots on a chart 8.50 m away that the eye can resolve?",
    distractors: () => [
      { value: 1.0, rationale: "Uses single cone diameter d_cone instead of twice the cone diameter (forgetting the unstimulated cone between them)." },
      { value: 4.0, rationale: "Doubles the minimum separation unnecessarily." },
      { value: 0.2, rationale: "Makes a tenfold unit conversion slip between micrometres and millimetres." },
    ],
    workedSolution: (_q, ans) =>
      `Minimum retinal image separation is $2 d_{\\text{cone}} = 4.00\\,\\mu\\text{m}$. By similar triangles, $s = \\frac{4.00 \\times 10^{-6}}{17.0 \\times 10^{-3}} \\times 8.50 = 2.00 \\times 10^{-3}\\text{ m} = ${ans}$.`,
    planSummary: "Compute minimum resolvable object separation from foveal cone spacing.",
  });

  // 4 Pure Qual MCQs (Plugin 6 has 4 Calc + 4 Qual + 4 Struct = 12 items per Spec C)
  pushQualMcq(ctx, {
    slug: "med-ear-qual-01",
    conceptId,
    kind,
    domain: "waves",
    subtopicId: sub,
    difficulty: "foundation",
    questionStyle: "definition",
    scenarioSpec: {
      kind,
      mode: "ear-db",
      sourcePowerW: 0.1,
      distanceM: 4.0,
    },
    targetQuantityKey: "dbaScaleAnchor",
    stem: "Why do workplace noise meters measure perceived loudness on the dBA scale rather than the unweighted dB intensity scale?",
    correctOption: (a) => `Because the dBA scale is ${a}.`,
    distractors: [
      {
        text: "Because the dBA scale treats all audible frequencies with equal linear intensity weight.",
        rationale: "Equal weighting describes the flat physical dB scale, not the frequency-weighted dBA scale.",
      },
      {
        text: "Because the dBA scale ignores sound intensity and measures only acoustic frequency.",
        rationale: "dBA combines logarithmic intensity with frequency-dependent ear sensitivity weighting.",
      },
      {
        text: "Because human ears are most sensitive near twenty hertz and insensitive around three kilohertz.",
        rationale: "Reverses human ear response: sensitivity peaks around 3 kHz and drops sharply at low frequencies.",
      },
    ],
    workedSolution: (a) =>
      `Perceived loudness varies strongly with frequency, so the dBA scale is ${a}.`,
    planSummary: "Explain why workplace audiometry uses the frequency-weighted dBA scale.",
  });

  pushQualMcq(ctx, {
    slug: "med-ear-qual-02",
    conceptId,
    kind,
    domain: "waves",
    subtopicId: sub,
    difficulty: "standard",
    scenarioSpec: {
      kind,
      mode: "ear-db",
      sourcePowerW: 0.1,
      distanceM: 4.0,
    },
    targetQuantityKey: "hearingLossAnchor",
    stem: "How does an audiogram of age-related hearing loss differ from one caused by prolonged exposure to loud industrial machinery?",
    correctOption: (a) => `Clinical audiometry shows that ${a}.`,
    distractors: [
      {
        text: "Ageing causes a sharp notch near four kilohertz whereas loud noise reduces only low frequencies below fifty hertz.",
        rationale: "Swaps the two classic audiometric patterns: noise-induced loss produces the 4 kHz notch.",
      },
      {
        text: "Both ageing and loud noise produce an identical flat threshold shift across every frequency.",
        rationale: "Neither condition is flat across frequency; ageing progressively erodes high-frequency hearing.",
      },
      {
        text: "Noise damage improves sensitivity near three kilohertz while lowering threshold at ten kilohertz.",
        rationale: "Excessive sound exposure damages cochlear hair cells and raises hearing thresholds.",
      },
    ],
    workedSolution: (a) =>
      `Audiograms distinguish the two mechanisms because ${a}.`,
    planSummary: "Contrast age-related versus noise-induced hearing loss patterns.",
  });

  pushQualMcq(ctx, {
    slug: "med-ear-qual-03",
    conceptId,
    kind,
    domain: "waves",
    subtopicId: sub,
    difficulty: "foundation",
    scenarioSpec: {
      kind,
      mode: "retina-cones",
      coneDiameterUm: 2.5,
      eyeFocalLengthMm: 17,
      objectDistanceM: 10,
    },
    targetQuantityKey: "coneVsRodAnchor",
    stem: "Which statement accurately contrasts the structure and function of retinal cones and rods in the human eye?",
    correctOption: (a) => `On the retina, ${a}.`,
    distractors: [
      {
        text: "Rods are concentrated at the fovea with individual nerve fibres giving colour vision while cones operate in dim light.",
        rationale: "Completely swaps the distribution, wiring, and light-level roles of rods and cones.",
      },
      {
        text: "Both cones and rods share single optic nerve fibres equally across the entire retina.",
        rationale: "Foveal cones connect individually (1-to-1) for acuity whereas multiple rods pool onto one bipolar nerve.",
      },
      {
        text: "Cones respond only to intensity without wavelength discrimination whereas three rod types detect RGB colours.",
        rationale: "Three cone pigments provide colour vision; rods are monochrome.",
      },
    ],
    workedSolution: (a) =>
      `Retinal specialisation works because ${a}.`,
    planSummary: "Compare retinal cones and rods in distribution, nerve pooling, acuity, and sensitivity.",
  });

  pushQualMcq(ctx, {
    slug: "med-ear-qual-04",
    conceptId,
    kind,
    domain: "waves",
    subtopicId: sub,
    difficulty: "standard",
    scenarioSpec: {
      kind,
      mode: "retina-cones",
      coneDiameterUm: 2.2,
      eyeFocalLengthMm: 17,
      objectDistanceM: 6,
    },
    targetQuantityKey: "coneResolutionAnchor",
    stem: "What retinal photoreceptor condition must be satisfied for the brain to resolve two closely spaced bright points as distinct objects?",
    correctOption: (a) => `To resolve two images, ${a}.`,
    distractors: [
      {
        text: "Both images must land on adjacent touching cones with no gap between them.",
        rationale: "Adjacent stimulated cones cannot be distinguished from a single wider bright spot.",
      },
      {
        text: "Both images must fall exclusively on peripheral rods outside the fovea.",
        rationale: "Peripheral rods share nerve pathways and yield poor spatial resolution compared with foveal cones.",
      },
      {
        text: "At least ten rods must sit between two stimulated cones at the fovea.",
        rationale: "The central fovea contains densely packed cones rather than rods, and one unstimulated cone suffices.",
      },
    ],
    workedSolution: (a) =>
      `Spatial resolution on the retina requires that ${a}, giving a minimum centre-to-centre image separation of $2d_{\\text{cone}}$.`,
    planSummary: "State the retinal cone resolution condition.",
  });

  // 4 Multi-part Structured
  pushStructured(ctx, {
    slug: "med-ear-str-01",
    conceptId,
    kind,
    domain: "waves",
    subtopicId: sub,
    difficulty: "standard",
    questionStyle: "mixed-exam",
    scenarioSpec: {
      kind,
      mode: "ear-db",
      sourcePowerW: 0.2,
      distanceM: 4.0,
      secondDistanceM: 8.0,
    },
    hiddenQuantities: [
      "intensityWm2",
      "intensityLevelDb",
      "secondIntensityLevelDb",
      "dbaScaleAnchor",
    ],
    requiredGivens: [
      { name: "sourcePowerW", value: 0.2, unit: "W", source: "stem" },
      { name: "distanceM", value: 4.0, unit: "m", source: "stem" },
      { name: "secondDistanceM", value: 8.0, unit: "m", source: "stem" },
    ],
    stem: "A small loudspeaker emits sound uniformly at 0.200 W in an open courtyard. Take $I_0 = 1.0 \\times 10^{-12}\\text{ W m}^{-2}$.",
    build: (q) => {
      const i1 = numQ(q, "intensityWm2");
      const db1 = numQ(q, "intensityLevelDb");
      const db2 = numQ(q, "secondIntensityLevelDb");
      const dba = strQ(q, "dbaScaleAnchor");
      return {
        parts: [
          {
            partId: "a",
            prompt: "Calculate the sound intensity and intensity level in dB at a distance of 4.00 m.",
            marks: 3,
            targetQuantityKey: "intensityLevelDb",
            expectedAnswer: `${fmt3(db1, "dB")} (from $I = ${fmt3(i1, "W m⁻²")}$).`,
            workingSteps: [
              `$I = \\frac{0.200}{4\\pi (4.00)^2} = ${fmt3(i1, "W m⁻²")}$.`,
              `$L = 10\\lg\\left(\\frac{${fmt3(i1)}}{1.0 \\times 10^{-12}}\\right) = ${fmt3(db1, "dB")}$.`,
            ],
          },
          {
            partId: "b",
            prompt: "Calculate the new intensity level when the listener moves to 8.00 m.",
            marks: 2,
            dependsOnPartIds: ["a"],
            targetQuantityKey: "secondIntensityLevelDb",
            expectedAnswer: fmt3(db2, "dB"),
            workingSteps: [
              "Doubling distance cuts intensity by a factor of 4, reducing level by $10\\lg(4) = 6.02\\text{ dB}$.",
              `$L_2 = ${fmt3(db1)} - 6.02 = ${fmt3(db2, "dB")}$.`,
            ],
          },
          {
            partId: "c",
            prompt: "Explain why a sound measured at 60 dB at 100 Hz sounds much quieter than 60 dB at 3 kHz, referring to the dBA scale.",
            marks: 2,
            targetMode: "qualitative",
            targetQuantityKey: "dbaScaleAnchor",
            expectedAnswer: `The human ear is far less sensitive at 100 Hz than at 3 kHz; the dBA scale is ${dba}.`,
            workingSteps: [
              "Note equal-loudness curves slope upward strongly at low frequencies.",
              "Explain dBA applies frequency weighting matching peak ear sensitivity around 3 kHz.",
            ],
          },
        ],
        markScheme: [
          { code: "M1", criterion: "Applies $I = P / (4\\pi r^2) = 9.95 \\times 10^{-4}\\text{ W m}^{-2}$.", marks: 1, partId: "a" },
          { code: "M1", criterion: "Applies $10\\lg(I / 1.0 \\times 10^{-12})$.", marks: 1, partId: "a" },
          { code: "A1", criterion: `Correct intensity level ${fmt3(db1, "dB")}.`, marks: 1, partId: "a" },
          { code: "M1", criterion: "Applies inverse-square drop of $6.02\\text{ dB}$ for doubling distance.", marks: 1, partId: "b" },
          { code: "A1", criterion: `Correct new level ${fmt3(db2, "dB")}.`, marks: 1, partId: "b" },
          { code: "B1", criterion: "States ear sensitivity peaks around 3 kHz and is much lower at 100 Hz.", marks: 1, partId: "c" },
          { code: "B1", criterion: "Explains dBA weighting accounts for this frequency response.", marks: 1, partId: "c" },
        ],
        workedSolution: `(a) $I = ${fmt3(i1, "W m⁻²")}$, $L_1 = ${fmt3(db1, "dB")}$. (b) $L_2 = ${fmt3(db2, "dB")}$. (c) dBA is ${dba}.`,
      };
    },
    planSummary: "Calculate acoustic intensity levels at two distances and explain dBA frequency weighting.",
    subpartPlan: ["dB at first distance", "dB at doubled distance", "dBA frequency weighting"],
  });

  pushStructured(ctx, {
    slug: "med-ear-str-02",
    conceptId,
    kind,
    domain: "waves",
    subtopicId: sub,
    difficulty: "standard",
    questionStyle: "mixed-exam",
    scenarioSpec: {
      kind,
      mode: "retina-cones",
      coneDiameterUm: 2.5,
      eyeFocalLengthMm: 17,
      objectDistanceM: 17.0,
    },
    hiddenQuantities: [
      "minRetinalSeparationUm",
      "minObjectSeparationMm",
      "coneResolutionAnchor",
    ],
    requiredGivens: [
      { name: "coneDiameterUm", value: 2.5, unit: "μm", source: "stem" },
      { name: "eyeFocalLengthMm", value: 17, unit: "mm", source: "stem" },
      { name: "objectDistanceM", value: 17.0, unit: "m", source: "stem" },
    ],
    stem: "At the fovea of a healthy human eye, closely packed cones have an average diameter of 2.50 μm and lie 17.0 mm behind the optical centre of the eye lens.",
    build: (q) => {
      const ret = numQ(q, "minRetinalSeparationUm");
      const obj = numQ(q, "minObjectSeparationMm");
      const rule = strQ(q, "coneResolutionAnchor");
      return {
        parts: [
          {
            partId: "a",
            prompt: "State the minimum centre-to-centre separation of two images on the fovea for them to be resolved, and explain why.",
            marks: 2,
            targetQuantityKey: "minRetinalSeparationUm",
            expectedAnswer: `${fmt3(ret, "μm")}, because ${rule}.`,
            workingSteps: [
              "Two stimulated cones require at least one unstimulated cone between them.",
              `$2 \\times 2.50\\,\\mu\\text{m} = ${fmt3(ret, "μm")}$.`,
            ],
          },
          {
            partId: "b",
            prompt: "Calculate the minimum separation between two LEDs placed 17.0 m from the observer so they can just be resolved.",
            marks: 3,
            dependsOnPartIds: ["a"],
            targetQuantityKey: "minObjectSeparationMm",
            expectedAnswer: fmt3(obj, "mm"),
            workingSteps: [
              "Angular resolution $\\theta = \\frac{5.00 \\times 10^{-6}}{17.0 \\times 10^{-3}} = 2.94 \\times 10^{-4}\\text{ rad}$.",
              `$s = 17.0 \\times 2.94 \\times 10^{-4} = 5.00 \\times 10^{-3}\\text{ m} = ${fmt3(obj, "mm")}$.`,
            ],
          },
        ],
        markScheme: [
          { code: "B1", criterion: "Explains at least one unstimulated cone must separate two stimulated cones.", marks: 1, partId: "a" },
          { code: "A1", criterion: `States minimum retinal separation ${fmt3(ret, "μm")}.`, marks: 1, partId: "a" },
          { code: "M1", criterion: "Applies similar triangles $s / D = 2 d_{\\text{cone}} / f_{\\text{eye}}$.", marks: 1, partId: "b" },
          { code: "M1", criterion: "Converts $\\mu\\text{m}$ and mm consistently.", marks: 1, partId: "b" },
          { code: "A1", criterion: `Correct minimum object separation ${fmt3(obj, "mm")}.`, marks: 1, partId: "b" },
        ],
        workedSolution: `(a) ${fmt3(ret, "μm")} since ${rule}. (b) By similar triangles, $s = ${fmt3(obj, "mm")}$.`,
      };
    },
    planSummary: "Apply the double cone-diameter retinal resolution rule to find minimum resolvable LED separation.",
    subpartPlan: ["retinal image separation", "object separation by similar triangles"],
  });

  pushStructured(ctx, {
    slug: "med-ear-str-03",
    conceptId,
    kind,
    domain: "waves",
    subtopicId: sub,
    difficulty: "higher",
    questionStyle: "calculation",
    scenarioSpec: {
      kind,
      mode: "ear-db",
      sourcePowerW: 2.5,
      distanceM: 10.0,
      targetLevelDb: 70,
    },
    hiddenQuantities: ["intensityLevelDb", "safeDistanceM"],
    requiredGivens: [
      { name: "sourcePowerW", value: 2.5, unit: "W", source: "stem" },
      { name: "distanceM", value: 10.0, unit: "m", source: "stem" },
      { name: "targetLevelDb", value: 70, unit: "dB", source: "stem" },
    ],
    stem: "A concert public-address speaker approximates a point source emitting 2.50 W of acoustic power uniformly into space. Take $I_0 = 1.0 \\times 10^{-12}\\text{ W m}^{-2}$.",
    build: (q) => {
      const db = numQ(q, "intensityLevelDb");
      const rSafe = numQ(q, "safeDistanceM");
      return {
        parts: [
          {
            partId: "a",
            prompt: "Calculate the sound intensity level in dB at a barrier 10.0 m from the speaker.",
            marks: 3,
            targetQuantityKey: "intensityLevelDb",
            expectedAnswer: fmt3(db, "dB"),
            workingSteps: [
              "$I = \\frac{2.50}{4\\pi (10.0)^2} = 1.99 \\times 10^{-3}\\text{ W m}^{-2}$.",
              `$L = 10\\lg(1.99 \\times 10^9) = ${fmt3(db, "dB")}$.`,
            ],
          },
          {
            partId: "b",
            prompt: "Calculate the distance from the speaker at which the intensity level falls to 70.0 dB.",
            marks: 3,
            targetQuantityKey: "safeDistanceM",
            expectedAnswer: fmt3(rSafe, "m"),
            workingSteps: [
              "$I_{70} = 1.0 \\times 10^{-12} \\times 10^7 = 1.0 \\times 10^{-5}\\text{ W m}^{-2}$.",
              `$r = \\sqrt{\\frac{2.50}{4\\pi \\times 1.0 \\times 10^{-5}}} = ${fmt3(rSafe, "m")}$.`,
            ],
          },
        ],
        markScheme: [
          { code: "M1", criterion: "Computes $I = 2.50 / (4\\pi \\times 100)$.", marks: 1, partId: "a" },
          { code: "M1", criterion: "Applies $10\\lg(I / I_0)$.", marks: 1, partId: "a" },
          { code: "A1", criterion: `Correct intensity level ${fmt3(db, "dB")}.`, marks: 1, partId: "a" },
          { code: "M1", criterion: "Converts 70.0 dB to $I = 1.0 \\times 10^{-5}\\text{ W m}^{-2}$.", marks: 1, partId: "b" },
          { code: "M1", criterion: "Solves $r = \\sqrt{P / (4\\pi I)}$.", marks: 1, partId: "b" },
          { code: "A1", criterion: `Correct distance ${fmt3(rSafe, "m")}.`, marks: 1, partId: "b" },
        ],
        workedSolution: `(a) $L = ${fmt3(db, "dB")}$. (b) $r = ${fmt3(rSafe, "m")}$.`,
      };
    },
    planSummary: "Calculate acoustic intensity level at a barrier and distance for a target decibel contour.",
    subpartPlan: ["intensity level at barrier", "radius for target decibel contour"],
  });

  pushStructured(ctx, {
    slug: "med-ear-str-04",
    conceptId,
    kind,
    domain: "waves",
    subtopicId: sub,
    difficulty: "standard",
    questionStyle: "mixed-exam",
    scenarioSpec: {
      kind,
      mode: "retina-cones",
      coneDiameterUm: 3.0,
      eyeFocalLengthMm: 17,
      objectDistanceM: 5.1,
    },
    hiddenQuantities: [
      "minAngularResolutionRad",
      "minObjectSeparationMm",
      "coneVsRodAnchor",
    ],
    requiredGivens: [
      { name: "coneDiameterUm", value: 3.0, unit: "μm", source: "stem" },
      { name: "eyeFocalLengthMm", value: 17, unit: "mm", source: "stem" },
      { name: "objectDistanceM", value: 5.1, unit: "m", source: "stem" },
    ],
    stem: "An eye test chart sits 5.10 m from a patient whose foveal cones have diameter 3.00 μm at an eye-lens-to-retina distance of 17.0 mm.",
    build: (q) => {
      const ang = numQ(q, "minAngularResolutionRad");
      const sep = numQ(q, "minObjectSeparationMm");
      const cr = strQ(q, "coneVsRodAnchor");
      return {
        parts: [
          {
            partId: "a",
            prompt: "Calculate the minimum angular resolution in radians limited by foveal cone spacing.",
            marks: 2,
            targetQuantityKey: "minAngularResolutionRad",
            expectedAnswer: fmt3(ang, "rad"),
            workingSteps: [
              `$\\theta = \\frac{2 \\times 3.00 \\times 10^{-6}}{17.0 \\times 10^{-3}} = ${fmt3(ang, "rad")}$.`,
            ],
          },
          {
            partId: "b",
            prompt: "Hence calculate the smallest separation between two lines on the chart 5.10 m away.",
            marks: 2,
            dependsOnPartIds: ["a"],
            targetQuantityKey: "minObjectSeparationMm",
            expectedAnswer: fmt3(sep, "mm"),
            workingSteps: [`$s = 5.10 \\times ${fmt3(ang)} = ${fmt3(sep, "mm")}$.`],
          },
          {
            partId: "c",
            prompt: "Explain why peripheral vision is far more sensitive in dim starlight yet cannot read fine chart lettering.",
            marks: 2,
            targetMode: "qualitative",
            targetQuantityKey: "coneVsRodAnchor",
            expectedAnswer: `In the eye, ${cr}.`,
            workingSteps: [
              "Peripheral rods pool signals from several rods onto one nerve fibre, raising dim-light sensitivity.",
              "Shared nerve connections prevent the brain from localising individual photons, reducing spatial acuity.",
            ],
          },
        ],
        markScheme: [
          { code: "M1", criterion: "Uses $2 d_{\\text{cone}} / f_{\\text{eye}} = 6.00 \\times 10^{-6} / 0.0170$.", marks: 1, partId: "a" },
          { code: "A1", criterion: `Correct angle ${fmt3(ang, "rad")}.`, marks: 1, partId: "a" },
          { code: "M1", criterion: "Multiplies angular resolution by 5.10 m.", marks: 1, partId: "b" },
          { code: "A1", criterion: `Correct separation ${fmt3(sep, "mm")}.`, marks: 1, partId: "b" },
          { code: "B1", criterion: "Explains rods share optic nerve pathways (summing weak signals in dim light).", marks: 1, partId: "c" },
          { code: "B1", criterion: "Contrasts with 1-to-1 foveal cones needed for high acuity and colour vision.", marks: 1, partId: "c" },
        ],
        workedSolution: `(a) $\\theta = ${fmt3(ang, "rad")}$. (b) $s = ${fmt3(sep, "mm")}$. (c) ${cr}.`,
      };
    },
    planSummary: "Compute cone-limited angular and chart resolution and explain foveal vs peripheral vision.",
    subpartPlan: ["cone angular resolution", "chart line separation", "cones vs rods neural wiring"],
  });
}

function populateMedUltrasoundAscan(ctx: BuilderContext): void {
  const kind = "al-opt-med-ultrasound-ascan";
  const conceptId = "progressive-waves-polarization";
  const sub = "alevel-3-10-medical-physics" as const;

  // 4 Calc MCQs
  pushCalcMcq(ctx, {
    slug: "med-us-calc-01",
    conceptId,
    kind,
    domain: "waves",
    subtopicId: sub,
    difficulty: "foundation",
    scenarioSpec: {
      kind,
      mode: "impedance-boundary",
      density1KgM3: 1060,
      speed1Ms: 1540,
      density2KgM3: 1900,
      speed2Ms: 4080,
    },
    hiddenQuantities: ["impedance2", "reflectionPercent"],
    requiredGivens: [
      { name: "density2KgM3", value: 1900, unit: "kg m⁻³", source: "stem" },
      { name: "speed2Ms", value: 4080, unit: "m s⁻¹", source: "stem" },
    ],
    targetQuantityKey: "impedance2",
    unit: "kg m⁻² s⁻¹",
    stem: "Cortical bone has density 1900 kg m⁻³ and transmits ultrasound waves at a speed of 4080 m s⁻¹. Calculate the specific acoustic impedance $Z$ of cortical bone.",
    distractors: () => [
      { value: 4080 / 1900, rationale: "Divides wave speed by density instead of multiplying Z = rho c." },
      { value: 1900 / 4080, rationale: "Divides density by wave speed erroneously." },
      { value: 0.5 * 1900 * 4080, rationale: "Includes an extraneous factor of one-half." },
    ],
    workedSolution: (_q, ans) =>
      `Specific acoustic impedance is $Z = \\rho c = 1900 \\times 4080 = ${ans}$.`,
    planSummary: "Calculate acoustic impedance Z = rho c for bone.",
  });

  pushCalcMcq(ctx, {
    slug: "med-us-calc-02",
    conceptId,
    kind,
    domain: "waves",
    subtopicId: sub,
    difficulty: "standard",
    scenarioSpec: {
      kind,
      mode: "impedance-boundary",
      density1KgM3: 1060,
      speed1Ms: 1540,
      density2KgM3: 1900,
      speed2Ms: 3600,
    },
    hiddenQuantities: ["reflectionPercent", "reflectionFraction"],
    requiredGivens: [
      { name: "impedance1", value: 1.63e6, unit: "kg m⁻² s⁻¹", source: "stem" },
      { name: "impedance2", value: 6.84e6, unit: "kg m⁻² s⁻¹", source: "stem" },
    ],
    targetQuantityKey: "reflectionPercent",
    unit: "%",
    stem: "An ultrasound pulse travelling through soft tissue ($Z_1 = 1.63 \\times 10^6\\text{ kg m}^{-2}\\text{ s}^{-1}$) strikes a bone interface ($Z_2 = 6.84 \\times 10^6\\text{ kg m}^{-2}\\text{ s}^{-1}$) at normal incidence. What percentage of the incident intensity is reflected?",
    distractors: (q) => {
      const rPct = numQ(q, "reflectionPercent");
      return [
        { value: Math.sqrt(rPct / 100) * 100, rationale: "Forgets to square the impedance fraction (Z_2 - Z_1) / (Z_2 + Z_1)." },
        { value: 100 - rPct, rationale: "Reports the transmitted percentage instead of the reflected percentage." },
        { value: rPct * 0.5, rationale: "Halves the reflected intensity fraction erroneously." },
      ];
    },
    workedSolution: (_q, ans) =>
      `$\\frac{I_r}{I_i} = \\left(\\frac{6.84 - 1.63}{6.84 + 1.63}\\right)^2 = \\left(\\frac{5.21}{8.47}\\right)^2 = 0.378 = ${ans}$.`,
    planSummary: "Calculate percentage ultrasound intensity reflected at a tissue-bone boundary.",
  });

  pushCalcMcq(ctx, {
    slug: "med-us-calc-03",
    conceptId,
    kind,
    domain: "waves",
    subtopicId: sub,
    difficulty: "foundation",
    scenarioSpec: {
      kind,
      mode: "ascan-echo",
      density1KgM3: 1050,
      speed1Ms: 1540,
      density2KgM3: 1070,
      speed2Ms: 1560,
      pulseEchoDelayUs: 42,
      secondEchoDelayUs: 112,
    },
    hiddenQuantities: ["organThicknessMm", "organThicknessM"],
    requiredGivens: [
      { name: "speed2Ms", value: 1560, unit: "m s⁻¹", source: "stem" },
      { name: "pulseEchoDelayUs", value: 42, unit: "μs", source: "either" },
      { name: "secondEchoDelayUs", value: 112, unit: "μs", source: "either" },
    ],
    targetQuantityKey: "organThicknessMm",
    unit: "mm",
    stem: "On an A-scan CRO trace, echoes from the front and rear surfaces of a kidney arrive at $42\\,\\mu\\text{s}$ and $112\\,\\mu\\text{s}$ respectively. Taking the speed of ultrasound inside the kidney to be 1560 m s⁻¹, what is the thickness of the kidney?",
    distractors: (q) => {
      const mm = numQ(q, "organThicknessMm");
      return [
        { value: mm * 2, rationale: "Forgets the pulse-echo factor of 2 in 2d = c Delta t." },
        { value: (1560 * 112e-6) / 2 * 1000, rationale: "Uses the total time 112 microseconds rather than the interval between the two echoes." },
        { value: mm * 0.5, rationale: "Divides by four instead of two." },
      ];
    },
    workedSolution: (_q, ans) =>
      `Time interval between echoes is $\\Delta t = 112 - 42 = 70\\,\\mu\\text{s}$. Using $2d = c\\Delta t$, $d = \\frac{1560 \\times 70 \\times 10^{-6}}{2} = 0.0546\\text{ m} = ${ans}$.`,
    planSummary: "Compute organ thickness from A-scan pulse-echo round-trip delay.",
  });

  pushCalcMcq(ctx, {
    slug: "med-us-calc-04",
    conceptId,
    kind,
    domain: "waves",
    subtopicId: sub,
    difficulty: "higher",
    scenarioSpec: {
      kind,
      mode: "impedance-boundary",
      density1KgM3: 1060,
      speed1Ms: 1540,
      density2KgM3: 1080,
      speed2Ms: 1580,
      transducerFreqMHz: 5.0,
      crystalSpeedMs: 4200,
    },
    hiddenQuantities: ["crystalThicknessMm"],
    requiredGivens: [
      { name: "transducerFreqMHz", value: 5.0, unit: "MHz", source: "stem" },
      { name: "crystalSpeedMs", value: 4200, unit: "m s⁻¹", source: "stem" },
    ],
    targetQuantityKey: "crystalThicknessMm",
    unit: "mm",
    stem: "A diagnostic ultrasound probe uses a piezoelectric crystal that vibrates at its fundamental resonant frequency of 5.00 MHz. If longitudinal waves travel through the crystal at 4200 m s⁻¹, what is the required thickness of the crystal ($\\lambda / 2$)?",
    distractors: (q) => {
      const mm = numQ(q, "crystalThicknessMm");
      return [
        { value: mm * 2, rationale: "Computes one full wavelength lambda rather than half a wavelength lambda / 2." },
        { value: mm * 0.5, rationale: "Uses quarter-wavelength lambda / 4 instead of half-wavelength resonance." },
        { value: mm * 10, rationale: "Makes a factor-of-ten unit slip converting MHz and mm." },
      ];
    },
    workedSolution: (_q, ans) =>
      `Wavelength in the crystal is $\\lambda = \\frac{c}{f} = \\frac{4200}{5.00 \\times 10^6} = 8.40 \\times 10^{-4}\\text{ m} = 0.840\\text{ mm}$. Resonant thickness is $\\frac{\\lambda}{2} = ${ans}$.`,
    planSummary: "Calculate piezoelectric crystal half-wavelength resonance thickness.",
  });

  // 3 Pure Qual MCQs
  pushQualMcq(ctx, {
    slug: "med-us-qual-01",
    conceptId,
    kind,
    domain: "waves",
    subtopicId: sub,
    difficulty: "foundation",
    scenarioSpec: {
      kind,
      mode: "impedance-boundary",
      density1KgM3: 1.29,
      speed1Ms: 330,
      density2KgM3: 1060,
      speed2Ms: 1540,
    },
    targetQuantityKey: "couplingGelAnchor",
    stem: "Before placing an ultrasound transducer onto a patient's skin, the sonographer applies a thick layer of water-based coupling gel. Why is this step essential?",
    correctOption: (a) => `The gel ${a}.`,
    distractors: [
      {
        text: "The gel absorbs returning ultrasound echoes so the screen shows fewer artefacts.",
        rationale: "Gel enhances transmission into and out of the body rather than absorbing echoes.",
      },
      {
        text: "The gel converts transverse ultrasound waves into longitudinal radio waves.",
        rationale: "Ultrasound waves in fluid and tissue are already longitudinal mechanical waves.",
      },
      {
        text: "The gel increases the acoustic impedance mismatch at the skin to boost reflection.",
        rationale: "Reflection at the skin surface must be minimised, not boosted.",
      },
    ],
    workedSolution: (a) =>
      `Without gel, the huge impedance mismatch between air and skin reflects over 99.9% of ultrasound intensity; applying gel ${a}.`,
    planSummary: "Explain acoustic impedance matching role of ultrasound coupling gel.",
  });

  pushQualMcq(ctx, {
    slug: "med-us-qual-02",
    conceptId,
    kind,
    domain: "waves",
    subtopicId: sub,
    difficulty: "standard",
    scenarioSpec: {
      kind,
      mode: "ascan-echo",
      density1KgM3: 1060,
      speed1Ms: 1540,
      density2KgM3: 1080,
      speed2Ms: 1580,
      pulseEchoDelayUs: 40,
      secondEchoDelayUs: 100,
    },
    targetQuantityKey: "backingBlockAnchor",
    stem: "Inside an ultrasound probe, an epoxy-tungsten backing block is bonded directly behind the piezoelectric crystal. What is its primary physical function?",
    correctOption: (a) => `The backing block ${a}.`,
    distractors: [
      {
        text: "It amplifies the voltage of the AC drive signal to increase crystal ringing duration.",
        rationale: "Long ringing degrades axial resolution and prevents receiving echoes from shallow boundaries.",
      },
      {
        text: "It reflects backward-travelling ultrasound waves to create continuous standing waves in tissue.",
        rationale: "Pulse-echo imaging requires ultra-short damped pulses, not continuous waves.",
      },
      {
        text: "It shields the patient from ionising gamma photons emitted by the crystal.",
        rationale: "Ultrasound probes emit non-ionising mechanical vibrations, never gamma radiation.",
      },
    ],
    workedSolution: (a) =>
      `A heavily damped backing block ${a} so echoes from closely spaced boundaries do not overlap.`,
    planSummary: "Explain role of ultrasound transducer damping backing material.",
  });

  pushQualMcq(ctx, {
    slug: "med-us-qual-03",
    conceptId,
    kind,
    domain: "waves",
    subtopicId: sub,
    difficulty: "foundation",
    scenarioSpec: {
      kind,
      mode: "ascan-echo",
      density1KgM3: 1060,
      speed1Ms: 1540,
      density2KgM3: 1080,
      speed2Ms: 1580,
      pulseEchoDelayUs: 35,
      secondEchoDelayUs: 95,
    },
    targetQuantityKey: "ascanVsBscanAnchor",
    stem: "How does a diagnostic B-scan differ from an A-scan when imaging internal body structures?",
    correctOption: (a) => `In clinical imaging, ${a}.`,
    distractors: [
      {
        text: "A-scan uses ionising X-rays for bone thickness while B-scan uses magnetic fields for soft tissue.",
        rationale: "Both A-scan and B-scan are non-ionising pulse-echo ultrasound techniques.",
      },
      {
        text: "B-scan plots a single voltage spike against time while A-scan builds a full three-dimensional scan.",
        rationale: "Reverses the definitions of A-scan (amplitude-mode 1D trace) and B-scan (brightness-mode 2D image).",
      },
      {
        text: "B-scan operates without coupling gel because it sweeps multiple frequencies simultaneously.",
        rationale: "Every external diagnostic ultrasound scan requires coupling gel at the skin interface.",
      },
    ],
    workedSolution: (a) =>
      `The two modes serve complementary diagnostic roles: ${a}.`,
    planSummary: "Distinguish A-scan and B-scan ultrasound displays.",
  });

  // 4 Multi-part Structured
  pushStructured(ctx, {
    slug: "med-us-str-01",
    conceptId,
    kind,
    domain: "waves",
    subtopicId: sub,
    difficulty: "standard",
    questionStyle: "mixed-exam",
    scenarioSpec: {
      kind,
      mode: "impedance-boundary",
      density1KgM3: 1.29,
      speed1Ms: 330,
      density2KgM3: 1060,
      speed2Ms: 1540,
    },
    hiddenQuantities: [
      "impedance1",
      "impedance2",
      "reflectionPercent",
      "couplingGelAnchor",
    ],
    requiredGivens: [
      { name: "density1KgM3", value: 1.29, unit: "kg m⁻³", source: "stem" },
      { name: "speed1Ms", value: 330, unit: "m s⁻¹", source: "stem" },
      { name: "density2KgM3", value: 1060, unit: "kg m⁻³", source: "stem" },
      { name: "speed2Ms", value: 1540, unit: "m s⁻¹", source: "stem" },
    ],
    stem: "Ultrasound waves travel from a thin air gap (density 1.29 kg m⁻³, speed 330 m s⁻¹) onto soft skin tissue (density 1060 kg m⁻³, speed 1540 m s⁻¹).",
    build: (q) => {
      const z1 = numQ(q, "impedance1");
      const z2 = numQ(q, "impedance2");
      const rPct = numQ(q, "reflectionPercent");
      const gel = strQ(q, "couplingGelAnchor");
      return {
        parts: [
          {
            partId: "a",
            prompt: "Calculate the acoustic impedance of air and of soft tissue.",
            marks: 2,
            targetQuantityKey: "impedance2",
            expectedAnswer: `Air: ${fmt3(z1, "kg m⁻² s⁻¹")}; soft tissue: ${fmt3(z2, "kg m⁻² s⁻¹")}.`,
            workingSteps: [
              `$Z_1 = 1.29 \\times 330 = ${fmt3(z1, "kg m⁻² s⁻¹")}$.`,
              `$Z_2 = 1060 \\times 1540 = ${fmt3(z2, "kg m⁻² s⁻¹")}$.`,
            ],
          },
          {
            partId: "b",
            prompt: "Calculate the percentage of incident ultrasound intensity reflected at the air–skin boundary.",
            marks: 2,
            dependsOnPartIds: ["a"],
            targetQuantityKey: "reflectionPercent",
            expectedAnswer: fmt3(rPct, "%"),
            workingSteps: [
              `$\\frac{I_r}{I_i} = \\left(\\frac{1.63 \\times 10^6 - 426}{1.63 \\times 10^6 + 426}\\right)^2 = 0.9990 = ${fmt3(rPct, "%")}$.`,
            ],
          },
          {
            partId: "c",
            prompt: "Explain how applying coupling gel solves this problem during clinical scanning.",
            marks: 2,
            targetMode: "qualitative",
            targetQuantityKey: "couplingGelAnchor",
            expectedAnswer: `Coupling gel ${gel}, allowing nearly all ultrasound energy to enter the body.`,
            workingSteps: [
              "Gel excludes trapped air pockets.",
              "Gel has acoustic impedance close to soft tissue, making $(Z_2 - Z_1)^2$ very small.",
            ],
          },
        ],
        markScheme: [
          { code: "M1", criterion: "Applies $Z = \\rho c$ to air ($426\\text{ kg m}^{-2}\\text{ s}^{-1}$) and tissue.", marks: 1, partId: "a" },
          { code: "A1", criterion: `Correct tissue impedance ${fmt3(z2, "kg m⁻² s⁻¹")}.`, marks: 1, partId: "a" },
          { code: "M1", criterion: "Substitutes into $((Z_2 - Z_1)/(Z_2 + Z_1))^2$.", marks: 1, partId: "b" },
          { code: "A1", criterion: `Correct reflected percentage ${fmt3(rPct, "%")}.`, marks: 1, partId: "b" },
          { code: "B1", criterion: "States gel displaces air from the skin surface.", marks: 1, partId: "c" },
          { code: "B1", criterion: "Explains gel matches tissue acoustic impedance to minimise reflection.", marks: 1, partId: "c" },
        ],
        workedSolution: `(a) $Z_1 = ${fmt3(z1)}$, $Z_2 = ${fmt3(z2, "kg m⁻² s⁻¹")}$. (b) Reflected $= ${fmt3(rPct, "%")}$. (c) Gel ${gel}.`,
      };
    },
    planSummary: "Demonstrate near-total reflection at an air-skin boundary and explain coupling gel matching.",
    subpartPlan: ["compute acoustic impedances", "compute reflected percentage", "explain coupling gel"],
  });

  pushStructured(ctx, {
    slug: "med-us-str-02",
    conceptId,
    kind,
    domain: "waves",
    subtopicId: sub,
    difficulty: "standard",
    questionStyle: "calculation",
    scenarioSpec: {
      kind,
      mode: "ascan-echo",
      density1KgM3: 1020,
      speed1Ms: 1520,
      density2KgM3: 1060,
      speed2Ms: 1580,
      pulseEchoDelayUs: 26,
      secondEchoDelayUs: 76,
    },
    hiddenQuantities: ["firstBoundaryDepthMm", "organThicknessMm"],
    requiredGivens: [
      { name: "speed1Ms", value: 1520, unit: "m s⁻¹", source: "stem" },
      { name: "speed2Ms", value: 1580, unit: "m s⁻¹", source: "stem" },
      { name: "pulseEchoDelayUs", value: 26, unit: "μs", source: "either" },
      { name: "secondEchoDelayUs", value: 76, unit: "μs", source: "either" },
    ],
    stem: "An ophthalmic A-scan records the front-surface echo of an eye lens at $26\\,\\mu\\text{s}$ (through aqueous humour at $c_1 = 1520\\text{ m s}^{-1}$) and the rear-surface echo at $76\\,\\mu\\text{s}$ (speed inside the second layer $c_2 = 1580\\text{ m s}^{-1}$).",
    build: (q) => {
      const d1 = numQ(q, "firstBoundaryDepthMm");
      const d2 = numQ(q, "organThicknessMm");
      return {
        parts: [
          {
            partId: "a",
            prompt: "Calculate the depth of the first reflecting boundary in millimetres.",
            marks: 2,
            targetQuantityKey: "firstBoundaryDepthMm",
            expectedAnswer: fmt3(d1, "mm"),
            workingSteps: [
              `$d_1 = \\frac{1520 \\times 26 \\times 10^{-6}}{2} = 0.01976\\text{ m} = ${fmt3(d1, "mm")}$.`,
            ],
          },
          {
            partId: "b",
            prompt: "Calculate the thickness of the second structure between the two echoes in millimetres.",
            marks: 3,
            targetQuantityKey: "organThicknessMm",
            expectedAnswer: fmt3(d2, "mm"),
            workingSteps: [
              "$\\Delta t = 76 - 26 = 50\\,\\mu\\text{s}$.",
              `$d_2 = \\frac{1580 \\times 50 \\times 10^{-6}}{2} = 0.0395\\text{ m} = ${fmt3(d2, "mm")}$.`,
            ],
          },
        ],
        markScheme: [
          { code: "M1", criterion: "Applies $2d_1 = c_1 t_1$ with factor of 2.", marks: 1, partId: "a" },
          { code: "A1", criterion: `Correct depth ${fmt3(d1, "mm")}.`, marks: 1, partId: "a" },
          { code: "M1", criterion: "Finds echo time difference $\\Delta t = 50\\,\\mu\\text{s}$.", marks: 1, partId: "b" },
          { code: "M1", criterion: "Applies $2d_2 = 1580 \\times 50 \\times 10^{-6}$.", marks: 1, partId: "b" },
          { code: "A1", criterion: `Correct thickness ${fmt3(d2, "mm")}.`, marks: 1, partId: "b" },
        ],
        workedSolution: `(a) $d_1 = ${fmt3(d1, "mm")}$. (b) $\\Delta t = 50\\,\\mu\\text{s} \\Rightarrow d_2 = ${fmt3(d2, "mm")}$.`,
      };
    },
    planSummary: "Extract boundary depth and tissue thickness from an A-scan CRO trace.",
    subpartPlan: ["depth of first boundary", "thickness between echoes"],
  });

  pushStructured(ctx, {
    slug: "med-us-str-03",
    conceptId,
    kind,
    domain: "waves",
    subtopicId: sub,
    difficulty: "standard",
    questionStyle: "mixed-exam",
    scenarioSpec: {
      kind,
      mode: "impedance-boundary",
      density1KgM3: 1050,
      speed1Ms: 1540,
      density2KgM3: 950,
      speed2Ms: 1450,
    },
    hiddenQuantities: [
      "reflectionPercent",
      "transmissionPercent",
      "backingBlockAnchor",
    ],
    requiredGivens: [
      { name: "density1KgM3", value: 1050, unit: "kg m⁻³", source: "stem" },
      { name: "speed1Ms", value: 1540, unit: "m s⁻¹", source: "stem" },
      { name: "density2KgM3", value: 950, unit: "kg m⁻³", source: "stem" },
      { name: "speed2Ms", value: 1450, unit: "m s⁻¹", source: "stem" },
    ],
    stem: "An ultrasound pulse passes at normal incidence from muscle (density 1050 kg m⁻³, speed 1540 m s⁻¹) into adipose fat tissue (density 950 kg m⁻³, speed 1450 m s⁻¹).",
    build: (q) => {
      const rPct = numQ(q, "reflectionPercent");
      const tPct = numQ(q, "transmissionPercent");
      const bak = strQ(q, "backingBlockAnchor");
      return {
        parts: [
          {
            partId: "a",
            prompt: "Calculate the percentage of incident ultrasound intensity reflected at the muscle–fat boundary.",
            marks: 3,
            targetQuantityKey: "reflectionPercent",
            expectedAnswer: fmt3(rPct, "%"),
            workingSteps: [
              "$Z_1 = 1050 \\times 1540 = 1.617 \\times 10^6\\text{ kg m}^{-2}\\text{ s}^{-1}$; $Z_2 = 950 \\times 1450 = 1.378 \\times 10^6\\text{ kg m}^{-2}\\text{ s}^{-1}$.",
              `$\\frac{I_r}{I_i} = \\left(\\frac{1.617 - 1.378}{1.617 + 1.378}\\right)^2 = ${fmt3(rPct, "%")}$.`,
            ],
          },
          {
            partId: "b",
            prompt: "Hence determine the percentage of incident intensity transmitted into the fat layer.",
            marks: 1,
            dependsOnPartIds: ["a"],
            targetQuantityKey: "transmissionPercent",
            expectedAnswer: fmt3(tPct, "%"),
            workingSteps: [`$100\\% - ${fmt3(rPct, "%")} = ${fmt3(tPct, "%")}$.`],
          },
          {
            partId: "c",
            prompt: "Explain why a damping backing block is needed in the transducer when imaging thin soft-tissue layers.",
            marks: 2,
            targetMode: "qualitative",
            targetQuantityKey: "backingBlockAnchor",
            expectedAnswer: `The backing block ${bak} so successive echoes remain distinct.`,
            workingSteps: [
              "Absorbs backward vibrations so the pulse ends quickly.",
              "Shorter pulse length allows closer boundaries to be resolved without echo overlap.",
            ],
          },
        ],
        markScheme: [
          { code: "M1", criterion: "Computes both $Z_1$ and $Z_2$ via $Z = \\rho c$.", marks: 1, partId: "a" },
          { code: "M1", criterion: "Applies $((Z_2 - Z_1)/(Z_2 + Z_1))^2$.", marks: 1, partId: "a" },
          { code: "A1", criterion: `Correct reflected percentage ${fmt3(rPct, "%")}.`, marks: 1, partId: "a" },
          { code: "A1", criterion: `Correct transmitted percentage ${fmt3(tPct, "%")}.`, marks: 1, partId: "b" },
          { code: "B1", criterion: "States backing block rapidly damps crystal vibrations to create short pulses.", marks: 1, partId: "c" },
          { code: "B1", criterion: "Links short pulse duration to improved axial resolution.", marks: 1, partId: "c" },
        ],
        workedSolution: `(a) Reflected $= ${fmt3(rPct, "%")}$. (b) Transmitted $= ${fmt3(tPct, "%")}$. (c) Backing block ${bak}.`,
      };
    },
    planSummary: "Compute muscle-fat reflection and transmission percentages and explain transducer damping.",
    subpartPlan: ["reflected percentage", "transmitted percentage", "backing block resolution role"],
  });

  pushStructured(ctx, {
    slug: "med-us-str-04",
    conceptId,
    kind,
    domain: "waves",
    subtopicId: sub,
    difficulty: "higher",
    questionStyle: "mixed-exam",
    scenarioSpec: {
      kind,
      mode: "ascan-echo",
      density1KgM3: 1060,
      speed1Ms: 1540,
      density2KgM3: 1060,
      speed2Ms: 1540,
      pulseEchoDelayUs: 60,
      secondEchoDelayUs: 130,
      transducerFreqMHz: 3.5,
      crystalSpeedMs: 4200,
    },
    hiddenQuantities: [
      "crystalThicknessMm",
      "organThicknessMm",
      "ascanVsBscanAnchor",
    ],
    requiredGivens: [
      { name: "transducerFreqMHz", value: 3.5, unit: "MHz", source: "stem" },
      { name: "crystalSpeedMs", value: 4200, unit: "m s⁻¹", source: "stem" },
      { name: "speed2Ms", value: 1540, unit: "m s⁻¹", source: "stem" },
      { name: "pulseEchoDelayUs", value: 60, unit: "μs", source: "either" },
      { name: "secondEchoDelayUs", value: 130, unit: "μs", source: "either" },
    ],
    stem: "An obstetric 3.50 MHz ultrasound probe (crystal wave speed 4200 m s⁻¹) performs an A-scan across a fetal skull ($c = 1540\\text{ m s}^{-1}$), producing echoes at $60\\,\\mu\\text{s}$ and $130\\,\\mu\\text{s}$.",
    build: (q) => {
      const crys = numQ(q, "crystalThicknessMm");
      const diam = numQ(q, "organThicknessMm");
      const ab = strQ(q, "ascanVsBscanAnchor");
      return {
        parts: [
          {
            partId: "a",
            prompt: "Calculate the resonant thickness ($\\lambda / 2$) of the piezoelectric crystal in millimetres.",
            marks: 2,
            targetQuantityKey: "crystalThicknessMm",
            expectedAnswer: fmt3(crys, "mm"),
            workingSteps: [
              `$t = \\frac{c}{2f} = \\frac{4200}{2 \\times 3.50 \\times 10^6} = 6.00 \\times 10^{-4}\\text{ m} = ${fmt3(crys, "mm")}$.`,
            ],
          },
          {
            partId: "b",
            prompt: "Calculate the diameter of the fetal skull from the two A-scan echoes.",
            marks: 2,
            targetQuantityKey: "organThicknessMm",
            expectedAnswer: fmt3(diam, "mm"),
            workingSteps: [
              `$d = \\frac{1540 \\times (130 - 60) \\times 10^{-6}}{2} = ${fmt3(diam, "mm")}$.`,
            ],
          },
          {
            partId: "c",
            prompt: "Contrast how A-scan and B-scan displays present echo information during prenatal examinations.",
            marks: 2,
            targetMode: "qualitative",
            targetQuantityKey: "ascanVsBscanAnchor",
            expectedAnswer: `Clinically, ${ab}.`,
            workingSteps: [
              "A-scan plots echo voltage spikes against time for precise 1D diameter measurement.",
              "B-scan translates echo amplitude into dot brightness across probe angles to render a 2D anatomical image.",
            ],
          },
        ],
        markScheme: [
          { code: "M1", criterion: "Applies $t = \\lambda / 2 = c / (2f)$.", marks: 1, partId: "a" },
          { code: "A1", criterion: `Correct crystal thickness ${fmt3(crys, "mm")}.`, marks: 1, partId: "a" },
          { code: "M1", criterion: "Applies $2d = 1540 \\times 70 \\times 10^{-6}$.", marks: 1, partId: "b" },
          { code: "A1", criterion: `Correct diameter ${fmt3(diam, "mm")}.`, marks: 1, partId: "b" },
          { code: "B1", criterion: "Describes A-scan as 1D amplitude vs time for depth/diameter.", marks: 1, partId: "c" },
          { code: "B1", criterion: "Describes B-scan as brightness-modulated 2D cross-section.", marks: 1, partId: "c" },
        ],
        workedSolution: `(a) Crystal thickness $= ${fmt3(crys, "mm")}$. (b) Diameter $= ${fmt3(diam, "mm")}$. (c) ${ab}.`,
      };
    },
    planSummary: "Combine piezoelectric crystal thickness, A-scan fetal measurement, and A/B-scan comparison.",
    subpartPlan: ["crystal thickness", "A-scan diameter", "A-scan vs B-scan contrast"],
  });

  // 1 Authentic 6-Mark LoR
  pushSixMarkLor(ctx, {
    slug: "med-us-lor-01",
    conceptId,
    kind,
    domain: "waves",
    subtopicId: sub,
    scenarioSpec: {
      kind,
      mode: "ascan-echo",
      density1KgM3: 1060,
      speed1Ms: 1540,
      density2KgM3: 1080,
      speed2Ms: 1580,
      pulseEchoDelayUs: 40,
      secondEchoDelayUs: 105,
    },
    targetQuantityKey: "lorPiezoAnchor",
    stem: "Medical ultrasound transducers use a single piezoelectric crystal both to generate high-frequency acoustic pulses and to detect faint returning echoes from tissue boundaries.",
    prompt:
      "Explain in detail how a piezoelectric transducer transmits and detects ultrasound pulses, including the roles of resonant crystal thickness, the damping backing material, and coupling gel, and explain why echoes from deeper boundaries have smaller amplitudes.",
    expectedAnswer: (anchor) =>
      `In a medical transducer, ${anchor}. During transmission, a brief burst of alternating potential difference at the crystal's natural frequency (matching thickness $\\lambda / 2$) causes the piezoelectric lattice to expand and contract rapidly, launching a longitudinal ultrasound pulse. A heavily absorbing backing block damps the crystal vibrations immediately after the drive pulse ceases, producing a very short pulse duration so echoes from closely spaced interfaces do not overlap (high axial resolution). Coupling gel between the probe face and skin displaces air and closely matches soft-tissue acoustic impedance, preventing nearly total reflection at the skin. Between pulses, the transducer acts as a receiver: returning echoes partially reflected at internal impedance boundaries mechanically stress the crystal, generating small alternating potential differences via the inverse piezoelectric effect that are amplified and plotted against time (using $2d = c\\Delta t$). Echoes from deeper boundaries have smaller amplitudes due to exponential attenuation/absorption in tissue, beam spreading, and partial reflection losses at earlier boundaries, so time-gain compensation is applied.`,
    workingSteps: [
      "Describe transmission: alternating pd across piezoelectric crystal causes resonant vibration (thickness $\\lambda / 2$).",
      "Explain damping backing material shortening pulse length for good axial resolution.",
      "Explain coupling gel matching acoustic impedance to eliminate air-skin reflection.",
      "Describe reception: returning echoes compress/stretch crystal, inducing alternating voltage spikes.",
      "Link echo arrival time to depth via $2d = c\\Delta t$.",
      "Explain smaller echo amplitude from deeper boundaries (attenuation, spreading, earlier reflections) and time-gain amplification.",
    ],
    criteriaSix: [
      "Explains alternating pd causes the piezoelectric crystal to vibrate and emit an ultrasound pulse.",
      "Notes crystal thickness equals $\\lambda / 2$ for resonance to maximise vibration amplitude.",
      "Explains the damping backing block stops crystal ringing quickly, producing short pulses for improved axial resolution.",
      "Explains coupling gel displaces air and matches acoustic impedance of skin to allow transmission.",
      "Explains detection: returning echoes deform the crystal, generating a measurable potential difference across its faces.",
      "Explains why deeper echoes are weaker (tissue attenuation, beam spreading, partial reflections) requiring gain compensation.",
    ],
    workedSolution: (anchor) =>
      `Level 3 synthesis: ${anchor}; covers $\\lambda/2$ resonance, damping backing for short pulses, gel impedance matching, and attenuation of deeper echoes.`,
    planSummary: "Six-mark level-of-response explanation of piezoelectric ultrasound transmit and receive operation.",
  });
}

function populateMedXrayAttenuation(ctx: BuilderContext): void {
  const kind = "al-opt-med-xray-attenuation";
  const conceptId = "radioactive-decay-half-life";
  const sub = "alevel-3-10-medical-physics" as const;

  // 4 Calc MCQs
  pushCalcMcq(ctx, {
    slug: "med-xr-calc-01",
    conceptId,
    kind,
    domain: "quantum-nuclear",
    subtopicId: sub,
    difficulty: "foundation",
    scenarioSpec: {
      kind,
      mode: "spectrum",
      tubeVoltageKv: 80,
      linearAttenCoeffPerM: 40,
      thicknessMm: 15,
      densityKgM3: 1850,
    },
    hiddenQuantities: ["minWavelengthPm"],
    requiredGivens: [
      { name: "tubeVoltageKv", value: 80, unit: "kV", source: "stem" },
    ],
    targetQuantityKey: "minWavelengthPm",
    unit: "pm",
    stem: "A diagnostic X-ray tube operates at an anode potential difference of 80.0 kV. Taking $h = 6.63 \\times 10^{-34}\\text{ J s}$, $c = 3.00 \\times 10^8\\text{ m s}^{-1}$, and $e = 1.60 \\times 10^{-19}\\text{ C}$, what is the minimum wavelength emitted in the continuous X-ray spectrum?",
    distractors: (q) => {
      const pm = numQ(q, "minWavelengthPm");
      return [
        { value: pm * 1000, rationale: "Forgets to convert kilovolts to volts." },
        { value: pm * 2, rationale: "Halves the maximum electron kinetic energy erroneously." },
        { value: pm * 0.5, rationale: "Doubles the denominator voltage." },
      ];
    },
    workedSolution: (_q, ans) =>
      `$\\lambda_{\\min} = \\frac{hc}{eV} = \\frac{6.63 \\times 10^{-34} \\times 3.00 \\times 10^8}{1.60 \\times 10^{-19} \\times 8.00 \\times 10^4} = 1.55 \\times 10^{-11}\\text{ m} = ${ans}$.`,
    planSummary: "Compute minimum bremsstrahlung X-ray wavelength from anode voltage.",
  });

  pushCalcMcq(ctx, {
    slug: "med-xr-calc-02",
    conceptId,
    kind,
    domain: "quantum-nuclear",
    subtopicId: sub,
    difficulty: "foundation",
    scenarioSpec: {
      kind,
      mode: "attenuation",
      tubeVoltageKv: 90,
      linearAttenCoeffPerM: 60,
      thicknessMm: 25,
      densityKgM3: 1900,
    },
    hiddenQuantities: ["transmissionPercent", "transmissionFraction"],
    requiredGivens: [
      { name: "linearAttenCoeffPerM", value: 60, unit: "m⁻¹", source: "stem" },
      { name: "thicknessMm", value: 25, unit: "mm", source: "either" },
    ],
    targetQuantityKey: "transmissionPercent",
    unit: "%",
    stem: "A narrow monoenergetic X-ray beam passes through a 25.0 mm thickness of bone whose linear attenuation coefficient is $\\mu = 60.0\\text{ m}^{-1}$. What percentage of the incident X-ray intensity is transmitted?",
    distractors: (q) => {
      const tPct = numQ(q, "transmissionPercent");
      return [
        { value: 100 - tPct, rationale: "Calculates the absorbed percentage $100(1 - e^{-\\mu x})$ instead of the transmitted percentage." },
        { value: Math.exp(-60 * 0.025 / 2) * 100, rationale: "Halves the exponent erroneously." },
        { value: 50.0, rationale: "Assumes 25 mm equals one half-value thickness." },
      ];
    },
    workedSolution: (_q, ans) =>
      `$\\frac{I}{I_0} = e^{-\\mu x} = e^{-60.0 \\times 0.0250} = e^{-1.50} = 0.223 = ${ans}$.`,
    planSummary: "Calculate percentage X-ray intensity transmitted through a bone layer.",
  });

  pushCalcMcq(ctx, {
    slug: "med-xr-calc-03",
    conceptId,
    kind,
    domain: "quantum-nuclear",
    subtopicId: sub,
    difficulty: "standard",
    scenarioSpec: {
      kind,
      mode: "attenuation",
      tubeVoltageKv: 100,
      linearAttenCoeffPerM: 2200,
      thicknessMm: 1.0,
      densityKgM3: 11340,
    },
    hiddenQuantities: ["halfValueThicknessMm", "massAttenCoeffM2Kg"],
    requiredGivens: [
      { name: "linearAttenCoeffPerM", value: 2200, unit: "m⁻¹", source: "stem" },
    ],
    targetQuantityKey: "halfValueThicknessMm",
    unit: "mm",
    stem: "Lead apron shielding has a linear attenuation coefficient of $2200\\text{ m}^{-1}$ for diagnostic X-rays. What is the half-value thickness $x_{1/2}$ of lead for this beam?",
    distractors: (q) => {
      const hvl = numQ(q, "halfValueThicknessMm");
      return [
        { value: (1 / 2200) * 1000, rationale: "Uses 1 / mu instead of ln(2) / mu." },
        { value: (0.5 / 2200) * 1000, rationale: "Uses 0.5 / mu instead of ln(2) / mu." },
        { value: hvl * 2, rationale: "Doubles the half-value thickness." },
      ];
    },
    workedSolution: (_q, ans) =>
      `$x_{1/2} = \\frac{\\ln 2}{\\mu} = \\frac{0.693}{2200} = 3.15 \\times 10^{-4}\\text{ m} = ${ans}$.`,
    planSummary: "Compute X-ray half-value thickness of lead shielding.",
  });

  pushCalcMcq(ctx, {
    slug: "med-xr-calc-04",
    conceptId,
    kind,
    domain: "quantum-nuclear",
    subtopicId: sub,
    difficulty: "standard",
    scenarioSpec: {
      kind,
      mode: "attenuation",
      tubeVoltageKv: 70,
      linearAttenCoeffPerM: 54,
      thicknessMm: 20,
      densityKgM3: 1800,
    },
    hiddenQuantities: ["massAttenCoeffM2Kg"],
    requiredGivens: [
      { name: "linearAttenCoeffPerM", value: 54, unit: "m⁻¹", source: "stem" },
      { name: "densityKgM3", value: 1800, unit: "kg m⁻³", source: "stem" },
    ],
    targetQuantityKey: "massAttenCoeffM2Kg",
    unit: "m² kg⁻¹",
    stem: "A bone phantom of density 1800 kg m⁻³ exhibits a linear attenuation coefficient of 54.0 m⁻¹ at 70 kV. What is its mass attenuation coefficient $\\mu_m$?",
    distractors: () => [
      { value: 54 * 1800, rationale: "Multiplies mu by density instead of dividing mu / rho." },
      { value: 1800 / 54, rationale: "Inverts the definition as rho / mu." },
      { value: 0.015, rationale: "Halves the ratio mu / rho erroneously." },
    ],
    workedSolution: (_q, ans) =>
      `Mass attenuation coefficient is $\\mu_m = \\frac{\\mu}{\\rho} = \\frac{54.0}{1800} = ${ans}$.`,
    planSummary: "Compute X-ray mass attenuation coefficient mu_m = mu / rho.",
  });

  // 3 Pure Qual MCQs
  pushQualMcq(ctx, {
    slug: "med-xr-qual-01",
    conceptId,
    kind,
    domain: "quantum-nuclear",
    subtopicId: sub,
    difficulty: "foundation",
    scenarioSpec: {
      kind,
      mode: "spectrum",
      tubeVoltageKv: 85,
      linearAttenCoeffPerM: 45,
      thicknessMm: 15,
      densityKgM3: 1850,
    },
    targetQuantityKey: "alFilterAnchor",
    stem: "Why is a thin sheet of aluminium placed directly across the exit window of a clinical diagnostic X-ray tube?",
    correctOption: (a) => `The ${a}.`,
    distractors: [
      {
        text: "The aluminium filter eliminates high-energy hard X-rays so bones appear transparent.",
        rationale: "Hard X-rays penetrate the body to expose the detector; soft low-energy photons are filtered out.",
      },
      {
        text: "The aluminium filter accelerates electrons further to shorten the minimum wavelength.",
        rationale: "Aluminium sits outside the evacuated tube and interacts only with emitted X-ray photons.",
      },
      {
        text: "The aluminium filter shifts tungsten characteristic K-lines into the visible spectrum.",
        rationale: "Filtering attenuates low-energy photons without changing photon wavelengths.",
      },
    ],
    workedSolution: (a) =>
      `In clinical radiology, the ${a}.`,
    planSummary: "Explain patient-dose safety role of the aluminium X-ray filter.",
  });

  pushQualMcq(ctx, {
    slug: "med-xr-qual-02",
    conceptId,
    kind,
    domain: "quantum-nuclear",
    subtopicId: sub,
    difficulty: "standard",
    scenarioSpec: {
      kind,
      mode: "spectrum",
      tubeVoltageKv: 90,
      linearAttenCoeffPerM: 45,
      thicknessMm: 15,
      densityKgM3: 1850,
    },
    targetQuantityKey: "tubeShiftAnchor",
    stem: "A radiographer increases the accelerating anode potential difference of a tungsten X-ray tube while keeping the filament current unchanged. How does the emitted X-ray intensity-versus-wavelength spectrum change?",
    correctOption: (a) => `Raising the tube voltage causes ${a}.`,
    distractors: [
      {
        text: "Increasing anode voltage shifts both minimum wavelength and tungsten K-line wavelengths shorter.",
        rationale: "Characteristic K-line wavelengths depend solely on tungsten atomic energy levels, not tube voltage.",
      },
      {
        text: "Increasing anode voltage keeps minimum wavelength unchanged while raising only the peak height.",
        rationale: "Keeping cutoff fixed while raising height occurs when increasing filament current, not anode voltage.",
      },
      {
        text: "Increasing anode voltage lengthens minimum wavelength because electrons lose more heat.",
        rationale: "Higher anode voltage gives greater maximum photon energy and therefore a shorter cutoff wavelength.",
      },
    ],
    workedSolution: (a) =>
      `Because $\\lambda_{\\min} = hc/(eV)$ and K-lines are fixed by atomic shell gaps, ${a}.`,
    planSummary: "Predict X-ray emission spectrum changes when anode voltage increases.",
  });

  pushQualMcq(ctx, {
    slug: "med-xr-qual-03",
    conceptId,
    kind,
    domain: "quantum-nuclear",
    subtopicId: sub,
    difficulty: "foundation",
    scenarioSpec: {
      kind,
      mode: "attenuation",
      tubeVoltageKv: 75,
      linearAttenCoeffPerM: 55,
      thicknessMm: 20,
      densityKgM3: 1800,
    },
    targetQuantityKey: "bariumContrastAnchor",
    stem: "Before an abdominal X-ray radiograph of the digestive tract, a patient swallows a barium sulfate suspension. Why does this greatly improve image contrast?",
    correctOption: (a) => `Swallowing barium works because ${a}.`,
    distractors: [
      {
        text: "Barium emits beta particles that directly expose the photographic X-ray detector.",
        rationale: "Barium sulfate is a stable non-radioactive contrast absorber, not a beta emitter.",
      },
      {
        text: "Barium lowers the linear attenuation coefficient of stomach lining below that of air.",
        rationale: "Barium strongly raises linear attenuation via photoelectric absorption.",
      },
      {
        text: "Barium converts diagnostic X-rays into ultrasound waves inside the intestine.",
        rationale: "Contrast media attenuate X-rays strongly by the photoelectric effect ($\\propto Z^3$).",
      },
    ],
    workedSolution: (a) =>
      `Photoelectric absorption scales strongly with atomic number ($\\propto Z^3$), so ${a}.`,
    planSummary: "Explain high-Z photoelectric basis of barium sulfate X-ray contrast media.",
  });

  // 4 Multi-part Structured
  pushStructured(ctx, {
    slug: "med-xr-str-01",
    conceptId,
    kind,
    domain: "quantum-nuclear",
    subtopicId: sub,
    difficulty: "standard",
    questionStyle: "mixed-exam",
    scenarioSpec: {
      kind,
      mode: "spectrum",
      tubeVoltageKv: 95,
      linearAttenCoeffPerM: 48,
      thicknessMm: 20,
      densityKgM3: 1920,
    },
    hiddenQuantities: [
      "minWavelengthPm",
      "halfValueThicknessMm",
      "alFilterAnchor",
    ],
    requiredGivens: [
      { name: "tubeVoltageKv", value: 95, unit: "kV", source: "stem" },
      { name: "linearAttenCoeffPerM", value: 48, unit: "m⁻¹", source: "stem" },
    ],
    stem: "A rotating-anode tungsten X-ray tube operates at 95.0 kV. The emitted beam is directed at bone having a linear attenuation coefficient of 48.0 m⁻¹. Take $h = 6.63 \\times 10^{-34}\\text{ J s}$, $c = 3.00 \\times 10^8\\text{ m s}^{-1}$, and $e = 1.60 \\times 10^{-19}\\text{ C}$.",
    build: (q) => {
      const lam = numQ(q, "minWavelengthPm");
      const hvl = numQ(q, "halfValueThicknessMm");
      const al = strQ(q, "alFilterAnchor");
      return {
        parts: [
          {
            partId: "a",
            prompt: "Calculate the shortest wavelength of X-ray photons emitted by this tube in picometres.",
            marks: 2,
            targetQuantityKey: "minWavelengthPm",
            expectedAnswer: fmt3(lam, "pm"),
            workingSteps: [
              `$\\lambda_{\\min} = \\frac{6.63 \\times 10^{-34} \\times 3.00 \\times 10^8}{1.60 \\times 10^{-19} \\times 9.50 \\times 10^4} = ${fmt3(lam, "pm")}$.`,
            ],
          },
          {
            partId: "b",
            prompt: "Calculate the half-value thickness of the bone in millimetres.",
            marks: 2,
            targetQuantityKey: "halfValueThicknessMm",
            expectedAnswer: fmt3(hvl, "mm"),
            workingSteps: [`$x_{1/2} = \\frac{\\ln 2}{48.0} = ${fmt3(hvl, "mm")}$.`],
          },
          {
            partId: "c",
            prompt: "Explain why an aluminium filter is fitted at the tube exit window.",
            marks: 2,
            targetMode: "qualitative",
            targetQuantityKey: "alFilterAnchor",
            expectedAnswer: `The ${al}.`,
            workingSteps: [
              "Low-energy (long-wavelength) X-rays cannot penetrate the body to expose the detector.",
              "Removing them with aluminium reduces unnecessary skin ionisation dose.",
            ],
          },
        ],
        markScheme: [
          { code: "M1", criterion: "Applies $\\lambda_{\\min} = hc / (eV)$ with $V = 9.50 \\times 10^4\\text{ V}$.", marks: 1, partId: "a" },
          { code: "A1", criterion: `Correct minimum wavelength ${fmt3(lam, "pm")}.`, marks: 1, partId: "a" },
          { code: "M1", criterion: "Uses $x_{1/2} = \\ln 2 / 48.0$.", marks: 1, partId: "b" },
          { code: "A1", criterion: `Correct half-value thickness ${fmt3(hvl, "mm")}.`, marks: 1, partId: "b" },
          { code: "B1", criterion: "States aluminium absorbs low-energy / soft X-ray photons.", marks: 1, partId: "c" },
          { code: "B1", criterion: "Explains these soft photons add skin radiation dose without contributing to the image.", marks: 1, partId: "c" },
        ],
        workedSolution: `(a) $\\lambda_{\\min} = ${fmt3(lam, "pm")}$. (b) $x_{1/2} = ${fmt3(hvl, "mm")}$. (c) ${al}.`,
      };
    },
    planSummary: "Compute X-ray cutoff wavelength and bone HVL and explain aluminium filtration.",
    subpartPlan: ["minimum wavelength", "half-value thickness", "aluminium filter rationale"],
  });

  pushStructured(ctx, {
    slug: "med-xr-str-02",
    conceptId,
    kind,
    domain: "quantum-nuclear",
    subtopicId: sub,
    difficulty: "standard",
    questionStyle: "calculation",
    scenarioSpec: {
      kind,
      mode: "attenuation",
      tubeVoltageKv: 120,
      linearAttenCoeffPerM: 2500,
      thicknessMm: 1.5,
      densityKgM3: 11340,
    },
    hiddenQuantities: [
      "massAttenCoeffM2Kg",
      "transmissionPercent",
      "thicknessForTenPercentMm",
    ],
    requiredGivens: [
      { name: "linearAttenCoeffPerM", value: 2500, unit: "m⁻¹", source: "stem" },
      { name: "thicknessMm", value: 1.5, unit: "mm", source: "either" },
      { name: "densityKgM3", value: 11340, unit: "kg m⁻³", source: "stem" },
    ],
    stem: "A lead shielding screen of density 11340 kg m⁻³ and thickness 1.50 mm attenuates a 120 kV X-ray beam with a linear attenuation coefficient of 2500 m⁻¹.",
    build: (q) => {
      const mm = numQ(q, "massAttenCoeffM2Kg");
      const tPct = numQ(q, "transmissionPercent");
      const x10 = numQ(q, "thicknessForTenPercentMm");
      return {
        parts: [
          {
            partId: "a",
            prompt: "Calculate the mass attenuation coefficient of lead at 120 kV.",
            marks: 2,
            targetQuantityKey: "massAttenCoeffM2Kg",
            expectedAnswer: fmt3(mm, "m² kg⁻¹"),
            workingSteps: [`$\\mu_m = \\frac{2500}{11340} = ${fmt3(mm, "m² kg⁻¹")}$.`],
          },
          {
            partId: "b",
            prompt: "Calculate the percentage of incident intensity transmitted through the 1.50 mm lead sheet.",
            marks: 2,
            targetQuantityKey: "transmissionPercent",
            expectedAnswer: fmt3(tPct, "%"),
            workingSteps: [`$100 \\times e^{-2500 \\times 0.00150} = ${fmt3(tPct, "%")}$.`],
          },
          {
            partId: "c",
            prompt: "Calculate the thickness of lead in millimetres required to reduce the transmitted intensity to exactly 10.0% of $I_0$.",
            marks: 2,
            targetQuantityKey: "thicknessForTenPercentMm",
            expectedAnswer: fmt3(x10, "mm"),
            workingSteps: [
              "$0.100 = e^{-2500 x} \\Rightarrow x = \\frac{\\ln 10}{2500} = 9.21 \\times 10^{-4}\\text{ m} = 0.921\\text{ mm}$.",
            ],
          },
        ],
        markScheme: [
          { code: "M1", criterion: "Uses $\\mu_m = \\mu / \\rho$.", marks: 1, partId: "a" },
          { code: "A1", criterion: `Correct mass attenuation coefficient ${fmt3(mm, "m² kg⁻¹")}.`, marks: 1, partId: "a" },
          { code: "M1", criterion: "Applies $I/I_0 = e^{-2500 \\times 0.00150}$.", marks: 1, partId: "b" },
          { code: "A1", criterion: `Correct transmitted percentage ${fmt3(tPct, "%")}.`, marks: 1, partId: "b" },
          { code: "M1", criterion: "Solves $x = \\ln(10) / 2500$.", marks: 1, partId: "c" },
          { code: "A1", criterion: `Correct tenth-value thickness ${fmt3(x10, "mm")}.`, marks: 1, partId: "c" },
        ],
        workedSolution: `(a) $\\mu_m = ${fmt3(mm, "m² kg⁻¹")}$. (b) Transmitted $= ${fmt3(tPct, "%")}$. (c) $x = ${fmt3(x10, "mm")}$.`,
      };
    },
    planSummary: "Evaluate lead shielding mass attenuation, transmission, and tenth-value thickness.",
    subpartPlan: ["mass attenuation coefficient", "transmitted percentage", "tenth-value thickness"],
  });

  pushStructured(ctx, {
    slug: "med-xr-str-03",
    conceptId,
    kind,
    domain: "quantum-nuclear",
    subtopicId: sub,
    difficulty: "standard",
    questionStyle: "mixed-exam",
    scenarioSpec: {
      kind,
      mode: "attenuation",
      tubeVoltageKv: 65,
      linearAttenCoeffPerM: 35,
      thicknessMm: 40,
      densityKgM3: 1050,
    },
    hiddenQuantities: [
      "absorbedPercent",
      "halfValueThicknessMm",
      "bariumContrastAnchor",
    ],
    requiredGivens: [
      { name: "linearAttenCoeffPerM", value: 35, unit: "m⁻¹", source: "stem" },
      { name: "thicknessMm", value: 40, unit: "mm", source: "either" },
    ],
    stem: "A beam of 65 kV X-rays traverses 40.0 mm of abdominal soft tissue whose linear attenuation coefficient is 35.0 m⁻¹.",
    build: (q) => {
      const abs = numQ(q, "absorbedPercent");
      const hvl = numQ(q, "halfValueThicknessMm");
      const ba = strQ(q, "bariumContrastAnchor");
      return {
        parts: [
          {
            partId: "a",
            prompt: "Calculate the half-value thickness of this soft tissue in millimetres.",
            marks: 2,
            targetQuantityKey: "halfValueThicknessMm",
            expectedAnswer: fmt3(hvl, "mm"),
            workingSteps: [`$x_{1/2} = \\frac{\\ln 2}{35.0} = ${fmt3(hvl, "mm")}$.`],
          },
          {
            partId: "b",
            prompt: "Calculate the percentage of incident X-ray intensity absorbed by the 40.0 mm tissue slab.",
            marks: 2,
            targetQuantityKey: "absorbedPercent",
            expectedAnswer: fmt3(abs, "%"),
            workingSteps: [
              `Transmitted fraction $= e^{-35.0 \\times 0.0400} = 0.247$; absorbed $= 100(1 - 0.247) = ${fmt3(abs, "%")}$.`,
            ],
          },
          {
            partId: "c",
            prompt: "Explain why adjacent soft-tissue organs show poor natural contrast on a plain radiograph and how a barium meal resolves this.",
            marks: 2,
            targetMode: "qualitative",
            targetQuantityKey: "bariumContrastAnchor",
            expectedAnswer: `Soft tissues have very similar atomic numbers and $\\mu$ values, whereas ${ba}.`,
            workingSteps: [
              "Similar densities and atomic numbers yield nearly identical X-ray attenuation.",
              "High-$Z$ barium strongly boosts photoelectric absorption along the gut lining.",
            ],
          },
        ],
        markScheme: [
          { code: "M1", criterion: "Applies $x_{1/2} = \\ln 2 / 35.0$.", marks: 1, partId: "a" },
          { code: "A1", criterion: `Correct HVL ${fmt3(hvl, "mm")}.`, marks: 1, partId: "a" },
          { code: "M1", criterion: "Computes $1 - e^{-35.0 \\times 0.0400}$.", marks: 1, partId: "b" },
          { code: "A1", criterion: `Correct absorbed percentage ${fmt3(abs, "%")}.`, marks: 1, partId: "b" },
          { code: "B1", criterion: "Explains soft tissues have similar densities / atomic numbers and hence similar $\\mu$.", marks: 1, partId: "c" },
          { code: "B1", criterion: "Explains high-$Z$ barium increases photoelectric absorption to outline the tract.", marks: 1, partId: "c" },
        ],
        workedSolution: `(a) $x_{1/2} = ${fmt3(hvl, "mm")}$. (b) Absorbed $= ${fmt3(abs, "%")}$. (c) ${ba}.`,
      };
    },
    planSummary: "Compute soft-tissue HVL and absorbed X-ray percentage and explain barium contrast.",
    subpartPlan: ["soft-tissue HVL", "absorbed percentage", "barium contrast explanation"],
  });

  pushStructured(ctx, {
    slug: "med-xr-str-04",
    conceptId,
    kind,
    domain: "quantum-nuclear",
    subtopicId: sub,
    difficulty: "higher",
    questionStyle: "mixed-exam",
    scenarioSpec: {
      kind,
      mode: "spectrum",
      tubeVoltageKv: 110,
      linearAttenCoeffPerM: 38,
      thicknessMm: 30,
      densityKgM3: 1850,
    },
    hiddenQuantities: ["maxPhotonEnergyJ", "minWavelengthPm", "tubeShiftAnchor"],
    requiredGivens: [
      { name: "tubeVoltageKv", value: 110, unit: "kV", source: "stem" },
    ],
    stem: "A hospital CT scanner tube accelerates electrons across 110 kV onto a rotating tungsten target embedded in a copper block. Take $h = 6.63 \\times 10^{-34}\\text{ J s}$, $c = 3.00 \\times 10^8\\text{ m s}^{-1}$, and $e = 1.60 \\times 10^{-19}\\text{ C}$.",
    build: (q) => {
      const eJ = numQ(q, "maxPhotonEnergyJ");
      const lam = numQ(q, "minWavelengthPm");
      const shift = strQ(q, "tubeShiftAnchor");
      return {
        parts: [
          {
            partId: "a",
            prompt: "Calculate the maximum kinetic energy in joules of an electron striking the tungsten anode.",
            marks: 2,
            targetQuantityKey: "maxPhotonEnergyJ",
            expectedAnswer: fmt3(eJ, "J"),
            workingSteps: [`$E_{\\max} = eV = 1.60 \\times 10^{-19} \\times 1.10 \\times 10^5 = ${fmt3(eJ, "J")}$.`],
          },
          {
            partId: "b",
            prompt: "Calculate the corresponding minimum X-ray wavelength in picometres.",
            marks: 2,
            dependsOnPartIds: ["a"],
            targetQuantityKey: "minWavelengthPm",
            expectedAnswer: fmt3(lam, "pm"),
            workingSteps: [`$\\lambda_{\\min} = \\frac{hc}{E_{\\max}} = ${fmt3(lam, "pm")}$.`],
          },
          {
            partId: "c",
            prompt: "State how the X-ray emission spectrum changes if the anode voltage is raised from 110 kV to 130 kV at constant filament current.",
            marks: 2,
            targetMode: "qualitative",
            targetQuantityKey: "tubeShiftAnchor",
            expectedAnswer: `Raising the potential difference means ${shift}.`,
            workingSteps: [
              "Minimum wavelength decreases ($\lambda_{\\min} \\propto 1/V$) and overall intensity rises.",
              "Characteristic tungsten K-line wavelengths remain strictly unchanged.",
            ],
          },
        ],
        markScheme: [
          { code: "M1", criterion: "Uses $E = eV = 1.60 \\times 10^{-19} \\times 1.10 \\times 10^5$.", marks: 1, partId: "a" },
          { code: "A1", criterion: `Correct energy ${fmt3(eJ, "J")}.`, marks: 1, partId: "a" },
          { code: "M1", criterion: "Evaluates $\\lambda_{\\min} = hc / E_{\\max}$.", marks: 1, partId: "b" },
          { code: "A1", criterion: `Correct wavelength ${fmt3(lam, "pm")}.`, marks: 1, partId: "b" },
          { code: "B1", criterion: "States $\\lambda_{\\min}$ shifts shorter and continuum intensity increases.", marks: 1, partId: "c" },
          { code: "B1", criterion: "States characteristic K-line wavelengths remain unchanged.", marks: 1, partId: "c" },
        ],
        workedSolution: `(a) $E_{\\max} = ${fmt3(eJ, "J")}$. (b) $\\lambda_{\\min} = ${fmt3(lam, "pm")}$. (c) ${shift}.`,
      };
    },
    planSummary: "Compute CT electron energy and X-ray cutoff and predict anode-voltage spectrum shift.",
    subpartPlan: ["maximum electron energy", "minimum X-ray wavelength", "spectrum shift at higher kV"],
  });

  // 1 Authentic 6-Mark LoR
  pushSixMarkLor(ctx, {
    slug: "med-xr-lor-01",
    conceptId,
    kind,
    domain: "quantum-nuclear",
    subtopicId: sub,
    scenarioSpec: {
      kind,
      mode: "spectrum",
      tubeVoltageKv: 90,
      linearAttenCoeffPerM: 45,
      thicknessMm: 20,
      densityKgM3: 1850,
    },
    targetQuantityKey: "lorXrayProductionAnchor",
    stem: "The intensity-versus-wavelength graph from a tungsten X-ray tube consists of a smooth continuous curve with a sharp short-wavelength cutoff overlaid by discrete narrow spikes.",
    prompt:
      "Explain the physical origins of both the continuous spectrum (including its sharp short-wavelength limit) and the discrete characteristic peaks, describe how anode heat is managed, and explain how increasing filament current differs from increasing anode potential difference.",
    expectedAnswer: (anchor) =>
      `Inside the evacuated X-ray tube, thermionically emitted electrons are accelerated across a high anode potential difference onto a tungsten target, where ${anchor}. Most electrons undergo varying decelerations in the electric fields of tungsten nuclei, radiating a continuous range of braking (bremsstrahlung) photon energies. The sharp short-wavelength cutoff $\\lambda_{\\min} = hc/(eV)$ occurs when an electron converts 100% of its kinetic energy $eV$ into a single X-ray photon. Discrete $K_\\alpha$ and $K_\\beta$ spikes arise when incident electrons knock inner K-shell electrons out of tungsten atoms; outer L- or M-shell electrons drop to fill the vacancy, emitting photons of fixed energy equal to the discrete shell energy difference. Because roughly 99% of electron kinetic energy becomes thermal energy, tungsten (high melting point) is mounted on a spinning disc embedded in a high-conductivity copper block with cooling oil. Increasing filament current emits more electrons per second, raising intensity at all wavelengths without shifting $\\lambda_{\\min}$, whereas raising anode voltage both increases overall intensity and shifts $\\lambda_{\\min}$ shorter while leaving characteristic K-line wavelengths fixed.`,
    workingSteps: [
      "Explain bremsstrahlung continuum from variable electron deceleration near tungsten nuclei.",
      "Derive sharp short-wavelength limit $\\lambda_{\\min} = hc/(eV)$ from complete conversion of electron KE.",
      "Explain characteristic K-lines from inner-shell vacancy ionisation and outer-to-inner atomic transitions.",
      "Explain thermal management (~99% heat): rotating tungsten anode in thermally conducting copper block.",
      "State effect of higher filament current: greater electron flux raises intensity with unchanged $\\lambda_{\\min}$.",
      "State effect of higher anode voltage: shorter $\\lambda_{\\min}$, higher intensity, fixed K-line wavelengths.",
    ],
    criteriaSix: [
      "Explains continuous bremsstrahlung spectrum arises from electrons decelerating by varying amounts near target nuclei.",
      "Explains sharp cutoff $\\lambda_{\\min} = hc/(eV)$ occurs when all kinetic energy of an electron becomes a single photon.",
      "Explains characteristic spikes come from inner-shell vacancies filled by outer-shell electrons emitting fixed energy differences.",
      "Explains ~99% of energy becomes heat, managed by a rotating high-melting-point tungsten anode in copper/oil cooling.",
      "Correctly states increasing filament current increases intensity across the spectrum without altering $\\lambda_{\\min}$.",
      "Correctly states increasing anode voltage shortens $\\lambda_{\\min}$ and increases intensity while keeping K-line wavelengths fixed.",
    ],
    workedSolution: (anchor) =>
      `Level 3 synthesis: ${anchor}; covers cutoff $hc/(eV)$, rotating tungsten-copper heat dissipation, and filament-current vs anode-voltage spectrum shifts.`,
    planSummary: "Six-mark level-of-response explanation of continuous and characteristic X-ray production.",
  });
}

function populateMedNuclearImaging(ctx: BuilderContext): void {
  const kind = "al-opt-med-nuclear-imaging";
  const conceptId = "radioactive-decay-half-life";
  const sub = "alevel-3-10-medical-physics" as const;

  // 4 Calc MCQs
  pushCalcMcq(ctx, {
    slug: "med-nuc-calc-01",
    conceptId,
    kind,
    domain: "quantum-nuclear",
    subtopicId: sub,
    difficulty: "foundation",
    scenarioSpec: {
      kind,
      mode: "gamma-camera",
      physicalHalfLifeHours: 6.0,
      biologicalHalfLifeHours: 12.0,
      elapsedHours: 4.0,
      initialActivityMBq: 400,
    },
    hiddenQuantities: ["effectiveHalfLifeHours"],
    requiredGivens: [
      { name: "physicalHalfLifeHours", value: 6.0, unit: "h", source: "stem" },
      { name: "biologicalHalfLifeHours", value: 12.0, unit: "h", source: "stem" },
    ],
    targetQuantityKey: "effectiveHalfLifeHours",
    unit: "h",
    stem: "A technetium-99m medical tracer has a physical half-life of 6.00 h and a biological half-life of 12.0 h inside a patient's kidneys. Calculate the effective half-life $T_E$ of the tracer in the patient.",
    distractors: () => [
      { value: 18.0, rationale: "Adds physical and biological half-lives directly instead of adding their reciprocals." },
      { value: 9.0, rationale: "Takes the arithmetic mean (6 + 12) / 2 instead of harmonic combination." },
      { value: 0.25, rationale: "Forgets to invert 1 / T_E = 0.25 h^-1 at the final step." },
    ],
    workedSolution: (_q, ans) =>
      `Using $\\frac{1}{T_E} = \\frac{1}{T_P} + \\frac{1}{T_B} = \\frac{1}{6.00} + \\frac{1}{12.0} = \\frac{3}{12.0} = 0.250\\text{ h}^{-1}$, hence $T_E = ${ans}$.`,
    planSummary: "Calculate effective half-life from physical and biological half-lives.",
  });

  pushCalcMcq(ctx, {
    slug: "med-nuc-calc-02",
    conceptId,
    kind,
    domain: "quantum-nuclear",
    subtopicId: sub,
    difficulty: "standard",
    scenarioSpec: {
      kind,
      mode: "gamma-camera",
      physicalHalfLifeHours: 6.0,
      biologicalHalfLifeHours: 6.0,
      elapsedHours: 9.0,
      initialActivityMBq: 640,
    },
    hiddenQuantities: ["remainingActivityMBq", "effectiveHalfLifeHours"],
    requiredGivens: [
      { name: "physicalHalfLifeHours", value: 6.0, unit: "h", source: "stem" },
      { name: "biologicalHalfLifeHours", value: 6.0, unit: "h", source: "stem" },
      { name: "elapsedHours", value: 9.0, unit: "h", source: "stem" },
      { name: "initialActivityMBq", value: 640, unit: "MBq", source: "stem" },
    ],
    targetQuantityKey: "remainingActivityMBq",
    unit: "MBq",
    stem: "A patient receives a Tc-99m radiopharmaceutical with initial activity 640 MBq. Both its physical half-life and biological half-life are 6.00 h. What activity remains inside the patient after 9.00 h?",
    distractors: () => [
      { value: 226, rationale: "Uses only the 6.0 h physical half-life and ignores biological excretion." },
      { value: 160, rationale: "Evaluates two effective half-lives instead of three (9.0 / 3.0 = 3)." },
      { value: 40.0, rationale: "Evaluates four effective half-lives erroneously." },
    ],
    workedSolution: (_q, ans) =>
      `$\\frac{1}{T_E} = \\frac{1}{6.00} + \\frac{1}{6.00} \\Rightarrow T_E = 3.00\\text{ h}$. After $9.00\\text{ h}$ ($3$ effective half-lives), $A = 640 \\times \\left(\\frac{1}{2}\\right)^3 = ${ans}$.`,
    planSummary: "Compute remaining patient radiotracer activity using effective half-life.",
  });

  pushCalcMcq(ctx, {
    slug: "med-nuc-calc-03",
    conceptId,
    kind,
    domain: "quantum-nuclear",
    subtopicId: sub,
    difficulty: "standard",
    scenarioSpec: {
      kind,
      mode: "pet-coincidence",
      physicalHalfLifeHours: 1.83,
      biologicalHalfLifeHours: 7.32,
      elapsedHours: 2.93,
      initialActivityMBq: 360,
    },
    hiddenQuantities: ["effectiveHalfLifeHours"],
    requiredGivens: [
      { name: "physicalHalfLifeHours", value: 1.83, unit: "h", source: "stem" },
      { name: "biologicalHalfLifeHours", value: 7.32, unit: "h", source: "stem" },
    ],
    targetQuantityKey: "effectiveHalfLifeHours",
    unit: "h",
    stem: "A fluorine-18 FDG tracer injected for a PET scan has a physical half-life of 1.83 h and a biological half-life of 7.32 h. Calculate its effective half-life inside the body.",
    distractors: () => [
      { value: 9.15, rationale: "Adds both half-lives directly instead of taking reciprocals." },
      { value: 4.58, rationale: "Computes the arithmetic average of 1.83 h and 7.32 h." },
      { value: 2.44, rationale: "Subtracts reciprocals instead of adding them." },
    ],
    workedSolution: (_q, ans) =>
      `$T_E = \\frac{T_P T_B}{T_P + T_B} = \\frac{1.83 \\times 7.32}{1.83 + 7.32} = ${ans}$. Note $T_E$ is strictly shorter than both $T_P$ and $T_B$.`,
    planSummary: "Calculate effective half-life for a positron-emitting PET radiotracer.",
  });

  pushCalcMcq(ctx, {
    slug: "med-nuc-calc-04",
    conceptId,
    kind,
    domain: "quantum-nuclear",
    subtopicId: sub,
    difficulty: "higher",
    scenarioSpec: {
      kind,
      mode: "gamma-camera",
      physicalHalfLifeHours: 6.0,
      biologicalHalfLifeHours: 18.0,
      elapsedHours: 9.0,
      initialActivityMBq: 500,
    },
    hiddenQuantities: ["remainingFractionPercent", "remainingActivityMBq"],
    requiredGivens: [
      { name: "physicalHalfLifeHours", value: 6.0, unit: "h", source: "stem" },
      { name: "biologicalHalfLifeHours", value: 18.0, unit: "h", source: "stem" },
      { name: "elapsedHours", value: 9.0, unit: "h", source: "stem" },
    ],
    targetQuantityKey: "remainingFractionPercent",
    unit: "%",
    stem: "A diagnostic bone-scan tracer has a physical half-life of 6.00 h and a biological half-life of 18.0 h. What percentage of the initial activity remains in the patient 9.00 h after injection?",
    distractors: () => [
      { value: 35.4, rationale: "Ignores biological clearance and computes 0.5^(9/6) = 35.4%." },
      { value: 70.7, rationale: "Uses only the biological half-life 18.0 h." },
      { value: 50.0, rationale: "Assumes one effective half-life equals 9.0 h." },
    ],
    workedSolution: (_q, ans) =>
      `$T_E = \\frac{6.00 \\times 18.0}{6.00 + 18.0} = 4.50\\text{ h}$. Since $9.00\\text{ h} = 2 T_E$, the remaining activity is $100 \\times (1/2)^2 = ${ans}$.`,
    planSummary: "Determine remaining percentage of nuclear tracer activity after two effective half-lives.",
  });

  // 3 Pure Qual MCQs
  pushQualMcq(ctx, {
    slug: "med-nuc-qual-01",
    conceptId,
    kind,
    domain: "quantum-nuclear",
    subtopicId: sub,
    difficulty: "foundation",
    scenarioSpec: {
      kind,
      mode: "gamma-camera",
      physicalHalfLifeHours: 6.0,
      biologicalHalfLifeHours: 12.0,
      elapsedHours: 6.0,
      initialActivityMBq: 400,
    },
    targetQuantityKey: "tc99mSuitabilityAnchor",
    stem: "Why is technetium-99m the most widely used radionuclide for diagnostic gamma-camera scans?",
    correctOption: (a) => `Because Tc-99m ${a}.`,
    distractors: [
      {
        text: "Because Tc-99m emits intense alpha particles that stop inside the targeted organ.",
        rationale: "Alpha emitters are strongly ionising and cannot exit the body to reach an external gamma camera.",
      },
      {
        text: "Because Tc-99m has a physical half-life of several years so hospital stocks never decay.",
        rationale: "A multi-year half-life would deliver a dangerous long-term radiation dose to the patient.",
      },
      {
        text: "Because Tc-99m decays solely via positron emission into opposite 511 keV photons.",
        rationale: "Positron emission describes fluorine-18 in PET, whereas Tc-99m is a pure 140 keV gamma emitter.",
      },
    ],
    workedSolution: (a) =>
      `Tc-99m is clinically ideal because it ${a} (emitting 140 keV gamma photons that penetrate tissue cleanly).`,
    planSummary: "Explain clinical suitability of metastable technetium as a gamma tracer.",
  });

  pushQualMcq(ctx, {
    slug: "med-nuc-qual-02",
    conceptId,
    kind,
    domain: "quantum-nuclear",
    subtopicId: sub,
    difficulty: "standard",
    scenarioSpec: {
      kind,
      mode: "pet-coincidence",
      physicalHalfLifeHours: 1.83,
      biologicalHalfLifeHours: 6.0,
      elapsedHours: 2.0,
      initialActivityMBq: 300,
    },
    targetQuantityKey: "petMechanismAnchor",
    stem: "Which physical process allows a PET ring scanner to determine the line of response passing through a tumour?",
    correctOption: (a) => `Inside tissue, an ${a}.`,
    distractors: [
      {
        text: "An emitted alpha particle bounces back and forth across the detector ring producing ultrasound echoes.",
        rationale: "PET relies on positron-electron annihilation into gamma photons, not alpha particles or ultrasound.",
      },
      {
        text: "A single 140 keV gamma photon passes through a rotating lead collimator to hit one PMT.",
        rationale: "That describes a single-photon gamma camera using Tc-99m rather than coincidence PET.",
      },
      {
        text: "An emitted neutron splits hydrogen nuclei into two perpendicular X-ray photons.",
        rationale: "PET tracers are beta-plus emitters and momentum conservation forces the two gamma photons to travel oppositely (180 degrees apart).",
      },
    ],
    workedSolution: (a) =>
      `Conservation of momentum and energy means an ${a}, defining a straight line of response across the ring.`,
    planSummary: "Explain PET opposing annihilation-photon coincidence detection.",
  });

  pushQualMcq(ctx, {
    slug: "med-nuc-qual-03",
    conceptId,
    kind,
    domain: "quantum-nuclear",
    subtopicId: sub,
    difficulty: "standard",
    scenarioSpec: {
      kind,
      mode: "gamma-camera",
      physicalHalfLifeHours: 6.0,
      biologicalHalfLifeHours: 10.0,
      elapsedHours: 4.0,
      initialActivityMBq: 450,
    },
    targetQuantityKey: "gammaCameraPartsAnchor",
    stem: "Which sequence correctly summarises the signal-conversion stages inside a clinical gamma camera?",
    correctOption: (a) => `From patient to computer, a ${a}.`,
    distractors: [
      {
        text: "Sodium iodide crystal absorbs oblique rays, lead collimator amplifies electrons, and PMTs emit gamma rays.",
        rationale: "Scrambles the roles of collimator, scintillator, and photomultiplier tubes.",
      },
      {
        text: "Magnetic gradient coils focus gamma rays onto a piezoelectric crystal that drives an oscilloscope.",
        rationale: "Confuses MRI gradient coils and ultrasound piezoelectric crystals with gamma-camera hardware.",
      },
      {
        text: "Aluminium filter stops gamma rays while a rotating tungsten anode converts light into X-rays.",
        rationale: "Describes components of an X-ray tube rather than a gamma camera.",
      },
    ],
    workedSolution: (a) =>
      `In a gamma camera, the ${a} so the computer can reconstruct the tracer distribution.`,
    planSummary: "Identify the functions of collimator, NaI scintillator, and PMTs in a gamma camera.",
  });

  // 4 Multi-part Structured
  pushStructured(ctx, {
    slug: "med-nuc-str-01",
    conceptId,
    kind,
    domain: "quantum-nuclear",
    subtopicId: sub,
    difficulty: "standard",
    questionStyle: "mixed-exam",
    scenarioSpec: {
      kind,
      mode: "gamma-camera",
      physicalHalfLifeHours: 6.0,
      biologicalHalfLifeHours: 12.0,
      elapsedHours: 12.0,
      initialActivityMBq: 480,
    },
    hiddenQuantities: [
      "effectiveHalfLifeHours",
      "remainingActivityMBq",
      "tc99mSuitabilityAnchor",
    ],
    requiredGivens: [
      { name: "physicalHalfLifeHours", value: 6.0, unit: "h", source: "stem" },
      { name: "biologicalHalfLifeHours", value: 12.0, unit: "h", source: "stem" },
      { name: "elapsedHours", value: 12.0, unit: "h", source: "stem" },
      { name: "initialActivityMBq", value: 480, unit: "MBq", source: "stem" },
    ],
    stem: "A kidney-function gamma scan uses technetium-99m ($T_P = 6.00\\text{ h}$) bound to a compound with biological half-life $T_B = 12.0\\text{ h}$. The initial injected activity is 480 MBq.",
    build: (q) => {
      const te = numQ(q, "effectiveHalfLifeHours");
      const rem = numQ(q, "remainingActivityMBq");
      const suit = strQ(q, "tc99mSuitabilityAnchor");
      return {
        parts: [
          {
            partId: "a",
            prompt: "Calculate the effective half-life $T_E$ of the tracer inside the patient.",
            marks: 2,
            targetQuantityKey: "effectiveHalfLifeHours",
            expectedAnswer: fmt3(te, "h"),
            workingSteps: [`$1/T_E = 1/6.00 + 1/12.0 = 0.250\\text{ h}^{-1} \\Rightarrow T_E = ${fmt3(te, "h")}$.`],
          },
          {
            partId: "b",
            prompt: "Calculate the activity remaining in the patient 12.0 h after injection.",
            marks: 2,
            dependsOnPartIds: ["a"],
            targetQuantityKey: "remainingActivityMBq",
            expectedAnswer: fmt3(rem, "MBq"),
            workingSteps: [`$12.0\\text{ h} = 3 T_E \\Rightarrow A = 480 \\times (1/2)^3 = ${fmt3(rem, "MBq")}$.`],
          },
          {
            partId: "c",
            prompt: "State two radiological reasons why Tc-99m is preferred over an alpha-emitting isotope for this diagnostic scan.",
            marks: 2,
            targetMode: "qualitative",
            targetQuantityKey: "tc99mSuitabilityAnchor",
            expectedAnswer: `Tc-99m ${suit}, whereas alpha particles are highly ionising and stopped inside the body.`,
            workingSteps: [
              "Pure gamma photons escape the body to reach the camera with low local ionisation.",
              "Short 6 h half-life allows imaging while keeping total patient radiation dose low.",
            ],
          },
        ],
        markScheme: [
          { code: "M1", criterion: "Applies $1/T_E = 1/T_P + 1/T_B$.", marks: 1, partId: "a" },
          { code: "A1", criterion: `Correct effective half-life ${fmt3(te, "h")}.`, marks: 1, partId: "a" },
          { code: "M1", criterion: "Applies $A = 480 \\times (1/2)^{12.0 / 4.00}$.", marks: 1, partId: "b" },
          { code: "A1", criterion: `Correct remaining activity ${fmt3(rem, "MBq")}.`, marks: 1, partId: "b" },
          { code: "B1", criterion: "Notes pure gamma emission escapes tissue with far lower local ionisation than alpha.", marks: 1, partId: "c" },
          { code: "B1", criterion: "Notes short 6 h physical half-life limits cumulative patient dose.", marks: 1, partId: "c" },
        ],
        workedSolution: `(a) $T_E = ${fmt3(te, "h")}$. (b) $A = ${fmt3(rem, "MBq")}$. (c) ${suit}.`,
      };
    },
    planSummary: "Calculate metastable technetium effective half-life and remaining activity and justify pure gamma choice.",
    subpartPlan: ["effective half-life", "activity after elapsed time", "radiological suitability"],
  });

  pushStructured(ctx, {
    slug: "med-nuc-str-02",
    conceptId,
    kind,
    domain: "quantum-nuclear",
    subtopicId: sub,
    difficulty: "standard",
    questionStyle: "mixed-exam",
    scenarioSpec: {
      kind,
      mode: "pet-coincidence",
      physicalHalfLifeHours: 1.83,
      biologicalHalfLifeHours: 5.49,
      elapsedHours: 4.12,
      initialActivityMBq: 320,
    },
    hiddenQuantities: [
      "effectiveHalfLifeHours",
      "remainingActivityMBq",
      "petMechanismAnchor",
    ],
    requiredGivens: [
      { name: "physicalHalfLifeHours", value: 1.83, unit: "h", source: "stem" },
      { name: "biologicalHalfLifeHours", value: 5.49, unit: "h", source: "stem" },
      { name: "elapsedHours", value: 4.12, unit: "h", source: "stem" },
      { name: "initialActivityMBq", value: 320, unit: "MBq", source: "stem" },
    ],
    stem: "A PET oncology centre injects 320 MBq of fluorine-18 FDG ($T_P = 1.83\\text{ h}$, $T_B = 5.49\\text{ h}$).",
    build: (q) => {
      const te = numQ(q, "effectiveHalfLifeHours");
      const rem = numQ(q, "remainingActivityMBq");
      const pet = strQ(q, "petMechanismAnchor");
      return {
        parts: [
          {
            partId: "a",
            prompt: "Calculate the effective half-life of the fluorine-18 tracer.",
            marks: 2,
            targetQuantityKey: "effectiveHalfLifeHours",
            expectedAnswer: fmt3(te, "h"),
            workingSteps: [`$T_E = \\frac{1.83 \\times 5.49}{1.83 + 5.49} = ${fmt3(te, "h")}$.`],
          },
          {
            partId: "b",
            prompt: "Calculate the remaining activity inside the patient 4.12 h after injection.",
            marks: 2,
            dependsOnPartIds: ["a"],
            targetQuantityKey: "remainingActivityMBq",
            expectedAnswer: fmt3(rem, "MBq"),
            workingSteps: [`$A = 320 \\times (1/2)^{4.12 / ${fmt3(te)}} = ${fmt3(rem, "MBq")}$.`],
          },
          {
            partId: "c",
            prompt: "Describe how opposing gamma photons enable the PET ring to locate active metabolic tissue without a lead collimator.",
            marks: 2,
            targetMode: "qualitative",
            targetQuantityKey: "petMechanismAnchor",
            expectedAnswer: `In tissue, an ${pet}; simultaneous arrival at opposite detectors defines the line of response, and slight arrival-time differences pinpoint the site.`,
            workingSteps: [
              "State positron-electron annihilation producing two opposite 511 keV gamma photons.",
              "Explain coincidence timing links opposite detector hits to reconstruct the emission point.",
            ],
          },
        ],
        markScheme: [
          { code: "M1", criterion: "Applies $1/T_E = 1/1.83 + 1/5.49$.", marks: 1, partId: "a" },
          { code: "A1", criterion: `Correct effective half-life ${fmt3(te, "h")}.`, marks: 1, partId: "a" },
          { code: "M1", criterion: "Uses $A = 320 \\times 0.5^{t / T_E}$.", marks: 1, partId: "b" },
          { code: "A1", criterion: `Correct remaining activity ${fmt3(rem, "MBq")}.`, marks: 1, partId: "b" },
          { code: "B1", criterion: "States positron annihilates with an electron into two opposite 511 keV gamma photons.", marks: 1, partId: "c" },
          { code: "B1", criterion: "Explains coincidence detection identifies the line of response without lead collimation.", marks: 1, partId: "c" },
        ],
        workedSolution: `(a) $T_E = ${fmt3(te, "h")}$. (b) $A = ${fmt3(rem, "MBq")}$. (c) ${pet}.`,
      };
    },
    planSummary: "Analyse positron-emitting PET tracer decay and opposing annihilation-photon coincidence localisation.",
    subpartPlan: ["effective half-life", "remaining activity", "PET coincidence mechanism"],
  });

  pushStructured(ctx, {
    slug: "med-nuc-str-03",
    conceptId,
    kind,
    domain: "quantum-nuclear",
    subtopicId: sub,
    difficulty: "standard",
    questionStyle: "mixed-exam",
    scenarioSpec: {
      kind,
      mode: "gamma-camera",
      physicalHalfLifeHours: 6.0,
      biologicalHalfLifeHours: 24.0,
      elapsedHours: 4.8,
      initialActivityMBq: 600,
    },
    hiddenQuantities: [
      "effectiveHalfLifeHours",
      "effectiveDecayConstantPerH",
      "gammaCameraPartsAnchor",
    ],
    requiredGivens: [
      { name: "physicalHalfLifeHours", value: 6.0, unit: "h", source: "stem" },
      { name: "biologicalHalfLifeHours", value: 24.0, unit: "h", source: "stem" },
    ],
    stem: "A cardiac perfusion scan employs a Tc-99m tracer with physical half-life 6.00 h and biological half-life 24.0 h.",
    build: (q) => {
      const te = numQ(q, "effectiveHalfLifeHours");
      const lam = numQ(q, "effectiveDecayConstantPerH");
      const gc = strQ(q, "gammaCameraPartsAnchor");
      return {
        parts: [
          {
            partId: "a",
            prompt: "Calculate the effective half-life $T_E$ and effective decay constant $\\lambda_E$ in $\\text{h}^{-1}$.",
            marks: 3,
            targetQuantityKey: "effectiveDecayConstantPerH",
            expectedAnswer: `${fmt3(lam, "h⁻¹")} (from $T_E = ${fmt3(te, "h")}$).`,
            workingSteps: [
              `$T_E = \\frac{6.00 \\times 24.0}{30.0} = ${fmt3(te, "h")}$.`,
              `$\\lambda_E = \\frac{\\ln 2}{4.80} = ${fmt3(lam, "h⁻¹")}$.`,
            ],
          },
          {
            partId: "b",
            prompt: "Describe the roles of the lead collimator, sodium iodide crystal, and photomultiplier tubes in forming the gamma image.",
            marks: 3,
            targetMode: "qualitative",
            targetQuantityKey: "gammaCameraPartsAnchor",
            expectedAnswer: `Inside the camera head, the ${gc}.`,
            workingSteps: [
              "Collimator blocks oblique photons so only rays parallel to the septa reach the crystal.",
              "NaI(Tl) crystal converts each gamma photon into a flash of visible scintillation photons.",
              "PMTs convert light pulses into amplified electrical signals used to triangulate $(x, y)$ position.",
            ],
          },
        ],
        markScheme: [
          { code: "M1", criterion: "Calculates $T_E = 4.80\\text{ h}$.", marks: 1, partId: "a" },
          { code: "M1", criterion: "Applies $\\lambda_E = \\ln 2 / T_E$.", marks: 1, partId: "a" },
          { code: "A1", criterion: `Correct effective decay constant ${fmt3(lam, "h⁻¹")}.`, marks: 1, partId: "a" },
          { code: "B1", criterion: "Explains lead collimator selects only parallel gamma rays for sharp localisation.", marks: 1, partId: "b" },
          { code: "B1", criterion: "Explains NaI scintillator converts gamma photon into visible light photons.", marks: 1, partId: "b" },
          { code: "B1", criterion: "Explains PMTs amplify light into electrical pulses for computer position mapping.", marks: 1, partId: "b" },
        ],
        workedSolution: `(a) $T_E = ${fmt3(te, "h")}$, $\\lambda_E = ${fmt3(lam, "h⁻¹")}$. (b) ${gc}.`,
      };
    },
    planSummary: "Compute effective decay constant and describe gamma-camera hardware stages.",
    subpartPlan: ["effective half-life and decay constant", "gamma camera component roles"],
  });

  pushStructured(ctx, {
    slug: "med-nuc-str-04",
    conceptId,
    kind,
    domain: "quantum-nuclear",
    subtopicId: sub,
    difficulty: "higher",
    questionStyle: "calculation",
    scenarioSpec: {
      kind,
      mode: "gamma-camera",
      physicalHalfLifeHours: 8.0,
      biologicalHalfLifeHours: 4.0,
      elapsedHours: 8.0,
      initialActivityMBq: 720,
    },
    hiddenQuantities: [
      "effectiveHalfLifeHours",
      "remainingActivityMBq",
      "remainingFractionPercent",
    ],
    requiredGivens: [
      { name: "physicalHalfLifeHours", value: 8.0, unit: "h", source: "stem" },
      { name: "biologicalHalfLifeHours", value: 4.0, unit: "h", source: "stem" },
      { name: "elapsedHours", value: 8.0, unit: "h", source: "stem" },
      { name: "initialActivityMBq", value: 720, unit: "MBq", source: "stem" },
    ],
    stem: "An experimental tracer has physical half-life 8.00 h and rapid renal biological half-life 4.00 h. A dose of 720 MBq is administered at 09:00.",
    build: (q) => {
      const te = numQ(q, "effectiveHalfLifeHours");
      const rem = numQ(q, "remainingActivityMBq");
      const pct = numQ(q, "remainingFractionPercent");
      return {
        parts: [
          {
            partId: "a",
            prompt: "Calculate the effective half-life $T_E$ in hours.",
            marks: 2,
            targetQuantityKey: "effectiveHalfLifeHours",
            expectedAnswer: fmt3(te, "h"),
            workingSteps: [`$T_E = \\frac{8.00 \\times 4.00}{8.00 + 4.00} = ${fmt3(te, "h")}$.`],
          },
          {
            partId: "b",
            prompt: "Calculate the activity remaining in the patient at 17:00 (8.00 h later) and express it as a percentage of the initial dose.",
            marks: 3,
            dependsOnPartIds: ["a"],
            targetQuantityKey: "remainingActivityMBq",
            expectedAnswer: `${fmt3(rem, "MBq")} (${fmt3(pct, "%")} of initial dose).`,
            workingSteps: [
              "Number of effective half-lives $= 8.00 / 2.667 = 3.00$.",
              `$A = 720 \\times (1/2)^3 = ${fmt3(rem, "MBq")}$ ($${fmt3(pct, "%")}$).`,
            ],
          },
        ],
        markScheme: [
          { code: "M1", criterion: "Applies $1/T_E = 1/8.00 + 1/4.00$.", marks: 1, partId: "a" },
          { code: "A1", criterion: `Correct effective half-life ${fmt3(te, "h")}.`, marks: 1, partId: "a" },
          { code: "M1", criterion: "Identifies 8.00 h equals 3.00 effective half-lives.", marks: 1, partId: "b" },
          { code: "M1", criterion: "Calculates $720 / 8$.", marks: 1, partId: "b" },
          { code: "A1", criterion: `Correct activity ${fmt3(rem, "MBq")} and 12.5%.`, marks: 1, partId: "b" },
        ],
        workedSolution: `(a) $T_E = ${fmt3(te, "h")}$. (b) After 8.00 h (3 effective half-lives), $A = ${fmt3(rem, "MBq")}$ ($12.5\\%$).`,
      };
    },
    planSummary: "Compute effective half-life and remaining activity for rapid biological excretion.",
    subpartPlan: ["effective half-life", "activity and percentage remaining after elapsed hours"],
  });

  // 1 Authentic 6-Mark LoR
  pushSixMarkLor(ctx, {
    slug: "med-nuc-lor-01",
    conceptId,
    kind,
    domain: "quantum-nuclear",
    subtopicId: sub,
    scenarioSpec: {
      kind,
      mode: "pet-coincidence",
      physicalHalfLifeHours: 1.83,
      biologicalHalfLifeHours: 6.0,
      elapsedHours: 2.0,
      initialActivityMBq: 300,
    },
    targetQuantityKey: "lorModalityComparisonAnchor",
    stem: "A hospital radiology board is comparing Computed Tomography (CT), Magnetic Resonance Imaging (MRI), and Diagnostic Ultrasound for evaluating trauma, brain soft tissue, and obstetric patients.",
    prompt:
      "Compare CT, MRI, and Ultrasound imaging across physical operating principles, image contrast and resolution, ionising radiation risk, and practical clinical limitations or contraindications.",
    expectedAnswer: (anchor) =>
      `Clinicians select imaging modalities by balancing contrast, safety, and availability: ${anchor}. CT rotates an X-ray tube and detector ring around the patient to reconstruct crisp 3D cross-sections of dense bone and acute internal bleeding, but delivers a substantial ionising X-ray dose that restricts repeated use and pregnancy scanning. MRI aligns hydrogen protons in a strong superconducting magnetic field, excites them with radiofrequency pulses at the Larmor frequency, and detects relaxation signals to distinguish subtle soft-tissue and brain structures without ionising radiation; however, MRI scanners are costly, slow, noisy, claustrophobic, cannot image dry cortical bone well (few free hydrogen protons), and are strictly contraindicated for patients with ferromagnetic implants or unshielded pacemakers. Diagnostic ultrasound uses high-frequency longitudinal acoustic pulses reflected at impedance boundaries, making it completely non-ionising, inexpensive, portable, and ideal for real-time fetal and cardiac imaging, though it offers lower resolution, cannot penetrate bone or air-filled lungs due to near-total reflection, and requires skilled operator interpretation.`,
    workingSteps: [
      "Explain CT: rotating X-ray slices, high bone/trauma resolution, significant ionising dose.",
      "Explain MRI: strong B-field + RF Larmor excitation of hydrogen protons, zero ionising risk, superior soft-tissue/brain contrast.",
      "State MRI limitations: expensive, slow, poor dry-bone signal, hazardous with ferromagnetic implants/pacemakers.",
      "Explain Ultrasound: non-ionising acoustic pulse-echo reflection, portable, low-cost, real-time imaging.",
      "State Ultrasound limitations: blocked by bone and air pockets (impedance mismatch), lower spatial detail.",
      "Synthesise clinical selection (e.g. ultrasound for pregnancy, MRI for brain/ligaments, CT for rapid bone/trauma).",
    ],
    criteriaSix: [
      "Correctly describes CT as rotating X-ray cross-sectional imaging providing high bone/trauma detail at the cost of a significant ionising radiation dose.",
      "Correctly describes MRI as using strong magnetic fields and RF Larmor resonance of hydrogen protons with zero ionising radiation.",
      "Highlights MRI's superior soft-tissue contrast (e.g. brain/spinal cord) alongside its weakness on dry bone.",
      "Identifies key MRI limitations: high cost, long scan time, and contraindications for ferromagnetic implants or pacemakers.",
      "Correctly describes ultrasound as non-ionising, portable, inexpensive, real-time imaging ideal for obstetrics.",
      "Identifies ultrasound limitations: lower spatial resolution and inability to penetrate bone or air-filled cavities due to acoustic impedance mismatch.",
    ],
    workedSolution: (anchor) =>
      `Level 3 synthesis: ${anchor}; explicitly evaluates CT ionising dose, MRI Larmor hydrogen-proton physics and metal contraindications, and ultrasound bone/air reflection barriers.`,
    planSummary: "Six-mark level-of-response clinical comparison of CT, MRI, and ultrasound imaging.",
  });
}

/* ========================================================================== */
/*  SECTION C — OPTION 3.12 TURNING POINTS (5 plugins × 12 = 60 items)        */
/* ========================================================================== */

function populateTpThomsonEm(ctx: BuilderContext): void {
  const kind = "al-opt-tp-thomson-em";
  const conceptId = "magnetic-forces-charged-particles";
  const sub = "alevel-3-12-turning-points" as const;

  // 4 Calc MCQs
  pushCalcMcq(ctx, {
    slug: "tp-thom-calc-01",
    conceptId,
    kind,
    domain: "em-induction",
    subtopicId: sub,
    difficulty: "foundation",
    scenarioSpec: {
      kind,
      mode: "crossed-fields",
      plateVoltageV: 1080,
      plateSeparationM: 0.04,
      magneticFieldT: 1.5e-3,
      orbitRadiusM: 0.0682,
    },
    hiddenQuantities: ["electronSpeedMs", "electricFieldVm"],
    requiredGivens: [
      { name: "plateVoltageV", value: 1080, unit: "V", source: "either" },
      { name: "plateSeparationM", value: 0.04, unit: "m", source: "either" },
      { name: "magneticFieldT", value: 1.5e-3, unit: "T", source: "either" },
    ],
    targetQuantityKey: "electronSpeedMs",
    unit: "m s⁻¹",
    stem: "In a Thomson crossed-field velocity selector, a horizontal electron beam passes undeflected between parallel plates separated by 4.00 cm with a potential difference of 1080 V across them, in a perpendicular uniform magnetic flux density of 1.50 mT. What is the speed of the electrons?",
    distractors: (q) => {
      const v = numQ(q, "electronSpeedMs");
      return [
        { value: v * 0.04, rationale: "Uses plate voltage V directly instead of electric field E = V / d." },
        { value: v * 0.5, rationale: "Halves the velocity selector ratio v = E / B." },
        { value: v / 100, rationale: "Fails to convert centimetres to metres when computing E = V / d." },
      ];
    },
    workedSolution: (_q, ans) =>
      `For zero net deflection, $eE = Bev$, so $v = \\frac{E}{B} = \\frac{V_p}{Bd} = \\frac{1080}{1.50 \\times 10^{-3} \\times 0.0400} = ${ans}$.`,
    planSummary: "Compute undeflected electron beam speed in a Thomson crossed E/B selector.",
  });

  pushCalcMcq(ctx, {
    slug: "tp-thom-calc-02",
    conceptId,
    kind,
    domain: "em-induction",
    subtopicId: sub,
    difficulty: "standard",
    scenarioSpec: {
      kind,
      mode: "fine-beam",
      anodeVoltageV: 220,
      magneticFieldT: 1.25e-3,
      orbitRadiusM: 0.04,
    },
    hiddenQuantities: ["specificChargeCKg"],
    requiredGivens: [
      { name: "anodeVoltageV", value: 220, unit: "V", source: "either" },
      { name: "magneticFieldT", value: 1.25e-3, unit: "T", source: "either" },
      { name: "orbitRadiusM", value: 0.04, unit: "m", source: "either" },
    ],
    targetQuantityKey: "specificChargeCKg",
    unit: "C kg⁻¹",
    stem: "Electrons accelerated from rest through an anode potential difference of 220 V enter a uniform magnetic field of flux density 1.25 mT at right angles and follow a circular path of radius 4.00 cm in a fine-beam tube. Calculate the specific charge $e/m$ of the electron.",
    distractors: (q) => {
      const em = numQ(q, "specificChargeCKg");
      return [
        { value: em * 0.5, rationale: "Omits the factor of 2 in e/m = 2V / (B^2 r^2)." },
        { value: em * 0.25, rationale: "Substitutes orbit diameter 8.0 cm instead of radius 4.0 cm." },
        { value: em * 2, rationale: "Applies an extraneous factor of two in kinetic energy rearrangement." },
      ];
    },
    workedSolution: (_q, ans) =>
      `Combining $\\frac{1}{2}mv^2 = eV$ and $Bev = \\frac{mv^2}{r}$ yields $\\frac{e}{m} = \\frac{2V}{B^2 r^2} = \\frac{2 \\times 220}{(1.25 \\times 10^{-3})^2 (0.0400)^2} = ${ans}$.`,
    planSummary: "Determine electron specific charge from a fine-beam tube circular trajectory.",
  });

  pushCalcMcq(ctx, {
    slug: "tp-thom-calc-03",
    conceptId,
    kind,
    domain: "em-induction",
    subtopicId: sub,
    difficulty: "standard",
    scenarioSpec: {
      kind,
      mode: "crossed-fields",
      plateVoltageV: 1200,
      plateSeparationM: 0.05,
      magneticFieldT: 1.6e-3,
      orbitRadiusM: 0.0533,
    },
    hiddenQuantities: ["specificChargeCKg", "electronSpeedMs"],
    requiredGivens: [
      { name: "plateVoltageV", value: 1200, unit: "V", source: "either" },
      { name: "plateSeparationM", value: 0.05, unit: "m", source: "either" },
      { name: "magneticFieldT", value: 1.6e-3, unit: "T", source: "either" },
      { name: "orbitRadiusM", value: 0.0533, unit: "m", source: "stem" },
    ],
    targetQuantityKey: "specificChargeCKg",
    unit: "C kg⁻¹",
    stem: "In a crossed-field apparatus, a plate pd of 1200 V across a 5.00 cm separation balances a magnetic flux density of 1.60 mT. When the electric field is switched off, the same magnetic field bends the beam into a circular arc of radius 5.33 cm. What value of $e/m$ is obtained?",
    distractors: (q) => {
      const em = numQ(q, "specificChargeCKg");
      return [
        { value: em * 1.6e-3, rationale: "Forgets to square B in e/m = E / (B^2 r)." },
        { value: em * 2, rationale: "Applies the fine-beam factor of 2 erroneously to crossed-field e/m = E / (B^2 r)." },
        { value: em * 0.5, rationale: "Uses diameter instead of radius in r = mv / (eB)." },
      ];
    },
    workedSolution: (_q, ans) =>
      `$E = \\frac{1200}{0.0500} = 2.40 \\times 10^4\\text{ V m}^{-1}$. Using $v = E/B$ in $e/m = v/(Br)$ gives $\\frac{e}{m} = \\frac{E}{B^2 r} = \\frac{2.40 \\times 10^4}{(1.60 \\times 10^{-3})^2 \\times 0.0533} = ${ans}$.`,
    planSummary: "Compute electron specific charge from Thomson crossed-field velocity and pure-B circular arc.",
  });

  pushCalcMcq(ctx, {
    slug: "tp-thom-calc-04",
    conceptId,
    kind,
    domain: "em-induction",
    subtopicId: sub,
    difficulty: "higher",
    scenarioSpec: {
      kind,
      mode: "fine-beam",
      anodeVoltageV: 300,
      magneticFieldT: 1.45e-3,
      orbitRadiusM: 0.0403,
    },
    hiddenQuantities: ["orbitRadiusM"],
    requiredGivens: [
      { name: "anodeVoltageV", value: 300, unit: "V", source: "either" },
      { name: "magneticFieldT", value: 1.45e-3, unit: "T", source: "either" },
      { name: "specificChargeCKg", value: 1.76e11, unit: "C kg⁻¹", source: "stem" },
    ],
    targetQuantityKey: "orbitRadiusM",
    unit: "m",
    stem: "Electrons ($e/m = 1.76 \\times 10^{11}\\text{ C kg}^{-1}$) are accelerated through 300 V in a fine-beam tube and enter a perpendicular uniform magnetic field of 1.45 mT. What is the radius of their circular orbit?",
    distractors: (q) => {
      const r = numQ(q, "orbitRadiusM");
      return [
        { value: r * 2, rationale: "Computes the circular orbit diameter instead of the radius." },
        { value: r / Math.SQRT2, rationale: "Omits the factor of 2 in v = sqrt(2 V e / m)." },
        { value: r * r, rationale: "Forgets to take the square root of r squared." },
      ];
    },
    workedSolution: (_q, ans) =>
      `From $\\frac{e}{m} = \\frac{2V}{B^2 r^2}$, $r = \\frac{1}{B}\\sqrt{\\frac{2V}{e/m}} = \\frac{1}{1.45 \\times 10^{-3}}\\sqrt{\\frac{600}{1.76 \\times 10^{11}}} = ${ans}$.`,
    planSummary: "Calculate circular orbit radius of electrons in a fine-beam tube.",
  });

  // 3 Pure Qual MCQs
  pushQualMcq(ctx, {
    slug: "tp-thom-qual-01",
    conceptId,
    kind,
    domain: "em-induction",
    subtopicId: sub,
    difficulty: "foundation",
    questionStyle: "definition",
    scenarioSpec: {
      kind,
      mode: "crossed-fields",
      plateVoltageV: 1000,
      plateSeparationM: 0.04,
      magneticFieldT: 1.5e-3,
      orbitRadiusM: 0.063,
    },
    targetQuantityKey: "thermionicAnchor",
    stem: "How are free electrons initially liberated from the heated filament cathode of a discharge or fine-beam tube?",
    correctOption: (a) => `By thermionic emission, where ${a}.`,
    distractors: [
      {
        text: "By radioactive beta decay of tungsten nuclei inside the heated cathode.",
        rationale: "Tungsten filaments are stable and release conduction electrons thermally, not via nuclear decay.",
      },
      {
        text: "By magnetic induction pulling protons out of the evacuated glass envelope.",
        rationale: "Cathode rays are negatively charged electrons emitted thermally from the heated metal.",
      },
      {
        text: "By photoelectric absorption of gamma photons emitted by the fluorescent screen.",
        rationale: "Thermionic emission uses thermal energy from resistive heating rather than photon absorption.",
      },
    ],
    workedSolution: (a) =>
      `In thermionic emission, ${a} (exceeding the metal's work function).`,
    planSummary: "Explain the physical mechanism of thermionic emission.",
  });

  pushQualMcq(ctx, {
    slug: "tp-thom-qual-02",
    conceptId,
    kind,
    domain: "em-induction",
    subtopicId: sub,
    difficulty: "standard",
    scenarioSpec: {
      kind,
      mode: "fine-beam",
      anodeVoltageV: 250,
      magneticFieldT: 1.2e-3,
      orbitRadiusM: 0.0444,
    },
    targetQuantityKey: "hydrogenComparisonAnchor",
    stem: "Why was Thomson's 1897 measurement of the specific charge of cathode-ray particles ($1.76 \\times 10^{11}\\text{ C kg}^{-1}$) considered a decisive turning point against Dalton's indivisible-atom model?",
    correctOption: (a) => `Because the ${a}.`,
    distractors: [
      {
        text: "Because cathode rays had the exact same specific charge as a hydrogen ion, proving atoms are indivisible.",
        rationale: "Cathode rays had a vastly greater specific charge than hydrogen ions, showing sub-atomic structure.",
      },
      {
        text: "Because cathode rays carried zero electric charge and travelled faster than light.",
        rationale: "Cathode rays were deflected by both electric and magnetic fields, confirming negative charge and sub-light speed.",
      },
      {
        text: "Because the measured specific charge depended strongly on which metal was used for the cathode.",
        rationale: "Thomson found identical e/m regardless of cathode metal or gas, proving electrons are universal constituents of all atoms.",
      },
    ],
    workedSolution: (a) =>
      `Comparing with electrolysis data for $\\text{H}^+$ ($9.58 \\times 10^7\\text{ C kg}^{-1}$), the ${a}.`,
    planSummary: "Explain historical significance of comparing electron specific charge to the hydrogen ion.",
  });

  pushQualMcq(ctx, {
    slug: "tp-thom-qual-03",
    conceptId,
    kind,
    domain: "em-induction",
    subtopicId: sub,
    difficulty: "standard",
    scenarioSpec: {
      kind,
      mode: "crossed-fields",
      plateVoltageV: 1100,
      plateSeparationM: 0.04,
      magneticFieldT: 1.6e-3,
      orbitRadiusM: 0.061,
    },
    targetQuantityKey: "lorThomsonAnchor",
    stem: "In Thomson's crossed-field experiment, how are the electric and magnetic deflections combined to determine $e/m$ independently of the anode accelerating voltage?",
    correctOption: (a) => `First, ${a}.`,
    distractors: [
      {
        text: "Applying the electric field alone measures beam speed while measuring plate temperature gives electron mass.",
        rationale: "Speed requires balancing electric and magnetic forces simultaneously (v = E / B).",
      },
      {
        text: "Applying parallel electric and magnetic fields brings electrons to rest so their charge can be weighed.",
        rationale: "The E and B fields must be mutually perpendicular to each other and to the beam velocity.",
      },
      {
        text: "Reversing the magnetic field doubles the work function of the cathode to yield e/m directly.",
        rationale: "Magnetic fields do no work on electrons and cannot alter cathode work function.",
      },
    ],
    workedSolution: (a) =>
      `Thomson's two-stage protocol succeeded because ${a}.`,
    planSummary: "Explain two-stage logic of Thomson's crossed-field e/m measurement.",
  });

  // 4 Multi-part Structured
  pushStructured(ctx, {
    slug: "tp-thom-str-01",
    conceptId,
    kind,
    domain: "em-induction",
    subtopicId: sub,
    difficulty: "standard",
    questionStyle: "mixed-exam",
    scenarioSpec: {
      kind,
      mode: "crossed-fields",
      plateVoltageV: 960,
      plateSeparationM: 0.04,
      magneticFieldT: 1.2e-3,
      orbitRadiusM: 0.0947,
    },
    hiddenQuantities: [
      "electronSpeedMs",
      "specificChargeCKg",
      "hydrogenComparisonAnchor",
    ],
    requiredGivens: [
      { name: "plateVoltageV", value: 960, unit: "V", source: "either" },
      { name: "plateSeparationM", value: 0.04, unit: "m", source: "either" },
      { name: "magneticFieldT", value: 1.2e-3, unit: "T", source: "either" },
      { name: "orbitRadiusM", value: 0.0947, unit: "m", source: "stem" },
    ],
    stem: "In a crossed-field cathode-ray tube, electrons pass straight through parallel plates separated by 4.00 cm with a potential difference of 960 V when a perpendicular magnetic field of 1.20 mT is applied. With the plate voltage switched off, the electrons follow a circular arc of radius 9.47 cm.",
    build: (q) => {
      const v = numQ(q, "electronSpeedMs");
      const em = numQ(q, "specificChargeCKg");
      const cmp = strQ(q, "hydrogenComparisonAnchor");
      return {
        parts: [
          {
            partId: "a",
            prompt: "Calculate the speed of the electrons in the beam.",
            marks: 2,
            targetQuantityKey: "electronSpeedMs",
            expectedAnswer: fmt3(v, "m s⁻¹"),
            workingSteps: [
              "$E = \\frac{960}{0.0400} = 2.40 \\times 10^4\\text{ V m}^{-1}$.",
              `$v = \\frac{E}{B} = \\frac{2.40 \\times 10^4}{1.20 \\times 10^{-3}} = ${fmt3(v, "m s⁻¹")}$.`,
            ],
          },
          {
            partId: "b",
            prompt: "Calculate the specific charge $e/m$ of the electrons.",
            marks: 2,
            dependsOnPartIds: ["a"],
            targetQuantityKey: "specificChargeCKg",
            expectedAnswer: fmt3(em, "C kg⁻¹"),
            workingSteps: [
              `$\\frac{e}{m} = \\frac{v}{Br} = \\frac{2.00 \\times 10^7}{1.20 \\times 10^{-3} \\times 0.0947} = ${fmt3(em, "C kg⁻¹")}$.`,
            ],
          },
          {
            partId: "c",
            prompt: "Compare this value with the specific charge of a hydrogen ion ($9.58 \\times 10^7\\text{ C kg}^{-1}$) and state Thomson's conclusion.",
            marks: 2,
            targetMode: "qualitative",
            targetQuantityKey: "hydrogenComparisonAnchor",
            expectedAnswer: `The ${cmp}.`,
            workingSteps: [
              "Ratio is $(1.76 \\times 10^{11}) / (9.58 \\times 10^7) \\approx 1840$.",
              "Assuming comparable charge magnitude, electrons have ~1/1840 the mass of a hydrogen atom, proving atoms contain sub-atomic particles.",
            ],
          },
        ],
        markScheme: [
          { code: "M1", criterion: "Applies $v = V_p / (Bd)$ with $d = 0.0400\\text{ m}$.", marks: 1, partId: "a" },
          { code: "A1", criterion: `Correct speed ${fmt3(v, "m s⁻¹")}.`, marks: 1, partId: "a" },
          { code: "M1", criterion: "Applies $e/m = v / (Br)$ or $E / (B^2 r)$.", marks: 1, partId: "b" },
          { code: "A1", criterion: `Correct specific charge ${fmt3(em, "C kg⁻¹")}.`, marks: 1, partId: "b" },
          { code: "B1", criterion: "States electron $e/m$ is roughly 1840 (nearly 2000) times that of a hydrogen ion.", marks: 1, partId: "c" },
          { code: "B1", criterion: "Concludes electrons are sub-atomic particles with much smaller mass than atoms.", marks: 1, partId: "c" },
        ],
        workedSolution: `(a) $v = ${fmt3(v, "m s⁻¹")}$. (b) $e/m = ${fmt3(em, "C kg⁻¹")}$. (c) ${cmp}.`,
      };
    },
    planSummary: "Calculate Thomson beam speed and specific charge and interpret comparison with H+.",
    subpartPlan: ["beam speed from crossed fields", "specific charge e/m", "hydrogen ion comparison"],
  });

  pushStructured(ctx, {
    slug: "tp-thom-str-02",
    conceptId,
    kind,
    domain: "em-induction",
    subtopicId: sub,
    difficulty: "standard",
    questionStyle: "derivation",
    scenarioSpec: {
      kind,
      mode: "fine-beam",
      anodeVoltageV: 280,
      magneticFieldT: 1.5e-3,
      orbitRadiusM: 0.0376,
    },
    hiddenQuantities: [
      "specificChargeCKg",
      "electronSpeedMs",
      "thermionicAnchor",
    ],
    requiredGivens: [
      { name: "anodeVoltageV", value: 280, unit: "V", source: "either" },
      { name: "magneticFieldT", value: 1.5e-3, unit: "T", source: "either" },
      { name: "orbitRadiusM", value: 0.0376, unit: "m", source: "either" },
    ],
    stem: "A fine-beam tube containing low-pressure helium gas accelerates thermionic electrons across 280 V into a uniform magnetic field of 1.50 mT, producing a luminous circular ring of radius 3.76 cm.",
    build: (q) => {
      const em = numQ(q, "specificChargeCKg");
      const v = numQ(q, "electronSpeedMs");
      const th = strQ(q, "thermionicAnchor");
      return {
        parts: [
          {
            partId: "a",
            prompt: "Explain how electrons are emitted by the heated filament inside the electron gun.",
            marks: 2,
            targetMode: "qualitative",
            targetQuantityKey: "thermionicAnchor",
            expectedAnswer: `Through thermionic emission, ${th}.`,
            workingSteps: [
              "Electric current heats the metal filament.",
              "Conduction electrons gain thermal kinetic energy exceeding the surface work function and escape.",
            ],
          },
          {
            partId: "b",
            prompt: "Show from $\\frac{1}{2}mv^2 = eV$ and $Bev = \\frac{mv^2}{r}$ that $\\frac{e}{m} = \\frac{2V}{B^2 r^2}$, and calculate $e/m$ from the tube measurements.",
            marks: 3,
            targetQuantityKey: "specificChargeCKg",
            expectedAnswer: fmt3(em, "C kg⁻¹"),
            workingSteps: [
              "From $Bev = mv^2 / r$, $v = B r (e/m)$.",
              "Substitute into $\\frac{1}{2} v^2 = V (e/m)$ to obtain $e/m = \\frac{2V}{B^2 r^2}$.",
              `$\\frac{e}{m} = \\frac{2 \\times 280}{(1.50 \\times 10^{-3})^2 (0.0376)^2} = ${fmt3(em, "C kg⁻¹")}$.`,
            ],
          },
          {
            partId: "c",
            prompt: "Calculate the orbital speed of the electrons.",
            marks: 2,
            dependsOnPartIds: ["b"],
            targetQuantityKey: "electronSpeedMs",
            expectedAnswer: fmt3(v, "m s⁻¹"),
            workingSteps: [`$v = \\sqrt{2 (e/m) V} = ${fmt3(v, "m s⁻¹")}$.`],
          },
        ],
        markScheme: [
          { code: "B1", criterion: "States current heats the cathode filament.", marks: 1, partId: "a" },
          { code: "B1", criterion: "Explains electrons gain sufficient thermal KE to overcome the work function and escape.", marks: 1, partId: "a" },
          { code: "M1", criterion: "Equates $Bev = mv^2/r$ and $\\frac{1}{2}mv^2 = eV$ to eliminate $v$.", marks: 1, partId: "b" },
          { code: "M1", criterion: "Substitutes $V = 280\\text{ V}$, $B = 1.50 \\times 10^{-3}\\text{ T}$, $r = 0.0376\\text{ m}$.", marks: 1, partId: "b" },
          { code: "A1", criterion: `Correct specific charge ${fmt3(em, "C kg⁻¹")}.`, marks: 1, partId: "b" },
          { code: "M1", criterion: "Uses $v = \\sqrt{2(e/m)V}$ or $v = (e/m)Br$.", marks: 1, partId: "c" },
          { code: "A1", criterion: `Correct electron speed ${fmt3(v, "m s⁻¹")}.`, marks: 1, partId: "c" },
        ],
        workedSolution: `(a) ${th}. (b) $e/m = 2V/(B^2 r^2) = ${fmt3(em, "C kg⁻¹")}$. (c) $v = ${fmt3(v, "m s⁻¹")}$.`,
      };
    },
    planSummary: "Derive and evaluate fine-beam e/m, explain thermionic emission, and find electron speed.",
    subpartPlan: ["thermionic emission", "derive and compute e/m", "orbital speed"],
  });

  pushStructured(ctx, {
    slug: "tp-thom-str-03",
    conceptId,
    kind,
    domain: "em-induction",
    subtopicId: sub,
    difficulty: "standard",
    questionStyle: "calculation",
    scenarioSpec: {
      kind,
      mode: "crossed-fields",
      plateVoltageV: 1350,
      plateSeparationM: 0.045,
      magneticFieldT: 1.8e-3,
      orbitRadiusM: 0.0526,
    },
    hiddenQuantities: [
      "electricFieldVm",
      "electronSpeedMs",
      "ratioToHydrogenIon",
    ],
    requiredGivens: [
      { name: "plateVoltageV", value: 1350, unit: "V", source: "either" },
      { name: "plateSeparationM", value: 0.045, unit: "m", source: "either" },
      { name: "magneticFieldT", value: 1.8e-3, unit: "T", source: "either" },
      { name: "orbitRadiusM", value: 0.0526, unit: "m", source: "stem" },
    ],
    stem: "A student replicates Thomson's crossed-field tube using parallel plates 4.50 cm apart at 1350 V balanced by a magnetic field of 1.80 mT, then measures a pure magnetic deflection radius of 5.26 cm.",
    build: (q) => {
      const E = numQ(q, "electricFieldVm");
      const v = numQ(q, "electronSpeedMs");
      const ratio = numQ(q, "ratioToHydrogenIon");
      return {
        parts: [
          {
            partId: "a",
            prompt: "Calculate the uniform electric field strength between the parallel plates.",
            marks: 2,
            targetQuantityKey: "electricFieldVm",
            expectedAnswer: fmt3(E, "V m⁻¹"),
            workingSteps: [`$E = \\frac{1350}{0.0450} = ${fmt3(E, "V m⁻¹")}$.`],
          },
          {
            partId: "b",
            prompt: "Calculate the speed of the undeflected electron beam.",
            marks: 2,
            dependsOnPartIds: ["a"],
            targetQuantityKey: "electronSpeedMs",
            expectedAnswer: fmt3(v, "m s⁻¹"),
            workingSteps: [`$v = \\frac{3.00 \\times 10^4}{1.80 \\times 10^{-3}} = ${fmt3(v, "m s⁻¹")}$.`],
          },
          {
            partId: "c",
            prompt: "Determine the ratio of the electron's measured specific charge to that of a hydrogen ion ($9.58 \\times 10^7\\text{ C kg}^{-1}$).",
            marks: 2,
            dependsOnPartIds: ["b"],
            targetQuantityKey: "ratioToHydrogenIon",
            expectedAnswer: fmt3(ratio),
            workingSteps: [
              "$e/m = v / (Br) = 1.76 \\times 10^{11}\\text{ C kg}^{-1}$.",
              `$\\text{Ratio} = \\frac{1.76 \\times 10^{11}}{9.58 \\times 10^7} = ${fmt3(ratio)}$.`,
            ],
          },
        ],
        markScheme: [
          { code: "M1", criterion: "Uses $E = V_p / d = 1350 / 0.0450$.", marks: 1, partId: "a" },
          { code: "A1", criterion: `Correct field strength ${fmt3(E, "V m⁻¹")}.`, marks: 1, partId: "a" },
          { code: "M1", criterion: "Applies $v = E / B$.", marks: 1, partId: "b" },
          { code: "A1", criterion: `Correct speed ${fmt3(v, "m s⁻¹")}.`, marks: 1, partId: "b" },
          { code: "M1", criterion: "Computes $e/m$ and divides by $9.58 \\times 10^7\\text{ C kg}^{-1}$.", marks: 1, partId: "c" },
          { code: "A1", criterion: `Correct ratio ${fmt3(ratio)}.`, marks: 1, partId: "c" },
        ],
        workedSolution: `(a) $E = ${fmt3(E, "V m⁻¹")}$. (b) $v = ${fmt3(v, "m s⁻¹")}$. (c) Ratio $= ${fmt3(ratio)}$.`,
      };
    },
    planSummary: "Compute electric field, electron speed, and e/m ratio relative to hydrogen ion.",
    subpartPlan: ["electric field", "undeflected speed", "ratio to hydrogen ion"],
  });

  pushStructured(ctx, {
    slug: "tp-thom-str-04",
    conceptId,
    kind,
    domain: "em-induction",
    subtopicId: sub,
    difficulty: "higher",
    questionStyle: "calculation",
    scenarioSpec: {
      kind,
      mode: "fine-beam",
      anodeVoltageV: 360,
      magneticFieldT: 1.6e-3,
      orbitRadiusM: 0.04,
    },
    hiddenQuantities: ["anodeVoltageV", "electronSpeedMs"],
    requiredGivens: [
      { name: "magneticFieldT", value: 1.6e-3, unit: "T", source: "either" },
      { name: "orbitRadiusM", value: 0.04, unit: "m", source: "either" },
      { name: "specificChargeCKg", value: 1.76e11, unit: "C kg⁻¹", source: "stem" },
    ],
    stem: "In a fine-beam calibration run, electrons ($e/m = 1.76 \\times 10^{11}\\text{ C kg}^{-1}$) move in a circular path of radius 4.00 cm inside a uniform magnetic field of flux density 1.60 mT.",
    build: (q) => {
      const va = numQ(q, "anodeVoltageV");
      const v = numQ(q, "electronSpeedMs");
      return {
        parts: [
          {
            partId: "a",
            prompt: "Calculate the orbital speed of the electrons in the magnetic field.",
            marks: 2,
            targetQuantityKey: "electronSpeedMs",
            expectedAnswer: fmt3(v, "m s⁻¹"),
            workingSteps: [`$v = (e/m) B r = 1.76 \\times 10^{11} \\times 1.60 \\times 10^{-3} \\times 0.0400 = ${fmt3(v, "m s⁻¹")}$.`],
          },
          {
            partId: "b",
            prompt: "Calculate the accelerating anode potential difference $V_a$ applied in the electron gun.",
            marks: 3,
            dependsOnPartIds: ["a"],
            targetQuantityKey: "anodeVoltageV",
            expectedAnswer: fmt3(va, "V"),
            workingSteps: [
              "From $\\frac{1}{2}mv^2 = eV_a$, $V_a = \\frac{v^2}{2(e/m)}$.",
              `$V_a = \\frac{(${fmt3(v)})^2}{2 \\times 1.76 \\times 10^{11}} = ${fmt3(va, "V")}$.`,
            ],
          },
        ],
        markScheme: [
          { code: "M1", criterion: "Uses $v = (e/m)Br$.", marks: 1, partId: "a" },
          { code: "A1", criterion: `Correct speed ${fmt3(v, "m s⁻¹")}.`, marks: 1, partId: "a" },
          { code: "M1", criterion: "Applies $V_a = v^2 / (2 e/m)$ or $V_a = \\frac{1}{2}(e/m) B^2 r^2$.", marks: 1, partId: "b" },
          { code: "M1", criterion: "Substitutes values consistently in SI units.", marks: 1, partId: "b" },
          { code: "A1", criterion: `Correct anode voltage ${fmt3(va, "V")}.`, marks: 1, partId: "b" },
        ],
        workedSolution: `(a) $v = ${fmt3(v, "m s⁻¹")}$. (b) $V_a = ${fmt3(va, "V")}$.`,
      };
    },
    planSummary: "Invert fine-beam equation to find electron orbital speed and accelerating voltage.",
    subpartPlan: ["orbital speed", "accelerating anode potential difference"],
  });

  // 1 Authentic 6-Mark LoR
  pushSixMarkLor(ctx, {
    slug: "tp-thom-lor-01",
    conceptId,
    kind,
    domain: "em-induction",
    subtopicId: sub,
    scenarioSpec: {
      kind,
      mode: "crossed-fields",
      plateVoltageV: 1100,
      plateSeparationM: 0.04,
      magneticFieldT: 1.5e-3,
      orbitRadiusM: 0.0695,
    },
    targetQuantityKey: "lorThomsonAnchor",
    stem: "J. J. Thomson's determination of the specific charge $e/m$ of cathode rays fundamentally changed physicists' understanding of atomic structure.",
    prompt:
      "Describe the apparatus, key measurements, and algebraic steps used to determine $e/m$ for electrons using crossed electric and magnetic fields, and explain the historical significance of comparing this result with the hydrogen ion.",
    expectedAnswer: (anchor) =>
      `In Thomson's crossed-field apparatus, ${anchor}. A heated filament releases electrons by thermionic emission, which are accelerated through a positive anode slit into an evacuated glass tube containing horizontal parallel plates (separation $d$, potential difference $V_p$) and perpendicular Helmholtz coils producing a uniform magnetic field $B$. First, $V_p$ and $B$ are adjusted so the luminous spot on the fluorescent screen returns to its undeflected centre position; equating electric and magnetic forces ($eV_p/d = Bev$) determines the electron speed $v = V_p/(Bd)$. Second, the electric field is switched off so the magnetic field alone supplies centripetal force ($Bev = mv^2/r$), bending the beam into a measurable circular arc of radius $r$ and yielding $e/m = v/(Br) = V_p/(B^2 d r)$. Thomson obtained $e/m \\approx 1.76 \\times 10^{11}\\text{ C kg}^{-1}$ regardless of cathode metal or residual gas—approximately 1840 times greater than the specific charge of a hydrogen ion ($9.58 \\times 10^7\\text{ C kg}^{-1}$). This proved cathode rays consisted of universal sub-atomic particles with far smaller mass than the lightest known atom, overturning Dalton's indivisible-atom model.`,
    workingSteps: [
      "Describe evacuated tube, heated thermionic cathode, anode slit, parallel plates, Helmholtz coils, and fluorescent screen.",
      "State measurements taken: plate pd $V_p$, plate separation $d$, magnetic flux density $B$, and deflection radius $r$.",
      "Derive beam speed $v = V_p / (Bd)$ from balanced crossed electric and magnetic forces.",
      "Derive $e/m = v / (Br) = V_p / (B^2 d r)$ from pure magnetic circular deflection.",
      "Compare $e/m \\approx 1.76 \\times 10^{11}\\text{ C kg}^{-1}$ with the hydrogen ion (~1840 times larger).",
      "State historical significance: universal sub-atomic constituent much lighter than a hydrogen atom.",
    ],
    criteriaSix: [
      "Describes apparatus cleanly: evacuated tube, heated filament cathode, anode slit, perpendicular E-plates and B-coils, and screen.",
      "Identifies required measurements ($V_p$, $d$, $B$, and deflection radius $r$).",
      "Shows force balance $eE = Bev$ with $E = V_p / d$ gives electron speed $v = V_p / (Bd)$.",
      "Shows pure magnetic circular motion $Bev = mv^2/r$ yields $e/m = v/(Br) = E/(B^2 r)$.",
      "Compares electron specific charge explicitly to the hydrogen ion (~1840 to 2000 times greater).",
      "Explains historical significance: electrons are universal sub-atomic particles much less massive than any atom.",
    ],
    workedSolution: (anchor) =>
      `Level 3 synthesis: ${anchor}; covers apparatus, measurements ($V_p, d, B, r$), algebraic deduction of $v$ and $e/m$, and the ~1840x comparison with $\\text{H}^+$.`,
    planSummary: "Six-mark level-of-response account of Thomson's e/m measurement and historical significance.",
  });
}

function populateTpMillikanOildrop(ctx: BuilderContext): void {
  const kind = "al-opt-tp-millikan-oildrop";
  const conceptId = "uniform-electric-fields";
  const sub = "alevel-3-12-turning-points" as const;

  // 4 Calc MCQs (all strictly g = 9.81 m s^-2)
  pushCalcMcq(ctx, {
    slug: "tp-mil-calc-01",
    conceptId,
    kind,
    domain: "fields",
    subtopicId: sub,
    difficulty: "foundation",
    scenarioSpec: {
      kind,
      oilDensityKgM3: 880,
      airViscosityPaS: 1.81e-5,
      terminalSpeedMs: 1.1e-4,
      plateSeparationM: 0.012,
      balancingVoltageV: 717,
    },
    hiddenQuantities: ["dropletRadiusUm", "dropletRadiusM"],
    requiredGivens: [
      { name: "oilDensityKgM3", value: 880, unit: "kg m⁻³", source: "stem" },
      { name: "airViscosityPaS", value: 1.81e-5, unit: "Pa s", source: "stem" },
      { name: "terminalSpeedMs", value: 1.1e-4, unit: "m s⁻¹", source: "stem" },
      { name: "gravityMs2", value: ALEVEL_GRAVITY_MS2, unit: "m s⁻²", source: "stem" },
    ],
    targetQuantityKey: "dropletRadiusUm",
    unit: "μm",
    stem: "In a Millikan oil-drop experiment with the electric field switched off, an oil droplet of density 880 kg m⁻³ falls at a steady terminal speed of 1.10 × 10⁻⁴ m s⁻¹ through air of viscosity 1.81 × 10⁻⁵ Pa s. Neglecting air upthrust and taking $g = 9.81\\text{ m s}^{-2}$, what is the radius of the droplet?",
    distractors: (q) => {
      const um = numQ(q, "dropletRadiusUm");
      return [
        { value: um * 2, rationale: "Reports the droplet diameter instead of radius." },
        { value: um / Math.sqrt(4.5), rationale: "Uses 2 eta v / (rho g) instead of 9 eta v / (2 rho g)." },
        { value: um * um, rationale: "Forgets to take the square root of r squared." },
      ];
    },
    workedSolution: (_q, ans) =>
      `Equating Stokes drag and weight: $6\\pi\\eta r v = \\frac{4}{3}\\pi r^3 \\rho g \\Rightarrow r = \\sqrt{\\frac{9\\eta v}{2\\rho g}} = \\sqrt{\\frac{9 \\times 1.81 \\times 10^{-5} \\times 1.10 \\times 10^{-4}}{2 \\times 880 \\times 9.81}} = 1.02 \\times 10^{-6}\\text{ m} = ${ans}$.`,
    planSummary: "Calculate Millikan oil droplet radius from terminal speed using Stokes law.",
  });

  pushCalcMcq(ctx, {
    slug: "tp-mil-calc-02",
    conceptId,
    kind,
    domain: "fields",
    subtopicId: sub,
    difficulty: "standard",
    scenarioSpec: {
      kind,
      oilDensityKgM3: 920,
      airViscosityPaS: 1.82e-5,
      terminalSpeedMs: 1.8e-4,
      plateSeparationM: 0.015,
      balancingVoltageV: 1233,
    },
    hiddenQuantities: ["electricFieldVm"],
    requiredGivens: [
      { name: "dropletMassKg", value: 8.05e-15, unit: "kg", source: "stem" },
      { name: "dropletChargeC", value: 9.6e-19, unit: "C", source: "stem" },
      { name: "gravityMs2", value: ALEVEL_GRAVITY_MS2, unit: "m s⁻²", source: "stem" },
    ],
    targetQuantityKey: "electricFieldVm",
    unit: "V m⁻¹",
    stem: "An oil droplet of mass $8.05 \\times 10^{-15}\\text{ kg}$ carrying a net charge of $9.60 \\times 10^{-19}\\text{ C}$ is held completely stationary between horizontal parallel plates. Taking $g = 9.81\\text{ m s}^{-2}$, what uniform electric field strength $E$ is required to balance the droplet?",
    distractors: (q) => {
      const E = numQ(q, "electricFieldVm");
      return [
        { value: E / 9.81, rationale: "Uses mass m instead of weight mg in QE = mg." },
        { value: E * 6, rationale: "Divides by a single elementary charge e instead of the total charge 6e." },
        { value: E * 0.5, rationale: "Halves the electrostatic force balance erroneously." },
      ];
    },
    workedSolution: (_q, ans) =>
      `Stationary balance gives $QE = mg \\Rightarrow E = \\frac{mg}{Q} = \\frac{8.05 \\times 10^{-15} \\times 9.81}{9.60 \\times 10^{-19}} = ${ans}$.`,
    planSummary: "Compute balancing electric field strength for a stationary Millikan oil droplet.",
  });

  pushCalcMcq(ctx, {
    slug: "tp-mil-calc-03",
    conceptId,
    kind,
    domain: "fields",
    subtopicId: sub,
    difficulty: "standard",
    scenarioSpec: {
      kind,
      oilDensityKgM3: 860,
      airViscosityPaS: 1.8e-5,
      terminalSpeedMs: 9.0e-5,
      plateSeparationM: 0.01,
      balancingVoltageV: 592,
    },
    hiddenQuantities: ["nearestIntegerElectrons", "elementaryChargeCount"],
    requiredGivens: [
      { name: "dropletWeightN", value: 2.84e-14, unit: "N", source: "stem" },
      { name: "plateSeparationM", value: 0.01, unit: "m", source: "either" },
      { name: "balancingVoltageV", value: 592, unit: "V", source: "either" },
    ],
    targetQuantityKey: "nearestIntegerElectrons",
    formatter: fmt2,
    stem: "A charged oil droplet of weight $2.84 \\times 10^{-14}\\text{ N}$ is held motionless between parallel plates 10.0 mm apart by a potential difference of 592 V. Given $e = 1.60 \\times 10^{-19}\\text{ C}$, how many excess elementary charges are on the droplet?",
    distractors: () => [
      { value: 2, rationale: "Underestimates Q / e through a rounding error." },
      { value: 5, rationale: "Overestimates the integer electron count." },
      { value: 6, rationale: "Doubles the excess electron count erroneously." },
    ],
    workedSolution: (_q, ans) =>
      `$Q = \\frac{Wd}{V} = \\frac{2.84 \\times 10^{-14} \\times 0.0100}{592} = 4.80 \\times 10^{-19}\\text{ C}$. Dividing by $e = 1.60 \\times 10^{-19}\\text{ C}$ gives $n = ${ans}$ excess electrons.`,
    planSummary: "Determine integer number of excess electrons on a balanced Millikan droplet.",
  });

  pushCalcMcq(ctx, {
    slug: "tp-mil-calc-04",
    conceptId,
    kind,
    domain: "fields",
    subtopicId: sub,
    difficulty: "higher",
    scenarioSpec: {
      kind,
      oilDensityKgM3: 900,
      airViscosityPaS: 1.81e-5,
      terminalSpeedMs: 1.4e-4,
      plateSeparationM: 0.014,
      balancingVoltageV: 948,
    },
    hiddenQuantities: ["balancingVoltageV"],
    requiredGivens: [
      { name: "dropletWeightN", value: 5.42e-14, unit: "N", source: "stem" },
      { name: "plateSeparationM", value: 0.014, unit: "m", source: "either" },
      { name: "dropletChargeC", value: 8.0e-19, unit: "C", source: "stem" },
    ],
    targetQuantityKey: "balancingVoltageV",
    unit: "V",
    stem: "A Millikan droplet of weight $5.42 \\times 10^{-14}\\text{ N}$ carries a net charge of $5e = 8.00 \\times 10^{-19}\\text{ C}$ between parallel plates separated by 14.0 mm. What potential difference across the plates holds the droplet stationary?",
    distractors: (q) => {
      const V = numQ(q, "balancingVoltageV");
      return [
        { value: V / 5, rationale: "Uses 1e instead of 5e in the denominator erroneously? Actually divides by 5 extra." },
        { value: V * 5, rationale: "Substitutes single elementary charge e instead of 5e." },
        { value: V * 0.5, rationale: "Halves the required balancing potential difference." },
      ];
    },
    workedSolution: (_q, ans) =>
      `From $\\frac{QV}{d} = W$, $V = \\frac{Wd}{Q} = \\frac{5.42 \\times 10^{-14} \\times 0.0140}{8.00 \\times 10^{-19}} = ${ans}$.`,
    planSummary: "Compute parallel-plate balancing voltage for a multi-electron Millikan droplet.",
  });

  // 3 Pure Qual MCQs
  pushQualMcq(ctx, {
    slug: "tp-mil-qual-01",
    conceptId,
    kind,
    domain: "fields",
    subtopicId: sub,
    difficulty: "foundation",
    scenarioSpec: {
      kind,
      oilDensityKgM3: 880,
      airViscosityPaS: 1.81e-5,
      terminalSpeedMs: 1.1e-4,
      plateSeparationM: 0.012,
      balancingVoltageV: 717,
    },
    targetQuantityKey: "stokesAssumptionsAnchor",
    stem: "When deriving the radius of a falling Millikan droplet from $6\\pi\\eta r v = \\frac{4}{3}\\pi r^3 \\rho g$, which physical assumptions are required?",
    correctOption: (a) => `It is assumed that the ${a}.`,
    distractors: [
      {
        text: "The droplet is cubical moves at turbulent high speed and experiences zero viscous drag.",
        rationale: "Stokes' law applies strictly to slow laminar flow around a sphere.",
      },
      {
        text: "The chamber is fully evacuated so air viscosity drops to zero during terminal fall.",
        rationale: "Air viscosity is essential to establish a measurable terminal speed when the electric field is off.",
      },
      {
        text: "Air density exceeds oil density so upward buoyancy dominates over weight.",
        rationale: "Oil density is ~700 times air density, making air upthrust negligible.",
      },
    ],
    workedSolution: (a) =>
      `Applying $6\\pi\\eta r v = \\frac{4}{3}\\pi r^3 \\rho g$ requires that the ${a}.`,
    planSummary: "Identify physical assumptions underlying Stokes law in Millikan's experiment.",
  });

  pushQualMcq(ctx, {
    slug: "tp-mil-qual-02",
    conceptId,
    kind,
    domain: "fields",
    subtopicId: sub,
    difficulty: "foundation",
    scenarioSpec: {
      kind,
      oilDensityKgM3: 880,
      airViscosityPaS: 1.81e-5,
      terminalSpeedMs: 1.1e-4,
      plateSeparationM: 0.012,
      balancingVoltageV: 717,
    },
    targetQuantityKey: "quantisationConclusionAnchor",
    stem: "What fundamental property of nature did Millikan establish by repeating his oil-drop measurements across hundreds of droplets?",
    correctOption: (a) => `He demonstrated that ${a}.`,
    distractors: [
      {
        text: "Oil droplets can carry any continuous fractional charge down to arbitrarily small values.",
        rationale: "Millikan's data revealed discrete steps of 1.60 × 10^-19 C, disproving continuous charge.",
      },
      {
        text: "Gravitational field strength varies linearly with electric field strength between metal plates.",
        rationale: "Gravity stayed constant while electric force balanced weight.",
      },
      {
        text: "Every oil droplet carries identical mass regardless of atomiser spray conditions.",
        rationale: "Droplet radii and masses varied widely; it was charge that appeared in integer steps of e.",
      },
    ],
    workedSolution: (a) =>
      `Millikan's landmark finding was that ${a} ($e = 1.60 \\times 10^{-19}\\text{ C}$).`,
    planSummary: "State Millikan's charge quantisation conclusion.",
  });

  pushQualMcq(ctx, {
    slug: "tp-mil-qual-03",
    conceptId,
    kind,
    domain: "fields",
    subtopicId: sub,
    difficulty: "standard",
    scenarioSpec: {
      kind,
      oilDensityKgM3: 880,
      airViscosityPaS: 1.81e-5,
      terminalSpeedMs: 1.1e-4,
      plateSeparationM: 0.012,
      balancingVoltageV: 717,
    },
    targetQuantityKey: "ionisationShiftAnchor",
    stem: "A negatively charged oil droplet is held stationary between horizontal plates (top plate positive) when a brief burst of X-rays knocks one electron off the droplet. What happens and how must the plate voltage be adjusted to restore equilibrium?",
    correctOption: (a) => `The droplet begins to fall because ${a}.`,
    distractors: [
      {
        text: "The droplet accelerates upward because losing an electron doubles its negative charge.",
        rationale: "Removing an electron from a negatively charged droplet reduces the magnitude of its negative charge.",
      },
      {
        text: "The droplet remains stationary because weight and viscosity are unaffected by X-rays.",
        rationale: "Reduced charge lowers upward electric force QV / d below weight mg, causing downward motion.",
      },
      {
        text: "The droplet accelerates upward and requires a smaller potential difference to hold steady.",
        rationale: "With smaller Q, a larger V is needed to maintain QV / d = mg.",
      },
    ],
    workedSolution: (a) =>
      `Because $QV/d = mg$, ${a} to hold the droplet stationary again.`,
    planSummary: "Predict effect of X-ray ionisation on a stationary Millikan oil droplet.",
  });

  // 4 Multi-part Structured
  pushStructured(ctx, {
    slug: "tp-mil-str-01",
    conceptId,
    kind,
    domain: "fields",
    subtopicId: sub,
    difficulty: "standard",
    questionStyle: "mixed-exam",
    scenarioSpec: {
      kind,
      oilDensityKgM3: 880,
      airViscosityPaS: 1.81e-5,
      terminalSpeedMs: 1.1e-4,
      plateSeparationM: 0.012,
      balancingVoltageV: 717,
    },
    hiddenQuantities: [
      "dropletRadiusUm",
      "dropletMassKg",
      "dropletChargeC",
      "nearestIntegerElectrons",
    ],
    requiredGivens: [
      { name: "oilDensityKgM3", value: 880, unit: "kg m⁻³", source: "stem" },
      { name: "airViscosityPaS", value: 1.81e-5, unit: "Pa s", source: "stem" },
      { name: "terminalSpeedMs", value: 1.1e-4, unit: "m s⁻¹", source: "stem" },
      { name: "plateSeparationM", value: 0.012, unit: "m", source: "either" },
      { name: "balancingVoltageV", value: 717, unit: "V", source: "either" },
      { name: "gravityMs2", value: ALEVEL_GRAVITY_MS2, unit: "m s⁻²", source: "stem" },
    ],
    stem: "In a Millikan chamber ($g = 9.81\\text{ m s}^{-2}$, air viscosity $\\eta = 1.81 \\times 10^{-5}\\text{ Pa s}$), an oil droplet of density 880 kg m⁻³ falls at a terminal speed of 1.10 × 10⁻⁴ m s⁻¹ with the electric field off, and is held stationary by 717 V across plates separated by 12.0 mm.",
    build: (q) => {
      const rUm = numQ(q, "dropletRadiusUm");
      const m = numQ(q, "dropletMassKg");
      const Q = numQ(q, "dropletChargeC");
      const n = numQ(q, "nearestIntegerElectrons");
      return {
        parts: [
          {
            partId: "a",
            prompt: "Calculate the radius of the oil droplet in micrometres, assuming air upthrust is negligible.",
            marks: 2,
            targetQuantityKey: "dropletRadiusUm",
            expectedAnswer: fmt3(rUm, "μm"),
            workingSteps: [
              `$r = \\sqrt{\\frac{9\\eta v}{2\\rho g}} = \\sqrt{\\frac{9 \\times 1.81 \\times 10^{-5} \\times 1.10 \\times 10^{-4}}{2 \\times 880 \\times 9.81}} = ${fmt3(rUm, "μm")}$.`,
            ],
          },
          {
            partId: "b",
            prompt: "Calculate the mass of the droplet.",
            marks: 2,
            dependsOnPartIds: ["a"],
            targetQuantityKey: "dropletMassKg",
            expectedAnswer: fmt3(m, "kg"),
            workingSteps: [
              `$m = \\frac{4}{3}\\pi r^3 \\rho = \\frac{4}{3}\\pi (1.019 \\times 10^{-6})^3 \\times 880 = ${fmt3(m, "kg")}$.`,
            ],
          },
          {
            partId: "c",
            prompt: "Calculate the electric charge on the droplet and deduce the integer number of excess electrons ($e = 1.60 \\times 10^{-19}\\text{ C}$).",
            marks: 3,
            dependsOnPartIds: ["b"],
            targetQuantityKey: "dropletChargeC",
            expectedAnswer: `${fmt3(Q, "C")} (corresponding to ${fmt2(n)} excess electrons).`,
            workingSteps: [
              `$Q = \\frac{mgd}{V} = \\frac{3.90 \\times 10^{-15} \\times 9.81 \\times 0.0120}{717} = ${fmt3(Q, "C")}$.`,
              `Divide by $1.60 \\times 10^{-19}\\text{ C}$ to find $n = ${fmt2(n)}$.`,
            ],
          },
        ],
        markScheme: [
          { code: "M1", criterion: "Applies $6\\pi\\eta r v = \\frac{4}{3}\\pi r^3 \\rho g$ with $g = 9.81\\text{ m s}^{-2}$.", marks: 1, partId: "a" },
          { code: "A1", criterion: `Correct radius ${fmt3(rUm, "μm")}.`, marks: 1, partId: "a" },
          { code: "M1", criterion: "Applies $m = \\frac{4}{3}\\pi r^3 \\rho$.", marks: 1, partId: "b" },
          { code: "A1", criterion: `Correct mass ${fmt3(m, "kg")}.`, marks: 1, partId: "b" },
          { code: "M1", criterion: "Uses $Q = mgd / V$ with $d = 0.0120\\text{ m}$.", marks: 1, partId: "c" },
          { code: "A1", criterion: `Correct charge ${fmt3(Q, "C")}.`, marks: 1, partId: "c" },
          { code: "A1", criterion: `Divides by $1.60 \\times 10^{-19}\\text{ C}$ to conclude ${fmt2(n)} excess electrons.`, marks: 1, partId: "c" },
        ],
        workedSolution: `(a) $r = ${fmt3(rUm, "μm")}$. (b) $m = ${fmt3(m, "kg")}$. (c) $Q = ${fmt3(Q, "C")}$, which is ${fmt2(n)} excess electrons.`,
      };
    },
    planSummary: "Full two-stage Millikan oil-drop calculation of radius, mass, charge, and electron count.",
    subpartPlan: ["droplet radius via Stokes law", "droplet mass", "droplet charge and integer count"],
  });

  pushStructured(ctx, {
    slug: "tp-mil-str-02",
    conceptId,
    kind,
    domain: "fields",
    subtopicId: sub,
    difficulty: "standard",
    questionStyle: "mixed-exam",
    scenarioSpec: {
      kind,
      oilDensityKgM3: 920,
      airViscosityPaS: 1.82e-5,
      terminalSpeedMs: 1.8e-4,
      plateSeparationM: 0.015,
      balancingVoltageV: 1233,
    },
    hiddenQuantities: [
      "dropletRadiusM",
      "electricFieldVm",
      "stokesAssumptionsAnchor",
    ],
    requiredGivens: [
      { name: "oilDensityKgM3", value: 920, unit: "kg m⁻³", source: "stem" },
      { name: "airViscosityPaS", value: 1.82e-5, unit: "Pa s", source: "stem" },
      { name: "terminalSpeedMs", value: 1.8e-4, unit: "m s⁻¹", source: "stem" },
      { name: "plateSeparationM", value: 0.015, unit: "m", source: "either" },
      { name: "balancingVoltageV", value: 1233, unit: "V", source: "either" },
      { name: "gravityMs2", value: ALEVEL_GRAVITY_MS2, unit: "m s⁻²", source: "stem" },
    ],
    stem: "A fine oil droplet (density 920 kg m⁻³) falls in air ($\\eta = 1.82 \\times 10^{-5}\\text{ Pa s}$, $g = 9.81\\text{ m s}^{-2}$) at terminal speed 1.80 × 10⁻⁴ m s⁻¹, and is balanced by 1233 V across horizontal plates 15.0 mm apart.",
    build: (q) => {
      const r = numQ(q, "dropletRadiusM");
      const E = numQ(q, "electricFieldVm");
      const assump = strQ(q, "stokesAssumptionsAnchor");
      return {
        parts: [
          {
            partId: "a",
            prompt: "Calculate the radius of the oil droplet in metres.",
            marks: 2,
            targetQuantityKey: "dropletRadiusM",
            expectedAnswer: fmt3(r, "m"),
            workingSteps: [`$r = \\sqrt{\\frac{9 \\times 1.82 \\times 10^{-5} \\times 1.80 \\times 10^{-4}}{2 \\times 920 \\times 9.81}} = ${fmt3(r, "m")}$.`],
          },
          {
            partId: "b",
            prompt: "Calculate the uniform electric field strength between the parallel plates.",
            marks: 2,
            targetQuantityKey: "electricFieldVm",
            expectedAnswer: fmt3(E, "V m⁻¹"),
            workingSteps: [`$E = \\frac{1233}{0.0150} = ${fmt3(E, "V m⁻¹")}$.`],
          },
          {
            partId: "c",
            prompt: "State two physical assumptions made when using Stokes' law to calculate the droplet's radius.",
            marks: 2,
            targetMode: "qualitative",
            targetQuantityKey: "stokesAssumptionsAnchor",
            expectedAnswer: `The calculation assumes that the ${assump}.`,
            workingSteps: [
              "Sphere geometry and slow laminar airflow.",
              "Air upthrust is negligible compared with droplet weight.",
            ],
          },
        ],
        markScheme: [
          { code: "M1", criterion: "Uses $r = \\sqrt{9\\eta v / (2\\rho g)}$ with $g = 9.81\\text{ m s}^{-2}$.", marks: 1, partId: "a" },
          { code: "A1", criterion: `Correct radius ${fmt3(r, "m")}.`, marks: 1, partId: "a" },
          { code: "M1", criterion: "Applies $E = V / d = 1233 / 0.0150$.", marks: 1, partId: "b" },
          { code: "A1", criterion: `Correct electric field ${fmt3(E, "V m⁻¹")}.`, marks: 1, partId: "b" },
          { code: "B1", criterion: "States droplet is spherical moving slowly in laminar airflow.", marks: 1, partId: "c" },
          { code: "B1", criterion: "States upthrust from air is negligible.", marks: 1, partId: "c" },
        ],
        workedSolution: `(a) $r = ${fmt3(r, "m")}$. (b) $E = ${fmt3(E, "V m⁻¹")}$. (c) ${assump}.`,
      };
    },
    planSummary: "Calculate Millikan droplet radius and field strength and state Stokes law assumptions.",
    subpartPlan: ["droplet radius", "electric field strength", "Stokes assumptions"],
  });

  pushStructured(ctx, {
    slug: "tp-mil-str-03",
    conceptId,
    kind,
    domain: "fields",
    subtopicId: sub,
    difficulty: "standard",
    questionStyle: "mixed-exam",
    scenarioSpec: {
      kind,
      oilDensityKgM3: 860,
      airViscosityPaS: 1.8e-5,
      terminalSpeedMs: 9.0e-5,
      plateSeparationM: 0.01,
      balancingVoltageV: 592,
    },
    hiddenQuantities: [
      "dropletWeightN",
      "dropletChargeC",
      "quantisationConclusionAnchor",
    ],
    requiredGivens: [
      { name: "oilDensityKgM3", value: 860, unit: "kg m⁻³", source: "stem" },
      { name: "airViscosityPaS", value: 1.8e-5, unit: "Pa s", source: "stem" },
      { name: "terminalSpeedMs", value: 9.0e-5, unit: "m s⁻¹", source: "stem" },
      { name: "plateSeparationM", value: 0.01, unit: "m", source: "either" },
      { name: "balancingVoltageV", value: 592, unit: "V", source: "either" },
      { name: "gravityMs2", value: ALEVEL_GRAVITY_MS2, unit: "m s⁻²", source: "stem" },
    ],
    stem: "A droplet of oil (density 860 kg m⁻³) falls at 9.00 × 10⁻⁵ m s⁻¹ in air ($\\eta = 1.80 \\times 10^{-5}\\text{ Pa s}$, $g = 9.81\\text{ m s}^{-2}$) and is held stationary by 592 V across plates 10.0 mm apart.",
    build: (q) => {
      const w = numQ(q, "dropletWeightN");
      const Q = numQ(q, "dropletChargeC");
      const quant = strQ(q, "quantisationConclusionAnchor");
      return {
        parts: [
          {
            partId: "a",
            prompt: "Calculate the weight of the oil droplet.",
            marks: 3,
            targetQuantityKey: "dropletWeightN",
            expectedAnswer: fmt3(w, "N"),
            workingSteps: [
              "$r = \\sqrt{\\frac{9 \\times 1.80 \\times 10^{-5} \\times 9.00 \\times 10^{-5}}{2 \\times 860 \\times 9.81}} = 9.30 \\times 10^{-7}\\text{ m}$.",
              `$W = 6\\pi\\eta r v = ${fmt3(w, "N")}$.`,
            ],
          },
          {
            partId: "b",
            prompt: "Calculate the charge $Q$ on the droplet.",
            marks: 2,
            dependsOnPartIds: ["a"],
            targetQuantityKey: "dropletChargeC",
            expectedAnswer: fmt3(Q, "C"),
            workingSteps: [`$Q = \\frac{Wd}{V} = \\frac{2.84 \\times 10^{-14} \\times 0.0100}{592} = ${fmt3(Q, "C")}$.`],
          },
          {
            partId: "c",
            prompt: "Explain how repeating this calculation for many droplets led to the concept of charge quantisation.",
            marks: 2,
            targetMode: "qualitative",
            targetQuantityKey: "quantisationConclusionAnchor",
            expectedAnswer: `Millikan found that ${quant}, never smaller fractions of $1.60 \\times 10^{-19}\\text{ C}$.`,
            workingSteps: [
              "Every measured droplet charge was a whole-number multiple of $1.60 \\times 10^{-19}\\text{ C}$.",
              "Hence charge exists in discrete packets of the elementary charge $e$.",
            ],
          },
        ],
        markScheme: [
          { code: "M1", criterion: "Calculates $r = 9.30 \\times 10^{-7}\\text{ m}$ using Stokes law.", marks: 1, partId: "a" },
          { code: "M1", criterion: "Evaluates $W = 6\\pi\\eta r v$ or $\\frac{4}{3}\\pi r^3 \\rho g$.", marks: 1, partId: "a" },
          { code: "A1", criterion: `Correct weight ${fmt3(w, "N")}.`, marks: 1, partId: "a" },
          { code: "M1", criterion: "Applies $Q = Wd / V$.", marks: 1, partId: "b" },
          { code: "A1", criterion: `Correct charge ${fmt3(Q, "C")}.`, marks: 1, partId: "b" },
          { code: "B1", criterion: "States every measured charge is an integer multiple of $1.60 \\times 10^{-19}\\text{ C}$.", marks: 1, partId: "c" },
          { code: "B1", criterion: "Concludes electric charge is quantised in discrete units of $e$.", marks: 1, partId: "c" },
        ],
        workedSolution: `(a) $W = ${fmt3(w, "N")}$. (b) $Q = ${fmt3(Q, "C")}$. (c) ${quant}.`,
      };
    },
    planSummary: "Compute oil-drop weight and charge and explain charge quantisation evidence.",
    subpartPlan: ["droplet weight", "droplet charge", "quantisation conclusion"],
  });

  pushStructured(ctx, {
    slug: "tp-mil-str-04",
    conceptId,
    kind,
    domain: "fields",
    subtopicId: sub,
    difficulty: "higher",
    questionStyle: "mixed-exam",
    scenarioSpec: {
      kind,
      oilDensityKgM3: 900,
      airViscosityPaS: 1.81e-5,
      terminalSpeedMs: 1.4e-4,
      plateSeparationM: 0.014,
      balancingVoltageV: 948,
    },
    hiddenQuantities: [
      "dropletRadiusUm",
      "dropletChargeC",
      "ionisationShiftAnchor",
    ],
    requiredGivens: [
      { name: "oilDensityKgM3", value: 900, unit: "kg m⁻³", source: "stem" },
      { name: "airViscosityPaS", value: 1.81e-5, unit: "Pa s", source: "stem" },
      { name: "terminalSpeedMs", value: 1.4e-4, unit: "m s⁻¹", source: "stem" },
      { name: "plateSeparationM", value: 0.014, unit: "m", source: "either" },
      { name: "balancingVoltageV", value: 948, unit: "V", source: "either" },
      { name: "gravityMs2", value: ALEVEL_GRAVITY_MS2, unit: "m s⁻²", source: "stem" },
    ],
    stem: "During a Millikan practical ($g = 9.81\\text{ m s}^{-2}$, $\\eta = 1.81 \\times 10^{-5}\\text{ Pa s}$), an oil droplet ($\\rho = 900\\text{ kg m}^{-3}$) has terminal speed 1.40 × 10⁻⁴ m s⁻¹ and is balanced by 948 V across plates 14.0 mm apart.",
    build: (q) => {
      const rUm = numQ(q, "dropletRadiusUm");
      const Q = numQ(q, "dropletChargeC");
      const ion = strQ(q, "ionisationShiftAnchor");
      return {
        parts: [
          {
            partId: "a",
            prompt: "Calculate the radius of the droplet in micrometres.",
            marks: 2,
            targetQuantityKey: "dropletRadiusUm",
            expectedAnswer: fmt3(rUm, "μm"),
            workingSteps: [`$r = \\sqrt{\\frac{9 \\times 1.81 \\times 10^{-5} \\times 1.40 \\times 10^{-4}}{2 \\times 900 \\times 9.81}} = ${fmt3(rUm, "μm")}$.`],
          },
          {
            partId: "b",
            prompt: "Determine the initial charge on the droplet.",
            marks: 2,
            dependsOnPartIds: ["a"],
            targetQuantityKey: "dropletChargeC",
            expectedAnswer: fmt3(Q, "C"),
            workingSteps: [`$W = 6\\pi\\eta r v = 5.42 \\times 10^{-14}\\text{ N}$, so $Q = \\frac{Wd}{V} = ${fmt3(Q, "C")}$.`],
          },
          {
            partId: "c",
            prompt: "State and explain how the balancing voltage must change if the droplet suddenly loses one excess electron due to ionising radiation.",
            marks: 2,
            targetMode: "qualitative",
            targetQuantityKey: "ionisationShiftAnchor",
            expectedAnswer: `The balancing voltage must increase because ${ion}.`,
            workingSteps: [
              "Loss of one electron lowers $|Q|$ from $5e$ to $4e$.",
              "Since $QV/d = mg$ with $mg$ constant, $V$ must rise to restore equilibrium.",
            ],
          },
        ],
        markScheme: [
          { code: "M1", criterion: "Applies Stokes law with $g = 9.81\\text{ m s}^{-2}$.", marks: 1, partId: "a" },
          { code: "A1", criterion: `Correct radius ${fmt3(rUm, "μm")}.`, marks: 1, partId: "a" },
          { code: "M1", criterion: "Applies $Q = 6\\pi\\eta r v d / V$.", marks: 1, partId: "b" },
          { code: "A1", criterion: `Correct charge ${fmt3(Q, "C")}.`, marks: 1, partId: "b" },
          { code: "B1", criterion: "States losing one electron reduces droplet charge and upward electric force.", marks: 1, partId: "c" },
          { code: "B1", criterion: "Concludes a higher balancing potential difference is required to keep $QV/d = mg$.", marks: 1, partId: "c" },
        ],
        workedSolution: `(a) $r = ${fmt3(rUm, "μm")}$. (b) $Q = ${fmt3(Q, "C")}$. (c) ${ion}.`,
      };
    },
    planSummary: "Compute Millikan radius and charge and explain response to single-electron ionisation.",
    subpartPlan: ["droplet radius", "initial charge", "ionisation voltage adjustment"],
  });

  // 1 Authentic 6-Mark LoR
  pushSixMarkLor(ctx, {
    slug: "tp-mil-lor-01",
    conceptId,
    kind,
    domain: "fields",
    subtopicId: sub,
    scenarioSpec: {
      kind,
      oilDensityKgM3: 880,
      airViscosityPaS: 1.81e-5,
      terminalSpeedMs: 1.1e-4,
      plateSeparationM: 0.012,
      balancingVoltageV: 717,
    },
    targetQuantityKey: "lorMillikanAnchor",
    stem: "Robert Millikan's oil-drop experiment provided the first direct precision measurement of the elementary charge $e$ and combined with Thomson's $e/m$ yielded the mass of the electron.",
    prompt:
      "Describe the experimental procedure, measurements, physical assumptions, and equations used in Millikan's oil-drop experiment to determine a droplet's charge, and explain the significance of repeating the measurement across many droplets.",
    expectedAnswer: (anchor) =>
      `Millikan's experiment uses a two-stage force balance in which ${anchor}. Fine oil droplets sprayed from an atomiser become charged by friction and enter a chamber between horizontal parallel plates of measured separation $d$, illuminated from the side and viewed through a travelling microscope with a calibrated graticule. In Stage 1 (electric field off), a droplet falls at constant terminal velocity $v$ (measured by timing its passage across graticule divisions). Assuming the droplet is spherical, moves slowly in laminar airflow, and air upthrust is negligible, viscous Stokes drag balances weight: $6\\pi\\eta r v = \\frac{4}{3}\\pi r^3 \\rho g$, which yields droplet radius $r = \\sqrt{9\\eta v / (2\\rho g)}$ and hence mass $m = \\frac{4}{3}\\pi r^3 \\rho$. In Stage 2 (electric field on), the plate potential difference $V$ is adjusted until the droplet hovers completely stationary, where upward electrostatic force equals weight: $QV/d = mg$, giving $Q = mgd/V$. Repeating this across hundreds of droplets revealed that every measured charge—and every step change after X-ray ionisation—was an integer multiple of $1.60 \\times 10^{-19}\\text{ C}$, proving that electric charge is quantised and enabling calculation of electron mass $m_e$ from Thomson's $e/m$.`,
    workingSteps: [
      "Describe apparatus: atomiser, parallel plates separation $d$, variable DC supply $V$, illumination, and calibrated microscope.",
      "Stage 1 (field off): time constant terminal fall speed $v$ across known vertical distance.",
      "Apply Stokes' law $6\\pi\\eta r v = \\frac{4}{3}\\pi r^3 \\rho g$ to derive radius $r$ and mass $m$.",
      "State key assumptions: spherical droplet, slow laminar flow, negligible air upthrust.",
      "Stage 2 (field on): adjust $V$ to hold droplet stationary so $QV/d = mg$ gives $Q = mgd/V$.",
      "Explain significance: all charges are integer multiples of $e = 1.60 \\times 10^{-19}\\text{ C}$ (charge quantisation) and determine $m_e$ via Thomson's $e/m$.",
    ],
    criteriaSix: [
      "Describes experimental arrangement (sprayed oil droplets between parallel plates separation $d$, illuminated and timed via calibrated microscope).",
      "Explains Stage 1 (field off): measuring constant terminal velocity $v$ and equating $6\\pi\\eta r v = \\frac{4}{3}\\pi r^3 \\rho g$ to deduce $r$ and $m$.",
      "States explicit physical assumptions: spherical droplet, laminar airflow, and negligible upthrust from air.",
      "Explains Stage 2 (field on): adjusting $V$ to hold the droplet stationary and applying $QV/d = mg$ to compute $Q$.",
      "Explains quantisation conclusion: all measured charges and ionisation steps are integer multiples of $e = 1.60 \\times 10^{-19}\\text{ C}$.",
      "Notes combining Millikan's $e$ with Thomson's $e/m$ determined the electron rest mass $m_e$.",
    ],
    workedSolution: (anchor) =>
      `Level 3 synthesis: ${anchor}; covers apparatus, Stage 1 Stokes radius derivation, explicit physical assumptions, Stage 2 $QV/d = mg$, and charge quantisation.`,
    planSummary: "Six-mark level-of-response account of Millikan's oil-drop procedure, assumptions, and quantisation.",
  });
}

function populateTpLightHertzMaxwell(ctx: BuilderContext): void {
  const kind = "al-opt-tp-light-hertz-maxwell";
  const conceptId = "progressive-waves-polarization";
  const sub = "alevel-3-12-turning-points" as const;

  // 4 Calc MCQs
  pushCalcMcq(ctx, {
    slug: "tp-hz-calc-01",
    conceptId,
    kind,
    domain: "waves",
    subtopicId: sub,
    difficulty: "foundation",
    scenarioSpec: {
      kind,
      mode: "hertz-polarisation",
      nodeSpacingM: 0.3,
      detectorAngleDeg: 0,
      peakAmplitudeMv: 100,
    },
    hiddenQuantities: ["frequencyMHz", "wavelengthM"],
    requiredGivens: [
      { name: "nodeSpacingM", value: 0.3, unit: "m", source: "stem" },
    ],
    targetQuantityKey: "frequencyMHz",
    unit: "MHz",
    stem: "In a modern replication of Hertz's standing-wave radio experiment, a dipole detector moved toward a flat metal reflector locates adjacent signal minima (nodes) spaced 0.300 m apart. Taking $c = 3.00 \\times 10^8\\text{ m s}^{-1}$, what is the frequency of the radio waves?",
    distractors: () => [
      { value: 1000, rationale: "Treats adjacent node spacing as one full wavelength lambda instead of lambda / 2." },
      { value: 250, rationale: "Divides frequency by two erroneously." },
      { value: 90.0, rationale: "Multiplies c by node spacing instead of dividing c / (2 d)." },
    ],
    workedSolution: (_q, ans) =>
      `Adjacent standing-wave nodes are separated by $\\frac{\\lambda}{2} = 0.300\\text{ m}$, so $\\lambda = 0.600\\text{ m}$. Hence $f = \\frac{c}{\\lambda} = \\frac{3.00 \\times 10^8}{0.600} = 5.00 \\times 10^8\\text{ Hz} = ${ans}$.`,
    planSummary: "Calculate Hertz standing radio-wave frequency from adjacent node spacing.",
  });

  pushCalcMcq(ctx, {
    slug: "tp-hz-calc-02",
    conceptId,
    kind,
    domain: "waves",
    subtopicId: sub,
    difficulty: "standard",
    scenarioSpec: {
      kind,
      mode: "fizeau-maxwell",
      wheelTeeth: 720,
      mirrorDistanceM: 8630,
    },
    hiddenQuantities: ["firstEclipseFreqHz"],
    requiredGivens: [
      { name: "wheelTeeth", value: 720, source: "stem" },
      { name: "mirrorDistanceM", value: 8630, unit: "m", source: "stem" },
    ],
    targetQuantityKey: "firstEclipseFreqHz",
    unit: "Hz",
    stem: "In Fizeau's rotating toothed-wheel measurement of the speed of light ($c = 3.00 \\times 10^8\\text{ m s}^{-1}$), a wheel with 720 evenly spaced teeth reflects a light pulse off a mirror 8630 m away. Using $c = 4 n f d$, what is the lowest rotation frequency $f$ of the wheel at which the returning beam is first eclipsed by the adjacent tooth?",
    distractors: (q) => {
      const f = numQ(q, "firstEclipseFreqHz");
      return [
        { value: f * 2, rationale: "Uses c = 2 n f d instead of 4 n f d (missing the half-tooth-pitch eclipse factor)." },
        { value: f * 4, rationale: "Omits both the return-trip factor of 2 and half-tooth factor of 2." },
        { value: f * 0.5, rationale: "Divides rotation frequency by two erroneously." },
      ];
    },
    workedSolution: (_q, ans) =>
      `During the round trip $2d / c$, the wheel turns by half a tooth-gap spacing ($\\frac{1}{2n}$ revolution), so $c = 4nfd \\Rightarrow f = \\frac{3.00 \\times 10^8}{4 \\times 720 \\times 8630} = ${ans}$.`,
    planSummary: "Compute lowest eclipse rotation frequency in Fizeau's toothed-wheel experiment.",
  });

  pushCalcMcq(ctx, {
    slug: "tp-hz-calc-03",
    conceptId,
    kind,
    domain: "waves",
    subtopicId: sub,
    difficulty: "foundation",
    scenarioSpec: {
      kind,
      mode: "hertz-polarisation",
      nodeSpacingM: 0.4,
      detectorAngleDeg: 60,
      peakAmplitudeMv: 160,
    },
    hiddenQuantities: ["detectedAmplitudeMv"],
    requiredGivens: [
      { name: "detectorAngleDeg", value: 60, source: "stem" },
      { name: "peakAmplitudeMv", value: 160, unit: "mV", source: "stem" },
    ],
    targetQuantityKey: "detectedAmplitudeMv",
    unit: "mV",
    stem: "A plane-polarised radio wave from a Hertz transmitter induces a maximum emf amplitude of 160 mV when the receiving dipole aerial is aligned parallel to the transmitter ($\\theta = 0°$). What signal amplitude is detected when the receiving dipole is rotated to $\\theta = 60°$?",
    distractors: () => [
      { value: 40.0, rationale: "Applies cos squared (Malus intensity law) instead of |cos theta| for dipole induced emf amplitude." },
      { value: 139, rationale: "Uses sin(60°) instead of cos(60°)." },
      { value: 107, rationale: "Applies linear interpolation (1 - 60/180) instead of cosine projection." },
    ],
    workedSolution: (_q, ans) =>
      `The induced emf amplitude scales with the electric-field component parallel to the dipole: $A = A_0 |\\cos\\theta| = 160 \\times \\cos 60° = ${ans}$.`,
    planSummary: "Calculate rotated Hertz dipole signal amplitude using |cos theta|.",
  });

  pushCalcMcq(ctx, {
    slug: "tp-hz-calc-04",
    conceptId,
    kind,
    domain: "waves",
    subtopicId: sub,
    difficulty: "standard",
    scenarioSpec: {
      kind,
      mode: "refraction-corpuscular",
      incidentAngleDeg: 45,
      refractiveIndex: 1.33,
    },
    hiddenQuantities: ["huygensSpeedInMediumMs", "newtonPredictedSpeedMs"],
    requiredGivens: [
      { name: "refractiveIndex", value: 1.33, source: "stem" },
    ],
    targetQuantityKey: "huygensSpeedInMediumMs",
    unit: "m s⁻¹",
    stem: "Water has a refractive index of 1.33 for yellow light ($c = 3.00 \\times 10^8\\text{ m s}^{-1}$). What speed of light in water was predicted by Huygens' wave theory and later confirmed experimentally by Foucault in 1850?",
    distractors: (q) => [
      { value: numQ(q, "newtonPredictedSpeedMs"), rationale: "Applies Newton's corpuscular prediction v = n c > c, which Foucault disproved." },
      { value: 3.0e8 / (1.33 * 1.33), rationale: "Divides c by n squared instead of n." },
      { value: 3.0e8 / 2.66, rationale: "Doubles the refractive index erroneously." },
    ],
    workedSolution: (_q, ans) =>
      `Huygens' wave theory predicts light slows in optically denser water: $v_{\\text{water}} = \\frac{c}{n} = \\frac{3.00 \\times 10^8}{1.33} = ${ans}$ (whereas Newton's corpuscular model predicted $nc = 3.99 \\times 10^8\\text{ m s}^{-1}$).`,
    planSummary: "Calculate Huygens wave-theory speed of light in water versus Newton corpuscular prediction.",
  });

  // 3 Pure Qual MCQs
  pushQualMcq(ctx, {
    slug: "tp-hz-qual-01",
    conceptId,
    kind,
    domain: "waves",
    subtopicId: sub,
    difficulty: "foundation",
    scenarioSpec: {
      kind,
      mode: "refraction-corpuscular",
      incidentAngleDeg: 40,
      refractiveIndex: 1.33,
    },
    targetQuantityKey: "newtonVsHuygensAnchor",
    stem: "How did Foucault's 1850 measurement of the speed of light in water decisively settle the historical rivalry between Newton's corpuscular model and Huygens' wave model of refraction?",
    correctOption: (a) => `It resolved the dispute because ${a}.`,
    distractors: [
      {
        text: "Newton corpuscular theory predicted light slows in water whereas Huygens predicted light speeds up in water.",
        rationale: "Reverses the two historical predictions: Newton argued attractive forces accelerated corpuscles into water.",
      },
      {
        text: "Both models predicted equal speeds in water and air, so Foucault's test proved both wrong.",
        rationale: "The two models made opposite predictions (v_water > v_air vs v_water < v_air), allowing a decisive test.",
      },
      {
        text: "Foucault showed that light does not refract at an air-water boundary unless polarised.",
        rationale: "Refraction occurs for all unpolarised light; Foucault measured the speed inside water directly.",
      },
    ],
    workedSolution: (a) =>
      `To bend toward the normal, ${a}.`,
    planSummary: "Contrast Newton corpuscular versus Huygens wave refraction predictions.",
  });

  pushQualMcq(ctx, {
    slug: "tp-hz-qual-02",
    conceptId,
    kind,
    domain: "waves",
    subtopicId: sub,
    difficulty: "standard",
    scenarioSpec: {
      kind,
      mode: "hertz-polarisation",
      nodeSpacingM: 0.35,
      detectorAngleDeg: 90,
      peakAmplitudeMv: 120,
    },
    targetQuantityKey: "hertzPolarisationAnchor",
    stem: "When Hertz rotated his dipole loop detector through a full circle facing a vertical spark-gap transmitter, what amplitude pattern was recorded and what did it prove?",
    correctOption: (a) => `He found that the ${a}.`,
    distractors: [
      {
        text: "Detected signal stayed constant at every rotation angle proving radio waves are longitudinal compressions.",
        rationale: "A longitudinal wave cannot be polarised; Hertz observed clear maxima and zeros every 90 degrees.",
      },
      {
        text: "Detected signal peaked at ninety degrees and vanished at zero degrees because magnetic force dominates.",
        rationale: "Maximum induced emf occurs when the dipole aligns parallel to the transmitter's electric field (0 and 180 degrees).",
      },
      {
        text: "Detected signal vanished only at one hundred eighty degrees proving waves travel along one direction only.",
        rationale: "At 180 degrees the dipole is again parallel to the oscillating E-field, producing a second maximum.",
      },
    ],
    workedSolution: (a) =>
      `Hertz's polarisation test confirmed Maxwell's prediction because the ${a}.`,
    planSummary: "Interpret Hertz dipole rotation maxima and nulls as evidence for transverse EM waves.",
  });

  pushQualMcq(ctx, {
    slug: "tp-hz-qual-03",
    conceptId,
    kind,
    domain: "waves",
    subtopicId: sub,
    difficulty: "foundation",
    scenarioSpec: {
      kind,
      mode: "fizeau-maxwell",
      wheelTeeth: 720,
      mirrorDistanceM: 8630,
    },
    targetQuantityKey: "maxwellSignificanceAnchor",
    stem: "Why was James Clerk Maxwell's derivation of $c = \\frac{1}{\\sqrt{\\mu_0 \\varepsilon_0}}$ regarded as a milestone unifying electricity, magnetism, and optics?",
    correctOption: (a) => `Because ${a}.`,
    distractors: [
      {
        text: "Because it proved that electrical wires carry electrons at the speed of light.",
        rationale: "Conduction electron drift speed is millimetres per second; Maxwell's formula describes free-space EM wave speed.",
      },
      {
        text: "Because it showed that magnetic fields can propagate without any electric field.",
        rationale: "Maxwell's equations couple oscillating perpendicular E and B fields inseparably.",
      },
      {
        text: "Because it demonstrated that light consists of mechanical vibrations in dense glass.",
        rationale: "Maxwell identified light as self-propagating transverse electromagnetic waves.",
      },
    ],
    workedSolution: (a) =>
      `Evaluating $1/\\sqrt{\\mu_0 \\varepsilon_0}$ gave $3.00 \\times 10^8\\text{ m s}^{-1}$—${a}.`,
    planSummary: "Explain significance of Maxwell's speed formula linking electromagnetism and optics.",
  });

  // 4 Multi-part Structured
  pushStructured(ctx, {
    slug: "tp-hz-str-01",
    conceptId,
    kind,
    domain: "waves",
    subtopicId: sub,
    difficulty: "standard",
    questionStyle: "mixed-exam",
    scenarioSpec: {
      kind,
      mode: "hertz-polarisation",
      nodeSpacingM: 0.25,
      detectorAngleDeg: 45,
      peakAmplitudeMv: 140,
    },
    hiddenQuantities: [
      "wavelengthM",
      "frequencyMHz",
      "detectedAmplitudeMv",
      "hertzPolarisationAnchor",
    ],
    requiredGivens: [
      { name: "nodeSpacingM", value: 0.25, unit: "m", source: "stem" },
      { name: "peakAmplitudeMv", value: 140, unit: "mV", source: "stem" },
      { name: "detectorAngleDeg", value: 45, source: "stem" },
    ],
    stem: "A dipole transmitter reflects plane-polarised radio waves normally off a flat metal sheet, forming a stationary wave with adjacent nodes 0.250 m apart. At an antinode, the aligned receiver reads 140 mV.",
    build: (q) => {
      const lam = numQ(q, "wavelengthM");
      const fMHz = numQ(q, "frequencyMHz");
      const amp = numQ(q, "detectedAmplitudeMv");
      return {
        parts: [
          {
            partId: "a",
            prompt: "Calculate the wavelength and frequency (in MHz) of the radio waves ($c = 3.00 \\times 10^8\\text{ m s}^{-1}$).",
            marks: 3,
            targetQuantityKey: "frequencyMHz",
            expectedAnswer: `${fmt3(fMHz, "MHz")} (with $\\lambda = ${fmt3(lam, "m")}$).`,
            workingSteps: [
              `$\\lambda = 2 \\times 0.250 = ${fmt3(lam, "m")}$.`,
              `$f = \\frac{3.00 \\times 10^8}{0.500} = 6.00 \\times 10^8\\text{ Hz} = ${fmt3(fMHz, "MHz")}$.`,
            ],
          },
          {
            partId: "b",
            prompt: "Calculate the detected emf amplitude when the receiving dipole is rotated by $45°$ in the plane perpendicular to propagation.",
            marks: 2,
            targetQuantityKey: "detectedAmplitudeMv",
            expectedAnswer: fmt3(amp, "mV"),
            workingSteps: [`$A = 140 \\times |\\cos 45°| = ${fmt3(amp, "mV")}$.`],
          },
        ],
        markScheme: [
          { code: "M1", criterion: "Uses node spacing $= \\lambda / 2 \\Rightarrow \\lambda = 0.500\\text{ m}$.", marks: 1, partId: "a" },
          { code: "M1", criterion: "Applies $f = c / \\lambda$.", marks: 1, partId: "a" },
          { code: "A1", criterion: `Correct frequency ${fmt3(fMHz, "MHz")}.`, marks: 1, partId: "a" },
          { code: "M1", criterion: "Uses $A = 140 \\cos 45°$.", marks: 1, partId: "b" },
          { code: "A1", criterion: `Correct amplitude ${fmt3(amp, "mV")}.`, marks: 1, partId: "b" },
        ],
        workedSolution: `(a) $\\lambda = ${fmt3(lam, "m")}$, $f = ${fmt3(fMHz, "MHz")}$. (b) $A = ${fmt3(amp, "mV")}$.`,
      };
    },
    planSummary: "Analyse Hertz standing-wave wavelength, frequency, and rotated-dipole signal amplitude.",
    subpartPlan: ["wavelength and frequency", "rotated dipole amplitude"],
  });

  pushStructured(ctx, {
    slug: "tp-hz-str-02",
    conceptId,
    kind,
    domain: "waves",
    subtopicId: sub,
    difficulty: "standard",
    questionStyle: "mixed-exam",
    scenarioSpec: {
      kind,
      mode: "fizeau-maxwell",
      wheelTeeth: 600,
      mirrorDistanceM: 9000,
    },
    hiddenQuantities: [
      "maxwellSpeedMs",
      "firstEclipseFreqHz",
      "maxwellSignificanceAnchor",
    ],
    requiredGivens: [
      { name: "wheelTeeth", value: 600, source: "stem" },
      { name: "mirrorDistanceM", value: 9000, unit: "m", source: "stem" },
    ],
    stem: "Take $\\mu_0 = 4\\pi \\times 10^{-7}\\text{ H m}^{-1}$ and $\\varepsilon_0 = 8.85 \\times 10^{-12}\\text{ F m}^{-1}$. A Fizeau toothed-wheel arrangement uses 600 teeth and a mirror distance of 9000 m.",
    build: (q) => {
      const cM = numQ(q, "maxwellSpeedMs");
      const f = numQ(q, "firstEclipseFreqHz");
      const sig = strQ(q, "maxwellSignificanceAnchor");
      return {
        parts: [
          {
            partId: "a",
            prompt: "Calculate the theoretical electromagnetic wave speed $c = \\frac{1}{\\sqrt{\\mu_0 \\varepsilon_0}}$.",
            marks: 2,
            targetQuantityKey: "maxwellSpeedMs",
            expectedAnswer: fmt3(cM, "m s⁻¹"),
            workingSteps: [`$c = \\frac{1}{\\sqrt{4\\pi \\times 10^{-7} \\times 8.85 \\times 10^{-12}}} = ${fmt3(cM, "m s⁻¹")}$.`],
          },
          {
            partId: "b",
            prompt: "Calculate the lowest wheel rotation frequency $f$ that eclipses the returning light beam in this Fizeau setup.",
            marks: 2,
            dependsOnPartIds: ["a"],
            targetQuantityKey: "firstEclipseFreqHz",
            expectedAnswer: fmt3(f, "Hz"),
            workingSteps: [`$f = \\frac{c}{4nd} = \\frac{3.00 \\times 10^8}{4 \\times 600 \\times 9000} = ${fmt3(f, "Hz")}$.`],
          },
          {
            partId: "c",
            prompt: "State the significance of Maxwell's calculation agreeing with Fizeau's measured speed of light.",
            marks: 2,
            targetMode: "qualitative",
            targetQuantityKey: "maxwellSignificanceAnchor",
            expectedAnswer: `The agreement was crucial because ${sig}.`,
            workingSteps: [
              "Constants measured purely from laboratory electrical and magnetic experiments yielded the speed of light.",
              "This unified optics and electromagnetism, showing visible light is part of the EM spectrum.",
            ],
          },
        ],
        markScheme: [
          { code: "M1", criterion: "Substitutes $\\mu_0$ and $\\varepsilon_0$ into $1 / \\sqrt{\\mu_0 \\varepsilon_0}$.", marks: 1, partId: "a" },
          { code: "A1", criterion: `Correct speed ${fmt3(cM, "m s⁻¹")}.`, marks: 1, partId: "a" },
          { code: "M1", criterion: "Uses $f = c / (4nd)$.", marks: 1, partId: "b" },
          { code: "A1", criterion: `Correct rotation frequency ${fmt3(f, "Hz")}.`, marks: 1, partId: "b" },
          { code: "B1", criterion: "Notes $\\mu_0$ and $\\varepsilon_0$ came from electrical/magnetic measurements.", marks: 1, partId: "c" },
          { code: "B1", criterion: "Concludes agreement proved light is an electromagnetic wave.", marks: 1, partId: "c" },
        ],
        workedSolution: `(a) $c = ${fmt3(cM, "m s⁻¹")}$. (b) $f = ${fmt3(f, "Hz")}$. (c) ${sig}.`,
      };
    },
    planSummary: "Compute Maxwell speed from vacuum constants, Fizeau eclipse frequency, and EM significance.",
    subpartPlan: ["Maxwell speed", "Fizeau frequency", "significance of agreement"],
  });

  pushStructured(ctx, {
    slug: "tp-hz-str-03",
    conceptId,
    kind,
    domain: "waves",
    subtopicId: sub,
    difficulty: "standard",
    questionStyle: "mixed-exam",
    scenarioSpec: {
      kind,
      mode: "refraction-corpuscular",
      incidentAngleDeg: 50,
      refractiveIndex: 1.5,
    },
    hiddenQuantities: [
      "refractedAngleDeg",
      "huygensSpeedInMediumMs",
      "newtonVsHuygensAnchor",
    ],
    requiredGivens: [
      { name: "incidentAngleDeg", value: 50, source: "stem" },
      { name: "refractiveIndex", value: 1.5, source: "stem" },
    ],
    stem: "A parallel beam of monochromatic light strikes an air–glass boundary (refractive index $n = 1.50$) at an angle of incidence of 50.0°. Take $c = 3.00 \\times 10^8\\text{ m s}^{-1}$.",
    build: (q) => {
      const rDeg = numQ(q, "refractedAngleDeg");
      const vH = numQ(q, "huygensSpeedInMediumMs");
      const nvh = strQ(q, "newtonVsHuygensAnchor");
      return {
        parts: [
          {
            partId: "a",
            prompt: "Calculate the angle of refraction inside the glass.",
            marks: 2,
            targetQuantityKey: "refractedAngleDeg",
            expectedAnswer: fmt3(rDeg, "°"),
            workingSteps: [`$\\sin\\theta_2 = \\frac{\\sin 50.0°}{1.50} = 0.5107 \\Rightarrow \\theta_2 = ${fmt3(rDeg, "°")}$.`],
          },
          {
            partId: "b",
            prompt: "Calculate the speed of light inside the glass predicted by Huygens' wave model.",
            marks: 2,
            targetQuantityKey: "huygensSpeedInMediumMs",
            expectedAnswer: fmt3(vH, "m s⁻¹"),
            workingSteps: [`$v = \\frac{3.00 \\times 10^8}{1.50} = ${fmt3(vH, "m s⁻¹")}$.`],
          },
          {
            partId: "c",
            prompt: "Contrast Newton's corpuscular prediction with Huygens' wave prediction for refraction into water or glass.",
            marks: 2,
            targetMode: "qualitative",
            targetQuantityKey: "newtonVsHuygensAnchor",
            expectedAnswer: `Historically, ${nvh}.`,
            workingSteps: [
              "Newton assumed perpendicular attraction accelerated corpuscles toward the normal ($v_{\\text{dense}} > c$).",
              "Huygens showed slower wave speed in denser media turns wavefronts toward the normal ($v_{\\text{dense}} < c$).",
            ],
          },
        ],
        markScheme: [
          { code: "M1", criterion: "Applies Snell's law $\\sin\\theta_2 = \\sin 50.0° / 1.50$.", marks: 1, partId: "a" },
          { code: "A1", criterion: `Correct angle ${fmt3(rDeg, "°")}.`, marks: 1, partId: "a" },
          { code: "M1", criterion: "Applies $v = c / n = 3.00 \\times 10^8 / 1.50$.", marks: 1, partId: "b" },
          { code: "A1", criterion: `Correct wave speed ${fmt3(vH, "m s⁻¹")}.`, marks: 1, partId: "b" },
          { code: "B1", criterion: "States Newton predicted greater speed in optically denser medium.", marks: 1, partId: "c" },
          { code: "B1", criterion: "States Huygens predicted lower speed, later confirmed by Foucault.", marks: 1, partId: "c" },
        ],
        workedSolution: `(a) $\\theta_2 = ${fmt3(rDeg, "°")}$. (b) $v = ${fmt3(vH, "m s⁻¹")}$. (c) ${nvh}.`,
      };
    },
    planSummary: "Compute Snell refraction angle and Huygens speed and contrast with Newton's corpuscles.",
    subpartPlan: ["angle of refraction", "Huygens speed in glass", "Newton vs Huygens contrast"],
  });

  pushStructured(ctx, {
    slug: "tp-hz-str-04",
    conceptId,
    kind,
    domain: "waves",
    subtopicId: sub,
    difficulty: "higher",
    questionStyle: "calculation",
    scenarioSpec: {
      kind,
      mode: "hertz-polarisation",
      nodeSpacingM: 0.18,
      detectorAngleDeg: 30,
      peakAmplitudeMv: 200,
    },
    hiddenQuantities: ["wavelengthM", "frequencyMHz", "detectedAmplitudeMv"],
    requiredGivens: [
      { name: "nodeSpacingM", value: 0.18, unit: "m", source: "stem" },
      { name: "peakAmplitudeMv", value: 200, unit: "mV", source: "stem" },
      { name: "detectorAngleDeg", value: 30, source: "stem" },
    ],
    stem: "In a UHF Hertz radio demonstration ($c = 3.00 \\times 10^8\\text{ m s}^{-1}$), a sliding probe detects six consecutive nodes spanning a total distance of 0.900 m (adjacent spacing 0.180 m). At an antinode the peak dipole signal is 200 mV.",
    build: (q) => {
      const lam = numQ(q, "wavelengthM");
      const fMHz = numQ(q, "frequencyMHz");
      const amp = numQ(q, "detectedAmplitudeMv");
      return {
        parts: [
          {
            partId: "a",
            prompt: "Calculate the wavelength of the UHF radio waves.",
            marks: 2,
            targetQuantityKey: "wavelengthM",
            expectedAnswer: fmt3(lam, "m"),
            workingSteps: [`Adjacent node spacing is $\\lambda/2 = 0.180\\text{ m} \\Rightarrow \\lambda = ${fmt3(lam, "m")}$.`],
          },
          {
            partId: "b",
            prompt: "Calculate the transmitter frequency in megahertz.",
            marks: 2,
            dependsOnPartIds: ["a"],
            targetQuantityKey: "frequencyMHz",
            expectedAnswer: fmt3(fMHz, "MHz"),
            workingSteps: [`$f = \\frac{3.00 \\times 10^8}{0.360} = ${fmt3(fMHz, "MHz")}$.`],
          },
          {
            partId: "c",
            prompt: "Calculate the detected amplitude when the dipole is rotated $30°$ from alignment.",
            marks: 2,
            targetQuantityKey: "detectedAmplitudeMv",
            expectedAnswer: fmt3(amp, "mV"),
            workingSteps: [`$A = 200 \\cos 30° = ${fmt3(amp, "mV")}$.`],
          },
        ],
        markScheme: [
          { code: "M1", criterion: "Doubles adjacent node spacing $0.180\\text{ m}$.", marks: 1, partId: "a" },
          { code: "A1", criterion: `Correct wavelength ${fmt3(lam, "m")}.`, marks: 1, partId: "a" },
          { code: "M1", criterion: "Evaluates $c / 0.360$ and converts to MHz.", marks: 1, partId: "b" },
          { code: "A1", criterion: `Correct frequency ${fmt3(fMHz, "MHz")}.`, marks: 1, partId: "b" },
          { code: "M1", criterion: "Evaluates $200 \\cos 30°$.", marks: 1, partId: "c" },
          { code: "A1", criterion: `Correct signal amplitude ${fmt3(amp, "mV")}.`, marks: 1, partId: "c" },
        ],
        workedSolution: `(a) $\\lambda = ${fmt3(lam, "m")}$. (b) $f = ${fmt3(fMHz, "MHz")}$. (c) $A = ${fmt3(amp, "mV")}$.`,
      };
    },
    planSummary: "Compute UHF standing-wave wavelength, frequency, and rotated-dipole signal.",
    subpartPlan: ["wavelength from nodes", "frequency in MHz", "dipole amplitude at oblique angle"],
  });

  // 1 Authentic 6-Mark LoR
  pushSixMarkLor(ctx, {
    slug: "tp-hz-lor-01",
    conceptId,
    kind,
    domain: "waves",
    subtopicId: sub,
    scenarioSpec: {
      kind,
      mode: "refraction-corpuscular",
      incidentAngleDeg: 42,
      refractiveIndex: 1.33,
    },
    targetQuantityKey: "lorLightNatureAnchor",
    stem: "Between the seventeenth and nineteenth centuries, physicists debated whether light consisted of Newtonian particles or waves, culminating in Maxwell's electromagnetic theory and Hertz's radio experiments.",
    prompt:
      "Explain how Newton's corpuscular theory and Huygens' wave theory accounted for refraction, explain why Newton's view initially prevailed before being overturned by Young and Foucault, and describe how Maxwell and Hertz established the electromagnetic nature of light.",
    expectedAnswer: (anchor) =>
      `Over two centuries, ${anchor}. Newton modelled light as tiny elastic corpuscles whose perpendicular velocity component increased when attracted into glass or water, predicting $v_{\\text{water}} > v_{\\text{air}}$. Huygens instead treated light as wavefronts that slow down upon entering denser media ($v_{\\text{water}} < v_{\\text{air}}$), turning the wavefront toward the normal. Newton's immense reputation and the lack of obvious diffraction or speed measurements kept corpuscular theory dominant for over a century. Thomas Young's 1801 double-slit experiment produced clear interference fringes explainable only by wave superposition, and Léon Foucault's 1850 rotating-mirror measurement proved light travels slower in water than in air, conclusively disproving Newton's corpuscular refraction model. James Clerk Maxwell then formulated equations for mutually perpendicular oscillating electric and magnetic fields travelling at $c = 1/\\sqrt{\\mu_0 \\varepsilon_0} \\approx 3.00 \\times 10^8\\text{ m s}^{-1}$, matching the measured speed of light. Finally, Heinrich Hertz generated spark-gap radio waves, measured their speed via standing-wave node spacing $\\lambda/2$ ($c = f\\lambda$), and demonstrated transverse polarisation by rotating a dipole detector through $90°$ nulls, confirming Maxwell's electromagnetic wave theory.`,
    workingSteps: [
      "Explain Newton's corpuscular refraction (perpendicular pull speeds corpuscles up in denser media, $v_{\\text{water}} > v_{\\text{air}}$).",
      "Explain Huygens' wave refraction (wavefronts slow in denser media, $v_{\\text{water}} < v_{\\text{air}}$).",
      "Explain why Newton prevailed initially (reputation, no observed interference or speed measurement).",
      "Describe Young's double-slit interference and Foucault's 1850 water-speed proof overturning corpuscles.",
      "Describe Maxwell's transverse coupled $E/B$ waves and $c = 1/\\sqrt{\\mu_0 \\varepsilon_0}$ matching light speed.",
      "Describe Hertz's radio standing waves ($\\lambda/2$ node spacing giving $c$) and dipole rotation polarisation proving transverse nature.",
    ],
    criteriaSix: [
      "Explains Newton's corpuscular model predicted greater speed in water/glass due to normal attractive forces.",
      "Explains Huygens' wave model predicted slower speed in denser media bending wavefronts toward the normal.",
      "Explains Young's double-slit interference demonstrated wave superposition (and notes Newton's early prestige).",
      "Explains Foucault's measurement showing $v_{\\text{water}} < v_{\\text{air}}$ decisively disproved Newton's corpuscular refraction.",
      "Explains Maxwell predicted coupled perpendicular $E$ and $B$ waves with $c = 1/\\sqrt{\\mu_0 \\varepsilon_0}$ matching the speed of light.",
      "Explains Hertz confirmed Maxwell using standing radio waves (node spacing $\\lambda/2$ to find $c$) and dipole polarisation nulls at $90°$.",
    ],
    workedSolution: (anchor) =>
      `Level 3 synthesis: ${anchor}; connects corpuscular vs wave refraction, Young & Foucault, Maxwell's $1/\\sqrt{\\mu_0 \\varepsilon_0}$, and Hertz's standing-wave and polarisation proofs.`,
    planSummary: "Six-mark level-of-response historical synthesis from Newton and Huygens to Maxwell and Hertz.",
  });
}

function populateTpElectronMicroscopy(ctx: BuilderContext): void {
  const kind = "al-opt-tp-electron-microscopy";
  const conceptId = "de-broglie-matter-waves";
  const sub = "alevel-3-12-turning-points" as const;

  // 4 Calc MCQs
  pushCalcMcq(ctx, {
    slug: "tp-em-calc-01",
    conceptId,
    kind,
    domain: "quantum-nuclear",
    subtopicId: sub,
    difficulty: "foundation",
    scenarioSpec: {
      kind,
      mode: "tem-debroglie",
      anodeVoltageV: 40000,
    },
    hiddenQuantities: ["deBroglieWavelengthPm"],
    requiredGivens: [
      { name: "anodeVoltageV", value: 40000, unit: "V", source: "either" },
    ],
    targetQuantityKey: "deBroglieWavelengthPm",
    unit: "pm",
    stem: "In a transmission electron microscope (TEM), electrons are accelerated from rest through an anode potential difference of 40.0 kV. Neglecting relativistic effects and taking $h = 6.63 \\times 10^{-34}\\text{ J s}$, $m_e = 9.11 \\times 10^{-31}\\text{ kg}$, and $e = 1.60 \\times 10^{-19}\\text{ C}$, calculate their de Broglie wavelength.",
    distractors: (q) => {
      const pm = numQ(q, "deBroglieWavelengthPm");
      return [
        { value: pm * Math.SQRT2, rationale: "Omits the factor of 2 inside sqrt(2 m e V)." },
        { value: pm * 0.5, rationale: "Halves the de Broglie wavelength erroneously." },
        { value: pm * Math.sqrt(1000), rationale: "Forgets to convert 40.0 kV into volts." },
      ];
    },
    workedSolution: (_q, ans) =>
      `$\\lambda = \\frac{h}{\\sqrt{2 m_e e V}} = \\frac{6.63 \\times 10^{-34}}{\\sqrt{2 \\times 9.11 \\times 10^{-31} \\times 1.60 \\times 10^{-19} \\times 4.00 \\times 10^4}} = 6.14 \\times 10^{-12}\\text{ m} = ${ans}$.`,
    planSummary: "Calculate non-relativistic TEM electron de Broglie wavelength.",
  });

  pushCalcMcq(ctx, {
    slug: "tp-em-calc-02",
    conceptId,
    kind,
    domain: "quantum-nuclear",
    subtopicId: sub,
    difficulty: "standard",
    scenarioSpec: {
      kind,
      mode: "tem-debroglie",
      anodeVoltageV: 25000,
      secondAnodeVoltageV: 100000,
    },
    hiddenQuantities: ["wavelengthRatio", "secondWavelengthPm"],
    requiredGivens: [
      { name: "anodeVoltageV", value: 25000, unit: "V", source: "either" },
      { name: "secondAnodeVoltageV", value: 100000, unit: "V", source: "stem" },
    ],
    targetQuantityKey: "wavelengthRatio",
    stem: "A TEM operator increases the accelerating anode potential difference from 25.0 kV to 100 kV. Ignoring relativistic effects, what is the ratio $\\frac{\\lambda_2}{\\lambda_1}$ of the new electron de Broglie wavelength to the original wavelength?",
    distractors: () => [
      { value: 0.25, rationale: "Assumes wavelength is inversely proportional to V rather than V^(1/2)." },
      { value: 2.0, rationale: "Inverts the scaling ratio as sqrt(V_2 / V_1) instead of sqrt(V_1 / V_2)." },
      { value: 4.0, rationale: "Assumes wavelength scales directly with anode voltage." },
    ],
    workedSolution: (_q, ans) =>
      `Since $\\lambda \\propto V^{-1/2}$, increasing $V$ by a factor of 4 multiplies $\\lambda$ by $\\sqrt{\\frac{25.0}{100}} = ${ans}$.`,
    planSummary: "Apply inverse square-root voltage scaling to TEM electron de Broglie wavelength.",
  });

  pushCalcMcq(ctx, {
    slug: "tp-em-calc-03",
    conceptId,
    kind,
    domain: "quantum-nuclear",
    subtopicId: sub,
    difficulty: "standard",
    scenarioSpec: {
      kind,
      mode: "stm-tunnelling",
      anodeVoltageV: 20000,
      decayConstantPerNm: 20,
      deltaGapNm: 0.1,
      initialCurrentNa: 5.0,
    },
    hiddenQuantities: ["newCurrentNa", "tunnellingCurrentRatio"],
    requiredGivens: [
      { name: "decayConstantPerNm", value: 20, unit: "nm⁻¹", source: "stem" },
      { name: "deltaGapNm", value: 0.1, unit: "nm", source: "stem" },
      { name: "initialCurrentNa", value: 5.0, unit: "nA", source: "stem" },
    ],
    targetQuantityKey: "newCurrentNa",
    unit: "nA",
    stem: "In a constant-height STM scan, the tunnelling current varies exponentially with vacuum gap $d$ as $I = I_0 e^{-k\\Delta d}$ where $k = 20.0\\text{ nm}^{-1}$. If the current is 5.00 nA over a flat terrace, what current is measured when the tip passes over an atomic depression that widens the gap by $\\Delta d = 0.100\\text{ nm}$?",
    distractors: (q) => {
      const iNew = numQ(q, "newCurrentNa");
      return [
        { value: 5.0 * Math.exp(2.0), rationale: "Uses a positive exponent instead of exponential decay with wider gap." },
        { value: 2.5, rationale: "Assumes a linear halving rather than exponential decay e^(-2)." },
        { value: iNew * 2, rationale: "Halves the decay constant erroneously." },
      ];
    },
    workedSolution: (_q, ans) =>
      `$I = 5.00 \\times e^{-20.0 \\times 0.100} = 5.00 \\times e^{-2.00} = ${ans}$.`,
    planSummary: "Compute exponential drop in STM tunnelling current for a small vacuum gap increase.",
  });

  pushCalcMcq(ctx, {
    slug: "tp-em-calc-04",
    conceptId,
    kind,
    domain: "quantum-nuclear",
    subtopicId: sub,
    difficulty: "higher",
    scenarioSpec: {
      kind,
      mode: "tem-debroglie",
      anodeVoltageV: 15000,
    },
    hiddenQuantities: ["electronSpeedMs"],
    requiredGivens: [
      { name: "anodeVoltageV", value: 15000, unit: "V", source: "either" },
    ],
    targetQuantityKey: "electronSpeedMs",
    unit: "m s⁻¹",
    stem: "Electrons in a laboratory electron microscope are accelerated from rest across an anode potential difference of 15.0 kV ($m_e = 9.11 \\times 10^{-31}\\text{ kg}$, $e = 1.60 \\times 10^{-19}\\text{ C}$). Neglecting relativistic corrections, what is the speed of each electron leaving the anode?",
    distractors: (q) => {
      const v = numQ(q, "electronSpeedMs");
      return [
        { value: v / Math.SQRT2, rationale: "Omits the factor of 2 in v = sqrt(2 e V / m_e)." },
        { value: v / Math.sqrt(1000), rationale: "Uses 15.0 V instead of 15 000 V." },
        { value: v * 2, rationale: "Doubles the electron speed erroneously." },
      ];
    },
    workedSolution: (_q, ans) =>
      `From $\\frac{1}{2} m_e v^2 = eV$, $v = \\sqrt{\\frac{2 e V}{m_e}} = \\sqrt{\\frac{2 \\times 1.60 \\times 10^{-19} \\times 1.50 \\times 10^4}{9.11 \\times 10^{-31}}} = ${ans}$.`,
    planSummary: "Calculate non-relativistic speed of TEM electrons accelerated across high voltage.",
  });

  // 3 Pure Qual MCQs
  pushQualMcq(ctx, {
    slug: "tp-em-qual-01",
    conceptId,
    kind,
    domain: "quantum-nuclear",
    subtopicId: sub,
    difficulty: "standard",
    scenarioSpec: {
      kind,
      mode: "tem-debroglie",
      anodeVoltageV: 80000,
    },
    targetQuantityKey: "temResolutionLimitAnchor",
    stem: "Even though a TEM produces electrons with de Broglie wavelengths far smaller than an atomic diameter, actual achieved image resolution falls short of the theoretical diffraction limit. Why?",
    correctOption: (a) => `Because ${a}.`,
    distractors: [
      {
        text: "Because electrons travel through glass lenses that suffer severe chromatic dispersion.",
        rationale: "TEMs focus electrons with magnetic coil lenses in vacuum, never glass lenses.",
      },
      {
        text: "Because increasing sample thickness accelerates electrons and shortens their wavelength unpredictably.",
        rationale: "Thicker samples slow electrons down via inelastic collisions, lengthening de Broglie wavelength.",
      },
      {
        text: "Because magnetic lenses cannot bend negatively charged particles unless air fills the column.",
        rationale: "The TEM column must be strictly evacuated to prevent air scattering; magnetic fields deflect moving electrons in vacuum.",
      },
    ],
    workedSolution: (a) =>
      `In a practical TEM, ${a}, preventing diffraction-limited perfection.`,
    planSummary: "Identify practical factors limiting achieved TEM spatial resolution.",
  });

  pushQualMcq(ctx, {
    slug: "tp-em-qual-02",
    conceptId,
    kind,
    domain: "quantum-nuclear",
    subtopicId: sub,
    difficulty: "foundation",
    scenarioSpec: {
      kind,
      mode: "stm-tunnelling",
      anodeVoltageV: 20000,
      decayConstantPerNm: 18,
      deltaGapNm: 0.1,
    },
    targetQuantityKey: "stmTunnellingAnchor",
    stem: "In a Scanning Tunnelling Microscope (STM), the sharp metal probe tip is held roughly one nanometre above a conducting sample with a small bias voltage far below the work function. How does a measurable current still cross the empty vacuum gap?",
    correctOption: (a) => `Due to wave-particle duality, ${a}.`,
    distractors: [
      {
        text: "Electrons boil out of the sample by thermionic emission at room temperature.",
        rationale: "STMs operate at room or cryogenic temperatures where thermionic emission is negligible.",
      },
      {
        text: "Visible light from a laser ionises air molecules between tip and sample to form a spark.",
        rationale: "STM imaging operates across a vacuum gap via quantum tunnelling, not gas ionisation.",
      },
      {
        text: "Classical electrostatic force accelerates electrons linearly with gap width.",
        rationale: "Classically electrons lack energy to cross the barrier; quantum tunnelling probability decays exponentially with gap width.",
      },
    ],
    workedSolution: (a) =>
      `An electron's wavefunction penetrates the finite potential barrier so ${a}.`,
    planSummary: "Explain quantum tunnelling basis of the Scanning Tunnelling Microscope.",
  });

  pushQualMcq(ctx, {
    slug: "tp-em-qual-03",
    conceptId,
    kind,
    domain: "quantum-nuclear",
    subtopicId: sub,
    difficulty: "standard",
    scenarioSpec: {
      kind,
      mode: "stm-tunnelling",
      anodeVoltageV: 20000,
      decayConstantPerNm: 18,
      deltaGapNm: 0.1,
    },
    targetQuantityKey: "stmModeAnchor",
    stem: "How do the constant-current and constant-height operating modes of a Scanning Tunnelling Microscope map atomic surface topography?",
    correctOption: (a) => `During surface scanning, ${a}.`,
    distractors: [
      {
        text: "Constant-current mode presses the tip physically onto atoms while constant-height mode fires X-rays.",
        rationale: "The STM tip never touches the surface in either mode, and neither mode uses X-rays.",
      },
      {
        text: "Constant-height mode uses piezoelectric feedback to keep gap fixed while constant-current mode holds the tip immobile.",
        rationale: "Reverses the two operating modes.",
      },
      {
        text: "Both modes accelerate electrons across hundreds of kilovolts through thin slices onto a screen.",
        rationale: "That describes a TEM rather than a surface-scanning STM.",
      },
    ],
    workedSolution: (a) =>
      `STM scanners map atomic relief because ${a}.`,
    planSummary: "Distinguish constant-current and constant-height STM operating modes.",
  });

  // 4 Multi-part Structured
  pushStructured(ctx, {
    slug: "tp-em-str-01",
    conceptId,
    kind,
    domain: "quantum-nuclear",
    subtopicId: sub,
    difficulty: "standard",
    questionStyle: "mixed-exam",
    scenarioSpec: {
      kind,
      mode: "tem-debroglie",
      anodeVoltageV: 50000,
      secondAnodeVoltageV: 112500,
    },
    hiddenQuantities: [
      "deBroglieWavelengthPm",
      "secondWavelengthPm",
      "temResolutionLimitAnchor",
    ],
    requiredGivens: [
      { name: "anodeVoltageV", value: 50000, unit: "V", source: "either" },
      { name: "secondAnodeVoltageV", value: 112500, unit: "V", source: "stem" },
    ],
    stem: "A transmission electron microscope initially operates at an anode voltage of 50.0 kV ($h = 6.63 \\times 10^{-34}\\text{ J s}$, $m_e = 9.11 \\times 10^{-31}\\text{ kg}$, $e = 1.60 \\times 10^{-19}\\text{ C}$).",
    build: (q) => {
      const lam1 = numQ(q, "deBroglieWavelengthPm");
      const lam2 = numQ(q, "secondWavelengthPm");
      const lim = strQ(q, "temResolutionLimitAnchor");
      return {
        parts: [
          {
            partId: "a",
            prompt: "Calculate the non-relativistic de Broglie wavelength of electrons accelerated through 50.0 kV.",
            marks: 2,
            targetQuantityKey: "deBroglieWavelengthPm",
            expectedAnswer: fmt3(lam1, "pm"),
            workingSteps: [
              `$\\lambda_1 = \\frac{6.63 \\times 10^{-34}}{\\sqrt{2 \\times 9.11 \\times 10^{-31} \\times 1.60 \\times 10^{-19} \\times 5.00 \\times 10^4}} = ${fmt3(lam1, "pm")}$.`,
            ],
          },
          {
            partId: "b",
            prompt: "Calculate the new de Broglie wavelength when the anode potential difference is raised to 112.5 kV.",
            marks: 2,
            dependsOnPartIds: ["a"],
            targetQuantityKey: "secondWavelengthPm",
            expectedAnswer: fmt3(lam2, "pm"),
            workingSteps: [
              `$\\lambda_2 = \\lambda_1 \\sqrt{\\frac{50.0}{112.5}} = \\frac{2}{3} \\lambda_1 = ${fmt3(lam2, "pm")}$.`,
            ],
          },
          {
            partId: "c",
            prompt: "Explain why raising the anode voltage improves image detail, and state two practical factors that still limit TEM resolution.",
            marks: 2,
            targetMode: "qualitative",
            targetQuantityKey: "temResolutionLimitAnchor",
            expectedAnswer: `Higher voltage reduces de Broglie wavelength and diffraction blurring; however, ${lim}.`,
            workingSteps: [
              "Shorter $\\lambda$ reduces diffraction limits, improving potential resolution.",
              "Thick samples slow electrons (increasing $\\lambda$) and magnetic lens aberrations / speed spread blur focus.",
            ],
          },
        ],
        markScheme: [
          { code: "M1", criterion: "Applies $\\lambda = h / \\sqrt{2 m_e e V}$ with $V = 5.00 \\times 10^4\\text{ V}$.", marks: 1, partId: "a" },
          { code: "A1", criterion: `Correct wavelength ${fmt3(lam1, "pm")}.`, marks: 1, partId: "a" },
          { code: "M1", criterion: "Applies $\\lambda \\propto V^{-1/2}$ or recomputes directly.", marks: 1, partId: "b" },
          { code: "A1", criterion: `Correct new wavelength ${fmt3(lam2, "pm")}.`, marks: 1, partId: "b" },
          { code: "B1", criterion: "Links shorter wavelength to reduced diffraction / finer detail.", marks: 1, partId: "c" },
          { code: "B1", criterion: "Identifies sample thickness slowing electrons and magnetic lens aberration / speed spread.", marks: 1, partId: "c" },
        ],
        workedSolution: `(a) $\\lambda_1 = ${fmt3(lam1, "pm")}$. (b) $\\lambda_2 = ${fmt3(lam2, "pm")}$. (c) ${lim}.`,
      };
    },
    planSummary: "Calculate TEM de Broglie wavelength at two anode voltages and evaluate resolution limits.",
    subpartPlan: ["initial de Broglie wavelength", "scaled wavelength at higher voltage", "resolution limits"],
  });

  pushStructured(ctx, {
    slug: "tp-em-str-02",
    conceptId,
    kind,
    domain: "quantum-nuclear",
    subtopicId: sub,
    difficulty: "standard",
    questionStyle: "mixed-exam",
    scenarioSpec: {
      kind,
      mode: "stm-tunnelling",
      anodeVoltageV: 20000,
      decayConstantPerNm: 16,
      deltaGapNm: 0.15,
      initialCurrentNa: 8.0,
    },
    hiddenQuantities: [
      "tunnellingCurrentRatio",
      "newCurrentNa",
      "stmTunnellingAnchor",
    ],
    requiredGivens: [
      { name: "decayConstantPerNm", value: 16, unit: "nm⁻¹", source: "stem" },
      { name: "deltaGapNm", value: 0.15, unit: "nm", source: "stem" },
      { name: "initialCurrentNa", value: 8.0, unit: "nA", source: "stem" },
    ],
    stem: "An STM tip scans a gold crystal at constant height with an initial tunnelling current of 8.00 nA. The current obeys $I = I_0 e^{-k\\Delta d}$ with $k = 16.0\\text{ nm}^{-1}$.",
    build: (q) => {
      const ratio = numQ(q, "tunnellingCurrentRatio");
      const iNew = numQ(q, "newCurrentNa");
      const tun = strQ(q, "stmTunnellingAnchor");
      return {
        parts: [
          {
            partId: "a",
            prompt: "Calculate the fractional factor $I / I_0$ and the new tunnelling current when the surface drops by $\\Delta d = 0.150\\text{ nm}$.",
            marks: 3,
            targetQuantityKey: "newCurrentNa",
            expectedAnswer: `${fmt3(iNew, "nA")} (factor $I / I_0 = ${fmt3(ratio)}$).`,
            workingSteps: [
              `$I / I_0 = e^{-16.0 \\times 0.150} = e^{-2.40} = ${fmt3(ratio)}$.`,
              `$I = 8.00 \\times ${fmt3(ratio)} = ${fmt3(iNew, "nA")}$.`,
            ],
          },
          {
            partId: "b",
            prompt: "Explain why quantum tunnelling enables an STM to detect height variations far smaller than a single atomic diameter.",
            marks: 2,
            targetMode: "qualitative",
            targetQuantityKey: "stmTunnellingAnchor",
            expectedAnswer: `Because ${tun}, even a sub-atomic change in gap produces a large fractional change in measured current.`,
            workingSteps: [
              "Electron wavefunctions decay exponentially across the vacuum potential barrier.",
              "Hence tiny vertical height steps cause dramatic, easily measurable shifts in tunnelling current.",
            ],
          },
        ],
        markScheme: [
          { code: "M1", criterion: "Evaluates $e^{-16.0 \\times 0.150} = 0.0907$.", marks: 1, partId: "a" },
          { code: "M1", criterion: "Multiplies $8.00\\text{ nA}$ by the exponential factor.", marks: 1, partId: "a" },
          { code: "A1", criterion: `Correct new current ${fmt3(iNew, "nA")}.`, marks: 1, partId: "a" },
          { code: "B1", criterion: "Explains electrons tunnel as waves across the narrow vacuum gap.", marks: 1, partId: "b" },
          { code: "B1", criterion: "Links exponential dependence on gap width to extreme vertical sensitivity.", marks: 1, partId: "b" },
        ],
        workedSolution: `(a) $I/I_0 = ${fmt3(ratio)}$, $I = ${fmt3(iNew, "nA")}$. (b) ${tun}.`,
      };
    },
    planSummary: "Calculate STM exponential tunnelling drop and explain sub-atomic vertical sensitivity.",
    subpartPlan: ["exponential tunnelling current", "quantum sensitivity explanation"],
  });

  pushStructured(ctx, {
    slug: "tp-em-str-03",
    conceptId,
    kind,
    domain: "quantum-nuclear",
    subtopicId: sub,
    difficulty: "standard",
    questionStyle: "calculation",
    scenarioSpec: {
      kind,
      mode: "tem-debroglie",
      anodeVoltageV: 12000,
    },
    hiddenQuantities: [
      "electronSpeedMs",
      "electronMomentumKgMs",
      "deBroglieWavelengthPm",
    ],
    requiredGivens: [
      { name: "anodeVoltageV", value: 12000, unit: "V", source: "either" },
    ],
    stem: "An electron diffraction camera accelerates electrons from rest across a potential difference of 12.0 kV ($h = 6.63 \\times 10^{-34}\\text{ J s}$, $m_e = 9.11 \\times 10^{-31}\\text{ kg}$, $e = 1.60 \\times 10^{-19}\\text{ C}$).",
    build: (q) => {
      const v = numQ(q, "electronSpeedMs");
      const p = numQ(q, "electronMomentumKgMs");
      const lam = numQ(q, "deBroglieWavelengthPm");
      return {
        parts: [
          {
            partId: "a",
            prompt: "Calculate the speed of the electrons, neglecting relativistic effects.",
            marks: 2,
            targetQuantityKey: "electronSpeedMs",
            expectedAnswer: fmt3(v, "m s⁻¹"),
            workingSteps: [
              `$v = \\sqrt{\\frac{2 e V}{m_e}} = \\sqrt{\\frac{2 \\times 1.60 \\times 10^{-19} \\times 1.20 \\times 10^4}{9.11 \\times 10^{-31}}} = ${fmt3(v, "m s⁻¹")}$.`,
            ],
          },
          {
            partId: "b",
            prompt: "Calculate the de Broglie wavelength of the electrons in picometres.",
            marks: 2,
            dependsOnPartIds: ["a"],
            targetQuantityKey: "deBroglieWavelengthPm",
            expectedAnswer: fmt3(lam, "pm"),
            workingSteps: [
              `$p = m_e v = ${fmt3(p, "kg m s⁻¹")}$; $\\lambda = \\frac{h}{p} = ${fmt3(lam, "pm")}$.`,
            ],
          },
        ],
        markScheme: [
          { code: "M1", criterion: "Applies $\\frac{1}{2}m_e v^2 = eV$ with $V = 1.20 \\times 10^4\\text{ V}$.", marks: 1, partId: "a" },
          { code: "A1", criterion: `Correct speed ${fmt3(v, "m s⁻¹")}.`, marks: 1, partId: "a" },
          { code: "M1", criterion: "Uses $\\lambda = h / (m_e v)$.", marks: 1, partId: "b" },
          { code: "A1", criterion: `Correct wavelength ${fmt3(lam, "pm")}.`, marks: 1, partId: "b" },
        ],
        workedSolution: `(a) $v = ${fmt3(v, "m s⁻¹")}$. (b) $\\lambda = ${fmt3(lam, "pm")}$.`,
      };
    },
    planSummary: "Calculate electron speed and de Broglie wavelength at high accelerating voltage.",
    subpartPlan: ["electron speed", "de Broglie wavelength"],
  });

  pushStructured(ctx, {
    slug: "tp-em-str-04",
    conceptId,
    kind,
    domain: "quantum-nuclear",
    subtopicId: sub,
    difficulty: "higher",
    questionStyle: "mixed-exam",
    scenarioSpec: {
      kind,
      mode: "stm-tunnelling",
      anodeVoltageV: 30000,
      decayConstantPerNm: 22,
      deltaGapNm: 0.08,
      initialCurrentNa: 4.5,
    },
    hiddenQuantities: ["newCurrentNa", "stmModeAnchor"],
    requiredGivens: [
      { name: "decayConstantPerNm", value: 22, unit: "nm⁻¹", source: "stem" },
      { name: "deltaGapNm", value: 0.08, unit: "nm", source: "stem" },
      { name: "initialCurrentNa", value: 4.5, unit: "nA", source: "stem" },
    ],
    stem: "An STM monitors a silicon surface where the tunnelling current drops from 4.50 nA according to $I = I_0 e^{-k\\Delta d}$ with $k = 22.0\\text{ nm}^{-1}$ when the vacuum gap widens by 0.080 nm.",
    build: (q) => {
      const iNew = numQ(q, "newCurrentNa");
      const mode = strQ(q, "stmModeAnchor");
      return {
        parts: [
          {
            partId: "a",
            prompt: "Calculate the new tunnelling current after this 0.080 nm gap increase.",
            marks: 2,
            targetQuantityKey: "newCurrentNa",
            expectedAnswer: fmt3(iNew, "nA"),
            workingSteps: [`$I = 4.50 \\times e^{-22.0 \\times 0.080} = 4.50 \\times e^{-1.76} = ${fmt3(iNew, "nA")}$.`],
          },
          {
            partId: "b",
            prompt: "Compare constant-current mode and constant-height mode for scanning a rough atomic surface, stating one advantage of each.",
            marks: 3,
            targetMode: "qualitative",
            targetQuantityKey: "stmModeAnchor",
            expectedAnswer: `In STM operation, ${mode}; constant-current mode prevents tip crashes on rough surfaces while constant-height mode scans flat crystals faster.`,
            workingSteps: [
              "Constant-current mode feeds current changes back to a piezo $z$-transducer to hold gap constant and map piezo voltage.",
              "Constant-height mode fixes $z$ and logs current directly—faster on atomically flat samples but risks crashing into steep steps.",
            ],
          },
        ],
        markScheme: [
          { code: "M1", criterion: "Substitutes $4.50 \\times e^{-22.0 \\times 0.080}$.", marks: 1, partId: "a" },
          { code: "A1", criterion: `Correct current ${fmt3(iNew, "nA")}.`, marks: 1, partId: "a" },
          { code: "B1", criterion: "Explains constant-current mode uses piezo feedback to maintain gap and record height.", marks: 1, partId: "b" },
          { code: "B1", criterion: "Explains constant-height mode keeps $z$ fixed and records current variations.", marks: 1, partId: "b" },
          { code: "B1", criterion: "Notes safe scanning of rough steps in constant-current vs faster scanning on flat surfaces in constant-height.", marks: 1, partId: "b" },
        ],
        workedSolution: `(a) $I = ${fmt3(iNew, "nA")}$. (b) ${mode}.`,
      };
    },
    planSummary: "Calculate silicon STM current drop and compare constant-current vs constant-height modes.",
    subpartPlan: ["tunnelling current calculation", "STM scanning modes comparison"],
  });

  // 1 Authentic 6-Mark LoR
  pushSixMarkLor(ctx, {
    slug: "tp-em-lor-01",
    conceptId,
    kind,
    domain: "quantum-nuclear",
    subtopicId: sub,
    scenarioSpec: {
      kind,
      mode: "tem-debroglie",
      anodeVoltageV: 60000,
    },
    targetQuantityKey: "lorMicroscopyAnchor",
    stem: "Both the Transmission Electron Microscope (TEM) and the Scanning Tunnelling Microscope (STM) exploit the wave nature of electrons to achieve atomic-scale resolution far beyond optical microscopes.",
    prompt:
      "Compare the wave-particle operating principles, image-formation methods, and practical limitations of a TEM and an STM.",
    expectedAnswer: (anchor) =>
      `Both microscopes harness electron wave behaviour in distinct ways: ${anchor}. In a TEM, an electron gun accelerates electrons through tens to hundreds of kilovolts so $\\lambda = h/\\sqrt{2m_e e V}$ becomes picometres—far shorter than visible light—reducing diffraction limits. Magnetic condenser, objective, and projector lenses focus the beam through an ultra-thin specimen in vacuum onto a fluorescent screen or sensor, where denser regions scatter more electrons and appear darker. However, TEM resolution is practically limited because specimens must be extremely thin (thicker samples slow electrons, increasing $\\lambda$ and blurring focus), electrons leave the filament with a spread of speeds, and magnetic lenses exhibit spherical/chromatic-like aberrations. In an STM, a needle-fine conducting tip hovers roughly $1\\text{ nm}$ above a conducting sample with a small bias voltage. Electrons cross the forbidden vacuum gap via quantum tunnelling because their wavefunctions penetrate the barrier, with tunnelling current decaying exponentially with gap width $d$. Scanning in constant-current mode (using piezoelectric feedback to track surface relief) or constant-height mode maps individual surface atoms directly, though the STM is restricted to conducting or semiconducting surfaces, requires extreme vibration isolation, and maps surface electron clouds rather than internal bulk structure.`,
    workingSteps: [
      "Explain TEM wave principle: high anode pd gives picometre de Broglie wavelength $\\lambda = h/\\sqrt{2m_e eV}$, minimising diffraction.",
      "Describe TEM image formation: magnetic condenser/objective/projector lenses transmitting electrons through ultra-thin sample in vacuum.",
      "State TEM limitations: ultra-thin specimens needed (thickness slows electrons increasing $\\lambda$), lens aberrations, and electron speed spread.",
      "Explain STM wave principle: electron wavefunction penetrates narrow vacuum barrier (quantum tunnelling) with exponential gap sensitivity.",
      "Describe STM scanning: piezo-controlled constant-current feedback or constant-height current mapping.",
      "State STM limitations: requires conducting samples, ultra-stable vibration isolation, and probes only the surface layer.",
    ],
    criteriaSix: [
      "Explains TEM accelerates electrons across high voltage to obtain very short de Broglie wavelength $\\lambda = h/\\sqrt{2m_e eV}$ for low diffraction.",
      "Describes TEM magnetic lenses (condenser, objective, projector) transmitting electrons through a thin specimen in vacuum.",
      "Identifies TEM limitations: sample thickness slows electrons (longer $\\lambda$), magnetic lens aberrations, or spread of electron speeds.",
      "Explains STM relies on quantum tunnelling of electron wavefunctions across a nanometre vacuum gap with current decaying exponentially with gap width.",
      "Describes STM surface mapping via piezoelectric control in constant-current or constant-height mode.",
      "Identifies STM limitations: sample must be electrically conducting, requires vibration isolation, and images surface topography rather than interior.",
    ],
    workedSolution: (anchor) =>
      `Level 3 synthesis: ${anchor}; thoroughly compares TEM diffraction optics and sample/lens limits with STM quantum tunnelling, piezo scanning, and conducting-surface limits.`,
    planSummary: "Six-mark level-of-response comparison of TEM and STM wave-particle physics and limitations.",
  });
}

function populateTpMichelsonRelativity(ctx: BuilderContext): void {
  const kind = "al-opt-tp-michelson-relativity";
  const conceptId = "special-relativity-spacetime";
  const sub = "alevel-3-12-turning-points" as const;

  // 4 Calc MCQs
  pushCalcMcq(ctx, {
    slug: "tp-rel-calc-01",
    conceptId,
    kind,
    domain: "quantum-nuclear",
    subtopicId: sub,
    difficulty: "foundation",
    scenarioSpec: {
      kind,
      mode: "interferometer",
      speedFractionC: 0.96,
      properTimeUs: 2.2,
    },
    hiddenQuantities: ["dilatedTimeUs", "lorentzFactor"],
    requiredGivens: [
      { name: "speedFractionC", value: 0.96, source: "stem" },
      { name: "properTimeUs", value: 2.2, unit: "μs", source: "stem" },
    ],
    targetQuantityKey: "dilatedTimeUs",
    unit: "μs",
    stem: "Cosmic-ray muons created in the upper atmosphere travel toward Earth at $0.960c$. Taking the mean proper lifetime of a muon at rest to be $t_0 = 2.20\\,\\mu\\text{s}$, what is their mean lifetime as measured by an observer on Earth?",
    distractors: (q) => {
      const tDil = numQ(q, "dilatedTimeUs");
      const g = numQ(q, "lorentzFactor");
      return [
        { value: 2.2 / g, rationale: "Multiplies proper time by sqrt(1 - v^2/c^2) instead of dividing, contracting time erroneously." },
        { value: 2.2 / (1 - 0.96 * 0.96), rationale: "Omits the square root in the Lorentz factor gamma." },
        { value: tDil * 0.5, rationale: "Halves the time-dilated lifetime erroneously." },
      ];
    },
    workedSolution: (q, ans) =>
      `$\\gamma = \\frac{1}{\\sqrt{1 - 0.960^2}} = \\frac{1}{0.280} = ${fmt3(numQ(q, "lorentzFactor"))}$. Time dilation gives $t = \\gamma t_0 = ${fmt3(numQ(q, "lorentzFactor"))} \\times 2.20 = ${ans}$.`,
    planSummary: "Compute Earth-frame time-dilated lifetime of cosmic-ray muons.",
  });

  pushCalcMcq(ctx, {
    slug: "tp-rel-calc-02",
    conceptId,
    kind,
    domain: "quantum-nuclear",
    subtopicId: sub,
    difficulty: "foundation",
    scenarioSpec: {
      kind,
      mode: "interferometer",
      speedFractionC: 0.8,
      properLengthM: 1500,
    },
    hiddenQuantities: ["contractedLengthM", "lorentzFactor"],
    requiredGivens: [
      { name: "speedFractionC", value: 0.8, source: "stem" },
      { name: "properLengthM", value: 1500, unit: "m", source: "stem" },
    ],
    targetQuantityKey: "contractedLengthM",
    unit: "m",
    stem: "A linear particle accelerator tunnel has a proper length of 1500 m in the laboratory frame. What length does this tunnel appear to have in the rest frame of a particle moving through it at $0.800c$?",
    distractors: () => [
      { value: 2500, rationale: "Multiplies proper length by gamma instead of dividing l = l_0 / gamma." },
      { value: 540, rationale: "Forgets the square root in sqrt(1 - 0.80^2) = 0.60, using 0.36 instead." },
      { value: 1200, rationale: "Multiplies length directly by v / c = 0.80." },
    ],
    workedSolution: (_q, ans) =>
      `$\\sqrt{1 - 0.800^2} = 0.600$, so contracted length is $l = l_0 \\sqrt{1 - v^2/c^2} = 1500 \\times 0.600 = ${ans}$.`,
    planSummary: "Calculate Lorentz-contracted tunnel length in a relativistic particle's rest frame.",
  });

  pushCalcMcq(ctx, {
    slug: "tp-rel-calc-03",
    conceptId,
    kind,
    domain: "quantum-nuclear",
    subtopicId: sub,
    difficulty: "standard",
    scenarioSpec: {
      kind,
      mode: "bertozzi",
      speedFractionC: 0.9165,
    },
    hiddenQuantities: ["relativisticKeMeV", "totalEnergyMeV"],
    requiredGivens: [
      { name: "speedFractionC", value: 0.9165, source: "stem" },
    ],
    targetQuantityKey: "relativisticKeMeV",
    unit: "MeV",
    stem: "In a Bertozzi-type accelerator experiment, electrons (rest energy $m_0 c^2 = 0.512\\text{ MeV}$) reach a speed of $0.9165c$. Calculate the relativistic kinetic energy $E_k = (\\gamma - 1) m_0 c^2$ of each electron in MeV.",
    distractors: (q) => {
      const tot = numQ(q, "totalEnergyMeV");
      const cls = numQ(q, "classicalKeMeV");
      return [
        { value: tot, rationale: "Calculates total energy gamma m_0 c^2 instead of subtracting rest energy m_0 c^2." },
        { value: cls, rationale: "Uses the invalid non-relativistic formula 0.5 m_0 v^2." },
        { value: 0.5 * numQ(q, "lorentzFactor") * 0.512 * 0.9165 * 0.9165, rationale: "Uses the incorrect hybrid formula 0.5 (gamma m_0) v^2 instead of (gamma - 1) m_0 c^2." },
      ];
    },
    workedSolution: (q, ans) =>
      `$\\gamma = \\frac{1}{\\sqrt{1 - 0.9165^2}} = ${fmt3(numQ(q, "lorentzFactor"))}$. Rest energy $m_0 c^2 = \\frac{9.11 \\times 10^{-31} \\times (3.00 \\times 10^8)^2}{1.60 \\times 10^{-13}} = 0.512\\text{ MeV}$. Thus $E_k = (\\gamma - 1) m_0 c^2 = ${ans}$.`,
    planSummary: "Compute Bertozzi relativistic electron kinetic energy in MeV from Lorentz factor and rest energy.",
  });

  pushCalcMcq(ctx, {
    slug: "tp-rel-calc-04",
    conceptId,
    kind,
    domain: "quantum-nuclear",
    subtopicId: sub,
    difficulty: "higher",
    scenarioSpec: {
      kind,
      mode: "bertozzi",
      speedFractionC: 0.9428,
    },
    hiddenQuantities: ["speedFractionC", "lorentzFactor"],
    requiredGivens: [
      { name: "relativisticKeMeV", value: 1.025, unit: "MeV", source: "stem" },
    ],
    targetQuantityKey: "speedFractionC",
    stem: "An electron ($m_0 c^2 = 0.512\\text{ MeV}$) is accelerated until its relativistic kinetic energy reaches 1.025 MeV (twice its rest energy). Express the electron's speed as a fraction of the speed of light ($v/c$).",
    distractors: () => [
      { value: 0.866, rationale: "Sets gamma = 2 (forgetting to add rest energy 1 to E_k / m_0 c^2 = 2, so gamma = 3)." },
      { value: 0.889, rationale: "Reports v^2 / c^2 = 8 / 9 without taking the square root." },
      { value: 0.667, rationale: "Computes 1 - 1 / gamma instead of sqrt(1 - 1 / gamma^2)." },
    ],
    workedSolution: (_q, ans) =>
      `Total energy is $E = E_k + m_0 c^2 = 3 m_0 c^2$, so $\\gamma = 3.00$. From $1 - \\frac{v^2}{c^2} = \\frac{1}{\\gamma^2} = \\frac{1}{9}$, $\\frac{v}{c} = \\sqrt{\\frac{8}{9}} = ${ans}$.`,
    planSummary: "Invert relativistic kinetic energy equation to find electron speed fraction v / c.",
  });

  // 3 Pure Qual MCQs
  pushQualMcq(ctx, {
    slug: "tp-rel-qual-01",
    conceptId,
    kind,
    domain: "quantum-nuclear",
    subtopicId: sub,
    difficulty: "foundation",
    questionStyle: "definition",
    scenarioSpec: {
      kind,
      mode: "interferometer",
      speedFractionC: 0.9,
    },
    targetQuantityKey: "einsteinPostulatesAnchor",
    stem: "Which statement accurately expresses the two postulates of Einstein's theory of special relativity?",
    correctOption: (a) => `Special relativity is built on the principles that the ${a}.`,
    distractors: [
      {
        text: "Physical laws apply only in the stationary ether frame and light speed adds linearly to source velocity.",
        rationale: "Directly contradicts both of Einstein's postulates.",
      },
      {
        text: "Time and length are absolute invariants across all frames while light speed changes with observer motion.",
        rationale: "Describes pre-relativistic Galilean kinematics rather than special relativity.",
      },
      {
        text: "Massless particles travel at varying speeds in vacuum depending on the colour of the source.",
        rationale: "All electromagnetic waves in free space travel at the exact same invariant speed c.",
      },
    ],
    workedSolution: (a) =>
      `Einstein's two postulates state that the ${a}.`,
    planSummary: "State Einstein's two postulates of special relativity.",
  });

  pushQualMcq(ctx, {
    slug: "tp-rel-qual-02",
    conceptId,
    kind,
    domain: "quantum-nuclear",
    subtopicId: sub,
    difficulty: "standard",
    scenarioSpec: {
      kind,
      mode: "interferometer",
      speedFractionC: 0.98,
      properTimeUs: 2.2,
    },
    targetQuantityKey: "muonFrameAnchor",
    stem: "Cosmic-ray muons created high in the atmosphere reach sea-level detectors in large numbers despite a very short rest lifetime of 2.2 μs. How is this observation reconciled consistently in both the Earth reference frame and the muon's own rest frame?",
    correctOption: (a) => `Both frames agree because ${a}.`,
    distractors: [
      {
        text: "In Earth frame atmosphere depth is length contracted whereas in the muon rest frame muon lifetime is dilated.",
        rationale: "Reverses which frame observes proper length vs proper time.",
      },
      {
        text: "Muons exceed the speed of light in the upper atmosphere before slowing near sea level.",
        rationale: "No massive particle can reach or exceed c.",
      },
      {
        text: "Both time dilation and length contraction simultaneously double the muon's survival probability in Earth frame.",
        rationale: "You apply time dilation in Earth's frame OR length contraction in the muon's frame—never both to the same frame.",
      },
    ],
    workedSolution: (a) =>
      `Relativity resolves the muon paradox consistently: ${a}.`,
    planSummary: "Reconcile cosmic-ray muon survival across Earth and muon reference frames.",
  });

  pushQualMcq(ctx, {
    slug: "tp-rel-qual-03",
    conceptId,
    kind,
    domain: "quantum-nuclear",
    subtopicId: sub,
    difficulty: "standard",
    scenarioSpec: {
      kind,
      mode: "bertozzi",
      speedFractionC: 0.92,
    },
    targetQuantityKey: "bertozziAnchor",
    stem: "In Bertozzi's experiment measuring electron time-of-flight speed against accelerating kinetic energy up to several MeV, how did the experimental data refute classical mechanics?",
    correctOption: (a) => `Bertozzi's graph demonstrated that ${a}.`,
    distractors: [
      {
        text: "Electron speed increased linearly with kinetic energy far beyond the speed of light.",
        rationale: "Linear v^2 vs E_k surpassing c^2 was the failed classical prediction, not Bertozzi's result.",
      },
      {
        text: "Electron kinetic energy dropped to zero once electrons exceeded half the speed of light.",
        rationale: "Calorimetry at the aluminium target verified that electrons carried the full relativistic kinetic energy.",
      },
      {
        text: "Electron speed peaked at half the speed of light and then decreased at higher accelerating voltages.",
        rationale: "Speed increases monotonically, approaching c asymptotically.",
      },
    ],
    workedSolution: (a) =>
      `Direct speed and calorimeter measurements confirmed $E_k = (\\gamma - 1) m_0 c^2$ as ${a}.`,
    planSummary: "Interpret Bertozzi's experimental squared-speed versus kinetic energy curve.",
  });

  // 4 Multi-part Structured
  pushStructured(ctx, {
    slug: "tp-rel-str-01",
    conceptId,
    kind,
    domain: "quantum-nuclear",
    subtopicId: sub,
    difficulty: "standard",
    questionStyle: "mixed-exam",
    scenarioSpec: {
      kind,
      mode: "interferometer",
      speedFractionC: 0.98,
      properTimeUs: 2.2,
    },
    hiddenQuantities: [
      "lorentzFactor",
      "dilatedTimeUs",
      "earthFrameDistanceM",
      "muonFrameAnchor",
    ],
    requiredGivens: [
      { name: "speedFractionC", value: 0.98, source: "stem" },
      { name: "properTimeUs", value: 2.2, unit: "μs", source: "stem" },
    ],
    stem: "A beam of cosmic-ray muons moves vertically downward at $v = 0.980c$ ($c = 3.00 \\times 10^8\\text{ m s}^{-1}$). The mean proper lifetime of a stationary muon is $t_0 = 2.20\\,\\mu\\text{s}$.",
    build: (q) => {
      const g = numQ(q, "lorentzFactor");
      const tDil = numQ(q, "dilatedTimeUs");
      const dEarth = numQ(q, "earthFrameDistanceM");
      const mf = strQ(q, "muonFrameAnchor");
      return {
        parts: [
          {
            partId: "a",
            prompt: "Calculate the mean lifetime of these muons in the Earth reference frame.",
            marks: 2,
            targetQuantityKey: "dilatedTimeUs",
            expectedAnswer: fmt3(tDil, "μs"),
            workingSteps: [
              `$\\gamma = \\frac{1}{\\sqrt{1 - 0.980^2}} = ${fmt3(g)}$.`,
              `$t = \\gamma t_0 = ${fmt3(g)} \\times 2.20 = ${fmt3(tDil, "μs")}$.`,
            ],
          },
          {
            partId: "b",
            prompt: "Calculate the mean distance travelled by the muons in the Earth frame before decaying.",
            marks: 2,
            dependsOnPartIds: ["a"],
            targetQuantityKey: "earthFrameDistanceM",
            expectedAnswer: fmt3(dEarth, "m"),
            workingSteps: [
              `$d = v t = (0.980 \\times 3.00 \\times 10^8) \\times (${fmt3(tDil)} \\times 10^{-6}) = ${fmt3(dEarth, "m")}$.`,
            ],
          },
          {
            partId: "c",
            prompt: "Explain how an observer moving alongside the muons accounts for their survival over this atmospheric depth.",
            marks: 2,
            targetMode: "qualitative",
            targetQuantityKey: "muonFrameAnchor",
            expectedAnswer: `Relativity is frame-consistent because ${mf}, so the contracted atmosphere passes within $2.20\\,\\mu\\text{s}$.`,
            workingSteps: [
              "In the muon's own rest frame, its lifetime remains the proper time $2.20\\,\\mu\\text{s}$.",
              "The approaching atmosphere is Lorentz-contracted by factor $\\gamma$ to roughly $647\\text{ m}$, traversable within $2.20\\,\\mu\\text{s}$.",
            ],
          },
        ],
        markScheme: [
          { code: "M1", criterion: "Computes $\\gamma = 1 / \\sqrt{1 - 0.980^2} = 5.03$ and multiplies by $2.20\\,\\mu\\text{s}$.", marks: 1, partId: "a" },
          { code: "A1", criterion: `Correct dilated lifetime ${fmt3(tDil, "μs")}.`, marks: 1, partId: "a" },
          { code: "M1", criterion: "Multiplies $0.980 c$ by dilated lifetime in seconds.", marks: 1, partId: "b" },
          { code: "A1", criterion: `Correct Earth-frame distance ${fmt3(dEarth, "m")}.`, marks: 1, partId: "b" },
          { code: "B1", criterion: "States muon lifetime is undilated ($2.20\\,\\mu\\text{s}$) in its own rest frame.", marks: 1, partId: "c" },
          { code: "B1", criterion: "Explains the atmospheric depth is length-contracted by factor $\\gamma$ in the muon frame.", marks: 1, partId: "c" },
        ],
        workedSolution: `(a) $\\gamma = ${fmt3(g)}$, $t = ${fmt3(tDil, "μs")}$. (b) $d = ${fmt3(dEarth, "m")}$. (c) ${mf}.`,
      };
    },
    planSummary: "Analyse cosmic-ray muon time dilation, Earth-frame range, and muon-frame length contraction.",
    subpartPlan: ["Earth-frame dilated lifetime", "Earth-frame distance", "muon-frame length contraction"],
  });

  pushStructured(ctx, {
    slug: "tp-rel-str-02",
    conceptId,
    kind,
    domain: "quantum-nuclear",
    subtopicId: sub,
    difficulty: "standard",
    questionStyle: "calculation",
    scenarioSpec: {
      kind,
      mode: "bertozzi",
      speedFractionC: 0.9,
    },
    hiddenQuantities: [
      "lorentzFactor",
      "totalEnergyMeV",
      "relativisticKeMeV",
      "classicalKeMeV",
    ],
    requiredGivens: [
      { name: "speedFractionC", value: 0.9, source: "stem" },
    ],
    stem: "Electrons ($m_0 = 9.11 \\times 10^{-31}\\text{ kg}$, $c = 3.00 \\times 10^8\\text{ m s}^{-1}$, $e = 1.60 \\times 10^{-19}\\text{ C}$) in a linear accelerator attain a speed of $0.900c$.",
    build: (q) => {
      const g = numQ(q, "lorentzFactor");
      const tot = numQ(q, "totalEnergyMeV");
      const rKe = numQ(q, "relativisticKeMeV");
      const cKe = numQ(q, "classicalKeMeV");
      return {
        parts: [
          {
            partId: "a",
            prompt: "Calculate the total relativistic energy of one electron in MeV.",
            marks: 3,
            targetQuantityKey: "totalEnergyMeV",
            expectedAnswer: fmt3(tot, "MeV"),
            workingSteps: [
              `$\\gamma = \\frac{1}{\\sqrt{1 - 0.900^2}} = ${fmt3(g)}$.`,
              "Rest energy $m_0 c^2 = 8.20 \\times 10^{-14}\\text{ J} = 0.512\\text{ MeV}$.",
              `$E = \\gamma m_0 c^2 = ${fmt3(g)} \\times 0.512 = ${fmt3(tot, "MeV")}$.`,
            ],
          },
          {
            partId: "b",
            prompt: "Calculate the relativistic kinetic energy $E_k = (\\gamma - 1) m_0 c^2$ in MeV.",
            marks: 2,
            dependsOnPartIds: ["a"],
            targetQuantityKey: "relativisticKeMeV",
            expectedAnswer: fmt3(rKe, "MeV"),
            workingSteps: [`$E_k = E - m_0 c^2 = ${fmt3(tot)} - 0.512 = ${fmt3(rKe, "MeV")}$.`],
          },
          {
            partId: "c",
            prompt: "Calculate the kinetic energy predicted by classical mechanics ($\\frac{1}{2}m_0 v^2$) in MeV and comment on the discrepancy.",
            marks: 2,
            targetQuantityKey: "classicalKeMeV",
            expectedAnswer: `${fmt3(cKe, "MeV")} (classical mechanics drastically underestimates the energy needed at $0.900c$).`,
            workingSteps: [
              `$E_{k,\\text{cl}} = \\frac{1}{2}(9.11 \\times 10^{-31})(0.900 \\times 3.00 \\times 10^8)^2 = 3.32 \\times 10^{-14}\\text{ J} = ${fmt3(cKe, "MeV")}$.`,
            ],
          },
        ],
        markScheme: [
          { code: "M1", criterion: "Evaluates $\\gamma = 1 / \\sqrt{1 - 0.900^2} = 2.294$.", marks: 1, partId: "a" },
          { code: "M1", criterion: "Computes $E = \\gamma m_0 c^2$ and converts joules to MeV.", marks: 1, partId: "a" },
          { code: "A1", criterion: `Correct total energy ${fmt3(tot, "MeV")}.`, marks: 1, partId: "a" },
          { code: "M1", criterion: "Subtracts rest energy $0.512\\text{ MeV}$ from total energy.", marks: 1, partId: "b" },
          { code: "A1", criterion: `Correct relativistic KE ${fmt3(rKe, "MeV")}.`, marks: 1, partId: "b" },
          { code: "M1", criterion: "Computes $\\frac{1}{2} m_0 (0.900c)^2$ and converts to MeV.", marks: 1, partId: "c" },
          { code: "A1", criterion: `Correct classical KE ${fmt3(cKe, "MeV")} noting severe underestimate.`, marks: 1, partId: "c" },
        ],
        workedSolution: `(a) $E = ${fmt3(tot, "MeV")}$. (b) $E_k = ${fmt3(rKe, "MeV")}$. (c) Classical $E_k = ${fmt3(cKe, "MeV")}$, much smaller than relativistic KE.`,
      };
    },
    planSummary: "Compare relativistic total and kinetic energy against classical kinetic energy at relativistic speed.",
    subpartPlan: ["total relativistic energy", "relativistic kinetic energy", "classical kinetic energy comparison"],
  });

  pushStructured(ctx, {
    slug: "tp-rel-str-03",
    conceptId,
    kind,
    domain: "quantum-nuclear",
    subtopicId: sub,
    difficulty: "standard",
    questionStyle: "mixed-exam",
    scenarioSpec: {
      kind,
      mode: "interferometer",
      speedFractionC: 0.6,
      properLengthM: 240,
      properTimeUs: 1.5,
    },
    hiddenQuantities: [
      "contractedLengthM",
      "dilatedTimeUs",
      "mmNullResultAnchor",
    ],
    requiredGivens: [
      { name: "speedFractionC", value: 0.6, source: "stem" },
      { name: "properLengthM", value: 240, unit: "m", source: "stem" },
      { name: "properTimeUs", value: 1.5, unit: "μs", source: "stem" },
    ],
    stem: "A futuristic spacecraft of proper length 240 m cruises past a space station at $0.600c$. An onboard clock ticks through a proper interval of $1.50\\,\\mu\\text{s}$.",
    build: (q) => {
      const l = numQ(q, "contractedLengthM");
      const t = numQ(q, "dilatedTimeUs");
      const mm = strQ(q, "mmNullResultAnchor");
      return {
        parts: [
          {
            partId: "a",
            prompt: "Calculate the length of the spacecraft measured by observers on the space station.",
            marks: 2,
            targetQuantityKey: "contractedLengthM",
            expectedAnswer: fmt3(l, "m"),
            workingSteps: [`$l = 240 \\sqrt{1 - 0.600^2} = 240 \\times 0.800 = ${fmt3(l, "m")}$.`],
          },
          {
            partId: "b",
            prompt: "Calculate the duration of the $1.50\\,\\mu\\text{s}$ onboard interval as measured by clocks on the space station.",
            marks: 2,
            targetQuantityKey: "dilatedTimeUs",
            expectedAnswer: fmt3(t, "μs"),
            workingSteps: [`$t = \\frac{1.50}{0.800} = ${fmt3(t, "μs")}$.`],
          },
          {
            partId: "c",
            prompt: "State how the null result of the Michelson–Morley experiment supported the invariance of $c$ underlying these equations.",
            marks: 2,
            targetMode: "qualitative",
            targetQuantityKey: "mmNullResultAnchor",
            expectedAnswer: `The experiment recorded ${mm}.`,
            workingSteps: [
              "Rotating the interferometer by $90°$ yielded zero fringe shift despite Earth's orbital motion.",
              "This disproved a stationary ether and confirmed $c$ is identical along every direction.",
            ],
          },
        ],
        markScheme: [
          { code: "M1", criterion: "Applies $l = l_0 \\sqrt{1 - 0.600^2}$.", marks: 1, partId: "a" },
          { code: "A1", criterion: `Correct contracted length ${fmt3(l, "m")}.`, marks: 1, partId: "a" },
          { code: "M1", criterion: "Applies $t = t_0 / \\sqrt{1 - 0.600^2}$.", marks: 1, partId: "b" },
          { code: "A1", criterion: `Correct dilated time ${fmt3(t, "μs")}.`, marks: 1, partId: "b" },
          { code: "B1", criterion: "States zero fringe shift occurred upon $90°$ rotation.", marks: 1, partId: "c" },
          { code: "B1", criterion: "Links null result to absence of ether and invariant speed of light.", marks: 1, partId: "c" },
        ],
        workedSolution: `(a) $l = ${fmt3(l, "m")}$. (b) $t = ${fmt3(t, "μs")}$. (c) ${mm}.`,
      };
    },
    planSummary: "Compute spacecraft length contraction and time dilation and link to Michelson-Morley null result.",
    subpartPlan: ["length contraction", "time dilation", "Michelson-Morley significance"],
  });

  pushStructured(ctx, {
    slug: "tp-rel-str-04",
    conceptId,
    kind,
    domain: "quantum-nuclear",
    subtopicId: sub,
    difficulty: "higher",
    questionStyle: "mixed-exam",
    scenarioSpec: {
      kind,
      mode: "bertozzi",
      speedFractionC: 0.95,
    },
    hiddenQuantities: [
      "lorentzFactor",
      "relativisticKeJ",
      "bertozziAnchor",
    ],
    requiredGivens: [
      { name: "speedFractionC", value: 0.95, source: "stem" },
    ],
    stem: "In a relativistic electron linac ($m_0 = 9.11 \\times 10^{-31}\\text{ kg}$, $c = 3.00 \\times 10^8\\text{ m s}^{-1}$), electrons are accelerated to $v = 0.950c$.",
    build: (q) => {
      const g = numQ(q, "lorentzFactor");
      const keJ = numQ(q, "relativisticKeJ");
      const b = strQ(q, "bertozziAnchor");
      return {
        parts: [
          {
            partId: "a",
            prompt: "Calculate the Lorentz factor $\\gamma$ of the electrons.",
            marks: 2,
            targetQuantityKey: "lorentzFactor",
            expectedAnswer: fmt3(g),
            workingSteps: [`$\\gamma = \\frac{1}{\\sqrt{1 - 0.950^2}} = ${fmt3(g)}$.`],
          },
          {
            partId: "b",
            prompt: "Calculate the relativistic kinetic energy of one electron in joules.",
            marks: 2,
            dependsOnPartIds: ["a"],
            targetQuantityKey: "relativisticKeJ",
            expectedAnswer: fmt3(keJ, "J"),
            workingSteps: [
              `$E_k = (${fmt3(g)} - 1) \\times 9.11 \\times 10^{-31} \\times (3.00 \\times 10^8)^2 = ${fmt3(keJ, "J")}$.`,
            ],
          },
          {
            partId: "c",
            prompt: "Explain why no finite accelerating potential difference can ever accelerate an electron to $v = c$.",
            marks: 2,
            targetMode: "qualitative",
            targetQuantityKey: "bertozziAnchor",
            expectedAnswer: `Because $\\gamma \\to \\infty$ as $v \\to c$, infinite energy would be required; consequently, ${b}.`,
            workingSteps: [
              "As $v \\to c$, $\\sqrt{1 - v^2/c^2} \\to 0$ so $E_k = (\\gamma - 1) m_0 c^2 \\to \\infty$.",
              "Hence $c$ is an unattainable upper speed limit for any particle with non-zero rest mass.",
            ],
          },
        ],
        markScheme: [
          { code: "M1", criterion: "Applies $\\gamma = 1 / \\sqrt{1 - 0.950^2}$.", marks: 1, partId: "a" },
          { code: "A1", criterion: `Correct Lorentz factor ${fmt3(g)}.`, marks: 1, partId: "a" },
          { code: "M1", criterion: "Applies $E_k = (\\gamma - 1) m_0 c^2$.", marks: 1, partId: "b" },
          { code: "A1", criterion: `Correct kinetic energy ${fmt3(keJ, "J")}.`, marks: 1, partId: "b" },
          { code: "B1", criterion: "Shows $\\gamma$ and $E_k$ tend to infinity as $v \\to c$.", marks: 1, partId: "c" },
          { code: "B1", criterion: "Concludes speed approaches $c$ asymptotically and no finite energy reaches $c$.", marks: 1, partId: "c" },
        ],
        workedSolution: `(a) $\\gamma = ${fmt3(g)}$. (b) $E_k = ${fmt3(keJ, "J")}$. (c) ${b}.`,
      };
    },
    planSummary: "Evaluate Lorentz factor and relativistic KE in joules and explain asymptotic speed limit c.",
    subpartPlan: ["Lorentz factor", "relativistic KE in joules", "asymptotic limit c explanation"],
  });

  // 1 Authentic 6-Mark LoR
  pushSixMarkLor(ctx, {
    slug: "tp-rel-lor-01",
    conceptId,
    kind,
    domain: "quantum-nuclear",
    subtopicId: sub,
    scenarioSpec: {
      kind,
      mode: "interferometer",
      speedFractionC: 0.9,
      properTimeUs: 2.2,
      properLengthM: 500,
    },
    targetQuantityKey: "lorMichelsonAnchor",
    stem: "In 1887, Albert Michelson and Edward Morley attempted to detect Earth's motion through the hypothetical luminiferous ether using an optical interferometer floated on liquid mercury.",
    prompt:
      "Describe the design and operation of the Michelson–Morley interferometer, explain why a fringe shift was expected upon rotating the apparatus by $90°$, and discuss the significance of their null result for Einstein's theory of special relativity.",
    expectedAnswer: (anchor) =>
      `In this landmark experiment, ${anchor}. Monochromatic coherent light from a single source strikes a $45°$ semi-silvered beam splitter, dividing into two coherent beams that travel along perpendicular arms of equal length $L$ to mirrors $M_1$ and $M_2$ (a glass compensator plate equalises optical glass path length in both arms). The beams reflect back, recombine at the beam splitter, and enter an observing telescope where they superpose to form bright and dark interference fringes. Assuming Earth moved at orbital speed $v$ through a stationary ether, classical velocity addition predicted unequal round-trip travel times parallel ($\\frac{2L/c}{1 - v^2/c^2}$) and perpendicular ($\\frac{2L/c}{\\sqrt{1 - v^2/c^2}}$) to the ether wind. Smoothly rotating the granite table by $90°$ on mercury swapped the parallel and perpendicular arms, which was predicted to shift the interference pattern by roughly $0.4$ of a fringe spacing—easily detectable by the apparatus. Despite repeating the measurement at different orientations and seasons, zero fringe shift was ever observed. This null result proved that absolute motion through an ether cannot be detected and led directly to Einstein's postulate that the speed of light in free space is invariant for all inertial observers regardless of source or observer velocity.`,
    workingSteps: [
      "Describe interferometer layout: monochromatic source, $45°$ semi-silvered splitter, compensator plate, perpendicular mirrors $M_1, M_2$, telescope.",
      "Explain interference fringes formed by superposition of the two recombined coherent beams.",
      "Explain ether prediction: different round-trip speeds parallel vs perpendicular to Earth's motion through ether.",
      "Explain $90°$ rotation on liquid mercury swapping the two arms and predicting a measurable (~0.4) fringe shift.",
      "State the experimental observation: consistently zero (null) fringe shift across orientations and seasons.",
      "Explain significance: no detectable ether / absolute rest frame and speed of light $c$ is invariant in all inertial frames.",
    ],
    criteriaSix: [
      "Describes coherent monochromatic light split by a semi-silvered mirror along two perpendicular equal-length arms to mirrors $M_1$ and $M_2$ (plus compensator).",
      "Explains recombined beams interfere in the telescope to produce an observable fringe pattern.",
      "Explains ether-wind hypothesis predicted different round-trip transit times along parallel and perpendicular arms.",
      "Explains rotating the apparatus by $90°$ swaps the arm roles and was expected to shift fringes by a detectable fraction (~0.4 fringe).",
      "States clearly that zero fringe shift (a null result) was observed at all times of day and year.",
      "Links the null result to the non-existence of absolute motion through an ether and Einstein's postulate of invariant light speed $c$.",
    ],
    workedSolution: (anchor) =>
      `Level 3 synthesis: ${anchor}; covers optical layout, ether-wind transit asymmetry, $90°$ rotation expectation (~0.4 fringe), null observation, and Einstein's invariant-$c$ postulate.`,
    planSummary: "Six-mark level-of-response account of the Michelson-Morley experiment and its null result.",
  });
}

/* ========================================================================== */
/*  Public Generator Entrypoint                                               */
/* ========================================================================== */

export function generateAlevelOptionsAstromedCandidates(
  options: GenerateAlevelOptionsAstromedOptions = {},
): CandidateQuestionInput[] {
  const baseSeed = options.baseSeed ?? ALEVEL_OPT_AM_DEFAULT_BASE_SEED;
  const generatorModel =
    options.generatorModel ?? ALEVEL_OPT_AM_DEFAULT_MODEL;
  let offset = 0;

  const ctx: BuilderContext = {
    nextSeed: () => {
      offset += 1;
      return baseSeed + offset;
    },
    generatorModel,
    items: [],
  };

  // Option 3.9 Astrophysics (4 plugins × 12 = 48 items)
  populateAstroTelescopeOptics(ctx);
  populateAstroResolutionCcd(ctx);
  populateAstroMagnitudeSupernovae(ctx);
  populateAstroExoplanetsBlackholes(ctx);

  // Option 3.10 Medical Physics (5 plugins × 12 = 60 items)
  populateMedEyeDefects(ctx);
  populateMedRetinaEarDb(ctx);
  populateMedUltrasoundAscan(ctx);
  populateMedXrayAttenuation(ctx);
  populateMedNuclearImaging(ctx);

  // Option 3.12 Turning Points in Physics (5 plugins × 12 = 60 items)
  populateTpThomsonEm(ctx);
  populateTpMillikanOildrop(ctx);
  populateTpLightHertzMaxwell(ctx);
  populateTpElectronMicroscopy(ctx);
  populateTpMichelsonRelativity(ctx);

  return ctx.items;
}
