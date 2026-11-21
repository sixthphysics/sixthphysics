import {
  buildOptionEquivalenceKey,
  numbersAgreeWithinTolerance,
  textContainsNumericValue,
} from "@/lib/bank-pipeline/numeric-checker";
import {
  CandidateQuestionInput,
  CandidateQuestionPlan,
  MarkSchemePoint,
  MCQ_OPTION_LABELS,
  McqOptionItem,
  QuestionDifficulty,
  QuestionFormat,
  RequiredGivenSpec,
  StructuredQuestionPart,
  SyllabusTag,
  VerifiedQuantityMap,
} from "@/lib/bank-pipeline/types";
import {
  DomainKindPlugin,
  NCUK_ATMOSPHERIC_PRESSURE_PA,
  NCUK_GRAVITY_MS2,
  NCUK_STATICS_FLUIDS_PLUGINS,
} from "@/lib/visuals/ncuk-statics-fluids";

export const NCUK_STATICS_FLUIDS_BASE_SEED = 71_000_000;
export const NCUK_STATICS_FLUIDS_ID_PREFIX = "sp-v3-ncuk-sf";

export interface GenerateNcukStaticsFluidsOptions {
  readonly baseSeed?: number;
  readonly generatorModel?: string;
}

export interface NcukStaticsFluidsArchetypeMeta {
  readonly archetype: string;
  readonly conceptId: string;
  readonly domain: "mechanics" | "pure-calculation" | "thermal";
  readonly kind: string;
  readonly ncukTopicId: "ncuk-ac2" | "ncuk-ac3";
  readonly ncukSubtopicId: "ncuk-ac2-3" | "ncuk-ac3-1";
  readonly count: number;
}

export const NCUK_STATICS_FLUIDS_ARCHETYPES: readonly NcukStaticsFluidsArchetypeMeta[] =
  [
    {
      archetype: "single-pivot-offcentre-balance",
      conceptId: "vectors-equilibrium-moments",
      domain: "mechanics",
      kind: "beam-single-pivot-moments",
      ncukTopicId: "ncuk-ac2",
      ncukSubtopicId: "ncuk-ac2-3",
      count: 14,
    },
    {
      archetype: "crane-counterweight-safe-load",
      conceptId: "vectors-equilibrium-moments",
      domain: "mechanics",
      kind: "beam-single-pivot-moments",
      ncukTopicId: "ncuk-ac2",
      ncukSubtopicId: "ncuk-ac2-3",
      count: 14,
    },
    {
      archetype: "overhanging-bridge-support-reactions-tipping",
      conceptId: "vectors-equilibrium-moments",
      domain: "mechanics",
      kind: "beam-two-support-overhang",
      ncukTopicId: "ncuk-ac2",
      ncukSubtopicId: "ncuk-ac2-3",
      count: 14,
    },
    {
      archetype: "hinged-wall-sign-angled-wire",
      conceptId: "vectors-equilibrium-moments",
      domain: "mechanics",
      kind: "hinged-rod-angled-wire",
      ncukTopicId: "ncuk-ac2",
      ncukSubtopicId: "ncuk-ac2-3",
      count: 14,
    },
    {
      archetype: "nonuniform-trapdoor-hinge-resultant-long",
      conceptId: "vectors-equilibrium-moments",
      domain: "mechanics",
      kind: "hinged-rod-angled-wire",
      ncukTopicId: "ncuk-ac2",
      ncukSubtopicId: "ncuk-ac2-3",
      count: 14,
    },
    {
      archetype: "two-wire-asymmetric-suspended-bar",
      conceptId: "vectors-equilibrium-moments",
      domain: "mechanics",
      kind: "two-wire-suspended-bar",
      ncukTopicId: "ncuk-ac2",
      ncukSubtopicId: "ncuk-ac2-3",
      count: 14,
    },
    {
      archetype: "couples-torque-and-equilibrium-rules",
      conceptId: "vectors-equilibrium-moments",
      domain: "mechanics",
      kind: "two-wire-suspended-bar",
      ncukTopicId: "ncuk-ac2",
      ncukSubtopicId: "ncuk-ac2-3",
      count: 14,
    },
    {
      archetype: "alloy-density-mass-vs-volume-mix",
      conceptId: "fluid-drag-buoyancy",
      domain: "pure-calculation",
      kind: "alloy-composite-density",
      ncukTopicId: "ncuk-ac3",
      ncukSubtopicId: "ncuk-ac3-1",
      count: 14,
    },
    {
      archetype: "annular-washer-drawn-wire-sphere-density",
      conceptId: "fluid-drag-buoyancy",
      domain: "pure-calculation",
      kind: "alloy-composite-density",
      ncukTopicId: "ncuk-ac3",
      ncukSubtopicId: "ncuk-ac3-1",
      count: 14,
    },
    {
      archetype: "hydrostatic-gauge-absolute-base-force",
      conceptId: "fluid-drag-buoyancy",
      domain: "pure-calculation",
      kind: "hydrostatic-pressure-base-force",
      ncukTopicId: "ncuk-ac3",
      ncukSubtopicId: "ncuk-ac3-1",
      count: 14,
    },
    {
      archetype: "archimedes-upthrust-and-solution-density",
      conceptId: "fluid-drag-buoyancy",
      domain: "pure-calculation",
      kind: "hydrostatic-pressure-base-force",
      ncukTopicId: "ncuk-ac3",
      ncukSubtopicId: "ncuk-ac3-1",
      count: 14,
    },
    {
      archetype: "layered-tank-and-utube-hydrostatics",
      conceptId: "fluid-drag-buoyancy",
      domain: "thermal",
      kind: "hydrostatic-tank-brownian",
      ncukTopicId: "ncuk-ac3",
      ncukSubtopicId: "ncuk-ac3-1",
      count: 14,
    },
    {
      archetype: "particle-arrangement-states-of-matter",
      conceptId: "fluid-drag-buoyancy",
      domain: "thermal",
      kind: "hydrostatic-tank-brownian",
      ncukTopicId: "ncuk-ac3",
      ncukSubtopicId: "ncuk-ac3-1",
      count: 14,
    },
    {
      archetype: "brownian-motion-smoke-cell-evidence",
      conceptId: "fluid-drag-buoyancy",
      domain: "thermal",
      kind: "hydrostatic-tank-brownian",
      ncukTopicId: "ncuk-ac3",
      ncukSubtopicId: "ncuk-ac3-1",
      count: 14,
    },
  ];

const PLUGIN_MAP: ReadonlyMap<string, DomainKindPlugin> = new Map(
  NCUK_STATICS_FLUIDS_PLUGINS.map((p) => [p.kind, p]),
);

function solvePlugin(
  kind: string,
  spec: Record<string, unknown>,
): VerifiedQuantityMap {
  const plugin = PLUGIN_MAP.get(kind);
  if (!plugin) {
    throw new Error(`Missing plugin for kind "${kind}"`);
  }
  const check = plugin.validate(spec);
  if (!check.valid) {
    throw new Error(
      `Invalid spec for "${kind}": ${check.issues.join("; ")}`,
    );
  }
  return plugin.solve(spec).quantities;
}

const AC23_SYLLABI: readonly SyllabusTag[] = [
  {
    syllabus: "ncuk",
    level: "IFY-S1",
    topicId: "ncuk-ac2",
    subtopicId: "ncuk-ac2-3",
  },
  {
    syllabus: "alevel",
    level: "Y12",
    topicId: "alevel-sec4-mechanics-materials",
    subtopicId: "alevel-3-4-1-force-energy-momentum",
  },
];

const AC31_DENSITY_SYLLABI: readonly SyllabusTag[] = [
  {
    syllabus: "ncuk",
    level: "IFY-S1",
    topicId: "ncuk-ac3",
    subtopicId: "ncuk-ac3-1",
  },
  {
    syllabus: "alevel",
    level: "Y12",
    topicId: "alevel-sec4-mechanics-materials",
    subtopicId: "alevel-3-4-2-materials-young-modulus",
  },
];

const AC31_NCUK_SYLLABI: readonly SyllabusTag[] = [
  {
    syllabus: "ncuk",
    level: "IFY-S1",
    topicId: "ncuk-ac3",
    subtopicId: "ncuk-ac3-1",
  },
];

interface SeededRng {
  next: () => number;
  int: (min: number, max: number) => number;
  pick: <T>(arr: readonly T[]) => T;
  step: (min: number, max: number, inc: number, dec?: number) => number;
}

function createRng(seed: number): SeededRng {
  let state = Math.trunc(seed) >>> 0;
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
  return {
    next,
    int(min: number, max: number): number {
      return min + Math.floor(next() * (max - min + 1));
    },
    pick<T>(arr: readonly T[]): T {
      return arr[Math.floor(next() * arr.length)];
    },
    step(min: number, max: number, inc: number, dec = 2): number {
      const steps = Math.max(0, Math.round((max - min) / inc));
      const idx = Math.floor(next() * (steps + 1));
      return Number((min + idx * inc).toFixed(dec));
    },
  };
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

function toSup(exp: number): string {
  return [...String(exp)].map((ch) => SUPERSCRIPTS[ch] ?? ch).join("");
}

/**
 * Formats a finite scalar to `sigFigs` significant figures with ZERO premature
 * underflow clamping (handles nuclear/micro scales down to ~1e-300 cleanly).
 */
function fmtVal(value: number, unit?: string, sigFigs = 3): string {
  if (!Number.isFinite(value)) {
    throw new Error(`Non-finite numeric value: ${String(value)}`);
  }
  if (value === 0 || Object.is(value, -0)) {
    if (!unit) return "0";
    return unit === "%" ? "0%" : unit === "°" ? "0°" : `0 ${unit}`;
  }
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  let numStr: string;
  if (abs >= 1e4 || abs < 1e-2) {
    let exp = Math.floor(Math.log10(abs));
    let mant = abs / 10 ** exp;
    if (Number(mant.toPrecision(sigFigs)) >= 10) {
      exp += 1;
      mant /= 10;
    }
    numStr = `${sign}${mant.toPrecision(sigFigs)} × 10${toSup(exp)}`;
  } else {
    numStr = `${sign}${abs.toPrecision(sigFigs)}`;
  }
  if (!unit) return numStr;
  if (unit === "%" || unit === "°") return `${numStr}${unit}`;
  return `${numStr} ${unit}`;
}

function fmt3(value: number, unit?: string): string {
  return fmtVal(value, unit, 3);
}

function fmt4(value: number, unit?: string): string {
  return fmtVal(value, unit, 4);
}

function fmtApprox2sf(value: number, unit?: string): string {
  return fmtVal(value, unit, 2);
}

function fmtGiven(value: number, decimals = 2): string {
  return String(Number(value.toFixed(decimals)));
}

interface NumericDistractor {
  readonly value: number;
  readonly rationale: string;
}

function buildNumericMcqOptions(
  correctValue: number,
  unit: string | undefined,
  distractors: readonly NumericDistractor[],
  seed: number,
): McqOptionItem[] {
  const correctText = fmt3(correctValue, unit);
  const usedKeys = new Set<string>([buildOptionEquivalenceKey(correctText)]);
  const usedValues: number[] = [correctValue];

  const chosen: Array<{
    text: string;
    isCorrect: boolean;
    distractorRationale?: string;
  }> = [{ text: correctText, isCorrect: true }];

  const tryAdd = (val: number, rationale: string): boolean => {
    if (!Number.isFinite(val) || val <= 0) return false;
    const text = fmt3(val, unit);
    if (
      textContainsNumericValue(text, correctValue, {
        significantFigures: 3,
        relativeTolerance: 0.008,
      })
    ) {
      return false;
    }
    const key = buildOptionEquivalenceKey(text);
    if (usedKeys.has(key)) return false;
    for (const prev of usedValues) {
      if (
        numbersAgreeWithinTolerance(val, prev, {
          significantFigures: 3,
          relativeTolerance: 0.035,
        })
      ) {
        return false;
      }
    }
    usedKeys.add(key);
    usedValues.push(val);
    chosen.push({ text, isCorrect: false, distractorRationale: rationale });
    return true;
  };

  for (const d of distractors) {
    if (chosen.length >= 4) break;
    tryAdd(d.value, d.rationale);
  }

  const fallbacks: readonly [number, string][] = [
    [1.37, "Uses an incorrect geometric factor or lever-arm ratio."],
    [0.68, "Applies an inverted proportionality factor during rearrangement."],
    [1.82, "Omits a required projection or unit-conversion factor."],
    [0.44, "Halves or mis-scales an intermediate physical quantity."],
    [2.35, "Doubles a force or geometric factor in the equilibrium equation."],
  ];
  for (const [mult, rationale] of fallbacks) {
    if (chosen.length >= 4) break;
    tryAdd(Math.abs(correctValue) * mult, rationale);
  }

  // Deterministic Fisher-Yates shuffle
  const rng = createRng(seed ^ 0x9e3779b9);
  for (let i = chosen.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng.next() * (i + 1));
    const tmp = chosen[i];
    chosen[i] = chosen[j];
    chosen[j] = tmp;
  }

  return chosen.map((item, idx) => ({
    label: MCQ_OPTION_LABELS[idx],
    text: item.text,
    isCorrect: item.isCorrect,
    ...(item.distractorRationale
      ? { distractorRationale: item.distractorRationale }
      : {}),
  }));
}

function buildQualitativeMcqOptions(
  correctText: string,
  distractors: readonly { text: string; rationale: string }[],
  seed: number,
): McqOptionItem[] {
  const pool: Array<{
    text: string;
    isCorrect: boolean;
    distractorRationale?: string;
  }> = [
    { text: correctText, isCorrect: true },
    ...distractors.slice(0, 3).map((d) => ({
      text: d.text,
      isCorrect: false,
      distractorRationale: d.rationale,
    })),
  ];

  const rng = createRng(seed ^ 0x517cc1b7);
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng.next() * (i + 1));
    const tmp = pool[i];
    pool[i] = pool[j];
    pool[j] = tmp;
  }

  return pool.map((item, idx) => ({
    label: MCQ_OPTION_LABELS[idx],
    text: item.text,
    isCorrect: item.isCorrect,
    ...(item.distractorRationale
      ? { distractorRationale: item.distractorRationale }
      : {}),
  }));
}

function hasHiddenNumericCollision(
  quantities: VerifiedQuantityMap,
  hiddenKeys: readonly string[],
  publicNums: readonly number[],
): boolean {
  for (const hk of hiddenKeys) {
    const val = quantities[hk];
    if (typeof val !== "number" || !Number.isFinite(val) || Math.abs(val) <= 1e-9) {
      continue;
    }
    for (const pub of publicNums) {
      if (
        numbersAgreeWithinTolerance(Math.abs(pub), Math.abs(val), {
          significantFigures: 3,
          relativeTolerance: 0.025,
        })
      ) {
        return true;
      }
    }
  }
  return false;
}

function collectSpecPublicNumbers(
  spec: Record<string, unknown>,
  hiddenKeys: readonly string[],
): number[] {
  const hidden = new Set(hiddenKeys);
  const nums: number[] = [];
  for (const [k, v] of Object.entries(spec)) {
    if (hidden.has(k) || k === "seed") continue;
    if (typeof v === "number" && Number.isFinite(v) && Math.abs(v) > 1e-12) {
      nums.push(v);
    }
  }
  return nums;
}

function difficultyForVariant(v: number): QuestionDifficulty {
  if (v % 3 === 0) return "foundation";
  if (v % 3 === 1) return "standard";
  return "higher";
}

/* ============================================================================
 * ARCHETYPE 1: single-pivot-offcentre-balance (ncuk-ac2-3, 14 items)
 * ============================================================================ */

const SINGLE_PIVOT_CONTEXTS = [
  "a carpenter's timber plank AB",
  "a theatre stage lighting batten AB",
  "a calibrated laboratory hardwood bar AB",
  "a structural aluminium inspection girder AB",
  "a museum exhibition display beam AB",
  "a workshop bench-testing steel bar AB",
  "a shipyard maintenance gangway plank AB",
  "a botanical conservatory walkway beam AB",
  "a civil-engineering model truss rod AB",
  "a warehouse loading-bay balancing spar AB",
  "an architectural studio cantilever model AB",
  "a rowing-club boathouse oar-rack beam AB",
  "a physics demonstration metre-scale rail AB",
  "a solar-panel mounting rail AB",
] as const;

function buildSinglePivotBalance(
  id: string,
  seed: number,
  variant: number,
  generatorModel: string,
): CandidateQuestionInput {
  const format: QuestionFormat = variant < 8 ? "mcq" : "structured";
  const findPos = variant % 2 === 1;
  const nonUniform = variant % 3 === 2;
  const context = SINGLE_PIVOT_CONTEXTS[variant % SINGLE_PIVOT_CONTEXTS.length];

  for (let attempt = 0; attempt < 40; attempt += 1) {
    const rng = createRng(seed + attempt * 997);
    const L = rng.step(2.4, 5.2, 0.2, 1);
    const mBeam = rng.step(6.0, 28.0, 1.0, 1);
    const xCg = nonUniform
      ? Number((L * rng.step(0.54, 0.64, 0.02, 2)).toFixed(2))
      : Number((L / 2).toFixed(2));
    const xPiv = Number((L * rng.step(0.28, 0.42, 0.02, 2)).toFixed(2));
    if (xCg - xPiv < 0.25) continue;

    if (!findPos) {
      const xLoad = Number((xPiv * rng.step(0.2, 0.45, 0.05, 2)).toFixed(2));
      if (xPiv - xLoad < 0.2) continue;
      const spec: Record<string, unknown> = {
        kind: "beam-single-pivot-moments",
        mode: "find-balance-mass",
        beamLengthM: L,
        beamMassKg: mBeam,
        cgFromLeftM: xCg,
        pivotFromLeftM: xPiv,
        loadFromLeftM: xLoad,
        gravityMs2: NCUK_GRAVITY_MS2,
      };
      const q = solvePlugin("beam-single-pivot-moments", spec);
      const hidden = format === "mcq"
        ? ["loadMassKg", "loadWeightN", "pivotReactionN"]
        : ["loadMassKg", "loadWeightN", "pivotReactionN", "momentDefinitionConcept"];
      const pubNums = [
        ...collectSpecPublicNumbers(spec, hidden),
        q.cgLeverArmM as number,
        q.loadLeverArmM as number,
      ];
      if (hasHiddenNumericCollision(q, hidden, pubNums)) continue;

      const mLoad = q.loadMassKg as number;
      const wBeam = q.beamWeightN as number;
      const dCg = q.cgLeverArmM as number;
      const dLoad = q.loadLeverArmM as number;
      const pivR = q.pivotReactionN as number;
      const momDef = String(q.momentDefinitionConcept);

      const uniformityPhrase = nonUniform
        ? `non-uniform, with its centre of gravity G located ${fmtGiven(xCg)} m from end A`
        : `uniform, with its centre of gravity G at its midpoint (${fmtGiven(xCg)} m from end A)`;

      const stem = `As shown in the diagram, ${context} of total length L = ${fmtGiven(L, 1)} m and mass ${fmtGiven(mBeam, 1)} kg is ${uniformityPhrase}. The beam rests horizontally in equilibrium on a sharp pivot P positioned ${fmtGiven(xPiv)} m from end A when a counterbalance block of unknown mass is placed ${fmtGiven(xLoad)} m from end A (take g = 9.81 m s⁻²).`;

      const requiredGivens: RequiredGivenSpec[] = [
        { name: "beamLengthM", value: L, unit: "m", source: "either" },
        { name: "beamMassKg", value: mBeam, unit: "kg", source: "either" },
        { name: "cgFromLeftM", value: xCg, unit: "m", source: "either" },
        { name: "pivotFromLeftM", value: xPiv, unit: "m", source: "either" },
        { name: "loadFromLeftM", value: xLoad, unit: "m", source: "either" },
        { name: "gravityMs2", value: NCUK_GRAVITY_MS2, unit: "m s⁻²", source: "stem" },
      ];

      const plan: CandidateQuestionPlan = {
        targetSummary:
          "Apply the principle of moments about the off-centre pivot to determine the unknown balancing mass and pivot reaction.",
        distractorStrategy: [
          "Measuring lever arms from end A instead of from the pivot P.",
          "Inverting the lever-arm ratio when solving for the balancing mass.",
          "Treating the beam as pivoted at its midpoint or omitting the offset distance.",
        ],
      };

      if (format === "mcq") {
        const askReaction = variant % 4 === 2;
        const targetKey = askReaction ? "pivotReactionN" : "loadMassKg";
        const targetVal = askReaction ? pivR : mLoad;
        const unit = askReaction ? "N" : "kg";
        const questionSentence = askReaction
          ? "What is the upward reaction force R exerted by pivot P on the balanced beam?"
          : "What mass of counterbalance block is required to hold the beam horizontally in equilibrium?";

        const distractors: NumericDistractor[] = askReaction
          ? [
              {
                value: wBeam,
                rationale: "Counts only the weight of the beam and omits the balancing block weight.",
              },
              {
                value: Math.abs(wBeam - (q.loadWeightN as number)),
                rationale: "Subtracts the two downward weights instead of summing them for vertical equilibrium.",
              },
              {
                value: mBeam + mLoad,
                rationale: "Computes total mass in kg without multiplying by g = 9.81 m s⁻².",
              },
            ]
          : [
              {
                value: (mBeam * xCg) / xLoad,
                rationale: "Measures both distances from end A instead of from pivot P.",
              },
              {
                value: (mBeam * dLoad) / dCg,
                rationale: "Inverts the lever-arm ratio when rearranging the moment equation.",
              },
              {
                value: (mBeam * (L - xPiv)) / dLoad,
                rationale: "Uses the distance to end B rather than to the centre of gravity G.",
              },
            ];

        return {
          id,
          conceptId: "vectors-equilibrium-moments",
          templateArchetype: "single-pivot-offcentre-balance",
          seed: seed + attempt * 997,
          syllabi: [...AC23_SYLLABI],
          format: "mcq",
          difficulty: difficultyForVariant(variant),
          domain: "mechanics",
          scenarioSpec: spec,
          hiddenQuantities: hidden,
          requiredGivens,
          questionPlan: plan,
          stem: `${stem} ${questionSentence}`,
          options: buildNumericMcqOptions(targetVal, unit, distractors, seed + attempt),
          targetQuantityKey: targetKey,
          workedSolution: `Take moments about pivot P. Lever arm of beam CG is d_G = ${fmtGiven(xCg)} − ${fmtGiven(xPiv)} = ${fmt4(dCg, "m")}. Lever arm of counterbalance is d_load = ${fmtGiven(xPiv)} − ${fmtGiven(xLoad)} = ${fmt4(dLoad, "m")}. Balancing moments: m_load g d_load = m_beam g d_G ⇒ m_load = (${fmtGiven(mBeam, 1)} × ${fmt4(dCg)}) / ${fmt4(dLoad)} = ${fmt4(mLoad, "kg")} ≈ ${fmt3(mLoad, "kg")}. Vertical equilibrium gives R = (m_beam + m_load)g = (${fmtGiven(mBeam, 1)} + ${fmt4(mLoad)}) × 9.81 = ${fmt4(pivR, "N")} ≈ ${fmt3(pivR, "N")}.`,
          markScheme: [
            {
              code: "A1",
              criterion: askReaction
                ? `Correct upward pivot reaction R = ${fmt3(pivR, "N")}.`
                : `Correct balancing mass m_load = ${fmt3(mLoad, "kg")}.`,
              marks: 1,
            },
          ],
          totalMarks: 1,
          generatorModel,
        };
      }

      // 4m Structured: (a) [2m qual] define moment + (b) [2m quant] calculate balancing mass
      const parts: StructuredQuestionPart[] = [
        {
          partId: "a",
          prompt: "Define the moment of a force about a pivot.",
          marks: 2,
          targetMode: "qualitative",
          targetQuantityKey: "momentDefinitionConcept",
          expectedAnswer: `The moment of a force about a pivot is the ${momDef}.`,
          workingSteps: [
            "State that moment equals the magnitude of the force multiplied by distance from the pivot.",
            "Specify explicitly that the distance is the perpendicular distance from the pivot to the line of action of the force.",
          ],
        },
        {
          partId: "b",
          prompt:
            "By applying the principle of moments about pivot P, calculate the mass of the counterbalance block needed for horizontal equilibrium.",
          marks: 2,
          targetQuantityKey: "loadMassKg",
          expectedAnswer: `${fmt3(mLoad, "kg")}`,
          workingSteps: [
            `Find perpendicular distances from P: d_G = ${fmt4(dCg, "m")} and d_load = ${fmt4(dLoad, "m")}.`,
            `Set clockwise moment equal to anticlockwise moment: m_load × 9.81 × ${fmt4(dLoad)} = ${fmtGiven(mBeam, 1)} × 9.81 × ${fmt4(dCg)}.`,
            `m_load = ${fmt4(mLoad, "kg")} ≈ ${fmt3(mLoad, "kg")}.`,
          ],
        },
      ];
      const markScheme: MarkSchemePoint[] = [
        {
          code: "B1",
          partId: "a",
          criterion: "Product of force and distance from the pivot.",
          marks: 1,
        },
        {
          code: "B1",
          partId: "a",
          criterion: "Specifies perpendicular distance from the pivot to the line of action of the force.",
          marks: 1,
        },
        {
          code: "M1",
          partId: "b",
          criterion: `Equates opposing moments about P using d_G = ${fmt4(dCg, "m")} and d_load = ${fmt4(dLoad, "m")}.`,
          marks: 1,
        },
        {
          code: "A1",
          partId: "b",
          criterion: `Obtains balancing mass m = ${fmt3(mLoad, "kg")} (4 s.f. ${fmt4(mLoad, "kg")}).`,
          marks: 1,
        },
      ];
      return {
        id,
        conceptId: "vectors-equilibrium-moments",
        templateArchetype: "single-pivot-offcentre-balance",
        seed: seed + attempt * 997,
        syllabi: [...AC23_SYLLABI],
        format: "structured",
        difficulty: difficultyForVariant(variant),
        domain: "mechanics",
        scenarioSpec: spec,
        hiddenQuantities: hidden,
        requiredGivens,
        questionPlan: plan,
        stem,
        parts,
        workedSolution: `(a) The moment of a force about a pivot is the ${momDef}. (b) Taking moments about P: m_load g (${fmt4(dLoad)}) = (${fmtGiven(mBeam, 1)}) g (${fmt4(dCg)}), giving m_load = ${fmt4(mLoad, "kg")} ≈ ${fmt3(mLoad, "kg")}.`,
        markScheme,
        totalMarks: 4,
        generatorModel,
      };
    }

    // find-balance-position mode: find position measured from end B (NCUK classic trap!)
    const mLoad = rng.step(10.0, 36.0, 2.0, 1);
    const cgArm = xCg - xPiv;
    const loadArmCheck = (mBeam * cgArm) / mLoad;
    const xLoadCheck = xPiv - loadArmCheck;
    if (xLoadCheck < 0.15 || loadArmCheck < 0.2) continue;

    const spec: Record<string, unknown> = {
      kind: "beam-single-pivot-moments",
      mode: "find-balance-position",
      beamLengthM: L,
      beamMassKg: mBeam,
      cgFromLeftM: xCg,
      pivotFromLeftM: xPiv,
      loadMassKg: mLoad,
      gravityMs2: NCUK_GRAVITY_MS2,
    };
    const q = solvePlugin("beam-single-pivot-moments", spec);
    const hidden = format === "mcq"
      ? ["loadLeverArmM", "loadFromLeftM", "loadFromRightM"]
      : ["loadLeverArmM", "loadFromLeftM", "loadFromRightM", "momentDefinitionConcept"];
    const pubNums = [
      ...collectSpecPublicNumbers(spec, hidden),
      q.cgLeverArmM as number,
    ];
    if (hasHiddenNumericCollision(q, hidden, pubNums)) continue;

    const dLoad = q.loadLeverArmM as number;
    const xLoad = q.loadFromLeftM as number;
    const fromB = q.loadFromRightM as number;
    const dCg = q.cgLeverArmM as number;
    const momDef = String(q.momentDefinitionConcept);

    const stem = `In a workshop statics test, ${context} of length L = ${fmtGiven(L, 1)} m and mass ${fmtGiven(mBeam, 1)} kg has its centre of gravity G at ${fmtGiven(xCg)} m from end A. It is balanced horizontally on a knife-edge pivot P located ${fmtGiven(xPiv)} m from end A by placing a ${fmtGiven(mLoad, 1)} kg calibration block to the left of P (use g = 9.81 m s⁻²).`;

    const requiredGivens: RequiredGivenSpec[] = [
      { name: "beamLengthM", value: L, unit: "m", source: "either" },
      { name: "beamMassKg", value: mBeam, unit: "kg", source: "either" },
      { name: "cgFromLeftM", value: xCg, unit: "m", source: "either" },
      { name: "pivotFromLeftM", value: xPiv, unit: "m", source: "either" },
      { name: "loadMassKg", value: mLoad, unit: "kg", source: "either" },
      { name: "gravityMs2", value: NCUK_GRAVITY_MS2, unit: "m s⁻²", source: "stem" },
    ];

    const plan: CandidateQuestionPlan = {
      targetSummary:
        "Calculate the balancing lever arm about the off-centre pivot and convert it to a distance measured from end B.",
      distractorStrategy: [
        "Reporting the distance from pivot P instead of from end B.",
        "Reporting the distance from end A instead of from end B.",
        "Subtracting the lever arm from the distance to G instead of adding to B–P.",
      ],
    };

    if (format === "mcq") {
      const distractors: NumericDistractor[] = [
        {
          value: dLoad,
          rationale: "Stops at the distance from pivot P instead of measuring from end B.",
        },
        {
          value: xLoad,
          rationale: "Measures the final block position from end A rather than from end B.",
        },
        {
          value: L - xPiv - dLoad,
          rationale: "Subtracts the lever arm from (L − x_P) instead of adding it to reach the left of P.",
        },
      ];
      return {
        id,
        conceptId: "vectors-equilibrium-moments",
        templateArchetype: "single-pivot-offcentre-balance",
        seed: seed + attempt * 997,
        syllabi: [...AC23_SYLLABI],
        format: "mcq",
        difficulty: difficultyForVariant(variant),
        domain: "mechanics",
        scenarioSpec: spec,
        hiddenQuantities: hidden,
        requiredGivens,
        questionPlan: plan,
        stem: `${stem} How far from end B must the ${fmtGiven(mLoad, 1)} kg block be positioned for horizontal equilibrium?`,
        options: buildNumericMcqOptions(fromB, "m", distractors, seed + attempt),
        targetQuantityKey: "loadFromRightM",
        workedSolution: `Distance of CG from pivot P: d_G = ${fmtGiven(xCg)} − ${fmtGiven(xPiv)} = ${fmt4(dCg, "m")}. Taking moments about P: ${fmtGiven(mLoad, 1)} × d = ${fmtGiven(mBeam, 1)} × ${fmt4(dCg)} ⇒ d = ${fmt4(dLoad, "m")} left of P. Position from end A is x_A = ${fmtGiven(xPiv)} − ${fmt4(dLoad)} = ${fmt4(xLoad, "m")}. Therefore distance from end B is L − x_A = ${fmtGiven(L, 1)} − ${fmt4(xLoad)} = ${fmt4(fromB, "m")} ≈ ${fmt3(fromB, "m")}.`,
        markScheme: [
          {
            code: "A1",
            criterion: `Correct distance from end B = ${fmt3(fromB, "m")}.`,
            marks: 1,
          },
        ],
        totalMarks: 1,
        generatorModel,
      };
    }

    const parts: StructuredQuestionPart[] = [
      {
        partId: "a",
        prompt: "State the definition of the moment of a force about a point.",
        marks: 2,
        targetMode: "qualitative",
        targetQuantityKey: "momentDefinitionConcept",
        expectedAnswer: `It is the ${momDef}.`,
        workingSteps: [
          "State force multiplied by distance from the pivot.",
          "Include the requirement that the distance is perpendicular to the line of action of the force.",
        ],
      },
      {
        partId: "b",
        prompt:
          "Determine the distance from end B at which the calibration block must be placed so that the beam balances horizontally.",
        marks: 2,
        targetQuantityKey: "loadFromRightM",
        expectedAnswer: `${fmt3(fromB, "m")}`,
        workingSteps: [
          `Clockwise moment of beam weight about P = ${fmtGiven(mBeam, 1)} × 9.81 × ${fmt4(dCg)}.`,
          `Equate with anticlockwise moment of block: d = (${fmtGiven(mBeam, 1)} × ${fmt4(dCg)}) / ${fmtGiven(mLoad, 1)} = ${fmt4(dLoad, "m")} to the left of P.`,
          `Distance from end B = (${fmtGiven(L, 1)} − ${fmtGiven(xPiv)}) + ${fmt4(dLoad)} = ${fmt4(fromB, "m")} ≈ ${fmt3(fromB, "m")}.`,
        ],
      },
    ];
    const markScheme: MarkSchemePoint[] = [
      { code: "B1", partId: "a", criterion: "Force multiplied by distance from pivot.", marks: 1 },
      { code: "B1", partId: "a", criterion: "Perpendicular distance to the line of action.", marks: 1 },
      {
        code: "M1",
        partId: "b",
        criterion: `Correct moment balance about P yielding lever arm d = ${fmt4(dLoad, "m")}.`,
        marks: 1,
      },
      {
        code: "A1",
        partId: "b",
        criterion: `Converts cleanly to distance from end B = ${fmt3(fromB, "m")}.`,
        marks: 1,
      },
    ];
    return {
      id,
      conceptId: "vectors-equilibrium-moments",
      templateArchetype: "single-pivot-offcentre-balance",
      seed: seed + attempt * 997,
      syllabi: [...AC23_SYLLABI],
      format: "structured",
      difficulty: difficultyForVariant(variant),
      domain: "mechanics",
      scenarioSpec: spec,
      hiddenQuantities: hidden,
      requiredGivens,
      questionPlan: plan,
      stem,
      parts,
      workedSolution: `(a) The moment of a force is the ${momDef}. (b) Moment balance about P gives d = ${fmt4(dLoad, "m")} left of P, so distance from end B is ${fmt4(fromB, "m")} ≈ ${fmt3(fromB, "m")}.`,
      markScheme,
      totalMarks: 4,
      generatorModel,
    };
  }
  throw new Error(`Failed to sample single-pivot-offcentre-balance (${id})`);
}

