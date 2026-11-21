import {
  ALEVEL_CORE_A2_PLUGINS,
  ALEVEL_G_MS2,
  AlevelCoreA2ScenarioKind,
} from "@/lib/visuals/alevel-core-a2";

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

export const ALEVEL_CORE_A2_DEFAULT_BASE_SEED = 75_000_000;
export const ALEVEL_CORE_A2_ID_PREFIX = "sp-v3-al-a2";
export const ALEVEL_CORE_A2_DEFAULT_MODEL =
  "deterministic-alevel-core-a2-v3/1.0.0";

export interface GenerateAlevelCoreA2Options {
  readonly baseSeed?: number;
  readonly generatorModel?: string;
}

/* -------------------------------------------------------------------------- */
/*  Formatting, Solver Dispatch & Syllabus Helpers                            */
/* -------------------------------------------------------------------------- */

const SUPERSCRIPT_DIGITS: Readonly<Record<string, string>> = {
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

function toSup(exp: number): string {
  return [...String(exp)].map((ch) => SUPERSCRIPT_DIGITS[ch] ?? ch).join("");
}

function fmtSig(value: number, sigFigs: number, unit?: string): string {
  if (Object.is(value, -0) || Math.abs(value) < 1e-35) {
    if (!unit) return "0";
    return unit === "%" || unit === "°" ? `0${unit}` : `0 ${unit}`;
  }
  const sign = value < 0 ? "−" : "";
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
    numStr = `${sign}${mant.toPrecision(sigFigs)} × 10${toSup(exp)}`;
  } else {
    numStr = `${sign}${abs.toPrecision(sigFigs)}`;
  }
  if (!unit) return numStr;
  return unit === "%" || unit === "°" ? `${numStr}${unit}` : `${numStr} ${unit}`;
}

function fmt3(value: number, unit?: string): string {
  return fmtSig(value, 3, unit);
}

function solveKind(
  kind: AlevelCoreA2ScenarioKind,
  spec: Record<string, unknown>,
): Record<string, number | string | boolean> {
  const plugin = ALEVEL_CORE_A2_PLUGINS.find((p) => p.kind === kind);
  if (!plugin) {
    throw new Error(`Plugin "${kind}" missing from ALEVEL_CORE_A2_PLUGINS`);
  }
  return plugin.solve(spec).quantities;
}

function domainForKind(kind: AlevelCoreA2ScenarioKind): PhysicsDomainId {
  const plugin = ALEVEL_CORE_A2_PLUGINS.find((p) => p.kind === kind);
  if (!plugin) {
    throw new Error(`Plugin "${kind}" missing from ALEVEL_CORE_A2_PLUGINS`);
  }
  return plugin.domain;
}

type A2SubtopicKey =
  | "3.6.1"
  | "3.6.2"
  | "3.7.2"
  | "3.7.3"
  | "3.7.4"
  | "3.7.5"
  | "3.8";

const A2_SYLLABUS_MAP: Readonly<
  Record<A2SubtopicKey, { topicId: string; subtopicId: string }>
> = {
  "3.6.1": {
    topicId: "alevel-sec6-further-mechanics-thermal",
    subtopicId: "alevel-3-6-1-periodic-motion-shm",
  },
  "3.6.2": {
    topicId: "alevel-sec6-further-mechanics-thermal",
    subtopicId: "alevel-3-6-2-thermal-physics",
  },
  "3.7.2": {
    topicId: "alevel-sec7-fields-consequences",
    subtopicId: "alevel-3-7-2-gravitational-fields",
  },
  "3.7.3": {
    topicId: "alevel-sec7-fields-consequences",
    subtopicId: "alevel-3-7-3-electric-fields",
  },
  "3.7.4": {
    topicId: "alevel-sec7-fields-consequences",
    subtopicId: "alevel-3-7-4-capacitance",
  },
  "3.7.5": {
    topicId: "alevel-sec7-fields-consequences",
    subtopicId: "alevel-3-7-5-magnetic-fields-induction-ac",
  },
  "3.8": {
    topicId: "alevel-sec8-nuclear-physics",
    subtopicId: "alevel-3-8-nuclear-decay-energy",
  },
};

function alevelTags(
  subtopic: A2SubtopicKey,
  ncukCross?: { topicId: string; subtopicId: string },
  extraAlevel?: A2SubtopicKey,
): SyllabusTag[] {
  const main = A2_SYLLABUS_MAP[subtopic];
  const tags: SyllabusTag[] = [
    {
      syllabus: "alevel",
      level: "Y13",
      topicId: main.topicId,
      subtopicId: main.subtopicId,
    },
  ];
  if (extraAlevel) {
    const ext = A2_SYLLABUS_MAP[extraAlevel];
    tags.push({
      syllabus: "alevel",
      level: "Y13",
      topicId: ext.topicId,
      subtopicId: ext.subtopicId,
    });
  }
  if (ncukCross) {
    tags.push({
      syllabus: "ncuk",
      level: "IFY-S2",
      topicId: ncukCross.topicId,
      subtopicId: ncukCross.subtopicId,
    });
  }
  return tags;
}

interface VerbalDistractor {
  readonly text: string;
  readonly rationale: string;
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

interface NumericDistractor {
  readonly value: number;
  readonly rationale: string;
}

function valuesDistinct3sf(a: number, b: number): boolean {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  const scale = Math.max(Math.abs(a), Math.abs(b), 1e-30);
  if (Math.abs(a - b) / scale < 0.04) return false;
  return a.toPrecision(3) !== b.toPrecision(3);
}

function buildNumericOptions(
  correctValue: number,
  unit: string | undefined,
  distractors: readonly NumericDistractor[],
  seed: number,
): McqOptionItem[] {
  const correctText = fmt3(correctValue, unit);
  const usedKeys = new Set<string>([buildOptionEquivalenceKey(correctText)]);
  const usedVals: number[] = [correctValue];
  const chosen: Array<{ text: string; rationale: string }> = [];

  const fallbacks: NumericDistractor[] = [
    {
      value: correctValue * 0.5,
      rationale: "Applies an erroneous factor of one-half during algebraic rearrangement.",
    },
    {
      value: correctValue * 2.0,
      rationale: "Introduces an extraneous factor of two when rearranging the governing relation.",
    },
    {
      value: correctValue * 1.414,
      rationale: "Applies an inverted root-two scaling factor.",
    },
    {
      value: correctValue * 0.707,
      rationale: "Multiplies instead of dividing by a root-two factor.",
    },
  ];

  for (const cand of [...distractors, ...fallbacks]) {
    if (chosen.length >= 3) break;
    if (!Number.isFinite(cand.value) || Math.abs(cand.value) < 1e-35) continue;
    if (!usedVals.every((v) => valuesDistinct3sf(cand.value, v))) continue;
    const text = fmt3(cand.value, unit);
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

/* ========================================================================== */
/*  BANK 1: 78 PURE QUALITATIVE / CONCEPTUAL MCQs (6 PER PLUGIN × 13)         */
/* ========================================================================== */

interface QualMcqSpec {
  readonly slug: string;
  readonly kind: AlevelCoreA2ScenarioKind;
  readonly subtopic: A2SubtopicKey;
  readonly extraAlevel?: A2SubtopicKey;
  readonly ncukCross?: { topicId: string; subtopicId: string };
  readonly conceptId: string;
  readonly templateArchetype: string;
  readonly difficulty: QuestionDifficulty;
  readonly questionStyle: QuestionStyleTag;
  readonly scenarioSpec: Record<string, unknown>;
  readonly targetQuantityKey: string;
  readonly stem: string;
  readonly correctPrefix?: string;
  readonly correctSuffix?: string;
  readonly distractors: readonly [
    VerbalDistractor,
    VerbalDistractor,
    VerbalDistractor,
  ];
  readonly workedNote: string;
}

const RES_SPEC_A = {
  kind: "al-a2-damping-resonance-curves",
  naturalFreqHz: 5.0,
  staticAmplitudeMm: 8.0,
  zetaLight: 0.12,
  zetaModerate: 0.3,
  zetaHeavy: 0.62,
  showPhaseSubplot: true,
};

const RES_SPEC_B = {
  kind: "al-a2-damping-resonance-curves",
  naturalFreqHz: 8.0,
  staticAmplitudeMm: 10.0,
  zetaLight: 0.1,
  zetaModerate: 0.28,
  zetaHeavy: 0.6,
  showPhaseSubplot: false,
};

const DECAY_SPEC_LIGHT = {
  kind: "al-a2-damped-oscillation-decay",
  initialAmplitudeMm: 60,
  periodS: 1.2,
  amplitudeRatioPerCycle: 0.8,
  cyclesCount: 3,
  regime: "light",
};

const DECAY_SPEC_CRIT = {
  kind: "al-a2-damped-oscillation-decay",
  initialAmplitudeMm: 50,
  periodS: 1.0,
  amplitudeRatioPerCycle: 0.75,
  cyclesCount: 2,
  regime: "critical",
};

const DECAY_SPEC_HEAVY = {
  kind: "al-a2-damped-oscillation-decay",
  initialAmplitudeMm: 40,
  periodS: 0.9,
  amplitudeRatioPerCycle: 0.7,
  cyclesCount: 3,
  regime: "heavy",
};

const CF_SPEC_DEFAULT = {
  kind: "al-a2-continuous-flow-calorimetry",
  inletTempC: 18.0,
  outletTempC: 26.0,
  flowRate1KgPerS: 0.005,
  flowRate2KgPerS: 0.01,
  voltage1V: 12.0,
  current1A: 14.3,
  voltage2V: 16.0,
  current2A: 21.175,
  liquidName: "Water",
};

const KT_SPEC_DEFAULT = {
  kind: "al-a2-kinetic-theory-assumptions-lor",
  cubeSideM: 0.25,
  molarMassKgPerMol: 0.028,
  temperatureK: 300,
  molesN: 1.5,
  singleMoleculeSpeedMs: 480,
  gasLabel: "Nitrogen",
};

const SAT_SPEC_DEFAULT = {
  kind: "al-a2-satellite-orbits-comparison",
  earthMassKg: 5.97e24,
  earthRadiusM: 6.37e6,
  geoPeriodS: 86400,
  leoAltitudeKm: 600,
  satelliteMassKg: 850,
};

const GE_SPEC_POS = {
  kind: "al-a2-grav-vs-electric-fields",
  centralMassKg: 1.673e-27,
  centralChargeC: 1.6e-19,
  testMassKg: 1.673e-27,
  testChargeC: 1.6e-19,
  separationM: 1.0e-10,
  chargePolarity: "positive",
};

const GE_SPEC_NEG = {
  kind: "al-a2-grav-vs-electric-fields",
  centralMassKg: 5.97e24,
  centralChargeC: -4.0e-6,
  testMassKg: 2.0,
  testChargeC: 1.5e-6,
  separationM: 0.4,
  chargePolarity: "negative",
};

const DIEL_SPEC_ISO = {
  kind: "al-a2-capacitor-polar-dielectric",
  plateAreaCm2: 180,
  plateSeparationMm: 1.2,
  relativePermittivity: 4.5,
  initialVoltageV: 18,
  connectionMode: "isolated",
};

const DIEL_SPEC_CONN = {
  kind: "al-a2-capacitor-polar-dielectric",
  plateAreaCm2: 240,
  plateSeparationMm: 0.8,
  relativePermittivity: 3.2,
  initialVoltageV: 12,
  connectionMode: "connected",
};

const LENZ_SPEC_N = {
  kind: "al-a2-lenz-law-energy-conservation",
  coilTurnsN: 400,
  peakFluxWb: 3.2e-4,
  entryDurationMs: 80,
  exitDurationMs: 50,
  coilResistanceOhm: 12,
  leadingPole: "N",
};

const LENZ_SPEC_S = {
  kind: "al-a2-lenz-law-energy-conservation",
  coilTurnsN: 600,
  peakFluxWb: 2.5e-4,
  entryDurationMs: 70,
  exitDurationMs: 45,
  coilResistanceOhm: 10,
  leadingPole: "S",
};

const TRANS_SPEC_DEFAULT = {
  kind: "al-a2-transformer-losses-design",
  primaryTurns: 500,
  secondaryTurns: 2500,
  primaryVoltageV: 230,
  secondaryCurrentA: 4.0,
  efficiencyPct: 92,
  lineResistanceOhm: 8.0,
  gridPowerW: 4.6e6,
};

const CRO_SPEC_SIN = {
  kind: "al-a2-oscilloscope-ac-rms",
  yGainVPerDiv: 2.0,
  timeBaseMsPerDiv: 5.0,
  peakToPeakDivs: 6.0,
  periodDivs: 4.0,
  loadResistanceOhm: 25,
  displayMode: "ac-sinusoid",
};

const CRO_SPEC_OFF = {
  kind: "al-a2-oscilloscope-ac-rms",
  yGainVPerDiv: 5.0,
  timeBaseMsPerDiv: 2.0,
  peakToPeakDivs: 4.0,
  periodDivs: 5.0,
  loadResistanceOhm: 40,
  displayMode: "timebase-off",
};

const EDIFF_SPEC_DEFAULT = {
  kind: "al-a2-electron-diffraction-vs-rutherford",
  electronEnergyMeV: 420,
  massNumberA: 16,
  r0Fm: 1.05,
  alphaEnergyMeV: 6.0,
  targetAtomicNumberZ: 79,
};

const NZ_SPEC_FISS = {
  kind: "al-a2-nz-nuclear-stability-curve",
  parentZ: 56,
  parentN: 88,
  decayChannel: "fission-fragment",
};

const NZ_SPEC_ALPHA = {
  kind: "al-a2-nz-nuclear-stability-curve",
  parentZ: 92,
  parentN: 146,
  decayChannel: "alpha",
};

const NZ_SPEC_BMINUS = {
  kind: "al-a2-nz-nuclear-stability-curve",
  parentZ: 27,
  parentN: 33,
  decayChannel: "beta-minus",
};

const NZ_SPEC_BPLUS = {
  kind: "al-a2-nz-nuclear-stability-curve",
  parentZ: 11,
  parentN: 11,
  decayChannel: "beta-plus",
};

const REACTOR_SPEC_GRAPHITE = {
  kind: "al-a2-thermal-nuclear-reactor-lor",
  thermalPowerMW: 1800,
  efficiencyPct: 34,
  energyPerFissionMeV: 200,
  moderatorMaterial: "graphite",
  moderatorNucleonA: 12,
  focusArea: "full-safety",
};

const REACTOR_SPEC_WATER = {
  kind: "al-a2-thermal-nuclear-reactor-lor",
  thermalPowerMW: 2400,
  efficiencyPct: 36,
  energyPerFissionMeV: 205,
  moderatorMaterial: "pressurised-water",
  moderatorNucleonA: 1,
  focusArea: "waste-management",
};

const QUAL_MCQ_SPECS: readonly QualMcqSpec[] = [
  // ---- 1. al-a2-damping-resonance-curves (6 qual MCQs, 3.6.1) ----
  {
    slug: "res-damping-shift-1",
    kind: "al-a2-damping-resonance-curves",
    subtopic: "3.6.1",
    ncukCross: { topicId: "ncuk-ac6", subtopicId: "ncuk-ac6-1" },
    conceptId: "forced-oscillations-resonance",
    templateArchetype: "al-a2-damping-resonance-curves",
    difficulty: "standard",
    questionStyle: "qualitative",
    scenarioSpec: RES_SPEC_B,
    targetQuantityKey: "dampingEffectAnchor",
    stem: "A mechanical oscillator is driven sinusoidally across a range of frequencies. How does the amplitude-frequency response curve change when the degree of damping is increased from light to heavy?",
    correctPrefix: "The ",
    distractors: [
      {
        text: "The peak amplitude decreases, the resonance peak narrows, and the peak frequency shifts slightly above the natural frequency.",
        rationale: "Reverses both peak broadening and the leftward shift of the damped resonant frequency.",
      },
      {
        text: "The peak amplitude decreases only near resonance while the peak frequency stays fixed at the natural frequency for all damping levels.",
        rationale: "Overlooks that damping lowers amplitude at all non-zero frequencies and shifts the peak slightly below f₀.",
      },
      {
        text: "The peak amplitude increases slightly at low frequencies while the resonance peak shifts above the natural frequency.",
        rationale: "Confuses increased energy dissipation with constructive amplification.",
      },
    ],
    workedNote:
      "Greater damping removes more energy per cycle, so peak amplitude decreases, the resonance peak broadens, and the peak frequency shifts slightly below the natural frequency.",
  },
  {
    slug: "res-condition-def-2",
    kind: "al-a2-damping-resonance-curves",
    subtopic: "3.6.1",
    ncukCross: { topicId: "ncuk-ac6", subtopicId: "ncuk-ac6-1" },
    conceptId: "forced-oscillations-resonance",
    templateArchetype: "al-a2-damping-resonance-curves",
    difficulty: "foundation",
    questionStyle: "definition",
    scenarioSpec: RES_SPEC_B,
    targetQuantityKey: "resonanceConditionAnchor",
    stem: "Which statement accurately defines mechanical resonance for a lightly damped forced oscillator?",
    correctPrefix: "Resonance occurs when the ",
    distractors: [
      {
        text: "Resonance occurs when the driving force amplitude equals the weight of the oscillator regardless of frequency.",
        rationale: "Confuses force magnitude matching with frequency matching.",
      },
      {
        text: "Resonance occurs when the driving frequency is twice the natural frequency so the oscillator never loses energy.",
        rationale: "Misidentifies the fundamental resonance condition and implies zero dissipation.",
      },
      {
        text: "Resonance occurs when damping is increased until the oscillator stops moving across all driving frequencies.",
        rationale: "Confuses overdamping with resonance.",
      },
    ],
    workedNote:
      "At resonance the driving frequency equals the natural frequency giving maximum amplitude and maximum rate of energy transfer from driver to oscillator.",
  },
  {
    slug: "res-phase-at-f0-3",
    kind: "al-a2-damping-resonance-curves",
    subtopic: "3.6.1",
    ncukCross: { topicId: "ncuk-ac6", subtopicId: "ncuk-ac6-1" },
    conceptId: "forced-oscillations-resonance",
    templateArchetype: "al-a2-damping-resonance-curves",
    difficulty: "standard",
    questionStyle: "qualitative",
    scenarioSpec: RES_SPEC_A,
    targetQuantityKey: "phaseAtResonance",
    stem: "A lightly damped mass-spring system is driven at its natural frequency f₀. What is the phase relationship between the displacement of the oscillator and the periodic driving force?",
    correctPrefix: "The oscillator displacement lags the driving force by ",
    correctSuffix: " (one quarter of a cycle).",
    distractors: [
      {
        text: "The oscillator displacement is completely in phase with the driving force (zero phase lag).",
        rationale: "Assumes maximum amplitude occurs when displacement and force peak together rather than velocity and force.",
      },
      {
        text: "The oscillator displacement is in antiphase with the driving force, lagging by half a cycle.",
        rationale: "Applies the high-frequency asymptotic phase lag instead of the resonance value.",
      },
      {
        text: "The oscillator displacement leads the driving force by a quarter of a cycle.",
        rationale: "Reverses the causal sign of phase lag behind the driver.",
      },
    ],
    workedNote:
      "At f = f₀, the driving force acts in phase with oscillator velocity to maximise power input, so displacement lags the driving force by pi/2 rad.",
  },
  {
    slug: "res-phase-low-freq-4",
    kind: "al-a2-damping-resonance-curves",
    subtopic: "3.6.1",
    ncukCross: { topicId: "ncuk-ac6", subtopicId: "ncuk-ac6-1" },
    conceptId: "forced-oscillations-resonance",
    templateArchetype: "al-a2-damping-resonance-curves",
    difficulty: "standard",
    questionStyle: "qualitative",
    scenarioSpec: RES_SPEC_A,
    targetQuantityKey: "phaseLowFreqAnchor",
    stem: "A bridge deck model is vibrated by a motor operating at a driving frequency far below the model's natural frequency. How does the bridge displacement behave relative to the driver?",
    correctPrefix: "It oscillates almost ",
    distractors: [
      {
        text: "It oscillates almost in antiphase with the driving force at frequencies well below the natural frequency.",
        rationale: "Swaps the low-frequency and high-frequency phase regimes.",
      },
      {
        text: "It lags the driving force by a quarter cycle at all frequencies below the natural frequency.",
        rationale: "Incorrectly treats the resonance phase lag as constant throughout the sub-resonant range.",
      },
      {
        text: "It oscillates only at its natural frequency while ignoring the slow driver completely.",
        rationale: "Confuses transient free oscillation with steady-state forced oscillation.",
      },
    ],
    workedNote:
      "At very slow driving speeds inertia is negligible, so the oscillator follows the driver in phase with the driving force at frequencies well below the natural frequency.",
  },
  {
    slug: "res-phase-high-freq-5",
    kind: "al-a2-damping-resonance-curves",
    subtopic: "3.6.1",
    ncukCross: { topicId: "ncuk-ac6", subtopicId: "ncuk-ac6-1" },
    conceptId: "forced-oscillations-resonance",
    templateArchetype: "al-a2-damping-resonance-curves",
    difficulty: "higher",
    questionStyle: "qualitative",
    scenarioSpec: RES_SPEC_A,
    targetQuantityKey: "phaseHighFreqAnchor",
    stem: "When an electromagnetic shaker drives a trolley between two springs at a frequency far higher than its natural frequency, what happens to the phase difference between the trolley and the shaker?",
    correctPrefix: "The trolley moves ",
    distractors: [
      {
        text: "The trolley moves completely in phase with the driving force with steadily rising amplitude.",
        rationale: "Ignores the inertia-dominated phase inversion above resonance.",
      },
      {
        text: "The trolley moves with a fixed quarter-cycle lag at every frequency above the natural frequency.",
        rationale: "Assumes phase stops changing once resonance is crossed.",
      },
      {
        text: "The trolley leads the driving force by half a cycle because spring stiffness exceeds inertia.",
        rationale: "Reverses lead/lag and confuses stiffness-dominated and inertia-dominated limits.",
      },
    ],
    workedNote:
      "Well above f₀, inertia dominates and the oscillator moves in antiphase lagging the driving force by pi rad at high driving frequencies.",
  },
  {
    slug: "res-tuning-bridge-6",
    kind: "al-a2-damping-resonance-curves",
    subtopic: "3.6.1",
    ncukCross: { topicId: "ncuk-ac6", subtopicId: "ncuk-ac6-1" },
    conceptId: "forced-oscillations-resonance",
    templateArchetype: "al-a2-damping-resonance-curves",
    difficulty: "higher",
    questionStyle: "qualitative",
    scenarioSpec: RES_SPEC_B,
    targetQuantityKey: "dampingEffectAnchor",
    stem: "Civil engineers add hydraulic fluid dampers to a pedestrian footbridge that previously swayed strongly under rhythmic footsteps. Which combination describes all three changes to the bridge's resonance curve?",
    correctPrefix: "Across the frequency spectrum, ",
    distractors: [
      {
        text: "Across the frequency spectrum, peak amplitude decreases, the resonance peak becomes sharper, and the peak frequency rises above the natural frequency.",
        rationale: "Incorrectly asserts a sharper peak and upward frequency shift with added damping.",
      },
      {
        text: "Across the frequency spectrum, amplitude increases away from resonance while peak amplitude falls only at the exact natural frequency.",
        rationale: "Misinterprets curve broadening as an absolute amplitude increase off resonance.",
      },
      {
        text: "Across the frequency spectrum, the resonance curve shifts horizontally to higher frequencies with unchanged peak height.",
        rationale: "Confuses stiffening the structure with adding energy-dissipating damping.",
      },
    ],
    workedNote:
      "Adding viscous dampers dissipates mechanical energy each cycle, so peak amplitude decreases, the resonance peak broadens, and the peak frequency shifts slightly below the natural frequency.",
  },

  // ---- 2. al-a2-damped-oscillation-decay (6 qual MCQs, 3.6.1) ----
  {
    slug: "decay-light-regime-1",
    kind: "al-a2-damped-oscillation-decay",
    subtopic: "3.6.1",
    ncukCross: { topicId: "ncuk-ac6", subtopicId: "ncuk-ac6-1" },
    conceptId: "forced-oscillations-resonance",
    templateArchetype: "al-a2-damped-oscillation-decay",
    difficulty: "foundation",
    questionStyle: "qualitative",
    scenarioSpec: DECAY_SPEC_LIGHT,
    targetQuantityKey: "regimeClassification",
    stem: "A metal bob suspended from a helical spring oscillates freely in air, with successive peak amplitudes decreasing by a constant fraction each cycle. How is this motion best described?",
    correctPrefix: "Light damping produces an ",
    distractors: [
      {
        text: "Light damping produces a linear decrease in amplitude to zero while the period halves every cycle.",
        rationale: "Confuses exponential decay with linear decay and wrongly assumes period halves.",
      },
      {
        text: "Light damping produces an immediate return to equilibrium without crossing the centre line.",
        rationale: "Describes critical or heavy damping rather than light damping.",
      },
      {
        text: "Light damping produces constant amplitude with steadily decreasing frequency until motion stops.",
        rationale: "Reverses what decays in light viscous damping.",
      },
    ],
    workedNote:
      "Light damping causes an exponentially decaying oscillation with approximately constant period.",
  },
  {
    slug: "decay-critical-def-2",
    kind: "al-a2-damped-oscillation-decay",
    subtopic: "3.6.1",
    ncukCross: { topicId: "ncuk-ac6", subtopicId: "ncuk-ac6-1" },
    conceptId: "forced-oscillations-resonance",
    templateArchetype: "al-a2-damped-oscillation-decay",
    difficulty: "standard",
    questionStyle: "definition",
    scenarioSpec: DECAY_SPEC_CRIT,
    targetQuantityKey: "regimeClassification",
    stem: "In the displacement-time graph of free damped systems, what uniquely distinguishes critical damping from both light damping and heavy damping?",
    correctPrefix: "A critically damped oscillator ",
    distractors: [
      {
        text: "A critically damped oscillator completes exactly one full overshoot cycle before stopping.",
        rationale: "Mistakenly allows one overshoot cycle in critical damping.",
      },
      {
        text: "A critically damped oscillator takes the longest possible time to return without oscillating.",
        rationale: "Confuses heavy overdamping with critical damping.",
      },
      {
        text: "A critically damped oscillator maintains constant amplitude while oscillating at its natural frequency.",
        rationale: "Describes an undamped free oscillator.",
      },
    ],
    workedNote:
      "By definition, a critically damped oscillator returns to equilibrium in the shortest possible time without oscillating.",
  },
  {
    slug: "decay-heavy-regime-3",
    kind: "al-a2-damped-oscillation-decay",
    subtopic: "3.6.1",
    ncukCross: { topicId: "ncuk-ac6", subtopicId: "ncuk-ac6-1" },
    conceptId: "forced-oscillations-resonance",
    templateArchetype: "al-a2-damped-oscillation-decay",
    difficulty: "standard",
    questionStyle: "qualitative",
    scenarioSpec: DECAY_SPEC_HEAVY,
    targetQuantityKey: "regimeClassification",
    stem: "A weighted spring is fully immersed in thick viscous syrup, pulled downwards, and released from rest. Which motion best represents heavy overdamping?",
    correctPrefix: "The mass undergoes a ",
    distractors: [
      {
        text: "The mass undergoes rapid oscillations of rapidly growing period until coming to rest.",
        rationale: "Assumes heavy damping still crosses equilibrium multiple times.",
      },
      {
        text: "The mass reaches equilibrium faster than any critically damped oscillator.",
        rationale: "Incorrectly assumes stronger drag always reduces return time.",
      },
      {
        text: "The mass remains permanently stationary at its release displacement because drag cancels spring tension.",
        rationale: "Confuses static friction with velocity-dependent viscous drag (which is zero at zero speed).",
      },
    ],
    workedNote:
      "In viscous syrup, heavy damping produces a slow asymptotic creep back to equilibrium without oscillating.",
  },
  {
    slug: "decay-car-suspension-4",
    kind: "al-a2-damped-oscillation-decay",
    subtopic: "3.6.1",
    ncukCross: { topicId: "ncuk-ac6", subtopicId: "ncuk-ac6-1" },
    conceptId: "forced-oscillations-resonance",
    templateArchetype: "al-a2-damped-oscillation-decay",
    difficulty: "standard",
    questionStyle: "qualitative",
    scenarioSpec: DECAY_SPEC_CRIT,
    targetQuantityKey: "suspensionBridgeAnchor",
    stem: "Why do vehicle suspension shock absorbers aim for approximately critical damping rather than heavy overdamping after hitting a road bump?",
    correctPrefix: "Because ",
    distractors: [
      {
        text: "Because heavy damping causes the car body to bounce repeatedly for many cycles after each bump.",
        rationale: "Confuses underdamping/light damping with heavy damping.",
      },
      {
        text: "Because critical damping eliminates all thermal dissipation in the shock absorber fluid.",
        rationale: "Forgets that critical damping still dissipates mechanical energy as heat.",
      },
      {
        text: "Because heavy damping lowers the car's natural frequency to zero so the tyres lift off the road immediately.",
        rationale: "Misstates the mechanism; heavy damping simply leaves the suspension slow to recover.",
      },
    ],
    workedNote:
      "After a bump, critical damping returns system to equilibrium in the shortest possible time without oscillating while heavy damping returns more slowly.",
  },
  {
    slug: "decay-energy-transfer-5",
    kind: "al-a2-damped-oscillation-decay",
    subtopic: "3.6.1",
    ncukCross: { topicId: "ncuk-ac6", subtopicId: "ncuk-ac6-1" },
    conceptId: "forced-oscillations-resonance",
    templateArchetype: "al-a2-damped-oscillation-decay",
    difficulty: "foundation",
    questionStyle: "qualitative",
    scenarioSpec: DECAY_SPEC_LIGHT,
    targetQuantityKey: "energyDissipationAnchor",
    stem: "What energy transformation explains why the peak displacement of a freely swinging pendulum in air gradually decreases over time?",
    correctPrefix: "A ",
    distractors: [
      {
        text: "A restoring gravitational force gradually destroys mechanical energy as the amplitude shrinks.",
        rationale: "Violates conservation of energy; gravity is conservative and does not dissipate energy.",
      },
      {
        text: "A centrifugal force converts kinetic energy into elastic potential energy in the string each half-cycle.",
        rationale: "Invokes a fictitious force and ignores air resistance dissipation.",
      },
      {
        text: "A constant frictional force converts mechanical energy into gravitational potential energy stored in the air.",
        rationale: "Misidentifies the final energy store as gravitational potential energy rather than thermal energy.",
      },
    ],
    workedNote:
      "Air drag acts opposite to velocity: a resistive damping force continuously transfers mechanical energy of the oscillator into thermal energy in the surroundings.",
  },
  {
    slug: "decay-meter-needle-6",
    kind: "al-a2-damped-oscillation-decay",
    subtopic: "3.6.1",
    ncukCross: { topicId: "ncuk-ac6", subtopicId: "ncuk-ac6-1" },
    conceptId: "forced-oscillations-resonance",
    templateArchetype: "al-a2-damped-oscillation-decay",
    difficulty: "higher",
    questionStyle: "qualitative",
    scenarioSpec: DECAY_SPEC_CRIT,
    targetQuantityKey: "suspensionBridgeAnchor",
    stem: "An analogue moving-coil galvanometer uses electromagnetic eddy-current damping on an aluminium former. Why is critical damping preferred over heavy damping for taking rapid scale readings?",
    correctPrefix: "For rapid reading, ",
    distractors: [
      {
        text: "For rapid reading, heavy damping causes persistent sinusoidal swinging about the true current value.",
        rationale: "Attributes underdamped oscillation to heavy damping.",
      },
      {
        text: "For rapid reading, critical damping amplifies the steady-state deflection angle of the pointer.",
        rationale: "Confuses damping with galvanometer sensitivity.",
      },
      {
        text: "For rapid reading, heavy damping permanently locks the coil away from its equilibrium deflection.",
        rationale: "Confuses viscous/eddy-current damping (which vanishes at zero angular speed) with static sticking.",
      },
    ],
    workedNote:
      "Critical damping returns system to equilibrium in the shortest possible time without oscillating while heavy damping returns more slowly, delaying readings.",
  },

  // ---- 3. al-a2-continuous-flow-calorimetry (6 qual MCQs, 3.6.2) ----
  {
    slug: "cf-eliminate-h-1",
    kind: "al-a2-continuous-flow-calorimetry",
    subtopic: "3.6.2",
    conceptId: "specific-heat-latent-heat",
    templateArchetype: "al-a2-continuous-flow-calorimetry",
    difficulty: "standard",
    questionStyle: "experimental",
    scenarioSpec: CF_SPEC_DEFAULT,
    targetQuantityKey: "eliminationAnchor",
    stem: "In a continuous-flow electrical calorimeter experiment to measure the specific heat capacity of a liquid, two different flow rates are tested. Why must the inlet and outlet temperatures be kept identical in both runs?",
    correctPrefix: "Maintaining ",
    distractors: [
      {
        text: "Maintaining identical inlet and outlet temperatures ensures zero heat is lost to the surroundings in either run.",
        rationale: "Wrongly claims heat loss H becomes zero rather than remaining constant and cancelling.",
      },
      {
        text: "Maintaining identical inlet and outlet temperatures guarantees the heater current stays constant across both flow rates.",
        rationale: "Power must actually be increased at the higher flow rate to keep Δθ identical.",
      },
      {
        text: "Maintaining identical inlet and outlet temperatures prevents the specific heat capacity of the glass tube from changing.",
        rationale: "In steady state the glass tube temperature is constant anyway and does not absorb net energy.",
      },
    ],
    workedNote:
      "At steady state P = ṁcΔθ + H. Keeping identical inlet and outlet temperatures keep thermal energy loss rate to the surroundings constant so heat loss cancels upon subtraction.",
  },
  {
    slug: "cf-steady-state-2",
    kind: "al-a2-continuous-flow-calorimetry",
    subtopic: "3.6.2",
    conceptId: "specific-heat-latent-heat",
    templateArchetype: "al-a2-continuous-flow-calorimetry",
    difficulty: "foundation",
    questionStyle: "experimental",
    scenarioSpec: CF_SPEC_DEFAULT,
    targetQuantityKey: "steadyStateAnchor",
    stem: "After switching on the immersion heater in a continuous-flow calorimeter, how does the experimenter verify that steady-state conditions have been reached before collecting the outflow liquid?",
    correctPrefix: "Check that the ",
    distractors: [
      {
        text: "Check that the inlet and outlet thermometers read the exact same temperature.",
        rationale: "Zero temperature rise would mean zero heating and an indeterminate specific heat capacity.",
      },
      {
        text: "Check that the outlet temperature increases linearly with time at a steady gradient.",
        rationale: "A steadily rising outlet temperature indicates non-equilibrium heating of the apparatus itself.",
      },
      {
        text: "Check that the mass of liquid in the collector beaker stops increasing.",
        rationale: "Stopping flow violates continuous-flow operation.",
      },
    ],
    workedNote:
      "Only when the outlet temperature remains constant over time indicating thermal equilibrium before recording mass flow rate is zero net energy stored in the apparatus.",
  },
  {
    slug: "cf-glass-heat-capacity-3",
    kind: "al-a2-continuous-flow-calorimetry",
    subtopic: "3.6.2",
    conceptId: "specific-heat-latent-heat",
    templateArchetype: "al-a2-continuous-flow-calorimetry",
    difficulty: "higher",
    questionStyle: "qualitative",
    scenarioSpec: CF_SPEC_DEFAULT,
    targetQuantityKey: "steadyStateAnchor",
    stem: "Why is it unnecessary to know the heat capacity of the glass jacket or heater wire in a properly conducted continuous-flow calorimetry experiment?",
    correctPrefix: "Once the ",
    correctSuffix: ", the apparatus temperature is unchanging so it absorbs no further thermal energy.",
    distractors: [
      {
        text: "Once the liquid starts flowing, glass acts as a perfect thermal insulator with zero specific heat capacity.",
        rationale: "Glass has finite specific heat capacity and conducts heat.",
      },
      {
        text: "Once the heater current doubles, the heat absorbed by the glass becomes negative and cancels out.",
        rationale: "Apparatus thermal capacity never becomes negative.",
      },
      {
        text: "Once the vacuum jacket is evacuated, the heater wire stops transferring energy to the glass entirely.",
        rationale: "Radiation and conduction along supports still occur; steady temperature is what eliminates apparatus heat storage.",
      },
    ],
    workedNote:
      "At steady state the outlet temperature remains constant over time indicating thermal equilibrium before recording mass flow rate, so the apparatus stores zero net energy.",
  },
  {
    slug: "cf-single-run-bias-4",
    kind: "al-a2-continuous-flow-calorimetry",
    subtopic: "3.6.2",
    conceptId: "specific-heat-latent-heat",
    templateArchetype: "al-a2-continuous-flow-calorimetry",
    difficulty: "standard",
    questionStyle: "experimental",
    scenarioSpec: CF_SPEC_DEFAULT,
    targetQuantityKey: "eliminationAnchor",
    stem: "A student attempts to determine the specific heat capacity of oil from a single continuous-flow run using c = V I / (ṁ Δθ) and obtains a value significantly higher than the accepted book value. Why does using two flow rates remove this systematic error?",
    correctPrefix: "Using two flow rates with ",
    distractors: [
      {
        text: "Using two flow rates with different outlet temperatures forces the thermal loss rate H to double proportionally.",
        rationale: "Changing Δθ changes H so it cannot cancel cleanly on subtraction.",
      },
      {
        text: "Using two flow rates eliminates random timing uncertainty completely without affecting systematic heat losses.",
        rationale: "Two flow rates specifically eliminate the systematic heat loss rate H, not random timing error.",
      },
      {
        text: "Using two flow rates causes the liquid to absorb thermal energy from the cooler laboratory air.",
        rationale: "When the liquid is heated above room temperature, heat flows outward to the surroundings.",
      },
    ],
    workedNote:
      "In one run P = ṁcΔθ + H makes V I / (ṁ Δθ) overestimate c; identical inlet and outlet temperatures keep thermal energy loss rate to the surroundings constant so heat loss cancels upon subtraction.",
  },
  {
    slug: "cf-higher-flow-power-5",
    kind: "al-a2-continuous-flow-calorimetry",
    subtopic: "3.6.2",
    conceptId: "specific-heat-latent-heat",
    templateArchetype: "al-a2-continuous-flow-calorimetry",
    difficulty: "standard",
    questionStyle: "qualitative",
    scenarioSpec: CF_SPEC_DEFAULT,
    targetQuantityKey: "eliminationAnchor",
    stem: "During the second trial of a continuous-flow experiment, the liquid mass flow rate is doubled. Why must the electrical heater power be adjusted carefully until the outlet thermometer returns to its exact first-trial reading?",
    correctPrefix: "So that ",
    distractors: [
      {
        text: "So that the electrical power supplied exactly equals double the first-trial power with zero heat loss.",
        rationale: "Because H stays constant rather than doubling, P₂ is slightly less than 2P₁.",
      },
      {
        text: "So that the liquid flows slower through the heating coil and reaches its boiling point.",
        rationale: "Doubling the mass flow rate increases liquid speed and avoids boiling.",
      },
      {
        text: "So that the inlet thermometer temperature increases to match the room air temperature.",
        rationale: "Inlet temperature is controlled by the constant-head reservoir, not the heater.",
      },
    ],
    workedNote:
      "Matching the outlet reading ensures identical inlet and outlet temperatures keep thermal energy loss rate to the surroundings constant so heat loss cancels upon subtraction.",
  },
  {
    slug: "cf-constant-head-6",
    kind: "al-a2-continuous-flow-calorimetry",
    subtopic: "3.6.2",
    conceptId: "specific-heat-latent-heat",
    templateArchetype: "al-a2-continuous-flow-calorimetry",
    difficulty: "foundation",
    questionStyle: "experimental",
    scenarioSpec: CF_SPEC_DEFAULT,
    targetQuantityKey: "steadyStateAnchor",
    stem: "Why does a continuous-flow calorimeter draw liquid from a constant-head reservoir rather than a draining beaker whose liquid level steadily falls?",
    correctPrefix: "A constant pressure head keeps the flow rate steady so that the ",
    distractors: [
      {
        text: "A constant pressure head ensures the liquid enters the heater at zero kelvin.",
        rationale: "Pressure head controls hydrostatic driving pressure, not absolute zero.",
      },
      {
        text: "A constant pressure head prevents the electrical resistance of the heating coil from changing.",
        rationale: "Coil resistance depends on coil temperature, not reservoir height.",
      },
      {
        text: "A constant pressure head forces all heat loss to the surroundings to vanish completely.",
        rationale: "Heat loss H still exists and is removed by subtracting two runs.",
      },
    ],
    workedNote:
      "A steady hydrostatic head keeps ṁ constant so the outlet temperature remains constant over time indicating thermal equilibrium before recording mass flow rate.",
  },

  // ---- 4. al-a2-kinetic-theory-assumptions-lor (6 qual MCQs, 3.6.2) ----
  {
    slug: "kt-isotropy-factor-1",
    kind: "al-a2-kinetic-theory-assumptions-lor",
    subtopic: "3.6.2",
    conceptId: "ideal-gas-kinetic-theory",
    templateArchetype: "al-a2-kinetic-theory-assumptions-lor",
    difficulty: "standard",
    questionStyle: "derivation",
    scenarioSpec: KT_SPEC_DEFAULT,
    targetQuantityKey: "isotropy",
    stem: "In the kinetic theory derivation of pV = (1/3) N m c_rms², what physical justification introduces the factor of one-third?",
    correctPrefix: "Because random motion means ",
    distractors: [
      {
        text: "Because only one-third of the gas molecules inside the cube are moving at any instant while the rest are stationary.",
        rationale: "Classic misconception: all molecules move continuously in three dimensions.",
      },
      {
        text: "Because each molecule loses two-thirds of its kinetic energy during every wall collision.",
        rationale: "Violates the elastic-collision assumption of kinetic theory.",
      },
      {
        text: "Because a cube has six faces and molecules only collide with two opposite walls.",
        rationale: "Confuses the number of wall pairs with statistical velocity isotropy across x, y, and z.",
      },
    ],
    workedNote:
      "Since c² = u² + v² + w² and all three orthogonal directions are equally likely giving one-third of mean square speed, ⟨u²⟩ = (1/3) c_rms².",
  },
  {
    slug: "kt-assumptions-core-2",
    kind: "al-a2-kinetic-theory-assumptions-lor",
    subtopic: "3.6.2",
    conceptId: "ideal-gas-kinetic-theory",
    templateArchetype: "al-a2-kinetic-theory-assumptions-lor",
    difficulty: "foundation",
    questionStyle: "definition",
    scenarioSpec: KT_SPEC_DEFAULT,
    targetQuantityKey: "assumptionsAnchor",
    stem: "Which set of microscopic assumptions underpins the kinetic theory model of an ideal gas?",
    correctPrefix: "Molecules are assumed to have ",
    distractors: [
      {
        text: "Molecules are assumed to move at identical speeds, attract strongly at long range, and occupy half the container volume.",
        rationale: "Contradicts Maxwell-Boltzmann speed distribution, zero attractions, and negligible molecular volume.",
      },
      {
        text: "Molecules are assumed to undergo inelastic collisions with the walls while spending most of their time in contact with other molecules.",
        rationale: "Reverses both elastic collisions and negligible collision duration.",
      },
      {
        text: "Molecules are assumed to have zero mass, move strictly along one axis, and obey gravitational attraction between neighbours.",
        rationale: "Molecules have finite mass m and isotropic 3D motion.",
      },
    ],
    workedNote:
      "Standard A-Level kinetic theory assumes negligible molecular volume compared with container volume, negligible intermolecular forces except during elastic collisions, and negligible collision duration.",
  },
  {
    slug: "kt-brownian-evidence-3",
    kind: "al-a2-kinetic-theory-assumptions-lor",
    subtopic: "3.6.2",
    conceptId: "ideal-gas-kinetic-theory",
    templateArchetype: "al-a2-kinetic-theory-assumptions-lor",
    difficulty: "standard",
    questionStyle: "qualitative",
    scenarioSpec: KT_SPEC_DEFAULT,
    targetQuantityKey: "brownianAnchor",
    stem: "A student views illuminated smoke trapped in a glass cell under a microscope and observes bright specks jittering unpredictably. What does Brownian motion demonstrate?",
    correctPrefix: "It shows the ",
    distractors: [
      {
        text: "It shows individual air molecules directly under visible light bouncing off the glass microscope slide.",
        rationale: "Air molecules are far too small to resolve optically; we see smoke specks, not molecules.",
      },
      {
        text: "It shows convection currents lifting all smoke particles uniformly upward at constant velocity.",
        rationale: "Convection produces smooth bulk drift rather than erratic random changes in direction.",
      },
      {
        text: "It shows electrostatic repulsion between identically charged smoke grains pushing them into circular orbits.",
        rationale: "Smoke motion is random and driven by molecular thermal bombardment, not circular orbits.",
      },
    ],
    workedNote:
      "Brownian motion is the random zigzag motion of larger visible smoke particles caused by uneven random collisions with much smaller fast-moving air molecules.",
  },
  {
    slug: "kt-real-gas-breakdown-4",
    kind: "al-a2-kinetic-theory-assumptions-lor",
    subtopic: "3.6.2",
    conceptId: "ideal-gas-kinetic-theory",
    templateArchetype: "al-a2-kinetic-theory-assumptions-lor",
    difficulty: "standard",
    questionStyle: "qualitative",
    scenarioSpec: KT_SPEC_DEFAULT,
    targetQuantityKey: "realGasDeviationAnchor",
    stem: "Under what macroscopic conditions does a real gas deviate most strongly from the ideal gas equation pV = nRT, and why?",
    correctPrefix: "The ",
    distractors: [
      {
        text: "The ideal gas behaviour breaks down at very low pressure and high temperature because molecules move too fast to collide with walls.",
        rationale: "Low pressure and high temperature are actually the regime where real gases behave most ideally.",
      },
      {
        text: "The ideal gas behaviour breaks down at low pressure and low density because intermolecular forces grow infinite at large separation.",
        rationale: "Intermolecular forces vanish rapidly as molecular separation increases.",
      },
      {
        text: "The ideal gas behaviour breaks down at high temperature only because molecular mass increases relativistically.",
        rationale: "Thermal speeds at laboratory temperatures are non-relativistic.",
      },
    ],
    workedNote:
      "Close packing and low kinetic energy mean ideal gas behaviour breaks down at high pressure and low temperature because finite molecular volume and intermolecular attractive forces become significant.",
  },
  {
    slug: "kt-wall-rebound-n2n3-5",
    kind: "al-a2-kinetic-theory-assumptions-lor",
    subtopic: "3.6.2",
    conceptId: "ideal-gas-kinetic-theory",
    templateArchetype: "al-a2-kinetic-theory-assumptions-lor",
    difficulty: "higher",
    questionStyle: "derivation",
    scenarioSpec: KT_SPEC_DEFAULT,
    targetQuantityKey: "kineticAnchor",
    stem: "Which sequence of Newtonian mechanics steps correctly derives the kinetic theory equation for the pressure of an ideal gas in a cubic box?",
    correctPrefix: "An ",
    distractors: [
      {
        text: "An inelastic wall collision halves molecular speed for momentum change minus m u, and gravity on the floor generates pressure.",
        rationale: "Wrongly assumes inelastic collision (omitting factor of 2 in Δp) and attributes gas pressure to weight.",
      },
      {
        text: "An elastic wall collision leaves velocity unchanged so momentum change is zero while potential energy produces wall pressure.",
        rationale: "Velocity reverses sign on rebound, giving Δp = −2mu rather than zero.",
      },
      {
        text: "An elastic collision gives time between impacts L / u and assumes all molecules travel parallel to the x-axis.",
        rationale: "Omits the round-trip factor of 2 in t = 2L/u and omits the 3D isotropy factor of 1/3.",
      },
    ],
    workedNote:
      "An elastic wall collision reverses velocity giving momentum change minus two m u, Newton second and third laws give wall force, and isotropic random motion gives the one-third factor in pV equals one-third N m c rms squared.",
  },
  {
    slug: "kt-internal-energy-ideal-6",
    kind: "al-a2-kinetic-theory-assumptions-lor",
    subtopic: "3.6.2",
    conceptId: "ideal-gas-kinetic-theory",
    templateArchetype: "al-a2-kinetic-theory-assumptions-lor",
    difficulty: "higher",
    questionStyle: "qualitative",
    scenarioSpec: KT_SPEC_DEFAULT,
    targetQuantityKey: "assumptionsAnchor",
    stem: "Why is the internal energy of a monatomic ideal gas purely kinetic and directly proportional to its absolute thermodynamic temperature?",
    correctPrefix: "Because kinetic theory assumes ",
    correctSuffix: ", so intermolecular potential energy is zero.",
    distractors: [
      {
        text: "Because kinetic theory assumes strong long-range electrical attraction between molecules that stores constant potential energy.",
        rationale: "Strong attractions would create a volume-dependent potential energy term.",
      },
      {
        text: "Because kinetic theory assumes molecules never collide with one another so kinetic energy cannot change.",
        rationale: "Molecules do collide elastically; zero potential energy follows from negligible intermolecular forces.",
      },
      {
        text: "Because kinetic theory assumes every gas atom has zero rest mass and zero rotational inertia.",
        rationale: "Gas atoms have finite mass m.",
      },
    ],
    workedNote:
      "Since kinetic theory assumes negligible molecular volume compared with container volume, negligible intermolecular forces except during elastic collisions, and negligible collision duration, potential energy between molecules is zero.",
  },

  // ---- 5. al-a2-satellite-orbits-comparison (6 qual MCQs, 3.7.2) ----
  {
    slug: "sat-geo-conditions-1",
    kind: "al-a2-satellite-orbits-comparison",
    subtopic: "3.7.2",
    ncukCross: { topicId: "ncuk-ac5", subtopicId: "ncuk-ac5-1" },
    conceptId: "gravitational-potential-orbits",
    templateArchetype: "al-a2-satellite-orbits-comparison",
    difficulty: "foundation",
    questionStyle: "definition",
    scenarioSpec: SAT_SPEC_DEFAULT,
    targetQuantityKey: "geostationaryConditionsAnchor",
    stem: "Which complete set of orbital conditions must a communications satellite satisfy to remain permanently fixed above one point on Earth's surface?",
    correctPrefix: "It must have a ",
    distractors: [
      {
        text: "It must have a twenty-four hour orbital period, pass directly over both poles, and orbit east-to-west.",
        rationale: "Polar and retrograde orbits cannot remain stationary above a single ground location.",
      },
      {
        text: "It must have a twelve-hour orbital period, stay above any chosen line of latitude, and orbit west-to-east.",
        rationale: "A stable circular orbit must be centred on Earth's centre, so it can only remain fixed above the equator with T = 24 h.",
      },
      {
        text: "It must have a twenty-four hour orbital period, orbit above the equator, and travel from east to west against Earth's spin.",
        rationale: "Orbiting east-to-west opposes Earth's west-to-east rotation.",
      },
    ],
    workedNote:
      "All three AQA requirements are mandatory: twenty-four hour orbital period matching Earth rotation, directly above the equator, and orbiting west-to-east.",
  },
  {
    slug: "sat-polar-leo-advantage-2",
    kind: "al-a2-satellite-orbits-comparison",
    subtopic: "3.7.2",
    ncukCross: { topicId: "ncuk-ac5", subtopicId: "ncuk-ac5-1" },
    conceptId: "gravitational-potential-orbits",
    templateArchetype: "al-a2-satellite-orbits-comparison",
    difficulty: "standard",
    questionStyle: "qualitative",
    scenarioSpec: SAT_SPEC_DEFAULT,
    targetQuantityKey: "orbitComparisonAnchor",
    stem: "Why are polar low-Earth orbits chosen instead of geostationary orbits for global weather monitoring, environmental mapping, and high-detail reconnaissance?",
    correctPrefix: "A ",
    distractors: [
      {
        text: "A polar low-Earth orbit remains fixed above the North Pole so ground dishes never need to track the satellite.",
        rationale: "A polar satellite moves continuously around Earth and requires tracking dishes.",
      },
      {
        text: "A polar low-Earth orbit lies far beyond the geostationary ring where atmospheric drag is zero.",
        rationale: "LEO altitude is much lower (hundreds of km) than GEO (~36 000 km).",
      },
      {
        text: "A polar low-Earth orbit experiences zero gravitational acceleration because it crosses the spin axis.",
        rationale: "Gravity provides the centripetal acceleration in every closed orbit.",
      },
    ],
    workedNote:
      "A polar low-Earth orbit sweeps the entire Earth surface as Earth rotates beneath giving higher image resolution and lower signal latency.",
  },
  {
    slug: "sat-geo-above-london-3",
    kind: "al-a2-satellite-orbits-comparison",
    subtopic: "3.7.2",
    ncukCross: { topicId: "ncuk-ac5", subtopicId: "ncuk-ac5-1" },
    conceptId: "gravitational-potential-orbits",
    templateArchetype: "al-a2-satellite-orbits-comparison",
    difficulty: "higher",
    questionStyle: "qualitative",
    scenarioSpec: SAT_SPEC_DEFAULT,
    targetQuantityKey: "geostationaryConditionsAnchor",
    stem: "Why is it physically impossible to place a geostationary satellite permanently directly overhead above London (latitude 51.5° N)?",
    correctPrefix: "Because gravitational attraction acts toward Earth's centre, a geostationary orbit requires a ",
    distractors: [
      {
        text: "Because gravitational field strength drops to zero at northern latitudes above the tropics.",
        rationale: "Earth's gravity acts globally toward the centre of Earth.",
      },
      {
        text: "Because satellites above temperate latitudes must orbit faster than the speed of light.",
        rationale: "Orbital speeds are around 3 km s⁻¹, far below c.",
      },
      {
        text: "Because Earth's magnetic poles deflect all non-equatorial satellites into escape trajectories.",
        rationale: "Satellite motion is governed by gravity, not geomagnetic deflection.",
      },
    ],
    workedNote:
      "The orbital plane must contain Earth's centre of mass, so staying fixed above one surface point requires a twenty-four hour orbital period matching Earth rotation, directly above the equator, and orbiting west-to-east.",
  },
  {
    slug: "sat-leo-latency-4",
    kind: "al-a2-satellite-orbits-comparison",
    subtopic: "3.7.2",
    ncukCross: { topicId: "ncuk-ac5", subtopicId: "ncuk-ac5-1" },
    conceptId: "gravitational-potential-orbits",
    templateArchetype: "al-a2-satellite-orbits-comparison",
    difficulty: "standard",
    questionStyle: "qualitative",
    scenarioSpec: SAT_SPEC_DEFAULT,
    targetQuantityKey: "orbitComparisonAnchor",
    stem: "Compared with a geostationary broadcast satellite, what major observational and communication advantages arise from operating an imaging satellite in a polar low-Earth orbit?",
    correctPrefix: "Because it orbits much closer to Earth over the poles, a ",
    distractors: [
      {
        text: "Because it orbits much closer to Earth over the poles, it stays continuously visible from a single stationary roof dish.",
        rationale: "Only geostationary satellites remain stationary in the sky for fixed dishes.",
      },
      {
        text: "Because it orbits much closer to Earth over the poles, its orbital speed is lower and its period exceeds one week.",
        rationale: "Smaller radius gives higher orbital speed (v = √(GM/r)) and shorter period (~90–105 min).",
      },
      {
        text: "Because it orbits much closer to Earth over the poles, radio signals weaken faster than from geostationary altitude.",
        rationale: "Inverse-square signal attenuation is much smaller at LEO altitude than at GEO.",
      },
    ],
    workedNote:
      "A polar low-Earth orbit sweeps the entire Earth surface as Earth rotates beneath giving higher image resolution and lower signal latency.",
  },
  {
    slug: "sat-geo-fixed-dish-5",
    kind: "al-a2-satellite-orbits-comparison",
    subtopic: "3.7.2",
    ncukCross: { topicId: "ncuk-ac5", subtopicId: "ncuk-ac5-1" },
    conceptId: "gravitational-potential-orbits",
    templateArchetype: "al-a2-satellite-orbits-comparison",
    difficulty: "standard",
    questionStyle: "qualitative",
    scenarioSpec: SAT_SPEC_DEFAULT,
    targetQuantityKey: "geostationaryConditionsAnchor",
    stem: "Domestic satellite television dishes remain bolted in one fixed orientation on house walls. Which set of orbital parameters of the transmitting satellite makes this possible?",
    correctPrefix: "The transmitting satellite follows a ",
    distractors: [
      {
        text: "The transmitting satellite follows a ninety-minute polar orbit at an altitude of five hundred kilometres.",
        rationale: "Polar LEO satellites cross the sky in minutes and require motorised tracking.",
      },
      {
        text: "The transmitting satellite follows a highly elliptical orbit with a period of one lunar month.",
        rationale: "An elliptical monthly orbit drifts continuously across the sky.",
      },
      {
        text: "The transmitting satellite follows an equatorial orbit moving east-to-west once every twenty-four hours.",
        rationale: "East-to-west motion doubles the relative angular speed across the sky.",
      },
    ],
    workedNote:
      "Fixed ground dishes require a twenty-four hour orbital period matching Earth rotation, directly above the equator, and orbiting west-to-east.",
  },
  {
    slug: "sat-polar-swath-6",
    kind: "al-a2-satellite-orbits-comparison",
    subtopic: "3.7.2",
    ncukCross: { topicId: "ncuk-ac5", subtopicId: "ncuk-ac5-1" },
    conceptId: "gravitational-potential-orbits",
    templateArchetype: "al-a2-satellite-orbits-comparison",
    difficulty: "higher",
    questionStyle: "qualitative",
    scenarioSpec: SAT_SPEC_DEFAULT,
    targetQuantityKey: "orbitComparisonAnchor",
    stem: "How does a single satellite in a sun-synchronous polar orbit photograph every landmass on Earth within a day without firing lateral thrusters?",
    correctPrefix: "A ",
    distractors: [
      {
        text: "A polar satellite relies on Earth's magnetic field to twist its orbital plane by ninety degrees every hour.",
        rationale: "Orbital plane stays nearly fixed in inertial space while Earth rotates underneath.",
      },
      {
        text: "A polar satellite orbits at the geostationary radius so one hemisphere is always completely in view.",
        rationale: "Geostationary orbits are equatorial and cannot view the polar caps cleanly.",
      },
      {
        text: "A polar satellite reverses direction at each pole to trace zigzags across the same meridian.",
        rationale: "Closed Keplerian orbits cannot reverse direction at the poles.",
      },
    ],
    workedNote:
      "Because Earth turns beneath the fixed orbital plane, a polar low-Earth orbit sweeps the entire Earth surface as Earth rotates beneath giving higher image resolution and lower signal latency.",
  },

  // ---- 6. al-a2-grav-vs-electric-fields (6 qual MCQs, 3.7.3 + 3.7.2) ----
  {
    slug: "ge-compare-core-1",
    kind: "al-a2-grav-vs-electric-fields",
    subtopic: "3.7.3",
    extraAlevel: "3.7.2",
    ncukCross: { topicId: "ncuk-ac4", subtopicId: "ncuk-ac4-5" },
    conceptId: "electric-potential-equipotentials",
    templateArchetype: "al-a2-grav-vs-electric-fields",
    difficulty: "foundation",
    questionStyle: "qualitative",
    scenarioSpec: GE_SPEC_POS,
    targetQuantityKey: "fieldComparisonAnchor",
    stem: "Which statement accurately compares radial gravitational fields around a spherical mass and radial electric fields around a point charge?",
    correctPrefix: "In radial geometry, ",
    distractors: [
      {
        text: "In radial geometry, gravitational field strength obeys an inverse-cube law while electric field strength obeys an inverse-square law.",
        rationale: "Both radial fields follow inverse-square laws (1/r²).",
      },
      {
        text: "In radial geometry, gravitational potential is positive near a mass whereas electric potential is always negative near any charge.",
        rationale: "Reverses the sign of gravitational potential and ignores positive electric potential near +Q.",
      },
      {
        text: "In radial geometry, both fields can attract or repel depending on whether the test particle is moving.",
        rationale: "Gravity is strictly attractive; static electric forces depend on charge sign, not motion.",
      },
    ],
    workedNote:
      "Both obey inverse-square laws with zero potential at infinity, but gravitational force is always attractive with negative potential whereas electric force can attract or repel with positive or negative potential.",
  },
  {
    slug: "ge-equipotential-work-2",
    kind: "al-a2-grav-vs-electric-fields",
    subtopic: "3.7.3",
    extraAlevel: "3.7.2",
    ncukCross: { topicId: "ncuk-ac4", subtopicId: "ncuk-ac4-5" },
    conceptId: "electric-potential-equipotentials",
    templateArchetype: "al-a2-grav-vs-electric-fields",
    difficulty: "foundation",
    questionStyle: "definition",
    scenarioSpec: GE_SPEC_POS,
    targetQuantityKey: "equipotentialAnchor",
    stem: "A small test charge is carried along a dashed circular equipotential contour around a fixed point charge. What geometric and energetic property holds everywhere on this path?",
    correctPrefix: "Everywhere in the field, ",
    distractors: [
      {
        text: "Everywhere in the field, equipotential surfaces run parallel to field lines so maximum work is done along an equipotential.",
        rationale: "Field lines cross equipotentials at right angles, never parallel.",
      },
      {
        text: "Everywhere in the field, equipotential surfaces cross field lines at forty-five degrees and double the kinetic energy.",
        rationale: "Any non-orthogonal component of force along an equipotential would do work and change potential.",
      },
      {
        text: "Everywhere in the field, equipotential surfaces exist only in uniform parallel-plate fields and never in radial fields.",
        rationale: "Radial fields possess concentric spherical equipotentials.",
      },
    ],
    workedNote:
      "Since ΔW = qΔV and ΔV = 0 on an equipotential, equipotential surfaces are always perpendicular to field lines and zero work is done moving a mass or charge along an equipotential.",
  },
  {
    slug: "ge-potential-gradient-3",
    kind: "al-a2-grav-vs-electric-fields",
    subtopic: "3.7.3",
    extraAlevel: "3.7.2",
    ncukCross: { topicId: "ncuk-ac4", subtopicId: "ncuk-ac4-5" },
    conceptId: "electric-potential-equipotentials",
    templateArchetype: "al-a2-grav-vs-electric-fields",
    difficulty: "standard",
    questionStyle: "qualitative",
    scenarioSpec: GE_SPEC_NEG,
    targetQuantityKey: "potentialGradientAnchor",
    stem: "Equipotential contours separated by equal potential steps ΔV are drawn around a negatively charged sphere. Why are the contours packed closer together near the sphere and wider apart far away?",
    correctPrefix: "Because ",
    distractors: [
      {
        text: "Because potential is directly proportional to distance from the centre, making the field stronger far from the charge.",
        rationale: "Potential varies as 1/r and field weakens as 1/r² with distance.",
      },
      {
        text: "Because widely spaced equipotentials indicate a steeper potential gradient and a stronger electric field.",
        rationale: "Inverts the relation E = −ΔV/Δr: smaller Δr for fixed ΔV means larger |E|.",
      },
      {
        text: "Because the contours represent trajectories of stationary test charges accelerating radially outward.",
        rationale: "Equipotentials are surfaces of constant potential, not field-line trajectories.",
      },
    ],
    workedNote:
      "Since E = −ΔV/Δr (and g = −ΔV/Δr), field strength equals the negative potential gradient so more closely spaced equipotentials indicate a stronger field.",
  },
  {
    slug: "ge-negative-grav-pot-4",
    kind: "al-a2-grav-vs-electric-fields",
    subtopic: "3.7.2",
    extraAlevel: "3.7.3",
    ncukCross: { topicId: "ncuk-ac5", subtopicId: "ncuk-ac5-1" },
    conceptId: "gravitational-potential-orbits",
    templateArchetype: "al-a2-grav-vs-electric-fields",
    difficulty: "standard",
    questionStyle: "qualitative",
    scenarioSpec: GE_SPEC_NEG,
    targetQuantityKey: "fieldComparisonAnchor",
    stem: "Why is gravitational potential at every finite distance from a planet always negative, whereas electric potential around an isolated charged sphere can be either positive or negative?",
    correctPrefix: "Taking zero potential at infinity, ",
    distractors: [
      {
        text: "Taking zero potential at infinity, gravitational potential is defined at the centre of Earth rather than at infinity.",
        rationale: "Both radial gravitational and radial electric potentials define zero at infinity.",
      },
      {
        text: "Taking zero potential at infinity, gravity is weaker than magnetism so its potential is assigned a negative label arbitrarily.",
        rationale: "The negative sign follows physically from doing positive external work to separate attractive masses to infinity.",
      },
      {
        text: "Taking zero potential at infinity, electric charges cannot attract each other so electric potential is always positive.",
        rationale: "Unlike charges attract, giving negative electric potential around a negative source charge.",
      },
    ],
    workedNote:
      "Both obey inverse-square laws with zero potential at infinity, but gravitational force is always attractive with negative potential whereas electric force can attract or repel with positive or negative potential.",
  },
  {
    slug: "ge-satellite-equipotential-5",
    kind: "al-a2-grav-vs-electric-fields",
    subtopic: "3.7.2",
    extraAlevel: "3.7.3",
    ncukCross: { topicId: "ncuk-ac5", subtopicId: "ncuk-ac5-1" },
    conceptId: "gravitational-potential-orbits",
    templateArchetype: "al-a2-grav-vs-electric-fields",
    difficulty: "higher",
    questionStyle: "qualitative",
    scenarioSpec: GE_SPEC_POS,
    targetQuantityKey: "equipotentialAnchor",
    stem: "A spacecraft coasts in a perfectly circular orbit around Mars with its engines switched off. Why does its speed remain strictly constant despite Mars continuously pulling on it with a large gravitational force?",
    correctPrefix: "Its circular orbit lies on a spherical equipotential: ",
    distractors: [
      {
        text: "Its circular orbit lies along a single radial field line where gravitational potential drops linearly.",
        rationale: "A circular orbit runs perpendicular to radial field lines, not along them.",
      },
      {
        text: "Its engines must secretly cancel gravity because any non-zero force must change kinetic energy.",
        rationale: "A force perpendicular to velocity changes direction without changing speed or kinetic energy.",
      },
      {
        text: "Gravitational force vanishes at orbital altitude so zero net force acts on the spacecraft.",
        rationale: "Gravitational pull provides the centripetal force keeping the spacecraft in orbit.",
      },
    ],
    workedNote:
      "In circular orbit r is constant, and equipotential surfaces are always perpendicular to field lines and zero work is done moving a mass or charge along an equipotential.",
  },
  {
    slug: "ge-uniform-vs-radial-6",
    kind: "al-a2-grav-vs-electric-fields",
    subtopic: "3.7.3",
    ncukCross: { topicId: "ncuk-ac4", subtopicId: "ncuk-ac4-5" },
    conceptId: "electric-potential-equipotentials",
    templateArchetype: "al-a2-grav-vs-electric-fields",
    difficulty: "standard",
    questionStyle: "qualitative",
    scenarioSpec: GE_SPEC_POS,
    targetQuantityKey: "potentialGradientAnchor",
    stem: "Between two large parallel charged plates separated by a small gap, equipotential lines drawn at equal voltage intervals are parallel and equally spaced. What does this uniform spacing show?",
    correctPrefix: "It shows constant uniform electric field because ",
    distractors: [
      {
        text: "It shows electric potential is identical everywhere between the two plates.",
        rationale: "Potential varies linearly from one plate to the other; only the gradient is constant.",
      },
      {
        text: "It shows electric field strength falls off as inverse distance squared from the positive plate.",
        rationale: "Equal equipotential spacing implies constant E = V/d, not 1/r² decay.",
      },
      {
        text: "It shows zero electrostatic force acts on an electron placed midway between the plates.",
        rationale: "A constant non-zero field exerts a constant force F = qE.",
      },
    ],
    workedNote:
      "Since field strength equals the negative potential gradient so more closely spaced equipotentials indicate a stronger field, equal spacing corresponds to a constant field strength.",
  },

  // ---- 7. al-a2-capacitor-polar-dielectric (6 qual MCQs, 3.7.4) ----
  {
    slug: "diel-polar-mechanism-1",
    kind: "al-a2-capacitor-polar-dielectric",
    subtopic: "3.7.4",
    conceptId: "capacitor-networks-energy",
    templateArchetype: "al-a2-capacitor-polar-dielectric",
    difficulty: "standard",
    questionStyle: "qualitative",
    scenarioSpec: DIEL_SPEC_ISO,
    targetQuantityKey: "dielectricAnchor",
    stem: "A slab of polar dielectric material is slid smoothly to fill the air gap between the charged plates of a parallel-plate capacitor. How do the polar molecules increase the capacitance?",
    correctPrefix: "The ",
    distractors: [
      {
        text: "The polar molecules conduct free electrons directly across the gap to equalise plate potentials.",
        rationale: "A dielectric is an insulator; conduction across the gap would discharge the capacitor.",
      },
      {
        text: "The polar molecules align positive ends toward the positive plate, reinforcing the applied field and raising potential difference.",
        rationale: "Reverses dipole orientation and electric field direction.",
      },
      {
        text: "The polar molecules physically push the metal plates further apart so capacitance increases with separation.",
        rationale: "Increasing separation d decreases capacitance since C = ε₀εᵣA/d.",
      },
    ],
    workedNote:
      "In the applied field, polar molecules rotate to align negative ends toward the positive plate, producing an opposing internal electric field that reduces net field and increases capacitance by relative permittivity.",
  },
  {
    slug: "diel-50pct-heat-2",
    kind: "al-a2-capacitor-polar-dielectric",
    subtopic: "3.7.4",
    conceptId: "capacitor-networks-energy",
    templateArchetype: "al-a2-capacitor-polar-dielectric",
    difficulty: "standard",
    questionStyle: "qualitative",
    scenarioSpec: DIEL_SPEC_CONN,
    targetQuantityKey: "chargingEfficiencyAnchor",
    stem: "An uncharged capacitor is connected through a series resistor R to an ideal constant-emf battery of voltage V until fully charged to charge Q. What happens to the energy transferred by the battery?",
    correctPrefix: "The ",
    distractors: [
      {
        text: "The battery supplies energy half Q V which is stored with one hundred percent efficiency when resistance is small.",
        rationale: "Battery work is W = QV, not ½QV, and 50% is always dissipated regardless of R.",
      },
      {
        text: "The fraction dissipated as thermal energy rises toward one hundred percent as the series resistor R is made larger.",
        rationale: "Larger R slows charging (longer τ = RC) but total energy lost ∫I²R dt remains ½QV.",
      },
      {
        text: "The capacitor stores the full Q V supplied by the battery while circuit resistance stores zero energy.",
        rationale: "Area under the linear Q–V graph is only half the rectangle QV.",
      },
    ],
    workedNote:
      "The battery supplies energy Q V while the capacitor stores half Q V so exactly fifty percent is dissipated as thermal energy in circuit resistance regardless of resistance value.",
  },
  {
    slug: "diel-isolated-insert-3",
    kind: "al-a2-capacitor-polar-dielectric",
    subtopic: "3.7.4",
    conceptId: "capacitor-networks-energy",
    templateArchetype: "al-a2-capacitor-polar-dielectric",
    difficulty: "higher",
    questionStyle: "qualitative",
    scenarioSpec: DIEL_SPEC_ISO,
    targetQuantityKey: "modeEnergyOutcomeAnchor",
    stem: "An air-filled parallel-plate capacitor is charged to voltage V and then disconnected from the battery so it is electrically isolated. A polar dielectric slab of relative permittivity εᵣ is then inserted between the plates. What happens to its voltage and stored energy?",
    correctPrefix: "Because it is isolated, ",
    distractors: [
      {
        text: "Because it is isolated, potential difference stays constant while charge and stored energy increase by factor relative permittivity.",
        rationale: "Applies the battery-connected outcome to an isolated capacitor.",
      },
      {
        text: "Because it is isolated, both charge and stored energy stay strictly constant because no current flows.",
        rationale: "Forgets that the electric field pulls the slab inward, doing mechanical work and lowering stored electrical energy E = Q²/(2C).",
      },
      {
        text: "Because it is isolated, charge decreases by factor relative permittivity while voltage remains unchanged.",
        rationale: "Violates conservation of charge on isolated plates.",
      },
    ],
    workedNote:
      "For an isolated capacitor, charge stays constant so potential difference and stored energy decrease by factor relative permittivity.",
  },
  {
    slug: "diel-connected-insert-4",
    kind: "al-a2-capacitor-polar-dielectric",
    subtopic: "3.7.4",
    conceptId: "capacitor-networks-energy",
    templateArchetype: "al-a2-capacitor-polar-dielectric",
    difficulty: "higher",
    questionStyle: "qualitative",
    scenarioSpec: DIEL_SPEC_CONN,
    targetQuantityKey: "modeEnergyOutcomeAnchor",
    stem: "A parallel-plate capacitor remains permanently connected across a constant-voltage DC power supply while a polar dielectric slab of relative permittivity εᵣ is inserted between its plates. What happens to the charge and stored energy?",
    correctPrefix: "While connected to the supply, ",
    distractors: [
      {
        text: "While connected to the supply, charge stays constant so potential difference and stored energy drop by factor relative permittivity.",
        rationale: "Applies the isolated-capacitor behaviour when V is actually held fixed by the supply.",
      },
      {
        text: "While connected to the supply, capacitance stays constant so neither charge nor stored energy changes.",
        rationale: "Ignores that inserting a dielectric multiplies capacitance by εᵣ.",
      },
      {
        text: "While connected to the supply, extra charge flows back into the battery so stored energy falls to zero.",
        rationale: "Higher capacitance at fixed V requires additional charge from the supply, increasing E = ½CV².",
      },
    ],
    workedNote:
      "At fixed V, C rises by εᵣ so potential difference stays constant so extra charge flows from the supply and stored energy increases by factor relative permittivity.",
  },
  {
    slug: "diel-charging-double-r-5",
    kind: "al-a2-capacitor-polar-dielectric",
    subtopic: "3.7.4",
    conceptId: "capacitor-networks-energy",
    templateArchetype: "al-a2-capacitor-polar-dielectric",
    difficulty: "higher",
    questionStyle: "qualitative",
    scenarioSpec: DIEL_SPEC_CONN,
    targetQuantityKey: "chargingEfficiencyAnchor",
    stem: "A student replaces the charging resistor in an RC circuit with another resistor of four times the resistance and recharges the same capacitor from empty using the same ideal battery. How does the total thermal energy dissipated in the resistor change?",
    correctPrefix: "It is unchanged because the ",
    distractors: [
      {
        text: "It becomes four times larger because power dissipated as heat is proportional to resistance R.",
        rationale: "Ignores that initial current drops by a factor of four while charging time rises by four, keeping ∫I²R dt identical.",
      },
      {
        text: "It becomes four times smaller because peak charging current is divided by four.",
        rationale: "Forgets the longer charging duration over which current flows.",
      },
      {
        text: "It drops to zero if the charging time constant exceeds ten seconds.",
        rationale: "Slow charging with a fixed-voltage source still dissipates ½QV in total.",
      },
    ],
    workedNote:
      "Regardless of R, the battery supplies energy Q V while the capacitor stores half Q V so exactly fifty percent is dissipated as thermal energy in circuit resistance regardless of resistance value.",
  },
  {
    slug: "diel-epsr-definition-6",
    kind: "al-a2-capacitor-polar-dielectric",
    subtopic: "3.7.4",
    conceptId: "capacitor-networks-energy",
    templateArchetype: "al-a2-capacitor-polar-dielectric",
    difficulty: "foundation",
    questionStyle: "definition",
    scenarioSpec: DIEL_SPEC_ISO,
    targetQuantityKey: "dielectricAnchor",
    stem: "Why is the relative permittivity εᵣ of any insulating polar dielectric slab always greater than unity?",
    correctPrefix: "Because in an applied field, ",
    distractors: [
      {
        text: "Because polar molecules permanently amplify the electric field between the plates above the vacuum value.",
        rationale: "Aligned dipoles oppose rather than reinforce the applied field.",
      },
      {
        text: "Because polar molecules increase the plate separation d inside the capacitor.",
        rationale: "Plate separation d is fixed by geometry.",
      },
      {
        text: "Because free ions inside the insulator carry current straight from the positive plate to the negative plate.",
        rationale: "A dielectric is an insulator whose dipoles rotate in place without conducting through the gap.",
      },
    ],
    workedNote:
      "Polar molecules rotate to align negative ends toward the positive plate, producing an opposing internal electric field that reduces net field and increases capacitance by relative permittivity.",
  },

  // ---- 8. al-a2-lenz-law-energy-conservation (6 qual MCQs, 3.7.5) ----
  {
    slug: "lenz-energy-law-1",
    kind: "al-a2-lenz-law-energy-conservation",
    subtopic: "3.7.5",
    ncukCross: { topicId: "ncuk-ac4", subtopicId: "ncuk-ac4-6" },
    conceptId: "electromagnetic-induction-faraday-lenz",
    templateArchetype: "al-a2-lenz-law-energy-conservation",
    difficulty: "standard",
    questionStyle: "qualitative",
    scenarioSpec: LENZ_SPEC_N,
    targetQuantityKey: "lenzEnergyAnchor",
    stem: "How does Lenz's law directly uphold the principle of conservation of energy when a bar magnet is pushed into a closed solenoid?",
    correctPrefix: "The ",
    distractors: [
      {
        text: "The induced emf assists the flux linkage change so the magnet accelerates spontaneously while supplying free electrical power.",
        rationale: "Assisting motion would create both kinetic and electrical energy from nothing, violating conservation of energy.",
      },
      {
        text: "The induced emf destroys magnetic field lines inside the magnet to create electrical charge in the copper wire.",
        rationale: "Charge is conserved and magnetic flux is not destroyed.",
      },
      {
        text: "The induced emf cancels gravity completely so the magnet floats motionless above every open-circuited coil.",
        rationale: "An open circuit carries zero induced current and exerts zero opposing magnetic force.",
      },
    ],
    workedNote:
      "The induced emf opposes the change in magnetic flux linkage producing it so mechanical work done against magnetic opposition converts into electrical thermal energy obeying conservation of energy.",
  },
  {
    slug: "lenz-north-approach-2",
    kind: "al-a2-lenz-law-energy-conservation",
    subtopic: "3.7.5",
    ncukCross: { topicId: "ncuk-ac4", subtopicId: "ncuk-ac4-6" },
    conceptId: "electromagnetic-induction-faraday-lenz",
    templateArchetype: "al-a2-lenz-law-energy-conservation",
    difficulty: "foundation",
    questionStyle: "qualitative",
    scenarioSpec: LENZ_SPEC_N,
    targetQuantityKey: "approachPoleInduced",
    stem: "A bar magnet is dropped vertically with its north pole pointing downward into a closed solenoid connected to a resistor. What magnetic pole is induced at the top end of the solenoid as the magnet approaches?",
    correctPrefix: "A ",
    distractors: [
      {
        text: "A south pole induced at the top of the coil pulling the approaching north pole faster into the coil.",
        rationale: "Attracting the approaching magnet would violate Lenz's law and energy conservation.",
      },
      {
        text: "No magnetic pole is induced until the magnet completely exits the bottom of the solenoid.",
        rationale: "Flux linkage changes immediately on approach, inducing current and a magnetic pole.",
      },
      {
        text: "A north pole induced at the bottom end only while the top end stays magnetically neutral.",
        rationale: "A current-carrying solenoid forms a dipole with opposite poles at its two ends, with the opposing pole at the approach end.",
      },
    ],
    workedNote:
      "By Lenz's law, a north pole induced at the top of the coil repelling the approaching north pole opposes the incoming flux change.",
  },
  {
    slug: "lenz-south-approach-3",
    kind: "al-a2-lenz-law-energy-conservation",
    subtopic: "3.7.5",
    ncukCross: { topicId: "ncuk-ac4", subtopicId: "ncuk-ac4-6" },
    conceptId: "electromagnetic-induction-faraday-lenz",
    templateArchetype: "al-a2-lenz-law-energy-conservation",
    difficulty: "foundation",
    questionStyle: "qualitative",
    scenarioSpec: LENZ_SPEC_S,
    targetQuantityKey: "approachPoleInduced",
    stem: "A strong neodymium bar magnet falls vertically with its south pole leading toward the upper face of a closed coil. Which pole is induced at the upper face of the coil during approach?",
    correctPrefix: "A ",
    distractors: [
      {
        text: "A north pole induced at the top of the coil attracting the falling south pole downward.",
        rationale: "Attraction on approach would assist the motion and create energy from nothing.",
      },
      {
        text: "A north pole induced at the top of the coil because magnetic fields always point downward.",
        rationale: "Induced polarity always matches the approaching pole to produce repulsion.",
      },
      {
        text: "No pole is induced because only north poles generate magnetic flux linkage.",
        rationale: "Both north and south poles produce magnetic flux through the coil.",
      },
    ],
    workedNote:
      "To oppose approach of the south pole, Lenz's law produces a south pole induced at the top of the coil repelling the approaching south pole.",
  },
  {
    slug: "lenz-bipolar-pulses-4",
    kind: "al-a2-lenz-law-energy-conservation",
    subtopic: "3.7.5",
    ncukCross: { topicId: "ncuk-ac4", subtopicId: "ncuk-ac4-6" },
    conceptId: "electromagnetic-induction-faraday-lenz",
    templateArchetype: "al-a2-lenz-law-energy-conservation",
    difficulty: "standard",
    questionStyle: "qualitative",
    scenarioSpec: LENZ_SPEC_N,
    targetQuantityKey: "bipolarPulseAnchor",
    stem: "A bar magnet is dropped from rest above a solenoid wired to a data logger, producing two opposite-polarity emf pulses as it enters and leaves. How do the height, width, and enclosed area of the exit pulse compare with the entry pulse?",
    correctPrefix: "The ",
    distractors: [
      {
        text: "The exit pulse has greater peak emf, longer duration, and double the enclosed area because the magnet moves faster.",
        rationale: "Total change in flux linkage is identical (NΦ to 0 vs 0 to NΦ), so areas are equal and exit duration is shorter.",
      },
      {
        text: "The exit pulse has smaller peak emf and identical duration because magnetic energy was lost on entry.",
        rationale: "Gravity accelerates the magnet so its exit speed and rate of flux cutting dΦ/dt are larger.",
      },
      {
        text: "The entry and exit pulses have identical peak emf, identical width, and the same polarity.",
        rationale: "Ignores both gravitational acceleration and polarity reversal when flux decreases.",
      },
    ],
    workedNote:
      "Since ε = −N dΦ/dt and ∫|ε| dt = NΔΦ, the exit pulse has greater peak emf and shorter duration because the magnet accelerates under gravity while both pulses enclose equal area equal to maximum flux linkage.",
  },
  {
    slug: "lenz-copper-tube-5",
    kind: "al-a2-lenz-law-energy-conservation",
    subtopic: "3.7.5",
    ncukCross: { topicId: "ncuk-ac4", subtopicId: "ncuk-ac4-6" },
    conceptId: "electromagnetic-induction-faraday-lenz",
    templateArchetype: "al-a2-lenz-law-energy-conservation",
    difficulty: "higher",
    questionStyle: "qualitative",
    scenarioSpec: LENZ_SPEC_N,
    targetQuantityKey: "lenzEnergyAnchor",
    stem: "A small cylindrical magnet dropped down a long vertical non-magnetic copper pipe falls far more slowly than an identical unmagnetised brass cylinder (where g = 9.81 m s⁻²). What physics explains this dramatic braking?",
    correctPrefix: "Eddy currents arise in the copper wall because ",
    distractors: [
      {
        text: "Copper is strongly ferromagnetic so the magnet sticks sideways to the inside wall by permanent magnetic attraction.",
        rationale: "Copper is non-ferromagnetic; the braking force arises purely from induced eddy currents.",
      },
      {
        text: "Air pressure below the magnet increases because magnetic fields compress nitrogen molecules.",
        rationale: "Air drag is identical for both cylinders of the same shape.",
      },
      {
        text: "Eddy currents assist the falling magnet's magnetic field so gravitational field strength inside copper drops to zero.",
        rationale: "Gravity remains 9.81 m s⁻²; eddy currents oppose motion and convert GPE to thermal energy.",
      },
    ],
    workedNote:
      "Falling flux induces eddy currents in the copper tube: induced emf opposes the change in magnetic flux linkage producing it so mechanical work done against magnetic opposition converts into electrical thermal energy obeying conservation of energy.",
  },
  {
    slug: "lenz-midpoint-zero-6",
    kind: "al-a2-lenz-law-energy-conservation",
    subtopic: "3.7.5",
    ncukCross: { topicId: "ncuk-ac4", subtopicId: "ncuk-ac4-6" },
    conceptId: "electromagnetic-induction-faraday-lenz",
    templateArchetype: "al-a2-lenz-law-energy-conservation",
    difficulty: "higher",
    questionStyle: "qualitative",
    scenarioSpec: LENZ_SPEC_S,
    targetQuantityKey: "bipolarPulseAnchor",
    stem: "At the instant a falling bar magnet passes the exact centre of a solenoid, the induced emf briefly reads zero before reversing polarity. Why is the emf zero at the centre even though magnetic flux linkage is at its maximum, and how do the two pulses compare?",
    correctPrefix: "At the centre dΦ/dt is instantaneously zero, and overall the ",
    distractors: [
      {
        text: "At the centre magnetic flux drops to zero, so the exit pulse has half the enclosed area of the entry pulse.",
        rationale: "Flux is maximal (not zero) at the centre, and both pulses have equal enclosed area NΦ.",
      },
      {
        text: "At the centre the magnet momentarily stops moving under Lenz repulsion, making both pulses symmetric.",
        rationale: "The magnet continues falling and accelerating, making the exit pulse taller and narrower.",
      },
      {
        text: "At the centre Faraday's law depends on total flux rather than rate of change of flux, so exit area exceeds entry area.",
        rationale: "Faraday's law depends on rate of change of flux linkage N dΦ/dt, whose time integral equals NΦ for both halves.",
      },
    ],
    workedNote:
      "At maximum flux linkage its rate of change is zero, and the exit pulse has greater peak emf and shorter duration because the magnet accelerates under gravity while both pulses enclose equal area equal to maximum flux linkage.",
  },

  // ---- 9. al-a2-transformer-losses-design (6 qual MCQs, 3.7.5) ----
  {
    slug: "tr-laminated-core-1",
    kind: "al-a2-transformer-losses-design",
    subtopic: "3.7.5",
    ncukCross: { topicId: "ncuk-ac4", subtopicId: "ncuk-ac4-6" },
    conceptId: "ac-generators-transformers",
    templateArchetype: "al-a2-transformer-losses-design",
    difficulty: "foundation",
    questionStyle: "qualitative",
    scenarioSpec: TRANS_SPEC_DEFAULT,
    targetQuantityKey: "laminatedCoreAnchor",
    stem: "Why is the iron core of a mains power transformer constructed from thin insulated sheets rather than a single solid block of iron?",
    correctPrefix: "Because ",
    distractors: [
      {
        text: "Because thin insulated sheets stop magnetic flux from passing through the secondary winding.",
        rationale: "Flux must link both windings cleanly; laminations block circulating currents perpendicular to flux, not the flux itself.",
      },
      {
        text: "Because thin insulated sheets decrease the electrical resistance of the iron so larger eddy currents boost efficiency.",
        rationale: "Laminations increase resistance to eddy currents to suppress I²R heating, not enlarge them.",
      },
      {
        text: "Because thin insulated sheets convert alternating current directly into steady direct current.",
        rationale: "Transformers only operate on AC and do not rectify current.",
      },
    ],
    workedNote:
      "Thin iron laminations separated by insulating layers increase resistance to eddy current paths reducing thermal energy loss in the core.",
  },
  {
    slug: "tr-all-losses-2",
    kind: "al-a2-transformer-losses-design",
    subtopic: "3.7.5",
    ncukCross: { topicId: "ncuk-ac4", subtopicId: "ncuk-ac4-6" },
    conceptId: "ac-generators-transformers",
    templateArchetype: "al-a2-transformer-losses-design",
    difficulty: "standard",
    questionStyle: "qualitative",
    scenarioSpec: TRANS_SPEC_DEFAULT,
    targetQuantityKey: "transformerLossAnchor",
    stem: "Which combination of engineering features properly matches each major power loss mechanism in a practical high-efficiency transformer?",
    correctPrefix: "A ",
    distractors: [
      {
        text: "A solid hard-steel core eliminates eddy currents while thin high-resistance nichrome coils reduce hysteresis loss.",
        rationale: "Reverses every design rule: hard steel worsens hysteresis, solid blocks worsen eddy currents, and thin high-R coils increase copper loss.",
      },
      {
        text: "An air core eliminates copper heating while widely separated open coils eliminate magnetic flux leakage.",
        rationale: "Air cores have huge flux leakage and do nothing to reduce winding resistance.",
      },
      {
        text: "A laminated core removes copper coil resistance while soft iron stops eddy currents from flowing in the primary wire.",
        rationale: "Mismatches eddy-current mitigation (lamination) and copper-loss mitigation (thick low-resistivity copper).",
      },
    ],
    workedNote:
      "A laminated soft-iron core with insulating layers increases resistance to reduce eddy current heating, soft iron lowers hysteresis loss, thick copper coils cut resistive heating, and a closed core minimises flux leakage.",
  },
  {
    slug: "tr-grid-high-v-3",
    kind: "al-a2-transformer-losses-design",
    subtopic: "3.7.5",
    ncukCross: { topicId: "ncuk-ac4", subtopicId: "ncuk-ac4-6" },
    conceptId: "ac-generators-transformers",
    templateArchetype: "al-a2-transformer-losses-design",
    difficulty: "standard",
    questionStyle: "qualitative",
    scenarioSpec: TRANS_SPEC_DEFAULT,
    targetQuantityKey: "highVoltageGridAnchor",
    stem: "Why do national electricity grids use step-up transformers to transmit electrical power across long-distance overhead lines at hundreds of kilovolts rather than at domestic mains voltage?",
    correctPrefix: "Because ",
    distractors: [
      {
        text: "Because higher transmission voltage increases cable current so electrons cross the country faster with less cooling time.",
        rationale: "Higher voltage decreases current for fixed P = IV.",
      },
      {
        text: "Because higher voltage reduces the electrical resistivity of overhead aluminium cables directly.",
        rationale: "Resistivity is a material property independent of transmission voltage.",
      },
      {
        text: "Because heating loss in transmission cables equals V² / R using the full line voltage rather than the voltage drop along the cable.",
        rationale: "Classic exam trap: V in P = V²/R is only the small voltage drop ΔV = IR across the cable, not the grid transmission voltage.",
      },
    ],
    workedNote:
      "For fixed transmitted power P = IV, stepping up transmission voltage lowers cable current for the same power so resistive heating in power lines falls as current squared.",
  },
  {
    slug: "tr-soft-iron-hysteresis-4",
    kind: "al-a2-transformer-losses-design",
    subtopic: "3.7.5",
    ncukCross: { topicId: "ncuk-ac4", subtopicId: "ncuk-ac4-6" },
    conceptId: "ac-generators-transformers",
    templateArchetype: "al-a2-transformer-losses-design",
    difficulty: "standard",
    questionStyle: "qualitative",
    scenarioSpec: TRANS_SPEC_DEFAULT,
    targetQuantityKey: "transformerLossAnchor",
    stem: "Why is magnetically soft iron preferred over magnetically hard steel for the core of an AC transformer?",
    correctPrefix: "Soft iron magnetises and demagnetises easily every cycle: a ",
    distractors: [
      {
        text: "Soft iron remains permanently magnetised so the transformer continues outputting AC even when the primary supply is disconnected.",
        rationale: "Permanent magnetisation is hard steel, which causes severe hysteresis energy loss.",
      },
      {
        text: "Soft iron is an electrical insulator so zero eddy currents can ever be induced inside a solid block.",
        rationale: "Iron is a metallic conductor; laminations are still required to restrict eddy currents.",
      },
      {
        text: "Soft iron prevents magnetic flux from reversing direction so the secondary coil outputs steady DC.",
        rationale: "Changing flux is essential for induction; soft iron makes rapid flux reversal low-loss.",
      },
    ],
    workedNote:
      "A laminated soft-iron core with insulating layers increases resistance to reduce eddy current heating, soft iron lowers hysteresis loss, thick copper coils cut resistive heating, and a closed core minimises flux leakage.",
  },
  {
    slug: "tr-dc-failure-5",
    kind: "al-a2-transformer-losses-design",
    subtopic: "3.7.5",
    ncukCross: { topicId: "ncuk-ac4", subtopicId: "ncuk-ac4-6" },
    conceptId: "ac-generators-transformers",
    templateArchetype: "al-a2-transformer-losses-design",
    difficulty: "higher",
    questionStyle: "qualitative",
    scenarioSpec: TRANS_SPEC_DEFAULT,
    targetQuantityKey: "laminatedCoreAnchor",
    stem: "Under normal AC operation, why do eddy currents form in a transformer core at all, and how do laminations combat them?",
    correctPrefix: "Alternating core flux induces emf in the conductive iron itself, so ",
    distractors: [
      {
        text: "Steady DC magnetic flux induces constant eddy currents that laminations short-circuit directly to earth.",
        rationale: "Steady flux induces zero emf; laminations break loops with insulating varnish rather than short-circuiting.",
      },
      {
        text: "Eddy currents only occur in the copper windings, so laminating the iron core actually lowers copper wire resistance.",
        rationale: "Eddy currents circulate inside the conductive iron core.",
      },
      {
        text: "Laminations remove all alternating magnetic flux from the core so Faraday's law no longer acts in the iron.",
        rationale: "Alternating flux must remain strong in the core to link the secondary coil.",
      },
    ],
    workedNote:
      "Changing magnetic flux induces currents in the conducting core; thin iron laminations separated by insulating layers increase resistance to eddy current paths reducing thermal energy loss in the core.",
  },
  {
    slug: "tr-double-v-quarter-loss-6",
    kind: "al-a2-transformer-losses-design",
    subtopic: "3.7.5",
    ncukCross: { topicId: "ncuk-ac4", subtopicId: "ncuk-ac4-6" },
    conceptId: "ac-generators-transformers",
    templateArchetype: "al-a2-transformer-losses-design",
    difficulty: "higher",
    questionStyle: "qualitative",
    scenarioSpec: TRANS_SPEC_DEFAULT,
    targetQuantityKey: "highVoltageGridAnchor",
    stem: "A power station upgrades its step-up transformer to triple the overhead transmission voltage while delivering the same total electrical power along the same cables. Why do resistive cable losses drop by a factor of nine?",
    correctPrefix: "Because ",
    distractors: [
      {
        text: "Because tripling voltage divides cable resistance by nine while keeping line current unchanged.",
        rationale: "Cable resistance is unchanged; current drops by a factor of three.",
      },
      {
        text: "Because tripling voltage reduces current by a factor of nine and resistive loss scales linearly with current.",
        rationale: "Current drops by a factor of three, and P_loss = I²R scales with current squared.",
      },
      {
        text: "Because alternating current stops dissipating thermal energy once transmission voltage exceeds one hundred kilovolts.",
        rationale: "Resistive heating I²R never vanishes completely for finite cable resistance.",
      },
    ],
    workedNote:
      "Since I = P/V and P_loss = I²R, stepping up transmission voltage lowers cable current for the same power so resistive heating in power lines falls as current squared.",
  },

  // ---- 10. al-a2-oscilloscope-ac-rms (6 qual MCQs, 3.7.5 — A-Level only) ----
  {
    slug: "cro-timebase-off-ac-1",
    kind: "al-a2-oscilloscope-ac-rms",
    subtopic: "3.7.5",
    conceptId: "ac-generators-transformers",
    templateArchetype: "al-a2-oscilloscope-ac-rms",
    difficulty: "foundation",
    questionStyle: "experimental",
    scenarioSpec: CRO_SPEC_OFF,
    targetQuantityKey: "timeBaseOffAnchor",
    stem: "A sinusoidal alternating potential difference is displayed cleanly on a cathode-ray oscilloscope screen. What appears on the screen when the time-base control is switched OFF?",
    correctPrefix: "On the screen, ",
    distractors: [
      {
        text: "On the screen, switching off the time base collapses the alternating sinusoid into a stationary central dot at zero volts.",
        rationale: "A stationary dot occurs for DC with time-base OFF, whereas AC sweeps rapidly up and down.",
      },
      {
        text: "On the screen, switching off the time base turns the trace into a horizontal straight line across the middle.",
        rationale: "A horizontal line occurs when Y-input is zero and time-base is ON.",
      },
      {
        text: "On the screen, switching off the time base leaves a vertical line of height equal to only the RMS voltage.",
        rationale: "The vertical spot oscillates between +V₀ and −V₀, spanning the full peak-to-peak height V_pp.",
      },
    ],
    workedNote:
      "Without horizontal sweep, the spot moves vertically from +V₀ to −V₀: switching off the time base collapses an alternating sinusoid into a vertical central line of length equal to the peak-to-peak voltage.",
  },
  {
    slug: "cro-rms-definition-2",
    kind: "al-a2-oscilloscope-ac-rms",
    subtopic: "3.7.5",
    conceptId: "ac-generators-transformers",
    templateArchetype: "al-a2-oscilloscope-ac-rms",
    difficulty: "foundation",
    questionStyle: "definition",
    scenarioSpec: CRO_SPEC_SIN,
    targetQuantityKey: "rmsDefinitionAnchor",
    stem: "What is the exact physical definition of the root-mean-square (rms) value of an alternating potential difference?",
    correctPrefix: "The ",
    distractors: [
      {
        text: "The arithmetic mean of the alternating potential difference over one complete sinusoidal cycle.",
        rationale: "The arithmetic mean over a complete symmetric cycle is zero.",
      },
      {
        text: "The peak-to-peak potential difference divided by two across a pure resistor.",
        rationale: "V_pp / 2 gives the peak voltage V₀, not V_rms = V₀ / √2.",
      },
      {
        text: "The steady direct potential difference that produces half the peak current in a resistor.",
        rationale: "V_rms produces 1/√2 (≈ 70.7%) of peak current, corresponding to half the peak power.",
      },
    ],
    workedNote:
      "By definition, root mean square potential difference equals the steady direct potential difference that dissipates the same mean power in a given resistor.",
  },
  {
    slug: "cro-timebase-unc-3",
    kind: "al-a2-oscilloscope-ac-rms",
    subtopic: "3.7.5",
    conceptId: "ac-generators-transformers",
    templateArchetype: "al-a2-oscilloscope-ac-rms",
    difficulty: "standard",
    questionStyle: "experimental",
    scenarioSpec: CRO_SPEC_SIN,
    targetQuantityKey: "timeBaseUncertaintyAnchor",
    stem: "Ten narrow cycles of an AC signal crowd onto an oscilloscope screen. How should a student adjust the time-base setting to measure the period T more precisely?",
    correctPrefix: "Adjust the dial carefully because ",
    distractors: [
      {
        text: "Adjust the dial carefully because increasing the time-base setting stretches a single cycle across the entire width of the screen.",
        rationale: "Increasing ms div⁻¹ compresses more cycles per division rather than stretching one cycle.",
      },
      {
        text: "Adjust the dial carefully because switching off the time base lets you read the period directly off the vertical axis.",
        rationale: "Time-base OFF removes all time/frequency information from the display.",
      },
      {
        text: "Adjust the dial carefully because decreasing the Y-gain stretches the horizontal time axis across more divisions.",
        rationale: "Y-gain only scales vertical voltage amplitude, not horizontal time.",
      },
    ],
    workedNote:
      "Decreasing the time-base setting stretches the waveform horizontally so fewer cycles span the screen and percentage uncertainty in period decreases.",
  },
  {
    slug: "cro-power-comparison-4",
    kind: "al-a2-oscilloscope-ac-rms",
    subtopic: "3.7.5",
    conceptId: "ac-generators-transformers",
    templateArchetype: "al-a2-oscilloscope-ac-rms",
    difficulty: "standard",
    questionStyle: "qualitative",
    scenarioSpec: CRO_SPEC_SIN,
    targetQuantityKey: "rmsDefinitionAnchor",
    stem: "A filament lamp glows with identical steady brightness when powered by a 12 V DC battery or by an AC supply of peak voltage 17.0 V. Why do the two supplies deliver equal heating?",
    correctPrefix: "Because the AC supply's ",
    distractors: [
      {
        text: "Because alternating current reverses direction so half the energy cancels out, making peak voltage equal to DC voltage.",
        rationale: "Heating P = V²/R is positive on both half-cycles; mean power equals half peak power, so V_rms = V₀/√2.",
      },
      {
        text: "Because filament resistance doubles automatically whenever alternating current is applied.",
        rationale: "At identical brightness and temperature, filament resistance is the same.",
      },
      {
        text: "Because DC current heats only during positive intervals whereas AC heats continuously.",
        rationale: "DC heats continuously at constant rate V_DC²/R.",
      },
    ],
    workedNote:
      "Since 17.0 / √2 ≈ 12.0 V, root mean square potential difference equals the steady direct potential difference that dissipates the same mean power in a given resistor.",
  },
  {
    slug: "cro-ygain-peak-check-5",
    kind: "al-a2-oscilloscope-ac-rms",
    subtopic: "3.7.5",
    conceptId: "ac-generators-transformers",
    templateArchetype: "al-a2-oscilloscope-ac-rms",
    difficulty: "higher",
    questionStyle: "experimental",
    scenarioSpec: CRO_SPEC_OFF,
    targetQuantityKey: "timeBaseOffAnchor",
    stem: "To verify the peak amplitude of a noisy mains-frequency signal without triggering jitter, a technician turns the oscilloscope time-base knob to OFF. How should peak voltage V₀ be obtained from the resulting display?",
    correctPrefix: "Measure half the vertical trace height because ",
    distractors: [
      {
        text: "Measure the full length of the vertical trace directly because the trace runs only from zero to +V₀.",
        rationale: "AC swings symmetrically from −V₀ to +V₀, so total length is V_pp = 2V₀.",
      },
      {
        text: "Measure the distance of the stationary dot from the centre horizontal graticule line.",
        rationale: "Only a steady DC signal gives a stationary dot with time-base OFF.",
      },
      {
        text: "Divide the full vertical trace length by root two to obtain peak voltage V₀ directly.",
        rationale: "V_pp / √2 equals 2 V_rms, neither V₀ nor V_rms.",
      },
    ],
    workedNote:
      "Switching off the time base collapses an alternating sinusoid into a vertical central line of length equal to the peak-to-peak voltage, so V₀ = V_pp / 2.",
  },
  {
    slug: "cro-higher-precision-6",
    kind: "al-a2-oscilloscope-ac-rms",
    subtopic: "3.7.5",
    conceptId: "ac-generators-transformers",
    templateArchetype: "al-a2-oscilloscope-ac-rms",
    difficulty: "standard",
    questionStyle: "experimental",
    scenarioSpec: CRO_SPEC_SIN,
    targetQuantityKey: "timeBaseUncertaintyAnchor",
    stem: "Why does measuring across one or two wide cycles on a zoomed-in time-base give lower percentage uncertainty in frequency than measuring one narrow cycle on a zoomed-out time-base?",
    correctPrefix: "Because fixed graticule reading uncertainty spans fewer milliseconds when ",
    distractors: [
      {
        text: "Because changing the time-base setting physically increases the signal generator's frequency.",
        rationale: "Oscilloscope dials alter display scaling only, not the input signal.",
      },
      {
        text: "Because increasing ms div⁻¹ expands the wave horizontally so the period covers more divisions.",
        rationale: "Increasing ms div⁻¹ shrinks each cycle horizontally; decreasing ms div⁻¹ stretches it.",
      },
      {
        text: "Because absolute graticule uncertainty becomes zero when fewer than three cycles appear.",
        rationale: "Reading uncertainty (±0.1–0.2 div) remains non-zero; only percentage uncertainty shrinks.",
      },
    ],
    workedNote:
      "Decreasing the time-base setting stretches the waveform horizontally so fewer cycles span the screen and percentage uncertainty in period decreases.",
  },

  // ---- 11. al-a2-electron-diffraction-vs-rutherford (6 qual MCQs, 3.8) ----
  {
    slug: "ediff-why-better-alpha-1",
    kind: "al-a2-electron-diffraction-vs-rutherford",
    subtopic: "3.8",
    conceptId: "rutherford-scattering-nuclear-radius",
    templateArchetype: "al-a2-electron-diffraction-vs-rutherford",
    difficulty: "standard",
    questionStyle: "qualitative",
    scenarioSpec: EDIFF_SPEC_DEFAULT,
    targetQuantityKey: "nuclearRadiusAnchor",
    stem: "Why does high-energy electron diffraction provide a far more accurate determination of nuclear radius than Rutherford alpha-particle closest approach?",
    correctPrefix: "Because ",
    distractors: [
      {
        text: "Because electrons experience a much stronger strong nuclear force than alpha particles, forcing them to bounce cleanly off the nuclear surface.",
        rationale: "Electrons are leptons and do NOT feel the strong nuclear force at all.",
      },
      {
        text: "Because electron diffraction produces exact zero-intensity dark fringes identical to optical single-slit diffraction.",
        rationale: "Nuclear electron diffraction shows a non-zero first minimum superimposed on decreasing scattering intensity.",
      },
      {
        text: "Because alpha particles are massless leptons whose closest approach underestimates the true nuclear radius.",
        rationale: "Alpha particles are composite hadrons (helium-4 nuclei) and r_min overestimates (upper bound) the nuclear radius.",
      },
    ],
    workedNote:
      "High-energy electrons are leptons unaffected by the strong nuclear force and diffract to a non-zero first minimum giving radius directly, whereas alpha closest approach only gives an energy-dependent upper bound.",
  },
  {
    slug: "ediff-constant-density-2",
    kind: "al-a2-electron-diffraction-vs-rutherford",
    subtopic: "3.8",
    ncukCross: { topicId: "ncuk-ac7", subtopicId: "ncuk-ac7-1" },
    conceptId: "rutherford-scattering-nuclear-radius",
    templateArchetype: "al-a2-electron-diffraction-vs-rutherford",
    difficulty: "standard",
    questionStyle: "qualitative",
    scenarioSpec: EDIFF_SPEC_DEFAULT,
    targetQuantityKey: "constantDensityAnchor",
    stem: "Electron diffraction experiments across many isotopes establish the empirical law R = R₀ A^(1/3). What does this cube-root scaling imply about nuclear matter density?",
    correctPrefix: "Since V = (4/3)πR³ = (4/3)πR₀³A, ",
    distractors: [
      {
        text: "Since V = (4/3)πR³ = (4/3)πR₀³A, heavier nuclei such as uranium are vastly denser than light nuclei such as carbon.",
        rationale: "Mass and volume both scale linearly with A, so A cancels in ρ = m/V.",
      },
      {
        text: "Since V = (4/3)πR³ = (4/3)πR₀³A, nuclear density decreases inversely with nucleon number as nuclei grow larger.",
        rationale: "Wrongly treats nuclear mass as constant while volume grows with A.",
      },
      {
        text: "Since V = (4/3)πR³ = (4/3)πR₀³A, nucleons are widely spaced with mostly empty vacuum inside heavy nuclei.",
        rationale: "Constant nuclear density (~2.3 × 10¹⁷ kg m⁻³) shows nucleons are tightly packed at nearly uniform spacing.",
      },
    ],
    workedNote:
      "Nuclear volume is proportional to nucleon number so nuclear density is constant and independent of mass number.",
  },
  {
    slug: "ediff-nonzero-min-3",
    kind: "al-a2-electron-diffraction-vs-rutherford",
    subtopic: "3.8",
    conceptId: "rutherford-scattering-nuclear-radius",
    templateArchetype: "al-a2-electron-diffraction-vs-rutherford",
    difficulty: "higher",
    questionStyle: "qualitative",
    scenarioSpec: EDIFF_SPEC_DEFAULT,
    targetQuantityKey: "nuclearRadiusAnchor",
    stem: "When plotting scattered electron intensity against scattering angle θ from a thin carbon target, why does the curve dip to a non-zero first minimum rather than touching zero, and why are electrons chosen over alpha particles?",
    correctPrefix: "Scattering overlays diffraction so the dip stays above zero, and ",
    distractors: [
      {
        text: "The intensity touches zero strictly at θ = 90° because electrons undergo strong-force capture inside the nucleus.",
        rationale: "Electrons do not interact via the strong force and the first minimum is non-zero at sin θ ≈ 0.61λ/R.",
      },
      {
        text: "Electrons are chosen solely because they carry positive charge and match the alpha particle's mass.",
        rationale: "Electrons are negatively charged leptons ~7300 times lighter than alpha particles.",
      },
      {
        text: "Alpha particles give exact nuclear radii while electrons only provide rough upper bounds.",
        rationale: "Reverses the relative accuracy of the two methods.",
      },
    ],
    workedNote:
      "High-energy electrons are leptons unaffected by the strong nuclear force and diffract to a non-zero first minimum giving radius directly, whereas alpha closest approach only gives an energy-dependent upper bound.",
  },
  {
    slug: "ediff-high-energy-lambda-4",
    kind: "al-a2-electron-diffraction-vs-rutherford",
    subtopic: "3.8",
    conceptId: "rutherford-scattering-nuclear-radius",
    templateArchetype: "al-a2-electron-diffraction-vs-rutherford",
    difficulty: "standard",
    questionStyle: "qualitative",
    scenarioSpec: EDIFF_SPEC_DEFAULT,
    targetQuantityKey: "nuclearRadiusAnchor",
    stem: "Why must electrons be accelerated to several hundred MeV (so λ ~ 10⁻¹⁵ m) to measure nuclear radii by diffraction, instead of using low-energy keV electrons?",
    correctPrefix: "Diffraction requires de Broglie wavelength comparable to nuclear diameter (~10⁻¹⁵ m), and ",
    distractors: [
      {
        text: "Low-energy electrons are hadrons that get absorbed by the strong nuclear force before reaching the detector.",
        rationale: "Electrons are leptons at all energies and never feel the strong nuclear force.",
      },
      {
        text: "High-energy electrons have much longer de Broglie wavelengths so sin θ stays larger than one.",
        rationale: "Higher momentum gives a SHORTER de Broglie wavelength λ = h/p, and sin θ must be < 1.",
      },
      {
        text: "Low-energy electrons move faster than light and bypass the target nuclei completely.",
        rationale: "No massive particle exceeds c; low-energy electrons simply have λ >> R, giving no observable nuclear diffraction minimum.",
      },
    ],
    workedNote:
      "Appreciable diffraction needs λ ~ R (~10⁻¹⁵ m), and high-energy electrons are leptons unaffected by the strong nuclear force and diffract to a non-zero first minimum giving radius directly, whereas alpha closest approach only gives an energy-dependent upper bound.",
  },
  {
    slug: "ediff-alpha-recoil-limit-5",
    kind: "al-a2-electron-diffraction-vs-rutherford",
    subtopic: "3.8",
    conceptId: "rutherford-scattering-nuclear-radius",
    templateArchetype: "al-a2-electron-diffraction-vs-rutherford",
    difficulty: "higher",
    questionStyle: "qualitative",
    scenarioSpec: EDIFF_SPEC_DEFAULT,
    targetQuantityKey: "nuclearRadiusAnchor",
    stem: "Even if the kinetic energy of incident alpha particles in Rutherford scattering is increased substantially, why can the closest-approach formula Eₖ = Q₁Q₂/(4πε₀rₘᵢₙ) still fail to measure the exact nuclear radius?",
    correctPrefix: "At high alpha energies the strong nuclear force alters scattering, whereas ",
    distractors: [
      {
        text: "At high alpha energies electrostatic repulsion turns attractive so rₘᵢₙ drops to zero.",
        rationale: "Electrostatic force between two positive nuclei always remains repulsive.",
      },
      {
        text: "At high alpha energies the de Broglie wavelength of the alpha particle grows larger than the gold atom.",
        rationale: "Higher energy shrinks de Broglie wavelength.",
      },
      {
        text: "At high alpha energies Coulomb's constant changes value inside the foil.",
        rationale: "Fundamental constants do not change; strong-force onset and nuclear recoil invalidate pure Coulomb closest approach.",
      },
    ],
    workedNote:
      "High-energy electrons are leptons unaffected by the strong nuclear force and diffract to a non-zero first minimum giving radius directly, whereas alpha closest approach only gives an energy-dependent upper bound.",
  },
  {
    slug: "ediff-carbon-vs-gold-density-6",
    kind: "al-a2-electron-diffraction-vs-rutherford",
    subtopic: "3.8",
    ncukCross: { topicId: "ncuk-ac7", subtopicId: "ncuk-ac7-1" },
    conceptId: "rutherford-scattering-nuclear-radius",
    templateArchetype: "al-a2-electron-diffraction-vs-rutherford",
    difficulty: "foundation",
    questionStyle: "qualitative",
    scenarioSpec: EDIFF_SPEC_DEFAULT,
    targetQuantityKey: "constantDensityAnchor",
    stem: "How does the density of a carbon-12 nucleus compare with the density of a gold-197 nucleus?",
    correctPrefix: "They are essentially identical because ",
    distractors: [
      {
        text: "Gold-197 is about sixteen times denser because it packs sixteen times as many nucleons into the same volume.",
        rationale: "Nuclear volume scales proportionally to A, so gold's volume is also ~16 times larger.",
      },
      {
        text: "Carbon-12 is denser because light nuclei contain no neutrons to dilute proton mass.",
        rationale: "Carbon-12 has 6 neutrons, and neutron and proton masses are nearly equal.",
      },
      {
        text: "Gold-197 is less dense because extra protons force its radius to grow linearly with nucleon number A.",
        rationale: "Radius grows as A^(1/3), not linearly with A.",
      },
    ],
    workedNote:
      "Since R = R₀ A^(1/3), nuclear volume is proportional to nucleon number so nuclear density is constant and independent of mass number.",
  },

  // ---- 12. al-a2-nz-nuclear-stability-curve (6 qual MCQs, 3.8) ----
  {
    slug: "nz-curve-bend-1",
    kind: "al-a2-nz-nuclear-stability-curve",
    subtopic: "3.8",
    ncukCross: { topicId: "ncuk-ac7", subtopicId: "ncuk-ac7-1" },
    conceptId: "radioactive-decay-half-life",
    templateArchetype: "al-a2-nz-nuclear-stability-curve",
    difficulty: "standard",
    questionStyle: "qualitative",
    scenarioSpec: NZ_SPEC_BMINUS,
    targetQuantityKey: "stabilityAnchor",
    stem: "On the N–Z nuclear stability chart, stable nuclei follow N = Z up to about Z = 20, then bend increasingly upward toward N > Z. Why do heavier stable nuclei need extra neutrons?",
    correctPrefix: "Because ",
    distractors: [
      {
        text: "Because protons repel only their immediate neighbours whereas the strong nuclear force acts over infinite range.",
        rationale: "Reverses the ranges of the electrostatic and strong nuclear forces.",
      },
      {
        text: "Because neutrons carry negative electric charge that directly neutralises the positive protons inside the nucleus.",
        rationale: "Neutrons are electrically neutral; they add strong-force attraction without electrostatic repulsion.",
      },
      {
        text: "Because gravitational attraction between neutrons overtakes electrostatic repulsion above Z = 20.",
        rationale: "Gravity is ~10³⁶ times weaker than electrostatic repulsion inside a nucleus.",
      },
    ],
    workedNote:
      "Above proton number twenty, long-range electrostatic repulsion between all protons grows faster than short-range strong nuclear attraction requiring a higher N/Z ratio.",
  },
  {
    slug: "nz-fission-frag-2",
    kind: "al-a2-nz-nuclear-stability-curve",
    subtopic: "3.8",
    conceptId: "radioactive-decay-half-life",
    templateArchetype: "al-a2-nz-nuclear-stability-curve",
    difficulty: "higher",
    questionStyle: "qualitative",
    scenarioSpec: NZ_SPEC_FISS,
    targetQuantityKey: "decayModeText",
    stem: "When uranium-235 undergoes thermal fission into two medium-mass daughter nuclei, where do these fission fragments lie on the N–Z stability chart and how do they stabilise?",
    correctPrefix: "Lying above the stability belt, ",
    distractors: [
      {
        text: "Lying below the stability belt, proton-rich fission fragments undergo beta-plus emission to raise N/Z.",
        rationale: "U-235 has N/Z ≈ 1.55 whereas medium-mass stable nuclei need N/Z ≈ 1.2–1.3, so fragments lie ABOVE the belt.",
      },
      {
        text: "Lying above the stability belt, fission fragments stabilise solely by emitting gamma photons without changing Z or N.",
        rationale: "Gamma decay leaves both N and Z unchanged and cannot move a nucleus onto the stability belt.",
      },
      {
        text: "Lying on the N = Z line, fission fragments are immediately stable and non-radioactive.",
        rationale: "Fission fragments are intensely radioactive high-level waste precisely because their N/Z ratio is too high.",
      },
    ],
    workedNote:
      "Because heavy parents have higher N/Z than medium-mass stable nuclei, neutron-rich fission fragments have a high N/Z ratio and undergo beta-minus decay.",
  },
  {
    slug: "nz-strong-force-range-3",
    kind: "al-a2-nz-nuclear-stability-curve",
    subtopic: "3.8",
    ncukCross: { topicId: "ncuk-ac7", subtopicId: "ncuk-ac7-1" },
    conceptId: "rutherford-scattering-nuclear-radius",
    templateArchetype: "al-a2-nz-nuclear-stability-curve",
    difficulty: "foundation",
    questionStyle: "definition",
    scenarioSpec: NZ_SPEC_ALPHA,
    targetQuantityKey: "strongForceAnchor",
    stem: "How does the strong nuclear force between two nucleons vary with their centre-to-centre separation?",
    correctPrefix: "The ",
    distractors: [
      {
        text: "The strong nuclear force is always attractive down to zero separation and falls as inverse distance squared to infinity.",
        rationale: "Without short-range repulsion (< 0.5 fm) nuclei would collapse to a point, and strong force vanishes beyond ~3 fm.",
      },
      {
        text: "The strong nuclear force is repulsive above three femtometres and attractive only between protons.",
        rationale: "Reverses sign with range and forgets that the strong force acts equally on protons and neutrons.",
      },
      {
        text: "The strong nuclear force acts over atomic radii of order ten to the minus ten metres to bind orbital electrons.",
        rationale: "Electrons are leptons unaffected by the strong nuclear force.",
      },
    ],
    workedNote:
      "The strong nuclear force is attractive up to about three femtometres and becomes strongly repulsive below half a femtometre.",
  },
  {
    slug: "nz-alpha-heavy-4",
    kind: "al-a2-nz-nuclear-stability-curve",
    subtopic: "3.8",
    ncukCross: { topicId: "ncuk-ac7", subtopicId: "ncuk-ac7-2" },
    conceptId: "radioactive-decay-half-life",
    templateArchetype: "al-a2-nz-nuclear-stability-curve",
    difficulty: "foundation",
    questionStyle: "qualitative",
    scenarioSpec: NZ_SPEC_ALPHA,
    targetQuantityKey: "decayModeText",
    stem: "Very heavy nuclei with proton number Z > 82 are too massive for the short-range strong force to hold stably together. Which decay mode moves such a nucleus diagonally down and left on the N–Z chart?",
    correctPrefix: "Heavy nuclei undergo ",
    distractors: [
      {
        text: "Heavy nuclei undergo beta-minus emission moving horizontally left on the N–Z chart.",
        rationale: "Beta-minus moves down-right (ΔZ = +1, ΔN = −1), not down-left.",
      },
      {
        text: "Heavy nuclei undergo beta-plus emission reducing nucleon number A by four.",
        rationale: "Beta-plus leaves nucleon number A unchanged.",
      },
      {
        text: "Heavy nuclei undergo alpha emission increasing proton number by two and decreasing neutron number by two.",
        rationale: "Alpha emission removes two protons and two neutrons (ΔZ = −2, ΔN = −2).",
      },
    ],
    workedNote:
      "Heavy nuclei above Z = 82 undergo alpha emission reducing both proton number and neutron number by two.",
  },
  {
    slug: "nz-beta-minus-vector-5",
    kind: "al-a2-nz-nuclear-stability-curve",
    subtopic: "3.8",
    ncukCross: { topicId: "ncuk-ac7", subtopicId: "ncuk-ac7-2" },
    conceptId: "radioactive-decay-half-life",
    templateArchetype: "al-a2-nz-nuclear-stability-curve",
    difficulty: "standard",
    questionStyle: "qualitative",
    scenarioSpec: NZ_SPEC_BMINUS,
    targetQuantityKey: "decayModeText",
    stem: "An unstable isotope X lies directly above the stability belt at moderate Z. Which nuclear transition moves X closer to the line of stability?",
    correctPrefix: "It undergoes ",
    distractors: [
      {
        text: "It undergoes beta-plus emission converting a proton into a neutron to increase the N/Z ratio even further.",
        rationale: "Moving further above the belt pushes the nuclide away from stability.",
      },
      {
        text: "It undergoes alpha emission even though its proton number is far below eighty-two.",
        rationale: "Nuclides above the belt at low/medium Z are neutron-rich and decay via β⁻ rather than α.",
      },
      {
        text: "It undergoes electron capture to add another neutron and reduce proton number by one.",
        rationale: "Electron capture serves proton-rich nuclei below the belt, not neutron-rich nuclei above it.",
      },
    ],
    workedNote:
      "Nuclei above the belt have a high N/Z ratio and undergo beta-minus emission converting a neutron into a proton to lower the high N/Z ratio.",
  },
  {
    slug: "nz-beta-plus-vector-6",
    kind: "al-a2-nz-nuclear-stability-curve",
    subtopic: "3.8",
    ncukCross: { topicId: "ncuk-ac7", subtopicId: "ncuk-ac7-2" },
    conceptId: "radioactive-decay-half-life",
    templateArchetype: "al-a2-nz-nuclear-stability-curve",
    difficulty: "standard",
    questionStyle: "qualitative",
    scenarioSpec: NZ_SPEC_BPLUS,
    targetQuantityKey: "decayModeText",
    stem: "An artificially produced proton-rich medical isotope lies below the N–Z stability belt. Which decay transition moves it up and to the left toward stability?",
    correctPrefix: "It undergoes ",
    distractors: [
      {
        text: "It undergoes beta-minus emission converting a neutron into a proton to decrease N/Z further.",
        rationale: "Beta-minus moves down-right away from stability for proton-rich nuclides.",
      },
      {
        text: "It undergoes neutron emission to lower its neutron number while holding Z constant.",
        rationale: "Proton-rich nuclides already have too low an N/Z ratio.",
      },
      {
        text: "It undergoes gamma emission which increases N by one and decreases Z by one.",
        rationale: "Gamma emission changes nuclear excitation energy only, never N or Z.",
      },
    ],
    workedNote:
      "Proton-rich nuclei below the belt undergo beta-plus emission or electron capture converting a proton into a neutron to increase the N/Z ratio.",
  },

  // ---- 13. al-a2-thermal-nuclear-reactor-lor (6 qual MCQs, 3.8) ----
  {
    slug: "rx-moderator-role-1",
    kind: "al-a2-thermal-nuclear-reactor-lor",
    subtopic: "3.8",
    ncukCross: { topicId: "ncuk-ac7", subtopicId: "ncuk-ac7-3" },
    conceptId: "nuclear-fission-fusion",
    templateArchetype: "al-a2-thermal-nuclear-reactor-lor",
    difficulty: "foundation",
    questionStyle: "qualitative",
    scenarioSpec: REACTOR_SPEC_GRAPHITE,
    targetQuantityKey: "moderatorAnchor",
    stem: "What is the primary physical function of the graphite or water moderator inside a thermal nuclear fission reactor?",
    correctPrefix: "The ",
    distractors: [
      {
        text: "The moderator absorbs excess fast neutrons to shut down the chain reaction safely.",
        rationale: "Major AQA mark-scheme trap: control rods absorb neutrons, whereas the moderator must NOT absorb neutrons!",
      },
      {
        text: "The moderator accelerates slow neutrons to relativistic speeds so they split uranium-238 nuclei.",
        rationale: "Thermal reactors require slowing fast fission neutrons down to thermal speeds for U-235.",
      },
      {
        text: "The moderator uses heavy lead nuclei so neutrons bounce off elastically with maximum kinetic energy loss.",
        rationale: "Elastic collision energy transfer is maximal when moderator nucleon mass is close to neutron mass (low A), not heavy lead.",
      },
    ],
    workedNote:
      "The moderator slows fast neutrons to thermal speeds via elastic collisions with low-mass nuclei so uranium-235 fission probability increases.",
  },
  {
    slug: "rx-control-rods-2",
    kind: "al-a2-thermal-nuclear-reactor-lor",
    subtopic: "3.8",
    ncukCross: { topicId: "ncuk-ac7", subtopicId: "ncuk-ac7-3" },
    conceptId: "nuclear-fission-fusion",
    templateArchetype: "al-a2-thermal-nuclear-reactor-lor",
    difficulty: "foundation",
    questionStyle: "qualitative",
    scenarioSpec: REACTOR_SPEC_GRAPHITE,
    targetQuantityKey: "controlRodsAnchor",
    stem: "How do operators regulate power output and prevent a runaway chain reaction in a thermal nuclear reactor?",
    correctPrefix: "Raising or lowering ",
    distractors: [
      {
        text: "Raising or lowering steel control rods speeds up neutrons elastically to prevent fission.",
        rationale: "Control rods absorb neutrons rather than moderating them, and use high-absorption boron or cadmium.",
      },
      {
        text: "Raising or lowering graphite control rods cools the uranium fuel rods by direct thermal conduction.",
        rationale: "Graphite is a moderator and coolant extracts heat; boron/cadmium control rods absorb neutrons.",
      },
      {
        text: "Raising or lowering uranium control rods adds extra fuel whenever power rises too rapidly.",
        rationale: "Fuel rods supply fissile material; control rods absorb neutrons.",
      },
    ],
    workedNote:
      "Boron or cadmium control rods absorb neutrons to maintain a steady critical chain reaction.",
  },
  {
    slug: "rx-waste-lifecycle-3",
    kind: "al-a2-thermal-nuclear-reactor-lor",
    subtopic: "3.8",
    conceptId: "nuclear-fission-fusion",
    templateArchetype: "al-a2-thermal-nuclear-reactor-lor",
    difficulty: "standard",
    questionStyle: "qualitative",
    scenarioSpec: REACTOR_SPEC_WATER,
    targetQuantityKey: "wasteLifecycleAnchor",
    stem: "Spent nuclear fuel rods contain intensely hot, long-lived radioactive fission products (high-level waste). Which sequence describes the safe multi-stage management of high-level radioactive waste?",
    correctPrefix: "Safe disposal requires that ",
    distractors: [
      {
        text: "Safe disposal requires immediately burying uncooled fuel rods in shallow landfill trenches once removed from the core.",
        rationale: "Decay heat and intense radiation require remote cooling ponds, vitrification, and deep geologically stable storage.",
      },
      {
        text: "Safe disposal requires venting liquid fission products into river water until their activity falls to background level.",
        rationale: "High-level waste must be strictly contained and isolated from the biosphere.",
      },
      {
        text: "Safe disposal requires neutralising radioactivity chemically with acid before sealing inside plastic drums.",
        rationale: "Chemical reactions cannot alter nuclear decay rates or half-lives.",
      },
    ],
    workedNote:
      "High-level radioactive fission fragments are handled remotely in cooling ponds, vitrified in glass inside steel canisters, and stored in deep geologically stable underground repositories.",
  },
  {
    slug: "rx-why-low-mass-mod-4",
    kind: "al-a2-thermal-nuclear-reactor-lor",
    subtopic: "3.8",
    ncukCross: { topicId: "ncuk-ac7", subtopicId: "ncuk-ac7-3" },
    conceptId: "nuclear-fission-fusion",
    templateArchetype: "al-a2-thermal-nuclear-reactor-lor",
    difficulty: "higher",
    questionStyle: "qualitative",
    scenarioSpec: REACTOR_SPEC_WATER,
    targetQuantityKey: "moderatorAnchor",
    stem: "Why are low-nucleon-number materials such as water or graphite far more effective moderators than dense metals like lead?",
    correctPrefix: "By conservation of momentum and kinetic energy, a ",
    distractors: [
      {
        text: "By conservation of momentum and kinetic energy, heavy lead nuclei absorb neutrons rapidly so they bounce back faster.",
        rationale: "Against a heavy nucleus, a neutron rebounds elastically with almost all its initial kinetic energy intact.",
      },
      {
        text: "By conservation of momentum and kinetic energy, low-mass nuclei capture every fast neutron permanently in a single collision.",
        rationale: "A good moderator must scatter neutrons elastically with low absorption cross-section.",
      },
      {
        text: "By conservation of momentum and kinetic energy, water molecules repel neutrons electrostatically to slow them down.",
        rationale: "Neutrons are uncharged and experience zero electrostatic repulsion.",
      },
    ],
    workedNote:
      "Closer mass match transfers far more KE per elastic collision: the moderator slows fast neutrons to thermal speeds via elastic collisions with low-mass nuclei so uranium-235 fission probability increases.",
  },
  {
    slug: "rx-emergency-scram-5",
    kind: "al-a2-thermal-nuclear-reactor-lor",
    subtopic: "3.8",
    ncukCross: { topicId: "ncuk-ac7", subtopicId: "ncuk-ac7-3" },
    conceptId: "nuclear-fission-fusion",
    templateArchetype: "al-a2-thermal-nuclear-reactor-lor",
    difficulty: "standard",
    questionStyle: "qualitative",
    scenarioSpec: REACTOR_SPEC_GRAPHITE,
    targetQuantityKey: "controlRodsAnchor",
    stem: "If power sensors detect that the average number of neutrons per fission causing another fission has drifted above one, how does the emergency shutdown system halt the chain reaction?",
    correctPrefix: "Fully inserting ",
    distractors: [
      {
        text: "Fully inserting extra uranium fuel rods dilutes the neutron flux and stops fission immediately.",
        rationale: "Adding fissile fuel increases reactivity rather than shutting down the core.",
      },
      {
        text: "Fully inserting concrete blocks into the cooling water slows down the steam turbine directly.",
        rationale: "Concrete is the external biological shield; shutdown acts directly on core neutron population.",
      },
      {
        text: "Fully inserting graphite rods speeds up thermal neutrons so they cannot escape the vessel.",
        rationale: "Graphite moderates (slows) neutrons to promote fission rather than absorbing them.",
      },
    ],
    workedNote:
      "Fully inserting boron or cadmium control rods absorb neutrons to maintain a steady critical chain reaction (and drop k below 1 for shutdown).",
  },
  {
    slug: "rx-cooling-pond-dual-role-6",
    kind: "al-a2-thermal-nuclear-reactor-lor",
    subtopic: "3.8",
    conceptId: "nuclear-fission-fusion",
    templateArchetype: "al-a2-thermal-nuclear-reactor-lor",
    difficulty: "higher",
    questionStyle: "qualitative",
    scenarioSpec: REACTOR_SPEC_WATER,
    targetQuantityKey: "wasteLifecycleAnchor",
    stem: "Why are newly discharged spent fuel rods stored underwater in deep cooling ponds for several years before vitrification and long-term disposal?",
    correctPrefix: "Water provides both continuous cooling for decay heat and radiation shielding before ",
    distractors: [
      {
        text: "Water dissolves the uranium fuel chemically so all long-lived isotopes turn into stable lead within days.",
        rationale: "Water does not change nuclear half-lives; short-lived isotopes decay naturally while long-lived waste still requires vitrification.",
      },
      {
        text: "Water freezes the fission fragments below zero kelvin to halt beta-minus decay permanently.",
        rationale: "Radioactive decay is spontaneous and completely independent of temperature.",
      },
      {
        text: "Water converts high-level waste into low-level waste ready for open-air disposal within one week.",
        rationale: "High-level waste remains dangerous for thousands of years and requires deep geologically stable storage.",
      },
    ],
    workedNote:
      "High-level radioactive fission fragments are handled remotely in cooling ponds, vitrified in glass inside steel canisters, and stored in deep geologically stable underground repositories.",
  },
];

/* ========================================================================== */
/*  BANK 2: 46 QUANTITATIVE / GRAPH / EXPERIMENTAL MCQs                       */
/* ========================================================================== */

interface QuantMcqSpec {
  readonly slug: string;
  readonly kind: AlevelCoreA2ScenarioKind;
  readonly subtopic: A2SubtopicKey;
  readonly ncukCross?: { topicId: string; subtopicId: string };
  readonly conceptId: string;
  readonly templateArchetype: string;
  readonly difficulty: QuestionDifficulty;
  readonly questionStyle: QuestionStyleTag;
  readonly scenarioSpec: Record<string, unknown>;
  readonly targetQuantityKey: string;
  readonly hiddenQuantities: string[];
  readonly unit?: string;
  readonly requiredGivens: RequiredGivenSpec[];
  readonly stem: string;
  readonly buildDistractors: (
    q: Record<string, number | string | boolean>,
  ) => NumericDistractor[];
  readonly buildWorked: (
    q: Record<string, number | string | boolean>,
  ) => { worked: string; markCriterion: string };
}

const QUANT_MCQ_SPECS: readonly QuantMcqSpec[] = [
  // --- 3.6.1 Damping & Resonance (8 quant MCQs) ---
  {
    slug: "q-res-amp-f0-1",
    kind: "al-a2-damping-resonance-curves",
    subtopic: "3.6.1",
    ncukCross: { topicId: "ncuk-ac6", subtopicId: "ncuk-ac6-1" },
    conceptId: "forced-oscillations-resonance",
    templateArchetype: "al-a2-damping-resonance-curves",
    difficulty: "standard",
    questionStyle: "calculation",
    scenarioSpec: {
      kind: "al-a2-damping-resonance-curves",
      naturalFreqHz: 4.5,
      staticAmplitudeMm: 9.0,
      zetaLight: 0.15,
      zetaModerate: 0.3,
      zetaHeavy: 0.6,
      showPhaseSubplot: false,
    },
    targetQuantityKey: "ampAtF0LightMm",
    hiddenQuantities: ["ampAtF0LightMm", "peakAmpLightMm"],
    unit: "mm",
    requiredGivens: [
      { name: "staticAmplitudeMm", value: 9.0, unit: "mm", source: "stem" },
      { name: "zetaLight", value: 0.15, source: "stem" },
      { name: "naturalFreqHz", value: 4.5, unit: "Hz", source: "either" },
    ],
    stem: "A lightly damped oscillator of natural frequency 4.5 Hz has static deflection amplitude A₀ = 9.0 mm and damping ratio ζ = 0.15. Using A(f₀) = A₀ / (2ζ), calculate its driven amplitude when forced at f = 4.5 Hz.",
    buildDistractors: (q) => {
      const ans = q.ampAtF0LightMm as number;
      return [
        { value: ans * 2, rationale: "Omits the factor of 2 in the denominator A₀ / (2ζ)." },
        { value: 9.0 * 0.15, rationale: "Multiplies A₀ by ζ instead of dividing by 2ζ." },
        { value: ans / 2, rationale: "Divides by 4ζ instead of 2ζ." },
      ];
    },
    buildWorked: (q) => {
      const ans = q.ampAtF0LightMm as number;
      return {
        worked: `At f = f₀, A(f₀) = A₀ / (2ζ) = 9.0 / (2 × 0.15) = ${fmt3(ans, "mm")}.`,
        markCriterion: `Correct amplitude at natural frequency A = ${fmt3(ans, "mm")}.`,
      };
    },
  },
  {
    slug: "q-res-amp-f0-2",
    kind: "al-a2-damping-resonance-curves",
    subtopic: "3.6.1",
    ncukCross: { topicId: "ncuk-ac6", subtopicId: "ncuk-ac6-1" },
    conceptId: "forced-oscillations-resonance",
    templateArchetype: "al-a2-damping-resonance-curves",
    difficulty: "standard",
    questionStyle: "calculation",
    scenarioSpec: {
      kind: "al-a2-damping-resonance-curves",
      naturalFreqHz: 6.4,
      staticAmplitudeMm: 14.0,
      zetaLight: 0.1,
      zetaModerate: 0.35,
      zetaHeavy: 0.65,
      showPhaseSubplot: true,
    },
    targetQuantityKey: "ampAtF0ModerateMm",
    hiddenQuantities: ["ampAtF0ModerateMm"],
    unit: "mm",
    requiredGivens: [
      { name: "staticAmplitudeMm", value: 14.0, unit: "mm", source: "stem" },
      { name: "zetaModerate", value: 0.35, source: "stem" },
      { name: "naturalFreqHz", value: 6.4, unit: "Hz", source: "either" },
    ],
    stem: "A moderately damped vibrator (f₀ = 6.4 Hz) is driven at its natural frequency with zero-frequency deflection A₀ = 14.0 mm and damping ratio ζ = 0.35. What is its steady-state amplitude A(f₀) = A₀ / (2ζ)?",
    buildDistractors: (q) => {
      const ans = q.ampAtF0ModerateMm as number;
      return [
        { value: ans * 2, rationale: "Computes A₀ / ζ, dropping the factor of two." },
        { value: 14.0 / (2 * 0.1), rationale: "Uses the light damping ratio instead of moderate damping." },
        { value: 14.0 * 0.35, rationale: "Multiplies static deflection by damping ratio." },
      ];
    },
    buildWorked: (q) => {
      const ans = q.ampAtF0ModerateMm as number;
      return {
        worked: `Substituting into A(f₀) = A₀ / (2ζ) gives 14.0 / (2 × 0.35) = ${fmt3(ans, "mm")}.`,
        markCriterion: `Evaluates A(f₀) = ${fmt3(ans, "mm")}.`,
      };
    },
  },
  {
    slug: "q-res-peak-shift-3",
    kind: "al-a2-damping-resonance-curves",
    subtopic: "3.6.1",
    ncukCross: { topicId: "ncuk-ac6", subtopicId: "ncuk-ac6-1" },
    conceptId: "forced-oscillations-resonance",
    templateArchetype: "al-a2-damping-resonance-curves",
    difficulty: "higher",
    questionStyle: "calculation",
    scenarioSpec: {
      kind: "al-a2-damping-resonance-curves",
      naturalFreqHz: 10.0,
      staticAmplitudeMm: 6.0,
      zetaLight: 0.12,
      zetaModerate: 0.4,
      zetaHeavy: 0.65,
      showPhaseSubplot: false,
    },
    targetQuantityKey: "peakFreqModerate",
    hiddenQuantities: ["peakFreqModerate"],
    unit: "Hz",
    requiredGivens: [
      { name: "naturalFreqHz", value: 10.0, unit: "Hz", source: "stem" },
      { name: "zetaModerate", value: 0.4, source: "stem" },
    ],
    stem: "An acoustic resonator with natural frequency f₀ = 10.0 Hz experiences moderate viscous damping with ζ = 0.40. Using f_peak = f₀ √(1 − 2ζ²), determine the shifted frequency at which its driven amplitude reaches a maximum.",
    buildDistractors: () => [
      { value: 10.0 * Math.sqrt(1 - 0.4 * 0.4), rationale: "Uses √(1 − ζ²) instead of √(1 − 2ζ²)." },
      { value: 10.0 * (1 - 2 * 0.4 * 0.4), rationale: "Forgets to take the square root." },
      { value: 10.0 * Math.sqrt(1 + 2 * 0.4 * 0.4), rationale: "Shifts the resonant peak upward above f₀ instead of downward." },
    ],
    buildWorked: (q) => {
      const ans = q.peakFreqModerate as number;
      return {
        worked: `f_peak = 10.0 × √(1 − 2 × 0.40²) = 10.0 × √0.68 = ${fmt3(ans, "Hz")}.`,
        markCriterion: `Finds shifted resonant peak frequency ${fmt3(ans, "Hz")}.`,
      };
    },
  },
  {
    slug: "q-res-peak-shift-4",
    kind: "al-a2-damping-resonance-curves",
    subtopic: "3.6.1",
    ncukCross: { topicId: "ncuk-ac6", subtopicId: "ncuk-ac6-1" },
    conceptId: "forced-oscillations-resonance",
    templateArchetype: "al-a2-damping-resonance-curves",
    difficulty: "higher",
    questionStyle: "calculation",
    scenarioSpec: {
      kind: "al-a2-damping-resonance-curves",
      naturalFreqHz: 15.0,
      staticAmplitudeMm: 8.0,
      zetaLight: 0.14,
      zetaModerate: 0.45,
      zetaHeavy: 0.62,
      showPhaseSubplot: true,
    },
    targetQuantityKey: "peakFreqHeavy",
    hiddenQuantities: ["peakFreqHeavy"],
    unit: "Hz",
    requiredGivens: [
      { name: "naturalFreqHz", value: 15.0, unit: "Hz", source: "stem" },
      { name: "zetaHeavy", value: 0.62, source: "stem" },
    ],
    stem: "A heavily damped cantilever beam has undamped natural frequency f₀ = 15.0 Hz and damping ratio ζ = 0.62. Calculate its shifted resonance peak frequency from f_peak = f₀ √(1 − 2ζ²).",
    buildDistractors: () => [
      { value: 15.0 * Math.sqrt(1 - 0.62 * 0.62), rationale: "Drops the factor of 2 inside the square root." },
      { value: 15.0 * (1 - 2 * 0.62 * 0.62), rationale: "Omits the square root completely." },
      { value: 15.0 * 0.62, rationale: "Multiplies f₀ directly by ζ." },
    ],
    buildWorked: (q) => {
      const ans = q.peakFreqHeavy as number;
      return {
        worked: `f_peak = 15.0 × √(1 − 2 × 0.62²) = 15.0 × √0.2312 = ${fmt3(ans, "Hz")}.`,
        markCriterion: `Correct shifted peak frequency ${fmt3(ans, "Hz")}.`,
      };
    },
  },
  {
    slug: "q-decay-amp-n-5",
    kind: "al-a2-damped-oscillation-decay",
    subtopic: "3.6.1",
    ncukCross: { topicId: "ncuk-ac6", subtopicId: "ncuk-ac6-1" },
    conceptId: "forced-oscillations-resonance",
    templateArchetype: "al-a2-damped-oscillation-decay",
    difficulty: "standard",
    questionStyle: "calculation",
    scenarioSpec: {
      kind: "al-a2-damped-oscillation-decay",
      initialAmplitudeMm: 80,
      periodS: 1.5,
      amplitudeRatioPerCycle: 0.85,
      cyclesCount: 4,
      regime: "light",
    },
    targetQuantityKey: "amplitudeAfterNCyclesMm",
    hiddenQuantities: ["amplitudeAfterNCyclesMm"],
    unit: "mm",
    requiredGivens: [
      { name: "initialAmplitudeMm", value: 80, unit: "mm", source: "stem" },
      { name: "amplitudeRatioPerCycle", value: 0.85, source: "stem" },
      { name: "cyclesCount", value: 4, source: "stem" },
    ],
    stem: "A lightly damped pendulum starts swinging with initial amplitude 80 mm and period 1.5 s. During each complete oscillation its amplitude falls to 0.85 of its previous peak. What is its amplitude after 4 complete cycles?",
    buildDistractors: () => [
      { value: 80 * (1 - 4 * 0.15), rationale: "Applies linear amplitude subtraction instead of exponential geometric decay." },
      { value: 80 * 0.85 ** 3, rationale: "Applies only 3 decay intervals instead of 4." },
      { value: 80 * 0.85, rationale: "Computes amplitude after a single oscillation only." },
    ],
    buildWorked: (q) => {
      const ans = q.amplitudeAfterNCyclesMm as number;
      return {
        worked: `Exponential damping multiplies amplitude by r each cycle: A₄ = 80 × (0.85)⁴ = ${fmt3(ans, "mm")}.`,
        markCriterion: `Computes A₄ = 80 × 0.85⁴ = ${fmt3(ans, "mm")}.`,
      };
    },
  },
  {
    slug: "q-decay-amp-n-6",
    kind: "al-a2-damped-oscillation-decay",
    subtopic: "3.6.1",
    ncukCross: { topicId: "ncuk-ac6", subtopicId: "ncuk-ac6-1" },
    conceptId: "forced-oscillations-resonance",
    templateArchetype: "al-a2-damped-oscillation-decay",
    difficulty: "standard",
    questionStyle: "calculation",
    scenarioSpec: {
      kind: "al-a2-damped-oscillation-decay",
      initialAmplitudeMm: 96,
      periodS: 0.8,
      amplitudeRatioPerCycle: 0.75,
      cyclesCount: 3,
      regime: "light",
    },
    targetQuantityKey: "amplitudeAfterNCyclesMm",
    hiddenQuantities: ["amplitudeAfterNCyclesMm"],
    unit: "mm",
    requiredGivens: [
      { name: "initialAmplitudeMm", value: 96, unit: "mm", source: "stem" },
      { name: "amplitudeRatioPerCycle", value: 0.75, source: "stem" },
      { name: "cyclesCount", value: 3, source: "stem" },
    ],
    stem: "A damped mass on a vertical spring is released from 96 mm below equilibrium (period 0.80 s). Each cycle reduces the peak displacement to 0.75 of the previous peak. Find the amplitude after 3 full cycles.",
    buildDistractors: () => [
      { value: 96 * (1 - 3 * 0.25), rationale: "Subtracts 25% of initial amplitude linearly three times." },
      { value: 96 * 0.75 ** 2, rationale: "Uses exponent 2 instead of 3." },
      { value: 96 * 0.75 ** 4, rationale: "Uses exponent 4 instead of 3." },
    ],
    buildWorked: (q) => {
      const ans = q.amplitudeAfterNCyclesMm as number;
      return {
        worked: `A₃ = A₀ r³ = 96 × (0.75)³ = ${fmt3(ans, "mm")}.`,
        markCriterion: `Finds damped amplitude ${fmt3(ans, "mm")}.`,
      };
    },
  },
  {
    slug: "q-decay-eloss-pct-7",
    kind: "al-a2-damped-oscillation-decay",
    subtopic: "3.6.1",
    ncukCross: { topicId: "ncuk-ac6", subtopicId: "ncuk-ac6-1" },
    conceptId: "forced-oscillations-resonance",
    templateArchetype: "al-a2-damped-oscillation-decay",
    difficulty: "higher",
    questionStyle: "calculation",
    scenarioSpec: {
      kind: "al-a2-damped-oscillation-decay",
      initialAmplitudeMm: 50,
      periodS: 1.0,
      amplitudeRatioPerCycle: 0.8,
      cyclesCount: 2,
      regime: "light",
    },
    targetQuantityKey: "energyLossPerCyclePct",
    hiddenQuantities: ["energyLossPerCyclePct", "energyRemainingRatio"],
    unit: "%",
    requiredGivens: [
      { name: "amplitudeRatioPerCycle", value: 0.8, source: "stem" },
    ],
    stem: "The amplitude of a lightly damped harmonic oscillator decreases to 0.80 of its previous value on each complete cycle. What percentage of the oscillator's mechanical energy is dissipated during one cycle?",
    buildDistractors: () => [
      { value: 20, rationale: "Assumes energy is proportional to amplitude A rather than A²." },
      { value: 64, rationale: "Reports the percentage of energy remaining (0.80² = 64%) rather than energy lost." },
      { value: 80, rationale: "Reports the amplitude retention ratio directly as a percentage." },
    ],
    buildWorked: (q) => {
      const ans = q.energyLossPerCyclePct as number;
      return {
        worked: `Total mechanical energy E ∝ A², so remaining fraction is 0.80² = 0.64. Percentage lost = (1 − 0.64) × 100% = ${fmt3(ans, "%")}.`,
        markCriterion: `Uses E ∝ A² to find ${fmt3(ans, "%")} energy lost per cycle.`,
      };
    },
  },
  {
    slug: "q-decay-eloss-pct-8",
    kind: "al-a2-damped-oscillation-decay",
    subtopic: "3.6.1",
    ncukCross: { topicId: "ncuk-ac6", subtopicId: "ncuk-ac6-1" },
    conceptId: "forced-oscillations-resonance",
    templateArchetype: "al-a2-damped-oscillation-decay",
    difficulty: "higher",
    questionStyle: "calculation",
    scenarioSpec: {
      kind: "al-a2-damped-oscillation-decay",
      initialAmplitudeMm: 64,
      periodS: 1.2,
      amplitudeRatioPerCycle: 0.7,
      cyclesCount: 2,
      regime: "light",
    },
    targetQuantityKey: "energyLossPerCyclePct",
    hiddenQuantities: ["energyLossPerCyclePct", "energyRemainingRatio"],
    unit: "%",
    requiredGivens: [
      { name: "amplitudeRatioPerCycle", value: 0.7, source: "stem" },
    ],
    stem: "A damped torsion pendulum loses amplitude exponentially so each peak is 0.70 times the previous peak. Calculate the percentage of total mechanical energy transferred to thermal energy per oscillation.",
    buildDistractors: () => [
      { value: 30, rationale: "Treats mechanical energy as linearly proportional to amplitude." },
      { value: 49, rationale: "Gives the percentage of energy remaining (0.70²) instead of lost." },
      { value: 70, rationale: "Quotes the amplitude ratio directly." },
    ],
    buildWorked: (q) => {
      const ans = q.energyLossPerCyclePct as number;
      return {
        worked: `Since E ∝ A², energy fraction retained = 0.70² = 0.49; percentage dissipated = (1 − 0.49) × 100% = ${fmt3(ans, "%")}.`,
        markCriterion: `Determines ${fmt3(ans, "%")} energy dissipated per cycle.`,
      };
    },
  },

  // --- 3.6.2 Continuous-Flow Calorimetry & Kinetic Theory (8 quant MCQs) ---
  {
    slug: "q-cf-shc-1",
    kind: "al-a2-continuous-flow-calorimetry",
    subtopic: "3.6.2",
    conceptId: "specific-heat-latent-heat",
    templateArchetype: "al-a2-continuous-flow-calorimetry",
    difficulty: "standard",
    questionStyle: "calculation",
    scenarioSpec: {
      kind: "al-a2-continuous-flow-calorimetry",
      inletTempC: 18.0,
      outletTempC: 26.0,
      flowRate1KgPerS: 0.005,
      flowRate2KgPerS: 0.01,
      voltage1V: 12.0,
      current1A: 14.3,
      voltage2V: 16.0,
      current2A: 21.175,
      liquidName: "Water",
    },
    targetQuantityKey: "specificHeatC",
    hiddenQuantities: ["specificHeatC", "heatLossRateH"],
    unit: "J kg⁻¹ K⁻¹",
    requiredGivens: [
      { name: "inletTempC", value: 18.0, unit: "°C", source: "either" },
      { name: "outletTempC", value: 26.0, unit: "°C", source: "either" },
      { name: "flowRate1KgPerS", value: 0.005, unit: "kg s⁻¹", source: "stem" },
      { name: "flowRate2KgPerS", value: 0.01, unit: "kg s⁻¹", source: "stem" },
      { name: "voltage1V", value: 12.0, unit: "V", source: "stem" },
      { name: "current1A", value: 14.3, unit: "A", source: "stem" },
      { name: "voltage2V", value: 16.0, unit: "V", source: "stem" },
      { name: "current2A", value: 21.175, unit: "A", source: "stem" },
    ],
    stem: "Water flows steadily through a continuous-flow calorimeter, rising from 18.0 °C to 26.0 °C in both trials. In Trial 1, ṁ₁ = 0.00500 kg s⁻¹ requires V₁ = 12.0 V and I₁ = 14.3 A. In Trial 2, ṁ₂ = 0.0100 kg s⁻¹ requires V₂ = 16.0 V and I₂ = 21.175 A. Calculate the specific heat capacity of water.",
    buildDistractors: (q) => {
      const ans = q.specificHeatC as number;
      return [
        { value: q.naiveRun1C as number, rationale: "Uses only Trial 1 (P₁ / ṁ₁Δθ), failing to eliminate heat loss rate H." },
        { value: ans * 0.5, rationale: "Divides by ṁ₂ instead of (ṁ₂ − ṁ₁)." },
        { value: ((q.powerRun2W as number) + (q.powerSingleRun as number)) / (0.015 * 8.0), rationale: "Adds both trials instead of subtracting to eliminate H." },
      ];
    },
    buildWorked: (q) => {
      const ans = q.specificHeatC as number;
      return {
        worked: `P₁ = 12.0 × 14.3 = 171.6 W, P₂ = 16.0 × 21.175 = 338.8 W, Δθ = 8.0 K. Subtracting eliminates H: c = (338.8 − 171.6) / ((0.0100 − 0.00500) × 8.0) = ${fmt3(ans, "J kg⁻¹ K⁻¹")}.`,
        markCriterion: `Eliminates H via P₂ − P₁ = (ṁ₂ − ṁ₁)cΔθ to obtain c = ${fmt3(ans, "J kg⁻¹ K⁻¹")}.`,
      };
    },
  },
  {
    slug: "q-cf-shc-2",
    kind: "al-a2-continuous-flow-calorimetry",
    subtopic: "3.6.2",
    conceptId: "specific-heat-latent-heat",
    templateArchetype: "al-a2-continuous-flow-calorimetry",
    difficulty: "standard",
    questionStyle: "calculation",
    scenarioSpec: {
      kind: "al-a2-continuous-flow-calorimetry",
      inletTempC: 20.0,
      outletTempC: 32.0,
      flowRate1KgPerS: 0.006,
      flowRate2KgPerS: 0.012,
      voltage1V: 15.0,
      current1A: 10.48,
      voltage2V: 20.0,
      current2A: 15.42,
      liquidName: "Mineral oil",
    },
    targetQuantityKey: "specificHeatC",
    hiddenQuantities: ["specificHeatC", "heatLossRateH"],
    unit: "J kg⁻¹ K⁻¹",
    requiredGivens: [
      { name: "inletTempC", value: 20.0, unit: "°C", source: "either" },
      { name: "outletTempC", value: 32.0, unit: "°C", source: "either" },
      { name: "flowRate1KgPerS", value: 0.006, unit: "kg s⁻¹", source: "stem" },
      { name: "flowRate2KgPerS", value: 0.012, unit: "kg s⁻¹", source: "stem" },
      { name: "voltage1V", value: 15.0, unit: "V", source: "stem" },
      { name: "current1A", value: 10.48, unit: "A", source: "stem" },
      { name: "voltage2V", value: 20.0, unit: "V", source: "stem" },
      { name: "current2A", value: 15.42, unit: "A", source: "stem" },
    ],
    stem: "Mineral oil enters a continuous-flow heater at 20.0 °C and leaves at 32.0 °C in two steady runs. Run 1 uses ṁ₁ = 0.00600 kg s⁻¹, V₁ = 15.0 V, I₁ = 10.48 A; Run 2 uses ṁ₂ = 0.0120 kg s⁻¹, V₂ = 20.0 V, I₂ = 15.42 A. Find the specific heat capacity of the mineral oil.",
    buildDistractors: (q) => {
      const ans = q.specificHeatC as number;
      return [
        { value: q.naiveRun1C as number, rationale: "Neglects thermal loss rate H using Run 1 alone." },
        { value: (q.powerRun2W as number) / (0.012 * 12.0), rationale: "Neglects heat loss H using Run 2 alone." },
        { value: ans * 1.5, rationale: "Uses Δθ = 8.0 K instead of 12.0 K." },
      ];
    },
    buildWorked: (q) => {
      const ans = q.specificHeatC as number;
      return {
        worked: `P₁ = 157.2 W, P₂ = 308.4 W, Δθ = 12.0 K. c = (308.4 − 157.2) / (0.00600 × 12.0) = ${fmt3(ans, "J kg⁻¹ K⁻¹")}.`,
        markCriterion: `Finds specific heat capacity c = ${fmt3(ans, "J kg⁻¹ K⁻¹")}.`,
      };
    },
  },
  {
    slug: "q-cf-shc-3",
    kind: "al-a2-continuous-flow-calorimetry",
    subtopic: "3.6.2",
    conceptId: "specific-heat-latent-heat",
    templateArchetype: "al-a2-continuous-flow-calorimetry",
    difficulty: "higher",
    questionStyle: "calculation",
    scenarioSpec: {
      kind: "al-a2-continuous-flow-calorimetry",
      inletTempC: 16.0,
      outletTempC: 26.0,
      flowRate1KgPerS: 0.004,
      flowRate2KgPerS: 0.01,
      voltage1V: 10.0,
      current1A: 10.64,
      voltage2V: 16.0,
      current2A: 15.8,
      liquidName: "Ethanol",
    },
    targetQuantityKey: "specificHeatC",
    hiddenQuantities: ["specificHeatC", "heatLossRateH"],
    unit: "J kg⁻¹ K⁻¹",
    requiredGivens: [
      { name: "inletTempC", value: 16.0, unit: "°C", source: "either" },
      { name: "outletTempC", value: 26.0, unit: "°C", source: "either" },
      { name: "flowRate1KgPerS", value: 0.004, unit: "kg s⁻¹", source: "stem" },
      { name: "flowRate2KgPerS", value: 0.01, unit: "kg s⁻¹", source: "stem" },
      { name: "voltage1V", value: 10.0, unit: "V", source: "stem" },
      { name: "current1A", value: 10.64, unit: "A", source: "stem" },
      { name: "voltage2V", value: 16.0, unit: "V", source: "stem" },
      { name: "current2A", value: 15.8, unit: "A", source: "stem" },
    ],
    stem: "Liquid ethanol rises from 16.0 °C to 26.0 °C in a continuous-flow tube. At ṁ₁ = 0.00400 kg s⁻¹, heater power uses 10.0 V and 10.64 A; at ṁ₂ = 0.0100 kg s⁻¹, it uses 16.0 V and 15.8 A. Calculate the specific heat capacity of ethanol.",
    buildDistractors: (q) => {
      const ans = q.specificHeatC as number;
      return [
        { value: q.naiveRun1C as number, rationale: "Fails to subtract heat loss H from Run 1." },
        { value: ((q.powerRun2W as number) - (q.powerSingleRun as number)) / (0.01 * 10.0), rationale: "Divides by ṁ₂ instead of Δṁ = ṁ₂ − ṁ₁." },
        { value: ans * 2, rationale: "Uses an erroneous factor of two." },
      ];
    },
    buildWorked: (q) => {
      const ans = q.specificHeatC as number;
      return {
        worked: `P₁ = 106.4 W, P₂ = 252.8 W, Δṁ = 0.00600 kg s⁻¹, Δθ = 10.0 K. c = (252.8 − 106.4) / (0.00600 × 10.0) = ${fmt3(ans, "J kg⁻¹ K⁻¹")}.`,
        markCriterion: `Determines ethanol specific heat capacity ${fmt3(ans, "J kg⁻¹ K⁻¹")}.`,
      };
    },
  },
  {
    slug: "q-cf-heat-loss-4",
    kind: "al-a2-continuous-flow-calorimetry",
    subtopic: "3.6.2",
    conceptId: "specific-heat-latent-heat",
    templateArchetype: "al-a2-continuous-flow-calorimetry",
    difficulty: "higher",
    questionStyle: "calculation",
    scenarioSpec: {
      kind: "al-a2-continuous-flow-calorimetry",
      inletTempC: 18.0,
      outletTempC: 26.0,
      flowRate1KgPerS: 0.005,
      flowRate2KgPerS: 0.01,
      voltage1V: 12.0,
      current1A: 14.3,
      voltage2V: 16.0,
      current2A: 21.175,
      liquidName: "Water",
    },
    targetQuantityKey: "heatLossRateH",
    hiddenQuantities: ["heatLossRateH", "specificHeatC"],
    unit: "W",
    requiredGivens: [
      { name: "inletTempC", value: 18.0, unit: "°C", source: "either" },
      { name: "outletTempC", value: 26.0, unit: "°C", source: "either" },
      { name: "flowRate1KgPerS", value: 0.005, unit: "kg s⁻¹", source: "stem" },
      { name: "flowRate2KgPerS", value: 0.01, unit: "kg s⁻¹", source: "stem" },
      { name: "voltage1V", value: 12.0, unit: "V", source: "stem" },
      { name: "current1A", value: 14.3, unit: "A", source: "stem" },
      { name: "voltage2V", value: 16.0, unit: "V", source: "stem" },
      { name: "current2A", value: 21.175, unit: "A", source: "stem" },
    ],
    stem: "In a continuous-flow test (18.0 °C to 26.0 °C), Run 1 has ṁ₁ = 0.00500 kg s⁻¹, V₁ = 12.0 V, I₁ = 14.3 A, and Run 2 has ṁ₂ = 0.0100 kg s⁻¹, V₂ = 16.0 V, I₂ = 21.175 A. Calculate the steady rate of thermal energy loss H to the surroundings.",
    buildDistractors: (q) => {
      const ans = q.heatLossRateH as number;
      return [
        { value: ans * 2, rationale: "Fails to subtract the correct flow-scaled thermal power." },
        { value: (q.powerRun2W as number) - (q.powerSingleRun as number), rationale: "Reports P₂ − P₁ instead of H = 2P₁ − P₂." },
        { value: ans * 0.5, rationale: "Halves the thermal loss rate." },
      ];
    },
    buildWorked: (q) => {
      const ans = q.heatLossRateH as number;
      return {
        worked: `Since ṁ₂ = 2ṁ₁, P₁ = ṁ₁cΔθ + H = 171.6 W and P₂ = 2ṁ₁cΔθ + H = 338.8 W. Thus H = 2P₁ − P₂ = 343.2 − 338.8 = ${fmt3(ans, "W")}.`,
        markCriterion: `Finds thermal loss rate H = ${fmt3(ans, "W")}.`,
      };
    },
  },
  {
    slug: "q-cf-heat-loss-5",
    kind: "al-a2-continuous-flow-calorimetry",
    subtopic: "3.6.2",
    conceptId: "specific-heat-latent-heat",
    templateArchetype: "al-a2-continuous-flow-calorimetry",
    difficulty: "higher",
    questionStyle: "calculation",
    scenarioSpec: {
      kind: "al-a2-continuous-flow-calorimetry",
      inletTempC: 19.0,
      outletTempC: 29.0,
      flowRate1KgPerS: 0.005,
      flowRate2KgPerS: 0.01,
      voltage1V: 12.0,
      current1A: 15.5,
      voltage2V: 18.0,
      current2A: 20.3333333,
      liquidName: "Glycol coolant",
    },
    targetQuantityKey: "heatLossRateH",
    hiddenQuantities: ["heatLossRateH", "specificHeatC"],
    unit: "W",
    requiredGivens: [
      { name: "inletTempC", value: 19.0, unit: "°C", source: "either" },
      { name: "outletTempC", value: 29.0, unit: "°C", source: "either" },
      { name: "flowRate1KgPerS", value: 0.005, unit: "kg s⁻¹", source: "stem" },
      { name: "flowRate2KgPerS", value: 0.01, unit: "kg s⁻¹", source: "stem" },
      { name: "voltage1V", value: 12.0, unit: "V", source: "stem" },
      { name: "current1A", value: 15.5, unit: "A", source: "stem" },
      { name: "voltage2V", value: 18.0, unit: "V", source: "stem" },
      { name: "current2A", value: 20.3333333, unit: "A", source: "stem" },
    ],
    stem: "Glycol coolant warms from 19.0 °C to 29.0 °C in a calorimeter. At ṁ₁ = 0.00500 kg s⁻¹, the heater runs at 12.0 V and 15.5 A; at ṁ₂ = 0.0100 kg s⁻¹, it runs at 18.0 V and 20.33 A. Determine the heat loss rate H to the surroundings.",
    buildDistractors: (q) => {
      const ans = q.heatLossRateH as number;
      return [
        { value: ans * 2, rationale: "Doubles the heat loss rate when eliminating flow rate." },
        { value: (q.powerRun2W as number) - (q.powerSingleRun as number), rationale: "Computes ΔP rather than H." },
        { value: ans * 0.4, rationale: "Underestimates thermal losses." },
      ];
    },
    buildWorked: (q) => {
      const ans = q.heatLossRateH as number;
      return {
        worked: `P₁ = 186.0 W, P₂ = 366.0 W. Since ṁ₂ = 2ṁ₁, H = 2P₁ − P₂ = 372.0 − 366.0 = ${fmt3(ans, "W")}.`,
        markCriterion: `Evaluates steady heat loss rate H = ${fmt3(ans, "W")}.`,
      };
    },
  },
  {
    slug: "q-kt-crms-6",
    kind: "al-a2-kinetic-theory-assumptions-lor",
    subtopic: "3.6.2",
    conceptId: "ideal-gas-kinetic-theory",
    templateArchetype: "al-a2-kinetic-theory-assumptions-lor",
    difficulty: "standard",
    questionStyle: "calculation",
    scenarioSpec: {
      kind: "al-a2-kinetic-theory-assumptions-lor",
      cubeSideM: 0.3,
      molarMassKgPerMol: 0.028,
      temperatureK: 320,
      molesN: 1.2,
      gasLabel: "Nitrogen",
    },
    targetQuantityKey: "cRmsMs",
    hiddenQuantities: ["cRmsMs"],
    unit: "m s⁻¹",
    requiredGivens: [
      { name: "molarMassKgPerMol", value: 0.028, unit: "kg mol⁻¹", source: "stem" },
      { name: "temperatureK", value: 320, unit: "K", source: "stem" },
    ],
    stem: "Nitrogen gas (molar mass M = 0.0280 kg mol⁻¹) is held at thermodynamic temperature T = 320 K inside a sealed container. Taking R = 8.31 J K⁻¹ mol⁻¹, calculate the root-mean-square speed c_rms of the nitrogen molecules.",
    buildDistractors: (q) => {
      const ans = q.cRmsMs as number;
      return [
        { value: ans / Math.sqrt(3), rationale: "Omits the factor of 3 in c_rms = √(3RT / M)." },
        { value: ans * ans, rationale: "Reports mean-square speed c_rms² without taking the square root." },
        { value: ans / Math.sqrt(1000), rationale: "Uses molar mass in g mol⁻¹ (28) instead of kg mol⁻¹ (0.028)." },
      ];
    },
    buildWorked: (q) => {
      const ans = q.cRmsMs as number;
      return {
        worked: `From ½m c_rms² = (3/2)kT, c_rms = √(3RT / M) = √(3 × 8.31 × 320 / 0.0280) = ${fmt3(ans, "m s⁻¹")}.`,
        markCriterion: `Computes c_rms = ${fmt3(ans, "m s⁻¹")}.`,
      };
    },
  },
  {
    slug: "q-kt-crms-7",
    kind: "al-a2-kinetic-theory-assumptions-lor",
    subtopic: "3.6.2",
    conceptId: "ideal-gas-kinetic-theory",
    templateArchetype: "al-a2-kinetic-theory-assumptions-lor",
    difficulty: "standard",
    questionStyle: "calculation",
    scenarioSpec: {
      kind: "al-a2-kinetic-theory-assumptions-lor",
      cubeSideM: 0.4,
      molarMassKgPerMol: 0.004,
      temperatureK: 400,
      molesN: 2.0,
      gasLabel: "Helium",
    },
    targetQuantityKey: "cRmsMs",
    hiddenQuantities: ["cRmsMs"],
    unit: "m s⁻¹",
    requiredGivens: [
      { name: "molarMassKgPerMol", value: 0.004, unit: "kg mol⁻¹", source: "stem" },
      { name: "temperatureK", value: 400, unit: "K", source: "stem" },
    ],
    stem: "Monatomic helium gas (molar mass 0.00400 kg mol⁻¹) is warmed to 400 K. Using R = 8.31 J K⁻¹ mol⁻¹, determine the rms molecular speed c_rms of the helium atoms.",
    buildDistractors: (q) => {
      const ans = q.cRmsMs as number;
      return [
        { value: ans / Math.sqrt(3), rationale: "Drops the factor of 3 from 3RT/M." },
        { value: ans / Math.sqrt(2), rationale: "Uses √(3RT / 2M) instead of √(3RT / M)." },
        { value: ans * Math.sqrt(3), rationale: "Multiplies by an extra √3 factor." },
      ];
    },
    buildWorked: (q) => {
      const ans = q.cRmsMs as number;
      return {
        worked: `c_rms = √(3RT / M) = √(3 × 8.31 × 400 / 0.00400) = ${fmt3(ans, "m s⁻¹")}.`,
        markCriterion: `Finds helium rms speed ${fmt3(ans, "m s⁻¹")}.`,
      };
    },
  },
  {
    slug: "q-kt-wall-time-8",
    kind: "al-a2-kinetic-theory-assumptions-lor",
    subtopic: "3.6.2",
    conceptId: "ideal-gas-kinetic-theory",
    templateArchetype: "al-a2-kinetic-theory-assumptions-lor",
    difficulty: "standard",
    questionStyle: "calculation",
    scenarioSpec: {
      kind: "al-a2-kinetic-theory-assumptions-lor",
      cubeSideM: 0.2,
      molarMassKgPerMol: 0.032,
      temperatureK: 300,
      molesN: 1.0,
      singleMoleculeSpeedMs: 450,
      gasLabel: "Oxygen",
    },
    targetQuantityKey: "collisionTimeS",
    hiddenQuantities: ["collisionTimeS"],
    unit: "s",
    requiredGivens: [
      { name: "cubeSideM", value: 0.2, unit: "m", source: "stem" },
      { name: "singleMoleculeSpeedMs", value: 450, unit: "m s⁻¹", source: "stem" },
    ],
    stem: "In the kinetic theory cube model, an oxygen molecule bounces elastically back and forth perpendicularly between opposite walls of a cube of side L = 0.200 m at x-velocity u = 450 m s⁻¹. Calculate the time interval t between consecutive collisions with the same wall.",
    buildDistractors: (q) => {
      const ans = q.collisionTimeS as number;
      return [
        { value: ans * 0.5, rationale: "Uses one-way crossing time L / u instead of round-trip time 2L / u." },
        { value: ans * 2, rationale: "Uses 4L / u instead of 2L / u." },
        { value: 450 / (2 * 0.2), rationale: "Computes collision frequency u / (2L) instead of collision time interval 2L / u." },
      ];
    },
    buildWorked: (q) => {
      const ans = q.collisionTimeS as number;
      return {
        worked: `The molecule travels distance 2L before returning to the same face: t = 2L / u = (2 × 0.200) / 450 = ${fmt3(ans, "s")}.`,
        markCriterion: `Applies round-trip interval t = 2L / u = ${fmt3(ans, "s")}.`,
      };
    },
  },

  // --- 3.7.2 Satellite Orbits (5 quant MCQs) ---
  {
    slug: "q-sat-geo-alt-1",
    kind: "al-a2-satellite-orbits-comparison",
    subtopic: "3.7.2",
    ncukCross: { topicId: "ncuk-ac5", subtopicId: "ncuk-ac5-1" },
    conceptId: "gravitational-potential-orbits",
    templateArchetype: "al-a2-satellite-orbits-comparison",
    difficulty: "standard",
    questionStyle: "calculation",
    scenarioSpec: {
      kind: "al-a2-satellite-orbits-comparison",
      earthMassKg: 5.97e24,
      earthRadiusM: 6.37e6,
      geoPeriodS: 86400,
      leoAltitudeKm: 500,
      satelliteMassKg: 900,
    },
    targetQuantityKey: "geoAltitudeM",
    hiddenQuantities: ["geoAltitudeM", "geoRadiusM"],
    unit: "m",
    requiredGivens: [
      { name: "earthMassKg", value: 5.97e24, unit: "kg", source: "stem" },
      { name: "earthRadiusM", value: 6.37e6, unit: "m", source: "stem" },
      { name: "geoPeriodS", value: 86400, unit: "s", source: "stem" },
    ],
    stem: "Taking G = 6.67 × 10⁻¹¹ N m² kg⁻², Earth mass M = 5.97 × 10²⁴ kg, Earth radius R_E = 6.37 × 10⁶ m (giving surface g = 9.81 m s⁻²), and T = 86400 s, calculate the altitude above Earth's surface of a geostationary satellite.",
    buildDistractors: (q) => {
      const r = q.geoRadiusM as number;
      const alt = q.geoAltitudeM as number;
      return [
        { value: r, rationale: "Reports orbital radius measured from Earth's centre without subtracting R_E." },
        { value: r + 6.37e6, rationale: "Adds Earth's radius instead of subtracting it." },
        { value: alt * 0.5, rationale: "Omits a numerical factor during cube-root evaluation." },
      ];
    },
    buildWorked: (q) => {
      const r = q.geoRadiusM as number;
      const alt = q.geoAltitudeM as number;
      return {
        worked: `r = (G M T² / 4π²)^(1/3) = ${fmt3(r, "m")}. Subtracting Earth's radius: h = r − R_E = ${fmt3(alt, "m")}.`,
        markCriterion: `Computes r and subtracts R_E to obtain altitude ${fmt3(alt, "m")}.`,
      };
    },
  },
  {
    slug: "q-sat-geo-speed-2",
    kind: "al-a2-satellite-orbits-comparison",
    subtopic: "3.7.2",
    ncukCross: { topicId: "ncuk-ac5", subtopicId: "ncuk-ac5-1" },
    conceptId: "gravitational-potential-orbits",
    templateArchetype: "al-a2-satellite-orbits-comparison",
    difficulty: "standard",
    questionStyle: "calculation",
    scenarioSpec: {
      kind: "al-a2-satellite-orbits-comparison",
      earthMassKg: 5.97e24,
      earthRadiusM: 6.37e6,
      geoPeriodS: 86400,
      leoAltitudeKm: 650,
      satelliteMassKg: 1100,
    },
    targetQuantityKey: "geoSpeedMs",
    hiddenQuantities: ["geoSpeedMs"],
    unit: "m s⁻¹",
    requiredGivens: [
      { name: "earthMassKg", value: 5.97e24, unit: "kg", source: "stem" },
      { name: "geoPeriodS", value: 86400, unit: "s", source: "stem" },
    ],
    stem: "A telecommunications relay orbits Earth in a circular equatorial geostationary orbit of period 86400 s (M_E = 5.97 × 10²⁴ kg, G = 6.67 × 10⁻¹¹ N m² kg⁻²). Calculate its orbital speed.",
    buildDistractors: (q) => {
      const v = q.geoSpeedMs as number;
      return [
        { value: v * Math.SQRT2, rationale: "Computes escape speed √(2GM/r) instead of circular orbital speed √(GM/r)." },
        { value: q.leoSpeedMs as number, rationale: "Computes low-Earth orbit speed instead of geostationary speed." },
        { value: v * 0.5, rationale: "Applies an erroneous factor of one-half." },
      ];
    },
    buildWorked: (q) => {
      const r = q.geoRadiusM as number;
      const v = q.geoSpeedMs as number;
      return {
        worked: `r = (G M T² / 4π²)^(1/3) = ${fmt3(r, "m")}; v = 2πr / T = √(GM / r) = ${fmt3(v, "m s⁻¹")}.`,
        markCriterion: `Finds geostationary orbital speed ${fmt3(v, "m s⁻¹")}.`,
      };
    },
  },
  {
    slug: "q-sat-leo-period-3",
    kind: "al-a2-satellite-orbits-comparison",
    subtopic: "3.7.2",
    ncukCross: { topicId: "ncuk-ac5", subtopicId: "ncuk-ac5-1" },
    conceptId: "gravitational-potential-orbits",
    templateArchetype: "al-a2-satellite-orbits-comparison",
    difficulty: "standard",
    questionStyle: "calculation",
    scenarioSpec: {
      kind: "al-a2-satellite-orbits-comparison",
      earthMassKg: 5.97e24,
      earthRadiusM: 6.37e6,
      geoPeriodS: 86400,
      leoAltitudeKm: 750,
      satelliteMassKg: 600,
    },
    targetQuantityKey: "leoPeriodMin",
    hiddenQuantities: ["leoPeriodMin", "leoPeriodS"],
    unit: "min",
    requiredGivens: [
      { name: "earthMassKg", value: 5.97e24, unit: "kg", source: "stem" },
      { name: "earthRadiusM", value: 6.37e6, unit: "m", source: "stem" },
      { name: "leoAltitudeKm", value: 750, unit: "km", source: "either" },
    ],
    stem: "A polar weather satellite orbits at an altitude of 750 km above Earth's surface (R_E = 6.37 × 10⁶ m, M_E = 5.97 × 10²⁴ kg, G = 6.67 × 10⁻¹¹ N m² kg⁻²). Calculate its orbital period in minutes.",
    buildDistractors: (q) => {
      const tMin = q.leoPeriodMin as number;
      return [
        { value: tMin * 0.84, rationale: "Forgets to add altitude 750 km to Earth's radius." },
        { value: tMin * 0.1, rationale: "Uses altitude 750 km alone as the orbital radius." },
        { value: tMin * 1.6, rationale: "Drops the square root on r³ / GM." },
      ];
    },
    buildWorked: (q) => {
      const tS = q.leoPeriodS as number;
      const tMin = q.leoPeriodMin as number;
      return {
        worked: `r = 6.37 × 10⁶ + 7.50 × 10⁵ = 7.12 × 10⁶ m. T = 2π √(r³ / GM) = ${fmt3(tS, "s")} = ${fmt3(tMin, "min")}.`,
        markCriterion: `Calculates polar LEO period ${fmt3(tMin, "min")}.`,
      };
    },
  },
  {
    slug: "q-sat-leo-speed-4",
    kind: "al-a2-satellite-orbits-comparison",
    subtopic: "3.7.2",
    ncukCross: { topicId: "ncuk-ac5", subtopicId: "ncuk-ac5-1" },
    conceptId: "gravitational-potential-orbits",
    templateArchetype: "al-a2-satellite-orbits-comparison",
    difficulty: "standard",
    questionStyle: "calculation",
    scenarioSpec: {
      kind: "al-a2-satellite-orbits-comparison",
      earthMassKg: 5.97e24,
      earthRadiusM: 6.37e6,
      geoPeriodS: 86400,
      leoAltitudeKm: 420,
      satelliteMassKg: 1200,
    },
    targetQuantityKey: "leoSpeedMs",
    hiddenQuantities: ["leoSpeedMs"],
    unit: "m s⁻¹",
    requiredGivens: [
      { name: "earthMassKg", value: 5.97e24, unit: "kg", source: "stem" },
      { name: "earthRadiusM", value: 6.37e6, unit: "m", source: "stem" },
      { name: "leoAltitudeKm", value: 420, unit: "km", source: "either" },
    ],
    stem: "An Earth-observation spacecraft circles the poles at altitude 420 km (R_E = 6.37 × 10⁶ m, M_E = 5.97 × 10²⁴ kg, G = 6.67 × 10⁻¹¹ N m² kg⁻²). Calculate its circular orbital speed.",
    buildDistractors: (q) => {
      const v = q.leoSpeedMs as number;
      return [
        { value: v * Math.SQRT2, rationale: "Calculates escape velocity √(2GM/r) instead of circular orbital speed." },
        { value: q.geoSpeedMs as number, rationale: "Uses geostationary radius instead of LEO radius." },
        { value: Math.sqrt((6.67e-11 * 5.97e24) / 4.2e5), rationale: "Substitutes altitude h alone instead of R_E + h." },
      ];
    },
    buildWorked: (q) => {
      const v = q.leoSpeedMs as number;
      return {
        worked: `r = 6.37 × 10⁶ + 4.20 × 10⁵ = 6.79 × 10⁶ m. v = √(GM / r) = ${fmt3(v, "m s⁻¹")}.`,
        markCriterion: `Determines orbital speed ${fmt3(v, "m s⁻¹")}.`,
      };
    },
  },
  {
    slug: "q-sat-transfer-energy-5",
    kind: "al-a2-satellite-orbits-comparison",
    subtopic: "3.7.2",
    ncukCross: { topicId: "ncuk-ac5", subtopicId: "ncuk-ac5-1" },
    conceptId: "gravitational-potential-orbits",
    templateArchetype: "al-a2-satellite-orbits-comparison",
    difficulty: "higher",
    questionStyle: "calculation",
    scenarioSpec: {
      kind: "al-a2-satellite-orbits-comparison",
      earthMassKg: 5.97e24,
      earthRadiusM: 6.37e6,
      geoPeriodS: 86400,
      leoAltitudeKm: 500,
      satelliteMassKg: 1000,
    },
    targetQuantityKey: "energyToRaiseToGeoJ",
    hiddenQuantities: ["energyToRaiseToGeoJ"],
    unit: "J",
    requiredGivens: [
      { name: "earthMassKg", value: 5.97e24, unit: "kg", source: "stem" },
      { name: "earthRadiusM", value: 6.37e6, unit: "m", source: "stem" },
      { name: "leoAltitudeKm", value: 500, unit: "km", source: "either" },
      { name: "satelliteMassKg", value: 1000, unit: "kg", source: "stem" },
      { name: "geoPeriodS", value: 86400, unit: "s", source: "stem" },
    ],
    stem: "A 1000 kg satellite in circular low-Earth orbit at altitude 500 km is transferred to a circular geostationary orbit (T = 86400 s, R_E = 6.37 × 10⁶ m, M_E = 5.97 × 10²⁴ kg, G = 6.67 × 10⁻¹¹ N m² kg⁻²). Calculate the minimum energy required to change its total orbital energy.",
    buildDistractors: (q) => {
      const dE = q.energyToRaiseToGeoJ as number;
      return [
        { value: dE * 2, rationale: "Computes change in gravitational potential energy ΔE_p alone, forgetting kinetic energy decreases." },
        { value: Math.abs(q.leoTotalEnergyJ as number), rationale: "Computes full escape energy from LEO to infinity rather than to GEO." },
        { value: Math.abs(q.geoTotalEnergyJ as number), rationale: "Reports final total orbital energy magnitude instead of the energy difference." },
      ];
    },
    buildWorked: (q) => {
      const dE = q.energyToRaiseToGeoJ as number;
      return {
        worked: `Total circular orbital energy E = −GMm / (2r). ΔE = (GMm / 2)(1/r_LEO − 1/r_GEO) = ${fmt3(dE, "J")}.`,
        markCriterion: `Uses ΔE = (GMm/2)(1/r₁ − 1/r₂) to find ${fmt3(dE, "J")}.`,
      };
    },
  },

  // --- 3.7.3 Grav vs Electric Fields (4 quant MCQs) ---
  {
    slug: "q-ge-proton-ratio-1",
    kind: "al-a2-grav-vs-electric-fields",
    subtopic: "3.7.3",
    ncukCross: { topicId: "ncuk-ac4", subtopicId: "ncuk-ac4-5" },
    conceptId: "electrostatic-coulomb-uniform-fields",
    templateArchetype: "al-a2-grav-vs-electric-fields",
    difficulty: "standard",
    questionStyle: "calculation",
    scenarioSpec: {
      kind: "al-a2-grav-vs-electric-fields",
      centralMassKg: 1.673e-27,
      centralChargeC: 1.6e-19,
      testMassKg: 1.673e-27,
      testChargeC: 1.6e-19,
      separationM: 1.0e-10,
      chargePolarity: "positive",
    },
    targetQuantityKey: "forceRatioFeOverFg",
    hiddenQuantities: ["forceRatioFeOverFg"],
    requiredGivens: [
      { name: "centralMassKg", value: 1.673e-27, unit: "kg", source: "stem" },
      { name: "centralChargeC", value: 1.6e-19, unit: "C", source: "stem" },
    ],
    stem: "Two protons (mass 1.673 × 10⁻²⁷ kg, charge +1.60 × 10⁻¹⁹ C) are separated by 1.00 × 10⁻¹⁰ m in vacuum. Using ε₀ = 8.85 × 10⁻¹² F m⁻¹ and G = 6.67 × 10⁻¹¹ N m² kg⁻², calculate the ratio F_e / F_g of the electrostatic force to the gravitational force between them.",
    buildDistractors: (q) => {
      const ratio = q.forceRatioFeOverFg as number;
      return [
        { value: ratio * 1e-10, rationale: "Includes an uncancelled factor of separation r." },
        { value: Math.sqrt(ratio), rationale: "Takes the square root of the force ratio." },
        { value: ratio * 1836, rationale: "Substitutes electron mass for one of the protons." },
      ];
    },
    buildWorked: (q) => {
      const ratio = q.forceRatioFeOverFg as number;
      return {
        worked: `Since both forces vary as 1/r², r² cancels: F_e / F_g = e² / (4πε₀ G m_p²) = ${fmt3(ratio)}.`,
        markCriterion: `Cancels r² to obtain ratio F_e / F_g = ${fmt3(ratio)}.`,
      };
    },
  },
  {
    slug: "q-ge-pe-ratio-2",
    kind: "al-a2-grav-vs-electric-fields",
    subtopic: "3.7.3",
    ncukCross: { topicId: "ncuk-ac4", subtopicId: "ncuk-ac4-5" },
    conceptId: "electrostatic-coulomb-uniform-fields",
    templateArchetype: "al-a2-grav-vs-electric-fields",
    difficulty: "standard",
    questionStyle: "calculation",
    scenarioSpec: {
      kind: "al-a2-grav-vs-electric-fields",
      centralMassKg: 1.673e-27,
      centralChargeC: 1.6e-19,
      testMassKg: 9.11e-31,
      testChargeC: -1.6e-19,
      separationM: 5.3e-11,
      chargePolarity: "positive",
    },
    targetQuantityKey: "forceRatioFeOverFg",
    hiddenQuantities: ["forceRatioFeOverFg"],
    requiredGivens: [
      { name: "centralMassKg", value: 1.673e-27, unit: "kg", source: "stem" },
      { name: "testMassKg", value: 9.11e-31, unit: "kg", source: "stem" },
      { name: "centralChargeC", value: 1.6e-19, unit: "C", source: "stem" },
    ],
    stem: "In a hydrogen atom, a proton (1.673 × 10⁻²⁷ kg) and an electron (9.11 × 10⁻³¹ kg), each of charge magnitude 1.60 × 10⁻¹⁹ C, are 5.30 × 10⁻¹¹ m apart. Taking ε₀ = 8.85 × 10⁻¹² F m⁻¹ and G = 6.67 × 10⁻¹¹ N m² kg⁻², calculate the ratio F_e / F_g.",
    buildDistractors: (q) => {
      const ratio = q.forceRatioFeOverFg as number;
      return [
        { value: ratio / 1836, rationale: "Uses proton mass squared instead of m_p × m_e." },
        { value: ratio * 1836, rationale: "Uses electron mass squared instead of m_p × m_e." },
        { value: ratio / (4 * Math.PI), rationale: "Drops the 4π factor in Coulomb's law." },
      ];
    },
    buildWorked: (q) => {
      const ratio = q.forceRatioFeOverFg as number;
      return {
        worked: `F_e / F_g = e² / (4πε₀ G m_p m_e) = ${fmt3(ratio)}.`,
        markCriterion: `Finds proton-electron force ratio ${fmt3(ratio)}.`,
      };
    },
  },
  {
    slug: "q-ge-efield-3",
    kind: "al-a2-grav-vs-electric-fields",
    subtopic: "3.7.3",
    ncukCross: { topicId: "ncuk-ac4", subtopicId: "ncuk-ac4-5" },
    conceptId: "electrostatic-coulomb-uniform-fields",
    templateArchetype: "al-a2-grav-vs-electric-fields",
    difficulty: "standard",
    questionStyle: "calculation",
    scenarioSpec: {
      kind: "al-a2-grav-vs-electric-fields",
      centralMassKg: 0.05,
      centralChargeC: 3.6e-6,
      testMassKg: 0.01,
      testChargeC: 1.0e-6,
      separationM: 0.3,
      chargePolarity: "positive",
    },
    targetQuantityKey: "elecFieldNPerC",
    hiddenQuantities: ["elecFieldNPerC"],
    unit: "N C⁻¹",
    requiredGivens: [
      { name: "centralChargeC", value: 3.6e-6, unit: "C", source: "stem" },
      { name: "separationM", value: 0.3, unit: "m", source: "stem" },
    ],
    stem: "An isolated conducting dome carries a positive charge of 3.60 μC in air (ε₀ = 8.85 × 10⁻¹² F m⁻¹). Calculate the electric field strength at a distance of 0.300 m from the centre of the dome.",
    buildDistractors: (q) => {
      const ans = q.elecFieldNPerC as number;
      return [
        { value: ans * 0.3, rationale: "Computes electric potential Q/(4πε₀r) instead of field strength Q/(4πε₀r²)." },
        { value: ans * 4 * Math.PI, rationale: "Omits 4π in Coulomb's constant." },
        { value: ans * 0.25, rationale: "Doubles the radius before squaring." },
      ];
    },
    buildWorked: (q) => {
      const ans = q.elecFieldNPerC as number;
      return {
        worked: `E = Q / (4πε₀ r²) = 3.60 × 10⁻⁶ / (4π × 8.85 × 10⁻¹² × 0.300²) = ${fmt3(ans, "N C⁻¹")}.`,
        markCriterion: `Calculates radial electric field ${fmt3(ans, "N C⁻¹")}.`,
      };
    },
  },
  {
    slug: "q-ge-gpot-4",
    kind: "al-a2-grav-vs-electric-fields",
    subtopic: "3.7.2",
    ncukCross: { topicId: "ncuk-ac5", subtopicId: "ncuk-ac5-1" },
    conceptId: "gravitational-potential-orbits",
    templateArchetype: "al-a2-grav-vs-electric-fields",
    difficulty: "standard",
    questionStyle: "calculation",
    scenarioSpec: {
      kind: "al-a2-grav-vs-electric-fields",
      centralMassKg: 6.42e23,
      centralChargeC: -2.0e-6,
      testMassKg: 1.0,
      testChargeC: 1.0e-6,
      separationM: 3.4e6,
      chargePolarity: "negative",
    },
    targetQuantityKey: "gravPotentialJPerKg",
    hiddenQuantities: ["gravPotentialJPerKg"],
    unit: "J kg⁻¹",
    requiredGivens: [
      { name: "centralMassKg", value: 6.42e23, unit: "kg", source: "stem" },
      { name: "separationM", value: 3.4e6, unit: "m", source: "stem" },
    ],
    stem: "Mars has mass 6.42 × 10²³ kg and mean radius 3.40 × 10⁶ m. Taking G = 6.67 × 10⁻¹¹ N m² kg⁻², calculate the gravitational potential at the surface of Mars.",
    buildDistractors: (q) => {
      const ans = q.gravPotentialJPerKg as number;
      return [
        { value: Math.abs(ans), rationale: "Omits the mandatory negative sign of gravitational potential." },
        { value: ans / 3.4e6, rationale: "Divides by r² (field strength) instead of r." },
        { value: ans * 0.5, rationale: "Includes an extraneous factor of one-half from orbital energy." },
      ];
    },
    buildWorked: (q) => {
      const ans = q.gravPotentialJPerKg as number;
      return {
        worked: `V_g = −GM / r = −(6.67 × 10⁻¹¹ × 6.42 × 10²³) / (3.40 × 10⁶) = ${fmt3(ans, "J kg⁻¹")}.`,
        markCriterion: `Includes negative sign to obtain V_g = ${fmt3(ans, "J kg⁻¹")}.`,
      };
    },
  },

  // --- 3.7.4 Polar Dielectric Capacitor (6 quant MCQs) ---
  {
    slug: "q-diel-cap-1",
    kind: "al-a2-capacitor-polar-dielectric",
    subtopic: "3.7.4",
    conceptId: "capacitor-networks-energy",
    templateArchetype: "al-a2-capacitor-polar-dielectric",
    difficulty: "standard",
    questionStyle: "calculation",
    scenarioSpec: {
      kind: "al-a2-capacitor-polar-dielectric",
      plateAreaCm2: 200,
      plateSeparationMm: 1.0,
      relativePermittivity: 4.5,
      initialVoltageV: 12,
      connectionMode: "isolated",
    },
    targetQuantityKey: "capacitanceDielectricPF",
    hiddenQuantities: ["capacitanceDielectricPF"],
    unit: "pF",
    requiredGivens: [
      { name: "plateAreaCm2", value: 200, unit: "cm²", source: "stem" },
      { name: "plateSeparationMm", value: 1.0, unit: "mm", source: "stem" },
      { name: "relativePermittivity", value: 4.5, source: "either" },
    ],
    stem: "Two parallel plates of overlapping area 200 cm² are separated by 1.00 mm and filled completely with a polar dielectric of relative permittivity 4.50 (ε₀ = 8.85 × 10⁻¹² F m⁻¹). Calculate the capacitance in picofarads.",
    buildDistractors: (q) => {
      const ans = q.capacitanceDielectricPF as number;
      return [
        { value: q.capacitanceAirPF as number, rationale: "Forgets to multiply by relative permittivity εᵣ." },
        { value: ans * 100, rationale: "Converts cm² to m² by dividing by 10² instead of 10⁴." },
        { value: ans / 4.5 ** 2, rationale: "Divides by εᵣ instead of multiplying." },
      ];
    },
    buildWorked: (q) => {
      const ans = q.capacitanceDielectricPF as number;
      return {
        worked: `A = 200 × 10⁻⁴ = 0.0200 m², d = 1.00 × 10⁻³ m. C = ε₀ εᵣ A / d = ${fmt3(ans, "pF")}.`,
        markCriterion: `Converts cm² and mm to SI to find C = ${fmt3(ans, "pF")}.`,
      };
    },
  },
  {
    slug: "q-diel-cap-2",
    kind: "al-a2-capacitor-polar-dielectric",
    subtopic: "3.7.4",
    conceptId: "capacitor-networks-energy",
    templateArchetype: "al-a2-capacitor-polar-dielectric",
    difficulty: "standard",
    questionStyle: "calculation",
    scenarioSpec: {
      kind: "al-a2-capacitor-polar-dielectric",
      plateAreaCm2: 320,
      plateSeparationMm: 0.8,
      relativePermittivity: 6.0,
      initialVoltageV: 15,
      connectionMode: "connected",
    },
    targetQuantityKey: "capacitanceDielectricPF",
    hiddenQuantities: ["capacitanceDielectricPF"],
    unit: "pF",
    requiredGivens: [
      { name: "plateAreaCm2", value: 320, unit: "cm²", source: "stem" },
      { name: "plateSeparationMm", value: 0.8, unit: "mm", source: "stem" },
      { name: "relativePermittivity", value: 6.0, source: "either" },
    ],
    stem: "A parallel-plate capacitor uses plates of area 320 cm² separated by a 0.800 mm ceramic dielectric sheet with εᵣ = 6.00 (ε₀ = 8.85 × 10⁻¹² F m⁻¹). What is its capacitance in picofarads?",
    buildDistractors: (q) => {
      const ans = q.capacitanceDielectricPF as number;
      return [
        { value: q.capacitanceAirPF as number, rationale: "Omits εᵣ = 6.00." },
        { value: ans * 1e-3, rationale: "Forgets to convert millimetres to metres." },
        { value: ans * 0.5, rationale: "Inserts an extra factor of one-half." },
      ];
    },
    buildWorked: (q) => {
      const ans = q.capacitanceDielectricPF as number;
      return {
        worked: `C = (8.85 × 10⁻¹² × 6.00 × 0.0320) / (8.00 × 10⁻⁴) = ${fmt3(ans, "pF")}.`,
        markCriterion: `Determines capacitance ${fmt3(ans, "pF")}.`,
      };
    },
  },
  {
    slug: "q-diel-iso-v-3",
    kind: "al-a2-capacitor-polar-dielectric",
    subtopic: "3.7.4",
    conceptId: "capacitor-networks-energy",
    templateArchetype: "al-a2-capacitor-polar-dielectric",
    difficulty: "standard",
    questionStyle: "calculation",
    scenarioSpec: {
      kind: "al-a2-capacitor-polar-dielectric",
      plateAreaCm2: 150,
      plateSeparationMm: 1.5,
      relativePermittivity: 3.6,
      initialVoltageV: 27,
      connectionMode: "isolated",
    },
    targetQuantityKey: "finalVoltageV",
    hiddenQuantities: ["finalVoltageV"],
    unit: "V",
    requiredGivens: [
      { name: "initialVoltageV", value: 27, unit: "V", source: "stem" },
      { name: "relativePermittivity", value: 3.6, source: "either" },
    ],
    stem: "An air-spaced parallel-plate capacitor is charged to 27.0 V and isolated from the power supply. A polar dielectric slab of relative permittivity 3.60 is then inserted to fill the gap. Calculate the new potential difference across the plates.",
    buildDistractors: () => [
      { value: 27 * 3.6, rationale: "Multiplies voltage by εᵣ instead of dividing by εᵣ." },
      { value: 27, rationale: "Assumes potential difference stays fixed when the capacitor is actually isolated." },
      { value: 27 / Math.sqrt(3.6), rationale: "Divides by √εᵣ instead of εᵣ." },
    ],
    buildWorked: (q) => {
      const ans = q.finalVoltageV as number;
      return {
        worked: `Isolated Q is fixed and C' = εᵣC, so V' = Q / C' = V₀ / εᵣ = 27.0 / 3.60 = ${fmt3(ans, "V")}.`,
        markCriterion: `Computes V' = V₀ / εᵣ = ${fmt3(ans, "V")}.`,
      };
    },
  },
  {
    slug: "q-diel-conn-e-4",
    kind: "al-a2-capacitor-polar-dielectric",
    subtopic: "3.7.4",
    conceptId: "capacitor-networks-energy",
    templateArchetype: "al-a2-capacitor-polar-dielectric",
    difficulty: "higher",
    questionStyle: "calculation",
    scenarioSpec: {
      kind: "al-a2-capacitor-polar-dielectric",
      plateAreaCm2: 250,
      plateSeparationMm: 0.5,
      relativePermittivity: 5.0,
      initialVoltageV: 20,
      connectionMode: "connected",
    },
    targetQuantityKey: "finalEnergyNJ",
    hiddenQuantities: ["finalEnergyNJ"],
    unit: "nJ",
    requiredGivens: [
      { name: "plateAreaCm2", value: 250, unit: "cm²", source: "stem" },
      { name: "plateSeparationMm", value: 0.5, unit: "mm", source: "stem" },
      { name: "relativePermittivity", value: 5.0, source: "either" },
      { name: "initialVoltageV", value: 20, unit: "V", source: "stem" },
    ],
    stem: "A parallel-plate capacitor (area 250 cm², gap 0.500 mm, ε₀ = 8.85 × 10⁻¹² F m⁻¹) stays connected to a 20.0 V supply while a dielectric slab (εᵣ = 5.00) is slid fully between its plates. Calculate the final energy stored in nanojoules.",
    buildDistractors: (q) => {
      const ans = q.finalEnergyNJ as number;
      return [
        { value: q.initialEnergyNJ as number, rationale: "Forgets the factor εᵣ = 5.00." },
        { value: (q.initialEnergyNJ as number) / 5.0, rationale: "Uses the isolated-capacitor energy formula E₀ / εᵣ." },
        { value: ans * 2, rationale: "Computes C'V² instead of ½C'V²." },
      ];
    },
    buildWorked: (q) => {
      const ans = q.finalEnergyNJ as number;
      return {
        worked: `C' = ε₀εᵣA/d = ${fmt3(q.capacitanceDielectricPF as number, "pF")}. At constant V = 20.0 V, E' = ½C'V² = ${fmt3(ans, "nJ")}.`,
        markCriterion: `Evaluates stored energy ${fmt3(ans, "nJ")}.`,
      };
    },
  },
  {
    slug: "q-diel-iso-e-5",
    kind: "al-a2-capacitor-polar-dielectric",
    subtopic: "3.7.4",
    conceptId: "capacitor-networks-energy",
    templateArchetype: "al-a2-capacitor-polar-dielectric",
    difficulty: "higher",
    questionStyle: "calculation",
    scenarioSpec: {
      kind: "al-a2-capacitor-polar-dielectric",
      plateAreaCm2: 400,
      plateSeparationMm: 1.0,
      relativePermittivity: 4.0,
      initialVoltageV: 40,
      connectionMode: "isolated",
    },
    targetQuantityKey: "finalEnergyNJ",
    hiddenQuantities: ["finalEnergyNJ"],
    unit: "nJ",
    requiredGivens: [
      { name: "plateAreaCm2", value: 400, unit: "cm²", source: "stem" },
      { name: "plateSeparationMm", value: 1.0, unit: "mm", source: "stem" },
      { name: "relativePermittivity", value: 4.0, source: "either" },
      { name: "initialVoltageV", value: 40, unit: "V", source: "stem" },
    ],
    stem: "An air-filled capacitor (area 400 cm², gap 1.00 mm, ε₀ = 8.85 × 10⁻¹² F m⁻¹) is charged to 40.0 V and then disconnected. A dielectric slab with εᵣ = 4.00 is inserted to fill the gap. Calculate the final electrical energy stored in nanojoules.",
    buildDistractors: (q) => {
      const ans = q.finalEnergyNJ as number;
      return [
        { value: q.initialEnergyNJ as number, rationale: "Assumes stored energy stays unchanged after isolation." },
        { value: (q.initialEnergyNJ as number) * 4.0, rationale: "Multiplies energy by εᵣ (valid only when connected to a supply)." },
        { value: ans * 2, rationale: "Drops the factor of one-half from E = ½QV." },
      ];
    },
    buildWorked: (q) => {
      const ans = q.finalEnergyNJ as number;
      return {
        worked: `C₀ = 354 pF, E₀ = ½C₀V₀² = ${fmt3(q.initialEnergyNJ as number, "nJ")}. Isolated Q fixed ⇒ E' = E₀ / εᵣ = ${fmt3(ans, "nJ")}.`,
        markCriterion: `Finds isolated final energy ${fmt3(ans, "nJ")}.`,
      };
    },
  },
  {
    slug: "q-diel-heat-lost-6",
    kind: "al-a2-capacitor-polar-dielectric",
    subtopic: "3.7.4",
    conceptId: "capacitor-networks-energy",
    templateArchetype: "al-a2-capacitor-polar-dielectric",
    difficulty: "standard",
    questionStyle: "calculation",
    scenarioSpec: {
      kind: "al-a2-capacitor-polar-dielectric",
      plateAreaCm2: 500,
      plateSeparationMm: 0.5,
      relativePermittivity: 2.5,
      initialVoltageV: 60,
      connectionMode: "connected",
    },
    targetQuantityKey: "chargingHeatLossInitialNJ",
    hiddenQuantities: ["chargingHeatLossInitialNJ", "initialEnergyNJ"],
    unit: "nJ",
    requiredGivens: [
      { name: "plateAreaCm2", value: 500, unit: "cm²", source: "stem" },
      { name: "plateSeparationMm", value: 0.5, unit: "mm", source: "stem" },
      { name: "initialVoltageV", value: 60, unit: "V", source: "stem" },
    ],
    stem: "An empty air-filled parallel-plate capacitor (area 500 cm², separation 0.500 mm, ε₀ = 8.85 × 10⁻¹² F m⁻¹) is charged through a 22 kΩ resistor from a constant 60.0 V supply. How much thermal energy (in nanojoules) is dissipated in the circuit resistance during complete charging?",
    buildDistractors: (q) => {
      const ans = q.chargingHeatLossInitialNJ as number;
      return [
        { value: ans * 2, rationale: "Reports total battery work QV instead of the 50% dissipated as heat." },
        { value: ans * 2.5, rationale: "Incorrectly multiplies air capacitance by an unused dielectric constant." },
        { value: ans * 0.5, rationale: "Takes 25% instead of 50% of battery work." },
      ];
    },
    buildWorked: (q) => {
      const ans = q.chargingHeatLossInitialNJ as number;
      return {
        worked: `C₀ = ε₀A/d = ${fmt3(q.capacitanceAirPF as number, "pF")}. Half of battery work QV is dissipated as heat: E_heat = ½C₀V² = ${fmt3(ans, "nJ")}.`,
        markCriterion: `Applies 50% charging loss E_heat = ½C₀V² = ${fmt3(ans, "nJ")}.`,
      };
    },
  },

  // --- 3.7.5 Lenz, Transformers & CRO AC (9 quant MCQs) ---
  {
    slug: "q-lenz-exit-emf-1",
    kind: "al-a2-lenz-law-energy-conservation",
    subtopic: "3.7.5",
    ncukCross: { topicId: "ncuk-ac4", subtopicId: "ncuk-ac4-6" },
    conceptId: "electromagnetic-induction-faraday-lenz",
    templateArchetype: "al-a2-lenz-law-energy-conservation",
    difficulty: "standard",
    questionStyle: "calculation",
    scenarioSpec: {
      kind: "al-a2-lenz-law-energy-conservation",
      coilTurnsN: 450,
      peakFluxWb: 3.6e-4,
      entryDurationMs: 90,
      exitDurationMs: 54,
      coilResistanceOhm: 15,
      leadingPole: "N",
    },
    targetQuantityKey: "meanExitEmfV",
    hiddenQuantities: ["meanExitEmfV"],
    unit: "V",
    requiredGivens: [
      { name: "coilTurnsN", value: 450, source: "stem" },
      { name: "peakFluxWb", value: 3.6e-4, unit: "Wb", source: "stem" },
      { name: "exitDurationMs", value: 54, unit: "ms", source: "stem" },
    ],
    stem: "A bar magnet drops through a solenoid of 450 turns, reaching peak magnetic flux 3.60 × 10⁻⁴ Wb at the midpoint before exiting in 54.0 ms (entry took 90.0 ms). Calculate the magnitude of the mean induced emf during exit.",
    buildDistractors: (q) => {
      const ans = q.meanExitEmfV as number;
      return [
        { value: q.meanEntryEmfV as number, rationale: "Uses entry duration 90.0 ms instead of exit duration 54.0 ms." },
        { value: ans / 450, rationale: "Omits the number of turns N = 450." },
        { value: ans * 1e-3, rationale: "Forgets to convert milliseconds into seconds." },
      ];
    },
    buildWorked: (q) => {
      const ans = q.meanExitEmfV as number;
      return {
        worked: `|ε_exit| = NΦ / Δt_exit = (450 × 3.60 × 10⁻⁴) / (54.0 × 10⁻³) = ${fmt3(ans, "V")}.`,
        markCriterion: `Applies Faraday's law for exit pulse to get ${fmt3(ans, "V")}.`,
      };
    },
  },
  {
    slug: "q-lenz-exit-cur-2",
    kind: "al-a2-lenz-law-energy-conservation",
    subtopic: "3.7.5",
    ncukCross: { topicId: "ncuk-ac4", subtopicId: "ncuk-ac4-6" },
    conceptId: "electromagnetic-induction-faraday-lenz",
    templateArchetype: "al-a2-lenz-law-energy-conservation",
    difficulty: "standard",
    questionStyle: "calculation",
    scenarioSpec: {
      kind: "al-a2-lenz-law-energy-conservation",
      coilTurnsN: 600,
      peakFluxWb: 2.5e-4,
      entryDurationMs: 75,
      exitDurationMs: 40,
      coilResistanceOhm: 12,
      leadingPole: "S",
    },
    targetQuantityKey: "exitCurrentA",
    hiddenQuantities: ["exitCurrentA", "meanExitEmfV"],
    unit: "A",
    requiredGivens: [
      { name: "coilTurnsN", value: 600, source: "stem" },
      { name: "peakFluxWb", value: 2.5e-4, unit: "Wb", source: "stem" },
      { name: "exitDurationMs", value: 40, unit: "ms", source: "stem" },
      { name: "coilResistanceOhm", value: 12, unit: "Ω", source: "stem" },
    ],
    stem: "A magnet falls south-pole-first through a closed coil of 600 turns and total resistance 12.0 Ω. Maximum flux linkage per turn is 2.50 × 10⁻⁴ Wb, and exit takes 40.0 ms. Calculate the mean induced current during exit.",
    buildDistractors: (q) => {
      const ans = q.exitCurrentA as number;
      return [
        { value: q.meanExitEmfV as number, rationale: "Stops at induced emf without dividing by coil resistance 12.0 Ω." },
        { value: q.entryCurrentA as number, rationale: "Uses entry duration instead of exit duration." },
        { value: ans * 12 * 12, rationale: "Multiplies emf by resistance instead of dividing." },
      ];
    },
    buildWorked: (q) => {
      const emf = q.meanExitEmfV as number;
      const ans = q.exitCurrentA as number;
      return {
        worked: `|ε| = (600 × 2.50 × 10⁻⁴) / 0.0400 = ${fmt3(emf, "V")}; I = ε / R = ${fmt3(emf)} / 12.0 = ${fmt3(ans, "A")}.`,
        markCriterion: `Finds mean exit current ${fmt3(ans, "A")}.`,
      };
    },
  },
  {
    slug: "q-tr-ip-3",
    kind: "al-a2-transformer-losses-design",
    subtopic: "3.7.5",
    ncukCross: { topicId: "ncuk-ac4", subtopicId: "ncuk-ac4-6" },
    conceptId: "ac-generators-transformers",
    templateArchetype: "al-a2-transformer-losses-design",
    difficulty: "standard",
    questionStyle: "calculation",
    scenarioSpec: {
      kind: "al-a2-transformer-losses-design",
      primaryTurns: 400,
      secondaryTurns: 2000,
      primaryVoltageV: 230,
      secondaryCurrentA: 3.0,
      efficiencyPct: 92,
      lineResistanceOhm: 6.0,
      gridPowerW: 3.45e6,
    },
    targetQuantityKey: "primaryCurrentA",
    hiddenQuantities: ["primaryCurrentA", "secondaryVoltageV"],
    unit: "A",
    requiredGivens: [
      { name: "primaryTurns", value: 400, source: "either" },
      { name: "secondaryTurns", value: 2000, source: "either" },
      { name: "primaryVoltageV", value: 230, unit: "V", source: "either" },
      { name: "secondaryCurrentA", value: 3.0, unit: "A", source: "stem" },
      { name: "efficiencyPct", value: 92, unit: "%", source: "stem" },
    ],
    stem: "A 92.0% efficient step-up transformer (Nₚ = 400, Nₛ = 2000) operates on Vₚ = 230 V and supplies a secondary current of 3.00 A. Calculate the primary current drawn from the mains.",
    buildDistractors: (q) => {
      const ans = q.primaryCurrentA as number;
      return [
        { value: ans * 0.92, rationale: "Assumes 100% ideal efficiency instead of dividing by 0.92." },
        { value: ans * 0.92 * 0.92, rationale: "Multiplies ideal primary current by 0.92 instead of dividing by 0.92." },
        { value: 3.0 / 5, rationale: "Inverts the turns ratio when scaling current." },
      ];
    },
    buildWorked: (q) => {
      const vs = q.secondaryVoltageV as number;
      const ip = q.primaryCurrentA as number;
      return {
        worked: `Vₛ = 230 × (2000 / 400) = ${fmt3(vs, "V")}. Pₛ = ${fmt3(vs * 3, "W")}; Pₚ = Pₛ / 0.92 ⇒ Iₚ = Pₚ / 230 = ${fmt3(ip, "A")}.`,
        markCriterion: `Applies η = IₛVₛ / (IₚVₚ) to obtain Iₚ = ${fmt3(ip, "A")}.`,
      };
    },
  },
  {
    slug: "q-tr-ip-4",
    kind: "al-a2-transformer-losses-design",
    subtopic: "3.7.5",
    ncukCross: { topicId: "ncuk-ac4", subtopicId: "ncuk-ac4-6" },
    conceptId: "ac-generators-transformers",
    templateArchetype: "al-a2-transformer-losses-design",
    difficulty: "standard",
    questionStyle: "calculation",
    scenarioSpec: {
      kind: "al-a2-transformer-losses-design",
      primaryTurns: 1200,
      secondaryTurns: 150,
      primaryVoltageV: 240,
      secondaryCurrentA: 8.0,
      efficiencyPct: 88,
      lineResistanceOhm: 4.0,
      gridPowerW: 2.0e6,
    },
    targetQuantityKey: "primaryCurrentA",
    hiddenQuantities: ["primaryCurrentA", "secondaryVoltageV"],
    unit: "A",
    requiredGivens: [
      { name: "primaryTurns", value: 1200, source: "either" },
      { name: "secondaryTurns", value: 150, source: "either" },
      { name: "primaryVoltageV", value: 240, unit: "V", source: "either" },
      { name: "secondaryCurrentA", value: 8.0, unit: "A", source: "stem" },
      { name: "efficiencyPct", value: 88, unit: "%", source: "stem" },
    ],
    stem: "A step-down transformer (Nₚ = 1200, Nₛ = 150, Vₚ = 240 V) has an efficiency of 88.0% when delivering 8.00 A to a low-voltage heating load. Calculate the primary current.",
    buildDistractors: (q) => {
      const ans = q.primaryCurrentA as number;
      return [
        { value: ans * 0.88, rationale: "Treats the transformer as 100% efficient." },
        { value: ans * 0.88 * 0.88, rationale: "Multiplies ideal Iₚ by 0.88 instead of dividing." },
        { value: 8.0 * 8, rationale: "Multiplies secondary current by turns ratio instead of dividing." },
      ];
    },
    buildWorked: (q) => {
      const ip = q.primaryCurrentA as number;
      return {
        worked: `Vₛ = 240 × (150 / 1200) = 30.0 V, Pₛ = 240 W. Pₚ = 240 / 0.880 = 272.7 W ⇒ Iₚ = 272.7 / 240 = ${fmt3(ip, "A")}.`,
        markCriterion: `Finds non-ideal primary current ${fmt3(ip, "A")}.`,
      };
    },
  },
  {
    slug: "q-tr-grid-loss-5",
    kind: "al-a2-transformer-losses-design",
    subtopic: "3.7.5",
    ncukCross: { topicId: "ncuk-ac4", subtopicId: "ncuk-ac4-6" },
    conceptId: "ac-generators-transformers",
    templateArchetype: "al-a2-transformer-losses-design",
    difficulty: "higher",
    questionStyle: "calculation",
    scenarioSpec: {
      kind: "al-a2-transformer-losses-design",
      primaryTurns: 1000,
      secondaryTurns: 12000,
      primaryVoltageV: 11000,
      secondaryCurrentA: 50,
      efficiencyPct: 96,
      lineResistanceOhm: 10.0,
      gridPowerW: 2.64e7,
    },
    targetQuantityKey: "gridLineLossW",
    hiddenQuantities: ["gridLineLossW", "gridCurrentA", "secondaryVoltageV"],
    unit: "W",
    requiredGivens: [
      { name: "primaryTurns", value: 1000, source: "either" },
      { name: "secondaryTurns", value: 12000, source: "either" },
      { name: "primaryVoltageV", value: 11000, unit: "V", source: "either" },
      { name: "gridPowerW", value: 2.64e7, unit: "W", source: "stem" },
      { name: "lineResistanceOhm", value: 10.0, unit: "Ω", source: "stem" },
    ],
    stem: "A power station steps 11.0 kV up using Nₚ = 1000 and Nₛ = 12 000 turns before transmitting 26.4 MW of electrical power along transmission cables of total resistance 10.0 Ω. Calculate the thermal power lost in the transmission cables.",
    buildDistractors: (q) => {
      const iLine = q.gridCurrentA as number;
      return [
        { value: iLine * 10.0, rationale: "Computes IR (voltage drop) instead of I²R (power loss)." },
        { value: (2.64e7 / 11000) ** 2 * 10.0, rationale: "Uses un-stepped primary voltage 11.0 kV instead of 132 kV." },
        { value: (132000 ** 2) / 10.0, rationale: "Misapplies V² / R with the full transmission voltage 132 kV." },
      ];
    },
    buildWorked: (q) => {
      const vs = q.secondaryVoltageV as number;
      const iLine = q.gridCurrentA as number;
      const loss = q.gridLineLossW as number;
      return {
        worked: `Vₛ = 11.0 kV × 12 = ${fmt3(vs, "V")}. Line current I = P / Vₛ = ${fmt3(iLine, "A")}. Cable heating P_loss = I²R = ${fmt3(loss, "W")}.`,
        markCriterion: `Finds cable heating loss ${fmt3(loss, "W")}.`,
      };
    },
  },
  {
    slug: "q-cro-vrms-6",
    kind: "al-a2-oscilloscope-ac-rms",
    subtopic: "3.7.5",
    conceptId: "ac-generators-transformers",
    templateArchetype: "al-a2-oscilloscope-ac-rms",
    difficulty: "standard",
    questionStyle: "experimental",
    scenarioSpec: {
      kind: "al-a2-oscilloscope-ac-rms",
      yGainVPerDiv: 2.0,
      timeBaseMsPerDiv: 5.0,
      peakToPeakDivs: 6.0,
      periodDivs: 4.0,
      loadResistanceOhm: 25,
      displayMode: "ac-sinusoid",
    },
    targetQuantityKey: "vRmsV",
    hiddenQuantities: ["vRmsV", "vPeakV", "vPeakToPeakV"],
    unit: "V",
    requiredGivens: [
      { name: "yGainVPerDiv", value: 2.0, unit: "V div⁻¹", source: "either" },
      { name: "peakToPeakDivs", value: 6.0, source: "stem" },
    ],
    stem: "An oscilloscope set to Y-gain 2.00 V div⁻¹ displays an alternating sinusoid spanning 6.00 vertical divisions from trough to peak. Calculate the root-mean-square potential difference V_rms of the supply.",
    buildDistractors: (q) => {
      const vrms = q.vRmsV as number;
      return [
        { value: q.vPeakV as number, rationale: "Reports peak voltage V₀ = 6.00 V without dividing by √2." },
        { value: vrms * 2, rationale: "Divides peak-to-peak voltage directly by √2 instead of halving first." },
        { value: q.vPeakToPeakV as number, rationale: "Reports full peak-to-peak voltage." },
      ];
    },
    buildWorked: (q) => {
      const vrms = q.vRmsV as number;
      return {
        worked: `V_pp = 6.00 × 2.00 = 12.0 V ⇒ V₀ = 6.00 V ⇒ V_rms = V₀ / √2 = ${fmt3(vrms, "V")}.`,
        markCriterion: `Halves V_pp and divides by √2 to find V_rms = ${fmt3(vrms, "V")}.`,
      };
    },
  },
  {
    slug: "q-cro-vrms-7",
    kind: "al-a2-oscilloscope-ac-rms",
    subtopic: "3.7.5",
    conceptId: "ac-generators-transformers",
    templateArchetype: "al-a2-oscilloscope-ac-rms",
    difficulty: "standard",
    questionStyle: "experimental",
    scenarioSpec: {
      kind: "al-a2-oscilloscope-ac-rms",
      yGainVPerDiv: 5.0,
      timeBaseMsPerDiv: 2.0,
      peakToPeakDivs: 5.0,
      periodDivs: 5.0,
      loadResistanceOhm: 50,
      displayMode: "timebase-off",
    },
    targetQuantityKey: "vRmsV",
    hiddenQuantities: ["vRmsV", "vPeakV", "vPeakToPeakV"],
    unit: "V",
    requiredGivens: [
      { name: "yGainVPerDiv", value: 5.0, unit: "V div⁻¹", source: "either" },
      { name: "peakToPeakDivs", value: 5.0, source: "stem" },
    ],
    stem: "With its time-base switched OFF and Y-gain set to 5.00 V div⁻¹, a cathode-ray oscilloscope shows a centred vertical line 5.00 divisions tall for a sinusoidal AC input. Determine V_rms.",
    buildDistractors: (q) => {
      const vrms = q.vRmsV as number;
      return [
        { value: q.vPeakV as number, rationale: "Reports peak voltage V₀ = 12.5 V instead of V_rms." },
        { value: vrms * 2, rationale: "Forgets to halve peak-to-peak vertical trace height before dividing by √2." },
        { value: q.vPeakToPeakV as number, rationale: "Takes full trace height as V_rms." },
      ];
    },
    buildWorked: (q) => {
      const vrms = q.vRmsV as number;
      return {
        worked: `Trace height = V_pp = 5.00 × 5.00 = 25.0 V ⇒ V₀ = 12.5 V ⇒ V_rms = 12.5 / √2 = ${fmt3(vrms, "V")}.`,
        markCriterion: `Determines V_rms = ${fmt3(vrms, "V")} from time-base-OFF trace.`,
      };
    },
  },
  {
    slug: "q-cro-freq-8",
    kind: "al-a2-oscilloscope-ac-rms",
    subtopic: "3.7.5",
    conceptId: "ac-generators-transformers",
    templateArchetype: "al-a2-oscilloscope-ac-rms",
    difficulty: "foundation",
    questionStyle: "experimental",
    scenarioSpec: {
      kind: "al-a2-oscilloscope-ac-rms",
      yGainVPerDiv: 2.0,
      timeBaseMsPerDiv: 2.5,
      peakToPeakDivs: 4.0,
      periodDivs: 4.0,
      loadResistanceOhm: 20,
      displayMode: "ac-sinusoid",
    },
    targetQuantityKey: "freqHz",
    hiddenQuantities: ["freqHz", "periodS"],
    unit: "Hz",
    requiredGivens: [
      { name: "timeBaseMsPerDiv", value: 2.5, unit: "ms div⁻¹", source: "either" },
      { name: "periodDivs", value: 4.0, source: "stem" },
    ],
    stem: "One complete cycle of a sinusoidal trace spans 4.00 horizontal divisions on an oscilloscope set to a time-base of 2.50 ms div⁻¹. Calculate the frequency of the AC signal.",
    buildDistractors: (q) => {
      const f = q.freqHz as number;
      return [
        { value: f * 1e-3, rationale: "Forgets to convert milliseconds into seconds." },
        { value: f * 2, rationale: "Treats half a wavelength as a complete period." },
        { value: f * 0.5, rationale: "Measures two cycles as a single period." },
      ];
    },
    buildWorked: (q) => {
      const f = q.freqHz as number;
      return {
        worked: `T = 4.00 × 2.50 ms = 10.0 ms = 0.0100 s ⇒ f = 1 / T = ${fmt3(f, "Hz")}.`,
        markCriterion: `Calculates frequency f = ${fmt3(f, "Hz")}.`,
      };
    },
  },
  {
    slug: "q-cro-power-9",
    kind: "al-a2-oscilloscope-ac-rms",
    subtopic: "3.7.5",
    conceptId: "ac-generators-transformers",
    templateArchetype: "al-a2-oscilloscope-ac-rms",
    difficulty: "higher",
    questionStyle: "calculation",
    scenarioSpec: {
      kind: "al-a2-oscilloscope-ac-rms",
      yGainVPerDiv: 5.0,
      timeBaseMsPerDiv: 4.0,
      peakToPeakDivs: 6.0,
      periodDivs: 5.0,
      loadResistanceOhm: 30,
      displayMode: "dc-comparison",
    },
    targetQuantityKey: "meanPowerW",
    hiddenQuantities: ["meanPowerW", "peakPowerW", "vRmsV"],
    unit: "W",
    requiredGivens: [
      { name: "yGainVPerDiv", value: 5.0, unit: "V div⁻¹", source: "either" },
      { name: "peakToPeakDivs", value: 6.0, source: "stem" },
      { name: "loadResistanceOhm", value: 30, unit: "Ω", source: "stem" },
    ],
    stem: "An oscilloscope (Y-gain 5.00 V div⁻¹) connected across a 30.0 Ω heating resistor displays a sinusoidal wave 6.00 divisions peak-to-peak. Calculate the mean power dissipated in the resistor.",
    buildDistractors: (q) => {
      const pMean = q.meanPowerW as number;
      return [
        { value: q.peakPowerW as number, rationale: "Computes peak power V₀² / R instead of mean power V_rms² / R." },
        { value: pMean * 4, rationale: "Uses V_pp² / (2R) without halving peak-to-peak voltage." },
        { value: pMean * 0.5, rationale: "Divides peak power by 4 instead of 2." },
      ];
    },
    buildWorked: (q) => {
      const pMean = q.meanPowerW as number;
      return {
        worked: `V_pp = 30.0 V ⇒ V₀ = 15.0 V ⇒ V_rms = 15.0 / √2 = 10.6 V. P_mean = V_rms² / R = (15.0² / 2) / 30.0 = ${fmt3(pMean, "W")}.`,
        markCriterion: `Finds mean resistive power ${fmt3(pMean, "W")}.`,
      };
    },
  },

  // --- 3.8 Electron Diffraction & Nuclear Reactor (6 quant MCQs) ---
  {
    slug: "q-ediff-theta-1",
    kind: "al-a2-electron-diffraction-vs-rutherford",
    subtopic: "3.8",
    conceptId: "rutherford-scattering-nuclear-radius",
    templateArchetype: "al-a2-electron-diffraction-vs-rutherford",
    difficulty: "standard",
    questionStyle: "calculation",
    scenarioSpec: {
      kind: "al-a2-electron-diffraction-vs-rutherford",
      electronEnergyMeV: 420,
      massNumberA: 16,
      r0Fm: 1.05,
      alphaEnergyMeV: 6.0,
      targetAtomicNumberZ: 8,
    },
    targetQuantityKey: "thetaMinDeg",
    hiddenQuantities: ["thetaMinDeg", "sinThetaMin", "nuclearRadiusM"],
    unit: "°",
    requiredGivens: [
      { name: "electronEnergyMeV", value: 420, unit: "MeV", source: "stem" },
      { name: "massNumberA", value: 16, source: "stem" },
      { name: "r0Fm", value: 1.05, unit: "fm", source: "stem" },
    ],
    stem: "High-energy electrons of kinetic energy 420 MeV (λ ≈ hc / E) diffract around oxygen-16 nuclei (A = 16, R₀ = 1.05 fm). Using h = 6.63 × 10⁻³⁴ J s, c = 3.00 × 10⁸ m s⁻¹, e = 1.60 × 10⁻¹⁹ C, and sin θ ≈ 0.61 λ / R, calculate the angle θ_min of the first diffraction minimum.",
    buildDistractors: (q) => {
      const sinT = q.sinThetaMin as number;
      return [
        { value: Math.asin(Math.min(0.99, sinT / 0.61)) * (180 / Math.PI), rationale: "Omits the factor 0.61 in sin θ ≈ 0.61 λ / R." },
        { value: Math.asin(Math.min(0.99, sinT * 0.5)) * (180 / Math.PI), rationale: "Uses nuclear diameter 2R instead of nuclear radius R." },
        { value: sinT * (180 / Math.PI), rationale: "Applies small-angle θ ≈ sin θ without arcsin." },
      ];
    },
    buildWorked: (q) => {
      const lam = q.deBroglieWavelengthFm as number;
      const rad = q.nuclearRadiusFm as number;
      const deg = q.thetaMinDeg as number;
      return {
        worked: `λ = hc / E = ${fmt3(lam, "fm")}; R = R₀ A^(1/3) = ${fmt3(rad, "fm")}. sin θ = 0.61 λ / R = ${fmt3(q.sinThetaMin as number)} ⇒ θ_min = ${fmt3(deg, "°")}.`,
        markCriterion: `Determines first diffraction minimum angle ${fmt3(deg, "°")}.`,
      };
    },
  },
  {
    slug: "q-ediff-radius-2",
    kind: "al-a2-electron-diffraction-vs-rutherford",
    subtopic: "3.8",
    conceptId: "rutherford-scattering-nuclear-radius",
    templateArchetype: "al-a2-electron-diffraction-vs-rutherford",
    difficulty: "standard",
    questionStyle: "calculation",
    scenarioSpec: {
      kind: "al-a2-electron-diffraction-vs-rutherford",
      electronEnergyMeV: 250,
      massNumberA: 56,
      r0Fm: 1.15,
      alphaEnergyMeV: 5.5,
      targetAtomicNumberZ: 26,
    },
    targetQuantityKey: "nuclearRadiusFm",
    hiddenQuantities: ["nuclearRadiusFm", "deBroglieWavelengthFm"],
    unit: "fm",
    requiredGivens: [
      { name: "electronEnergyMeV", value: 250, unit: "MeV", source: "stem" },
    ],
    stem: "A beam of 250 MeV electrons (λ ≈ hc / E) scatters off iron-56 nuclei, producing a non-zero first diffraction minimum at θ_min = 43.3° (h = 6.63 × 10⁻³⁴ J s, c = 3.00 × 10⁸ m s⁻¹, e = 1.60 × 10⁻¹⁹ C). Using sin θ ≈ 0.61 λ / R, calculate the nuclear radius R of iron-56 in femtometres.",
    buildDistractors: (q) => {
      const rad = q.nuclearRadiusFm as number;
      return [
        { value: rad / 0.61, rationale: "Omits the factor 0.61." },
        { value: rad * 2, rationale: "Confuses nuclear radius R with nuclear diameter 2R." },
        { value: rad * 0.61, rationale: "Multiplies by 0.61 twice." },
      ];
    },
    buildWorked: (q) => {
      const lam = q.deBroglieWavelengthFm as number;
      const rad = q.nuclearRadiusFm as number;
      return {
        worked: `λ = hc / E = ${fmt3(lam, "fm")}. Rearranging sin θ ≈ 0.61 λ / R gives R = 0.61 λ / sin(43.3°) = ${fmt3(rad, "fm")}.`,
        markCriterion: `Calculates nuclear radius R = ${fmt3(rad, "fm")}.`,
      };
    },
  },
  {
    slug: "q-ediff-alpha-rmin-3",
    kind: "al-a2-electron-diffraction-vs-rutherford",
    subtopic: "3.8",
    conceptId: "rutherford-scattering-nuclear-radius",
    templateArchetype: "al-a2-electron-diffraction-vs-rutherford",
    difficulty: "standard",
    questionStyle: "calculation",
    scenarioSpec: {
      kind: "al-a2-electron-diffraction-vs-rutherford",
      electronEnergyMeV: 300,
      massNumberA: 197,
      r0Fm: 1.2,
      alphaEnergyMeV: 6.2,
      targetAtomicNumberZ: 79,
    },
    targetQuantityKey: "alphaClosestApproachFm",
    hiddenQuantities: ["alphaClosestApproachFm"],
    unit: "fm",
    requiredGivens: [
      { name: "alphaEnergyMeV", value: 6.2, unit: "MeV", source: "stem" },
      { name: "targetAtomicNumberZ", value: 79, source: "stem" },
    ],
    stem: "An alpha particle (+2e) of kinetic energy 6.20 MeV approaches a stationary gold-197 nucleus (Z = 79) head-on. Taking e = 1.60 × 10⁻¹⁹ C and ε₀ = 8.85 × 10⁻¹² F m⁻¹, calculate the distance of closest approach r_min in femtometres.",
    buildDistractors: (q) => {
      const rmin = q.alphaClosestApproachFm as number;
      return [
        { value: rmin * 0.5, rationale: "Forgets the factor of 2 for the +2e charge of the alpha particle." },
        { value: rmin * (197 / 79), rationale: "Uses nucleon number A = 197 instead of proton number Z = 79." },
        { value: rmin * 2, rationale: "Multiplies by an extra factor of two." },
      ];
    },
    buildWorked: (q) => {
      const rmin = q.alphaClosestApproachFm as number;
      return {
        worked: `Equating Eₖ = (2e)(79e) / (4πε₀ r_min) gives r_min = (2 × 79 × (1.60 × 10⁻¹⁹)²) / (4π × 8.85 × 10⁻¹² × 6.20 × 10⁶ × 1.60 × 10⁻¹⁹) = ${fmt3(rmin, "fm")}.`,
        markCriterion: `Finds distance of closest approach ${fmt3(rmin, "fm")}.`,
      };
    },
  },
  {
    slug: "q-ediff-density-4",
    kind: "al-a2-electron-diffraction-vs-rutherford",
    subtopic: "3.8",
    ncukCross: { topicId: "ncuk-ac7", subtopicId: "ncuk-ac7-1" },
    conceptId: "rutherford-scattering-nuclear-radius",
    templateArchetype: "al-a2-electron-diffraction-vs-rutherford",
    difficulty: "higher",
    questionStyle: "calculation",
    scenarioSpec: {
      kind: "al-a2-electron-diffraction-vs-rutherford",
      electronEnergyMeV: 360,
      massNumberA: 27,
      r0Fm: 1.05,
      alphaEnergyMeV: 5.0,
      targetAtomicNumberZ: 13,
    },
    targetQuantityKey: "nuclearDensityKgPerM3",
    hiddenQuantities: ["nuclearDensityKgPerM3"],
    unit: "kg m⁻³",
    requiredGivens: [
      { name: "r0Fm", value: 1.05, unit: "fm", source: "stem" },
    ],
    stem: "Electron diffraction measurements give R₀ = 1.05 fm in R = R₀ A^(1/3). Taking the average nucleon mass as u = 1.661 × 10⁻²⁷ kg, calculate the density of nuclear matter.",
    buildDistractors: (q) => {
      const rho = q.nuclearDensityKgPerM3 as number;
      return [
        { value: rho / 3, rationale: "Uses (4/3)πR₀³ as 4πR₀³ when dividing mass by volume." },
        { value: rho * 27, rationale: "Forgets that nucleon number A cancels between mass Au and volume (4/3)πR₀³A." },
        { value: rho / 8, rationale: "Substitutes 2R₀ for R₀ in the volume formula." },
      ];
    },
    buildWorked: (q) => {
      const rho = q.nuclearDensityKgPerM3 as number;
      return {
        worked: `ρ = Au / [(4/3)πR₀³A] = 3u / (4πR₀³) = (3 × 1.661 × 10⁻²⁷) / [4π × (1.05 × 10⁻¹⁵)³] = ${fmt3(rho, "kg m⁻³")}.`,
        markCriterion: `Evaluates constant nuclear density ${fmt3(rho, "kg m⁻³")}.`,
      };
    },
  },
  {
    slug: "q-rx-fission-rate-5",
    kind: "al-a2-thermal-nuclear-reactor-lor",
    subtopic: "3.8",
    ncukCross: { topicId: "ncuk-ac7", subtopicId: "ncuk-ac7-3" },
    conceptId: "nuclear-fission-fusion",
    templateArchetype: "al-a2-thermal-nuclear-reactor-lor",
    difficulty: "standard",
    questionStyle: "calculation",
    scenarioSpec: {
      kind: "al-a2-thermal-nuclear-reactor-lor",
      thermalPowerMW: 1800,
      efficiencyPct: 35,
      energyPerFissionMeV: 200,
      moderatorMaterial: "graphite",
      moderatorNucleonA: 12,
      focusArea: "moderator",
    },
    targetQuantityKey: "fissionsPerSecond",
    hiddenQuantities: ["fissionsPerSecond"],
    unit: "s⁻¹",
    requiredGivens: [
      { name: "thermalPowerMW", value: 1800, unit: "MW", source: "stem" },
      { name: "energyPerFissionMeV", value: 200, unit: "MeV", source: "stem" },
    ],
    stem: "A graphite-moderated thermal nuclear reactor operates at steady thermal power output 1800 MW. Each fission of uranium-235 releases 200 MeV of thermal energy (e = 1.60 × 10⁻¹⁹ C). Calculate the number of fissions occurring per second.",
    buildDistractors: (q) => {
      const rate = q.fissionsPerSecond as number;
      return [
        { value: rate * 0.35, rationale: "Uses electrical output instead of thermal power output." },
        { value: rate * 1e-6, rationale: "Fails to convert megawatts into watts properly." },
        { value: 1800e6 / 200e6, rationale: "Divides joules per second by MeV without converting MeV to joules." },
      ];
    },
    buildWorked: (q) => {
      const eJ = q.energyPerFissionJ as number;
      const rate = q.fissionsPerSecond as number;
      return {
        worked: `Energy per fission = 200 × 10⁶ × 1.60 × 10⁻¹⁹ = ${fmt3(eJ, "J")}. Fission rate = (1.80 × 10⁹) / (${fmt3(eJ)}) = ${fmt3(rate, "s⁻¹")}.`,
        markCriterion: `Converts MeV to J and finds fission rate ${fmt3(rate, "s⁻¹")}.`,
      };
    },
  },
  {
    slug: "q-rx-mod-elastic-6",
    kind: "al-a2-thermal-nuclear-reactor-lor",
    subtopic: "3.8",
    conceptId: "nuclear-fission-fusion",
    templateArchetype: "al-a2-thermal-nuclear-reactor-lor",
    difficulty: "higher",
    questionStyle: "calculation",
    scenarioSpec: {
      kind: "al-a2-thermal-nuclear-reactor-lor",
      thermalPowerMW: 1500,
      efficiencyPct: 33,
      energyPerFissionMeV: 202,
      moderatorMaterial: "graphite",
      moderatorNucleonA: 12,
      focusArea: "moderator",
    },
    targetQuantityKey: "maxHeadOnKeFractionTransferred",
    hiddenQuantities: ["maxHeadOnKeFractionTransferred"],
    requiredGivens: [
      { name: "moderatorNucleonA", value: 12, source: "stem" },
    ],
    stem: "In a head-on elastic collision between a fast neutron (mass 1 u) and a stationary carbon-12 moderator nucleus (mass A = 12 u), the fraction of kinetic energy transferred to the carbon nucleus is 4A / (1 + A)². Calculate this kinetic energy transfer fraction.",
    buildDistractors: (q) => {
      const frac = q.maxHeadOnKeFractionTransferred as number;
      return [
        { value: 1 - frac, rationale: "Calculates the fraction retained by the neutron instead of transferred to the carbon nucleus." },
        { value: 12 / 13, rationale: "Uses A / (1 + A) instead of 4A / (1 + A)²." },
        { value: 4 / 12, rationale: "Evaluates 4 / A." },
      ];
    },
    buildWorked: (q) => {
      const frac = q.maxHeadOnKeFractionTransferred as number;
      return {
        worked: `ΔEₖ / Eₖ = 4 × 12 / (1 + 12)² = 48 / 169 = ${fmt3(frac)}.`,
        markCriterion: `Evaluates elastic transfer fraction ${fmt3(frac)}.`,
      };
    },
  },
];

/* ========================================================================== */
/*  BANK 3: 22 AUTHENTIC 6-MARK LoRs ACROSS 11 DISTINCT LoR TEMPLATES         */
/* ========================================================================== */

interface LorBlueprint {
  readonly slug: string;
  readonly kind: AlevelCoreA2ScenarioKind;
  readonly subtopic: A2SubtopicKey;
  readonly extraAlevel?: A2SubtopicKey;
  readonly ncukCross?: { topicId: string; subtopicId: string };
  readonly conceptId: string;
  readonly templateArchetype: string;
  readonly difficulty: QuestionDifficulty;
  readonly questionStyle: QuestionStyleTag;
  readonly scenarioSpec: Record<string, unknown>;
  readonly targetQuantityKey: string;
  readonly stem: string;
  readonly partPrompt: string;
  readonly expectedAnswerSuffix: string;
  readonly workingSteps: readonly string[];
  readonly criteria6: readonly [string, string, string, string, string, string];
}

const LOR_BLUEPRINTS: readonly LorBlueprint[] = [
  // 1. Damping & Resonance Curves LoR (2 distinct contextual variants)
  {
    slug: "lor-resonance-bridge-a",
    kind: "al-a2-damping-resonance-curves",
    subtopic: "3.6.1",
    ncukCross: { topicId: "ncuk-ac6", subtopicId: "ncuk-ac6-1" },
    conceptId: "forced-oscillations-resonance",
    templateArchetype: "al-a2-damping-resonance-curves-lor",
    difficulty: "higher",
    questionStyle: "qualitative",
    scenarioSpec: RES_SPEC_A,
    targetQuantityKey: "dampingEffectAnchor",
    stem: "The diagram displays amplitude-frequency resonance curves and phase-lag curves for a forced mechanical oscillator subjected to light, moderate, and heavy viscous damping.",
    partPrompt:
      "Explain the condition for resonance, describe how increasing damping alters the resonance curve, and explain how the phase difference between the oscillator and the periodic driver varies across driving frequencies from well below f₀ to well above f₀.",
    expectedAnswerSuffix:
      "Resonance occurs when the driving frequency equals the natural frequency f₀, producing maximum amplitude and maximum rate of energy transfer from driver to oscillator. As damping increases, the oscillator loses more mechanical energy per cycle to thermal energy, so peak amplitude decreases across all frequencies, the peak broadens, and the peak frequency shifts slightly below f₀. The oscillator displacement lags the driving force by approximately 0 rad for f << f₀ (in phase), passes through exactly π/2 rad (90°) at f = f₀ so driving force acts in phase with velocity, and approaches π rad (180°, antiphase) for f >> f₀.",
    workingSteps: [
      "Define resonance via matching driving frequency to natural frequency f₀ and maximum energy transfer rate.",
      "Detail all three effects of heavier damping: reduced amplitude everywhere, broader peak, and peak shifted slightly left of f₀.",
      "Trace phase lag behind driver continuously from 0 (f << f₀) through π/2 rad at resonance (f = f₀) to π rad (f >> f₀).",
    ],
    criteria6: [
      "L1a: States that resonance occurs when driving frequency equals the oscillator's natural frequency f₀, giving maximum amplitude.",
      "L1b: Links resonance to the maximum rate of energy transfer from the periodic driver to the oscillator.",
      "L2a: Explains that heavier damping lowers amplitude at all frequencies and broadens the resonance peak due to greater energy dissipation per cycle.",
      "L2b: Explicitly notes that increasing damping shifts the resonant peak frequency slightly below f₀.",
      "L3a: States that oscillator displacement lags driver by ~0 rad when f << f₀ and by π/2 rad (90°) at resonance f = f₀.",
      "L3b: States that displacement lags driver by ~π rad (180°, antiphase) when f >> f₀, and notes heavier damping makes the phase transition more gradual.",
    ],
  },
  {
    slug: "lor-resonance-seismic-b",
    kind: "al-a2-damping-resonance-curves",
    subtopic: "3.6.1",
    ncukCross: { topicId: "ncuk-ac6", subtopicId: "ncuk-ac6-1" },
    conceptId: "forced-oscillations-resonance",
    templateArchetype: "al-a2-damping-resonance-curves-lor",
    difficulty: "higher",
    questionStyle: "qualitative",
    scenarioSpec: RES_SPEC_B,
    targetQuantityKey: "dampingEffectAnchor",
    stem: "During seismic testing of a tall steel skyscraper frame on a horizontal shake table, engineers measure building sway amplitude and phase lag across a sweep of ground-vibration frequencies before and after installing tuned viscous dampers.",
    partPrompt:
      "Explain why large destructive sway occurs near the natural frequency of the frame, how installing viscous dampers modifies the full amplitude-frequency response, and how the phase lag of roof displacement behind ground forcing behaves across the frequency sweep.",
    expectedAnswerSuffix:
      "Destructive resonance arises when the seismic driving frequency matches the building's natural frequency f₀, maximising the rate of mechanical energy transfer into the structure. Installing viscous dampers dissipates vibrational energy as heat each cycle, reducing amplitude at every frequency, broadening the peak, and shifting the resonant peak slightly below f₀. At frequencies well below f₀ the frame moves in phase with the ground (0 rad lag); at f = f₀ it lags by π/2 rad (90°); well above f₀ inertia causes it to move in antiphase (π rad lag).",
    workingSteps: [
      "Relate structural resonance to seismic driving frequency matching natural frequency f₀.",
      "Explain how hydraulic/viscous dampers dissipate energy, dropping amplitude everywhere, broadening the peak, and shifting peak frequency below f₀.",
      "Explain phase-lag evolution 0 → π/2 rad at f₀ → π rad at high driving frequencies.",
    ],
    criteria6: [
      "L1a: Identifies resonance when ground driving frequency matches the skyscraper's natural frequency f₀.",
      "L1b: Explains that at resonance the rate of energy transfer into structural oscillations is maximised.",
      "L2a: Explains that dampers dissipate mechanical energy to thermal energy each cycle, lowering amplitude at all frequencies and broadening the peak.",
      "L2b: Correctly states that adding damping shifts the peak frequency slightly below f₀.",
      "L3a: States phase lag behind the driver is ~0 rad well below f₀ and π/2 rad (90°) at f = f₀.",
      "L3b: States phase lag approaches π rad (180°, antiphase) well above f₀, explaining high-frequency inertial lag.",
    ],
  },

  // 2. Damped Oscillation Decay LoR (2 variants)
  {
    slug: "lor-damped-regimes-vehicle-a",
    kind: "al-a2-damped-oscillation-decay",
    subtopic: "3.6.1",
    ncukCross: { topicId: "ncuk-ac6", subtopicId: "ncuk-ac6-1" },
    conceptId: "forced-oscillations-resonance",
    templateArchetype: "al-a2-damped-oscillation-decay-lor",
    difficulty: "standard",
    questionStyle: "qualitative",
    scenarioSpec: DECAY_SPEC_CRIT,
    targetQuantityKey: "suspensionBridgeAnchor",
    stem: "The displacement-time curves compare three free damping regimes (curves A, B, and C) for a spring-supported vehicle suspension unit displaced vertically and released from rest.",
    partPrompt:
      "Identify and contrast the physical behaviour of light damping, critical damping, and heavy overdamping, explain the energy transfer responsible for amplitude decay in light damping, and justify why vehicle shock absorbers are engineered close to critical damping.",
    expectedAnswerSuffix:
      "Curve A shows light damping: the oscillator executes repeated cycles of roughly constant period while resistive drag transfers mechanical energy to thermal energy so peak amplitude decays exponentially (by a constant fraction per cycle). Curve B shows critical damping: the system returns to equilibrium in the shortest possible time without oscillating or overshooting. Curve C shows heavy overdamping: large viscous drag causes a slow asymptotic creep back to equilibrium without oscillating. Vehicle shock absorbers target critical damping so tyres recover road contact rapidly after a bump without bouncing (underdamped) or staying compressed too slowly (overdamped).",
    workingSteps: [
      "Contrast light (exponential oscillating decay), critical (fastest non-oscillatory return), and heavy (slow non-oscillatory return) regimes.",
      "Connect amplitude decay to dissipative drag transferring mechanical energy into thermal energy.",
      "Justify critical damping in vehicle suspension for rapid road-grip recovery without bounce.",
    ],
    criteria6: [
      "L1a: Correctly identifies light damping (curve A) as oscillating with exponentially decaying amplitude and approximately constant period.",
      "L1b: Explains that resistive damping forces do work to transfer mechanical energy into thermal energy in the damper/surroundings.",
      "L2a: Defines critical damping (curve B) as returning to equilibrium in the shortest possible time without oscillating/overshooting.",
      "L2b: Distinguishes heavy/overdamping (curve C) as returning to equilibrium without oscillating but taking significantly longer than critical damping.",
      "L3a: Justifies critical damping for car suspension so wheels return rapidly to normal position after a bump for safe tyre grip.",
      "L3b: Explains why light damping causes uncomfortable/unsafe repeated bouncing whereas heavy damping leaves suspension sluggish over consecutive bumps.",
    ],
  },
  {
    slug: "lor-damped-regimes-meter-b",
    kind: "al-a2-damped-oscillation-decay",
    subtopic: "3.6.1",
    ncukCross: { topicId: "ncuk-ac6", subtopicId: "ncuk-ac6-1" },
    conceptId: "forced-oscillations-resonance",
    templateArchetype: "al-a2-damped-oscillation-decay-lor",
    difficulty: "standard",
    questionStyle: "qualitative",
    scenarioSpec: DECAY_SPEC_LIGHT,
    targetQuantityKey: "suspensionBridgeAnchor",
    stem: "An engineer compares three damping designs for the pointer of a precision analogue balance (air vane light damping, tuned electromagnetic critical damping, and thick oil heavy damping).",
    partPrompt:
      "Describe the displacement-time response of each damping regime when a test mass is placed on the pan, explain why fractional mechanical energy loss per cycle in light damping depends on amplitude squared, and evaluate which damping regime is best suited for rapid accurate measurements.",
    expectedAnswerSuffix:
      "Light damping produces oscillations of nearly constant period inside an exponential decay envelope as mechanical energy dissipates as heat; since total energy E is proportional to A², halving amplitude leaves only one quarter of the energy. Critical damping returns the pointer to its equilibrium reading in the shortest possible time without oscillating or overshooting, whereas heavy overdamping creeps slowly toward equilibrium without oscillating. Critical damping is optimal for precision instruments because the operator neither waits for decaying swings nor waits for sluggish viscous drift.",
    workingSteps: [
      "Characterise light, critical, and heavy damping responses cleanly.",
      "Relate light-damping energy decay to E ∝ A² and thermal dissipation.",
      "Conclude why critical damping yields the fastest stable reading.",
    ],
    criteria6: [
      "L1a: Describes light damping as repeated oscillations with exponentially decreasing amplitude and approximately constant period.",
      "L1b: States that dissipative forces convert mechanical energy into thermal energy and notes E ∝ A².",
      "L2a: Defines critical damping accurately: returns to equilibrium in the shortest possible time without oscillating.",
      "L2b: Describes heavy overdamping as non-oscillatory slow asymptotic approach taking longer than critical damping.",
      "L3a: Selects critical damping as optimal for rapid accurate readings without pointer overshoot.",
      "L3b: Contrasts operational drawbacks of light damping (waiting for swings to die down) and heavy damping (slow settling delay).",
    ],
  },

  // 3. Kinetic Theory Derivation & Assumptions LoR (2 variants)
  {
    slug: "lor-kt-derivation-cube-a",
    kind: "al-a2-kinetic-theory-assumptions-lor",
    subtopic: "3.6.2",
    conceptId: "ideal-gas-kinetic-theory",
    templateArchetype: "al-a2-kinetic-theory-derivation-lor",
    difficulty: "higher",
    questionStyle: "derivation",
    scenarioSpec: KT_SPEC_DEFAULT,
    targetQuantityKey: "kineticAnchor",
    stem: "Consider N molecules of an ideal monatomic gas, each of mass m, sealed inside a cubic container of side L and volume V = L³, as illustrated.",
    partPrompt:
      "Use Newton's laws of motion to derive the kinetic theory equation pV = (1/3) N m c_rms² from single-molecule wall collisions, clearly justifying every factor including the factor of one-third, and state the key assumptions of the model.",
    expectedAnswerSuffix:
      "A single molecule travelling with x-velocity +u rebounds elastically from the wall face of area L², reversing velocity to −u for a momentum change Δp = −2mu. The time between consecutive impacts on the same face is the round trip t = 2L / u. By Newton's second law the mean force exerted by the wall on the molecule is F = Δp / t = −mu² / L, and by Newton's third law the molecule exerts an equal and opposite outward force +mu² / L on the wall, producing pressure p₁ = F / L² = mu² / L³ = mu² / V. Summing over all N molecules gives pV = Nm⟨u²⟩. Because molecular motion is random with all three orthogonal directions equally likely, ⟨u²⟩ = ⟨v²⟩ = ⟨w²⟩ = (1/3) c_rms², yielding pV = (1/3) N m c_rms². Key assumptions: negligible molecular volume relative to container volume, negligible intermolecular forces except during elastic collisions, negligible collision duration compared with time between collisions, and large N moving randomly.",
    workingSteps: [
      "L1: Elastic wall impact reverses velocity: Δp = −2mu (direction reversal explicitly stated).",
      "L2: Round-trip time t = 2L/u, Newton's 2nd law F = Δp/t = mu²/L, Newton's 3rd law on wall, and pressure p = F/L² = mu²/V.",
      "L3: Sum over N molecules, apply 3D isotropy ⟨u²⟩ = ⟨v²⟩ = ⟨w²⟩ = (1/3) c_rms², and state ideal-gas assumptions.",
    ],
    criteria6: [
      "L1a: States molecule collides elastically with wall so velocity reverses from +u to −u, giving momentum change Δp = −2mu (do not award without direction reversal).",
      "L1b: Finds time between collisions with the same wall as round-trip t = 2L / u.",
      "L2a: Applies Newton's second law F = Δp / t = mu² / L AND explicitly invokes Newton's third law for the equal and opposite force exerted on the wall.",
      "L2b: Divides force by wall area L² to obtain single-molecule pressure p₁ = mu² / L³ = mu² / V and sums over N molecules to get pV = Nm⟨u²⟩.",
      "L3a: Justifies factor 1/3 explicitly from random isotropic motion making x, y, z directions equally likely so ⟨u²⟩ = ⟨v²⟩ = ⟨w²⟩ = (1/3) c_rms² → pV = (1/3) N m c_rms².",
      "L3b: States at least three kinetic theory assumptions (negligible molecular volume, negligible intermolecular forces except during collisions, negligible collision duration, elastic collisions).",
    ],
  },
  {
    slug: "lor-kt-assumptions-realgas-b",
    kind: "al-a2-kinetic-theory-assumptions-lor",
    subtopic: "3.6.2",
    conceptId: "ideal-gas-kinetic-theory",
    templateArchetype: "al-a2-kinetic-theory-derivation-lor",
    difficulty: "higher",
    questionStyle: "derivation",
    scenarioSpec: {
      ...KT_SPEC_DEFAULT,
      cubeSideM: 0.35,
      molarMassKgPerMol: 0.04,
      temperatureK: 360,
      gasLabel: "Argon",
    },
    targetQuantityKey: "kineticAnchor",
    stem: "The diagram pairs a cubic gas-molecule collision model with a graph of pV / (nRT) against pressure p comparing an ideal gas to real argon gas.",
    partPrompt:
      "Explain microscopically how molecular impacts produce gas pressure leading to pV = (1/3) N m c_rms², state the microscopic assumptions behind this equation, and explain why the real-gas curve deviates from 1.0 at high pressure and low temperature.",
    expectedAnswerSuffix:
      "Molecules rebounding elastically off a wall reverse velocity (+u to −u), producing momentum change −2mu over round-trip interval 2L/u; by Newton's second and third laws each exerts mean outward force mu²/L across area L² (p₁ = mu²/V). Summing over N molecules and using isotropic random motion (all x, y, z directions equally likely so ⟨u²⟩ = (1/3) c_rms²) yields pV = (1/3) N m c_rms². The model assumes negligible molecular volume, zero intermolecular forces except during elastic collisions, and negligible collision duration. Real gases deviate from pV/(nRT) = 1 at low temperatures and moderate pressures because intermolecular attractions pull molecules slightly inward, lowering wall impact force, and deviate upward at very high pressures because finite molecular volume occupies a significant fraction of V.",
    workingSteps: [
      "Derive pressure via elastic rebound Δp = −2mu, t = 2L/u, N2/N3 wall force, and 3D isotropy factor 1/3.",
      "State the microscopic assumptions of kinetic theory.",
      "Connect high-pressure/low-temperature real-gas deviations directly to breakdown of the zero-volume and zero-force assumptions.",
    ],
    criteria6: [
      "L1a: Explains elastic wall collisions reverse velocity component giving Δp = −2mu and round-trip time t = 2L / u.",
      "L1b: Uses Newton's second and third laws plus area L² to obtain pV = Nm⟨u²⟩ for N molecules.",
      "L2a: Justifies the 1/3 factor via equal probability along x, y, z axes (⟨u²⟩ = ⟨v²⟩ = ⟨w²⟩ = (1/3) c_rms²) to obtain pV = (1/3) N m c_rms².",
      "L2b: States core ideal-gas assumptions: negligible molecular volume, negligible intermolecular forces, elastic collisions, negligible collision duration.",
      "L3a: Explains real-gas dip below ideal line at moderate pressure / low temperature due to intermolecular attractive forces reducing impact force on walls.",
      "L3b: Explains steep upward deviation at very high pressure because finite molecular volume is no longer negligible compared with container volume.",
    ],
  },

  // 4. Satellite Orbits Comparison LoR (2 variants)
  {
    slug: "lor-sat-geo-vs-polar-a",
    kind: "al-a2-satellite-orbits-comparison",
    subtopic: "3.7.2",
    ncukCross: { topicId: "ncuk-ac5", subtopicId: "ncuk-ac5-1" },
    conceptId: "gravitational-potential-orbits",
    templateArchetype: "al-a2-satellite-orbits-lor",
    difficulty: "standard",
    questionStyle: "qualitative",
    scenarioSpec: SAT_SPEC_DEFAULT,
    targetQuantityKey: "geostationaryConditionsAnchor",
    stem: "The diagram contrasts a high-altitude geostationary equatorial orbit with a low-Earth polar orbit around the rotating Earth.",
    partPrompt:
      "State all three orbital conditions required for a geostationary satellite, explain why it must orbit in the equatorial plane, and compare its orbital characteristics and practical applications with those of a low-Earth polar satellite.",
    expectedAnswerSuffix:
      "A geostationary satellite must have a twenty-four hour orbital period matching Earth rotation, directly above the equator, and orbiting west-to-east (in the same direction as Earth's rotation). Its circular orbit must lie in the equatorial plane because the gravitational centripetal force always points toward Earth's centre, so any inclined orbit crosses the equator twice per orbit and cannot stay fixed above one surface point. Geostationary satellites orbit at a fixed high altitude (~3.6 × 10⁷ m), allowing continuous 24-hour broadcast links with stationary ground dishes, though signals suffer greater latency and attenuation and miss the polar caps. By contrast, polar low-Earth satellites orbit much lower (hundreds of km) at higher speed with ~90–100 min periods; as Earth rotates beneath them, they sweep the entire surface for weather forecasting, reconnaissance, and high-resolution imaging with lower latency.",
    workingSteps: [
      "State all three compulsory AQA geostationary conditions: T = 24 h, equatorial plane, west-to-east.",
      "Explain centre-of-Earth gravitational force constraint preventing non-equatorial geostationary hover.",
      "Contrast GEO vs polar LEO altitude, speed, ground-track coverage, latency/resolution, and applications.",
    ],
    criteria6: [
      "L1a: States orbital period T = 24 h (86400 s) matching Earth's rotation period.",
      "L1b: States orbit must lie directly above the equator AND move west-to-east (same sense as Earth's rotation).",
      "L2a: Explains physically that gravitational force acts toward Earth's centre, so the orbital plane must pass through Earth's centre (impossible to stay fixed above non-zero latitude).",
      "L2b: States geostationary application (continuous satellite TV/telecommunications with fixed ground dishes) and notes high altitude (~36 000 km) causes longer signal delay/attenuation.",
      "L3a: Explains that a polar LEO orbits at low altitude (high speed, short ~90–105 min period) and sweeps the entire Earth surface as Earth rotates beneath it.",
      "L3b: Links polar LEO to weather monitoring, environmental mapping, or reconnaissance benefiting from higher spatial resolution and lower signal latency.",
    ],
  },
  {
    slug: "lor-sat-mission-selection-b",
    kind: "al-a2-satellite-orbits-comparison",
    subtopic: "3.7.2",
    ncukCross: { topicId: "ncuk-ac5", subtopicId: "ncuk-ac5-1" },
    conceptId: "gravitational-potential-orbits",
    templateArchetype: "al-a2-satellite-orbits-lor",
    difficulty: "higher",
    questionStyle: "qualitative",
    scenarioSpec: { ...SAT_SPEC_DEFAULT, leoAltitudeKm: 820 },
    targetQuantityKey: "orbitComparisonAnchor",
    stem: "A space agency must choose orbits for two missions: Mission Alpha provides uninterrupted broadband television to fixed household antennas across Europe, while Mission Beta monitors daily polar ice-sheet retreat worldwide.",
    partPrompt:
      "Recommend and justify the required orbit for each mission, stating the exact physical criteria for Mission Alpha's orbit and comparing orbital radius, speed, energy, coverage, and signal properties between the two missions.",
    expectedAnswerSuffix:
      "Mission Alpha requires a geostationary orbit with a twenty-four hour period matching Earth's rotation, directly in the equatorial plane, moving west-to-east, so the satellite stays stationary in the sky for fixed household antennas. Mission Beta requires a polar low-Earth orbit: passing over both poles at low altitude (~200–1200 km), a polar low-Earth orbit sweeps the entire Earth surface as Earth rotates beneath giving higher image resolution and lower signal latency, ideal for polar ice-sheet monitoring. By Kepler's third law (T² ∝ r³) and v = √(GM/r), Mission Beta orbits much closer to Earth at significantly higher speed with a much shorter period (~100 min) and lower launch energy requirement than Mission Alpha (~36 000 km altitude).",
    workingSteps: [
      "Assign geostationary orbit to Mission Alpha with all three required conditions.",
      "Assign polar LEO to Mission Beta explaining global/polar ground-track scanning.",
      "Compare orbital radius, orbital speed, period, image resolution, and signal latency.",
    ],
    criteria6: [
      "L1a: Assigns geostationary orbit to Mission Alpha for fixed-dish continuity and polar LEO to Mission Beta for polar coverage.",
      "L1b: Lists all three geostationary conditions: T = 24 h, directly above the equator, orbiting west-to-east.",
      "L2a: Explains how polar LEO sweeps every part of Earth's surface (including poles) as Earth rotates underneath.",
      "L2b: Compares altitudes and periods quantitatively/qualitatively (GEO ~36 000 km, 24 h vs LEO ~200–1200 km, ~90–110 min).",
      "L3a: Compares orbital speeds using v = √(GM/r): polar LEO travels much faster than geostationary satellites.",
      "L3b: Contrasts operational trade-offs: polar LEO gives higher image resolution, stronger signal/lower latency, and cheaper launch, while requiring tracking dishes and intermittent passes.",
    ],
  },

  // 5. Gravitational vs Electric Fields LoR (2 variants)
  {
    slug: "lor-fields-compare-radial-a",
    kind: "al-a2-grav-vs-electric-fields",
    subtopic: "3.7.3",
    extraAlevel: "3.7.2",
    ncukCross: { topicId: "ncuk-ac4", subtopicId: "ncuk-ac4-5" },
    conceptId: "electric-potential-equipotentials",
    templateArchetype: "al-a2-grav-vs-electric-fields-lor",
    difficulty: "standard",
    questionStyle: "qualitative",
    scenarioSpec: GE_SPEC_POS,
    targetQuantityKey: "fieldComparisonAnchor",
    stem: "The side-by-side diagrams illustrate radial field lines and concentric dashed equipotentials surrounding a spherical planet of mass M and an isolated positive point charge +Q.",
    partPrompt:
      "Compare and contrast gravitational and electrostatic fields in terms of force laws, field direction, potential signs, equipotential geometry, and relative magnitudes on the atomic scale.",
    expectedAnswerSuffix:
      "Both obey inverse-square laws with zero potential at infinity, but gravitational force is always attractive with negative potential whereas electric force can attract or repel with positive or negative potential. Gravitational field strength g = F/m = GM/r² acts radially inward toward mass M, whereas electric field strength E = F/Q = Q/(4πε₀r²) acts outward from +Q (inward toward −Q). In both fields, field strength equals negative potential gradient (g = −ΔV/Δr, E = −ΔV/Δr), equipotential surfaces are concentric spheres everywhere perpendicular to field lines, closer equipotentials indicate a stronger field, and zero work is done moving along an equipotential. Between subatomic particles such as two protons, electrostatic force exceeds gravitational force by ~10³⁶, while electric fields can be shielded by conductors whereas gravitational fields cannot.",
    workingSteps: [
      "Compare mathematical similarities: inverse-square force/field, 1/r potential, zero at infinity, negative potential gradient.",
      "Contrast fundamental differences: gravity strictly attractive (V < 0) vs electric attractive/repulsive (±V), atomic scale ratio (~10³⁶), and shielding.",
      "Explain equipotential orthogonality, spacing vs field strength, and zero work along equipotentials.",
    ],
    criteria6: [
      "L1a: States both radial fields follow inverse-square laws (F ∝ 1/r², field ∝ 1/r²) with radial field lines and potential defined as zero at infinity.",
      "L1b: States gravitational force acts on mass and is always attractive, whereas electric force acts on charge and can be attractive or repulsive.",
      "L2a: Contrasts potential signs: gravitational potential V_g = −GM/r is always negative, while electric potential V_e = Q/(4πε₀r) is positive for +Q and negative for −Q.",
      "L2b: States field strength equals the negative potential gradient (−ΔV/Δr) in both fields, so closely spaced equipotentials denote stronger fields.",
      "L3a: Explains that equipotential surfaces intersect field lines at 90° and zero work is done moving a test mass or charge along an equipotential (ΔW = 0).",
      "L3b: Notes the vast strength disparity at atomic scales (F_e/F_g ~ 10³⁶ for protons) and that electric fields can be shielded whereas gravitational fields cannot.",
    ],
  },
  {
    slug: "lor-fields-equipotentials-b",
    kind: "al-a2-grav-vs-electric-fields",
    subtopic: "3.7.3",
    extraAlevel: "3.7.2",
    ncukCross: { topicId: "ncuk-ac4", subtopicId: "ncuk-ac4-5" },
    conceptId: "electric-potential-equipotentials",
    templateArchetype: "al-a2-grav-vs-electric-fields-lor",
    difficulty: "higher",
    questionStyle: "qualitative",
    scenarioSpec: GE_SPEC_NEG,
    targetQuantityKey: "equipotentialAnchor",
    stem: "Equipotential contours separated by equal steps ΔV are mapped around a spherical planet and around an isolated negatively charged sphere −Q.",
    partPrompt:
      "Explain why both field maps share identical inward radial field patterns and negative potentials, explain how equipotential spacing relates to field strength and work done, and discuss key physical differences between the two fields when a positive vs negative test particle is introduced.",
    expectedAnswerSuffix:
      "Around both mass M and negative charge −Q, field lines point radially inward and potential is negative (approaching zero at infinity) because work must be done by an external agent to separate a test mass or positive test charge to infinity. In both maps, equipotential surfaces are always perpendicular to field lines and zero work is done moving a mass or charge along an equipotential (ΔW = mΔV or qΔV = 0). Because field strength equals negative potential gradient (−ΔV/Δr), equal-ΔV contours are tightly packed near the surface and spread further apart as 1/r² decreases. However, introducing a negative test charge near −Q reverses the force to repulsion (potential energy becomes positive), whereas gravity always attracts every mass regardless of composition; additionally, electrostatic forces vastly dominate on atomic scales and can be screened by a Faraday cage.",
    workingSteps: [
      "Explain why both M and −Q have inward field lines and negative potential (zero at infinity).",
      "Link equipotential orthogonality, zero work, and contour spacing to −ΔV/Δr.",
      "Contrast response to opposite test charge sign, force strength ratio, and shielding.",
    ],
    criteria6: [
      "L1a: Explains inward radial field lines and negative potentials around both M and −Q relative to zero at infinity.",
      "L1b: States that external work must be done to move a test mass or positive test charge away from the centre to infinity.",
      "L2a: Explains that equipotential surfaces are perpendicular to field lines everywhere so ΔW = 0 along an equipotential.",
      "L2b: Links increasing separation between equal-ΔV contours with distance to decreasing field strength via E = −ΔV/Δr (and g = −ΔV/Δr).",
      "L3a: Contrasts sign behaviour: replacing +q with −q turns electrostatic force repulsive and makes potential energy positive, whereas gravity is strictly attractive for all masses.",
      "L3b: Notes electrostatic fields are ~10³⁶ times stronger between subatomic particles and can be shielded by conductors, unlike gravity.",
    ],
  },

  // 6. Polar Dielectrics & 50% Charging Heat Loss LoR (2 variants)
  {
    slug: "lor-dielectric-mechanism-a",
    kind: "al-a2-capacitor-polar-dielectric",
    subtopic: "3.7.4",
    conceptId: "capacitor-networks-energy",
    templateArchetype: "al-a2-polar-dielectric-lor",
    difficulty: "higher",
    questionStyle: "qualitative",
    scenarioSpec: DIEL_SPEC_ISO,
    targetQuantityKey: "dielectricAnchor",
    stem: "The figure illustrates a parallel-plate capacitor filled with a polar dielectric slab alongside its linear Q–V charging graph.",
    partPrompt:
      "Explain microscopically how inserting a polar dielectric increases the capacitance of a parallel-plate capacitor, contrast the effect on V, Q, and stored energy for an isolated versus battery-connected capacitor, and explain why charging a capacitor at constant supply voltage always dissipates 50% of the supplied energy as heat.",
    expectedAnswerSuffix:
      "In the applied electric field between the plates, polar molecules rotate to align negative ends toward the positive plate, producing an opposing internal electric field that reduces net field and increases capacitance by relative permittivity εᵣ. For an isolated capacitor (Q constant), the reduced net field lowers potential difference V = Ed by factor εᵣ, so C = Q/V rises by εᵣ and stored energy E = Q²/(2C) falls by εᵣ (work is done pulling the slab in). If kept connected to a constant-V supply, extra charge flows from the supply so Q and stored energy E = ½CV² both increase by factor εᵣ. During charging from empty at constant emf V, the battery transfers work W = QV, whereas the capacitor stores only the triangular area under the V–Q graph, E = ½QV; the remaining 50% (½QV) is dissipated as thermal energy in circuit resistance regardless of the resistance value R.",
    workingSteps: [
      "L1: Polar molecule rotation/alignment (− end to + plate, + end to − plate).",
      "L2: Aligned dipoles create an opposing internal electric field reducing net E between plates.",
      "L3: Isolated (Q fixed → V falls → C = Q/V rises by εᵣ) vs connected (V fixed → extra Q flows) + 50% charging dissipation (½QV vs QV).",
    ],
    criteria6: [
      "L1a: States that polar dielectric molecules rotate and align with their negative ends facing the positive plate and positive ends facing the negative plate.",
      "L1b: Explains that the aligned dipoles produce an opposing (counter) internal electric field inside the dielectric.",
      "L2a: Explains that the opposing internal field reduces the net electric field E between the plates.",
      "L2b: Deduces for an isolated capacitor (fixed Q) that V = Ed decreases, so C = Q/V increases by factor εᵣ (and E_stored falls by εᵣ).",
      "L3a: Contrasts battery-connected case (fixed V): extra charge flows from the supply so Q and stored energy increase by factor εᵣ.",
      "L3b: Explains that charging at constant V draws W = QV from the battery while storing ½QV (area under V–Q graph), dissipating 50% (½QV) as heat in circuit resistance independent of R.",
    ],
  },
  {
    slug: "lor-dielectric-energy-balance-b",
    kind: "al-a2-capacitor-polar-dielectric",
    subtopic: "3.7.4",
    conceptId: "capacitor-networks-energy",
    templateArchetype: "al-a2-polar-dielectric-lor",
    difficulty: "higher",
    questionStyle: "qualitative",
    scenarioSpec: DIEL_SPEC_CONN,
    targetQuantityKey: "chargingEfficiencyAnchor",
    stem: "An electronics student charges an air-gap capacitor from a constant-voltage DC source through a resistor R, then slides a polar polymer dielectric slab (εᵣ > 1) into the gap while keeping the battery attached.",
    partPrompt:
      "Explain why half the energy supplied during the initial charging stage is always lost as thermal energy regardless of R, then explain microscopically why inserting the polar polymer causes additional current to flow from the battery and increases the stored electrical energy.",
    expectedAnswerSuffix:
      "When charging from 0 to Q at fixed supply emf V, the battery supplies energy Q V while the capacitor stores half Q V so exactly fifty percent is dissipated as thermal energy in circuit resistance regardless of resistance value (a larger R slows current so charging takes longer, keeping ∫I²R dt = ½QV unchanged). Sliding the polar polymer into the gap causes its permanent molecular dipoles to rotate so negative ends face the positive plate and positive ends face the negative plate. These aligned dipoles set up an opposing internal electric field that tends to reduce the net field and plate potential difference; because the battery holds V constant across the plates, extra charge flows onto the plates until net field returns to V/d, raising C by εᵣ and increasing stored energy E = ½CV² by factor εᵣ.",
    workingSteps: [
      "Explain 50% thermal loss via battery work QV vs triangular stored energy ½QV, independent of R.",
      "Describe dipole alignment (− toward + plate) and opposing internal field.",
      "Show why constant V draws additional charge from the battery, increasing C and stored energy by εᵣ.",
    ],
    criteria6: [
      "L1a: States that the constant-emf battery transfers total work W = QV while the capacitor stores E = ½QV (area under linear V–Q graph).",
      "L1b: Concludes that exactly 50% (½QV) is dissipated as thermal energy in circuit resistance regardless of the value of R.",
      "L2a: Explains that polar polymer molecules rotate to align their negative ends toward the positive plate and positive ends toward the negative plate.",
      "L2b: States that aligned dipoles create an opposing internal electric field inside the slab.",
      "L3a: Explains that because the battery maintains fixed potential difference V, additional charge flows from the supply onto the plates to restore V = Ed.",
      "L3b: Concludes that Q, capacitance C = ε₀εᵣA/d, and stored energy E = ½CV² all increase by factor εᵣ.",
    ],
  },

  // 7. Lenz's Law & Energy Conservation LoR (2 variants)
  {
    slug: "lor-lenz-magnet-coil-a",
    kind: "al-a2-lenz-law-energy-conservation",
    subtopic: "3.7.5",
    ncukCross: { topicId: "ncuk-ac4", subtopicId: "ncuk-ac4-6" },
    conceptId: "electromagnetic-induction-faraday-lenz",
    templateArchetype: "al-a2-lenz-energy-conservation-lor",
    difficulty: "standard",
    questionStyle: "qualitative",
    scenarioSpec: LENZ_SPEC_N,
    targetQuantityKey: "lenzEnergyAnchor",
    stem: "A bar magnet is released from rest (north pole downward) above a vertical solenoid connected to a centre-zero galvanometer, producing the asymmetric bipolar emf-time trace shown (g = 9.81 m s⁻²).",
    partPrompt:
      "Explain the shape, polarity, and enclosed areas of the two induced emf pulses as the magnet falls through the coil, and explain fully how Lenz's law is a direct consequence of the conservation of energy.",
    expectedAnswerSuffix:
      "As the north pole enters, flux linkage increases and by Lenz's law a north pole is induced at the top of the coil to repel and oppose approach; at the midpoint flux linkage is maximum so dΦ/dt = 0 and ε = 0; as the magnet exits, flux linkage decreases so the induced current reverses to produce a north pole at the bottom attracting the departing south pole. Because gravity accelerates the magnet, it exits faster than it enters, giving a larger rate of change of flux linkage (taller peak emf) over a shorter duration, while both pulses have equal enclosed area |∫ε dt| = NΦ. Overall, the induced emf opposes the change in magnetic flux linkage producing it so mechanical work done against magnetic opposition converts into electrical thermal energy obeying conservation of energy; if the induced pole assisted the motion, the magnet would accelerate while generating electrical power, creating energy from nothing.",
    workingSteps: [
      "Trace induced polarity on entry (repulsion), midpoint (ε = 0), and exit (attraction).",
      "Explain taller/narrower exit pulse via gravitational acceleration + equal pulse areas NΦ.",
      "Prove Lenz's law enforces conservation of energy (work against opposing force → I²Rt, contradiction if assisting).",
    ],
    criteria6: [
      "L1a: States that as the N pole approaches, increasing flux linkage induces a current creating a N pole at the top of the coil to repel the magnet.",
      "L1b: States that at the midpoint dΦ/dt = 0 so ε = 0, and on exit decreasing flux reverses current polarity to attract and oppose departure.",
      "L2a: Explains exit pulse has greater peak emf and shorter duration because gravity accelerates the magnet, increasing dΦ/dt.",
      "L2b: Explains both pulses enclose equal area because total change in flux linkage NΦ on entry equals NΦ on exit.",
      "L3a: Links opposition to energy conservation: mechanical work / loss of GPE done against opposing magnetic force converts into electrical/thermal energy (I²Rt).",
      "L3b: Explains the contradiction: if induced polarity assisted motion, the magnet would accelerate while producing electrical energy, violating conservation of energy.",
    ],
  },
  {
    slug: "lor-lenz-copper-tube-b",
    kind: "al-a2-lenz-law-energy-conservation",
    subtopic: "3.7.5",
    ncukCross: { topicId: "ncuk-ac4", subtopicId: "ncuk-ac4-6" },
    conceptId: "electromagnetic-induction-faraday-lenz",
    templateArchetype: "al-a2-lenz-energy-conservation-lor",
    difficulty: "higher",
    questionStyle: "qualitative",
    scenarioSpec: LENZ_SPEC_S,
    targetQuantityKey: "lenzEnergyAnchor",
    stem: "When a strong cylindrical magnet falls inside a thick-walled vertical copper tube (g = 9.81 m s⁻²), it quickly reaches a very low constant terminal velocity, whereas an unmagnetised steel cylinder of the same mass accelerates freely.",
    partPrompt:
      "Explain in terms of Faraday's law, Lenz's law, and conservation of energy why the magnet reaches a low terminal speed inside the non-magnetic copper tube, and describe what happens to the gravitational potential energy lost during the fall.",
    expectedAnswerSuffix:
      "As the magnet moves inside the conducting copper tube, changing magnetic flux cuts the copper walls and induces circulating eddy currents by Faraday's law (ε ∝ dΦ/dt ∝ v). By Lenz's law, the induced emf opposes the change in magnetic flux linkage producing it so mechanical work done against magnetic opposition converts into electrical thermal energy obeying conservation of energy: eddy currents ahead of the magnet repel its leading pole while eddy currents behind attract its trailing pole, generating an upward braking force proportional to speed v. As speed rises, this upward magnetic drag grows until it balances weight mg, giving zero net force and a slow constant terminal velocity. Throughout steady descent, gravitational potential energy lost converts entirely into I²Rt Joule heating inside the copper pipe rather than kinetic energy; if eddy currents assisted motion, the magnet would gain kinetic and thermal energy simultaneously, violating energy conservation.",
    workingSteps: [
      "Invoke Faraday's law for eddy currents induced in conducting copper walls proportional to speed v.",
      "Apply Lenz's law for upward braking force (repulsion below, attraction above) balancing weight mg at terminal velocity.",
      "Account for energy transfer (GPE → I²Rt thermal energy in copper) and energy-conservation contradiction if polarity assisted.",
    ],
    criteria6: [
      "L1a: Notes copper is non-ferromagnetic but electrically conducting, so falling magnetic flux induces eddy currents in the tube walls (Faraday's law).",
      "L1b: States that by Lenz's law the eddy currents create magnetic fields opposing the magnet's motion (repelling ahead, attracting behind).",
      "L2a: Explains that induced emf, eddy current, and upward magnetic braking force all increase proportionally with speed v.",
      "L2b: States terminal velocity is reached when upward magnetic braking force equals downward weight mg (zero resultant force).",
      "L3a: Accounts for energy: lost gravitational potential energy is transferred via mechanical work against magnetic opposition into I²Rt thermal heating of the copper tube.",
      "L3b: States that if induced eddy currents assisted motion, both kinetic and thermal energy would grow without energy input, violating conservation of energy.",
    ],
  },

  // 8. Transformer Losses & Core Design LoR (2 variants)
  {
    slug: "lor-transformer-losses-a",
    kind: "al-a2-transformer-losses-design",
    subtopic: "3.7.5",
    ncukCross: { topicId: "ncuk-ac4", subtopicId: "ncuk-ac4-6" },
    conceptId: "ac-generators-transformers",
    templateArchetype: "al-a2-transformer-losses-lor",
    difficulty: "standard",
    questionStyle: "qualitative",
    scenarioSpec: TRANS_SPEC_DEFAULT,
    targetQuantityKey: "transformerLossAnchor",
    stem: "The cutaway schematic shows a step-up power transformer constructed with a laminated soft-iron closed core and thick copper coils.",
    partPrompt:
      "Explain the four main sources of energy loss in a practical AC transformer and detail how each physical design feature minimises those losses to achieve efficiencies exceeding 95%.",
    expectedAnswerSuffix:
      "A laminated soft-iron core with insulating layers increases resistance to reduce eddy current heating, soft iron lowers hysteresis loss, thick copper coils cut resistive heating, and a closed core minimises flux leakage. Specifically: (1) Alternating core flux induces circulating eddy currents in the conducting iron; slicing the core into thin laminations separated by insulating varnish increases electrical resistance across eddy-current paths, reducing eddy current magnitude and I²R core heating. (2) Repeated magnetisation and demagnetisation every AC cycle dissipates hysteresis heat; magnetically soft iron magnetises and demagnetises easily with a narrow hysteresis loop. (3) Current in primary and secondary windings causes copper I²R heating; thick low-resistivity copper wire lowers winding resistance. (4) Incomplete flux linkage loses energy; a closed overlapping soft-iron core channels almost all primary magnetic flux through the secondary coil.",
    workingSteps: [
      "L1: Eddy currents in core → thin laminations with insulating varnish layers raise resistance to lower I²R core heating.",
      "L2: Hysteresis loss → magnetically soft iron; Copper winding loss → thick low-resistivity copper wire.",
      "L3: Flux leakage → closed core / overlapping windings on same limb for near-complete flux linkage.",
    ],
    criteria6: [
      "L1a: Explains that alternating magnetic flux induces circulating eddy currents inside the conducting iron core causing I²R heating.",
      "L1b: Explains that laminating the core (thin iron sheets separated by insulating layers) increases resistance to eddy-current loops, lowering eddy current heating.",
      "L2a: Identifies hysteresis loss from repeated magnetisation/demagnetisation of the core every AC cycle.",
      "L2b: States magnetically soft iron is used because it magnetises and demagnetises easily with minimal hysteresis energy loss.",
      "L3a: Identifies resistive I²R heating in the windings and explains using thick, low-resistivity copper wire to reduce resistance.",
      "L3b: Identifies magnetic flux leakage and explains using a closed soft-iron core (or overlapping coils on one limb) so nearly all flux links the secondary coil.",
    ],
  },
  {
    slug: "lor-transformer-grid-design-b",
    kind: "al-a2-transformer-losses-design",
    subtopic: "3.7.5",
    ncukCross: { topicId: "ncuk-ac4", subtopicId: "ncuk-ac4-6" },
    conceptId: "ac-generators-transformers",
    templateArchetype: "al-a2-transformer-losses-lor",
    difficulty: "higher",
    questionStyle: "qualitative",
    scenarioSpec: { ...TRANS_SPEC_DEFAULT, primaryVoltageV: 11000, secondaryTurns: 12000 },
    targetQuantityKey: "highVoltageGridAnchor",
    stem: "High-power substation transformers step generator output from 11 kV up to 400 kV for national grid transmission.",
    partPrompt:
      "Explain why AC and high transmission voltages are essential for efficient national grid power distribution, and explain how the transformer's core and winding construction minimises internal thermal losses.",
    expectedAnswerSuffix:
      "Transformers rely on continuously changing magnetic flux linkage (Faraday's law), so alternating current is required to step voltage up and down easily. For a given transmitted power P = IV, stepping up transmission voltage lowers cable current for the same power so resistive heating in power lines falls as current squared (P_loss = I²R_line = (P/V)² R_line), dramatically improving grid efficiency. Inside the substation transformer itself, internal energy losses are kept small by: laminating the iron core with thin insulated sheets to raise resistance and suppress eddy-current I²R heating; choosing magnetically soft iron to minimise hysteresis loss during 50 Hz flux reversals; winding coils from thick low-resistivity copper to cut winding I²R losses; and enclosing both coils on a closed overlapping core to prevent magnetic flux leakage.",
    workingSteps: [
      "Justify AC requirement (changing flux needed for mutual induction) and grid step-up via I = P/V and P_loss = I²R.",
      "Explain core eddy-current mitigation (insulated laminations) and hysteresis mitigation (soft iron).",
      "Explain copper winding I²R mitigation (thick low-resistivity copper) and flux-leakage reduction (closed core).",
    ],
    criteria6: [
      "L1a: Explains AC is required because transformers operate via changing magnetic flux linkage (Faraday's law); DC produces zero steady secondary emf.",
      "L1b: Explains stepping up voltage reduces line current (I = P/V) for fixed power, cutting cable thermal loss P_loss = I²R_line proportionally to 1/V².",
      "L2a: Explains core laminations separated by insulating layers increase resistance to eddy-current loops, lowering eddy-current I²R core heating.",
      "L2b: Explains magnetically soft iron reduces hysteresis heating during repeated magnetisation and demagnetisation.",
      "L3a: Explains thick low-resistivity copper windings reduce I²R resistive heating in the coils.",
      "L3b: Explains a closed / overlapping iron core ensures almost complete flux linkage between primary and secondary coils (minimising flux leakage).",
    ],
  },

  // 9. High-Energy Electron Diffraction vs Rutherford α Closest Approach LoR (2 variants)
  {
    slug: "lor-ediff-vs-alpha-a",
    kind: "al-a2-electron-diffraction-vs-rutherford",
    subtopic: "3.8",
    conceptId: "rutherford-scattering-nuclear-radius",
    templateArchetype: "al-a2-electron-diffraction-lor",
    difficulty: "higher",
    questionStyle: "qualitative",
    scenarioSpec: EDIFF_SPEC_DEFAULT,
    targetQuantityKey: "nuclearRadiusAnchor",
    stem: "The figure compares a high-energy electron diffraction intensity profile against a Rutherford alpha-particle closest-approach schematic.",
    partPrompt:
      "Compare how Rutherford alpha closest approach and high-energy electron diffraction determine nuclear radius, explain why electron diffraction is more accurate, describe the features of the diffraction graph, and explain how R = R₀ A^(1/3) proves nuclear density is constant.",
    expectedAnswerSuffix:
      "In Rutherford closest approach, equating alpha kinetic energy to Coulomb potential energy Eₖ = Q₁Q₂/(4πε₀r_min) yields only an energy-dependent upper bound / overestimate of nuclear radius, because it ignores nuclear recoil and finite alpha size and fails if the alpha gets close enough to interact via the strong nuclear force. By contrast, high-energy electrons are leptons unaffected by the strong nuclear force and diffract to a non-zero first minimum giving radius directly, whereas alpha closest approach only gives an energy-dependent upper bound. Accelerated so λ ~ 10⁻¹⁵ m (comparable to nuclear diameter), electrons produce an intensity-angle curve with a central maximum, a distinctly non-zero first minimum at sin θ ≈ 0.61λ/R, and a smaller secondary peak. Plotting R against A^(1/3) gives R = R₀ A^(1/3); substituting into ρ = Au / [(4/3)πR³] cancels A to yield constant nuclear density ρ = 3u / (4πR₀³) independent of nucleon number.",
    workingSteps: [
      "L1: Alpha closest approach (Eₖ → Q₁Q₂/4πε₀r_min) gives only an upper bound (energy-dependent, recoil, strong force).",
      "L2: High-energy electrons (λ ~ 10⁻¹⁵ m) are leptons (no strong force), giving central max + non-zero first minimum + secondary peak.",
      "L3: sin θ ≈ 0.61λ/R → R = R₀ A^(1/3) → constant nuclear density ρ = 3u/(4πR₀³) independent of A.",
    ],
    criteria6: [
      "L1a: Explains Rutherford closest approach converts alpha KE to electrostatic PE (Eₖ = Q₁Q₂ / 4πε₀r_min) giving only an upper bound / overestimate of R.",
      "L1b: States limitations of alpha method: depends on alpha energy, neglects nuclear recoil/finite alpha size, and alpha hadrons experience the strong nuclear force if too close.",
      "L2a: Explains high-energy electrons (λ ~ 10⁻¹⁵ m, comparable to nuclear size) are leptons unaffected by the strong nuclear force with negligible nuclear recoil.",
      "L2b: Describes electron diffraction graph accurately: intense central maximum, non-zero first minimum at θ_min, and smaller secondary maximum.",
      "L3a: States first minimum satisfies sin θ ≈ 0.61 λ / R, enabling direct measurement of nuclear radius R across isotopes to establish R = R₀ A^(1/3).",
      "L3b: Derives constant nuclear density ρ = Au / [(4/3)πR₀³A] = 3u / (4πR₀³), showing A cancels so nuclear density is constant and independent of mass number.",
    ],
  },
  {
    slug: "lor-ediff-density-proof-b",
    kind: "al-a2-electron-diffraction-vs-rutherford",
    subtopic: "3.8",
    conceptId: "rutherford-scattering-nuclear-radius",
    templateArchetype: "al-a2-electron-diffraction-lor",
    difficulty: "higher",
    questionStyle: "qualitative",
    scenarioSpec: {
      ...EDIFF_SPEC_DEFAULT,
      electronEnergyMeV: 250,
      massNumberA: 56,
      targetAtomicNumberZ: 26,
    },
    targetQuantityKey: "nuclearRadiusAnchor",
    stem: "Physicists scatter a monoenergetic beam of 250 MeV electrons off thin foils of carbon-12, iron-56, and lead-208 to investigate how nuclear size and density vary across the periodic table.",
    partPrompt:
      "Explain why 250 MeV electrons rather than 5 MeV alpha particles are required for this investigation, explain how the angle of the first minimum shifts from carbon-12 to lead-208, and show how the results establish uniform nucleon packing density.",
    expectedAnswerSuffix:
      "Electrons at 250 MeV have relativistic de Broglie wavelength λ ≈ hc/E ~ 5 fm (comparable to nuclear diameter), enabling measurable diffraction; crucially, high-energy electrons are leptons unaffected by the strong nuclear force and diffract to a non-zero first minimum giving radius directly, whereas alpha closest approach only gives an energy-dependent upper bound distorted by strong-force interaction and recoil. From sin θ ≈ 0.61λ/R, as target nucleon number increases from A = 12 to A = 208, nuclear radius R = R₀ A^(1/3) grows larger, so the non-zero first diffraction minimum shifts to a smaller scattering angle θ_min. Confirming a straight line through the origin for R³ versus A (or lg R vs lg A of gradient 1/3) proves nuclear volume is proportional to A, yielding constant density ρ = 3u / (4πR₀³) independent of A.",
    workingSteps: [
      "Justify high-energy electrons: λ ~ fm scale, lepton unaffected by strong force, contrast with α upper-bound limitations.",
      "Use sin θ ≈ 0.61λ/R and R = R₀ A^(1/3) to explain θ_min decreasing as A rises from C-12 to Pb-208.",
      "Derive A-independent nuclear density ρ = 3u/(4πR₀³).",
    ],
    criteria6: [
      "L1a: Explains 250 MeV gives electron de Broglie wavelength λ ~ 10⁻¹⁵ m comparable to nuclear dimensions for observable diffraction.",
      "L1b: Contrasts leptonic electrons (no strong nuclear interaction, direct R measurement) against alpha particles (hadronic strong force, energy-dependent upper bound only).",
      "L2a: Identifies the non-zero first diffraction minimum obeying sin θ ≈ 0.61 λ / R.",
      "L2b: Deduces that larger A (Pb-208 vs C-12) gives larger R = R₀ A^(1/3), shifting the first minimum to a smaller angle θ_min.",
      "L3a: Explains how plotting R against A^(1/3) (or R³ vs A) yields a straight line through the origin confirming V ∝ A.",
      "L3b: Proves nuclear density ρ = 3u / (4πR₀³) is independent of A, implying nucleons are packed tightly at uniform density across all nuclei.",
    ],
  },

  // 10. N-Z Nuclear Stability Curve LoR (2 variants)
  {
    slug: "lor-nz-stability-belt-a",
    kind: "al-a2-nz-nuclear-stability-curve",
    subtopic: "3.8",
    conceptId: "radioactive-decay-half-life",
    templateArchetype: "al-a2-nz-stability-lor",
    difficulty: "higher",
    questionStyle: "qualitative",
    scenarioSpec: NZ_SPEC_FISS,
    targetQuantityKey: "stabilityAnchor",
    stem: "The chart plots neutron number N against proton number Z for stable nuclides alongside the dashed line N = Z and decay regions.",
    partPrompt:
      "Explain the shape of the nuclear stability belt from Z = 0 to Z = 82 in terms of the ranges of the strong nuclear and electrostatic forces, identify how unstable nuclei in each region decay toward stability, and explain why uranium-235 fission fragments are intense β⁻ emitters.",
    expectedAnswerSuffix:
      "Up to Z ≈ 20, stable nuclei lie along N = Z because each nucleon interacts attractively via the short-range strong nuclear force (attractive up to ~3 fm, strongly repulsive below ~0.5 fm). Above proton number twenty, long-range electrostatic repulsion between all protons grows faster than short-range strong nuclear attraction requiring a higher N/Z ratio, so the stability belt curves upward toward N/Z ≈ 1.5 at Z = 82. Very heavy nuclei (Z > 82) emit α particles (ΔZ = −2, ΔN = −2); neutron-rich nuclei above the belt have a high N/Z ratio and undergo β⁻ decay (ΔZ = +1, ΔN = −1); proton-rich nuclei below the belt undergo β⁺ decay or electron capture (ΔZ = −1, ΔN = +1). Uranium-235 fission fragments inherit a high N/Z ratio (~1.5) far above the stable medium-Z belt (~1.25), so they are neutron-rich and undergo chains of β⁻ decays.",
    workingSteps: [
      "L1: N = Z up to Z ≈ 20, then curves upward to N > Z; state strong nuclear force range (attractive ≤ 3 fm, repulsive < 0.5 fm).",
      "L2: Long-range electrostatic repulsion across all protons vs short-range nearest-neighbour strong attraction explains rising N/Z.",
      "L3: Identify α (Z > 82), β⁻ (above belt, high N/Z), β⁺/EC (below belt), and fission fragments having high N/Z → β⁻.",
    ],
    criteria6: [
      "L1a: States stable nuclei follow N = Z up to Z ≈ 20 and bend upward toward N > Z (reaching N/Z ≈ 1.5 near Z = 82).",
      "L1b: States strong nuclear force is short-range (attractive up to ~3 fm, strongly repulsive below ~0.5 fm) acting only on nearest neighbours.",
      "L2a: Explains that electrostatic repulsion between protons is long-range (acts across the whole nucleus) and grows rapidly with Z, requiring a higher N/Z ratio of extra neutrons to bind the nucleus.",
      "L2b: Identifies α emission for heavy nuclei (Z > 82; ΔZ = −2, ΔN = −2) and β⁺ / electron capture below the belt (ΔZ = −1, ΔN = +1).",
      "L3a: Identifies β⁻ emission (explicitly with minus sign!) above the belt (ΔZ = +1, ΔN = −1) converting a neutron to a proton.",
      "L3b: Explains uranium fission fragments lie above the stability belt because they are neutron-rich / have a high N/Z ratio (reject bare 'too many neutrons'), causing successive β⁻ decays.",
    ],
  },
  {
    slug: "lor-nz-forces-and-decays-b",
    kind: "al-a2-nz-nuclear-stability-curve",
    subtopic: "3.8",
    conceptId: "radioactive-decay-half-life",
    templateArchetype: "al-a2-nz-stability-lor",
    difficulty: "standard",
    questionStyle: "qualitative",
    scenarioSpec: NZ_SPEC_ALPHA,
    targetQuantityKey: "stabilityAnchor",
    stem: "Unstable nuclides occur in three distinct zones around the N–Z stability belt: very heavy isotopes (Z > 82), neutron-rich isotopes above the belt, and proton-rich medical isotopes below the belt.",
    partPrompt:
      "Explain why no completely stable nuclei exist along N = Z for heavy elements, describe the exact N–Z vector shift and nucleon transformation for α, β⁻, and β⁺ decay, and explain why fission products from nuclear reactors require heavy beta-gamma shielding.",
    expectedAnswerSuffix:
      "Because the strong nuclear force only acts between neighbouring nucleons (attractive to ~3 fm, repulsive below ~0.5 fm), above proton number twenty, long-range electrostatic repulsion between all protons grows faster than short-range strong nuclear attraction requiring a higher N/Z ratio; thus heavy elements cannot be stable on N = Z. Heavy nuclei above Z = 82 undergo α decay (ΔZ = −2, ΔN = −2). Neutron-rich nuclei above the belt have a high N/Z ratio and undergo β⁻ decay (n → p + e⁻ + ν̄_e; ΔZ = +1, ΔN = −1), while proton-rich nuclei below the belt undergo β⁺ decay or electron capture (p → n + e⁺ + ν_e; ΔZ = −1, ΔN = +1). Reactor fission products inherit the high N/Z ratio of uranium-235, placing them well above the medium-Z stability belt, so they emit intense β⁻ particles and accompanying de-excitation γ rays.",
    workingSteps: [
      "Contrast strong nuclear force range (< 3 fm, repulsive < 0.5 fm) with long-range electrostatic repulsion among all protons.",
      "Specify exact ΔZ, ΔN shifts and nucleon conversions for α, β⁻, and β⁺/EC.",
      "Connect high N/Z ratio of fission products to intense β⁻ and γ emission.",
    ],
    criteria6: [
      "L1a: Specifies strong nuclear force range (attractive up to ~3 fm, repulsive below ~0.5 fm) vs long-range electrostatic repulsion between all protons.",
      "L1b: Explains heavy nuclei require a higher N/Z ratio (bending above N = Z for Z > 20) because extra neutrons add strong attraction without electrostatic repulsion.",
      "L2a: Gives α decay for Z > 82 with ΔZ = −2 and ΔN = −2.",
      "L2b: Gives β⁻ decay (explicit minus sign) above the belt: neutron converts to proton (ΔZ = +1, ΔN = −1), lowering N/Z.",
      "L3a: Gives β⁺ / electron capture below the belt: proton converts to neutron (ΔZ = −1, ΔN = +1), raising N/Z.",
      "L3b: Explains reactor fission products are neutron-rich with a high N/Z ratio above the stability belt, emitting intense β⁻ radiation (and γ photons from excited daughters).",
    ],
  },

  // 11. Thermal Nuclear Reactor & Waste Safety LoR (2 variants)
  {
    slug: "lor-reactor-core-waste-a",
    kind: "al-a2-thermal-nuclear-reactor-lor",
    subtopic: "3.8",
    conceptId: "nuclear-fission-fusion",
    templateArchetype: "al-a2-thermal-reactor-safety-lor",
    difficulty: "higher",
    questionStyle: "qualitative",
    scenarioSpec: REACTOR_SPEC_GRAPHITE,
    targetQuantityKey: "reactorSafetyAnchor",
    stem: "The cutaway schematic shows a thermal nuclear fission reactor using enriched uranium-235 fuel rods, a graphite moderator, boron control rods, pressurised coolant, and a concrete biological shield.",
    partPrompt:
      "Explain the physical role of the moderator, control rods, coolant, and shielding during steady power generation, and describe the complete safety procedure for handling and disposing of high-level spent fuel waste.",
    expectedAnswerSuffix:
      "In a thermal reactor, the moderator slows neutrons by elastic collisions, control rods absorb neutrons for criticality, coolant transfers thermal energy, thick concrete shields radiation, and high-level waste moves from cooling ponds to vitrification and deep geological storage. Specifically: fast fission neutrons collide elastically with low-mass moderator nuclei (graphite or water, which must not absorb neutrons) transferring maximum kinetic energy per collision to reach thermal speeds where U-235 fission cross-section is high. Retractable boron or cadmium control rods absorb neutrons to maintain a critical chain reaction (k = 1, one neutron per fission causing the next). Coolant circulates thermal energy from the core to a heat exchanger/steam generator, while a thick steel pressure vessel and dense concrete biological shield attenuate γ rays and stray neutrons. Intensely hot, radioactive high-level fission-fragment waste is handled remotely, stored in deep cooling ponds for thermal cooling and radiation shielding, vitrified in solid glass inside stainless-steel canisters, and emplaced in deep geologically stable underground storage.",
    workingSteps: [
      "L1: Moderator (graphite/water, low nucleon mass, non-absorbing) slows fast neutrons to thermal speeds via elastic collisions for U-235.",
      "L2: Boron/cadmium control rods absorb neutrons for criticality (k = 1); coolant extracts heat; steel vessel + thick concrete shield radiation.",
      "L3: High-level waste: remote handling → cooling ponds (cooling + shielding) → vitrification in glass/steel canisters → deep geologically stable underground repository.",
    ],
    criteria6: [
      "L1a: States moderator (graphite/water) slows fast neutrons to thermal speeds via elastic collisions so U-235 fission probability is high (reject 'absorbs neutrons' for moderator).",
      "L1b: Explains low-nucleon-number moderator atoms transfer more kinetic energy per elastic collision.",
      "L2a: States boron/cadmium control rods absorb neutrons (reject bare 'stop') to regulate a steady critical chain reaction (1 neutron per fission causing next fission).",
      "L2b: States coolant transfers thermal energy to steam generator/heat exchanger AND steel vessel plus thick concrete biological shield absorb γ/neutron radiation.",
      "L3a: Describes high-level waste (fission fragments) handled remotely and placed in cooling ponds to remove decay heat and provide radiation shielding.",
      "L3b: States waste is vitrified in glass inside stainless-steel canisters and placed in deep geologically stable underground storage (reject bare 'bury underground').",
    ],
  },
  {
    slug: "lor-reactor-pwr-safety-b",
    kind: "al-a2-thermal-nuclear-reactor-lor",
    subtopic: "3.8",
    conceptId: "nuclear-fission-fusion",
    templateArchetype: "al-a2-thermal-reactor-safety-lor",
    difficulty: "higher",
    questionStyle: "qualitative",
    scenarioSpec: REACTOR_SPEC_WATER,
    targetQuantityKey: "reactorSafetyAnchor",
    stem: "In a pressurised-water reactor (PWR), ordinary water serves simultaneously as both moderator and primary coolant around uranium-235 fuel assemblies surrounded by retractable boron control rods.",
    partPrompt:
      "Explain why water is an effective moderator and coolant, explain how boron control rods and structural shielding ensure safe operation, and outline every stage required to store high-level spent fuel safely over thousands of years.",
    expectedAnswerSuffix:
      "In a PWR, the moderator slows neutrons by elastic collisions, control rods absorb neutrons for criticality, coolant transfers thermal energy, thick concrete shields radiation, and high-level waste moves from cooling ponds to vitrification and deep geological storage. Hydrogen nuclei (protons, A = 1) in water closely match the neutron's mass, transferring a large fraction of kinetic energy per elastic collision to produce thermal neutrons without strongly absorbing them, while water's high specific heat capacity transfers core thermal energy efficiently to the steam generator. Boron control rods absorb excess neutrons to keep k = 1 (or drop fully under gravity for emergency shutdown), while the thick steel pressure vessel and dense concrete biological shield absorb penetrating γ rays and escaping neutrons. High-level spent fuel containing intense β⁻/γ-emitting fission fragments is moved by remote manipulators into water-filled cooling ponds for several years, then vitrified inside borosilicate glass sealed in stainless-steel canisters for deep geologically stable underground storage.",
    workingSteps: [
      "Explain water's dual role: low-mass H-1 elastic moderation to thermal neutrons + high-c thermal coolant.",
      "Explain boron control rod neutron absorption (criticality & shutdown) + steel/concrete radiation shielding.",
      "Detail remote handling → cooling ponds → vitrification in glass/steel canisters → deep geologically stable repository.",
    ],
    criteria6: [
      "L1a: Explains water slows fast neutrons to thermal speeds via elastic collisions with low-mass hydrogen nuclei (close mass match maximises KE transfer; reject 'moderator absorbs').",
      "L1b: Notes thermal neutrons have a much higher probability of inducing U-235 fission, and water also carries thermal energy to the heat exchanger/steam generator.",
      "L2a: Explains boron control rods absorb neutrons to maintain critical operation (one fission neutron causing one subsequent fission) or shut the reactor down.",
      "L2b: States thick steel pressure vessel and thick concrete biological shield attenuate intense gamma radiation and stray neutrons.",
      "L3a: Explains spent fuel high-level waste is handled remotely and stored in cooling ponds for thermal dissipation of decay heat and radiation shielding.",
      "L3b: Explains long-term immobilisation via vitrification in glass sealed in stainless-steel canisters stored in deep geologically stable underground repositories.",
    ],
  },
];

/* ========================================================================== */
/*  BANK 4: 24 MULTI-PART MIXED-EXAM STRUCTURED QUESTIONS (6 FAMILIES × 4)    */
/* ========================================================================== */

function buildContinuousFlowStructured(
  baseSeed: number,
  model: string,
): CandidateQuestionInput[] {
  const configs = [
    {
      slug: "cf-struct-water",
      liquid: "water",
      tIn: 18.0,
      tOut: 26.0,
      m1: 0.005,
      m2: 0.01,
      v1: 12.0,
      i1: 14.3,
      v2: 16.0,
      i2: 21.175,
      context: "A university thermodynamics lab measures the specific heat capacity of purified water using a steady continuous-flow electrical calorimeter.",
    },
    {
      slug: "cf-struct-oil",
      liquid: "mineral oil",
      tIn: 20.0,
      tOut: 32.0,
      m1: 0.006,
      m2: 0.012,
      v1: 15.0,
      i1: 10.48,
      v2: 20.0,
      i2: 15.42,
      context: "An automotive fluid laboratory tests synthetic mineral oil in an evacuated-jacket continuous-flow calorimeter across two steady flow rates.",
    },
    {
      slug: "cf-struct-ethanol",
      liquid: "ethanol",
      tIn: 16.0,
      tOut: 26.0,
      m1: 0.004,
      m2: 0.01,
      v1: 10.0,
      i1: 10.64,
      v2: 16.0,
      i2: 15.8,
      context: "A chemical engineering group evaluates liquid ethanol inside a glass-jacket continuous-flow heating tube at constant inlet and outlet readings.",
    },
    {
      slug: "cf-struct-glycol",
      liquid: "glycol coolant",
      tIn: 19.0,
      tOut: 29.0,
      m1: 0.005,
      m2: 0.01,
      v1: 12.0,
      i1: 15.5,
      v2: 18.0,
      i2: 20.3333333,
      context: "Thermal engineers calibrate a battery-cooling glycol mixture by running two different mass flow rates through a constant-head calorimeter.",
    },
  ];

  return configs.map((cfg, idx) => {
    const spec: Record<string, unknown> = {
      kind: "al-a2-continuous-flow-calorimetry",
      inletTempC: cfg.tIn,
      outletTempC: cfg.tOut,
      flowRate1KgPerS: cfg.m1,
      flowRate2KgPerS: cfg.m2,
      voltage1V: cfg.v1,
      current1A: cfg.i1,
      voltage2V: cfg.v2,
      current2A: cfg.i2,
      liquidName: cfg.liquid,
    };
    const q = solveKind("al-a2-continuous-flow-calorimetry", spec);
    const p1 = q.powerSingleRun as number;
    const p2 = q.powerRun2W as number;
    const cVal = q.specificHeatC as number;
    const hVal = q.heatLossRateH as number;
    const dT = q.tempRiseK as number;
    const anchor = String(q.eliminationAnchor);

    const parts: StructuredQuestionPart[] = [
      {
        partId: "a",
        prompt: `Calculate the electrical power P₁ supplied to the heating coil during Run 1.`,
        marks: 2,
        targetMode: "quantitative",
        targetQuantityKey: "powerSingleRun",
        expectedAnswer: fmt3(p1, "W"),
        workingSteps: [
          `Use P₁ = V₁ I₁ = ${fmt3(cfg.v1)} × ${fmt3(cfg.i1)}`,
          `P₁ = ${fmt3(p1, "W")}`,
        ],
      },
      {
        partId: "b",
        prompt: `Using data from both Run 1 and Run 2, calculate the specific heat capacity c of the ${cfg.liquid}.`,
        marks: 3,
        dependsOnPartIds: ["a"],
        targetMode: "quantitative",
        targetQuantityKey: "specificHeatC",
        expectedAnswer: fmt3(cVal, "J kg⁻¹ K⁻¹"),
        workingSteps: [
          `P₂ = V₂ I₂ = ${fmt3(cfg.v2)} × ${fmt3(cfg.i2)} = ${fmt3(p2, "W")}`,
          `Subtract P₂ − P₁ = (ṁ₂ − ṁ₁) c Δθ with Δθ = ${fmt3(dT, "K")}`,
          `c = (${fmt3(p2)} − ${fmt3(p1)}) / [(${fmt3(cfg.m2)} − ${fmt3(cfg.m1)}) × ${fmt3(dT)}] = ${fmt3(cVal, "J kg⁻¹ K⁻¹")}`,
        ],
      },
      {
        partId: "c",
        prompt: `Hence determine the steady rate of thermal energy loss H to the surroundings.`,
        marks: 1,
        dependsOnPartIds: ["a", "b"],
        targetMode: "quantitative",
        targetQuantityKey: "heatLossRateH",
        expectedAnswer: fmt3(hVal, "W"),
        workingSteps: [
          `H = P₁ − ṁ₁ c Δθ = ${fmt3(p1)} − (${fmt3(cfg.m1)} × ${fmt3(cVal)} × ${fmt3(dT)}) = ${fmt3(hVal, "W")}`,
        ],
      },
      {
        partId: "d",
        prompt: `Explain why both experimental runs must maintain the exact same inlet and outlet temperatures.`,
        marks: 2,
        targetMode: "qualitative",
        targetQuantityKey: "eliminationAnchor",
        expectedAnswer: `Maintaining ${anchor}.`,
        workingSteps: [
          "Thermal energy loss rate H depends on temperature excess above room temperature.",
          `Keeping ${anchor}.`,
        ],
      },
    ];

    const markScheme: MarkSchemePoint[] = [
      { code: "M1", criterion: "Uses electrical power P = V I for Run 1.", marks: 1, partId: "a" },
      { code: "A1", criterion: `Correct Run 1 power P₁ = ${fmt3(p1, "W")}.`, marks: 1, partId: "a" },
      { code: "M1", criterion: `Calculates Run 2 power P₂ = ${fmt3(p2, "W")} and Δθ = ${fmt3(dT, "K")}.`, marks: 1, partId: "b" },
      { code: "M2", criterion: "Applies simultaneous elimination P₂ − P₁ = (ṁ₂ − ṁ₁) c Δθ.", marks: 1, partId: "b" },
      { code: "A1", criterion: `Obtains specific heat capacity c = ${fmt3(cVal, "J kg⁻¹ K⁻¹")}.`, marks: 1, partId: "b" },
      { code: "A1", criterion: `Substitutes back to find H = ${fmt3(hVal, "W")}.`, marks: 1, partId: "c" },
      { code: "B1", criterion: "States heat loss rate to surroundings depends on temperature difference above ambient.", marks: 1, partId: "d" },
      { code: "B2", criterion: `Concludes ${anchor}.`, marks: 1, partId: "d" },
    ];

    return {
      id: `${ALEVEL_CORE_A2_ID_PREFIX}-${cfg.slug}`,
      conceptId: "specific-heat-latent-heat",
      templateArchetype: "al-a2-continuous-flow-calorimetry-struct",
      seed: baseSeed + idx,
      syllabi: alevelTags("3.6.2"),
      format: "structured",
      questionStyle: "mixed-exam",
      difficulty: idx % 2 === 0 ? "standard" : "higher",
      domain: "thermal",
      scenarioSpec: spec,
      hiddenQuantities: ["powerSingleRun", "powerRun2W", "specificHeatC", "heatLossRateH", "eliminationAnchor"],
      requiredGivens: [
        { name: "inletTempC", value: cfg.tIn, unit: "°C", source: "either" },
        { name: "outletTempC", value: cfg.tOut, unit: "°C", source: "either" },
        { name: "flowRate1KgPerS", value: cfg.m1, unit: "kg s⁻¹", source: "stem" },
        { name: "flowRate2KgPerS", value: cfg.m2, unit: "kg s⁻¹", source: "stem" },
        { name: "voltage1V", value: cfg.v1, unit: "V", source: "stem" },
        { name: "current1A", value: cfg.i1, unit: "A", source: "stem" },
        { name: "voltage2V", value: cfg.v2, unit: "V", source: "stem" },
        { name: "current2A", value: cfg.i2, unit: "A", source: "stem" },
      ],
      questionPlan: {
        targetSummary: "Assess continuous-flow calorimetry heat-loss elimination via dual flow rates",
        subpartStrategy: [
          "Compute electrical heating power for the lower mass flow rate",
          "Subtract the two steady-state power balances to find specific heat capacity",
          "Back-substitute to find steady thermal loss rate to surroundings",
          "Justify holding inlet and outlet temperatures identical across both trials",
        ],
      },
      stem: `${cfg.context} The ${cfg.liquid} enters at ${fmt3(cfg.tIn, "°C")} and exits at ${fmt3(cfg.tOut, "°C")} in both steady trials. Run 1 uses ṁ₁ = ${fmt3(cfg.m1, "kg s⁻¹")} with V₁ = ${fmt3(cfg.v1, "V")} and I₁ = ${fmt3(cfg.i1, "A")}. Run 2 uses ṁ₂ = ${fmt3(cfg.m2, "kg s⁻¹")} with V₂ = ${fmt3(cfg.v2, "V")} and I₂ = ${fmt3(cfg.i2, "A")}.`,
      parts,
      workedSolution: `(a) P₁ = ${fmt3(p1, "W")}. (b) P₂ = ${fmt3(p2, "W")}; eliminating H gives c = (P₂ − P₁) / [(ṁ₂ − ṁ₁)Δθ] = ${fmt3(cVal, "J kg⁻¹ K⁻¹")}. (c) H = P₁ − ṁ₁cΔθ = ${fmt3(hVal, "W")}. (d) ${anchor}.`,
      markScheme,
      totalMarks: 8,
      generatorModel: model,
    };
  });
}

function buildSatelliteStructured(
  baseSeed: number,
  model: string,
): CandidateQuestionInput[] {
  const configs = [
    {
      slug: "sat-struct-comms",
      leoAltKm: 450,
      satMass: 900,
      context: "A European aerospace consortium deploys a 900 kg telecommunications relay initially parked in a circular low-Earth orbit at altitude 450 km before raising it to geostationary orbit.",
    },
    {
      slug: "sat-struct-weather",
      leoAltKm: 620,
      satMass: 1250,
      context: "A meteorological agency plans to boost a 1250 kg weather platform from a 620 km circular checkout orbit up to an equatorial geostationary station.",
    },
    {
      slug: "sat-struct-nav",
      leoAltKm: 780,
      satMass: 1600,
      context: "Flight dynamics engineers calculate the orbital transfer budget for a 1600 kg relay spacecraft departing a 780 km low-Earth circular orbit for geostationary slot insertion.",
    },
    {
      slug: "sat-struct-broadband",
      leoAltKm: 340,
      satMass: 720,
      context: "Mission control prepares a 720 kg broadband transponder currently circling Earth at 340 km altitude for transfer into a synchronous 24-hour equatorial orbit.",
    },
  ];

  return configs.map((cfg, idx) => {
    const spec: Record<string, unknown> = {
      kind: "al-a2-satellite-orbits-comparison",
      earthMassKg: 5.97e24,
      earthRadiusM: 6.37e6,
      geoPeriodS: 86400,
      leoAltitudeKm: cfg.leoAltKm,
      satelliteMassKg: cfg.satMass,
    };
    const q = solveKind("al-a2-satellite-orbits-comparison", spec);
    const rGeo = q.geoRadiusM as number;
    const hGeo = q.geoAltitudeM as number;
    const dE = q.energyToRaiseToGeoJ as number;
    const anchor = String(q.geostationaryConditionsAnchor);

    const parts: StructuredQuestionPart[] = [
      {
        partId: "a",
        prompt: "Derive and calculate the orbital radius r_GEO of a geostationary satellite measured from Earth's centre.",
        marks: 2,
        targetMode: "quantitative",
        targetQuantityKey: "geoRadiusM",
        expectedAnswer: fmt3(rGeo, "m"),
        workingSteps: [
          "Equate gravitational force and centripetal force: GMm/r² = m(4π²r/T²)",
          `r_GEO = (G M T² / 4π²)^(1/3) = ${fmt3(rGeo, "m")}`,
        ],
      },
      {
        partId: "b",
        prompt: "State the altitude of the geostationary orbit above Earth's surface.",
        marks: 1,
        dependsOnPartIds: ["a"],
        targetMode: "quantitative",
        targetQuantityKey: "geoAltitudeM",
        expectedAnswer: fmt3(hGeo, "m"),
        workingSteps: [`h = r_GEO − R_E = ${fmt3(rGeo)} − 6.37 × 10⁶ = ${fmt3(hGeo, "m")}`],
      },
      {
        partId: "c",
        prompt: "Calculate the minimum change in total orbital energy needed to transfer the spacecraft from its circular low-Earth orbit to the geostationary orbit.",
        marks: 2,
        dependsOnPartIds: ["a"],
        targetMode: "quantitative",
        targetQuantityKey: "energyToRaiseToGeoJ",
        expectedAnswer: fmt3(dE, "J"),
        workingSteps: [
          `r_LEO = 6.37 × 10⁶ + ${cfg.leoAltKm} × 10³ = ${fmt3(q.leoRadiusM as number, "m")}`,
          `ΔE = (GMm / 2)(1/r_LEO − 1/r_GEO) = ${fmt3(dE, "J")}`,
        ],
      },
      {
        partId: "d",
        prompt: "State all three orbital conditions required for the satellite to remain fixed above one location on Earth's surface.",
        marks: 2,
        targetMode: "qualitative",
        targetQuantityKey: "geostationaryConditionsAnchor",
        expectedAnswer: `The satellite must have a ${anchor}.`,
        workingSteps: [`Required conditions: ${anchor}.`],
      },
    ];

    const markScheme: MarkSchemePoint[] = [
      { code: "M1", criterion: "Equates GMm/r² = mω²r with ω = 2π/T to form Kepler's third law.", marks: 1, partId: "a" },
      { code: "A1", criterion: `Calculates r_GEO = ${fmt3(rGeo, "m")}.`, marks: 1, partId: "a" },
      { code: "A1", criterion: `Subtracts R_E to find h_GEO = ${fmt3(hGeo, "m")}.`, marks: 1, partId: "b" },
      { code: "M1", criterion: "Uses total circular orbital energy E = −GMm/(2r) at both radii.", marks: 1, partId: "c" },
      { code: "A1", criterion: `Calculates minimum energy transfer ΔE = ${fmt3(dE, "J")}.`, marks: 1, partId: "c" },
      { code: "B1", criterion: "States orbital period is 24 hours matching Earth's rotation.", marks: 1, partId: "d" },
      { code: "B2", criterion: `States directly above the equator and west-to-east (${anchor}).`, marks: 1, partId: "d" },
    ];

    return {
      id: `${ALEVEL_CORE_A2_ID_PREFIX}-${cfg.slug}`,
      conceptId: "gravitational-potential-orbits",
      templateArchetype: "al-a2-satellite-orbits-struct",
      seed: baseSeed + idx,
      syllabi: alevelTags("3.7.2", { topicId: "ncuk-ac5", subtopicId: "ncuk-ac5-1" }),
      format: "structured",
      questionStyle: "mixed-exam",
      difficulty: "higher",
      domain: "grav-astro",
      scenarioSpec: spec,
      hiddenQuantities: ["geoRadiusM", "geoAltitudeM", "energyToRaiseToGeoJ", "geostationaryConditionsAnchor"],
      requiredGivens: [
        { name: "earthMassKg", value: 5.97e24, unit: "kg", source: "stem" },
        { name: "earthRadiusM", value: 6.37e6, unit: "m", source: "stem" },
        { name: "geoPeriodS", value: 86400, unit: "s", source: "stem" },
        { name: "leoAltitudeKm", value: cfg.leoAltKm, unit: "km", source: "either" },
        { name: "satelliteMassKg", value: cfg.satMass, unit: "kg", source: "stem" },
      ],
      questionPlan: {
        targetSummary: "Assess geostationary orbital mechanics, transfer energy, and synchronous orbit criteria",
        subpartStrategy: [
          "Derive and compute geostationary radius from Kepler third law",
          "Subtract Earth radius to get geostationary altitude",
          "Evaluate total orbital energy difference between LEO and GEO",
          "State all three physical conditions for a geostationary orbit",
        ],
      },
      stem: `${cfg.context} Take G = 6.67 × 10⁻¹¹ N m² kg⁻², M_E = 5.97 × 10²⁴ kg, R_E = 6.37 × 10⁶ m (surface g = ${ALEVEL_G_MS2} m s⁻²), and T_GEO = 86400 s.`,
      parts,
      workedSolution: `(a) r_GEO = ${fmt3(rGeo, "m")}. (b) h_GEO = ${fmt3(hGeo, "m")}. (c) ΔE = ${fmt3(dE, "J")}. (d) ${anchor}.`,
      markScheme,
      totalMarks: 7,
      generatorModel: model,
    };
  });
}

function buildDielectricStructured(
  baseSeed: number,
  model: string,
): CandidateQuestionInput[] {
  const configs = [
    {
      slug: "diel-struct-iso-a",
      area: 180,
      sep: 1.2,
      epsR: 4.5,
      v0: 18,
      mode: "isolated" as const,
      context: "A laboratory parallel-plate capacitor with air between its plates is charged to 18.0 V and disconnected from the supply before inserting a polar mica slab (εᵣ = 4.50).",
    },
    {
      slug: "diel-struct-iso-b",
      area: 260,
      sep: 0.9,
      epsR: 3.6,
      v0: 24,
      mode: "isolated" as const,
      context: "An isolated air-spaced sensor capacitor charged to 24.0 V has its gap completely filled with a polar polymer sheet of relative permittivity 3.60.",
    },
    {
      slug: "diel-struct-conn-a",
      area: 240,
      sep: 0.8,
      epsR: 3.2,
      v0: 12,
      mode: "connected" as const,
      context: "A parallel-plate capacitor remains wired across a steady 12.0 V DC power unit while a polar glass dielectric plate (εᵣ = 3.20) slides smoothly to fill the plate separation.",
    },
    {
      slug: "diel-struct-conn-b",
      area: 350,
      sep: 1.5,
      epsR: 5.5,
      v0: 30,
      mode: "connected" as const,
      context: "While permanently connected to a 30.0 V laboratory supply, a parallel-plate capacitor has its air gap filled completely with a polar ceramic dielectric (εᵣ = 5.50).",
    },
  ];

  return configs.map((cfg, idx) => {
    const spec: Record<string, unknown> = {
      kind: "al-a2-capacitor-polar-dielectric",
      plateAreaCm2: cfg.area,
      plateSeparationMm: cfg.sep,
      relativePermittivity: cfg.epsR,
      initialVoltageV: cfg.v0,
      connectionMode: cfg.mode,
    };
    const q = solveKind("al-a2-capacitor-polar-dielectric", spec);
    const cDiel = q.capacitanceDielectricPF as number;
    const vFinal = q.finalVoltageV as number;
    const qFinal = q.finalChargeNC as number;
    const eFinal = q.finalEnergyNJ as number;
    const anchor = String(q.dielectricAnchor);

    const midKey = cfg.mode === "isolated" ? "finalVoltageV" : "finalChargeNC";
    const midVal = cfg.mode === "isolated" ? vFinal : qFinal;
    const midUnit = cfg.mode === "isolated" ? "V" : "nC";
    const midPrompt =
      cfg.mode === "isolated"
        ? "Calculate the new potential difference across the isolated plates after inserting the dielectric."
        : "Calculate the new charge (in nanocoulombs) stored on the plates while remaining connected to the supply.";

    const parts: StructuredQuestionPart[] = [
      {
        partId: "a",
        prompt: "Calculate the capacitance of the capacitor (in picofarads) once the dielectric completely fills the gap.",
        marks: 2,
        targetMode: "quantitative",
        targetQuantityKey: "capacitanceDielectricPF",
        expectedAnswer: fmt3(cDiel, "pF"),
        workingSteps: [
          `A = ${cfg.area} × 10⁻⁴ m², d = ${cfg.sep} × 10⁻³ m`,
          `C = ε₀ εᵣ A / d = ${fmt3(cDiel, "pF")}`,
        ],
      },
      {
        partId: "b",
        prompt: midPrompt,
        marks: 2,
        dependsOnPartIds: ["a"],
        targetMode: "quantitative",
        targetQuantityKey: midKey,
        expectedAnswer: fmt3(midVal, midUnit),
        workingSteps: [
          cfg.mode === "isolated"
            ? `Isolated Q is unchanged ⇒ V' = V₀ / εᵣ = ${cfg.v0} / ${cfg.epsR} = ${fmt3(vFinal, "V")}`
            : `Fixed V ⇒ Q' = C' V₀ = ${fmt3(cDiel, "pF")} × ${cfg.v0} V = ${fmt3(qFinal, "nC")}`,
        ],
      },
      {
        partId: "c",
        prompt: "Calculate the final electrical energy stored by the capacitor in nanojoules.",
        marks: 1,
        dependsOnPartIds: ["a", "b"],
        targetMode: "quantitative",
        targetQuantityKey: "finalEnergyNJ",
        expectedAnswer: fmt3(eFinal, "nJ"),
        workingSteps: [`E' = ½ C' (V')² = ${fmt3(eFinal, "nJ")}`],
      },
      {
        partId: "d",
        prompt: "Explain microscopically how the polar molecules inside the dielectric increase the capacitance.",
        marks: 2,
        targetMode: "qualitative",
        targetQuantityKey: "dielectricAnchor",
        expectedAnswer: `In the applied electric field, ${anchor}.`,
        workingSteps: [`${anchor}.`],
      },
    ];

    const markScheme: MarkSchemePoint[] = [
      { code: "M1", criterion: "Converts cm² and mm to SI units in C = ε₀ εᵣ A / d.", marks: 1, partId: "a" },
      { code: "A1", criterion: `Calculates C' = ${fmt3(cDiel, "pF")}.`, marks: 1, partId: "a" },
      {
        code: "M1",
        criterion:
          cfg.mode === "isolated"
            ? "Recognises isolated Q is constant so V' = V₀ / εᵣ."
            : "Recognises supply holds V constant so Q' = C' V₀.",
        marks: 1,
        partId: "b",
      },
      { code: "A1", criterion: `Obtains ${fmt3(midVal, midUnit)}.`, marks: 1, partId: "b" },
      { code: "A1", criterion: `Calculates final stored energy E' = ${fmt3(eFinal, "nJ")}.`, marks: 1, partId: "c" },
      { code: "B1", criterion: "States polar molecules rotate so negative ends face the positive plate.", marks: 1, partId: "d" },
      { code: "B2", criterion: `Explains opposing internal field lowers net field and raises capacitance (${anchor}).`, marks: 1, partId: "d" },
    ];

    return {
      id: `${ALEVEL_CORE_A2_ID_PREFIX}-${cfg.slug}`,
      conceptId: "capacitor-networks-energy",
      templateArchetype: "al-a2-capacitor-polar-dielectric-struct",
      seed: baseSeed + idx,
      syllabi: alevelTags("3.7.4"),
      format: "structured",
      questionStyle: "mixed-exam",
      difficulty: "standard",
      domain: "fields",
      scenarioSpec: spec,
      hiddenQuantities: [
        "capacitanceDielectricPF",
        "finalVoltageV",
        "finalChargeNC",
        "finalEnergyNJ",
        "dielectricAnchor",
      ],
      requiredGivens: [
        { name: "plateAreaCm2", value: cfg.area, unit: "cm²", source: "stem" },
        { name: "plateSeparationMm", value: cfg.sep, unit: "mm", source: "stem" },
        { name: "relativePermittivity", value: cfg.epsR, source: "either" },
        { name: "initialVoltageV", value: cfg.v0, unit: "V", source: "stem" },
      ],
      questionPlan: {
        targetSummary: "Assess parallel-plate polar dielectric capacitance, energy change, and dipole mechanism",
        subpartStrategy: [
          "Compute dielectric-filled capacitance from plate geometry",
          "Determine post-insertion voltage or charge according to isolation state",
          "Compute final electrical energy stored",
          "Explain polar dipole alignment and opposing internal field",
        ],
      },
      stem: `${cfg.context} The overlapping plate area is ${cfg.area} cm², plate separation is ${fmt3(cfg.sep, "mm")}, and ε₀ = 8.85 × 10⁻¹² F m⁻¹.`,
      parts,
      workedSolution: `(a) C' = ${fmt3(cDiel, "pF")}. (b) ${fmt3(midVal, midUnit)}. (c) E' = ${fmt3(eFinal, "nJ")}. (d) ${anchor}.`,
      markScheme,
      totalMarks: 7,
      generatorModel: model,
    };
  });
}

function buildCroAcStructured(
  baseSeed: number,
  model: string,
): CandidateQuestionInput[] {
  const configs = [
    {
      slug: "cro-struct-audio",
      yg: 2.0,
      tb: 5.0,
      p2p: 6.0,
      tdiv: 4.0,
      r: 25,
      context: "An audio signal generator drives a 25.0 Ω loudspeaker load while monitored on a calibrated 10 × 8 division oscilloscope.",
    },
    {
      slug: "cro-struct-heater",
      yg: 5.0,
      tb: 2.0,
      p2p: 5.0,
      tdiv: 5.0,
      r: 40,
      context: "A benchtop AC power pack supplies a 40.0 Ω immersion element monitored with a cathode-ray oscilloscope.",
    },
    {
      slug: "cro-struct-coil",
      yg: 1.0,
      tb: 4.0,
      p2p: 6.0,
      tdiv: 2.5,
      r: 15,
      context: "Students record the sinusoidal output of a rotating search-coil generator connected across a 15.0 Ω test resistor on an oscilloscope.",
    },
    {
      slug: "cro-struct-mains",
      yg: 10.0,
      tb: 5.0,
      p2p: 4.0,
      tdiv: 4.0,
      r: 50,
      context: "The secondary output of a lab isolating transformer powers a 50.0 Ω wire-wound resistor monitored on an oscilloscope.",
    },
  ];

  return configs.map((cfg, idx) => {
    const spec: Record<string, unknown> = {
      kind: "al-a2-oscilloscope-ac-rms",
      yGainVPerDiv: cfg.yg,
      timeBaseMsPerDiv: cfg.tb,
      peakToPeakDivs: cfg.p2p,
      periodDivs: cfg.tdiv,
      loadResistanceOhm: cfg.r,
      displayMode: "ac-sinusoid",
    };
    const q = solveKind("al-a2-oscilloscope-ac-rms", spec);
    const vRms = q.vRmsV as number;
    const freq = q.freqHz as number;
    const pMean = q.meanPowerW as number;
    const anchor = String(q.timeBaseOffAnchor);

    const parts: StructuredQuestionPart[] = [
      {
        partId: "a",
        prompt: "Calculate the root-mean-square potential difference V_rms across the resistor.",
        marks: 2,
        targetMode: "quantitative",
        targetQuantityKey: "vRmsV",
        expectedAnswer: fmt3(vRms, "V"),
        workingSteps: [
          `V_pp = ${cfg.p2p} × ${cfg.yg} = ${fmt3(q.vPeakToPeakV as number, "V")} ⇒ V₀ = ${fmt3(q.vPeakV as number, "V")}`,
          `V_rms = V₀ / √2 = ${fmt3(vRms, "V")}`,
        ],
      },
      {
        partId: "b",
        prompt: "Determine the frequency f of the alternating supply.",
        marks: 2,
        targetMode: "quantitative",
        targetQuantityKey: "freqHz",
        expectedAnswer: fmt3(freq, "Hz"),
        workingSteps: [
          `T = ${cfg.tdiv} × ${cfg.tb} ms = ${fmt3(q.periodS as number, "s")}`,
          `f = 1 / T = ${fmt3(freq, "Hz")}`,
        ],
      },
      {
        partId: "c",
        prompt: "Calculate the mean power dissipated in the load resistor.",
        marks: 1,
        dependsOnPartIds: ["a"],
        targetMode: "quantitative",
        targetQuantityKey: "meanPowerW",
        expectedAnswer: fmt3(pMean, "W"),
        workingSteps: [`P_mean = V_rms² / R = (${fmt3(vRms)})² / ${cfg.r} = ${fmt3(pMean, "W")}`],
      },
      {
        partId: "d",
        prompt: "Describe and explain what appears on the oscilloscope screen if the time-base is switched OFF.",
        marks: 2,
        targetMode: "qualitative",
        targetQuantityKey: "timeBaseOffAnchor",
        expectedAnswer: `With no horizontal sweep, ${anchor}.`,
        workingSteps: [
          "Without horizontal deflection the electron beam moves purely vertically between +V₀ and −V₀.",
          `${anchor}.`,
        ],
      },
    ];

    const markScheme: MarkSchemePoint[] = [
      { code: "M1", criterion: `Finds peak voltage V₀ = ${fmt3(q.vPeakV as number, "V")} by halving peak-to-peak height.`, marks: 1, partId: "a" },
      { code: "A1", criterion: `Divides by √2 to obtain V_rms = ${fmt3(vRms, "V")}.`, marks: 1, partId: "a" },
      { code: "M1", criterion: `Calculates period T = ${fmt3(q.periodS as number, "s")}.`, marks: 1, partId: "b" },
      { code: "A1", criterion: `Inverts T to obtain f = ${fmt3(freq, "Hz")}.`, marks: 1, partId: "b" },
      { code: "A1", criterion: `Evaluates P_mean = V_rms² / R = ${fmt3(pMean, "W")}.`, marks: 1, partId: "c" },
      { code: "B1", criterion: "States horizontal deflection ceases so spot oscillates vertically at the centre.", marks: 1, partId: "d" },
      { code: "B2", criterion: `States full length equals peak-to-peak voltage (${anchor}).`, marks: 1, partId: "d" },
    ];

    return {
      id: `${ALEVEL_CORE_A2_ID_PREFIX}-${cfg.slug}`,
      conceptId: "ac-generators-transformers",
      templateArchetype: "al-a2-oscilloscope-ac-rms-struct",
      seed: baseSeed + idx,
      syllabi: alevelTags("3.7.5"),
      format: "structured",
      questionStyle: "mixed-exam",
      difficulty: "standard",
      domain: "em-induction",
      scenarioSpec: spec,
      hiddenQuantities: ["vRmsV", "vPeakV", "vPeakToPeakV", "periodS", "freqHz", "meanPowerW", "timeBaseOffAnchor"],
      requiredGivens: [
        { name: "yGainVPerDiv", value: cfg.yg, unit: "V div⁻¹", source: "either" },
        { name: "timeBaseMsPerDiv", value: cfg.tb, unit: "ms div⁻¹", source: "either" },
        { name: "peakToPeakDivs", value: cfg.p2p, source: "stem" },
        { name: "periodDivs", value: cfg.tdiv, source: "stem" },
        { name: "loadResistanceOhm", value: cfg.r, unit: "Ω", source: "stem" },
      ],
      questionPlan: {
        targetSummary: "Assess CRO AC rms voltage, frequency, mean resistive power, and time-base OFF display",
        subpartStrategy: [
          "Convert peak-to-peak divisions into V_rms",
          "Extract period and frequency from horizontal divisions",
          "Calculate mean power dissipated using V_rms",
          "Explain vertical trace appearance when time-base is switched off",
        ],
      },
      stem: `${cfg.context} The oscilloscope is set to Y-gain ${fmt3(cfg.yg, "V div⁻¹")} and time-base ${fmt3(cfg.tb, "ms div⁻¹")}. The sinusoidal trace spans ${fmt3(cfg.p2p)} divisions peak-to-peak and ${fmt3(cfg.tdiv)} horizontal divisions per complete cycle.`,
      parts,
      workedSolution: `(a) V_rms = ${fmt3(vRms, "V")}. (b) f = ${fmt3(freq, "Hz")}. (c) P_mean = ${fmt3(pMean, "W")}. (d) ${anchor}.`,
      markScheme,
      totalMarks: 7,
      generatorModel: model,
    };
  });
}

function buildTransformerStructured(
  baseSeed: number,
  model: string,
): CandidateQuestionInput[] {
  const configs = [
    {
      slug: "tr-struct-substation-a",
      np: 600,
      ns: 6000,
      vp: 11000,
      isA: 18,
      eta: 95,
      rLine: 6.0,
      pGrid: 1.98e7,
      context: "A coastal wind-farm substation steps 11.0 kV generator output up for regional grid transmission along cables of total resistance 6.00 Ω.",
    },
    {
      slug: "tr-struct-substation-b",
      np: 500,
      ns: 2500,
      vp: 230,
      isA: 4.5,
      eta: 92,
      rLine: 8.0,
      pGrid: 1.15e6,
      context: "An industrial testing facility uses a 92.0% efficient step-up transformer fed at 230 V and connects a high-voltage feeder line of resistance 8.00 Ω.",
    },
    {
      slug: "tr-struct-substation-c",
      np: 1000,
      ns: 12000,
      vp: 11000,
      isA: 30,
      eta: 96,
      rLine: 12.0,
      pGrid: 2.64e7,
      context: "A hydroelectric station links its 11.0 kV alternators through a 96.0% efficient step-up transformer to a long-distance 12.0 Ω overhead line.",
    },
    {
      slug: "tr-struct-substation-d",
      np: 800,
      ns: 4000,
      vp: 400,
      isA: 6.0,
      eta: 94,
      rLine: 5.0,
      pGrid: 1.6e6,
      context: "A university solar microgrid boosts 400 V inverter output using a 94.0% efficient laminated-core transformer connected to a 5.00 Ω campus cable.",
    },
  ];

  return configs.map((cfg, idx) => {
    const spec: Record<string, unknown> = {
      kind: "al-a2-transformer-losses-design",
      primaryTurns: cfg.np,
      secondaryTurns: cfg.ns,
      primaryVoltageV: cfg.vp,
      secondaryCurrentA: cfg.isA,
      efficiencyPct: cfg.eta,
      lineResistanceOhm: cfg.rLine,
      gridPowerW: cfg.pGrid,
    };
    const q = solveKind("al-a2-transformer-losses-design", spec);
    const vs = q.secondaryVoltageV as number;
    const ip = q.primaryCurrentA as number;
    const loss = q.gridLineLossW as number;
    const anchor = String(q.laminatedCoreAnchor);

    const parts: StructuredQuestionPart[] = [
      {
        partId: "a",
        prompt: "Calculate the secondary output voltage Vₛ assuming negligible flux leakage.",
        marks: 1,
        targetMode: "quantitative",
        targetQuantityKey: "secondaryVoltageV",
        expectedAnswer: fmt3(vs, "V"),
        workingSteps: [`Vₛ = Vₚ (Nₛ / Nₚ) = ${cfg.vp} × (${cfg.ns} / ${cfg.np}) = ${fmt3(vs, "V")}`],
      },
      {
        partId: "b",
        prompt: `When the transformer operates at ${cfg.eta}% efficiency delivering secondary current ${fmt3(cfg.isA, "A")}, calculate the primary current Iₚ.`,
        marks: 2,
        dependsOnPartIds: ["a"],
        targetMode: "quantitative",
        targetQuantityKey: "primaryCurrentA",
        expectedAnswer: fmt3(ip, "A"),
        workingSteps: [
          `Pₛ = Iₛ Vₛ = ${fmt3(q.secondaryPowerW as number, "W")}`,
          `Iₚ = Pₛ / (η Vₚ) = ${fmt3(ip, "A")}`,
        ],
      },
      {
        partId: "c",
        prompt: `If power ${fmt3(cfg.pGrid, "W")} is transmitted at voltage Vₛ along cables of total resistance ${fmt3(cfg.rLine, "Ω")}, calculate the thermal power dissipated in the cables.`,
        marks: 2,
        dependsOnPartIds: ["a"],
        targetMode: "quantitative",
        targetQuantityKey: "gridLineLossW",
        expectedAnswer: fmt3(loss, "W"),
        workingSteps: [
          `I_line = P / Vₛ = ${fmt3(q.gridCurrentA as number, "A")}`,
          `P_loss = I_line² R_line = ${fmt3(loss, "W")}`,
        ],
      },
      {
        partId: "d",
        prompt: "Explain how laminating the soft-iron core reduces internal thermal energy losses in the transformer.",
        marks: 2,
        targetMode: "qualitative",
        targetQuantityKey: "laminatedCoreAnchor",
        expectedAnswer: `Laminating the core works because ${anchor}.`,
        workingSteps: [`${anchor}.`],
      },
    ];

    const markScheme: MarkSchemePoint[] = [
      { code: "A1", criterion: `Calculates Vₛ = ${fmt3(vs, "V")}.`, marks: 1, partId: "a" },
      { code: "M1", criterion: "Applies η = (Iₛ Vₛ) / (Iₚ Vₚ).", marks: 1, partId: "b" },
      { code: "A1", criterion: `Obtains Iₚ = ${fmt3(ip, "A")}.`, marks: 1, partId: "b" },
      { code: "M1", criterion: `Finds cable current I = P / Vₛ = ${fmt3(q.gridCurrentA as number, "A")}.`, marks: 1, partId: "c" },
      { code: "A1", criterion: `Calculates cable loss P_loss = I²R = ${fmt3(loss, "W")}.`, marks: 1, partId: "c" },
      { code: "B1", criterion: "States insulating layers between iron sheets increase resistance to eddy currents.", marks: 1, partId: "d" },
      { code: "B2", criterion: `Links smaller eddy currents to reduced I²R core heating (${anchor}).`, marks: 1, partId: "d" },
    ];

    return {
      id: `${ALEVEL_CORE_A2_ID_PREFIX}-${cfg.slug}`,
      conceptId: "ac-generators-transformers",
      templateArchetype: "al-a2-transformer-losses-struct",
      seed: baseSeed + idx,
      syllabi: alevelTags("3.7.5", { topicId: "ncuk-ac4", subtopicId: "ncuk-ac4-6" }),
      format: "structured",
      questionStyle: "mixed-exam",
      difficulty: "higher",
      domain: "em-induction",
      scenarioSpec: spec,
      hiddenQuantities: ["secondaryVoltageV", "primaryCurrentA", "gridCurrentA", "gridLineLossW", "laminatedCoreAnchor"],
      requiredGivens: [
        { name: "primaryTurns", value: cfg.np, source: "either" },
        { name: "secondaryTurns", value: cfg.ns, source: "either" },
        { name: "primaryVoltageV", value: cfg.vp, unit: "V", source: "either" },
        { name: "secondaryCurrentA", value: cfg.isA, unit: "A", source: "stem" },
        { name: "efficiencyPct", value: cfg.eta, unit: "%", source: "stem" },
        { name: "lineResistanceOhm", value: cfg.rLine, unit: "Ω", source: "stem" },
        { name: "gridPowerW", value: cfg.pGrid, unit: "W", source: "stem" },
      ],
      questionPlan: {
        targetSummary: "Assess non-ideal step-up transformer turns ratio, primary current, grid cable loss, and lamination physics",
        subpartStrategy: [
          "Calculate secondary voltage from turns ratio",
          "Calculate primary current incorporating transformer efficiency",
          "Compute resistive thermal loss in high-voltage grid lines",
          "Explain how insulated laminations suppress eddy-current heating",
        ],
      },
      stem: `${cfg.context} The transformer has Nₚ = ${cfg.np} primary turns, Nₛ = ${cfg.ns} secondary turns, and primary voltage Vₚ = ${fmt3(cfg.vp, "V")}.`,
      parts,
      workedSolution: `(a) Vₛ = ${fmt3(vs, "V")}. (b) Iₚ = ${fmt3(ip, "A")}. (c) P_loss = ${fmt3(loss, "W")}. (d) ${anchor}.`,
      markScheme,
      totalMarks: 7,
      generatorModel: model,
    };
  });
}

function buildElectronDiffractionStructured(
  baseSeed: number,
  model: string,
): CandidateQuestionInput[] {
  const configs = [
    {
      slug: "ediff-struct-o16",
      nuclide: "oxygen-16",
      eMeV: 420,
      massA: 16,
      r0Fm: 1.05,
      z: 8,
      context: "A linear accelerator fires 420 MeV electrons at a thin target containing oxygen-16 (A = 16) nuclei.",
    },
    {
      slug: "ediff-struct-fe56",
      nuclide: "iron-56",
      eMeV: 250,
      massA: 56,
      r0Fm: 1.15,
      z: 26,
      context: "Nuclear physicists direct a 250 MeV electron beam onto an isotopically pure iron-56 (A = 56) foil.",
    },
    {
      slug: "ediff-struct-al27",
      nuclide: "aluminium-27",
      eMeV: 350,
      massA: 27,
      r0Fm: 1.1,
      z: 13,
      context: "An electron spectrometer records the scattered intensity distribution of 350 MeV electrons diffracted by aluminium-27 (A = 27) nuclei.",
    },
    {
      slug: "ediff-struct-ca40",
      nuclide: "calcium-40",
      eMeV: 300,
      massA: 40,
      r0Fm: 1.12,
      z: 20,
      context: "High-energy 300 MeV electrons are scattered off a thin calcium-40 (A = 40) target to measure nuclear charge radius.",
    },
  ];

  return configs.map((cfg, idx) => {
    const spec: Record<string, unknown> = {
      kind: "al-a2-electron-diffraction-vs-rutherford",
      electronEnergyMeV: cfg.eMeV,
      massNumberA: cfg.massA,
      r0Fm: cfg.r0Fm,
      alphaEnergyMeV: 6.0,
      targetAtomicNumberZ: cfg.z,
    };
    const q = solveKind("al-a2-electron-diffraction-vs-rutherford", spec);
    const lam = q.deBroglieWavelengthFm as number;
    const rad = q.nuclearRadiusFm as number;
    const rho = q.nuclearDensityKgPerM3 as number;
    const thetaDeg = q.thetaMinDeg as number;
    const anchor = String(q.nuclearRadiusAnchor);

    const parts: StructuredQuestionPart[] = [
      {
        partId: "a",
        prompt: "Assuming relativistic electrons obey λ ≈ hc / E, calculate the de Broglie wavelength λ of the incident electrons in femtometres.",
        marks: 2,
        targetMode: "quantitative",
        targetQuantityKey: "deBroglieWavelengthFm",
        expectedAnswer: fmt3(lam, "fm"),
        workingSteps: [
          `E = ${cfg.eMeV} × 10⁶ × 1.60 × 10⁻¹⁹ = ${fmt3(q.electronEnergyJ as number, "J")}`,
          `λ = (6.63 × 10⁻³⁴ × 3.00 × 10⁸) / E = ${fmt3(lam, "fm")}`,
        ],
      },
      {
        partId: "b",
        prompt: `The first non-zero diffraction minimum occurs at θ_min = ${fmt3(thetaDeg, "°")}. Using sin θ ≈ 0.61 λ / R, calculate the nuclear radius R of ${cfg.nuclide} in femtometres.`,
        marks: 2,
        dependsOnPartIds: ["a"],
        targetMode: "quantitative",
        targetQuantityKey: "nuclearRadiusFm",
        expectedAnswer: fmt3(rad, "fm"),
        workingSteps: [`R = 0.61 λ / sin(${fmt3(thetaDeg)}°) = ${fmt3(rad, "fm")}`],
      },
      {
        partId: "c",
        prompt: `Taking nucleon mass u = 1.661 × 10⁻²⁷ kg, calculate the density of the ${cfg.nuclide} nucleus.`,
        marks: 1,
        dependsOnPartIds: ["b"],
        targetMode: "quantitative",
        targetQuantityKey: "nuclearDensityKgPerM3",
        expectedAnswer: fmt3(rho, "kg m⁻³"),
        workingSteps: [`ρ = (${cfg.massA} × 1.661 × 10⁻²⁷) / [(4/3)π R³] = ${fmt3(rho, "kg m⁻³")}`],
      },
      {
        partId: "d",
        prompt: "Explain why high-energy electron diffraction determines nuclear radius more accurately than Rutherford alpha closest approach.",
        marks: 2,
        targetMode: "qualitative",
        targetQuantityKey: "nuclearRadiusAnchor",
        expectedAnswer: `Electron diffraction is superior because ${anchor}.`,
        workingSteps: [`${anchor}.`],
      },
    ];

    const markScheme: MarkSchemePoint[] = [
      { code: "M1", criterion: "Converts MeV into joules and applies λ = hc / E.", marks: 1, partId: "a" },
      { code: "A1", criterion: `Obtains λ = ${fmt3(lam, "fm")}.`, marks: 1, partId: "a" },
      { code: "M1", criterion: "Rearranges sin θ ≈ 0.61 λ / R for R.", marks: 1, partId: "b" },
      { code: "A1", criterion: `Calculates R = ${fmt3(rad, "fm")}.`, marks: 1, partId: "b" },
      { code: "A1", criterion: `Computes nuclear density ρ = ${fmt3(rho, "kg m⁻³")}.`, marks: 1, partId: "c" },
      { code: "B1", criterion: "States electrons are leptons unaffected by the strong nuclear force and give direct radius via diffraction minimum.", marks: 1, partId: "d" },
      { code: "B2", criterion: `Contrasts with alpha closest approach giving only an energy-dependent upper bound (${anchor}).`, marks: 1, partId: "d" },
    ];

    return {
      id: `${ALEVEL_CORE_A2_ID_PREFIX}-${cfg.slug}`,
      conceptId: "rutherford-scattering-nuclear-radius",
      templateArchetype: "al-a2-electron-diffraction-struct",
      seed: baseSeed + idx,
      syllabi: alevelTags("3.8"),
      format: "structured",
      questionStyle: "mixed-exam",
      difficulty: "higher",
      domain: "quantum-nuclear",
      scenarioSpec: spec,
      hiddenQuantities: [
        "deBroglieWavelengthFm",
        "nuclearRadiusFm",
        "nuclearDensityKgPerM3",
        "nuclearRadiusAnchor",
      ],
      requiredGivens: [
        { name: "electronEnergyMeV", value: cfg.eMeV, unit: "MeV", source: "stem" },
        { name: "massNumberA", value: cfg.massA, source: "stem" },
      ],
      questionPlan: {
        targetSummary: "Assess relativistic electron diffraction nuclear radius, nuclear density, and advantage over alpha scattering",
        subpartStrategy: [
          "Compute relativistic electron de Broglie wavelength",
          "Extract nuclear radius from first diffraction minimum",
          "Compute constant nuclear matter density",
          "Contrast electron diffraction against Rutherford alpha closest approach",
        ],
      },
      stem: `${cfg.context} Take h = 6.63 × 10⁻³⁴ J s, c = 3.00 × 10⁸ m s⁻¹, and e = 1.60 × 10⁻¹⁹ C.`,
      parts,
      workedSolution: `(a) λ = ${fmt3(lam, "fm")}. (b) R = ${fmt3(rad, "fm")}. (c) ρ = ${fmt3(rho, "kg m⁻³")}. (d) ${anchor}.`,
      markScheme,
      totalMarks: 7,
      generatorModel: model,
    };
  });
}

/* ========================================================================== */
/*  Public Generator Entry Point                                              */
/* ========================================================================== */

export function generateAlevelCoreA2Candidates(
  options: GenerateAlevelCoreA2Options = {},
): CandidateQuestionInput[] {
  const baseSeed = options.baseSeed ?? ALEVEL_CORE_A2_DEFAULT_BASE_SEED;
  const generatorModel = options.generatorModel ?? ALEVEL_CORE_A2_DEFAULT_MODEL;

  const candidates: CandidateQuestionInput[] = [];
  let cursor = 1;

  // 1. Bank 1: 78 Pure Qualitative / Conceptual MCQs
  for (const bp of QUAL_MCQ_SPECS) {
    const seed = baseSeed + cursor;
    cursor += 1;
    const solved = solveKind(bp.kind, bp.scenarioSpec);
    const anchorText = String(solved[bp.targetQuantityKey]);
    const correctText = `${bp.correctPrefix ?? ""}${anchorText}${bp.correctSuffix ?? ""}`.trim();
    const optionsList = buildVerbalOptions(correctText, bp.distractors, seed);

    candidates.push({
      id: `${ALEVEL_CORE_A2_ID_PREFIX}-qual-${bp.slug}`,
      conceptId: bp.conceptId,
      templateArchetype: bp.templateArchetype,
      seed,
      syllabi: alevelTags(bp.subtopic, bp.ncukCross, bp.extraAlevel),
      format: "mcq",
      questionStyle: bp.questionStyle,
      difficulty: bp.difficulty,
      domain: domainForKind(bp.kind),
      scenarioSpec: bp.scenarioSpec,
      hiddenQuantities: [bp.targetQuantityKey],
      requiredGivens: [],
      questionPlan: {
        targetSummary: `Assess qualitative Year thirteen concept for ${bp.conceptId}`,
        distractorStrategy: [
          "Reversing physical direction or causal sign in conceptual reasoning",
          "Confusing neighbouring A-Level physics regimes or mechanisms",
          "Applying a common mark-scheme misconception or incomplete condition",
        ],
      },
      stem: bp.stem,
      options: optionsList,
      targetMode: "qualitative",
      targetQuantityKey: bp.targetQuantityKey,
      workedSolution: `${bp.workedNote} Therefore the correct statement is: ${correctText}`,
      markScheme: [
        {
          code: "B1",
          criterion: `Selects correct conceptual explanation: ${anchorText}.`,
          marks: 1,
        },
      ],
      totalMarks: 1,
      generatorModel,
    });
  }

  // 2. Bank 2: 46 Quantitative / Graph / Experimental MCQs
  for (const bp of QUANT_MCQ_SPECS) {
    const seed = baseSeed + cursor;
    cursor += 1;
    const solved = solveKind(bp.kind, bp.scenarioSpec);
    const truth = solved[bp.targetQuantityKey] as number;
    const distractors = bp.buildDistractors(solved);
    const optionsList = buildNumericOptions(truth, bp.unit, distractors, seed);
    const { worked, markCriterion } = bp.buildWorked(solved);

    candidates.push({
      id: `${ALEVEL_CORE_A2_ID_PREFIX}-quant-${bp.slug}`,
      conceptId: bp.conceptId,
      templateArchetype: bp.templateArchetype,
      seed,
      syllabi: alevelTags(bp.subtopic, bp.ncukCross),
      format: "mcq",
      questionStyle: bp.questionStyle,
      difficulty: bp.difficulty,
      domain: domainForKind(bp.kind),
      scenarioSpec: bp.scenarioSpec,
      hiddenQuantities: bp.hiddenQuantities,
      requiredGivens: bp.requiredGivens,
      questionPlan: {
        targetSummary: `Assess quantitative calculation for ${bp.conceptId}`,
        distractorStrategy: [
          "Omitting a required numerical factor or root during rearrangement",
          "Substituting an intermediate or non-SI unit quantity directly",
          "Applying the complementary or opposite boundary condition formula",
        ],
      },
      stem: bp.stem,
      options: optionsList,
      targetMode: "quantitative",
      targetQuantityKey: bp.targetQuantityKey,
      workedSolution: worked,
      markScheme: [
        {
          code: "A1",
          criterion: markCriterion,
          marks: 1,
        },
      ],
      totalMarks: 1,
      generatorModel,
    });
  }

  // 3. Bank 3: 22 Authentic 6-Mark LoR Structured Questions (11 distinct templates × 2)
  const lorCodes = ["L1a", "L1b", "L2a", "L2b", "L3a", "L3b"] as const;
  for (const bp of LOR_BLUEPRINTS) {
    const seed = baseSeed + cursor;
    cursor += 1;
    const solved = solveKind(bp.kind, bp.scenarioSpec);
    const anchor = String(solved[bp.targetQuantityKey]);
    const fullExpected = `${anchor}. ${bp.expectedAnswerSuffix}`;

    const part: StructuredQuestionPart = {
      partId: "a",
      prompt: bp.partPrompt,
      marks: 6,
      targetMode: "qualitative",
      targetQuantityKey: bp.targetQuantityKey,
      expectedAnswer: fullExpected,
      workingSteps: [...bp.workingSteps],
    };

    const markScheme: MarkSchemePoint[] = lorCodes.map((code, i) => ({
      code,
      criterion: bp.criteria6[i],
      marks: 1,
      partId: "a",
    }));

    candidates.push({
      id: `${ALEVEL_CORE_A2_ID_PREFIX}-${bp.slug}`,
      conceptId: bp.conceptId,
      templateArchetype: bp.templateArchetype,
      seed,
      syllabi: alevelTags(bp.subtopic, bp.ncukCross, bp.extraAlevel),
      format: "structured",
      questionStyle: bp.questionStyle,
      difficulty: bp.difficulty,
      domain: domainForKind(bp.kind),
      scenarioSpec: bp.scenarioSpec,
      hiddenQuantities: [bp.targetQuantityKey],
      requiredGivens: [],
      questionPlan: {
        targetSummary: `Assess extended level-of-response reasoning for ${bp.conceptId}`,
        subpartStrategy: [
          "Award level one marks for foundational physical principle and definitions",
          "Award level two marks for linked causal mechanism and quantitative/graphical features",
          "Award level three marks for full synoptic synthesis and mark-scheme precision",
        ],
      },
      stem: bp.stem,
      targetMode: "qualitative",
      parts: [part],
      workedSolution: fullExpected,
      markScheme,
      totalMarks: 6,
      generatorModel,
    });
  }

  // 4. Bank 4: 24 Multi-Part Mixed-Exam Structured Questions
  const mixedGroups = [
    buildContinuousFlowStructured(baseSeed + cursor, generatorModel),
    buildSatelliteStructured(baseSeed + cursor + 10, generatorModel),
    buildDielectricStructured(baseSeed + cursor + 20, generatorModel),
    buildCroAcStructured(baseSeed + cursor + 30, generatorModel),
    buildTransformerStructured(baseSeed + cursor + 40, generatorModel),
    buildElectronDiffractionStructured(baseSeed + cursor + 50, generatorModel),
  ];
  for (const grp of mixedGroups) {
    candidates.push(...grp);
  }

  return candidates;
}
