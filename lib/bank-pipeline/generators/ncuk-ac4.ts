import {
  buildOptionEquivalenceKey,
  numbersAgreeWithinTolerance,
} from "@/lib/bank-pipeline/numeric-checker";
import type {
  CandidateQuestionInput,
  MarkSchemePoint,
  McqOptionItem,
  QuestionDifficulty,
  QuestionFormat,
  RequiredGivenSpec,
  StructuredQuestionPart,
  SyllabusTag,
} from "@/lib/bank-pipeline/types";
import { MCQ_OPTION_LABELS } from "@/lib/bank-pipeline/types";
import {
  formatNcukQuantity,
  NCUK_AC4_PLUGINS_BY_KIND,
  NCUK_ELEMENTARY_CHARGE_C,
} from "@/lib/visuals/ncuk-ac4";

export const DEFAULT_NCUK_AC4_BASE_SEED = 70_000_000;
export const NCUK_AC4_ID_PREFIX = "sp-v3-ncuk-ac4";
export const NCUK_AC4_DEFAULT_GENERATOR_MODEL =
  "sixthphysics-deterministic-ncuk-ac4/1.0.0";

export interface GenerateNcukAc4Options {
  readonly baseSeed?: number;
  readonly generatorModel?: string;
}

export interface NcukAc4ArchetypeMeta {
  readonly id: string;
  readonly conceptId: string;
  readonly subtopicId: "ncuk-ac4-1" | "ncuk-ac4-2" | "ncuk-ac4-3" | "ncuk-ac4-4";
  readonly domain: "pure-calculation" | "circuits" | "em-induction" | "graphs";
  readonly kind: string;
  readonly totalCount: number;
  readonly isTenMarkFlagship?: boolean;
}

export const NCUK_AC4_ARCHETYPES: readonly NcukAc4ArchetypeMeta[] = [
  {
    id: "ncuk-drift-velocity-conductor-wire",
    conceptId: "charge-current-potential-difference",
    subtopicId: "ncuk-ac4-1",
    domain: "pure-calculation",
    kind: "drift-velocity-conduction",
    totalCount: 14,
  },
  {
    id: "ncuk-charge-current-electron-count",
    conceptId: "charge-current-potential-difference",
    subtopicId: "ncuk-ac4-1",
    domain: "pure-calculation",
    kind: "charge-electron-count",
    totalCount: 14,
  },
  {
    id: "ncuk-kirchhoff-two-loop-network",
    conceptId: "kirchhoff-dc-circuits",
    subtopicId: "ncuk-ac4-1",
    domain: "circuits",
    kind: "multi-loop-kirchhoff-cells",
    totalCount: 14,
  },
  {
    id: "ncuk-opposing-series-cells-loop",
    conceptId: "kirchhoff-dc-circuits",
    subtopicId: "ncuk-ac4-1",
    domain: "circuits",
    kind: "multi-loop-kirchhoff-cells",
    totalCount: 14,
  },
  {
    id: "ncuk-parallel-identical-cells-trap",
    conceptId: "kirchhoff-dc-circuits",
    subtopicId: "ncuk-ac4-1",
    domain: "circuits",
    kind: "multi-loop-kirchhoff-cells",
    totalCount: 12,
  },
  {
    id: "ncuk-component-iv-curve-characteristic",
    conceptId: "ohms-law-iv-characteristics",
    subtopicId: "ncuk-ac4-2",
    domain: "graphs",
    kind: "component-iv-curve",
    totalCount: 14,
  },
  {
    id: "ncuk-iv-gradient-wire-resistivity",
    conceptId: "resistivity-ohmic-conductors",
    subtopicId: "ncuk-ac4-2",
    domain: "graphs",
    kind: "component-iv-curve",
    totalCount: 14,
  },
  {
    id: "ncuk-cuboid-bar-resistivity",
    conceptId: "resistivity-ohmic-conductors",
    subtopicId: "ncuk-ac4-2",
    domain: "pure-calculation",
    kind: "cuboid-remelt-resistivity",
    totalCount: 14,
  },
  {
    id: "ncuk-remelted-redrawn-wire-resistivity",
    conceptId: "resistivity-ohmic-conductors",
    subtopicId: "ncuk-ac4-2",
    domain: "pure-calculation",
    kind: "cuboid-remelt-resistivity",
    totalCount: 14,
  },
  {
    id: "ncuk-symbolic-and-numeric-resistor-ladder",
    conceptId: "ohms-law-iv-characteristics",
    subtopicId: "ncuk-ac4-2",
    domain: "circuits",
    kind: "symbolic-resistor-ladder",
    totalCount: 14,
  },
  {
    id: "ncuk-two-load-battery-swap",
    conceptId: "emf-internal-resistance",
    subtopicId: "ncuk-ac4-3",
    domain: "pure-calculation",
    kind: "two-load-battery-bulb",
    totalCount: 14,
  },
  {
    id: "ncuk-appliance-bulb-power-rating",
    conceptId: "emf-internal-resistance",
    subtopicId: "ncuk-ac4-3",
    domain: "pure-calculation",
    kind: "two-load-battery-bulb",
    totalCount: 12,
  },
  {
    id: "ncuk-internal-resistance-experiment-10m",
    conceptId: "emf-internal-resistance",
    subtopicId: "ncuk-ac4-3",
    domain: "circuits",
    kind: "internal-resistance-experiment",
    totalCount: 14,
    isTenMarkFlagship: true,
  },
  {
    id: "ncuk-capacitor-voltage-breakdown-rating",
    conceptId: "capacitor-networks-energy",
    subtopicId: "ncuk-ac4-4",
    domain: "em-induction",
    kind: "capacitor-breakdown-rating",
    totalCount: 14,
  },
  {
    id: "ncuk-capacitor-qv-area-energy",
    conceptId: "capacitor-networks-energy",
    subtopicId: "ncuk-ac4-4",
    domain: "graphs",
    kind: "capacitor-qv-area",
    totalCount: 14,
  },
  {
    id: "ncuk-rc-ln-linearization-graph",
    conceptId: "capacitor-rc-decay",
    subtopicId: "ncuk-ac4-4",
    domain: "graphs",
    kind: "rc-ln-linearization",
    totalCount: 14,
  },
  {
    id: "ncuk-switched-rc-multistage-10m",
    conceptId: "capacitor-rc-decay",
    subtopicId: "ncuk-ac4-4",
    domain: "em-induction",
    kind: "switched-rc-multistage",
    totalCount: 14,
    isTenMarkFlagship: true,
  },
];

/* -------------------------------------------------------------------------- */
/*  Shared deterministic helpers                                              */
/* -------------------------------------------------------------------------- */

function solvePlugin(kind: string, spec: Record<string, unknown>) {
  const plugin = NCUK_AC4_PLUGINS_BY_KIND.get(kind);
  if (!plugin) {
    throw new Error(`Missing NCUK AC4 plugin for kind "${kind}"`);
  }
  const check = plugin.validate(spec);
  if (!check.valid) {
    throw new Error(
      `Invalid spec for kind "${kind}": ${check.issues.join("; ")}`,
    );
  }
  return plugin.solve(spec).quantities;
}

function numQty(
  quantities: Record<string, number | string | boolean>,
  key: string,
): number {
  const val = quantities[key];
  if (typeof val !== "number" || !Number.isFinite(val)) {
    throw new Error(`Expected finite numeric quantity "${key}", got ${String(val)}`);
  }
  return val;
}

function strQty(
  quantities: Record<string, number | string | boolean>,
  key: string,
): string {
  const val = quantities[key];
  if (typeof val !== "string" || !val.trim()) {
    throw new Error(`Expected string quantity "${key}", got ${String(val)}`);
  }
  return val;
}

function syllabiForSubtopic(
  subtopicId: "ncuk-ac4-1" | "ncuk-ac4-2" | "ncuk-ac4-3" | "ncuk-ac4-4",
): SyllabusTag[] {
  const ncukTag: SyllabusTag = {
    syllabus: "ncuk",
    level: "IFY-S1",
    topicId: "ncuk-ac4",
    subtopicId,
  };
  if (subtopicId === "ncuk-ac4-4") {
    return [
      ncukTag,
      {
        syllabus: "alevel",
        level: "Y13",
        topicId: "alevel-sec7-fields-consequences",
        subtopicId: "alevel-3-7-4-capacitance",
      },
    ];
  }
  return [
    ncukTag,
    {
      syllabus: "alevel",
      level: "Y12",
      topicId: "alevel-sec5-electricity",
      subtopicId: "alevel-3-5-1-current-electricity",
    },
  ];
}

function difficultyForIndex(idx: number): QuestionDifficulty {
  const mod = idx % 3;
  if (mod === 0) return "foundation";
  if (mod === 1) return "standard";
  return "higher";
}

interface NumericDistractor {
  readonly value: number;
  readonly rationale: string;
}

function buildNumericMcqOptions(args: {
  readonly correctValue: number;
  readonly unit?: string;
  readonly distractors: readonly NumericDistractor[];
  readonly seed: number;
  readonly formatFn?: (v: number) => string;
}): McqOptionItem[] {
  const fmt =
    args.formatFn ??
    ((v: number) => formatNcukQuantity(v, args.unit, 3));
  const correctText = fmt(args.correctValue);
  const usedKeys = new Set<string>([buildOptionEquivalenceKey(correctText)]);
  const chosenDistractors: Array<{ text: string; rationale: string }> = [];

  for (const cand of args.distractors) {
    if (!Number.isFinite(cand.value) || cand.value <= 0) continue;
    if (
      numbersAgreeWithinTolerance(cand.value, args.correctValue, {
        significantFigures: 3,
        relativeTolerance: 0.015,
      })
    ) {
      continue;
    }
    const text = fmt(cand.value);
    const key = buildOptionEquivalenceKey(text);
    if (usedKeys.has(key)) continue;
    usedKeys.add(key);
    chosenDistractors.push({ text, rationale: cand.rationale });
    if (chosenDistractors.length === 3) break;
  }

  // Fallback distinct multipliers if any misconception collided numerically
  const fallbacks: readonly [number, string][] = [
    [2.0, "Introduced an extra factor of 2 during algebraic rearrangement."],
    [0.5, "Introduced an unintended factor of 1/2 in the final substitution."],
    [4.0, "Misapplied a squared scaling factor (factor of 4 error)."],
    [0.25, "Divided by 4 unnecessarily while substituting the physical formula."],
    [1.5, "Combined the intermediate ratios inaccurately."],
    [0.65, "Rounded intermediate quantities aggressively before completing the calculation."],
  ];
  for (const [factor, rationale] of fallbacks) {
    if (chosenDistractors.length === 3) break;
    const val = args.correctValue * factor;
    if (
      numbersAgreeWithinTolerance(val, args.correctValue, {
        significantFigures: 3,
        relativeTolerance: 0.02,
      })
    ) {
      continue;
    }
    const text = fmt(val);
    const key = buildOptionEquivalenceKey(text);
    if (usedKeys.has(key)) continue;
    usedKeys.add(key);
    chosenDistractors.push({ text, rationale });
  }

  const rawItems: Array<{
    text: string;
    isCorrect: boolean;
    distractorRationale?: string;
  }> = [
    { text: correctText, isCorrect: true },
    ...chosenDistractors.map((d) => ({
      text: d.text,
      isCorrect: false,
      distractorRationale: d.rationale,
    })),
  ];

  // Deterministic placement of correct option across A/B/C/D
  const targetPos = ((args.seed * 7 + 3) % 4 + 4) % 4;
  const arranged = [...rawItems.slice(1)];
  arranged.splice(targetPos, 0, rawItems[0]);

  return arranged.map((item, idx) => ({
    label: MCQ_OPTION_LABELS[idx],
    text: item.text,
    isCorrect: item.isCorrect,
    ...(item.distractorRationale
      ? { distractorRationale: item.distractorRationale }
      : {}),
  }));
}

function buildQualitativeMcqOptions(args: {
  readonly correctText: string;
  readonly distractors: readonly { text: string; rationale: string }[];
  readonly seed: number;
}): McqOptionItem[] {
  const targetPos = ((args.seed * 5 + 1) % 4 + 4) % 4;
  const arranged: Array<{
    text: string;
    isCorrect: boolean;
    distractorRationale?: string;
  }> = args.distractors.slice(0, 3).map((d) => ({
    text: d.text,
    isCorrect: false,
    distractorRationale: d.rationale,
  }));
  arranged.splice(targetPos, 0, {
    text: args.correctText,
    isCorrect: true,
  });
  return arranged.map((item, idx) => ({
    label: MCQ_OPTION_LABELS[idx],
    text: item.text,
    isCorrect: item.isCorrect,
    ...(item.distractorRationale
      ? { distractorRationale: item.distractorRationale }
      : {}),
  }));
}

function roundTo(v: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(v * f) / f;
}

function withArticle(phrase: string, capitalize = false): string {
  const trimmed = phrase.trim();
  const useAn =
    /^(?:[aeiou]|LED\b|LDR\b|NTC\b|RC\b)/i.test(trimmed) &&
    !/^(?:uni|use|user|one\b)/i.test(trimmed);
  const article = capitalize ? (useAn ? "An" : "A") : useAn ? "an" : "a";
  return `${article} ${trimmed}`;
}

/* -------------------------------------------------------------------------- */
/*  1. AC4.1 :: Drift Velocity in Cylindrical Metal Conductors (14 items)     */
/* -------------------------------------------------------------------------- */

function buildDriftVelocityItems(
  baseSeed: number,
  generatorModel: string,
): CandidateQuestionInput[] {
  const contexts = [
    { alloy: "annealed copper", n: 8.5e28, dMm: 0.6, iA: 1.8, setting: "bench power busbar" },
    { alloy: "high-purity silver", n: 5.8e28, dMm: 0.8, iA: 2.4, setting: "precision galvanometer coil" },
    { alloy: "drawn aluminium", n: 6.0e28, dMm: 1.1, iA: 3.2, setting: "solar array feeder wire" },
    { alloy: "gold bond wire", n: 5.9e28, dMm: 0.35, iA: 0.65, setting: "cryogenic sensor lead" },
    { alloy: "copper-tin bronze", n: 7.2e28, dMm: 0.9, iA: 2.1, setting: "laboratory rheostat lead" },
    { alloy: "electrolytic copper", n: 8.4e28, dMm: 1.4, iA: 4.2, setting: "battery bank interconnect" },
    { alloy: "silver-palladium alloy", n: 6.4e28, dMm: 0.5, iA: 1.2, setting: "instrumentation probe cable" },
    { alloy: "pure zinc wire", n: 6.6e28, dMm: 1.25, iA: 3.6, setting: "electrochemistry cell lead" },
    { alloy: "oxygen-free copper", n: 8.6e28, dMm: 0.45, iA: 0.95, setting: "audio amplifier winding" },
    { alloy: "hard-drawn aluminium", n: 6.1e28, dMm: 1.6, iA: 4.4, setting: "overhead distribution jumper" },
    { alloy: "phosphor bronze", n: 7.6e28, dMm: 0.72, iA: 1.5, setting: "spring-contact test lead" },
    { alloy: "fine silver filament", n: 5.7e28, dMm: 0.28, iA: 0.48, setting: "micro-balance suspension wire" },
    { alloy: "copper-nickel conductor", n: 8.1e28, dMm: 1.0, iA: 2.8, setting: "thermocouple extension cable" },
    { alloy: "commercial copper wire", n: 8.5e28, dMm: 0.55, iA: 1.35, setting: "dc electromagnet solenoid" },
  ];

  const items: CandidateQuestionInput[] = [];
  for (let i = 0; i < contexts.length; i += 1) {
    const ctx = contexts[i];
    const seed = baseSeed + 100 + i;
    const isMcq = i < 8;
    const isReverseD = i === 3 || i === 7 || i === 11 || i === 13;
    const mode = isReverseD ? "reverse-d" : "forward-v";

    // Compute clean drift velocity if reverse-d
    const areaRef = (Math.PI * (ctx.dMm * 1e-3) ** 2) / 4;
    const vRef = ctx.iA / (ctx.n * areaRef * NCUK_ELEMENTARY_CHARGE_C);
    const vClean = Number(vRef.toPrecision(3));

    const scenarioSpec: Record<string, unknown> =
      mode === "reverse-d"
        ? {
            kind: "drift-velocity-conduction",
            mode: "reverse-d",
            numberDensityM3: ctx.n,
            currentA: ctx.iA,
            driftVelocityMs: vClean,
          }
        : {
            kind: "drift-velocity-conduction",
            mode: "forward-v",
            numberDensityM3: ctx.n,
            diameterMm: ctx.dMm,
            currentA: ctx.iA,
          };

    const q = solvePlugin("drift-velocity-conduction", scenarioSpec);
    const areaM2 = numQty(q, "areaM2");
    const vMs = numQty(q, "driftVelocityMs");
    const dMm = numQty(q, "diameterMm");
    const dM = numQty(q, "diameterM");
    const driftDir = strQty(q, "electronDriftDirection");

    const nText = formatNcukQuantity(ctx.n, "m⁻³", 3);
    const useMa = i % 3 === 1 && ctx.iA < 1.5;
    const iText = useMa
      ? `${Math.round(ctx.iA * 1000)} mA`
      : formatNcukQuantity(ctx.iA, "A", 3);

    const requiredGivens: RequiredGivenSpec[] =
      mode === "reverse-d"
        ? [
            { name: "numberDensityM3", value: ctx.n, unit: "m⁻³", source: "stem" },
            { name: "currentA", value: ctx.iA, unit: "A", source: "stem" },
            { name: "driftVelocityMs", value: vClean, unit: "m s⁻¹", source: "stem" },
          ]
        : [
            { name: "numberDensityM3", value: ctx.n, unit: "m⁻³", source: "stem" },
            { name: "diameterMm", value: ctx.dMm, unit: "mm", source: "stem" },
            { name: "currentA", value: ctx.iA, unit: "A", source: "stem" },
          ];

    if (isMcq) {
      const targetKey = mode === "reverse-d" ? "diameterMm" : "driftVelocityMs";
      const targetVal = mode === "reverse-d" ? dMm : vMs;
      const unit = mode === "reverse-d" ? "mm" : "m s⁻¹";

      const stem =
        mode === "reverse-d"
          ? `A cylindrical ${ctx.alloy} wire in ${withArticle(ctx.setting)} has a free-electron number density of ${nText} and carries a steady current of ${iText}. Given that the mean electron drift speed is ${formatNcukQuantity(vClean, "m s⁻¹", 3)}, what is the diameter of the wire?`
          : `In ${withArticle(ctx.setting)}, a uniform cylindrical ${ctx.alloy} wire of diameter ${formatNcukQuantity(ctx.dMm, "mm", 3)} carries a steady current of ${iText}. The free-electron number density in the ${ctx.alloy} is ${nText}. Calculate the mean drift speed of the conduction electrons.`;

      const distractors: NumericDistractor[] =
        mode === "reverse-d"
          ? [
              { value: dMm / 2, rationale: "Reported the wire radius r = √(A/π) instead of the diameter d = 2r." },
              { value: dMm * 2, rationale: "Used A = πd² rather than A = πd²/4 when solving for diameter." },
              { value: dMm * Math.sqrt(Math.PI), rationale: "Omitted the factor of π in the circular cross-sectional area." },
              { value: dMm * 0.7, rationale: "Rounded cross-sectional area prematurely before taking the square root." },
            ]
          : [
              { value: vMs / 4, rationale: "Used diameter instead of radius in A = πr² (four times too large an area)." },
              { value: vMs * 4, rationale: "Multiplied by 4 instead of dividing by 4 in A = πd²/4." },
              { value: vMs * Math.PI, rationale: "Omitted π when calculating the circular cross-sectional area." },
              { value: vMs * 1e-6, rationale: "Converted mm to m without squaring the prefix factor for area." },
            ];

      const options = buildNumericMcqOptions({
        correctValue: targetVal,
        unit,
        distractors,
        seed,
      });

      const ansStr = formatNcukQuantity(targetVal, unit, 3);
      const workedSolution =
        mode === "reverse-d"
          ? `Using I = nAve with e = 1.60 × 10⁻¹⁹ C, the cross-sectional area is A = I / (nve) = ${formatNcukQuantity(ctx.iA, "A", 4)} / (${formatNcukQuantity(ctx.n, "m⁻³", 4)} × ${formatNcukQuantity(vClean, "m s⁻¹", 4)} × 1.60 × 10⁻¹⁹ C) = ${formatNcukQuantity(areaM2, "m²", 4)}. Since A = πd²/4, d = √(4A/π) = ${formatNcukQuantity(dM, "m", 4)} = ${ansStr}.`
          : `Convert diameter to metres: d = ${formatNcukQuantity(ctx.dMm * 1e-3, "m", 4)}. Cross-sectional area A = πd²/4 = ${formatNcukQuantity(areaM2, "m²", 4)}. Using I = nAve with e = 1.60 × 10⁻¹⁹ C gives v = I / (nAe) = ${formatNcukQuantity(vMs, "m s⁻¹", 4)} ≈ ${ansStr}.`;

      items.push({
        id: `${NCUK_AC4_ID_PREFIX}-drift-${String(i + 1).padStart(2, "0")}`,
        conceptId: "charge-current-potential-difference",
        templateArchetype: "ncuk-drift-velocity-conductor-wire",
        seed,
        syllabi: syllabiForSubtopic("ncuk-ac4-1"),
        format: "mcq",
        difficulty: difficultyForIndex(i),
        domain: "pure-calculation",
        scenarioSpec,
        hiddenQuantities: [targetKey],
        requiredGivens,
        stem,
        options,
        targetMode: "quantitative",
        targetQuantityKey: targetKey,
        workedSolution,
        markScheme: [
          {
            code: "A1",
            criterion: `Correctly applies I = nAve and A = πd²/4 to obtain ${ansStr}.`,
            marks: 1,
          },
        ],
        totalMarks: 1,
        generatorModel,
      });
    } else {
      // 5-mark structured: (a) 2m area, (b) 2m v or d, (c) 1m qualitative drift direction
      const stem =
        mode === "reverse-d"
          ? `A cylindrical ${ctx.alloy} conductor in ${withArticle(ctx.setting)} carries a steady conventional current of ${iText} from left to right. The metal has a free-electron number density of ${nText}, and conduction electrons drift at a mean speed of ${formatNcukQuantity(vClean, "m s⁻¹", 3)}.`
          : `A cylindrical ${ctx.alloy} conductor of diameter ${formatNcukQuantity(ctx.dMm, "mm", 3)} forms part of ${withArticle(ctx.setting)} and carries a steady conventional current of ${iText} from left to right. The free-electron number density of the ${ctx.alloy} is ${nText}.`;

      const area3 = formatNcukQuantity(areaM2, "m²", 3);
      const area4 = formatNcukQuantity(areaM2, "m²", 4);
      const targetBKey = mode === "reverse-d" ? "diameterMm" : "driftVelocityMs";
      const targetBStr =
        mode === "reverse-d"
          ? formatNcukQuantity(dMm, "mm", 3)
          : formatNcukQuantity(vMs, "m s⁻¹", 3);

      const parts: StructuredQuestionPart[] = [
        {
          partId: "a",
          prompt:
            mode === "reverse-d"
              ? "Calculate the cross-sectional area of the conductor in m²."
              : "Calculate the cross-sectional area of the wire in m².",
          marks: 2,
          targetMode: "quantitative",
          targetQuantityKey: "areaM2",
          expectedAnswer: area3,
          workingSteps:
            mode === "reverse-d"
              ? [
                  `Rearrange I = nAve to A = I / (nve).`,
                  `Substitute I = ${formatNcukQuantity(ctx.iA, "A", 4)}, n = ${nText}, v = ${formatNcukQuantity(vClean, "m s⁻¹", 4)}, e = 1.60 × 10⁻¹⁹ C.`,
                  `A = ${area4} ≈ ${area3}.`,
                ]
              : [
                  `Convert diameter: d = ${ctx.dMm} mm = ${formatNcukQuantity(ctx.dMm * 1e-3, "m", 4)}.`,
                  `Compute A = πd²/4 = π × (${formatNcukQuantity(ctx.dMm * 1e-3, "m", 4)})² / 4 = ${area4} ≈ ${area3}.`,
                ],
        },
        {
          partId: "b",
          prompt:
            mode === "reverse-d"
              ? "Determine the diameter of the conductor in mm."
              : "Determine the mean drift velocity of the free electrons in m s⁻¹.",
          marks: 2,
          dependsOnPartIds: ["a"],
          targetMode: "quantitative",
          targetQuantityKey: targetBKey,
          expectedAnswer: targetBStr,
          workingSteps:
            mode === "reverse-d"
              ? [
                  `Use A = πd²/4 so d = √(4A / π).`,
                  `d = √(4 × ${area4} / π) = ${formatNcukQuantity(dM, "m", 4)} = ${targetBStr}.`,
                ]
              : [
                  `Use v = I / (nAe) with e = 1.60 × 10⁻¹⁹ C.`,
                  `v = ${formatNcukQuantity(ctx.iA, "A", 4)} / (${nText} × ${area4} × 1.60 × 10⁻¹⁹ C) = ${formatNcukQuantity(vMs, "m s⁻¹", 4)} ≈ ${targetBStr}.`,
                ],
        },
        {
          partId: "c",
          prompt:
            "State the direction of the mean drift velocity of the conduction electrons relative to the conventional current.",
          marks: 1,
          targetMode: "qualitative",
          targetQuantityKey: "electronDriftDirection",
          expectedAnswer:
            "Electrons drift from right to left, opposite to conventional current.",
          workingSteps: [
            "Conduction electrons carry negative charge, so they move opposite to conventional current.",
          ],
        },
      ];

      const markScheme: MarkSchemePoint[] = [
        {
          code: "M1",
          partId: "a",
          criterion:
            mode === "reverse-d"
              ? "Correct rearrangement A = I / (nve) with e = 1.60 × 10⁻¹⁹ C."
              : "Converts diameter from mm to m and substitutes into A = πd²/4 (or πr²).",
          marks: 1,
        },
        {
          code: "A1",
          partId: "a",
          criterion: `Correct cross-sectional area ${area3} (4 s.f. ${area4}).`,
          marks: 1,
        },
        {
          code: "M1",
          partId: "b",
          criterion:
            mode === "reverse-d"
              ? "Substitutes area into d = √(4A / π)."
              : "Rearranges I = nAve to v = I / (nAe) and substitutes values.",
          marks: 1,
        },
        {
          code: "A1",
          partId: "b",
          criterion: `Correct final value ${targetBStr}.`,
          marks: 1,
        },
        {
          code: "B1",
          partId: "c",
          criterion: `States electrons drift ${driftDir} (from right to left).`,
          marks: 1,
        },
      ];

      items.push({
        id: `${NCUK_AC4_ID_PREFIX}-drift-${String(i + 1).padStart(2, "0")}`,
        conceptId: "charge-current-potential-difference",
        templateArchetype: "ncuk-drift-velocity-conductor-wire",
        seed,
        syllabi: syllabiForSubtopic("ncuk-ac4-1"),
        format: "structured",
        difficulty: difficultyForIndex(i),
        domain: "pure-calculation",
        scenarioSpec,
        hiddenQuantities: ["areaM2", targetBKey, "electronDriftDirection"],
        requiredGivens,
        stem,
        parts,
        workedSolution: `(a) A = ${area4} ≈ ${area3}. (b) ${mode === "reverse-d" ? "d" : "v"} = ${targetBStr}. (c) Because electrons are negatively charged, they drift ${driftDir} (right to left).`,
        markScheme,
        totalMarks: 5,
        generatorModel,
      });
    }
  }
  return items;
}

