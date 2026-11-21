import { buildOptionEquivalenceKey } from "@/lib/bank-pipeline/numeric-checker";
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
} from "@/lib/bank-pipeline/types";
import {
  ALEVEL_CORE_AS_PLUGINS_BY_KIND,
  AlevelCoreAsScenarioKind,
  AQA_C_MS,
  AQA_E_C,
  AQA_G_MS2,
  AQA_H_JS,
  AQA_ME_MEV,
  AQA_MP_KG,
  FeynmanInteractionMode,
  ReactionId,
} from "@/lib/visuals/alevel-core-as";

export const ALEVEL_CORE_AS_DEFAULT_BASE_SEED = 74_000_000;
export const ALEVEL_CORE_AS_ID_PREFIX = "sp-v3-al-as";
export const ALEVEL_CORE_AS_DEFAULT_MODEL =
  "deterministic-alevel-core-as-v3/1.0.0";

export interface GenerateAlevelCoreAsOptions {
  readonly baseSeed?: number;
  readonly generatorModel?: string;
}

/* -------------------------------------------------------------------------- */
/*  Formatting, Solver Dispatch & Builder Helpers                             */
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

function supInt(exp: number): string {
  return [...String(exp)].map((c) => SUP_DIGITS[c] ?? c).join("");
}

function fmtSig(value: number, sf = 3, unit?: string): string {
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
    numStr = `${sign}${mant.toPrecision(sf)} × 10${supInt(exp)}`;
  } else {
    numStr = `${sign}${abs.toPrecision(sf)}`;
  }
  if (!unit) return numStr;
  return unit === "%" ? `${numStr}%` : `${numStr} ${unit}`;
}

function solveKind(
  kind: AlevelCoreAsScenarioKind,
  spec: Record<string, unknown>,
): Record<string, number | string | boolean> {
  return ALEVEL_CORE_AS_PLUGINS_BY_KIND[kind].solve(spec).quantities;
}

function numVal(
  q: Record<string, number | string | boolean>,
  key: string,
): number {
  const v = q[key];
  if (typeof v !== "number" || !Number.isFinite(v)) {
    throw new Error(`Expected finite number for solver key "${key}", got ${String(v)}`);
  }
  return v;
}

function strVal(
  q: Record<string, number | string | boolean>,
  key: string,
): string {
  const v = q[key];
  if (typeof v !== "string" || !v.trim()) {
    throw new Error(`Expected non-empty string for solver key "${key}", got ${String(v)}`);
  }
  return v;
}

function asTag(topicId: string, subtopicId: string): SyllabusTag[] {
  return [{ syllabus: "alevel", level: "Y12", topicId, subtopicId }];
}

const TAG_31 = asTag(
  "alevel-sec1-measurements-errors",
  "alevel-3-1-si-uncertainties-estimation",
);
const TAG_321 = asTag(
  "alevel-sec2-particles-radiation",
  "alevel-3-2-1-particles-quarks",
);
const TAG_322 = asTag(
  "alevel-sec2-particles-radiation",
  "alevel-3-2-2-quantum-phenomena",
);
const TAG_331 = asTag(
  "alevel-sec3-waves",
  "alevel-3-3-1-progressive-stationary-waves",
);
const TAG_332 = asTag(
  "alevel-sec3-waves",
  "alevel-3-3-2-refraction-diffraction-interference",
);
const TAG_341 = asTag(
  "alevel-sec4-mechanics-materials",
  "alevel-3-4-1-force-energy-momentum",
);
const TAG_342 = asTag(
  "alevel-sec4-mechanics-materials",
  "alevel-3-4-2-materials-young-modulus",
);
const TAG_351 = asTag(
  "alevel-sec5-electricity",
  "alevel-3-5-1-current-electricity",
);

interface VerbalDistractor {
  readonly text: string;
  readonly rationale: string;
}

interface NumericDistractor {
  readonly value: number;
  readonly rationale: string;
}

function buildVerbalOptions(
  correctText: string,
  distractors: readonly [VerbalDistractor, VerbalDistractor, VerbalDistractor],
  seed: number,
): McqOptionItem[] {
  const slot = ((seed % 4) + 4) % 4;
  const out: McqOptionItem[] = [];
  let d = 0;
  for (let i = 0; i < 4; i += 1) {
    if (i === slot) {
      out.push({ label: MCQ_OPTION_LABELS[i], text: correctText, isCorrect: true });
    } else {
      const dist = distractors[d];
      d += 1;
      out.push({
        label: MCQ_OPTION_LABELS[i],
        text: dist.text,
        isCorrect: false,
        distractorRationale: dist.rationale,
      });
    }
  }
  return out;
}

function distinct3sf(a: number, b: number): boolean {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  const scale = Math.max(Math.abs(a), Math.abs(b), 1e-12);
  if (Math.abs(a - b) / scale < 0.045) return false;
  return a.toPrecision(3) !== b.toPrecision(3);
}

function buildNumericOptions(
  correctVal: number,
  unit: string | undefined,
  distractors: readonly NumericDistractor[],
  seed: number,
): McqOptionItem[] {
  const correctText = fmtSig(correctVal, 3, unit);
  const usedKeys = new Set<string>([buildOptionEquivalenceKey(correctText)]);
  const usedVals: number[] = [correctVal];
  const chosen: Array<{ text: string; rationale: string }> = [];

  const fallbacks: NumericDistractor[] = [
    {
      value: correctVal * 0.5,
      rationale: "Applies an incorrect factor of one-half during formula rearrangement.",
    },
    {
      value: correctVal * 2.0,
      rationale: "Doubles the target quantity by omitting a factor of two in the denominator.",
    },
    {
      value: correctVal * 1.38,
      rationale: "Substitutes an inconsistent unit prefix or misreads an input scale.",
    },
    {
      value: correctVal * 0.68,
      rationale: "Truncates an intermediate step prematurely before final evaluation.",
    },
  ];

  for (const cand of [...distractors, ...fallbacks]) {
    if (chosen.length >= 3) break;
    if (!Number.isFinite(cand.value) || Math.abs(cand.value) < 1e-35) continue;
    if (!usedVals.every((v) => distinct3sf(cand.value, v))) continue;
    const text = fmtSig(cand.value, 3, unit);
    const key = buildOptionEquivalenceKey(text);
    if (usedKeys.has(key)) continue;
    usedKeys.add(key);
    usedVals.push(cand.value);
    chosen.push({ text, rationale: cand.rationale });
  }

  const slot = ((seed % 4) + 4) % 4;
  const out: McqOptionItem[] = [];
  let d = 0;
  for (let i = 0; i < 4; i += 1) {
    if (i === slot) {
      out.push({ label: MCQ_OPTION_LABELS[i], text: correctText, isCorrect: true });
    } else {
      const dist = chosen[d];
      d += 1;
      out.push({
        label: MCQ_OPTION_LABELS[i],
        text: dist.text,
        isCorrect: false,
        distractorRationale: dist.rationale,
      });
    }
  }
  return out;
}

function makeLorCriteria(
  partId: string,
  points: readonly [string, string, string, string, string, string],
): MarkSchemePoint[] {
  const codes = ["L1a", "L1b", "L2a", "L2b", "L3a", "L3b"] as const;
  return codes.map((code, idx) => ({
    code,
    criterion: points[idx],
    marks: 1,
    partId,
  }));
}

interface BuilderContext {
  readonly baseSeed: number;
  readonly generatorModel: string;
  readonly items: CandidateQuestionInput[];
  nextOffset: number;
}

function addQualMcq(
  ctx: BuilderContext,
  cfg: {
    slug: string;
    domain: PhysicsDomainId;
    kind: AlevelCoreAsScenarioKind;
    conceptId: string;
    syllabi: SyllabusTag[];
    difficulty: QuestionDifficulty;
    questionStyle?: QuestionStyleTag;
    scenarioSpec: Record<string, unknown>;
    targetQuantityKey: string;
    hiddenQuantities?: string[];
    requiredGivens?: RequiredGivenSpec[];
    stem: string;
    correctPrefix?: string;
    correctSuffix?: string;
    distractors: readonly [VerbalDistractor, VerbalDistractor, VerbalDistractor];
    workedNote: string;
    markCriterionExtra?: string;
  },
): void {
  const seed = ctx.baseSeed + ctx.nextOffset;
  ctx.nextOffset += 1;
  const solved = solveKind(cfg.kind, cfg.scenarioSpec);
  const truth = strVal(solved, cfg.targetQuantityKey);
  const correctText = [cfg.correctPrefix, truth, cfg.correctSuffix]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+([.,;:])/g, "$1")
    .trim();
  const options = buildVerbalOptions(correctText, cfg.distractors, seed);
  const correctLabel = options.find((o) => o.isCorrect)!.label;
  const hidden = cfg.hiddenQuantities ?? [cfg.targetQuantityKey];

  ctx.items.push({
    id: `${ALEVEL_CORE_AS_ID_PREFIX}-${cfg.slug}`,
    conceptId: cfg.conceptId,
    templateArchetype: cfg.kind,
    seed,
    syllabi: cfg.syllabi,
    format: "mcq",
    questionStyle: cfg.questionStyle ?? "qualitative",
    difficulty: cfg.difficulty,
    domain: cfg.domain,
    scenarioSpec: cfg.scenarioSpec,
    hiddenQuantities: hidden,
    requiredGivens: cfg.requiredGivens ?? [],
    questionPlan: {
      targetSummary:
        "Assess conceptual A-Level Year Twelve physics reasoning via single-best-answer verbal elimination.",
      distractorStrategy: [
        "examiner-trap-terminology-confusion",
        "reversed-physical-causality",
        "partial-conservation-oversight",
      ],
    },
    stem: cfg.stem,
    options,
    targetMode: "qualitative",
    targetQuantityKey: cfg.targetQuantityKey,
    workedSolution: `${cfg.workedNote} Therefore option ${correctLabel} is correct: ${truth}.`,
    markScheme: [
      {
        code: "B1",
        criterion: `Select option ${correctLabel}: ${truth}.${cfg.markCriterionExtra ? ` ${cfg.markCriterionExtra}` : ""}`,
        marks: 1,
      },
    ],
    totalMarks: 1,
    generatorModel: ctx.generatorModel,
  });
}

function addNumMcq(
  ctx: BuilderContext,
  cfg: {
    slug: string;
    domain: PhysicsDomainId;
    kind: AlevelCoreAsScenarioKind;
    conceptId: string;
    syllabi: SyllabusTag[];
    difficulty: QuestionDifficulty;
    scenarioSpec: Record<string, unknown>;
    targetQuantityKey: string;
    unit?: string;
    hiddenQuantities?: string[];
    requiredGivens: RequiredGivenSpec[];
    stem: string;
    distractors: readonly NumericDistractor[];
    workedSolution: string;
    markCriterion: string;
  },
): void {
  const seed = ctx.baseSeed + ctx.nextOffset;
  ctx.nextOffset += 1;
  const solved = solveKind(cfg.kind, cfg.scenarioSpec);
  const val = numVal(solved, cfg.targetQuantityKey);
  const options = buildNumericOptions(val, cfg.unit, cfg.distractors, seed);
  const correctOpt = options.find((o) => o.isCorrect)!;
  const hidden = cfg.hiddenQuantities ?? [cfg.targetQuantityKey];

  ctx.items.push({
    id: `${ALEVEL_CORE_AS_ID_PREFIX}-${cfg.slug}`,
    conceptId: cfg.conceptId,
    templateArchetype: cfg.kind,
    seed,
    syllabi: cfg.syllabi,
    format: "mcq",
    questionStyle: "calculation",
    difficulty: cfg.difficulty,
    domain: cfg.domain,
    scenarioSpec: cfg.scenarioSpec,
    hiddenQuantities: hidden,
    requiredGivens: cfg.requiredGivens,
    questionPlan: {
      targetSummary:
        "Evaluate quantitative A-Level Year Twelve physics relationship with standard AQA constants.",
      distractorStrategy: [
        "missing-conversion-or-prefactor",
        "inverted-algebraic-ratio",
        "classic-concept-substitution-trap",
      ],
    },
    stem: cfg.stem,
    options,
    targetMode: "quantitative",
    targetQuantityKey: cfg.targetQuantityKey,
    workedSolution: `${cfg.workedSolution} Option ${correctOpt.label} (${correctOpt.text}) matches.`,
    markScheme: [
      {
        code: "A1",
        criterion: `${cfg.markCriterion} (${correctOpt.text}, option ${correctOpt.label}).`,
        marks: 1,
      },
    ],
    totalMarks: 1,
    generatorModel: ctx.generatorModel,
  });
}

function addStructured(
  ctx: BuilderContext,
  cfg: {
    slug: string;
    domain: PhysicsDomainId;
    kind: AlevelCoreAsScenarioKind;
    conceptId: string;
    syllabi: SyllabusTag[];
    difficulty: QuestionDifficulty;
    questionStyle: QuestionStyleTag;
    targetMode: "quantitative" | "qualitative";
    scenarioSpec: Record<string, unknown>;
    hiddenQuantities: string[];
    requiredGivens: RequiredGivenSpec[];
    stem: string;
    parts: StructuredQuestionPart[];
    workedSolution: string;
    markScheme: MarkSchemePoint[];
    subpartStrategy: string[];
  },
): void {
  const seed = ctx.baseSeed + ctx.nextOffset;
  ctx.nextOffset += 1;
  const totalMarks = cfg.parts.reduce((acc, p) => acc + p.marks, 0);

  ctx.items.push({
    id: `${ALEVEL_CORE_AS_ID_PREFIX}-${cfg.slug}`,
    conceptId: cfg.conceptId,
    templateArchetype: cfg.kind,
    seed,
    syllabi: cfg.syllabi,
    format: "structured",
    questionStyle: cfg.questionStyle,
    difficulty: cfg.difficulty,
    domain: cfg.domain,
    scenarioSpec: cfg.scenarioSpec,
    hiddenQuantities: cfg.hiddenQuantities,
    requiredGivens: cfg.requiredGivens,
    questionPlan: {
      targetSummary:
        "Assess structured A-Level Year Twelve physics analysis and extended written reasoning.",
      subpartStrategy: cfg.subpartStrategy,
    },
    stem: cfg.stem,
    targetMode: cfg.targetMode,
    parts: cfg.parts,
    workedSolution: cfg.workedSolution,
    markScheme: cfg.markScheme,
    totalMarks,
    generatorModel: ctx.generatorModel,
  });
}

/* -------------------------------------------------------------------------- */
/*  FAMILY 1: al-as-si-base-fermi-estimation (11 items: 5Q + 3C + 3 Struct)   */
/* -------------------------------------------------------------------------- */

function buildFamily1SiBaseFermi(ctx: BuilderContext): void {
  const kind = "al-as-si-base-fermi-estimation" as const;

  // 5 Pure Qualitative MCQs
  addQualMcq(ctx, {
    slug: "si-spring-k-base",
    domain: "pure-calculation",
    kind,
    conceptId: "si-units-dimensional-analysis",
    syllabi: TAG_31,
    difficulty: "foundation",
    questionStyle: "definition",
    scenarioSpec: { kind, mode: "dimensional", entryKey: "spring-k" },
    targetQuantityKey: "baseUnitWords",
    hiddenQuantities: ["baseUnitString", "baseUnitWords", "expKg", "expS"],
    stem: "A helical steel spring obeys Hooke's law $F = k\\Delta L$. Expressed purely in coherent SI base units, what is the unit of the spring constant $k$?",
    correctPrefix: "Expressed in SI base units it is",
    distractors: [
      {
        text: "Expressed in SI base units it is newton per metre because force is an SI base unit",
        rationale: "Newton is a derived unit, not an SI base unit; AQA awards zero credit for N m⁻¹ when base units are requested.",
      },
      {
        text: "Expressed in SI base units it is kilogram metre per second squared",
        rationale: "Forgets to divide the newton (kg m s⁻²) by metre, leaving the unit of force.",
      },
      {
        text: "Expressed in SI base units it is kilogram per metre per second squared",
        rationale: "Confuses spring constant (force per unit length) with pressure or Young modulus (force per unit area).",
      },
    ],
    workedNote:
      "Using $k = F/\\Delta L$, the newton is $\\mathrm{kg\\,m\\,s^{-2}}$, so dividing by $\\mathrm{m}$ cancels length to leave $\\mathrm{kg\\,s^{-2}}$.",
    markCriterionExtra: "Reject N m⁻¹ when SI base units are explicitly demanded.",
  });

  addQualMcq(ctx, {
    slug: "si-ohm-base",
    domain: "pure-calculation",
    kind,
    conceptId: "si-units-dimensional-analysis",
    syllabi: TAG_31,
    difficulty: "standard",
    questionStyle: "definition",
    scenarioSpec: { kind, mode: "dimensional", entryKey: "ohm" },
    targetQuantityKey: "baseUnitWords",
    hiddenQuantities: ["baseUnitString", "baseUnitWords", "expA"],
    stem: "Electrical resistance is defined by $R = V/I$, where potential difference $V = W/Q$. Which expression states the ohm solely in SI base units?",
    correctPrefix: "In coherent SI base units the ohm equals",
    distractors: [
      {
        text: "In coherent SI base units the ohm equals kilogram metre squared per second cubed per ampere",
        rationale: "Stops at the SI base unit of the volt and forgets to divide a second time by current in amperes.",
      },
      {
        text: "In coherent SI base units the ohm equals joule per coulomb per ampere",
        rationale: "Both joule and coulomb are derived units rather than SI base units.",
      },
      {
        text: "In coherent SI base units the ohm equals kilogram metre squared per second squared per ampere squared",
        rationale: "Drops one factor of time when converting coulomb to ampere second.",
      },
    ],
    workedNote:
      "$V = W/Q$ gives $\\mathrm{kg\\,m^2\\,s^{-3}\\,A^{-1}}$, and dividing by $I$ in $\\mathrm{A}$ gives $\\mathrm{kg\\,m^2\\,s^{-3}\\,A^{-2}}$.",
  });

  addQualMcq(ctx, {
    slug: "si-planck-base",
    domain: "pure-calculation",
    kind,
    conceptId: "si-units-dimensional-analysis",
    syllabi: TAG_31,
    difficulty: "standard",
    questionStyle: "qualitative",
    scenarioSpec: { kind, mode: "dimensional", entryKey: "planck" },
    targetQuantityKey: "baseUnitWords",
    hiddenQuantities: ["baseUnitString", "baseUnitWords", "expS"],
    stem: "Photon energy is linked to frequency by $E = hf$. Which combination of coherent SI base units is equivalent to the unit of the Planck constant $h$?",
    correctPrefix: "The Planck constant has SI base units of",
    distractors: [
      {
        text: "The Planck constant has SI base units of kilogram metre squared per second cubed",
        rationale: "Multiplies energy by frequency instead of dividing energy by frequency, giving power (watts).",
      },
      {
        text: "The Planck constant has SI base units of kilogram metre per second",
        rationale: "Gives the unit of linear momentum rather than angular momentum / action.",
      },
      {
        text: "The Planck constant has SI base units of kilogram metre squared per second squared",
        rationale: "Leaves the unit of energy (joule) without multiplying by seconds.",
      },
    ],
    workedNote:
      "Since $h = E/f = E T$, multiplying $\\mathrm{kg\\,m^2\\,s^{-2}}$ by $\\mathrm{s}$ yields $\\mathrm{kg\\,m^2\\,s^{-1}}$.",
  });

  addQualMcq(ctx, {
    slug: "si-precision-systematic",
    domain: "pure-calculation",
    kind,
    conceptId: "si-units-dimensional-analysis",
    syllabi: TAG_31,
    difficulty: "foundation",
    questionStyle: "qualitative",
    scenarioSpec: { kind, mode: "precision-accuracy", entryKey: "high-prec-low-acc" },
    targetQuantityKey: "errorClassification",
    hiddenQuantities: ["errorClassification", "remedyRule", "definitionRule"],
    stem: "The target diagram shows six repeated readings of a resistor value made with a digital ohmmeter that had a non-zero lead resistance. Which description best classifies this dataset?",
    correctPrefix: "The readings show",
    distractors: [
      {
        text: "The readings show low precision with random error and an accurate mean",
        rationale: "The points are tightly clustered together (high precision) yet consistently displaced from the true value.",
      },
      {
        text: "The readings show high precision and high accuracy with negligible bias",
        rationale: "Tight clustering establishes precision only, not closeness to the true centre value.",
      },
      {
        text: "The readings show low precision caused by random human error",
        rationale: "Tightly grouped readings indicate small random scatter, and 'human error' is rejected by AQA mark schemes.",
      },
    ],
    workedNote:
      "Tightly grouped dots indicate high precision (small spread about the mean), while the constant offset from the true centre reveals a systematic zero error and low accuracy.",
  });

  addQualMcq(ctx, {
    slug: "si-random-remedy",
    domain: "pure-calculation",
    kind,
    conceptId: "si-units-dimensional-analysis",
    syllabi: TAG_31,
    difficulty: "standard",
    questionStyle: "qualitative",
    scenarioSpec: { kind, mode: "precision-accuracy", entryKey: "low-prec-high-acc" },
    targetQuantityKey: "remedyRule",
    hiddenQuantities: ["errorClassification", "remedyRule", "definitionRule"],
    stem: "Repeated stopwatch measurements of a pendulum period are scattered evenly above and below the true value as shown on the target plot. Which experimental action specifically reduces the effect of this type of error?",
    correctPrefix: "The experimenter should",
    distractors: [
      {
        text: "The experimenter should subtract a single constant zero offset from every reading",
        rationale: "Zero-offset subtraction corrects a systematic shift, not unpredictable random spread.",
      },
      {
        text: "The experimenter should simply repeat the experiment once with a different apparatus",
        rationale: "AQA rejects vague 'repeat experiment'; one must take multiple repeat measurements and calculate the mean.",
      },
      {
        text: "The experimenter should switch from a stopwatch to Vernier callipers to remove scatter",
        rationale: "Vernier callipers measure length, not time intervals.",
      },
    ],
    workedNote:
      "Unpredictable scatter about the true value is random error, which is reduced by taking repeat measurements, discarding anomalies, and calculating the mean.",
  });

  // 3 Quantitative MCQs (Fermi order of magnitude)
  addNumMcq(ctx, {
    slug: "si-fermi-sprinter",
    domain: "pure-calculation",
    kind,
    conceptId: "si-units-dimensional-analysis",
    syllabi: TAG_31,
    difficulty: "foundation",
    scenarioSpec: { kind, mode: "fermi", entryKey: "sprinter-ke" },
    targetQuantityKey: "orderPowerValue",
    unit: "J",
    hiddenQuantities: ["orderOfMagnitude", "orderPowerValue", "estimateValue", "orderLabel"],
    requiredGivens: [],
    stem: "Estimate the order of magnitude of the kinetic energy of an adult sprinter running at top speed during a school track race.",
    distractors: [
      { value: 10, rationale: "Severely underestimates mass or speed, corresponding to a crawling object." },
      { value: 1e6, rationale: "Corresponds to a moving car rather than a single human athlete." },
      { value: 1e-1, rationale: "Matches a thrown pebble rather than a sprinting person." },
    ],
    workedSolution:
      "Taking typical adult mass $m \\approx 75\\text{ kg}$ and sprint speed $v \\approx 9\\text{ m s}^{-1}$ gives $E_{\\text{k}} = \\frac{1}{2}mv^2 \\approx 0.5 \\times 75 \\times 81 \\approx 3.0 \\times 10^3\\text{ J}$, which is of order $1.00 \\times 10^3\\text{ J}$.",
    markCriterion: "Order of magnitude estimate matches $10^3\\text{ J}$",
  });

  addNumMcq(ctx, {
    slug: "si-fermi-raindrop",
    domain: "pure-calculation",
    kind,
    conceptId: "si-units-dimensional-analysis",
    syllabi: TAG_31,
    difficulty: "standard",
    scenarioSpec: { kind, mode: "fermi", entryKey: "raindrop-mass" },
    targetQuantityKey: "orderPowerValue",
    unit: "kg",
    hiddenQuantities: ["orderOfMagnitude", "orderPowerValue", "estimateValue", "orderLabel"],
    requiredGivens: [],
    stem: "Using typical everyday physical dimensions and water density $\\rho \\approx 1000\\text{ kg m}^{-3}$, estimate the order of magnitude of the mass of a single spherical raindrop.",
    distractors: [
      { value: 1e-2, rationale: "Treats the raindrop radius as ~1 cm (a marble of water) instead of ~1–2 mm." },
      { value: 1e-8, rationale: "Mistakes millimetres for tens of micrometres (cloud droplet scale)." },
      { value: 1, rationale: "Corresponds to a full litre of water rather than one droplet." },
    ],
    workedSolution:
      "A typical raindrop has radius $r \\approx 1.5\\text{ mm} = 1.5 \\times 10^{-3}\\text{ m}$, giving volume $V = \\frac{4}{3}\\pi r^3 \\approx 1.4 \\times 10^{-8}\\text{ m}^3$ and mass $m = \\rho V \\approx 1.4 \\times 10^{-5}\\text{ kg}$, of order $1.00 \\times 10^{-5}\\text{ kg}$.",
    markCriterion: "Order of magnitude estimate matches $10^{-5}\\text{ kg}$",
  });

  addNumMcq(ctx, {
    slug: "si-fermi-car-momentum",
    domain: "pure-calculation",
    kind,
    conceptId: "si-units-dimensional-analysis",
    syllabi: TAG_31,
    difficulty: "standard",
    scenarioSpec: { kind, mode: "fermi", entryKey: "car-momentum" },
    targetQuantityKey: "orderPowerValue",
    unit: "kg m s⁻¹",
    hiddenQuantities: ["orderOfMagnitude", "orderPowerValue", "estimateValue", "orderLabel"],
    requiredGivens: [],
    stem: "Estimate the order of magnitude of the linear momentum of a family saloon car travelling at motorway cruising speed.",
    distractors: [
      { value: 1e2, rationale: "Uses the mass of a bicycle instead of a family car." },
      { value: 1e7, rationale: "Matches a loaded freight train rather than a single passenger car." },
      { value: 1e1, rationale: "Forgets to convert tonnes to kilograms or omits cruising speed." },
    ],
    workedSolution:
      "Taking car mass $m \\approx 1200\\text{ kg}$ and motorway speed $v \\approx 30\\text{ m s}^{-1}$ yields $p = mv \\approx 3.6 \\times 10^4\\text{ kg m s}^{-1}$, giving order of magnitude $1.00 \\times 10^4\\text{ kg m s}^{-1}$.",
    markCriterion: "Order of magnitude estimate matches $10^4\\text{ kg m s}^{-1}$",
  });

  // 3 Structured Questions (Section 3.1)
  addStructured(ctx, {
    slug: "si-volt-base-struct",
    domain: "pure-calculation",
    kind,
    conceptId: "si-units-dimensional-analysis",
    syllabi: TAG_31,
    difficulty: "standard",
    questionStyle: "derivation",
    targetMode: "qualitative",
    scenarioSpec: { kind, mode: "dimensional", entryKey: "volt" },
    hiddenQuantities: ["baseUnitString", "baseUnitWords", "expKg", "expM", "expS", "expA"],
    requiredGivens: [],
    stem: "An engineering specification quotes electrical potential difference in volts ($\\mathrm{V}$) and asks technicians to verify dimensional homogeneity using SI base units only.",
    parts: [
      {
        partId: "a",
        prompt: "Using the defining equations $V = W/Q$, $W = Fs$, and $Q = It$, derive the coherent SI base units of the volt.",
        marks: 3,
        targetMode: "qualitative",
        targetQuantityKey: "baseUnitWords",
        expectedAnswer:
          "Starting from $V = W/Q$, substitute work in joules ($\\mathrm{kg\\,m^2\\,s^{-2}}$) and charge in ampere seconds ($\\mathrm{A\\,s}$) to obtain kilogram metre squared per second cubed per ampere ($\\mathrm{kg\\,m^2\\,s^{-3}\\,A^{-1}}$).",
        workingSteps: [
          "Write $V = W / Q$ and replace force $F = ma$ so $W = Fs$ has base units $\\mathrm{kg\\,m^2\\,s^{-2}}$.",
          "Replace charge $Q = It$ with base units $\\mathrm{A\\,s}$.",
          "Divide to obtain $\\mathrm{kg\\,m^2\\,s^{-3}\\,A^{-1}}$.",
        ],
      },
      {
        partId: "b",
        prompt: "State why a thin copper wire's diameter in a resistivity experiment should be measured with a micrometer screw gauge rather than Vernier callipers, and explain how to reduce random uncertainty in the diameter.",
        marks: 2,
        targetMode: "qualitative",
        expectedAnswer:
          "A micrometer screw gauge has finer resolution ($0.01\\text{ mm}$ vs $0.1\\text{ mm}$) giving smaller percentage uncertainty on a thin wire; repeat diameter measurements at several positions and perpendicular orientations along the wire and calculate the mean.",
        workingSteps: [
          "Compare micrometer resolution with Vernier callipers for a sub-millimetre wire.",
          "Specify repeat measurements along length and perpendicular orientations plus calculating the mean.",
        ],
      },
    ],
    workedSolution:
      "(a) $V = W/Q = (Fs)/(It)$, giving $\\mathrm{kg\\,m^2\\,s^{-2}} / (\\mathrm{A\\,s}) = \\mathrm{kg\\,m^2\\,s^{-3}\\,A^{-1}}$ (kilogram metre squared per second cubed per ampere). (b) A micrometer gives finer resolution ($0.01\\text{ mm}$) and smaller percentage uncertainty; take repeated measurements at different positions and perpendicular angles and calculate the mean (do not accept vague 'repeat experiment').",
    markScheme: [
      { code: "M1", criterion: "Recall $W = Fs$ yields $\\mathrm{kg\\,m^2\\,s^{-2}}$ for the joule.", marks: 1, partId: "a" },
      { code: "M1", criterion: "Recall $Q = It$ yields $\\mathrm{A\\,s}$ for the coulomb.", marks: 1, partId: "a" },
      { code: "A1", criterion: "Correctly simplify to $\\mathrm{kg\\,m^2\\,s^{-3}\\,A^{-1}}$ (kilogram metre squared per second cubed per ampere).", marks: 1, partId: "a" },
      { code: "B1", criterion: "Micrometer has higher resolution giving lower percentage uncertainty on a thin wire (reject Vernier callipers).", marks: 1, partId: "b" },
      { code: "B1", criterion: "Repeat diameter measurements at several points/perpendicular orientations and calculate the mean (reject bare 'repeat experiment').", marks: 1, partId: "b" },
    ],
    subpartStrategy: [
      "Derive SI base units of the volt from energy and charge definitions.",
      "Select appropriate measuring instrument resolution and random-error reduction method.",
    ],
  });

  addStructured(ctx, {
    slug: "si-precision-accuracy-struct",
    domain: "pure-calculation",
    kind,
    conceptId: "si-units-dimensional-analysis",
    syllabi: TAG_31,
    difficulty: "foundation",
    questionStyle: "qualitative",
    targetMode: "qualitative",
    scenarioSpec: { kind, mode: "precision-accuracy", entryKey: "high-prec-low-acc" },
    hiddenQuantities: ["errorClassification", "remedyRule", "definitionRule"],
    requiredGivens: [],
    stem: "Two students calibrate a digital balance using a certified reference mass. Student A obtains readings shown in the target diagram, tightly clustered but all shifted above the true value.",
    parts: [
      {
        partId: "a",
        prompt: "Distinguish between precision and accuracy, and classify Student A's measurements.",
        marks: 3,
        targetMode: "qualitative",
        targetQuantityKey: "errorClassification",
        expectedAnswer:
          "Precision is closeness of repeated readings to each other / their mean; accuracy is closeness of a measured value to the true value. Student A's readings exhibit high precision with systematic error and low accuracy.",
        workingSteps: [
          "Define precision in terms of spread of repeated readings.",
          "Define accuracy in terms of closeness to the true value.",
          "Classify the plotted cluster as high precision with systematic error and low accuracy.",
        ],
      },
      {
        partId: "b",
        prompt: "Explain why repeating the measurements and averaging will not improve Student A's accuracy, and state how the error should be corrected.",
        marks: 2,
        targetMode: "qualitative",
        targetQuantityKey: "remedyRule",
        expectedAnswer:
          "A systematic error shifts every reading by the same fixed offset so averaging preserves that offset; Student A must identify and subtract zero error or recalibrate the instrument.",
        workingSteps: [
          "State that systematic error biases every reading in the same direction.",
          "Specify zeroing/taring or subtracting the zero error to restore accuracy.",
        ],
      },
    ],
    workedSolution:
      "(a) Precision describes small spread between repeated measurements; accuracy describes closeness to the true value; the dataset shows high precision with systematic error and low accuracy. (b) Repeating and averaging only reduces random scatter; to fix systematic offset, identify and subtract zero error or recalibrate the instrument.",
    markScheme: [
      { code: "B1", criterion: "Precision: closeness of repeated readings to each other / mean (small random spread).", marks: 1, partId: "a" },
      { code: "B1", criterion: "Accuracy: closeness of measurement to the true value.", marks: 1, partId: "a" },
      { code: "B1", criterion: "Identify high precision with systematic error and low accuracy.", marks: 1, partId: "a" },
      { code: "B1", criterion: "Explain that systematic error shifts every reading identically so repeats/mean do not remove it.", marks: 1, partId: "b" },
      { code: "B1", criterion: "State remedy: tare/zero, identify and subtract zero error or recalibrate the instrument.", marks: 1, partId: "b" },
    ],
    subpartStrategy: [
      "Define precision and accuracy and classify target distribution.",
      "Explain why repeats fail on systematic bias and state instrument recalibration.",
    ],
  });

  addStructured(ctx, {
    slug: "si-fermi-jump-struct",
    domain: "pure-calculation",
    kind,
    conceptId: "si-units-dimensional-analysis",
    syllabi: TAG_31,
    difficulty: "standard",
    questionStyle: "mixed-exam",
    targetMode: "quantitative",
    scenarioSpec: { kind, mode: "fermi", entryKey: "vertical-jump-speed" },
    hiddenQuantities: ["estimateValue", "orderOfMagnitude", "orderPowerValue", "orderLabel"],
    requiredGivens: [{ name: "g", value: AQA_G_MS2, unit: "m s⁻²", source: "stem" }],
    stem: "A physics student estimates the vertical take-off speed of an adult performing a standing vertical jump using $g = 9.81\\text{ m s}^{-2}$ and an estimated centre-of-mass rise of $h = 0.50\\text{ m}$.",
    parts: [
      {
        partId: "a",
        prompt: "Calculate the estimated take-off speed $v$ using conservation of mechanical energy.",
        marks: 2,
        targetMode: "quantitative",
        targetQuantityKey: "estimateValue",
        expectedAnswer: `3.13 m s⁻¹`,
        workingSteps: [
          "Equate kinetic energy at take-off to gain in gravitational potential energy: $\\frac{1}{2}mv^2 = mgh$.",
          "Evaluate $v = \\sqrt{2gh} = \\sqrt{2 \\times 9.81 \\times 0.50} = 3.13\\text{ m s}^{-1}$.",
        ],
      },
      {
        partId: "b",
        prompt: "State the nearest order of magnitude (as a power of ten in $\\text{m s}^{-1}$) of this speed.",
        marks: 1,
        targetMode: "quantitative",
        targetQuantityKey: "orderPowerValue",
        expectedAnswer: "1 m s⁻¹ (order 10⁰ m s⁻¹)",
        workingSteps: [
          "Since $\\log_{10}(3.13) = 0.496 < 0.5$, the nearest order of magnitude is $10^0 = 1\\text{ m s}^{-1}$.",
        ],
      },
    ],
    workedSolution:
      "(a) $v = \\sqrt{2gh} = \\sqrt{2 \\times 9.81 \\times 0.50} = 3.13\\text{ m s}^{-1}$. (b) Since $3.13 < \\sqrt{10} \\approx 3.16$, the nearest order of magnitude is $10^0 = 1\\text{ m s}^{-1}$.",
    markScheme: [
      { code: "M1", criterion: "Apply $v = \\sqrt{2gh}$ with $g = 9.81\\text{ m s}^{-2}$ and $h = 0.50\\text{ m}$.", marks: 1, partId: "a" },
      { code: "A1", criterion: "Obtain $v = 3.13\\text{ m s}^{-1}$.", marks: 1, partId: "a" },
      { code: "B1", criterion: "Correct order of magnitude $10^0\\text{ m s}^{-1}$ ($1\\text{ m s}^{-1}$).", marks: 1, partId: "b" },
    ],
    subpartStrategy: [
      "Compute vertical take-off speed from centre-of-mass rise and gravitational field strength.",
      "Round the result to the nearest power of ten.",
    ],
  });
}

/* -------------------------------------------------------------------------- */
/*  FAMILY 2: al-as-specific-charge-nuclide (11 items: 3Q + 4C + 4 Struct)    */
/* -------------------------------------------------------------------------- */

function buildFamily2SpecificCharge(ctx: BuilderContext): void {
  const kind = "al-as-specific-charge-nuclide" as const;

  // 3 Pure Qualitative MCQs
  addQualMcq(ctx, {
    slug: "sc-beta-minus-trend",
    domain: "quantum-nuclear",
    kind,
    conceptId: "fundamental-particles-quarks-leptons",
    syllabi: TAG_321,
    difficulty: "standard",
    scenarioSpec: {
      kind,
      speciesMode: "nucleus",
      symbolLabel: "C",
      protonNumber: 6,
      nucleonNumber: 14,
      massModel: "nucleon-exact",
      decayMode: "beta-minus",
    },
    targetQuantityKey: "decaySpecificChargeTrend",
    hiddenQuantities: ["decaySpecificChargeTrend", "daughterSpecificChargeCKg"],
    stem: "An unstable carbon nucleus undergoes $\\beta^-$ decay to form a nitrogen nucleus. How does the specific charge of the nucleus change during this decay?",
    correctPrefix: "Its nuclear",
    correctSuffix: "because proton number rises while nucleon number stays constant",
    distractors: [
      {
        text: "Its nuclear specific charge decreases because mass increases when an electron is emitted",
        rationale: "A neutron converts into a proton, so charge increases while nucleon number A stays unchanged.",
      },
      {
        text: "Its nuclear specific charge remains unchanged because total nucleon number is conserved",
        rationale: "Conserving A keeps mass nearly constant, but nuclear charge Z rises by +e.",
      },
      {
        text: "Its nuclear specific charge drops to zero because the emitted electron cancels nuclear charge",
        rationale: "The beta-minus particle leaves the nucleus; nuclear charge becomes (Z + 1)e.",
      },
    ],
    workedNote:
      "In $\\beta^-$ decay, $Z \\to Z + 1$ while $A$ is unchanged, so $Q/m$ rises: specific charge increases.",
  });

  addQualMcq(ctx, {
    slug: "sc-beta-plus-trend",
    domain: "quantum-nuclear",
    kind,
    conceptId: "fundamental-particles-quarks-leptons",
    syllabi: TAG_321,
    difficulty: "standard",
    scenarioSpec: {
      kind,
      speciesMode: "nucleus",
      symbolLabel: "Na",
      protonNumber: 11,
      nucleonNumber: 22,
      massModel: "nucleon-exact",
      decayMode: "beta-plus",
    },
    targetQuantityKey: "decaySpecificChargeTrend",
    hiddenQuantities: ["decaySpecificChargeTrend", "daughterSpecificChargeCKg"],
    stem: "A proton-rich sodium nucleus emits a positron ($\\beta^+$ decay) to form a neon nucleus. How does the specific charge of the daughter nucleus compare with the parent nucleus?",
    correctPrefix: "The daughter nucleus",
    correctSuffix: "because nuclear charge falls while nucleon number is unchanged",
    distractors: [
      {
        text: "The daughter nucleus specific charge increases because a proton turns into a slightly heavier neutron",
        rationale: "Both lower charge (Z - 1) and slightly larger neutron mass reduce Q/m.",
      },
      {
        text: "The daughter nucleus specific charge remains unchanged because charge is conserved globally",
        rationale: "The emitted positron carries away +e, so the nucleus itself loses charge.",
      },
      {
        text: "The daughter nucleus specific charge increases because four nucleons are lost from the nucleus",
        rationale: "Confuses beta-plus decay with alpha decay.",
      },
    ],
    workedNote:
      "Positron emission lowers nuclear charge from $Z e$ to $(Z-1)e$ with constant $A$, so specific charge decreases.",
  });

  addQualMcq(ctx, {
    slug: "sc-ion-trap-qual",
    domain: "quantum-nuclear",
    kind,
    conceptId: "fundamental-particles-quarks-leptons",
    syllabi: TAG_321,
    difficulty: "standard",
    scenarioSpec: {
      kind,
      speciesMode: "cation",
      symbolLabel: "Mg",
      protonNumber: 12,
      nucleonNumber: 24,
      ionChargeMagnitude: 2,
      massModel: "nucleon-exact",
    },
    targetQuantityKey: "ionTrapRule",
    hiddenQuantities: ["ionTrapRule", "specificChargeCKg"],
    stem: "A magnesium ion has two fewer orbital electrons than protons in its nucleus. Which statement correctly explains how to determine the specific charge of this ion rather than its bare nucleus?",
    correctPrefix: "For the ion,",
    distractors: [
      {
        text: "For the ion, charge equals the full proton number while mass includes only the protons",
        rationale: "Commits both classic AQA traps: using nuclear charge Z for a partially ionised atom and ignoring neutron mass.",
      },
      {
        text: "For the ion, charge equals the full proton number because neutral neutrons cancel orbital electrons",
        rationale: "Neutrons carry zero charge and cannot cancel electron charges; orbital electrons partially cancel protons.",
      },
      {
        text: "For the ion, charge is zero because the remaining orbital electrons shield the nucleus completely",
        rationale: "Removing two electrons leaves a net positive charge of +2e.",
      },
    ],
    workedNote:
      "Only the net uncompensated charge (+2e) determines $Q$, while all protons, neutrons (and remaining electrons) contribute to mass $m$.",
  });

  // 4 Quantitative MCQs
  const scCases = [
    {
      slug: "sc-calc-mg-nuc",
      speciesMode: "nucleus" as const,
      symbolLabel: "Mg",
      Z: 12,
      A: 24,
      ionMag: undefined,
      desc: "bare $^{24}_{12}\\mathrm{Mg}$ nucleus",
      diff: "foundation" as const,
    },
    {
      slug: "sc-calc-fe-nuc",
      speciesMode: "nucleus" as const,
      symbolLabel: "Fe",
      Z: 26,
      A: 56,
      ionMag: undefined,
      desc: "bare $^{56}_{26}\\mathrm{Fe}$ nucleus",
      diff: "standard" as const,
    },
    {
      slug: "sc-calc-al-cation",
      speciesMode: "cation" as const,
      symbolLabel: "Al",
      Z: 13,
      A: 27,
      ionMag: 3,
      desc: "$^{27}_{13}\\mathrm{Al}^{3+}$ ion formed by removing 3 electrons",
      diff: "standard" as const,
    },
    {
      slug: "sc-calc-o-anion",
      speciesMode: "anion" as const,
      symbolLabel: "O",
      Z: 8,
      A: 16,
      ionMag: 2,
      desc: "$^{16}_{8}\\mathrm{O}^{2-}$ ion formed by adding 2 electrons",
      diff: "higher" as const,
    },
  ];

  for (const c of scCases) {
    const spec: Record<string, unknown> = {
      kind,
      speciesMode: c.speciesMode,
      symbolLabel: c.symbolLabel,
      protonNumber: c.Z,
      nucleonNumber: c.A,
      ...(c.ionMag !== undefined ? { ionChargeMagnitude: c.ionMag } : {}),
      massModel: "nucleon-exact",
    };
    const q = solveKind(kind, spec);
    const sc = numVal(q, "specificChargeCKg");
    const trapForgetNeutrons =
      ((c.ionMag ?? c.Z) * AQA_E_C) / (c.Z * AQA_MP_KG);
    const trapNuclearZForIon =
      c.ionMag !== undefined
        ? (c.Z * AQA_E_C) / numVal(q, "massKg")
        : sc * (c.A / c.Z);
    const trapUseN = (((c.A - c.Z) * AQA_E_C) / numVal(q, "massKg")) * 1.15;

    addNumMcq(ctx, {
      slug: c.slug,
      domain: "quantum-nuclear",
      kind,
      conceptId: "fundamental-particles-quarks-leptons",
      syllabi: TAG_321,
      difficulty: c.diff,
      scenarioSpec: spec,
      targetQuantityKey: "specificChargeCKg",
      unit: "C kg⁻¹",
      hiddenQuantities: ["specificChargeCKg", "signedSpecificChargeCKg"],
      requiredGivens: [
        { name: "Z", value: c.Z, source: "either" },
        { name: "A", value: c.A, source: "either" },
      ],
      stem: `Using AQA nucleon masses ($m_{\\text{p}} = 1.673 \\times 10^{-27}\\text{ kg}$, $m_{\\text{n}} = 1.675 \\times 10^{-27}\\text{ kg}$, $e = 1.60 \\times 10^{-19}\\text{ C}$), calculate the magnitude of the specific charge of a ${c.desc}.`,
      distractors: [
        {
          value: trapForgetNeutrons,
          rationale: "Classic AQA trap: omits neutral neutrons from the total nuclear mass in the denominator.",
        },
        {
          value: trapNuclearZForIon,
          rationale:
            c.ionMag !== undefined
              ? "Classic ion trap: substitutes full nuclear charge Ze instead of net ion charge."
              : "Multiplies by A/Z instead of Z/A.",
        },
        {
          value: trapUseN,
          rationale: "Uses the neutron number rather than the net electric charge in the numerator.",
        },
      ],
      workedSolution: `Net charge magnitude $Q = ${c.ionMag ?? c.Z} \\times 1.60 \\times 10^{-19} = ${fmtSig(numVal(q, "chargeC"), 3, "C")}$ and mass $m = ${fmtSig(numVal(q, "massKg"), 3, "kg")}$, giving $Q/m = ${fmtSig(sc, 3, "C kg⁻¹")}$.`,
      markCriterion: `Correct specific charge $Q/m = ${fmtSig(sc, 3, "C kg⁻¹")}$`,
    });
  }

  // 4 Structured Questions
  const scStructCases = [
    {
      slug: "sc-struct-ca-ion",
      speciesMode: "cation" as const,
      symbolLabel: "Ca",
      Z: 20,
      A: 40,
      ionMag: 2,
      stem: "A calcium ion $^{40}_{20}\\mathrm{Ca}^{2+}$ enters a mass spectrometer. Take $e = 1.60 \\times 10^{-19}\\text{ C}$, $m_{\\text{p}} = 1.673 \\times 10^{-27}\\text{ kg}$, $m_{\\text{n}} = 1.675 \\times 10^{-27}\\text{ kg}$, and $m_{\\text{e}} = 9.11 \\times 10^{-31}\\text{ kg}$.",
    },
    {
      slug: "sc-struct-cl-anion",
      speciesMode: "anion" as const,
      symbolLabel: "Cl",
      Z: 17,
      A: 35,
      ionMag: 1,
      stem: "A singly charged negative chlorine ion $^{35}_{17}\\mathrm{Cl}^{-}$ is accelerated in an ion source. Take $e = 1.60 \\times 10^{-19}\\text{ C}$, $m_{\\text{p}} = 1.673 \\times 10^{-27}\\text{ kg}$, $m_{\\text{n}} = 1.675 \\times 10^{-27}\\text{ kg}$, and $m_{\\text{e}} = 9.11 \\times 10^{-31}\\text{ kg}$.",
    },
    {
      slug: "sc-struct-u-alpha",
      speciesMode: "nucleus" as const,
      symbolLabel: "U",
      Z: 92,
      A: 238,
      ionMag: undefined,
      decayMode: "alpha" as const,
      stem: "A uranium-238 nucleus ($^{238}_{92}\\mathrm{U}$) decays by emitting an alpha particle to form thorium. Take $e = 1.60 \\times 10^{-19}\\text{ C}$, $m_{\\text{p}} = 1.673 \\times 10^{-27}\\text{ kg}$, and $m_{\\text{n}} = 1.675 \\times 10^{-27}\\text{ kg}$.",
    },
    {
      slug: "sc-struct-li-nuc",
      speciesMode: "nucleus" as const,
      symbolLabel: "Li",
      Z: 3,
      A: 7,
      ionMag: undefined,
      decayMode: "none" as const,
      stem: "A bare lithium-7 nucleus ($^{7}_{3}\\mathrm{Li}$) is studied in a particle accelerator. Take $e = 1.60 \\times 10^{-19}\\text{ C}$, $m_{\\text{p}} = 1.673 \\times 10^{-27}\\text{ kg}$, and $m_{\\text{n}} = 1.675 \\times 10^{-27}\\text{ kg}$.",
    },
  ];

  for (const s of scStructCases) {
    const spec: Record<string, unknown> = {
      kind,
      speciesMode: s.speciesMode,
      symbolLabel: s.symbolLabel,
      protonNumber: s.Z,
      nucleonNumber: s.A,
      ...(s.ionMag !== undefined ? { ionChargeMagnitude: s.ionMag } : {}),
      massModel: "nucleon-exact",
      decayMode: s.decayMode ?? "none",
    };
    const q = solveKind(kind, spec);
    const N = numVal(q, "neutronNumber");
    const sc = numVal(q, "specificChargeCKg");
    const massKg = numVal(q, "massKg");
    const isIon = s.ionMag !== undefined;

    addStructured(ctx, {
      slug: s.slug,
      domain: "quantum-nuclear",
      kind,
      conceptId: "fundamental-particles-quarks-leptons",
      syllabi: TAG_321,
      difficulty: isIon ? "standard" : "foundation",
      questionStyle: "mixed-exam",
      targetMode: "quantitative",
      scenarioSpec: spec,
      hiddenQuantities: isIon
        ? [
            "specificChargeCKg",
            "massKg",
            "neutronNumber",
            "electronCount",
            "ionTrapRule",
          ]
        : ["specificChargeCKg", "massKg", "neutronNumber", "ionTrapRule"],
      requiredGivens: [
        { name: "Z", value: s.Z, source: "either" },
        { name: "A", value: s.A, source: "either" },
      ],
      stem: s.stem,
      parts: [
        {
          partId: "a",
          prompt: `State the number of neutrons in the ${s.symbolLabel} nucleus${isIon ? " and the number of orbital electrons in this ion" : ""}.`,
          marks: isIon ? 2 : 1,
          targetMode: "quantitative",
          targetQuantityKey: "neutronNumber",
          expectedAnswer: isIon
            ? `${N} neutrons and ${numVal(q, "electronCount")} orbital electrons`
            : `${N} neutrons`,
          workingSteps: [
            `Neutron number $N = A - Z = ${s.A} - ${s.Z} = ${N}$.`,
            ...(isIon
              ? [`Orbital electron count $= ${numVal(q, "electronCount")}$.`]
              : []),
          ],
        },
        {
          partId: "b",
          prompt: "Calculate the total mass of the species in kilograms and hence determine the magnitude of its specific charge.",
          marks: 3,
          dependsOnPartIds: ["a"],
          targetMode: "quantitative",
          targetQuantityKey: "specificChargeCKg",
          expectedAnswer: `${fmtSig(sc, 3, "C kg⁻¹")}`,
          workingSteps: [
            `Total mass $m = ${s.Z}m_{\\text{p}} + ${N}m_{\\text{n}}${isIon ? ` + ${numVal(q, "electronCount")}m_{\\text{e}}` : ""} = ${fmtSig(massKg, 4, "kg")}$.`,
            `Charge magnitude $Q = ${s.ionMag ?? s.Z}e = ${fmtSig(numVal(q, "chargeC"), 3, "C")}$.`,
            `Specific charge $Q/m = ${fmtSig(sc, 3, "C kg⁻¹")}$.`,
          ],
        },
        {
          partId: "c",
          prompt: "Explain why neutral neutrons affect the specific charge of a nucleus or ion.",
          marks: 1,
          targetMode: "qualitative",
          targetQuantityKey: "ionTrapRule",
          expectedAnswer: `Although neutrons carry zero charge, ${strVal(q, "ionTrapRule")}, increasing the mass denominator and lowering $Q/m$.`,
          workingSteps: [
            "Link unchanged charge and larger denominator mass to smaller specific charge.",
          ],
        },
      ],
      workedSolution: `(a) $N = ${s.A} - ${s.Z} = ${N}$${isIon ? `; electrons $= ${numVal(q, "electronCount")}$` : ""}. (b) $m = ${fmtSig(massKg, 4, "kg")}$, $Q = ${fmtSig(numVal(q, "chargeC"), 3, "C")}$, so $Q/m = ${fmtSig(sc, 3, "C kg⁻¹")}$. (c) ${strVal(q, "ionTrapRule")}.`,
      markScheme: [
        { code: "B1", criterion: `Correct neutron number $N = ${N}$.`, marks: 1, partId: "a" },
        ...(isIon
          ? [{ code: "B1", criterion: `Correct orbital electron count $= ${numVal(q, "electronCount")}$.`, marks: 1, partId: "a" }]
          : []),
        { code: "M1", criterion: `Calculate total mass $m = ${fmtSig(massKg, 3, "kg")}$ including both protons and neutrons.`, marks: 1, partId: "b" },
        { code: "M1", criterion: `Substitute net charge $Q = ${fmtSig(numVal(q, "chargeC"), 3, "C")}$ into $Q/m$.`, marks: 1, partId: "b" },
        { code: "A1", criterion: `Obtain specific charge $= ${fmtSig(sc, 3, "C kg⁻¹")}$.`, marks: 1, partId: "b" },
        { code: "B1", criterion: `State that ${strVal(q, "ionTrapRule")}.`, marks: 1, partId: "c" },
      ],
      subpartStrategy: [
        "Determine nuclear particle composition from Z and A.",
        "Calculate total mass and specific charge Q/m.",
        "Explain role of neutron mass in specific charge.",
      ],
    });
  }
}

/* -------------------------------------------------------------------------- */
/*  FAMILY 3: al-as-strong-nuclear-force (11 items: 6Q + 1C + 4 Struct [2 LoR])*/
/* -------------------------------------------------------------------------- */

function buildFamily3StrongNuclearForce(ctx: BuilderContext): void {
  const kind = "al-as-strong-nuclear-force" as const;

  // 6 Pure Qualitative MCQs
  addQualMcq(ctx, {
    slug: "snf-repulsive-zone",
    domain: "graphs",
    kind,
    conceptId: "fundamental-particles-quarks-leptons",
    syllabi: TAG_321,
    difficulty: "foundation",
    scenarioSpec: { kind, probeSeparationFm: 0.32, showElectrostatic: false, visualMode: "force-curve" },
    targetQuantityKey: "forceRegimeAtR",
    hiddenQuantities: ["forceRegimeAtR", "equilibriumSepFm", "maxRangeFm"],
    stem: "The graph plots the strong nuclear force between two nucleons against their separation. What is the nature and physical role of the strong nuclear force in the shaded region closest to the vertical axis?",
    correctPrefix: "At very small separations the force is",
    distractors: [
      {
        text: "At very small separations the force is strongly attractive causing nucleons to fuse together",
        rationale: "Inverts the sign below 0.5 fm; attraction at zero separation would collapse the nucleus.",
      },
      {
        text: "At very small separations the force is zero so only electrostatic repulsion acts",
        rationale: "The strong nuclear force crosses zero at ~0.5 fm and becomes intensely repulsive below 0.5 fm.",
      },
      {
        text: "At very small separations the force is weak nuclear attraction balancing gravity",
        rationale: "Gravity is negligible on nuclear scales and the weak force does not bind nucleons.",
      },
    ],
    workedNote:
      "Below $0.5\\text{ fm}$ the strong nuclear force turns positive (repulsive), preventing nucleons from collapsing onto one another.",
  });

  addQualMcq(ctx, {
    slug: "snf-attractive-zone",
    domain: "graphs",
    kind,
    conceptId: "fundamental-particles-quarks-leptons",
    syllabi: TAG_321,
    difficulty: "foundation",
    scenarioSpec: { kind, probeSeparationFm: 1.2, showElectrostatic: true, visualMode: "force-curve" },
    targetQuantityKey: "forceRegimeAtR",
    hiddenQuantities: ["forceRegimeAtR", "equilibriumSepFm", "maxRangeFm"],
    stem: "At the marked nucleon separation inside a stable helium nucleus, how does the strong nuclear force behave?",
    correctPrefix: "In this intermediate separation band the strong nuclear force is",
    distractors: [
      {
        text: "In this intermediate separation band the strong nuclear force is repulsive and pushes protons apart",
        rationale: "Between 0.5 fm and 3 fm the strong nuclear force is attractive, not repulsive.",
      },
      {
        text: "In this intermediate separation band the strong nuclear force is infinite in range like gravity",
        rationale: "The strong nuclear force falls to zero around 3 fm rather than extending to infinity.",
      },
      {
        text: "In this intermediate separation band the strong nuclear force acts only between protons",
        rationale: "It acts equally between p–p, p–n, and n–n pairs.",
      },
    ],
    workedNote:
      "Between roughly $0.5\\text{ fm}$ and $3.0\\text{ fm}$, the strong nuclear force is attractive, overcoming electrostatic proton–proton repulsion.",
  });

  addQualMcq(ctx, {
    slug: "snf-beyond-range",
    domain: "graphs",
    kind,
    conceptId: "fundamental-particles-quarks-leptons",
    syllabi: TAG_321,
    difficulty: "standard",
    scenarioSpec: { kind, probeSeparationFm: 3.9, showElectrostatic: true, visualMode: "force-curve" },
    targetQuantityKey: "forceRegimeAtR",
    hiddenQuantities: ["forceRegimeAtR", "maxRangeFm"],
    stem: "Two protons in a large heavy nucleus lie on opposite sides at a separation indicated by the purple marker. Which statement correctly describes the strong nuclear force between them?",
    correctPrefix: "At this separation the strong nuclear force is",
    distractors: [
      {
        text: "At this separation the strong nuclear force is strongly attractive and dominates electrostatic repulsion",
        rationale: "Fails to recognise the short ~3 fm cut-off of the strong nuclear force.",
      },
      {
        text: "At this separation the strong nuclear force is strongly repulsive pushing the nucleus apart",
        rationale: "Repulsion occurs only below 0.5 fm; long-range repulsion in large nuclei is electrostatic.",
      },
      {
        text: "At this separation the strong nuclear force follows an inverse-square law like Coulomb's law",
        rationale: "Only electromagnetic and gravitational forces have infinite inverse-square range.",
      },
    ],
    workedNote:
      "Beyond about $3\\text{ fm}$ the strong nuclear force becomes negligible, while infinite-range electrostatic repulsion still acts across large nuclei.",
  });

  addQualMcq(ctx, {
    slug: "snf-exchange-boson",
    domain: "graphs",
    kind,
    conceptId: "fundamental-particles-quarks-leptons",
    syllabi: TAG_321,
    difficulty: "standard",
    scenarioSpec: { kind, probeSeparationFm: 1.0, showElectrostatic: true, visualMode: "nuclear-stability" },
    targetQuantityKey: "exchangeBosonRule",
    hiddenQuantities: ["exchangeBosonRule", "lorAnchor"],
    stem: "Which table row correctly pairs the exchange particles mediating the electromagnetic repulsion between protons and the strong nuclear force between nucleons?",
    correctPrefix: "In AQA particle physics,",
    distractors: [
      {
        text: "In AQA particle physics, W bosons mediate electromagnetic repulsion while virtual photons mediate the strong nuclear force",
        rationale: "Swaps the weak exchange bosons with the electromagnetic and strong exchange particles.",
      },
      {
        text: "In AQA particle physics, gravitons mediate electrostatic repulsion while electrons mediate the strong nuclear force",
        rationale: "Electrons are leptons and do not act as strong force exchange particles.",
      },
      {
        text: "In AQA particle physics, kaons mediate electrostatic repulsion while neutrinos mediate the strong nuclear force",
        rationale: "Neutrinos are leptons unaffected by the strong force and kaons are strange mesons.",
      },
    ],
    workedNote:
      "Virtual photons mediate electromagnetic interactions, whereas pions (or gluons between quarks) mediate the strong nuclear force between nucleons.",
    markCriterionExtra: "Reject 'force mediator'; use exchange particle / boson.",
  });

  addQualMcq(ctx, {
    slug: "snf-hadron-scope",
    domain: "graphs",
    kind,
    conceptId: "fundamental-particles-quarks-leptons",
    syllabi: TAG_321,
    difficulty: "foundation",
    scenarioSpec: { kind, probeSeparationFm: 1.5, showElectrostatic: false, visualMode: "force-curve" },
    targetQuantityKey: "targetScopeRule",
    hiddenQuantities: ["targetScopeRule"],
    stem: "Which particles experience the strong nuclear force shown in the graph?",
    correctPrefix: "The strong nuclear force",
    distractors: [
      {
        text: "The strong nuclear force acts only on positively charged protons and ignores neutral neutrons",
        rationale: "Confuses strong nuclear interaction with electrostatic interaction; neutrons feel the exact same strong force.",
      },
      {
        text: "The strong nuclear force acts equally on protons, neutrons, and orbital electrons",
        rationale: "Electrons are leptons and do not experience the strong nuclear force.",
      },
      {
        text: "The strong nuclear force acts only on unstable radioactive isotopes",
        rationale: "All stable and unstable nuclei are held together by the strong nuclear force.",
      },
    ],
    workedNote:
      "The strong nuclear force acts only on hadrons (such as protons and neutrons) and has zero effect on leptons.",
  });

  addQualMcq(ctx, {
    slug: "snf-stability-why-neutrons",
    domain: "graphs",
    kind,
    conceptId: "fundamental-particles-quarks-leptons",
    syllabi: TAG_321,
    difficulty: "higher",
    scenarioSpec: { kind, probeSeparationFm: 1.1, showElectrostatic: true, visualMode: "nuclear-stability" },
    targetQuantityKey: "lorAnchor",
    hiddenQuantities: ["lorAnchor", "forceRegimeAtR", "equilibriumSepFm", "maxRangeFm"],
    stem: "Why do stable heavy nuclei require a greater proportion of neutrons to protons than light nuclei?",
    correctPrefix: "Extra neutrons are needed because the",
    correctSuffix: "whereas infinite-range electrostatic repulsion acts across all protons",
    distractors: [
      {
        text: "Extra neutrons are needed because neutrons carry negative charge that neutralises proton repulsion",
        rationale: "Neutrons are electrically neutral (Q = 0).",
      },
      {
        text: "Extra neutrons are needed because the strong nuclear force has infinite range and grows faster than electrostatic repulsion",
        rationale: "Inverts the ranges: strong force is short-range (~3 fm), while electrostatic repulsion is infinite-range.",
      },
      {
        text: "Extra neutrons are needed because neutrons experience gravitational attraction stronger than Coulomb repulsion",
        rationale: "Gravitational attraction between nucleons is ~10⁻³⁶ times weaker than electrostatic repulsion.",
      },
    ],
    workedNote:
      "Because the strong nuclear force is short-range ($0.5\\text{–}3\\text{ fm}$) while electrostatic repulsion acts across the entire nucleus, extra neutrons add strong attraction without adding proton repulsion.",
  });

  // 1 Quantitative MCQ (reading equilibrium separation r_0)
  addNumMcq(ctx, {
    slug: "snf-equilibrium-sep",
    domain: "graphs",
    kind,
    conceptId: "fundamental-particles-quarks-leptons",
    syllabi: TAG_321,
    difficulty: "foundation",
    scenarioSpec: { kind, probeSeparationFm: 1.0, showElectrostatic: false, visualMode: "force-curve" },
    targetQuantityKey: "equilibriumSepFm",
    unit: "fm",
    hiddenQuantities: ["equilibriumSepFm", "forceRegimeAtR", "maxRangeFm"],
    requiredGivens: [],
    stem: "From the graph of strong nuclear force against nucleon separation, at what approximate separation $r_0$ does the strong nuclear force change from repulsive to attractive?",
    distractors: [
      { value: 3.0, rationale: "Gives the outer cut-off range (~3 fm) instead of the repulsive-to-attractive crossover." },
      { value: 1.0, rationale: "Gives the separation of peak attraction rather than the zero-crossing equilibrium point." },
      { value: 5.0, rationale: "Reads the right-hand axis endpoint rather than the curve intercept." },
    ],
    workedSolution:
      "The strong nuclear force curve crosses the horizontal zero-force axis from repulsive (+) to attractive (−) at $r_0 = 0.500\\text{ fm}$.",
    markCriterion: "Equilibrium crossover separation $0.500\\text{ fm}$",
  });

  // 2 Non-LoR Structured + 2 Authentic 6-Mark LoR (#1 Blueprint)
  addStructured(ctx, {
    slug: "snf-lor-stability-6m",
    domain: "graphs",
    kind,
    conceptId: "fundamental-particles-quarks-leptons",
    syllabi: TAG_321,
    difficulty: "higher",
    questionStyle: "qualitative",
    targetMode: "qualitative",
    scenarioSpec: { kind, probeSeparationFm: 1.0, showElectrostatic: true, visualMode: "nuclear-stability" },
    hiddenQuantities: ["lorAnchor", "forceRegimeAtR", "equilibriumSepFm", "maxRangeFm", "exchangeBosonRule"],
    requiredGivens: [],
    stem: "A helium-4 nucleus contains two protons and two neutrons packed within a radius of about $2\\text{ fm}$. The graph illustrates how the strong nuclear force varies with nucleon separation.",
    parts: [
      {
        partId: "a",
        prompt:
          "Explain how the fundamental forces acting between nucleons keep a stable nucleus together without collapsing or flying apart. In your answer you should: identify the forces acting, describe how the strong nuclear force varies with separation, and name the exchange particles responsible.",
        marks: 6,
        targetMode: "qualitative",
        targetQuantityKey: "lorAnchor",
        expectedAnswer:
          "Inside a nucleus, protons experience long-range repulsive electromagnetic (electrostatic) forces mediated by virtual photons, while gravitational attraction between nucleons is negligible. All nucleons (protons and neutrons) experience the strong nuclear force, mediated by pions between nucleons (condone gluons between quarks). The strong nuclear force is repulsive below zero point five fm and attractive up to three fm balancing electrostatic proton repulsion: below 0.5 fm repulsion prevents nuclear collapse, between 0.5 fm and 3 fm strong attraction overcomes electrostatic repulsion, and at equilibrium separation the net force on nucleons is zero so the nucleus stays stable.",
        workingSteps: [
          "Area 1 (L1): Identify electrostatic proton repulsion, strong nuclear force between nucleons, and negligible gravity.",
          "Area 2 (L2): Specify SNF profile: repulsive below 0.5 fm (prevents collapse), attractive from 0.5 fm to ~3 fm (overcomes EM repulsion), negligible beyond ~3 fm.",
          "Area 3 (L3): Name exchange particles (virtual photon for EM; pion — condone gluon — for strong) and link balance of forces at equilibrium separation to nuclear stability.",
        ],
      },
    ],
    workedSolution:
      "Level 3 (5–6 marks): Names electrostatic repulsion between protons and strong nuclear force between all nucleons (gravity negligible); states that the strong nuclear force is repulsive below zero point five fm and attractive up to three fm balancing electrostatic proton repulsion; identifies virtual photons (EM) and pions/gluons (strong) as exchange particles (reject 'force mediator') and explains equilibrium separation where net force balances.",
    markScheme: makeLorCriteria("a", [
      "L1 (Area 1): Identifies repulsive electromagnetic/electrostatic force acting between protons and attractive strong nuclear force acting between nucleons (p–p, p–n, n–n).",
      "L1 (Area 1): Notes that gravitational attraction between nucleons is negligible on nuclear scales.",
      "L2 (Area 2): States the strong nuclear force is strongly repulsive at very short separations below ~0.5 fm, preventing the nucleus from collapsing.",
      "L2 (Area 2): States the strong nuclear force is attractive between ~0.5 fm and ~3 fm (short range, negligible beyond ~3 fm), overcoming electrostatic repulsion.",
      "L3 (Area 3): Names the exchange particles correctly: virtual photon for electromagnetic interaction and pion (condone gluon) for the strong interaction (reject 'force mediator').",
      "L3 (Area 3): Logically links all three areas to explain equilibrium nucleon separation where resultant force balances so the nucleus neither collapses nor flies apart.",
    ]),
    subpartStrategy: [
      "Extended six-mark Level of Response explanation of nuclear stability, force profile, and exchange particles.",
    ],
  });

  addStructured(ctx, {
    slug: "snf-lor-alpha-heavy-8m",
    domain: "graphs",
    kind,
    conceptId: "fundamental-particles-quarks-leptons",
    syllabi: TAG_321,
    difficulty: "higher",
    questionStyle: "mixed-exam",
    targetMode: "quantitative",
    scenarioSpec: { kind, probeSeparationFm: 0.5, showElectrostatic: true, visualMode: "force-curve" },
    hiddenQuantities: ["equilibriumSepFm", "maxRangeFm", "lorAnchor", "forceRegimeAtR"],
    requiredGivens: [],
    stem: "Heavy nuclei with nucleon numbers above $200$ are often unstable and emit alpha particles. Refer to the strong nuclear force graph shown.",
    parts: [
      {
        partId: "a",
        prompt: "State the approximate equilibrium separation $r_0$ and maximum effective range of the strong nuclear force from the graph.",
        marks: 2,
        targetMode: "quantitative",
        targetQuantityKey: "maxRangeFm",
        expectedAnswer: "Equilibrium separation $r_0 \\approx 0.5\\text{ fm}$ and maximum range $3.00\\text{ fm}$",
        workingSteps: [
          "Read zero-force crossover at $0.5\\text{ fm}$.",
          "Read asymptotic outer range at $3.00\\text{ fm}$.",
        ],
      },
      {
        partId: "b",
        prompt:
          "Using your knowledge of nuclear forces and exchange particles, explain why light nuclei can be stable with equal numbers of protons and neutrons whereas very heavy nuclei become unstable and emit alpha particles.",
        marks: 6,
        targetMode: "qualitative",
        targetQuantityKey: "lorAnchor",
        expectedAnswer:
          "In every nucleus, protons repel each other via the infinite-range electromagnetic force (mediated by virtual photons) while nucleons interact via the short-range strong nuclear force (mediated by pions). The strong nuclear force is repulsive below zero point five fm and attractive up to three fm balancing electrostatic proton repulsion. In light nuclei, nuclear diameter is smaller than 3 fm so every nucleon attracts every other nucleon strongly; in very heavy nuclei, diameter exceeds 3 fm so distant protons still repel electrostatically without strong attraction, reducing binding stability until alpha emission lowers both proton number and size.",
        workingSteps: [
          "Area 1 (L1): Contrast infinite-range electrostatic repulsion between protons with short-range strong nuclear force between nearest-neighbour nucleons.",
          "Area 2 (L2): Give quantitative ranges (<0.5 fm repulsive, 0.5–3 fm attractive, ~0 beyond 3 fm) and name exchange particles (virtual photon, pion).",
          "Area 3 (L3): Explain why heavy nuclei exceeding ~3 fm diameter require excess neutrons and eventually shed alpha particles to restore force balance.",
        ],
      },
    ],
    workedSolution:
      "(a) $r_0 \\approx 0.5\\text{ fm}$ and maximum range $\\approx 3.00\\text{ fm}$. (b) Strong nuclear force is repulsive below zero point five fm and attractive up to three fm balancing electrostatic proton repulsion; virtual photons mediate infinite-range proton repulsion while pions mediate short-range strong attraction, making very large nuclei unstable to alpha decay.",
    markScheme: [
      { code: "B1", criterion: "State equilibrium separation $\\approx 0.5\\text{ fm}$ (accept 0.4–0.6 fm).", marks: 1, partId: "a" },
      { code: "B1", criterion: "State maximum strong-force range $\\approx 3.00\\text{ fm}$ (accept 3–4 fm).", marks: 1, partId: "a" },
      ...makeLorCriteria("b", [
        "L1 (Area 1): Identifies infinite-range electrostatic repulsion between protons and short-range strong nuclear attraction between nucleons.",
        "L1 (Area 1): States that strong nuclear force acts equally between protons and neutrons (hadrons).",
        "L2 (Area 2): Quotes short-range profile: repulsive below 0.5 fm (prevents collapse) and attractive between 0.5 fm and 3 fm.",
        "L2 (Area 2): Names virtual photon (electromagnetic) and pion / gluon (strong) exchange particles.",
        "L3 (Area 3): Explains that in heavy nuclei whose diameter exceeds ~3 fm, distant protons repel without feeling strong attraction from one another.",
        "L3 (Area 3): Concludes clearly why heavy nuclei require excess neutrons and shed alpha particles to reduce electrostatic repulsion and reach stability.",
      ]),
    ],
    subpartStrategy: [
      "Read characteristic separation thresholds from the strong nuclear force graph.",
      "Deliver a six-mark Level of Response explanation contrasting light and heavy nuclear stability.",
    ],
  });

  addStructured(ctx, {
    slug: "snf-short-probe-struct",
    domain: "graphs",
    kind,
    conceptId: "fundamental-particles-quarks-leptons",
    syllabi: TAG_321,
    difficulty: "standard",
    questionStyle: "qualitative",
    targetMode: "qualitative",
    scenarioSpec: { kind, probeSeparationFm: 0.35, showElectrostatic: false, visualMode: "force-curve" },
    hiddenQuantities: ["forceRegimeAtR", "targetScopeRule", "equilibriumSepFm"],
    requiredGivens: [],
    stem: "Two neutrons inside an oxygen nucleus momentarily approach each other to the separation marked on the graph.",
    parts: [
      {
        partId: "a",
        prompt: "State whether the strong nuclear force between the two neutrons is attractive or repulsive at this separation and explain its significance.",
        marks: 2,
        targetMode: "qualitative",
        targetQuantityKey: "forceRegimeAtR",
        expectedAnswer: "The strong nuclear force is strongly repulsive preventing nuclear collapse at separations below 0.5 fm.",
        workingSteps: [
          "Identify that separation is below 0.5 fm where force is positive (repulsive).",
          "Link short-range repulsion to preventing nucleon collapse.",
        ],
      },
      {
        partId: "b",
        prompt: "State how the strong nuclear force between two neutrons compares with that between two protons at the same separation, and explain why atomic electrons are unaffected.",
        marks: 2,
        targetMode: "qualitative",
        targetQuantityKey: "targetScopeRule",
        expectedAnswer: "The strong nuclear force is identical in magnitude and range because it acts equally between all nucleons and has no effect on leptons such as electrons.",
        workingSteps: [
          "State charge-independence of strong nuclear force for all nucleon pairs.",
          "Identify electrons as leptons that do not interact via the strong force.",
        ],
      },
    ],
    workedSolution:
      "(a) Below $0.5\\text{ fm}$ it is strongly repulsive preventing nuclear collapse. (b) It acts equally between all nucleons and has no effect on leptons.",
    markScheme: [
      { code: "B1", criterion: "State that the force is repulsive below 0.5 fm.", marks: 1, partId: "a" },
      { code: "B1", criterion: "Explain that this prevents the nucleus from collapsing.", marks: 1, partId: "a" },
      { code: "B1", criterion: "State that the strong force is identical between n–n, p–n, and p–p pairs.", marks: 1, partId: "b" },
      { code: "B1", criterion: "State that electrons are leptons and do not experience the strong nuclear force.", marks: 1, partId: "b" },
    ],
    subpartStrategy: [
      "Interpret sub-equilibrium repulsion on the strong-force graph.",
      "Contrast hadrons and leptons under the strong interaction.",
    ],
  });

  addStructured(ctx, {
    slug: "snf-compare-em-struct",
    domain: "graphs",
    kind,
    conceptId: "fundamental-particles-quarks-leptons",
    syllabi: TAG_321,
    difficulty: "standard",
    questionStyle: "qualitative",
    targetMode: "qualitative",
    scenarioSpec: { kind, probeSeparationFm: 1.4, showElectrostatic: true, visualMode: "force-curve" },
    hiddenQuantities: ["exchangeBosonRule", "forceRegimeAtR"],
    requiredGivens: [],
    stem: "The graph displays both the strong nuclear force and the electrostatic force acting between a pair of protons.",
    parts: [
      {
        partId: "a",
        prompt: "Name the exchange particle for each of the two plotted interactions.",
        marks: 2,
        targetMode: "qualitative",
        targetQuantityKey: "exchangeBosonRule",
        expectedAnswer: "A virtual photon mediates electromagnetic repulsion while pions mediate the strong nuclear force between nucleons (condone gluons between quarks).",
        workingSteps: [
          "Name virtual photon for the electromagnetic force.",
          "Name pion (or gluon) for the strong nuclear force.",
        ],
      },
      {
        partId: "b",
        prompt: "Explain why two protons held at a separation of $1.4\\text{ fm}$ remain bound rather than accelerating apart.",
        marks: 2,
        targetMode: "qualitative",
        targetQuantityKey: "forceRegimeAtR",
        expectedAnswer: "At $1.4\\text{ fm}$ the strong nuclear force is attractive overcoming electrostatic proton repulsion because its magnitude is much larger than the Coulomb repulsion.",
        workingSteps: [
          "Note 1.4 fm lies inside the 0.5–3 fm attractive window.",
          "Compare strong attraction magnitude with smaller electrostatic repulsion.",
        ],
      },
    ],
    workedSolution:
      "(a) Virtual photon mediates electromagnetic repulsion while pions mediate the strong nuclear force. (b) At $1.4\\text{ fm}$, strong nuclear force is attractive overcoming electrostatic proton repulsion.",
    markScheme: [
      { code: "B1", criterion: "Virtual photon for electromagnetic interaction.", marks: 1, partId: "a" },
      { code: "B1", criterion: "Pion (condone gluon) for strong nuclear interaction.", marks: 1, partId: "a" },
      { code: "B1", criterion: "Recognise 1.4 fm lies within the 0.5–3 fm attractive region.", marks: 1, partId: "b" },
      { code: "B1", criterion: "State strong nuclear attraction is greater than electrostatic repulsion at this separation.", marks: 1, partId: "b" },
    ],
    subpartStrategy: [
      "Identify exchange particles for electromagnetic and strong forces.",
      "Compare force magnitudes at intermediate nuclear separation.",
    ],
  });
}

/* -------------------------------------------------------------------------- */
/*  FAMILY 4: al-as-pair-prod-annihilation (11 items: 3Q + 4C + 4 Struct)     */
/* -------------------------------------------------------------------------- */

function buildFamily4PairProdAnnihilation(ctx: BuilderContext): void {
  const kind = "al-as-pair-prod-annihilation" as const;

  // 3 Pure Qualitative MCQs
  addQualMcq(ctx, {
    slug: "pp-annih-two-photons",
    domain: "quantum-nuclear",
    kind,
    conceptId: "fundamental-particles-quarks-leptons",
    syllabi: TAG_321,
    difficulty: "foundation",
    scenarioSpec: { kind, processType: "annihilation", particlePair: "electron-positron", energyInputMeV: 0.1 },
    targetQuantityKey: "momentumRule",
    hiddenQuantities: ["momentumRule", "singlePhotonEnergyMeV"],
    stem: "When a slow-moving electron and positron meet and annihilate, why are two gamma photons produced rather than a single gamma photon?",
    correctPrefix: "To conserve linear momentum,",
    distractors: [
      {
        text: "To conserve linear momentum, a single photon splits into an electron and positron along the same line",
        rationale: "Describes pair production rather than annihilation, and still does not balance zero initial momentum.",
      },
      {
        text: "To conserve linear momentum, two gamma photons travel in the same direction at half the speed of light",
        rationale: "Photons always travel at c in vacuum and parallel photons would carry non-zero net momentum.",
      },
      {
        text: "To conserve linear momentum, one photon carries positive charge and the other carries negative charge",
        rationale: "Gamma photons are electrically neutral.",
      },
    ],
    workedNote:
      "Initial net momentum is nearly zero, so two gamma photons travel in opposite directions to conserve momentum (reject 'elimination'; always say annihilation and positron).",
  });

  addQualMcq(ctx, {
    slug: "pp-excess-ke-source",
    domain: "quantum-nuclear",
    kind,
    conceptId: "fundamental-particles-quarks-leptons",
    syllabi: TAG_321,
    difficulty: "standard",
    scenarioSpec: { kind, processType: "pair-production", particlePair: "electron-positron", energyInputMeV: 1.5 },
    targetQuantityKey: "excessEnergySource",
    hiddenQuantities: ["excessEnergySource", "totalEkMeV"],
    stem: "A high-energy gamma photon whose energy exceeds twice the rest energy of an electron undergoes pair production near a lead nucleus. What becomes of the energy in excess of the rest energies of the created pair?",
    correctPrefix: "The excess photon energy becomes",
    distractors: [
      {
        text: "The excess photon energy becomes increased electric charge on the electron and positron",
        rationale: "Elementary charge magnitude e is fixed and cannot increase.",
      },
      {
        text: "The excess photon energy becomes greater rest mass of the electron and positron",
        rationale: "Rest energy E₀ is an invariant property of each particle species.",
      },
      {
        text: "The excess photon energy becomes speed alone without specifying kinetic energy",
        rationale: "AQA mark schemes explicitly require 'kinetic energy' rather than vague 'speed' or 'velocity'.",
      },
    ],
    workedNote:
      "By mass–energy conservation, any energy above $2E_0$ appears as kinetic energy of the created particles (AQA requires 'kinetic energy', not 'speed').",
  });

  addQualMcq(ctx, {
    slug: "pp-threshold-rule",
    domain: "quantum-nuclear",
    kind,
    conceptId: "fundamental-particles-quarks-leptons",
    syllabi: TAG_321,
    difficulty: "foundation",
    scenarioSpec: { kind, processType: "pair-production", particlePair: "muon-antimuon", energyInputMeV: 250 },
    targetQuantityKey: "thresholdRule",
    hiddenQuantities: ["thresholdRule", "minPairEnergyMeV", "energyInputMeV"],
    stem: "Which statement accurately expresses the threshold energy condition for a single gamma photon to create a particle–antiparticle pair?",
    correctPrefix: "By energy conservation,",
    distractors: [
      {
        text: "By energy conservation, minimum photon energy equals half the rest energy of one particle",
        rationale: "Creating both a particle and an identical-mass antiparticle requires twice E₀, not half.",
      },
      {
        text: "By energy conservation, minimum photon energy equals the rest energy of one particle alone",
        rationale: "Forgets that an antiparticle has the exact same rest energy E₀ as its corresponding particle.",
      },
      {
        text: "By energy conservation, minimum photon energy depends only on the charge of the nearby nucleus",
        rationale: "The nucleus recoils to conserve momentum, while the energy threshold is set by 2E₀.",
      },
    ],
    workedNote:
      "Both the particle and antiparticle have rest energy $E_0$, so minimum photon energy equals twice the rest energy of one particle.",
  });

  // 4 Quantitative MCQs
  const ppQ1Spec = { kind, processType: "pair-production", particlePair: "electron-positron", energyInputMeV: 1.42 };
  const ppQ1 = solveKind(kind, ppQ1Spec);
  addNumMcq(ctx, {
    slug: "pp-calc-min-freq",
    domain: "quantum-nuclear",
    kind,
    conceptId: "fundamental-particles-quarks-leptons",
    syllabi: TAG_321,
    difficulty: "standard",
    scenarioSpec: ppQ1Spec,
    targetQuantityKey: "minPairFrequencyHz",
    unit: "Hz",
    hiddenQuantities: ["minPairFrequencyHz", "minPairEnergyMeV", "energyInputMeV"],
    requiredGivens: [{ name: "E0", value: AQA_ME_MEV, unit: "MeV", source: "stem" }],
    stem: "An electron and a positron each have rest energy $0.511\\text{ MeV}$. Using $h = 6.63 \\times 10^{-34}\\text{ J s}$ and $1\\text{ MeV} = 1.60 \\times 10^{-13}\\text{ J}$, calculate the minimum frequency of a gamma photon required for electron–positron pair production.",
    distractors: [
      { value: numVal(ppQ1, "minPairFrequencyHz") / 2, rationale: "Uses only E₀ instead of 2E₀, omitting the positron's rest energy." },
      { value: numVal(ppQ1, "minPairFrequencyHz") * 2, rationale: "Multiplies by an erroneous extra factor of two." },
      { value: numVal(ppQ1, "minPairFrequencyHz") * 1e-6, rationale: "Converts eV instead of MeV (forgets factor of 10⁶)." },
    ],
    workedSolution: `$E_{\\min} = 2 \\times 0.511\\text{ MeV} = 1.022\\text{ MeV} = 1.635 \\times 10^{-13}\\text{ J}$, so $f_{\\min} = E_{\\min}/h = ${fmtSig(numVal(ppQ1, "minPairFrequencyHz"), 3, "Hz")}$.`,
    markCriterion: `Minimum photon frequency $= ${fmtSig(numVal(ppQ1, "minPairFrequencyHz"), 3, "Hz")}$`,
  });

  const ppQ2Spec = { kind, processType: "pair-production", particlePair: "electron-positron", energyInputMeV: 1.64 };
  const ppQ2 = solveKind(kind, ppQ2Spec);
  addNumMcq(ctx, {
    slug: "pp-calc-excess-ke",
    domain: "quantum-nuclear",
    kind,
    conceptId: "fundamental-particles-quarks-leptons",
    syllabi: TAG_321,
    difficulty: "foundation",
    scenarioSpec: ppQ2Spec,
    targetQuantityKey: "totalEkMeV",
    unit: "MeV",
    hiddenQuantities: ["totalEkMeV"],
    requiredGivens: [
      { name: "E_gamma", value: 1.64, unit: "MeV", source: "either" },
      { name: "E0", value: AQA_ME_MEV, unit: "MeV", source: "stem" },
    ],
    stem: "A gamma photon of energy $1.64\\text{ MeV}$ undergoes electron–positron pair production near a heavy nucleus. Given that each particle has rest energy $0.511\\text{ MeV}$, calculate the total kinetic energy of the created electron and positron.",
    distractors: [
      { value: 1.64 - 0.511, rationale: "Subtracts only one rest energy E₀ instead of 2E₀." },
      { value: 1.64 + 1.022, rationale: "Adds rest energy instead of subtracting it from incident photon energy." },
      { value: (1.64 - 1.022) / 2, rationale: "Quotes the kinetic energy of one particle instead of the total kinetic energy of the pair." },
    ],
    workedSolution: `$E_{\\text{k,tot}} = E_\\gamma - 2E_0 = 1.64 - 2(0.511) = ${fmtSig(numVal(ppQ2, "totalEkMeV"), 3, "MeV")}$.`,
    markCriterion: `Total kinetic energy $= ${fmtSig(numVal(ppQ2, "totalEkMeV"), 3, "MeV")}$`,
  });

  const ppQ3Spec = { kind, processType: "annihilation", particlePair: "electron-positron", energyInputMeV: 0.36 };
  const ppQ3 = solveKind(kind, ppQ3Spec);
  addNumMcq(ctx, {
    slug: "pp-calc-annih-photon-e",
    domain: "quantum-nuclear",
    kind,
    conceptId: "fundamental-particles-quarks-leptons",
    syllabi: TAG_321,
    difficulty: "standard",
    scenarioSpec: ppQ3Spec,
    targetQuantityKey: "singlePhotonEnergyMeV",
    unit: "MeV",
    hiddenQuantities: ["singlePhotonEnergyMeV"],
    requiredGivens: [
      { name: "E_k_tot", value: 0.36, unit: "MeV", source: "stem" },
      { name: "E0", value: AQA_ME_MEV, unit: "MeV", source: "stem" },
    ],
    stem: "An electron and a positron with combined kinetic energy $0.36\\text{ MeV}$ annihilate to produce two identical gamma photons. Each particle has rest energy $0.511\\text{ MeV}$. What is the energy of each emitted photon?",
    distractors: [
      { value: 2 * 0.511 + 0.36, rationale: "Gives the total energy of both photons rather than dividing by two for one photon." },
      { value: 0.511 + 0.36, rationale: "Adds the full combined kinetic energy to each photon instead of sharing it equally." },
      { value: 0.511, rationale: "Ignores the initial kinetic energy of the colliding particles." },
    ],
    workedSolution: `Total energy is $2E_0 + E_{\\text{k,tot}} = 1.022 + 0.36 = 1.382\\text{ MeV}$, shared equally between two photons: $E_\\gamma = ${fmtSig(numVal(ppQ3, "singlePhotonEnergyMeV"), 3, "MeV")}$.`,
    markCriterion: `Each photon carries ${fmtSig(numVal(ppQ3, "singlePhotonEnergyMeV"), 3, "MeV")}`,
  });

  const ppQ4Spec = { kind, processType: "pair-production", particlePair: "proton-antiproton", energyInputMeV: 2100 };
  const ppQ4 = solveKind(kind, ppQ4Spec);
  addNumMcq(ctx, {
    slug: "pp-calc-proton-min-e",
    domain: "quantum-nuclear",
    kind,
    conceptId: "fundamental-particles-quarks-leptons",
    syllabi: TAG_321,
    difficulty: "standard",
    scenarioSpec: ppQ4Spec,
    targetQuantityKey: "minPairEnergyMeV",
    unit: "MeV",
    hiddenQuantities: ["minPairEnergyMeV", "energyInputMeV"],
    requiredGivens: [{ name: "E0", value: 938.257, unit: "MeV", source: "stem" }],
    stem: "The rest energy of a proton is $938.257\\text{ MeV}$. Calculate the minimum photon energy in $\\text{MeV}$ required to create a proton–antiproton pair.",
    distractors: [
      { value: 938.257, rationale: "Uses only a single proton rest energy instead of twice E₀." },
      { value: 938.257 / 2, rationale: "Halves the rest energy instead of doubling it." },
      { value: 4 * 938.257, rationale: "Multiplies by four instead of two." },
    ],
    workedSolution: `$E_{\\min} = 2E_0 = 2 \\times 938.257 = ${fmtSig(numVal(ppQ4, "minPairEnergyMeV"), 3, "MeV")}$.`,
    markCriterion: `Minimum photon energy $= ${fmtSig(numVal(ppQ4, "minPairEnergyMeV"), 3, "MeV")}$`,
  });

  // 4 Structured Questions
  const ppStructs = [
    {
      slug: "pp-struct-ep-pair",
      spec: { kind, processType: "pair-production", particlePair: "electron-positron", energyInputMeV: 1.54 },
      stem: "A $1.54\\text{ MeV}$ gamma photon interacts near a tungsten nucleus to produce an electron and its antiparticle. Rest energy of an electron $= 0.511\\text{ MeV}$, $1\\text{ MeV} = 1.60 \\times 10^{-13}\\text{ J}$, $h = 6.63 \\times 10^{-34}\\text{ J s}$.",
      isAnnih: false,
      givenVal: 1.54,
    },
    {
      slug: "pp-struct-ep-annih",
      spec: { kind, processType: "annihilation", particlePair: "electron-positron", energyInputMeV: 0.28 },
      stem: "In a PET medical scanner, a positron and an electron with combined kinetic energy $0.28\\text{ MeV}$ annihilate to produce two gamma photons. Rest energy $= 0.511\\text{ MeV}$, $1\\text{ MeV} = 1.60 \\times 10^{-13}\\text{ J}$, $h = 6.63 \\times 10^{-34}\\text{ J s}$.",
      isAnnih: true,
      givenVal: 0.28,
    },
    {
      slug: "pp-struct-muon-pair",
      spec: { kind, processType: "pair-production", particlePair: "muon-antimuon", energyInputMeV: 245 },
      stem: "A cosmic-ray gamma photon of energy $245\\text{ MeV}$ undergoes pair production near a nucleus to form a muon–antimuon pair. Rest energy of a muon $= 105.659\\text{ MeV}$, $1\\text{ MeV} = 1.60 \\times 10^{-13}\\text{ J}$, $h = 6.63 \\times 10^{-34}\\text{ J s}$.",
      isAnnih: false,
      givenVal: 245,
    },
    {
      slug: "pp-struct-proton-annih",
      spec: { kind, processType: "annihilation", particlePair: "proton-antiproton", energyInputMeV: 120 },
      stem: "A proton and antiproton collide with combined kinetic energy $120\\text{ MeV}$ and annihilate into two gamma photons of equal energy. Rest energy of a proton $= 938.257\\text{ MeV}$, $1\\text{ MeV} = 1.60 \\times 10^{-13}\\text{ J}$, $h = 6.63 \\times 10^{-34}\\text{ J s}$.",
      isAnnih: true,
      givenVal: 120,
    },
  ];

  for (const s of ppStructs) {
    const q = solveKind(kind, s.spec);
    if (!s.isAnnih) {
      const eMin = numVal(q, "minPairEnergyMeV");
      const ekTot = numVal(q, "totalEkMeV");
      const fMin = numVal(q, "minPairFrequencyHz");
      addStructured(ctx, {
        slug: s.slug,
        domain: "quantum-nuclear",
        kind,
        conceptId: "fundamental-particles-quarks-leptons",
        syllabi: TAG_321,
        difficulty: "standard",
        questionStyle: "mixed-exam",
        targetMode: "quantitative",
        scenarioSpec: s.spec,
        hiddenQuantities: ["minPairEnergyMeV", "totalEkMeV", "minPairFrequencyHz", "antiparticleName"],
        requiredGivens: [{ name: "energyInputMeV", value: s.givenVal, unit: "MeV", source: "either" }],
        stem: s.stem,
        parts: [
          {
            partId: "a",
            prompt: "Name the antiparticle produced and calculate the minimum photon energy in MeV needed for this pair production.",
            marks: 2,
            targetMode: "quantitative",
            targetQuantityKey: "minPairEnergyMeV",
            expectedAnswer: `${strVal(q, "antiparticleName")}; minimum photon energy $= ${fmtSig(eMin, 3, "MeV")}$`,
            workingSteps: [
              `Name antiparticle: ${strVal(q, "antiparticleName")} (do not accept 'antielectron' for positron).`,
              `Minimum photon energy $= 2E_0 = ${fmtSig(eMin, 3, "MeV")}$.`,
            ],
          },
          {
            partId: "b",
            prompt: "Calculate the total kinetic energy of the created pair in MeV and the threshold photon frequency in Hz.",
            marks: 3,
            dependsOnPartIds: ["a"],
            targetMode: "quantitative",
            targetQuantityKey: "minPairFrequencyHz",
            expectedAnswer: `Total kinetic energy $= ${fmtSig(ekTot, 3, "MeV")}$; threshold frequency $= ${fmtSig(fMin, 3, "Hz")}$`,
            workingSteps: [
              `Total kinetic energy $= E_\\gamma - 2E_0 = ${fmtSig(ekTot, 3, "MeV")}$.`,
              `Convert $2E_0$ to joules and divide by $h$: $f_{\\min} = ${fmtSig(fMin, 3, "Hz")}$.`,
            ],
          },
        ],
        workedSolution: `(a) Antiparticle: ${strVal(q, "antiparticleName")}; $E_{\\min} = 2E_0 = ${fmtSig(eMin, 3, "MeV")}$. (b) $E_{\\text{k,tot}} = ${fmtSig(ekTot, 3, "MeV")}$; $f_{\\min} = (2E_0 \\times 1.60 \\times 10^{-13})/6.63 \\times 10^{-34} = ${fmtSig(fMin, 3, "Hz")}$.`,
        markScheme: [
          { code: "B1", criterion: `Name ${strVal(q, "antiparticleName")} (reject 'antielectron').`, marks: 1, partId: "a" },
          { code: "A1", criterion: `Minimum energy $2E_0 = ${fmtSig(eMin, 3, "MeV")}$.`, marks: 1, partId: "a" },
          { code: "A1", criterion: `Total kinetic energy $= ${fmtSig(ekTot, 3, "MeV")}$.`, marks: 1, partId: "b" },
          { code: "M1", criterion: "Convert $2E_0$ to joules using $1.60 \\times 10^{-13}\\text{ J MeV}^{-1}$ and divide by $h$.", marks: 1, partId: "b" },
          { code: "A1", criterion: `Threshold frequency $= ${fmtSig(fMin, 3, "Hz")}$.`, marks: 1, partId: "b" },
        ],
        subpartStrategy: [
          "Identify antiparticle and compute pair-production threshold energy.",
          "Compute excess kinetic energy and minimum photon frequency.",
        ],
      });
    } else {
      const eEach = numVal(q, "singlePhotonEnergyMeV");
      const fPh = numVal(q, "photonFrequencyHz");
      addStructured(ctx, {
        slug: s.slug,
        domain: "quantum-nuclear",
        kind,
        conceptId: "fundamental-particles-quarks-leptons",
        syllabi: TAG_321,
        difficulty: "standard",
        questionStyle: "mixed-exam",
        targetMode: "quantitative",
        scenarioSpec: s.spec,
        hiddenQuantities: ["singlePhotonEnergyMeV", "photonFrequencyHz", "momentumRule"],
        requiredGivens: [{ name: "energyInputMeV", value: s.givenVal, unit: "MeV", source: "stem" }],
        stem: s.stem,
        parts: [
          {
            partId: "a",
            prompt: "Calculate the energy of each emitted gamma photon in MeV and its frequency in Hz.",
            marks: 3,
            targetMode: "quantitative",
            targetQuantityKey: "photonFrequencyHz",
            expectedAnswer: `Each photon energy $= ${fmtSig(eEach, 3, "MeV")}$; frequency $= ${fmtSig(fPh, 3, "Hz")}$`,
            workingSteps: [
              `Energy of each photon $E = E_0 + \\frac{1}{2}E_{\\text{k,tot}} = ${fmtSig(eEach, 3, "MeV")}$.`,
              `Convert to joules and compute $f = E/h = ${fmtSig(fPh, 3, "Hz")}$.`,
            ],
          },
          {
            partId: "b",
            prompt: "Explain why two photons are emitted in opposite directions during annihilation.",
            marks: 2,
            targetMode: "qualitative",
            targetQuantityKey: "momentumRule",
            expectedAnswer: `Initial momentum is approximately zero, so ${strVal(q, "momentumRule")}.`,
            workingSteps: [
              "State momentum conservation from near-zero initial momentum.",
              "Conclude two identical photons travel in opposite directions (reject 'elimination').",
            ],
          },
        ],
        workedSolution: `(a) Each photon has $E = ${fmtSig(eEach, 3, "MeV")}$, giving $f = ${fmtSig(fPh, 3, "Hz")}$. (b) ${strVal(q, "momentumRule")}.`,
        markScheme: [
          { code: "A1", criterion: `Each photon energy $= ${fmtSig(eEach, 3, "MeV")}$.`, marks: 1, partId: "a" },
          { code: "M1", criterion: "Convert photon energy to joules and apply $f = E/h$.", marks: 1, partId: "a" },
          { code: "A1", criterion: `Frequency $= ${fmtSig(fPh, 3, "Hz")}$.`, marks: 1, partId: "a" },
          { code: "B1", criterion: "Momentum must be conserved (initial momentum ~ 0).", marks: 1, partId: "b" },
          { code: "B1", criterion: "Two gamma photons travel in opposite directions with equal magnitude momentum.", marks: 1, partId: "b" },
        ],
        subpartStrategy: [
          "Compute single annihilation photon energy and frequency.",
          "Explain opposite-direction two-photon emission via momentum conservation.",
        ],
      });
    }
  }
}

/* -------------------------------------------------------------------------- */
/*  FAMILY 5: al-as-feynman-interactions (12 items: 8Q + 0C + 4 Struct)       */
/* -------------------------------------------------------------------------- */

function buildFamily5Feynman(ctx: BuilderContext): void {
  const kind = "al-as-feynman-interactions" as const;

  const qualConfigs: Array<{
    slug: string;
    mode: FeynmanInteractionMode;
    targetKey: "exchangeBoson" | "quarkFlavourChange" | "missingProduct" | "interactionType";
    hidden: string[];
    stem: string;
    prefix: string;
    distractors: readonly [VerbalDistractor, VerbalDistractor, VerbalDistractor];
    note: string;
    diff: QuestionDifficulty;
  }> = [
    {
      slug: "feyn-bm-boson",
      mode: "beta-minus",
      targetKey: "exchangeBoson",
      hidden: ["exchangeBoson", "interactionType"],
      stem: "The Feynman diagram shows $\\beta^-$ decay of a free neutron into a proton, electron, and electron antineutrino. Which exchange particle should replace the question mark?",
      prefix: "The interaction is mediated by a",
      distractors: [
        { text: "The interaction is mediated by a W plus boson", rationale: "At the n → p vertex charge goes 0 → +1, so the emitted boson must carry −1 charge (W⁻), not +1." },
        { text: "The interaction is mediated by a virtual photon", rationale: "Photons mediate electromagnetic interactions and cannot change quark flavour." },
        { text: "The interaction is mediated by a neutral pion meson", rationale: "Pions mediate the strong nuclear force, whereas beta decay is a weak interaction; never call W a meson." },
      ],
      note: "Charge conservation at the $n \\to p + W^-$ vertex requires a $W^-$ boson (reject bare 'W' or 'W meson').",
      diff: "foundation",
    },
    {
      slug: "feyn-bm-missing",
      mode: "beta-minus",
      targetKey: "missingProduct",
      hidden: ["missingProduct"],
      stem: "In the Feynman diagram for $\\beta^-$ decay, a $W^-$ boson decays into an electron and an unlabelled particle $Y$. Identify particle $Y$.",
      prefix: "By electron lepton number conservation, particle Y is an",
      distractors: [
        { text: "By electron lepton number conservation, particle Y is an electron neutrino", rationale: "An electron and electron neutrino would give L_e = +2 on the right instead of 0." },
        { text: "By electron lepton number conservation, particle Y is a muon antineutrino", rationale: "Violates both L_e and L_μ conservation separately." },
        { text: "By electron lepton number conservation, particle Y is a positron", rationale: "Violates electric charge conservation at the right vertex." },
      ],
      note: "The $W^-$ has $L_e = 0$ and the electron has $L_e = +1$, so $Y$ must have $L_e = -1$ and $Q = 0$: an electron antineutrino.",
      diff: "foundation",
    },
    {
      slug: "feyn-bp-boson",
      mode: "beta-plus",
      targetKey: "exchangeBoson",
      hidden: ["exchangeBoson", "interactionType"],
      stem: "A proton inside a proton-rich nucleus transforms into a neutron via $\\beta^+$ decay as shown in the Feynman diagram. Which exchange particle bridges the two vertices?",
      prefix: "The exchange particle is a",
      distractors: [
        { text: "The exchange particle is a W minus boson", rationale: "At the p → n vertex charge goes +1 → 0, requiring a +1 boson (W⁺)." },
        { text: "The exchange particle is a virtual photon", rationale: "Electromagnetic virtual photons cannot change a proton into a neutron." },
        { text: "The exchange particle is a gluon", rationale: "Gluons mediate the strong force and preserve quark flavour." },
      ],
      note: "Charge conservation at $p \\to n + W^+$ fixes the exchange particle as a W plus boson.",
      diff: "foundation",
    },
    {
      slug: "feyn-ec-boson",
      mode: "electron-capture",
      targetKey: "exchangeBoson",
      hidden: ["exchangeBoson", "interactionType"],
      stem: "In electron capture, an inner-shell atomic electron interacts with a nuclear proton as illustrated. Which exchange particle and direction correctly complete the diagram?",
      prefix: "Electron capture proceeds via a",
      distractors: [
        { text: "Electron capture proceeds via a W minus boson from proton to electron", rationale: "A W⁻ leaving a proton would turn charge +1 into +2, violating charge conservation." },
        { text: "Electron capture proceeds via a virtual photon from proton to electron", rationale: "Electromagnetic exchange cannot convert a proton into a neutron." },
        { text: "Electron capture proceeds via a neutral pion from electron to proton", rationale: "Electrons are leptons and cannot emit strong-force pions." },
      ],
      note: "In electron capture, the proton emits a $W^+$ boson to become a neutron, and the electron absorbs $W^+$ to become $\\nu_e$.",
      diff: "standard",
    },
    {
      slug: "feyn-ep-coll-boson",
      mode: "electron-proton-collision",
      targetKey: "exchangeBoson",
      hidden: ["exchangeBoson", "interactionType"],
      stem: "A high-energy electron collides with a proton in the weak interaction shown in the Feynman diagram, producing a neutrino and a neutron. Which exchange boson and direction correspond to this vertex ordering?",
      prefix: "This electron–proton collision is mediated by a",
      distractors: [
        { text: "This electron–proton collision is mediated by a W plus boson from electron to proton", rationale: "An electron emitting W⁺ would require a −2 charged outgoing lepton, violating charge conservation." },
        { text: "This electron–proton collision is mediated by a virtual photon from electron to proton", rationale: "A virtual photon cannot convert a proton into a neutron." },
        { text: "This electron–proton collision is mediated by a gluon from proton to electron", rationale: "Electrons do not participate in strong gluon exchange." },
      ],
      note: "Because the electron vertex is earlier ($e^- \\to \\nu_e + W^-$), a W minus boson travels from electron to proton.",
      diff: "higher",
    },
    {
      slug: "feyn-em-repulsion",
      mode: "em-repulsion",
      targetKey: "exchangeBoson",
      hidden: ["exchangeBoson", "interactionType"],
      stem: "Two electrons approach and deflect away from one another as shown in the Feynman diagram. Which exchange particle mediates this interaction?",
      prefix: "Electromagnetic repulsion between electrons is mediated by a",
      distractors: [
        { text: "Electromagnetic repulsion between electrons is mediated by a W minus boson", rationale: "W bosons mediate weak flavour-changing interactions, not electromagnetic repulsion." },
        { text: "Electromagnetic repulsion between electrons is mediated by a positive pion", rationale: "Electrons are leptons and do not feel the strong nuclear force." },
        { text: "Electromagnetic repulsion between electrons is mediated by an electron neutrino", rationale: "Neutrinos are matter leptons, not exchange bosons." },
      ],
      note: "Electromagnetic forces between charged particles are mediated by a virtual photon.",
      diff: "foundation",
    },
    {
      slug: "feyn-quark-bm",
      mode: "quark-beta-minus",
      targetKey: "quarkFlavourChange",
      hidden: ["quarkFlavourChange"],
      stem: "Which quark flavour transformation occurs at the left-hand vertex of the Feynman diagram for $\\beta^-$ decay?",
      prefix: "Inside the decaying neutron, a",
      distractors: [
        { text: "Inside the decaying neutron, an up quark changes to down quark", rationale: "Describes beta-plus decay or electron capture (p → n), not beta-minus decay." },
        { text: "Inside the decaying neutron, a strange quark changes to up quark", rationale: "Neutrons (udd) contain no strange quarks." },
        { text: "Inside the decaying neutron, no quark flavour change occurs", rationale: "Converting udd into uud requires a weak quark-flavour change." },
      ],
      note: "Neutron ($udd$) becomes proton ($uud$), so a down quark changes to up quark.",
      diff: "standard",
    },
    {
      slug: "feyn-quark-bp",
      mode: "quark-beta-plus",
      targetKey: "quarkFlavourChange",
      hidden: ["quarkFlavourChange"],
      stem: "Which quark flavour transformation underlies both $\\beta^+$ decay and electron capture in a proton-rich nucleus?",
      prefix: "In both weak processes, an",
      distractors: [
        { text: "In both weak processes, a down quark changes to up quark", rationale: "Converts a neutron to a proton (beta-minus), the reverse of proton-to-neutron conversion." },
        { text: "In both weak processes, an up quark annihilates with an orbital electron",
        rationale: "Electrons are leptons, not antiquarks, so they cannot annihilate quarks.",
      },
        { text: "In both weak processes, a strange quark changes to down quark", rationale: "Protons (uud) contain only up and down valence quarks." },
      ],
      note: "Proton ($uud$) becomes neutron ($udd$), so an up quark changes to down quark.",
      diff: "standard",
    },
  ];

  for (const cfg of qualConfigs) {
    addQualMcq(ctx, {
      slug: cfg.slug,
      domain: "quantum-nuclear",
      kind,
      conceptId: "fundamental-particles-quarks-leptons",
      syllabi: TAG_321,
      difficulty: cfg.diff,
      scenarioSpec: { kind, interactionMode: cfg.mode },
      targetQuantityKey: cfg.targetKey,
      hiddenQuantities: cfg.hidden,
      stem: cfg.stem,
      correctPrefix: cfg.prefix,
      distractors: cfg.distractors,
      workedNote: cfg.note,
    });
  }

  // 4 Structured Questions on Feynman diagrams
  const feynStructs: Array<{
    slug: string;
    mode: FeynmanInteractionMode;
    stem: string;
    partAPrompt: string;
    partBPrompt: string;
    partCKey: "missingProduct" | "vertexChargeCheck";
    partCPrompt: string;
  }> = [
    {
      slug: "feyn-struct-ec",
      mode: "electron-capture",
      stem: "The incomplete upward-time Feynman diagram represents electron capture by a proton in a potassium-40 nucleus.",
      partAPrompt: "Identify the exchange particle and its direction of travel between the two vertices.",
      partBPrompt: "State the quark flavour transformation that takes place inside the proton.",
      partCKey: "missingProduct",
      partCPrompt: "Identify the unlabelled outgoing particle $X$ and verify lepton number conservation.",
    },
    {
      slug: "feyn-struct-ep-coll",
      mode: "electron-proton-collision",
      stem: "A beam of fast electrons collides with stationary protons, producing a weak interaction represented by the Feynman diagram.",
      partAPrompt: "Name the exchange boson and state which particle emits it in this diagram.",
      partBPrompt: "State the quark flavour change occurring at the right-hand hadron vertex.",
      partCKey: "missingProduct",
      partCPrompt: "Identify the outgoing baryon $X$ and confirm electric charge conservation at both vertices.",
    },
    {
      slug: "feyn-struct-bm",
      mode: "beta-minus",
      stem: "A neutron inside a carbon-14 nucleus undergoes $\\beta^-$ decay as shown in the Feynman diagram.",
      partAPrompt: "Identify the exchange boson and the fundamental interaction responsible.",
      partBPrompt: "Write the quark composition before and after the decay, stating the quark flavour change.",
      partCKey: "missingProduct",
      partCPrompt: "Identify particle $Y$ and explain why it must be an antiparticle.",
    },
    {
      slug: "feyn-struct-bp",
      mode: "beta-plus",
      stem: "Fluorine-18 decays by $\\beta^+$ emission in medical imaging. Refer to the upward-time Feynman diagram.",
      partAPrompt: "Name the exchange boson mediating this decay and confirm charge conservation at the left vertex.",
      partBPrompt: "State the quark flavour change converting the proton into a neutron.",
      partCKey: "missingProduct",
      partCPrompt: "Identify particle $Y$ and explain how electron lepton number is conserved.",
    },
  ];

  for (const s of feynStructs) {
    const q = solveKind(kind, { kind, interactionMode: s.mode });
    addStructured(ctx, {
      slug: s.slug,
      domain: "quantum-nuclear",
      kind,
      conceptId: "fundamental-particles-quarks-leptons",
      syllabi: TAG_321,
      difficulty: "standard",
      questionStyle: "qualitative",
      targetMode: "qualitative",
      scenarioSpec: { kind, interactionMode: s.mode },
      hiddenQuantities: ["exchangeBoson", "missingProduct", "quarkFlavourChange", "interactionType"],
      requiredGivens: [],
      stem: s.stem,
      parts: [
        {
          partId: "a",
          prompt: s.partAPrompt,
          marks: 2,
          targetMode: "qualitative",
          targetQuantityKey: "exchangeBoson",
          expectedAnswer: `${strVal(q, "exchangeBoson")} mediating the ${strVal(q, "interactionType")}`,
          workingSteps: [
            `Check charge balance at each vertex: ${strVal(q, "vertexChargeCheck")}.`,
            `Identify ${strVal(q, "exchangeBoson")} (must specify boson, never meson).`,
          ],
        },
        {
          partId: "b",
          prompt: s.partBPrompt,
          marks: 1,
          targetMode: "qualitative",
          targetQuantityKey: "quarkFlavourChange",
          expectedAnswer: strVal(q, "quarkFlavourChange"),
          workingSteps: [`Match baryon quark compositions ($p = uud$, $n = udd$): ${strVal(q, "quarkFlavourChange")}.`],
        },
        {
          partId: "c",
          prompt: s.partCPrompt,
          marks: 2,
          targetMode: "qualitative",
          targetQuantityKey: s.partCKey,
          expectedAnswer: `The outgoing particle is the ${strVal(q, s.partCKey)}, conserving charge and electron lepton number ($L_e$).`,
          workingSteps: [
            `Identify outgoing particle as ${strVal(q, s.partCKey)}.`,
            "Verify total charge and electron lepton number before and after the vertex.",
          ],
        },
      ],
      workedSolution: `(a) ${strVal(q, "exchangeBoson")} (${strVal(q, "interactionType")}); ${strVal(q, "vertexChargeCheck")}. (b) ${strVal(q, "quarkFlavourChange")}. (c) ${strVal(q, s.partCKey)}, conserving $Q$ and $L_e$.`,
      markScheme: [
        { code: "B1", criterion: `Identify ${strVal(q, "exchangeBoson")} (reject bare 'W' or 'W meson').`, marks: 1, partId: "a" },
        { code: "B1", criterion: `Confirm ${strVal(q, "interactionType")} / vertex charge conservation.`, marks: 1, partId: "a" },
        { code: "B1", criterion: `State ${strVal(q, "quarkFlavourChange")}.`, marks: 1, partId: "b" },
        { code: "B1", criterion: `Identify outgoing particle as ${strVal(q, s.partCKey)}.`, marks: 1, partId: "c" },
        { code: "B1", criterion: "Show explicit conservation of electron lepton number and electric charge.", marks: 1, partId: "c" },
      ],
      subpartStrategy: [
        "Deduce weak exchange boson sign and direction from vertex charge balance.",
        "State quark flavour transformation between u and d quarks.",
        "Identify missing reaction product using lepton and charge conservation.",
      ],
    });
  }
}

/* -------------------------------------------------------------------------- */
/*  FAMILY 6: al-as-hadron-lepton-conservation (12 items: 7Q + 1C + 4 Struct) */
/* -------------------------------------------------------------------------- */

function buildFamily6HadronLepton(ctx: BuilderContext): void {
  const kind = "al-as-hadron-lepton-conservation" as const;

  const qualRows: Array<{
    slug: string;
    reactionId: ReactionId;
    targetKey: "violatedLaw" | "interactionClass" | "missingParticle" | "particleClassSummary";
    hidden: string[];
    stem: string;
    prefix: string;
    distractors: readonly [VerbalDistractor, VerbalDistractor, VerbalDistractor];
    note: string;
    diff: QuestionDifficulty;
  }> = [
    {
      slug: "hl-strong-pair-missing",
      reactionId: "strong-strange-pair",
      targetKey: "missingParticle",
      hidden: ["missingParticle", "missingQuarks"],
      stem: "In the strong interaction $\\pi^- + p \\to X + \\Lambda^0$, the $\\Lambda^0$ baryon has strangeness $S = -1$. Using the conservation ledger, identify particle $X$.",
      prefix: "To conserve charge, baryon number, and strangeness, X must be a",
      distractors: [
        { text: "To conserve charge, baryon number, and strangeness, X must be a negative kaon", rationale: "K⁻ has Q = −1 and S = −1, violating both charge and strangeness conservation." },
        { text: "To conserve charge, baryon number, and strangeness, X must be a neutral pion", rationale: "π⁰ has S = 0, which leaves ΔS = −1 and violates strangeness conservation in a strong interaction." },
        { text: "To conserve charge, baryon number, and strangeness, X must be a neutron", rationale: "Adding a second baryon gives B = +2 on the right instead of B = +1." },
      ],
      note: "With $\\pi^-$ ($Q=-1, B=0, S=0$) + $p$ ($Q=+1, B=+1, S=0$) and $\\Lambda^0$ ($Q=0, B=+1, S=-1$), $X$ requires $Q=0, B=0, S=+1$, which is a neutral kaon ($K^0$).",
      diff: "standard",
    },
    {
      slug: "hl-weak-kaon-interaction",
      reactionId: "weak-kaon-pion-decay",
      targetKey: "interactionClass",
      hidden: ["interactionClass"],
      stem: "A negative kaon ($S = -1$) decays into two pions ($S = 0$): $K^- \\to \\pi^- + \\pi^0$. Which interaction must be responsible for this decay?",
      prefix: "This decay proceeds via the",
      distractors: [
        { text: "This decay proceeds via the strong interaction conserving strangeness", rationale: "Strangeness changes from −1 to 0, which is forbidden in the strong interaction." },
        { text: "This decay proceeds via the electromagnetic interaction because pions are charged", rationale: "Electromagnetic interactions also strictly conserve strangeness (ΔS = 0)." },
        { text: "This decay proceeds via a forbidden interaction because strangeness must never change", rationale: "Weak interactions allow strangeness to change by 0 or ±1." },
      ],
      note: "Because strangeness changes ($\\Delta S = +1$) while $Q$ and $B$ are conserved, this must be a weak interaction because strangeness changes (AQA requires stating explicitly that strangeness changes here).",
      diff: "standard",
    },
    {
      slug: "hl-muon-decay-missing",
      reactionId: "weak-muon-decay",
      targetKey: "missingParticle",
      hidden: ["missingParticle"],
      stem: "A negative muon decays via the weak interaction: $\\mu^- \\to e^- + X + \\nu_\\mu$. Which particle is $X$?",
      prefix: "Conserving both electron and muon lepton numbers separately requires X to be an",
      distractors: [
        { text: "Conserving both electron and muon lepton numbers separately requires X to be an electron neutrino", rationale: "Produces L_e = +2 on the right side instead of 0." },
        { text: "Conserving both electron and muon lepton numbers separately requires X to be a muon antineutrino", rationale: "Cancels L_μ to 0 on the right while leaving L_e = +1 unconserved." },
        { text: "Conserving both electron and muon lepton numbers separately requires X to be a gamma photon", rationale: "A photon has L_e = 0, failing to balance the electron's L_e = +1." },
      ],
      note: "$\\mu^-$ has $L_\\mu = +1, L_e = 0$; $e^-$ has $L_e = +1$ and $\\nu_\\mu$ has $L_\\mu = +1$, so $X$ must carry $L_e = -1$ and $Q = 0$: an electron antineutrino.",
      diff: "standard",
    },
    {
      slug: "hl-forbidden-baryon",
      reactionId: "forbidden-baryon",
      targetKey: "violatedLaw",
      hidden: ["violatedLaw", "isAllowed"],
      stem: "A student proposes the high-energy strong collision $p + p \\to p + \\pi^+ + \\pi^0$. Which conservation law is violated by this reaction?",
      prefix: "This reaction is impossible because it violates",
      distractors: [
        { text: "This reaction is impossible because it violates charge conservation", rationale: "Total charge is +2 on both sides (+1+1 = +1+1+0)." },
        { text: "This reaction is impossible because it violates lepton number conservation", rationale: "No leptons are present on either side (L = 0 before and after)." },
        { text: "This reaction is impossible because it violates strangeness conservation in a strong interaction", rationale: "Protons and pions all have strangeness S = 0." },
      ],
      note: "Baryon number before is $1 + 1 = +2$, while after is $1 + 0 + 0 = +1$, violating baryon number conservation.",
      diff: "foundation",
    },
    {
      slug: "hl-forbidden-lepton-flavour",
      reactionId: "forbidden-lepton-flavour",
      targetKey: "violatedLaw",
      hidden: ["violatedLaw", "isAllowed"],
      stem: "Why has the radiative muon decay $\\mu^- \\to e^- + \\gamma$ never been observed even though it conserves electric charge, baryon number, and energy?",
      prefix: "The decay is forbidden because it violates",
      distractors: [
        { text: "The decay is forbidden because it violates baryon number conservation", rationale: "Both μ⁻ and e⁻ are leptons with B = 0." },
        { text: "The decay is forbidden because it violates strangeness conservation in a strong interaction", rationale: "Neither leptons nor photons carry strangeness." },
        { text: "The decay is forbidden because it violates charge conservation", rationale: "Charge is −1 on both sides." },
      ],
      note: "Before: $L_\\mu = +1, L_e = 0$; after: $L_\\mu = 0, L_e = +1$. Electron and muon lepton numbers are conserved separately, so lepton number conservation is violated.",
      diff: "higher",
    },
    {
      slug: "hl-baryon-stability",
      reactionId: "classification-baryon-meson",
      targetKey: "particleClassSummary",
      hidden: ["particleClassSummary"],
      stem: "Referring to the subatomic particle classification chart, which statement about baryons is correct?",
      prefix: "According to the Standard Model taught at A-Level, the",
      distractors: [
        { text: "According to the Standard Model taught at A-Level, the neutron is the only stable free baryon composed of two quarks", rationale: "Free neutrons beta-decay with a ~10 min half-life, and baryons contain three quarks (qqq), not two." },
        { text: "According to the Standard Model taught at A-Level, the positive pion is the lightest stable baryon", rationale: "Pions are mesons (qq̄) with baryon number B = 0, not baryons." },
        { text: "According to the Standard Model taught at A-Level, the muon is a heavy baryon that decays into a proton", rationale: "Muons are fundamental leptons (B = 0) and decay into electrons plus neutrinos." },
      ],
      note: "Every free baryon eventually decays into a proton; the proton is the only stable free baryon composed of three quarks ($uud$).",
      diff: "foundation",
    },
    {
      slug: "hl-lepton-hadron-distinction",
      reactionId: "classification-lepton-hadron",
      targetKey: "particleClassSummary",
      hidden: ["particleClassSummary"],
      stem: "What is the fundamental physical difference between hadrons and leptons shown in the particle classification tree?",
      prefix: "In particle classification,",
      distractors: [
        { text: "In particle classification, leptons are composed of quark–antiquark pairs while hadrons are indivisible", rationale: "Reverses the definitions: mesons are qq̄ hadrons, while leptons are fundamental." },
        { text: "In particle classification, leptons feel the strong nuclear force whereas hadrons interact only via gravity", rationale: "Hadrons experience the strong nuclear force; leptons do not." },
        { text: "In particle classification, all leptons are electrically neutral whereas all hadrons carry charge", rationale: "Electrons and muons are charged leptons, while neutrons and π⁰ are neutral hadrons." },
      ],
      note: "Leptons are fundamental particles that do not experience the strong nuclear force, whereas hadrons are composite quark states that feel the strong force.",
      diff: "foundation",
    },
  ];

  for (const r of qualRows) {
    addQualMcq(ctx, {
      slug: r.slug,
      domain: "quantum-nuclear",
      kind,
      conceptId: "fundamental-particles-quarks-leptons",
      syllabi: TAG_321,
      difficulty: r.diff,
      scenarioSpec: { kind, reactionId: r.reactionId },
      targetQuantityKey: r.targetKey,
      hiddenQuantities: r.hidden,
      stem: r.stem,
      correctPrefix: r.prefix,
      distractors: r.distractors,
      workedNote: r.note,
    });
  }

  // 1 Quantitative MCQ (deltaS calculation on weak kaon decay)
  const kDecaySpec = { kind, reactionId: "weak-kaon-pion-decay" as const };
  addNumMcq(ctx, {
    slug: "hl-calc-delta-s",
    domain: "quantum-nuclear",
    kind,
    conceptId: "fundamental-particles-quarks-leptons",
    syllabi: TAG_321,
    difficulty: "standard",
    scenarioSpec: kDecaySpec,
    targetQuantityKey: "deltaS",
    hiddenQuantities: ["deltaS", "interactionClass"],
    requiredGivens: [],
    stem: "A negative kaon ($K^-$, quark composition $s\\bar{u}$, strangeness $S = -1$) decays into two pions: $K^- \\to \\pi^- + \\pi^0$. Calculate the change in strangeness $\\Delta S = S_{\\text{after}} - S_{\\text{before}}$.",
    distractors: [
      { value: -1, rationale: "Subtracts in the wrong order ($S_{\\text{before}} - S_{\\text{after}}$)." },
      { value: 2, rationale: "Assumes both pions carry strangeness +1, whereas pions are non-strange (S = 0)." },
      { value: -2, rationale: "Assigns strangeness −1 to each pion." },
    ],
    workedSolution:
      "Before decay $S = -1$ ($K^-$); after decay $S = 0 + 0 = 0$ ($\\pi^-$ and $\\pi^0$). Thus $\\Delta S = 0 - (-1) = +1.00$.",
    markCriterion: "Change in strangeness $\\Delta S = +1$",
  });

  // 4 Structured Questions
  const hlStructs: Array<{
    slug: string;
    reactionId: ReactionId;
    stem: string;
    partAPrompt: string;
    partAKey: "violatedLaw" | "missingParticle" | "interactionClass";
    partBPrompt: string;
    partBKey: "interactionClass" | "particleClassSummary" | "missingQuarks";
  }> = [
    {
      slug: "hl-struct-strong-pair",
      reactionId: "strong-strange-pair",
      stem: "A negative pion collides with a proton in a strong interaction: $\\pi^- + p \\to X + \\Lambda^0$, where $\\Lambda^0$ is a strange baryon ($uds$, $S = -1$).",
      partAPrompt: "Apply conservation of $Q$, $B$, and $S$ to determine the quantum numbers and identity of particle $X$.",
      partAKey: "missingParticle",
      partBPrompt: "State the quark composition of $X$ and explain why strange particles are produced in pairs in strong interactions.",
      partBKey: "missingQuarks",
    },
    {
      slug: "hl-struct-kaon-muon",
      reactionId: "weak-kaon-muon-decay",
      stem: "A positive kaon ($K^+$, $u\\bar{s}$, $S = +1$) decays via the reaction $K^+ \\to \\mu^+ + X$.",
      partAPrompt: "Deduce the identity of particle $X$ using charge and muon lepton number conservation.",
      partAKey: "missingParticle",
      partBPrompt: "Deduce which fundamental interaction governs this decay, justifying your answer explicitly using strangeness.",
      partBKey: "interactionClass",
    },
    {
      slug: "hl-struct-forbid-strong-s",
      reactionId: "forbidden-strong-strangeness",
      stem: "A student claims that the strong interaction $\\pi^- + p \\to \\pi^0 + \\Lambda^0$ can occur when high-energy pions strike liquid hydrogen.",
      partAPrompt: "Test conservation of charge, baryon number, and strangeness to determine which conservation law is violated.",
      partAKey: "violatedLaw",
      partBPrompt: "Explain what change to the products would allow this strong interaction to conserve strangeness.",
      partBKey: "particleClassSummary",
    },
    {
      slug: "hl-struct-forbid-charge",
      reactionId: "forbidden-charge",
      stem: "Consider the proposed nuclear decay equation $n \\to p + e^+ + \\nu_e$.",
      partAPrompt: "Check $Q$, $B$, and $L_e$ before and after to identify the conservation law violated.",
      partAKey: "violatedLaw",
      partBPrompt: "State the corrected decay products for a free neutron and explain why both $Q$ and $L_e$ are then conserved.",
      partBKey: "particleClassSummary",
    },
  ];

  for (const s of hlStructs) {
    const q = solveKind(kind, { kind, reactionId: s.reactionId });
    addStructured(ctx, {
      slug: s.slug,
      domain: "quantum-nuclear",
      kind,
      conceptId: "fundamental-particles-quarks-leptons",
      syllabi: TAG_321,
      difficulty: "standard",
      questionStyle: "qualitative",
      targetMode: "qualitative",
      scenarioSpec: { kind, reactionId: s.reactionId },
      hiddenQuantities: [s.partAKey, s.partBKey, "isAllowed"],
      requiredGivens: [],
      stem: s.stem,
      parts: [
        {
          partId: "a",
          prompt: s.partAPrompt,
          marks: 3,
          targetMode: "qualitative",
          targetQuantityKey: s.partAKey,
          expectedAnswer: `Applying the conservation ledger identifies ${strVal(q, s.partAKey)}.`,
          workingSteps: [
            "Tabulate charge Q and baryon number B on both sides.",
            "Tabulate lepton numbers and strangeness S on both sides.",
            `Conclude: ${strVal(q, s.partAKey)}.`,
          ],
        },
        {
          partId: "b",
          prompt: s.partBPrompt,
          marks: 2,
          dependsOnPartIds: ["a"],
          targetMode: "qualitative",
          targetQuantityKey: s.partBKey,
          expectedAnswer: `Consistent with AQA quark/conservation rules: ${strVal(q, s.partBKey)}.`,
          workingSteps: [
            `Apply strong vs weak strangeness rule: ${strVal(q, s.partBKey)}.`,
          ],
        },
      ],
      workedSolution: `(a) Checking $Q, B, L_e, L_\\mu, S$ gives ${strVal(q, s.partAKey)}. (b) ${strVal(q, s.partBKey)}.`,
      markScheme: [
        { code: "B1", criterion: "Correctly evaluate charge Q and baryon number B on both sides.", marks: 1, partId: "a" },
        { code: "B1", criterion: "Correctly evaluate lepton numbers / strangeness S on both sides.", marks: 1, partId: "a" },
        { code: "B1", criterion: `State ${strVal(q, s.partAKey)}.`, marks: 1, partId: "a" },
        { code: "B1", criterion: `State ${strVal(q, s.partBKey)}.`, marks: 1, partId: "b" },
        { code: "B1", criterion: "Explicitly link strangeness conservation (ΔS = 0 strong) vs strangeness change (ΔS = 0, ±1 weak).", marks: 1, partId: "b" },
      ],
      subpartStrategy: [
        "Evaluate quantum number conservation ledger across reactants and products.",
        "Justify quark composition or interaction class via strong/weak strangeness rules.",
      ],
    });
  }
}

/* -------------------------------------------------------------------------- */
/*  FAMILY 7: al-as-photoelectric-wave-failure (12 items: 6Q + 2C + 4 [2 LoR])*/
/* -------------------------------------------------------------------------- */

function buildFamily7Photoelectric(ctx: BuilderContext): void {
  const kind = "al-as-photoelectric-wave-failure" as const;

  // 6 Pure Qualitative MCQs
  addQualMcq(ctx, {
    slug: "pe-electroscope-neg-uv",
    domain: "quantum-nuclear",
    kind,
    conceptId: "photoelectric-effect",
    syllabi: TAG_322,
    difficulty: "foundation",
    scenarioSpec: {
      kind,
      visualMode: "electroscope",
      metalName: "zinc",
      workFunctionEv: 4.3,
      incidentFrequencyTHz: 1300,
      platePolarity: "negative",
      radiationBand: "uv",
    },
    targetQuantityKey: "electroscopeOutcome",
    hiddenQuantities: ["electroscopeOutcome"],
    stem: "Ultraviolet radiation of frequency above the threshold frequency illuminates a clean, negatively charged zinc plate mounted on a gold-leaf electroscope. What is observed and why?",
    correctPrefix: "Immediately upon illumination, the",
    distractors: [
      {
        text: "Immediately upon illumination, the gold leaf rises further as ultraviolet photons donate negative charge to the gold leaf",
        rationale: "Photons are uncharged; UV releases electrons from the zinc plate, reducing negative charge.",
      },
      {
        text: "Immediately upon illumination, the gold leaf falls because electrons are ejected directly from the gold leaf inside the case",
        rationale: "AQA explicitly rejects electrons emitted 'from the gold leaf'; emission occurs from the zinc plate.",
      },
      {
        text: "Immediately upon illumination, the gold leaf waits several minutes to accumulate wave energy before falling",
        rationale: "Photoelectric emission is instantaneous above threshold frequency, contradicting the classical wave model.",
      },
    ],
    workedNote:
      "Because $f > f_0$ on a negatively charged plate, electrons escape from the zinc plate surface and the gold leaf falls rapidly.",
  });

  addQualMcq(ctx, {
    slug: "pe-electroscope-pos-uv",
    domain: "quantum-nuclear",
    kind,
    conceptId: "photoelectric-effect",
    syllabi: TAG_322,
    difficulty: "standard",
    scenarioSpec: {
      kind,
      visualMode: "electroscope",
      metalName: "zinc",
      workFunctionEv: 4.3,
      incidentFrequencyTHz: 1300,
      platePolarity: "positive",
      radiationBand: "uv",
    },
    targetQuantityKey: "electroscopeOutcome",
    hiddenQuantities: ["electroscopeOutcome"],
    stem: "The clean zinc plate on the gold-leaf electroscope is now charged positively and illuminated with the same ultraviolet source above threshold frequency. What happens to the gold leaf?",
    correctPrefix: "When the plate is positively charged, the",
    distractors: [
      {
        text: "When the plate is positively charged, the gold leaf falls at the same rate because protons are emitted from the plate",
        rationale: "Ultraviolet photons have far too little energy to eject tightly bound nuclear protons.",
      },
      {
        text: "When the plate is positively charged, the gold leaf falls faster because positive charge assists electron escape",
        rationale: "A positive plate attracts negative electrons back rather than repelling them away.",
      },
      {
        text: "When the plate is positively charged, the gold leaf collapses only if ultraviolet intensity is doubled",
        rationale: "Electrostatic attraction pulls freed electrons back onto the positive plate regardless of intensity.",
      },
    ],
    workedNote:
      "Any electron liberated at the surface is immediately attracted back to the positively charged zinc plate, so the leaf stays deflected.",
  });

  addQualMcq(ctx, {
    slug: "pe-electroscope-visible",
    domain: "quantum-nuclear",
    kind,
    conceptId: "photoelectric-effect",
    syllabi: TAG_322,
    difficulty: "foundation",
    scenarioSpec: {
      kind,
      visualMode: "electroscope",
      metalName: "zinc",
      workFunctionEv: 4.3,
      incidentFrequencyTHz: 600,
      platePolarity: "negative",
      radiationBand: "visible",
    },
    targetQuantityKey: "electroscopeOutcome",
    hiddenQuantities: ["electroscopeOutcome"],
    stem: "A bright visible spotlight shines on the negatively charged clean zinc plate for several minutes. What is observed?",
    correctPrefix: "Even at very high brightness, the",
    distractors: [
      {
        text: "Even at very high brightness, the gold leaf eventually falls once surface electrons absorb multiple visible photons together",
        rationale: "Photoelectric absorption is a one-to-one photon-electron interaction; electrons do not accumulate energy over time.",
      },
      {
        text: "Even at very high brightness, the gold leaf falls immediately at a slower rate than under ultraviolet",
        rationale: "No electrons are emitted at all when photon energy hf is below the work function φ.",
      },
      {
        text: "Even at very high brightness, the gold leaf rises higher due to radiation pressure",
        rationale: "Visible light neither charges the plate nor discharges it below f₀.",
      },
    ],
    workedNote:
      "Visible photon energy is smaller than zinc's work function ($f < f_0$), so no photoelectrons are emitted and the leaf stays deflected.",
  });

  addQualMcq(ctx, {
    slug: "pe-intensity-vs-freq",
    domain: "quantum-nuclear",
    kind,
    conceptId: "photoelectric-effect",
    syllabi: TAG_322,
    difficulty: "standard",
    scenarioSpec: {
      kind,
      visualMode: "iv-stopping",
      metalName: "caesium",
      workFunctionEv: 2.1,
      incidentFrequencyTHz: 950,
    },
    targetQuantityKey: "intensityVsFreqEffect",
    hiddenQuantities: ["intensityVsFreqEffect", "stoppingPotentialV"],
    stem: "Monochromatic light above threshold frequency strikes a photocathode, producing curve Q on the $I\\text{–}V$ graph. The light intensity is increased at constant frequency to produce curve P. Which statement describes the resulting changes?",
    correctPrefix: "At constant frequency above threshold,",
    distractors: [
      {
        text: "At constant frequency above threshold, doubling intensity doubles both photocurrent and stopping potential",
        rationale: "Classic AQA trap: intensity changes photon arrival rate (current), NOT individual photon energy hf or stopping potential Vs.",
      },
      {
        text: "At constant frequency above threshold, photocurrent stays constant while stopping potential increases",
        rationale: "Confuses increasing intensity with increasing frequency at constant photon arrival rate.",
      },
      {
        text: "At constant frequency above threshold, both photocurrent and stopping potential remain completely unchanged",
        rationale: "Higher intensity delivers more photons per second, liberating more photoelectrons per second.",
      },
    ],
    workedNote:
      "More photons per second liberate more electrons per second (higher saturation photocurrent), while $eV_{\\text{s}} = hf - \\phi$ is unchanged at fixed frequency.",
  });

  addQualMcq(ctx, {
    slug: "pe-ek-graph-gradient",
    domain: "quantum-nuclear",
    kind,
    conceptId: "photoelectric-effect",
    syllabi: TAG_322,
    difficulty: "foundation",
    scenarioSpec: {
      kind,
      visualMode: "ek-vs-f",
      metalName: "zinc",
      workFunctionEv: 4.3,
      secondMetalWorkFunctionEv: 2.3,
      incidentFrequencyTHz: 1400,
    },
    targetQuantityKey: "graphGradientMeaning",
    hiddenQuantities: ["graphGradientMeaning", "thresholdFrequencyHz", "workFunctionJ"],
    stem: "The graph shows maximum photoelectron kinetic energy $E_{\\text{k(max)}}$ plotted against incident frequency $f$ for two different clean metals A and B. Why are the two straight lines parallel?",
    correctPrefix: "The lines have identical slope because the",
    distractors: [
      {
        text: "The lines have identical slope because the gradient equals the work function of each metal",
        rationale: "Work function is the magnitude of the negative vertical intercept (−φ), not the gradient.",
      },
      {
        text: "The lines have identical slope because the gradient equals the elementary charge divided by Planck constant",
        rationale: "Inverts h/e; on an Ek(max)–f graph the gradient is h (and on a Vs–f graph it is h/e).",
      },
      {
        text: "The lines have identical slope because both metals share the same threshold frequency",
        rationale: "The horizontal intercepts f₀A and f₀B are distinct because the metals have different work functions.",
      },
    ],
    workedNote:
      "Rearranging $E_{\\text{k(max)}} = hf - \\phi$ shows the gradient equals the Planck constant $h$ for every metal surface.",
  });

  addQualMcq(ctx, {
    slug: "pe-work-function-def",
    domain: "quantum-nuclear",
    kind,
    conceptId: "photoelectric-effect",
    syllabi: TAG_322,
    difficulty: "foundation",
    questionStyle: "definition",
    scenarioSpec: {
      kind,
      visualMode: "ek-vs-f",
      metalName: "sodium",
      workFunctionEv: 2.3,
      incidentFrequencyTHz: 900,
    },
    targetQuantityKey: "workFunctionDefinition",
    hiddenQuantities: ["workFunctionDefinition"],
    stem: "Which statement is the exact AQA definition of the work function $\\phi$ of a metal?",
    correctPrefix: "Work function is the",
    distractors: [
      {
        text: "Work function is the average energy needed to ionise a free gas atom in the metal vapour",
        rationale: "Confuses surface work function of a solid metal with atomic ionisation energy.",
      },
      {
        text: "Work function is the maximum kinetic energy carried by an emitted photoelectron",
        rationale: "Confuses φ with Ek(max) = hf − φ.",
      },
      {
        text: "Work function is the energy needed to remove any deep inner-shell electron from an atom",
        rationale: "Must specify minimum energy to remove an electron from the metal surface.",
      },
    ],
    workedNote:
      "AQA requires both 'minimum energy' and 'metal surface': minimum energy required to remove an electron from the metal surface.",
  });

  // 2 Quantitative MCQs
  const peC1Spec = {
    kind,
    visualMode: "ek-vs-f",
    metalName: "potassium",
    workFunctionEv: 2.3,
    incidentFrequencyTHz: 980,
  };
  const peC1 = solveKind(kind, peC1Spec);
  addNumMcq(ctx, {
    slug: "pe-calc-stopping-v",
    domain: "quantum-nuclear",
    kind,
    conceptId: "photoelectric-effect",
    syllabi: TAG_322,
    difficulty: "standard",
    scenarioSpec: peC1Spec,
    targetQuantityKey: "stoppingPotentialV",
    unit: "V",
    hiddenQuantities: ["stoppingPotentialV", "ekMaxJ", "ekMaxEv"],
    requiredGivens: [
      { name: "workFunctionEv", value: 2.3, unit: "eV", source: "stem" },
      { name: "incidentFrequencyTHz", value: 980, unit: "THz", source: "stem" },
    ],
    stem: "Monochromatic radiation of frequency $980\\text{ THz}$ illuminates a potassium surface of work function $2.30\\text{ eV}$. Using $h = 6.63 \\times 10^{-34}\\text{ J s}$ and $e = 1.60 \\times 10^{-19}\\text{ C}$, calculate the stopping potential $V_{\\text{s}}$.",
    distractors: [
      { value: numVal(peC1, "photonEnergyEv"), rationale: "Forgets to subtract the work function φ from photon energy hf." },
      { value: numVal(peC1, "photonEnergyEv") + 2.3, rationale: "Adds the work function instead of subtracting it." },
      { value: numVal(peC1, "stoppingPotentialV") * 0.5, rationale: "Halves the stopping potential erroneously." },
    ],
    workedSolution: `Photon energy $E = hf/e = (6.63 \\times 10^{-34} \\times 980 \\times 10^{12}) / 1.60 \\times 10^{-19} = ${fmtSig(numVal(peC1, "photonEnergyEv"), 3, "eV")}$, so $V_{\\text{s}} = (hf - \\phi)/e = ${fmtSig(numVal(peC1, "stoppingPotentialV"), 3, "V")}$.`,
    markCriterion: `Stopping potential $V_{\\text{s}} = ${fmtSig(numVal(peC1, "stoppingPotentialV"), 3, "V")}$`,
  });

  const peC2Spec = {
    kind,
    visualMode: "ek-vs-f",
    metalName: "zinc",
    workFunctionEv: 4.3,
    incidentFrequencyTHz: 1450,
  };
  const peC2 = solveKind(kind, peC2Spec);
  addNumMcq(ctx, {
    slug: "pe-calc-threshold-f",
    domain: "quantum-nuclear",
    kind,
    conceptId: "photoelectric-effect",
    syllabi: TAG_322,
    difficulty: "foundation",
    scenarioSpec: peC2Spec,
    targetQuantityKey: "thresholdFrequencyHz",
    unit: "Hz",
    hiddenQuantities: ["thresholdFrequencyHz", "thresholdFrequencyTHz"],
    requiredGivens: [{ name: "workFunctionEv", value: 4.3, unit: "eV", source: "stem" }],
    stem: "Clean zinc has a work function of $4.30\\text{ eV}$. Using $h = 6.63 \\times 10^{-34}\\text{ J s}$ and $e = 1.60 \\times 10^{-19}\\text{ C}$, calculate the threshold frequency $f_0$ of zinc.",
    distractors: [
      { value: 4.3 / AQA_H_JS, rationale: "Forgets to convert work function from eV into joules before dividing by h." },
      { value: numVal(peC2, "thresholdFrequencyHz") * 2, rationale: "Applies an extraneous factor of two." },
      { value: numVal(peC2, "thresholdFrequencyHz") * 0.5, rationale: "Halves the threshold frequency." },
    ],
    workedSolution: `$\\phi = 4.30 \\times 1.60 \\times 10^{-19} = 6.88 \\times 10^{-19}\\text{ J}$, giving $f_0 = \\phi/h = ${fmtSig(numVal(peC2, "thresholdFrequencyHz"), 3, "Hz")}$.`,
    markCriterion: `Threshold frequency $f_0 = ${fmtSig(numVal(peC2, "thresholdFrequencyHz"), 3, "Hz")}$`,
  });

  // 2 Authentic 6-Mark LoR (#2 Blueprint) + 2 Shorter Structured
  addStructured(ctx, {
    slug: "pe-lor-wave-failure-6m",
    domain: "quantum-nuclear",
    kind,
    conceptId: "photoelectric-effect",
    syllabi: TAG_322,
    difficulty: "higher",
    questionStyle: "qualitative",
    targetMode: "qualitative",
    scenarioSpec: {
      kind,
      visualMode: "electroscope",
      metalName: "zinc",
      workFunctionEv: 4.3,
      incidentFrequencyTHz: 1250,
      platePolarity: "negative",
      radiationBand: "uv",
    },
    hiddenQuantities: ["lorAnchor", "waveFailurePoint", "electroscopeOutcome", "intensityVsFreqEffect"],
    requiredGivens: [],
    stem: "A negatively charged clean zinc plate on a gold-leaf electroscope discharges instantly under dim ultraviolet light, yet remains charged indefinitely under intense visible light.",
    parts: [
      {
        partId: "a",
        prompt:
          "Explain why the classical wave theory of light fails to account for these photoelectric observations, and explain how Einstein's photon model accounts for threshold frequency, maximum photoelectron kinetic energy, and the effect of increasing intensity above threshold.",
        marks: 6,
        targetMode: "qualitative",
        targetQuantityKey: "lorAnchor",
        expectedAnswer:
          "Wave theory predicts continuous energy delivery spread across the wavefront so electrons should accumulate energy and escape at any frequency after a time delay, and maximum kinetic energy should rise with intensity—both contradicted by experiment. In the photon model, discrete photons interact one to one with surface electrons overcoming the work function: each photon carries $E = hf$, and a single electron absorbs all of one photon's energy instantly, escaping only if $hf \\ge \\phi$ (defining threshold frequency $f_0 = \\phi/h$). Excess energy gives $E_{\\text{k(max)}} = hf - \\phi = eV_{\\text{s}}$, depending solely on $f$ and $\\phi$, while higher intensity at $f \\ge f_0$ delivers more photons per second so more photoelectrons are emitted from the zinc plate per second and the leaf falls faster.",
        workingSteps: [
          "Area 1 (L1): Contrast wave prediction (emission at any f after delay; Ek increases with intensity) with observed threshold f₀ and instant emission.",
          "Area 2 (L2): State photon packets E = hf, one-to-one interaction, and surface work function threshold hf >= φ.",
          "Area 3 (L3): Link Ek(max) = hf − φ = eVs (must state 'maximum' KE) and explain higher intensity = more photons/s -> greater current / faster discharge from zinc plate.",
        ],
      },
    ],
    workedSolution:
      "Level 3 (5–6 marks): Explains why wave theory fails (predicts emission at any frequency with delay and intensity-dependent KE); states that discrete photons interact one to one with surface electrons overcoming the work function ($E = hf \\ge \\phi$); links $E_{\\text{k(max)}} = hf - \\phi = eV_{\\text{s}}$ and intensity = photon arrival rate (electrons emitted from zinc plate, never gold leaf).",
    markScheme: makeLorCriteria("a", [
      "L1 (Area 1): Wave theory predicts emission at any frequency once electrons gradually accumulate enough energy, contradicting the existence of threshold frequency f₀ and instantaneous emission.",
      "L1 (Area 1): Wave theory predicts photoelectron kinetic energy should increase with intensity, contradicting observation that Ek(max) depends on frequency.",
      "L2 (Area 2): Photon model states EM radiation consists of discrete packets (photons) of energy E = hf.",
      "L2 (Area 2): One-to-one interaction: a single surface electron absorbs all the energy of one single photon and escapes only if hf >= φ (work function).",
      "L3 (Area 3): Applies Ek(max) = hf − φ = eVs, explicitly stating maximum kinetic energy depends only on frequency and work function.",
      "L3 (Area 3): Explains that increasing intensity (for f >= f₀) increases number of photons arriving per second, emitting more photoelectrons per second from the zinc plate (reject 'from gold leaf') so photocurrent / rate of leaf fall increases.",
    ]),
    subpartStrategy: [
      "Six-mark Level of Response contrasting wave model failure with Einstein's one-to-one photon model.",
    ],
  });

  const peLorMixSpec = {
    kind,
    visualMode: "ek-vs-f",
    metalName: "magnesium",
    workFunctionEv: 3.68,
    secondMetalWorkFunctionEv: 2.28,
    incidentFrequencyTHz: 1180,
  };
  const peLorMixQ = solveKind(kind, peLorMixSpec);
  addStructured(ctx, {
    slug: "pe-lor-stopping-mix-9m",
    domain: "quantum-nuclear",
    kind,
    conceptId: "photoelectric-effect",
    syllabi: TAG_322,
    difficulty: "higher",
    questionStyle: "mixed-exam",
    targetMode: "quantitative",
    scenarioSpec: peLorMixSpec,
    hiddenQuantities: ["stoppingPotentialV", "ekMaxJ", "lorAnchor", "waveFailurePoint", "thresholdFrequencyHz"],
    requiredGivens: [
      { name: "workFunctionEv", value: 3.68, unit: "eV", source: "stem" },
      { name: "incidentFrequencyTHz", value: 1180, unit: "THz", source: "stem" },
    ],
    stem: "Ultraviolet radiation of frequency $1180\\text{ THz}$ strikes a clean magnesium cathode of work function $3.68\\text{ eV}$ in a vacuum photocell. Take $h = 6.63 \\times 10^{-34}\\text{ J s}$ and $e = 1.60 \\times 10^{-19}\\text{ C}$.",
    parts: [
      {
        partId: "a",
        prompt: "Calculate the maximum kinetic energy of emitted photoelectrons in joules and the stopping potential $V_{\\text{s}}$.",
        marks: 3,
        targetMode: "quantitative",
        targetQuantityKey: "stoppingPotentialV",
        expectedAnswer: `$E_{\\text{k(max)}} = ${fmtSig(numVal(peLorMixQ, "ekMaxJ"), 3, "J")}$, $V_{\\text{s}} = ${fmtSig(numVal(peLorMixQ, "stoppingPotentialV"), 3, "V")}$`,
        workingSteps: [
          `Compute $hf = 6.63 \\times 10^{-34} \\times 1.18 \\times 10^{15} = ${fmtSig(numVal(peLorMixQ, "photonEnergyJ"), 3, "J")}$.`,
          `Subtract $\\phi = 3.68 \\times 1.60 \\times 10^{-19} = ${fmtSig(numVal(peLorMixQ, "workFunctionJ"), 3, "J")}$ to get $E_{\\text{k(max)}} = ${fmtSig(numVal(peLorMixQ, "ekMaxJ"), 3, "J")}$.`,
          `Divide by $e$ to obtain $V_{\\text{s}} = ${fmtSig(numVal(peLorMixQ, "stoppingPotentialV"), 3, "V")}$.`,
        ],
      },
      {
        partId: "b",
        prompt:
          "Referring to the $E_{\\text{k(max)}}$ against $f$ graph for two different metals A and B, explain what the gradient and intercepts represent, why electrons are emitted with a range of kinetic energies up to $E_{\\text{k(max)}}$, and how doubling the light intensity affects both $V_{\\text{s}}$ and the photocurrent.",
        marks: 6,
        targetMode: "qualitative",
        targetQuantityKey: "lorAnchor",
        expectedAnswer:
          "From $E_{\\text{k(max)}} = hf - \\phi$, the gradient of both parallel lines equals the Planck constant $h$, the $x$-intercept is each metal's threshold frequency $f_0$, and the negative $y$-intercept is $-\\phi$. Discrete photons interact one to one with surface electrons overcoming the work function; electrons right at the surface require only the minimum energy $\\phi$ and leave with $E_{\\text{k(max)}} = eV_{\\text{s}}$, whereas deeper electrons lose extra energy reaching the surface so emerge with smaller kinetic energies. Doubling intensity at fixed frequency doubles the number of photons per second, doubling photocurrent while individual photon energy $hf$ and stopping potential $V_{\\text{s}}$ remain unchanged.",
        workingSteps: [
          "Area 1 (L1): Identify gradient h, x-intercept f₀, and y-intercept −φ from Ek(max) = hf − φ.",
          "Area 2 (L2): Explain one-to-one photon absorption and why surface electrons reach Ek(max) while deeper electrons lose extra energy before escaping.",
          "Area 3 (L3): Explain stopping potential eVs = Ek(max) stays constant when intensity doubles while photon rate and photocurrent double.",
        ],
      },
    ],
    workedSolution: `(a) $E_{\\text{k(max)}} = ${fmtSig(numVal(peLorMixQ, "ekMaxJ"), 3, "J")}$, $V_{\\text{s}} = ${fmtSig(numVal(peLorMixQ, "stoppingPotentialV"), 3, "V")}$. (b) Discrete photons interact one to one with surface electrons overcoming the work function; gradient $= h$, intercepts $= f_0$ and $-\\phi$, deeper electrons lose extra energy, and doubling intensity doubles photocurrent with unchanged $V_{\\text{s}}$.`,
    markScheme: [
      { code: "M1", criterion: "Compute photon energy $hf$ and convert work function $\\phi$ to joules.", marks: 1, partId: "a" },
      { code: "A1", criterion: `Obtain $E_{\\text{k(max)}} = ${fmtSig(numVal(peLorMixQ, "ekMaxJ"), 3, "J")}$.`, marks: 1, partId: "a" },
      { code: "A1", criterion: `Obtain $V_{\\text{s}} = ${fmtSig(numVal(peLorMixQ, "stoppingPotentialV"), 3, "V")}$.`, marks: 1, partId: "a" },
      ...makeLorCriteria("b", [
        "L1 (Area 1): Identifies gradient of both parallel lines as Planck constant h.",
        "L1 (Area 1): Identifies x-intercept as threshold frequency f₀ and vertical intercept magnitude as work function φ.",
        "L2 (Area 2): States one-to-one photon-electron interaction (E = hf) overcoming minimum surface energy φ.",
        "L2 (Area 2): Explains surface electrons escape with Ek(max) while deeper electrons lose extra energy overcoming internal bonds/collisions.",
        "L3 (Area 3): Links stopping potential strictly to maximum kinetic energy (eVs = Ek(max)), unchanged at fixed frequency.",
        "L3 (Area 3): Explains doubling intensity doubles photons per second -> doubles rate of photoelectron emission / photocurrent while Vs stays unchanged.",
      ]),
    ],
    subpartStrategy: [
      "Calculate Ek(max) and stopping potential from Einstein's photoelectric equation.",
      "Deliver six-mark Level of Response linking Ek-f graph features, kinetic energy spread, and intensity effect.",
    ],
  });

  // 2 additional shorter structured items
  const peS3Spec = { kind, visualMode: "iv-stopping", metalName: "caesium", workFunctionEv: 2.14, incidentFrequencyTHz: 860 };
  const peS3Q = solveKind(kind, peS3Spec);
  addStructured(ctx, {
    slug: "pe-struct-stopping-def",
    domain: "quantum-nuclear",
    kind,
    conceptId: "photoelectric-effect",
    syllabi: TAG_322,
    difficulty: "standard",
    questionStyle: "mixed-exam",
    targetMode: "quantitative",
    scenarioSpec: peS3Spec,
    hiddenQuantities: ["stoppingPotentialV", "stoppingPotentialRule"],
    requiredGivens: [
      { name: "workFunctionEv", value: 2.14, unit: "eV", source: "stem" },
      { name: "incidentFrequencyTHz", value: 860, unit: "THz", source: "stem" },
    ],
    stem: "Light of frequency $860\\text{ THz}$ strikes a caesium cathode ($\\phi = 2.14\\text{ eV}$) inside a photocell. Take $h = 6.63 \\times 10^{-34}\\text{ J s}$ and $e = 1.60 \\times 10^{-19}\\text{ C}$.",
    parts: [
      {
        partId: "a",
        prompt: "Define stopping potential $V_{\\text{s}}$.",
        marks: 2,
        targetMode: "qualitative",
        targetQuantityKey: "stoppingPotentialRule",
        expectedAnswer: "Stopping potential is the minimum potential difference needed to stop the maximum kinetic energy photoelectrons from reaching the collector ($eV_{\\text{s}} = E_{\\text{k(max)}}$).",
        workingSteps: ["Must state minimum reverse p.d. and explicitly mention maximum kinetic energy photoelectrons."],
      },
      {
        partId: "b",
        prompt: "Calculate the stopping potential for this caesium photocell.",
        marks: 3,
        dependsOnPartIds: ["a"],
        targetMode: "quantitative",
        targetQuantityKey: "stoppingPotentialV",
        expectedAnswer: fmtSig(numVal(peS3Q, "stoppingPotentialV"), 3, "V"),
        workingSteps: [
          `Compute $hf = ${fmtSig(numVal(peS3Q, "photonEnergyJ"), 3, "J")}$ and $\\phi = ${fmtSig(numVal(peS3Q, "workFunctionJ"), 3, "J")}$.`,
          `Compute $V_{\\text{s}} = (hf - \\phi)/e = ${fmtSig(numVal(peS3Q, "stoppingPotentialV"), 3, "V")}$.`,
        ],
      },
    ],
    workedSolution: `(a) Stopping potential is the minimum potential difference needed to stop the maximum kinetic energy photoelectrons (omitting 'maximum' loses credit). (b) $V_{\\text{s}} = ${fmtSig(numVal(peS3Q, "stoppingPotentialV"), 3, "V")}$.`,
    markScheme: [
      { code: "B1", criterion: "Minimum reverse potential difference to reduce photocurrent to zero.", marks: 1, partId: "a" },
      { code: "B1", criterion: "Explicitly states stopping the maximum kinetic energy photoelectrons (reject if 'maximum' omitted).", marks: 1, partId: "a" },
      { code: "M1", criterion: "Calculate photon energy $hf$ in J (or eV).", marks: 1, partId: "b" },
      { code: "M1", criterion: "Subtract work function $\\phi$ and divide by $e$.", marks: 1, partId: "b" },
      { code: "A1", criterion: `Stopping potential $V_{\\text{s}} = ${fmtSig(numVal(peS3Q, "stoppingPotentialV"), 3, "V")}$.`, marks: 1, partId: "b" },
    ],
    subpartStrategy: [
      "State exact AQA definition of stopping potential.",
      "Evaluate stopping potential quantitatively.",
    ],
  });

  const peS4Spec = { kind, visualMode: "ek-vs-f", metalName: "copper", workFunctionEv: 4.7, incidentFrequencyTHz: 1550 };
  const peS4Q = solveKind(kind, peS4Spec);
  addStructured(ctx, {
    slug: "pe-struct-copper-threshold",
    domain: "quantum-nuclear",
    kind,
    conceptId: "photoelectric-effect",
    syllabi: TAG_322,
    difficulty: "standard",
    questionStyle: "mixed-exam",
    targetMode: "quantitative",
    scenarioSpec: peS4Spec,
    hiddenQuantities: ["thresholdFrequencyHz", "ekMaxJ"],
    requiredGivens: [
      { name: "workFunctionEv", value: 4.7, unit: "eV", source: "stem" },
      { name: "incidentFrequencyTHz", value: 1550, unit: "THz", source: "stem" },
    ],
    stem: "Deep ultraviolet light of frequency $1550\\text{ THz}$ strikes a polished copper plate of work function $4.70\\text{ eV}$. Take $h = 6.63 \\times 10^{-34}\\text{ J s}$ and $e = 1.60 \\times 10^{-19}\\text{ C}$.",
    parts: [
      {
        partId: "a",
        prompt: "Calculate the threshold frequency $f_0$ of copper.",
        marks: 2,
        targetMode: "quantitative",
        targetQuantityKey: "thresholdFrequencyHz",
        expectedAnswer: fmtSig(numVal(peS4Q, "thresholdFrequencyHz"), 3, "Hz"),
        workingSteps: [
          `Convert $\\phi = 4.70 \\times 1.60 \\times 10^{-19} = 7.52 \\times 10^{-19}\\text{ J}$.`,
          `Compute $f_0 = \\phi / h = ${fmtSig(numVal(peS4Q, "thresholdFrequencyHz"), 3, "Hz")}$.`,
        ],
      },
      {
        partId: "b",
        prompt: "Calculate the maximum kinetic energy of the emitted photoelectrons in joules.",
        marks: 2,
        dependsOnPartIds: ["a"],
        targetMode: "quantitative",
        targetQuantityKey: "ekMaxJ",
        expectedAnswer: fmtSig(numVal(peS4Q, "ekMaxJ"), 3, "J"),
        workingSteps: [
          `Compute $E_{\\text{k(max)}} = h(f - f_0) = ${fmtSig(numVal(peS4Q, "ekMaxJ"), 3, "J")}$.`,
        ],
      },
    ],
    workedSolution: `(a) $f_0 = \\phi/h = ${fmtSig(numVal(peS4Q, "thresholdFrequencyHz"), 3, "Hz")}$. (b) $E_{\\text{k(max)}} = hf - \\phi = ${fmtSig(numVal(peS4Q, "ekMaxJ"), 3, "J")}$.`,
    markScheme: [
      { code: "M1", criterion: "Convert $4.70\\text{ eV}$ to joules and divide by $h$.", marks: 1, partId: "a" },
      { code: "A1", criterion: `$f_0 = ${fmtSig(numVal(peS4Q, "thresholdFrequencyHz"), 3, "Hz")}$.`, marks: 1, partId: "a" },
      { code: "M1", criterion: "Substitute into $E_{\\text{k(max)}} = hf - \\phi$.", marks: 1, partId: "b" },
      { code: "A1", criterion: `$E_{\\text{k(max)}} = ${fmtSig(numVal(peS4Q, "ekMaxJ"), 3, "J")}$.`, marks: 1, partId: "b" },
    ],
    subpartStrategy: [
      "Compute copper threshold frequency from work function.",
      "Calculate maximum photoelectron kinetic energy.",
    ],
  });
}

/* -------------------------------------------------------------------------- */
/*  FAMILY 8: al-as-fluorescent-spectra-ediff (12 items: 5Q + 3C + 4 [2 LoR]) */
/* -------------------------------------------------------------------------- */

function buildFamily8FluorescentEdiff(ctx: BuilderContext): void {
  const kind = "al-as-fluorescent-spectra-ediff" as const;

  // 5 Pure Qualitative MCQs
  addQualMcq(ctx, {
    slug: "fl-phosphor-role",
    domain: "quantum-nuclear",
    kind,
    conceptId: "atomic-spectra-energy-levels",
    syllabi: TAG_322,
    difficulty: "foundation",
    scenarioSpec: { kind, visualMode: "fluorescent-tube", upperLevelEv: -5.5, lowerLevelEv: -10.4, numLevels: 4 },
    targetQuantityKey: "phosphorCascadeRule",
    hiddenQuantities: ["phosphorCascadeRule", "lorAnchor"],
    stem: "Why is the inner glass surface of a low-pressure mercury fluorescent tube coated with a white phosphor powder?",
    correctPrefix: "The coating is needed because the",
    distractors: [
      {
        text: "The coating is needed because the phosphor reflects ultraviolet light back into the room as visible light by Doppler shift",
        rationale: "Phosphor works via photon absorption and multi-step de-excitation, not Doppler shifting.",
      },
      {
        text: "The coating is needed because the phosphor speeds up free electrons to higher kinetic energies",
        rationale: "Phosphor is an insulating fluorescent layer on the glass wall, not an accelerating electrode.",
      },
      {
        text: "The coating is needed because the phosphor emits ultraviolet photons when struck by visible light",
        rationale: "Inverts the energy conversion: mercury emits UV and phosphor converts UV into lower-energy visible photons.",
      },
    ],
    workedNote:
      "Excited mercury atoms emit high-energy UV photons; the phosphor coating absorbs ultraviolet photons and de-excites in multiple smaller steps emitting visible light.",
  });

  addQualMcq(ctx, {
    slug: "fl-excitation-mechanism",
    domain: "quantum-nuclear",
    kind,
    conceptId: "atomic-spectra-energy-levels",
    syllabi: TAG_322,
    difficulty: "foundation",
    scenarioSpec: { kind, visualMode: "fluorescent-tube", upperLevelEv: -5.5, lowerLevelEv: -10.4, numLevels: 4 },
    targetQuantityKey: "excitationMechanism",
    hiddenQuantities: ["excitationMechanism"],
    stem: "How are mercury atoms inside a fluorescent tube excited before they emit ultraviolet photons?",
    correctPrefix: "Driven by the potential difference across the tube,",
    distractors: [
      {
        text: "Driven by the potential difference across the tube, mercury nuclei undergo alpha decay inside the gas",
        rationale: "Excitation involves atomic orbital electrons, not nuclear radioactivity.",
      },
      {
        text: "Driven by the potential difference across the tube, free protons collide with mercury nuclei to raise nuclear energy",
        rationale: "Conduction in the vapour is dominated by light accelerated electrons colliding with atomic orbital electrons.",
      },
      {
        text: "Driven by the potential difference across the tube, the mercury gas is simply warmed until it melts",
        rationale: "AQA requires mentioning collision between free beam electrons and atomic orbital electrons.",
      },
    ],
    workedNote:
      "Accelerated free electrons collide inelastically with orbital atomic electrons in mercury atoms, exciting them to higher discrete levels.",
  });

  addQualMcq(ctx, {
    slug: "fl-ediff-ring-trend",
    domain: "quantum-nuclear",
    kind,
    conceptId: "atomic-spectra-energy-levels",
    syllabi: TAG_322,
    difficulty: "standard",
    scenarioSpec: { kind, visualMode: "electron-diffraction", upperLevelEv: -3.4, lowerLevelEv: -13.6, numLevels: 4, anodeVoltageV: 4000 },
    targetQuantityKey: "ringRadiusTrend",
    hiddenQuantities: ["ringRadiusTrend", "anodeVoltageV"],
    stem: "In the electron diffraction apparatus shown, the accelerating anode potential difference $V$ is increased while keeping the thin polycrystalline graphite target unchanged. What change is observed on the fluorescent screen?",
    correctPrefix: "As accelerating voltage rises, the",
    distractors: [
      {
        text: "As accelerating voltage rises, the diffraction rings spread further apart as de Broglie wavelength increases",
        rationale: "Higher voltage increases momentum p = √(2meV), which decreases λ = h/p and narrows diffraction angles.",
      },
      {
        text: "As accelerating voltage rises, the rings stay at fixed radii because graphite spacing is unchanged",
        rationale: "Diffraction angle depends on λ/d; changing λ shifts the ring radii.",
      },
      {
        text: "As accelerating voltage rises, the rings disappear because faster electrons repel each other like particles",
        rationale: "AQA explicitly rejects particle-repulsion explanations for electron diffraction rings.",
      },
    ],
    workedNote:
      "Higher $V$ increases electron speed and momentum $p$, decreasing $\\lambda = h/p$, so the diffraction rings move closer together (AQA prefers 'closer together', not merely 'smaller').",
  });

  addQualMcq(ctx, {
    slug: "fl-ediff-wave-evidence",
    domain: "quantum-nuclear",
    kind,
    conceptId: "atomic-spectra-energy-levels",
    syllabi: TAG_322,
    difficulty: "foundation",
    scenarioSpec: { kind, visualMode: "electron-diffraction", upperLevelEv: -3.4, lowerLevelEv: -13.6, numLevels: 4, anodeVoltageV: 3500 },
    targetQuantityKey: "waveEvidenceRule",
    hiddenQuantities: ["waveEvidenceRule"],
    stem: "Why does passing fast electrons through a thin polycrystalline graphite film produce concentric rings rather than a single diffuse spot?",
    correctPrefix: "The concentric ring pattern arises because",
    distractors: [
      {
        text: "The concentric ring pattern arises because electrostatic repulsion between electrons pushes them into circles",
        rationale: "Explicit AQA reject rule: diffraction is constructive/destructive wave interference, never electron–electron repulsion.",
      },
      {
        text: "The concentric ring pattern arises because electrons bounce elastically off the glass neck of the tube",
        rationale: "The rings originate from diffraction through regularly spaced atomic planes in the thin graphite target.",
      },
      {
        text: "The concentric ring pattern arises because electrons emit circular rings of X-rays before reaching the graphite",
        rationale: "The screen detects the diffracted electrons themselves.",
      },
    ],
    workedNote:
      "Electron diffraction demonstrates wave behaviour when the electron de Broglie wavelength is comparable to the atomic spacing in graphite.",
  });

  addQualMcq(ctx, {
    slug: "fl-discrete-spectra-qual",
    domain: "quantum-nuclear",
    kind,
    conceptId: "atomic-spectra-energy-levels",
    syllabi: TAG_322,
    difficulty: "standard",
    scenarioSpec: { kind, visualMode: "energy-levels", upperLevelEv: -5.5, lowerLevelEv: -10.4, numLevels: 4 },
    targetQuantityKey: "lorAnchor",
    hiddenQuantities: ["lorAnchor"],
    stem: "Why does a low-pressure mercury discharge lamp emit light at specific discrete wavelengths rather than a continuous spectrum before hitting the phosphor wall?",
    correctPrefix: "Discrete spectral lines occur because",
    correctSuffix: "between quantised energy levels so only specific photon energies hf occur",
    distractors: [
      {
        text: "Discrete spectral lines occur because mercury atoms can absorb and emit any continuous amount of energy",
        rationale: "Continuous energy levels would produce a continuous spectrum, not sharp lines.",
      },
      {
        text: "Discrete spectral lines occur because glass absorbs all frequencies except one single colour",
        rationale: "Line spectra are a property of quantised atomic energy levels inside the gas.",
      },
      {
        text: "Discrete spectral lines occur because all free electrons have identical kinetic energy after colliding",
        rationale: "Colliding electrons transfer discrete ΔE and carry away any leftover kinetic energy.",
      },
    ],
    workedNote:
      "Atomic energy levels are discrete, so de-excitation transitions emit photons of exact energies $hf = E_1 - E_2$.",
  });

  // 3 Quantitative MCQs
  const flC1Spec = { kind, visualMode: "energy-levels", upperLevelEv: -5.5, lowerLevelEv: -10.4, numLevels: 4 };
  const flC1 = solveKind(kind, flC1Spec);
  addNumMcq(ctx, {
    slug: "fl-calc-uv-wavelength",
    domain: "quantum-nuclear",
    kind,
    conceptId: "atomic-spectra-energy-levels",
    syllabi: TAG_322,
    difficulty: "standard",
    scenarioSpec: flC1Spec,
    targetQuantityKey: "photonWavelengthNm",
    unit: "nm",
    hiddenQuantities: ["photonWavelengthNm", "photonWavelengthM", "photonFrequencyHz"],
    requiredGivens: [
      { name: "upperLevelEv", value: -5.5, unit: "eV", source: "either" },
      { name: "lowerLevelEv", value: -10.4, unit: "eV", source: "either" },
    ],
    stem: "An excited mercury orbital electron drops from the $-5.5\\text{ eV}$ level to the $-10.4\\text{ eV}$ ground state. Using $h = 6.63 \\times 10^{-34}\\text{ J s}$, $c = 3.00 \\times 10^8\\text{ m s}^{-1}$, and $e = 1.60 \\times 10^{-19}\\text{ C}$, calculate the wavelength of the emitted UV photon in nanometres.",
    distractors: [
      { value: ((AQA_H_JS * AQA_C_MS) / (5.5 * AQA_E_C)) * 1e9, rationale: "Uses the upper level energy −5.5 eV directly instead of the energy difference ΔE = 4.9 eV." },
      { value: ((AQA_H_JS * AQA_C_MS) / (10.4 * AQA_E_C)) * 1e9, rationale: "Uses the ground-state energy 10.4 eV instead of ΔE." },
      { value: numVal(flC1, "photonWavelengthNm") * 0.5, rationale: "Halves the wavelength through an arithmetic slip." },
    ],
    workedSolution: `$\\Delta E = (-5.5) - (-10.4) = 4.90\\text{ eV} = 7.84 \\times 10^{-19}\\text{ J}$, so $\\lambda = hc/\\Delta E = ${fmtSig(numVal(flC1, "photonWavelengthNm"), 3, "nm")}$.`,
    markCriterion: `Emitted UV wavelength $= ${fmtSig(numVal(flC1, "photonWavelengthNm"), 3, "nm")}$`,
  });

  const flC2Spec = { kind, visualMode: "energy-levels", upperLevelEv: -1.5, lowerLevelEv: -13.6, numLevels: 5 };
  addNumMcq(ctx, {
    slug: "fl-calc-line-count",
    domain: "quantum-nuclear",
    kind,
    conceptId: "atomic-spectra-energy-levels",
    syllabi: TAG_322,
    difficulty: "foundation",
    scenarioSpec: flC2Spec,
    targetQuantityKey: "distinctEmissionLines",
    hiddenQuantities: ["distinctEmissionLines"],
    requiredGivens: [{ name: "numLevels", value: 5, source: "stem" }],
    stem: "An atom has $5$ distinct bound energy levels available during de-excitation from the highest state down to the ground state. Assuming all transitions have different energy gaps, how many distinct spectral emission wavelengths can be produced?",
    distractors: [
      { value: 4, rationale: "Counts only transitions directly to the ground state (n − 1) and ignores intermediate cascade jumps." },
      { value: 5, rationale: "Confuses the number of levels n with the number of pairs n(n − 1)/2." },
      { value: 20, rationale: "Computes n(n − 1) without dividing by 2 (double-counts upward and downward transitions)." },
    ],
    workedSolution:
      "The number of downward pairs among $n = 5$ levels is $n(n - 1)/2 = 5 \\times 4 / 2 = 10.0$ distinct lines.",
    markCriterion: "Distinct emission lines $= 10$",
  });

  const flC3Spec = { kind, visualMode: "electron-diffraction", upperLevelEv: -3.4, lowerLevelEv: -13.6, numLevels: 4, anodeVoltageV: 4200 };
  const flC3 = solveKind(kind, flC3Spec);
  addNumMcq(ctx, {
    slug: "fl-calc-debroglie",
    domain: "quantum-nuclear",
    kind,
    conceptId: "atomic-spectra-energy-levels",
    syllabi: TAG_322,
    difficulty: "standard",
    scenarioSpec: flC3Spec,
    targetQuantityKey: "deBroglieWavelengthPm",
    unit: "pm",
    hiddenQuantities: ["deBroglieWavelengthPm", "electronMomentumKgMs"],
    requiredGivens: [{ name: "anodeVoltageV", value: 4200, unit: "V", source: "either" }],
    stem: "Electrons in a diffraction tube are accelerated from rest through an anode potential difference of $4200\\text{ V}$. Using $h = 6.63 \\times 10^{-34}\\text{ J s}$, $e = 1.60 \\times 10^{-19}\\text{ C}$, and $m_{\\text{e}} = 9.11 \\times 10^{-31}\\text{ kg}$, calculate their de Broglie wavelength in picometres.",
    distractors: [
      { value: numVal(flC3, "deBroglieWavelengthPm") * Math.SQRT2, rationale: "Omits the factor of 2 inside p = √(2meV)." },
      { value: numVal(flC3, "deBroglieWavelengthPm") / Math.SQRT2, rationale: "Places √2 in the denominator instead of numerator." },
      { value: numVal(flC3, "deBroglieWavelengthPm") * 2, rationale: "Doubles the wavelength by miscalculating kinetic energy." },
    ],
    workedSolution: `$p = \\sqrt{2m_{\\text{e}}eV} = \\sqrt{2 \\times 9.11 \\times 10^{-31} \\times 1.60 \\times 10^{-19} \\times 4200} = ${fmtSig(numVal(flC3, "electronMomentumKgMs"), 3, "kg m s⁻¹")}$, giving $\\lambda = h/p = ${fmtSig(numVal(flC3, "deBroglieWavelengthPm"), 3, "pm")}$.`,
    markCriterion: `de Broglie wavelength $= ${fmtSig(numVal(flC3, "deBroglieWavelengthPm"), 3, "pm")}$`,
  });

  // 2 Authentic 6-Mark LoR (#3 Blueprint) + 2 Structured
  addStructured(ctx, {
    slug: "fl-lor-tube-6m",
    domain: "quantum-nuclear",
    kind,
    conceptId: "atomic-spectra-energy-levels",
    syllabi: TAG_322,
    difficulty: "higher",
    questionStyle: "qualitative",
    targetMode: "qualitative",
    scenarioSpec: { kind, visualMode: "fluorescent-tube", upperLevelEv: -5.5, lowerLevelEv: -10.4, numLevels: 4 },
    hiddenQuantities: ["lorAnchor", "phosphorCascadeRule", "excitationMechanism"],
    requiredGivens: [],
    stem: "A classroom ceiling light uses a low-pressure mercury fluorescent tube whose glass wall is lined on the inside with a phosphor coating.",
    parts: [
      {
        partId: "a",
        prompt:
          "Explain in detail how a fluorescent tube emits visible light when a high potential difference is applied across its ends. In your answer, explain the processes of excitation/ionisation in mercury vapour, ultraviolet photon emission, and the role of the phosphor coating.",
        marks: 6,
        targetMode: "qualitative",
        targetQuantityKey: "lorAnchor",
        expectedAnswer:
          "A high potential difference accelerates free electrons along the tube; colliding free electrons excite mercury orbital electrons emitting ultraviolet photons absorbed by phosphor coating. Specifically, inelastic collisions transfer kinetic energy to atomic orbital electrons in mercury atoms, exciting them to higher discrete energy levels (or ionising mercury atoms to maintain the flow of free electrons). Excited mercury electrons quickly de-excite to lower discrete energy levels, emitting photons of energy $hf = E_1 - E_2$ predominantly in the ultraviolet region. The inner phosphor coating absorbs these UV photons, exciting phosphor atoms, whose electrons then de-excite via multiple smaller downward transitions (cascades) through intermediate levels, emitting lower-energy, longer-wavelength visible photons across many colours.",
        workingSteps: [
          "Area 1 (L1): High p.d. accelerates free electrons; collisions with atomic orbital electrons excite/ionise mercury atoms.",
          "Area 2 (L2): Excited mercury electrons de-excite to lower discrete levels, emitting discrete UV photons with hf = E₁ − E₂.",
          "Area 3 (L3): Phosphor absorbs UV photons and de-excites via multiple smaller step cascades, emitting lower-energy/longer-wavelength visible photons.",
        ],
      },
    ],
    workedSolution:
      "Level 3 (5–6 marks): Colliding free electrons excite mercury orbital electrons emitting ultraviolet photons absorbed by phosphor coating; links acceleration -> collisional excitation of orbital electrons -> discrete UV de-excitation ($hf = E_1 - E_2$) -> phosphor absorption -> multi-step cascade emitting visible wavelengths.",
    markScheme: makeLorCriteria("a", [
      "L1 (Area 1): High potential difference accelerates free electrons through the low-pressure mercury vapour.",
      "L1 (Area 1): Free electrons collide inelastically with atomic orbital electrons in mercury atoms, exciting them to higher discrete energy levels (or ionising to supply more free electrons).",
      "L2 (Area 2): Excited mercury electrons rapidly de-excite / fall back to lower discrete energy levels.",
      "L2 (Area 2): Each downward transition emits a discrete photon of energy hf = E₁ − E₂ predominantly in the ultraviolet (UV) region.",
      "L3 (Area 3): Inner phosphor coating absorbs the UV photons, exciting orbital electrons in the coating atoms.",
      "L3 (Area 3): Coating electrons de-excite in multiple smaller steps (cascades) through intermediate levels, emitting lower-energy / longer-wavelength visible photons.",
    ]),
    subpartStrategy: [
      "Six-mark Level of Response tracing electrical excitation in mercury vapour through UV emission to phosphor visible cascades.",
    ],
  });

  const flMixSpec = { kind, visualMode: "fluorescent-tube", upperLevelEv: -4.9, lowerLevelEv: -10.4, numLevels: 4, incidentElectronEv: 7.5 };
  const flMixQ = solveKind(kind, flMixSpec);
  addStructured(ctx, {
    slug: "fl-lor-collisional-mix-9m",
    domain: "quantum-nuclear",
    kind,
    conceptId: "atomic-spectra-energy-levels",
    syllabi: TAG_322,
    difficulty: "higher",
    questionStyle: "mixed-exam",
    targetMode: "quantitative",
    scenarioSpec: flMixSpec,
    hiddenQuantities: ["scatteredElectronEv", "photonWavelengthNm", "lorAnchor", "phosphorCascadeRule"],
    requiredGivens: [
      { name: "upperLevelEv", value: -4.9, unit: "eV", source: "stem" },
      { name: "lowerLevelEv", value: -10.4, unit: "eV", source: "stem" },
      { name: "incidentElectronEv", value: 7.5, unit: "eV", source: "stem" },
    ],
    stem: "Inside a fluorescent tube, a free electron with kinetic energy $7.50\\text{ eV}$ collides with a ground-state mercury atom ($E_1 = -10.4\\text{ eV}$), exciting an orbital electron to $E_2 = -4.9\\text{ eV}$. Take $h = 6.63 \\times 10^{-34}\\text{ J s}$, $c = 3.00 \\times 10^8\\text{ m s}^{-1}$, and $e = 1.60 \\times 10^{-19}\\text{ C}$.",
    parts: [
      {
        partId: "a",
        prompt: "Calculate the kinetic energy remaining with the colliding free electron after excitation, and the wavelength in nm of the UV photon emitted when the atom de-excites directly to the ground state.",
        marks: 3,
        targetMode: "quantitative",
        targetQuantityKey: "photonWavelengthNm",
        expectedAnswer: `Remaining electron KE $= ${fmtSig(numVal(flMixQ, "scatteredElectronEv"), 3, "eV")}$; UV photon wavelength $= ${fmtSig(numVal(flMixQ, "photonWavelengthNm"), 3, "nm")}$`,
        workingSteps: [
          `Excitation gap $\\Delta E = (-4.9) - (-10.4) = 5.50\\text{ eV}$, leaving $7.50 - 5.50 = ${fmtSig(numVal(flMixQ, "scatteredElectronEv"), 3, "eV")}$ on the colliding electron.`,
          `Wavelength $\\lambda = hc / (5.50 e) = ${fmtSig(numVal(flMixQ, "photonWavelengthNm"), 3, "nm")}$.`,
        ],
      },
      {
        partId: "b",
        prompt:
          "Contrast excitation by a colliding electron with excitation by an incident photon, and explain how the mercury vapour and phosphor coating convert this ultraviolet emission into white visible light.",
        marks: 6,
        targetMode: "qualitative",
        targetQuantityKey: "lorAnchor",
        expectedAnswer:
          "A colliding free electron can excite an atom whenever its kinetic energy is greater than or equal to $\\Delta E$, carrying away the leftover kinetic energy, whereas a photon is absorbed only if its energy $hf$ matches $\\Delta E$ exactly. In the tube, colliding free electrons excite mercury orbital electrons emitting ultraviolet photons absorbed by phosphor coating. Mercury de-excitation emits discrete UV photons ($hf = E_1 - E_2$); phosphor atoms absorb these UV photons and de-excite through several smaller intermediate downward transitions, emitting lower-energy, longer-wavelength photons across the visible spectrum.",
        workingSteps: [
          "Area 1 (L1): Contrast collisional electron excitation (E_k >= ΔE, excess retained) with resonant photon absorption (exact hf = ΔE).",
          "Area 2 (L2): Explain mercury de-excitation emitting discrete UV photons.",
          "Area 3 (L3): Explain phosphor absorption and multi-step visible photon cascade.",
        ],
      },
    ],
    workedSolution: `(a) Remaining KE $= 2.00\\text{ eV}$; $\\lambda = ${fmtSig(numVal(flMixQ, "photonWavelengthNm"), 3, "nm")}$. (b) Colliding free electrons excite mercury orbital electrons emitting ultraviolet photons absorbed by phosphor coating; contrasts electron vs resonant photon excitation and explains visible phosphor cascade.`,
    markScheme: [
      { code: "A1", criterion: `Remaining electron kinetic energy $= ${fmtSig(numVal(flMixQ, "scatteredElectronEv"), 3, "eV")}$.`, marks: 1, partId: "a" },
      { code: "M1", criterion: "Convert $\\Delta E = 5.50\\text{ eV}$ to joules and apply $\\lambda = hc/\\Delta E$.", marks: 1, partId: "a" },
      { code: "A1", criterion: `UV wavelength $= ${fmtSig(numVal(flMixQ, "photonWavelengthNm"), 3, "nm")}$.`, marks: 1, partId: "a" },
      ...makeLorCriteria("b", [
        "L1 (Area 1): Colliding electron needs KE >= ΔE and retains excess kinetic energy after exciting an atomic orbital electron.",
        "L1 (Area 1): Incident photon must have energy hf equal to exact energy level gap ΔE (all-or-nothing absorption).",
        "L2 (Area 2): Excited mercury orbital electrons de-excite to lower discrete energy levels.",
        "L2 (Area 2): Downward transitions emit discrete ultraviolet photons with hf = E₁ − E₂.",
        "L3 (Area 3): Phosphor coating absorbs UV photons, exciting electrons in coating atoms.",
        "L3 (Area 3): Phosphor electrons de-excite via multiple smaller intermediate transitions emitting lower-energy / longer-wavelength visible photons.",
      ]),
    ],
    subpartStrategy: [
      "Compute scattered electron energy and emitted UV wavelength.",
      "Six-mark Level of Response contrasting electron vs photon excitation and explaining phosphor cascade.",
    ],
  });

  // 2 Additional Structured (Electron diffraction + line spectra)
  const edSpec = { kind, visualMode: "electron-diffraction", upperLevelEv: -3.4, lowerLevelEv: -13.6, numLevels: 4, anodeVoltageV: 3200 };
  const edQ = solveKind(kind, edSpec);
  addStructured(ctx, {
    slug: "fl-struct-ediff-calc",
    domain: "quantum-nuclear",
    kind,
    conceptId: "atomic-spectra-energy-levels",
    syllabi: TAG_322,
    difficulty: "standard",
    questionStyle: "mixed-exam",
    targetMode: "quantitative",
    scenarioSpec: edSpec,
    hiddenQuantities: ["deBroglieWavelengthPm", "ringRadiusTrend"],
    requiredGivens: [{ name: "anodeVoltageV", value: 3200, unit: "V", source: "either" }],
    stem: "In the electron diffraction tube shown, electrons are accelerated from rest through $3200\\text{ V}$ before passing through a thin polycrystalline graphite target. Take $h = 6.63 \\times 10^{-34}\\text{ J s}$, $e = 1.60 \\times 10^{-19}\\text{ C}$, and $m_{\\text{e}} = 9.11 \\times 10^{-31}\\text{ kg}$.",
    parts: [
      {
        partId: "a",
        prompt: "Calculate the de Broglie wavelength of the accelerated electrons in picometres.",
        marks: 3,
        targetMode: "quantitative",
        targetQuantityKey: "deBroglieWavelengthPm",
        expectedAnswer: fmtSig(numVal(edQ, "deBroglieWavelengthPm"), 3, "pm"),
        workingSteps: [
          `Compute $p = \\sqrt{2m_{\\text{e}}eV} = ${fmtSig(numVal(edQ, "electronMomentumKgMs"), 3, "kg m s⁻¹")}$.`,
          `Compute $\\lambda = h/p = ${fmtSig(numVal(edQ, "deBroglieWavelengthPm"), 3, "pm")}$.`,
        ],
      },
      {
        partId: "b",
        prompt: "State and explain how the concentric ring pattern changes if the anode voltage is raised to $5000\\text{ V}$.",
        marks: 2,
        dependsOnPartIds: ["a"],
        targetMode: "qualitative",
        targetQuantityKey: "ringRadiusTrend",
        expectedAnswer: `Higher voltage increases electron speed and momentum, so the ${strVal(edQ, "ringRadiusTrend")}.`,
        workingSteps: [
          "Link higher V to higher momentum p and smaller de Broglie wavelength λ = h/p.",
          "Conclude diffraction rings move closer together (do not merely write 'smaller' without direction).",
        ],
      },
    ],
    workedSolution: `(a) $\\lambda = h/\\sqrt{2m_{\\text{e}}eV} = ${fmtSig(numVal(edQ, "deBroglieWavelengthPm"), 3, "pm")}$. (b) Increasing $V$ raises momentum and reduces $\\lambda$, so ${strVal(edQ, "ringRadiusTrend")}.`,
    markScheme: [
      { code: "M1", criterion: "Equate $eV = \\frac{1}{2}m_{\\text{e}}v^2$ to find momentum $p = \\sqrt{2m_{\\text{e}}eV}$.", marks: 1, partId: "a" },
      { code: "M1", criterion: "Substitute into $\\lambda = h/p$.", marks: 1, partId: "a" },
      { code: "A1", criterion: `Obtain $\\lambda = ${fmtSig(numVal(edQ, "deBroglieWavelengthPm"), 3, "pm")}$.`, marks: 1, partId: "a" },
      { code: "B1", criterion: "Higher anode p.d. increases electron momentum and reduces de Broglie wavelength $\\lambda$.", marks: 1, partId: "b" },
      { code: "B1", criterion: "Diffraction rings move closer together (reject particle repulsion).", marks: 1, partId: "b" },
    ],
    subpartStrategy: [
      "Calculate electron de Broglie wavelength from accelerating p.d.",
      "Predict ring spacing shift as accelerating voltage increases.",
    ],
  });

  const spSpec = { kind, visualMode: "energy-levels", upperLevelEv: -1.5, lowerLevelEv: -3.4, numLevels: 4 };
  const spQ = solveKind(kind, spSpec);
  addStructured(ctx, {
    slug: "fl-struct-balmer-line",
    domain: "quantum-nuclear",
    kind,
    conceptId: "atomic-spectra-energy-levels",
    syllabi: TAG_322,
    difficulty: "foundation",
    questionStyle: "mixed-exam",
    targetMode: "quantitative",
    scenarioSpec: spSpec,
    hiddenQuantities: ["photonFrequencyHz", "photonWavelengthNm", "distinctEmissionLines"],
    requiredGivens: [
      { name: "upperLevelEv", value: -1.5, unit: "eV", source: "either" },
      { name: "lowerLevelEv", value: -3.4, unit: "eV", source: "either" },
    ],
    stem: "An electron in an excited hydrogen atom drops from the $-1.50\\text{ eV}$ level to the $-3.40\\text{ eV}$ level. Take $h = 6.63 \\times 10^{-34}\\text{ J s}$, $c = 3.00 \\times 10^8\\text{ m s}^{-1}$, and $e = 1.60 \\times 10^{-19}\\text{ C}$.",
    parts: [
      {
        partId: "a",
        prompt: "Calculate the frequency and wavelength (in nm) of the emitted visible photon.",
        marks: 3,
        targetMode: "quantitative",
        targetQuantityKey: "photonWavelengthNm",
        expectedAnswer: `Frequency $= ${fmtSig(numVal(spQ, "photonFrequencyHz"), 3, "Hz")}$, wavelength $= ${fmtSig(numVal(spQ, "photonWavelengthNm"), 3, "nm")}$`,
        workingSteps: [
          `Compute $\\Delta E = 1.90\\text{ eV} = 3.04 \\times 10^{-19}\\text{ J}$.`,
          `Compute $f = \\Delta E / h = ${fmtSig(numVal(spQ, "photonFrequencyHz"), 3, "Hz")}$ and $\\lambda = c/f = ${fmtSig(numVal(spQ, "photonWavelengthNm"), 3, "nm")}$.`,
        ],
      },
      {
        partId: "b",
        prompt: "Distinguish briefly between excitation and ionisation of an atom.",
        marks: 2,
        targetMode: "qualitative",
        expectedAnswer:
          "Excitation moves an orbital electron to a higher discrete bound energy level within the atom, whereas ionisation removes an electron completely from the atom.",
        workingSteps: ["Define excitation (higher bound level) and ionisation (complete electron removal)."],
      },
    ],
    workedSolution: `(a) $\\Delta E = 1.90\\text{ eV}$, $f = ${fmtSig(numVal(spQ, "photonFrequencyHz"), 3, "Hz")}$, $\\lambda = ${fmtSig(numVal(spQ, "photonWavelengthNm"), 3, "nm")}$. (b) Excitation promotes an electron to a higher bound energy level; ionisation removes an electron completely from the atom.`,
    markScheme: [
      { code: "M1", criterion: "Calculate $\\Delta E = 1.90\\text{ eV} = 3.04 \\times 10^{-19}\\text{ J}$.", marks: 1, partId: "a" },
      { code: "A1", criterion: `Frequency $= ${fmtSig(numVal(spQ, "photonFrequencyHz"), 3, "Hz")}$.`, marks: 1, partId: "a" },
      { code: "A1", criterion: `Wavelength $= ${fmtSig(numVal(spQ, "photonWavelengthNm"), 3, "nm")}$.`, marks: 1, partId: "a" },
      { code: "B1", criterion: "Excitation: orbital electron moves to a higher discrete bound energy level.", marks: 1, partId: "b" },
      { code: "B1", criterion: "Ionisation: electron is completely removed from the atom.", marks: 1, partId: "b" },
    ],
    subpartStrategy: [
      "Calculate photon frequency and wavelength from bound transition gap.",
      "Distinguish atomic excitation from ionisation.",
    ],
  });
}

/* -------------------------------------------------------------------------- */
/*  FAMILY 9: al-as-polarisation-stationary-waves (12 items: 7Q+1C+4 [2 LoR]) */
/* -------------------------------------------------------------------------- */

function buildFamily9PolarisationStationary(ctx: BuilderContext): void {
  const kind = "al-as-polarisation-stationary-waves" as const;

  // 7 Pure Qualitative MCQs
  addQualMcq(ctx, {
    slug: "wv-transverse-def",
    domain: "waves",
    kind,
    conceptId: "progressive-waves-polarization",
    syllabi: TAG_331,
    difficulty: "foundation",
    questionStyle: "definition",
    scenarioSpec: { kind, visualMode: "polarisation", polarisationScenario: "crossed-polaroids" },
    targetQuantityKey: "transverseDefinition",
    hiddenQuantities: ["transverseDefinition"],
    stem: "Which phrasing strictly satisfies the AQA definition of a transverse progressive wave?",
    correctPrefix: "In a transverse wave, the",
    distractors: [
      {
        text: "In a transverse wave, the oscillations are parallel to the direction of energy transfer",
        rationale: "Defines a longitudinal wave, not a transverse wave.",
      },
      {
        text: "In a transverse wave, the particles travel continuously forward with the wave energy",
        rationale: "Particles oscillate about mean positions without net forward transport.",
      },
      {
        text: "In a transverse wave, the vibrations are randomly oriented with no fixed relationship to propagation",
        rationale: "AQA strictly requires 'oscillations perpendicular to the direction of energy transfer'.",
      },
    ],
    workedNote:
      "AQA requires 'oscillations perpendicular to the direction of energy transfer' (avoiding imprecise 'vibrations' or 'wave motion').",
  });

  addQualMcq(ctx, {
    slug: "wv-pol-sound-proof",
    domain: "waves",
    kind,
    conceptId: "progressive-waves-polarization",
    syllabi: TAG_331,
    difficulty: "foundation",
    scenarioSpec: { kind, visualMode: "polarisation", polarisationScenario: "longitudinal-sound" },
    targetQuantityKey: "polarisationRule",
    hiddenQuantities: ["polarisationRule"],
    stem: "Why can light waves and microwaves be plane-polarised whereas sound waves in air cannot?",
    correctPrefix: "Polarisation applies only to transverse waves because",
    distractors: [
      {
        text: "Polarisation applies only to transverse waves because sound waves have wavelengths too short to pass through a filter",
        rationale: "Audible sound wavelengths are centimetres to metres—far longer than light—and inability to polarise is due to longitudinal oscillation.",
      },
      {
        text: "Polarisation applies only to transverse waves because sound waves do not transfer energy through air",
        rationale: "Progressive sound waves transfer energy through compressions and rarefactions.",
      },
      {
        text: "Polarisation applies only to transverse waves because sound waves already travel in a single plane",
        rationale: "Longitudinal oscillations lie along a single line parallel to propagation, so no transverse plane can be selected.",
      },
    ],
    workedNote:
      "Longitudinal sound waves cannot be polarised because oscillations are parallel to energy transfer.",
  });

  addQualMcq(ctx, {
    slug: "wv-pol-glare",
    domain: "waves",
    kind,
    conceptId: "progressive-waves-polarization",
    syllabi: TAG_331,
    difficulty: "standard",
    scenarioSpec: { kind, visualMode: "polarisation", polarisationScenario: "water-glare" },
    targetQuantityKey: "polarisationRule",
    hiddenQuantities: ["polarisationRule"],
    stem: "How do Polaroid sunglasses reduce dazzling sunlight glare reflected off a flat lake surface while still allowing an angler to see fish below the surface?",
    correctPrefix: "Glare is reduced because",
    distractors: [
      {
        text: "Glare is reduced because reflected glare is vertically polarised and blocked by a horizontally aligned filter",
        rationale: "Reflection from a horizontal surface partially polarises light horizontally, so the filter axis must be vertical.",
      },
      {
        text: "Glare is reduced because the lenses refract all reflected glare completely away from the eye",
        rationale: "Polaroid filters selectively absorb one plane of electric-field oscillation rather than refracting glare away.",
      },
      {
        text: "Glare is reduced because the filter converts longitudinal light waves into transverse waves",
        rationale: "Light is already a transverse electromagnetic wave.",
      },
    ],
    workedNote:
      "Reflected glare from horizontal water is partially horizontally polarised and blocked by a vertically aligned Polaroid filter.",
  });

  addQualMcq(ctx, {
    slug: "wv-pol-tv-aerial",
    domain: "waves",
    kind,
    conceptId: "progressive-waves-polarization",
    syllabi: TAG_331,
    difficulty: "standard",
    scenarioSpec: { kind, visualMode: "polarisation", polarisationScenario: "tv-aerial" },
    targetQuantityKey: "polarisationRule",
    hiddenQuantities: ["polarisationRule"],
    stem: "A rooftop television transmitter emits vertically plane-polarised radio waves. How must the conducting dipole rods of a rooftop receiving aerial be oriented for strongest reception?",
    correctPrefix: "To maximise the induced alternating current,",
    distractors: [
      {
        text: "To maximise the induced alternating current, receiving aerial rods must be oriented perpendicular to the electric field oscillations",
        rationale: "Perpendicular rods experience zero electric-field component along their length, giving zero signal.",
      },
      {
        text: "To maximise the induced alternating current, receiving aerial rods can point in any direction because radio waves are unpolarised",
        rationale: "Transmitted TV waves are plane-polarised so alignment directly controls signal strength.",
      },
      {
        text: "To maximise the induced alternating current, receiving aerial rods must point straight towards the transmitter mast",
        rationale: "Electric field oscillations are perpendicular to the propagation ray, not along it.",
      },
    ],
    workedNote:
      "Receiving aerial rods must be aligned parallel to the plane of electric field oscillations for maximum signal.",
  });

  addQualMcq(ctx, {
    slug: "wv-stat-same-loop",
    domain: "waves",
    kind,
    conceptId: "progressive-waves-polarization",
    syllabi: TAG_331,
    difficulty: "standard",
    scenarioSpec: { kind, visualMode: "stationary-wave", harmonicN: 3, stringLengthM: 1.2, frequencyHz: 150, pointPair: "same-loop" },
    targetQuantityKey: "phaseRule",
    hiddenQuantities: ["phaseRule", "phaseDifferenceRad"],
    stem: "The diagram shows a stationary wave on a stretched string with labelled points P, Q, and R. What is the phase difference between points P and Q, which lie between the same two adjacent nodes?",
    correctPrefix: "Points P and Q have",
    distractors: [
      {
        text: "Points P and Q have a progressive phase lag proportional to their separation along the string",
        rationale: "Classic AQA trap: progressive waves show continuous phase lag 2πΔx/λ, whereas stationary points within one loop oscillate in phase.",
      },
      {
        text: "Points P and Q have antiphase oscillation because one is climbing while the other falls",
        rationale: "Points on opposite sides of a node are in antiphase; P and Q lie inside the same loop.",
      },
      {
        text: "Points P and Q have a quarter-cycle phase difference because they sit on opposite sides of the antinode",
        rationale: "Crossing an antinode does not invert phase; only crossing a node introduces a π phase jump.",
      },
    ],
    workedNote:
      "All points between two adjacent nodes reach maximum displacement simultaneously and have zero phase difference.",
  });

  addQualMcq(ctx, {
    slug: "wv-stat-across-node",
    domain: "waves",
    kind,
    conceptId: "progressive-waves-polarization",
    syllabi: TAG_331,
    difficulty: "standard",
    scenarioSpec: { kind, visualMode: "stationary-wave", harmonicN: 3, stringLengthM: 1.2, frequencyHz: 150, pointPair: "adjacent-loops" },
    targetQuantityKey: "phaseRule",
    hiddenQuantities: ["phaseRule", "phaseDifferenceRad"],
    stem: "On the stationary wave envelope shown, points P and R lie in adjacent loops separated by a single node. How are the oscillations of P and R related in phase?",
    correctPrefix: "Points P and R oscillate in",
    distractors: [
      {
        text: "Points P and R oscillate in phase because every point on a stationary wave moves together",
        rationale: "Only points within the same loop (or separated by an even number of nodes) oscillate in phase.",
      },
      {
        text: "Points P and R oscillate vaguely out of phase by an angle equal to their separation",
        rationale: "AQA explicitly rejects vague 'out of phase'; across one node the phase difference is exactly π rad (antiphase).",
      },
      {
        text: "Points P and R oscillate with identical amplitude and zero displacement at every instant",
        rationale: "Nodes have permanent zero displacement; P and R oscillate with non-zero amplitudes.",
      },
    ],
    workedNote:
      "Points separated by one node oscillate in antiphase ($\\pi\\text{ rad}$ or $180^\\circ$).",
  });

  addQualMcq(ctx, {
    slug: "wv-stat-energy-transfer",
    domain: "waves",
    kind,
    conceptId: "progressive-waves-polarization",
    syllabi: TAG_331,
    difficulty: "foundation",
    scenarioSpec: { kind, visualMode: "stationary-wave", harmonicN: 2, stringLengthM: 1.0, frequencyHz: 100, pointPair: "same-loop" },
    targetQuantityKey: "energyTransferRule",
    hiddenQuantities: ["energyTransferRule"],
    stem: "Which row correctly distinguishes a stationary wave on a violin string from a progressive wave travelling along an open rope?",
    correctPrefix: "Unlike a progressive wave, there is",
    distractors: [
      {
        text: "Unlike a progressive wave, there is continuous net transfer of energy from one fixed end to the other",
        rationale: "Energy in a stationary wave is stored locally in the vibrating loops with zero net propagation.",
      },
      {
        text: "Unlike a progressive wave, there is uniform oscillation amplitude at every point along the string",
        rationale: "A progressive wave (without damping) has constant amplitude everywhere, whereas a stationary wave varies from zero at nodes to maximum at antinodes.",
      },
      {
        text: "Unlike a progressive wave, there is a distance of one full wavelength between two adjacent nodes",
        rationale: "Adjacent nodes are separated by half a wavelength (λ/2), not λ.",
      },
    ],
    workedNote:
      "Stationary waves store vibrational energy locally with no net transfer of energy along a stationary wave.",
  });

  // 1 Quantitative MCQ (stationary wave speed from harmonic envelope)
  const wvC1Spec = { kind, visualMode: "stationary-wave", harmonicN: 3, stringLengthM: 1.35, frequencyHz: 180, pointPair: "same-loop" };
  const wvC1 = solveKind(kind, wvC1Spec);
  addNumMcq(ctx, {
    slug: "wv-calc-stat-speed",
    domain: "waves",
    kind,
    conceptId: "progressive-waves-polarization",
    syllabi: TAG_331,
    difficulty: "standard",
    scenarioSpec: wvC1Spec,
    targetQuantityKey: "waveSpeedMs",
    unit: "m s⁻¹",
    hiddenQuantities: ["waveSpeedMs", "wavelengthM", "nodeSpacingM"],
    requiredGivens: [
      { name: "stringLengthM", value: 1.35, unit: "m", source: "either" },
      { name: "frequencyHz", value: 180, unit: "Hz", source: "stem" },
    ],
    stem: "The stationary wave shown forms $3$ loops (third harmonic) along a stretched string of length $1.35\\text{ m}$ when driven at $180\\text{ Hz}$. Calculate the speed of progressive waves travelling along the string.",
    distractors: [
      { value: 180 * (1.35 / 3), rationale: "Classic AQA trap: mistakes node-to-node distance (λ/2 = 0.45 m) for full wavelength λ." },
      { value: 180 * (2 * 1.35), rationale: "Uses the first-harmonic wavelength 2L instead of 2L/3." },
      { value: 180 * 1.35, rationale: "Sets wavelength equal to total string length L." },
    ],
    workedSolution: `Three loops span $\\frac{3}{2}\\lambda = 1.35\\text{ m}$, so $\\lambda = 0.900\\text{ m}$ and $c = f\\lambda = 180 \\times 0.900 = ${fmtSig(numVal(wvC1, "waveSpeedMs"), 3, "m s⁻¹")}$.`,
    markCriterion: `Wave speed $= ${fmtSig(numVal(wvC1, "waveSpeedMs"), 3, "m s⁻¹")}$`,
  });

  // 2 Authentic 6-Mark LoR (#4 Blueprint) + 2 Structured
  addStructured(ctx, {
    slug: "wv-lor-polarisation-6m",
    domain: "waves",
    kind,
    conceptId: "progressive-waves-polarization",
    syllabi: TAG_331,
    difficulty: "higher",
    questionStyle: "qualitative",
    targetMode: "qualitative",
    scenarioSpec: { kind, visualMode: "polarisation", polarisationScenario: "water-glare" },
    hiddenQuantities: ["lorAnchor", "polarisationRule", "polarisationDefinition"],
    requiredGivens: [],
    stem: "A student investigates unpolarised light using two Polaroid filters and then wears Polaroid sunglasses while observing fish beneath a sunlit pond.",
    parts: [
      {
        partId: "a",
        prompt:
          "Explain what is meant by a plane-polarised wave, why polarisation demonstrates that light is transverse rather than longitudinal, how rotating an analyser affects transmitted intensity, and how Polaroid sunglasses reduce water glare.",
        marks: 6,
        targetMode: "qualitative",
        targetQuantityKey: "lorAnchor",
        expectedAnswer:
          "An unpolarised transverse wave has oscillations perpendicular to the direction of energy transfer in many planes, whereas plane polarised transverse waves restrict oscillations to a single plane whereas longitudinal waves cannot be polarised because their oscillations lie parallel to energy transfer. Passing unpolarised light through a polariser restricts oscillations to its transmission axis; rotating a second Polaroid (analyser) through $90^\\circ$ until crossed reduces transmitted intensity smoothly from maximum to zero. Sunlight reflected from horizontal water is partially horizontally polarised, so vertically aligned Polaroid sunglasses absorb the horizontal glare component while transmitting the vertical component of unpolarised light from objects beneath the water.",
        workingSteps: [
          "Area 1 (L1): Define unpolarised vs plane-polarised transverse waves (oscillations perpendicular to energy transfer in one plane).",
          "Area 2 (L2): Explain why longitudinal waves cannot be polarised and how rotating an analyser by 90° cuts intensity from max to zero.",
          "Area 3 (L3): Apply to water glare: horizontal reflection polarisation absorbed by vertical Polaroid axis while unpolarised underwater light passes.",
        ],
      },
    ],
    workedSolution:
      "Level 3 (5–6 marks): Plane polarised transverse waves restrict oscillations to a single plane whereas longitudinal waves cannot be polarised; explains analyser rotation $0^\\circ \\to 90^\\circ$ (max to zero) and horizontal glare absorption by vertically aligned sunglasses.",
    markScheme: makeLorCriteria("a", [
      "L1 (Area 1): States unpolarised transverse wave has oscillations perpendicular to direction of energy transfer in many planes (reject 'wave motion').",
      "L1 (Area 1): Defines plane-polarised wave as having oscillations restricted to a single plane containing the direction of propagation.",
      "L2 (Area 2): Explains longitudinal waves cannot be polarised because their oscillations are parallel to the direction of energy transfer.",
      "L2 (Area 2): Explains rotating a second Polaroid (analyser) through 90° from parallel to perpendicular reduces transmitted intensity from maximum to zero.",
      "L3 (Area 3): States light reflected off horizontal water is partially horizontally polarised.",
      "L3 (Area 3): Explains vertically aligned Polaroid sunglasses absorb horizontal glare while transmitting the vertical component of unpolarised light from underwater objects.",
    ]),
    subpartStrategy: [
      "Six-mark Level of Response covering plane polarisation definition, transverse proof, crossed Polaroids, and glare reduction.",
    ],
  });

  const wvMixSpec = { kind, visualMode: "polarisation", polarisationScenario: "crossed-polaroids", harmonicN: 2, stringLengthM: 0.9, frequencyHz: 140 };
  const wvMixQ = solveKind(kind, wvMixSpec);
  addStructured(ctx, {
    slug: "wv-lor-microwave-pol-8m",
    domain: "waves",
    kind,
    conceptId: "progressive-waves-polarization",
    syllabi: TAG_331,
    difficulty: "higher",
    questionStyle: "mixed-exam",
    targetMode: "quantitative",
    scenarioSpec: wvMixSpec,
    hiddenQuantities: ["wavelengthM", "lorAnchor", "polarisationRule"],
    requiredGivens: [{ name: "stringLengthM", value: 0.9, unit: "m", source: "stem" }],
    stem: "A teacher demonstrates plane polarisation using a microwave transmitter, a rotatable metal-grille analyser, and a receiver, and also sets up a second-harmonic stationary wave on a $0.90\\text{ m}$ string.",
    parts: [
      {
        partId: "a",
        prompt: "Calculate the wavelength of the second-harmonic stationary wave on the $0.90\\text{ m}$ string.",
        marks: 2,
        targetMode: "quantitative",
        targetQuantityKey: "wavelengthM",
        expectedAnswer: fmtSig(numVal(wvMixQ, "wavelengthM"), 3, "m"),
        workingSteps: [`For the second harmonic ($n = 2$), two loops fit in $L = 0.90\\text{ m}$, so $\\lambda = L = 0.900\\text{ m}$.`],
      },
      {
        partId: "b",
        prompt:
          "Describe and explain how the microwave receiver reading changes as the receiver is rotated smoothly through $180^\\circ$ about the beam axis, and explain how this proves microwaves are transverse waves.",
        marks: 6,
        targetMode: "qualitative",
        targetQuantityKey: "lorAnchor",
        expectedAnswer:
          "The microwave transmitter emits vertically plane-polarised waves whose electric field oscillates in one vertical plane perpendicular to the direction of energy transfer. Plane polarised transverse waves restrict oscillations to a single plane whereas longitudinal waves cannot be polarised because longitudinal oscillations are parallel to energy transfer and remain symmetric under rotation about the beam axis. Initially parallel to the transmitted plane ($0^\\circ$), the receiver detects a maximum signal; as it rotates towards $90^\\circ$, the component parallel to the dipole drops to zero (minimum/zero reading); continuing from $90^\\circ$ to $180^\\circ$ restores alignment with the vertical plane so the reading rises back to maximum.",
        workingSteps: [
          "Area 1 (L1): State emitted microwaves are plane-polarised transverse waves (oscillations in one plane perpendicular to energy transfer).",
          "Area 2 (L2): Trace reading through 0° (max) -> 90° (zero/min) -> 180° (max) via dipole alignment.",
          "Area 3 (L3): Prove transverse nature by contrasting with rotationally symmetric longitudinal waves.",
        ],
      },
    ],
    workedSolution: `(a) $\\lambda = 2L/2 = 0.900\\text{ m}$. (b) Plane polarised transverse waves restrict oscillations to a single plane whereas longitudinal waves cannot be polarised; signal falls from max at $0^\\circ$ to zero at $90^\\circ$ and returns to max at $180^\\circ$.`,
    markScheme: [
      { code: "M1", criterion: "Identify second harmonic spans two half-wavelengths ($L = \\lambda$).", marks: 1, partId: "a" },
      { code: "A1", criterion: "Obtain $\\lambda = 0.900\\text{ m}$.", marks: 1, partId: "a" },
      ...makeLorCriteria("b", [
        "L1 (Area 1): States emitted microwaves are plane-polarised in one plane perpendicular to direction of energy transfer.",
        "L1 (Area 1): Notes maximum signal occurs when receiver aerial/detector aligns parallel to transmitted oscillation plane (0°).",
        "L2 (Area 2): States signal falls steadily to zero / minimum at 90° rotation (crossed orientation).",
        "L2 (Area 2): States signal rises back to maximum again at 180° rotation.",
        "L3 (Area 3): Explains longitudinal oscillations are parallel to energy transfer so rotating the detector about the beam axis would produce no intensity variation.",
        "L3 (Area 3): Concludes observed periodic variation proves microwaves are transverse waves.",
      ]),
    ],
    subpartStrategy: [
      "Find stationary wavelength from harmonic length.",
      "Six-mark Level of Response explaining microwave polarisation rotation test and transverse proof.",
    ],
  });

  // 2 Additional Structured (Stationary vs progressive comparison)
  const statS1Spec = { kind, visualMode: "stationary-wave", harmonicN: 4, stringLengthM: 1.6, frequencyHz: 200, pointPair: "adjacent-loops" };
  const statS1Q = solveKind(kind, statS1Spec);
  addStructured(ctx, {
    slug: "wv-struct-stat-compare",
    domain: "waves",
    kind,
    conceptId: "progressive-waves-polarization",
    syllabi: TAG_331,
    difficulty: "standard",
    questionStyle: "mixed-exam",
    targetMode: "quantitative",
    scenarioSpec: statS1Spec,
    hiddenQuantities: ["wavelengthM", "nodeSpacingM", "stationaryFormationRule", "energyTransferRule"],
    requiredGivens: [
      { name: "stringLengthM", value: 1.6, unit: "m", source: "either" },
      { name: "frequencyHz", value: 200, unit: "Hz", source: "stem" },
    ],
    stem: "A stretched wire of length $1.60\\text{ m}$ vibrates in its fourth harmonic ($4$ loops) at $200\\text{ Hz}$.",
    parts: [
      {
        partId: "a",
        prompt: "Explain how a stationary wave is formed on the wire.",
        marks: 2,
        targetMode: "qualitative",
        targetQuantityKey: "stationaryFormationRule",
        expectedAnswer: `It forms by the ${strVal(statS1Q, "stationaryFormationRule")}, where displacements add by vector superposition.`,
        workingSteps: ["State equal f, λ, amplitude progressive waves travelling in opposite directions superposing (vector sum of displacements)."],
      },
      {
        partId: "b",
        prompt: "Calculate the distance between two adjacent nodes and the progressive wave speed along the wire.",
        marks: 3,
        dependsOnPartIds: ["a"],
        targetMode: "quantitative",
        targetQuantityKey: "nodeSpacingM",
        expectedAnswer: `Node spacing $= ${fmtSig(numVal(statS1Q, "nodeSpacingM"), 3, "m")}$; wave speed $= ${fmtSig(numVal(statS1Q, "waveSpeedMs"), 3, "m s⁻¹")}$`,
        workingSteps: [
          `Node spacing $= L/4 = 0.400\\text{ m}$, so $\\lambda = 0.800\\text{ m}$.`,
          `Wave speed $c = f\\lambda = 200 \\times 0.800 = 160\\text{ m s}^{-1}$.`,
        ],
      },
    ],
    workedSolution: `(a) ${strVal(statS1Q, "stationaryFormationRule")}. (b) Adjacent nodes are $0.400\\text{ m}$ apart ($\\lambda = 0.800\\text{ m}$), giving $c = 160\\text{ m s}^{-1}$.`,
    markScheme: [
      { code: "B1", criterion: "Two progressive waves of same frequency, wavelength, and amplitude travelling in opposite directions.", marks: 1, partId: "a" },
      { code: "B1", criterion: "Superpose (vector sum of displacements — reject bare 'interfere' when defining superpose).", marks: 1, partId: "a" },
      { code: "A1", criterion: "Adjacent node spacing $= 0.400\\text{ m}$.", marks: 1, partId: "b" },
      { code: "M1", criterion: "Determine $\\lambda = 2 \\times 0.400 = 0.800\\text{ m}$ and apply $c = f\\lambda$.", marks: 1, partId: "b" },
      { code: "A1", criterion: "Wave speed $= 160\\text{ m s}^{-1}$.", marks: 1, partId: "b" },
    ],
    subpartStrategy: [
      "State conditions for stationary wave formation via superposition.",
      "Calculate adjacent node spacing and wave speed.",
    ],
  });

  const statS2Spec = { kind, visualMode: "stationary-wave", harmonicN: 3, stringLengthM: 1.2, frequencyHz: 150, pointPair: "adjacent-loops" };
  const statS2Q = solveKind(kind, statS2Spec);
  addStructured(ctx, {
    slug: "wv-struct-phase-energy",
    domain: "waves",
    kind,
    conceptId: "progressive-waves-polarization",
    syllabi: TAG_331,
    difficulty: "standard",
    questionStyle: "qualitative",
    targetMode: "qualitative",
    scenarioSpec: statS2Spec,
    hiddenQuantities: ["phaseRule", "energyTransferRule"],
    requiredGivens: [],
    stem: "Refer to the stationary wave diagram showing points P, Q, and R along a vibrating string.",
    parts: [
      {
        partId: "a",
        prompt: "State the phase difference between P and Q, and between P and R.",
        marks: 2,
        targetMode: "qualitative",
        targetQuantityKey: "phaseRule",
        expectedAnswer: `P and Q are in phase ($0\\text{ rad}$), whereas P and R are in ${strVal(statS2Q, "phaseRule")}.`,
        workingSteps: ["Same loop = 0 rad; separated by one node = π rad (antiphase)."],
      },
      {
        partId: "b",
        prompt: "Compare amplitude variation and energy transfer in a stationary wave with those in an undamped progressive wave.",
        marks: 2,
        targetMode: "qualitative",
        targetQuantityKey: "energyTransferRule",
        expectedAnswer: `In a stationary wave amplitude varies from zero at nodes to maximum at antinodes with ${strVal(statS2Q, "energyTransferRule")}, whereas a progressive wave has constant amplitude and transfers energy in the direction of propagation.`,
        workingSteps: ["Contrast amplitude profile and net energy transfer."],
      },
    ],
    workedSolution: `(a) P–Q: $0\\text{ rad}$ (in phase); P–R: ${strVal(statS2Q, "phaseRule")}. (b) Stationary wave has varying amplitude and ${strVal(statS2Q, "energyTransferRule")}; progressive wave has equal amplitude and transfers energy.`,
    markScheme: [
      { code: "B1", criterion: "P and Q are in phase ($0\\text{ rad}$).", marks: 1, partId: "a" },
      { code: "B1", criterion: "P and R are in antiphase ($\\pi\\text{ rad}$ / $180^\\circ$; reject vague 'out of phase').", marks: 1, partId: "a" },
      { code: "B1", criterion: "Stationary amplitude varies from zero at nodes to max at antinodes (progressive constant).", marks: 1, partId: "b" },
      { code: "B1", criterion: "No net transfer of energy along a stationary wave (progressive transfers energy).", marks: 1, partId: "b" },
    ],
    subpartStrategy: [
      "State exact phase relationships within and across stationary nodes.",
      "Compare amplitude and energy transfer between stationary and progressive waves.",
    ],
  });
}

/* -------------------------------------------------------------------------- */
/*  FAMILY 10: al-as-white-light-diffraction (11 items: 5Q + 2C + 4 Struct)   */
/* -------------------------------------------------------------------------- */

function buildFamily10WhiteLightDiffraction(ctx: BuilderContext): void {
  const kind = "al-as-white-light-diffraction" as const;

  // 5 Pure Qualitative MCQs
  addQualMcq(ctx, {
    slug: "df-white-grating-order",
    domain: "waves",
    kind,
    conceptId: "single-slit-diffraction-gratings",
    syllabi: TAG_332,
    difficulty: "foundation",
    scenarioSpec: { kind, visualMode: "white-light-grating", wavelengthNm: 550, gratingLinesPerMm: 300, orderN: 1 },
    targetQuantityKey: "whiteLightPatternRule",
    hiddenQuantities: ["whiteLightPatternRule"],
    stem: "White light is incident normally on a transmission diffraction grating as shown. Which statement accurately describes the pattern observed on the screen?",
    correctPrefix: "The screen displays a",
    distractors: [
      {
        text: "The screen displays a central black fringe flanked by different coloured monochromatic spots with red closest to the centre",
        rationale: "Commits two AQA traps: central fringe is white (not black), and red has longer wavelength so diffracts furthest (violet is closest).",
      },
      {
        text: "The screen displays a central white maximum flanked by continuous spectra with red closest to the centre and violet furthest",
        rationale: "Reverses the colour order: sin θ = nλ/d increases with λ, so shorter-wavelength violet lies closer to the centre.",
      },
      {
        text: "The screen displays equally spaced pure white fringes with no spectral dispersion",
        rationale: "Only n = 0 has zero path difference for all wavelengths; side orders disperse into spectra.",
      },
    ],
    workedNote:
      "At $n = 0$, all wavelengths constructively interfere at $\\theta = 0$ (white); for $n \\ge 1$, $\\sin\\theta = n\\lambda/d$ puts shorter-wavelength violet inner and longer-wavelength red outer.",
  });

  addQualMcq(ctx, {
    slug: "df-single-slit-width",
    domain: "waves",
    kind,
    conceptId: "single-slit-diffraction-gratings",
    syllabi: TAG_332,
    difficulty: "foundation",
    scenarioSpec: { kind, visualMode: "single-slit", wavelengthNm: 633, slitWidthMm: 0.2, screenDistanceM: 1.5 },
    targetQuantityKey: "singleSlitWidthRule",
    hiddenQuantities: ["singleSlitWidthRule"],
    stem: "Monochromatic red laser light illuminates a single narrow vertical slit to form the intensity pattern shown. Which statement correctly describes the widths of the maxima?",
    correctPrefix: "In single-slit diffraction, the",
    distractors: [
      {
        text: "In single-slit diffraction, the central maximum has the same width as every secondary maximum and narrows when slit width decreases",
        rationale: "Confuses single-slit diffraction with Young's double-slit equal-width fringes, and inverts the 1/a scaling.",
      },
      {
        text: "In single-slit diffraction, the central maximum is half as wide as each secondary maximum",
        rationale: "Inverts the 2:1 ratio between central and secondary maxima.",
      },
      {
        text: "In single-slit diffraction, the central maximum width depends only on laser intensity and not slit width",
        rationale: "Intensity scales peak height, whereas width scales as 2λD/a.",
      },
    ],
    workedNote:
      "The single-slit central maximum is twice as wide as each secondary maximum and widens when slit width decreases (or wavelength increases).",
  });

  addQualMcq(ctx, {
    slug: "df-coherence-def",
    domain: "waves",
    kind,
    conceptId: "single-slit-diffraction-gratings",
    syllabi: TAG_332,
    difficulty: "foundation",
    questionStyle: "definition",
    scenarioSpec: { kind, visualMode: "single-slit", wavelengthNm: 532, slitWidthMm: 0.25, screenDistanceM: 1.5 },
    targetQuantityKey: "coherenceDefinition",
    hiddenQuantities: ["coherenceDefinition"],
    stem: "To observe a stable interference pattern in optical experiments, the superposing light waves must be coherent. What is meant by coherent waves?",
    correctPrefix: "Coherent sources emit",
    distractors: [
      {
        text: "Coherent sources emit waves of identical amplitude travelling at different frequencies",
        rationale: "Different frequencies cause phase difference to drift rapidly, washing out interference fringes.",
      },
      {
        text: "Coherent sources emit plane-polarised waves of very high intensity regardless of phase",
        rationale: "Coherence requires a constant phase difference, not merely polarisation or brightness.",
      },
      {
        text: "Coherent sources emit white light containing every visible wavelength simultaneously",
        rationale: "White light is polychromatic and only produces localised interference near zero path difference.",
      },
    ],
    workedNote:
      "AQA definition of coherence: waves having a constant phase difference and the same frequency and wavelength.",
  });

  addQualMcq(ctx, {
    slug: "df-grating-advantage",
    domain: "waves",
    kind,
    conceptId: "single-slit-diffraction-gratings",
    syllabi: TAG_332,
    difficulty: "standard",
    scenarioSpec: { kind, visualMode: "white-light-grating", wavelengthNm: 589, gratingLinesPerMm: 400, orderN: 1 },
    targetQuantityKey: "gratingSharpnessRule",
    hiddenQuantities: ["gratingSharpnessRule"],
    stem: "Why is a diffraction grating with hundreds of slits per millimetre preferred over Young's double slit for measuring an unknown laser wavelength accurately?",
    correctPrefix: "Compared with two slits,",
    distractors: [
      {
        text: "Compared with two slits, many slits produce dimmer and broader overlapping fringes that are easier to average",
        rationale: "Gratings make maxima sharper (narrower) and brighter, not dimmer or broader.",
      },
      {
        text: "Compared with two slits, a grating eliminates the central zero-order maximum completely",
        rationale: "The bright central n = 0 maximum is always present and serves as the angular reference.",
      },
      {
        text: "Compared with two slits, a grating works even if the light is completely incoherent white noise",
        rationale: "Diffraction gratings still rely on coherent superposition across slits.",
      },
    ],
    workedNote:
      "Many slits produce narrower, brighter, and more widely separated maxima, reducing percentage uncertainty in angle measurement.",
  });

  addQualMcq(ctx, {
    slug: "df-single-slit-blue-switch",
    domain: "waves",
    kind,
    conceptId: "single-slit-diffraction-gratings",
    syllabi: TAG_332,
    difficulty: "standard",
    scenarioSpec: { kind, visualMode: "single-slit", wavelengthNm: 450, slitWidthMm: 0.2, screenDistanceM: 1.5 },
    targetQuantityKey: "singleSlitWidthRule",
    hiddenQuantities: ["singleSlitWidthRule"],
    stem: "In the single-slit diffraction experiment shown, the red laser is replaced by a blue laser of shorter wavelength while slit width and screen distance stay fixed. Which statement remains true about the new diffraction pattern?",
    correctPrefix: "The pattern becomes narrower overall, while the",
    distractors: [
      {
        text: "The pattern becomes wider overall because shorter blue wavelengths diffract through larger angles",
        rationale: "Shorter wavelength reduces diffraction spreading (width ∝ λ/a).",
      },
      {
        text: "The pattern changes so every fringe has identical width and equal peak brightness",
        rationale: "Single-slit diffraction always retains a 2:1 central width ratio and steeply decaying side peaks.",
      },
      {
        text: "The pattern shifts sideways away from the optical axis towards the violet side",
        rationale: "The pattern stays symmetric about the central maximum.",
      },
    ],
    workedNote:
      "Shorter wavelength narrows the entire pattern proportionally, while the central maximum stays twice as wide as each secondary maximum and widens only if slit width decreases.",
  });

  // 2 Quantitative MCQs
  const dfC1Spec = { kind, visualMode: "white-light-grating", wavelengthNm: 589, gratingLinesPerMm: 300, orderN: 2 };
  const dfC1 = solveKind(kind, dfC1Spec);
  addNumMcq(ctx, {
    slug: "df-calc-grating-angle",
    domain: "waves",
    kind,
    conceptId: "single-slit-diffraction-gratings",
    syllabi: TAG_332,
    difficulty: "standard",
    scenarioSpec: dfC1Spec,
    targetQuantityKey: "angleDeg",
    unit: "°",
    hiddenQuantities: ["angleDeg", "maxOrder"],
    requiredGivens: [
      { name: "wavelengthNm", value: 589, unit: "nm", source: "stem" },
      { name: "gratingLinesPerMm", value: 300, unit: "mm⁻¹", source: "stem" },
      { name: "orderN", value: 2, source: "stem" },
    ],
    stem: "Sodium light of wavelength $589\\text{ nm}$ is incident normally on a diffraction grating ruled with $300\\text{ lines mm}^{-1}$. Calculate the diffraction angle $\\theta$ of the second-order ($n = 2$) maximum.",
    distractors: [
      { value: (Math.asin(589e-9 / (1e-3 / 300)) * 180) / Math.PI, rationale: "Substitutes n = 1 instead of n = 2 into d sin θ = nλ." },
      { value: (2 * 589e-9) / (1e-3 / 300), rationale: "Stops at sin θ without taking inverse sine." },
      { value: numVal(dfC1, "angleDeg") * 2, rationale: "Quotes the total angle 2θ between left and right second-order beams." },
    ],
    workedSolution: `$d = 10^{-3}/300 = 3.33 \\times 10^{-6}\\text{ m}$; $\\sin\\theta = 2 \\times 589 \\times 10^{-9} / d = 0.3534$, giving $\\theta = ${fmtSig(numVal(dfC1, "angleDeg"), 3, "°")}$.`,
    markCriterion: `Second-order angle $\\theta = ${fmtSig(numVal(dfC1, "angleDeg"), 3, "°")}$`,
  });

  const dfC2Spec = { kind, visualMode: "white-light-grating", wavelengthNm: 620, gratingLinesPerMm: 450, orderN: 1 };
  const dfC2 = solveKind(kind, dfC2Spec);
  addNumMcq(ctx, {
    slug: "df-calc-max-order",
    domain: "waves",
    kind,
    conceptId: "single-slit-diffraction-gratings",
    syllabi: TAG_332,
    difficulty: "standard",
    scenarioSpec: dfC2Spec,
    targetQuantityKey: "maxOrder",
    hiddenQuantities: ["maxOrder"],
    requiredGivens: [
      { name: "wavelengthNm", value: 620, unit: "nm", source: "stem" },
      { name: "gratingLinesPerMm", value: 450, unit: "mm⁻¹", source: "stem" },
    ],
    stem: "Monochromatic light of wavelength $620\\text{ nm}$ strikes a diffraction grating with $450\\text{ lines mm}^{-1}$ at normal incidence. What is the highest order $n_{\\max}$ of diffraction maximum observable?",
    distractors: [
      { value: numVal(dfC2, "maxOrder") + 1, rationale: "Rounds up instead of rounding down (sin θ cannot exceed 1)." },
      { value: 2 * numVal(dfC2, "maxOrder") + 1, rationale: "Counts total visible bright spots (2n_max + 1) instead of the highest order number." },
      { value: Math.max(1, numVal(dfC2, "maxOrder") - 1), rationale: "Subtracts one unnecessarily after flooring d/λ." },
    ],
    workedSolution: `$d = 10^{-3}/450 = 2.222 \\times 10^{-6}\\text{ m}$; $d/\\lambda = 2.222 \\times 10^{-6} / 620 \\times 10^{-9} = 3.58$, so highest integer order $n_{\\max} = ${numVal(dfC2, "maxOrder")}$.`,
    markCriterion: `Maximum order $n_{\\max} = ${numVal(dfC2, "maxOrder")}$`,
  });

  // 4 Structured Questions
  const dfStructs = [
    {
      slug: "df-struct-white-spread",
      spec: { kind, visualMode: "white-light-grating", wavelengthNm: 550, gratingLinesPerMm: 300, orderN: 1 },
      stem: "White light ($\\lambda$ from $400\\text{ nm}$ violet to $700\\text{ nm}$ red) falls normally onto a diffraction grating with $300\\text{ lines mm}^{-1}$.",
      isGrating: true,
      lines: 300,
    },
    {
      slug: "df-struct-grating-400",
      spec: { kind, visualMode: "white-light-grating", wavelengthNm: 520, gratingLinesPerMm: 400, orderN: 2 },
      stem: "A white-light beam containing wavelengths $400\\text{ nm}$ to $700\\text{ nm}$ illuminates a grating ruled with $400\\text{ lines mm}^{-1}$ at normal incidence.",
      isGrating: true,
      lines: 400,
    },
    {
      slug: "df-struct-single-red",
      spec: { kind, visualMode: "single-slit", wavelengthNm: 633, slitWidthMm: 0.2, screenDistanceM: 1.8 },
      stem: "A helium–neon laser ($\\lambda = 633\\text{ nm}$) illuminates a single vertical slit of width $a = 0.20\\text{ mm}$ placed $1.80\\text{ m}$ in front of a screen.",
      isGrating: false,
      lines: 0,
    },
    {
      slug: "df-struct-single-green",
      spec: { kind, visualMode: "single-slit", wavelengthNm: 532, slitWidthMm: 0.15, screenDistanceM: 2.1 },
      stem: "A green diode laser ($\\lambda = 532\\text{ nm}$) illuminates a single narrow slit of width $a = 0.15\\text{ mm}$ at a distance $2.10\\text{ m}$ from a screen.",
      isGrating: false,
      lines: 0,
    },
  ];

  for (const s of dfStructs) {
    const q = solveKind(kind, s.spec);
    if (s.isGrating) {
      const spread = numVal(q, "angularSpreadDeg");
      addStructured(ctx, {
        slug: s.slug,
        domain: "waves",
        kind,
        conceptId: "single-slit-diffraction-gratings",
        syllabi: TAG_332,
        difficulty: "standard",
        questionStyle: "mixed-exam",
        targetMode: "quantitative",
        scenarioSpec: s.spec,
        hiddenQuantities: ["angularSpreadDeg", "violetAngleDeg", "redAngleDeg", "whiteLightPatternRule"],
        requiredGivens: [{ name: "gratingLinesPerMm", value: s.lines, unit: "mm⁻¹", source: "stem" }],
        stem: s.stem,
        parts: [
          {
            partId: "a",
            prompt: "Describe the appearance of the central maximum and the first-order side fringes produced by white light.",
            marks: 2,
            targetMode: "qualitative",
            targetQuantityKey: "whiteLightPatternRule",
            expectedAnswer: `The grating produces a ${strVal(q, "whiteLightPatternRule")}.`,
            workingSteps: ["Specify central white maximum and continuous side spectra with violet inner and red outer (reject vague 'different colour fringes')."],
          },
          {
            partId: "b",
            prompt: `Calculate the angular width ($\\theta_{\\text{red}} - \\theta_{\\text{violet}}$) of the order $n = ${s.spec.orderN}$ spectrum.`,
            marks: 3,
            targetMode: "quantitative",
            targetQuantityKey: "angularSpreadDeg",
            expectedAnswer: fmtSig(spread, 3, "°"),
            workingSteps: [
              `Grating spacing $d = 10^{-3} / ${s.lines} = ${fmtSig(numVal(q, "gratingSpacingM"), 3, "m")}$.`,
              `Violet angle $= ${fmtSig(numVal(q, "violetAngleDeg"), 3, "°")}$, red angle $= ${fmtSig(numVal(q, "redAngleDeg"), 3, "°")}$.`,
              `Angular spread $= ${fmtSig(spread, 3, "°")}$.`,
            ],
          },
        ],
        workedSolution: `(a) ${strVal(q, "whiteLightPatternRule")}. (b) $d = ${fmtSig(numVal(q, "gratingSpacingM"), 3, "m")}$, giving $\\theta_{\\text{violet}} = ${fmtSig(numVal(q, "violetAngleDeg"), 3, "°")}$, $\\theta_{\\text{red}} = ${fmtSig(numVal(q, "redAngleDeg"), 3, "°")}$, spread $= ${fmtSig(spread, 3, "°")}$.`,
        markScheme: [
          { code: "B1", criterion: "Central maximum ($n=0$) is white because path difference is zero for all wavelengths.", marks: 1, partId: "a" },
          { code: "B1", criterion: "Side orders are continuous spectra with violet closest to centre and red furthest (reject 'different colour fringes').", marks: 1, partId: "a" },
          { code: "M1", criterion: `Calculate $d = ${fmtSig(numVal(q, "gratingSpacingM"), 3, "m")}$ and apply $d\\sin\\theta = n\\lambda$ for $400\\text{ nm}$ and $700\\text{ nm}$.`, marks: 1, partId: "b" },
          { code: "A1", criterion: `Correct individual angles (${fmtSig(numVal(q, "violetAngleDeg"), 3, "°")} and ${fmtSig(numVal(q, "redAngleDeg"), 3, "°")}).`, marks: 1, partId: "b" },
          { code: "A1", criterion: `Angular spread $= ${fmtSig(spread, 3, "°")}$.`, marks: 1, partId: "b" },
        ],
        subpartStrategy: [
          "Describe white-light grating spectrum order.",
          "Calculate angular width of the diffracted visible spectrum.",
        ],
      });
    } else {
      const wMm = numVal(q, "centralWidthMm");
      addStructured(ctx, {
        slug: s.slug,
        domain: "waves",
        kind,
        conceptId: "single-slit-diffraction-gratings",
        syllabi: TAG_332,
        difficulty: "standard",
        questionStyle: "mixed-exam",
        targetMode: "quantitative",
        scenarioSpec: s.spec,
        hiddenQuantities: ["centralWidthMm", "centralWidthM", "singleSlitWidthRule"],
        requiredGivens: [
          { name: "wavelengthNm", value: s.spec.wavelengthNm, unit: "nm", source: "stem" },
          { name: "slitWidthMm", value: s.spec.slitWidthMm!, unit: "mm", source: "stem" },
          { name: "screenDistanceM", value: s.spec.screenDistanceM!, unit: "m", source: "stem" },
        ],
        stem: s.stem,
        parts: [
          {
            partId: "a",
            prompt: "Calculate the width of the central diffraction maximum (between the two first-order minima) in millimetres using $W \\approx 2\\lambda D / a$.",
            marks: 2,
            targetMode: "quantitative",
            targetQuantityKey: "centralWidthMm",
            expectedAnswer: fmtSig(wMm, 3, "mm"),
            workingSteps: [
              `Substitute $\\lambda = ${s.spec.wavelengthNm} \\times 10^{-9}\\text{ m}$, $D = ${s.spec.screenDistanceM}\\text{ m}$, $a = ${s.spec.slitWidthMm} \\times 10^{-3}\\text{ m}$.`,
              `Evaluate $W = 2\\lambda D / a = ${fmtSig(wMm, 3, "mm")}$.`,
            ],
          },
          {
            partId: "b",
            prompt: "Compare the width of the central maximum with a secondary maximum, and state what happens to the pattern if the slit is made narrower.",
            marks: 2,
            targetMode: "qualitative",
            targetQuantityKey: "singleSlitWidthRule",
            expectedAnswer: `The ${strVal(q, "singleSlitWidthRule")} (and peak intensity decreases because less light passes through).`,
            workingSteps: ["State 2:1 width ratio and inverse scaling with slit width a."],
          },
        ],
        workedSolution: `(a) $W = 2\\lambda D / a = ${fmtSig(wMm, 3, "mm")}$. (b) ${strVal(q, "singleSlitWidthRule")}.`,
        markScheme: [
          { code: "M1", criterion: "Correctly substitute SI values into $W = 2\\lambda D / a$.", marks: 1, partId: "a" },
          { code: "A1", criterion: `Central width $= ${fmtSig(wMm, 3, "mm")}$.`, marks: 1, partId: "a" },
          { code: "B1", criterion: "Central maximum is twice as wide as each secondary maximum.", marks: 1, partId: "b" },
          { code: "B1", criterion: "Narrowing the slit widens the diffraction pattern (and reduces brightness).", marks: 1, partId: "b" },
        ],
        subpartStrategy: [
          "Compute single-slit central maximum width.",
          "Describe double-width central ratio and slit-width scaling.",
        ],
      });
    }
  }
}

/* -------------------------------------------------------------------------- */
/*  FAMILY 11: al-as-optical-fibre-dispersion (11 items: 5Q+2C+4 [2 LoR])     */
/* -------------------------------------------------------------------------- */

function buildFamily11OpticalFibre(ctx: BuilderContext): void {
  const kind = "al-as-optical-fibre-dispersion" as const;

  // 5 Pure Qualitative MCQs
  addQualMcq(ctx, {
    slug: "of-tir-strict-condition",
    domain: "optics-shm",
    kind,
    conceptId: "refraction-snell-tir",
    syllabi: TAG_332,
    difficulty: "foundation",
    scenarioSpec: { kind, coreIndex: 1.52, claddingIndex: 1.46, fibreLengthKm: 2.0, dispersionFocus: "cladding-tir" },
    targetQuantityKey: "tirConditionRule",
    hiddenQuantities: ["tirConditionRule"],
    stem: "Which statement states the exact two conditions required for total internal reflection (TIR) at the core–cladding boundary of a step-index optical fibre?",
    correctPrefix: "Total internal reflection occurs when the",
    distractors: [
      {
        text: "Total internal reflection occurs when the core refractive index exceeds cladding index and angle of incidence equals the critical angle",
        rationale: "Explicit AQA reject rule: at θ = θ_c the ray refracts along the boundary (90°); TIR requires θ strictly greater than θ_c.",
      },
      {
        text: "Total internal reflection occurs when the cladding refractive index exceeds core index and angle of incidence is smaller than the critical angle",
        rationale: "Reverses both conditions; light must travel from optically denser core (n₁) toward less dense cladding (n₂).",
      },
      {
        text: "Total internal reflection occurs when the fibre is bent sharply so the critical angle increases above ninety degrees",
        rationale: "AQA reject rule: bending a fibre changes the angle of incidence θ, NEVER the critical angle θ_c = arcsin(n₂/n₁).",
      },
    ],
    workedNote:
      "TIR requires $n_{\\text{core}} > n_{\\text{clad}}$ AND angle of incidence strictly greater than critical angle ($\\theta > \\theta_{\\text{c}}$).",
  });

  addQualMcq(ctx, {
    slug: "of-cladding-functions",
    domain: "optics-shm",
    kind,
    conceptId: "refraction-snell-tir",
    syllabi: TAG_332,
    difficulty: "foundation",
    scenarioSpec: { kind, coreIndex: 1.5, claddingIndex: 1.44, fibreLengthKm: 1.0, dispersionFocus: "cladding-tir" },
    targetQuantityKey: "claddingFunctions",
    hiddenQuantities: ["claddingFunctions"],
    stem: "Why is the glass core of a telecommunications optical fibre surrounded by a glass cladding layer of lower refractive index rather than bare air?",
    correctPrefix: "The lower-index cladding",
    distractors: [
      {
        text: "The lower-index cladding amplifies optical pulses electrically along the fibre",
        rationale: "Cladding is passive glass and provides no optical amplification.",
      },
      {
        text: "The lower-index cladding increases the critical angle to zero degrees so even sharp bends never lose light",
        rationale: "A smaller n₂/n₁ ratio lowers θ_c; cladding has higher n than air, which actually raises θ_c and reduces modal dispersion.",
      },
      {
        text: "The lower-index cladding eliminates material dispersion completely for white light",
        rationale: "Material dispersion depends on wavelength-dependent refractive index inside the core, not cladding protection.",
      },
    ],
    workedNote:
      "Cladding protects the core from surface scratches, prevents crosstalk between adjacent fibres, and provides a clean lower-index boundary for TIR (also reducing modal dispersion).",
  });

  addQualMcq(ctx, {
    slug: "of-modal-mitigation",
    domain: "optics-shm",
    kind,
    conceptId: "refraction-snell-tir",
    syllabi: TAG_332,
    difficulty: "standard",
    scenarioSpec: { kind, coreIndex: 1.52, claddingIndex: 1.46, fibreLengthKm: 5.0, dispersionFocus: "modal" },
    targetQuantityKey: "modalMitigation",
    hiddenQuantities: ["modalMitigation"],
    stem: "Monochromatic infrared pulses broaden as they travel along a wide step-index multimode fibre because oblique rays travel further than axial rays. How is this modal dispersion minimised?",
    correctPrefix: "To minimise modal dispersion, engineers",
    distractors: [
      {
        text: "To minimise modal dispersion, engineers switch from a laser to a broadband white LED source",
        rationale: "Broadband white light worsens material dispersion and does not fix multipath modal dispersion.",
      },
      {
        text: "To minimise modal dispersion, engineers widen the core diameter so more reflection angles fit inside",
        rationale: "A wider core allows steeper oblique rays with larger path differences, worsening modal dispersion.",
      },
      {
        text: "To minimise modal dispersion, engineers remove the cladding so the fibre is surrounded by air",
        rationale: "Replacing cladding with air lowers θ_c, allowing steeper zigzag paths and increasing modal path-length spread.",
      },
    ],
    workedNote:
      "Using a very narrow core (single-mode fibre) forces rays to travel almost axially along nearly identical path lengths.",
  });

  addQualMcq(ctx, {
    slug: "of-material-mitigation",
    domain: "optics-shm",
    kind,
    conceptId: "refraction-snell-tir",
    syllabi: TAG_332,
    difficulty: "standard",
    scenarioSpec: { kind, coreIndex: 1.52, claddingIndex: 1.46, fibreLengthKm: 5.0, dispersionFocus: "material" },
    targetQuantityKey: "materialMitigation",
    hiddenQuantities: ["materialMitigation"],
    stem: "Even in a narrow single-mode fibre, a white-light pulse broadens because red and violet wavelengths have different refractive indices in silica glass. How is material dispersion eliminated?",
    correctPrefix: "To eliminate material dispersion, engineers",
    distractors: [
      {
        text: "To eliminate material dispersion, engineers make the core diameter much narrower while keeping white light",
        rationale: "A narrow core reduces modal dispersion, not material (spectral) dispersion.",
      },
      {
        text: "To eliminate material dispersion, engineers increase the length of the optical fibre",
        rationale: "Longer fibre increases the arrival-time separation between wavelengths proportionally.",
      },
      {
        text: "To eliminate material dispersion, engineers increase the intensity of the broadband source",
        rationale: "Higher intensity does not change wave speed v = c/n(λ).",
      },
    ],
    workedNote:
      "Material dispersion is caused by wavelength-dependent speed $v = c/n(\\lambda)$, mitigated by using monochromatic light (e.g. a narrow-band laser).",
  });

  addQualMcq(ctx, {
    slug: "of-pulse-broadening-effect",
    domain: "optics-shm",
    kind,
    conceptId: "refraction-snell-tir",
    syllabi: TAG_332,
    difficulty: "foundation",
    scenarioSpec: { kind, coreIndex: 1.52, claddingIndex: 1.46, fibreLengthKm: 3.0, dispersionFocus: "both" },
    targetQuantityKey: "pulseBroadeningConsequence",
    hiddenQuantities: ["pulseBroadeningConsequence"],
    stem: "Look at the input and output signal inset on the optical fibre diagram. Why is pulse broadening a serious limitation in digital optical communication links?",
    correctPrefix: "When pulses spread in time,",
    distractors: [
      {
        text: "When pulses spread in time, all light immediately escapes out of the cladding via refraction",
        rationale: "Dispersion spreads arrival times of guided rays; it is distinct from bend-loss refraction.",
      },
      {
        text: "When pulses spread in time, the frequency of the laser doubles inside the core",
        rationale: "Wave frequency remains constant across optical media.",
      },
      {
        text: "When pulses spread in time, data rate increases because longer pulses carry more energy",
        rationale: "Overlapping pulses merge binary 1s and 0s, forcing lower bit rates or closer repeater stations.",
      },
    ],
    workedNote:
      "Broadened pulses overlap causing data corruption and limiting maximum transmission rate.",
  });

  // 2 Quantitative MCQs
  const ofC1Spec = { kind, coreIndex: 1.54, claddingIndex: 1.46, fibreLengthKm: 2.0, dispersionFocus: "cladding-tir" };
  const ofC1 = solveKind(kind, ofC1Spec);
  addNumMcq(ctx, {
    slug: "of-calc-critical-angle",
    domain: "optics-shm",
    kind,
    conceptId: "refraction-snell-tir",
    syllabi: TAG_332,
    difficulty: "foundation",
    scenarioSpec: ofC1Spec,
    targetQuantityKey: "criticalAngleDeg",
    unit: "°",
    hiddenQuantities: ["criticalAngleDeg"],
    requiredGivens: [
      { name: "coreIndex", value: 1.54, source: "either" },
      { name: "claddingIndex", value: 1.46, source: "either" },
    ],
    stem: "A step-index optical fibre has core refractive index $n_1 = 1.54$ and cladding refractive index $n_2 = 1.46$. Calculate the critical angle $\\theta_{\\text{c}}$ at the core–cladding boundary.",
    distractors: [
      { value: (Math.asin(1 / 1.54) * 180) / Math.PI, rationale: "Uses core–air interface (1/n₁) and ignores the glass cladding index n₂." },
      { value: 90 - numVal(ofC1, "criticalAngleDeg"), rationale: "Gives the glancing angle to the boundary rather than the angle measured from the normal." },
      { value: (1.46 / 1.54) * 90, rationale: "Multiplies sin θ_c linearly by 90° instead of taking arcsin." },
    ],
    workedSolution: `$\\sin\\theta_{\\text{c}} = n_2 / n_1 = 1.46 / 1.54 = 0.9481$, so $\\theta_{\\text{c}} = ${fmtSig(numVal(ofC1, "criticalAngleDeg"), 3, "°")}$.`,
    markCriterion: `Critical angle $\\theta_{\\text{c}} = ${fmtSig(numVal(ofC1, "criticalAngleDeg"), 3, "°")}$`,
  });

  const ofC2Spec = { kind, coreIndex: 1.52, claddingIndex: 1.46, fibreLengthKm: 1.5, dispersionFocus: "modal" };
  const ofC2 = solveKind(kind, ofC2Spec);
  addNumMcq(ctx, {
    slug: "of-calc-modal-delay",
    domain: "optics-shm",
    kind,
    conceptId: "refraction-snell-tir",
    syllabi: TAG_332,
    difficulty: "higher",
    scenarioSpec: ofC2Spec,
    targetQuantityKey: "modalDelayNs",
    unit: "ns",
    hiddenQuantities: ["modalDelayNs", "modalDelayS"],
    requiredGivens: [
      { name: "coreIndex", value: 1.52, source: "either" },
      { name: "claddingIndex", value: 1.46, source: "either" },
      { name: "fibreLengthKm", value: 1.5, unit: "km", source: "stem" },
    ],
    stem: "A $1.50\\text{ km}$ step-index optical fibre has $n_1 = 1.52$ and $n_2 = 1.46$. Using $c = 3.00 \\times 10^8\\text{ m s}^{-1}$, calculate the maximum modal arrival-time difference (in nanoseconds) between an axial ray and a ray reflecting at the critical angle.",
    distractors: [
      { value: numVal(ofC2, "axialTimeS") * 1e9, rationale: "Quotes the total axial transit time instead of the delay difference between slowest and fastest rays." },
      { value: numVal(ofC2, "modalDelayNs") / 1.52, rationale: "Uses vacuum speed c instead of core speed c/n₁." },
      { value: numVal(ofC2, "modalDelayNs") * 2, rationale: "Applies an extraneous factor of two." },
    ],
    workedSolution: `Core speed $v = c/n_1 = 1.974 \\times 10^8\\text{ m s}^{-1}$; axial time $t_{\\min} = L/v = 7.60 \\times 10^{-6}\\text{ s}$; longest guided path $L/\\sin\\theta_{\\text{c}} = L(n_1/n_2)$, so $\\Delta t = t_{\\min}(n_1/n_2 - 1) = ${fmtSig(numVal(ofC2, "modalDelayNs"), 3, "ns")}$.`,
    markCriterion: `Modal delay $= ${fmtSig(numVal(ofC2, "modalDelayNs"), 3, "ns")}$`,
  });

  // 2 Authentic 6-Mark LoR (#5 Blueprint) + 2 Structured
  addStructured(ctx, {
    slug: "of-lor-dispersion-6m",
    domain: "optics-shm",
    kind,
    conceptId: "refraction-snell-tir",
    syllabi: TAG_332,
    difficulty: "higher",
    questionStyle: "qualitative",
    targetMode: "qualitative",
    scenarioSpec: { kind, coreIndex: 1.52, claddingIndex: 1.46, fibreLengthKm: 4.0, dispersionFocus: "both" },
    hiddenQuantities: ["lorAnchor", "tirConditionRule", "claddingFunctions", "modalMitigation", "materialMitigation"],
    requiredGivens: [],
    stem: "Step-index optical fibres carry high-speed digital data across cities using pulses of light guided along a glass core surrounded by glass cladding, as illustrated.",
    parts: [
      {
        partId: "a",
        prompt:
          "Explain the purpose of the core and cladding in an optical fibre, clearly distinguish between modal dispersion and material dispersion, explain the effect of both on digital signals, and state how each form of dispersion is reduced.",
        marks: 6,
        targetMode: "qualitative",
        targetQuantityKey: "lorAnchor",
        expectedAnswer:
          "The transparent low-absorption core ($n_1 > n_2$) guides pulses by total internal reflection whenever the angle of incidence is strictly greater than the critical angle ($\\theta > \\theta_{\\text{c}}$); the lower-index cladding protects the core from surface scratches, prevents crosstalk between adjacent fibres, and provides a clean boundary for TIR. Modal dispersion arises from different ray path lengths whereas material dispersion arises from different wavelengths travelling at different speeds in glass because refractive index depends on wavelength. Both cause pulse broadening, so successive pulses overlap, corrupting data and reducing maximum transmission rate/bandwidth. Modal dispersion is reduced by using a very narrow (single-mode) core (or graded index / small $n_1 - n_2$), while material dispersion is reduced by using monochromatic light from a laser.",
        workingSteps: [
          "Area 1 (L1): Core (n₁ > n₂, TIR for θ > θ_c strictly) and cladding (scratch protection, no crosstalk, TIR boundary).",
          "Area 2 (L2): Modal dispersion = different entry angles/path lengths -> mitigated by narrow core.",
          "Area 3 (L3): Material dispersion = different wavelengths travel at different speeds (n varies with λ) -> mitigated by monochromatic light; link both to pulse broadening/overlap/data rate limit.",
        ],
      },
    ],
    workedSolution:
      "Level 3 (5–6 marks): Explains core/cladding roles and strict $\\theta > \\theta_{\\text{c}}$ TIR; clearly distinguishes modal dispersion arises from different ray path lengths whereas material dispersion arises from different wavelengths travelling at different speeds (max L2 if swapped); gives exact mitigations (narrow core; monochromatic light) and links to pulse overlap / reduced data rate.",
    markScheme: makeLorCriteria("a", [
      "L1 (Area 1): Core has higher refractive index than cladding (n₁ > n₂) and guides light by TIR when angle of incidence is strictly greater than critical angle (reject 'at critical angle').",
      "L1 (Area 1): Cladding protects core surface from scratches, prevents crosstalk between touching fibres, and provides clean lower-index TIR boundary.",
      "L2 (Area 2): Modal dispersion: rays enter at different angles and follow different path lengths, arriving at different times.",
      "L2 (Area 2): Modal dispersion reduced by using a very narrow core (single-mode fibre) or smaller core–cladding index difference.",
      "L3 (Area 3): Material dispersion: different wavelengths travel at different speeds because refractive index varies with wavelength; reduced using monochromatic light (max L2 if modal & material swapped).",
      "L3 (Area 3): Links both dispersion mechanisms to pulse broadening, overlapping pulses, signal corruption, and reduced maximum data rate.",
    ]),
    subpartStrategy: [
      "Six-mark Level of Response covering optical fibre structure, modal vs material dispersion, and engineering mitigations.",
    ],
  });

  const ofMixSpec = { kind, coreIndex: 1.5, claddingIndex: 1.44, fibreLengthKm: 3.0, violetIndex: 1.515, redIndex: 1.495, dispersionFocus: "both" };
  const ofMixQ = solveKind(kind, ofMixSpec);
  addStructured(ctx, {
    slug: "of-lor-telecom-mix-9m",
    domain: "optics-shm",
    kind,
    conceptId: "refraction-snell-tir",
    syllabi: TAG_332,
    difficulty: "higher",
    questionStyle: "mixed-exam",
    targetMode: "quantitative",
    scenarioSpec: ofMixSpec,
    hiddenQuantities: ["criticalAngleDeg", "coreSpeedMs", "lorAnchor", "tirConditionRule"],
    requiredGivens: [
      { name: "coreIndex", value: 1.5, source: "either" },
      { name: "claddingIndex", value: 1.44, source: "either" },
    ],
    stem: "A $3.00\\text{ km}$ medical-imaging optical fibre has core refractive index $1.50$ and cladding refractive index $1.44$. Take $c = 3.00 \\times 10^8\\text{ m s}^{-1}$.",
    parts: [
      {
        partId: "a",
        prompt: "Calculate the speed of light inside the core and the critical angle at the core–cladding boundary.",
        marks: 3,
        targetMode: "quantitative",
        targetQuantityKey: "criticalAngleDeg",
        expectedAnswer: `Core speed $= ${fmtSig(numVal(ofMixQ, "coreSpeedMs"), 3, "m s⁻¹")}$; critical angle $= ${fmtSig(numVal(ofMixQ, "criticalAngleDeg"), 3, "°")}$`,
        workingSteps: [
          `Core speed $v = c/n_1 = 3.00 \\times 10^8 / 1.50 = 2.00 \\times 10^8\\text{ m s}^{-1}$.`,
          `Critical angle $\\theta_{\\text{c}} = \\arcsin(1.44/1.50) = ${fmtSig(numVal(ofMixQ, "criticalAngleDeg"), 3, "°")}$.`,
        ],
      },
      {
        partId: "b",
        prompt:
          "Explain what happens if the fibre is bent too tightly so a ray strikes the boundary at $\\theta < \\theta_{\\text{c}}$, and explain how modal dispersion and material dispersion degrade transmitted pulses and how engineers reduce both.",
        marks: 6,
        targetMode: "qualitative",
        targetQuantityKey: "lorAnchor",
        expectedAnswer:
          "Bending the fibre too tightly does not change the critical angle $\\theta_{\\text{c}}$, but reduces the angle of incidence below $\\theta_{\\text{c}}$ so some light refracts out into the cladding (attenuating the signal; do not say all light escapes). Alongside bend loss, modal dispersion arises from different ray path lengths whereas material dispersion arises from different wavelengths travelling at different speeds due to wavelength-dependent core refractive index. Both broaden output pulses until adjacent pulses overlap, limiting bandwidth; narrow single-mode cores mitigate modal dispersion while monochromatic laser light mitigates material dispersion.",
        workingSteps: [
          "Area 1 (L1): Tight bend lowers angle of incidence below θ_c (θ_c unchanged) -> partial refraction out into cladding reduces intensity.",
          "Area 2 (L2): Modal dispersion (path-length differences) + narrow core mitigation.",
          "Area 3 (L3): Material dispersion (wavelength speed differences) + monochromatic laser mitigation + pulse overlap/data-rate link.",
        ],
      },
    ],
    workedSolution: `(a) $v = 2.00 \\times 10^8\\text{ m s}^{-1}$, $\\theta_{\\text{c}} = ${fmtSig(numVal(ofMixQ, "criticalAngleDeg"), 3, "°")}$. (b) Bending lowers $\\theta$ (never $\\theta_{\\text{c}}$) causing partial refraction loss; modal dispersion arises from different ray path lengths whereas material dispersion arises from different wavelengths travelling at different speeds.`,
    markScheme: [
      { code: "A1", criterion: "Core speed $v = 2.00 \\times 10^8\\text{ m s}^{-1}$.", marks: 1, partId: "a" },
      { code: "M1", criterion: "Apply $\\sin\\theta_{\\text{c}} = n_2/n_1 = 1.44/1.50$.", marks: 1, partId: "a" },
      { code: "A1", criterion: `Critical angle $= ${fmtSig(numVal(ofMixQ, "criticalAngleDeg"), 3, "°")}$.`, marks: 1, partId: "a" },
      ...makeLorCriteria("b", [
        "L1 (Area 1): Bending decreases angle of incidence below θ_c while critical angle itself remains unchanged (reject 'critical angle changes').",
        "L1 (Area 1): Some light refracts out into the cladding causing signal attenuation (reject 'all light escapes').",
        "L2 (Area 2): Modal dispersion: rays entering at different angles follow different path lengths and arrive at different times.",
        "L2 (Area 2): Modal dispersion reduced using a very narrow (single-mode) core.",
        "L3 (Area 3): Material dispersion: different wavelengths travel at different speeds (different n); reduced with monochromatic light.",
        "L3 (Area 3): Links both to pulse broadening, overlapping adjacent pulses, and reduced data transmission rate.",
      ]),
    ],
    subpartStrategy: [
      "Calculate core wave speed and core-cladding critical angle.",
      "Six-mark Level of Response on tight bending loss and modal vs material dispersion.",
    ],
  });

  // 2 Additional Shorter Structured
  const ofS3Spec = { kind, coreIndex: 1.55, claddingIndex: 1.45, fibreLengthKm: 2.5, dispersionFocus: "modal" };
  const ofS3Q = solveKind(kind, ofS3Spec);
  addStructured(ctx, {
    slug: "of-struct-modal-time",
    domain: "optics-shm",
    kind,
    conceptId: "refraction-snell-tir",
    syllabi: TAG_332,
    difficulty: "higher",
    questionStyle: "mixed-exam",
    targetMode: "quantitative",
    scenarioSpec: ofS3Spec,
    hiddenQuantities: ["axialTimeS", "modalDelayNs", "modalMitigation"],
    requiredGivens: [
      { name: "coreIndex", value: 1.55, source: "either" },
      { name: "claddingIndex", value: 1.45, source: "either" },
      { name: "fibreLengthKm", value: 2.5, unit: "km", source: "stem" },
    ],
    stem: "A monochromatic pulse travels down a $2.50\\text{ km}$ step-index fibre with $n_1 = 1.55$ and $n_2 = 1.45$. Take $c = 3.00 \\times 10^8\\text{ m s}^{-1}$.",
    parts: [
      {
        partId: "a",
        prompt: "Calculate the modal time spread (in ns) between an axial ray and a ray reflecting at the critical angle.",
        marks: 3,
        targetMode: "quantitative",
        targetQuantityKey: "modalDelayNs",
        expectedAnswer: fmtSig(numVal(ofS3Q, "modalDelayNs"), 3, "ns"),
        workingSteps: [
          `Axial time $t_{\\min} = L n_1 / c = ${fmtSig(numVal(ofS3Q, "axialTimeS"), 3, "s")}$.`,
          `Modal delay $\\Delta t = t_{\\min}(n_1/n_2 - 1) = ${fmtSig(numVal(ofS3Q, "modalDelayNs"), 3, "ns")}$.`,
        ],
      },
      {
        partId: "b",
        prompt: "State one design modification to reduce this modal time spread.",
        marks: 1,
        targetMode: "qualitative",
        targetQuantityKey: "modalMitigation",
        expectedAnswer: `To reduce modal dispersion, ${strVal(ofS3Q, "modalMitigation")}.`,
        workingSteps: ["Use a narrow single-mode core (or bring n₂ closer to n₁)."],
      },
    ],
    workedSolution: `(a) $\\Delta t = (Ln_1/c)(n_1/n_2 - 1) = ${fmtSig(numVal(ofS3Q, "modalDelayNs"), 3, "ns")}$. (b) ${strVal(ofS3Q, "modalMitigation")}.`,
    markScheme: [
      { code: "M1", criterion: "Calculate axial transit time $t_{\\min} = L n_1 / c$.", marks: 1, partId: "a" },
      { code: "M1", criterion: "Multiply by $(n_1/n_2 - 1)$ for longest path at $\\theta_{\\text{c}}$.", marks: 1, partId: "a" },
      { code: "A1", criterion: `Modal delay $= ${fmtSig(numVal(ofS3Q, "modalDelayNs"), 3, "ns")}$.`, marks: 1, partId: "a" },
      { code: "B1", criterion: "Use a very narrow (single-mode) core.", marks: 1, partId: "b" },
    ],
    subpartStrategy: [
      "Compute modal pulse delay from core/cladding indices and length.",
      "State narrow-core mitigation.",
    ],
  });

  const ofS4Spec = { kind, coreIndex: 1.52, claddingIndex: 1.46, fibreLengthKm: 5.0, violetIndex: 1.534, redIndex: 1.512, dispersionFocus: "material" };
  const ofS4Q = solveKind(kind, ofS4Spec);
  addStructured(ctx, {
    slug: "of-struct-material-delay",
    domain: "optics-shm",
    kind,
    conceptId: "refraction-snell-tir",
    syllabi: TAG_332,
    difficulty: "standard",
    questionStyle: "mixed-exam",
    targetMode: "quantitative",
    scenarioSpec: ofS4Spec,
    hiddenQuantities: ["materialDelayNs", "materialDelayS", "materialMitigation"],
    requiredGivens: [
      { name: "fibreLengthKm", value: 5.0, unit: "km", source: "stem" },
      { name: "violetIndex", value: 1.534, source: "stem" },
      { name: "redIndex", value: 1.512, source: "stem" },
    ],
    stem: "A white-light pulse travels axially along a $5.00\\text{ km}$ narrow core where $n_{\\text{violet}} = 1.534$ and $n_{\\text{red}} = 1.512$. Take $c = 3.00 \\times 10^8\\text{ m s}^{-1}$.",
    parts: [
      {
        partId: "a",
        prompt: "Calculate the arrival-time difference (in ns) between the red and violet axial components.",
        marks: 3,
        targetMode: "quantitative",
        targetQuantityKey: "materialDelayNs",
        expectedAnswer: fmtSig(numVal(ofS4Q, "materialDelayNs"), 3, "ns"),
        workingSteps: [
          `Apply $\\Delta t = (L/c)(n_{\\text{violet}} - n_{\\text{red}})$.`,
          `Evaluate $\\Delta t = (5000 / 3.00 \\times 10^8)(1.534 - 1.512) = ${fmtSig(numVal(ofS4Q, "materialDelayNs"), 3, "ns")}$.`,
        ],
      },
      {
        partId: "b",
        prompt: "State how material dispersion is prevented in long-haul optical links.",
        marks: 1,
        targetMode: "qualitative",
        targetQuantityKey: "materialMitigation",
        expectedAnswer: `Engineers ${strVal(ofS4Q, "materialMitigation")}.`,
        workingSteps: ["Specify monochromatic light source (laser)."],
      },
    ],
    workedSolution: `(a) $\\Delta t = (L/c)(n_{\\text{V}} - n_{\\text{R}}) = ${fmtSig(numVal(ofS4Q, "materialDelayNs"), 3, "ns")}$. (b) ${strVal(ofS4Q, "materialMitigation")}.`,
    markScheme: [
      { code: "M1", criterion: "Express transit time as $t = Ln/c$ for each colour.", marks: 1, partId: "a" },
      { code: "M1", criterion: "Subtract $t_{\\text{V}} - t_{\\text{R}} = (L/c)(1.534 - 1.512)$.", marks: 1, partId: "a" },
      { code: "A1", criterion: `Material delay $= ${fmtSig(numVal(ofS4Q, "materialDelayNs"), 3, "ns")}$.`, marks: 1, partId: "a" },
      { code: "B1", criterion: "Use monochromatic light (laser) so all waves travel at the same speed.", marks: 1, partId: "b" },
    ],
    subpartStrategy: [
      "Compute chromatic arrival-time delay from index difference.",
      "State monochromatic laser mitigation.",
    ],
  });
}

/* -------------------------------------------------------------------------- */
/*  FAMILY 12: al-as-terminal-velocity-n3l-impulse (12 items: 6Q+2C+4[2 LoR]) */
/* -------------------------------------------------------------------------- */

function buildFamily12TerminalVelocityN3l(ctx: BuilderContext): void {
  const kind = "al-as-terminal-velocity-n3l-impulse" as const;

  // 6 Pure Qualitative MCQs
  addQualMcq(ctx, {
    slug: "mc-n3l-skydiver-pair",
    domain: "mechanics",
    kind,
    conceptId: "newtonian-dynamics-friction",
    syllabi: TAG_341,
    difficulty: "standard",
    scenarioSpec: { kind, visualMode: "n3l-pairs", massKg: 78, dragForceN: 765, phaseKey: "terminal-one" },
    targetQuantityKey: "n3lParachutistPair",
    hiddenQuantities: ["n3lParachutistPair", "n3lPairRule"],
    stem: "A skydiver falls at constant terminal velocity where upward air drag equals downward weight. Which force forms the true Newton's third law pair with the skydiver's downward weight?",
    correctPrefix: "The Newton's third law reaction force is the",
    distractors: [
      {
        text: "The Newton's third law reaction force is the upward air drag acting on the skydiver",
        rationale: "Classic AQA trap! Drag and weight act on the SAME body (N1L equilibrium) and are different force types (contact vs gravitational).",
      },
      {
        text: "The Newton's third law reaction force is the upward tension in the parachute harness cords",
        rationale: "Tension acts on the skydiver (same body) and is an electromagnetic contact force, not gravitational.",
      },
      {
        text: "The Newton's third law reaction force is zero because the skydiver is no longer accelerating",
        rationale: "Newton's third law pairs always exist with equal magnitude regardless of acceleration.",
      },
    ],
    workedNote:
      "Weight is the Earth's downward gravitational pull on the skydiver; its N3L partner must be the same force type acting on the other body: the gravitational pull of the skydiver upward on the Earth.",
  });

  addQualMcq(ctx, {
    slug: "mc-n3l-definition",
    domain: "mechanics",
    kind,
    conceptId: "newtonian-dynamics-friction",
    syllabi: TAG_341,
    difficulty: "foundation",
    questionStyle: "definition",
    scenarioSpec: { kind, visualMode: "n3l-pairs", massKg: 70, dragForceN: 687, phaseKey: "terminal-one" },
    targetQuantityKey: "n3lPairRule",
    hiddenQuantities: ["n3lPairRule", "n3lParachutistPair"],
    stem: "Which statement lists all essential AQA criteria for two forces to constitute a Newton's third law interaction pair?",
    correctPrefix: "A Newton's third law pair consists of forces of",
    distractors: [
      {
        text: "A Newton's third law pair consists of equal and opposite forces of different types acting on the same single object",
        rationale: "Equal opposite forces on the same object describe Newton's first law equilibrium, never a third-law pair.",
      },
      {
        text: "A Newton's third law pair consists of forces acting in the same direction whenever an object moves at constant velocity",
        rationale: "N3L pairs are always opposite in direction and hold even during acceleration.",
      },
      {
        text: "A Newton's third law pair consists of any two forces whose vector sum is zero on a free-body diagram",
        rationale: "A free-body diagram shows forces acting on one body only; N3L pairs act on two distinct interacting bodies.",
      },
    ],
    workedNote:
      "Newton's third law pairs must have equal magnitude, opposite direction, same type of force, and act on two different bodies along the same line.",
  });

  addQualMcq(ctx, {
    slug: "mc-chute-open-resultant",
    domain: "mechanics",
    kind,
    conceptId: "newtonian-dynamics-friction",
    syllabi: TAG_341,
    difficulty: "standard",
    scenarioSpec: { kind, visualMode: "terminal-velocity", massKg: 80, dragForceN: 1400, phaseKey: "parachute-open" },
    targetQuantityKey: "motionPhaseRule",
    hiddenQuantities: ["motionPhaseRule", "lorAnchor"],
    stem: "At point R on the skydiver's velocity–time graph, the parachute has just opened fully while the skydiver is still moving downwards rapidly. Which statement correctly describes the forces and motion at point R?",
    correctPrefix: "Immediately after canopy deployment,",
    distractors: [
      {
        text: "Immediately after canopy deployment, the skydiver reverses direction and moves upwards through the air",
        rationale: "Classic misconception! An upward resultant force decelerates downward motion; speed stays downwards (positive) and decreases.",
      },
      {
        text: "Immediately after canopy deployment, drag equals weight instantaneously so speed drops vertically to zero",
        rationale: "Drag rises sharply above weight so speed decreases smoothly over time until reaching the lower terminal speed.",
      },
      {
        text: "Immediately after canopy deployment, the skydiver's weight suddenly decreases so gravity weakens",
        rationale: "Weight mg stays constant throughout the descent.",
      },
    ],
    workedNote:
      "Opening the canopy multiplies drag above weight, giving an upward resultant force and downward deceleration.",
  });

  addQualMcq(ctx, {
    slug: "mc-terminal-one-phase",
    domain: "mechanics",
    kind,
    conceptId: "newtonian-dynamics-friction",
    syllabi: TAG_341,
    difficulty: "foundation",
    scenarioSpec: { kind, visualMode: "terminal-velocity", massKg: 80, dragForceN: 785, phaseKey: "terminal-one" },
    targetQuantityKey: "motionPhaseRule",
    hiddenQuantities: ["motionPhaseRule", "lorAnchor"],
    stem: "On the skydiver's velocity–time graph, the curve flattens into a horizontal plateau at point Q. Which force condition explains this horizontal section?",
    correctPrefix: "Along plateau Q,",
    distractors: [
      {
        text: "Along plateau Q, air resistance has fallen to zero so the skydiver coasts at constant speed",
        rationale: "Air resistance is at its maximum free-fall value (equal to mg), not zero.",
      },
      {
        text: "Along plateau Q, weight has decreased to zero because the skydiver is weightless in air",
        rationale: "Gravitational pull mg remains unchanged; resultant force is zero because drag equals weight.",
      },
      {
        text: "Along plateau Q, upward drag exceeds downward weight so velocity stays steady",
        rationale: "If drag exceeded weight there would be an upward resultant force and deceleration, not constant velocity.",
      },
    ],
    workedNote:
      "At terminal velocity Q, upward drag equals downward weight so resultant force is zero and velocity is constant (Newton's first law).",
  });

  addQualMcq(ctx, {
    slug: "mc-crumple-zone-qual",
    domain: "mechanics",
    kind,
    conceptId: "newtonian-dynamics-friction",
    syllabi: TAG_341,
    difficulty: "foundation",
    scenarioSpec: { kind, visualMode: "crumple-impulse", massKg: 1200, impactSpeedMs: 14, impactTimeS: 0.08, extendedTimeS: 0.32 },
    targetQuantityKey: "crumpleZoneRule",
    hiddenQuantities: ["crumpleZoneRule"],
    stem: "The force–time graph compares a rigid vehicle collision with an identical-mass car fitted with a front crumple zone stopping from the same speed. Why does the crumple zone reduce injury to occupants?",
    correctPrefix: "Because both cars undergo the same impulse,",
    distractors: [
      {
        text: "Because both cars undergo the same impulse, the crumple zone reduces the total change in momentum to zero",
        rationale: "Stopping from the same initial speed always requires the exact same momentum change Δp = −mv.",
      },
      {
        text: "Because both cars undergo the same impulse, the crumple zone shortens impact time to dissipate kinetic energy faster",
        rationale: "Shorter impact time raises peak force F = Δp/Δt, worsening occupant injury.",
      },
      {
        text: "Because both cars undergo the same impulse, the shaded area under the crumple-zone curve is much smaller",
        rationale: "Area under F–t equals impulse Δp, which is identical for both collisions.",
      },
    ],
    workedNote:
      "Both curves enclose equal area ($\\Delta p = F\\Delta t$); same change in momentum over a longer impact time reduces average force on occupants.",
  });

  addQualMcq(ctx, {
    slug: "mc-suvat-nonuniform-trap",
    domain: "mechanics",
    kind,
    conceptId: "newtonian-dynamics-friction",
    syllabi: TAG_341,
    difficulty: "standard",
    scenarioSpec: { kind, visualMode: "terminal-velocity", massKg: 82, dragForceN: 400, phaseKey: "accelerating" },
    targetQuantityKey: "nonUniformRule",
    hiddenQuantities: ["nonUniformRule", "lorAnchor"],
    stem: "A student wishes to calculate the acceleration at point P and total distance fallen between release and point Q on the curved skydiver velocity–time graph. Which method is physically valid?",
    correctPrefix: "Because air resistance varies with speed,",
    distractors: [
      {
        text: "Because air resistance varies with speed, substitute g into s = ut + half a t squared across the whole curve",
        rationale: "Explicit AQA reject rule: SUVAT equations are valid ONLY for constant (uniform) acceleration.",
      },
      {
        text: "Because air resistance varies with speed, divide final terminal velocity by total time to get instantaneous acceleration at P",
        rationale: "v/t gives average acceleration over the whole interval, not instantaneous acceleration at P.",
      },
      {
        text: "Because air resistance varies with speed, multiply the tangent gradient at P by total time to obtain distance fallen",
        rationale: "Distance fallen is the area under the v–t curve, not gradient × time.",
      },
    ],
    workedNote:
      "Because acceleration decreases continuously as drag grows, constant acceleration equations are invalid; use tangent gradient for acceleration and area under the $v\\text{–}t$ graph for distance.",
  });

  // 2 Quantitative MCQs
  const mcC1Spec = { kind, visualMode: "terminal-velocity", massKg: 85, dragForceN: 1340, phaseKey: "parachute-open" };
  const mcC1 = solveKind(kind, mcC1Spec);
  addNumMcq(ctx, {
    slug: "mc-calc-chute-decel",
    domain: "mechanics",
    kind,
    conceptId: "newtonian-dynamics-friction",
    syllabi: TAG_341,
    difficulty: "standard",
    scenarioSpec: mcC1Spec,
    targetQuantityKey: "accelerationMagMs2",
    unit: "m s⁻²",
    hiddenQuantities: ["accelerationMagMs2", "accelerationDownMs2", "resultantDownN", "resultantMagN"],
    requiredGivens: [
      { name: "massKg", value: 85, unit: "kg", source: "stem" },
      { name: "dragForceN", value: 1340, unit: "N", source: "stem" },
      { name: "g", value: AQA_G_MS2, unit: "m s⁻²", source: "stem" },
    ],
    stem: "Shortly after opening a parachute, an $85.0\\text{ kg}$ skydiver experiences an upward air resistance of $1340\\text{ N}$. Taking $g = 9.81\\text{ m s}^{-2}$, calculate the magnitude of the skydiver's upward deceleration.",
    distractors: [
      { value: 1340 / 85, rationale: "Forgets to subtract the skydiver's weight mg before dividing by mass." },
      { value: (1340 + 85 * AQA_G_MS2) / 85, rationale: "Adds weight and upward drag instead of taking their difference." },
      { value: AQA_G_MS2, rationale: "Assumes free-fall acceleration g despite large upward drag." },
    ],
    workedSolution: `Weight $W = 85.0 \\times 9.81 = 833.9\\text{ N}$; upward resultant force $F = 1340 - 833.9 = 506.1\\text{ N}$; deceleration $a = F/m = ${fmtSig(numVal(mcC1, "accelerationMagMs2"), 3, "m s⁻²")}$.`,
    markCriterion: `Upward deceleration $= ${fmtSig(numVal(mcC1, "accelerationMagMs2"), 3, "m s⁻²")}$`,
  });

  const mcC2Spec = { kind, visualMode: "crumple-impulse", massKg: 1250, impactSpeedMs: 16, impactTimeS: 0.08, extendedTimeS: 0.4 };
  const mcC2 = solveKind(kind, mcC2Spec);
  addNumMcq(ctx, {
    slug: "mc-calc-crumple-force",
    domain: "mechanics",
    kind,
    conceptId: "newtonian-dynamics-friction",
    syllabi: TAG_341,
    difficulty: "foundation",
    scenarioSpec: mcC2Spec,
    targetQuantityKey: "crumpleForceN",
    unit: "N",
    hiddenQuantities: ["crumpleForceN", "baselineForceN"],
    requiredGivens: [
      { name: "massKg", value: 1250, unit: "kg", source: "stem" },
      { name: "impactSpeedMs", value: 16, unit: "m s⁻¹", source: "stem" },
      { name: "extendedTimeS", value: 0.4, unit: "s", source: "stem" },
    ],
    stem: "A $1250\\text{ kg}$ test vehicle travelling at $16.0\\text{ m s}^{-1}$ is brought uniformly to rest in $0.400\\text{ s}$ by its front crumple zone. Calculate the average stopping force exerted on the vehicle.",
    distractors: [
      { value: 1250 * 16 * 0.4, rationale: "Multiplies momentum change by time instead of dividing Δp by Δt." },
      { value: (0.5 * 1250 * 16 * 16) / 0.4, rationale: "Divides kinetic energy by time (average power in watts) instead of dividing momentum by time." },
      { value: 1250 * 16, rationale: "Quotes the impulse (N s) without dividing by the 0.400 s collision time." },
    ],
    workedSolution: `$\\Delta p = 1250 \\times 16.0 = 2.00 \\times 10^4\\text{ N s}$; average force $F = \\Delta p / \\Delta t = 2.00 \\times 10^4 / 0.400 = ${fmtSig(numVal(mcC2, "crumpleForceN"), 3, "N")}$.`,
    markCriterion: `Average stopping force $= ${fmtSig(numVal(mcC2, "crumpleForceN"), 3, "N")}$`,
  });

  // 2 Authentic 6-Mark LoR (#6 Blueprint) + 2 Structured
  addStructured(ctx, {
    slug: "mc-lor-skydiver-6m",
    domain: "mechanics",
    kind,
    conceptId: "newtonian-dynamics-friction",
    syllabi: TAG_341,
    difficulty: "higher",
    questionStyle: "qualitative",
    targetMode: "qualitative",
    scenarioSpec: { kind, visualMode: "terminal-velocity", massKg: 78, dragForceN: 765, phaseKey: "terminal-one" },
    hiddenQuantities: ["lorAnchor", "motionPhaseRule"],
    requiredGivens: [],
    stem: "The velocity–time graph shows the vertical descent of a skydiver from jumping out of a stationary balloon (origin), reaching free-fall terminal speed (Q), opening the parachute (R), and landing steadily at a lower terminal speed (S).",
    parts: [
      {
        partId: "a",
        prompt:
          "Explain the shape of the entire velocity–time graph from release to S using Newton's first and second laws of motion, referring explicitly to weight, air resistance, resultant force, and acceleration at each stage.",
        marks: 6,
        targetMode: "qualitative",
        targetQuantityKey: "lorAnchor",
        expectedAnswer:
          "At release ($t = 0$), speed and air resistance are zero, so the downward resultant force equals weight $mg$ and initial downward acceleration equals $g = 9.81\\text{ m s}^{-2}$ (steepest gradient, N2L). Drag grows with speed until equal to weight at terminal velocity and opening the parachute creates an upward resultant force: as speed rises through P, upward drag increases, reducing downward resultant force ($mg - D$) and acceleration so the curve gradient decreases. At Q, upward drag equals constant downward weight, resultant force is zero, and acceleration is zero so the skydiver falls at constant terminal velocity $v_{\\text{T1}}$ (N1L). At R, opening the parachute greatly increases surface area and drag so $D \\gg mg$, creating a large upward resultant force opposing downward velocity and causing rapid deceleration (N2L). As downward speed drops, drag decreases until $D = mg$ once more at S, giving a lower constant terminal speed $v_{\\text{T2}}$.",
        workingSteps: [
          "Area 1 (L1): Initial release (v=0 -> D=0 -> a=g) and rising drag reducing downward resultant force and v-t gradient (N2L).",
          "Area 2 (L2): First terminal velocity Q where drag = weight -> resultant force = 0 -> constant speed (N1L).",
          "Area 3 (L3): Parachute opening R raises area -> D >> mg -> upward resultant force decelerates skydiver -> drag drops until D = mg at lower terminal speed S.",
        ],
      },
    ],
    workedSolution:
      "Level 3 (5–6 marks): Drag grows with speed until equal to weight at terminal velocity and opening the parachute creates an upward resultant force; systematically applies N2L ($F = mg - D = ma$) and N1L ($F = 0$) across release, curved acceleration P, first plateau Q, parachute deceleration R (still moving downwards!), and second lower plateau S.",
    markScheme: makeLorCriteria("a", [
      "L1 (Area 1): At release (v = 0), drag is zero so resultant force equals weight mg and initial acceleration is g (steepest gradient).",
      "L1 (Area 1): As speed increases (region P), upward air resistance increases, so downward resultant force (mg − D) and acceleration (gradient) decrease (Newton's 2nd law).",
      "L2 (Area 2): At Q, upward drag equals constant downward weight so resultant force is zero.",
      "L2 (Area 2): By Newton's 1st law, acceleration is zero and the skydiver falls at a constant high terminal velocity vT1.",
      "L3 (Area 3): At R, opening the parachute increases surface area so drag greatly exceeds weight, creating an upward resultant force that decelerates the downward motion (N2L).",
      "L3 (Area 3): As speed decreases, drag falls until drag equals weight again at S, establishing a much lower constant terminal velocity vT2.",
    ]),
    subpartStrategy: [
      "Six-mark Level of Response explaining the complete two-stage skydiver velocity-time graph via Newton's laws.",
    ],
  });

  const mcMixSpec = { kind, visualMode: "terminal-velocity", massKg: 76, dragForceN: 450, phaseKey: "accelerating" };
  const mcMixQ = solveKind(kind, mcMixSpec);
  addStructured(ctx, {
    slug: "mc-lor-probe-descent-9m",
    domain: "mechanics",
    kind,
    conceptId: "newtonian-dynamics-friction",
    syllabi: TAG_341,
    difficulty: "higher",
    questionStyle: "mixed-exam",
    targetMode: "quantitative",
    scenarioSpec: mcMixSpec,
    hiddenQuantities: ["weightN", "accelerationDownMs2", "lorAnchor", "motionPhaseRule"],
    requiredGivens: [
      { name: "massKg", value: 76, unit: "kg", source: "stem" },
      { name: "dragForceN", value: 450, unit: "N", source: "stem" },
      { name: "g", value: AQA_G_MS2, unit: "m s⁻²", source: "stem" },
    ],
    stem: "A $76.0\\text{ kg}$ meteorological drop-probe descends vertically through Earth's lower atmosphere ($g = 9.81\\text{ m s}^{-2}$) following the two-stage velocity–time profile shown before deploying a drogue parachute. At point P, the upward aerodynamic drag is $450\\text{ N}$.",
    parts: [
      {
        partId: "a",
        prompt: "Calculate the downward acceleration of the probe at point P.",
        marks: 3,
        targetMode: "quantitative",
        targetQuantityKey: "accelerationDownMs2",
        expectedAnswer: fmtSig(numVal(mcMixQ, "accelerationDownMs2"), 3, "m s⁻²"),
        workingSteps: [
          `Weight $W = mg = 76.0 \\times 9.81 = ${fmtSig(numVal(mcMixQ, "weightN"), 3, "N")}$.`,
          `Downward resultant force $F = W - D = ${fmtSig(numVal(mcMixQ, "resultantDownN"), 3, "N")}$.`,
          `Acceleration $a = F/m = ${fmtSig(numVal(mcMixQ, "accelerationDownMs2"), 3, "m s⁻²")}$.`,
        ],
      },
      {
        partId: "b",
        prompt:
          "Explain using Newton's laws why the probe's acceleration falls to zero at Q, why opening the drogue parachute at R reduces its speed without reversing its direction of motion, and how to find total distance fallen from the graph.",
        marks: 6,
        targetMode: "qualitative",
        targetQuantityKey: "lorAnchor",
        expectedAnswer:
          "Drag grows with speed until equal to weight at terminal velocity and opening the parachute creates an upward resultant force. During descent from release through P, increasing air drag cuts the downward resultant force $mg - D$ until at Q drag equals weight, giving zero resultant force and constant terminal speed (N1L). Deploying the drogue canopy at R sharply increases area and upward drag above weight, giving an upward resultant force and deceleration (N2L) that slows the downward velocity—it never reverses direction because drag falls back to $mg$ while velocity is still downwards, establishing a lower terminal speed at S. Because acceleration is non-uniform, SUVAT equations are invalid and total distance fallen is found from the area under the $v\\text{–}t$ graph.",
        workingSteps: [
          "Area 1 (L1): Drag increases with speed -> downward resultant drops -> at Q drag = weight -> zero acceleration (N1L).",
          "Area 2 (L2): Drogue opens -> drag >> weight -> upward resultant decelerates downward motion -> drag drops until D = mg at lower terminal speed S.",
          "Area 3 (L3): Velocity stays downward (deceleration != upward motion) and distance equals area under v-t curve (SUVAT invalid).",
        ],
      },
    ],
    workedSolution: `(a) $W = 745.6\\text{ N}$, $F = 295.6\\text{ N}$, $a = ${fmtSig(numVal(mcMixQ, "accelerationDownMs2"), 3, "m s⁻²")}$. (b) Drag grows with speed until equal to weight at terminal velocity and opening the parachute creates an upward resultant force; SUVAT is invalid and total distance equals area under the $v\\text{–}t$ curve.`,
    markScheme: [
      { code: "M1", criterion: "Calculate weight $W = 76.0 \\times 9.81 = 746\\text{ N}$.", marks: 1, partId: "a" },
      { code: "M1", criterion: "Find downward resultant $F = W - 450 = 296\\text{ N}$ and divide by $76.0\\text{ kg}$.", marks: 1, partId: "a" },
      { code: "A1", criterion: `Acceleration $= ${fmtSig(numVal(mcMixQ, "accelerationDownMs2"), 3, "m s⁻²")}$.`, marks: 1, partId: "a" },
      ...makeLorCriteria("b", [
        "L1 (Area 1): As speed grows, upward drag increases, decreasing downward resultant force (mg − D) and acceleration (N2L).",
        "L1 (Area 1): At Q, drag equals constant weight -> zero resultant force -> constant terminal speed (N1L).",
        "L2 (Area 2): Opening drogue parachute raises drag well above weight, producing an upward resultant force and downward deceleration (N2L).",
        "L2 (Area 2): As speed falls, drag decreases until drag equals weight again at a lower constant terminal speed S.",
        "L3 (Area 3): Explains direction stays downwards because deceleration reduces positive downward speed toward vT2 rather than reversing it.",
        "L3 (Area 3): Notes SUVAT equations cannot be used (non-uniform acceleration); distance fallen is found from area under the v–t curve.",
      ]),
    ],
    subpartStrategy: [
      "Compute instantaneous downward acceleration using F = mg − D = ma.",
      "Six-mark Level of Response linking Newton's laws, drogue deceleration, and non-uniform v-t graph area.",
    ],
  });

  // 2 Additional Structured (Crumple zone + N3L)
  const mcS3Spec = { kind, visualMode: "crumple-impulse", massKg: 1400, impactSpeedMs: 12, impactTimeS: 0.06, extendedTimeS: 0.3 };
  const mcS3Q = solveKind(kind, mcS3Spec);
  addStructured(ctx, {
    slug: "mc-struct-crumple-calc",
    domain: "mechanics",
    kind,
    conceptId: "newtonian-dynamics-friction",
    syllabi: TAG_341,
    difficulty: "standard",
    questionStyle: "mixed-exam",
    targetMode: "quantitative",
    scenarioSpec: mcS3Spec,
    hiddenQuantities: ["momentumChangeNs", "crumpleForceN", "crumpleZoneRule"],
    requiredGivens: [
      { name: "massKg", value: 1400, unit: "kg", source: "stem" },
      { name: "impactSpeedMs", value: 12, unit: "m s⁻¹", source: "stem" },
      { name: "extendedTimeS", value: 0.3, unit: "s", source: "stem" },
    ],
    stem: "A $1400\\text{ kg}$ car travelling at $12.0\\text{ m s}^{-1}$ crashes into a barrier and comes to rest in $0.300\\text{ s}$ with its crumple zone deforming.",
    parts: [
      {
        partId: "a",
        prompt: "Calculate the magnitude of the impulse on the car and the average braking force during impact.",
        marks: 3,
        targetMode: "quantitative",
        targetQuantityKey: "crumpleForceN",
        expectedAnswer: `Impulse $= ${fmtSig(numVal(mcS3Q, "momentumChangeNs"), 3, "N s")}$; average force $= ${fmtSig(numVal(mcS3Q, "crumpleForceN"), 3, "N")}$`,
        workingSteps: [
          `Impulse $\\Delta p = mv = 1400 \\times 12.0 = ${fmtSig(numVal(mcS3Q, "momentumChangeNs"), 3, "N s")}$.`,
          `Average force $F = \\Delta p / \\Delta t = ${fmtSig(numVal(mcS3Q, "crumpleForceN"), 3, "N")}$.`,
        ],
      },
      {
        partId: "b",
        prompt: "Explain with reference to the force–time graph why extending collision time protects passengers.",
        marks: 2,
        targetMode: "qualitative",
        targetQuantityKey: "crumpleZoneRule",
        expectedAnswer: `The area under the $F\\text{–}t$ graph equals impulse $\\Delta p$, so ${strVal(mcS3Q, "crumpleZoneRule")}.`,
        workingSteps: ["Area under F-t is fixed Δp; longer Δt gives smaller average/peak force F = Δp/Δt."],
      },
    ],
    workedSolution: `(a) $\\Delta p = 1.68 \\times 10^4\\text{ N s}$; $F = 5.60 \\times 10^4\\text{ N}$. (b) ${strVal(mcS3Q, "crumpleZoneRule")}.`,
    markScheme: [
      { code: "A1", criterion: `Impulse $= ${fmtSig(numVal(mcS3Q, "momentumChangeNs"), 3, "N s")}$.`, marks: 1, partId: "a" },
      { code: "M1", criterion: "Apply $F = \\Delta p / \\Delta t$.", marks: 1, partId: "a" },
      { code: "A1", criterion: `Average force $= ${fmtSig(numVal(mcS3Q, "crumpleForceN"), 3, "N")}$.`, marks: 1, partId: "a" },
      { code: "B1", criterion: "Same change in momentum (equal area under F–t graph).", marks: 1, partId: "b" },
      { code: "B1", criterion: "Longer impact time reduces average force F = Δp/Δt on occupants.", marks: 1, partId: "b" },
    ],
    subpartStrategy: [
      "Compute impulse and average crash force.",
      "Explain crumple zone physics via F-t graph area.",
    ],
  });

  const mcS4Spec = { kind, visualMode: "n3l-pairs", massKg: 72, dragForceN: 706, phaseKey: "terminal-one" };
  const mcS4Q = solveKind(kind, mcS4Spec);
  addStructured(ctx, {
    slug: "mc-struct-n3l-pairs",
    domain: "mechanics",
    kind,
    conceptId: "newtonian-dynamics-friction",
    syllabi: TAG_341,
    difficulty: "standard",
    questionStyle: "qualitative",
    targetMode: "qualitative",
    scenarioSpec: mcS4Spec,
    hiddenQuantities: ["n3lPairRule", "n3lParachutistPair"],
    requiredGivens: [],
    stem: "A skydiver descends at constant terminal velocity as shown in the force diagram.",
    parts: [
      {
        partId: "a",
        prompt: "Explain why the skydiver's downward weight and upward air drag are NOT a Newton's third law pair.",
        marks: 2,
        targetMode: "qualitative",
        targetQuantityKey: "n3lPairRule",
        expectedAnswer: `Weight and drag act on the same object and are different types of force, whereas a Newton's third law pair requires ${strVal(mcS4Q, "n3lPairRule")}.`,
        workingSteps: ["Contrast same-body equilibrium (N1L) with two-body same-type N3L interaction."],
      },
      {
        partId: "b",
        prompt: "State the exact Newton's third law partner force to the skydiver's weight.",
        marks: 2,
        targetMode: "qualitative",
        targetQuantityKey: "n3lParachutistPair",
        expectedAnswer: `The partner force is the ${strVal(mcS4Q, "n3lParachutistPair")} of equal magnitude.`,
        workingSteps: ["Identify gravitational force exerted by the skydiver upward on the Earth."],
      },
    ],
    workedSolution: `(a) ${strVal(mcS4Q, "n3lPairRule")}; weight and drag act on the same body and are different force types. (b) ${strVal(mcS4Q, "n3lParachutistPair")}.`,
    markScheme: [
      { code: "B1", criterion: "Weight and drag both act on the same body (skydiver), whereas N3L pairs act on two different bodies.", marks: 1, partId: "a" },
      { code: "B1", criterion: "Weight (gravitational) and drag (contact/electromagnetic) are different types of force.", marks: 1, partId: "a" },
      { code: "B1", criterion: "Gravitational pull exerted by the skydiver on the Earth.", marks: 1, partId: "b" },
      { code: "B1", criterion: "Equal in magnitude and directed upwards (towards the skydiver).", marks: 1, partId: "b" },
    ],
    subpartStrategy: [
      "Distinguish Newton first law equilibrium from a Newton third law pair.",
      "Name the exact gravitational reaction force on the Earth.",
    ],
  });
}

/* -------------------------------------------------------------------------- */
/*  FAMILY 13: al-as-stress-strain-materials (12 items: 5Q+3C+4 [2 LoR])      */
/* -------------------------------------------------------------------------- */

function buildFamily13StressStrain(ctx: BuilderContext): void {
  const kind = "al-as-stress-strain-materials" as const;

  // 5 Pure Qualitative MCQs
  addQualMcq(ctx, {
    slug: "mat-brittle-def",
    domain: "graphs",
    kind,
    conceptId: "elasticity-young-modulus",
    syllabi: TAG_342,
    difficulty: "foundation",
    scenarioSpec: { kind, visualMode: "multi-curve", forceN: 100, areaMm2: 1.0, lengthM: 2.0, extensionMm: 1.0, materialProfile: "brittle" },
    targetQuantityKey: "materialClassRule",
    hiddenQuantities: ["materialClassRule", "lorAnchor"],
    stem: "Curve A on the tensile stress–strain graph rises steeply in a straight line and terminates abruptly at a cross. Which description accurately characterises Material A under AQA mark-scheme rules?",
    correctPrefix: "Curve A represents a",
    distractors: [
      {
        text: "Curve A represents a brittle material that undergoes zero elastic strain before fracturing",
        rationale: "Classic AQA trap! Brittle glass/cast iron DOES stretch elastically; it fractures after very small PLASTIC strain.",
      },
      {
        text: "Curve A represents a ductile alloy with high toughness and necking prior to breaking",
        rationale: "Ductile metals exhibit yield, extensive plastic deformation, and necking (Curve B).",
      },
      {
        text: "Curve A represents an elastomeric polymer with large reversible chain uncoiling",
        rationale: "Elastomers follow the non-linear hysteresis S-curve (Curve C).",
      },
    ],
    workedNote:
      "AQA rejects 'no increase in strain' for brittle materials; say brittle material fractures after very small plastic strain with no necking.",
  });

  addQualMcq(ctx, {
    slug: "mat-ductile-unloading",
    domain: "graphs",
    kind,
    conceptId: "elasticity-young-modulus",
    syllabi: TAG_342,
    difficulty: "standard",
    scenarioSpec: { kind, visualMode: "multi-curve", forceN: 120, areaMm2: 0.8, lengthM: 2.0, extensionMm: 1.5, materialProfile: "ductile" },
    targetQuantityKey: "unloadingRule",
    hiddenQuantities: ["unloadingRule", "materialClassRule", "lorAnchor"],
    stem: "A ductile copper wire (Curve B) is stretched well beyond its elastic limit and then gradually unloaded to zero stress, as shown by the dashed line. Why does the dashed unloading line return to a non-zero strain?",
    correctPrefix: "After plastic deformation, the",
    distractors: [
      {
        text: "After plastic deformation, the unloading curve retraces the exact loading path back to the origin",
        rationale: "Only elastic deformation below the elastic limit returns to zero strain.",
      },
      {
        text: "After plastic deformation, the unloading curve drops vertically to zero stress at constant strain",
        rationale: "The elastic portion of strain recovers along a line parallel to the initial Young modulus gradient.",
      },
      {
        text: "After plastic deformation, the unloading curve has a much shallower slope because Young modulus halves permanently",
        rationale: "Interatomic bond stiffness (Young modulus E) stays essentially unchanged, so the unloading line is parallel to the linear loading line.",
      },
    ],
    workedNote:
      "The unloading curve is parallel to the initial linear section leaving permanent plastic strain.",
  });

  addQualMcq(ctx, {
    slug: "mat-rubber-hysteresis",
    domain: "graphs",
    kind,
    conceptId: "elasticity-young-modulus",
    syllabi: TAG_342,
    difficulty: "standard",
    scenarioSpec: { kind, visualMode: "hysteresis", forceN: 36, areaMm2: 12, lengthM: 0.5, extensionMm: 80, materialProfile: "polymeric" },
    targetQuantityKey: "hysteresisRule",
    hiddenQuantities: ["hysteresisRule", "materialClassRule"],
    stem: "The stress–strain graph shows loading and unloading of a stretched rubber band returning to zero strain. What physical quantity is represented by the shaded area enclosed between the loading and unloading curves?",
    correctPrefix: "For a complete stretch–release cycle, the",
    distractors: [
      {
        text: "For a complete stretch–release cycle, the area enclosed equals the Young modulus of the rubber",
        rationale: "Young modulus is gradient (σ/ε) on a linear section, not an enclosed area.",
      },
      {
        text: "For a complete stretch–release cycle, the area enclosed equals total elastic potential energy recovered during unloading",
        rationale: "Energy recovered per unit volume is the area under the unloading curve alone; the loop area is the energy LOST as heat.",
      },
      {
        text: "For a complete stretch–release cycle, the area enclosed equals the permanent plastic extension of the rubber band",
        rationale: "The unloading curve returns to the origin (zero permanent strain), so rubber deforms elastically despite hysteresis.",
      },
    ],
    workedNote:
      "Area under loading curve = work done per unit volume; area under unloading curve = elastic energy recovered per unit volume; enclosed hysteresis loop area equals thermal energy dissipated per unit volume.",
  });

  addQualMcq(ctx, {
    slug: "mat-stiffness-vs-strength",
    domain: "graphs",
    kind,
    conceptId: "elasticity-young-modulus",
    syllabi: TAG_342,
    difficulty: "foundation",
    scenarioSpec: { kind, visualMode: "multi-curve", forceN: 120, areaMm2: 0.8, lengthM: 2.0, extensionMm: 1.5, materialProfile: "ductile" },
    targetQuantityKey: "stiffnessVsStrengthRule",
    hiddenQuantities: ["stiffnessVsStrengthRule"],
    stem: "How are stiffness and strength distinguished on a tensile stress–strain graph?",
    correctPrefix: "On a stress–strain graph, the",
    distractors: [
      {
        text: "On a stress–strain graph, the total area to fracture measures stiffness whereas the initial gradient measures strength",
        rationale: "Total area to fracture measures toughness (energy absorbed per unit volume), not stiffness.",
      },
      {
        text: "On a stress–strain graph, thicker wires of the same metal show a steeper gradient and higher Young modulus",
        rationale: "Classic AQA trap! Stress and strain normalise for area and length, so Young modulus E is an intrinsic material constant independent of dimensions.",
      },
      {
        text: "On a stress–strain graph, the strain at fracture measures stiffness while the elastic limit measures toughness",
        rationale: "Fracture strain indicates ductility, not stiffness.",
      },
    ],
    workedNote:
      "Gradient measures stiffness (Young modulus $E$), peak stress measures ultimate tensile strength (UTS), and total area to fracture measures toughness.",
  });

  addQualMcq(ctx, {
    slug: "mat-hooke-limit",
    domain: "graphs",
    kind,
    conceptId: "elasticity-young-modulus",
    syllabi: TAG_342,
    difficulty: "foundation",
    questionStyle: "definition",
    scenarioSpec: { kind, visualMode: "multi-curve", forceN: 80, areaMm2: 1.0, lengthM: 1.5, extensionMm: 1.0, materialProfile: "ductile" },
    targetQuantityKey: "hookeLawRule",
    hiddenQuantities: ["hookeLawRule"],
    stem: "Which statement gives the precise AQA wording of Hooke's law for a stretched wire?",
    correctPrefix: "Provided physical conditions remain constant,",
    distractors: [
      {
        text: "Provided physical conditions remain constant, extension is directly proportional to force up to the ultimate tensile stress",
        rationale: "Linearity fails at the limit of proportionality P, well before the ultimate tensile stress.",
      },
      {
        text: "Provided physical conditions remain constant, extension is inversely proportional to force up to fracture",
        rationale: "Extension increases proportionally with load, not inversely.",
      },
      {
        text: "Provided physical conditions remain constant, stress equals strain multiplied by cross-sectional area",
        rationale: "Stress equals Young modulus multiplied by strain (σ = Eε).",
      },
    ],
    workedNote:
      "Hooke's law holds strictly up to the limit of proportionality (distinct from the elastic limit where permanent plastic deformation starts).",
  });

  // 3 Quantitative MCQs
  const matC1Spec = { kind, visualMode: "multi-curve", forceN: 150, areaMm2: 0.75, lengthM: 2.4, extensionMm: 2.4, materialProfile: "ductile" };
  const matC1 = solveKind(kind, matC1Spec);
  addNumMcq(ctx, {
    slug: "mat-calc-young-mod",
    domain: "graphs",
    kind,
    conceptId: "elasticity-young-modulus",
    syllabi: TAG_342,
    difficulty: "standard",
    scenarioSpec: matC1Spec,
    targetQuantityKey: "youngModulusGPa",
    unit: "GPa",
    hiddenQuantities: ["youngModulusGPa", "youngModulusPa", "stressPa", "stressMPa", "strain"],
    requiredGivens: [
      { name: "forceN", value: 150, unit: "N", source: "stem" },
      { name: "areaMm2", value: 0.75, unit: "mm²", source: "stem" },
      { name: "lengthM", value: 2.4, unit: "m", source: "stem" },
      { name: "extensionMm", value: 2.4, unit: "mm", source: "stem" },
    ],
    stem: "A steel wire of length $2.40\\text{ m}$ and cross-sectional area $0.750\\text{ mm}^2$ extends elastically by $2.40\\text{ mm}$ under a tensile load of $150\\text{ N}$. Calculate the Young modulus of the steel in gigapascals.",
    distractors: [
      { value: numVal(matC1, "youngModulusGPa") * 1e-3, rationale: "Converts mm² using 10⁻³ instead of 10⁻⁶." },
      { value: numVal(matC1, "youngModulusGPa") * 0.5, rationale: "Introduces an erroneous factor of 1/2 from the strain energy formula." },
      { value: numVal(matC1, "stressMPa") * 0.2, rationale: "Confuses tensile stress with Young modulus." },
    ],
    workedSolution: `$\\sigma = 150 / (0.750 \\times 10^{-6}) = 2.00 \\times 10^8\\text{ Pa}$; $\\varepsilon = 2.40 \\times 10^{-3} / 2.40 = 1.00 \\times 10^{-3}$; $E = \\sigma/\\varepsilon = ${fmtSig(numVal(matC1, "youngModulusGPa"), 3, "GPa")}$.`,
    markCriterion: `Young modulus $E = ${fmtSig(numVal(matC1, "youngModulusGPa"), 3, "GPa")}$`,
  });

  const matC2Spec = { kind, visualMode: "multi-curve", forceN: 96, areaMm2: 0.6, lengthM: 2.0, extensionMm: 4.0, materialProfile: "ductile" };
  const matC2 = solveKind(kind, matC2Spec);
  addNumMcq(ctx, {
    slug: "mat-calc-energy-density",
    domain: "graphs",
    kind,
    conceptId: "elasticity-young-modulus",
    syllabi: TAG_342,
    difficulty: "standard",
    scenarioSpec: matC2Spec,
    targetQuantityKey: "strainEnergyDensityJm3",
    unit: "J m⁻³",
    hiddenQuantities: ["strainEnergyDensityJm3", "elasticEnergyJ"],
    requiredGivens: [
      { name: "forceN", value: 96, unit: "N", source: "stem" },
      { name: "areaMm2", value: 0.6, unit: "mm²", source: "stem" },
      { name: "lengthM", value: 2.0, unit: "m", source: "stem" },
      { name: "extensionMm", value: 4.0, unit: "mm", source: "stem" },
    ],
    stem: "Within its Hookean region, a metal rod ($L = 2.00\\text{ m}$, $A = 0.600\\text{ mm}^2$) extends by $4.00\\text{ mm}$ under a $96.0\\text{ N}$ tensile load. Calculate the elastic strain energy stored per unit volume ($\\text{J m}^{-3}$).",
    distractors: [
      { value: numVal(matC2, "strainEnergyDensityJm3") * 2, rationale: "Forgets the factor of 1/2 in triangle area ½σε." },
      { value: numVal(matC2, "elasticEnergyJ"), rationale: "Computes total elastic energy ½FΔL in joules rather than energy per unit volume." },
      { value: numVal(matC2, "stressPa"), rationale: "Quotes tensile stress alone without multiplying by ½ε." },
    ],
    workedSolution: `$\\sigma = 96.0 / (0.600 \\times 10^{-6}) = 1.60 \\times 10^8\\text{ Pa}$; $\\varepsilon = 4.00 \\times 10^{-3} / 2.00 = 2.00 \\times 10^{-3}$; energy density $= \\frac{1}{2}\\sigma\\varepsilon = ${fmtSig(numVal(matC2, "strainEnergyDensityJm3"), 3, "J m⁻³")}$.`,
    markCriterion: `Strain energy density $= ${fmtSig(numVal(matC2, "strainEnergyDensityJm3"), 3, "J m⁻³")}$`,
  });

  const matC3Spec = { kind, visualMode: "multi-curve", forceN: 64, areaMm2: 0.4, lengthM: 1.6, extensionMm: 3.2, materialProfile: "ductile" };
  const matC3 = solveKind(kind, matC3Spec);
  addNumMcq(ctx, {
    slug: "mat-calc-elastic-energy",
    domain: "graphs",
    kind,
    conceptId: "elasticity-young-modulus",
    syllabi: TAG_342,
    difficulty: "foundation",
    scenarioSpec: matC3Spec,
    targetQuantityKey: "elasticEnergyJ",
    unit: "J",
    hiddenQuantities: ["elasticEnergyJ", "strainEnergyDensityJm3"],
    requiredGivens: [
      { name: "forceN", value: 64, unit: "N", source: "stem" },
      { name: "extensionMm", value: 3.2, unit: "mm", source: "stem" },
    ],
    stem: "A guitar wire obeying Hooke's law stretches by $3.20\\text{ mm}$ when tension is raised smoothly from zero to $64.0\\text{ N}$. Calculate the elastic strain energy stored in the wire.",
    distractors: [
      { value: 64 * 3.2e-3, rationale: "Uses FΔL instead of ½FΔL." },
      { value: 0.5 * 64 * 3.2, rationale: "Forgets to convert millimetres into metres." },
      { value: 64 / 3.2e-3, rationale: "Computes spring stiffness k = F/ΔL instead of energy." },
    ],
    workedSolution: `$E_{\\text{el}} = \\frac{1}{2}F\\Delta L = 0.5 \\times 64.0 \\times 3.20 \\times 10^{-3} = ${fmtSig(numVal(matC3, "elasticEnergyJ"), 3, "J")}$.`,
    markCriterion: `Elastic strain energy $= ${fmtSig(numVal(matC3, "elasticEnergyJ"), 3, "J")}$`,
  });

  // 2 Authentic 6-Mark LoR (#7 Blueprint) + 2 Structured
  addStructured(ctx, {
    slug: "mat-lor-three-curves-6m",
    domain: "graphs",
    kind,
    conceptId: "elasticity-young-modulus",
    syllabi: TAG_342,
    difficulty: "higher",
    questionStyle: "qualitative",
    targetMode: "qualitative",
    scenarioSpec: { kind, visualMode: "multi-curve", forceN: 120, areaMm2: 0.8, lengthM: 2.0, extensionMm: 1.5, materialProfile: "ductile" },
    hiddenQuantities: ["lorAnchor", "materialClassRule", "unloadingRule", "hysteresisRule"],
    requiredGivens: [],
    stem: "The tensile stress–strain graph compares three solid engineering materials labelled A, B, and C, including a dashed unloading path on B and a loading–unloading cycle on C.",
    parts: [
      {
        partId: "a",
        prompt:
          "Identify the material class represented by each curve A, B, and C, and compare their mechanical behaviour up to fracture or unloading. Refer explicitly to Young modulus, limit of proportionality, elastic limit, plastic deformation, unloading, and energy dissipation.",
        marks: 6,
        targetMode: "qualitative",
        targetQuantityKey: "lorAnchor",
        expectedAnswer:
          "Stress is $\\sigma = F/A$, strain is $\\varepsilon = \\Delta L/L$, and in the initial straight-line Hookean region up to the limit of proportionality $P$ the gradient equals Young modulus $E = \\sigma/\\varepsilon$ (stiffness). Comparing the three curves: brittle fractures after very small plastic strain ductile yields with permanent plastic strain and rubber forms an elastic hysteresis loop. Material A (brittle, e.g. glass) has the steepest linear gradient (stiffest) and fractures suddenly near $P$ with very little plastic deformation and no necking. Material B (ductile metal, e.g. copper/steel) passes its limit of proportionality and elastic limit, undergoes yielding and extensive plastic deformation up to its ultimate tensile stress (UTS) followed by necking, and when unloaded from the plastic region follows a straight line parallel to its initial linear gradient leaving permanent plastic strain. Material C (polymeric rubber) shows large non-linear elastic strain as tangled polymer chains uncoil, returns to zero strain on unloading, and encloses a hysteresis loop whose area represents thermal energy dissipated per unit volume.",
        workingSteps: [
          "Area 1 (L1): Define σ=F/A, ε=ΔL/L, gradient E = σ/ε up to limit of proportionality P, and elastic limit.",
          "Area 2 (L2): Contrast A (brittle: stiff, fractures after very small plastic strain, no necking) vs B (ductile: yield, plastic flow, UTS, necking, parallel unloading leaving permanent strain).",
          "Area 3 (L3): Explain C (polymeric rubber: non-linear large elastic strain, returns to zero strain, hysteresis loop area = thermal energy dissipated per unit volume).",
        ],
      },
    ],
    workedSolution:
      "Level 3 (5–6 marks): Brittle fractures after very small plastic strain ductile yields with permanent plastic strain and rubber forms an elastic hysteresis loop; distinguishes limit of proportionality vs elastic limit, stiffness vs strength vs toughness, parallel unloading on B, and hysteresis thermal dissipation on C.",
    markScheme: makeLorCriteria("a", [
      "L1 (Area 1): Defines stress σ = F/A, strain ε = ΔL/L, and linear gradient = Young modulus E (stiffness) up to limit of proportionality P.",
      "L1 (Area 1): Distinguishes limit of proportionality (end of straight line) from elastic limit (maximum stress for complete return to original length).",
      "L2 (Area 2): Identifies A as brittle: steep linear gradient (high stiffness) fracturing after very small plastic strain with no necking (reject 'no strain').",
      "L2 (Area 2): Identifies B as ductile: shows yield, large plastic deformation, UTS, necking, and unloads parallel to initial linear gradient leaving permanent plastic strain.",
      "L3 (Area 3): Identifies C as polymeric/rubber: non-linear large elastic extension as chains uncoil, returning to zero strain when unloaded.",
      "L3 (Area 3): Explains unloading curve lies below loading curve forming a hysteresis loop whose enclosed area equals thermal energy dissipated per unit volume.",
    ]),
    subpartStrategy: [
      "Six-mark Level of Response comparing brittle, ductile, and polymeric stress-strain curves.",
    ],
  });

  const matMixSpec = { kind, visualMode: "multi-curve", forceN: 180, areaMm2: 0.9, lengthM: 2.5, extensionMm: 2.5, materialProfile: "ductile" };
  const matMixQ = solveKind(kind, matMixSpec);
  addStructured(ctx, {
    slug: "mat-lor-cable-select-9m",
    domain: "graphs",
    kind,
    conceptId: "elasticity-young-modulus",
    syllabi: TAG_342,
    difficulty: "higher",
    questionStyle: "mixed-exam",
    targetMode: "quantitative",
    scenarioSpec: matMixSpec,
    hiddenQuantities: ["youngModulusGPa", "youngModulusPa", "lorAnchor", "materialClassRule"],
    requiredGivens: [
      { name: "forceN", value: 180, unit: "N", source: "stem" },
      { name: "areaMm2", value: 0.9, unit: "mm²", source: "stem" },
      { name: "lengthM", value: 2.5, unit: "m", source: "stem" },
      { name: "extensionMm", value: 2.5, unit: "mm", source: "stem" },
    ],
    stem: "An engineer tests a $2.50\\text{ m}$ alloy suspension wire of cross-sectional area $0.900\\text{ mm}^2$. Within its linear region, a $180\\text{ N}$ tension stretches it by $2.50\\text{ mm}$. The stress–strain graph compares candidate materials A, B, and C.",
    parts: [
      {
        partId: "a",
        prompt: "Calculate the Young modulus of the alloy wire in GPa.",
        marks: 3,
        targetMode: "quantitative",
        targetQuantityKey: "youngModulusGPa",
        expectedAnswer: fmtSig(numVal(matMixQ, "youngModulusGPa"), 3, "GPa"),
        workingSteps: [
          `Stress $\\sigma = 180 / (0.900 \\times 10^{-6}) = 2.00 \\times 10^8\\text{ Pa}$.`,
          `Strain $\\varepsilon = 2.50 \\times 10^{-3} / 2.50 = 1.00 \\times 10^{-3}$.`,
          `Young modulus $E = \\sigma/\\varepsilon = ${fmtSig(numVal(matMixQ, "youngModulusGPa"), 3, "GPa")}$.`,
        ],
      },
      {
        partId: "b",
        prompt:
          "Using curves A, B, and C, evaluate why a ductile metal (B) is safer than a brittle ceramic (A) for a lift cable, why rubber (C) is suited to vibration dampers instead, and how stiffness, strength, and toughness differ on the graph.",
        marks: 6,
        targetMode: "qualitative",
        targetQuantityKey: "lorAnchor",
        expectedAnswer:
          "On a stress–strain graph, initial linear gradient measures stiffness ($E$), peak vertical height measures ultimate tensile strength (UTS), and total area under the curve to fracture measures toughness. Comparing curves A, B, and C: brittle fractures after very small plastic strain ductile yields with permanent plastic strain and rubber forms an elastic hysteresis loop. A brittle material (A) snaps suddenly without warning once overloaded; a ductile metal (B) absorbs huge fracture energy (high toughness) and visibly stretches/necks plastically before breaking, giving warning of overload (unloading parallel to initial gradient with permanent strain). Rubber (C) stretches elastically to large strain and dissipates vibrational mechanical energy as heat per cycle equal to its enclosed hysteresis loop area.",
        workingSteps: [
          "Area 1 (L1): Distinguish stiffness (gradient E), strength (UTS), and toughness (total area to fracture).",
          "Area 2 (L2): Contrast brittle sudden fracture (very small plastic strain, low toughness) vs ductile warning via plastic deformation/necking and high toughness.",
          "Area 3 (L3): Explain rubber elastomer hysteresis loop dissipating vibrational energy as thermal energy per unit volume.",
        ],
      },
    ],
    workedSolution: `(a) $E = ${fmtSig(numVal(matMixQ, "youngModulusGPa"), 3, "GPa")}$. (b) Brittle fractures after very small plastic strain ductile yields with permanent plastic strain and rubber forms an elastic hysteresis loop; clearly separates stiffness, strength, and toughness.`,
    markScheme: [
      { code: "M1", criterion: "Calculate tensile stress $\\sigma = 2.00 \\times 10^8\\text{ Pa}$ (correct $10^{-6}$ area conversion).", marks: 1, partId: "a" },
      { code: "M1", criterion: "Calculate tensile strain $\\varepsilon = 1.00 \\times 10^{-3}$.", marks: 1, partId: "a" },
      { code: "A1", criterion: `Young modulus $= ${fmtSig(numVal(matMixQ, "youngModulusGPa"), 3, "GPa")}$.`, marks: 1, partId: "a" },
      ...makeLorCriteria("b", [
        "L1 (Area 1): Clearly distinguishes stiffness (linear gradient E) from strength (peak stress / UTS).",
        "L1 (Area 1): Identifies toughness as total area under the stress–strain curve up to fracture (energy absorbed per unit volume).",
        "L2 (Area 2): Explains brittle A snaps abruptly after very small plastic strain giving no warning of failure.",
        "L2 (Area 2): Explains ductile B undergoes visible plastic yielding/necking before breaking and absorbs large energy (tough), unloading parallel to initial slope with permanent strain.",
        "L3 (Area 3): Explains rubber C undergoes large reversible non-linear elastic strain without permanent deformation.",
        "L3 (Area 3): Links rubber's enclosed hysteresis loop area directly to thermal energy dissipated per unit volume per cycle, making it effective for damping vibrations.",
      ]),
    ],
    subpartStrategy: [
      "Compute alloy Young modulus from wire geometry and load.",
      "Six-mark Level of Response applying brittle, ductile, and hysteresis curves to engineering design.",
    ],
  });

  // 2 Additional Structured (Hysteresis + wire stress/energy)
  const matS3Spec = { kind, visualMode: "hysteresis", forceN: 45, areaMm2: 15, lengthM: 0.6, extensionMm: 90, materialProfile: "polymeric" };
  const matS3Q = solveKind(kind, matS3Spec);
  addStructured(ctx, {
    slug: "mat-struct-hysteresis-rubber",
    domain: "graphs",
    kind,
    conceptId: "elasticity-young-modulus",
    syllabi: TAG_342,
    difficulty: "standard",
    questionStyle: "qualitative",
    targetMode: "qualitative",
    scenarioSpec: matS3Spec,
    hiddenQuantities: ["hysteresisRule", "materialClassRule"],
    requiredGivens: [],
    stem: "A thick rubber cord is stretched to twice its original length and then allowed to contract back to its original length, producing the loading and unloading curves shown.",
    parts: [
      {
        partId: "a",
        prompt: "Explain why the deformation is still classified as elastic even though the unloading curve does not retrace the loading curve.",
        marks: 2,
        targetMode: "qualitative",
        targetQuantityKey: "materialClassRule",
        expectedAnswer: `The unloading curve returns to zero strain at zero stress (no permanent extension): ${strVal(matS3Q, "materialClassRule")}.`,
        workingSteps: ["Zero residual strain on unloading defines elastic deformation; tangled polymer chains recoil."],
      },
      {
        partId: "b",
        prompt: "State what the shaded area enclosed between the two curves represents and explain why a car tyre warms up as it rolls.",
        marks: 2,
        targetMode: "qualitative",
        targetQuantityKey: "hysteresisRule",
        expectedAnswer: `The ${strVal(matS3Q, "hysteresisRule")}, so repeated flexing cycles convert mechanical work into internal thermal energy inside the rubber tyre.`,
        workingSteps: ["Area = thermal energy dissipated per unit volume per cycle."],
      },
    ],
    workedSolution: `(a) ${strVal(matS3Q, "materialClassRule")}. (b) ${strVal(matS3Q, "hysteresisRule")}.`,
    markScheme: [
      { code: "B1", criterion: "Rubber returns to original length (zero strain) when stress is removed.", marks: 1, partId: "a" },
      { code: "B1", criterion: "Non-linear elastic behaviour due to tangled polymer chains uncoiling and recoiling.", marks: 1, partId: "a" },
      { code: "B1", criterion: "Enclosed hysteresis loop area equals thermal energy dissipated per unit volume.", marks: 1, partId: "b" },
      { code: "B1", criterion: "Repeated loading/unloading cycles heat the tyre continuously.", marks: 1, partId: "b" },
    ],
    subpartStrategy: [
      "Justify elastic classification of rubber despite hysteresis.",
      "Interpret enclosed hysteresis area physically.",
    ],
  });

  const matS4Spec = { kind, visualMode: "single-wire", forceN: 128, areaMm2: 0.8, lengthM: 2.0, extensionMm: 1.6, materialProfile: "ductile" };
  const matS4Q = solveKind(kind, matS4Spec);
  addStructured(ctx, {
    slug: "mat-struct-stress-energy",
    domain: "graphs",
    kind,
    conceptId: "elasticity-young-modulus",
    syllabi: TAG_342,
    difficulty: "foundation",
    questionStyle: "mixed-exam",
    targetMode: "quantitative",
    scenarioSpec: matS4Spec,
    hiddenQuantities: ["stressMPa", "strain", "elasticEnergyJ"],
    requiredGivens: [
      { name: "forceN", value: 128, unit: "N", source: "stem" },
      { name: "areaMm2", value: 0.8, unit: "mm²", source: "stem" },
      { name: "lengthM", value: 2.0, unit: "m", source: "stem" },
      { name: "extensionMm", value: 1.6, unit: "mm", source: "stem" },
    ],
    stem: "A copper wire of original length $2.00\\text{ m}$ and cross-sectional area $0.800\\text{ mm}^2$ extends elastically by $1.60\\text{ mm}$ under a $128\\text{ N}$ tension.",
    parts: [
      {
        partId: "a",
        prompt: "Calculate the tensile stress in MPa and tensile strain in the wire.",
        marks: 2,
        targetMode: "quantitative",
        targetQuantityKey: "stressMPa",
        expectedAnswer: `Stress $= ${fmtSig(numVal(matS4Q, "stressMPa"), 3, "MPa")}$; strain $= ${fmtSig(numVal(matS4Q, "strain"), 3)}$`,
        workingSteps: [
          `$\\sigma = 128 / (0.800 \\times 10^{-6}) = 1.60 \\times 10^8\\text{ Pa} = 160\\text{ MPa}$.`,
          `$\\varepsilon = 1.60 \\times 10^{-3} / 2.00 = 8.00 \\times 10^{-4}$.`,
        ],
      },
      {
        partId: "b",
        prompt: "Calculate the elastic strain energy stored in the stretched wire.",
        marks: 2,
        targetMode: "quantitative",
        targetQuantityKey: "elasticEnergyJ",
        expectedAnswer: fmtSig(numVal(matS4Q, "elasticEnergyJ"), 3, "J"),
        workingSteps: [`$E_{\\text{el}} = \\frac{1}{2}F\\Delta L = 0.5 \\times 128 \\times 1.60 \\times 10^{-3} = ${fmtSig(numVal(matS4Q, "elasticEnergyJ"), 3, "J")}$.`],
      },
    ],
    workedSolution: `(a) $\\sigma = 160\\text{ MPa}$, $\\varepsilon = 8.00 \\times 10^{-4}$. (b) $E_{\\text{el}} = ${fmtSig(numVal(matS4Q, "elasticEnergyJ"), 3, "J")}$.`,
    markScheme: [
      { code: "A1", criterion: "Tensile stress $= 160\\text{ MPa}$.", marks: 1, partId: "a" },
      { code: "A1", criterion: "Tensile strain $= 8.00 \\times 10^{-4}$.", marks: 1, partId: "a" },
      { code: "M1", criterion: "Apply $E_{\\text{el}} = \\frac{1}{2}F\\Delta L$ in SI units.", marks: 1, partId: "b" },
      { code: "A1", criterion: `Elastic energy $= ${fmtSig(numVal(matS4Q, "elasticEnergyJ"), 3, "J")}$.`, marks: 1, partId: "b" },
    ],
    subpartStrategy: [
      "Compute tensile stress and dimensionless strain.",
      "Evaluate elastic strain energy stored.",
    ],
  });
}

/* -------------------------------------------------------------------------- */
/*  FAMILY 14: al-as-superconductivity-tc (11 items: 5Q + 2C + 4 Struct)      */
/* -------------------------------------------------------------------------- */

function buildFamily14Superconductivity(ctx: BuilderContext): void {
  const kind = "al-as-superconductivity-tc" as const;

  // 5 Pure Qualitative MCQs
  addQualMcq(ctx, {
    slug: "sc-tc-definition",
    domain: "graphs",
    kind,
    conceptId: "resistivity-ohmic-conductors",
    syllabi: TAG_351,
    difficulty: "foundation",
    questionStyle: "definition",
    scenarioSpec: { kind, materialLabel: "Mercury", criticalTempK: 4.2, operatingTempK: 3.5, normalResistanceOhm: 0.12, currentA: 20 },
    targetQuantityKey: "superconductorDefinition",
    hiddenQuantities: ["superconductorDefinition", "criticalTempK"],
    stem: "Which statement correctly defines a superconducting material as illustrated by the solid blue $R\\text{–}T$ graph?",
    correctPrefix: "A superconductor is a material that has",
    distractors: [
      {
        text: "A superconductor is a material that has a small residual resistance that gradually approaches zero only at absolute zero",
        rationale: "Describes a normal pure metal, not a superconductor's sharp drop to exact zero at finite Tc.",
      },
      {
        text: "A superconductor is a material that has infinite resistance below the critical temperature so no current flows",
        rationale: "Inverts conductivity and resistivity; superconductors have zero resistance below Tc.",
      },
      {
        text: "A superconductor is a material that has zero resistance at room temperature once magnetised",
        rationale: "All known practical superconductors require cooling to or below their critical temperature Tc.",
      },
    ],
    workedNote:
      "AQA requires stating exact zero electrical resistance (or zero resistivity) at or below the critical temperature $T_{\\text{c}}$.",
  });

  addQualMcq(ctx, {
    slug: "sc-operating-below-tc",
    domain: "graphs",
    kind,
    conceptId: "resistivity-ohmic-conductors",
    syllabi: TAG_351,
    difficulty: "foundation",
    scenarioSpec: { kind, materialLabel: "YBCO ceramic", criticalTempK: 92, operatingTempK: 77, normalResistanceOhm: 1.5, currentA: 30 },
    targetQuantityKey: "stateAtOperatingTemp",
    hiddenQuantities: ["stateAtOperatingTemp", "effectiveResistanceOhm"],
    stem: "A yttrium barium copper oxide (YBCO) superconductor has a critical temperature above the boiling point of liquid nitrogen. When immersed in liquid nitrogen carrying a steady current, what electrical state is it in?",
    correctPrefix: "Because its temperature is below the transition threshold, it operates in the",
    distractors: [
      {
        text: "Because its temperature is below the transition threshold, it operates in the normal resistive state dissipating large heating power",
        rationale: "At T <= Tc, resistance drops abruptly to zero so I²R heating vanishes.",
      },
      {
        text: "Because its temperature is below the transition threshold, it operates as an insulator blocking all current",
        rationale: "A superconductor conducts persistent currents without potential difference or energy loss.",
      },
      {
        text: "Because its temperature is below the transition threshold, it operates with half its room-temperature resistance",
        rationale: "Resistance drops cleanly to exact zero, not merely to a fraction of its normal value.",
      },
    ],
    workedNote:
      "Since $77\\text{ K} \\le 92\\text{ K}$, YBCO is in its superconducting state with zero resistance and zero heating loss.",
  });

  addQualMcq(ctx, {
    slug: "sc-applications",
    domain: "graphs",
    kind,
    conceptId: "resistivity-ohmic-conductors",
    syllabi: TAG_351,
    difficulty: "foundation",
    scenarioSpec: { kind, materialLabel: "Niobium-titanium", criticalTempK: 9.2, operatingTempK: 4.2, normalResistanceOhm: 0.4, currentA: 150 },
    targetQuantityKey: "superconductorApplication",
    hiddenQuantities: ["superconductorApplication"],
    stem: "Which pair of technologies directly exploits the zero resistance of superconductors to sustain very large currents without $I^2R$ thermal losses?",
    correctPrefix: "Major practical applications include",
    distractors: [
      {
        text: "Major practical applications include household electric kettle heating elements and incandescent filament bulbs",
        rationale: "Heaters and filament lamps rely deliberately on I²R resistive heating, which vanishes in a superconductor.",
      },
      {
        text: "Major practical applications include high-resistance potential dividers and carbon-film fuses",
        rationale: "Potential dividers and fuses require finite resistance.",
      },
      {
        text: "Major practical applications include mercury fluorescent lamps and gold-leaf electroscopes",
        rationale: "Neither device relies on cryogenic zero-resistance conduction.",
      },
    ],
    workedNote:
      "Zero resistance allows huge persistent currents for high-field MRI electromagnets, particle-accelerator magnets, and lossless electrical power cables.",
  });

  addQualMcq(ctx, {
    slug: "sc-limitation",
    domain: "graphs",
    kind,
    conceptId: "resistivity-ohmic-conductors",
    syllabi: TAG_351,
    difficulty: "foundation",
    scenarioSpec: { kind, materialLabel: "Niobium-titanium", criticalTempK: 9.2, operatingTempK: 4.2, normalResistanceOhm: 0.4, currentA: 150 },
    targetQuantityKey: "superconductorLimitation",
    hiddenQuantities: ["superconductorLimitation"],
    stem: "Why have superconducting cables not yet replaced ordinary copper overhead lines across national electricity grids?",
    correctPrefix: "The main practical engineering barrier is that",
    distractors: [
      {
        text: "The main practical engineering barrier is that superconductors waste more I squared R power than copper wires",
        rationale: "Superconductors dissipate zero I²R heat once below Tc.",
      },
      {
        text: "The main practical engineering barrier is that superconductors only conduct alternating current and block direct current",
        rationale: "Superconductors sustain steady DC currents with strictly zero resistance.",
      },
      {
        text: "The main practical engineering barrier is that superconductors violate Ohm's law by creating infinite voltage",
        rationale: "Zero resistance means V = IR = 0 across the superconducting wire for finite current.",
      },
    ],
    workedNote:
      "Maintaining cryogenic coolants (liquid helium or liquid nitrogen) along long corridors is costly and difficult.",
  });

  addQualMcq(ctx, {
    slug: "sc-normal-contrast",
    domain: "graphs",
    kind,
    conceptId: "resistivity-ohmic-conductors",
    syllabi: TAG_351,
    difficulty: "standard",
    scenarioSpec: { kind, materialLabel: "Mercury", criticalTempK: 4.2, operatingTempK: 3.5, normalResistanceOhm: 0.12, currentA: 20 },
    targetQuantityKey: "normalMetalContrast",
    hiddenQuantities: ["normalMetalContrast", "superconductorDefinition"],
    stem: "Compare the dashed grey curve Y with the solid blue curve X on the resistance–temperature graph. Which distinction identifies Curve Y as a normal metal such as copper?",
    correctPrefix: "Unlike a superconductor, a",
    distractors: [
      {
        text: "Unlike a superconductor, a normal metal exhibits a sharp vertical cliff down to zero ohms at a finite critical temperature",
        rationale: "That abrupt drop at Tc is the defining signature of a superconductor (Curve X), not a normal metal.",
      },
      {
        text: "Unlike a superconductor, a normal metal increases in resistance as it is cooled toward absolute zero",
        rationale: "Cooling reduces lattice vibration amplitude so metallic resistance falls smoothly (NTC semiconductors rise when cooled).",
      },
      {
        text: "Unlike a superconductor, a normal metal has constant resistance completely independent of temperature",
        rationale: "Metallic resistance decreases as temperature falls, levelling off at finite residual impurity resistance.",
      },
    ],
    workedNote:
      "A normal metal's resistance decreases smoothly with falling temperature to a non-zero residual value and never drops suddenly to zero at a finite $T_{\\text{c}}$.",
  });

  // 2 Quantitative MCQs
  const scC1Spec = { kind, materialLabel: "YBCO ceramic", criticalTempK: 92, operatingTempK: 77, normalResistanceOhm: 0.45, currentA: 60 };
  const scC1 = solveKind(kind, scC1Spec);
  addNumMcq(ctx, {
    slug: "sc-calc-power-saved",
    domain: "graphs",
    kind,
    conceptId: "resistivity-ohmic-conductors",
    syllabi: TAG_351,
    difficulty: "foundation",
    scenarioSpec: scC1Spec,
    targetQuantityKey: "normalPowerLossW",
    unit: "W",
    hiddenQuantities: ["normalPowerLossW", "powerDissipatedW"],
    requiredGivens: [
      { name: "normalResistanceOhm", value: 0.45, unit: "Ω", source: "stem" },
      { name: "currentA", value: 60, unit: "A", source: "stem" },
    ],
    stem: "A conventional copper link of resistance $0.450\\,\\Omega$ carries a steady current of $60.0\\text{ A}$. If replaced by a superconducting cable cooled below its $92.0\\text{ K}$ critical temperature carrying the same current, how much electrical heating power is saved?",
    distractors: [
      { value: 60 * 0.45, rationale: "Computes voltage drop IR instead of heating power I²R." },
      { value: (60 * 60) / 0.45, rationale: "Divides I² by R instead of multiplying I² by R." },
      { value: 0.5 * 60 * 60 * 0.45, rationale: "Includes an extraneous factor of 1/2." },
    ],
    workedSolution: `Copper heating loss $= I^2R = 60.0^2 \\times 0.450 = ${fmtSig(numVal(scC1, "normalPowerLossW"), 3, "W")}$, whereas the superconductor dissipates $0\\text{ W}$, saving ${fmtSig(numVal(scC1, "normalPowerLossW"), 3, "W")}.`,
    markCriterion: `Power saved $= ${fmtSig(numVal(scC1, "normalPowerLossW"), 3, "W")}$`,
  });

  const scC2Spec = { kind, materialLabel: "Magnesium diboride", criticalTempK: 39, operatingTempK: 20, normalResistanceOhm: 0.8, currentA: 50 };
  const scC2 = solveKind(kind, scC2Spec);
  addNumMcq(ctx, {
    slug: "sc-calc-cooling-delta",
    domain: "graphs",
    kind,
    conceptId: "resistivity-ohmic-conductors",
    syllabi: TAG_351,
    difficulty: "foundation",
    scenarioSpec: scC2Spec,
    targetQuantityKey: "coolingBelowRoomK",
    unit: "K",
    hiddenQuantities: ["coolingBelowRoomK"],
    requiredGivens: [{ name: "criticalTempK", value: 39, unit: "K", source: "either" }],
    stem: "Magnesium diboride becomes superconducting at a critical temperature of $T_{\\text{c}} = 39.0\\text{ K}$. By how many kelvin must a sample initially at room temperature ($293\\text{ K}$) be cooled to reach its transition temperature?",
    distractors: [
      { value: 293 + 39, rationale: "Adds room temperature and Tc instead of subtracting." },
      { value: 273 - 39, rationale: "Subtracts from 0 °C (273 K) instead of room temperature 293 K." },
      { value: 39, rationale: "Quotes Tc itself rather than the temperature drop from 293 K." },
    ],
    workedSolution: `$\\Delta T = 293 - 39.0 = ${fmtSig(numVal(scC2, "coolingBelowRoomK"), 3, "K")}$.`,
    markCriterion: `Temperature drop $= ${fmtSig(numVal(scC2, "coolingBelowRoomK"), 3, "K")}$`,
  });

  // 4 Structured Questions
  const scStructs = [
    {
      slug: "sc-struct-ybco-mri",
      spec: { kind, materialLabel: "YBCO ceramic", criticalTempK: 92, operatingTempK: 77, normalResistanceOhm: 0.65, currentA: 80 },
      stem: "An experimental MRI coil is wound from YBCO high-temperature superconducting tape ($T_{\\text{c}} = 92.0\\text{ K}$) cooled in liquid nitrogen at $77.0\\text{ K}$ while carrying $80.0\\text{ A}$. In its normal state just above $T_{\\text{c}}$, the coil resistance is $0.650\\,\\Omega$.",
    },
    {
      slug: "sc-struct-nbti-cable",
      spec: { kind, materialLabel: "Niobium-titanium", criticalTempK: 9.2, operatingTempK: 4.2, normalResistanceOhm: 0.3, currentA: 120 },
      stem: "A niobium–titanium superconducting magnet coil ($T_{\\text{c}} = 9.20\\text{ K}$) operates in liquid helium at $4.20\\text{ K}$ carrying $120\\text{ A}$. Just above $T_{\\text{c}}$, its normal resistance is $0.300\\,\\Omega$.",
    },
    {
      slug: "sc-struct-mgb2-bus",
      spec: { kind, materialLabel: "Magnesium diboride", criticalTempK: 39, operatingTempK: 25, normalResistanceOhm: 0.25, currentA: 100 },
      stem: "A compact DC busbar made from magnesium diboride ($T_{\\text{c}} = 39.0\\text{ K}$) carries $100\\text{ A}$ while held at $25.0\\text{ K}$. Above $T_{\\text{c}}$, its resistance is $0.250\\,\\Omega$.",
    },
    {
      slug: "sc-struct-quench-warm",
      spec: { kind, materialLabel: "Mercury", criticalTempK: 4.2, operatingTempK: 5.0, normalResistanceOhm: 0.15, currentA: 40 },
      stem: "During a laboratory test of a mercury filament ($T_{\\text{c}} = 4.20\\text{ K}$, normal resistance $0.150\\,\\Omega$ above $T_{\\text{c}}$), the cryostat warms to $5.00\\text{ K}$ while a constant $40.0\\text{ A}$ supply drives current through it.",
    },
  ];

  for (const s of scStructs) {
    const q = solveKind(kind, s.spec);
    const pNorm = numVal(q, "normalPowerLossW");
    const isSuper = Boolean(q.isSuperconducting);
    addStructured(ctx, {
      slug: s.slug,
      domain: "graphs",
      kind,
      conceptId: "resistivity-ohmic-conductors",
      syllabi: TAG_351,
      difficulty: "standard",
      questionStyle: "mixed-exam",
      targetMode: "quantitative",
      scenarioSpec: s.spec,
      hiddenQuantities: ["normalPowerLossW", "superconductorDefinition", "superconductorLimitation"],
      requiredGivens: [
        { name: "criticalTempK", value: s.spec.criticalTempK, unit: "K", source: "either" },
        { name: "operatingTempK", value: s.spec.operatingTempK, unit: "K", source: "stem" },
        { name: "normalResistanceOhm", value: s.spec.normalResistanceOhm, unit: "Ω", source: "stem" },
        { name: "currentA", value: s.spec.currentA, unit: "A", source: "stem" },
      ],
      stem: s.stem,
      parts: [
        {
          partId: "a",
          prompt: "Define the critical temperature $T_{\\text{c}}$ of a superconductor and state whether this conductor is superconducting at its operating temperature.",
          marks: 2,
          targetMode: "qualitative",
          targetQuantityKey: "superconductorDefinition",
          expectedAnswer: `Critical temperature is the transition temperature at or below which a superconductor has ${strVal(q, "superconductorDefinition")}; at $${s.spec.operatingTempK}\\text{ K}$ it is in the ${strVal(q, "stateAtOperatingTemp")}.`,
          workingSteps: [
            "Define Tc as transition to exact zero resistance (at or below Tc).",
            `Compare operating temperature ${s.spec.operatingTempK} K against Tc = ${s.spec.criticalTempK} K.`,
          ],
        },
        {
          partId: "b",
          prompt: isSuper
            ? "Calculate the thermal power that would be dissipated if the coil accidentally warmed just above $T_{\\text{c}}$ while still carrying the same current."
            : "Calculate the thermal power dissipated in the filament at $5.00\\text{ K}$ and explain why cooling below $4.20\\text{ K}$ eliminates this loss.",
          marks: 2,
          targetMode: "quantitative",
          targetQuantityKey: "normalPowerLossW",
          expectedAnswer: fmtSig(pNorm, 3, "W"),
          workingSteps: [
            `Apply $P = I^2R = ${s.spec.currentA}^2 \\times ${s.spec.normalResistanceOhm} = ${fmtSig(pNorm, 3, "W")}$.`,
          ],
        },
        {
          partId: "c",
          prompt: "State one major practical limitation preventing widespread ambient-temperature use of superconducting power cables.",
          marks: 1,
          targetMode: "qualitative",
          targetQuantityKey: "superconductorLimitation",
          expectedAnswer: `A major limitation is that ${strVal(q, "superconductorLimitation")}.`,
          workingSteps: ["State cost and difficulty of maintaining cryogenic cooling below Tc."],
        },
      ],
      workedSolution: `(a) ${strVal(q, "superconductorDefinition")}; operates in ${strVal(q, "stateAtOperatingTemp")}. (b) $P = I^2R = ${fmtSig(pNorm, 3, "W")}$. (c) ${strVal(q, "superconductorLimitation")}.`,
      markScheme: [
        { code: "B1", criterion: "Zero electrical resistance / resistivity at or below critical temperature $T_{\\text{c}}$.", marks: 1, partId: "a" },
        { code: "B1", criterion: `Correctly identify ${strVal(q, "stateAtOperatingTemp")}.`, marks: 1, partId: "a" },
        { code: "M1", criterion: "Substitute current and normal resistance into $P = I^2R$.", marks: 1, partId: "b" },
        { code: "A1", criterion: `Power $= ${fmtSig(pNorm, 3, "W")}$.`, marks: 1, partId: "b" },
        { code: "B1", criterion: "Expensive / technically difficult cryogenic cooling required below $T_{\\text{c}}$.", marks: 1, partId: "c" },
      ],
      subpartStrategy: [
        "Define critical temperature and classify operating state.",
        "Calculate normal-state resistive heating power.",
        "State cryogenic engineering limitation.",
      ],
    });
  }
}

/* -------------------------------------------------------------------------- */
/*  FAMILY 15: al-as-nonohmic-iv-microscopic (12 items: 6Q+2C+4 [2 LoR])      */
/* -------------------------------------------------------------------------- */

function buildFamily15NonohmicIv(ctx: BuilderContext): void {
  const kind = "al-as-nonohmic-iv-microscopic" as const;

  // 6 Pure Qualitative MCQs
  addQualMcq(ctx, {
    slug: "iv-resistance-reading-trap",
    domain: "circuits",
    kind,
    conceptId: "ohms-law-iv-characteristics",
    syllabi: TAG_351,
    difficulty: "standard",
    scenarioSpec: { kind, componentType: "filament-lamp", voltageV: 6.0, currentA: 0.5, showCircuitInset: false },
    targetQuantityKey: "resistanceReadingRule",
    hiddenQuantities: ["resistanceReadingRule", "resistanceOhm", "voltageV", "currentA"],
    stem: "How must a student determine the electrical resistance $R$ of a non-ohmic filament lamp at point P on its curved $I\\text{–}V$ characteristic graph?",
    correctPrefix: "At any point on a curved I–V graph, you must",
    distractors: [
      {
        text: "At any point on a curved I–V graph, you must draw a tangent at P and calculate one over the tangent gradient",
        rationale: "CRITICAL AQA TRAP! R = V/I is the ratio of coordinates at P, NEVER 1/gradient of the tangent on a curved I–V graph.",
      },
      {
        text: "At any point on a curved I–V graph, you must calculate the area enclosed beneath the curve up to point P",
        rationale: "Area under I–V does not give electrical resistance (V/I).",
      },
      {
        text: "At any point on a curved I–V graph, you must multiply potential difference by current at point P",
        rationale: "V × I gives electrical power P in watts, not resistance in ohms.",
      },
    ],
    workedNote:
      "Resistance is defined strictly as $R = V/I$ at the operating point and never one over the tangent gradient.",
  });

  addQualMcq(ctx, {
    slug: "iv-filament-microscopic",
    domain: "circuits",
    kind,
    conceptId: "ohms-law-iv-characteristics",
    syllabi: TAG_351,
    difficulty: "standard",
    scenarioSpec: { kind, componentType: "filament-lamp", voltageV: 8.0, currentA: 0.6, showCircuitInset: false },
    targetQuantityKey: "microscopicMechanism",
    hiddenQuantities: ["microscopicMechanism", "lorAnchor"],
    stem: "As potential difference across a tungsten filament lamp increases, the $I\\text{–}V$ curve becomes flatter. What is the microscopic explanation for the rising resistance?",
    correctPrefix: "As the current heats the metal filament,",
    distractors: [
      {
        text: "As the current heats the metal filament, positive lattice ions break loose and move randomly along the wire",
        rationale: "AQA reject rule: metal lattice ions vibrate with larger amplitude about fixed equilibrium positions; they do NOT move around.",
      },
      {
        text: "As the current heats the metal filament, conduction electrons heat up and slow down without colliding",
        rationale: "AQA reject rule: rising resistance arises specifically from more frequent collisions with vigorously vibrating lattice ions.",
      },
      {
        text: "As the current heats the metal filament, the number of free conduction electrons drops sharply to zero",
        rationale: "Free electron density in a metal stays essentially constant with temperature.",
      },
    ],
    workedNote:
      "Higher temperature increases lattice ion vibration amplitude, causing more frequent collisions with conduction electrons so resistance increases.",
  });

  addQualMcq(ctx, {
    slug: "iv-ntc-microscopic",
    domain: "circuits",
    kind,
    conceptId: "ohms-law-iv-characteristics",
    syllabi: TAG_351,
    difficulty: "standard",
    scenarioSpec: { kind, componentType: "ntc-thermistor", voltageV: 4.0, currentA: 0.25, showCircuitInset: false },
    targetQuantityKey: "microscopicMechanism",
    hiddenQuantities: ["microscopicMechanism", "lorAnchor"],
    stem: "Unlike a metal filament, an NTC semiconductor thermistor exhibits an $I\\text{–}V$ curve that bends upwards as current and temperature rise. What microscopic process dominates?",
    correctPrefix: "Inside an NTC thermistor,",
    distractors: [
      {
        text: "Inside an NTC thermistor, lattice vibrations stop completely when the semiconductor warms up",
        rationale: "Lattice vibrations still increase with temperature, but the exponential surge in free charge carrier density n dominates.",
      },
      {
        text: "Inside an NTC thermistor, the component enters a superconducting state with zero ohms when warmed",
        rationale: "Superconductivity occurs at very low temperatures below Tc, whereas NTC thermistors remain resistive.",
      },
      {
        text: "Inside an NTC thermistor, atomic nuclei start flowing through the circuit to carry positive charge",
        rationale: "Charge is carried by liberated electrons/holes, never migrating nuclei.",
      },
    ],
    workedNote:
      "In an NTC semiconductor, higher temperature liberates many more free charge carriers, outweighing increased lattice vibrations so resistance decreases.",
  });

  addQualMcq(ctx, {
    slug: "iv-diode-behaviour",
    domain: "circuits",
    kind,
    conceptId: "ohms-law-iv-characteristics",
    syllabi: TAG_351,
    difficulty: "foundation",
    scenarioSpec: { kind, componentType: "semiconductor-diode", voltageV: 0.8, currentA: 0.04, thresholdVoltageV: 0.65, showCircuitInset: false },
    targetQuantityKey: "microscopicMechanism",
    hiddenQuantities: ["microscopicMechanism", "lorAnchor"],
    stem: "Which description accurately characterises the current–voltage behaviour of the silicon semiconductor diode plotted in the graph?",
    correctPrefix: "A semiconductor diode",
    distractors: [
      {
        text: "A semiconductor diode drops to strictly zero resistance above its forward threshold voltage",
        rationale: "AQA concept trap: diode resistance falls steeply above ~0.6–0.7 V, but it NEVER becomes zero (it is not a superconductor).",
      },
      {
        text: "A semiconductor diode has a symmetric straight-line I–V graph through the origin in both forward and reverse bias",
        rationale: "Describes an ohmic resistor, not an asymmetric diode.",
      },
      {
        text: "A semiconductor diode conducts freely in reverse bias and blocks current in forward bias",
        rationale: "Reverses forward and reverse bias polarity.",
      },
    ],
    workedNote:
      "A diode conducts sharply above forward threshold potential difference (~0.6–0.7 V) with decreasing (non-zero) resistance, and has very high resistance in reverse bias.",
  });

  addQualMcq(ctx, {
    slug: "iv-ohms-law-def",
    domain: "circuits",
    kind,
    conceptId: "ohms-law-iv-characteristics",
    syllabi: TAG_351,
    difficulty: "foundation",
    questionStyle: "definition",
    scenarioSpec: { kind, componentType: "ohmic-resistor", voltageV: 6.0, currentA: 0.3, showCircuitInset: true },
    targetQuantityKey: "ohmsLawDefinition",
    hiddenQuantities: ["ohmsLawDefinition"],
    stem: "Which statement gives the complete, exam-accurate statement of Ohm's law for a metallic conductor?",
    correctPrefix: "According to Ohm's law,",
    distractors: [
      {
        text: "According to Ohm's law, resistance equals potential difference divided by current for every device at all temperatures",
        rationale: "R = V/I is the universal definition of resistance, NOT Ohm's law; Ohm's law requires constant temperature / physical conditions.",
      },
      {
        text: "According to Ohm's law, current is inversely proportional to potential difference when temperature rises",
        rationale: "Current is directly proportional to potential difference at constant temperature.",
      },
      {
        text: "According to Ohm's law, power is directly proportional to current regardless of heating",
        rationale: "P = I²R scales quadratically with current at constant R.",
      },
    ],
    workedNote:
      "Ohm's law requires both direct proportionality ($I \\propto V$) AND constant temperature / physical conditions.",
  });

  addQualMcq(ctx, {
    slug: "iv-circuit-setup",
    domain: "circuits",
    kind,
    conceptId: "ohms-law-iv-characteristics",
    syllabi: TAG_351,
    difficulty: "foundation",
    scenarioSpec: { kind, componentType: "filament-lamp", voltageV: 6.0, currentA: 0.48, showCircuitInset: true },
    targetQuantityKey: "circuitSetupRule",
    hiddenQuantities: ["circuitSetupRule"],
    stem: "To measure the full $I\\text{–}V$ characteristic of a filament lamp smoothly down to $0\\text{ V}$, how should the meters and variable supply be wired?",
    correctPrefix: "The standard AQA test circuit must",
    distractors: [
      {
        text: "The standard AQA test circuit must connect the voltmeter in series and ammeter in parallel across the lamp",
        rationale: "Reverses meter connections; a high-resistance voltmeter in series blocks circuit current and a low-resistance ammeter in parallel short-circuits the lamp.",
      },
      {
        text: "The standard AQA test circuit must place a single fixed resistor in series without any variable control",
        rationale: "Cannot sweep potential difference across the component smoothly from zero.",
      },
      {
        text: "The standard AQA test circuit must omit the ammeter and calculate current from the lamp's printed wattage rating",
        rationale: "A lamp's resistance changes with temperature, so current must be measured directly at each voltage.",
      },
    ],
    workedNote:
      "Connect the voltmeter in parallel across the component, the ammeter in series, and use a potential divider to vary potential difference smoothly from zero.",
  });

  // 2 Quantitative MCQs (exposing the R = V/I vs 1/gradient trap!)
  const ivC1Spec = { kind, componentType: "filament-lamp", voltageV: 9.0, currentA: 0.75, showCircuitInset: false };
  const ivC1 = solveKind(kind, ivC1Spec);
  addNumMcq(ctx, {
    slug: "iv-calc-lamp-r-trap",
    domain: "circuits",
    kind,
    conceptId: "ohms-law-iv-characteristics",
    syllabi: TAG_351,
    difficulty: "standard",
    scenarioSpec: ivC1Spec,
    targetQuantityKey: "resistanceOhm",
    unit: "Ω",
    hiddenQuantities: ["resistanceOhm", "wrongGradientResistanceOhm"],
    requiredGivens: [
      { name: "voltageV", value: 9.0, unit: "V", source: "either" },
      { name: "currentA", value: 0.75, unit: "A", source: "either" },
    ],
    stem: "At the marked operating point $(9.00\\text{ V}, 0.750\\text{ A})$ on the filament lamp $I\\text{–}V$ graph, the tangent to the curve has slope $0.0476\\text{ A V}^{-1}$. Calculate the electrical resistance of the filament at this operating point.",
    distractors: [
      { value: numVal(ivC1, "wrongGradientResistanceOhm"), rationale: "CRITICAL AQA TRAP: takes 1/gradient of the tangent (21.0 Ω) instead of R = V/I = 12.0 Ω!" },
      { value: 0.75 / 9.0, rationale: "Inverts the ratio to I/V (conductance) instead of V/I." },
      { value: 9.0 * 0.75, rationale: "Multiplies V × I (power in watts) instead of dividing V by I." },
    ],
    workedSolution: `On any $I\\text{–}V$ curve, resistance is strictly $R = V/I = 9.00 / 0.750 = ${fmtSig(numVal(ivC1, "resistanceOhm"), 3, "Ω")}$ (never $1/\\text{gradient}$).`,
    markCriterion: `Operating-point resistance $R = V/I = ${fmtSig(numVal(ivC1, "resistanceOhm"), 3, "Ω")}$`,
  });

  const ivC2Spec = { kind, componentType: "semiconductor-diode", voltageV: 0.84, currentA: 0.035, thresholdVoltageV: 0.65, showCircuitInset: false };
  const ivC2 = solveKind(kind, ivC2Spec);
  addNumMcq(ctx, {
    slug: "iv-calc-diode-r",
    domain: "circuits",
    kind,
    conceptId: "ohms-law-iv-characteristics",
    syllabi: TAG_351,
    difficulty: "standard",
    scenarioSpec: ivC2Spec,
    targetQuantityKey: "resistanceOhm",
    unit: "Ω",
    hiddenQuantities: ["resistanceOhm", "wrongGradientResistanceOhm"],
    requiredGivens: [
      { name: "voltageV", value: 0.84, unit: "V", source: "either" },
      { name: "currentA", value: 0.035, unit: "A", source: "either" },
    ],
    stem: "A forward-biased silicon diode conducts a current of $35.0\\text{ mA}$ ($0.0350\\text{ A}$) when the potential difference across it is $0.840\\text{ V}$. At this point the tangent slope is $0.167\\text{ A V}^{-1}$. Calculate the diode's resistance at this operating point.",
    distractors: [
      { value: numVal(ivC2, "wrongGradientResistanceOhm"), rationale: "CRITICAL AQA TRAP: computes 1/gradient (6.0 Ω) instead of R = V/I (24.0 Ω)." },
      { value: 0.84 / 35, rationale: "Forgets to convert 35.0 mA to amperes (0.0350 A)." },
      { value: (0.84 - 0.65) / 0.035, rationale: "Subtracts threshold voltage before dividing by I instead of taking total V/I." },
    ],
    workedSolution: `$R = V/I = 0.840 / 0.0350 = ${fmtSig(numVal(ivC2, "resistanceOhm"), 3, "Ω")}$.`,
    markCriterion: `Diode resistance $R = V/I = ${fmtSig(numVal(ivC2, "resistanceOhm"), 3, "Ω")}$`,
  });

  // 2 Authentic 6-Mark LoR (#8 Blueprint) + 2 Structured
  addStructured(ctx, {
    slug: "iv-lor-microscopic-6m",
    domain: "circuits",
    kind,
    conceptId: "ohms-law-iv-characteristics",
    syllabi: TAG_351,
    difficulty: "higher",
    questionStyle: "qualitative",
    targetMode: "qualitative",
    scenarioSpec: { kind, componentType: "filament-lamp", voltageV: 6.0, currentA: 0.48, showCircuitInset: true },
    hiddenQuantities: ["lorAnchor", "microscopicMechanism", "resistanceReadingRule", "circuitSetupRule"],
    requiredGivens: [],
    stem: "A student records the current–voltage ($I\\text{–}V$) characteristics of a tungsten filament lamp, an NTC thermistor, and a silicon semiconductor diode using the test circuit shown.",
    parts: [
      {
        partId: "a",
        prompt:
          "Describe how to obtain the $I\\text{–}V$ characteristic and determine resistance from the graph, and explain microscopically why the resistance of a filament lamp increases with current whereas the resistance of an NTC thermistor decreases, contrasting both with a semiconductor diode.",
        marks: 6,
        targetMode: "qualitative",
        targetQuantityKey: "lorAnchor",
        expectedAnswer:
          "Connect the voltmeter in parallel across the component and the ammeter in series, using a potential divider to sweep potential difference smoothly from $0\\text{ V}$ (reversing supply polarity for negative values). Ohm's law ($I \\propto V$) holds only at constant temperature; resistance is V divided by I filament ions vibrate more with temperature while thermistor carrier density rises sharply. At any operating point, resistance is strictly $R = V/I$ (never $1/\\text{gradient}$). In a filament lamp, larger current heats the tungsten so positive lattice ions vibrate with greater amplitude, causing more frequent collisions with conduction electrons and increasing resistance (flattening the $I\\text{–}V$ curve). In an NTC thermistor, heating liberates many more free charge carriers ($n$ increases sharply), outweighing increased lattice collisions so resistance drops (curving steeper). A silicon diode conducts sharply in forward bias above a threshold p.d. ($\\approx 0.6\\text{–}0.7\\text{ V}$) with decreasing (non-zero) resistance, and shows extremely high resistance in reverse bias.",
        workingSteps: [
          "Area 1 (L1): State Ohm's law (I ∝ V at constant T), voltmeter parallel / ammeter series / potential divider, and R = V/I (never 1/gradient).",
          "Area 2 (L2): Filament microscopic explanation: higher T -> larger lattice ion vibration amplitude -> more frequent electron collisions -> higher R.",
          "Area 3 (L3): NTC thermistor (sharp rise in free charge carrier density n outweighs lattice vibrations -> lower R) and diode (threshold ~0.6–0.7 V forward, very high reverse R).",
        ],
      },
    ],
    workedSolution:
      "Level 3 (5–6 marks): Resistance is V divided by I filament ions vibrate more with temperature while thermistor carrier density rises sharply; covers voltmeter parallel / ammeter series / potential divider, strict $R = V/I$ (reject $1/\\text{gradient}$), filament lattice vibration collisions, NTC carrier-density surge, and diode forward/reverse threshold.",
    markScheme: makeLorCriteria("a", [
      "L1 (Area 1): States Ohm's law (I ∝ V at constant temperature/physical conditions) and correct test circuit (voltmeter in parallel, ammeter in series, potential divider from 0 V).",
      "L1 (Area 1): Explicitly states resistance at any point is R = V/I — NEVER 1/gradient (citing gradient caps Area 1/2).",
      "L2 (Area 2): Filament lamp: higher current increases filament temperature so positive lattice ions vibrate with larger amplitude (reject ions 'moving around').",
      "L2 (Area 2): More frequent collisions between conduction electrons and vibrating lattice ions impede drift, increasing resistance R.",
      "L3 (Area 3): NTC thermistor: higher temperature releases many more free charge carriers (n increases sharply), dominating over lattice vibrations so resistance R decreases.",
      "L3 (Area 3): Semiconductor diode: conducts sharply above forward threshold p.d. (~0.6–0.7 V) with falling (non-zero) resistance, and has very high resistance in reverse bias.",
    ]),
    subpartStrategy: [
      "Six-mark Level of Response linking I-V measurement, R=V/I rule, and microscopic filament/NTC/diode physics.",
    ],
  });

  const ivMixSpec = { kind, componentType: "filament-lamp", voltageV: 12.0, currentA: 0.8, showCircuitInset: true };
  const ivMixQ = solveKind(kind, ivMixSpec);
  addStructured(ctx, {
    slug: "iv-lor-lamp-compare-9m",
    domain: "circuits",
    kind,
    conceptId: "ohms-law-iv-characteristics",
    syllabi: TAG_351,
    difficulty: "higher",
    questionStyle: "mixed-exam",
    targetMode: "quantitative",
    scenarioSpec: ivMixSpec,
    hiddenQuantities: ["resistanceOhm", "powerW", "lorAnchor", "microscopicMechanism"],
    requiredGivens: [
      { name: "voltageV", value: 12.0, unit: "V", source: "either" },
      { name: "currentA", value: 0.8, unit: "A", source: "either" },
    ],
    stem: "A $12.0\\text{ V}$ car headlamp bulb draws a steady current of $0.800\\text{ A}$ at its marked operating point on the $I\\text{–}V$ curve shown alongside its test circuit.",
    parts: [
      {
        partId: "a",
        prompt: "Calculate the electrical resistance and power dissipation of the headlamp filament at this operating point.",
        marks: 3,
        targetMode: "quantitative",
        targetQuantityKey: "resistanceOhm",
        expectedAnswer: `Resistance $= ${fmtSig(numVal(ivMixQ, "resistanceOhm"), 3, "Ω")}$; power $= ${fmtSig(numVal(ivMixQ, "powerW"), 3, "W")}$`,
        workingSteps: [
          `Apply $R = V/I = 12.0 / 0.800 = ${fmtSig(numVal(ivMixQ, "resistanceOhm"), 3, "Ω")}$ (never $1/\\text{gradient}$).`,
          `Apply $P = VI = 12.0 \\times 0.800 = ${fmtSig(numVal(ivMixQ, "powerW"), 3, "W")}$.`,
        ],
      },
      {
        partId: "b",
        prompt:
          "Explain why the headlamp filament is most likely to blow at the instant it is switched on from cold, contrast its resistance–temperature physics with an NTC thermistor, and explain why taking $1/\\text{gradient}$ gives the wrong resistance on both curves.",
        marks: 6,
        targetMode: "qualitative",
        targetQuantityKey: "lorAnchor",
        expectedAnswer:
          "Resistance is V divided by I filament ions vibrate more with temperature while thermistor carrier density rises sharply. When cold at switch-on, lattice ion vibration amplitude is small so collisions with conduction electrons are less frequent and filament resistance is much lower than when hot; applying full $12\\text{ V}$ therefore produces a large initial surge current ($I = V/R$) and rapid local heating at thin spots, making failure most likely at switch-on. As temperature rises, larger lattice vibrations increase collisions and raise $R$ (opposite to an NTC thermistor where rising temperature liberates far more free charge carriers, outweighing vibrations and reducing $R$). Because both curves are non-linear, resistance is defined by the chord ratio $R = V/I$ to the origin, whereas $1/\\text{gradient}$ equals the differential ratio $dV/dI \\ne V/I$.",
        workingSteps: [
          "Area 1 (L1): Cold filament has small lattice vibration -> low resistance -> large surge current I = V/R at switch-on -> rapid heating/failure.",
          "Area 2 (L2): Hot filament lattice ions vibrate with larger amplitude -> more electron collisions -> higher R; contrast with NTC carrier density n increase lowering R.",
          "Area 3 (L3): Explain strictly why R = V/I (ratio of coordinates) differs from 1/gradient (dV/dI) on curved I-V graphs.",
        ],
      },
    ],
    workedSolution: `(a) $R = 12.0/0.800 = 15.0\\,\\Omega$, $P = 9.60\\text{ W}$. (b) Resistance is V divided by I filament ions vibrate more with temperature while thermistor carrier density rises sharply; explains cold switch-on surge current, filament vs NTC physics, and $R = V/I \\ne 1/\\text{gradient}$.`,
    markScheme: [
      { code: "M1", criterion: "Apply $R = V/I = 12.0 / 0.800$.", marks: 1, partId: "a" },
      { code: "A1", criterion: "Resistance $= 15.0\\,\\Omega$.", marks: 1, partId: "a" },
      { code: "A1", criterion: "Power $P = VI = 9.60\\text{ W}$.", marks: 1, partId: "a" },
      ...makeLorCriteria("b", [
        "L1 (Area 1): When cold at switch-on, lattice vibrations are smaller so filament resistance is much lower than at operating temperature.",
        "L1 (Area 1): Low initial resistance causes a large initial surge current (I = V/R) and intense local heating at thin spots, blowing the filament.",
        "L2 (Area 2): As filament heats up, positive lattice ions vibrate with larger amplitude causing more frequent collisions with conduction electrons so R rises.",
        "L2 (Area 2): In contrast, heating an NTC thermistor liberates many more free charge carriers (n rises sharply), dominating over lattice vibrations so R falls.",
        "L3 (Area 3): Resistance at any operating point is strictly defined as R = V/I (ratio of coordinate values).",
        "L3 (Area 3): Explains 1/gradient measures tangent dV/dI which only equals V/I for a straight line through the origin (ohmic conductor).",
      ]),
    ],
    subpartStrategy: [
      "Evaluate operating-point resistance and power.",
      "Six-mark Level of Response covering cold-filament surge, filament vs NTC microscopic physics, and chord ratio vs reciprocal gradient.",
    ],
  });

  // 2 Additional Shorter Structured (NTC + Diode)
  const ivS3Spec = { kind, componentType: "ntc-thermistor", voltageV: 4.5, currentA: 0.15, showCircuitInset: false };
  const ivS3Q = solveKind(kind, ivS3Spec);
  addStructured(ctx, {
    slug: "iv-struct-ntc-sensor",
    domain: "circuits",
    kind,
    conceptId: "ohms-law-iv-characteristics",
    syllabi: TAG_351,
    difficulty: "standard",
    questionStyle: "mixed-exam",
    targetMode: "quantitative",
    scenarioSpec: ivS3Spec,
    hiddenQuantities: ["resistanceOhm", "microscopicMechanism"],
    requiredGivens: [
      { name: "voltageV", value: 4.5, unit: "V", source: "either" },
      { name: "currentA", value: 0.15, unit: "A", source: "either" },
    ],
    stem: "An NTC thermistor has a potential difference of $4.50\\text{ V}$ across it when carrying $0.150\\text{ A}$, as marked on its $I\\text{–}V$ characteristic.",
    parts: [
      {
        partId: "a",
        prompt: "Calculate the resistance of the thermistor at this operating point.",
        marks: 2,
        targetMode: "quantitative",
        targetQuantityKey: "resistanceOhm",
        expectedAnswer: fmtSig(numVal(ivS3Q, "resistanceOhm"), 3, "Ω"),
        workingSteps: [`$R = V/I = 4.50 / 0.150 = ${fmtSig(numVal(ivS3Q, "resistanceOhm"), 3, "Ω")}$.`],
      },
      {
        partId: "b",
        prompt: "Explain why increasing the thermistor's temperature reduces its resistance even though lattice vibrations increase.",
        marks: 2,
        targetMode: "qualitative",
        targetQuantityKey: "microscopicMechanism",
        expectedAnswer: `In an NTC semiconductor, ${strVal(ivS3Q, "microscopicMechanism")}.`,
        workingSteps: ["Carrier density n rises steeply with temperature, outweighing increased lattice collisions."],
      },
    ],
    workedSolution: `(a) $R = 4.50 / 0.150 = 30.0\\,\\Omega$. (b) ${strVal(ivS3Q, "microscopicMechanism")}.`,
    markScheme: [
      { code: "M1", criterion: "Apply $R = V/I$ directly from coordinates.", marks: 1, partId: "a" },
      { code: "A1", criterion: "Resistance $= 30.0\\,\\Omega$.", marks: 1, partId: "a" },
      { code: "B1", criterion: "Higher temperature releases many more free charge carriers (higher carrier density n).", marks: 1, partId: "b" },
      { code: "B1", criterion: "Carrier increase dominates over increased lattice vibrations so resistance falls.", marks: 1, partId: "b" },
    ],
    subpartStrategy: [
      "Compute NTC thermistor resistance via R = V/I.",
      "Explain carrier-density dominance over lattice vibrations.",
    ],
  });

  const ivS4Spec = { kind, componentType: "semiconductor-diode", voltageV: 0.78, currentA: 0.026, thresholdVoltageV: 0.65, showCircuitInset: false };
  const ivS4Q = solveKind(kind, ivS4Spec);
  addStructured(ctx, {
    slug: "iv-struct-diode-iv",
    domain: "circuits",
    kind,
    conceptId: "ohms-law-iv-characteristics",
    syllabi: TAG_351,
    difficulty: "standard",
    questionStyle: "mixed-exam",
    targetMode: "quantitative",
    scenarioSpec: ivS4Spec,
    hiddenQuantities: ["resistanceOhm", "microscopicMechanism"],
    requiredGivens: [
      { name: "voltageV", value: 0.78, unit: "V", source: "either" },
      { name: "currentA", value: 0.026, unit: "A", source: "either" },
    ],
    stem: "The $I\\text{–}V$ characteristic of a silicon diode is shown. At the marked forward-bias operating point, $V = 0.780\\text{ V}$ and $I = 0.0260\\text{ A}$.",
    parts: [
      {
        partId: "a",
        prompt: "Calculate the resistance of the diode at the marked operating point.",
        marks: 2,
        targetMode: "quantitative",
        targetQuantityKey: "resistanceOhm",
        expectedAnswer: fmtSig(numVal(ivS4Q, "resistanceOhm"), 3, "Ω"),
        workingSteps: [`$R = V/I = 0.780 / 0.0260 = ${fmtSig(numVal(ivS4Q, "resistanceOhm"), 3, "Ω")}$.`],
      },
      {
        partId: "b",
        prompt: "Describe how the diode's resistance behaves in forward bias above its threshold voltage compared with reverse bias, and explain why a series protective resistor is fitted.",
        marks: 2,
        targetMode: "qualitative",
        targetQuantityKey: "microscopicMechanism",
        expectedAnswer: `The diode ${strVal(ivS4Q, "microscopicMechanism")}; a series protective resistor limits the sharp forward current to prevent overheating damage.`,
        workingSteps: ["Contrast falling (non-zero) forward R above ~0.6–0.7 V with very high reverse R; note series current-limiting resistor."],
      },
    ],
    workedSolution: `(a) $R = 0.780 / 0.0260 = 30.0\\,\\Omega$. (b) ${strVal(ivS4Q, "microscopicMechanism")}; series resistor limits forward current.`,
    markScheme: [
      { code: "M1", criterion: "Apply $R = V/I$ at $(0.780\\text{ V}, 0.0260\\text{ A})$.", marks: 1, partId: "a" },
      { code: "A1", criterion: "Resistance $= 30.0\\,\\Omega$.", marks: 1, partId: "a" },
      { code: "B1", criterion: "Conducts sharply above forward threshold (~0.6–0.7 V) with falling non-zero resistance vs very high reverse resistance.", marks: 1, partId: "b" },
      { code: "B1", criterion: "Protective series resistor prevents excessive current / overheating in forward bias.", marks: 1, partId: "b" },
    ],
    subpartStrategy: [
      "Calculate forward-biased diode resistance.",
      "Describe asymmetric diode conduction and protective resistor role.",
    ],
  });
}

/* -------------------------------------------------------------------------- */
/*  Public Entrypoint                                                         */
/* -------------------------------------------------------------------------- */

export function generateAlevelCoreAsCandidates(
  options: GenerateAlevelCoreAsOptions = {},
): CandidateQuestionInput[] {
  const baseSeed = options.baseSeed ?? ALEVEL_CORE_AS_DEFAULT_BASE_SEED;
  const generatorModel = options.generatorModel ?? ALEVEL_CORE_AS_DEFAULT_MODEL;

  const ctx: BuilderContext = {
    baseSeed,
    generatorModel,
    items: [],
    nextOffset: 1,
  };

  buildFamily1SiBaseFermi(ctx);
  buildFamily2SpecificCharge(ctx);
  buildFamily3StrongNuclearForce(ctx);
  buildFamily4PairProdAnnihilation(ctx);
  buildFamily5Feynman(ctx);
  buildFamily6HadronLepton(ctx);
  buildFamily7Photoelectric(ctx);
  buildFamily8FluorescentEdiff(ctx);
  buildFamily9PolarisationStationary(ctx);
  buildFamily10WhiteLightDiffraction(ctx);
  buildFamily11OpticalFibre(ctx);
  buildFamily12TerminalVelocityN3l(ctx);
  buildFamily13StressStrain(ctx);
  buildFamily14Superconductivity(ctx);
  buildFamily15NonohmicIv(ctx);

  return ctx.items;
}