/* ============================================================================
 * ARCHETYPE 2: crane-counterweight-safe-load (ncuk-ac2-3, 14 items)
 * ============================================================================ */

const CRANE_CONTEXTS = [
  "a dockside container jib crane",
  "a high-rise tower construction crane",
  "a shipyard steel-plate lifting crane",
  "a railway freight-yard cantilever crane",
  "a quarry stone-block jib crane",
  "a hydroelectric dam maintenance crane",
  "a bridge-deck segment erection crane",
  "a wind-turbine nacelle assembly crane",
  "a steel-mill ladle transfer cantilever",
  "a marine dry-dock hull gantry crane",
  "a precast-concrete yard tower jib",
  "a cargo-terminal balanced derrick boom",
  "an offshore-platform supply jib crane",
  "a timber-mill log-handling tower crane",
] as const;

function buildCraneCounterweight(
  id: string,
  seed: number,
  variant: number,
  generatorModel: string,
): CandidateQuestionInput {
  const format: QuestionFormat = variant < 8 ? "mcq" : "structured";
  const context = CRANE_CONTEXTS[variant % CRANE_CONTEXTS.length];

  for (let attempt = 0; attempt < 40; attempt += 1) {
    const rng = createRng(seed + attempt * 997);
    const L = rng.step(14.0, 26.0, 1.0, 1);
    const xPiv = rng.step(4.5, 7.5, 0.5, 1);
    const xCw = rng.step(0.8, 2.0, 0.2, 1);
    const cwArm = Number((xPiv - xCw).toFixed(2));
    const cgArm = rng.step(2.0, 4.5, 0.5, 1);
    const xCg = Number((xPiv + cgArm).toFixed(2));
    const xLoad = Number((L - rng.step(0.5, 2.5, 0.5, 1)).toFixed(2));
    if (xLoad <= xCg + 1.5 || xLoad > L) continue;

    const mBeam = rng.step(400, 1200, 50, 0);
    const mCw = rng.step(1800, 4800, 200, 0);
    if (mCw * cwArm <= mBeam * cgArm + 2500) continue;

    const spec: Record<string, unknown> = {
      kind: "beam-single-pivot-moments",
      mode: "crane-counterweight",
      beamLengthM: L,
      beamMassKg: mBeam,
      cgFromLeftM: xCg,
      pivotFromLeftM: xPiv,
      counterweightMassKg: mCw,
      counterweightFromLeftM: xCw,
      loadFromLeftM: xLoad,
      gravityMs2: NCUK_GRAVITY_MS2,
    };
    const q = solvePlugin("beam-single-pivot-moments", spec);
    const hidden = [
      "maxSafeLoadMassKg",
      "maxSafeLoadWeightN",
      "loadMassKg",
      "loadWeightN",
      "pivotReactionN",
      "counterweightMomentNm",
    ];
    const pubNums = [
      ...collectSpecPublicNumbers(spec, hidden),
      cwArm,
      cgArm,
      q.loadLeverArmM as number,
    ];
    if (hasHiddenNumericCollision(q, hidden, pubNums)) continue;

    const loadArm = q.loadLeverArmM as number;
    const cwMom = q.counterweightMomentNm as number;
    const beamMom = q.beamMomentNm as number;
    const maxLoadKg = q.maxSafeLoadMassKg as number;
    const maxLoadN = q.maxSafeLoadWeightN as number;
    const pivR = q.pivotReactionN as number;

    const stem = `The horizontal boom of ${context} has total length L = ${fmtGiven(L, 1)} m and mass ${fmtGiven(mBeam, 0)} kg, supported on a vertical mast pivot P located ${fmtGiven(xPiv, 1)} m from the rear end A. A concrete counterweight of mass ${fmtGiven(mCw, 0)} kg sits ${fmtGiven(cwArm)} m to the left of P (${fmtGiven(xCw, 1)} m from A). The centre of gravity G of the boom itself lies ${fmtGiven(cgArm, 1)} m to the right of P (${fmtGiven(xCg, 1)} m from A), and the hoist hook hangs ${fmtGiven(loadArm, 1)} m to the right of P (take g = 9.81 m s⁻²).`;

    const requiredGivens: RequiredGivenSpec[] = [
      { name: "beamLengthM", value: L, unit: "m", source: "either" },
      { name: "beamMassKg", value: mBeam, unit: "kg", source: "either" },
      { name: "counterweightMassKg", value: mCw, unit: "kg", source: "either" },
      { name: "pivotFromLeftM", value: xPiv, unit: "m", source: "either" },
      { name: "counterweightLeverArmM", value: cwArm, unit: "m", source: "either" },
      { name: "cgLeverArmM", value: cgArm, unit: "m", source: "either" },
      { name: "loadLeverArmM", value: loadArm, unit: "m", source: "either" },
      { name: "gravityMs2", value: NCUK_GRAVITY_MS2, unit: "m s⁻²", source: "stem" },
    ];

    const plan: CandidateQuestionPlan = {
      targetSummary:
        "Balance anticlockwise counterweight moment against clockwise jib self-weight and hoist-load moments about the crane mast pivot.",
      distractorStrategy: [
        "Neglecting the self-weight moment of the boom when computing maximum safe load.",
        "Adding the boom moment to the counterweight moment instead of subtracting it.",
        "Measuring the counterweight lever arm from end A instead of from the mast pivot.",
      ],
    };

    if (format === "mcq") {
      const askWeight = variant % 3 === 1;
      const targetKey = askWeight ? "maxSafeLoadWeightN" : "maxSafeLoadMassKg";
      const targetVal = askWeight ? maxLoadN : maxLoadKg;
      const unit = askWeight ? "N" : "kg";
      const distractors: NumericDistractor[] = askWeight
        ? [
            {
              value: cwMom / loadArm,
              rationale: "Omits the clockwise moment due to the jib boom's own weight.",
            },
            {
              value: (cwMom + beamMom) / loadArm,
              rationale: "Adds the jib boom moment to the counterweight moment instead of subtracting.",
            },
            {
              value: maxLoadKg,
              rationale: "Reports the maximum safe mass in kg instead of weight in N.",
            },
          ]
        : [
            {
              value: (mCw * cwArm) / loadArm,
              rationale: "Ignores the clockwise moment created by the jib boom's own mass.",
            },
            {
              value: (mCw * cwArm + mBeam * cgArm) / loadArm,
              rationale: "Adds the boom moment to the counterweight moment rather than subtracting it.",
            },
            {
              value: (mCw * xCw - mBeam * cgArm) / loadArm,
              rationale: "Uses the distance of the counterweight from end A instead of from pivot P.",
            },
          ];

      return {
        id,
        conceptId: "vectors-equilibrium-moments",
        templateArchetype: "crane-counterweight-safe-load",
        seed: seed + attempt * 997,
        syllabi: [...AC23_SYLLABI],
        format: "mcq",
        difficulty: difficultyForVariant(variant),
        domain: "mechanics",
        scenarioSpec: spec,
        hiddenQuantities: hidden,
        requiredGivens,
        questionPlan: plan,
        stem: `${stem} ${
          askWeight
            ? "What is the maximum safe load weight that can be suspended from the hook without producing a net clockwise tipping moment about P?"
            : "What is the maximum safe load mass that can be suspended from the hook for rotational equilibrium about P?"
        }`,
        options: buildNumericMcqOptions(targetVal, unit, distractors, seed + attempt),
        targetQuantityKey: targetKey,
        workedSolution: `Anticlockwise counterweight moment about P: M_cw = ${fmtGiven(mCw, 0)} × 9.81 × ${fmtGiven(cwArm)} = ${fmt4(cwMom, "N m")}. Clockwise boom moment: M_boom = ${fmtGiven(mBeam, 0)} × 9.81 × ${fmtGiven(cgArm, 1)} = ${fmt4(beamMom, "N m")}. Remaining clockwise moment available for load: W_max × ${fmtGiven(loadArm, 1)} = ${fmt4(cwMom - beamMom, "N m")} ⇒ W_max = ${fmt4(maxLoadN, "N")} ≈ ${fmt3(maxLoadN, "N")}, m_max = W_max / 9.81 = ${fmt4(maxLoadKg, "kg")} ≈ ${fmt3(maxLoadKg, "kg")}.`,
        markScheme: [
          {
            code: "A1",
            criterion: askWeight
              ? `Correct maximum safe load weight = ${fmt3(maxLoadN, "N")}.`
              : `Correct maximum safe load mass = ${fmt3(maxLoadKg, "kg")}.`,
            marks: 1,
          },
        ],
        totalMarks: 1,
        generatorModel,
      };
    }

    // 6m Structured: (a) counterweight moment [2m], (b) max safe load mass [2m], (c) mast pivot reaction [2m]
    const parts: StructuredQuestionPart[] = [
      {
        partId: "a",
        prompt:
          "Calculate the anticlockwise moment exerted by the concrete counterweight about pivot P.",
        marks: 2,
        targetQuantityKey: "counterweightMomentNm",
        expectedAnswer: `${fmt3(cwMom, "N m")}`,
        workingSteps: [
          `Counterweight weight W_cw = ${fmtGiven(mCw, 0)} × 9.81 = ${fmt4(mCw * NCUK_GRAVITY_MS2, "N")}.`,
          `Moment M_cw = W_cw × ${fmtGiven(cwArm)} = ${fmt4(cwMom, "N m")} ≈ ${fmt3(cwMom, "N m")}.`,
        ],
      },
      {
        partId: "b",
        prompt:
          "Taking into account the weight of the boom, determine the maximum load mass that can be lifted at the hoist hook so the net moment about P is zero.",
        marks: 2,
        dependsOnPartIds: ["a"],
        targetQuantityKey: "maxSafeLoadMassKg",
        expectedAnswer: `${fmt3(maxLoadKg, "kg")}`,
        workingSteps: [
          `Clockwise moment of boom = ${fmtGiven(mBeam, 0)} × 9.81 × ${fmtGiven(cgArm, 1)} = ${fmt4(beamMom, "N m")}.`,
          `Moment balance: m_max × 9.81 × ${fmtGiven(loadArm, 1)} = ${fmt4(cwMom)} − ${fmt4(beamMom)} = ${fmt4(cwMom - beamMom, "N m")}.`,
          `m_max = ${fmt4(maxLoadKg, "kg")} ≈ ${fmt3(maxLoadKg, "kg")}.`,
        ],
      },
      {
        partId: "c",
        prompt:
          "Calculate the total upward reaction force exerted by the vertical mast pivot P when this maximum load is suspended in equilibrium.",
        marks: 2,
        dependsOnPartIds: ["b"],
        targetQuantityKey: "pivotReactionN",
        expectedAnswer: `${fmt3(pivR, "N")}`,
        workingSteps: [
          `Vertical equilibrium: R = (m_cw + m_boom + m_max) g.`,
          `R = (${fmtGiven(mCw, 0)} + ${fmtGiven(mBeam, 0)} + ${fmt4(maxLoadKg)}) × 9.81 = ${fmt4(pivR, "N")} ≈ ${fmt3(pivR, "N")}.`,
        ],
      },
    ];
    const markScheme: MarkSchemePoint[] = [
      { code: "M1", partId: "a", criterion: "Uses M = m g d with counterweight mass and lever arm from P.", marks: 1 },
      { code: "A1", partId: "a", criterion: `Counterweight moment = ${fmt3(cwMom, "N m")}.`, marks: 1 },
      { code: "M1", partId: "b", criterion: "Subtracts boom self-weight moment from counterweight moment and divides by g × load lever arm.", marks: 1 },
      { code: "A1", partId: "b", criterion: `Maximum safe load mass = ${fmt3(maxLoadKg, "kg")}.`, marks: 1 },
      { code: "M1", partId: "c", criterion: "Applies vertical force balance summing counterweight, boom, and load weights.", marks: 1 },
      { code: "A1", partId: "c", criterion: `Upward mast reaction R = ${fmt3(pivR, "N")}.`, marks: 1 },
    ];
    return {
      id,
      conceptId: "vectors-equilibrium-moments",
      templateArchetype: "crane-counterweight-safe-load",
      seed: seed + attempt * 997,
      syllabi: [...AC23_SYLLABI],
      format: "structured",
      difficulty: difficultyForVariant(variant),
      domain: "mechanics",
      scenarioSpec: spec,
      hiddenQuantities: hidden,
      requiredGivens,
      questionPlan: plan,
      stem,
      parts,
      workedSolution: `(a) M_cw = ${fmt4(cwMom, "N m")} ≈ ${fmt3(cwMom, "N m")}. (b) Equating clockwise and anticlockwise moments about P gives m_max = ${fmt4(maxLoadKg, "kg")} ≈ ${fmt3(maxLoadKg, "kg")}. (c) Vertical force balance yields R = ${fmt4(pivR, "N")} ≈ ${fmt3(pivR, "N")}.`,
      markScheme,
      totalMarks: 6,
      generatorModel,
    };
  }
  throw new Error(`Failed to sample crane-counterweight-safe-load (${id})`);
}

/* ============================================================================
 * ARCHETYPE 3: overhanging-bridge-support-reactions-tipping (ncuk-ac2-3, 14 items)
 * ============================================================================ */

const OVERHANG_CONTEXTS = [
  "a uniform timber diving board",
  "a builder's overhanging scaffold plank",
  "a park footbridge inspection deck",
  "a lakeside wooden viewing jetty plank",
  "a warehouse cantilevered staging board",
  "a stadium camera-operator platform plank",
  "a marina boat-boarding gangplank",
  "a civil-lab steel overhanging girder",
  "a theatre stage apron extension beam",
  "a surveyor's creek-crossing timber plank",
  "a rooftop HVAC maintenance walkway beam",
  "a shipyard painter's overhanging scaffold board",
  "a conservatory plant-staging timber beam",
  "a railway-inspection overhanging walkway plank",
] as const;

function buildOverhangingBeam(
  id: string,
  seed: number,
  variant: number,
  generatorModel: string,
): CandidateQuestionInput {
  const format: QuestionFormat = variant < 8 ? "mcq" : "structured";
  const isQualMcq = variant === 6 || variant === 7;
  const context = OVERHANG_CONTEXTS[variant % OVERHANG_CONTEXTS.length];

  for (let attempt = 0; attempt < 40; attempt += 1) {
    const rng = createRng(seed + attempt * 997);
    const L = rng.step(4.6, 7.2, 0.2, 1);
    const xCg = Number((L / 2).toFixed(2));
    const xA = variant % 3 === 0 ? 0 : rng.step(0.4, 0.8, 0.2, 1);
    const overhang = rng.step(1.4, 2.2, 0.2, 1);
    const xB = Number((L - overhang).toFixed(2));
    if (xB - xCg < 0.45 || xB - xA < 2.0) continue;

    const mBeam = rng.step(24, 68, 4, 0);
    const mLoad = rng.step(48, 86, 2, 0);
    const tipPastB = (mBeam * (xB - xCg)) / mLoad;
    // Ensure tipping happens cleanly BEFORE the right end of the plank!
    if (tipPastB < 0.35 || tipPastB > overhang - 0.25) continue;

    const xLoad = Number((xA + rng.step(0.7, xB - xA - 0.5, 0.2, 1)).toFixed(2));
    const spec: Record<string, unknown> = {
      kind: "beam-two-support-overhang",
      beamLengthM: L,
      beamMassKg: mBeam,
      cgFromLeftM: xCg,
      supportAFromLeftM: xA,
      supportBFromLeftM: xB,
      loadMassKg: mLoad,
      loadFromLeftM: xLoad,
      gravityMs2: NCUK_GRAVITY_MS2,
    };
    const q = solvePlugin("beam-two-support-overhang", spec);
    const hidden = isQualMcq
      ? [
          variant === 6 ? "tippingConditionConcept" : "loadMoveRightEffectConcept",
          "reactionAN",
          "reactionBN",
          "tippingPastBM",
        ]
      : [
          "reactionAN",
          "reactionBN",
          "tippingPastBM",
          "tippingFromRightEndM",
          "maxEndLoadMassKg",
        ];
    const pubNums = [
      ...collectSpecPublicNumbers(spec, hidden),
      q.supportSpanM as number,
      q.overhangLengthM as number,
    ];
    if (hasHiddenNumericCollision(q, hidden, pubNums)) continue;

    const rA = q.reactionAN as number;
    const rB = q.reactionBN as number;
    const dTip = q.tippingPastBM as number;
    const spanAB = q.supportSpanM as number;
    const maxEndMass = q.maxEndLoadMassKg as number;
    const loadShiftTxt = String(q.loadMoveRightEffectConcept);
    const tipCondTxt = String(q.tippingConditionConcept);

    const aLocPhrase =
      xA === 0
        ? "at its left end"
        : `${fmtGiven(xA, 1)} m from its left end`;

    const stem = `As shown in the figure, ${context} of total length L = ${fmtGiven(L, 1)} m and mass ${fmtGiven(mBeam, 0)} kg rests horizontally on two narrow supports A and B. Support A is positioned ${aLocPhrase}, and support B is ${fmtGiven(spanAB)} m to the right of A, leaving an unsupported right-hand overhang of ${fmtGiven(overhang, 1)} m. A technician of mass ${fmtGiven(mLoad, 0)} kg initially stands ${fmtGiven(xLoad)} m from the left end of the plank (take g = 9.81 m s⁻²).`;

    const requiredGivens: RequiredGivenSpec[] = [
      { name: "beamLengthM", value: L, unit: "m", source: "either" },
      { name: "beamMassKg", value: mBeam, unit: "kg", source: "either" },
      { name: "supportSpanM", value: spanAB, unit: "m", source: "either" },
      { name: "overhangLengthM", value: overhang, unit: "m", source: "either" },
      { name: "loadMassKg", value: mLoad, unit: "kg", source: "either" },
      { name: "loadFromLeftM", value: xLoad, unit: "m", source: "either" },
      { name: "gravityMs2", value: NCUK_GRAVITY_MS2, unit: "m s⁻²", source: "stem" },
    ];

    const plan: CandidateQuestionPlan = {
      targetSummary:
        "Determine support reaction forces on an overhanging beam via moments and vertical force equilibrium, and evaluate the lift-off tipping limit when support A unloads.",
      distractorStrategy: [
        "Dividing total weight equally between supports without taking moments.",
        "Using the full beam length instead of the support span AB as the lever arm.",
        "Measuring the beam CG distance from support A instead of from the tipping pivot B.",
      ],
    };

    if (isQualMcq) {
      const askTipCond = variant === 6;
      const targetKey = askTipCond
        ? "tippingConditionConcept"
        : "loadMoveRightEffectConcept";
      const correctText = askTipCond
        ? `At the instant tipping begins about support B, ${tipCondTxt}.`
        : `As the technician walks steadily toward the overhanging end, ${loadShiftTxt}.`;
      const qualDistractors = askTipCond
        ? [
            {
              text: "The upward reaction force at support B decreases to zero while support A carries the entire weight.",
              rationale: "Reverses the two supports; tipping occurs about B so the plank lifts off A, not B.",
            },
            {
              text: "Both support reaction forces become equal to half the combined weight of plank and technician.",
              rationale: "Confuses tipping with symmetric weight sharing.",
            },
            {
              text: "The centre of gravity of the plank shifts physically to the right of support B.",
              rationale: "The plank's own centre of gravity remains fixed at its geometric midpoint.",
            },
          ]
        : [
            {
              text: "The reaction force at support A increases while the reaction force at support B decreases.",
              rationale: "Moving the load closer to B increases the load share on B and reduces the load share on A.",
            },
            {
              text: "Both support reaction forces increase together because the torque increases.",
              rationale: "The sum of the upward reactions must remain equal to the constant total weight.",
            },
            {
              text: "Both support reaction forces stay constant until the technician passes support B.",
              rationale: "Any rightward shift immediately transfers vertical load from support A to support B.",
            },
          ];

      return {
        id,
        conceptId: "vectors-equilibrium-moments",
        templateArchetype: "overhanging-bridge-support-reactions-tipping",
        seed: seed + attempt * 997,
        syllabi: [...AC23_SYLLABI],
        format: "mcq",
        difficulty: difficultyForVariant(variant),
        domain: "mechanics",
        scenarioSpec: spec,
        hiddenQuantities: hidden,
        requiredGivens,
        questionPlan: plan,
        stem: `${stem} ${
          askTipCond
            ? "Which statement correctly describes the mechanical condition at the exact instant the plank starts to tip clockwise about support B?"
            : "Which statement correctly describes how the two upward support reaction forces change as the technician walks steadily from support A toward the overhanging end?"
        }`,
        targetMode: "qualitative",
        targetQuantityKey: targetKey,
        options: buildQualitativeMcqOptions(correctText, qualDistractors, seed + attempt),
        workedSolution: askTipCond
          ? `As the technician moves out onto the overhang, the clockwise moment about B increases until the plank is on the point of lifting off support A, so ${tipCondTxt}.`
          : `Taking moments about B shows that reducing the technician's anticlockwise lever arm lowers F₁; because F₁ + F₂ equals total weight, ${loadShiftTxt}.`,
        markScheme: [
          {
            code: "B1",
            criterion: askTipCond
              ? `Identifies that ${tipCondTxt}.`
              : `Identifies that ${loadShiftTxt}.`,
            marks: 1,
          },
        ],
        totalMarks: 1,
        generatorModel,
      };
    }

    if (format === "mcq") {
      const modePick = variant % 3;
      const targetKey =
        modePick === 0
          ? "reactionAN"
          : modePick === 1
            ? "tippingPastBM"
            : "maxEndLoadMassKg";
      const targetVal =
        modePick === 0 ? rA : modePick === 1 ? dTip : maxEndMass;
      const unit = modePick === 0 ? "N" : modePick === 1 ? "m" : "kg";

      const qText =
        modePick === 0
          ? "What is the upward reaction force F₁ exerted by support A while the technician stands at the initial position?"
          : modePick === 1
            ? "How far past support B onto the overhang can the technician walk before the plank begins to tip?"
            : "If the technician steps off and a toolbox is placed right at the outer overhanging tip, what is the maximum toolbox mass the plank can support without tipping?";

      const distractors: NumericDistractor[] =
        modePick === 0
          ? [
              {
                value: rB,
                rationale: "Calculates the reaction at support B instead of support A.",
              },
              {
                value: ((mBeam + mLoad) * NCUK_GRAVITY_MS2) / 2,
                rationale: "Assumes equal load sharing between supports regardless of position.",
              },
              {
                value:
                  ((mBeam * (xB - xCg) + mLoad * (xB - xLoad)) * NCUK_GRAVITY_MS2) / L,
                rationale: "Divides the moment sum by the full plank length L rather than the support span AB.",
              },
            ]
          : modePick === 1
            ? [
                {
                  value: (mBeam * (xCg - xA)) / mLoad,
                  rationale: "Uses the distance from support A to G instead of from tipping pivot B to G.",
                },
                {
                  value: (mLoad * (xB - xCg)) / mBeam,
                  rationale: "Inverts the beam-mass to technician-mass ratio.",
                },
                {
                  value: xB + dTip,
                  rationale: "Reports the total distance from the left end rather than the distance past support B.",
                },
              ]
            : [
                {
                  value: (mBeam * (xCg - xA)) / overhang,
                  rationale: "Measures the restoring lever arm of G from A instead of from tipping pivot B.",
                },
                {
                  value: (mBeam * overhang) / (xB - xCg),
                  rationale: "Inverts the restoring and overhanging lever arms.",
                },
                {
                  value: (mBeam * (xB - xCg)) / L,
                  rationale: "Divides by the full beam length L instead of the overhang length beyond B.",
                },
              ];

      return {
        id,
        conceptId: "vectors-equilibrium-moments",
        templateArchetype: "overhanging-bridge-support-reactions-tipping",
        seed: seed + attempt * 997,
        syllabi: [...AC23_SYLLABI],
        format: "mcq",
        difficulty: difficultyForVariant(variant),
        domain: "mechanics",
        scenarioSpec: spec,
        hiddenQuantities: hidden,
        requiredGivens,
        questionPlan: plan,
        stem: `${stem} ${qText}`,
        options: buildNumericMcqOptions(targetVal, unit, distractors, seed + attempt),
        targetQuantityKey: targetKey,
        workedSolution: `Taking moments about B: F₁ × ${fmtGiven(spanAB)} = (${fmtGiven(mBeam, 0)} × ${fmt4(xB - xCg)} + ${fmtGiven(mLoad, 0)} × ${fmt4(xB - xLoad)}) × 9.81 ⇒ F₁ = ${fmt4(rA, "N")} ≈ ${fmt3(rA, "N")}. At tipping (F₁ = 0): m_load × d_tip = m_beam × (x_B − x_G) ⇒ d_tip = (${fmtGiven(mBeam, 0)} × ${fmt4(xB - xCg)}) / ${fmtGiven(mLoad, 0)} = ${fmt4(dTip, "m")} ≈ ${fmt3(dTip, "m")}. At the very tip (overhang ${fmtGiven(overhang, 1)} m): m_end = (${fmtGiven(mBeam, 0)} × ${fmt4(xB - xCg)}) / ${fmtGiven(overhang, 1)} = ${fmt4(maxEndMass, "kg")} ≈ ${fmt3(maxEndMass, "kg")}.`,
        markScheme: [
          {
            code: "A1",
            criterion: `Correct solver-verified answer = ${fmt3(targetVal, unit)}.`,
            marks: 1,
          },
        ],
        totalMarks: 1,
        generatorModel,
      };
    }

    // 6m Structured: (a) R_A [2m], (b) R_B [1m], (c) qualitative shift [1m], (d) tipping distance past B [2m]
    const parts: StructuredQuestionPart[] = [
      {
        partId: "a",
        prompt:
          "By taking moments about support B, calculate the upward reaction force F₁ at support A while the technician is at the initial position.",
        marks: 2,
        targetQuantityKey: "reactionAN",
        expectedAnswer: `${fmt3(rA, "N")}`,
        workingSteps: [
          `Clockwise moment of F₁ about B = F₁ × ${fmtGiven(spanAB)}.`,
          `Anticlockwise moments about B = (${fmtGiven(mBeam, 0)} × ${fmt4(xB - xCg)} + ${fmtGiven(mLoad, 0)} × ${fmt4(xB - xLoad)}) × 9.81.`,
          `F₁ = ${fmt4(rA, "N")} ≈ ${fmt3(rA, "N")}.`,
        ],
      },
      {
        partId: "b",
        prompt: "Deduce the upward reaction force F₂ at support B.",
        marks: 1,
        dependsOnPartIds: ["a"],
        targetQuantityKey: "reactionBN",
        expectedAnswer: `${fmt3(rB, "N")}`,
        workingSteps: [
          `F₂ = (${fmtGiven(mBeam, 0)} + ${fmtGiven(mLoad, 0)}) × 9.81 − ${fmt4(rA)} = ${fmt4(rB, "N")} ≈ ${fmt3(rB, "N")}.`,
        ],
      },
      {
        partId: "c",
        prompt:
          "State qualitatively how the reaction forces at supports A and B change as the technician walks slowly toward the right-hand overhang.",
        marks: 1,
        targetMode: "qualitative",
        targetQuantityKey: "loadMoveRightEffectConcept",
        expectedAnswer: `As the technician moves toward the overhang, ${loadShiftTxt}.`,
        workingSteps: [
          "Explain that shifting weight toward support B reduces the anticlockwise moment about B so support A carries less load while support B carries more.",
        ],
      },
      {
        partId: "d",
        prompt:
          "Calculate the maximum distance past support B that the technician can walk onto the overhang before the plank begins to tip.",
        marks: 2,
        targetQuantityKey: "tippingPastBM",
        expectedAnswer: `${fmt3(dTip, "m")}`,
        workingSteps: [
          `At the tipping limit, F₁ = 0; take moments about B: ${fmtGiven(mLoad, 0)} g d_tip = ${fmtGiven(mBeam, 0)} g (${fmt4(xB - xCg)}).`,
          `d_tip = (${fmtGiven(mBeam, 0)} × ${fmt4(xB - xCg)}) / ${fmtGiven(mLoad, 0)} = ${fmt4(dTip, "m")} ≈ ${fmt3(dTip, "m")}.`,
        ],
      },
    ];
    const markScheme: MarkSchemePoint[] = [
      { code: "M1", partId: "a", criterion: "Takes moments about B summing plank and technician anticlockwise moments.", marks: 1 },
      { code: "A1", partId: "a", criterion: `Support A reaction F₁ = ${fmt3(rA, "N")}.`, marks: 1 },
      { code: "A1", partId: "b", criterion: `Support B reaction F₂ = ${fmt3(rB, "N")} via vertical force balance.`, marks: 1 },
      { code: "B1", partId: "c", criterion: `States that ${loadShiftTxt}.`, marks: 1 },
      { code: "M1", partId: "d", criterion: "Sets F₁ = 0 and equates clockwise overhang moment to restoring plank moment about B.", marks: 1 },
      { code: "A1", partId: "d", criterion: `Tipping distance past B = ${fmt3(dTip, "m")}.`, marks: 1 },
    ];
    return {
      id,
      conceptId: "vectors-equilibrium-moments",
      templateArchetype: "overhanging-bridge-support-reactions-tipping",
      seed: seed + attempt * 997,
      syllabi: [...AC23_SYLLABI],
      format: "structured",
      difficulty: difficultyForVariant(variant),
      domain: "mechanics",
      scenarioSpec: spec,
      hiddenQuantities: hidden,
      requiredGivens,
      questionPlan: plan,
      stem,
      parts,
      workedSolution: `(a) Moments about B give F₁ = ${fmt4(rA, "N")} ≈ ${fmt3(rA, "N")}. (b) Vertical equilibrium gives F₂ = ${fmt4(rB, "N")} ≈ ${fmt3(rB, "N")}. (c) ${loadShiftTxt}. (d) Setting F₁ = 0 about B yields d_tip = ${fmt4(dTip, "m")} ≈ ${fmt3(dTip, "m")}.`,
      markScheme,
      totalMarks: 6,
      generatorModel,
    };
  }
  throw new Error(`Failed to sample overhanging-bridge-support-reactions-tipping (${id})`);
}