/* -------------------------------------------------------------------------- */
/*  2. AC4.1 :: Charge, Electron Count & Electrical Work (14 items)           */
/* -------------------------------------------------------------------------- */

function buildChargeElectronItems(
  baseSeed: number,
  generatorModel: string,
): CandidateQuestionInput[] {
  const configs = [
    { device: "portable LED lantern", iMa: 240, tMin: 4.5, vV: 6.0 },
    { device: "electroplating bath", iMa: 1450, tMin: 8.0, vV: 4.5 },
    { device: "microcontroller logger", iMa: 45, tMin: 12.0, vV: 3.3 },
    { device: "bench Peltier cooler", iMa: 2200, tMin: 3.5, vV: 12.0 },
    { device: "rechargeable cell pack", iMa: 650, tMin: 10.0, vV: 9.0 },
    { device: "laboratory heater coil", iMa: 1850, tMin: 2.5, vV: 24.0 },
    { device: "optical sensor module", iMa: 85, tMin: 6.0, vV: 5.0 },
    { device: "miniature DC pump", iMa: 520, tMin: 5.0, vV: 15.0 },
    { device: "field radio transceiver", iMa: 310, tMin: 7.5, vV: 12.0 },
    { device: "soldering iron cartridge", iMa: 2600, tMin: 2.0, vV: 18.0 },
    { device: "battery-powered fan", iMa: 420, tMin: 9.0, vV: 6.0 },
    { device: "hydrogen electrolysis cell", iMa: 1250, tMin: 4.0, vV: 9.0 },
    { device: "ultrasonic cleaner driver", iMa: 780, tMin: 3.0, vV: 20.0 },
    { device: "digital oscilloscope rail", iMa: 160, tMin: 11.0, vV: 15.0 },
  ];

  const items: CandidateQuestionInput[] = [];
  for (let i = 0; i < configs.length; i += 1) {
    const cfg = configs[i];
    const seed = baseSeed + 200 + i;
    const isMcq = i < 8;
    const currentA = cfg.iMa / 1000;
    const timeS = cfg.tMin * 60;
    const scenarioSpec: Record<string, unknown> = {
      kind: "charge-electron-count",
      currentA,
      timeS,
      voltageV: cfg.vV,
    };
    const q = solvePlugin("charge-electron-count", scenarioSpec);
    const chargeC = numQty(q, "chargeC");
    const electronCount = numQty(q, "electronCount");
    const workDoneJ = numQty(q, "workDoneJ");
    const coulombDef = strQty(q, "coulombDefinition");

    const useMaText = cfg.iMa < 1000;
    const iStr = useMaText
      ? `${cfg.iMa} mA`
      : formatNcukQuantity(currentA, "A", 3);
    const tStr = `${cfg.tMin} min`;
    const vStr = formatNcukQuantity(cfg.vV, "V", 3);

    const requiredGivens: RequiredGivenSpec[] = [
      { name: "currentA", value: currentA, unit: "A", source: "stem" },
      { name: "timeS", value: timeS, unit: "s", source: "stem" },
      { name: "voltageV", value: cfg.vV, unit: "V", source: "stem" },
    ];

    if (isMcq) {
      const askWork = i % 3 === 2;
      const targetKey = askWork ? "workDoneJ" : "electronCount";
      const targetVal = askWork ? workDoneJ : electronCount;
      const unit = askWork ? "J" : undefined;

      const stem = askWork
        ? `${withArticle(cfg.device, true)} operates at a steady potential difference of ${vStr} and draws a constant current of ${iStr} for ${tStr}. How much electrical work is transferred during this interval?`
        : `${withArticle(cfg.device, true)} connected across a ${vStr} supply draws a constant current of ${iStr} for ${tStr}. How many electrons pass a fixed cross-section of the connecting wire in this time?`;

      const distractors: NumericDistractor[] = askWork
        ? [
            { value: workDoneJ / 60, rationale: "Forgot to convert operating time from minutes into seconds." },
            { value: workDoneJ * 1000, rationale: "Omitted the mA-to-A prefix conversion (10³ error)." },
            { value: chargeC, rationale: "Calculated charge Q = It instead of electrical work W = QV." },
            { value: workDoneJ / cfg.vV * 2, rationale: "Used an incorrect power expression instead of W = IVt." },
          ]
        : [
            { value: electronCount / 60, rationale: "Forgot to convert time from minutes to seconds (factor of 60 error)." },
            { value: electronCount * (useMaText ? 1000 : 60), rationale: "Applied the wrong unit conversion factor for current or time." },
            { value: chargeC * NCUK_ELEMENTARY_CHARGE_C, rationale: "Multiplied charge by e instead of dividing Q by e." },
            { value: electronCount * 2, rationale: "Divided by half the elementary charge." },
          ];

      const options = buildNumericMcqOptions({
        correctValue: targetVal,
        unit,
        distractors,
        seed,
      });

      const ansStr = formatNcukQuantity(targetVal, unit, 3);
      const workedSolution = askWork
        ? `Convert time t = ${cfg.tMin} × 60 = ${timeS} s and current I = ${formatNcukQuantity(currentA, "A", 4)}. Charge Q = It = ${formatNcukQuantity(chargeC, "C", 4)}. Electrical work W = QV = ${formatNcukQuantity(workDoneJ, "J", 4)} ≈ ${ansStr}.`
        : `Convert time t = ${cfg.tMin} × 60 = ${timeS} s and current I = ${formatNcukQuantity(currentA, "A", 4)}. Total charge Q = It = ${formatNcukQuantity(chargeC, "C", 4)}. Number of electrons N = Q / e = ${formatNcukQuantity(chargeC, "C", 4)} / (1.60 × 10⁻¹⁹ C) = ${formatNcukQuantity(electronCount, undefined, 4)} ≈ ${ansStr}.`;

      items.push({
        id: `${NCUK_AC4_ID_PREFIX}-charge-${String(i + 1).padStart(2, "0")}`,
        conceptId: "charge-current-potential-difference",
        templateArchetype: "ncuk-charge-current-electron-count",
        seed,
        syllabi: syllabiForSubtopic("ncuk-ac4-1"),
        format: "mcq",
        difficulty: difficultyForIndex(i),
        domain: "pure-calculation",
        scenarioSpec,
        hiddenQuantities: [targetKey],
        requiredGivens,
        stem,
        options,
        targetMode: "quantitative",
        targetQuantityKey: targetKey,
        workedSolution,
        markScheme: [
          {
            code: "A1",
            criterion: `Converts units accurately and obtains ${ansStr}.`,
            marks: 1,
          },
        ],
        totalMarks: 1,
        generatorModel,
      });
    } else {
      // 4-mark structured: (a) 1m define coulomb (qual), (b) 2m electron count, (c) 1m electrical work
      const stem = `During a bench test, ${withArticle(cfg.device)} runs from a regulated ${vStr} DC source at a steady current of ${iStr} for ${tStr}.`;
      const q4 = formatNcukQuantity(chargeC, "C", 4);
      const ne3 = formatNcukQuantity(electronCount, undefined, 3);
      const ne4 = formatNcukQuantity(electronCount, undefined, 4);
      const w3 = formatNcukQuantity(workDoneJ, "J", 3);
      const w4 = formatNcukQuantity(workDoneJ, "J", 4);

      const parts: StructuredQuestionPart[] = [
        {
          partId: "a",
          prompt: "Define the coulomb.",
          marks: 1,
          targetMode: "qualitative",
          targetQuantityKey: "coulombDefinition",
          expectedAnswer: `The coulomb is the ${coulombDef}.`,
          workingSteps: [
            "Recall the SI definition linking electric charge, steady current, and time.",
          ],
        },
        {
          partId: "b",
          prompt:
            "Calculate the number of conduction electrons passing through the device during the test.",
          marks: 2,
          targetMode: "quantitative",
          targetQuantityKey: "electronCount",
          expectedAnswer: `${ne3} electrons`,
          workingSteps: [
            `Convert t = ${cfg.tMin} × 60 = ${timeS} s and I = ${formatNcukQuantity(currentA, "A", 4)}.`,
            `Charge transferred Q = It = ${q4}.`,
            `Number of electrons N = Q / e = ${q4} / (1.60 × 10⁻¹⁹ C) = ${ne4} ≈ ${ne3}.`,
          ],
        },
        {
          partId: "c",
          prompt:
            "Calculate the total electrical work done by the supply during the test.",
          marks: 1,
          dependsOnPartIds: ["b"],
          targetMode: "quantitative",
          targetQuantityKey: "workDoneJ",
          expectedAnswer: w3,
          workingSteps: [
            `Use W = QV = ${q4} × ${vStr} = ${w4} ≈ ${w3}.`,
          ],
        },
      ];

      const markScheme: MarkSchemePoint[] = [
        {
          code: "B1",
          partId: "a",
          criterion: `States that one coulomb is the ${coulombDef}.`,
          marks: 1,
        },
        {
          code: "M1",
          partId: "b",
          criterion: `Converts time to ${timeS} s, computes Q = It = ${q4}, and divides by e = 1.60 × 10⁻¹⁹ C.`,
          marks: 1,
        },
        {
          code: "A1",
          partId: "b",
          criterion: `Correct electron count ${ne3}.`,
          marks: 1,
        },
        {
          code: "A1",
          partId: "c",
          criterion: `Correct electrical work W = QV = ${w3}.`,
          marks: 1,
        },
      ];

      items.push({
        id: `${NCUK_AC4_ID_PREFIX}-charge-${String(i + 1).padStart(2, "0")}`,
        conceptId: "charge-current-potential-difference",
        templateArchetype: "ncuk-charge-current-electron-count",
        seed,
        syllabi: syllabiForSubtopic("ncuk-ac4-1"),
        format: "structured",
        difficulty: difficultyForIndex(i),
        domain: "pure-calculation",
        scenarioSpec,
        hiddenQuantities: ["chargeC", "electronCount", "workDoneJ", "coulombDefinition"],
        requiredGivens,
        stem,
        parts,
        workedSolution: `(a) One coulomb is the ${coulombDef}. (b) Q = It = ${q4}, so N = Q/e = ${ne4} ≈ ${ne3} electrons. (c) W = QV = ${w4} ≈ ${w3}.`,
        markScheme,
        totalMarks: 4,
        generatorModel,
      });
    }
  }
  return items;
}

/* -------------------------------------------------------------------------- */
/*  3. AC4.1 :: Two-Loop Kirchhoff Simultaneous Equations (14 items + SVG)    */
/* -------------------------------------------------------------------------- */

function buildKirchhoffTwoLoopItems(
  baseSeed: number,
  generatorModel: string,
): CandidateQuestionInput[] {
  const setups = [
    { e1: 12.0, r1: 4.0, r2: 6.0, r3: 5.0, i3: 0.8, ctx: "dual-battery bench circuit" },
    { e1: 9.0, r1: 3.0, r2: 4.5, r3: 6.0, i3: 0.6, ctx: "laboratory Kirchhoff network" },
    { e1: 15.0, r1: 5.0, r2: 8.0, r3: 4.0, i3: 1.0, ctx: "backup DC power rail" },
    { e1: 10.5, r1: 3.5, r2: 5.0, r3: 4.5, i3: 0.9, ctx: "two-branch student rig" },
    { e1: 14.0, r1: 6.0, r2: 4.0, r3: 7.0, i3: 1.2, ctx: "sensor bias circuit" },
    { e1: 8.0, r1: 2.5, r2: 5.5, r3: 3.0, i3: 0.7, ctx: "compact dual-cell board" },
    { e1: 11.0, r1: 4.0, r2: 6.0, r3: 8.0, i3: 0.65, ctx: "prototype metering network" },
    { e1: 13.5, r1: 4.5, r2: 7.5, r3: 5.5, i3: 0.85, ctx: "twin-supply test harness" },
    { e1: 12.5, r1: 5.0, r2: 5.0, r3: 6.0, i3: 1.1, ctx: "engineering teaching circuit" },
    { e1: 9.5, r1: 2.0, r2: 6.0, r3: 4.0, i3: 0.75, ctx: "low-voltage junction board" },
    { e1: 14.5, r1: 5.5, r2: 6.5, r3: 3.5, i3: 0.95, ctx: "field-calibration DC loop" },
    { e1: 10.0, r1: 3.0, r2: 7.0, r3: 5.0, i3: 0.6, ctx: "split-branch resistor panel" },
    { e1: 15.0, r1: 6.0, r2: 9.0, r3: 4.5, i3: 0.8, ctx: "multi-loop diagnostics rig" },
    { e1: 11.5, r1: 3.5, r2: 4.5, r3: 6.5, i3: 1.05, ctx: "dc circuit verification board" },
  ];

  const items: CandidateQuestionInput[] = [];
  for (let i = 0; i < setups.length; i += 1) {
    const s = setups[i];
    const seed = baseSeed + 300 + i;
    const isMcq = i < 8;
    const scenarioSpec: Record<string, unknown> = {
      kind: "multi-loop-kirchhoff-cells",
      mode: "two-loop",
      emf1V: s.e1,
      r1Ohm: s.r1,
      r2Ohm: s.r2,
      r3Ohm: s.r3,
      i3A: s.i3,
    };
    const q = solvePlugin("multi-loop-kirchhoff-cells", scenarioSpec);
    const i1A = numQty(q, "i1A");
    const i2A = numQty(q, "i2A");
    const emf2V = numQty(q, "emf2V");
    const cons1 = strQty(q, "firstLawConservation");
    const cons2 = strQty(q, "secondLawConservation");

    const requiredGivens: RequiredGivenSpec[] = [
      { name: "emf1V", value: s.e1, unit: "V", source: "either" },
      { name: "r1Ohm", value: s.r1, unit: "Ω", source: "either" },
      { name: "r2Ohm", value: s.r2, unit: "Ω", source: "either" },
      { name: "r3Ohm", value: s.r3, unit: "Ω", source: "either" },
      { name: "i3A", value: s.i3, unit: "A", source: "either" },
    ];

    if (isMcq) {
      const askI1 = i % 2 === 0;
      const targetKey = askI1 ? "i1A" : "emf2V";
      const targetVal = askI1 ? i1A : emf2V;
      const unit = askI1 ? "A" : "V";

      const stem = askI1
        ? `The diagram shows ${withArticle(s.ctx)} containing two cells of negligible internal resistance. In the upper branch ε₁ = ${formatNcukQuantity(s.e1, "V", 3)} and R₁ = ${formatNcukQuantity(s.r1, "Ω", 3)}; in the shared middle branch R₂ = ${formatNcukQuantity(s.r2, "Ω", 3)}; and in the bottom branch R₃ = ${formatNcukQuantity(s.r3, "Ω", 3)} carries a current I₃ = ${formatNcukQuantity(s.i3, "A", 3)}. What is the current I₁ in the upper branch?`
        : `In the ${s.ctx} shown, both cells have negligible internal resistance, with ε₁ = ${formatNcukQuantity(s.e1, "V", 3)}, R₁ = ${formatNcukQuantity(s.r1, "Ω", 3)}, R₂ = ${formatNcukQuantity(s.r2, "Ω", 3)}, and R₃ = ${formatNcukQuantity(s.r3, "Ω", 3)}. Given that the current in the lower branch is I₃ = ${formatNcukQuantity(s.i3, "A", 3)}, calculate the electromotive force ε₂ of the lower cell.`;

      const distractors: NumericDistractor[] = askI1
        ? [
            { value: s.e1 / (s.r1 + s.r2), rationale: "Ignored the contribution of I₃ to the middle branch current I₂ = I₁ + I₃." },
            { value: (s.e1 + s.i3 * s.r2) / (s.r1 + s.r2), rationale: "Subtracted I₃ instead of adding it in Kirchhoff's junction law I₂ = I₁ + I₃." },
            { value: i2A, rationale: "Reported the middle branch current I₂ rather than the upper branch current I₁." },
          ]
        : [
            { value: i2A * s.r2 - s.i3 * s.r3, rationale: "Subtracted I₃ R₃ instead of adding it around the lower closed loop." },
            { value: s.i3 * (s.r2 + s.r3), rationale: "Assumed only I₃ passes through the shared middle resistor R₂." },
            { value: i1A * s.r2 + s.i3 * s.r3, rationale: "Used I₁ instead of I₂ = I₁ + I₃ in the shared middle branch." },
          ];

      const options = buildNumericMcqOptions({
        correctValue: targetVal,
        unit,
        distractors,
        seed,
      });

      const ansStr = formatNcukQuantity(targetVal, unit, 3);
      const workedSolution = `At junction Q, Kirchhoff's first law gives I₂ = I₁ + I₃. Around the upper loop, ε₁ − I₁R₁ − I₂R₂ = 0, so I₁ = (ε₁ − I₃R₂) / (R₁ + R₂) = ${formatNcukQuantity(i1A, "A", 4)} and I₂ = ${formatNcukQuantity(i2A, "A", 4)}. Around the lower loop, ε₂ = I₂R₂ + I₃R₃ = ${formatNcukQuantity(emf2V, "V", 4)}. Hence the required answer is ${ansStr}.`;

      items.push({
        id: `${NCUK_AC4_ID_PREFIX}-k2loop-${String(i + 1).padStart(2, "0")}`,
        conceptId: "kirchhoff-dc-circuits",
        templateArchetype: "ncuk-kirchhoff-two-loop-network",
        seed,
        syllabi: syllabiForSubtopic("ncuk-ac4-1"),
        format: "mcq",
        difficulty: difficultyForIndex(i),
        domain: "circuits",
        scenarioSpec,
        hiddenQuantities: ["i1A", "i2A", "emf2V"],
        requiredGivens,
        stem,
        options,
        targetMode: "quantitative",
        targetQuantityKey: targetKey,
        workedSolution,
        markScheme: [
          {
            code: "A1",
            criterion: `Applies Kirchhoff's first and second laws to obtain ${ansStr}.`,
            marks: 1,
          },
        ],
        totalMarks: 1,
        generatorModel,
      });
    } else {
      // 6-mark structured: (a) 1m conservation law, (b) 2m find I1 and I2 (target i1A), (c) 3m find emf2V
      const askSecondLaw = i % 2 === 1;
      const lawKey = askSecondLaw ? "secondLawConservation" : "firstLawConservation";
      const lawText = askSecondLaw ? cons2 : cons1;
      const i1Str3 = formatNcukQuantity(i1A, "A", 3);
      const i1Str4 = formatNcukQuantity(i1A, "A", 4);
      const i2Str3 = formatNcukQuantity(i2A, "A", 3);
      const i2Str4 = formatNcukQuantity(i2A, "A", 4);
      const e2Str3 = formatNcukQuantity(emf2V, "V", 3);
      const e2Str4 = formatNcukQuantity(emf2V, "V", 4);

      const stem = `The circuit diagram shows ${withArticle(s.ctx)} with two ideal cells of negligible internal resistance. Component values are ε₁ = ${formatNcukQuantity(s.e1, "V", 3)}, R₁ = ${formatNcukQuantity(s.r1, "Ω", 3)}, R₂ = ${formatNcukQuantity(s.r2, "Ω", 3)}, and R₃ = ${formatNcukQuantity(s.r3, "Ω", 3)}. The steady current in the bottom branch is measured as I₃ = ${formatNcukQuantity(s.i3, "A", 3)}.`;

      const parts: StructuredQuestionPart[] = [
        {
          partId: "a",
          prompt: askSecondLaw
            ? "State the fundamental conservation law on which Kirchhoff's second law is based."
            : "State the fundamental conservation law on which Kirchhoff's first law is based.",
          marks: 1,
          targetMode: "qualitative",
          targetQuantityKey: lawKey,
          expectedAnswer: askSecondLaw
            ? `Kirchhoff's second law is based on the ${cons2}.`
            : `Kirchhoff's first law is based on the ${cons1}.`,
          workingSteps: [
            askSecondLaw
              ? "Potential differences around a closed loop reflect electrical energy per unit charge."
              : "Current entering a junction equals current leaving because charge cannot accumulate.",
          ],
        },
        {
          partId: "b",
          prompt:
            "Apply Kirchhoff's laws to the upper loop and junction Q to calculate the current I₁ in the upper branch (and hence find I₂).",
          marks: 2,
          targetMode: "quantitative",
          targetQuantityKey: "i1A",
          expectedAnswer: `I₁ = ${i1Str3} (giving I₂ = ${i2Str3})`,
          workingSteps: [
            `At junction Q: I₂ = I₁ + I₃ = I₁ + ${formatNcukQuantity(s.i3, "A", 3)}.`,
            `Upper loop: ε₁ = I₁R₁ + (I₁ + I₃)R₂ → I₁ = (${s.e1} − ${s.i3} × ${s.r2}) / (${s.r1} + ${s.r2}) = ${i1Str4} ≈ ${i1Str3}.`,
            `Middle branch: I₂ = ${i1Str4} + ${formatNcukQuantity(s.i3, "A", 4)} = ${i2Str4} ≈ ${i2Str3}.`,
          ],
        },
        {
          partId: "c",
          prompt:
            "Apply Kirchhoff's second law to the lower loop to determine the electromotive force ε₂.",
          marks: 3,
          dependsOnPartIds: ["b"],
          targetMode: "quantitative",
          targetQuantityKey: "emf2V",
          expectedAnswer: e2Str3,
          workingSteps: [
            `State lower-loop equation: ε₂ = I₂R₂ + I₃R₃.`,
            `Calculate potential drop across R₂: I₂R₂ = ${i2Str4} × ${s.r2} = ${formatNcukQuantity(i2A * s.r2, "V", 4)}.`,
            `Add potential drop across R₃: ε₂ = ${formatNcukQuantity(i2A * s.r2, "V", 4)} + ${formatNcukQuantity(s.i3 * s.r3, "V", 4)} = ${e2Str4} ≈ ${e2Str3}.`,
          ],
        },
      ];

      const markScheme: MarkSchemePoint[] = [
        {
          code: "B1",
          partId: "a",
          criterion: `States ${lawText}.`,
          marks: 1,
        },
        {
          code: "M1",
          partId: "b",
          criterion: "Substitutes I₂ = I₁ + I₃ into ε₁ = I₁R₁ + I₂R₂ correctly.",
          marks: 1,
        },
        {
          code: "A1",
          partId: "b",
          criterion: `Correct current I₁ = ${i1Str3} (and I₂ = ${i2Str3}).`,
          marks: 1,
        },
        {
          code: "M1",
          partId: "c",
          criterion: "Correctly evaluates middle-branch current I₂ = I₁ + I₃ and states ε₂ = I₂R₂ + I₃R₃.",
          marks: 1,
        },
        {
          code: "M1",
          partId: "c",
          criterion: "Substitutes I₂R₂ and I₃R₃ consistently into the lower-loop equation.",
          marks: 1,
        },
        {
          code: "A1",
          partId: "c",
          criterion: `Correct electromotive force ε₂ = ${e2Str3}.`,
          marks: 1,
        },
      ];

      items.push({
        id: `${NCUK_AC4_ID_PREFIX}-k2loop-${String(i + 1).padStart(2, "0")}`,
        conceptId: "kirchhoff-dc-circuits",
        templateArchetype: "ncuk-kirchhoff-two-loop-network",
        seed,
        syllabi: syllabiForSubtopic("ncuk-ac4-1"),
        format: "structured",
        difficulty: difficultyForIndex(i),
        domain: "circuits",
        scenarioSpec,
        hiddenQuantities: ["i1A", "i2A", "emf2V", lawKey],
        requiredGivens,
        stem,
        parts,
        workedSolution: `(a) Based on ${lawText}. (b) I₁ = ${i1Str4} ≈ ${i1Str3}, so I₂ = I₁ + I₃ = ${i2Str4} ≈ ${i2Str3}. (c) ε₂ = I₂R₂ + I₃R₃ = ${e2Str4} ≈ ${e2Str3}.`,
        markScheme,
        totalMarks: 6,
        generatorModel,
      });
    }
  }
  return items;
}

/* -------------------------------------------------------------------------- */
/*  4. AC4.1 :: Opposing-Polarity Series Cells Loop (14 items + SVG)          */
/* -------------------------------------------------------------------------- */

