import {
  FalseOriginExperimentType,
  NCUK_CONCEPTUAL_RULE_TABLE,
  NCUK_GRAVITY_MS2,
  NCUK_KELVIN_OFFSET,
  NCUK_QUAL_EXAM_PLUGINS,
  SynopticGeometryMode,
  ThermalCurveMode,
} from "@/lib/visuals/ncuk-conceptual";

import { buildOptionEquivalenceKey } from "../numeric-checker";
import {
  CandidateQuestionInput,
  MarkSchemePoint,
  MCQ_OPTION_LABELS,
  McqOptionItem,
  QuestionDifficulty,
  RequiredGivenSpec,
  StructuredQuestionPart,
  SyllabusTag,
} from "../types";

export const NCUK_QUAL_EXAM_DEFAULT_BASE_SEED = 72_000_000;
export const NCUK_QUAL_EXAM_ID_PREFIX = "sp-v3-ncuk-qual";
export const NCUK_QUAL_EXAM_DEFAULT_MODEL =
  "deterministic-ncuk-qual-exam-v3/1.0.0";

export interface GenerateNcukQualitativeExamOptions {
  readonly baseSeed?: number;
  readonly generatorModel?: string;
}

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

function toSuperscriptInt(exp: number): string {
  return [...String(exp)].map((ch) => SUPERSCRIPT_DIGITS[ch] ?? ch).join("");
}

function formatSigFig(value: number, sigFigs: number, unit?: string): string {
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
    numStr = `${sign}${mant.toPrecision(sigFigs)} × 10${toSuperscriptInt(exp)}`;
  } else {
    numStr = `${sign}${abs.toPrecision(sigFigs)}`;
  }
  if (!unit) return numStr;
  return unit === "%" ? `${numStr}%` : `${numStr} ${unit}`;
}

function fmt3(value: number, unit?: string): string {
  return formatSigFig(value, 3, unit);
}

function fmt4(value: number, unit?: string): string {
  return formatSigFig(value, 4, unit);
}

function solvePlugin(
  kind: string,
  spec: Record<string, unknown>,
): Record<string, number | string | boolean> {
  const plugin = NCUK_QUAL_EXAM_PLUGINS.find((p) => p.kind === kind);
  if (!plugin) {
    throw new Error(`Plugin "${kind}" not found in NCUK_QUAL_EXAM_PLUGINS`);
  }
  return plugin.solve(spec).quantities;
}

function ncukTag(
  topicId: string,
  subtopicId: string,
  level: "IFY-S1" | "IFY-S2" = "IFY-S1",
): SyllabusTag[] {
  return [
    {
      syllabus: "ncuk",
      level,
      topicId,
      subtopicId,
    },
  ];
}

interface VerbalDistractor {
  readonly text: string;
  readonly rationale: string;
}

function buildVerbalMcqOptions(
  correctText: string,
  distractors: readonly [VerbalDistractor, VerbalDistractor, VerbalDistractor],
  seed: number,
): McqOptionItem[] {
  const correctSlot = ((seed % 4) + 4) % 4;
  const out: McqOptionItem[] = [];
  let dIdx = 0;
  for (let i = 0; i < 4; i += 1) {
    if (i === correctSlot) {
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
  const scale = Math.max(Math.abs(a), Math.abs(b), 1e-12);
  if (Math.abs(a - b) / scale < 0.04) return false;
  return a.toPrecision(3) !== b.toPrecision(3);
}

function buildNumericMcqOptions(
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
      rationale: "Doubles the target quantity through a factor-of-two substitution slip.",
    },
    {
      value: correctValue * 1.45,
      rationale: "Misreads a graph coordinate interval on the suppressed axis scale.",
    },
    {
      value: correctValue * 0.72,
      rationale: "Underestimates the span across the plotted error bars.",
    },
  ];

  for (const cand of [...distractors, ...fallbacks]) {
    if (chosen.length >= 3) break;
    if (!Number.isFinite(cand.value) || Math.abs(cand.value) < 1e-12) continue;
    if (!usedVals.every((v) => valuesDistinct3sf(cand.value, v))) continue;
    const text = fmt3(cand.value, unit);
    const key = buildOptionEquivalenceKey(text);
    if (usedKeys.has(key)) continue;
    usedKeys.add(key);
    usedVals.push(cand.value);
    chosen.push({ text, rationale: cand.rationale });
  }

  const correctSlot = ((seed % 4) + 4) % 4;
  const items: McqOptionItem[] = [];
  let dIdx = 0;
  for (let i = 0; i < 4; i += 1) {
    if (i === correctSlot) {
      items.push({
        label: MCQ_OPTION_LABELS[i],
        text: correctText,
        isCorrect: true,
      });
    } else {
      const d = chosen[dIdx];
      dIdx += 1;
      items.push({
        label: MCQ_OPTION_LABELS[i],
        text: d.text,
        isCorrect: false,
        distractorRationale: d.rationale,
      });
    }
  }
  return items;
}

// ============================================================================
// BANK 1: PURE QUALITATIVE / CONCEPTUAL MCQs (68 ITEMS ACROSS AC1–AC4 + S2)
// ============================================================================