/* ============================================================================
 * ARCHETYPE 4: hinged-wall-sign-angled-wire (ncuk-ac2-3, 14 items)
 * ============================================================================ */

const WALL_SIGN_CONTEXTS = [
  "a bookshop hanging-sign bracket bar",
  "a bakery timber fascia sign rod",
  "a railway-station platform indicator arm",
  "a coastal lighthouse anemometer mast arm",
  "a university courtyard banner boom",
  "a museum gallery wall-mounted support bar",
  "a harbour lantern mounting boom",
  "a workshop hinged folding workbench flap",
  "a café awning horizontal support rod",
  "a laboratory optical-rail hinged wall shelf",
  "a studio spotlight cantilevered wall boom",
  "a botanical garden hanging-basket wall rod",
  "a theatre wing hinged fold-down table leaf",
  "a clockmaker's street-sign bracket bar",
] as const;

function buildHingedWallSign(
  id: string,
  seed: number,
  variant: number,
  generatorModel: string,
): CandidateQuestionInput {
  const format: QuestionFormat = variant < 8 ? "mcq" : "structured";
  const isFlap = variant === 7 || variant === 12 || variant === 13;
  const context = WALL_SIGN_CONTEXTS[variant % WALL_SIGN_CONTEXTS.length];

  for (let attempt = 0; attempt < 40; attempt += 1) {
    const rng = createRng(seed + attempt * 997);

    if (isFlap) {
      const L = rng.step(0.6, 1.4, 0.1, 1);
      const mRod = rng.step(4.0, 14.0, 0.5, 1);
      const xCg = Number((L / 2).toFixed(2));
      const spec: Record<string, unknown> = {
        kind: "hinged-rod-angled-wire",
        mode: "hinged-flap-vertical-lift",
        rodLengthM: L,
        rodMassKg: mRod,
        cgFromHingeM: xCg,
        wireAttachFromHingeM: L,
        gravityMs2: NCUK_GRAVITY_MS2,
      };
      const q = solvePlugin("hinged-rod-angled-wire", spec);
      const liftF = q.wireTensionN as number;
      const hingeV = q.hingeVerticalN as number;
      const flapConcept = String(q.flapHingeEqualityConcept);
      const hidden = ["wireTensionN", "hingeVerticalN", "hingeResultantN"];
      if (hasHiddenNumericCollision(q, hidden, collectSpecPublicNumbers(spec, hidden))) {
        continue;
      }

      const stem = `A uniform rectangular ${context} of length L = ${fmtGiven(L, 1)} m and mass ${fmtGiven(mRod, 1)} kg is smoothly hinged along its left edge O to a vertical wall. It is held horizontally in equilibrium by a vertical upward force F applied at its outer edge ${fmtGiven(L, 1)} m from hinge O (take g = 9.81 m s⁻²).`;
      const requiredGivens: RequiredGivenSpec[] = [
        { name: "rodLengthM", value: L, unit: "m", source: "either" },
        { name: "rodMassKg", value: mRod, unit: "kg", source: "either" },
        { name: "gravityMs2", value: NCUK_GRAVITY_MS2, unit: "m s⁻²", source: "stem" },
      ];
      const plan: CandidateQuestionPlan = {
        targetSummary:
          "Apply moments about a wall hinge to find the vertical holding force on a uniform horizontal flap and justify why the hinge force matches it.",
      };

      if (format === "mcq") {
        const distractors: NumericDistractor[] = [
          { value: mRod * NCUK_GRAVITY_MS2, rationale: "Assumes the outer force must support the entire weight of the flap." },
          { value: mRod * NCUK_GRAVITY_MS2 * L, rationale: "Confuses the moment of the flap with the applied force." },
          { value: (mRod * NCUK_GRAVITY_MS2) / 4, rationale: "Incorrectly halves the half-weight result a second time." },
        ];
        return {
          id,
          conceptId: "vectors-equilibrium-moments",
          templateArchetype: "hinged-wall-sign-angled-wire",
          seed: seed + attempt * 997,
          syllabi: [...AC23_SYLLABI],
          format: "mcq",
          difficulty: "foundation",
          domain: "mechanics",
          scenarioSpec: spec,
          hiddenQuantities: hidden,
          requiredGivens,
          questionPlan: plan,
          stem: `${stem} What is the magnitude of the vertical upward force F required at the outer edge?`,
          options: buildNumericMcqOptions(liftF, "N", distractors, seed + attempt),
          targetQuantityKey: "wireTensionN",
          workedSolution: `Taking moments about wall hinge O: F × L = m g (L / 2) ⇒ F = ½ m g = 0.5 × ${fmtGiven(mRod, 1)} × 9.81 = ${fmt4(liftF, "N")} ≈ ${fmt3(liftF, "N")}.`,
          markScheme: [{ code: "A1", criterion: `Correct vertical holding force F = ${fmt3(liftF, "N")}.`, marks: 1 }],
          totalMarks: 1,
          generatorModel,
        };
      }

      const parts: StructuredQuestionPart[] = [
        {
          partId: "a",
          prompt: "Calculate the vertical upward force F needed at the outer edge to hold the flap horizontal.",
          marks: 2,
          targetQuantityKey: "wireTensionN",
          expectedAnswer: `${fmt3(liftF, "N")}`,
          workingSteps: [
            `Take moments about hinge O: F × ${fmtGiven(L, 1)} = ${fmtGiven(mRod, 1)} × 9.81 × ${fmtGiven(xCg)}.`,
            `F = ${fmt4(liftF, "N")} ≈ ${fmt3(liftF, "N")}.`,
          ],
        },
        {
          partId: "b",
          prompt: "Explain why the upward reaction force exerted by hinge O on the uniform flap has the same magnitude as F.",
          marks: 2,
          targetMode: "qualitative",
          targetQuantityKey: "flapHingeEqualityConcept",
          expectedAnswer: `The hinge reaction matches the outer force because ${flapConcept}.`,
          workingSteps: [
            "Note that all forces acting on the uniform horizontal flap are purely vertical.",
            "Show via vertical force balance or moments about the outer edge that the hinge shares the weight equally with the outer lift force.",
          ],
        },
      ];
      return {
        id,
        conceptId: "vectors-equilibrium-moments",
        templateArchetype: "hinged-wall-sign-angled-wire",
        seed: seed + attempt * 997,
        syllabi: [...AC23_SYLLABI],
        format: "structured",
        difficulty: "foundation",
        domain: "mechanics",
        scenarioSpec: spec,
        hiddenQuantities: hidden,
        requiredGivens,
        questionPlan: plan,
        stem,
        parts,
        workedSolution: `(a) F = ½ m g = ${fmt4(liftF, "N")} ≈ ${fmt3(liftF, "N")}. (b) Since R + F = W and R = ${fmt4(hingeV, "N")}, ${flapConcept}.`,
        markScheme: [
          { code: "M1", partId: "a", criterion: "Applies principle of moments about O with CG at midpoint L/2.", marks: 1 },
          { code: "A1", partId: "a", criterion: `F = ${fmt3(liftF, "N")}.`, marks: 1 },
          { code: "B1", partId: "b", criterion: "States vertical equilibrium or moments about the outer edge.", marks: 1 },
          { code: "B1", partId: "b", criterion: "Concludes the uniform weight is shared equally so hinge reaction equals half the weight.", marks: 1 },
        ],
        totalMarks: 4,
        generatorModel,
      };
    }

    // Wall-hinged uniform rod + hanging sign + angled supporting wire
    const L = rng.step(1.4, 2.8, 0.2, 1);
    const mRod = rng.step(4.0, 12.0, 1.0, 1);
    const xCg = Number((L / 2).toFixed(2));
    const extraM = rng.step(3.0, 10.0, 0.5, 1);
    const extraX = Number((L - rng.step(0.2, 0.5, 0.1, 1)).toFixed(2));
    const thetaDeg = rng.step(26, 56, 2, 0);

    const spec: Record<string, unknown> = {
      kind: "hinged-rod-angled-wire",
      mode: "wall-rod-wire",
      rodLengthM: L,
      rodMassKg: mRod,
      cgFromHingeM: xCg,
      wireAttachFromHingeM: L,
      extraLoadMassKg: extraM,
      extraLoadFromHingeM: extraX,
      wireAngleToHorizontalDeg: thetaDeg,
      angleReference: "horizontal",
      gravityMs2: NCUK_GRAVITY_MS2,
    };
    const q = solvePlugin("hinged-rod-angled-wire", spec);
    const T = q.wireTensionN as number;
    const rh = q.hingeHorizontalN as number;
    const rv = q.hingeVerticalN as number;
    if (rv < 8) continue;

    const hidden = [
      "wireTensionN",
      "hingeHorizontalN",
      "hingeVerticalN",
      "hingeResultantN",
      "hingeAngleAboveHorizontalDeg",
    ];
    if (hasHiddenNumericCollision(q, hidden, collectSpecPublicNumbers(spec, hidden))) {
      continue;
    }

    const stem = `As shown in the diagram, ${context} is a uniform horizontal rod of length L = ${fmtGiven(L, 1)} m and mass ${fmtGiven(mRod, 1)} kg smoothly hinged to a vertical wall at O. A rectangular sign of mass ${fmtGiven(extraM, 1)} kg hangs so that its centre of gravity acts ${fmtGiven(extraX)} m from O. A taut support wire joins the outer end of the rod to the wall at an angle of ${fmtGiven(thetaDeg, 0)}° above the horizontal rod (take g = 9.81 m s⁻²).`;
    const requiredGivens: RequiredGivenSpec[] = [
      { name: "rodLengthM", value: L, unit: "m", source: "either" },
      { name: "rodMassKg", value: mRod, unit: "kg", source: "either" },
      { name: "extraLoadMassKg", value: extraM, unit: "kg", source: "either" },
      { name: "extraLoadFromHingeM", value: extraX, unit: "m", source: "stem" },
      { name: "wireAngleToHorizontalDeg", value: thetaDeg, unit: "°", source: "either" },
      { name: "gravityMs2", value: NCUK_GRAVITY_MS2, unit: "m s⁻²", source: "stem" },
    ];
    const plan: CandidateQuestionPlan = {
      targetSummary:
        "Resolve wire tension from moments about a wall hinge and calculate horizontal and vertical hinge reaction components.",
      distractorStrategy: [
        "Using cosine instead of sine for the vertical lifting component of wire tension.",
        "Omitting the self-weight moment of the uniform bracket rod.",
        "Confusing vertical tension component with total wire tension.",
      ],
    };

    if (format === "mcq") {
      const askRh = variant % 3 === 1;
      const askRv = variant % 3 === 2;
      const targetKey = askRh
        ? "hingeHorizontalN"
        : askRv
          ? "hingeVerticalN"
          : "wireTensionN";
      const targetVal = askRh ? rh : askRv ? rv : T;
      const qPrompt = askRh
        ? "What is the horizontal component of force exerted on the rod by hinge O?"
        : askRv
          ? "What is the vertical upward component of force exerted on the rod by hinge O?"
          : "What is the tension T in the angled support wire?";

      const rad = (thetaDeg * Math.PI) / 180;
      const tVert = q.wireVerticalComponentN as number;
      const distractors: NumericDistractor[] = askRh
        ? [
            { value: T, rationale: "Uses total wire tension instead of its horizontal component T cos θ." },
            { value: tVert, rationale: "Uses T sin θ instead of T cos θ for the horizontal hinge component." },
            { value: (q.totalWeightN as number) * Math.cos(rad), rationale: "Projects total weight by cos θ rather than resolving wire tension." },
          ]
        : askRv
          ? [
              { value: q.totalWeightN as number, rationale: "Forgets to subtract the upward vertical component of the wire tension." },
              { value: tVert, rationale: "Reports the wire's vertical component instead of the hinge's vertical component." },
              { value: mRod * NCUK_GRAVITY_MS2, rationale: "Assumes the hinge supports only the weight of the rod." },
            ]
          : [
              { value: tVert / Math.cos(rad), rationale: "Divides by cos θ instead of sin θ when finding wire tension." },
              { value: tVert, rationale: "Calculates only the vertical component T sin θ rather than full tension T." },
              { value: (extraM * NCUK_GRAVITY_MS2 * extraX) / (L * Math.sin(rad)), rationale: "Omits the clockwise moment caused by the rod's own weight." },
            ];

      return {
        id,
        conceptId: "vectors-equilibrium-moments",
        templateArchetype: "hinged-wall-sign-angled-wire",
        seed: seed + attempt * 997,
        syllabi: [...AC23_SYLLABI],
        format: "mcq",
        difficulty: difficultyForVariant(variant),
        domain: "mechanics",
        scenarioSpec: spec,
        hiddenQuantities: hidden,
        requiredGivens,
        questionPlan: plan,
        stem: `${stem} ${qPrompt}`,
        options: buildNumericMcqOptions(targetVal, "N", distractors, seed + attempt),
        targetQuantityKey: targetKey,
        workedSolution: `Taking moments about hinge O: T sin ${fmtGiven(thetaDeg, 0)}° × ${fmtGiven(L, 1)} = (${fmtGiven(mRod, 1)} × ${fmtGiven(xCg)} + ${fmtGiven(extraM, 1)} × ${fmtGiven(extraX)}) × 9.81 = ${fmt4(q.clockwiseMomentNm as number, "N m")}. Hence T sin ${fmtGiven(thetaDeg, 0)}° = ${fmt4(tVert, "N")} and T = ${fmt4(T, "N")} ≈ ${fmt3(T, "N")}. Horizontal balance: R_x = T cos ${fmtGiven(thetaDeg, 0)}° = ${fmt4(rh, "N")} ≈ ${fmt3(rh, "N")}. Vertical balance: R_y = (${fmtGiven(mRod, 1)} + ${fmtGiven(extraM, 1)}) × 9.81 − ${fmt4(tVert)} = ${fmt4(rv, "N")} ≈ ${fmt3(rv, "N")}.`,
        markScheme: [
          { code: "A1", criterion: `Correct verified value = ${fmt3(targetVal, "N")}.`, marks: 1 },
        ],
        totalMarks: 1,
        generatorModel,
      };
    }

    // 6m Structured with "Show clearly that" scaffold in part (a)!
    const approxT = fmtApprox2sf(T, "N");
    const parts: StructuredQuestionPart[] = [
      {
        partId: "a",
        prompt: `By taking moments about hinge O, show clearly that the tension T in the angled wire is approximately ${approxT}.`,
        marks: 2,
        targetQuantityKey: "wireTensionN",
        expectedAnswer: `${fmt4(T, "N")} (≈ ${fmt3(T, "N")})`,
        workingSteps: [
          `Clockwise moment about O = (${fmtGiven(mRod, 1)} × ${fmtGiven(xCg)} + ${fmtGiven(extraM, 1)} × ${fmtGiven(extraX)}) × 9.81 = ${fmt4(q.clockwiseMomentNm as number, "N m")}.`,
          `Anticlockwise moment = T sin ${fmtGiven(thetaDeg, 0)}° × ${fmtGiven(L, 1)}.`,
          `T = ${fmt4(T, "N")} ≈ ${fmt3(T, "N")}, which rounds to ${approxT}.`,
        ],
      },
      {
        partId: "b",
        prompt: "Calculate the horizontal component of the force exerted by hinge O on the rod.",
        marks: 2,
        dependsOnPartIds: ["a"],
        targetQuantityKey: "hingeHorizontalN",
        expectedAnswer: `${fmt3(rh, "N")}`,
        workingSteps: [
          `Horizontal equilibrium: R_x = T cos ${fmtGiven(thetaDeg, 0)}° = ${fmt4(T)} × cos ${fmtGiven(thetaDeg, 0)}° = ${fmt4(rh, "N")} ≈ ${fmt3(rh, "N")} away from the wall.`,
        ],
      },
      {
        partId: "c",
        prompt: "Calculate the vertical component of the force exerted by hinge O on the rod.",
        marks: 2,
        dependsOnPartIds: ["a"],
        targetQuantityKey: "hingeVerticalN",
        expectedAnswer: `${fmt3(rv, "N")}`,
        workingSteps: [
          `Total downward weight W = (${fmtGiven(mRod, 1)} + ${fmtGiven(extraM, 1)}) × 9.81 = ${fmt4(q.totalWeightN as number, "N")}.`,
          `Vertical equilibrium: R_y = W − T sin ${fmtGiven(thetaDeg, 0)}° = ${fmt4(rv, "N")} ≈ ${fmt3(rv, "N")} upwards.`,
        ],
      },
    ];
    const markScheme: MarkSchemePoint[] = [
      { code: "M1", partId: "a", criterion: "Writes full moment balance about hinge O including both rod and sign moments with T sin θ.", marks: 1 },
      { code: "A1", partId: "a", criterion: `Evaluates T = ${fmt4(T, "N")} (${fmt3(T, "N")}) showing agreement with ${approxT}.`, marks: 1 },
      { code: "M1", partId: "b", criterion: "Applies horizontal equilibrium R_x = T cos θ.", marks: 1 },
      { code: "A1", partId: "b", criterion: `R_x = ${fmt3(rh, "N")} away from the wall.`, marks: 1 },
      { code: "M1", partId: "c", criterion: "Applies vertical equilibrium R_y = W_total − T sin θ.", marks: 1 },
      { code: "A1", partId: "c", criterion: `R_y = ${fmt3(rv, "N")} upwards.`, marks: 1 },
    ];
    return {
      id,
      conceptId: "vectors-equilibrium-moments",
      templateArchetype: "hinged-wall-sign-angled-wire",
      seed: seed + attempt * 997,
      syllabi: [...AC23_SYLLABI],
      format: "structured",
      difficulty: difficultyForVariant(variant),
      domain: "mechanics",
      scenarioSpec: spec,
      hiddenQuantities: hidden,
      requiredGivens,
      questionPlan: plan,
      stem,
      parts,
      workedSolution: `(a) Moments about O give T = ${fmt4(T, "N")} ≈ ${fmt3(T, "N")}. (b) Horizontal balance: R_x = T cos θ = ${fmt4(rh, "N")} ≈ ${fmt3(rh, "N")}. (c) Vertical balance: R_y = W_total − T sin θ = ${fmt4(rv, "N")} ≈ ${fmt3(rv, "N")}.`,
      markScheme,
      totalMarks: 6,
      generatorModel,
    };
  }
  throw new Error(`Failed to sample hinged-wall-sign-angled-wire (${id})`);
}

/* ============================================================================
 * ARCHETYPE 5: nonuniform-trapdoor-hinge-resultant-long (ncuk-ac2-3, 14 items)
 * Includes 4 MCQs + 5 x 8m + 5 x 10m Flagship Statics Structured items!
 * ============================================================================ */

const TRAPDOOR_CONTEXTS = [
  "a heavy non-uniform loft trapdoor",
  "a cantilevered boat-deck access hatch",
  "a reinforced theatre stage drawbridge flap",
  "a warehouse loading-chute steel baffle plate",
  "a submarine-simulator bulkhead inspection hatch",
  "an industrial kiln hinged heat-shield door",
  "a bridge-tower maintenance access gate",
  "a cargo-bay tapered aluminium ramp leaf",
  "a hydro-station spillway hinged sluice flap",
  "a railway-depot signal-box inspection hatch",
  "a grain-silo weighted inspection trapdoor",
  "a workshop hinged steel tool-cabinet leaf",
  "an observatory dome shutter baffle panel",
  "a shipyard bulkhead tapered steel access door",
] as const;

function buildNonuniformTrapdoorLong(
  id: string,
  seed: number,
  variant: number,
  generatorModel: string,
): CandidateQuestionInput {
  const format: QuestionFormat = variant < 4 ? "mcq" : "structured";
  const isTenMark = variant >= 9;
  const context = TRAPDOOR_CONTEXTS[variant % TRAPDOOR_CONTEXTS.length];

  for (let attempt = 0; attempt < 40; attempt += 1) {
    const rng = createRng(seed + attempt * 997);
    const L = rng.step(1.2, 2.6, 0.2, 1);
    const mRod = rng.step(10.0, 32.0, 2.0, 1);
    const xCg = Number((L * rng.step(0.36, 0.46, 0.02, 2)).toFixed(2));
    const angleToVertDeg = rng.step(22, 44, 2, 0);
    const angleToHorizDeg = 90 - angleToVertDeg;

    const spec: Record<string, unknown> = {
      kind: "hinged-rod-angled-wire",
      mode: "wall-rod-wire",
      rodLengthM: L,
      rodMassKg: mRod,
      cgFromHingeM: xCg,
      wireAttachFromHingeM: L,
      wireAngleToHorizontalDeg: angleToHorizDeg,
      angleReference: "vertical",
      gravityMs2: NCUK_GRAVITY_MS2,
    };
    const q = solvePlugin("hinged-rod-angled-wire", spec);
    const T = q.wireTensionN as number;
    const rh = q.hingeHorizontalN as number;
    const rv = q.hingeVerticalN as number;
    const R = q.hingeResultantN as number;
    const alphaDeg = q.hingeAngleAboveHorizontalDeg as number;
    if (rv < 12 || alphaDeg < 15 || alphaDeg > 78) continue;

    const hidden = [
      "wireTensionN",
      "hingeHorizontalN",
      "hingeVerticalN",
      "hingeResultantN",
      "hingeAngleAboveHorizontalDeg",
      "hingeHorizontalExplanationConcept",
    ];
    const pubNums = [
      ...collectSpecPublicNumbers(spec, hidden),
      angleToVertDeg,
    ];
    if (hasHiddenNumericCollision(q, hidden, pubNums)) continue;

    const hingeExpl = String(q.hingeHorizontalExplanationConcept);
    const stem = `As shown in the figure, ${context} of length L = ${fmtGiven(L, 1)} m and mass ${fmtGiven(mRod, 1)} kg is smoothly hinged at O to a vertical wall and held horizontally in static equilibrium. Because of an internal reinforcing frame, its centre of gravity G lies ${fmtGiven(xCg)} m from hinge O. A single steel cable attached to the outer edge pulls upward and toward the wall at an angle of ${fmtGiven(angleToVertDeg, 0)}° to the vertical (take g = 9.81 m s⁻²).`;

    const requiredGivens: RequiredGivenSpec[] = [
      { name: "rodLengthM", value: L, unit: "m", source: "either" },
      { name: "rodMassKg", value: mRod, unit: "kg", source: "either" },
      { name: "cgFromHingeM", value: xCg, unit: "m", source: "either" },
      { name: "wireAngleToVerticalDeg", value: angleToVertDeg, unit: "°", source: "either" },
      { name: "gravityMs2", value: NCUK_GRAVITY_MS2, unit: "m s⁻²", source: "stem" },
    ];

    const plan: CandidateQuestionPlan = {
      targetSummary:
        "Analyse a non-uniform wall-hinged trapdoor held by an angled cable to determine cable tension, hinge force components, and full resultant hinge reaction vector.",
      distractorStrategy: [
        "Using sine instead of cosine for the vertical cable component when the angle is measured to the vertical.",
        "Placing the centre of gravity at the midpoint instead of the given non-uniform offset.",
        "Adding hinge components algebraically rather than combining them via Pythagoras.",
      ],
    };

    if (format === "mcq") {
      const askAngle = variant % 2 === 1;
      const targetKey = askAngle
        ? "hingeAngleAboveHorizontalDeg"
        : "hingeResultantN";
      const targetVal = askAngle ? alphaDeg : R;
      const unit = askAngle ? "°" : "N";
      const distractors: NumericDistractor[] = askAngle
        ? [
            { value: 90 - alphaDeg, rationale: "Calculates tan⁻¹(R_x / R_y), giving the angle to the vertical rather than above the horizontal." },
            { value: angleToVertDeg, rationale: "Assumes the hinge reaction acts parallel to the cable angle to the vertical." },
            { value: angleToHorizDeg, rationale: "Assumes the hinge force is symmetric with the cable inclination to the horizontal." },
          ]
        : [
            { value: rh + rv, rationale: "Sums the perpendicular hinge components linearly instead of using Pythagoras." },
            { value: rv, rationale: "Omits the horizontal hinge reaction component completely." },
            { value: T, rationale: "Assumes the resultant hinge reaction magnitude equals the cable tension." },
          ];

      return {
        id,
        conceptId: "vectors-equilibrium-moments",
        templateArchetype: "nonuniform-trapdoor-hinge-resultant-long",
        seed: seed + attempt * 997,
        syllabi: [...AC23_SYLLABI],
        format: "mcq",
        difficulty: "higher",
        domain: "mechanics",
        scenarioSpec: spec,
        hiddenQuantities: hidden,
        requiredGivens,
        questionPlan: plan,
        stem: `${stem} ${
          askAngle
            ? "At what angle above the horizontal does the resultant reaction force R from hinge O act on the door?"
            : "What is the magnitude of the resultant reaction force R exerted on the door by hinge O?"
        }`,
        options: buildNumericMcqOptions(targetVal, unit, distractors, seed + attempt),
        targetQuantityKey: targetKey,
        workedSolution: `Moments about O: T cos ${fmtGiven(angleToVertDeg, 0)}° × ${fmtGiven(L, 1)} = ${fmtGiven(mRod, 1)} × 9.81 × ${fmtGiven(xCg)} ⇒ T = ${fmt4(T, "N")}. Horizontal balance: R_x = T sin ${fmtGiven(angleToVertDeg, 0)}° = ${fmt4(rh, "N")}. Vertical balance: R_y = ${fmtGiven(mRod, 1)} × 9.81 − T cos ${fmtGiven(angleToVertDeg, 0)}° = ${fmt4(rv, "N")}. Resultant R = √(R_x² + R_y²) = ${fmt4(R, "N")} ≈ ${fmt3(R, "N")}, at angle α = tan⁻¹(R_y / R_x) = ${fmt4(alphaDeg, "°")} ≈ ${fmt3(alphaDeg, "°")} above the horizontal.`,
        markScheme: [
          { code: "A1", criterion: `Correct verified value = ${fmt3(targetVal, unit)}.`, marks: 1 },
        ],
        totalMarks: 1,
        generatorModel,
      };
    }

    const approxT = fmtApprox2sf(T, "N");
    if (!isTenMark) {
      // 8-mark deeper statics structured question!
      const parts: StructuredQuestionPart[] = [
        {
          partId: "a",
          prompt: `By taking moments about hinge O, show clearly that the tension T in the cable is approximately ${approxT}.`,
          marks: 2,
          targetQuantityKey: "wireTensionN",
          expectedAnswer: `${fmt4(T, "N")} (≈ ${fmt3(T, "N")})`,
          workingSteps: [
            `Vertical component of cable tension is T cos ${fmtGiven(angleToVertDeg, 0)}°.`,
            `Equate moments about O: T cos ${fmtGiven(angleToVertDeg, 0)}° × ${fmtGiven(L, 1)} = ${fmtGiven(mRod, 1)} × 9.81 × ${fmtGiven(xCg)}.`,
            `T = ${fmt4(T, "N")} ≈ ${fmt3(T, "N")}, confirming ${approxT}.`,
          ],
        },
        {
          partId: "b",
          prompt:
            "Explain why hinge O must exert a horizontal component of force on the door, and state its direction.",
          marks: 2,
          targetMode: "qualitative",
          targetQuantityKey: "hingeHorizontalExplanationConcept",
          expectedAnswer: `For horizontal equilibrium, ${hingeExpl}.`,
          workingSteps: [
            "Identify that the inclined cable pulls horizontally toward the wall.",
            "Conclude from zero horizontal resultant force that the hinge must push horizontally away from the wall.",
          ],
        },
        {
          partId: "c-i",
          prompt:
            "Calculate the magnitude of the resultant reaction force R exerted by hinge O on the door.",
          marks: 2,
          dependsOnPartIds: ["a"],
          targetQuantityKey: "hingeResultantN",
          expectedAnswer: `${fmt3(R, "N")}`,
          workingSteps: [
            `R_x = T sin ${fmtGiven(angleToVertDeg, 0)}° = ${fmt4(rh, "N")}; R_y = m g − T cos ${fmtGiven(angleToVertDeg, 0)}° = ${fmt4(rv, "N")}.`,
            `R = √(${fmt4(rh)}² + ${fmt4(rv)}²) = ${fmt4(R, "N")} ≈ ${fmt3(R, "N")}.`,
          ],
        },
        {
          partId: "c-ii",
          prompt:
            "Determine the angle above the horizontal at which this resultant hinge force R acts.",
          marks: 2,
          dependsOnPartIds: ["c-i"],
          targetQuantityKey: "hingeAngleAboveHorizontalDeg",
          expectedAnswer: `${fmt3(alphaDeg, "°")}`,
          workingSteps: [
            `tan α = R_y / R_x = ${fmt4(rv)} / ${fmt4(rh)}.`,
            `α = tan⁻¹(${fmt4(rv / rh)}) = ${fmt4(alphaDeg, "°")} ≈ ${fmt3(alphaDeg, "°")} above the horizontal.`,
          ],
        },
      ];
      const markScheme: MarkSchemePoint[] = [
        { code: "M1", partId: "a", criterion: "Applies Στ = 0 about O using T cos(angle to vertical) × L = m g x_G.", marks: 1 },
        { code: "A1", partId: "a", criterion: `Obtains T = ${fmt4(T, "N")} (${fmt3(T, "N")}) matching ${approxT}.`, marks: 1 },
        { code: "B1", partId: "b", criterion: "Identifies horizontal component of angled cable tension directed toward the wall.", marks: 1 },
        { code: "B1", partId: "b", criterion: "States hinge must exert an equal opposite horizontal force away from the wall for ΣF_x = 0.", marks: 1 },
        { code: "M1", partId: "c-i", criterion: `Computes R_x = ${fmt4(rh, "N")} and R_y = ${fmt4(rv, "N")} and applies Pythagoras.`, marks: 1 },
        { code: "A1", partId: "c-i", criterion: `Resultant hinge reaction magnitude R = ${fmt3(R, "N")}.`, marks: 1 },
        { code: "M1", partId: "c-ii", criterion: "Uses tan α = R_y / R_x with both hinge components.", marks: 1 },
        { code: "A1", partId: "c-ii", criterion: `Direction α = ${fmt3(alphaDeg, "°")} above the horizontal.`, marks: 1 },
      ];
      return {
        id,
        conceptId: "vectors-equilibrium-moments",
        templateArchetype: "nonuniform-trapdoor-hinge-resultant-long",
        seed: seed + attempt * 997,
        syllabi: [...AC23_SYLLABI],
        format: "structured",
        difficulty: "higher",
        domain: "mechanics",
        scenarioSpec: spec,
        hiddenQuantities: hidden,
        requiredGivens,
        questionPlan: plan,
        stem,
        parts,
        workedSolution: `(a) T = ${fmt4(T, "N")} ≈ ${fmt3(T, "N")}. (b) ${hingeExpl}. (c)(i) R_x = ${fmt4(rh, "N")}, R_y = ${fmt4(rv, "N")}, so R = ${fmt4(R, "N")} ≈ ${fmt3(R, "N")}. (c)(ii) α = tan⁻¹(R_y / R_x) = ${fmt4(alphaDeg, "°")} ≈ ${fmt3(alphaDeg, "°")} above the horizontal.`,
        markScheme,
        totalMarks: 8,
        generatorModel,
      };
    }

    // 10-mark NCUK flagship statics structured item!
    const parts: StructuredQuestionPart[] = [
      {
        partId: "a",
        prompt:
          "Explain why hinge O must exert a horizontal component of force on the door, and state its direction.",
        marks: 2,
        targetMode: "qualitative",
        targetQuantityKey: "hingeHorizontalExplanationConcept",
        expectedAnswer: `For translational equilibrium, ${hingeExpl}.`,
        workingSteps: [
          "State that the angled cable exerts an inward horizontal pull toward the wall.",
          "Deduce that the hinge must supply an equal outward horizontal reaction away from the wall.",
        ],
      },
      {
        partId: "b",
        prompt: `By taking moments about hinge O, show clearly that the tension T in the steel cable is approximately ${approxT}.`,
        marks: 2,
        targetQuantityKey: "wireTensionN",
        expectedAnswer: `${fmt4(T, "N")} (≈ ${fmt3(T, "N")})`,
        workingSteps: [
          `Clockwise weight moment about O = ${fmtGiven(mRod, 1)} × 9.81 × ${fmtGiven(xCg)} = ${fmt4(q.clockwiseMomentNm as number, "N m")}.`,
          `Anticlockwise moment = T cos ${fmtGiven(angleToVertDeg, 0)}° × ${fmtGiven(L, 1)}.`,
          `T = ${fmt4(T, "N")} ≈ ${fmt3(T, "N")}, confirming ${approxT}.`,
        ],
      },
      {
        partId: "c-i",
        prompt: "Calculate the horizontal component R_x of the force exerted by hinge O.",
        marks: 1,
        dependsOnPartIds: ["b"],
        targetQuantityKey: "hingeHorizontalN",
        expectedAnswer: `${fmt3(rh, "N")}`,
        workingSteps: [
          `R_x = T sin ${fmtGiven(angleToVertDeg, 0)}° = ${fmt4(T)} × sin ${fmtGiven(angleToVertDeg, 0)}° = ${fmt4(rh, "N")} ≈ ${fmt3(rh, "N")}.`,
        ],
      },
      {
        partId: "c-ii",
        prompt: "Calculate the vertical component R_y of the force exerted by hinge O.",
        marks: 1,
        dependsOnPartIds: ["b"],
        targetQuantityKey: "hingeVerticalN",
        expectedAnswer: `${fmt3(rv, "N")}`,
        workingSteps: [
          `R_y = ${fmtGiven(mRod, 1)} × 9.81 − T cos ${fmtGiven(angleToVertDeg, 0)}° = ${fmt4(rv, "N")} ≈ ${fmt3(rv, "N")}.`,
        ],
      },
      {
        partId: "c-iii",
        prompt: "Hence calculate the magnitude of the total resultant hinge force R.",
        marks: 2,
        dependsOnPartIds: ["c-i", "c-ii"],
        targetQuantityKey: "hingeResultantN",
        expectedAnswer: `${fmt3(R, "N")}`,
        workingSteps: [
          `R = √(R_x² + R_y²) = √(${fmt4(rh)}² + ${fmt4(rv)}²) = ${fmt4(R, "N")} ≈ ${fmt3(R, "N")}.`,
        ],
      },
      {
        partId: "c-iv",
        prompt: "Determine the angle α above the horizontal at which the resultant hinge force R acts.",
        marks: 2,
        dependsOnPartIds: ["c-i", "c-ii"],
        targetQuantityKey: "hingeAngleAboveHorizontalDeg",
        expectedAnswer: `${fmt3(alphaDeg, "°")}`,
        workingSteps: [
          `α = tan⁻¹(R_y / R_x) = tan⁻¹(${fmt4(rv)} / ${fmt4(rh)}) = ${fmt4(alphaDeg, "°")} ≈ ${fmt3(alphaDeg, "°")}.`,
        ],
      },
    ];
    const markScheme: MarkSchemePoint[] = [
      { code: "B1", partId: "a", criterion: "Notes inward horizontal component of cable tension.", marks: 1 },
      { code: "B1", partId: "a", criterion: "States equal opposite outward hinge reaction away from wall.", marks: 1 },
      { code: "M1", partId: "b", criterion: "Equates cable moment T cos(angle to vertical) × L with weight moment m g x_G.", marks: 1 },
      { code: "A1", partId: "b", criterion: `T = ${fmt4(T, "N")} (${fmt3(T, "N")}) clearly matching ${approxT}.`, marks: 1 },
      { code: "A1", partId: "c-i", criterion: `R_x = ${fmt3(rh, "N")}.`, marks: 1 },
      { code: "A1", partId: "c-ii", criterion: `R_y = ${fmt3(rv, "N")}.`, marks: 1 },
      { code: "M1", partId: "c-iii", criterion: "Combines perpendicular components via R = √(R_x² + R_y²).", marks: 1 },
      { code: "A1", partId: "c-iii", criterion: `R = ${fmt3(R, "N")}.`, marks: 1 },
      { code: "M1", partId: "c-iv", criterion: "Applies tan α = R_y / R_x.", marks: 1 },
      { code: "A1", partId: "c-iv", criterion: `α = ${fmt3(alphaDeg, "°")} above the horizontal.`, marks: 1 },
    ];
    return {
      id,
      conceptId: "vectors-equilibrium-moments",
      templateArchetype: "nonuniform-trapdoor-hinge-resultant-long",
      seed: seed + attempt * 997,
      syllabi: [...AC23_SYLLABI],
      format: "structured",
      difficulty: "higher",
      domain: "mechanics",
      scenarioSpec: spec,
      hiddenQuantities: hidden,
      requiredGivens,
      questionPlan: plan,
      stem,
      parts,
      workedSolution: `(a) ${hingeExpl}. (b) Moments about O give T = ${fmt4(T, "N")} ≈ ${fmt3(T, "N")}. (c)(i) R_x = ${fmt4(rh, "N")} ≈ ${fmt3(rh, "N")}. (c)(ii) R_y = ${fmt4(rv, "N")} ≈ ${fmt3(rv, "N")}. (c)(iii) R = ${fmt4(R, "N")} ≈ ${fmt3(R, "N")}. (c)(iv) α = ${fmt4(alphaDeg, "°")} ≈ ${fmt3(alphaDeg, "°")} above horizontal.`,
      markScheme,
      totalMarks: 10,
      generatorModel,
    };
  }
  throw new Error(`Failed to sample nonuniform-trapdoor-hinge-resultant-long (${id})`);
}