function buildOpposingCellsItems(
  baseSeed: number,
  generatorModel: string,
): CandidateQuestionInput[] {
  const configs = [
    { e1: 1.5, e2: 4.5, r1: 1500, v1: 1.8, tMin: 3, ctx: "student polarity test loop" },
    { e1: 2.0, e2: 6.0, r1: 2000, v1: 2.5, tMin: 4, ctx: "bench comparator circuit" },
    { e1: 3.0, e2: 7.5, r1: 3000, v1: 2.7, tMin: 5, ctx: "dual-cell resistor circuit" },
    { e1: 1.8, e2: 5.4, r1: 1200, v1: 2.4, tMin: 2, ctx: "opposing-emf laboratory rig" },
    { e1: 2.5, e2: 6.5, r1: 4000, v1: 2.4, tMin: 5, ctx: "high-resistance series loop" },
    { e1: 3.2, e2: 8.0, r1: 2400, v1: 3.0, tMin: 3, ctx: "dc series polarity circuit" },
    { e1: 1.6, e2: 5.2, r1: 1800, v1: 2.1, tMin: 4, ctx: "two-cell diagnostic circuit" },
    { e1: 2.4, e2: 7.2, r1: 6000, v1: 3.2, tMin: 2, ctx: "kilohm series test loop" },
    { e1: 1.5, e2: 5.5, r1: 2500, v1: 2.2, tMin: 5, ctx: "classroom emf opposition rig" },
    { e1: 3.0, e2: 8.5, r1: 5000, v1: 3.5, tMin: 3, ctx: "precision divider test loop" },
    { e1: 2.2, e2: 6.2, r1: 1600, v1: 2.4, tMin: 4, ctx: "series battery calibration circuit" },
    { e1: 4.0, e2: 8.5, r1: 3600, v1: 2.7, tMin: 2, ctx: "inverted-cell bench circuit" },
    { e1: 1.5, e2: 6.0, r1: 4500, v1: 2.7, tMin: 5, ctx: "two-resistor polarity loop" },
    { e1: 2.8, e2: 7.6, r1: 3200, v1: 3.2, tMin: 3, ctx: "series loop with opposing cells" },
  ];

  const items: CandidateQuestionInput[] = [];
  for (let i = 0; i < configs.length; i += 1) {
    const c = configs[i];
    const seed = baseSeed + 400 + i;
    const isMcq = i < 8;
    const scenarioSpec: Record<string, unknown> = {
      kind: "multi-loop-kirchhoff-cells",
      mode: "opposing-series",
      emf1V: c.e1,
      emf2V: c.e2,
      r1Ohm: c.r1,
      v1V: c.v1,
      timeMin: c.tMin,
    };
    const q = solvePlugin("multi-loop-kirchhoff-cells", scenarioSpec);
    const netEmfV = numQty(q, "netEmfV");
    const currentA = numQty(q, "currentA");
    const v2V = numQty(q, "v2V");
    const r2Ohm = numQty(q, "r2Ohm");
    const energyR1J = numQty(q, "energyR1J");

    const r1KStr = `${formatNcukQuantity(c.r1 / 1000, "kΩ", 3)}`;
    const requiredGivens: RequiredGivenSpec[] = [
      { name: "emf1V", value: c.e1, unit: "V", source: "either" },
      { name: "emf2V", value: c.e2, unit: "V", source: "either" },
      { name: "r1Ohm", value: c.r1, unit: "Ω", source: "either" },
      { name: "v1V", value: c.v1, unit: "V", source: "either" },
    ];

    if (isMcq) {
      const stem = `In the ${c.ctx} shown, two ideal cells of electromotive forces ε₁ = ${formatNcukQuantity(c.e1, "V", 3)} and ε₂ = ${formatNcukQuantity(c.e2, "V", 3)} are connected in opposition in series with R₁ = ${r1KStr} and an unknown resistor R₂. An ideal voltmeter across R₁ reads V₁ = ${formatNcukQuantity(c.v1, "V", 3)}. What is the resistance of R₂?`;

      const addedR2 = ((c.e1 + c.e2 - c.v1) / c.v1) * c.r1;
      const distractors: NumericDistractor[] = [
        { value: addedR2, rationale: "Added the two cell emfs (ε₁ + ε₂) instead of subtracting opposing cells (ε₂ − ε₁)." },
        { value: (c.e2 / c.v1 - 1) * c.r1, rationale: "Ignored cell ε₁ when calculating the net electromotive force." },
        { value: (c.v1 / v2V) * c.r1, rationale: "Inverted the potential-divider voltage ratio V₁ / V₂ instead of V₂ / V₁." },
      ];

      const options = buildNumericMcqOptions({
        correctValue: r2Ohm,
        unit: "Ω",
        distractors,
        seed,
      });

      const ansStr = formatNcukQuantity(r2Ohm, "Ω", 3);
      const workedSolution = `Since the positive terminals face each other, net emf ε_net = ε₂ − ε₁ = ${formatNcukQuantity(netEmfV, "V", 4)}. Current I = V₁ / R₁ = ${formatNcukQuantity(currentA, "A", 4)}. Potential difference across R₂ is V₂ = ε_net − V₁ = ${formatNcukQuantity(v2V, "V", 4)}, so R₂ = V₂ / I = ${formatNcukQuantity(r2Ohm, "Ω", 4)} ≈ ${ansStr}.`;

      items.push({
        id: `${NCUK_AC4_ID_PREFIX}-oppcell-${String(i + 1).padStart(2, "0")}`,
        conceptId: "kirchhoff-dc-circuits",
        templateArchetype: "ncuk-opposing-series-cells-loop",
        seed,
        syllabi: syllabiForSubtopic("ncuk-ac4-1"),
        format: "mcq",
        difficulty: difficultyForIndex(i),
        domain: "circuits",
        scenarioSpec,
        hiddenQuantities: ["r2Ohm", "r2Kohm", "currentA", "energyR1J"],
        requiredGivens,
        stem,
        options,
        targetMode: "quantitative",
        targetQuantityKey: "r2Ohm",
        workedSolution,
        markScheme: [
          {
            code: "A1",
            criterion: `Uses opposing net emf ε₂ − ε₁ = ${formatNcukQuantity(netEmfV, "V", 3)} to find R₂ = ${ansStr}.`,
            marks: 1,
          },
        ],
        totalMarks: 1,
        generatorModel,
      });
    } else {
      // 4-mark structured: (a) 2m find R2, (b) 2m thermal energy in R1 over tMin
      const r2Str3 = formatNcukQuantity(r2Ohm, "Ω", 3);
      const r2Str4 = formatNcukQuantity(r2Ohm, "Ω", 4);
      const eStr3 = formatNcukQuantity(energyR1J, "J", 3);
      const eStr4 = formatNcukQuantity(energyR1J, "J", 4);
      const stem = `Two ideal cells of emfs ε₁ = ${formatNcukQuantity(c.e1, "V", 3)} and ε₂ = ${formatNcukQuantity(c.e2, "V", 3)} are wired in opposing polarity in the ${c.ctx} shown, together with R₁ = ${r1KStr} and an unknown resistor R₂. The ideal voltmeter across R₁ reads V₁ = ${formatNcukQuantity(c.v1, "V", 3)}. The circuit remains closed for ${c.tMin} min.`;

      const parts: StructuredQuestionPart[] = [
        {
          partId: "a",
          prompt:
            "Calculate the circuit current and hence determine the resistance of R₂.",
          marks: 2,
          targetMode: "quantitative",
          targetQuantityKey: "r2Ohm",
          expectedAnswer: r2Str3,
          workingSteps: [
            `Opposing cells give net emf ε_net = ε₂ − ε₁ = ${formatNcukQuantity(netEmfV, "V", 4)}.`,
            `Series current I = V₁ / R₁ = ${c.v1} / ${c.r1} = ${formatNcukQuantity(currentA, "A", 4)}.`,
            `Potential difference V₂ = ε_net − V₁ = ${formatNcukQuantity(v2V, "V", 4)}, so R₂ = V₂ / I = ${r2Str4} ≈ ${r2Str3}.`,
          ],
        },
        {
          partId: "b",
          prompt: `Calculate the thermal energy dissipated in resistor R₁ during the ${c.tMin} min interval.`,
          marks: 2,
          targetMode: "quantitative",
          targetQuantityKey: "energyR1J",
          expectedAnswer: eStr3,
          workingSteps: [
            `Convert time: t = ${c.tMin} × 60 = ${c.tMin * 60} s.`,
            `Use E = (V₁² / R₁) × t = (${c.v1}² / ${c.r1}) × ${c.tMin * 60} = ${eStr4} ≈ ${eStr3}.`,
          ],
        },
      ];

      const markScheme: MarkSchemePoint[] = [
        {
          code: "M1",
          partId: "a",
          criterion: `Subtracts opposing emfs (ε_net = ${formatNcukQuantity(netEmfV, "V", 3)}) and evaluates I = V₁ / R₁ = ${formatNcukQuantity(currentA, "A", 3)}.`,
          marks: 1,
        },
        {
          code: "A1",
          partId: "a",
          criterion: `Correct resistance R₂ = ${r2Str3}.`,
          marks: 1,
        },
        {
          code: "M1",
          partId: "b",
          criterion: `Converts ${c.tMin} min to ${c.tMin * 60} s and applies E = V₁²t / R₁ (or IV₁t).`,
          marks: 1,
        },
        {
          code: "A1",
          partId: "b",
          criterion: `Correct thermal energy dissipated ${eStr3}.`,
          marks: 1,
        },
      ];

      items.push({
        id: `${NCUK_AC4_ID_PREFIX}-oppcell-${String(i + 1).padStart(2, "0")}`,
        conceptId: "kirchhoff-dc-circuits",
        templateArchetype: "ncuk-opposing-series-cells-loop",
        seed,
        syllabi: syllabiForSubtopic("ncuk-ac4-1"),
        format: "structured",
        difficulty: difficultyForIndex(i),
        domain: "circuits",
        scenarioSpec,
        hiddenQuantities: ["r2Ohm", "r2Kohm", "currentA", "energyR1J"],
        requiredGivens: [
          ...requiredGivens,
          { name: "timeMin", value: c.tMin, unit: "min", source: "stem" },
        ],
        stem,
        parts,
        workedSolution: `(a) Net emf = ε₂ − ε₁ = ${formatNcukQuantity(netEmfV, "V", 4)}, I = ${formatNcukQuantity(currentA, "A", 4)}, V₂ = ${formatNcukQuantity(v2V, "V", 4)}, R₂ = ${r2Str4} ≈ ${r2Str3}. (b) E = (V₁² / R₁) t = ${eStr4} ≈ ${eStr3}.`,
        markScheme,
        totalMarks: 4,
        generatorModel,
      });
    }
  }
  return items;
}

/* -------------------------------------------------------------------------- */
/*  5. AC4.1 :: Parallel Identical Cells Trap (12 items: 8 MCQ + 4 × 2m)      */
/* -------------------------------------------------------------------------- */

function buildParallelCellsItems(
  baseSeed: number,
  generatorModel: string,
): CandidateQuestionInput[] {
  const configs = [
    { emfV: 3.0, loadOhm: 6.0, ctx: "portable lamp pack" },
    { emfV: 4.5, loadOhm: 9.0, ctx: "emergency beacon circuit" },
    { emfV: 6.0, loadOhm: 15.0, ctx: "weather-station battery bank" },
    { emfV: 9.0, loadOhm: 18.0, ctx: "field-logger power supply" },
    { emfV: 1.5, loadOhm: 5.0, ctx: "twin-AA torch circuit" },
    { emfV: 12.0, loadOhm: 20.0, ctx: "marine navigation panel" },
    { emfV: 3.6, loadOhm: 12.0, ctx: "lithium-ion parallel module" },
    { emfV: 7.5, loadOhm: 25.0, ctx: "bench demonstration board" },
    { emfV: 6.0, loadOhm: 8.0, ctx: "dual-cell heater load" },
    { emfV: 4.8, loadOhm: 16.0, ctx: "robot sensor bus" },
    { emfV: 9.0, loadOhm: 12.0, ctx: "telemetry receiver circuit" },
    { emfV: 12.0, loadOhm: 30.0, ctx: "solar storage test rig" },
  ];

  const items: CandidateQuestionInput[] = [];
  for (let i = 0; i < configs.length; i += 1) {
    const c = configs[i];
    const seed = baseSeed + 500 + i;
    const isMcq = i < 8;
    const scenarioSpec: Record<string, unknown> = {
      kind: "multi-loop-kirchhoff-cells",
      mode: "parallel-identical",
      emfV: c.emfV,
      loadOhm: c.loadOhm,
    };
    const q = solvePlugin("multi-loop-kirchhoff-cells", scenarioSpec);
    const mainCurrentA = numQty(q, "mainCurrentA");
    const cellCurrentA = numQty(q, "cellCurrentA");
    const parallelRule = strQty(q, "parallelCellRule");

    const requiredGivens: RequiredGivenSpec[] = [
      { name: "emfV", value: c.emfV, unit: "V", source: "either" },
      { name: "loadOhm", value: c.loadOhm, unit: "Ω", source: "either" },
    ];

    if (isMcq) {
      const askCellCurrent = i % 2 === 1;
      const targetKey = askCellCurrent ? "cellCurrentA" : "mainCurrentA";
      const targetVal = askCellCurrent ? cellCurrentA : mainCurrentA;
      const stem = askCellCurrent
        ? `Two identical ideal cells, each of emf ${formatNcukQuantity(c.emfV, "V", 3)}, are connected in parallel across a ${formatNcukQuantity(c.loadOhm, "Ω", 3)} resistor in ${withArticle(c.ctx)}, as shown. What is the steady current supplied by each individual cell?`
        : `Two identical ideal cells, each of emf ${formatNcukQuantity(c.emfV, "V", 3)}, are connected in parallel to drive a ${formatNcukQuantity(c.loadOhm, "Ω", 3)} load in ${withArticle(c.ctx)}. What reading is shown on the ideal ammeter A in the main branch?`;

      const distractors: NumericDistractor[] = askCellCurrent
        ? [
            { value: mainCurrentA, rationale: "Gave the total main-branch current without dividing equally between the two parallel cells." },
            { value: mainCurrentA * 2, rationale: "Assumed parallel cells double the circuit emf to 2ε." },
            { value: cellCurrentA / 2, rationale: "Halved the emf across parallel cells as well as halving the branch current." },
          ]
        : [
            { value: mainCurrentA * 2, rationale: "Mistakenly added the emfs of parallel cells (2ε / R instead of ε / R)." },
            { value: cellCurrentA, rationale: "Halved the main current instead of recognising each cell supplies half of ε / R." },
            { value: c.emfV * c.loadOhm, rationale: "Multiplied emf by resistance rather than dividing ε by R." },
          ];

      const options = buildNumericMcqOptions({
        correctValue: targetVal,
        unit: "A",
        distractors,
        seed,
      });

      const ansStr = formatNcukQuantity(targetVal, "A", 3);
      const workedSolution = `Identical ideal cells in parallel maintain terminal pd V = ε = ${formatNcukQuantity(c.emfV, "V", 3)} (not 2ε). Main-branch current I = ε / R = ${formatNcukQuantity(mainCurrentA, "A", 4)}, and each cell supplies I/2 = ${formatNcukQuantity(cellCurrentA, "A", 4)}. Thus the answer is ${ansStr}.`;

      items.push({
        id: `${NCUK_AC4_ID_PREFIX}-parcell-${String(i + 1).padStart(2, "0")}`,
        conceptId: "kirchhoff-dc-circuits",
        templateArchetype: "ncuk-parallel-identical-cells-trap",
        seed,
        syllabi: syllabiForSubtopic("ncuk-ac4-1"),
        format: "mcq",
        difficulty: difficultyForIndex(i),
        domain: "circuits",
        scenarioSpec,
        hiddenQuantities: ["mainCurrentA", "cellCurrentA", "loadPowerW"],
        requiredGivens,
        stem,
        options,
        targetMode: "quantitative",
        targetQuantityKey: targetKey,
        workedSolution,
        markScheme: [
          {
            code: "A1",
            criterion: `Uses V = ε for parallel identical cells to obtain ${ansStr}.`,
            marks: 1,
          },
        ],
        totalMarks: 1,
        generatorModel,
      });
    } else {
      // 2-mark short structured: (a) 1m main current, (b) 1m qualitative parallel cell advantage/rule
      const iStr = formatNcukQuantity(mainCurrentA, "A", 3);
      const stem = `In the ${c.ctx} shown, two identical ideal cells of emf ${formatNcukQuantity(c.emfV, "V", 3)} are wired in parallel across a ${formatNcukQuantity(c.loadOhm, "Ω", 3)} resistor with an ideal ammeter A and voltmeter V.`;

      const parts: StructuredQuestionPart[] = [
        {
          partId: "a",
          prompt: "Calculate the reading on the ammeter A.",
          marks: 1,
          targetMode: "quantitative",
          targetQuantityKey: "mainCurrentA",
          expectedAnswer: iStr,
          workingSteps: [
            `For identical cells in parallel, V = ε = ${formatNcukQuantity(c.emfV, "V", 3)}.`,
            `I = V / R = ${c.emfV} / ${c.loadOhm} = ${formatNcukQuantity(mainCurrentA, "A", 4)} ≈ ${iStr}.`,
          ],
        },
        {
          partId: "b",
          prompt:
            "Explain why connecting identical cells in parallel does not double the voltmeter reading.",
          marks: 1,
          targetMode: "qualitative",
          targetQuantityKey: "parallelCellRule",
          expectedAnswer: `Because ${parallelRule}, the potential difference across both branches remains equal to the electromotive force of a single cell.`,
          workingSteps: [
            "Each charge passes through only one cell on any closed loop, so parallel cells share current rather than adding energy per coulomb.",
          ],
        },
      ];

      items.push({
        id: `${NCUK_AC4_ID_PREFIX}-parcell-${String(i + 1).padStart(2, "0")}`,
        conceptId: "kirchhoff-dc-circuits",
        templateArchetype: "ncuk-parallel-identical-cells-trap",
        seed,
        syllabi: syllabiForSubtopic("ncuk-ac4-1"),
        format: "structured",
        difficulty: difficultyForIndex(i),
        domain: "circuits",
        scenarioSpec,
        hiddenQuantities: ["mainCurrentA", "cellCurrentA", "parallelCellRule"],
        requiredGivens,
        stem,
        parts,
        workedSolution: `(a) V = ε = ${formatNcukQuantity(c.emfV, "V", 3)}, so I = ε / R = ${iStr}. (b) ${parallelRule}.`,
        markScheme: [
          {
            code: "A1",
            partId: "a",
            criterion: `Correct ammeter reading ${iStr}.`,
            marks: 1,
          },
          {
            code: "B1",
            partId: "b",
            criterion: `States that ${parallelRule}.`,
            marks: 1,
          },
        ],
        totalMarks: 2,
        generatorModel,
      });
    }
  }
  return items;
}

/* -------------------------------------------------------------------------- */
/*  6. AC4.2 :: Component I-V Curve & LED Procedure (14 items + SVG)          */
/* -------------------------------------------------------------------------- */

function buildComponentIvCurveItems(
  baseSeed: number,
  generatorModel: string,
): CandidateQuestionInput[] {
  const configs: ReadonlyArray<{
    comp: "ohmic-resistor" | "filament-lamp" | "led-diode" | "ntc-thermistor" | "ldr";
    maxV: number;
    vOp: number;
    iOp: number;
    rLow: number;
    rHigh?: number;
    vTh?: number;
    ctx: string;
  }> = [
    { comp: "filament-lamp", maxV: 8, vOp: 6.0, iOp: 0.75, rLow: 8, ctx: "low-voltage bench lamp" },
    { comp: "led-diode", maxV: 3, vOp: 2.4, iOp: 0.02, rLow: 120, vTh: 1.8, ctx: "green indicator diode" },
    { comp: "ntc-thermistor", maxV: 6, vOp: 4.5, iOp: 0.45, rLow: 25, rHigh: 10, ctx: "temperature-probe element" },
    { comp: "ldr", maxV: 6, vOp: 4.0, iOp: 0.4, rLow: 30, rHigh: 10, ctx: "daylight-sensor strip" },
    { comp: "ohmic-resistor", maxV: 10, vOp: 8.0, iOp: 0.64, rLow: 12.5, ctx: "constantan wire coil" },
    { comp: "filament-lamp", maxV: 12, vOp: 9.0, iOp: 1.2, rLow: 7.5, ctx: "headlamp tungsten bulb" },
    { comp: "led-diode", maxV: 3.5, vOp: 2.8, iOp: 0.025, rLow: 112, vTh: 2.1, ctx: "blue semiconductor emitter" },
    { comp: "ntc-thermistor", maxV: 8, vOp: 6.0, iOp: 0.5, rLow: 24, rHigh: 12, ctx: "oven safety thermistor" },
    // Structured 6m items (indices 8..13)
    { comp: "led-diode", maxV: 3, vOp: 2.2, iOp: 0.02, rLow: 110, vTh: 1.6, ctx: "amber LED in an optics rig" },
    { comp: "filament-lamp", maxV: 10, vOp: 7.5, iOp: 0.6, rLow: 12.5, ctx: "tungsten torch filament" },
    { comp: "led-diode", maxV: 3.6, vOp: 3.0, iOp: 0.03, rLow: 100, vTh: 2.2, ctx: "white display LED" },
    { comp: "filament-lamp", maxV: 6, vOp: 4.8, iOp: 0.8, rLow: 6, ctx: "miniature projector bulb" },
    { comp: "ntc-thermistor", maxV: 10, vOp: 8.0, iOp: 0.8, rLow: 20, rHigh: 10, ctx: "bead NTC thermistor" },
    { comp: "ldr", maxV: 8, vOp: 6.0, iOp: 0.75, rLow: 24, rHigh: 8, ctx: "cadmium-sulfide LDR" },
  ];

  const items: CandidateQuestionInput[] = [];
  for (let i = 0; i < configs.length; i += 1) {
    const c = configs[i];
    const seed = baseSeed + 600 + i;
    const isMcq = i < 8;

    const scenarioSpec: Record<string, unknown> = {
      kind: "component-iv-curve",
      mode: "component-characteristic",
      componentType: c.comp,
      maxVoltageV: c.maxV,
      operatingVoltageV: c.vOp,
      operatingCurrentA: c.iOp,
      resistanceOhm: c.rLow,
      ...(c.vTh !== undefined ? { thresholdV: c.vTh } : {}),
      ...(c.rHigh !== undefined ? { highStateResistanceOhm: c.rHigh } : {}),
    };
    const q = solvePlugin("component-iv-curve", scenarioSpec);
    const staticR = numQty(q, "staticResistanceOhm");
    const behavior = strQty(q, "behaviorSummary");
    const compLabel = strQty(q, "componentLabel");
    const ledProc = strQty(q, "ledProcedureSummary");

    if (isMcq) {
      const isQualitativeMcq = i % 2 === 0;
      if (isQualitativeMcq) {
        const stem =
          c.comp === "ntc-thermistor" || c.comp === "ldr"
            ? `The graph shows two I–V curves (Curve P and Curve Q) obtained for ${withArticle(c.ctx)} under two different physical conditions, with current I plotted on the vertical axis and potential difference V on the horizontal axis. Which statement best explains the behaviour of this component?`
            : `The I–V characteristic graph shown (current I on the vertical axis against potential difference V on the horizontal axis) was recorded for ${withArticle(c.ctx)}. Which physical explanation correctly describes the shape of this characteristic?`;

        const distractorPool: Record<string, { text: string; rationale: string }[]> = {
          "filament-lamp": [
            { text: "Resistance decreases with potential difference because heating frees additional metallic conduction electrons.", rationale: "Confuses a metal filament with an NTC semiconductor thermistor." },
            { text: "Resistance stays constant across the entire voltage range because the curve passes through the origin.", rationale: "Passing through the origin does not imply linearity or constant resistance." },
            { text: "Resistance drops to zero once the potential difference becomes negative.", rationale: "A filament lamp is symmetric in reverse polarity and still resists current." },
          ],
          "led-diode": [
            { text: "Conducts equally well in forward and reverse bias with constant resistance.", rationale: "Describes an ohmic resistor rather than a semiconductor diode." },
            { text: "Resistance increases steadily as forward current increases due to filament heating.", rationale: "Describes a metallic filament lamp rather than a diode knee." },
            { text: "Conducts strongly only in reverse bias and blocks all forward current.", rationale: "Reverses forward and reverse bias behaviour of an LED." },
          ],
          "ntc-thermistor": [
            { text: "Resistance increases as temperature increases because lattice vibrations block every carrier.", rationale: "Describes a metallic filament rather than an NTC semiconductor thermistor." },
            { text: "Resistance stays strictly constant at all temperatures because both curves are straight lines.", rationale: "A steeper I–V gradient means a smaller resistance, not constant resistance." },
            { text: "Curve Q represents the hotter state because a shallower I–V gradient indicates lower resistance.", rationale: "Inverts the meaning of I–V gradient (gradient equals reciprocal of resistance)." },
          ],
          ldr: [
            { text: "Resistance increases as light intensity increases so the curve becomes shallower in bright light.", rationale: "Confuses LDR response: brighter illumination lowers resistance." },
            { text: "Resistance stays constant regardless of illumination because photons do not affect semiconductors.", rationale: "Photons release extra charge carriers in an LDR, reducing resistance." },
            { text: "Curve Q represents bright illumination because lower current at the same voltage means lower resistance.", rationale: "Inverts Ohm's law R = V/I." },
          ],
          "ohmic-resistor": [
            { text: "Resistance increases smoothly with voltage because the gradient of the straight line is constant.", rationale: "Constant gradient on an I–V graph means constant resistance, not increasing resistance." },
            { text: "Resistance equals the gradient of the I–V line rather than its reciprocal.", rationale: "With I on the vertical axis and V on the horizontal axis, gradient equals 1/R." },
            { text: "Current flows only above a forward threshold potential difference.", rationale: "Describes a diode rather than an ohmic metallic resistor." },
          ],
        };

        const options = buildQualitativeMcqOptions({
          correctText: `It exhibits ${behavior}.`,
          distractors: distractorPool[c.comp],
          seed,
        });

        items.push({
          id: `${NCUK_AC4_ID_PREFIX}-ivcurve-${String(i + 1).padStart(2, "0")}`,
          conceptId: "ohms-law-iv-characteristics",
          templateArchetype: "ncuk-component-iv-curve-characteristic",
          seed,
          syllabi: syllabiForSubtopic("ncuk-ac4-2"),
          format: "mcq",
          difficulty: difficultyForIndex(i),
          domain: "graphs",
          scenarioSpec,
          hiddenQuantities: ["behaviorSummary", "componentLabel", "staticResistanceOhm"],
          requiredGivens: [],
          stem,
          options,
          targetMode: "qualitative",
          targetQuantityKey: "behaviorSummary",
          workedSolution: `On an I–V graph (I on the vertical axis, V on the horizontal axis), gradient equals reciprocal of resistance. For this ${compLabel}, ${behavior}.`,
          markScheme: [
            {
              code: "B1",
              criterion: `Correctly identifies that ${behavior}.`,
              marks: 1,
            },
          ],
          totalMarks: 1,
          generatorModel,
        });
      } else {
        // Quantitative static resistance R = V/I MCQ at highlighted operating point
        const iLabel =
          c.comp === "led-diode"
            ? `${Math.round(c.iOp * 1000)} mA`
            : formatNcukQuantity(c.iOp, "A", 3);
        const stem = `The I–V characteristic graph for ${withArticle(c.ctx)} highlights an operating point where V = ${formatNcukQuantity(c.vOp, "V", 3)} and I = ${iLabel}. What is the static resistance of the component at this operating point?`;

        const distractors: NumericDistractor[] = [
          { value: c.iOp / c.vOp, rationale: "Computed I / V (conductance) instead of R = V / I." },
          { value: c.vOp * c.iOp, rationale: "Multiplied V × I (power) instead of dividing V by I." },
          {
            value: c.comp === "led-diode" ? staticR / 1000 : staticR * 2,
            rationale:
              c.comp === "led-diode"
                ? "Forgot to convert mA to A before evaluating R = V / I."
                : "Used an incorrect chord ratio rather than R = V / I at the marked point.",
          },
        ];

        const options = buildNumericMcqOptions({
          correctValue: staticR,
          unit: "Ω",
          distractors,
          seed,
        });

        const ansStr = formatNcukQuantity(staticR, "Ω", 3);
        items.push({
          id: `${NCUK_AC4_ID_PREFIX}-ivcurve-${String(i + 1).padStart(2, "0")}`,
          conceptId: "ohms-law-iv-characteristics",
          templateArchetype: "ncuk-component-iv-curve-characteristic",
          seed,
          syllabi: syllabiForSubtopic("ncuk-ac4-2"),
          format: "mcq",
          difficulty: difficultyForIndex(i),
          domain: "graphs",
          scenarioSpec,
          hiddenQuantities: ["staticResistanceOhm"],
          requiredGivens: [
            { name: "operatingVoltageV", value: c.vOp, unit: "V", source: "stem" },
            { name: "operatingCurrentA", value: c.iOp, unit: "A", source: "stem" },
          ],
          stem,
          options,
          targetMode: "quantitative",
          targetQuantityKey: "staticResistanceOhm",
          workedSolution: `Static resistance at any point on an I–V graph is R = V / I = ${formatNcukQuantity(c.vOp, "V", 4)} / ${formatNcukQuantity(c.iOp, "A", 4)} = ${formatNcukQuantity(staticR, "Ω", 4)} ≈ ${ansStr}.`,
          markScheme: [
            {
              code: "A1",
              criterion: `Evaluates R = V / I accurately to obtain ${ansStr}.`,
              marks: 1,
            },
          ],
          totalMarks: 1,
          generatorModel,
        });
      }
    } else {
      // 6-mark structured: (a) 2m quantitative static R at operating point, (b) 2m experimental potentiometer procedure (qual), (c) 2m explain curve shape (qual)
      const iLabel =
        c.comp === "led-diode"
          ? `${Math.round(c.iOp * 1000)} mA`
          : formatNcukQuantity(c.iOp, "A", 3);
      const rStr3 = formatNcukQuantity(staticR, "Ω", 3);
      const rStr4 = formatNcukQuantity(staticR, "Ω", 4);
      const stem = `The graph shows the I–V characteristic recorded for ${withArticle(c.ctx)} in an NCUK laboratory investigation, with current plotted on the vertical axis and potential difference on the horizontal axis. At the highlighted operating point, V = ${formatNcukQuantity(c.vOp, "V", 3)} and I = ${iLabel}.`;

      const parts: StructuredQuestionPart[] = [
        {
          partId: "a",
          prompt:
            "Calculate the static resistance of the component at the highlighted operating point.",
          marks: 2,
          targetMode: "quantitative",
          targetQuantityKey: "staticResistanceOhm",
          expectedAnswer: rStr3,
          workingSteps: [
            `Recall that static resistance at a point is R = V / I (not the inverse of the local tangent).`,
            `Substitute V = ${formatNcukQuantity(c.vOp, "V", 4)} and I = ${formatNcukQuantity(c.iOp, "A", 4)} to obtain R = ${rStr4} ≈ ${rStr3}.`,
          ],
        },
        {
          partId: "b",
          prompt:
            "Describe the circuit arrangement and experimental procedure used to obtain a complete I–V characteristic safely across positive and negative potential differences.",
          marks: 2,
          targetMode: "qualitative",
          targetQuantityKey: "ledProcedureSummary",
          expectedAnswer: `To obtain the full characteristic safely, ${ledProc}.`,
          workingSteps: [
            "Use a potential divider to vary potential difference smoothly from zero while limiting excessive current with a protective resistor.",
            "Measure current with a series ammeter, potential difference with a parallel voltmeter, and reverse the supply leads for negative polarity.",
          ],
        },
        {
          partId: "c",
          prompt:
            "Explain the physical shape of the I–V characteristic in terms of charge carriers and resistance.",
          marks: 2,
          targetMode: "qualitative",
          targetQuantityKey: "behaviorSummary",
          expectedAnswer: `The curve shows that the component ${behavior}.`,
          workingSteps: [
            "Link the changing ratio of potential difference to current directly to the microscopic conduction mechanism.",
          ],
        },
      ];

      const markScheme: MarkSchemePoint[] = [
        {
          code: "M1",
          partId: "a",
          criterion: `Substitutes operating-point values into R = V / I (converting mA to A if needed).`,
          marks: 1,
        },
        {
          code: "A1",
          partId: "a",
          criterion: `Correct static resistance ${rStr3}.`,
          marks: 1,
        },
        {
          code: "B1",
          partId: "b",
          criterion: "Specifies potential divider (or variable supply) with series ammeter and parallel voltmeter.",
          marks: 1,
        },
        {
          code: "B1",
          partId: "b",
          criterion: "Includes a series protective resistor and reversing supply connections for negative voltages.",
          marks: 1,
        },
        {
          code: "B1",
          partId: "c",
          criterion: "Correctly describes how resistance changes across the graph.",
          marks: 1,
        },
        {
          code: "B1",
          partId: "c",
          criterion: `Correct microscopic explanation: ${behavior}.`,
          marks: 1,
        },
      ];

      items.push({
        id: `${NCUK_AC4_ID_PREFIX}-ivcurve-${String(i + 1).padStart(2, "0")}`,
        conceptId: "ohms-law-iv-characteristics",
        templateArchetype: "ncuk-component-iv-curve-characteristic",
        seed,
        syllabi: syllabiForSubtopic("ncuk-ac4-2"),
        format: "structured",
        difficulty: difficultyForIndex(i),
        domain: "graphs",
        scenarioSpec,
        hiddenQuantities: [
          "staticResistanceOhm",
          "ledProcedureSummary",
          "behaviorSummary",
        ],
        requiredGivens: [
          { name: "operatingVoltageV", value: c.vOp, unit: "V", source: "stem" },
          { name: "operatingCurrentA", value: c.iOp, unit: "A", source: "stem" },
        ],
        stem,
        parts,
        workedSolution: `(a) R = V / I = ${rStr4} ≈ ${rStr3}. (b) ${ledProc}. (c) ${behavior}.`,
        markScheme,
        totalMarks: 6,
        generatorModel,
      });
    }
  }
  return items;
}

