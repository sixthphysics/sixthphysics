import type {
  DomainKindFieldSpec,
  DomainKindPlugin,
  DomainRenderOptions,
  DomainRenderOutput,
  DomainSolveOutput,
  DomainValidationResult,
} from "@/lib/bank-pipeline/domain-registry";
import type { VerifiedQuantityMap } from "@/lib/bank-pipeline/types";

/* -------------------------------------------------------------------------- */
/*  Official AQA GCE Physics Data Sheet Constants (v1.5, Sections 3.1-3.5)    */
/* -------------------------------------------------------------------------- */

export const AQA_G_MS2 = 9.81;
export const AQA_C_MS = 3.0e8;
export const AQA_E_C = 1.6e-19;
export const AQA_H_JS = 6.63e-34;
export const AQA_ME_KG = 9.11e-31;
export const AQA_ME_MEV = 0.511;
export const AQA_MP_KG = 1.673e-27;
export const AQA_MP_MEV = 938.257;
export const AQA_MN_KG = 1.675e-27;
export const AQA_MN_MEV = 939.551;
export const AQA_U_KG = 1.661e-27;
export const AQA_U_MEV = 931.5;
export const AQA_E_OVER_ME = 1.76e11;
export const AQA_E_OVER_MP = 9.58e7;
export const AQA_MU_MEV = 105.659;
export const AQA_PI_CHARGED_MEV = 139.576;
export const AQA_PI_ZERO_MEV = 134.972;
export const AQA_K_CHARGED_MEV = 493.821;
export const AQA_K_ZERO_MEV = 497.762;
export const AQA_MEV_TO_J = 1.6e-13;

export const ALEVEL_CORE_AS_RENDERER_VERSION =
  "sixthphysics/alevel-core-as-svg/1.0.0";

export const ALEVEL_CORE_AS_SCENARIO_KINDS = [
  "al-as-si-base-fermi-estimation",
  "al-as-specific-charge-nuclide",
  "al-as-strong-nuclear-force",
  "al-as-pair-prod-annihilation",
  "al-as-feynman-interactions",
  "al-as-hadron-lepton-conservation",
  "al-as-photoelectric-wave-failure",
  "al-as-fluorescent-spectra-ediff",
  "al-as-polarisation-stationary-waves",
  "al-as-white-light-diffraction",
  "al-as-optical-fibre-dispersion",
  "al-as-terminal-velocity-n3l-impulse",
  "al-as-stress-strain-materials",
  "al-as-superconductivity-tc",
  "al-as-nonohmic-iv-microscopic",
] as const;

export type AlevelCoreAsScenarioKind =
  (typeof ALEVEL_CORE_AS_SCENARIO_KINDS)[number];

/* -------------------------------------------------------------------------- */
/*  Shared Validation, Number Formatting & Crisp SVG Helpers                  */
/* -------------------------------------------------------------------------- */

const SVG_FONT =
  "'Plus Jakarta Sans', 'Segoe UI', Helvetica, Arial, sans-serif";
const SVG_W = 640;
const SVG_H = 360;