/* ============================================================================
 * ARCHETYPE 6: two-wire-asymmetric-suspended-bar (ncuk-ac2-3, 14 items)
 * ============================================================================ */

const SUSPENDED_BAR_CONTEXTS = [
  "a gallery acoustic baffle beam",
  "a theatre stage scenery fly-bar",
  "an airport departure-board support girder",
  "a museum fossil-exhibit suspension bar",
  "a workshop overhead lighting conduit bar",
  "a gymnasium scoreboard suspension beam",
  "a laboratory non-uniform brass display rod",
  "a shopping-arcade hanging directional sign bar",
  "a library mezzanine chandelier mounting bar",
  "a broadcast-studio microphone gantry beam",
  "a train-concourse timetable carrier bar",
  "a greenhouse irrigation-manifold support bar",
  "a concert-hall microphone-array boom",
  "a marine-exhibit model-ship cradle beam",
] as const;

function buildTwoWireSuspendedBar(
  id: string,
  seed: number,
  variant: number,
  generatorModel: string,
): CandidateQuestionInput {
  const format: QuestionFormat = variant < 8 ? "mcq" : "structured";
  const isQualMcq = variant === 6 || variant === 7;
  const angled = variant % 3 === 2 && !isQualMcq;
  const context = SUSPENDED_BAR_CONTEXTS[variant % SUSPENDED_BAR_CONTEXTS.length];

  for (let attempt = 0; attempt < 40; attempt += 1) {
    const rng = createRng(seed + attempt * 997);
    const L = rng.step(2.2, 4.4, 0.2, 1);
    const mBar = rng.step(8.0, 34.0, 2.0, 1);
    const xA = rng.step(0.2, 0.5, 0.1, 1);
    const xB = Number((L - rng.step(0.2, 0.5, 0.1, 1)).toFixed(2));
    const span = Number((xB - xA).toFixed(2));
    const cgFrac = variant % 2 === 0 ? rng.step(0.28, 0.4, 0.02, 2) : rng.step(0.6, 0.72, 0.02, 2);
    const xCg = Number((xA + span * cgFrac).toFixed(2));
    const angleADeg = rng.step(42, 66, 2, 0);

    const spec: Record<string, unknown> = {
      kind: "two-wire-suspended-bar",
      mode: angled ? "angled-wires" : "vertical-wires",
      barLengthM: L,
      barMassKg: mBar,
      cgFromLeftM: xCg,
      wireAFromLeftM: xA,
      wireBFromLeftM: xB,
      ...(angled ? { angleADeg } : {}),
      gravityMs2: NCUK_GRAVITY_MS2,
    };
    const q = solvePlugin("two-wire-suspended-bar", spec);
    const tA = q.tensionAN as number;
    const tB = q.tensionBN as number;
    const angleBDeg = q.angleBDeg as number;
    const higherWireConcept = String(q.higherTensionWireConcept);

    const hidden = isQualMcq
      ? ["higherTensionWireConcept", "tensionAN", "tensionBN"]
      : angled
        ? ["tensionAN", "tensionBN", "angleBDeg", "higherTensionWireConcept"]
        : ["tensionAN", "tensionBN", "higherTensionWireConcept"];
    const pubNums = [
      ...collectSpecPublicNumbers(spec, hidden),
      span,
      Number((xCg - xA).toFixed(2)),
      Number((xB - xCg).toFixed(2)),
    ];
    if (hasHiddenNumericCollision(q, hidden, pubNums)) continue;

    const dA = Number((xCg - xA).toFixed(2));
    const dB = Number((xB - xCg).toFixed(2));
    const wireDesc = angled
      ? `two light ceiling wires attached at A and B (${fmtGiven(span)} m apart), with wire A inclined at ${fmtGiven(angleADeg, 0)}° above the horizontal bar`
      : `two light vertical ceiling wires attached at A and B, separated by ${fmtGiven(span)} m`;

    const stem = `As shown in the diagram, ${context} of total length L = ${fmtGiven(L, 1)} m and mass ${fmtGiven(mBar, 1)} kg hangs horizontally in equilibrium from ${wireDesc}. Its centre of gravity G lies ${fmtGiven(dA)} m to the right of attachment A and ${fmtGiven(dB)} m to the left of attachment B (take g = 9.81 m s⁻²).`;

    const requiredGivens: RequiredGivenSpec[] = [
      { name: "barLengthM", value: L, unit: "m", source: "either" },
      { name: "barMassKg", value: mBar, unit: "kg", source: "either" },
      { name: "wireSpanM", value: span, unit: "m", source: "either" },
      { name: "cgFromAM", value: dA, unit: "m", source: "stem" },
      { name: "cgFromBM", value: dB, unit: "m", source: "stem" },
      ...(angled
        ? [{ name: "angleADeg", value: angleADeg, unit: "°", source: "either" as const }]
        : []),
      { name: "gravityMs2", value: NCUK_GRAVITY_MS2, unit: "m s⁻²", source: "stem" },
    ];

    const plan: CandidateQuestionPlan = {
      targetSummary:
        "Use moments about wire attachments and force balance to compare and compute tensions in two supporting ceiling wires.",
      distractorStrategy: [
        "Swapping the two lever-arm distances so the closer wire receives the smaller tension.",
        "Splitting the bar weight equally between the two wires despite an off-centre centre of gravity.",
        "Forgetting to divide by sin θ when solving for the full tension of an angled wire.",
      ],
    };

    if (isQualMcq) {
      const aCloser = dA < dB;
      const correctText = `In horizontal equilibrium, ${higherWireConcept}.`;
      const qualDistractors = [
        {
          text: aCloser
            ? "Wire B carries the greater tension because the centre of gravity is farther from wire B."
            : "Wire A carries the greater tension because the centre of gravity is farther from wire A.",
          rationale: "Reverses the inverse lever-arm relation; the support closer to G bears the larger share of weight.",
        },
        {
          text: "Both wires carry identical tension because the bar hangs completely horizontal.",
          rationale: "Horizontal equilibrium requires zero net moment, which forces unequal tensions when G is off-centre.",
        },
        {
          text: "Neither wire tension depends on the horizontal location of the centre of gravity.",
          rationale: "Moment balance directly couples the tension ratio to the distances of G from each wire.",
        },
      ];
      return {
        id,
        conceptId: "vectors-equilibrium-moments",
        templateArchetype: "two-wire-asymmetric-suspended-bar",
        seed: seed + attempt * 997,
        syllabi: [...AC23_SYLLABI],
        format: "mcq",
        difficulty: "foundation",
        domain: "mechanics",
        scenarioSpec: spec,
        hiddenQuantities: hidden,
        requiredGivens,
        questionPlan: plan,
        stem: `${stem} Without carrying out a full calculation, which statement correctly compares the tensions in the two wires?`,
        targetMode: "qualitative",
        targetQuantityKey: "higherTensionWireConcept",
        options: buildQualitativeMcqOptions(correctText, qualDistractors, seed + attempt),
        workedSolution: `Taking moments about the centre of gravity G gives T₁ d_A = T₂ d_B, so the wire with the smaller distance to G carries the larger tension: ${higherWireConcept}.`,
        markScheme: [
          { code: "B1", criterion: `Correctly concludes that ${higherWireConcept}.`, marks: 1 },
        ],
        totalMarks: 1,
        generatorModel,
      };
    }

    if (format === "mcq") {
      const askB = variant % 2 === 1;
      const targetKey = askB ? "tensionBN" : "tensionAN";
      const targetVal = askB ? tB : tA;
      const distractors: NumericDistractor[] = angled
        ? [
            { value: q.tensionAVerticalN as number, rationale: "Stops at the vertical component T sin θ instead of dividing by sin θ." },
            { value: askB ? tA : tB, rationale: "Solves for the tension in the opposite wire." },
            { value: (mBar * NCUK_GRAVITY_MS2) / 2, rationale: "Assumes equal vertical load sharing without taking moments." },
          ]
        : [
            { value: askB ? tA : tB, rationale: "Swaps lever arms and calculates the tension in the opposite wire." },
            { value: (mBar * NCUK_GRAVITY_MS2) / 2, rationale: "Assumes each wire carries half the weight despite the off-centre CG." },
            { value: (mBar * NCUK_GRAVITY_MS2 * (askB ? dA : dB)) / L, rationale: "Divides by total bar length L instead of the inter-wire span AB." },
          ];
      return {
        id,
        conceptId: "vectors-equilibrium-moments",
        templateArchetype: "two-wire-asymmetric-suspended-bar",
        seed: seed + attempt * 997,
        syllabi: [...AC23_SYLLABI],
        format: "mcq",
        difficulty: difficultyForVariant(variant),
        domain: "mechanics",
        scenarioSpec: spec,
        hiddenQuantities: hidden,
        requiredGivens,
        questionPlan: plan,
        stem: `${stem} What is the tension in wire ${askB ? "B (T₂)" : "A (T₁)"}?`,
        options: buildNumericMcqOptions(targetVal, "N", distractors, seed + attempt),
        targetQuantityKey: targetKey,
        workedSolution: `Taking moments about B: T₁_y × ${fmtGiven(span)} = ${fmtGiven(mBar, 1)} × 9.81 × ${fmtGiven(dB)} ⇒ T₁_y = ${fmt4(q.tensionAVerticalN as number, "N")}, T₂_y = ${fmt4(q.tensionBVerticalN as number, "N")}. ${
          angled
            ? `With wire A at ${fmtGiven(angleADeg, 0)}°, T₁ = T₁_y / sin ${fmtGiven(angleADeg, 0)}° = ${fmt4(tA, "N")} ≈ ${fmt3(tA, "N")}, horizontal component H = T₁ cos ${fmtGiven(angleADeg, 0)}° = ${fmt4(q.horizontalComponentN as number, "N")}, and T₂ = √(H² + T₂_y²) = ${fmt4(tB, "N")} ≈ ${fmt3(tB, "N")}.`
            : `For vertical wires, T₁ = ${fmt4(tA, "N")} ≈ ${fmt3(tA, "N")} and T₂ = ${fmt4(tB, "N")} ≈ ${fmt3(tB, "N")}.`
        }`,
        markScheme: [
          { code: "A1", criterion: `Correct wire tension = ${fmt3(targetVal, "N")}.`, marks: 1 },
        ],
        totalMarks: 1,
        generatorModel,
      };
    }

    // 6m Structured
    const parts: StructuredQuestionPart[] = [
      {
        partId: "a",
        prompt: "By taking moments about attachment B, calculate the tension T₁ in wire A.",
        marks: 2,
        targetQuantityKey: "tensionAN",
        expectedAnswer: `${fmt3(tA, "N")}`,
        workingSteps: [
          `T₁_y × ${fmtGiven(span)} = ${fmtGiven(mBar, 1)} × 9.81 × ${fmtGiven(dB)} ⇒ T₁_y = ${fmt4(q.tensionAVerticalN as number, "N")}.`,
          angled
            ? `T₁ = ${fmt4(q.tensionAVerticalN as number)} / sin ${fmtGiven(angleADeg, 0)}° = ${fmt4(tA, "N")} ≈ ${fmt3(tA, "N")}.`
            : `Since wire A is vertical, T₁ = ${fmt4(tA, "N")} ≈ ${fmt3(tA, "N")}.`,
        ],
      },
      {
        partId: "b",
        prompt: angled
          ? "Using horizontal and vertical force equilibrium, determine the tension T₂ in wire B."
          : "Using vertical force equilibrium, determine the tension T₂ in wire B.",
        marks: 2,
        dependsOnPartIds: ["a"],
        targetQuantityKey: "tensionBN",
        expectedAnswer: `${fmt3(tB, "N")}`,
        workingSteps: [
          `Vertical balance: T₂_y = ${fmtGiven(mBar, 1)} × 9.81 − ${fmt4(q.tensionAVerticalN as number)} = ${fmt4(q.tensionBVerticalN as number, "N")}.`,
          angled
            ? `Horizontal balance: T₂_x = T₁ cos ${fmtGiven(angleADeg, 0)}° = ${fmt4(q.horizontalComponentN as number, "N")}; T₂ = √(T₂_x² + T₂_y²) = ${fmt4(tB, "N")} ≈ ${fmt3(tB, "N")}.`
            : `T₂ = ${fmt4(tB, "N")} ≈ ${fmt3(tB, "N")}.`,
        ],
      },
      {
        partId: "c",
        prompt: "State which wire carries the greater tension and justify your answer qualitatively in terms of moments about the centre of gravity.",
        marks: 2,
        targetMode: "qualitative",
        targetQuantityKey: "higherTensionWireConcept",
        expectedAnswer: `In equilibrium, ${higherWireConcept}.`,
        workingSteps: [
          "Take moments about the centre of gravity so the weight has zero moment.",
          "Show that the wire with the shorter perpendicular distance to G must exert the larger tension to balance moments.",
        ],
      },
    ];
    const markScheme: MarkSchemePoint[] = [
      { code: "M1", partId: "a", criterion: "Applies moment balance about attachment B.", marks: 1 },
      { code: "A1", partId: "a", criterion: `T₁ = ${fmt3(tA, "N")}.`, marks: 1 },
      { code: "M1", partId: "b", criterion: angled ? "Combines vertical and horizontal equilibrium components for wire B." : "Applies ΣF_y = 0 to obtain T₂.", marks: 1 },
      { code: "A1", partId: "b", criterion: `T₂ = ${fmt3(tB, "N")}${angled ? ` (at ${fmt3(angleBDeg, "°")})` : ""}.`, marks: 1 },
      { code: "B1", partId: "c", criterion: "Identifies the wire closer to G as carrying greater tension.", marks: 1 },
      { code: "B1", partId: "c", criterion: "Justifies using equal opposite moments about G with shorter lever arm.", marks: 1 },
    ];
    return {
      id,
      conceptId: "vectors-equilibrium-moments",
      templateArchetype: "two-wire-asymmetric-suspended-bar",
      seed: seed + attempt * 997,
      syllabi: [...AC23_SYLLABI],
      format: "structured",
      difficulty: difficultyForVariant(variant),
      domain: "mechanics",
      scenarioSpec: spec,
      hiddenQuantities: hidden,
      requiredGivens,
      questionPlan: plan,
      stem,
      parts,
      workedSolution: `(a) Moments about B yield T₁ = ${fmt4(tA, "N")} ≈ ${fmt3(tA, "N")}. (b) Force balance gives T₂ = ${fmt4(tB, "N")} ≈ ${fmt3(tB, "N")}. (c) ${higherWireConcept}.`,
      markScheme,
      totalMarks: 6,
      generatorModel,
    };
  }
  throw new Error(`Failed to sample two-wire-asymmetric-suspended-bar (${id})`);
}

/* ============================================================================
 * ARCHETYPE 7: couples-torque-and-equilibrium-rules (ncuk-ac2-3, 14 items)
 * ============================================================================ */

const COUPLE_CONTEXTS = [
  "a marine rudder control wheel bar",
  "a laboratory torsion-head brass lever",
  "a water-main gate-valve handwheel spar",
  "a workshop tap-wrench turning bar",
  "a submarine hatch locking handbar",
  "a printing-press tensioning crossbar",
  "a railway track-switch rotary lever",
  "a telescope equatorial-mount clamping bar",
  "a hydraulic-press release T-bar",
  "a shipyard capstan windlass spar",
  "an aircraft trim-wheel control bar",
  "a heavy-duty pipe-threading die stock",
  "a surveying-theodolite tangent lever",
  "a wind-tunnel pitch-adjuster crossbar",
] as const;

function buildCouplesAndEquilibrium(
  id: string,
  seed: number,
  variant: number,
  generatorModel: string,
): CandidateQuestionInput {
  const format: QuestionFormat = variant < 8 ? "mcq" : "structured";
  const isQualMcq = variant >= 4 && variant < 8;
  const isPureQualStruct = variant >= 8 && variant < 11;
  const context = COUPLE_CONTEXTS[variant % COUPLE_CONTEXTS.length];

  for (let attempt = 0; attempt < 40; attempt += 1) {
    const rng = createRng(seed + attempt * 997);
    const F = rng.step(18, 160, 4, 0);
    const d = rng.step(0.24, 0.78, 0.04, 2);
    const tilted = variant % 2 === 1 && !isQualMcq && !isPureQualStruct;
    const ang = tilted ? rng.step(35, 70, 5, 0) : 90;

    const spec: Record<string, unknown> = {
      kind: "two-wire-suspended-bar",
      mode: "couple-torque",
      coupleForceN: F,
      coupleSeparationM: d,
      forceAngleDeg: ang,
    };
    const q = solvePlugin("two-wire-suspended-bar", spec);
    const tau = q.coupleTorqueNm as number;
    const coupleDef = String(q.coupleDefinitionConcept);
    const coupleEq = String(q.coupleEquilibriumConcept);
    const eqCond = String(q.equilibriumConditionsConcept);

    const hidden = isQualMcq || isPureQualStruct
      ? [
          "coupleTorqueNm",
          "coupleDefinitionConcept",
          "coupleEquilibriumConcept",
          "equilibriumConditionsConcept",
        ]
      : tilted
        ? ["coupleTorqueNm", "perpendicularSeparationM"]
        : ["coupleTorqueNm"];
    if (hasHiddenNumericCollision(q, hidden, collectSpecPublicNumbers(spec, hidden))) {
      continue;
    }

    const anglePhrase = tilted
      ? `each inclined at ${fmtGiven(ang, 0)}° to the bar`
      : "acting perpendicularly to the bar";
    const stem = `Two equal and opposite parallel forces, each of magnitude F = ${fmtGiven(F, 0)} N, are applied to the ends of ${context} of length d = ${fmtGiven(d)} m, ${anglePhrase}, as illustrated in the diagram.`;

    const requiredGivens: RequiredGivenSpec[] = [
      { name: "coupleForceN", value: F, unit: "N", source: "either" },
      { name: "coupleSeparationM", value: d, unit: "m", source: "either" },
      ...(tilted
        ? [{ name: "forceAngleDeg", value: ang, unit: "°", source: "either" as const }]
        : []),
    ];

    const plan: CandidateQuestionPlan = {
      targetSummary:
        "Define a torque couple, state the conditions for static equilibrium of a rigid body, and compute couple torque using perpendicular separation.",
      distractorStrategy: [
        "Multiplying by two because there are two forces instead of using one force times full separation.",
        "Using half the separation instead of the full distance between the two lines of action.",
        "Using cosine instead of sine when the couple forces act at an oblique angle.",
      ],
    };

    if (isQualMcq) {
      const pickKind = variant % 3;
      const targetKey =
        pickKind === 0
          ? "coupleDefinitionConcept"
          : pickKind === 1
            ? "coupleEquilibriumConcept"
            : "equilibriumConditionsConcept";
      const correctText =
        pickKind === 0
          ? `A couple consists of ${coupleDef}.`
          : pickKind === 1
            ? `A rigid body acted on only by this couple experiences ${coupleEq}.`
            : `For any rigid body to remain in static equilibrium it must have ${eqCond}.`;
      const qualDistractors =
        pickKind === 0
          ? [
              {
                text: "Two equal forces acting in the same direction along parallel lines of action.",
                rationale: "Parallel forces in the same direction produce a non-zero resultant force rather than a pure couple.",
              },
              {
                text: "Two equal and opposite forces acting along the exact same line of action.",
                rationale: "Collinear opposite forces produce zero torque and cancel out completely.",
              },
              {
                text: "Two perpendicular forces meeting at the central pivot of the rigid bar.",
                rationale: "Forces passing through the pivot exert zero turning moment about that pivot.",
              },
            ]
          : pickKind === 1
            ? [
                {
                  text: "A non-zero resultant force causing linear acceleration but zero turning moment.",
                  rationale: "Equal opposite forces cancel translationally while combining rotationally.",
                },
                {
                  text: "Both zero resultant force and zero resultant torque so the bar remains stationary.",
                  rationale: "Because the lines of action are separated, their moments add rather than cancel.",
                },
                {
                  text: "Both a non-zero resultant force and a non-zero resultant torque simultaneously.",
                  rationale: "The vector sum of two equal and opposite forces is identically zero.",
                },
              ]
            : [
                {
                  text: "Zero resultant force alone regardless of whether opposing moments balance.",
                  rationale: "A body can have zero net force yet accelerate rotationally under a couple.",
                },
                {
                  text: "Zero resultant moment about the centre of gravity while carrying a net upward force.",
                  rationale: "A non-zero resultant force produces linear acceleration so equilibrium is violated.",
                },
                {
                  text: "Equal clockwise and anticlockwise forces acting only at the midpoint of the body.",
                  rationale: "Equilibrium requires vector force balance and moment balance about any point.",
                },
              ];

      return {
        id,
        conceptId: "vectors-equilibrium-moments",
        templateArchetype: "couples-torque-and-equilibrium-rules",
        seed: seed + attempt * 997,
        syllabi: [...AC23_SYLLABI],
        format: "mcq",
        difficulty: "foundation",
        domain: "mechanics",
        scenarioSpec: spec,
        hiddenQuantities: hidden,
        requiredGivens,
        questionPlan: plan,
        stem: `${stem} ${
          pickKind === 0
            ? "Which statement accurately defines a couple in mechanics?"
            : pickKind === 1
              ? "What is the combined mechanical effect of this couple acting alone on the free bar?"
              : "Which pair of conditions must both hold for a rigid body to remain in complete static equilibrium?"
        }`,
        targetMode: "qualitative",
        targetQuantityKey: targetKey,
        options: buildQualitativeMcqOptions(correctText, qualDistractors, seed + attempt),
        workedSolution: correctText,
        markScheme: [{ code: "B1", criterion: correctText, marks: 1 }],
        totalMarks: 1,
        generatorModel,
      };
    }

    if (format === "mcq") {
      const distractors: NumericDistractor[] = tilted
        ? [
            { value: F * d, rationale: "Uses the length d directly without multiplying by sin θ for perpendicular separation." },
            { value: F * d * Math.cos((ang * Math.PI) / 180), rationale: "Resolves with cos θ instead of sin θ." },
            { value: 2 * tau, rationale: "Doubles the torque by counting both forces across the full separation d." },
          ]
        : [
            { value: 2 * F * d, rationale: "Erroneously doubles F × d instead of multiplying one force by full separation d." },
            { value: 0.5 * F * d, rationale: "Computes the moment of only one force about pivot O and forgets the second force." },
            { value: F / d, rationale: "Divides force by distance instead of multiplying." },
          ];
      return {
        id,
        conceptId: "vectors-equilibrium-moments",
        templateArchetype: "couples-torque-and-equilibrium-rules",
        seed: seed + attempt * 997,
        syllabi: [...AC23_SYLLABI],
        format: "mcq",
        difficulty: difficultyForVariant(variant),
        domain: "mechanics",
        scenarioSpec: spec,
        hiddenQuantities: hidden,
        requiredGivens,
        questionPlan: plan,
        stem: `${stem} What is the magnitude of the torque of this couple?`,
        options: buildNumericMcqOptions(tau, "N m", distractors, seed + attempt),
        targetQuantityKey: "coupleTorqueNm",
        workedSolution: tilted
          ? `Perpendicular separation between the parallel lines of action is d_perp = d sin ${fmtGiven(ang, 0)}° = ${fmt4(q.perpendicularSeparationM as number, "m")}. Torque of the couple: T = F d_perp = ${fmtGiven(F, 0)} × ${fmt4(q.perpendicularSeparationM as number)} = ${fmt4(tau, "N m")} ≈ ${fmt3(tau, "N m")}.`
          : `Torque of a couple = F × perpendicular separation = ${fmtGiven(F, 0)} × ${fmtGiven(d)} = ${fmt4(tau, "N m")} ≈ ${fmt3(tau, "N m")}.`,
        markScheme: [
          { code: "A1", criterion: `Correct couple torque = ${fmt3(tau, "N m")}.`, marks: 1 },
        ],
        totalMarks: 1,
        generatorModel,
      };
    }

    if (isPureQualStruct) {
      // 2m Short Qualitative Structured (matches NCUK EoS1 Section 2 2m items!)
      const askEq = variant % 2 === 0;
      const parts: StructuredQuestionPart[] = [
        {
          partId: "a",
          prompt: askEq
            ? "State the two conditions required for a rigid body to remain in complete static equilibrium."
            : "Explain what is meant by a couple and state its translational and rotational effect on a free rigid body.",
          marks: 2,
          targetMode: "qualitative",
          targetQuantityKey: askEq
            ? "equilibriumConditionsConcept"
            : "coupleEquilibriumConcept",
          expectedAnswer: askEq
            ? `A rigid body is in equilibrium when it has ${eqCond}.`
            : `A couple consists of ${coupleDef}, producing ${coupleEq}.`,
          workingSteps: askEq
            ? [
                "State that the resultant force in any direction must be zero.",
                "State that the resultant turning moment about any chosen point must also be zero.",
              ]
            : [
                "Describe equal opposite parallel forces with non-coincident lines of action.",
                "Note zero resultant force alongside a non-zero turning torque.",
              ],
        },
      ];
      return {
        id,
        conceptId: "vectors-equilibrium-moments",
        templateArchetype: "couples-torque-and-equilibrium-rules",
        seed: seed + attempt * 997,
        syllabi: [...AC23_SYLLABI],
        format: "structured",
        difficulty: "foundation",
        domain: "mechanics",
        scenarioSpec: spec,
        hiddenQuantities: hidden,
        requiredGivens,
        questionPlan: plan,
        stem,
        targetMode: "qualitative",
        parts,
        workedSolution: parts[0].expectedAnswer,
        markScheme: askEq
          ? [
              { code: "B1", partId: "a", criterion: "Zero resultant force (translational equilibrium).", marks: 1 },
              { code: "B1", partId: "a", criterion: "Zero resultant moment about any point (rotational equilibrium).", marks: 1 },
            ]
          : [
              { code: "B1", partId: "a", criterion: "Identifies zero resultant force.", marks: 1 },
              { code: "B1", partId: "a", criterion: "Identifies non-zero resultant torque causing rotation.", marks: 1 },
            ],
        totalMarks: 2,
        generatorModel,
      };
    }

    // 4m Mixed Structured: (a) [2m qual] equilibrium conditions + (b) [2m quant] calculate torque
    const parts: StructuredQuestionPart[] = [
      {
        partId: "a",
        prompt: "State the two conditions necessary for a rigid body to be in static equilibrium.",
        marks: 2,
        targetMode: "qualitative",
        targetQuantityKey: "equilibriumConditionsConcept",
        expectedAnswer: `The body must satisfy ${eqCond}.`,
        workingSteps: [
          "State zero resultant force for translational equilibrium.",
          "State zero resultant moment about any point for rotational equilibrium.",
        ],
      },
      {
        partId: "b",
        prompt: "Calculate the torque exerted on the bar by the couple shown, stating the appropriate SI unit.",
        marks: 2,
        targetQuantityKey: "coupleTorqueNm",
        expectedAnswer: `${fmt3(tau, "N m")}`,
        workingSteps: [
          tilted
            ? `Perpendicular separation d_perp = ${fmtGiven(d)} × sin ${fmtGiven(ang, 0)}° = ${fmt4(q.perpendicularSeparationM as number, "m")}.`
            : `Perpendicular separation d_perp = ${fmtGiven(d)} m.`,
          `Torque = F d_perp = ${fmtGiven(F, 0)} × ${fmt4(q.perpendicularSeparationM as number)} = ${fmt4(tau, "N m")} ≈ ${fmt3(tau, "N m")}.`,
        ],
      },
    ];
    return {
      id,
      conceptId: "vectors-equilibrium-moments",
      templateArchetype: "couples-torque-and-equilibrium-rules",
      seed: seed + attempt * 997,
      syllabi: [...AC23_SYLLABI],
      format: "structured",
      difficulty: difficultyForVariant(variant),
      domain: "mechanics",
      scenarioSpec: spec,
      hiddenQuantities: hidden,
      requiredGivens,
      questionPlan: plan,
      stem,
      parts,
      workedSolution: `(a) Static equilibrium requires ${eqCond}. (b) Torque of the couple is T = F d_perp = ${fmt4(tau, "N m")} ≈ ${fmt3(tau, "N m")} (note N m, not J).`,
      markScheme: [
        { code: "B1", partId: "a", criterion: "Zero resultant force.", marks: 1 },
        { code: "B1", partId: "a", criterion: "Zero resultant moment about any point.", marks: 1 },
        { code: "M1", partId: "b", criterion: "Applies T = F d_perp using perpendicular separation.", marks: 1 },
        { code: "A1", partId: "b", criterion: `Torque = ${fmt3(tau, "N m")} with unit N m.`, marks: 1 },
      ],
      totalMarks: 4,
      generatorModel,
    };
  }
  throw new Error(`Failed to sample couples-torque-and-equilibrium-rules (${id})`);
}