/* -------------------------------------------------------------------------- */
/*  7. AC4.2 :: Tabulated I-V Plot -> Gradient 1/R -> Resistivity (14 items)  */
/* -------------------------------------------------------------------------- */

function buildIvGradientResistivityItems(
  baseSeed: number,
  generatorModel: string,
): CandidateQuestionInput[] {
  const configs = [
    { alloy: "constantan", maxV: 8.0, rOhm: 10.0, lengthM: 1.6, areaM2: 8.0e-8, seedOffset: 11 },
    { alloy: "nichrome", maxV: 10.0, rOhm: 20.0, lengthM: 1.2, areaM2: 6.6e-8, seedOffset: 23 },
    { alloy: "manganin", maxV: 6.0, rOhm: 12.0, lengthM: 2.0, areaM2: 8.0e-8, seedOffset: 37 },
    { alloy: "cupronickel", maxV: 5.0, rOhm: 8.0, lengthM: 1.5, areaM2: 7.2e-8, seedOffset: 41 },
    { alloy: "kanthal", maxV: 10.0, rOhm: 25.0, lengthM: 1.0, areaM2: 5.8e-8, seedOffset: 53 },
    { alloy: "stainless steel", maxV: 8.0, rOhm: 16.0, lengthM: 1.8, areaM2: 8.1e-8, seedOffset: 61 },
    { alloy: "eureka alloy", maxV: 6.0, rOhm: 15.0, lengthM: 2.2, areaM2: 7.2e-8, seedOffset: 71 },
    { alloy: "nichrome-80", maxV: 10.0, rOhm: 20.0, lengthM: 1.4, areaM2: 7.7e-8, seedOffset: 83 },
    { alloy: "constantan wire", maxV: 8.0, rOhm: 12.5, lengthM: 1.5, areaM2: 5.9e-8, seedOffset: 97 },
    { alloy: "manganin wire", maxV: 6.0, rOhm: 10.0, lengthM: 1.8, areaM2: 8.6e-8, seedOffset: 109 },
    { alloy: "titanium wire", maxV: 5.0, rOhm: 10.0, lengthM: 2.0, areaM2: 8.4e-8, seedOffset: 127 },
    { alloy: "nickel-chromium wire", maxV: 10.0, rOhm: 25.0, lengthM: 1.2, areaM2: 5.2e-8, seedOffset: 139 },
    { alloy: "german-silver alloy", maxV: 8.0, rOhm: 8.0, lengthM: 1.6, areaM2: 6.4e-8, seedOffset: 151 },
    { alloy: "resistance-alloy wire", maxV: 6.0, rOhm: 12.0, lengthM: 1.25, areaM2: 6.0e-8, seedOffset: 163 },
  ];

  const items: CandidateQuestionInput[] = [];
  for (let i = 0; i < configs.length; i += 1) {
    const c = configs[i];
    const seed = baseSeed + 700 + i;
    const isMcq = i < 8;
    const scenarioSpec: Record<string, unknown> = {
      kind: "component-iv-curve",
      mode: "tabulated-iv-resistivity",
      maxVoltageV: c.maxV,
      resistanceOhm: c.rOhm,
      lengthM: c.lengthM,
      areaM2: c.areaM2,
      scatterSeed: c.seedOffset,
    };
    const q = solvePlugin("component-iv-curve", scenarioSpec);
    const maxI = numQty(q, "maxCurrentA");
    const grad = numQty(q, "gradientAPerV");
    const rho = numQty(q, "resistivityOhmM");
    const rhoDef = strQty(q, "resistivityDefinition");

    const requiredGivens: RequiredGivenSpec[] = [
      { name: "lengthM", value: c.lengthM, unit: "m", source: "stem" },
      { name: "areaM2", value: c.areaM2, unit: "m²", source: "stem" },
      { name: "maxVoltageV", value: c.maxV, unit: "V", source: "either" },
      { name: "maxCurrentA", value: maxI, unit: "A", source: "stem" },
    ];

    if (isMcq) {
      const stem = `A student plots current I (y-axis) against potential difference V (x-axis) for a uniform ${c.alloy} wire of length ${formatNcukQuantity(c.lengthM, "m", 3)} and cross-sectional area ${formatNcukQuantity(c.areaM2, "m²", 3)}. The straight line of best fit passes through the origin and the point (${formatNcukQuantity(c.maxV, "V", 3)}, ${formatNcukQuantity(maxI, "A", 3)}). What is the resistivity of the ${c.alloy}?`;

      const distractors: NumericDistractor[] = [
        { value: (grad * c.areaM2) / c.lengthM, rationale: "Used the I–V gradient directly as resistance instead of R = 1 / gradient." },
        { value: (c.rOhm * c.lengthM) / c.areaM2, rationale: "Inverted the resistivity formula as ρ = R L / A instead of ρ = R A / L." },
        { value: rho * 10, rationale: "Made a factor-of-10 scientific-notation error when dividing by cross-sectional area." },
      ];

      const options = buildNumericMcqOptions({
        correctValue: rho,
        unit: "Ω m",
        distractors,
        seed,
      });

      const ansStr = formatNcukQuantity(rho, "Ω m", 3);
      const workedSolution = `Gradient m = ΔI / ΔV = ${formatNcukQuantity(maxI, "A", 4)} / ${formatNcukQuantity(c.maxV, "V", 4)} = ${formatNcukQuantity(grad, "A V⁻¹", 4)}. Since gradient = 1/R, R = 1/m = ${formatNcukQuantity(c.rOhm, "Ω", 4)}. Therefore ρ = R A / L = ${formatNcukQuantity(rho, "Ω m", 4)} ≈ ${ansStr}.`;

      items.push({
        id: `${NCUK_AC4_ID_PREFIX}-ivrho-${String(i + 1).padStart(2, "0")}`,
        conceptId: "resistivity-ohmic-conductors",
        templateArchetype: "ncuk-iv-gradient-wire-resistivity",
        seed,
        syllabi: syllabiForSubtopic("ncuk-ac4-2"),
        format: "mcq",
        difficulty: difficultyForIndex(i),
        domain: "graphs",
        scenarioSpec,
        hiddenQuantities: ["resistanceOhm", "resistivityOhmM", "gradientAPerV"],
        requiredGivens,
        stem,
        options,
        targetMode: "quantitative",
        targetQuantityKey: "resistivityOhmM",
        workedSolution,
        markScheme: [
          {
            code: "A1",
            criterion: `Uses R = 1 / gradient and ρ = R A / L to obtain ${ansStr}.`,
            marks: 1,
          },
        ],
        totalMarks: 1,
        generatorModel,
      });
    } else {
      // 6-mark structured: (a) 2m define resistivity (qual), (b) 2m R from inverse gradient, (c) 2m resistivity ρ
      const rStr3 = formatNcukQuantity(c.rOhm, "Ω", 3);
      const rhoStr3 = formatNcukQuantity(rho, "Ω m", 3);
      const rhoStr4 = formatNcukQuantity(rho, "Ω m", 4);
      const stem = `The Cartesian plot shows experimental (V, I) data and the straight line of best fit for a uniform ${c.alloy} of length ${formatNcukQuantity(c.lengthM, "m", 3)} and cross-sectional area ${formatNcukQuantity(c.areaM2, "m²", 3)}. The line of best fit passes through the origin and reaches I = ${formatNcukQuantity(maxI, "A", 3)} at V = ${formatNcukQuantity(c.maxV, "V", 3)}.`;

      const parts: StructuredQuestionPart[] = [
        {
          partId: "a",
          prompt: "Define the electrical resistivity of a material.",
          marks: 2,
          targetMode: "qualitative",
          targetQuantityKey: "resistivityDefinition",
          expectedAnswer: `Electrical resistivity is the ${rhoDef}, where resistance, cross-sectional area, and length are measured for a uniform specimen at constant temperature.`,
          workingSteps: [
            "State the definition in terms of a conductor of unit length and unit cross-sectional area.",
            "Identify that resistivity is an intrinsic property of the material at constant temperature.",
          ],
        },
        {
          partId: "b",
          prompt:
            "Determine the resistance of the wire from the gradient of the I–V line of best fit using a large triangle.",
          marks: 2,
          targetMode: "quantitative",
          targetQuantityKey: "resistanceOhm",
          expectedAnswer: rStr3,
          workingSteps: [
            `Gradient m = ΔI / ΔV = (${formatNcukQuantity(maxI, "A", 4)} − 0) / (${formatNcukQuantity(c.maxV, "V", 4)} − 0) = ${formatNcukQuantity(grad, "A V⁻¹", 4)}.`,
            `Because I is on the vertical axis, R = 1 / m = ${formatNcukQuantity(c.rOhm, "Ω", 4)} ≈ ${rStr3}.`,
          ],
        },
        {
          partId: "c",
          prompt:
            "Calculate the resistivity of the alloy, stating the appropriate SI unit.",
          marks: 2,
          dependsOnPartIds: ["b"],
          targetMode: "quantitative",
          targetQuantityKey: "resistivityOhmM",
          expectedAnswer: rhoStr3,
          workingSteps: [
            `Apply ρ = R A / L = (${formatNcukQuantity(c.rOhm, "Ω", 4)} × ${formatNcukQuantity(c.areaM2, "m²", 4)}) / ${formatNcukQuantity(c.lengthM, "m", 4)}.`,
            `Evaluate ρ = ${rhoStr4} ≈ ${rhoStr3}.`,
          ],
        },
      ];

      const markScheme: MarkSchemePoint[] = [
        {
          code: "B1",
          partId: "a",
          criterion: `States ${rhoDef}.`,
          marks: 1,
        },
        {
          code: "B1",
          partId: "a",
          criterion: "Correctly specifies all quantities (or notes constant temperature / material property).",
          marks: 1,
        },
        {
          code: "M1",
          partId: "b",
          criterion: `Computes large-triangle gradient m = ΔI/ΔV = ${formatNcukQuantity(grad, "A V⁻¹", 3)} and takes its reciprocal R = 1/m.`,
          marks: 1,
        },
        {
          code: "A1",
          partId: "b",
          criterion: `Correct wire resistance R = ${rStr3}.`,
          marks: 1,
        },
        {
          code: "M1",
          partId: "c",
          criterion: "Substitutes R, A, and L correctly into ρ = RA/L.",
          marks: 1,
        },
        {
          code: "A1",
          partId: "c",
          criterion: `Correct resistivity ${rhoStr3} with unit Ω m.`,
          marks: 1,
        },
      ];

      items.push({
        id: `${NCUK_AC4_ID_PREFIX}-ivrho-${String(i + 1).padStart(2, "0")}`,
        conceptId: "resistivity-ohmic-conductors",
        templateArchetype: "ncuk-iv-gradient-wire-resistivity",
        seed,
        syllabi: syllabiForSubtopic("ncuk-ac4-2"),
        format: "structured",
        difficulty: difficultyForIndex(i),
        domain: "graphs",
        scenarioSpec,
        hiddenQuantities: [
          "resistanceOhm",
          "resistivityOhmM",
          "gradientAPerV",
          "resistivityDefinition",
        ],
        requiredGivens,
        stem,
        parts,
        workedSolution: `(a) Resistivity is the ${rhoDef}. (b) Gradient = ${formatNcukQuantity(grad, "A V⁻¹", 4)}, so R = 1 / gradient = ${rStr3}. (c) ρ = RA/L = ${rhoStr4} ≈ ${rhoStr3}.`,
        markScheme,
        totalMarks: 6,
        generatorModel,
      });
    }
  }
  return items;
}

/* -------------------------------------------------------------------------- */
/*  8. AC4.2 :: Cuboid Bar Resistivity (14 items)                             */
/* -------------------------------------------------------------------------- */

function buildCuboidResistivityItems(
  baseSeed: number,
  generatorModel: string,
): CandidateQuestionInput[] {
  const bars = [
    { mat: "pressed graphite strip", lMm: 45, wMm: 1.5, hMm: 0.6, rho: 3.2e-5, vV: 6.0 },
    { mat: "doped silicon bar", lMm: 25, wMm: 0.8, hMm: 0.4, rho: 4.8e-5, vV: 9.0 },
    { mat: "carbon-film resistor track", lMm: 60, wMm: 1.2, hMm: 0.5, rho: 2.5e-5, vV: 12.0 },
    { mat: "conductive polymer blade", lMm: 35, wMm: 1.8, hMm: 0.7, rho: 5.4e-5, vV: 4.5 },
    { mat: "extruded carbon rod", lMm: 75, wMm: 2.0, hMm: 0.8, rho: 3.6e-5, vV: 15.0 },
    { mat: "germanium sensing bar", lMm: 30, wMm: 0.6, hMm: 0.3, rho: 1.8e-5, vV: 5.0 },
    { mat: "graphite-clay slab", lMm: 55, wMm: 1.4, hMm: 0.5, rho: 4.2e-5, vV: 10.0 },
    { mat: "thin-film silicon-carbide bar", lMm: 40, wMm: 1.0, hMm: 0.4, rho: 2.8e-5, vV: 8.0 },
    { mat: "precision carbon shunt", lMm: 65, wMm: 1.6, hMm: 0.6, rho: 3.0e-5, vV: 6.0 },
    { mat: "rectangular graphite block", lMm: 50, wMm: 1.2, hMm: 0.8, rho: 4.5e-5, vV: 12.0 },
    { mat: "doped wafer strip", lMm: 22, wMm: 0.5, hMm: 0.25, rho: 1.5e-5, vV: 4.0 },
    { mat: "sintered carbon bar", lMm: 70, wMm: 1.5, hMm: 0.9, rho: 5.0e-5, vV: 9.0 },
    { mat: "laboratory graphite bar", lMm: 48, wMm: 1.1, hMm: 0.55, rho: 3.8e-5, vV: 10.0 },
    { mat: "micro-machined resistor bar", lMm: 32, wMm: 0.9, hMm: 0.35, rho: 2.2e-5, vV: 6.0 },
  ];

  const items: CandidateQuestionInput[] = [];
  for (let i = 0; i < bars.length; i += 1) {
    const b = bars[i];
    const seed = baseSeed + 800 + i;
    const isMcq = i < 8;
    const findRho = i % 3 === 1;

    const aRef = (b.wMm * 1e-3) * (b.hMm * 1e-3);
    const rRef = Number(((b.rho * (b.lMm * 1e-3)) / aRef).toPrecision(3));

    const scenarioSpec: Record<string, unknown> = findRho
      ? {
          kind: "cuboid-remelt-resistivity",
          mode: "cuboid-find-rho",
          lengthMm: b.lMm,
          widthMm: b.wMm,
          heightMm: b.hMm,
          resistanceOhm: rRef,
          voltageV: b.vV,
        }
      : {
          kind: "cuboid-remelt-resistivity",
          mode: "cuboid-find-r",
          lengthMm: b.lMm,
          widthMm: b.wMm,
          heightMm: b.hMm,
          resistivityOhmM: b.rho,
          voltageV: b.vV,
        };

    const q = solvePlugin("cuboid-remelt-resistivity", scenarioSpec);
    const areaM2 = numQty(q, "areaM2");
    const resistanceOhm = numQty(q, "resistanceOhm");
    const resistivityOhmM = numQty(q, "resistivityOhmM");
    const powerW = numQty(q, "powerW");

    const requiredGivens: RequiredGivenSpec[] = [
      { name: "lengthMm", value: b.lMm, unit: "mm", source: "stem" },
      { name: "widthMm", value: b.wMm, unit: "mm", source: "stem" },
      { name: "heightMm", value: b.hMm, unit: "mm", source: "stem" },
      findRho
        ? { name: "resistanceOhm", value: rRef, unit: "Ω", source: "stem" }
        : { name: "resistivityOhmM", value: b.rho, unit: "Ω m", source: "stem" },
    ];

    if (isMcq) {
      const targetKey = findRho ? "resistivityOhmM" : "resistanceOhm";
      const targetVal = findRho ? resistivityOhmM : resistanceOhm;
      const unit = findRho ? "Ω m" : "Ω";

      const stem = findRho
        ? `A rectangular ${b.mat} has length ${b.lMm} mm, width ${b.wMm} mm, and thickness ${b.hMm} mm. When current flows parallel to its ${b.lMm} mm length, its resistance is ${formatNcukQuantity(rRef, "Ω", 3)}. What is the resistivity of the material?`
        : `A rectangular ${b.mat} of resistivity ${formatNcukQuantity(b.rho, "Ω m", 3)} measures ${b.lMm} mm long, ${b.wMm} mm wide, and ${b.hMm} mm thick. Calculate its resistance between the two opposite ${b.wMm} mm × ${b.hMm} mm end faces.`;

      const wrongFaceArea = (b.lMm * 1e-3) * (b.wMm * 1e-3);
      const distractors: NumericDistractor[] = findRho
        ? [
            { value: (rRef * wrongFaceArea) / (b.hMm * 1e-3), rationale: "Chose the side face (L × w) instead of the end cross-section (w × h)." },
            { value: resistivityOhmM * 1e3, rationale: "Converted mm² to m² using 10⁻³ instead of 10⁻⁶." },
            { value: (rRef * (b.lMm * 1e-3)) / areaM2, rationale: "Rearranged resistivity wrongly as ρ = R L / A." },
          ]
        : [
            { value: (b.rho * (b.hMm * 1e-3)) / wrongFaceArea, rationale: "Used the wrong cross-sectional face for the current direction." },
            { value: resistanceOhm * 1e-3, rationale: "Failed to square the mm-to-m conversion factor for area." },
            { value: (b.rho * areaM2) / (b.lMm * 1e-3), rationale: "Inverted A and L in the resistance equation." },
          ];

      const options = buildNumericMcqOptions({
        correctValue: targetVal,
        unit,
        distractors,
        seed,
      });

      const ansStr = formatNcukQuantity(targetVal, unit, 3);
      const workedSolution = `Cross-sectional area perpendicular to current is A = w × h = (${b.wMm} × 10⁻³ m) × (${b.hMm} × 10⁻³ m) = ${formatNcukQuantity(areaM2, "m²", 4)}, and L = ${b.lMm} × 10⁻³ m. Using R = ρL/A yields ${ansStr}.`;

      items.push({
        id: `${NCUK_AC4_ID_PREFIX}-cuboid-${String(i + 1).padStart(2, "0")}`,
        conceptId: "resistivity-ohmic-conductors",
        templateArchetype: "ncuk-cuboid-bar-resistivity",
        seed,
        syllabi: syllabiForSubtopic("ncuk-ac4-2"),
        format: "mcq",
        difficulty: difficultyForIndex(i),
        domain: "pure-calculation",
        scenarioSpec,
        hiddenQuantities: [targetKey],
        requiredGivens,
        stem,
        options,
        targetMode: "quantitative",
        targetQuantityKey: targetKey,
        workedSolution,
        markScheme: [
          {
            code: "A1",
            criterion: `Uses A = w × h in m² and R = ρL/A to obtain ${ansStr}.`,
            marks: 1,
          },
        ],
        totalMarks: 1,
        generatorModel,
      });
    } else {
      // 4-mark structured: (a) 2m area + R (or rho), (b) 2m power across V
      const targetAKey = findRho ? "resistivityOhmM" : "resistanceOhm";
      const targetAUnit = findRho ? "Ω m" : "Ω";
      const targetAStr3 = formatNcukQuantity(
        findRho ? resistivityOhmM : resistanceOhm,
        targetAUnit,
        3,
      );
      const pStr3 = formatNcukQuantity(powerW, "W", 3);
      const pStr4 = formatNcukQuantity(powerW, "W", 4);

      const stem = findRho
        ? `A rectangular ${b.mat} has length ${b.lMm} mm, width ${b.wMm} mm, and height ${b.hMm} mm. A potential difference of ${formatNcukQuantity(b.vV, "V", 3)} is applied across its two ${b.wMm} mm × ${b.hMm} mm end faces, where its resistance is measured to be ${formatNcukQuantity(rRef, "Ω", 3)}.`
        : `A rectangular ${b.mat} of resistivity ${formatNcukQuantity(b.rho, "Ω m", 3)} has length ${b.lMm} mm, width ${b.wMm} mm, and height ${b.hMm} mm. A steady potential difference of ${formatNcukQuantity(b.vV, "V", 3)} is applied across its opposite ${b.wMm} mm × ${b.hMm} mm end faces.`;

      const parts: StructuredQuestionPart[] = [
        {
          partId: "a",
          prompt: findRho
            ? "Calculate the cross-sectional area perpendicular to current flow and hence determine the resistivity of the material."
            : "Calculate the cross-sectional area perpendicular to current flow and hence determine the resistance of the bar.",
          marks: 2,
          targetMode: "quantitative",
          targetQuantityKey: targetAKey,
          expectedAnswer: targetAStr3,
          workingSteps: [
            `A = (${b.wMm} × 10⁻³ m) × (${b.hMm} × 10⁻³ m) = ${formatNcukQuantity(areaM2, "m²", 4)}.`,
            findRho
              ? `ρ = RA / L = (${rRef} × ${formatNcukQuantity(areaM2, "m²", 4)}) / (${b.lMm} × 10⁻³) = ${formatNcukQuantity(resistivityOhmM, "Ω m", 4)} ≈ ${targetAStr3}.`
              : `R = ρL / A = (${formatNcukQuantity(b.rho, "Ω m", 4)} × ${b.lMm} × 10⁻³) / ${formatNcukQuantity(areaM2, "m²", 4)} = ${formatNcukQuantity(resistanceOhm, "Ω", 4)} ≈ ${targetAStr3}.`,
          ],
        },
        {
          partId: "b",
          prompt:
            "Calculate the electrical power dissipated in the bar at this potential difference.",
          marks: 2,
          dependsOnPartIds: ["a"],
          targetMode: "quantitative",
          targetQuantityKey: "powerW",
          expectedAnswer: pStr3,
          workingSteps: [
            `Use P = V² / R with V = ${formatNcukQuantity(b.vV, "V", 4)} and R = ${formatNcukQuantity(resistanceOhm, "Ω", 4)}.`,
            `P = ${b.vV}² / ${formatNcukQuantity(resistanceOhm, "Ω", 4)} = ${pStr4} ≈ ${pStr3}.`,
          ],
        },
      ];

      const markScheme: MarkSchemePoint[] = [
        {
          code: "M1",
          partId: "a",
          criterion: `Evaluates A = w × h = ${formatNcukQuantity(areaM2, "m²", 3)} and substitutes into R = ρL/A.`,
          marks: 1,
        },
        {
          code: "A1",
          partId: "a",
          criterion: `Correct value ${targetAStr3}.`,
          marks: 1,
        },
        {
          code: "M1",
          partId: "b",
          criterion: "Substitutes V and R into P = V² / R.",
          marks: 1,
        },
        {
          code: "A1",
          partId: "b",
          criterion: `Correct power dissipated ${pStr3}.`,
          marks: 1,
        },
      ];

      items.push({
        id: `${NCUK_AC4_ID_PREFIX}-cuboid-${String(i + 1).padStart(2, "0")}`,
        conceptId: "resistivity-ohmic-conductors",
        templateArchetype: "ncuk-cuboid-bar-resistivity",
        seed,
        syllabi: syllabiForSubtopic("ncuk-ac4-2"),
        format: "structured",
        difficulty: difficultyForIndex(i),
        domain: "pure-calculation",
        scenarioSpec,
        hiddenQuantities: [targetAKey, "areaM2", "powerW"],
        requiredGivens: [
          ...requiredGivens,
          { name: "voltageV", value: b.vV, unit: "V", source: "stem" },
        ],
        stem,
        parts,
        workedSolution: `(a) A = ${formatNcukQuantity(areaM2, "m²", 4)}, giving ${targetAStr3}. (b) P = V² / R = ${pStr4} ≈ ${pStr3}.`,
        markScheme,
        totalMarks: 4,
        generatorModel,
      });
    }
  }
  return items;
}

