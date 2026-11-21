import { buildOptionEquivalenceKey } from "@/lib/bank-pipeline/numeric-checker";
import type {
  CandidateQuestionInput,
  CandidateQuestionPlan,
  MarkSchemePoint,
  McqOptionItem,
  PhysicsDomainId,
  QuestionDifficulty,
  QuestionStyleTag,
  RequiredGivenSpec,
  StructuredQuestionPart,
  SyllabusTag,
} from "@/lib/bank-pipeline/types";
import { MCQ_OPTION_LABELS } from "@/lib/bank-pipeline/types";
import {
  ALEVEL_OPTIONS_ENG_ELEC_PLUGINS_BY_KIND,
  type LogicCircuitId,
} from "@/lib/visuals/alevel-options-eng-elec";

export const ALEVEL_OPT_EE_DEFAULT_BASE_SEED = 77_000_000;
export const ALEVEL_OPT_EE_ID_PREFIX = "sp-v3-al-optee";
export const ALEVEL_OPT_EE_DEFAULT_MODEL =
  "deterministic-alevel-opt-eng-elec-v3/1.0.0";

export interface GenerateAlevelOptionsEngElecOptions {
  readonly baseSeed?: number;
  readonly generatorModel?: string;
}

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

function fmtSig(value: number, sf: number, unit?: string): string {
  if (!Number.isFinite(value) || Object.is(value, -0) || Math.abs(value) < 1e-35) {
    if (!unit) return "0";
    return unit === "%" ? "0%" : `0 ${unit}`;
  }
  const sign = value < 0 ? "−" : "";
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

function fmt3(v: number, unit?: string): string {
  return fmtSig(v, 3, unit);
}

function fmtInt(v: number, unit?: string): string {
  const n = Math.round(v);
  const s = n < 0 ? `−${Math.abs(n)}` : String(n);
  if (!unit) return s;
  return unit === "%" ? `${s}%` : `${s} ${unit}`;
}

function solveKind(
  kind: string,
  spec: Record<string, unknown>,
): Record<string, number | string | boolean> {
  const plugin = ALEVEL_OPTIONS_ENG_ELEC_PLUGINS_BY_KIND[kind];
  if (!plugin) {
    throw new Error(`Missing plugin for kind "${kind}"`);
  }
  const check = plugin.validate(spec);
  if (!check.valid) {
    throw new Error(`Invalid spec for "${kind}": ${check.issues.join("; ")}`);
  }
  return plugin.solve(spec).quantities;
}

function engTag(): SyllabusTag[] {
  return [
    {
      syllabus: "alevel",
      level: "Y13",
      topicId: "alevel-options-9-13",
      subtopicId: "alevel-3-11-engineering-physics",
    },
  ];
}

function elecTag(): SyllabusTag[] {
  return [
    {
      syllabus: "alevel",
      level: "Y13",
      topicId: "alevel-options-9-13",
      subtopicId: "alevel-3-13-electronics",
    },
  ];
}

interface NumDistractor {
  readonly value: number;
  readonly rationale: string;
}

interface VerbDistractor {
  readonly text: string;
  readonly rationale: string;
}

function valuesDistinct3sf(a: number, b: number): boolean {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  const scale = Math.max(Math.abs(a), Math.abs(b), 1e-12);
  if (Math.abs(a - b) / scale < 0.04) return false;
  return a.toPrecision(3) !== b.toPrecision(3);
}

function buildNumOptions(
  correctVal: number,
  unit: string | undefined,
  distractors: readonly NumDistractor[],
  seed: number,
  integerMode = false,
): McqOptionItem[] {
  const formatter = integerMode ? fmtInt : fmt3;
  const correctText = formatter(correctVal, unit);
  const usedKeys = new Set<string>([buildOptionEquivalenceKey(correctText)]);
  const usedVals: number[] = [correctVal];
  const chosen: Array<{ text: string; rationale: string }> = [];

  const fallbacks: NumDistractor[] = integerMode
    ? [
        {
          value: correctVal + 1,
          rationale: "Off-by-one counting error on the discrete integer step.",
        },
        {
          value: Math.max(0, correctVal - 1),
          rationale: "Under-counts by one state or channel.",
        },
        {
          value: correctVal + 2,
          rationale: "Misapplies the discrete cycle length by two counts.",
        },
        {
          value: correctVal + 3,
          rationale: "Uses an incorrect modulus or channel allocation.",
        },
      ]
    : [
        {
          value: correctVal * 0.5,
          rationale: "Introduces an erroneous factor of one-half during rearrangement.",
        },
        {
          value: correctVal * 2.0,
          rationale: "Doubles the target quantity by omitting a factor of two.",
        },
        {
          value: correctVal * 1.45,
          rationale: "Applies an incorrect scaling constant in the formula.",
        },
        {
          value: correctVal * 0.72,
          rationale: "Substitutes an intermediate quantity before completing the step.",
        },
      ];

  for (const cand of [...distractors, ...fallbacks]) {
    if (chosen.length >= 3) break;
    if (!Number.isFinite(cand.value)) continue;
    if (!integerMode && Math.abs(cand.value) < 1e-12) continue;
    const isDistinct = integerMode
      ? usedVals.every((v) => Math.round(v) !== Math.round(cand.value))
      : usedVals.every((v) => valuesDistinct3sf(cand.value, v));
    if (!isDistinct) continue;
    const text = formatter(cand.value, unit);
    const key = buildOptionEquivalenceKey(text);
    if (usedKeys.has(key)) continue;
    usedKeys.add(key);
    usedVals.push(cand.value);
    chosen.push({ text, rationale: cand.rationale });
  }

  const slot = ((seed % 4) + 4) % 4;
  const out: McqOptionItem[] = [];
  let di = 0;
  for (let i = 0; i < 4; i += 1) {
    if (i === slot) {
      out.push({
        label: MCQ_OPTION_LABELS[i],
        text: correctText,
        isCorrect: true,
      });
    } else {
      const d = chosen[di];
      di += 1;
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

function buildVerbOptions(
  correctText: string,
  distractors: readonly [VerbDistractor, VerbDistractor, VerbDistractor],
  seed: number,
): McqOptionItem[] {
  const slot = ((seed % 4) + 4) % 4;
  const out: McqOptionItem[] = [];
  let di = 0;
  for (let i = 0; i < 4; i += 1) {
    if (i === slot) {
      out.push({
        label: MCQ_OPTION_LABELS[i],
        text: correctText,
        isCorrect: true,
      });
    } else {
      const d = distractors[di];
      di += 1;
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

function capitalizeSentence(raw: string): string {
  const t = raw.trim();
  if (!t) return t;
  const cap = t[0].toUpperCase() + t.slice(1);
  return cap.endsWith(".") ? cap : `${cap}.`;
}

interface BuildContext {
  nextSeed: () => number;
  generatorModel: string;
}

function makeCalcMcq(
  ctx: BuildContext,
  args: {
    slug: string;
    conceptId: string;
    kind: string;
    domain: PhysicsDomainId;
    syllabi: SyllabusTag[];
    difficulty: QuestionDifficulty;
    questionStyle?: QuestionStyleTag;
    scenarioSpec: Record<string, unknown>;
    requiredGivens: RequiredGivenSpec[];
    targetQuantityKey: string;
    unit?: string;
    integerMode?: boolean;
    stem: string;
    distractors: readonly NumDistractor[];
    workedSolution: string;
    markCriterion: string;
    planSummary: string;
  },
): CandidateQuestionInput {
  const seed = ctx.nextSeed();
  const q = solveKind(args.kind, args.scenarioSpec);
  const targetVal = q[args.targetQuantityKey];
  if (typeof targetVal !== "number") {
    throw new Error(
      `Expected numeric targetQuantityKey "${args.targetQuantityKey}" on "${args.slug}"`,
    );
  }
  const options = buildNumOptions(
    targetVal,
    args.unit,
    args.distractors,
    seed,
    args.integerMode ?? false,
  );
  const plan: CandidateQuestionPlan = {
    targetSummary: args.planSummary,
    distractorStrategy: [
      "unit-conversion-omission",
      "sign-or-factor-slip",
      "intermediate-step-stop",
    ],
  };
  return {
    id: `${ALEVEL_OPT_EE_ID_PREFIX}-${args.slug}`,
    conceptId: args.conceptId,
    templateArchetype: args.kind,
    seed,
    syllabi: args.syllabi,
    format: "mcq",
    questionStyle: args.questionStyle ?? "calculation",
    difficulty: args.difficulty,
    domain: args.domain,
    scenarioSpec: args.scenarioSpec,
    hiddenQuantities: [args.targetQuantityKey],
    requiredGivens: args.requiredGivens,
    questionPlan: plan,
    stem: args.stem,
    options,
    targetMode: "quantitative",
    targetQuantityKey: args.targetQuantityKey,
    workedSolution: args.workedSolution,
    markScheme: [{ code: "A1", criterion: args.markCriterion, marks: 1 }],
    totalMarks: 1,
    generatorModel: ctx.generatorModel,
  };
}

function makeQualMcq(
  ctx: BuildContext,
  args: {
    slug: string;
    conceptId: string;
    kind: string;
    domain: PhysicsDomainId;
    syllabi: SyllabusTag[];
    difficulty: QuestionDifficulty;
    questionStyle?: QuestionStyleTag;
    scenarioSpec: Record<string, unknown>;
    requiredGivens: RequiredGivenSpec[];
    targetQuantityKey: string;
    stem: string;
    correctTextOverride?: string;
    distractors: readonly [VerbDistractor, VerbDistractor, VerbDistractor];
    workedSolution: string;
    planSummary: string;
  },
): CandidateQuestionInput {
  const seed = ctx.nextSeed();
  const q = solveKind(args.kind, args.scenarioSpec);
  const truth = q[args.targetQuantityKey];
  if (typeof truth !== "string") {
    throw new Error(
      `Expected string targetQuantityKey "${args.targetQuantityKey}" on "${args.slug}"`,
    );
  }
  const correctText = args.correctTextOverride ?? capitalizeSentence(truth);
  const options = buildVerbOptions(correctText, args.distractors, seed);
  const plan: CandidateQuestionPlan = {
    targetSummary: args.planSummary,
    distractorStrategy: [
      "reversed-physical-trend",
      "misapplied-conservation-condition",
      "confused-device-operating-regime",
    ],
  };
  return {
    id: `${ALEVEL_OPT_EE_ID_PREFIX}-${args.slug}`,
    conceptId: args.conceptId,
    templateArchetype: args.kind,
    seed,
    syllabi: args.syllabi,
    format: "mcq",
    questionStyle: args.questionStyle ?? "qualitative",
    difficulty: args.difficulty,
    domain: args.domain,
    scenarioSpec: args.scenarioSpec,
    hiddenQuantities: [args.targetQuantityKey],
    requiredGivens: args.requiredGivens,
    questionPlan: plan,
    stem: args.stem,
    options,
    targetMode: "qualitative",
    targetQuantityKey: args.targetQuantityKey,
    workedSolution: args.workedSolution,
    markScheme: [
      {
        code: "B1",
        criterion: `Correctly identifies that ${truth}.`,
        marks: 1,
      },
    ],
    totalMarks: 1,
    generatorModel: ctx.generatorModel,
  };
}

function makeLor6(
  ctx: BuildContext,
  args: {
    slug: string;
    conceptId: string;
    kind: string;
    domain: PhysicsDomainId;
    syllabi: SyllabusTag[];
    difficulty: QuestionDifficulty;
    questionStyle?: QuestionStyleTag;
    scenarioSpec: Record<string, unknown>;
    requiredGivens: RequiredGivenSpec[];
    targetQuantityKey: string;
    stem: string;
    prompt: string;
    expectedAnswer: string;
    workingSteps: readonly [string, string, string, string, string, string];
    levelCriteria: readonly [string, string, string, string, string, string];
    workedSolution: string;
    planSummary: string;
  },
): CandidateQuestionInput {
  const seed = ctx.nextSeed();
  const q = solveKind(args.kind, args.scenarioSpec);
  const truth = q[args.targetQuantityKey];
  if (typeof truth !== "string") {
    throw new Error(
      `Expected string LoR anchor "${args.targetQuantityKey}" on "${args.slug}"`,
    );
  }
  const codes = ["L1", "L1", "L2", "L2", "L3", "L3"] as const;
  const markScheme: MarkSchemePoint[] = args.levelCriteria.map((criterion, i) => ({
    code: codes[i],
    criterion,
    marks: 1,
    partId: "a",
  }));
  const parts: StructuredQuestionPart[] = [
    {
      partId: "a",
      prompt: args.prompt,
      marks: 6,
      targetMode: "qualitative",
      targetQuantityKey: args.targetQuantityKey,
      expectedAnswer: args.expectedAnswer,
      workingSteps: [...args.workingSteps],
    },
  ];
  return {
    id: `${ALEVEL_OPT_EE_ID_PREFIX}-${args.slug}`,
    conceptId: args.conceptId,
    templateArchetype: args.kind,
    seed,
    syllabi: args.syllabi,
    format: "structured",
    questionStyle: args.questionStyle ?? "qualitative",
    difficulty: args.difficulty,
    domain: args.domain,
    scenarioSpec: args.scenarioSpec,
    hiddenQuantities: [args.targetQuantityKey],
    requiredGivens: args.requiredGivens,
    questionPlan: {
      targetSummary: args.planSummary,
      subpartStrategy: [
        "extended level of response qualitative synthesis across physical principles and engineering trade-offs",
      ],
    },
    stem: args.stem,
    targetMode: "qualitative",
    parts,
    workedSolution: args.workedSolution,
    markScheme,
    totalMarks: 6,
    generatorModel: ctx.generatorModel,
  };
}

function makeStructured(
  ctx: BuildContext,
  args: {
    slug: string;
    conceptId: string;
    kind: string;
    domain: PhysicsDomainId;
    syllabi: SyllabusTag[];
    difficulty: QuestionDifficulty;
    questionStyle?: QuestionStyleTag;
    scenarioSpec: Record<string, unknown>;
    hiddenQuantities: string[];
    requiredGivens: RequiredGivenSpec[];
    stem: string;
    parts: StructuredQuestionPart[];
    workedSolution: string;
    markScheme: MarkSchemePoint[];
    planSummary: string;
  },
): CandidateQuestionInput {
  const seed = ctx.nextSeed();
  const totalMarks = args.parts.reduce((acc, p) => acc + p.marks, 0);
  return {
    id: `${ALEVEL_OPT_EE_ID_PREFIX}-${args.slug}`,
    conceptId: args.conceptId,
    templateArchetype: args.kind,
    seed,
    syllabi: args.syllabi,
    format: "structured",
    questionStyle: args.questionStyle ?? "mixed-exam",
    difficulty: args.difficulty,
    domain: args.domain,
    scenarioSpec: args.scenarioSpec,
    hiddenQuantities: args.hiddenQuantities,
    requiredGivens: args.requiredGivens,
    questionPlan: {
      targetSummary: args.planSummary,
      subpartStrategy: args.parts.map((p) =>
        p.targetMode === "qualitative"
          ? "conceptual explanation anchored to governing physical law"
          : "multi-step quantitative calculation using verified equation",
      ),
    },
    stem: args.stem,
    parts: args.parts,
    workedSolution: args.workedSolution,
    markScheme: args.markScheme,
    totalMarks,
    generatorModel: ctx.generatorModel,
  };
}

/* ========================================================================== */
/*  1. Plugin 1: al-opt-eng-moment-inertia-suvat (12 items)                   */
/* ========================================================================== */

function buildMomentInertiaSuvatItems(ctx: BuildContext): CandidateQuestionInput[] {
  const kind = "al-opt-eng-moment-inertia-suvat";
  const conceptId = "rigid-body-rotational-dynamics";
  const items: CandidateQuestionInput[] = [];

  // 5 Calc MCQs
  const s1 = {
    kind,
    mode: "drive",
    hubInertiaKgM2: 0.42,
    rimMassCount: 4,
    rimMassKg: 0.85,
    rimRadiusM: 0.36,
    initialRevPerSec: 2.0,
    finalRevPerSec: 10.0,
    durationS: 8.0,
    frictionTorqueNm: 0.55,
    forceRadiusM: 0.36,
  };
  const q1 = solveKind(kind, s1);
  items.push(
    makeCalcMcq(ctx, {
      slug: "eng-mi-01",
      conceptId,
      kind,
      domain: "mechanics",
      syllabi: engTag(),
      difficulty: "foundation",
      scenarioSpec: s1,
      requiredGivens: [
        { name: "hubInertiaKgM2", value: 0.42, unit: "kg m²", source: "stem" },
        { name: "rimMassCount", value: 4, source: "either" },
        { name: "rimMassKg", value: 0.85, unit: "kg", source: "either" },
        { name: "rimRadiusM", value: 0.36, unit: "m", source: "either" },
      ],
      targetQuantityKey: "momentOfInertiaKgM2",
      unit: "kg m²",
      stem: "A laboratory spoked test wheel consists of a central hub of moment of inertia 0.42 kg m² and 4 identical small steel masses, each of mass 0.85 kg, clamped to the rim at radius 0.36 m from the axle. Calculate the total moment of inertia of the wheel about its rotation axis.",
      distractors: [
        {
          value: 0.42 + 4 * 0.85 * 0.36,
          rationale: "Multiplies rim mass by $r$ instead of $r^2$ in $I = \\sum m r^2$.",
        },
        {
          value: 0.42 + 0.85 * 0.36 * 0.36,
          rationale: "Includes only one rim mass instead of all four masses.",
        },
        {
          value: 4 * 0.85 * 0.36 * 0.36,
          rationale: "Omits the moment of inertia of the central hub.",
        },
      ],
      workedSolution: `Using $I = I_{\\mathrm{hub}} + \\sum m r^2$: $I = 0.42 + 4 \\times 0.85 \\times (0.36)^2 = 0.42 + 0.4406 = ${fmt3(q1.momentOfInertiaKgM2 as number, "kg m²")}$.`,
      markCriterion: `Total moment of inertia equals ${fmt3(q1.momentOfInertiaKgM2 as number, "kg m²")}.`,
      planSummary: "Compute composite moment of inertia of hub plus discrete rim masses.",
    }),
  );

  const s2 = {
    kind,
    mode: "brake",
    hubInertiaKgM2: 1.35,
    rimMassCount: 6,
    rimMassKg: 1.2,
    rimRadiusM: 0.45,
    initialRevPerSec: 18.0,
    finalRevPerSec: 0.0,
    durationS: 15.0,
    frictionTorqueNm: 1.6,
    forceRadiusM: 0.32,
  };
  const q2 = solveKind(kind, s2);
  items.push(
    makeCalcMcq(ctx, {
      slug: "eng-mi-02",
      conceptId,
      kind,
      domain: "mechanics",
      syllabi: engTag(),
      difficulty: "foundation",
      scenarioSpec: s2,
      requiredGivens: [
        { name: "initialRevPerSec", value: 18.0, unit: "rev s⁻¹", source: "stem" },
        { name: "durationS", value: 15.0, unit: "s", source: "stem" },
      ],
      targetQuantityKey: "revolutionsCount",
      unit: "rev",
      stem: "An industrial grinding rotor initially spinning at 18.0 rev s⁻¹ decelerates uniformly to rest in 15.0 s once its brake caliper engages. How many complete revolutions does the rotor make while slowing to a stop?",
      distractors: [
        {
          value: 18.0 * 15.0,
          rationale: "Multiplies initial frequency by time without the factor of one-half for uniform deceleration.",
        },
        {
          value: (q2.angularDisplacementRad as number),
          rationale: "Quotes the angular displacement in radians rather than dividing by $2\\pi$ for revolutions.",
        },
        {
          value: (q2.revolutionsCount as number) * 0.5,
          rationale: "Applies an extra factor of one-half to the average rotational speed.",
        },
      ],
      workedSolution: `Average rotational frequency is $\\bar{f} = \\frac{18.0 + 0}{2} = 9.00\\text{ rev s}^{-1}$. Total revolutions $N = \\frac{\\theta}{2\\pi} = \\bar{f}t = 9.00 \\times 15.0 = ${fmt3(q2.revolutionsCount as number, "rev")}$.`,
      markCriterion: `Rotor completes ${fmt3(q2.revolutionsCount as number, "rev")} while decelerating to rest.`,
      planSummary: "Use angular kinematics to find total revolutions during uniform braking.",
    }),
  );

  const s3 = {
    kind,
    mode: "drive",
    hubInertiaKgM2: 0.8,
    rimMassCount: 4,
    rimMassKg: 1.1,
    rimRadiusM: 0.5,
    initialRevPerSec: 4.0,
    finalRevPerSec: 16.0,
    durationS: 10.0,
    frictionTorqueNm: 2.2,
    forceRadiusM: 0.4,
  };
  const q3 = solveKind(kind, s3);
  items.push(
    makeCalcMcq(ctx, {
      slug: "eng-mi-03",
      conceptId,
      kind,
      domain: "mechanics",
      syllabi: engTag(),
      difficulty: "standard",
      scenarioSpec: s3,
      requiredGivens: [
        { name: "hubInertiaKgM2", value: 0.8, unit: "kg m²", source: "stem" },
        { name: "rimMassCount", value: 4, source: "either" },
        { name: "rimMassKg", value: 1.1, unit: "kg", source: "either" },
        { name: "rimRadiusM", value: 0.5, unit: "m", source: "either" },
        { name: "initialRevPerSec", value: 4.0, unit: "rev s⁻¹", source: "stem" },
        { name: "finalRevPerSec", value: 16.0, unit: "rev s⁻¹", source: "stem" },
        { name: "durationS", value: 10.0, unit: "s", source: "stem" },
        { name: "frictionTorqueNm", value: 2.2, unit: "N m", source: "stem" },
      ],
      targetQuantityKey: "appliedTorqueNm",
      unit: "N m",
      stem: "A spoked rotor (hub inertia 0.80 kg m² plus 4 rim masses of 1.10 kg each at radius 0.50 m) is accelerated uniformly from 4.0 rev s⁻¹ to 16.0 rev s⁻¹ in 10.0 s against a constant bearing friction torque of 2.20 N m. Calculate the driving torque supplied by the motor.",
      distractors: [
        {
          value: q3.netTorqueMagNm as number,
          rationale: "Computes net torque $I\\alpha$ but forgets to add the opposing bearing friction torque.",
        },
        {
          value: (q3.netTorqueMagNm as number) - 2.2,
          rationale: "Subtracts bearing friction torque instead of adding it to overcome resistance.",
        },
        {
          value: (q3.momentOfInertiaKgM2 as number) * ((16 - 4) / 10) + 2.2,
          rationale: "Omits the $2\\pi$ conversion from $\\text{rev s}^{-1}$ to $\\text{rad s}^{-1}$.",
        },
      ],
      workedSolution: `Total inertia $I = 0.80 + 4(1.10)(0.50)^2 = 1.90\\text{ kg m}^2$. Angular acceleration $\\alpha = \\frac{2\\pi(16.0 - 4.0)}{10.0} = 7.54\\text{ rad s}^{-2}$. Driving torque $T_{\\mathrm{app}} = I\\alpha + T_{\\mathrm{f}} = (1.90 \\times 7.54) + 2.20 = ${fmt3(q3.appliedTorqueNm as number, "N m")}$.`,
      markCriterion: `Applied driving torque equals ${fmt3(q3.appliedTorqueNm as number, "N m")}.`,
      planSummary: "Find driving torque accounting for angular acceleration and bearing friction.",
    }),
  );

  const s4 = {
    kind,
    mode: "brake",
    hubInertiaKgM2: 2.1,
    rimMassCount: 4,
    rimMassKg: 2.0,
    rimRadiusM: 0.45,
    initialRevPerSec: 12.0,
    finalRevPerSec: 4.0,
    durationS: 6.0,
    frictionTorqueNm: 3.5,
    forceRadiusM: 0.25,
  };
  const q4 = solveKind(kind, s4);
  items.push(
    makeCalcMcq(ctx, {
      slug: "eng-mi-04",
      conceptId,
      kind,
      domain: "mechanics",
      syllabi: engTag(),
      difficulty: "higher",
      scenarioSpec: s4,
      requiredGivens: [
        { name: "hubInertiaKgM2", value: 2.1, unit: "kg m²", source: "stem" },
        { name: "rimMassCount", value: 4, source: "either" },
        { name: "rimMassKg", value: 2.0, unit: "kg", source: "either" },
        { name: "rimRadiusM", value: 0.45, unit: "m", source: "either" },
        { name: "initialRevPerSec", value: 12.0, unit: "rev s⁻¹", source: "stem" },
        { name: "finalRevPerSec", value: 4.0, unit: "rev s⁻¹", source: "stem" },
        { name: "durationS", value: 6.0, unit: "s", source: "stem" },
        { name: "frictionTorqueNm", value: 3.5, unit: "N m", source: "stem" },
        { name: "forceRadiusM", value: 0.25, unit: "m", source: "either" },
      ],
      targetQuantityKey: "tangentialForceN",
      unit: "N",
      stem: "A test disc of hub inertia 2.10 kg m² carrying 4 masses of 2.00 kg at radius 0.45 m slows uniformly from 12.0 rev s⁻¹ to 4.0 rev s⁻¹ in 6.0 s. Bearing friction contributes a constant retarding torque of 3.50 N m, and a brake pad presses tangentially at radius 0.25 m. What tangential friction force does the brake pad exert?",
      distractors: [
        {
          value: ((q4.netTorqueMagNm as number) + 3.5) / 0.25,
          rationale: "Adds bearing friction to net torque instead of noting that bearing friction assists braking.",
        },
        {
          value: (q4.netTorqueMagNm as number) / 0.25,
          rationale: "Neglects the retarding torque already supplied by the axle bearings.",
        },
        {
          value: (q4.appliedTorqueNm as number) / 0.45,
          rationale: "Divides braking torque by the rim mass radius instead of the brake pad radius.",
        },
      ],
      workedSolution: `$I = 2.10 + 4(2.00)(0.45)^2 = 3.72\\text{ kg m}^2$. Deceleration $|\\alpha| = \\frac{2\\pi(12.0 - 4.0)}{6.0} = 8.38\\text{ rad s}^{-2}$. Net retarding torque $|T_{\\mathrm{net}}| = I|\\alpha| = 31.2\\text{ N m}$. Brake torque $T_{\\mathrm{brake}} = 31.2 - 3.50 = 27.7\\text{ N m}$, so $F = \\frac{T_{\\mathrm{brake}}}{r} = \\frac{27.7}{0.25} = ${fmt3(q4.tangentialForceN as number, "N")}$.`,
      markCriterion: `Brake pad tangential force equals ${fmt3(q4.tangentialForceN as number, "N")}.`,
      planSummary: "Determine tangential brake force during deceleration with bearing friction assisting.",
    }),
  );

  const s5 = {
    kind,
    mode: "drive",
    hubInertiaKgM2: 1.5,
    rimMassCount: 6,
    rimMassKg: 0.9,
    rimRadiusM: 0.4,
    initialRevPerSec: 0.0,
    finalRevPerSec: 12.5,
    durationS: 9.0,
    frictionTorqueNm: 1.2,
    forceRadiusM: 0.4,
  };
  const q5 = solveKind(kind, s5);
  items.push(
    makeCalcMcq(ctx, {
      slug: "eng-mi-05",
      conceptId,
      kind,
      domain: "mechanics",
      syllabi: engTag(),
      difficulty: "standard",
      scenarioSpec: s5,
      requiredGivens: [
        { name: "hubInertiaKgM2", value: 1.5, unit: "kg m²", source: "stem" },
        { name: "rimMassCount", value: 6, source: "either" },
        { name: "rimMassKg", value: 0.9, unit: "kg", source: "either" },
        { name: "rimRadiusM", value: 0.4, unit: "m", source: "either" },
        { name: "finalRevPerSec", value: 12.5, unit: "rev s⁻¹", source: "stem" },
      ],
      targetQuantityKey: "finalRotKeJ",
      unit: "J",
      stem: "A centrifugal drum has a hub inertia of 1.50 kg m² and 6 balanced rim blocks of mass 0.90 kg each fixed at radius 0.40 m. When spun up from rest to 12.5 rev s⁻¹, what is the rotational kinetic energy stored in the drum?",
      distractors: [
        {
          value: 0.5 * (q5.momentOfInertiaKgM2 as number) * 12.5 * 12.5,
          rationale: "Substitutes frequency in $\\text{rev s}^{-1}$ directly for $\\omega$ without multiplying by $2\\pi$.",
        },
        {
          value: (q5.momentOfInertiaKgM2 as number) * (q5.omega2RadS as number) ** 2,
          rationale: "Omits the factor of $\\frac{1}{2}$ in $E_{\\mathrm{k}} = \\frac{1}{2}I\\omega^2$.",
        },
        {
          value: 0.5 * 1.5 * (q5.omega2RadS as number) ** 2,
          rationale: "Calculates kinetic energy using only the hub inertia and ignores the six rim blocks.",
        },
      ],
      workedSolution: `$I = 1.50 + 6(0.90)(0.40)^2 = 2.364\\text{ kg m}^2$ and $\\omega = 2\\pi(12.5) = 78.54\\text{ rad s}^{-1}$. Thus $E_{\\mathrm{k}} = \\frac{1}{2}I\\omega^2 = \\frac{1}{2}(2.364)(78.54)^2 = ${fmt3(q5.finalRotKeJ as number, "J")}$.`,
      markCriterion: `Rotational kinetic energy equals ${fmt3(q5.finalRotKeJ as number, "J")}.`,
      planSummary: "Compute rotational kinetic energy from composite inertia and revolutions per second.",
    }),
  );

  // 3 Pure Qualitative MCQs
  items.push(
    makeQualMcq(ctx, {
      slug: "eng-mi-06",
      conceptId,
      kind,
      domain: "mechanics",
      syllabi: engTag(),
      difficulty: "foundation",
      scenarioSpec: s1,
      requiredGivens: [],
      targetQuantityKey: "inertiaDistributionRule",
      stem: "Two wheels have identical total mass and outer diameter, but Wheel A is a solid uniform disc whereas Wheel B concentrates most of its mass in a heavy outer rim joined by thin spokes. Which statement correctly explains why Wheel B is harder to accelerate rotationally?",
      distractors: [
        {
          text: "Concentrating mass closer to the central axle increases moment of inertia and angular acceleration.",
          rationale: "Reverses the radial dependence of $I = \\sum m r^2$.",
        },
        {
          text: "Both wheels share the same moment of inertia because moment of inertia depends solely on total mass.",
          rationale: "Confuses rotational inertia with translational mass.",
        },
        {
          text: "Thin spokes increase aerodynamic drag more strongly than mass distribution affects rotational inertia.",
          rationale: "Attributes an inertial property to external air resistance.",
        },
      ],
      workedSolution: `Because $I = \\sum m r^2$, each mass element contributes in proportion to $r^2$: concentrating mass at a larger radius from the rotation axis increases moment of inertia.`,
      planSummary: "Assess conceptual understanding of radial mass distribution in moment of inertia.",
    }),
  );

  items.push(
    makeQualMcq(ctx, {
      slug: "eng-mi-07",
      conceptId,
      kind,
      domain: "mechanics",
      syllabi: engTag(),
      difficulty: "foundation",
      questionStyle: "definition",
      scenarioSpec: s3,
      requiredGivens: [],
      targetQuantityKey: "torqueAngleAreaRule",
      stem: "A variable driving torque $T$ acts on a lathe spindle as it turns through an angular displacement $\\theta$. What physical quantity is represented by the area enclosed beneath the graph of torque $T$ against angular displacement $\\theta$?",
      distractors: [
        {
          text: "Area under a torque against angular displacement graph equals angular impulse delivered to the spindle.",
          rationale: "Confuses area under $T$–$\\theta$ (work) with area under $T$–$t$ (angular impulse).",
        },
        {
          text: "Area under a torque against angular displacement graph equals instantaneous power output.",
          rationale: "Confuses work done ($T\\theta$) with rate of doing work ($P = T\\omega$).",
        },
        {
          text: "Area under a torque against angular displacement graph equals final angular momentum.",
          rationale: "Confuses energy transfer with angular momentum $I\\omega$.",
        },
      ],
      workedSolution: `By rotational analogy with $W = Fs$, incremental work is $\\Delta W = T\\Delta\\theta$, so the area under a torque against angular displacement graph equals work done.`,
      planSummary: "Identify physical meaning of area beneath a torque versus angular displacement curve.",
    }),
  );

  items.push(
    makeQualMcq(ctx, {
      slug: "eng-mi-08",
      conceptId,
      kind,
      domain: "mechanics",
      syllabi: engTag(),
      difficulty: "standard",
      scenarioSpec: s4,
      requiredGivens: [],
      targetQuantityKey: "frictionTorqueRole",
      stem: "A heavy centrifuge rotor experiences a constant bearing friction torque throughout both its spin-up phase and its braking phase. How does this bearing friction torque combine with the external applied torque in each phase?",
      distractors: [
        {
          text: "Bearing friction always adds to the applied torque so it assists spin-up and opposes braking.",
          rationale: "Reverses the direction of friction, which always opposes relative motion.",
        },
        {
          text: "Bearing friction acts only during braking and becomes zero once a motor drives the axle.",
          rationale: "Assumes bearing friction disappears when driven externally.",
        },
        {
          text: "Bearing friction cancels out of the rotational equation whenever angular acceleration is uniform.",
          rationale: "Neglects dissipative torque in $T_{\\mathrm{net}} = I\\alpha$.",
        },
      ],
      workedSolution: `Because friction always opposes motion, bearing friction opposes rotation and acts alongside a braking torque or against a driving torque: $T_{\\mathrm{drive}} - T_{\\mathrm{f}} = I\\alpha$ during acceleration and $T_{\\mathrm{brake}} + T_{\\mathrm{f}} = I|\\alpha|$ during braking.`,
      planSummary: "Evaluate direction of bearing friction torque during driving versus braking.",
    }),
  );

  // 4 Structured Multi-Part Questions
  const stSpecs = [
    {
      slug: "eng-mi-09",
      difficulty: "standard" as const,
      spec: {
        kind,
        mode: "drive",
        hubInertiaKgM2: 0.65,
        rimMassCount: 4,
        rimMassKg: 1.25,
        rimRadiusM: 0.4,
        initialRevPerSec: 3.0,
        finalRevPerSec: 11.0,
        durationS: 8.0,
        frictionTorqueNm: 1.4,
        forceRadiusM: 0.4,
      },
      context: "a workshop pottery wheel test rig",
    },
    {
      slug: "eng-mi-10",
      difficulty: "standard" as const,
      spec: {
        kind,
        mode: "brake",
        hubInertiaKgM2: 1.6,
        rimMassCount: 6,
        rimMassKg: 1.4,
        rimRadiusM: 0.35,
        initialRevPerSec: 14.0,
        finalRevPerSec: 2.0,
        durationS: 10.0,
        frictionTorqueNm: 2.0,
        forceRadiusM: 0.28,
      },
      context: "a high-speed textile winding drum",
    },
    {
      slug: "eng-mi-11",
      difficulty: "higher" as const,
      spec: {
        kind,
        mode: "drive",
        hubInertiaKgM2: 1.1,
        rimMassCount: 8,
        rimMassKg: 0.75,
        rimRadiusM: 0.5,
        initialRevPerSec: 5.0,
        finalRevPerSec: 17.0,
        durationS: 12.0,
        frictionTorqueNm: 2.5,
        forceRadiusM: 0.35,
      },
      context: "an automated steel-shearing flywheel",
    },
    {
      slug: "eng-mi-12",
      difficulty: "higher" as const,
      spec: {
        kind,
        mode: "brake",
        hubInertiaKgM2: 2.4,
        rimMassCount: 4,
        rimMassKg: 2.5,
        rimRadiusM: 0.48,
        initialRevPerSec: 16.0,
        finalRevPerSec: 4.0,
        durationS: 9.0,
        frictionTorqueNm: 3.2,
        forceRadiusM: 0.32,
      },
      context: "a dynamometer inertia brake rotor",
    },
  ];

  for (const cfg of stSpecs) {
    const q = solveKind(kind, cfg.spec);
    const sp = cfg.spec;
    const isDrive = sp.mode === "drive";
    const iStr = fmt3(q.momentOfInertiaKgM2 as number, "kg m²");
    const alphaStr = fmt3(q.angularAccelMagRadS2 as number, "rad s⁻²");
    const appTStr = fmt3(q.appliedTorqueNm as number, "N m");
    const pPeakStr = fmt3(q.peakPowerW as number, "W");

    items.push(
      makeStructured(ctx, {
        slug: cfg.slug,
        conceptId,
        kind,
        domain: "mechanics",
        syllabi: engTag(),
        difficulty: cfg.difficulty,
        scenarioSpec: sp,
        hiddenQuantities: [
          "momentOfInertiaKgM2",
          "angularAccelMagRadS2",
          "appliedTorqueNm",
          "peakPowerW",
        ],
        requiredGivens: [
          { name: "hubInertiaKgM2", value: sp.hubInertiaKgM2, unit: "kg m²", source: "stem" },
          { name: "rimMassCount", value: sp.rimMassCount, source: "either" },
          { name: "rimMassKg", value: sp.rimMassKg, unit: "kg", source: "either" },
          { name: "rimRadiusM", value: sp.rimRadiusM, unit: "m", source: "either" },
          { name: "initialRevPerSec", value: sp.initialRevPerSec, unit: "rev s⁻¹", source: "stem" },
          { name: "finalRevPerSec", value: sp.finalRevPerSec, unit: "rev s⁻¹", source: "stem" },
          { name: "durationS", value: sp.durationS, unit: "s", source: "stem" },
          { name: "frictionTorqueNm", value: sp.frictionTorqueNm, unit: "N m", source: "stem" },
        ],
        stem: `The diagram shows the rotor of ${cfg.context}. Its central hub has moment of inertia ${fmt3(sp.hubInertiaKgM2, "kg m²")} and carries ${sp.rimMassCount} rim masses of ${fmt3(sp.rimMassKg, "kg")} each at radius ${fmt3(sp.rimRadiusM, "m")}. During a test run lasting ${fmt3(sp.durationS, "s")}, the rotational speed changes uniformly from ${fmt3(sp.initialRevPerSec, "rev s⁻¹")} to ${fmt3(sp.finalRevPerSec, "rev s⁻¹")} while a constant bearing friction torque of ${fmt3(sp.frictionTorqueNm, "N m")} opposes rotation.`,
        parts: [
          {
            partId: "a",
            prompt: "Calculate the total moment of inertia of the rotor about its rotation axis.",
            marks: 2,
            targetQuantityKey: "momentOfInertiaKgM2",
            expectedAnswer: iStr,
            workingSteps: [
              `Apply $I = I_{\\mathrm{hub}} + N m r^2$.`,
              `$I = ${fmt3(sp.hubInertiaKgM2)} + ${sp.rimMassCount} \\times ${fmt3(sp.rimMassKg)} \\times (${fmt3(sp.rimRadiusM)})^2 = ${iStr}$.`,
            ],
          },
          {
            partId: "b",
            prompt: "Determine the magnitude of the angular acceleration of the rotor.",
            marks: 2,
            targetQuantityKey: "angularAccelMagRadS2",
            expectedAnswer: alphaStr,
            workingSteps: [
              `Convert frequencies via $\\omega = 2\\pi f$: $\\omega_1 = ${fmt3(q.omega1RadS as number)}\\text{ rad s}^{-1}$, $\\omega_2 = ${fmt3(q.omega2RadS as number)}\\text{ rad s}^{-1}$.`,
              `$|\\alpha| = \\frac{|\\omega_2 - \\omega_1|}{t} = ${alphaStr}$.`,
            ],
          },
          {
            partId: "c",
            prompt: isDrive
              ? "Calculate the constant driving torque supplied by the motor."
              : "Calculate the constant external braking torque supplied by the caliper.",
            marks: 2,
            dependsOnPartIds: ["a", "b"],
            targetQuantityKey: "appliedTorqueNm",
            expectedAnswer: appTStr,
            workingSteps: [
              `Net torque $|T_{\\mathrm{net}}| = I|\\alpha| = ${fmt3(q.netTorqueMagNm as number)}\\text{ N m}$.`,
              isDrive
                ? `$T_{\\mathrm{app}} = I\\alpha + T_{\\mathrm{f}} = ${fmt3(q.netTorqueMagNm as number)} + ${fmt3(sp.frictionTorqueNm)} = ${appTStr}$.`
                : `$T_{\\mathrm{brake}} = I|\\alpha| - T_{\\mathrm{f}} = ${fmt3(q.netTorqueMagNm as number)} - ${fmt3(sp.frictionTorqueNm)} = ${appTStr}$.`,
            ],
          },
          {
            partId: "d",
            prompt:
              "Calculate the maximum instantaneous mechanical power transferred by the applied torque during the interval.",
            marks: 2,
            dependsOnPartIds: ["c"],
            targetQuantityKey: "peakPowerW",
            expectedAnswer: pPeakStr,
            workingSteps: [
              `Use $P_{\\max} = T_{\\mathrm{app}} \\omega_{\\max}$.`,
              `$P_{\\max} = ${fmt3(q.appliedTorqueNm as number)} \\times ${fmt3(Math.max(q.omega1RadS as number, q.omega2RadS as number))} = ${pPeakStr}$.`,
            ],
          },
        ],
        workedSolution: `(a) $I = ${iStr}$. (b) $|\\alpha| = \\frac{2\\pi|f_2 - f_1|}{t} = ${alphaStr}$. (c) Applied torque $T_{\\mathrm{app}} = ${appTStr}$. (d) Peak power $P_{\\max} = T_{\\mathrm{app}}\\omega_{\\max} = ${pPeakStr}$.`,
        markScheme: [
          { code: "M1", criterion: "Uses $I = I_{\\mathrm{hub}} + \\sum m r^2$ with squared radius.", marks: 1, partId: "a" },
          { code: "A1", criterion: `Obtains $I = ${iStr}$.`, marks: 1, partId: "a" },
          { code: "M1", criterion: "Converts $\\text{rev s}^{-1}$ to $\\text{rad s}^{-1}$ via $2\\pi$ and divides change by $t$.", marks: 1, partId: "b" },
          { code: "A1", criterion: `Obtains $|\\alpha| = ${alphaStr}$.`, marks: 1, partId: "b" },
          { code: "M1", criterion: "Combines $I|\\alpha|$ with bearing friction torque in the correct sense.", marks: 1, partId: "c" },
          { code: "A1", criterion: `Obtains applied torque $= ${appTStr}$.`, marks: 1, partId: "c" },
          { code: "M1", criterion: "Applies $P = T\\omega$ at the highest angular speed.", marks: 1, partId: "d" },
          { code: "A1", criterion: `Obtains maximum power $= ${pPeakStr}$.`, marks: 1, partId: "d" },
        ],
        planSummary: "Multi-part rotational inertia, angular acceleration, friction-adjusted torque, and peak power analysis.",
      }),
    );
  }

  return items;
}

/* ========================================================================== */
/*  2. Plugin 2: al-opt-eng-flywheel-kers (12 items, incl. 2 × 6m LoRs)       */
/* ========================================================================== */

function buildFlywheelKersItems(ctx: BuildContext): CandidateQuestionInput[] {
  const kind = "al-opt-eng-flywheel-kers";
  const conceptId = "rigid-body-rotational-dynamics";
  const items: CandidateQuestionInput[] = [];

  const k1 = {
    kind,
    mode: "kers",
    flywheelInertiaKgM2: 1.6,
    omegaMaxRadS: 540,
    omegaMinRadS: 220,
    vehicleMassKg: 1100,
    slopeHeightM: 14,
    dragForceN: 210,
    travelDistanceM: 220,
    meanLoadTorqueNm: 80,
    peakTorqueNm: 310,
  };
  const qk1 = solveKind(kind, k1);
  items.push(
    makeCalcMcq(ctx, {
      slug: "eng-fw-01",
      conceptId,
      kind,
      domain: "mechanics",
      syllabi: engTag(),
      difficulty: "foundation",
      scenarioSpec: k1,
      requiredGivens: [
        { name: "flywheelInertiaKgM2", value: 1.6, unit: "kg m²", source: "stem" },
        { name: "omegaMaxRadS", value: 540, unit: "rad s⁻¹", source: "stem" },
        { name: "omegaMinRadS", value: 220, unit: "rad s⁻¹", source: "stem" },
      ],
      targetQuantityKey: "energyReleasedJ",
      unit: "J",
      stem: "A hybrid tram KERS flywheel of moment of inertia 1.60 kg m² slows from 540 rad s⁻¹ to 220 rad s⁻¹ while assisting acceleration out of a station. Calculate the rotational kinetic energy released by the flywheel.",
      distractors: [
        {
          value: 0.5 * 1.6 * (540 - 220) ** 2,
          rationale: "Uses $(\\omega_1 - \\omega_2)^2$ instead of $(\\omega_1^2 - \\omega_2^2)$.",
        },
        {
          value: 1.6 * (540 ** 2 - 220 ** 2),
          rationale: "Omits the factor of $\\frac{1}{2}$ in rotational kinetic energy.",
        },
        {
          value: 0.5 * 1.6 * 540 ** 2,
          rationale: "Calculates total initial kinetic energy rather than the change in kinetic energy.",
        },
      ],
      workedSolution: `$\\Delta E_{\\mathrm{k}} = \\frac{1}{2}I(\\omega_1^2 - \\omega_2^2) = \\frac{1}{2}(1.60)(540^2 - 220^2) = ${fmt3(qk1.energyReleasedJ as number, "J")}$.`,
      markCriterion: `Energy released equals ${fmt3(qk1.energyReleasedJ as number, "J")}.`,
      planSummary: "Compute flywheel rotational energy released across an angular speed drop.",
    }),
  );

  const k2 = {
    kind,
    mode: "kers",
    flywheelInertiaKgM2: 2.2,
    omegaMaxRadS: 620,
    omegaMinRadS: 260,
    vehicleMassKg: 1350,
    slopeHeightM: 16,
    dragForceN: 280,
    travelDistanceM: 250,
    meanLoadTorqueNm: 95,
    peakTorqueNm: 360,
  };
  const qk2 = solveKind(kind, k2);
  items.push(
    makeCalcMcq(ctx, {
      slug: "eng-fw-02",
      conceptId,
      kind,
      domain: "mechanics",
      syllabi: engTag(),
      difficulty: "standard",
      scenarioSpec: k2,
      requiredGivens: [
        { name: "omegaMaxRadS", value: 620, unit: "rad s⁻¹", source: "stem" },
        { name: "omegaMinRadS", value: 260, unit: "rad s⁻¹", source: "stem" },
        { name: "vehicleMassKg", value: 1350, unit: "kg", source: "stem" },
        { name: "slopeHeightM", value: 16, unit: "m", source: "stem" },
        { name: "dragForceN", value: 280, unit: "N", source: "stem" },
        { name: "travelDistanceM", value: 250, unit: "m", source: "stem" },
      ],
      targetQuantityKey: "requiredMinInertiaKgM2",
      unit: "kg m²",
      stem: "A 1350 kg delivery van uses a KERS flywheel to climb a ramp rising 16.0 m vertically over a road length of 250 m against a mean resistive force of 280 N. Take $g = 9.81\\text{ m s}^{-2}$. If the flywheel slows from 620 rad s⁻¹ to 260 rad s⁻¹ with zero transmission loss, calculate the minimum moment of inertia required.",
      distractors: [
        {
          value: (2 * (qk2.gravitationalPeGainJ as number)) / (620 ** 2 - 260 ** 2),
          rationale: "Includes gravitational potential gain $mgh$ but ignores work done against drag $F_{\\mathrm{d}}s$.",
        },
        {
          value: (2 * (qk2.totalHillClimbEnergyJ as number)) / (620 - 260) ** 2,
          rationale: "Uses $(\\omega_1 - \\omega_2)^2$ instead of $(\\omega_1^2 - \\omega_2^2)$.",
        },
        {
          value: (qk2.totalHillClimbEnergyJ as number) / (620 ** 2 - 260 ** 2),
          rationale: "Omits the factor of $2$ when rearranging $\\Delta E_{\\mathrm{k}} = \\frac{1}{2}I(\\omega_1^2 - \\omega_2^2)$.",
        },
      ],
      workedSolution: `Required energy $E = mgh + F_{\\mathrm{d}}s = 1350(9.81)(16.0) + 280(250) = ${fmt3(qk2.totalHillClimbEnergyJ as number, "J")}$. Setting $\\frac{1}{2}I(\\omega_1^2 - \\omega_2^2) = E$ gives $I = \\frac{2E}{620^2 - 260^2} = ${fmt3(qk2.requiredMinInertiaKgM2 as number, "kg m²")}$.`,
      markCriterion: `Minimum flywheel moment of inertia equals ${fmt3(qk2.requiredMinInertiaKgM2 as number, "kg m²")}.`,
      planSummary: "Size minimum KERS flywheel inertia for a hill climb with drag using standard UK gravity.",
    }),
  );

  const k3 = {
    kind,
    mode: "kers",
    flywheelInertiaKgM2: 2.5,
    omegaMaxRadS: 500,
    omegaMinRadS: 180,
    vehicleMassKg: 980,
    slopeHeightM: 19,
    dragForceN: 195,
    travelDistanceM: 180,
    meanLoadTorqueNm: 90,
    peakTorqueNm: 340,
  };
  const qk3 = solveKind(kind, k3);
  items.push(
    makeCalcMcq(ctx, {
      slug: "eng-fw-03",
      conceptId,
      kind,
      domain: "mechanics",
      syllabi: engTag(),
      difficulty: "higher",
      scenarioSpec: k3,
      requiredGivens: [
        { name: "flywheelInertiaKgM2", value: 2.5, unit: "kg m²", source: "stem" },
        { name: "omegaMinRadS", value: 180, unit: "rad s⁻¹", source: "stem" },
        { name: "vehicleMassKg", value: 980, unit: "kg", source: "stem" },
        { name: "slopeHeightM", value: 19, unit: "m", source: "stem" },
        { name: "dragForceN", value: 195, unit: "N", source: "stem" },
        { name: "travelDistanceM", value: 180, unit: "m", source: "stem" },
      ],
      targetQuantityKey: "peakOmegaForHillRadS",
      unit: "rad s⁻¹",
      stem: "A 980 kg electric shuttle carries a KERS flywheel of moment of inertia 2.50 kg m² whose speed must not fall below 180 rad s⁻¹ after climbing a 19.0 m vertical rise along a 180 m slope against 195 N mean drag. Using $g = 9.81\\text{ m s}^{-2}$, find the minimum initial angular speed of the flywheel at the foot of the slope.",
      distractors: [
        {
          value: Math.sqrt((2 * (qk3.totalHillClimbEnergyJ as number)) / 2.5),
          rationale: "Assumes the flywheel slows all the way to rest instead of retaining $180\\text{ rad s}^{-1}$.",
        },
        {
          value: 180 + Math.sqrt((2 * (qk3.totalHillClimbEnergyJ as number)) / 2.5),
          rationale: "Adds $\\omega_{\\min}$ outside the square root instead of inside $\\sqrt{\\omega_{\\min}^2 + 2E/I}$.",
        },
        {
          value: Math.sqrt(180 ** 2 + (2 * (qk3.gravitationalPeGainJ as number)) / 2.5),
          rationale: "Omits resistive work $F_{\\mathrm{d}}s$ along the slope.",
        },
      ],
      workedSolution: `Total climb energy $E = 980(9.81)(19.0) + 195(180) = ${fmt3(qk3.totalHillClimbEnergyJ as number, "J")}$. From $\\frac{1}{2}I(\\omega_{\\max}^2 - \\omega_{\\min}^2) = E$, $\\omega_{\\max} = \\sqrt{180^2 + \\frac{2E}{2.50}} = ${fmt3(qk3.peakOmegaForHillRadS as number, "rad s⁻¹")}$.`,
      markCriterion: `Minimum initial angular speed equals ${fmt3(qk3.peakOmegaForHillRadS as number, "rad s⁻¹")}.`,
      planSummary: "Compute required peak flywheel angular speed for KERS hill climb.",
    }),
  );

  const k4 = {
    kind,
    mode: "engine-smoothing",
    flywheelInertiaKgM2: 4.8,
    omegaMaxRadS: 172,
    omegaMinRadS: 148,
    vehicleMassKg: 1000,
    slopeHeightM: 12,
    dragForceN: 200,
    travelDistanceM: 150,
    meanLoadTorqueNm: 115,
    peakTorqueNm: 420,
  };
  const qk4 = solveKind(kind, k4);
  items.push(
    makeCalcMcq(ctx, {
      slug: "eng-fw-04",
      conceptId,
      kind,
      domain: "mechanics",
      syllabi: engTag(),
      difficulty: "standard",
      scenarioSpec: k4,
      requiredGivens: [
        { name: "flywheelInertiaKgM2", value: 4.8, unit: "kg m²", source: "stem" },
        { name: "omegaMaxRadS", value: 172, unit: "rad s⁻¹", source: "stem" },
        { name: "omegaMinRadS", value: 148, unit: "rad s⁻¹", source: "stem" },
      ],
      targetQuantityKey: "energyReleasedJ",
      unit: "J",
      stem: "A single-cylinder generator engine is coupled to a cast-iron flywheel of moment of inertia 4.80 kg m². During each four-stroke cycle its angular speed fluctuates between 172 rad s⁻¹ and 148 rad s⁻¹. What energy is represented by the shaded area above the mean-load torque line on the turning-moment diagram?",
      distractors: [
        {
          value: 0.5 * 4.8 * (172 - 148) ** 2,
          rationale: "Squares the speed difference instead of taking the difference of squares.",
        },
        {
          value: 4.8 * (172 ** 2 - 148 ** 2),
          rationale: "Omits the factor of one-half in $\\frac{1}{2}I(\\omega_{\\max}^2 - \\omega_{\\min}^2)$.",
        },
        {
          value: 0.5 * 4.8 * 172 ** 2,
          rationale: "Computes total stored kinetic energy rather than cyclic fluctuation energy.",
        },
      ],
      workedSolution: `The shaded energy loop equals the cyclic kinetic energy exchange $\\Delta E = \\frac{1}{2}I(\\omega_{\\max}^2 - \\omega_{\\min}^2) = \\frac{1}{2}(4.80)(172^2 - 148^2) = ${fmt3(qk4.energyReleasedJ as number, "J")}$.`,
      markCriterion: `Cyclic flywheel energy exchange equals ${fmt3(qk4.energyReleasedJ as number, "J")}.`,
      planSummary: "Relate turning-moment diagram excess area to cyclic flywheel kinetic energy fluctuation.",
    }),
  );

  // 3 Pure Qualitative MCQs
  items.push(
    makeQualMcq(ctx, {
      slug: "eng-fw-05",
      conceptId,
      kind,
      domain: "mechanics",
      syllabi: engTag(),
      difficulty: "standard",
      scenarioSpec: k1,
      requiredGivens: [],
      targetQuantityKey: "rimDesignRule",
      stem: "Motorsport KERS engineers favour carbon-fibre composite flywheel rims over heavier solid cast-iron discs for compact energy storage. Which physical property combination best explains this choice?",
      distractors: [
        {
          text: "High density and low tensile strength allow slower rotation while storing greater kinetic energy.",
          rationale: "Low tensile strength limits safe centripetal stress and caps $\\omega_{\\max}$.",
        },
        {
          text: "Low elastic modulus increases radial expansion so the rim stores energy purely as elastic strain.",
          rationale: "Flywheels store rotational kinetic energy, not primarily elastic strain energy.",
        },
        {
          text: "High electrical conductivity generates eddy-current braking that boosts stored energy.",
          rationale: "Eddy currents dissipate kinetic energy as unwanted heat.",
        },
      ],
      workedSolution: `Maximum stored energy scales with $\\frac{1}{2}I\\omega_{\\max}^2$, and hoop stress scales as $\\rho r^2 \\omega^2$: a high tensile strength low density composite rim maximises energy stored before bursting.`,
      planSummary: "Explain composite flywheel rim selection via tensile strength-to-density ratio.",
    }),
  );

  items.push(
    makeQualMcq(ctx, {
      slug: "eng-fw-06",
      conceptId,
      kind,
      domain: "mechanics",
      syllabi: engTag(),
      difficulty: "foundation",
      scenarioSpec: k4,
      requiredGivens: [],
      targetQuantityKey: "torqueSmoothingLorAnchor",
      stem: "Referring to the turning-moment diagram for a four-stroke engine coupled to a steady external load, how does the flywheel prevent the crankshaft from stalling between power strokes?",
      distractors: [
        {
          text: "Flywheel increases the mean torque generated by the engine above the thermodynamic power-stroke average.",
          rationale: "A passive flywheel cannot create net mechanical energy or raise mean torque.",
        },
        {
          text: "Flywheel eliminates the compression stroke so engine torque stays positive throughout the cycle.",
          rationale: "A four-stroke cylinder still requires a compression stroke regardless of flywheel inertia.",
        },
        {
          text: "Flywheel converts negative torque directly into electrical energy stored in the battery.",
          rationale: "Standard engine flywheels smooth speed mechanically via rotational kinetic energy.",
        },
      ],
      workedSolution: `On the turning-moment graph, the flywheel absorbs excess energy when engine torque exceeds mean load and releases energy during zero-torque strokes (induction, compression, exhaust), keeping $\\Delta\\omega$ small.`,
      planSummary: "Explain mechanical torque smoothing across a four-stroke engine cycle.",
    }),
  );

  items.push(
    makeQualMcq(ctx, {
      slug: "eng-fw-07",
      conceptId,
      kind,
      domain: "mechanics",
      syllabi: engTag(),
      difficulty: "standard",
      scenarioSpec: k2,
      requiredGivens: [],
      targetQuantityKey: "kersDesignLorAnchor",
      stem: "A high-speed stationary flywheel energy-storage unit spins at several thousand radians per second inside a sealed housing. Which design pairing best minimises energy losses while maximising safe energy capacity?",
      distractors: [
        {
          text: "Pressurised air cooling and greased steel ball bearings with a heavy lead hub.",
          rationale: "Pressurised air causes severe windage drag and lead has low tensile strength.",
        },
        {
          text: "Open-air spoked housing with oil-bath bearings and soft aluminium spokes.",
          rationale: "Open-air spokes cause huge aerodynamic drag and oil churning losses.",
        },
        {
          text: "Water-filled containment jacket with solid brass cylinder rotating at low speed.",
          rationale: "Fluid drag in water would immediately dissipate rotational energy.",
        },
      ],
      workedSolution: `To store energy efficiently at ultra-high $\\omega$, an evacuated casing and magnetic bearings minimise windage and friction losses while high-strength rim permits greater angular speed.`,
      planSummary: "Identify vacuum housing, magnetic bearings, and high-strength rim for high-speed flywheels.",
    }),
  );

  // 3 Multi-part structured
  const fwStructs = [
    {
      slug: "eng-fw-08",
      difficulty: "standard" as const,
      spec: {
        kind,
        mode: "kers",
        flywheelInertiaKgM2: 1.9,
        omegaMaxRadS: 580,
        omegaMinRadS: 240,
        vehicleMassKg: 1150,
        slopeHeightM: 15,
        dragForceN: 220,
        travelDistanceM: 200,
        meanLoadTorqueNm: 90,
        peakTorqueNm: 350,
      },
      vehicle: "a municipal hybrid bus",
    },
    {
      slug: "eng-fw-09",
      difficulty: "higher" as const,
      spec: {
        kind,
        mode: "kers",
        flywheelInertiaKgM2: 3.1,
        omegaMaxRadS: 480,
        omegaMinRadS: 160,
        vehicleMassKg: 1420,
        slopeHeightM: 18,
        dragForceN: 260,
        travelDistanceM: 260,
        meanLoadTorqueNm: 105,
        peakTorqueNm: 390,
      },
      vehicle: "a mountain-shuttle railcar",
    },
    {
      slug: "eng-fw-10",
      difficulty: "higher" as const,
      spec: {
        kind,
        mode: "engine-smoothing",
        flywheelInertiaKgM2: 5.4,
        omegaMaxRadS: 180,
        omegaMinRadS: 156,
        vehicleMassKg: 1050,
        slopeHeightM: 11,
        dragForceN: 175,
        travelDistanceM: 160,
        meanLoadTorqueNm: 120,
        peakTorqueNm: 450,
      },
      vehicle: "a backup generator set",
    },
  ];

  for (const cfg of fwStructs) {
    const sp = cfg.spec;
    const q = solveKind(kind, sp);
    const relStr = fmt3(q.energyReleasedJ as number, "J");
    const peStr = fmt3(q.gravitationalPeGainJ as number, "J");
    const hMaxStr = fmt3(q.maxHeightFromFlywheelM as number, "m");
    items.push(
      makeStructured(ctx, {
        slug: cfg.slug,
        conceptId,
        kind,
        domain: "mechanics",
        syllabi: engTag(),
        difficulty: cfg.difficulty,
        scenarioSpec: sp,
        hiddenQuantities: [
          "energyReleasedJ",
          "gravitationalPeGainJ",
          "maxHeightFromFlywheelM",
        ],
        requiredGivens: [
          { name: "flywheelInertiaKgM2", value: sp.flywheelInertiaKgM2, unit: "kg m²", source: "stem" },
          { name: "omegaMaxRadS", value: sp.omegaMaxRadS, unit: "rad s⁻¹", source: "stem" },
          { name: "omegaMinRadS", value: sp.omegaMinRadS, unit: "rad s⁻¹", source: "stem" },
          { name: "vehicleMassKg", value: sp.vehicleMassKg, unit: "kg", source: "stem" },
          { name: "slopeHeightM", value: sp.slopeHeightM, unit: "m", source: "stem" },
          { name: "dragForceN", value: sp.dragForceN, unit: "N", source: "stem" },
          { name: "travelDistanceM", value: sp.travelDistanceM, unit: "m", source: "stem" },
        ],
        stem: `Engineers evaluate a composite flywheel of moment of inertia ${fmt3(sp.flywheelInertiaKgM2, "kg m²")} operating between ${fmt3(sp.omegaMaxRadS, "rad s⁻¹")} and ${fmt3(sp.omegaMinRadS, "rad s⁻¹")} inside ${cfg.vehicle} of total mass ${fmt3(sp.vehicleMassKg, "kg")}. On a test incline of road length ${fmt3(sp.travelDistanceM, "m")} rising ${fmt3(sp.slopeHeightM, "m")} vertically, the mean resistive drag force is ${fmt3(sp.dragForceN, "N")}. Take $g = 9.81\\text{ m s}^{-2}$.`,
        parts: [
          {
            partId: "a",
            prompt: "Calculate the kinetic energy released by the flywheel as it slows across its operating speed range.",
            marks: 2,
            targetQuantityKey: "energyReleasedJ",
            expectedAnswer: relStr,
            workingSteps: [
              `Apply $\\Delta E_{\\mathrm{k}} = \\frac{1}{2}I(\\omega_{\\max}^2 - \\omega_{\\min}^2)$.`,
              `$\\Delta E_{\\mathrm{k}} = \\frac{1}{2}(${fmt3(sp.flywheelInertiaKgM2)})(${sp.omegaMaxRadS}^2 - ${sp.omegaMinRadS}^2) = ${relStr}$.`,
            ],
          },
          {
            partId: "b",
            prompt: "Calculate the gain in gravitational potential energy during the test incline.",
            marks: 2,
            targetQuantityKey: "gravitationalPeGainJ",
            expectedAnswer: peStr,
            workingSteps: [
              `Use $\\Delta E_{\\mathrm{p}} = m g \\Delta h$ with $g = 9.81\\text{ m s}^{-2}$.`,
              `$\\Delta E_{\\mathrm{p}} = ${sp.vehicleMassKg} \\times 9.81 \\times ${sp.slopeHeightM} = ${peStr}$.`,
            ],
          },
          {
            partId: "c",
            prompt: "Assuming zero transmission losses and constant resistive work along the same road length, determine the maximum vertical height this flywheel energy release could lift the vehicle.",
            marks: 3,
            dependsOnPartIds: ["a"],
            targetQuantityKey: "maxHeightFromFlywheelM",
            expectedAnswer: hMaxStr,
            workingSteps: [
              `Work against drag $W_{\\mathrm{d}} = F_{\\mathrm{d}} s = ${fmt3(q.dragWorkJ as number, "J")}$.`,
              `Remaining energy for height gain $mgh_{\\max} = \\Delta E_{\\mathrm{k}} - W_{\\mathrm{d}}$.`,
              `$h_{\\max} = \\frac{\\Delta E_{\\mathrm{k}} - F_{\\mathrm{d}}s}{mg} = ${hMaxStr}$.`,
            ],
          },
        ],
        workedSolution: `(a) $\\Delta E_{\\mathrm{k}} = ${relStr}$. (b) $\\Delta E_{\\mathrm{p}} = ${peStr}$. (c) Subtracting drag work ${fmt3(q.dragWorkJ as number, "J")} and dividing by $mg$ gives $h_{\\max} = ${hMaxStr}$.`,
        markScheme: [
          { code: "M1", criterion: "Uses $\\Delta E_{\\mathrm{k}} = \\frac{1}{2}I(\\omega_{\\max}^2 - \\omega_{\\min}^2)$.", marks: 1, partId: "a" },
          { code: "A1", criterion: `Obtains ${relStr}.`, marks: 1, partId: "a" },
          { code: "M1", criterion: "Uses $mgh$ with $g = 9.81\\text{ m s}^{-2}$.", marks: 1, partId: "b" },
          { code: "A1", criterion: `Obtains ${peStr}.`, marks: 1, partId: "b" },
          { code: "M1", criterion: "Computes drag work $F_{\\mathrm{d}}s$ and subtracts from flywheel energy release.", marks: 1, partId: "c" },
          { code: "M1", criterion: "Equates remaining energy to $mg h_{\\max}$.", marks: 1, partId: "c" },
          { code: "A1", criterion: `Obtains $h_{\\max} = ${hMaxStr}$.`, marks: 1, partId: "c" },
        ],
        planSummary: "Evaluate KERS flywheel energy budget against gravitational climb and drag using standard UK gravity.",
      }),
    );
  }

  // 2 × Authentic 6-mark LoRs for Plugin 2
  items.push(
    makeLor6(ctx, {
      slug: "eng-fw-11",
      conceptId,
      kind,
      domain: "mechanics",
      syllabi: engTag(),
      difficulty: "higher",
      scenarioSpec: k4,
      requiredGivens: [],
      targetQuantityKey: "torqueSmoothingLorAnchor",
      stem: "A single-cylinder four-stroke diesel generator requires a heavy steel flywheel on its crankshaft, whereas an electric induction motor of the same mean power output does not. The turning-moment graph illustrates the cyclic torque delivered by the diesel engine against crankshaft angle.",
      prompt:
        "Explain why the diesel engine needs a flywheel to maintain steady speed under constant load while the electric motor does not, referencing the turning-moment diagram and the role of moment of inertia in limiting speed fluctuations.",
      expectedAnswer:
        "A four-stroke diesel cylinder delivers positive driving torque during only one of its four strokes, with negative or near-zero torque during induction, compression, and exhaust, whereas an electric motor supplies nearly continuous torque. On the turning-moment diagram, the flywheel absorbs excess energy when engine torque exceeds mean load and releases energy during zero-torque strokes so the crankshaft continues turning smoothly through compression. Because cyclic energy exchange equals half times moment of inertia times the difference in squared angular speeds, increasing the moment of inertia reduces the angular speed fluctuation for a given energy pulse, although excessive inertia slows deliberate throttle response.",
      workingSteps: [
        "L1: Contrast the single power stroke per two revolutions of a four-stroke engine with the nearly steady torque of an electric motor.",
        "L1: Identify that engine torque falls below the mean load (and goes negative during compression) for most of the cycle.",
        "L2: Link positive shaded areas above the mean-load line to excess work stored as rotational kinetic energy while the flywheel accelerates.",
        "L2: Link regions below the mean-load line to kinetic energy released by the flywheel to drive the load and compress gas.",
        "L3: Use $\\Delta E = \\frac{1}{2}I(\\omega_{\\max}^2 - \\omega_{\\min}^2) = I\\omega_{\\mathrm{mean}}\\Delta\\omega$ to explain why large $I$ keeps $\\Delta\\omega$ small.",
        "L3: Note the engineering trade-off that a larger moment of inertia also reduces responsiveness when changing speed deliberately.",
      ],
      levelCriteria: [
        "States that a four-stroke engine produces driving torque during only one stroke in four whereas an electric motor provides nearly steady torque.",
        "Notes that torque falls to zero or negative during induction, compression, and exhaust strokes.",
        "Explains from the graph that excess energy above the mean-load line accelerates the flywheel and increases its rotational kinetic energy.",
        "Explains that when engine torque is below the mean load, the flywheel decelerates and supplies energy to keep the shaft turning through compression.",
        "Applies $\\Delta E = \\frac{1}{2}I(\\omega_{\\max}^2 - \\omega_{\\min}^2)$ to show that larger moment of inertia $I$ gives a smaller speed fluctuation $\\Delta\\omega$.",
        "Identifies a valid practical design trade-off such as slower deliberate acceleration or extra mass/bearing load from a very large flywheel.",
      ],
      workedSolution:
        "A four-stroke engine produces driving torque on only one of its four strokes while an electric motor gives steady torque. On the turning-moment diagram, the flywheel absorbs excess energy when engine torque exceeds mean load and releases energy during zero-torque strokes. Since $\\Delta E = \\frac{1}{2}I(\\omega_{\\max}^2 - \\omega_{\\min}^2) = I\\bar{\\omega}\\Delta\\omega$, a large moment of inertia $I$ keeps speed fluctuation $\\Delta\\omega$ small, balanced against slower deliberate acceleration.",
      planSummary: "Extended level of response comparison of diesel engine flywheel smoothing versus electric motor.",
    }),
  );

  items.push(
    makeLor6(ctx, {
      slug: "eng-fw-12",
      conceptId,
      kind,
      domain: "mechanics",
      syllabi: engTag(),
      difficulty: "higher",
      scenarioSpec: k1,
      requiredGivens: [],
      targetQuantityKey: "kersDesignLorAnchor",
      stem: "An engineering team is redesigning a heavy cast-iron KERS flywheel for a racing prototype to increase energy stored per kilogram while keeping losses low during coasting.",
      prompt:
        "Explain the key material, geometric, and housing modifications required to maximise the energy stored safely in a KERS flywheel and minimise parasitic energy losses.",
      expectedAnswer:
        "Maximum kinetic energy stored depends on half times moment of inertia times angular speed squared, so concentrating mass near the outer rim increases moment of inertia for a given mass while using a low-density, high-tensile-strength carbon-fibre composite prevents the rim from bursting under high centripetal hoop stress at large angular speed. Furthermore, an evacuated casing and magnetic bearings minimise windage and friction losses while high-strength rim permits greater angular speed, and a reinforced containment shroud protects the vehicle if catastrophic failure ever occurs.",
      workingSteps: [
        "L1: State $E_{\\mathrm{k}} = \\frac{1}{2}I\\omega^2$ and note that energy rises with both $I$ and the square of $\\omega$.",
        "L1: Explain that placing mass at the outer rim increases $I = \\sum m r^2$ for a fixed mass.",
        "L2: Explain that at high $\\omega$, large centripetal forces produce high tensile hoop stress in the rim.",
        "L2: Justify replacing cast iron with high-tensile-strength, low-density composite material to raise safe $\\omega_{\\max}$.",
        "L3: Explain using an evacuated housing to eliminate aerodynamic windage drag and magnetic bearings to eliminate mechanical axle friction.",
        "L3: Mention safety containment or gyroscopic stability considerations during cornering.",
      ],
      levelCriteria: [
        "States that stored energy $E_{\\mathrm{k}} = \\frac{1}{2}I\\omega^2$ grows linearly with $I$ and quadratically with $\\omega$.",
        "Explains that concentrating mass in an outer rim maximises $I = \\sum m r^2$ for a given mass.",
        "Explains that centripetal stress limits $\\omega_{\\max}$ and motivates high tensile strength, low-density composite fibres.",
        "Explains that enclosing the rotor in a vacuum (evacuated casing) drastically reduces aerodynamic windage losses.",
        "Explains that magnetic bearings eliminate solid-on-solid axle contact friction at high angular speeds.",
        "Discusses a safety or operational implication such as an armoured containment casing or gyroscopic torque during vehicle turns.",
      ],
      workedSolution:
        "From $E_{\\mathrm{k}} = \\frac{1}{2}I\\omega^2$, concentrating mass at the rim raises $I$, while high-tensile, low-density composites resist bursting stress so $\\omega_{\\max}$ increases dramatically. An evacuated casing and magnetic bearings minimise windage and friction losses while high-strength rim permits greater angular speed, supported by containment shielding for safety.",
      planSummary: "Extended level of response engineering redesign of a high-speed composite KERS flywheel.",
    }),
  );

  return items;
}

/* ========================================================================== */
/*  3. Plugin 3: al-opt-eng-angular-momentum-impulse (12 items)               */
/* ========================================================================== */

function buildAngularMomentumItems(ctx: BuildContext): CandidateQuestionInput[] {
  const kind = "al-opt-eng-angular-momentum-impulse";
  const conceptId = "rigid-body-rotational-dynamics";
  const items: CandidateQuestionInput[] = [];

  const c1 = {
    kind,
    mode: "coaxial-clutch",
    inertia1KgM2: 0.9,
    omega1RadS: 50,
    inertia2KgM2: 1.6,
    omega2RadS: 0,
    impulseDurationS: 0.5,
  };
  const qc1 = solveKind(kind, c1);
  items.push(
    makeCalcMcq(ctx, {
      slug: "eng-am-01",
      conceptId,
      kind,
      domain: "mechanics",
      syllabi: engTag(),
      difficulty: "foundation",
      scenarioSpec: c1,
      requiredGivens: [
        { name: "inertia1KgM2", value: 0.9, unit: "kg m²", source: "either" },
        { name: "omega1RadS", value: 50, unit: "rad s⁻¹", source: "either" },
        { name: "inertia2KgM2", value: 1.6, unit: "kg m²", source: "either" },
      ],
      targetQuantityKey: "commonOmegaRadS",
      unit: "rad s⁻¹",
      stem: "An upper clutch plate of moment of inertia 0.90 kg m² spinning freely at 50.0 rad s⁻¹ drops coaxially onto a stationary lower plate of moment of inertia 1.60 kg m² on a frictionless vertical shaft. Calculate the common angular velocity once slipping ceases.",
      distractors: [
        {
          value: (0.9 * 50) / 1.6,
          rationale: "Divides initial angular momentum by $I_2$ alone instead of the combined inertia $I_1 + I_2$.",
        },
        {
          value: Math.sqrt((0.9 * 50 * 50) / (0.9 + 1.6)),
          rationale: "Incorrectly conserves rotational kinetic energy instead of angular momentum.",
        },
        {
          value: (1.6 * 50) / (0.9 + 1.6),
          rationale: "Swaps $I_1$ and $I_2$ in the conservation numerator.",
        },
      ],
      workedSolution: `With no external torque, $(I_1 + I_2)\\omega_{\\mathrm{f}} = I_1\\omega_1$. Thus $\\omega_{\\mathrm{f}} = \\frac{0.90 \\times 50.0}{0.90 + 1.60} = ${fmt3(qc1.commonOmegaRadS as number, "rad s⁻¹")}$.`,
      markCriterion: `Common final angular velocity equals ${fmt3(qc1.commonOmegaRadS as number, "rad s⁻¹")}.`,
      planSummary: "Apply conservation of angular momentum to an inelastic coaxial clutch engagement.",
    }),
  );

  const c2 = {
    kind,
    mode: "coaxial-clutch",
    inertia1KgM2: 1.2,
    omega1RadS: 40,
    inertia2KgM2: 1.8,
    omega2RadS: -10,
    impulseDurationS: 0.8,
  };
  const qc2 = solveKind(kind, c2);
  items.push(
    makeCalcMcq(ctx, {
      slug: "eng-am-02",
      conceptId,
      kind,
      domain: "mechanics",
      syllabi: engTag(),
      difficulty: "higher",
      scenarioSpec: c2,
      requiredGivens: [
        { name: "inertia1KgM2", value: 1.2, unit: "kg m²", source: "either" },
        { name: "omega1RadS", value: 40, unit: "rad s⁻¹", source: "either" },
        { name: "inertia2KgM2", value: 1.8, unit: "kg m²", source: "either" },
        { name: "omega2RadS", value: -10, unit: "rad s⁻¹", source: "either" },
      ],
      targetQuantityKey: "keDissipatedHeatJ",
      unit: "J",
      stem: "Two coaxial clutch discs rotate in opposite senses on a frictionless shaft: Disc 1 has $I_1 = 1.20\\text{ kg m}^2$ at $+40.0\\text{ rad s}^{-1}$ and Disc 2 has $I_2 = 1.80\\text{ kg m}^2$ at $-10.0\\text{ rad s}^{-1}$. When engaged together they reach a common angular speed. How much rotational kinetic energy is dissipated as heat?",
      distractors: [
        {
          value: qc2.finalTotalKeJ as number,
          rationale: "Reports the remaining final kinetic energy rather than the energy dissipated as heat.",
        },
        {
          value: qc2.initialTotalKeJ as number,
          rationale: "Reports the total initial kinetic energy without subtracting final kinetic energy.",
        },
        {
          value:
            (qc2.initialTotalKeJ as number) -
            0.5 * 3.0 * ((1.2 * 40 + 1.8 * 10) / 3.0) ** 2,
          rationale: "Ignores the negative sign on the counter-rotating second disc when finding $\\omega_{\\mathrm{f}}$.",
        },
      ],
      workedSolution: `Initial angular momentum $L = 1.20(40.0) + 1.80(-10.0) = 30.0\\text{ N m s}$, giving $\\omega_{\\mathrm{f}} = \\frac{30.0}{3.00} = 10.0\\text{ rad s}^{-1}$. Initial KE $= \\frac{1}{2}(1.20)(40^2) + \\frac{1}{2}(1.80)(10^2) = 1050\\text{ J}$; final KE $= \\frac{1}{2}(3.00)(10^2) = 150\\text{ J}$. Energy dissipated $= ${fmt3(qc2.keDissipatedHeatJ as number, "J")}$.`,
      markCriterion: `Thermal energy dissipated equals ${fmt3(qc2.keDissipatedHeatJ as number, "J")}.`,
      planSummary: "Compute kinetic energy dissipated when counter-rotating clutch plates engage.",
    }),
  );

  const c3 = {
    kind,
    mode: "retracting-arms",
    inertia1KgM2: 24.0,
    omega1RadS: 2.2,
    inertia2KgM2: 8.8,
    omega2RadS: 0,
    impulseDurationS: 5.0,
  };
  const qc3 = solveKind(kind, c3);
  items.push(
    makeCalcMcq(ctx, {
      slug: "eng-am-03",
      conceptId,
      kind,
      domain: "mechanics",
      syllabi: engTag(),
      difficulty: "foundation",
      scenarioSpec: c3,
      requiredGivens: [
        { name: "inertia1KgM2", value: 24.0, unit: "kg m²", source: "either" },
        { name: "omega1RadS", value: 2.2, unit: "rad s⁻¹", source: "either" },
        { name: "inertia2KgM2", value: 8.8, unit: "kg m²", source: "either" },
      ],
      targetQuantityKey: "finalOmegaSatelliteRadS",
      unit: "rad s⁻¹",
      stem: "A spin-stabilised research satellite with extended sensor booms has moment of inertia 24.0 kg m² and spins at 2.20 rad s⁻¹ in deep space. Internal winches retract the booms, lowering its moment of inertia to 8.80 kg m². Calculate the new angular speed of the satellite.",
      distractors: [
        {
          value: (8.8 * 2.2) / 24.0,
          rationale: "Inverts the inertia ratio, predicting the satellite slows down upon retraction.",
        },
        {
          value: 2.2 * Math.sqrt(24.0 / 8.8),
          rationale: "Assumes rotational kinetic energy stays constant instead of angular momentum.",
        },
        {
          value: (24.0 * 2.2) / (24.0 + 8.8),
          rationale: "Adds the two moments of inertia as if a second body had coupled onto the satellite.",
        },
      ],
      workedSolution: `By conservation of angular momentum $I_1\\omega_1 = I_2\\omega_2$, $\\omega_2 = \\frac{24.0 \\times 2.20}{8.80} = ${fmt3(qc3.finalOmegaSatelliteRadS as number, "rad s⁻¹")}$.`,
      markCriterion: `New angular speed equals ${fmt3(qc3.finalOmegaSatelliteRadS as number, "rad s⁻¹")}.`,
      planSummary: "Calculate satellite spin-up from angular momentum conservation on arm retraction.",
    }),
  );

  const c4 = {
    kind,
    mode: "angular-impulse",
    inertia1KgM2: 2.5,
    omega1RadS: 16.0,
    inertia2KgM2: 2.5,
    omega2RadS: -12.0,
    impulseDurationS: 1.4,
  };
  const qc4 = solveKind(kind, c4);
  items.push(
    makeCalcMcq(ctx, {
      slug: "eng-am-04",
      conceptId,
      kind,
      domain: "mechanics",
      syllabi: engTag(),
      difficulty: "standard",
      scenarioSpec: c4,
      requiredGivens: [
        { name: "inertia1KgM2", value: 2.5, unit: "kg m²", source: "stem" },
        { name: "omega1RadS", value: 16.0, unit: "rad s⁻¹", source: "stem" },
        { name: "omega2RadS", value: -12.0, unit: "rad s⁻¹", source: "stem" },
      ],
      targetQuantityKey: "angularImpulseMagNms",
      unit: "N m s",
      stem: "A reversing mill drum of moment of inertia 2.50 kg m² initially turns clockwise at $+16.0\\text{ rad s}^{-1}$. A steady reversing torque brings it to $-12.0\\text{ rad s}^{-1}$ (anticlockwise). Calculate the magnitude of the angular impulse delivered to the drum.",
      distractors: [
        {
          value: 2.5 * Math.abs(16.0 - 12.0),
          rationale: "Subtracts the speeds instead of accounting for the sign reversal $\\omega_2 - \\omega_1 = -28.0\\text{ rad s}^{-1}$.",
        },
        {
          value: 0.5 * 2.5 * (16.0 ** 2 - 12.0 ** 2),
          rationale: "Computes change in rotational kinetic energy instead of angular impulse $\\Delta(I\\omega)$.",
        },
        {
          value: (qc4.angularImpulseMagNms as number) / 1.4,
          rationale: "Divides angular impulse by duration to report mean torque instead of impulse.",
        },
      ],
      workedSolution: `Angular impulse $T\\Delta t = \\Delta(I\\omega) = I(\\omega_2 - \\omega_1) = 2.50(-12.0 - 16.0) = -70.0\\text{ N m s}$. Its magnitude is ${fmt3(qc4.angularImpulseMagNms as number, "N m s")}.`,
      markCriterion: `Magnitude of angular impulse equals ${fmt3(qc4.angularImpulseMagNms as number, "N m s")}.`,
      planSummary: "Compute signed angular impulse across a rotational direction reversal.",
    }),
  );

  const c5 = {
    kind,
    mode: "angular-impulse",
    inertia1KgM2: 3.6,
    omega1RadS: 20.0,
    inertia2KgM2: 3.6,
    omega2RadS: -10.0,
    impulseDurationS: 1.8,
  };
  const qc5 = solveKind(kind, c5);
  items.push(
    makeCalcMcq(ctx, {
      slug: "eng-am-05",
      conceptId,
      kind,
      domain: "mechanics",
      syllabi: engTag(),
      difficulty: "standard",
      scenarioSpec: c5,
      requiredGivens: [
        { name: "inertia1KgM2", value: 3.6, unit: "kg m²", source: "stem" },
        { name: "omega1RadS", value: 20.0, unit: "rad s⁻¹", source: "stem" },
        { name: "omega2RadS", value: -10.0, unit: "rad s⁻¹", source: "stem" },
        { name: "impulseDurationS", value: 1.8, unit: "s", source: "either" },
      ],
      targetQuantityKey: "meanImpulseTorqueMagNm",
      unit: "N m",
      stem: "A marine thruster rotor of moment of inertia 3.60 kg m² reverses from $+20.0\\text{ rad s}^{-1}$ to $-10.0\\text{ rad s}^{-1}$ in 1.80 s under a uniform braking-and-reversing pulse. What is the magnitude of the mean external torque acting on the rotor?",
      distractors: [
        {
          value: (3.6 * (20.0 - 10.0)) / 1.8,
          rationale: "Uses speed difference $20.0 - 10.0$ rather than vector change $20.0 - (-10.0) = 30.0\\text{ rad s}^{-1}$.",
        },
        {
          value: 3.6 * 30.0,
          rationale: "Reports angular impulse in $\\text{N m s}$ without dividing by $\\Delta t = 1.80\\text{ s}$.",
        },
        {
          value: (3.6 * 30.0) * 1.8,
          rationale: "Multiplies change in angular momentum by time instead of dividing.",
        },
      ],
      workedSolution: `$|\\Delta L| = I|\\omega_2 - \\omega_1| = 3.60(30.0) = 108\\text{ N m s}$. Mean torque $|T| = \\frac{|\\Delta L|}{\\Delta t} = \\frac{108}{1.80} = ${fmt3(qc5.meanImpulseTorqueMagNm as number, "N m")}$.`,
      markCriterion: `Magnitude of mean torque equals ${fmt3(qc5.meanImpulseTorqueMagNm as number, "N m")}.`,
      planSummary: "Find mean torque from signed angular momentum reversal over a pulse interval.",
    }),
  );

  // 3 Pure Qualitative MCQs
  items.push(
    makeQualMcq(ctx, {
      slug: "eng-am-06",
      conceptId,
      kind,
      domain: "mechanics",
      syllabi: engTag(),
      difficulty: "foundation",
      questionStyle: "definition",
      scenarioSpec: c4,
      requiredGivens: [],
      targetQuantityKey: "impulseUnitRule",
      stem: "Which SI unit name corresponds directly to angular impulse $T\\Delta t$ and angular momentum $I\\omega$?",
      distractors: [
        {
          text: "Newton metre per second.",
          rationale: "Corresponds to mechanical power ($\\text{J s}^{-1} = \\text{W}$), not angular impulse.",
        },
        {
          text: "Kilogram metre per second.",
          rationale: "Gives linear momentum, missing the second factor of length.",
        },
        {
          text: "Newton per metre second.",
          rationale: "Divides by length and time instead of multiplying.",
        },
      ],
      workedSolution: `Torque has unit $\\text{N m}$ and time has unit $\\text{s}$, so angular impulse $T\\Delta t$ has SI unit $\\text{N m s}$, the newton metre second.`,
      planSummary: "Confirm exact SI unit name for angular impulse and angular momentum.",
    }),
  );

  items.push(
    makeQualMcq(ctx, {
      slug: "eng-am-07",
      conceptId,
      kind,
      domain: "mechanics",
      syllabi: engTag(),
      difficulty: "foundation",
      scenarioSpec: c1,
      requiredGivens: [],
      targetQuantityKey: "conservationConditionRule",
      stem: "Under what exact physical condition is the total angular momentum of a multi-disc clutch assembly conserved during engagement?",
      distractors: [
        {
          text: "Total rotational kinetic energy remains unchanged while the discs slip.",
          rationale: "Clutch engagement is inelastic: KE decreases while angular momentum is still conserved.",
        },
        {
          text: "Internal friction forces between the mating clutch faces are strictly zero.",
          rationale: "Internal friction torques occur in Newton-third-law pairs and cancel out.",
        },
        {
          text: "Both discs initially rotate at the same angular speed before contact.",
          rationale: "Angular momentum is conserved regardless of the initial speeds provided external torque is zero.",
        },
      ],
      workedSolution: `Internal friction torques act equally and oppositely on the two plates, so total angular momentum is conserved provided no resultant external torque acts on the system.`,
      planSummary: "State exact condition for conservation of angular momentum.",
    }),
  );

  items.push(
    makeQualMcq(ctx, {
      slug: "eng-am-08",
      conceptId,
      kind,
      domain: "mechanics",
      syllabi: engTag(),
      difficulty: "standard",
      scenarioSpec: c3,
      requiredGivens: [],
      targetQuantityKey: "internalWorkRule",
      stem: "When a spinning satellite retracts its extended radial mass pods inward in deep space, its angular momentum stays constant yet its rotational kinetic energy increases. What supplies this extra rotational kinetic energy?",
      distractors: [
        {
          text: "External gravitational torque from nearby planets accelerates the satellite.",
          rationale: "An external torque would violate conservation of angular momentum.",
        },
        {
          text: "Rotational kinetic energy is actually unchanged because $I$ decreases by the same factor that $\\omega$ rises.",
          rationale: "Ignores that $E_{\\mathrm{k}} = \\frac{L^2}{2I}$ increases inversely with $I$ when $L$ is fixed.",
        },
        {
          text: "Conservation of angular momentum spontaneously creates kinetic energy without work being done.",
          rationale: "Violates conservation of energy.",
        },
      ],
      workedSolution: `Since $E_{\\mathrm{k}} = \\frac{L^2}{2I}$ rises when $I$ decreases at constant $L$, internal radial forces do positive work pulling masses inward so rotational kinetic energy increases.`,
      planSummary: "Explain energy source for rotational KE increase during radial retraction.",
    }),
  );

  // 4 Multi-part structured
  const amStructs = [
    {
      slug: "eng-am-09",
      difficulty: "standard" as const,
      spec: {
        kind,
        mode: "coaxial-clutch",
        inertia1KgM2: 0.75,
        omega1RadS: 48,
        inertia2KgM2: 1.25,
        omega2RadS: 0,
        impulseDurationS: 0.6,
      },
      type: "clutch" as const,
    },
    {
      slug: "eng-am-10",
      difficulty: "higher" as const,
      spec: {
        kind,
        mode: "coaxial-clutch",
        inertia1KgM2: 1.5,
        omega1RadS: 36,
        inertia2KgM2: 0.9,
        omega2RadS: -12,
        impulseDurationS: 0.9,
      },
      type: "clutch" as const,
    },
    {
      slug: "eng-am-11",
      difficulty: "standard" as const,
      spec: {
        kind,
        mode: "retracting-arms",
        inertia1KgM2: 16.0,
        omega1RadS: 3.0,
        inertia2KgM2: 6.4,
        omega2RadS: 0,
        impulseDurationS: 4.0,
      },
      type: "satellite" as const,
    },
    {
      slug: "eng-am-12",
      difficulty: "higher" as const,
      spec: {
        kind,
        mode: "retracting-arms",
        inertia1KgM2: 32.0,
        omega1RadS: 1.8,
        inertia2KgM2: 12.0,
        omega2RadS: 0,
        impulseDurationS: 6.0,
      },
      type: "satellite" as const,
    },
  ];

  for (const cfg of amStructs) {
    const sp = cfg.spec;
    const q = solveKind(kind, sp);
    if (cfg.type === "clutch") {
      const wfStr = fmt3(q.commonOmegaRadS as number, "rad s⁻¹");
      const lossStr = fmt3(q.keDissipatedHeatJ as number, "J");
      const tMeanStr = fmt3(q.meanClutchTorqueNm as number, "N m");
      items.push(
        makeStructured(ctx, {
          slug: cfg.slug,
          conceptId,
          kind,
          domain: "mechanics",
          syllabi: engTag(),
          difficulty: cfg.difficulty,
          scenarioSpec: sp,
          hiddenQuantities: [
            "commonOmegaRadS",
            "keDissipatedHeatJ",
            "meanClutchTorqueNm",
            "keNonConservationRule",
          ],
          requiredGivens: [
            { name: "inertia1KgM2", value: sp.inertia1KgM2, unit: "kg m²", source: "either" },
            { name: "omega1RadS", value: sp.omega1RadS, unit: "rad s⁻¹", source: "either" },
            { name: "inertia2KgM2", value: sp.inertia2KgM2, unit: "kg m²", source: "either" },
            ...(sp.omega2RadS !== 0
              ? [{ name: "omega2RadS", value: sp.omega2RadS, unit: "rad s⁻¹", source: "either" as const }]
              : []),
            { name: "impulseDurationS", value: sp.impulseDurationS, unit: "s", source: "stem" },
          ],
          stem: `Two coaxial clutch discs on a frictionless vertical shaft have moments of inertia $I_1 = ${fmt3(sp.inertia1KgM2, "kg m²")}$ (spinning at ${fmt3(sp.omega1RadS, "rad s⁻¹")}) and $I_2 = ${fmt3(sp.inertia2KgM2, "kg m²")}$ (${sp.omega2RadS === 0 ? "initially at rest" : `initially spinning at ${fmt3(sp.omega2RadS, "rad s⁻¹")}`}). The discs engage and reach a common angular speed after slipping for ${fmt3(sp.impulseDurationS, "s")}.`,
          parts: [
            {
              partId: "a",
              prompt: "Calculate the common angular velocity of the coupled discs.",
              marks: 2,
              targetQuantityKey: "commonOmegaRadS",
              expectedAnswer: wfStr,
              workingSteps: [
                `Conserve angular momentum: $(I_1 + I_2)\\omega_{\\mathrm{f}} = I_1\\omega_1 + I_2\\omega_2$.`,
                `$\\omega_{\\mathrm{f}} = ${wfStr}$.`,
              ],
            },
            {
              partId: "b",
              prompt: "Calculate the mean friction torque exerted on Disc 2 during the slipping interval.",
              marks: 2,
              dependsOnPartIds: ["a"],
              targetQuantityKey: "meanClutchTorqueNm",
              expectedAnswer: tMeanStr,
              workingSteps: [
                `Angular impulse on Disc 2 is $I_2|\\omega_{\\mathrm{f}} - \\omega_2| = ${fmt3(q.clutchImpulseNms as number, "N m s")}$.`,
                `Divide by $\\Delta t = ${fmt3(sp.impulseDurationS, "s")}$ to obtain $T = ${tMeanStr}$.`,
              ],
            },
            {
              partId: "c",
              prompt: "Calculate the rotational kinetic energy lost during engagement and explain physically what happens to it.",
              marks: 3,
              dependsOnPartIds: ["a"],
              targetQuantityKey: "keDissipatedHeatJ",
              expectedAnswer: `${lossStr}; kinetic energy decreases because thermal energy is dissipated by friction between slipping clutch plates.`,
              workingSteps: [
                `Initial KE $= ${fmt3(q.initialTotalKeJ as number, "J")}$, final KE $= ${fmt3(q.finalTotalKeJ as number, "J")}$.`,
                `Energy lost $= ${lossStr}$, dissipated as thermal energy by sliding friction between the clutch surfaces.`,
              ],
            },
          ],
          workedSolution: `(a) $\\omega_{\\mathrm{f}} = ${wfStr}$. (b) Mean clutch torque $= \\frac{I_2|\\omega_{\\mathrm{f}} - \\omega_2|}{\\Delta t} = ${tMeanStr}$. (c) Energy dissipated $= ${lossStr}$ as heat from sliding friction.`,
          markScheme: [
            { code: "M1", criterion: "Applies conservation of angular momentum $(I_1 + I_2)\\omega_{\\mathrm{f}} = I_1\\omega_1 + I_2\\omega_2$.", marks: 1, partId: "a" },
            { code: "A1", criterion: `Obtains $\\omega_{\\mathrm{f}} = ${wfStr}$.`, marks: 1, partId: "a" },
            { code: "M1", criterion: "Applies angular impulse $T\\Delta t = \\Delta(I_2\\omega_2)$.", marks: 1, partId: "b" },
            { code: "A1", criterion: `Obtains mean torque $= ${tMeanStr}$.`, marks: 1, partId: "b" },
            { code: "M1", criterion: "Computes both initial and final total rotational kinetic energy.", marks: 1, partId: "c" },
            { code: "A1", criterion: `Obtains energy loss $= ${lossStr}$.`, marks: 1, partId: "c" },
            { code: "B1", criterion: "States that energy is dissipated as thermal energy due to friction while the plates slip.", marks: 1, partId: "c" },
          ],
          planSummary: "Coaxial clutch angular momentum conservation, mean friction torque, and thermal dissipation.",
        }),
      );
    } else {
      const w2Str = fmt3(q.finalOmegaSatelliteRadS as number, "rad s⁻¹");
      const workStr = fmt3(q.internalWorkDoneJ as number, "J");
      items.push(
        makeStructured(ctx, {
          slug: cfg.slug,
          conceptId,
          kind,
          domain: "mechanics",
          syllabi: engTag(),
          difficulty: cfg.difficulty,
          scenarioSpec: sp,
          hiddenQuantities: [
            "finalOmegaSatelliteRadS",
            "internalWorkDoneJ",
            "internalWorkRule",
          ],
          requiredGivens: [
            { name: "inertia1KgM2", value: sp.inertia1KgM2, unit: "kg m²", source: "either" },
            { name: "omega1RadS", value: sp.omega1RadS, unit: "rad s⁻¹", source: "either" },
            { name: "inertia2KgM2", value: sp.inertia2KgM2, unit: "kg m²", source: "either" },
          ],
          stem: `A spinning orbital probe with extended telemetry booms has moment of inertia ${fmt3(sp.inertia1KgM2, "kg m²")} and spins at ${fmt3(sp.omega1RadS, "rad s⁻¹")} with zero external torque. Internal actuators draw the booms inward, reducing the moment of inertia to ${fmt3(sp.inertia2KgM2, "kg m²")}.`,
          parts: [
            {
              partId: "a",
              prompt: "Calculate the final angular velocity of the probe.",
              marks: 2,
              targetQuantityKey: "finalOmegaSatelliteRadS",
              expectedAnswer: w2Str,
              workingSteps: [
                `Apply $I_1\\omega_1 = I_2\\omega_2$.`,
                `$\\omega_2 = \\frac{${fmt3(sp.inertia1KgM2)} \\times ${fmt3(sp.omega1RadS)}}{${fmt3(sp.inertia2KgM2)}} = ${w2Str}$.`,
              ],
            },
            {
              partId: "b",
              prompt: "Calculate the work done by the internal winches in retracting the booms.",
              marks: 3,
              dependsOnPartIds: ["a"],
              targetQuantityKey: "internalWorkDoneJ",
              expectedAnswer: workStr,
              workingSteps: [
                `Initial KE $= \\frac{1}{2}I_1\\omega_1^2 = ${fmt3(q.initialSatelliteKeJ as number, "J")}$.`,
                `Final KE $= \\frac{1}{2}I_2\\omega_2^2 = ${fmt3(q.finalSatelliteKeJ as number, "J")}$.`,
                `Internal work done $= \\Delta E_{\\mathrm{k}} = ${workStr}$.`,
              ],
            },
            {
              partId: "c",
              prompt: "Explain why rotational kinetic energy increases even though no external torque acts on the probe.",
              marks: 2,
              targetMode: "qualitative",
              targetQuantityKey: "internalWorkRule",
              expectedAnswer:
                "Internal radial forces do positive work pulling masses inward so rotational kinetic energy increases.",
              workingSteps: [
                "Internal radial forces pass through the axis and create zero external torque, leaving angular momentum unchanged.",
                "Because the winches pull the pods inward against their outward tendency, internal radial forces do positive work increasing kinetic energy.",
              ],
            },
          ],
          workedSolution: `(a) $\\omega_2 = ${w2Str}$. (b) Work done $= \\frac{1}{2}I_2\\omega_2^2 - \\frac{1}{2}I_1\\omega_1^2 = ${workStr}$. (c) Internal radial forces do positive work pulling masses inward so rotational kinetic energy increases.`,
          markScheme: [
            { code: "M1", criterion: "Applies $I_1\\omega_1 = I_2\\omega_2$.", marks: 1, partId: "a" },
            { code: "A1", criterion: `Obtains $\\omega_2 = ${w2Str}$.`, marks: 1, partId: "a" },
            { code: "M1", criterion: "Calculates initial rotational KE $\\frac{1}{2}I_1\\omega_1^2$.", marks: 1, partId: "b" },
            { code: "M1", criterion: "Calculates final rotational KE $\\frac{1}{2}I_2\\omega_2^2$ and finds difference.", marks: 1, partId: "b" },
            { code: "A1", criterion: `Obtains internal work $= ${workStr}$.`, marks: 1, partId: "b" },
            { code: "B1", criterion: "Explains that radial actuator forces produce zero torque about the spin axis.", marks: 1, partId: "c" },
            { code: "B1", criterion: "States that internal radial forces do positive work pulling the pods inward.", marks: 1, partId: "c" },
          ],
          planSummary: "Spinning probe boom retraction angular velocity, internal work, and energy explanation.",
        }),
      );
    }
  }

  return items;
}

/* ========================================================================== */
/*  4. Plugin 4: al-opt-eng-first-law-adiabatic (12 items)                    */
/* ========================================================================== */

function buildFirstLawAdiabaticItems(ctx: BuildContext): CandidateQuestionInput[] {
  const kind = "al-opt-eng-first-law-adiabatic";
  const conceptId = "ideal-gas-pv-cycles";
  const items: CandidateQuestionInput[] = [];

  const a1 = {
    kind,
    processType: "adiabatic",
    p1Pa: 4.8e5,
    v1M3: 1.5e-3,
    v2M3: 4.5e-3,
    gamma: 1.4,
    moles: 0.25,
  };
  const qa1 = solveKind(kind, a1);
  items.push(
    makeCalcMcq(ctx, {
      slug: "eng-fl-01",
      conceptId,
      kind,
      domain: "thermal",
      syllabi: engTag(),
      difficulty: "foundation",
      scenarioSpec: a1,
      requiredGivens: [
        { name: "p1Pa", value: 4.8e5, unit: "Pa", source: "either" },
        { name: "v1M3", value: 1.5e-3, unit: "m³", source: "stem" },
        { name: "v2M3", value: 4.5e-3, unit: "m³", source: "stem" },
        { name: "gamma", value: 1.4, source: "stem" },
      ],
      targetQuantityKey: "p2Kpa",
      unit: "kPa",
      stem: "A sealed sample of dry air ($\\gamma = 1.40$) at 480 kPa and $1.50 \\times 10^{-3}\\text{ m}^3$ expands rapidly and adiabatically to $4.50 \\times 10^{-3}\\text{ m}^3$. Calculate the final pressure of the gas.",
      distractors: [
        {
          value: (qa1.p2IsothermalPa as number) / 1e3,
          rationale: "Applies the isothermal relation $p_1 V_1 = p_2 V_2$ instead of $p_1 V_1^{\\gamma} = p_2 V_2^{\\gamma}$.",
        },
        {
          value: 480 * (4.5 / 1.5) ** 1.4,
          rationale: "Inverts the volume ratio, predicting pressure rises during expansion.",
        },
        {
          value: 480 * (1.5 / 4.5) ** (1 / 1.4),
          rationale: "Raises the volume ratio to $1/\\gamma$ instead of $\\gamma$.",
        },
      ],
      workedSolution: `For an adiabatic change, $p_2 = p_1\\left(\\frac{V_1}{V_2}\\right)^{\\gamma} = 480\\left(\\frac{1.50}{4.50}\\right)^{1.40} = ${fmt3(qa1.p2Kpa as number, "kPa")}$.`,
      markCriterion: `Final pressure equals ${fmt3(qa1.p2Kpa as number, "kPa")}.`,
      planSummary: "Compute final pressure after adiabatic expansion using p V^gamma = constant.",
    }),
  );

  const a2 = {
    kind,
    processType: "adiabatic",
    p1Pa: 1.2e5,
    v1M3: 4.0e-3,
    v2M3: 1.0e-3,
    gamma: 1.4,
    moles: 0.2,
  };
  const qa2 = solveKind(kind, a2);
  items.push(
    makeCalcMcq(ctx, {
      slug: "eng-fl-02",
      conceptId,
      kind,
      domain: "thermal",
      syllabi: engTag(),
      difficulty: "standard",
      scenarioSpec: a2,
      requiredGivens: [
        { name: "p1Pa", value: 1.2e5, unit: "Pa", source: "either" },
        { name: "v1M3", value: 4.0e-3, unit: "m³", source: "stem" },
        { name: "v2M3", value: 1.0e-3, unit: "m³", source: "stem" },
        { name: "gamma", value: 1.4, source: "stem" },
      ],
      targetQuantityKey: "deltaInternalEnergyJ",
      unit: "J",
      stem: "An ideal diatomic gas ($\\gamma = 1.40$) at 120 kPa and $4.00 \\times 10^{-3}\\text{ m}^3$ is compressed adiabatically to $1.00 \\times 10^{-3}\\text{ m}^3$. Applying the AQA First Law $Q = \\Delta U + W$ (where $W$ is work done by the gas), calculate the change in internal energy $\\Delta U$ of the gas.",
      distractors: [
        {
          value: -(qa2.deltaInternalEnergyJ as number),
          rationale: "Reverses the sign of $\\Delta U$, forgetting that work done BY the gas is negative on compression so $\\Delta U = -W > 0$.",
        },
        {
          value: 1.2e5 * 3.0e-3,
          rationale: "Computes isobaric $p_1 \\Delta V$ instead of adiabatic work.",
        },
        {
          value: (qa2.deltaInternalEnergyJ as number) * 0.4,
          rationale: "Multiplies by $(\\gamma - 1)$ instead of dividing by $(\\gamma - 1)$.",
        },
      ],
      workedSolution: `Final pressure $p_2 = 120(4)^{1.40} = ${fmt3(qa2.p2Kpa as number, "kPa")}$. Work done by gas $W = \\frac{p_1 V_1 - p_2 V_2}{\\gamma - 1} = ${fmt3(qa2.workDoneByGasJ as number, "J")}$ (negative on compression). Since $Q = 0$, $Q = \\Delta U + W \\Rightarrow \\Delta U = -W = ${fmt3(qa2.deltaInternalEnergyJ as number, "J")}$.`,
      markCriterion: `Change in internal energy equals ${fmt3(qa2.deltaInternalEnergyJ as number, "J")}.`,
      planSummary: "Apply AQA First Law Q = delta U + W to adiabatic compression with signed work.",
    }),
  );

  const a3 = {
    kind,
    processType: "isobaric",
    p1Pa: 2.5e5,
    v1M3: 2.0e-3,
    v2M3: 3.4e-3,
    gamma: 1.4,
    moles: 0.2,
  };
  const qa3 = solveKind(kind, a3);
  items.push(
    makeCalcMcq(ctx, {
      slug: "eng-fl-03",
      conceptId,
      kind,
      domain: "thermal",
      syllabi: engTag(),
      difficulty: "foundation",
      scenarioSpec: a3,
      requiredGivens: [
        { name: "p1Pa", value: 2.5e5, unit: "Pa", source: "either" },
        { name: "v1M3", value: 2.0e-3, unit: "m³", source: "stem" },
        { name: "v2M3", value: 3.4e-3, unit: "m³", source: "stem" },
        { name: "gamma", value: 1.4, source: "stem" },
      ],
      targetQuantityKey: "heatSuppliedJ",
      unit: "J",
      stem: "A cylinder of nitrogen ($\\gamma = 1.40$) expands isobarically at 250 kPa from $2.00 \\times 10^{-3}\\text{ m}^3$ to $3.40 \\times 10^{-3}\\text{ m}^3$, causing its internal energy to rise by 875 J. Using $Q = \\Delta U + W$, calculate the thermal energy $Q$ supplied to the gas.",
      distractors: [
        {
          value: (qa3.deltaInternalEnergyJ as number) - (qa3.workDoneByGasJ as number),
          rationale: "Subtracts $W$ from $\\Delta U$ instead of adding work done BY the gas in $Q = \\Delta U + W$.",
        },
        {
          value: qa3.workDoneByGasJ as number,
          rationale: "Reports only the mechanical work $p\\Delta V$ and omits $\\Delta U$.",
        },
        {
          value: 2.5e5 * 3.4e-3 + (qa3.deltaInternalEnergyJ as number),
          rationale: "Uses $p V_2$ rather than $p(V_2 - V_1)$ for isobaric work.",
        },
      ],
      workedSolution: `Work done by gas $W = p\\Delta V = 2.50 \\times 10^5 (3.40 - 2.00) \\times 10^{-3} = ${fmt3(qa3.workDoneByGasJ as number, "J")}$. By $Q = \\Delta U + W$, $Q = 875 + 350 = ${fmt3(qa3.heatSuppliedJ as number, "J")}$.`,
      markCriterion: `Thermal energy supplied equals ${fmt3(qa3.heatSuppliedJ as number, "J")}.`,
      planSummary: "Apply AQA First Law Q = delta U + W to an isobaric expansion.",
    }),
  );

  const a4 = {
    kind,
    processType: "adiabatic",
    p1Pa: 1.05e5,
    v1M3: 6.0e-3,
    v2M3: 1.2e-3,
    gamma: 1.4,
    moles: 0.25,
  };
  const qa4 = solveKind(kind, a4);
  items.push(
    makeCalcMcq(ctx, {
      slug: "eng-fl-04",
      conceptId,
      kind,
      domain: "thermal",
      syllabi: engTag(),
      difficulty: "higher",
      scenarioSpec: a4,
      requiredGivens: [
        { name: "p1Pa", value: 1.05e5, unit: "Pa", source: "either" },
        { name: "v1M3", value: 6.0e-3, unit: "m³", source: "stem" },
        { name: "v2M3", value: 1.2e-3, unit: "m³", source: "stem" },
        { name: "gamma", value: 1.4, source: "stem" },
        { name: "moles", value: 0.25, unit: "mol", source: "stem" },
      ],
      targetQuantityKey: "t2K",
      unit: "K",
      stem: "A sample of 0.250 mol of ideal gas ($\\gamma = 1.40$, $R = 8.31\\text{ J mol}^{-1}\\text{ K}^{-1}$) starts at 105 kPa and $6.00 \\times 10^{-3}\\text{ m}^3$ and is compressed adiabatically to $1.20 \\times 10^{-3}\\text{ m}^3$. Calculate the maximum temperature reached by the gas.",
      distractors: [
        {
          value: (qa4.t1K as number) * (6.0 / 1.2) ** 1.4,
          rationale: "Uses exponent $\\gamma$ instead of $\\gamma - 1$ in $T_2 = T_1 (V_1/V_2)^{\\gamma - 1}$.",
        },
        {
          value: qa4.t1K as number,
          rationale: "Assumes temperature stays constant as in an isothermal process.",
        },
        {
          value: (qa4.t1K as number) * (6.0 / 1.2),
          rationale: "Applies Charles's law linearly rather than adiabatic $T V^{\\gamma - 1} = \\text{const}$.",
        },
      ],
      workedSolution: `Initial temperature $T_1 = \\frac{p_1 V_1}{nR} = \\frac{1.05 \\times 10^5 \\times 6.00 \\times 10^{-3}}{0.250 \\times 8.31} = ${fmt3(qa4.t1K as number, "K")}$. Adiabatic final temperature $T_2 = T_1\\left(\\frac{V_1}{V_2}\\right)^{\\gamma - 1} = ${fmt3(qa4.t1K as number)}(5)^{0.40} = ${fmt3(qa4.t2K as number, "K")}$.`,
      markCriterion: `Final temperature equals ${fmt3(qa4.t2K as number, "K")}.`,
      planSummary: "Compute peak gas temperature after rapid adiabatic compression.",
    }),
  );

  const a5 = {
    kind,
    processType: "isothermal",
    p1Pa: 3.6e5,
    v1M3: 1.8e-3,
    v2M3: 5.4e-3,
    gamma: 1.4,
    moles: 0.24,
  };
  const qa5 = solveKind(kind, a5);
  items.push(
    makeCalcMcq(ctx, {
      slug: "eng-fl-05",
      conceptId,
      kind,
      domain: "thermal",
      syllabi: engTag(),
      difficulty: "standard",
      scenarioSpec: a5,
      requiredGivens: [
        { name: "p1Pa", value: 3.6e5, unit: "Pa", source: "either" },
        { name: "v1M3", value: 1.8e-3, unit: "m³", source: "stem" },
        { name: "v2M3", value: 5.4e-3, unit: "m³", source: "stem" },
      ],
      targetQuantityKey: "heatSuppliedJ",
      unit: "J",
      stem: "A fixed mass of ideal gas at 360 kPa and $1.80 \\times 10^{-3}\\text{ m}^3$ expands slowly and isothermally to $5.40 \\times 10^{-3}\\text{ m}^3$. Given $W = p_1 V_1 \\ln(V_2/V_1)$, calculate the thermal energy absorbed from the constant-temperature bath.",
      distractors: [
        {
          value: 3.6e5 * (5.4e-3 - 1.8e-3),
          rationale: "Uses constant-pressure $p_1 \\Delta V$ instead of isothermal work $p_1 V_1 \\ln(V_2/V_1)$.",
        },
        {
          value: 3.6e5 * 1.8e-3 * Math.log10(3),
          rationale: "Uses base-10 logarithm instead of natural logarithm $\\ln$.",
        },
        {
          value: 3.6e5 * 1.8e-3,
          rationale: "Omits the $\\ln(V_2/V_1)$ factor.",
        },
      ],
      workedSolution: `For an ideal gas at constant temperature, $\\Delta U = 0$, so $Q = W = p_1 V_1 \\ln(V_2/V_1) = (3.60 \\times 10^5)(1.80 \\times 10^{-3})\\ln 3 = ${fmt3(qa5.heatSuppliedJ as number, "J")}$.`,
      markCriterion: `Thermal energy absorbed equals ${fmt3(qa5.heatSuppliedJ as number, "J")}.`,
      planSummary: "Compute heat transferred during isothermal expansion with zero internal energy change.",
    }),
  );

  // 3 Pure Qualitative MCQs
  items.push(
    makeQualMcq(ctx, {
      slug: "eng-fl-06",
      conceptId,
      kind,
      domain: "thermal",
      syllabi: engTag(),
      difficulty: "foundation",
      scenarioSpec: a1,
      requiredGivens: [],
      targetQuantityKey: "adiabaticSlopeRule",
      stem: "Two expansion curves start from the same state A on a $p$–$V$ diagram: one is isothermal and the other is adiabatic. Which statement correctly distinguishes their gradients?",
      distractors: [
        {
          text: "Isothermal curve has a steeper gradient than an adiabatic curve because heat leaves the gas.",
          rationale: "Reverses the relative steepness of adiabatic versus isothermal curves.",
        },
        {
          text: "Both curves have identical gradients at state A because both obey the ideal gas equation.",
          rationale: "Ignores the factor of $\\gamma > 1$ in the adiabatic slope $-\\gamma p/V$.",
        },
        {
          text: "Adiabatic curve is flatter because pressure falls more slowly when internal energy decreases.",
          rationale: "Falling temperature drops pressure faster, making the adiabatic curve steeper.",
        },
      ],
      workedSolution: `The isothermal gradient is $-p/V$ whereas the adiabatic gradient is $-\\gamma p/V$ with $\\gamma > 1$: the adiabatic curve has a steeper gradient than an isothermal curve because temperature falls during adiabatic expansion.`,
      planSummary: "Compare p-V gradients of adiabatic versus isothermal curves from a shared state.",
    }),
  );

  items.push(
    makeQualMcq(ctx, {
      slug: "eng-fl-07",
      conceptId,
      kind,
      domain: "thermal",
      syllabi: engTag(),
      difficulty: "foundation",
      questionStyle: "definition",
      scenarioSpec: a3,
      requiredGivens: [],
      targetQuantityKey: "firstLawConventionRule",
      stem: "In the AQA Engineering Physics sign convention $Q = \\Delta U + W$, what is the exact physical statement of the First Law of Thermodynamics?",
      distractors: [
        {
          text: "Heat supplied to the gas equals the decrease in internal energy minus work done on the gas.",
          rationale: "Reverses signs of $\\Delta U$ and $W$.",
        },
        {
          text: "Work done on the gas equals heat leaving the gas plus increase in internal energy.",
          rationale: "Confuses work done ON versus BY the gas.",
        },
        {
          text: "Internal energy is conserved whenever mechanical work is performed by an expanding gas.",
          rationale: "Internal energy changes unless $Q = W$.",
        },
      ],
      workedSolution: `In AQA Engineering Physics ($Q = \\Delta U + W$), heat supplied to the gas equals increase in internal energy plus work done by the gas (so $W < 0$ on compression).`,
      planSummary: "Verify AQA First Law sign convention Q = delta U + W.",
    }),
  );

  items.push(
    makeQualMcq(ctx, {
      slug: "eng-fl-08",
      conceptId,
      kind,
      domain: "thermal",
      syllabi: engTag(),
      difficulty: "standard",
      scenarioSpec: a2,
      requiredGivens: [],
      targetQuantityKey: "processSpeedRule",
      stem: "Why can the compression stroke inside a high-speed internal combustion cylinder be approximated as adiabatic even though the cylinder walls are metal and not perfectly insulated?",
      distractors: [
        {
          text: "Metal cylinder walls conduct heat rapidly enough to hold gas temperature constant.",
          rationale: "Describes an isothermal limit, the opposite of adiabatic.",
        },
        {
          text: "Piston motion cancels thermal conduction by reversing the temperature gradient.",
          rationale: "Compressing gas raises temperature above the wall temperature.",
        },
        {
          text: "Ideal gases cannot transfer thermal energy while their pressure is rising.",
          rationale: "Heat transfer depends on temperature difference and time, not pressure direction.",
        },
      ],
      workedSolution: `Because the stroke completes in milliseconds, rapid change allows negligible thermal energy transfer between gas and surroundings ($Q \\approx 0$).`,
      planSummary: "Explain why rapid compression approximates an adiabatic process.",
    }),
  );

  // 4 Multi-part structured
  const flStructs = [
    {
      slug: "eng-fl-09",
      difficulty: "standard" as const,
      spec: {
        kind,
        processType: "adiabatic",
        p1Pa: 4.2e5,
        v1M3: 1.4e-3,
        v2M3: 4.2e-3,
        gamma: 1.4,
        moles: 0.2,
      },
      gas: "dry air ($\\gamma = 1.40$)",
    },
    {
      slug: "eng-fl-10",
      difficulty: "higher" as const,
      spec: {
        kind,
        processType: "adiabatic",
        p1Pa: 1.1e5,
        v1M3: 5.0e-3,
        v2M3: 1.0e-3,
        gamma: 1.67,
        moles: 0.22,
      },
      gas: "monatomic argon ($\\gamma = 1.67$)",
    },
    {
      slug: "eng-fl-11",
      difficulty: "standard" as const,
      spec: {
        kind,
        processType: "isobaric",
        p1Pa: 3.0e5,
        v1M3: 1.5e-3,
        v2M3: 3.5e-3,
        gamma: 1.4,
        moles: 0.15,
      },
      gas: "nitrogen gas ($\\gamma = 1.40$)",
    },
    {
      slug: "eng-fl-12",
      difficulty: "higher" as const,
      spec: {
        kind,
        processType: "adiabatic",
        p1Pa: 5.5e5,
        v1M3: 1.6e-3,
        v2M3: 4.0e-3,
        gamma: 1.4,
        moles: 0.3,
      },
      gas: "diatomic oxygen ($\\gamma = 1.40$)",
    },
  ];

  for (const cfg of flStructs) {
    const sp = cfg.spec;
    const q = solveKind(kind, sp);
    const isIsobaric = sp.processType === "isobaric";
    const p2Str = fmt3(q.p2Kpa as number, "kPa");
    const t1Str = fmt3(q.t1K as number, "K");
    const t2Str = fmt3(q.t2K as number, "K");
    const wStr = fmt3(q.workDoneByGasJ as number, "J");
    const duStr = fmt3(q.deltaInternalEnergyJ as number, "J");
    const qSupStr = fmt3(q.heatSuppliedJ as number, "J");

    items.push(
      makeStructured(ctx, {
        slug: cfg.slug,
        conceptId,
        kind,
        domain: "thermal",
        syllabi: engTag(),
        difficulty: cfg.difficulty,
        scenarioSpec: sp,
        hiddenQuantities: isIsobaric
          ? ["t1K", "t2K", "workDoneByGasJ", "heatSuppliedJ"]
          : ["p2Kpa", "t2K", "workDoneByGasJ", "deltaInternalEnergyJ"],
        requiredGivens: [
          { name: "p1Pa", value: sp.p1Pa, unit: "Pa", source: "either" },
          { name: "v1M3", value: sp.v1M3, unit: "m³", source: "stem" },
          { name: "v2M3", value: sp.v2M3, unit: "m³", source: "stem" },
          { name: "gamma", value: sp.gamma, source: "stem" },
          { name: "moles", value: sp.moles, unit: "mol", source: "stem" },
        ],
        stem: `A cylinder holds ${fmt3(sp.moles, "mol")} of ${cfg.gas} initially at pressure ${fmt3(sp.p1Pa / 1e3, "kPa")} and volume ${fmt3(sp.v1M3, "m³")}. The gas undergoes a ${sp.processType} change to a final volume of ${fmt3(sp.v2M3, "m³")}. Take $R = 8.31\\text{ J mol}^{-1}\\text{ K}^{-1}$ and apply $Q = \\Delta U + W$.`,
        parts: isIsobaric
          ? [
              {
                partId: "a",
                prompt: "Calculate the initial thermodynamic temperature $T_1$ of the gas in kelvin.",
                marks: 2,
                targetQuantityKey: "t1K",
                expectedAnswer: t1Str,
                workingSteps: [
                  `Apply ideal gas law $T_1 = \\frac{p_1 V_1}{nR}$.`,
                  `$T_1 = ${t1Str}$.`,
                ],
              },
              {
                partId: "b",
                prompt: "Determine the final thermodynamic temperature $T_2$ of the gas in kelvin.",
                marks: 2,
                dependsOnPartIds: ["a"],
                targetQuantityKey: "t2K",
                expectedAnswer: t2Str,
                workingSteps: [
                  `At constant pressure $T_2 = T_1 (V_2/V_1) = ${t2Str}$.`,
                ],
              },
              {
                partId: "c",
                prompt: "Calculate the work done BY the gas during this isobaric expansion.",
                marks: 2,
                targetQuantityKey: "workDoneByGasJ",
                expectedAnswer: wStr,
                workingSteps: [
                  `Use $W = p(V_2 - V_1) = ${wStr}$.`,
                ],
              },
              {
                partId: "d",
                prompt: "Given that $\\Delta U = \\frac{W}{\\gamma - 1}$ for an isobaric ideal-gas change, calculate the total thermal energy $Q$ supplied to the gas.",
                marks: 2,
                dependsOnPartIds: ["c"],
                targetQuantityKey: "heatSuppliedJ",
                expectedAnswer: qSupStr,
                workingSteps: [
                  `$\\Delta U = \\frac{W}{\\gamma - 1} = ${duStr}$.`,
                  `By AQA First Law $Q = \\Delta U + W = ${qSupStr}$.`,
                ],
              },
            ]
          : [
              {
                partId: "a",
                prompt: "Calculate the final pressure of the gas in kPa.",
                marks: 2,
                targetQuantityKey: "p2Kpa",
                expectedAnswer: p2Str,
                workingSteps: [
                  `Use $p_2 = p_1 (V_1/V_2)^{\\gamma}$.`,
                  `$p_2 = ${p2Str}$.`,
                ],
              },
              {
                partId: "b",
                prompt: "Determine the final thermodynamic temperature of the gas in kelvin.",
                marks: 2,
                dependsOnPartIds: ["a"],
                targetQuantityKey: "t2K",
                expectedAnswer: t2Str,
                workingSteps: [
                  `Apply ideal gas law $T_2 = \\frac{p_2 V_2}{nR}$.`,
                  `$T_2 = ${t2Str}$.`,
                ],
              },
              {
                partId: "c",
                prompt: "Calculate the work done BY the gas during the change, stating its sign clearly.",
                marks: 2,
                dependsOnPartIds: ["a"],
                targetQuantityKey: "workDoneByGasJ",
                expectedAnswer: wStr,
                workingSteps: [
                  `Use $W = \\frac{p_1 V_1 - p_2 V_2}{\\gamma - 1}$.`,
                  `$W = ${wStr}$.`,
                ],
              },
              {
                partId: "d",
                prompt: "Hence calculate the change in internal energy $\\Delta U$ of the gas.",
                marks: 2,
                dependsOnPartIds: ["c"],
                targetQuantityKey: "deltaInternalEnergyJ",
                expectedAnswer: duStr,
                workingSteps: [
                  `For an adiabatic change $Q = 0$, so $\\Delta U = -W = ${duStr}$.`,
                ],
              },
            ],
        workedSolution: isIsobaric
          ? `(a) $T_1 = ${t1Str}$. (b) $T_2 = ${t2Str}$. (c) Work done by gas $W = p\\Delta V = ${wStr}$. (d) With $\\Delta U = ${duStr}$, $Q = \\Delta U + W = ${qSupStr}$.`
          : `(a) $p_2 = ${p2Str}$. (b) $T_2 = \\frac{p_2 V_2}{nR} = ${t2Str}$. (c) Work done by gas $W = ${wStr}$. (d) Change in internal energy $\\Delta U = ${duStr}$.`,
        markScheme: isIsobaric
          ? [
              { code: "M1", criterion: "Applies $p_1 V_1 = n R T_1$ with $R = 8.31\\text{ J mol}^{-1}\\text{ K}^{-1}$.", marks: 1, partId: "a" },
              { code: "A1", criterion: `Obtains $T_1 = ${t1Str}$.`, marks: 1, partId: "a" },
              { code: "M1", criterion: "Applies constant-pressure $T_2 = T_1(V_2/V_1)$.", marks: 1, partId: "b" },
              { code: "A1", criterion: `Obtains $T_2 = ${t2Str}$.`, marks: 1, partId: "b" },
              { code: "M1", criterion: "Applies $W = p(V_2 - V_1)$.", marks: 1, partId: "c" },
              { code: "A1", criterion: `Obtains $W = ${wStr}$.`, marks: 1, partId: "c" },
              { code: "M1", criterion: "Computes $\\Delta U = W/(\\gamma - 1)$ and adds $Q = \\Delta U + W$.", marks: 1, partId: "d" },
              { code: "A1", criterion: `Obtains $Q = ${qSupStr}$.`, marks: 1, partId: "d" },
            ]
          : [
              { code: "M1", criterion: "Applies the governing pressure-volume relation $p_1 V_1^{\\gamma} = p_2 V_2^{\\gamma}$.", marks: 1, partId: "a" },
              { code: "A1", criterion: `Obtains $p_2 = ${p2Str}$.`, marks: 1, partId: "a" },
              { code: "M1", criterion: "Applies $pV = nRT$ with $R = 8.31\\text{ J mol}^{-1}\\text{ K}^{-1}$.", marks: 1, partId: "b" },
              { code: "A1", criterion: `Obtains $T_2 = ${t2Str}$.`, marks: 1, partId: "b" },
              { code: "M1", criterion: "Evaluates mechanical work done by the gas with correct sign.", marks: 1, partId: "c" },
              { code: "A1", criterion: `Obtains $W = ${wStr}$.`, marks: 1, partId: "c" },
              { code: "M1", criterion: "Applies $Q = \\Delta U + W$ with $Q = 0$ for an adiabatic process.", marks: 1, partId: "d" },
              { code: "A1", criterion: `Obtains $\\Delta U = ${duStr}$.`, marks: 1, partId: "d" },
            ],
        planSummary: "Multi-part ideal gas state transition, work by gas, and AQA First Law internal energy.",
      }),
    );
  }

  return items;
}

/* ========================================================================== */
/*  5. Plugin 5: al-opt-eng-otto-diesel-engines (12 items, incl. 2 × 6m LoRs) */
/* ========================================================================== */

function buildOttoDieselItems(ctx: BuildContext): CandidateQuestionInput[] {
  const kind = "al-opt-eng-otto-diesel-engines";
  const conceptId = "thermodynamics-entropy-engines";
  const items: CandidateQuestionInput[] = [];

  const e1 = {
    kind,
    mode: "otto",
    loopAreaJ: 440,
    engineSpeedRevS: 50,
    cylinders: 4,
    outputTorqueNm: 112,
    calorificValueJPerKg: 4.4e7,
    fuelFlowRateKgS: 3.1e-3,
    compressionRatio: 10.2,
  };
  const qe1 = solveKind(kind, e1);
  items.push(
    makeCalcMcq(ctx, {
      slug: "eng-od-01",
      conceptId,
      kind,
      domain: "thermal",
      syllabi: engTag(),
      difficulty: "foundation",
      scenarioSpec: e1,
      requiredGivens: [
        { name: "loopAreaJ", value: 440, unit: "J", source: "stem" },
        { name: "engineSpeedRevS", value: 50, unit: "rev s⁻¹", source: "stem" },
        { name: "cylinders", value: 4, source: "stem" },
      ],
      targetQuantityKey: "indicatedPowerKw",
      unit: "kW",
      stem: "A four-stroke petrol engine with 4 cylinders operates at 50.0 rev s⁻¹. The enclosed area of its $p$–$V$ indicator loop for one cylinder is 440 J. Calculate the indicated power of the engine.",
      distractors: [
        {
          value: (qe1.indicatedPowerKw as number) * 2,
          rationale: "Forgets that a four-stroke cylinder fires only once every two crankshaft revolutions.",
        },
        {
          value: (qe1.indicatedPowerKw as number) / 4,
          rationale: "Computes indicated power for a single cylinder instead of all four cylinders.",
        },
        {
          value: (qe1.indicatedPowerKw as number) * 0.5,
          rationale: "Divides firing frequency by four instead of two.",
        },
      ],
      workedSolution: `A four-stroke cylinder executes $f_{\\mathrm{cycle}} = \\frac{50.0}{2} = 25.0\\text{ cycles s}^{-1}$. Thus $P_{\\mathrm{ind}} = \\text{area} \\times f_{\\mathrm{cycle}} \\times N_{\\mathrm{cyl}} = 440 \\times 25.0 \\times 4 = 44\\,000\\text{ W} = ${fmt3(qe1.indicatedPowerKw as number, "kW")}$.`,
      markCriterion: `Indicated power equals ${fmt3(qe1.indicatedPowerKw as number, "kW")}.`,
      planSummary: "Compute four-stroke indicated power using firing frequency equal to half crankshaft speed.",
    }),
  );

  const e2 = {
    kind,
    mode: "diesel",
    loopAreaJ: 720,
    engineSpeedRevS: 40,
    cylinders: 6,
    outputTorqueNm: 280,
    calorificValueJPerKg: 4.3e7,
    fuelFlowRateKgS: 4.8e-3,
    compressionRatio: 18.5,
  };
  const qe2 = solveKind(kind, e2);
  items.push(
    makeCalcMcq(ctx, {
      slug: "eng-od-02",
      conceptId,
      kind,
      domain: "thermal",
      syllabi: engTag(),
      difficulty: "standard",
      scenarioSpec: e2,
      requiredGivens: [
        { name: "loopAreaJ", value: 720, unit: "J", source: "stem" },
        { name: "engineSpeedRevS", value: 40, unit: "rev s⁻¹", source: "stem" },
        { name: "cylinders", value: 6, source: "stem" },
        { name: "outputTorqueNm", value: 280, unit: "N m", source: "stem" },
      ],
      targetQuantityKey: "frictionPowerKw",
      unit: "kW",
      stem: "A four-stroke marine diesel engine with 6 cylinders runs at 40.0 rev s⁻¹ with an indicator loop area of 720 J per cylinder and delivers an output shaft torque of 280 N m. Calculate the friction power lost within the engine.",
      distractors: [
        {
          value: qe2.brakePowerKw as number,
          rationale: "Reports brake power $T\\omega$ rather than subtracting it from indicated power.",
        },
        {
          value: (qe2.indicatedPowerKw as number) * 2 - (qe2.brakePowerKw as number),
          rationale: "Omits the factor of one-half for four-stroke firing frequency when finding indicated power.",
        },
        {
          value: (qe2.indicatedPowerKw as number) - (280 * 40) / 1e3,
          rationale: "Uses $P_{\\mathrm{brake}} = T f$ instead of $T(2\\pi f)$.",
        },
      ],
      workedSolution: `$P_{\\mathrm{ind}} = 720 \\times (40.0/2) \\times 6 = 86.4\\text{ kW}$. $P_{\\mathrm{brake}} = T\\omega = 280 \\times 2\\pi(40.0) = 70.4\\text{ kW}$. Friction power $P_{\\mathrm{fric}} = P_{\\mathrm{ind}} - P_{\\mathrm{brake}} = ${fmt3(qe2.frictionPowerKw as number, "kW")}$.`,
      markCriterion: `Friction power equals ${fmt3(qe2.frictionPowerKw as number, "kW")}.`,
      planSummary: "Find engine friction power from indicated minus brake power.",
    }),
  );

  const e3 = {
    kind,
    mode: "otto",
    loopAreaJ: 510,
    engineSpeedRevS: 60,
    cylinders: 4,
    outputTorqueNm: 130,
    calorificValueJPerKg: 4.5e7,
    fuelFlowRateKgS: 3.6e-3,
    compressionRatio: 10.5,
  };
  const qe3 = solveKind(kind, e3);
  items.push(
    makeCalcMcq(ctx, {
      slug: "eng-od-03",
      conceptId,
      kind,
      domain: "thermal",
      syllabi: engTag(),
      difficulty: "standard",
      scenarioSpec: e3,
      requiredGivens: [
        { name: "loopAreaJ", value: 510, unit: "J", source: "stem" },
        { name: "engineSpeedRevS", value: 60, unit: "rev s⁻¹", source: "stem" },
        { name: "cylinders", value: 4, source: "stem" },
        { name: "calorificValueJPerKg", value: 4.5e7, unit: "J kg⁻¹", source: "stem" },
        { name: "fuelFlowRateKgS", value: 3.6e-3, unit: "kg s⁻¹", source: "stem" },
      ],
      targetQuantityKey: "thermalEfficiencyPct",
      unit: "%",
      stem: "A four-stroke engine with 4 cylinders running at 60.0 rev s⁻¹ has indicator loop area 510 J per cylinder and burns fuel of calorific value $4.50 \\times 10^7\\text{ J kg}^{-1}$ at a mass flow rate of $3.60 \\times 10^{-3}\\text{ kg s}^{-1}$. Calculate the thermal efficiency of the engine.",
      distractors: [
        {
          value: qe3.overallEfficiencyPct as number,
          rationale: "Confuses thermal efficiency ($P_{\\mathrm{ind}}/P_{\\mathrm{in}}$) with overall efficiency ($P_{\\mathrm{brake}}/P_{\\mathrm{in}}$).",
        },
        {
          value: (qe3.thermalEfficiencyPct as number) * 2,
          rationale: "Omits the four-stroke divide-by-two factor in indicated power.",
        },
        {
          value: qe3.mechanicalEfficiencyPct as number,
          rationale: "Computes mechanical efficiency $P_{\\mathrm{brake}}/P_{\\mathrm{ind}}$ instead of thermal efficiency.",
        },
      ],
      workedSolution: `Explicit definition: $\\eta_{\\mathrm{th}} = \\frac{P_{\\mathrm{ind}}}{P_{\\mathrm{in}}}$. Here $P_{\\mathrm{ind}} = 510 \\times 30.0 \\times 4 = 61.2\\text{ kW}$ and $P_{\\mathrm{in}} = (4.50 \\times 10^7)(3.60 \\times 10^{-3}) = 162\\text{ kW}$, giving $\\eta_{\\mathrm{th}} = \\frac{61.2}{162} = ${fmt3(qe3.thermalEfficiencyPct as number, "%")}$.`,
      markCriterion: `Thermal efficiency equals ${fmt3(qe3.thermalEfficiencyPct as number, "%")}.`,
      planSummary: "Compute four-stroke engine thermal efficiency with explicit ratio derivation.",
    }),
  );

  const e4 = {
    kind,
    mode: "diesel",
    loopAreaJ: 640,
    engineSpeedRevS: 45,
    cylinders: 4,
    outputTorqueNm: 165,
    calorificValueJPerKg: 4.3e7,
    fuelFlowRateKgS: 3.4e-3,
    compressionRatio: 19.0,
  };
  const qe4 = solveKind(kind, e4);
  items.push(
    makeCalcMcq(ctx, {
      slug: "eng-od-04",
      conceptId,
      kind,
      domain: "thermal",
      syllabi: engTag(),
      difficulty: "higher",
      scenarioSpec: e4,
      requiredGivens: [
        { name: "engineSpeedRevS", value: 45, unit: "rev s⁻¹", source: "stem" },
        { name: "outputTorqueNm", value: 165, unit: "N m", source: "stem" },
        { name: "calorificValueJPerKg", value: 4.3e7, unit: "J kg⁻¹", source: "stem" },
        { name: "fuelFlowRateKgS", value: 3.4e-3, unit: "kg s⁻¹", source: "stem" },
      ],
      targetQuantityKey: "overallEfficiencyPct",
      unit: "%",
      stem: "A four-stroke diesel engine delivers an output torque of 165 N m at 45.0 rev s⁻¹ while consuming fuel of calorific value $4.30 \\times 10^7\\text{ J kg}^{-1}$ at $3.40 \\times 10^{-3}\\text{ kg s}^{-1}$. Calculate the overall efficiency of the engine.",
      distractors: [
        {
          value: qe4.thermalEfficiencyPct as number,
          rationale: "Uses indicated power instead of output brake power in the numerator.",
        },
        {
          value: qe4.mechanicalEfficiencyPct as number,
          rationale: "Reports mechanical efficiency $P_{\\mathrm{brake}}/P_{\\mathrm{ind}}$ instead of overall efficiency.",
        },
        {
          value: ((165 * 45) / (4.3e7 * 3.4e-3)) * 100,
          rationale: "Omits the $2\\pi$ factor in $P_{\\mathrm{brake}} = T(2\\pi f)$.",
        },
      ],
      workedSolution: `Overall efficiency $\\eta_{\\mathrm{ov}} = \\eta_{\\mathrm{th}} \\times \\eta_{\\mathrm{mech}} = \\frac{P_{\\mathrm{ind}}}{P_{\\mathrm{in}}} \\times \\frac{P_{\\mathrm{brake}}}{P_{\\mathrm{ind}}} = \\frac{P_{\\mathrm{brake}}}{P_{\\mathrm{in}}}$. Here $P_{\\mathrm{brake}} = 165 \\times 2\\pi(45.0) = 46.65\\text{ kW}$ and $P_{\\mathrm{in}} = 146.2\\text{ kW}$, so $\\eta_{\\mathrm{ov}} = ${fmt3(qe4.overallEfficiencyPct as number, "%")}$.`,
      markCriterion: `Overall efficiency equals ${fmt3(qe4.overallEfficiencyPct as number, "%")}.`,
      planSummary: "Derive and compute overall engine efficiency as brake power over fuel input power.",
    }),
  );

  // 3 Pure Qualitative MCQs
  items.push(
    makeQualMcq(ctx, {
      slug: "eng-od-05",
      conceptId,
      kind,
      domain: "thermal",
      syllabi: engTag(),
      difficulty: "foundation",
      scenarioSpec: e2,
      requiredGivens: [],
      targetQuantityKey: "ottoVsDieselRule",
      stem: "How does combustion initiation in an ideal four-stroke diesel cycle fundamentally differ from that in an ideal four-stroke Otto petrol cycle?",
      distractors: [
        {
          text: "Diesel engine compresses a petrol-air mixture to a lower compression ratio and ignites it with a spark plug at constant volume.",
          rationale: "Describes a spark-ignition Otto cycle, not compression-ignition Diesel.",
        },
        {
          text: "Diesel engine keeps volume constant during fuel burn and completes a power stroke every single crankshaft revolution.",
          rationale: "Ideal Diesel heat addition is at constant pressure, and four-stroke cycles take two revolutions.",
        },
        {
          text: "Diesel engine cools the compressed air isothermally before injecting fuel at minimum pressure.",
          rationale: "Diesel compression is rapid and adiabatic to achieve auto-ignition temperature.",
        },
      ],
      workedSolution: `Because air alone is compressed without risk of premature detonation, a diesel engine compresses air alone to a higher compression ratio so injected fuel self-ignites at constant pressure.`,
      planSummary: "Contrast ideal Diesel constant-pressure self-ignition with Otto constant-volume spark ignition.",
    }),
  );

  items.push(
    makeQualMcq(ctx, {
      slug: "eng-od-06",
      conceptId,
      kind,
      domain: "thermal",
      syllabi: engTag(),
      difficulty: "foundation",
      scenarioSpec: { ...e1, mode: "real-vs-ideal" },
      requiredGivens: [],
      targetQuantityKey: "realVsIdealLoopRule",
      stem: "Why is the indicated power measured from a real four-stroke petrol engine always substantially lower than the theoretical ideal Otto cycle prediction?",
      distractors: [
        {
          text: "Real indicator loop has sharper pressure spikes and larger enclosed area due to delayed exhaust opening.",
          rationale: "Valve timing and finite burn duration round corners and reduce enclosed area.",
        },
        {
          text: "Real indicator loop eliminates the induction and exhaust strokes, halving the engine speed.",
          rationale: "Real engines still include induction and exhaust, forming a negative pumping loop.",
        },
        {
          text: "Heat transfer to the cylinder cooling jacket makes the expansion stroke steeper and increases net work.",
          rationale: "Heat loss lowers peak pressure and reduces enclosed work area.",
        },
      ],
      workedSolution: `Finite combustion time, early/late valve opening, heat loss to the coolant, and gas pumping work mean the real indicator loop has rounded corners and a lower pumping loop reducing net enclosed work area.`,
      planSummary: "Compare real versus ideal Otto engine p-V indicator diagrams.",
    }),
  );

  items.push(
    makeQualMcq(ctx, {
      slug: "eng-od-07",
      conceptId,
      kind,
      domain: "thermal",
      syllabi: engTag(),
      difficulty: "foundation",
      scenarioSpec: e1,
      requiredGivens: [],
      targetQuantityKey: "fourStrokeCycleRule",
      stem: "Why must the crankshaft rotational frequency in revolutions per second be halved when calculating the indicated power of a four-stroke engine from its indicator loop area?",
      distractors: [
        {
          text: "Only half of the cylinders in a multi-cylinder block contain spark plugs.",
          rationale: "Every cylinder fires, just once per two crankshaft revolutions.",
        },
        {
          text: "Piston travel during the power stroke is only half the cylinder bore diameter.",
          rationale: "Stroke length is already accounted for inside the $p$–$V$ loop area.",
        },
        {
          text: "Half the enclosed indicator loop area represents negative friction work.",
          rationale: "Friction losses occur mechanically after indicated power is transferred to the piston.",
        },
      ],
      workedSolution: `Induction, compression, power, and exhaust take four piston strokes (two full turns of the crankshaft), so a four-stroke cylinder completes one power stroke every two crankshaft revolutions.`,
      planSummary: "Explain the factor of two between crankshaft revolutions and four-stroke firing rate.",
    }),
  );

  // 3 Multi-part structured
  const odStructs = [
    {
      slug: "eng-od-08",
      difficulty: "standard" as const,
      spec: {
        kind,
        mode: "otto",
        loopAreaJ: 460,
        engineSpeedRevS: 55,
        cylinders: 4,
        outputTorqueNm: 118,
        calorificValueJPerKg: 4.4e7,
        fuelFlowRateKgS: 3.3e-3,
        compressionRatio: 10.0,
      },
      label: "a four-cylinder four-stroke petrol test engine",
    },
    {
      slug: "eng-od-09",
      difficulty: "higher" as const,
      spec: {
        kind,
        mode: "diesel",
        loopAreaJ: 740,
        engineSpeedRevS: 38,
        cylinders: 6,
        outputTorqueNm: 270,
        calorificValueJPerKg: 4.3e7,
        fuelFlowRateKgS: 4.6e-3,
        compressionRatio: 18.0,
      },
      label: "a six-cylinder four-stroke diesel auxiliary generator",
    },
    {
      slug: "eng-od-10",
      difficulty: "higher" as const,
      spec: {
        kind,
        mode: "real-vs-ideal",
        loopAreaJ: 520,
        engineSpeedRevS: 64,
        cylinders: 4,
        outputTorqueNm: 135,
        calorificValueJPerKg: 4.5e7,
        fuelFlowRateKgS: 3.9e-3,
        compressionRatio: 10.8,
      },
      label: "a dynamometer-mounted four-cylinder hatchback engine",
    },
  ];

  for (const cfg of odStructs) {
    const sp = cfg.spec;
    const q = solveKind(kind, sp);
    const pIndStr = fmt3(q.indicatedPowerKw as number, "kW");
    const pBrkStr = fmt3(q.brakePowerKw as number, "kW");
    const etaThStr = fmt3(q.thermalEfficiencyPct as number, "%");
    const etaMechStr = fmt3(q.mechanicalEfficiencyPct as number, "%");
    items.push(
      makeStructured(ctx, {
        slug: cfg.slug,
        conceptId,
        kind,
        domain: "thermal",
        syllabi: engTag(),
        difficulty: cfg.difficulty,
        scenarioSpec: sp,
        hiddenQuantities: [
          "indicatedPowerKw",
          "brakePowerKw",
          "thermalEfficiencyPct",
          "mechanicalEfficiencyPct",
        ],
        requiredGivens: [
          { name: "loopAreaJ", value: sp.loopAreaJ, unit: "J", source: "stem" },
          { name: "engineSpeedRevS", value: sp.engineSpeedRevS, unit: "rev s⁻¹", source: "stem" },
          { name: "cylinders", value: sp.cylinders, source: "stem" },
          { name: "outputTorqueNm", value: sp.outputTorqueNm, unit: "N m", source: "stem" },
          { name: "calorificValueJPerKg", value: sp.calorificValueJPerKg, unit: "J kg⁻¹", source: "stem" },
          { name: "fuelFlowRateKgS", value: sp.fuelFlowRateKgS, unit: "kg s⁻¹", source: "stem" },
        ],
        stem: `During a testbed trial of ${cfg.label} (${sp.cylinders} cylinders) running at ${fmt3(sp.engineSpeedRevS, "rev s⁻¹")}, each cylinder indicator loop encloses ${fmt3(sp.loopAreaJ, "J")}. The dynamometer records a brake torque of ${fmt3(sp.outputTorqueNm, "N m")} while fuel of calorific value ${fmt3(sp.calorificValueJPerKg, "J kg⁻¹")} enters at ${fmt3(sp.fuelFlowRateKgS, "kg s⁻¹")}.`,
        parts: [
          {
            partId: "a",
            prompt: "Calculate the indicated power of the engine in kW.",
            marks: 2,
            targetQuantityKey: "indicatedPowerKw",
            expectedAnswer: pIndStr,
            workingSteps: [
              `Four-stroke firing rate per cylinder $= f/2 = ${fmt3(sp.engineSpeedRevS / 2)}\\text{ s}^{-1}$.`,
              `$P_{\\mathrm{ind}} = ${sp.loopAreaJ} \\times ${fmt3(sp.engineSpeedRevS / 2)} \\times ${sp.cylinders} = ${pIndStr}$.`,
            ],
          },
          {
            partId: "b",
            prompt: "Calculate the brake power delivered at the output shaft in kW.",
            marks: 2,
            targetQuantityKey: "brakePowerKw",
            expectedAnswer: pBrkStr,
            workingSteps: [
              `Use $P_{\\mathrm{brake}} = T\\omega = T(2\\pi f)$.`,
              `$P_{\\mathrm{brake}} = ${sp.outputTorqueNm} \\times 2\\pi(${sp.engineSpeedRevS}) = ${pBrkStr}$.`,
            ],
          },
          {
            partId: "c",
            prompt: "Calculate the thermal efficiency of the engine (stating the defining ratio explicitly).",
            marks: 2,
            dependsOnPartIds: ["a"],
            targetQuantityKey: "thermalEfficiencyPct",
            expectedAnswer: etaThStr,
            workingSteps: [
              `Input power $P_{\\mathrm{in}} = \\text{CV} \\times \\dot{m} = ${fmt3(q.inputPowerKw as number, "kW")}$.`,
              `$\\eta_{\\mathrm{th}} = \\frac{P_{\\mathrm{ind}}}{P_{\\mathrm{in}}} = ${etaThStr}$.`,
            ],
          },
          {
            partId: "d",
            prompt: "Calculate the mechanical efficiency of the engine.",
            marks: 2,
            dependsOnPartIds: ["a", "b"],
            targetQuantityKey: "mechanicalEfficiencyPct",
            expectedAnswer: etaMechStr,
            workingSteps: [
              `Use $\\eta_{\\mathrm{mech}} = \\frac{P_{\\mathrm{brake}}}{P_{\\mathrm{ind}}}$.`,
              `$\\eta_{\\mathrm{mech}} = \\frac{${fmt3(q.brakePowerKw as number)}}{${fmt3(q.indicatedPowerKw as number)}} = ${etaMechStr}$.`,
            ],
          },
        ],
        workedSolution: `(a) $P_{\\mathrm{ind}} = ${pIndStr}$. (b) $P_{\\mathrm{brake}} = ${pBrkStr}$. (c) $\\eta_{\\mathrm{th}} = \\frac{P_{\\mathrm{ind}}}{P_{\\mathrm{in}}} = ${etaThStr}$. (d) $\\eta_{\\mathrm{mech}} = \\frac{P_{\\mathrm{brake}}}{P_{\\mathrm{ind}}} = ${etaMechStr}$ (overall $\\eta_{\\mathrm{ov}} = \\eta_{\\mathrm{th}} \\eta_{\\mathrm{mech}} = ${fmt3(q.overallEfficiencyPct as number, "%")}$).`,
        markScheme: [
          { code: "M1", criterion: "Applies four-stroke firing frequency $f/2$ times loop area times cylinder count.", marks: 1, partId: "a" },
          { code: "A1", criterion: `Obtains $P_{\\mathrm{ind}} = ${pIndStr}$.`, marks: 1, partId: "a" },
          { code: "M1", criterion: "Applies $P_{\\mathrm{brake}} = T(2\\pi f)$.", marks: 1, partId: "b" },
          { code: "A1", criterion: `Obtains $P_{\\mathrm{brake}} = ${pBrkStr}$.`, marks: 1, partId: "b" },
          { code: "M1", criterion: "Computes $P_{\\mathrm{in}} = \\text{CV} \\times \\dot{m}$ and writes $\\eta_{\\mathrm{th}} = P_{\\mathrm{ind}}/P_{\\mathrm{in}}$.", marks: 1, partId: "c" },
          { code: "A1", criterion: `Obtains $\\eta_{\\mathrm{th}} = ${etaThStr}$.`, marks: 1, partId: "c" },
          { code: "M1", criterion: "Uses $\\eta_{\\mathrm{mech}} = P_{\\mathrm{brake}}/P_{\\mathrm{ind}}$.", marks: 1, partId: "d" },
          { code: "A1", criterion: `Obtains $\\eta_{\\mathrm{mech}} = ${etaMechStr}$.`, marks: 1, partId: "d" },
        ],
        planSummary: "Full four-stroke engine testbed analysis for indicated, brake, thermal, and mechanical efficiency.",
      }),
    );
  }

  // 2 × Authentic 6-mark LoRs for Plugin 5
  items.push(
    makeLor6(ctx, {
      slug: "eng-od-11",
      conceptId,
      kind,
      domain: "thermal",
      syllabi: engTag(),
      difficulty: "higher",
      questionStyle: "experimental",
      scenarioSpec: e1,
      requiredGivens: [],
      targetQuantityKey: "testbedLorAnchor",
      stem: "An automotive laboratory mounts a four-stroke petrol engine on a testbed to separate thermodynamic combustion losses from mechanical friction losses.",
      prompt:
        "Describe the experimental measurements taken on the engine testbed, explain how input power, indicated power, brake power, thermal efficiency, and mechanical efficiency are calculated from them, and discuss why separating thermal and mechanical efficiencies helps engineers diagnose poor performance.",
      expectedAnswer:
        "Engineers measure fuel mass flow rate and fuel calorific value to determine input power, record a cylinder pressure against volume indicator diagram alongside crankshaft speed, and measure output shaft torque on a brake dynamometer. In data analysis, dynamometer torque and angular speed give brake power while indicator loop area times firing frequency gives indicated power (with firing frequency equal to half the crankshaft revolutions per second multiplied by the number of cylinders). Dividing indicated power by input power yields thermal efficiency, while dividing brake power by indicated power gives mechanical efficiency; separating the two immediately reveals whether poor overall efficiency arises from incomplete combustion and cooling heat losses (low thermal efficiency) or from excessive bearing, piston-ring, and auxiliary friction (low mechanical efficiency).",
      workingSteps: [
        "L1: List key measurements: fuel flow rate (plus calorific value), crankshaft speed, output torque on dynamometer, and cylinder $p$–$V$ pressure transducer trace.",
        "L1: State input power $P_{\\mathrm{in}} = \\text{CV} \\times \\text{fuel flow rate}$.",
        "L2: State $P_{\\mathrm{ind}} = \\text{net loop area} \\times \\frac{f}{2} \\times N_{\\mathrm{cyl}}$ noting four-stroke firing once per two revolutions.",
        "L2: State $P_{\\mathrm{brake}} = T\\omega = 2\\pi f T$ and friction power $P_{\\mathrm{fric}} = P_{\\mathrm{ind}} - P_{\\mathrm{brake}}$.",
        "L3: Define $\\eta_{\\mathrm{th}} = P_{\\mathrm{ind}}/P_{\\mathrm{in}}$, $\\eta_{\\mathrm{mech}} = P_{\\mathrm{brake}}/P_{\\mathrm{ind}}$, and $\\eta_{\\mathrm{ov}} = \\eta_{\\mathrm{th}} \\eta_{\\mathrm{mech}}$.",
        "L3: Explain diagnostic value: low $\\eta_{\\mathrm{th}}$ points to combustion/cooling/timing defects, whereas low $\\eta_{\\mathrm{mech}}$ points to lubrication or bearing friction losses.",
      ],
      levelCriteria: [
        "Identifies measurements of fuel flow rate, crankshaft rotational speed, dynamometer torque, and cylinder $p$–$V$ loop.",
        "Correctly links fuel calorific value times flow rate to input power $P_{\\mathrm{in}}$.",
        "Correctly states $P_{\\mathrm{ind}} = \\text{area} \\times (f/2) \\times N_{\\mathrm{cyl}}$ explicitly using one power stroke per two revolutions.",
        "Correctly states $P_{\\mathrm{brake}} = 2\\pi f T$ and links difference $P_{\\mathrm{ind}} - P_{\\mathrm{brake}}$ to friction power.",
        "Correctly defines $\\eta_{\\mathrm{th}} = P_{\\mathrm{ind}}/P_{\\mathrm{in}}$ and $\\eta_{\\mathrm{mech}} = P_{\\mathrm{brake}}/P_{\\mathrm{ind}}$ (with overall $\\eta_{\\mathrm{ov}} = \\eta_{\\mathrm{th}}\\eta_{\\mathrm{mech}}$).",
        "Explains diagnostic distinction: thermal efficiency isolates combustion/heat-loss issues while mechanical efficiency isolates sliding/bearing friction.",
      ],
      workedSolution:
        "Measure fuel flow rate, crankshaft speed $f$, dynamometer torque $T$, and cylinder $p$–$V$ area. Dynamometer torque and angular speed give brake power while indicator loop area times firing frequency gives indicated power ($P_{\\mathrm{ind}} = A(f/2)N_{\\mathrm{cyl}}$, $P_{\\mathrm{brake}} = 2\\pi f T$, $P_{\\mathrm{in}} = \\text{CV}\\cdot\\dot{m}$). Computing $\\eta_{\\mathrm{th}} = P_{\\mathrm{ind}}/P_{\\mathrm{in}}$ and $\\eta_{\\mathrm{mech}} = P_{\\mathrm{brake}}/P_{\\mathrm{ind}}$ lets engineers distinguish combustion/cooling losses from mechanical friction losses.",
      planSummary: "Extended level of response testbed measurement and efficiency diagnostic procedure.",
    }),
  );

  items.push(
    makeLor6(ctx, {
      slug: "eng-od-12",
      conceptId,
      kind,
      domain: "thermal",
      syllabi: engTag(),
      difficulty: "higher",
      scenarioSpec: { ...e1, mode: "real-vs-ideal" },
      requiredGivens: [],
      targetQuantityKey: "realVsIdealLoopRule",
      stem: "The diagram contrasts the theoretical ideal Otto indicator loop with the actual measured $p$–$V$ loop of a real four-stroke petrol engine of identical swept volume.",
      prompt:
        "Explain in detail the physical causes of every major difference between the actual indicator diagram and the ideal Otto cycle, and explain how these differences reduce both indicated power and thermal efficiency.",
      expectedAnswer:
        "Unlike the theoretical air-standard Otto cycle, the real indicator loop has rounded corners and a lower pumping loop reducing net enclosed work area. First, fuel combustion takes finite time rather than occurring instantaneously at constant volume, so the spark is fired slightly before top dead centre and peak pressure is lower and rounded. Second, exhaust and inlet valves open and close gradually before dead centres to clear exhaust gas, rounding the bottom-right corner and lowering expansion work. Third, significant thermal energy transfers continuously through the cylinder walls into the coolant so compression and expansion are not strictly adiabatic. Fourth, drawing fresh charge in below atmospheric pressure and expelling exhaust above atmospheric pressure creates a negative-work pumping loop that must be subtracted from the positive power loop, reducing both net work per cycle (indicated power) and thermal efficiency.",
      workingSteps: [
        "L1: Identify two visible differences: rounded corners with lower peak pressure and a negative bottom pumping loop.",
        "L1: State that net work per cycle equals the positive power-loop area minus the pumping-loop area.",
        "L2: Explain finite combustion duration and pre-ignition spark timing preventing constant-volume vertical pressure rise.",
        "L2: Explain finite valve-opening times rounding the expansion-exhaust corner and reducing expansion work.",
        "L3: Explain continuous heat loss to the cooling jacket making compression/expansion non-adiabatic and lowering peak temperature/pressure.",
        "L3: Explain pumping work during induction/exhaust and connect smaller net enclosed area directly to lower indicated power and thermal efficiency.",
      ],
      levelCriteria: [
        "Notes rounded corners and lower peak pressure compared with the sharp ideal Otto vertices.",
        "Identifies the presence of the lower induction/exhaust pumping loop representing negative work.",
        "Explains that fuel takes finite time to burn so heating is not instantaneous at constant volume.",
        "Explains that valves open and close gradually before dead centres, reducing work extracted near the end of expansion.",
        "Explains that thermal energy transfers to the cylinder walls/coolant so strokes are not truly adiabatic.",
        "Concludes clearly that smaller net enclosed area directly lowers indicated power and thermal efficiency for the same fuel input.",
      ],
      workedSolution:
        "The real indicator loop has rounded corners and a lower pumping loop reducing net enclosed work area due to finite combustion time, gradual valve timing, continuous heat loss to the coolant jacket, and gas-exchange pumping work, all of which directly reduce indicated power and thermal efficiency.",
      planSummary: "Extended level of response physical critique of real versus ideal Otto p-V indicator diagrams.",
    }),
  );

  return items;
}

/* ========================================================================== */
/*  6. Plugin 6: al-opt-eng-carnot-cop-heatpump (12 items, incl. 2 × 6m LoRs) */
/* ========================================================================== */

function buildCarnotCopItems(ctx: BuildContext): CandidateQuestionInput[] {
  const kind = "al-opt-eng-carnot-cop-heatpump";
  const conceptId = "thermodynamics-entropy-engines";
  const items: CandidateQuestionInput[] = [];

  const h1 = {
    kind,
    mode: "heat-engine",
    hotTempK: 773,
    coldTempK: 313,
    workJ: 1800,
    actualHeatTransferJ: 4500,
  };
  const qh1 = solveKind(kind, h1);
  items.push(
    makeCalcMcq(ctx, {
      slug: "eng-cc-01",
      conceptId,
      kind,
      domain: "thermal",
      syllabi: engTag(),
      difficulty: "foundation",
      scenarioSpec: h1,
      requiredGivens: [
        { name: "hotTempK", value: 773, unit: "K", source: "either" },
        { name: "coldTempK", value: 313, unit: "K", source: "either" },
      ],
      targetQuantityKey: "carnotMaxEfficiencyPct",
      unit: "%",
      stem: "A steam turbine plant operates between a superheated boiler source at 500 °C (773 K) and a condenser sink at 40 °C (313 K). Calculate the maximum theoretical thermal efficiency permitted by the Second Law of Thermodynamics.",
      distractors: [
        {
          value: ((500 - 40) / 500) * 100,
          rationale: "Substitutes Celsius temperatures instead of absolute kelvin temperatures into $\\eta_{\\max} = (T_{\\mathrm{H}} - T_{\\mathrm{C}})/T_{\\mathrm{H}}$.",
        },
        {
          value: (313 / 773) * 100,
          rationale: "Computes $T_{\\mathrm{C}}/T_{\\mathrm{H}}$ instead of $1 - T_{\\mathrm{C}}/T_{\\mathrm{H}}$.",
        },
        {
          value: ((773 - 313) / 313) * 100,
          rationale: "Divides temperature difference by $T_{\\mathrm{C}}$ instead of $T_{\\mathrm{H}}$.",
        },
      ],
      workedSolution: `Temperatures must be strictly in kelvin: $\\eta_{\\max} = \\frac{T_{\\mathrm{H}} - T_{\\mathrm{C}}}{T_{\\mathrm{H}}} = \\frac{773 - 313}{773} = ${fmt3(qh1.carnotMaxEfficiencyPct as number, "%")}$.`,
      markCriterion: `Maximum Carnot efficiency equals ${fmt3(qh1.carnotMaxEfficiencyPct as number, "%")}.`,
      planSummary: "Compute Carnot maximum efficiency strictly using absolute kelvin temperatures.",
    }),
  );

  const h2 = {
    kind,
    mode: "heat-pump",
    hotTempK: 298,
    coldTempK: 273,
    workJ: 1500,
    actualHeatTransferJ: 6000,
  };
  const qh2 = solveKind(kind, h2);
  items.push(
    makeCalcMcq(ctx, {
      slug: "eng-cc-02",
      conceptId,
      kind,
      domain: "thermal",
      syllabi: engTag(),
      difficulty: "foundation",
      scenarioSpec: h2,
      requiredGivens: [
        { name: "hotTempK", value: 298, unit: "K", source: "either" },
        { name: "coldTempK", value: 273, unit: "K", source: "either" },
      ],
      targetQuantityKey: "maxCopHeatPump",
      stem: "A ground-source heat pump maintains a school hall at 25 °C (298 K) while extracting thermal energy from soil at 0 °C (273 K). Calculate the maximum theoretical coefficient of performance $\\mathrm{COP}_{\\mathrm{hp}}$ of this heat pump.",
      distractors: [
        {
          value: qh2.maxCopRefrigerator as number,
          rationale: "Uses the refrigerator numerator $T_{\\mathrm{C}}$ instead of $T_{\\mathrm{H}}$ for a heat pump.",
        },
        {
          value: 25 / (25 - 0.1),
          rationale: "Substitutes Celsius temperatures instead of kelvin temperatures.",
        },
        {
          value: (298 - 273) / 298,
          rationale: "Inverts the ratio and computes Carnot engine efficiency instead of $\\mathrm{COP}_{\\mathrm{hp}}$.",
        },
      ],
      workedSolution: `Using kelvin temperatures: $\\mathrm{COP}_{\\mathrm{hp,max}} = \\frac{T_{\\mathrm{H}}}{T_{\\mathrm{H}} - T_{\\mathrm{C}}} = \\frac{298}{298 - 273} = ${fmt3(qh2.maxCopHeatPump as number)}$ (a dimensionless ratio greater than unity, never a percentage efficiency).`,
      markCriterion: `Maximum heat-pump COP equals ${fmt3(qh2.maxCopHeatPump as number)}.`,
      planSummary: "Compute ideal heat-pump coefficient of performance in kelvin.",
    }),
  );

  const h3 = {
    kind,
    mode: "refrigerator",
    hotTempK: 296,
    coldTempK: 266,
    workJ: 800,
    actualHeatTransferJ: 3200,
  };
  const qh3 = solveKind(kind, h3);
  items.push(
    makeCalcMcq(ctx, {
      slug: "eng-cc-03",
      conceptId,
      kind,
      domain: "thermal",
      syllabi: engTag(),
      difficulty: "standard",
      scenarioSpec: h3,
      requiredGivens: [
        { name: "hotTempK", value: 296, unit: "K", source: "either" },
        { name: "coldTempK", value: 266, unit: "K", source: "either" },
      ],
      targetQuantityKey: "maxCopRefrigerator",
      stem: "A pharmaceutical cold-storage unit operates as a refrigerator between an interior at 266 K and a room at 296 K. Calculate the maximum theoretical coefficient of performance $\\mathrm{COP}_{\\mathrm{ref}}$ of the unit.",
      distractors: [
        {
          value: qh3.maxCopHeatPump as number,
          rationale: "Computes $\\mathrm{COP}_{\\mathrm{hp}} = T_{\\mathrm{H}}/(T_{\\mathrm{H}} - T_{\\mathrm{C}})$ instead of $\\mathrm{COP}_{\\mathrm{ref}} = T_{\\mathrm{C}}/(T_{\\mathrm{H}} - T_{\\mathrm{C}})$.",
        },
        {
          value: (296 - 266) / 296,
          rationale: "Computes Carnot heat-engine efficiency instead of refrigerator COP.",
        },
        {
          value: 266 / 296,
          rationale: "Takes the ratio $T_{\\mathrm{C}}/T_{\\mathrm{H}}$ rather than $T_{\\mathrm{C}}/(T_{\\mathrm{H}} - T_{\\mathrm{C}})$.",
        },
      ],
      workedSolution: `$\\mathrm{COP}_{\\mathrm{ref,max}} = \\frac{T_{\\mathrm{C}}}{T_{\\mathrm{H}} - T_{\\mathrm{C}}} = \\frac{266}{296 - 266} = ${fmt3(qh3.maxCopRefrigerator as number)}$.`,
      markCriterion: `Maximum refrigerator COP equals ${fmt3(qh3.maxCopRefrigerator as number)}.`,
      planSummary: "Compute ideal refrigerator COP distinguishing T_C from T_H in numerator.",
    }),
  );

  const h4 = {
    kind,
    mode: "heat-pump",
    hotTempK: 300,
    coldTempK: 275,
    workJ: 2400,
    actualHeatTransferJ: 9600,
  };
  const qh4 = solveKind(kind, h4);
  items.push(
    makeCalcMcq(ctx, {
      slug: "eng-cc-04",
      conceptId,
      kind,
      domain: "thermal",
      syllabi: engTag(),
      difficulty: "standard",
      scenarioSpec: h4,
      requiredGivens: [
        { name: "workJ", value: 2400, unit: "J", source: "stem" },
        { name: "actualHeatTransferJ", value: 9600, unit: "J", source: "stem" },
      ],
      targetQuantityKey: "qColdJ",
      unit: "J",
      stem: "During one operating interval, an air-source heat pump consumes 2400 J of electrical work and delivers 9600 J of thermal energy into a house. How much thermal energy is extracted from the cold outside air during this interval?",
      distractors: [
        {
          value: 9600 + 2400,
          rationale: "Adds $Q_{\\mathrm{H}}$ and $W$ instead of applying $Q_{\\mathrm{H}} = Q_{\\mathrm{C}} + W$.",
        },
        {
          value: 9600 / 2400,
          rationale: "Reports the dimensionless COP instead of the heat extracted $Q_{\\mathrm{C}}$.",
        },
        {
          value: 9600 * 0.5,
          rationale: "Assumes half the delivered heat comes from outside air.",
        },
      ],
      workedSolution: `By conservation of energy $Q_{\\mathrm{H}} = Q_{\\mathrm{C}} + W$, so $Q_{\\mathrm{C}} = Q_{\\mathrm{H}} - W = 9600 - 2400 = ${fmt3(qh4.qColdJ as number, "J")}$.`,
      markCriterion: `Thermal energy extracted from cold air equals ${fmt3(qh4.qColdJ as number, "J")}.`,
      planSummary: "Apply energy conservation Q_H = Q_C + W to a reversed heat-pump cycle.",
    }),
  );

  // 3 Pure Qualitative MCQs
  items.push(
    makeQualMcq(ctx, {
      slug: "eng-cc-05",
      conceptId,
      kind,
      domain: "thermal",
      syllabi: engTag(),
      difficulty: "foundation",
      scenarioSpec: h1,
      requiredGivens: [],
      targetQuantityKey: "secondLawLimitRule",
      stem: "Even if all mechanical friction and stray conduction losses were eliminated from a cyclic heat engine, why can its thermal efficiency never reach 100%?",
      distractors: [
        {
          text: "Fuel combustion never releases enough chemical energy to raise the hot reservoir temperature.",
          rationale: "Carnot efficiency depends on $T_{\\mathrm{C}}/T_{\\mathrm{H}}$, not on fuel quantity.",
        },
        {
          text: "First Law of Thermodynamics forbids converting more than half of input heat into work.",
          rationale: "The 100% restriction comes from the Second Law, not an arbitrary 50% First-Law rule.",
        },
        {
          text: "Working gas solidifies before it can expand back to atmospheric pressure.",
          rationale: "Ideal-gas Carnot limit applies regardless of phase changes.",
        },
      ],
      workedSolution: `From $\\eta_{\\max} = 1 - \\frac{T_{\\mathrm{C}}}{T_{\\mathrm{H}}}$, achieving 100% would require $T_{\\mathrm{C}} = 0\\text{ K}$: the cold reservoir cannot reach absolute zero so some thermal energy must always be rejected.`,
      planSummary: "Explain Second Law impossibility of a completely efficient cyclic heat engine.",
    }),
  );

  items.push(
    makeQualMcq(ctx, {
      slug: "eng-cc-06",
      conceptId,
      kind,
      domain: "thermal",
      syllabi: engTag(),
      difficulty: "foundation",
      scenarioSpec: h2,
      requiredGivens: [],
      targetQuantityKey: "copGreaterThanOneRule",
      stem: "A domestic heat pump has an operating coefficient of performance $\\mathrm{COP}_{\\mathrm{hp}} = 3.8$. Why does a value greater than 1 NOT violate the principle of conservation of energy?",
      distractors: [
        {
          text: "Heat pump operates at 380 percent thermodynamic efficiency by creating extra thermal energy inside the compressor.",
          rationale: "COP is a performance ratio, never a percentage efficiency, and energy cannot be created.",
        },
        {
          text: "Electrical work is measured in watts while output heat is measured in joules.",
          rationale: "Both numerator and denominator carry identical units of energy (or power).",
        },
        {
          text: "Compressor stores energy during the day and releases it simultaneously at night.",
          rationale: "COP exceeds unity in steady continuous operation.",
        },
      ],
      workedSolution: `Because $Q_{\\mathrm{H}} = Q_{\\mathrm{C}} + W$, a heat pump transfers thermal energy from the cold outdoors in addition to the electrical work input, so $\\mathrm{COP}_{\\mathrm{hp}} = Q_{\\mathrm{H}}/W > 1$ obeys energy conservation.`,
      planSummary: "Explain why COP_hp greater than one is a ratio obeying conservation of energy.",
    }),
  );

  items.push(
    makeQualMcq(ctx, {
      slug: "eng-cc-07",
      conceptId,
      kind,
      domain: "thermal",
      syllabi: engTag(),
      difficulty: "standard",
      scenarioSpec: h1,
      requiredGivens: [],
      targetQuantityKey: "chpLorAnchor",
      stem: "Why can a combined heat and power (CHP) station achieve overall energy utilisation exceeding 75% even though its electrical turbine generator is still bounded by Carnot efficiency?",
      distractors: [
        {
          text: "CHP station lowers its condenser temperature below absolute zero to surpass the Carnot limit.",
          rationale: "Absolute zero is unattainable.",
        },
        {
          text: "CHP station eliminates thermal rejection entirely so all fuel energy becomes electricity.",
          rationale: "A CHP turbine still rejects heat, which is then put to useful heating.",
        },
        {
          text: "CHP station operates as a refrigerator during peak electrical demand.",
          rationale: "A CHP plant is a heat engine whose waste heat warms buildings or industrial processes.",
        },
      ],
      workedSolution: `Although electrical generation remains limited by $(T_{\\mathrm{H}} - T_{\\mathrm{C}})/T_{\\mathrm{H}}$, combined heat and power utilises rejected thermal energy for heating raising overall energy utilisation above a standalone power station.`,
      planSummary: "Explain how CHP plants raise overall energy utilisation without violating Carnot's limit.",
    }),
  );

  // 3 Multi-part structured
  const ccStructs = [
    {
      slug: "eng-cc-08",
      difficulty: "standard" as const,
      spec: {
        kind,
        mode: "heat-engine",
        hotTempK: 820,
        coldTempK: 308,
        workJ: 2400,
        actualHeatTransferJ: 6000,
      },
    },
    {
      slug: "eng-cc-09",
      difficulty: "standard" as const,
      spec: {
        kind,
        mode: "heat-pump",
        hotTempK: 295,
        coldTempK: 271,
        workJ: 1800,
        actualHeatTransferJ: 7200,
      },
    },
    {
      slug: "eng-cc-10",
      difficulty: "higher" as const,
      spec: {
        kind,
        mode: "refrigerator",
        hotTempK: 300,
        coldTempK: 264,
        workJ: 950,
        actualHeatTransferJ: 3420,
      },
    },
  ];

  for (const cfg of ccStructs) {
    const sp = cfg.spec;
    const q = solveKind(kind, sp);
    if (sp.mode === "heat-engine") {
      const carnotStr = fmt3(q.carnotMaxEfficiencyPct as number, "%");
      const actEffStr = fmt3(q.actualEfficiencyPct as number, "%");
      const qcStr = fmt3(q.qColdJ as number, "J");
      items.push(
        makeStructured(ctx, {
          slug: cfg.slug,
          conceptId,
          kind,
          domain: "thermal",
          syllabi: engTag(),
          difficulty: cfg.difficulty,
          scenarioSpec: sp,
          hiddenQuantities: [
            "carnotMaxEfficiencyPct",
            "actualEfficiencyPct",
            "qColdJ",
          ],
          requiredGivens: [
            { name: "hotTempK", value: sp.hotTempK, unit: "K", source: "either" },
            { name: "coldTempK", value: sp.coldTempK, unit: "K", source: "either" },
            { name: "workJ", value: sp.workJ, unit: "J", source: "stem" },
            { name: "actualHeatTransferJ", value: sp.actualHeatTransferJ, unit: "J", source: "stem" },
          ],
          stem: `A gas-turbine heat engine operates between a hot reservoir at ${sp.hotTempK} K and a cold sink at ${sp.coldTempK} K. In each cycle it absorbs ${sp.actualHeatTransferJ} J from the hot reservoir and produces ${sp.workJ} J of useful mechanical work.`,
          parts: [
            {
              partId: "a",
              prompt: "Calculate the maximum theoretical (Carnot) efficiency of the engine.",
              marks: 2,
              targetQuantityKey: "carnotMaxEfficiencyPct",
              expectedAnswer: carnotStr,
              workingSteps: [
                `Use $\\eta_{\\max} = \\frac{T_{\\mathrm{H}} - T_{\\mathrm{C}}}{T_{\\mathrm{H}}}$ in kelvin.`,
                `$\\eta_{\\max} = \\frac{${sp.hotTempK} - ${sp.coldTempK}}{${sp.hotTempK}} = ${carnotStr}$.`,
              ],
            },
            {
              partId: "b",
              prompt: "Calculate the actual thermal efficiency of the engine.",
              marks: 2,
              targetQuantityKey: "actualEfficiencyPct",
              expectedAnswer: actEffStr,
              workingSteps: [
                `$\\eta = \\frac{W}{Q_{\\mathrm{H}}} = \\frac{${sp.workJ}}{${sp.actualHeatTransferJ}} = ${actEffStr}$.`,
              ],
            },
            {
              partId: "c",
              prompt: "Calculate the thermal energy rejected to the cold sink in each cycle.",
              marks: 2,
              targetQuantityKey: "qColdJ",
              expectedAnswer: qcStr,
              workingSteps: [
                `By conservation of energy $Q_{\\mathrm{C}} = Q_{\\mathrm{H}} - W = ${sp.actualHeatTransferJ} - ${sp.workJ} = ${qcStr}$.`,
              ],
            },
          ],
          workedSolution: `(a) $\\eta_{\\max} = ${carnotStr}$. (b) $\\eta_{\\mathrm{actual}} = ${actEffStr}$. (c) Rejected heat $Q_{\\mathrm{C}} = ${qcStr}$.`,
          markScheme: [
            { code: "M1", criterion: "Applies $\\eta_{\\max} = (T_{\\mathrm{H}} - T_{\\mathrm{C}})/T_{\\mathrm{H}}$ in kelvin.", marks: 1, partId: "a" },
            { code: "A1", criterion: `Obtains ${carnotStr}.`, marks: 1, partId: "a" },
            { code: "M1", criterion: "Applies $\\eta = W/Q_{\\mathrm{H}}$.", marks: 1, partId: "b" },
            { code: "A1", criterion: `Obtains ${actEffStr}.`, marks: 1, partId: "b" },
            { code: "M1", criterion: "Applies $Q_{\\mathrm{C}} = Q_{\\mathrm{H}} - W$.", marks: 1, partId: "c" },
            { code: "A1", criterion: `Obtains ${qcStr}.`, marks: 1, partId: "c" },
          ],
          planSummary: "Heat engine Carnot limit, actual efficiency, and rejected heat per cycle.",
        }),
      );
    } else if (sp.mode === "heat-pump") {
      const copMaxStr = fmt3(q.maxCopHeatPump as number);
      const copActStr = fmt3(q.actualCop as number);
      const qcStr = fmt3(q.qColdJ as number, "J");
      items.push(
        makeStructured(ctx, {
          slug: cfg.slug,
          conceptId,
          kind,
          domain: "thermal",
          syllabi: engTag(),
          difficulty: cfg.difficulty,
          scenarioSpec: sp,
          hiddenQuantities: ["maxCopHeatPump", "actualCop", "qColdJ"],
          requiredGivens: [
            { name: "hotTempK", value: sp.hotTempK, unit: "K", source: "either" },
            { name: "coldTempK", value: sp.coldTempK, unit: "K", source: "either" },
            { name: "workJ", value: sp.workJ, unit: "J", source: "stem" },
            { name: "actualHeatTransferJ", value: sp.actualHeatTransferJ, unit: "J", source: "stem" },
          ],
          stem: `A heat pump heats a workshop at ${sp.hotTempK} K using outside air at ${sp.coldTempK} K. In one operating interval it consumes ${sp.workJ} J of electrical work and delivers ${sp.actualHeatTransferJ} J of thermal energy indoors.`,
          parts: [
            {
              partId: "a",
              prompt: "Calculate the maximum theoretical $\\mathrm{COP}_{\\mathrm{hp}}$ between these temperatures.",
              marks: 2,
              targetQuantityKey: "maxCopHeatPump",
              expectedAnswer: copMaxStr,
              workingSteps: [
                `$\\mathrm{COP}_{\\mathrm{hp,max}} = \\frac{T_{\\mathrm{H}}}{T_{\\mathrm{H}} - T_{\\mathrm{C}}} = \\frac{${sp.hotTempK}}{${sp.hotTempK - sp.coldTempK}} = ${copMaxStr}$.`,
              ],
            },
            {
              partId: "b",
              prompt: "Calculate the actual $\\mathrm{COP}_{\\mathrm{hp}}$ achieved by the unit.",
              marks: 2,
              targetQuantityKey: "actualCop",
              expectedAnswer: copActStr,
              workingSteps: [
                `$\\mathrm{COP}_{\\mathrm{hp}} = \\frac{Q_{\\mathrm{H}}}{W} = \\frac{${sp.actualHeatTransferJ}}{${sp.workJ}} = ${copActStr}$.`,
              ],
            },
            {
              partId: "c",
              prompt: "Determine the thermal energy drawn from the outside air during this interval.",
              marks: 2,
              targetQuantityKey: "qColdJ",
              expectedAnswer: qcStr,
              workingSteps: [
                `$Q_{\\mathrm{C}} = Q_{\\mathrm{H}} - W = ${sp.actualHeatTransferJ} - ${sp.workJ} = ${qcStr}$.`,
              ],
            },
          ],
          workedSolution: `(a) $\\mathrm{COP}_{\\mathrm{hp,max}} = ${copMaxStr}$. (b) Actual $\\mathrm{COP}_{\\mathrm{hp}} = ${copActStr}$. (c) $Q_{\\mathrm{C}} = ${qcStr}$.`,
          markScheme: [
            { code: "M1", criterion: "Uses $T_{\\mathrm{H}}/(T_{\\mathrm{H}} - T_{\\mathrm{C}})$ in kelvin.", marks: 1, partId: "a" },
            { code: "A1", criterion: `Obtains ${copMaxStr}.`, marks: 1, partId: "a" },
            { code: "M1", criterion: "Uses $Q_{\\mathrm{H}}/W$.", marks: 1, partId: "b" },
            { code: "A1", criterion: `Obtains ${copActStr}.`, marks: 1, partId: "b" },
            { code: "M1", criterion: "Applies $Q_{\\mathrm{C}} = Q_{\\mathrm{H}} - W$.", marks: 1, partId: "c" },
            { code: "A1", criterion: `Obtains ${qcStr}.`, marks: 1, partId: "c" },
          ],
          planSummary: "Heat pump theoretical COP, actual COP, and cold-source heat extraction.",
        }),
      );
    } else {
      const copRefMax = fmt3(q.maxCopRefrigerator as number);
      const copRefAct = fmt3(q.actualCop as number);
      const qhStr = fmt3(q.qHotJ as number, "J");
      items.push(
        makeStructured(ctx, {
          slug: cfg.slug,
          conceptId,
          kind,
          domain: "thermal",
          syllabi: engTag(),
          difficulty: cfg.difficulty,
          scenarioSpec: sp,
          hiddenQuantities: ["maxCopRefrigerator", "actualCop", "qHotJ"],
          requiredGivens: [
            { name: "hotTempK", value: sp.hotTempK, unit: "K", source: "either" },
            { name: "coldTempK", value: sp.coldTempK, unit: "K", source: "either" },
            { name: "workJ", value: sp.workJ, unit: "J", source: "stem" },
            { name: "actualHeatTransferJ", value: sp.actualHeatTransferJ, unit: "J", source: "stem" },
          ],
          stem: `A laboratory freezer maintains its cold chamber at ${sp.coldTempK} K in an ambient room at ${sp.hotTempK} K. Using ${sp.workJ} J of compressor work, it extracts ${sp.actualHeatTransferJ} J from the chamber.`,
          parts: [
            {
              partId: "a",
              prompt: "Calculate the maximum theoretical $\\mathrm{COP}_{\\mathrm{ref}}$ of this freezer.",
              marks: 2,
              targetQuantityKey: "maxCopRefrigerator",
              expectedAnswer: copRefMax,
              workingSteps: [
                `$\\mathrm{COP}_{\\mathrm{ref,max}} = \\frac{T_{\\mathrm{C}}}{T_{\\mathrm{H}} - T_{\\mathrm{C}}} = \\frac{${sp.coldTempK}}{${sp.hotTempK - sp.coldTempK}} = ${copRefMax}$.`,
              ],
            },
            {
              partId: "b",
              prompt: "Calculate the actual $\\mathrm{COP}_{\\mathrm{ref}}$ of the freezer.",
              marks: 2,
              targetQuantityKey: "actualCop",
              expectedAnswer: copRefAct,
              workingSteps: [
                `$\\mathrm{COP}_{\\mathrm{ref}} = \\frac{Q_{\\mathrm{C}}}{W} = \\frac{${sp.actualHeatTransferJ}}{${sp.workJ}} = ${copRefAct}$.`,
              ],
            },
            {
              partId: "c",
              prompt: "Calculate the total thermal energy rejected into the room by the rear condenser coils.",
              marks: 2,
              targetQuantityKey: "qHotJ",
              expectedAnswer: qhStr,
              workingSteps: [
                `$Q_{\\mathrm{H}} = Q_{\\mathrm{C}} + W = ${sp.actualHeatTransferJ} + ${sp.workJ} = ${qhStr}$.`,
              ],
            },
          ],
          workedSolution: `(a) $\\mathrm{COP}_{\\mathrm{ref,max}} = ${copRefMax}$. (b) Actual $\\mathrm{COP}_{\\mathrm{ref}} = ${copRefAct}$. (c) $Q_{\\mathrm{H}} = ${qhStr}$.`,
          markScheme: [
            { code: "M1", criterion: "Applies $T_{\\mathrm{C}}/(T_{\\mathrm{H}} - T_{\\mathrm{C}})$ in kelvin.", marks: 1, partId: "a" },
            { code: "A1", criterion: `Obtains ${copRefMax}.`, marks: 1, partId: "a" },
            { code: "M1", criterion: "Applies $Q_{\\mathrm{C}}/W$.", marks: 1, partId: "b" },
            { code: "A1", criterion: `Obtains ${copRefAct}.`, marks: 1, partId: "b" },
            { code: "M1", criterion: "Applies $Q_{\\mathrm{H}} = Q_{\\mathrm{C}} + W$.", marks: 1, partId: "c" },
            { code: "A1", criterion: `Obtains ${qhStr}.`, marks: 1, partId: "c" },
          ],
          planSummary: "Refrigerator theoretical COP, actual COP, and condenser heat rejection.",
        }),
      );
    }
  }

  // 2 × Authentic 6-mark LoRs for Plugin 6
  items.push(
    makeLor6(ctx, {
      slug: "eng-cc-11",
      conceptId,
      kind,
      domain: "thermal",
      syllabi: engTag(),
      difficulty: "higher",
      scenarioSpec: h2,
      requiredGivens: [],
      targetQuantityKey: "heatPumpLorAnchor",
      stem: "A university campus is choosing between direct electric resistive heaters and an air-source heat pump to warm a lecture building during winter.",
      prompt:
        "Analyse both heating options using the First and Second Laws of Thermodynamics, explaining why a heat pump outperforms resistive heating in energy terms, why its COP is not an efficiency, and how colder outside temperatures affect its performance.",
      expectedAnswer:
        "A direct resistive heater converts electrical work directly into thermal energy at a one-to-one ratio, whereas a heat pump delivers more thermal energy than electrical work supplied because work moves additional heat from the cold reservoir ($Q_{\\mathrm{H}} = Q_{\\mathrm{C}} + W$). Consequently $\\mathrm{COP}_{\\mathrm{hp}} = Q_{\\mathrm{H}}/W$ is strictly greater than unity; it is a ratio of useful heat delivered to work input rather than a percentage efficiency, so energy conservation is fully obeyed. By the Second Law, $\\mathrm{COP}_{\\mathrm{hp,max}} = T_{\\mathrm{H}}/(T_{\\mathrm{H}} - T_{\\mathrm{C}})$ in kelvin, meaning that when outside winter temperature $T_{\\mathrm{C}}$ drops, the temperature difference $T_{\\mathrm{H}} - T_{\\mathrm{C}}$ widens and the achievable COP falls, requiring more electrical input (and higher capital/maintenance cost) on the coldest days.",
      workingSteps: [
        "L1: State that resistive heating converts $1\\text{ J}$ of electrical work into at most $1\\text{ J}$ of heat.",
        "L1: State energy balance $Q_{\\mathrm{H}} = Q_{\\mathrm{C}} + W$ for the heat pump.",
        "L2: Explain that $\\mathrm{COP}_{\\mathrm{hp}} = Q_{\\mathrm{H}}/W > 1$ because outdoor thermal energy $Q_{\\mathrm{C}}$ is transferred alongside work $W$.",
        "L2: Clarify that COP is a dimensionless ratio and not an efficiency exceeding 100%.",
        "L3: Use $\\mathrm{COP}_{\\mathrm{hp,max}} = T_{\\mathrm{H}}/(T_{\\mathrm{H}} - T_{\\mathrm{C}})$ (in K) to explain why performance drops in severe frost when $T_{\\mathrm{C}}$ falls.",
        "L3: Weigh practical engineering trade-offs (capital cost, defrosting, noise vs lower running energy and carbon footprint).",
      ],
      levelCriteria: [
        "States that an electric resistive heater delivers heat equal to electrical work input (1:1 conversion).",
        "Writes and explains $Q_{\\mathrm{H}} = Q_{\\mathrm{C}} + W$ for the heat pump cycle.",
        "Explains that the heat pump delivers more heat than electrical work supplied because it transfers additional heat from the cold reservoir.",
        "Clarifies explicitly that $\\mathrm{COP}_{\\mathrm{hp}} > 1$ is a performance ratio, not a percentage efficiency violating energy conservation.",
        "Applies $\\mathrm{COP}_{\\mathrm{hp,max}} = T_{\\mathrm{H}}/(T_{\\mathrm{H}} - T_{\\mathrm{C}})$ in kelvin to deduce that falling outside temperature lowers COP.",
        "Includes a balanced engineering consideration such as higher installation cost or reduced winter margin versus lower operating energy.",
      ],
      workedSolution:
        "Resistive heating gives $Q = W$, whereas a heat pump delivers more thermal energy than electrical work supplied because work moves additional heat from the cold reservoir ($Q_{\\mathrm{H}} = Q_{\\mathrm{C}} + W$, so $\\mathrm{COP}_{\\mathrm{hp}} = Q_{\\mathrm{H}}/W > 1$ as a ratio, not percentage efficiency). Since $\\mathrm{COP}_{\\mathrm{hp,max}} = T_{\\mathrm{H}}/(T_{\\mathrm{H}} - T_{\\mathrm{C}})$ in K, colder exterior temperatures widen $T_{\\mathrm{H}} - T_{\\mathrm{C}}$ and reduce COP.",
      planSummary: "Extended level of response thermodynamic comparison of heat pumps versus electric resistive heating.",
    }),
  );

  items.push(
    makeLor6(ctx, {
      slug: "eng-cc-12",
      conceptId,
      kind,
      domain: "thermal",
      syllabi: engTag(),
      difficulty: "higher",
      scenarioSpec: h1,
      requiredGivens: [],
      targetQuantityKey: "chpLorAnchor",
      stem: "A large hospital currently buys electricity from a distant coal/gas power station and burns natural gas on-site in boilers for space heating. Engineers propose installing a local combined heat and power (CHP) station instead.",
      prompt:
        "Explain using thermodynamic principles why a standalone power station wastes a large fraction of its fuel energy, how a CHP station improves overall energy utilisation, and the practical engineering limitations that govern CHP deployment.",
      expectedAnswer:
        "Any cyclic power-station turbine is governed by the Second Law limit $\\eta_{\\max} = (T_{\\mathrm{H}} - T_{\\mathrm{C}})/T_{\\mathrm{H}}$ in kelvin; because the condenser cannot approach absolute zero and real irreversibilities occur, more than half of the fuel energy is rejected to cooling towers or rivers as low-grade heat. In contrast, combined heat and power utilises rejected thermal energy for heating raising overall energy utilisation above a standalone power station, while local generation also cuts high-voltage grid transmission losses. However, to supply useful district or hospital hot water, the CHP condenser must reject heat at a higher temperature $T_{\\mathrm{C}}$, slightly lowering electrical Carnot efficiency, and the plant must be sited close to continuous heat demand to avoid insulated-pipe losses.",
      workingSteps: [
        "L1: State Carnot maximum efficiency $\\eta_{\\max} = (T_{\\mathrm{H}} - T_{\\mathrm{C}})/T_{\\mathrm{H}}$ in kelvin and explain why $T_{\\mathrm{C}} > 0\\text{ K}$ forces heat rejection.",
        "L1: Note that conventional stations dump this rejected condenser heat into rivers or cooling towers.",
        "L2: Explain that a CHP plant captures rejected thermal energy for space heating or hot water, sharply raising total useful energy fraction.",
        "L2: Note reduced electrical distribution losses because generation is close to the hospital load.",
        "L3: Explain the thermodynamic trade-off: raising $T_{\\mathrm{C}}$ so rejected water is hot enough for heating slightly reduces electrical efficiency.",
        "L3: Identify siting/demand matching constraints (heat cannot be piped cheaply over long distances; seasonal heat-to-power mismatch).",
      ],
      levelCriteria: [
        "Applies $\\eta_{\\max} = (T_{\\mathrm{H}} - T_{\\mathrm{C}})/T_{\\mathrm{H}}$ in kelvin to explain why a power station must reject heat.",
        "Explains that standalone power stations waste rejected condenser energy to the environment.",
        "Explains that CHP captures rejected thermal energy for heating, boosting overall useful energy utilisation.",
        "Notes reduced electrical grid transmission losses from local on-site generation.",
        "Identifies the trade-off that rejecting heat at higher $T_{\\mathrm{C}}$ for heating slightly reduces electrical turbine efficiency.",
        "Identifies practical CHP deployment limits such as proximity to heat users, insulated piping costs, or seasonal demand mismatch.",
      ],
      workedSolution:
        "Standalone turbines must reject heat because $\\eta_{\\max} = (T_{\\mathrm{H}} - T_{\\mathrm{C}})/T_{\\mathrm{H}} < 1$. Combined heat and power utilises rejected thermal energy for heating raising overall energy utilisation above a standalone power station and cuts transmission losses, traded against slightly higher $T_{\\mathrm{C}}$ and siting near steady heat demand.",
      planSummary: "Extended level of response thermodynamic evaluation of CHP stations versus standalone grid power.",
    }),
  );

  return items;
}

/* ========================================================================== */
/*  7. Plugin 7: al-opt-elec-discrete-semiconductors (12 items, 2 × 6m LoRs)  */
/* ========================================================================== */

function buildDiscreteSemiItems(ctx: BuildContext): CandidateQuestionInput[] {
  const kind = "al-opt-elec-discrete-semiconductors";
  const conceptId = "kirchhoff-dc-circuits";
  const items: CandidateQuestionInput[] = [];

  const z1 = {
    kind,
    mode: "zener-regulator",
    supplyVoltageV: 12.0,
    zenerVoltageV: 5.6,
    minZenerCurrentMa: 5.0,
    loadCurrentMa: 35.0,
  };
  const qz1 = solveKind(kind, z1);
  items.push(
    makeCalcMcq(ctx, {
      slug: "elec-semi-01",
      conceptId,
      kind,
      domain: "circuits",
      syllabi: elecTag(),
      difficulty: "foundation",
      scenarioSpec: z1,
      requiredGivens: [
        { name: "supplyVoltageV", value: 12.0, unit: "V", source: "either" },
        { name: "zenerVoltageV", value: 5.6, unit: "V", source: "either" },
        { name: "minZenerCurrentMa", value: 5.0, unit: "mA", source: "stem" },
        { name: "loadCurrentMa", value: 35.0, unit: "mA", source: "stem" },
      ],
      targetQuantityKey: "requiredSeriesResistorOhm",
      unit: "Ω",
      stem: "A Zener shunt regulator uses a 5.6 V Zener diode connected to a 12.0 V DC supply. The load draws a maximum current of 35.0 mA and the Zener diode requires at least 5.0 mA to maintain reverse breakdown. Calculate the maximum permissible value of the series resistor $R_{\\mathrm{s}}$.",
      distractors: [
        {
          value: (12.0 - 5.6) / 35e-3,
          rationale: "Omits the minimum $5.0\\text{ mA}$ Zener holding current from the total series current.",
        },
        {
          value: 5.6 / 40e-3,
          rationale: "Uses $V_{\\mathrm{Z}}$ instead of the voltage drop $(V_{\\mathrm{s}} - V_{\\mathrm{Z}})$ across $R_{\\mathrm{s}}$.",
        },
        {
          value: 12.0 / 40e-3,
          rationale: "Uses the full supply voltage $V_{\\mathrm{s}}$ instead of $(V_{\\mathrm{s}} - V_{\\mathrm{Z}})$.",
        },
      ],
      workedSolution: `Total current through $R_{\\mathrm{s}}$ is $I = I_{\\mathrm{Z}} + I_{\\mathrm{L}} = 5.0 + 35.0 = 40.0\\text{ mA}$. Potential difference across $R_{\\mathrm{s}}$ is $V_{\\mathrm{s}} - V_{\\mathrm{Z}} = 12.0 - 5.6 = 6.4\\text{ V}$, giving $R_{\\mathrm{s}} = \\frac{6.4}{40.0 \\times 10^{-3}} = ${fmt3(qz1.requiredSeriesResistorOhm as number, "Ω")}$.`,
      markCriterion: `Series resistor value equals ${fmt3(qz1.requiredSeriesResistorOhm as number, "Ω")}.`,
      planSummary: "Size series limiting resistor in a Zener diode shunt voltage regulator.",
    }),
  );

  const z2 = {
    kind,
    mode: "zener-regulator",
    supplyVoltageV: 15.0,
    zenerVoltageV: 6.2,
    minZenerCurrentMa: 5.0,
    loadCurrentMa: 39.0,
    seriesResistorOhm: 200,
  };
  const qz2 = solveKind(kind, z2);
  items.push(
    makeCalcMcq(ctx, {
      slug: "elec-semi-02",
      conceptId,
      kind,
      domain: "circuits",
      syllabi: elecTag(),
      difficulty: "standard",
      scenarioSpec: z2,
      requiredGivens: [
        { name: "supplyVoltageV", value: 15.0, unit: "V", source: "either" },
        { name: "zenerVoltageV", value: 6.2, unit: "V", source: "either" },
        { name: "seriesResistorOhm", value: 200, unit: "Ω", source: "either" },
      ],
      targetQuantityKey: "worstCaseZenerPowerMw",
      unit: "mW",
      stem: "A 6.2 V Zener diode regulator is fed from a 15.0 V supply through a 200 Ω series resistor. Calculate the worst-case power dissipated in the Zener diode when the external load is disconnected ($I_{\\mathrm{L}} = 0$).",
      distractors: [
        {
          value: (15.0 - 6.2) * ((15.0 - 6.2) / 200) * 1e3,
          rationale: "Calculates power dissipated in the series resistor instead of the Zener diode.",
        },
        {
          value: 6.2 * 5.0,
          rationale: "Uses only the minimum Zener knee current instead of the full no-load series current.",
        },
        {
          value: 15.0 * ((15.0 - 6.2) / 200) * 1e3,
          rationale: "Multiplies current by $V_{\\mathrm{s}}$ instead of $V_{\\mathrm{Z}}$.",
        },
      ],
      workedSolution: `At no load ($I_{\\mathrm{L}} = 0$), all current flows through the Zener: $I_{\\mathrm{Z,max}} = \\frac{15.0 - 6.2}{200} = 44.0\\text{ mA}$. Worst-case Zener power $P_{\\mathrm{Z}} = V_{\\mathrm{Z}} I_{\\mathrm{Z,max}} = 6.2 \\times 44.0\\text{ mA} = ${fmt3(qz2.worstCaseZenerPowerMw as number, "mW")}$.`,
      markCriterion: `Worst-case Zener power dissipation equals ${fmt3(qz2.worstCaseZenerPowerMw as number, "mW")}.`,
      planSummary: "Calculate worst-case no-load power rating required for a Zener regulator diode.",
    }),
  );

  const p1 = {
    kind,
    mode: "photodiode-sensor",
    supplyVoltageV: 9.0,
    photodiodeCurrentUa: 45.0,
    senseResistorKohm: 80,
  };
  const qp1 = solveKind(kind, p1);
  items.push(
    makeCalcMcq(ctx, {
      slug: "elec-semi-03",
      conceptId,
      kind,
      domain: "circuits",
      syllabi: elecTag(),
      difficulty: "foundation",
      scenarioSpec: p1,
      requiredGivens: [
        { name: "supplyVoltageV", value: 9.0, unit: "V", source: "either" },
        { name: "photodiodeCurrentUa", value: 45.0, unit: "μA", source: "stem" },
        { name: "senseResistorKohm", value: 80, unit: "kΩ", source: "either" },
      ],
      targetQuantityKey: "senseResistorVoltageV",
      unit: "V",
      stem: "A reverse-biased photodiode in photoconductive mode is wired in series with an 80.0 kΩ sensing resistor across a 9.0 V supply as shown. Under a steady laser beam the reverse photocurrent is 45.0 μA. Calculate the output potential difference $V_{\\mathrm{out}}$ across the sensing resistor.",
      distractors: [
        {
          value: qp1.photodiodeVoltageV as number,
          rationale: "Reports the potential difference across the photodiode instead of across the sensing resistor.",
        },
        {
          value: 45.0 * 80.0 * 1e-6,
          rationale: "Converts $\\mu\\text{A}$ to $\\text{A}$ but omits the $10^3$ factor for $\\text{k}\\Omega$.",
        },
        {
          value: 9.0 / 2,
          rationale: "Assumes equal potential division between photodiode and resistor.",
        },
      ],
      workedSolution: `$V_{\\mathrm{out}} = I_{\\mathrm{p}} R = (45.0 \\times 10^{-6}\\text{ A})(80.0 \\times 10^3\\text{ }\\Omega) = ${fmt3(qp1.senseResistorVoltageV as number, "V")}$.`,
      markCriterion: `Output voltage across sensing resistor equals ${fmt3(qp1.senseResistorVoltageV as number, "V")}.`,
      planSummary: "Calculate photodiode sensor output potential difference across series resistor.",
    }),
  );

  const p2 = {
    kind,
    mode: "photodiode-sensor",
    supplyVoltageV: 12.0,
    photodiodeCurrentUa: 60.0,
    senseResistorKohm: 125,
  };
  const qp2 = solveKind(kind, p2);
  items.push(
    makeCalcMcq(ctx, {
      slug: "elec-semi-04",
      conceptId,
      kind,
      domain: "circuits",
      syllabi: elecTag(),
      difficulty: "standard",
      scenarioSpec: p2,
      requiredGivens: [
        { name: "supplyVoltageV", value: 12.0, unit: "V", source: "either" },
        { name: "photodiodeCurrentUa", value: 60.0, unit: "μA", source: "stem" },
        { name: "senseResistorKohm", value: 125, unit: "kΩ", source: "either" },
      ],
      targetQuantityKey: "photodiodeVoltageV",
      unit: "V",
      stem: "In a light-gate receiver connected across a 12.0 V supply, a reverse-biased photodiode in series with a 125 kΩ resistor conducts a photocurrent of 60.0 μA. Calculate the potential difference remaining across the photodiode.",
      distractors: [
        {
          value: qp2.senseResistorVoltageV as number,
          rationale: "Computes $I_{\\mathrm{p}} R$ across the resistor without subtracting from the $12.0\\text{ V}$ supply.",
        },
        {
          value: 12.0 - 0.7,
          rationale: "Treats the reverse-biased photodiode as a forward-biased $0.7\\text{ V}$ silicon diode.",
        },
        {
          value: 12.0 + (qp2.senseResistorVoltageV as number),
          rationale: "Adds $V_R$ to the supply voltage instead of subtracting.",
        },
      ],
      workedSolution: `$V_R = (60.0 \\times 10^{-6})(125 \\times 10^3) = 7.50\\text{ V}$. Hence the pd across the photodiode is $V_{\\mathrm{D}} = 12.0 - 7.50 = ${fmt3(qp2.photodiodeVoltageV as number, "V")}$.`,
      markCriterion: `Potential difference across photodiode equals ${fmt3(qp2.photodiodeVoltageV as number, "V")}.`,
      planSummary: "Determine remaining reverse potential difference across a photoconductive photodiode.",
    }),
  );

  // 3 Pure Qualitative MCQs
  const m1 = {
    kind,
    mode: "mosfet-driver",
    supplyVoltageV: 12.0,
    mosfetThresholdV: 2.5,
    gateVoltageV: 5.0,
    loadResistanceOhm: 24.0,
  };
  items.push(
    makeQualMcq(ctx, {
      slug: "elec-semi-05",
      conceptId,
      kind,
      domain: "circuits",
      syllabi: elecTag(),
      difficulty: "foundation",
      scenarioSpec: m1,
      requiredGivens: [],
      targetQuantityKey: "mosfetGateRule",
      stem: "Why is an enhancement MOSFET preferred over a bipolar junction transistor when switching a motor directly from a high-resistance sensor or CMOS logic output?",
      distractors: [
        {
          text: "MOSFET requires a large continuous gate current to keep its channel open.",
          rationale: "The opposite is true: a MOSFET is voltage-controlled with negligible gate current.",
        },
        {
          text: "MOSFET conducts equally well regardless of whether gate-source voltage is below or above threshold.",
          rationale: "An enhancement MOSFET stays OFF until $V_{\\mathrm{GS}} > V_{\\mathrm{th}}$.",
        },
        {
          text: "MOSFET steps up the supply voltage across the motor through internal induction.",
          rationale: "A MOSFET acts as an electronic switch, not a voltage step-up converter.",
        },
      ],
      workedSolution: `Because the metal gate is isolated by an oxide layer, an insulated silicon dioxide gate gives virtually infinite input resistance drawing negligible gate current, avoiding loading the preceding circuit.`,
      planSummary: "Explain MOSFET high input resistance and negligible gate current.",
    }),
  );

  items.push(
    makeQualMcq(ctx, {
      slug: "elec-semi-06",
      conceptId,
      kind,
      domain: "circuits",
      syllabi: elecTag(),
      difficulty: "foundation",
      scenarioSpec: z1,
      requiredGivens: [],
      targetQuantityKey: "zenerBreakdownRule",
      stem: "How must a Zener diode be connected in a voltage-stabilising circuit, and what feature of its $I$–$V$ characteristic enables voltage regulation?",
      distractors: [
        {
          text: "Forward-biased Zener diode exhibits a linear ohmic gradient that doubles output voltage under load.",
          rationale: "Forward-biased Zener diodes behave like ordinary $0.7\\text{ V}$ silicon diodes, not regulators.",
        },
        {
          text: "Reverse-biased Zener diode blocks all current completely up to infinite supply voltage.",
          rationale: "Regulation relies on controlled reverse breakdown conduction at $V_{\\mathrm{Z}}$.",
        },
        {
          text: "Reverse-biased Zener diode increases its breakdown voltage linearly with load current.",
          rationale: "Its steep vertical breakdown knee keeps voltage nearly constant despite current changes.",
        },
      ],
      workedSolution: `On the steep reverse breakdown knee, a reverse-biased zener diode maintains an almost constant potential difference across the load in breakdown.`,
      planSummary: "Explain reverse-biased Zener breakdown operation in a shunt regulator.",
    }),
  );

  items.push(
    makeQualMcq(ctx, {
      slug: "elec-semi-07",
      conceptId,
      kind,
      domain: "circuits",
      syllabi: elecTag(),
      difficulty: "standard",
      scenarioSpec: m1,
      requiredGivens: [],
      targetQuantityKey: "flybackDiodeRule",
      stem: "In the MOSFET driver diagram controlling an inductive relay coil, why is a reverse-biased protection diode D connected in parallel across the coil?",
      distractors: [
        {
          text: "It shorts out the supply rail whenever the MOSFET turns ON so the coil heats slowly.",
          rationale: "When the MOSFET is ON, the diode is reverse-biased and does not conduct.",
        },
        {
          text: "It rectifies AC mains power into DC to energise the relay coil.",
          rationale: "The circuit already runs from a DC supply.",
        },
        {
          text: "It limits the steady-state gate current entering the MOSFET gate terminal.",
          rationale: "The diode is wired across the inductive drain load, not at the gate.",
        },
      ],
      workedSolution: `When the MOSFET abruptly switches OFF, rapid collapse of magnetic flux induces a large back-emf across the coil; a reverse-biased diode across an inductive load provides a safe path for induced current preventing a damaging voltage spike.`,
      planSummary: "Explain the protective role of a flyback diode across an inductive MOSFET load.",
    }),
  );

  // 3 Multi-part structured
  const semiStructs = [
    {
      slug: "elec-semi-08",
      difficulty: "standard" as const,
      spec: {
        kind,
        mode: "zener-regulator",
        supplyVoltageV: 14.0,
        zenerVoltageV: 5.1,
        minZenerCurrentMa: 6.0,
        loadCurrentMa: 44.0,
        seriesResistorOhm: 178,
      },
    },
    {
      slug: "elec-semi-09",
      difficulty: "higher" as const,
      spec: {
        kind,
        mode: "zener-regulator",
        supplyVoltageV: 18.0,
        zenerVoltageV: 9.1,
        minZenerCurrentMa: 5.0,
        loadCurrentMa: 35.0,
        seriesResistorOhm: 220,
      },
    },
    {
      slug: "elec-semi-10",
      difficulty: "standard" as const,
      spec: {
        kind,
        mode: "photodiode-sensor",
        supplyVoltageV: 10.0,
        photodiodeCurrentUa: 52.0,
        senseResistorKohm: 100,
      },
    },
  ];

  for (const cfg of semiStructs) {
    const sp = cfg.spec;
    const q = solveKind(kind, sp);
    if (sp.mode === "zener-regulator") {
      const iSupStr = fmt3(q.actualSupplyCurrentMa as number, "mA");
      const izLoadStr = fmt3(q.zenerCurrentLoadedMa as number, "mA");
      const pzStr = fmt3(q.worstCaseZenerPowerMw as number, "mW");
      items.push(
        makeStructured(ctx, {
          slug: cfg.slug,
          conceptId,
          kind,
          domain: "circuits",
          syllabi: elecTag(),
          difficulty: cfg.difficulty,
          scenarioSpec: sp,
          hiddenQuantities: [
            "actualSupplyCurrentMa",
            "zenerCurrentLoadedMa",
            "worstCaseZenerPowerMw",
          ],
          requiredGivens: [
            { name: "supplyVoltageV", value: sp.supplyVoltageV, unit: "V", source: "either" },
            { name: "zenerVoltageV", value: sp.zenerVoltageV!, unit: "V", source: "either" },
            { name: "loadCurrentMa", value: sp.loadCurrentMa!, unit: "mA", source: "stem" },
            { name: "seriesResistorOhm", value: sp.seriesResistorOhm!, unit: "Ω", source: "either" },
          ],
          stem: `A voltage-reference regulator connects a ${fmt3(sp.zenerVoltageV!, "V")} Zener diode and load in parallel via a ${sp.seriesResistorOhm} Ω series resistor across a ${fmt3(sp.supplyVoltageV, "V")} DC supply. Under normal operation the load draws ${fmt3(sp.loadCurrentMa!, "mA")}.`,
          parts: [
            {
              partId: "a",
              prompt: "Calculate the total current flowing through the series resistor in mA.",
              marks: 2,
              targetQuantityKey: "actualSupplyCurrentMa",
              expectedAnswer: iSupStr,
              workingSteps: [
                `$V_{R} = V_{\\mathrm{s}} - V_{\\mathrm{Z}} = ${fmt3(sp.supplyVoltageV - sp.zenerVoltageV!, "V")}$.`,
                `$I_{\\mathrm{s}} = \\frac{V_{\\mathrm{s}} - V_{\\mathrm{Z}}}{R_{\\mathrm{s}}} = ${iSupStr}$.`,
              ],
            },
            {
              partId: "b",
              prompt: "Calculate the current flowing through the Zener diode while the load is connected.",
              marks: 2,
              dependsOnPartIds: ["a"],
              targetQuantityKey: "zenerCurrentLoadedMa",
              expectedAnswer: izLoadStr,
              workingSteps: [
                `By Kirchhoff's first law, $I_{\\mathrm{Z}} = I_{\\mathrm{s}} - I_{\\mathrm{L}} = ${izLoadStr}$.`,
              ],
            },
            {
              partId: "c",
              prompt: "Calculate the maximum power dissipated by the Zener diode if the load is suddenly unplugged.",
              marks: 2,
              dependsOnPartIds: ["a"],
              targetQuantityKey: "worstCaseZenerPowerMw",
              expectedAnswer: pzStr,
              workingSteps: [
                `When $I_{\\mathrm{L}} = 0$, the entire supply current ${iSupStr} passes through the Zener diode.`,
                `$P_{\\mathrm{Z,max}} = V_{\\mathrm{Z}} I_{\\mathrm{s}} = ${pzStr}$.`,
              ],
            },
          ],
          workedSolution: `(a) $I_{\\mathrm{s}} = ${iSupStr}$. (b) $I_{\\mathrm{Z}} = ${izLoadStr}$. (c) No-load worst-case Zener power $P_{\\mathrm{Z,max}} = ${pzStr}$.`,
          markScheme: [
            { code: "M1", criterion: "Finds voltage across $R_{\\mathrm{s}}$ as $V_{\\mathrm{s}} - V_{\\mathrm{Z}}$ and divides by $R_{\\mathrm{s}}$.", marks: 1, partId: "a" },
            { code: "A1", criterion: `Obtains $I_{\\mathrm{s}} = ${iSupStr}$.`, marks: 1, partId: "a" },
            { code: "M1", criterion: "Applies $I_{\\mathrm{Z}} = I_{\\mathrm{s}} - I_{\\mathrm{L}}$.", marks: 1, partId: "b" },
            { code: "A1", criterion: `Obtains $I_{\\mathrm{Z}} = ${izLoadStr}$.`, marks: 1, partId: "b" },
            { code: "M1", criterion: "Recognises $I_{\\mathrm{Z,max}} = I_{\\mathrm{s}}$ when $I_{\\mathrm{L}} = 0$ and uses $P = I V_{\\mathrm{Z}}$.", marks: 1, partId: "c" },
            { code: "A1", criterion: `Obtains $P_{\\mathrm{Z,max}} = ${pzStr}$.`, marks: 1, partId: "c" },
          ],
          planSummary: "Zener regulator current distribution and worst-case no-load power analysis.",
        }),
      );
    } else {
      const vrStr = fmt3(q.senseResistorVoltageV as number, "V");
      const vdStr = fmt3(q.photodiodeVoltageV as number, "V");
      items.push(
        makeStructured(ctx, {
          slug: cfg.slug,
          conceptId,
          kind,
          domain: "circuits",
          syllabi: elecTag(),
          difficulty: cfg.difficulty,
          scenarioSpec: sp,
          hiddenQuantities: [
            "senseResistorVoltageV",
            "photodiodeVoltageV",
            "photodiodeBiasRule",
          ],
          requiredGivens: [
            { name: "supplyVoltageV", value: sp.supplyVoltageV, unit: "V", source: "either" },
            { name: "photodiodeCurrentUa", value: sp.photodiodeCurrentUa!, unit: "μA", source: "stem" },
            { name: "senseResistorKohm", value: sp.senseResistorKohm!, unit: "kΩ", source: "either" },
          ],
          stem: `An optical-fibre receiver places a reverse-biased photodiode in series with a ${sp.senseResistorKohm} kΩ resistor across a ${fmt3(sp.supplyVoltageV, "V")} rail. When illuminated, the reverse photocurrent is ${fmt3(sp.photodiodeCurrentUa!, "μA")}.`,
          parts: [
            {
              partId: "a",
              prompt: "Calculate the output voltage developed across the sensing resistor.",
              marks: 2,
              targetQuantityKey: "senseResistorVoltageV",
              expectedAnswer: vrStr,
              workingSteps: [
                `$V_{\\mathrm{out}} = I_{\\mathrm{p}} R = (${sp.photodiodeCurrentUa} \\times 10^{-6})(${sp.senseResistorKohm} \\times 10^3) = ${vrStr}$.`,
              ],
            },
            {
              partId: "b",
              prompt: "Calculate the potential difference across the photodiode.",
              marks: 2,
              dependsOnPartIds: ["a"],
              targetQuantityKey: "photodiodeVoltageV",
              expectedAnswer: vdStr,
              workingSteps: [
                `$V_{\\mathrm{D}} = V_{\\mathrm{s}} - V_{\\mathrm{out}} = ${fmt3(sp.supplyVoltageV)} - ${fmt3(q.senseResistorVoltageV as number)} = ${vdStr}$.`,
              ],
            },
            {
              partId: "c",
              prompt: "Explain why the photodiode is operated in reverse bias rather than forward bias for high-speed light sensing.",
              marks: 2,
              targetMode: "qualitative",
              targetQuantityKey: "photodiodeBiasRule",
              expectedAnswer:
                "A reverse-biased photodiode produces a photocurrent directly proportional to incident light intensity with a fast response.",
              workingSteps: [
                "In reverse bias, dark current is negligible and photogenerated carriers are swept rapidly across the wide depletion region.",
                "Consequently, the reverse-biased photodiode produces a photocurrent directly proportional to incident light intensity.",
              ],
            },
          ],
          workedSolution: `(a) $V_{\\mathrm{out}} = ${vrStr}$. (b) $V_{\\mathrm{D}} = ${vdStr}$. (c) A reverse-biased photodiode produces a photocurrent directly proportional to incident light intensity.`,
          markScheme: [
            { code: "M1", criterion: "Applies $V = I_{\\mathrm{p}} R$ with correct $\\mu\\text{A}$ and $\\text{k}\\Omega$ prefixes.", marks: 1, partId: "a" },
            { code: "A1", criterion: `Obtains $V_{\\mathrm{out}} = ${vrStr}$.`, marks: 1, partId: "a" },
            { code: "M1", criterion: "Applies $V_{\\mathrm{D}} = V_{\\mathrm{s}} - V_{\\mathrm{out}}$.", marks: 1, partId: "b" },
            { code: "A1", criterion: `Obtains $V_{\\mathrm{D}} = ${vdStr}$.`, marks: 1, partId: "b" },
            { code: "B1", criterion: "States that photocurrent in reverse bias is directly proportional to light intensity.", marks: 1, partId: "c" },
            { code: "B1", criterion: "Notes negligible dark current or faster response across the reverse-biased depletion layer.", marks: 1, partId: "c" },
          ],
          planSummary: "Photodiode sensing divider voltages and reverse-bias photoconductive linearity.",
        }),
      );
    }
  }

  // 2 × Authentic 6-mark LoRs for Plugin 7
  items.push(
    makeLor6(ctx, {
      slug: "elec-semi-11",
      conceptId,
      kind,
      domain: "circuits",
      syllabi: elecTag(),
      difficulty: "higher",
      scenarioSpec: m1,
      requiredGivens: [],
      targetQuantityKey: "threeStageLorAnchor",
      stem: "An automated greenhouse cooling fan is controlled by a three-stage electronic circuit: (1) a Zener-stabilised reference divider and thermistor divider, (2) an op-amp comparator, and (3) an N-channel enhancement MOSFET switching the 12 V DC fan motor with a parallel diode.",
      prompt:
        "Explain the role of each stage in the circuit and the key electrical properties of the Zener diode, comparator, MOSFET, and parallel protection diode that allow reliable automatic fan operation.",
      expectedAnswer:
        "In this three-stage controller, a zener diode sets a stable reference potential comparator compares sensor voltage and mosfet switches high load current without loading the op-amp. Specifically, the reverse-biased Zener diode operates in breakdown to hold the reference input steady even if the battery supply fluctuates, while the thermistor divider produces a temperature-dependent voltage. The open-loop op-amp comparator drives its output sharply to positive saturation whenever the temperature voltage exceeds the reference, avoiding half-on linear dissipation in the switch. Because the enhancement MOSFET has an insulated silicon dioxide gate with virtually infinite input resistance, it draws negligible gate current from the op-amp and switches ON sharply once gate-source voltage exceeds threshold to supply high drain current to the fan; finally, the reverse-biased flyback diode across the inductive motor provides a safe path for induced current when switching OFF, protecting the MOSFET from high-voltage back-emf spikes.",
      workingSteps: [
        "L1: Identify Stage 1 (Zener reference + sensor divider), Stage 2 (op-amp comparator), and Stage 3 (MOSFET switch + protection diode).",
        "L1: State that the Zener diode is reverse-biased in breakdown to keep the reference voltage constant despite supply drift.",
        "L2: Explain that the op-amp comparator switches rapidly between saturation rails when $V_+ > V_-$ so the MOSFET switches cleanly.",
        "L2: Explain that the MOSFET conducts large motor current once $V_{\\mathrm{GS}} > V_{\\mathrm{th}}$.",
        "L3: Highlight that the insulated gate gives ultra-high input resistance so the MOSFET does not load the op-amp output.",
        "L3: Explain the reverse-biased flyback diode safely dissipating inductive back-emf current at turn-off to protect the MOSFET.",
      ],
      levelCriteria: [
        "Explains that the reverse-biased Zener diode operates in breakdown to provide a stable reference voltage independent of supply variations.",
        "Explains how the sensor divider supplies a varying input voltage compared against the reference.",
        "Explains that the op-amp comparator switches sharply to saturation when the threshold temperature is crossed.",
        "States that the MOSFET turns ON when $V_{\\mathrm{GS}} > V_{\\mathrm{th}}$ to handle high motor load current.",
        "Explains that the MOSFET's insulated gate provides virtually infinite input resistance so negligible current is drawn from the op-amp.",
        "Explains that the reverse-biased protection diode across the inductive motor safely conducts induced back-emf current at turn-off.",
      ],
      workedSolution:
        "A zener diode sets a stable reference potential comparator compares sensor voltage and mosfet switches high load current without loading the op-amp. Zener breakdown stabilises the reference, the comparator gives sharp saturated switching, the insulated-gate MOSFET carries high drain current once $V_{\\mathrm{GS}} > V_{\\mathrm{th}}$, and the parallel flyback diode clamps inductive turn-off spikes.",
      planSummary: "Extended level of response synthesis of a three-stage Zener, comparator, and MOSFET motor controller.",
    }),
  );

  items.push(
    makeLor6(ctx, {
      slug: "elec-semi-12",
      conceptId,
      kind,
      domain: "circuits",
      syllabi: elecTag(),
      difficulty: "higher",
      scenarioSpec: z2,
      requiredGivens: [],
      targetQuantityKey: "zenerBreakdownRule",
      stem: "A technician designs a Zener diode shunt regulator from an unregulated battery pack whose voltage varies between 11 V and 15 V while supplying a variable laboratory load.",
      prompt:
        "Explain how the Zener shunt regulator maintains a nearly constant load potential difference despite variations in both supply voltage and load current, and explain the design constraints that govern choosing the series resistor $R_{\\mathrm{s}}$ and the Zener diode power rating.",
      expectedAnswer:
        "Connected in reverse bias past its breakdown knee, a reverse-biased zener diode maintains an almost constant potential difference across the load in breakdown because small voltage changes correspond to large changes in Zener current. When supply voltage rises or load current falls, excess current is diverted through the Zener diode, increasing the voltage drop across the series resistor $R_{\\mathrm{s}}$ so the output stays clamped near $V_{\\mathrm{Z}}$. To guarantee regulation even at minimum supply voltage and maximum load current, $R_{\\mathrm{s}}$ must be small enough that $I_{\\mathrm{Z}}$ never drops below the minimum knee holding current (around 5 mA). Conversely, $R_{\\mathrm{s}}$ must be large enough that at maximum supply voltage and zero load current (when all current flows through the Zener), the worst-case power dissipation $P_{\\mathrm{Z}} = I_{\\mathrm{Z,max}} V_{\\mathrm{Z}}$ stays safely below the diode's maximum power rating.",
      workingSteps: [
        "L1: State that the Zener diode is connected in reverse bias in parallel with the load, fed via series resistor $R_{\\mathrm{s}}$.",
        "L1: Note that in reverse breakdown the $I$–$V$ curve is almost vertical so $V_{\\mathrm{Z}}$ stays nearly constant.",
        "L2: Explain response to supply voltage rise: extra current flows through $R_{\\mathrm{s}}$ and Zener, dropping the excess voltage across $R_{\\mathrm{s}}$.",
        "L2: Explain response to load current variation: $I_{\\mathrm{Z}} + I_{\\mathrm{L}}$ stays fixed while supply is steady, so $I_{\\mathrm{Z}}$ adjusts oppositely to $I_{\\mathrm{L}}$.",
        "L3: Derive upper bound on $R_{\\mathrm{s}}$ at minimum $V_{\\mathrm{s}}$ and maximum $I_{\\mathrm{L}}$ so $I_{\\mathrm{Z}} \\ge I_{\\mathrm{Z,min}}$.",
        "L3: Identify worst-case Zener power dissipation $P_{\\mathrm{Z}} = V_{\\mathrm{Z}} I_{\\mathrm{Z,max}}$ at maximum $V_{\\mathrm{s}}$ and disconnected load ($I_{\\mathrm{L}} = 0$).",
      ],
      levelCriteria: [
        "States that the Zener diode operates in reverse breakdown across the load with a nearly vertical $I$–$V$ knee.",
        "Explains that supply voltage rises are absorbed as increased voltage drop across $R_{\\mathrm{s}}$ via higher Zener current.",
        "Explains that as load current decreases, Zener current increases by the same amount to keep $I_{\\mathrm{s}}$ and $V_{\\mathrm{out}}$ steady.",
        "Explains that $R_{\\mathrm{s}}$ must be small enough to keep $I_{\\mathrm{Z}} \\ge I_{\\mathrm{Z,min}}$ at lowest supply voltage and maximum load current.",
        "Identifies worst-case Zener dissipation occurring at highest supply voltage with the load disconnected ($I_{\\mathrm{L}} = 0$).",
        "States that the Zener power rating must exceed $V_{\\mathrm{Z}} I_{\\mathrm{Z,max}}$ to prevent thermal destruction.",
      ],
      workedSolution:
        "A reverse-biased zener diode maintains an almost constant potential difference across the load in breakdown. Changes in supply voltage or load current shift $I_{\\mathrm{Z}}$ so $R_{\\mathrm{s}}$ absorbs excess voltage; $R_{\\mathrm{s}}$ is bounded above by maintaining $I_{\\mathrm{Z}} \\ge I_{\\mathrm{Z,min}}$ at lowest $V_{\\mathrm{s}}$ / highest $I_{\\mathrm{L}}$ and bounded below by preventing $P_{\\mathrm{Z}} = V_{\\mathrm{Z}} I_{\\mathrm{Z,max}}$ from exceeding the diode rating at highest $V_{\\mathrm{s}}$ / zero load.",
      planSummary: "Extended level of response engineering design and regulation physics of a Zener shunt regulator.",
    }),
  );

  return items;
}

/* ========================================================================== */
/*  8. Plugin 8: al-opt-elec-opamp-inverting-noninv (12 items)                */
/* ========================================================================== */

function buildOpampInvNoninvItems(ctx: BuildContext): CandidateQuestionInput[] {
  const kind = "al-opt-elec-opamp-inverting-noninv";
  const conceptId = "kirchhoff-dc-circuits";
  const items: CandidateQuestionInput[] = [];

  const o1 = {
    kind,
    mode: "inverting",
    rInKohm: 12,
    rFeedbackKohm: 150,
    vInMv: 400,
    vSatV: 13.0,
    gbpHz: 1.0e6,
  };
  const qo1 = solveKind(kind, o1);
  items.push(
    makeCalcMcq(ctx, {
      slug: "elec-oa-01",
      conceptId,
      kind,
      domain: "circuits",
      syllabi: elecTag(),
      difficulty: "foundation",
      scenarioSpec: o1,
      requiredGivens: [
        { name: "rInKohm", value: 12, unit: "kΩ", source: "either" },
        { name: "rFeedbackKohm", value: 150, unit: "kΩ", source: "either" },
        { name: "vInMv", value: 400, unit: "mV", source: "stem" },
        { name: "vSatV", value: 13.0, unit: "V", source: "either" },
      ],
      targetQuantityKey: "clampedVOutV",
      unit: "V",
      stem: "An inverting op-amp powered by $\\pm 13.0\\text{ V}$ saturation rails uses $R_{\\mathrm{in}} = 12.0\\text{ k}\\Omega$ and $R_{\\mathrm{f}} = 150\\text{ k}\\Omega$. When an input potential of $+400\\text{ mV}$ is applied, calculate the output voltage $V_{\\mathrm{out}}$.",
      distractors: [
        {
          value: -(qo1.clampedVOutV as number),
          rationale: "Omits the phase-inverting minus sign in $G = -R_{\\mathrm{f}}/R_{\\mathrm{in}}$.",
        },
        {
          value: -(1 + 150 / 12) * 0.4,
          rationale: "Applies the non-inverting formula $1 + R_{\\mathrm{f}}/R_1$ to an inverting circuit.",
        },
        {
          value: -13.0,
          rationale: "Assumes the amplifier saturates even though $|-5.00\\text{ V}| < 13.0\\text{ V}$.",
        },
      ],
      workedSolution: `Closed-loop gain $G = -\\frac{R_{\\mathrm{f}}}{R_{\\mathrm{in}}} = -\\frac{150}{12.0} = -12.5$. Hence $V_{\\mathrm{out}} = -12.5 \\times 0.400\\text{ V} = ${fmt3(qo1.clampedVOutV as number, "V")}$, which lies safely within $\\pm 13.0\\text{ V}$.`,
      markCriterion: `Output voltage equals ${fmt3(qo1.clampedVOutV as number, "V")}.`,
      planSummary: "Compute unsaturated inverting operational amplifier output voltage with sign.",
    }),
  );

  const o2 = {
    kind,
    mode: "inverting",
    rInKohm: 5,
    rFeedbackKohm: 100,
    vInMv: 900,
    vSatV: 12.5,
    gbpHz: 1.0e6,
  };
  const qo2 = solveKind(kind, o2);
  items.push(
    makeCalcMcq(ctx, {
      slug: "elec-oa-02",
      conceptId,
      kind,
      domain: "circuits",
      syllabi: elecTag(),
      difficulty: "standard",
      scenarioSpec: o2,
      requiredGivens: [
        { name: "rInKohm", value: 5, unit: "kΩ", source: "either" },
        { name: "rFeedbackKohm", value: 100, unit: "kΩ", source: "either" },
        { name: "vInMv", value: 900, unit: "mV", source: "stem" },
        { name: "vSatV", value: 12.5, unit: "V", source: "either" },
      ],
      targetQuantityKey: "clampedVOutV",
      unit: "V",
      stem: "An inverting op-amp has $R_{\\mathrm{in}} = 5.00\\text{ k}\\Omega$, $R_{\\mathrm{f}} = 100\\text{ k}\\Omega$, and saturation voltage $\\pm 12.5\\text{ V}$. An input of $+900\\text{ mV}$ is connected. What is the actual output voltage $V_{\\mathrm{out}}$?",
      distractors: [
        {
          value: qo2.idealVOutV as number,
          rationale: "Calculates $-20 \\times 0.900 = -18.0\\text{ V}$ without clamping at the $-12.5\\text{ V}$ saturation limit.",
        },
        {
          value: 12.5,
          rationale: "Clamps to the positive rail instead of the negative rail for a positive inverting input.",
        },
        {
          value: -(qo2.idealVOutV as number),
          rationale: "Omits both the inversion sign and rail clamping.",
        },
      ],
      workedSolution: `Ideal output $= -\\frac{100}{5.00} \\times 0.900\\text{ V} = -18.0\\text{ V}$. Because $|-18.0\\text{ V}| > 12.5\\text{ V}$, the op-amp saturates and clamps strictly at $V_{\\mathrm{out}} = ${fmt3(qo2.clampedVOutV as number, "V")}$.`,
      markCriterion: `Clamped output voltage equals ${fmt3(qo2.clampedVOutV as number, "V")}.`,
      planSummary: "Enforce strict saturation rail clamping when ideal op-amp output exceeds V_sat.",
    }),
  );

  const o3 = {
    kind,
    mode: "non-inverting",
    rInKohm: 8,
    rFeedbackKohm: 72,
    vInMv: 750,
    vSatV: 14.0,
    gbpHz: 1.5e6,
  };
  const qo3 = solveKind(kind, o3);
  items.push(
    makeCalcMcq(ctx, {
      slug: "elec-oa-03",
      conceptId,
      kind,
      domain: "circuits",
      syllabi: elecTag(),
      difficulty: "foundation",
      scenarioSpec: o3,
      requiredGivens: [
        { name: "rInKohm", value: 8, unit: "kΩ", source: "either" },
        { name: "rFeedbackKohm", value: 72, unit: "kΩ", source: "either" },
        { name: "vInMv", value: 750, unit: "mV", source: "stem" },
        { name: "vSatV", value: 14.0, unit: "V", source: "either" },
      ],
      targetQuantityKey: "clampedVOutV",
      unit: "V",
      stem: "A non-inverting amplifier uses $R_1 = 8.00\\text{ k}\\Omega$ to 0 V and feedback resistor $R_{\\mathrm{f}} = 72.0\\text{ k}\\Omega$ with saturation limits $\\pm 14.0\\text{ V}$. Calculate the output voltage when $V_{\\mathrm{in}} = +750\\text{ mV}$.",
      distractors: [
        {
          value: (72 / 8) * 0.75,
          rationale: "Uses $R_{\\mathrm{f}}/R_1$ instead of $1 + R_{\\mathrm{f}}/R_1$ for a non-inverting amplifier.",
        },
        {
          value: -(qo3.clampedVOutV as number),
          rationale: "Applies an inverting minus sign to a non-inverting circuit.",
        },
        {
          value: (1 + 8 / 72) * 0.75,
          rationale: "Inverts the resistor ratio to $1 + R_1/R_{\\mathrm{f}}$.",
        },
      ],
      workedSolution: `Non-inverting gain $G = 1 + \\frac{R_{\\mathrm{f}}}{R_1} = 1 + \\frac{72.0}{8.00} = 10.0$. Thus $V_{\\mathrm{out}} = 10.0 \\times 0.750\\text{ V} = ${fmt3(qo3.clampedVOutV as number, "V")}$.`,
      markCriterion: `Output voltage equals ${fmt3(qo3.clampedVOutV as number, "V")}.`,
      planSummary: "Compute non-inverting amplifier voltage gain and output voltage.",
    }),
  );

  const o4 = {
    kind,
    mode: "non-inverting",
    rInKohm: 4,
    rFeedbackKohm: 96,
    vInMv: 300,
    vSatV: 12.0,
    gbpHz: 1.5e6,
  };
  const qo4 = solveKind(kind, o4);
  items.push(
    makeCalcMcq(ctx, {
      slug: "elec-oa-04",
      conceptId,
      kind,
      domain: "circuits",
      syllabi: elecTag(),
      difficulty: "standard",
      scenarioSpec: o4,
      requiredGivens: [
        { name: "rInKohm", value: 4, unit: "kΩ", source: "either" },
        { name: "rFeedbackKohm", value: 96, unit: "kΩ", source: "either" },
        { name: "gbpHz", value: 1.5e6, unit: "Hz", source: "stem" },
      ],
      targetQuantityKey: "bandwidthKhz",
      unit: "kHz",
      stem: "An audio preamplifier op-amp has a gain–bandwidth product (GBP) of 1.50 MHz and is configured as a non-inverting amplifier with $R_1 = 4.00\\text{ k}\\Omega$ and $R_{\\mathrm{f}} = 96.0\\text{ k}\\Omega$. Calculate its available closed-loop bandwidth in kHz.",
      distractors: [
        {
          value: 1500 / (96 / 4),
          rationale: "Divides GBP by $R_{\\mathrm{f}}/R_1 = 24$ instead of $1 + R_{\\mathrm{f}}/R_1 = 25$.",
        },
        {
          value: 1500 * 25,
          rationale: "Multiplies GBP by gain instead of dividing.",
        },
        {
          value: 1500 / Math.sqrt(25),
          rationale: "Divides by $\\sqrt{G}$ instead of $G$.",
        },
      ],
      workedSolution: `Closed-loop gain $G = 1 + \\frac{96.0}{4.00} = 25.0$. Using $G \\times \\mathrm{BW} = \\mathrm{GBP}$, $\\mathrm{BW} = \\frac{1.50 \\times 10^6}{25.0} = 60\\,000\\text{ Hz} = ${fmt3(qo4.bandwidthKhz as number, "kHz")}$.`,
      markCriterion: `Available bandwidth equals ${fmt3(qo4.bandwidthKhz as number, "kHz")}.`,
      planSummary: "Apply Gain-Bandwidth Product to determine closed-loop amplifier bandwidth.",
    }),
  );

  const o5 = {
    kind,
    mode: "inverting",
    rInKohm: 10,
    rFeedbackKohm: 250,
    vInMv: 200,
    vSatV: 13.5,
    gbpHz: 2.0e6,
  };
  const qo5 = solveKind(kind, o5);
  items.push(
    makeCalcMcq(ctx, {
      slug: "elec-oa-05",
      conceptId,
      kind,
      domain: "circuits",
      syllabi: elecTag(),
      difficulty: "higher",
      scenarioSpec: o5,
      requiredGivens: [
        { name: "rInKohm", value: 10, unit: "kΩ", source: "either" },
        { name: "rFeedbackKohm", value: 250, unit: "kΩ", source: "either" },
        { name: "vSatV", value: 13.5, unit: "V", source: "either" },
      ],
      targetQuantityKey: "maxUnsaturatedVInMv",
      unit: "mV",
      stem: "An inverting ECG amplifier uses $R_{\\mathrm{in}} = 10.0\\text{ k}\\Omega$, $R_{\\mathrm{f}} = 250\\text{ k}\\Omega$, and clips at $\\pm 13.5\\text{ V}$. What is the maximum input signal amplitude in mV that can be amplified without clipping?",
      distractors: [
        {
          value: (13.5 / 26) * 1e3,
          rationale: "Uses non-inverting gain $26$ instead of inverting gain magnitude $25$.",
        },
        {
          value: 13.5 * 25,
          rationale: "Multiplies saturation voltage by gain instead of dividing.",
        },
        {
          value: (13.5 / 25) * 100,
          rationale: "Applies an erroneous factor of 100 instead of 1000 when converting V to mV.",
        },
      ],
      workedSolution: `Gain magnitude $|G| = \\frac{250}{10.0} = 25.0$. Maximum unsaturated input $|V_{\\mathrm{in,max}}| = \\frac{V_{\\mathrm{sat}}}{|G|} = \\frac{13.5}{25.0} = 0.540\\text{ V} = ${fmt3(qo5.maxUnsaturatedVInMv as number, "mV")}$.`,
      markCriterion: `Maximum unsaturated input amplitude equals ${fmt3(qo5.maxUnsaturatedVInMv as number, "mV")}.`,
      planSummary: "Find maximum unsaturated input amplitude before op-amp clipping occurs.",
    }),
  );

  // 3 Pure Qualitative MCQs
  items.push(
    makeQualMcq(ctx, {
      slug: "elec-oa-06",
      conceptId,
      kind,
      domain: "circuits",
      syllabi: elecTag(),
      difficulty: "foundation",
      scenarioSpec: o1,
      requiredGivens: [],
      targetQuantityKey: "virtualEarthRule",
      stem: "In an inverting op-amp with its non-inverting pin grounded, why is junction X at the inverting input termed a 'virtual earth'?",
      distractors: [
        {
          text: "Junction X is physically shorted to the 0 V rail through an internal wire inside the op-amp.",
          rationale: "No physical earth wire exists; input resistance is very high so negligible current enters the pin.",
        },
        {
          text: "Junction X stays at 0 V even after the output voltage saturates at the supply rail.",
          rationale: "Virtual earth holds strictly while unsaturated; saturation breaks negative feedback.",
        },
        {
          text: "Feedback resistor forces zero current to flow through the input resistor $R_{\\mathrm{in}}$.",
          rationale: "Current $V_{\\mathrm{in}}/R_{\\mathrm{in}}$ flows through $R_{\\mathrm{in}}$ and continues through $R_{\\mathrm{f}}$.",
        },
      ],
      workedSolution: `From $V_{\\mathrm{out}} = A_{\\mathrm{OL}}(V_+ - V_-)$ with $V_+ = 0$, the inverting input remains very close to zero volts while the op-amp is unsaturated because open-loop gain is very large.`,
      planSummary: "Explain the virtual-earth approximation and its unsaturation boundary condition.",
    }),
  );

  items.push(
    makeQualMcq(ctx, {
      slug: "elec-oa-07",
      conceptId,
      kind,
      domain: "circuits",
      syllabi: elecTag(),
      difficulty: "foundation",
      questionStyle: "definition",
      scenarioSpec: o3,
      requiredGivens: [],
      targetQuantityKey: "idealOpAmpRule",
      stem: "Which set of characteristics accurately defines an ideal operational amplifier?",
      distractors: [
        {
          text: "Zero open-loop voltage gain, zero input resistance, and infinite output resistance.",
          rationale: "Reverses all three ideal op-amp limits.",
        },
        {
          text: "Finite constant voltage gain, zero input resistance, and zero output resistance.",
          rationale: "An ideal op-amp has infinite input resistance and infinite open-loop gain.",
        },
        {
          text: "Infinite open-loop voltage gain, infinite output resistance, and zero bandwidth.",
          rationale: "An ideal op-amp has zero output resistance and infinite bandwidth.",
        },
      ],
      workedSolution: `An ideal operational amplifier has infinite open-loop voltage gain infinite input resistance and zero output resistance (plus infinite bandwidth).`,
      planSummary: "Verify defining ideal operational amplifier properties.",
    }),
  );

  items.push(
    makeQualMcq(ctx, {
      slug: "elec-oa-08",
      conceptId,
      kind,
      domain: "circuits",
      syllabi: elecTag(),
      difficulty: "standard",
      scenarioSpec: o4,
      requiredGivens: [],
      targetQuantityKey: "gbpTradeoffRule",
      stem: "An audio engineer increases the feedback resistor $R_{\\mathrm{f}}$ of a real op-amp stage to boost voltage gain while leaving the op-amp IC unchanged. How does this alter the frequency response?",
      distractors: [
        {
          text: "Increasing closed-loop voltage gain widens the available bandwidth proportionally.",
          rationale: "Bandwidth is inversely proportional to closed-loop gain, not directly proportional.",
        },
        {
          text: "Available bandwidth remains completely unchanged because bandwidth depends only on supply voltage.",
          rationale: "Supply voltage sets saturation amplitude, whereas GBP fixes $G \\times \\mathrm{BW}$.",
        },
        {
          text: "Gain–bandwidth product doubles whenever the feedback resistor doubles.",
          rationale: "GBP is an intrinsic constant of the op-amp IC.",
        },
      ],
      workedSolution: `Because $G \\times \\mathrm{BW} = \\mathrm{GBP} = \\text{constant}$, increasing closed-loop voltage gain reduces available bandwidth because gain times bandwidth is constant.`,
      planSummary: "Evaluate gain versus bandwidth trade-off under fixed GBP.",
    }),
  );

  // 4 Multi-part structured
  const oaStructs = [
    {
      slug: "elec-oa-09",
      difficulty: "standard" as const,
      spec: {
        kind,
        mode: "inverting",
        rInKohm: 10,
        rFeedbackKohm: 160,
        vInMv: 500,
        vSatV: 13.0,
        gbpHz: 1.6e6,
      },
    },
    {
      slug: "elec-oa-10",
      difficulty: "higher" as const,
      spec: {
        kind,
        mode: "inverting",
        rInKohm: 8,
        rFeedbackKohm: 200,
        vInMv: 700,
        vSatV: 12.0,
        gbpHz: 2.0e6,
      },
    },
    {
      slug: "elec-oa-11",
      difficulty: "standard" as const,
      spec: {
        kind,
        mode: "non-inverting",
        rInKohm: 6,
        rFeedbackKohm: 114,
        vInMv: 450,
        vSatV: 14.0,
        gbpHz: 1.8e6,
      },
    },
    {
      slug: "elec-oa-12",
      difficulty: "higher" as const,
      spec: {
        kind,
        mode: "non-inverting",
        rInKohm: 5,
        rFeedbackKohm: 195,
        vInMv: 450,
        vSatV: 12.5,
        gbpHz: 2.4e6,
      },
    },
  ];

  for (const cfg of oaStructs) {
    const sp = cfg.spec;
    const q = solveKind(kind, sp);
    const gStr = fmt3(q.closedLoopGain as number);
    const vOutStr = fmt3(q.clampedVOutV as number, "V");
    const bwStr = fmt3(q.bandwidthKhz as number, "kHz");
    const vMaxInStr = fmt3(q.maxUnsaturatedVInMv as number, "mV");
    const isInv = sp.mode === "inverting";

    items.push(
      makeStructured(ctx, {
        slug: cfg.slug,
        conceptId,
        kind,
        domain: "circuits",
        syllabi: elecTag(),
        difficulty: cfg.difficulty,
        scenarioSpec: sp,
        hiddenQuantities: [
          "closedLoopGain",
          "clampedVOutV",
          "bandwidthKhz",
          "maxUnsaturatedVInMv",
        ],
        requiredGivens: [
          { name: "rInKohm", value: sp.rInKohm, unit: "kΩ", source: "either" },
          { name: "rFeedbackKohm", value: sp.rFeedbackKohm, unit: "kΩ", source: "either" },
          { name: "vInMv", value: sp.vInMv, unit: "mV", source: "stem" },
          { name: "vSatV", value: sp.vSatV, unit: "V", source: "either" },
          { name: "gbpHz", value: sp.gbpHz, unit: "Hz", source: "stem" },
        ],
        stem: `The diagram shows a ${sp.mode} op-amp stage built with ${isInv ? `$R_{\\mathrm{in}} = ${fmt3(sp.rInKohm, "kΩ")}$` : `$R_1 = ${fmt3(sp.rInKohm, "kΩ")}$`} and $R_{\\mathrm{f}} = ${fmt3(sp.rFeedbackKohm, "kΩ")}$. The op-amp has saturation rails $\\pm ${fmt3(sp.vSatV, "V")}$ and a gain–bandwidth product of ${fmt3(sp.gbpHz / 1e6, "MHz")}. An input signal of $+${fmt3(sp.vInMv, "mV")}$ is applied.`,
        parts: [
          {
            partId: "a",
            prompt: "Calculate the closed-loop voltage gain of the amplifier (including its sign).",
            marks: 2,
            targetQuantityKey: "closedLoopGain",
            expectedAnswer: gStr,
            workingSteps: [
              isInv
                ? `$G = -\\frac{R_{\\mathrm{f}}}{R_{\\mathrm{in}}} = -\\frac{${sp.rFeedbackKohm}}{${sp.rInKohm}} = ${gStr}$.`
                : `$G = 1 + \\frac{R_{\\mathrm{f}}}{R_1} = 1 + \\frac{${sp.rFeedbackKohm}}{${sp.rInKohm}} = ${gStr}$.`,
            ],
          },
          {
            partId: "b",
            prompt: "Determine the actual output voltage $V_{\\mathrm{out}}$, taking saturation into account.",
            marks: 2,
            dependsOnPartIds: ["a"],
            targetQuantityKey: "clampedVOutV",
            expectedAnswer: vOutStr,
            workingSteps: [
              `Ideal $V_{\\mathrm{out}} = G V_{\\mathrm{in}} = ${fmt3(q.idealVOutV as number, "V")}$.`,
              q.isSaturated
                ? `Since $|V_{\\mathrm{out,ideal}}| > ${fmt3(sp.vSatV, "V")}$, the output clips at $V_{\\mathrm{out}} = ${vOutStr}$.`
                : `Within $\\pm ${fmt3(sp.vSatV, "V")}$ rails, so $V_{\\mathrm{out}} = ${vOutStr}$.`,
            ],
          },
          {
            partId: "c",
            prompt: "Calculate the maximum input voltage amplitude (in mV) before the output begins to saturate.",
            marks: 2,
            dependsOnPartIds: ["a"],
            targetQuantityKey: "maxUnsaturatedVInMv",
            expectedAnswer: vMaxInStr,
            workingSteps: [
              `$V_{\\mathrm{in,max}} = \\frac{V_{\\mathrm{sat}}}{|G|} = ${vMaxInStr}$.`,
            ],
          },
          {
            partId: "d",
            prompt: "Calculate the closed-loop bandwidth of this amplifier stage in kHz.",
            marks: 2,
            dependsOnPartIds: ["a"],
            targetQuantityKey: "bandwidthKhz",
            expectedAnswer: bwStr,
            workingSteps: [
              `$\\mathrm{BW} = \\frac{\\mathrm{GBP}}{|G|} = \\frac{${fmt3(sp.gbpHz / 1e6, "MHz")}}{${fmt3(q.gainMagnitude as number)}} = ${bwStr}$.`,
            ],
          },
        ],
        workedSolution: `(a) $G = ${gStr}$. (b) $V_{\\mathrm{out}} = ${vOutStr}$. (c) Max unsaturated input $= ${vMaxInStr}$. (d) Bandwidth $= \\mathrm{GBP}/|G| = ${bwStr}$.`,
        markScheme: [
          { code: "M1", criterion: isInv ? "Uses $G = -R_{\\mathrm{f}}/R_{\\mathrm{in}}$." : "Uses $G = 1 + R_{\\mathrm{f}}/R_1$.", marks: 1, partId: "a" },
          { code: "A1", criterion: `Obtains $G = ${gStr}$.`, marks: 1, partId: "a" },
          { code: "M1", criterion: "Computes $G V_{\\mathrm{in}}$ and checks against $\\pm V_{\\mathrm{sat}}$.", marks: 1, partId: "b" },
          { code: "A1", criterion: `Obtains $V_{\\mathrm{out}} = ${vOutStr}$.`, marks: 1, partId: "b" },
          { code: "M1", criterion: "Applies $V_{\\mathrm{in,max}} = V_{\\mathrm{sat}}/|G|$.", marks: 1, partId: "c" },
          { code: "A1", criterion: `Obtains ${vMaxInStr}.`, marks: 1, partId: "c" },
          { code: "M1", criterion: "Applies $\\mathrm{BW} = \\mathrm{GBP}/|G|$.", marks: 1, partId: "d" },
          { code: "A1", criterion: `Obtains ${bwStr}.`, marks: 1, partId: "d" },
        ],
        planSummary: "Op-amp gain, saturation rail check, maximum unsaturated input, and GBP bandwidth.",
      }),
    );
  }

  return items;
}

/* ========================================================================== */
/*  9. Plugin 9: al-opt-elec-opamp-summing-diff (12 items)                    */
/* ========================================================================== */

function buildOpampSumDiffItems(ctx: BuildContext): CandidateQuestionInput[] {
  const kind = "al-opt-elec-opamp-summing-diff";
  const conceptId = "kirchhoff-dc-circuits";
  const items: CandidateQuestionInput[] = [];

  const sd1 = {
    kind,
    mode: "summing",
    rFeedbackKohm: 60,
    r1Kohm: 15,
    r2Kohm: 30,
    r3Kohm: 60,
    v1V: 1.2,
    v2V: 1.8,
    v3V: -0.6,
    vSatV: 12.0,
  };
  const qsd1 = solveKind(kind, sd1);
  items.push(
    makeCalcMcq(ctx, {
      slug: "elec-sd-01",
      conceptId,
      kind,
      domain: "circuits",
      syllabi: elecTag(),
      difficulty: "standard",
      scenarioSpec: sd1,
      requiredGivens: [
        { name: "rFeedbackKohm", value: 60, unit: "kΩ", source: "either" },
        { name: "r1Kohm", value: 15, unit: "kΩ", source: "either" },
        { name: "r2Kohm", value: 30, unit: "kΩ", source: "either" },
        { name: "r3Kohm", value: 60, unit: "kΩ", source: "either" },
        { name: "v1V", value: 1.2, unit: "V", source: "stem" },
        { name: "v2V", value: 1.8, unit: "V", source: "stem" },
        { name: "v3V", value: -0.6, unit: "V", source: "stem" },
        { name: "vSatV", value: 12.0, unit: "V", source: "either" },
      ],
      targetQuantityKey: "clampedVOutV",
      unit: "V",
      stem: "A three-channel audio mixer uses a summing op-amp ($\\pm 12.0\\text{ V}$ saturation) with $R_{\\mathrm{f}} = 60\\text{ k}\\Omega$, $R_1 = 15\\text{ k}\\Omega$, $R_2 = 30\\text{ k}\\Omega$, and $R_3 = 60\\text{ k}\\Omega$. When $V_1 = +1.20\\text{ V}$, $V_2 = +1.80\\text{ V}$, and $V_3 = -0.60\\text{ V}$, calculate $V_{\\mathrm{out}}$.",
      distractors: [
        {
          value: -(qsd1.clampedVOutV as number),
          rationale: "Omits the inverting minus sign in the summing amplifier equation.",
        },
        {
          value: -60 * (1.2 / 15 + 1.8 / 30 + 0.6 / 60),
          rationale: "Treats $V_3 = -0.60\\text{ V}$ as positive instead of negative.",
        },
        {
          value: -(1.2 + 1.8 - 0.6),
          rationale: "Adds the input voltages directly without weighting by $R_{\\mathrm{f}}/R_i$.",
        },
      ],
      workedSolution: `Using virtual-earth KCL: $V_{\\mathrm{out}} = -R_{\\mathrm{f}}\\left(\\frac{V_1}{R_1} + \\frac{V_2}{R_2} + \\frac{V_3}{R_3}\\right) = -60\\left(\\frac{1.20}{15} + \\frac{1.80}{30} + \\frac{-0.60}{60}\\right) = -60(0.08 + 0.06 - 0.01) = ${fmt3(qsd1.clampedVOutV as number, "V")}$.`,
      markCriterion: `Summing amplifier output equals ${fmt3(qsd1.clampedVOutV as number, "V")}.`,
      planSummary: "Compute weighted three-input summing amplifier output via virtual-earth KCL.",
    }),
  );

  const sd2 = {
    kind,
    mode: "summing",
    rFeedbackKohm: 80,
    r1Kohm: 10,
    r2Kohm: 20,
    r3Kohm: 0,
    v1V: 1.5,
    v2V: 1.0,
    v3V: 0,
    vSatV: 13.0,
  };
  const qsd2 = solveKind(kind, sd2);
  items.push(
    makeCalcMcq(ctx, {
      slug: "elec-sd-02",
      conceptId,
      kind,
      domain: "circuits",
      syllabi: elecTag(),
      difficulty: "higher",
      scenarioSpec: sd2,
      requiredGivens: [
        { name: "rFeedbackKohm", value: 80, unit: "kΩ", source: "either" },
        { name: "r1Kohm", value: 10, unit: "kΩ", source: "either" },
        { name: "r2Kohm", value: 20, unit: "kΩ", source: "either" },
        { name: "v1V", value: 1.5, unit: "V", source: "stem" },
        { name: "v2V", value: 1.0, unit: "V", source: "stem" },
        { name: "vSatV", value: 13.0, unit: "V", source: "either" },
      ],
      targetQuantityKey: "clampedVOutV",
      unit: "V",
      stem: "A two-input summing amplifier ($R_{\\mathrm{f}} = 80\\text{ k}\\Omega$, $R_1 = 10\\text{ k}\\Omega$, $R_2 = 20\\text{ k}\\Omega$) operates from $\\pm 13.0\\text{ V}$ saturation rails. If $V_1 = +1.50\\text{ V}$ and $V_2 = +1.00\\text{ V}$, what is the actual output voltage $V_{\\mathrm{out}}$?",
      distractors: [
        {
          value: qsd2.idealVOutV as number,
          rationale: "Calculates $-16.0\\text{ V}$ without clamping at the $-13.0\\text{ V}$ saturation rail.",
        },
        {
          value: 13.0,
          rationale: "Clamps to the positive rail instead of the negative rail.",
        },
        {
          value: -80 * (1.5 / 10 - 1.0 / 20),
          rationale: "Subtracts the second input branch instead of summing both.",
        },
      ],
      workedSolution: `Unsaturated formula gives $-80(1.50/10 + 1.00/20) = -16.0\\text{ V}$. Because this exceeds the $-13.0\\text{ V}$ rail, the output saturates at $V_{\\mathrm{out}} = ${fmt3(qsd2.clampedVOutV as number, "V")}$.`,
      markCriterion: `Clamped output voltage equals ${fmt3(qsd2.clampedVOutV as number, "V")}.`,
      planSummary: "Detect and clamp saturation in a two-input summing op-amp.",
    }),
  );

  const sd3 = {
    kind,
    mode: "difference",
    rFeedbackKohm: 120,
    r1Kohm: 6,
    r2Kohm: 6,
    r3Kohm: 0,
    v1V: 2.42,
    v2V: 2.77,
    v3V: 0,
    vSatV: 12.0,
  };
  const qsd3 = solveKind(kind, sd3);
  items.push(
    makeCalcMcq(ctx, {
      slug: "elec-sd-03",
      conceptId,
      kind,
      domain: "circuits",
      syllabi: elecTag(),
      difficulty: "standard",
      scenarioSpec: sd3,
      requiredGivens: [
        { name: "rFeedbackKohm", value: 120, unit: "kΩ", source: "either" },
        { name: "r1Kohm", value: 6, unit: "kΩ", source: "either" },
        { name: "v1V", value: 2.42, unit: "V", source: "stem" },
        { name: "v2V", value: 2.77, unit: "V", source: "stem" },
      ],
      targetQuantityKey: "clampedVOutV",
      unit: "V",
      stem: "A strain-gauge bridge feeds a balanced difference amplifier ($R_1 = 6.00\\text{ k}\\Omega$, $R_{\\mathrm{f}} = 120\\text{ k}\\Omega$, rails $\\pm 12.0\\text{ V}$) with $V_- = 2.42\\text{ V}$ on the inverting path and $V_+ = 2.77\\text{ V}$ on the non-inverting path. Calculate $V_{\\mathrm{out}}$.",
      distractors: [
        {
          value: -(qsd3.clampedVOutV as number),
          rationale: "Reverses the difference to $(V_- - V_+)$ instead of $(V_+ - V_-)$.",
        },
        {
          value: (1 + 120 / 6) * (2.77 - 2.42),
          rationale: "Uses non-inverting gain $1 + R_{\\mathrm{f}}/R_1$ instead of $R_{\\mathrm{f}}/R_1$.",
        },
        {
          value: 12.0,
          rationale: "Multiplies $2.77\\text{ V}$ alone by gain 20 and assumes saturation.",
        },
      ],
      workedSolution: `For matched resistor pairs, $V_{\\mathrm{out}} = (V_+ - V_-)\\frac{R_{\\mathrm{f}}}{R_1} = (2.77 - 2.42)\\frac{120}{6.00} = 0.35 \\times 20 = ${fmt3(qsd3.clampedVOutV as number, "V")}$.`,
      markCriterion: `Difference amplifier output equals ${fmt3(qsd3.clampedVOutV as number, "V")}.`,
      planSummary: "Compute balanced difference amplifier output from Wheatstone bridge inputs.",
    }),
  );

  const sd4 = {
    kind,
    mode: "difference",
    rFeedbackKohm: 150,
    r1Kohm: 10,
    r2Kohm: 10,
    r3Kohm: 0,
    v1V: 3.12,
    v2V: 2.84,
    v3V: 0,
    vSatV: 12.0,
  };
  const qsd4 = solveKind(kind, sd4);
  items.push(
    makeCalcMcq(ctx, {
      slug: "elec-sd-04",
      conceptId,
      kind,
      domain: "circuits",
      syllabi: elecTag(),
      difficulty: "standard",
      scenarioSpec: sd4,
      requiredGivens: [
        { name: "rFeedbackKohm", value: 150, unit: "kΩ", source: "either" },
        { name: "r1Kohm", value: 10, unit: "kΩ", source: "either" },
        { name: "v1V", value: 3.12, unit: "V", source: "stem" },
        { name: "v2V", value: 2.84, unit: "V", source: "stem" },
      ],
      targetQuantityKey: "clampedVOutV",
      unit: "V",
      stem: "A balanced difference amplifier with matched pairs $R_1 = 10.0\\text{ k}\\Omega$ and $R_{\\mathrm{f}} = 150\\text{ k}\\Omega$ (rails $\\pm 12.0\\text{ V}$) receives $V_- = 3.12\\text{ V}$ and $V_+ = 2.84\\text{ V}$. Calculate $V_{\\mathrm{out}}$.",
      distractors: [
        {
          value: -(qsd4.clampedVOutV as number),
          rationale: "Drops the negative sign when $V_+ < V_-$.",
        },
        {
          value: (2.84 - 3.12) * (150 / 10 + 1),
          rationale: "Uses gain $1 + R_{\\mathrm{f}}/R_1$ instead of $R_{\\mathrm{f}}/R_1$.",
        },
        {
          value: -12.0,
          rationale: "Assumes comparator saturation despite negative feedback.",
        },
      ],
      workedSolution: `$V_{\\mathrm{out}} = (V_+ - V_-)\\frac{R_{\\mathrm{f}}}{R_1} = (2.84 - 3.12)\\frac{150}{10.0} = -0.28 \\times 15 = ${fmt3(qsd4.clampedVOutV as number, "V")}$.`,
      markCriterion: `Difference amplifier output equals ${fmt3(qsd4.clampedVOutV as number, "V")}.`,
      planSummary: "Compute signed negative output from a balanced difference amplifier.",
    }),
  );

  const sd5 = {
    kind,
    mode: "comparator",
    rFeedbackKohm: 10,
    r1Kohm: 10,
    r2Kohm: 10,
    r3Kohm: 0,
    v1V: 5.4,
    v2V: 5.1,
    v3V: 0,
    vSatV: 13.5,
  };
  const qsd5 = solveKind(kind, sd5);
  items.push(
    makeCalcMcq(ctx, {
      slug: "elec-sd-05",
      conceptId,
      kind,
      domain: "circuits",
      syllabi: elecTag(),
      difficulty: "foundation",
      scenarioSpec: sd5,
      requiredGivens: [
        { name: "v1V", value: 5.4, unit: "V", source: "stem" },
        { name: "v2V", value: 5.1, unit: "V", source: "stem" },
        { name: "vSatV", value: 13.5, unit: "V", source: "either" },
      ],
      targetQuantityKey: "clampedVOutV",
      unit: "V",
      stem: "An open-loop op-amp voltage comparator with saturation limits $\\pm 13.5\\text{ V}$ has a fixed reference $V_- = 5.40\\text{ V}$ on its inverting input and a sensor potential $V_+ = 5.10\\text{ V}$ on its non-inverting input. What is the output voltage $V_{\\mathrm{out}}$?",
      distractors: [
        {
          value: 13.5,
          rationale: "Drives to positive saturation even though $V_+ < V_-$.",
        },
        {
          value: 5.1 - 5.4,
          rationale: "Assumes unity gain instead of huge open-loop gain $A_{\\mathrm{OL}} \\sim 10^5$.",
        },
        {
          value: -5.4,
          rationale: "Equates output voltage to the negative of the reference voltage.",
        },
      ],
      workedSolution: `With no negative feedback, $V_{\\mathrm{out}} = A_{\\mathrm{OL}}(V_+ - V_-)$. Since $V_+ - V_- = -0.30\\text{ V} < 0$ and $A_{\\mathrm{OL}}$ is huge, the output saturates at the negative rail: $V_{\\mathrm{out}} = ${fmt3(qsd5.clampedVOutV as number, "V")}$.`,
      markCriterion: `Comparator output voltage equals ${fmt3(qsd5.clampedVOutV as number, "V")}.`,
      planSummary: "Predict open-loop comparator output saturation polarity.",
    }),
  );

  // 3 Pure Qualitative MCQs
  items.push(
    makeQualMcq(ctx, {
      slug: "elec-sd-06",
      conceptId,
      kind,
      domain: "circuits",
      syllabi: elecTag(),
      difficulty: "standard",
      scenarioSpec: sd1,
      requiredGivens: [],
      targetQuantityKey: "zeroCrosstalkRule",
      stem: "In a multi-channel summing amplifier audio mixer, why does adjusting the volume slider on Channel 1 cause zero crosstalk or interference into Channel 2?",
      distractors: [
        {
          text: "Input resistors block current completely unless all input channels have equal voltage.",
          rationale: "Each channel drives current proportional to its own voltage independently.",
        },
        {
          text: "Non-inverting input absorbs excess signal current from the louder channel.",
          rationale: "The non-inverting input is grounded and ideal op-amp input current is zero.",
        },
        {
          text: "Feedback resistor disconnects Channel 2 whenever Channel 1 changes amplitude.",
          rationale: "All channels remain continuously summed at node X.",
        },
      ],
      workedSolution: `Because the op-amp is unsaturated, virtual earth holds the summing junction at zero volts so each input branch current depends only on its own voltage and resistor ($I_k = V_k/R_k$), isolating the inputs from one another.`,
      planSummary: "Explain zero input crosstalk in a summing amplifier via virtual earth.",
    }),
  );

  items.push(
    makeQualMcq(ctx, {
      slug: "elec-sd-07",
      conceptId,
      kind,
      domain: "circuits",
      syllabi: elecTag(),
      difficulty: "standard",
      scenarioSpec: sd3,
      requiredGivens: [],
      targetQuantityKey: "commonModeRejectionRule",
      stem: "Why is a balanced difference amplifier superior to a standard non-inverting amplifier when amplifying millivolt signals from a remote strain gauge connected via long parallel cables?",
      distractors: [
        {
          text: "Difference amplifier blocks DC sensor voltages and amplifies only 50 Hz mains pickup.",
          rationale: "It rejects common-mode 50 Hz pickup and amplifies the differential DC/signal voltage.",
        },
        {
          text: "Difference amplifier eliminates the need for power supply rails.",
          rationale: "All op-amp circuits still require DC power rails.",
        },
        {
          text: "Difference amplifier doubles the amplitude of identical interference induced on both wires.",
          rationale: "Identical interference cancels upon subtraction.",
        },
      ],
      workedSolution: `Because $V_{\\mathrm{out}} = (V_+ - V_-)R_{\\mathrm{f}}/R_1$, equal noise induced on both sensor leads cancels when subtracted by a balanced difference amplifier.`,
      planSummary: "Explain common-mode noise rejection in a balanced difference amplifier.",
    }),
  );

  items.push(
    makeQualMcq(ctx, {
      slug: "elec-sd-08",
      conceptId,
      kind,
      domain: "circuits",
      syllabi: elecTag(),
      difficulty: "standard",
      scenarioSpec: sd4,
      requiredGivens: [],
      targetQuantityKey: "matchedResistorRule",
      stem: "Why must high-precision tolerance resistors be selected in matched pairs ($R_1$ and $R_{\\mathrm{f}}$) when building a four-resistor difference amplifier?",
      distractors: [
        {
          text: "Mismatched resistors reverse the power-supply polarity of the op-amp.",
          rationale: "Resistor tolerances do not change power-supply polarity.",
        },
        {
          text: "Matched resistors are required solely to prevent the op-amp from overheating.",
          rationale: "Op-amp feedback resistors carry microamp/milliamp currents with tiny dissipation.",
        },
        {
          text: "Matched resistors force the open-loop gain to equal unity.",
          rationale: "Open-loop gain is an internal IC property unaffected by external resistors.",
        },
      ],
      workedSolution: `Only when both branches share the exact ratio $R_{\\mathrm{f}}/R_1$ does $V_{\\mathrm{out}} = (V_+ - V_-)R_{\\mathrm{f}}/R_1$ hold: resistor ratios on inverting and non-inverting paths must match so common-mode signals produce zero output.`,
      planSummary: "Explain why balanced resistor ratios are essential for common-mode rejection.",
    }),
  );

  // 4 Multi-part structured
  const sdStructs = [
    {
      slug: "elec-sd-09",
      difficulty: "standard" as const,
      spec: {
        kind,
        mode: "summing",
        rFeedbackKohm: 40,
        r1Kohm: 10,
        r2Kohm: 20,
        r3Kohm: 40,
        v1V: 1.5,
        v2V: 2.0,
        v3V: 1.0,
        vSatV: 12.0,
      },
    },
    {
      slug: "elec-sd-10",
      difficulty: "higher" as const,
      spec: {
        kind,
        mode: "summing",
        rFeedbackKohm: 50,
        r1Kohm: 10,
        r2Kohm: 25,
        r3Kohm: 50,
        v1V: 2.0,
        v2V: 1.5,
        v3V: 1.0,
        vSatV: 12.5,
      },
    },
    {
      slug: "elec-sd-11",
      difficulty: "standard" as const,
      spec: {
        kind,
        mode: "difference",
        rFeedbackKohm: 180,
        r1Kohm: 12,
        r2Kohm: 12,
        r3Kohm: 0,
        v1V: 1.85,
        v2V: 2.25,
        v3V: 0,
        vSatV: 12.0,
      },
    },
    {
      slug: "elec-sd-12",
      difficulty: "higher" as const,
      spec: {
        kind,
        mode: "difference",
        rFeedbackKohm: 240,
        r1Kohm: 10,
        r2Kohm: 10,
        r3Kohm: 0,
        v1V: 2.6,
        v2V: 3.3,
        v3V: 0,
        vSatV: 13.0,
      },
    },
  ];

  for (const cfg of sdStructs) {
    const sp = cfg.spec;
    const q = solveKind(kind, sp);
    if (sp.mode === "summing") {
      const iTotStr = fmt3(q.totalFeedbackCurrentMa as number, "mA");
      const vOutStr = fmt3(q.clampedVOutV as number, "V");
      items.push(
        makeStructured(ctx, {
          slug: cfg.slug,
          conceptId,
          kind,
          domain: "circuits",
          syllabi: elecTag(),
          difficulty: cfg.difficulty,
          scenarioSpec: sp,
          hiddenQuantities: [
            "totalFeedbackCurrentMa",
            "clampedVOutV",
            "zeroCrosstalkRule",
          ],
          requiredGivens: [
            { name: "rFeedbackKohm", value: sp.rFeedbackKohm, unit: "kΩ", source: "either" },
            { name: "r1Kohm", value: sp.r1Kohm, unit: "kΩ", source: "either" },
            { name: "r2Kohm", value: sp.r2Kohm, unit: "kΩ", source: "either" },
            { name: "r3Kohm", value: sp.r3Kohm, unit: "kΩ", source: "either" },
            { name: "v1V", value: sp.v1V, unit: "V", source: "stem" },
            { name: "v2V", value: sp.v2V, unit: "V", source: "stem" },
            { name: "v3V", value: sp.v3V, unit: "V", source: "stem" },
            { name: "vSatV", value: sp.vSatV, unit: "V", source: "either" },
          ],
          stem: `A weighted 3-bit digital-to-analogue summing amplifier ($\\pm ${fmt3(sp.vSatV, "V")}$ rails) has $R_{\\mathrm{f}} = ${sp.rFeedbackKohm}\\text{ k}\\Omega$, $R_1 = ${sp.r1Kohm}\\text{ k}\\Omega$, $R_2 = ${sp.r2Kohm}\\text{ k}\\Omega$, and $R_3 = ${sp.r3Kohm}\\text{ k}\\Omega$. The inputs are set to $V_1 = ${fmt3(sp.v1V, "V")}$, $V_2 = ${fmt3(sp.v2V, "V")}$, and $V_3 = ${fmt3(sp.v3V, "V")}$.`,
          parts: [
            {
              partId: "a",
              prompt: "Assuming the op-amp initially remains unsaturated with virtual earth at node X, calculate the total current flowing toward node X through the three input resistors (in mA).",
              marks: 2,
              targetQuantityKey: "totalFeedbackCurrentMa",
              expectedAnswer: iTotStr,
              workingSteps: [
                `$I_{\\mathrm{tot}} = \\frac{V_1}{R_1} + \\frac{V_2}{R_2} + \\frac{V_3}{R_3} = ${iTotStr}$.`,
              ],
            },
            {
              partId: "b",
              prompt: "Determine the actual output voltage $V_{\\mathrm{out}}$, checking for saturation.",
              marks: 2,
              dependsOnPartIds: ["a"],
              targetQuantityKey: "clampedVOutV",
              expectedAnswer: vOutStr,
              workingSteps: [
                `Ideal $V_{\\mathrm{out}} = -I_{\\mathrm{tot}} R_{\\mathrm{f}} = ${fmt3(q.idealVOutV as number, "V")}$.`,
                q.isSaturated
                  ? `Exceeds saturation rail, so output clamps at ${vOutStr}.`
                  : `Within $\\pm ${fmt3(sp.vSatV, "V")}$ limits, so $V_{\\mathrm{out}} = ${vOutStr}$.`,
              ],
            },
            {
              partId: "c",
              prompt: "Explain why changing one input voltage does not alter the currents in the other input branches while the amplifier stays unsaturated.",
              marks: 2,
              targetMode: "qualitative",
              targetQuantityKey: "zeroCrosstalkRule",
              expectedAnswer:
                "Virtual earth holds the summing junction at zero volts so each input branch current depends only on its own voltage and resistor.",
              workingSteps: [
                "Because open-loop gain is very large and the amplifier is unsaturated, node X stays at $0\\text{ V}$.",
                "Each branch current $V_k/R_k$ is therefore fixed purely by its own input voltage and resistor with zero crosstalk.",
              ],
            },
          ],
          workedSolution: `(a) $I_{\\mathrm{tot}} = ${iTotStr}$. (b) $V_{\\mathrm{out}} = ${vOutStr}$. (c) Virtual earth holds the summing junction at zero volts so each input branch current depends only on its own voltage and resistor.`,
          markScheme: [
            { code: "M1", criterion: "Sums $V_1/R_1 + V_2/R_2 + V_3/R_3$ using virtual earth at node X.", marks: 1, partId: "a" },
            { code: "A1", criterion: `Obtains ${iTotStr}.`, marks: 1, partId: "a" },
            { code: "M1", criterion: "Computes $-I_{\\mathrm{tot}} R_{\\mathrm{f}}$ and compares with $\\pm V_{\\mathrm{sat}}$.", marks: 1, partId: "b" },
            { code: "A1", criterion: `Obtains $V_{\\mathrm{out}} = ${vOutStr}$.`, marks: 1, partId: "b" },
            { code: "B1", criterion: "States that node X is held at $0\\text{ V}$ (virtual earth) while unsaturated.", marks: 1, partId: "c" },
            { code: "B1", criterion: "Concludes each branch current $V_k/R_k$ is independent of the other inputs.", marks: 1, partId: "c" },
          ],
          planSummary: "Summing amplifier KCL branch currents, saturation check, and zero-crosstalk explanation.",
        }),
      );
    } else {
      const dgStr = fmt3(q.diffGain as number);
      const vOutStr = fmt3(q.clampedVOutV as number, "V");
      items.push(
        makeStructured(ctx, {
          slug: cfg.slug,
          conceptId,
          kind,
          domain: "circuits",
          syllabi: elecTag(),
          difficulty: cfg.difficulty,
          scenarioSpec: sp,
          hiddenQuantities: ["diffGain", "clampedVOutV", "commonModeRejectionRule"],
          requiredGivens: [
            { name: "rFeedbackKohm", value: sp.rFeedbackKohm, unit: "kΩ", source: "either" },
            { name: "r1Kohm", value: sp.r1Kohm, unit: "kΩ", source: "either" },
            { name: "v1V", value: sp.v1V, unit: "V", source: "stem" },
            { name: "v2V", value: sp.v2V, unit: "V", source: "stem" },
            { name: "vSatV", value: sp.vSatV, unit: "V", source: "either" },
          ],
          stem: `A balanced thermocouple difference amplifier uses matched resistor pairs $R_1 = ${sp.r1Kohm}\\text{ k}\\Omega$ and $R_{\\mathrm{f}} = ${sp.rFeedbackKohm}\\text{ k}\\Omega$ with saturation limits $\\pm ${fmt3(sp.vSatV, "V")}$. Sensor inputs are $V_- = ${fmt3(sp.v1V, "V")}$ and $V_+ = ${fmt3(sp.v2V, "V")}$.`,
          parts: [
            {
              partId: "a",
              prompt: "Calculate the differential voltage gain of the circuit.",
              marks: 2,
              targetQuantityKey: "diffGain",
              expectedAnswer: dgStr,
              workingSteps: [
                `$G_{\\mathrm{diff}} = \\frac{R_{\\mathrm{f}}}{R_1} = \\frac{${sp.rFeedbackKohm}}{${sp.r1Kohm}} = ${dgStr}$.`,
              ],
            },
            {
              partId: "b",
              prompt: "Determine the output voltage $V_{\\mathrm{out}}$, checking against the saturation rails.",
              marks: 2,
              dependsOnPartIds: ["a"],
              targetQuantityKey: "clampedVOutV",
              expectedAnswer: vOutStr,
              workingSteps: [
                `Ideal $V_{\\mathrm{out}} = G_{\\mathrm{diff}}(V_+ - V_-) = ${fmt3(q.idealVOutV as number, "V")}$.`,
                q.isSaturated
                  ? `Exceeds $+${fmt3(sp.vSatV, "V")}$ rail, so clamps at ${vOutStr}.`
                  : `Within saturation limits, so $V_{\\mathrm{out}} = ${vOutStr}$.`,
              ],
            },
            {
              partId: "c",
              prompt: "Explain why 50 Hz mains interference picked up equally on both thermocouple leads does not corrupt $V_{\\mathrm{out}}$.",
              marks: 2,
              targetMode: "qualitative",
              targetQuantityKey: "commonModeRejectionRule",
              expectedAnswer:
                "Equal noise induced on both sensor leads cancels when subtracted by a balanced difference amplifier.",
              workingSteps: [
                "Adding identical noise $v_{\\mathrm{n}}$ to both $V_+$ and $V_-$ leaves $(V_+ + v_{\\mathrm{n}}) - (V_- + v_{\\mathrm{n}}) = V_+ - V_-$.",
                "Equal noise induced on both sensor leads cancels when subtracted by a balanced difference amplifier.",
              ],
            },
          ],
          workedSolution: `(a) $G_{\\mathrm{diff}} = ${dgStr}$. (b) $V_{\\mathrm{out}} = ${vOutStr}$. (c) Equal noise induced on both sensor leads cancels when subtracted by a balanced difference amplifier.`,
          markScheme: [
            { code: "M1", criterion: "Applies $G_{\\mathrm{diff}} = R_{\\mathrm{f}}/R_1$.", marks: 1, partId: "a" },
            { code: "A1", criterion: `Obtains ${dgStr}.`, marks: 1, partId: "a" },
            { code: "M1", criterion: "Computes $(V_+ - V_-)R_{\\mathrm{f}}/R_1$ and enforces $\\pm V_{\\mathrm{sat}}$ clipping.", marks: 1, partId: "b" },
            { code: "A1", criterion: `Obtains ${vOutStr}.`, marks: 1, partId: "b" },
            { code: "B1", criterion: "States that equal noise adds identically to both inputs.", marks: 1, partId: "c" },
            { code: "B1", criterion: "Concludes that subtraction eliminates common-mode noise at the output.", marks: 1, partId: "c" },
          ],
          planSummary: "Difference amplifier gain, saturation clamping, and common-mode interference cancellation.",
        }),
      );
    }
  }

  return items;
}

/* ========================================================================== */
/*  10. Plugin 10: al-opt-elec-lc-resonance-filters (12 items)                */
/* ========================================================================== */

function buildLcResonanceItems(ctx: BuildContext): CandidateQuestionInput[] {
  const kind = "al-opt-elec-lc-resonance-filters";
  const conceptId = "kirchhoff-dc-circuits";
  const items: CandidateQuestionInput[] = [];

  const lc1 = {
    kind,
    mode: "parallel-lc",
    inductanceUh: 250,
    capacitancePf: 160,
    qFactor: 40,
    vMaxV: 8.0,
  };
  const qlc1 = solveKind(kind, lc1);
  items.push(
    makeCalcMcq(ctx, {
      slug: "elec-lc-01",
      conceptId,
      kind,
      domain: "circuits",
      syllabi: elecTag(),
      difficulty: "foundation",
      scenarioSpec: lc1,
      requiredGivens: [
        { name: "inductanceUh", value: 250, unit: "μH", source: "stem" },
        { name: "capacitancePf", value: 160, unit: "pF", source: "stem" },
      ],
      targetQuantityKey: "resonantFreqKhz",
      unit: "kHz",
      stem: "A medium-wave radio receiver uses a parallel LC tuned circuit consisting of a 250 μH coil and a 160 pF capacitor. Calculate its resonant frequency $f_0$ in kHz.",
      distractors: [
        {
          value: (qlc1.resonantFreqKhz as number) * 2 * Math.PI,
          rationale: "Computes angular frequency $\\omega_0 = 1/\\sqrt{LC}$ without dividing by $2\\pi$.",
        },
        {
          value: 1 / (2 * Math.PI * 250e-6 * 160e-12) / 1e3,
          rationale: "Omits the square root around $LC$.",
        },
        {
          value: (qlc1.resonantFreqKhz as number) / 10,
          rationale: "Misconverts picofarads ($10^{-12}$) as $10^{-10}$.",
        },
      ],
      workedSolution: `$f_0 = \\frac{1}{2\\pi\\sqrt{LC}} = \\frac{1}{2\\pi\\sqrt{(250 \\times 10^{-6})(160 \\times 10^{-12})}} = ${fmt3(qlc1.resonantFreqKhz as number, "kHz")}$.`,
      markCriterion: `Resonant frequency equals ${fmt3(qlc1.resonantFreqKhz as number, "kHz")}.`,
      planSummary: "Compute LC resonant frequency from inductance in uH and capacitance in pF.",
    }),
  );

  const lc2 = {
    kind,
    mode: "parallel-lc",
    inductanceUh: 180,
    capacitancePf: 220,
    qFactor: 50,
    vMaxV: 10.0,
  };
  const qlc2 = solveKind(kind, lc2);
  items.push(
    makeCalcMcq(ctx, {
      slug: "elec-lc-02",
      conceptId,
      kind,
      domain: "circuits",
      syllabi: elecTag(),
      difficulty: "foundation",
      scenarioSpec: lc2,
      requiredGivens: [{ name: "vMaxV", value: 10.0, unit: "V", source: "either" }],
      targetQuantityKey: "halfPowerVoltageV",
      unit: "V",
      stem: "An LC tuner resonance curve reaches a peak output voltage $V_{\\max} = 10.0\\text{ V}$ at $f_0$. At what output voltage level must the bandwidth $f_{\\mathrm{B}}$ be measured on the resonance curve?",
      distractors: [
        {
          value: 5.0,
          rationale: "Uses $0.5 V_{\\max}$ instead of the AQA half-power voltage $0.707 V_{\\max} = V_{\\max}/\\sqrt{2}$.",
        },
        {
          value: 6.32,
          rationale: "Confuses RC time-constant factor $1 - e^{-1} = 0.632$ with half-power $1/\\sqrt{2}$.",
        },
        {
          value: 3.68,
          rationale: "Confuses exponential decay $e^{-1} = 0.368$ with half-power amplitude.",
        },
      ],
      workedSolution: `Because power $P \\propto V^2$, half-power occurs at $V = \\frac{V_{\\max}}{\\sqrt{2}} = 0.707 V_{\\max} = 0.707 \\times 10.0 = ${fmt3(qlc2.halfPowerVoltageV as number, "V")}$.`,
      markCriterion: `Half-power bandwidth level equals ${fmt3(qlc2.halfPowerVoltageV as number, "V")}.`,
      planSummary: "Enforce exact half-power voltage measurement level for LC bandwidth.",
    }),
  );

  const lc3 = {
    kind,
    mode: "parallel-lc",
    inductanceUh: 320,
    capacitancePf: 140,
    qFactor: 62,
    vMaxV: 6.0,
  };
  const qlc3 = solveKind(kind, lc3);
  items.push(
    makeCalcMcq(ctx, {
      slug: "elec-lc-03",
      conceptId,
      kind,
      domain: "circuits",
      syllabi: elecTag(),
      difficulty: "standard",
      scenarioSpec: lc3,
      requiredGivens: [
        { name: "inductanceUh", value: 320, unit: "μH", source: "stem" },
        { name: "capacitancePf", value: 140, unit: "pF", source: "stem" },
        { name: "qFactor", value: 62, source: "stem" },
      ],
      targetQuantityKey: "bandwidthKhz",
      unit: "kHz",
      stem: "A parallel LC tuned circuit ($L = 320\\text{ }\\mu\\text{H}$, $C = 140\\text{ pF}$) has a quality factor $Q = 62.0$. Calculate its half-power bandwidth $f_{\\mathrm{B}}$ in kHz.",
      distractors: [
        {
          value: (qlc3.resonantFreqKhz as number) * 62,
          rationale: "Multiplies $f_0$ by $Q$ instead of dividing $f_0 / Q$.",
        },
        {
          value: (qlc3.bandwidthKhz as number) * 2,
          rationale: "Doubles the calculated bandwidth.",
        },
        {
          value: (qlc3.bandwidthKhz as number) * 0.707,
          rationale: "Erroneously multiplies bandwidth $f_0/Q$ by $0.707$.",
        },
      ],
      workedSolution: `$f_0 = \\frac{1}{2\\pi\\sqrt{320 \\times 10^{-6} \\times 140 \\times 10^{-12}}} = ${fmt3(qlc3.resonantFreqKhz as number, "kHz")}$. Using $Q = \\frac{f_0}{f_{\\mathrm{B}}}$, $f_{\\mathrm{B}} = \\frac{f_0}{Q} = ${fmt3(qlc3.bandwidthKhz as number, "kHz")}$.`,
      markCriterion: `Half-power bandwidth equals ${fmt3(qlc3.bandwidthKhz as number, "kHz")}.`,
      planSummary: "Compute LC circuit bandwidth from resonant frequency and quality factor.",
    }),
  );

  const lc4 = {
    kind,
    mode: "series-lc",
    inductanceUh: 400,
    capacitancePf: 250,
    qFactor: 50,
    vMaxV: 9.0,
  };
  const qlc4 = solveKind(kind, lc4);
  items.push(
    makeCalcMcq(ctx, {
      slug: "elec-lc-04",
      conceptId,
      kind,
      domain: "circuits",
      syllabi: elecTag(),
      difficulty: "standard",
      scenarioSpec: lc4,
      requiredGivens: [
        { name: "inductanceUh", value: 400, unit: "μH", source: "stem" },
        { name: "capacitancePf", value: 250, unit: "pF", source: "stem" },
      ],
      targetQuantityKey: "reactanceAtResonanceOhm",
      unit: "Ω",
      stem: "A series LC filter consists of a 400 μH inductor and a 250 pF capacitor driven at its exact resonant frequency $f_0$. Calculate the inductive reactance $X_L = 2\\pi f_0 L$ at resonance.",
      distractors: [
        {
          value: 400 / 250,
          rationale: "Takes raw ratio $L/C$ without square root or SI unit prefixes.",
        },
        {
          value: (qlc4.reactanceAtResonanceOhm as number) / (2 * Math.PI),
          rationale: "Omits $2\\pi$ in $X_L = 2\\pi f_0 L$.",
        },
        {
          value: (qlc4.reactanceAtResonanceOhm as number) * 2,
          rationale: "Adds $X_L + X_C$ instead of quoting the magnitude of $X_L$ alone.",
        },
      ],
      workedSolution: `$f_0 = \\frac{1}{2\\pi\\sqrt{LC}} = ${fmt3(qlc4.resonantFreqKhz as number, "kHz")}$, so $X_L = 2\\pi f_0 L = \\sqrt{\\frac{L}{C}} = \\sqrt{\\frac{400 \\times 10^{-6}}{250 \\times 10^{-12}}} = ${fmt3(qlc4.reactanceAtResonanceOhm as number, "Ω")}$.`,
      markCriterion: `Inductive reactance at resonance equals ${fmt3(qlc4.reactanceAtResonanceOhm as number, "Ω")}.`,
      planSummary: "Calculate inductive reactance at exact LC resonance.",
    }),
  );

  const lc5 = {
    kind,
    mode: "parallel-lc",
    inductanceUh: 150,
    capacitancePf: 150,
    qFactor: 75,
    vMaxV: 7.2,
  };
  const qlc5 = solveKind(kind, lc5);
  items.push(
    makeCalcMcq(ctx, {
      slug: "elec-lc-05",
      conceptId,
      kind,
      domain: "circuits",
      syllabi: elecTag(),
      difficulty: "higher",
      scenarioSpec: lc5,
      requiredGivens: [
        { name: "inductanceUh", value: 150, unit: "μH", source: "stem" },
        { name: "capacitancePf", value: 150, unit: "pF", source: "stem" },
        { name: "qFactor", value: 75, source: "stem" },
      ],
      targetQuantityKey: "upperCutoffKhz",
      unit: "kHz",
      stem: "A high-Q radio RF stage ($L = 150\\text{ }\\mu\\text{H}$, $C = 150\\text{ pF}$, $Q = 75.0$) has a symmetric resonance peak centred on $f_0$. Calculate the upper $-3\\text{ dB}$ cut-off frequency $f_2$ in kHz.",
      distractors: [
        {
          value: (qlc5.resonantFreqKhz as number) + (qlc5.bandwidthKhz as number),
          rationale: "Adds the full bandwidth $f_{\\mathrm{B}}$ instead of half the bandwidth $f_{\\mathrm{B}}/2$ to $f_0$.",
        },
        {
          value: qlc5.lowerCutoffKhz as number,
          rationale: "Subtracts $f_{\\mathrm{B}}/2$ to give the lower cut-off $f_1$ instead of $f_2$.",
        },
        {
          value: qlc5.bandwidthKhz as number,
          rationale: "Reports bandwidth $f_{\\mathrm{B}}$ rather than upper cut-off frequency $f_0 + f_{\\mathrm{B}}/2$.",
        },
      ],
      workedSolution: `$f_0 = ${fmt3(qlc5.resonantFreqKhz as number, "kHz")}$ and $f_{\\mathrm{B}} = f_0/Q = ${fmt3(qlc5.bandwidthKhz as number, "kHz")}$. Hence $f_2 = f_0 + \\frac{f_{\\mathrm{B}}}{2} = ${fmt3(qlc5.upperCutoffKhz as number, "kHz")}$.`,
      markCriterion: `Upper cut-off frequency equals ${fmt3(qlc5.upperCutoffKhz as number, "kHz")}.`,
      planSummary: "Find upper half-power cut-off frequency from resonant frequency and bandwidth.",
    }),
  );

  // 3 Pure Qualitative MCQs
  items.push(
    makeQualMcq(ctx, {
      slug: "elec-lc-06",
      conceptId,
      kind,
      domain: "circuits",
      syllabi: elecTag(),
      difficulty: "foundation",
      scenarioSpec: lc1,
      requiredGivens: [],
      targetQuantityKey: "parallelImpedanceRule",
      stem: "How does the total electrical impedance of a parallel LC tuned circuit behave at its resonant frequency $f_0$ compared with frequencies far above or below $f_0$?",
      distractors: [
        {
          text: "Parallel LC circuit has minimum impedance at resonant frequency, shorting out the carrier.",
          rationale: "Confuses parallel LC (maximum impedance) with series LC (minimum impedance).",
        },
        {
          text: "Parallel LC circuit has constant frequency-independent impedance identical to a pure resistor.",
          rationale: "Reactive cancellation creates a sharp impedance peak at $f_0$.",
        },
        {
          text: "Parallel LC circuit impedance falls monotonically as frequency increases past resonance.",
          rationale: "Impedance peaks at $f_0$ and falls on both sides.",
        },
      ],
      workedSolution: `At $f_0$, the branch currents in $L$ and $C$ are equal and opposite in phase so net supply current is minimum: a parallel LC circuit has maximum impedance at resonant frequency.`,
      planSummary: "Distinguish parallel LC maximum impedance at resonance from series LC minimum impedance.",
    }),
  );

  items.push(
    makeQualMcq(ctx, {
      slug: "elec-lc-07",
      conceptId,
      kind,
      domain: "circuits",
      syllabi: elecTag(),
      difficulty: "foundation",
      scenarioSpec: lc4,
      requiredGivens: [],
      targetQuantityKey: "seriesImpedanceRule",
      stem: "Why can a series LC circuit be wired directly in the signal path to pass a chosen station frequency $f_0$ while blocking off-frequency interference?",
      distractors: [
        {
          text: "Series LC circuit has maximum impedance at resonant frequency, reflecting all other frequencies.",
          rationale: "A series LC circuit has minimum impedance at $f_0$, not maximum.",
        },
        {
          text: "Series LC circuit stores zero magnetic energy at resonance.",
          rationale: "Energy oscillates continuously between the capacitor and inductor at resonance.",
        },
        {
          text: "Inductive reactance vanishes identically at resonance while capacitive reactance becomes infinite.",
          rationale: "At resonance $X_L = X_C > 0$, and their opposite phases cancel.",
        },
      ],
      workedSolution: `At $f_0$, $X_L = X_C$ cancel in series leaving only small coil resistance: a series LC circuit has minimum impedance at resonant frequency.`,
      planSummary: "Explain series LC minimum impedance at resonance.",
    }),
  );

  items.push(
    makeQualMcq(ctx, {
      slug: "elec-lc-08",
      conceptId,
      kind,
      domain: "circuits",
      syllabi: elecTag(),
      difficulty: "standard",
      scenarioSpec: lc3,
      requiredGivens: [],
      targetQuantityKey: "highQTradeoffRule",
      stem: "Comparing the solid (higher Q) and dashed (lower Q) response curves for an AM radio receiver front-end, what trade-off governs choosing a very high Q factor?",
      distractors: [
        {
          text: "Higher Q factor widens bandwidth, admitting adjacent stations while improving bass audio.",
          rationale: "Higher Q narrows bandwidth ($f_{\\mathrm{B}} = f_0/Q$).",
        },
        {
          text: "Lower Q factor gives sharper selectivity so closely spaced transmitters never overlap.",
          rationale: "Lower Q gives a broad curve with poor selectivity.",
        },
        {
          text: "Changing Q factor shifts the resonant carrier frequency $f_0$ upward without altering peak sharpness.",
          rationale: "$f_0 = 1/(2\\pi\\sqrt{LC})$ is set by $L$ and $C$; Q sets sharpness and bandwidth.",
        },
      ],
      workedSolution: `Because $f_{\\mathrm{B}} = f_0/Q$, a higher Q factor gives sharper selectivity rejecting adjacent stations but narrows bandwidth so outer sidebands may be attenuated.`,
      planSummary: "Evaluate selectivity versus sideband bandwidth trade-off for high-Q tuners.",
    }),
  );

  // 4 Multi-part structured
  const lcStructs = [
    {
      slug: "elec-lc-09",
      difficulty: "standard" as const,
      spec: { kind, mode: "parallel-lc", inductanceUh: 200, capacitancePf: 200, qFactor: 45, vMaxV: 8.4 },
    },
    {
      slug: "elec-lc-10",
      difficulty: "standard" as const,
      spec: { kind, mode: "series-lc", inductanceUh: 350, capacitancePf: 180, qFactor: 55, vMaxV: 6.4 },
    },
    {
      slug: "elec-lc-11",
      difficulty: "higher" as const,
      spec: { kind, mode: "parallel-lc", inductanceUh: 120, capacitancePf: 300, qFactor: 80, vMaxV: 9.2 },
    },
    {
      slug: "elec-lc-12",
      difficulty: "higher" as const,
      spec: { kind, mode: "series-lc", inductanceUh: 500, capacitancePf: 125, qFactor: 64, vMaxV: 11.0 },
    },
  ];

  for (const cfg of lcStructs) {
    const sp = cfg.spec;
    const q = solveKind(kind, sp);
    const f0Str = fmt3(q.resonantFreqKhz as number, "kHz");
    const vHalfStr = fmt3(q.halfPowerVoltageV as number, "V");
    const fbStr = fmt3(q.bandwidthKhz as number, "kHz");
    items.push(
      makeStructured(ctx, {
        slug: cfg.slug,
        conceptId,
        kind,
        domain: "circuits",
        syllabi: elecTag(),
        difficulty: cfg.difficulty,
        scenarioSpec: sp,
        hiddenQuantities: [
          "resonantFreqKhz",
          "halfPowerVoltageV",
          "bandwidthKhz",
          "highQTradeoffRule",
        ],
        requiredGivens: [
          { name: "inductanceUh", value: sp.inductanceUh, unit: "μH", source: "stem" },
          { name: "capacitancePf", value: sp.capacitancePf, unit: "pF", source: "stem" },
          { name: "qFactor", value: sp.qFactor, source: "stem" },
          { name: "vMaxV", value: sp.vMaxV, unit: "V", source: "either" },
        ],
        stem: `A radio receiver tuning filter uses a ${sp.mode === "parallel-lc" ? "parallel" : "series"} LC network with $L = ${sp.inductanceUh}\\text{ }\\mu\\text{H}$, $C = ${sp.capacitancePf}\\text{ pF}$, and quality factor $Q = ${sp.qFactor}$. At resonance the peak output voltage is $V_{\\max} = ${fmt3(sp.vMaxV, "V")}$.`,
        parts: [
          {
            partId: "a",
            prompt: "Calculate the resonant frequency $f_0$ in kHz.",
            marks: 2,
            targetQuantityKey: "resonantFreqKhz",
            expectedAnswer: f0Str,
            workingSteps: [
              `$f_0 = \\frac{1}{2\\pi\\sqrt{LC}} = ${f0Str}$.`,
            ],
          },
          {
            partId: "b",
            prompt: "Calculate the voltage level at which the half-power bandwidth $f_{\\mathrm{B}}$ is measured on the resonance graph.",
            marks: 1,
            targetQuantityKey: "halfPowerVoltageV",
            expectedAnswer: vHalfStr,
            workingSteps: [
              `$V_{\\mathrm{hp}} = 0.707 V_{\\max} = \\frac{${fmt3(sp.vMaxV)}}{\\sqrt{2}} = ${vHalfStr}$.`,
            ],
          },
          {
            partId: "c",
            prompt: "Calculate the bandwidth $f_{\\mathrm{B}}$ of the tuned circuit in kHz.",
            marks: 2,
            dependsOnPartIds: ["a"],
            targetQuantityKey: "bandwidthKhz",
            expectedAnswer: fbStr,
            workingSteps: [
              `$f_{\\mathrm{B}} = \\frac{f_0}{Q} = \\frac{${fmt3(q.resonantFreqKhz as number)}}{${sp.qFactor}} = ${fbStr}$.`,
            ],
          },
          {
            partId: "d",
            prompt: "Explain the trade-off of replacing the coil with a lower-resistance coil to achieve a significantly higher Q factor in an AM broadcast receiver.",
            marks: 2,
            targetMode: "qualitative",
            targetQuantityKey: "highQTradeoffRule",
            expectedAnswer:
              "A higher Q factor gives sharper selectivity rejecting adjacent stations but narrows bandwidth so outer sidebands may be attenuated.",
            workingSteps: [
              "Higher Q sharpens the peak, improving selectivity against neighbouring stations.",
              "However, $f_{\\mathrm{B}} = f_0/Q$ shrinks, risking attenuation of high-frequency audio sidebands.",
            ],
          },
        ],
        workedSolution: `(a) $f_0 = ${f0Str}$. (b) Half-power level $= 0.707 V_{\\max} = ${vHalfStr}$. (c) $f_{\\mathrm{B}} = f_0/Q = ${fbStr}$. (d) Higher Q factor gives sharper selectivity rejecting adjacent stations but narrows bandwidth so outer sidebands may be attenuated.`,
        markScheme: [
          { code: "M1", criterion: "Applies $f_0 = 1/(2\\pi\\sqrt{LC})$ with $\\mu\\text{H}$ and $\\text{pF}$ converted to SI.", marks: 1, partId: "a" },
          { code: "A1", criterion: `Obtains $f_0 = ${f0Str}$.`, marks: 1, partId: "a" },
          { code: "A1", criterion: `Computes $0.707 V_{\\max} = ${vHalfStr}$.`, marks: 1, partId: "b" },
          { code: "M1", criterion: "Uses $f_{\\mathrm{B}} = f_0/Q$.", marks: 1, partId: "c" },
          { code: "A1", criterion: `Obtains $f_{\\mathrm{B}} = ${fbStr}$.`, marks: 1, partId: "c" },
          { code: "B1", criterion: "States higher Q improves selectivity against adjacent stations.", marks: 1, partId: "d" },
          { code: "B1", criterion: "States narrower bandwidth can clip/attenuate outer modulating sidebands.", marks: 1, partId: "d" },
        ],
        planSummary: "LC resonant frequency, half-power voltage level, Q-factor bandwidth, and selectivity trade-off.",
      }),
    );
  }

  return items;
}

/* ========================================================================== */
/*  11. Plugin 11: al-opt-elec-timing-astable-555 (12 items)                  */
/* ========================================================================== */

function buildTiming555Items(ctx: BuildContext): CandidateQuestionInput[] {
  const kind = "al-opt-elec-timing-astable-555";
  const conceptId = "capacitor-rc-decay";
  const items: CandidateQuestionInput[] = [];

  const t1 = {
    kind,
    mode: "555-astable",
    r1Kohm: 15,
    r2Kohm: 25,
    capacitanceUf: 10,
    supplyVoltageV: 9.0,
  };
  const qt1 = solveKind(kind, t1);
  items.push(
    makeCalcMcq(ctx, {
      slug: "elec-555-01",
      conceptId,
      kind,
      domain: "circuits",
      syllabi: elecTag(),
      difficulty: "foundation",
      scenarioSpec: t1,
      requiredGivens: [
        { name: "r1Kohm", value: 15, unit: "kΩ", source: "stem" },
        { name: "r2Kohm", value: 25, unit: "kΩ", source: "stem" },
        { name: "capacitanceUf", value: 10, unit: "μF", source: "stem" },
      ],
      targetQuantityKey: "tHighMs",
      unit: "ms",
      stem: "A 555 timer astable oscillator uses $R_1 = 15.0\\text{ k}\\Omega$, $R_2 = 25.0\\text{ k}\\Omega$, and $C = 10.0\\text{ }\\mu\\text{F}$. Using the AQA astable timing relation $t_{\\mathrm{H}} = 0.7(R_1 + R_2)C$, calculate the mark time $t_{\\mathrm{H}}$ in ms.",
      distractors: [
        {
          value: qt1.tLowMs as number,
          rationale: "Calculates space time $0.7 R_2 C$ instead of mark time $0.7(R_1 + R_2)C$.",
        },
        {
          value: 0.7 * 15 * 10,
          rationale: "Uses $R_1$ alone instead of $R_1 + R_2$.",
        },
        {
          value: 1.1 * (15 + 25) * 10,
          rationale: "Uses the monostable factor $1.1$ instead of the astable factor $0.7$.",
        },
      ],
      workedSolution: `$t_{\\mathrm{H}} = 0.7(R_1 + R_2)C = 0.7(15.0 + 25.0)\\times 10^3 \\times 10.0 \\times 10^{-6} = 0.280\\text{ s} = ${fmt3(qt1.tHighMs as number, "ms")}$.`,
      markCriterion: `Mark time equals ${fmt3(qt1.tHighMs as number, "ms")}.`,
      planSummary: "Calculate timer astable mark time using exact AQA charging constant.",
    }),
  );

  const t2 = {
    kind,
    mode: "555-astable",
    r1Kohm: 10,
    r2Kohm: 20,
    capacitanceUf: 4.7,
    supplyVoltageV: 9.0,
  };
  const qt2 = solveKind(kind, t2);
  items.push(
    makeCalcMcq(ctx, {
      slug: "elec-555-02",
      conceptId,
      kind,
      domain: "circuits",
      syllabi: elecTag(),
      difficulty: "standard",
      scenarioSpec: t2,
      requiredGivens: [
        { name: "r1Kohm", value: 10, unit: "kΩ", source: "stem" },
        { name: "r2Kohm", value: 20, unit: "kΩ", source: "stem" },
        { name: "capacitanceUf", value: 4.7, unit: "μF", source: "stem" },
      ],
      targetQuantityKey: "prfHz",
      unit: "Hz",
      stem: "A flashing warning beacon uses a 555 astable with $R_1 = 10.0\\text{ k}\\Omega$, $R_2 = 20.0\\text{ k}\\Omega$, and $C = 4.70\\text{ }\\mu\\text{F}$. Calculate its pulse repetition frequency (PRF).",
      distractors: [
        {
          value: 1 / (0.7 * (10 + 20) * 4.7 * 1e-3),
          rationale: "Uses $1/t_{\\mathrm{H}}$ instead of $1/(t_{\\mathrm{H}} + t_{\\mathrm{L}})$.",
        },
        {
          value: 1 / (0.7 * (10 + 20) * 4.7 * 1e-3 * 2),
          rationale: "Doubles $t_{\\mathrm{H}}$ instead of adding $t_{\\mathrm{L}} = 0.7 R_2 C$.",
        },
        {
          value: qt2.periodS as number,
          rationale: "Reports the period $T$ in seconds instead of frequency $1/T$.",
        },
      ],
      workedSolution: `$t_{\\mathrm{H}} = 0.7(30.0)(4.70) = 98.7\\text{ ms}$, $t_{\\mathrm{L}} = 0.7(20.0)(4.70) = 65.8\\text{ ms}$, so $T = 164.5\\text{ ms} = 0.1645\\text{ s}$ and $\\mathrm{PRF} = \\frac{1}{T} = ${fmt3(qt2.prfHz as number, "Hz")}$.`,
      markCriterion: `Pulse repetition frequency equals ${fmt3(qt2.prfHz as number, "Hz")}.`,
      planSummary: "Compute timer astable pulse repetition frequency from timing resistors and capacitor.",
    }),
  );

  const t3 = {
    kind,
    mode: "555-astable",
    r1Kohm: 36,
    r2Kohm: 18,
    capacitanceUf: 2.2,
    supplyVoltageV: 12.0,
  };
  const qt3 = solveKind(kind, t3);
  items.push(
    makeCalcMcq(ctx, {
      slug: "elec-555-03",
      conceptId,
      kind,
      domain: "circuits",
      syllabi: elecTag(),
      difficulty: "foundation",
      scenarioSpec: t3,
      requiredGivens: [
        { name: "r1Kohm", value: 36, unit: "kΩ", source: "stem" },
        { name: "r2Kohm", value: 18, unit: "kΩ", source: "stem" },
      ],
      targetQuantityKey: "markToSpaceRatio",
      stem: "A 555 astable oscillator is constructed with $R_1 = 36.0\\text{ k}\\Omega$, $R_2 = 18.0\\text{ k}\\Omega$, and capacitor $C$. Calculate its mark-to-space ratio $t_{\\mathrm{H}} / t_{\\mathrm{L}}$.",
      distractors: [
        {
          value: 36 / 18,
          rationale: "Computes $R_1/R_2$ instead of $(R_1 + R_2)/R_2$.",
        },
        {
          value: 18 / (36 + 18),
          rationale: "Inverts the mark-to-space ratio to $t_{\\mathrm{L}}/t_{\\mathrm{H}}$.",
        },
        {
          value: (36 + 18) / (36 + 2 * 18),
          rationale: "Calculates duty cycle $t_{\\mathrm{H}}/T$ instead of mark-to-space ratio $t_{\\mathrm{H}}/t_{\\mathrm{L}}$.",
        },
      ],
      workedSolution: `The factor $0.7 C$ cancels: $\\frac{t_{\\mathrm{H}}}{t_{\\mathrm{L}}} = \\frac{R_1 + R_2}{R_2} = \\frac{36.0 + 18.0}{18.0} = ${fmt3(qt3.markToSpaceRatio as number)}$.`,
      markCriterion: `Mark-to-space ratio equals ${fmt3(qt3.markToSpaceRatio as number)}.`,
      planSummary: "Compute timer astable mark-to-space ratio independent of capacitance.",
    }),
  );

  const t4 = {
    kind,
    mode: "555-monostable",
    r1Kohm: 68,
    r2Kohm: 10,
    capacitanceUf: 47,
    supplyVoltageV: 12.0,
  };
  const qt4 = solveKind(kind, t4);
  items.push(
    makeCalcMcq(ctx, {
      slug: "elec-555-04",
      conceptId,
      kind,
      domain: "circuits",
      syllabi: elecTag(),
      difficulty: "foundation",
      scenarioSpec: t4,
      requiredGivens: [
        { name: "r1Kohm", value: 68, unit: "kΩ", source: "stem" },
        { name: "capacitanceUf", value: 47, unit: "μF", source: "stem" },
      ],
      targetQuantityKey: "pulseDurationS",
      unit: "s",
      stem: "A staircase courtesy light uses a 555 monostable timer with timing resistor $R = 68.0\\text{ k}\\Omega$ and capacitor $C = 47.0\\text{ }\\mu\\text{F}$. Calculate the output pulse duration $T = 1.1 RC$ in seconds.",
      distractors: [
        {
          value: 0.7 * 68 * 47 * 1e-3,
          rationale: "Applies the astable factor $0.7$ instead of the monostable factor $1.1$.",
        },
        {
          value: 68 * 47 * 1e-3,
          rationale: "Computes time constant $RC$ without multiplying by $1.1$.",
        },
        {
          value: (qt4.pulseDurationS as number) * 1e3,
          rationale: "Leaves the result in milliseconds instead of seconds.",
        },
      ],
      workedSolution: `$T = 1.1 RC = 1.1(68.0 \\times 10^3)(47.0 \\times 10^{-6}) = ${fmt3(qt4.pulseDurationS as number, "s")}$.`,
      markCriterion: `Monostable pulse duration equals ${fmt3(qt4.pulseDurationS as number, "s")}.`,
      planSummary: "Compute timer monostable single-pulse duration from R and C.",
    }),
  );

  const t5 = {
    kind,
    mode: "schmitt-astable",
    r1Kohm: 22,
    r2Kohm: 22,
    capacitanceUf: 4.7,
    supplyVoltageV: 12.0,
  };
  const qt5 = solveKind(kind, t5);
  items.push(
    makeCalcMcq(ctx, {
      slug: "elec-555-05",
      conceptId,
      kind,
      domain: "circuits",
      syllabi: elecTag(),
      difficulty: "standard",
      scenarioSpec: t5,
      requiredGivens: [{ name: "supplyVoltageV", value: 12.0, unit: "V", source: "stem" }],
      targetQuantityKey: "hysteresisBandV",
      unit: "V",
      stem: "A Schmitt-trigger NOT-gate RC oscillator runs from a 12.0 V supply with an upper switching threshold at $\\frac{2}{3} V_{\\mathrm{s}}$ and a lower switching threshold at $\\frac{1}{3} V_{\\mathrm{s}}$. Calculate the width of the hysteresis voltage band between the two thresholds.",
      distractors: [
        {
          value: qt5.ustV as number,
          rationale: "Reports the upper switching threshold $\\frac{2}{3} V_{\\mathrm{s}}$ rather than the difference $\\text{UST} - \\text{LST}$.",
        },
        {
          value: 12.0,
          rationale: "Uses the full supply voltage instead of the threshold band.",
        },
        {
          value: 6.0,
          rationale: "Assumes half the supply voltage without computing $\\frac{2}{3}V_{\\mathrm{s}} - \\frac{1}{3}V_{\\mathrm{s}}$.",
        },
      ],
      workedSolution: `$V_{\\mathrm{UST}} = 8.00\\text{ V}$ and $V_{\\mathrm{LST}} = 4.00\\text{ V}$, giving a hysteresis band of $8.00 - 4.00 = ${fmt3(qt5.hysteresisBandV as number, "V")}$.`,
      markCriterion: `Hysteresis voltage band equals ${fmt3(qt5.hysteresisBandV as number, "V")}.`,
      planSummary: "Calculate Schmitt trigger hysteresis band between upper and lower switching thresholds.",
    }),
  );

  // 3 Pure Qualitative MCQs
  items.push(
    makeQualMcq(ctx, {
      slug: "elec-555-06",
      conceptId,
      kind,
      domain: "circuits",
      syllabi: elecTag(),
      difficulty: "foundation",
      scenarioSpec: t1,
      requiredGivens: [],
      targetQuantityKey: "markGreaterThanSpaceRule",
      stem: "In a standard two-resistor 555 astable oscillator without steering diodes, why is the mark time $t_{\\mathrm{H}}$ ALWAYS greater than the space time $t_{\\mathrm{L}}$?",
      distractors: [
        {
          text: "Discharge transistor pulls the capacitor down to negative supply voltage instead of one-third of supply.",
          rationale: "The 555 oscillates symmetrically between $\\frac{1}{3}V_{\\mathrm{s}}$ and $\\frac{2}{3}V_{\\mathrm{s}}$.",
        },
        {
          text: "Capacitor charges only through $R_2$ and discharges through $R_1 + R_2$ in series.",
          rationale: "Reverses the charging and discharging paths.",
        },
        {
          text: "Capacitance value automatically increases during the HIGH output state.",
          rationale: "Capacitance is fixed; the series resistance differs between charge and discharge.",
        },
      ],
      workedSolution: `Pin 7 shorts the junction between $R_1$ and $R_2$ to $0\\text{ V}$ during discharge, so the capacitor charges through both resistors in series but discharges only through the lower resistor so mark always exceeds space.`,
      planSummary: "Explain why standard timer astable mark duration always exceeds space duration.",
    }),
  );

  items.push(
    makeQualMcq(ctx, {
      slug: "elec-555-07",
      conceptId,
      kind,
      domain: "circuits",
      syllabi: elecTag(),
      difficulty: "foundation",
      scenarioSpec: t5,
      requiredGivens: [],
      targetQuantityKey: "schmittHysteresisRule",
      stem: "Why is a Schmitt-trigger NOT gate used instead of a standard single-threshold NOT gate to square up a slowly varying, noisy sensor waveform?",
      distractors: [
        {
          text: "Schmitt trigger removes the DC component of the sensor signal using an internal transformer.",
          rationale: "A Schmitt trigger is a DC-coupled logic gate using voltage hysteresis.",
        },
        {
          text: "Schmitt trigger amplifies small noise ripples linearly around a single midpoint voltage.",
          rationale: "A single midpoint causes chatter; hysteresis prevents chatter.",
        },
        {
          text: "Schmitt trigger slows down output rise times so digital counters cannot trigger.",
          rationale: "A Schmitt trigger produces crisp, fast logic transitions.",
        },
      ],
      workedSolution: `Because separate upper and lower switching thresholds provide hysteresis preventing noisy input signals from causing false switching, the output switches cleanly without multiple chatter transitions.`,
      planSummary: "Explain Schmitt-trigger hysteresis noise immunity.",
    }),
  );

  items.push(
    makeQualMcq(ctx, {
      slug: "elec-555-08",
      conceptId,
      kind,
      domain: "circuits",
      syllabi: elecTag(),
      difficulty: "foundation",
      questionStyle: "definition",
      scenarioSpec: t4,
      requiredGivens: [],
      targetQuantityKey: "monostableRoleRule",
      stem: "How does the output behaviour of a 555 monostable circuit differ from that of a 555 astable circuit?",
      distractors: [
        {
          text: "Produces a continuous free-running square wave that requires no trigger input.",
          rationale: "Describes an astable oscillator, not a monostable.",
        },
        {
          text: "Latches permanently HIGH until electrical power is switched off.",
          rationale: "A monostable returns automatically to its stable LOW state after $T = 1.1 RC$.",
        },
        {
          text: "Generates a sinusoidal carrier whose frequency equals $1/(2\\pi\\sqrt{RC})$.",
          rationale: "A 555 outputs digital rectangular pulses, not sinusoids.",
        },
      ],
      workedSolution: `A monostable has one stable state (LOW) and produces a single output pulse of fixed duration determined by R and C after each trigger ($T = 1.1 RC$).`,
      planSummary: "Contrast monostable single-pulse behaviour with astable free-running oscillation.",
    }),
  );

  // 4 Multi-part structured
  const tStructs = [
    {
      slug: "elec-555-09",
      difficulty: "standard" as const,
      spec: { kind, mode: "555-astable", r1Kohm: 20, r2Kohm: 30, capacitanceUf: 10, supplyVoltageV: 9.0 },
    },
    {
      slug: "elec-555-10",
      difficulty: "higher" as const,
      spec: { kind, mode: "555-astable", r1Kohm: 12, r2Kohm: 48, capacitanceUf: 2.5, supplyVoltageV: 12.0 },
    },
    {
      slug: "elec-555-11",
      difficulty: "standard" as const,
      spec: { kind, mode: "555-astable", r1Kohm: 40, r2Kohm: 20, capacitanceUf: 5.0, supplyVoltageV: 9.0 },
    },
    {
      slug: "elec-555-12",
      difficulty: "higher" as const,
      spec: { kind, mode: "555-monostable", r1Kohm: 120, r2Kohm: 10, capacitanceUf: 33, supplyVoltageV: 12.0 },
    },
  ];

  for (const cfg of tStructs) {
    const sp = cfg.spec;
    const q = solveKind(kind, sp);
    if (sp.mode === "555-astable") {
      const thStr = fmt3(q.tHighMs as number, "ms");
      const tlStr = fmt3(q.tLowMs as number, "ms");
      const prfStr = fmt3(q.prfHz as number, "Hz");
      const msStr = fmt3(q.markToSpaceRatio as number);
      items.push(
        makeStructured(ctx, {
          slug: cfg.slug,
          conceptId,
          kind,
          domain: "circuits",
          syllabi: elecTag(),
          difficulty: cfg.difficulty,
          scenarioSpec: sp,
          hiddenQuantities: ["tHighMs", "tLowMs", "prfHz", "markToSpaceRatio"],
          requiredGivens: [
            { name: "r1Kohm", value: sp.r1Kohm, unit: "kΩ", source: "stem" },
            { name: "r2Kohm", value: sp.r2Kohm, unit: "kΩ", source: "stem" },
            { name: "capacitanceUf", value: sp.capacitanceUf, unit: "μF", source: "stem" },
          ],
          stem: `A 555 astable clock generator produces the timing waveforms shown, using $R_1 = ${fmt3(sp.r1Kohm, "kΩ")}$, $R_2 = ${fmt3(sp.r2Kohm, "kΩ")}$, and $C = ${fmt3(sp.capacitanceUf, "μF")}$.`,
          parts: [
            {
              partId: "a",
              prompt: "Calculate the mark time $t_{\\mathrm{H}}$ in ms.",
              marks: 2,
              targetQuantityKey: "tHighMs",
              expectedAnswer: thStr,
              workingSteps: [
                `$t_{\\mathrm{H}} = 0.7(R_1 + R_2)C = 0.7(${sp.r1Kohm} + ${sp.r2Kohm})(${sp.capacitanceUf}) = ${thStr}$.`,
              ],
            },
            {
              partId: "b",
              prompt: "Calculate the space time $t_{\\mathrm{L}}$ in ms.",
              marks: 2,
              targetQuantityKey: "tLowMs",
              expectedAnswer: tlStr,
              workingSteps: [
                `$t_{\\mathrm{L}} = 0.7 R_2 C = 0.7(${sp.r2Kohm})(${sp.capacitanceUf}) = ${tlStr}$.`,
              ],
            },
            {
              partId: "c",
              prompt: "Calculate the pulse repetition frequency (PRF) in Hz.",
              marks: 2,
              dependsOnPartIds: ["a", "b"],
              targetQuantityKey: "prfHz",
              expectedAnswer: prfStr,
              workingSteps: [
                `Total period $T = t_{\\mathrm{H}} + t_{\\mathrm{L}} = ${fmt3(q.periodMs as number, "ms")}$.`,
                `$\\mathrm{PRF} = \\frac{1}{T} = ${prfStr}$.`,
              ],
            },
            {
              partId: "d",
              prompt: "Calculate the mark-to-space ratio $t_{\\mathrm{H}} / t_{\\mathrm{L}}$.",
              marks: 1,
              dependsOnPartIds: ["a", "b"],
              targetQuantityKey: "markToSpaceRatio",
              expectedAnswer: msStr,
              workingSteps: [
                `$\\frac{t_{\\mathrm{H}}}{t_{\\mathrm{L}}} = \\frac{R_1 + R_2}{R_2} = ${msStr}$.`,
              ],
            },
          ],
          workedSolution: `(a) $t_{\\mathrm{H}} = ${thStr}$. (b) $t_{\\mathrm{L}} = ${tlStr}$. (c) $\\mathrm{PRF} = 1/(t_{\\mathrm{H}} + t_{\\mathrm{L}}) = ${prfStr}$. (d) Mark-to-space ratio $= ${msStr}$.`,
          markScheme: [
            { code: "M1", criterion: "Uses $t_{\\mathrm{H}} = 0.7(R_1 + R_2)C$.", marks: 1, partId: "a" },
            { code: "A1", criterion: `Obtains ${thStr}.`, marks: 1, partId: "a" },
            { code: "M1", criterion: "Uses $t_{\\mathrm{L}} = 0.7 R_2 C$.", marks: 1, partId: "b" },
            { code: "A1", criterion: `Obtains ${tlStr}.`, marks: 1, partId: "b" },
            { code: "M1", criterion: "Sums $T = t_{\\mathrm{H}} + t_{\\mathrm{L}}$ in seconds and takes $1/T$.", marks: 1, partId: "c" },
            { code: "A1", criterion: `Obtains ${prfStr}.`, marks: 1, partId: "c" },
            { code: "A1", criterion: `Mark-to-space ratio $= ${msStr}$.`, marks: 1, partId: "d" },
          ],
          planSummary: "Complete timer astable mark, space, PRF, and mark-to-space analysis.",
        }),
      );
    } else {
      const durStr = fmt3(q.pulseDurationS as number, "s");
      const ustStr = fmt3(q.ustV as number, "V");
      items.push(
        makeStructured(ctx, {
          slug: cfg.slug,
          conceptId,
          kind,
          domain: "circuits",
          syllabi: elecTag(),
          difficulty: cfg.difficulty,
          scenarioSpec: sp,
          hiddenQuantities: ["pulseDurationS", "ustV", "monostableRoleRule"],
          requiredGivens: [
            { name: "r1Kohm", value: sp.r1Kohm, unit: "kΩ", source: "stem" },
            { name: "capacitanceUf", value: sp.capacitanceUf, unit: "μF", source: "stem" },
            { name: "supplyVoltageV", value: sp.supplyVoltageV, unit: "V", source: "stem" },
          ],
          stem: `A 555 monostable delay circuit operates from a ${fmt3(sp.supplyVoltageV, "V")} supply with timing resistor $R = ${sp.r1Kohm}\\text{ k}\\Omega$ and capacitor $C = ${sp.capacitanceUf}\\text{ }\\mu\\text{F}$.`,
          parts: [
            {
              partId: "a",
              prompt: "Calculate the capacitor threshold voltage $\\frac{2}{3} V_{\\mathrm{s}}$ at which the output switches back LOW.",
              marks: 1,
              targetQuantityKey: "ustV",
              expectedAnswer: ustStr,
              workingSteps: [
                `$V_{\\mathrm{th}} = \\frac{2}{3}(${fmt3(sp.supplyVoltageV)}) = ${ustStr}$.`,
              ],
            },
            {
              partId: "b",
              prompt: "Calculate the fixed duration of the output pulse in seconds.",
              marks: 2,
              targetQuantityKey: "pulseDurationS",
              expectedAnswer: durStr,
              workingSteps: [
                `$T = 1.1 RC = 1.1(${sp.r1Kohm} \\times 10^3)(${sp.capacitanceUf} \\times 10^{-6}) = ${durStr}$.`,
              ],
            },
            {
              partId: "c",
              prompt: "Describe the function of a monostable circuit in a switch-debouncing application.",
              marks: 2,
              targetMode: "qualitative",
              targetQuantityKey: "monostableRoleRule",
              expectedAnswer:
                "It produces a single output pulse of fixed duration determined by R and C after each trigger, ignoring rapid mechanical switch bounces during the pulse.",
              workingSteps: [
                "Mechanical contacts bounce several times over milliseconds when pressed.",
                "The monostable produces a single output pulse of fixed duration determined by R and C after each trigger, masking the bounces.",
              ],
            },
          ],
          workedSolution: `(a) Threshold $= \\frac{2}{3} V_{\\mathrm{s}} = ${ustStr}$. (b) $T = 1.1 RC = ${durStr}$. (c) Produces a single output pulse of fixed duration determined by R and C after each trigger, masking mechanical contact bounce.`,
          markScheme: [
            { code: "A1", criterion: `Calculates $\\frac{2}{3}V_{\\mathrm{s}} = ${ustStr}$.`, marks: 1, partId: "a" },
            { code: "M1", criterion: "Applies $T = 1.1 RC$ with SI prefixes.", marks: 1, partId: "b" },
            { code: "A1", criterion: `Obtains $T = ${durStr}$.`, marks: 1, partId: "b" },
            { code: "B1", criterion: "States that it produces a single clean output pulse of fixed duration determined by $R$ and $C$.", marks: 1, partId: "c" },
            { code: "B1", criterion: "Explains that subsequent mechanical bounces during the pulse are ignored.", marks: 1, partId: "c" },
          ],
          planSummary: "Timer monostable threshold, pulse duration, and switch-debouncing explanation.",
        }),
      );
    }
  }

  return items;
}

/* ========================================================================== */
/*  12. Plugin 12: al-opt-elec-combinational-logic (12 items)                 */
/* ========================================================================== */

function buildCombinationalLogicItems(ctx: BuildContext): CandidateQuestionInput[] {
  const kind = "al-opt-elec-combinational-logic";
  const conceptId = "kirchhoff-dc-circuits";
  const items: CandidateQuestionInput[] = [];

  // 4 Calc/Eval MCQs
  const lg1 = { kind, circuitId: "eor-from-gates" as LogicCircuitId, inputA: 1, inputB: 0, inputC: 0 };
  const qlg1 = solveKind(kind, lg1);
  items.push(
    makeCalcMcq(ctx, {
      slug: "elec-lg-01",
      conceptId,
      kind,
      domain: "pure-calculation",
      syllabi: elecTag(),
      difficulty: "foundation",
      scenarioSpec: lg1,
      requiredGivens: [],
      targetQuantityKey: "highRowCount",
      integerMode: true,
      stem: "The five-gate logic circuit shown implements $Q = (\\bar{A} \\cdot B) + (A \\cdot \\bar{B})$ from two binary inputs A and B. Across all four rows of its complete two-input truth table, how many input combinations produce output $Q = 1$?",
      distractors: [
        { value: 1, rationale: "Confuses EOR with a two-input AND gate (only one HIGH row)." },
        { value: 3, rationale: "Confuses EOR with an inclusive OR gate (three HIGH rows)." },
        { value: 4, rationale: "Assumes output is HIGH for all four rows." },
      ],
      workedSolution: `$Q = (\\bar{A} \\cdot B) + (A \\cdot \\bar{B})$ is HIGH for $(A, B) = (0, 1)$ and $(1, 0)$ only, giving ${fmtInt(qlg1.highRowCount as number)} HIGH rows.`,
      markCriterion: `Exactly ${fmtInt(qlg1.highRowCount as number)} input combinations yield $Q = 1$.`,
      planSummary: "Count HIGH output rows of an explicit EOR gate network.",
    }),
  );

  const lg2 = { kind, circuitId: "three-input-alarm" as LogicCircuitId, inputA: 1, inputB: 0, inputC: 0 };
  const qlg2 = solveKind(kind, lg2);
  items.push(
    makeCalcMcq(ctx, {
      slug: "elec-lg-02",
      conceptId,
      kind,
      domain: "pure-calculation",
      syllabi: elecTag(),
      difficulty: "standard",
      scenarioSpec: lg2,
      requiredGivens: [],
      targetQuantityKey: "highRowCount",
      integerMode: true,
      stem: "The three-input safety interlock shown computes $Q = (A \\cdot B) + \\bar{C}$ across eight possible input states $(A, B, C)$. For how many of the eight rows in the truth table is the alarm output $Q = 1$?",
      distractors: [
        { value: 4, rationale: "Counts only the four rows where $C = 0$ and forgets $(A, B, C) = (1, 1, 1)$." },
        { value: 6, rationale: "Double-counts $(1, 1, 0)$ where both $A \\cdot B = 1$ and $\\bar{C} = 1$." },
        { value: 3, rationale: "Confuses the final OR gate with an AND gate." },
      ],
      workedSolution: `$\\bar{C} = 1$ covers 4 rows ($C = 0$). Among the $C = 1$ rows, only $(1, 1, 1)$ satisfies $A \\cdot B = 1$. Total HIGH rows $= 4 + 1 = ${fmtInt(qlg2.highRowCount as number)}$.`,
      markCriterion: `Alarm output is HIGH for ${fmtInt(qlg2.highRowCount as number)} rows.`,
      planSummary: "Evaluate complete three-input truth table HIGH row count.",
    }),
  );

  const lg3 = { kind, circuitId: "three-input-simplify" as LogicCircuitId, inputA: 1, inputB: 0, inputC: 1 };
  const qlg3 = solveKind(kind, lg3);
  items.push(
    makeCalcMcq(ctx, {
      slug: "elec-lg-03",
      conceptId,
      kind,
      domain: "pure-calculation",
      syllabi: elecTag(),
      difficulty: "higher",
      scenarioSpec: lg3,
      requiredGivens: [],
      targetQuantityKey: "highRowCount",
      integerMode: true,
      stem: "The five-gate three-input logic network shown evaluates $Q = ((A \\cdot B) + (A \\cdot \\bar{B})) \\cdot C$. Across all eight combinations of $(A, B, C)$, for how many rows is $Q = 1$?",
      distractors: [
        { value: 1, rationale: "Assumes $Q = A \\cdot B \\cdot C$, missing that $B + \\bar{B} = 1$." },
        { value: 4, rationale: "Omits the final AND with $C$, leaving $Q = A$." },
        { value: 3, rationale: "Misapplies Boolean absorption on $(A \\cdot B) + (A \\cdot \\bar{B})$." },
      ],
      workedSolution: `Factorising gives $A(B + \\bar{B}) \\cdot C = A \\cdot 1 \\cdot C = A \\cdot C$. This is HIGH for $(1, 0, 1)$ and $(1, 1, 1)$: exactly ${fmtInt(qlg3.highRowCount as number)} rows.`,
      markCriterion: `Exactly ${fmtInt(qlg3.highRowCount as number)} rows give $Q = 1$.`,
      planSummary: "Simplify a three-input Boolean expression and count HIGH truth-table rows.",
    }),
  );

  const lg4 = { kind, circuitId: "demorgan-nand-equiv" as LogicCircuitId, inputA: 0, inputB: 1, inputC: 0 };
  const qlg4 = solveKind(kind, lg4);
  items.push(
    makeCalcMcq(ctx, {
      slug: "elec-lg-04",
      conceptId,
      kind,
      domain: "pure-calculation",
      syllabi: elecTag(),
      difficulty: "foundation",
      scenarioSpec: lg4,
      requiredGivens: [],
      targetQuantityKey: "highRowCount",
      integerMode: true,
      stem: "The circuit shown feeds inverted inputs $\\bar{A}$ and $\\bar{B}$ into a two-input OR gate so that $Q = \\bar{A} + \\bar{B}$. Across the four rows of its truth table, how many combinations give $Q = 1$?",
      distractors: [
        { value: 1, rationale: "Confuses $\\bar{A} + \\bar{B}$ (NAND) with $\\bar{A} \\cdot \\bar{B}$ (NOR)." },
        { value: 2, rationale: "Confuses De Morgan NAND equivalence with EOR." },
        { value: 4, rationale: "Assumes $(1, 1)$ also gives $Q = 1$." },
      ],
      workedSolution: `By De Morgan's theorem, $\\bar{A} + \\bar{B} = \\overline{A \\cdot B}$ (NAND), which is HIGH for $(0, 0)$, $(0, 1)$, and $(1, 0)$ — a total of ${fmtInt(qlg4.highRowCount as number)} rows.`,
      markCriterion: `Truth table has ${fmtInt(qlg4.highRowCount as number)} HIGH rows.`,
      planSummary: "Apply De Morgan's theorem to count HIGH states of inverted-input OR.",
    }),
  );

  // 4 Pure Qualitative / Boolean Equivalence MCQs
  items.push(
    makeQualMcq(ctx, {
      slug: "elec-lg-05",
      conceptId,
      kind,
      domain: "pure-calculation",
      syllabi: elecTag(),
      difficulty: "foundation",
      scenarioSpec: lg4,
      requiredGivens: [],
      targetQuantityKey: "equivalentSingleGate",
      stem: "Applying De Morgan's theorem to the three-gate network shown ($Q = \\bar{A} + \\bar{B}$), which single two-input logic gate is logically identical to the entire circuit?",
      distractors: [
        { text: "Single two-input NOR gate.", rationale: "NOR equals $\\overline{A + B} = \\bar{A} \\cdot \\bar{B}$, not $\\bar{A} + \\bar{B}$." },
        { text: "Single two-input AND gate.", rationale: "Forgets the overall inversion in $\\overline{A \\cdot B}$." },
        { text: "Single two-input EOR gate.", rationale: "EOR is LOW at $(0, 0)$, whereas $\\bar{A} + \\bar{B}$ is HIGH at $(0, 0)$." },
      ],
      workedSolution: `By De Morgan's law, $\\bar{A} + \\bar{B} = \\overline{A \\cdot B}$, which is a single two-input NAND gate.`,
      planSummary: "Identify single-gate De Morgan equivalence for not-A OR not-B.",
    }),
  );

  const lgNor = { kind, circuitId: "demorgan-nor-equiv" as LogicCircuitId, inputA: 0, inputB: 0, inputC: 0 };
  items.push(
    makeQualMcq(ctx, {
      slug: "elec-lg-06",
      conceptId,
      kind,
      domain: "pure-calculation",
      syllabi: elecTag(),
      difficulty: "foundation",
      scenarioSpec: lgNor,
      requiredGivens: [],
      targetQuantityKey: "equivalentSingleGate",
      stem: "In the logic schematic shown, inputs A and B each pass through a NOT gate before entering an AND gate ($Q = \\bar{A} \\cdot \\bar{B}$). Which single two-input logic gate has the exact same truth table?",
      distractors: [
        { text: "Single two-input NAND gate.", rationale: "Confuses $\\bar{A} \\cdot \\bar{B} = \\overline{A + B}$ (NOR) with $\\bar{A} + \\bar{B}$ (NAND)." },
        { text: "Single two-input OR gate.", rationale: "Omits the final inversion." },
        { text: "Single two-input EOR gate.", rationale: "EOR is HIGH for $(0, 1)$ and $(1, 0)$, whereas $\\bar{A} \\cdot \\bar{B}$ is HIGH only at $(0, 0)$." },
      ],
      workedSolution: `By De Morgan's theorem, $\\bar{A} \\cdot \\bar{B} = \\overline{A + B}$, which is a single two-input NOR gate.`,
      planSummary: "Identify single-gate De Morgan equivalence for not-A AND not-B.",
    }),
  );

  const lgNandOr = { kind, circuitId: "nand-only-or" as LogicCircuitId, inputA: 1, inputB: 0, inputC: 0 };
  items.push(
    makeQualMcq(ctx, {
      slug: "elec-lg-07",
      conceptId,
      kind,
      domain: "pure-calculation",
      syllabi: elecTag(),
      difficulty: "standard",
      scenarioSpec: lgNandOr,
      requiredGivens: [],
      targetQuantityKey: "equivalentSingleGate",
      stem: "The universal NAND-only network shown ties both inputs of the first NAND gate to A, ties both inputs of the second NAND gate to B, and feeds their outputs D and E into a third NAND gate. What single gate function does this three-NAND arrangement synthesise?",
      distractors: [
        { text: "Single two-input AND gate.", rationale: "Inverting the inputs of a NAND gate produces OR, not AND." },
        { text: "Single two-input NOR gate.", rationale: "Forgets the double inversion cancels out: $\\overline{\\bar{A} \\cdot \\bar{B}} = A + B$." },
        { text: "Single two-input EOR gate.", rationale: "Synthesising EOR requires four NAND gates, not three." },
      ],
      workedSolution: `Each tied NAND acts as an inverter ($D = \\bar{A}$, $E = \\bar{B}$). The output NAND computes $Q = \\overline{\\bar{A} \\cdot \\bar{B}} = \\overline{\\bar{A}} + \\overline{\\bar{B}} = A + B$, a single two-input OR gate.`,
      planSummary: "Verify universal NAND-only synthesis of an OR gate.",
    }),
  );

  items.push(
    makeQualMcq(ctx, {
      slug: "elec-lg-08",
      conceptId,
      kind,
      domain: "pure-calculation",
      syllabi: elecTag(),
      difficulty: "foundation",
      scenarioSpec: lgNandOr,
      requiredGivens: [],
      targetQuantityKey: "nandEconomyRule",
      stem: "Why do commercial PCB designers frequently replace a mix of separate NOT, AND, and OR gates with an all-NAND implementation even when the total gate count increases slightly?",
      distractors: [
        {
          text: "NAND gates require no DC power supply rails to operate.",
          rationale: "Every active logic IC requires $V_{\\mathrm{DD}}$ and $0\\text{ V}$ power pins.",
        },
        {
          text: "NAND gates are analogue amplifiers that increase signal bandwidth.",
          rationale: "NAND gates are purely digital switching elements.",
        },
        {
          text: "NAND gates eliminate the need to obey De Morgan's laws.",
          rationale: "De Morgan's laws are the exact tool used to convert circuits to NAND-only form.",
        },
      ],
      workedSolution: `Logic ICs typically package four gates of one type per chip, so building circuits from NAND gates alone uses one type of quad integrated circuit reducing cost and unused gates.`,
      planSummary: "Explain manufacturing economy of universal NAND-only IC synthesis.",
    }),
  );

  // 4 Multi-part structured
  const lgStructs: Array<{
    slug: string;
    difficulty: QuestionDifficulty;
    cid: LogicCircuitId;
    a: number;
    b: number;
    c: number;
    promptContext: string;
    booleanFormula: string;
  }> = [
    {
      slug: "elec-lg-09",
      difficulty: "standard",
      cid: "eor-from-gates",
      a: 1,
      b: 0,
      c: 0,
      promptContext: "a two-input five-gate comparator network",
      booleanFormula: "$Q = (\\bar{A} \\cdot B) + (A \\cdot \\bar{B})$",
    },
    {
      slug: "elec-lg-10",
      difficulty: "standard",
      cid: "nand-only-or",
      a: 0,
      b: 1,
      c: 0,
      promptContext: "a three-NAND universal gate synthesis block",
      booleanFormula: "$Q = \\overline{\\bar{A} \\cdot \\bar{B}} = A + B$",
    },
    {
      slug: "elec-lg-11",
      difficulty: "higher",
      cid: "three-input-simplify",
      a: 1,
      b: 0,
      c: 1,
      promptContext: "a five-gate three-input industrial controller",
      booleanFormula: "$Q = ((A \\cdot B) + (A \\cdot \\bar{B})) \\cdot C = A \\cdot C$",
    },
    {
      slug: "elec-lg-12",
      difficulty: "higher",
      cid: "demorgan-nor-equiv",
      a: 0,
      b: 0,
      c: 0,
      promptContext: "a three-gate inverted-input interlock",
      booleanFormula: "$Q = \\bar{A} \\cdot \\bar{B} = \\overline{A + B}$",
    },
  ];

  for (const cfg of lgStructs) {
    const sp = {
      kind,
      circuitId: cfg.cid,
      inputA: cfg.a,
      inputB: cfg.b,
      inputC: cfg.c,
    };
    const q = solveKind(kind, sp);
    const highCntStr = fmtInt(q.highRowCount as number);
    const singleGateStr = q.equivalentSingleGate as string;
    const simpDesc = q.simplifiedBooleanDesc as string;
    items.push(
      makeStructured(ctx, {
        slug: cfg.slug,
        conceptId,
        kind,
        domain: "pure-calculation",
        syllabi: elecTag(),
        difficulty: cfg.difficulty,
        scenarioSpec: sp,
        hiddenQuantities: [
          "highRowCount",
          "equivalentSingleGate",
          "simplifiedBooleanDesc",
        ],
        requiredGivens: [],
        stem: `The diagram shows ${cfg.promptContext} with intermediate nodes D and E leading to final output Q.`,
        parts: [
          {
            partId: "a",
            prompt: "Deduce the Boolean expression for Q in terms of the inputs and simplify it using Boolean algebra or De Morgan's laws.",
            marks: 3,
            targetMode: "qualitative",
            targetQuantityKey: "simplifiedBooleanDesc",
            expectedAnswer: `${cfg.booleanFormula} (${simpDesc}).`,
            workingSteps: [
              "Write intermediate expressions at nodes D and E from the gates in the schematic.",
              `Combine into final output ${cfg.booleanFormula}.`,
              `Simplify to confirm: ${simpDesc}.`,
            ],
          },
          {
            partId: "b",
            prompt: `State how many rows of the complete ${q.totalRows}-row truth table yield output $Q = 1$.`,
            marks: 2,
            dependsOnPartIds: ["a"],
            targetQuantityKey: "highRowCount",
            expectedAnswer: `${highCntStr} rows`,
            workingSteps: [
              `Evaluate ${cfg.booleanFormula} over all ${q.totalRows} binary combinations.`,
              `Count output $Q = 1$ entries: ${highCntStr} rows.`,
            ],
          },
          {
            partId: "c",
            prompt: "Identify the single equivalent two-input logic gate that reproduces this circuit.",
            marks: 1,
            dependsOnPartIds: ["a"],
            targetMode: "qualitative",
            targetQuantityKey: "equivalentSingleGate",
            expectedAnswer: capitalizeSentence(singleGateStr),
            workingSteps: [
              `Match the simplified expression directly to a ${singleGateStr}.`,
            ],
          },
        ],
        workedSolution: `(a) ${cfg.booleanFormula} (${simpDesc}). (b) ${highCntStr} rows of the ${q.totalRows}-row truth table give $Q = 1$. (c) Equivalent to a ${singleGateStr}.`,
        markScheme: [
          { code: "B1", criterion: "Correctly expresses intermediate nodes D and E in terms of inputs.", marks: 1, partId: "a" },
          { code: "B1", criterion: `Writes exact unsimplified Boolean expression for Q (${cfg.booleanFormula}).`, marks: 1, partId: "a" },
          { code: "B1", criterion: `Correctly simplifies expression: ${simpDesc}.`, marks: 1, partId: "a" },
          { code: "M1", criterion: `Evaluates all ${q.totalRows} input rows accurately.`, marks: 1, partId: "b" },
          { code: "A1", criterion: `States ${highCntStr} rows give $Q = 1$.`, marks: 1, partId: "b" },
          { code: "B1", criterion: `Identifies equivalent ${singleGateStr}.`, marks: 1, partId: "c" },
        ],
        planSummary: "Deduce Boolean expression from logic gate diagram, simplify, count HIGH rows, and match single gate.",
      }),
    );
  }

  return items;
}

/* ========================================================================== */
/*  13. Plugin 13: al-opt-elec-sequential-counters (12 items, 2 × 6m LoRs)    */
/* ========================================================================== */

function buildSequentialCountersItems(ctx: BuildContext): CandidateQuestionInput[] {
  const kind = "al-opt-elec-sequential-counters";
  const conceptId = "kirchhoff-dc-circuits";
  const items: CandidateQuestionInput[] = [];

  const sc1 = {
    kind,
    mode: "binary-ripple",
    clockFreqHz: 3200,
    numStages: 4,
    moduloN: 16,
    pulseCount: 29,
  };
  const qsc1 = solveKind(kind, sc1);
  items.push(
    makeCalcMcq(ctx, {
      slug: "elec-sc-01",
      conceptId,
      kind,
      domain: "graphs",
      syllabi: elecTag(),
      difficulty: "foundation",
      scenarioSpec: sc1,
      requiredGivens: [
        { name: "clockFreqHz", value: 3200, unit: "Hz", source: "stem" },
        { name: "numStages", value: 4, source: "stem" },
      ],
      targetQuantityKey: "outputFreqHz",
      unit: "Hz",
      stem: "A binary ripple counter with 4 stages built from rising-edge D-type flip-flops is clocked at 3200 Hz. What is the output frequency at the most significant bit $Q_3$?",
      distractors: [
        { value: 3200 / 4, rationale: "Divides by stage count $4$ instead of $2^4 = 16$." },
        { value: 3200 / 8, rationale: "Divides by $2^3 = 8$ (frequency at $Q_2$) instead of $2^4 = 16$." },
        { value: 3200 / 10, rationale: "Assumes a decade mod-10 counter instead of a 4-bit binary ripple counter." },
      ],
      workedSolution: `Each D-type stage halves the frequency: $f_{\\mathrm{out}} = \\frac{f_{\\mathrm{clk}}}{2^n} = \\frac{3200}{2^4} = \\frac{3200}{16} = ${fmt3(qsc1.outputFreqHz as number, "Hz")}$.`,
      markCriterion: `Output frequency at $Q_3$ equals ${fmt3(qsc1.outputFreqHz as number, "Hz")}.`,
      planSummary: "Compute frequency division of a multi-stage binary ripple counter.",
    }),
  );

  const sc2 = {
    kind,
    mode: "binary-ripple",
    clockFreqHz: 1000,
    numStages: 4,
    moduloN: 16,
    pulseCount: 39,
  };
  const qsc2 = solveKind(kind, sc2);
  items.push(
    makeCalcMcq(ctx, {
      slug: "elec-sc-02",
      conceptId,
      kind,
      domain: "graphs",
      syllabi: elecTag(),
      difficulty: "foundation",
      scenarioSpec: sc2,
      requiredGivens: [
        { name: "numStages", value: 4, source: "stem" },
        { name: "pulseCount", value: 39, source: "stem" },
      ],
      targetQuantityKey: "countAfterPulses",
      integerMode: true,
      stem: "A binary ripple counter with 4 stages starts reset at decimal 0. What decimal value is stored in the counter immediately after 39 rising clock pulses arrive?",
      distractors: [
        { value: 39 % 10, rationale: "Applies modulus 10 instead of modulus $2^4 = 16$." },
        { value: 39 % 15, rationale: "Uses modulus $2^4 - 1 = 15$ instead of $16$." },
        { value: 8, rationale: "Off-by-one error when wrapping past 15 back to 0." },
      ],
      workedSolution: `A 4-bit binary counter has $2^4 = 16$ states ($0$ to $15$). After 39 pulses, $39 = 2 \\times 16 + 7$, so the stored decimal count is ${fmtInt(qsc2.countAfterPulses as number)} (binary 0111).`,
      markCriterion: `Stored decimal value equals ${fmtInt(qsc2.countAfterPulses as number)}.`,
      planSummary: "Find modular state of a binary counter after a sequence of clock pulses.",
    }),
  );

  const sc3 = {
    kind,
    mode: "modulo-n-bcd",
    clockFreqHz: 600,
    numStages: 4,
    moduloN: 10,
    pulseCount: 43,
  };
  const qsc3 = solveKind(kind, sc3);
  items.push(
    makeCalcMcq(ctx, {
      slug: "elec-sc-03",
      conceptId,
      kind,
      domain: "graphs",
      syllabi: elecTag(),
      difficulty: "standard",
      scenarioSpec: sc3,
      requiredGivens: [
        { name: "clockFreqHz", value: 600, unit: "Hz", source: "stem" },
        { name: "moduloN", value: 10, source: "stem" },
      ],
      targetQuantityKey: "outputFreqHz",
      unit: "Hz",
      stem: "A BCD counter of modulus 10 uses an AND reset gate detecting binary 1010 ($Q_3 \\cdot Q_1$) to clear back to 0000 on every 10th clock pulse. If the input clock is 600 Hz, what is the repetition frequency of the reset pulse?",
      distractors: [
        { value: 600 / 16, rationale: "Divides by $16$ as if no reset decoding gate were connected." },
        { value: 600 / 9, rationale: "Divides by maximum state $9$ instead of modulus $10$." },
        { value: 600 / 8, rationale: "Divides by $2^3 = 8$ instead of $10$." },
      ],
      workedSolution: `Because the counter recycles every 10 clock pulses (states 0 to 9), the reset repetition frequency is $f_{\\mathrm{out}} = \\frac{600}{10} = ${fmt3(qsc3.outputFreqHz as number, "Hz")}$.`,
      markCriterion: `Reset repetition frequency equals ${fmt3(qsc3.outputFreqHz as number, "Hz")}.`,
      planSummary: "Calculate output frequency of a decade BCD counter.",
    }),
  );

  const sc4 = {
    kind,
    mode: "modulo-n-bcd",
    clockFreqHz: 750,
    numStages: 3,
    moduloN: 6,
    pulseCount: 28,
  };
  const qsc4 = solveKind(kind, sc4);
  items.push(
    makeCalcMcq(ctx, {
      slug: "elec-sc-04",
      conceptId,
      kind,
      domain: "graphs",
      syllabi: elecTag(),
      difficulty: "standard",
      scenarioSpec: sc4,
      requiredGivens: [
        { name: "clockFreqHz", value: 750, unit: "Hz", source: "stem" },
        { name: "moduloN", value: 6, source: "stem" },
      ],
      targetQuantityKey: "outputPeriodMs",
      unit: "ms",
      stem: "A digital stopwatch tens-of-seconds divider uses a counter of modulus 6 clocked at 750 Hz (counting 0 to 5 before resetting on binary 110). Calculate the period of its divided output cycle in ms.",
      distractors: [
        { value: (1 / (750 / 8)) * 1e3, rationale: "Uses 3-bit natural modulus 8 instead of decoded modulus 6." },
        { value: (1 / (750 / 5)) * 1e3, rationale: "Uses highest displayed digit 5 instead of 6 states." },
        { value: 750 / 6, rationale: "Reports output frequency in Hz instead of period in ms." },
      ],
      workedSolution: `Output frequency $f_{\\mathrm{out}} = \\frac{750}{6} = 125\\text{ Hz}$, giving output period $T = \\frac{1}{125} = 8.00 \\times 10^{-3}\\text{ s} = ${fmt3(qsc4.outputPeriodMs as number, "ms")}$.`,
      markCriterion: `Divided output period equals ${fmt3(qsc4.outputPeriodMs as number, "ms")}.`,
      planSummary: "Find divided cycle period of a modulo-six counter.",
    }),
  );

  // 3 Pure Qualitative MCQs
  items.push(
    makeQualMcq(ctx, {
      slug: "elec-sc-05",
      conceptId,
      kind,
      domain: "graphs",
      syllabi: elecTag(),
      difficulty: "foundation",
      scenarioSpec: sc1,
      requiredGivens: [],
      targetQuantityKey: "dTypeDivideRule",
      stem: "How is a single rising-edge triggered D-type flip-flop wired to act as a divide-by-2 frequency divider?",
      distractors: [
        {
          text: "Connecting Q directly back to the D input toggles Q on every rising clock edge.",
          rationale: "Connecting Q to D latches the current state permanently without toggling.",
        },
        {
          text: "Holding D permanently at logic 1 makes Q oscillate at half the clock frequency.",
          rationale: "Holding $D = 1$ locks $Q = 1$ after the first rising edge.",
        },
        {
          text: "Connecting the clock signal directly to the master reset pin halves the output frequency.",
          rationale: "Clocking reset clears Q to 0 rather than toggling.",
        },
      ],
      workedSolution: `Because $D = \\bar{Q}$ supplies the opposite logic level before each clock edge, connecting not-Q back to the D input toggles Q on every rising clock edge dividing frequency by two.`,
      planSummary: "Verify D-type flip-flop not-Q to D feedback for divide-by-two operation.",
    }),
  );

  items.push(
    makeQualMcq(ctx, {
      slug: "elec-sc-06",
      conceptId,
      kind,
      domain: "graphs",
      syllabi: elecTag(),
      difficulty: "standard",
      scenarioSpec: sc3,
      requiredGivens: [],
      targetQuantityKey: "resetGateDescription",
      stem: "A 4-bit binary counter ($Q_3 Q_2 Q_1 Q_0$) is modified into a modulo-10 BCD counter counting from 0 to 9 before resetting instantly on the 10th pulse (binary 1010). Which active-high reset decoding connection achieves this?",
      distractors: [
        {
          text: "Q3 and Q0 connected to an AND gate driving master reset.",
          rationale: "Detects binary 1001 (decimal 9), truncating the count to modulo-9 (0 to 8).",
        },
        {
          text: "Q3 and Q2 connected to an AND gate driving master reset.",
          rationale: "Detects binary 1100 (decimal 12), creating a modulo-12 counter.",
        },
        {
          text: "Q2 and Q1 connected to an AND gate driving master reset.",
          rationale: "Detects binary 0110 (decimal 6), creating a modulo-6 counter.",
        },
      ],
      workedSolution: `Decimal 10 is binary $1010$ ($Q_3 = 1, Q_2 = 0, Q_1 = 1, Q_0 = 0$), so Q3 and Q1 connected to an AND gate driving master reset clears all flip-flops momentarily on count 10.`,
      planSummary: "Select exact AND reset gate inputs for a decade BCD counter.",
    }),
  );

  const scJ = {
    kind,
    mode: "johnson-decade",
    clockFreqHz: 400,
    numStages: 5,
    moduloN: 10,
    pulseCount: 17,
  };
  items.push(
    makeQualMcq(ctx, {
      slug: "elec-sc-07",
      conceptId,
      kind,
      domain: "graphs",
      syllabi: elecTag(),
      difficulty: "standard",
      scenarioSpec: scJ,
      requiredGivens: [],
      targetQuantityKey: "johnsonVsBcdRule",
      stem: "An electronics student needs to light ten traffic-sequence LEDs one at a time in strict rotation. Why is a 4017 Johnson decade counter preferred over a 4-bit BCD counter for this specific task?",
      distractors: [
        {
          text: "Johnson counter outputs a weighted 4-bit binary code that directly drives seven-segment displays.",
          rationale: "A BCD counter outputs binary weights; a Johnson counter outputs 1-of-10 sequential decoded lines.",
        },
        {
          text: "Johnson counter doubles the clock frequency on each of its ten outputs.",
          rationale: "Each decoded output pulses at $f_{\\mathrm{clk}}/10$.",
        },
        {
          text: "BCD counter cannot count past decimal 7 without a Johnson stage.",
          rationale: "A 4-bit BCD counter counts cleanly from 0 to 9.",
        },
      ],
      workedSolution: `For sequential 1-of-10 activation, a johnson decade counter activates one decoded output sequentially without extra decoding gates whereas a BCD counter outputs binary weights needing a decoder.`,
      planSummary: "Contrast Johnson decade decoded outputs with BCD binary-weighted outputs.",
    }),
  );

  // 3 Multi-part structured
  const scStructs = [
    {
      slug: "elec-sc-08",
      difficulty: "standard" as const,
      spec: { kind, mode: "binary-ripple", clockFreqHz: 2400, numStages: 4, moduloN: 16, pulseCount: 53 },
    },
    {
      slug: "elec-sc-09",
      difficulty: "standard" as const,
      spec: { kind, mode: "modulo-n-bcd", clockFreqHz: 800, numStages: 4, moduloN: 10, pulseCount: 64 },
    },
    {
      slug: "elec-sc-10",
      difficulty: "higher" as const,
      spec: { kind, mode: "modulo-n-bcd", clockFreqHz: 1500, numStages: 4, moduloN: 12, pulseCount: 55 },
    },
  ];

  for (const cfg of scStructs) {
    const sp = cfg.spec;
    const q = solveKind(kind, sp);
    const fOutStr = fmt3(q.outputFreqHz as number, "Hz");
    const cntStr = fmtInt(q.countAfterPulses as number);
    const rstDesc = q.resetGateDescription as string;
    items.push(
      makeStructured(ctx, {
        slug: cfg.slug,
        conceptId,
        kind,
        domain: "graphs",
        syllabi: elecTag(),
        difficulty: cfg.difficulty,
        scenarioSpec: sp,
        hiddenQuantities: [
          "outputFreqHz",
          "countAfterPulses",
          ...(sp.mode === "modulo-n-bcd" ? ["resetGateDescription"] : ["dTypeDivideRule"]),
        ],
        requiredGivens: [
          { name: "clockFreqHz", value: sp.clockFreqHz, unit: "Hz", source: "stem" },
          { name: "moduloN", value: sp.moduloN, source: "stem" },
          { name: "pulseCount", value: sp.pulseCount, source: "stem" },
        ],
        stem: `The multi-row timing diagram represents a ${sp.mode === "binary-ripple" ? `binary ripple counter with ${sp.numStages} stages (modulus ${sp.moduloN})` : `counter of modulus ${sp.moduloN}`} built from rising-edge D-type flip-flops driven by a ${sp.clockFreqHz} Hz clock signal.`,
        parts: [
          {
            partId: "a",
            prompt: "Calculate the repetition frequency of the counter's full output cycle in Hz.",
            marks: 2,
            targetQuantityKey: "outputFreqHz",
            expectedAnswer: fOutStr,
            workingSteps: [
              `$f_{\\mathrm{out}} = \\frac{f_{\\mathrm{clk}}}{${sp.moduloN}} = \\frac{${sp.clockFreqHz}}{${sp.moduloN}} = ${fOutStr}$.`,
            ],
          },
          {
            partId: "b",
            prompt: `Starting from zero, determine the decimal count stored after ${sp.pulseCount} rising clock pulses.`,
            marks: 2,
            targetQuantityKey: "countAfterPulses",
            expectedAnswer: cntStr,
            workingSteps: [
              `Take remainder modulo ${sp.moduloN}: ${sp.pulseCount} mod ${sp.moduloN} = ${cntStr}.`,
            ],
          },
          sp.mode === "modulo-n-bcd"
            ? {
                partId: "c",
                prompt: `Specify which counter output bits must feed an active-high AND gate to reset this counter automatically on count ${sp.moduloN}.`,
                marks: 2,
                targetMode: "qualitative",
                targetQuantityKey: "resetGateDescription",
                expectedAnswer: capitalizeSentence(rstDesc),
                workingSteps: [
                  `Write decimal ${sp.moduloN} in 4-bit binary: ${sp.moduloN.toString(2).padStart(4, "0")}.`,
                  `Connect the HIGH bits (${rstDesc}).`,
                ],
              }
            : {
                partId: "c",
                prompt: "Explain how each individual D-type flip-flop stage divides the frequency of its incoming clock signal by two.",
                marks: 2,
                targetMode: "qualitative",
                targetQuantityKey: "dTypeDivideRule",
                expectedAnswer:
                  "Connecting not-Q back to the D input toggles Q on every rising clock edge dividing frequency by two.",
                workingSteps: [
                  "With $\\bar{Q}$ wired to $D$, each rising clock edge copies the complement of $Q$ to the output.",
                  "Two input clock periods are therefore needed for one complete output cycle at $Q$.",
                ],
              },
        ],
        workedSolution: `(a) $f_{\\mathrm{out}} = ${fOutStr}$. (b) Count after ${sp.pulseCount} pulses is ${cntStr}. (c) ${sp.mode === "modulo-n-bcd" ? capitalizeSentence(rstDesc) : "Connecting not-Q back to the D input toggles Q on every rising clock edge dividing frequency by two."}`,
        markScheme: [
          { code: "M1", criterion: `Divides clock frequency by modulus ${sp.moduloN}.`, marks: 1, partId: "a" },
          { code: "A1", criterion: `Obtains ${fOutStr}.`, marks: 1, partId: "a" },
          { code: "M1", criterion: `Finds remainder of ${sp.pulseCount} divided by ${sp.moduloN}.`, marks: 1, partId: "b" },
          { code: "A1", criterion: `Obtains decimal state ${cntStr}.`, marks: 1, partId: "b" },
          { code: "B1", criterion: sp.mode === "modulo-n-bcd" ? `Converts decimal ${sp.moduloN} to binary ${sp.moduloN.toString(2).padStart(4, "0")}.` : "States $\\bar{Q}$ is wired back to $D$.", marks: 1, partId: "c" },
          { code: "B1", criterion: sp.mode === "modulo-n-bcd" ? `Identifies ${rstDesc}.` : "Explains output toggles on each rising edge, halving frequency.", marks: 1, partId: "c" },
        ],
        planSummary: "Sequential counter frequency division, modular pulse count, and decoding/toggle logic.",
      }),
    );
  }

  // 2 × Authentic 6-mark LoRs for Plugin 13
  items.push(
    makeLor6(ctx, {
      slug: "elec-sc-11",
      conceptId,
      kind,
      domain: "graphs",
      syllabi: elecTag(),
      difficulty: "higher",
      scenarioSpec: sc3,
      requiredGivens: [],
      targetQuantityKey: "counterLorAnchor",
      stem: "A digital clock requires a divide-by-10 (BCD) counter built from edge-triggered D-type flip-flops to drive a 7-segment display, while a factory conveyor requires a decade counter to actuate ten solenoid valves sequentially.",
      prompt:
        "Explain how D-type flip-flops are connected to build a modulo-10 BCD counter (including frequency division and reset decoding), and compare the BCD counter with a Johnson decade counter for these two applications.",
      expectedAnswer:
        "To build a 4-bit ripple counter, four rising-edge D-type flip-flops each have their inverted output connected back to their D input, and each stage clocks the next from its inverted output so the count advances cleanly in binary. Specifically, each rising clock edge toggles the first D-type flip-flop to divide frequency by two and an AND gate decodes the target reset state to clear all flip-flops: for modulo-10 BCD, binary 1010 is decoded by connecting $Q_3$ and $Q_1$ to an AND gate wired to the asynchronous master reset, resetting 1010 almost instantaneously to 0000 so only states 0 to 9 persist. For the digital clock, the BCD counter's compact 4-bit binary-weighted outputs directly feed a BCD-to-7-segment decoder; conversely, for the ten sequential solenoids, a Johnson decade counter is superior because it activates one of ten decoded outputs HIGH in turn per clock pulse with no external decoding gates, though it uses more internal stages and does not output binary weights directly.",
      workingSteps: [
        "L1: Explain $\\bar{Q} \\to D$ feedback on each D-type flip-flop causing toggling on each rising edge ($f/2$).",
        "L1: State that cascading 4 flip-flops yields a 4-bit ripple counter with 16 natural states (0000 to 1111).",
        "L2: Explain modulo-10 reset decoding: binary 10 is $1010$, so $Q_3$ and $Q_1$ feed an AND gate connected to Master Reset (MR).",
        "L2: Note the brief glitch on state 1010 clearing all flip-flops back to 0000 so states 0–9 cycle at $f_{\\mathrm{clk}}/10$.",
        "L3: Compare BCD (4 binary-weighted outputs ideal for 7-segment BCD decoders) vs Johnson (10 sequential one-hot decoded outputs ideal for sequential actuators/LEDs without extra gates).",
        "L3: Mention practical propagation ripple delay or illegal-state recovery considerations.",
      ],
      levelCriteria: [
        "Explains that wiring $\\bar{Q}$ to $D$ makes each rising-edge D-type flip-flop toggle, dividing frequency by two.",
        "Explains cascading four flip-flops to create a 4-bit binary ripple counter.",
        "Identifies binary 1010 (decimal 10) as the first unwanted state for a BCD modulo-10 counter.",
        "Explains connecting $Q_3$ and $Q_1$ to an AND gate driving the master reset to clear all flip-flops back to 0000.",
        "Explains that a BCD counter produces 4-bit binary-weighted outputs suited to driving a BCD-to-7-segment decoder.",
        "Contrasts with a Johnson decade counter activating one of ten decoded outputs sequentially without extra decoding gates for the solenoid sequence.",
      ],
      workedSolution:
        "Each rising clock edge toggles the first D-type flip-flop to divide frequency by two and an AND gate decodes the target reset state to clear all flip-flops ($Q_3 \\cdot Q_1$ for binary 1010 in BCD). BCD suits 7-segment display decoders via binary weights, whereas a Johnson decade counter directly activates one of ten sequential outputs for the solenoids without external decoding logic.",
      planSummary: "Extended level of response synthesis of D-type BCD reset counters versus Johnson decade counters.",
    }),
  );

  items.push(
    makeLor6(ctx, {
      slug: "elec-sc-12",
      conceptId,
      kind,
      domain: "graphs",
      syllabi: elecTag(),
      difficulty: "higher",
      scenarioSpec: scJ,
      requiredGivens: [],
      targetQuantityKey: "johnsonVsBcdRule",
      stem: "Referring to the timing diagram, an electronics team compares using a Johnson decade counter versus a 4-bit binary ripple BCD counter in a low-power portable sequencer.",
      prompt:
        "Describe how the timing waveforms of a Johnson decade counter differ from those of a 4-bit binary ripple counter, explain why edge triggering is essential in sequential logic, and evaluate the advantages and disadvantages of both counter architectures.",
      expectedAnswer:
        "In a 4-bit binary ripple counter, $Q_0$ toggles at half the clock frequency, $Q_1$ at one quarter, $Q_2$ at one eighth, and multiple bits switch simultaneously on carries, whereas a johnson decade counter activates one decoded output sequentially without extra decoding gates whereas a BCD counter outputs binary weights needing a decoder. Edge triggering ensures each flip-flop samples its D input only at the precise rising (or falling) clock transition rather than transparently throughout a HIGH level, preventing race-around oscillations where the output flips uncontrollably within a single pulse. While a BCD ripple counter needs only four flip-flops and interfaces naturally with arithmetic or numeric display decoders, its asynchronous ripple propagation delay can cause brief decoding glitches; a synchronous Johnson counter eliminates ripple glitches and directly drives ten sequential loads, at the cost of extra pins and needing a separate encoder if binary arithmetic is desired.",
      workingSteps: [
        "L1: Contrast waveforms: binary ripple outputs divide by $2, 4, 8, 16$ with multiple simultaneous HIGH bits vs Johnson single-active sequential pulses.",
        "L1: State that both divide a decade cycle frequency by ten.",
        "L2: Explain why edge triggering is vital: prevents continuous toggling/race-around during a wide clock HIGH pulse.",
        "L2: Explain BCD advantages: compact 4-bit binary-weighted format for 7-segment decoders and numerical processing.",
        "L3: Explain Johnson advantages: glitch-free synchronous transitions and direct 1-of-10 decoded outputs without external AND gates.",
        "L3: Note trade-offs (asynchronous ripple propagation delay glitches in ripple BCD vs extra output pins/lack of binary weights in Johnson).",
      ],
      levelCriteria: [
        "Contrasts binary ripple waveforms ($f/2, f/4, f/8$) with sequential single-HIGH decoded pulses of a Johnson decade counter.",
        "Explains that rising/falling edge triggering samples inputs only at clock transitions, preventing uncontrolled race-around toggling.",
        "States that a BCD counter emits compact 4-bit binary-weighted codes suited to numeric decoders.",
        "States that a Johnson counter directly drives ten sequential outputs without external decoding gates.",
        "Identifies asynchronous ripple propagation delay / brief decoding glitches as a limitation of binary ripple counters.",
        "Identifies higher pin count or unsuitability for direct binary arithmetic as a trade-off of Johnson counters.",
      ],
      workedSolution:
        "A johnson decade counter activates one decoded output sequentially without extra decoding gates whereas a BCD counter outputs binary weights needing a decoder. Edge triggering prevents race-around during HIGH clock pulses; synchronous Johnson counters avoid asynchronous ripple glitches when driving sequential loads, whereas BCD counters remain compact for binary/7-segment decoding.",
      planSummary: "Extended level of response comparison of Johnson versus binary ripple timing diagrams and edge triggering.",
    }),
  );

  return items;
}

/* ========================================================================== */
/*  14. Plugin 14: al-opt-elec-adc-pcm-comms (12 items, 2 × 6m LoRs)          */
/* ========================================================================== */

function buildAdcPcmCommsItems(ctx: BuildContext): CandidateQuestionInput[] {
  const kind = "al-opt-elec-adc-pcm-comms";
  const conceptId = "kirchhoff-dc-circuits";
  const items: CandidateQuestionInput[] = [];

  const cm1 = {
    kind,
    mode: "adc-sampling",
    vRangeV: 5.12,
    adcBits: 8,
    maxAudioFreqHz: 4000,
    samplingFreqHz: 10000,
    tdmChannels: 12,
    carrierFreqKhz: 900,
    freqDeviationKhz: 75,
    modulatingFreqKhz: 4.5,
    bandWidthAvailableKhz: 180,
  };
  const qcm1 = solveKind(kind, cm1);
  items.push(
    makeCalcMcq(ctx, {
      slug: "elec-cm-01",
      conceptId,
      kind,
      domain: "waves",
      syllabi: elecTag(),
      difficulty: "foundation",
      scenarioSpec: cm1,
      requiredGivens: [
        { name: "vRangeV", value: 5.12, unit: "V", source: "either" },
        { name: "adcBits", value: 8, source: "stem" },
      ],
      targetQuantityKey: "voltageResolutionMv",
      unit: "mV",
      stem: "An analogue-to-digital converter (ADC) with word length 8 bits spans an input voltage range of 0 V to 5.12 V. Using the AQA ADC resolution formula $\\Delta V = V_{\\mathrm{range}} / 2^n$, calculate the voltage resolution in mV.",
      distractors: [
        {
          value: (5.12 / 8) * 1e3,
          rationale: "Divides $V_{\\mathrm{range}}$ by bit count $8$ instead of quantisation levels $2^8 = 256$.",
        },
        {
          value: (5.12 / 128) * 1e3,
          rationale: "Uses $2^7 = 128$ instead of $2^8 = 256$.",
        },
        {
          value: (5.12 / 512) * 1e3,
          rationale: "Uses $2^9 = 512$ instead of $2^8 = 256$.",
        },
      ],
      workedSolution: `Number of levels $= 2^8 = 256$. Resolution $\\Delta V = \\frac{5.12}{256} = 0.0200\\text{ V} = ${fmt3(qcm1.voltageResolutionMv as number, "mV")}$.`,
      markCriterion: `ADC voltage resolution equals ${fmt3(qcm1.voltageResolutionMv as number, "mV")}.`,
      planSummary: "Compute ADC quantisation step strictly using AQA power-of-two resolution formula.",
    }),
  );

  const cm2 = {
    kind,
    mode: "adc-sampling",
    vRangeV: 10.24,
    adcBits: 12,
    maxAudioFreqHz: 15000,
    samplingFreqHz: 32000,
    tdmChannels: 16,
    carrierFreqKhz: 1000,
    freqDeviationKhz: 75,
    modulatingFreqKhz: 15,
    bandWidthAvailableKhz: 1800,
  };
  const qcm2 = solveKind(kind, cm2);
  items.push(
    makeCalcMcq(ctx, {
      slug: "elec-cm-02",
      conceptId,
      kind,
      domain: "waves",
      syllabi: elecTag(),
      difficulty: "standard",
      scenarioSpec: cm2,
      requiredGivens: [
        { name: "adcBits", value: 12, source: "stem" },
        { name: "samplingFreqHz", value: 32000, unit: "Hz", source: "stem" },
        { name: "tdmChannels", value: 16, source: "stem" },
      ],
      targetQuantityKey: "tdmTotalBitRateKbps",
      unit: "kbit s⁻¹",
      stem: "A digital telemetry link multiplexes 16 voice channels using time-division multiplexing (TDM). Each channel is sampled at 32.0 kHz and encoded into a PCM word of 12 bits. Calculate the total transmitted bit rate in $\\text{kbit s}^{-1}$.",
      distractors: [
        {
          value: qcm2.pcmBitRateKbps as number,
          rationale: "Calculates bit rate for a single channel without multiplying by 16 TDM channels.",
        },
        {
          value: (32 * 16) / 12,
          rationale: "Divides by word length 12 instead of multiplying.",
        },
        {
          value: 32 * 2 ** 12,
          rationale: "Multiplies sampling rate by $2^{12}$ levels instead of 12 bits per sample.",
        },
      ],
      workedSolution: `Single-channel PCM bit rate $= f_{\\mathrm{s}} \\times n = 32.0\\text{ kHz} \\times 12 = 384\\text{ kbit s}^{-1}$. Across 16 TDM channels: $16 \\times 384 = ${fmt3(qcm2.tdmTotalBitRateKbps as number, "kbit s⁻¹")}$.`,
      markCriterion: `Total TDM bit rate equals ${fmt3(qcm2.tdmTotalBitRateKbps as number, "kbit s⁻¹")}.`,
      planSummary: "Calculate aggregate PCM + TDM digital bit rate across multiplexed channels.",
    }),
  );

  const cm3 = {
    kind,
    mode: "am-fm-spectrum",
    vRangeV: 5.0,
    adcBits: 8,
    maxAudioFreqHz: 15000,
    samplingFreqHz: 40000,
    tdmChannels: 4,
    carrierFreqKhz: 96000,
    freqDeviationKhz: 75,
    modulatingFreqKhz: 15,
    bandWidthAvailableKhz: 1800,
  };
  const qcm3 = solveKind(kind, cm3);
  items.push(
    makeCalcMcq(ctx, {
      slug: "elec-cm-03",
      conceptId,
      kind,
      domain: "waves",
      syllabi: elecTag(),
      difficulty: "foundation",
      scenarioSpec: cm3,
      requiredGivens: [
        { name: "freqDeviationKhz", value: 75, unit: "kHz", source: "stem" },
        { name: "modulatingFreqKhz", value: 15, unit: "kHz", source: "stem" },
      ],
      targetQuantityKey: "fmBandwidthKhz",
      unit: "kHz",
      stem: "A VHF FM radio station broadcasts audio with maximum modulating frequency $f_{\\mathrm{M}} = 15.0\\text{ kHz}$ and maximum frequency deviation $\\Delta f = 75.0\\text{ kHz}$. Calculate the total channel bandwidth required by this FM broadcast.",
      distractors: [
        {
          value: 2 * 15,
          rationale: "Applies the AM bandwidth formula $2 f_{\\mathrm{M}}$ instead of FM $2(\\Delta f + f_{\\mathrm{M}})$.",
        },
        {
          value: 75 + 15,
          rationale: "Omits the factor of $2$ in $\\mathrm{BW}_{\\mathrm{FM}} = 2(\\Delta f + f_{\\mathrm{M}})$.",
        },
        {
          value: 2 * 75,
          rationale: "Omits $f_{\\mathrm{M}}$ inside $2(\\Delta f + f_{\\mathrm{M}})$.",
        },
      ],
      workedSolution: `For FM broadcasts, $\\mathrm{BW}_{\\mathrm{FM}} = 2(\\Delta f + f_{\\mathrm{M}}) = 2(75.0 + 15.0) = ${fmt3(qcm3.fmBandwidthKhz as number, "kHz")}$.`,
      markCriterion: `FM bandwidth equals ${fmt3(qcm3.fmBandwidthKhz as number, "kHz")}.`,
      planSummary: "Compute FM channel bandwidth from maximum deviation and modulating frequency.",
    }),
  );

  const cm4 = {
    kind,
    mode: "am-fm-spectrum",
    vRangeV: 5.0,
    adcBits: 8,
    maxAudioFreqHz: 4500,
    samplingFreqHz: 10000,
    tdmChannels: 4,
    carrierFreqKhz: 810,
    freqDeviationKhz: 50,
    modulatingFreqKhz: 4.5,
    bandWidthAvailableKhz: 180,
  };
  const qcm4 = solveKind(kind, cm4);
  items.push(
    makeCalcMcq(ctx, {
      slug: "elec-cm-04",
      conceptId,
      kind,
      domain: "waves",
      syllabi: elecTag(),
      difficulty: "standard",
      scenarioSpec: cm4,
      requiredGivens: [
        { name: "modulatingFreqKhz", value: 4.5, unit: "kHz", source: "stem" },
        { name: "bandWidthAvailableKhz", value: 180, unit: "kHz", source: "stem" },
      ],
      targetQuantityKey: "maxAmStations",
      integerMode: true,
      stem: "A medium-wave AM allocation spans a total frequency band of 180 kHz. If each AM speech station carries audio up to $f_{\\mathrm{M}} = 4.50\\text{ kHz}$, what is the maximum number of non-overlapping AM stations that can fit inside this band?",
      distractors: [
        { value: Math.floor(180 / 4.5), rationale: "Uses single sideband $f_{\\mathrm{M}}$ instead of full AM bandwidth $2 f_{\\mathrm{M}}$." },
        { value: 10, rationale: "Halves the station count erroneously." },
        { value: 15, rationale: "Applies an incorrect guard-band deduction." },
      ],
      workedSolution: `Each AM station occupies $\\mathrm{BW}_{\\mathrm{AM}} = 2 f_{\\mathrm{M}} = 2(4.50) = 9.00\\text{ kHz}$. Maximum stations $= \\frac{180}{9.00} = ${fmtInt(qcm4.maxAmStations as number)}$.`,
      markCriterion: `Maximum non-overlapping AM stations equals ${fmtInt(qcm4.maxAmStations as number)}.`,
      planSummary: "Calculate station capacity inside an AM frequency allocation from modulating frequency.",
    }),
  );

  // 3 Pure Qualitative MCQs
  items.push(
    makeQualMcq(ctx, {
      slug: "elec-cm-05",
      conceptId,
      kind,
      domain: "waves",
      syllabi: elecTag(),
      difficulty: "foundation",
      scenarioSpec: cm1,
      requiredGivens: [],
      targetQuantityKey: "aliasingRule",
      stem: "What occurs if an analogue audio signal containing frequencies up to $f_{\\max}$ is sampled by an ADC at a sampling frequency lower than $2 f_{\\max}$?",
      distractors: [
        {
          text: "Quantisation resolution improves automatically because fewer samples require more bits.",
          rationale: "Resolution $\\Delta V = V_{\\mathrm{range}}/2^n$ is set by bit depth $n$, not sampling rate.",
        },
        {
          text: "Signal amplitude saturates at the supply rails while frequency remains exact.",
          rationale: "Undersampling causes frequency-domain aliasing, not amplitude clipping.",
        },
        {
          text: "All frequency components above half the sampling rate are cleanly boosted in fidelity.",
          rationale: "Undersampled high frequencies fold down into false lower frequencies.",
        },
      ],
      workedSolution: `Nyquist's theorem requires $f_{\\mathrm{s}} \\ge 2 f_{\\max}$; sampling below twice the maximum signal frequency produces false lower-frequency aliasing distortion.`,
      planSummary: "Explain aliasing distortion when violating Nyquist sampling criterion.",
    }),
  );

  items.push(
    makeQualMcq(ctx, {
      slug: "elec-cm-06",
      conceptId,
      kind,
      domain: "waves",
      syllabi: elecTag(),
      difficulty: "foundation",
      scenarioSpec: cm2,
      requiredGivens: [],
      targetQuantityKey: "regeneratorRule",
      stem: "Why does long-distance digital PCM transmission using periodic regenerators achieve dramatically better signal-to-noise ratio than long-distance analogue transmission using repeater amplifiers?",
      distractors: [
        {
          text: "Digital pulses experience zero attenuation or dispersion inside cables.",
          rationale: "Digital pulses still attenuate and pick up noise, which is why regenerators are needed periodically.",
        },
        {
          text: "Regenerators shift signals to a higher carrier frequency so noise vanishes completely.",
          rationale: "Regenerators reconstruct clean binary 0/1 levels in baseband.",
        },
        {
          text: "Analogue amplifiers strip noise automatically whereas regenerators only boost voltage.",
          rationale: "Reverses the fundamental distinction between analogue amplifiers and digital regenerators.",
        },
      ],
      workedSolution: `A regenerator compares the noisy digital waveform against a threshold and rebuilds fresh rectangular pulses: a regenerator restores clean digital logic levels removing accumulated noise whereas an analogue amplifier amplifies noise with the signal.`,
      planSummary: "Distinguish digital regenerators from analogue amplifiers for noise suppression.",
    }),
  );

  items.push(
    makeQualMcq(ctx, {
      slug: "elec-cm-07",
      conceptId,
      kind,
      domain: "waves",
      syllabi: elecTag(),
      difficulty: "standard",
      scenarioSpec: cm3,
      requiredGivens: [],
      targetQuantityKey: "amVsFmRule",
      stem: "Which statement accurately summarises the principal advantages and trade-offs of VHF FM radio broadcasting compared with medium-wave AM broadcasting?",
      distractors: [
        {
          text: "AM provides superior noise immunity and wider audio bandwidth while occupying much wider channels than FM.",
          rationale: "Reverses both noise immunity and bandwidth characteristics of AM versus FM.",
        },
        {
          text: "FM requires far narrower bandwidth than AM and diffracts easily around hills via ground waves.",
          rationale: "FM needs ~180–200 kHz vs AM ~9 kHz, and VHF FM travels mostly line-of-sight.",
        },
        {
          text: "Both AM and FM have identical noise immunity because lightning interference alters carrier frequency equally.",
          rationale: "Electrical interference predominantly modulates amplitude, which FM limiters strip out.",
        },
      ],
      workedSolution: `Because electrical interference mainly adds amplitude spikes which FM receivers clip away, FM provides superior noise immunity and audio fidelity than AM at the cost of wider channel bandwidth and shorter line-of-sight range.`,
      planSummary: "Compare AM versus FM noise immunity, audio fidelity, bandwidth, and propagation range.",
    }),
  );

  // 3 Multi-part structured
  const cmStructs = [
    {
      slug: "elec-cm-08",
      difficulty: "standard" as const,
      spec: {
        kind,
        mode: "adc-sampling",
        vRangeV: 4.096,
        adcBits: 10,
        maxAudioFreqHz: 5000,
        samplingFreqHz: 12000,
        tdmChannels: 8,
        carrierFreqKhz: 900,
        freqDeviationKhz: 75,
        modulatingFreqKhz: 5,
        bandWidthAvailableKhz: 200,
      },
    },
    {
      slug: "elec-cm-09",
      difficulty: "higher" as const,
      spec: {
        kind,
        mode: "adc-sampling",
        vRangeV: 8.192,
        adcBits: 12,
        maxAudioFreqHz: 20000,
        samplingFreqHz: 44000,
        tdmChannels: 6,
        carrierFreqKhz: 1000,
        freqDeviationKhz: 75,
        modulatingFreqKhz: 15,
        bandWidthAvailableKhz: 1800,
      },
    },
    {
      slug: "elec-cm-10",
      difficulty: "higher" as const,
      spec: {
        kind,
        mode: "am-fm-spectrum",
        vRangeV: 5.12,
        adcBits: 8,
        maxAudioFreqHz: 12000,
        samplingFreqHz: 30000,
        tdmChannels: 4,
        carrierFreqKhz: 1080,
        freqDeviationKhz: 60,
        modulatingFreqKhz: 12,
        bandWidthAvailableKhz: 1440,
      },
    },
  ];

  for (const cfg of cmStructs) {
    const sp = cfg.spec;
    const q = solveKind(kind, sp);
    if (sp.mode === "adc-sampling") {
      const resStr = fmt3(q.voltageResolutionMv as number, "mV");
      const nyqStr = fmt3(q.minNyquistFreqKhz as number, "kHz");
      const tdmStr = fmt3(q.tdmTotalBitRateKbps as number, "kbit s⁻¹");
      items.push(
        makeStructured(ctx, {
          slug: cfg.slug,
          conceptId,
          kind,
          domain: "waves",
          syllabi: elecTag(),
          difficulty: cfg.difficulty,
          scenarioSpec: sp,
          hiddenQuantities: [
            "voltageResolutionMv",
            "minNyquistFreqKhz",
            "tdmTotalBitRateKbps",
          ],
          requiredGivens: [
            { name: "vRangeV", value: sp.vRangeV, unit: "V", source: "either" },
            { name: "adcBits", value: sp.adcBits, source: "stem" },
            { name: "maxAudioFreqHz", value: sp.maxAudioFreqHz, unit: "Hz", source: "stem" },
            { name: "samplingFreqHz", value: sp.samplingFreqHz, unit: "Hz", source: "stem" },
            { name: "tdmChannels", value: sp.tdmChannels, source: "stem" },
          ],
          stem: `A digital acoustic recorder digitises ${sp.tdmChannels} independent microphone channels over a ${fmt3(sp.vRangeV, "V")} input span using an ADC with ${sp.adcBits} bits per sample. Each microphone signal has maximum frequency ${fmt3(sp.maxAudioFreqHz / 1e3, "kHz")} and is actually sampled at ${fmt3(sp.samplingFreqHz / 1e3, "kHz")} before TDM interleaving.`,
          parts: [
            {
              partId: "a",
              prompt: "Calculate the voltage resolution of the ADC in mV.",
              marks: 2,
              targetQuantityKey: "voltageResolutionMv",
              expectedAnswer: resStr,
              workingSteps: [
                `$\\Delta V = \\frac{V_{\\mathrm{range}}}{2^n} = \\frac{${fmt3(sp.vRangeV)}}{2^{${sp.adcBits}}} = ${resStr}$.`,
              ],
            },
            {
              partId: "b",
              prompt: "State the minimum theoretical Nyquist sampling frequency required to avoid aliasing (in kHz).",
              marks: 1,
              targetQuantityKey: "minNyquistFreqKhz",
              expectedAnswer: nyqStr,
              workingSteps: [
                `$f_{\\mathrm{s,min}} = 2 f_{\\max} = ${nyqStr}$.`,
              ],
            },
            {
              partId: "c",
              prompt: "Calculate the aggregate bit rate transmitted across the TDM link in $\\text{kbit s}^{-1}$.",
              marks: 2,
              targetQuantityKey: "tdmTotalBitRateKbps",
              expectedAnswer: tdmStr,
              workingSteps: [
                `Total bit rate $= N \\times f_{\\mathrm{s}} \\times n = ${sp.tdmChannels} \\times ${fmt3(sp.samplingFreqHz / 1e3)} \\times ${sp.adcBits} = ${tdmStr}$.`,
              ],
            },
          ],
          workedSolution: `(a) $\\Delta V = V_{\\mathrm{range}}/2^n = ${resStr}$. (b) Minimum Nyquist rate $2 f_{\\max} = ${nyqStr}$. (c) TDM total bit rate $= ${tdmStr}$.`,
          markScheme: [
            { code: "M1", criterion: "Uses $\\Delta V = V_{\\mathrm{range}} / 2^n$.", marks: 1, partId: "a" },
            { code: "A1", criterion: `Obtains ${resStr}.`, marks: 1, partId: "a" },
            { code: "A1", criterion: `States $2 f_{\\max} = ${nyqStr}$.`, marks: 1, partId: "b" },
            { code: "M1", criterion: "Multiplies channel count $\\times f_{\\mathrm{s}} \\times n$.", marks: 1, partId: "c" },
            { code: "A1", criterion: `Obtains ${tdmStr}.`, marks: 1, partId: "c" },
          ],
          planSummary: "ADC resolution, Nyquist minimum sampling frequency, and TDM bit rate.",
        }),
      );
    } else {
      const amBwStr = fmt3(q.amBandwidthKhz as number, "kHz");
      const fmBwStr = fmt3(q.fmBandwidthKhz as number, "kHz");
      const maxFmStr = fmtInt(q.maxFmStations as number);
      items.push(
        makeStructured(ctx, {
          slug: cfg.slug,
          conceptId,
          kind,
          domain: "waves",
          syllabi: elecTag(),
          difficulty: cfg.difficulty,
          scenarioSpec: sp,
          hiddenQuantities: ["amBandwidthKhz", "fmBandwidthKhz", "maxFmStations"],
          requiredGivens: [
            { name: "modulatingFreqKhz", value: sp.modulatingFreqKhz, unit: "kHz", source: "stem" },
            { name: "freqDeviationKhz", value: sp.freqDeviationKhz, unit: "kHz", source: "stem" },
            { name: "bandWidthAvailableKhz", value: sp.bandWidthAvailableKhz, unit: "kHz", source: "stem" },
          ],
          stem: `A broadcast regulator compares AM and FM transmission of an audio programme with maximum modulating frequency $f_{\\mathrm{M}} = ${fmt3(sp.modulatingFreqKhz, "kHz")}$. For FM, the maximum carrier frequency deviation is $\\Delta f = ${fmt3(sp.freqDeviationKhz, "kHz")}$. The total spectrum band allocated is ${sp.bandWidthAvailableKhz} kHz.`,
          parts: [
            {
              partId: "a",
              prompt: "Calculate the bandwidth required for a single AM channel carrying this audio.",
              marks: 1,
              targetQuantityKey: "amBandwidthKhz",
              expectedAnswer: amBwStr,
              workingSteps: [`$\\mathrm{BW}_{\\mathrm{AM}} = 2 f_{\\mathrm{M}} = ${amBwStr}$.`],
            },
            {
              partId: "b",
              prompt: "Calculate the bandwidth required for a single FM channel carrying the same audio.",
              marks: 2,
              targetQuantityKey: "fmBandwidthKhz",
              expectedAnswer: fmBwStr,
              workingSteps: [
                `$\\mathrm{BW}_{\\mathrm{FM}} = 2(\\Delta f + f_{\\mathrm{M}}) = 2(${sp.freqDeviationKhz} + ${sp.modulatingFreqKhz}) = ${fmBwStr}$.`,
              ],
            },
            {
              partId: "c",
              prompt: "Calculate the maximum number of non-overlapping FM stations that fit inside the allocated band.",
              marks: 2,
              dependsOnPartIds: ["b"],
              targetQuantityKey: "maxFmStations",
              expectedAnswer: `${maxFmStr} stations`,
              workingSteps: [
                `$N_{\\mathrm{FM}} = \\frac{${sp.bandWidthAvailableKhz}}{${fmt3(q.fmBandwidthKhz as number)}} = ${maxFmStr}$.`,
              ],
            },
          ],
          workedSolution: `(a) $\\mathrm{BW}_{\\mathrm{AM}} = ${amBwStr}$. (b) $\\mathrm{BW}_{\\mathrm{FM}} = ${fmBwStr}$. (c) Max FM stations $= ${maxFmStr}$.`,
          markScheme: [
            { code: "A1", criterion: `Computes $2 f_{\\mathrm{M}} = ${amBwStr}$.`, marks: 1, partId: "a" },
            { code: "M1", criterion: "Applies $\\mathrm{BW}_{\\mathrm{FM}} = 2(\\Delta f + f_{\\mathrm{M}})$.", marks: 1, partId: "b" },
            { code: "A1", criterion: `Obtains ${fmBwStr}.`, marks: 1, partId: "b" },
            { code: "M1", criterion: "Divides allocated band by single-station FM bandwidth.", marks: 1, partId: "c" },
            { code: "A1", criterion: `Obtains ${maxFmStr} stations.`, marks: 1, partId: "c" },
          ],
          planSummary: "Compare AM versus FM bandwidth and calculate allocated FM station capacity.",
        }),
      );
    }
  }

  // 2 × Authentic 6-mark LoRs for Plugin 14
  items.push(
    makeLor6(ctx, {
      slug: "elec-cm-11",
      conceptId,
      kind,
      domain: "waves",
      syllabi: elecTag(),
      difficulty: "higher",
      scenarioSpec: cm1,
      requiredGivens: [],
      targetQuantityKey: "pcmTdmLorAnchor",
      stem: "A telecommunications network transmits dozens of simultaneous telephone conversations across a single long-haul cable using pulse-code modulation (PCM), time-division multiplexing (TDM), and periodic regenerators.",
      prompt:
        "Explain the end-to-end physical process by which multiple analogue voice signals are converted into a shared digital PCM/TDM stream, transmitted cleanly over long distances with regenerators, and reconstructed without aliasing or excessive quantisation noise.",
      expectedAnswer:
        "In a modern digital trunk link, an analogue signal is sampled above twice the maximum frequency quantised into binary words interleaved by time-division multiplexing and cleaned by regenerators. First, each voice channel is band-limited and sampled at a frequency exceeding twice its highest audio component (Nyquist criterion) to avoid false lower-frequency aliasing distortion. Each sample voltage is then quantised by an ADC into an $n$-bit binary word whose step size $\\Delta V = V_{\\mathrm{range}}/2^n$ decreases (lowering quantisation error) as bit depth $n$ rises, at the expense of higher bit rate $f_{\\mathrm{s}} \\times n$. Because each PCM word lasts only a short fraction of the sample period $T_{\\mathrm{s}}$, a synchronised TDM multiplexer interleaves binary words from many independent voice channels into the gaps between samples of the first channel on a single link. Along the link, regenerators periodically detect each noisy attenuated pulse against a threshold and output crisp rebuilt binary pulses, stripping away accumulated noise before it grows large enough to cause bit errors; at the destination, a synchronised demultiplexer separates the channels and DACs plus low-pass filters recover smooth analogue speech.",
      workingSteps: [
        "L1: State that the analogue signal is sampled periodically at $f_{\\mathrm{s}} \\ge 2 f_{\\max}$ to avoid aliasing.",
        "L1: State that each sample is quantised by an ADC into an $n$-bit binary word (PCM).",
        "L2: Link bit depth $n$ to quantisation resolution $\\Delta V = V_{\\mathrm{range}}/2^n$ and bit rate $f_{\\mathrm{s}} n$ trade-off.",
        "L2: Explain TDM: short binary pulses occupy tiny time slots, allowing words from multiple channels to interleave on one cable with receiver synchronisation.",
        "L3: Explain periodic regenerators restoring clean binary logic levels and eliminating noise (unlike analogue amplifiers that amplify noise too).",
        "L3: Describe receiver demultiplexing, DAC conversion, and low-pass filtering to reconstruct smooth audio.",
      ],
      levelCriteria: [
        "Explains periodic sampling at or above the Nyquist rate ($f_{\\mathrm{s}} \\ge 2 f_{\\max}$) to prevent aliasing distortion.",
        "Explains ADC quantisation into $n$-bit binary PCM words with resolution $\\Delta V = V_{\\mathrm{range}}/2^n$.",
        "Notes the trade-off between finer resolution (higher $n$, lower quantisation noise) and higher required bit rate ($f_{\\mathrm{s}} n$) / bandwidth.",
        "Explains time-division multiplexing interleaving binary words from multiple channels into time slots between consecutive samples.",
        "Explains how regenerators restore crisp logic levels and remove accumulated noise, contrasting with analogue repeater amplifiers.",
        "Explains synchronised demultiplexing, DAC conversion, and low-pass smoothing to recover the original analogue signals.",
      ],
      workedSolution:
        "An analogue signal is sampled above twice the maximum frequency quantised into binary words interleaved by time-division multiplexing and cleaned by regenerators. Nyquist sampling avoids aliasing, higher bit depth reduces $\\Delta V = V_{\\mathrm{range}}/2^n$ at the cost of higher bit rate, TDM fills inter-sample gaps across one link, regenerators strip accumulated noise, and synchronised demultiplexing + DAC + filtering recovers speech.",
      planSummary: "Extended level of response synthesis of PCM sampling, ADC quantisation, TDM, and regenerators.",
    }),
  );

  items.push(
    makeLor6(ctx, {
      slug: "elec-cm-12",
      conceptId,
      kind,
      domain: "waves",
      syllabi: elecTag(),
      difficulty: "higher",
      scenarioSpec: cm3,
      requiredGivens: [],
      targetQuantityKey: "mediaPathwaysLorAnchor",
      stem: "Global communications rely on both guided transmission media (copper twisted-pair/coaxial cables versus optical fibres) and unguided radio pathways (ground waves, sky waves, and space waves).",
      prompt:
        "Compare optical fibre against copper cabling as a high-capacity guided transmission medium, and explain how carrier frequency determines whether unguided radio waves propagate primarily as ground waves, sky waves, or space waves.",
      expectedAnswer:
        "For high-capacity trunk links, optical fibres provide lower attenuation higher bandwidth and immunity to electromagnetic interference than copper cables while sky waves refract from the ionosphere for long-range links. Specifically, optical fibres carry infrared pulses via total internal reflection with minimal signal loss per kilometre (allowing much wider regenerator spacing), huge information-carrying bandwidth, negligible crosstalk, and enhanced security against tapping, although splicing requires specialist alignment and fibres cannot carry DC power. In unguided radio links, low/medium-frequency ground waves (below a few MHz) diffract around Earth's curvature and hug the surface for regional coverage; high-frequency HF sky waves (roughly 3–30 MHz) undergo refraction/reflection in the ionised layers of the ionosphere to achieve intercontinental hops, though subject to ionospheric fading; and VHF/UHF/microwave space waves (above 30 MHz) pass straight through the ionosphere, requiring line-of-sight terrestrial masts or satellite transponders while offering the huge bandwidth needed for television, mobile networks, and satellite telemetry.",
      workingSteps: [
        "L1: Contrast copper cables with optical fibres on attenuation (repeater spacing) and bandwidth capacity.",
        "L1: Note optical fibre immunity to electromagnetic interference / crosstalk and security vs splicing/power trade-off.",
        "L2: Explain ground waves (LF/MF, below ~3 MHz): diffract around hills and Earth's curvature, modest bandwidth.",
        "L2: Explain sky waves (HF, ~3–30 MHz): refract from the ionosphere for long-range global links, affected by solar/diurnal fading.",
        "L3: Explain space waves (VHF/UHF/microwave, >30 MHz): penetrate the ionosphere, travel line-of-sight to tall masts or satellites.",
        "L3: Link higher carrier frequencies directly to higher available channel bandwidth for high-bit-rate data.",
      ],
      levelCriteria: [
        "Explains that optical fibres have lower attenuation per kilometre than copper, allowing greater spacing between regenerators.",
        "Explains that optical fibres offer vastly higher bandwidth and immunity to electromagnetic interference / crosstalk (plus notes a trade-off such as specialist splicing).",
        "Describes ground-wave propagation (LF/MF) diffracting around Earth's surface curvature for regional range.",
        "Describes sky-wave propagation (HF, 3–30 MHz) refracting from the ionosphere for long-distance links (noting ionospheric variability).",
        "Describes space-wave propagation (VHF/UHF/microwave, >30 MHz) penetrating the ionosphere for line-of-sight terrestrial or satellite links.",
        "Connects higher carrier frequencies explicitly to greater available bandwidth for high-data-rate communications.",
      ],
      workedSolution:
        "Optical fibres provide lower attenuation higher bandwidth and immunity to electromagnetic interference than copper cables while sky waves refract from the ionosphere for long-range links. Ground waves (LF/MF) diffract along Earth's surface, sky waves (HF) bounce from the ionosphere, and space waves (VHF/UHF/microwave) penetrate the ionosphere for high-bandwidth line-of-sight and satellite links.",
      planSummary: "Extended level of response comparison of optical fibre vs copper and ground/sky/space radio pathways.",
    }),
  );

  return items;
}

/* ========================================================================== */
/*  Public Generator Entrypoint (14 Plugins × 12 Items = 168 Verified Items)  */
/* ========================================================================== */

export function generateAlevelOptionsEngElecCandidates(
  options: GenerateAlevelOptionsEngElecOptions = {},
): CandidateQuestionInput[] {
  const baseSeed = options.baseSeed ?? ALEVEL_OPT_EE_DEFAULT_BASE_SEED;
  const generatorModel = options.generatorModel ?? ALEVEL_OPT_EE_DEFAULT_MODEL;
  let offset = 0;
  const ctx: BuildContext = {
    nextSeed: () => {
      offset += 1;
      return baseSeed + offset;
    },
    generatorModel,
  };

  return [
    // Option 3.11 Engineering Physics (6 plugins × 12 = 72 items)
    ...buildMomentInertiaSuvatItems(ctx),
    ...buildFlywheelKersItems(ctx),
    ...buildAngularMomentumItems(ctx),
    ...buildFirstLawAdiabaticItems(ctx),
    ...buildOttoDieselItems(ctx),
    ...buildCarnotCopItems(ctx),
    // Option 3.13 Electronics (8 plugins × 12 = 96 items)
    ...buildDiscreteSemiItems(ctx),
    ...buildOpampInvNoninvItems(ctx),
    ...buildOpampSumDiffItems(ctx),
    ...buildLcResonanceItems(ctx),
    ...buildTiming555Items(ctx),
    ...buildCombinationalLogicItems(ctx),
    ...buildSequentialCountersItems(ctx),
    ...buildAdcPcmCommsItems(ctx),
  ];
}