/* ============================================================================
 * ARCHETYPE 8: alloy-density-mass-vs-volume-mix (ncuk-ac3-1, 14 items)
 * ============================================================================ */

const ALLOY_PAIRS: readonly {
  readonly alloyName: string;
  readonly m1Name: string;
  readonly r1: number;
  readonly m2Name: string;
  readonly r2: number;
}[] = [
  { alloyName: "crown gold-silver alloy", m1Name: "gold", r1: 19300, m2Name: "silver", r2: 10500 },
  { alloyName: "aerospace al-cu alloy", m1Name: "copper", r1: 8930, m2Name: "aluminium", r2: 2700 },
  { alloyName: "rose gold-copper alloy", m1Name: "gold", r1: 19300, m2Name: "copper", r2: 8930 },
  { alloyName: "maritime steel-aluminium composite", m1Name: "iron", r1: 7870, m2Name: "aluminium", r2: 2700 },
  { alloyName: "heavy tungsten-steel alloy", m1Name: "tungsten", r1: 19250, m2Name: "iron", r2: 7870 },
  { alloyName: "titanium-copper brazing alloy", m1Name: "copper", r1: 8930, m2Name: "titanium", r2: 4510 },
  { alloyName: "lightweight zinc-magnesium alloy", m1Name: "zinc", r1: 7140, m2Name: "magnesium", r2: 1740 },
  { alloyName: "silver-aluminium contact alloy", m1Name: "silver", r1: 10500, m2Name: "aluminium", r2: 2700 },
];

const ALLOY_VESSELS = [
  "a foundry crucible sample",
  "a precision metrology reference billet",
  "a metallurgical lab test ingot",
  "a jewellery-studio cast blank",
  "a turbine-blade master alloy casting",
  "a marine-hardware forged slug",
  "a coin-mint prototype blank",
  "an electronics heatsink cast block",
  "an optical-bench counterweight billet",
  "an acoustic-bell bronze casting",
  "a watchmaking gear-wheel ingot",
  "a surgical-instrument trial billet",
  "an antique-restoration metal sample",
  "a motorsport piston-blank casting",
] as const;

function buildAlloyDensity(
  id: string,
  seed: number,
  variant: number,
  generatorModel: string,
): CandidateQuestionInput {
  const format: QuestionFormat = variant < 8 ? "mcq" : "structured";
  const isVolumeMix = variant % 2 === 1;
  const pair = ALLOY_PAIRS[variant % ALLOY_PAIRS.length];
  const vessel = ALLOY_VESSELS[variant % ALLOY_VESSELS.length];

  for (let attempt = 0; attempt < 40; attempt += 1) {
    const rng = createRng(seed + attempt * 997);

    if (!isVolumeMix) {
      // Mass-ratio HARMONIC mean alloy density!
      const totalMass = rng.step(1.2, 6.0, 0.4, 1);
      const w1 = rng.step(0.25, 0.75, 0.05, 2);
      const w1Pct = Math.round(w1 * 100);
      const w2Pct = 100 - w1Pct;
      const useGCm3Prompt = variant % 4 === 2;

      const spec: Record<string, unknown> = {
        kind: "alloy-composite-density",
        mode: "mass-fraction-alloy",
        density1KgM3: pair.r1,
        density2KgM3: pair.r2,
        totalMassKg: totalMass,
        massFraction1: w1,
      };
      const q = solvePlugin("alloy-composite-density", spec);
      const rhoMix = q.alloyDensityKgM3 as number;
      const rhoGCm3 = q.alloyDensityGCm3 as number;
      const naiveArith = q.naiveArithmeticDensityKgM3 as number;
      const totalVolCm3 = q.totalVolumeCm3 as number;
      const defConcept = String(q.densityDefinitionConcept);

      // Ensure harmonic and naive arithmetic differ by > 3.5% so distractor is always crisp!
      if (Math.abs(rhoMix - naiveArith) / rhoMix < 0.04) continue;

      const hidden = ["alloyDensityKgM3", "alloyDensityGCm3", "totalVolumeM3", "totalVolumeCm3"];
      if (hasHiddenNumericCollision(q, hidden, [pair.r1, pair.r2, totalMass, w1Pct, w2Pct])) {
        continue;
      }

      const d1Text = useGCm3Prompt
        ? `${fmtGiven(pair.r1 / 1000, 2)} g cm⁻³`
        : `${pair.r1} kg m⁻³`;
      const d2Text = useGCm3Prompt
        ? `${fmtGiven(pair.r2 / 1000, 2)} g cm⁻³`
        : `${pair.r2} kg m⁻³`;

      const stem = `To cast ${vessel} of ${pair.alloyName} with total mass ${fmtGiven(totalMass, 1)} kg, a metallurgist melts together ${w1Pct}% ${pair.m1Name} (density ${d1Text}) and ${w2Pct}% ${pair.m2Name} (density ${d2Text}) by mass. Assume that the total volume of the alloy equals the sum of the constituent volumes.`;

      const requiredGivens: RequiredGivenSpec[] = [
        { name: "totalMassKg", value: totalMass, unit: "kg", source: "stem" },
        { name: "density1", value: useGCm3Prompt ? pair.r1 / 1000 : pair.r1, source: "stem" },
        { name: "density2", value: useGCm3Prompt ? pair.r2 / 1000 : pair.r2, source: "stem" },
        { name: "w1Pct", value: w1Pct, unit: "%", source: "stem" },
      ];

      const plan: CandidateQuestionPlan = {
        targetSummary:
          "Compute composite alloy density from constituent mass percentages using total mass divided by summed constituent volumes (harmonic mean).",
        distractorStrategy: [
          "Computing the naive arithmetic weighted average of densities instead of summing volumes.",
          "Taking the unweighted midpoint of the two densities.",
          "Forgetting the factor of one thousand between grams per cubic centimetre and kilograms per cubic metre.",
        ],
      };

      if (format === "mcq") {
        const askGCm3 = variant % 4 === 0;
        const targetKey = askGCm3 ? "alloyDensityGCm3" : "alloyDensityKgM3";
        const targetVal = askGCm3 ? rhoGCm3 : rhoMix;
        const unit = askGCm3 ? "g cm⁻³" : "kg m⁻³";
        const distractors: NumericDistractor[] = askGCm3
          ? [
              { value: naiveArith / 1000, rationale: "Uses the volume-weighted arithmetic average instead of harmonic mean for a mass-fraction mix." },
              { value: (pair.r1 + pair.r2) / 2000, rationale: "Takes a simple unweighted average of the two metal densities." },
              {
                value: 1 / (w1 / (pair.r2 / 1000) + (1 - w1) / (pair.r1 / 1000)),
                rationale: "Swaps the mass percentages assigned to the two constituent metals.",
              },
            ]
          : [
              { value: naiveArith, rationale: "Applies the arithmetic weighted mean w₁ρ₁ + w₂ρ₂, which is only valid for volume fractions." },
              { value: (pair.r1 + pair.r2) / 2, rationale: "Averages the two densities equally regardless of mass percentages." },
              { value: rhoGCm3, rationale: "Leaves the density in g cm⁻³ instead of converting to kg m⁻³." },
            ];
        return {
          id,
          conceptId: "fluid-drag-buoyancy",
          templateArchetype: "alloy-density-mass-vs-volume-mix",
          seed: seed + attempt * 997,
          syllabi: [...AC31_DENSITY_SYLLABI],
          format: "mcq",
          difficulty: difficultyForVariant(variant),
          domain: "pure-calculation",
          scenarioSpec: spec,
          hiddenQuantities: hidden,
          requiredGivens,
          questionPlan: plan,
          stem: `${stem} What is the overall density of the finished alloy in ${unit}?`,
          options: buildNumericMcqOptions(targetVal, unit, distractors, seed + attempt),
          targetQuantityKey: targetKey,
          workedSolution: `Masses: m₁ = ${fmt4(q.mass1Kg as number, "kg")}, m₂ = ${fmt4(q.mass2Kg as number, "kg")}. Volumes: V₁ = m₁/ρ₁ = ${fmt4(q.volume1M3 as number, "m³")}, V₂ = m₂/ρ₂ = ${fmt4(q.volume2M3 as number, "m³")}. Total volume V = V₁ + V₂ = ${fmt4(q.totalVolumeM3 as number, "m³")} (${fmt4(totalVolCm3, "cm³")}). Alloy density ρ = m / V = ${fmtGiven(totalMass, 1)} / ${fmt4(q.totalVolumeM3 as number)} = ${fmt4(rhoMix, "kg m⁻³")} ≈ ${fmt3(rhoMix, "kg m⁻³")} (${fmt3(rhoGCm3, "g cm⁻³")}).`,
          markScheme: [
            { code: "A1", criterion: `Correct harmonic-mean alloy density = ${fmt3(targetVal, unit)}.`, marks: 1 },
          ],
          totalMarks: 1,
          generatorModel,
        };
      }

      // 5m Structured: (a) [1m qual] define density, (b) [2m] total volume in cm³, (c) [2m] alloy density in kg m⁻³
      const parts: StructuredQuestionPart[] = [
        {
          partId: "a",
          prompt: "Define the density of a substance.",
          marks: 1,
          targetMode: "qualitative",
          targetQuantityKey: "densityDefinitionConcept",
          expectedAnswer: `Density is defined as ${defConcept}.`,
          workingSteps: ["State that density is mass divided by volume."],
        },
        {
          partId: "b",
          prompt: "Calculate the total volume of the cast alloy sample in cm³.",
          marks: 2,
          targetQuantityKey: "totalVolumeCm3",
          expectedAnswer: `${fmt3(totalVolCm3, "cm³")}`,
          workingSteps: [
            `m₁ = ${fmt4(q.mass1Kg as number, "kg")} ⇒ V₁ = ${fmt4((q.volume1M3 as number) * 1e6, "cm³")}; m₂ = ${fmt4(q.mass2Kg as number, "kg")} ⇒ V₂ = ${fmt4((q.volume2M3 as number) * 1e6, "cm³")}.`,
            `V_total = V₁ + V₂ = ${fmt4(totalVolCm3, "cm³")} ≈ ${fmt3(totalVolCm3, "cm³")}.`,
          ],
        },
        {
          partId: "c",
          prompt: "Hence calculate the overall density of the alloy in kg m⁻³.",
          marks: 2,
          dependsOnPartIds: ["b"],
          targetQuantityKey: "alloyDensityKgM3",
          expectedAnswer: `${fmt3(rhoMix, "kg m⁻³")}`,
          workingSteps: [
            `Convert V_total = ${fmt4(q.totalVolumeM3 as number, "m³")}.`,
            `ρ = ${fmtGiven(totalMass, 1)} / ${fmt4(q.totalVolumeM3 as number)} = ${fmt4(rhoMix, "kg m⁻³")} ≈ ${fmt3(rhoMix, "kg m⁻³")}.`,
          ],
        },
      ];
      return {
        id,
        conceptId: "fluid-drag-buoyancy",
        templateArchetype: "alloy-density-mass-vs-volume-mix",
        seed: seed + attempt * 997,
        syllabi: [...AC31_DENSITY_SYLLABI],
        format: "structured",
        difficulty: difficultyForVariant(variant),
        domain: "pure-calculation",
        scenarioSpec: spec,
        hiddenQuantities: hidden,
        requiredGivens,
        questionPlan: plan,
        stem,
        parts,
        workedSolution: `(a) Density is ${defConcept}. (b) V₁ + V₂ = ${fmt4(totalVolCm3, "cm³")} ≈ ${fmt3(totalVolCm3, "cm³")}. (c) ρ = m / V = ${fmt4(rhoMix, "kg m⁻³")} ≈ ${fmt3(rhoMix, "kg m⁻³")}.`,
        markScheme: [
          { code: "B1", partId: "a", criterion: "Defines density as mass per unit volume.", marks: 1 },
          { code: "M1", partId: "b", criterion: "Finds both constituent masses and sums V₁ = m₁/ρ₁ and V₂ = m₂/ρ₂.", marks: 1 },
          { code: "A1", partId: "b", criterion: `Total volume = ${fmt3(totalVolCm3, "cm³")}.`, marks: 1 },
          { code: "M1", partId: "c", criterion: "Converts cm³ to m³ (× 10⁻⁶) and divides total mass by total volume.", marks: 1 },
          { code: "A1", partId: "c", criterion: `Alloy density = ${fmt3(rhoMix, "kg m⁻³")}.`, marks: 1 },
        ],
        totalMarks: 5,
        generatorModel,
      };
    }

    // Volume-percentage ARITHMETIC mean alloy density + cuboid cm³ -> m³ unit trap!
    const f1 = rng.step(0.25, 0.75, 0.05, 2);
    const f1Pct = Math.round(f1 * 100);
    const f2Pct = 100 - f1Pct;
    const lCm = rng.step(6.0, 14.0, 1.0, 1);
    const wCm = rng.step(3.0, 7.0, 0.5, 1);
    const hCm = rng.step(2.0, 5.0, 0.5, 1);

    const spec: Record<string, unknown> = {
      kind: "alloy-composite-density",
      mode: "volume-fraction-alloy",
      density1KgM3: pair.r1,
      density2KgM3: pair.r2,
      volumeFraction1: f1,
      lengthCm: lCm,
      widthCm: wCm,
      heightCm: hCm,
    };
    const q = solvePlugin("alloy-composite-density", spec);
    const rhoMix = q.alloyDensityKgM3 as number;
    const naiveHarm = q.naiveHarmonicDensityKgM3 as number;
    const totalMassKg = q.totalMassKg as number;
    const defConcept = String(q.densityDefinitionConcept);
    if (Math.abs(rhoMix - naiveHarm) / rhoMix < 0.04) continue;

    const hidden = ["alloyDensityKgM3", "alloyDensityGCm3", "totalMassKg", "totalMassG"];
    if (
      hasHiddenNumericCollision(q, hidden, [
        pair.r1,
        pair.r2,
        f1Pct,
        f2Pct,
        lCm,
        wCm,
        hCm,
      ])
    ) {
      continue;
    }

    const stem = `A rectangular cuboid ingot for ${vessel} is machined from ${pair.alloyName} measuring ${fmtGiven(lCm, 1)} cm × ${fmtGiven(wCm, 1)} cm × ${fmtGiven(hCm, 1)} cm. The alloy is composed of ${f1Pct}% ${pair.m1Name} (density ${pair.r1} kg m⁻³) and ${f2Pct}% ${pair.m2Name} (density ${pair.r2} kg m⁻³) by volume.`;
    const requiredGivens: RequiredGivenSpec[] = [
      { name: "lengthCm", value: lCm, unit: "cm", source: "stem" },
      { name: "widthCm", value: wCm, unit: "cm", source: "stem" },
      { name: "heightCm", value: hCm, unit: "cm", source: "stem" },
      { name: "density1KgM3", value: pair.r1, unit: "kg m⁻³", source: "stem" },
      { name: "density2KgM3", value: pair.r2, unit: "kg m⁻³", source: "stem" },
      { name: "f1Pct", value: f1Pct, unit: "%", source: "stem" },
    ];
    const plan: CandidateQuestionPlan = {
      targetSummary:
        "Calculate cuboid alloy density and total mass from constituent volume fractions with cubic centimetre to cubic metre unit conversion.",
      distractorStrategy: [
        "Applying the harmonic mean formula instead of the arithmetic mean for a volume-fraction mix.",
        "Using an incorrect power of ten when converting cm³ to m³.",
        "Computing only one metal's mass contribution instead of both.",
      ],
    };

    if (format === "mcq") {
      const askMass = variant % 4 === 3;
      const targetKey = askMass ? "totalMassKg" : "alloyDensityKgM3";
      const targetVal = askMass ? totalMassKg : rhoMix;
      const unit = askMass ? "kg" : "kg m⁻³";
      const distractors: NumericDistractor[] = askMass
        ? [
            { value: totalMassKg * 100, rationale: "Uses 10⁻⁴ instead of 10⁻⁶ when converting cm³ to m³." },
            { value: q.mass1Kg as number, rationale: "Includes only the mass of the first metal." },
            { value: naiveHarm * (q.totalVolumeM3 as number), rationale: "Uses the harmonic mean density instead of the volume-weighted mean." },
          ]
        : [
            { value: naiveHarm, rationale: "Uses the harmonic mean formula, which applies to mass fractions rather than volume fractions." },
            { value: (pair.r1 + pair.r2) / 2, rationale: "Takes an unweighted average of the two constituent densities." },
            { value: (1 - f1) * pair.r1 + f1 * pair.r2, rationale: "Swaps the volume fractions assigned to the two metals." },
          ];
      return {
        id,
        conceptId: "fluid-drag-buoyancy",
        templateArchetype: "alloy-density-mass-vs-volume-mix",
        seed: seed + attempt * 997,
        syllabi: [...AC31_DENSITY_SYLLABI],
        format: "mcq",
        difficulty: difficultyForVariant(variant),
        domain: "pure-calculation",
        scenarioSpec: spec,
        hiddenQuantities: hidden,
        requiredGivens,
        questionPlan: plan,
        stem: `${stem} What is the ${askMass ? "total mass of the cuboid ingot in kg" : "overall density of this alloy in kg m⁻³"}?`,
        options: buildNumericMcqOptions(targetVal, unit, distractors, seed + attempt),
        targetQuantityKey: targetKey,
        workedSolution: `Volume V = (${fmtGiven(lCm, 1)} × ${fmtGiven(wCm, 1)} × ${fmtGiven(hCm, 1)}) × 10⁻⁶ = ${fmt4(q.totalVolumeM3 as number, "m³")}. Volume-weighted density ρ = (${fmtGiven(f1)} × ${pair.r1}) + (${fmtGiven(1 - f1)} × ${pair.r2}) = ${fmt4(rhoMix, "kg m⁻³")} ≈ ${fmt3(rhoMix, "kg m⁻³")}. Total mass m = ρ V = ${fmt4(totalMassKg, "kg")} ≈ ${fmt3(totalMassKg, "kg")}.`,
        markScheme: [
          { code: "A1", criterion: `Correct verified value = ${fmt3(targetVal, unit)}.`, marks: 1 },
        ],
        totalMarks: 1,
        generatorModel,
      };
    }

    const parts: StructuredQuestionPart[] = [
      {
        partId: "a",
        prompt: "State the definition of density.",
        marks: 1,
        targetMode: "qualitative",
        targetQuantityKey: "densityDefinitionConcept",
        expectedAnswer: `Density is ${defConcept}.`,
        workingSteps: ["State density equals mass per unit volume."],
      },
      {
        partId: "b",
        prompt: "Calculate the overall density of this volume-mixed alloy in kg m⁻³.",
        marks: 2,
        targetQuantityKey: "alloyDensityKgM3",
        expectedAnswer: `${fmt3(rhoMix, "kg m⁻³")}`,
        workingSteps: [
          `ρ = f₁ρ₁ + f₂ρ₂ = (${fmtGiven(f1)} × ${pair.r1}) + (${fmtGiven(1 - f1)} × ${pair.r2}) = ${fmt4(rhoMix, "kg m⁻³")} ≈ ${fmt3(rhoMix, "kg m⁻³")}.`,
        ],
      },
      {
        partId: "c",
        prompt: "Calculate the total mass of the cuboid ingot in kg.",
        marks: 2,
        dependsOnPartIds: ["b"],
        targetQuantityKey: "totalMassKg",
        expectedAnswer: `${fmt3(totalMassKg, "kg")}`,
        workingSteps: [
          `V = ${fmtGiven(lCm, 1)} × ${fmtGiven(wCm, 1)} × ${fmtGiven(hCm, 1)} cm³ = ${fmt4(q.totalVolumeCm3 as number, "cm³")} = ${fmt4(q.totalVolumeM3 as number, "m³")}.`,
          `m = ρ V = ${fmt4(rhoMix)} × ${fmt4(q.totalVolumeM3 as number)} = ${fmt4(totalMassKg, "kg")} ≈ ${fmt3(totalMassKg, "kg")}.`,
        ],
      },
    ];
    return {
      id,
      conceptId: "fluid-drag-buoyancy",
      templateArchetype: "alloy-density-mass-vs-volume-mix",
      seed: seed + attempt * 997,
      syllabi: [...AC31_DENSITY_SYLLABI],
      format: "structured",
      difficulty: difficultyForVariant(variant),
      domain: "pure-calculation",
      scenarioSpec: spec,
      hiddenQuantities: hidden,
      requiredGivens,
      questionPlan: plan,
      stem,
      parts,
      workedSolution: `(a) Density is ${defConcept}. (b) ρ = ${fmt4(rhoMix, "kg m⁻³")} ≈ ${fmt3(rhoMix, "kg m⁻³")}. (c) V = ${fmt4(q.totalVolumeM3 as number, "m³")}, so m = ${fmt4(totalMassKg, "kg")} ≈ ${fmt3(totalMassKg, "kg")}.`,
      markScheme: [
        { code: "B1", partId: "a", criterion: "Defines density as mass per unit volume.", marks: 1 },
        { code: "M1", partId: "b", criterion: "Uses volume-weighted average ρ = f₁ρ₁ + f₂ρ₂.", marks: 1 },
        { code: "A1", partId: "b", criterion: `ρ = ${fmt3(rhoMix, "kg m⁻³")}.`, marks: 1 },
        { code: "M1", partId: "c", criterion: "Converts cuboid volume from cm³ to m³ (× 10⁻⁶) and multiplies by ρ.", marks: 1 },
        { code: "A1", partId: "c", criterion: `m = ${fmt3(totalMassKg, "kg")}.`, marks: 1 },
      ],
      totalMarks: 5,
      generatorModel,
    };
  }
  throw new Error(`Failed to sample alloy-density-mass-vs-volume-mix (${id})`);
}

/* ============================================================================
 * ARCHETYPE 9: annular-washer-drawn-wire-sphere-density (ncuk-ac3-1, 14 items)
 * ============================================================================ */

const GEOM_DENSITY_METALS = [
  { name: "stainless steel", rho: 7870 },
  { name: "oxygen-free copper", rho: 8930 },
  { name: "architectural brass", rho: 8450 },
  { name: "aircraft aluminium", rho: 2700 },
  { name: "machined titanium", rho: 4510 },
  { name: "cast bronze", rho: 8800 },
] as const;