/* -------------------------------------------------------------------------- */
/*  9. AC4.2 :: Remelted Wire-to-Cube & Redrawn Wire Resistivity (14 items)   */
/* -------------------------------------------------------------------------- */

function buildRemeltWireItems(
  baseSeed: number,
  generatorModel: string,
): CandidateQuestionInput[] {
  const wires = [
    { alloy: "nichrome", dMm: 0.25, lM: 3.0, rho: 1.1e-6, vV: 24, k: 0.5 },
    { alloy: "constantan", dMm: 0.4, lM: 4.5, rho: 4.9e-7, vV: 18, k: 0.5 },
    { alloy: "manganin", dMm: 0.3, lM: 2.5, rho: 4.8e-7, vV: 12, k: 2.0 },
    { alloy: "kanthal", dMm: 0.35, lM: 5.0, rho: 1.45e-6, vV: 48, k: 0.5 },
    { alloy: "stainless steel", dMm: 0.45, lM: 3.6, rho: 7.2e-7, vV: 24, k: 0.5 },
    { alloy: "cupronickel", dMm: 0.28, lM: 2.0, rho: 3.8e-7, vV: 15, k: 2.0 },
    { alloy: "nichrome-80", dMm: 0.2, lM: 4.0, rho: 1.08e-6, vV: 110, k: 0.5 },
    { alloy: "titanium wire", dMm: 0.5, lM: 6.0, rho: 4.2e-7, vV: 12, k: 0.5 },
    { alloy: "heating-grade nichrome", dMm: 0.32, lM: 3.5, rho: 1.1e-6, vV: 36, k: 0.5 },
    { alloy: "constantan coil", dMm: 0.38, lM: 2.8, rho: 4.9e-7, vV: 16, k: 2.0 },
    { alloy: "alloy resistance wire", dMm: 0.22, lM: 4.2, rho: 9.5e-7, vV: 48, k: 0.5 },
    { alloy: "manganin element", dMm: 0.42, lM: 5.2, rho: 4.8e-7, vV: 20, k: 0.5 },
    { alloy: "chromium-nickel wire", dMm: 0.26, lM: 3.2, rho: 1.15e-6, vV: 30, k: 0.5 },
    { alloy: "fine kanthal element", dMm: 0.18, lM: 2.4, rho: 1.4e-6, vV: 60, k: 2.0 },
  ];

  const items: CandidateQuestionInput[] = [];
  for (let i = 0; i < wires.length; i += 1) {
    const w = wires[i];
    const seed = baseSeed + 900 + i;
    const isMcq = i < 8;
    const scenarioSpec: Record<string, unknown> = {
      kind: "cuboid-remelt-resistivity",
      mode: "remelt",
      diameterMm: w.dMm,
      lengthM: w.lM,
      resistivityOhmM: w.rho,
      voltageV: w.vV,
      redrawFactor: w.k,
    };
    const q = solvePlugin("cuboid-remelt-resistivity", scenarioSpec);
    const areaM2 = numQty(q, "areaM2");
    const resistanceOhm = numQty(q, "resistanceOhm");
    const powerW = numQty(q, "powerW");
    const volumeM3 = numQty(q, "volumeM3");
    const cubeEdgeMm = numQty(q, "cubeEdgeMm");
    const redrawnR = numQty(q, "redrawnResistanceOhm");

    const requiredGivens: RequiredGivenSpec[] = [
      { name: "diameterMm", value: w.dMm, unit: "mm", source: "stem" },
      { name: "lengthM", value: w.lM, unit: "m", source: "stem" },
      { name: "resistivityOhmM", value: w.rho, unit: "Ω m", source: "stem" },
    ];

    if (isMcq) {
      const askCube = i % 2 === 0;
      const targetKey = askCube ? "cubeEdgeMm" : "redrawnResistanceOhm";
      const targetVal = askCube ? cubeEdgeMm : redrawnR;
      const unit = askCube ? "mm" : "Ω";

      const stem = askCube
        ? `A cylindrical ${w.alloy} heating wire has diameter ${formatNcukQuantity(w.dMm, "mm", 3)}, length ${formatNcukQuantity(w.lM, "m", 3)}, and resistivity ${formatNcukQuantity(w.rho, "Ω m", 3)}. If the entire wire is melted down with no loss of metal and recast into a solid cube, what is the edge length of the cube?`
        : `A cylindrical ${w.alloy} wire of diameter ${formatNcukQuantity(w.dMm, "mm", 3)}, length ${formatNcukQuantity(w.lM, "m", 3)}, and resistivity ${formatNcukQuantity(w.rho, "Ω m", 3)} is uniformly redrawn at constant volume so its new diameter is ${w.k === 0.5 ? "halved" : "doubled"} (${formatNcukQuantity(w.dMm * w.k, "mm", 3)}). What is the new electrical resistance of the wire?`;

      const distractors: NumericDistractor[] = askCube
        ? [
            { value: cubeEdgeMm * Math.cbrt(4), rationale: "Used diameter instead of radius in V = πr²L." },
            { value: Math.sqrt(volumeM3) * 1e3, rationale: "Took the square root rather than the cube root of the volume." },
            { value: cubeEdgeMm / Math.cbrt(Math.PI), rationale: "Omitted π from the cylindrical wire volume." },
          ]
        : [
            { value: resistanceOhm / (w.k * w.k), rationale: "Only scaled area by k² and forgot that constant volume also changes length by 1/k²." },
            { value: resistanceOhm / w.k, rationale: "Assumed resistance varies inversely with diameter rather than diameter to the fourth power." },
            { value: resistanceOhm * w.k ** 4, rationale: "Inverted the scaling factor k⁴ when computing the redrawn resistance." },
          ];

      const options = buildNumericMcqOptions({
        correctValue: targetVal,
        unit,
        distractors,
        seed,
      });

      const ansStr = formatNcukQuantity(targetVal, unit, 3);
      const workedSolution = askCube
        ? `Wire area A = πd²/4 = ${formatNcukQuantity(areaM2, "m²", 4)}, so volume V = AL = ${formatNcukQuantity(volumeM3, "m³", 4)}. For a solid cube of equal volume, edge s = ∛V = ${formatNcukQuantity(cubeEdgeMm * 1e-3, "m", 4)} = ${ansStr}.`
        : `Initial area A = πd²/4 = ${formatNcukQuantity(areaM2, "m²", 4)} and R = ρL/A = ${formatNcukQuantity(resistanceOhm, "Ω", 4)}. Scaling diameter by factor k = ${w.k} scales area by k² and length by 1/k² at constant volume, so R₂ = R / k⁴ = ${formatNcukQuantity(redrawnR, "Ω", 4)} ≈ ${ansStr}.`;

      items.push({
        id: `${NCUK_AC4_ID_PREFIX}-remelt-${String(i + 1).padStart(2, "0")}`,
        conceptId: "resistivity-ohmic-conductors",
        templateArchetype: "ncuk-remelted-redrawn-wire-resistivity",
        seed,
        syllabi: syllabiForSubtopic("ncuk-ac4-2"),
        format: "mcq",
        difficulty: difficultyForIndex(i),
        domain: "pure-calculation",
        scenarioSpec,
        hiddenQuantities: [targetKey, "volumeM3"],
        requiredGivens,
        stem,
        options,
        targetMode: "quantitative",
        targetQuantityKey: targetKey,
        workedSolution,
        markScheme: [
          {
            code: "A1",
            criterion: `Applies constant-volume geometry accurately to obtain ${ansStr}.`,
            marks: 1,
          },
        ],
        totalMarks: 1,
        generatorModel,
      });
    } else {
      // 5-mark structured: (a) 2m wire R, (b) 1m power across V, (c) 2m cube edge length s from constant volume
      const r3 = formatNcukQuantity(resistanceOhm, "Ω", 3);
      const r4 = formatNcukQuantity(resistanceOhm, "Ω", 4);
      const p3 = formatNcukQuantity(powerW, "W", 3);
      const s3 = formatNcukQuantity(cubeEdgeMm, "mm", 3);
      const stem = `A heating element is made from a uniform cylindrical ${w.alloy} of diameter ${formatNcukQuantity(w.dMm, "mm", 3)}, length ${formatNcukQuantity(w.lM, "m", 3)}, and resistivity ${formatNcukQuantity(w.rho, "Ω m", 3)}. It is connected across a steady ${formatNcukQuantity(w.vV, "V", 3)} DC supply.`;

      const parts: StructuredQuestionPart[] = [
        {
          partId: "a",
          prompt: "Calculate the electrical resistance of the wire.",
          marks: 2,
          targetMode: "quantitative",
          targetQuantityKey: "resistanceOhm",
          expectedAnswer: r3,
          workingSteps: [
            `A = πd²/4 = π × (${w.dMm} × 10⁻³)² / 4 = ${formatNcukQuantity(areaM2, "m²", 4)}.`,
            `R = ρL / A = (${formatNcukQuantity(w.rho, "Ω m", 4)} × ${w.lM}) / ${formatNcukQuantity(areaM2, "m²", 4)} = ${r4} ≈ ${r3}.`,
          ],
        },
        {
          partId: "b",
          prompt: `Calculate the thermal power output of the heating element at ${formatNcukQuantity(w.vV, "V", 3)}.`,
          marks: 1,
          dependsOnPartIds: ["a"],
          targetMode: "quantitative",
          targetQuantityKey: "powerW",
          expectedAnswer: p3,
          workingSteps: [
            `P = V² / R = ${w.vV}² / ${r4} = ${formatNcukQuantity(powerW, "W", 4)} ≈ ${p3}.`,
          ],
        },
        {
          partId: "c",
          prompt:
            "The wire is later melted down without loss and cast into a solid cube. Calculate the edge length of the cube in mm.",
          marks: 2,
          dependsOnPartIds: ["a"],
          targetMode: "quantitative",
          targetQuantityKey: "cubeEdgeMm",
          expectedAnswer: s3,
          workingSteps: [
            `Volume conserved: V = AL = ${formatNcukQuantity(areaM2, "m²", 4)} × ${w.lM} = ${formatNcukQuantity(volumeM3, "m³", 4)}.`,
            `Cube edge s = ∛V = ${formatNcukQuantity(cubeEdgeMm * 1e-3, "m", 4)} = ${s3}.`,
          ],
        },
      ];

      const markScheme: MarkSchemePoint[] = [
        {
          code: "M1",
          partId: "a",
          criterion: `Evaluates A = πd²/4 = ${formatNcukQuantity(areaM2, "m²", 3)} and substitutes into R = ρL/A.`,
          marks: 1,
        },
        {
          code: "A1",
          partId: "a",
          criterion: `Correct resistance ${r3}.`,
          marks: 1,
        },
        {
          code: "A1",
          partId: "b",
          criterion: `Correct power P = V²/R = ${p3}.`,
          marks: 1,
        },
        {
          code: "M1",
          partId: "c",
          criterion: `Computes conserved volume V = AL = ${formatNcukQuantity(volumeM3, "m³", 3)} and sets s³ = V.`,
          marks: 1,
        },
        {
          code: "A1",
          partId: "c",
          criterion: `Correct cube edge length ${s3}.`,
          marks: 1,
        },
      ];

      items.push({
        id: `${NCUK_AC4_ID_PREFIX}-remelt-${String(i + 1).padStart(2, "0")}`,
        conceptId: "resistivity-ohmic-conductors",
        templateArchetype: "ncuk-remelted-redrawn-wire-resistivity",
        seed,
        syllabi: syllabiForSubtopic("ncuk-ac4-2"),
        format: "structured",
        difficulty: difficultyForIndex(i),
        domain: "pure-calculation",
        scenarioSpec,
        hiddenQuantities: ["resistanceOhm", "powerW", "cubeEdgeMm", "volumeM3"],
        requiredGivens: [
          ...requiredGivens,
          { name: "voltageV", value: w.vV, unit: "V", source: "stem" },
        ],
        stem,
        parts,
        workedSolution: `(a) A = ${formatNcukQuantity(areaM2, "m²", 4)}, R = ${r4} ≈ ${r3}. (b) P = V²/R = ${p3}. (c) V = AL = ${formatNcukQuantity(volumeM3, "m³", 4)}, so s = ∛V = ${s3}.`,
        markScheme,
        totalMarks: 5,
        generatorModel,
      });
    }
  }
  return items;
}

/* -------------------------------------------------------------------------- */
/*  10. AC4.2 :: Symbolic & 3-Stage Equal-R Resistor Ladder (14 items + SVG)  */
/* -------------------------------------------------------------------------- */

function buildResistorLadderItems(
  baseSeed: number,
  generatorModel: string,
): CandidateQuestionInput[] {
  const symbolicTuples = [
    { k: 4, m: 3, n: 6, rBase: 10, vSup: 20, ctx: "precision attenuator board" },
    { k: 12, m: 3, n: 6, rBase: 8, vSup: 24, ctx: "matched-impedance ladder" },
    { k: 6, m: 6, n: 12, rBase: 12, vSup: 18, ctx: "laboratory bridge module" },
    { k: 3, m: 6, n: 12, rBase: 15, vSup: 15, ctx: "scaling resistor array" },
    { k: 6, m: 2, n: 2, rBase: 9, vSup: 18, ctx: "compact passive network" },
    { k: 3, m: 2, n: 2, rBase: 12, vSup: 18, ctx: "symmetric divider ladder" },
    { k: 12, m: 8, n: 8, rBase: 6, vSup: 24, ctx: "reference resistor block" },
    { k: 8, m: 12, n: 12, rBase: 5, vSup: 20, ctx: "signal-conditioning pad" },
    { k: 5, m: 4, n: 12, rBase: 8, vSup: 20, ctx: "custom decade network" },
  ];

  const numericStages = [
    { r0: 6, s1: 2, s2: 3, s3: 1, vSup: 22, ctx: "three-stage equal-resistor strip" },
    { r0: 12, s1: 2, s2: 3, s3: 1, vSup: 44, ctx: "modular resistor bank" },
    { r0: 18, s1: 2, s2: 3, s3: 1, vSup: 33, ctx: "bench load-testing array" },
    { r0: 24, s1: 2, s2: 4, s3: 1, vSup: 42, ctx: "high-power resistor ladder" },
    { r0: 30, s1: 3, s2: 6, s3: 1, vSup: 45, ctx: "staged dummy-load network" },
  ];

  const items: CandidateQuestionInput[] = [];

  // 9 Symbolic MCQs (first 6) + 3 Symbolic Structured (indices 6..8) + 3 Numeric MCQs + 2 Numeric Structured = 14 total!
  // Actually let's do: 9 MCQs (6 symbolic + 3 numeric) + 5 Structured 4m (3 symbolic + 2 numeric) = 14 total!
  for (let i = 0; i < 9; i += 1) {
    const t = symbolicTuples[i];
    const seed = baseSeed + 1000 + i;
    const isMcq = i < 6;
    const scenarioSpec: Record<string, unknown> = {
      kind: "symbolic-resistor-ladder",
      mode: "symbolic",
      topMult: t.k,
      innerMultA: t.m,
      innerMultB: t.n,
      baseResistanceOhm: t.rBase,
      supplyVoltageV: t.vSup,
    };
    const q = solvePlugin("symbolic-resistor-ladder", scenarioSpec);
    const innerP = numQty(q, "innerParallelMult");
    const lowerM = numQty(q, "lowerBranchMult");
    const eqMult = numQty(q, "equivalentMultiplier");
    const eqOhm = numQty(q, "equivalentResistanceOhm");
    const totalI = numQty(q, "totalCurrentA");

    if (isMcq) {
      const stem = `The diagram shows a ${t.ctx} built from resistors whose values are multiples of R between terminals P and Q. The top branch contains ${t.k}R, and the lower branch consists of R in series with the parallel pair (${t.m}R || ${t.n}R) and another R. What is the total resistance between P and Q in terms of R?`;

      const fmtR = (mult: number) => `${Number(mult.toPrecision(3))}R`;
      const distractors: NumericDistractor[] = [
        { value: t.k + lowerM, rationale: "Added the top branch and lower branch in series instead of combining them in parallel." },
        { value: lowerM, rationale: "Calculated only the lower branch resistance and omitted the parallel top branch." },
        { value: (t.k * (t.m + t.n + 2)) / (t.k + t.m + t.n + 2), rationale: "Added the inner parallel pair mR and nR in series instead of in parallel." },
        { value: eqMult * 2, rationale: "Omitted the factor of 1/2 when combining two equal parallel branches." },
      ];

      const options = buildNumericMcqOptions({
        correctValue: eqMult,
        distractors,
        seed,
        formatFn: fmtR,
      });

      const ansStr = fmtR(eqMult);
      const workedSolution = `Inner parallel pair: (${t.m}R × ${t.n}R) / (${t.m}R + ${t.n}R) = ${fmtR(innerP)}. Lower branch total: R + ${fmtR(innerP)} + R = ${fmtR(lowerM)}. Combining in parallel with ${t.k}R gives R_PQ = (${t.k} × ${lowerM}) / (${t.k} + ${lowerM}) R = ${ansStr}.`;

      items.push({
        id: `${NCUK_AC4_ID_PREFIX}-ladder-${String(i + 1).padStart(2, "0")}`,
        conceptId: "ohms-law-iv-characteristics",
        templateArchetype: "ncuk-symbolic-and-numeric-resistor-ladder",
        seed,
        syllabi: syllabiForSubtopic("ncuk-ac4-2"),
        format: "mcq",
        difficulty: difficultyForIndex(i),
        domain: "circuits",
        scenarioSpec,
        hiddenQuantities: [
          "innerParallelMult",
          "lowerBranchMult",
          "equivalentMultiplier",
          "equivalentResistanceOhm",
        ],
        requiredGivens: [
          { name: "topMult", value: t.k, source: "either" },
          { name: "innerMultA", value: t.m, source: "either" },
          { name: "innerMultB", value: t.n, source: "either" },
        ],
        stem,
        options,
        targetMode: "quantitative",
        targetQuantityKey: "equivalentMultiplier",
        workedSolution,
        markScheme: [
          {
            code: "A1",
            criterion: `Reduces the inner parallel pair, series lower branch, and outer parallel combination to obtain ${ansStr}.`,
            marks: 1,
          },
        ],
        totalMarks: 1,
        generatorModel,
      });
    } else {
      // 4-mark structured: (a) 2m equivalentResistanceOhm when R = rBase, (b) 2m totalCurrentA across vSup
      const rEqStr = formatNcukQuantity(eqOhm, "Ω", 3);
      const iStr = formatNcukQuantity(totalI, "A", 3);
      const stem = `In the ${t.ctx} shown between terminals P and Q, each resistor is a multiple of R = ${formatNcukQuantity(t.rBase, "Ω", 3)}. A regulated ${formatNcukQuantity(t.vSup, "V", 3)} supply of negligible internal resistance is connected between P and Q.`;

      const parts: StructuredQuestionPart[] = [
        {
          partId: "a",
          prompt:
            "Step by step, determine the total equivalent resistance between terminals P and Q.",
          marks: 2,
          targetMode: "quantitative",
          targetQuantityKey: "equivalentResistanceOhm",
          expectedAnswer: rEqStr,
          workingSteps: [
            `Inner parallel block: (${t.m}R || ${t.n}R) = ${innerP}R = ${formatNcukQuantity(innerP * t.rBase, "Ω", 4)}.`,
            `Lower branch: R + ${innerP}R + R = ${lowerM}R = ${formatNcukQuantity(lowerM * t.rBase, "Ω", 4)}.`,
            `Outer parallel with ${t.k}R: R_PQ = ${eqMult}R = ${formatNcukQuantity(eqOhm, "Ω", 4)} ≈ ${rEqStr}.`,
          ],
        },
        {
          partId: "b",
          prompt:
            "Calculate the total current drawn from the supply connected across P and Q.",
          marks: 2,
          dependsOnPartIds: ["a"],
          targetMode: "quantitative",
          targetQuantityKey: "totalCurrentA",
          expectedAnswer: iStr,
          workingSteps: [
            `Apply I = V / R_PQ = ${t.vSup} / ${formatNcukQuantity(eqOhm, "Ω", 4)} = ${formatNcukQuantity(totalI, "A", 4)} ≈ ${iStr}.`,
          ],
        },
      ];

      items.push({
        id: `${NCUK_AC4_ID_PREFIX}-ladder-${String(i + 1).padStart(2, "0")}`,
        conceptId: "ohms-law-iv-characteristics",
        templateArchetype: "ncuk-symbolic-and-numeric-resistor-ladder",
        seed,
        syllabi: syllabiForSubtopic("ncuk-ac4-2"),
        format: "structured",
        difficulty: difficultyForIndex(i),
        domain: "circuits",
        scenarioSpec,
        hiddenQuantities: [
          "equivalentMultiplier",
          "equivalentResistanceOhm",
          "totalCurrentA",
        ],
        requiredGivens: [
          { name: "baseResistanceOhm", value: t.rBase, unit: "Ω", source: "stem" },
          { name: "supplyVoltageV", value: t.vSup, unit: "V", source: "stem" },
        ],
        stem,
        parts,
        workedSolution: `(a) Inner pair = ${innerP}R, lower branch = ${lowerM}R, combined with ${t.k}R gives ${eqMult}R = ${rEqStr}. (b) I = V / R_PQ = ${iStr}.`,
        markScheme: [
          {
            code: "M1",
            partId: "a",
            criterion: `Reduces inner parallel pair to ${innerP}R and lower branch to ${lowerM}R.`,
            marks: 1,
          },
          {
            code: "A1",
            partId: "a",
            criterion: `Correct total resistance ${rEqStr}.`,
            marks: 1,
          },
          {
            code: "M1",
            partId: "b",
            criterion: "Uses I = V / R_PQ with supply voltage.",
            marks: 1,
          },
          {
            code: "A1",
            partId: "b",
            criterion: `Correct total current ${iStr}.`,
            marks: 1,
          },
        ],
        totalMarks: 4,
        generatorModel,
      });
    }
  }

  for (let j = 0; j < numericStages.length; j += 1) {
    const n = numericStages[j];
    const idx = 9 + j;
    const seed = baseSeed + 1000 + idx;
    const isMcq = j < 3;
    const scenarioSpec: Record<string, unknown> = {
      kind: "symbolic-resistor-ladder",
      mode: "three-stage-numeric",
      baseResistanceOhm: n.r0,
      stage1Count: n.s1,
      stage2Count: n.s2,
      stage3Count: n.s3,
      supplyVoltageV: n.vSup,
    };
    const q = solvePlugin("symbolic-resistor-ladder", scenarioSpec);
    const rEq = numQty(q, "equivalentResistanceOhm");
    const totalI = numQty(q, "totalCurrentA");

    if (isMcq) {
      const stem = `The ${n.ctx} shown between terminals P and Q consists of identical ${formatNcukQuantity(n.r0, "Ω", 3)} resistors arranged in three series stages of ${n.s1}, ${n.s2}, and ${n.s3} parallel branch(es) respectively. What is the combined resistance between P and Q?`;
      const distractors: NumericDistractor[] = [
        { value: n.r0 * (n.s1 + n.s2 + n.s3), rationale: "Added every resistor in series instead of treating parallel stages as R₀/N." },
        { value: n.r0 / (n.s1 + n.s2 + n.s3), rationale: "Treated all resistors across the three stages as being in parallel." },
        { value: n.r0 * (1 / n.s1 + 1 / n.s2), rationale: "Omitted the final single resistor stage in series." },
      ];
      const options = buildNumericMcqOptions({
        correctValue: rEq,
        unit: "Ω",
        distractors,
        seed,
      });
      const ansStr = formatNcukQuantity(rEq, "Ω", 3);

      items.push({
        id: `${NCUK_AC4_ID_PREFIX}-ladder-${String(idx + 1).padStart(2, "0")}`,
        conceptId: "ohms-law-iv-characteristics",
        templateArchetype: "ncuk-symbolic-and-numeric-resistor-ladder",
        seed,
        syllabi: syllabiForSubtopic("ncuk-ac4-2"),
        format: "mcq",
        difficulty: difficultyForIndex(idx),
        domain: "circuits",
        scenarioSpec,
        hiddenQuantities: ["equivalentResistanceOhm", "totalCurrentA", "totalPowerW"],
        requiredGivens: [
          { name: "baseResistanceOhm", value: n.r0, unit: "Ω", source: "either" },
        ],
        stem,
        options,
        targetMode: "quantitative",
        targetQuantityKey: "equivalentResistanceOhm",
        workedSolution: `Combine each parallel stage: R_PQ = ${n.r0}/${n.s1} + ${n.r0}/${n.s2} + ${n.r0}/${n.s3} = ${formatNcukQuantity(rEq, "Ω", 4)} ≈ ${ansStr}.`,
        markScheme: [
          {
            code: "A1",
            criterion: `Sums the three stage resistances R₀/${n.s1} + R₀/${n.s2} + R₀/${n.s3} to obtain ${ansStr}.`,
            marks: 1,
          },
        ],
        totalMarks: 1,
        generatorModel,
      });
    } else {
      const rEqStr = formatNcukQuantity(rEq, "Ω", 3);
      const iStr = formatNcukQuantity(totalI, "A", 3);
      const stem = `A ${n.ctx} between terminals P and Q is assembled from identical ${formatNcukQuantity(n.r0, "Ω", 3)} resistors in three stages as shown. A ${formatNcukQuantity(n.vSup, "V", 3)} DC source is applied across P and Q.`;

      const parts: StructuredQuestionPart[] = [
        {
          partId: "a",
          prompt: "Calculate the total resistance between P and Q.",
          marks: 2,
          targetMode: "quantitative",
          targetQuantityKey: "equivalentResistanceOhm",
          expectedAnswer: rEqStr,
          workingSteps: [
            `Stage resistances: R₁ = ${n.r0}/${n.s1} = ${formatNcukQuantity(n.r0 / n.s1, "Ω", 4)}, R₂ = ${n.r0}/${n.s2} = ${formatNcukQuantity(n.r0 / n.s2, "Ω", 4)}, R₃ = ${formatNcukQuantity(n.r0 / n.s3, "Ω", 4)}.`,
            `Total R_PQ = R₁ + R₂ + R₃ = ${formatNcukQuantity(rEq, "Ω", 4)} ≈ ${rEqStr}.`,
          ],
        },
        {
          partId: "b",
          prompt: "Calculate the total current entering terminal P.",
          marks: 2,
          dependsOnPartIds: ["a"],
          targetMode: "quantitative",
          targetQuantityKey: "totalCurrentA",
          expectedAnswer: iStr,
          workingSteps: [
            `I = V / R_PQ = ${n.vSup} / ${formatNcukQuantity(rEq, "Ω", 4)} = ${formatNcukQuantity(totalI, "A", 4)} ≈ ${iStr}.`,
          ],
        },
      ];

      items.push({
        id: `${NCUK_AC4_ID_PREFIX}-ladder-${String(idx + 1).padStart(2, "0")}`,
        conceptId: "ohms-law-iv-characteristics",
        templateArchetype: "ncuk-symbolic-and-numeric-resistor-ladder",
        seed,
        syllabi: syllabiForSubtopic("ncuk-ac4-2"),
        format: "structured",
        difficulty: difficultyForIndex(idx),
        domain: "circuits",
        scenarioSpec,
        hiddenQuantities: ["equivalentResistanceOhm", "totalCurrentA", "totalPowerW"],
        requiredGivens: [
          { name: "baseResistanceOhm", value: n.r0, unit: "Ω", source: "either" },
          { name: "supplyVoltageV", value: n.vSup, unit: "V", source: "stem" },
        ],
        stem,
        parts,
        workedSolution: `(a) R_PQ = ${rEqStr}. (b) I = V / R_PQ = ${iStr}.`,
        markScheme: [
          {
            code: "M1",
            partId: "a",
            criterion: "Calculates each parallel stage resistance using 1/R_p = Σ(1/R) and adds in series.",
            marks: 1,
          },
          {
            code: "A1",
            partId: "a",
            criterion: `Correct combined resistance ${rEqStr}.`,
            marks: 1,
          },
          {
            code: "M1",
            partId: "b",
            criterion: "Applies Ohm's law I = V / R_PQ.",
            marks: 1,
          },
          {
            code: "A1",
            partId: "b",
            criterion: `Correct total current ${iStr}.`,
            marks: 1,
          },
        ],
        totalMarks: 4,
        generatorModel,
      });
    }
  }
  return items;
}