const SUP_MAP: Readonly<Record<string, string>> = {
  "-": "⁻",
  "+": "⁺",
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

const SUB_MAP: Readonly<Record<string, string>> = {
  "0": "₀",
  "1": "₁",
  "2": "₂",
  "3": "₃",
  "4": "₄",
  "5": "₅",
  "6": "₆",
  "7": "₇",
  "8": "₈",
  "9": "₉",
};

function toSup(raw: string | number): string {
  return [...String(raw)].map((ch) => SUP_MAP[ch] ?? ch).join("");
}

function toSub(raw: string | number): string {
  return [...String(raw)].map((ch) => SUB_MAP[ch] ?? ch).join("");
}

function isFiniteNum(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function isPosNum(v: unknown): v is number {
  return isFiniteNum(v) && v > 0;
}

function isNonNegNum(v: unknown): v is number {
  return isFiniteNum(v) && v >= 0;
}

function isIntInRange(v: unknown, min: number, max: number): v is number {
  return isFiniteNum(v) && Number.isInteger(v) && v >= min && v <= max;
}

function isStringOneOf<T extends string>(
  v: unknown,
  allowed: readonly T[],
): v is T {
  return typeof v === "string" && (allowed as readonly string[]).includes(v);
}

function esc(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function fc(v: number): string {
  const r = Math.round(v * 100) / 100;
  return Object.is(r, -0) ? "0" : String(r);
}

function fmtTick(v: number): string {
  if (Math.abs(v) < 1e-9) return "0";
  const r = Math.round(v * 1000) / 1000;
  return r < 0 ? `−${String(Math.abs(r))}` : String(r);
}

function fmtClean(v: number, sf = 3): string {
  if (!Number.isFinite(v) || Math.abs(v) < 1e-35) return "0";
  const sign = v < 0 ? "−" : "";
  const abs = Math.abs(v);
  const rounded = Number(abs.toPrecision(sf));
  if (rounded >= 1e-2 && rounded < 1e4) {
    if (Number.isInteger(rounded) && rounded >= 10) return `${sign}${rounded}`;
    return `${sign}${abs.toPrecision(sf)}`;
  }
  let exp = Math.floor(Math.log10(abs));
  let mant = abs / 10 ** exp;
  if (Number(mant.toPrecision(sf)) >= 10) {
    exp += 1;
    mant /= 10;
  }
  return `${sign}${mant.toPrecision(sf)} × 10${toSup(exp)}`;
}

function getHiddenSet(
  spec: Record<string, unknown>,
  options?: DomainRenderOptions,
): Set<string> {
  const hidden = new Set<string>();
  const addAll = (arr: unknown) => {
    if (!Array.isArray(arr)) return;
    for (const item of arr) {
      if (typeof item === "string" && item.trim()) {
        hidden.add(item.trim());
      }
    }
  };
  addAll(spec.hiddenQuantities);
  if (
    spec.visibility !== null &&
    typeof spec.visibility === "object" &&
    !Array.isArray(spec.visibility)
  ) {
    addAll((spec.visibility as { hiddenQuantities?: unknown }).hiddenQuantities);
  }
  addAll(options?.hiddenQuantities);
  return hidden;
}

function wrapSvg(
  title: string,
  ariaLabel: string,
  defs: string,
  body: string,
): string {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${SVG_W}" height="${SVG_H}" viewBox="0 0 ${SVG_W} ${SVG_H}" role="img" aria-label="${esc(ariaLabel)}">`,
    `<title>${esc(title)}</title>`,
    defs ? `<defs>${defs}</defs>` : "",
    `<rect width="100%" height="100%" fill="#ffffff"/>`,
    `<g font-family="${SVG_FONT}">`,
    body,
    `</g>`,
    `</svg>`,
  ]
    .filter(Boolean)
    .join("");
}

function arrowMarkerDef(id: string, color: string): string {
  return `<marker id="${id}" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto-start-reverse"><path d="M 0 1 L 10 5 L 0 9 z" fill="${color}"/></marker>`;
}

function wavyPath(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  waves: number,
  amp: number,
): string {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return `M ${fc(x1)} ${fc(y1)}`;
  const ux = dx / len;
  const uy = dy / len;
  const nx = -uy;
  const ny = ux;
  const steps = Math.max(24, waves * 12);
  const pts: string[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const s = Math.sin(t * waves * 2 * Math.PI) * amp;
    const px = x1 + dx * t + nx * s;
    const py = y1 + dy * t + ny * s;
    pts.push(`${i === 0 ? "M" : "L"} ${fc(px)} ${fc(py)}`);
  }
  return pts.join(" ");
}

function subLabel(base: string, sub: string, fontSize = 13): string {
  const subSize = Math.max(9, Math.round(fontSize * 0.72));
  return `${esc(base)}<tspan font-size="${subSize}" dy="3.5">${esc(sub)}</tspan>`;
}

/* -------------------------------------------------------------------------- */
/*  1. al-as-si-base-fermi-estimation (Section 3.1, pure-calculation)         */
/* -------------------------------------------------------------------------- */

export interface DimensionalEntry {
  readonly quantityKey: string;
  readonly symbol: string;
  readonly label: string;
  readonly definingRelation: string;
  readonly expKg: number;
  readonly expM: number;
  readonly expS: number;
  readonly expA: number;
  readonly baseUnitString: string;
  readonly baseUnitWords: string;
}

export const SI_DIMENSIONAL_TABLE: Readonly<Record<string, DimensionalEntry>> = {
  joule: {
    quantityKey: "joule",
    symbol: "J",
    label: "Work or Energy (joule)",
    definingRelation: "W = F s",
    expKg: 1,
    expM: 2,
    expS: -2,
    expA: 0,
    baseUnitString: "kg m² s⁻²",
    baseUnitWords: "kilogram metre squared per second squared",
  },
  watt: {
    quantityKey: "watt",
    symbol: "W",
    label: "Power (watt)",
    definingRelation: "P = E / t",
    expKg: 1,
    expM: 2,
    expS: -3,
    expA: 0,
    baseUnitString: "kg m² s⁻³",
    baseUnitWords: "kilogram metre squared per second cubed",
  },
  volt: {
    quantityKey: "volt",
    symbol: "V",
    label: "Potential difference (volt)",
    definingRelation: "V = W / Q",
    expKg: 1,
    expM: 2,
    expS: -3,
    expA: -1,
    baseUnitString: "kg m² s⁻³ A⁻¹",
    baseUnitWords: "kilogram metre squared per second cubed per ampere",
  },
  ohm: {
    quantityKey: "ohm",
    symbol: "Ω",
    label: "Electrical resistance (ohm)",
    definingRelation: "R = V / I",
    expKg: 1,
    expM: 2,
    expS: -3,
    expA: -2,
    baseUnitString: "kg m² s⁻³ A⁻²",
    baseUnitWords: "kilogram metre squared per second cubed per ampere squared",
  },
  pascal: {
    quantityKey: "pascal",
    symbol: "Pa",
    label: "Pressure or Stress (pascal)",
    definingRelation: "p = F / A",
    expKg: 1,
    expM: -1,
    expS: -2,
    expA: 0,
    baseUnitString: "kg m⁻¹ s⁻²",
    baseUnitWords: "kilogram per metre per second squared",
  },
  planck: {
    quantityKey: "planck",
    symbol: "h",
    label: "Planck constant (J s)",
    definingRelation: "h = E / f",
    expKg: 1,
    expM: 2,
    expS: -1,
    expA: 0,
    baseUnitString: "kg m² s⁻¹",
    baseUnitWords: "kilogram metre squared per second",
  },
  "spring-k": {
    quantityKey: "spring-k",
    symbol: "k",
    label: "Spring constant (N m⁻¹)",
    definingRelation: "k = F / ΔL",
    expKg: 1,
    expM: 0,
    expS: -2,
    expA: 0,
    baseUnitString: "kg s⁻²",
    baseUnitWords: "kilogram per second squared",
  },
  "young-modulus": {
    quantityKey: "young-modulus",
    symbol: "E",
    label: "Young modulus (Pa)",
    definingRelation: "E = σ / ε",
    expKg: 1,
    expM: -1,
    expS: -2,
    expA: 0,
    baseUnitString: "kg m⁻¹ s⁻²",
    baseUnitWords: "kilogram per metre per second squared",
  },
};

export interface FermiScenarioEntry {
  readonly key: string;
  readonly title: string;
  readonly parameterSummary: string;
  readonly estimateValue: number;
  readonly unit: string;
  readonly orderOfMagnitude: number;
  readonly orderLabel: string;
}

export const FERMI_SCENARIO_TABLE: Readonly<Record<string, FermiScenarioEntry>> =
  {
    "sprinter-ke": {
      key: "sprinter-ke",
      title: "Adult sprinter kinetic energy",
      parameterSummary: "m ≈ 75 kg, v ≈ 9 m s⁻¹",
      estimateValue: 0.5 * 75 * 81,
      unit: "J",
      orderOfMagnitude: 3,
      orderLabel: "order of magnitude three joules",
    },
    "vertical-jump-speed": {
      key: "vertical-jump-speed",
      title: "Human standing vertical jump take-off speed",
      parameterSummary: "h ≈ 0.5 m, g = 9.81 m s⁻²",
      estimateValue: Math.sqrt(2 * AQA_G_MS2 * 0.5),
      unit: "m s⁻¹",
      orderOfMagnitude: 0,
      orderLabel: "order of magnitude zero metres per second",
    },
    "raindrop-mass": {
      key: "raindrop-mass",
      title: "Typical spherical raindrop mass",
      parameterSummary: "r ≈ 1.5 mm, ρ ≈ 1000 kg m⁻³",
      estimateValue: (4 / 3) * Math.PI * (1.5e-3) ** 3 * 1000,
      unit: "kg",
      orderOfMagnitude: -5,
      orderLabel: "order of magnitude minus five kilograms",
    },
    "car-momentum": {
      key: "car-momentum",
      title: "Family car cruising momentum on a motorway",
      parameterSummary: "m ≈ 1200 kg, v ≈ 30 m s⁻¹",
      estimateValue: 1200 * 30,
      unit: "kg m s⁻¹",
      orderOfMagnitude: 4,
      orderLabel: "order of magnitude four newton seconds",
    },
    "classroom-air-mass": {
      key: "classroom-air-mass",
      title: "Mass of air inside a school laboratory",
      parameterSummary: "V ≈ 200 m³, ρ ≈ 1.2 kg m⁻³",
      estimateValue: 200 * 1.2,
      unit: "kg",
      orderOfMagnitude: 2,
      orderLabel: "order of magnitude two kilograms",
    },
    "copper-wire-resistance": {
      key: "copper-wire-resistance",
      title: "Resistance of a 1 m laboratory copper lead",
      parameterSummary: "L ≈ 1 m, d ≈ 1 mm, ρ ≈ 1.7 × 10⁻⁸ Ω m",
      estimateValue: 1.7e-8 / (Math.PI * (0.5e-3) ** 2),
      unit: "Ω",
      orderOfMagnitude: -2,
      orderLabel: "order of magnitude minus two ohms",
    },
  };

export interface PrecisionErrorEntry {
  readonly key: string;
  readonly pattern: "hh" | "hl" | "lh" | "ll";
  readonly classification: string;
  readonly remedy: string;
  readonly definitionRule: string;
}

export const PRECISION_ERROR_TABLE: Readonly<Record<string, PrecisionErrorEntry>> =
  {
    "high-prec-high-acc": {
      key: "high-prec-high-acc",
      pattern: "hh",
      classification: "high precision and high accuracy",
      remedy: "maintain calibration and repeat measurements to confirm stability",
      definitionRule:
        "readings are closely grouped around the mean and close to the true value",
    },
    "high-prec-low-acc": {
      key: "high-prec-low-acc",
      pattern: "hl",
      classification: "high precision with systematic error and low accuracy",
      remedy: "identify and subtract zero error or recalibrate the instrument",
      definitionRule:
        "systematic error shifts all readings by a fixed amount and is not reduced by repeating measurements",
    },
    "low-prec-high-acc": {
      key: "low-prec-high-acc",
      pattern: "lh",
      classification: "low precision with random error and accurate mean",
      remedy: "repeat measurements discard anomalies and calculate the mean",
      definitionRule:
        "random error produces unpredictable scatter around the true value reduced by taking repeats and a mean",
    },
    "low-prec-low-acc": {
      key: "low-prec-low-acc",
      pattern: "ll",
      classification: "low precision and low accuracy",
      remedy:
        "eliminate zero offset and repeat measurements to calculate a mean",
      definitionRule:
        "both systematic offset and large random spread are present in the dataset",
    },
  };

const SI_MODES = ["dimensional", "fermi", "precision-accuracy"] as const;

const siBaseFermiPlugin: DomainKindPlugin = {
  domain: "pure-calculation",
  kind: "al-as-si-base-fermi-estimation",
  summary:
    "Section 3.1 SI base unit dimensional decomposition, Fermi order-of-magnitude estimation, and precision/accuracy/error classification.",
  requiredFields: [
    { name: "kind", type: "string", enumValues: ["al-as-si-base-fermi-estimation"] },
    { name: "mode", type: "string", enumValues: SI_MODES },
    {
      name: "entryKey",
      type: "string",
      notes: "Key into dimensional, Fermi, or precision-accuracy table for the selected mode.",
    },
  ],
  physicalConstraints: [
    "entryKey must exist in the lookup table matching mode.",
    "SI base units strictly use kg, m, s, A with negative-index notation.",
  ],
  probeSpecs: [
    {
      kind: "al-as-si-base-fermi-estimation",
      mode: "dimensional",
      entryKey: "spring-k",
    },
    {
      kind: "al-as-si-base-fermi-estimation",
      mode: "precision-accuracy",
      entryKey: "high-prec-low-acc",
    },
    {
      kind: "al-as-si-base-fermi-estimation",
      mode: "fermi",
      entryKey: "sprinter-ke",
    },
  ],
  validate(spec): DomainValidationResult {
    const issues: string[] = [];
    if (spec.kind !== "al-as-si-base-fermi-estimation") {
      issues.push('kind must be "al-as-si-base-fermi-estimation"');
    }
    if (!isStringOneOf(spec.mode, SI_MODES)) {
      issues.push(`mode must be one of ${SI_MODES.join(", ")}`);
    }
    const key = typeof spec.entryKey === "string" ? spec.entryKey : "";
    if (spec.mode === "dimensional" && !(key in SI_DIMENSIONAL_TABLE)) {
      issues.push(`Unknown dimensional entryKey "${key}"`);
    }
    if (spec.mode === "fermi" && !(key in FERMI_SCENARIO_TABLE)) {
      issues.push(`Unknown fermi entryKey "${key}"`);
    }
    if (spec.mode === "precision-accuracy" && !(key in PRECISION_ERROR_TABLE)) {
      issues.push(`Unknown precision-accuracy entryKey "${key}"`);
    }
    return { valid: issues.length === 0, issues };
  },
  solve(spec): DomainSolveOutput {
    const mode = spec.mode as (typeof SI_MODES)[number];
    const key = spec.entryKey as string;
    if (mode === "dimensional") {
      const entry = SI_DIMENSIONAL_TABLE[key];
      return {
        solverId: "sixthphysics/al-as-si-base-fermi/1.0.0",
        quantities: {
          expKg: entry.expKg,
          expM: entry.expM,
          expS: entry.expS,
          expA: entry.expA,
          baseUnitString: entry.baseUnitString,
          baseUnitWords: entry.baseUnitWords,
          definingRelation: entry.definingRelation,
        },
        publicLabels: [entry.label, entry.symbol],
      };
    }
    if (mode === "fermi") {
      const entry = FERMI_SCENARIO_TABLE[key];
      return {
        solverId: "sixthphysics/al-as-si-base-fermi/1.0.0",
        quantities: {
          estimateValue: entry.estimateValue,
          orderOfMagnitude: entry.orderOfMagnitude,
          orderPowerValue: 10 ** entry.orderOfMagnitude,
          orderLabel: entry.orderLabel,
        },
        publicLabels: [entry.title],
      };
    }
    const entry = PRECISION_ERROR_TABLE[key];
    return {
      solverId: "sixthphysics/al-as-si-base-fermi/1.0.0",
      quantities: {
        errorClassification: entry.classification,
        remedyRule: entry.remedy,
        definitionRule: entry.definitionRule,
      },
    };
  },
  renderSvg(spec, options): DomainRenderOutput {
    const hidden = getHiddenSet(spec, options);
    const mode = spec.mode as (typeof SI_MODES)[number];
    const key = spec.entryKey as string;
    const publicNumbers: number[] = [];
    const publicLabels: string[] = [];

    if (mode === "precision-accuracy") {
      const entry = PRECISION_ERROR_TABLE[key];
      const cx = 220;
      const cy = 190;
      const shots: Record<
        "hh" | "hl" | "lh" | "ll",
        readonly [number, number][]
      > = {
        hh: [
          [-6, -4],
          [5, -7],
          [7, 4],
          [-4, 6],
          [1, 0],
          [-2, -9],
        ],
        hl: [
          [44, -40],
          [52, -45],
          [48, -32],
          [56, -37],
          [41, -35],
          [50, -49],
        ],
        lh: [
          [-48, -28],
          [52, -20],
          [-30, 44],
          [38, 36],
          [4, -50],
          [-12, 16],
        ],
        ll: [
          [18, -72],
          [74, -55],
          [32, -16],
          [82, -18],
          [55, -80],
          [48, -40],
        ],
      };
      const pts = shots[entry.pattern];
      const rings = [98, 72, 46, 20]
        .map(
          (r, idx) =>
            `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${idx === 3 ? "#dbeafe" : idx % 2 === 0 ? "#f8fafc" : "#ffffff"}" stroke="#94a3b8" stroke-width="1.5"/>`,
        )
        .join("");
      const dots = pts
        .map(
          ([dx, dy]) =>
            `<circle cx="${fc(cx + dx)}" cy="${fc(cy + dy)}" r="5" fill="#dc2626" stroke="#ffffff" stroke-width="1.2"/>`,
        )
        .join("");
      const maskSummary =
        hidden.has("errorClassification") ||
        hidden.has("remedyRule") ||
        hidden.has("definitionRule");
      const statusText = maskSummary
        ? "Classify scatter and offset"
        : entry.classification;
      const body = [
        `<text x="320" y="34" text-anchor="middle" font-size="16" font-weight="700" fill="#0f172a">Repeated Measurement Target Distribution</text>`,
        rings,
        `<line x1="${cx - 108}" y1="${cy}" x2="${cx + 108}" y2="${cy}" stroke="#cbd5e1" stroke-width="1" stroke-dasharray="4 4"/>`,
        `<line x1="${cx}" y1="${cy - 108}" x2="${cx}" y2="${cy + 108}" stroke="#cbd5e1" stroke-width="1" stroke-dasharray="4 4"/>`,
        `<circle cx="${cx}" cy="${cy}" r="3.5" fill="#1d4ed8"/>`,
        dots,
        `<rect x="374" y="106" width="226" height="168" rx="10" fill="#f8fafc" stroke="#cbd5e1" stroke-width="1.5"/>`,
        `<text x="392" y="134" font-size="13" font-weight="700" fill="#0f172a">Key</text>`,
        `<circle cx="400" cy="160" r="4.5" fill="#1d4ed8"/>`,
        `<text x="414" y="164" font-size="12.5" fill="#334155">Centre: true value</text>`,
        `<circle cx="400" cy="188" r="5" fill="#dc2626"/>`,
        `<text x="414" y="192" font-size="12.5" fill="#334155">Red dots: repeated readings</text>`,
        `<line x1="392" y1="212" x2="582" y2="212" stroke="#e2e8f0" stroke-width="1"/>`,
        `<text x="392" y="236" font-size="12" font-weight="600" fill="#475569">Assessment:</text>`,
        `<text x="392" y="256" font-size="12" fill="#0f172a">${esc(statusText)}</text>`,
      ].join("");
      return {
        visualFamily: "graphs",
        svgMarkup: wrapSvg(
          "Measurement target distribution schematic",
          "Target diagram displaying repeated experimental readings relative to the true value",
          "",
          body,
        ),
        rendererVersion: ALEVEL_CORE_AS_RENDERER_VERSION,
        publicNumbers,
        publicLabels,
      };
    }

    if (mode === "dimensional") {
      const entry = SI_DIMENSIONAL_TABLE[key];
      const hideBase =
        hidden.has("baseUnitString") ||
        hidden.has("baseUnitWords") ||
        hidden.has("expKg") ||
        hidden.has("expM") ||
        hidden.has("expS") ||
        hidden.has("expA");
      publicLabels.push(entry.label, entry.symbol, entry.definingRelation);
      const defs = arrowMarkerDef("arr-si", "#1d4ed8");
      const body = [
        `<text x="320" y="38" text-anchor="middle" font-size="16" font-weight="700" fill="#0f172a">SI Base Unit Reduction Pipeline</text>`,
        `<rect x="44" y="114" width="160" height="122" rx="10" fill="#eff6ff" stroke="#1d4ed8" stroke-width="2"/>`,
        `<text x="124" y="144" text-anchor="middle" font-size="12" font-weight="600" fill="#1e40af">Derived Quantity</text>`,
        `<text x="124" y="182" text-anchor="middle" font-size="24" font-weight="700" fill="#0f172a">${esc(entry.symbol)}</text>`,
        `<text x="124" y="214" text-anchor="middle" font-size="11.5" fill="#334155">${esc(entry.label)}</text>`,
        `<line x1="208" y1="175" x2="246" y2="175" stroke="#1d4ed8" stroke-width="2.2" marker-end="url(#arr-si)"/>`,
        `<rect x="252" y="114" width="142" height="122" rx="10" fill="#f8fafc" stroke="#64748b" stroke-width="1.8"/>`,
        `<text x="323" y="144" text-anchor="middle" font-size="12" font-weight="600" fill="#334155">Defining Relation</text>`,
        `<text x="323" y="184" text-anchor="middle" font-size="18" font-weight="700" fill="#0f172a">${esc(entry.definingRelation)}</text>`,
        `<text x="323" y="214" text-anchor="middle" font-size="11.5" fill="#475569">Substitute base SI</text>`,
        `<line x1="398" y1="175" x2="436" y2="175" stroke="#1d4ed8" stroke-width="2.2" marker-end="url(#arr-si)"/>`,
        `<rect x="442" y="114" width="160" height="122" rx="10" fill="#ecfdf5" stroke="#047857" stroke-width="2"/>`,
        `<text x="522" y="144" text-anchor="middle" font-size="12" font-weight="600" fill="#065f46">SI Base Units</text>`,
        `<text x="522" y="184" text-anchor="middle" font-size="17" font-weight="700" fill="#0f172a">${esc(hideBase ? "?" : entry.baseUnitString)}</text>`,
        `<text x="522" y="214" text-anchor="middle" font-size="11.5" fill="#334155">kg, m, s, A</text>`,
        `<text x="320" y="294" text-anchor="middle" font-size="12.5" fill="#475569">Express the quantity purely in coherent SI base units using negative indices.</text>`,
      ].join("");
      return {
        visualFamily: "pure-calculation",
        svgMarkup: wrapSvg(
          "SI base unit reduction diagram",
          "Flow diagram converting a derived physics unit into SI base units",
          defs,
          body,
        ),
        rendererVersion: ALEVEL_CORE_AS_RENDERER_VERSION,
        publicNumbers,
        publicLabels,
      };
    }

    // Fermi order-of-magnitude ruler
    const entry = FERMI_SCENARIO_TABLE[key];
    const hideFermi =
      hidden.has("orderOfMagnitude") ||
      hidden.has("orderPowerValue") ||
      hidden.has("estimateValue") ||
      hidden.has("orderLabel");
    publicLabels.push(entry.title);
    const ticks = [-6, -4, -2, 0, 2, 4, 6];
    const tickEls = ticks
      .map((exp, idx) => {
        const x = 80 + idx * 80;
        const lbl = `10${toSup(exp)}`;
        publicLabels.push(lbl);
        return `<line x1="${x}" y1="210" x2="${x}" y2="226" stroke="#334155" stroke-width="1.8"/><text x="${x}" y="248" text-anchor="middle" font-size="12.5" fill="#334155">${esc(lbl)}</text>`;
      })
      .join("");
    const markerX = 80 + ((entry.orderOfMagnitude + 6) / 12) * 480;
    const body = [
      `<text x="320" y="40" text-anchor="middle" font-size="16" font-weight="700" fill="#0f172a">Order-of-Magnitude Estimation Scale</text>`,
      `<rect x="70" y="66" width="500" height="74" rx="10" fill="#f8fafc" stroke="#cbd5e1" stroke-width="1.5"/>`,
      `<text x="320" y="96" text-anchor="middle" font-size="14" font-weight="700" fill="#0f172a">${esc(entry.title)}</text>`,
      `<text x="320" y="122" text-anchor="middle" font-size="12.5" fill="#475569">Estimate the nearest power of ten in ${esc(entry.unit)}</text>`,
      `<line x1="70" y1="218" x2="570" y2="218" stroke="#0f172a" stroke-width="2.4"/>`,
      tickEls,
      hideFermi
        ? `<text x="320" y="188" text-anchor="middle" font-size="15" font-weight="700" fill="#1d4ed8">Target order of magnitude = 10ⁿ (find n)</text>`
        : `<circle cx="${fc(markerX)}" cy="218" r="7" fill="#dc2626"/><text x="${fc(markerX)}" y="192" text-anchor="middle" font-size="13.5" font-weight="700" fill="#dc2626">10${toSup(entry.orderOfMagnitude)} ${esc(entry.unit)}</text>`,
    ].join("");
    return {
      visualFamily: "pure-calculation",
      svgMarkup: wrapSvg(
        "Order-of-magnitude estimation scale",
        "Logarithmic power-of-ten scale for order-of-magnitude estimation",
        "",
        body,
      ),
      rendererVersion: ALEVEL_CORE_AS_RENDERER_VERSION,
      publicNumbers,
      publicLabels,
    };
  },
};

/* -------------------------------------------------------------------------- */
/*  2. al-as-specific-charge-nuclide (Section 3.2.1, quantum-nuclear)         */
/* -------------------------------------------------------------------------- */

const SPECIES_MODES = ["nucleus", "cation", "anion"] as const;
const MASS_MODELS = ["nucleon-exact", "unified-u"] as const;
const DECAY_MODES = [
  "none",
  "alpha",
  "beta-minus",
  "beta-plus",
  "electron-capture",
] as const;

const specificChargePlugin: DomainKindPlugin = {
  domain: "quantum-nuclear",
  kind: "al-as-specific-charge-nuclide",
  summary:
    "Section 3.2.1 specific charge Q/m of nuclei and ions, proton/neutron composition, and specific-charge shift after alpha/beta decay.",
  requiredFields: [
    { name: "kind", type: "string", enumValues: ["al-as-specific-charge-nuclide"] },
    { name: "speciesMode", type: "string", enumValues: SPECIES_MODES },
    { name: "symbolLabel", type: "string" },
    { name: "protonNumber", type: "integer", bounds: "1 <= Z <= 92" },
    { name: "nucleonNumber", type: "integer", bounds: "Z <= A <= 238" },
  ],
  optionalFields: [
    { name: "ionChargeMagnitude", type: "integer", bounds: "1 <= n_e <= 4" },
    { name: "massModel", type: "string", enumValues: MASS_MODELS },
    { name: "decayMode", type: "string", enumValues: DECAY_MODES },
  ],
  physicalConstraints: [
    "Nucleon number A must be an integer >= protonNumber Z.",
    "Ion species require positive integer ionChargeMagnitude <= Z.",
  ],
  probeSpecs: [
    {
      kind: "al-as-specific-charge-nuclide",
      speciesMode: "nucleus",
      symbolLabel: "Mg",
      protonNumber: 12,
      nucleonNumber: 24,
      massModel: "nucleon-exact",
      decayMode: "beta-minus",
    },
    {
      kind: "al-as-specific-charge-nuclide",
      speciesMode: "cation",
      symbolLabel: "Al",
      protonNumber: 13,
      nucleonNumber: 27,
      ionChargeMagnitude: 3,
      massModel: "nucleon-exact",
      decayMode: "none",
    },
  ],
  validate(spec): DomainValidationResult {
    const issues: string[] = [];
    if (spec.kind !== "al-as-specific-charge-nuclide") {
      issues.push('kind must be "al-as-specific-charge-nuclide"');
    }
    if (!isStringOneOf(spec.speciesMode, SPECIES_MODES)) {
      issues.push(`speciesMode must be one of ${SPECIES_MODES.join(", ")}`);
    }
    if (typeof spec.symbolLabel !== "string" || !spec.symbolLabel.trim()) {
      issues.push("symbolLabel must be a non-empty element symbol");
    }
    if (!isIntInRange(spec.protonNumber, 1, 92)) {
      issues.push("protonNumber Z must be an integer in [1, 92]");
    }
    if (
      !isIntInRange(spec.nucleonNumber, 1, 240) ||
      (isFiniteNum(spec.protonNumber) && spec.nucleonNumber < spec.protonNumber)
    ) {
      issues.push("nucleonNumber A must be an integer >= protonNumber Z");
    }
    if (spec.speciesMode === "cation" || spec.speciesMode === "anion") {
      if (!isIntInRange(spec.ionChargeMagnitude, 1, 4)) {
        issues.push("ionChargeMagnitude must be an integer in [1, 4] for ions");
      }
    }
    if (spec.massModel !== undefined && !isStringOneOf(spec.massModel, MASS_MODELS)) {
      issues.push(`massModel must be one of ${MASS_MODELS.join(", ")}`);
    }
    if (spec.decayMode !== undefined && !isStringOneOf(spec.decayMode, DECAY_MODES)) {
      issues.push(`decayMode must be one of ${DECAY_MODES.join(", ")}`);
    }
    return { valid: issues.length === 0, issues };
  },
  solve(spec): DomainSolveOutput {
    const mode = spec.speciesMode as (typeof SPECIES_MODES)[number];
    const Z = spec.protonNumber as number;
    const A = spec.nucleonNumber as number;
    const N = A - Z;
    const ionMag = isIntInRange(spec.ionChargeMagnitude, 1, 4)
      ? spec.ionChargeMagnitude
      : 0;
    const massModel = isStringOneOf(spec.massModel, MASS_MODELS)
      ? spec.massModel
      : "nucleon-exact";
    const decayMode = isStringOneOf(spec.decayMode, DECAY_MODES)
      ? spec.decayMode
      : "none";

    const electronCount =
      mode === "nucleus" ? 0 : mode === "cation" ? Z - ionMag : Z + ionMag;
    const signedChargeUnits =
      mode === "nucleus" ? Z : mode === "cation" ? ionMag : -ionMag;
    const chargeC = signedChargeUnits * AQA_E_C;
    const absChargeC = Math.abs(chargeC);
    const nuclearMassKg =
      massModel === "unified-u" ? A * AQA_U_KG : Z * AQA_MP_KG + N * AQA_MN_KG;
    const totalMassKg = nuclearMassKg + electronCount * AQA_ME_KG;
    const specificChargeCKg = absChargeC / totalMassKg;
    const signedSpecificChargeCKg = chargeC / totalMassKg;

    let daughterZ = Z;
    let daughterA = A;
    if (decayMode === "alpha") {
      daughterZ = Math.max(1, Z - 2);
      daughterA = Math.max(daughterZ, A - 4);
    } else if (decayMode === "beta-minus") {
      daughterZ = Z + 1;
    } else if (decayMode === "beta-plus" || decayMode === "electron-capture") {
      daughterZ = Math.max(1, Z - 1);
    }
    const daughterMassKg =
      massModel === "unified-u"
        ? daughterA * AQA_U_KG
        : daughterZ * AQA_MP_KG + (daughterA - daughterZ) * AQA_MN_KG;
    const nucleusBeforeSC = (Z * AQA_E_C) / nuclearMassKg;
    const daughterSpecificChargeCKg = (daughterZ * AQA_E_C) / daughterMassKg;
    let decaySpecificChargeTrend = "specific charge remains unchanged";
    if (daughterSpecificChargeCKg > nucleusBeforeSC * 1.0005) {
      decaySpecificChargeTrend = "specific charge increases";
    } else if (daughterSpecificChargeCKg < nucleusBeforeSC * 0.9995) {
      decaySpecificChargeTrend = "specific charge decreases";
    }

    const ionTrapRule =
      mode === "nucleus"
        ? "neutrons contribute mass without adding electric charge"
        : "ion charge equals excess or deficit electrons while total mass includes all nucleons";

    return {
      solverId: "sixthphysics/al-as-specific-charge/1.0.0",
      quantities: {
        protonNumber: Z,
        nucleonNumber: A,
        neutronNumber: N,
        electronCount,
        chargeC: absChargeC,
        signedChargeC: chargeC,
        massKg: totalMassKg,
        specificChargeCKg,
        signedSpecificChargeCKg,
        daughterZ,
        daughterA,
        daughterSpecificChargeCKg,
        decaySpecificChargeTrend,
        ionTrapRule,
      },
      publicNumbers: [Z, A],
    };
  },
  renderSvg(spec, options): DomainRenderOutput {
    const hidden = getHiddenSet(spec, options);
    const mode = spec.speciesMode as (typeof SPECIES_MODES)[number];
    const sym = String(spec.symbolLabel);
    const Z = spec.protonNumber as number;
    const A = spec.nucleonNumber as number;
    const N = A - Z;
    const ionMag = isIntInRange(spec.ionChargeMagnitude, 1, 4)
      ? spec.ionChargeMagnitude
      : 0;
    const electronCount =
      mode === "nucleus" ? 0 : mode === "cation" ? Z - ionMag : Z + ionMag;

    const hideZ = hidden.has("protonNumber");
    const hideA = hidden.has("nucleonNumber");
    const hideN = hidden.has("neutronNumber");
    const hideE = hidden.has("electronCount");

    const publicNumbers: number[] = [];
    const publicLabels: string[] = [];
    if (!hideZ) publicNumbers.push(Z);
    if (!hideA) publicNumbers.push(A);
    if (!hideN) publicNumbers.push(N);
    if (mode !== "nucleus" && !hideE) publicNumbers.push(electronCount);
    if (mode !== "nucleus") publicNumbers.push(ionMag);

    const zTxt = hideZ ? "?" : String(Z);
    const aTxt = hideA ? "?" : String(A);
    const nTxt = hideN ? "?" : String(N);
    if (!hideZ) publicLabels.push(`Protons (Z): ${zTxt}`, zTxt);
    if (!hideN) publicLabels.push(`Neutrons (N): ${nTxt}`, nTxt);
    if (!hideA) publicLabels.push(`Nucleons (A): ${aTxt}`, aTxt);
    if (mode !== "nucleus" && !hideE) {
      publicLabels.push(`Orbital electrons: ${electronCount} e⁻`);
    }
    const chargeSup =
      mode === "nucleus"
        ? `${hideZ ? "?" : Z}⁺ (bare nucleus)`
        : `${ionMag}${mode === "cation" ? "⁺" : "⁻"}`;
    if (!hideZ || mode !== "nucleus") publicLabels.push(chargeSup);

    // Draw stylised nucleon cluster
    const cx = 200;
    const cy = 190;
    const nucleonDots: string[] = [];
    const rings = [
      { r: 0, count: 1 },
      { r: 16, count: 6 },
      { r: 31, count: 12 },
    ];
    let idx = 0;
    for (const ring of rings) {
      for (let k = 0; k < ring.count; k += 1) {
        const ang = (k / ring.count) * 2 * Math.PI + 0.3;
        const px = cx + ring.r * Math.cos(ang);
        const py = cy + ring.r * Math.sin(ang);
        const isProton = idx % 2 === 0;
        nucleonDots.push(
          `<circle cx="${fc(px)}" cy="${fc(py)}" r="7.5" fill="${isProton ? "#dc2626" : "#64748b"}" stroke="#ffffff" stroke-width="1.2"/>`,
        );
        idx += 1;
      }
    }

    const shellElements =
      mode === "nucleus"
        ? `<text x="${cx}" y="274" text-anchor="middle" font-size="12.5" fill="#475569">Bare nucleus (0 orbital electrons)</text>`
        : [
            `<circle cx="${cx}" cy="${cy}" r="74" fill="none" stroke="#94a3b8" stroke-width="1.5" stroke-dasharray="5 4"/>`,
            `<circle cx="${cx}" cy="${cy}" r="102" fill="none" stroke="#cbd5e1" stroke-width="1.5" stroke-dasharray="5 4"/>`,
            `<circle cx="${cx + 74}" cy="${cy}" r="4.5" fill="#1d4ed8"/>`,
            `<circle cx="${cx - 74}" cy="${cy}" r="4.5" fill="#1d4ed8"/>`,
            `<circle cx="${cx}" cy="${cy - 102}" r="4.5" fill="#1d4ed8"/>`,
            `<circle cx="${cx}" cy="${cy + 102}" r="4.5" fill="#1d4ed8"/>`,
            `<text x="${cx}" y="318" text-anchor="middle" font-size="12.5" fill="#1d4ed8">Orbital electrons: ${hideE ? "?" : `${electronCount} e⁻`}</text>`,
          ].join("");

    const body = [
      `<text x="320" y="34" text-anchor="middle" font-size="16" font-weight="700" fill="#0f172a">Nuclide and Ion Composition Schematic</text>`,
      shellElements,
      `<circle cx="${cx}" cy="${cy}" r="44" fill="#fef2f2" stroke="#cbd5e1" stroke-width="1.4"/>`,
      nucleonDots.join(""),
      `<rect x="356" y="76" width="244" height="218" rx="12" fill="#f8fafc" stroke="#cbd5e1" stroke-width="1.6"/>`,
      `<text x="412" y="138" text-anchor="end" font-size="18" font-weight="700" fill="#0f172a">${esc(aTxt)}</text>`,
      `<text x="412" y="168" text-anchor="end" font-size="18" font-weight="700" fill="#dc2626">${esc(zTxt)}</text>`,
      `<text x="422" y="162" font-size="38" font-weight="700" fill="#0f172a">${esc(sym)}</text>`,
      `<text x="486" y="136" font-size="14" font-weight="700" fill="#1d4ed8">${esc(chargeSup)}</text>`,
      `<line x1="376" y1="186" x2="580" y2="186" stroke="#e2e8f0" stroke-width="1.2"/>`,
      `<circle cx="388" cy="212" r="5.5" fill="#dc2626"/>`,
      `<text x="402" y="216" font-size="13" fill="#0f172a">Protons (Z): ${esc(zTxt)}</text>`,
      `<circle cx="388" cy="240" r="5.5" fill="#64748b"/>`,
      `<text x="402" y="244" font-size="13" fill="#0f172a">Neutrons (N): ${esc(nTxt)}</text>`,
      `<circle cx="388" cy="268" r="5.5" fill="#1d4ed8"/>`,
      `<text x="402" y="272" font-size="13" fill="#0f172a">Nucleons (A): ${esc(aTxt)}</text>`,
    ].join("");

    return {
      visualFamily: "quantum-nuclear",
      svgMarkup: wrapSvg(
        "Nuclide and ion particle schematic",
        "Schematic diagram showing proton, neutron, and electron counts for a nuclide or ion",
        "",
        body,
      ),
      rendererVersion: ALEVEL_CORE_AS_RENDERER_VERSION,
      publicNumbers,
      publicLabels,
    };
  },
};

/* -------------------------------------------------------------------------- */
/*  3. al-as-strong-nuclear-force (Section 3.2.1, graphs)                     */
/* -------------------------------------------------------------------------- */

function evaluateSnfKN(rFm: number): number {
  if (rFm <= 0.5) {
    // Repulsive region: smoothly drops from +48 kN at 0.2 fm to 0 at 0.5 fm
    const t = (0.5 - rFm) / 0.3;
    return 45 * t * t;
  }
  if (rFm <= 1.0) {
    // Attractive trough: 0 at 0.5 fm down to -25 kN at 1.0 fm
    const u = (rFm - 0.5) / 0.5;
    return -25 * Math.sin((u * Math.PI) / 2);
  }
  if (rFm >= 3.5) {
    return 0;
  }
  // Smooth decay from -25 kN at 1.0 fm toward 0 at 3.0-3.5 fm
  const w = (rFm - 1.0) / 2.5;
  return -25 * (1 - w) * (1 - w) * Math.exp(-1.2 * w);
}

const SNF_VISUAL_MODES = ["force-curve", "nuclear-stability"] as const;

const strongNuclearForcePlugin: DomainKindPlugin = {
  domain: "graphs",
  kind: "al-as-strong-nuclear-force",
  summary:
    "Section 3.2.1 strong nuclear force F(r) versus nucleon separation (repulsive < 0.5 fm, attractive 0.5-3.0 fm) and nuclear stability.",
  requiredFields: [
    { name: "kind", type: "string", enumValues: ["al-as-strong-nuclear-force"] },
    { name: "probeSeparationFm", type: "number", unit: "fm", bounds: "0.25 <= r <= 4.5" },
  ],
  optionalFields: [
    { name: "showElectrostatic", type: "boolean" },
    { name: "visualMode", type: "string", enumValues: SNF_VISUAL_MODES },
  ],
  physicalConstraints: [
    "Strong nuclear force is repulsive below 0.5 fm, attractive from 0.5 fm to ~3.0 fm, and negligible beyond 3 fm.",
    "Strong nuclear force acts equally between any pair of nucleons (p-p, p-n, n-n).",
  ],
  probeSpecs: [
    {
      kind: "al-as-strong-nuclear-force",
      probeSeparationFm: 0.35,
      showElectrostatic: false,
      visualMode: "force-curve",
    },
    {
      kind: "al-as-strong-nuclear-force",
      probeSeparationFm: 1.2,
      showElectrostatic: true,
      visualMode: "nuclear-stability",
    },
  ],
  validate(spec): DomainValidationResult {
    const issues: string[] = [];
    if (spec.kind !== "al-as-strong-nuclear-force") {
      issues.push('kind must be "al-as-strong-nuclear-force"');
    }
    if (!isFiniteNum(spec.probeSeparationFm) || spec.probeSeparationFm < 0.25 || spec.probeSeparationFm > 4.5) {
      issues.push("probeSeparationFm must lie in [0.25, 4.5] fm");
    }
    if (spec.visualMode !== undefined && !isStringOneOf(spec.visualMode, SNF_VISUAL_MODES)) {
      issues.push(`visualMode must be one of ${SNF_VISUAL_MODES.join(", ")}`);
    }
    return { valid: issues.length === 0, issues };
  },
  solve(spec): DomainSolveOutput {
    const r = spec.probeSeparationFm as number;
    const forceAtProbeKN = evaluateSnfKN(r);
    let forceRegimeAtR: string;
    if (r < 0.5) {
      forceRegimeAtR = "strongly repulsive preventing nuclear collapse";
    } else if (r <= 3.0) {
      forceRegimeAtR = "attractive overcoming electrostatic proton repulsion";
    } else {
      forceRegimeAtR = "negligible beyond the short range of three femtometres";
    }
    return {
      solverId: "sixthphysics/al-as-strong-nuclear-force/1.0.0",
      quantities: {
        probeSeparationFm: r,
        equilibriumSepFm: 0.5,
        peakAttractionSepFm: 1.0,
        maxRangeFm: 3.0,
        forceAtProbeKN,
        forceRegimeAtR,
        exchangeBosonRule:
          "virtual photon mediates electromagnetic repulsion while pions mediate the strong nuclear force",
        targetScopeRule:
          "acts equally between all nucleons and has no effect on leptons",
        lorAnchor:
          "strong nuclear force is repulsive below zero point five fm and attractive up to three fm balancing electrostatic proton repulsion",
      },
      publicNumbers: [0, 1, 2, 3, 4, 5],
    };
  },
  renderSvg(spec, options): DomainRenderOutput {
    const hidden = getHiddenSet(spec, options);
    const rProbe = spec.probeSeparationFm as number;
    const showEm = Boolean(spec.showElectrostatic);
    const x0 = 92;
    const xMax = 592;
    const yZero = 188;
    const yTop = 58;
    const yBot = 308;

    const toX = (r: number) => x0 + (r / 5) * (xMax - x0);
    const toY = (f: number) => yZero - (f / 45) * (yZero - yTop);

    const publicNumbers: number[] = [0, 1, 2, 3, 4, 5];
    const publicLabels: string[] = ["0", "1", "2", "3", "4", "5"];

    // Sample SNF polyline
    const snfPts: string[] = [];
    for (let i = 0; i <= 160; i += 1) {
      const r = 0.24 + (i / 160) * 4.56;
      const f = Math.max(-35, Math.min(44, evaluateSnfKN(r)));
      snfPts.push(`${i === 0 ? "M" : "L"} ${fc(toX(r))} ${fc(toY(f))}`);
    }

    // Optional electrostatic repulsion curve (positive, ~ 1/r^2 scaled for schematic visibility)
    const emPts: string[] = [];
    if (showEm) {
      for (let i = 0; i <= 120; i += 1) {
        const r = 0.45 + (i / 120) * 4.35;
        const fEm = Math.min(40, 8.5 / (r * r));
        emPts.push(`${i === 0 ? "M" : "L"} ${fc(toX(r))} ${fc(toY(fEm))}`);
      }
    }

    const hideBands =
      hidden.has("forceRegimeAtR") ||
      hidden.has("equilibriumSepFm") ||
      hidden.has("maxRangeFm") ||
      hidden.has("lorAnchor");
    const hideProbe =
      hidden.has("probeSeparationFm") || hidden.has("forceAtProbeKN");

    const xTicks = [0, 1, 2, 3, 4, 5]
      .map((t) => {
        const tx = toX(t);
        return `<line x1="${fc(tx)}" y1="${yZero - 4}" x2="${fc(tx)}" y2="${yZero + 4}" stroke="#0f172a" stroke-width="1.4"/><text x="${fc(tx)}" y="${yZero + 20}" text-anchor="middle" font-size="12" fill="#334155">${t}</text>`;
      })
      .join("");

    const probeY = toY(evaluateSnfKN(rProbe));
    const probeX = toX(rProbe);
    const probeMark = hideProbe
      ? ""
      : `<line x1="${fc(probeX)}" y1="${yZero}" x2="${fc(probeX)}" y2="${fc(probeY)}" stroke="#7c3aed" stroke-width="1.5" stroke-dasharray="4 3"/><circle cx="${fc(probeX)}" cy="${fc(probeY)}" r="5" fill="#7c3aed"/>`;

    const defs = arrowMarkerDef("arr-snf-ax", "#0f172a");
    const body = [
      `<text x="340" y="30" text-anchor="middle" font-size="15.5" font-weight="700" fill="#0f172a">Strong Nuclear Force versus Nucleon Separation</text>`,
      // Shaded bands
      `<rect x="${fc(toX(0))}" y="${yTop}" width="${fc(toX(0.5) - toX(0))}" height="${yZero - yTop}" fill="#fee2e2" opacity="0.65"/>`,
      `<rect x="${fc(toX(0.5))}" y="${yZero}" width="${fc(toX(3.0) - toX(0.5))}" height="${yBot - yZero}" fill="#dbeafe" opacity="0.55"/>`,
      // Axes
      `<line x1="${x0}" y1="${yBot}" x2="${x0}" y2="${yTop - 8}" stroke="#0f172a" stroke-width="2" marker-end="url(#arr-snf-ax)"/>`,
      `<line x1="${x0}" y1="${yZero}" x2="${xMax + 10}" y2="${yZero}" stroke="#0f172a" stroke-width="2" marker-end="url(#arr-snf-ax)"/>`,
      xTicks,
      `<text x="${xMax - 4}" y="${yZero - 10}" text-anchor="end" font-size="12.5" font-weight="600" fill="#0f172a">Separation r / fm</text>`,
      `<text x="26" y="${yTop + 14}" font-size="12" font-weight="600" fill="#b91c1c">Repulsive (+)</text>`,
      `<text x="26" y="${yBot - 8}" font-size="12" font-weight="600" fill="#1d4ed8">Attractive (−)</text>`,
      `<text x="26" y="${yZero + 4}" font-size="12.5" font-weight="700" fill="#0f172a">Force F</text>`,
      // Curves
      `<path d="${snfPts.join(" ")}" fill="none" stroke="#1d4ed8" stroke-width="2.8"/>`,
      showEm
        ? `<path d="${emPts.join(" ")}" fill="none" stroke="#ea580c" stroke-width="2.2" stroke-dasharray="7 4"/>`
        : "",
      probeMark,
      // Region markers (masked when hidden)
      hideBands
        ? `<text x="${fc(toX(0.25))}" y="86" text-anchor="middle" font-size="12" font-weight="700" fill="#991b1b">X</text><text x="${fc(toX(1.7))}" y="294" text-anchor="middle" font-size="12" font-weight="700" fill="#1e3a8a">Region Y</text>`
        : `<text x="${fc(toX(0.85))}" y="82" font-size="11.5" font-weight="600" fill="#991b1b">Repulsive &lt; 0.5 fm</text><text x="${fc(toX(1.75))}" y="296" text-anchor="middle" font-size="11.5" font-weight="600" fill="#1e3a8a">Attractive (0.5 to 3 fm)</text>`,
      // Legend
      `<rect x="424" y="62" width="176" height="${showEm ? 58 : 36}" rx="8" fill="#ffffff" stroke="#cbd5e1" stroke-width="1.2"/>`,
      `<line x1="436" y1="80" x2="464" y2="80" stroke="#1d4ed8" stroke-width="2.8"/>`,
      `<text x="472" y="84" font-size="11.5" fill="#0f172a">Strong nuclear force</text>`,
      showEm
        ? `<line x1="436" y1="104" x2="464" y2="104" stroke="#ea580c" stroke-width="2.2" stroke-dasharray="6 3"/><text x="472" y="108" font-size="11.5" fill="#0f172a">Electrostatic (p–p)</text>`
        : "",
    ].join("");

    return {
      visualFamily: "graphs",
      svgMarkup: wrapSvg(
        "Strong nuclear force graph",
        "Graph showing strong nuclear force plotted against nucleon separation in femtometres",
        defs,
        body,
      ),
      rendererVersion: ALEVEL_CORE_AS_RENDERER_VERSION,
      publicNumbers,
      publicLabels,
    };
  },
};

/* -------------------------------------------------------------------------- */
/*  4. al-as-pair-prod-annihilation (Section 3.2.1, quantum-nuclear)          */
/* -------------------------------------------------------------------------- */

const PAIR_PROCESS_TYPES = ["pair-production", "annihilation"] as const;
const PAIR_PARTICLE_TYPES = [
  "electron-positron",
  "muon-antimuon",
  "proton-antiproton",
] as const;

const PAIR_PARTICLE_META: Readonly<
  Record<
    (typeof PAIR_PARTICLE_TYPES)[number],
    {
      restMeV: number;
      partSym: string;
      antiSym: string;
      partName: string;
      antiName: string;
    }
  >
> = {
  "electron-positron": {
    restMeV: AQA_ME_MEV,
    partSym: "e⁻",
    antiSym: "e⁺",
    partName: "electron",
    antiName: "positron",
  },
  "muon-antimuon": {
    restMeV: AQA_MU_MEV,
    partSym: "μ⁻",
    antiSym: "μ⁺",
    partName: "muon",
    antiName: "antimuon",
  },
  "proton-antiproton": {
    restMeV: AQA_MP_MEV,
    partSym: "p",
    antiSym: "p̄",
    partName: "proton",
    antiName: "antiproton",
  },
};

const pairProdAnnihilationPlugin: DomainKindPlugin = {
  domain: "quantum-nuclear",
  kind: "al-as-pair-prod-annihilation",
  summary:
    "Section 3.2.1 pair production threshold/excess KE and particle-antiparticle annihilation into two opposite gamma photons.",
  requiredFields: [
    { name: "kind", type: "string", enumValues: ["al-as-pair-prod-annihilation"] },
    { name: "processType", type: "string", enumValues: PAIR_PROCESS_TYPES },
    { name: "particlePair", type: "string", enumValues: PAIR_PARTICLE_TYPES },
    {
      name: "energyInputMeV",
      type: "number",
      unit: "MeV",
      notes: "For pair-production: incident photon energy >= 2 E0. For annihilation: combined initial kinetic energy >= 0.",
    },
  ],
  physicalConstraints: [
    "Pair production requires incident photon energy >= 2 E0 near a nucleus for momentum conservation.",
    "Annihilation produces two identical gamma photons travelling in opposite directions to conserve momentum.",
  ],
  probeSpecs: [
    {
      kind: "al-as-pair-prod-annihilation",
      processType: "pair-production",
      particlePair: "electron-positron",
      energyInputMeV: 1.42,
    },
    {
      kind: "al-as-pair-prod-annihilation",
      processType: "annihilation",
      particlePair: "electron-positron",
      energyInputMeV: 0.24,
    },
  ],
  validate(spec): DomainValidationResult {
    const issues: string[] = [];
    if (spec.kind !== "al-as-pair-prod-annihilation") {
      issues.push('kind must be "al-as-pair-prod-annihilation"');
    }
    if (!isStringOneOf(spec.processType, PAIR_PROCESS_TYPES)) {
      issues.push(`processType must be one of ${PAIR_PROCESS_TYPES.join(", ")}`);
    }
    if (!isStringOneOf(spec.particlePair, PAIR_PARTICLE_TYPES)) {
      issues.push(`particlePair must be one of ${PAIR_PARTICLE_TYPES.join(", ")}`);
    }
    if (!isNonNegNum(spec.energyInputMeV)) {
      issues.push("energyInputMeV must be a non-negative finite number");
    } else if (
      spec.processType === "pair-production" &&
      isStringOneOf(spec.particlePair, PAIR_PARTICLE_TYPES)
    ) {
      const minE = 2 * PAIR_PARTICLE_META[spec.particlePair].restMeV;
      if (spec.energyInputMeV < minE - 1e-6) {
        issues.push(
          `Pair production requires energyInputMeV >= ${minE.toFixed(3)} MeV`,
        );
      }
    }
    return { valid: issues.length === 0, issues };
  },
  solve(spec): DomainSolveOutput {
    const processType = spec.processType as (typeof PAIR_PROCESS_TYPES)[number];
    const pairType = spec.particlePair as (typeof PAIR_PARTICLE_TYPES)[number];
    const meta = PAIR_PARTICLE_META[pairType];
    const inputMeV = spec.energyInputMeV as number;
    const e0MeV = meta.restMeV;
    const minPairEnergyMeV = 2 * e0MeV;
    const minPairEnergyJ = minPairEnergyMeV * AQA_MEV_TO_J;
    const minPairFrequencyHz = minPairEnergyJ / AQA_H_JS;
    const maxPairWavelengthM = (AQA_H_JS * AQA_C_MS) / minPairEnergyJ;

    const totalEkMeV =
      processType === "pair-production"
        ? Math.max(0, inputMeV - minPairEnergyMeV)
        : inputMeV;
    const singlePhotonEnergyMeV =
      processType === "annihilation" ? e0MeV + 0.5 * inputMeV : inputMeV;
    const singlePhotonEnergyJ = singlePhotonEnergyMeV * AQA_MEV_TO_J;
    const photonFrequencyHz = singlePhotonEnergyJ / AQA_H_JS;
    const photonWavelengthM = (AQA_H_JS * AQA_C_MS) / singlePhotonEnergyJ;

    return {
      solverId: "sixthphysics/al-as-pair-prod-annihilation/1.0.0",
      quantities: {
        restEnergyMeV: e0MeV,
        minPairEnergyMeV,
        minPairEnergyJ,
        minPairFrequencyHz,
        maxPairWavelengthM,
        totalEkMeV,
        singlePhotonEnergyMeV,
        singlePhotonEnergyJ,
        photonFrequencyHz,
        photonWavelengthM,
        antiparticleName: meta.antiName,
        momentumRule:
          "two gamma photons travel in opposite directions to conserve momentum",
        excessEnergySource:
          "kinetic energy of the particles before annihilation or after pair creation",
        thresholdRule:
          "minimum photon energy equals twice the rest energy of one particle",
      },
      publicNumbers: [e0MeV],
    };
  },
  renderSvg(spec, options): DomainRenderOutput {
    const hidden = getHiddenSet(spec, options);
    const processType = spec.processType as (typeof PAIR_PROCESS_TYPES)[number];
    const pairType = spec.particlePair as (typeof PAIR_PARTICLE_TYPES)[number];
    const meta = PAIR_PARTICLE_META[pairType];
    const inputMeV = spec.energyInputMeV as number;
    const defs = [
      arrowMarkerDef("arr-pp-b", "#1d4ed8"),
      arrowMarkerDef("arr-pp-r", "#dc2626"),
      arrowMarkerDef("arr-pp-g", "#047857"),
    ].join("");
    const publicNumbers: number[] = [];
    const publicLabels: string[] = [];

    if (processType === "pair-production") {
      const hideE = hidden.has("energyInputMeV") || hidden.has("minPairEnergyMeV");
      if (!hideE) publicNumbers.push(inputMeV);
      const eLabel = hideE ? "γ photon" : `γ (${fmtClean(inputMeV, 3)} MeV)`;
      const antiLabel = hidden.has("antiparticleName") ? "?" : meta.antiSym;
      const body = [
        `<text x="320" y="34" text-anchor="middle" font-size="16" font-weight="700" fill="#0f172a">Pair Production Near a Recoil Nucleus</text>`,
        `<path d="${wavyPath(66, 184, 248, 184, 7, 9)}" fill="none" stroke="#d97706" stroke-width="2.6"/>`,
        `<polygon points="248,184 236,177 236,191" fill="#d97706"/>`,
        `<text x="155" y="156" text-anchor="middle" font-size="13.5" font-weight="700" fill="#b45309">${esc(eLabel)}</text>`,
        `<circle cx="268" cy="236" r="22" fill="#e2e8f0" stroke="#475569" stroke-width="2"/>`,
        `<text x="268" y="241" text-anchor="middle" font-size="12" font-weight="700" fill="#0f172a">Nucleus</text>`,
        `<circle cx="268" cy="184" r="5" fill="#0f172a"/>`,
        `<path d="M 268 184 Q 375 162 490 92" fill="none" stroke="#1d4ed8" stroke-width="2.6" marker-end="url(#arr-pp-b)"/>`,
        `<path d="M 268 184 Q 375 206 490 276" fill="none" stroke="#dc2626" stroke-width="2.6" marker-end="url(#arr-pp-r)"/>`,
        `<text x="506" y="96" font-size="16" font-weight="700" fill="#1d4ed8">${esc(meta.partSym)}</text>`,
        `<text x="506" y="282" font-size="16" font-weight="700" fill="#dc2626">${esc(antiLabel)}</text>`,
        `<text x="320" y="328" text-anchor="middle" font-size="12" fill="#475569">Diverging particle and antiparticle tracks in a uniform magnetic field</text>`,
      ].join("");
      return {
        visualFamily: "quantum-nuclear",
        svgMarkup: wrapSvg(
          "Pair production schematic",
          "Gamma photon creating a particle and antiparticle pair near a heavy nucleus",
          defs,
          body,
        ),
        rendererVersion: ALEVEL_CORE_AS_RENDERER_VERSION,
        publicNumbers,
        publicLabels,
      };
    }

    const antiLabel = hidden.has("antiparticleName") ? "?" : meta.antiSym;
    const hidePhoton = hidden.has("momentumRule");
    const body = [
      `<text x="320" y="34" text-anchor="middle" font-size="16" font-weight="700" fill="#0f172a">Particle–Antiparticle Annihilation</text>`,
      `<line x1="150" y1="108" x2="306" y2="180" stroke="#1d4ed8" stroke-width="2.6" marker-end="url(#arr-pp-b)"/>`,
      `<line x1="150" y1="262" x2="306" y2="190" stroke="#dc2626" stroke-width="2.6" marker-end="url(#arr-pp-r)"/>`,
      `<text x="132" y="106" text-anchor="end" font-size="16" font-weight="700" fill="#1d4ed8">${esc(meta.partSym)}</text>`,
      `<text x="132" y="268" text-anchor="end" font-size="16" font-weight="700" fill="#dc2626">${esc(antiLabel)}</text>`,
      `<circle cx="320" cy="185" r="14" fill="#fef3c7" stroke="#d97706" stroke-width="2"/>`,
      `<circle cx="320" cy="185" r="5" fill="#d97706"/>`,
      `<path d="${wavyPath(336, 185, 540, 185, 7, 9)}" fill="none" stroke="#047857" stroke-width="2.6"/>`,
      `<polygon points="546,185 534,178 534,192" fill="#047857"/>`,
      `<path d="${wavyPath(304, 185, 100, 185, 7, 9)}" fill="none" stroke="#047857" stroke-width="2.6"/>`,
      `<polygon points="94,185 106,178 106,192" fill="#047857"/>`,
      `<text x="458" y="156" text-anchor="middle" font-size="14" font-weight="700" fill="#047857">${hidePhoton ? "γ" : "γ₁"}</text>`,
      `<text x="192" y="156" text-anchor="middle" font-size="14" font-weight="700" fill="#047857">${hidePhoton ? "γ" : "γ₂"}</text>`,
      `<text x="320" y="324" text-anchor="middle" font-size="12" fill="#475569">Rest mass energy and kinetic energy convert into gamma radiation</text>`,
    ].join("");
    return {
      visualFamily: "quantum-nuclear",
      svgMarkup: wrapSvg(
        "Particle-antiparticle annihilation schematic",
        "Converging particle and antiparticle annihilating into gamma radiation",
        defs,
        body,
      ),
      rendererVersion: ALEVEL_CORE_AS_RENDERER_VERSION,
      publicNumbers,
      publicLabels,
    };
  },
};

/* -------------------------------------------------------------------------- */
/*  5. al-as-feynman-interactions (Section 3.2.1, quantum-nuclear)            */
/* -------------------------------------------------------------------------- */

const FEYNMAN_MODES = [
  "beta-minus",
  "beta-plus",
  "electron-capture",
  "electron-proton-collision",
  "em-repulsion",
  "quark-beta-minus",
  "quark-beta-plus",
] as const;

export type FeynmanInteractionMode = (typeof FEYNMAN_MODES)[number];

interface FeynmanDescriptor {
  readonly title: string;
  readonly leftIn: string;
  readonly leftOut: string;
  readonly rightIn?: string;
  readonly rightOutTop: string;
  readonly rightOutBot?: string;
  readonly bosonSym: string;
  readonly bosonDir: "left-to-right" | "right-to-left" | "none";
  readonly topology: "decay" | "scattering";
  readonly exchangeBoson: string;
  readonly interactionType: string;
  readonly quarkFlavourChange: string;
  readonly missingProduct: string;
  readonly leptonProduct: string;
  readonly vertexChargeCheck: string;
}

const FEYNMAN_TABLE: Readonly<Record<FeynmanInteractionMode, FeynmanDescriptor>> =
  {
    "beta-minus": {
      title: "Beta-Minus Decay",
      leftIn: "n",
      leftOut: "p",
      rightOutTop: "e⁻",
      rightOutBot: "ν̄ₑ",
      bosonSym: "W⁻",
      bosonDir: "left-to-right",
      topology: "decay",
      exchangeBoson: "W minus boson",
      interactionType: "weak nuclear interaction",
      quarkFlavourChange: "down quark changes to up quark",
      missingProduct: "electron antineutrino",
      leptonProduct: "electron",
      vertexChargeCheck: "zero charge conserved at both vertices",
    },
    "beta-plus": {
      title: "Beta-Plus Decay",
      leftIn: "p",
      leftOut: "n",
      rightOutTop: "e⁺",
      rightOutBot: "νₑ",
      bosonSym: "W⁺",
      bosonDir: "left-to-right",
      topology: "decay",
      exchangeBoson: "W plus boson",
      interactionType: "weak nuclear interaction",
      quarkFlavourChange: "up quark changes to down quark",
      missingProduct: "electron neutrino",
      leptonProduct: "positron",
      vertexChargeCheck: "plus one charge conserved at both vertices",
    },
    "electron-capture": {
      title: "Electron Capture",
      leftIn: "p",
      leftOut: "n",
      rightIn: "e⁻",
      rightOutTop: "νₑ",
      bosonSym: "W⁺",
      bosonDir: "left-to-right",
      topology: "scattering",
      exchangeBoson: "W plus boson from proton to electron",
      interactionType: "weak nuclear interaction",
      quarkFlavourChange: "up quark changes to down quark",
      missingProduct: "electron neutrino",
      leptonProduct: "electron neutrino",
      vertexChargeCheck: "charge conserved at proton and electron vertices",
    },
    "electron-proton-collision": {
      title: "Electron–Proton Collision",
      leftIn: "e⁻",
      leftOut: "νₑ",
      rightIn: "p",
      rightOutTop: "n",
      bosonSym: "W⁻",
      bosonDir: "left-to-right",
      topology: "scattering",
      exchangeBoson: "W minus boson from electron to proton",
      interactionType: "weak nuclear interaction",
      quarkFlavourChange: "up quark changes to down quark",
      missingProduct: "neutron",
      leptonProduct: "electron neutrino",
      vertexChargeCheck: "charge conserved at electron and proton vertices",
    },
    "em-repulsion": {
      title: "Electromagnetic Repulsion",
      leftIn: "e⁻",
      leftOut: "e⁻",
      rightIn: "e⁻",
      rightOutTop: "e⁻",
      bosonSym: "γ",
      bosonDir: "none",
      topology: "scattering",
      exchangeBoson: "virtual photon",
      interactionType: "electromagnetic interaction",
      quarkFlavourChange: "no quark flavour change",
      missingProduct: "scattered electron",
      leptonProduct: "electron",
      vertexChargeCheck: "virtual photon carries zero charge",
    },
    "quark-beta-minus": {
      title: "Quark-Level Beta-Minus Decay",
      leftIn: "d",
      leftOut: "u",
      rightOutTop: "e⁻",
      rightOutBot: "ν̄ₑ",
      bosonSym: "W⁻",
      bosonDir: "left-to-right",
      topology: "decay",
      exchangeBoson: "W minus boson",
      interactionType: "weak nuclear interaction",
      quarkFlavourChange: "down quark changes to up quark",
      missingProduct: "electron antineutrino",
      leptonProduct: "electron",
      vertexChargeCheck: "quark charge changes from minus one third to plus two thirds",
    },
    "quark-beta-plus": {
      title: "Quark-Level Beta-Plus Decay",
      leftIn: "u",
      leftOut: "d",
      rightOutTop: "e⁺",
      rightOutBot: "νₑ",
      bosonSym: "W⁺",
      bosonDir: "left-to-right",
      topology: "decay",
      exchangeBoson: "W plus boson",
      interactionType: "weak nuclear interaction",
      quarkFlavourChange: "up quark changes to down quark",
      missingProduct: "electron neutrino",
      leptonProduct: "positron",
      vertexChargeCheck: "quark charge changes from plus two thirds to minus one third",
    },
  };

function renderParticleSvgText(
  x: number,
  y: number,
  sym: string,
  color: string,
  anchor: "start" | "middle" | "end" = "middle",
): string {
  if (sym === "ν̄ₑ") {
    return [
      `<line x1="${fc(x - 7)}" y1="${fc(y - 13)}" x2="${fc(x + 3)}" y2="${fc(y - 13)}" stroke="${color}" stroke-width="1.5"/>`,
      `<text x="${fc(x)}" y="${fc(y)}" text-anchor="${anchor}" font-size="16" font-weight="700" fill="${color}">${subLabel("ν", "e", 16)}</text>`,
    ].join("");
  }
  if (sym === "νₑ") {
    return `<text x="${fc(x)}" y="${fc(y)}" text-anchor="${anchor}" font-size="16" font-weight="700" fill="${color}">${subLabel("ν", "e", 16)}</text>`;
  }
  return `<text x="${fc(x)}" y="${fc(y)}" text-anchor="${anchor}" font-size="16" font-weight="700" fill="${color}">${esc(sym)}</text>`;
}

function midArrow(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: string,
): string {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const ang = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
  return `<g transform="translate(${fc(mx)} ${fc(my)}) rotate(${fc(ang)})"><polygon points="6,0 -5,-5 -5,5" fill="${color}"/></g>`;
}

const feynmanInteractionsPlugin: DomainKindPlugin = {
  domain: "quantum-nuclear",
  kind: "al-as-feynman-interactions",
  summary:
    "Section 3.2.1 AQA upward-time Feynman diagrams: beta-minus, beta-plus, electron capture, electron-proton collision, EM repulsion, and quark flavour change.",
  requiredFields: [
    { name: "kind", type: "string", enumValues: ["al-as-feynman-interactions"] },
    { name: "interactionMode", type: "string", enumValues: FEYNMAN_MODES },
  ],
  physicalConstraints: [
    "Time increases vertically upward in AQA Feynman diagrams.",
    "Charge, baryon number, and lepton number are conserved at every vertex.",
  ],
  probeSpecs: [
    {
      kind: "al-as-feynman-interactions",
      interactionMode: "electron-capture",
    },
    {
      kind: "al-as-feynman-interactions",
      interactionMode: "beta-minus",
    },
    {
      kind: "al-as-feynman-interactions",
      interactionMode: "em-repulsion",
    },
  ],
  validate(spec): DomainValidationResult {
    const issues: string[] = [];
    if (spec.kind !== "al-as-feynman-interactions") {
      issues.push('kind must be "al-as-feynman-interactions"');
    }
    if (!isStringOneOf(spec.interactionMode, FEYNMAN_MODES)) {
      issues.push(`interactionMode must be one of ${FEYNMAN_MODES.join(", ")}`);
    }
    return { valid: issues.length === 0, issues };
  },
  solve(spec): DomainSolveOutput {
    const mode = spec.interactionMode as FeynmanInteractionMode;
    const d = FEYNMAN_TABLE[mode];
    return {
      solverId: "sixthphysics/al-as-feynman-interactions/1.0.0",
      quantities: {
        exchangeBoson: d.exchangeBoson,
        interactionType: d.interactionType,
        quarkFlavourChange: d.quarkFlavourChange,
        missingProduct: d.missingProduct,
        leptonProduct: d.leptonProduct,
        vertexChargeCheck: d.vertexChargeCheck,
      },
    };
  },
  renderSvg(spec, options): DomainRenderOutput {
    const hidden = getHiddenSet(spec, options);
    const mode = spec.interactionMode as FeynmanInteractionMode;
    const d = FEYNMAN_TABLE[mode];
    const hideBoson =
      hidden.has("exchangeBoson") || hidden.has("interactionType");
    const hideMissing = hidden.has("missingProduct");
    const hideLepton = hidden.has("leptonProduct");
    const hideTitle =
      hidden.has("interactionType") ||
      hidden.has("exchangeBoson") ||
      hidden.has("quarkFlavourChange");

    const defs = arrowMarkerDef("arr-feyn-t", "#64748b");
    const timeAxis = [
      `<line x1="76" y1="306" x2="76" y2="76" stroke="#64748b" stroke-width="1.8" marker-end="url(#arr-feyn-t)"/>`,
      `<text x="64" y="196" text-anchor="middle" font-size="12.5" font-weight="600" fill="#64748b" transform="rotate(-90 64 196)">Time</text>`,
    ].join("");

    const bosonLabel = hideBoson ? "?" : d.bosonSym;
    let diagram = "";

    if (d.topology === "decay") {
      // Left fermion line: (206,304) -> vertex1 (248,196) -> (206,76)
      // Wavy boson: (248,196) -> vertex2 (398,162)
      // Right emitted pair: vertex2 (398,162) -> (488,76) [lepton] and (512,188) [neutrino]
      const lepSym = hideLepton ? "X" : d.rightOutTop;
      const nuSym = hideMissing ? "Y" : (d.rightOutBot ?? "νₑ");
      diagram = [
        `<line x1="206" y1="304" x2="248" y2="196" stroke="#0f172a" stroke-width="2.6"/>`,
        midArrow(206, 304, 248, 196, "#0f172a"),
        `<line x1="248" y1="196" x2="206" y2="78" stroke="#0f172a" stroke-width="2.6"/>`,
        midArrow(248, 196, 206, 78, "#0f172a"),
        `<path d="${wavyPath(248, 196, 398, 162, 6, 8)}" fill="none" stroke="#7c3aed" stroke-width="2.4"/>`,
        `<line x1="398" y1="162" x2="486" y2="78" stroke="#1d4ed8" stroke-width="2.6"/>`,
        midArrow(398, 162, 486, 78, "#1d4ed8"),
        `<line x1="398" y1="162" x2="508" y2="198" stroke="#047857" stroke-width="2.6"/>`,
        midArrow(398, 162, 508, 198, "#047857"),
        `<circle cx="248" cy="196" r="5" fill="#0f172a"/>`,
        `<circle cx="398" cy="162" r="5" fill="#0f172a"/>`,
        renderParticleSvgText(186, 304, d.leftIn, "#0f172a", "end"),
        renderParticleSvgText(186, 84, d.leftOut, "#0f172a", "end"),
        renderParticleSvgText(506, 84, lepSym, "#1d4ed8", "start"),
        renderParticleSvgText(524, 204, nuSym, "#047857", "start"),
        `<text x="322" y="154" text-anchor="middle" font-size="16" font-weight="700" fill="#7c3aed">${esc(bosonLabel)}</text>`,
      ].join("");
    } else {
      // Scattering topology: two incoming lines meeting vertices connected by horizontal/slanted wavy boson
      const v1x = 248;
      const v1y = 204;
      const v2x = 412;
      const v2y = mode === "em-repulsion" ? 204 : 172;
      const rightTopSym = hideMissing ? "X" : d.rightOutTop;
      const leftOutSym = hideLepton && mode === "electron-proton-collision" ? "Y" : d.leftOut;
      diagram = [
        `<line x1="184" y1="306" x2="${v1x}" y2="${v1y}" stroke="#0f172a" stroke-width="2.6"/>`,
        midArrow(184, 306, v1x, v1y, "#0f172a"),
        `<line x1="${v1x}" y1="${v1y}" x2="184" y2="82" stroke="#0f172a" stroke-width="2.6"/>`,
        midArrow(v1x, v1y, 184, 82, "#0f172a"),
        `<line x1="476" y1="306" x2="${v2x}" y2="${v2y}" stroke="#1d4ed8" stroke-width="2.6"/>`,
        midArrow(476, 306, v2x, v2y, "#1d4ed8"),
        `<line x1="${v2x}" y1="${v2y}" x2="476" y2="82" stroke="#1d4ed8" stroke-width="2.6"/>`,
        midArrow(v2x, v2y, 476, 82, "#1d4ed8"),
        `<path d="${wavyPath(v1x, v1y, v2x, v2y, 6, 8)}" fill="none" stroke="#7c3aed" stroke-width="2.4"/>`,
        d.bosonDir === "left-to-right"
          ? `<line x1="298" y1="158" x2="362" y2="146" stroke="#7c3aed" stroke-width="1.6"/><polygon points="366,145 356,142 358,151" fill="#7c3aed"/>`
          : "",
        `<circle cx="${v1x}" cy="${v1y}" r="5" fill="#0f172a"/>`,
        `<circle cx="${v2x}" cy="${v2y}" r="5" fill="#0f172a"/>`,
        renderParticleSvgText(166, 308, d.leftIn, "#0f172a", "end"),
        renderParticleSvgText(166, 86, leftOutSym, "#0f172a", "end"),
        renderParticleSvgText(494, 308, d.rightIn ?? "e⁻", "#1d4ed8", "start"),
        renderParticleSvgText(494, 86, rightTopSym, "#1d4ed8", "start"),
        `<text x="330" y="138" text-anchor="middle" font-size="16" font-weight="700" fill="#7c3aed">${esc(bosonLabel)}</text>`,
      ].join("");
    }

    const heading = hideTitle
      ? "Particle Interaction Diagram"
      : `Feynman Diagram: ${d.title}`;
    const body = [
      `<text x="330" y="34" text-anchor="middle" font-size="16" font-weight="700" fill="#0f172a">${esc(heading)}</text>`,
      timeAxis,
      diagram,
    ].join("");

    return {
      visualFamily: "quantum-nuclear",
      svgMarkup: wrapSvg(
        "Feynman particle interaction diagram",
        "Upward-time Feynman interaction diagram showing fermions and an exchange boson",
        defs,
        body,
      ),
      rendererVersion: ALEVEL_CORE_AS_RENDERER_VERSION,
      publicNumbers: [],
      publicLabels: [],
    };
  },
};

/* -------------------------------------------------------------------------- */
/*  6. al-as-hadron-lepton-conservation (Section 3.2.1, quantum-nuclear)      */
/* -------------------------------------------------------------------------- */

interface ParticleRecord {
  readonly sym: string;
  readonly name: string;
  readonly q: number;
  readonly b: number;
  readonly le: number;
  readonly lmu: number;
  readonly s: number;
  readonly category: string;
  readonly quarks: string;
}

const PARTICLE_DATA: Readonly<Record<string, ParticleRecord>> = {
  p: { sym: "p", name: "proton", q: 1, b: 1, le: 0, lmu: 0, s: 0, category: "baryon hadron", quarks: "uud" },
  n: { sym: "n", name: "neutron", q: 0, b: 1, le: 0, lmu: 0, s: 0, category: "baryon hadron", quarks: "udd" },
  "pi+": { sym: "π⁺", name: "positive pion", q: 1, b: 0, le: 0, lmu: 0, s: 0, category: "meson hadron", quarks: "u d-bar" },
  "pi-": { sym: "π⁻", name: "negative pion", q: -1, b: 0, le: 0, lmu: 0, s: 0, category: "meson hadron", quarks: "d u-bar" },
  "pi0": { sym: "π⁰", name: "neutral pion", q: 0, b: 0, le: 0, lmu: 0, s: 0, category: "meson hadron", quarks: "u u-bar or d d-bar" },
  "K+": { sym: "K⁺", name: "positive kaon", q: 1, b: 0, le: 0, lmu: 0, s: 1, category: "strange meson", quarks: "u s-bar" },
  "K-": { sym: "K⁻", name: "negative kaon", q: -1, b: 0, le: 0, lmu: 0, s: -1, category: "strange meson", quarks: "s u-bar" },
  "K0": { sym: "K⁰", name: "neutral kaon", q: 0, b: 0, le: 0, lmu: 0, s: 1, category: "strange meson", quarks: "d s-bar" },
  "Lambda0": { sym: "Λ⁰", name: "lambda baryon", q: 0, b: 1, le: 0, lmu: 0, s: -1, category: "strange baryon", quarks: "uds" },
  "e-": { sym: "e⁻", name: "electron", q: -1, b: 0, le: 1, lmu: 0, s: 0, category: "fundamental lepton", quarks: "fundamental lepton no quarks" },
  "e+": { sym: "e⁺", name: "positron", q: 1, b: 0, le: -1, lmu: 0, s: 0, category: "fundamental antilepton", quarks: "fundamental lepton no quarks" },
  "mu-": { sym: "μ⁻", name: "muon", q: -1, b: 0, le: 0, lmu: 1, s: 0, category: "fundamental lepton", quarks: "fundamental lepton no quarks" },
  "mu+": { sym: "μ⁺", name: "antimuon", q: 1, b: 0, le: 0, lmu: -1, s: 0, category: "fundamental antilepton", quarks: "fundamental lepton no quarks" },
  "nu_e": { sym: "νₑ", name: "electron neutrino", q: 0, b: 0, le: 1, lmu: 0, s: 0, category: "fundamental lepton", quarks: "fundamental lepton no quarks" },
  "antinu_e": { sym: "ν̄ₑ", name: "electron antineutrino", q: 0, b: 0, le: -1, lmu: 0, s: 0, category: "fundamental antilepton", quarks: "fundamental lepton no quarks" },
  "nu_mu": { sym: "νμ", name: "muon neutrino", q: 0, b: 0, le: 0, lmu: 1, s: 0, category: "fundamental lepton", quarks: "fundamental lepton no quarks" },
  "antinu_mu": { sym: "ν̄μ", name: "muon antineutrino", q: 0, b: 0, le: 0, lmu: -1, s: 0, category: "fundamental antilepton", quarks: "fundamental lepton no quarks" },
  gamma: { sym: "γ", name: "photon", q: 0, b: 0, le: 0, lmu: 0, s: 0, category: "exchange boson", quarks: "gauge boson no quarks" },
};

const REACTION_IDS = [
  "strong-strange-pair",
  "weak-kaon-muon-decay",
  "weak-kaon-pion-decay",
  "weak-muon-decay",
  "forbidden-baryon",
  "forbidden-lepton-flavour",
  "forbidden-strong-strangeness",
  "forbidden-charge",
  "classification-baryon-meson",
  "classification-lepton-hadron",
] as const;

export type ReactionId = (typeof REACTION_IDS)[number];

interface ReactionDescriptor {
  readonly lhs: readonly string[];
  readonly rhs: readonly string[];
  readonly interactionClaimed: "strong" | "weak" | "electromagnetic";
  readonly missingIdxRhs?: number;
  readonly visualMode: "ledger" | "classification-tree";
  readonly particleClassSummary: string;
}

const REACTION_TABLE: Readonly<Record<ReactionId, ReactionDescriptor>> = {
  "strong-strange-pair": {
    lhs: ["pi-", "p"],
    rhs: ["K0", "Lambda0"],
    interactionClaimed: "strong",
    missingIdxRhs: 0,
    visualMode: "ledger",
    particleClassSummary: "strange particles are created in pairs via the strong interaction conserving strangeness",
  },
  "weak-kaon-muon-decay": {
    lhs: ["K+"],
    rhs: ["mu+", "nu_mu"],
    interactionClaimed: "weak",
    missingIdxRhs: 1,
    visualMode: "ledger",
    particleClassSummary: "kaon decays via the weak interaction changing strangeness by one",
  },
  "weak-kaon-pion-decay": {
    lhs: ["K-"],
    rhs: ["pi-", "pi0"],
    interactionClaimed: "weak",
    missingIdxRhs: 1,
    visualMode: "ledger",
    particleClassSummary: "kaon decays into pions via the weak interaction because strangeness is not conserved",
  },
  "weak-muon-decay": {
    lhs: ["mu-"],
    rhs: ["e-", "antinu_e", "nu_mu"],
    interactionClaimed: "weak",
    missingIdxRhs: 1,
    visualMode: "ledger",
    particleClassSummary: "muon decays into an electron electron antineutrino and muon neutrino conserving both lepton numbers",
  },
  "forbidden-baryon": {
    lhs: ["p", "p"],
    rhs: ["p", "pi+", "pi0"],
    interactionClaimed: "strong",
    visualMode: "ledger",
    particleClassSummary: "baryon number must be conserved in every interaction",
  },
  "forbidden-lepton-flavour": {
    lhs: ["mu-"],
    rhs: ["e-", "gamma"],
    interactionClaimed: "electromagnetic",
    visualMode: "ledger",
    particleClassSummary: "electron lepton number and muon lepton number are conserved separately",
  },
  "forbidden-strong-strangeness": {
    lhs: ["pi-", "p"],
    rhs: ["pi0", "Lambda0"],
    interactionClaimed: "strong",
    visualMode: "ledger",
    particleClassSummary: "strangeness must be conserved in strong interactions",
  },
  "forbidden-charge": {
    lhs: ["n"],
    rhs: ["p", "e+", "nu_e"],
    interactionClaimed: "weak",
    visualMode: "ledger",
    particleClassSummary: "electric charge is strictly conserved in all particle interactions",
  },
  "classification-baryon-meson": {
    lhs: ["p"],
    rhs: ["p"],
    interactionClaimed: "strong",
    visualMode: "classification-tree",
    particleClassSummary: "proton is the only stable free baryon composed of three quarks",
  },
  "classification-lepton-hadron": {
    lhs: ["mu-"],
    rhs: ["e-", "antinu_e", "nu_mu"],
    interactionClaimed: "weak",
    visualMode: "classification-tree",
    particleClassSummary: "leptons are fundamental particles that do not experience the strong nuclear force",
  },
};

function sumQuantum(keys: readonly string[], field: "q" | "b" | "le" | "lmu" | "s"): number {
  return keys.reduce((acc, k) => acc + PARTICLE_DATA[k][field], 0);
}

const hadronLeptonConservationPlugin: DomainKindPlugin = {
  domain: "quantum-nuclear",
  kind: "al-as-hadron-lepton-conservation",
  summary:
    "Section 3.2.1 hadron/lepton/kaon classification and exact Q, B, L_e, L_mu, S conservation checker for strong and weak interactions.",
  requiredFields: [
    { name: "kind", type: "string", enumValues: ["al-as-hadron-lepton-conservation"] },
    { name: "reactionId", type: "string", enumValues: REACTION_IDS },
  ],
  physicalConstraints: [
    "Q, B, L_e, and L_mu are strictly conserved in all physical interactions.",
    "Strangeness S is conserved in strong interactions (ΔS = 0) and may change by 0 or ±1 in weak interactions.",
  ],
  probeSpecs: [
    {
      kind: "al-as-hadron-lepton-conservation",
      reactionId: "strong-strange-pair",
    },
    {
      kind: "al-as-hadron-lepton-conservation",
      reactionId: "classification-baryon-meson",
    },
    {
      kind: "al-as-hadron-lepton-conservation",
      reactionId: "forbidden-lepton-flavour",
    },
  ],
  validate(spec): DomainValidationResult {
    const issues: string[] = [];
    if (spec.kind !== "al-as-hadron-lepton-conservation") {
      issues.push('kind must be "al-as-hadron-lepton-conservation"');
    }
    if (!isStringOneOf(spec.reactionId, REACTION_IDS)) {
      issues.push(`reactionId must be one of ${REACTION_IDS.join(", ")}`);
    }
    return { valid: issues.length === 0, issues };
  },
  solve(spec): DomainSolveOutput {
    const id = spec.reactionId as ReactionId;
    const rec = REACTION_TABLE[id];
    const deltaQ = sumQuantum(rec.rhs, "q") - sumQuantum(rec.lhs, "q");
    const deltaB = sumQuantum(rec.rhs, "b") - sumQuantum(rec.lhs, "b");
    const deltaLe = sumQuantum(rec.rhs, "le") - sumQuantum(rec.lhs, "le");
    const deltaLmu = sumQuantum(rec.rhs, "lmu") - sumQuantum(rec.lhs, "lmu");
    const deltaS = sumQuantum(rec.rhs, "s") - sumQuantum(rec.lhs, "s");

    let violatedLaw = "none all conservation laws satisfied";
    if (deltaQ !== 0) violatedLaw = "charge conservation";
    else if (deltaB !== 0) violatedLaw = "baryon number conservation";
    else if (deltaLe !== 0 || deltaLmu !== 0)
      violatedLaw = "lepton number conservation";
    else if (rec.interactionClaimed === "strong" && deltaS !== 0)
      violatedLaw = "strangeness conservation in a strong interaction";

    const isAllowedBool = violatedLaw === "none all conservation laws satisfied";
    let interactionClass = "forbidden interaction";
    if (isAllowedBool) {
      if (rec.interactionClaimed === "strong") {
        interactionClass = "strong interaction conserving strangeness";
      } else if (deltaS !== 0) {
        interactionClass = "weak interaction because strangeness changes";
      } else {
        interactionClass = "weak interaction conserving lepton numbers";
      }
    }

    const missingKey =
      rec.missingIdxRhs !== undefined ? rec.rhs[rec.missingIdxRhs] : rec.rhs[0];
    const missingP = PARTICLE_DATA[missingKey];

    return {
      solverId: "sixthphysics/al-as-hadron-lepton-conservation/1.0.0",
      quantities: {
        deltaQ,
        deltaB,
        deltaLe,
        deltaLmu,
        deltaS,
        isAllowed: isAllowedBool ? "allowed reaction" : "forbidden reaction",
        violatedLaw,
        interactionClass,
        missingParticle: missingP.name,
        missingQuarks: missingP.quarks,
        particleClassSummary: rec.particleClassSummary,
      },
    };
  },
  renderSvg(spec, options): DomainRenderOutput {
    const hidden = getHiddenSet(spec, options);
    const id = spec.reactionId as ReactionId;
    const rec = REACTION_TABLE[id];

    if (rec.visualMode === "classification-tree") {
      const hideLeaf = hidden.has("particleClassSummary");
      const body = [
        `<text x="320" y="34" text-anchor="middle" font-size="16" font-weight="700" fill="#0f172a">Classification of Subatomic Particles</text>`,
        `<rect x="230" y="56" width="180" height="40" rx="8" fill="#0f172a"/>`,
        `<text x="320" y="81" text-anchor="middle" font-size="14" font-weight="700" fill="#ffffff">Matter Particles</text>`,
        `<line x1="276" y1="96" x2="180" y2="140" stroke="#475569" stroke-width="2"/>`,
        `<line x1="364" y1="96" x2="472" y2="140" stroke="#475569" stroke-width="2"/>`,
        `<rect x="86" y="140" width="188" height="48" rx="8" fill="#dbeafe" stroke="#1d4ed8" stroke-width="2"/>`,
        `<text x="180" y="162" text-anchor="middle" font-size="14" font-weight="700" fill="#1e3a8a">Hadrons</text>`,
        `<text x="180" y="179" text-anchor="middle" font-size="11.5" fill="#1e40af">Feel strong nuclear force</text>`,
        `<rect x="378" y="140" width="188" height="48" rx="8" fill="#ecfdf5" stroke="#047857" stroke-width="2"/>`,
        `<text x="472" y="162" text-anchor="middle" font-size="14" font-weight="700" fill="#065f46">Leptons</text>`,
        `<text x="472" y="179" text-anchor="middle" font-size="11.5" fill="#047857">${hideLeaf ? "Group B" : "Fundamental particles"}</text>`,
        `<line x1="140" y1="188" x2="108" y2="236" stroke="#1d4ed8" stroke-width="2"/>`,
        `<line x1="220" y1="188" x2="262" y2="236" stroke="#1d4ed8" stroke-width="2"/>`,
        `<rect x="34" y="236" width="146" height="72" rx="8" fill="#f8fafc" stroke="#1d4ed8" stroke-width="1.6"/>`,
        `<text x="107" y="260" text-anchor="middle" font-size="13.5" font-weight="700" fill="#0f172a">Baryons (qqq)</text>`,
        `<text x="107" y="280" text-anchor="middle" font-size="11.5" fill="#334155">B = +1 (p, n, Λ⁰)</text>`,
        `<text x="107" y="298" text-anchor="middle" font-size="11" fill="#475569">${hideLeaf ? "Check stability" : "p is stable free baryon"}</text>`,
        `<rect x="196" y="236" width="146" height="72" rx="8" fill="#f8fafc" stroke="#1d4ed8" stroke-width="1.6"/>`,
        `<text x="269" y="260" text-anchor="middle" font-size="13.5" font-weight="700" fill="#0f172a">Mesons (qq̄)</text>`,
        `<text x="269" y="280" text-anchor="middle" font-size="11.5" fill="#334155">B = 0 (π, K)</text>`,
        `<text x="269" y="298" text-anchor="middle" font-size="11" fill="#475569">Kaons contain strange quark</text>`,
        `<rect x="378" y="236" width="188" height="72" rx="8" fill="#f8fafc" stroke="#047857" stroke-width="1.6"/>`,
        `<text x="472" y="260" text-anchor="middle" font-size="13.5" font-weight="700" fill="#0f172a">e⁻, μ⁻, νₑ, νμ</text>`,
        `<text x="472" y="280" text-anchor="middle" font-size="11.5" fill="#334155">B = 0, L = +1</text>`,
        `<text x="472" y="298" text-anchor="middle" font-size="11" fill="#475569">Weak &amp; EM interactions</text>`,
      ].join("");
      return {
        visualFamily: "quantum-nuclear",
        svgMarkup: wrapSvg(
          "Particle classification hierarchy",
          "Classification chart dividing hadrons into baryons and mesons alongside leptons",
          "",
          body,
        ),
        rendererVersion: ALEVEL_CORE_AS_RENDERER_VERSION,
        publicNumbers: [0, 1],
        publicLabels: ["B = +1 (p, n, Λ⁰)", "B = 0 (π, K)", "B = 0, L = +1"],
      };
    }

    const maskMissing = hidden.has("missingParticle") || hidden.has("missingQuarks");
    const lhsStr = rec.lhs.map((k) => PARTICLE_DATA[k].sym).join("  +  ");
    const rhsStr = rec.rhs
      .map((k, idx) =>
        maskMissing && rec.missingIdxRhs === idx ? "X" : PARTICLE_DATA[k].sym,
      )
      .join("  +  ");
    const cols = ["Q", "B", "Lₑ", "Lμ", "S"];
    const lhsVals = [
      sumQuantum(rec.lhs, "q"),
      sumQuantum(rec.lhs, "b"),
      sumQuantum(rec.lhs, "le"),
      sumQuantum(rec.lhs, "lmu"),
      sumQuantum(rec.lhs, "s"),
    ];
    const rhsVals = [
      sumQuantum(rec.rhs, "q"),
      sumQuantum(rec.rhs, "b"),
      sumQuantum(rec.rhs, "le"),
      sumQuantum(rec.rhs, "lmu"),
      sumQuantum(rec.rhs, "s"),
    ];
    const hideRhsRow =
      hidden.has("violatedLaw") ||
      hidden.has("isAllowed") ||
      hidden.has("interactionClass") ||
      maskMissing;

    const colCells = cols
      .map((c, idx) => {
        const cx = 210 + idx * 82;
        const lText = lhsVals[idx] > 0 ? `+${lhsVals[idx]}` : String(lhsVals[idx]);
        const rText = hideRhsRow
          ? "?"
          : rhsVals[idx] > 0
            ? `+${rhsVals[idx]}`
            : String(rhsVals[idx]);
        return [
          `<text x="${cx}" y="176" text-anchor="middle" font-size="13.5" font-weight="700" fill="#0f172a">${esc(c)}</text>`,
          `<text x="${cx}" y="220" text-anchor="middle" font-size="14" fill="#1d4ed8">${esc(lText)}</text>`,
          `<text x="${cx}" y="264" text-anchor="middle" font-size="14" fill="#047857">${esc(rText)}</text>`,
        ].join("");
      })
      .join("");

    const body = [
      `<text x="320" y="36" text-anchor="middle" font-size="16" font-weight="700" fill="#0f172a">Conservation Law Reaction Ledger</text>`,
      `<rect x="64" y="56" width="512" height="58" rx="10" fill="#eff6ff" stroke="#1d4ed8" stroke-width="1.8"/>`,
      `<text x="320" y="92" text-anchor="middle" font-size="20" font-weight="700" fill="#0f172a">${esc(lhsStr)}   →   ${esc(rhsStr)}</text>`,
      `<rect x="64" y="142" width="512" height="148" rx="10" fill="#f8fafc" stroke="#cbd5e1" stroke-width="1.5"/>`,
      `<line x1="64" y1="192" x2="576" y2="192" stroke="#cbd5e1" stroke-width="1.3"/>`,
      `<line x1="64" y1="238" x2="576" y2="238" stroke="#e2e8f0" stroke-width="1.2"/>`,
      `<text x="86" y="176" font-size="13" font-weight="700" fill="#475569">Side</text>`,
      `<text x="86" y="220" font-size="13" font-weight="600" fill="#1d4ed8">Before</text>`,
      `<text x="86" y="264" font-size="13" font-weight="600" fill="#047857">After</text>`,
      colCells,
      `<text x="320" y="324" text-anchor="middle" font-size="12" fill="#475569">Test conservation of Q, B, electron lepton number, muon lepton number, and strangeness S</text>`,
    ].join("");

    return {
      visualFamily: "quantum-nuclear",
      svgMarkup: wrapSvg(
        "Particle conservation law ledger",
        "Table comparing quantum numbers before and after a subatomic particle interaction",
        "",
        body,
      ),
      rendererVersion: ALEVEL_CORE_AS_RENDERER_VERSION,
      publicNumbers: lhsVals,
      publicLabels: lhsVals.map((v) => (v > 0 ? `+${v}` : String(v))),
    };
  },
};

/* -------------------------------------------------------------------------- */
/*  7. al-as-photoelectric-wave-failure (Section 3.2.2, quantum-nuclear)      */
/* -------------------------------------------------------------------------- */

const PHOTO_MODES = ["ek-vs-f", "electroscope", "iv-stopping"] as const;
const ELECTRO_POLARITIES = ["negative", "positive"] as const;
const RAD_BANDS = ["uv", "visible"] as const;

const photoelectricWaveFailurePlugin: DomainKindPlugin = {
  domain: "quantum-nuclear",
  kind: "al-as-photoelectric-wave-failure",
  summary:
    "Section 3.2.2 photoelectric equation hf = phi + Ek(max) = phi + eVs, wave-model failure 6m LoR, gold-leaf electroscope, and Ek-f/I-V graphs.",
  requiredFields: [
    { name: "kind", type: "string", enumValues: ["al-as-photoelectric-wave-failure"] },
    { name: "visualMode", type: "string", enumValues: PHOTO_MODES },
    { name: "workFunctionEv", type: "number", unit: "eV", bounds: "1.5 <= phi <= 6.0" },
    { name: "incidentFrequencyTHz", type: "number", unit: "THz", bounds: "300 <= f <= 2500" },
  ],
  optionalFields: [
    { name: "metalName", type: "string" },
    { name: "secondMetalWorkFunctionEv", type: "number", unit: "eV", bounds: "1.5 <= phi2 <= 6.5" },
    { name: "platePolarity", type: "string", enumValues: ELECTRO_POLARITIES },
    { name: "radiationBand", type: "string", enumValues: RAD_BANDS },
  ],
  physicalConstraints: [
    "Einstein photoelectric equation: hf = phi + Ek(max) with Ek(max) = e Vs.",
    "One-to-one photon-electron interaction explains threshold frequency and instantaneous emission.",
  ],
  probeSpecs: [
    {
      kind: "al-as-photoelectric-wave-failure",
      visualMode: "ek-vs-f",
      metalName: "zinc",
      workFunctionEv: 4.3,
      secondMetalWorkFunctionEv: 2.3,
      incidentFrequencyTHz: 1450,
    },
    {
      kind: "al-as-photoelectric-wave-failure",
      visualMode: "electroscope",
      metalName: "zinc",
      workFunctionEv: 4.3,
      incidentFrequencyTHz: 1200,
      platePolarity: "negative",
      radiationBand: "uv",
    },
    {
      kind: "al-as-photoelectric-wave-failure",
      visualMode: "iv-stopping",
      metalName: "caesium",
      workFunctionEv: 2.1,
      incidentFrequencyTHz: 900,
    },
  ],
  validate(spec): DomainValidationResult {
    const issues: string[] = [];
    if (spec.kind !== "al-as-photoelectric-wave-failure") {
      issues.push('kind must be "al-as-photoelectric-wave-failure"');
    }
    if (!isStringOneOf(spec.visualMode, PHOTO_MODES)) {
      issues.push(`visualMode must be one of ${PHOTO_MODES.join(", ")}`);
    }
    if (!isFiniteNum(spec.workFunctionEv) || spec.workFunctionEv < 1.5 || spec.workFunctionEv > 6.5) {
      issues.push("workFunctionEv must lie in [1.5, 6.5] eV");
    }
    if (
      !isFiniteNum(spec.incidentFrequencyTHz) ||
      spec.incidentFrequencyTHz < 300 ||
      spec.incidentFrequencyTHz > 2500
    ) {
      issues.push("incidentFrequencyTHz must lie in [300, 2500] THz");
    }
    if (
      spec.platePolarity !== undefined &&
      !isStringOneOf(spec.platePolarity, ELECTRO_POLARITIES)
    ) {
      issues.push("platePolarity must be negative or positive");
    }
    if (
      spec.radiationBand !== undefined &&
      !isStringOneOf(spec.radiationBand, RAD_BANDS)
    ) {
      issues.push("radiationBand must be uv or visible");
    }
    return { valid: issues.length === 0, issues };
  },
  solve(spec): DomainSolveOutput {
    const phiEv = spec.workFunctionEv as number;
    const fTHz = spec.incidentFrequencyTHz as number;
    const fHz = fTHz * 1e12;
    const phiJ = phiEv * AQA_E_C;
    const thresholdFrequencyHz = phiJ / AQA_H_JS;
    const thresholdFrequencyTHz = thresholdFrequencyHz / 1e12;
    const photonEnergyJ = AQA_H_JS * fHz;
    const photonEnergyEv = photonEnergyJ / AQA_E_C;
    const emitsElectrons = photonEnergyJ >= phiJ;
    const ekMaxJ = emitsElectrons ? photonEnergyJ - phiJ : 0;
    const ekMaxEv = ekMaxJ / AQA_E_C;
    const stoppingPotentialV = ekMaxJ / AQA_E_C;

    const polarity = isStringOneOf(spec.platePolarity, ELECTRO_POLARITIES)
      ? spec.platePolarity
      : "negative";
    const band = isStringOneOf(spec.radiationBand, RAD_BANDS)
      ? spec.radiationBand
      : emitsElectrons
        ? "uv"
        : "visible";

    let electroscopeOutcome: string;
    if (polarity === "positive") {
      electroscopeOutcome =
        "gold leaf stays deflected because any freed electrons are attracted back to the positive zinc plate";
    } else if (band === "visible" || !emitsElectrons) {
      electroscopeOutcome =
        "gold leaf remains deflected because photon frequency is below the threshold frequency";
    } else {
      electroscopeOutcome =
        "gold leaf falls rapidly as photoelectrons are emitted from the negatively charged zinc plate";
    }

    return {
      solverId: "sixthphysics/al-as-photoelectric-wave-failure/1.0.0",
      quantities: {
        workFunctionJ: phiJ,
        thresholdFrequencyHz,
        thresholdFrequencyTHz,
        photonEnergyJ,
        photonEnergyEv,
        ekMaxJ,
        ekMaxEv,
        stoppingPotentialV,
        emitsElectrons,
        graphGradientMeaning: "gradient equals the Planck constant for every metal surface",
        waveFailurePoint:
          "wave theory predicts emission at any frequency after energy accumulates whereas experiment shows a threshold frequency and instantaneous emission",
        electroscopeOutcome,
        intensityVsFreqEffect:
          "increasing intensity increases photocurrent while stopping potential remains unchanged",
        workFunctionDefinition:
          "minimum energy required to remove an electron from the metal surface",
        stoppingPotentialRule:
          "minimum potential difference needed to stop the maximum kinetic energy photoelectrons",
        lorAnchor:
          "discrete photons interact one to one with surface electrons overcoming the work function",
      },
      publicNumbers: [phiEv, fTHz],
    };
  },
  renderSvg(spec, options): DomainRenderOutput {
    const hidden = getHiddenSet(spec, options);
    const mode = spec.visualMode as (typeof PHOTO_MODES)[number];
    const phi1 = spec.workFunctionEv as number;
    const phi2 = isPosNum(spec.secondMetalWorkFunctionEv)
      ? spec.secondMetalWorkFunctionEv
      : Math.max(1.8, phi1 - 1.6);
    const defs = arrowMarkerDef("arr-pe", "#0f172a");
    const publicNumbers: number[] = [];
    const publicLabels: string[] = [];

    if (mode === "electroscope") {
      const polarity = isStringOneOf(spec.platePolarity, ELECTRO_POLARITIES)
        ? spec.platePolarity
        : "negative";
      const band = isStringOneOf(spec.radiationBand, RAD_BANDS)
        ? spec.radiationBand
        : "uv";
      const signSym = polarity === "negative" ? "−" : "+";
      const beamColor = band === "uv" ? "#7c3aed" : "#d97706";
      const beamLabel = band === "uv" ? "UV radiation" : "Visible light";
      const body = [
        `<text x="320" y="34" text-anchor="middle" font-size="16" font-weight="700" fill="#0f172a">Gold-Leaf Electroscope Photoelectric Demonstration</text>`,
        // Incoming beam
        `<path d="${wavyPath(112, 74, 240, 122, 5, 7)}" fill="none" stroke="${beamColor}" stroke-width="2.4"/>`,
        `<path d="${wavyPath(128, 58, 256, 106, 5, 7)}" fill="none" stroke="${beamColor}" stroke-width="2.4"/>`,
        `<text x="116" y="114" font-size="13" font-weight="700" fill="${beamColor}">${esc(beamLabel)}</text>`,
        // Zinc plate
        `<rect x="218" y="122" width="136" height="14" rx="4" fill="#94a3b8" stroke="#334155" stroke-width="1.8"/>`,
        `<text x="372" y="133" font-size="12.5" font-weight="600" fill="#0f172a">Clean zinc plate (${signSym})</text>`,
        // Insulating collar & case
        `<rect x="196" y="170" width="180" height="154" rx="10" fill="#f8fafc" stroke="#475569" stroke-width="2"/>`,
        `<rect x="266" y="160" width="40" height="20" rx="3" fill="#475569"/>`,
        // Stem and gold leaf
        `<line x1="286" y1="136" x2="286" y2="294" stroke="#b45309" stroke-width="4.5"/>`,
        `<line x1="286" y1="214" x2="342" y2="278" stroke="#eab308" stroke-width="3.6"/>`,
        `<text x="394" y="246" font-size="12.5" fill="#334155">Brass stem (${signSym})</text>`,
        `<text x="394" y="274" font-size="12.5" fill="#a16207">Deflected gold leaf (${signSym})</text>`,
        `<text x="234" y="116" font-size="14" font-weight="700" fill="#dc2626">${signSym}  ${signSym}  ${signSym}</text>`,
      ].join("");
      return {
        visualFamily: "quantum-nuclear",
        svgMarkup: wrapSvg(
          "Gold-leaf electroscope photoelectric apparatus",
          "Charged gold-leaf electroscope topped with a clean zinc plate under incident light",
          defs,
          body,
        ),
        rendererVersion: ALEVEL_CORE_AS_RENDERER_VERSION,
        publicNumbers,
        publicLabels,
      };
    }

    if (mode === "iv-stopping") {
      const hideVs = hidden.has("stoppingPotentialV") || hidden.has("intensityVsFreqEffect");
      const body = [
        `<text x="320" y="32" text-anchor="middle" font-size="15.5" font-weight="700" fill="#0f172a">Photoelectric Current versus Collector Potential Difference</text>`,
        `<line x1="88" y1="274" x2="584" y2="274" stroke="#0f172a" stroke-width="2" marker-end="url(#arr-pe)"/>`,
        `<line x1="290" y1="306" x2="290" y2="62" stroke="#0f172a" stroke-width="2" marker-end="url(#arr-pe)"/>`,
        `<text x="580" y="294" text-anchor="end" font-size="12.5" font-weight="600" fill="#0f172a">Potential difference V</text>`,
        `<text x="302" y="72" font-size="12.5" font-weight="600" fill="#0f172a">Photocurrent I</text>`,
        // Curve 1 (high intensity)
        `<path d="M 164 274 C 206 270 250 184 316 112 L 548 112" fill="none" stroke="#1d4ed8" stroke-width="2.8"/>`,
        // Curve 2 (lower intensity, same stopping potential)
        `<path d="M 164 274 C 214 272 256 226 318 186 L 548 186" fill="none" stroke="#047857" stroke-width="2.6" stroke-dasharray="7 4"/>`,
        `<circle cx="164" cy="274" r="5" fill="#dc2626"/>`,
        `<text x="164" y="298" text-anchor="middle" font-size="13" font-weight="700" fill="#dc2626">${hideVs ? "−V₀" : "−Vs"}</text>`,
        `<text x="454" y="102" font-size="12.5" font-weight="600" fill="#1d4ed8">Curve P</text>`,
        `<text x="454" y="176" font-size="12.5" font-weight="600" fill="#047857">Curve Q</text>`,
      ].join("");
      return {
        visualFamily: "graphs",
        svgMarkup: wrapSvg(
          "Photoelectric current versus voltage graph",
          "Photoelectric current against potential difference for two radiation beams with the same stopping potential",
          defs,
          body,
        ),
        rendererVersion: ALEVEL_CORE_AS_RENDERER_VERSION,
        publicNumbers,
        publicLabels,
      };
    }

    // ek-vs-f parallel lines for two metals
    const hideIntercept =
      hidden.has("thresholdFrequencyHz") ||
      hidden.has("thresholdFrequencyTHz") ||
      hidden.has("workFunctionJ") ||
      hidden.has("graphGradientMeaning");
    const body = [
      `<text x="320" y="32" text-anchor="middle" font-size="15.5" font-weight="700" fill="#0f172a">Maximum Photoelectron Kinetic Energy versus Frequency</text>`,
      `<line x1="120" y1="210" x2="584" y2="210" stroke="#0f172a" stroke-width="2" marker-end="url(#arr-pe)"/>`,
      `<line x1="120" y1="322" x2="120" y2="56" stroke="#0f172a" stroke-width="2" marker-end="url(#arr-pe)"/>`,
      `<text x="580" y="232" text-anchor="end" font-size="12.5" font-weight="600" fill="#0f172a">Frequency f</text>`,
      `<text x="132" y="68" font-size="12.5" font-weight="600" fill="#0f172a">${subLabel("E", "k(max)", 13)}</text>`,
      // Parallel line A (lower work function)
      `<line x1="120" y1="266" x2="232" y2="210" stroke="#047857" stroke-width="2" stroke-dasharray="5 4"/>`,
      `<line x1="232" y1="210" x2="480" y2="86" stroke="#047857" stroke-width="2.8"/>`,
      // Parallel line B (higher work function)
      `<line x1="120" y1="308" x2="316" y2="210" stroke="#1d4ed8" stroke-width="2" stroke-dasharray="5 4"/>`,
      `<line x1="316" y1="210" x2="548" y2="94" stroke="#1d4ed8" stroke-width="2.8"/>`,
      `<circle cx="232" cy="210" r="4.5" fill="#047857"/>`,
      `<circle cx="316" cy="210" r="4.5" fill="#1d4ed8"/>`,
      `<text x="232" y="232" text-anchor="middle" font-size="12.5" font-weight="600" fill="#047857">${hideIntercept ? "f₁" : subLabel("f", "0A", 12)}</text>`,
      `<text x="316" y="232" text-anchor="middle" font-size="12.5" font-weight="600" fill="#1d4ed8">${hideIntercept ? "f₂" : subLabel("f", "0B", 12)}</text>`,
      `<text x="108" y="270" text-anchor="end" font-size="12" fill="#047857">${hideIntercept ? "−y₁" : "−φA"}</text>`,
      `<text x="108" y="312" text-anchor="end" font-size="12" fill="#1d4ed8">${hideIntercept ? "−y₂" : "−φB"}</text>`,
      `<text x="488" y="84" font-size="12.5" font-weight="700" fill="#047857">Metal A</text>`,
      `<text x="554" y="96" font-size="12.5" font-weight="700" fill="#1d4ed8">Metal B</text>`,
      `<text x="412" y="302" font-size="12" fill="#475569">${phi2 < phi1 ? "Parallel lines: identical gradient" : "Linear relation above threshold"}</text>`,
    ].join("");
    return {
      visualFamily: "graphs",
      svgMarkup: wrapSvg(
        "Photoelectric kinetic energy versus frequency graph",
        "Graph showing parallel straight lines of maximum photoelectron kinetic energy against frequency for two metals",
        defs,
        body,
      ),
      rendererVersion: ALEVEL_CORE_AS_RENDERER_VERSION,
      publicNumbers,
      publicLabels,
    };
  },
};

/* -------------------------------------------------------------------------- */
/*  8. al-as-fluorescent-spectra-ediff (Section 3.2.2, quantum-nuclear)       */
/* -------------------------------------------------------------------------- */

const FLUOR_MODES = [
  "fluorescent-tube",
  "energy-levels",
  "electron-diffraction",
] as const;

const fluorescentSpectraEdiffPlugin: DomainKindPlugin = {
  domain: "quantum-nuclear",
  kind: "al-as-fluorescent-spectra-ediff",
  summary:
    "Section 3.2.2 fluorescent tube excitation/phosphor cascade 6m LoR, discrete atomic line spectra transitions, and electron diffraction de Broglie wavelength.",
  requiredFields: [
    { name: "kind", type: "string", enumValues: ["al-as-fluorescent-spectra-ediff"] },
    { name: "visualMode", type: "string", enumValues: FLUOR_MODES },
    { name: "upperLevelEv", type: "number", unit: "eV", bounds: "-15 <= E_upper < 0" },
    { name: "lowerLevelEv", type: "number", unit: "eV", bounds: "-20 <= E_lower < E_upper" },
    { name: "numLevels", type: "integer", bounds: "2 <= n <= 6" },
  ],
  optionalFields: [
    { name: "incidentElectronEv", type: "number", unit: "eV", bounds: "E > 0" },
    { name: "anodeVoltageV", type: "number", unit: "V", bounds: "500 <= V <= 15000" },
  ],
  physicalConstraints: [
    "upperLevelEv must be strictly greater (less negative) than lowerLevelEv.",
    "Distinct emission line count among n levels is n(n - 1) / 2.",
    "Electron de Broglie wavelength is h / sqrt(2 m_e e V).",
  ],
  probeSpecs: [
    {
      kind: "al-as-fluorescent-spectra-ediff",
      visualMode: "fluorescent-tube",
      upperLevelEv: -5.5,
      lowerLevelEv: -10.4,
      numLevels: 4,
      incidentElectronEv: 7.2,
    },
    {
      kind: "al-as-fluorescent-spectra-ediff",
      visualMode: "electron-diffraction",
      upperLevelEv: -3.4,
      lowerLevelEv: -13.6,
      numLevels: 4,
      anodeVoltageV: 4000,
    },
  ],
  validate(spec): DomainValidationResult {
    const issues: string[] = [];
    if (spec.kind !== "al-as-fluorescent-spectra-ediff") {
      issues.push('kind must be "al-as-fluorescent-spectra-ediff"');
    }
    if (!isStringOneOf(spec.visualMode, FLUOR_MODES)) {
      issues.push(`visualMode must be one of ${FLUOR_MODES.join(", ")}`);
    }
    if (!isFiniteNum(spec.upperLevelEv) || !isFiniteNum(spec.lowerLevelEv)) {
      issues.push("upperLevelEv and lowerLevelEv must be finite numbers");
    } else if (spec.upperLevelEv <= spec.lowerLevelEv || spec.upperLevelEv >= 0) {
      issues.push("Must satisfy lowerLevelEv < upperLevelEv < 0");
    }
    if (!isIntInRange(spec.numLevels, 2, 6)) {
      issues.push("numLevels must be an integer in [2, 6]");
    }
    if (
      spec.anodeVoltageV !== undefined &&
      (!isFiniteNum(spec.anodeVoltageV) || spec.anodeVoltageV < 500 || spec.anodeVoltageV > 20000)
    ) {
      issues.push("anodeVoltageV must lie in [500, 20000] V");
    }
    return { valid: issues.length === 0, issues };
  },
  solve(spec): DomainSolveOutput {
    const eUp = spec.upperLevelEv as number;
    const eLow = spec.lowerLevelEv as number;
    const n = spec.numLevels as number;
    const deltaEEv = eUp - eLow;
    const deltaEJ = deltaEEv * AQA_E_C;
    const photonFrequencyHz = deltaEJ / AQA_H_JS;
    const photonWavelengthM = (AQA_H_JS * AQA_C_MS) / deltaEJ;
    const photonWavelengthNm = photonWavelengthM * 1e9;
    const distinctEmissionLines = (n * (n - 1)) / 2;

    const incEv = isPosNum(spec.incidentElectronEv)
      ? spec.incidentElectronEv
      : deltaEEv + 2.0;
    const scatteredElectronEv = Math.max(0, incEv - deltaEEv);
    const anodeV = isPosNum(spec.anodeVoltageV) ? spec.anodeVoltageV : 4000;
    const electronMomentumKgMs = Math.sqrt(2 * AQA_ME_KG * AQA_E_C * anodeV);
    const deBroglieWavelengthM = AQA_H_JS / electronMomentumKgMs;
    const deBroglieWavelengthPm = deBroglieWavelengthM * 1e12;

    return {
      solverId: "sixthphysics/al-as-fluorescent-spectra-ediff/1.0.0",
      quantities: {
        deltaEEv,
        deltaEJ,
        photonFrequencyHz,
        photonWavelengthM,
        photonWavelengthNm,
        distinctEmissionLines,
        scatteredElectronEv,
        electronMomentumKgMs,
        deBroglieWavelengthM,
        deBroglieWavelengthPm,
        ringRadiusTrend:
          "diffraction rings move closer together as de Broglie wavelength decreases",
        excitationMechanism:
          "free electrons collide with orbital atomic electrons exciting them to discrete higher levels",
        phosphorCascadeRule:
          "phosphor coating absorbs ultraviolet photons and de excites in multiple smaller steps emitting visible light",
        waveEvidenceRule:
          "electron diffraction demonstrates wave behaviour when de Broglie wavelength matches atomic spacing",
        lorAnchor:
          "colliding free electrons excite mercury orbital electrons emitting ultraviolet photons absorbed by phosphor coating",
      },
      publicNumbers: [eUp, eLow, n],
    };
  },
  renderSvg(spec, options): DomainRenderOutput {
    const hidden = getHiddenSet(spec, options);
    const mode = spec.visualMode as (typeof FLUOR_MODES)[number];
    const eUp = spec.upperLevelEv as number;
    const eLow = spec.lowerLevelEv as number;
    const anodeV = isPosNum(spec.anodeVoltageV) ? spec.anodeVoltageV : 4000;
    const defs = [
      arrowMarkerDef("arr-fl-b", "#1d4ed8"),
      arrowMarkerDef("arr-fl-v", "#7c3aed"),
      arrowMarkerDef("arr-fl-g", "#047857"),
    ].join("");
    const publicNumbers: number[] = [];
    const publicLabels: string[] = [];

    if (mode === "electron-diffraction") {
      const hideV = hidden.has("anodeVoltageV") || hidden.has("deBroglieWavelengthM");
      if (!hideV) publicNumbers.push(anodeV);
      const body = [
        `<text x="320" y="34" text-anchor="middle" font-size="16" font-weight="700" fill="#0f172a">Electron Diffraction Through Polycrystalline Graphite</text>`,
        // Evacuated tube outline
        `<path d="M 60 144 L 288 144 L 380 86 L 444 86 A 94 94 0 0 1 444 274 L 380 274 L 288 216 L 60 216 Z" fill="#f8fafc" stroke="#475569" stroke-width="2"/>`,
        // Electron gun
        `<rect x="78" y="160" width="38" height="40" rx="4" fill="#cbd5e1" stroke="#334155" stroke-width="1.6"/>`,
        `<text x="97" y="185" text-anchor="middle" font-size="11.5" font-weight="700" fill="#0f172a">Gun</text>`,
        `<line x1="116" y1="180" x2="262" y2="180" stroke="#1d4ed8" stroke-width="2.6" marker-end="url(#arr-fl-b)"/>`,
        `<text x="188" y="168" text-anchor="middle" font-size="12" font-weight="600" fill="#1d4ed8">${hideV ? "Anode p.d. V" : `V = ${anodeV} V`}</text>`,
        // Graphite target
        `<rect x="272" y="148" width="10" height="64" fill="#0f172a"/>`,
        `<text x="277" y="238" text-anchor="middle" font-size="11.5" font-weight="600" fill="#0f172a">Thin graphite</text>`,
        // Diffracted beam cones
        `<line x1="282" y1="180" x2="432" y2="122" stroke="#1d4ed8" stroke-width="1.8" stroke-dasharray="5 3"/>`,
        `<line x1="282" y1="180" x2="432" y2="238" stroke="#1d4ed8" stroke-width="1.8" stroke-dasharray="5 3"/>`,
        `<line x1="282" y1="180" x2="444" y2="180" stroke="#1d4ed8" stroke-width="1.8"/>`,
        // Screen view inset
        `<circle cx="546" cy="180" r="64" fill="#0f172a" stroke="#334155" stroke-width="2"/>`,
        `<circle cx="546" cy="180" r="46" fill="none" stroke="#22c55e" stroke-width="3.2"/>`,
        `<circle cx="546" cy="180" r="24" fill="none" stroke="#4ade80" stroke-width="3.6"/>`,
        `<circle cx="546" cy="180" r="5" fill="#86efac"/>`,
        `<text x="546" y="268" text-anchor="middle" font-size="12" font-weight="600" fill="#0f172a">Fluorescent screen</text>`,
        `<text x="546" y="286" text-anchor="middle" font-size="11.5" fill="#475569">Concentric rings</text>`,
      ].join("");
      return {
        visualFamily: "quantum-nuclear",
        svgMarkup: wrapSvg(
          "Electron diffraction tube apparatus",
          "Evacuated electron diffraction tube with thin graphite target producing concentric rings on a fluorescent screen",
          defs,
          body,
        ),
        rendererVersion: ALEVEL_CORE_AS_RENDERER_VERSION,
        publicNumbers,
        publicLabels,
      };
    }

    if (mode === "fluorescent-tube") {
      const hideCascade = hidden.has("phosphorCascadeRule") || hidden.has("lorAnchor");
      const body = [
        `<text x="320" y="34" text-anchor="middle" font-size="16" font-weight="700" fill="#0f172a">Fluorescent Tube Cutaway Schematic</text>`,
        // Tube outer wall + phosphor lining
        `<rect x="66" y="96" width="508" height="164" rx="18" fill="#fef9c3" stroke="#ca8a04" stroke-width="4"/>`,
        `<rect x="78" y="108" width="484" height="140" rx="12" fill="#f8fafc" stroke="#94a3b8" stroke-width="1.5"/>`,
        // Electrodes
        `<rect x="86" y="156" width="18" height="44" rx="3" fill="#475569"/>`,
        `<rect x="536" y="156" width="18" height="44" rx="3" fill="#475569"/>`,
        `<text x="95" y="220" text-anchor="middle" font-size="11.5" font-weight="600" fill="#334155">− Electrode</text>`,
        `<text x="545" y="220" text-anchor="middle" font-size="11.5" font-weight="600" fill="#334155">+ Electrode</text>`,
        // Free electron colliding with Hg atom
        `<circle cx="154" cy="178" r="7" fill="#1d4ed8"/>`,
        `<text x="154" y="160" text-anchor="middle" font-size="12" font-weight="700" fill="#1d4ed8">e⁻</text>`,
        `<line x1="164" y1="178" x2="254" y2="178" stroke="#1d4ed8" stroke-width="2.4" marker-end="url(#arr-fl-b)"/>`,
        `<circle cx="282" cy="178" r="22" fill="#e0e7ff" stroke="#4338ca" stroke-width="2"/>`,
        `<text x="282" y="183" text-anchor="middle" font-size="13.5" font-weight="700" fill="#312e81">Hg</text>`,
        // UV photon to phosphor wall
        `<path d="${wavyPath(298, 162, 378, 108, 4, 6)}" fill="none" stroke="#7c3aed" stroke-width="2.4"/>`,
        `<text x="358" y="148" font-size="12.5" font-weight="700" fill="#7c3aed">${hideCascade ? "Photon A" : "UV photon"}</text>`,
        // Visible photon exiting
        `<path d="${wavyPath(390, 96, 444, 52, 4, 5)}" fill="none" stroke="#047857" stroke-width="2.4"/>`,
        `<text x="456" y="68" font-size="12.5" font-weight="700" fill="#047857">${hideCascade ? "Photon B" : "Visible light"}</text>`,
        `<text x="320" y="294" text-anchor="middle" font-size="12.5" fill="#475569">Low-pressure mercury vapour inside phosphor-coated glass wall</text>`,
      ].join("");
      return {
        visualFamily: "quantum-nuclear",
        svgMarkup: wrapSvg(
          "Fluorescent tube cutaway schematic",
          "Cutaway schematic of a fluorescent tube containing mercury vapour and a phosphor inner coating",
          defs,
          body,
        ),
        rendererVersion: ALEVEL_CORE_AS_RENDERER_VERSION,
        publicNumbers,
        publicLabels,
      };
    }

    // Discrete energy level ladder
    publicNumbers.push(eUp, eLow);
    const eMid = Number(((eUp + eLow) / 2).toFixed(2));
    const levels = [
      { y: 74, label: "0 eV (ionisation)", val: "0" },
      { y: 126, label: `${eUp.toFixed(1)} eV`, val: String(eUp) },
      { y: 202, label: `${eMid.toFixed(1)} eV`, val: String(eMid) },
      { y: 288, label: `${eLow.toFixed(1)} eV (ground)`, val: String(eLow) },
    ];
    publicLabels.push(`${eUp.toFixed(1)} eV`, `${eLow.toFixed(1)} eV (ground)`);
    const lines = levels
      .map(
        (lv, idx) =>
          `<line x1="120" y1="${lv.y}" x2="430" y2="${lv.y}" stroke="${idx === 0 ? "#64748b" : "#0f172a"}" stroke-width="${idx === 0 ? 1.6 : 2.4}" ${idx === 0 ? 'stroke-dasharray="6 4"' : ""}/><text x="444" y="${lv.y + 5}" font-size="13" font-weight="600" fill="#0f172a">${esc(lv.label)}</text>`,
      )
      .join("");
    const body = [
      `<text x="320" y="34" text-anchor="middle" font-size="16" font-weight="700" fill="#0f172a">Atomic Energy Level Transitions</text>`,
      lines,
      `<line x1="256" y1="126" x2="256" y2="282" stroke="#7c3aed" stroke-width="2.8" marker-end="url(#arr-fl-v)"/>`,
      `<text x="270" y="182" font-size="13" font-weight="700" fill="#7c3aed">Transition T</text>`,
      `<text x="320" y="332" text-anchor="middle" font-size="12" fill="#475569">Discrete bound atomic energy states (not to scale)</text>`,
    ].join("");
    return {
      visualFamily: "quantum-nuclear",
      svgMarkup: wrapSvg(
        "Atomic energy level diagram",
        "Discrete atomic energy level diagram showing a downward photon emission transition",
        defs,
        body,
      ),
      rendererVersion: ALEVEL_CORE_AS_RENDERER_VERSION,
      publicNumbers,
      publicLabels,
    };
  },
};

/* -------------------------------------------------------------------------- */
/*  9. al-as-polarisation-stationary-waves (Section 3.3.1, waves)             */
/* -------------------------------------------------------------------------- */

const WAVE_AS_MODES = ["polarisation", "stationary-wave"] as const;
const POL_SCENARIOS = [
  "crossed-polaroids",
  "water-glare",
  "tv-aerial",
  "longitudinal-sound",
] as const;
const POINT_PAIRS = ["same-loop", "adjacent-loops", "node-antinode"] as const;

const polarisationStationaryPlugin: DomainKindPlugin = {
  domain: "waves",
  kind: "al-as-polarisation-stationary-waves",
  summary:
    "Section 3.3.1 plane polarisation (glare, aerials, transverse-only proof 6m LoR) and stationary vs progressive wave phase, amplitude, and energy transfer.",
  requiredFields: [
    { name: "kind", type: "string", enumValues: ["al-as-polarisation-stationary-waves"] },
    { name: "visualMode", type: "string", enumValues: WAVE_AS_MODES },
  ],
  optionalFields: [
    { name: "polarisationScenario", type: "string", enumValues: POL_SCENARIOS },
    { name: "harmonicN", type: "integer", bounds: "1 <= n <= 4" },
    { name: "stringLengthM", type: "number", unit: "m", bounds: "0.2 <= L <= 3.0" },
    { name: "frequencyHz", type: "number", unit: "Hz", bounds: "10 <= f <= 800" },
    { name: "pointPair", type: "string", enumValues: POINT_PAIRS },
  ],
  physicalConstraints: [
    "Only transverse waves can be plane-polarised.",
    "Adjacent nodes on a stationary wave are separated by half a wavelength; points between adjacent nodes are in phase and points across a node are in antiphase (pi rad).",
  ],
  probeSpecs: [
    {
      kind: "al-as-polarisation-stationary-waves",
      visualMode: "polarisation",
      polarisationScenario: "water-glare",
    },
    {
      kind: "al-as-polarisation-stationary-waves",
      visualMode: "stationary-wave",
      harmonicN: 3,
      stringLengthM: 1.2,
      frequencyHz: 150,
      pointPair: "adjacent-loops",
    },
  ],
  validate(spec): DomainValidationResult {
    const issues: string[] = [];
    if (spec.kind !== "al-as-polarisation-stationary-waves") {
      issues.push('kind must be "al-as-polarisation-stationary-waves"');
    }
    if (!isStringOneOf(spec.visualMode, WAVE_AS_MODES)) {
      issues.push(`visualMode must be one of ${WAVE_AS_MODES.join(", ")}`);
    }
    if (
      spec.polarisationScenario !== undefined &&
      !isStringOneOf(spec.polarisationScenario, POL_SCENARIOS)
    ) {
      issues.push(`polarisationScenario must be one of ${POL_SCENARIOS.join(", ")}`);
    }
    if (spec.harmonicN !== undefined && !isIntInRange(spec.harmonicN, 1, 4)) {
      issues.push("harmonicN must be an integer in [1, 4]");
    }
    if (spec.stringLengthM !== undefined && (!isPosNum(spec.stringLengthM) || spec.stringLengthM > 5)) {
      issues.push("stringLengthM must lie in (0, 5] m");
    }
    if (spec.frequencyHz !== undefined && (!isPosNum(spec.frequencyHz) || spec.frequencyHz > 2000)) {
      issues.push("frequencyHz must lie in (0, 2000] Hz");
    }
    if (spec.pointPair !== undefined && !isStringOneOf(spec.pointPair, POINT_PAIRS)) {
      issues.push(`pointPair must be one of ${POINT_PAIRS.join(", ")}`);
    }
    return { valid: issues.length === 0, issues };
  },
  solve(spec): DomainSolveOutput {
    const n = isIntInRange(spec.harmonicN, 1, 4) ? spec.harmonicN : 3;
    const L = isPosNum(spec.stringLengthM) ? spec.stringLengthM : 1.2;
    const f = isPosNum(spec.frequencyHz) ? spec.frequencyHz : 120;
    const polScen = isStringOneOf(spec.polarisationScenario, POL_SCENARIOS)
      ? spec.polarisationScenario
      : "crossed-polaroids";
    const pair = isStringOneOf(spec.pointPair, POINT_PAIRS)
      ? spec.pointPair
      : "adjacent-loops";

    const wavelengthM = (2 * L) / n;
    const nodeSpacingM = wavelengthM / 2;
    const waveSpeedMs = f * wavelengthM;
    const phaseDifferenceRad = pair === "same-loop" ? 0 : Math.PI;

    const phaseRule =
      pair === "same-loop"
        ? "zero phase difference because all points between adjacent nodes oscillate in phase"
        : pair === "adjacent-loops"
          ? "antiphase or pi radians because points lie on opposite sides of a node"
          : "node has permanent zero amplitude while antinode oscillates with maximum amplitude";

    const polRuleMap: Record<(typeof POL_SCENARIOS)[number], string> = {
      "crossed-polaroids":
        "rotating the analyser through ninety degrees reduces transmitted intensity from maximum to zero",
      "water-glare":
        "reflected glare is partially horizontally polarised and blocked by a vertically aligned polaroid filter",
      "tv-aerial":
        "receiving aerial rods must be aligned parallel to the plane of electric field oscillations for maximum signal",
      "longitudinal-sound":
        "longitudinal sound waves cannot be polarised because oscillations are parallel to energy transfer",
    };

    return {
      solverId: "sixthphysics/al-as-polarisation-stationary/1.0.0",
      quantities: {
        harmonicN: n,
        wavelengthM,
        nodeSpacingM,
        waveSpeedMs,
        phaseDifferenceRad,
        phaseRule,
        polarisationRule: polRuleMap[polScen],
        transverseDefinition:
          "oscillations are perpendicular to the direction of energy transfer",
        polarisationDefinition:
          "oscillations are restricted to a single plane containing the direction of propagation",
        stationaryFormationRule:
          "superposition of two progressive waves with equal frequency wavelength and amplitude travelling in opposite directions",
        energyTransferRule:
          "no net transfer of energy along a stationary wave",
        lorAnchor:
          "plane polarised transverse waves restrict oscillations to a single plane whereas longitudinal waves cannot be polarised",
      },
      publicNumbers: [L, f, n],
    };
  },
  renderSvg(spec, options): DomainRenderOutput {
    const hidden = getHiddenSet(spec, options);
    const mode = spec.visualMode as (typeof WAVE_AS_MODES)[number];
    const n = isIntInRange(spec.harmonicN, 1, 4) ? spec.harmonicN : 3;
    const L = isPosNum(spec.stringLengthM) ? spec.stringLengthM : 1.2;
    const defs = arrowMarkerDef("arr-wv", "#1d4ed8");
    const publicNumbers: number[] = [];
    const publicLabels: string[] = [];

    if (mode === "polarisation") {
      const scen = isStringOneOf(spec.polarisationScenario, POL_SCENARIOS)
        ? spec.polarisationScenario
        : "crossed-polaroids";
      const hideStatus =
        hidden.has("polarisationRule") || hidden.has("lorAnchor");
      const analyserVertical = scen !== "crossed-polaroids";
      const body = [
        `<text x="320" y="34" text-anchor="middle" font-size="16" font-weight="700" fill="#0f172a">Transverse Wave Polarisation Schematic</text>`,
        // Propagation ray
        `<line x1="68" y1="192" x2="574" y2="192" stroke="#64748b" stroke-width="1.8" stroke-dasharray="6 4" marker-end="url(#arr-wv)"/>`,
        // Unpolarised oscillations
        `<line x1="126" y1="140" x2="126" y2="244" stroke="#dc2626" stroke-width="2.4"/>`,
        `<line x1="90" y1="156" x2="162" y2="228" stroke="#dc2626" stroke-width="2"/>`,
        `<line x1="90" y1="228" x2="162" y2="156" stroke="#dc2626" stroke-width="2"/>`,
        `<line x1="76" y1="192" x2="176" y2="192" stroke="#dc2626" stroke-width="2"/>`,
        `<text x="126" y="274" text-anchor="middle" font-size="12" font-weight="600" fill="#0f172a">Unpolarised beam</text>`,
        // Polariser (vertical transmission axis)
        `<rect x="218" y="106" width="32" height="172" rx="6" fill="#dbeafe" stroke="#1d4ed8" stroke-width="2"/>`,
        `<line x1="234" y1="122" x2="234" y2="262" stroke="#1d4ed8" stroke-width="2.6"/>`,
        `<text x="234" y="94" text-anchor="middle" font-size="12.5" font-weight="700" fill="#1e3a8a">Polariser</text>`,
        // Plane-polarised wave between filters
        `<line x1="306" y1="138" x2="306" y2="246" stroke="#1d4ed8" stroke-width="2.8"/>`,
        `<line x1="354" y1="138" x2="354" y2="246" stroke="#1d4ed8" stroke-width="2.8"/>`,
        `<text x="330" y="274" text-anchor="middle" font-size="12" font-weight="600" fill="#1d4ed8">${hideStatus ? "Region M" : "Vertical plane"}</text>`,
        // Analyser
        `<rect x="408" y="106" width="32" height="172" rx="6" fill="#fef3c7" stroke="#d97706" stroke-width="2"/>`,
        analyserVertical
          ? `<line x1="424" y1="122" x2="424" y2="262" stroke="#d97706" stroke-width="2.6"/>`
          : `<line x1="412" y1="192" x2="436" y2="192" stroke="#d97706" stroke-width="2.8"/>`,
        `<text x="424" y="94" text-anchor="middle" font-size="12.5" font-weight="700" fill="#92400e">Analyser</text>`,
        // Output indicator
        `<rect x="476" y="156" width="118" height="72" rx="8" fill="#f8fafc" stroke="#cbd5e1" stroke-width="1.5"/>`,
        `<text x="535" y="196" text-anchor="middle" font-size="13" font-weight="700" fill="#0f172a">Detector</text>`,
      ].join("");
      return {
        visualFamily: "waves",
        svgMarkup: wrapSvg(
          "Polarisation filter schematic",
          "Unpolarised transverse wave passing through a polariser and an analyser towards a detector",
          defs,
          body,
        ),
        rendererVersion: ALEVEL_CORE_AS_RENDERER_VERSION,
        publicNumbers,
        publicLabels,
      };
    }

    // Stationary wave envelope with labelled points P, Q, R
    const xStart = 84;
    const xEnd = 556;
    const yMid = 190;
    const amp = 74;
    const span = xEnd - xStart;
    const solidPts: string[] = [];
    const dashPts: string[] = [];
    for (let i = 0; i <= 180; i += 1) {
      const u = i / 180;
      const x = xStart + u * span;
      const s = Math.sin(u * n * Math.PI);
      solidPts.push(`${i === 0 ? "M" : "L"} ${fc(x)} ${fc(yMid - amp * s)}`);
      dashPts.push(`${i === 0 ? "M" : "L"} ${fc(x)} ${fc(yMid + amp * s)}`);
    }
    const hideLen = hidden.has("wavelengthM") || hidden.has("nodeSpacingM");
    if (!hideLen) publicNumbers.push(L);

    // Mark points P (0.35 of loop 1), Q (0.65 of loop 1), R (0.5 of loop 2 if n>=2 else 0.85 of loop 1)
    const xP = xStart + (0.35 / n) * span;
    const xQ = xStart + (0.65 / n) * span;
    const xR = n >= 2 ? xStart + (1.5 / n) * span : xStart + (0.82 / n) * span;
    const yP = yMid - amp * Math.sin(0.35 * Math.PI);
    const yQ = yMid - amp * Math.sin(0.65 * Math.PI);
    const yR = yMid - amp * Math.sin((n >= 2 ? 1.5 : 0.82) * Math.PI);

    const nodes = Array.from({ length: n + 1 }, (_, k) => {
      const nx = xStart + (k / n) * span;
      return `<circle cx="${fc(nx)}" cy="${yMid}" r="4.5" fill="#0f172a"/><text x="${fc(nx)}" y="${yMid + 22}" text-anchor="middle" font-size="11.5" font-weight="700" fill="#475569">N</text>`;
    }).join("");

    const body = [
      `<text x="320" y="34" text-anchor="middle" font-size="16" font-weight="700" fill="#0f172a">Stationary Wave Envelope on a Stretched String</text>`,
      `<line x1="${xStart}" y1="${yMid}" x2="${xEnd}" y2="${yMid}" stroke="#94a3b8" stroke-width="1.5" stroke-dasharray="4 4"/>`,
      `<path d="${solidPts.join(" ")}" fill="none" stroke="#1d4ed8" stroke-width="2.8"/>`,
      `<path d="${dashPts.join(" ")}" fill="none" stroke="#1d4ed8" stroke-width="2" stroke-dasharray="6 4" opacity="0.65"/>`,
      nodes,
      `<circle cx="${fc(xP)}" cy="${fc(yP)}" r="5.5" fill="#dc2626"/>`,
      `<text x="${fc(xP)}" y="${fc(yP - 12)}" text-anchor="middle" font-size="13.5" font-weight="700" fill="#dc2626">P</text>`,
      `<circle cx="${fc(xQ)}" cy="${fc(yQ)}" r="5.5" fill="#047857"/>`,
      `<text x="${fc(xQ)}" y="${fc(yQ - 12)}" text-anchor="middle" font-size="13.5" font-weight="700" fill="#047857">Q</text>`,
      `<circle cx="${fc(xR)}" cy="${fc(yR)}" r="5.5" fill="#7c3aed"/>`,
      `<text x="${fc(xR)}" y="${fc(yR + 20)}" text-anchor="middle" font-size="13.5" font-weight="700" fill="#7c3aed">R</text>`,
      `<line x1="${xStart}" y1="306" x2="${xEnd}" y2="306" stroke="#334155" stroke-width="1.6"/>`,
      `<line x1="${xStart}" y1="298" x2="${xStart}" y2="314" stroke="#334155" stroke-width="1.6"/>`,
      `<line x1="${xEnd}" y1="298" x2="${xEnd}" y2="314" stroke="#334155" stroke-width="1.6"/>`,
      `<text x="320" y="330" text-anchor="middle" font-size="13" font-weight="600" fill="#0f172a">String length L = ${fmtClean(L, 3)} m</text>`,
    ].join("");
    publicLabels.push(`String length L = ${fmtClean(L, 3)} m`);
    return {
      visualFamily: "waves",
      svgMarkup: wrapSvg(
        "Stationary wave envelope",
        "Stationary wave on a stretched string showing nodes and labelled points P, Q, and R",
        defs,
        body,
      ),
      rendererVersion: ALEVEL_CORE_AS_RENDERER_VERSION,
      publicNumbers,
      publicLabels,
    };
  },
};

/* -------------------------------------------------------------------------- */
/*  10. al-as-white-light-diffraction (Section 3.3.2, waves)                  */
/* -------------------------------------------------------------------------- */

const DIFFRACTION_MODES = ["single-slit", "white-light-grating"] as const;

const whiteLightDiffractionPlugin: DomainKindPlugin = {
  domain: "waves",
  kind: "al-as-white-light-diffraction",
  summary:
    "Section 3.3.2 single-slit intensity profile (2:1 central width ratio) and white-light diffraction grating spectra (d sin theta = n lambda, violet inner / red outer).",
  requiredFields: [
    { name: "kind", type: "string", enumValues: ["al-as-white-light-diffraction"] },
    { name: "visualMode", type: "string", enumValues: DIFFRACTION_MODES },
    { name: "wavelengthNm", type: "number", unit: "nm", bounds: "380 <= lambda <= 750" },
  ],
  optionalFields: [
    { name: "slitWidthMm", type: "number", unit: "mm", bounds: "0.05 <= a <= 1.0" },
    { name: "screenDistanceM", type: "number", unit: "m", bounds: "0.5 <= D <= 5.0" },
    { name: "gratingLinesPerMm", type: "number", unit: "mm^-1", bounds: "100 <= N <= 650" },
    { name: "orderN", type: "integer", bounds: "1 <= n <= 3" },
  ],
  physicalConstraints: [
    "Single-slit central maximum width is twice the width of each secondary maximum.",
    "Diffraction grating white-light spectra show a white central maximum with violet diffracted least and red diffracted most in each side order.",
  ],
  probeSpecs: [
    {
      kind: "al-as-white-light-diffraction",
      visualMode: "single-slit",
      wavelengthNm: 633,
      slitWidthMm: 0.2,
      screenDistanceM: 1.8,
    },
    {
      kind: "al-as-white-light-diffraction",
      visualMode: "white-light-grating",
      wavelengthNm: 589,
      gratingLinesPerMm: 300,
      orderN: 1,
    },
  ],
  validate(spec): DomainValidationResult {
    const issues: string[] = [];
    if (spec.kind !== "al-as-white-light-diffraction") {
      issues.push('kind must be "al-as-white-light-diffraction"');
    }
    if (!isStringOneOf(spec.visualMode, DIFFRACTION_MODES)) {
      issues.push(`visualMode must be one of ${DIFFRACTION_MODES.join(", ")}`);
    }
    if (!isFiniteNum(spec.wavelengthNm) || spec.wavelengthNm < 380 || spec.wavelengthNm > 750) {
      issues.push("wavelengthNm must lie in [380, 750] nm");
    }
    if (spec.visualMode === "white-light-grating") {
      const N = isPosNum(spec.gratingLinesPerMm) ? spec.gratingLinesPerMm : 300;
      const n = isIntInRange(spec.orderN, 1, 3) ? spec.orderN : 1;
      const d = 1e-3 / N;
      const lam = (spec.wavelengthNm as number) * 1e-9;
      if ((n * lam) / d >= 0.99) {
        issues.push("Selected orderN exceeds maximum observable grating order");
      }
    }
    return { valid: issues.length === 0, issues };
  },
  solve(spec): DomainSolveOutput {
    const lamNm = spec.wavelengthNm as number;
    const lamM = lamNm * 1e-9;
    const aMm = isPosNum(spec.slitWidthMm) ? spec.slitWidthMm : 0.2;
    const aM = aMm * 1e-3;
    const D = isPosNum(spec.screenDistanceM) ? spec.screenDistanceM : 1.5;
    const N = isPosNum(spec.gratingLinesPerMm) ? spec.gratingLinesPerMm : 300;
    const orderN = isIntInRange(spec.orderN, 1, 3) ? spec.orderN : 1;

    const centralWidthM = (2 * lamM * D) / aM;
    const centralWidthMm = centralWidthM * 1e3;
    const secondaryWidthMm = centralWidthMm / 2;

    const gratingSpacingM = 1e-3 / N;
    const sinTheta = (orderN * lamM) / gratingSpacingM;
    const angleDeg =
      sinTheta <= 1 ? (Math.asin(sinTheta) * 180) / Math.PI : 90;
    const maxOrder = Math.floor(gratingSpacingM / lamM);
    const sinV = (orderN * 400e-9) / gratingSpacingM;
    const sinR = (orderN * 700e-9) / gratingSpacingM;
    const violetAngleDeg = sinV <= 1 ? (Math.asin(sinV) * 180) / Math.PI : 90;
    const redAngleDeg = sinR <= 1 ? (Math.asin(sinR) * 180) / Math.PI : 90;
    const angularSpreadDeg = Math.max(0, redAngleDeg - violetAngleDeg);

    return {
      solverId: "sixthphysics/al-as-white-light-diffraction/1.0.0",
      quantities: {
        centralWidthM,
        centralWidthMm,
        secondaryWidthMm,
        gratingSpacingM,
        angleDeg,
        maxOrder,
        violetAngleDeg,
        redAngleDeg,
        angularSpreadDeg,
        singleSlitWidthRule:
          "central maximum is twice as wide as each secondary maximum and widens when slit width decreases",
        whiteLightPatternRule:
          "central white maximum flanked by continuous spectra with violet closest to the centre and red furthest",
        coherenceDefinition:
          "waves having a constant phase difference and the same frequency and wavelength",
        gratingSharpnessRule:
          "many slits produce narrower brighter and more widely separated maxima",
      },
      publicNumbers: [lamNm],
    };
  },
  renderSvg(spec, options): DomainRenderOutput {
    const hidden = getHiddenSet(spec, options);
    const mode = spec.visualMode as (typeof DIFFRACTION_MODES)[number];
    const defs = arrowMarkerDef("arr-df", "#0f172a");
    const publicNumbers: number[] = [];
    const publicLabels: string[] = [];

    if (mode === "single-slit") {
      const xMid = 320;
      const yBase = 286;
      const scaleH = 204;
      const pts: string[] = [];
      for (let i = -180; i <= 180; i += 1) {
        const u = (i / 180) * 3.2; // zeros at +-1, +-2, +-3
        const x = xMid + (i / 180) * 240;
        const val =
          Math.abs(u) < 1e-6 ? 1 : (Math.sin(Math.PI * u) / (Math.PI * u)) ** 2;
        // Slightly boost side maxima visually for textbook clarity while keeping true peak hierarchy
        const y = yBase - scaleH * (Math.abs(u) <= 1 ? val : Math.min(0.24, val * 2.8));
        pts.push(`${i === -180 ? "M" : "L"} ${fc(x)} ${fc(y)}`);
      }
      const hideWidth = hidden.has("singleSlitWidthRule");
      const body = [
        `<text x="320" y="34" text-anchor="middle" font-size="16" font-weight="700" fill="#0f172a">Single-Slit Diffraction Intensity Profile</text>`,
        `<line x1="64" y1="${yBase}" x2="584" y2="${yBase}" stroke="#0f172a" stroke-width="2" marker-end="url(#arr-df)"/>`,
        `<line x1="${xMid}" y1="${yBase + 14}" x2="${xMid}" y2="58" stroke="#0f172a" stroke-width="1.8" marker-end="url(#arr-df)"/>`,
        `<path d="${pts.join(" ")}" fill="none" stroke="#1d4ed8" stroke-width="2.8"/>`,
        `<text x="334" y="68" font-size="12.5" font-weight="600" fill="#0f172a">Intensity I</text>`,
        `<text x="580" y="${yBase + 22}" text-anchor="end" font-size="12.5" font-weight="600" fill="#0f172a">Screen position x</text>`,
        `<line x1="${fc(xMid - 75)}" y1="306" x2="${fc(xMid + 75)}" y2="306" stroke="#dc2626" stroke-width="2"/>`,
        `<text x="${xMid}" y="326" text-anchor="middle" font-size="12.5" font-weight="700" fill="#dc2626">${hideWidth ? "Central width W" : "Central maximum (2w)"}</text>`,
        `<line x1="${fc(xMid + 75)}" y1="306" x2="${fc(xMid + 150)}" y2="306" stroke="#047857" stroke-width="2"/>`,
        `<text x="${fc(xMid + 112)}" y="326" text-anchor="middle" font-size="12" font-weight="600" fill="#047857">${hideWidth ? "Side width" : "w"}</text>`,
      ].join("");
      return {
        visualFamily: "waves",
        svgMarkup: wrapSvg(
          "Single-slit diffraction intensity graph",
          "Intensity distribution of monochromatic light through a single narrow slit",
          defs,
          body,
        ),
        rendererVersion: ALEVEL_CORE_AS_RENDERER_VERSION,
        publicNumbers,
        publicLabels,
      };
    }

    const hideOrder = hidden.has("whiteLightPatternRule");
    const body = [
      `<text x="320" y="34" text-anchor="middle" font-size="16" font-weight="700" fill="#0f172a">White-Light Diffraction Grating Spectrum</text>`,
      // Incident white beam
      `<line x1="56" y1="184" x2="196" y2="184" stroke="#475569" stroke-width="4"/>`,
      `<text x="122" y="166" text-anchor="middle" font-size="12.5" font-weight="600" fill="#0f172a">White light</text>`,
      // Grating vertical bar
      `<rect x="196" y="114" width="12" height="140" fill="#0f172a"/>`,
      `<text x="202" y="274" text-anchor="middle" font-size="12" font-weight="600" fill="#0f172a">Grating</text>`,
      // Screen
      `<rect x="496" y="64" width="14" height="240" fill="#e2e8f0" stroke="#475569" stroke-width="1.6"/>`,
      // n=0 central beam
      `<line x1="208" y1="184" x2="496" y2="184" stroke="#64748b" stroke-width="2.6"/>`,
      `<circle cx="503" cy="184" r="5.5" fill="#ffffff" stroke="#0f172a" stroke-width="1.8"/>`,
      `<text x="524" y="189" font-size="12.5" font-weight="700" fill="#0f172a">${hideOrder ? "n = 0" : "n = 0 (White)"}</text>`,
      // Upper n=1 fan (violet inner, red outer)
      `<line x1="208" y1="184" x2="496" y2="128" stroke="#7c3aed" stroke-width="2.2"/>`,
      `<line x1="208" y1="184" x2="496" y2="86" stroke="#dc2626" stroke-width="2.2"/>`,
      `<polygon points="208,184 496,128 496,86" fill="#f59e0b" opacity="0.16"/>`,
      `<text x="524" y="92" font-size="12" font-weight="700" fill="#dc2626">${hideOrder ? "Edge P" : "Red (n = 1)"}</text>`,
      `<text x="524" y="132" font-size="12" font-weight="700" fill="#7c3aed">${hideOrder ? "Edge Q" : "Violet (n = 1)"}</text>`,
      // Lower n=1 fan
      `<line x1="208" y1="184" x2="496" y2="240" stroke="#7c3aed" stroke-width="2.2"/>`,
      `<line x1="208" y1="184" x2="496" y2="282" stroke="#dc2626" stroke-width="2.2"/>`,
      `<polygon points="208,184 496,240 496,282" fill="#f59e0b" opacity="0.16"/>`,
      `<text x="524" y="244" font-size="12" font-weight="700" fill="#7c3aed">${hideOrder ? "Edge Q" : "Violet"}</text>`,
      `<text x="524" y="286" font-size="12" font-weight="700" fill="#dc2626">${hideOrder ? "Edge P" : "Red"}</text>`,
    ].join("");
    return {
      visualFamily: "waves",
      svgMarkup: wrapSvg(
        "White-light diffraction grating diagram",
        "White light passing through a diffraction grating forming a central maximum and symmetric first-order spectra",
        defs,
        body,
      ),
      rendererVersion: ALEVEL_CORE_AS_RENDERER_VERSION,
      publicNumbers,
      publicLabels,
    };
  },
};

/* -------------------------------------------------------------------------- */
/*  11. al-as-optical-fibre-dispersion (Section 3.3.2, optics-shm)            */
/* -------------------------------------------------------------------------- */

const DISPERSION_FOCUSES = [
  "modal",
  "material",
  "cladding-tir",
  "both",
] as const;

const opticalFibreDispersionPlugin: DomainKindPlugin = {
  domain: "optics-shm",
  kind: "al-as-optical-fibre-dispersion",
  summary:
    "Section 3.3.2 step-index optical fibre TIR, cladding roles, modal vs material pulse broadening, and 6m LoR mitigation.",
  requiredFields: [
    { name: "kind", type: "string", enumValues: ["al-as-optical-fibre-dispersion"] },
    { name: "coreIndex", type: "number", bounds: "1.40 <= n1 <= 1.70" },
    { name: "claddingIndex", type: "number", bounds: "1.30 <= n2 < n1" },
    { name: "fibreLengthKm", type: "number", unit: "km", bounds: "0.2 <= L <= 25" },
  ],
  optionalFields: [
    { name: "violetIndex", type: "number", bounds: "1.45 <= nV <= 1.75" },
    { name: "redIndex", type: "number", bounds: "1.40 <= nR < nV" },
    { name: "dispersionFocus", type: "string", enumValues: DISPERSION_FOCUSES },
  ],
  physicalConstraints: [
    "Core refractive index n1 must strictly exceed cladding refractive index n2 for TIR.",
    "TIR occurs only when angle of incidence is strictly greater than critical angle.",
  ],
  probeSpecs: [
    {
      kind: "al-as-optical-fibre-dispersion",
      coreIndex: 1.52,
      claddingIndex: 1.46,
      fibreLengthKm: 2.0,
      violetIndex: 1.532,
      redIndex: 1.514,
      dispersionFocus: "both",
    },
    {
      kind: "al-as-optical-fibre-dispersion",
      coreIndex: 1.5,
      claddingIndex: 1.42,
      fibreLengthKm: 1.5,
      dispersionFocus: "modal",
    },
  ],
  validate(spec): DomainValidationResult {
    const issues: string[] = [];
    if (spec.kind !== "al-as-optical-fibre-dispersion") {
      issues.push('kind must be "al-as-optical-fibre-dispersion"');
    }
    if (!isFiniteNum(spec.coreIndex) || spec.coreIndex < 1.4 || spec.coreIndex > 1.75) {
      issues.push("coreIndex must lie in [1.40, 1.75]");
    }
    if (
      !isFiniteNum(spec.claddingIndex) ||
      spec.claddingIndex < 1.3 ||
      (isFiniteNum(spec.coreIndex) && spec.claddingIndex >= spec.coreIndex)
    ) {
      issues.push("claddingIndex must satisfy 1.30 <= claddingIndex < coreIndex");
    }
    if (!isFiniteNum(spec.fibreLengthKm) || spec.fibreLengthKm < 0.2 || spec.fibreLengthKm > 25) {
      issues.push("fibreLengthKm must lie in [0.2, 25] km");
    }
    if (
      spec.dispersionFocus !== undefined &&
      !isStringOneOf(spec.dispersionFocus, DISPERSION_FOCUSES)
    ) {
      issues.push(`dispersionFocus must be one of ${DISPERSION_FOCUSES.join(", ")}`);
    }
    return { valid: issues.length === 0, issues };
  },
  solve(spec): DomainSolveOutput {
    const n1 = spec.coreIndex as number;
    const n2 = spec.claddingIndex as number;
    const lengthKm = spec.fibreLengthKm as number;
    const L = lengthKm * 1e3;
    const nV = isPosNum(spec.violetIndex) ? spec.violetIndex : n1 + 0.012;
    const nR = isPosNum(spec.redIndex) ? spec.redIndex : n1 - 0.006;

    const criticalAngleDeg = (Math.asin(n2 / n1) * 180) / Math.PI;
    const coreSpeedMs = AQA_C_MS / n1;
    const axialTimeS = (L * n1) / AQA_C_MS;
    const modalDelayS = ((L * n1) / AQA_C_MS) * (n1 / n2 - 1);
    const modalDelayNs = modalDelayS * 1e9;
    const materialDelayS = (L / AQA_C_MS) * Math.max(0.001, nV - nR);
    const materialDelayNs = materialDelayS * 1e9;

    return {
      solverId: "sixthphysics/al-as-optical-fibre-dispersion/1.0.0",
      quantities: {
        criticalAngleDeg,
        coreSpeedMs,
        axialTimeS,
        modalDelayS,
        modalDelayNs,
        materialDelayS,
        materialDelayNs,
        tirConditionRule:
          "core refractive index exceeds cladding index and angle of incidence is strictly greater than the critical angle",
        claddingFunctions:
          "protects core from surface scratches prevents crosstalk and provides a lower refractive index boundary",
        modalMitigation:
          "use a very narrow core so rays travel along nearly identical path lengths",
        materialMitigation:
          "use monochromatic light so all waves travel at the same speed in the core",
        pulseBroadeningConsequence:
          "broadened pulses overlap causing data corruption and limiting maximum transmission rate",
        lorAnchor:
          "modal dispersion arises from different ray path lengths whereas material dispersion arises from different wavelengths travelling at different speeds",
      },
      publicNumbers: [n1, n2, lengthKm],
    };
  },
  renderSvg(spec, options): DomainRenderOutput {
    const hidden = getHiddenSet(spec, options);
    const n1 = spec.coreIndex as number;
    const n2 = spec.claddingIndex as number;
    const hideN = hidden.has("coreIndex") || hidden.has("claddingIndex");
    const defs = [
      arrowMarkerDef("arr-of-b", "#1d4ed8"),
      arrowMarkerDef("arr-of-r", "#dc2626"),
    ].join("");
    const publicNumbers: number[] = [];
    const publicLabels: string[] = [];
    if (!hideN) {
      publicNumbers.push(n1, n2);
    }

    const body = [
      `<text x="320" y="34" text-anchor="middle" font-size="16" font-weight="700" fill="#0f172a">Step-Index Optical Fibre and Pulse Broadening</text>`,
      // Cladding top & bottom
      `<rect x="44" y="92" width="376" height="32" fill="#cbd5e1" stroke="#475569" stroke-width="1.6"/>`,
      `<rect x="44" y="216" width="376" height="32" fill="#cbd5e1" stroke="#475569" stroke-width="1.6"/>`,
      // Core
      `<rect x="44" y="124" width="376" height="92" fill="#eff6ff" stroke="#1d4ed8" stroke-width="1.6"/>`,
      // Axial ray
      `<line x1="48" y1="170" x2="412" y2="170" stroke="#1d4ed8" stroke-width="2.2" marker-end="url(#arr-of-b)"/>`,
      // Zigzag TIR ray
      `<polyline points="48,170 124,124 236,216 348,124 412,176" fill="none" stroke="#dc2626" stroke-width="2.4" marker-end="url(#arr-of-r)"/>`,
      // Normal at first reflection
      `<line x1="124" y1="106" x2="124" y2="164" stroke="#64748b" stroke-width="1.3" stroke-dasharray="4 3"/>`,
      `<text x="108" y="148" font-size="12" font-weight="700" fill="#dc2626">θ</text>`,
      `<text x="232" y="113" text-anchor="middle" font-size="12" font-weight="600" fill="#0f172a">Cladding (${hideN ? "n₂" : `n₂ = ${n2.toFixed(2)}`})</text>`,
      `<text x="232" y="206" text-anchor="middle" font-size="12" font-weight="600" fill="#1e3a8a">Core (${hideN ? "n₁" : `n₁ = ${n1.toFixed(2)}`})</text>`,
      // Right inset: input vs output pulse
      `<rect x="442" y="88" width="166" height="164" rx="10" fill="#f8fafc" stroke="#cbd5e1" stroke-width="1.5"/>`,
      `<text x="525" y="110" text-anchor="middle" font-size="12" font-weight="700" fill="#0f172a">Signal Pulses (I–t)</text>`,
      // Input sharp pulse
      `<line x1="462" y1="162" x2="588" y2="162" stroke="#64748b" stroke-width="1.4"/>`,
      `<path d="M 468 162 L 496 162 Q 508 122 520 162 L 540 162 Q 552 122 564 162 L 584 162" fill="none" stroke="#1d4ed8" stroke-width="2.2"/>`,
      `<text x="525" y="176" text-anchor="middle" font-size="10.5" fill="#1d4ed8">Input: sharp pulses</text>`,
      // Output broadened overlapping pulses
      `<line x1="462" y1="232" x2="588" y2="232" stroke="#64748b" stroke-width="1.4"/>`,
      `<path d="M 466 232 Q 502 184 534 216 Q 554 184 586 232" fill="none" stroke="#dc2626" stroke-width="2.2"/>`,
      `<text x="525" y="246" text-anchor="middle" font-size="10.5" fill="#dc2626">Output: broadened</text>`,
      `<text x="232" y="284" text-anchor="middle" font-size="12" fill="#475569">Blue: axial ray (shortest path) · Red: oblique TIR ray (longer path)</text>`,
    ].join("");
    if (!hideN) {
      publicLabels.push(
        `Cladding (n₂ = ${n2.toFixed(2)})`,
        `Core (n₁ = ${n1.toFixed(2)})`,
      );
    }

    return {
      visualFamily: "optics-shm",
      svgMarkup: wrapSvg(
        "Step-index optical fibre schematic",
        "Cutaway of an optical fibre showing axial and reflected rays alongside input and broadened output pulses",
        defs,
        body,
      ),
      rendererVersion: ALEVEL_CORE_AS_RENDERER_VERSION,
      publicNumbers,
      publicLabels,
    };
  },
};

/* -------------------------------------------------------------------------- */
/*  12. al-as-terminal-velocity-n3l-impulse (Section 3.4.1, mechanics)        */
/* -------------------------------------------------------------------------- */

const MECH_AS_MODES = ["terminal-velocity", "crumple-impulse", "n3l-pairs"] as const;
const FALL_PHASES = [
  "release",
  "accelerating",
  "terminal-one",
  "parachute-open",
  "terminal-two",
] as const;

const terminalVelocityN3lImpulsePlugin: DomainKindPlugin = {
  domain: "mechanics",
  kind: "al-as-terminal-velocity-n3l-impulse",
  summary:
    "Section 3.4.1 two-stage skydiver terminal velocity (Newton's laws 6m LoR), crumple-zone impulse F Delta t = Delta p, and Newton's 3rd Law pair distinction.",
  requiredFields: [
    { name: "kind", type: "string", enumValues: ["al-as-terminal-velocity-n3l-impulse"] },
    { name: "visualMode", type: "string", enumValues: MECH_AS_MODES },
    { name: "massKg", type: "number", unit: "kg", bounds: "1 <= m <= 2500" },
  ],
  optionalFields: [
    { name: "dragForceN", type: "number", unit: "N", bounds: "0 <= D <= 4000" },
    { name: "impactSpeedMs", type: "number", unit: "m s^-1", bounds: "1 <= v <= 45" },
    { name: "impactTimeS", type: "number", unit: "s", bounds: "0.01 <= t1 <= 1.0" },
    { name: "extendedTimeS", type: "number", unit: "s", bounds: "t1 < t2 <= 2.0" },
    { name: "phaseKey", type: "string", enumValues: FALL_PHASES },
  ],
  physicalConstraints: [
    "Uses AQA g = 9.81 m s^-2.",
    "Newton's third law pairs must be the same type of force acting on two different bodies.",
  ],
  probeSpecs: [
    {
      kind: "al-as-terminal-velocity-n3l-impulse",
      visualMode: "terminal-velocity",
      massKg: 82,
      dragForceN: 1240,
      phaseKey: "parachute-open",
    },
    {
      kind: "al-as-terminal-velocity-n3l-impulse",
      visualMode: "crumple-impulse",
      massKg: 1250,
      impactSpeedMs: 14,
      impactTimeS: 0.08,
      extendedTimeS: 0.32,
    },
  ],
  validate(spec): DomainValidationResult {
    const issues: string[] = [];
    if (spec.kind !== "al-as-terminal-velocity-n3l-impulse") {
      issues.push('kind must be "al-as-terminal-velocity-n3l-impulse"');
    }
    if (!isStringOneOf(spec.visualMode, MECH_AS_MODES)) {
      issues.push(`visualMode must be one of ${MECH_AS_MODES.join(", ")}`);
    }
    if (!isFiniteNum(spec.massKg) || spec.massKg < 1 || spec.massKg > 3000) {
      issues.push("massKg must lie in [1, 3000] kg");
    }
    if (
      spec.phaseKey !== undefined &&
      !isStringOneOf(spec.phaseKey, FALL_PHASES)
    ) {
      issues.push(`phaseKey must be one of ${FALL_PHASES.join(", ")}`);
    }
    return { valid: issues.length === 0, issues };
  },
  solve(spec): DomainSolveOutput {
    const m = spec.massKg as number;
    const weightN = m * AQA_G_MS2;
    const dragN = isNonNegNum(spec.dragForceN) ? spec.dragForceN : weightN;
    const resultantDownN = weightN - dragN;
    const resultantMagN = Math.abs(resultantDownN);
    const accelerationDownMs2 = resultantDownN / m;
    const accelerationMagMs2 = Math.abs(accelerationDownMs2);

    const vImp = isPosNum(spec.impactSpeedMs) ? spec.impactSpeedMs : 15;
    const t1 = isPosNum(spec.impactTimeS) ? spec.impactTimeS : 0.1;
    const t2 = isPosNum(spec.extendedTimeS) ? spec.extendedTimeS : 0.4;
    const momentumChangeNs = m * vImp;
    const baselineForceN = momentumChangeNs / t1;
    const crumpleForceN = momentumChangeNs / t2;
    const forceReductionFactor = t2 / t1;

    const phase = isStringOneOf(spec.phaseKey, FALL_PHASES)
      ? spec.phaseKey
      : "terminal-one";
    const phaseRules: Record<(typeof FALL_PHASES)[number], string> = {
      release:
        "zero initial air resistance so downward acceleration equals gravitational field strength",
      accelerating:
        "air resistance increases with speed reducing downward resultant force and acceleration",
      "terminal-one":
        "upward drag equals downward weight so resultant force is zero and velocity is constant",
      "parachute-open":
        "drag greatly exceeds weight producing an upward resultant force and downward deceleration",
      "terminal-two":
        "drag decreases with speed until it equals weight again at a lower constant terminal speed",
    };

    return {
      solverId: "sixthphysics/al-as-terminal-velocity-n3l-impulse/1.0.0",
      quantities: {
        weightN,
        resultantDownN,
        resultantMagN,
        accelerationDownMs2,
        accelerationMagMs2,
        momentumChangeNs,
        baselineForceN,
        crumpleForceN,
        forceReductionFactor,
        motionPhaseRule: phaseRules[phase],
        n3lPairRule:
          "equal magnitude opposite direction same type of force acting on two different bodies",
        n3lParachutistPair:
          "gravitational pull of the skydiver upward on the Earth",
        crumpleZoneRule:
          "same change in momentum over a longer impact time reduces average force on occupants",
        nonUniformRule:
          "constant acceleration equations are invalid so use tangent gradient and area under velocity time graph",
        lorAnchor:
          "drag grows with speed until equal to weight at terminal velocity and opening the parachute creates an upward resultant force",
      },
      publicNumbers: [m, AQA_G_MS2],
    };
  },
  renderSvg(spec, options): DomainRenderOutput {
    const hidden = getHiddenSet(spec, options);
    const mode = spec.visualMode as (typeof MECH_AS_MODES)[number];
    const defs = [
      arrowMarkerDef("arr-mc-ax", "#0f172a"),
      arrowMarkerDef("arr-mc-r", "#dc2626"),
      arrowMarkerDef("arr-mc-b", "#1d4ed8"),
    ].join("");
    const publicNumbers: number[] = [];
    const publicLabels: string[] = [];

    if (mode === "crumple-impulse") {
      const hideRule = hidden.has("crumpleZoneRule");
      const body = [
        `<text x="320" y="34" text-anchor="middle" font-size="16" font-weight="700" fill="#0f172a">Impact Force versus Time for Equal Momentum Change</text>`,
        `<line x1="86" y1="286" x2="584" y2="286" stroke="#0f172a" stroke-width="2" marker-end="url(#arr-mc-ax)"/>`,
        `<line x1="86" y1="296" x2="86" y2="62" stroke="#0f172a" stroke-width="2" marker-end="url(#arr-mc-ax)"/>`,
        `<text x="580" y="308" text-anchor="end" font-size="12.5" font-weight="600" fill="#0f172a">Time t / s</text>`,
        `<text x="98" y="74" font-size="12.5" font-weight="600" fill="#0f172a">Impact force F / kN</text>`,
        // Rigid frame tall narrow pulse
        `<path d="M 120 286 Q 165 82 210 286 Z" fill="#fee2e2" stroke="#dc2626" stroke-width="2.6"/>`,
        // Crumple zone low wide pulse (equal area)
        `<path d="M 120 286 Q 300 184 480 286 Z" fill="#dbeafe" fill-opacity="0.65" stroke="#1d4ed8" stroke-width="2.6"/>`,
        `<text x="234" y="114" font-size="12.5" font-weight="700" fill="#dc2626">Rigid impact (short Δt)</text>`,
        `<text x="358" y="206" font-size="12.5" font-weight="700" fill="#1d4ed8">Crumple zone (longer Δt)</text>`,
        `<text x="336" y="328" text-anchor="middle" font-size="12" fill="#475569">${hideRule ? "Compare areas and peak forces" : "Equal shaded areas = identical impulse Δp"}</text>`,
      ].join("");
      return {
        visualFamily: "graphs",
        svgMarkup: wrapSvg(
          "Impact force versus time graph",
          "Force against time curves comparing a short high-peak impact with a longer lower-peak crumple-zone impact",
          defs,
          body,
        ),
        rendererVersion: ALEVEL_CORE_AS_RENDERER_VERSION,
        publicNumbers,
        publicLabels,
      };
    }

    if (mode === "n3l-pairs") {
      const hidePair = hidden.has("n3lParachutistPair") || hidden.has("n3lPairRule");
      const body = [
        `<text x="320" y="34" text-anchor="middle" font-size="16" font-weight="700" fill="#0f172a">Forces Acting on a Falling Parachutist and the Earth</text>`,
        // Skydiver box
        `<circle cx="230" cy="148" r="24" fill="#eff6ff" stroke="#1d4ed8" stroke-width="2"/>`,
        `<text x="230" y="153" text-anchor="middle" font-size="12" font-weight="700" fill="#0f172a">Skydiver</text>`,
        // Upward drag D
        `<line x1="230" y1="124" x2="230" y2="70" stroke="#047857" stroke-width="2.8" marker-end="url(#arr-mc-b)"/>`,
        `<text x="246" y="88" font-size="12.5" font-weight="700" fill="#047857">Air drag D</text>`,
        // Downward weight W
        `<line x1="230" y1="172" x2="230" y2="228" stroke="#dc2626" stroke-width="2.8" marker-end="url(#arr-mc-r)"/>`,
        `<text x="246" y="216" font-size="12.5" font-weight="700" fill="#dc2626">Weight W (Earth on skydiver)</text>`,
        // Earth arc
        `<path d="M 90 308 Q 230 264 370 308" fill="#dcfce7" stroke="#047857" stroke-width="2"/>`,
        `<text x="230" y="302" text-anchor="middle" font-size="13" font-weight="700" fill="#065f46">Earth</text>`,
        // Upward reaction on Earth
        `<line x1="230" y1="286" x2="230" y2="246" stroke="#7c3aed" stroke-width="2.6" stroke-dasharray="5 3"/>`,
        `<polygon points="230,242 224,252 236,252" fill="#7c3aed"/>`,
        `<text x="388" y="264" font-size="12.5" font-weight="700" fill="#7c3aed">${hidePair ? "Force F?" : "Gravitational pull on Earth"}</text>`,
        `<rect x="406" y="94" width="204" height="120" rx="10" fill="#f8fafc" stroke="#cbd5e1" stroke-width="1.4"/>`,
        `<text x="422" y="122" font-size="12.5" font-weight="700" fill="#0f172a">Check Both Laws:</text>`,
        `<text x="422" y="148" font-size="11.5" fill="#334155">• Equilibrium acts on 1 body</text>`,
        `<text x="422" y="172" font-size="11.5" fill="#334155">• N3L pair acts on 2 bodies</text>`,
        `<text x="422" y="196" font-size="11.5" fill="#334155">• Same fundamental force type</text>`,
      ].join("");
      return {
        visualFamily: "mechanics",
        svgMarkup: wrapSvg(
          "Newton third law force diagram",
          "Force diagram showing air drag and weight on a skydiver alongside the gravitational interaction with the Earth",
          defs,
          body,
        ),
        rendererVersion: ALEVEL_CORE_AS_RENDERER_VERSION,
        publicNumbers,
        publicLabels,
      };
    }

    // Two-stage skydiver v-t graph + small FBD inset
    const hideLabels = hidden.has("motionPhaseRule") || hidden.has("lorAnchor");
    const body = [
      `<text x="320" y="32" text-anchor="middle" font-size="15.5" font-weight="700" fill="#0f172a">Two-Stage Skydiver Velocity–Time Graph</text>`,
      `<line x1="76" y1="290" x2="466" y2="290" stroke="#0f172a" stroke-width="2" marker-end="url(#arr-mc-ax)"/>`,
      `<line x1="76" y1="300" x2="76" y2="58" stroke="#0f172a" stroke-width="2" marker-end="url(#arr-mc-ax)"/>`,
      `<text x="462" y="312" text-anchor="end" font-size="12.5" font-weight="600" fill="#0f172a">Time t</text>`,
      `<text x="88" y="70" font-size="12.5" font-weight="600" fill="#0f172a">Downward speed v</text>`,
      // Skydiver curve O -> A -> B (vT1) -> C (chute drop) -> D (vT2)
      `<path d="M 76 290 C 110 176 154 114 210 112 L 284 112 C 304 112 318 222 360 228 L 444 228" fill="none" stroke="#1d4ed8" stroke-width="2.8"/>`,
      `<circle cx="128" cy="176" r="4.5" fill="#dc2626"/><text x="114" y="166" font-size="12.5" font-weight="700" fill="#dc2626">P</text>`,
      `<circle cx="246" cy="112" r="4.5" fill="#047857"/><text x="246" y="98" text-anchor="middle" font-size="12.5" font-weight="700" fill="#047857">${hideLabels ? "Q" : "Q (vT1)"}</text>`,
      `<circle cx="308" cy="164" r="4.5" fill="#7c3aed"/><text x="322" y="160" font-size="12.5" font-weight="700" fill="#7c3aed">${hideLabels ? "R" : "R (chute)"}</text>`,
      `<circle cx="404" cy="228" r="4.5" fill="#047857"/><text x="404" y="214" text-anchor="middle" font-size="12.5" font-weight="700" fill="#047857">${hideLabels ? "S" : "S (vT2)"}</text>`,
      // FBD inset
      `<rect x="484" y="88" width="132" height="196" rx="10" fill="#f8fafc" stroke="#cbd5e1" stroke-width="1.5"/>`,
      `<text x="550" y="112" text-anchor="middle" font-size="12" font-weight="700" fill="#0f172a">Free-Body Forces</text>`,
      `<line x1="550" y1="176" x2="550" y2="128" stroke="#1d4ed8" stroke-width="2.6" marker-end="url(#arr-mc-b)"/>`,
      `<text x="562" y="144" font-size="12" font-weight="700" fill="#1d4ed8">Drag D</text>`,
      `<circle cx="550" cy="186" r="10" fill="#0f172a"/>`,
      `<line x1="550" y1="196" x2="550" y2="254" stroke="#dc2626" stroke-width="2.6" marker-end="url(#arr-mc-r)"/>`,
      `<text x="562" y="242" font-size="12" font-weight="700" fill="#dc2626">Weight mg</text>`,
    ].join("");
    return {
      visualFamily: "mechanics",
      svgMarkup: wrapSvg(
        "Skydiver terminal velocity graph",
        "Velocity-time graph of a two-stage parachute jump with labelled regions P, Q, R, S and free-body force inset",
        defs,
        body,
      ),
      rendererVersion: ALEVEL_CORE_AS_RENDERER_VERSION,
      publicNumbers,
      publicLabels,
    };
  },
};

/* -------------------------------------------------------------------------- */
/*  13. al-as-stress-strain-materials (Section 3.4.2, graphs)                 */
/* -------------------------------------------------------------------------- */

const MATERIAL_MODES = ["multi-curve", "single-wire", "hysteresis"] as const;
const MATERIAL_PROFILES = ["brittle", "ductile", "polymeric"] as const;

const stressStrainMaterialsPlugin: DomainKindPlugin = {
  domain: "graphs",
  kind: "al-as-stress-strain-materials",
  summary:
    "Section 3.4.2 tensile stress, strain, Young modulus, strain energy density, and brittle/ductile/rubber hysteresis multi-curve comparison (6m LoR).",
  requiredFields: [
    { name: "kind", type: "string", enumValues: ["al-as-stress-strain-materials"] },
    { name: "visualMode", type: "string", enumValues: MATERIAL_MODES },
    { name: "forceN", type: "number", unit: "N", bounds: "5 <= F <= 5000" },
    { name: "areaMm2", type: "number", unit: "mm^2", bounds: "0.05 <= A <= 50" },
    { name: "lengthM", type: "number", unit: "m", bounds: "0.2 <= L <= 10" },
    { name: "extensionMm", type: "number", unit: "mm", bounds: "0.1 <= dx <= 150" },
    { name: "materialProfile", type: "string", enumValues: MATERIAL_PROFILES },
  ],
  physicalConstraints: [
    "Young modulus E = stress / strain is constant up to the limit of proportionality.",
    "Brittle materials fracture after very small plastic strain; ductile materials show extensive plastic deformation; rubber shows elastic hysteresis.",
  ],
  probeSpecs: [
    {
      kind: "al-as-stress-strain-materials",
      visualMode: "multi-curve",
      forceN: 120,
      areaMm2: 0.8,
      lengthM: 2.0,
      extensionMm: 1.5,
      materialProfile: "ductile",
    },
    {
      kind: "al-as-stress-strain-materials",
      visualMode: "hysteresis",
      forceN: 36,
      areaMm2: 12.0,
      lengthM: 0.5,
      extensionMm: 80,
      materialProfile: "polymeric",
    },
  ],
  validate(spec): DomainValidationResult {
    const issues: string[] = [];
    if (spec.kind !== "al-as-stress-strain-materials") {
      issues.push('kind must be "al-as-stress-strain-materials"');
    }
    if (!isStringOneOf(spec.visualMode, MATERIAL_MODES)) {
      issues.push(`visualMode must be one of ${MATERIAL_MODES.join(", ")}`);
    }
    if (!isStringOneOf(spec.materialProfile, MATERIAL_PROFILES)) {
      issues.push(`materialProfile must be one of ${MATERIAL_PROFILES.join(", ")}`);
    }
    if (!isPosNum(spec.forceN) || spec.forceN > 20000) {
      issues.push("forceN must lie in (0, 20000] N");
    }
    if (!isPosNum(spec.areaMm2) || spec.areaMm2 > 100) {
      issues.push("areaMm2 must lie in (0, 100] mm^2");
    }
    if (!isPosNum(spec.lengthM) || spec.lengthM > 20) {
      issues.push("lengthM must lie in (0, 20] m");
    }
    if (!isPosNum(spec.extensionMm) || spec.extensionMm > 500) {
      issues.push("extensionMm must lie in (0, 500] mm");
    }
    return { valid: issues.length === 0, issues };
  },
  solve(spec): DomainSolveOutput {
    const F = spec.forceN as number;
    const areaMm2 = spec.areaMm2 as number;
    const L = spec.lengthM as number;
    const extMm = spec.extensionMm as number;
    const prof = spec.materialProfile as (typeof MATERIAL_PROFILES)[number];

    const areaM2 = areaMm2 * 1e-6;
    const extM = extMm * 1e-3;
    const stressPa = F / areaM2;
    const stressMPa = stressPa / 1e6;
    const strain = extM / L;
    const youngModulusPa = stressPa / strain;
    const youngModulusGPa = youngModulusPa / 1e9;
    const strainEnergyDensityJm3 = 0.5 * stressPa * strain;
    const elasticEnergyJ = 0.5 * F * extM;

    const classRules: Record<(typeof MATERIAL_PROFILES)[number], string> = {
      brittle:
        "brittle material fractures after very small plastic strain with no necking",
      ductile:
        "ductile material undergoes extensive plastic deformation after yield and unloads parallel to the linear gradient",
      polymeric:
        "polymeric rubber shows large non linear elastic strain and an unloading hysteresis loop dissipating thermal energy",
    };

    return {
      solverId: "sixthphysics/al-as-stress-strain-materials/1.0.0",
      quantities: {
        stressPa,
        stressMPa,
        strain,
        youngModulusPa,
        youngModulusGPa,
        strainEnergyDensityJm3,
        elasticEnergyJ,
        materialClassRule: classRules[prof],
        hookeLawRule:
          "extension is directly proportional to force up to the limit of proportionality",
        stiffnessVsStrengthRule:
          "gradient measures stiffness Young modulus whereas peak stress measures ultimate tensile strength",
        unloadingRule:
          "unloading curve is parallel to the initial linear section leaving permanent plastic strain",
        hysteresisRule:
          "area enclosed by the hysteresis loop equals thermal energy dissipated per unit volume",
        lorAnchor:
          "brittle fractures after very small plastic strain ductile yields with permanent plastic strain and rubber forms an elastic hysteresis loop",
      },
      publicNumbers: [F, areaMm2, L, extMm],
    };
  },
  renderSvg(spec, options): DomainRenderOutput {
    const hidden = getHiddenSet(spec, options);
    const mode = spec.visualMode as (typeof MATERIAL_MODES)[number];
    const defs = arrowMarkerDef("arr-mat", "#0f172a");
    const publicNumbers: number[] = [];
    const publicLabels: string[] = [];

    if (mode === "hysteresis") {
      const hideHyst = hidden.has("hysteresisRule") || hidden.has("materialClassRule");
      const body = [
        `<text x="320" y="34" text-anchor="middle" font-size="16" font-weight="700" fill="#0f172a">Loading and Unloading Stress–Strain Curve for Rubber</text>`,
        `<line x1="92" y1="292" x2="574" y2="292" stroke="#0f172a" stroke-width="2" marker-end="url(#arr-mat)"/>`,
        `<line x1="92" y1="302" x2="92" y2="62" stroke="#0f172a" stroke-width="2" marker-end="url(#arr-mat)"/>`,
        `<text x="570" y="314" text-anchor="end" font-size="12.5" font-weight="600" fill="#0f172a">Tensile strain ε</text>`,
        `<text x="104" y="74" font-size="12.5" font-weight="600" fill="#0f172a">Tensile stress σ</text>`,
        // Shaded hysteresis loop
        `<path d="M 92 292 C 184 214 336 226 488 94 C 412 246 254 274 92 292 Z" fill="#fef3c7" stroke="none"/>`,
        // Loading curve (upper)
        `<path d="M 92 292 C 184 214 336 226 488 94" fill="none" stroke="#1d4ed8" stroke-width="2.8"/>`,
        // Unloading curve (lower)
        `<path d="M 488 94 C 412 246 254 274 92 292" fill="none" stroke="#dc2626" stroke-width="2.6" stroke-dasharray="7 4"/>`,
        `<text x="276" y="176" font-size="12.5" font-weight="700" fill="#1d4ed8">Loading</text>`,
        `<text x="382" y="250" font-size="12.5" font-weight="700" fill="#dc2626">Unloading</text>`,
        `<text x="312" y="226" text-anchor="middle" font-size="12" font-weight="600" fill="#92400e">${hideHyst ? "Shaded loop area" : "Hysteresis loop"}</text>`,
      ].join("");
      return {
        visualFamily: "graphs",
        svgMarkup: wrapSvg(
          "Rubber stress-strain hysteresis graph",
          "Stress-strain loading and unloading curves for an elastomer enclosing a shaded hysteresis loop",
          defs,
          body,
        ),
        rendererVersion: ALEVEL_CORE_AS_RENDERER_VERSION,
        publicNumbers,
        publicLabels,
      };
    }

    // Multi-curve comparison (A: brittle, B: ductile with parallel unloading, C: rubber hysteresis)
    const hideNames =
      hidden.has("materialClassRule") ||
      hidden.has("lorAnchor") ||
      hidden.has("brittleRule") ||
      hidden.has("unloadingRule");
    const body = [
      `<text x="320" y="32" text-anchor="middle" font-size="15.5" font-weight="700" fill="#0f172a">Tensile Stress–Strain Curves for Three Solid Materials</text>`,
      `<line x1="86" y1="292" x2="584" y2="292" stroke="#0f172a" stroke-width="2" marker-end="url(#arr-mat)"/>`,
      `<line x1="86" y1="302" x2="86" y2="58" stroke="#0f172a" stroke-width="2" marker-end="url(#arr-mat)"/>`,
      `<text x="580" y="314" text-anchor="end" font-size="12.5" font-weight="600" fill="#0f172a">Tensile strain ε</text>`,
      `<text x="98" y="70" font-size="12.5" font-weight="600" fill="#0f172a">Tensile stress σ</text>`,
      // Material A: Brittle (steep straight line ending at cross)
      `<line x1="86" y1="292" x2="174" y2="92" stroke="#dc2626" stroke-width="2.8"/>`,
      `<path d="M 168 86 L 180 98 M 180 86 L 168 98" stroke="#dc2626" stroke-width="2.4"/>`,
      `<text x="184" y="88" font-size="12.5" font-weight="700" fill="#dc2626">${hideNames ? "Material A" : "A (Brittle)"}</text>`,
      // Material B: Ductile (linear -> P -> yield -> UTS -> necking + dashed parallel unloading)
      `<path d="M 86 292 L 164 172 C 186 142 240 124 318 124 C 362 124 398 148 430 166" fill="none" stroke="#1d4ed8" stroke-width="2.8"/>`,
      `<path d="M 424 160 L 436 172 M 436 160 L 424 172" stroke="#1d4ed8" stroke-width="2.4"/>`,
      `<line x1="274" y1="126" x2="166" y2="292" stroke="#1d4ed8" stroke-width="1.8" stroke-dasharray="6 4"/>`,
      `<circle cx="156" cy="184" r="4" fill="#0f172a"/><text x="142" y="182" text-anchor="end" font-size="11.5" font-weight="700" fill="#0f172a">P</text>`,
      `<circle cx="318" cy="124" r="4" fill="#1d4ed8"/><text x="318" y="112" text-anchor="middle" font-size="11.5" font-weight="700" fill="#1d4ed8">UTS</text>`,
      `<text x="442" y="168" font-size="12.5" font-weight="700" fill="#1d4ed8">${hideNames ? "Material B" : "B (Ductile)"}</text>`,
      // Material C: Polymeric rubber hysteresis loop
      `<path d="M 86 292 C 216 254 374 252 536 196 C 460 272 284 282 86 292 Z" fill="#dcfce7" fill-opacity="0.7" stroke="none"/>`,
      `<path d="M 86 292 C 216 254 374 252 536 196" fill="none" stroke="#047857" stroke-width="2.6"/>`,
      `<path d="M 536 196 C 460 272 284 282 86 292" fill="none" stroke="#047857" stroke-width="1.8" stroke-dasharray="5 3"/>`,
      `<text x="542" y="200" font-size="12.5" font-weight="700" fill="#047857">${hideNames ? "Material C" : "C (Rubber)"}</text>`,
    ].join("");
    return {
      visualFamily: "graphs",
      svgMarkup: wrapSvg(
        "Multi-material stress-strain graph",
        "Stress-strain graph comparing three materials labelled A, B, and C including parallel unloading and hysteresis loop",
        defs,
        body,
      ),
      rendererVersion: ALEVEL_CORE_AS_RENDERER_VERSION,
      publicNumbers,
      publicLabels,
    };
  },
};

/* -------------------------------------------------------------------------- */
/*  14. al-as-superconductivity-tc (Section 3.5.1, graphs)                    */
/* -------------------------------------------------------------------------- */

const superconductivityTcPlugin: DomainKindPlugin = {
  domain: "graphs",
  kind: "al-as-superconductivity-tc",
  summary:
    "Section 3.5.1 superconductivity R-T critical temperature Tc transition (exact zero resistance for T <= Tc), lossless I^2 R power, and cryogenic applications/limits.",
  requiredFields: [
    { name: "kind", type: "string", enumValues: ["al-as-superconductivity-tc"] },
    { name: "materialLabel", type: "string" },
    { name: "criticalTempK", type: "number", unit: "K", bounds: "1 <= Tc <= 150" },
    { name: "operatingTempK", type: "number", unit: "K", bounds: "1 <= T <= 300" },
    { name: "normalResistanceOhm", type: "number", unit: "Ω", bounds: "0.01 <= R <= 500" },
    { name: "currentA", type: "number", unit: "A", bounds: "0.5 <= I <= 1000" },
  ],
  physicalConstraints: [
    "Superconductor exhibits exactly zero electrical resistance and resistivity at or below Tc.",
    "Normal metals retain finite non-zero residual resistance approaching 0 K.",
  ],
  probeSpecs: [
    {
      kind: "al-as-superconductivity-tc",
      materialLabel: "Mercury",
      criticalTempK: 4.2,
      operatingTempK: 3.5,
      normalResistanceOhm: 0.12,
      currentA: 25,
    },
    {
      kind: "al-as-superconductivity-tc",
      materialLabel: "YBCO ceramic",
      criticalTempK: 92,
      operatingTempK: 77,
      normalResistanceOhm: 1.8,
      currentA: 40,
    },
  ],
  validate(spec): DomainValidationResult {
    const issues: string[] = [];
    if (spec.kind !== "al-as-superconductivity-tc") {
      issues.push('kind must be "al-as-superconductivity-tc"');
    }
    if (typeof spec.materialLabel !== "string" || !spec.materialLabel.trim()) {
      issues.push("materialLabel must be a non-empty string");
    }
    if (!isPosNum(spec.criticalTempK) || spec.criticalTempK > 200) {
      issues.push("criticalTempK must lie in (0, 200] K");
    }
    if (!isPosNum(spec.operatingTempK) || spec.operatingTempK > 350) {
      issues.push("operatingTempK must lie in (0, 350] K");
    }
    if (!isPosNum(spec.normalResistanceOhm) || spec.normalResistanceOhm > 1000) {
      issues.push("normalResistanceOhm must lie in (0, 1000] Ω");
    }
    if (!isPosNum(spec.currentA) || spec.currentA > 2000) {
      issues.push("currentA must lie in (0, 2000] A");
    }
    return { valid: issues.length === 0, issues };
  },
  solve(spec): DomainSolveOutput {
    const tc = spec.criticalTempK as number;
    const tOp = spec.operatingTempK as number;
    const rNorm = spec.normalResistanceOhm as number;
    const I = spec.currentA as number;
    const isSuper = tOp <= tc;
    const effectiveResistanceOhm = isSuper ? 0 : rNorm;
    const powerDissipatedW = I * I * effectiveResistanceOhm;
    const normalPowerLossW = I * I * rNorm;
    const coolingBelowRoomK = 293 - tc;
    const tempMarginK = tc - tOp;

    return {
      solverId: "sixthphysics/al-as-superconductivity-tc/1.0.0",
      quantities: {
        criticalTempK: tc,
        operatingTempK: tOp,
        effectiveResistanceOhm,
        powerDissipatedW,
        normalPowerLossW,
        coolingBelowRoomK,
        tempMarginK,
        isSuperconducting: isSuper,
        superconductorDefinition:
          "zero electrical resistance at or below the critical temperature",
        stateAtOperatingTemp: isSuper
          ? "superconducting state with zero resistance and zero heating loss"
          : "normal resistive state above the critical temperature",
        superconductorApplication:
          "high field MRI electromagnets and lossless electrical power cables",
        superconductorLimitation:
          "expensive cryogenic cooling is required to stay below the critical temperature",
        normalMetalContrast:
          "normal metal resistance decreases smoothly with temperature but never drops suddenly to zero",
      },
      publicNumbers: [tc, tOp, rNorm, I],
    };
  },
  renderSvg(spec, options): DomainRenderOutput {
    const hidden = getHiddenSet(spec, options);
    const tc = spec.criticalTempK as number;
    const hideTc = hidden.has("criticalTempK") || hidden.has("coolingBelowRoomK");
    const hideRule =
      hidden.has("superconductorDefinition") ||
      hidden.has("normalMetalContrast");
    const defs = arrowMarkerDef("arr-sc", "#0f172a");
    const publicNumbers: number[] = [0];
    const publicLabels: string[] = ["0"];

    const x0 = 96;
    const xEnd = 564;
    const y0 = 286;
    const yTop = 64;
    const xTc = 248;
    if (!hideTc) {
      publicNumbers.push(tc);
      publicLabels.push(`Tc = ${fmtClean(tc, 3)} K`);
    }

    const body = [
      `<text x="320" y="34" text-anchor="middle" font-size="16" font-weight="700" fill="#0f172a">Resistance versus Absolute Temperature Near Transition</text>`,
      `<line x1="${x0}" y1="${y0}" x2="${xEnd + 16}" y2="${y0}" stroke="#0f172a" stroke-width="2" marker-end="url(#arr-sc)"/>`,
      `<line x1="${x0}" y1="${y0 + 10}" x2="${x0}" y2="${yTop - 8}" stroke="#0f172a" stroke-width="2" marker-end="url(#arr-sc)"/>`,
      `<text x="${xEnd + 12}" y="${y0 + 24}" text-anchor="end" font-size="12.5" font-weight="600" fill="#0f172a">Temperature T / K</text>`,
      `<text x="${x0 + 12}" y="${yTop + 8}" font-size="12.5" font-weight="600" fill="#0f172a">Resistance R / Ω</text>`,
      `<text x="${x0 - 14}" y="${y0 + 5}" text-anchor="end" font-size="12" fill="#334155">0</text>`,
      // Normal metal dashed curve
      `<path d="M ${x0} 236 C 210 228 360 170 536 96" fill="none" stroke="#64748b" stroke-width="2.2" stroke-dasharray="7 5"/>`,
      `<text x="412" y="128" font-size="12" font-weight="600" fill="#475569">${hideRule ? "Curve Y" : "Normal metal"}</text>`,
      // Superconductor step drop to exact 0 at Tc
      `<line x1="${x0}" y1="${y0}" x2="${xTc}" y2="${y0}" stroke="#1d4ed8" stroke-width="4.2"/>`,
      `<line x1="${xTc}" y1="${y0}" x2="${xTc}" y2="184" stroke="#1d4ed8" stroke-width="2.8"/>`,
      `<path d="M ${xTc} 184 C 340 162 436 138 536 118" fill="none" stroke="#1d4ed8" stroke-width="2.8"/>`,
      `<circle cx="${xTc}" cy="${y0}" r="5" fill="#dc2626"/>`,
      `<text x="${xTc}" y="${y0 + 24}" text-anchor="middle" font-size="13" font-weight="700" fill="#dc2626">${hideTc ? subLabel("T", "c", 13) : `Tc = ${fmtClean(tc, 3)} K`}</text>`,
      `<text x="386" y="190" font-size="12.5" font-weight="700" fill="#1d4ed8">${hideRule ? "Curve X" : "Superconductor"}</text>`,
      `<text x="172" y="274" text-anchor="middle" font-size="11.5" font-weight="700" fill="#1d4ed8">${hideRule ? "R on axis" : "R = 0"}</text>`,
    ].join("");
    return {
      visualFamily: "graphs",
      svgMarkup: wrapSvg(
        "Superconductor resistance versus temperature graph",
        "Resistance against absolute temperature comparing a sudden superconducting transition at Tc with a normal metal",
        defs,
        body,
      ),
      rendererVersion: ALEVEL_CORE_AS_RENDERER_VERSION,
      publicNumbers,
      publicLabels,
    };
  },
};

/* -------------------------------------------------------------------------- */
/*  15. al-as-nonohmic-iv-microscopic (Section 3.5.1, circuits)               */
/* -------------------------------------------------------------------------- */

const IV_COMP_TYPES = [
  "filament-lamp",
  "ntc-thermistor",
  "semiconductor-diode",
  "ohmic-resistor",
] as const;

const nonohmicIvMicroscopicPlugin: DomainKindPlugin = {
  domain: "circuits",
  kind: "al-as-nonohmic-iv-microscopic",
  summary:
    "Section 3.5.1 non-ohmic I-V characteristics (filament lamp, NTC thermistor, semiconductor diode), R = V/I vs 1/gradient trap, and microscopic 6m LoR.",
  requiredFields: [
    { name: "kind", type: "string", enumValues: ["al-as-nonohmic-iv-microscopic"] },
    { name: "componentType", type: "string", enumValues: IV_COMP_TYPES },
    { name: "voltageV", type: "number", unit: "V", bounds: "0.2 <= V <= 24" },
    { name: "currentA", type: "number", unit: "A", bounds: "0.005 <= I <= 10" },
  ],
  optionalFields: [
    { name: "thresholdVoltageV", type: "number", unit: "V", bounds: "0.5 <= Vth <= 0.8" },
    { name: "showCircuitInset", type: "boolean" },
  ],
  physicalConstraints: [
    "Resistance at any point on an I-V curve is strictly R = V / I, never 1 / gradient.",
    "Filament resistance rises with temperature due to larger lattice ion vibration amplitude; NTC thermistor resistance falls as free carrier density n rises sharply.",
  ],
  probeSpecs: [
    {
      kind: "al-as-nonohmic-iv-microscopic",
      componentType: "filament-lamp",
      voltageV: 6.0,
      currentA: 0.48,
      showCircuitInset: true,
    },
    {
      kind: "al-as-nonohmic-iv-microscopic",
      componentType: "semiconductor-diode",
      voltageV: 0.8,
      currentA: 0.04,
      thresholdVoltageV: 0.65,
      showCircuitInset: false,
    },
  ],
  validate(spec): DomainValidationResult {
    const issues: string[] = [];
    if (spec.kind !== "al-as-nonohmic-iv-microscopic") {
      issues.push('kind must be "al-as-nonohmic-iv-microscopic"');
    }
    if (!isStringOneOf(spec.componentType, IV_COMP_TYPES)) {
      issues.push(`componentType must be one of ${IV_COMP_TYPES.join(", ")}`);
    }
    if (!isPosNum(spec.voltageV) || spec.voltageV > 30) {
      issues.push("voltageV must lie in (0, 30] V");
    }
    if (!isPosNum(spec.currentA) || spec.currentA > 20) {
      issues.push("currentA must lie in (0, 20] A");
    }
    return { valid: issues.length === 0, issues };
  },
  solve(spec): DomainSolveOutput {
    const comp = spec.componentType as (typeof IV_COMP_TYPES)[number];
    const V = spec.voltageV as number;
    const I = spec.currentA as number;
    const vTh = isPosNum(spec.thresholdVoltageV) ? spec.thresholdVoltageV : 0.65;
    const resistanceOhm = V / I;
    const powerW = V * I;
    // Simulated tangent reciprocal 1/(dI/dV) to distinguish from true R = V/I
    const tangentFactor =
      comp === "filament-lamp"
        ? 1.75
        : comp === "ntc-thermistor"
          ? 0.58
          : comp === "semiconductor-diode"
            ? 0.25
            : 1.0;
    const wrongGradientResistanceOhm = resistanceOhm * tangentFactor;

    const mechMap: Record<(typeof IV_COMP_TYPES)[number], string> = {
      "filament-lamp":
        "higher temperature increases lattice ion vibration amplitude causing more frequent collisions with conduction electrons so resistance increases",
      "ntc-thermistor":
        "higher temperature liberates many more free charge carriers outweighing lattice vibrations so resistance decreases",
      "semiconductor-diode":
        "conducts sharply above forward threshold potential difference with decreasing resistance while reverse bias has very high resistance",
      "ohmic-resistor":
        "current is directly proportional to potential difference at constant temperature giving constant resistance",
    };

    return {
      solverId: "sixthphysics/al-as-nonohmic-iv-microscopic/1.0.0",
      quantities: {
        voltageV: V,
        currentA: I,
        thresholdVoltageV: vTh,
        resistanceOhm,
        powerW,
        wrongGradientResistanceOhm,
        resistanceReadingRule:
          "divide potential difference by current at the operating point and never take one over the tangent gradient",
        ohmsLawDefinition:
          "current is directly proportional to potential difference provided temperature and physical conditions remain constant",
        microscopicMechanism: mechMap[comp],
        circuitSetupRule:
          "connect voltmeter in parallel across the component ammeter in series and use a potential divider to vary potential difference from zero",
        lorAnchor:
          "resistance is V divided by I filament ions vibrate more with temperature while thermistor carrier density rises sharply",
      },
      publicNumbers: [V, I],
    };
  },
  renderSvg(spec, options): DomainRenderOutput {
    const hidden = getHiddenSet(spec, options);
    const comp = spec.componentType as (typeof IV_COMP_TYPES)[number];
    const V = spec.voltageV as number;
    const I = spec.currentA as number;
    const showCircuit = Boolean(spec.showCircuitInset);
    const defs = arrowMarkerDef("arr-iv", "#0f172a");
    const publicNumbers: number[] = [];
    const publicLabels: string[] = [];

    const cx = showCircuit ? 216 : 316;
    const cy = 194;
    const xL = showCircuit ? 52 : 96;
    const xR = showCircuit ? 380 : 536;
    const yT = 64;
    const yB = 318;

    let curvePath = "";
    let ptX = cx + 104;
    let ptY = cy - 78;
    if (comp === "filament-lamp") {
      curvePath = `M ${fc(cx - 144)} ${fc(cy + 84)} C ${fc(cx - 64)} ${fc(cy + 78)} ${fc(cx - 28)} ${fc(cy + 36)} ${cx} ${cy} C ${fc(cx + 28)} ${fc(cy - 36)} ${fc(cx + 64)} ${fc(cy - 78)} ${fc(cx + 144)} ${fc(cy - 84)}`;
      ptX = cx + 96;
      ptY = cy - 72;
    } else if (comp === "ntc-thermistor") {
      curvePath = `M ${fc(cx - 116)} ${fc(cy + 106)} C ${fc(cx - 72)} ${fc(cy + 34)} ${fc(cx - 32)} ${fc(cy + 12)} ${cx} ${cy} C ${fc(cx + 32)} ${fc(cy - 12)} ${fc(cx + 72)} ${fc(cy - 34)} ${fc(cx + 116)} ${fc(cy - 106)}`;
      ptX = cx + 82;
      ptY = cy - 60;
    } else if (comp === "semiconductor-diode") {
      curvePath = `M ${fc(cx - 142)} ${fc(cy + 2)} L ${fc(cx + 42)} ${fc(cy - 1)} C ${fc(cx + 64)} ${fc(cy - 4)} ${fc(cx + 78)} ${fc(cy - 42)} ${fc(cx + 96)} ${fc(cy - 112)}`;
      ptX = cx + 80;
      ptY = cy - 58;
    } else {
      curvePath = `M ${fc(cx - 130)} ${fc(cy + 98)} L ${fc(cx + 130)} ${fc(cy - 98)}`;
      ptX = cx + 90;
      ptY = cy - 68;
    }

    const hidePoint =
      hidden.has("resistanceOhm") &&
      (hidden.has("voltageV") || hidden.has("currentA"));
    const hideCompName =
      hidden.has("microscopicMechanism") || hidden.has("lorAnchor");
    if (!hidePoint) {
      publicNumbers.push(V, I);
      publicLabels.push(`(${fmtClean(V, 3)} V, ${fmtClean(I, 3)} A)`);
    }

    const circuitInset = showCircuit
      ? [
          `<rect x="406" y="72" width="208" height="236" rx="10" fill="#f8fafc" stroke="#cbd5e1" stroke-width="1.5"/>`,
          `<text x="510" y="96" text-anchor="middle" font-size="12" font-weight="700" fill="#0f172a">Test Circuit</text>`,
          // Outer loop
          `<rect x="436" y="118" width="148" height="148" fill="none" stroke="#0f172a" stroke-width="2"/>`,
          // Cell at top
          `<rect x="496" y="108" width="28" height="20" fill="#f8fafc"/>`,
          `<line x1="504" y1="106" x2="504" y2="130" stroke="#0f172a" stroke-width="2"/>`,
          `<line x1="516" y1="112" x2="516" y2="124" stroke="#0f172a" stroke-width="3.6"/>`,
          // Ammeter in series on left
          `<circle cx="436" cy="192" r="14" fill="#ffffff" stroke="#1d4ed8" stroke-width="2"/>`,
          `<text x="436" y="197" text-anchor="middle" font-size="12.5" font-weight="700" fill="#1d4ed8">A</text>`,
          // Component on bottom
          `<rect x="484" y="254" width="52" height="24" rx="4" fill="#eff6ff" stroke="#0f172a" stroke-width="2"/>`,
          `<text x="510" y="270" text-anchor="middle" font-size="11.5" font-weight="700" fill="#0f172a">X</text>`,
          // Voltmeter in parallel across X
          `<polyline points="468,266 468,216 552,216 552,266" fill="none" stroke="#047857" stroke-width="1.8"/>`,
          `<circle cx="510" cy="216" r="14" fill="#ffffff" stroke="#047857" stroke-width="2"/>`,
          `<text x="510" y="221" text-anchor="middle" font-size="12.5" font-weight="700" fill="#047857">V</text>`,
          `<text x="510" y="298" text-anchor="middle" font-size="11" fill="#475569">V parallel · A series</text>`,
        ].join("")
      : "";

    const titleText = hideCompName
      ? "Component Current–Voltage (I–V) Characteristic"
      : `I–V Characteristic: ${comp.replace(/-/g, " ")}`;
    const body = [
      `<text x="320" y="34" text-anchor="middle" font-size="15.5" font-weight="700" fill="#0f172a">${esc(titleText)}</text>`,
      `<line x1="${xL}" y1="${cy}" x2="${xR}" y2="${cy}" stroke="#0f172a" stroke-width="2" marker-end="url(#arr-iv)"/>`,
      `<line x1="${cx}" y1="${yB}" x2="${cx}" y2="${yT}" stroke="#0f172a" stroke-width="2" marker-end="url(#arr-iv)"/>`,
      `<text x="${xR - 4}" y="${cy + 20}" text-anchor="end" font-size="12.5" font-weight="600" fill="#0f172a">V / V</text>`,
      `<text x="${cx + 12}" y="${yT + 10}" font-size="12.5" font-weight="600" fill="#0f172a">I / A</text>`,
      `<path d="${curvePath}" fill="none" stroke="#1d4ed8" stroke-width="2.8"/>`,
      `<line x1="${fc(ptX)}" y1="${cy}" x2="${fc(ptX)}" y2="${fc(ptY)}" stroke="#dc2626" stroke-width="1.4" stroke-dasharray="4 3"/>`,
      `<line x1="${cx}" y1="${fc(ptY)}" x2="${fc(ptX)}" y2="${fc(ptY)}" stroke="#dc2626" stroke-width="1.4" stroke-dasharray="4 3"/>`,
      `<circle cx="${fc(ptX)}" cy="${fc(ptY)}" r="5" fill="#dc2626"/>`,
      hidePoint
        ? `<text x="${fc(ptX + 8)}" y="${fc(ptY - 6)}" font-size="12" font-weight="700" fill="#dc2626">P</text>`
        : `<text x="${fc(ptX - 6)}" y="${fc(ptY - 10)}" text-anchor="middle" font-size="11.5" font-weight="700" fill="#dc2626">(${fmtClean(V, 3)} V, ${fmtClean(I, 3)} A)</text>`,
      circuitInset,
    ].join("");

    return {
      visualFamily: "circuits",
      svgMarkup: wrapSvg(
        "Component I-V characteristic curve",
        "Current against potential difference curve for a circuit component with a marked operating point",
        defs,
        body,
      ),
      rendererVersion: ALEVEL_CORE_AS_RENDERER_VERSION,
      publicNumbers,
      publicLabels,
    };
  },
};

/* -------------------------------------------------------------------------- */
/*  Exported Plugin Registry Array & Lookup Map                               */
/* -------------------------------------------------------------------------- */

export const ALEVEL_CORE_AS_PLUGINS: readonly DomainKindPlugin[] = [
  siBaseFermiPlugin,
  specificChargePlugin,
  strongNuclearForcePlugin,
  pairProdAnnihilationPlugin,
  feynmanInteractionsPlugin,
  hadronLeptonConservationPlugin,
  photoelectricWaveFailurePlugin,
  fluorescentSpectraEdiffPlugin,
  polarisationStationaryPlugin,
  whiteLightDiffractionPlugin,
  opticalFibreDispersionPlugin,
  terminalVelocityN3lImpulsePlugin,
  stressStrainMaterialsPlugin,
  superconductivityTcPlugin,
  nonohmicIvMicroscopicPlugin,
];

export const ALEVEL_CORE_AS_PLUGINS_BY_KIND: Readonly<
  Record<AlevelCoreAsScenarioKind, DomainKindPlugin>
> = Object.fromEntries(
  ALEVEL_CORE_AS_PLUGINS.map((plugin) => [plugin.kind, plugin]),
) as Record<AlevelCoreAsScenarioKind, DomainKindPlugin>;

export type { DomainKindFieldSpec, DomainKindPlugin, VerifiedQuantityMap };
export { fmtTick, toSub, toSup };