function buildGeometryDensity(
  id: string,
  seed: number,
  variant: number,
  generatorModel: string,
): CandidateQuestionInput {
  const format: QuestionFormat = variant < 8 ? "mcq" : "structured";
  const subKind = variant % 3; // 0: annular washer, 1: drawn wire / remelted cube, 2: planetary/nuclear sphere

  for (let attempt = 0; attempt < 40; attempt += 1) {
    const rng = createRng(seed + attempt * 997);

    if (subKind === 0) {
      // Annular washer / sleeve: V = π(R² - r²)h, mm -> m trap!
      const metal = GEOM_DENSITY_METALS[variant % GEOM_DENSITY_METALS.length];
      const dOutMm = rng.step(36, 76, 4, 0);
      const dInMm = rng.step(14, Math.min(32, dOutMm - 14), 2, 0);
      const thickMm = rng.step(8, 26, 2, 0);
      const spec: Record<string, unknown> = {
        kind: "alloy-composite-density",
        mode: "annular-washer",
        outerDiameterMm: dOutMm,
        innerDiameterMm: dInMm,
        thicknessMm: thickMm,
        materialDensityKgM3: metal.rho,
      };
      const q = solvePlugin("alloy-composite-density", spec);
      const volCm3 = q.volumeCm3 as number;
      const massG = q.massG as number;
      const massKg = q.massKg as number;
      const hidden = ["volumeM3", "volumeCm3", "massKg", "massG", "crossSectionAreaM2"];
      if (hasHiddenNumericCollision(q, hidden, [dOutMm, dInMm, thickMm, metal.rho])) {
        continue;
      }

      const partLabels = [
        "a heavy flanged thrust washer",
        "a cylindrical gearbox spacer ring",
        "a CNC-machined shaft collar",
        "a hydraulic-valve annular seal ring",
        "a structural anchor bearing sleeve",
      ];
      const partName = partLabels[variant % partLabels.length];
      const stem = `In a mechanical workshop, ${partName} is turned from solid ${metal.name} of density ${metal.rho} kg m⁻³. It has outer diameter ${dOutMm} mm, concentric central bore diameter ${dInMm} mm, and axial thickness ${thickMm} mm.`;
      const requiredGivens: RequiredGivenSpec[] = [
        { name: "outerDiameterMm", value: dOutMm, unit: "mm", source: "stem" },
        { name: "innerDiameterMm", value: dInMm, unit: "mm", source: "stem" },
        { name: "thicknessMm", value: thickMm, unit: "mm", source: "stem" },
        { name: "materialDensityKgM3", value: metal.rho, unit: "kg m⁻³", source: "stem" },
      ];
      const plan: CandidateQuestionPlan = {
        targetSummary:
          "Calculate the volume and mass of an annular cylindrical component using inner and outer radii with millimetre to metre conversions.",
        distractorStrategy: [
          "Substituting diameters directly into π(R² − r²)h without halving to radii.",
          "Using (R − r)² instead of (R² − r²) for the annular area.",
          "Applying an incorrect cubic conversion factor from mm³ to m³.",
        ],
      };

      if (format === "mcq") {
        const distractors: NumericDistractor[] = [
          { value: massG * 4, rationale: "Uses outer and inner diameters instead of radii in π(R² − r²), inflating area by 4×." },
          {
            value:
              metal.rho *
              Math.PI *
              (((dOutMm - dInMm) * 0.5e-3) ** 2) *
              (thickMm * 1e-3) *
              1000,
            rationale: "Computes π(R − r)² instead of π(R² − r²).",
          },
          {
            value:
              metal.rho *
              Math.PI *
              ((dOutMm * 0.5e-3) ** 2) *
              (thickMm * 1e-3) *
              1000,
            rationale: "Treats the washer as a solid cylinder and omits the central hole.",
          },
        ];
        return {
          id,
          conceptId: "fluid-drag-buoyancy",
          templateArchetype: "annular-washer-drawn-wire-sphere-density",
          seed: seed + attempt * 997,
          syllabi: [...AC31_DENSITY_SYLLABI],
          format: "mcq",
          difficulty: difficultyForVariant(variant),
          domain: "pure-calculation",
          scenarioSpec: spec,
          hiddenQuantities: hidden,
          requiredGivens,
          questionPlan: plan,
          stem: `${stem} What is the mass of this annular component in grams?`,
          options: buildNumericMcqOptions(massG, "g", distractors, seed + attempt),
          targetQuantityKey: "massG",
          workedSolution: `Outer radius R = ${fmtGiven(dOutMm / 2, 1)} mm = ${fmt4(dOutMm * 0.5e-3, "m")}; inner radius r = ${fmtGiven(dInMm / 2, 1)} mm = ${fmt4(dInMm * 0.5e-3, "m")}; thickness h = ${fmt4(thickMm * 1e-3, "m")}. Volume V = π(R² − r²)h = ${fmt4(q.volumeM3 as number, "m³")} (${fmt4(volCm3, "cm³")}). Mass m = ρ V = ${fmt4(massKg, "kg")} = ${fmt4(massG, "g")} ≈ ${fmt3(massG, "g")}.`,
          markScheme: [{ code: "A1", criterion: `Correct mass = ${fmt3(massG, "g")}.`, marks: 1 }],
          totalMarks: 1,
          generatorModel,
        };
      }

      const parts: StructuredQuestionPart[] = [
        {
          partId: "a",
          prompt: "Calculate the metal volume of the annular component in cm³.",
          marks: 2,
          targetQuantityKey: "volumeCm3",
          expectedAnswer: `${fmt3(volCm3, "cm³")}`,
          workingSteps: [
            `R = ${fmtGiven(dOutMm / 20, 2)} cm, r = ${fmtGiven(dInMm / 20, 2)} cm, h = ${fmtGiven(thickMm / 10, 2)} cm.`,
            `V = π(R² − r²)h = ${fmt4(volCm3, "cm³")} ≈ ${fmt3(volCm3, "cm³")}.`,
          ],
        },
        {
          partId: "b",
          prompt: "Calculate the mass of the component in kg.",
          marks: 2,
          dependsOnPartIds: ["a"],
          targetQuantityKey: "massKg",
          expectedAnswer: `${fmt3(massKg, "kg")}`,
          workingSteps: [
            `Convert V = ${fmt4(q.volumeM3 as number, "m³")}.`,
            `m = ${metal.rho} × ${fmt4(q.volumeM3 as number)} = ${fmt4(massKg, "kg")} ≈ ${fmt3(massKg, "kg")}.`,
          ],
        },
        {
          partId: "c",
          prompt: "State one physical assumption made when using this formula to determine the mass.",
          marks: 1,
          targetMode: "qualitative",
          targetQuantityKey: "volumeConservationAssumptionConcept",
          expectedAnswer: `It is assumed that ${String(q.volumeConservationAssumptionConcept)}.`,
          workingSteps: [
            "Note uniform constant density throughout the metal with no internal voids or lost material.",
          ],
        },
      ];
      return {
        id,
        conceptId: "fluid-drag-buoyancy",
        templateArchetype: "annular-washer-drawn-wire-sphere-density",
        seed: seed + attempt * 997,
        syllabi: [...AC31_DENSITY_SYLLABI],
        format: "structured",
        difficulty: difficultyForVariant(variant),
        domain: "pure-calculation",
        scenarioSpec: spec,
        hiddenQuantities: hidden,
        requiredGivens,
        questionPlan: plan,
        stem,
        parts,
        workedSolution: `(a) V = π(R² − r²)h = ${fmt4(volCm3, "cm³")} ≈ ${fmt3(volCm3, "cm³")}. (b) m = ρ V = ${fmt4(massKg, "kg")} ≈ ${fmt3(massKg, "kg")}. (c) ${String(q.volumeConservationAssumptionConcept)}.`,
        markScheme: [
          { code: "M1", partId: "a", criterion: "Uses V = π(R² − r²)h with radii and consistent unit conversion.", marks: 1 },
          { code: "A1", partId: "a", criterion: `V = ${fmt3(volCm3, "cm³")}.`, marks: 1 },
          { code: "M1", partId: "b", criterion: "Applies m = ρ V in SI units.", marks: 1 },
          { code: "A1", partId: "b", criterion: `m = ${fmt3(massKg, "kg")}.`, marks: 1 },
          { code: "B1", partId: "c", criterion: "States uniform/constant density and no mass loss.", marks: 1 },
        ],
        totalMarks: 5,
        generatorModel,
      };
    }

    if (subKind === 1) {
      // Drawn cylindrical wire & remelted cube volume conservation!
      const metal = GEOM_DENSITY_METALS[variant % GEOM_DENSITY_METALS.length];
      const massKg = rng.step(0.8, 3.6, 0.4, 1);
      const wireDiaMm = rng.step(0.8, 2.2, 0.2, 1);
      const spec: Record<string, unknown> = {
        kind: "alloy-composite-density",
        mode: "drawn-wire-remelt",
        massKg,
        materialDensityKgM3: metal.rho,
        wireDiameterMm: wireDiaMm,
      };
      const q = solvePlugin("alloy-composite-density", spec);
      const wireLenM = q.wireLengthM as number;
      const cubeEdgeCm = q.cubeEdgeCm as number;
      const volCm3 = q.volumeCm3 as number;
      const hidden = ["volumeM3", "volumeCm3", "wireLengthM", "cubeEdgeM", "cubeEdgeCm"];
      if (hasHiddenNumericCollision(q, hidden, [massKg, metal.rho, wireDiaMm])) {
        continue;
      }

      const stem = `A solid billet of ${metal.name} with mass ${fmtGiven(massKg, 1)} kg and density ${metal.rho} kg m⁻³ is drawn without material loss into a uniform cylindrical wire of diameter ${fmtGiven(wireDiaMm, 1)} mm (or alternatively melted and cast into a solid cube).`;
      const requiredGivens: RequiredGivenSpec[] = [
        { name: "massKg", value: massKg, unit: "kg", source: "stem" },
        { name: "materialDensityKgM3", value: metal.rho, unit: "kg m⁻³", source: "stem" },
        { name: "wireDiameterMm", value: wireDiaMm, unit: "mm", source: "stem" },
      ];
      const plan: CandidateQuestionPlan = {
        targetSummary:
          "Apply volume conservation during wire drawing and remelting to compute cylindrical wire length and recast cube edge length.",
        distractorStrategy: [
          "Using wire diameter instead of radius in πr² (four-times error).",
          "Forgetting to square the millimetre to metre conversion.",
          "Taking a square root instead of a cube root when finding the cube edge.",
        ],
      };

      if (format === "mcq") {
        const askCube = variant % 2 === 0;
        const targetKey = askCube ? "cubeEdgeCm" : "wireLengthM";
        const targetVal = askCube ? cubeEdgeCm : wireLenM;
        const unit = askCube ? "cm" : "m";
        const distractors: NumericDistractor[] = askCube
          ? [
              { value: Math.sqrt(volCm3), rationale: "Takes the square root of volume instead of the cube root." },
              { value: volCm3 / 3, rationale: "Divides the volume by 3 instead of taking its cube root." },
              { value: cubeEdgeCm * 0.1, rationale: "Misplaces a decimal factor during m to cm conversion." },
            ]
          : [
              { value: wireLenM / 4, rationale: "Uses diameter d instead of radius d/2 in A = πr², giving one quarter of the true length." },
              { value: wireLenM * Math.PI, rationale: "Omits π from the circular cross-sectional area." },
              { value: wireLenM / 1000, rationale: "Applies mm → m only once instead of squaring 10⁻³ for area." },
            ];
        return {
          id,
          conceptId: "fluid-drag-buoyancy",
          templateArchetype: "annular-washer-drawn-wire-sphere-density",
          seed: seed + attempt * 997,
          syllabi: [...AC31_DENSITY_SYLLABI],
          format: "mcq",
          difficulty: difficultyForVariant(variant),
          domain: "pure-calculation",
          scenarioSpec: spec,
          hiddenQuantities: hidden,
          requiredGivens,
          questionPlan: plan,
          stem: `${stem} What is the ${askCube ? "side length of the recast solid cube in cm" : "total length of the drawn cylindrical wire in m"}?`,
          options: buildNumericMcqOptions(targetVal, unit, distractors, seed + attempt),
          targetQuantityKey: targetKey,
          workedSolution: `Volume V = m / ρ = ${fmtGiven(massKg, 1)} / ${metal.rho} = ${fmt4(q.volumeM3 as number, "m³")} (${fmt4(volCm3, "cm³")}). Wire cross-sectional area A = π(d/2)² = ${fmt4(q.wireCrossSectionAreaM2 as number, "m²")} ⇒ L = V / A = ${fmt4(wireLenM, "m")} ≈ ${fmt3(wireLenM, "m")}. Recast cube edge s = ∛V = ${fmt4(cubeEdgeCm, "cm")} ≈ ${fmt3(cubeEdgeCm, "cm")}.`,
          markScheme: [{ code: "A1", criterion: `Correct value = ${fmt3(targetVal, unit)}.`, marks: 1 }],
          totalMarks: 1,
          generatorModel,
        };
      }

      const parts: StructuredQuestionPart[] = [
        {
          partId: "a",
          prompt: "Calculate the volume of the metal billet in cm³.",
          marks: 2,
          targetQuantityKey: "volumeCm3",
          expectedAnswer: `${fmt3(volCm3, "cm³")}`,
          workingSteps: [
            `V = m / ρ = ${fmtGiven(massKg, 1)} / ${metal.rho} = ${fmt4(q.volumeM3 as number, "m³")} = ${fmt4(volCm3, "cm³")} ≈ ${fmt3(volCm3, "cm³")}.`,
          ],
        },
        {
          partId: "b",
          prompt: "Calculate the length of the uniform cylindrical wire drawn from this billet.",
          marks: 2,
          dependsOnPartIds: ["a"],
          targetQuantityKey: "wireLengthM",
          expectedAnswer: `${fmt3(wireLenM, "m")}`,
          workingSteps: [
            `r = ${fmtGiven(wireDiaMm / 2, 2)} × 10⁻³ m ⇒ A = πr² = ${fmt4(q.wireCrossSectionAreaM2 as number, "m²")}.`,
            `L = V / A = ${fmt4(wireLenM, "m")} ≈ ${fmt3(wireLenM, "m")}.`,
          ],
        },
        {
          partId: "c",
          prompt: "If the billet is instead melted and cast into a solid cube at constant volume, calculate the side length of the cube in cm.",
          marks: 2,
          dependsOnPartIds: ["a"],
          targetQuantityKey: "cubeEdgeCm",
          expectedAnswer: `${fmt3(cubeEdgeCm, "cm")}`,
          workingSteps: [
            `s = ∛(${fmt4(volCm3)} cm³) = ${fmt4(cubeEdgeCm, "cm")} ≈ ${fmt3(cubeEdgeCm, "cm")}.`,
          ],
        },
      ];
      return {
        id,
        conceptId: "fluid-drag-buoyancy",
        templateArchetype: "annular-washer-drawn-wire-sphere-density",
        seed: seed + attempt * 997,
        syllabi: [...AC31_DENSITY_SYLLABI],
        format: "structured",
        difficulty: difficultyForVariant(variant),
        domain: "pure-calculation",
        scenarioSpec: spec,
        hiddenQuantities: hidden,
        requiredGivens,
        questionPlan: plan,
        stem,
        parts,
        workedSolution: `(a) V = ${fmt4(volCm3, "cm³")} ≈ ${fmt3(volCm3, "cm³")}. (b) L = V / (πr²) = ${fmt4(wireLenM, "m")} ≈ ${fmt3(wireLenM, "m")}. (c) s = ∛V = ${fmt4(cubeEdgeCm, "cm")} ≈ ${fmt3(cubeEdgeCm, "cm")}.`,
        markScheme: [
          { code: "M1", partId: "a", criterion: "Applies V = m / ρ and converts m³ to cm³.", marks: 1 },
          { code: "A1", partId: "a", criterion: `V = ${fmt3(volCm3, "cm³")}.`, marks: 1 },
          { code: "M1", partId: "b", criterion: "Uses r = d/2 in mm → m and L = V / (πr²).", marks: 1 },
          { code: "A1", partId: "b", criterion: `L = ${fmt3(wireLenM, "m")}.`, marks: 1 },
          { code: "M1", partId: "c", criterion: "Applies s = ∛V via volume conservation.", marks: 1 },
          { code: "A1", partId: "c", criterion: `s = ${fmt3(cubeEdgeCm, "cm")}.`, marks: 1 },
        ],
        totalMarks: 6,
        generatorModel,
      };
    }

    // Extreme-scale sphere density: exoplanets & atomic nuclei!
    const isNuclear = variant % 2 === 0;
    const massKg = isNuclear
      ? Number((rng.step(56, 208, 12, 0) * 1.66e-27).toPrecision(3))
      : Number((rng.step(1.8, 9.2, 0.4, 1) * 1e24).toPrecision(3));
    const diameterM = isNuclear
      ? Number((rng.step(8.4, 14.4, 0.6, 1) * 1e-15).toPrecision(3))
      : Number((rng.step(8.2, 16.6, 0.6, 1) * 1e6).toPrecision(3));
    const diameterKm = diameterM / 1000;

    const spec: Record<string, unknown> = {
      kind: "alloy-composite-density",
      mode: "sphere-density",
      massKg,
      diameterM,
    };
    const q = solvePlugin("alloy-composite-density", spec);
    const rho = q.densityKgM3 as number;
    const radiusM = q.radiusM as number;
    const hidden = ["densityKgM3", "densityGCm3", "volumeM3", "radiusM"];
    if (hasHiddenNumericCollision(q, hidden, [massKg, diameterM, diameterKm])) {
      continue;
    }

    const nuclearContexts = [
      "A heavy spherical atomic nucleus studied in a scattering laboratory",
      "An unstable lanthanide isotope nucleus analysed in nuclear metrology",
      "A spherical transition-metal nucleus modelled as tightly packed nucleons",
      "A heavy actinide atomic nucleus probed by high-energy electron scattering",
    ];
    const planetContexts = [
      "A rocky exoplanet discovered by transit photometry",
      "A dense terrestrial dwarf planet surveyed by an orbital probe",
      "A metallic-core minor planet measured by radar altimetry",
      "An inner-system silicate exoplanet tracked via radial-velocity observations",
    ];
    const stem = isNuclear
      ? `${nuclearContexts[variant % nuclearContexts.length]} has measured mass ${fmt3(massKg, "kg")} and diameter ${fmt3(diameterM, "m")}. Model the nucleus as a uniform sphere.`
      : `${planetContexts[variant % planetContexts.length]} has mass ${fmt3(massKg, "kg")} and mean diameter ${fmtGiven(diameterKm, 0)} km. Model the body as a uniform sphere.`;

    const requiredGivens: RequiredGivenSpec[] = [
      { name: "massKg", value: massKg, unit: "kg", source: "stem" },
      {
        name: isNuclear ? "diameterM" : "diameterKm",
        value: isNuclear ? diameterM : diameterKm,
        unit: isNuclear ? "m" : "km",
        source: "stem",
      },
    ];
    const plan: CandidateQuestionPlan = {
      targetSummary:
        "Calculate the mean density of a uniform sphere from its mass and diameter using scientific notation and sphere volume.",
      distractorStrategy: [
        "Using diameter instead of radius in the sphere volume formula.",
        "Using spherical surface area instead of sphere volume.",
        "Omitting the four-thirds prefactor in sphere volume.",
      ],
    };

    if (format === "mcq") {
      const distractors: NumericDistractor[] = [
        { value: rho / 8, rationale: "Substitutes diameter D instead of radius D/2 into (4/3)πr³, producing an 8× too-small density." },
        { value: rho * (4 / 3), rationale: "Omits the 4/3 factor in the sphere volume formula." },
        { value: rho / 2, rationale: "Divides sphere volume incorrectly by a factor of 2." },
      ];
      return {
        id,
        conceptId: "fluid-drag-buoyancy",
        templateArchetype: "annular-washer-drawn-wire-sphere-density",
        seed: seed + attempt * 997,
        syllabi: [...AC31_DENSITY_SYLLABI],
        format: "mcq",
        difficulty: "higher",
        domain: "pure-calculation",
        scenarioSpec: spec,
        hiddenQuantities: hidden,
        requiredGivens,
        questionPlan: plan,
        stem: `${stem} What is its mean density in kg m⁻³?`,
        options: buildNumericMcqOptions(rho, "kg m⁻³", distractors, seed + attempt),
        targetQuantityKey: "densityKgM3",
        workedSolution: `Radius r = D / 2 = ${fmt4(radiusM, "m")}. Volume V = (4/3)πr³ = ${fmt4(q.volumeM3 as number, "m³")}. Mean density ρ = m / V = ${fmt4(rho, "kg m⁻³")} ≈ ${fmt3(rho, "kg m⁻³")}.`,
        markScheme: [{ code: "A1", criterion: `Correct spherical density = ${fmt3(rho, "kg m⁻³")}.`, marks: 1 }],
        totalMarks: 1,
        generatorModel,
      };
    }

    const parts: StructuredQuestionPart[] = [
      {
        partId: "a",
        prompt: "State the definition of density.",
        marks: 1,
        targetMode: "qualitative",
        targetQuantityKey: "densityDefinitionConcept",
        expectedAnswer: `Density is ${String(q.densityDefinitionConcept)}.`,
        workingSteps: ["Define density as mass per unit volume."],
      },
      {
        partId: "b",
        prompt: isNuclear
          ? "Calculate the mean nuclear density in kg m⁻³."
          : "Calculate the mean density of the exoplanet in kg m⁻³.",
        marks: 3,
        targetQuantityKey: "densityKgM3",
        expectedAnswer: `${fmt3(rho, "kg m⁻³")}`,
        workingSteps: [
          `Radius r = D / 2 = ${fmt4(radiusM, "m")}.`,
          `Sphere volume V = (4/3)πr³ = ${fmt4(q.volumeM3 as number, "m³")}.`,
          `Density ρ = m / V = ${fmt4(rho, "kg m⁻³")} ≈ ${fmt3(rho, "kg m⁻³")}.`,
        ],
      },
    ];
    return {
      id,
      conceptId: "fluid-drag-buoyancy",
      templateArchetype: "annular-washer-drawn-wire-sphere-density",
      seed: seed + attempt * 997,
      syllabi: [...AC31_DENSITY_SYLLABI],
      format: "structured",
      difficulty: "higher",
      domain: "pure-calculation",
      scenarioSpec: spec,
      hiddenQuantities: hidden,
      requiredGivens,
      questionPlan: plan,
      stem,
      parts,
      workedSolution: `(a) Density is ${String(q.densityDefinitionConcept)}. (b) r = ${fmt4(radiusM, "m")}, V = ${fmt4(q.volumeM3 as number, "m³")}, giving ρ = ${fmt4(rho, "kg m⁻³")} ≈ ${fmt3(rho, "kg m⁻³")}.`,
      markScheme: [
        { code: "B1", partId: "a", criterion: "Defines density as mass per unit volume.", marks: 1 },
        { code: "M1", partId: "b", criterion: "Halves diameter to obtain radius r in metres.", marks: 1 },
        { code: "M1", partId: "b", criterion: "Applies V = (4/3)πr³ and ρ = m / V.", marks: 1 },
        { code: "A1", partId: "b", criterion: `Mean density = ${fmt3(rho, "kg m⁻³")}.`, marks: 1 },
      ],
      totalMarks: 4,
      generatorModel,
    };
  }
  throw new Error(`Failed to sample annular-washer-drawn-wire-sphere-density (${id})`);
}

/* ============================================================================
 * ARCHETYPE 10: hydrostatic-gauge-absolute-base-force (ncuk-ac3-1, 14 items)
 * ============================================================================ */

const HYDRO_CONTEXTS = [
  { site: "a deep-sea research submersible observation hatch", fluid: "seawater", rho: 1025 },
  { site: "a hydroelectric reservoir concrete floor valve", fluid: "freshwater", rho: 1000 },
  { site: "a coastal marine-aquarium acrylic viewing floor panel", fluid: "seawater", rho: 1030 },
  { site: "a refinery vertical crude-oil storage tank base", fluid: "refined oil", rho: 860 },
  { site: "a municipal water-tower cylindrical sump plate", fluid: "freshwater", rho: 1000 },
  { site: "an offshore drilling diving-bell deck hatch", fluid: "seawater", rho: 1025 },
  { site: "a geothermal brine-holding cistern floor", fluid: "concentrated brine", rho: 1140 },
  { site: "a shipyard dry-dock floodgate sill plate", fluid: "estuarine seawater", rho: 1020 },
  { site: "a biodiesel processing tank horizontal base", fluid: "biodiesel", rho: 880 },
  { site: "an underground stormwater retention chamber hatch", fluid: "freshwater", rho: 1000 },
  { site: "a tidal-lagoon turbine-housing inspection hatch", fluid: "seawater", rho: 1030 },
  { site: "a chemical-plant ethanol storage vat floor", fluid: "industrial ethanol", rho: 790 },
  { site: "a canal-lock maintenance floor gate", fluid: "freshwater", rho: 1000 },
  { site: "an autonomous ocean-glider pressure bulkhead", fluid: "seawater", rho: 1025 },
] as const;

function buildHydrostaticBaseForce(
  id: string,
  seed: number,
  variant: number,
  generatorModel: string,
): CandidateQuestionInput {
  const format: QuestionFormat = variant < 8 ? "mcq" : "structured";
  const ctx = HYDRO_CONTEXTS[variant % HYDRO_CONTEXTS.length];

  for (let attempt = 0; attempt < 40; attempt += 1) {
    const rng = createRng(seed + attempt * 997);
    const depthM = rng.step(4.5, 42.0, 1.5, 1);
    const areaM2 = rng.step(0.4, 3.4, 0.2, 1);
    const spec: Record<string, unknown> = {
      kind: "hydrostatic-pressure-base-force",
      mode: "tank-base-force",
      fluidDensityKgM3: ctx.rho,
      depthM,
      baseAreaM2: areaM2,
      atmosphericPressurePa: NCUK_ATMOSPHERIC_PRESSURE_PA,
      gravityMs2: NCUK_GRAVITY_MS2,
    };
    const q = solvePlugin("hydrostatic-pressure-base-force", spec);
    const pGauge = q.gaugePressurePa as number;
    const pAbs = q.absolutePressurePa as number;
    const pAbsKPa = q.absolutePressureKPa as number;
    const fTotal = q.totalBaseForceN as number;
    const fGauge = q.gaugeForceN as number;

    const hidden = [
      "gaugePressurePa",
      "gaugePressureKPa",
      "absolutePressurePa",
      "absolutePressureKPa",
      "gaugeForceN",
      "totalBaseForceN",
      "totalBaseForceKN",
    ];
    if (
      hasHiddenNumericCollision(q, hidden, [
        ctx.rho,
        depthM,
        areaM2,
        NCUK_ATMOSPHERIC_PRESSURE_PA,
        NCUK_GRAVITY_MS2,
      ])
    ) {
      continue;
    }

    const stem = `Consider ${ctx.site}, which has a flat horizontal surface of area ${fmtGiven(areaM2, 1)} m² situated at a depth of ${fmtGiven(depthM, 1)} m beneath the open surface of ${ctx.fluid} of density ${ctx.rho} kg m⁻³. Take atmospheric pressure at the free surface as 1.01 × 10⁵ Pa and g = 9.81 m s⁻².`;
    const requiredGivens: RequiredGivenSpec[] = [
      { name: "baseAreaM2", value: areaM2, unit: "m²", source: "stem" },
      { name: "depthM", value: depthM, unit: "m", source: "stem" },
      { name: "fluidDensityKgM3", value: ctx.rho, unit: "kg m⁻³", source: "stem" },
      { name: "atmosphericPressurePa", value: NCUK_ATMOSPHERIC_PRESSURE_PA, unit: "Pa", source: "stem" },
      { name: "gravityMs2", value: NCUK_GRAVITY_MS2, unit: "m s⁻²", source: "stem" },
    ];
    const plan: CandidateQuestionPlan = {
      targetSummary:
        "Compute hydrostatic gauge pressure, absolute fluid pressure including atmospheric pressure, and total downward force on a submerged horizontal surface.",
      distractorStrategy: [
        "Omitting atmospheric pressure when total absolute pressure or total force is requested.",
        "Dividing pressure by area instead of multiplying to calculate force.",
        "Forgetting to multiply by gravitational field strength g.",
      ],
    };

    if (format === "mcq") {
      const modePick = variant % 3;
      const targetKey =
        modePick === 0
          ? "absolutePressureKPa"
          : modePick === 1
            ? "totalBaseForceN"
            : "gaugePressurePa";
      const targetVal =
        modePick === 0 ? pAbsKPa : modePick === 1 ? fTotal : pGauge;
      const unit = modePick === 0 ? "kPa" : modePick === 1 ? "N" : "Pa";
      const qPrompt =
        modePick === 0
          ? "What is the total absolute pressure acting on the submerged surface in kPa?"
          : modePick === 1
            ? "What is the total downward force exerted by the fluid and atmosphere on this surface?"
            : "What is the hydrostatic pressure difference Δp due solely to the overlying liquid column?";

      const distractors: NumericDistractor[] =
        modePick === 0
          ? [
              { value: pGauge / 1000, rationale: "Calculates only gauge pressure ρgh and omits atmospheric pressure." },
              { value: Math.abs(pGauge - NCUK_ATMOSPHERIC_PRESSURE_PA) / 1000, rationale: "Subtracts atmospheric pressure instead of adding it." },
              { value: (ctx.rho * depthM) / 1000 + 101, rationale: "Forgets to multiply by g = 9.81 m s⁻²." },
            ]
          : modePick === 1
            ? [
                { value: fGauge, rationale: "Uses gauge pressure instead of absolute pressure, omitting atmospheric force." },
                { value: pAbs / areaM2, rationale: "Divides absolute pressure by area instead of multiplying F = p A." },
                { value: ctx.rho * depthM * areaM2, rationale: "Computes fluid mass instead of total downward force." },
              ]
            : [
                { value: pAbs, rationale: "Adds atmospheric pressure even though only the hydrostatic difference Δp = ρgh was asked." },
                { value: ctx.rho * depthM, rationale: "Forgets to include g = 9.81 m s⁻²." },
                { value: pGauge * areaM2, rationale: "Calculates gauge force instead of gauge pressure." },
              ];

      return {
        id,
        conceptId: "fluid-drag-buoyancy",
        templateArchetype: "hydrostatic-gauge-absolute-base-force",
        seed: seed + attempt * 997,
        syllabi: [...AC31_NCUK_SYLLABI],
        format: "mcq",
        difficulty: difficultyForVariant(variant),
        domain: "pure-calculation",
        scenarioSpec: spec,
        hiddenQuantities: hidden,
        requiredGivens,
        questionPlan: plan,
        stem: `${stem} ${qPrompt}`,
        options: buildNumericMcqOptions(targetVal, unit, distractors, seed + attempt),
        targetQuantityKey: targetKey,
        workedSolution: `Hydrostatic gauge pressure Δp = ρ g h = ${ctx.rho} × 9.81 × ${fmtGiven(depthM, 1)} = ${fmt4(pGauge, "Pa")} ≈ ${fmt3(pGauge, "Pa")}. Absolute pressure p_abs = p_atm + Δp = 1.01 × 10⁵ + ${fmt4(pGauge)} = ${fmt4(pAbs, "Pa")} = ${fmt4(pAbsKPa, "kPa")} ≈ ${fmt3(pAbsKPa, "kPa")}. Total force F = p_abs A = ${fmt4(pAbs)} × ${fmtGiven(areaM2, 1)} = ${fmt4(fTotal, "N")} ≈ ${fmt3(fTotal, "N")}.`,
        markScheme: [
          { code: "A1", criterion: `Correct verified value = ${fmt3(targetVal, unit)}.`, marks: 1 },
        ],
        totalMarks: 1,
        generatorModel,
      };
    }

    // 6m Structured: (a) Δp [2m], (b) p_abs [2m], (c) total force F = p_abs A [2m]
    const parts: StructuredQuestionPart[] = [
      {
        partId: "a",
        prompt: "Calculate the hydrostatic pressure increase Δp due to the column of liquid alone.",
        marks: 2,
        targetQuantityKey: "gaugePressurePa",
        expectedAnswer: `${fmt3(pGauge, "Pa")}`,
        workingSteps: [
          `Δp = ρ g h = ${ctx.rho} × 9.81 × ${fmtGiven(depthM, 1)} = ${fmt4(pGauge, "Pa")} ≈ ${fmt3(pGauge, "Pa")}.`,
        ],
      },
      {
        partId: "b",
        prompt: "Determine the total absolute pressure acting at this depth.",
        marks: 2,
        dependsOnPartIds: ["a"],
        targetQuantityKey: "absolutePressurePa",
        expectedAnswer: `${fmt3(pAbs, "Pa")}`,
        workingSteps: [
          `p_abs = p_atm + Δp = 1.01 × 10⁵ + ${fmt4(pGauge)} = ${fmt4(pAbs, "Pa")} ≈ ${fmt3(pAbs, "Pa")}.`,
        ],
      },
      {
        partId: "c",
        prompt: "Calculate the total downward force exerted on the submerged surface.",
        marks: 2,
        dependsOnPartIds: ["b"],
        targetQuantityKey: "totalBaseForceN",
        expectedAnswer: `${fmt3(fTotal, "N")}`,
        workingSteps: [
          `F = p_abs A = ${fmt4(pAbs)} × ${fmtGiven(areaM2, 1)} = ${fmt4(fTotal, "N")} ≈ ${fmt3(fTotal, "N")}.`,
        ],
      },
    ];
    return {
      id,
      conceptId: "fluid-drag-buoyancy",
      templateArchetype: "hydrostatic-gauge-absolute-base-force",
      seed: seed + attempt * 997,
      syllabi: [...AC31_NCUK_SYLLABI],
      format: "structured",
      difficulty: difficultyForVariant(variant),
      domain: "pure-calculation",
      scenarioSpec: spec,
      hiddenQuantities: hidden,
      requiredGivens,
      questionPlan: plan,
      stem,
      parts,
      workedSolution: `(a) Δp = ρgh = ${fmt4(pGauge, "Pa")} ≈ ${fmt3(pGauge, "Pa")}. (b) p_abs = 1.01 × 10⁵ + Δp = ${fmt4(pAbs, "Pa")} ≈ ${fmt3(pAbs, "Pa")}. (c) F = p_abs A = ${fmt4(fTotal, "N")} ≈ ${fmt3(fTotal, "N")}.`,
      markScheme: [
        { code: "M1", partId: "a", criterion: "Applies Δp = ρgh with g = 9.81 m s⁻².", marks: 1 },
        { code: "A1", partId: "a", criterion: `Δp = ${fmt3(pGauge, "Pa")}.`, marks: 1 },
        { code: "M1", partId: "b", criterion: "Adds atmospheric pressure 1.01 × 10⁵ Pa to Δp.", marks: 1 },
        { code: "A1", partId: "b", criterion: `p_abs = ${fmt3(pAbs, "Pa")}.`, marks: 1 },
        { code: "M1", partId: "c", criterion: "Uses F = p_abs A.", marks: 1 },
        { code: "A1", partId: "c", criterion: `F = ${fmt3(fTotal, "N")}.`, marks: 1 },
      ],
      totalMarks: 6,
      generatorModel,
    };
  }
  throw new Error(`Failed to sample hydrostatic-gauge-absolute-base-force (${id})`);
}

/* ============================================================================
 * ARCHETYPE 11: archimedes-upthrust-and-solution-density (ncuk-ac3-1, 14 items)
 * ============================================================================ */