/* -------------------------------------------------------------------------- */
/*  11. AC4.3 :: Two-Load Battery Swap (14 items)                             */
/* -------------------------------------------------------------------------- */

function buildTwoLoadBatteryItems(
  baseSeed: number,
  generatorModel: string,
): CandidateQuestionInput[] {
  const configs = [
    { emf: 9.0, r1: 8.0, v1: 7.2, r2: 4.0, ctx: "alkaline 9 V battery" },
    { emf: 6.0, r1: 5.0, v1: 5.0, r2: 2.0, ctx: "lantern battery pack" },
    { emf: 12.0, r1: 10.0, v1: 10.0, r2: 6.0, ctx: "portable lead-acid pack" },
    { emf: 4.5, r1: 6.0, v1: 3.6, r2: 3.0, ctx: "three-cell lab supply" },
    { emf: 3.0, r1: 4.0, v1: 2.4, r2: 1.5, ctx: "aged dry cell pair" },
    { emf: 10.5, r1: 12.0, v1: 9.0, r2: 4.0, ctx: "bench battery module" },
    { emf: 7.5, r1: 9.0, v1: 6.75, r2: 3.0, ctx: "nickel-metal-hydride pack" },
    { emf: 12.0, r1: 15.0, v1: 10.8, r2: 5.0, ctx: "automotive auxiliary battery" },
    { emf: 6.0, r1: 8.0, v1: 4.8, r2: 3.0, ctx: "field-kit cell holder" },
    { emf: 9.0, r1: 10.0, v1: 7.5, r2: 4.0, ctx: "backup power cartridge" },
    { emf: 4.8, r1: 6.0, v1: 4.0, r2: 2.4, ctx: "four-cell rechargeable pack" },
    { emf: 12.6, r1: 18.0, v1: 11.34, r2: 6.0, ctx: "solar storage battery" },
    { emf: 8.0, r1: 7.0, v1: 7.0, r2: 3.0, ctx: "robotics test battery" },
    { emf: 5.0, r1: 4.0, v1: 4.0, r2: 9.0, ctx: "demonstration zinc-carbon pack" },
  ];

  const items: CandidateQuestionInput[] = [];
  for (let i = 0; i < configs.length; i += 1) {
    const c = configs[i];
    const seed = baseSeed + 1100 + i;
    const isMcq = i < 8;
    const scenarioSpec: Record<string, unknown> = {
      kind: "two-load-battery-bulb",
      mode: "two-load",
      emfV: c.emf,
      load1Ohm: c.r1,
      terminalPd1V: c.v1,
      load2Ohm: c.r2,
    };
    const q = solvePlugin("two-load-battery-bulb", scenarioSpec);
    const i1A = numQty(q, "current1A");
    const rInt = numQty(q, "internalResistanceOhm");
    const i2A = numQty(q, "current2A");
    const v2V = numQty(q, "terminalPd2V");

    const requiredGivens: RequiredGivenSpec[] = [
      { name: "emfV", value: c.emf, unit: "V", source: "stem" },
      { name: "load1Ohm", value: c.r1, unit: "Ω", source: "stem" },
      { name: "terminalPd1V", value: c.v1, unit: "V", source: "stem" },
      { name: "load2Ohm", value: c.r2, unit: "Ω", source: "stem" },
    ];

    if (isMcq) {
      const stem = `A high-resistance digital voltmeter connected across an open-circuit ${c.ctx} reads ${formatNcukQuantity(c.emf, "V", 3)}. When a ${formatNcukQuantity(c.r1, "Ω", 3)} resistor is connected across the terminals, the voltmeter reading drops to ${formatNcukQuantity(c.v1, "V", 3)}. If the ${formatNcukQuantity(c.r1, "Ω", 3)} resistor is replaced by a ${formatNcukQuantity(c.r2, "Ω", 3)} resistor, what is the new terminal potential difference?`;

      const distractors: NumericDistractor[] = [
        { value: c.v1, rationale: "Assumed terminal potential difference stays unchanged when load resistance changes." },
        { value: (c.emf * rInt) / (c.r2 + rInt), rationale: "Calculated the lost volts Ir instead of the terminal potential difference IR₂." },
        { value: c.emf - (c.emf - c.v1) * (c.r2 / c.r1), rationale: "Scaled lost volts proportionally to R₂ / R₁ rather than recalculating circuit current I₂." },
      ];

      const options = buildNumericMcqOptions({
        correctValue: v2V,
        unit: "V",
        distractors,
        seed,
      });

      const ansStr = formatNcukQuantity(v2V, "V", 3);
      const workedSolution = `Open-circuit reading gives ε = ${formatNcukQuantity(c.emf, "V", 3)}. With R₁ = ${c.r1} Ω, I₁ = V₁/R₁ = ${formatNcukQuantity(i1A, "A", 4)} and r = (ε − V₁)/I₁ = ${formatNcukQuantity(rInt, "Ω", 4)}. With R₂ = ${c.r2} Ω, V₂ = ε R₂ / (R₂ + r) = ${formatNcukQuantity(v2V, "V", 4)} ≈ ${ansStr}.`;

      items.push({
        id: `${NCUK_AC4_ID_PREFIX}-twoload-${String(i + 1).padStart(2, "0")}`,
        conceptId: "emf-internal-resistance",
        templateArchetype: "ncuk-two-load-battery-swap",
        seed,
        syllabi: syllabiForSubtopic("ncuk-ac4-3"),
        format: "mcq",
        difficulty: difficultyForIndex(i),
        domain: "pure-calculation",
        scenarioSpec,
        hiddenQuantities: ["internalResistanceOhm", "terminalPd2V", "current2A"],
        requiredGivens,
        stem,
        options,
        targetMode: "quantitative",
        targetQuantityKey: "terminalPd2V",
        workedSolution,
        markScheme: [
          {
            code: "A1",
            criterion: `Finds internal resistance r = ${formatNcukQuantity(rInt, "Ω", 3)} and computes V₂ = ${ansStr}.`,
            marks: 1,
          },
        ],
        totalMarks: 1,
        generatorModel,
      });
    } else {
      // 4-mark structured: (a) 2m find internal resistance r, (b) 2m new terminal pd V2
      const r3 = formatNcukQuantity(rInt, "Ω", 3);
      const r4 = formatNcukQuantity(rInt, "Ω", 4);
      const v2Str3 = formatNcukQuantity(v2V, "V", 3);
      const v2Str4 = formatNcukQuantity(v2V, "V", 4);

      const stem = `An ideal voltmeter placed directly across the terminals of ${withArticle(c.ctx)} on open circuit reads ${formatNcukQuantity(c.emf, "V", 3)}. When a ${formatNcukQuantity(c.r1, "Ω", 3)} load resistor is connected across the battery, the voltmeter reading falls to ${formatNcukQuantity(c.v1, "V", 3)}. The first load is then removed and replaced by a ${formatNcukQuantity(c.r2, "Ω", 3)} load resistor.`;

      const parts: StructuredQuestionPart[] = [
        {
          partId: "a",
          prompt: "Calculate the internal resistance of the battery.",
          marks: 2,
          targetMode: "quantitative",
          targetQuantityKey: "internalResistanceOhm",
          expectedAnswer: r3,
          workingSteps: [
            `Open-circuit reading gives ε = ${formatNcukQuantity(c.emf, "V", 4)}.`,
            `Load current I₁ = V₁ / R₁ = ${c.v1} / ${c.r1} = ${formatNcukQuantity(i1A, "A", 4)}.`,
            `Internal resistance r = (ε − V₁) / I₁ = (${c.emf} − ${c.v1}) / ${formatNcukQuantity(i1A, "A", 4)} = ${r4} ≈ ${r3}.`,
          ],
        },
        {
          partId: "b",
          prompt: `Calculate the new terminal potential difference across the ${formatNcukQuantity(c.r2, "Ω", 3)} resistor.`,
          marks: 2,
          dependsOnPartIds: ["a"],
          targetMode: "quantitative",
          targetQuantityKey: "terminalPd2V",
          expectedAnswer: v2Str3,
          workingSteps: [
            `New current I₂ = ε / (R₂ + r) = ${c.emf} / (${c.r2} + ${r4}) = ${formatNcukQuantity(i2A, "A", 4)}.`,
            `Terminal pd V₂ = I₂ R₂ = ${formatNcukQuantity(i2A, "A", 4)} × ${c.r2} = ${v2Str4} ≈ ${v2Str3}.`,
          ],
        },
      ];

      items.push({
        id: `${NCUK_AC4_ID_PREFIX}-twoload-${String(i + 1).padStart(2, "0")}`,
        conceptId: "emf-internal-resistance",
        templateArchetype: "ncuk-two-load-battery-swap",
        seed,
        syllabi: syllabiForSubtopic("ncuk-ac4-3"),
        format: "structured",
        difficulty: difficultyForIndex(i),
        domain: "pure-calculation",
        scenarioSpec,
        hiddenQuantities: ["internalResistanceOhm", "terminalPd2V", "current2A"],
        requiredGivens,
        stem,
        parts,
        workedSolution: `(a) I₁ = ${formatNcukQuantity(i1A, "A", 4)}, so r = (ε − V₁)/I₁ = ${r4} ≈ ${r3}. (b) I₂ = ${formatNcukQuantity(i2A, "A", 4)}, giving V₂ = I₂R₂ = ${v2Str4} ≈ ${v2Str3}.`,
        markScheme: [
          {
            code: "M1",
            partId: "a",
            criterion: `Evaluates I₁ = V₁ / R₁ = ${formatNcukQuantity(i1A, "A", 3)} and substitutes into r = (ε − V₁) / I₁.`,
            marks: 1,
          },
          {
            code: "A1",
            partId: "a",
            criterion: `Correct internal resistance ${r3}.`,
            marks: 1,
          },
          {
            code: "M1",
            partId: "b",
            criterion: "Uses V₂ = ε R₂ / (R₂ + r) (or finds I₂ then I₂R₂).",
            marks: 1,
          },
          {
            code: "A1",
            partId: "b",
            criterion: `Correct terminal potential difference ${v2Str3}.`,
            marks: 1,
          },
        ],
        totalMarks: 4,
        generatorModel,
      });
    }
  }
  return items;
}

/* -------------------------------------------------------------------------- */
/*  12. AC4.3 :: Appliance / Bulb Power Rating (12 items: 8 MCQ + 4 × 2m)     */
/* -------------------------------------------------------------------------- */

function buildApplianceRatingItems(
  baseSeed: number,
  generatorModel: string,
): CandidateQuestionInput[] {
  const itemsSpec = [
    { name: "halogen work lamp", v: 12, p: 24, tMin: 5 },
    { name: "bench immersion heater", v: 24, p: 48, tMin: 4 },
    { name: "automotive spotlight bulb", v: 12, p: 55, tMin: 6 },
    { name: "laboratory kettle element", v: 230, p: 1840, tMin: 3 },
    { name: "microscope illuminator", v: 6, p: 18, tMin: 8 },
    { name: "stage projector lamp", v: 24, p: 150, tMin: 2 },
    { name: "portable travel iron", v: 230, p: 920, tMin: 5 },
    { name: "camping floodlight", v: 12, p: 36, tMin: 10 },
    { name: "compact soldering wand", v: 24, p: 60, tMin: 6 },
    { name: "filament demonstration lamp", v: 12, p: 42, tMin: 5 },
    { name: "warming tray heater", v: 230, p: 460, tMin: 4 },
    { name: "bicycle headlight bulb", v: 6, p: 15, tMin: 12 },
  ];

  const items: CandidateQuestionInput[] = [];
  for (let i = 0; i < itemsSpec.length; i += 1) {
    const a = itemsSpec[i];
    const seed = baseSeed + 1200 + i;
    const isMcq = i < 8;
    const scenarioSpec: Record<string, unknown> = {
      kind: "two-load-battery-bulb",
      mode: "appliance-rating",
      ratedVoltageV: a.v,
      ratedPowerW: a.p,
      timeMin: a.tMin,
    };
    const q = solvePlugin("two-load-battery-bulb", scenarioSpec);
    const ratedI = numQty(q, "ratedCurrentA");
    const rOhm = numQty(q, "resistanceOhm");
    const energyJ = numQty(q, "energyTransferredJ");

    const requiredGivens: RequiredGivenSpec[] = [
      { name: "ratedVoltageV", value: a.v, unit: "V", source: "stem" },
      { name: "ratedPowerW", value: a.p, unit: "W", source: "stem" },
    ];

    if (isMcq) {
      const askR = i % 2 === 0;
      const targetKey = askR ? "resistanceOhm" : "ratedCurrentA";
      const targetVal = askR ? rOhm : ratedI;
      const unit = askR ? "Ω" : "A";

      const stem = askR
        ? `${withArticle(a.name, true)} is labelled "${a.v} V, ${a.p} W". What is its working electrical resistance when operating at its rated potential difference?`
        : `${withArticle(a.name, true)} carries the rating "${a.v} V, ${a.p} W". What steady current does it draw when operated at its rated voltage?`;

      const distractors: NumericDistractor[] = askR
        ? [
            { value: a.p / (a.v * a.v), rationale: "Inverted R = V² / P as P / V²." },
            { value: a.v / a.p, rationale: "Used V / P instead of V² / P." },
            { value: a.p / a.v, rationale: "Calculated the rated current I = P / V rather than the resistance." },
          ]
        : [
            { value: a.v / a.p, rationale: "Divided V by P instead of P by V." },
            { value: rOhm, rationale: "Calculated working resistance R = V²/P instead of current I = P/V." },
            { value: a.p * a.v, rationale: "Multiplied power by voltage instead of dividing." },
          ];

      const options = buildNumericMcqOptions({
        correctValue: targetVal,
        unit,
        distractors,
        seed,
      });

      const ansStr = formatNcukQuantity(targetVal, unit, 3);
      const workedSolution = askR
        ? `Using P = V² / R gives R = V² / P = ${a.v}² / ${a.p} = ${formatNcukQuantity(rOhm, "Ω", 4)} ≈ ${ansStr}.`
        : `Using P = IV gives I = P / V = ${a.p} / ${a.v} = ${formatNcukQuantity(ratedI, "A", 4)} ≈ ${ansStr}.`;

      items.push({
        id: `${NCUK_AC4_ID_PREFIX}-rating-${String(i + 1).padStart(2, "0")}`,
        conceptId: "emf-internal-resistance",
        templateArchetype: "ncuk-appliance-bulb-power-rating",
        seed,
        syllabi: syllabiForSubtopic("ncuk-ac4-3"),
        format: "mcq",
        difficulty: difficultyForIndex(i),
        domain: "pure-calculation",
        scenarioSpec,
        hiddenQuantities: [targetKey],
        requiredGivens,
        stem,
        options,
        targetMode: "quantitative",
        targetQuantityKey: targetKey,
        workedSolution,
        markScheme: [
          {
            code: "A1",
            criterion: `Applies electrical power rating equations to obtain ${ansStr}.`,
            marks: 1,
          },
        ],
        totalMarks: 1,
        generatorModel,
      });
    } else {
      // 2-mark short structured: (a) 1m resistanceOhm, (b) 1m energyTransferredJ over tMin
      const r3 = formatNcukQuantity(rOhm, "Ω", 3);
      const e3 = formatNcukQuantity(energyJ, "J", 3);
      const stem = `${withArticle(a.name, true)} is rated "${a.v} V, ${a.p} W" and is operated continuously at its rated voltage for ${a.tMin} min.`;

      const parts: StructuredQuestionPart[] = [
        {
          partId: "a",
          prompt: "Calculate the operating resistance of the component.",
          marks: 1,
          targetMode: "quantitative",
          targetQuantityKey: "resistanceOhm",
          expectedAnswer: r3,
          workingSteps: [
            `R = V² / P = ${a.v}² / ${a.p} = ${formatNcukQuantity(rOhm, "Ω", 4)} ≈ ${r3}.`,
          ],
        },
        {
          partId: "b",
          prompt: `Calculate the electrical energy transferred in ${a.tMin} min.`,
          marks: 1,
          targetMode: "quantitative",
          targetQuantityKey: "energyTransferredJ",
          expectedAnswer: e3,
          workingSteps: [
            `E = P t = ${a.p} × (${a.tMin} × 60) = ${formatNcukQuantity(energyJ, "J", 4)} ≈ ${e3}.`,
          ],
        },
      ];

      items.push({
        id: `${NCUK_AC4_ID_PREFIX}-rating-${String(i + 1).padStart(2, "0")}`,
        conceptId: "emf-internal-resistance",
        templateArchetype: "ncuk-appliance-bulb-power-rating",
        seed,
        syllabi: syllabiForSubtopic("ncuk-ac4-3"),
        format: "structured",
        difficulty: difficultyForIndex(i),
        domain: "pure-calculation",
        scenarioSpec,
        hiddenQuantities: ["resistanceOhm", "energyTransferredJ", "ratedCurrentA"],
        requiredGivens: [
          ...requiredGivens,
          { name: "timeMin", value: a.tMin, unit: "min", source: "stem" },
        ],
        stem,
        parts,
        workedSolution: `(a) R = V² / P = ${r3}. (b) E = Pt = ${e3}.`,
        markScheme: [
          {
            code: "A1",
            partId: "a",
            criterion: `Correct resistance ${r3}.`,
            marks: 1,
          },
          {
            code: "A1",
            partId: "b",
            criterion: `Correct energy transferred ${e3}.`,
            marks: 1,
          },
        ],
        totalMarks: 2,
        generatorModel,
      });
    }
  }
  return items;
}

/* -------------------------------------------------------------------------- */
/*  13. AC4.3 :: 10-Mark Flagship Internal Resistance Experiment (14 items)   */
/* -------------------------------------------------------------------------- */

