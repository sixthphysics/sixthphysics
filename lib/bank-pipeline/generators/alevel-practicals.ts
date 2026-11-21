import {
  ALEVEL_PRACTICALS_PLUGINS,
  AlevelPracticalsScenarioKind,
} from "@/lib/visuals/alevel-practicals";

import { buildOptionEquivalenceKey } from "../numeric-checker";
import {
  CandidateQuestionInput,
  MarkSchemePoint,
  MCQ_OPTION_LABELS,
  McqOptionItem,
  PhysicsDomainId,
  QuestionDifficulty,
  RequiredGivenSpec,
  StructuredQuestionPart,
  SyllabusTag,
} from "../types";

export const ALEVEL_PRACTICALS_DEFAULT_BASE_SEED = 73_000_000;
export const ALEVEL_PRACTICALS_ID_PREFIX = "sp-v3-al-prac";
export const ALEVEL_PRACTICALS_DEFAULT_MODEL =
  "deterministic-alevel-practicals-v3/1.0.0";

export interface GenerateAlevelPracticalsOptions {
  readonly baseSeed?: number;
  readonly generatorModel?: string;
}

/* -------------------------------------------------------------------------- */
/*  Formatting & deterministic solver helpers                                 */
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
  return [...String(exp)].map((c) => SUP_DIGITS[c] ?? c).join("");
}

function fmtSf(value: number, sigFigs: number, unit?: string): string {
  if (Object.is(value, -0) || Math.abs(value) < 1e-35) {
    if (!unit) return "0";
    return unit === "%" ? "0%" : `0 ${unit}`;
  }
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  const rounded = Number(abs.toPrecision(sigFigs));
  let numStr: string;
  if (rounded >= 1e4 || rounded < 1e-2) {
    let exp = Math.floor(Math.log10(abs));
    let mant = abs / 10 ** exp;
    if (Number(mant.toPrecision(sigFigs)) >= 10) {
      exp += 1;
      mant /= 10;
    }
    numStr = `${sign}${mant.toPrecision(sigFigs)} × 10${toSupInt(exp)}`;
  } else {
    numStr = `${sign}${abs.toPrecision(sigFigs)}`;
  }
  if (!unit) return numStr;
  return unit === "%" ? `${numStr}%` : `${numStr} ${unit}`;
}

function f3(value: number, unit?: string): string {
  return fmtSf(value, 3, unit);
}

function f4(value: number, unit?: string): string {
  return fmtSf(value, 4, unit);
}

function solveKind(
  kind: AlevelPracticalsScenarioKind,
  spec: Record<string, unknown>,
): Record<string, number | string | boolean> {
  const plugin = ALEVEL_PRACTICALS_PLUGINS.find((p) => p.kind === kind);
  if (!plugin) {
    throw new Error(`Missing plugin "${kind}" in ALEVEL_PRACTICALS_PLUGINS`);
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
    throw new Error(`Expected finite number for "${key}", got ${String(v)}`);
  }
  return v;
}

function strQ(
  q: Record<string, number | string | boolean>,
  key: string,
): string {
  const v = q[key];
  if (typeof v !== "string" || !v.trim()) {
    throw new Error(`Expected non-empty string for "${key}", got ${String(v)}`);
  }
  return v;
}

/* -------------------------------------------------------------------------- */
/*  Syllabus tag builders (strict AQA 7408 IDs + clean NCUK crosswalk)        */
/* -------------------------------------------------------------------------- */

function alTag(
  topicId: string,
  subtopicId: string,
  level: "Y12" | "Y13",
  ncukCross?: { topicId: string; subtopicId: string; level: "IFY-S1" | "IFY-S2" },
): SyllabusTag[] {
  const tags: SyllabusTag[] = [
    { syllabus: "alevel", level, topicId, subtopicId },
  ];
  if (ncukCross) {
    tags.push({
      syllabus: "ncuk",
      level: ncukCross.level,
      topicId: ncukCross.topicId,
      subtopicId: ncukCross.subtopicId,
    });
  }
  return tags;
}

const TAG_3_1_Y12 = alTag(
  "alevel-sec1-measurements-errors",
  "alevel-3-1-si-uncertainties-estimation",
  "Y12",
);
const TAG_3_1_Y12_NCUK = alTag(
  "alevel-sec1-measurements-errors",
  "alevel-3-1-si-uncertainties-estimation",
  "Y12",
  { topicId: "ncuk-ac1", subtopicId: "ncuk-ac1-2", level: "IFY-S1" },
);
const TAG_3_1_Y13 = alTag(
  "alevel-sec1-measurements-errors",
  "alevel-3-1-si-uncertainties-estimation",
  "Y13",
);
const TAG_3_3_1_Y12 = alTag(
  "alevel-sec3-waves",
  "alevel-3-3-1-progressive-stationary-waves",
  "Y12",
);
const TAG_3_3_2_Y12 = alTag(
  "alevel-sec3-waves",
  "alevel-3-3-2-refraction-diffraction-interference",
  "Y12",
);
const TAG_3_4_1_Y12 = alTag(
  "alevel-sec4-mechanics-materials",
  "alevel-3-4-1-force-energy-momentum",
  "Y12",
);
const TAG_3_4_1_Y12_NCUK = alTag(
  "alevel-sec4-mechanics-materials",
  "alevel-3-4-1-force-energy-momentum",
  "Y12",
  { topicId: "ncuk-ac2", subtopicId: "ncuk-ac2-1", level: "IFY-S1" },
);
const TAG_3_4_2_Y12 = alTag(
  "alevel-sec4-mechanics-materials",
  "alevel-3-4-2-materials-young-modulus",
  "Y12",
);
const TAG_3_4_2_Y12_NCUK = alTag(
  "alevel-sec4-mechanics-materials",
  "alevel-3-4-2-materials-young-modulus",
  "Y12",
  { topicId: "ncuk-ac3", subtopicId: "ncuk-ac3-2", level: "IFY-S1" },
);
const TAG_3_5_1_Y12 = alTag(
  "alevel-sec5-electricity",
  "alevel-3-5-1-current-electricity",
  "Y12",
);
const TAG_3_5_1_Y12_NCUK_RHO = alTag(
  "alevel-sec5-electricity",
  "alevel-3-5-1-current-electricity",
  "Y12",
  { topicId: "ncuk-ac4", subtopicId: "ncuk-ac4-2", level: "IFY-S1" },
);
const TAG_3_5_1_Y12_NCUK_EMF = alTag(
  "alevel-sec5-electricity",
  "alevel-3-5-1-current-electricity",
  "Y12",
  { topicId: "ncuk-ac4", subtopicId: "ncuk-ac4-3", level: "IFY-S1" },
);
const TAG_3_6_1_Y13 = alTag(
  "alevel-sec6-further-mechanics-thermal",
  "alevel-3-6-1-periodic-motion-shm",
  "Y13",
);
const TAG_3_6_1_Y13_NCUK = alTag(
  "alevel-sec6-further-mechanics-thermal",
  "alevel-3-6-1-periodic-motion-shm",
  "Y13",
  { topicId: "ncuk-ac6", subtopicId: "ncuk-ac6-1", level: "IFY-S2" },
);
const TAG_3_6_2_Y13 = alTag(
  "alevel-sec6-further-mechanics-thermal",
  "alevel-3-6-2-thermal-physics",
  "Y13",
);
const TAG_3_7_4_Y13 = alTag(
  "alevel-sec7-fields-consequences",
  "alevel-3-7-4-capacitance",
  "Y13",
);
const TAG_3_7_4_Y13_NCUK = alTag(
  "alevel-sec7-fields-consequences",
  "alevel-3-7-4-capacitance",
  "Y13",
  { topicId: "ncuk-ac4", subtopicId: "ncuk-ac4-4", level: "IFY-S1" },
);
const TAG_3_7_5_Y13 = alTag(
  "alevel-sec7-fields-consequences",
  "alevel-3-7-5-magnetic-fields-induction-ac",
  "Y13",
);
const TAG_3_7_5_Y13_NCUK = alTag(
  "alevel-sec7-fields-consequences",
  "alevel-3-7-5-magnetic-fields-induction-ac",
  "Y13",
  { topicId: "ncuk-ac4", subtopicId: "ncuk-ac4-5", level: "IFY-S1" },
);
const TAG_3_8_Y13 = alTag(
  "alevel-sec8-nuclear-physics",
  "alevel-3-8-nuclear-decay-energy",
  "Y13",
);

/* -------------------------------------------------------------------------- */
/*  MCQ & LoR Builders                                                        */
/* -------------------------------------------------------------------------- */

interface NumericDistractor {
  readonly value: number;
  readonly rationale: string;
}

interface VerbalDistractor {
  readonly text: string;
  readonly rationale: string;
}

function distinct3sf(a: number, b: number): boolean {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  const scale = Math.max(Math.abs(a), Math.abs(b), 1e-12);
  if (Math.abs(a - b) / scale < 0.04) return false;
  return a.toPrecision(3) !== b.toPrecision(3);
}

function buildNumOptions(
  correctValue: number,
  unit: string | undefined,
  distractors: readonly NumericDistractor[],
  seed: number,
  sigFigs = 3,
): McqOptionItem[] {
  const correctText = fmtSf(correctValue, sigFigs, unit);
  const usedKeys = new Set<string>([buildOptionEquivalenceKey(correctText)]);
  const usedVals: number[] = [correctValue];
  const chosen: Array<{ text: string; rationale: string }> = [];

  const fallbacks: NumericDistractor[] = [
    {
      value: correctValue * 0.5,
      rationale: "Applies an erroneous factor of one half during algebraic rearrangement.",
    },
    {
      value: correctValue * 2.0,
      rationale: "Doubles the value through an omitted factor of two in the practical formula.",
    },
    {
      value: correctValue * 1.38,
      rationale: "Misreads the coordinate interval on the plotted graph axes.",
    },
    {
      value: correctValue * 0.72,
      rationale: "Underestimates the gradient span across the experimental dataset.",
    },
  ];

  for (const cand of [...distractors, ...fallbacks]) {
    if (chosen.length >= 3) break;
    if (!Number.isFinite(cand.value) || Math.abs(cand.value) < 1e-18) continue;
    if (!usedVals.every((v) => distinct3sf(cand.value, v))) continue;
    const text = fmtSf(cand.value, sigFigs, unit);
    const key = buildOptionEquivalenceKey(text);
    if (usedKeys.has(key)) continue;
    usedKeys.add(key);
    usedVals.push(cand.value);
    chosen.push({ text, rationale: cand.rationale });
  }

  const slot = ((seed % 4) + 4) % 4;
  const out: McqOptionItem[] = [];
  let idx = 0;
  for (let i = 0; i < 4; i += 1) {
    if (i === slot) {
      out.push({
        label: MCQ_OPTION_LABELS[i],
        text: correctText,
        isCorrect: true,
      });
    } else {
      const d = chosen[idx];
      idx += 1;
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
  let idx = 0;
  for (let i = 0; i < 4; i += 1) {
    if (i === slot) {
      out.push({
        label: MCQ_OPTION_LABELS[i],
        text: correctText,
        isCorrect: true,
      });
    } else {
      const d = distractors[idx];
      idx += 1;
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

interface LorSpecInput {
  readonly id: string;
  readonly seed: number;
  readonly model: string;
  readonly domain: PhysicsDomainId;
  readonly conceptId: string;
  readonly templateArchetype: string;
  readonly syllabi: SyllabusTag[];
  readonly difficulty: QuestionDifficulty;
  readonly scenarioSpec: Record<string, unknown>;
  readonly anchorKey: string;
  readonly anchorText: string;
  readonly requiredGivens: RequiredGivenSpec[];
  readonly stem: string;
  readonly prompt: string;
  readonly expectedAnswer: string;
  readonly workingSteps: string[];
  readonly workedSolution: string;
  readonly criteria: readonly [string, string, string, string, string, string];
  readonly targetSummary: string;
}

function buildExperimentalLor6m(inp: LorSpecInput): CandidateQuestionInput {
  const codes = ["L1a", "L1b", "L2a", "L2b", "L3a", "L3b"] as const;
  const markScheme: MarkSchemePoint[] = codes.map((code, idx) => ({
    code,
    criterion: inp.criteria[idx],
    marks: 1,
    partId: "a",
  }));

  const parts: StructuredQuestionPart[] = [
    {
      partId: "a",
      prompt: inp.prompt,
      marks: 6,
      targetMode: "qualitative",
      targetQuantityKey: inp.anchorKey,
      expectedAnswer: inp.expectedAnswer,
      workingSteps: inp.workingSteps,
    },
  ];

  return {
    id: inp.id,
    conceptId: inp.conceptId,
    templateArchetype: inp.templateArchetype,
    seed: inp.seed,
    syllabi: inp.syllabi,
    format: "structured",
    questionStyle: "experimental",
    difficulty: inp.difficulty,
    domain: inp.domain,
    scenarioSpec: inp.scenarioSpec,
    hiddenQuantities: [inp.anchorKey],
    requiredGivens: inp.requiredGivens,
    questionPlan: {
      targetSummary: inp.targetSummary,
      subpartStrategy: [
        "part (a): six mark level of response experimental method, uncertainty control, safety, and graphical analysis",
      ],
    },
    stem: inp.stem,
    targetMode: "qualitative",
    parts,
    workedSolution: inp.workedSolution,
    markScheme,
    totalMarks: 6,
    generatorModel: inp.model,
  };
}

/* -------------------------------------------------------------------------- */
/*  Main Generator (190 verified candidates across all 14 al-prac-* plugins)  */
/* -------------------------------------------------------------------------- */

export function generateAlevelPracticalsCandidates(
  options: GenerateAlevelPracticalsOptions = {},
): CandidateQuestionInput[] {
  const baseSeed = options.baseSeed ?? ALEVEL_PRACTICALS_DEFAULT_BASE_SEED;
  const model = options.generatorModel ?? ALEVEL_PRACTICALS_DEFAULT_MODEL;
  let seq = 0;
  const nextSeed = (): number => {
    seq += 1;
    return baseSeed + seq;
  };
  const makeId = (slug: string): string =>
    `${ALEVEL_PRACTICALS_ID_PREFIX}-${slug}`;

  const out: CandidateQuestionInput[] = [];

  /* ======================================================================== */
  /*  1. al-prac-worst-fit-error-bars (12 items: 4 Q-MCQ, 4 Qual-MCQ, 4 8m)   */
  /* ======================================================================== */
  {
    const wfCases = [
      {
        slug: "wf-hooke",
        barType: "constant-abs" as const,
        xStart: 0.2,
        xStep: 0.2,
        mBest: 18.5,
        cBest: 0.6,
        dxAbs: 0.02,
        dyBase: 0.9,
        xLabel: "e / m",
        yLabel: "F / N",
        unitM: "N m⁻¹",
        unitC: "N",
        ctx: "stretching a helical brass spring with slotted masses",
      },
      {
        slug: "wf-ohmic",
        barType: "constant-pct" as const,
        xStart: 1.0,
        xStep: 1.0,
        mBest: 3.4,
        cBest: 0.5,
        dxAbs: 0.08,
        dyBase: 0.4,
        pctUncY: 8,
        xLabel: "I / A",
        yLabel: "V / V",
        unitM: "Ω",
        unitC: "V",
        ctx: "recording terminal potential difference across a nichrome heating coil",
      },
      {
        slug: "wf-kinetic",
        barType: "constant-abs" as const,
        xStart: 0.5,
        xStep: 0.5,
        mBest: 6.4,
        cBest: 1.1,
        dxAbs: 0.05,
        dyBase: 0.8,
        xLabel: "h / m",
        yLabel: "v² / m² s⁻²",
        unitM: "m s⁻²",
        unitC: "m² s⁻²",
        ctx: "tracking a steel trolley rolling down a tilted low-friction air track",
      },
      {
        slug: "wf-thermal",
        barType: "constant-pct" as const,
        xStart: 2.0,
        xStep: 2.0,
        mBest: 2.8,
        cBest: 1.4,
        dxAbs: 0.15,
        dyBase: 0.6,
        pctUncY: 10,
        xLabel: "t / min",
        yLabel: "Δθ / °C",
        unitM: "°C min⁻¹",
        unitC: "°C",
        ctx: "heating a well-insulated aluminium calorimeter block at steady electrical power",
      },
    ];

    // 4 Quantitative MCQs
    wfCases.forEach((c, i) => {
      const spec: Record<string, unknown> = {
        kind: "al-prac-worst-fit-error-bars",
        barType: c.barType,
        xStart: c.xStart,
        xStep: c.xStep,
        mBest: c.mBest,
        cBest: c.cBest,
        dxAbs: c.dxAbs,
        dyBase: c.dyBase,
        ...(c.pctUncY !== undefined ? { pctUncY: c.pctUncY } : {}),
        xLabel: c.xLabel,
        yLabel: c.yLabel,
      };
      const q = solveKind("al-prac-worst-fit-error-bars", spec);
      const mMax = numQ(q, "mMax");
      const mMin = numQ(q, "mMin");
      const deltaM = numQ(q, "deltaM");
      const pctUncM = numQ(q, "pctUncM");
      const cMax = numQ(q, "cMax");
      const cMin = numQ(q, "cMin");
      const deltaC = numQ(q, "deltaC");
      const seed = nextSeed();

      const askPct = i % 2 === 0;
      const askIntercept = i === 3;
      const targetKey = askIntercept ? "deltaC" : askPct ? "pctUncM" : "deltaM";
      const truthVal = askIntercept ? deltaC : askPct ? pctUncM : deltaM;
      const unit = askIntercept ? c.unitC : askPct ? "%" : c.unitM;

      const stem = askIntercept
        ? `While ${c.ctx}, a student draws steepest and shallowest worst-fit lines through all plotted error bars. The best-fit gradient is ${f3(c.mBest, c.unitM)} and the steepest and shallowest lines intersect the vertical axis at ${f3(cMin, c.unitC)} and ${f3(cMax, c.unitC)} respectively. What is the absolute uncertainty in the vertical intercept?`
        : askPct
          ? `During a Paper 3A investigation ${c.ctx}, the best-fit line has gradient ${f3(c.mBest, c.unitM)}. Steepest and shallowest worst-fit lines passing through every error bar give gradients ${f3(mMax, c.unitM)} and ${f3(mMin, c.unitM)}. Calculate the percentage uncertainty in the gradient.`
          : `In a practical experiment ${c.ctx}, a best-fit line of gradient ${f3(c.mBest, c.unitM)} is bounded by steepest and shallowest worst-fit lines of gradients ${f3(mMax, c.unitM)} and ${f3(mMin, c.unitM)} that pass through all error bars. What is the absolute uncertainty in the gradient?`;

      const distractors: NumericDistractor[] = askIntercept
        ? [
            {
              value: Math.abs(cMax - cMin),
              rationale: "Takes the full spread (c_max - c_min) without dividing by two.",
            },
            {
              value: 0.5 * (cMax + cMin),
              rationale: "Calculates the mean intercept instead of half the range.",
            },
            {
              value: deltaC * 0.5,
              rationale: "Divides the half-spread by two a second time.",
            },
          ]
        : askPct
          ? [
              {
                value: ((mMax - mMin) / c.mBest) * 100,
                rationale: "Forgets the factor of one half in Δm = (m_max − m_min)/2.",
              },
              {
                value: deltaM,
                rationale: "Reports the absolute uncertainty Δm rather than percentage uncertainty.",
              },
              {
                value: ((mMax - c.mBest) / mMax) * 100,
                rationale: "Divides by the steepest slope m_max instead of the best-fit gradient.",
              },
            ]
          : [
              {
                value: mMax - mMin,
                rationale: "Computes the full range (m_max − m_min) instead of half the range.",
              },
              {
                value: (mMax + mMin) / 2,
                rationale: "Averages the two extreme gradients rather than finding half their difference.",
              },
              {
                value: pctUncM,
                rationale: "Confuses percentage uncertainty with absolute gradient uncertainty.",
              },
            ];

      out.push({
        id: makeId(`${c.slug}-qmcq-${i + 1}`),
        conceptId: "uncertainties-error-bars-worst-fit",
        templateArchetype: "al-prac-worst-fit-error-bars",
        seed,
        syllabi: TAG_3_1_Y12_NCUK,
        format: "mcq",
        questionStyle: "experimental",
        difficulty: i === 0 ? "foundation" : "standard",
        domain: "graphs",
        scenarioSpec: spec,
        hiddenQuantities: [targetKey],
        requiredGivens: askIntercept
          ? [
              { name: "mBest", value: c.mBest, source: "stem" },
              { name: "cMin", value: cMin, source: "stem" },
              { name: "cMax", value: cMax, source: "stem" },
            ]
          : [
              { name: "mBest", value: c.mBest, source: "stem" },
              { name: "mMax", value: mMax, source: "stem" },
              { name: "mMin", value: mMin, source: "stem" },
            ],
        questionPlan: {
          targetSummary:
            "Determine gradient or intercept uncertainty from steepest and shallowest worst fit lines passing through all error bars",
        },
        stem,
        options: buildNumOptions(truthVal, unit, distractors, seed),
        targetMode: "quantitative",
        targetQuantityKey: targetKey,
        workedSolution: askIntercept
          ? `Using half the spread between extreme intercepts, $\\Delta c = \\frac{1}{2}(c_{\\max} - c_{\\min}) = \\frac{1}{2}(${f3(cMax)} - ${f3(cMin)}) = ${f3(deltaC, c.unitC)}$.`
          : askPct
            ? `First calculate the half-spread $\\Delta m = \\frac{1}{2}(m_{\\max} - m_{\\min}) = \\frac{1}{2}(${f3(mMax)} - ${f3(mMin)}) = ${f3(deltaM, c.unitM)}$. Then percentage uncertainty $= (\\Delta m / m_{\\mathrm{best}}) \\times 100\\% = ${f3(pctUncM, "%")}$.`
            : `The absolute uncertainty in the gradient is half the difference between the steepest and shallowest worst-fit lines: $\\Delta m = \\frac{1}{2}(${f3(mMax)} - ${f3(mMin)}) = ${f3(deltaM, c.unitM)}$.`,
        markScheme: [
          {
            code: "A1",
            criterion: `Correctly applies half-spread rule to obtain ${f3(truthVal, unit)} (3 sf).`,
            marks: 1,
          },
        ],
        totalMarks: 1,
        generatorModel: model,
      });
    });

    // 4 Qualitative MCQs
    const wfQualBlueprints = [
      {
        slug: "wf-qual-pct-bars",
        caseIdx: 1,
        targetKey: "errorBarTrendVerdict",
        stem: "In a Paper 3A experiment measuring resistor potential difference $V$ against current $I$, every voltage reading carries a fixed percentage uncertainty of 8% while current has a fixed absolute resolution. How do the plotted vertical error bars behave across the graph?",
        correct:
          "Vertical error bars grow proportionally with the dependent variable because percentage uncertainty is constant, whereas horizontal bars remain uniform.",
        distractors: [
          {
            text: "Vertical error bars remain identical in length at every plotted point while horizontal bars shrink.",
            rationale: "Confuses fixed percentage uncertainty with a constant absolute uncertainty.",
          },
          {
            text: "Vertical error bars shrink at higher voltages because percentage uncertainty improves at larger readings.",
            rationale: "Applies constant-absolute-resolution reasoning to a fixed-percentage-uncertainty instrument.",
          },
          {
            text: "Error bars disappear on the line of best fit once repeat readings are averaged.",
            rationale: "Misconception that repeating readings eliminates uncertainty completely.",
          },
        ] as const,
      },
      {
        slug: "wf-qual-abs-bars",
        caseIdx: 0,
        targetKey: "errorBarTrendVerdict",
        stem: "A student plots spring load $F$ against extension $e$ using instruments with fixed absolute uncertainties $\\pm \\Delta F$ and $\\pm \\Delta e$. Which statement accurately describes the plotted error bars across all five points?",
        correct:
          "All error bars have identical constant size because absolute uncertainty is fixed across the range.",
        distractors: [
          {
            text: "Error bars double in length each time the load doubles.",
            rationale: "Confuses fixed absolute uncertainty with fixed percentage uncertainty.",
          },
          {
            text: "Only the highest and lowest points require error bars because intermediate points never constrain worst-fit lines.",
            rationale: "All plotted points carry error bars and every worst-fit line must pass through every error bar.",
          },
          {
            text: "Error bars represent systematic zero error and therefore shift only in one direction from each point.",
            rationale: "Error bars represent random/reading uncertainty symmetrically as ±Δx and ±Δy.",
          },
        ] as const,
      },
      {
        slug: "wf-qual-worst-rule",
        caseIdx: 2,
        targetKey: "worstFitRuleAnchor",
        stem: "Which graphical practice strictly satisfies AQA Paper 3A mark-scheme criteria when determining a gradient and its uncertainty from an error-bar scatter plot?",
        correct:
          "Worst fit lines must pass through every error bar and the gradient triangle must span more than half of the plotted line.",
        distractors: [
          {
            text: "Draw worst-fit lines through the outermost points only even if they miss an intermediate error bar, using two adjacent points for the gradient.",
            rationale: "Violates both the all-error-bars rule and the >50% triangle span requirement.",
          },
          {
            text: "Force the best-fit line through the origin regardless of systematic intercept and compute gradient from a single point.",
            rationale: "A non-zero intercept reveals systematic error; using one point assumes zero intercept.",
          },
          {
            text: "Use only the highest and lowest raw table entries for the gradient without drawing any line of best fit.",
            rationale: "Raw table endpoints ignore scatter across intermediate data points.",
          },
        ] as const,
      },
      {
        slug: "wf-qual-triangle",
        caseIdx: 3,
        targetKey: "worstFitRuleAnchor",
        stem: "During a thermal calorimetry graph evaluation, an examiner penalises a student's gradient calculation even though their arithmetic is correct. Which error accounts for the lost mark?",
        correct:
          "Worst fit lines must pass through every error bar and the gradient triangle must span more than half of the plotted line, whereas the student used a tiny triangle.",
        distractors: [
          {
            text: "The student used grid-line intersections on the line of best fit rather than raw plotted data crosses.",
            rationale: "Reading well-spaced grid intersections on the drawn line is actually best practice.",
          },
          {
            text: "The student plotted the independent variable along the horizontal axis instead of the vertical axis.",
            rationale: "Plotting the independent variable on the horizontal axis is standard convention.",
          },
          {
            text: "The student calculated gradient uncertainty as half the difference between steepest and shallowest slopes.",
            rationale: "Half the spread between extreme worst-fit gradients is the exact AQA method.",
          },
        ] as const,
      },
    ];

    wfQualBlueprints.forEach((b, i) => {
      const c = wfCases[b.caseIdx];
      const spec: Record<string, unknown> = {
        kind: "al-prac-worst-fit-error-bars",
        barType: c.barType,
        xStart: c.xStart,
        xStep: c.xStep,
        mBest: c.mBest,
        cBest: c.cBest,
        dxAbs: c.dxAbs,
        dyBase: c.dyBase,
        ...(c.pctUncY !== undefined ? { pctUncY: c.pctUncY } : {}),
        xLabel: c.xLabel,
        yLabel: c.yLabel,
      };
      const seed = nextSeed();
      out.push({
        id: makeId(`${b.slug}-${i + 1}`),
        conceptId: "uncertainties-error-bars-worst-fit",
        templateArchetype: "al-prac-worst-fit-error-bars",
        seed,
        syllabi: TAG_3_1_Y12,
        format: "mcq",
        questionStyle: "qualitative",
        difficulty: "standard",
        domain: "graphs",
        scenarioSpec: spec,
        hiddenQuantities: [b.targetKey],
        requiredGivens: [],
        questionPlan: {
          targetSummary:
            "Assess conceptual understanding of error bar scaling and worst fit line construction rules",
        },
        stem: b.stem,
        options: buildVerbalOptions(b.correct, b.distractors, seed),
        targetMode: "qualitative",
        targetQuantityKey: b.targetKey,
        workedSolution: `Under AQA Paper 3A graphical rules: ${b.correct}`,
        markScheme: [
          {
            code: "A1",
            criterion: b.correct,
            marks: 1,
          },
        ],
        totalMarks: 1,
        generatorModel: model,
      });
    });

    // 4 Paper 3A Structured 8m Data-Analysis Ladders
    wfCases.forEach((c, i) => {
      const spec: Record<string, unknown> = {
        kind: "al-prac-worst-fit-error-bars",
        barType: c.barType,
        xStart: c.xStart,
        xStep: c.xStep,
        mBest: c.mBest,
        cBest: c.cBest,
        dxAbs: c.dxAbs,
        dyBase: c.dyBase,
        ...(c.pctUncY !== undefined ? { pctUncY: c.pctUncY } : {}),
        xLabel: c.xLabel,
        yLabel: c.yLabel,
      };
      const q = solveKind("al-prac-worst-fit-error-bars", spec);
      const mMax = numQ(q, "mMax");
      const mMin = numQ(q, "mMin");
      const deltaM = numQ(q, "deltaM");
      const pctUncM = numQ(q, "pctUncM");
      const cMax = numQ(q, "cMax");
      const cMin = numQ(q, "cMin");
      const deltaC = numQ(q, "deltaC");
      const verdict = strQ(q, "errorBarTrendVerdict");
      const xFirst = c.xStart;
      const xLast = c.xStart + 4 * c.xStep;
      const yFirst = c.mBest * xFirst + c.cBest;
      const yLast = c.mBest * xLast + c.cBest;
      const seed = nextSeed();

      out.push({
        id: makeId(`${c.slug}-p3a-8m-${i + 1}`),
        conceptId: "uncertainties-error-bars-worst-fit",
        templateArchetype: "al-prac-worst-fit-error-bars",
        seed,
        syllabi: TAG_3_1_Y12_NCUK,
        format: "structured",
        questionStyle: "mixed-exam",
        difficulty: i < 2 ? "standard" : "higher",
        domain: "graphs",
        scenarioSpec: spec,
        hiddenQuantities: [
          "mBest",
          "deltaM",
          "pctUncM",
          "deltaC",
          "errorBarTrendVerdict",
        ],
        requiredGivens: [
          { name: "xFirst", value: xFirst, source: "stem" },
          { name: "yFirst", value: yFirst, source: "stem" },
          { name: "xLast", value: xLast, source: "stem" },
          { name: "yLast", value: yLast, source: "stem" },
          { name: "mMax", value: mMax, source: "stem" },
          { name: "mMin", value: mMin, source: "stem" },
          { name: "cMax", value: cMax, source: "stem" },
          { name: "cMin", value: cMin, source: "stem" },
        ],
        questionPlan: {
          targetSummary:
            "Paper three section A structured analysis of best fit gradient, worst fit uncertainty, intercept uncertainty, and error bar behaviour",
          subpartStrategy: [
            "part (a): best fit gradient from wide triangle coordinates",
            "part (b): absolute and percentage uncertainty from worst fit lines",
            "part (c): vertical intercept absolute uncertainty",
            "part (d): qualitative evaluation of error bar trend",
          ],
        },
        stem: `A student carries out a Paper 3A data-analysis experiment ${c.ctx} and plots five points with error bars as shown. Two well-spaced grid intersections on the solid best-fit line are $(${f3(xFirst)}, ${f3(yFirst)})$ and $(${f3(xLast)}, ${f3(yLast)})$. The steepest and shallowest dashed worst-fit lines passing through all error bars have gradients ${f3(mMax, c.unitM)} and ${f3(mMin, c.unitM)}, with vertical intercepts ${f3(cMin, c.unitC)} and ${f3(cMax, c.unitC)} respectively.`,
        parts: [
          {
            partId: "a",
            prompt: `Determine the gradient $m$ of the line of best fit, showing your working clearly.`,
            marks: 2,
            targetMode: "quantitative",
            targetQuantityKey: "mBest",
            expectedAnswer: f3(c.mBest, c.unitM),
            workingSteps: [
              `Triangle spans more than 50% of the plotted line.`,
              `$m = (${f3(yLast)} - ${f3(yFirst)}) / (${f3(xLast)} - ${f3(xFirst)}) = ${f3(c.mBest, c.unitM)}$.`,
            ],
          },
          {
            partId: "b",
            prompt: `Use the steepest and shallowest worst-fit gradients to calculate the percentage uncertainty in $m$.`,
            marks: 2,
            dependsOnPartIds: ["a"],
            targetMode: "quantitative",
            targetQuantityKey: "pctUncM",
            expectedAnswer: f3(pctUncM, "%"),
            workingSteps: [
              `$\\Delta m = \\frac{1}{2}(${f3(mMax)} - ${f3(mMin)}) = ${f3(deltaM, c.unitM)}$.`,
              `Percentage uncertainty $= (${f3(deltaM)} / ${f3(c.mBest)}) \\times 100\\% = ${f3(pctUncM, "%")}$.`,
            ],
          },
          {
            partId: "c",
            prompt: `Calculate the absolute uncertainty $\\Delta c$ in the vertical intercept.`,
            marks: 2,
            targetMode: "quantitative",
            targetQuantityKey: "deltaC",
            expectedAnswer: f3(deltaC, c.unitC),
            workingSteps: [
              `$\\Delta c = \\frac{1}{2}(c_{\\max} - c_{\\min}) = \\frac{1}{2}(${f3(cMax)} - ${f3(cMin)}) = ${f3(deltaC, c.unitC)}$.`,
            ],
          },
          {
            partId: "d",
            prompt: `Explain how the lengths of the vertical error bars change across the plotted range and state what a non-zero vertical intercept indicates.`,
            marks: 2,
            targetMode: "qualitative",
            targetQuantityKey: "errorBarTrendVerdict",
            expectedAnswer: `${verdict}; a non-zero intercept indicates a systematic zero offset.`,
            workingSteps: [
              `Identify constant absolute vs constant percentage uncertainty scaling.`,
              `Link non-zero intercept when theory predicts direct proportionality to a systematic error.`,
            ],
          },
        ],
        workedSolution: `(a) Using the large gradient triangle: $m = (${f3(yLast)} - ${f3(yFirst)}) / (${f3(xLast)} - ${f3(xFirst)}) = ${f3(c.mBest, c.unitM)}$. (b) $\\Delta m = \\frac{1}{2}(${f3(mMax)} - ${f3(mMin)}) = ${f3(deltaM, c.unitM)}$, giving percentage uncertainty $= ${f3(pctUncM, "%")}$. (c) $\\Delta c = \\frac{1}{2}(${f3(cMax)} - ${f3(cMin)}) = ${f3(deltaC, c.unitC)}$. (d) ${verdict}; a non-zero intercept indicates a systematic error.`,
        markScheme: [
          { code: "M1", criterion: "Uses large gradient triangle spanning >50% of line.", marks: 1, partId: "a" },
          { code: "A1", criterion: `Best-fit gradient $m = ${f3(c.mBest, c.unitM)}$.`, marks: 1, partId: "a" },
          { code: "M1", criterion: `Calculates half-spread $\\Delta m = ${f3(deltaM, c.unitM)}$.`, marks: 1, partId: "b" },
          { code: "A1", criterion: `Percentage uncertainty $= ${f3(pctUncM, "%")}$.`, marks: 1, partId: "b" },
          { code: "M1", criterion: "Applies $\\Delta c = \\frac{1}{2}(c_{\\max} - c_{\\min})$.", marks: 1, partId: "c" },
          { code: "A1", criterion: `Absolute intercept uncertainty $\\Delta c = ${f3(deltaC, c.unitC)}$.`, marks: 1, partId: "c" },
          { code: "B1", criterion: verdict, marks: 1, partId: "d" },
          { code: "B1", criterion: "Identifies non-zero vertical intercept as a systematic error (reject random error).", marks: 1, partId: "d" },
        ],
        totalMarks: 8,
        generatorModel: model,
      });
    });
  }

  /* ======================================================================== */
  /*  2. al-prac-instruments-cro (14 items: 5 Q-MCQ, 5 Qual-MCQ, 4 6m Struct) */
  /* ======================================================================== */
  {
    const microSpecs = [
      { slug: "micro-wire-1", mainScaleMm: 2.5, thimbleDiv: 23, zeroErrorMm: 0.04, resolutionMm: 0.01, obj: "a constantan resistance wire" },
      { slug: "micro-wire-2", mainScaleMm: 4.0, thimbleDiv: 37, zeroErrorMm: -0.03, resolutionMm: 0.01, obj: "a thin steel guitar string" },
    ];
    const vernierSpecs = [
      { slug: "vern-rod-1", mainScaleMm: 18, vernierCoincidence: 7, resolutionMm: 0.05, zeroErrorMm: 0.05, obj: "the external diameter of a brass pendulum bob" },
      { slug: "vern-rod-2", mainScaleMm: 26, vernierCoincidence: 9, resolutionMm: 0.02, zeroErrorMm: -0.04, obj: "the thickness of an acrylic optical block" },
    ];
    const croSpecs = [
      { slug: "cro-sig-1", timeBaseMsPerDiv: 2.0, yGainVPerDiv: 1.5, divsPerCycle: 4.0, peakToPeakDivs: 5.2 },
      { slug: "cro-sig-2", timeBaseMsPerDiv: 0.5, yGainVPerDiv: 2.0, divsPerCycle: 3.2, peakToPeakDivs: 4.6 },
    ];

    // 2 Micrometer Q-MCQs
    microSpecs.forEach((m, i) => {
      const spec: Record<string, unknown> = {
        kind: "al-prac-instruments-cro",
        mode: "micrometer",
        mainScaleMm: m.mainScaleMm,
        thimbleDiv: m.thimbleDiv,
        zeroErrorMm: m.zeroErrorMm,
        resolutionMm: m.resolutionMm,
      };
      const q = solveKind("al-prac-instruments-cro", spec);
      const raw = numQ(q, "rawReadingMm");
      const corr = numQ(q, "correctedMm");
      const seed = nextSeed();
      const zSign = m.zeroErrorMm > 0 ? `+${m.zeroErrorMm.toFixed(2)}` : `${m.zeroErrorMm.toFixed(2)}`;
      out.push({
        id: makeId(`${m.slug}-mcq-${i + 1}`),
        conceptId: "precision-instruments-micrometer-vernier",
        templateArchetype: "al-prac-instruments-micrometer",
        seed,
        syllabi: TAG_3_1_Y12,
        format: "mcq",
        questionStyle: "experimental",
        difficulty: "foundation",
        domain: "pure-calculation",
        scenarioSpec: spec,
        hiddenQuantities: ["correctedMm", "rawReadingMm"],
        requiredGivens: [
          { name: "mainScaleMm", value: m.mainScaleMm, unit: "mm", source: "stem" },
          { name: "thimbleDiv", value: m.thimbleDiv, source: "stem" },
          { name: "zeroErrorMm", value: m.zeroErrorMm, unit: "mm", source: "stem" },
        ],
        questionPlan: {
          targetSummary:
            "Determine corrected micrometer diameter after accounting for sleeve, thimble, and signed zero error",
        },
        stem: `A micrometer screw gauge (0.5 mm pitch, 50 thimble divisions) measures ${m.obj}. The last visible main sleeve mark is ${m.mainScaleMm.toFixed(1)} mm and thimble division ${m.thimbleDiv} aligns with the datum line. Before measurement, the closed jaws gave a zero error of ${zSign} mm. What is the corrected diameter?`,
        options: buildNumOptions(
          corr,
          "mm",
          [
            {
              value: raw + m.zeroErrorMm,
              rationale: "Adds the signed zero error instead of subtracting it from the raw reading.",
            },
            {
              value: raw,
              rationale: "Forgets to apply the zero-error correction.",
            },
            {
              value: Math.floor(m.mainScaleMm) + m.thimbleDiv * 0.01 - m.zeroErrorMm,
              rationale: "Misses the exposed 0.5 mm half-millimetre mark on the lower sleeve scale.",
            },
          ],
          seed,
        ),
        targetMode: "quantitative",
        targetQuantityKey: "correctedMm",
        workedSolution: `Raw reading $= ${m.mainScaleMm.toFixed(1)} + ${m.thimbleDiv} \\times 0.01 = ${raw.toFixed(2)}$ mm. Subtracting the signed zero error (${zSign} mm) gives corrected diameter $= ${raw.toFixed(2)} - (${zSign}) = ${corr.toFixed(2)}$ mm (${f3(corr, "mm")}).`,
        markScheme: [
          {
            code: "A1",
            criterion: `Corrected micrometer reading $= ${corr.toFixed(2)}$ mm (${f3(corr, "mm")}).`,
            marks: 1,
          },
        ],
        totalMarks: 1,
        generatorModel: model,
      });
    });

    // 2 Vernier Q-MCQs
    vernierSpecs.forEach((v, i) => {
      const spec: Record<string, unknown> = {
        kind: "al-prac-instruments-cro",
        mode: "vernier",
        mainScaleMm: v.mainScaleMm,
        vernierCoincidence: v.vernierCoincidence,
        resolutionMm: v.resolutionMm,
        zeroErrorMm: v.zeroErrorMm,
      };
      const q = solveKind("al-prac-instruments-cro", spec);
      const raw = numQ(q, "rawReadingMm");
      const corr = numQ(q, "correctedMm");
      const seed = nextSeed();
      const zSign = v.zeroErrorMm > 0 ? `+${v.zeroErrorMm.toFixed(2)}` : `${v.zeroErrorMm.toFixed(2)}`;
      out.push({
        id: makeId(`${v.slug}-mcq-${i + 1}`),
        conceptId: "precision-instruments-micrometer-vernier",
        templateArchetype: "al-prac-instruments-vernier",
        seed,
        syllabi: TAG_3_1_Y12,
        format: "mcq",
        questionStyle: "experimental",
        difficulty: "foundation",
        domain: "pure-calculation",
        scenarioSpec: spec,
        hiddenQuantities: ["correctedMm", "rawReadingMm"],
        requiredGivens: [
          { name: "mainScaleMm", value: v.mainScaleMm, unit: "mm", source: "stem" },
          { name: "vernierCoincidence", value: v.vernierCoincidence, source: "stem" },
          { name: "resolutionMm", value: v.resolutionMm, unit: "mm", source: "stem" },
          { name: "zeroErrorMm", value: v.zeroErrorMm, unit: "mm", source: "stem" },
        ],
        questionPlan: {
          targetSummary:
            "Determine corrected Vernier calliper reading from main scale, aligned vernier division, resolution, and zero error",
        },
        stem: `Vernier callipers of resolution ${v.resolutionMm.toFixed(2)} mm measure ${v.obj}. The vernier zero lies just past ${v.mainScaleMm} mm and vernier division ${v.vernierCoincidence} aligns directly with a main-scale mark. The closed-jaw zero error is ${zSign} mm. What is the corrected dimension?`,
        options: buildNumOptions(
          corr,
          "mm",
          [
            {
              value: raw + v.zeroErrorMm,
              rationale: "Applies the zero-error sign backwards by adding instead of subtracting.",
            },
            {
              value: v.mainScaleMm + v.vernierCoincidence * 0.1 - v.zeroErrorMm,
              rationale: "Assumes 0.1 mm resolution instead of the stated Vernier resolution.",
            },
            {
              value: raw + 1.0,
              rationale: "Reads the main-scale mark immediately above rather than immediately before the Vernier zero.",
            },
          ],
          seed,
          4,
        ),
        targetMode: "quantitative",
        targetQuantityKey: "correctedMm",
        workedSolution: `Raw Vernier reading $= ${v.mainScaleMm} + ${v.vernierCoincidence} \\times ${v.resolutionMm.toFixed(2)} = ${raw.toFixed(2)}$ mm. Correcting for zero error (${zSign} mm): $${raw.toFixed(2)} - (${zSign}) = ${corr.toFixed(2)}$ mm.`,
        markScheme: [
          {
            code: "A1",
            criterion: `Corrected Vernier reading $= ${corr.toFixed(2)}$ mm (${f4(corr, "mm")}).`,
            marks: 1,
          },
        ],
        totalMarks: 1,
        generatorModel: model,
      });
    });

    // 1 CRO Q-MCQ
    {
      const c = croSpecs[0];
      const spec: Record<string, unknown> = {
        kind: "al-prac-instruments-cro",
        mode: "cro-waveform",
        timeBaseMsPerDiv: c.timeBaseMsPerDiv,
        yGainVPerDiv: c.yGainVPerDiv,
        divsPerCycle: c.divsPerCycle,
        peakToPeakDivs: c.peakToPeakDivs,
      };
      const q = solveKind("al-prac-instruments-cro", spec);
      const freqHz = numQ(q, "freqHz");
      const vRms = numQ(q, "vRmsV");
      const vPeak = numQ(q, "vPeakV");
      const vP2p = numQ(q, "vPeakToPeakV");
      const seed = nextSeed();
      out.push({
        id: makeId("cro-vrms-mcq-1"),
        conceptId: "precision-instruments-cro",
        templateArchetype: "al-prac-instruments-cro",
        seed,
        syllabi: TAG_3_1_Y12,
        format: "mcq",
        questionStyle: "experimental",
        difficulty: "standard",
        domain: "pure-calculation",
        scenarioSpec: spec,
        hiddenQuantities: ["vRmsV", "vPeakV", "vPeakToPeakV", "freqHz"],
        requiredGivens: [
          { name: "timeBaseMsPerDiv", value: c.timeBaseMsPerDiv, source: "either" },
          { name: "yGainVPerDiv", value: c.yGainVPerDiv, source: "either" },
          { name: "divsPerCycle", value: c.divsPerCycle, source: "stem" },
          { name: "peakToPeakDivs", value: c.peakToPeakDivs, source: "stem" },
        ],
        questionPlan: {
          targetSummary:
            "Compute rms voltage from oscilloscope peak to peak vertical divisions and Y gain setting",
        },
        stem: `An alternating potential difference produces the sinusoidal trace shown on a cathode-ray oscilloscope with time-base ${c.timeBaseMsPerDiv.toFixed(1)} ms div⁻¹ and Y-gain ${c.yGainVPerDiv.toFixed(1)} V div⁻¹. One complete cycle occupies ${c.divsPerCycle.toFixed(1)} horizontal divisions and the vertical peak-to-peak height is ${c.peakToPeakDivs.toFixed(1)} divisions. Calculate the root-mean-square voltage of the signal.`,
        options: buildNumOptions(
          vRms,
          "V",
          [
            {
              value: vPeak,
              rationale: "Stops at peak voltage V₀ without dividing by √2.",
            },
            {
              value: vP2p,
              rationale: "Reports the full peak-to-peak voltage instead of rms voltage.",
            },
            {
              value: vP2p / Math.SQRT2,
              rationale: "Divides peak-to-peak voltage by √2 instead of 2√2.",
            },
          ],
          seed,
        ),
        targetMode: "quantitative",
        targetQuantityKey: "vRmsV",
        workedSolution: `Peak-to-peak voltage $V_{\\mathrm{pp}} = ${c.peakToPeakDivs} \\times ${c.yGainVPerDiv} = ${f3(vP2p, "V")}$. Peak voltage $V_0 = V_{\\mathrm{pp}} / 2 = ${f3(vPeak, "V")}$. Therefore $V_{\\mathrm{rms}} = V_0 / \\sqrt{2} = ${f3(vRms, "V")}$ (frequency $= ${f3(freqHz, "Hz")}$).`,
        markScheme: [
          {
            code: "A1",
            criterion: `Correctly computes $V_{\\mathrm{rms}} = V_{\\mathrm{pp}} / (2\\sqrt{2}) = ${f3(vRms, "V")}$.`,
            marks: 1,
          },
        ],
        totalMarks: 1,
        generatorModel: model,
      });
    }

    // 5 Qualitative MCQs on micrometer / Vernier / CRO precautions
    const instQuals = [
      {
        slug: "inst-qual-ratchet",
        modeSpec: { kind: "al-prac-instruments-cro", mode: "micrometer", mainScaleMm: 2.5, thimbleDiv: 23, zeroErrorMm: 0.04, resolutionMm: 0.01 },
        archetype: "al-prac-instruments-micrometer",
        conceptId: "precision-instruments-micrometer-vernier",
        stem: "Why should a student turn the ratchet rather than the main thimble when closing a micrometer screw gauge onto a soft copper wire, and why must diameter be measured at multiple orientations?",
        correct:
          "Use the ratchet to avoid over tightening or compressing the wire and repeat orthogonal diameter measurements along the length to detect non-circularity.",
        distractors: [
          {
            text: "Turning the main thimble removes zero error automatically while orthogonal measurements eliminate systematic instrument bias.",
            rationale: "Closing by the thimble over-tightens and damages the wire; repeats reduce random error rather than eliminating systematic bias.",
          },
          {
            text: "The ratchet doubles the thimble resolution so a single measurement at the wire midpoint is exact.",
            rationale: "The ratchet limits clamping force; it does not alter scale resolution.",
          },
          {
            text: "Orthogonal measurements are needed only to ensure the wire length remains constant under tension.",
            rationale: "Orthogonal diameter readings test whether the wire cross-section is uniform and circular.",
          },
        ] as const,
      },
      {
        slug: "inst-qual-parallax",
        modeSpec: { kind: "al-prac-instruments-cro", mode: "vernier", mainScaleMm: 18, vernierCoincidence: 7, resolutionMm: 0.05, zeroErrorMm: 0.05 },
        archetype: "al-prac-instruments-vernier",
        conceptId: "precision-instruments-micrometer-vernier",
        stem: "Before measuring a metallic cylinder with manual Vernier callipers, which pair of practical precautions directly minimises both systematic zero offset and reading parallax?",
        correct:
          "Record any zero error with the jaws closed and view the coinciding vernier division perpendicularly to eliminate parallax.",
        distractors: [
          {
            text: "Take repeat readings from alternating oblique angles so parallax errors cancel systematically.",
            rationale: "Oblique viewing introduces random and systematic parallax errors; scales must always be viewed perpendicularly.",
          },
          {
            text: "Clamp the jaws tightly using pliers and round every reading to the nearest full millimetre.",
            rationale: "Excess force deforms the jaws and rounding discards Vernier resolution.",
          },
          {
            text: "Zero error is negligible whenever the cylinder diameter exceeds ten millimetres.",
            rationale: "A non-zero jaw reading shifts every measurement by a constant systematic offset.",
          },
        ] as const,
      },
      {
        slug: "inst-qual-cro-timebase",
        modeSpec: { kind: "al-prac-instruments-cro", mode: "cro-waveform", timeBaseMsPerDiv: 2.0, yGainVPerDiv: 1.5, divsPerCycle: 4.0, peakToPeakDivs: 5.2 },
        archetype: "al-prac-instruments-cro",
        conceptId: "precision-instruments-cro",
        stem: "An oscilloscope displays eight tightly packed sinusoidal cycles across the screen. How should the student adjust the time-base to improve precision in measuring the period, and what happens if the time-base is switched off completely?",
        correct:
          "Reduce the time base setting to stretch the waveform horizontally for lower percentage uncertainty and switching time base off produces a vertical line of height peak to peak voltage.",
        distractors: [
          {
            text: "Increase the time-base setting to pack more cycles onto the screen, while switching time-base off turns the trace into a single stationary dot.",
            rationale: "Increasing ms div⁻¹ compresses cycles further; an AC signal with time-base off produces a vertical line of height V_pp (only DC makes a dot).",
          },
          {
            text: "Increase Y-gain to stretch the trace horizontally, while switching time-base off displays a horizontal line at V_rms.",
            rationale: "Y-gain scales vertical voltage, not horizontal time; time-base off collapses horizontal sweep to zero.",
          },
          {
            text: "Reduce Y-gain to expand the horizontal period and switching time-base off clears the screen completely.",
            rationale: "Time-base controls horizontal sweep; with sweep off the electron beam oscillates vertically across V_pp.",
          },
        ] as const,
      },
      {
        slug: "inst-qual-micro-area-unc",
        modeSpec: { kind: "al-prac-instruments-cro", mode: "micrometer", mainScaleMm: 4.0, thimbleDiv: 37, zeroErrorMm: -0.03, resolutionMm: 0.01 },
        archetype: "al-prac-instruments-micrometer",
        conceptId: "precision-instruments-micrometer-vernier",
        stem: "In both resistivity (RP5) and Young modulus (RP4) investigations, why does a student devote particular care to micrometer measurements of wire diameter $d$?",
        correct:
          "Because area depends on diameter squared, percentage uncertainty doubles, so students must use the ratchet to avoid over tightening or compressing the wire and repeat orthogonal diameter measurements along the length.",
        distractors: [
          {
            text: "Because percentage uncertainty in cross-sectional area is half the percentage uncertainty in diameter.",
            rationale: "Since A = πd²/4, %ΔA = 2 × %Δd, not half.",
          },
          {
            text: "Because micrometer readings are unaffected by wire compression, so repeating measurements only reduces systematic zero error.",
            rationale: "Over-tightening compresses soft wire and repeats reduce random uncertainty, not systematic zero error.",
          },
          {
            text: "Because diameter enters linearly into stress and resistivity calculations.",
            rationale: "Diameter enters quadratically through cross-sectional area A = πd²/4.",
          },
        ] as const,
      },
      {
        slug: "inst-qual-cro-dc-vs-ac",
        modeSpec: { kind: "al-prac-instruments-cro", mode: "cro-waveform", timeBaseMsPerDiv: 0.5, yGainVPerDiv: 2.0, divsPerCycle: 3.2, peakToPeakDivs: 4.6 },
        archetype: "al-prac-instruments-cro",
        conceptId: "precision-instruments-cro",
        stem: "A technician compares two CRO adjustments when characterising a sinusoidal laboratory generator output. Which statement accurately describes the effect of the time-base control?",
        correct:
          "Reduce the time base setting to stretch the waveform horizontally for lower percentage uncertainty and switching time base off produces a vertical line of height peak to peak voltage.",
        distractors: [
          {
            text: "Switching time-base off produces a vertical line of height equal to peak voltage V₀ rather than peak-to-peak voltage.",
            rationale: "The beam swings from −V₀ to +V₀, giving total vertical length 2V₀ = V_pp.",
          },
          {
            text: "Reducing the time-base setting decreases the actual frequency of the alternating generator.",
            rationale: "Adjusting CRO time-base changes only the display horizontal scale, never the source frequency.",
          },
          {
            text: "Switching time-base off converts the alternating supply into a constant direct current voltage.",
            rationale: "The supply remains alternating; only the horizontal sweep voltage inside the CRO stops.",
          },
        ] as const,
      },
    ];

    instQuals.forEach((b, i) => {
      const seed = nextSeed();
      out.push({
        id: makeId(`${b.slug}-${i + 1}`),
        conceptId: b.conceptId,
        templateArchetype: b.archetype,
        seed,
        syllabi: TAG_3_1_Y12,
        format: "mcq",
        questionStyle: "qualitative",
        difficulty: "standard",
        domain: "pure-calculation",
        scenarioSpec: b.modeSpec,
        hiddenQuantities: ["precautionAnchor"],
        requiredGivens: [],
        questionPlan: {
          targetSummary:
            "Assess laboratory instrument technique and uncertainty reduction on micrometer, Vernier calliper, or CRO",
        },
        stem: b.stem,
        options: buildVerbalOptions(b.correct, b.distractors, seed),
        targetMode: "qualitative",
        targetQuantityKey: "precautionAnchor",
        workedSolution: `Correct experimental practice: ${b.correct}`,
        markScheme: [
          { code: "A1", criterion: b.correct, marks: 1 },
        ],
        totalMarks: 1,
        generatorModel: model,
      });
    });

    // 4 Paper 3A Structured 6m Ladders (1 micro, 1 vernier, 2 CRO)
    {
      const m = microSpecs[0];
      const spec: Record<string, unknown> = {
        kind: "al-prac-instruments-cro",
        mode: "micrometer",
        mainScaleMm: m.mainScaleMm,
        thimbleDiv: m.thimbleDiv,
        zeroErrorMm: m.zeroErrorMm,
        resolutionMm: m.resolutionMm,
      };
      const q = solveKind("al-prac-instruments-cro", spec);
      const corr = numQ(q, "correctedMm");
      const pctUnc = numQ(q, "pctUnc");
      const pctArea = numQ(q, "pctUncArea");
      const anchor = strQ(q, "precautionAnchor");
      const seed = nextSeed();
      out.push({
        id: makeId("micro-p3a-6m-1"),
        conceptId: "precision-instruments-micrometer-vernier",
        templateArchetype: "al-prac-instruments-micrometer",
        seed,
        syllabi: TAG_3_1_Y12,
        format: "structured",
        questionStyle: "mixed-exam",
        difficulty: "standard",
        domain: "pure-calculation",
        scenarioSpec: spec,
        hiddenQuantities: ["correctedMm", "pctUnc", "pctUncArea", "precautionAnchor"],
        requiredGivens: [
          { name: "mainScaleMm", value: m.mainScaleMm, unit: "mm", source: "stem" },
          { name: "thimbleDiv", value: m.thimbleDiv, source: "stem" },
          { name: "zeroErrorMm", value: m.zeroErrorMm, unit: "mm", source: "stem" },
          { name: "resolutionMm", value: m.resolutionMm, unit: "mm", source: "stem" },
        ],
        questionPlan: {
          targetSummary:
            "Paper three section A structured micrometer reading, area uncertainty propagation, and experimental precaution",
        },
        stem: `A micrometer screw gauge of resolution ${m.resolutionMm.toFixed(2)} mm is used to determine the diameter of ${m.obj}. The main sleeve shows ${m.mainScaleMm.toFixed(1)} mm and thimble division ${m.thimbleDiv} coincides with the datum line. The instrument exhibits a closed-jaw zero error of +${m.zeroErrorMm.toFixed(2)} mm.`,
        parts: [
          {
            partId: "a",
            prompt: "Calculate the corrected diameter $d$ of the wire in mm.",
            marks: 2,
            targetMode: "quantitative",
            targetQuantityKey: "correctedMm",
            expectedAnswer: `${corr.toFixed(2)} mm`,
            workingSteps: [
              `Raw reading $= ${m.mainScaleMm.toFixed(1)} + ${m.thimbleDiv} \\times 0.01 = ${(m.mainScaleMm + m.thimbleDiv * 0.01).toFixed(2)}$ mm.`,
              `Subtract zero error: $d = ${corr.toFixed(2)}$ mm.`,
            ],
          },
          {
            partId: "b",
            prompt: "Assuming the absolute uncertainty in $d$ equals the resolution (0.01 mm), calculate the percentage uncertainty in the cross-sectional area $A = \\pi d^2 / 4$.",
            marks: 2,
            dependsOnPartIds: ["a"],
            targetMode: "quantitative",
            targetQuantityKey: "pctUncArea",
            expectedAnswer: f3(pctArea, "%"),
            workingSteps: [
              `$\\%\\Delta d = (0.01 / ${corr.toFixed(2)}) \\times 100\\% = ${f3(pctUnc, "%")}$.`,
              `$\\%\\Delta A = 2 \\times \\%\\Delta d = ${f3(pctArea, "%")}$.`,
            ],
          },
          {
            partId: "c",
            prompt: "State two experimental precautions required when using the micrometer on this wire.",
            marks: 2,
            targetMode: "qualitative",
            targetQuantityKey: "precautionAnchor",
            expectedAnswer: anchor,
            workingSteps: [
              "Close spindle with the ratchet to prevent compressing the wire.",
              "Measure orthogonal diameters at three positions along the wire and average.",
            ],
          },
        ],
        workedSolution: `(a) Corrected diameter $d = ${(m.mainScaleMm + m.thimbleDiv * 0.01).toFixed(2)} - 0.04 = ${corr.toFixed(2)}$ mm. (b) $\\%\\Delta d = ${f3(pctUnc, "%")}$, so $\\%\\Delta A = 2 \\times \\%\\Delta d = ${f3(pctArea, "%")}$. (c) ${anchor}.`,
        markScheme: [
          { code: "M1", criterion: "Reads sleeve + thimble correctly and subtracts positive zero error.", marks: 1, partId: "a" },
          { code: "A1", criterion: `Corrected diameter $d = ${corr.toFixed(2)}$ mm.`, marks: 1, partId: "a" },
          { code: "M1", criterion: `Computes $\\%\\Delta d = ${f3(pctUnc, "%")}$ and doubles for $d^2$.`, marks: 1, partId: "b" },
          { code: "A1", criterion: `Percentage uncertainty in area $= ${f3(pctArea, "%")}$.`, marks: 1, partId: "b" },
          { code: "B1", criterion: "Close spindle using the ratchet to avoid compressing/deforming the wire.", marks: 1, partId: "c" },
          { code: "B1", criterion: "Take repeat measurements in perpendicular/orthogonal directions at >= 3 positions along the wire.", marks: 1, partId: "c" },
        ],
        totalMarks: 6,
        generatorModel: model,
      });

      const v = vernierSpecs[1];
      const vSpec: Record<string, unknown> = {
        kind: "al-prac-instruments-cro",
        mode: "vernier",
        mainScaleMm: v.mainScaleMm,
        vernierCoincidence: v.vernierCoincidence,
        resolutionMm: v.resolutionMm,
        zeroErrorMm: v.zeroErrorMm,
      };
      const vq = solveKind("al-prac-instruments-cro", vSpec);
      const vCorr = numQ(vq, "correctedMm");
      const vPct = numQ(vq, "pctUnc");
      const vAnchor = strQ(vq, "precautionAnchor");
      out.push({
        id: makeId("vern-p3a-6m-2"),
        conceptId: "precision-instruments-micrometer-vernier",
        templateArchetype: "al-prac-instruments-vernier",
        seed: nextSeed(),
        syllabi: TAG_3_1_Y12,
        format: "structured",
        questionStyle: "mixed-exam",
        difficulty: "standard",
        domain: "pure-calculation",
        scenarioSpec: vSpec,
        hiddenQuantities: ["correctedMm", "pctUnc", "precautionAnchor"],
        requiredGivens: [
          { name: "mainScaleMm", value: v.mainScaleMm, unit: "mm", source: "stem" },
          { name: "vernierCoincidence", value: v.vernierCoincidence, source: "stem" },
          { name: "resolutionMm", value: v.resolutionMm, unit: "mm", source: "stem" },
          { name: "zeroErrorMm", value: v.zeroErrorMm, unit: "mm", source: "stem" },
        ],
        questionPlan: {
          targetSummary:
            "Paper three section A structured Vernier calliper zero error correction, percentage uncertainty, and parallax precaution",
        },
        stem: `Manual Vernier callipers (resolution ${v.resolutionMm.toFixed(2)} mm) are used to measure ${v.obj}. The vernier zero passes ${v.mainScaleMm} mm and vernier mark ${v.vernierCoincidence} aligns with the main scale. When closed, the jaws read ${v.zeroErrorMm.toFixed(2)} mm.`,
        parts: [
          {
            partId: "a",
            prompt: "Determine the corrected thickness of the block in mm.",
            marks: 2,
            targetMode: "quantitative",
            targetQuantityKey: "correctedMm",
            expectedAnswer: `${vCorr.toFixed(2)} mm`,
            workingSteps: [
              `Raw reading $= ${v.mainScaleMm} + ${v.vernierCoincidence} \\times ${v.resolutionMm.toFixed(2)} = ${(v.mainScaleMm + v.vernierCoincidence * v.resolutionMm).toFixed(2)}$ mm.`,
              `Subtract negative zero error: ${vCorr.toFixed(2)} mm.`,
            ],
          },
          {
            partId: "b",
            prompt: "Calculate the percentage uncertainty associated with a single reading of this thickness.",
            marks: 2,
            dependsOnPartIds: ["a"],
            targetMode: "quantitative",
            targetQuantityKey: "pctUnc",
            expectedAnswer: f3(vPct, "%"),
            workingSteps: [
              `$\\%\\Delta t = (${v.resolutionMm.toFixed(2)} / ${vCorr.toFixed(2)}) \\times 100\\% = ${f3(vPct, "%")}$.`,
            ],
          },
          {
            partId: "c",
            prompt: "Describe two checks the student should perform to reduce systematic and random errors with Vernier callipers.",
            marks: 2,
            targetMode: "qualitative",
            targetQuantityKey: "precautionAnchor",
            expectedAnswer: vAnchor,
            workingSteps: [
              "Inspect and record closed-jaw zero error before measuring.",
              "Align eye perpendicularly to the coinciding division to avoid parallax.",
            ],
          },
        ],
        workedSolution: `(a) Raw reading $= ${(v.mainScaleMm + v.vernierCoincidence * v.resolutionMm).toFixed(2)}$ mm; subtracting $-0.04$ mm gives ${vCorr.toFixed(2)} mm. (b) Percentage uncertainty $= (0.02 / ${vCorr.toFixed(2)}) \\times 100\\% = ${f3(vPct, "%")}$. (c) ${vAnchor}.`,
        markScheme: [
          { code: "M1", criterion: "Combines main scale and Vernier coincidence, then subtracts negative zero error.", marks: 1, partId: "a" },
          { code: "A1", criterion: `Corrected thickness $= ${vCorr.toFixed(2)}$ mm.`, marks: 1, partId: "a" },
          { code: "M1", criterion: "Divides instrument resolution by corrected thickness and multiplies by 100%.", marks: 1, partId: "b" },
          { code: "A1", criterion: `Percentage uncertainty $= ${f3(vPct, "%")}$.`, marks: 1, partId: "b" },
          { code: "B1", criterion: "Check and correct for closed-jaw zero error.", marks: 1, partId: "c" },
          { code: "B1", criterion: "View the aligned scale mark perpendicularly at eye level to eliminate parallax.", marks: 1, partId: "c" },
        ],
        totalMarks: 6,
        generatorModel: model,
      });

      croSpecs.forEach((c, idx) => {
        const cSpec: Record<string, unknown> = {
          kind: "al-prac-instruments-cro",
          mode: "cro-waveform",
          timeBaseMsPerDiv: c.timeBaseMsPerDiv,
          yGainVPerDiv: c.yGainVPerDiv,
          divsPerCycle: c.divsPerCycle,
          peakToPeakDivs: c.peakToPeakDivs,
        };
        const cq = solveKind("al-prac-instruments-cro", cSpec);
        const periodS = numQ(cq, "periodS");
        const freqHz = numQ(cq, "freqHz");
        const vRms = numQ(cq, "vRmsV");
        const vPeak = numQ(cq, "vPeakV");
        const cAnchor = strQ(cq, "precautionAnchor");
        out.push({
          id: makeId(`cro-p3a-6m-${idx + 3}`),
          conceptId: "precision-instruments-cro",
          templateArchetype: "al-prac-instruments-cro",
          seed: nextSeed(),
          syllabi: TAG_3_1_Y12,
          format: "structured",
          questionStyle: "mixed-exam",
          difficulty: idx === 0 ? "standard" : "higher",
          domain: "pure-calculation",
          scenarioSpec: cSpec,
          hiddenQuantities: ["freqHz", "vRmsV", "vPeakV", "periodS", "precautionAnchor"],
          requiredGivens: [
            { name: "timeBaseMsPerDiv", value: c.timeBaseMsPerDiv, source: "either" },
            { name: "yGainVPerDiv", value: c.yGainVPerDiv, source: "either" },
            { name: "divsPerCycle", value: c.divsPerCycle, source: "stem" },
            { name: "peakToPeakDivs", value: c.peakToPeakDivs, source: "stem" },
          ],
          questionPlan: {
            targetSummary:
              "Paper three section A oscilloscope waveform calculation of frequency, rms voltage, and time base technique",
          },
          stem: `A laboratory signal generator feeds a sinusoidal voltage to a calibrated cathode-ray oscilloscope set to time-base ${c.timeBaseMsPerDiv.toFixed(1)} ms div⁻¹ and Y-gain ${c.yGainVPerDiv.toFixed(1)} V div⁻¹. The trace spans ${c.divsPerCycle.toFixed(1)} horizontal divisions per cycle and ${c.peakToPeakDivs.toFixed(1)} vertical divisions peak-to-peak.`,
          parts: [
            {
              partId: "a",
              prompt: "Determine the frequency $f$ of the alternating signal.",
              marks: 2,
              targetMode: "quantitative",
              targetQuantityKey: "freqHz",
              expectedAnswer: f3(freqHz, "Hz"),
              workingSteps: [
                `$T = ${c.divsPerCycle} \\times ${c.timeBaseMsPerDiv} \\times 10^{-3} = ${f3(periodS, "s")}$.`,
                `$f = 1/T = ${f3(freqHz, "Hz")}$.`,
              ],
            },
            {
              partId: "b",
              prompt: "Calculate the root-mean-square voltage $V_{\\mathrm{rms}}$ of the signal.",
              marks: 2,
              targetMode: "quantitative",
              targetQuantityKey: "vRmsV",
              expectedAnswer: f3(vRms, "V"),
              workingSteps: [
                `$V_0 = \\frac{1}{2} \\times ${c.peakToPeakDivs} \\times ${c.yGainVPerDiv} = ${f3(vPeak, "V")}$.`,
                `$V_{\\mathrm{rms}} = V_0 / \\sqrt{2} = ${f3(vRms, "V")}$.`,
              ],
            },
            {
              partId: "c",
              prompt: "Explain how adjusting the time-base improves period precision and describe the screen trace if the time-base is switched off.",
              marks: 2,
              targetMode: "qualitative",
              targetQuantityKey: "precautionAnchor",
              expectedAnswer: cAnchor,
              workingSteps: [
                "Lower ms div⁻¹ stretches one cycle across more divisions, cutting % uncertainty.",
                "With time-base OFF, AC forms a centred vertical line of length peak-to-peak voltage.",
              ],
            },
          ],
          workedSolution: `(a) $T = ${f3(periodS, "s")}$, so $f = 1/T = ${f3(freqHz, "Hz")}$. (b) $V_0 = ${f3(vPeak, "V")}$, giving $V_{\\mathrm{rms}} = ${f3(vRms, "V")}$. (c) ${cAnchor}.`,
          markScheme: [
            { code: "M1", criterion: `Calculates period $T = ${f3(periodS, "s")}$ from divisions × time-base.`, marks: 1, partId: "a" },
            { code: "A1", criterion: `Frequency $f = ${f3(freqHz, "Hz")}$.`, marks: 1, partId: "a" },
            { code: "M1", criterion: `Finds peak voltage $V_0 = ${f3(vPeak, "V")}$ and divides by $\\sqrt{2}$.`, marks: 1, partId: "b" },
            { code: "A1", criterion: `Root-mean-square voltage $V_{\\mathrm{rms}} = ${f3(vRms, "V")}$.`, marks: 1, partId: "b" },
            { code: "B1", criterion: "Reduce time-base setting (ms div⁻¹) to stretch waveform horizontally and lower % uncertainty.", marks: 1, partId: "c" },
            { code: "B1", criterion: "Time-base OFF collapses AC waveform to a vertical line of height equal to peak-to-peak voltage.", marks: 1, partId: "c" },
          ],
          totalMarks: 6,
          generatorModel: model,
        });
      });
    }
  }

  /* ======================================================================== */
  /*  3. al-prac-log-linearization (12 items: 4 Q-MCQ, 4 Qual-MCQ, 4 8m)      */
  /* ======================================================================== */
  {
    const logCases = [
      {
        slug: "log-power-cantilever",
        lawType: "power-lg" as const,
        xMin: 0.6,
        x1: 0.7,
        y1: 0.35,
        x2: 1.5,
        y2: 1.55,
        xAxisTitle: "lg(L / cm)",
        yAxisTitle: "lg(T / ms)",
        eqDesc: "$T = k L^n$",
        ctx: "measuring oscillation period $T$ of a clamped metre-rule cantilever of length $L$",
      },
      {
        slug: "log-power-drag",
        lawType: "power-lg" as const,
        xMin: 0.4,
        x1: 0.5,
        y1: 0.6,
        x2: 1.3,
        y2: 2.04,
        xAxisTitle: "lg(v / m s⁻¹)",
        yAxisTitle: "lg(F / mN)",
        eqDesc: "$F = k v^n$",
        ctx: "investigating aerodynamic drag force $F$ against terminal speed $v$ of paper cones",
      },
      {
        slug: "log-exp-cooling",
        lawType: "exp-ln" as const,
        xMin: 20,
        x1: 30,
        y1: 3.6,
        x2: 110,
        y2: 2.0,
        xAxisTitle: "t / s",
        yAxisTitle: "ln(Δθ / °C)",
        eqDesc: "$\\Delta\\theta = A e^{-\\lambda t}$",
        ctx: "monitoring excess temperature $\\Delta\\theta$ of a hot copper sphere cooling in a steady draught",
      },
      {
        slug: "log-exp-damping",
        lawType: "exp-ln" as const,
        xMin: 10,
        x1: 15,
        y1: 2.9,
        x2: 65,
        y2: 1.15,
        xAxisTitle: "t / s",
        yAxisTitle: "ln(x / mm)",
        eqDesc: "$x = A e^{-\\lambda t}$",
        ctx: "tracking the exponential amplitude decay $x$ of a magnetically damped aluminium pendulum",
      },
    ];

    // 4 Quantitative MCQs (testing false-origin extraction k = 10^c and A = e^c!)
    logCases.forEach((c, i) => {
      const spec: Record<string, unknown> = {
        kind: "al-prac-log-linearization",
        lawType: c.lawType,
        xMin: c.xMin,
        x1: c.x1,
        y1: c.y1,
        x2: c.x2,
        y2: c.y2,
        xAxisTitle: c.xAxisTitle,
        yAxisTitle: c.yAxisTitle,
      };
      const q = solveKind("al-prac-log-linearization", spec);
      const seed = nextSeed();
      const isPower = c.lawType === "power-lg";
      const askConst = i % 2 === 1;
      const targetKey = isPower
        ? askConst
          ? "coeffK"
          : "exponentN"
        : askConst
          ? "initialA"
          : "decayConst";
      const truth = numQ(q, targetKey);
      const unit = isPower ? undefined : askConst ? "mm" : "s⁻¹";

      const stem = isPower
        ? askConst
          ? `A student investigates ${c.eqDesc} while ${c.ctx} and plots ${c.yAxisTitle} against ${c.xAxisTitle} with a false origin at $x_{\\min} = ${c.xMin.toFixed(2)}$. Two points on the straight best-fit line are $(${c.x1.toFixed(2)}, ${c.y1.toFixed(2)})$ and $(${c.x2.toFixed(2)}, ${c.y2.toFixed(2)})$. Determine the constant $k$.`
          : `While ${c.ctx}, a student tests the power law ${c.eqDesc} by plotting ${c.yAxisTitle} against ${c.xAxisTitle} with a false origin at ${c.xMin.toFixed(2)}. Two points on the line of best fit are $(${c.x1.toFixed(2)}, ${c.y1.toFixed(2)})$ and $(${c.x2.toFixed(2)}, ${c.y2.toFixed(2)})$. Calculate the exponent $n$.`
        : askConst
          ? `While ${c.ctx}, a student tests ${c.eqDesc} using a semi-log plot of ${c.yAxisTitle} against ${c.xAxisTitle} starting at a false origin $t = ${c.xMin}$ s. Two well-spaced points on the line are $(${c.x1}, ${c.y1.toFixed(2)})$ and $(${c.x2}, ${c.y2.toFixed(2)})$. Calculate the initial amplitude $A$ at $t = 0$.`
          : `During a Paper 3A experiment ${c.ctx}, data obey ${c.eqDesc}. On a semi-log plot of ${c.yAxisTitle} against ${c.xAxisTitle} with false origin $t = ${c.xMin}$ s, the best-fit line passes through $(${c.x1}, ${c.y1.toFixed(2)})$ and $(${c.x2}, ${c.y2.toFixed(2)})$. Find the decay constant $\\lambda$.`;

      const distractors: NumericDistractor[] = isPower
        ? askConst
          ? [
              {
                value: numQ(q, "naiveCoeffK"),
                rationale: "False-origin trap: reads the y-axis crossing at x = x_min as lg k instead of substituting a line point.",
              },
              {
                value: Math.exp(numQ(q, "lgK")),
                rationale: "Uses e^c instead of 10^c for a base-10 logarithm (lg) plot.",
              },
              {
                value: Math.abs(numQ(q, "lgK")),
                rationale: "Forgets to take the antilogarithm 10^(lg k) after finding the intercept.",
              },
            ]
          : [
              {
                value: 1 / truth,
                rationale: "Inverts the gradient triangle (Δx / Δy instead of Δy / Δx).",
              },
              {
                value: c.y2 / c.x2,
                rationale: "Assumes the line passes through the true origin (0, 0).",
              },
              {
                value: 10 ** truth,
                rationale: "Takes 10^gradient unnecessarily when the gradient directly equals the exponent n.",
              },
            ]
        : askConst
          ? [
              {
                value: numQ(q, "naiveInitialA"),
                rationale: "False-origin trap: takes exp of the vertical axis crossing at t = t_min instead of t = 0.",
              },
              {
                value: 10 ** numQ(q, "lnA"),
                rationale: "Applies base-10 antilog 10^c instead of e^c on a natural logarithm (ln) graph.",
              },
              {
                value: numQ(q, "lnA"),
                rationale: "Reports ln A directly without exponentiating to find A.",
              },
            ]
          : [
              {
                value: 1 / truth,
                rationale: "Computes the time constant 1/λ rather than the decay constant λ.",
              },
              {
                value: truth / Math.LN10,
                rationale: "Divides by ln 10 as if the plot used base-10 logarithms.",
              },
              {
                value: c.y1 / c.x1,
                rationale: "Uses a single point ratio instead of the gradient of the straight line.",
              },
            ];

      out.push({
        id: makeId(`${c.slug}-qmcq-${i + 1}`),
        conceptId: "log-linearization-false-origin",
        templateArchetype: isPower
          ? "al-prac-log-linearization-power"
          : "al-prac-log-linearization-exp",
        seed,
        syllabi: TAG_3_1_Y13,
        format: "mcq",
        questionStyle: "experimental",
        difficulty: askConst ? "higher" : "standard",
        domain: "graphs",
        scenarioSpec: spec,
        hiddenQuantities: isPower
          ? ["exponentN", "lgK", "coeffK"]
          : ["decayConst", "lnA", "initialA", "halfLifeS"],
        requiredGivens: [
          { name: "xMin", value: c.xMin, source: "either" },
          { name: "x1", value: c.x1, source: "either" },
          { name: "y1", value: c.y1, source: "either" },
          { name: "x2", value: c.x2, source: "either" },
          { name: "y2", value: c.y2, source: "either" },
        ],
        questionPlan: {
          targetSummary:
            "Extract power law exponent or exponential decay parameters from a linearized logarithmic graph with a false origin",
        },
        stem,
        options: buildNumOptions(truth, unit, distractors, seed),
        targetMode: "quantitative",
        targetQuantityKey: targetKey,
        workedSolution: isPower
          ? `Gradient $n = (${c.y2} - ${c.y1}) / (${c.x2} - ${c.x1}) = ${f3(numQ(q, "exponentN"))}$. Because the horizontal axis has a false origin, substitute $(${c.x1}, ${c.y1})$ into $\\lg y = n \\lg x + \\lg k$: $\\lg k = ${f3(numQ(q, "lgK"))}$, giving $k = 10^{\\lg k} = ${f3(numQ(q, "coeffK"))}$.`
          : `Gradient $-\\lambda = (${c.y2} - ${c.y1}) / (${c.x2} - ${c.x1}) = -${f3(numQ(q, "decayConst"), "s⁻¹")}$. Substituting $(${c.x1}, ${c.y1})$ gives $\\ln A = ${f3(numQ(q, "lnA"))}$, so $A = e^{\\ln A} = ${f3(numQ(q, "initialA"))}$.`,
        markScheme: [
          {
            code: "A1",
            criterion: `Correctly evaluates ${targetKey} $= ${f3(truth, unit)}$ without falling for the false-origin intercept trap.`,
            marks: 1,
          },
        ],
        totalMarks: 1,
        generatorModel: model,
      });
    });

    // 4 Qualitative MCQs on log-linearization & false origin rules
    const logQuals = [
      {
        slug: "log-qual-power-form",
        idx: 0,
        stem: "To test the empirical relation $T = k L^n$, a student plots $\\lg(T / \\mathrm{ms})$ on the vertical axis against $\\lg(L / \\mathrm{cm})$ on the horizontal axis with a false origin at $\\lg(L / \\mathrm{cm}) = 0.60$. Which statement follows AQA Paper 3A mark-scheme conventions?",
        correct:
          "Taking base ten logarithms gives lg y equals n lg x plus lg k and a false origin requires substituting a point on the line to find the intercept.",
        distractors: [
          {
            text: "Write lg y = lg k + lg(xⁿ) and read lg k directly where the line crosses the vertical axis at x = 0.60.",
            rationale: "Fails to bring exponent n in front of lg x and commits the classic false-origin intercept error.",
          },
          {
            text: "The vertical intercept equals k directly and does not require taking an antilogarithm.",
            rationale: "The vertical intercept at x = 0 equals lg k, so k = 10^c.",
          },
          {
            text: "Logarithm columns carry units of lg s and lg m because the log function preserves units.",
            rationale: "Logarithms are dimensionless; table headers must divide by the unit, written lg(T / ms).",
          },
        ] as const,
      },
      {
        slug: "log-qual-exp-form",
        idx: 2,
        stem: "When testing exponential decay $\\Delta\\theta = A e^{-\\lambda t}$ using a semi-log plot whose horizontal axis begins at $t = 20$ s, how must a candidate determine $\\lambda$ and $A$?",
        correct:
          "Taking natural logarithms gives ln y equals ln A minus lambda t and the false origin requires substituting a point on the line rather than reading the vertical axis crossing.",
        distractors: [
          {
            text: "Read the vertical axis crossing at t = 20 s to get A directly without using the exponential function.",
            rationale: "Commits both the false-origin error and forgets to invert ln A via exp.",
          },
          {
            text: "Use base-10 logarithms lg(Δθ / °C) against t so that the gradient equals −λ directly.",
            rationale: "A base-10 log plot has gradient −λ / ln 10, not −λ.",
          },
          {
            text: "Plot ln(Δθ) against ln(t) so the gradient equals −λ.",
            rationale: "Exponential decay linearizes on a semi-log plot (ln y vs t), not a log-log plot.",
          },
        ] as const,
      },
      {
        slug: "log-qual-false-origin-trap",
        idx: 1,
        stem: "A student obtains the correct gradient $n$ from a log-log plot of drag force against speed, yet gets an order-of-magnitude error when calculating constant $k$. Inspecting the graph reveals the horizontal axis starts at 0.40 rather than 0.00. What is the exact cause and fix?",
        correct:
          "Taking base ten logarithms gives lg y equals n lg x plus lg k and a false origin requires substituting a point on the line to find the intercept at zero.",
        distractors: [
          {
            text: "The student should divide the vertical axis crossing by 0.40 to remove the false origin.",
            rationale: "Linear extrapolation requires c = y₁ − m x₁, not dividing by x_min.",
          },
          {
            text: "Any graph with a false origin cannot yield k unless all data are replotted from zero.",
            rationale: "Algebraic substitution c = y₁ − m x₁ using a point on the best-fit line extracts lg k accurately.",
          },
          {
            text: "A false origin also changes the gradient n, so n must be multiplied by 0.40.",
            rationale: "Shifting the origin does not affect the gradient Δy / Δx.",
          },
        ] as const,
      },
      {
        slug: "log-qual-units-ln",
        idx: 3,
        stem: "Why does an AQA Paper 3A mark scheme require column headings such as $\\ln(x / \\mathrm{mm})$ and reject writing $\\ln(x)$ in mm on a semi-log damping graph?",
        correct:
          "The argument of a logarithm must be a dimensionless ratio; taking natural logarithms gives ln y equals ln A minus lambda t and the false origin requires substituting a point on the line rather than reading the vertical axis crossing.",
        distractors: [
          {
            text: "Because natural logarithms automatically convert millimetres into metres.",
            rationale: "Dividing by mm simply makes the numerical value dimensionless in millimetres; ln A then reflects A in mm.",
          },
          {
            text: "Because natural logarithms can only be taken for quantities smaller than one.",
            rationale: "Natural logarithms are defined for any positive dimensionless ratio.",
          },
          {
            text: "Because dividing by mm cancels the decay constant λ out of the gradient.",
            rationale: "Changing the unit of x shifts ln A vertically by an additive constant without changing the gradient −λ.",
          },
        ] as const,
      },
    ];

    logQuals.forEach((b, i) => {
      const c = logCases[b.idx];
      const spec: Record<string, unknown> = {
        kind: "al-prac-log-linearization",
        lawType: c.lawType,
        xMin: c.xMin,
        x1: c.x1,
        y1: c.y1,
        x2: c.x2,
        y2: c.y2,
        xAxisTitle: c.xAxisTitle,
        yAxisTitle: c.yAxisTitle,
      };
      const seed = nextSeed();
      out.push({
        id: makeId(`${b.slug}-${i + 1}`),
        conceptId: "log-linearization-false-origin",
        templateArchetype:
          c.lawType === "power-lg"
            ? "al-prac-log-linearization-power"
            : "al-prac-log-linearization-exp",
        seed,
        syllabi: TAG_3_1_Y13,
        format: "mcq",
        questionStyle: "qualitative",
        difficulty: "standard",
        domain: "graphs",
        scenarioSpec: spec,
        hiddenQuantities: ["linearFormAnchor"],
        requiredGivens: [],
        questionPlan: {
          targetSummary:
            "Assess conceptual mastery of log linearization algebra, dimensionless log headers, and false origin intercept extraction",
        },
        stem: b.stem,
        options: buildVerbalOptions(b.correct, b.distractors, seed),
        targetMode: "qualitative",
        targetQuantityKey: "linearFormAnchor",
        workedSolution: `Paper 3A logarithmic linearization principle: ${b.correct}`,
        markScheme: [{ code: "A1", criterion: b.correct, marks: 1 }],
        totalMarks: 1,
        generatorModel: model,
      });
    });

    // 4 Paper 3A Structured 8m Log-Linearization Ladders
    logCases.forEach((c, i) => {
      const spec: Record<string, unknown> = {
        kind: "al-prac-log-linearization",
        lawType: c.lawType,
        xMin: c.xMin,
        x1: c.x1,
        y1: c.y1,
        x2: c.x2,
        y2: c.y2,
        xAxisTitle: c.xAxisTitle,
        yAxisTitle: c.yAxisTitle,
      };
      const q = solveKind("al-prac-log-linearization", spec);
      const isPower = c.lawType === "power-lg";
      const anchor = strQ(q, "linearFormAnchor");
      const seed = nextSeed();

      if (isPower) {
        const nVal = numQ(q, "exponentN");
        const lgK = numQ(q, "lgK");
        const kVal = numQ(q, "coeffK");
        out.push({
          id: makeId(`${c.slug}-p3a-8m-${i + 1}`),
          conceptId: "log-linearization-false-origin",
          templateArchetype: "al-prac-log-linearization-power",
          seed,
          syllabi: TAG_3_1_Y13,
          format: "structured",
          questionStyle: "mixed-exam",
          difficulty: "higher",
          domain: "graphs",
          scenarioSpec: spec,
          hiddenQuantities: ["exponentN", "lgK", "coeffK", "linearFormAnchor"],
          requiredGivens: [
            { name: "xMin", value: c.xMin, source: "either" },
            { name: "x1", value: c.x1, source: "either" },
            { name: "y1", value: c.y1, source: "either" },
            { name: "x2", value: c.x2, source: "either" },
            { name: "y2", value: c.y2, source: "either" },
          ],
          questionPlan: {
            targetSummary:
              "Paper three section A log log power law linearization with false origin extraction of exponent and coefficient",
          },
          stem: `A student investigates ${c.eqDesc} while ${c.ctx} and plots ${c.yAxisTitle} against ${c.xAxisTitle} using a false origin at ${c.xMin.toFixed(2)}. Two points on the best-fit straight line are $(${c.x1.toFixed(2)}, ${c.y1.toFixed(2)})$ and $(${c.x2.toFixed(2)}, ${c.y2.toFixed(2)})$.`,
          parts: [
            {
              partId: "a",
              prompt: "Show how taking base-10 logarithms linearizes the equation and explain why the vertical axis crossing at the false origin cannot be read as the intercept.",
              marks: 2,
              targetMode: "qualitative",
              targetQuantityKey: "linearFormAnchor",
              expectedAnswer: anchor,
              workingSteps: [
                "Take lg of both sides: lg y = n lg x + lg k (bringing exponent n out front).",
                "At a false origin x_min > 0, the drawn y-axis is not at x = 0.",
              ],
            },
            {
              partId: "b",
              prompt: "Determine the exponent $n$ from the gradient of the line of best fit.",
              marks: 2,
              targetMode: "quantitative",
              targetQuantityKey: "exponentN",
              expectedAnswer: f3(nVal),
              workingSteps: [
                `$n = (${c.y2.toFixed(2)} - ${c.y1.toFixed(2)}) / (${c.x2.toFixed(2)} - ${c.x1.toFixed(2)}) = ${f3(nVal)}$.`,
              ],
            },
            {
              partId: "c",
              prompt: "Calculate the true vertical intercept $\\lg k$ at $\\lg x = 0$.",
              marks: 2,
              dependsOnPartIds: ["b"],
              targetMode: "quantitative",
              targetQuantityKey: "lgK",
              expectedAnswer: f3(lgK),
              workingSteps: [
                `$\\lg k = y_1 - n x_1 = ${c.y1.toFixed(2)} - (${f3(nVal)})(${c.x1.toFixed(2)}) = ${f3(lgK)}$.`,
              ],
            },
            {
              partId: "d",
              prompt: "Hence evaluate the constant $k$.",
              marks: 2,
              dependsOnPartIds: ["c"],
              targetMode: "quantitative",
              targetQuantityKey: "coeffK",
              expectedAnswer: f3(kVal),
              workingSteps: [
                `$k = 10^{\\lg k} = 10^{${f3(lgK)}} = ${f3(kVal)}$.`,
              ],
            },
          ],
          workedSolution: `(a) ${anchor}. (b) $n = (${c.y2} - ${c.y1}) / (${c.x2} - ${c.x1}) = ${f3(nVal)}$. (c) $\\lg k = ${c.y1} - (${f3(nVal)})(${c.x1}) = ${f3(lgK)}$. (d) $k = 10^{${f3(lgK)}} = ${f3(kVal)}$.`,
          markScheme: [
            { code: "B1", criterion: "Writes $\\lg y = n \\lg x + \\lg k$ (reject $\\lg x^n$ unexpanded).", marks: 1, partId: "a" },
            { code: "B1", criterion: "Explains false origin requires substituting a point $(x_1, y_1)$ on the line.", marks: 1, partId: "a" },
            { code: "M1", criterion: "Computes gradient from wide pair of points on the line.", marks: 1, partId: "b" },
            { code: "A1", criterion: `Exponent $n = ${f3(nVal)}$.`, marks: 1, partId: "b" },
            { code: "M1", criterion: "Substitutes $(x_1, y_1)$ and $n$ into $\\lg k = y_1 - n x_1$.", marks: 1, partId: "c" },
            { code: "A1", criterion: `True intercept $\\lg k = ${f3(lgK)}$.`, marks: 1, partId: "c" },
            { code: "M1", criterion: "Evaluates base-10 antilogarithm $k = 10^{\\lg k}$.", marks: 1, partId: "d" },
            { code: "A1", criterion: `Constant $k = ${f3(kVal)}$.`, marks: 1, partId: "d" },
          ],
          totalMarks: 8,
          generatorModel: model,
        });
      } else {
        const lam = numQ(q, "decayConst");
        const initA = numQ(q, "initialA");
        const tHalf = numQ(q, "halfLifeS");
        out.push({
          id: makeId(`${c.slug}-p3a-8m-${i + 1}`),
          conceptId: "log-linearization-false-origin",
          templateArchetype: "al-prac-log-linearization-exp",
          seed,
          syllabi: TAG_3_1_Y13,
          format: "structured",
          questionStyle: "mixed-exam",
          difficulty: "higher",
          domain: "graphs",
          scenarioSpec: spec,
          hiddenQuantities: [
            "decayConst",
            "lnA",
            "initialA",
            "halfLifeS",
            "linearFormAnchor",
          ],
          requiredGivens: [
            { name: "xMin", value: c.xMin, source: "either" },
            { name: "x1", value: c.x1, source: "either" },
            { name: "y1", value: c.y1, source: "either" },
            { name: "x2", value: c.x2, source: "either" },
            { name: "y2", value: c.y2, source: "either" },
          ],
          questionPlan: {
            targetSummary:
              "Paper three section A semi log exponential decay analysis with false origin extraction of decay constant, initial value, and half time",
          },
          stem: `A student investigates ${c.eqDesc} while ${c.ctx} and plots ${c.yAxisTitle} against ${c.xAxisTitle} with a false origin at $t = ${c.xMin}$ s. Two points on the straight best-fit line are $(${c.x1}, ${c.y1.toFixed(2)})$ and $(${c.x2}, ${c.y2.toFixed(2)})$.`,
          parts: [
            {
              partId: "a",
              prompt: "Linearize the decay law using natural logarithms and explain how to determine $\\ln A$ despite the false origin.",
              marks: 2,
              targetMode: "qualitative",
              targetQuantityKey: "linearFormAnchor",
              expectedAnswer: anchor,
              workingSteps: [
                "ln y = ln A − λt has gradient −λ.",
                "Substitute a point on the line to obtain ln A = y₁ + λ t₁.",
              ],
            },
            {
              partId: "b",
              prompt: "Calculate the decay constant $\\lambda$.",
              marks: 2,
              targetMode: "quantitative",
              targetQuantityKey: "decayConst",
              expectedAnswer: f3(lam, "s⁻¹"),
              workingSteps: [
                `$-\\lambda = (${c.y2} - ${c.y1}) / (${c.x2} - ${c.x1})$, so $\\lambda = ${f3(lam, "s⁻¹")}$.`,
              ],
            },
            {
              partId: "c",
              prompt: "Determine the initial value $A$ at $t = 0$.",
              marks: 2,
              dependsOnPartIds: ["b"],
              targetMode: "quantitative",
              targetQuantityKey: "initialA",
              expectedAnswer: f3(initA),
              workingSteps: [
                `$\\ln A = ${c.y1} + (${f3(lam)})(${c.x1}) = ${f3(numQ(q, "lnA"))}$.`,
                `$A = e^{\\ln A} = ${f3(initA)}$.`,
              ],
            },
            {
              partId: "d",
              prompt: "Calculate the time $T_{1/2}$ required for the quantity to halve.",
              marks: 2,
              dependsOnPartIds: ["b"],
              targetMode: "quantitative",
              targetQuantityKey: "halfLifeS",
              expectedAnswer: f3(tHalf, "s"),
              workingSteps: [
                `$T_{1/2} = \\ln 2 / \\lambda = 0.6931 / ${f3(lam)} = ${f3(tHalf, "s")}$.`,
              ],
            },
          ],
          workedSolution: `(a) ${anchor}. (b) $\\lambda = -(${c.y2} - ${c.y1}) / (${c.x2} - ${c.x1}) = ${f3(lam, "s⁻¹")}$. (c) $\\ln A = ${f3(numQ(q, "lnA"))}$, so $A = ${f3(initA)}$. (d) $T_{1/2} = \\ln 2 / \\lambda = ${f3(tHalf, "s")}$.`,
          markScheme: [
            { code: "B1", criterion: "States $\\ln y = \\ln A - \\lambda t$ with gradient $-\\lambda$.", marks: 1, partId: "a" },
            { code: "B1", criterion: "Uses point substitution instead of reading vertical axis at false origin.", marks: 1, partId: "a" },
            { code: "M1", criterion: "Calculates magnitude of negative gradient.", marks: 1, partId: "b" },
            { code: "A1", criterion: `Decay constant $\\lambda = ${f3(lam, "s⁻¹")}$.`, marks: 1, partId: "b" },
            { code: "M1", criterion: "Computes $\\ln A = y_1 + \\lambda t_1$ and applies $e^{\\ln A}$.", marks: 1, partId: "c" },
            { code: "A1", criterion: `Initial value $A = ${f3(initA)}$.`, marks: 1, partId: "c" },
            { code: "M1", criterion: "Applies $T_{1/2} = \\ln 2 / \\lambda$.", marks: 1, partId: "d" },
            { code: "A1", criterion: `Half-time $T_{1/2} = ${f3(tHalf, "s")}$.`, marks: 1, partId: "d" },
          ],
          totalMarks: 8,
          generatorModel: model,
        });
      }
    });
  }

  /* ======================================================================== */
  /*  4. al-prac-rp1-stationary-string (12 items: 4 Q-MCQ, 4 Qual-MCQ, 4 7m)  */
  /* ======================================================================== */
  {
    const rp1Cases = [
      { slug: "rp1-nylon", hangingMassKg: 0.45, stringLengthM: 1.25, linearDensityKgPerM: 0.0011, harmonicN: 1, pctUncMass: 1.2, pctUncLength: 0.4, pctUncFreq: 0.7, mat: "nylon monofilament" },
      { slug: "rp1-steel", hangingMassKg: 0.75, stringLengthM: 1.1, linearDensityKgPerM: 0.0019, harmonicN: 2, pctUncMass: 0.9, pctUncLength: 0.5, pctUncFreq: 0.6, mat: "stainless steel wire" },
      { slug: "rp1-braid", hangingMassKg: 0.55, stringLengthM: 0.95, linearDensityKgPerM: 0.0024, harmonicN: 3, pctUncMass: 1.4, pctUncLength: 0.6, pctUncFreq: 0.8, mat: "braided cotton cord" },
      { slug: "rp1-copper", hangingMassKg: 0.85, stringLengthM: 1.4, linearDensityKgPerM: 0.0016, harmonicN: 1, pctUncMass: 1.1, pctUncLength: 0.3, pctUncFreq: 0.5, mat: "enamelled copper string" },
    ];

    // 4 Quantitative MCQs
    rp1Cases.forEach((c, i) => {
      const spec: Record<string, unknown> = {
        kind: "al-prac-rp1-stationary-string",
        hangingMassKg: c.hangingMassKg,
        stringLengthM: c.stringLengthM,
        linearDensityKgPerM: c.linearDensityKgPerM,
        harmonicN: c.harmonicN,
        pctUncMass: c.pctUncMass,
        pctUncLength: c.pctUncLength,
        pctUncFreq: c.pctUncFreq,
      };
      const q = solveKind("al-prac-rp1-stationary-string", spec);
      const seed = nextSeed();
      const targetKeys = ["waveSpeed", "fundamentalFreqHz", "gradFvsInvL", "pctUncMu"] as const;
      const units = ["m s⁻¹", "Hz", "m s⁻¹", "%"] as const;
      const tKey = targetKeys[i];
      const unit = units[i];
      const truth = numQ(q, tKey);
      const T = numQ(q, "tensionN");
      const v = numQ(q, "waveSpeed");
      const f1 = numQ(q, "fundamentalFreqHz");

      const stems = [
        `In Required Practical 1, a ${c.mat} of mass per unit length $\\mu = ${f3(c.linearDensityKgPerM, "kg m⁻¹")}$ passes over a bridge and bench pulley supporting a hanging mass of ${c.hangingMassKg.toFixed(2)} kg ($g = 9.81$ m s⁻²). What is the transverse wave speed along the string?`,
        `A ${c.mat} of length ${c.stringLengthM.toFixed(2)} m between bridge and pulley has linear density ${f3(c.linearDensityKgPerM, "kg m⁻¹")} under a hanging mass of ${c.hangingMassKg.toFixed(2)} kg ($g = 9.81$ m s⁻²). Calculate its first harmonic (fundamental) frequency.`,
        `While performing Required Practical 1 on a ${c.mat} ($\\mu = ${f3(c.linearDensityKgPerM, "kg m⁻¹")}$, hanging mass ${c.hangingMassKg.toFixed(2)} kg, $g = 9.81$ m s⁻²), a student plots first-harmonic frequency $f_1$ against $1/L$. What is the theoretical gradient of this line?`,
        `A student determines mass per unit length $\\mu = T / (4 f_1^2 L^2)$ of a ${c.mat}. The percentage uncertainties are ${c.pctUncMass}% in hanging mass, ${c.pctUncFreq}% in resonant frequency $f_1$, and ${c.pctUncLength}% in length $L$. What is the total percentage uncertainty in $\\mu$?`,
      ];

      const dists: NumericDistractor[][] = [
        [
          { value: T / c.linearDensityKgPerM, rationale: "Forgets to take the square root in v = √(T/μ)." },
          { value: Math.sqrt(c.hangingMassKg / c.linearDensityKgPerM), rationale: "Uses mass m directly instead of tension T = mg." },
          { value: v / 2, rationale: "Confuses wave speed v with the f₁ vs 1/L gradient v/2." },
        ],
        [
          { value: v / c.stringLengthM, rationale: "Uses λ = L instead of λ = 2L for the first harmonic." },
          { value: f1 * 2, rationale: "Calculates the second harmonic instead of the first harmonic." },
          { value: Math.sqrt(c.hangingMassKg / c.linearDensityKgPerM) / (2 * c.stringLengthM), rationale: "Omits g = 9.81 m s⁻² when calculating tension." },
        ],
        [
          { value: v, rationale: "Equates gradient of f₁ vs 1/L to v rather than v/2." },
          { value: v / 4, rationale: "Divides by 4 instead of 2." },
          { value: T / (2 * c.linearDensityKgPerM), rationale: "Forgets square root on T/μ." },
        ],
        [
          { value: c.pctUncMass + c.pctUncFreq + c.pctUncLength, rationale: "Fails to double the percentage uncertainties of squared terms f₁² and L²." },
          { value: c.pctUncMass + 2 * c.pctUncFreq + c.pctUncLength, rationale: "Doubles %f₁ but forgets to double %L." },
          { value: c.pctUncFreq + c.pctUncLength, rationale: "Calculates only %v instead of %μ." },
        ],
      ];

      out.push({
        id: makeId(`${c.slug}-qmcq-${i + 1}`),
        conceptId: "rp1-stationary-waves-string",
        templateArchetype: "al-prac-rp1-stationary-string",
        seed,
        syllabi: TAG_3_3_1_Y12,
        format: "mcq",
        questionStyle: "experimental",
        difficulty: i < 2 ? "foundation" : "standard",
        domain: "waves",
        scenarioSpec: spec,
        hiddenQuantities: [tKey],
        requiredGivens:
          i === 3
            ? [
                { name: "pctUncMass", value: c.pctUncMass, source: "stem" },
                { name: "pctUncFreq", value: c.pctUncFreq, source: "stem" },
                { name: "pctUncLength", value: c.pctUncLength, source: "stem" },
              ]
            : [
                { name: "hangingMassKg", value: c.hangingMassKg, unit: "kg", source: "either" },
                { name: "linearDensityKgPerM", value: c.linearDensityKgPerM, source: "stem" },
              ],
        questionPlan: {
          targetSummary:
            "Calculate standing wave speed, fundamental frequency, graph gradient, or linear density uncertainty in required practical one",
        },
        stem: stems[i],
        options: buildNumOptions(truth, unit, dists[i], seed),
        targetMode: "quantitative",
        targetQuantityKey: tKey,
        workedSolution: `With $T = mg = ${c.hangingMassKg} \\times 9.81 = ${f3(T, "N")}$, wave speed $v = \\sqrt{T/\\mu} = ${f3(v, "m s⁻¹")}$, $f_1 = v/(2L) = ${f3(f1, "Hz")}$, gradient $= v/2 = ${f3(v / 2, "m s⁻¹")}$, and $\\%\\Delta \\mu = ${c.pctUncMass} + 2(${c.pctUncFreq}) + 2(${c.pctUncLength}) = ${f3(numQ(q, "pctUncMu"), "%")}$. Answer: ${f3(truth, unit)}.`,
        markScheme: [
          { code: "A1", criterion: `Correctly evaluates ${tKey} $= ${f3(truth, unit)}$.`, marks: 1 },
        ],
        totalMarks: 1,
        generatorModel: model,
      });
    });

    // 4 Qualitative MCQs for RP1
    const rp1Quals = [
      {
        slug: "rp1-qual-length-nodes",
        idx: 0,
        stem: "In Required Practical 1, why must the student measure length $L$ between the wooden bridge and the top of the bench pulley rather than the full length of string from the vibration generator to the hanging mass?",
        correct:
          "Measure the vibrating length between the wooden bridge and pulley nodes because the first harmonic frequency equals wave speed divided by twice that length.",
        distractors: [
          {
            text: "Because the vibration generator produces an antinode at the pulley and doubles the wave speed.",
            rationale: "Both the wooden bridge and the pulley contact point act as fixed nodes.",
          },
          {
            text: "Because the hanging section of string vibrates at twice the fundamental frequency of the horizontal section.",
            rationale: "Only the taut section bounded by the bridge and pulley forms the measured stationary wave.",
          },
          {
            text: "Because tension is zero between the vibration generator and the wooden bridge.",
            rationale: "Tension is nearly uniform along the string; the bridge simply establishes a clean fixed node.",
          },
        ] as const,
      },
      {
        slug: "rp1-qual-tension-graph",
        idx: 1,
        stem: "A student keeps the vibrating length $L$ fixed in Required Practical 1 and varies the hanging mass $m$ to obtain the first harmonic each time. Which graph gives a straight line through the origin and why?",
        correct:
          "Plot f₁² against m (or f₁ against √T), and measure the vibrating length between the wooden bridge and pulley nodes because the first harmonic frequency equals wave speed divided by twice that length.",
        distractors: [
          {
            text: "Plot f₁ directly against m because wave speed is directly proportional to tension.",
            rationale: "Wave speed scales with √T, so f₁ ∝ √m rather than f₁ ∝ m.",
          },
          {
            text: "Plot f₁ against 1/m because heavier masses slow down transverse oscillations.",
            rationale: "Greater tension increases wave speed and raises the resonant frequency.",
          },
          {
            text: "Plot 1/f₁ against √m because frequency decreases as tension increases.",
            rationale: "Frequency increases linearly with √m.",
          },
        ] as const,
      },
      {
        slug: "rp1-qual-harmonic-id",
        idx: 2,
        stem: "While slowly sweeping the signal generator frequency upward in Required Practical 1, three clear antinode loops appear between the bridge and pulley. How does the student verify accurate length and harmonic measurement?",
        correct:
          "Three loops correspond to the third harmonic (f = 3f₁), and the student must measure the vibrating length between the wooden bridge and pulley nodes because the first harmonic frequency equals wave speed divided by twice that length.",
        distractors: [
          {
            text: "Three loops correspond to a wavelength equal to three times the bridge-to-pulley distance.",
            rationale: "Three half-wavelength loops give L = 3λ/2, so λ = 2L/3.",
          },
          {
            text: "The vibrating length should be measured from the first antinode to the final antinode.",
            rationale: "Length L is always measured between the two outer fixed nodes (bridge to pulley).",
          },
          {
            text: "Increasing the signal-generator amplitude shifts the fundamental frequency upward.",
            rationale: "Amplitude does not change the resonant frequency of a linear taut string.",
          },
        ] as const,
      },
      {
        slug: "rp1-qual-safety-pulley",
        idx: 3,
        stem: "Which practical procedure reduces friction bias in tension and ensures sharp node identification during Required Practical 1?",
        correct:
          "Use a low-friction pulley with safety goggles for taut wire snap hazards, and measure the vibrating length between the wooden bridge and pulley nodes because the first harmonic frequency equals wave speed divided by twice that length.",
        distractors: [
          {
            text: "Clamp the pulley wheel fixed so the string cannot slip, eliminating tension uncertainty.",
            rationale: "A seized pulley introduces friction so tension in the horizontal section no longer equals mg.",
          },
          {
            text: "Set the oscillator to maximum power so the string vibrates with very large amplitude.",
            rationale: "Excessive amplitude stretches the string nonlinearly and alters tension during each cycle.",
          },
          {
            text: "Replace the wooden bridge with a soft foam pad so energy is absorbed at the node.",
            rationale: "A rigid sharp bridge edge creates a well-defined node with minimal damping.",
          },
        ] as const,
      },
    ];

    rp1Quals.forEach((b, i) => {
      const c = rp1Cases[b.idx];
      const spec: Record<string, unknown> = {
        kind: "al-prac-rp1-stationary-string",
        hangingMassKg: c.hangingMassKg,
        stringLengthM: c.stringLengthM,
        linearDensityKgPerM: c.linearDensityKgPerM,
        harmonicN: c.harmonicN,
        pctUncMass: c.pctUncMass,
        pctUncLength: c.pctUncLength,
        pctUncFreq: c.pctUncFreq,
      };
      const seed = nextSeed();
      out.push({
        id: makeId(`${b.slug}-${i + 1}`),
        conceptId: "rp1-stationary-waves-string",
        templateArchetype: "al-prac-rp1-stationary-string",
        seed,
        syllabi: TAG_3_3_1_Y12,
        format: "mcq",
        questionStyle: "qualitative",
        difficulty: "standard",
        domain: "waves",
        scenarioSpec: spec,
        hiddenQuantities: ["rp1Anchor"],
        requiredGivens: [],
        questionPlan: {
          targetSummary:
            "Assess conceptual methodology and node identification in required practical one stationary waves",
        },
        stem: b.stem,
        options: buildVerbalOptions(b.correct, b.distractors, seed),
        targetMode: "qualitative",
        targetQuantityKey: "rp1Anchor",
        workedSolution: `RP1 mark-scheme rule: ${b.correct}`,
        markScheme: [{ code: "A1", criterion: b.correct, marks: 1 }],
        totalMarks: 1,
        generatorModel: model,
      });
    });

    // 4 Paper 3A Structured 7m Ladders for RP1
    rp1Cases.forEach((c, i) => {
      const spec: Record<string, unknown> = {
        kind: "al-prac-rp1-stationary-string",
        hangingMassKg: c.hangingMassKg,
        stringLengthM: c.stringLengthM,
        linearDensityKgPerM: c.linearDensityKgPerM,
        harmonicN: c.harmonicN,
        pctUncMass: c.pctUncMass,
        pctUncLength: c.pctUncLength,
        pctUncFreq: c.pctUncFreq,
      };
      const q = solveKind("al-prac-rp1-stationary-string", spec);
      const T = numQ(q, "tensionN");
      const v = numQ(q, "waveSpeed");
      const grad = numQ(q, "gradFvsInvL");
      const pctMu = numQ(q, "pctUncMu");
      const anchor = strQ(q, "rp1Anchor");
      const seed = nextSeed();
      out.push({
        id: makeId(`${c.slug}-p3a-7m-${i + 1}`),
        conceptId: "rp1-stationary-waves-string",
        templateArchetype: "al-prac-rp1-stationary-string",
        seed,
        syllabi: TAG_3_3_1_Y12,
        format: "structured",
        questionStyle: "mixed-exam",
        difficulty: i < 2 ? "standard" : "higher",
        domain: "waves",
        scenarioSpec: spec,
        hiddenQuantities: ["waveSpeed", "linearDensityMu", "pctUncMu", "rp1Anchor"],
        requiredGivens: [
          { name: "hangingMassKg", value: c.hangingMassKg, unit: "kg", source: "either" },
          { name: "gradFvsInvL", value: grad, source: "stem" },
          { name: "pctUncMass", value: c.pctUncMass, source: "stem" },
          { name: "pctUncFreq", value: c.pctUncFreq, source: "stem" },
          { name: "pctUncLength", value: c.pctUncLength, source: "stem" },
        ],
        questionPlan: {
          targetSummary:
            "Paper three section A required practical one structured determination of wave speed, mass per unit length, uncertainty, and node technique",
        },
        stem: `In Required Practical 1, a ${c.mat} is held under constant tension by a hanging mass of ${c.hangingMassKg.toFixed(2)} kg ($g = 9.81$ m s⁻²). The student varies the vibrating length $L$ and plots first-harmonic frequency $f_1$ against $1/L$, obtaining a straight line through the origin of gradient ${f3(grad, "m s⁻¹")}. Percentage uncertainties in mass, frequency, and length are ${c.pctUncMass}%, ${c.pctUncFreq}%, and ${c.pctUncLength}% respectively.`,
        parts: [
          {
            partId: "a",
            prompt: "Use the gradient of the $f_1$ against $1/L$ graph to determine the wave speed $v$ on the string.",
            marks: 1,
            targetMode: "quantitative",
            targetQuantityKey: "waveSpeed",
            expectedAnswer: f3(v, "m s⁻¹"),
            workingSteps: [`Gradient $= v/2$, so $v = 2 \\times ${f3(grad)} = ${f3(v, "m s⁻¹")}$.`],
          },
          {
            partId: "b",
            prompt: "Calculate the mass per unit length $\\mu$ of the string.",
            marks: 2,
            dependsOnPartIds: ["a"],
            targetMode: "quantitative",
            targetQuantityKey: "linearDensityMu",
            expectedAnswer: f3(c.linearDensityKgPerM, "kg m⁻¹"),
            workingSteps: [
              `$T = mg = ${c.hangingMassKg} \\times 9.81 = ${f3(T, "N")}$.`,
              `$\\mu = T / v^2 = ${f3(T)} / (${f3(v)})^2 = ${f3(c.linearDensityKgPerM, "kg m⁻¹")}$.`,
            ],
          },
          {
            partId: "c",
            prompt: "Calculate the percentage uncertainty in $\\mu$ from the stated measurement uncertainties.",
            marks: 2,
            targetMode: "quantitative",
            targetQuantityKey: "pctUncMu",
            expectedAnswer: f3(pctMu, "%"),
            workingSteps: [
              `Since $\\mu = mg / (4 f_1^2 L^2)$, $\\%\\Delta \\mu = ${c.pctUncMass} + 2(${c.pctUncFreq}) + 2(${c.pctUncLength}) = ${f3(pctMu, "%")}$.`,
            ],
          },
          {
            partId: "d",
            prompt: "Explain clearly between which two points $L$ must be measured to avoid a systematic error.",
            marks: 2,
            targetMode: "qualitative",
            targetQuantityKey: "rp1Anchor",
            expectedAnswer: anchor,
            workingSteps: [
              "Measure strictly between the fixed nodes at the bridge apex and pulley top.",
              "First harmonic has λ = 2L between those fixed nodes.",
            ],
          },
        ],
        workedSolution: `(a) $v = 2 \\times ${f3(grad)} = ${f3(v, "m s⁻¹")}$. (b) $T = ${f3(T, "N")}$, $\\mu = T/v^2 = ${f3(c.linearDensityKgPerM, "kg m⁻¹")}$. (c) $\\%\\Delta \\mu = ${c.pctUncMass} + 2(${c.pctUncFreq}) + 2(${c.pctUncLength}) = ${f3(pctMu, "%")}$. (d) ${anchor}.`,
        markScheme: [
          { code: "A1", criterion: `Wave speed $v = 2 \\times \\mathrm{gradient} = ${f3(v, "m s⁻¹")}$.`, marks: 1, partId: "a" },
          { code: "M1", criterion: `Calculates $T = mg = ${f3(T, "N")}$ and substitutes into $\\mu = T/v^2$.`, marks: 1, partId: "b" },
          { code: "A1", criterion: `Mass per unit length $\\mu = ${f3(c.linearDensityKgPerM, "kg m⁻¹")}$.`, marks: 1, partId: "b" },
          { code: "M1", criterion: "Doubles percentage uncertainties in both $f_1$ and $L$ before adding $\\%\\Delta m$.", marks: 1, partId: "c" },
          { code: "A1", criterion: `Percentage uncertainty in $\\mu = ${f3(pctMu, "%")}$.`, marks: 1, partId: "c" },
          { code: "B1", criterion: "Measures vibrating length between wooden bridge and top of pulley (fixed nodes).", marks: 1, partId: "d" },
          { code: "B1", criterion: "Links fixed-node span to first-harmonic condition $f_1 = v/(2L)$.", marks: 1, partId: "d" },
        ],
        totalMarks: 7,
        generatorModel: model,
      });
    });
  }

  /* ======================================================================== */
  /*  5. al-prac-rp2-slits-grating (14 items: 4 Q, 4 Qual, 4 8m, 2 6m LoRs)   */
  /* ======================================================================== */
  {
    const dsCases = [
      { slug: "rp2-ds-red", slitSeparationMm: 0.38, screenDistanceM: 2.1, numFringeSpaces: 8, totalSpanMm: 28.4, uncSpanMm: 0.5, uncDistanceM: 0.01, uncSlitMm: 0.01, color: "red diode laser" },
      { slug: "rp2-ds-green", slitSeparationMm: 0.45, screenDistanceM: 2.5, numFringeSpaces: 10, totalSpanMm: 29.6, uncSpanMm: 0.5, uncDistanceM: 0.01, uncSlitMm: 0.01, color: "green Class 2 laser" },
    ];
    const grCases = [
      { slug: "rp2-gr-300", linesPerMm: 300, screenDistanceM: 1.4, orderN: 2, halfSpanM: 0.576, color: "monochromatic red laser" },
      { slug: "rp2-gr-600", linesPerMm: 600, screenDistanceM: 1.6, orderN: 1, halfSpanM: 0.538, color: "green laser pointer" },
    ];

    // 2 Double-slit Q-MCQs (testing n+1 bright fringes = n spaces!)
    dsCases.forEach((c, i) => {
      const spec: Record<string, unknown> = {
        kind: "al-prac-rp2-slits-grating",
        mode: "double-slit",
        slitSeparationMm: c.slitSeparationMm,
        screenDistanceM: c.screenDistanceM,
        numFringeSpaces: c.numFringeSpaces,
        totalSpanMm: c.totalSpanMm,
        uncSpanMm: c.uncSpanMm,
        uncDistanceM: c.uncDistanceM,
        uncSlitMm: c.uncSlitMm,
      };
      const q = solveKind("al-prac-rp2-slits-grating", spec);
      const lamNm = numQ(q, "wavelengthNm");
      const wMm = numQ(q, "fringeSpacingMm");
      const nBright = numQ(q, "numBrightFringes");
      const seed = nextSeed();
      out.push({
        id: makeId(`${c.slug}-qmcq-${i + 1}`),
        conceptId: "rp2-young-double-slit",
        templateArchetype: "al-prac-rp2-double-slit",
        seed,
        syllabi: TAG_3_3_2_Y12,
        format: "mcq",
        questionStyle: "experimental",
        difficulty: "standard",
        domain: "waves",
        scenarioSpec: spec,
        hiddenQuantities: ["wavelengthNm", "wavelengthM", "fringeSpacingMm"],
        requiredGivens: [
          { name: "slitSeparationMm", value: c.slitSeparationMm, unit: "mm", source: "either" },
          { name: "screenDistanceM", value: c.screenDistanceM, unit: "m", source: "either" },
          { name: "totalSpanMm", value: c.totalSpanMm, unit: "mm", source: "either" },
        ],
        questionPlan: {
          targetSummary:
            "Determine laser wavelength from double slit interference fringe span accounting for fringe spaces versus bright fringe count",
        },
        stem: `In Required Practical 2, a ${c.color} illuminates a double slit of separation $s = ${c.slitSeparationMm.toFixed(2)}$ mm located $D = ${c.screenDistanceM.toFixed(2)}$ m from a matte screen. A student measures the centre-to-centre distance across ${nBright} consecutive bright fringes (${c.numFringeSpaces} fringe spaces) as ${c.totalSpanMm.toFixed(1)} mm. Calculate the wavelength of the laser light.`,
        options: buildNumOptions(
          lamNm,
          "nm",
          [
            {
              value: lamNm * (c.numFringeSpaces / nBright),
              rationale: "Divides total span by the number of bright fringes (n+1) instead of n fringe spaces.",
            },
            {
              value: lamNm * 2,
              rationale: "Confuses bright-to-bright spacing with half-fringe spacing.",
            },
            {
              value: ((c.totalSpanMm * 1e-3 * c.screenDistanceM) / (c.numFringeSpaces * c.slitSeparationMm * 1e-3)) * 1e3,
              rationale: "Inverts s and D in the double-slit formula λ = ws/D.",
            },
          ],
          seed,
        ),
        targetMode: "quantitative",
        targetQuantityKey: "wavelengthNm",
        workedSolution: `With ${nBright} bright fringes there are ${c.numFringeSpaces} spaces, so fringe spacing $w = ${c.totalSpanMm} / ${c.numFringeSpaces} = ${f3(wMm, "mm")}$. Using $\\lambda = ws / D = (${f3(wMm)} \\times 10^{-3})(${c.slitSeparationMm} \\times 10^{-3}) / ${c.screenDistanceM} = ${f3(lamNm, "nm")}$.`,
        markScheme: [
          { code: "A1", criterion: `Calculates $w = ${f3(wMm, "mm")}$ and $\\lambda = ${f3(lamNm, "nm")}$.`, marks: 1 },
        ],
        totalMarks: 1,
        generatorModel: model,
      });
    });

    // 2 Grating Q-MCQs
    grCases.forEach((c, i) => {
      const spec: Record<string, unknown> = {
        kind: "al-prac-rp2-slits-grating",
        mode: "grating",
        linesPerMm: c.linesPerMm,
        screenDistanceM: c.screenDistanceM,
        orderN: c.orderN,
        halfSpanM: c.halfSpanM,
      };
      const q = solveKind("al-prac-rp2-slits-grating", spec);
      const lamNm = numQ(q, "wavelengthNm");
      const maxOrd = numQ(q, "maxOrder");
      const full2h = numQ(q, "fullSpan2hM");
      const thetaDeg = numQ(q, "angleThetaDeg");
      const seed = nextSeed();
      const askMax = i === 1;
      const tKey = askMax ? "maxOrder" : "wavelengthNm";

      out.push({
        id: makeId(`${c.slug}-qmcq-${i + 1}`),
        conceptId: "rp2-diffraction-grating",
        templateArchetype: "al-prac-rp2-grating",
        seed,
        syllabi: TAG_3_3_2_Y12,
        format: "mcq",
        questionStyle: "experimental",
        difficulty: "standard",
        domain: "waves",
        scenarioSpec: spec,
        hiddenQuantities: ["wavelengthNm", "wavelengthM", "angleThetaDeg", "maxOrder"],
        requiredGivens: [
          { name: "linesPerMm", value: c.linesPerMm, source: "either" },
          { name: "screenDistanceM", value: c.screenDistanceM, unit: "m", source: "either" },
          { name: "fullSpan2hM", value: full2h, unit: "m", source: "either" },
        ],
        questionPlan: {
          targetSummary:
            "Calculate laser wavelength or maximum observable diffraction order from symmetric grating spot separation",
        },
        stem: askMax
          ? `A ${c.color} hits a diffraction grating ruled at ${c.linesPerMm} lines mm⁻¹ placed perpendicular to the beam $D = ${c.screenDistanceM.toFixed(2)}$ m from a wall. The distance between the two $n = \\pm ${c.orderN}$ maxima is $2h = ${full2h.toFixed(3)}$ m. What is the highest order maximum observable on either side of the central beam?`
          : `In Required Practical 2, a ${c.color} illuminates a diffraction grating of ${c.linesPerMm} lines mm⁻¹ positioned $D = ${c.screenDistanceM.toFixed(2)}$ m from a screen. The symmetric distance between the $n = +${c.orderN}$ and $n = -${c.orderN}$ maxima is $2h = ${full2h.toFixed(3)}$ m. Calculate the laser wavelength.`,
        options: askMax
          ? buildNumOptions(
              maxOrd,
              undefined,
              [
                { value: maxOrd + 1, rationale: "Rounds d/λ upward instead of rounding down to an integer order." },
                { value: Math.max(1, maxOrd - 1), rationale: "Subtracts one from the valid integer floor(d/λ)." },
                { value: maxOrd * 2 + 1, rationale: "Reports total number of bright spots (2n_max + 1) instead of maximum order number." },
              ],
              seed,
              2,
            )
          : buildNumOptions(
              lamNm,
              "nm",
              [
                { value: (1e-3 / c.linesPerMm) * Math.sin(Math.atan(full2h / c.screenDistanceM)) / c.orderN * 1e9, rationale: "Uses full span 2h instead of half-span h in tan θ = h/D." },
                { value: (1e-3 / c.linesPerMm) * (c.halfSpanM / c.screenDistanceM) / c.orderN * 1e9, rationale: "Uses small-angle approximation tan θ ≈ sin θ at a large diffraction angle." },
                { value: lamNm * c.orderN, rationale: "Forgets to divide by order number n in d sin θ = nλ." },
              ],
              seed,
            ),
        targetMode: "quantitative",
        targetQuantityKey: tKey,
        workedSolution: `Grating spacing $d = 10^{-3}/${c.linesPerMm} = ${f3(numQ(q, "gratingSpacingM"), "m")}$. Half-span $h = ${c.halfSpanM}$ m gives $\\theta = \\arctan(${c.halfSpanM}/${c.screenDistanceM}) = ${f3(thetaDeg)}^\\circ$. Thus $\\lambda = d\\sin\\theta / ${c.orderN} = ${f3(lamNm, "nm")}$ and $n_{\\max} = \\lfloor d/\\lambda \\rfloor = ${maxOrd}$.`,
        markScheme: [
          {
            code: "A1",
            criterion: askMax
              ? `Maximum observable order $n_{\\max} = ${maxOrd}$.`
              : `Wavelength $\\lambda = ${f3(lamNm, "nm")}$.`,
            marks: 1,
          },
        ],
        totalMarks: 1,
        generatorModel: model,
      });
    });

    // 4 Qualitative MCQs for RP2
    const rp2Quals = [
      {
        slug: "rp2-qual-laser-safety",
        spec: { kind: "al-prac-rp2-slits-grating", mode: "double-slit", slitSeparationMm: 0.38, screenDistanceM: 2.1, numFringeSpaces: 8, totalSpanMm: 28.4, uncSpanMm: 0.5, uncDistanceM: 0.01, uncSlitMm: 0.01 },
        archetype: "al-prac-rp2-double-slit",
        conceptId: "rp2-young-double-slit",
        stem: "Which combination of safety precaution and measurement strategy meets AQA Paper 3A mark-scheme standards for the laser double-slit investigation (RP2)?",
        correct:
          "Avoid looking directly into the laser beam remove reflective surfaces and measure across many fringe spaces to reduce percentage uncertainty.",
        distractors: [
          {
            text: "Wear dark sunglasses to attenuate the beam and measure the width of a single bright fringe with a metre ruler.",
            rationale: "AQA mark schemes explicitly reject sunglasses for laser safety, and measuring 1 fringe gives huge percentage uncertainty.",
          },
          {
            text: "Place the screen very close to the slits so fringes are bright and divide the span of ten bright fringes by ten.",
            rationale: "Small D shrinks fringe spacing w (raising % uncertainty), and ten bright fringes span nine spaces.",
          },
          {
            text: "Use a high-power Class 4 laser in a brightly lit room so the fringes are visible without darkened shutters.",
            rationale: "Class 4 lasers cause instant eye burns; use a low-power Class 2 laser in a dimly lit room.",
          },
        ] as const,
      },
      {
        slug: "rp2-qual-n-plus-1",
        spec: { kind: "al-prac-rp2-slits-grating", mode: "double-slit", slitSeparationMm: 0.45, screenDistanceM: 2.5, numFringeSpaces: 10, totalSpanMm: 29.6, uncSpanMm: 0.5, uncDistanceM: 0.01, uncSlitMm: 0.01 },
        archetype: "al-prac-rp2-double-slit",
        conceptId: "rp2-young-double-slit",
        stem: "Why does a student measure the distance from the centre of the first bright fringe to the centre of the eleventh bright fringe rather than measuring one single fringe spacing?",
        correct:
          "Dividing the span of ten fringe spaces by ten cuts percentage uncertainty tenfold; alongside this, avoid looking directly into the laser beam remove reflective surfaces and measure across many fringe spaces to reduce percentage uncertainty.",
        distractors: [
          {
            text: "Eleven bright fringes span eleven fringe spaces, eliminating all systematic error in slit separation s.",
            rationale: "Eleven bright fringes span ten spaces (not eleven), and averaging fringes does not fix systematic error in s.",
          },
          {
            text: "Fringe spacing increases rapidly at outer fringes so measuring across ten spaces is required for linearity.",
            rationale: "For small angles in Young's double slit, fringe spacing w = λD/s is uniform across the central pattern.",
          },
          {
            text: "Measuring edge-to-edge of a single bright fringe has lower uncertainty than centre-to-centre across ten spaces.",
            rationale: "Single-fringe edges are diffuse and give much higher percentage uncertainty.",
          },
        ] as const,
      },
      {
        slug: "rp2-qual-grating-2theta",
        spec: { kind: "al-prac-rp2-slits-grating", mode: "grating", linesPerMm: 300, screenDistanceM: 1.4, orderN: 2, halfSpanM: 0.576 },
        archetype: "al-prac-rp2-grating",
        conceptId: "rp2-diffraction-grating",
        stem: "In the diffraction grating part of Required Practical 2, why is the grating checked with a set square and why is distance measured symmetrically between the $+n$ and $-n$ maxima?",
        correct:
          "Align the grating perpendicular to the beam with a set square measure the symmetric span between matching orders and never look directly into the laser.",
        distractors: [
          {
            text: "Measuring from the +n spot to the −n spot doubles sin θ directly so no trigonometry is required.",
            rationale: "You must halve the symmetric span (h = 2h/2) before applying tan θ = h/D and sin θ.",
          },
          {
            text: "Tilting the grating slightly improves fringe sharpness and cancels any error in grating ruling N.",
            rationale: "Any tilt breaks symmetry between +n and −n orders and invalidates d sin θ = nλ.",
          },
          {
            text: "A diffraction grating produces wider, dimmer fringes than a double slit, making angles harder to resolve.",
            rationale: "A grating produces much sharper, brighter, and more widely separated maxima than a double slit.",
          },
        ] as const,
      },
      {
        slug: "rp2-qual-grating-vs-slit",
        spec: { kind: "al-prac-rp2-slits-grating", mode: "grating", linesPerMm: 600, screenDistanceM: 1.6, orderN: 1, halfSpanM: 0.538 },
        archetype: "al-prac-rp2-grating",
        conceptId: "rp2-diffraction-grating",
        stem: "Why does a diffraction grating generally give a more precise wavelength measurement than Young's double slits in RP2?",
        correct:
          "Maxima are sharper and separated by larger angles; still, align the grating perpendicular to the beam with a set square measure the symmetric span between matching orders and never look directly into the laser.",
        distractors: [
          {
            text: "Because a diffraction grating allows the small-angle approximation w = λD/d to hold exactly up to 90°.",
            rationale: "Large diffraction angles require exact tan θ = h/D and d sin θ = nλ; the small-angle formula fails.",
          },
          {
            text: "Because a diffraction grating eliminates the need to measure grating-to-screen distance D.",
            rationale: "Distance D is still required to find tan θ = h/D unless using a spectrometer vernier scale.",
          },
          {
            text: "Because a grating eliminates laser eye hazards by dispersing energy harmlessly.",
            rationale: "The zero-order and diffracted laser beams remain hazardous; never look into any beam.",
          },
        ] as const,
      },
    ];

    rp2Quals.forEach((b, i) => {
      const seed = nextSeed();
      out.push({
        id: makeId(`${b.slug}-${i + 1}`),
        conceptId: b.conceptId,
        templateArchetype: b.archetype,
        seed,
        syllabi: TAG_3_3_2_Y12,
        format: "mcq",
        questionStyle: "qualitative",
        difficulty: "standard",
        domain: "waves",
        scenarioSpec: b.spec,
        hiddenQuantities: ["rp2SafetyAnchor"],
        requiredGivens: [],
        questionPlan: {
          targetSummary:
            "Assess laser safety, fringe space counting, and diffraction grating alignment precautions in required practical two",
        },
        stem: b.stem,
        options: buildVerbalOptions(b.correct, b.distractors, seed),
        targetMode: "qualitative",
        targetQuantityKey: "rp2SafetyAnchor",
        workedSolution: `RP2 mark-scheme precision: ${b.correct}`,
        markScheme: [{ code: "A1", criterion: b.correct, marks: 1 }],
        totalMarks: 1,
        generatorModel: model,
      });
    });

    // 4 Paper 3A Structured 8m Ladders (2 double-slit, 2 grating)
    dsCases.forEach((c, i) => {
      const spec: Record<string, unknown> = {
        kind: "al-prac-rp2-slits-grating",
        mode: "double-slit",
        slitSeparationMm: c.slitSeparationMm,
        screenDistanceM: c.screenDistanceM,
        numFringeSpaces: c.numFringeSpaces,
        totalSpanMm: c.totalSpanMm,
        uncSpanMm: c.uncSpanMm,
        uncDistanceM: c.uncDistanceM,
        uncSlitMm: c.uncSlitMm,
      };
      const q = solveKind("al-prac-rp2-slits-grating", spec);
      const wMm = numQ(q, "fringeSpacingMm");
      const lamNm = numQ(q, "wavelengthNm");
      const pctLam = numQ(q, "pctUncLambda");
      const nBright = numQ(q, "numBrightFringes");
      const anchor = strQ(q, "rp2SafetyAnchor");
      out.push({
        id: makeId(`${c.slug}-p3a-8m-${i + 1}`),
        conceptId: "rp2-young-double-slit",
        templateArchetype: "al-prac-rp2-double-slit",
        seed: nextSeed(),
        syllabi: TAG_3_3_2_Y12,
        format: "structured",
        questionStyle: "mixed-exam",
        difficulty: "standard",
        domain: "waves",
        scenarioSpec: spec,
        hiddenQuantities: ["fringeSpacingMm", "wavelengthNm", "pctUncLambda", "rp2SafetyAnchor"],
        requiredGivens: [
          { name: "slitSeparationMm", value: c.slitSeparationMm, unit: "mm", source: "either" },
          { name: "screenDistanceM", value: c.screenDistanceM, unit: "m", source: "either" },
          { name: "totalSpanMm", value: c.totalSpanMm, unit: "mm", source: "either" },
          { name: "uncSpanMm", value: c.uncSpanMm, unit: "mm", source: "stem" },
          { name: "uncDistanceM", value: c.uncDistanceM, unit: "m", source: "stem" },
          { name: "uncSlitMm", value: c.uncSlitMm, unit: "mm", source: "stem" },
        ],
        questionPlan: {
          targetSummary:
            "Paper three section A required practical two double slit fringe spacing, wavelength, percentage uncertainty, and safety evaluation",
        },
        stem: `During Required Practical 2, a ${c.color} illuminates a double slit of separation $s = (${c.slitSeparationMm.toFixed(2)} \\pm ${c.uncSlitMm.toFixed(2)})$ mm positioned $D = (${c.screenDistanceM.toFixed(2)} \\pm ${c.uncDistanceM.toFixed(2)})$ m from a screen. The span across ${nBright} consecutive bright fringes is $(${c.totalSpanMm.toFixed(1)} \\pm ${c.uncSpanMm.toFixed(1)})$ mm.`,
        parts: [
          {
            partId: "a",
            prompt: "Calculate the mean fringe spacing $w$ in mm.",
            marks: 2,
            targetMode: "quantitative",
            targetQuantityKey: "fringeSpacingMm",
            expectedAnswer: f3(wMm, "mm"),
            workingSteps: [
              `${nBright} bright fringes correspond to ${c.numFringeSpaces} fringe spaces.`,
              `$w = ${c.totalSpanMm} / ${c.numFringeSpaces} = ${f3(wMm, "mm")}$.`,
            ],
          },
          {
            partId: "b",
            prompt: "Determine the wavelength $\\lambda$ of the laser light in nm.",
            marks: 2,
            dependsOnPartIds: ["a"],
            targetMode: "quantitative",
            targetQuantityKey: "wavelengthNm",
            expectedAnswer: f3(lamNm, "nm"),
            workingSteps: [
              `$\\lambda = ws/D = (${f3(wMm)}\\times 10^{-3})(${c.slitSeparationMm}\\times 10^{-3})/${c.screenDistanceM} = ${f3(lamNm, "nm")}$.`,
            ],
          },
          {
            partId: "c",
            prompt: "Calculate the total percentage uncertainty in $\\lambda$.",
            marks: 2,
            targetMode: "quantitative",
            targetQuantityKey: "pctUncLambda",
            expectedAnswer: f3(pctLam, "%"),
            workingSteps: [
              `$\\%\\Delta\\lambda = (${c.uncSpanMm}/${c.totalSpanMm} + ${c.uncDistanceM}/${c.screenDistanceM} + ${c.uncSlitMm}/${c.slitSeparationMm})\\times 100\\% = ${f3(pctLam, "%")}$.`,
            ],
          },
          {
            partId: "d",
            prompt: "State two valid laser safety precautions and explain why measuring across many fringes improves precision.",
            marks: 2,
            targetMode: "qualitative",
            targetQuantityKey: "rp2SafetyAnchor",
            expectedAnswer: anchor,
            workingSteps: [
              "Never look into the direct or reflected beam; remove reflective jewellery/surfaces; display warning sign.",
              "Fixed ruler uncertainty is divided across a larger total span, cutting percentage uncertainty.",
            ],
          },
        ],
        workedSolution: `(a) $w = ${c.totalSpanMm}/${c.numFringeSpaces} = ${f3(wMm, "mm")}$. (b) $\\lambda = ws/D = ${f3(lamNm, "nm")}$. (c) $\\%\\Delta\\lambda = ${f3(pctLam, "%")}$. (d) ${anchor}.`,
        markScheme: [
          { code: "M1", criterion: `Uses ${c.numFringeSpaces} fringe spaces (not ${nBright}).`, marks: 1, partId: "a" },
          { code: "A1", criterion: `Fringe spacing $w = ${f3(wMm, "mm")}$.`, marks: 1, partId: "a" },
          { code: "M1", criterion: "Converts mm to m and substitutes into $\\lambda = ws/D$.", marks: 1, partId: "b" },
          { code: "A1", criterion: `Laser wavelength $\\lambda = ${f3(lamNm, "nm")}$.`, marks: 1, partId: "b" },
          { code: "M1", criterion: "Sums percentage uncertainties of span, $D$, and $s$.", marks: 1, partId: "c" },
          { code: "A1", criterion: `Total percentage uncertainty $= ${f3(pctLam, "%")}$.`, marks: 1, partId: "c" },
          { code: "B1", criterion: "Avoid eye exposure / remove reflective objects / display warning sign (reject sunglasses).", marks: 1, partId: "d" },
          { code: "B1", criterion: "Measuring across many fringe spaces lowers fractional/percentage uncertainty.", marks: 1, partId: "d" },
        ],
        totalMarks: 8,
        generatorModel: model,
      });
    });

    grCases.forEach((c, i) => {
      const spec: Record<string, unknown> = {
        kind: "al-prac-rp2-slits-grating",
        mode: "grating",
        linesPerMm: c.linesPerMm,
        screenDistanceM: c.screenDistanceM,
        orderN: c.orderN,
        halfSpanM: c.halfSpanM,
      };
      const q = solveKind("al-prac-rp2-slits-grating", spec);
      const thetaDeg = numQ(q, "angleThetaDeg");
      const lamNm = numQ(q, "wavelengthNm");
      const maxOrd = numQ(q, "maxOrder");
      const full2h = numQ(q, "fullSpan2hM");
      const anchor = strQ(q, "rp2SafetyAnchor");
      out.push({
        id: makeId(`${c.slug}-p3a-8m-${i + 3}`),
        conceptId: "rp2-diffraction-grating",
        templateArchetype: "al-prac-rp2-grating",
        seed: nextSeed(),
        syllabi: TAG_3_3_2_Y12,
        format: "structured",
        questionStyle: "mixed-exam",
        difficulty: "higher",
        domain: "waves",
        scenarioSpec: spec,
        hiddenQuantities: ["angleThetaDeg", "wavelengthNm", "maxOrder", "rp2SafetyAnchor"],
        requiredGivens: [
          { name: "linesPerMm", value: c.linesPerMm, source: "either" },
          { name: "screenDistanceM", value: c.screenDistanceM, unit: "m", source: "either" },
          { name: "fullSpan2hM", value: full2h, unit: "m", source: "either" },
        ],
        questionPlan: {
          targetSummary:
            "Paper three section A required practical two diffraction grating angle, wavelength, maximum order, and normal alignment analysis",
        },
        stem: `A ${c.color} strikes a diffraction grating (${c.linesPerMm} lines mm⁻¹) placed $D = ${c.screenDistanceM.toFixed(2)}$ m from a flat screen. The symmetric separation between the $n = +${c.orderN}$ and $n = -${c.orderN}$ bright spots is $2h = ${full2h.toFixed(3)}$ m.`,
        parts: [
          {
            partId: "a",
            prompt: `Calculate the diffraction angle $\\theta$ for the $n = ${c.orderN}$ order maximum.`,
            marks: 2,
            targetMode: "quantitative",
            targetQuantityKey: "angleThetaDeg",
            expectedAnswer: `${f3(thetaDeg)}°`,
            workingSteps: [
              `$h = ${full2h.toFixed(3)} / 2 = ${c.halfSpanM.toFixed(3)}$ m.`,
              `$\\theta = \\arctan(${c.halfSpanM.toFixed(3)} / ${c.screenDistanceM.toFixed(2)}) = ${f3(thetaDeg)}^\\circ$.`,
            ],
          },
          {
            partId: "b",
            prompt: "Determine the wavelength $\\lambda$ of the laser in nm.",
            marks: 2,
            dependsOnPartIds: ["a"],
            targetMode: "quantitative",
            targetQuantityKey: "wavelengthNm",
            expectedAnswer: f3(lamNm, "nm"),
            workingSteps: [
              `$d = 10^{-3} / ${c.linesPerMm} = ${f3(numQ(q, "gratingSpacingM"), "m")}$.`,
              `$\\lambda = d\\sin\\theta / ${c.orderN} = ${f3(lamNm, "nm")}$.`,
            ],
          },
          {
            partId: "c",
            prompt: "Calculate the maximum diffraction order $n_{\\max}$ observable on either side of the central maximum.",
            marks: 2,
            dependsOnPartIds: ["b"],
            targetMode: "quantitative",
            targetQuantityKey: "maxOrder",
            expectedAnswer: String(maxOrd),
            workingSteps: [
              `$n_{\\max} = \\lfloor d / \\lambda \\rfloor = \\lfloor ${f3(numQ(q, "gratingSpacingM") / numQ(q, "wavelengthM"))} \\rfloor = ${maxOrd}$.`,
            ],
          },
          {
            partId: "d",
            prompt: "Explain how the student verifies normal incidence of the grating and why measuring $2h$ is superior to measuring $h$ alone.",
            marks: 2,
            targetMode: "qualitative",
            targetQuantityKey: "rp2SafetyAnchor",
            expectedAnswer: anchor,
            workingSteps: [
              "Check 90° alignment with a set square against bench/screen and verify equal +n and −n distances.",
              "Measuring 2h halves percentage uncertainty and averages out small zero-order alignment offsets.",
            ],
          },
        ],
        workedSolution: `(a) $\\theta = \\arctan(${c.halfSpanM}/${c.screenDistanceM}) = ${f3(thetaDeg)}^\\circ$. (b) $\\lambda = d\\sin\\theta/${c.orderN} = ${f3(lamNm, "nm")}$. (c) $n_{\\max} = \\lfloor d/\\lambda \\rfloor = ${maxOrd}$. (d) ${anchor}.`,
        markScheme: [
          { code: "M1", criterion: "Halves 2h to obtain h and applies $\\tan\\theta = h/D$.", marks: 1, partId: "a" },
          { code: "A1", criterion: `Diffraction angle $\\theta = ${f3(thetaDeg)}^\\circ$.`, marks: 1, partId: "a" },
          { code: "M1", criterion: "Calculates $d = 10^{-3}/N$ and uses $\\lambda = d\\sin\\theta/n$.", marks: 1, partId: "b" },
          { code: "A1", criterion: `Wavelength $\\lambda = ${f3(lamNm, "nm")}$.`, marks: 1, partId: "b" },
          { code: "M1", criterion: "Sets $\\sin\\theta \\le 1$ to evaluate $d/\\lambda$ and rounds down.", marks: 1, partId: "c" },
          { code: "A1", criterion: `Maximum order $n_{\\max} = ${maxOrd}$.`, marks: 1, partId: "c" },
          { code: "B1", criterion: "Aligns grating perpendicular to incident beam using a set square.", marks: 1, partId: "d" },
          { code: "B1", criterion: "Measuring symmetric span 2h reduces % uncertainty and checks symmetry.", marks: 1, partId: "d" },
        ],
        totalMarks: 8,
        generatorModel: model,
      });
    });

    // 2 Authentic 6-Mark Experimental LoRs for RP2 (1 double-slit, 1 grating)
    {
      const dsSpec: Record<string, unknown> = {
        kind: "al-prac-rp2-slits-grating",
        mode: "double-slit",
        slitSeparationMm: 0.4,
        screenDistanceM: 2.4,
        numFringeSpaces: 10,
        totalSpanMm: 38.0,
        uncSpanMm: 0.5,
        uncDistanceM: 0.01,
        uncSlitMm: 0.01,
      };
      const dsAnchor = strQ(solveKind("al-prac-rp2-slits-grating", dsSpec), "rp2SafetyAnchor");
      out.push(
        buildExperimentalLor6m({
          id: makeId("rp2-ds-lor-6m-1"),
          seed: nextSeed(),
          model,
          domain: "waves",
          conceptId: "rp2-young-double-slit",
          templateArchetype: "al-prac-rp2-lor",
          syllabi: TAG_3_3_2_Y12,
          difficulty: "higher",
          scenarioSpec: dsSpec,
          anchorKey: "rp2SafetyAnchor",
          anchorText: dsAnchor,
          requiredGivens: [],
          stem: "A student plans to determine the wavelength of light from a Class 2 diode laser using Young's double slits and a darkened laboratory bench.",
          prompt:
            "Describe a safe, precise experimental procedure to determine the laser wavelength using a graphical method, including apparatus alignment, measurements, safety controls, and how the data are analysed. [6 marks]",
          expectedAnswer: `Mount the laser, double slit, and matte screen rigidly on a bench with the slit parallel to the screen; ${dsAnchor}; vary D across several distances, measure across ten fringe spaces (eleven bright fringes) to find w, and plot w against D so wavelength equals gradient multiplied by slit separation s.`,
          workingSteps: [
            "Level 1: Set up Class 2 laser, double slit, and screen at large D (> 1.5 m) with beam safety controls.",
            "Level 2: Measure distance D with a metre ruler and centre-to-centre span across many fringe spaces (n+1 fringes = n spaces) using Vernier callipers/ruler in darkened room.",
            "Level 3: Repeat for >= 5 values of D, plot w against D (straight line through origin), extract λ = s × gradient, and evaluate precision/alignment with a set square.",
          ],
          workedSolution: `Level 3 Model Response: Secure a low-power Class 2 laser horizontally so the beam is below eye level, display a laser warning sign, remove reflective surfaces, and never look directly into the beam. Position the double slit perpendicular to the beam using a set square and set a matte white screen at least 1.5 m away so fringes are well separated. Measure slit-to-screen distance D with a metre ruler. In a dimly lit room, mark the centres of 11 consecutive bright fringes on taped graph paper and measure the total span of 10 fringe spaces with Vernier callipers to obtain w = span / 10, which cuts percentage uncertainty. Repeat for at least five different distances D. Plot w against D, draw a best-fit straight line through the origin, determine the gradient from a triangle spanning > 50% of the line, and calculate λ = gradient × s.`,
          criteria: [
            "States safe laser handling: Class 2 laser, avoid looking directly into beam, remove reflective surfaces, or warning sign (reject sunglasses).",
            "Aligns double slit and screen perpendicular to the horizontal beam using a set square at a large separation D.",
            "Measures centre-to-centre span across many consecutive bright fringes and divides by n spaces (n + 1 bright fringes = n spaces).",
            "Measures slit-to-screen distance D accurately with a metre ruler and repeats for at least five different values of D.",
            "Plots fringe spacing w against D to obtain a straight line through the origin with a large gradient triangle (> 50%).",
            "Correctly states wavelength λ = gradient × s (using known slit separation s) and explains why large D and multi-fringe spans reduce percentage uncertainty.",
          ],
          targetSummary:
            "Six mark level of response experimental design for required practical two young double slit wavelength determination",
        }),
      );

      const grSpec: Record<string, unknown> = {
        kind: "al-prac-rp2-slits-grating",
        mode: "grating",
        linesPerMm: 300,
        screenDistanceM: 1.5,
        orderN: 2,
        halfSpanM: 0.62,
      };
      const grAnchor = strQ(solveKind("al-prac-rp2-slits-grating", grSpec), "rp2SafetyAnchor");
      out.push(
        buildExperimentalLor6m({
          id: makeId("rp2-gr-lor-6m-2"),
          seed: nextSeed(),
          model,
          domain: "waves",
          conceptId: "rp2-diffraction-grating",
          templateArchetype: "al-prac-rp2-lor",
          syllabi: TAG_3_3_2_Y12,
          difficulty: "higher",
          scenarioSpec: grSpec,
          anchorKey: "rp2SafetyAnchor",
          anchorText: grAnchor,
          requiredGivens: [],
          stem: "A physics student is supplied with a Class 2 laser, a diffraction grating of known ruling N (lines mm⁻¹), a metre ruler, a set square, and a wide flat screen.",
          prompt:
            "Design a complete experimental investigation to determine the wavelength of the laser light accurately from multiple diffraction orders, explaining safety, alignment, measurements, and graphical analysis. [6 marks]",
          expectedAnswer: `Clamp the laser horizontally below eye level with warning signs and no reflective objects; ${grAnchor}; calculate d = 1/N, determine sin θ from tan θ = h/D for each visible order n, and plot sin θ against n so wavelength equals d multiplied by the gradient.`,
          workingSteps: [
            "Level 1: Laser safety controls and normal alignment of grating with a set square.",
            "Level 2: Measure D to screen and symmetric span 2h between +n and −n maxima for every observable order.",
            "Level 3: Compute θ = arctan(h/D), plot sin θ vs n, extract λ = d × gradient using d = 1/N.",
          ],
          workedSolution: `Level 3 Model Response: Mount a Class 2 laser horizontally below eye height, clear reflective items from the bench, post warning signs, and never look directly into the primary or diffracted beams. Use a set square against the bench and screen to ensure the diffraction grating is perpendicular to the incident beam and parallel to the screen. Measure grating-to-screen distance D with a metre ruler (at least 1.0 m). Mark the zero-order spot and symmetric ±1, ±2, ... maxima on the screen. For each order n, measure the full span 2h between +n and −n spots (halving to h reduces percentage uncertainty and checks normal alignment). Compute θ = arctan(h/D) and sin θ for every order (never applying small-angle approximations). Convert ruling N to grating spacing d = 1/N in metres, plot sin θ against order number n, draw a best-fit line through the origin, and determine λ = d × gradient.`,
          criteria: [
            "States authentic Class 2 laser safety precautions (no direct viewing of primary/diffracted beams, remove reflective surfaces, warning notice).",
            "Checks normal incidence of the grating and parallel screen using a set square (and equal left/right spot distances).",
            "Measures grating-to-screen distance D and symmetric full distance 2h between +n and −n spots across multiple orders.",
            "Calculates exact diffraction angle θ = arctan(h/D) using half-span h (explicitly avoiding small-angle sin θ ≈ tan θ).",
            "Converts lines per mm to grating spacing d = 10⁻³ / N in metres.",
            "Plots sin θ against order n (or averages d sin θ / n across orders) and obtains λ = d × gradient.",
          ],
          targetSummary:
            "Six mark level of response experimental design for required practical two diffraction grating wavelength determination",
        }),
      );
    }
  }

  /* ======================================================================== */
  /*  6. al-prac-rp3-freefall-g (12 items: 4 Q-MCQ, 4 Qual-MCQ, 4 8m Struct)  */
  /* ======================================================================== */
  {
    const gateCases = [
      { slug: "rp3-gates-1", grad2hOverTvsT: 9.74, intercept2u: 2.28, pctUncGrad: 2.1 },
      { slug: "rp3-gates-2", grad2hOverTvsT: 9.92, intercept2u: 3.16, pctUncGrad: 1.8 },
    ];
    const trapCases = [
      { slug: "rp3-trap-1", dropHeightM: 1.15, gradHvsT2: 4.76, sysDelayMs: 14 },
      { slug: "rp3-trap-2", dropHeightM: 1.45, gradHvsT2: 4.84, sysDelayMs: 11 },
    ];

    // 4 Quantitative MCQs
    gateCases.forEach((c, i) => {
      const spec: Record<string, unknown> = {
        kind: "al-prac-rp3-freefall-g",
        mode: "two-gates",
        grad2hOverTvsT: c.grad2hOverTvsT,
        intercept2u: c.intercept2u,
        pctUncGrad: c.pctUncGrad,
      };
      const q = solveKind("al-prac-rp3-freefall-g", spec);
      const uVal = numQ(q, "initialSpeedU");
      const pctDiff = numQ(q, "pctDiffG");
      const seed = nextSeed();
      const askDiff = i === 1;
      const tKey = askDiff ? "pctDiffG" : "initialSpeedU";
      const truth = askDiff ? pctDiff : uVal;
      const unit = askDiff ? "%" : "m s⁻¹";
      out.push({
        id: makeId(`${c.slug}-qmcq-${i + 1}`),
        conceptId: "rp3-freefall-g-linearization",
        templateArchetype: "al-prac-rp3-two-gates",
        seed,
        syllabi: TAG_3_4_1_Y12_NCUK,
        format: "mcq",
        questionStyle: "experimental",
        difficulty: "standard",
        domain: "mechanics",
        scenarioSpec: spec,
        hiddenQuantities: [tKey],
        requiredGivens: [
          { name: "grad2hOverTvsT", value: c.grad2hOverTvsT, source: "stem" },
          { name: "intercept2u", value: c.intercept2u, source: "stem" },
        ],
        questionPlan: {
          targetSummary:
            "Extract initial gate speed or percentage difference from standard g using the two light gates free fall linear graph",
        },
        stem: askDiff
          ? `In Required Practical 3 using two light gates, a student plots $2h/t$ against $t$ and finds a straight line of gradient ${c.grad2hOverTvsT.toFixed(2)} m s⁻² and vertical intercept ${c.intercept2u.toFixed(2)} m s⁻¹. Calculate the percentage difference between this measured value of $g$ and the accepted value $9.81$ m s⁻².`
          : `During Required Practical 3, a steel sphere drops through two light gates separated by height $h$. Plotting $2h/t$ against $t$ yields a straight line of gradient ${c.grad2hOverTvsT.toFixed(2)} m s⁻² and vertical intercept ${c.intercept2u.toFixed(2)} m s⁻¹. What was the speed $u$ of the sphere as it passed the upper light gate?`,
        options: buildNumOptions(
          truth,
          unit,
          askDiff
            ? [
                { value: ((c.grad2hOverTvsT - 9.8) / 9.8) * 100, rationale: "Compares against 9.80 instead of A-Level g = 9.81 m s⁻²." },
                { value: Math.abs(c.grad2hOverTvsT - 9.81), rationale: "Reports absolute discrepancy rather than percentage difference." },
                { value: pctDiff * 2, rationale: "Doubles the percentage difference unnecessarily." },
              ]
            : [
                { value: c.intercept2u, rationale: "Equates the vertical intercept of 2h/t vs t to u instead of 2u." },
                { value: c.intercept2u * 2, rationale: "Multiplies the intercept by two instead of dividing by two." },
                { value: c.grad2hOverTvsT / 2, rationale: "Halves the gradient instead of halving the y-intercept." },
              ],
          seed,
        ),
        targetMode: "quantitative",
        targetQuantityKey: tKey,
        workedSolution: `From $h = ut + \\frac{1}{2}gt^2$, rearranging gives $2h/t = gt + 2u$. Thus $g = ${c.grad2hOverTvsT.toFixed(2)}$ m s⁻², $u = ${c.intercept2u.toFixed(2)} / 2 = ${f3(uVal, "m s⁻¹")}$, and percentage difference $= |${c.grad2hOverTvsT} - 9.81|/9.81 \\times 100\\% = ${f3(pctDiff, "%")}$.`,
        markScheme: [
          { code: "A1", criterion: `Correctly evaluates ${tKey} $= ${f3(truth, unit)}$.`, marks: 1 },
        ],
        totalMarks: 1,
        generatorModel: model,
      });
    });

    trapCases.forEach((c, i) => {
      const spec: Record<string, unknown> = {
        kind: "al-prac-rp3-freefall-g",
        mode: "trapdoor",
        dropHeightM: c.dropHeightM,
        gradHvsT2: c.gradHvsT2,
        sysDelayMs: c.sysDelayMs,
      };
      const q = solveKind("al-prac-rp3-freefall-g", spec);
      const gMeas = numQ(q, "gMeasured");
      const gSingle = numQ(q, "gSingleDrop");
      const measT = numQ(q, "measuredTimeS");
      const seed = nextSeed();
      const askDelay = i === 1;
      const tKey = askDelay ? "gSingleDrop" : "gMeasured";
      const truth = askDelay ? gSingle : gMeas;
      out.push({
        id: makeId(`${c.slug}-qmcq-${i + 3}`),
        conceptId: "rp3-freefall-g-trapdoor",
        templateArchetype: "al-prac-rp3-trapdoor",
        seed,
        syllabi: TAG_3_4_1_Y12_NCUK,
        format: "mcq",
        questionStyle: "experimental",
        difficulty: "standard",
        domain: "mechanics",
        scenarioSpec: spec,
        hiddenQuantities: [tKey],
        requiredGivens: askDelay
          ? [
              { name: "dropHeightM", value: c.dropHeightM, unit: "m", source: "stem" },
              { name: "measuredTimeS", value: measT, unit: "s", source: "stem" },
            ]
          : [{ name: "gradHvsT2", value: c.gradHvsT2, source: "stem" }],
        questionPlan: {
          targetSummary:
            "Determine gravitational acceleration from trapdoor h against t squared gradient or single delayed drop time",
        },
        stem: askDelay
          ? `In an electromagnet-and-trapdoor free-fall experiment (RP3), a steel sphere falls from rest through height $h = ${c.dropHeightM.toFixed(2)}$ m. Because residual magnetism delays release by ${c.sysDelayMs} ms, the electronic timer records ${f4(measT, "s")}. What apparent value of $g$ is calculated from $h = \\frac{1}{2}gt^2$?`
          : `A student releases a dense steel ball from an electromagnet to a trapdoor switch (RP3) across several heights and plots $h$ against $t^2$. The best-fit straight line has gradient ${c.gradHvsT2.toFixed(2)} m s⁻². Determine the experimental value of $g$.`,
        options: buildNumOptions(
          truth,
          "m s⁻²",
          askDelay
            ? [
                { value: 9.81, rationale: "Reports true g = 9.81 m s⁻² while ignoring the recorded systematic delay." },
                { value: c.dropHeightM / (measT * measT), rationale: "Omits the factor of 2 in g = 2h/t²." },
                { value: (2 * c.dropHeightM) / measT, rationale: "Forgets to square the fall time t." },
              ]
            : [
                { value: c.gradHvsT2, rationale: "Equates gradient directly to g instead of g/2." },
                { value: c.gradHvsT2 / 2, rationale: "Divides the gradient by two instead of multiplying by two." },
                { value: Math.sqrt(2 * c.gradHvsT2), rationale: "Takes an erroneous square root of 2 × gradient." },
              ],
          seed,
        ),
        targetMode: "quantitative",
        targetQuantityKey: tKey,
        workedSolution: askDelay
          ? `$g_{\\mathrm{apparent}} = 2h / t^2 = 2(${c.dropHeightM}) / (${f4(measT)})^2 = ${f3(gSingle, "m s⁻²")}$, systematically below 9.81 m s⁻² because the timer started before the ball detached.`
          : `Comparing $h = \\frac{1}{2}gt^2$ with $y = mx$, the gradient equals $g/2$, so $g = 2 \\times ${c.gradHvsT2.toFixed(2)} = ${f3(gMeas, "m s⁻²")}$.`,
        markScheme: [
          { code: "A1", criterion: `Calculates $g = ${f3(truth, "m s⁻²")}$.`, marks: 1 },
        ],
        totalMarks: 1,
        generatorModel: model,
      });
    });

    // 4 Qualitative MCQs for RP3
    const rp3Quals = [
      {
        slug: "rp3-qual-plumb-line",
        spec: { kind: "al-prac-rp3-freefall-g", mode: "two-gates", grad2hOverTvsT: 9.74, intercept2u: 2.28, pctUncGrad: 2.1 },
        archetype: "al-prac-rp3-two-gates",
        conceptId: "rp3-freefall-g-linearization",
        stem: "In Required Practical 3 using two light gates, how should the student verify the metre ruler is vertical and why is $2h/t$ plotted against $t$?",
        correct:
          "Use a plumb line to align the metre ruler vertically and plot two h over t against t so the gradient equals gravitational field strength independently of initial speed.",
        distractors: [
          {
            text: "Use a swinging pendulum beside the stand and plot h against t so the gradient equals g.",
            rationale: "AQA mark schemes reject 'pendulum' for plumb line, and h vs t is curved rather than linear.",
          },
          {
            text: "Eyeball the stand vertically and assume the sphere enters Gate 1 with zero velocity.",
            rationale: "Visual estimation leaves tilt error, and the sphere already has speed u > 0 at Gate 1.",
          },
          {
            text: "Plot h/t² against h because it eliminates gravitational acceleration from the vertical intercept.",
            rationale: "h = ut + ½gt² linearizes cleanly as 2h/t = gt + 2u (or h/t = ½gt + u).",
          },
        ] as const,
      },
      {
        slug: "rp3-qual-electromagnet-delay",
        spec: { kind: "al-prac-rp3-freefall-g", mode: "trapdoor", dropHeightM: 1.15, gradHvsT2: 4.76, sysDelayMs: 14 },
        archetype: "al-prac-rp3-trapdoor",
        conceptId: "rp3-freefall-g-trapdoor",
        stem: "A student using an electromagnet and trapdoor consistently obtains $g = 9.42$ m s⁻² across repeated trials with a dense steel sphere. Which systematic error best explains this result?",
        correct:
          "Residual magnetism in the electromagnet delays sphere release making the recorded fall time too large and producing a systematic underestimate of g.",
        distractors: [
          {
            text: "Residual magnetism delays release so recorded fall time is too small, making g too low.",
            rationale: "A release delay after the timer starts makes recorded time t too LARGE, reducing 2h/t².",
          },
          {
            text: "Repeating each drop height five times would completely eliminate residual magnetism.",
            rationale: "Repeats reduce random error only; they never eliminate a systematic release delay.",
          },
          {
            text: "Using a larger electromagnet current removes residual magnetism and increases accuracy.",
            rationale: "Excessive current worsens core magnetisation; minimum holding current or a thin paper spacer reduces sticking.",
          },
        ] as const,
      },
      {
        slug: "rp3-qual-air-resistance",
        spec: { kind: "al-prac-rp3-freefall-g", mode: "trapdoor", dropHeightM: 1.45, gradHvsT2: 4.84, sysDelayMs: 11 },
        archetype: "al-prac-rp3-trapdoor",
        conceptId: "rp3-freefall-g-trapdoor",
        stem: "Why does Required Practical 3 specify a small, dense steel sphere rather than a large hollow plastic ball, and what systematic effect mimics air drag in the electromagnet setup?",
        correct:
          "High weight-to-drag ratio keeps air resistance negligible; alongside air drag, residual magnetism in the electromagnet delays sphere release making the recorded fall time too large and producing a systematic underestimate of g.",
        distractors: [
          {
            text: "A denser sphere falls faster solely because gravitational field strength g increases with mass.",
            rationale: "In vacuum all masses accelerate at g = 9.81 m s⁻²; density merely makes air drag negligible compared to weight.",
          },
          {
            text: "A larger hollow ball reduces drag because its greater surface area stabilises the wake.",
            rationale: "Larger cross-sectional area increases drag while smaller mass lowers weight, increasing deceleration.",
          },
          {
            text: "Air resistance causes an overestimate of g because the sphere takes longer to hit the trapdoor.",
            rationale: "Longer fall time t reduces 2h/t², causing an underestimate of g.",
          },
        ] as const,
      },
      {
        slug: "rp3-qual-two-gate-advantage",
        spec: { kind: "al-prac-rp3-freefall-g", mode: "two-gates", grad2hOverTvsT: 9.92, intercept2u: 3.16, pctUncGrad: 1.8 },
        archetype: "al-prac-rp3-two-gates",
        conceptId: "rp3-freefall-g-linearization",
        stem: "Why is dropping a sphere through two light gates superior to dropping from a hand-held release onto a single trapdoor in RP3?",
        correct:
          "Starting timing electronically at Gate 1 avoids release-delay errors, while students use a plumb line to align the metre ruler vertically and plot two h over t against t so the gradient equals gravitational field strength independently of initial speed.",
        distractors: [
          {
            text: "Two light gates guarantee the sphere's initial speed at Gate 1 is exactly zero.",
            rationale: "The sphere already has speed u > 0 at Gate 1; the 2h/t vs t graph absorbs u into the vertical intercept 2u.",
          },
          {
            text: "Light gates eliminate the need to measure vertical height h between the gates.",
            rationale: "Accurate vertical measurement of h with a clamped metre ruler and plumb line remains essential.",
          },
          {
            text: "Light gates make air resistance zero even for light expanded-polystyrene spheres.",
            rationale: "Electronic timing removes release/reaction errors, not aerodynamic drag.",
          },
        ] as const,
      },
    ];

    rp3Quals.forEach((b, i) => {
      const seed = nextSeed();
      out.push({
        id: makeId(`${b.slug}-${i + 1}`),
        conceptId: b.conceptId,
        templateArchetype: b.archetype,
        seed,
        syllabi: TAG_3_4_1_Y12,
        format: "mcq",
        questionStyle: "qualitative",
        difficulty: "standard",
        domain: "mechanics",
        scenarioSpec: b.spec,
        hiddenQuantities: ["rp3Anchor"],
        requiredGivens: [],
        questionPlan: {
          targetSummary:
            "Assess experimental systematic error analysis and plumb line alignment in required practical three free fall",
        },
        stem: b.stem,
        options: buildVerbalOptions(b.correct, b.distractors, seed),
        targetMode: "qualitative",
        targetQuantityKey: "rp3Anchor",
        workedSolution: `RP3 evaluation: ${b.correct}`,
        markScheme: [{ code: "A1", criterion: b.correct, marks: 1 }],
        totalMarks: 1,
        generatorModel: model,
      });
    });

    // 4 Paper 3A Structured 8m Ladders (2 two-gates, 2 trapdoor)
    gateCases.forEach((c, i) => {
      const spec: Record<string, unknown> = {
        kind: "al-prac-rp3-freefall-g",
        mode: "two-gates",
        grad2hOverTvsT: c.grad2hOverTvsT,
        intercept2u: c.intercept2u,
        pctUncGrad: c.pctUncGrad,
      };
      const q = solveKind("al-prac-rp3-freefall-g", spec);
      const uVal = numQ(q, "initialSpeedU");
      const pctDiff = numQ(q, "pctDiffG");
      const absUncG = numQ(q, "absUncG");
      const anchor = strQ(q, "rp3Anchor");
      out.push({
        id: makeId(`${c.slug}-p3a-8m-${i + 1}`),
        conceptId: "rp3-freefall-g-linearization",
        templateArchetype: "al-prac-rp3-two-gates",
        seed: nextSeed(),
        syllabi: TAG_3_4_1_Y12_NCUK,
        format: "structured",
        questionStyle: "mixed-exam",
        difficulty: "standard",
        domain: "mechanics",
        scenarioSpec: spec,
        hiddenQuantities: ["initialSpeedU", "pctDiffG", "absUncG", "rp3Anchor"],
        requiredGivens: [
          { name: "grad2hOverTvsT", value: c.grad2hOverTvsT, source: "stem" },
          { name: "intercept2u", value: c.intercept2u, source: "stem" },
          { name: "pctUncGrad", value: c.pctUncGrad, source: "stem" },
        ],
        questionPlan: {
          targetSummary:
            "Paper three section A two light gates free fall analysis of initial speed, absolute uncertainty, percentage difference, and plumb line method",
        },
        stem: `In Required Practical 3, a student drops a dense steel sphere through two light gates and plots $2h/t$ against $t$. The best-fit straight line has gradient ${c.grad2hOverTvsT.toFixed(2)} m s⁻² (with percentage uncertainty ${c.pctUncGrad.toFixed(1)}%) and vertical intercept ${c.intercept2u.toFixed(2)} m s⁻¹.`,
        parts: [
          {
            partId: "a",
            prompt: "Determine the speed $u$ of the sphere as it crossed the upper light gate.",
            marks: 2,
            targetMode: "quantitative",
            targetQuantityKey: "initialSpeedU",
            expectedAnswer: f3(uVal, "m s⁻¹"),
            workingSteps: [`$2u = ${c.intercept2u.toFixed(2)}$ m s⁻¹, so $u = ${f3(uVal, "m s⁻¹")}$.`],
          },
          {
            partId: "b",
            prompt: "Calculate the absolute uncertainty in the measured value of $g$.",
            marks: 2,
            targetMode: "quantitative",
            targetQuantityKey: "absUncG",
            expectedAnswer: f3(absUncG, "m s⁻²"),
            workingSteps: [`$\\Delta g = (${c.pctUncGrad}/100) \\times ${c.grad2hOverTvsT} = ${f3(absUncG, "m s⁻²")}$.`],
          },
          {
            partId: "c",
            prompt: "Calculate the percentage difference between the measured $g$ and accepted value $9.81$ m s⁻².",
            marks: 2,
            targetMode: "quantitative",
            targetQuantityKey: "pctDiffG",
            expectedAnswer: f3(pctDiff, "%"),
            workingSteps: [`$\\%\\text{diff} = |${c.grad2hOverTvsT} - 9.81|/9.81 \\times 100\\% = ${f3(pctDiff, "%")}$.`],
          },
          {
            partId: "d",
            prompt: "Explain how the ruler is aligned vertically and why plotting $2h/t$ against $t$ removes error from the unknown release height above Gate 1.",
            marks: 2,
            targetMode: "qualitative",
            targetQuantityKey: "rp3Anchor",
            expectedAnswer: anchor,
            workingSteps: [
              "Align clamped metre ruler against a plumb line (reject bare 'pendulum').",
              "2h/t = gt + 2u separates unknown u into the vertical intercept while gradient stays g.",
            ],
          },
        ],
        workedSolution: `(a) $u = ${c.intercept2u}/2 = ${f3(uVal, "m s⁻¹")}$. (b) $\\Delta g = ${f3(absUncG, "m s⁻²")}$. (c) Percentage difference $= ${f3(pctDiff, "%")}$ (smaller than the ${c.pctUncGrad}% experimental uncertainty, so result is consistent with 9.81 m s⁻²). (d) ${anchor}.`,
        markScheme: [
          { code: "M1", criterion: "Identifies vertical intercept equals $2u$.", marks: 1, partId: "a" },
          { code: "A1", criterion: `Initial speed $u = ${f3(uVal, "m s⁻¹")}$.`, marks: 1, partId: "a" },
          { code: "M1", criterion: "Multiplies measured $g$ by fractional uncertainty.", marks: 1, partId: "b" },
          { code: "A1", criterion: `Absolute uncertainty $\\Delta g = ${f3(absUncG, "m s⁻²")}$.`, marks: 1, partId: "b" },
          { code: "M1", criterion: "Computes $|g_{\\mathrm{meas}} - 9.81|/9.81 \\times 100\\%$.", marks: 1, partId: "c" },
          { code: "A1", criterion: `Percentage difference $= ${f3(pctDiff, "%")}$.`, marks: 1, partId: "c" },
          { code: "B1", criterion: "Uses a plumb line / set square against bench to ensure ruler is strictly vertical.", marks: 1, partId: "d" },
          { code: "B1", criterion: "Shows $2h/t = gt + 2u$ keeps gradient equal to $g$ regardless of initial speed $u$.", marks: 1, partId: "d" },
        ],
        totalMarks: 8,
        generatorModel: model,
      });
    });

    trapCases.forEach((c, i) => {
      const spec: Record<string, unknown> = {
        kind: "al-prac-rp3-freefall-g",
        mode: "trapdoor",
        dropHeightM: c.dropHeightM,
        gradHvsT2: c.gradHvsT2,
        sysDelayMs: c.sysDelayMs,
      };
      const q = solveKind("al-prac-rp3-freefall-g", spec);
      const gMeas = numQ(q, "gMeasured");
      const gSingle = numQ(q, "gSingleDrop");
      const measT = numQ(q, "measuredTimeS");
      const pctDiff = numQ(q, "pctDiffG");
      const anchor = strQ(q, "rp3Anchor");
      out.push({
        id: makeId(`${c.slug}-p3a-8m-${i + 3}`),
        conceptId: "rp3-freefall-g-trapdoor",
        templateArchetype: "al-prac-rp3-trapdoor",
        seed: nextSeed(),
        syllabi: TAG_3_4_1_Y12_NCUK,
        format: "structured",
        questionStyle: "mixed-exam",
        difficulty: "higher",
        domain: "mechanics",
        scenarioSpec: spec,
        hiddenQuantities: ["gMeasured", "pctDiffG", "gSingleDrop", "rp3Anchor"],
        requiredGivens: [
          { name: "gradHvsT2", value: c.gradHvsT2, source: "stem" },
          { name: "dropHeightM", value: c.dropHeightM, unit: "m", source: "stem" },
          { name: "measuredTimeS", value: measT, unit: "s", source: "stem" },
        ],
        questionPlan: {
          targetSummary:
            "Paper three section A trapdoor free fall analysis of h against t squared gradient, percentage discrepancy, and electromagnet delay error",
        },
        stem: `In the electromagnet-and-trapdoor arrangement of Required Practical 3, plotting drop height $h$ against $t^2$ produces a straight line of gradient ${c.gradHvsT2.toFixed(2)} m s⁻². In an individual drop from $h = ${c.dropHeightM.toFixed(2)}$ m, the digital timer records ${f4(measT, "s")} because residual magnetism delays release by ${c.sysDelayMs} ms.`,
        parts: [
          {
            partId: "a",
            prompt: "Calculate the experimental value of $g$ from the gradient of the $h$ against $t^2$ graph.",
            marks: 2,
            targetMode: "quantitative",
            targetQuantityKey: "gMeasured",
            expectedAnswer: f3(gMeas, "m s⁻²"),
            workingSteps: [`$g = 2 \\times ${c.gradHvsT2.toFixed(2)} = ${f3(gMeas, "m s⁻²")}$.`],
          },
          {
            partId: "b",
            prompt: "Calculate the percentage difference between this graph value and $9.81$ m s⁻².",
            marks: 2,
            dependsOnPartIds: ["a"],
            targetMode: "quantitative",
            targetQuantityKey: "pctDiffG",
            expectedAnswer: f3(pctDiff, "%"),
            workingSteps: [`$|${f3(gMeas)} - 9.81|/9.81 \\times 100\\% = ${f3(pctDiff, "%")}$.`],
          },
          {
            partId: "c",
            prompt: `Calculate the apparent value of $g$ obtained from the single drop at $h = ${c.dropHeightM.toFixed(2)}$ m.`,
            marks: 2,
            targetMode: "quantitative",
            targetQuantityKey: "gSingleDrop",
            expectedAnswer: f3(gSingle, "m s⁻²"),
            workingSteps: [`$g = 2(${c.dropHeightM}) / (${f4(measT)})^2 = ${f3(gSingle, "m s⁻²")}$.`],
          },
          {
            partId: "d",
            prompt: "Explain why residual magnetism produces a systematic underestimate of $g$ and suggest one way to minimise it.",
            marks: 2,
            targetMode: "qualitative",
            targetQuantityKey: "rp3Anchor",
            expectedAnswer: `${anchor}; minimise by reducing electromagnet current to the minimum needed to hold the sphere or inserting a thin sheet of paper.`,
            workingSteps: [
              "Timer starts when current switches off, before sphere detaches -> t too large -> 2h/t² too small.",
              "Use minimum holding current / paper spacer / switch to two light gates.",
            ],
          },
        ],
        workedSolution: `(a) $g = 2 \\times ${c.gradHvsT2} = ${f3(gMeas, "m s⁻²")}$. (b) Percentage difference $= ${f3(pctDiff, "%")}$. (c) Single drop gives $g = ${f3(gSingle, "m s⁻²")}$. (d) ${anchor}.`,
        markScheme: [
          { code: "M1", criterion: "Uses $g = 2 \\times \\mathrm{gradient}$.", marks: 1, partId: "a" },
          { code: "A1", criterion: `Measured $g = ${f3(gMeas, "m s⁻²")}$.`, marks: 1, partId: "a" },
          { code: "M1", criterion: "Divides absolute discrepancy by accepted $9.81$ m s⁻².", marks: 1, partId: "b" },
          { code: "A1", criterion: `Percentage difference $= ${f3(pctDiff, "%")}$.`, marks: 1, partId: "b" },
          { code: "M1", criterion: "Substitutes into $g = 2h/t^2$.", marks: 1, partId: "c" },
          { code: "A1", criterion: `Apparent $g = ${f3(gSingle, "m s⁻²")}$.`, marks: 1, partId: "c" },
          { code: "B1", criterion: "Residual magnetism delays release so recorded $t$ is systematically too large.", marks: 1, partId: "d" },
          { code: "B1", criterion: "Suggests reducing electromagnet current / inserting paper spacer / using two light gates.", marks: 1, partId: "d" },
        ],
        totalMarks: 8,
        generatorModel: model,
      });
    });
  }

  /* ======================================================================== */
  /*  7. al-prac-rp4-young-modulus (14 items: 4 Q, 4 Qual, 4 8m, 2 6m LoRs)   */
  /* ======================================================================== */
  {
    const rp4Cases = [
      { slug: "rp4-steel", wireLengthM: 2.4, d1Mm: 0.42, d2Mm: 0.44, d3Mm: 0.43, gradFvsE_NPerMm: 12.1, uncLengthMm: 2, uncDiameterMm: 0.01, pctUncGrad: 2.0, mat: "hard-drawn steel wire" },
      { slug: "rp4-copper", wireLengthM: 2.1, d1Mm: 0.48, d2Mm: 0.46, d3Mm: 0.47, gradFvsE_NPerMm: 9.8, uncLengthMm: 2, uncDiameterMm: 0.01, pctUncGrad: 1.8, mat: "annealed copper wire" },
      { slug: "rp4-brass", wireLengthM: 1.9, d1Mm: 0.36, d2Mm: 0.38, d3Mm: 0.37, gradFvsE_NPerMm: 5.7, uncLengthMm: 1, uncDiameterMm: 0.01, pctUncGrad: 2.4, mat: "yellow brass wire" },
      { slug: "rp4-nichrome", wireLengthM: 2.6, d1Mm: 0.34, d2Mm: 0.32, d3Mm: 0.33, gradFvsE_NPerMm: 6.9, uncLengthMm: 2, uncDiameterMm: 0.01, pctUncGrad: 1.6, mat: "nichrome alloy wire" },
    ];

    // 4 Quantitative MCQs
    rp4Cases.forEach((c, i) => {
      const spec: Record<string, unknown> = {
        kind: "al-prac-rp4-young-modulus",
        wireLengthM: c.wireLengthM,
        d1Mm: c.d1Mm,
        d2Mm: c.d2Mm,
        d3Mm: c.d3Mm,
        gradFvsE_NPerMm: c.gradFvsE_NPerMm,
        uncLengthMm: c.uncLengthMm,
        uncDiameterMm: c.uncDiameterMm,
        pctUncGrad: c.pctUncGrad,
      };
      const q = solveKind("al-prac-rp4-young-modulus", spec);
      const dMean = numQ(q, "dMeanMm");
      const area = numQ(q, "crossSectionAreaM2");
      const eGPa = numQ(q, "youngModulusGPa");
      const pctE = numQ(q, "pctUncE");
      const pctD = numQ(q, "pctUncDiameter");
      const pctL = numQ(q, "pctUncLength");
      const seed = nextSeed();
      const askPct = i % 2 === 1;
      const tKey = askPct ? "pctUncE" : "youngModulusGPa";
      const truth = askPct ? pctE : eGPa;
      const unit = askPct ? "%" : "GPa";

      out.push({
        id: makeId(`${c.slug}-qmcq-${i + 1}`),
        conceptId: "rp4-young-modulus-searle",
        templateArchetype: "al-prac-rp4-young-modulus",
        seed,
        syllabi: TAG_3_4_2_Y12_NCUK,
        format: "mcq",
        questionStyle: "experimental",
        difficulty: "standard",
        domain: "mechanics",
        scenarioSpec: spec,
        hiddenQuantities: ["youngModulusGPa", "youngModulusPa", "pctUncE"],
        requiredGivens: [
          { name: "wireLengthM", value: c.wireLengthM, unit: "m", source: "either" },
          { name: "d1Mm", value: c.d1Mm, unit: "mm", source: "stem" },
          { name: "d2Mm", value: c.d2Mm, unit: "mm", source: "stem" },
          { name: "d3Mm", value: c.d3Mm, unit: "mm", source: "stem" },
          ...(askPct
            ? [
                { name: "uncLengthM", value: c.uncLengthMm * 1e-3, unit: "m", source: "stem" as const },
                { name: "uncDiameterMm", value: c.uncDiameterMm, unit: "mm", source: "stem" as const },
                { name: "pctUncGrad", value: c.pctUncGrad, source: "stem" as const },
              ]
            : [{ name: "gradFvsE_NPerMm", value: c.gradFvsE_NPerMm, source: "stem" as const }]),
        ],
        questionPlan: {
          targetSummary:
            "Calculate young modulus or total percentage uncertainty from Searle apparatus wire length, micrometer diameters, and force extension gradient",
        },
        stem: askPct
          ? `In Required Practical 4 on a ${c.mat} of length $(${c.wireLengthM.toFixed(2)} \\pm ${(c.uncLengthMm * 1e-3).toFixed(3)})$ m, orthogonal micrometer readings give mean diameters ${c.d1Mm.toFixed(2)} mm, ${c.d2Mm.toFixed(2)} mm, and ${c.d3Mm.toFixed(2)} mm (uncertainty $\\pm ${c.uncDiameterMm.toFixed(2)}$ mm). The gradient of the $F$ against $e$ graph has percentage uncertainty ${c.pctUncGrad.toFixed(1)}%. Calculate the total percentage uncertainty in the Young modulus $E$.`
          : `During Required Practical 4 on a ${c.mat} of length $L = ${c.wireLengthM.toFixed(2)}$ m, three micrometer diameter pairs average to ${c.d1Mm.toFixed(2)} mm, ${c.d2Mm.toFixed(2)} mm, and ${c.d3Mm.toFixed(2)} mm. The linear elastic graph of force $F$ against extension $e$ has gradient ${c.gradFvsE_NPerMm.toFixed(1)} N mm⁻¹. Determine the Young modulus $E$ in GPa.`,
        options: buildNumOptions(
          truth,
          unit,
          askPct
            ? [
                { value: pctL + pctD + c.pctUncGrad, rationale: "Forgets to multiply percentage uncertainty in diameter by 2 for A = πd²/4." },
                { value: 2 * pctD, rationale: "Includes only the area uncertainty and omits length and gradient uncertainties." },
                { value: pctL + 2 * pctD, rationale: "Omits the percentage uncertainty of the F vs e gradient." },
              ]
            : [
                { value: eGPa / 4, rationale: "Uses A = πd² instead of A = πd²/4 (confuses diameter with radius)." },
                { value: eGPa * 1e-3, rationale: "Forgets to convert gradient from N mm⁻¹ to N m⁻¹." },
                { value: eGPa * 2, rationale: "Inserts an erroneous factor of 2 in E = FL/(Ae)." },
              ],
          seed,
        ),
        targetMode: "quantitative",
        targetQuantityKey: tKey,
        workedSolution: `Mean diameter $d = ${dMean.toFixed(2)}$ mm gives $A = \\pi d^2/4 = ${f3(area, "m²")}$. $E = L \\times \\mathrm{grad} / A = ${f3(eGPa, "GPa")}$. Percentage uncertainty $\\%\\Delta E = \\%\\Delta L + 2\\%\\Delta d + \\%\\Delta\\mathrm{grad} = ${f3(pctL)} + 2(${f3(pctD)}) + ${c.pctUncGrad} = ${f3(pctE, "%")}$.`,
        markScheme: [
          { code: "A1", criterion: `Correctly evaluates ${tKey} $= ${f3(truth, unit)}$.`, marks: 1 },
        ],
        totalMarks: 1,
        generatorModel: model,
      });
    });

    // 4 Qualitative MCQs for RP4
    const rp4Quals = [
      {
        slug: "rp4-qual-ref-wire",
        idx: 0,
        stem: "In Searle's dual-wire apparatus (RP4), why is an identical unstressed reference wire suspended beside the test wire from the same ceiling beam?",
        correct:
          "An identical reference wire compensates both ceiling sag and thermal expansion while orthogonal micrometer diameter measurements reduce cross sectional area uncertainty.",
        distractors: [
          {
            text: "The reference wire doubles the cross-sectional area so the test wire can support twice the load.",
            rationale: "The slotted masses load only the test wire; the reference wire carries a small constant straightening weight.",
          },
          {
            text: "The reference wire compensates ceiling sag only and has no effect on room-temperature drift.",
            rationale: "Because both wires are the same metal and length, thermal expansion shifts both scales identically so Δe is unaffected.",
          },
          {
            text: "The reference wire prevents the test wire from exceeding its elastic limit during unloading.",
            rationale: "Checking elastic recovery requires unloading readings, not the reference wire.",
          },
        ] as const,
      },
      {
        slug: "rp4-qual-long-thin",
        idx: 1,
        stem: "Why should the test wire in Required Practical 4 be both long (at least 2 m) and thin (diameter around 0.4 mm)?",
        correct:
          "A long thin wire produces a larger measurable extension e for safe loads, reducing percentage uncertainty, while an identical reference wire compensates both ceiling sag and thermal expansion while orthogonal micrometer diameter measurements reduce cross sectional area uncertainty.",
        distractors: [
          {
            text: "A long thin wire increases the intrinsic Young modulus E of the metal.",
            rationale: "Young modulus is a material property independent of wire dimensions.",
          },
          {
            text: "A thicker shorter wire gives larger extensions so Vernier scales are unnecessary.",
            rationale: "Since e = FL/(EA), a shorter thicker wire extends much less, worsening percentage uncertainty.",
          },
          {
            text: "A thin wire eliminates percentage uncertainty in cross-sectional area because %Δd becomes negligible.",
            rationale: "A thinner wire actually increases %Δd, which is why precise orthogonal micrometer readings are essential.",
          },
        ] as const,
      },
      {
        slug: "rp4-qual-unload-check",
        idx: 2,
        stem: "Why do students record extension readings while both loading and unloading the test wire in Required Practical 4?",
        correct:
          "Confirming unloading readings match loading readings verifies the elastic limit was not exceeded; meanwhile an identical reference wire compensates both ceiling sag and thermal expansion while orthogonal micrometer diameter measurements reduce cross sectional area uncertainty.",
        distractors: [
          {
            text: "Averaging loading and unloading curves automatically corrects for plastic necking of the wire.",
            rationale: "Once plastic deformation occurs, Hooke's law fails and permanent extension invalidates the Young modulus gradient.",
          },
          {
            text: "Unloading readings eliminate systematic zero error in the micrometer diameter.",
            rationale: "Unloading checks elastic behaviour and hysteresis, not micrometer zero error.",
          },
          {
            text: "Unloading is required only to measure the breaking stress of the metal.",
            rationale: "The wire is kept strictly below its elastic limit throughout RP4.",
          },
        ] as const,
      },
      {
        slug: "rp4-qual-safety-sand",
        idx: 3,
        stem: "Which safety measures and experimental controls are required during Searle's Young modulus investigation (RP4)?",
        correct:
          "Wear safety goggles for snapping-wire whiplash and place a sand tray beneath slotted masses; also an identical reference wire compensates both ceiling sag and thermal expansion while orthogonal micrometer diameter measurements reduce cross sectional area uncertainty.",
        distractors: [
          {
            text: "Stand directly beneath the hanging masses to read the Vernier scale vertically without parallax.",
            rationale: "Keep feet well clear of hanging masses above a cushioned sand tray and view the Vernier horizontally.",
          },
          {
            text: "Measure wire diameter once near the ceiling clamp so the wire is not touched near the midpoint.",
            rationale: "Diameter must be measured in perpendicular directions at least three places along the wire.",
          },
          {
            text: "Use a plastic thread as the reference wire because plastic stretches less than steel.",
            rationale: "The reference wire must be identical material and length to cancel thermal expansion.",
          },
        ] as const,
      },
    ];

    rp4Quals.forEach((b, i) => {
      const c = rp4Cases[b.idx];
      const spec: Record<string, unknown> = {
        kind: "al-prac-rp4-young-modulus",
        wireLengthM: c.wireLengthM,
        d1Mm: c.d1Mm,
        d2Mm: c.d2Mm,
        d3Mm: c.d3Mm,
        gradFvsE_NPerMm: c.gradFvsE_NPerMm,
        uncLengthMm: c.uncLengthMm,
        uncDiameterMm: c.uncDiameterMm,
        pctUncGrad: c.pctUncGrad,
      };
      const seed = nextSeed();
      out.push({
        id: makeId(`${b.slug}-${i + 1}`),
        conceptId: "rp4-young-modulus-searle",
        templateArchetype: "al-prac-rp4-young-modulus",
        seed,
        syllabi: TAG_3_4_2_Y12,
        format: "mcq",
        questionStyle: "qualitative",
        difficulty: "standard",
        domain: "mechanics",
        scenarioSpec: spec,
        hiddenQuantities: ["rp4PrecautionAnchor"],
        requiredGivens: [],
        questionPlan: {
          targetSummary:
            "Assess Searle reference wire compensation, wire geometry, elastic recovery, and safety in required practical four",
        },
        stem: b.stem,
        options: buildVerbalOptions(b.correct, b.distractors, seed),
        targetMode: "qualitative",
        targetQuantityKey: "rp4PrecautionAnchor",
        workedSolution: `RP4 mark-scheme principle: ${b.correct}`,
        markScheme: [{ code: "A1", criterion: b.correct, marks: 1 }],
        totalMarks: 1,
        generatorModel: model,
      });
    });

    // 4 Paper 3A Structured 8m Ladders
    rp4Cases.forEach((c, i) => {
      const spec: Record<string, unknown> = {
        kind: "al-prac-rp4-young-modulus",
        wireLengthM: c.wireLengthM,
        d1Mm: c.d1Mm,
        d2Mm: c.d2Mm,
        d3Mm: c.d3Mm,
        gradFvsE_NPerMm: c.gradFvsE_NPerMm,
        uncLengthMm: c.uncLengthMm,
        uncDiameterMm: c.uncDiameterMm,
        pctUncGrad: c.pctUncGrad,
      };
      const q = solveKind("al-prac-rp4-young-modulus", spec);
      const area = numQ(q, "crossSectionAreaM2");
      const eGPa = numQ(q, "youngModulusGPa");
      const pctE = numQ(q, "pctUncE");
      const anchor = strQ(q, "rp4PrecautionAnchor");
      out.push({
        id: makeId(`${c.slug}-p3a-8m-${i + 1}`),
        conceptId: "rp4-young-modulus-searle",
        templateArchetype: "al-prac-rp4-young-modulus",
        seed: nextSeed(),
        syllabi: TAG_3_4_2_Y12_NCUK,
        format: "structured",
        questionStyle: "mixed-exam",
        difficulty: i < 2 ? "standard" : "higher",
        domain: "mechanics",
        scenarioSpec: spec,
        hiddenQuantities: ["crossSectionAreaM2", "youngModulusGPa", "pctUncE", "rp4PrecautionAnchor"],
        requiredGivens: [
          { name: "wireLengthM", value: c.wireLengthM, unit: "m", source: "either" },
          { name: "d1Mm", value: c.d1Mm, unit: "mm", source: "stem" },
          { name: "d2Mm", value: c.d2Mm, unit: "mm", source: "stem" },
          { name: "d3Mm", value: c.d3Mm, unit: "mm", source: "stem" },
          { name: "gradFvsE_NPerMm", value: c.gradFvsE_NPerMm, source: "stem" },
          { name: "uncLengthM", value: c.uncLengthMm * 1e-3, unit: "m", source: "stem" },
          { name: "uncDiameterMm", value: c.uncDiameterMm, unit: "mm", source: "stem" },
          { name: "pctUncGrad", value: c.pctUncGrad, source: "stem" },
        ],
        questionPlan: {
          targetSummary:
            "Paper three section A required practical four determination of cross sectional area, young modulus, uncertainty propagation, and Searle precautions",
        },
        stem: `In Searle's Young modulus investigation (RP4) on a ${c.mat} of unstretched length $(${c.wireLengthM.toFixed(2)} \\pm ${(c.uncLengthMm * 1e-3).toFixed(3)})$ m, micrometer diameter measurements at three orthogonal positions average to ${c.d1Mm.toFixed(2)} mm, ${c.d2Mm.toFixed(2)} mm, and ${c.d3Mm.toFixed(2)} mm (each $\\pm ${c.uncDiameterMm.toFixed(2)}$ mm). Plotting load $F$ against extension $e$ yields a straight line through the origin of gradient ${c.gradFvsE_NPerMm.toFixed(1)} N mm⁻¹ ($\\pm ${c.pctUncGrad.toFixed(1)}\\%$).`,
        parts: [
          {
            partId: "a",
            prompt: "Calculate the mean cross-sectional area $A$ of the wire in m².",
            marks: 2,
            targetMode: "quantitative",
            targetQuantityKey: "crossSectionAreaM2",
            expectedAnswer: f3(area, "m²"),
            workingSteps: [
              `$d_{\\mathrm{mean}} = ${numQ(q, "dMeanMm").toFixed(2)}$ mm $= ${f3(numQ(q, "dMeanMm") * 1e-3, "m")}$.`,
              `$A = \\pi d^2 / 4 = ${f3(area, "m²")}$.`,
            ],
          },
          {
            partId: "b",
            prompt: "Determine the Young modulus $E$ of the wire in GPa.",
            marks: 2,
            dependsOnPartIds: ["a"],
            targetMode: "quantitative",
            targetQuantityKey: "youngModulusGPa",
            expectedAnswer: f3(eGPa, "GPa"),
            workingSteps: [
              `$E = L \\times \\mathrm{grad} / A = ${c.wireLengthM} \\times (${c.gradFvsE_NPerMm} \\times 10^3) / ${f3(area)} = ${f3(eGPa, "GPa")}$.`,
            ],
          },
          {
            partId: "c",
            prompt: "Calculate the percentage uncertainty in $E$.",
            marks: 2,
            targetMode: "quantitative",
            targetQuantityKey: "pctUncE",
            expectedAnswer: f3(pctE, "%"),
            workingSteps: [
              `$\\%\\Delta E = \\%\\Delta L + 2\\%\\Delta d + \\%\\Delta\\mathrm{grad} = ${f3(pctE, "%")}$.`,
            ],
          },
          {
            partId: "d",
            prompt: "Explain the purpose of the reference wire and why orthogonal micrometer readings are taken at three places.",
            marks: 2,
            targetMode: "qualitative",
            targetQuantityKey: "rp4PrecautionAnchor",
            expectedAnswer: anchor,
            workingSteps: [
              "Identical reference wire cancels ceiling sag and thermal expansion equally on both scales.",
              "Orthogonal readings at 3 positions check circularity and reduce random error in d².",
            ],
          },
        ],
        workedSolution: `(a) $A = \\pi d^2/4 = ${f3(area, "m²")}$. (b) $E = L(\\mathrm{grad})/A = ${f3(eGPa, "GPa")}$. (c) $\\%\\Delta E = ${f3(pctE, "%")}$. (d) ${anchor}.`,
        markScheme: [
          { code: "M1", criterion: "Averages three diameters and converts mm to m in $A = \\pi d^2/4$.", marks: 1, partId: "a" },
          { code: "A1", criterion: `Cross-sectional area $A = ${f3(area, "m²")}$.`, marks: 1, partId: "a" },
          { code: "M1", criterion: "Converts gradient to N m⁻¹ and substitutes into $E = (L/A)\\,\\mathrm{grad}$.", marks: 1, partId: "b" },
          { code: "A1", criterion: `Young modulus $E = ${f3(eGPa, "GPa")}$.`, marks: 1, partId: "b" },
          { code: "M1", criterion: "Combines $\\%\\Delta L + 2\\%\\Delta d + \\%\\Delta\\mathrm{grad}$.", marks: 1, partId: "c" },
          { code: "A1", criterion: `Percentage uncertainty in $E = ${f3(pctE, "%")}$.`, marks: 1, partId: "c" },
          { code: "B1", criterion: "Identical reference wire compensates both support sag and temperature expansion.", marks: 1, partId: "d" },
          { code: "B1", criterion: "Orthogonal micrometer readings at >= 3 positions detect non-uniformity/oval cross-section.", marks: 1, partId: "d" },
        ],
        totalMarks: 8,
        generatorModel: model,
      });
    });

    // 2 Authentic 6-Mark Experimental LoRs for RP4
    [
      {
        slug: "rp4-lor-searle-steel",
        idx: 0,
        stem: "A student is tasked with measuring the Young modulus of a long steel wire using Searle's dual-wire apparatus suspended from a rigid ceiling beam.",
        prompt:
          "Describe a detailed, safe experimental method to obtain an accurate value for the Young modulus, explaining all measurements, instrument techniques, error controls, and graphical analysis. [6 marks]",
      },
      {
        slug: "rp4-lor-searle-copper",
        idx: 1,
        stem: "A laboratory group uses a comparison-wire Vernier arrangement to investigate the elastic stiffness and Young modulus of an annealed copper wire.",
        prompt:
          "Explain how the students should set up the apparatus safely, measure wire dimensions and extensions accurately, check elastic behaviour, and determine the Young modulus graphically. [6 marks]",
      },
    ].forEach((lor, idx) => {
      const c = rp4Cases[lor.idx];
      const spec: Record<string, unknown> = {
        kind: "al-prac-rp4-young-modulus",
        wireLengthM: c.wireLengthM,
        d1Mm: c.d1Mm,
        d2Mm: c.d2Mm,
        d3Mm: c.d3Mm,
        gradFvsE_NPerMm: c.gradFvsE_NPerMm,
        uncLengthMm: c.uncLengthMm,
        uncDiameterMm: c.uncDiameterMm,
        pctUncGrad: c.pctUncGrad,
      };
      const anchor = strQ(solveKind("al-prac-rp4-young-modulus", spec), "rp4PrecautionAnchor");
      out.push(
        buildExperimentalLor6m({
          id: makeId(`${lor.slug}-6m-${idx + 1}`),
          seed: nextSeed(),
          model,
          domain: "mechanics",
          conceptId: "rp4-young-modulus-searle",
          templateArchetype: "al-prac-rp4-lor",
          syllabi: TAG_3_4_2_Y12,
          difficulty: "higher",
          scenarioSpec: spec,
          anchorKey: "rp4PrecautionAnchor",
          anchorText: anchor,
          requiredGivens: [],
          stem: lor.stem,
          prompt: lor.prompt,
          expectedAnswer: `Wear safety goggles and place a sand tray beneath the slotted masses; ${anchor}; measure unstretched length L with a metre ruler, apply incremental loads F = mg while reading Vernier extensions during both loading and unloading, plot F against e, and obtain E = (L/A) × gradient.`,
          workingSteps: [
            "Level 1: Safety goggles + sand tray beneath slotted masses; long thin test wire and identical reference wire.",
            "Level 2: Micrometer with ratchet (zero-error checked) at >= 3 orthogonal pairs for d -> A = πd²/4; ruler for L; initial straightening load + Vernier extension readings.",
            "Level 3: Repeat readings during unloading to confirm elastic limit, plot F vs e (straight line through origin), compute E = L × gradient / A.",
          ],
          workedSolution: `Level 3 Model Response: Wear safety goggles in case the taut wire snaps and place a sand tray or cushioned pad directly beneath the hanging slotted masses, keeping feet clear. Hang a long thin test wire alongside an identical reference wire carrying a small constant mass from the same rigid beam so ceiling sag and thermal expansion cancel equally. Check micrometer zero error, then use the ratchet to measure wire diameter in perpendicular directions at least three positions along the wire; average d and compute A = πd²/4. Measure original length L from clamp to Vernier marker with a metre ruler after applying a small initial load to remove kinks. Add known masses incrementally (F = mg, g = 9.81 m s⁻²), recording Vernier extension e at eye level, then record extensions while unloading to verify the elastic limit was not exceeded. Plot F against e, draw a best-fit line through the linear elastic region, determine gradient from > 50% span, and evaluate E = (L / A) × gradient.`,
          criteria: [
            "States safety precautions: wear safety goggles for snapping wire and place a sand tray/cushion under slotted masses.",
            "Explains that the identical reference wire compensates both ceiling-beam sag and thermal expansion.",
            "Measures diameter using a zero-checked micrometer with ratchet at >= 3 places in orthogonal directions to find A = πd²/4.",
            "Applies a small initial straightening load, measures original length L with a metre ruler, and records incremental Vernier extensions e for loads F = mg.",
            "Takes unloading readings to confirm the wire returns to original readings (elastic limit not exceeded).",
            "Plots F against e (or stress against strain) and extracts E = (L / A) × gradient from a best-fit straight line.",
          ],
          targetSummary:
            "Six mark level of response experimental procedure for required practical four Searle young modulus determination",
        }),
      );
    });
  }

  /* ======================================================================== */
  /*  8. al-prac-rp5-rp6-resistivity-emf (16 items: 8 RP5 + 8 RP6)            */
  /* ======================================================================== */
  {
    const rp5Cases = [
      { slug: "rp5-const-1", wireDiameterMm: 0.32, gradRvsL_OhmPerM: 6.1, contactResistanceOhm: 0.24, pctUncGrad: 2.0, uncDiameterMm: 0.01, mat: "constantan wire" },
      { slug: "rp5-nich-2", wireDiameterMm: 0.28, gradRvsL_OhmPerM: 17.8, contactResistanceOhm: 0.35, pctUncGrad: 1.8, uncDiameterMm: 0.01, mat: "nichrome resistance wire" },
      { slug: "rp5-mang-3", wireDiameterMm: 0.38, gradRvsL_OhmPerM: 3.9, contactResistanceOhm: 0.18, pctUncGrad: 2.4, uncDiameterMm: 0.01, mat: "manganin alloy wire" },
    ];
    const rp6Cases = [
      { slug: "rp6-cell-1", emfV: 1.56, internalResistanceOhm: 0.85, protectiveResistanceOhm: 2.2, i1A: 0.12, i2A: 0.44, cell: "zinc-carbon dry cell" },
      { slug: "rp6-cell-2", emfV: 3.12, internalResistanceOhm: 1.4, protectiveResistanceOhm: 3.3, i1A: 0.15, i2A: 0.55, cell: "two-cell laboratory battery pack" },
      { slug: "rp6-cell-3", emfV: 6.24, internalResistanceOhm: 2.1, protectiveResistanceOhm: 4.7, i1A: 0.2, i2A: 0.72, cell: "aged 6 V lantern battery" },
    ];

    // RP5: 3 Quant MCQs + 2 Qual MCQs + 3 Structured 8m = 8 items
    rp5Cases.forEach((c, i) => {
      const spec: Record<string, unknown> = {
        kind: "al-prac-rp5-rp6-resistivity-emf",
        mode: "rp5-resistivity",
        wireDiameterMm: c.wireDiameterMm,
        gradRvsL_OhmPerM: c.gradRvsL_OhmPerM,
        contactResistanceOhm: c.contactResistanceOhm,
        pctUncGrad: c.pctUncGrad,
        uncDiameterMm: c.uncDiameterMm,
      };
      const q = solveKind("al-prac-rp5-rp6-resistivity-emf", spec);
      const rho = numQ(q, "resistivityRho");
      const pctRho = numQ(q, "pctUncRho");
      const area = numQ(q, "areaM2");
      const seed = nextSeed();
      const askPct = i === 2;
      const tKey = askPct ? "pctUncRho" : "resistivityRho";
      const truth = askPct ? pctRho : rho;
      const unit = askPct ? "%" : "Ω m";
      out.push({
        id: makeId(`${c.slug}-qmcq-${i + 1}`),
        conceptId: "rp5-resistivity-wire",
        templateArchetype: "al-prac-rp5-resistivity",
        seed,
        syllabi: TAG_3_5_1_Y12_NCUK_RHO,
        format: "mcq",
        questionStyle: "experimental",
        difficulty: "standard",
        domain: "circuits",
        scenarioSpec: spec,
        hiddenQuantities: ["resistivityRho", "pctUncRho"],
        requiredGivens: [
          { name: "wireDiameterMm", value: c.wireDiameterMm, unit: "mm", source: "stem" },
          ...(askPct
            ? [
                { name: "uncDiameterMm", value: c.uncDiameterMm, unit: "mm", source: "stem" as const },
                { name: "pctUncGrad", value: c.pctUncGrad, source: "stem" as const },
              ]
            : [{ name: "gradRvsL_OhmPerM", value: c.gradRvsL_OhmPerM, source: "stem" as const }]),
        ],
        questionPlan: {
          targetSummary:
            "Determine wire resistivity or percentage uncertainty from resistance against length gradient and micrometer diameter in required practical five",
        },
        stem: askPct
          ? `In Required Practical 5, the diameter of a ${c.mat} is measured as $(${c.wireDiameterMm.toFixed(2)} \\pm ${c.uncDiameterMm.toFixed(2)})$ mm and the gradient of the $R$ against $L$ graph has percentage uncertainty ${c.pctUncGrad.toFixed(1)}%. Calculate the percentage uncertainty in resistivity $\\rho$.`
          : `During Required Practical 5, a ${c.mat} of mean diameter ${c.wireDiameterMm.toFixed(2)} mm is taped to a metre ruler. Plotting resistance $R$ against length $L$ produces a straight line of gradient ${c.gradRvsL_OhmPerM.toFixed(1)} Ω m⁻¹ with a small positive vertical intercept ${c.contactResistanceOhm.toFixed(2)} Ω. Calculate the resistivity $\\rho$ of the alloy.`,
        options: buildNumOptions(
          truth,
          unit,
          askPct
            ? [
                { value: c.pctUncGrad + numQ(q, "pctUncD"), rationale: "Forgets to double %Δd when propagating uncertainty through A = πd²/4." },
                { value: 2 * numQ(q, "pctUncD"), rationale: "Omits the percentage uncertainty of the R vs L gradient." },
                { value: c.pctUncGrad, rationale: "Ignores diameter uncertainty completely." },
              ]
            : [
                { value: rho * 4, rationale: "Uses A = πd² instead of A = πd²/4." },
                { value: (c.gradRvsL_OhmPerM + c.contactResistanceOhm) * area, rationale: "Erroneously adds the contact-resistance intercept into the gradient." },
                { value: rho * 1e6, rationale: "Forgets to convert mm² into m²." },
              ],
          seed,
        ),
        targetMode: "quantitative",
        targetQuantityKey: tKey,
        workedSolution: `Cross-sectional area $A = \\pi (${c.wireDiameterMm} \\times 10^{-3})^2 / 4 = ${f3(area, "m²")}$. Resistivity $\\rho = \\mathrm{gradient} \\times A = ${f3(rho, "Ω m")}$. Percentage uncertainty $\\%\\Delta\\rho = ${c.pctUncGrad} + 2(${f3(numQ(q, "pctUncD"))}) = ${f3(pctRho, "%")}$.`,
        markScheme: [
          { code: "A1", criterion: `Correctly determines ${tKey} $= ${f3(truth, unit)}$.`, marks: 1 },
        ],
        totalMarks: 1,
        generatorModel: model,
      });
    });

    [
      {
        slug: "rp5-qual-heating",
        idx: 0,
        stem: "In Required Practical 5 (resistivity of a metal wire), why should the student use a low supply voltage, open the switch between readings, and interpret a positive $R$ against $L$ vertical intercept carefully?",
        correct:
          "Keep the current low and open the switch between readings to prevent wire heating while the non zero intercept represents contact and lead resistance.",
        distractors: [
          {
            text: "Keep current high so voltmeter readings are maximized while the vertical intercept represents wire cross-sectional area.",
            rationale: "High current heats the wire and raises resistivity; the vertical intercept is contact/lead resistance R_c.",
          },
          {
            text: "Force the R against L line through the origin because resistance must always equal zero at L = 0.",
            rationale: "Crocodile-clip contact resistance and connecting leads add a constant positive offset R_c.",
          },
          {
            text: "Use constantan because its resistivity increases dramatically with small temperature rises.",
            rationale: "Constantan is chosen specifically for its very low temperature coefficient of resistivity.",
          },
        ] as const,
      },
      {
        slug: "rp5-qual-intercept",
        idx: 1,
        stem: "A student calculates $\\rho$ from a single pair of $V$ and $I$ readings at $L = 0.50$ m and gets a value 6% higher than the value obtained from the gradient of $R$ against $L$. Why is the gradient method superior?",
        correct:
          "The gradient eliminates constant contact resistance, provided students keep the current low and open the switch between readings to prevent wire heating while the non zero intercept represents contact and lead resistance.",
        distractors: [
          {
            text: "Because the gradient method eliminates any systematic zero error in the micrometer diameter.",
            rationale: "The gradient eliminates additive resistance offset R_c, not multiplicative error in diameter d.",
          },
          {
            text: "Because a single measurement neglects the parallel voltmeter resistance, whereas the gradient cancels it.",
            rationale: "The dominant bias between single-point R/L and the gradient is additive lead/contact resistance R_c.",
          },
          {
            text: "Because resistivity varies inversely with wire length L.",
            rationale: "Resistivity is an intrinsic material constant independent of length.",
          },
        ] as const,
      },
    ].forEach((b, i) => {
      const c = rp5Cases[b.idx];
      const spec: Record<string, unknown> = {
        kind: "al-prac-rp5-rp6-resistivity-emf",
        mode: "rp5-resistivity",
        wireDiameterMm: c.wireDiameterMm,
        gradRvsL_OhmPerM: c.gradRvsL_OhmPerM,
        contactResistanceOhm: c.contactResistanceOhm,
        pctUncGrad: c.pctUncGrad,
        uncDiameterMm: c.uncDiameterMm,
      };
      const seed = nextSeed();
      out.push({
        id: makeId(`${b.slug}-${i + 1}`),
        conceptId: "rp5-resistivity-wire",
        templateArchetype: "al-prac-rp5-resistivity",
        seed,
        syllabi: TAG_3_5_1_Y12,
        format: "mcq",
        questionStyle: "qualitative",
        difficulty: "standard",
        domain: "circuits",
        scenarioSpec: spec,
        hiddenQuantities: ["elecPrecautionAnchor"],
        requiredGivens: [],
        questionPlan: {
          targetSummary:
            "Assess heating prevention and contact resistance intercept interpretation in required practical five",
        },
        stem: b.stem,
        options: buildVerbalOptions(b.correct, b.distractors, seed),
        targetMode: "qualitative",
        targetQuantityKey: "elecPrecautionAnchor",
        workedSolution: `RP5 mark-scheme explanation: ${b.correct}`,
        markScheme: [{ code: "A1", criterion: b.correct, marks: 1 }],
        totalMarks: 1,
        generatorModel: model,
      });
    });

    rp5Cases.forEach((c, i) => {
      const spec: Record<string, unknown> = {
        kind: "al-prac-rp5-rp6-resistivity-emf",
        mode: "rp5-resistivity",
        wireDiameterMm: c.wireDiameterMm,
        gradRvsL_OhmPerM: c.gradRvsL_OhmPerM,
        contactResistanceOhm: c.contactResistanceOhm,
        pctUncGrad: c.pctUncGrad,
        uncDiameterMm: c.uncDiameterMm,
      };
      const q = solveKind("al-prac-rp5-rp6-resistivity-emf", spec);
      const area = numQ(q, "areaM2");
      const rho = numQ(q, "resistivityRho");
      const pctRho = numQ(q, "pctUncRho");
      const anchor = strQ(q, "elecPrecautionAnchor");
      out.push({
        id: makeId(`${c.slug}-p3a-8m-${i + 1}`),
        conceptId: "rp5-resistivity-wire",
        templateArchetype: "al-prac-rp5-resistivity",
        seed: nextSeed(),
        syllabi: TAG_3_5_1_Y12_NCUK_RHO,
        format: "structured",
        questionStyle: "mixed-exam",
        difficulty: "standard",
        domain: "circuits",
        scenarioSpec: spec,
        hiddenQuantities: ["areaM2", "resistivityRho", "pctUncRho", "elecPrecautionAnchor"],
        requiredGivens: [
          { name: "wireDiameterMm", value: c.wireDiameterMm, unit: "mm", source: "stem" },
          { name: "gradRvsL_OhmPerM", value: c.gradRvsL_OhmPerM, source: "stem" },
          { name: "contactResistanceOhm", value: c.contactResistanceOhm, unit: "Ω", source: "stem" },
          { name: "pctUncGrad", value: c.pctUncGrad, source: "stem" },
          { name: "uncDiameterMm", value: c.uncDiameterMm, unit: "mm", source: "stem" },
        ],
        questionPlan: {
          targetSummary:
            "Paper three section A required practical five determination of wire area, resistivity, percentage uncertainty, and heating precautions",
        },
        stem: `In Required Practical 5, a student measures the resistance $R$ of varying lengths $L$ of a ${c.mat} of mean diameter $(${c.wireDiameterMm.toFixed(2)} \\pm ${c.uncDiameterMm.toFixed(2)})$ mm. The straight-line graph of $R$ against $L$ has gradient ${c.gradRvsL_OhmPerM.toFixed(1)} Ω m⁻¹ ($\\pm ${c.pctUncGrad.toFixed(1)}\\%$) and vertical intercept ${c.contactResistanceOhm.toFixed(2)} Ω.`,
        parts: [
          {
            partId: "a",
            prompt: "Calculate the cross-sectional area $A$ of the wire in m².",
            marks: 2,
            targetMode: "quantitative",
            targetQuantityKey: "areaM2",
            expectedAnswer: f3(area, "m²"),
            workingSteps: [`$A = \\pi (${c.wireDiameterMm}\\times 10^{-3})^2 / 4 = ${f3(area, "m²")}$.`],
          },
          {
            partId: "b",
            prompt: "Determine the resistivity $\\rho$ of the alloy.",
            marks: 2,
            dependsOnPartIds: ["a"],
            targetMode: "quantitative",
            targetQuantityKey: "resistivityRho",
            expectedAnswer: f3(rho, "Ω m"),
            workingSteps: [`$\\rho = \\mathrm{grad} \\times A = ${c.gradRvsL_OhmPerM} \\times ${f3(area)} = ${f3(rho, "Ω m")}$.`],
          },
          {
            partId: "c",
            prompt: "Calculate the percentage uncertainty in $\\rho$.",
            marks: 2,
            targetMode: "quantitative",
            targetQuantityKey: "pctUncRho",
            expectedAnswer: f3(pctRho, "%"),
            workingSteps: [`$\\%\\Delta\\rho = ${c.pctUncGrad} + 2(${c.uncDiameterMm}/${c.wireDiameterMm} \\times 100) = ${f3(pctRho, "%")}$.`],
          },
          {
            partId: "d",
            prompt: "Explain why the circuit switch is opened between readings and what the positive vertical intercept represents.",
            marks: 2,
            targetMode: "qualitative",
            targetQuantityKey: "elecPrecautionAnchor",
            expectedAnswer: anchor,
            workingSteps: [
              "Opening switch and limiting current prevents temperature rise from altering resistivity.",
              "Non-zero intercept equals lead and crocodile-clip contact resistance R_c.",
            ],
          },
        ],
        workedSolution: `(a) $A = ${f3(area, "m²")}$. (b) $\\rho = ${f3(rho, "Ω m")}$. (c) $\\%\\Delta\\rho = ${f3(pctRho, "%")}$. (d) ${anchor}.`,
        markScheme: [
          { code: "M1", criterion: "Converts diameter to metres and applies $A = \\pi d^2/4$.", marks: 1, partId: "a" },
          { code: "A1", criterion: `Cross-sectional area $A = ${f3(area, "m²")}$.`, marks: 1, partId: "a" },
          { code: "M1", criterion: "Uses $\\rho = \\mathrm{gradient} \\times A$ (ignoring intercept).", marks: 1, partId: "b" },
          { code: "A1", criterion: `Resistivity $\\rho = ${f3(rho, "Ω m")}$.`, marks: 1, partId: "b" },
          { code: "M1", criterion: "Adds gradient percentage uncertainty to twice diameter percentage uncertainty.", marks: 1, partId: "c" },
          { code: "A1", criterion: `Percentage uncertainty $= ${f3(pctRho, "%")}$.`, marks: 1, partId: "c" },
          { code: "B1", criterion: "Open switch / low current prevents Joule heating that would change wire temperature and $\\rho$.", marks: 1, partId: "d" },
          { code: "B1", criterion: "Positive intercept represents contact and connecting-lead resistance.", marks: 1, partId: "d" },
        ],
        totalMarks: 8,
        generatorModel: model,
      });
    });

    // RP6: 3 Quant MCQs + 2 Qual MCQs + 3 Structured 8m = 8 items
    rp6Cases.forEach((c, i) => {
      const spec: Record<string, unknown> = {
        kind: "al-prac-rp5-rp6-resistivity-emf",
        mode: "rp6-emf",
        emfV: c.emfV,
        internalResistanceOhm: c.internalResistanceOhm,
        protectiveResistanceOhm: c.protectiveResistanceOhm,
        i1A: c.i1A,
        i2A: c.i2A,
      };
      const q = solveKind("al-prac-rp5-rp6-resistivity-emf", spec);
      const v1 = numQ(q, "v1V");
      const v2 = numQ(q, "v2V");
      const maxSafeI = numQ(q, "maxSafeCurrentA");
      const seed = nextSeed();
      const targets = ["internalResistanceR", "emfV", "maxSafeCurrentA"] as const;
      const units = ["Ω", "V", "A"] as const;
      const tKey = targets[i];
      const unit = units[i];
      const truth = numQ(q, tKey);

      const stems = [
        `In Required Practical 6 on a ${c.cell}, two points on the best-fit straight line of terminal potential difference $V$ against current $I$ are $(${c.i1A.toFixed(2)}\\text{ A}, ${v1.toFixed(2)}\\text{ V})$ and $(${c.i2A.toFixed(2)}\\text{ A}, ${v2.toFixed(2)}\\text{ V})$. Determine the internal resistance $r$ of the cell.`,
        `During Required Practical 6 using a ${c.cell}, the $V$ against $I$ line passes through $(${c.i1A.toFixed(2)}\\text{ A}, ${v1.toFixed(2)}\\text{ V})$ and $(${c.i2A.toFixed(2)}\\text{ A}, ${v2.toFixed(2)}\\text{ V})$. Calculate the electromotive force $\\varepsilon$ of the battery.`,
        `A ${c.cell} of emf $\\varepsilon = ${c.emfV.toFixed(2)}$ V and internal resistance $r = ${c.internalResistanceOhm.toFixed(2)}$ Ω is connected in series with a fixed protective resistor of ${c.protectiveResistanceOhm.toFixed(1)} Ω and a variable rheostat (RP6). What is the maximum safe current when the rheostat is reduced to zero?`,
      ];

      const dists: NumericDistractor[][] = [
        [
          { value: v1 / c.i1A, rationale: "Calculates external load resistance V₁/I₁ instead of internal resistance −ΔV/ΔI." },
          { value: (c.i2A - c.i1A) / (v1 - v2), rationale: "Inverts the gradient as ΔI / ΔV." },
          { value: v2 / c.i2A, rationale: "Computes external resistance at the second point rather than internal resistance." },
        ],
        [
          { value: v1, rationale: "Confuses terminal voltage at low current with open-circuit emf." },
          { value: v1 - c.i1A * c.internalResistanceOhm, rationale: "Subtracts lost volts I₁r instead of adding I₁r to terminal voltage." },
          { value: (v1 + v2) / 2, rationale: "Takes the midpoint terminal voltage instead of extrapolating to I = 0." },
        ],
        [
          { value: c.emfV / c.protectiveResistanceOhm, rationale: "Ignores internal resistance r in total circuit resistance (r + R_prot)." },
          { value: c.emfV / c.internalResistanceOhm, rationale: "Computes short-circuit current ε/r without the protective resistor." },
          { value: c.emfV / (c.protectiveResistanceOhm - c.internalResistanceOhm), rationale: "Subtracts internal resistance instead of adding series resistances." },
        ],
      ];

      out.push({
        id: makeId(`${c.slug}-qmcq-${i + 1}`),
        conceptId: "rp6-emf-internal-resistance",
        templateArchetype: "al-prac-rp6-emf",
        seed,
        syllabi: TAG_3_5_1_Y12_NCUK_EMF,
        format: "mcq",
        questionStyle: "experimental",
        difficulty: "standard",
        domain: "circuits",
        scenarioSpec: spec,
        hiddenQuantities: [tKey],
        requiredGivens:
          i === 2
            ? [
                { name: "emfV", value: c.emfV, unit: "V", source: "stem" },
                { name: "internalResistanceOhm", value: c.internalResistanceOhm, unit: "Ω", source: "stem" },
                { name: "protectiveResistanceOhm", value: c.protectiveResistanceOhm, unit: "Ω", source: "either" },
              ]
            : [
                { name: "i1A", value: c.i1A, unit: "A", source: "stem" },
                { name: "v1V", value: v1, unit: "V", source: "stem" },
                { name: "i2A", value: c.i2A, unit: "A", source: "stem" },
                { name: "v2V", value: v2, unit: "V", source: "stem" },
              ],
        questionPlan: {
          targetSummary:
            "Determine internal resistance, electromotive force, or maximum safe current in required practical six",
        },
        stem: stems[i],
        options: buildNumOptions(truth, unit, dists[i], seed),
        targetMode: "quantitative",
        targetQuantityKey: tKey,
        workedSolution: `From $V = \\varepsilon - Ir$, gradient $-r = (${v2.toFixed(2)} - ${v1.toFixed(2)})/(${c.i2A} - ${c.i1A}) = -${c.internalResistanceOhm.toFixed(2)}$ Ω, $\\varepsilon = ${c.emfV.toFixed(2)}$ V, and $I_{\\max} = \\varepsilon/(r + R_{\\mathrm{prot}}) = ${f3(maxSafeI, "A")}$.`,
        markScheme: [
          { code: "A1", criterion: `Correctly determines ${tKey} $= ${f3(truth, unit)}$.`, marks: 1 },
        ],
        totalMarks: 1,
        generatorModel: model,
      });
    });

    [
      {
        slug: "rp6-qual-protective",
        idx: 0,
        stem: "Why does the standard AQA Required Practical 6 circuit include a fixed protective series resistor alongside the variable resistor and a switch opened between readings?",
        correct:
          "Include a protective series resistor and open the switch between readings to avoid heating the cell so internal resistance stays constant.",
        distractors: [
          {
            text: "The protective resistor increases the short-circuit current so the voltmeter spans a wider voltage range.",
            rationale: "The protective resistor limits maximum current to prevent overheating and cell drain.",
          },
          {
            text: "The protective resistor increases the measured internal resistance r directly on the V against I graph.",
            rationale: "Because the voltmeter sits across the cell terminals only, external resistors do not change the slope −r.",
          },
          {
            text: "Leaving the switch permanently closed warms the cell to its steady maximum emf.",
            rationale: "Continuous current discharges and heats the cell, causing ε and r to drift during the practical.",
          },
        ] as const,
      },
      {
        slug: "rp6-qual-lost-volts",
        idx: 1,
        stem: "In Required Practical 6, why does the voltmeter reading drop linearly as the variable resistance is decreased, and what precaution keeps the line straight?",
        correct:
          "Larger current increases lost volts Ir inside the cell so V = ε − Ir falls linearly; students must include a protective series resistor and open the switch between readings to avoid heating the cell so internal resistance stays constant.",
        distractors: [
          {
            text: "Decreasing the rheostat reduces the chemical emf of the cell proportionally to current.",
            rationale: "Emf remains constant if the cell is not run down; terminal p.d. falls because lost volts Ir rise.",
          },
          {
            text: "Connecting the voltmeter across the rheostat and protective resistor directly yields intercept equal to r.",
            rationale: "The vertical intercept at I = 0 equals emf ε, while the magnitude of the negative gradient equals r.",
          },
          {
            text: "Replacing the digital voltmeter with a low-resistance analogue voltmeter improves the measurement of ε.",
            rationale: "A low-resistance voltmeter draws extra current through r, reducing the measured terminal voltage.",
          },
        ] as const,
      },
    ].forEach((b, i) => {
      const c = rp6Cases[b.idx];
      const spec: Record<string, unknown> = {
        kind: "al-prac-rp5-rp6-resistivity-emf",
        mode: "rp6-emf",
        emfV: c.emfV,
        internalResistanceOhm: c.internalResistanceOhm,
        protectiveResistanceOhm: c.protectiveResistanceOhm,
        i1A: c.i1A,
        i2A: c.i2A,
      };
      const seed = nextSeed();
      out.push({
        id: makeId(`${b.slug}-${i + 1}`),
        conceptId: "rp6-emf-internal-resistance",
        templateArchetype: "al-prac-rp6-emf",
        seed,
        syllabi: TAG_3_5_1_Y12,
        format: "mcq",
        questionStyle: "qualitative",
        difficulty: "standard",
        domain: "circuits",
        scenarioSpec: spec,
        hiddenQuantities: ["elecPrecautionAnchor"],
        requiredGivens: [],
        questionPlan: {
          targetSummary:
            "Assess protective resistor function and cell heating control in required practical six",
        },
        stem: b.stem,
        options: buildVerbalOptions(b.correct, b.distractors, seed),
        targetMode: "qualitative",
        targetQuantityKey: "elecPrecautionAnchor",
        workedSolution: `RP6 mark-scheme explanation: ${b.correct}`,
        markScheme: [{ code: "A1", criterion: b.correct, marks: 1 }],
        totalMarks: 1,
        generatorModel: model,
      });
    });

    rp6Cases.forEach((c, i) => {
      const spec: Record<string, unknown> = {
        kind: "al-prac-rp5-rp6-resistivity-emf",
        mode: "rp6-emf",
        emfV: c.emfV,
        internalResistanceOhm: c.internalResistanceOhm,
        protectiveResistanceOhm: c.protectiveResistanceOhm,
        i1A: c.i1A,
        i2A: c.i2A,
      };
      const q = solveKind("al-prac-rp5-rp6-resistivity-emf", spec);
      const v1 = numQ(q, "v1V");
      const v2 = numQ(q, "v2V");
      const maxSafe = numQ(q, "maxSafeCurrentA");
      const anchor = strQ(q, "elecPrecautionAnchor");
      out.push({
        id: makeId(`${c.slug}-p3a-8m-${i + 1}`),
        conceptId: "rp6-emf-internal-resistance",
        templateArchetype: "al-prac-rp6-emf",
        seed: nextSeed(),
        syllabi: TAG_3_5_1_Y12_NCUK_EMF,
        format: "structured",
        questionStyle: "mixed-exam",
        difficulty: "standard",
        domain: "circuits",
        scenarioSpec: spec,
        hiddenQuantities: ["internalResistanceR", "emfV", "maxSafeCurrentA", "elecPrecautionAnchor"],
        requiredGivens: [
          { name: "i1A", value: c.i1A, unit: "A", source: "stem" },
          { name: "v1V", value: v1, unit: "V", source: "stem" },
          { name: "i2A", value: c.i2A, unit: "A", source: "stem" },
          { name: "v2V", value: v2, unit: "V", source: "stem" },
          { name: "protectiveResistanceOhm", value: c.protectiveResistanceOhm, unit: "Ω", source: "either" },
        ],
        questionPlan: {
          targetSummary:
            "Paper three section A required practical six determination of internal resistance, emf, maximum safe current, and cell protection",
        },
        stem: `In Required Practical 6, a student investigates a ${c.cell} connected to a ${c.protectiveResistanceOhm.toFixed(1)} Ω protective resistor and rheostat. Two well-spaced points on the straight best-fit graph of terminal potential difference $V$ against current $I$ are $(${c.i1A.toFixed(2)}\\text{ A}, ${v1.toFixed(2)}\\text{ V})$ and $(${c.i2A.toFixed(2)}\\text{ A}, ${v2.toFixed(2)}\\text{ V})$.`,
        parts: [
          {
            partId: "a",
            prompt: "Determine the internal resistance $r$ from the gradient of the line.",
            marks: 2,
            targetMode: "quantitative",
            targetQuantityKey: "internalResistanceR",
            expectedAnswer: f3(c.internalResistanceOhm, "Ω"),
            workingSteps: [`$r = -(${v2.toFixed(2)} - ${v1.toFixed(2)})/(${c.i2A} - ${c.i1A}) = ${f3(c.internalResistanceOhm, "Ω")}$.`],
          },
          {
            partId: "b",
            prompt: "Calculate the emf $\\varepsilon$ of the power source.",
            marks: 2,
            dependsOnPartIds: ["a"],
            targetMode: "quantitative",
            targetQuantityKey: "emfV",
            expectedAnswer: f3(c.emfV, "V"),
            workingSteps: [`$\\varepsilon = V_1 + I_1 r = ${v1.toFixed(2)} + (${c.i1A})(${c.internalResistanceOhm}) = ${f3(c.emfV, "V")}$.`],
          },
          {
            partId: "c",
            prompt: "Calculate the maximum current that can flow when the rheostat is set to zero.",
            marks: 2,
            dependsOnPartIds: ["a", "b"],
            targetMode: "quantitative",
            targetQuantityKey: "maxSafeCurrentA",
            expectedAnswer: f3(maxSafe, "A"),
            workingSteps: [`$I_{\\max} = \\varepsilon / (r + R_{\\mathrm{prot}}) = ${c.emfV} / (${c.internalResistanceOhm} + ${c.protectiveResistanceOhm}) = ${f3(maxSafe, "A")}$.`],
          },
          {
            partId: "d",
            prompt: "Explain the roles of the protective resistor and opening the switch between readings.",
            marks: 2,
            targetMode: "qualitative",
            targetQuantityKey: "elecPrecautionAnchor",
            expectedAnswer: anchor,
            workingSteps: [
              "Protective resistor prevents excessive current/short-circuiting.",
              "Opening switch between readings stops cell heating and depletion so r and ε stay steady.",
            ],
          },
        ],
        workedSolution: `(a) $r = ${f3(c.internalResistanceOhm, "Ω")}$. (b) $\\varepsilon = ${f3(c.emfV, "V")}$. (c) $I_{\\max} = ${f3(maxSafe, "A")}$. (d) ${anchor}.`,
        markScheme: [
          { code: "M1", criterion: "Uses negative gradient of $V$ against $I$ line.", marks: 1, partId: "a" },
          { code: "A1", criterion: `Internal resistance $r = ${f3(c.internalResistanceOhm, "Ω")}$.`, marks: 1, partId: "a" },
          { code: "M1", criterion: "Substitutes point into $\\varepsilon = V + Ir$.", marks: 1, partId: "b" },
          { code: "A1", criterion: `Emf $\\varepsilon = ${f3(c.emfV, "V")}$.`, marks: 1, partId: "b" },
          { code: "M1", criterion: "Uses total resistance $r + R_{\\mathrm{prot}}$ in $I = \\varepsilon / R_{\\mathrm{total}}$.", marks: 1, partId: "c" },
          { code: "A1", criterion: `Maximum safe current $= ${f3(maxSafe, "A")}$.`, marks: 1, partId: "c" },
          { code: "B1", criterion: "Protective resistor limits current to prevent short-circuit overheating.", marks: 1, partId: "d" },
          { code: "B1", criterion: "Opening switch between readings prevents cell heating/draining so $r$ and $\\varepsilon$ stay constant.", marks: 1, partId: "d" },
        ],
        totalMarks: 8,
        generatorModel: model,
      });
    });
  }

  /* ======================================================================== */
  /*  9. al-prac-rp7-shm-pendulum-spring (14 items: 4 Q, 4 Qual, 4 8m, 2 LoR) */
  /* ======================================================================== */
  {
    const rp7Cases = [
      { slug: "rp7-pend-1", mode: "pendulum" as const, numOscillations: 20, t1S: 32.1, t2S: 31.8, t3S: 32.4, tAnomalyS: 36.8, timingUncS: 0.2, gradT2vsX: 4.04, endOffset: 12 },
      { slug: "rp7-pend-2", mode: "pendulum" as const, numOscillations: 20, t1S: 28.4, t2S: 28.7, t3S: 28.2, tAnomalyS: 24.1, timingUncS: 0.2, gradT2vsX: 3.98, endOffset: 15 },
      { slug: "rp7-spr-1", mode: "mass-spring" as const, numOscillations: 20, t1S: 17.8, t2S: 18.1, t3S: 17.9, tAnomalyS: 14.3, timingUncS: 0.2, gradT2vsX: 1.58, endOffset: 18 },
      { slug: "rp7-spr-2", mode: "mass-spring" as const, numOscillations: 20, t1S: 21.4, t2S: 21.1, t3S: 21.6, tAnomalyS: 25.2, timingUncS: 0.2, gradT2vsX: 1.94, endOffset: 24 },
    ];

    // 4 Quant MCQs (testing anomaly discarding & 4pi^2/grad!)
    rp7Cases.forEach((c, i) => {
      const spec: Record<string, unknown> = {
        kind: "al-prac-rp7-shm-pendulum-spring",
        mode: c.mode,
        numOscillations: c.numOscillations,
        t1S: c.t1S,
        t2S: c.t2S,
        t3S: c.t3S,
        tAnomalyS: c.tAnomalyS,
        timingUncS: c.timingUncS,
        gradT2vsX: c.gradT2vsX,
        endOffset: c.endOffset,
      };
      const q = solveKind("al-prac-rp7-shm-pendulum-spring", spec);
      const periodT = numQ(q, "periodT");
      const gOrK = numQ(q, "gOrK");
      const naiveT = numQ(q, "naiveMeanWithAnomaly") / c.numOscillations;
      const seed = nextSeed();
      const isPend = c.mode === "pendulum";
      const askPeriod = i % 2 === 0;
      const tKey = askPeriod ? "periodT" : "gOrK";
      const truth = askPeriod ? periodT : gOrK;
      const unit = askPeriod ? "s" : isPend ? "m s⁻²" : "N m⁻¹";

      out.push({
        id: makeId(`${c.slug}-qmcq-${i + 1}`),
        conceptId: isPend ? "rp7-shm-pendulum" : "rp7-shm-mass-spring",
        templateArchetype: isPend
          ? "al-prac-rp7-pendulum"
          : "al-prac-rp7-mass-spring",
        seed,
        syllabi: TAG_3_6_1_Y13_NCUK,
        format: "mcq",
        questionStyle: "experimental",
        difficulty: "standard",
        domain: "graphs",
        scenarioSpec: spec,
        hiddenQuantities: [tKey],
        requiredGivens: askPeriod
          ? [
              { name: "numOscillations", value: c.numOscillations, source: "stem" },
              { name: "t1S", value: c.t1S, unit: "s", source: "stem" },
              { name: "t2S", value: c.t2S, unit: "s", source: "stem" },
              { name: "t3S", value: c.t3S, unit: "s", source: "stem" },
              { name: "tAnomalyS", value: c.tAnomalyS, unit: "s", source: "stem" },
            ]
          : [{ name: "gradT2vsX", value: c.gradT2vsX, source: "stem" }],
        questionPlan: {
          targetSummary:
            "Calculate anomaly corrected oscillation period or extract g or spring constant from T squared linear gradient in required practical seven",
        },
        stem: askPeriod
          ? `In Required Practical 7 (${isPend ? "simple pendulum" : "vertical mass-spring oscillator"}), four repeat timings for ${c.numOscillations} complete oscillations are ${c.t1S.toFixed(1)} s, ${c.t2S.toFixed(1)} s, ${c.tAnomalyS.toFixed(1)} s, and ${c.t3S.toFixed(1)} s. After handling any anomalous trial appropriately, what is the best estimate of the time period $T$?`
          : `In Required Practical 7, plotting $T^2$ against ${isPend ? "pendulum length $L$" : "slotted mass $m$"} produces a straight line of gradient ${c.gradT2vsX.toFixed(2)} ${isPend ? "s² m⁻¹" : "s² kg⁻¹"}. Calculate ${isPend ? "the experimental value of $g$" : "the spring constant $k$"}.`,
        options: buildNumOptions(
          truth,
          unit,
          askPeriod
            ? [
                { value: naiveT, rationale: "Includes the anomalous timing in the mean instead of discarding it first." },
                { value: periodT * 2, rationale: "Divides by half the number of oscillations (confuses half-cycles with full cycles)." },
                { value: numQ(q, "meanTN"), rationale: "Forgets to divide mean time for 20 oscillations by N = 20." },
              ]
            : [
                { value: (2 * Math.PI) / c.gradT2vsX, rationale: "Uses 2π instead of 4π² after squaring T = 2π√(...)." },
                { value: c.gradT2vsX / (4 * Math.PI * Math.PI), rationale: "Inverts the relation as gradient / 4π²." },
                { value: 4 * Math.PI * Math.PI * c.gradT2vsX, rationale: "Multiplies by the gradient instead of dividing 4π² by the gradient." },
              ],
          seed,
        ),
        targetMode: "quantitative",
        targetQuantityKey: tKey,
        workedSolution: askPeriod
          ? `Discard the anomalous trial (${c.tAnomalyS.toFixed(1)} s). Mean $T_{20} = (${c.t1S} + ${c.t2S} + ${c.t3S})/3 = ${f3(numQ(q, "meanTN"), "s")}$, giving $T = ${f3(periodT, "s")}$.`
          : `Comparing $T^2 = (4\\pi^2 / ${isPend ? "g" : "k"})${isPend ? "L" : "m"}$ with $y = mx$, ${isPend ? "$g" : "$k"} = 4\\pi^2 / ${c.gradT2vsX.toFixed(2)} = ${f3(gOrK, unit)}$.`,
        markScheme: [
          { code: "A1", criterion: `Correctly determines ${tKey} $= ${f3(truth, unit)}$.`, marks: 1 },
        ],
        totalMarks: 1,
        generatorModel: model,
      });
    });

    // 4 Qualitative MCQs for RP7
    const rp7Quals = [
      {
        slug: "rp7-qual-fiducial",
        idx: 0,
        stem: "In Required Practical 7 (pendulum and mass-spring SHM), why must the fiducial marker be placed at the equilibrium position rather than at maximum amplitude?",
        correct:
          "Place the fiducial marker at equilibrium where speed is maximum discard anomalous timings before averaging and time many oscillations to reduce reaction time uncertainty.",
        distractors: [
          {
            text: "Place the fiducial marker at maximum displacement because the bob momentarily stops, giving zero timing uncertainty.",
            rationale: "At turning points the object moves slowest and lingers, making it hard to judge the exact reversal instant.",
          },
          {
            text: "Place the fiducial marker at equilibrium purely because acceleration is zero there, which stops air damping.",
            rationale: "AQA mark schemes explicitly note 'zero acceleration' is insufficient without stating maximum speed minimizes time uncertainty.",
          },
          {
            text: "Time one single oscillation with a 0.01 s stopwatch because timing 20 oscillations multiplies reaction-time error by 20.",
            rationale: "Reaction-time error Δt occurs only at start/stop, so dividing by N cuts absolute and percentage uncertainty in T by N.",
          },
        ] as const,
      },
      {
        slug: "rp7-qual-pend-angle",
        idx: 1,
        stem: "Which procedural controls ensure simple harmonic motion is genuinely maintained during the simple pendulum part of Required Practical 7?",
        correct:
          "Keep angular amplitude below 10°–15°, measure L to the bob's centre of mass, and place the fiducial marker at equilibrium where speed is maximum discard anomalous timings before averaging and time many oscillations to reduce reaction time uncertainty.",
        distractors: [
          {
            text: "Release the pendulum from 45° so the bob passes equilibrium at higher speed while measuring L to the top of the bob.",
            rationale: "Small-angle approximation sin θ ≈ θ breaks down above ~15°, and measuring to the top of the bob introduces a systematic offset equal to bob radius.",
          },
          {
            text: "Keep all four timing trials including a 4 s anomaly so the average stays statistically unbiased.",
            rationale: "Clear anomalies must always be discarded before calculating the mean.",
          },
          {
            text: "Use a long stretchy rubber band instead of inextensible string so amplitude stays constant.",
            rationale: "Elastic stretching couples vertical oscillations into the pendulum and invalidates constant L.",
          },
        ] as const,
      },
      {
        slug: "rp7-qual-spring-offset",
        idx: 2,
        stem: "When plotting $T^2$ against slotted mass $m$ for a vertical helical spring in RP7, a student obtains a straight line with a small positive vertical intercept. What causes this intercept and how should timing be performed?",
        correct:
          "The effective mass of the oscillating spring and hanger shifts the line upward; for timing, place the fiducial marker at equilibrium where speed is maximum discard anomalous timings before averaging and time many oscillations to reduce reaction time uncertainty.",
        distractors: [
          {
            text: "The positive vertical intercept proves Hooke's law fails for small masses and invalidates the gradient.",
            rationale: "Effective spring mass m_eff adds a constant horizontal shift T² = (4π²/k)(m + m_eff) without altering the gradient 4π²/k.",
          },
          {
            text: "The positive intercept is caused by human reaction time and can be eliminated by taking fewer repeat readings.",
            rationale: "Reaction time is primarily random; the vertical intercept is the physical mass of the spring/hanger.",
          },
          {
            text: "Force the best-fit line through the origin so k is computed accurately.",
            rationale: "Forcing through the origin biases the gradient and ignores the spring's own mass.",
          },
        ] as const,
      },
      {
        slug: "rp7-qual-repeats",
        idx: 3,
        stem: "A student claims repeating timings of 20 oscillations in RP7 eliminates random error completely. Which critique and experimental best practice is accurate?",
        correct:
          "Repeats reduce random error but never eliminate it; students should place the fiducial marker at equilibrium where speed is maximum discard anomalous timings before averaging and time many oscillations to reduce reaction time uncertainty.",
        distractors: [
          {
            text: "Repeats eliminate both random timing errors and systematic stopwatch calibration errors.",
            rationale: "Repeats only reduce random error; they never eliminate random or systematic errors.",
          },
          {
            text: "Timing 20 oscillations eliminates random error completely without needing any repeat trials.",
            rationale: "Multiple repeats are still required to spot anomalies (like miscounting 19 instead of 20 cycles) and reduce random spread.",
          },
          {
            text: "Always count 'one' at the moment the stopwatch starts so 20 full cycles are timed.",
            rationale: "Counting 'one' at t = 0 times only 19 oscillations; always count 'zero' at release/start.",
          },
        ] as const,
      },
    ];

    rp7Quals.forEach((b, i) => {
      const c = rp7Cases[b.idx];
      const spec: Record<string, unknown> = {
        kind: "al-prac-rp7-shm-pendulum-spring",
        mode: c.mode,
        numOscillations: c.numOscillations,
        t1S: c.t1S,
        t2S: c.t2S,
        t3S: c.t3S,
        tAnomalyS: c.tAnomalyS,
        timingUncS: c.timingUncS,
        gradT2vsX: c.gradT2vsX,
        endOffset: c.endOffset,
      };
      const seed = nextSeed();
      out.push({
        id: makeId(`${b.slug}-${i + 1}`),
        conceptId: c.mode === "pendulum" ? "rp7-shm-pendulum" : "rp7-shm-mass-spring",
        templateArchetype: c.mode === "pendulum" ? "al-prac-rp7-pendulum" : "al-prac-rp7-mass-spring",
        seed,
        syllabi: TAG_3_6_1_Y13,
        format: "mcq",
        questionStyle: "qualitative",
        difficulty: "standard",
        domain: "graphs",
        scenarioSpec: spec,
        hiddenQuantities: ["fiducialAnchor"],
        requiredGivens: [],
        questionPlan: {
          targetSummary:
            "Assess fiducial marker placement, anomaly rejection, and effective spring mass interpretation in required practical seven",
        },
        stem: b.stem,
        options: buildVerbalOptions(b.correct, b.distractors, seed),
        targetMode: "qualitative",
        targetQuantityKey: "fiducialAnchor",
        workedSolution: `RP7 mark-scheme precision: ${b.correct}`,
        markScheme: [{ code: "A1", criterion: b.correct, marks: 1 }],
        totalMarks: 1,
        generatorModel: model,
      });
    });

    // 4 Paper 3A Structured 8m Ladders
    rp7Cases.forEach((c, i) => {
      const spec: Record<string, unknown> = {
        kind: "al-prac-rp7-shm-pendulum-spring",
        mode: c.mode,
        numOscillations: c.numOscillations,
        t1S: c.t1S,
        t2S: c.t2S,
        t3S: c.t3S,
        tAnomalyS: c.tAnomalyS,
        timingUncS: c.timingUncS,
        gradT2vsX: c.gradT2vsX,
        endOffset: c.endOffset,
      };
      const q = solveKind("al-prac-rp7-shm-pendulum-spring", spec);
      const periodT = numQ(q, "periodT");
      const pctUncT = numQ(q, "pctUncT");
      const gOrK = numQ(q, "gOrK");
      const anchor = strQ(q, "fiducialAnchor");
      const isPend = c.mode === "pendulum";
      out.push({
        id: makeId(`${c.slug}-p3a-8m-${i + 1}`),
        conceptId: isPend ? "rp7-shm-pendulum" : "rp7-shm-mass-spring",
        templateArchetype: isPend ? "al-prac-rp7-pendulum" : "al-prac-rp7-mass-spring",
        seed: nextSeed(),
        syllabi: TAG_3_6_1_Y13_NCUK,
        format: "structured",
        questionStyle: "mixed-exam",
        difficulty: "standard",
        domain: "graphs",
        scenarioSpec: spec,
        hiddenQuantities: ["periodT", "pctUncT", "gOrK", "fiducialAnchor"],
        requiredGivens: [
          { name: "numOscillations", value: c.numOscillations, source: "stem" },
          { name: "t1S", value: c.t1S, unit: "s", source: "stem" },
          { name: "t2S", value: c.t2S, unit: "s", source: "stem" },
          { name: "t3S", value: c.t3S, unit: "s", source: "stem" },
          { name: "tAnomalyS", value: c.tAnomalyS, unit: "s", source: "stem" },
          { name: "timingUncS", value: c.timingUncS, unit: "s", source: "stem" },
          { name: "gradT2vsX", value: c.gradT2vsX, source: "stem" },
        ],
        questionPlan: {
          targetSummary:
            "Paper three section A required practical seven SHM anomaly rejection, timing uncertainty, gradient extraction, and fiducial marker critique",
        },
        stem: `In Required Practical 7 (${isPend ? "simple pendulum" : "vertical mass-spring system"}), a student records four timings for ${c.numOscillations} complete oscillations: ${c.t1S.toFixed(1)} s, ${c.t2S.toFixed(1)} s, ${c.tAnomalyS.toFixed(1)} s, and ${c.t3S.toFixed(1)} s, with human reaction-time uncertainty $\\pm ${c.timingUncS.toFixed(1)}$ s per total timing. Across six settings, plotting $T^2$ against ${isPend ? "length $L$" : "mass $m$"} gives a straight line of gradient ${c.gradT2vsX.toFixed(2)} ${isPend ? "s² m⁻¹" : "s² kg⁻¹"}.`,
        parts: [
          {
            partId: "a",
            prompt: "Identify the anomalous reading and calculate the mean period $T$.",
            marks: 2,
            targetMode: "quantitative",
            targetQuantityKey: "periodT",
            expectedAnswer: f3(periodT, "s"),
            workingSteps: [
              `Discard anomaly ${c.tAnomalyS.toFixed(1)} s.`,
              `$T_{20} = (${c.t1S} + ${c.t2S} + ${c.t3S})/3 = ${f3(numQ(q, "meanTN"), "s")}$, $T = ${f3(periodT, "s")}$.`,
            ],
          },
          {
            partId: "b",
            prompt: "Calculate the percentage uncertainty in $T$ due to the $\\pm 0.2$ s reaction-time uncertainty.",
            marks: 2,
            dependsOnPartIds: ["a"],
            targetMode: "quantitative",
            targetQuantityKey: "pctUncT",
            expectedAnswer: f3(pctUncT, "%"),
            workingSteps: [`$\\%\\Delta T = (${c.timingUncS} / ${f3(numQ(q, "meanTN"))}) \\times 100\\% = ${f3(pctUncT, "%")}$.`],
          },
          {
            partId: "c",
            prompt: `Use the graph gradient to determine ${isPend ? "$g$" : "the spring constant $k$"}.`,
            marks: 2,
            targetMode: "quantitative",
            targetQuantityKey: "gOrK",
            expectedAnswer: f3(gOrK, isPend ? "m s⁻²" : "N m⁻¹"),
            workingSteps: [`${isPend ? "$g$" : "$k$"} $= 4\\pi^2 / ${c.gradT2vsX.toFixed(2)} = ${f3(gOrK, isPend ? "m s⁻²" : "N m⁻¹")}$.`],
          },
          {
            partId: "d",
            prompt: "Explain why a fiducial marker is placed at equilibrium and why timing 20 oscillations improves precision.",
            marks: 2,
            targetMode: "qualitative",
            targetQuantityKey: "fiducialAnchor",
            expectedAnswer: anchor,
            workingSteps: [
              "Maximum speed at equilibrium gives the sharpest transit instant and lowest timing error.",
              "Dividing reaction-time uncertainty by 20 cuts percentage uncertainty in T twentyfold.",
            ],
          },
        ],
        workedSolution: `(a) Discard ${c.tAnomalyS} s; $T = ${f3(periodT, "s")}$. (b) $\\%\\Delta T = ${f3(pctUncT, "%")}$. (c) ${isPend ? "$g$" : "$k$"} $= 4\\pi^2 / ${c.gradT2vsX} = ${f3(gOrK, isPend ? "m s⁻²" : "N m⁻¹")}$. (d) ${anchor}.`,
        markScheme: [
          { code: "M1", criterion: `Identifies and discards anomaly (${c.tAnomalyS.toFixed(1)} s) before averaging.`, marks: 1, partId: "a" },
          { code: "A1", criterion: `Mean period $T = ${f3(periodT, "s")}$.`, marks: 1, partId: "a" },
          { code: "M1", criterion: "Uses $\\Delta T_{20} / T_{20} \\times 100\\%$.", marks: 1, partId: "b" },
          { code: "A1", criterion: `Percentage uncertainty in $T = ${f3(pctUncT, "%")}$.`, marks: 1, partId: "b" },
          { code: "M1", criterion: `Equates gradient to $4\\pi^2 / ${isPend ? "g" : "k"}$.`, marks: 1, partId: "c" },
          { code: "A1", criterion: `${isPend ? "$g$" : "$k$"} $= ${f3(gOrK, isPend ? "m s⁻²" : "N m⁻¹")}$.`, marks: 1, partId: "c" },
          { code: "B1", criterion: "Fiducial marker at equilibrium where oscillator moves fastest (minimising transit-time uncertainty).", marks: 1, partId: "d" },
          { code: "B1", criterion: "Timing 20 oscillations divides fixed human reaction-time error by 20.", marks: 1, partId: "d" },
        ],
        totalMarks: 8,
        generatorModel: model,
      });
    });

    // 2 Authentic 6-Mark Experimental LoRs for RP7 (1 pendulum, 1 mass-spring)
    [
      {
        slug: "rp7-lor-pendulum",
        idx: 0,
        stem: "A Year 13 student plans to determine the acceleration of free fall $g$ accurately using a simple pendulum suspended from a split-cork clamp.",
        prompt:
          "Describe a complete experimental procedure to determine $g$ graphically from simple harmonic oscillations, detailing apparatus setup, timing precision, control of assumptions, and graphical analysis. [6 marks]",
        expectedTail:
          "measure length L from the underside of the split cork to the centre of mass of the bob, keep angular displacement below 10°–15°, repeat timings for at least six lengths, plot T² against L, and obtain g = 4π² / gradient.",
        criteria: [
          "Suspends dense small bob via inextensible string clamped tightly in a split cork and measures L from pivot to centre of mass of bob.",
          "Keeps oscillation angle small (< 10°–15°) in a single vertical plane so SHM approximation sin θ ≈ θ holds.",
          "Places a fiducial marker directly behind the equilibrium position where bob speed is maximum (reject 'zero acceleration' alone).",
          "Counts 'zero' at start, times 10–20 complete oscillations, takes >= 3 repeat timings per length, and discards anomalies before averaging.",
          "Repeats for at least six different lengths L across a wide range and tabulates L, mean T, and T².",
          "Plots T² against L (best-fit straight line through origin), measures gradient using a > 50% triangle, and computes g = 4π² / gradient.",
        ] as const,
      },
      {
        slug: "rp7-lor-mass-spring",
        idx: 2,
        stem: "A physics student investigates the simple harmonic motion of a vertical helical steel spring loaded with slotted masses to determine its spring constant $k$ and effective spring mass.",
        prompt:
          "Plan a safe, high-precision practical investigation to determine $k$ using a graphical method, covering setup, timing technique, safety, error reduction, and interpretation of the graph's gradient and intercept. [6 marks]",
        expectedTail:
          "clamp the retort stand firmly with a G-clamp/counterweight and wear safety goggles, restrict oscillations to small vertical amplitudes within the elastic limit, plot T² against slotted mass m, obtain k = 4π² / gradient, and interpret the non-zero intercept as the effective mass of the spring and hanger.",
        criteria: [
          "Secures retort stand with a G-clamp/counterweight, places a sand tray/pad underneath, and wears safety goggles in case the spring detaches.",
          "Keeps oscillations strictly vertical with small amplitude within the elastic limit so coils never collide or go slack.",
          "Positions a horizontal fiducial marker at the equilibrium position where mass speed is maximum.",
          "Times 10–20 complete oscillations (starting count at zero), repeats >= 3 times per mass, and discards anomalies before averaging T.",
          "Repeats for at least six different total slotted masses m and plots T² against m.",
          "Extracts k = 4π² / gradient from a > 50% gradient triangle and identifies the small vertical/negative horizontal intercept with effective spring/hanger mass.",
        ] as const,
      },
    ].forEach((lor, idx) => {
      const c = rp7Cases[lor.idx];
      const spec: Record<string, unknown> = {
        kind: "al-prac-rp7-shm-pendulum-spring",
        mode: c.mode,
        numOscillations: c.numOscillations,
        t1S: c.t1S,
        t2S: c.t2S,
        t3S: c.t3S,
        tAnomalyS: c.tAnomalyS,
        timingUncS: c.timingUncS,
        gradT2vsX: c.gradT2vsX,
        endOffset: c.endOffset,
      };
      const anchor = strQ(solveKind("al-prac-rp7-shm-pendulum-spring", spec), "fiducialAnchor");
      out.push(
        buildExperimentalLor6m({
          id: makeId(`${lor.slug}-6m-${idx + 1}`),
          seed: nextSeed(),
          model,
          domain: "graphs",
          conceptId: c.mode === "pendulum" ? "rp7-shm-pendulum" : "rp7-shm-mass-spring",
          templateArchetype: "al-prac-rp7-lor",
          syllabi: TAG_3_6_1_Y13,
          difficulty: "higher",
          scenarioSpec: spec,
          anchorKey: "fiducialAnchor",
          anchorText: anchor,
          requiredGivens: [],
          stem: lor.stem,
          prompt: lor.prompt,
          expectedAnswer: `${anchor}; ${lor.expectedTail}`,
          workingSteps: [
            "Level 1: Rigid setup, safety/small-angle controls, and correct independent/dependent variables.",
            "Level 2: Equilibrium fiducial marker (max speed), timing 20 oscillations with zero start, repeats & anomaly rejection.",
            "Level 3: Wide range (>= 6 points), T² linearization, 4π²/gradient extraction, and systematic offset interpretation.",
          ],
          workedSolution: `Level 3 Model Response: ${anchor}. In addition, ${lor.expectedTail}`,
          criteria: lor.criteria,
          targetSummary:
            "Six mark level of response experimental method for required practical seven simple harmonic motion",
        }),
      );
    });
  }

  /* ======================================================================== */
  /*  10. al-prac-rp8-boyle-charles (14 items: 4 Q, 4 Qual, 4 9m, 2 6m LoRs)  */
  /* ======================================================================== */
  {
    const boyleCases = [
      { slug: "rp8-boyle-1", p1KPa: 104, v1Cm3: 42.0, p2KPa: 182, deadVolCm3: 2.0 },
      { slug: "rp8-boyle-2", p1KPa: 112, v1Cm3: 36.0, p2KPa: 210, deadVolCm3: 1.5 },
    ];
    const charlesCases = [
      { slug: "rp8-charles-1", theta1C: 18, length1Mm: 112.0, theta2C: 82, length2Mm: 136.8 },
      { slug: "rp8-charles-2", theta1C: 15, length1Mm: 104.0, theta2C: 85, length2Mm: 129.2 },
    ];

    // 2 Boyle Q-MCQs + 2 Charles Q-MCQs
    boyleCases.forEach((c, i) => {
      const spec: Record<string, unknown> = {
        kind: "al-prac-rp8-boyle-charles",
        mode: "boyle",
        p1KPa: c.p1KPa,
        v1Cm3: c.v1Cm3,
        p2KPa: c.p2KPa,
        deadVolCm3: c.deadVolCm3,
      };
      const q = solveKind("al-prac-rp8-boyle-charles", spec);
      const pvJ = numQ(q, "pVConstJ");
      const v2 = numQ(q, "v2Cm3");
      const seed = nextSeed();
      const askV2 = i === 1;
      const tKey = askV2 ? "v2Cm3" : "pVConstJ";
      const truth = askV2 ? v2 : pvJ;
      const unit = askV2 ? "cm³" : "J";
      out.push({
        id: makeId(`${c.slug}-qmcq-${i + 1}`),
        conceptId: "rp8-boyles-law-isothermal",
        templateArchetype: "al-prac-rp8-boyle",
        seed,
        syllabi: TAG_3_6_2_Y13,
        format: "mcq",
        questionStyle: "experimental",
        difficulty: "standard",
        domain: "thermal",
        scenarioSpec: spec,
        hiddenQuantities: [tKey],
        requiredGivens: [
          { name: "p1KPa", value: c.p1KPa, unit: "kPa", source: "stem" },
          { name: "v1Cm3", value: c.v1Cm3, source: "stem" },
          { name: "deadVolCm3", value: c.deadVolCm3, source: "stem" },
          ...(askV2 ? [{ name: "p2KPa", value: c.p2KPa, unit: "kPa", source: "stem" as const }] : []),
        ],
        questionPlan: {
          targetSummary:
            "Calculate isothermal pressure volume constant or compressed air volume with tubing dead volume in required practical eight boyle law",
        },
        stem: askV2
          ? `In Required Practical 8 (Boyle's law), dry air is trapped in a graduated tube above oil with a connecting dead volume $V_0 = ${c.deadVolCm3.toFixed(1)}$ cm³. At gauge-corrected absolute pressure $p_1 = ${c.p1KPa}$ kPa, the graduated scale reads $V_1 = ${c.v1Cm3.toFixed(1)}$ cm³. After compressing slowly to $p_2 = ${c.p2KPa}$ kPa at constant temperature, what graduated volume $V_2$ is read?`
          : `During a Boyle's law investigation (RP8), trapped dry air sits in a graduated column of reading ${c.v1Cm3.toFixed(1)} cm³ plus an ungraduated Bourdon-tube dead volume of ${c.deadVolCm3.toFixed(1)} cm³ at absolute pressure ${c.p1KPa} kPa. Calculate the isothermal constant $pV_{\\mathrm{total}}$ in joules.`,
        options: buildNumOptions(
          truth,
          unit,
          askV2
            ? [
                { value: (c.p1KPa * c.v1Cm3) / c.p2KPa, rationale: "Ignores dead volume V₀ when applying p₁V₁ = p₂V₂." },
                { value: v2 + c.deadVolCm3, rationale: "Reports total volume (V₂ + V₀) instead of the graduated tube reading V₂." },
                { value: (c.p2KPa * (c.v1Cm3 + c.deadVolCm3)) / c.p1KPa, rationale: "Multiplies by p₂/p₁ instead of p₁/p₂." },
              ]
            : [
                { value: c.p1KPa * c.v1Cm3 * 1e-3, rationale: "Omits the dead volume V₀ from V_total." },
                { value: pvJ * 1e3, rationale: "Forgets the 10⁻³ conversion from kPa cm³ to Pa m³ (J)." },
                { value: pvJ * 1e-3, rationale: "Applies an erroneous 10⁻⁶ factor instead of 10⁻³." },
              ],
          seed,
        ),
        targetMode: "quantitative",
        targetQuantityKey: tKey,
        workedSolution: `Total initial volume $V_{\\mathrm{total}} = ${c.v1Cm3} + ${c.deadVolCm3} = ${(c.v1Cm3 + c.deadVolCm3).toFixed(1)}$ cm³. Thus $pV = ${c.p1KPa}\\times 10^3 \\times ${(c.v1Cm3 + c.deadVolCm3).toFixed(1)}\\times 10^{-6} = ${f3(pvJ, "J")}$, and at ${c.p2KPa} kPa the tube reads $V_2 = ${f3(v2, "cm³")}$.`,
        markScheme: [
          { code: "A1", criterion: `Correctly evaluates ${tKey} $= ${f3(truth, unit)}$.`, marks: 1 },
        ],
        totalMarks: 1,
        generatorModel: model,
      });
    });

    charlesCases.forEach((c, i) => {
      const spec: Record<string, unknown> = {
        kind: "al-prac-rp8-boyle-charles",
        mode: "charles",
        theta1C: c.theta1C,
        length1Mm: c.length1Mm,
        theta2C: c.theta2C,
        length2Mm: c.length2Mm,
      };
      const q = solveKind("al-prac-rp8-boyle-charles", spec);
      const grad = numQ(q, "gradLvsTheta");
      const absZero = numQ(q, "absZeroC");
      const seed = nextSeed();
      const askGrad = i === 1;
      const tKey = askGrad ? "gradLvsTheta" : "absZeroC";
      const truth = askGrad ? grad : absZero;
      const unit = askGrad ? "mm °C⁻¹" : "°C";
      out.push({
        id: makeId(`${c.slug}-qmcq-${i + 3}`),
        conceptId: "rp8-charles-law-absolute-zero",
        templateArchetype: "al-prac-rp8-charles",
        seed,
        syllabi: TAG_3_6_2_Y13,
        format: "mcq",
        questionStyle: "experimental",
        difficulty: "standard",
        domain: "thermal",
        scenarioSpec: spec,
        hiddenQuantities: [tKey],
        requiredGivens: [
          { name: "theta1C", value: c.theta1C, source: "stem" },
          { name: "length1Mm", value: c.length1Mm, unit: "mm", source: "stem" },
          { name: "theta2C", value: c.theta2C, source: "stem" },
          { name: "length2Mm", value: c.length2Mm, unit: "mm", source: "stem" },
        ],
        questionPlan: {
          targetSummary:
            "Extrapolate absolute zero or calculate expansion gradient from Charles law capillary water bath measurements in required practical eight",
        },
        stem: askGrad
          ? `In Required Practical 8 (Charles's law), a dry air column trapped by a concentrated sulfuric acid bead in a uniform capillary tube has length ${c.length1Mm.toFixed(1)} mm at ${c.theta1C} °C and ${c.length2Mm.toFixed(1)} mm at ${c.theta2C} °C. Calculate the gradient of the $L$ against $\\theta$ graph.`
          : `In a Charles's law water-bath investigation (RP8), the trapped air column in a uniform capillary tube measures ${c.length1Mm.toFixed(1)} mm at ${c.theta1C} °C and ${c.length2Mm.toFixed(1)} mm at ${c.theta2C} °C. By linear extrapolation to zero length, determine the experimental value of absolute zero in °C.`,
        options: buildNumOptions(
          truth,
          unit,
          askGrad
            ? [
                { value: (c.theta2C - c.theta1C) / (c.length2Mm - c.length1Mm), rationale: "Inverts gradient as Δθ / ΔL." },
                { value: c.length2Mm / c.theta2C, rationale: "Assumes length is proportional to Celsius temperature through (0 °C, 0 mm)." },
                { value: (c.length2Mm - c.length1Mm) / (c.theta2C + c.theta1C), rationale: "Adds the two temperatures instead of taking Δθ." },
              ]
            : [
                { value: -(c.length1Mm / grad), rationale: "Evaluates −L₁/m without adding θ₁ (ignores that L₁ was measured at θ₁ °C, not 0 °C)." },
                { value: -(c.length2Mm / grad), rationale: "Uses −L₂/m without shifting by θ₂." },
                { value: absZero * 0.82, rationale: "Underestimates extrapolation distance along the negative temperature axis." },
              ],
          seed,
        ),
        targetMode: "quantitative",
        targetQuantityKey: tKey,
        workedSolution: `Gradient $m = (${c.length2Mm} - ${c.length1Mm})/(${c.theta2C} - ${c.theta1C}) = ${f3(grad, "mm °C⁻¹")}$. Setting $L = 0$ in $L - L_1 = m(\\theta - \\theta_1)$ gives $\\theta_0 = ${c.theta1C} - ${c.length1Mm}/${f3(grad)} = ${f3(absZero, "°C")}$.`,
        markScheme: [
          { code: "A1", criterion: `Correctly determines ${tKey} $= ${f3(truth, unit)}$.`, marks: 1 },
        ],
        totalMarks: 1,
        generatorModel: model,
      });
    });

    // 4 Qualitative MCQs for RP8
    const rp8Quals = [
      {
        slug: "rp8-qual-boyle-slow",
        spec: { kind: "al-prac-rp8-boyle-charles", mode: "boyle", p1KPa: 104, v1Cm3: 42.0, p2KPa: 182, deadVolCm3: 2.0 },
        archetype: "al-prac-rp8-boyle",
        conceptId: "rp8-boyles-law-isothermal",
        stem: "During the Boyle's law investigation (RP8), why must the student compress the oil column slowly and pause before reading the pressure gauge and volume scale?",
        correct:
          "Change the pressure slowly and wait for thermal equilibrium so the trapped air temperature remains constant and isothermal boyle behaviour holds.",
        distractors: [
          {
            text: "Compressing rapidly prevents heat leaving the air so the process remains isothermal.",
            rationale: "Rapid compression heats the gas (adiabatic compression), causing pV to increase above the isothermal constant.",
          },
          {
            text: "Pausing allows air to dissolve into the oil so total mass of gas stays constant.",
            rationale: "Fixed mass of gas requires no leakage or dissolution; pausing simply restores room temperature.",
          },
          {
            text: "Slow compression ensures the oil meniscus turns flat, eliminating all parallax error.",
            rationale: "The oil meniscus curvature is due to surface tension; parallax is avoided by reading at eye level.",
          },
        ] as const,
      },
      {
        slug: "rp8-qual-boyle-deadvol",
        spec: { kind: "al-prac-rp8-boyle-charles", mode: "boyle", p1KPa: 112, v1Cm3: 36.0, p2KPa: 210, deadVolCm3: 1.5 },
        archetype: "al-prac-rp8-boyle",
        conceptId: "rp8-boyles-law-isothermal",
        stem: "In a Boyle's law experiment where a syringe connects to a pressure sensor via rubber tubing of unknown dead volume $V_0$, how does plotting $1/p$ against syringe volume $V$ reveal $V_0$ while maintaining isothermal conditions?",
        correct:
          "The linear graph 1/p vs V intercepts the volume axis at −V₀; during measurements, students must change the pressure slowly and wait for thermal equilibrium so the trapped air temperature remains constant and isothermal boyle behaviour holds.",
        distractors: [
          {
            text: "Plotting p against 1/V still gives a perfectly straight line through the origin regardless of tubing dead volume.",
            rationale: "Because p(V + V₀) = const, p vs 1/V curves downward if V₀ is omitted, whereas 1/p = (V + V₀)/C stays linear.",
          },
          {
            text: "Dead volume doubles the slope of the 1/p against V graph.",
            rationale: "Dead volume shifts the line horizontally by V₀ without changing the slope 1/(nRT).",
          },
          {
            text: "Dead volume can be eliminated by taking rapid readings while warming the syringe by hand.",
            rationale: "Hand warmth raises gas temperature T and breaks Boyle's law.",
          },
        ] as const,
      },
      {
        slug: "rp8-qual-charles-acid",
        spec: { kind: "al-prac-rp8-boyle-charles", mode: "charles", theta1C: 18, length1Mm: 112.0, theta2C: 82, length2Mm: 136.8 },
        archetype: "al-prac-rp8-charles",
        conceptId: "rp8-charles-law-absolute-zero",
        stem: "In the Charles's law water-bath capillary experiment (RP8), what dual physical purpose does the drop of concentrated sulfuric acid ($\\mathrm{H_2SO_4}$) serve, and why is the water bath stirred continuously?",
        correct:
          "The concentrated sulfuric acid bead traps dry air at constant atmospheric pressure and absorbs water vapour while stirring the water bath keeps temperature uniform.",
        distractors: [
          {
            text: "The sulfuric acid heats the trapped air chemically so a Bunsen burner is unnecessary.",
            rationale: "Concentrated H₂SO₄ is a hygroscopic drying agent and movable constant-pressure index seal, not a heat source.",
          },
          {
            text: "The acid bead keeps the air volume constant while pressure rises with temperature.",
            rationale: "The bead slides freely inside the open-topped capillary tube, maintaining constant atmospheric pressure as volume changes.",
          },
          {
            text: "Stirring is unnecessary because water is a rapid thermal conductor with zero convection stratification.",
            rationale: "Water is a poor conductor and stratifies strongly; thorough stirring ensures the thermometer matches the capillary air temperature.",
          },
        ] as const,
      },
      {
        slug: "rp8-qual-charles-extrap",
        spec: { kind: "al-prac-rp8-boyle-charles", mode: "charles", theta1C: 15, length1Mm: 104.0, theta2C: 85, length2Mm: 129.2 },
        archetype: "al-prac-rp8-charles",
        conceptId: "rp8-charles-law-absolute-zero",
        stem: "Why can the trapped air column length $L$ be plotted directly instead of volume $V$ in Charles's law (RP8), and which chemical/thermal controls validate the absolute-zero extrapolation?",
        correct:
          "Uniform capillary bore makes V ∝ L; additionally, the concentrated sulfuric acid bead traps dry air at constant atmospheric pressure and absorbs water vapour while stirring the water bath keeps temperature uniform.",
        distractors: [
          {
            text: "Because air remains an ideal gas right down to −273 °C without liquefying.",
            rationale: "Real air liquefies around −196 °C, so absolute zero must be obtained by linear extrapolation from room-to-hot water temperatures.",
          },
          {
            text: "Because water vapour increases the accuracy of Charles's law by boosting gas pressure at high temperatures.",
            rationale: "Water vapour changes saturation vapour pressure nonlinearly with temperature, spoiling linearity; hence H₂SO₄ dries the air.",
          },
          {
            text: "Because any tapered glass tube has volume proportional to length.",
            rationale: "Proportionality V = A L requires a uniform internal cross-sectional area A.",
          },
        ] as const,
      },
    ];

    rp8Quals.forEach((b, i) => {
      const seed = nextSeed();
      out.push({
        id: makeId(`${b.slug}-${i + 1}`),
        conceptId: b.conceptId,
        templateArchetype: b.archetype,
        seed,
        syllabi: TAG_3_6_2_Y13,
        format: "mcq",
        questionStyle: "qualitative",
        difficulty: "standard",
        domain: "thermal",
        scenarioSpec: b.spec,
        hiddenQuantities: ["gasLawAnchor"],
        requiredGivens: [],
        questionPlan: {
          targetSummary:
            "Assess isothermal equilibration, dead volume analysis, concentrated sulfuric acid function, and bath stirring in required practical eight",
        },
        stem: b.stem,
        options: buildVerbalOptions(b.correct, b.distractors, seed),
        targetMode: "qualitative",
        targetQuantityKey: "gasLawAnchor",
        workedSolution: `RP8 mark-scheme precision: ${b.correct}`,
        markScheme: [{ code: "A1", criterion: b.correct, marks: 1 }],
        totalMarks: 1,
        generatorModel: model,
      });
    });

    // 4 Paper 3A Structured 9m Ladders (2 Boyle, 2 Charles)
    boyleCases.forEach((c, i) => {
      const spec: Record<string, unknown> = {
        kind: "al-prac-rp8-boyle-charles",
        mode: "boyle",
        p1KPa: c.p1KPa,
        v1Cm3: c.v1Cm3,
        p2KPa: c.p2KPa,
        deadVolCm3: c.deadVolCm3,
      };
      const q = solveKind("al-prac-rp8-boyle-charles", spec);
      const pvKPaCm3 = numQ(q, "pVConstKPaCm3");
      const pvJ = numQ(q, "pVConstJ");
      const v2 = numQ(q, "v2Cm3");
      const anchor = strQ(q, "gasLawAnchor");
      out.push({
        id: makeId(`${c.slug}-p3a-9m-${i + 1}`),
        conceptId: "rp8-boyles-law-isothermal",
        templateArchetype: "al-prac-rp8-boyle",
        seed: nextSeed(),
        syllabi: TAG_3_6_2_Y13,
        format: "structured",
        questionStyle: "mixed-exam",
        difficulty: "higher",
        domain: "thermal",
        scenarioSpec: spec,
        hiddenQuantities: ["pVConstKPaCm3", "pVConstJ", "v2Cm3", "gasLawAnchor"],
        requiredGivens: [
          { name: "p1KPa", value: c.p1KPa, unit: "kPa", source: "stem" },
          { name: "v1Cm3", value: c.v1Cm3, source: "stem" },
          { name: "p2KPa", value: c.p2KPa, unit: "kPa", source: "stem" },
          { name: "deadVolCm3", value: c.deadVolCm3, source: "stem" },
        ],
        questionPlan: {
          targetSummary:
            "Paper three section A required practical eight boyle law isothermal constant, SI conversion, compressed volume, and dead volume thermal evaluation",
        },
        stem: `In Required Practical 8, dry air is trapped above an oil column attached to a Bourdon gauge with ungraduated dead volume $V_0 = ${c.deadVolCm3.toFixed(1)}$ cm³. At absolute pressure $p_1 = ${c.p1KPa}$ kPa, the graduated scale reads $V_1 = ${c.v1Cm3.toFixed(1)}$ cm³. The pressure is then slowly raised to $p_2 = ${c.p2KPa}$ kPa at constant room temperature.`,
        parts: [
          {
            partId: "a",
            prompt: "Calculate the isothermal constant $p(V + V_0)$ in kPa cm³.",
            marks: 2,
            targetMode: "quantitative",
            targetQuantityKey: "pVConstKPaCm3",
            expectedAnswer: f3(pvKPaCm3, "kPa cm³"),
            workingSteps: [`$p_1(V_1 + V_0) = ${c.p1KPa} \\times (${c.v1Cm3} + ${c.deadVolCm3}) = ${f3(pvKPaCm3, "kPa cm³")}$.`],
          },
          {
            partId: "b",
            prompt: "Convert this product $pV_{\\mathrm{total}}$ into SI base-derived units (J).",
            marks: 2,
            dependsOnPartIds: ["a"],
            targetMode: "quantitative",
            targetQuantityKey: "pVConstJ",
            expectedAnswer: f3(pvJ, "J"),
            workingSteps: [`$1\\text{ kPa cm}^3 = 10^3\\text{ Pa}\\times 10^{-6}\\text{ m}^3 = 10^{-3}\\text{ J}$, so $pV = ${f3(pvJ, "J")}$.`],
          },
          {
            partId: "c",
            prompt: `Predict the graduated scale reading $V_2$ at $p_2 = ${c.p2KPa}$ kPa.`,
            marks: 2,
            dependsOnPartIds: ["a"],
            targetMode: "quantitative",
            targetQuantityKey: "v2Cm3",
            expectedAnswer: f3(v2, "cm³"),
            workingSteps: [
              `$V_2 + V_0 = ${f3(pvKPaCm3)} / ${c.p2KPa} = ${f3(v2 + c.deadVolCm3)}$ cm³.`,
              `$V_2 = ${f3(v2 + c.deadVolCm3)} - ${c.deadVolCm3} = ${f3(v2, "cm³")}$.`,
            ],
          },
          {
            partId: "d",
            prompt: "Explain why pressure must be changed slowly with pauses before reading, and how plotting $1/p$ against $V$ determines $V_0$ graphically.",
            marks: 3,
            targetMode: "qualitative",
            targetQuantityKey: "gasLawAnchor",
            expectedAnswer: `${anchor}; plotting 1/p against V produces a straight line whose negative horizontal intercept equals −V₀.`,
            workingSteps: [
              "Work done compressing gas warms it; waiting lets heat transfer out to restore room temperature.",
              "Rearranging p(V + V₀) = C gives 1/p = V/C + V₀/C, which cuts the V-axis at −V₀.",
            ],
          },
        ],
        workedSolution: `(a) $p(V+V_0) = ${f3(pvKPaCm3, "kPa cm³")}$. (b) In SI: ${f3(pvJ, "J")}. (c) $V_2 = ${f3(v2, "cm³")}$. (d) ${anchor}; plotting $1/p$ vs $V$ reveals $-V_0$ at $1/p = 0$.`,
        markScheme: [
          { code: "M1", criterion: "Adds dead volume $V_0$ to $V_1$ before multiplying by $p_1$.", marks: 1, partId: "a" },
          { code: "A1", criterion: `$p(V+V_0) = ${f3(pvKPaCm3, "kPa cm³")}$.`, marks: 1, partId: "a" },
          { code: "M1", criterion: "Applies $10^3 \\times 10^{-6} = 10^{-3}$ unit conversion.", marks: 1, partId: "b" },
          { code: "A1", criterion: `$pV_{\\mathrm{total}} = ${f3(pvJ, "J")}$.`, marks: 1, partId: "b" },
          { code: "M1", criterion: "Divides constant by $p_2$ and subtracts $V_0$.", marks: 1, partId: "c" },
          { code: "A1", criterion: `Scale reading $V_2 = ${f3(v2, "cm³")}$.`, marks: 1, partId: "c" },
          { code: "B1", criterion: "Rapid compression heats gas; pausing allows thermal equilibrium at constant $T$.", marks: 1, partId: "d" },
          { code: "B1", criterion: "States isothermal condition $pV = \\text{const}$ requires fixed temperature and fixed mass.", marks: 1, partId: "d" },
          { code: "B1", criterion: "Plotting $1/p$ vs $V$ stays linear with x-intercept at $-V_0$.", marks: 1, partId: "d" },
        ],
        totalMarks: 9,
        generatorModel: model,
      });
    });

    charlesCases.forEach((c, i) => {
      const spec: Record<string, unknown> = {
        kind: "al-prac-rp8-boyle-charles",
        mode: "charles",
        theta1C: c.theta1C,
        length1Mm: c.length1Mm,
        theta2C: c.theta2C,
        length2Mm: c.length2Mm,
      };
      const q = solveKind("al-prac-rp8-boyle-charles", spec);
      const grad = numQ(q, "gradLvsTheta");
      const l0 = numQ(q, "lengthAt0CMm");
      const absZero = numQ(q, "absZeroC");
      const anchor = strQ(q, "gasLawAnchor");
      out.push({
        id: makeId(`${c.slug}-p3a-9m-${i + 3}`),
        conceptId: "rp8-charles-law-absolute-zero",
        templateArchetype: "al-prac-rp8-charles",
        seed: nextSeed(),
        syllabi: TAG_3_6_2_Y13,
        format: "structured",
        questionStyle: "mixed-exam",
        difficulty: "higher",
        domain: "thermal",
        scenarioSpec: spec,
        hiddenQuantities: ["gradLvsTheta", "lengthAt0CMm", "absZeroC", "gasLawAnchor"],
        requiredGivens: [
          { name: "theta1C", value: c.theta1C, source: "stem" },
          { name: "length1Mm", value: c.length1Mm, unit: "mm", source: "stem" },
          { name: "theta2C", value: c.theta2C, source: "stem" },
          { name: "length2Mm", value: c.length2Mm, unit: "mm", source: "stem" },
        ],
        questionPlan: {
          targetSummary:
            "Paper three section A required practical eight charles law expansion gradient, zero Celsius intercept, absolute zero extrapolation, and acid bead precautions",
        },
        stem: `In Required Practical 8 (Charles's law), a dry air sample trapped by a concentrated sulfuric acid bead inside a uniform vertical capillary tube is heated in a water bath. Two points on the best-fit straight line of air column length $L$ against temperature $\\theta$ are $(${c.theta1C}\\ ^\\circ\\text{C}, ${c.length1Mm.toFixed(1)}\\text{ mm})$ and $(${c.theta2C}\\ ^\\circ\\text{C}, ${c.length2Mm.toFixed(1)}\\text{ mm})$.`,
        parts: [
          {
            partId: "a",
            prompt: "Calculate the gradient $m$ of the $L$ against $\\theta$ line.",
            marks: 2,
            targetMode: "quantitative",
            targetQuantityKey: "gradLvsTheta",
            expectedAnswer: f3(grad, "mm °C⁻¹"),
            workingSteps: [`$m = (${c.length2Mm} - ${c.length1Mm})/(${c.theta2C} - ${c.theta1C}) = ${f3(grad, "mm °C⁻¹")}$.`],
          },
          {
            partId: "b",
            prompt: "Determine the air column length $L_0$ at $0\\ ^\\circ\\text{C}$.",
            marks: 2,
            dependsOnPartIds: ["a"],
            targetMode: "quantitative",
            targetQuantityKey: "lengthAt0CMm",
            expectedAnswer: f3(l0, "mm"),
            workingSteps: [`$L_0 = ${c.length1Mm} - (${f3(grad)})(${c.theta1C}) = ${f3(l0, "mm")}$.`],
          },
          {
            partId: "c",
            prompt: "Hence extrapolate the experimental value of absolute zero in °C.",
            marks: 2,
            dependsOnPartIds: ["a", "b"],
            targetMode: "quantitative",
            targetQuantityKey: "absZeroC",
            expectedAnswer: f3(absZero, "°C"),
            workingSteps: [`Set $L = 0$: $\\theta_{\\mathrm{abs}} = -L_0 / m = -${f3(l0)} / ${f3(grad)} = ${f3(absZero, "°C")}$.`],
          },
          {
            partId: "d",
            prompt: "Explain the dual role of the concentrated sulfuric acid bead and why continuous stirring is essential.",
            marks: 3,
            targetMode: "qualitative",
            targetQuantityKey: "gasLawAnchor",
            expectedAnswer: anchor,
            workingSteps: [
              "Acid bead slides freely to keep trapped air at constant atmospheric pressure.",
              "Concentrated H₂SO₄ dries the air by absorbing water vapour.",
              "Stirring prevents thermal stratification so thermometer matches trapped air temperature.",
            ],
          },
        ],
        workedSolution: `(a) $m = ${f3(grad, "mm °C⁻¹")}$. (b) $L_0 = ${f3(l0, "mm")}$. (c) Absolute zero $= ${f3(absZero, "°C")}$. (d) ${anchor}.`,
        markScheme: [
          { code: "M1", criterion: "Evaluates $\\Delta L / \\Delta\\theta$.", marks: 1, partId: "a" },
          { code: "A1", criterion: `Gradient $m = ${f3(grad, "mm °C⁻¹")}$.`, marks: 1, partId: "a" },
          { code: "M1", criterion: "Substitutes into $L_0 = L_1 - m\\theta_1$.", marks: 1, partId: "b" },
          { code: "A1", criterion: `Length at 0 °C $= ${f3(l0, "mm")}$.`, marks: 1, partId: "b" },
          { code: "M1", criterion: "Sets $L = 0$ to solve $\\theta = -L_0 / m$.", marks: 1, partId: "c" },
          { code: "A1", criterion: `Extrapolated absolute zero $= ${f3(absZero, "°C")}$.`, marks: 1, partId: "c" },
          { code: "B1", criterion: "Bead traps fixed mass of air at constant atmospheric pressure.", marks: 1, partId: "d" },
          { code: "B1", criterion: "Concentrated sulfuric acid absorbs water vapour / keeps air dry.", marks: 1, partId: "d" },
          { code: "B1", criterion: "Thorough stirring keeps water bath uniform so thermometer reads true air temperature.", marks: 1, partId: "d" },
        ],
        totalMarks: 9,
        generatorModel: model,
      });
    });

    // 2 Authentic 6-Mark Experimental LoRs for RP8 (1 Boyle, 1 Charles)
    {
      const bSpec: Record<string, unknown> = {
        kind: "al-prac-rp8-boyle-charles",
        mode: "boyle",
        p1KPa: 104,
        v1Cm3: 42.0,
        p2KPa: 182,
        deadVolCm3: 2.0,
      };
      const bAnchor = strQ(solveKind("al-prac-rp8-boyle-charles", bSpec), "gasLawAnchor");
      out.push(
        buildExperimentalLor6m({
          id: makeId("rp8-boyle-lor-6m-1"),
          seed: nextSeed(),
          model,
          domain: "thermal",
          conceptId: "rp8-boyles-law-isothermal",
          templateArchetype: "al-prac-rp8-lor",
          syllabi: TAG_3_6_2_Y13,
          difficulty: "higher",
          scenarioSpec: bSpec,
          anchorKey: "gasLawAnchor",
          anchorText: bAnchor,
          requiredGivens: [],
          stem: "A student investigates Boyle's law using a sealed glass air column over an oil reservoir connected to a foot pump and Bourdon pressure gauge.",
          prompt:
            "Describe how to perform this investigation safely and accurately to verify Boyle's law graphically, stating precautions, measurements, thermal controls, and graphical proof. [6 marks]",
          expectedAnswer: `Wear safety goggles and avoid exceeding the maximum safe pressure rating of the glass column; ${bAnchor}; read the oil meniscus at eye level across at least six pressure steps, verify zero gas leakage by checking original readings on decompression, and plot p against 1/V to verify a straight line through the origin.`,
          workingSteps: [
            "Level 1: Safety goggles, do not exceed pressure limit, ensure valve sealed so gas mass is fixed.",
            "Level 2: Change pressure slowly, wait 1–2 min for thermal equilibration, read oil meniscus at eye level (no parallax) + Bourdon gauge across >= 6 readings.",
            "Level 3: Repeat on decompression to check for leaks/hysteresis, plot p vs 1/V (straight line through origin confirms pV = const; or 1/p vs V to find dead volume).",
          ],
          workedSolution: `Level 3 Model Response: Wear safety goggles and never exceed the manufacturer's maximum safe pressure on the glass tube. Ensure the sealed column contains a fixed mass of dry air with no valve leaks. Pump oil slowly to increase pressure in small steps across at least six widely spaced pressures. After each step, wait for thermal equilibrium so heat generated by compression dissipates and the air returns to constant room temperature. Read the volume at the bottom/flat level of the oil meniscus strictly at eye level to eliminate parallax, alongside the Bourdon gauge reading. Repeat measurements while slowly releasing pressure to verify no air escaped. Plot absolute pressure p against 1/V; a straight line passing through the origin verifies p ∝ 1/V (constant pV).`,
          criteria: [
            "States safety precaution: wear safety goggles and keep pressure strictly below the glass tube's maximum limit.",
            "Confirms fixed mass of trapped dry air (sealed system, repeat readings during decompression to verify zero leakage).",
            "Changes pressure slowly and pauses between readings so compressed air returns to constant room temperature (isothermal).",
            "Reads volume meniscus perpendicularly at eye level (eliminating parallax) across >= 6 pressure-volume pairs.",
            "Plots pressure p against 1/V (or 1/p against V when accounting for tubing dead volume).",
            "States clearly that a straight best-fit line passing through the origin confirms Boyle's law (pV = constant).",
          ],
          targetSummary:
            "Six mark level of response experimental procedure for required practical eight boyle law verification",
        }),
      );

      const cSpec: Record<string, unknown> = {
        kind: "al-prac-rp8-boyle-charles",
        mode: "charles",
        theta1C: 18,
        length1Mm: 112.0,
        theta2C: 82,
        length2Mm: 136.8,
      };
      const cAnchor = strQ(solveKind("al-prac-rp8-boyle-charles", cSpec), "gasLawAnchor");
      out.push(
        buildExperimentalLor6m({
          id: makeId("rp8-charles-lor-6m-2"),
          seed: nextSeed(),
          model,
          domain: "thermal",
          conceptId: "rp8-charles-law-absolute-zero",
          templateArchetype: "al-prac-rp8-lor",
          syllabi: TAG_3_6_2_Y13,
          difficulty: "higher",
          scenarioSpec: cSpec,
          anchorKey: "gasLawAnchor",
          anchorText: cAnchor,
          requiredGivens: [],
          stem: "A Year 13 class determines an experimental value for absolute zero using a vertical glass capillary tube containing air trapped by a bead of concentrated sulfuric acid immersed in a water bath.",
          prompt:
            "Explain how to carry out this practical safely and accurately to determine absolute zero graphically, detailing apparatus setup, safety, chemical and thermal precautions, and extrapolation. [6 marks]",
          expectedAnswer: `Wear safety goggles and acid-resistant gloves when handling the corrosive H₂SO₄ bead and hot water; ${cAnchor}; submerge the entire trapped air column below water level beside a ruler, record column length L and temperature θ across at least six temperatures from ice water to 85 °C, plot L against θ, and extrapolate linearly to L = 0 to find absolute zero near −273 °C.`,
          workingSteps: [
            "Level 1: Goggles + care with corrosive H₂SO₄ and scalding water; open-topped uniform capillary tube fully submerged.",
            "Level 2: Acid bead maintains constant atmospheric pressure AND dries trapped air; stir bath thoroughly before reading θ and L at eye level.",
            "Level 3: Record >= 6 points over wide temperature range (e.g. 10–85 °C), plot L vs θ (V ∝ L for uniform bore), extrapolate linearly to L = 0 (or calculate θ₀ = θ₁ − L₁/m).",
          ],
          workedSolution: `Level 3 Model Response: Wear safety goggles and handle the concentrated sulfuric acid bead and hot water with care. Fasten a uniform-bore open-topped capillary tube alongside a millimetre ruler inside a tall beaker so the entire trapped air column remains completely submerged. The concentrated sulfuric acid bead acts as a movable frictionless seal keeping the air at constant atmospheric pressure while simultaneously absorbing water vapour to keep the air dry. Begin with hot water around 85 °C (or heat gradually from ice-cold water), stir the water bath thoroughly before every reading so the thermometer and trapped air share the exact same uniform temperature, and view the bottom of the acid bead perpendicularly at eye level to eliminate parallax. Record at least six pairs of (θ, L) down to near 10 °C. Because the capillary cross-section is uniform, V ∝ L; plot L against θ / °C, draw a straight line of best fit, and extrapolate (or compute −L₀/gradient) to L = 0 to estimate absolute zero near −273 °C.`,
          criteria: [
            "States safety precautions for corrosive concentrated sulfuric acid (goggles/gloves) and scalding water.",
            "Submerges the entire trapped air column completely inside the water bath alongside a millimetre scale.",
            "Explains both roles of concentrated H₂SO₄: traps air at constant atmospheric pressure AND dries the air (removes water vapour).",
            "Stirs the water bath thoroughly before every reading so water temperature is uniform and equals trapped air temperature.",
            "Reads column length L (noting V ∝ L for uniform bore) and temperature θ at eye level across >= 6 temperatures over a wide range.",
            "Plots L against θ / °C and extrapolates the best-fit straight line to L = 0 (or evaluates −L₀ / gradient) to find absolute zero near −273 °C.",
          ],
          targetSummary:
            "Six mark level of response experimental procedure for required practical eight charles law determination of absolute zero",
        }),
      );
    }
  }

  /* ======================================================================== */
  /*  11. al-prac-rp9-capacitor-rc-log (12 items: 4 Q, 4 Qual, 4 8m Struct)   */
  /* ======================================================================== */
  {
    const rp9Cases = [
      { slug: "rp9-rc-1", initialVoltageV: 9.0, resistanceKOhm: 47, capacitanceUF: 470, t1S: 10, t2S: 50, voltmeterResistanceMOhm: 1.0 },
      { slug: "rp9-rc-2", initialVoltageV: 12.0, resistanceKOhm: 100, capacitanceUF: 330, t1S: 15, t2S: 75, voltmeterResistanceMOhm: 0.5 },
      { slug: "rp9-rc-3", initialVoltageV: 6.0, resistanceKOhm: 68, capacitanceUF: 680, t1S: 20, t2S: 100, voltmeterResistanceMOhm: 1.2 },
      { slug: "rp9-rc-4", initialVoltageV: 10.0, resistanceKOhm: 82, capacitanceUF: 220, t1S: 8, t2S: 44, voltmeterResistanceMOhm: 0.4 },
    ];

    // 4 Quantitative MCQs
    rp9Cases.forEach((c, i) => {
      const spec: Record<string, unknown> = {
        kind: "al-prac-rp9-capacitor-rc-log",
        initialVoltageV: c.initialVoltageV,
        resistanceKOhm: c.resistanceKOhm,
        capacitanceUF: c.capacitanceUF,
        t1S: c.t1S,
        t2S: c.t2S,
        voltmeterResistanceMOhm: c.voltmeterResistanceMOhm,
      };
      const q = solveKind("al-prac-rp9-capacitor-rc-log", spec);
      const tau = numQ(q, "timeConstantS");
      const tHalf = numQ(q, "tHalfS");
      const lnV1 = numQ(q, "lnV1");
      const lnV2 = numQ(q, "lnV2");
      const effTau = numQ(q, "effectiveTauWithMeterS");
      const seed = nextSeed();
      const tKeys = ["timeConstantS", "capacitanceUF", "tHalfS", "effectiveTauWithMeterS"] as const;
      const units = ["s", "μF", "s", "s"] as const;
      const tKey = tKeys[i];
      const unit = units[i];
      const truth = numQ(q, tKey);

      const stems = [
        `In Required Practical 9, a charged electrolytic capacitor discharges through a fixed resistor. Two points on the straight best-fit graph of $\\ln(V / \\mathrm{V})$ against $t$ are $(${c.t1S}\\text{ s}, ${lnV1.toFixed(3)})$ and $(${c.t2S}\\text{ s}, ${lnV2.toFixed(3)})$. Calculate the time constant $\\tau = RC$.`,
        `During Required Practical 9, a capacitor discharges through a ${c.resistanceKOhm} kΩ resistor. The $\\ln(V / \\mathrm{V})$ against $t$ graph passes through $(${c.t1S}\\text{ s}, ${lnV1.toFixed(3)})$ and $(${c.t2S}\\text{ s}, ${lnV2.toFixed(3)})$. Determine the capacitance $C$ in μF.`,
        `A ${c.capacitanceUF} μF capacitor discharges through a ${c.resistanceKOhm} kΩ resistor in Required Practical 9. Calculate the time $T_{1/2}$ required for the potential difference across the capacitor to halve.`,
        `In Required Practical 9, a ${c.capacitanceUF} μF capacitor discharges through a ${c.resistanceKOhm} kΩ resistor while monitored by a voltmeter of finite resistance ${c.voltmeterResistanceMOhm.toFixed(1)} MΩ connected in parallel. Calculate the actual measured time constant $\\tau_{\\mathrm{eff}}$.`,
      ];

      const dists: NumericDistractor[][] = [
        [
          { value: 1 / tau, rationale: "Reports the magnitude of the gradient 1/τ instead of taking its reciprocal τ." },
          { value: tHalf, rationale: "Multiplies time constant by ln 2 (computes half-time instead of time constant)." },
          { value: tau * Math.LN10, rationale: "Multiplies by ln 10 as if the plot used base-10 logarithms." },
        ],
        [
          { value: c.capacitanceUF * 1e-3, rationale: "Drops a factor of 10³ when converting kΩ and μF." },
          { value: (1 / tau / (c.resistanceKOhm * 1e3)) * 1e6, rationale: "Uses gradient instead of 1/gradient when solving C = τ / R." },
          { value: (tHalf / (c.resistanceKOhm * 1e3)) * 1e6, rationale: "Substitutes half-time T₁/₂ instead of time constant τ into C = τ / R." },
        ],
        [
          { value: tau, rationale: "Reports the time constant RC (fall to 37%) instead of the halving time RC ln 2." },
          { value: tau / Math.LN2, rationale: "Divides RC by ln 2 instead of multiplying by ln 2." },
          { value: tau * 0.5, rationale: "Uses 0.5 × RC instead of 0.693 × RC." },
        ],
        [
          { value: tau, rationale: "Ignores the parallel voltmeter resistance R_V." },
          { value: (c.resistanceKOhm * 1e3 + c.voltmeterResistanceMOhm * 1e6) * c.capacitanceUF * 1e-6, rationale: "Combines R and R_V in series instead of in parallel." },
          { value: tau * (1 + (c.resistanceKOhm * 1e3) / (c.voltmeterResistanceMOhm * 1e6)), rationale: "Increases τ rather than lowering τ when a parallel discharge path is added." },
        ],
      ];

      out.push({
        id: makeId(`${c.slug}-qmcq-${i + 1}`),
        conceptId: "rp9-capacitor-discharge-rc",
        templateArchetype: "al-prac-rp9-capacitor-rc-log",
        seed,
        syllabi: TAG_3_7_4_Y13_NCUK,
        format: "mcq",
        questionStyle: "experimental",
        difficulty: i === 3 ? "higher" : "standard",
        domain: "circuits",
        scenarioSpec: spec,
        hiddenQuantities: [tKey],
        requiredGivens:
          i === 0
            ? [
                { name: "t1S", value: c.t1S, unit: "s", source: "stem" },
                { name: "lnV1", value: lnV1, source: "stem" },
                { name: "t2S", value: c.t2S, unit: "s", source: "stem" },
                { name: "lnV2", value: lnV2, source: "stem" },
              ]
            : i === 1
              ? [
                  { name: "resistanceKOhm", value: c.resistanceKOhm, unit: "kΩ", source: "either" },
                  { name: "t1S", value: c.t1S, unit: "s", source: "stem" },
                  { name: "lnV1", value: lnV1, source: "stem" },
                  { name: "t2S", value: c.t2S, unit: "s", source: "stem" },
                  { name: "lnV2", value: lnV2, source: "stem" },
                ]
              : [
                  { name: "resistanceKOhm", value: c.resistanceKOhm, unit: "kΩ", source: "either" },
                  { name: "capacitanceUF", value: c.capacitanceUF, unit: "μF", source: "stem" },
                  ...(i === 3 ? [{ name: "voltmeterResistanceMOhm", value: c.voltmeterResistanceMOhm, unit: "MΩ", source: "stem" as const }] : []),
                ],
        questionPlan: {
          targetSummary:
            "Determine capacitor time constant, capacitance, half time, or voltmeter loaded time constant in required practical nine",
        },
        stem: stems[i],
        options: buildNumOptions(truth, unit, dists[i], seed),
        targetMode: "quantitative",
        targetQuantityKey: tKey,
        workedSolution: `Ideal time constant $\\tau = RC = ${f3(tau, "s")}$, $C = ${c.capacitanceUF}$ μF, $T_{1/2} = \\tau\\ln 2 = ${f3(tHalf, "s")}$, and with parallel voltmeter $R_{\\mathrm{eff}} = R R_V / (R + R_V)$, $\\tau_{\\mathrm{eff}} = ${f3(effTau, "s")}$.`,
        markScheme: [
          { code: "A1", criterion: `Correctly determines ${tKey} $= ${f3(truth, unit)}$.`, marks: 1 },
        ],
        totalMarks: 1,
        generatorModel: model,
      });
    });

    // 4 Qualitative MCQs for RP9
    const rp9Quals = [
      {
        slug: "rp9-qual-voltmeter-load",
        idx: 0,
        stem: "Why does Required Practical 9 require a high-resistance digital voltmeter ($R_V \\gg R$) and strict attention to electrolytic capacitor polarity?",
        correct:
          "Observe electrolytic capacitor polarity and use a very high resistance voltmeter so negligible parallel current discharges the capacitor and lowers the measured time constant.",
        distractors: [
          {
            text: "A low-resistance voltmeter is preferable because it increases the effective resistance and lengthens the time constant.",
            rationale: "A parallel voltmeter always reduces net resistance R_eff < R, shortening the apparent time constant.",
          },
          {
            text: "Electrolytic capacitors are non-polarised so reversing the terminals only changes the sign of the voltmeter reading.",
            rationale: "Reversing polarity on an electrolytic capacitor breaks down the oxide dielectric and can cause venting or rupture.",
          },
          {
            text: "Connecting the voltmeter in series with the resistor ensures zero parallel discharge error.",
            rationale: "A voltmeter must be connected in parallel; putting a high-R voltmeter in series blocks discharge current.",
          },
        ] as const,
      },
      {
        slug: "rp9-qual-semi-log",
        idx: 1,
        stem: "How does plotting $\\ln(V / \\mathrm{V})$ against $t$ verify exponential discharge in Required Practical 9, and what hardware precaution protects both safety and accuracy?",
        correct:
          "A straight line of gradient −1/(RC) confirms exponential decay; to preserve safety and accuracy, observe electrolytic capacitor polarity and use a very high resistance voltmeter so negligible parallel current discharges the capacitor and lowers the measured time constant.",
        distractors: [
          {
            text: "Plotting V against 1/t produces a straight line of gradient RC.",
            rationale: "Exponential decay V = V₀ e^(−t/RC) linearizes via ln V vs t, not V vs 1/t.",
          },
          {
            text: "The vertical intercept of ln V vs t equals V₀ directly without taking exp.",
            rationale: "The vertical intercept at t = 0 equals ln V₀, so V₀ = e^c.",
          },
          {
            text: "Using a very small resistor R (10 Ω) gives a slow discharge that is easy to read manually.",
            rationale: "A small R makes τ = RC tiny (milliseconds), requiring a data-logger; choose R so τ ≈ 20–60 s for manual timing.",
          },
        ] as const,
      },
      {
        slug: "rp9-qual-datalogger",
        idx: 2,
        stem: "Why might a student choose a voltage data-logger instead of a manual stopwatch and voltmeter during a fast RC discharge, while still respecting circuit precautions?",
        correct:
          "A data-logger records simultaneous (t, V) readings at high sample rate without human reaction-time lag; students still observe electrolytic capacitor polarity and use a very high resistance voltmeter so negligible parallel current discharges the capacitor and lowers the measured time constant.",
        distractors: [
          {
            text: "A data-logger eliminates the exponential nature of discharge so V falls linearly with time.",
            rationale: "The physics remains exponential V = V₀ e^(−t/RC); a data-logger simply captures accurate timestamps.",
          },
          {
            text: "A data-logger eliminates the need to check the capacitor's maximum working voltage rating.",
            rationale: "Exceeding the voltage rating damages the dielectric regardless of measurement instrument.",
          },
          {
            text: "A data-logger draws a large bias current to stabilise the discharge curve.",
            rationale: "Voltage sensors must have very high input impedance so negligible current bypasses R.",
          },
        ] as const,
      },
      {
        slug: "rp9-qual-constant-ratio",
        idx: 3,
        stem: "Without plotting logarithms, how can a student test directly from a $V$ against $t$ curve that discharge is exponential, and what circuit rule prevents an artificially small time constant?",
        correct:
          "Confirm constant halving time T₁/₂ across successive equal-ratio drops; in the circuit, observe electrolytic capacitor polarity and use a very high resistance voltmeter so negligible parallel current discharges the capacitor and lowers the measured time constant.",
        distractors: [
          {
            text: "Confirm that V drops by an equal number of volts every 10 seconds.",
            rationale: "Equal absolute voltage drops describe linear decay, whereas exponential decay has equal fractional drops in equal time intervals.",
          },
          {
            text: "Confirm that the area under the V against t graph equals the charge stored.",
            rationale: "Area under I vs t equals charge Q; area under V vs t equals Q R.",
          },
          {
            text: "Connect a second resistor in parallel with the voltmeter to raise the measured time constant.",
            rationale: "Adding any parallel resistor lowers effective resistance and shortens the time constant further.",
          },
        ] as const,
      },
    ];

    rp9Quals.forEach((b, i) => {
      const c = rp9Cases[b.idx];
      const spec: Record<string, unknown> = {
        kind: "al-prac-rp9-capacitor-rc-log",
        initialVoltageV: c.initialVoltageV,
        resistanceKOhm: c.resistanceKOhm,
        capacitanceUF: c.capacitanceUF,
        t1S: c.t1S,
        t2S: c.t2S,
        voltmeterResistanceMOhm: c.voltmeterResistanceMOhm,
      };
      const seed = nextSeed();
      out.push({
        id: makeId(`${b.slug}-${i + 1}`),
        conceptId: "rp9-capacitor-discharge-rc",
        templateArchetype: "al-prac-rp9-capacitor-rc-log",
        seed,
        syllabi: TAG_3_7_4_Y13,
        format: "mcq",
        questionStyle: "qualitative",
        difficulty: "standard",
        domain: "circuits",
        scenarioSpec: spec,
        hiddenQuantities: ["voltmeterLoadingAnchor"],
        requiredGivens: [],
        questionPlan: {
          targetSummary:
            "Assess voltmeter loading error, electrolytic polarity safety, and exponential verification in required practical nine",
        },
        stem: b.stem,
        options: buildVerbalOptions(b.correct, b.distractors, seed),
        targetMode: "qualitative",
        targetQuantityKey: "voltmeterLoadingAnchor",
        workedSolution: `RP9 mark-scheme precision: ${b.correct}`,
        markScheme: [{ code: "A1", criterion: b.correct, marks: 1 }],
        totalMarks: 1,
        generatorModel: model,
      });
    });

    // 4 Paper 3A Structured 8m Ladders
    rp9Cases.forEach((c, i) => {
      const spec: Record<string, unknown> = {
        kind: "al-prac-rp9-capacitor-rc-log",
        initialVoltageV: c.initialVoltageV,
        resistanceKOhm: c.resistanceKOhm,
        capacitanceUF: c.capacitanceUF,
        t1S: c.t1S,
        t2S: c.t2S,
        voltmeterResistanceMOhm: c.voltmeterResistanceMOhm,
      };
      const q = solveKind("al-prac-rp9-capacitor-rc-log", spec);
      const tau = numQ(q, "timeConstantS");
      const tHalf = numQ(q, "tHalfS");
      const lnV1 = numQ(q, "lnV1");
      const lnV2 = numQ(q, "lnV2");
      const effTau = numQ(q, "effectiveTauWithMeterS");
      const anchor = strQ(q, "voltmeterLoadingAnchor");
      out.push({
        id: makeId(`${c.slug}-p3a-8m-${i + 1}`),
        conceptId: "rp9-capacitor-discharge-rc",
        templateArchetype: "al-prac-rp9-capacitor-rc-log",
        seed: nextSeed(),
        syllabi: TAG_3_7_4_Y13_NCUK,
        format: "structured",
        questionStyle: "mixed-exam",
        difficulty: "higher",
        domain: "circuits",
        scenarioSpec: spec,
        hiddenQuantities: ["timeConstantS", "capacitanceUF", "effectiveTauWithMeterS", "voltmeterLoadingAnchor"],
        requiredGivens: [
          { name: "resistanceKOhm", value: c.resistanceKOhm, unit: "kΩ", source: "either" },
          { name: "t1S", value: c.t1S, unit: "s", source: "stem" },
          { name: "lnV1", value: lnV1, source: "stem" },
          { name: "t2S", value: c.t2S, unit: "s", source: "stem" },
          { name: "lnV2", value: lnV2, source: "stem" },
          { name: "voltmeterResistanceMOhm", value: c.voltmeterResistanceMOhm, unit: "MΩ", source: "stem" },
        ],
        questionPlan: {
          targetSummary:
            "Paper three section A required practical nine capacitor semi log analysis of time constant, capacitance, voltmeter loading, and polarity safety",
        },
        stem: `In Required Practical 9, a charged electrolytic capacitor discharges through a ${c.resistanceKOhm} kΩ resistor. Two points on the straight best-fit line of $\\ln(V / \\mathrm{V})$ against $t$ are $(${c.t1S}\\text{ s}, ${lnV1.toFixed(3)})$ and $(${c.t2S}\\text{ s}, ${lnV2.toFixed(3)})$.`,
        parts: [
          {
            partId: "a",
            prompt: "Use the gradient of the line to calculate the time constant $\\tau = RC$.",
            marks: 2,
            targetMode: "quantitative",
            targetQuantityKey: "timeConstantS",
            expectedAnswer: f3(tau, "s"),
            workingSteps: [
              `Gradient $= (${lnV2.toFixed(3)} - ${lnV1.toFixed(3)})/(${c.t2S} - ${c.t1S}) = ${f3(-1 / tau, "s⁻¹")}$.`,
              `$\\tau = -1 / \\mathrm{grad} = ${f3(tau, "s")}$.`,
            ],
          },
          {
            partId: "b",
            prompt: "Determine the capacitance $C$ in μF (and note $T_{1/2} = \\tau\\ln 2$).",
            marks: 2,
            dependsOnPartIds: ["a"],
            targetMode: "quantitative",
            targetQuantityKey: "capacitanceUF",
            expectedAnswer: f3(c.capacitanceUF, "μF"),
            workingSteps: [
              `$C = \\tau / R = ${f3(tau)} / (${c.resistanceKOhm} \\times 10^3) = ${f3(c.capacitanceUF, "μF")}$.`,
            ],
          },
          {
            partId: "c",
            prompt: `If the student repeats the discharge with a lower-impedance voltmeter of resistance ${c.voltmeterResistanceMOhm.toFixed(1)} MΩ across the capacitor, calculate the reduced effective time constant $\\tau_{\\mathrm{eff}}$.`,
            marks: 2,
            dependsOnPartIds: ["b"],
            targetMode: "quantitative",
            targetQuantityKey: "effectiveTauWithMeterS",
            expectedAnswer: f3(effTau, "s"),
            workingSteps: [
              `$R_{\\mathrm{eff}} = (R R_V)/(R + R_V)$, giving $\\tau_{\\mathrm{eff}} = R_{\\mathrm{eff}} C = ${f3(effTau, "s")}$.`,
            ],
          },
          {
            partId: "d",
            prompt: "Explain why electrolytic polarity must be checked and why $R_V \\gg R$ is required.",
            marks: 2,
            targetMode: "qualitative",
            targetQuantityKey: "voltmeterLoadingAnchor",
            expectedAnswer: anchor,
            workingSteps: [
              "Wrong polarity damages/ruptures electrolytic capacitor.",
              "High voltmeter resistance prevents extra parallel discharge path lowering apparent RC.",
            ],
          },
        ],
        workedSolution: `(a) $\\tau = ${f3(tau, "s")}$ ($T_{1/2} = ${f3(tHalf, "s")}$). (b) $C = ${f3(c.capacitanceUF, "μF")}$. (c) $\\tau_{\\mathrm{eff}} = ${f3(effTau, "s")}$. (d) ${anchor}.`,
        markScheme: [
          { code: "M1", criterion: "Computes negative gradient of $\\ln V$ vs $t$ and equates to $-1/\\tau$.", marks: 1, partId: "a" },
          { code: "A1", criterion: `Time constant $\\tau = ${f3(tau, "s")}$.`, marks: 1, partId: "a" },
          { code: "M1", criterion: "Uses $C = \\tau / R$ with $R$ in Ω.", marks: 1, partId: "b" },
          { code: "A1", criterion: `Capacitance $C = ${f3(c.capacitanceUF, "μF")}$.`, marks: 1, partId: "b" },
          { code: "M1", criterion: "Combines $R$ and $R_V$ in parallel: $1/R_{\\mathrm{eff}} = 1/R + 1/R_V$.", marks: 1, partId: "c" },
          { code: "A1", criterion: `Effective time constant $\\tau_{\\mathrm{eff}} = ${f3(effTau, "s")}$.`, marks: 1, partId: "c" },
          { code: "B1", criterion: "Match +/− polarity and voltage rating to prevent electrolytic dielectric breakdown.", marks: 1, partId: "d" },
          { code: "B1", criterion: "Voltmeter $R_V \\gg R$ prevents parallel leakage current from shortening apparent $\\tau$.", marks: 1, partId: "d" },
        ],
        totalMarks: 8,
        generatorModel: model,
      });
    });
  }

  /* ======================================================================== */
  /*  12. al-prac-rp10-mag-force-balance (14 items: 4 Q, 4 Qual, 4 8m, 2 LoR) */
  /* ======================================================================== */
  {
    const rp10Cases = [
      { slug: "rp10-tared-1", fluxDensityMT: 54, wireLengthMm: 60, yokeMassG: 142.5, maxCurrentA: 4.5, tared: true },
      { slug: "rp10-untared-2", fluxDensityMT: 72, wireLengthMm: 50, yokeMassG: 168.4, maxCurrentA: 4.0, tared: false },
      { slug: "rp10-tared-3", fluxDensityMT: 46, wireLengthMm: 75, yokeMassG: 155.0, maxCurrentA: 5.0, tared: true },
      { slug: "rp10-untared-4", fluxDensityMT: 84, wireLengthMm: 45, yokeMassG: 184.2, maxCurrentA: 3.6, tared: false },
    ];

    // 4 Quantitative MCQs
    rp10Cases.forEach((c, i) => {
      const spec: Record<string, unknown> = {
        kind: "al-prac-rp10-mag-force-balance",
        fluxDensityMT: c.fluxDensityMT,
        wireLengthMm: c.wireLengthMm,
        yokeMassG: c.yokeMassG,
        maxCurrentA: c.maxCurrentA,
        tared: c.tared,
      };
      const q = solveKind("al-prac-rp10-mag-force-balance", spec);
      const grad = numQ(q, "gradMvsI_gPerA");
      const forceMax = numQ(q, "forceAtMaxIN");
      const readMax = numQ(q, "readingAtMaxIG");
      const seed = nextSeed();
      const tKeys = ["fluxDensityMT", "gradMvsI_gPerA", "forceAtMaxIN", "readingAtMaxIG"] as const;
      const units = ["mT", "g A⁻¹", "N", "g"] as const;
      const tKey = tKeys[i];
      const unit = units[i];
      const truth = numQ(q, tKey);

      const stems = [
        `In Required Practical 10, a stiff copper rod of active length $L = ${c.wireLengthMm}$ mm sits perpendicular to the uniform magnetic field between slab magnets resting on a tared top-pan balance ($g = 9.81$ m s⁻²). Plotting apparent mass change $\\Delta m$ (in g) against current $I$ (in A) gives a straight line of gradient ${f3(grad, "g A⁻¹")}. Calculate the magnetic flux density $B$ in mT.`,
        `During Required Practical 10, slab magnets with uniform flux density $B = ${c.fluxDensityMT}$ mT span an active wire length $L = ${c.wireLengthMm}$ mm ($g = 9.81$ m s⁻²). What is the expected gradient of the top-pan balance reading $M$ (in g) plotted against current $I$ (in A)?`,
        `In Required Practical 10, a uniform magnetic field of ${c.fluxDensityMT} mT acts perpendicularly across a ${c.wireLengthMm} mm length of stiff copper rod carrying ${c.maxCurrentA.toFixed(1)} A. Calculate the magnitude of the magnetic force exerted on the magnet yoke.`,
        `An untared top-pan balance supports a steel yoke and slab magnets of total mass ${c.yokeMassG.toFixed(1)} g in Required Practical 10 ($B = ${c.fluxDensityMT}$ mT, active wire length ${c.wireLengthMm} mm, $g = 9.81$ m s⁻²). When a current of ${c.maxCurrentA.toFixed(1)} A produces an upward magnetic force on the clamped wire, what mass reading does the balance display?`,
      ];

      const dists: NumericDistractor[][] = [
        [
          { value: c.fluxDensityMT / 9.81, rationale: "Forgets to multiply Δm by g = 9.81 m s⁻² to convert mass to force." },
          { value: c.fluxDensityMT * 10, rationale: "Slips by a power of ten between grams, millimetres, and millitesla." },
          { value: c.fluxDensityMT * 0.5, rationale: "Applies an erroneous factor of one half." },
        ],
        [
          { value: grad * 9.81, rationale: "Omits division by g = 9.81 m s⁻² when converting force/A to mass/A." },
          { value: grad * 1e-3, rationale: "Leaves the gradient in kg A⁻¹ instead of g A⁻¹." },
          { value: grad * 2, rationale: "Doubles the active wire length." },
        ],
        [
          { value: forceMax * 1000, rationale: "Forgets to convert mT or mm into SI base units." },
          { value: forceMax / 9.81, rationale: "Divides magnetic force by g = 9.81 (computes Δm in kg instead of force in N)." },
          { value: forceMax * 0.5, rationale: "Halves the active wire length." },
        ],
        [
          { value: c.yokeMassG - numQ(q, "deltaMassAtMaxIG"), rationale: "Subtracts Δm instead of adding it (reverses Newton's 3rd law reaction direction)." },
          { value: numQ(q, "deltaMassAtMaxIG"), rationale: "Reports Δm as if the balance had been tared to zero." },
          { value: c.yokeMassG + forceMax, rationale: "Adds force in newtons directly to mass in grams." },
        ],
      ];

      out.push({
        id: makeId(`${c.slug}-qmcq-${i + 1}`),
        conceptId: "rp10-magnetic-force-balance",
        templateArchetype: "al-prac-rp10-mag-force-balance",
        seed,
        syllabi: TAG_3_7_5_Y13_NCUK,
        format: "mcq",
        questionStyle: "experimental",
        difficulty: "standard",
        domain: "em-induction",
        scenarioSpec: spec,
        hiddenQuantities: [tKey],
        requiredGivens:
          i === 0
            ? [
                { name: "wireLengthMm", value: c.wireLengthMm, unit: "mm", source: "either" },
                { name: "gradMvsI_gPerA", value: grad, source: "stem" },
              ]
            : [
                { name: "fluxDensityMT", value: c.fluxDensityMT, unit: "mT", source: "stem" },
                { name: "wireLengthMm", value: c.wireLengthMm, unit: "mm", source: "either" },
                ...(i >= 2 ? [{ name: "maxCurrentA", value: c.maxCurrentA, unit: "A", source: "stem" as const }] : []),
                ...(i === 3 ? [{ name: "yokeMassG", value: c.yokeMassG, unit: "g", source: "stem" as const }] : []),
              ],
        questionPlan: {
          targetSummary:
            "Determine magnetic flux density, balance mass gradient, magnetic force, or untared balance reading in required practical ten",
        },
        stem: stems[i],
        options: buildNumOptions(truth, unit, dists[i], seed, i === 3 ? 4 : 3),
        targetMode: "quantitative",
        targetQuantityKey: tKey,
        workedSolution: `Using $\\Delta m \\cdot g = B I L$ with $g = 9.81$ m s⁻², gradient $= 1000 B L / g = ${f3(grad, "g A⁻¹")}$, $B = ${c.fluxDensityMT}$ mT, $F = B I L = ${f3(forceMax, "N")}$, and untared reading $= ${c.yokeMassG} + ${f3(numQ(q, "deltaMassAtMaxIG"))} = ${f4(readMax, "g")}$.`,
        markScheme: [
          { code: "A1", criterion: `Correctly determines ${tKey} $= ${fmtSf(truth, i === 3 ? 4 : 3, unit)}$.`, marks: 1 },
        ],
        totalMarks: 1,
        generatorModel: model,
      });
    });

    // 4 Qualitative MCQs for RP10
    const rp10Quals = [
      {
        slug: "rp10-qual-n3l",
        idx: 0,
        stem: "In Required Practical 10, the stiff copper wire is clamped rigidly to a retort stand so it never touches the magnets or the top-pan balance. Why does the balance reading increase when current flows?",
        correct:
          "By newton third law the equal and opposite downward magnetic force on the magnet yoke increases the top pan balance reading proportionally to current.",
        distractors: [
          {
            text: "The wire pushes downward mechanically on the magnets through direct friction contact.",
            rationale: "The wire must not touch the magnet yoke; the interaction is an equal-and-opposite magnetic force pair.",
          },
          {
            text: "Current flowing in the copper wire heats the air inside the magnet gap, creating downward convection.",
            rationale: "The linear increase Δm ∝ I comes directly from Newton's 3rd law magnetic reaction F = BIl.",
          },
          {
            text: "Fleming's left-hand rule acts directly on the stationary balance pan rather than the current-carrying wire.",
            rationale: "The magnetic force acts upward on the current-carrying wire; by Newton's 3rd law, the wire exerts an equal downward force on the magnets.",
          },
        ] as const,
      },
      {
        slug: "rp10-qual-untared",
        idx: 1,
        stem: "A student forgets to press TARE on the top-pan balance before switching on the DC supply in RP10 and plots raw balance mass $M$ against current $I$. How does this affect the graph?",
        correct:
          "The straight line has positive vertical intercept M₀ equal to the yoke-and-magnet mass while keeping the exact same gradient BL/g, because by newton third law the equal and opposite downward magnetic force on the magnet yoke increases the top pan balance reading proportionally to current.",
        distractors: [
          {
            text: "Forgetting to tare invalidates the gradient so flux density B cannot be calculated from the graph.",
            rationale: "Untared mass adds a constant offset M₀ without altering the slope BL/g.",
          },
          {
            text: "The graph curves parabolically because total mass increases with current.",
            rationale: "M = M₀ + (BL/g)I remains strictly linear.",
          },
          {
            text: "The vertical intercept equals the weight of the clamped copper rod.",
            rationale: "The clamped rod is supported by the retort stand, so the intercept is solely the yoke and slab magnets.",
          },
        ] as const,
      },
      {
        slug: "rp10-qual-angle",
        idx: 2,
        stem: "If the clamped copper wire is accidentally skewed at an angle of $75^\\circ$ rather than $90^\\circ$ to the uniform magnetic field lines in RP10, what happens to the calculated value of $B$ assuming $F = BIl$?",
        correct:
          "The measured force drops to BIl sin 75° so B is underestimated (unless active length inside the uniform gap compensates), since by newton third law the equal and opposite downward magnetic force on the magnet yoke increases the top pan balance reading proportionally to current.",
        distractors: [
          {
            text: "The balance reading reverses sign whenever the wire is rotated slightly from 90°.",
            rationale: "Only reversing current direction or flipping magnet polarity reverses the sign of Δm.",
          },
          {
            text: "Skewing the wire makes the balance reading independent of current I.",
            rationale: "Force remains proportional to current I for any fixed wire orientation.",
          },
          {
            text: "The wire must be placed parallel to the magnetic field lines to maximize the balance reading.",
            rationale: "A wire parallel to B experiences zero magnetic force (sin 0° = 0).",
          },
        ] as const,
      },
      {
        slug: "rp10-qual-reverse-current",
        idx: 3,
        stem: "What occurs on a tared 0.01 g top-pan balance in RP10 if the student reverses the leads from the DC power supply?",
        correct:
          "The balance displays a negative apparent mass change of equal magnitude because the upward/downward force pair flips; normally by newton third law the equal and opposite downward magnetic force on the magnet yoke increases the top pan balance reading proportionally to current.",
        distractors: [
          {
            text: "The balance reading stays positive and unchanged because magnetic force depends on I².",
            rationale: "F = BIl is linear in vector current I, so reversing current reverses force direction.",
          },
          {
            text: "The balance reading drops to exactly zero regardless of current magnitude.",
            rationale: "Force magnitude remains BIl; its direction flips upward on the yoke, giving a negative reading on a tared scale.",
          },
          {
            text: "Reversing the current demagnetises the slab magnets immediately.",
            rationale: "Moderate DC currents in the copper rod do not demagnetise permanent slab magnets.",
          },
        ] as const,
      },
    ];

    rp10Quals.forEach((b, i) => {
      const c = rp10Cases[b.idx];
      const spec: Record<string, unknown> = {
        kind: "al-prac-rp10-mag-force-balance",
        fluxDensityMT: c.fluxDensityMT,
        wireLengthMm: c.wireLengthMm,
        yokeMassG: c.yokeMassG,
        maxCurrentA: c.maxCurrentA,
        tared: c.tared,
      };
      const seed = nextSeed();
      out.push({
        id: makeId(`${b.slug}-${i + 1}`),
        conceptId: "rp10-magnetic-force-balance",
        templateArchetype: "al-prac-rp10-mag-force-balance",
        seed,
        syllabi: TAG_3_7_5_Y13,
        format: "mcq",
        questionStyle: "qualitative",
        difficulty: "standard",
        domain: "em-induction",
        scenarioSpec: spec,
        hiddenQuantities: ["rp10Anchor"],
        requiredGivens: [],
        questionPlan: {
          targetSummary:
            "Assess Newton third law explanation, taring, wire alignment, and current reversal in required practical ten",
        },
        stem: b.stem,
        options: buildVerbalOptions(b.correct, b.distractors, seed),
        targetMode: "qualitative",
        targetQuantityKey: "rp10Anchor",
        workedSolution: `RP10 mark-scheme precision: ${b.correct}`,
        markScheme: [{ code: "A1", criterion: b.correct, marks: 1 }],
        totalMarks: 1,
        generatorModel: model,
      });
    });

    // 4 Paper 3A Structured 8m Ladders
    rp10Cases.forEach((c, i) => {
      const spec: Record<string, unknown> = {
        kind: "al-prac-rp10-mag-force-balance",
        fluxDensityMT: c.fluxDensityMT,
        wireLengthMm: c.wireLengthMm,
        yokeMassG: c.yokeMassG,
        maxCurrentA: c.maxCurrentA,
        tared: c.tared,
      };
      const q = solveKind("al-prac-rp10-mag-force-balance", spec);
      const grad = numQ(q, "gradMvsI_gPerA");
      const forceMax = numQ(q, "forceAtMaxIN");
      const anchor = strQ(q, "rp10Anchor");
      out.push({
        id: makeId(`${c.slug}-p3a-8m-${i + 1}`),
        conceptId: "rp10-magnetic-force-balance",
        templateArchetype: "al-prac-rp10-mag-force-balance",
        seed: nextSeed(),
        syllabi: TAG_3_7_5_Y13_NCUK,
        format: "structured",
        questionStyle: "mixed-exam",
        difficulty: "standard",
        domain: "em-induction",
        scenarioSpec: spec,
        hiddenQuantities: ["fluxDensityMT", "forceAtMaxIN", "deltaMassAtMaxIG", "rp10Anchor"],
        requiredGivens: [
          { name: "wireLengthMm", value: c.wireLengthMm, unit: "mm", source: "either" },
          { name: "gradMvsI_gPerA", value: grad, source: "stem" },
          { name: "maxCurrentA", value: c.maxCurrentA, unit: "A", source: "stem" },
        ],
        questionPlan: {
          targetSummary:
            "Paper three section A required practical ten determination of flux density, magnetic force, mass change, and Newton third law explanation",
        },
        stem: `In Required Practical 10, a stiff copper wire of active length $L = ${c.wireLengthMm}$ mm sits perpendicularly between slab magnets mounted on a steel yoke atop a 0.01 g digital top-pan balance ($g = 9.81$ m s⁻²). Plotting balance reading against current $I$ up to ${c.maxCurrentA.toFixed(1)} A produces a straight line of gradient ${f3(grad, "g A⁻¹")}.`,
        parts: [
          {
            partId: "a",
            prompt: "Use the gradient to calculate the magnetic flux density $B$ in mT.",
            marks: 2,
            targetMode: "quantitative",
            targetQuantityKey: "fluxDensityMT",
            expectedAnswer: f3(c.fluxDensityMT, "mT"),
            workingSteps: [
              `Gradient in kg A⁻¹ $= ${f3(grad * 1e-3)}$.`,
              `$B = (\\mathrm{grad} \\times g)/L = (${f3(grad * 1e-3)} \\times 9.81) / (${c.wireLengthMm}\\times 10^{-3}) = ${f3(c.fluxDensityMT, "mT")}$.`,
            ],
          },
          {
            partId: "b",
            prompt: `Calculate the magnetic force on the wire at the maximum current of ${c.maxCurrentA.toFixed(1)} A.`,
            marks: 2,
            dependsOnPartIds: ["a"],
            targetMode: "quantitative",
            targetQuantityKey: "forceAtMaxIN",
            expectedAnswer: f3(forceMax, "N"),
            workingSteps: [`$F = B I L = (${c.fluxDensityMT}\\times 10^{-3})(${c.maxCurrentA})(${c.wireLengthMm}\\times 10^{-3}) = ${f3(forceMax, "N")}$.`],
          },
          {
            partId: "c",
            prompt: "Calculate the change in balance reading $\\Delta m$ (in g) at this maximum current.",
            marks: 2,
            dependsOnPartIds: ["b"],
            targetMode: "quantitative",
            targetQuantityKey: "deltaMassAtMaxIG",
            expectedAnswer: f3(numQ(q, "deltaMassAtMaxIG"), "g"),
            workingSteps: [`$\\Delta m = (F / g) \\times 1000 = ${f3(numQ(q, "deltaMassAtMaxIG"), "g")}$.`],
          },
          {
            partId: "d",
            prompt: "Explain using Newton's third law why the balance reading changes even though the wire is clamped independently.",
            marks: 2,
            targetMode: "qualitative",
            targetQuantityKey: "rp10Anchor",
            expectedAnswer: anchor,
            workingSteps: [
              "Magnetic field exerts an upward force BIl on the current-carrying wire.",
              "By Newton's 3rd law, the wire exerts an equal downward force BIl on the magnets/yoke, increasing the balance normal reaction.",
            ],
          },
        ],
        workedSolution: `(a) $B = ${f3(c.fluxDensityMT, "mT")}$. (b) $F = ${f3(forceMax, "N")}$. (c) $\\Delta m = ${f3(numQ(q, "deltaMassAtMaxIG"), "g")}$. (d) ${anchor}.`,
        markScheme: [
          { code: "M1", criterion: "Converts gradient to kg A⁻¹ and substitutes into $B = (\\mathrm{grad}\\cdot g)/L$.", marks: 1, partId: "a" },
          { code: "A1", criterion: `Flux density $B = ${f3(c.fluxDensityMT, "mT")}$.`, marks: 1, partId: "a" },
          { code: "M1", criterion: "Substitutes into $F = B I L$.", marks: 1, partId: "b" },
          { code: "A1", criterion: `Magnetic force $F = ${f3(forceMax, "N")}$.`, marks: 1, partId: "b" },
          { code: "M1", criterion: "Converts $F/g$ into grams.", marks: 1, partId: "c" },
          { code: "A1", criterion: `Mass change $\\Delta m = ${f3(numQ(q, "deltaMassAtMaxIG"), "g")}$.`, marks: 1, partId: "c" },
          { code: "B1", criterion: "States magnetic field exerts an upward force on the clamped wire.", marks: 1, partId: "d" },
          { code: "B1", criterion: "Applies Newton's 3rd law: equal and opposite downward force on magnet yoke raises balance reading.", marks: 1, partId: "d" },
        ],
        totalMarks: 8,
        generatorModel: model,
      });
    });

    // 2 Authentic 6-Mark Experimental LoRs for RP10
    [
      {
        slug: "rp10-lor-balance-B",
        idx: 0,
        stem: "A student is given a 0.01 g digital top-pan balance, a U-shaped steel yoke holding two opposite slab magnets, a stiff straight copper rod, a variable DC power supply, a rheostat, an ammeter, and a millimetre ruler.",
        prompt:
          "Describe a complete experimental procedure to determine the magnetic flux density $B$ between the slab magnets graphically, explaining setup, alignment, safety, measurements, Newton's third law, and analysis. [6 marks]",
      },
      {
        slug: "rp10-lor-balance-verify",
        idx: 1,
        stem: "A physics laboratory group investigates how the magnetic force on a straight conductor depends on electric current using a top-pan balance current-balance rig.",
        prompt:
          "Plan an accurate investigation to verify $F = BIl$ and determine $B$, including circuit wiring, prevention of systematic errors, thermal safety, and how $B$ is extracted even if the balance is untared. [6 marks]",
      },
    ].forEach((lor, idx) => {
      const c = rp10Cases[lor.idx];
      const spec: Record<string, unknown> = {
        kind: "al-prac-rp10-mag-force-balance",
        fluxDensityMT: c.fluxDensityMT,
        wireLengthMm: c.wireLengthMm,
        yokeMassG: c.yokeMassG,
        maxCurrentA: c.maxCurrentA,
        tared: c.tared,
      };
      const anchor = strQ(solveKind("al-prac-rp10-mag-force-balance", spec), "rp10Anchor");
      out.push(
        buildExperimentalLor6m({
          id: makeId(`${lor.slug}-6m-${idx + 1}`),
          seed: nextSeed(),
          model,
          domain: "em-induction",
          conceptId: "rp10-magnetic-force-balance",
          templateArchetype: "al-prac-rp10-lor",
          syllabi: TAG_3_7_5_Y13,
          difficulty: "higher",
          scenarioSpec: spec,
          anchorKey: "rp10Anchor",
          anchorText: anchor,
          requiredGivens: [],
          stem: lor.stem,
          prompt: lor.prompt,
          expectedAnswer: `Place the magnet yoke on the 0.01 g balance, clamp the stiff copper rod horizontally and perpendicular to B without touching the yoke, tare the balance at zero current (or record untared intercept M₀), vary current I in six steps with a rheostat while switching off between readings to prevent rod heating; ${anchor}; plot Δm (or M) against I and compute B = (gradient × 9.81) / L using magnet length L.`,
          workingSteps: [
            "Level 1: Clamp stiff copper rod horizontally perpendicular to uniform B without touching magnets; series DC supply, rheostat, ammeter, switch.",
            "Level 2: Measure active magnet length L with ruler/callipers; tare balance at I = 0; step current across >= 6 values, opening switch between readings so wire stays cool.",
            "Level 3: Explain N3L downward force on yoke -> Δm g = BIl, plot Δm (or M) vs I, extract B = (gradient × g) / L (converting g to kg).",
          ],
          workedSolution: `Level 3 Model Response: Mount opposite poles (N facing S) on the steel yoke atop a 0.01 g top-pan balance. Clamp the stiff horizontal copper rod securely in a retort stand so it passes straight and perpendicular to the magnetic field lines without touching the magnets or yoke. Wire the rod in series with a DC supply, switch, variable resistor, and digital ammeter. Measure the active length L of the magnets with a Vernier calliper or ruler. Press TARE with zero current (or note the untared mass M₀). Increase current I in at least six even steps (e.g. 0.5 A to 4.5 A), recording Δm and I quickly while opening the switch between readings so the copper rod does not overheat or burn fingers. By Newton's 3rd law, the upward magnetic force BIl on the rod exerts an equal downward force on the magnet yoke, giving Δm·g = BIl. Plot Δm (in kg) against I (in A) for a straight line through the origin (or M vs I with intercept M₀), calculate gradient from a > 50% triangle, and evaluate B = (gradient × 9.81) / L.`,
          criteria: [
            "Clamps stiff copper wire horizontally perpendicular to magnetic field lines without touching the magnet yoke or balance.",
            "Connects DC supply, variable resistor, ammeter, and switch in series; limits current / switches off between readings to prevent wire overheating.",
            "Measures active magnet length L with a ruler/Vernier callipers and tares balance at I = 0 (or notes untared intercept M₀).",
            "Records balance mass reading across at least six currents (repeating and averaging to reduce random error).",
            "Explains via Newton's 3rd law that an equal opposite downward force acts on the magnet yoke so Δm·g = BIl.",
            "Plots Δm (or M) against I, takes gradient using > 50% span, converts grams to kg, and obtains B = (gradient × 9.81) / L.",
          ],
          targetSummary:
            "Six mark level of response experimental procedure for required practical ten top pan balance magnetic flux density determination",
        }),
      );
    });
  }

  /* ======================================================================== */
  /*  13. al-prac-rp11-search-coil-hall (14 items: 4 Q, 4 Qual, 4 8m, 2 LoR)  */
  /* ======================================================================== */
  {
    const rp11Cases = [
      { slug: "rp11-50hz-1", acFreqHz: 50, searchCoilTurns: 2000, searchCoilAreaCm2: 1.5, fluxDensityMT: 4.2, angleThetaDeg: 35, yGainMvPerDiv: 100 },
      { slug: "rp11-60hz-2", acFreqHz: 60, searchCoilTurns: 1500, searchCoilAreaCm2: 2.0, fluxDensityMT: 3.2, angleThetaDeg: 48, yGainMvPerDiv: 100 },
      { slug: "rp11-50hz-3", acFreqHz: 50, searchCoilTurns: 3000, searchCoilAreaCm2: 1.2, fluxDensityMT: 2.8, angleThetaDeg: 25, yGainMvPerDiv: 100 },
      { slug: "rp11-80hz-4", acFreqHz: 80, searchCoilTurns: 1200, searchCoilAreaCm2: 1.8, fluxDensityMT: 3.5, angleThetaDeg: 60, yGainMvPerDiv: 100 },
    ];

    // 4 Quantitative MCQs
    rp11Cases.forEach((c, i) => {
      const spec: Record<string, unknown> = {
        kind: "al-prac-rp11-search-coil-hall",
        acFreqHz: c.acFreqHz,
        searchCoilTurns: c.searchCoilTurns,
        searchCoilAreaCm2: c.searchCoilAreaCm2,
        fluxDensityMT: c.fluxDensityMT,
        angleThetaDeg: c.angleThetaDeg,
        yGainMvPerDiv: c.yGainMvPerDiv,
      };
      const q = solveKind("al-prac-rp11-search-coil-hall", spec);
      const grad = numQ(q, "gradVppVsCosThetaMv");
      const vpp = numQ(q, "vPeakToPeakMv");
      const eps0 = numQ(q, "peakEmfMv");
      const seed = nextSeed();
      const tKeys = ["fluxDensityMT", "vPeakToPeakMv", "gradVppVsCosThetaMv", "peakEmfMv"] as const;
      const units = ["mT", "mV", "mV", "mV"] as const;
      const tKey = tKeys[i];
      const unit = units[i];
      const truth = numQ(q, tKey);

      const stems = [
        `In Required Practical 11, a search coil with $N = ${c.searchCoilTurns}$ turns of area ${c.searchCoilAreaCm2.toFixed(1)} cm² rotates inside a uniform ${c.acFreqHz} Hz alternating magnetic field. Plotting CRO peak-to-peak voltage $V_{\\mathrm{pp}}$ against $\\cos\\theta$ yields a straight line of gradient ${f3(grad, "mV")}. Calculate the peak magnetic flux density $B$ in mT.`,
        `A search coil with $N = ${c.searchCoilTurns}$ turns of cross-sectional area ${c.searchCoilAreaCm2.toFixed(1)} cm² sits at angle $\\theta = ${c.angleThetaDeg}^\\circ$ (between normal and field) inside a ${c.acFreqHz} Hz alternating magnetic field of peak flux density ${c.fluxDensityMT.toFixed(1)} mT (RP11). Calculate the peak-to-peak voltage $V_{\\mathrm{pp}}$ displayed on the CRO.`,
        `In Required Practical 11, a search coil with $N = ${c.searchCoilTurns}$ turns (area ${c.searchCoilAreaCm2.toFixed(1)} cm²) is placed in a ${c.acFreqHz} Hz alternating field of peak flux density ${c.fluxDensityMT.toFixed(1)} mT. What is the theoretical gradient of the $V_{\\mathrm{pp}}$ against $\\cos\\theta$ graph?`,
        `A search coil with $N = ${c.searchCoilTurns}$ turns of area ${c.searchCoilAreaCm2.toFixed(1)} cm² is oriented at $\\theta = ${c.angleThetaDeg}^\\circ$ inside an ${c.acFreqHz} Hz AC field of peak flux density ${c.fluxDensityMT.toFixed(1)} mT (RP11). Calculate the peak induced emf $\\varepsilon_0$ in mV.`,
      ];

      const dists: NumericDistractor[][] = [
        [
          { value: c.fluxDensityMT * 2, rationale: "Uses 2πf BAN instead of 4πf BAN for the peak-to-peak V_pp gradient." },
          { value: c.fluxDensityMT * 100, rationale: "Converts cm² to m² using 10⁻² instead of 10⁻⁴." },
          { value: c.fluxDensityMT / (2 * Math.PI), rationale: "Omits 2π when computing angular frequency ω = 2πf." },
        ],
        [
          { value: eps0, rationale: "Calculates peak emf ε₀ rather than peak-to-peak voltage V_pp = 2ε₀." },
          { value: vpp * Math.tan((c.angleThetaDeg * Math.PI) / 180), rationale: "Uses sin θ instead of cos θ where θ is the angle between normal and B." },
          { value: grad, rationale: "Forgets the cos θ factor (computes V_pp at θ = 0°)." },
        ],
        [
          { value: grad / 2, rationale: "Gives peak emf ε₀ (2πf BAN) instead of peak-to-peak V_pp (4πf BAN)." },
          { value: grad / (2 * Math.PI), rationale: "Omits 2π from ω = 2πf." },
          { value: grad * 2, rationale: "Multiplies by an extraneous factor of 2." },
        ],
        [
          { value: vpp, rationale: "Reports peak-to-peak voltage V_pp instead of peak emf ε₀." },
          { value: eps0 / numQ(q, "cosTheta"), rationale: "Omits cos θ at θ = 60°." },
          { value: eps0 * Math.sqrt(3), rationale: "Uses sin 60° instead of cos 60°." },
        ],
      ];

      out.push({
        id: makeId(`${c.slug}-qmcq-${i + 1}`),
        conceptId: "rp11-search-coil-flux-linkage",
        templateArchetype: "al-prac-rp11-search-coil-hall",
        seed,
        syllabi: TAG_3_7_5_Y13,
        format: "mcq",
        questionStyle: "experimental",
        difficulty: "higher",
        domain: "em-induction",
        scenarioSpec: spec,
        hiddenQuantities: [tKey],
        requiredGivens: [
          { name: "acFreqHz", value: c.acFreqHz, unit: "Hz", source: "either" },
          { name: "searchCoilTurns", value: c.searchCoilTurns, source: "stem" },
          { name: "searchCoilAreaCm2", value: c.searchCoilAreaCm2, source: "stem" },
          ...(i === 0
            ? [{ name: "gradVppVsCosThetaMv", value: grad, unit: "mV", source: "stem" as const }]
            : [
                { name: "fluxDensityMT", value: c.fluxDensityMT, unit: "mT", source: "stem" as const },
                ...(i !== 2 ? [{ name: "angleThetaDeg", value: c.angleThetaDeg, source: "stem" as const }] : []),
              ]),
        ],
        questionPlan: {
          targetSummary:
            "Determine AC peak flux density, peak to peak voltage, Vpp against cos theta gradient, or peak emf in required practical eleven",
        },
        stem: stems[i],
        options: buildNumOptions(truth, unit, dists[i], seed),
        targetMode: "quantitative",
        targetQuantityKey: tKey,
        workedSolution: `Peak induced emf $\\varepsilon_0 = 2\\pi f B A N \\cos\\theta$ and $V_{\\mathrm{pp}} = 2\\varepsilon_0 = (4\\pi f B A N)\\cos\\theta$. Substituting $A = ${c.searchCoilAreaCm2}\\times 10^{-4}$ m² gives gradient $= ${f3(grad, "mV")}$, $B = ${c.fluxDensityMT.toFixed(1)}$ mT, $\\varepsilon_0 = ${f3(eps0, "mV")}$, and $V_{\\mathrm{pp}} = ${f3(vpp, "mV")}$.`,
        markScheme: [
          { code: "A1", criterion: `Correctly determines ${tKey} $= ${f3(truth, unit)}$.`, marks: 1 },
        ],
        totalMarks: 1,
        generatorModel: model,
      });
    });

    // 4 Qualitative MCQs for RP11
    const rp11Quals = [
      {
        slug: "rp11-qual-ac-vs-hall",
        idx: 0,
        stem: "Why does the search coil in Required Practical 11 read zero if the large circular coil is powered by a steady direct current (DC) supply, and what instrument must replace it for static DC fields?",
        correct:
          "A search coil requires an alternating magnetic field to induce an emf whereas a hall probe measures static direct current magnetic flux density.",
        distractors: [
          {
            text: "A search coil induces its largest steady voltage in a static DC field while a Hall probe only detects 50 Hz AC fields.",
            rationale: "Faraday's law requires changing flux linkage (dΦ/dt ≠ 0); static DC produces zero induced emf in a stationary search coil.",
          },
          {
            text: "A search coil works in DC if you increase the number of turns N sufficiently.",
            rationale: "If dB/dt = 0, N dΦ/dt = 0 regardless of the number of turns.",
          },
          {
            text: "A Hall probe cannot measure magnetic flux density unless the probe is spun continuously.",
            rationale: "A Hall probe uses the steady Hall voltage across a current-carrying semiconductor slice in a static field.",
          },
        ] as const,
      },
      {
        slug: "rp11-qual-cos-orientation",
        idx: 1,
        stem: "In Required Practical 11, at what orientation of the search coil is the CRO peak-to-peak trace maximised, and why is an AC field essential?",
        correct:
          "Peak-to-peak voltage is maximum when the coil plane is perpendicular to B (normal parallel to B, θ = 0°), and a search coil requires an alternating magnetic field to induce an emf whereas a hall probe measures static direct current magnetic flux density.",
        distractors: [
          {
            text: "Induced emf is maximum when the plane of the search coil is parallel to the magnetic field lines.",
            rationale: "When the coil plane is parallel to B, zero flux passes through the coil (θ = 90°, cos 90° = 0).",
          },
          {
            text: "Rotating the coil changes the frequency of the CRO waveform rather than its amplitude.",
            rationale: "Frequency stays locked to the 50 Hz AC field; rotation scales amplitude by cos θ.",
          },
          {
            text: "Using a DC battery in the large coil gives a clearer steady horizontal line on the CRO proportional to B.",
            rationale: "Static DC induces zero emf in a stationary search coil.",
          },
        ] as const,
      },
      {
        slug: "rp11-qual-protractor-align",
        idx: 2,
        stem: "How does a student establish the true $\\theta = 0^\\circ$ reference angle accurately in Required Practical 11, and why can this experiment not use a permanent bar magnet?",
        correct:
          "Rotate the search coil to locate the maximum V_pp trace (or zero crossing at 90°) and view the protractor vertically to eliminate parallax; a bar magnet fails because a search coil requires an alternating magnetic field to induce an emf whereas a hall probe measures static direct current magnetic flux density.",
        distractors: [
          {
            text: "Eyeball the coil normal from the side and use a strong permanent neodymium magnet instead of the AC coil.",
            rationale: "Oblique viewing causes parallax error and a stationary permanent magnet induces zero emf.",
          },
          {
            text: "Keep the search coil fixed near the outer edge of the Helmholtz coil where the field is non-uniform.",
            rationale: "The search coil must stay centred on the axis where the magnetic field is uniform.",
          },
          {
            text: "Switch the CRO time-base on to maximum speed so the AC voltage turns into a DC reading.",
            rationale: "CRO time-base never converts AC to DC; in fact switching time-base OFF makes reading vertical V_pp quick and direct.",
          },
        ] as const,
      },
      {
        slug: "rp11-qual-timebase-off",
        idx: 3,
        stem: "In Required Practical 11, why do many students switch the CRO time-base OFF when measuring $V_{\\mathrm{pp}}$ at each search-coil angle $\\theta$, and what fundamental principle drives the induced voltage?",
        correct:
          "With time-base OFF the AC sinusoid forms a crisp vertical line of length V_pp along the central scale; this works because a search coil requires an alternating magnetic field to induce an emf whereas a hall probe measures static direct current magnetic flux density.",
        distractors: [
          {
            text: "Switching time-base OFF converts the AC waveform into a single stationary dot whose height equals V_rms.",
            rationale: "An AC signal with time-base OFF produces a vertical line of height V_pp, not a stationary dot.",
          },
          {
            text: "Switching time-base OFF doubles the magnetic flux linkage through the search coil.",
            rationale: "CRO controls affect only display deflection, never the magnetic field or flux linkage.",
          },
          {
            text: "Time-base OFF allows the search coil to measure static DC fields accurately.",
            rationale: "Static DC fields still produce zero induced emf in a stationary search coil.",
          },
        ] as const,
      },
    ];

    rp11Quals.forEach((b, i) => {
      const c = rp11Cases[b.idx];
      const spec: Record<string, unknown> = {
        kind: "al-prac-rp11-search-coil-hall",
        acFreqHz: c.acFreqHz,
        searchCoilTurns: c.searchCoilTurns,
        searchCoilAreaCm2: c.searchCoilAreaCm2,
        fluxDensityMT: c.fluxDensityMT,
        angleThetaDeg: c.angleThetaDeg,
        yGainMvPerDiv: c.yGainMvPerDiv,
      };
      const seed = nextSeed();
      out.push({
        id: makeId(`${b.slug}-${i + 1}`),
        conceptId: "rp11-search-coil-flux-linkage",
        templateArchetype: "al-prac-rp11-search-coil-hall",
        seed,
        syllabi: TAG_3_7_5_Y13,
        format: "mcq",
        questionStyle: "qualitative",
        difficulty: "standard",
        domain: "em-induction",
        scenarioSpec: spec,
        hiddenQuantities: ["hallVsSearchAnchor"],
        requiredGivens: [],
        questionPlan: {
          targetSummary:
            "Assess search coil AC requirement versus Hall probe DC capability, coil alignment, and CRO reading technique in required practical eleven",
        },
        stem: b.stem,
        options: buildVerbalOptions(b.correct, b.distractors, seed),
        targetMode: "qualitative",
        targetQuantityKey: "hallVsSearchAnchor",
        workedSolution: `RP11 mark-scheme precision: ${b.correct}`,
        markScheme: [{ code: "A1", criterion: b.correct, marks: 1 }],
        totalMarks: 1,
        generatorModel: model,
      });
    });

    // 4 Paper 3A Structured 8m Ladders
    rp11Cases.forEach((c, i) => {
      const spec: Record<string, unknown> = {
        kind: "al-prac-rp11-search-coil-hall",
        acFreqHz: c.acFreqHz,
        searchCoilTurns: c.searchCoilTurns,
        searchCoilAreaCm2: c.searchCoilAreaCm2,
        fluxDensityMT: c.fluxDensityMT,
        angleThetaDeg: c.angleThetaDeg,
        yGainMvPerDiv: c.yGainMvPerDiv,
      };
      const q = solveKind("al-prac-rp11-search-coil-hall", spec);
      const vpp = numQ(q, "vPeakToPeakMv");
      const divs = numQ(q, "peakToPeakDivs");
      const grad = numQ(q, "gradVppVsCosThetaMv");
      const anchor = strQ(q, "hallVsSearchAnchor");
      out.push({
        id: makeId(`${c.slug}-p3a-8m-${i + 1}`),
        conceptId: "rp11-search-coil-flux-linkage",
        templateArchetype: "al-prac-rp11-search-coil-hall",
        seed: nextSeed(),
        syllabi: TAG_3_7_5_Y13,
        format: "structured",
        questionStyle: "mixed-exam",
        difficulty: "higher",
        domain: "em-induction",
        scenarioSpec: spec,
        hiddenQuantities: ["vPeakToPeakMv", "gradVppVsCosThetaMv", "fluxDensityMT", "hallVsSearchAnchor"],
        requiredGivens: [
          { name: "acFreqHz", value: c.acFreqHz, unit: "Hz", source: "either" },
          { name: "searchCoilTurns", value: c.searchCoilTurns, source: "stem" },
          { name: "searchCoilAreaCm2", value: c.searchCoilAreaCm2, source: "stem" },
          { name: "angleThetaDeg", value: c.angleThetaDeg, source: "stem" },
          { name: "yGainMvPerDiv", value: c.yGainMvPerDiv, source: "stem" },
          { name: "peakToPeakDivs", value: divs, source: "stem" },
        ],
        questionPlan: {
          targetSummary:
            "Paper three section A required practical eleven search coil CRO measurement, Vpp vs cos theta gradient, flux density extraction, and Hall probe comparison",
        },
        stem: `In Required Practical 11, a search coil with $N = ${c.searchCoilTurns}$ turns of area ${c.searchCoilAreaCm2.toFixed(1)} cm² is centred inside a large circular coil driven by a ${c.acFreqHz} Hz AC supply. With the CRO Y-gain set to ${c.yGainMvPerDiv} mV div⁻¹ and the coil normal at $\\theta = ${c.angleThetaDeg}^\\circ$ to the field, the peak-to-peak vertical trace spans ${f3(divs)} divisions.`,
        parts: [
          {
            partId: "a",
            prompt: `Calculate the peak-to-peak induced voltage $V_{\\mathrm{pp}}$ at $\\theta = ${c.angleThetaDeg}^\\circ$.`,
            marks: 2,
            targetMode: "quantitative",
            targetQuantityKey: "vPeakToPeakMv",
            expectedAnswer: f3(vpp, "mV"),
            workingSteps: [`$V_{\\mathrm{pp}} = ${f3(divs)} \\times ${c.yGainMvPerDiv} = ${f3(vpp, "mV")}$.`],
          },
          {
            partId: "b",
            prompt: "Hence calculate the gradient of the straight-line graph of $V_{\\mathrm{pp}}$ against $\\cos\\theta$.",
            marks: 2,
            dependsOnPartIds: ["a"],
            targetMode: "quantitative",
            targetQuantityKey: "gradVppVsCosThetaMv",
            expectedAnswer: f3(grad, "mV"),
            workingSteps: [`Gradient $= V_{\\mathrm{pp}} / \\cos ${c.angleThetaDeg}^\\circ = ${f3(vpp)} / ${numQ(q, "cosTheta").toFixed(3)} = ${f3(grad, "mV")}$.`],
          },
          {
            partId: "c",
            prompt: "Use $\\varepsilon_0 = 2\\pi f B A N$ to determine the peak magnetic flux density $B$ in mT.",
            marks: 2,
            dependsOnPartIds: ["b"],
            targetMode: "quantitative",
            targetQuantityKey: "fluxDensityMT",
            expectedAnswer: f3(c.fluxDensityMT, "mT"),
            workingSteps: [
              `Gradient $= 4\\pi f B A N$, so $B = (${f3(grad)}\\times 10^{-3}) / (4\\pi \\times ${c.acFreqHz} \\times ${c.searchCoilAreaCm2}\\times 10^{-4} \\times ${c.searchCoilTurns}) = ${f3(c.fluxDensityMT, "mT")}$.`,
            ],
          },
          {
            partId: "d",
            prompt: "Explain why the search coil fails if the AC supply is replaced by a DC battery, and state what sensor should be used instead.",
            marks: 2,
            targetMode: "qualitative",
            targetQuantityKey: "hallVsSearchAnchor",
            expectedAnswer: anchor,
            workingSteps: [
              "Faraday's law requires rate of change of flux linkage d(NΦ)/dt ≠ 0, which is zero in static DC.",
              "Use a calibrated Hall probe (perpendicular to field) for static DC flux density.",
            ],
          },
        ],
        workedSolution: `(a) $V_{\\mathrm{pp}} = ${f3(vpp, "mV")}$. (b) Gradient $= ${f3(grad, "mV")}$. (c) $B = ${f3(c.fluxDensityMT, "mT")}$. (d) ${anchor}.`,
        markScheme: [
          { code: "M1", criterion: "Multiplies peak-to-peak divisions by Y-gain.", marks: 1, partId: "a" },
          { code: "A1", criterion: `$V_{\\mathrm{pp}} = ${f3(vpp, "mV")}$.`, marks: 1, partId: "a" },
          { code: "M1", criterion: `Divides $V_{\\mathrm{pp}}$ by $\\cos ${c.angleThetaDeg}^\\circ$.`, marks: 1, partId: "b" },
          { code: "A1", criterion: `Gradient $= ${f3(grad, "mV")}$.`, marks: 1, partId: "b" },
          { code: "M1", criterion: "Applies $V_{\\mathrm{pp,max}} = 4\\pi f B A N$ with $A$ in m².", marks: 1, partId: "c" },
          { code: "A1", criterion: `Peak flux density $B = ${f3(c.fluxDensityMT, "mT")}$.`, marks: 1, partId: "c" },
          { code: "B1", criterion: "Static DC field gives zero rate of change of flux linkage, so zero induced emf.", marks: 1, partId: "d" },
          { code: "B1", criterion: "Use a Hall probe to measure static DC magnetic flux density.", marks: 1, partId: "d" },
        ],
        totalMarks: 8,
        generatorModel: model,
      });
    });

    // 2 Authentic 6-Mark Experimental LoRs for RP11
    [
      {
        slug: "rp11-lor-search-coil",
        idx: 0,
        stem: "A student investigates how magnetic flux linkage $N\\Phi = B A N \\cos\\theta$ varies with angle $\\theta$ using a rotatable search coil mounted at the centre of a large 50 Hz AC circular coil connected to an oscilloscope.",
        prompt:
          "Describe a complete experimental procedure to verify the $\\cos\\theta$ relationship and determine the peak flux density $B$, including alignment, CRO settings, angle measurement precautions, graphical analysis, and contrast with a Hall probe. [6 marks]",
      },
      {
        slug: "rp11-lor-search-hall-compare",
        idx: 1,
        stem: "An A-Level physics class compares search-coil induction measurements inside an alternating Helmholtz coil against static field mapping in a direct-current solenoid.",
        prompt:
          "Design an accurate search-coil investigation of flux linkage versus angle $\\theta$, detailing how to maintain a constant uniform AC field, minimise reading uncertainty on the CRO and protractor, analyse the graph, and explain when a Hall probe is required. [6 marks]",
      },
    ].forEach((lor, idx) => {
      const c = rp11Cases[lor.idx];
      const spec: Record<string, unknown> = {
        kind: "al-prac-rp11-search-coil-hall",
        acFreqHz: c.acFreqHz,
        searchCoilTurns: c.searchCoilTurns,
        searchCoilAreaCm2: c.searchCoilAreaCm2,
        fluxDensityMT: c.fluxDensityMT,
        angleThetaDeg: c.angleThetaDeg,
        yGainMvPerDiv: c.yGainMvPerDiv,
      };
      const anchor = strQ(solveKind("al-prac-rp11-search-coil-hall", spec), "hallVsSearchAnchor");
      out.push(
        buildExperimentalLor6m({
          id: makeId(`${lor.slug}-6m-${idx + 1}`),
          seed: nextSeed(),
          model,
          domain: "em-induction",
          conceptId: "rp11-search-coil-flux-linkage",
          templateArchetype: "al-prac-rp11-lor",
          syllabi: TAG_3_7_5_Y13,
          difficulty: "higher",
          scenarioSpec: spec,
          anchorKey: "hallVsSearchAnchor",
          anchorText: anchor,
          requiredGivens: [],
          stem: lor.stem,
          prompt: lor.prompt,
          expectedAnswer: `Keep the AC coil current and frequency constant using a series ammeter, centre the search coil in the uniform field region, align θ = 0° at peak CRO voltage while reading the protractor directly from above to avoid parallax, switch time-base off or optimise Y-gain to record V_pp from 0° to 90° in 10° steps, plot V_pp against cos θ to confirm linearity and extract B = gradient / (4πfAN), noting that ${anchor}.`,
          workingSteps: [
            "Level 1: Keep AC frequency and rms current constant; centre search coil rigidly on axis inside large coil where field is uniform.",
            "Level 2: Locate θ = 0° (maximum V_pp, coil plane perpendicular to B); view protractor directly from above (or use set square) to prevent parallax; adjust Y-gain (and time-base OFF) for maximum vertical span.",
            "Level 3: Measure V_pp at >= 7 angles (0° to 90°), plot V_pp vs cos θ (straight line through origin), extract B = grad / (4πfAN), and contrast AC search coil vs DC Hall probe.",
          ],
          workedSolution: `Level 3 Model Response: Power the large circular/Helmholtz coil from a 50 Hz AC supply with a series ammeter so rms current (and hence peak flux density B) stays constant throughout. Clamp the rotatable search coil securely at the exact geometric centre of the large coil where the magnetic field is uniform. Rotate the search coil until the CRO shows maximum peak-to-peak vertical deflection (coil plane perpendicular to B, defining θ = 0°), and align the protractor pointer while viewing vertically from above to avoid parallax. Switch the CRO time-base OFF (displaying a crisp vertical bar of length V_pp) and choose a sensitive Y-gain filling most of the graticule to cut percentage uncertainty. Record V_pp every 10° from 0° to 90°, repeating readings while rotating back to reduce random error. Plot V_pp against cos θ: a straight best-fit line through the origin verifies NΦ = BAN cos θ, and its gradient equals 4πfBAN, yielding B = gradient / (4πfAN). Finally, note that ${anchor}.`,
          criteria: [
            "Maintains constant AC frequency and constant coil current (monitored with an ammeter) and positions search coil at the uniform centre.",
            "Defines θ = 0° cleanly (coil plane perpendicular to B / maximum V_pp) and reads protractor directly from above to avoid parallax.",
            "Optimises CRO Y-gain to fill screen (and optionally switches time-base OFF to measure vertical V_pp accurately).",
            "Measures V_pp across at least six angles from 0° to 90°, taking repeat readings to reduce random error.",
            "Plots V_pp against cos θ (straight line through origin confirms cos θ dependence) and computes B = gradient / (4πfAN).",
            "Contrasts sensors clearly: a search coil requires changing/AC magnetic flux whereas a Hall probe measures static DC magnetic fields.",
          ],
          targetSummary:
            "Six mark level of response experimental procedure for required practical eleven search coil flux linkage and Hall probe comparison",
        }),
      );
    });
  }

  /* ======================================================================== */
  /*  14. al-prac-rp12-gamma-inverse-square (16 items: 4 Q, 4 Qual, 6 9m, 2 LoR) */
  /* ======================================================================== */
  {
    const rp12Cases = [
      { slug: "rp12-co60-1", bgCount: 360, bgTimeMin: 15, constK: 2.25, sourceOffsetX0Mm: 24, x1Mm: 120, x2Mm: 360 },
      { slug: "rp12-cs137-2", bgCount: 540, bgTimeMin: 20, constK: 4.0, sourceOffsetX0Mm: 18, x1Mm: 150, x2Mm: 450 },
      { slug: "rp12-ra226-3", bgCount: 450, bgTimeMin: 15, constK: 1.96, sourceOffsetX0Mm: 30, x1Mm: 110, x2Mm: 390 },
      { slug: "rp12-ba133-4", bgCount: 480, bgTimeMin: 20, constK: 3.24, sourceOffsetX0Mm: 22, x1Mm: 140, x2Mm: 420 },
      { slug: "rp12-co60-5", bgCount: 300, bgTimeMin: 15, constK: 2.56, sourceOffsetX0Mm: 26, x1Mm: 130, x2Mm: 370 },
      { slug: "rp12-cs137-6", bgCount: 420, bgTimeMin: 20, constK: 3.61, sourceOffsetX0Mm: 16, x1Mm: 160, x2Mm: 440 },
    ];

    // 4 Quantitative MCQs
    rp12Cases.slice(0, 4).forEach((c, i) => {
      const spec: Record<string, unknown> = {
        kind: "al-prac-rp12-gamma-inverse-square",
        bgCount: c.bgCount,
        bgTimeMin: c.bgTimeMin,
        constK: c.constK,
        sourceOffsetX0Mm: c.sourceOffsetX0Mm,
        x1Mm: c.x1Mm,
        x2Mm: c.x2Mm,
      };
      const q = solveKind("al-prac-rp12-gamma-inverse-square", spec);
      const bgRate = numQ(q, "bgRatePerS");
      const inv1 = numQ(q, "invSqrtC1");
      const inv2 = numQ(q, "invSqrtC2");
      const grad = numQ(q, "gradInvSqrtCPerM");
      const yInt = numQ(q, "yInterceptInvSqrtC");
      const cCorr1 = numQ(q, "cCorr1");
      const cCorr2 = numQ(q, "cCorr2");
      const seed = nextSeed();

      const tKeys = ["bgRatePerS", "sourceOffsetX0Mm", "constK", "cCorr2"] as const;
      const units = ["s⁻¹", "mm", "s⁻¹ m²", "s⁻¹"] as const;
      const tKey = tKeys[i];
      const unit = units[i];
      const truth = numQ(q, tKey);

      const stems = [
        `Before bringing out the sealed gamma source in Required Practical 12, a student records ${c.bgCount} background counts over ${c.bgTimeMin} minutes to reduce random percentage uncertainty. What is the mean background count rate $C_{\\mathrm{bg}}$ in s⁻¹?`,
        `In Required Practical 12, a student plots $1/\\sqrt{C_{\\mathrm{corr}}}$ against measured ruler distance $x$ (in m) and obtains a straight line of gradient ${f3(grad, "s^{1/2} m⁻¹")} and vertical intercept ${f3(yInt, "s^{1/2}")}. Calculate the hidden systematic offset distance $x_0$ inside the source and GM tube (in mm).`,
        `During Required Practical 12, plotting $1/\\sqrt{C_{\\mathrm{corr}}}$ against measured separation $x$ (in m) produces a straight line passing through $(${(c.x1Mm * 1e-3).toFixed(2)}\\text{ m}, ${f3(inv1)})$ and $(${(c.x2Mm * 1e-3).toFixed(2)}\\text{ m}, ${f3(inv2)})$. Determine the inverse-square constant $k$ in $C_{\\mathrm{corr}} = k / (x + x_0)^2$.`,
        `In Required Practical 12 with systematic offset $x_0 = ${c.sourceOffsetX0Mm}$ mm, the background-corrected gamma count rate at ruler distance $x_1 = ${c.x1Mm}$ mm is ${f3(cCorr1, "s⁻¹")}. Predict the corrected count rate at $x_2 = ${c.x2Mm}$ mm.`,
      ];

      const dists: NumericDistractor[][] = [
        [
          { value: c.bgCount / c.bgTimeMin, rationale: "Reports counts per minute instead of counts per second (s⁻¹)." },
          { value: Math.sqrt(c.bgCount) / (c.bgTimeMin * 60), rationale: "Uses √N instead of N for the mean count rate." },
          { value: bgRate * 2, rationale: "Halves the counting duration." },
        ],
        [
          { value: (grad / yInt) * 1000, rationale: "Computes gradient / intercept instead of intercept / gradient." },
          { value: yInt * 1000, rationale: "Equates the vertical intercept directly to x₀ without dividing by the gradient." },
          { value: c.sourceOffsetX0Mm * 0.5, rationale: "Halves the offset distance." },
        ],
        [
          { value: grad, rationale: "Equates constant k to the gradient 1/√k." },
          { value: 1 / grad, rationale: "Computes √k instead of k = 1 / gradient²." },
          { value: grad * grad, rationale: "Squares the gradient instead of taking 1 / gradient²." },
        ],
        [
          { value: cCorr1 * (c.x1Mm / c.x2Mm) ** 2, rationale: "Applies inverse-square ratio using x₁/x₂ while ignoring the systematic offset x₀." },
          { value: cCorr1 * ((c.x1Mm + c.sourceOffsetX0Mm) / (c.x2Mm + c.sourceOffsetX0Mm)), rationale: "Uses linear 1/r scaling instead of inverse-square 1/r² scaling." },
          { value: cCorr2 + bgRate, rationale: "Adds background rate back onto the corrected count rate." },
        ],
      ];

      out.push({
        id: makeId(`${c.slug}-qmcq-${i + 1}`),
        conceptId: "rp12-gamma-inverse-square",
        templateArchetype: "al-prac-rp12-gamma-inverse-square",
        seed,
        syllabi: TAG_3_8_Y13,
        format: "mcq",
        questionStyle: "experimental",
        difficulty: i === 0 ? "foundation" : "higher",
        domain: "quantum-nuclear",
        scenarioSpec: spec,
        hiddenQuantities: [tKey],
        requiredGivens:
          i === 0
            ? [
                { name: "bgCount", value: c.bgCount, source: "stem" },
                { name: "bgTimeMin", value: c.bgTimeMin, source: "stem" },
              ]
            : i === 1
              ? [
                  { name: "gradInvSqrtCPerM", value: grad, source: "stem" },
                  { name: "yInterceptInvSqrtC", value: yInt, source: "stem" },
                ]
              : i === 2
                ? [
                    { name: "x1M", value: c.x1Mm * 1e-3, unit: "m", source: "stem" },
                    { name: "invSqrtC1", value: inv1, source: "stem" },
                    { name: "x2M", value: c.x2Mm * 1e-3, unit: "m", source: "stem" },
                    { name: "invSqrtC2", value: inv2, source: "stem" },
                  ]
                : [
                    { name: "sourceOffsetX0Mm", value: c.sourceOffsetX0Mm, unit: "mm", source: "stem" },
                    { name: "x1Mm", value: c.x1Mm, unit: "mm", source: "stem" },
                    { name: "cCorr1", value: cCorr1, source: "stem" },
                    { name: "x2Mm", value: c.x2Mm, unit: "mm", source: "stem" },
                  ],
        questionPlan: {
          targetSummary:
            "Determine background rate, systematic internal offset, inverse square constant, or predicted corrected count rate in required practical twelve",
        },
        stem: stems[i],
        options: buildNumOptions(truth, unit, dists[i], seed),
        targetMode: "quantitative",
        targetQuantityKey: tKey,
        workedSolution: `Background rate $C_{\\mathrm{bg}} = ${c.bgCount}/(${c.bgTimeMin}\\times 60) = ${f3(bgRate, "s⁻¹")}$. From $1/\\sqrt{C_{\\mathrm{corr}}} = (x + x_0)/\\sqrt{k}$, gradient $= 1/\\sqrt{k} = ${f3(grad)}$, so $k = ${f3(c.constK, "s⁻¹ m²")}$, $x_0 = \\text{intercept}/\\text{grad} = ${c.sourceOffsetX0Mm}$ mm, and $C_{\\mathrm{corr},2} = ${f3(cCorr2, "s⁻¹")}$.`,
        markScheme: [
          { code: "A1", criterion: `Correctly determines ${tKey} $= ${f3(truth, unit)}$.`, marks: 1 },
        ],
        totalMarks: 1,
        generatorModel: model,
      });
    });

    // 4 Qualitative MCQs for RP12
    const rp12Quals = [
      {
        slug: "rp12-qual-inv-sqrt-why",
        idx: 0,
        stem: "Why does AQA Required Practical 12 recommend plotting $1/\\sqrt{C_{\\mathrm{corr}}}$ against ruler distance $x$ rather than plotting $C_{\\mathrm{corr}}$ against $1/x^2$, and what handling controls are essential?",
        correct:
          "Plotting 1/√C_corr vs x stays linear with negative x-intercept −x₀ despite unknown internal offset; students must handle the sealed gamma source with long tongs maximise distance minimise exposure time outside lead storage and plot one over square root corrected count rate against x to reveal systematic offset.",
        distractors: [
          {
            text: "Plotting C_corr against 1/x² always gives a straight line through the origin even with an unknown internal offset x₀.",
            rationale: "Because true distance is x + x₀, C_corr = k/(x + x₀)² curves significantly when plotted against 1/x².",
          },
          {
            text: "Simply avoiding touching the source with bare fingers is a sufficient radiological safety protocol.",
            rationale: "AQA mark schemes explicitly reject bare 'do not touch'; specify long tongs, maximum distance, minimum exposure time, and lead-lined storage.",
          },
          {
            text: "Plotting 1/√C_corr vs x eliminates the need to subtract background radiation.",
            rationale: "Background count rate MUST be subtracted before taking 1/√C_corr, otherwise the line bends horizontally at large x.",
          },
        ] as const,
      },
      {
        slug: "rp12-qual-bg-duration",
        idx: 1,
        stem: "Why should the background count in Required Practical 12 be recorded over 15–20 minutes (with the source sealed away in its lead box) rather than for 30 seconds?",
        correct:
          "Radioactive decay is random so a long counting interval records a much larger total count N, reducing random percentage uncertainty; throughout, handle the sealed gamma source with long tongs maximise distance minimise exposure time outside lead storage and plot one over square root corrected count rate against x to reveal systematic offset.",
        distractors: [
          {
            text: "Because background radiation decays exponentially during the first 10 minutes of a lesson.",
            rationale: "Natural background count rate is approximately constant in mean over a lesson; longer intervals cut random statistical spread √N/N.",
          },
          {
            text: "Because a 20-minute background measurement eliminates all statistical randomness in the GM tube.",
            rationale: "Long intervals reduce random percentage uncertainty but never eliminate the random nature of decay.",
          },
          {
            text: "Because background radiation consists entirely of alpha particles that take 15 minutes to reach the tube.",
            rationale: "Background radiation includes cosmic rays, radon, and terrestrial gamma/beta emitters arriving continuously at random times.",
          },
        ] as const,
      },
      {
        slug: "rp12-qual-offset-meaning",
        idx: 2,
        stem: "In Required Practical 12, what physically produces the systematic offset $x_0$ obtained from the negative horizontal intercept of the $1/\\sqrt{C_{\\mathrm{corr}}}$ against $x$ graph?",
        correct:
          "The recessed depth of the radioactive pellet inside its metal capsule plus the sensitive volume depth behind the GM tube window; safely, handle the sealed gamma source with long tongs maximise distance minimise exposure time outside lead storage and plot one over square root corrected count rate against x to reveal systematic offset.",
        distractors: [
          {
            text: "Air absorption of gamma photons between the source and the GM tube window.",
            rationale: "Gamma attenuation in 0.5 m of air is negligible; x₀ is the geometric internal distance inside source holder and GM tube.",
          },
          {
            text: "Background radiation that was subtracted twice by mistake.",
            rationale: "Background subtraction error bends the curve at large x rather than producing a clean geometric shift x₀.",
          },
          {
            text: "The finite thickness of the wooden metre ruler.",
            rationale: "The ruler scale sits parallel to the separation axis; x₀ comes from inaccessible source and detector internal positions.",
          },
        ] as const,
      },
      {
        slug: "rp12-qual-gamma-only",
        idx: 3,
        stem: "Why does Required Practical 12 verify the inverse-square law using a gamma source (often with a thin aluminium absorber if beta is also emitted) rather than an alpha source?",
        correct:
          "Gamma rays are negligibly absorbed in air over 0.1–0.6 m whereas alpha range is only a few cm; always handle the sealed gamma source with long tongs maximise distance minimise exposure time outside lead storage and plot one over square root corrected count rate against x to reveal systematic offset.",
        distractors: [
          {
            text: "Because alpha particles travel faster than light and bypass the GM tube dead time.",
            rationale: "Alpha particles are massive, slow, strongly ionising, and stopped by ~5 cm of air.",
          },
          {
            text: "Because gamma rays are deflected magnetically into a parallel non-diverging beam.",
            rationale: "Gamma rays are uncharged EM photons radiating isotropically (1/r² geometric spreading).",
          },
          {
            text: "Because sealed gamma sources are harmless outside lead storage boxes.",
            rationale: "Gamma radiation is highly penetrating and requires strict ALARA controls (time, distance, shielding, tongs).",
          },
        ] as const,
      },
    ];

    rp12Quals.forEach((b, i) => {
      const c = rp12Cases[b.idx];
      const spec: Record<string, unknown> = {
        kind: "al-prac-rp12-gamma-inverse-square",
        bgCount: c.bgCount,
        bgTimeMin: c.bgTimeMin,
        constK: c.constK,
        sourceOffsetX0Mm: c.sourceOffsetX0Mm,
        x1Mm: c.x1Mm,
        x2Mm: c.x2Mm,
      };
      const seed = nextSeed();
      out.push({
        id: makeId(`${b.slug}-${i + 1}`),
        conceptId: "rp12-gamma-inverse-square",
        templateArchetype: "al-prac-rp12-gamma-inverse-square",
        seed,
        syllabi: TAG_3_8_Y13,
        format: "mcq",
        questionStyle: "qualitative",
        difficulty: "standard",
        domain: "quantum-nuclear",
        scenarioSpec: spec,
        hiddenQuantities: ["rp12SafetyAnchor"],
        requiredGivens: [],
        questionPlan: {
          targetSummary:
            "Assess inverse square gamma linearization, internal offset origin, long background timing, and radiological safety in required practical twelve",
        },
        stem: b.stem,
        options: buildVerbalOptions(b.correct, b.distractors, seed),
        targetMode: "qualitative",
        targetQuantityKey: "rp12SafetyAnchor",
        workedSolution: `RP12 mark-scheme precision: ${b.correct}`,
        markScheme: [{ code: "A1", criterion: b.correct, marks: 1 }],
        totalMarks: 1,
        generatorModel: model,
      });
    });

    // 6 Paper 3A Structured 9m Ladders (split across two family archetypes <= 12 each)
    rp12Cases.forEach((c, i) => {
      const spec: Record<string, unknown> = {
        kind: "al-prac-rp12-gamma-inverse-square",
        bgCount: c.bgCount,
        bgTimeMin: c.bgTimeMin,
        constK: c.constK,
        sourceOffsetX0Mm: c.sourceOffsetX0Mm,
        x1Mm: c.x1Mm,
        x2Mm: c.x2Mm,
      };
      const q = solveKind("al-prac-rp12-gamma-inverse-square", spec);
      const bgRate = numQ(q, "bgRatePerS");
      const cRaw1 = numQ(q, "cRaw1");
      const cRaw2 = numQ(q, "cRaw2");
      const cCorr1 = numQ(q, "cCorr1");
      const cCorr2 = numQ(q, "cCorr2");
      const inv1 = numQ(q, "invSqrtC1");
      const inv2 = numQ(q, "invSqrtC2");
      const grad = numQ(q, "gradInvSqrtCPerM");
      const anchor = strQ(q, "rp12SafetyAnchor");
      out.push({
        id: makeId(`${c.slug}-p3a-9m-${i + 1}`),
        conceptId: "rp12-gamma-inverse-square",
        templateArchetype:
          i < 3
            ? "al-prac-rp12-gamma-inverse-square"
            : "al-prac-rp12-gamma-data-ladder",
        seed: nextSeed(),
        syllabi: TAG_3_8_Y13,
        format: "structured",
        questionStyle: "mixed-exam",
        difficulty: "higher",
        domain: "quantum-nuclear",
        scenarioSpec: spec,
        hiddenQuantities: [
          "bgRatePerS",
          "constK",
          "sourceOffsetX0Mm",
          "rp12SafetyAnchor",
        ],
        requiredGivens: [
          { name: "bgCount", value: c.bgCount, source: "stem" },
          { name: "bgTimeMin", value: c.bgTimeMin, source: "stem" },
          { name: "x1Mm", value: c.x1Mm, unit: "mm", source: "stem" },
          { name: "cRaw1", value: cRaw1, source: "stem" },
          { name: "x2Mm", value: c.x2Mm, unit: "mm", source: "stem" },
          { name: "cRaw2", value: cRaw2, source: "stem" },
        ],
        questionPlan: {
          targetSummary:
            "Paper three section A required practical twelve gamma inverse square background subtraction, constant k, systematic offset x zero, and safety evaluation",
        },
        stem: `In Required Practical 12, a student records ${c.bgCount} background counts in ${c.bgTimeMin} minutes before mounting a sealed gamma source opposite a GM tube. At measured ruler separations $x_1 = ${c.x1Mm}$ mm and $x_2 = ${c.x2Mm}$ mm, the raw count rates are ${f4(cRaw1, "s⁻¹")} and ${f4(cRaw2, "s⁻¹")} respectively.`,
        parts: [
          {
            partId: "a",
            prompt: "Calculate the background count rate $C_{\\mathrm{bg}}$ in s⁻¹.",
            marks: 1,
            targetMode: "quantitative",
            targetQuantityKey: "bgRatePerS",
            expectedAnswer: f3(bgRate, "s⁻¹"),
            workingSteps: [`$C_{\\mathrm{bg}} = ${c.bgCount} / (${c.bgTimeMin} \\times 60) = ${f3(bgRate, "s⁻¹")}$.`],
          },
          {
            partId: "b",
            prompt: "Subtract background radiation, compute $1/\\sqrt{C_{\\mathrm{corr}}}$ at both positions, and determine the inverse-square constant $k$ from the gradient of $1/\\sqrt{C_{\\mathrm{corr}}}$ against $x$.",
            marks: 3,
            dependsOnPartIds: ["a"],
            targetMode: "quantitative",
            targetQuantityKey: "constK",
            expectedAnswer: f3(c.constK, "s⁻¹ m²"),
            workingSteps: [
              `$C_{\\mathrm{corr},1} = ${f4(cCorr1)}$ s⁻¹ $\\Rightarrow 1/\\sqrt{C_{\\mathrm{corr},1}} = ${f4(inv1)}$ s$^{1/2}$.`,
              `$C_{\\mathrm{corr},2} = ${f4(cCorr2)}$ s⁻¹ $\\Rightarrow 1/\\sqrt{C_{\\mathrm{corr},2}} = ${f4(inv2)}$ s$^{1/2}$.`,
              `Gradient $= (${f4(inv2)} - ${f4(inv1)}) / (${(c.x2Mm * 1e-3).toFixed(3)} - ${(c.x1Mm * 1e-3).toFixed(3)}) = ${f3(grad)}$; $k = 1 / \\mathrm{grad}^2 = ${f3(c.constK, "s⁻¹ m²")}$.`,
            ],
          },
          {
            partId: "c",
            prompt: "Determine the hidden internal systematic offset $x_0$ in mm.",
            marks: 2,
            dependsOnPartIds: ["b"],
            targetMode: "quantitative",
            targetQuantityKey: "sourceOffsetX0Mm",
            expectedAnswer: f3(c.sourceOffsetX0Mm, "mm"),
            workingSteps: [
              `$x_0 = (1/\\sqrt{C_{\\mathrm{corr},1}})/\\mathrm{grad} - x_1 = ${f3(c.sourceOffsetX0Mm, "mm")}$.`,
            ],
          },
          {
            partId: "d",
            prompt: "State the required radiological safety precautions and explain why plotting $1/\\sqrt{C_{\\mathrm{corr}}}$ against $x$ is preferred over $C_{\\mathrm{corr}}$ against $1/x^2$.",
            marks: 3,
            targetMode: "qualitative",
            targetQuantityKey: "rp12SafetyAnchor",
            expectedAnswer: anchor,
            workingSteps: [
              "Long tongs, maximum distance, point source away from people, minimal time outside lead-lined box.",
              "1/√C_corr = (x + x₀)/√k stays strictly linear and directly yields x₀ from negative x-intercept.",
            ],
          },
        ],
        workedSolution: `(a) $C_{\\mathrm{bg}} = ${f3(bgRate, "s⁻¹")}$. (b) Subtracting background gives $C_{\\mathrm{corr},1} = ${f4(cCorr1)}$ s⁻¹ and $C_{\\mathrm{corr},2} = ${f4(cCorr2)}$ s⁻¹; gradient of $1/\\sqrt{C_{\\mathrm{corr}}}$ vs $x$ is ${f3(grad)}, so $k = 1/\\mathrm{grad}^2 = ${f3(c.constK, "s⁻¹ m²")}$. (c) $x_0 = ${f3(c.sourceOffsetX0Mm, "mm")}$. (d) ${anchor}.`,
        markScheme: [
          { code: "A1", criterion: `Background count rate $C_{\\mathrm{bg}} = ${f3(bgRate, "s⁻¹")}$.`, marks: 1, partId: "a" },
          { code: "M1", criterion: "Subtracts $C_{\\mathrm{bg}}$ from both raw rates and calculates $1/\\sqrt{C_{\\mathrm{corr}}}$.", marks: 1, partId: "b" },
          { code: "M1", criterion: "Finds gradient $\\Delta(1/\\sqrt{C_{\\mathrm{corr}}})/\\Delta x = 1/\\sqrt{k}$.", marks: 1, partId: "b" },
          { code: "A1", criterion: `Inverse-square constant $k = ${f3(c.constK, "s⁻¹ m²")}$.`, marks: 1, partId: "b" },
          { code: "M1", criterion: "Solves $1/\\sqrt{C_{\\mathrm{corr}}} = (x + x_0)/\\sqrt{k}$ (or intercept/gradient) for $x_0$.", marks: 1, partId: "c" },
          { code: "A1", criterion: `Systematic offset $x_0 = ${f3(c.sourceOffsetX0Mm, "mm")}$.`, marks: 1, partId: "c" },
          { code: "B1", criterion: "Long tongs + maximise distance + minimise time out of lead-lined box (reject bare 'do not touch').", marks: 1, partId: "d" },
          { code: "B1", criterion: "Explains $1/\\sqrt{C_{\\mathrm{corr}}}$ vs $x$ remains linear despite unknown $x_0$ (whereas $C$ vs $1/x^2$ curves).", marks: 1, partId: "d" },
          { code: "B1", criterion: "Identifies negative x-intercept $-x_0$ as the hidden offset inside source capsule and GM tube.", marks: 1, partId: "d" },
        ],
        totalMarks: 9,
        generatorModel: model,
      });
    });

    // 2 Authentic 6-Mark Experimental LoRs for RP12
    [
      {
        slug: "rp12-lor-gamma-inv-sq",
        idx: 0,
        stem: "A Year 13 student must experimentally verify the inverse-square law for gamma radiation using a sealed cobalt-60 source, a GM tube with counter-timer, and a metre ruler.",
        prompt:
          "Describe a safe, high-precision practical procedure to verify the inverse-square law graphically and account for both background radiation and the unknown internal offset $x_0$. [6 marks]",
      },
      {
        slug: "rp12-lor-gamma-offset",
        idx: 1,
        stem: "During a Paper 3A planning task, a student notices that plotting corrected gamma count rate against $1/x^2$ gives a curved graph rather than a straight line through the origin.",
        prompt:
          "Plan an improved Required Practical 12 procedure using $1/\\sqrt{C_{\\mathrm{corr}}}$ against $x$, detailing radiological safety, long background measurement, counting strategy, and how both $k$ and $x_0$ are extracted. [6 marks]",
      },
    ].forEach((lor, idx) => {
      const c = rp12Cases[lor.idx];
      const spec: Record<string, unknown> = {
        kind: "al-prac-rp12-gamma-inverse-square",
        bgCount: c.bgCount,
        bgTimeMin: c.bgTimeMin,
        constK: c.constK,
        sourceOffsetX0Mm: c.sourceOffsetX0Mm,
        x1Mm: c.x1Mm,
        x2Mm: c.x2Mm,
      };
      const anchor = strQ(solveKind("al-prac-rp12-gamma-inverse-square", spec), "rp12SafetyAnchor");
      out.push(
        buildExperimentalLor6m({
          id: makeId(`${lor.slug}-6m-${idx + 1}`),
          seed: nextSeed(),
          model,
          domain: "quantum-nuclear",
          conceptId: "rp12-gamma-inverse-square",
          templateArchetype: "al-prac-rp12-lor",
          syllabi: TAG_3_8_Y13,
          difficulty: "higher",
          scenarioSpec: spec,
          anchorKey: "rp12SafetyAnchor",
          anchorText: anchor,
          requiredGivens: [],
          stem: lor.stem,
          prompt: lor.prompt,
          expectedAnswer: `${anchor}; record background counts over 15–20 minutes with the source sealed away to obtain C_bg, record counts across >= 6 distances using longer counting times at larger distances so total counts stay large, subtract C_bg to form C_corr, plot 1/√C_corr against x for a straight line of gradient 1/√k, and read −x₀ from the negative x-intercept.`,
          workingSteps: [
            "Level 1: Strict radiological safety (long tongs, max distance, point away from people, minimal time outside lead-lined box).",
            "Level 2: Record background over 15–20 min before unpacking source; align GM tube coaxially along metre ruler; record counts across >= 6 distances (longer counting time at large x to keep random % uncertainty small).",
            "Level 3: Subtract C_bg -> C_corr, linearize via 1/√C_corr = (x + x₀)/√k, plot 1/√C_corr vs x, confirm straight line (inverse-square law), extract k = 1/grad² and internal offset x₀ from negative x-intercept.",
          ],
          workedSolution: `Level 3 Model Response: Before unpacking the sealed source, keep it locked in its lead-lined storage box far away and record background counts over a long period (15–20 minutes) to calculate an accurate mean background rate C_bg = N_bg / t_bg with low random percentage uncertainty. Observe strict radiological safety: handle the source strictly with long tongs, point it away from everyone, maximise distance from the source, and minimise time out of lead storage. Clamp the GM tube coaxially facing the source along a metre ruler. Measure counts at least six separations x (e.g. 0.10 m to 0.50 m), increasing counting duration at larger distances (and taking repeats) so total counts remain high enough to limit statistical percentage uncertainty, while avoiding ultra-close distances where GM dead time saturates counts. Compute corrected count rate C_corr = N/t − C_bg at every distance, then plot 1/√C_corr against x. A straight best-fit line verifies C_corr = k / (x + x₀)², with gradient 1/√k (giving k = 1/gradient²) and negative x-intercept −x₀ revealing the hidden internal distance inside the source holder and GM tube.`,
          criteria: [
            "States authentic radiological safety controls: long tongs, maximise distance, point away from people, and minimise time out of lead-lined storage box (reject bare 'do not touch').",
            "Measures background count over a long duration (15–20 min) with source away in lead box to reduce random percentage uncertainty in C_bg.",
            "Aligns GM tube and source coaxially along a metre ruler and records counts across >= 6 distances (avoiding GM dead-time saturation close in).",
            "Uses longer counting intervals and/or repeats at larger separations so total counts remain large enough to reduce random percentage uncertainty.",
            "Subtracts background rate to obtain C_corr = N/t − C_bg and plots 1/√C_corr against x (explaining why C_corr vs 1/x² curves due to x₀).",
            "Confirms straight line verifies inverse-square law, extracts k = 1/gradient², and reads hidden systematic offset −x₀ from the negative x-intercept.",
          ],
          targetSummary:
            "Six mark level of response experimental procedure for required practical twelve gamma radiation inverse square law",
        }),
      );
    });
  }

  return out;
}