function buildArchimedesAndSolution(
  id: string,
  seed: number,
  variant: number,
  generatorModel: string,
): CandidateQuestionInput {
  const format: QuestionFormat = variant < 8 ? "mcq" : "structured";
  const isSolution = variant % 3 === 2;

  for (let attempt = 0; attempt < 40; attempt += 1) {
    const rng = createRng(seed + attempt * 997);

    if (isSolution) {
      const solutePct = rng.step(2.5, 14.0, 0.5, 1);
      const rhoSol = Math.round(1000 + solutePct * 7.5);
      const targetSoluteKg = rng.step(0.6, 4.2, 0.3, 1);
      const spec: Record<string, unknown> = {
        kind: "hydrostatic-pressure-base-force",
        mode: "solution-concentration",
        soluteMassPercent: solutePct,
        solutionDensityKgM3: rhoSol,
        targetSoluteMassKg: targetSoluteKg,
      };
      const q = solvePlugin("hydrostatic-pressure-base-force", spec);
      const solMassKg = q.solutionMassKg as number;
      const solVolL = q.solutionVolumeL as number;
      const hidden = ["solutionMassKg", "solutionVolumeM3", "solutionVolumeL"];
      if (hasHiddenNumericCollision(q, hidden, [solutePct, rhoSol, targetSoluteKg])) {
        continue;
      }

      const solutes = [
        { name: "dissolved sea salt", liquid: "coastal seawater" },
        { name: "dissolved sodium chloride", liquid: "industrial brine" },
        { name: "dissolved magnesium sulfate", liquid: "mineral spa solution" },
        { name: "dissolved potassium nitrate", liquid: "hydroponic nutrient solution" },
      ];
      const sol = solutes[variant % solutes.length];
      const stem = `A sample of ${sol.liquid} has density ${rhoSol} kg m⁻³ and contains ${fmtGiven(solutePct, 1)}% ${sol.name} by mass. A desalination engineer wishes to extract ${fmtGiven(targetSoluteKg, 1)} kg of pure solid salt by evaporating this liquid.`;

      const requiredGivens: RequiredGivenSpec[] = [
        { name: "solutionDensityKgM3", value: rhoSol, unit: "kg m⁻³", source: "stem" },
        { name: "soluteMassPercent", value: solutePct, unit: "%", source: "stem" },
        { name: "targetSoluteMassKg", value: targetSoluteKg, unit: "kg", source: "stem" },
      ];
      const plan: CandidateQuestionPlan = {
        targetSummary:
          "Use mass percentage and bulk solution density to determine the required solution mass and volume in litres.",
        distractorStrategy: [
          "Multiplying by the percentage instead of dividing to find solution mass.",
          "Forgetting to convert cubic metres into litres.",
          "Multiplying solution mass by density instead of dividing.",
        ],
      };

      if (format === "mcq") {
        const distractors: NumericDistractor[] = [
          { value: (targetSoluteKg * (solutePct / 100) / rhoSol) * 1000, rationale: "Multiplies by the mass fraction instead of dividing by it." },
          { value: solMassKg / rhoSol, rationale: "Leaves the volume in m³ instead of converting to litres (× 1000)." },
          { value: (targetSoluteKg / rhoSol) * 1000, rationale: "Ignores the solute mass percentage completely." },
        ];
        return {
          id,
          conceptId: "fluid-drag-buoyancy",
          templateArchetype: "archimedes-upthrust-and-solution-density",
          seed: seed + attempt * 997,
          syllabi: [...AC31_NCUK_SYLLABI],
          format: "mcq",
          difficulty: difficultyForVariant(variant),
          domain: "pure-calculation",
          scenarioSpec: spec,
          hiddenQuantities: hidden,
          requiredGivens,
          questionPlan: plan,
          stem: `${stem} What volume of ${sol.liquid}, in litres, must be evaporated?`,
          options: buildNumericMcqOptions(solVolL, "L", distractors, seed + attempt),
          targetQuantityKey: "solutionVolumeL",
          workedSolution: `Required solution mass m_sol = ${fmtGiven(targetSoluteKg, 1)} / (${fmtGiven(solutePct, 1)} / 100) = ${fmt4(solMassKg, "kg")}. Volume V = m_sol / ρ = ${fmt4(solMassKg)} / ${rhoSol} = ${fmt4(q.solutionVolumeM3 as number, "m³")} = ${fmt4(solVolL, "L")} ≈ ${fmt3(solVolL, "L")}.`,
          markScheme: [{ code: "A1", criterion: `Correct solution volume = ${fmt3(solVolL, "L")}.`, marks: 1 }],
          totalMarks: 1,
          generatorModel,
        };
      }

      const parts: StructuredQuestionPart[] = [
        {
          partId: "a",
          prompt: `Calculate the total mass of ${sol.liquid} required to yield ${fmtGiven(targetSoluteKg, 1)} kg of solid solute.`,
          marks: 2,
          targetQuantityKey: "solutionMassKg",
          expectedAnswer: `${fmt3(solMassKg, "kg")}`,
          workingSteps: [
            `m_sol = ${fmtGiven(targetSoluteKg, 1)} / ${fmt4(solutePct / 100)} = ${fmt4(solMassKg, "kg")} ≈ ${fmt3(solMassKg, "kg")}.`,
          ],
        },
        {
          partId: "b",
          prompt: `Hence calculate the volume of ${sol.liquid} required in litres (1 m³ = 1000 L).`,
          marks: 2,
          dependsOnPartIds: ["a"],
          targetQuantityKey: "solutionVolumeL",
          expectedAnswer: `${fmt3(solVolL, "L")}`,
          workingSteps: [
            `V = m_sol / ρ = ${fmt4(solMassKg)} / ${rhoSol} = ${fmt4(q.solutionVolumeM3 as number, "m³")}.`,
            `V in litres = ${fmt4(q.solutionVolumeM3 as number)} × 1000 = ${fmt4(solVolL, "L")} ≈ ${fmt3(solVolL, "L")}.`,
          ],
        },
      ];
      return {
        id,
        conceptId: "fluid-drag-buoyancy",
        templateArchetype: "archimedes-upthrust-and-solution-density",
        seed: seed + attempt * 997,
        syllabi: [...AC31_NCUK_SYLLABI],
        format: "structured",
        difficulty: difficultyForVariant(variant),
        domain: "pure-calculation",
        scenarioSpec: spec,
        hiddenQuantities: hidden,
        requiredGivens,
        questionPlan: plan,
        stem,
        parts,
        workedSolution: `(a) m_sol = ${fmt4(solMassKg, "kg")} ≈ ${fmt3(solMassKg, "kg")}. (b) V = ${fmt4(q.solutionVolumeM3 as number, "m³")} = ${fmt4(solVolL, "L")} ≈ ${fmt3(solVolL, "L")}.`,
        markScheme: [
          { code: "M1", partId: "a", criterion: "Divides solute mass by decimal mass fraction.", marks: 1 },
          { code: "A1", partId: "a", criterion: `m_sol = ${fmt3(solMassKg, "kg")}.`, marks: 1 },
          { code: "M1", partId: "b", criterion: "Computes V = m_sol / ρ and multiplies by 1000 for litres.", marks: 1 },
          { code: "A1", partId: "b", criterion: `V = ${fmt3(solVolL, "L")}.`, marks: 1 },
        ],
        totalMarks: 4,
        generatorModel,
      };
    }

    // Archimedes upthrust & apparent submerged weight / floating fraction
    const floating = variant === 1 || variant === 4;
    const fluidRho = variant % 2 === 0 ? 1025 : 1000;
    const fluidName = fluidRho === 1025 ? "seawater" : "freshwater";
    const objMassKg = rng.step(4.5, 24.0, 1.5, 1);
    const objRho = floating
      ? rng.step(520, 880, 40, 0)
      : rng.pick([2700, 4510, 7870, 8930]);
    const objMat = floating
      ? "seasoned oak timber"
      : objRho === 2700
        ? "solid aluminium"
        : objRho === 4510
          ? "machined titanium"
          : objRho === 7870
            ? "cast steel"
            : "solid copper";

    const spec: Record<string, unknown> = {
      kind: "hydrostatic-pressure-base-force",
      mode: "archimedes-buoyancy",
      fluidDensityKgM3: fluidRho,
      objectMassKg: objMassKg,
      objectDensityKgM3: objRho,
      gravityMs2: NCUK_GRAVITY_MS2,
    };
    const q = solvePlugin("hydrostatic-pressure-base-force", spec);
    const upthrustN = q.upthrustN as number;
    const appWeightN = q.apparentWeightN as number;
    const floatPct = q.floatingSubmergedPercent as number;
    const archConcept = String(q.archimedesPrincipleConcept);

    const hidden = [
      "upthrustN",
      "apparentWeightN",
      "floatingSubmergedFraction",
      "floatingSubmergedPercent",
      "objectVolumeM3",
    ];
    if (hasHiddenNumericCollision(q, hidden, [fluidRho, objMassKg, objRho, NCUK_GRAVITY_MS2])) {
      continue;
    }

    const stem = floating
      ? `A uniform block of ${objMat} (density ${objRho} kg m⁻³) of mass ${fmtGiven(objMassKg, 1)} kg floats freely at rest in calm ${fluidName} of density ${fluidRho} kg m⁻³ (take g = 9.81 m s⁻²).`
      : `A solid ${objMat} ballast block (density ${objRho} kg m⁻³) of mass ${fmtGiven(objMassKg, 1)} kg is suspended from a calibrated spring balance and lowered until it is completely submerged in ${fluidName} of density ${fluidRho} kg m⁻³ without touching the tank floor (take g = 9.81 m s⁻²).`;

    const requiredGivens: RequiredGivenSpec[] = [
      { name: "objectDensityKgM3", value: objRho, unit: "kg m⁻³", source: "stem" },
      { name: "objectMassKg", value: objMassKg, unit: "kg", source: "stem" },
      { name: "fluidDensityKgM3", value: fluidRho, unit: "kg m⁻³", source: "stem" },
      { name: "gravityMs2", value: NCUK_GRAVITY_MS2, unit: "m s⁻²", source: "stem" },
    ];
    const plan: CandidateQuestionPlan = {
      targetSummary:
        "Apply Archimedes principle to compute displaced-fluid upthrust, apparent submerged weight, or floating submerged percentage.",
      distractorStrategy: [
        "Using object density instead of fluid density when calculating upthrust.",
        "Adding upthrust to weight instead of subtracting to obtain spring-balance tension.",
        "Computing the emerged fraction instead of the submerged fraction.",
      ],
    };

    if (format === "mcq") {
      if (floating) {
        const distractors: NumericDistractor[] = [
          { value: 100 - floatPct, rationale: "Calculates the percentage protruding above the waterline rather than submerged." },
          { value: (fluidRho / objRho) * 100, rationale: "Inverts the density ratio ρ_fluid / ρ_obj." },
          { value: floatPct / 2, rationale: "Halves the Archimedes density ratio." },
        ];
        return {
          id,
          conceptId: "fluid-drag-buoyancy",
          templateArchetype: "archimedes-upthrust-and-solution-density",
          seed: seed + attempt * 997,
          syllabi: [...AC31_NCUK_SYLLABI],
          format: "mcq",
          difficulty: difficultyForVariant(variant),
          domain: "pure-calculation",
          scenarioSpec: spec,
          hiddenQuantities: hidden,
          requiredGivens,
          questionPlan: plan,
          stem: `${stem} What percentage of the block's total volume lies submerged below the surface?`,
          options: buildNumericMcqOptions(floatPct, "%", distractors, seed + attempt),
          targetQuantityKey: "floatingSubmergedPercent",
          workedSolution: `Floating balance: ρ_fluid V_sub g = ρ_obj V g ⇒ V_sub / V = ρ_obj / ρ_fluid = ${objRho} / ${fluidRho} = ${fmt4(floatPct / 100)} = ${fmt4(floatPct, "%")} ≈ ${fmt3(floatPct, "%")}.`,
          markScheme: [{ code: "A1", criterion: `Submerged percentage = ${fmt3(floatPct, "%")}.`, marks: 1 }],
          totalMarks: 1,
          generatorModel,
        };
      }

      const askApparent = variant % 2 === 1;
      const targetKey = askApparent ? "apparentWeightN" : "upthrustN";
      const targetVal = askApparent ? appWeightN : upthrustN;
      const distractors: NumericDistractor[] = askApparent
        ? [
            { value: (q.objectWeightN as number) + upthrustN, rationale: "Adds upthrust to weight instead of subtracting it." },
            { value: q.objectWeightN as number, rationale: "Reports weight in air, ignoring buoyancy." },
            { value: upthrustN, rationale: "Reports the upthrust rather than the spring-balance reading." },
          ]
        : [
            { value: q.objectWeightN as number, rationale: "Uses object density instead of fluid density, recovering the object's own weight." },
            { value: upthrustN / NCUK_GRAVITY_MS2, rationale: "Computes displaced mass in kg without multiplying by g = 9.81 m s⁻²." },
            { value: appWeightN, rationale: "Reports apparent weight instead of upthrust." },
          ];
      return {
        id,
        conceptId: "fluid-drag-buoyancy",
        templateArchetype: "archimedes-upthrust-and-solution-density",
        seed: seed + attempt * 997,
        syllabi: [...AC31_NCUK_SYLLABI],
        format: "mcq",
        difficulty: difficultyForVariant(variant),
        domain: "pure-calculation",
        scenarioSpec: spec,
        hiddenQuantities: hidden,
        requiredGivens,
        questionPlan: plan,
        stem: `${stem} What is ${askApparent ? "the reading on the spring balance (apparent submerged weight)" : "the upward buoyancy force (upthrust) acting on the submerged block"}?`,
        options: buildNumericMcqOptions(targetVal, "N", distractors, seed + attempt),
        targetQuantityKey: targetKey,
        workedSolution: `Block volume V = m / ρ_obj = ${fmtGiven(objMassKg, 1)} / ${objRho} = ${fmt4(q.objectVolumeM3 as number, "m³")}. Upthrust F_B = ρ_fluid V g = ${fluidRho} × ${fmt4(q.objectVolumeM3 as number)} × 9.81 = ${fmt4(upthrustN, "N")} ≈ ${fmt3(upthrustN, "N")}. Apparent weight W_app = m g − F_B = ${fmt4(q.objectWeightN as number)} − ${fmt4(upthrustN)} = ${fmt4(appWeightN, "N")} ≈ ${fmt3(appWeightN, "N")}.`,
        markScheme: [{ code: "A1", criterion: `Correct value = ${fmt3(targetVal, "N")}.`, marks: 1 }],
        totalMarks: 1,
        generatorModel,
      };
    }

    // 5m Structured: (a) [1m qual] Archimedes' principle, (b) [2m] upthrust, (c) [2m] apparent submerged weight
    const parts: StructuredQuestionPart[] = [
      {
        partId: "a",
        prompt: "State Archimedes' principle.",
        marks: 1,
        targetMode: "qualitative",
        targetQuantityKey: "archimedesPrincipleConcept",
        expectedAnswer: `Archimedes' principle states that ${archConcept}.`,
        workingSteps: ["State that upthrust equals the weight of fluid displaced by the immersed body."],
      },
      {
        partId: "b",
        prompt: "Calculate the upthrust acting on the completely submerged block.",
        marks: 2,
        targetQuantityKey: "upthrustN",
        expectedAnswer: `${fmt3(upthrustN, "N")}`,
        workingSteps: [
          `Volume V = ${fmtGiven(objMassKg, 1)} / ${objRho} = ${fmt4(q.objectVolumeM3 as number, "m³")}.`,
          `F_B = ρ_fluid V g = ${fluidRho} × ${fmt4(q.objectVolumeM3 as number)} × 9.81 = ${fmt4(upthrustN, "N")} ≈ ${fmt3(upthrustN, "N")}.`,
        ],
      },
      {
        partId: "c",
        prompt: "Hence calculate the reading on the spring balance while the block remains fully submerged.",
        marks: 2,
        dependsOnPartIds: ["b"],
        targetQuantityKey: "apparentWeightN",
        expectedAnswer: `${fmt3(appWeightN, "N")}`,
        workingSteps: [
          `Weight in air W = ${fmtGiven(objMassKg, 1)} × 9.81 = ${fmt4(q.objectWeightN as number, "N")}.`,
          `Spring balance tension = W − F_B = ${fmt4(appWeightN, "N")} ≈ ${fmt3(appWeightN, "N")}.`,
        ],
      },
    ];
    return {
      id,
      conceptId: "fluid-drag-buoyancy",
      templateArchetype: "archimedes-upthrust-and-solution-density",
      seed: seed + attempt * 997,
      syllabi: [...AC31_NCUK_SYLLABI],
      format: "structured",
      difficulty: difficultyForVariant(variant),
      domain: "pure-calculation",
      scenarioSpec: spec,
      hiddenQuantities: hidden,
      requiredGivens,
      questionPlan: plan,
      stem,
      parts,
      workedSolution: `(a) ${archConcept}. (b) V = ${fmt4(q.objectVolumeM3 as number, "m³")} ⇒ F_B = ${fmt4(upthrustN, "N")} ≈ ${fmt3(upthrustN, "N")}. (c) W_app = W − F_B = ${fmt4(appWeightN, "N")} ≈ ${fmt3(appWeightN, "N")}.`,
      markScheme: [
        { code: "B1", partId: "a", criterion: "Upthrust equals weight of displaced fluid.", marks: 1 },
        { code: "M1", partId: "b", criterion: "Finds V = m / ρ_obj and applies F_B = ρ_fluid V g.", marks: 1 },
        { code: "A1", partId: "b", criterion: `F_B = ${fmt3(upthrustN, "N")}.`, marks: 1 },
        { code: "M1", partId: "c", criterion: "Subtracts upthrust from weight in air.", marks: 1 },
        { code: "A1", partId: "c", criterion: `Apparent weight = ${fmt3(appWeightN, "N")}.`, marks: 1 },
      ],
      totalMarks: 5,
      generatorModel,
    };
  }
  throw new Error(`Failed to sample archimedes-upthrust-and-solution-density (${id})`);
}

/* ============================================================================
 * ARCHETYPE 12: layered-tank-and-utube-hydrostatics (ncuk-ac3-1, thermal, 14 items)
 * ============================================================================ */

const TANK_SCENES = [
  { upper: "mineral oil", r1: 840, lower: "seawater", r2: 1030 },
  { upper: "paraffin oil", r1: 800, lower: "freshwater", r2: 1000 },
  { upper: "vegetable oil", r1: 910, lower: "concentrated brine", r2: 1160 },
  { upper: "diesel fuel", r1: 850, lower: "freshwater", r2: 1000 },
  { upper: "turpentine", r1: 870, lower: "saline water", r2: 1050 },
  { upper: "silicone oil", r1: 930, lower: "glycerol", r2: 1260 },
  { upper: "kerosene", r1: 810, lower: "seawater", r2: 1025 },
] as const;

function buildLayeredTankAndUtube(
  id: string,
  seed: number,
  variant: number,
  generatorModel: string,
): CandidateQuestionInput {
  const format: QuestionFormat = variant < 8 ? "mcq" : "structured";
  const isUtube = variant % 2 === 1;
  const scene = TANK_SCENES[variant % TANK_SCENES.length];

  for (let attempt = 0; attempt < 40; attempt += 1) {
    const rng = createRng(seed + attempt * 997);

    if (!isUtube) {
      const h1 = rng.step(0.6, 1.8, 0.2, 1);
      const h2 = rng.step(1.0, 2.8, 0.2, 1);
      const baseArea = rng.step(1.2, 3.6, 0.2, 1);
      const spec: Record<string, unknown> = {
        kind: "hydrostatic-tank-brownian",
        mode: "layered-tank",
        upperDensityKgM3: scene.r1,
        lowerDensityKgM3: scene.r2,
        upperDepthM: h1,
        lowerDepthM: h2,
        baseAreaM2: baseArea,
        atmosphericPressurePa: NCUK_ATMOSPHERIC_PRESSURE_PA,
        gravityMs2: NCUK_GRAVITY_MS2,
      };
      const q = solvePlugin("hydrostatic-tank-brownian", spec);
      const p1 = q.upperLayerPressurePa as number;
      const pGauge = q.totalGaugePressurePa as number;
      const pBot = q.bottomAbsolutePressurePa as number;
      const pBotKPa = q.bottomAbsolutePressureKPa as number;
      const fBot = q.totalBaseForceN as number;

      const hidden = [
        "upperLayerPressurePa",
        "lowerLayerPressurePa",
        "totalGaugePressurePa",
        "interfaceAbsolutePressurePa",
        "bottomAbsolutePressurePa",
        "bottomAbsolutePressureKPa",
        "totalBaseForceN",
        "totalBaseForceKN",
      ];
      if (
        hasHiddenNumericCollision(q, hidden, [
          scene.r1,
          scene.r2,
          h1,
          h2,
          baseArea,
          NCUK_ATMOSPHERIC_PRESSURE_PA,
          NCUK_GRAVITY_MS2,
        ])
      ) {
        continue;
      }

      const stem = `As shown in the cutaway diagram, an open rectangular storage tank with horizontal base area ${fmtGiven(baseArea, 1)} m² holds two immiscible liquids at rest: an upper layer of ${scene.upper} (ρ₁ = ${scene.r1} kg m⁻³, depth h₁ = ${fmtGiven(h1, 1)} m) resting above a lower layer of ${scene.lower} (ρ₂ = ${scene.r2} kg m⁻³, depth h₂ = ${fmtGiven(h2, 1)} m). Atmospheric pressure at the open top surface is 1.01 × 10⁵ Pa and g = 9.81 m s⁻².`;
      const requiredGivens: RequiredGivenSpec[] = [
        { name: "baseAreaM2", value: baseArea, unit: "m²", source: "stem" },
        { name: "upperDensityKgM3", value: scene.r1, unit: "kg m⁻³", source: "either" },
        { name: "lowerDensityKgM3", value: scene.r2, unit: "kg m⁻³", source: "either" },
        { name: "upperDepthM", value: h1, unit: "m", source: "either" },
        { name: "lowerDepthM", value: h2, unit: "m", source: "either" },
        { name: "atmosphericPressurePa", value: NCUK_ATMOSPHERIC_PRESSURE_PA, unit: "Pa", source: "stem" },
        { name: "gravityMs2", value: NCUK_GRAVITY_MS2, unit: "m s⁻²", source: "stem" },
      ];
      const plan: CandidateQuestionPlan = {
        targetSummary:
          "Sum hydrostatic contributions across two immiscible fluid layers to compute interface pressure, absolute bottom pressure, and total base force.",
        distractorStrategy: [
          "Applying the lower fluid density across the entire combined depth.",
          "Omitting atmospheric pressure when calculating absolute bottom pressure.",
          "Using only the lower layer depth and ignoring the upper oil layer.",
        ],
      };

      if (format === "mcq") {
        const askKPa = variant % 4 === 0;
        const targetKey = askKPa ? "bottomAbsolutePressureKPa" : "totalGaugePressurePa";
        const targetVal = askKPa ? pBotKPa : pGauge;
        const unit = askKPa ? "kPa" : "Pa";
        const distractors: NumericDistractor[] = askKPa
          ? [
              { value: pGauge / 1000, rationale: "Omits atmospheric pressure (101 kPa) when finding absolute bottom pressure." },
              { value: (NCUK_ATMOSPHERIC_PRESSURE_PA + scene.r2 * NCUK_GRAVITY_MS2 * (h1 + h2)) / 1000, rationale: "Uses the lower liquid density ρ₂ for both layers." },
              { value: (NCUK_ATMOSPHERIC_PRESSURE_PA + (q.lowerLayerPressurePa as number)) / 1000, rationale: "Ignores the hydrostatic pressure contribution of the upper oil layer." },
            ]
          : [
              { value: scene.r2 * NCUK_GRAVITY_MS2 * (h1 + h2), rationale: "Applies the lower density ρ₂ across the combined depth h₁ + h₂." },
              { value: q.lowerLayerPressurePa as number, rationale: "Omits the upper oil layer contribution ρ₁gh₁." },
              { value: pBot, rationale: "Includes atmospheric pressure even though only the liquid gauge pressure was asked." },
            ];
        return {
          id,
          conceptId: "fluid-drag-buoyancy",
          templateArchetype: "layered-tank-and-utube-hydrostatics",
          seed: seed + attempt * 997,
          syllabi: [...AC31_NCUK_SYLLABI],
          format: "mcq",
          difficulty: difficultyForVariant(variant),
          domain: "thermal",
          scenarioSpec: spec,
          hiddenQuantities: hidden,
          requiredGivens,
          questionPlan: plan,
          stem: `${stem} What is ${askKPa ? "the total absolute pressure at point Y on the tank base in kPa" : "the total hydrostatic gauge pressure at point Y due to the two liquid layers combined"}?`,
          options: buildNumericMcqOptions(targetVal, unit, distractors, seed + attempt),
          targetQuantityKey: targetKey,
          workedSolution: `Upper layer Δp₁ = ${scene.r1} × 9.81 × ${fmtGiven(h1, 1)} = ${fmt4(p1, "Pa")}. Lower layer Δp₂ = ${scene.r2} × 9.81 × ${fmtGiven(h2, 1)} = ${fmt4(q.lowerLayerPressurePa as number, "Pa")}. Total liquid gauge pressure Δp = ${fmt4(pGauge, "Pa")} ≈ ${fmt3(pGauge, "Pa")}. Absolute bottom pressure p_Y = 1.01 × 10⁵ + ${fmt4(pGauge)} = ${fmt4(pBot, "Pa")} = ${fmt4(pBotKPa, "kPa")} ≈ ${fmt3(pBotKPa, "kPa")}.`,
          markScheme: [{ code: "A1", criterion: `Correct verified value = ${fmt3(targetVal, unit)}.`, marks: 1 }],
          totalMarks: 1,
          generatorModel,
        };
      }

      // 6m Structured
      const parts: StructuredQuestionPart[] = [
        {
          partId: "a",
          prompt: "Calculate the hydrostatic pressure increase across the upper liquid layer between the free surface and interface X.",
          marks: 2,
          targetQuantityKey: "upperLayerPressurePa",
          expectedAnswer: `${fmt3(p1, "Pa")}`,
          workingSteps: [
            `Δp₁ = ρ₁ g h₁ = ${scene.r1} × 9.81 × ${fmtGiven(h1, 1)} = ${fmt4(p1, "Pa")} ≈ ${fmt3(p1, "Pa")}.`,
          ],
        },
        {
          partId: "b",
          prompt: "Calculate the total absolute pressure at point Y on the base of the tank.",
          marks: 2,
          dependsOnPartIds: ["a"],
          targetQuantityKey: "bottomAbsolutePressurePa",
          expectedAnswer: `${fmt3(pBot, "Pa")}`,
          workingSteps: [
            `Δp₂ = ρ₂ g h₂ = ${scene.r2} × 9.81 × ${fmtGiven(h2, 1)} = ${fmt4(q.lowerLayerPressurePa as number, "Pa")}.`,
            `p_Y = 1.01 × 10⁵ + ${fmt4(p1)} + ${fmt4(q.lowerLayerPressurePa as number)} = ${fmt4(pBot, "Pa")} ≈ ${fmt3(pBot, "Pa")}.`,
          ],
        },
        {
          partId: "c",
          prompt: "Determine the total downward force acting on the horizontal base of the tank.",
          marks: 2,
          dependsOnPartIds: ["b"],
          targetQuantityKey: "totalBaseForceN",
          expectedAnswer: `${fmt3(fBot, "N")}`,
          workingSteps: [
            `F = p_Y A = ${fmt4(pBot)} × ${fmtGiven(baseArea, 1)} = ${fmt4(fBot, "N")} ≈ ${fmt3(fBot, "N")}.`,
          ],
        },
      ];
      return {
        id,
        conceptId: "fluid-drag-buoyancy",
        templateArchetype: "layered-tank-and-utube-hydrostatics",
        seed: seed + attempt * 997,
        syllabi: [...AC31_NCUK_SYLLABI],
        format: "structured",
        difficulty: difficultyForVariant(variant),
        domain: "thermal",
        scenarioSpec: spec,
        hiddenQuantities: hidden,
        requiredGivens,
        questionPlan: plan,
        stem,
        parts,
        workedSolution: `(a) Δp₁ = ${fmt4(p1, "Pa")} ≈ ${fmt3(p1, "Pa")}. (b) p_Y = ${fmt4(pBot, "Pa")} ≈ ${fmt3(pBot, "Pa")}. (c) F = p_Y A = ${fmt4(fBot, "N")} ≈ ${fmt3(fBot, "N")}.`,
        markScheme: [
          { code: "M1", partId: "a", criterion: "Applies Δp₁ = ρ₁gh₁.", marks: 1 },
          { code: "A1", partId: "a", criterion: `Δp₁ = ${fmt3(p1, "Pa")}.`, marks: 1 },
          { code: "M1", partId: "b", criterion: "Sums p_atm + ρ₁gh₁ + ρ₂gh₂.", marks: 1 },
          { code: "A1", partId: "b", criterion: `p_Y = ${fmt3(pBot, "Pa")}.`, marks: 1 },
          { code: "M1", partId: "c", criterion: "Applies F = p_Y A.", marks: 1 },
          { code: "A1", partId: "c", criterion: `F = ${fmt3(fBot, "N")}.`, marks: 1 },
        ],
        totalMarks: 6,
        generatorModel,
      };
    }

    // Open U-tube manometer balancing two immiscible columns!
    const hLight = rng.step(0.24, 0.44, 0.02, 2);
    const hDense = Number((hLight * rng.step(0.68, 0.84, 0.04, 2)).toFixed(3));
    const rDense = scene.r2;
    const spec: Record<string, unknown> = {
      kind: "hydrostatic-tank-brownian",
      mode: "u-tube-manometer",
      solveFor: "light-density",
      denseDensityKgM3: rDense,
      lightColumnHeightM: hLight,
      denseColumnHeightM: hDense,
      gravityMs2: NCUK_GRAVITY_MS2,
    };
    const q = solvePlugin("hydrostatic-tank-brownian", spec);
    const rLight = q.lightDensityKgM3 as number;
    const pGauge = q.interfaceGaugePressurePa as number;
    const eqLevelConcept = String(q.equalLevelPrincipleConcept);
    const hidden = ["lightDensityKgM3", "interfaceGaugePressurePa", "heightDifferenceM"];
    if (hasHiddenNumericCollision(q, hidden, [rDense, hLight, hDense, NCUK_GRAVITY_MS2])) {
      continue;
    }

    const stem = `An open glass U-tube contains ${scene.lower} of known density ρ₂ = ${rDense} kg m⁻³ in its lower bend and right arm. An immiscible sample of ${scene.upper} of unknown density ρ₁ is poured into the left arm until equilibrium is reached as illustrated. Above the horizontal interface datum P–Q, the left oil column stands h₁ = ${fmtGiven(hLight, 2)} m tall while the right ${scene.lower} column stands h₂ = ${fmtGiven(hDense, 3)} m tall (take g = 9.81 m s⁻²).`;
    const requiredGivens: RequiredGivenSpec[] = [
      { name: "denseDensityKgM3", value: rDense, unit: "kg m⁻³", source: "either" },
      { name: "lightColumnHeightM", value: hLight, unit: "m", source: "either" },
      { name: "denseColumnHeightM", value: hDense, unit: "m", source: "either" },
      { name: "gravityMs2", value: NCUK_GRAVITY_MS2, unit: "m s⁻²", source: "stem" },
    ];
    const plan: CandidateQuestionPlan = {
      targetSummary:
        "Equate hydrostatic column pressures along a common horizontal datum inside an open U-tube to determine an unknown immiscible liquid density.",
      distractorStrategy: [
        "Inverting the height ratio h₁ / h₂ instead of h₂ / h₁.",
        "Using the height difference (h₁ − h₂) instead of h₂ in the balance equation.",
        "Omitting the density scaling and taking an arithmetic difference.",
      ],
    };

    if (format === "mcq") {
      const distractors: NumericDistractor[] = [
        { value: (rDense * hLight) / hDense, rationale: "Inverts the height ratio, giving a density higher than the denser liquid." },
        { value: (rDense * (hLight - hDense)) / hLight, rationale: "Uses the difference in levels h₁ − h₂ rather than the full right column height h₂." },
        { value: rDense * hDense, rationale: "Forgets to divide by the left column height h₁." },
      ];
      return {
        id,
        conceptId: "fluid-drag-buoyancy",
        templateArchetype: "layered-tank-and-utube-hydrostatics",
        seed: seed + attempt * 997,
        syllabi: [...AC31_NCUK_SYLLABI],
        format: "mcq",
        difficulty: difficultyForVariant(variant),
        domain: "thermal",
        scenarioSpec: spec,
        hiddenQuantities: hidden,
        requiredGivens,
        questionPlan: plan,
        stem: `${stem} What is the density ρ₁ of the unknown ${scene.upper}?`,
        options: buildNumericMcqOptions(rLight, "kg m⁻³", distractors, seed + attempt),
        targetQuantityKey: "lightDensityKgM3",
        workedSolution: `Pressures at P and Q on the same horizontal datum are equal: p₀ + ρ₁ g h₁ = p₀ + ρ₂ g h₂ ⇒ ρ₁ = ρ₂ (h₂ / h₁) = ${rDense} × (${fmtGiven(hDense, 3)} / ${fmtGiven(hLight, 2)}) = ${fmt4(rLight, "kg m⁻³")} ≈ ${fmt3(rLight, "kg m⁻³")}.`,
        markScheme: [{ code: "A1", criterion: `Correct unknown density ρ₁ = ${fmt3(rLight, "kg m⁻³")}.`, marks: 1 }],
        totalMarks: 1,
        generatorModel,
      };
    }

    const parts: StructuredQuestionPart[] = [
      {
        partId: "a",
        prompt: "State the hydrostatic principle relating the pressures at points P and Q in the U-tube.",
        marks: 1,
        targetMode: "qualitative",
        targetQuantityKey: "equalLevelPrincipleConcept",
        expectedAnswer: `In hydrostatic balance, ${eqLevelConcept}.`,
        workingSteps: ["State equal pressure at equal horizontal levels within the same continuous static liquid."],
      },
      {
        partId: "b",
        prompt: "Calculate the gauge pressure at point Q due to the denser liquid column of height h₂.",
        marks: 2,
        targetQuantityKey: "interfaceGaugePressurePa",
        expectedAnswer: `${fmt3(pGauge, "Pa")}`,
        workingSteps: [
          `Δp = ρ₂ g h₂ = ${rDense} × 9.81 × ${fmtGiven(hDense, 3)} = ${fmt4(pGauge, "Pa")} ≈ ${fmt3(pGauge, "Pa")}.`,
        ],
      },
      {
        partId: "c",
        prompt: `Hence determine the density ρ₁ of the ${scene.upper} in the left arm.`,
        marks: 2,
        dependsOnPartIds: ["b"],
        targetQuantityKey: "lightDensityKgM3",
        expectedAnswer: `${fmt3(rLight, "kg m⁻³")}`,
        workingSteps: [
          `ρ₁ g h₁ = ρ₂ g h₂ ⇒ ρ₁ = ${rDense} × (${fmtGiven(hDense, 3)} / ${fmtGiven(hLight, 2)}) = ${fmt4(rLight, "kg m⁻³")} ≈ ${fmt3(rLight, "kg m⁻³")}.`,
        ],
      },
    ];
    return {
      id,
      conceptId: "fluid-drag-buoyancy",
      templateArchetype: "layered-tank-and-utube-hydrostatics",
      seed: seed + attempt * 997,
      syllabi: [...AC31_NCUK_SYLLABI],
      format: "structured",
      difficulty: difficultyForVariant(variant),
      domain: "thermal",
      scenarioSpec: spec,
      hiddenQuantities: hidden,
      requiredGivens,
      questionPlan: plan,
      stem,
      parts,
      workedSolution: `(a) ${eqLevelConcept}. (b) Δp = ρ₂gh₂ = ${fmt4(pGauge, "Pa")} ≈ ${fmt3(pGauge, "Pa")}. (c) ρ₁ = ρ₂(h₂/h₁) = ${fmt4(rLight, "kg m⁻³")} ≈ ${fmt3(rLight, "kg m⁻³")}.`,
      markScheme: [
        { code: "B1", partId: "a", criterion: "States equal pressure at the same horizontal level in a continuous static liquid.", marks: 1 },
        { code: "M1", partId: "b", criterion: "Applies Δp = ρ₂gh₂.", marks: 1 },
        { code: "A1", partId: "b", criterion: `Δp = ${fmt3(pGauge, "Pa")}.`, marks: 1 },
        { code: "M1", partId: "c", criterion: "Equates ρ₁gh₁ = ρ₂gh₂.", marks: 1 },
        { code: "A1", partId: "c", criterion: `ρ₁ = ${fmt3(rLight, "kg m⁻³")}.`, marks: 1 },
      ],
      totalMarks: 5,
      generatorModel,
    };
  }
  throw new Error(`Failed to sample layered-tank-and-utube-hydrostatics (${id})`);
}