function buildInternalResistance10mItems(
  baseSeed: number,
  generatorModel: string,
): CandidateQuestionInput[] {
  const experiments = [
    { cell: "alkaline D-cell pack", emf: 6.0, r: 0.8, i1: 0.4, i2: 1.4, wL: 0.5, wA: 8.0e-7, wI: 2.0, wV: 0.022, k: 5 },
    { cell: "zinc-carbon lantern cell", emf: 4.5, r: 1.2, i1: 0.3, i2: 1.3, wL: 0.4, wA: 6.0e-7, wI: 1.5, wV: 0.024, k: 4 },
    { cell: "three-cell chemistry battery", emf: 4.8, r: 0.9, i1: 0.5, i2: 1.5, wL: 0.6, wA: 7.5e-7, wI: 2.5, wV: 0.036, k: 5 },
    { cell: "bench dry-cell assembly", emf: 9.0, r: 1.5, i1: 0.6, i2: 1.8, wL: 0.5, wA: 9.0e-7, wI: 3.0, wV: 0.03, k: 6 },
    { cell: "rechargeable NiMH pack", emf: 3.6, r: 0.6, i1: 0.4, i2: 1.6, wL: 0.45, wA: 7.0e-7, wI: 2.0, wV: 0.024, k: 4 },
    { cell: "portable telemetry battery", emf: 7.2, r: 1.1, i1: 0.5, i2: 1.7, wL: 0.55, wA: 8.5e-7, wI: 2.2, wV: 0.028, k: 5 },
    { cell: "laboratory teaching cell pack", emf: 6.4, r: 0.95, i1: 0.4, i2: 1.6, wL: 0.7, wA: 1.0e-6, wI: 2.5, wV: 0.0315, k: 4 },
    { cell: "aged torch battery stack", emf: 3.0, r: 0.75, i1: 0.3, i2: 1.5, wL: 0.35, wA: 5.5e-7, wI: 1.6, wV: 0.019, k: 5 },
    { cell: "sealed lead-gel cell", emf: 6.2, r: 0.55, i1: 0.6, i2: 2.0, wL: 0.8, wA: 1.1e-6, wI: 3.0, wV: 0.038, k: 4 },
    { cell: "six-cell series cartridge", emf: 8.4, r: 1.4, i1: 0.45, i2: 1.45, wL: 0.5, wA: 6.5e-7, wI: 1.8, wV: 0.026, k: 6 },
    { cell: "field-station battery unit", emf: 5.4, r: 0.85, i1: 0.4, i2: 1.8, wL: 0.6, wA: 9.5e-7, wI: 2.4, wV: 0.029, k: 5 },
    { cell: "primary lithium-manganese pack", emf: 6.6, r: 1.05, i1: 0.5, i2: 1.7, wL: 0.45, wA: 7.2e-7, wI: 2.0, wV: 0.025, k: 5 },
    { cell: "student investigation battery", emf: 4.2, r: 0.7, i1: 0.35, i2: 1.55, wL: 0.5, wA: 8.0e-7, wI: 2.2, wV: 0.023, k: 4 },
    { cell: "portable sensor power block", emf: 7.8, r: 1.25, i1: 0.4, i2: 1.6, wL: 0.65, wA: 9.0e-7, wI: 2.5, wV: 0.032, k: 6 },
  ];

  const items: CandidateQuestionInput[] = [];
  for (let i = 0; i < experiments.length; i += 1) {
    const e = experiments[i];
    const seed = baseSeed + 1300 + i;
    const v1 = roundTo(e.emf - e.i1 * e.r, 3);
    const v2 = roundTo(e.emf - e.i2 * e.r, 3);
    const scenarioSpec: Record<string, unknown> = {
      kind: "internal-resistance-experiment",
      i1A: e.i1,
      v1V: v1,
      i2A: e.i2,
      v2V: v2,
      wireLengthM: e.wL,
      wireAreaM2: e.wA,
      wireCurrentA: e.wI,
      wireVoltageV: e.wV,
      totalLeadMultiplier: e.k,
    };
    const q = solvePlugin("internal-resistance-experiment", scenarioSpec);
    const rInt = numQty(q, "internalResistanceOhm");
    const emfV = numQty(q, "emfV");
    const wireR = numQty(q, "wireResistanceOhm");
    const wireRho = numQty(q, "wireResistivityOhmM");
    const totLeadL = numQty(q, "totalLeadLengthM");
    const totLeadR = numQty(q, "totalLeadResistanceOhm");

    const procStr = strQty(q, "procedureSummary");
    const graphStr = strQty(q, "graphFeaturesSummary");
    const leadStr = strQty(q, "leadEffectSummary");

    const r3 = formatNcukQuantity(rInt, "Ω", 3);
    const r4 = formatNcukQuantity(rInt, "Ω", 4);
    const emf3 = formatNcukQuantity(emfV, "V", 3);
    const emf4 = formatNcukQuantity(emfV, "V", 4);
    const rho3 = formatNcukQuantity(wireRho, "Ω m", 3);
    const rho4 = formatNcukQuantity(wireRho, "Ω m", 4);

    const stem = `A student uses the circuit shown to determine the electromotive force ε and internal resistance r of ${withArticle(e.cell)}. In part (a), two reliable pairs of readings recorded on the ideal ammeter and voltmeter are (I₁ = ${formatNcukQuantity(e.i1, "A", 3)}, V₁ = ${formatNcukQuantity(v1, "V", 3)}) and (I₂ = ${formatNcukQuantity(e.i2, "A", 3)}, V₂ = ${formatNcukQuantity(v2, "V", 3)}). In part (b), to assess systematic lead errors, the student tests a ${formatNcukQuantity(e.wL, "m", 3)} sample of the connecting wire (cross-sectional area ${formatNcukQuantity(e.wA, "m²", 3)}) and measures a potential difference of ${formatNcukQuantity(e.wV * 1000, "mV", 3)} when it carries ${formatNcukQuantity(e.wI, "A", 3)}. The complete experimental circuit uses a total connecting-wire length of ${formatNcukQuantity(totLeadL, "m", 3)}.`;

    const parts: StructuredQuestionPart[] = [
      {
        partId: "a-i",
        prompt:
          "Describe the experimental procedure used to obtain a suitable set of (I, V) readings with this circuit, including one precaution to reduce error.",
        marks: 2,
        targetMode: "qualitative",
        targetQuantityKey: "procedureSummary",
        expectedAnswer: `To collect reliable data, ${procStr}.`,
        workingSteps: [
          "Vary the variable resistor across its working range and record corresponding pairs of ammeter and voltmeter readings in a table.",
          "Close the momentary switch only while taking each reading so the cell does not heat up or run down.",
        ],
      },
      {
        partId: "a-ii",
        prompt:
          "Describe the shape and key graphical features of the graph obtained when terminal potential difference V (vertical axis) is plotted against current I (horizontal axis).",
        marks: 2,
        targetMode: "qualitative",
        targetQuantityKey: "graphFeaturesSummary",
        expectedAnswer: `The V against I graph is a ${graphStr}.`,
        workingSteps: [
          "Compare the circuit equation with the linear graph form linking terminal potential difference and current.",
          "Identify the vertical intercept as the electromotive force and the negative gradient as minus the internal resistance.",
        ],
      },
      {
        partId: "a-iii",
        prompt:
          "Use the two measured pairs of (I, V) readings to calculate the internal resistance r of the cell.",
        marks: 2,
        targetMode: "quantitative",
        targetQuantityKey: "internalResistanceOhm",
        expectedAnswer: r3,
        workingSteps: [
          `From V = ε − Ir, internal resistance r = −ΔV / ΔI = (V₁ − V₂) / (I₂ − I₁).`,
          `r = (${v1} − ${v2}) / (${e.i2} − ${e.i1}) = ${r4} ≈ ${r3}.`,
        ],
      },
      {
        partId: "a-iv",
        prompt:
          "Hence calculate the electromotive force ε of the cell.",
        marks: 1,
        dependsOnPartIds: ["a-iii"],
        targetMode: "quantitative",
        targetQuantityKey: "emfV",
        expectedAnswer: emf3,
        workingSteps: [
          `Substitute into ε = V₁ + I₁r = ${v1} + ${e.i1} × ${r4} = ${emf4} ≈ ${emf3}.`,
        ],
      },
      {
        partId: "b-i",
        prompt:
          "Calculate the resistivity of the connecting wire material from the sample test data.",
        marks: 2,
        targetMode: "quantitative",
        targetQuantityKey: "wireResistivityOhmM",
        expectedAnswer: rho3,
        workingSteps: [
          `Sample wire resistance R_w = V_w / I_w = ${formatNcukQuantity(e.wV, "V", 4)} / ${formatNcukQuantity(e.wI, "A", 4)} = ${formatNcukQuantity(wireR, "Ω", 4)}.`,
          `Resistivity ρ = R_w A_w / L_w = (${formatNcukQuantity(wireR, "Ω", 4)} × ${formatNcukQuantity(e.wA, "m²", 4)}) / ${e.wL} = ${rho4} ≈ ${rho3}.`,
        ],
      },
      {
        partId: "b-ii",
        prompt:
          "State and explain whether the total length of connecting wire significantly affects the measured value of ε.",
        marks: 1,
        dependsOnPartIds: ["b-i"],
        targetMode: "qualitative",
        targetQuantityKey: "leadEffectSummary",
        expectedAnswer: `The connecting wire has a ${leadStr}.`,
        workingSteps: [
          "Compare total connecting-lead resistance with internal resistance and consider the zero-current vertical intercept.",
        ],
      },
    ];

    const markScheme: MarkSchemePoint[] = [
      {
        code: "B1",
        partId: "a-i",
        criterion: "Adjusts variable resistor to take multiple pairs of ammeter (I) and voltmeter (V) readings across a wide range.",
        marks: 1,
      },
      {
        code: "B1",
        partId: "a-i",
        criterion: "Opens switch S between readings (or avoids excessive currents) to prevent heating / cell discharge.",
        marks: 1,
      },
      {
        code: "B1",
        partId: "a-ii",
        criterion: "States a straight line of negative gradient equal to −r.",
        marks: 1,
      },
      {
        code: "B1",
        partId: "a-ii",
        criterion: "States the vertical-axis intercept (at I = 0) equals the electromotive force ε.",
        marks: 1,
      },
      {
        code: "M1",
        partId: "a-iii",
        criterion: "Applies r = (V₁ − V₂) / (I₂ − I₁) correctly with the two given data pairs.",
        marks: 1,
      },
      {
        code: "A1",
        partId: "a-iii",
        criterion: `Correct internal resistance r = ${r3}.`,
        marks: 1,
      },
      {
        code: "A1",
        partId: "a-iv",
        criterion: `Substitutes r into ε = V + Ir to obtain ε = ${emf3}.`,
        marks: 1,
      },
      {
        code: "M1",
        partId: "b-i",
        criterion: `Computes R_w = V_w / I_w = ${formatNcukQuantity(wireR, "Ω", 3)} (converting mV to V) and substitutes into ρ = R_w A_w / L_w.`,
        marks: 1,
      },
      {
        code: "A1",
        partId: "b-i",
        criterion: `Correct wire resistivity ${rho3}.`,
        marks: 1,
      },
      {
        code: "B1",
        partId: "b-ii",
        criterion: `States negligible effect on ε (lead resistance ${formatNcukQuantity(totLeadR, "Ω", 3)} ≪ r, and at I = 0 intercept lead pd drop is zero).`,
        marks: 1,
      },
    ];

    items.push({
      id: `${NCUK_AC4_ID_PREFIX}-intr10m-${String(i + 1).padStart(2, "0")}`,
      conceptId: "emf-internal-resistance",
      templateArchetype: "ncuk-internal-resistance-experiment-10m",
      seed,
      syllabi: syllabiForSubtopic("ncuk-ac4-3"),
      format: "structured",
      difficulty: i < 5 ? "standard" : "higher",
      domain: "circuits",
      scenarioSpec,
      hiddenQuantities: [
        "internalResistanceOhm",
        "emfV",
        "wireResistanceOhm",
        "wireResistivityOhmM",
        "totalLeadResistanceOhm",
        "procedureSummary",
        "graphFeaturesSummary",
        "leadEffectSummary",
      ],
      requiredGivens: [
        { name: "i1A", value: e.i1, unit: "A", source: "stem" },
        { name: "v1V", value: v1, unit: "V", source: "stem" },
        { name: "i2A", value: e.i2, unit: "A", source: "stem" },
        { name: "v2V", value: v2, unit: "V", source: "stem" },
        { name: "wireLengthM", value: e.wL, unit: "m", source: "stem" },
        { name: "wireAreaM2", value: e.wA, unit: "m²", source: "stem" },
        { name: "wireCurrentA", value: e.wI, unit: "A", source: "stem" },
        { name: "wireVoltageV", value: e.wV, unit: "V", source: "stem" },
      ],
      stem,
      parts,
      workedSolution: `(a)(i) ${procStr}. (a)(ii) ${graphStr}. (a)(iii) r = (V₁ − V₂)/(I₂ − I₁) = ${r4} ≈ ${r3}. (a)(iv) ε = V₁ + I₁r = ${emf4} ≈ ${emf3}. (b)(i) R_w = ${formatNcukQuantity(wireR, "Ω", 4)}, so ρ = R_w A_w / L_w = ${rho4} ≈ ${rho3}. (b)(ii) Total lead resistance is ${formatNcukQuantity(totLeadR, "Ω", 3)}, giving a ${leadStr}.`,
      markScheme,
      totalMarks: 10,
      generatorModel,
    });
  }
  return items;
}

/* -------------------------------------------------------------------------- */
/*  14. AC4.4 :: Capacitor Voltage Breakdown Rating Network (14 items + SVG)  */
/* -------------------------------------------------------------------------- */

function buildCapacitorBreakdownItems(
  baseSeed: number,
  generatorModel: string,
): CandidateQuestionInput[] {
  const configs = [
    { c1: 60, c2: 80, c3: 40, vMax: 50, ctx: "power-supply smoothing stage" },
    { c1: 120, c2: 25, c3: 35, vMax: 40, ctx: "flash-unit energy bank" },
    { c1: 40, c2: 70, c3: 50, vMax: 60, ctx: "audio crossover filter" },
    { c1: 180, c2: 20, c3: 40, vMax: 25, ctx: "pulse-forming network" },
    { c1: 50, c2: 60, c3: 40, vMax: 100, ctx: "high-voltage surge filter" },
    { c1: 150, c2: 45, c3: 30, vMax: 50, ctx: "rectifier reservoir block" },
    { c1: 30, c2: 50, c3: 40, vMax: 40, ctx: "laboratory capacitor tray" },
    { c1: 200, c2: 40, c3: 60, vMax: 60, ctx: "inverter DC-link module" },
    { c1: 80, c2: 100, c3: 60, vMax: 50, ctx: "timing storage network" },
    { c1: 240, c2: 50, c3: 30, vMax: 40, ctx: "defibrillator training board" },
    { c1: 45, c2: 85, c3: 50, vMax: 60, ctx: "filtering capacitor cluster" },
    { c1: 160, c2: 30, c3: 50, vMax: 25, ctx: "sensor backup array" },
    { c1: 75, c2: 120, c3: 105, vMax: 100, ctx: "industrial snubber network" },
    { c1: 90, c2: 20, c3: 25, vMax: 50, ctx: "coupled charge-storage unit" },
  ];

  const items: CandidateQuestionInput[] = [];
  for (let i = 0; i < configs.length; i += 1) {
    const c = configs[i];
    const seed = baseSeed + 1400 + i;
    const isMcq = i < 8;
    const scenarioSpec: Record<string, unknown> = {
      kind: "capacitor-breakdown-rating",
      c1Uf: c.c1,
      c2Uf: c.c2,
      c3Uf: c.c3,
      maxRatingV: c.vMax,
    };
    const q = solvePlugin("capacitor-breakdown-rating", scenarioSpec);
    const cParUf = numQty(q, "cParallelUf");
    const cTotUf = numQty(q, "cTotalUf");
    const vSafeMax = numQty(q, "maxSafeTotalV");
    const maxEnergyJ = numQty(q, "maxEnergyJ");
    const limiting = strQty(q, "limitingBlock");

    const requiredGivens: RequiredGivenSpec[] = [
      { name: "c1Uf", value: c.c1, unit: "μF", source: "either" },
      { name: "c2Uf", value: c.c2, unit: "μF", source: "either" },
      { name: "c3Uf", value: c.c3, unit: "μF", source: "either" },
      { name: "maxRatingV", value: c.vMax, unit: "V", source: "either" },
    ];

    if (isMcq) {
      const stem = `In the ${c.ctx} shown between terminals A and B, capacitor C₁ = ${c.c1} μF is connected in series with the parallel pair C₂ = ${c.c2} μF and C₃ = ${c.c3} μF. Every capacitor has a maximum safe working voltage of ${c.vMax} V. What is the maximum safe potential difference that can be applied across terminals A and B without exceeding the rating of any capacitor?`;

      const distractors: NumericDistractor[] = [
        { value: c.vMax * 2, rationale: "Assumed the applied voltage splits equally (V_max across each stage) rather than inversely with capacitance." },
        { value: c.vMax, rationale: "Assumed the entire network can only withstand the rating of a single capacitor." },
        { value: c.vMax * 3, rationale: "Multiplied the single-capacitor voltage rating by the total number of capacitors (3)." },
        { value: c.vMax * (1 + Math.max(c.c1, cParUf) / Math.min(c.c1, cParUf)), rationale: "Assigned V_max to the larger-capacitance section, which would over-voltage the smaller-capacitance section." },
      ];

      const options = buildNumericMcqOptions({
        correctValue: vSafeMax,
        unit: "V",
        distractors,
        seed,
      });

      const ansStr = formatNcukQuantity(vSafeMax, "V", 3);
      const workedSolution = `Parallel pair C_p = C₂ + C₃ = ${cParUf} μF. Because C₁ (${c.c1} μF) and C_p (${cParUf} μF) carry equal series charge Q, the smaller capacitance (${limiting}) reaches ${c.vMax} V first. Thus V_AB,max = ${c.vMax} × (1 + ${Math.min(c.c1, cParUf)} / ${Math.max(c.c1, cParUf)}) = ${formatNcukQuantity(vSafeMax, "V", 4)} ≈ ${ansStr}.`;

      items.push({
        id: `${NCUK_AC4_ID_PREFIX}-caprate-${String(i + 1).padStart(2, "0")}`,
        conceptId: "capacitor-networks-energy",
        templateArchetype: "ncuk-capacitor-voltage-breakdown-rating",
        seed,
        syllabi: syllabiForSubtopic("ncuk-ac4-4"),
        format: "mcq",
        difficulty: difficultyForIndex(i),
        domain: "em-induction",
        scenarioSpec,
        hiddenQuantities: ["cTotalUf", "maxSafeTotalV", "maxEnergyJ", "maxChargeC"],
        requiredGivens,
        stem,
        options,
        targetMode: "quantitative",
        targetQuantityKey: "maxSafeTotalV",
        workedSolution,
        markScheme: [
          {
            code: "A1",
            criterion: `Identifies that the ${limiting} limits the voltage and calculates V_AB,max = ${ansStr}.`,
            marks: 1,
          },
        ],
        totalMarks: 1,
        generatorModel,
      });
    } else {
      // 5-mark structured: (a) 2m C_eq, (b) 2m maxSafeTotalV, (c) 1m maxEnergyJ
      const cTot3 = formatNcukQuantity(cTotUf, "μF", 3);
      const cTot4 = formatNcukQuantity(cTotUf, "μF", 4);
      const vMax3 = formatNcukQuantity(vSafeMax, "V", 3);
      const vMax4 = formatNcukQuantity(vSafeMax, "V", 4);
      const e3 = formatNcukQuantity(maxEnergyJ, "J", 3);
      const e4 = formatNcukQuantity(maxEnergyJ, "J", 4);

      const stem = `The ${c.ctx} shown between terminals A and B combines C₁ = ${c.c1} μF in series with the parallel pair C₂ = ${c.c2} μF and C₃ = ${c.c3} μF. Each individual capacitor is rated to a maximum safe working potential difference of ${c.vMax} V.`;

      const parts: StructuredQuestionPart[] = [
        {
          partId: "a",
          prompt: "Calculate the combined capacitance of the network between A and B in μF.",
          marks: 2,
          targetMode: "quantitative",
          targetQuantityKey: "cTotalUf",
          expectedAnswer: cTot3,
          workingSteps: [
            `Parallel branch: C_p = C₂ + C₃ = ${c.c2} + ${c.c3} = ${cParUf} μF.`,
            `Series combination: C_eq = (C₁ C_p) / (C₁ + C_p) = (${c.c1} × ${cParUf}) / (${c.c1} + ${cParUf}) = ${cTot4} ≈ ${cTot3}.`,
          ],
        },
        {
          partId: "b",
          prompt:
            "Determine the maximum safe potential difference that can be applied across A and B, stating which section reaches its voltage rating first.",
          marks: 2,
          dependsOnPartIds: ["a"],
          targetMode: "quantitative",
          targetQuantityKey: "maxSafeTotalV",
          expectedAnswer: `${vMax3} (limited by the ${limiting})`,
          workingSteps: [
            `In series both sections hold equal charge Q, so V ∝ 1/C; the smaller capacitance (${limiting}) reaches ${c.vMax} V first.`,
            `Maximum safe total pd V_AB,max = ${c.vMax} × (1 + ${Math.min(c.c1, cParUf)} / ${Math.max(c.c1, cParUf)}) = ${vMax4} ≈ ${vMax3}.`,
          ],
        },
        {
          partId: "c",
          prompt:
            "Calculate the maximum electrical energy safely stored in the complete network.",
          marks: 1,
          dependsOnPartIds: ["a", "b"],
          targetMode: "quantitative",
          targetQuantityKey: "maxEnergyJ",
          expectedAnswer: e3,
          workingSteps: [
            `E_max = ½ C_eq V_AB,max² = 0.5 × (${cTot4} × 10⁻⁶ F) × (${vMax4} V)² = ${e4} ≈ ${e3}.`,
          ],
        },
      ];

      const markScheme: MarkSchemePoint[] = [
        {
          code: "M1",
          partId: "a",
          criterion: `Evaluates C_p = ${cParUf} μF and uses 1/C_eq = 1/C₁ + 1/C_p.`,
          marks: 1,
        },
        {
          code: "A1",
          partId: "a",
          criterion: `Correct combined capacitance ${cTot3}.`,
          marks: 1,
        },
        {
          code: "M1",
          partId: "b",
          criterion: `Identifies equal series charge Q and that the ${limiting} reaches ${c.vMax} V first.`,
          marks: 1,
        },
        {
          code: "A1",
          partId: "b",
          criterion: `Correct maximum safe voltage ${vMax3}.`,
          marks: 1,
        },
        {
          code: "A1",
          partId: "c",
          criterion: `Correct maximum stored energy ${e3}.`,
          marks: 1,
        },
      ];

      items.push({
        id: `${NCUK_AC4_ID_PREFIX}-caprate-${String(i + 1).padStart(2, "0")}`,
        conceptId: "capacitor-networks-energy",
        templateArchetype: "ncuk-capacitor-voltage-breakdown-rating",
        seed,
        syllabi: syllabiForSubtopic("ncuk-ac4-4"),
        format: "structured",
        difficulty: difficultyForIndex(i),
        domain: "em-induction",
        scenarioSpec,
        hiddenQuantities: ["cTotalUf", "maxSafeTotalV", "maxEnergyJ", "maxChargeC"],
        requiredGivens,
        stem,
        parts,
        workedSolution: `(a) C_p = ${cParUf} μF, C_eq = ${cTot4} ≈ ${cTot3}. (b) The ${limiting} hits ${c.vMax} V first, giving V_AB,max = ${vMax4} ≈ ${vMax3}. (c) E_max = ½ C_eq V_AB,max² = ${e4} ≈ ${e3}.`,
        markScheme,
        totalMarks: 5,
        generatorModel,
      });
    }
  }
  return items;
}

/* -------------------------------------------------------------------------- */
/*  15. AC4.4 :: Capacitor Q-V Area & Energy Graph (14 items + SVG)           */
/* -------------------------------------------------------------------------- */

function buildCapacitorQvAreaItems(
  baseSeed: number,
  generatorModel: string,
): CandidateQuestionInput[] {
  const configs = [
    { maxV: 12, maxQMc: 4.8, orient: "Q-vs-V" as const, ctx: "electrolytic storage capacitor" },
    { maxV: 15, maxQMc: 6.0, orient: "V-vs-Q" as const, ctx: "camera-flash capacitor" },
    { maxV: 10, maxQMc: 2.5, orient: "Q-vs-V" as const, ctx: "audio-filter capacitor" },
    { maxV: 20, maxQMc: 8.0, orient: "V-vs-Q" as const, ctx: "bench super-film capacitor" },
    { maxV: 8, maxQMc: 3.6, orient: "Q-vs-V" as const, ctx: "timing-circuit capacitor" },
    { maxV: 16, maxQMc: 4.0, orient: "V-vs-Q" as const, ctx: "power-bank smoothing cell" },
    { maxV: 12, maxQMc: 9.0, orient: "Q-vs-V" as const, ctx: "pulse-discharge capacitor" },
    { maxV: 24, maxQMc: 7.2, orient: "V-vs-Q" as const, ctx: "high-voltage film capacitor" },
    { maxV: 10, maxQMc: 5.4, orient: "Q-vs-V" as const, ctx: "laboratory teaching capacitor" },
    { maxV: 18, maxQMc: 4.5, orient: "V-vs-Q" as const, ctx: "stabiliser reservoir capacitor" },
    { maxV: 14, maxQMc: 3.5, orient: "Q-vs-V" as const, ctx: "sensor-hold capacitor" },
    { maxV: 20, maxQMc: 6.4, orient: "V-vs-Q" as const, ctx: "ignition-coil capacitor" },
    { maxV: 15, maxQMc: 7.5, orient: "Q-vs-V" as const, ctx: "dc-bus decoupling capacitor" },
    { maxV: 12, maxQMc: 3.0, orient: "V-vs-Q" as const, ctx: "experiment charging capacitor" },
  ];

  const items: CandidateQuestionInput[] = [];
  for (let i = 0; i < configs.length; i += 1) {
    const c = configs[i];
    const seed = baseSeed + 1500 + i;
    const isMcq = i < 8;
    const scenarioSpec: Record<string, unknown> = {
      kind: "capacitor-qv-area",
      maxVoltageV: c.maxV,
      maxChargeMc: c.maxQMc,
      axisOrientation: c.orient,
    };
    const q = solvePlugin("capacitor-qv-area", scenarioSpec);
    const cUf = numQty(q, "capacitanceUf");
    const cF = numQty(q, "capacitanceF");
    const energyJ = numQty(q, "storedEnergyJ");
    const capDef = strQty(q, "capacitanceDefinition");

    const requiredGivens: RequiredGivenSpec[] = [
      { name: "maxVoltageV", value: c.maxV, unit: "V", source: "stem" },
      { name: "maxChargeMc", value: c.maxQMc, unit: "mC", source: "stem" },
    ];

    if (isMcq) {
      const askC = i % 2 === 1;
      const targetKey = askC ? "capacitanceUf" : "storedEnergyJ";
      const targetVal = askC ? cUf : energyJ;
      const unit = askC ? "μF" : "J";

      const stem = askC
        ? `The charging graph for ${withArticle(c.ctx)} is a straight line from the origin to Q = ${formatNcukQuantity(c.maxQMc, "mC", 3)} at V = ${formatNcukQuantity(c.maxV, "V", 3)}. What is the capacitance of the capacitor?`
        : `The straight-line charging graph for ${withArticle(c.ctx)} extends from (0, 0) to a final state of Q = ${formatNcukQuantity(c.maxQMc, "mC", 3)} and V = ${formatNcukQuantity(c.maxV, "V", 3)}. Using the area under the graph, what is the electrical energy stored in the capacitor?`;

      const distractors: NumericDistractor[] = askC
        ? [
            { value: cUf * 1e-3, rationale: "Omitted the mC-to-μF conversion factor (10³ error)." },
            { value: (c.maxV / (c.maxQMc * 1e-3)), rationale: "Evaluated V / Q instead of C = Q / V." },
            { value: cUf * 0.5, rationale: "Included an unintended factor of 1/2 when calculating C = Q / V." },
          ]
        : [
            { value: energyJ * 2, rationale: "Used E = Q V (rectangular area) instead of the triangular area E = ½ Q V." },
            { value: energyJ * 1000, rationale: "Forgot to convert charge from mC to C (10³ error)." },
            { value: energyJ * 0.5, rationale: "Applied the factor of 1/2 twice." },
          ];

      const options = buildNumericMcqOptions({
        correctValue: targetVal,
        unit,
        distractors,
        seed,
      });

      const ansStr = formatNcukQuantity(targetVal, unit, 3);
      const workedSolution = askC
        ? `Convert Q = ${c.maxQMc} mC = ${formatNcukQuantity(c.maxQMc * 1e-3, "C", 4)}. Capacitance C = Q / V = ${formatNcukQuantity(cF, "F", 4)} = ${ansStr}.`
        : `Triangular area under the linear graph gives E = ½ Q V = 0.5 × (${c.maxQMc} × 10⁻³ C) × ${c.maxV} V = ${formatNcukQuantity(energyJ, "J", 4)} ≈ ${ansStr}.`;

      items.push({
        id: `${NCUK_AC4_ID_PREFIX}-qvarea-${String(i + 1).padStart(2, "0")}`,
        conceptId: "capacitor-networks-energy",
        templateArchetype: "ncuk-capacitor-qv-area-energy",
        seed,
        syllabi: syllabiForSubtopic("ncuk-ac4-4"),
        format: "mcq",
        difficulty: difficultyForIndex(i),
        domain: "graphs",
        scenarioSpec,
        hiddenQuantities: ["capacitanceF", "capacitanceUf", "storedEnergyJ", "storedEnergyMj"],
        requiredGivens,
        stem,
        options,
        targetMode: "quantitative",
        targetQuantityKey: targetKey,
        workedSolution,
        markScheme: [
          {
            code: "A1",
            criterion: `Correctly converts mC to C and obtains ${ansStr}.`,
            marks: 1,
          },
        ],
        totalMarks: 1,
        generatorModel,
      });
    } else {
      // 4-mark structured: (a) 1m define capacitance, (b) 1m capacitance from graph, (c) 2m energy from triangular area
      const c3 = formatNcukQuantity(cUf, "μF", 3);
      const e3 = formatNcukQuantity(energyJ, "J", 3);
      const e4 = formatNcukQuantity(energyJ, "J", 4);
      const stem = `The graph shows how charge Q and potential difference V vary as ${withArticle(c.ctx)} is charged uniformly from zero up to Q = ${formatNcukQuantity(c.maxQMc, "mC", 3)} at V = ${formatNcukQuantity(c.maxV, "V", 3)}.`;

      const parts: StructuredQuestionPart[] = [
        {
          partId: "a",
          prompt: "Define capacitance.",
          marks: 1,
          targetMode: "qualitative",
          targetQuantityKey: "capacitanceDefinition",
          expectedAnswer: `Capacitance is the ${capDef}.`,
          workingSteps: [
            "State the definition as the ratio of charge stored to potential difference.",
          ],
        },
        {
          partId: "b",
          prompt: "Deduce the capacitance of the capacitor from the graph in μF.",
          marks: 1,
          targetMode: "quantitative",
          targetQuantityKey: "capacitanceUf",
          expectedAnswer: c3,
          workingSteps: [
            `C = Q / V = (${c.maxQMc} × 10⁻³ C) / ${c.maxV} V = ${formatNcukQuantity(cF, "F", 4)} = ${c3}.`,
          ],
        },
        {
          partId: "c",
          prompt:
            "Determine the electrical energy stored in the capacitor using the shaded triangular area under the graph.",
          marks: 2,
          targetMode: "quantitative",
          targetQuantityKey: "storedEnergyJ",
          expectedAnswer: e3,
          workingSteps: [
            `Because V increases linearly from 0 to V_max as charge builds up, energy stored equals the triangular area E = ½ Q V.`,
            `E = 0.5 × (${c.maxQMc} × 10⁻³ C) × ${c.maxV} V = ${e4} ≈ ${e3}.`,
          ],
        },
      ];

      items.push({
        id: `${NCUK_AC4_ID_PREFIX}-qvarea-${String(i + 1).padStart(2, "0")}`,
        conceptId: "capacitor-networks-energy",
        templateArchetype: "ncuk-capacitor-qv-area-energy",
        seed,
        syllabi: syllabiForSubtopic("ncuk-ac4-4"),
        format: "structured",
        difficulty: difficultyForIndex(i),
        domain: "graphs",
        scenarioSpec,
        hiddenQuantities: [
          "capacitanceF",
          "capacitanceUf",
          "storedEnergyJ",
          "storedEnergyMj",
          "capacitanceDefinition",
        ],
        requiredGivens,
        stem,
        parts,
        workedSolution: `(a) Capacitance is the ${capDef}. (b) C = Q / V = ${c3}. (c) Triangular area E = ½ Q V = ${e4} ≈ ${e3}.`,
        markScheme: [
          {
            code: "B1",
            partId: "a",
            criterion: `States ${capDef}.`,
            marks: 1,
          },
          {
            code: "A1",
            partId: "b",
            criterion: `Correct capacitance ${c3}.`,
            marks: 1,
          },
          {
            code: "M1",
            partId: "c",
            criterion: "Recognises triangular area E = ½ Q V and converts mC to C.",
            marks: 1,
          },
          {
            code: "A1",
            partId: "c",
            criterion: `Correct stored energy ${e3}.`,
            marks: 1,
          },
        ],
        totalMarks: 4,
        generatorModel,
      });
    }
  }
  return items;
}