interface ConceptualMcqBlueprint {
  readonly slug: string;
  readonly conceptKey: string;
  readonly difficulty: QuestionDifficulty;
  readonly targetQuantityKey:
    | "primaryClassification"
    | "requiredMarkPointA"
    | "requiredMarkPointB"
    | "requiredMarkPointC"
    | "reasoningAnchor";
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

const CONCEPTUAL_MCQ_BLUEPRINTS: readonly ConceptualMcqBlueprint[] = [
  // --- AC4.1 & AC1.1: Electrical units & ideal meters (9 MCQs) ---
  {
    slug: "volt-unit-equiv",
    conceptKey: "volt-unit-equivalence",
    difficulty: "standard",
    targetQuantityKey: "primaryClassification",
    stem: "Which pair of derived SI unit expressions are both equivalent to the volt?",
    correctPrefix: "Both ",
    correctSuffix: " (J C⁻¹ and N m C⁻¹)",
    distractors: [
      {
        text: "Both newton per coulomb and joule coulomb (N C⁻¹ and J C)",
        rationale: "Confuses electric field strength (N C⁻¹) and multiplied work-charge (J C) with potential difference.",
      },
      {
        text: "Both coulomb per joule and watt ampere (C J⁻¹ and W A)",
        rationale: "Inverts energy per unit charge and multiplies power by current instead of dividing.",
      },
      {
        text: "Both joule per second and ampere second (J s⁻¹ and A s)",
        rationale: "Lists units for electrical power (watt) and charge (coulomb) rather than potential difference.",
      },
    ],
    workedNote:
      "Potential difference is work done per unit charge (V = W / Q), so one volt equals joule per coulomb and newton metre per coulomb (J C⁻¹ = N m C⁻¹ = J A⁻¹ s⁻¹).",
  },
  {
    slug: "volt-unit-trap-field",
    conceptKey: "volt-unit-equivalence",
    difficulty: "higher",
    targetQuantityKey: "requiredMarkPointC",
    stem: "A student inspects four candidate unit combinations for electrical potential difference: J C⁻¹, N m C⁻¹, J A⁻¹ s⁻¹, and N C⁻¹. Why is N C⁻¹ NOT equivalent to the volt?",
    correctPrefix: "Because ",
    distractors: [
      {
        text: "Because newton per coulomb represents electrical resistance rather than potential difference",
        rationale: "Confuses force per unit charge with voltage per unit current.",
      },
      {
        text: "Because newton per coulomb represents electrical capacitance rather than potential difference",
        rationale: "Confuses electric field units with charge per unit potential difference.",
      },
      {
        text: "Because newton per coulomb omits the factor of current needed to form electrical power",
        rationale: "Misidentifies the missing factor as current rather than distance (metre).",
      },
    ],
    workedNote:
      "Since work equals force multiplied by distance, N m C⁻¹ is the volt whereas newton per coulomb represents electric field strength rather than potential difference.",
  },
  {
    slug: "ohm-unit-equiv",
    conceptKey: "ohm-unit-equivalence",
    difficulty: "standard",
    targetQuantityKey: "primaryClassification",
    stem: "Which combination correctly gives two SI unit forms equivalent to the ohm?",
    correctPrefix: "Both ",
    correctSuffix: " (V A⁻¹ and J s C⁻²)",
    distractors: [
      {
        text: "Both ampere per volt and coulomb squared per joule second (A V⁻¹ and C² J⁻¹ s⁻¹)",
        rationale: "Inverts the definition R = V / I into electrical conductance.",
      },
      {
        text: "Both volt ampere and joule per coulomb second (V A and J C⁻¹ s⁻¹)",
        rationale: "Multiplies voltage and current instead of taking their ratio.",
      },
      {
        text: "Both joule per ampere and newton metre per ampere (J A⁻¹ and N m A⁻¹)",
        rationale: "Omits the time factor converting charge into current squared.",
      },
    ],
    workedNote:
      "Resistance equals potential difference divided by current, yielding volt per ampere and joule second per coulomb squared.",
  },
  {
    slug: "farad-watt-units",
    conceptKey: "farad-watt-unit-equivalence",
    difficulty: "foundation",
    targetQuantityKey: "primaryClassification",
    stem: "Which statement correctly matches the farad and the watt to their equivalent SI combinations?",
    correctPrefix: "They correspond to ",
    distractors: [
      {
        text: "They correspond to volt per coulomb for capacitance and joule second for power",
        rationale: "Inverts capacitance C = Q / V and multiplies energy by time instead of dividing.",
      },
      {
        text: "They correspond to coulomb volt for capacitance and volt per ampere for power",
        rationale: "Uses product QV for capacitance and resistance units for power.",
      },
      {
        text: "They correspond to ampere per volt for capacitance and coulomb per second for power",
        rationale: "Confuses capacitance with conductance and power with electric current.",
      },
    ],
    workedNote:
      "From C = Q / V and P = E / t, the units are coulomb per volt for capacitance and joule per second for power.",
  },
  {
    slug: "ideal-voltmeter-spec",
    conceptKey: "ideal-voltmeter-connection",
    difficulty: "foundation",
    targetQuantityKey: "primaryClassification",
    stem: "To measure the potential difference across a resistor accurately without disturbing a DC circuit, how should an ideal voltmeter be wired and what resistance should it have?",
    correctPrefix: "It must be ",
    distractors: [
      {
        text: "It must be connected in series with infinite resistance",
        rationale: "Wiring an infinite-resistance meter in series would block circuit current completely.",
      },
      {
        text: "It must be connected in parallel with zero resistance",
        rationale: "A zero-resistance parallel meter would short-circuit the resistor.",
      },
      {
        text: "It must be connected in series with zero resistance",
        rationale: "Describes the wiring and resistance of an ideal ammeter instead of a voltmeter.",
      },
    ],
    workedNote:
      "An ideal voltmeter is connected in parallel with infinite resistance so zero current bypasses the resistor.",
  },
  {
    slug: "ideal-ammeter-spec",
    conceptKey: "ideal-ammeter-connection",
    difficulty: "foundation",
    targetQuantityKey: "primaryClassification",
    stem: "How must an ideal ammeter be placed in a laboratory DC network and what internal resistance should it possess?",
    correctPrefix: "It must be ",
    distractors: [
      {
        text: "It must be connected in parallel with zero resistance",
        rationale: "Putting a zero-resistance meter in parallel creates a dangerous short circuit.",
      },
      {
        text: "It must be connected in series with infinite resistance",
        rationale: "An infinite-resistance meter in series reduces circuit current to zero.",
      },
      {
        text: "It must be connected in parallel with infinite resistance",
        rationale: "Describes an ideal voltmeter rather than an ideal ammeter.",
      },
    ],
    workedNote:
      "An ideal ammeter is connected in series with zero resistance so all branch current passes through it with no voltage drop.",
  },
  {
    slug: "ideal-meters-consequence",
    conceptKey: "ideal-voltmeter-connection",
    difficulty: "standard",
    targetQuantityKey: "requiredMarkPointB",
    stem: "Why does replacing a low-resistance analogue voltmeter with a high-resistance digital voltmeter improve accuracy across a large resistor in a potential divider?",
    correctPrefix: "Because ",
    distractors: [
      {
        text: "Because lower internal resistance allows extra current to boost the voltmeter coil deflection",
        rationale: "Extra meter current loads the divider and depresses the measured potential difference.",
      },
      {
        text: "Because infinite resistance increases the electromotive force supplied by the power pack",
        rationale: "A voltmeter cannot alter the chemical electromotive force of the power supply.",
      },
      {
        text: "Because higher meter resistance eliminates the internal resistance of the DC power pack",
        rationale: "The source internal resistance is fixed inside the supply regardless of the voltmeter.",
      },
    ],
    workedNote:
      "Ideally, infinite internal resistance ensures negligible current is diverted through the voltmeter so the divider ratio stays unperturbed.",
  },
  {
    slug: "electron-drift-dir",
    conceptKey: "electron-drift-vs-conventional-current",
    difficulty: "foundation",
    targetQuantityKey: "primaryClassification",
    stem: "A copper connecting wire carries a steady direct current from left to right. Which statement accurately describes the motion of free conduction electrons inside the wire?",
    correctPrefix: "Free ",
    distractors: [
      {
        text: "Free electrons travel rapidly in the same direction as conventional current at the speed of light",
        rationale: "Confuses electromagnetic field propagation speed with slow electron drift and reverses the direction.",
      },
      {
        text: "Free electrons drift slowly in the same direction as conventional current from positive to negative",
        rationale: "Forgets that electrons carry negative charge so they drift opposite to conventional current.",
      },
      {
        text: "Free electrons remain stationary while positive copper lattice ions migrate along the wire",
        rationale: "Lattice ions in a solid metal vibrate about fixed positions and do not drift as current carriers.",
      },
    ],
    workedNote:
      "Because conduction electrons are negatively charged, electrons drift slowly opposite to conventional current (from right to left here).",
  },
  {
    slug: "random-vs-systematic-mcq",
    conceptKey: "causal-random-vs-systematic-error",
    difficulty: "standard",
    targetQuantityKey: "primaryClassification",
    stem: "A student repeats a timing measurement several times using a stopwatch with a constant start-delay offset. Which statement correctly compares random and systematic errors?",
    correctPrefix: "In experimental physics, ",
    distractors: [
      {
        text: "In experimental physics, systematic errors scatter unpredictably and are eliminated by taking a large mean",
        rationale: "Swaps the properties of random and systematic errors; averaging cannot fix a constant offset.",
      },
      {
        text: "In experimental physics, both random and systematic errors are completely removed by repeating readings",
        rationale: "Repeating and averaging reduces random scatter only and leaves systematic bias untouched.",
      },
      {
        text: "In experimental physics, random errors shift every reading by the same fixed amount in one direction",
        rationale: "Describes a constant systematic zero error rather than random variation.",
      },
    ],
    workedNote:
      "Random errors scatter unpredictably and are reduced by repeating and averaging whereas systematic errors shift readings consistently and are not reduced by averaging.",
  },

  // --- Canonical Jan Exam Definitions MCQs (27 MCQs, covering all 27 def-* keys) ---
  {
    slug: "def-coulomb-mcq",
    conceptKey: "def-coulomb",
    difficulty: "foundation",
    targetQuantityKey: "primaryClassification",
    stem: "Which wording gives the canonical NCUK definition of the coulomb?",
    correctPrefix: "The ",
    distractors: [
      {
        text: "The rate of flow of electric charge past a point each second",
        rationale: "Defines electric current (the ampere) rather than electric charge (the coulomb).",
      },
      {
        text: "The electrical energy transferred per volt of potential difference across a wire",
        rationale: "Gives joules per volt, which does not express the base-unit definition of the coulomb via ampere and second.",
      },
      {
        text: "The force exerted between two stationary point charges placed unit distance apart",
        rationale: "Confuses the coulomb unit of charge with Coulomb law of electrostatic force.",
      },
    ],
    workedNote:
      "From Q = I t, the coulomb is the charge passing a point when a steady current of one ampere flows for one second.",
  },
  {
    slug: "def-volt-mcq",
    conceptKey: "def-volt",
    difficulty: "foundation",
    targetQuantityKey: "primaryClassification",
    stem: "Which statement accurately defines the volt?",
    correctPrefix: "The ",
    distractors: [
      {
        text: "The current flowing through a conductor when one joule of heat is produced each second",
        rationale: "Confuses potential difference with electric current and power.",
      },
      {
        text: "The electrostatic force exerted on one coulomb of charge in a uniform electric field",
        rationale: "Defines electric field strength (N C⁻¹) rather than potential difference (J C⁻¹).",
      },
      {
        text: "The total electrical energy stored inside a battery regardless of charge delivered",
        rationale: "Omits division by charge; voltage is energy per unit charge.",
      },
    ],
    workedNote:
      "One volt is the potential difference when one joule of energy is transferred per coulomb of charge.",
  },
  {
    slug: "def-emf-vs-pd-mcq",
    conceptKey: "def-emf-vs-pd",
    difficulty: "standard",
    targetQuantityKey: "primaryClassification",
    stem: "Which comparison correctly distinguishes electromotive force (emf) from potential difference (pd) in a DC circuit?",
    correctPrefix: "Fundamentally, ",
    distractors: [
      {
        text: "Fundamentally, electromotive force is a mechanical pushing force in newtons whereas potential difference is measured in volts",
        rationale: "Misinterprets the word force in emf; both emf and pd are energy per unit charge measured in volts.",
      },
      {
        text: "Fundamentally, electromotive force is always smaller than terminal potential difference whenever a cell supplies current",
        rationale: "Reverses the internal-resistance inequality: under load V = ε − Ir < ε.",
      },
      {
        text: "Fundamentally, electromotive force measures charge delivered per second whereas potential difference measures resistance",
        rationale: "Confuses emf with electric current and pd with resistance.",
      },
    ],
    workedNote:
      "Electromotive force transfers energy to charge in a source whereas potential difference transfers electrical energy from charge to components.",
  },
  {
    slug: "def-ohm-mcq",
    conceptKey: "def-ohm",
    difficulty: "foundation",
    targetQuantityKey: "primaryClassification",
    stem: "Which statement gives the precise definition of the ohm?",
    correctPrefix: "The ",
    distractors: [
      {
        text: "The potential difference across a wire when one coulomb of charge passes every minute",
        rationale: "Uses coulomb per minute instead of steady current of one ampere.",
      },
      {
        text: "The current passing through a metal wire for each volt applied across its ends",
        rationale: "Inverts V / I into conductance I / V.",
      },
      {
        text: "The thermal energy dissipated per second in a conductor carrying unit current",
        rationale: "Confuses resistance with power dissipation when current is arbitrary.",
      },
    ],
    workedNote:
      "One ohm is the resistance of a conductor carrying a current of one ampere under a potential difference of one volt.",
  },
  {
    slug: "def-resistance-mcq",
    conceptKey: "def-resistance",
    difficulty: "foundation",
    targetQuantityKey: "primaryClassification",
    stem: "How is the electrical resistance of any two-terminal circuit component universally defined?",
    correctPrefix: "It is the ",
    distractors: [
      {
        text: "It is the gradient of the tangent drawn to its current against potential difference graph",
        rationale: "Tangent gradient gives incremental conductance dI/dV, not static resistance V/I.",
      },
      {
        text: "It is the product of potential difference across the component and current through it",
        rationale: "The product VI defines electrical power rather than resistance.",
      },
      {
        text: "It is the reciprocal of the area enclosed under its current against voltage characteristic",
        rationale: "Area under an I–V curve has no physical correspondence to resistance.",
      },
    ],
    workedNote:
      "For both ohmic and non-ohmic components, resistance is the ratio of potential difference across a component to the current flowing through it.",
  },
  {
    slug: "def-resistivity-mcq",
    conceptKey: "def-resistivity",
    difficulty: "standard",
    targetQuantityKey: "primaryClassification",
    stem: "Which statement accurately defines the electrical resistivity of a conducting material?",
    correctPrefix: "Resistivity is the ",
    distractors: [
      {
        text: "Resistivity is the resistance per unit length of a wire regardless of its thickness",
        rationale: "Omits cross-sectional area; resistance per unit length depends on wire diameter.",
      },
      {
        text: "Resistivity is the resistance divided by both length and cross sectional area",
        rationale: "Inverts the geometric factor A / L in ρ = R A / L.",
      },
      {
        text: "Resistivity is the total resistance of a cylindrical wire measured at its melting point",
        rationale: "Confuses a material constant defined for unit geometry with total wire resistance.",
      },
    ],
    workedNote:
      "From ρ = R A / L, resistivity is the resistance of a specimen of unit length and unit cross sectional area.",
  },
  {
    slug: "def-watt-mcq",
    conceptKey: "def-watt",
    difficulty: "foundation",
    targetQuantityKey: "primaryClassification",
    stem: "Which expression defines the SI unit of power, the watt?",
    correctPrefix: "A ",
    distractors: [
      {
        text: "A total quantity of mechanical work equal to one newton metre",
        rationale: "Defines the joule (energy/work) rather than the watt (rate of energy transfer).",
      },
      {
        text: "A steady force of one newton acting over each second of motion",
        rationale: "Describes impulse (N s) rather than power (J s⁻¹).",
      },
      {
        text: "A charge transfer of one coulomb for every volt maintained across a load",
        rationale: "Defines the farad (C V⁻¹) rather than the watt (J s⁻¹).",
      },
    ],
    workedNote:
      "One watt is a rate of energy transfer of one joule per second.",
  },
  {
    slug: "def-newton-joule-mcq",
    conceptKey: "def-newton-and-joule",
    difficulty: "foundation",
    targetQuantityKey: "requiredMarkPointB",
    stem: "Which statement gives the complete, exam-accurate definition of the joule in mechanics?",
    correctPrefix: "Strictly, ",
    distractors: [
      {
        text: "Strictly, one joule is the force needed to move one kilogram through a distance of one metre",
        rationale: "Confuses force with work and mass with force.",
      },
      {
        text: "Strictly, one joule is the work done whenever a force of one newton acts perpendicular to a displacement of one metre",
        rationale: "A force perpendicular to displacement does zero mechanical work.",
      },
      {
        text: "Strictly, one joule is the momentum gained when a force of one newton acts for one second",
        rationale: "Defines impulse (N s) rather than mechanical work (N m).",
      },
    ],
    workedNote:
      "One joule is the work done when a force of one newton moves its point of application one metre in the direction of the force.",
  },
  {
    slug: "def-farad-mcq",
    conceptKey: "def-farad",
    difficulty: "foundation",
    targetQuantityKey: "primaryClassification",
    stem: "Which definition of the farad is strictly correct?",
    correctPrefix: "The ",
    distractors: [
      {
        text: "The energy stored in joules per volt of potential difference across a capacitor",
        rationale: "Confuses stored charge Q with stored energy W = ½QV.",
      },
      {
        text: "The potential difference produced per coulomb of charge added to a capacitor",
        rationale: "Inverts the definition C = Q / V into V / Q.",
      },
      {
        text: "The initial charging current in amperes per volt of supply electromotive force",
        rationale: "Describes conductance 1 / R rather than capacitance.",
      },
    ],
    workedNote:
      "One farad is the capacitance storing one coulomb of charge per volt of potential difference across the plates.",
  },
  {
    slug: "def-kirchhoff-first-mcq",
    conceptKey: "def-kirchhoff-first",
    difficulty: "foundation",
    targetQuantityKey: "primaryClassification",
    stem: "Which option correctly states Kirchhoff's first law and the underlying conservation principle it expresses?",
    correctPrefix: "At any circuit junction, the ",
    distractors: [
      {
        text: "At any circuit junction, the sum of currents entering equals sum leaving expressing conservation of energy",
        rationale: "Attributes the junction current rule to conservation of energy instead of charge.",
      },
      {
        text: "At any circuit junction, the sum of potential differences equals sum of resistances expressing conservation of charge",
        rationale: "Mixes voltage and resistance rather than branch currents.",
      },
      {
        text: "At any circuit junction, current splits equally into every outgoing wire expressing conservation of charge",
        rationale: "Branch currents depend on branch resistance and only split equally when resistances match.",
      },
    ],
    workedNote:
      "Kirchhoff's first law states that the sum of currents entering a junction equals sum leaving expressing conservation of charge.",
  },
  {
    slug: "def-kirchhoff-second-mcq",
    conceptKey: "def-kirchhoff-second",
    difficulty: "foundation",
    targetQuantityKey: "primaryClassification",
    stem: "Which option accurately states Kirchhoff's second law together with the fundamental conservation law from which it follows?",
    correctPrefix: "In any DC network, the ",
    distractors: [
      {
        text: "In any DC network, the sum of electromotive forces equals sum of potential differences around a closed loop expressing conservation of charge",
        rationale: "Links the closed-loop voltage law to charge conservation rather than energy conservation.",
      },
      {
        text: "In any DC network, the sum of branch currents around a closed loop is zero expressing conservation of energy",
        rationale: "Applies a junction-current idea to a loop instead of summing emfs and potential differences.",
      },
      {
        text: "In any DC network, every resistor in a closed loop drops the same potential difference expressing conservation of energy",
        rationale: "Potential drops depend on individual resistances and currents, not equal sharing.",
      },
    ],
    workedNote:
      "Kirchhoff's second law states that the sum of electromotive forces equals sum of potential differences around a closed loop expressing conservation of energy.",
  },
  {
    slug: "def-moment-mcq",
    conceptKey: "def-moment",
    difficulty: "foundation",
    targetQuantityKey: "primaryClassification",
    stem: "Which statement gives the complete NCUK definition of the moment of a force about a pivot?",
    correctPrefix: "The ",
    distractors: [
      {
        text: "The product of force and distance measured straight along the beam from the pivot to the point of application",
        rationale: "Omits the essential perpendicular condition when the force acts at an oblique angle.",
      },
      {
        text: "The ratio of force to the perpendicular distance from the pivot to the line of action",
        rationale: "Divides by perpendicular distance instead of multiplying.",
      },
      {
        text: "The product of mass and perpendicular distance from the pivot to the centre of gravity",
        rationale: "Uses mass instead of gravitational force (weight).",
      },
    ],
    workedNote:
      "The moment of a force is the product of force and perpendicular distance from pivot to the line of action of the force.",
  },
  {
    slug: "def-principle-moments-mcq",
    conceptKey: "def-principle-of-moments",
    difficulty: "standard",
    targetQuantityKey: "primaryClassification",
    stem: "Which statement accurately expresses the principle of moments?",
    correctPrefix: "It states that ",
    distractors: [
      {
        text: "It states that for any accelerating beam the sum of clockwise forces equals the sum of anticlockwise forces",
        rationale: "Confuses moments with forces and applies equilibrium to an accelerating body.",
      },
      {
        text: "It states that clockwise moments equal anticlockwise moments only when taken about the physical hinge",
        rationale: "For a body in equilibrium, moments balance about ANY chosen pivot point, not only a physical hinge.",
      },
      {
        text: "It states that total upward force equals total downward force about any pivot",
        rationale: "Confuses translational force balance with rotational moment balance.",
      },
    ],
    workedNote:
      "The principle of moments states that for a body in equilibrium the sum of clockwise moments equals the sum of anticlockwise moments about any pivot.",
  },
  {
    slug: "def-cg-mcq",
    conceptKey: "def-centre-of-gravity",
    difficulty: "foundation",
    targetQuantityKey: "primaryClassification",
    stem: "How is the centre of gravity of a rigid object defined?",
    correctPrefix: "The ",
    distractors: [
      {
        text: "The geometric midpoint of the longest dimension of any solid or hollow body",
        rationale: "Fails for non-uniform or asymmetric objects whose mass distribution is uneven.",
      },
      {
        text: "The lowest contact point where the normal reaction from the floor acts",
        rationale: "Confuses support contact point with the effective point of application of weight.",
      },
      {
        text: "The point inside the material where gravitational field strength reaches a maximum",
        rationale: "Near Earth the gravitational field is uniform; centre of gravity can even lie outside hollow shapes like a ring.",
      },
    ],
    workedNote:
      "The centre of gravity is the point through which the entire weight of a body appears to act.",
  },
  {
    slug: "def-scalar-vector-mcq",
    conceptKey: "def-scalar-vs-vector",
    difficulty: "foundation",
    targetQuantityKey: "primaryClassification",
    stem: "Which description correctly distinguishes a scalar quantity from a vector quantity?",
    correctPrefix: "A ",
    distractors: [
      {
        text: "A scalar has direction only whereas a vector has magnitude only",
        rationale: "Reverses the roles of magnitude and direction.",
      },
      {
        text: "A scalar is always positive whereas a vector is any quantity that can take a negative sign",
        rationale: "Scalars such as Celsius temperature, potential energy, or charge can be negative without having spatial direction.",
      },
      {
        text: "A scalar depends on time whereas a vector depends on space",
        rationale: "Both scalars (distance, energy) and vectors (velocity, force) involve space and time.",
      },
    ],
    workedNote:
      "A scalar has magnitude only whereas vector has both magnitude and direction.",
  },
  {
    slug: "def-momentum-conservation-mcq",
    conceptKey: "def-momentum-conservation",
    difficulty: "standard",
    targetQuantityKey: "primaryClassification",
    stem: "Which statement gives the complete principle of conservation of linear momentum required for full exam credit?",
    correctPrefix: "In any collision or explosion, ",
    distractors: [
      {
        text: "In any collision or explosion, total linear momentum before equals total linear momentum after under all external forces",
        rationale: "Omits the mandatory isolated-system condition: a net external force changes total system momentum.",
      },
      {
        text: "In any collision or explosion, total speed before equals total speed after provided no friction acts",
        rationale: "Confuses scalar speed with vector linear momentum (mass times velocity).",
      },
      {
        text: "In any collision or explosion, momentum is conserved only when kinetic energy is also conserved",
        rationale: "Momentum is conserved in both elastic and inelastic isolated collisions.",
      },
    ],
    workedNote:
      "Total linear momentum before equals total linear momentum after provided no external resultant force acts.",
  },
  {
    slug: "def-tensile-stress-mcq",
    conceptKey: "def-tensile-stress",
    difficulty: "foundation",
    targetQuantityKey: "primaryClassification",
    stem: "Which definition of tensile stress in a stretched metal wire meets full NCUK mark-scheme precision?",
    correctPrefix: "It is the ",
    distractors: [
      {
        text: "It is the tensile force acting per unit total outer surface area of the wire",
        rationale: "Uses cylindrical surface area instead of cross-sectional area perpendicular to the load.",
      },
      {
        text: "It is the extension produced per unit original length of the stretched wire",
        rationale: "Defines tensile strain rather than tensile stress.",
      },
      {
        text: "It is the product of tensile force and cross sectional area of the wire",
        rationale: "Multiplies force by area instead of dividing force by cross-sectional area.",
      },
    ],
    workedNote:
      "Tensile stress is the tensile force acting per unit cross sectional area.",
  },
  {
    slug: "def-young-modulus-mcq",
    conceptKey: "def-young-modulus",
    difficulty: "standard",
    targetQuantityKey: "primaryClassification",
    stem: "Which statement gives the full definition of Young's modulus for a solid material?",
    correctPrefix: "It is the ",
    distractors: [
      {
        text: "It is the ratio of applied load to extension for a specific wire sample",
        rationale: "Defines the spring constant k = F / x (geometry dependent), not the material constant Young modulus.",
      },
      {
        text: "It is the ratio of tensile strain to tensile stress across the plastic region",
        rationale: "Inverts stress over strain and uses the plastic region instead of the linear elastic region.",
      },
      {
        text: "It is the maximum tensile stress a specimen can sustain before breaking",
        rationale: "Defines ultimate tensile strength rather than Young's modulus.",
      },
    ],
    workedNote:
      "Young's modulus is the ratio of tensile stress to tensile strain within the linear elastic region.",
  },
  {
    slug: "def-elastic-limit-mcq",
    conceptKey: "def-elastic-limit",
    difficulty: "standard",
    targetQuantityKey: "primaryClassification",
    stem: "What is meant by the elastic limit of a ductile metal wire under tension?",
    correctPrefix: "It is the ",
    distractors: [
      {
        text: "It is the load at which the wire suddenly fractures into two separate pieces",
        rationale: "Confuses the elastic limit with the breaking or fracture point.",
      },
      {
        text: "It is the point where extension stops increasing even when additional load is hung",
        rationale: "Beyond the elastic limit the wire extends even more easily via plastic deformation.",
      },
      {
        text: "It is the minimum load required to initiate any measurable elastic extension",
        rationale: "Any non-zero load produces immediate elastic extension from the origin.",
      },
    ],
    workedNote:
      "The elastic limit is the maximum stress or load beyond which permanent plastic deformation occurs when unloaded.",
  },
  {
    slug: "def-shc-mcq",
    conceptKey: "def-specific-heat-capacity",
    difficulty: "foundation",
    targetQuantityKey: "primaryClassification",
    stem: "Which wording accurately defines the specific heat capacity of a substance?",
    correctPrefix: "The ",
    distractors: [
      {
        text: "The total thermal energy needed to warm an entire block by one kelvin",
        rationale: "Omits per unit mass; this defines heat capacity rather than specific heat capacity.",
      },
      {
        text: "The thermal energy needed per unit mass to melt a solid completely at its melting point",
        rationale: "Defines specific latent heat of fusion rather than specific heat capacity.",
      },
      {
        text: "The temperature rise produced when one joule of energy enters any mass of material",
        rationale: "Inverts energy per degree and omits unit mass.",
      },
    ],
    workedNote:
      "Specific heat capacity is the thermal energy required per unit mass to raise temperature by one kelvin without change of state.",
  },
  {
    slug: "def-latent-heat-mcq",
    conceptKey: "def-specific-latent-heat",
    difficulty: "foundation",
    targetQuantityKey: "primaryClassification",
    stem: "Which statement accurately defines specific latent heat?",
    correctPrefix: "The ",
    distractors: [
      {
        text: "The thermal energy required per unit mass to raise temperature by one kelvin during melting",
        rationale: "Temperature remains constant during a pure change of state.",
      },
      {
        text: "The total thermal energy released when an entire sample cools to room temperature",
        rationale: "Omits unit mass and describes sensible cooling rather than isothermal state change.",
      },
      {
        text: "The kinetic energy gained per molecule as a liquid warms toward its boiling point",
        rationale: "Latent heat alters intermolecular potential energy at constant mean kinetic energy.",
      },
    ],
    workedNote:
      "Specific latent heat is the thermal energy required per unit mass to change state at constant temperature.",
  },
  {
    slug: "def-internal-energy-mcq",
    conceptKey: "def-internal-energy",
    difficulty: "standard",
    targetQuantityKey: "primaryClassification",
    stem: "How is the internal energy of a thermodynamic system defined?",
    correctPrefix: "It is the ",
    distractors: [
      {
        text: "It is the macroscopic kinetic energy and gravitational potential energy of the container as a whole",
        rationale: "Bulk mechanical energies of the container are external energies, not internal energy.",
      },
      {
        text: "It is the thermal energy transferred across the boundary during heating alone",
        rationale: "Heat is energy in transit, whereas internal energy is a state property of the molecules inside.",
      },
      {
        text: "It is solely the average translational kinetic energy of a single molecule in the gas",
        rationale: "Internal energy sums BOTH kinetic and intermolecular potential energies over ALL molecules.",
      },
    ],
    workedNote:
      "Internal energy is the sum of random kinetic energies and intermolecular potential energies of all molecules.",
  },
  {
    slug: "def-boyle-law-mcq",
    conceptKey: "def-boyle-law",
    difficulty: "foundation",
    targetQuantityKey: "primaryClassification",
    stem: "Which complete statement of Boyle's law specifies all necessary controlled variables?",
    correctPrefix: "It states that ",
    distractors: [
      {
        text: "It states that pressure is inversely proportional to volume whenever a gas is compressed quickly",
        rationale: "Rapid compression heats the gas so temperature does not stay constant; fixed mass is also omitted.",
      },
      {
        text: "It states that pressure is directly proportional to volume at constant temperature",
        rationale: "Pressure and volume are inversely, not directly, proportional at constant T.",
      },
      {
        text: "It states that pressure is inversely proportional to Celsius temperature at constant volume",
        rationale: "Confuses Boyle's law with an inverted form of the pressure law.",
      },
    ],
    workedNote:
      "Boyle's law states that for a fixed mass of ideal gas at constant temperature pressure is inversely proportional to volume.",
  },
  {
    slug: "def-pressure-law-mcq",
    conceptKey: "def-pressure-law",
    difficulty: "standard",
    targetQuantityKey: "primaryClassification",
    stem: "Which statement gives the exact form of the Pressure Law for an ideal gas?",
    correctPrefix: "It states that ",
    distractors: [
      {
        text: "It states that for a fixed mass of gas at constant volume pressure is directly proportional to temperature in degrees Celsius",
        rationale: "Pressure vs Celsius has a non-zero intercept at freezing point; direct proportionality requires kelvin.",
      },
      {
        text: "It states that for any mass of gas at constant pressure volume is inversely proportional to kelvin temperature",
        rationale: "Mixes up Charles's law variables and inverts proportionality.",
      },
      {
        text: "It states that pressure is directly proportional to absolute temperature regardless of vessel expansion",
        rationale: "Omits the controlled variable of constant volume.",
      },
    ],
    workedNote:
      "The Pressure Law states that for a fixed mass of ideal gas at constant volume pressure is directly proportional to absolute temperature in kelvin.",
  },
  {
    slug: "def-charles-law-mcq",
    conceptKey: "def-charles-law",
    difficulty: "standard",
    targetQuantityKey: "primaryClassification",
    stem: "Which option correctly states Charles's law with all required physical conditions?",
    correctPrefix: "It states that ",
    distractors: [
      {
        text: "It states that volume is directly proportional to Celsius temperature when mass is constant",
        rationale: "Omits constant pressure and wrongly uses Celsius instead of absolute kelvin temperature.",
      },
      {
        text: "It states that for a fixed mass of gas at constant pressure volume is inversely proportional to kelvin temperature",
        rationale: "Heating an isobaric gas expands its volume directly, not inversely.",
      },
      {
        text: "It states that for a fixed mass of gas at constant temperature volume is directly proportional to pressure",
        rationale: "Confuses Charles's law with an inverted version of Boyle's law.",
      },
    ],
    workedNote:
      "Charles's law states that for a fixed mass of ideal gas at constant pressure volume is directly proportional to absolute temperature in kelvin.",
  },
  {
    slug: "def-shm-mcq",
    conceptKey: "def-shm",
    difficulty: "standard",
    targetQuantityKey: "primaryClassification",
    stem: "Which defining condition must an oscillating mass satisfy to execute simple harmonic motion?",
    correctPrefix: "Its ",
    distractors: [
      {
        text: "Its velocity is directly proportional to displacement and directed away from equilibrium",
        rationale: "Velocity is maximum at equilibrium and zero at turning points, not proportional to displacement.",
      },
      {
        text: "Its acceleration stays constant in magnitude and reverses sign only at the endpoints",
        rationale: "Constant acceleration produces parabolic motion, not sinusoidal simple harmonic motion.",
      },
      {
        text: "Its periodic oscillation repeats with constant amplitude regardless of force law",
        rationale: "Not every periodic motion is simple harmonic; acceleration must be proportional and opposite to displacement.",
      },
    ],
    workedNote:
      "In simple harmonic motion, acceleration is directly proportional to displacement from a fixed equilibrium position and always directed toward it.",
  },
  {
    slug: "def-lenz-law-mcq",
    conceptKey: "def-lenz-law",
    difficulty: "standard",
    targetQuantityKey: "primaryClassification",
    stem: "Which statement accurately expresses Lenz's law of electromagnetic induction?",
    correctPrefix: "The ",
    distractors: [
      {
        text: "The magnitude of induced electromotive force is always equal to the steady magnetic flux through the coil",
        rationale: "Confuses Faraday's rate-of-change law with steady flux and omits direction.",
      },
      {
        text: "The direction of induced current always assists the motion of the magnet to conserve charge",
        rationale: "Assisting motion would create energy from nothing, violating conservation of energy.",
      },
      {
        text: "The induced current always flows clockwise regardless of magnet polarity",
        rationale: "Induced current direction reverses whenever magnet polarity or direction of motion reverses.",
      },
    ],
    workedNote:
      "Lenz's law states that the direction of induced electromotive force opposes the change in magnetic flux linkage producing it.",
  },

  // --- High-precision causal & qualitative physics MCQs (16 core + 16 second-angle = 32 MCQs) ---
  {
    slug: "causal-gas-pressure-n2",
    conceptKey: "causal-kinetic-gas-pressure",
    difficulty: "higher",
    targetQuantityKey: "primaryClassification",
    stem: "A sealed rigid metal cylinder of helium gas is heated so its kelvin temperature increases. Which kinetic-theory explanation correctly explains why the gas pressure increases without relying on the ideal gas equation?",
    correctPrefix: "Heating causes ",
    distractors: [
      {
        text: "Heating causes helium molecules to expand in physical volume so they pack tightly against the cylinder walls",
        rationale: "Individual gas molecules do not swell in volume; kinetic energy and speed increase.",
      },
      {
        text: "Heating causes intermolecular repulsive forces to strengthen dramatically across the empty interior",
        rationale: "An ideal gas has negligible intermolecular forces between collisions.",
      },
      {
        text: "Heating causes pressure to rise simply because pressure equals molar constant times temperature divided by volume",
        rationale: "Circular algebraic restatement of the gas law fails to provide a microscopic kinetic mechanism.",
      },
    ],
    workedNote:
      "By kinetic theory and Newton's second law, faster molecules produce larger momentum change per wall collision and higher collision frequency raising average force per unit area.",
  },
  {
    slug: "causal-terminal-velocity-mcq",
    conceptKey: "causal-terminal-velocity",
    difficulty: "standard",
    targetQuantityKey: "primaryClassification",
    stem: "A steel ball bearing is released from rest at the surface of a tall column of viscous glycerol. Why does it eventually move downward at a constant terminal velocity?",
    correctPrefix: "As the sphere accelerates, ",
    distractors: [
      {
        text: "As the sphere accelerates, gravitational pull weakens with depth until the weight vanishes completely",
        rationale: "Weight stays constant near Earth's surface; acceleration stops because forces balance, not because gravity vanishes.",
      },
      {
        text: "As the sphere accelerates, upward viscous drag stays constant while kinetic energy reaches a fluid ceiling",
        rationale: "Viscous drag is speed-dependent and grows until it balances weight (and upthrust).",
      },
      {
        text: "As the sphere accelerates, upward drag exceeds weight so the ball moves steadily without net force",
        rationale: "If drag exceeded weight, the resultant force would point upward and decelerate the sphere.",
      },
    ],
    workedNote:
      "Initially weight exceeds drag, then drag increases with speed until upward drag equals downward weight making resultant force and acceleration zero.",
  },
  {
    slug: "causal-phase-plateau-mcq",
    conceptKey: "causal-phase-change-plateau",
    difficulty: "standard",
    targetQuantityKey: "primaryClassification",
    stem: "A pure crystalline wax sample is heated steadily by an electrical heater. During melting, the thermometer reading stays flat on a horizontal plateau. What happens at the molecular scale during this plateau?",
    correctPrefix: "Along the plateau, ",
    distractors: [
      {
        text: "Along the plateau, both molecular kinetic energy and molecular potential energy remain completely constant",
        rationale: "Energy is continually supplied by the heater, so internal potential energy must increase.",
      },
      {
        text: "Along the plateau, mean molecular kinetic energy rises steadily while molecular potential energy decreases",
        rationale: "A rise in mean molecular kinetic energy would raise the temperature rather than keeping a plateau.",
      },
      {
        text: "Along the plateau, all heater energy escapes immediately into the room so internal energy cannot change",
        rationale: "Even with negligible heat loss, melting requires latent heat to weaken intermolecular bonds.",
      },
    ],
    workedNote:
      "During melting, mean molecular kinetic energy stays constant while supplied energy increases internal potential energy by breaking bonds.",
  },
  {
    slug: "causal-filament-lamp-mcq",
    conceptKey: "causal-filament-lamp-non-ohmic",
    difficulty: "standard",
    targetQuantityKey: "primaryClassification",
    stem: "As the potential difference across a tungsten filament lamp is increased from zero, its current–voltage graph curves toward the voltage axis. What is the microscopic reason for this non-ohmic behaviour?",
    correctPrefix: "As current rises, ",
    distractors: [
      {
        text: "As current rises, heating reduces the number of free conduction electrons inside the tungsten wire",
        rationale: "In a metal the conduction electron density stays nearly constant; lattice vibrations cause the resistance rise.",
      },
      {
        text: "As current rises, tungsten atoms shrink in size so conduction electrons drift more slowly",
        rationale: "Atoms do not shrink; lattice ions vibrate with greater amplitude about their sites.",
      },
      {
        text: "As current rises, the tungsten wire lengthens significantly while temperature stays constant",
        rationale: "Thermal expansion is tiny compared to the large temperature-driven increase in resistivity.",
      },
    ],
    workedNote:
      "In a metal filament, higher temperature increases lattice ion vibration amplitude causing more frequent electron collisions and higher resistance.",
  },
  {
    slug: "causal-brownian-mcq",
    conceptKey: "causal-brownian-motion",
    difficulty: "foundation",
    targetQuantityKey: "primaryClassification",
    stem: "When illuminated smoke trapped in a glass cell is observed through a microscope, bright specks dance along erratic zig-zag paths. What causes this motion?",
    correctPrefix: "It occurs because ",
    distractors: [
      {
        text: "It occurs because visible air molecules collide directly with one another under the microscope lamp",
        rationale: "Air molecules are far too small to be seen under an optical microscope; only smoke specks are visible.",
      },
      {
        text: "It occurs because steady upward convection currents sweep all specks smoothly in one direction",
        rationale: "Convection produces smooth collective drift, not random individual zig-zag jitter.",
      },
      {
        text: "It occurs because the microscope lamp pushes the specks randomly with intense radiation pressure",
        rationale: "Radiation pressure from a bench lamp is negligible and directional rather than randomly fluctuating.",
      },
    ],
    workedNote:
      "Brownian motion arises because uneven rapid collisions from much smaller invisible randomly moving air molecules transfer momentum to smoke specks.",
  },
  {
    slug: "causal-isothermal-mcq",
    conceptKey: "causal-isothermal-thin-wall",
    difficulty: "standard",
    targetQuantityKey: "primaryClassification",
    stem: "A student wants to compress trapped dry air inside a metal syringe so that the compression closely follows Boyle's law. Which experimental condition best ensures an isothermal change?",
    correctPrefix: "The student should ",
    distractors: [
      {
        text: "The student should compress rapidly inside thick foam insulation so no heat escapes to the room",
        rationale: "Rapid insulated compression is adiabatic and raises the gas temperature.",
      },
      {
        text: "The student should heat the syringe continuously while pushing the piston inward quickly",
        rationale: "Adding heat raises temperature further and violates Boyle's constant-temperature requirement.",
      },
      {
        text: "The student should open the syringe valve slightly so gas leaks out as volume shrinks",
        rationale: "Allowing gas to escape violates the fixed-mass requirement of Boyle's law.",
      },
    ],
    workedNote:
      "To keep temperature constant, compress slowly inside a thin conducting wall so thermal energy transfers to surroundings keeping temperature constant.",
  },
  {
    slug: "causal-collision-elastic-mcq",
    conceptKey: "causal-elastic-vs-inelastic-collision",
    difficulty: "foundation",
    targetQuantityKey: "primaryClassification",
    stem: "Two gliders collide on a frictionless horizontal air track with no external horizontal forces acting. Which comparison between an elastic and an inelastic collision is always correct?",
    correctPrefix: "In isolated collisions, ",
    distractors: [
      {
        text: "In isolated collisions, kinetic energy is conserved in both whereas momentum is conserved only when gliders bounce apart",
        rationale: "Reverses the conservation rules: momentum is always conserved, while kinetic energy is conserved only in elastic impacts.",
      },
      {
        text: "In isolated collisions, neither linear momentum nor kinetic energy is conserved when gliders stick together",
        rationale: "Even a completely inelastic sticking collision conserves linear momentum if no external force acts.",
      },
      {
        text: "In isolated collisions, both momentum and kinetic energy increase after an elastic rebound",
        rationale: "Total energy and momentum cannot spontaneously increase in an isolated collision.",
      },
    ],
    workedNote:
      "In an isolated collision, linear momentum is conserved in both whereas total kinetic energy is conserved only in an elastic collision.",
  },
  {
    slug: "causal-circular-motion-mcq",
    conceptKey: "causal-circular-motion-acceleration",
    difficulty: "standard",
    targetQuantityKey: "primaryClassification",
    stem: "A small stone whirled on a string moves in a horizontal circle at constant speed. Which statement correctly explains its acceleration and the work done by the centripetal force?",
    correctPrefix: "Throughout the orbit, ",
    distractors: [
      {
        text: "Throughout the orbit, acceleration is zero because speed stays constant while an outward centrifugal force balances tension",
        rationale: "Velocity changes direction continuously so acceleration is non-zero; no outward centrifugal force acts on the stone.",
      },
      {
        text: "Throughout the orbit, the centripetal force acts along the tangent and continually increases the kinetic energy",
        rationale: "Centripetal force points radially inward perpendicular to velocity, so speed and kinetic energy stay constant.",
      },
      {
        text: "Throughout the orbit, acceleration points radially outward away from the centre while doing positive work",
        rationale: "Acceleration points toward the centre and perpendicular force does zero work.",
      },
    ],
    workedNote:
      "In uniform circular motion, velocity direction changes continuously so resultant centripetal force and acceleration act perpendicular to velocity toward the centre doing zero work.",
  },
  {
    slug: "causal-ohmic-precaution-mcq",
    conceptKey: "causal-ohmic-heating-precaution",
    difficulty: "foundation",
    targetQuantityKey: "primaryClassification",
    stem: "When investigating Ohm's law for a length of constantan resistance wire, what practical precaution should be taken so the wire remains ohmic throughout the experiment?",
    correctPrefix: "The experimenter should ",
    distractors: [
      {
        text: "The experimenter should pass the highest available current continuously so the wire warms to a bright glow",
        rationale: "Large continuous current causes Joule heating, changing resistance and breaking linearity.",
      },
      {
        text: "The experimenter should wrap the wire tightly in thick insulating wool so generated heat stays trapped",
        rationale: "Trapping heat raises wire temperature faster and worsens non-ohmic drift.",
      },
      {
        text: "The experimenter should reverse the ammeter leads after every reading to eliminate wire resistance",
        rationale: "Reversing leads checks polarity only and cannot prevent thermal resistance rise.",
      },
    ],
    workedNote:
      "To keep wire temperature constant, use small currents and open the switch between readings to prevent Joule heating from changing wire temperature and resistance.",
  },
  {
    slug: "causal-thermistor-divider-mcq",
    conceptKey: "causal-ntc-thermistor-divider",
    difficulty: "standard",
    targetQuantityKey: "primaryClassification",
    stem: "A negative temperature coefficient thermistor is wired in series with a fixed resistor across a constant-voltage battery. Without calculation, what happens when the thermistor is warmed in hot water?",
    correctPrefix: "As temperature increases, ",
    distractors: [
      {
        text: "As temperature increases, lattice vibration raises thermistor resistance so the fixed resistor receives a smaller voltage share",
        rationale: "Confuses a semiconductor NTC thermistor with a metal filament lamp.",
      },
      {
        text: "As temperature increases, thermistor resistance drops to zero while total circuit current decreases",
        rationale: "Lowering series resistance increases, rather than decreases, circuit current.",
      },
      {
        text: "As temperature increases, potential difference across both the thermistor and fixed resistor increases simultaneously",
        rationale: "The two potential differences must sum to the constant battery electromotive force.",
      },
    ],
    workedNote:
      "In an NTC thermistor divider, heating releases more charge carriers lowering thermistor resistance so its share of potential difference falls while the fixed resistor voltage rises.",
  },
  {
    slug: "causal-ldr-divider-mcq",
    conceptKey: "causal-ldr-brightness-divider",
    difficulty: "standard",
    targetQuantityKey: "primaryClassification",
    stem: "A light-dependent resistor is connected in series with a fixed resistor across an ideal DC supply. A bright lamp is switched on above the sensor. Without calculation, what is the immediate response?",
    correctPrefix: "Under illumination, ",
    distractors: [
      {
        text: "Under illumination, incident photons block electron motion increasing light dependent resistor resistance and lowering current",
        rationale: "Light frees additional charge carriers in an LDR, lowering rather than raising its resistance.",
      },
      {
        text: "Under illumination, resistance falls so potential difference across the light dependent resistor increases",
        rationale: "A smaller resistance receives a smaller fraction of the fixed supply voltage.",
      },
      {
        text: "Under illumination, circuit current stays constant because the fixed resistor governs the whole loop",
        rationale: "Total series resistance equals the sum of both resistances, so reducing LDR resistance raises total current.",
      },
    ],
    workedNote:
      "For an illuminated LDR, brighter light releases more charge carriers reducing light dependent resistor resistance so circuit current rises and its voltage share decreases.",
  },
  {
    slug: "causal-diode-led-mcq",
    conceptKey: "causal-diode-led-characteristic",
    difficulty: "standard",
    targetQuantityKey: "primaryClassification",
    stem: "Which description accurately summarizes the current–voltage behaviour and safe wiring of a semiconductor light-emitting diode?",
    correctPrefix: "A diode exhibits ",
    distractors: [
      {
        text: "A diode exhibits a straight line through the origin in both quadrants requiring a parallel shunt resistor",
        rationale: "Describes an ohmic resistor rather than an asymmetric threshold diode.",
      },
      {
        text: "A diode exhibits steady current in reverse bias and infinite resistance above the forward threshold",
        rationale: "Reverses forward and reverse conduction states completely.",
      },
      {
        text: "A diode exhibits steadily rising resistance above threshold so no series protective resistor is needed",
        rationale: "Above threshold, diode resistance drops sharply so current surges dangerously without a series limiter.",
      },
    ],
    workedNote:
      "An LED shows negligible current in reverse bias and below forward threshold followed by rapid current rise requiring a protective series resistor.",
  },
  {
    slug: "causal-rc-smaller-r-mcq",
    conceptKey: "causal-rc-without-calculation-change",
    difficulty: "higher",
    targetQuantityKey: "primaryClassification",
    stem: "A charged capacitor discharges through a fixed resistor. The experiment is repeated from the same initial voltage after replacing the resistor with one of smaller resistance. Without calculation, how does the discharge change?",
    correctPrefix: "A ",
    distractors: [
      {
        text: "A smaller resistance increases the time constant so initial current drops and voltage stays higher for longer",
        rationale: "Time constant τ = R C decreases, not increases, when R is reduced.",
      },
      {
        text: "A smaller resistance keeps the time constant unchanged because capacitance alone controls discharge speed",
        rationale: "Time constant depends on the product of BOTH resistance and capacitance.",
      },
      {
        text: "A smaller resistance reduces initial current while doubling the total charge initially stored on the plates",
        rationale: "Initial charge Q = C V depends only on capacitance and initial voltage, not the discharge resistor.",
      },
    ],
    workedNote:
      "From τ = RC and I = V/R, a smaller resistance reduces the time constant so initial current is larger and capacitor potential difference falls more rapidly.",
  },
  {
    slug: "causal-iv-gradient-trap-mcq",
    conceptKey: "causal-iv-curve-gradient-trap",
    difficulty: "higher",
    targetQuantityKey: "primaryClassification",
    stem: "A student plots current on the vertical axis against potential difference on the horizontal axis for both an ohmic wire and a filament lamp. Which statement about determining resistance from these graphs is correct?",
    correctPrefix: "Correctly interpreted, ",
    distractors: [
      {
        text: "Correctly interpreted, the straight line gradient equals resistance directly and the tangent gradient gives lamp resistance",
        rationale: "Commits both classic I–V traps: gradient is 1/R (not R), and curved static resistance is V/I (not tangent).",
      },
      {
        text: "Correctly interpreted, a steeper ohmic line always indicates a larger electrical resistance",
        rationale: "When I is on the vertical axis, steeper slope means larger I/V, hence SMALLER resistance.",
      },
      {
        text: "Correctly interpreted, resistance of a filament lamp equals the area underneath the curve up to that voltage",
        rationale: "Area under an I–V curve does not equal resistance.",
      },
    ],
    workedNote:
      "With current on the vertical axis the linear gradient equals the reciprocal of resistance while non ohmic resistance uses coordinate ratio.",
  },
  {
    slug: "causal-internal-r-load-mcq",
    conceptKey: "causal-internal-resistance-terminal-pd",
    difficulty: "standard",
    targetQuantityKey: "primaryClassification",
    stem: "A battery with non-negligible internal resistance drives a variable resistor. Without calculation, what happens to the voltmeter reading across the battery terminals when the variable resistance is reduced?",
    correctPrefix: "Reducing load resistance means ",
    distractors: [
      {
        text: "Reducing load resistance means circuit current drops so terminal potential difference rises above the electromotive force",
        rationale: "Reducing load resistance raises current and can never push terminal pd above emf.",
      },
      {
        text: "Reducing load resistance means terminal potential difference stays fixed because battery electromotive force never changes",
        rationale: "Ignores internal lost volts Ir, which grows as current rises.",
      },
      {
        text: "Reducing load resistance means internal resistance decreases proportionally so lost volts remain constant",
        rationale: "Internal resistance is a physical property of the cell and does not track the external load.",
      },
    ],
    workedNote:
      "Because V = ε − Ir, lower external resistance increases circuit current raising lost volts across internal resistance so terminal potential difference decreases.",
  },
  // --- 17 Additional Second-Angle Qualitative MCQs spanning AC1–AC4.4 ---
  {
    slug: "angle2-kinetic-circular-trap",
    conceptKey: "causal-kinetic-gas-pressure",
    difficulty: "higher",
    targetQuantityKey: "reasoningAnchor",
    stem: "An examiner awards zero credit to a student who explains rising gas pressure upon heating solely by stating that pressure is proportional to temperature from the gas law. What physical principle is missing?",
    correctPrefix: "Examiners look for ",
    distractors: [
      {
        text: "Examiners look for thermal expansion of the rigid steel flask reducing internal gas density",
        rationale: "A rigid vessel has fixed volume; pressure increase comes from faster molecular impacts.",
      },
      {
        text: "Examiners look for a calculation of molar mass using Avogadro constant instead of molecular collisions",
        rationale: "Qualitative kinetic explanations require collision momentum transfer, not a molar mass plug-in.",
      },
      {
        text: "Examiners look for gravitational potential energy increase of molecules rising inside the cylinder",
        rationale: "Gravitational energy changes are negligible compared to molecular kinetic energy.",
      },
    ],
    workedNote:
      "Marks require microscopic Newton second law mechanics: kinetic pressure arises from rate of momentum transfer to container walls rather than circular appeal to gas equations.",
  },
  {
    slug: "angle2-latent-vap-vs-fusion",
    conceptKey: "def-specific-latent-heat",
    difficulty: "higher",
    targetQuantityKey: "requiredMarkPointC",
    stem: "Why is the specific latent heat of vaporisation of water substantially larger than its specific latent heat of fusion?",
    correctPrefix: "Because ",
    distractors: [
      {
        text: "Because boiling raises molecular temperature rapidly whereas melting occurs at constant temperature",
        rationale: "Both melting and boiling take place at constant temperature.",
      },
      {
        text: "Because steam has a much higher density than liquid water requiring extra gravitational work",
        rationale: "Steam is far less dense than liquid water, expanding dramatically on vaporisation.",
      },
      {
        text: "Because melting breaks covalent bonds inside molecules whereas boiling only warms the container",
        rationale: "Neither melting nor boiling breaks intramolecular covalent bonds; intermolecular forces are overcome.",
      },
    ],
    workedNote:
      "Specific latent heat of vaporisation exceeds fusion because intermolecular bonds are completely broken and work is done expanding against atmospheric pressure.",
  },
  {
    slug: "angle2-ideal-gas-internal-energy",
    conceptKey: "def-internal-energy",
    difficulty: "higher",
    targetQuantityKey: "requiredMarkPointC",
    stem: "How does the internal energy of an ideal monatomic gas differ from that of a real liquid?",
    correctPrefix: "Specifically, ",
    distractors: [
      {
        text: "Specifically, an ideal gas has zero molecular kinetic energy so its internal energy is purely potential",
        rationale: "Reverses the ideal-gas assumption completely: ideal-gas molecules have kinetic energy and zero potential energy.",
      },
      {
        text: "Specifically, internal energy of an ideal gas depends only on container volume and not on temperature",
        rationale: "Ideal-gas internal energy depends solely on absolute temperature (and number of moles).",
      },
      {
        text: "Specifically, an ideal gas stores extra elastic potential energy inside stretched intermolecular bonds",
        rationale: "Ideal-gas molecules exert negligible intermolecular forces except during brief collisions.",
      },
    ],
    workedNote:
      "Because intermolecular forces are negligible, for an ideal gas intermolecular potential energy is zero so internal energy depends solely on absolute temperature.",
  },
  {
    slug: "angle2-boyle-linear-graph",
    conceptKey: "def-boyle-law",
    difficulty: "standard",
    targetQuantityKey: "requiredMarkPointC",
    stem: "A student tests Boyle's law using pressure and volume measurements of trapped dry air at constant room temperature. Which plotted graph provides the clearest straight-line confirmation?",
    correctPrefix: "Confirmation is clearest because ",
    distractors: [
      {
        text: "Confirmation is clearest because plotting pressure against volume produces a straight line through the origin",
        rationale: "Pressure against volume is a curved hyperbola, not a straight line.",
      },
      {
        text: "Confirmation is clearest because plotting pressure against volume squared produces a horizontal straight line",
        rationale: "Since p V is constant, p vs V squared is curved rather than horizontal.",
      },
      {
        text: "Confirmation is clearest because plotting volume against pressure squared passes through the origin",
        rationale: "Inversely proportional variables linearise against reciprocal, not square.",
      },
    ],
    workedNote:
      "Since p is inversely proportional to V, plotting pressure against reciprocal volume produces a straight line through the origin.",
  },
  {
    slug: "angle2-charles-absolute-zero",
    conceptKey: "def-charles-law",
    difficulty: "standard",
    targetQuantityKey: "requiredMarkPointC",
    stem: "How can an experimental straight-line graph of volume against Celsius temperature at constant pressure be used to estimate absolute zero?",
    correctPrefix: "It works because ",
    distractors: [
      {
        text: "It works because the vertical volume intercept at freezing point directly equals absolute zero",
        rationale: "The vertical intercept gives the gas volume at zero Celsius, not absolute zero temperature.",
      },
      {
        text: "It works because the gradient of the volume against Celsius line equals absolute zero",
        rationale: "The gradient gives expansion rate per degree rather than the zero-volume temperature intercept.",
      },
      {
        text: "It works because doubling Celsius temperature always doubles the ideal gas volume",
        rationale: "Volume scales proportionally with kelvin temperature, never Celsius temperature.",
      },
    ],
    workedNote:
      "At constant pressure, extrapolating the volume against Celsius line back to zero volume locates absolute zero.",
  },
  {
    slug: "angle2-scalar-classification",
    conceptKey: "def-scalar-vs-vector",
    difficulty: "foundation",
    targetQuantityKey: "requiredMarkPointA",
    stem: "Which description correctly identifies purely scalar physical quantities?",
    correctPrefix: "A ",
    distractors: [
      {
        text: "A scalar quantity includes displacement, velocity, force, and linear momentum",
        rationale: "Every listed example is a vector possessing spatial direction.",
      },
      {
        text: "A scalar quantity includes weight, acceleration, moment, and electric field strength",
        rationale: "All four listed quantities are directional vectors.",
      },
      {
        text: "A scalar quantity requires a direction angle whenever energy or mass is recorded",
        rationale: "Scalars have magnitude only and carry no spatial direction.",
      },
    ],
    workedNote:
      "A scalar quantity is completely specified by magnitude alone such as mass energy speed or temperature.",
  },
  {
    slug: "angle2-equilibrium-both-conditions",
    conceptKey: "def-principle-of-moments",
    difficulty: "standard",
    targetQuantityKey: "requiredMarkPointB",
    stem: "Two equal and opposite parallel forces act at opposite ends of a steering wheel (a couple). The resultant force is zero, yet the wheel is NOT in equilibrium. Why?",
    correctPrefix: "Because ",
    distractors: [
      {
        text: "Because equilibrium only requires resultant force to be zero and never depends on turning moments",
        rationale: "A couple has zero resultant force yet produces a net turning torque.",
      },
      {
        text: "Because the two forces must act in the same direction to establish static equilibrium",
        rationale: "Same-direction forces yield a non-zero resultant force and accelerate the centre of mass.",
      },
      {
        text: "Because rigid body equilibrium requires both resultant force and resultant moment to be non zero",
        rationale: "Equilibrium requires both resultant force and resultant moment to be ZERO.",
      },
    ],
    workedNote:
      "Complete rigid body equilibrium also requires zero resultant force in any direction alongside zero resultant moment about any point.",
  },
  {
    slug: "angle2-moment-vs-joule-units",
    conceptKey: "def-moment",
    difficulty: "higher",
    targetQuantityKey: "requiredMarkPointC",
    stem: "Both mechanical work and the moment of a force multiply force by distance, yet moments are never written in joules. Why is the unit newton metre retained for a moment?",
    correctPrefix: "Because a moment is ",
    distractors: [
      {
        text: "Because a moment is a scalar energy transfer identical to heat supplied to a beam",
        rationale: "Moment is a turning effect, not an energy transfer.",
      },
      {
        text: "Because a moment uses distance parallel to the force whereas work uses perpendicular distance",
        rationale: "Reverses the geometry: work uses parallel displacement whereas moment uses perpendicular lever arm.",
      },
      {
        text: "Because newton metre has completely different SI base dimensions from the joule",
        rationale: "Both share dimensions kg m² s⁻², yet they represent physically distinct vector/scalar concepts.",
      },
    ],
    workedNote:
      "Moment is measured in newton metres which is a turning effect rather than mechanical work in joules.",
  },
  {
    slug: "angle2-young-modulus-graph",
    conceptKey: "def-young-modulus",
    difficulty: "standard",
    targetQuantityKey: "requiredMarkPointC",
    stem: "A tensile testing machine plots tensile stress on the vertical axis against tensile strain on the horizontal axis for a steel rod. How is Young's modulus determined from the plot?",
    correctPrefix: "Young's modulus ",
    distractors: [
      {
        text: "Young's modulus equals the total area enclosed beneath the stress against strain graph up to fracture",
        rationale: "Area under stress–strain gives strain energy per unit volume (toughness), not Young's modulus.",
      },
      {
        text: "Young's modulus equals the reciprocal of the gradient of the linear region of the graph",
        rationale: "Gradient is stress divided by strain, which is directly Young's modulus (not its reciprocal).",
      },
      {
        text: "Young's modulus equals the highest stress coordinate reached near necking",
        rationale: "Maximum stress coordinate is the ultimate tensile strength.",
      },
    ],
    workedNote:
      "Young's modulus equals the gradient of the initial straight line region of a stress against strain graph.",
  },
  {
    slug: "angle2-resistivity-cut-wire",
    conceptKey: "def-resistivity",
    difficulty: "standard",
    targetQuantityKey: "requiredMarkPointB",
    stem: "A uniform nichrome wire is cut into half its original length at constant room temperature. Why does the resistivity of the shorter piece stay identical to the original wire?",
    correctPrefix: "Because resistivity is a ",
    distractors: [
      {
        text: "Because resistivity is a dimension dependent quantity that halves whenever wire length halves",
        rationale: "Resistance halves when length halves, but resistivity stays constant.",
      },
      {
        text: "Because cutting the wire doubles cross sectional area to cancel the reduced length",
        rationale: "Cutting a wire does not change its diameter or cross-sectional area.",
      },
      {
        text: "Because resistance of a metal wire is completely independent of its length",
        rationale: "Resistance is directly proportional to length (R = ρL/A).",
      },
    ],
    workedNote:
      "Resistivity is a material property independent of sample dimensions at constant temperature.",
  },
  {
    slug: "angle2-capacitance-constant",
    conceptKey: "def-farad",
    difficulty: "standard",
    targetQuantityKey: "requiredMarkPointC",
    stem: "A parallel-plate capacitor is charged to a higher potential difference without exceeding its breakdown rating. What happens to its capacitance?",
    correctPrefix: "Its capacitance stays constant because ",
    distractors: [
      {
        text: "Its capacitance stays constant because charge stored stays fixed as voltage increases",
        rationale: "Charge increases proportionally with voltage (Q = CV) so the ratio Q/V stays constant.",
      },
      {
        text: "Its capacitance doubles because doubling potential difference doubles the farad rating",
        rationale: "Capacitance is fixed by plate geometry and dielectric, not applied voltage.",
      },
      {
        text: "Its capacitance halves because potential difference appears in the denominator of charge per volt",
        rationale: "Forgets that Q also doubles when V doubles, keeping C = Q/V invariant.",
      },
    ],
    workedNote:
      "Both Q and V scale proportionally, so capacitance of a given geometry is constant and independent of applied voltage.",
  },
  {
    slug: "angle2-iv-steeper-line",
    conceptKey: "causal-iv-curve-gradient-trap",
    difficulty: "standard",
    targetQuantityKey: "requiredMarkPointB",
    stem: "Two ohmic metallic conductors X and Y are plotted on the same graph with current on the vertical axis and potential difference on the horizontal axis. Line X is steeper than line Y. Which conclusion follows?",
    correctPrefix: "Since gradient is reciprocal resistance, ",
    distractors: [
      {
        text: "Since gradient is reciprocal resistance, a steeper ohmic line corresponds to a larger resistance",
        rationale: "Reverses the inverse relationship between I–V slope and resistance.",
      },
      {
        text: "Since gradient is reciprocal resistance, both conductors have identical resistance because both pass through the origin",
        rationale: "Passing through the origin shows ohmic behaviour, not equal resistance values.",
      },
      {
        text: "Since gradient is reciprocal resistance, conductor X must be operating at a higher temperature than conductor Y",
        rationale: "Slope alone compares resistance values, not temperature directly.",
      },
    ],
    workedNote:
      "With current on the y-axis, gradient = I / V = 1 / R; therefore a steeper ohmic line corresponds to a smaller resistance.",
  },
  {
    slug: "angle2-ohmic-low-current",
    conceptKey: "causal-ohmic-heating-precaution",
    difficulty: "foundation",
    targetQuantityKey: "requiredMarkPointA",
    stem: "Under what essential physical condition is the current through a metallic conductor directly proportional to the potential difference across it?",
    correctPrefix: "Specifically, ",
    distractors: [
      {
        text: "Specifically, Ohm law applies to every circuit component regardless of temperature or heating",
        rationale: "Non-ohmic components and heated filaments violate direct proportionality.",
      },
      {
        text: "Specifically, Ohm law applies only when current flows through a vacuum rather than a solid metal",
        rationale: "Metallic conductors at constant temperature are the primary ohmic devices.",
      },
      {
        text: "Specifically, Ohm law applies only when a variable resistor increases circuit temperature smoothly",
        rationale: "Changing temperature changes metal resistivity and breaks linearity.",
      },
    ],
    workedNote:
      "Ohm law applies only when temperature and physical conditions remain constant.",
  },
  {
    slug: "angle2-kirchhoff-opposing-cells",
    conceptKey: "def-kirchhoff-second",
    difficulty: "higher",
    targetQuantityKey: "requiredMarkPointC",
    stem: "Two ideal cells are connected in series with their positive terminals facing each other inside a single closed loop with two resistors. How does Kirchhoff's second law treat their electromotive forces?",
    correctPrefix: "When summing around the loop, ",
    distractors: [
      {
        text: "When summing around the loop, opposing cells always add together to double the net circuit electromotive force",
        rationale: "Opposing polarities push charge in opposite directions around the loop, so their emfs subtract.",
      },
      {
        text: "When summing around the loop, the smaller cell is ignored completely while the larger cell drives the entire current",
        rationale: "Both cells contribute algebraically to the net emf around the loop.",
      },
      {
        text: "When summing around the loop, current cannot flow unless both cells have identical electromotive force",
        rationale: "If the emfs differ, the difference drives current around the loop; equal opposing cells give zero net emf.",
      },
    ],
    workedNote:
      "In Kirchhoff's loop rule, opposing cells subtract algebraically when traversing the loop in a consistent direction.",
  },
  {
    slug: "angle2-systematic-averaging-trap",
    conceptKey: "causal-random-vs-systematic-error",
    difficulty: "standard",
    targetQuantityKey: "requiredMarkPointC",
    stem: "A micrometer screw gauge has a constant positive zero error that the experimenter forgets to subtract. Repeating the wire diameter measurement many times produces closely clustered readings. What is the effect of averaging?",
    correctPrefix: "In this situation, ",
    distractors: [
      {
        text: "In this situation, averaging repeated measurements eliminates the zero error and makes the mean completely accurate",
        rationale: "Every reading shares the same positive offset, so the mean still carries the exact zero error.",
      },
      {
        text: "In this situation, repeating measurements worsens random scatter without improving precision",
        rationale: "Repeating and averaging reduces random scatter and improves precision.",
      },
      {
        text: "In this situation, zero error automatically cancels because half the readings are too high and half too low",
        rationale: "Symmetric scatter describes random error, not a one-sided systematic zero offset.",
      },
    ],
    workedNote:
      "Averaging repeated measurements improves precision against random scatter but cannot remove a systematic zero error.",
  },
  {
    slug: "angle2-momentum-sign-vector",
    conceptKey: "def-momentum-conservation",
    difficulty: "standard",
    targetQuantityKey: "requiredMarkPointC",
    stem: "Two trolleys approach each other head-on from opposite directions on a smooth track. Why must opposite velocity signs be assigned when applying conservation of linear momentum?",
    correctPrefix: "Because ",
    distractors: [
      {
        text: "Because momentum is a scalar quantity whose total magnitude always increases on head on impact",
        rationale: "Momentum is a vector quantity, not a scalar.",
      },
      {
        text: "Because kinetic energy is always negative for any object moving toward the left",
        rationale: "Kinetic energy is a non-negative scalar independent of direction.",
      },
      {
        text: "Because mass changes sign whenever a trolley reverses its direction of travel",
        rationale: "Mass is always positive; velocity carries the directional sign.",
      },
    ],
    workedNote:
      "Momentum is a vector so opposite directions carry opposite signs when computing total momentum.",
  },
  {
    slug: "angle2-diode-protective-resistor",
    conceptKey: "causal-diode-led-characteristic",
    difficulty: "foundation",
    targetQuantityKey: "requiredMarkPointC",
    stem: "Why is a fixed resistor routinely wired in series with a light-emitting diode when measuring its forward current–voltage characteristic?",
    correctPrefix: "In the test circuit, ",
    distractors: [
      {
        text: "In the test circuit, a protective series resistor is included to raise the reverse breakdown voltage of the diode",
        rationale: "A series resistor does not alter the internal semiconductor junction breakdown rating.",
      },
      {
        text: "In the test circuit, a protective series resistor is included to make the diode behave as an ohmic conductor",
        rationale: "The diode itself remains non-ohmic; the resistor prevents excessive current above threshold.",
      },
      {
        text: "In the test circuit, a protective series resistor is included to prevent the voltmeter from drawing charge",
        rationale: "Voltmeter loading is avoided by high voltmeter resistance, not the LED safety resistor.",
      },
    ],
    workedNote:
      "Above threshold the LED resistance drops sharply, so a protective series resistor is included to limit current and prevent thermal damage to the junction.",
  },
  {
    slug: "angle2-terminal-velocity-drag-growth",
    conceptKey: "causal-terminal-velocity",
    difficulty: "standard",
    targetQuantityKey: "requiredMarkPointB",
    stem: "A skydiver leaps from a stationary balloon and falls vertically before opening the parachute. Why does the gradient of the skydiver's velocity–time graph decrease gradually toward zero?",
    correctPrefix: "During the fall, ",
    distractors: [
      {
        text: "During the fall, gravitational field strength drops rapidly toward zero as altitude decreases",
        rationale: "Gravity stays virtually constant over skydiving altitudes.",
      },
      {
        text: "During the fall, air resistance stays constant while the skydiver loses mass",
        rationale: "Air drag grows strongly with speed while mass remains constant.",
      },
      {
        text: "During the fall, upward drag decreases with speed so acceleration climbs smoothly",
        rationale: "Drag increases with speed, reducing acceleration.",
      },
    ],
    workedNote:
      "The gradient of a velocity–time graph is acceleration: resistive drag force grows with speed reducing the downward resultant force and acceleration.",
  },
  {
    slug: "angle2-elastic-limit-plastic",
    conceptKey: "def-elastic-limit",
    difficulty: "standard",
    targetQuantityKey: "requiredMarkPointB",
    stem: "A copper specimen is stretched slowly past its elastic limit and then all hanging masses are carefully removed. What happens to the length of the wire?",
    correctPrefix: "After unloading, ",
    distractors: [
      {
        text: "After unloading, the wire snaps back to a length shorter than its original unstretched length",
        rationale: "Plastic stretching causes permanent elongation, never permanent shortening.",
      },
      {
        text: "After unloading, the wire returns identically to its original length because copper is a metal",
        rationale: "Complete elastic recovery occurs only below the elastic limit.",
      },
      {
        text: "After unloading, Young modulus increases permanently while extension returns to zero",
        rationale: "Permanent extension remains after exceeding the elastic limit.",
      },
    ],
    workedNote:
      "Exceeding the elastic limit leaves a permanent extension due to plastic deformation upon unloading.",
  },
];

function generateBank1QualitativeMcqs(
  baseSeed: number,
  generatorModel: string,
): CandidateQuestionInput[] {
  const ruleMap = new Map(
    NCUK_CONCEPTUAL_RULE_TABLE.map((e) => [e.conceptKey, e]),
  );
  const items: CandidateQuestionInput[] = [];

  for (let idx = 0; idx < CONCEPTUAL_MCQ_BLUEPRINTS.length; idx += 1) {
    const bp = CONCEPTUAL_MCQ_BLUEPRINTS[idx];
    const rule = ruleMap.get(bp.conceptKey);
    if (!rule) {
      throw new Error(`Missing rule entry for conceptKey "${bp.conceptKey}"`);
    }
    const seed = baseSeed + idx + 1;
    const scenarioSpec: Record<string, unknown> = {
      kind: "conceptual-classification",
      topicArea: rule.topicArea,
      conceptKey: rule.conceptKey,
      variantIndex: idx % 50,
      promptMode: "mcq",
    };
    const solved = solvePlugin("conceptual-classification", scenarioSpec);
    const truthStr = String(solved[bp.targetQuantityKey]);
    const correctText = `${bp.correctPrefix ?? ""}${truthStr}${bp.correctSuffix ?? ""}`.trim();
    const options = buildVerbalMcqOptions(correctText, bp.distractors, seed);

    items.push({
      id: `${NCUK_QUAL_EXAM_ID_PREFIX}-mcq-${String(idx + 1).padStart(3, "0")}-${bp.slug}`,
      conceptId: rule.conceptId,
      templateArchetype: rule.templateArchetype,
      seed,
      syllabi: ncukTag(rule.ncukTopicId, rule.ncukSubtopicId, rule.ncukLevel),
      format: "mcq",
      difficulty: bp.difficulty,
      domain: "pure-calculation",
      scenarioSpec,
      hiddenQuantities: [bp.targetQuantityKey],
      requiredGivens: [],
      targetMode: "qualitative",
      targetQuantityKey: bp.targetQuantityKey,
      questionPlan: {
        targetSummary: `Assess conceptual NCUK understanding of ${rule.title} via pure qualitative multiple-choice discrimination`,
        distractorStrategy: [
          `misconception-trap::${rule.conceptKey}`,
          `inverted-definition::${rule.conceptId}`,
          `missing-controlled-condition::${rule.templateArchetype}`,
        ],
      },
      stem: bp.stem,
      options,
      workedSolution: `${bp.workedNote} Verified key statement: ${truthStr}.`,
      markScheme: [
        {
          code: "B1",
          criterion: `Selects the accurate qualitative statement identifying that ${truthStr}.`,
          marks: 1,
        },
      ],
      totalMarks: 1,
      generatorModel,
    });
  }

  return items;
}

// ============================================================================
// BANK 2: 2-MARK & 4-MARK SHORT STRUCTURED ITEMS (80 ITEMS: 42 x 2m + 38 x 4m)
// ============================================================================

interface Short2mBlueprint {
  readonly slug: string;
  readonly conceptKey: string;
  readonly difficulty: QuestionDifficulty;
  readonly promptMode:
    | "define"
    | "explain"
    | "state-and-explain"
    | "without-calculation";
  readonly stem: string;
  readonly splitTwoParts: boolean;
  readonly partAPrompt: string;
  readonly partBPrompt?: string;
  readonly answerAPrefix?: string;
  readonly answerBPrefix?: string;
}

const SHORT_2M_BLUEPRINTS: readonly Short2mBlueprint[] = [
  // All 27 canonical definitions + 15 crisp 2m explanations / "Without calculation" items = 42 x 2m!
  {
    slug: "def-coulomb-2m",
    conceptKey: "def-coulomb",
    difficulty: "foundation",
    promptMode: "define",
    stem: "Electric charge is measured in coulombs in direct-current circuit analysis.",
    splitTwoParts: false,
    partAPrompt: "Define the coulomb. [2]",
    answerAPrefix: "The coulomb is the ",
  },
  {
    slug: "def-volt-2m",
    conceptKey: "def-volt",
    difficulty: "foundation",
    promptMode: "define",
    stem: "A laboratory power supply maintains a steady potential difference across a resistor.",
    splitTwoParts: false,
    partAPrompt: "Define the volt. [2]",
    answerAPrefix: "The volt is the ",
  },
  {
    slug: "def-emf-vs-pd-2m",
    conceptKey: "def-emf-vs-pd",
    difficulty: "standard",
    promptMode: "define",
    stem: "Both electromotive force and potential difference are expressed in volts, yet they describe opposite energy transfers.",
    splitTwoParts: true,
    partAPrompt: "Define electromotive force (emf). [1]",
    partBPrompt: "Define potential difference (pd) across a circuit component. [1]",
  },
  {
    slug: "def-ohm-2m",
    conceptKey: "def-ohm",
    difficulty: "foundation",
    promptMode: "define",
    stem: "Electrical components impede charge flow to varying degrees characterized in ohms.",
    splitTwoParts: false,
    partAPrompt: "Define the ohm. [2]",
    answerAPrefix: "The ohm is the ",
  },
  {
    slug: "def-resistance-2m",
    conceptKey: "def-resistance",
    difficulty: "foundation",
    promptMode: "define",
    stem: "A student analyses experimental readings obtained from a non-ohmic filament bulb.",
    splitTwoParts: true,
    partAPrompt: "Define the electrical resistance of a component. [1]",
    partBPrompt:
      "State how static resistance at a point is obtained from a curved current–voltage graph. [1]",
  },
  {
    slug: "def-resistivity-2m",
    conceptKey: "def-resistivity",
    difficulty: "standard",
    promptMode: "define",
    stem: "Heating alloys such as nichrome are selected for their high electrical resistivity.",
    splitTwoParts: true,
    partAPrompt: "Define electrical resistivity. [1]",
    partBPrompt:
      "State whether resistivity depends on wire length or cross-sectional area at constant temperature. [1]",
  },
  {
    slug: "def-watt-2m",
    conceptKey: "def-watt",
    difficulty: "foundation",
    promptMode: "define",
    stem: "Electrical and mechanical appliances carry power ratings specified in watts.",
    splitTwoParts: false,
    partAPrompt: "Define the watt. [2]",
    answerAPrefix: "The watt is a ",
  },
  {
    slug: "def-newton-joule-2m",
    conceptKey: "def-newton-and-joule",
    difficulty: "foundation",
    promptMode: "define",
    stem: "Foundational mechanics definitions connect force, mass, acceleration, and mechanical work.",
    splitTwoParts: true,
    partAPrompt: "Define the newton. [1]",
    partBPrompt: "Define the joule in mechanical terms. [1]",
  },
  {
    slug: "def-farad-2m",
    conceptKey: "def-farad",
    difficulty: "foundation",
    promptMode: "define",
    stem: "Capacitors store separated electric charge on conducting plates across a dielectric.",
    splitTwoParts: false,
    partAPrompt: "Define the farad. [2]",
    answerAPrefix: "The farad is the ",
  },
  {
    slug: "def-kirchhoff-first-2m",
    conceptKey: "def-kirchhoff-first",
    difficulty: "foundation",
    promptMode: "define",
    stem: "Three branches meet at a soldered node in a direct-current circuit.",
    splitTwoParts: true,
    partAPrompt: "State Kirchhoff's first law. [1]",
    partBPrompt: "State the fundamental conservation law that it represents. [1]",
  },
  {
    slug: "def-kirchhoff-second-2m",
    conceptKey: "def-kirchhoff-second",
    difficulty: "foundation",
    promptMode: "define",
    stem: "A closed loop contains two cells and three resistors in series.",
    splitTwoParts: true,
    partAPrompt: "State Kirchhoff's second law. [1]",
    partBPrompt: "State the fundamental conservation law that it represents. [1]",
  },
  {
    slug: "def-moment-2m",
    conceptKey: "def-moment",
    difficulty: "foundation",
    promptMode: "define",
    stem: "A spanner applies a turning effect about the centre of a hexagonal bolt.",
    splitTwoParts: false,
    partAPrompt: "Define the moment of a force about a pivot. [2]",
    answerAPrefix: "The moment of a force is the ",
  },
  {
    slug: "def-principle-moments-2m",
    conceptKey: "def-principle-of-moments",
    difficulty: "foundation",
    promptMode: "define",
    stem: "A horizontal lever balanced on a knife-edge remains stationary in static equilibrium.",
    splitTwoParts: true,
    partAPrompt: "State the principle of moments. [1]",
    partBPrompt: "State the second condition required for complete rigid-body equilibrium. [1]",
  },
  {
    slug: "def-cg-2m",
    conceptKey: "def-centre-of-gravity",
    difficulty: "foundation",
    promptMode: "define",
    stem: "Engineers locate the centre of gravity of a crane jib before lifting heavy loads.",
    splitTwoParts: false,
    partAPrompt: "Define the centre of gravity of a body. [2]",
    answerAPrefix: "The centre of gravity is the ",
  },
  {
    slug: "def-scalar-vector-2m",
    conceptKey: "def-scalar-vs-vector",
    difficulty: "foundation",
    promptMode: "define",
    stem: "Physical measurements in mechanics are grouped into scalar and vector quantities.",
    splitTwoParts: true,
    partAPrompt: "Define a scalar quantity and give two examples. [1]",
    partBPrompt: "Define a vector quantity and give two examples. [1]",
  },
  {
    slug: "def-momentum-conservation-2m",
    conceptKey: "def-momentum-conservation",
    difficulty: "standard",
    promptMode: "define",
    stem: "Two ice skaters push apart on a smooth horizontal rink.",
    splitTwoParts: true,
    partAPrompt: "State the principle of conservation of linear momentum. [1]",
    partBPrompt: "State the essential condition required for this principle to hold. [1]",
  },
  {
    slug: "def-tensile-stress-2m",
    conceptKey: "def-tensile-stress",
    difficulty: "foundation",
    promptMode: "define",
    stem: "A vertical steel suspension cable supports an elevator cabin.",
    splitTwoParts: false,
    partAPrompt: "Define tensile stress with full precision. [2]",
    answerAPrefix: "Tensile stress is the ",
  },
  {
    slug: "def-young-modulus-2m",
    conceptKey: "def-young-modulus",
    difficulty: "standard",
    promptMode: "define",
    stem: "Structural engineers compare stiffness of metals using Young's modulus.",
    splitTwoParts: true,
    partAPrompt: "Define Young's modulus of a material. [1]",
    partBPrompt: "State the deformation region in which this definition applies. [1]",
  },
  {
    slug: "def-elastic-limit-2m",
    conceptKey: "def-elastic-limit",
    difficulty: "standard",
    promptMode: "define",
    stem: "A ductile brass wire is loaded progressively until its unloading curve no longer returns to the origin.",
    splitTwoParts: true,
    partAPrompt: "Define the elastic limit of a material. [1]",
    partBPrompt: "State what happens to the wire when unloaded after exceeding the elastic limit. [1]",
  },
  {
    slug: "def-shc-2m",
    conceptKey: "def-specific-heat-capacity",
    difficulty: "foundation",
    promptMode: "define",
    stem: "Liquid coolants with large specific heat capacity absorb substantial thermal energy for modest warming.",
    splitTwoParts: false,
    partAPrompt: "Define specific heat capacity. [2]",
    answerAPrefix: "Specific heat capacity is the ",
  },
  {
    slug: "def-latent-heat-2m",
    conceptKey: "def-specific-latent-heat",
    difficulty: "foundation",
    promptMode: "define",
    stem: "Phase-change materials store thermal energy during solid–liquid transitions.",
    splitTwoParts: false,
    partAPrompt: "Define specific latent heat. [2]",
    answerAPrefix: "Specific latent heat is the ",
  },
  {
    slug: "def-internal-energy-2m",
    conceptKey: "def-internal-energy",
    difficulty: "standard",
    promptMode: "define",
    stem: "Heating a sealed fluid changes the microscopic energies of its constituent particles.",
    splitTwoParts: true,
    partAPrompt: "State the first microscopic energy component included in internal energy. [1]",
    partBPrompt: "State the second microscopic energy component included in internal energy. [1]",
  },
  {
    slug: "def-boyle-law-2m",
    conceptKey: "def-boyle-law",
    difficulty: "foundation",
    promptMode: "define",
    stem: "A sealed glass tube traps dry air above an oil column during a pressure–volume investigation.",
    splitTwoParts: true,
    partAPrompt: "State the proportionality between pressure and volume in Boyle's law. [1]",
    partBPrompt: "State the two variables that must be kept constant for Boyle's law to apply. [1]",
  },
  {
    slug: "def-pressure-law-2m",
    conceptKey: "def-pressure-law",
    difficulty: "standard",
    promptMode: "define",
    stem: "A rigid glass bulb connected to a Bourdon gauge is immersed in a water bath.",
    splitTwoParts: true,
    partAPrompt: "State the relationship between pressure and temperature in the Pressure Law. [1]",
    partBPrompt: "State the physical quantities that must remain fixed in this law. [1]",
  },
  {
    slug: "def-charles-law-2m",
    conceptKey: "def-charles-law",
    difficulty: "standard",
    promptMode: "define",
    stem: "A capillary tube containing dry air trapped behind a movable bead of oil is warmed in a beaker.",
    splitTwoParts: true,
    partAPrompt: "State Charles's law relating gas volume and temperature. [1]",
    partBPrompt: "State the two controlled variables required for Charles's law to hold. [1]",
  },
  {
    slug: "def-shm-2m",
    conceptKey: "def-shm",
    difficulty: "standard",
    promptMode: "define",
    stem: "A mass suspended from a helical spring oscillates vertically in simple harmonic motion.",
    splitTwoParts: true,
    partAPrompt: "State how acceleration depends on displacement in simple harmonic motion. [1]",
    partBPrompt: "State the direction of acceleration throughout the oscillation. [1]",
  },
  {
    slug: "def-lenz-law-2m",
    conceptKey: "def-lenz-law",
    difficulty: "standard",
    promptMode: "define",
    stem: "A bar magnet is pushed steadily into a solenoid connected to a sensitive galvanometer.",
    splitTwoParts: true,
    partAPrompt: "State Lenz's law. [1]",
    partBPrompt: "Explain briefly how Lenz's law follows from conservation of energy. [1]",
  },
  // --- 15 Crisp 2m Explanations, Ideal Meters & "Without calculation" ---
  {
    slug: "explain-ideal-voltmeter-2m",
    conceptKey: "ideal-voltmeter-connection",
    difficulty: "foundation",
    promptMode: "state-and-explain",
    stem: "A student connects a voltmeter to measure the potential difference across a resistor in a DC network.",
    splitTwoParts: true,
    partAPrompt: "State how the voltmeter must be connected relative to the resistor. [1]",
    partBPrompt: "Explain why an ideal voltmeter must have infinite resistance. [1]",
  },
  {
    slug: "explain-ideal-ammeter-2m",
    conceptKey: "ideal-ammeter-connection",
    difficulty: "foundation",
    promptMode: "state-and-explain",
    stem: "An ammeter is inserted into a laboratory lighting circuit to measure branch current.",
    splitTwoParts: true,
    partAPrompt: "State how the ammeter must be connected in the branch. [1]",
    partBPrompt: "Explain why an ideal ammeter must have zero resistance. [1]",
  },
  {
    slug: "explain-volt-units-2m",
    conceptKey: "volt-unit-equivalence",
    difficulty: "standard",
    promptMode: "explain",
    stem: "Derived electrical units can be expressed in multiple equivalent SI forms.",
    splitTwoParts: true,
    partAPrompt: "Express the volt in terms of energy and charge units. [1]",
    partBPrompt: "Explain how this leads to an equivalent unit involving joule, ampere, and second. [1]",
  },
  {
    slug: "explain-phase-plateau-2m",
    conceptKey: "causal-phase-change-plateau",
    difficulty: "standard",
    promptMode: "explain",
    stem: "A pure solid organic compound is heated steadily across its melting plateau.",
    splitTwoParts: true,
    partAPrompt: "State what happens to mean molecular kinetic energy during melting. [1]",
    partBPrompt: "Explain what happens to intermolecular potential energy during melting. [1]",
  },
  {
    slug: "explain-filament-lamp-2m",
    conceptKey: "causal-filament-lamp-non-ohmic",
    difficulty: "standard",
    promptMode: "explain",
    stem: "Increasing the potential difference across a filament bulb increases its electrical resistance.",
    splitTwoParts: true,
    partAPrompt: "State what happens to the filament temperature as current increases. [1]",
    partBPrompt: "Explain in terms of lattice ions and electrons why resistance rises. [1]",
  },
  {
    slug: "explain-brownian-2m",
    conceptKey: "causal-brownian-motion",
    difficulty: "foundation",
    promptMode: "explain",
    stem: "Smoke particles suspended in air are illuminated inside a viewing cell under a microscope.",
    splitTwoParts: true,
    partAPrompt: "Describe the motion of the illuminated smoke specks observed through the eyepiece. [1]",
    partBPrompt: "Explain what causes this observed motion at the molecular scale. [1]",
  },
  {
    slug: "explain-isothermal-wall-2m",
    conceptKey: "causal-isothermal-thin-wall",
    difficulty: "standard",
    promptMode: "explain",
    stem: "An ideal gas sample is compressed inside a thin-walled copper cylinder during an isothermal test.",
    splitTwoParts: true,
    partAPrompt: "State how rapidly the piston should be moved during the compression. [1]",
    partBPrompt: "Explain why a thin conducting wall helps keep the gas temperature constant. [1]",
  },
  {
    slug: "explain-elastic-inelastic-2m",
    conceptKey: "causal-elastic-vs-inelastic-collision",
    difficulty: "foundation",
    promptMode: "explain",
    stem: "Two pucks collide on a frictionless air table in an isolated laboratory demonstration.",
    splitTwoParts: true,
    partAPrompt: "State what happens to total linear momentum in both elastic and inelastic impacts. [1]",
    partBPrompt: "State the kinetic energy criterion that distinguishes an elastic impact from an inelastic one. [1]",
  },
  {
    slug: "explain-circular-zero-work-2m",
    conceptKey: "causal-circular-motion-acceleration",
    difficulty: "standard",
    promptMode: "explain",
    stem: "A satellite follows a circular orbit at constant speed under a central centripetal force.",
    splitTwoParts: true,
    partAPrompt: "Explain why the satellite is accelerating even though its speed is constant. [1]",
    partBPrompt: "Explain why the centripetal force does zero work on the satellite. [1]",
  },
  {
    slug: "without-calc-thermistor-2m",
    conceptKey: "causal-ntc-thermistor-divider",
    difficulty: "standard",
    promptMode: "without-calculation",
    stem: "An NTC thermistor is connected in series with a fixed resistor across a constant battery.",
    splitTwoParts: true,
    partAPrompt:
      "Without calculation, state how heating the thermistor affects its resistance. [1]",
    partBPrompt:
      "Without calculation, explain how the potential difference across the fixed resistor changes. [1]",
  },
  {
    slug: "without-calc-ldr-2m",
    conceptKey: "causal-ldr-brightness-divider",
    difficulty: "standard",
    promptMode: "without-calculation",
    stem: "A light-dependent resistor and a fixed resistor form a potential divider in an automatic lamp sensor.",
    splitTwoParts: true,
    partAPrompt:
      "Without calculation, state how bright sunlight affects the resistance of the light-dependent resistor. [1]",
    partBPrompt:
      "Without calculation, explain how the potential difference across the light-dependent resistor changes. [1]",
  },
  {
    slug: "without-calc-rc-2m",
    conceptKey: "causal-rc-without-calculation-change",
    difficulty: "higher",
    promptMode: "without-calculation",
    stem: "A charged capacitor discharges through a resistor. The resistor is then replaced by one of smaller resistance from the same initial voltage.",
    splitTwoParts: true,
    partAPrompt:
      "Without calculation, state how the circuit time constant changes. [1]",
    partBPrompt:
      "Without calculation, explain how the remaining capacitor voltage at a fixed later instant compares. [1]",
  },
  {
    slug: "without-calc-internal-r-2m",
    conceptKey: "causal-internal-resistance-terminal-pd",
    difficulty: "standard",
    promptMode: "without-calculation",
    stem: "A cell with appreciable internal resistance powers an adjustable external load resistor.",
    splitTwoParts: true,
    partAPrompt:
      "Without calculation, state how lowering external load resistance affects the current drawn from the cell. [1]",
    partBPrompt:
      "Without calculation, explain how the terminal potential difference across the cell changes. [1]",
  },
  {
    slug: "explain-ohmic-precaution-2m",
    conceptKey: "causal-ohmic-heating-precaution",
    difficulty: "foundation",
    promptMode: "explain",
    stem: "A student measures current and potential difference for a uniform resistance wire to verify Ohm's law.",
    splitTwoParts: true,
    partAPrompt: "State the physical condition required for Ohm's law to remain valid. [1]",
    partBPrompt:
      "State one practical precaution to prevent heating of the wire during measurements. [1]",
  },
  {
    slug: "explain-electron-drift-2m",
    conceptKey: "electron-drift-vs-conventional-current",
    difficulty: "foundation",
    promptMode: "explain",
    stem: "A metallic wire connects the positive and negative terminals of a dry cell.",
    splitTwoParts: true,
    partAPrompt:
      "State the direction of free electron drift relative to conventional current. [1]",
    partBPrompt:
      "State which battery terminal conduction electrons drift toward through the external wire. [1]",
  },
];

interface Short4mBlueprint {
  readonly slug: string;
  readonly conceptKey: string;
  readonly difficulty: QuestionDifficulty;
  readonly promptMode:
    | "define"
    | "explain"
    | "state-and-explain"
    | "sketch-describe"
    | "without-calculation";
  readonly stem: string;
  readonly partAPrompt: string;
  readonly partAMarks: number;
  readonly partAKey:
    | "primaryClassification"
    | "requiredMarkPointA"
    | "requiredMarkPointB"
    | "requiredMarkPointC"
    | "reasoningAnchor";
  readonly partBPrompt: string;
  readonly partBMarks: number;
  readonly partBKey:
    | "primaryClassification"
    | "requiredMarkPointA"
    | "requiredMarkPointB"
    | "requiredMarkPointC"
    | "reasoningAnchor";
  readonly partCPrompt?: string;
  readonly partCMarks?: number;
  readonly partCKey?: "requiredMarkPointC" | "reasoningAnchor";
}

const SHORT_4M_BLUEPRINTS: readonly Short4mBlueprint[] = [
  // 38 authentic IFYPH005 Section 3 [4m] qualitative / sketch-describe / explain / without-calculation items!
  {
    slug: "kinetic-gas-pressure-4m",
    conceptKey: "causal-kinetic-gas-pressure",
    difficulty: "higher",
    promptMode: "explain",
    stem: "A fixed mass of ideal gas is sealed inside a rigid stainless-steel container and warmed steadily in an oven.",
    partAPrompt:
      "State how raising temperature alters the mean kinetic energy and average speed of the gas molecules. [1]",
    partAMarks: 1,
    partAKey: "requiredMarkPointA",
    partBPrompt:
      "Without citing the ideal gas equation, explain using molecular collisions and Newton's second law why the pressure on the container walls increases. [3]",
    partBMarks: 3,
    partBKey: "primaryClassification",
  },
  {
    slug: "terminal-velocity-sketch-4m",
    conceptKey: "causal-terminal-velocity",
    difficulty: "standard",
    promptMode: "sketch-describe",
    stem: "A dense sphere is released from rest at the top of a deep tank filled with viscous oil.",
    partAPrompt:
      "Describe the initial force balance immediately after release and the initial slope of a velocity–time sketch graph. [1]",
    partAMarks: 1,
    partAKey: "requiredMarkPointA",
    partBPrompt:
      "Explain in terms of changing drag force and resultant force how the sphere reaches a constant terminal velocity and how the sketch graph flattens. [3]",
    partBMarks: 3,
    partBKey: "primaryClassification",
  },
  {
    slug: "filament-lamp-sketch-4m",
    conceptKey: "causal-filament-lamp-non-ohmic",
    difficulty: "standard",
    promptMode: "sketch-describe",
    stem: "A student investigates the current against potential difference characteristic of a tungsten filament lamp from zero voltage up to normal operating brightness.",
    partAPrompt:
      "Describe the shape of the current against potential difference sketch graph and explain how resistance changes along the curve. [2]",
    partAMarks: 2,
    partAKey: "requiredMarkPointC",
    partBPrompt:
      "Explain microscopically in terms of metal lattice ions and conduction electrons why the filament behaves non-ohmically. [2]",
    partBMarks: 2,
    partBKey: "primaryClassification",
  },
  {
    slug: "diode-led-sketch-4m",
    conceptKey: "causal-diode-led-characteristic",
    difficulty: "standard",
    promptMode: "sketch-describe",
    stem: "A semiconductor light-emitting diode is tested across both forward and reverse bias using a variable DC source.",
    partAPrompt:
      "Describe the key regions of the current against potential difference sketch graph in reverse bias and in forward bias. [2]",
    partAMarks: 2,
    partAKey: "requiredMarkPointA",
    partBPrompt:
      "Explain what happens above the forward threshold potential difference and why a protective series resistor is required. [2]",
    partBMarks: 2,
    partBKey: "requiredMarkPointC",
  },
  {
    slug: "phase-change-plateau-4m",
    conceptKey: "causal-phase-change-plateau",
    difficulty: "standard",
    promptMode: "explain",
    stem: "A pure solid alloy is supplied with thermal energy at a steady rate until it melts completely into a liquid.",
    partAPrompt:
      "Describe what happens to temperature and mean random molecular kinetic energy during the horizontal melting plateau. [2]",
    partAMarks: 2,
    partAKey: "requiredMarkPointA",
    partBPrompt:
      "Explain what happens to intermolecular potential energy and total internal energy while melting takes place. [2]",
    partBMarks: 2,
    partBKey: "requiredMarkPointB",
  },
  {
    slug: "brownian-experiment-4m",
    conceptKey: "causal-brownian-motion",
    difficulty: "foundation",
    promptMode: "explain",
    stem: "In a smoke-cell demonstration, a horizontal beam illuminates airborne smoke particles viewed from above through a microscope.",
    partAPrompt:
      "Describe clearly what is seen through the microscope eyepiece. [2]",
    partAMarks: 2,
    partAKey: "requiredMarkPointA",
    partBPrompt:
      "Explain how collisions with surrounding air molecules account for this observation and what evidence it gives for the particle model. [2]",
    partBMarks: 2,
    partBKey: "requiredMarkPointB",
  },
  {
    slug: "thermistor-divider-4m",
    conceptKey: "causal-ntc-thermistor-divider",
    difficulty: "standard",
    promptMode: "without-calculation",
    stem: "A negative temperature coefficient thermistor and a fixed resistor are connected in series across a battery of negligible internal resistance.",
    partAPrompt:
      "Without calculation, state and explain how warming the thermistor affects its resistance and the circuit current. [2]",
    partAMarks: 2,
    partAKey: "requiredMarkPointA",
    partBPrompt:
      "Without calculation, state and explain how warming the thermistor changes the potential difference across the fixed resistor and across the thermistor. [2]",
    partBMarks: 2,
    partBKey: "requiredMarkPointC",
  },
  {
    slug: "ldr-divider-4m",
    conceptKey: "causal-ldr-brightness-divider",
    difficulty: "standard",
    promptMode: "without-calculation",
    stem: "A light-dependent resistor is placed in series with a fixed resistor across a stabilised DC supply to sense daylight.",
    partAPrompt:
      "Without calculation, state and explain how increasing incident light intensity changes sensor resistance and total circuit current. [2]",
    partAMarks: 2,
    partAKey: "requiredMarkPointA",
    partBPrompt:
      "Without calculation, explain how the output potential difference across the light-dependent resistor and across the fixed resistor respond. [2]",
    partBMarks: 2,
    partBKey: "requiredMarkPointC",
  },
  {
    slug: "rc-discharge-without-calc-4m",
    conceptKey: "causal-rc-without-calculation-change",
    difficulty: "higher",
    promptMode: "without-calculation",
    stem: "A fully charged capacitor is discharged through a resistor and its voltage–time decay curve is recorded. The discharge is repeated from the same initial potential difference using a smaller resistance.",
    partAPrompt:
      "Without calculation, state and explain how replacing the resistor with a smaller resistance changes the time constant and initial current. [2]",
    partAMarks: 2,
    partAKey: "requiredMarkPointA",
    partBPrompt:
      "Without calculation, describe how the new voltage–time sketch curve differs and explain how the remaining potential difference compares after a fixed elapsed time. [2]",
    partBMarks: 2,
    partBKey: "requiredMarkPointC",
  },
  {
    slug: "internal-r-terminal-pd-4m",
    conceptKey: "causal-internal-resistance-terminal-pd",
    difficulty: "standard",
    promptMode: "without-calculation",
    stem: "A laboratory battery with internal resistance supplies a variable resistor while a high-resistance voltmeter monitors the battery terminals.",
    partAPrompt:
      "Without calculation, state and explain how reducing the external variable resistance affects the circuit current and internal lost volts. [2]",
    partAMarks: 2,
    partAKey: "requiredMarkPointA",
    partBPrompt:
      "Without calculation, explain why the terminal potential difference falls while the electromotive force stays constant. [2]",
    partBMarks: 2,
    partBKey: "requiredMarkPointC",
  },
  {
    slug: "emf-vs-pd-lost-volts-4m",
    conceptKey: "def-emf-vs-pd",
    difficulty: "standard",
    promptMode: "state-and-explain",
    stem: "When an open-circuit battery is connected to a headlamp bulb, the voltmeter reading across its terminals drops noticeably.",
    partAPrompt:
      "Distinguish clearly between electromotive force and potential difference in terms of energy conversion. [2]",
    partAMarks: 2,
    partAKey: "primaryClassification",
    partBPrompt:
      "Explain why the terminal potential difference across a real cell drops below its electromotive force when current flows. [2]",
    partBMarks: 2,
    partBKey: "requiredMarkPointC",
  },
  {
    slug: "ideal-voltmeter-ammeter-4m",
    conceptKey: "ideal-voltmeter-connection",
    difficulty: "foundation",
    promptMode: "state-and-explain",
    stem: "An accurate potential-divider experiment depends on choosing meters whose resistance does not disturb the circuit.",
    partAPrompt:
      "State how an ideal voltmeter is connected and what resistance it requires. [2]",
    partAMarks: 2,
    partAKey: "primaryClassification",
    partBPrompt:
      "Explain why this resistance ensures the measured potential difference and branch current stay accurate. [2]",
    partBMarks: 2,
    partBKey: "requiredMarkPointB",
  },
  {
    slug: "ideal-ammeter-disturbance-4m",
    conceptKey: "ideal-ammeter-connection",
    difficulty: "foundation",
    promptMode: "state-and-explain",
    stem: "A student inserts an ammeter into a series resistor circuit to measure current.",
    partAPrompt:
      "State how an ideal ammeter must be wired and state its ideal internal resistance. [2]",
    partAMarks: 2,
    partAKey: "primaryClassification",
    partBPrompt:
      "Explain why a non-zero ammeter resistance would disturb the circuit and how ideal zero resistance prevents this. [2]",
    partBMarks: 2,
    partBKey: "requiredMarkPointB",
  },
  {
    slug: "iv-gradient-vs-ratio-4m",
    conceptKey: "causal-iv-curve-gradient-trap",
    difficulty: "higher",
    promptMode: "explain",
    stem: "In NCUK practical assessments, current is plotted on the vertical axis against potential difference on the horizontal axis.",
    partAPrompt:
      "Explain how resistance is determined from a straight ohmic line on this graph and what a steeper slope indicates. [2]",
    partAMarks: 2,
    partAKey: "requiredMarkPointA",
    partBPrompt:
      "Explain how static resistance at a chosen point is found on a curved non-ohmic graph and why the tangent slope must not be inverted. [2]",
    partBMarks: 2,
    partBKey: "requiredMarkPointC",
  },
  {
    slug: "ohmic-wire-precaution-4m",
    conceptKey: "causal-ohmic-heating-precaution",
    difficulty: "foundation",
    promptMode: "state-and-explain",
    stem: "A constantan wire is tested in the laboratory to confirm that it behaves as an ohmic conductor.",
    partAPrompt:
      "State the physical condition required for Ohm's law to hold and describe the expected current–voltage graph shape. [2]",
    partAMarks: 2,
    partAKey: "requiredMarkPointA",
    partBPrompt:
      "State and explain two practical precautions that prevent self-heating from invalidating the ohmic test. [2]",
    partBMarks: 2,
    partBKey: "requiredMarkPointB",
  },
  {
    slug: "random-systematic-errors-4m",
    conceptKey: "causal-random-vs-systematic-error",
    difficulty: "standard",
    promptMode: "state-and-explain",
    stem: "A student takes repeated measurements of wire diameter using a micrometer whose zero mark does not align cleanly when closed.",
    partAPrompt:
      "Distinguish between random errors and systematic errors in experimental measurements. [2]",
    partAMarks: 2,
    partAKey: "primaryClassification",
    partBPrompt:
      "Explain what taking repeated readings and averaging achieves and why it cannot remove the micrometer zero error. [2]",
    partBMarks: 2,
    partBKey: "requiredMarkPointC",
  },
  {
    slug: "circular-motion-explain-4m",
    conceptKey: "causal-circular-motion-acceleration",
    difficulty: "standard",
    promptMode: "explain",
    stem: "A racing car travels around a flat circular track at constant speed.",
    partAPrompt:
      "Explain why the car has a non-zero acceleration despite moving at constant speed and state the direction of the resultant force. [2]",
    partAMarks: 2,
    partAKey: "requiredMarkPointA",
    partBPrompt:
      "Explain why the resultant centripetal force does zero mechanical work and leaves kinetic energy unchanged. [2]",
    partBMarks: 2,
    partBKey: "requiredMarkPointC",
  },
  {
    slug: "collision-elasticity-4m",
    conceptKey: "causal-elastic-vs-inelastic-collision",
    difficulty: "standard",
    promptMode: "state-and-explain",
    stem: "Two railway trucks collide on a level frictionless siding.",
    partAPrompt:
      "Compare the conservation of linear momentum and kinetic energy in elastic versus inelastic collisions. [2]",
    partAMarks: 2,
    partAKey: "primaryClassification",
    partBPrompt:
      "Explain what happens to the missing kinetic energy in an inelastic collision. [2]",
    partBMarks: 2,
    partBKey: "requiredMarkPointC",
  },
  {
    slug: "isothermal-compression-4m",
    conceptKey: "causal-isothermal-thin-wall",
    difficulty: "standard",
    promptMode: "explain",
    stem: "Dry nitrogen gas inside a metal cylinder is compressed to verify Boyle's law.",
    partAPrompt:
      "State the two practical apparatus and procedure requirements needed to keep the compression isothermal. [2]",
    partAMarks: 2,
    partAKey: "primaryClassification",
    partBPrompt:
      "Explain in terms of heat transfer and mean molecular kinetic energy why these precautions preserve Boyle's law. [2]",
    partBMarks: 2,
    partBKey: "requiredMarkPointC",
  },
  {
    slug: "kirchhoff-first-explain-4m",
    conceptKey: "def-kirchhoff-first",
    difficulty: "foundation",
    promptMode: "state-and-explain",
    stem: "A lighting junction splits a main supply cable into two parallel lamp branches.",
    partAPrompt:
      "State Kirchhoff's first law accurately for currents meeting at a circuit junction. [2]",
    partAMarks: 2,
    partAKey: "requiredMarkPointA",
    partBPrompt:
      "Explain how Kirchhoff's first law arises directly from conservation of electric charge. [2]",
    partBMarks: 2,
    partBKey: "requiredMarkPointB",
  },
  {
    slug: "kirchhoff-second-explain-4m",
    conceptKey: "def-kirchhoff-second",
    difficulty: "foundation",
    promptMode: "state-and-explain",
    stem: "A multi-cell DC circuit loop includes two batteries wired with opposing polarities.",
    partAPrompt:
      "State Kirchhoff's second law and identify the conservation principle behind it. [2]",
    partAMarks: 2,
    partAKey: "primaryClassification",
    partBPrompt:
      "Explain how opposing cells are treated when summing electromotive forces around the closed loop. [2]",
    partBMarks: 2,
    partBKey: "requiredMarkPointC",
  },
  {
    slug: "moment-equilibrium-4m",
    conceptKey: "def-principle-of-moments",
    difficulty: "standard",
    promptMode: "state-and-explain",
    stem: "A horizontal footbridge beam rests on two masonry piers and carries a stationary pedestrian.",
    partAPrompt:
      "State the principle of moments for a rigid body in rotational equilibrium. [2]",
    partAMarks: 2,
    partAKey: "primaryClassification",
    partBPrompt:
      "State the second condition for static equilibrium and explain why choosing a support as pivot simplifies reaction calculations. [2]",
    partBMarks: 2,
    partBKey: "requiredMarkPointC",
  },
  {
    slug: "moment-perpendicular-4m",
    conceptKey: "def-moment",
    difficulty: "standard",
    promptMode: "define",
    stem: "A heavy hinged trapdoor is held horizontal by an angled cable attached to its outer edge.",
    partAPrompt:
      "Define the moment of a force, stressing the geometric requirement on the distance used. [2]",
    partAMarks: 2,
    partAKey: "primaryClassification",
    partBPrompt:
      "Explain why the unit of moment is written as newton metre rather than joule. [2]",
    partBMarks: 2,
    partBKey: "requiredMarkPointC",
  },
  {
    slug: "young-modulus-sketch-4m",
    conceptKey: "def-young-modulus",
    difficulty: "standard",
    promptMode: "sketch-describe",
    stem: "A tensile load test is carried out on a uniform steel wire up to its limit of proportionality.",
    partAPrompt:
      "Define Young's modulus and state the region in which the definition applies. [2]",
    partAMarks: 2,
    partAKey: "primaryClassification",
    partBPrompt:
      "Describe the stress against strain sketch graph in this region and state how Young's modulus is obtained from it. [2]",
    partBMarks: 2,
    partBKey: "requiredMarkPointC",
  },
  {
    slug: "elastic-limit-sketch-4m",
    conceptKey: "def-elastic-limit",
    difficulty: "standard",
    promptMode: "sketch-describe",
    stem: "A ductile metal specimen is stretched beyond its elastic limit and then unloaded slowly to zero load.",
    partAPrompt:
      "Define the elastic limit and distinguish it from the limit of proportionality. [2]",
    partAMarks: 2,
    partAKey: "requiredMarkPointA",
    partBPrompt:
      "Describe the permanent effect observed after unloading beyond the elastic limit. [2]",
    partBMarks: 2,
    partBKey: "requiredMarkPointB",
  },
  {
    slug: "tensile-stress-units-4m",
    conceptKey: "def-tensile-stress",
    difficulty: "foundation",
    promptMode: "define",
    stem: "A vertical titanium rod experiences a uniform stretching load in a materials laboratory.",
    partAPrompt:
      "Define tensile stress with complete NCUK mark-scheme precision. [2]",
    partAMarks: 2,
    partAKey: "primaryClassification",
    partBPrompt:
      "Explain why specifying cross-sectional area is essential and state the SI unit of tensile stress. [2]",
    partBMarks: 2,
    partBKey: "requiredMarkPointB",
  },
  {
    slug: "boyle-law-graph-4m",
    conceptKey: "def-boyle-law",
    difficulty: "standard",
    promptMode: "sketch-describe",
    stem: "A trapped sample of dry air obeys Boyle's law during a slow laboratory compression.",
    partAPrompt:
      "State Boyle's law together with all required controlled variables. [2]",
    partAMarks: 2,
    partAKey: "primaryClassification",
    partBPrompt:
      "Describe the graph plotted to obtain a linear verification of Boyle's law and state its key visual feature. [2]",
    partBMarks: 2,
    partBKey: "requiredMarkPointC",
  },
  {
    slug: "pressure-law-kelvin-4m",
    conceptKey: "def-pressure-law",
    difficulty: "standard",
    promptMode: "state-and-explain",
    stem: "A fixed mass of dry air in a rigid glass flask is warmed while pressure and temperature are recorded.",
    partAPrompt:
      "State the Pressure Law including both required controlled variables. [2]",
    partAMarks: 2,
    partAKey: "primaryClassification",
    partBPrompt:
      "Explain why gas pressure is linear with Celsius temperature but directly proportional only to thermodynamic temperature in kelvin. [2]",
    partBMarks: 2,
    partBKey: "requiredMarkPointC",
  },
  {
    slug: "charles-law-absolute-zero-4m",
    conceptKey: "def-charles-law",
    difficulty: "standard",
    promptMode: "sketch-describe",
    stem: "An isobaric gas-expansion apparatus records the volume of trapped air over a range of water-bath temperatures.",
    partAPrompt:
      "State Charles's law clearly with both controlled variables. [2]",
    partAMarks: 2,
    partAKey: "primaryClassification",
    partBPrompt:
      "Describe how a volume against Celsius temperature graph is extrapolated to determine absolute zero. [2]",
    partBMarks: 2,
    partBKey: "requiredMarkPointC",
  },
  {
    slug: "latent-heat-vap-fusion-4m",
    conceptKey: "def-specific-latent-heat",
    difficulty: "standard",
    promptMode: "state-and-explain",
    stem: "Ice melts at zero Celsius and water boils at one hundred Celsius under standard atmospheric pressure.",
    partAPrompt: "Define specific latent heat. [2]",
    partAMarks: 2,
    partAKey: "primaryClassification",
    partBPrompt:
      "Explain why specific latent heat of vaporisation is much larger than specific latent heat of fusion for the same substance. [2]",
    partBMarks: 2,
    partBKey: "requiredMarkPointC",
  },
  {
    slug: "internal-energy-ideal-gas-4m",
    conceptKey: "def-internal-energy",
    difficulty: "standard",
    promptMode: "state-and-explain",
    stem: "Thermodynamic systems store energy microscopically across molecular kinetic and potential modes.",
    partAPrompt: "Define the internal energy of a system. [2]",
    partAMarks: 2,
    partAKey: "primaryClassification",
    partBPrompt:
      "Explain how this simplifies for an ideal gas and what single macroscopic variable determines its internal energy. [2]",
    partBMarks: 2,
    partBKey: "requiredMarkPointC",
  },
  {
    slug: "volt-units-derivation-4m",
    conceptKey: "volt-unit-equivalence",
    difficulty: "standard",
    promptMode: "explain",
    stem: "Unit consistency checks confirm whether electrical formulae are dimensionally homogeneous.",
    partAPrompt:
      "State two derived SI unit expressions equivalent to the volt and justify them from the definition of potential difference. [2]",
    partAMarks: 2,
    partAKey: "primaryClassification",
    partBPrompt:
      "Explain why newton per coulomb is not equivalent to the volt and identify the physical quantity it represents. [2]",
    partBMarks: 2,
    partBKey: "requiredMarkPointC",
  },
  {
    slug: "ohm-units-derivation-4m",
    conceptKey: "ohm-unit-equivalence",
    difficulty: "higher",
    promptMode: "explain",
    stem: "A student converts the ohm into alternative SI derived and base unit expressions.",
    partAPrompt:
      "State two derived unit forms equivalent to the ohm from resistance and potential difference definitions. [2]",
    partAMarks: 2,
    partAKey: "primaryClassification",
    partBPrompt:
      "State the SI base-unit combination corresponding to the ohm. [2]",
    partBMarks: 2,
    partBKey: "requiredMarkPointC",
  },
  {
    slug: "electron-drift-conduction-4m",
    conceptKey: "electron-drift-vs-conventional-current",
    difficulty: "standard",
    promptMode: "explain",
    stem: "When a bench lamp switch is closed, the lamp lights almost instantaneously even though electrons drift slowly.",
    partAPrompt:
      "State and explain the direction of conduction electron drift relative to conventional current. [2]",
    partAMarks: 2,
    partAKey: "requiredMarkPointA",
    partBPrompt:
      "Contrast the magnitude of mean electron drift velocity with the rapid establishment of the electric field in the wire. [2]",
    partBMarks: 2,
    partBKey: "requiredMarkPointC",
  },
  {
    slug: "resistivity-material-property-4m",
    conceptKey: "def-resistivity",
    difficulty: "standard",
    promptMode: "state-and-explain",
    stem: "Two wires made of the same copper alloy have different lengths and diameters at the same laboratory temperature.",
    partAPrompt:
      "Define electrical resistivity and state its SI unit. [2]",
    partAMarks: 2,
    partAKey: "primaryClassification",
    partBPrompt:
      "Explain why both wires share identical resistivity even though their electrical resistances differ. [2]",
    partBMarks: 2,
    partBKey: "requiredMarkPointB",
  },
  {
    slug: "capacitance-farad-independence-4m",
    conceptKey: "def-farad",
    difficulty: "standard",
    promptMode: "state-and-explain",
    stem: "A parallel-plate air capacitor is charged first to a low voltage and later to a higher voltage.",
    partAPrompt: "Define the farad cleanly. [2]",
    partAMarks: 2,
    partAKey: "primaryClassification",
    partBPrompt:
      "Without calculation, state and explain whether raising the charging voltage alters the capacitance of the capacitor. [2]",
    partBMarks: 2,
    partBKey: "requiredMarkPointC",
  },
  {
    slug: "momentum-vector-isolated-4m",
    conceptKey: "def-momentum-conservation",
    difficulty: "standard",
    promptMode: "state-and-explain",
    stem: "Two spring-loaded dynamics trolleys are released from rest on a horizontal air track.",
    partAPrompt:
      "State the principle of conservation of linear momentum including its essential physical condition. [2]",
    partAMarks: 2,
    partAKey: "primaryClassification",
    partBPrompt:
      "Explain why the vector sign convention is crucial when analysing opposite-direction recoil velocities. [2]",
    partBMarks: 2,
    partBKey: "requiredMarkPointC",
  },
  {
    slug: "scalar-vector-addition-4m",
    conceptKey: "def-scalar-vs-vector",
    difficulty: "foundation",
    promptMode: "state-and-explain",
    stem: "A delivery drone flies north and then turns east against a steady crosswind.",
    partAPrompt:
      "Distinguish between a scalar quantity and a vector quantity. [2]",
    partAMarks: 2,
    partAKey: "primaryClassification",
    partBPrompt:
      "Explain how combining vector quantities differs from combining scalar quantities. [2]",
    partBMarks: 2,
    partBKey: "requiredMarkPointC",
  },
];

function generateBank2ShortStructured(
  baseSeed: number,
  generatorModel: string,
): CandidateQuestionInput[] {
  const ruleMap = new Map(
    NCUK_CONCEPTUAL_RULE_TABLE.map((e) => [e.conceptKey, e]),
  );
  const items: CandidateQuestionInput[] = [];
  let offset = 200;

  // 42 x 2m items
  for (let i = 0; i < SHORT_2M_BLUEPRINTS.length; i += 1) {
    const bp = SHORT_2M_BLUEPRINTS[i];
    const rule = ruleMap.get(bp.conceptKey)!;
    const seed = baseSeed + offset;
    offset += 1;

    const scenarioSpec: Record<string, unknown> = {
      kind: "conceptual-classification",
      topicArea: rule.topicArea,
      conceptKey: rule.conceptKey,
      variantIndex: (i + 10) % 90,
      promptMode: bp.promptMode,
    };
    const solved = solvePlugin("conceptual-classification", scenarioSpec);

    let parts: StructuredQuestionPart[];
    let markScheme: MarkSchemePoint[];
    let hiddenQuantities: string[];
    let workedSolution: string;

    if (!bp.splitTwoParts) {
      const truth = String(solved.primaryClassification);
      const ans = `${bp.answerAPrefix ?? ""}${truth}.`;
      parts = [
        {
          partId: "a",
          prompt: bp.partAPrompt,
          marks: 2,
          targetMode: "qualitative",
          targetQuantityKey: "primaryClassification",
          expectedAnswer: ans,
          workingSteps: [
            `Recall the exact NCUK rubric anchor: ${String(solved.reasoningAnchor)}.`,
            `Include both essential marking elements: ${String(solved.requiredMarkPointA)} and ${String(solved.requiredMarkPointB)}.`,
          ],
        },
      ];
      markScheme = [
        {
          code: "B1",
          partId: "a",
          criterion: `States key physical element: ${String(solved.requiredMarkPointA)}.`,
          marks: 1,
        },
        {
          code: "B1",
          partId: "a",
          criterion: `Completes canonical precision: ${String(solved.requiredMarkPointB)}.`,
          marks: 1,
        },
      ];
      hiddenQuantities = ["primaryClassification"];
      workedSolution = `(a) ${ans} Full mark-scheme anchors: ${String(solved.requiredMarkPointA)}; ${String(solved.requiredMarkPointB)}.`;
    } else {
      const truthA = String(solved.requiredMarkPointA);
      const truthB = String(solved.requiredMarkPointB);
      const ansA = `${bp.answerAPrefix ?? ""}${truthA}.`;
      const ansB = `${bp.answerBPrefix ?? ""}${truthB}.`;
      parts = [
        {
          partId: "a",
          prompt: bp.partAPrompt,
          marks: 1,
          targetMode: "qualitative",
          targetQuantityKey: "requiredMarkPointA",
          expectedAnswer: ansA,
          workingSteps: [
            `Identify the primary physical statement: ${truthA}.`,
          ],
        },
        {
          partId: "b",
          prompt: bp.partBPrompt!,
          marks: 1,
          dependsOnPartIds: ["a"],
          targetMode: "qualitative",
          targetQuantityKey: "requiredMarkPointB",
          expectedAnswer: ansB,
          workingSteps: [
            `Link the physical principle (${String(solved.reasoningAnchor)}) to the required condition or mechanism: ${truthB}.`,
          ],
        },
      ];
      markScheme = [
        {
          code: "B1",
          partId: "a",
          criterion: `Awards credit for stating that ${truthA}.`,
          marks: 1,
        },
        {
          code: "B1",
          partId: "b",
          criterion: `Awards credit for stating or explaining that ${truthB}.`,
          marks: 1,
        },
      ];
      hiddenQuantities = ["requiredMarkPointA", "requiredMarkPointB"];
      workedSolution = `(a) ${ansA} (b) ${ansB}`;
    }

    items.push({
      id: `${NCUK_QUAL_EXAM_ID_PREFIX}-s2m-${String(i + 1).padStart(3, "0")}-${bp.slug}`,
      conceptId: rule.conceptId,
      templateArchetype: rule.templateArchetype,
      seed,
      syllabi: ncukTag(rule.ncukTopicId, rule.ncukSubtopicId, rule.ncukLevel),
      format: "structured",
      difficulty: bp.difficulty,
      domain: "pure-calculation",
      scenarioSpec,
      hiddenQuantities,
      requiredGivens: [],
      targetMode: "qualitative",
      questionPlan: {
        targetSummary: `Assess NCUK short structured definition or qualitative reasoning for ${rule.title}`,
        subpartStrategy: parts.map(
          (p) => `part (${p.partId}): verify ${p.targetQuantityKey}`,
        ),
      },
      stem: bp.stem,
      parts,
      workedSolution,
      markScheme,
      totalMarks: 2,
      generatorModel,
    });
  }

  // 38 x 4m items
  for (let i = 0; i < SHORT_4M_BLUEPRINTS.length; i += 1) {
    const bp = SHORT_4M_BLUEPRINTS[i];
    const rule = ruleMap.get(bp.conceptKey)!;
    const seed = baseSeed + offset;
    offset += 1;

    const scenarioSpec: Record<string, unknown> = {
      kind: "conceptual-classification",
      topicArea: rule.topicArea,
      conceptKey: rule.conceptKey,
      variantIndex: (i + 50) % 95,
      promptMode: bp.promptMode,
    };
    const solved = solvePlugin("conceptual-classification", scenarioSpec);
    const truthA = String(solved[bp.partAKey]);
    const truthB = String(solved[bp.partBKey]);

    const parts: StructuredQuestionPart[] = [
      {
        partId: "a",
        prompt: bp.partAPrompt,
        marks: bp.partAMarks,
        targetMode: "qualitative",
        targetQuantityKey: bp.partAKey,
        expectedAnswer: `${truthA}.`,
        workingSteps: [
          `Establish the core NCUK mark point: ${truthA}.`,
          `Anchor concept: ${String(solved.reasoningAnchor)}.`,
        ],
      },
      {
        partId: "b",
        prompt: bp.partBPrompt,
        marks: bp.partBMarks,
        dependsOnPartIds: ["a"],
        targetMode: "qualitative",
        targetQuantityKey: bp.partBKey,
        expectedAnswer: `${truthB}.`,
        workingSteps: [
          `Develop the causal explanation clearly without algebraic shortcuts: ${truthB}.`,
          `Avoid the common error of ${String(solved.trapMisconception)}.`,
        ],
      },
    ];

    const markScheme: MarkSchemePoint[] = [];
    if (bp.partAMarks === 1) {
      markScheme.push({
        code: "B1",
        partId: "a",
        criterion: `States accurately that ${truthA}.`,
        marks: 1,
      });
    } else {
      markScheme.push(
        {
          code: "B1",
          partId: "a",
          criterion: `Identifies key concept: ${truthA}.`,
          marks: 1,
        },
        {
          code: "B1",
          partId: "a",
          criterion: `Includes exact NCUK precision linked to ${String(solved.reasoningAnchor)}.`,
          marks: 1,
        },
      );
    }

    if (bp.partBMarks === 3) {
      markScheme.push(
        {
          code: "B1",
          partId: "b",
          criterion: `First causal step: ${String(solved.requiredMarkPointA)}.`,
          marks: 1,
        },
        {
          code: "B1",
          partId: "b",
          criterion: `Intermediate physical mechanism: ${String(solved.requiredMarkPointB)}.`,
          marks: 1,
        },
        {
          code: "B1",
          partId: "b",
          criterion: `Final physical conclusion: ${String(solved.requiredMarkPointC)}.`,
          marks: 1,
        },
      );
    } else {
      markScheme.push(
        {
          code: "B1",
          partId: "b",
          criterion: `States primary causal step: ${truthB}.`,
          marks: 1,
        },
        {
          code: "B1",
          partId: "b",
          criterion: `Completes full physical linkage without misconception (${String(solved.requiredMarkPointB)}).`,
          marks: 1,
        },
      );
    }

    const hiddenQuantities = [...new Set([bp.partAKey, bp.partBKey])];
    const workedSolution = `(a) ${truthA}. (b) ${truthB}. Core principle: ${String(solved.reasoningAnchor)}.`;

    items.push({
      id: `${NCUK_QUAL_EXAM_ID_PREFIX}-s4m-${String(i + 1).padStart(3, "0")}-${bp.slug}`,
      conceptId: rule.conceptId,
      templateArchetype: rule.templateArchetype,
      seed,
      syllabi: ncukTag(rule.ncukTopicId, rule.ncukSubtopicId, rule.ncukLevel),
      format: "structured",
      difficulty: bp.difficulty,
      domain: "pure-calculation",
      scenarioSpec,
      hiddenQuantities,
      requiredGivens: [],
      targetMode: "qualitative",
      questionPlan: {
        targetSummary: `Assess multi-mark NCUK short-structured qualitative reasoning on ${rule.title}`,
        subpartStrategy: [
          `part (a): verify ${bp.partAKey}`,
          `part (b): verify ${bp.partBKey}`,
        ],
      },
      stem: bp.stem,
      parts,
      workedSolution,
      markScheme,
      totalMarks: 4,
      generatorModel,
    });
  }

  return items;
}

// ============================================================================
// BANK 3: AC1.2 FALSE-ORIGIN GRAPHING & WORST-CASE UNCERTAINTIES (20 ITEMS)
// ============================================================================

interface FalseOriginVariantParam {
  readonly experimentType: FalseOriginExperimentType;
  readonly contextName: string;
  readonly xMin: number;
  readonly xMax: number;
  readonly yMin: number;
  readonly yMax: number;
  readonly trueGradient: number;
  readonly trueIntercept: number;
  readonly errY: number;
  readonly xRead1: number;
  readonly xRead2: number;
  readonly diameterMm: number;
  readonly diameterUncMm: number;
  readonly sumReadingUncMm: number;
  readonly xUnit: string;
  readonly yUnit: string;
  readonly gradUnit: string;
  readonly invUnit: string;
}

const FALSE_ORIGIN_PARAMS: readonly FalseOriginVariantParam[] = [
  {
    experimentType: "loaded-spring-false-origin",
    contextName: "steel helical suspension spring",
    xMin: 2.0,
    xMax: 12.0,
    yMin: 0.2,
    yMax: 0.45,
    trueGradient: 0.0185,
    trueIntercept: 0.203,
    errY: 0.008,
    xRead1: 3.0,
    xRead2: 11.0,
    diameterMm: 0.64,
    diameterUncMm: 0.02,
    sumReadingUncMm: 0.5,
    xUnit: "N",
    yUnit: "m",
    gradUnit: "m N⁻¹",
    invUnit: "N m⁻¹",
  },
  {
    experimentType: "pressure-temp-false-origin",
    contextName: "sealed dry-air glass bulb",
    xMin: 10.0,
    xMax: 90.0,
    yMin: 95.0,
    yMax: 135.0,
    trueGradient: 0.365,
    trueIntercept: 98.2,
    errY: 1.4,
    xRead1: 20.0,
    xRead2: 80.0,
    diameterMm: 1.12,
    diameterUncMm: 0.03,
    sumReadingUncMm: 1.0,
    xUnit: "°C",
    yUnit: "kPa",
    gradUnit: "kPa K⁻¹",
    invUnit: "K kPa⁻¹",
  },
  {
    experimentType: "wire-extension-power-uncertainty",
    contextName: "stretched brass laboratory wire",
    xMin: 10.0,
    xMax: 60.0,
    yMin: 1.5,
    yMax: 4.5,
    trueGradient: 0.044,
    trueIntercept: 1.46,
    errY: 0.12,
    xRead1: 15.0,
    xRead2: 55.0,
    diameterMm: 0.56,
    diameterUncMm: 0.015,
    sumReadingUncMm: 0.5,
    xUnit: "N",
    yUnit: "mm",
    gradUnit: "mm N⁻¹",
    invUnit: "N mm⁻¹",
  },
  {
    experimentType: "loaded-spring-false-origin",
    contextName: "phosphor-bronze dynamometer coil",
    xMin: 4.0,
    xMax: 24.0,
    yMin: 0.3,
    yMax: 0.65,
    trueGradient: 0.0132,
    trueIntercept: 0.305,
    errY: 0.012,
    xRead1: 6.0,
    xRead2: 22.0,
    diameterMm: 0.84,
    diameterUncMm: 0.02,
    sumReadingUncMm: 0.5,
    xUnit: "N",
    yUnit: "m",
    gradUnit: "m N⁻¹",
    invUnit: "N m⁻¹",
  },
  {
    experimentType: "pressure-temp-false-origin",
    contextName: "rigid nitrogen gas thermometer",
    xMin: 15.0,
    xMax: 95.0,
    yMin: 105.0,
    yMax: 150.0,
    trueGradient: 0.415,
    trueIntercept: 105.5,
    errY: 1.8,
    xRead1: 25.0,
    xRead2: 85.0,
    diameterMm: 1.48,
    diameterUncMm: 0.04,
    sumReadingUncMm: 1.0,
    xUnit: "°C",
    yUnit: "kPa",
    gradUnit: "kPa K⁻¹",
    invUnit: "K kPa⁻¹",
  },
  {
    experimentType: "wire-extension-power-uncertainty",
    contextName: "tensioned constantan test wire",
    xMin: 15.0,
    xMax: 65.0,
    yMin: 2.0,
    yMax: 5.5,
    trueGradient: 0.052,
    trueIntercept: 1.72,
    errY: 0.14,
    xRead1: 20.0,
    xRead2: 60.0,
    diameterMm: 0.48,
    diameterUncMm: 0.012,
    sumReadingUncMm: 0.5,
    xUnit: "N",
    yUnit: "mm",
    gradUnit: "mm N⁻¹",
    invUnit: "N mm⁻¹",
  },
  {
    experimentType: "loaded-spring-false-origin",
    contextName: "calibrated bench force spring",
    xMin: 5.0,
    xMax: 25.0,
    yMin: 0.25,
    yMax: 0.55,
    trueGradient: 0.0114,
    trueIntercept: 0.232,
    errY: 0.01,
    xRead1: 7.0,
    xRead2: 23.0,
    diameterMm: 0.72,
    diameterUncMm: 0.018,
    sumReadingUncMm: 1.0,
    xUnit: "N",
    yUnit: "m",
    gradUnit: "m N⁻¹",
    invUnit: "N m⁻¹",
  },
  {
    experimentType: "pressure-temp-false-origin",
    contextName: "constant-volume argon pressure flask",
    xMin: 20.0,
    xMax: 100.0,
    yMin: 110.0,
    yMax: 155.0,
    trueGradient: 0.39,
    trueIntercept: 109.2,
    errY: 1.6,
    xRead1: 30.0,
    xRead2: 90.0,
    diameterMm: 0.96,
    diameterUncMm: 0.025,
    sumReadingUncMm: 0.5,
    xUnit: "°C",
    yUnit: "kPa",
    gradUnit: "kPa K⁻¹",
    invUnit: "K kPa⁻¹",
  },
  {
    experimentType: "wire-extension-power-uncertainty",
    contextName: "long copper strain-gauge wire",
    xMin: 8.0,
    xMax: 48.0,
    yMin: 1.2,
    yMax: 3.8,
    trueGradient: 0.048,
    trueIntercept: 1.18,
    errY: 0.1,
    xRead1: 12.0,
    xRead2: 44.0,
    diameterMm: 0.68,
    diameterUncMm: 0.016,
    sumReadingUncMm: 0.5,
    xUnit: "N",
    yUnit: "mm",
    gradUnit: "mm N⁻¹",
    invUnit: "N mm⁻¹",
  },
  {
    experimentType: "loaded-spring-false-origin",
    contextName: "heavy-duty steel workshop spring",
    xMin: 6.0,
    xMax: 30.0,
    yMin: 0.4,
    yMax: 0.8,
    trueGradient: 0.0128,
    trueIntercept: 0.365,
    errY: 0.014,
    xRead1: 9.0,
    xRead2: 27.0,
    diameterMm: 0.92,
    diameterUncMm: 0.024,
    sumReadingUncMm: 1.0,
    xUnit: "N",
    yUnit: "m",
    gradUnit: "m N⁻¹",
    invUnit: "N m⁻¹",
  },
];

function generateBank3Ac1Graphs(
  baseSeed: number,
  generatorModel: string,
): CandidateQuestionInput[] {
  const items: CandidateQuestionInput[] = [];
  let offset = 400;

  // 10 MCQs (8 quantitative + 2 qualitative)
  for (let i = 0; i < FALSE_ORIGIN_PARAMS.length; i += 1) {
    const p = FALSE_ORIGIN_PARAMS[i];
    const seed = baseSeed + offset;
    offset += 1;

    const scenarioSpec: Record<string, unknown> = {
      kind: "false-origin-gradient-experiment",
      experimentType: p.experimentType,
      xMin: p.xMin,
      xMax: p.xMax,
      yMin: p.yMin,
      yMax: p.yMax,
      trueGradient: p.trueGradient,
      trueIntercept: p.trueIntercept,
      errY: p.errY,
      xRead1: p.xRead1,
      xRead2: p.xRead2,
      diameterMm: p.diameterMm,
      diameterUncMm: p.diameterUncMm,
      sumReadingUncMm: p.sumReadingUncMm,
    };

    const q = solvePlugin("false-origin-gradient-experiment", scenarioSpec);
    const yRead1 = Number(q.yRead1);
    const yRead2 = Number(q.yRead2);
    const bestGrad = Number(q.bestGradient);
    const worstGrad = Number(q.worstGradient);
    const gradUnc = Number(q.gradientUncertainty);
    const pctGrad = Number(q.percentUncertaintyGradient);
    const invGrad = Number(q.inverseGradient);
    const pctArea = Number(q.percentUncertaintyArea);
    const sumAbs = Number(q.sumAbsUncertaintyMm);

    const mode = i % 5;

    if (i === 8 || i === 9) {
      // 2 pure qualitative AC1.2 graph-technique MCQs
      const targetKey = i === 8 ? "falseOriginPurpose" : "largeTrianglePurpose";
      const truthStr = String(q[targetKey]);
      const stem =
        i === 8
          ? `The false-origin experimental graph for a ${p.contextName} starts both axes away from zero using red axis breaks. Why does NCUK practical graphing require a suppressed origin when all plotted data lie far from zero?`
          : `When finding the best-fit gradient from the false-origin graph of the ${p.contextName}, the dashed triangle spans more than half the plotted range. Why is a large gradient triangle essential?`;

      const distractors: [VerbalDistractor, VerbalDistractor, VerbalDistractor] =
        i === 8
          ? [
              {
                text: "It forces the y intercept on the false axis to equal the true zero-load constant directly",
                rationale: "Reading the vertical intercept off a false x-origin gives an incorrect offset value.",
              },
              {
                text: "It eliminates all systematic zero error from the measuring instruments automatically",
                rationale: "Axis scaling changes graphical readability, not instrumental zero error.",
              },
              {
                text: "It guarantees that the line of best fit passes straight through the bottom-left corner",
                rationale: "A suppressed-origin line rarely passes through the false corner point.",
              },
            ]
          : [
              {
                text: "It alters the true physical stiffness of the specimen to a larger value",
                rationale: "Triangle size affects measurement uncertainty only, not the physical property.",
              },
              {
                text: "It removes random scatter from the plotted experimental crosses completely",
                rationale: "Random scatter is already fixed in the recorded data points.",
              },
              {
                text: "It allows the student to pick two raw plotted data crosses instead of points on the best-fit line",
                rationale: "Gradient triangles should always use widely separated points lying directly on the line of best fit.",
              },
            ];

      const options = buildVerbalMcqOptions(
        `Because it ${truthStr}`,
        distractors,
        seed,
      );

      items.push({
        id: `${NCUK_QUAL_EXAM_ID_PREFIX}-ac1-mcq-${String(i + 1).padStart(2, "0")}`,
        conceptId: "graphical-linearization-gradients",
        templateArchetype: "ncuk-false-origin-graph-uncertainty",
        seed,
        syllabi: ncukTag("ncuk-ac1", "ncuk-ac1-2", "IFY-S1"),
        format: "mcq",
        difficulty: "foundation",
        domain: "graphs",
        scenarioSpec,
        hiddenQuantities: [targetKey],
        requiredGivens: [],
        targetMode: "qualitative",
        targetQuantityKey: targetKey,
        questionPlan: {
          targetSummary:
            "Assess NCUK experimental graphing methodology rationale on a suppressed-origin Cartesian figure",
          distractorStrategy: [
            "false-intercept-misconception",
            "systematic-error-confusion",
            "raw-data-point-triangle-trap",
          ],
        },
        stem,
        options,
        workedSolution: `On a suppressed-origin NCUK graph, the procedure ${truthStr}.`,
        markScheme: [
          {
            code: "B1",
            criterion: `States accurately that the graphing technique ${truthStr}.`,
            marks: 1,
          },
        ],
        totalMarks: 1,
        generatorModel,
      });
      continue;
    }

    if (mode === 0) {
      // Best-fit gradient from large triangle
      const stem = `The suppressed-origin graph shows measurements for a ${p.contextName}. Two widely separated read-off points on the line of best fit have coordinates (${p.xRead1.toFixed(1)} ${p.xUnit}, ${fmt4(yRead1, p.yUnit)}) and (${p.xRead2.toFixed(1)} ${p.xUnit}, ${fmt4(yRead2, p.yUnit)}). What is the best-fit gradient of the graph?`;
      const options = buildNumericMcqOptions(
        bestGrad,
        p.gradUnit,
        [
          {
            value: 1 / bestGrad,
            rationale: "Inverts Δy / Δx to Δx / Δy.",
          },
          {
            value: yRead2 / p.xRead2,
            rationale: "Divides a single point y / x ignoring the suppressed non-zero intercept.",
          },
          {
            value: (yRead2 - yRead1) / p.xRead2,
            rationale: "Uses x₂ instead of the horizontal span (x₂ − x₁) on the false origin.",
          },
        ],
        seed,
      );
      items.push({
        id: `${NCUK_QUAL_EXAM_ID_PREFIX}-ac1-mcq-${String(i + 1).padStart(2, "0")}`,
        conceptId: "graphical-linearization-gradients",
        templateArchetype: "ncuk-false-origin-graph-uncertainty",
        seed,
        syllabi: ncukTag("ncuk-ac1", "ncuk-ac1-2", "IFY-S1"),
        format: "mcq",
        difficulty: "standard",
        domain: "graphs",
        scenarioSpec,
        hiddenQuantities: [
          "bestGradient",
          "worstGradient",
          "gradientUncertainty",
          "inverseGradient",
        ],
        requiredGivens: [
          { name: "xRead1", value: p.xRead1, unit: p.xUnit, source: "stem" },
          { name: "xRead2", value: p.xRead2, unit: p.xUnit, source: "stem" },
        ],
        targetQuantityKey: "bestGradient",
        questionPlan: {
          targetSummary:
            "Determine best-fit gradient using a large triangle on a false-origin graph",
          distractorStrategy: [
            "inverted-gradient-ratio",
            "single-point-origin-assumption",
            "omitted-false-origin-subtraction",
          ],
        },
        stem,
        options,
        workedSolution: `Using the large triangle spanning more than half the grid: gradient = (${fmt4(yRead2)} − ${fmt4(yRead1)}) / (${p.xRead2.toFixed(1)} − ${p.xRead1.toFixed(1)}) = ${fmt4(bestGrad, p.gradUnit)} ≈ ${fmt3(bestGrad, p.gradUnit)}.`,
        markScheme: [
          {
            code: "A1",
            criterion: `Calculates best-fit gradient = ${fmt3(bestGrad, p.gradUnit)} from Δy / Δx.`,
            marks: 1,
          },
        ],
        totalMarks: 1,
        generatorModel,
      });
    } else if (mode === 1) {
      // Worst-fit gradient absolute uncertainty
      const stem = `For the ${p.contextName} plotted with vertical error bars ±${p.errY} ${p.yUnit} on the suppressed-origin graph, the best-fit gradient is ${fmt4(bestGrad, p.gradUnit)} and the steepest acceptable worst-fit line passing through all error bars has gradient ${fmt4(worstGrad, p.gradUnit)}. What is the absolute uncertainty in the gradient?`;
      const options = buildNumericMcqOptions(
        gradUnc,
        p.gradUnit,
        [
          {
            value: 0.5 * gradUnc,
            rationale: "Divides |m_best − m_worst| by two (only valid when comparing steepest minus shallowest, not best minus worst).",
          },
          {
            value: 2 * gradUnc,
            rationale: "Doubles the difference between best-fit and worst-fit gradients.",
          },
          {
            value: p.errY / (p.xMax - p.xMin),
            rationale: "Uses single error bar half-height instead of full top-to-bottom swing across error bars.",
          },
        ],
        seed,
      );
      items.push({
        id: `${NCUK_QUAL_EXAM_ID_PREFIX}-ac1-mcq-${String(i + 1).padStart(2, "0")}`,
        conceptId: "graphical-linearization-gradients",
        templateArchetype: "ncuk-false-origin-graph-uncertainty",
        seed,
        syllabi: ncukTag("ncuk-ac1", "ncuk-ac1-2", "IFY-S1"),
        format: "mcq",
        difficulty: "standard",
        domain: "graphs",
        scenarioSpec,
        hiddenQuantities: [
          "gradientUncertainty",
          "percentUncertaintyGradient",
          "inverseGradient",
        ],
        requiredGivens: [
          { name: "errY", value: p.errY, unit: p.yUnit, source: "stem" },
          { name: "bestGradient", value: bestGrad, unit: p.gradUnit, source: "stem" },
          { name: "worstGradient", value: worstGrad, unit: p.gradUnit, source: "stem" },
        ],
        targetQuantityKey: "gradientUncertainty",
        questionPlan: {
          targetSummary:
            "Compute absolute gradient uncertainty from best-fit and worst-fit line gradients",
          distractorStrategy: [
            "extraneous-half-factor-on-best-worst",
            "double-gradient-uncertainty",
            "raw-y-error-over-range",
          ],
        },
        stem,
        options,
        workedSolution: `Absolute uncertainty Δm = |m_worst − m_best| = |${fmt4(worstGrad)} − ${fmt4(bestGrad)}| = ${fmt4(gradUnc, p.gradUnit)} ≈ ${fmt3(gradUnc, p.gradUnit)}.`,
        markScheme: [
          {
            code: "A1",
            criterion: `Evaluates Δm = |m_worst − m_best| = ${fmt3(gradUnc, p.gradUnit)}.`,
            marks: 1,
          },
        ],
        totalMarks: 1,
        generatorModel,
      });
    } else if (mode === 2) {
      // 2 × %Δd power uncertainty trap
      const stem = `During the ${p.contextName} experiment shown on the graph, the wire diameter is measured with a micrometer as d = ${p.diameterMm.toFixed(2)} ± ${p.diameterUncMm.toFixed(3)} mm. What is the percentage uncertainty in its circular cross-sectional area A = πd² / 4?`;
      const options = buildNumericMcqOptions(
        pctArea,
        "%",
        [
          {
            value: pctArea / 2,
            rationale: "Forgets to multiply percentage uncertainty in diameter by the exponent two on d².",
          },
          {
            value: pctArea * 2,
            rationale: "Multiplies by four instead of the power two on d².",
          },
          {
            value: (p.diameterUncMm / p.diameterMm) * Math.PI * 100,
            rationale: "Multiplies percentage uncertainty by π, forgetting that exact constants contribute zero uncertainty.",
          },
        ],
        seed,
      );
      items.push({
        id: `${NCUK_QUAL_EXAM_ID_PREFIX}-ac1-mcq-${String(i + 1).padStart(2, "0")}`,
        conceptId: "uncertainties-error-propagation",
        templateArchetype: "ncuk-false-origin-graph-uncertainty",
        seed,
        syllabi: ncukTag("ncuk-ac1", "ncuk-ac1-2", "IFY-S1"),
        format: "mcq",
        difficulty: "standard",
        domain: "graphs",
        scenarioSpec,
        hiddenQuantities: [
          "percentUncertaintyDiameter",
          "percentUncertaintyArea",
          "combinedPercentUncertainty",
        ],
        requiredGivens: [
          { name: "diameterMm", value: p.diameterMm, unit: "mm", source: "stem" },
          {
            name: "diameterUncMm",
            value: p.diameterUncMm,
            unit: "mm",
            source: "stem",
          },
        ],
        targetQuantityKey: "percentUncertaintyArea",
        questionPlan: {
          targetSummary:
            "Propagate squared power percentage uncertainty for circular wire cross-sectional area",
          distractorStrategy: [
            "omitted-square-power-factor",
            "factor-of-four-radius-trap",
            "exact-pi-constant-uncertainty",
          ],
        },
        stem,
        options,
        workedSolution: `%Δd = (${p.diameterUncMm.toFixed(3)} / ${p.diameterMm.toFixed(2)}) × 100% = ${fmt4(pctArea / 2)}%. Since A ∝ d², %ΔA = 2 × %Δd = ${fmt4(pctArea)}% ≈ ${fmt3(pctArea)}%.`,
        markScheme: [
          {
            code: "A1",
            criterion: `Applies %ΔA = 2 × (Δd / d) × 100% = ${fmt3(pctArea)}%.`,
            marks: 1,
          },
        ],
        totalMarks: 1,
        generatorModel,
      });
    } else if (mode === 3) {
      // Inverse gradient (spring stiffness k = 1/m)
      const stem = `On the suppressed-origin plot for the ${p.contextName}, the best-fit gradient obtained from the large triangle between ${p.xRead1.toFixed(1)} ${p.xUnit} and ${p.xRead2.toFixed(1)} ${p.xUnit} is Δy / Δx = ${fmt4(bestGrad, p.gradUnit)}. What is the reciprocal constant (1 / gradient) corresponding to stiffness?`;
      const options = buildNumericMcqOptions(
        invGrad,
        p.invUnit,
        [
          {
            value: bestGrad,
            rationale: "Reports the gradient directly instead of taking its reciprocal.",
          },
          {
            value: invGrad * 0.5,
            rationale: "Introduces an extraneous factor of one-half from elastic energy ½kx².",
          },
          {
            value: p.xRead2 / yRead2,
            rationale: "Takes x / y at a single point ignoring the non-zero unstretched length intercept.",
          },
        ],
        seed,
      );
      items.push({
        id: `${NCUK_QUAL_EXAM_ID_PREFIX}-ac1-mcq-${String(i + 1).padStart(2, "0")}`,
        conceptId: "graphical-linearization-gradients",
        templateArchetype: "ncuk-false-origin-graph-uncertainty",
        seed,
        syllabi: ncukTag("ncuk-ac1", "ncuk-ac1-2", "IFY-S1"),
        format: "mcq",
        difficulty: "standard",
        domain: "graphs",
        scenarioSpec,
        hiddenQuantities: [
          "inverseGradient",
          "inverseGradientUncertainty",
          "percentUncertaintyGradient",
        ],
        requiredGivens: [
          { name: "bestGradient", value: bestGrad, unit: p.gradUnit, source: "stem" },
          { name: "xRead1", value: p.xRead1, unit: p.xUnit, source: "stem" },
          { name: "xRead2", value: p.xRead2, unit: p.xUnit, source: "stem" },
        ],
        targetQuantityKey: "inverseGradient",
        questionPlan: {
          targetSummary:
            "Extract inverse physical constant from a false-origin linear graph gradient",
          distractorStrategy: [
            "uninverted-gradient",
            "half-energy-factor-slip",
            "single-point-ratio-ignoring-intercept",
          ],
        },
        stem,
        options,
        workedSolution: `Because the axes plot length against load, stiffness k = 1 / gradient = 1 / ${fmt4(bestGrad)} = ${fmt4(invGrad, p.invUnit)} ≈ ${fmt3(invGrad, p.invUnit)}.`,
        markScheme: [
          {
            code: "A1",
            criterion: `Computes reciprocal constant 1 / gradient = ${fmt3(invGrad, p.invUnit)}.`,
            marks: 1,
          },
        ],
        totalMarks: 1,
        generatorModel,
      });
    } else {
      // Sum/difference reading uncertainty + % gradient uncertainty
      const stem = `In the ${p.contextName} investigation, each scale position on a metre rule is read with an absolute uncertainty of ±${p.sumReadingUncMm.toFixed(1)} mm. When calculating extension e = L₂ − L₁ from two separate scale readings, what is the absolute uncertainty Δe?`;
      const options = buildNumericMcqOptions(
        sumAbs,
        "mm",
        [
          {
            value: p.sumReadingUncMm,
            rationale: "Forgets to add uncertainties for both scale readings (Δe = ΔL₁ + ΔL₂).",
          },
          {
            value: p.sumReadingUncMm * 0.5,
            rationale: "Halves the single-reading uncertainty instead of summing both.",
          },
          {
            value: p.sumReadingUncMm * 4,
            rationale: "Quadruples single-reading uncertainty instead of adding the two absolute errors.",
          },
        ],
        seed,
      );
      items.push({
        id: `${NCUK_QUAL_EXAM_ID_PREFIX}-ac1-mcq-${String(i + 1).padStart(2, "0")}`,
        conceptId: "uncertainties-error-propagation",
        templateArchetype: "ncuk-false-origin-graph-uncertainty",
        seed,
        syllabi: ncukTag("ncuk-ac1", "ncuk-ac1-2", "IFY-S1"),
        format: "mcq",
        difficulty: "foundation",
        domain: "graphs",
        scenarioSpec,
        hiddenQuantities: [
          "sumAbsUncertaintyMm",
          "percentUncertaintyGradient",
          "gradientUncertainty",
        ],
        requiredGivens: [
          {
            name: "sumReadingUncMm",
            value: p.sumReadingUncMm,
            unit: "mm",
            source: "stem",
          },
        ],
        targetQuantityKey: "sumAbsUncertaintyMm",
        questionPlan: {
          targetSummary:
            "Apply additive absolute uncertainty rule to a difference of two scale readings",
          distractorStrategy: [
            "single-reading-uncertainty-only",
            "halved-resolution-trap",
            "quadrupled-error-slip",
          ],
        },
        stem,
        options,
        workedSolution: `When subtracting two measurements, absolute uncertainties add: Δe = ΔL₁ + ΔL₂ = ${p.sumReadingUncMm.toFixed(1)} + ${p.sumReadingUncMm.toFixed(1)} = ${fmt3(sumAbs, "mm")} (whereas percentage uncertainty in the graph gradient is ${fmt3(pctGrad)}%).`,
        markScheme: [
          {
            code: "A1",
            criterion: `Adds absolute uncertainties of both scale readings to obtain ${fmt3(sumAbs, "mm")}.`,
            marks: 1,
          },
        ],
        totalMarks: 1,
        generatorModel,
      });
    }
  }

  // 10 Structured items (5 x 4m + 5 x 6m)
  for (let i = 0; i < FALSE_ORIGIN_PARAMS.length; i += 1) {
    const p = FALSE_ORIGIN_PARAMS[i];
    const seed = baseSeed + offset;
    offset += 1;

    const scenarioSpec: Record<string, unknown> = {
      kind: "false-origin-gradient-experiment",
      experimentType: p.experimentType,
      xMin: p.xMin,
      xMax: p.xMax,
      yMin: p.yMin,
      yMax: p.yMax,
      trueGradient: p.trueGradient,
      trueIntercept: p.trueIntercept,
      errY: p.errY,
      xRead1: p.xRead1,
      xRead2: p.xRead2,
      diameterMm: p.diameterMm,
      diameterUncMm: p.diameterUncMm,
      sumReadingUncMm: p.sumReadingUncMm,
    };

    const q = solvePlugin("false-origin-gradient-experiment", scenarioSpec);
    const yRead1 = Number(q.yRead1);
    const yRead2 = Number(q.yRead2);
    const bestGrad = Number(q.bestGradient);
    const worstGrad = Number(q.worstGradient);
    const gradUnc = Number(q.gradientUncertainty);
    const pctGrad = Number(q.percentUncertaintyGradient);
    const pctArea = Number(q.percentUncertaintyArea);
    const combinedPct = Number(q.combinedPercentUncertainty);
    const isSixMark = i % 2 === 1;

    const stem = `A student investigates a ${p.contextName} and plots the suppressed-origin graph shown, with vertical error bars of ±${p.errY} ${p.yUnit}. Two widely separated coordinates on the line of best fit are (${p.xRead1.toFixed(1)} ${p.xUnit}, ${fmt4(yRead1, p.yUnit)}) and (${p.xRead2.toFixed(1)} ${p.xUnit}, ${fmt4(yRead2, p.yUnit)}). The steepest straight line still passing through all error bars has gradient ${fmt4(worstGrad, p.gradUnit)}.${isSixMark ? ` The specimen diameter is measured as d = ${p.diameterMm.toFixed(2)} ± ${p.diameterUncMm.toFixed(3)} mm.` : ""}`;

    const parts: StructuredQuestionPart[] = [
      {
        partId: "a",
        prompt:
          "Use the large gradient triangle coordinates on the line of best fit to calculate the best-fit gradient with units. [2]",
        marks: 2,
        targetQuantityKey: "bestGradient",
        expectedAnswer: fmt3(bestGrad, p.gradUnit),
        workingSteps: [
          `m_best = Δy / Δx = (${fmt4(yRead2)} − ${fmt4(yRead1)}) / (${p.xRead2.toFixed(1)} − ${p.xRead1.toFixed(1)})`,
          `m_best = ${fmt4(bestGrad, p.gradUnit)} ≈ ${fmt3(bestGrad, p.gradUnit)}`,
        ],
      },
      {
        partId: "b",
        prompt:
          "Determine the absolute uncertainty Δm in the gradient from the worst-fit line. [1]",
        marks: 1,
        dependsOnPartIds: ["a"],
        targetQuantityKey: "gradientUncertainty",
        expectedAnswer: fmt3(gradUnc, p.gradUnit),
        workingSteps: [
          `Δm = |m_worst − m_best| = |${fmt4(worstGrad)} − ${fmt4(bestGrad)}| = ${fmt4(gradUnc, p.gradUnit)} ≈ ${fmt3(gradUnc, p.gradUnit)}`,
        ],
      },
      {
        partId: "c",
        prompt:
          "State why a suppressed false origin is used on this graph rather than starting both axes at zero. [1]",
        marks: 1,
        targetMode: "qualitative",
        targetQuantityKey: "falseOriginPurpose",
        expectedAnswer: `A suppressed origin ${String(q.falseOriginPurpose)}.`,
        workingSteps: [
          `Recall NCUK graphing standards: ${String(q.falseOriginPurpose)}.`,
        ],
      },
    ];

    const markScheme: MarkSchemePoint[] = [
      {
        code: "M1",
        partId: "a",
        criterion: `Correctly substitutes large-triangle coordinates (${fmt4(yRead2)} − ${fmt4(yRead1)}) / (${p.xRead2.toFixed(1)} − ${p.xRead1.toFixed(1)}).`,
        marks: 1,
      },
      {
        code: "A1",
        partId: "a",
        criterion: `Obtains best-fit gradient = ${fmt3(bestGrad, p.gradUnit)} with correct compound SI unit.`,
        marks: 1,
      },
      {
        code: "A1",
        partId: "b",
        criterion: `Calculates Δm = |m_worst − m_best| = ${fmt3(gradUnc, p.gradUnit)}.`,
        marks: 1,
      },
      {
        code: "B1",
        partId: "c",
        criterion: `States that a false origin ${String(q.falseOriginPurpose)}.`,
        marks: 1,
      },
    ];

    const hiddenQuantities = [
      "bestGradient",
      "gradientUncertainty",
      "percentUncertaintyGradient",
      "falseOriginPurpose",
    ];
    const requiredGivens: RequiredGivenSpec[] = [
      { name: "errY", value: p.errY, unit: p.yUnit, source: "stem" },
      { name: "xRead1", value: p.xRead1, unit: p.xUnit, source: "stem" },
      { name: "xRead2", value: p.xRead2, unit: p.xUnit, source: "stem" },
      { name: "worstGradient", value: worstGrad, unit: p.gradUnit, source: "stem" },
    ];

    let workedSolution = `(a) m_best = (${fmt4(yRead2)} − ${fmt4(yRead1)}) / (${p.xRead2.toFixed(1)} − ${p.xRead1.toFixed(1)}) = ${fmt4(bestGrad, p.gradUnit)} ≈ ${fmt3(bestGrad, p.gradUnit)}. (b) Δm = |${fmt4(worstGrad)} − ${fmt4(bestGrad)}| = ${fmt3(gradUnc, p.gradUnit)}. (c) A suppressed origin ${String(q.falseOriginPurpose)}.`;

    if (isSixMark) {
      parts.push({
        partId: "d",
        prompt:
          "Calculate the combined percentage uncertainty in a derived material constant proportional to (gradient × cross-sectional area), using %ΔA = 2 × %Δd. [2]",
        marks: 2,
        dependsOnPartIds: ["a", "b"],
        targetQuantityKey: "combinedPercentUncertainty",
        expectedAnswer: fmt3(combinedPct, "%"),
        workingSteps: [
          `%Δm = (${fmt4(gradUnc)} / ${fmt4(bestGrad)}) × 100% = ${fmt4(pctGrad)}%`,
          `%ΔA = 2 × (${p.diameterUncMm.toFixed(3)} / ${p.diameterMm.toFixed(2)}) × 100% = ${fmt4(pctArea)}%`,
          `Total % uncertainty = ${fmt4(pctGrad)}% + ${fmt4(pctArea)}% = ${fmt4(combinedPct)}% ≈ ${fmt3(combinedPct)}%`,
        ],
      });
      markScheme.push(
        {
          code: "M1",
          partId: "d",
          criterion: `Evaluates %Δm = ${fmt3(pctGrad)}% and %ΔA = 2 × %Δd = ${fmt3(pctArea)}%.`,
          marks: 1,
        },
        {
          code: "A1",
          partId: "d",
          criterion: `Sums percentage uncertainties to obtain ${fmt3(combinedPct)}%.`,
          marks: 1,
        },
      );
      hiddenQuantities.push(
        "percentUncertaintyArea",
        "combinedPercentUncertainty",
      );
      requiredGivens.push(
        { name: "diameterMm", value: p.diameterMm, unit: "mm", source: "stem" },
        {
          name: "diameterUncMm",
          value: p.diameterUncMm,
          unit: "mm",
          source: "stem",
        },
      );
      workedSolution += ` (d) %Δm = ${fmt4(pctGrad)}%, %ΔA = 2 × %Δd = ${fmt4(pctArea)}%, total = ${fmt4(combinedPct)}% ≈ ${fmt3(combinedPct)}%.`;
    }

    items.push({
      id: `${NCUK_QUAL_EXAM_ID_PREFIX}-ac1-str-${String(i + 1).padStart(2, "0")}`,
      conceptId: "graphical-linearization-gradients",
      templateArchetype: "ncuk-false-origin-graph-uncertainty",
      seed,
      syllabi: ncukTag("ncuk-ac1", "ncuk-ac1-2", "IFY-S1"),
      format: "structured",
      difficulty: isSixMark ? "higher" : "standard",
      domain: "graphs",
      scenarioSpec,
      hiddenQuantities,
      requiredGivens,
      questionPlan: {
        targetSummary:
          "Evaluate suppressed-origin gradient, worst-fit line uncertainty, graphing rationale, and power uncertainty propagation",
        subpartStrategy: parts.map(
          (pt) => `part (${pt.partId}): target ${pt.targetQuantityKey}`,
        ),
      },
      stem,
      parts,
      workedSolution,
      markScheme,
      totalMarks: isSixMark ? 6 : 4,
      generatorModel,
    });
  }

  return items;
}

// ============================================================================
// BANK 4: 10-MARK IFYPH005 AC3 FLAGSHIP (thermal-phase-cooling-gas-10m, 14x10m)
// ============================================================================

interface Thermal10mVariantParam {
  readonly slug: string;
  readonly materialLabel: string;
  readonly vesselContext: string;
  readonly curveMode: ThermalCurveMode;
  readonly massKg: number;
  readonly specificHeatSolidJKgK: number;
  readonly latentHeatFusionJKg: number;
  readonly thetaStartC: number;
  readonly thetaMeltC: number;
  readonly heaterPowerW: number;
  readonly thermalEfficiency: number;
  readonly gasInitialPressureKPa: number;
  readonly gasInitialTempC: number;
  readonly gasFinalTempC: number;
  readonly subtopicId: "ncuk-ac3-3" | "ncuk-ac3-4";
}

const THERMAL_10M_PARAMS: readonly Thermal10mVariantParam[] = [
  {
    slug: "paraffin-wax-heater",
    materialLabel: "refined paraffin wax",
    vesselContext: "sealed helium pressure sensor bulb",
    curveMode: "heating-plateau",
    massKg: 0.24,
    specificHeatSolidJKgK: 1850,
    latentHeatFusionJKg: 148_000,
    thetaStartC: 20,
    thetaMeltC: 64,
    heaterPowerW: 85,
    thermalEfficiency: 0.82,
    gasInitialPressureKPa: 102,
    gasInitialTempC: 20,
    gasFinalTempC: 92,
    subtopicId: "ncuk-ac3-3",
  },
  {
    slug: "octadecanol-cooling",
    materialLabel: "crystalline octadecanol wax",
    vesselContext: "rigid nitrogen gas canister",
    curveMode: "cooling-plateau",
    massKg: 0.32,
    specificHeatSolidJKgK: 1620,
    latentHeatFusionJKg: 165_000,
    thetaStartC: 22,
    thetaMeltC: 58,
    heaterPowerW: 95,
    thermalEfficiency: 0.8,
    gasInitialPressureKPa: 108,
    gasInitialTempC: 22,
    gasFinalTempC: 105,
    subtopicId: "ncuk-ac3-3",
  },
  {
    slug: "bismuth-tin-eutectic",
    materialLabel: "bismuth-tin eutectic alloy",
    vesselContext: "sealed argon laboratory flask",
    curveMode: "heating-plateau",
    massKg: 0.55,
    specificHeatSolidJKgK: 420,
    latentHeatFusionJKg: 48_000,
    thetaStartC: 18,
    thetaMeltC: 96,
    heaterPowerW: 135,
    thermalEfficiency: 0.85,
    gasInitialPressureKPa: 112,
    gasInitialTempC: 18,
    gasFinalTempC: 128,
    subtopicId: "ncuk-ac3-3",
  },
  {
    slug: "lauric-ester-cooling",
    materialLabel: "purified lauric ester",
    vesselContext: "constant-volume dry air sphere",
    curveMode: "cooling-plateau",
    massKg: 0.28,
    specificHeatSolidJKgK: 1740,
    latentHeatFusionJKg: 178_000,
    thetaStartC: 19,
    thetaMeltC: 52,
    heaterPowerW: 78,
    thermalEfficiency: 0.78,
    gasInitialPressureKPa: 98,
    gasInitialTempC: 19,
    gasFinalTempC: 88,
    subtopicId: "ncuk-ac3-4",
  },
  {
    slug: "stearic-wax-heater",
    materialLabel: "synthetic stearic wax",
    vesselContext: "sealed neon calibration cylinder",
    curveMode: "heating-plateau",
    massKg: 0.36,
    specificHeatSolidJKgK: 1920,
    latentHeatFusionJKg: 196_000,
    thetaStartC: 21,
    thetaMeltC: 69,
    heaterPowerW: 110,
    thermalEfficiency: 0.84,
    gasInitialPressureKPa: 116,
    gasInitialTempC: 21,
    gasFinalTempC: 115,
    subtopicId: "ncuk-ac3-3",
  },
  {
    slug: "cetyl-alcohol-cooling",
    materialLabel: "laboratory cetyl alcohol",
    vesselContext: "rigid oxygen-free nitrogen bulb",
    curveMode: "cooling-plateau",
    massKg: 0.42,
    specificHeatSolidJKgK: 1580,
    latentHeatFusionJKg: 142_000,
    thetaStartC: 20,
    thetaMeltC: 54,
    heaterPowerW: 92,
    thermalEfficiency: 0.76,
    gasInitialPressureKPa: 104,
    gasInitialTempC: 20,
    gasFinalTempC: 96,
    subtopicId: "ncuk-ac3-3",
  },
  {
    slug: "gallium-indium-heater",
    materialLabel: "synthetic gallium-indium compound",
    vesselContext: "sealed dry-helium manometer flask",
    curveMode: "heating-plateau",
    massKg: 0.48,
    specificHeatSolidJKgK: 390,
    latentHeatFusionJKg: 76_000,
    thetaStartC: 16,
    thetaMeltC: 48,
    heaterPowerW: 64,
    thermalEfficiency: 0.88,
    gasInitialPressureKPa: 94,
    gasInitialTempC: 16,
    gasFinalTempC: 84,
    subtopicId: "ncuk-ac3-4",
  },
  {
    slug: "molten-resin-cooling",
    materialLabel: "thermal-storage resin wax",
    vesselContext: "constant-volume krypton gas vessel",
    curveMode: "cooling-plateau",
    massKg: 0.3,
    specificHeatSolidJKgK: 2050,
    latentHeatFusionJKg: 154_000,
    thetaStartC: 24,
    thetaMeltC: 74,
    heaterPowerW: 105,
    thermalEfficiency: 0.81,
    gasInitialPressureKPa: 122,
    gasInitialTempC: 24,
    gasFinalTempC: 122,
    subtopicId: "ncuk-ac3-3",
  },
  {
    slug: "docosane-pcm-heater",
    materialLabel: "docosane phase-change wax",
    vesselContext: "sealed dry-air Bourdon chamber",
    curveMode: "heating-plateau",
    massKg: 0.26,
    specificHeatSolidJKgK: 1980,
    latentHeatFusionJKg: 215_000,
    thetaStartC: 18,
    thetaMeltC: 56,
    heaterPowerW: 88,
    thermalEfficiency: 0.79,
    gasInitialPressureKPa: 105,
    gasInitialTempC: 18,
    gasFinalTempC: 102,
    subtopicId: "ncuk-ac3-3",
  },
  {
    slug: "myristic-ester-cooling",
    materialLabel: "solidified myristic ester",
    vesselContext: "rigid argon thermal test vessel",
    curveMode: "cooling-plateau",
    massKg: 0.38,
    specificHeatSolidJKgK: 1690,
    latentHeatFusionJKg: 188_000,
    thetaStartC: 23,
    thetaMeltC: 62,
    heaterPowerW: 115,
    thermalEfficiency: 0.83,
    gasInitialPressureKPa: 118,
    gasInitialTempC: 23,
    gasFinalTempC: 118,
    subtopicId: "ncuk-ac3-4",
  },
  {
    slug: "solder-billet-heater",
    materialLabel: "low-melting tin-bismuth solder",
    vesselContext: "sealed nitrogen industrial sensor",
    curveMode: "heating-plateau",
    massKg: 0.62,
    specificHeatSolidJKgK: 460,
    latentHeatFusionJKg: 54_000,
    thetaStartC: 22,
    thetaMeltC: 104,
    heaterPowerW: 140,
    thermalEfficiency: 0.86,
    gasInitialPressureKPa: 126,
    gasInitialTempC: 22,
    gasFinalTempC: 136,
    subtopicId: "ncuk-ac3-3",
  },
  {
    slug: "erythritol-pellet-cooling",
    materialLabel: "synthetic organic sugar-alcohol wax",
    vesselContext: "sealed helium constant-volume probe",
    curveMode: "cooling-plateau",
    massKg: 0.22,
    specificHeatSolidJKgK: 1520,
    latentHeatFusionJKg: 240_000,
    thetaStartC: 25,
    thetaMeltC: 88,
    heaterPowerW: 125,
    thermalEfficiency: 0.77,
    gasInitialPressureKPa: 110,
    gasInitialTempC: 25,
    gasFinalTempC: 130,
    subtopicId: "ncuk-ac3-3",
  },
  {
    slug: "refined-beeswax-heater",
    materialLabel: "filtered synthetic beeswax core",
    vesselContext: "rigid dry-air reference flask",
    curveMode: "heating-plateau",
    massKg: 0.34,
    specificHeatSolidJKgK: 2140,
    latentHeatFusionJKg: 168_000,
    thetaStartC: 19,
    thetaMeltC: 66,
    heaterPowerW: 100,
    thermalEfficiency: 0.8,
    gasInitialPressureKPa: 100,
    gasInitialTempC: 19,
    gasFinalTempC: 94,
    subtopicId: "ncuk-ac3-4",
  },
  {
    slug: "salt-hydrate-cooling",
    materialLabel: "encapsulated salt-hydrate thermal core",
    vesselContext: "sealed neon constant-volume chamber",
    curveMode: "cooling-plateau",
    massKg: 0.44,
    specificHeatSolidJKgK: 1780,
    latentHeatFusionJKg: 192_000,
    thetaStartC: 20,
    thetaMeltC: 60,
    heaterPowerW: 130,
    thermalEfficiency: 0.84,
    gasInitialPressureKPa: 114,
    gasInitialTempC: 20,
    gasFinalTempC: 108,
    subtopicId: "ncuk-ac3-3",
  },
];

function generateBank4Thermal10m(
  baseSeed: number,
  generatorModel: string,
): CandidateQuestionInput[] {
  const items: CandidateQuestionInput[] = [];
  let offset = 600;

  for (let i = 0; i < THERMAL_10M_PARAMS.length; i += 1) {
    const p = THERMAL_10M_PARAMS[i];
    const seed = baseSeed + offset;
    offset += 1;

    const scenarioSpec: Record<string, unknown> = {
      kind: "thermal-phase-cooling-gas-10m",
      curveMode: p.curveMode,
      massKg: p.massKg,
      specificHeatSolidJKgK: p.specificHeatSolidJKgK,
      latentHeatFusionJKg: p.latentHeatFusionJKg,
      thetaStartC: p.thetaStartC,
      thetaMeltC: p.thetaMeltC,
      heaterPowerW: p.heaterPowerW,
      thermalEfficiency: p.thermalEfficiency,
      gasInitialPressureKPa: p.gasInitialPressureKPa,
      gasInitialTempC: p.gasInitialTempC,
      gasFinalTempC: p.gasFinalTempC,
    };

    const q = solvePlugin("thermal-phase-cooling-gas-10m", scenarioSpec);
    const dT = Number(q.deltaTempSolidK);
    const qWarmJ = Number(q.warmingEnergyJ);
    const qMeltJ = Number(q.meltingEnergyJ);
    const qTotJ = Number(q.totalThermalEnergyJ);
    const tActualS = Number(q.actualHeatingTimeS);
    const tGas1K = Number(q.gasInitialTempK);
    const tGas2K = Number(q.gasFinalTempK);
    const p2KPa = Number(q.finalGasPressureKPa);

    const effPct = Math.round(p.thermalEfficiency * 100);
    const isHeating = p.curveMode === "heating-plateau";
    const showTargetTime = i % 2 === 0;
    const showKey = showTargetTime ? "actualHeatingTimeS" : "totalThermalEnergyJ";
    const showVal = showTargetTime ? tActualS : qTotJ;
    const showUnit = showTargetTime ? "s" : "J";
    const showRoundedPrompt = fmt3(showVal, showUnit);

    const stem = isHeating
      ? `A thermal laboratory tests a solid block of ${p.materialLabel} of mass ${p.massKg.toFixed(2)} kg initially at ${p.thetaStartC} °C. The figure displays its temperature–time heating curve through its melting point of ${p.thetaMeltC} °C. The solid has specific heat capacity ${p.specificHeatSolidJKgK} J kg⁻¹ K⁻¹ and specific latent heat of fusion ${fmt3(p.latentHeatFusionJKg, "J kg⁻¹")}. An electrical immersion heater rated at ${p.heaterPowerW} W transfers energy to the sample with thermal efficiency ${effPct}%. In a separate pressure-law check, a ${p.vesselContext} contains a fixed mass of ideal gas at pressure ${p.gasInitialPressureKPa} kPa and temperature ${p.gasInitialTempC} °C, before being heated at constant volume to ${p.gasFinalTempC} °C (use T / K = θ / °C + ${NCUK_KELVIN_OFFSET}).`
      : `A calorimetry experiment records the cooling curve shown in the figure as ${p.massKg.toFixed(2)} kg of molten ${p.materialLabel} freezes at ${p.thetaMeltC} °C and cools in solid form down to ${p.thetaStartC} °C. The solid has specific heat capacity ${p.specificHeatSolidJKgK} J kg⁻¹ K⁻¹ and specific latent heat of fusion ${fmt3(p.latentHeatFusionJKg, "J kg⁻¹")}. When previously melted from ${p.thetaStartC} °C using a ${p.heaterPowerW} W immersion heater, the heating setup operated at ${effPct}% thermal efficiency. Separately, a ${p.vesselContext} holds a fixed mass of ideal gas at ${p.gasInitialPressureKPa} kPa and ${p.gasInitialTempC} °C before warming at constant volume to ${p.gasFinalTempC} °C (use T / K = θ / °C + ${NCUK_KELVIN_OFFSET}).`;

    const partAiPrompt = isHeating
      ? `Calculate the thermal energy required to raise the temperature of the solid ${p.materialLabel} from ${p.thetaStartC} °C to ${p.thetaMeltC} °C. [2]`
      : `Calculate the thermal energy released as the solidified ${p.materialLabel} cools from ${p.thetaMeltC} °C down to ${p.thetaStartC} °C. [2]`;

    const partAiiPrompt = showTargetTime
      ? `Show clearly that the actual time required for the ${p.heaterPowerW} W heater operating at ${effPct}% efficiency to warm the solid from ${p.thetaStartC} °C and melt it completely at ${p.thetaMeltC} °C is approximately ${showRoundedPrompt}. [2]`
      : `Show clearly that the total thermal energy required to warm the solid from ${p.thetaStartC} °C to ${p.thetaMeltC} °C and melt it completely is approximately ${showRoundedPrompt}. [2]`;

    const partAivKey = isHeating ? "thermalLossReason" : "coolingCurveFeature";
    const partAivPrompt = isHeating
      ? "State one physical reason why the measured heating time in the laboratory exceeds the ideal value calculated assuming perfect efficiency. [1]"
      : "Describe the shape of the cooling curve along QR and RS as the substance freezes and cools to ambient temperature. [1]";

    const parts: StructuredQuestionPart[] = [
      {
        partId: "a-i",
        prompt: partAiPrompt,
        marks: 2,
        targetQuantityKey: "warmingEnergyJ",
        expectedAnswer: `${fmt4(qWarmJ, "J")} ≈ ${fmt3(qWarmJ, "J")}`,
        workingSteps: [
          `Δθ = ${p.thetaMeltC} − ${p.thetaStartC} = ${dT} K`,
          `Q₁ = m c Δθ = ${p.massKg.toFixed(2)} × ${p.specificHeatSolidJKgK} × ${dT} = ${fmt4(qWarmJ, "J")} ≈ ${fmt3(qWarmJ, "J")}`,
        ],
      },
      {
        partId: "a-ii",
        prompt: partAiiPrompt,
        marks: 2,
        dependsOnPartIds: ["a-i"],
        targetQuantityKey: showKey,
        expectedAnswer: `${fmt4(showVal, showUnit)}, which rounds to ${showRoundedPrompt}`,
        workingSteps: showTargetTime
          ? [
              `Q_melt = m L_f = ${p.massKg.toFixed(2)} × ${fmt3(p.latentHeatFusionJKg)} = ${fmt4(qMeltJ, "J")}`,
              `Q_total = ${fmt4(qWarmJ)} + ${fmt4(qMeltJ)} = ${fmt4(qTotJ, "J")}`,
              `t = Q_total / (η P) = ${fmt4(qTotJ)} / (${p.thermalEfficiency.toFixed(2)} × ${p.heaterPowerW}) = ${fmt4(tActualS, "s")} ≈ ${showRoundedPrompt}`,
            ]
          : [
              `Q_melt = m L_f = ${p.massKg.toFixed(2)} × ${fmt3(p.latentHeatFusionJKg)} = ${fmt4(qMeltJ, "J")}`,
              `Q_total = Q₁ + Q_melt = ${fmt4(qWarmJ)} + ${fmt4(qMeltJ)} = ${fmt4(qTotJ, "J")} ≈ ${showRoundedPrompt}`,
            ],
      },
      {
        partId: "a-iii",
        prompt:
          "Referring to the horizontal phase-change plateau QR on the figure, explain in terms of molecular energies why the temperature stays constant while internal energy changes. [2]",
        marks: 2,
        targetMode: "qualitative",
        targetQuantityKey: "plateauEnergyExplanation",
        expectedAnswer: `During the plateau, ${String(q.plateauEnergyExplanation)}.`,
        workingSteps: [
          "State that temperature measures mean random molecular kinetic energy which stays constant.",
          "Explain that latent thermal energy changes intermolecular potential energy as bonds are broken or formed.",
        ],
      },
      {
        partId: "a-iv",
        prompt: partAivPrompt,
        marks: 1,
        targetMode: "qualitative",
        targetQuantityKey: partAivKey,
        expectedAnswer: `${String(q[partAivKey])}.`,
        workingSteps: [
          `Apply NCUK calorimetry observation: ${String(q[partAivKey])}.`,
        ],
      },
      {
        partId: "b-i",
        prompt: `Calculate the new pressure of the ideal gas in the ${p.vesselContext} at ${p.gasFinalTempC} °C using T / K = θ / °C + ${NCUK_KELVIN_OFFSET}. [2]`,
        marks: 2,
        targetQuantityKey: "finalGasPressureKPa",
        expectedAnswer: `${fmt4(p2KPa, "kPa")} ≈ ${fmt3(p2KPa, "kPa")}`,
        workingSteps: [
          `T₁ = ${p.gasInitialTempC} + ${NCUK_KELVIN_OFFSET} = ${tGas1K.toFixed(1)} K; T₂ = ${p.gasFinalTempC} + ${NCUK_KELVIN_OFFSET} = ${tGas2K.toFixed(1)} K`,
          `p₂ = p₁ (T₂ / T₁) = ${p.gasInitialPressureKPa} × (${tGas2K.toFixed(1)} / ${tGas1K.toFixed(1)}) = ${fmt4(p2KPa, "kPa")} ≈ ${fmt3(p2KPa, "kPa")}`,
        ],
      },
      {
        partId: "b-ii",
        prompt:
          "Explain in terms of kinetic theory and Newton's second law (without using the ideal gas equation) why heating the gas at constant volume increases its pressure. [1]",
        marks: 1,
        dependsOnPartIds: ["b-i"],
        targetMode: "qualitative",
        targetQuantityKey: "gasPressureMechanism",
        expectedAnswer: `Heating raises molecular speeds so ${String(q.gasPressureMechanism)}.`,
        workingSteps: [
          "Link higher molecular speed to larger momentum change per collision, higher collision frequency, and larger force per unit area.",
        ],
      },
    ];

    const markScheme: MarkSchemePoint[] = [
      {
        code: "M1",
        partId: "a-i",
        criterion: `Applies Q = m c Δθ = ${p.massKg.toFixed(2)} × ${p.specificHeatSolidJKgK} × ${dT}.`,
        marks: 1,
      },
      {
        code: "A1",
        partId: "a-i",
        criterion: `Correctly computes ${fmt3(qWarmJ, "J")} (4 s.f. ${fmt4(qWarmJ, "J")}).`,
        marks: 1,
      },
      {
        code: "M1",
        partId: "a-ii",
        criterion: showTargetTime
          ? `Computes Q_melt = ${fmt4(qMeltJ, "J")}, Q_total = ${fmt4(qTotJ, "J")}, and substitutes t = Q_total / (η P).`
          : `Computes latent energy Q_melt = ${fmt4(qMeltJ, "J")} and sums Q_warm + Q_melt.`,
        marks: 1,
      },
      {
        code: "A1",
        partId: "a-ii",
        criterion: `Shows 4 s.f. value ${fmt4(showVal, showUnit)} rounding cleanly to ${showRoundedPrompt}.`,
        marks: 1,
      },
      {
        code: "B1",
        partId: "a-iii",
        criterion:
          "States that temperature and mean molecular kinetic energy remain constant along the plateau.",
        marks: 1,
      },
      {
        code: "B1",
        partId: "a-iii",
        criterion:
          "Explains that intermolecular potential energy changes as bonds are weakened, broken, or formed.",
        marks: 1,
      },
      {
        code: "B1",
        partId: "a-iv",
        criterion: `States accurately that ${String(q[partAivKey])}.`,
        marks: 1,
      },
      {
        code: "M1",
        partId: "b-i",
        criterion: `Converts both temperatures using T = θ + ${NCUK_KELVIN_OFFSET} (${tGas1K.toFixed(1)} K and ${tGas2K.toFixed(1)} K) and applies p₂ = p₁ T₂ / T₁.`,
        marks: 1,
      },
      {
        code: "A1",
        partId: "b-i",
        criterion: `Evaluates final gas pressure = ${fmt3(p2KPa, "kPa")} (4 s.f. ${fmt4(p2KPa, "kPa")}).`,
        marks: 1,
      },
      {
        code: "B1",
        partId: "b-ii",
        criterion: `Explains via Newton second law that ${String(q.gasPressureMechanism)} (no credit for quoting pV = nRT alone).`,
        marks: 1,
      },
    ];

    const workedSolution = [
      `(a)(i) Q₁ = m c Δθ = ${p.massKg.toFixed(2)} × ${p.specificHeatSolidJKgK} × (${p.thetaMeltC} − ${p.thetaStartC}) = ${fmt4(qWarmJ, "J")} ≈ ${fmt3(qWarmJ, "J")}.`,
      `(a)(ii) Q_melt = m L_f = ${fmt4(qMeltJ, "J")}; Q_total = ${fmt4(qTotJ, "J")}${showTargetTime ? `; t = Q_total / (η P) = ${fmt4(tActualS, "s")} ≈ ${showRoundedPrompt}` : ` ≈ ${showRoundedPrompt}`}.`,
      `(a)(iii) ${String(q.plateauEnergyExplanation)}.`,
      `(a)(iv) ${String(q[partAivKey])}.`,
      `(b)(i) T₁ = ${tGas1K.toFixed(1)} K, T₂ = ${tGas2K.toFixed(1)} K, so p₂ = ${p.gasInitialPressureKPa} × (${tGas2K.toFixed(1)} / ${tGas1K.toFixed(1)}) = ${fmt4(p2KPa, "kPa")} ≈ ${fmt3(p2KPa, "kPa")}.`,
      `(b)(ii) ${String(q.gasPressureMechanism)}.`,
    ].join(" ");

    items.push({
      id: `${NCUK_QUAL_EXAM_ID_PREFIX}-ac3-10m-${String(i + 1).padStart(2, "0")}-${p.slug}`,
      conceptId: "specific-heat-latent-heat",
      templateArchetype: "ncuk-thermal-phase-cooling-gas-10m",
      seed,
      syllabi: ncukTag("ncuk-ac3", p.subtopicId, "IFY-S1"),
      format: "structured",
      difficulty: "higher",
      domain: "thermal",
      scenarioSpec,
      hiddenQuantities: [
        "warmingEnergyJ",
        "meltingEnergyJ",
        "totalThermalEnergyJ",
        "idealHeatingTimeS",
        "actualHeatingTimeS",
        "finalGasPressureKPa",
        "plateauEnergyExplanation",
        partAivKey,
        "gasPressureMechanism",
      ],
      requiredGivens: [
        { name: "massKg", value: p.massKg, unit: "kg", source: "stem" },
        {
          name: "specificHeatSolidJKgK",
          value: p.specificHeatSolidJKgK,
          unit: "J kg⁻¹ K⁻¹",
          source: "stem",
        },
        {
          name: "latentHeatFusionJKg",
          value: p.latentHeatFusionJKg,
          unit: "J kg⁻¹",
          source: "stem",
        },
        { name: "thetaStartC", value: p.thetaStartC, unit: "°C", source: "either" },
        { name: "thetaMeltC", value: p.thetaMeltC, unit: "°C", source: "either" },
        { name: "heaterPowerW", value: p.heaterPowerW, unit: "W", source: "stem" },
        {
          name: "thermalEfficiencyPercent",
          value: effPct,
          unit: "%",
          source: "stem",
        },
        {
          name: "gasInitialPressureKPa",
          value: p.gasInitialPressureKPa,
          unit: "kPa",
          source: "stem",
        },
        {
          name: "gasInitialTempC",
          value: p.gasInitialTempC,
          unit: "°C",
          source: "stem",
        },
        {
          name: "gasFinalTempC",
          value: p.gasFinalTempC,
          unit: "°C",
          source: "stem",
        },
      ],
      questionPlan: {
        targetSummary:
          "Ten-mark NCUK thermal flagship combining specific heat capacity, latent heat, plateau energy explanation, and Pressure Law with kinetic theory",
        subpartStrategy: parts.map(
          (pt) => `part (${pt.partId}): target ${pt.targetQuantityKey}`,
        ),
      },
      stem,
      parts,
      workedSolution,
      markScheme,
      totalMarks: 10,
      generatorModel,
    });
  }

  return items;
}

// ============================================================================
// BANK 5: 10-MARK IFYPH005 AC2 FLAGSHIP (synoptic-density-statics-energy-10m, 14x10m)
// ============================================================================

interface Synoptic10mVariantParam {
  readonly slug: string;
  readonly componentLabel: string;
  readonly hoistLabel: string;
  readonly geometryMode: SynopticGeometryMode;
  readonly outerWidthM: number;
  readonly innerOrHeightM: number;
  readonly lengthM: number;
  readonly densityKgM3: number;
  readonly cgFraction: number;
  readonly motorInputPowerW: number;
  readonly motorEfficiency: number;
  readonly subtopicId: "ncuk-ac2-5" | "ncuk-ac2-3";
}

const SYNOPTIC_10M_PARAMS: readonly Synoptic10mVariantParam[] = [
  // 7 semi-annular uniform channels (L/2 CG trap!)
  {
    slug: "stormwater-culvert",
    componentLabel: "precast concrete stormwater channel",
    hoistLabel: "portable site winch motor",
    geometryMode: "semi-annular-channel",
    outerWidthM: 0.2,
    innerOrHeightM: 0.12,
    lengthM: 2.8,
    densityKgM3: 2400,
    cgFraction: 0.5,
    motorInputPowerW: 420,
    motorEfficiency: 0.75,
    subtopicId: "ncuk-ac2-5",
  },
  {
    slug: "granite-drain-trough",
    componentLabel: "carved granite drainage trough",
    hoistLabel: "electric gantry hoist",
    geometryMode: "semi-annular-channel",
    outerWidthM: 0.24,
    innerOrHeightM: 0.14,
    lengthM: 2.4,
    densityKgM3: 2650,
    cgFraction: 0.5,
    motorInputPowerW: 540,
    motorEfficiency: 0.78,
    subtopicId: "ncuk-ac2-3",
  },
  {
    slug: "mortar-gutter-duct",
    componentLabel: "reinforced mortar rainwater gutter",
    hoistLabel: "workshop lifting winch",
    geometryMode: "semi-annular-channel",
    outerWidthM: 0.18,
    innerOrHeightM: 0.1,
    lengthM: 3.1,
    densityKgM3: 2250,
    cgFraction: 0.5,
    motorInputPowerW: 360,
    motorEfficiency: 0.72,
    subtopicId: "ncuk-ac2-5",
  },
  {
    slug: "basalt-runnel",
    componentLabel: "basalt roadside runnel section",
    hoistLabel: "mobile crane hoist motor",
    geometryMode: "semi-annular-channel",
    outerWidthM: 0.22,
    innerOrHeightM: 0.12,
    lengthM: 2.6,
    densityKgM3: 2780,
    cgFraction: 0.5,
    motorInputPowerW: 580,
    motorEfficiency: 0.8,
    subtopicId: "ncuk-ac2-3",
  },
  {
    slug: "polymer-cable-trough",
    componentLabel: "polymer-concrete cable duct",
    hoistLabel: "geared electric hoist",
    geometryMode: "semi-annular-channel",
    outerWidthM: 0.26,
    innerOrHeightM: 0.16,
    lengthM: 2.5,
    densityKgM3: 2150,
    cgFraction: 0.5,
    motorInputPowerW: 480,
    motorEfficiency: 0.76,
    subtopicId: "ncuk-ac2-5",
  },
  {
    slug: "stoneware-spillway",
    componentLabel: "glazed stoneware spillway channel",
    hoistLabel: "hydraulic-electric yard winch",
    geometryMode: "semi-annular-channel",
    outerWidthM: 0.19,
    innerOrHeightM: 0.11,
    lengthM: 3.4,
    densityKgM3: 2320,
    cgFraction: 0.5,
    motorInputPowerW: 450,
    motorEfficiency: 0.74,
    subtopicId: "ncuk-ac2-3",
  },
  {
    slug: "limestone-channel",
    componentLabel: "dressed limestone drainage channel",
    hoistLabel: "compact construction crane",
    geometryMode: "semi-annular-channel",
    outerWidthM: 0.25,
    innerOrHeightM: 0.15,
    lengthM: 3.0,
    densityKgM3: 2480,
    cgFraction: 0.5,
    motorInputPowerW: 620,
    motorEfficiency: 0.82,
    subtopicId: "ncuk-ac2-5",
  },
  // 7 rectangular structural slabs / non-uniform cast beams
  {
    slug: "precast-lintel-nonunif",
    componentLabel: "non-uniform reinforced concrete lintel",
    hoistLabel: "overhead workshop crane motor",
    geometryMode: "rectangular-slab",
    outerWidthM: 0.22,
    innerOrHeightM: 0.12,
    lengthM: 3.2,
    densityKgM3: 2420,
    cgFraction: 0.44,
    motorInputPowerW: 720,
    motorEfficiency: 0.8,
    subtopicId: "ncuk-ac2-3",
  },
  {
    slug: "quay-fender-slab",
    componentLabel: "uniform composite quay fender beam",
    hoistLabel: "dockside electric derrick",
    geometryMode: "rectangular-slab",
    outerWidthM: 0.28,
    innerOrHeightM: 0.14,
    lengthM: 2.9,
    densityKgM3: 1850,
    cgFraction: 0.5,
    motorInputPowerW: 680,
    motorEfficiency: 0.78,
    subtopicId: "ncuk-ac2-5",
  },
  {
    slug: "timber-bridge-sleeper",
    componentLabel: "non-uniform hardwood bridge sleeper",
    hoistLabel: "trackside battery winch",
    geometryMode: "rectangular-slab",
    outerWidthM: 0.26,
    innerOrHeightM: 0.16,
    lengthM: 2.6,
    densityKgM3: 1150,
    cgFraction: 0.42,
    motorInputPowerW: 340,
    motorEfficiency: 0.74,
    subtopicId: "ncuk-ac2-3",
  },
  {
    slug: "cast-iron-counterweight",
    componentLabel: "non-uniform cast-iron ballast bar",
    hoistLabel: "heavy foundry chain hoist",
    geometryMode: "rectangular-slab",
    outerWidthM: 0.16,
    innerOrHeightM: 0.08,
    lengthM: 2.2,
    densityKgM3: 7200,
    cgFraction: 0.45,
    motorInputPowerW: 850,
    motorEfficiency: 0.84,
    subtopicId: "ncuk-ac2-5",
  },
  {
    slug: "foundation-sill-uniform",
    componentLabel: "uniform precast foundation sill",
    hoistLabel: "site A-frame hoist motor",
    geometryMode: "rectangular-slab",
    outerWidthM: 0.24,
    innerOrHeightM: 0.11,
    lengthM: 3.5,
    densityKgM3: 2360,
    cgFraction: 0.5,
    motorInputPowerW: 760,
    motorEfficiency: 0.79,
    subtopicId: "ncuk-ac2-5",
  },
  {
    slug: "kerb-slab-nonunif",
    componentLabel: "taper-reinforced concrete kerb beam",
    hoistLabel: "roadworks lifting winch",
    geometryMode: "rectangular-slab",
    outerWidthM: 0.2,
    innerOrHeightM: 0.15,
    lengthM: 3.0,
    densityKgM3: 2450,
    cgFraction: 0.43,
    motorInputPowerW: 640,
    motorEfficiency: 0.77,
    subtopicId: "ncuk-ac2-3",
  },
  {
    slug: "steel-fibre-tie-beam",
    componentLabel: "uniform steel-fibre concrete tie beam",
    hoistLabel: "prefabrication hall hoist",
    geometryMode: "rectangular-slab",
    outerWidthM: 0.25,
    innerOrHeightM: 0.12,
    lengthM: 3.4,
    densityKgM3: 2520,
    cgFraction: 0.5,
    motorInputPowerW: 820,
    motorEfficiency: 0.85,
    subtopicId: "ncuk-ac2-5",
  },
];

function generateBank5Synoptic10m(
  baseSeed: number,
  generatorModel: string,
): CandidateQuestionInput[] {
  const items: CandidateQuestionInput[] = [];
  let offset = 700;

  for (let i = 0; i < SYNOPTIC_10M_PARAMS.length; i += 1) {
    const p = SYNOPTIC_10M_PARAMS[i];
    const seed = baseSeed + offset;
    offset += 1;

    const scenarioSpec: Record<string, unknown> = {
      kind: "synoptic-density-statics-energy-10m",
      geometryMode: p.geometryMode,
      outerWidthM: p.outerWidthM,
      innerOrHeightM: p.innerOrHeightM,
      lengthM: p.lengthM,
      densityKgM3: p.densityKgM3,
      cgFraction: p.cgFraction,
      motorInputPowerW: p.motorInputPowerW,
      motorEfficiency: p.motorEfficiency,
    };

    const q = solvePlugin("synoptic-density-statics-energy-10m", scenarioSpec);
    const areaM2 = Number(q.crossSectionAreaM2);
    const volM3 = Number(q.volumeM3);
    const massKg = Number(q.massKg);
    const weightN = Number(q.weightN);
    const cgDistM = Number(q.cgDistanceFromPivotM);
    const liftForceN = Number(q.liftForceN);
    const deltaGpeJ = Number(q.deltaGpeJ);
    const usefulPowerW = Number(q.usefulMotorPowerW);
    const liftTimeS = Number(q.liftTimeS);

    const isSemi = p.geometryMode === "semi-annular-channel";
    const isUniform = Math.abs(p.cgFraction - 0.5) < 1e-6;
    const outerCm = p.outerWidthM * 100;
    const innerCm = p.innerOrHeightM * 100;
    const effPct = Math.round(p.motorEfficiency * 100);
    const useThreeMarkA = i % 2 === 0;
    const partAMarks = useThreeMarkA ? 3 : 2;
    const partEMarks = useThreeMarkA ? 1 : 2;
    const massRounded3 = fmt3(massKg, "kg");

    const geomDesc = isSemi
      ? `semi-annular cross-section of outer diameter D = ${outerCm.toFixed(1)} cm and inner diameter d = ${innerCm.toFixed(1)} cm`
      : `rectangular cross-section of width w = ${outerCm.toFixed(1)} cm and thickness h = ${innerCm.toFixed(1)} cm`;
    const cgDesc = isUniform
      ? "The component is uniform along its length so its centre of gravity G lies at its midpoint."
      : `Internal reinforcement makes the component non-uniform so its centre of gravity G lies at distance x = ${cgDistM.toFixed(2)} m from end A (as shown).`;

    const stem = `A ${p.componentLabel} of length L = ${p.lengthM.toFixed(2)} m rests horizontally on level ground (take g = ${NCUK_GRAVITY_MS2} m s⁻²). As shown in the figure, it has a ${geomDesc} and average density ρ = ${p.densityKgM3} kg m⁻³. ${cgDesc} A ${p.hoistLabel} rated at electrical input power ${p.motorInputPowerW} W and efficiency ${effPct}% is later attached to end B to stand the component vertically upright on end A.`;

    const partEKey = useThreeMarkA
      ? "assumptionClassification"
      : "energyLossMechanism";
    const partEPrompt = useThreeMarkA
      ? "State one physical assumption made when using the gravitational potential energy change to calculate the minimum hoist time. [1]"
      : "Explain where wasted energy is dissipated in the hoist motor system and why the electrical energy supplied exceeds the gain in gravitational potential energy. [2]";

    const parts: StructuredQuestionPart[] = [
      {
        partId: "a",
        prompt: `Calculate the cross-sectional area and volume of the ${p.componentLabel}, and show clearly that its mass is approximately ${massRounded3}. [${partAMarks}]`,
        marks: partAMarks,
        targetQuantityKey: "massKg",
        expectedAnswer: `${fmt4(massKg, "kg")}, which rounds to ${massRounded3}`,
        workingSteps: isSemi
          ? [
              `A = ½ × (π / 4)(D² − d²) = (π / 8)(${p.outerWidthM.toFixed(2)}² − ${p.innerOrHeightM.toFixed(2)}²) = ${fmt4(areaM2, "m²")}`,
              `V = A L = ${fmt4(areaM2)} × ${p.lengthM.toFixed(2)} = ${fmt4(volM3, "m³")}`,
              `m = ρ V = ${p.densityKgM3} × ${fmt4(volM3)} = ${fmt4(massKg, "kg")} ≈ ${massRounded3}`,
            ]
          : [
              `A = w h = ${p.outerWidthM.toFixed(2)} × ${p.innerOrHeightM.toFixed(2)} = ${fmt4(areaM2, "m²")}`,
              `V = A L = ${fmt4(areaM2)} × ${p.lengthM.toFixed(2)} = ${fmt4(volM3, "m³")}`,
              `m = ρ V = ${p.densityKgM3} × ${fmt4(volM3)} = ${fmt4(massKg, "kg")} ≈ ${massRounded3}`,
            ],
      },
      {
        partId: "b",
        prompt:
          "By taking moments about end A, calculate the minimum vertical upward force F applied at end B required to just lift end B off the ground. [2]",
        marks: 2,
        dependsOnPartIds: ["a"],
        targetQuantityKey: "liftForceN",
        expectedAnswer: `${fmt4(liftForceN, "N")} ≈ ${fmt3(liftForceN, "N")}`,
        workingSteps: [
          `Weight W = m g = ${fmt4(massKg)} × ${NCUK_GRAVITY_MS2} = ${fmt4(weightN, "N")}`,
          `Moments about A: F × L = W × x_G → F = ${fmt4(weightN)} × (${fmt4(cgDistM)} / ${p.lengthM.toFixed(2)}) = ${fmt4(liftForceN, "N")} ≈ ${fmt3(liftForceN, "N")}`,
        ],
      },
      {
        partId: "c",
        prompt:
          "Neglecting the initial height of the centre of gravity above the ground, calculate the minimum work done (gain in gravitational potential energy) to rotate the component until it stands vertically upright on end A. [2]",
        marks: 2,
        dependsOnPartIds: ["a"],
        targetQuantityKey: "deltaGpeJ",
        expectedAnswer: `${fmt4(deltaGpeJ, "J")} ≈ ${fmt3(deltaGpeJ, "J")}`,
        workingSteps: [
          `Vertical rise of centre of gravity G is Δh = ${isUniform ? `L / 2 = ${fmt4(cgDistM, "m")}` : `x = ${fmt4(cgDistM, "m")}`}`,
          `ΔE_p = m g Δh = ${fmt4(massKg)} × ${NCUK_GRAVITY_MS2} × ${fmt4(cgDistM)} = ${fmt4(deltaGpeJ, "J")} ≈ ${fmt3(deltaGpeJ, "J")}`,
        ],
      },
      {
        partId: "d",
        prompt: `Calculate the minimum time taken for the ${p.motorInputPowerW} W hoist motor operating at ${effPct}% efficiency to stand the component upright. [2]`,
        marks: 2,
        dependsOnPartIds: ["c"],
        targetQuantityKey: "liftTimeS",
        expectedAnswer: `${fmt4(liftTimeS, "s")} ≈ ${fmt3(liftTimeS, "s")}`,
        workingSteps: [
          `Useful output power P_out = η P_in = ${p.motorEfficiency.toFixed(2)} × ${p.motorInputPowerW} = ${fmt4(usefulPowerW, "W")}`,
          `t = ΔE_p / P_out = ${fmt4(deltaGpeJ)} / ${fmt4(usefulPowerW)} = ${fmt4(liftTimeS, "s")} ≈ ${fmt3(liftTimeS, "s")}`,
        ],
      },
      {
        partId: "e",
        prompt: partEPrompt,
        marks: partEMarks,
        dependsOnPartIds: ["d"],
        targetMode: "qualitative",
        targetQuantityKey: partEKey,
        expectedAnswer: `${String(q[partEKey])}.`,
        workingSteps: [
          `Apply NCUK synoptic evaluation rubric: ${String(q[partEKey])}.`,
        ],
      },
    ];

    const markScheme: MarkSchemePoint[] = [
      ...(useThreeMarkA
        ? [
            {
              code: "M1",
              partId: "a",
              criterion: isSemi
                ? `Computes semi-annular cross-section A = (π/8)(D² − d²) = ${fmt4(areaM2, "m²")} with cm → m conversion.`
                : `Computes cross-section A = w h = ${fmt4(areaM2, "m²")} with cm → m conversion.`,
              marks: 1,
            },
            {
              code: "M1",
              partId: "a",
              criterion: `Calculates V = A L = ${fmt4(volM3, "m³")} and substitutes m = ρ V.`,
              marks: 1,
            },
            {
              code: "A1",
              partId: "a",
              criterion: `Shows 4 s.f. mass ${fmt4(massKg, "kg")} rounding clearly to ${massRounded3}.`,
              marks: 1,
            },
          ]
        : [
            {
              code: "M1",
              partId: "a",
              criterion: `Calculates cross-section A = ${fmt4(areaM2, "m²")}, volume V = ${fmt4(volM3, "m³")}, and applies m = ρ V.`,
              marks: 1,
            },
            {
              code: "A1",
              partId: "a",
              criterion: `Shows 4 s.f. mass ${fmt4(massKg, "kg")} confirming ${massRounded3}.`,
              marks: 1,
            },
          ]),
      {
        code: "M1",
        partId: "b",
        criterion: `Applies principle of moments about A: F × ${p.lengthM.toFixed(2)} = m g × ${fmt4(cgDistM)}.`,
        marks: 1,
      },
      {
        code: "A1",
        partId: "b",
        criterion: `Evaluates minimum lift force F = ${fmt3(liftForceN, "N")} (4 s.f. ${fmt4(liftForceN, "N")}).`,
        marks: 1,
      },
      {
        code: "M1",
        partId: "c",
        criterion: `Uses centre-of-gravity rise Δh = ${fmt4(cgDistM, "m")} (not full length L) in ΔE_p = m g Δh.`,
        marks: 1,
      },
      {
        code: "A1",
        partId: "c",
        criterion: `Obtains work done = ${fmt3(deltaGpeJ, "J")} (4 s.f. ${fmt4(deltaGpeJ, "J")}).`,
        marks: 1,
      },
      {
        code: "M1",
        partId: "d",
        criterion: `Applies useful power P_out = η P_in = ${fmt4(usefulPowerW, "W")} and t = ΔE_p / P_out.`,
        marks: 1,
      },
      {
        code: "A1",
        partId: "d",
        criterion: `Evaluates minimum hoist time = ${fmt3(liftTimeS, "s")} (4 s.f. ${fmt4(liftTimeS, "s")}).`,
        marks: 1,
      },
      ...(partEMarks === 1
        ? [
            {
              code: "B1",
              partId: "e",
              criterion: `States valid physical assumption: ${String(q[partEKey])}.`,
              marks: 1,
            },
          ]
        : [
            {
              code: "B1",
              partId: "e",
              criterion: `Identifies electrical heating in motor windings and mechanical friction in hoist gears.`,
              marks: 1,
            },
            {
              code: "B1",
              partId: "e",
              criterion: `Links losses to thermal energy dissipated to the surroundings (${String(q[partEKey])}).`,
              marks: 1,
            },
          ]),
    ];

    const hiddenQuantities = [
      "crossSectionAreaM2",
      "volumeM3",
      "massKg",
      "weightN",
      "liftForceN",
      "deltaGpeJ",
      "usefulMotorPowerW",
      "liftTimeS",
      partEKey,
    ];
    if (isUniform) {
      hiddenQuantities.push("cgDistanceFromPivotM");
    }

    const requiredGivens: RequiredGivenSpec[] = [
      { name: "outerWidthM", value: p.outerWidthM, unit: "m", source: "either" },
      {
        name: "innerOrHeightM",
        value: p.innerOrHeightM,
        unit: "m",
        source: "either",
      },
      { name: "lengthM", value: p.lengthM, unit: "m", source: "either" },
      {
        name: "densityKgM3",
        value: p.densityKgM3,
        unit: "kg m⁻³",
        source: "stem",
      },
      {
        name: "motorInputPowerW",
        value: p.motorInputPowerW,
        unit: "W",
        source: "stem",
      },
      {
        name: "motorEfficiencyPercent",
        value: effPct,
        unit: "%",
        source: "stem",
      },
    ];
    if (!isUniform) {
      requiredGivens.push({
        name: "cgDistanceFromPivotM",
        value: cgDistM,
        unit: "m",
        source: "either",
      });
    }

    const workedSolution = [
      `(a) A = ${fmt4(areaM2, "m²")}, V = A L = ${fmt4(volM3, "m³")}, m = ρ V = ${fmt4(massKg, "kg")} ≈ ${massRounded3}.`,
      `(b) W = ${fmt4(weightN, "N")}; taking moments about A gives F = W × (x_G / L) = ${fmt4(liftForceN, "N")} ≈ ${fmt3(liftForceN, "N")}.`,
      `(c) Centre of gravity rises by Δh = ${fmt4(cgDistM, "m")}, so ΔE_p = m g Δh = ${fmt4(deltaGpeJ, "J")} ≈ ${fmt3(deltaGpeJ, "J")}.`,
      `(d) Useful power P_out = ${p.motorEfficiency.toFixed(2)} × ${p.motorInputPowerW} = ${fmt4(usefulPowerW, "W")}, so t = ${fmt4(deltaGpeJ)} / ${fmt4(usefulPowerW)} = ${fmt4(liftTimeS, "s")} ≈ ${fmt3(liftTimeS, "s")}.`,
      `(e) ${String(q[partEKey])}.`,
    ].join(" ");

    items.push({
      id: `${NCUK_QUAL_EXAM_ID_PREFIX}-ac2-10m-${String(i + 1).padStart(2, "0")}-${p.slug}`,
      conceptId: p.subtopicId === "ncuk-ac2-3" ? "vectors-equilibrium-moments" : "work-energy-power",
      templateArchetype: "ncuk-synoptic-density-statics-energy-10m",
      seed,
      syllabi: ncukTag("ncuk-ac2", p.subtopicId, "IFY-S1"),
      format: "structured",
      difficulty: "higher",
      domain: "mechanics",
      scenarioSpec,
      hiddenQuantities,
      requiredGivens,
      questionPlan: {
        targetSummary:
          "Ten-mark NCUK synoptic mechanics flagship combining density volume mass, lifting moments, centre-of-gravity rise gravitational potential energy work, motor efficiency time, and qualitative loss evaluation",
        subpartStrategy: parts.map(
          (pt) => `part (${pt.partId}): target ${pt.targetQuantityKey}`,
        ),
      },
      stem,
      parts,
      workedSolution,
      markScheme,
      totalMarks: 10,
      generatorModel,
    });
  }

  return items;
}

/**
 * Generates ~196 authentic NCUK IFYPH005 qualitative/conceptual MCQs, 2m/4m short
 * structured items (canonical definitions, Explain, Sketch-describe, Without
 * calculation), AC1.2 suppressed-origin graphing & uncertainty items, and
 * 28 ten-mark AC3/AC2 flagship structured problems.
 */
export function generateNcukQualitativeExamCandidates(
  options: GenerateNcukQualitativeExamOptions = {},
): CandidateQuestionInput[] {
  const baseSeed = options.baseSeed ?? NCUK_QUAL_EXAM_DEFAULT_BASE_SEED;
  if (!Number.isInteger(baseSeed)) {
    throw new Error(`baseSeed must be an integer; received ${String(baseSeed)}`);
  }
  const generatorModel =
    options.generatorModel?.trim() || NCUK_QUAL_EXAM_DEFAULT_MODEL;

  return [
    ...generateBank1QualitativeMcqs(baseSeed, generatorModel),
    ...generateBank2ShortStructured(baseSeed, generatorModel),
    ...generateBank3Ac1Graphs(baseSeed, generatorModel),
    ...generateBank4Thermal10m(baseSeed, generatorModel),
    ...generateBank5Synoptic10m(baseSeed, generatorModel),
  ];
}