/* ============================================================================
 * ARCHETYPE 13: particle-arrangement-states-of-matter (ncuk-ac3-1, thermal, 14 items)
 * ============================================================================ */

const PARTICLE_SCENARIOS = [
  "During a foundation thermal-physics seminar, a lecturer displays the three-panel microscopic particle diagram shown above.",
  "A laboratory wall chart compares the molecular spacing and motion of a pure substance in three physical phases as illustrated.",
  "A materials-science student inspects the schematic particle models of three distinct states of matter shown in the figure.",
  "The diagram compares instantaneous molecular arrangements for three samples of the same pure substance kept in identical rigid containers.",
  "An NCUK physics revision card depicts microscopic snapshots of three states of matter side by side.",
  "In a kinetic-model tutorial, three particle-box models represent the solid, liquid, and gaseous phases of a single compound.",
  "Consider the microscopic arrangement and motion of molecules depicted across the three panels of the figure.",
  "A thermodynamics textbook illustrates the contrast in intermolecular spacing across three phases of matter as shown.",
  "The three particle boxes illustrate how particle ordering and mobility change across the states of matter.",
  "An introductory matter-properties lab guide displays the three particle snapshots shown above.",
  "A student examines the molecular arrangement diagrams of three phases of a pure substance.",
  "Use the three microscopic particle-model panels shown in the diagram to analyse states of matter.",
  "The schematic figure compares particle packing, intermolecular order, and freedom of motion in three phases.",
  "Refer to the three particle-model containers shown in the diagram representing a pure substance.",
] as const;

function buildParticleStates(
  id: string,
  seed: number,
  variant: number,
  generatorModel: string,
): CandidateQuestionInput {
  const format: QuestionFormat = variant < 8 ? "mcq" : "structured";
  const anonymous = variant % 2 === 0;
  const spec: Record<string, unknown> = {
    kind: "hydrostatic-tank-brownian",
    mode: "particle-states",
    panelLabelsMode: anonymous ? "anonymous" : "named",
    seed: seed + 17,
  };
  const q = solvePlugin("hydrostatic-tank-brownian", spec);
  const solidTxt = String(q.solidArrangementConcept);
  const liquidTxt = String(q.liquidArrangementConcept);
  const gasTxt = String(q.gasArrangementConcept);
  const compTxt = String(q.gasCompressibilityConcept);
  const intro = PARTICLE_SCENARIOS[variant % PARTICLE_SCENARIOS.length];

  const plan: CandidateQuestionPlan = {
    targetSummary:
      "Compare microscopic particle packing, ordering, freedom of motion, and macroscopic compressibility across solids, liquids, and gases.",
  };

  if (format === "mcq") {
    const focus = variant % 4;
    if (focus === 0) {
      const targetKey = "solidArrangementConcept";
      const correctText = `In the solid phase shown on the left, ${solidTxt}.`;
      const distractors = [
        {
          text: "Particles are closely packed with irregular spacing and slide freely past neighbours throughout the vessel.",
          rationale: "Describes a liquid rather than a crystalline solid.",
        },
        {
          text: "Particles remain completely stationary with zero kinetic energy at room temperature.",
          rationale: "Solid particles continually vibrate about equilibrium lattice positions at any temperature above absolute zero.",
        },
        {
          text: "Particles are separated by vast empty spaces and move rapidly in straight lines between rare collisions.",
          rationale: "Describes an ideal gas rather than a solid.",
        },
      ];
      return {
        id,
        conceptId: "fluid-drag-buoyancy",
        templateArchetype: "particle-arrangement-states-of-matter",
        seed,
        syllabi: [...AC31_NCUK_SYLLABI],
        format: "mcq",
        difficulty: "foundation",
        domain: "thermal",
        scenarioSpec: spec,
        hiddenQuantities: [targetKey],
        requiredGivens: [],
        questionPlan: plan,
        stem: `${intro} Which description accurately matches the microscopic structure and motion of the left-hand panel?`,
        targetMode: "qualitative",
        targetQuantityKey: targetKey,
        options: buildQualitativeMcqOptions(correctText, distractors, seed),
        workedSolution: correctText,
        markScheme: [{ code: "B1", criterion: correctText, marks: 1 }],
        totalMarks: 1,
        generatorModel,
      };
    }
    if (focus === 1) {
      const targetKey = "liquidArrangementConcept";
      const correctText = `In the middle panel representing a liquid, ${liquidTxt}.`;
      const distractors = [
        {
          text: "Particles are locked into a rigid repeating crystal lattice and can only vibrate in place.",
          rationale: "Describes a solid lattice; liquids lack fixed lattice positions.",
        },
        {
          text: "Particles are widely spaced with negligible intermolecular forces so the substance easily compresses.",
          rationale: "Describes a gas; liquid particles stay almost touching and are nearly incompressible.",
        },
        {
          text: "Particles expand to occupy the entire empty upper volume of the sealed container uniformly.",
          rationale: "Liquids keep a definite volume and form a free surface under gravity.",
        },
      ];
      return {
        id,
        conceptId: "fluid-drag-buoyancy",
        templateArchetype: "particle-arrangement-states-of-matter",
        seed,
        syllabi: [...AC31_NCUK_SYLLABI],
        format: "mcq",
        difficulty: "foundation",
        domain: "thermal",
        scenarioSpec: spec,
        hiddenQuantities: [targetKey],
        requiredGivens: [],
        questionPlan: plan,
        stem: `${intro} Which statement correctly accounts for why the middle state flows to take the shape of its container while retaining nearly constant volume?`,
        targetMode: "qualitative",
        targetQuantityKey: targetKey,
        options: buildQualitativeMcqOptions(correctText, distractors, seed),
        workedSolution: correctText,
        markScheme: [{ code: "B1", criterion: correctText, marks: 1 }],
        totalMarks: 1,
        generatorModel,
      };
    }
    if (focus === 2) {
      const targetKey = "gasCompressibilityConcept";
      const correctText = `The right-hand gaseous state is readily compressed because ${compTxt}.`;
      const distractors = [
        {
          text: "The gas molecules themselves shrink dramatically in physical diameter whenever external pressure rises.",
          rationale: "Compression reduces inter-molecular spacing, not the intrinsic size of individual molecules.",
        },
        {
          text: "Attractive intermolecular forces pull the gas molecules together whenever the piston moves inward.",
          rationale: "Intermolecular attractions in a dilute gas are negligible compared with thermal kinetic energy.",
        },
        {
          text: "Gas molecules are arranged in collapsible hollow crystal layers that fold under pressure.",
          rationale: "Gases possess no crystal structure or layered lattice.",
        },
      ];
      return {
        id,
        conceptId: "fluid-drag-buoyancy",
        templateArchetype: "particle-arrangement-states-of-matter",
        seed,
        syllabi: [...AC31_NCUK_SYLLABI],
        format: "mcq",
        difficulty: "standard",
        domain: "thermal",
        scenarioSpec: spec,
        hiddenQuantities: [targetKey],
        requiredGivens: [],
        questionPlan: plan,
        stem: `${intro} Why can the state depicted in the right-hand panel be compressed into a much smaller volume far more easily than either of the other two states?`,
        targetMode: "qualitative",
        targetQuantityKey: targetKey,
        options: buildQualitativeMcqOptions(correctText, distractors, seed),
        workedSolution: correctText,
        markScheme: [{ code: "B1", criterion: correctText, marks: 1 }],
        totalMarks: 1,
        generatorModel,
      };
    }

    // focus === 3
    const targetKey = "gasArrangementConcept";
    const correctText = `In the right-hand panel, ${gasTxt}.`;
    const distractors = [
      {
        text: "Particles remain closely touching in small vibrating clusters held by strong rigid bonds.",
        rationale: "Confuses gas behaviour with condensed solid/liquid phases.",
      },
      {
        text: "Particles move slowly in uniform parallel streams all pointing in the same direction.",
        rationale: "Thermal motion of gas molecules is rapid and isotropic (random in all directions).",
      },
      {
        text: "Particles oscillate back and forth about fixed points separated by tiny lattice gaps.",
        rationale: "Describes lattice vibration in a crystalline solid.",
      },
    ];
    return {
      id,
      conceptId: "fluid-drag-buoyancy",
      templateArchetype: "particle-arrangement-states-of-matter",
      seed,
      syllabi: [...AC31_NCUK_SYLLABI],
      format: "mcq",
      difficulty: "foundation",
      domain: "thermal",
      scenarioSpec: spec,
      hiddenQuantities: [targetKey],
      requiredGivens: [],
      questionPlan: plan,
      stem: `${intro} Which statement best characterizes the arrangement, motion, and intermolecular forces of the particles in the right-hand panel?`,
      targetMode: "qualitative",
      targetQuantityKey: targetKey,
      options: buildQualitativeMcqOptions(correctText, distractors, seed),
      workedSolution: correctText,
      markScheme: [{ code: "B1", criterion: correctText, marks: 1 }],
      totalMarks: 1,
      generatorModel,
    };
  }

  // Structured (3 x 2m short + 3 x 4m structured, all strictly qualitative!)
  const isTwoMark = variant < 11;
  if (isTwoMark) {
    const askCompress = variant % 2 === 0;
    const targetKey = askCompress
      ? "gasCompressibilityConcept"
      : "liquidArrangementConcept";
    const expected = askCompress
      ? `A gas is easily compressed because ${compTxt}.`
      : `A liquid can flow while maintaining nearly fixed volume because ${liquidTxt}.`;
    const parts: StructuredQuestionPart[] = [
      {
        partId: "a",
        prompt: askCompress
          ? "Using the particle model illustrated, explain why a gas is much more compressible than a liquid or solid."
          : "Using the particle model illustrated, describe the arrangement and motion of particles in a liquid.",
        marks: 2,
        targetMode: "qualitative",
        targetQuantityKey: targetKey,
        expectedAnswer: expected,
        workingSteps: askCompress
          ? [
              "State that gas molecules are widely separated with large empty spaces between them.",
              "Explain that applied pressure pushes molecules closer together into this empty space, whereas solid and liquid particles are already closely packed.",
            ]
          : [
              "State that liquid particles remain closely packed in an irregular disordered arrangement.",
              "Explain that weaker intermolecular bonds allow particles to move and slide past one another.",
            ],
      },
    ];
    return {
      id,
      conceptId: "fluid-drag-buoyancy",
      templateArchetype: "particle-arrangement-states-of-matter",
      seed,
      syllabi: [...AC31_NCUK_SYLLABI],
      format: "structured",
      difficulty: "foundation",
      domain: "thermal",
      scenarioSpec: spec,
      hiddenQuantities: [targetKey],
      requiredGivens: [],
      questionPlan: plan,
      stem: intro,
      targetMode: "qualitative",
      parts,
      workedSolution: expected,
      markScheme: askCompress
        ? [
            { code: "B1", partId: "a", criterion: "Notes large empty spaces between widely separated gas molecules.", marks: 1 },
            { code: "B1", partId: "a", criterion: "Links available empty space to easy volume reduction compared with closely packed solids/liquids.", marks: 1 },
          ]
        : [
            { code: "B1", partId: "a", criterion: "Closely packed with irregular/random arrangement.", marks: 1 },
            { code: "B1", partId: "a", criterion: "Particles free to slide past one another.", marks: 1 },
          ],
      totalMarks: 2,
      generatorModel,
    };
  }

  // 4m Qualitative Structured comparing two phases!
  const parts: StructuredQuestionPart[] = [
    {
      partId: "a",
      prompt:
        "Describe the spacing, order, and motion of particles in the solid state shown in the left-hand panel.",
      marks: 2,
      targetMode: "qualitative",
      targetQuantityKey: "solidArrangementConcept",
      expectedAnswer: `In a solid, ${solidTxt}.`,
      workingSteps: [
        "Mention close packing in a regular ordered lattice.",
        "Specify that particles vibrate continuously about fixed equilibrium positions.",
      ],
    },
    {
      partId: "b",
      prompt:
        "Contrast this with the spacing, motion, and intermolecular forces of particles in the gaseous state shown in the right-hand panel.",
      marks: 2,
      targetMode: "qualitative",
      targetQuantityKey: "gasArrangementConcept",
      expectedAnswer: `In a gas, ${gasTxt}.`,
      workingSteps: [
        "State that particles are widely separated with negligible intermolecular forces except during collisions.",
        "State that they move rapidly and randomly in all directions.",
      ],
    },
  ];
  return {
    id,
    conceptId: "fluid-drag-buoyancy",
    templateArchetype: "particle-arrangement-states-of-matter",
    seed,
    syllabi: [...AC31_NCUK_SYLLABI],
    format: "structured",
    difficulty: "standard",
    domain: "thermal",
    scenarioSpec: spec,
    hiddenQuantities: ["solidArrangementConcept", "gasArrangementConcept"],
    requiredGivens: [],
    questionPlan: plan,
    stem: intro,
    targetMode: "qualitative",
    parts,
    workedSolution: `(a) ${solidTxt}. (b) ${gasTxt}.`,
    markScheme: [
      { code: "B1", partId: "a", criterion: "Closely packed in a regular fixed lattice.", marks: 1 },
      { code: "B1", partId: "a", criterion: "Vibrate about fixed positions.", marks: 1 },
      { code: "B1", partId: "b", criterion: "Widely spaced with negligible intermolecular forces.", marks: 1 },
      { code: "B1", partId: "b", criterion: "Rapid random motion in all directions.", marks: 1 },
    ],
    totalMarks: 4,
    generatorModel,
  };
}

/* ============================================================================
 * ARCHETYPE 14: brownian-motion-smoke-cell-evidence (ncuk-ac3-1, thermal, 14 items)
 * ============================================================================ */

const BROWNIAN_SCENARIOS = [
  "In a dark-room optics bench demonstration, a glass cell containing trapped smoke and air is illuminated from the side and viewed through a low-power microscope as shown.",
  "A foundation physics student prepares a classic side-lit glass smoke cell beneath an upright microscope and sketches the trajectory of a single illuminated speck.",
  "The diagram shows an illuminated smoke-cell experiment alongside a magnified eyepiece view tracking one bright suspended particle from P to W.",
  "During an AC3.1 matter practical, fine smoke particles suspended in still air inside a sealed glass chamber are observed under intense lateral illumination.",
  "A laboratory microscope focuses on microscopic pollen grains suspended in still water inside a sealed observation cell, revealing the jagged path shown.",
  "An observer views tiny suspended specks illuminated transversely in a closed viewing cell at uniform room temperature and plots successive positions.",
  "Consider the illuminated Brownian-motion cell and magnified eyepiece trace depicted in the schematic diagram.",
  "A physics teacher projects the microscope eyepiece view of an illuminated smoke speck suspended in motionless air inside a sealed glass cell.",
  "In a controlled kinetic-theory experiment, fine pollen particles suspended in stationary water are observed through an optical microscope as illustrated.",
  "The schematic apparatus traps fine carbon smoke in still air; side illumination reveals tiny glowing points tracing erratic zig-zag trajectories.",
  "A student investigates microscopic particle motion by sealing a thin suspension of smoke in air beneath a microscope objective lens.",
  "Refer to the viewing apparatus and magnified random-walk trace recorded for an isolated suspended speck in a sealed cell.",
  "An undergraduate physics kit uses side-lit pollen grains in still water to demonstrate microscopic kinetic-theory evidence under magnification.",
  "In a sealed glass cell kept at steady temperature, an illuminated smoke speck follows the sudden erratic zig-zag path traced in the eyepiece view.",
] as const;

function buildBrownianMotion(
  id: string,
  seed: number,
  variant: number,
  generatorModel: string,
): CandidateQuestionInput {
  const format: QuestionFormat = variant < 8 ? "mcq" : "structured";
  const isWater = variant === 4 || variant === 8 || variant === 12;
  const spec: Record<string, unknown> = {
    kind: "hydrostatic-tank-brownian",
    mode: "brownian-smoke-cell",
    fluidMedium: isWater ? "water" : "air",
    seed: seed + 31,
  };
  const q = solvePlugin("hydrostatic-tank-brownian", spec);
  const obsTxt = String(q.brownianObservationConcept);
  const causeTxt = String(q.brownianCauseConcept);
  const evidTxt = String(q.brownianEvidenceConcept);
  const tempTxt = String(q.brownianTemperatureEffectConcept);
  const intro = BROWNIAN_SCENARIOS[variant % BROWNIAN_SCENARIOS.length];

  const plan: CandidateQuestionPlan = {
    targetSummary:
      "Describe Brownian motion observations in a smoke or pollen cell and explain them in terms of uneven momentum transfer from invisible randomly moving fluid molecules.",
  };

  if (format === "mcq") {
    const focus = variant % 4;
    if (focus === 0) {
      const targetKey = "brownianCauseConcept";
      const correctText = `The abrupt changes in direction occur because of ${causeTxt}.`;
      const distractors = [
        {
          text: "Warm convection currents generated by the lamp continuously sweep all specks in smooth circular loops.",
          rationale: "Convection produces smooth bulk drift in one direction, not independent erratic zig-zag jumps.",
        },
        {
          text: "Photons in the side light beam push the smoke specks erratically sideways whenever they scatter light.",
          rationale: "Radiation pressure from a lab lamp is far too weak and uniform to produce random isotropic zig-zags.",
        },
        {
          text: "The visible specks themselves are living organisms or electrically charged dust repelling one another.",
          rationale: "Inert smoke or pollen specks move passively due to bombardment by invisible fluid molecules.",
        },
      ];
      return {
        id,
        conceptId: "fluid-drag-buoyancy",
        templateArchetype: "brownian-motion-smoke-cell-evidence",
        seed,
        syllabi: [...AC31_NCUK_SYLLABI],
        format: "mcq",
        difficulty: "foundation",
        domain: "thermal",
        scenarioSpec: spec,
        hiddenQuantities: [targetKey],
        requiredGivens: [],
        questionPlan: plan,
        stem: `${intro} What is the correct physical explanation for the erratic zig-zag path traced by the illuminated speck?`,
        targetMode: "qualitative",
        targetQuantityKey: targetKey,
        options: buildQualitativeMcqOptions(correctText, distractors, seed),
        workedSolution: correctText,
        markScheme: [{ code: "B1", criterion: correctText, marks: 1 }],
        totalMarks: 1,
        generatorModel,
      };
    }

    if (focus === 1) {
      const targetKey = "brownianObservationConcept";
      const correctText = `Looking through the microscope eyepiece, the student observes ${obsTxt}.`;
      const distractors = [
        {
          text: "Individual transparent air molecules bouncing off one another along smooth curved orbits.",
          rationale: "Fluid molecules are far too small to resolve with an optical microscope; only the much larger specks are seen.",
        },
        {
          text: "Bright specks falling smoothly downwards at constant terminal speed in straight vertical lines.",
          rationale: "Ignores the characteristic continuous random jiggling caused by unbalanced molecular impacts.",
        },
        {
          text: "A stationary regular crystal grid of glowing specks vibrating in phase with the light beam.",
          rationale: "Suspended particles in a fluid do not form a fixed crystal lattice.",
        },
      ];
      return {
        id,
        conceptId: "fluid-drag-buoyancy",
        templateArchetype: "brownian-motion-smoke-cell-evidence",
        seed,
        syllabi: [...AC31_NCUK_SYLLABI],
        format: "mcq",
        difficulty: "foundation",
        domain: "thermal",
        scenarioSpec: spec,
        hiddenQuantities: [targetKey],
        requiredGivens: [],
        questionPlan: plan,
        stem: `${intro} What is directly seen when looking into the microscope eyepiece?`,
        targetMode: "qualitative",
        targetQuantityKey: targetKey,
        options: buildQualitativeMcqOptions(correctText, distractors, seed),
        workedSolution: correctText,
        markScheme: [{ code: "B1", criterion: correctText, marks: 1 }],
        totalMarks: 1,
        generatorModel,
      };
    }

    if (focus === 2) {
      const targetKey = "brownianTemperatureEffectConcept";
      const correctText = `If the sealed cell is warmed uniformly to a higher steady temperature, ${tempTxt}.`;
      const distractors = [
        {
          text: "The erratic motion slows down and stops because warmer fluid molecules expand and lock together.",
          rationale: "Higher temperature raises molecular kinetic energy and speeds up Brownian agitation.",
        },
        {
          text: "The motion remains completely unchanged because temperature does not affect molecular speeds.",
          rationale: "Mean kinetic energy of fluid molecules is directly proportional to thermodynamic temperature.",
        },
        {
          text: "All specks begin moving together in a single straight line away from the microscope lens.",
          rationale: "Uniform warming intensifies random isotropic motion rather than creating a single-direction beam.",
        },
      ];
      return {
        id,
        conceptId: "fluid-drag-buoyancy",
        templateArchetype: "brownian-motion-smoke-cell-evidence",
        seed,
        syllabi: [...AC31_NCUK_SYLLABI],
        format: "mcq",
        difficulty: "standard",
        domain: "thermal",
        scenarioSpec: spec,
        hiddenQuantities: [targetKey],
        requiredGivens: [],
        questionPlan: plan,
        stem: `${intro} How does the observed motion of the illuminated specks change if the fluid inside the sealed cell is warmed uniformly to a higher temperature?`,
        targetMode: "qualitative",
        targetQuantityKey: targetKey,
        options: buildQualitativeMcqOptions(correctText, distractors, seed),
        workedSolution: correctText,
        markScheme: [{ code: "B1", criterion: correctText, marks: 1 }],
        totalMarks: 1,
        generatorModel,
      };
    }

    const targetKey = "brownianEvidenceConcept";
    const correctText = `This classic experiment provides ${evidTxt}.`;
    const distractors = [
      {
        text: "Proof that air molecules are larger than smoke particles and move only when illuminated.",
        rationale: "Air molecules are vastly smaller than smoke specks and move thermally even in total darkness.",
      },
      {
        text: "Evidence that gravity does not act on microscopic particles suspended inside sealed cells.",
        rationale: "Gravity still acts, but random molecular bombardment dominates the rapid lateral jiggling.",
      },
      {
        text: "Direct proof that solids melt whenever exposed to lateral visible light.",
        rationale: "Brownian motion demonstrates kinetic molecular agitation in fluids, not phase melting.",
      },
    ];
    return {
      id,
      conceptId: "fluid-drag-buoyancy",
      templateArchetype: "brownian-motion-smoke-cell-evidence",
      seed,
      syllabi: [...AC31_NCUK_SYLLABI],
      format: "mcq",
      difficulty: "foundation",
      domain: "thermal",
      scenarioSpec: spec,
      hiddenQuantities: [targetKey],
      requiredGivens: [],
      questionPlan: plan,
      stem: `${intro} What fundamental kinetic-theory conclusion is supported by this experiment?`,
      targetMode: "qualitative",
      targetQuantityKey: targetKey,
      options: buildQualitativeMcqOptions(correctText, distractors, seed),
      workedSolution: correctText,
      markScheme: [{ code: "B1", criterion: correctText, marks: 1 }],
      totalMarks: 1,
      generatorModel,
    };
  }

  // Structured (3 x 2m + 3 x 4m, all strictly qualitative!)
  const isTwoMark = variant < 11;
  if (isTwoMark) {
    const askTemp = variant % 2 === 1;
    const targetKey = askTemp
      ? "brownianTemperatureEffectConcept"
      : "brownianCauseConcept";
    const expected = askTemp
      ? `Warming the fluid causes faster motion because ${tempTxt}.`
      : `The speck moves erratically because of ${causeTxt}.`;
    const parts: StructuredQuestionPart[] = [
      {
        partId: "a",
        prompt: askTemp
          ? "State and explain how the motion of the suspended specks changes if the fluid inside the cell is warmed uniformly."
          : "Explain, in terms of fluid molecules and momentum transfer, why the illuminated speck undergoes sudden random changes in direction.",
        marks: 2,
        targetMode: "qualitative",
        targetQuantityKey: targetKey,
        expectedAnswer: expected,
        workingSteps: askTemp
          ? [
              "State that warming increases average kinetic energy and speed of the invisible fluid molecules.",
              "Explain that collisions with the speck become more frequent and transfer larger momentum impulses, producing faster erratic motion.",
            ]
          : [
              "Identify bombardment by much smaller invisible rapidly moving fluid molecules.",
              "State that random unequal collisions on opposite sides transfer a net fluctuating momentum impulse.",
            ],
      },
    ];
    return {
      id,
      conceptId: "fluid-drag-buoyancy",
      templateArchetype: "brownian-motion-smoke-cell-evidence",
      seed,
      syllabi: [...AC31_NCUK_SYLLABI],
      format: "structured",
      difficulty: "standard",
      domain: "thermal",
      scenarioSpec: spec,
      hiddenQuantities: [targetKey],
      requiredGivens: [],
      questionPlan: plan,
      stem: intro,
      targetMode: "qualitative",
      parts,
      workedSolution: expected,
      markScheme: askTemp
        ? [
            { code: "B1", partId: "a", criterion: "Higher temperature raises average molecular kinetic energy/speed.", marks: 1 },
            { code: "B1", partId: "a", criterion: "More frequent and vigorous collisions make the erratic speck motion faster.", marks: 1 },
          ]
        : [
            { code: "B1", partId: "a", criterion: "Collisions from much smaller invisible randomly moving fluid molecules.", marks: 1 },
            { code: "B1", partId: "a", criterion: "Uneven/unbalanced bombardment transfers net momentum causing abrupt zig-zags.", marks: 1 },
          ],
      totalMarks: 2,
      generatorModel,
    };
  }

  // 4m Qualitative Structured (mirrors NCUK AC3.1 Brownian 4-mark rubric!)
  const parts: StructuredQuestionPart[] = [
    {
      partId: "a",
      prompt:
        "Describe what is directly observed when viewing the illuminated cell through the microscope eyepiece.",
      marks: 2,
      targetMode: "qualitative",
      targetQuantityKey: "brownianObservationConcept",
      expectedAnswer: `Through the microscope one sees ${obsTxt}.`,
      workingSteps: [
        "State that tiny bright points of scattered light (the suspended specks, not individual molecules) are visible.",
        "Describe their continuous, irregular, jerky, zig-zag random movement.",
      ],
    },
    {
      partId: "b",
      prompt:
        "Explain the physical cause of this observed motion in terms of molecular size, random motion, and momentum transfer.",
      marks: 2,
      targetMode: "qualitative",
      targetQuantityKey: "brownianCauseConcept",
      expectedAnswer: `The motion is caused by ${causeTxt}.`,
      workingSteps: [
        "Explain that invisible fluid molecules are vastly smaller and travel rapidly and randomly.",
        "Explain that unequal numbers of collisions on different sides deliver a net fluctuating momentum transfer to the visible speck.",
      ],
    },
  ];
  return {
    id,
    conceptId: "fluid-drag-buoyancy",
    templateArchetype: "brownian-motion-smoke-cell-evidence",
    seed,
    syllabi: [...AC31_NCUK_SYLLABI],
    format: "structured",
    difficulty: "standard",
    domain: "thermal",
    scenarioSpec: spec,
    hiddenQuantities: ["brownianObservationConcept", "brownianCauseConcept"],
    requiredGivens: [],
    questionPlan: plan,
    stem: intro,
    targetMode: "qualitative",
    parts,
    workedSolution: `(a) ${obsTxt}. (b) ${causeTxt}.`,
    markScheme: [
      { code: "B1", partId: "a", criterion: "Identifies bright illuminated specks (not individual molecules).", marks: 1 },
      { code: "B1", partId: "a", criterion: "Describes continuous erratic/jagged/random zig-zag motion.", marks: 1 },
      { code: "B1", partId: "b", criterion: "Attributes impacts to much smaller invisible rapidly and randomly moving fluid molecules.", marks: 1 },
      { code: "B1", partId: "b", criterion: "Explains uneven bombardment transferring net momentum in changing directions.", marks: 1 },
    ],
    totalMarks: 4,
    generatorModel,
  };
}

/* ============================================================================
 * Public Entrypoint
 * ============================================================================ */

type ArchetypeBuilder = (
  id: string,
  seed: number,
  variant: number,
  generatorModel: string,
) => CandidateQuestionInput;

const BUILDER_SEQUENCE: readonly {
  readonly archetype: string;
  readonly count: number;
  readonly build: ArchetypeBuilder;
}[] = [
  { archetype: "single-pivot-offcentre-balance", count: 14, build: buildSinglePivotBalance },
  { archetype: "crane-counterweight-safe-load", count: 14, build: buildCraneCounterweight },
  { archetype: "overhanging-bridge-support-reactions-tipping", count: 14, build: buildOverhangingBeam },
  { archetype: "hinged-wall-sign-angled-wire", count: 14, build: buildHingedWallSign },
  { archetype: "nonuniform-trapdoor-hinge-resultant-long", count: 14, build: buildNonuniformTrapdoorLong },
  { archetype: "two-wire-asymmetric-suspended-bar", count: 14, build: buildTwoWireSuspendedBar },
  { archetype: "couples-torque-and-equilibrium-rules", count: 14, build: buildCouplesAndEquilibrium },
  { archetype: "alloy-density-mass-vs-volume-mix", count: 14, build: buildAlloyDensity },
  { archetype: "annular-washer-drawn-wire-sphere-density", count: 14, build: buildGeometryDensity },
  { archetype: "hydrostatic-gauge-absolute-base-force", count: 14, build: buildHydrostaticBaseForce },
  { archetype: "archimedes-upthrust-and-solution-density", count: 14, build: buildArchimedesAndSolution },
  { archetype: "layered-tank-and-utube-hydrostatics", count: 14, build: buildLayeredTankAndUtube },
  { archetype: "particle-arrangement-states-of-matter", count: 14, build: buildParticleStates },
  { archetype: "brownian-motion-smoke-cell-evidence", count: 14, build: buildBrownianMotion },
];

export function generateNcukStaticsFluidsCandidates(
  options: GenerateNcukStaticsFluidsOptions = {},
): CandidateQuestionInput[] {
  const baseSeed = options.baseSeed ?? NCUK_STATICS_FLUIDS_BASE_SEED;
  const generatorModel = options.generatorModel ?? "gemini-4-carbon-high";
  const candidates: CandidateQuestionInput[] = [];

  let globalIndex = 0;
  for (const entry of BUILDER_SEQUENCE) {
    for (let variant = 0; variant < entry.count; variant += 1) {
      globalIndex += 1;
      const id = `${NCUK_STATICS_FLUIDS_ID_PREFIX}-${String(globalIndex).padStart(3, "0")}`;
      const seed = baseSeed + globalIndex * 1000;
      candidates.push(entry.build(id, seed, variant, generatorModel));
    }
  }

  return candidates;
}