/* -------------------------------------------------------------------------- */
/*  16. AC4.4 :: ln(V) vs t RC Linearization Graph (14 items + SVG)           */
/* -------------------------------------------------------------------------- */

function buildRcLnLinearizationItems(
  baseSeed: number,
  generatorModel: string,
): CandidateQuestionInput[] {
  const configs = [
    { v0: 10.0, rK: 40, cUf: 500, tEnd: 40, ctx: "student data-logger RC circuit" },
    { v0: 8.0, rK: 25, cUf: 400, tEnd: 20, ctx: "bench capacitor discharge rig" },
    { v0: 12.0, rK: 50, cUf: 600, tEnd: 60, ctx: "timing delay module" },
    { v0: 6.0, rK: 20, cUf: 250, tEnd: 10, ctx: "compact RC decay circuit" },
    { v0: 9.0, rK: 30, cUf: 400, tEnd: 24, ctx: "oscilloscope capture setup" },
    { v0: 7.5, rK: 80, cUf: 200, tEnd: 32, ctx: "high-resistance bleeder network" },
    { v0: 11.0, rK: 25, cUf: 600, tEnd: 30, ctx: "laboratory discharge board" },
    { v0: 5.0, rK: 20, cUf: 400, tEnd: 16, ctx: "sensor-decay demonstration" },
    { v0: 10.0, rK: 50, cUf: 400, tEnd: 40, ctx: "automatic shutter timer" },
    { v0: 12.0, rK: 40, cUf: 600, tEnd: 48, ctx: "precision capacitance tester" },
    { v0: 8.5, rK: 25, cUf: 500, tEnd: 25, ctx: "analog integrator bleeder" },
    { v0: 9.5, rK: 60, cUf: 300, tEnd: 36, ctx: "field-calibration RC circuit" },
    { v0: 6.5, rK: 20, cUf: 350, tEnd: 14, ctx: "teaching capacitor discharge rig" },
    { v0: 10.5, rK: 50, cUf: 500, tEnd: 50, ctx: "long-interval RC timer" },
  ];

  const items: CandidateQuestionInput[] = [];
  for (let i = 0; i < configs.length; i += 1) {
    const c = configs[i];
    const seed = baseSeed + 1600 + i;
    const isMcq = i < 8;
    const scenarioSpec: Record<string, unknown> = {
      kind: "rc-ln-linearization",
      initialVoltageV: c.v0,
      resistanceKohm: c.rK,
      capacitanceUf: c.cUf,
      tEndS: c.tEnd,
    };
    const q = solvePlugin("rc-ln-linearization", scenarioSpec);
    const tau = numQty(q, "timeConstantS");
    const grad = numQty(q, "gradientPerS");
    const y0 = numQty(q, "yInterceptLnV");
    const yEnd = numQty(q, "lnVAtEnd");
    const linReason = strQty(q, "linearizationReason");
    const relReason = strQty(q, "reliabilityReason");

    const y0Str = y0.toFixed(3);
    const yEndStr = yEnd.toFixed(3);

    if (isMcq) {
      const askV0 = i % 3 === 2;
      const targetKey = askV0 ? "initialVoltageV" : "capacitanceUf";
      const targetVal = askV0 ? c.v0 : c.cUf;
      const unit = askV0 ? "V" : "μF";

      const stem = askV0
        ? `A capacitor in ${withArticle(c.ctx)} discharges through a ${c.rK} kΩ resistor. The linear plot of ln(V / V) against time t has a vertical intercept of ${y0Str} and passes through (${c.tEnd} s, ${yEndStr}). What is the initial potential difference V₀ across the capacitor at t = 0?`
        : `A capacitor in ${withArticle(c.ctx)} discharges through a resistor R = ${c.rK} kΩ. The straight-line graph of ln(V / V) against t passes through (0 s, ${y0Str}) and (${c.tEnd} s, ${yEndStr}). What is the capacitance of the capacitor?`;

      const distractors: NumericDistractor[] = askV0
        ? [
            { value: y0, rationale: "Read the vertical intercept ln(V₀) directly as V₀ without taking the exponential e^c." },
            { value: 10 ** y0, rationale: "Used base-10 antilogarithm (10^c) instead of natural exponential (e^c)." },
            { value: c.v0 / Math.E, rationale: "Divided by e instead of evaluating V₀ = e^(intercept)." },
          ]
        : [
            { value: (Math.abs(grad) / (c.rK * 1e3)) * 1e6, rationale: "Used the gradient magnitude directly as τ instead of τ = −1 / gradient." },
            { value: c.cUf * 1e-3, rationale: "Forgot to convert kΩ to Ω when computing C = τ / R." },
            { value: c.cUf * Math.LN2, rationale: "Included an unnecessary ln(2) factor when extracting the time constant from ln(V) vs t." },
          ];

      const options = buildNumericMcqOptions({
        correctValue: targetVal,
        unit,
        distractors,
        seed,
      });

      const ansStr = formatNcukQuantity(targetVal, unit, 3);
      const workedSolution = askV0
        ? `Since ln(V) = −t/τ + ln(V₀), the vertical intercept is ln(V₀) = ${y0Str}. Taking the exponential gives V₀ = e^(${y0Str}) = ${formatNcukQuantity(c.v0, "V", 4)} ≈ ${ansStr}.`
        : `Gradient m = (${yEndStr} − ${y0Str}) / (${c.tEnd} − 0) = ${formatNcukQuantity(grad, "s⁻¹", 4)}. Time constant τ = −1/m = ${formatNcukQuantity(tau, "s", 4)}. Capacitance C = τ / R = ${formatNcukQuantity(tau, "s", 4)} / (${c.rK} × 10³ Ω) = ${ansStr}.`;

      items.push({
        id: `${NCUK_AC4_ID_PREFIX}-rcln-${String(i + 1).padStart(2, "0")}`,
        conceptId: "capacitor-rc-decay",
        templateArchetype: "ncuk-rc-ln-linearization-graph",
        seed,
        syllabi: syllabiForSubtopic("ncuk-ac4-4"),
        format: "mcq",
        difficulty: difficultyForIndex(i),
        domain: "graphs",
        scenarioSpec,
        hiddenQuantities: [
          "timeConstantS",
          "capacitanceUf",
          "capacitanceF",
          "gradientPerS",
          ...(askV0 ? ["initialVoltageV"] : []),
        ],
        requiredGivens: [
          { name: "resistanceKohm", value: c.rK, unit: "kΩ", source: "stem" },
          { name: "tEndS", value: c.tEnd, unit: "s", source: "either" },
        ],
        stem,
        options,
        targetMode: "quantitative",
        targetQuantityKey: targetKey,
        workedSolution,
        markScheme: [
          {
            code: "A1",
            criterion: `Extracts linearized graph parameters accurately to obtain ${ansStr}.`,
            marks: 1,
          },
        ],
        totalMarks: 1,
        generatorModel,
      });
    } else {
      // 6-mark structured: (a) 2m algebraic linearization (qual), (b) 2m tau from gradient, (c) 1m C = tau/R, (d) 1m reliability vs tangent (qual)
      const tau3 = formatNcukQuantity(tau, "s", 3);
      const tau4 = formatNcukQuantity(tau, "s", 4);
      const c3 = formatNcukQuantity(c.cUf, "μF", 3);
      const stem = `A charged capacitor in ${withArticle(c.ctx)} discharges through a fixed ${c.rK} kΩ resistor. The linear plot of ln(V / V) against time t passes through the vertical intercept (0 s, ${y0Str}) and the endpoint (${c.tEnd} s, ${yEndStr}).`;

      const parts: StructuredQuestionPart[] = [
        {
          partId: "a",
          prompt:
            "Explain why plotting the natural logarithm of potential difference against time yields a straight line, identifying the physical meaning of its gradient and vertical intercept.",
          marks: 2,
          targetMode: "qualitative",
          targetQuantityKey: "linearizationReason",
          expectedAnswer: `From the exponential discharge equation, ${linReason}.`,
          workingSteps: [
            "Take natural logarithms of both sides of the exponential decay equation.",
            "Compare with a linear equation to identify the negative gradient and the vertical intercept.",
          ],
        },
        {
          partId: "b",
          prompt: "Determine the time constant τ of the RC circuit from the gradient of the graph.",
          marks: 2,
          targetMode: "quantitative",
          targetQuantityKey: "timeConstantS",
          expectedAnswer: tau3,
          workingSteps: [
            `Gradient m = Δ(ln V) / Δt = (${yEndStr} − ${y0Str}) / (${c.tEnd} − 0) = ${formatNcukQuantity(grad, "s⁻¹", 4)}.`,
            `Time constant τ = −1 / m = ${tau4} ≈ ${tau3}.`,
          ],
        },
        {
          partId: "c",
          prompt: `Calculate the capacitance of the capacitor in μF given R = ${c.rK} kΩ.`,
          marks: 1,
          dependsOnPartIds: ["b"],
          targetMode: "quantitative",
          targetQuantityKey: "capacitanceUf",
          expectedAnswer: c3,
          workingSteps: [
            `C = τ / R = ${tau4} / (${c.rK} × 10³ Ω) = ${formatNcukQuantity(c.cUf * 1e-6, "F", 4)} = ${c3}.`,
          ],
        },
        {
          partId: "d",
          prompt:
            "State why determining τ from the gradient of a ln(V) against t graph is more reliable than drawing an initial tangent to a V against t curve.",
          marks: 1,
          targetMode: "qualitative",
          targetQuantityKey: "reliabilityReason",
          expectedAnswer: `The logarithmic gradient method is more reliable because it ${relReason}.`,
          workingSteps: [
            "Drawing a tangent to a curve by eye is subjective and sensitive to noise at a single point, whereas a linear best-fit averages random errors over all readings.",
          ],
        },
      ];

      const markScheme: MarkSchemePoint[] = [
        {
          code: "B1",
          partId: "a",
          criterion: "Shows taking natural logs produces a linear relation between ln(V) and t.",
          marks: 1,
        },
        {
          code: "B1",
          partId: "a",
          criterion: "Identifies gradient = −1/τ and vertical intercept = ln(V₀).",
          marks: 1,
        },
        {
          code: "M1",
          partId: "b",
          criterion: `Evaluates negative gradient m = ${formatNcukQuantity(grad, "s⁻¹", 3)} and uses τ = −1/m.`,
          marks: 1,
        },
        {
          code: "A1",
          partId: "b",
          criterion: `Correct time constant τ = ${tau3}.`,
          marks: 1,
        },
        {
          code: "A1",
          partId: "c",
          criterion: `Correct capacitance C = τ / R = ${c3}.`,
          marks: 1,
        },
        {
          code: "B1",
          partId: "d",
          criterion: `States that it ${relReason}.`,
          marks: 1,
        },
      ];

      items.push({
        id: `${NCUK_AC4_ID_PREFIX}-rcln-${String(i + 1).padStart(2, "0")}`,
        conceptId: "capacitor-rc-decay",
        templateArchetype: "ncuk-rc-ln-linearization-graph",
        seed,
        syllabi: syllabiForSubtopic("ncuk-ac4-4"),
        format: "structured",
        difficulty: difficultyForIndex(i),
        domain: "graphs",
        scenarioSpec,
        hiddenQuantities: [
          "timeConstantS",
          "capacitanceUf",
          "capacitanceF",
          "gradientPerS",
          "linearizationReason",
          "reliabilityReason",
        ],
        requiredGivens: [
          { name: "resistanceKohm", value: c.rK, unit: "kΩ", source: "stem" },
          { name: "tEndS", value: c.tEnd, unit: "s", source: "either" },
        ],
        stem,
        parts,
        workedSolution: `(a) ${linReason}. (b) Gradient m = ${formatNcukQuantity(grad, "s⁻¹", 4)}, so τ = −1/m = ${tau4} ≈ ${tau3}. (c) C = τ/R = ${c3}. (d) ${relReason}.`,
        markScheme,
        totalMarks: 6,
        generatorModel,
      });
    }
  }
  return items;
}

/* -------------------------------------------------------------------------- */
/*  17. AC4.4 :: 10-Mark Flagship Multi-Stage Switched RC Discharge (14 items)*/
/* -------------------------------------------------------------------------- */

function buildSwitchedRc10mItems(
  baseSeed: number,
  generatorModel: string,
): CandidateQuestionInput[] {
  const configs: ReadonlyArray<{
    v0: number;
    cUf: number;
    r1K: number;
    r2K: number;
    t1: number;
    t2: number;
    dir: "smaller" | "larger";
    ctx: string;
  }> = [
    { v0: 12.0, cUf: 400, r1K: 30, r2K: 15, t1: 8.0, t2: 4.0, dir: "smaller", ctx: "laboratory timer discharge board" },
    { v0: 9.0, cUf: 250, r1K: 60, r2K: 30, t1: 10.0, t2: 6.0, dir: "larger", ctx: "two-stage pulse-shaping circuit" },
    { v0: 15.0, cUf: 500, r1K: 40, r2K: 40, t1: 14.0, t2: 8.0, dir: "smaller", ctx: "industrial bleed-down controller" },
    { v0: 10.0, cUf: 300, r1K: 60, r2K: 20, t1: 12.0, t2: 5.0, dir: "larger", ctx: "camera strobe decay module" },
    { v0: 8.0, cUf: 200, r1K: 90, r2K: 45, t1: 12.0, t2: 6.0, dir: "smaller", ctx: "student switched RC bench rig" },
    { v0: 14.0, cUf: 600, r1K: 30, r2K: 15, t1: 12.0, t2: 5.0, dir: "larger", ctx: "dual-rate relay delay circuit" },
    { v0: 12.0, cUf: 350, r1K: 40, r2K: 40, t1: 9.0, t2: 6.0, dir: "smaller", ctx: "emergency-lighting fade circuit" },
    { v0: 6.0, cUf: 500, r1K: 60, r2K: 30, t1: 18.0, t2: 9.0, dir: "larger", ctx: "slow-fast capacitor test unit" },
    { v0: 11.0, cUf: 220, r1K: 60, r2K: 20, t1: 9.0, t2: 4.0, dir: "smaller", ctx: "electronic shutter decay bank" },
    { v0: 13.5, cUf: 450, r1K: 30, r2K: 15, t1: 10.0, t2: 4.5, dir: "larger", ctx: "two-branch RC discharge network" },
    { v0: 9.6, cUf: 680, r1K: 30, r2K: 15, t1: 15.0, t2: 6.0, dir: "smaller", ctx: "reservoir safety discharge rig" },
    { v0: 15.0, cUf: 330, r1K: 90, r2K: 45, t1: 20.0, t2: 8.0, dir: "larger", ctx: "high-capacitance timing circuit" },
    { v0: 7.5, cUf: 400, r1K: 40, r2K: 40, t1: 10.0, t2: 7.0, dir: "smaller", ctx: "switched RC demonstration panel" },
    { v0: 10.5, cUf: 250, r1K: 60, r2K: 20, t1: 11.0, t2: 4.5, dir: "larger", ctx: "precision dual-stage RC module" },
  ];

  const items: CandidateQuestionInput[] = [];
  for (let i = 0; i < configs.length; i += 1) {
    const c = configs[i];
    const seed = baseSeed + 1700 + i;
    const scenarioSpec: Record<string, unknown> = {
      kind: "switched-rc-multistage",
      supplyVoltageV: c.v0,
      capacitanceUf: c.cUf,
      r1Kohm: c.r1K,
      r2Kohm: c.r2K,
      stage1TimeS: c.t1,
      stage2TimeS: c.t2,
      qualitativeDirection: c.dir,
    };
    const q = solvePlugin("switched-rc-multistage", scenarioSpec);
    const tau1 = numQty(q, "tau1S");
    const v1 = numQty(q, "v1V");
    const rParK = numQty(q, "rParallelKohm");
    const tau2 = numQty(q, "tau2S");
    const v2 = numQty(q, "v2V");
    const faradDef = strQty(q, "faradDefinition");
    const qualEff = strQty(q, "qualitativeEffect");

    const v1RoundedPrompt = formatNcukQuantity(v1, "V", 2);
    const v1Str3 = formatNcukQuantity(v1, "V", 3);
    const v1Str4 = formatNcukQuantity(v1, "V", 4);
    const tau1Str4 = formatNcukQuantity(tau1, "s", 4);
    const rParStr3 = formatNcukQuantity(rParK, "kΩ", 3);
    const tau2Str3 = formatNcukQuantity(tau2, "s", 3);
    const tau2Str4 = formatNcukQuantity(tau2, "s", 4);
    const v2Str3 = formatNcukQuantity(v2, "V", 3);
    const v2Str4 = formatNcukQuantity(v2, "V", 4);

    // CRITICAL: NEVER put rounded target v1RoundedPrompt in stem (stem-answer-leak); put it ONLY in part b-i prompt!
    const stem = `In the ${c.ctx} shown, a capacitor of capacitance C = ${c.cUf} μF is first fully charged to V₀ = ${formatNcukQuantity(c.v0, "V", 3)} by closing Switch A while Switches B and C remain open. Switch A is then opened and Switch B is closed so the capacitor discharges through R₁ = ${c.r1K} kΩ for ${formatNcukQuantity(c.t1, "s", 3)}. At t = ${formatNcukQuantity(c.t1, "s", 3)}, while Switch B stays closed, Switch C is closed to connect R₂ = ${c.r2K} kΩ in parallel with R₁ for a further ${formatNcukQuantity(c.t2, "s", 3)}.`;

    const parts: StructuredQuestionPart[] = [
      {
        partId: "a",
        prompt: "Define the farad.",
        marks: 2,
        targetMode: "qualitative",
        targetQuantityKey: "faradDefinition",
        expectedAnswer: `The farad is the ${faradDef}.`,
        workingSteps: [
          "Recall the unit definition linking electric charge in coulombs and potential difference in volts.",
        ],
      },
      {
        partId: "b-i",
        prompt: `Show clearly that after discharging through R₁ alone for ${formatNcukQuantity(c.t1, "s", 3)}, the potential difference across the capacitor is approximately ${v1RoundedPrompt}.`,
        marks: 3,
        targetMode: "quantitative",
        targetQuantityKey: "v1V",
        expectedAnswer: `${v1Str4} (which rounds to ${v1Str3} and ${v1RoundedPrompt})`,
        workingSteps: [
          `Stage 1 time constant τ₁ = R₁ C = (${c.r1K} × 10³ Ω) × (${c.cUf} × 10⁻⁶ F) = ${tau1Str4}.`,
          `Substitute into V₁ = V₀ exp(−t₁ / τ₁) = ${formatNcukQuantity(c.v0, "V", 4)} × exp(−${c.t1} / ${tau1Str4}).`,
          `Evaluate to 4 s.f.: V₁ = ${v1Str4} ≈ ${v1Str3} (confirming approximately ${v1RoundedPrompt}).`,
        ],
      },
      {
        partId: "b-ii",
        prompt:
          "At the instant Switch C closes, calculate the new time constant τ₂ of the discharge circuit.",
        marks: 1,
        targetMode: "quantitative",
        targetQuantityKey: "tau2S",
        expectedAnswer: tau2Str3,
        workingSteps: [
          `Combined parallel resistance R_eq = (R₁ R₂)/(R₁ + R₂) = (${c.r1K} × ${c.r2K}) / (${c.r1K} + ${c.r2K}) = ${rParStr3}.`,
          `New time constant τ₂ = R_eq C = (${rParK} × 10³ Ω) × (${c.cUf} × 10⁻⁶ F) = ${tau2Str4} ≈ ${tau2Str3}.`,
        ],
      },
      {
        partId: "b-iii",
        prompt: `Calculate the potential difference V₂ across the capacitor after a further ${formatNcukQuantity(c.t2, "s", 3)} with both Switch B and Switch C closed.`,
        marks: 2,
        dependsOnPartIds: ["b-i", "b-ii"],
        targetMode: "quantitative",
        targetQuantityKey: "v2V",
        expectedAnswer: v2Str3,
        workingSteps: [
          `Start Stage 2 decay from V₁ = ${v1Str4} with time constant τ₂ = ${tau2Str4}.`,
          `V₂ = V₁ exp(−t₂ / τ₂) = ${v1Str4} × exp(−${c.t2} / ${tau2Str4}) = ${v2Str4} ≈ ${v2Str3}.`,
        ],
      },
      {
        partId: "b-iv",
        prompt: `Without calculation, state and explain how the final potential difference V₂ would change if resistor R₁ were replaced by a ${c.dir} resistor throughout the entire experiment.`,
        marks: 2,
        dependsOnPartIds: ["b-iii"],
        targetMode: "qualitative",
        targetQuantityKey: "qualitativeEffect",
        expectedAnswer: `Replacing the first resistor with a ${c.dir} resistor gives a ${qualEff}.`,
        workingSteps: [
          `A ${c.dir} resistance changes both the initial discharge time constant and the combined parallel resistance in the same direction.`,
          "Link the altered time constants in both stages to the rate of exponential decay and the remaining potential difference.",
        ],
      },
    ];

    const markScheme: MarkSchemePoint[] = [
      {
        code: "B1",
        partId: "a",
        criterion: "Mentions charge stored per unit potential difference (coulombs per volt).",
        marks: 1,
      },
      {
        code: "B1",
        partId: "a",
        criterion: `Complete SI unit definition: ${faradDef}.`,
        marks: 1,
      },
      {
        code: "M1",
        partId: "b-i",
        criterion: `Evaluates stage-1 time constant τ₁ = R₁C = ${formatNcukQuantity(tau1, "s", 3)}.`,
        marks: 1,
      },
      {
        code: "M1",
        partId: "b-i",
        criterion: `Correctly substitutes V₀, t₁, and τ₁ into V₁ = V₀ e^(−t₁/τ₁).`,
        marks: 1,
      },
      {
        code: "A1",
        partId: "b-i",
        criterion: `Shows V₁ = ${v1Str4} (≥3 s.f.: ${v1Str3}), clearly matching ${v1RoundedPrompt}.`,
        marks: 1,
      },
      {
        code: "A1",
        partId: "b-ii",
        criterion: `Combines R₁ || R₂ = ${rParStr3} and calculates τ₂ = R_eq C = ${tau2Str3}.`,
        marks: 1,
      },
      {
        code: "M1",
        partId: "b-iii",
        criterion: "Substitutes V₁ (accepting rounded prompt value on ECF), t₂, and τ₂ into V₂ = V₁ e^(−t₂/τ₂).",
        marks: 1,
      },
      {
        code: "A1",
        partId: "b-iii",
        criterion: `Correct final potential difference V₂ = ${v2Str3}.`,
        marks: 1,
      },
      {
        code: "B1",
        partId: "b-iv",
        criterion: `States correctly that V₂ would be ${c.dir} (smaller/larger matching direction).`,
        marks: 1,
      },
      {
        code: "B1",
        partId: "b-iv",
        criterion: `Explains via time constants in both stages: ${qualEff}.`,
        marks: 1,
      },
    ];

    items.push({
      id: `${NCUK_AC4_ID_PREFIX}-rc10m-${String(i + 1).padStart(2, "0")}`,
      conceptId: "capacitor-rc-decay",
      templateArchetype: "ncuk-switched-rc-multistage-10m",
      seed,
      syllabi: syllabiForSubtopic("ncuk-ac4-4"),
      format: "structured",
      difficulty: i < 5 ? "standard" : "higher",
      domain: "em-induction",
      scenarioSpec,
      hiddenQuantities: [
        "tau1S",
        "v1V",
        "rParallelOhm",
        "rParallelKohm",
        "tau2S",
        "v2V",
        "initialChargeC",
        "initialEnergyJ",
        "faradDefinition",
        "qualitativeEffect",
      ],
      requiredGivens: [
        { name: "supplyVoltageV", value: c.v0, unit: "V", source: "either" },
        { name: "capacitanceUf", value: c.cUf, unit: "μF", source: "either" },
        { name: "r1Kohm", value: c.r1K, unit: "kΩ", source: "either" },
        { name: "r2Kohm", value: c.r2K, unit: "kΩ", source: "either" },
        { name: "stage1TimeS", value: c.t1, unit: "s", source: "stem" },
        { name: "stage2TimeS", value: c.t2, unit: "s", source: "stem" },
      ],
      stem,
      parts,
      workedSolution: `(a) One farad is the ${faradDef}. (b)(i) τ₁ = R₁C = ${tau1Str4}, so V₁ = V₀ e^(−t₁/τ₁) = ${v1Str4} ≈ ${v1Str3} (confirming ${v1RoundedPrompt}). (b)(ii) R_eq = R₁R₂/(R₁+R₂) = ${rParStr3}, giving τ₂ = R_eq C = ${tau2Str4} ≈ ${tau2Str3}. (b)(iii) V₂ = V₁ e^(−t₂/τ₂) = ${v2Str4} ≈ ${v2Str3}. (b)(iv) ${qualEff}.`,
      markScheme,
      totalMarks: 10,
      generatorModel,
    });
  }
  return items;
}

/* -------------------------------------------------------------------------- */
/*  Public entry point                                                        */
/* -------------------------------------------------------------------------- */

export function generateNcukAc4Candidates(
  options: GenerateNcukAc4Options = {},
): CandidateQuestionInput[] {
  const baseSeed = options.baseSeed ?? DEFAULT_NCUK_AC4_BASE_SEED;
  const generatorModel =
    options.generatorModel ?? NCUK_AC4_DEFAULT_GENERATOR_MODEL;

  return [
    ...buildDriftVelocityItems(baseSeed, generatorModel),
    ...buildChargeElectronItems(baseSeed, generatorModel),
    ...buildKirchhoffTwoLoopItems(baseSeed, generatorModel),
    ...buildOpposingCellsItems(baseSeed, generatorModel),
    ...buildParallelCellsItems(baseSeed, generatorModel),
    ...buildComponentIvCurveItems(baseSeed, generatorModel),
    ...buildIvGradientResistivityItems(baseSeed, generatorModel),
    ...buildCuboidResistivityItems(baseSeed, generatorModel),
    ...buildRemeltWireItems(baseSeed, generatorModel),
    ...buildResistorLadderItems(baseSeed, generatorModel),
    ...buildTwoLoadBatteryItems(baseSeed, generatorModel),
    ...buildApplianceRatingItems(baseSeed, generatorModel),
    ...buildInternalResistance10mItems(baseSeed, generatorModel),
    ...buildCapacitorBreakdownItems(baseSeed, generatorModel),
    ...buildCapacitorQvAreaItems(baseSeed, generatorModel),
    ...buildRcLnLinearizationItems(baseSeed, generatorModel),
    ...buildSwitchedRc10mItems(baseSeed, generatorModel),
  ];
}

export type NcukAc4QuestionFormat = QuestionFormat;
