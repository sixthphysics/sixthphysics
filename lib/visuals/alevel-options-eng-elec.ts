import type {
  DomainKindFieldSpec,
  DomainKindPlugin,
  DomainRenderOptions,
  DomainRenderOutput,
  DomainSolveOutput,
  DomainValidationResult,
} from "@/lib/bank-pipeline/domain-registry";
import type { VerifiedQuantityMap } from "@/lib/bank-pipeline/types";

export const ALEVEL_GRAVITY_MS2 = 9.81;
export const ALEVEL_MOLAR_GAS_CONSTANT = 8.31;
export const ALEVEL_OPT_EE_RENDERER_VERSION =
  "sixthphysics/alevel-opt-eng-elec-svg/1.0.0";

export const ALEVEL_OPTIONS_ENG_ELEC_SCENARIO_KINDS = [
  "al-opt-eng-moment-inertia-suvat",
  "al-opt-eng-flywheel-kers",
  "al-opt-eng-angular-momentum-impulse",
  "al-opt-eng-first-law-adiabatic",
  "al-opt-eng-otto-diesel-engines",
  "al-opt-eng-carnot-cop-heatpump",
  "al-opt-elec-discrete-semiconductors",
  "al-opt-elec-opamp-inverting-noninv",
  "al-opt-elec-opamp-summing-diff",
  "al-opt-elec-lc-resonance-filters",
  "al-opt-elec-timing-astable-555",
  "al-opt-elec-combinational-logic",
  "al-opt-elec-sequential-counters",
  "al-opt-elec-adc-pcm-comms",
] as const;

export type AlevelOptEngElecScenarioKind =
  (typeof ALEVEL_OPTIONS_ENG_ELEC_SCENARIO_KINDS)[number];

/* -------------------------------------------------------------------------- */
/*  Shared validation, formatting & SVG helpers                               */
/* -------------------------------------------------------------------------- */

const SVG_W = 640;
const SVG_H = 360;
const SVG_FONT =
  "'Plus Jakarta Sans', 'Segoe UI', Helvetica, Arial, sans-serif";
const INK = "#171b1f";
const MUTED = "#475569";
const GRID = "#e2e8f0";
const BLUE = "#1d4ed8";
const RED = "#b91c1c";
const GREEN = "#15803d";
const AMBER = "#b45309";
const PURPLE = "#6d28d9";

const SUP_MAP: Readonly<Record<string, string>> = {
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

function toSup(v: number | string): string {
  return [...String(v)].map((c) => SUP_MAP[c] ?? c).join("");
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

function escapeXml(raw: string): string {
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

export function fmtEngElecVal(v: number, sf = 3): string {
  if (!Number.isFinite(v) || Math.abs(v) < 1e-35) return "0";
  const sign = v < 0 ? "−" : "";
  const abs = Math.abs(v);
  const rounded = Number(abs.toPrecision(sf));
  if (rounded >= 1e-2 && rounded < 1e4) {
    if (Number.isInteger(rounded) && rounded >= 10) {
      return `${sign}${rounded}`;
    }
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

function fmtTick(v: number): string {
  if (Math.abs(v) < 1e-9) return "0";
  const r = Math.round(v * 100) / 100;
  return r < 0 ? `−${String(Math.abs(r))}` : String(r);
}

function extractHiddenSet(
  spec: Record<string, unknown>,
  options?: DomainRenderOptions,
): Set<string> {
  const out = new Set<string>();
  const raw = spec.hiddenQuantities;
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (typeof item === "string" && item.trim()) out.add(item.trim());
    }
  }
  if (options?.hiddenQuantities) {
    for (const item of options.hiddenQuantities) {
      if (typeof item === "string" && item.trim()) out.add(item.trim());
    }
  }
  return out;
}

function makeMarkerId(prefix: string, options?: DomainRenderOptions): string {
  const clean = (options?.id ?? "optee")
    .replace(/[^A-Za-z0-9-]/g, "")
    .slice(0, 20);
  return `${prefix}-${clean || "fig"}`;
}

function wrapSvg(args: {
  title: string;
  defs?: string;
  body: string;
}): string {
  const safeTitle = escapeXml(args.title);
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${SVG_W}" height="${SVG_H}" viewBox="0 0 ${SVG_W} ${SVG_H}" role="img" aria-label="${safeTitle}">`,
    `<title>${safeTitle}</title>`,
    args.defs ? `<defs>${args.defs}</defs>` : "",
    `<rect width="100%" height="100%" fill="#ffffff"/>`,
    `<g font-family="${SVG_FONT}">`,
    args.body,
    "</g>",
    "</svg>",
  ]
    .filter(Boolean)
    .join("");
}

function svgText(
  x: number,
  y: number,
  content: string,
  opts: {
    anchor?: "start" | "middle" | "end";
    size?: number;
    fill?: string;
    weight?: "normal" | "600" | "700";
    italic?: boolean;
    rotate?: number;
  } = {},
): string {
  const attrs: string[] = [
    `x="${fc(x)}"`,
    `y="${fc(y)}"`,
    `text-anchor="${opts.anchor ?? "middle"}"`,
    `font-size="${opts.size ?? 13}"`,
    `fill="${opts.fill ?? INK}"`,
  ];
  if (opts.weight && opts.weight !== "normal") {
    attrs.push(`font-weight="${opts.weight}"`);
  }
  if (opts.italic) {
    attrs.push(`font-style="italic"`);
  }
  if (opts.rotate !== undefined) {
    attrs.push(`transform="rotate(${opts.rotate} ${fc(x)} ${fc(y)})"`);
  }
  return `<text ${attrs.join(" ")}>${escapeXml(content)}</text>`;
}

/**
 * Renders `<text>` with an italic variable + crisp `<tspan>` subscript and optional tail,
 * emitting zero raw `_` or `^` characters.
 */
function svgSubLabel(
  x: number,
  y: number,
  base: string,
  sub: string,
  tail = "",
  opts: {
    anchor?: "start" | "middle" | "end";
    size?: number;
    fill?: string;
    weight?: "normal" | "600" | "700";
  } = {},
): string {
  const sz = opts.size ?? 13;
  const subSz = Math.max(9, Math.round(sz * 0.72));
  const attrs: string[] = [
    `x="${fc(x)}"`,
    `y="${fc(y)}"`,
    `text-anchor="${opts.anchor ?? "middle"}"`,
    `font-size="${sz}"`,
    `fill="${opts.fill ?? INK}"`,
  ];
  if (opts.weight && opts.weight !== "normal") {
    attrs.push(`font-weight="${opts.weight}"`);
  }
  const tailPart = tail
    ? `<tspan dy="-3" font-size="${sz}">${escapeXml(tail)}</tspan>`
    : "";
  return `<text ${attrs.join(" ")}>${escapeXml(base)}<tspan dy="3" font-size="${subSz}">${escapeXml(sub)}</tspan>${tailPart}</text>`;
}

function arrowMarkerDef(id: string, color: string): string {
  return `<marker id="${id}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto-start-reverse"><path d="M 0 1.2 L 9 5 L 0 8.8 z" fill="${color}"/></marker>`;
}

function drawResistorH(cx: number, cy: number, hw = 26, hh = 9): string {
  return `<rect x="${fc(cx - hw)}" y="${fc(cy - hh)}" width="${fc(hw * 2)}" height="${fc(hh * 2)}" fill="#ffffff" stroke="${INK}" stroke-width="2" rx="1"/>`;
}

function drawResistorV(cx: number, cy: number, hw = 9, hh = 24): string {
  return `<rect x="${fc(cx - hw)}" y="${fc(cy - hh)}" width="${fc(hw * 2)}" height="${fc(hh * 2)}" fill="#ffffff" stroke="${INK}" stroke-width="2" rx="1"/>`;
}

function drawGround(x: number, y: number): string {
  return [
    `<line x1="${fc(x)}" y1="${fc(y)}" x2="${fc(x)}" y2="${fc(y + 12)}" stroke="${INK}" stroke-width="2"/>`,
    `<line x1="${fc(x - 13)}" y1="${fc(y + 12)}" x2="${fc(x + 13)}" y2="${fc(y + 12)}" stroke="${INK}" stroke-width="2.2"/>`,
    `<line x1="${fc(x - 8)}" y1="${fc(y + 17)}" x2="${fc(x + 8)}" y2="${fc(y + 17)}" stroke="${INK}" stroke-width="1.8"/>`,
    `<line x1="${fc(x - 4)}" y1="${fc(y + 22)}" x2="${fc(x + 4)}" y2="${fc(y + 22)}" stroke="${INK}" stroke-width="1.5"/>`,
  ].join("");
}

function drawNodeDot(x: number, y: number, r = 3.5, fill = INK): string {
  return `<circle cx="${fc(x)}" cy="${fc(y)}" r="${fc(r)}" fill="${fill}"/>`;
}

function drawTerminalCircle(x: number, y: number): string {
  return `<circle cx="${fc(x)}" cy="${fc(y)}" r="4" fill="#ffffff" stroke="${INK}" stroke-width="2"/>`;
}

/* ========================================================================== */
/*  1. al-opt-eng-moment-inertia-suvat (mechanics)                            */
/* ========================================================================== */

const MOMENT_INERTIA_SUVAT_FIELDS: readonly DomainKindFieldSpec[] = [
  { name: "kind", type: "string", enumValues: ["al-opt-eng-moment-inertia-suvat"] },
  { name: "mode", type: "string", enumValues: ["drive", "brake"] },
  { name: "hubInertiaKgM2", type: "number", unit: "kg m^2", bounds: "> 0" },
  { name: "rimMassCount", type: "integer", bounds: "0..12" },
  { name: "rimMassKg", type: "number", unit: "kg", bounds: ">= 0" },
  { name: "rimRadiusM", type: "number", unit: "m", bounds: "> 0" },
  { name: "initialRevPerSec", type: "number", unit: "rev s^-1", bounds: ">= 0" },
  { name: "finalRevPerSec", type: "number", unit: "rev s^-1", bounds: ">= 0" },
  { name: "durationS", type: "number", unit: "s", bounds: "> 0" },
  { name: "frictionTorqueNm", type: "number", unit: "N m", bounds: ">= 0" },
  { name: "forceRadiusM", type: "number", unit: "m", bounds: "> 0" },
];

function validateMomentInertiaSuvat(
  spec: Record<string, unknown>,
): DomainValidationResult {
  const issues: string[] = [];
  if (spec.kind !== "al-opt-eng-moment-inertia-suvat") {
    issues.push('kind must be "al-opt-eng-moment-inertia-suvat"');
  }
  if (spec.mode !== "drive" && spec.mode !== "brake") {
    issues.push('mode must be "drive" or "brake"');
  }
  if (!isPosNum(spec.hubInertiaKgM2)) issues.push("hubInertiaKgM2 must be > 0");
  if (!isIntInRange(spec.rimMassCount, 0, 12)) {
    issues.push("rimMassCount must be an integer in 0..12");
  }
  if (!isNonNegNum(spec.rimMassKg)) issues.push("rimMassKg must be >= 0");
  if (!isPosNum(spec.rimRadiusM)) issues.push("rimRadiusM must be > 0");
  if (!isNonNegNum(spec.initialRevPerSec)) {
    issues.push("initialRevPerSec must be >= 0");
  }
  if (!isNonNegNum(spec.finalRevPerSec)) {
    issues.push("finalRevPerSec must be >= 0");
  }
  if (!isPosNum(spec.durationS)) issues.push("durationS must be > 0");
  if (!isNonNegNum(spec.frictionTorqueNm)) {
    issues.push("frictionTorqueNm must be >= 0");
  }
  if (!isPosNum(spec.forceRadiusM)) issues.push("forceRadiusM must be > 0");

  if (issues.length === 0) {
    const f1 = spec.initialRevPerSec as number;
    const f2 = spec.finalRevPerSec as number;
    if (spec.mode === "drive" && f2 <= f1) {
      issues.push("drive mode requires finalRevPerSec > initialRevPerSec");
    }
    if (spec.mode === "brake" && f1 <= f2) {
      issues.push("brake mode requires initialRevPerSec > finalRevPerSec");
    }
    const I =
      (spec.hubInertiaKgM2 as number) +
      (spec.rimMassCount as number) *
        (spec.rimMassKg as number) *
        (spec.rimRadiusM as number) ** 2;
    const alphaMag =
      (2 * Math.PI * Math.abs(f2 - f1)) / (spec.durationS as number);
    if (spec.mode === "brake" && I * alphaMag <= (spec.frictionTorqueNm as number)) {
      issues.push(
        "brake mode requires |I*alpha| > frictionTorqueNm so external braking torque is positive",
      );
    }
  }
  return { valid: issues.length === 0, issues };
}

function solveMomentInertiaSuvat(spec: Record<string, unknown>): DomainSolveOutput {
  const mode = spec.mode as "drive" | "brake";
  const hubI = spec.hubInertiaKgM2 as number;
  const nMass = spec.rimMassCount as number;
  const mRim = spec.rimMassKg as number;
  const rRim = spec.rimRadiusM as number;
  const f1 = spec.initialRevPerSec as number;
  const f2 = spec.finalRevPerSec as number;
  const t = spec.durationS as number;
  const tf = spec.frictionTorqueNm as number;
  const rF = spec.forceRadiusM as number;

  const momentOfInertiaKgM2 = hubI + nMass * mRim * rRim * rRim;
  const omega1RadS = 2 * Math.PI * f1;
  const omega2RadS = 2 * Math.PI * f2;
  const angularAccelRadS2 = (omega2RadS - omega1RadS) / t;
  const angularAccelMagRadS2 = Math.abs(angularAccelRadS2);
  const angularDisplacementRad = 0.5 * (omega1RadS + omega2RadS) * t;
  const revolutionsCount = angularDisplacementRad / (2 * Math.PI);
  const netTorqueNm = momentOfInertiaKgM2 * angularAccelRadS2;
  const netTorqueMagNm = Math.abs(netTorqueNm);
  const appliedTorqueNm =
    mode === "drive" ? netTorqueMagNm + tf : netTorqueMagNm - tf;
  const tangentialForceN = appliedTorqueNm / rF;
  const workByNetTorqueJ = netTorqueMagNm * angularDisplacementRad;
  const workByAppliedTorqueJ = appliedTorqueNm * angularDisplacementRad;
  const initialRotKeJ = 0.5 * momentOfInertiaKgM2 * omega1RadS * omega1RadS;
  const finalRotKeJ = 0.5 * momentOfInertiaKgM2 * omega2RadS * omega2RadS;
  const deltaRotKeJ = finalRotKeJ - initialRotKeJ;
  const peakPowerW = appliedTorqueNm * Math.max(omega1RadS, omega2RadS);
  const meanPowerW = appliedTorqueNm * 0.5 * (omega1RadS + omega2RadS);

  const quantities: VerifiedQuantityMap = {
    momentOfInertiaKgM2,
    omega1RadS,
    omega2RadS,
    angularAccelRadS2,
    angularAccelMagRadS2,
    angularDisplacementRad,
    revolutionsCount,
    netTorqueNm,
    netTorqueMagNm,
    appliedTorqueNm,
    tangentialForceN,
    workByNetTorqueJ,
    workByAppliedTorqueJ,
    initialRotKeJ,
    finalRotKeJ,
    deltaRotKeJ,
    peakPowerW,
    meanPowerW,
    inertiaDistributionRule:
      "concentrating mass at a larger radius from the rotation axis increases moment of inertia",
    torqueAngleAreaRule:
      "area under a torque against angular displacement graph equals work done",
    frictionTorqueRole:
      "bearing friction opposes rotation and acts alongside a braking torque or against a driving torque",
  };
  return {
    solverId: "alevel-opt-eng-moment-inertia-suvat-v1",
    quantities,
    publicNumbers: [hubI, nMass, mRim, rRim, f1, f2, t, tf, rF],
  };
}

function renderMomentInertiaSuvatSvg(
  spec: Record<string, unknown>,
  options?: DomainRenderOptions,
): DomainRenderOutput {
  const hidden = extractHiddenSet(spec, options);
  const mode = spec.mode as "drive" | "brake";
  const nMass = spec.rimMassCount as number;
  const mRim = spec.rimMassKg as number;
  const rRim = spec.rimRadiusM as number;
  const rF = spec.forceRadiusM as number;
  const cx = 225;
  const cy = 185;
  const R = 112;
  const midBlue = makeMarkerId("mi-b", options);
  const midRed = makeMarkerId("mi-r", options);
  const publicLabels: string[] = [];
  const publicNumbers: number[] = [];

  const spokes: string[] = [];
  const masses: string[] = [];
  const spokeCount = Math.max(4, nMass);
  for (let i = 0; i < spokeCount; i += 1) {
    const ang = (i * 2 * Math.PI) / spokeCount - Math.PI / 4;
    const x2 = cx + R * Math.cos(ang);
    const y2 = cy + R * Math.sin(ang);
    spokes.push(
      `<line x1="${fc(cx)}" y1="${fc(cy)}" x2="${fc(x2)}" y2="${fc(y2)}" stroke="#94a3b8" stroke-width="4"/>`,
    );
  }
  for (let i = 0; i < nMass; i += 1) {
    const ang = (i * 2 * Math.PI) / nMass - Math.PI / 4;
    const mx = cx + R * Math.cos(ang);
    const my = cy + R * Math.sin(ang);
    masses.push(
      `<circle cx="${fc(mx)}" cy="${fc(my)}" r="10" fill="${BLUE}" stroke="${INK}" stroke-width="1.8"/>`,
    );
  }

  const forceDir = mode === "drive" ? 1 : -1;
  const fx1 = cx;
  const fy1 = cy - R;
  const fx2 = cx + forceDir * 76;
  const forceLabel = mode === "drive" ? "Driving force F" : "Braking force F";
  publicLabels.push(forceLabel);

  const infoLines: string[] = [];
  if (!hidden.has("rimRadiusM")) {
    const lbl = `Rim radius r = ${fmtEngElecVal(rRim)} m`;
    publicLabels.push(lbl);
    publicNumbers.push(rRim);
    infoLines.push(lbl);
  }
  if (nMass > 0 && !hidden.has("rimMassKg")) {
    const lbl = `${nMass} rim masses, each m = ${fmtEngElecVal(mRim)} kg`;
    publicLabels.push(lbl);
    publicNumbers.push(nMass, mRim);
    infoLines.push(lbl);
  }
  if (!hidden.has("forceRadiusM")) {
    const lbl = `Force radius = ${fmtEngElecVal(rF)} m`;
    publicLabels.push(lbl);
    publicNumbers.push(rF);
    infoLines.push(lbl);
  }

  const body = [
    svgText(320, 28, "Spoked Flywheel Assembly", { size: 15, weight: "700" }),
    `<circle cx="${cx}" cy="${cy}" r="${R}" fill="#f8fafc" stroke="${INK}" stroke-width="5"/>`,
    ...spokes,
    `<circle cx="${cx}" cy="${cy}" r="26" fill="#cbd5e1" stroke="${INK}" stroke-width="2.2"/>`,
    `<circle cx="${cx}" cy="${cy}" r="5" fill="${INK}"/>`,
    ...masses,
    // Radius callout
    `<line x1="${cx}" y1="${cy}" x2="${fc(cx + R * 0.866)}" y2="${fc(cy + R * 0.5)}" stroke="${INK}" stroke-width="1.6" stroke-dasharray="4 3"/>`,
    svgText(cx + 52, cy + 44, "r", { size: 14, weight: "700", italic: true }),
    // Angular rotation curved arrow (clockwise)
    `<path d="M ${cx - 56} ${cy - 44} A 72 72 0 0 1 ${cx + 56} ${cy - 44}" fill="none" stroke="${BLUE}" stroke-width="2.4" marker-end="url(#${midBlue})"/>`,
    svgText(cx, cy - 64, "ω (clockwise)", { size: 13, fill: BLUE, weight: "600" }),
    // Tangential applied force vector
    `<line x1="${fx1}" y1="${fy1}" x2="${fx2}" y2="${fy1}" stroke="${RED}" stroke-width="3" marker-end="url(#${midRed})"/>`,
    svgText(fx1 + forceDir * 44, fy1 - 14, forceLabel, {
      size: 12,
      fill: RED,
      weight: "700",
    }),
    // Info panel
    `<rect x="385" y="96" width="230" height="168" rx="8" fill="#f8fafc" stroke="#cbd5e1" stroke-width="1.4"/>`,
    svgText(400, 122, "Rotor Geometry", { anchor: "start", size: 13, weight: "700" }),
    svgText(400, 146, "Axle perpendicular to plane", {
      anchor: "start",
      size: 12,
      fill: MUTED,
    }),
    ...infoLines.map((line, i) =>
      svgText(400, 174 + i * 26, line, { anchor: "start", size: 12, fill: INK }),
    ),
  ].join("");

  return {
    visualFamily: "mechanics",
    svgMarkup: wrapSvg({
      title: "Spoked flywheel rotor geometry and tangential force schematic",
      defs: arrowMarkerDef(midBlue, BLUE) + arrowMarkerDef(midRed, RED),
      body,
    }),
    rendererVersion: ALEVEL_OPT_EE_RENDERER_VERSION,
    publicNumbers,
    publicLabels,
  };
}

/* ========================================================================== */
/*  2. al-opt-eng-flywheel-kers (mechanics)                                   */
/* ========================================================================== */

const FLYWHEEL_KERS_FIELDS: readonly DomainKindFieldSpec[] = [
  { name: "kind", type: "string", enumValues: ["al-opt-eng-flywheel-kers"] },
  { name: "mode", type: "string", enumValues: ["kers", "engine-smoothing"] },
  { name: "flywheelInertiaKgM2", type: "number", unit: "kg m^2", bounds: "> 0" },
  { name: "omegaMaxRadS", type: "number", unit: "rad s^-1", bounds: "> omegaMinRadS" },
  { name: "omegaMinRadS", type: "number", unit: "rad s^-1", bounds: ">= 0" },
  { name: "vehicleMassKg", type: "number", unit: "kg", bounds: "> 0" },
  { name: "slopeHeightM", type: "number", unit: "m", bounds: "> 0" },
  { name: "dragForceN", type: "number", unit: "N", bounds: ">= 0" },
  { name: "travelDistanceM", type: "number", unit: "m", bounds: "> 0" },
  { name: "meanLoadTorqueNm", type: "number", unit: "N m", bounds: "> 0" },
  { name: "peakTorqueNm", type: "number", unit: "N m", bounds: "> meanLoadTorqueNm" },
];

function validateFlywheelKers(
  spec: Record<string, unknown>,
): DomainValidationResult {
  const issues: string[] = [];
  if (spec.kind !== "al-opt-eng-flywheel-kers") {
    issues.push('kind must be "al-opt-eng-flywheel-kers"');
  }
  if (spec.mode !== "kers" && spec.mode !== "engine-smoothing") {
    issues.push('mode must be "kers" or "engine-smoothing"');
  }
  if (!isPosNum(spec.flywheelInertiaKgM2)) {
    issues.push("flywheelInertiaKgM2 must be > 0");
  }
  if (!isPosNum(spec.omegaMaxRadS)) issues.push("omegaMaxRadS must be > 0");
  if (!isNonNegNum(spec.omegaMinRadS)) issues.push("omegaMinRadS must be >= 0");
  if (
    isFiniteNum(spec.omegaMaxRadS) &&
    isFiniteNum(spec.omegaMinRadS) &&
    spec.omegaMaxRadS <= spec.omegaMinRadS
  ) {
    issues.push("omegaMaxRadS must exceed omegaMinRadS");
  }
  if (!isPosNum(spec.vehicleMassKg)) issues.push("vehicleMassKg must be > 0");
  if (!isPosNum(spec.slopeHeightM)) issues.push("slopeHeightM must be > 0");
  if (!isNonNegNum(spec.dragForceN)) issues.push("dragForceN must be >= 0");
  if (!isPosNum(spec.travelDistanceM)) issues.push("travelDistanceM must be > 0");
  if (!isPosNum(spec.meanLoadTorqueNm)) issues.push("meanLoadTorqueNm must be > 0");
  if (
    !isPosNum(spec.peakTorqueNm) ||
    (isPosNum(spec.meanLoadTorqueNm) &&
      (spec.peakTorqueNm as number) <= (spec.meanLoadTorqueNm as number))
  ) {
    issues.push("peakTorqueNm must exceed meanLoadTorqueNm");
  }
  return { valid: issues.length === 0, issues };
}

function solveFlywheelKers(spec: Record<string, unknown>): DomainSolveOutput {
  const I = spec.flywheelInertiaKgM2 as number;
  const wMax = spec.omegaMaxRadS as number;
  const wMin = spec.omegaMinRadS as number;
  const m = spec.vehicleMassKg as number;
  const h = spec.slopeHeightM as number;
  const fd = spec.dragForceN as number;
  const s = spec.travelDistanceM as number;
  const tMean = spec.meanLoadTorqueNm as number;
  const tPeak = spec.peakTorqueNm as number;

  const energyReleasedJ = 0.5 * I * (wMax * wMax - wMin * wMin);
  const maxEnergyStoredJ = 0.5 * I * wMax * wMax;
  const meanOmegaRadS = 0.5 * (wMax + wMin);
  const fluctuationRatio = (wMax - wMin) / meanOmegaRadS;
  const gravitationalPeGainJ = m * ALEVEL_GRAVITY_MS2 * h;
  const dragWorkJ = fd * s;
  const totalHillClimbEnergyJ = gravitationalPeGainJ + dragWorkJ;
  const requiredMinInertiaKgM2 =
    (2 * totalHillClimbEnergyJ) / (wMax * wMax - wMin * wMin);
  const peakOmegaForHillRadS = Math.sqrt(
    wMin * wMin + (2 * totalHillClimbEnergyJ) / I,
  );
  const surplusEnergyJ = energyReleasedJ - totalHillClimbEnergyJ;
  const maxHeightFromFlywheelM = Math.max(
    0,
    (energyReleasedJ - dragWorkJ) / (m * ALEVEL_GRAVITY_MS2),
  );

  const quantities: VerifiedQuantityMap = {
    energyReleasedJ,
    maxEnergyStoredJ,
    meanOmegaRadS,
    fluctuationRatio,
    gravitationalPeGainJ,
    dragWorkJ,
    totalHillClimbEnergyJ,
    requiredMinInertiaKgM2,
    peakOmegaForHillRadS,
    surplusEnergyJ,
    maxHeightFromFlywheelM,
    rimDesignRule:
      "high tensile strength low density composite rim maximises energy stored before bursting",
    torqueSmoothingLorAnchor:
      "flywheel absorbs excess energy when engine torque exceeds mean load and releases energy during zero-torque strokes",
    kersDesignLorAnchor:
      "evacuated casing and magnetic bearings minimise windage and friction losses while high-strength rim permits greater angular speed",
  };
  return {
    solverId: "alevel-opt-eng-flywheel-kers-v1",
    quantities,
    publicNumbers: [I, wMax, wMin, m, h, fd, s, tMean, tPeak],
  };
}

function renderFlywheelKersSvg(
  spec: Record<string, unknown>,
  options?: DomainRenderOptions,
): DomainRenderOutput {
  const hidden = extractHiddenSet(spec, options);
  const tMean = spec.meanLoadTorqueNm as number;
  const tPeak = spec.peakTorqueNm as number;
  const publicNumbers: number[] = [];
  const publicLabels: string[] = [];

  const x0 = 76;
  const x1 = 595;
  const yTop = 58;
  const yBot = 296;
  const yZero = yBot - 36;
  const yMaxVal = tPeak * 1.15;
  const mapX = (theta: number) => x0 + (theta / (4 * Math.PI)) * (x1 - x0);
  const mapY = (T: number) => yZero - (T / yMaxVal) * (yZero - yTop);

  // Smooth 4-stroke turning-moment profile: compression dip, big power peak, low exhaust/induction
  const torqueAt = (theta: number): number => {
    const u = theta / Math.PI; // 0..4
    if (u < 1) {
      // Induction stroke: small negative/near-zero ripple
      return -0.06 * tPeak * Math.sin(Math.PI * u);
    }
    if (u < 2) {
      // Compression stroke: negative opposing torque
      return -0.22 * tPeak * Math.sin(Math.PI * (u - 1));
    }
    if (u < 3) {
      // Power stroke: tall positive pulse reaching tPeak
      return tPeak * Math.pow(Math.sin(Math.PI * (u - 2)), 1.35);
    }
    // Exhaust stroke: slight negative ripple
    return -0.08 * tPeak * Math.sin(Math.PI * (u - 3));
  };

  const samples = 160;
  const curvePts: string[] = [];
  const storePoly: string[] = [];
  let inStore = false;
  for (let i = 0; i <= samples; i += 1) {
    const th = (i / samples) * 4 * Math.PI;
    const T = torqueAt(th);
    const px = mapX(th);
    const py = mapY(T);
    curvePts.push(`${i === 0 ? "M" : "L"} ${fc(px)} ${fc(py)}`);
    if (T >= tMean) {
      if (!inStore) {
        inStore = true;
        storePoly.push(`${fc(px)},${fc(mapY(tMean))}`);
      }
      storePoly.push(`${fc(px)},${fc(py)}`);
    } else if (inStore) {
      inStore = false;
      storePoly.push(`${fc(px)},${fc(mapY(tMean))}`);
    }
  }

  const yMean = mapY(tMean);
  const gridLines: string[] = [];
  const xTicks = [
    { th: 0, label: "0" },
    { th: Math.PI, label: "π" },
    { th: 2 * Math.PI, label: "2π" },
    { th: 3 * Math.PI, label: "3π" },
    { th: 4 * Math.PI, label: "4π" },
  ];
  for (const tk of xTicks) {
    const px = mapX(tk.th);
    gridLines.push(
      `<line x1="${fc(px)}" y1="${yTop}" x2="${fc(px)}" y2="${yBot}" stroke="${GRID}" stroke-width="1"/>`,
    );
    gridLines.push(svgText(px, yBot + 18, tk.label, { size: 12, fill: MUTED }));
  }

  const meanLbl = hidden.has("meanLoadTorqueNm")
    ? "Mean load"
    : `Mean load = ${fmtEngElecVal(tMean)} N m`;
  if (!hidden.has("meanLoadTorqueNm")) {
    publicNumbers.push(tMean);
  }
  publicLabels.push(meanLbl);

  const body = [
    svgText(320, 26, "Turning-Moment Diagram over One Four-Stroke Cycle", {
      size: 14,
      weight: "700",
    }),
    ...gridLines,
    // Shaded energy storage region above mean load
    storePoly.length >= 3
      ? `<polygon points="${storePoly.join(" ")}" fill="#bbf7d0" fill-opacity="0.72" stroke="none"/>`
      : "",
    // Zero-torque axis & vertical axis
    `<line x1="${x0}" y1="${yTop}" x2="${x0}" y2="${yBot}" stroke="${INK}" stroke-width="2"/>`,
    `<line x1="${x0}" y1="${fc(yZero)}" x2="${x1}" y2="${fc(yZero)}" stroke="${INK}" stroke-width="1.8"/>`,
    // Mean load horizontal dashed line
    `<line x1="${x0}" y1="${fc(yMean)}" x2="${x1}" y2="${fc(yMean)}" stroke="${AMBER}" stroke-width="2" stroke-dasharray="7 5"/>`,
    // Curve
    `<path d="${curvePts.join(" ")}" fill="none" stroke="${BLUE}" stroke-width="2.6"/>`,
    // Annotations
    svgText(x0 + 8, yMean - 8, meanLbl, {
      anchor: "start",
      size: 12,
      fill: AMBER,
      weight: "700",
    }),
    svgText(mapX(2.5 * Math.PI), mapY(tPeak * 0.56), "Energy stored", {
      size: 11,
      fill: GREEN,
      weight: "700",
    }),
    svgText(mapX(1.5 * Math.PI), yZero - 14, "Release", {
      size: 11,
      fill: RED,
      weight: "600",
    }),
    svgText(340, 342, "Crankshaft angle θ / rad", { size: 13, weight: "600" }),
    svgText(24, 178, "Torque T / N m", { size: 13, weight: "600", rotate: -90 }),
  ].join("");

  return {
    visualFamily: "mechanics",
    svgMarkup: wrapSvg({
      title: "Four-stroke turning-moment versus crankshaft angle graph",
      body,
    }),
    rendererVersion: ALEVEL_OPT_EE_RENDERER_VERSION,
    publicNumbers,
    publicLabels,
  };
}

/* ========================================================================== */
/*  3. al-opt-eng-angular-momentum-impulse (mechanics)                        */
/* ========================================================================== */

const ANGULAR_MOMENTUM_IMPULSE_FIELDS: readonly DomainKindFieldSpec[] = [
  {
    name: "kind",
    type: "string",
    enumValues: ["al-opt-eng-angular-momentum-impulse"],
  },
  {
    name: "mode",
    type: "string",
    enumValues: ["coaxial-clutch", "retracting-arms", "angular-impulse"],
  },
  { name: "inertia1KgM2", type: "number", unit: "kg m^2", bounds: "> 0" },
  { name: "omega1RadS", type: "number", unit: "rad s^-1" },
  { name: "inertia2KgM2", type: "number", unit: "kg m^2", bounds: "> 0" },
  { name: "omega2RadS", type: "number", unit: "rad s^-1" },
  { name: "impulseDurationS", type: "number", unit: "s", bounds: "> 0" },
];

function validateAngularMomentumImpulse(
  spec: Record<string, unknown>,
): DomainValidationResult {
  const issues: string[] = [];
  if (spec.kind !== "al-opt-eng-angular-momentum-impulse") {
    issues.push('kind must be "al-opt-eng-angular-momentum-impulse"');
  }
  if (
    spec.mode !== "coaxial-clutch" &&
    spec.mode !== "retracting-arms" &&
    spec.mode !== "angular-impulse"
  ) {
    issues.push(
      'mode must be "coaxial-clutch", "retracting-arms", or "angular-impulse"',
    );
  }
  if (!isPosNum(spec.inertia1KgM2)) issues.push("inertia1KgM2 must be > 0");
  if (!isFiniteNum(spec.omega1RadS)) issues.push("omega1RadS must be finite");
  if (!isPosNum(spec.inertia2KgM2)) issues.push("inertia2KgM2 must be > 0");
  if (!isFiniteNum(spec.omega2RadS)) issues.push("omega2RadS must be finite");
  if (!isPosNum(spec.impulseDurationS)) {
    issues.push("impulseDurationS must be > 0");
  }
  if (
    issues.length === 0 &&
    spec.mode === "angular-impulse" &&
    Math.abs((spec.omega2RadS as number) - (spec.omega1RadS as number)) < 1e-6
  ) {
    issues.push("angular-impulse mode requires omega2RadS !== omega1RadS");
  }
  return { valid: issues.length === 0, issues };
}

function solveAngularMomentumImpulse(
  spec: Record<string, unknown>,
): DomainSolveOutput {
  const I1 = spec.inertia1KgM2 as number;
  const w1 = spec.omega1RadS as number;
  const I2 = spec.inertia2KgM2 as number;
  const w2 = spec.omega2RadS as number;
  const dt = spec.impulseDurationS as number;

  const initialAngularMomentumNms = I1 * w1 + I2 * w2;
  const combinedInertiaKgM2 = I1 + I2;
  const commonOmegaRadS = initialAngularMomentumNms / combinedInertiaKgM2;
  const initialTotalKeJ = 0.5 * I1 * w1 * w1 + 0.5 * I2 * w2 * w2;
  const finalTotalKeJ =
    0.5 * combinedInertiaKgM2 * commonOmegaRadS * commonOmegaRadS;
  const keDissipatedHeatJ = Math.max(0, initialTotalKeJ - finalTotalKeJ);
  const clutchImpulseNms = Math.abs(I2 * (commonOmegaRadS - w2));
  const meanClutchTorqueNm = clutchImpulseNms / dt;

  const finalOmegaSatelliteRadS = (I1 * w1) / I2;
  const initialSatelliteKeJ = 0.5 * I1 * w1 * w1;
  const finalSatelliteKeJ =
    0.5 * I2 * finalOmegaSatelliteRadS * finalOmegaSatelliteRadS;
  const internalWorkDoneJ = finalSatelliteKeJ - initialSatelliteKeJ;

  const deltaAngularMomentumNms = I1 * (w2 - w1);
  const angularImpulseMagNms = Math.abs(deltaAngularMomentumNms);
  const meanImpulseTorqueNm = deltaAngularMomentumNms / dt;
  const meanImpulseTorqueMagNm = Math.abs(meanImpulseTorqueNm);

  const quantities: VerifiedQuantityMap = {
    initialAngularMomentumNms,
    combinedInertiaKgM2,
    commonOmegaRadS,
    initialTotalKeJ,
    finalTotalKeJ,
    keDissipatedHeatJ,
    clutchImpulseNms,
    meanClutchTorqueNm,
    finalOmegaSatelliteRadS,
    initialSatelliteKeJ,
    finalSatelliteKeJ,
    internalWorkDoneJ,
    deltaAngularMomentumNms,
    angularImpulseMagNms,
    meanImpulseTorqueNm,
    meanImpulseTorqueMagNm,
    impulseUnitRule: "newton metre second",
    conservationConditionRule: "no resultant external torque acts on the system",
    keNonConservationRule:
      "kinetic energy decreases because thermal energy is dissipated by friction between slipping clutch plates",
    internalWorkRule:
      "internal radial forces do positive work pulling masses inward so rotational kinetic energy increases",
  };
  return {
    solverId: "alevel-opt-eng-angular-momentum-impulse-v1",
    quantities,
    publicNumbers: [I1, w1, I2, w2, dt],
  };
}

function renderAngularMomentumImpulseSvg(
  spec: Record<string, unknown>,
  options?: DomainRenderOptions,
): DomainRenderOutput {
  const hidden = extractHiddenSet(spec, options);
  const mode = spec.mode as
    | "coaxial-clutch"
    | "retracting-arms"
    | "angular-impulse";
  const I1 = spec.inertia1KgM2 as number;
  const w1 = spec.omega1RadS as number;
  const I2 = spec.inertia2KgM2 as number;
  const w2 = spec.omega2RadS as number;
  const dt = spec.impulseDurationS as number;
  const midB = makeMarkerId("am-b", options);
  const midR = makeMarkerId("am-r", options);
  const publicNumbers: number[] = [];
  const publicLabels: string[] = [];

  let body = "";
  let title = "Coaxial clutch discs";

  if (mode === "coaxial-clutch") {
    title = "Coaxial clutch discs engaging on a frictionless vertical shaft";
    const l1 = `I₁ = ${fmtEngElecVal(I1)} kg m², ω₁ = ${fmtEngElecVal(w1)} rad s⁻¹`;
    const l2 = `I₂ = ${fmtEngElecVal(I2)} kg m², ω₂ = ${fmtEngElecVal(w2)} rad s⁻¹`;
    if (!hidden.has("inertia1KgM2")) publicNumbers.push(I1);
    if (!hidden.has("omega1RadS")) publicNumbers.push(w1);
    if (!hidden.has("inertia2KgM2")) publicNumbers.push(I2);
    if (!hidden.has("omega2RadS")) publicNumbers.push(w2);
    publicLabels.push(l1, l2);

    body = [
      svgText(320, 28, "Coaxial Clutch Engagement (Zero External Torque)", {
        size: 14,
        weight: "700",
      }),
      // Shaft
      `<rect x="214" y="54" width="12" height="266" fill="#cbd5e1" stroke="${INK}" stroke-width="1.6"/>`,
      // Upper disc
      `<ellipse cx="220" cy="126" rx="108" ry="26" fill="#dbeafe" stroke="${BLUE}" stroke-width="2.4"/>`,
      `<ellipse cx="220" cy="120" rx="108" ry="26" fill="#eff6ff" stroke="${BLUE}" stroke-width="2.2"/>`,
      // Engagement arrows
      `<line x1="150" y1="158" x2="150" y2="196" stroke="${RED}" stroke-width="2.4" marker-end="url(#${midR})"/>`,
      `<line x1="290" y1="158" x2="290" y2="196" stroke="${RED}" stroke-width="2.4" marker-end="url(#${midR})"/>`,
      // Lower disc
      `<ellipse cx="220" cy="244" rx="124" ry="28" fill="#fef3c7" stroke="${AMBER}" stroke-width="2.4"/>`,
      `<ellipse cx="220" cy="238" rx="124" ry="28" fill="#fffbeb" stroke="${AMBER}" stroke-width="2.2"/>`,
      // Labels
      svgText(370, 118, "Upper disc (1)", {
        anchor: "start",
        size: 13,
        fill: BLUE,
        weight: "700",
      }),
      svgText(370, 140, l1, { anchor: "start", size: 12 }),
      svgText(370, 236, "Lower disc (2)", {
        anchor: "start",
        size: 13,
        fill: AMBER,
        weight: "700",
      }),
      svgText(370, 258, l2, { anchor: "start", size: 12 }),
      svgText(370, 184, "Engage coaxially", {
        anchor: "start",
        size: 12,
        fill: RED,
        weight: "600",
      }),
    ].join("");
  } else if (mode === "retracting-arms") {
    title = "Spinning spacecraft retracting radial mass pods";
    const l1 = `Initial: I₁ = ${fmtEngElecVal(I1)} kg m², ω₁ = ${fmtEngElecVal(w1)} rad s⁻¹`;
    const l2 = `Retracted: I₂ = ${fmtEngElecVal(I2)} kg m²`;
    publicNumbers.push(I1, w1, I2);
    publicLabels.push(l1, l2);

    body = [
      svgText(320, 28, "Spinning Satellite with Retractable Radial Pods", {
        size: 14,
        weight: "700",
      }),
      // Central spacecraft hub
      `<circle cx="240" cy="184" r="34" fill="#e2e8f0" stroke="${INK}" stroke-width="2.4"/>`,
      svgText(240, 189, "Hub", { size: 12, weight: "700" }),
      // Extended arms
      `<line x1="90" y1="184" x2="206" y2="184" stroke="${INK}" stroke-width="4"/>`,
      `<line x1="274" y1="184" x2="390" y2="184" stroke="${INK}" stroke-width="4"/>`,
      `<circle cx="90" cy="184" r="16" fill="${BLUE}" stroke="${INK}" stroke-width="2"/>`,
      `<circle cx="390" cy="184" r="16" fill="${BLUE}" stroke="${INK}" stroke-width="2"/>`,
      // Inward retraction arrows
      `<line x1="112" y1="154" x2="176" y2="154" stroke="${RED}" stroke-width="2.4" marker-end="url(#${midR})"/>`,
      `<line x1="368" y1="154" x2="304" y2="154" stroke="${RED}" stroke-width="2.4" marker-end="url(#${midR})"/>`,
      // Spin arrow
      `<path d="M 210 132 A 54 54 0 0 1 270 132" fill="none" stroke="${BLUE}" stroke-width="2.4" marker-end="url(#${midB})"/>`,
      svgText(240, 114, "ω₁", { size: 14, fill: BLUE, weight: "700" }),
      // Info box
      `<rect x="424" y="106" width="198" height="146" rx="8" fill="#f8fafc" stroke="#cbd5e1" stroke-width="1.4"/>`,
      svgText(438, 134, "Isolated System", {
        anchor: "start",
        size: 13,
        weight: "700",
      }),
      svgText(438, 162, `I₁ = ${fmtEngElecVal(I1)} kg m²`, {
        anchor: "start",
        size: 12,
      }),
      svgText(438, 186, `ω₁ = ${fmtEngElecVal(w1)} rad s⁻¹`, {
        anchor: "start",
        size: 12,
      }),
      svgText(438, 210, `I₂ = ${fmtEngElecVal(I2)} kg m²`, {
        anchor: "start",
        size: 12,
      }),
      svgText(438, 236, "No external torque", {
        anchor: "start",
        size: 11,
        fill: MUTED,
      }),
    ].join("");
  } else {
    title = "Torque versus time impulse profile";
    publicNumbers.push(dt);
    const dtLbl = `Δt = ${fmtEngElecVal(dt)} s`;
    publicLabels.push(dtLbl);
    body = [
      svgText(320, 28, "External Torque Pulse on Rotating Rotor", {
        size: 14,
        weight: "700",
      }),
      `<line x1="90" y1="64" x2="90" y2="296" stroke="${INK}" stroke-width="2"/>`,
      `<line x1="90" y1="296" x2="575" y2="296" stroke="${INK}" stroke-width="2"/>`,
      `<polygon points="150,296 150,126 450,126 450,296" fill="#dbeafe" stroke="${BLUE}" stroke-width="2.6"/>`,
      svgText(300, 214, "Shaded area = Angular impulse", {
        size: 13,
        fill: BLUE,
        weight: "700",
      }),
      `<line x1="150" y1="312" x2="450" y2="312" stroke="${RED}" stroke-width="2" marker-start="url(#${midR})" marker-end="url(#${midR})"/>`,
      svgText(300, 332, dtLbl, { size: 13, fill: RED, weight: "700" }),
      svgText(330, 352, "Time t / s", { size: 12, fill: MUTED }),
      svgText(38, 180, "Torque T / N m", { size: 13, weight: "600", rotate: -90 }),
      svgText(74, 130, "T", { size: 14, weight: "700", italic: true }),
    ].join("");
  }

  return {
    visualFamily: "mechanics",
    svgMarkup: wrapSvg({
      title,
      defs: arrowMarkerDef(midB, BLUE) + arrowMarkerDef(midR, RED),
      body,
    }),
    rendererVersion: ALEVEL_OPT_EE_RENDERER_VERSION,
    publicNumbers,
    publicLabels,
  };
}

/* ========================================================================== */
/*  4. al-opt-eng-first-law-adiabatic (thermal)                               */
/* ========================================================================== */

const FIRST_LAW_ADIABATIC_FIELDS: readonly DomainKindFieldSpec[] = [
  { name: "kind", type: "string", enumValues: ["al-opt-eng-first-law-adiabatic"] },
  {
    name: "processType",
    type: "string",
    enumValues: ["adiabatic", "isothermal", "isobaric", "isochoric"],
  },
  { name: "p1Pa", type: "number", unit: "Pa", bounds: "> 0" },
  { name: "v1M3", type: "number", unit: "m^3", bounds: "> 0" },
  { name: "v2M3", type: "number", unit: "m^3", bounds: "> 0" },
  { name: "gamma", type: "number", bounds: "1.1..1.8" },
  { name: "moles", type: "number", unit: "mol", bounds: "> 0" },
];

function validateFirstLawAdiabatic(
  spec: Record<string, unknown>,
): DomainValidationResult {
  const issues: string[] = [];
  if (spec.kind !== "al-opt-eng-first-law-adiabatic") {
    issues.push('kind must be "al-opt-eng-first-law-adiabatic"');
  }
  if (
    spec.processType !== "adiabatic" &&
    spec.processType !== "isothermal" &&
    spec.processType !== "isobaric" &&
    spec.processType !== "isochoric"
  ) {
    issues.push(
      'processType must be "adiabatic", "isothermal", "isobaric", or "isochoric"',
    );
  }
  if (!isPosNum(spec.p1Pa)) issues.push("p1Pa must be > 0");
  if (!isPosNum(spec.v1M3)) issues.push("v1M3 must be > 0");
  if (!isPosNum(spec.v2M3)) issues.push("v2M3 must be > 0");
  if (!isFiniteNum(spec.gamma) || spec.gamma <= 1.05 || spec.gamma > 2.0) {
    issues.push("gamma must lie in (1.05, 2.0]");
  }
  if (!isPosNum(spec.moles)) issues.push("moles must be > 0");
  if (
    issues.length === 0 &&
    spec.processType !== "isochoric" &&
    Math.abs((spec.v2M3 as number) - (spec.v1M3 as number)) < 1e-9
  ) {
    issues.push("non-isochoric process requires v2M3 !== v1M3");
  }
  if (spec.p2Ratio !== undefined && !isPosNum(spec.p2Ratio)) {
    issues.push("optional p2Ratio must be > 0");
  }
  return { valid: issues.length === 0, issues };
}

function solveFirstLawAdiabatic(
  spec: Record<string, unknown>,
): DomainSolveOutput {
  const processType = spec.processType as
    | "adiabatic"
    | "isothermal"
    | "isobaric"
    | "isochoric";
  const p1 = spec.p1Pa as number;
  const v1 = spec.v1M3 as number;
  const v2 = spec.v2M3 as number;
  const gamma = spec.gamma as number;
  const moles = spec.moles as number;
  const p2Ratio = isPosNum(spec.p2Ratio) ? spec.p2Ratio : 1.6;

  const t1K = (p1 * v1) / (moles * ALEVEL_MOLAR_GAS_CONSTANT);
  let p2 = p1;
  let t2K = t1K;
  let workDoneByGasJ = 0;
  let deltaInternalEnergyJ = 0;
  let heatSuppliedJ = 0;

  if (processType === "adiabatic") {
    p2 = p1 * (v1 / v2) ** gamma;
    t2K = (p2 * v2) / (moles * ALEVEL_MOLAR_GAS_CONSTANT);
    workDoneByGasJ = (p1 * v1 - p2 * v2) / (gamma - 1);
    deltaInternalEnergyJ = -workDoneByGasJ;
    heatSuppliedJ = 0;
  } else if (processType === "isothermal") {
    p2 = (p1 * v1) / v2;
    t2K = t1K;
    workDoneByGasJ = p1 * v1 * Math.log(v2 / v1);
    deltaInternalEnergyJ = 0;
    heatSuppliedJ = workDoneByGasJ;
  } else if (processType === "isobaric") {
    p2 = p1;
    t2K = t1K * (v2 / v1);
    workDoneByGasJ = p1 * (v2 - v1);
    deltaInternalEnergyJ = workDoneByGasJ / (gamma - 1);
    heatSuppliedJ = deltaInternalEnergyJ + workDoneByGasJ;
  } else {
    p2 = p1 * p2Ratio;
    t2K = t1K * p2Ratio;
    workDoneByGasJ = 0;
    deltaInternalEnergyJ = ((p2 - p1) * v1) / (gamma - 1);
    heatSuppliedJ = deltaInternalEnergyJ;
  }

  const p2IsothermalPa = (p1 * v1) / v2;
  const p2AdiabaticPa = p1 * (v1 / v2) ** gamma;

  const quantities: VerifiedQuantityMap = {
    p2Pa: p2,
    p2Kpa: p2 / 1e3,
    t1K,
    t2K,
    workDoneByGasJ,
    workDoneMagnitudeJ: Math.abs(workDoneByGasJ),
    deltaInternalEnergyJ,
    heatSuppliedJ,
    p2IsothermalPa,
    p2AdiabaticPa,
    adiabaticSlopeRule:
      "adiabatic curve has a steeper gradient than an isothermal curve because temperature falls during adiabatic expansion",
    firstLawConventionRule:
      "heat supplied to the gas equals increase in internal energy plus work done by the gas",
    processSpeedRule:
      "rapid change allows negligible thermal energy transfer between gas and surroundings",
  };
  return {
    solverId: "alevel-opt-eng-first-law-adiabatic-v1",
    quantities,
    publicNumbers: [p1, p1 / 1e3, v1, v2, gamma, moles],
  };
}

function renderFirstLawAdiabaticSvg(
  spec: Record<string, unknown>,
  options?: DomainRenderOptions,
): DomainRenderOutput {
  const hidden = extractHiddenSet(spec, options);
  const p1 = spec.p1Pa as number;
  const v1 = spec.v1M3 as number;
  const v2 = spec.v2M3 as number;
  const gamma = spec.gamma as number;
  const publicNumbers: number[] = [];
  const publicLabels: string[] = [];

  const vLow = Math.min(v1, v2);
  const vHigh = Math.max(v1, v2);
  const vSpan = Math.max(vHigh - vLow, v1 * 0.6);
  const vMinPlot = Math.max(0, vLow - vSpan * 0.25);
  const vMaxPlot = vHigh + vSpan * 0.25;

  const pAtVLowAd = p1 * (v1 / vLow) ** gamma;
  const pAtVLowIso = (p1 * v1) / vLow;
  const pMaxPlot = Math.max(p1, pAtVLowAd, pAtVLowIso) * 1.18;

  const x0 = 84;
  const x1 = 588;
  const yTop = 56;
  const yBot = 294;
  const mapX = (v: number) =>
    x0 + ((v - vMinPlot) / (vMaxPlot - vMinPlot)) * (x1 - x0);
  const mapY = (p: number) => yBot - (p / pMaxPlot) * (yBot - yTop);

  const isoPath: string[] = [];
  const adPath: string[] = [];
  const N = 80;
  for (let i = 0; i <= N; i += 1) {
    const v = vLow + (i / N) * (vHigh - vLow);
    const pIso = (p1 * v1) / v;
    const pAd = p1 * (v1 / v) ** gamma;
    isoPath.push(`${i === 0 ? "M" : "L"} ${fc(mapX(v))} ${fc(mapY(pIso))}`);
    adPath.push(`${i === 0 ? "M" : "L"} ${fc(mapX(v))} ${fc(mapY(pAd))}`);
  }

  const hideCurveNames =
    hidden.has("adiabaticSlopeRule") || hidden.has("processSpeedRule");
  const lblIso = hideCurveNames ? "Curve X" : "Isothermal (pV = const)";
  const lblAd = hideCurveNames ? "Curve Y" : "Adiabatic (pVᵞ = const)";
  // Avoid rare superscript gamma glyph — use clean tspan!
  const xEnd = mapX(vHigh);
  const yEndIso = mapY((p1 * v1) / vHigh);
  const yEndAd = mapY(p1 * (v1 / vHigh) ** gamma);

  const p1Kpa = p1 / 1e3;
  const p1Lbl = `${fmtEngElecVal(p1Kpa)} kPa`;
  if (!hidden.has("p1Pa")) {
    publicNumbers.push(p1, p1Kpa);
    publicLabels.push(p1Lbl);
  }
  const v1Lbl = `V₁`;
  const v2Lbl = `V₂`;
  publicLabels.push(v1Lbl, v2Lbl, "State A");

  const body = [
    svgText(320, 26, "Pressure–Volume Comparison from Common State A", {
      size: 14,
      weight: "700",
    }),
    // Grid
    `<line x1="${x0}" y1="${yTop}" x2="${x0}" y2="${yBot}" stroke="${INK}" stroke-width="2"/>`,
    `<line x1="${x0}" y1="${yBot}" x2="${x1}" y2="${yBot}" stroke="${INK}" stroke-width="2"/>`,
    // Dashed projections for State A
    `<line x1="${x0}" y1="${fc(mapY(p1))}" x2="${fc(mapX(v1))}" y2="${fc(mapY(p1))}" stroke="#94a3b8" stroke-width="1.2" stroke-dasharray="4 4"/>`,
    `<line x1="${fc(mapX(v1))}" y1="${fc(mapY(p1))}" x2="${fc(mapX(v1))}" y2="${yBot}" stroke="#94a3b8" stroke-width="1.2" stroke-dasharray="4 4"/>`,
    `<line x1="${fc(mapX(v2))}" y1="${yTop + 20}" x2="${fc(mapX(v2))}" y2="${yBot}" stroke="#cbd5e1" stroke-width="1.2" stroke-dasharray="4 4"/>`,
    // Curves
    `<path d="${isoPath.join(" ")}" fill="none" stroke="${BLUE}" stroke-width="2.5" stroke-dasharray="8 5"/>`,
    `<path d="${adPath.join(" ")}" fill="none" stroke="${RED}" stroke-width="2.8"/>`,
    // State A dot
    drawNodeDot(mapX(v1), mapY(p1), 5, INK),
    svgText(mapX(v1) + 12, mapY(p1) - 10, "State A", {
      anchor: "start",
      size: 12,
      weight: "700",
    }),
    // Curve labels (clean tspan, zero _ or ^)
    hideCurveNames
      ? svgText(xEnd - 6, yEndIso - 12, lblIso, {
          anchor: "end",
          size: 12,
          fill: BLUE,
          weight: "700",
        })
      : svgText(xEnd - 6, yEndIso - 12, "Isothermal (T const)", {
          anchor: "end",
          size: 12,
          fill: BLUE,
          weight: "700",
        }),
    hideCurveNames
      ? svgText(xEnd - 6, yEndAd + 18, lblAd, {
          anchor: "end",
          size: 12,
          fill: RED,
          weight: "700",
        })
      : svgText(xEnd - 6, yEndAd + 18, "Adiabatic (Q = 0)", {
          anchor: "end",
          size: 12,
          fill: RED,
          weight: "700",
        }),
    // Axis labels
    svgText(x0 - 8, mapY(p1) + 4, p1Lbl, {
      anchor: "end",
      size: 11,
      fill: MUTED,
    }),
    svgText(mapX(v1), yBot + 18, v1Lbl, { size: 12, weight: "600" }),
    svgText(mapX(v2), yBot + 18, v2Lbl, { size: 12, weight: "600" }),
    svgText(336, 342, "Volume V / m³", { size: 13, weight: "600" }),
    svgText(24, 178, "Pressure p / kPa", { size: 13, weight: "600", rotate: -90 }),
  ].join("");

  return {
    visualFamily: "thermal",
    svgMarkup: wrapSvg({
      title: "Pressure against volume curves from common initial state",
      body,
    }),
    rendererVersion: ALEVEL_OPT_EE_RENDERER_VERSION,
    publicNumbers,
    publicLabels,
  };
}

/* ========================================================================== */
/*  5. al-opt-eng-otto-diesel-engines (thermal)                               */
/* ========================================================================== */

const OTTO_DIESEL_FIELDS: readonly DomainKindFieldSpec[] = [
  { name: "kind", type: "string", enumValues: ["al-opt-eng-otto-diesel-engines"] },
  { name: "mode", type: "string", enumValues: ["otto", "diesel", "real-vs-ideal"] },
  { name: "loopAreaJ", type: "number", unit: "J", bounds: "> 0" },
  { name: "engineSpeedRevS", type: "number", unit: "rev s^-1", bounds: "> 0" },
  { name: "cylinders", type: "integer", bounds: "1..12" },
  { name: "outputTorqueNm", type: "number", unit: "N m", bounds: "> 0" },
  { name: "calorificValueJPerKg", type: "number", unit: "J kg^-1", bounds: "> 0" },
  { name: "fuelFlowRateKgS", type: "number", unit: "kg s^-1", bounds: "> 0" },
  { name: "compressionRatio", type: "number", bounds: "4..25" },
];

function validateOttoDiesel(
  spec: Record<string, unknown>,
): DomainValidationResult {
  const issues: string[] = [];
  if (spec.kind !== "al-opt-eng-otto-diesel-engines") {
    issues.push('kind must be "al-opt-eng-otto-diesel-engines"');
  }
  if (
    spec.mode !== "otto" &&
    spec.mode !== "diesel" &&
    spec.mode !== "real-vs-ideal"
  ) {
    issues.push('mode must be "otto", "diesel", or "real-vs-ideal"');
  }
  if (!isPosNum(spec.loopAreaJ)) issues.push("loopAreaJ must be > 0");
  if (!isPosNum(spec.engineSpeedRevS)) issues.push("engineSpeedRevS must be > 0");
  if (!isIntInRange(spec.cylinders, 1, 12)) {
    issues.push("cylinders must be integer in 1..12");
  }
  if (!isPosNum(spec.outputTorqueNm)) issues.push("outputTorqueNm must be > 0");
  if (!isPosNum(spec.calorificValueJPerKg)) {
    issues.push("calorificValueJPerKg must be > 0");
  }
  if (!isPosNum(spec.fuelFlowRateKgS)) issues.push("fuelFlowRateKgS must be > 0");
  if (
    !isFiniteNum(spec.compressionRatio) ||
    spec.compressionRatio < 4 ||
    spec.compressionRatio > 25
  ) {
    issues.push("compressionRatio must be in [4, 25]");
  }

  if (issues.length === 0) {
    const pInd =
      (spec.loopAreaJ as number) *
      ((spec.engineSpeedRevS as number) / 2) *
      (spec.cylinders as number);
    const pBrake =
      (spec.outputTorqueNm as number) * 2 * Math.PI * (spec.engineSpeedRevS as number);
    const pIn =
      (spec.calorificValueJPerKg as number) * (spec.fuelFlowRateKgS as number);
    if (pBrake >= pInd) {
      issues.push("brakePowerW must be strictly less than indicatedPowerW");
    }
    if (pInd >= pIn) {
      issues.push("indicatedPowerW must be strictly less than inputPowerW");
    }
  }
  return { valid: issues.length === 0, issues };
}

function solveOttoDiesel(spec: Record<string, unknown>): DomainSolveOutput {
  const area = spec.loopAreaJ as number;
  const revS = spec.engineSpeedRevS as number;
  const cyl = spec.cylinders as number;
  const torque = spec.outputTorqueNm as number;
  const cv = spec.calorificValueJPerKg as number;
  const flow = spec.fuelFlowRateKgS as number;
  const compRatio = spec.compressionRatio as number;

  // Strict AQA 4-stroke rule: 1 power stroke per 2 crankshaft revolutions
  const cyclesPerSec = revS / 2;
  const omegaRadS = 2 * Math.PI * revS;
  const indicatedPowerW = area * cyclesPerSec * cyl;
  const indicatedPowerKw = indicatedPowerW / 1e3;
  const brakePowerW = torque * omegaRadS;
  const brakePowerKw = brakePowerW / 1e3;
  const frictionPowerW = indicatedPowerW - brakePowerW;
  const frictionPowerKw = frictionPowerW / 1e3;
  const inputPowerW = cv * flow;
  const inputPowerKw = inputPowerW / 1e3;
  const thermalEfficiency = indicatedPowerW / inputPowerW;
  const thermalEfficiencyPct = thermalEfficiency * 100;
  const mechanicalEfficiency = brakePowerW / indicatedPowerW;
  const mechanicalEfficiencyPct = mechanicalEfficiency * 100;
  const overallEfficiency = brakePowerW / inputPowerW;
  const overallEfficiencyPct = overallEfficiency * 100;

  const quantities: VerifiedQuantityMap = {
    cyclesPerSec,
    omegaRadS,
    indicatedPowerW,
    indicatedPowerKw,
    brakePowerW,
    brakePowerKw,
    frictionPowerW,
    frictionPowerKw,
    inputPowerW,
    inputPowerKw,
    thermalEfficiency,
    thermalEfficiencyPct,
    mechanicalEfficiency,
    mechanicalEfficiencyPct,
    overallEfficiency,
    overallEfficiencyPct,
    ottoVsDieselRule:
      "diesel engine compresses air alone to a higher compression ratio so injected fuel self-ignites at constant pressure",
    realVsIdealLoopRule:
      "real indicator loop has rounded corners and a lower pumping loop reducing net enclosed work area",
    fourStrokeCycleRule:
      "a four-stroke cylinder completes one power stroke every two crankshaft revolutions",
    testbedLorAnchor:
      "dynamometer torque and angular speed give brake power while indicator loop area times firing frequency gives indicated power",
  };
  return {
    solverId: "alevel-opt-eng-otto-diesel-engines-v1",
    quantities,
    publicNumbers: [area, revS, cyl, torque, cv, flow, compRatio],
  };
}

function renderOttoDieselSvg(
  spec: Record<string, unknown>,
  options?: DomainRenderOptions,
): DomainRenderOutput {
  const mode = spec.mode as "otto" | "diesel" | "real-vs-ideal";
  const midB = makeMarkerId("od-b", options);
  const publicNumbers: number[] = [];
  const publicLabels: string[] = [];

  const x0 = 82;
  const x1 = 588;
  const yTop = 58;
  const yBot = 294;

  // Background measurement grid
  const grid: string[] = [];
  for (let i = 1; i <= 8; i += 1) {
    const gx = x0 + (i / 8) * (x1 - x0);
    grid.push(
      `<line x1="${fc(gx)}" y1="${yTop}" x2="${fc(gx)}" y2="${yBot}" stroke="${GRID}" stroke-width="1"/>`,
    );
  }
  for (let j = 1; j <= 5; j += 1) {
    const gy = yTop + (j / 5) * (yBot - yTop);
    grid.push(
      `<line x1="${x0}" y1="${fc(gy)}" x2="${x1}" y2="${fc(gy)}" stroke="${GRID}" stroke-width="1"/>`,
    );
  }

  let loopSvg = "";
  let heading = "Ideal Four-Stroke Indicator Diagram";
  if (mode === "otto") {
    heading = "Ideal Four-Stroke Otto Cycle Indicator Diagram";
    loopSvg = [
      // 1->2 adiabatic compression, 2->3 const-V heating, 3->4 adiabatic expansion, 4->1 const-V cooling
      `<path d="M 520 264 Q 310 250 180 182 L 180 78 Q 310 188 520 218 Z" fill="#dbeafe" fill-opacity="0.55" stroke="${BLUE}" stroke-width="2.6"/>`,
      `<line x1="180" y1="150" x2="180" y2="112" stroke="${BLUE}" stroke-width="2.2" marker-end="url(#${midB})"/>`,
      svgText(530, 272, "1", { size: 13, weight: "700" }),
      svgText(164, 188, "2", { size: 13, weight: "700" }),
      svgText(164, 80, "3", { size: 13, weight: "700" }),
      svgText(532, 218, "4", { size: 13, weight: "700" }),
      svgText(350, 198, "Net work = loop area", {
        size: 12,
        fill: BLUE,
        weight: "700",
      }),
    ].join("");
  } else if (mode === "diesel") {
    heading = "Ideal Four-Stroke Diesel Cycle Indicator Diagram";
    loopSvg = [
      // 1->2 adiabatic compression, 2->3 const-p heating (horizontal), 3->4 adiabatic expansion, 4->1 const-V
      `<path d="M 520 264 Q 310 248 168 92 L 290 92 Q 395 190 520 220 Z" fill="#dcfce7" fill-opacity="0.55" stroke="${GREEN}" stroke-width="2.6"/>`,
      `<line x1="210" y1="92" x2="255" y2="92" stroke="${GREEN}" stroke-width="2.2" marker-end="url(#${midB})"/>`,
      svgText(530, 272, "1", { size: 13, weight: "700" }),
      svgText(152, 94, "2", { size: 13, weight: "700" }),
      svgText(298, 82, "3", { size: 13, weight: "700" }),
      svgText(532, 220, "4", { size: 13, weight: "700" }),
      svgText(352, 188, "Constant-p fuel burn (2 → 3)", {
        size: 12,
        fill: GREEN,
        weight: "700",
      }),
    ].join("");
  } else {
    heading = "Ideal vs Actual Engine Indicator Diagram";
    loopSvg = [
      // Dashed ideal loop
      `<path d="M 520 256 Q 310 244 180 176 L 180 76 Q 310 182 520 212 Z" fill="none" stroke="#94a3b8" stroke-width="2" stroke-dasharray="6 4"/>`,
      // Rounded actual loop
      `<path d="M 498 250 Q 310 242 204 182 C 186 168 188 104 226 102 C 292 102 380 184 498 220 C 512 225 512 246 498 250 Z" fill="#fee2e2" fill-opacity="0.55" stroke="${RED}" stroke-width="2.6"/>`,
      // Bottom pumping loop
      `<path d="M 192 260 Q 350 248 504 260 Q 350 282 192 260 Z" fill="#fef3c7" fill-opacity="0.7" stroke="${AMBER}" stroke-width="1.8"/>`,
      svgText(400, 96, "Dashed: Ideal cycle", {
        anchor: "start",
        size: 12,
        fill: MUTED,
        weight: "600",
      }),
      svgText(400, 118, "Solid: Actual cycle", {
        anchor: "start",
        size: 12,
        fill: RED,
        weight: "700",
      }),
      svgText(340, 286, "Pumping loop", {
        size: 11,
        fill: AMBER,
        weight: "700",
      }),
    ].join("");
  }

  const body = [
    svgText(320, 26, heading, { size: 14, weight: "700" }),
    ...grid,
    `<line x1="${x0}" y1="${yTop}" x2="${x0}" y2="${yBot}" stroke="${INK}" stroke-width="2"/>`,
    `<line x1="${x0}" y1="${yBot}" x2="${x1}" y2="${yBot}" stroke="${INK}" stroke-width="2"/>`,
    loopSvg,
    svgText(336, 336, "Cylinder volume V", { size: 13, weight: "600" }),
    svgText(26, 176, "Cylinder pressure p", {
      size: 13,
      weight: "600",
      rotate: -90,
    }),
  ].join("");

  return {
    visualFamily: "thermal",
    svgMarkup: wrapSvg({
      title: "Four-stroke internal combustion engine p-V indicator diagram",
      defs: arrowMarkerDef(midB, mode === "diesel" ? GREEN : BLUE),
      body,
    }),
    rendererVersion: ALEVEL_OPT_EE_RENDERER_VERSION,
    publicNumbers,
    publicLabels,
  };
}

/* ========================================================================== */
/*  6. al-opt-eng-carnot-cop-heatpump (thermal)                               */
/* ========================================================================== */

const CARNOT_COP_FIELDS: readonly DomainKindFieldSpec[] = [
  { name: "kind", type: "string", enumValues: ["al-opt-eng-carnot-cop-heatpump"] },
  {
    name: "mode",
    type: "string",
    enumValues: ["heat-engine", "heat-pump", "refrigerator"],
  },
  { name: "hotTempK", type: "number", unit: "K", bounds: "> coldTempK" },
  { name: "coldTempK", type: "number", unit: "K", bounds: "> 0" },
  { name: "workJ", type: "number", unit: "J", bounds: "> 0" },
  { name: "actualHeatTransferJ", type: "number", unit: "J", bounds: "> 0" },
];

function validateCarnotCop(
  spec: Record<string, unknown>,
): DomainValidationResult {
  const issues: string[] = [];
  if (spec.kind !== "al-opt-eng-carnot-cop-heatpump") {
    issues.push('kind must be "al-opt-eng-carnot-cop-heatpump"');
  }
  if (
    spec.mode !== "heat-engine" &&
    spec.mode !== "heat-pump" &&
    spec.mode !== "refrigerator"
  ) {
    issues.push('mode must be "heat-engine", "heat-pump", or "refrigerator"');
  }
  if (!isPosNum(spec.hotTempK)) issues.push("hotTempK must be > 0");
  if (!isPosNum(spec.coldTempK)) issues.push("coldTempK must be > 0");
  if (
    isPosNum(spec.hotTempK) &&
    isPosNum(spec.coldTempK) &&
    spec.hotTempK <= spec.coldTempK
  ) {
    issues.push("hotTempK must exceed coldTempK");
  }
  if (!isPosNum(spec.workJ)) issues.push("workJ must be > 0");
  if (!isPosNum(spec.actualHeatTransferJ)) {
    issues.push("actualHeatTransferJ must be > 0");
  }
  if (issues.length === 0) {
    const th = spec.hotTempK as number;
    const tc = spec.coldTempK as number;
    const w = spec.workJ as number;
    const q = spec.actualHeatTransferJ as number;
    if (spec.mode === "heat-engine") {
      if (w / q > (th - tc) / th + 1e-9 || w >= q) {
        issues.push(
          "heat-engine actual efficiency W/Q_H must not exceed Carnot limit (T_H - T_C)/T_H",
        );
      }
    } else if (spec.mode === "heat-pump") {
      if (q <= w || q / w > th / (th - tc) + 1e-9) {
        issues.push(
          "heat-pump actual COP Q_H/W must satisfy 1 < COP <= T_H/(T_H - T_C)",
        );
      }
    } else if (q / w > tc / (th - tc) + 1e-9) {
      issues.push(
        "refrigerator actual COP Q_C/W must not exceed T_C/(T_H - T_C)",
      );
    }
  }
  return { valid: issues.length === 0, issues };
}

function solveCarnotCop(spec: Record<string, unknown>): DomainSolveOutput {
  const mode = spec.mode as "heat-engine" | "heat-pump" | "refrigerator";
  const th = spec.hotTempK as number;
  const tc = spec.coldTempK as number;
  const w = spec.workJ as number;
  const qAct = spec.actualHeatTransferJ as number;

  const carnotMaxEfficiency = (th - tc) / th;
  const carnotMaxEfficiencyPct = carnotMaxEfficiency * 100;
  const maxCopHeatPump = th / (th - tc);
  const maxCopRefrigerator = tc / (th - tc);

  let qHotJ = 0;
  let qColdJ = 0;
  let actualEfficiency = 0;
  let actualEfficiencyPct = 0;
  let actualCop = 0;
  let maxWorkCarnotJ = 0;
  let maxHeatDeliveredJ = 0;
  let maxHeatExtractedJ = 0;

  if (mode === "heat-engine") {
    qHotJ = qAct;
    qColdJ = qHotJ - w;
    actualEfficiency = w / qHotJ;
    actualEfficiencyPct = actualEfficiency * 100;
    maxWorkCarnotJ = carnotMaxEfficiency * qHotJ;
    actualCop = maxCopHeatPump;
    maxHeatDeliveredJ = maxCopHeatPump * w;
    maxHeatExtractedJ = maxCopRefrigerator * w;
  } else if (mode === "heat-pump") {
    qHotJ = qAct;
    qColdJ = qHotJ - w;
    actualCop = qHotJ / w;
    maxHeatDeliveredJ = maxCopHeatPump * w;
    maxHeatExtractedJ = maxCopRefrigerator * w;
    actualEfficiency = carnotMaxEfficiency;
    actualEfficiencyPct = carnotMaxEfficiencyPct;
    maxWorkCarnotJ = carnotMaxEfficiency * qHotJ;
  } else {
    qColdJ = qAct;
    qHotJ = qColdJ + w;
    actualCop = qColdJ / w;
    maxHeatExtractedJ = maxCopRefrigerator * w;
    maxHeatDeliveredJ = maxCopHeatPump * w;
    actualEfficiency = carnotMaxEfficiency;
    actualEfficiencyPct = carnotMaxEfficiencyPct;
    maxWorkCarnotJ = carnotMaxEfficiency * qHotJ;
  }

  const quantities: VerifiedQuantityMap = {
    hotTempC: th - 273,
    coldTempC: tc - 273,
    carnotMaxEfficiency,
    carnotMaxEfficiencyPct,
    maxCopHeatPump,
    maxCopRefrigerator,
    qHotJ,
    qColdJ,
    actualEfficiency,
    actualEfficiencyPct,
    actualCop,
    maxWorkCarnotJ,
    maxHeatDeliveredJ,
    maxHeatExtractedJ,
    secondLawLimitRule:
      "cold reservoir cannot reach absolute zero so some thermal energy must always be rejected",
    copGreaterThanOneRule:
      "heat pump transfers thermal energy from the cold outdoors in addition to the electrical work input",
    chpLorAnchor:
      "combined heat and power utilises rejected thermal energy for heating raising overall energy utilisation above a standalone power station",
    heatPumpLorAnchor:
      "heat pump delivers more thermal energy than electrical work supplied because work moves additional heat from the cold reservoir",
  };
  return {
    solverId: "alevel-opt-eng-carnot-cop-heatpump-v1",
    quantities,
    publicNumbers: [th, tc, th - 273, tc - 273, w, qAct],
  };
}

function renderCarnotCopSvg(
  spec: Record<string, unknown>,
  options?: DomainRenderOptions,
): DomainRenderOutput {
  const hidden = extractHiddenSet(spec, options);
  const mode = spec.mode as "heat-engine" | "heat-pump" | "refrigerator";
  const th = spec.hotTempK as number;
  const tc = spec.coldTempK as number;
  const midR = makeMarkerId("cc-r", options);
  const midB = makeMarkerId("cc-b", options);
  const midG = makeMarkerId("cc-g", options);
  const publicNumbers: number[] = [];
  const publicLabels: string[] = [];

  const isEngine = mode === "heat-engine";
  const coreLabel =
    mode === "heat-engine"
      ? "Heat Engine"
      : mode === "heat-pump"
        ? "Heat Pump"
        : "Refrigerator";
  const thText = hidden.has("hotTempK")
    ? "Hot Reservoir"
    : `Hot Reservoir (${fmtEngElecVal(th)} K)`;
  const tcText = hidden.has("coldTempK")
    ? "Cold Reservoir"
    : `Cold Reservoir (${fmtEngElecVal(tc)} K)`;
  if (!hidden.has("hotTempK")) publicNumbers.push(th);
  if (!hidden.has("coldTempK")) publicNumbers.push(tc);
  publicLabels.push(thText, tcText, coreLabel);

  const cx = 270;
  const body = [
    svgText(320, 26, `Thermodynamic Energy-Flow Diagram (${coreLabel})`, {
      size: 14,
      weight: "700",
    }),
    // Hot reservoir
    `<rect x="145" y="48" width="250" height="46" rx="8" fill="#fee2e2" stroke="${RED}" stroke-width="2.2"/>`,
    svgText(cx, 76, thText, { size: 13, fill: RED, weight: "700" }),
    // Cold reservoir
    `<rect x="145" y="286" width="250" height="46" rx="8" fill="#dbeafe" stroke="${BLUE}" stroke-width="2.2"/>`,
    svgText(cx, 314, tcText, { size: 13, fill: BLUE, weight: "700" }),
    // Central machine
    `<circle cx="${cx}" cy="190" r="46" fill="#f8fafc" stroke="${INK}" stroke-width="2.6"/>`,
    svgText(cx, 195, coreLabel, { size: 13, weight: "700" }),
    // Top flow arrow (Q_H)
    isEngine
      ? `<line x1="${cx}" y1="94" x2="${cx}" y2="140" stroke="${RED}" stroke-width="3.2" marker-end="url(#${midR})"/>`
      : `<line x1="${cx}" y1="144" x2="${cx}" y2="98" stroke="${RED}" stroke-width="3.2" marker-end="url(#${midR})"/>`,
    svgSubLabel(cx + 18, 122, "Q", "H", "", {
      anchor: "start",
      size: 14,
      fill: RED,
      weight: "700",
    }),
    // Bottom flow arrow (Q_C)
    isEngine
      ? `<line x1="${cx}" y1="236" x2="${cx}" y2="282" stroke="${BLUE}" stroke-width="3.2" marker-end="url(#${midB})"/>`
      : `<line x1="${cx}" y1="286" x2="${cx}" y2="240" stroke="${BLUE}" stroke-width="3.2" marker-end="url(#${midB})"/>`,
    svgSubLabel(cx + 18, 266, "Q", "C", "", {
      anchor: "start",
      size: 14,
      fill: BLUE,
      weight: "700",
    }),
    // Side work arrow (W)
    isEngine
      ? `<line x1="${cx + 46}" y1="190" x2="${cx + 150}" y2="190" stroke="${GREEN}" stroke-width="3.2" marker-end="url(#${midG})"/>`
      : `<line x1="${cx + 150}" y1="190" x2="${cx + 50}" y2="190" stroke="${GREEN}" stroke-width="3.2" marker-end="url(#${midG})"/>`,
    svgText(cx + 166, 194, isEngine ? "Work output W" : "Work input W", {
      anchor: "start",
      size: 13,
      fill: GREEN,
      weight: "700",
    }),
    // Conservation relation box
    `<rect x="444" y="248" width="176" height="58" rx="8" fill="#f8fafc" stroke="#cbd5e1" stroke-width="1.4"/>`,
    svgText(532, 272, "Energy Conservation", { size: 12, weight: "700" }),
    svgSubLabel(532, 294, "Q", "H", " = Q_C + W".replace("_C", "ᶜ").replace("ᶜ", "C"), {
      size: 12,
      fill: MUTED,
    }),
  ].join("");

  // Note: ensure zero _ in body! Fix line above cleanly:
  const cleanBody = body.replace(
    svgSubLabel(532, 294, "Q", "H", " = Q_C + W".replace("_C", "ᶜ").replace("ᶜ", "C"), {
      size: 12,
      fill: MUTED,
    }),
    `<text x="532" y="294" text-anchor="middle" font-size="12" fill="${MUTED}">Q<tspan dy="3" font-size="9">H</tspan><tspan dy="-3" font-size="12"> = Q</tspan><tspan dy="3" font-size="9">C</tspan><tspan dy="-3" font-size="12"> + W</tspan></text>`,
  );

  return {
    visualFamily: "thermal",
    svgMarkup: wrapSvg({
      title: "Thermodynamic reservoir energy flow schematic",
      defs:
        arrowMarkerDef(midR, RED) +
        arrowMarkerDef(midB, BLUE) +
        arrowMarkerDef(midG, GREEN),
      body: cleanBody,
    }),
    rendererVersion: ALEVEL_OPT_EE_RENDERER_VERSION,
    publicNumbers,
    publicLabels,
  };
}

/* ========================================================================== */
/*  7. al-opt-elec-discrete-semiconductors (circuits)                         */
/* ========================================================================== */

const DISCRETE_SEMI_FIELDS: readonly DomainKindFieldSpec[] = [
  {
    name: "kind",
    type: "string",
    enumValues: ["al-opt-elec-discrete-semiconductors"],
  },
  {
    name: "mode",
    type: "string",
    enumValues: ["zener-regulator", "mosfet-driver", "photodiode-sensor"],
  },
  { name: "supplyVoltageV", type: "number", unit: "V", bounds: "> 0" },
];

function validateDiscreteSemi(
  spec: Record<string, unknown>,
): DomainValidationResult {
  const issues: string[] = [];
  if (spec.kind !== "al-opt-elec-discrete-semiconductors") {
    issues.push('kind must be "al-opt-elec-discrete-semiconductors"');
  }
  if (
    spec.mode !== "zener-regulator" &&
    spec.mode !== "mosfet-driver" &&
    spec.mode !== "photodiode-sensor"
  ) {
    issues.push(
      'mode must be "zener-regulator", "mosfet-driver", or "photodiode-sensor"',
    );
  }
  if (!isPosNum(spec.supplyVoltageV)) issues.push("supplyVoltageV must be > 0");

  if (spec.mode === "zener-regulator") {
    if (!isPosNum(spec.zenerVoltageV)) issues.push("zenerVoltageV must be > 0");
    if (
      isPosNum(spec.zenerVoltageV) &&
      isPosNum(spec.supplyVoltageV) &&
      spec.zenerVoltageV >= spec.supplyVoltageV
    ) {
      issues.push("supplyVoltageV must exceed zenerVoltageV");
    }
    if (!isPosNum(spec.minZenerCurrentMa)) {
      issues.push("minZenerCurrentMa must be > 0");
    }
    if (!isNonNegNum(spec.loadCurrentMa)) {
      issues.push("loadCurrentMa must be >= 0");
    }
    if (spec.seriesResistorOhm !== undefined && !isPosNum(spec.seriesResistorOhm)) {
      issues.push("seriesResistorOhm must be > 0");
    }
  } else if (spec.mode === "mosfet-driver") {
    if (!isPosNum(spec.mosfetThresholdV)) {
      issues.push("mosfetThresholdV must be > 0");
    }
    if (!isNonNegNum(spec.gateVoltageV)) issues.push("gateVoltageV must be >= 0");
    if (!isPosNum(spec.loadResistanceOhm)) {
      issues.push("loadResistanceOhm must be > 0");
    }
  } else if (spec.mode === "photodiode-sensor") {
    if (!isPosNum(spec.photodiodeCurrentUa)) {
      issues.push("photodiodeCurrentUa must be > 0");
    }
    if (!isPosNum(spec.senseResistorKohm)) {
      issues.push("senseResistorKohm must be > 0");
    }
    if (
      isPosNum(spec.photodiodeCurrentUa) &&
      isPosNum(spec.senseResistorKohm) &&
      isPosNum(spec.supplyVoltageV)
    ) {
      const vr =
        (spec.photodiodeCurrentUa as number) *
        (spec.senseResistorKohm as number) *
        1e-3;
      if (vr >= (spec.supplyVoltageV as number)) {
        issues.push("sense resistor voltage drop must be less than supplyVoltageV");
      }
    }
  }
  return { valid: issues.length === 0, issues };
}

function solveDiscreteSemi(spec: Record<string, unknown>): DomainSolveOutput {
  const mode = spec.mode as
    | "zener-regulator"
    | "mosfet-driver"
    | "photodiode-sensor";
  const vs = spec.supplyVoltageV as number;
  const publicNumbers: number[] = [vs];

  const vz = isPosNum(spec.zenerVoltageV) ? spec.zenerVoltageV : 5.1;
  const izMin = isPosNum(spec.minZenerCurrentMa) ? spec.minZenerCurrentMa : 5;
  const iLoad = isNonNegNum(spec.loadCurrentMa) ? spec.loadCurrentMa : 20;
  const totalReqMa = izMin + iLoad;
  const requiredSeriesResistorOhm =
    vs > vz ? (vs - vz) / (totalReqMa * 1e-3) : 100;
  const rs = isPosNum(spec.seriesResistorOhm)
    ? spec.seriesResistorOhm
    : requiredSeriesResistorOhm;

  const actualSupplyCurrentMa = vs > vz ? ((vs - vz) / rs) * 1e3 : 0;
  const zenerCurrentLoadedMa = Math.max(0, actualSupplyCurrentMa - iLoad);
  const worstCaseZenerCurrentMa = actualSupplyCurrentMa;
  const worstCaseZenerPowerMw = vz * worstCaseZenerCurrentMa;
  const worstCaseZenerPowerW = worstCaseZenerPowerMw * 1e-3;
  const seriesResistorPowerW =
    Math.max(0, vs - vz) * actualSupplyCurrentMa * 1e-3;

  const vTh = isPosNum(spec.mosfetThresholdV) ? spec.mosfetThresholdV : 2.5;
  const vGate = isNonNegNum(spec.gateVoltageV) ? spec.gateVoltageV : 5.0;
  const rLoad = isPosNum(spec.loadResistanceOhm) ? spec.loadResistanceOhm : 24;
  const mosfetOn = vGate > vTh;
  const drainCurrentA = mosfetOn ? vs / rLoad : 0;
  const loadPowerW = mosfetOn ? (vs * vs) / rLoad : 0;

  const iPhotoUa = isPosNum(spec.photodiodeCurrentUa)
    ? spec.photodiodeCurrentUa
    : 45;
  const rSenseK = isPosNum(spec.senseResistorKohm) ? spec.senseResistorKohm : 100;
  const senseResistorVoltageV = iPhotoUa * rSenseK * 1e-3;
  const photodiodeVoltageV = Math.max(0, vs - senseResistorVoltageV);

  if (mode === "zener-regulator") {
    publicNumbers.push(vz, izMin, iLoad);
    if (isPosNum(spec.seriesResistorOhm)) publicNumbers.push(rs);
  } else if (mode === "mosfet-driver") {
    publicNumbers.push(vTh, vGate, rLoad);
  } else {
    publicNumbers.push(iPhotoUa, rSenseK);
  }

  const quantities: VerifiedQuantityMap = {
    totalSupplyCurrentReqMa: totalReqMa,
    requiredSeriesResistorOhm,
    actualSupplyCurrentMa,
    zenerCurrentLoadedMa,
    worstCaseZenerCurrentMa,
    worstCaseZenerPowerMw,
    worstCaseZenerPowerW,
    seriesResistorPowerW,
    mosfetConducting: mosfetOn,
    drainCurrentA,
    loadPowerW,
    senseResistorVoltageV,
    photodiodeVoltageV,
    mosfetGateRule:
      "insulated silicon dioxide gate gives virtually infinite input resistance drawing negligible gate current",
    zenerBreakdownRule:
      "reverse-biased zener diode maintains an almost constant potential difference across the load in breakdown",
    photodiodeBiasRule:
      "reverse-biased photodiode produces a photocurrent directly proportional to incident light intensity",
    flybackDiodeRule:
      "reverse-biased diode across an inductive load provides a safe path for induced current preventing a damaging voltage spike",
    threeStageLorAnchor:
      "zener diode sets a stable reference potential comparator compares sensor voltage and mosfet switches high load current without loading the op-amp",
  };
  return {
    solverId: "alevel-opt-elec-discrete-semiconductors-v1",
    quantities,
    publicNumbers,
  };
}

function renderDiscreteSemiSvg(
  spec: Record<string, unknown>,
  options?: DomainRenderOptions,
): DomainRenderOutput {
  const hidden = extractHiddenSet(spec, options);
  const mode = spec.mode as
    | "zener-regulator"
    | "mosfet-driver"
    | "photodiode-sensor";
  const vs = spec.supplyVoltageV as number;
  const midA = makeMarkerId("ds-a", options);
  const publicNumbers: number[] = [];
  const publicLabels: string[] = [];

  const vsLbl = `+${fmtEngElecVal(vs)} V`;
  if (!hidden.has("supplyVoltageV")) {
    publicNumbers.push(vs);
    publicLabels.push(vsLbl);
  }

  let body = "";
  let title = "Discrete semiconductor circuit schematic";

  if (mode === "zener-regulator") {
    title = "Zener diode shunt voltage regulator circuit";
    const vz = spec.zenerVoltageV as number;
    const vzLbl = `${fmtEngElecVal(vz)} V`;
    if (!hidden.has("zenerVoltageV")) {
      publicNumbers.push(vz);
      publicLabels.push(vzLbl);
    }
    const rsLbl =
      isPosNum(spec.seriesResistorOhm) && !hidden.has("seriesResistorOhm")
        ? ` = ${fmtEngElecVal(spec.seriesResistorOhm)} Ω`
        : "";
    if (isPosNum(spec.seriesResistorOhm) && !hidden.has("seriesResistorOhm")) {
      publicNumbers.push(spec.seriesResistorOhm);
    }
    body = [
      svgText(320, 26, "Zener Diode Voltage Regulator", { size: 14, weight: "700" }),
      // Top supply rail
      `<line x1="110" y1="110" x2="220" y2="110" stroke="${INK}" stroke-width="2.2"/>`,
      drawResistorH(246, 110, 26, 9),
      `<line x1="272" y1="110" x2="490" y2="110" stroke="${INK}" stroke-width="2.2"/>`,
      // Bottom 0V rail
      `<line x1="110" y1="270" x2="490" y2="270" stroke="${INK}" stroke-width="2.2"/>`,
      // Terminals
      drawTerminalCircle(110, 110),
      drawTerminalCircle(110, 270),
      drawTerminalCircle(490, 110),
      drawTerminalCircle(490, 270),
      // Zener branch (x = 340, reverse biased: cathode on top!)
      `<line x1="340" y1="110" x2="340" y2="174" stroke="${INK}" stroke-width="2.2"/>`,
      `<line x1="340" y1="206" x2="340" y2="270" stroke="${INK}" stroke-width="2.2"/>`,
      // Zener triangle pointing UP
      `<polygon points="326,206 354,206 340,174" fill="#dbeafe" stroke="${INK}" stroke-width="2"/>`,
      // Zener bent cathode bar
      `<polyline points="322,180 326,174 354,174 358,168" fill="none" stroke="${INK}" stroke-width="2.2"/>`,
      // Load resistor branch (x = 450)
      `<line x1="450" y1="110" x2="450" y2="166" stroke="${INK}" stroke-width="2.2"/>`,
      drawResistorV(450, 190, 10, 24),
      `<line x1="450" y1="214" x2="450" y2="270" stroke="${INK}" stroke-width="2.2"/>`,
      drawNodeDot(340, 110),
      drawNodeDot(340, 270),
      drawNodeDot(450, 110),
      drawNodeDot(450, 270),
      // Labels
      svgText(92, 115, vsLbl, { anchor: "end", size: 13, fill: RED, weight: "700" }),
      svgText(92, 275, "0 V", { anchor: "end", size: 13, fill: MUTED, weight: "600" }),
      svgSubLabel(246, 88, "R", "s", rsLbl, { size: 13, weight: "600" }),
      svgSubLabel(304, 195, "V", "Z", ` = ${vzLbl}`, {
        anchor: "end",
        size: 12,
        fill: BLUE,
        weight: "700",
      }),
      svgSubLabel(472, 195, "R", "L", "", { anchor: "start", size: 13, weight: "600" }),
      svgText(514, 194, "Regulated", { anchor: "start", size: 12, fill: GREEN, weight: "600" }),
      svgText(514, 212, "Output", { anchor: "start", size: 12, fill: GREEN, weight: "600" }),
    ].join("");
  } else if (mode === "mosfet-driver") {
    title = "N-channel enhancement MOSFET inductive load driver with protection diode";
    body = [
      svgText(320, 26, "N-Channel Enhancement MOSFET Load Driver", {
        size: 14,
        weight: "700",
      }),
      // +Vs rail & 0V rail
      `<line x1="120" y1="62" x2="480" y2="62" stroke="${RED}" stroke-width="2.2"/>`,
      svgText(110, 66, vsLbl, { anchor: "end", size: 13, fill: RED, weight: "700" }),
      `<line x1="120" y1="306" x2="480" y2="306" stroke="${INK}" stroke-width="2.2"/>`,
      svgText(110, 310, "0 V", { anchor: "end", size: 13, fill: MUTED, weight: "600" }),
      // Inductive motor/relay load at x = 330
      `<line x1="330" y1="62" x2="330" y2="96" stroke="${INK}" stroke-width="2.2"/>`,
      `<rect x="304" y="96" width="52" height="54" rx="4" fill="#eff6ff" stroke="${BLUE}" stroke-width="2.2"/>`,
      svgText(330, 127, "Load", { size: 12, fill: BLUE, weight: "700" }),
      `<line x1="330" y1="150" x2="330" y2="196" stroke="${INK}" stroke-width="2.2"/>`,
      // Flyback protection diode in parallel with load (x = 416, cathode to +Vs)
      `<line x1="330" y1="78" x2="416" y2="78" stroke="${INK}" stroke-width="1.8"/>`,
      `<line x1="330" y1="168" x2="416" y2="168" stroke="${INK}" stroke-width="1.8"/>`,
      `<line x1="416" y1="78" x2="416" y2="112" stroke="${INK}" stroke-width="1.8"/>`,
      `<line x1="416" y1="138" x2="416" y2="168" stroke="${INK}" stroke-width="1.8"/>`,
      `<polygon points="404,138 428,138 416,112" fill="#fee2e2" stroke="${RED}" stroke-width="1.8"/>`,
      `<line x1="404" y1="112" x2="428" y2="112" stroke="${RED}" stroke-width="2.2"/>`,
      drawNodeDot(330, 78),
      drawNodeDot(330, 168),
      svgText(442, 128, "Diode D", { anchor: "start", size: 12, fill: RED, weight: "600" }),
      // MOSFET symbol centered around x = 314, y = 232
      `<circle cx="316" cy="232" r="34" fill="#ffffff" stroke="${INK}" stroke-width="1.8"/>`,
      // Insulated gate bar
      `<line x1="296" y1="210" x2="296" y2="254" stroke="${INK}" stroke-width="2.4"/>`,
      // Broken channel (3 segments for enhancement MOSFET)
      `<line x1="304" y1="208" x2="304" y2="220" stroke="${INK}" stroke-width="2.4"/>`,
      `<line x1="304" y1="226" x2="304" y2="238" stroke="${INK}" stroke-width="2.4"/>`,
      `<line x1="304" y1="244" x2="304" y2="256" stroke="${INK}" stroke-width="2.4"/>`,
      // Drain lead
      `<polyline points="330,196 330,214 304,214" fill="none" stroke="${INK}" stroke-width="2"/>`,
      // Source & substrate lead
      `<polyline points="304,232 330,232 330,306" fill="none" stroke="${INK}" stroke-width="2"/>`,
      `<line x1="304" y1="250" x2="330" y2="250" stroke="${INK}" stroke-width="2"/>`,
      `<polygon points="306,232 316,227 316,237" fill="${INK}"/>`,
      // Gate input wire + pull-down resistor
      `<line x1="150" y1="232" x2="296" y2="232" stroke="${INK}" stroke-width="2.2"/>`,
      drawTerminalCircle(150, 232),
      `<line x1="224" y1="232" x2="224" y2="246" stroke="${INK}" stroke-width="1.8"/>`,
      drawResistorV(224, 270, 8, 22),
      `<line x1="224" y1="292" x2="224" y2="306" stroke="${INK}" stroke-width="1.8"/>`,
      drawNodeDot(224, 232),
      drawNodeDot(224, 306),
      drawNodeDot(330, 306),
      // Pin labels
      svgSubLabel(142, 236, "V", "GS", "", { anchor: "end", size: 13, fill: BLUE, weight: "700" }),
      svgText(274, 224, "G", { size: 12, weight: "700" }),
      svgText(344, 198, "D", { size: 12, weight: "700" }),
      svgText(344, 276, "S", { size: 12, weight: "700" }),
    ].join("");
  } else {
    title = "Reverse-biased photodiode light-intensity sensing divider";
    const rK = spec.senseResistorKohm as number;
    const rLbl = `${fmtEngElecVal(rK)} kΩ`;
    if (!hidden.has("senseResistorKohm")) {
      publicNumbers.push(rK);
      publicLabels.push(rLbl);
    }
    body = [
      svgText(320, 26, "Reverse-Biased Photodiode Sensing Circuit", {
        size: 14,
        weight: "700",
      }),
      `<line x1="210" y1="62" x2="430" y2="62" stroke="${RED}" stroke-width="2.2"/>`,
      svgText(196, 67, vsLbl, { anchor: "end", size: 13, fill: RED, weight: "700" }),
      // Photodiode at x = 310 (cathode at top -> reverse biased)
      `<line x1="310" y1="62" x2="310" y2="112" stroke="${INK}" stroke-width="2.2"/>`,
      `<circle cx="310" cy="132" r="24" fill="#ffffff" stroke="${INK}" stroke-width="1.8"/>`,
      `<polygon points="296,146 324,146 310,118" fill="#dbeafe" stroke="${INK}" stroke-width="2"/>`,
      `<line x1="296" y1="118" x2="324" y2="118" stroke="${INK}" stroke-width="2.2"/>`,
      // Incoming light arrows
      `<line x1="246" y1="108" x2="278" y2="124" stroke="${AMBER}" stroke-width="2" marker-end="url(#${midA})"/>`,
      `<line x1="246" y1="126" x2="278" y2="142" stroke="${AMBER}" stroke-width="2" marker-end="url(#${midA})"/>`,
      svgText(238, 122, "Light", { anchor: "end", size: 12, fill: AMBER, weight: "700" }),
      // Junction & Output tap
      `<line x1="310" y1="146" x2="310" y2="218" stroke="${INK}" stroke-width="2.2"/>`,
      `<line x1="310" y1="186" x2="450" y2="186" stroke="${BLUE}" stroke-width="2.2"/>`,
      drawNodeDot(310, 186),
      drawTerminalCircle(450, 186),
      svgSubLabel(464, 190, "V", "out", "", { anchor: "start", size: 14, fill: BLUE, weight: "700" }),
      // Sense resistor R
      drawResistorV(310, 242, 10, 24),
      svgText(334, 246, `R = ${rLbl}`, { anchor: "start", size: 13, weight: "600" }),
      `<line x1="310" y1="266" x2="310" y2="306" stroke="${INK}" stroke-width="2.2"/>`,
      `<line x1="210" y1="306" x2="430" y2="306" stroke="${INK}" stroke-width="2.2"/>`,
      svgText(196, 310, "0 V", { anchor: "end", size: 13, fill: MUTED, weight: "600" }),
      drawNodeDot(310, 306),
    ].join("");
  }

  return {
    visualFamily: "circuits",
    svgMarkup: wrapSvg({
      title,
      defs: arrowMarkerDef(midA, AMBER),
      body,
    }),
    rendererVersion: ALEVEL_OPT_EE_RENDERER_VERSION,
    publicNumbers,
    publicLabels,
  };
}

/* ========================================================================== */
/*  8. al-opt-elec-opamp-inverting-noninv (circuits)                          */
/* ========================================================================== */

const OPAMP_INV_NONINV_FIELDS: readonly DomainKindFieldSpec[] = [
  {
    name: "kind",
    type: "string",
    enumValues: ["al-opt-elec-opamp-inverting-noninv"],
  },
  { name: "mode", type: "string", enumValues: ["inverting", "non-inverting"] },
  { name: "rInKohm", type: "number", unit: "kOhm", bounds: "> 0" },
  { name: "rFeedbackKohm", type: "number", unit: "kOhm", bounds: "> 0" },
  { name: "vInMv", type: "number", unit: "mV" },
  { name: "vSatV", type: "number", unit: "V", bounds: "> 0" },
  { name: "gbpHz", type: "number", unit: "Hz", bounds: "> 0" },
];

function validateOpampInvNoninv(
  spec: Record<string, unknown>,
): DomainValidationResult {
  const issues: string[] = [];
  if (spec.kind !== "al-opt-elec-opamp-inverting-noninv") {
    issues.push('kind must be "al-opt-elec-opamp-inverting-noninv"');
  }
  if (spec.mode !== "inverting" && spec.mode !== "non-inverting") {
    issues.push('mode must be "inverting" or "non-inverting"');
  }
  if (!isPosNum(spec.rInKohm)) issues.push("rInKohm must be > 0");
  if (!isPosNum(spec.rFeedbackKohm)) issues.push("rFeedbackKohm must be > 0");
  if (!isFiniteNum(spec.vInMv)) issues.push("vInMv must be finite");
  if (!isPosNum(spec.vSatV)) issues.push("vSatV must be > 0");
  if (!isPosNum(spec.gbpHz)) issues.push("gbpHz must be > 0");
  return { valid: issues.length === 0, issues };
}

function solveOpampInvNoninv(spec: Record<string, unknown>): DomainSolveOutput {
  const mode = spec.mode as "inverting" | "non-inverting";
  const rIn = spec.rInKohm as number;
  const rF = spec.rFeedbackKohm as number;
  const vInMv = spec.vInMv as number;
  const vSat = spec.vSatV as number;
  const gbp = spec.gbpHz as number;

  const closedLoopGain =
    mode === "inverting" ? -(rF / rIn) : 1 + rF / rIn;
  const gainMagnitude = Math.abs(closedLoopGain);
  const idealVOutV = closedLoopGain * (vInMv * 1e-3);
  const isSaturated = Math.abs(idealVOutV) > vSat;
  const clampedVOutV = Math.max(-vSat, Math.min(vSat, idealVOutV));
  const maxUnsaturatedVInMv = (vSat / gainMagnitude) * 1e3;
  const bandwidthHz = gbp / gainMagnitude;
  const bandwidthKhz = bandwidthHz / 1e3;
  const virtualEarthValid = mode === "inverting" && !isSaturated;

  const quantities: VerifiedQuantityMap = {
    closedLoopGain,
    gainMagnitude,
    idealVOutV,
    clampedVOutV,
    isSaturated,
    maxUnsaturatedVInMv,
    bandwidthHz,
    bandwidthKhz,
    inputResistanceKohm: rIn,
    virtualEarthValid,
    virtualEarthRule:
      "inverting input remains very close to zero volts while the op-amp is unsaturated because open-loop gain is very large",
    idealOpAmpRule:
      "infinite open-loop voltage gain infinite input resistance and zero output resistance",
    gbpTradeoffRule:
      "increasing closed-loop voltage gain reduces available bandwidth because gain times bandwidth is constant",
    saturationRule:
      "output voltage clamps at the saturation rail and virtual earth no longer holds",
  };
  return {
    solverId: "alevel-opt-elec-opamp-inverting-noninv-v1",
    quantities,
    publicNumbers: [rIn, rF, vInMv, vInMv * 1e-3, vSat, gbp, gbp / 1e6],
  };
}

function renderOpampInvNoninvSvg(
  spec: Record<string, unknown>,
  options?: DomainRenderOptions,
): DomainRenderOutput {
  const hidden = extractHiddenSet(spec, options);
  const mode = spec.mode as "inverting" | "non-inverting";
  const rIn = spec.rInKohm as number;
  const rF = spec.rFeedbackKohm as number;
  const vSat = spec.vSatV as number;
  const publicNumbers: number[] = [];
  const publicLabels: string[] = [];

  const rInText = hidden.has("rInKohm") ? "" : ` = ${fmtEngElecVal(rIn)} kΩ`;
  const rFText = hidden.has("rFeedbackKohm") ? "" : ` = ${fmtEngElecVal(rF)} kΩ`;
  if (!hidden.has("rInKohm")) publicNumbers.push(rIn);
  if (!hidden.has("rFeedbackKohm")) publicNumbers.push(rF);
  const posRailLbl = `+${fmtEngElecVal(vSat)} V`;
  const negRailLbl = `−${fmtEngElecVal(vSat)} V`;
  if (!hidden.has("vSatV")) {
    publicNumbers.push(vSat, -vSat);
    publicLabels.push(posRailLbl, negRailLbl);
  }
  const railLbl = `±${fmtEngElecVal(vSat)} V`;
  publicLabels.push(railLbl);

  const opX = 330;
  const opY = 200;
  const triangle = [
    `<polygon points="${opX},${opY - 56} ${opX},${opY + 56} ${opX + 106},${opY}" fill="#f8fafc" stroke="${INK}" stroke-width="2.4"/>`,
    svgText(opX + 16, opY - 22, "−", { size: 18, weight: "700", fill: BLUE }),
    svgText(opX + 16, opY + 32, "+", { size: 17, weight: "700", fill: RED }),
    // Power rails
    `<line x1="${opX + 44}" y1="${opY - 33}" x2="${opX + 44}" y2="${opY - 62}" stroke="${RED}" stroke-width="1.6" stroke-dasharray="3 2"/>`,
    svgText(opX + 44, opY - 68, `+${fmtEngElecVal(vSat)} V`, { size: 11, fill: RED, weight: "600" }),
    `<line x1="${opX + 44}" y1="${opY + 33}" x2="${opX + 44}" y2="${opY + 66}" stroke="${BLUE}" stroke-width="1.6" stroke-dasharray="3 2"/>`,
    svgText(opX + 44, opY + 80, `−${fmtEngElecVal(vSat)} V`, { size: 11, fill: BLUE, weight: "600" }),
    // Output lead
    `<line x1="${opX + 106}" y1="${opY}" x2="544" y2="${opY}" stroke="${INK}" stroke-width="2.2"/>`,
    drawTerminalCircle(544, opY),
    svgSubLabel(558, opY + 4, "V", "out", "", { anchor: "start", size: 14, weight: "700" }),
    // Feedback loop (R_f from node X at (260, opY-26) over top to output (486, opY))
    `<polyline points="260,${opY - 26} 260,88 352,88" fill="none" stroke="${INK}" stroke-width="2.2"/>`,
    drawResistorH(378, 88, 26, 9),
    `<polyline points="404,88 486,88 486,${opY}" fill="none" stroke="${INK}" stroke-width="2.2"/>`,
    drawNodeDot(260, opY - 26),
    drawNodeDot(486, opY),
    svgSubLabel(378, 68, "R", "f", rFText, { size: 13, weight: "600" }),
  ].join("");

  let inputPart = "";
  if (mode === "inverting") {
    inputPart = [
      // R_in from V_in to node X -> inverting pin
      `<line x1="112" y1="${opY - 26}" x2="156" y2="${opY - 26}" stroke="${INK}" stroke-width="2.2"/>`,
      drawResistorH(182, opY - 26, 26, 9),
      `<line x1="208" y1="${opY - 26}" x2="${opX}" y2="${opY - 26}" stroke="${INK}" stroke-width="2.2"/>`,
      drawTerminalCircle(112, opY - 26),
      svgSubLabel(96, opY - 22, "V", "in", "", { anchor: "end", size: 14, fill: BLUE, weight: "700" }),
      svgSubLabel(182, opY - 46, "R", "in", rInText, { size: 13, weight: "600" }),
      svgText(276, opY - 36, "X", { size: 13, fill: RED, weight: "700" }),
      // Non-inverting pin grounded
      `<polyline points="${opX},${opY + 26} 260,${opY + 26} 260,${opY + 60}" fill="none" stroke="${INK}" stroke-width="2.2"/>`,
      drawGround(260, opY + 60),
    ].join("");
  } else {
    inputPart = [
      // R_1 from node X to ground
      `<line x1="260" y1="${opY - 26}" x2="${opX}" y2="${opY - 26}" stroke="${INK}" stroke-width="2.2"/>`,
      `<line x1="168" y1="${opY - 26}" x2="260" y2="${opY - 26}" stroke="${INK}" stroke-width="2.2"/>`,
      drawResistorH(198, opY - 26, 24, 9),
      `<line x1="168" y1="${opY - 26}" x2="168" y2="${opY + 60}" stroke="${INK}" stroke-width="2.2"/>`,
      drawGround(168, opY + 60),
      svgSubLabel(198, opY - 46, "R", "1", rInText, { size: 13, weight: "600" }),
      // V_in directly to non-inverting (+) pin
      `<line x1="112" y1="${opY + 26}" x2="${opX}" y2="${opY + 26}" stroke="${INK}" stroke-width="2.2"/>`,
      drawTerminalCircle(112, opY + 26),
      svgSubLabel(96, opY + 30, "V", "in", "", { anchor: "end", size: 14, fill: RED, weight: "700" }),
    ].join("");
  }

  const heading =
    mode === "inverting"
      ? "Inverting Operational Amplifier Circuit"
      : "Non-Inverting Operational Amplifier Circuit";

  return {
    visualFamily: "circuits",
    svgMarkup: wrapSvg({
      title: `${heading} schematic`,
      body: [
        svgText(320, 26, heading, { size: 14, weight: "700" }),
        triangle,
        inputPart,
      ].join(""),
    }),
    rendererVersion: ALEVEL_OPT_EE_RENDERER_VERSION,
    publicNumbers,
    publicLabels,
  };
}

/* ========================================================================== */
/*  9. al-opt-elec-opamp-summing-diff (circuits)                              */
/* ========================================================================== */

const OPAMP_SUM_DIFF_FIELDS: readonly DomainKindFieldSpec[] = [
  { name: "kind", type: "string", enumValues: ["al-opt-elec-opamp-summing-diff"] },
  {
    name: "mode",
    type: "string",
    enumValues: ["summing", "difference", "comparator"],
  },
  { name: "rFeedbackKohm", type: "number", unit: "kOhm", bounds: "> 0" },
  { name: "r1Kohm", type: "number", unit: "kOhm", bounds: "> 0" },
  { name: "r2Kohm", type: "number", unit: "kOhm", bounds: "> 0" },
  { name: "r3Kohm", type: "number", unit: "kOhm", bounds: ">= 0" },
  { name: "v1V", type: "number", unit: "V" },
  { name: "v2V", type: "number", unit: "V" },
  { name: "v3V", type: "number", unit: "V" },
  { name: "vSatV", type: "number", unit: "V", bounds: "> 0" },
];

function validateOpampSumDiff(
  spec: Record<string, unknown>,
): DomainValidationResult {
  const issues: string[] = [];
  if (spec.kind !== "al-opt-elec-opamp-summing-diff") {
    issues.push('kind must be "al-opt-elec-opamp-summing-diff"');
  }
  if (
    spec.mode !== "summing" &&
    spec.mode !== "difference" &&
    spec.mode !== "comparator"
  ) {
    issues.push('mode must be "summing", "difference", or "comparator"');
  }
  if (!isPosNum(spec.rFeedbackKohm)) issues.push("rFeedbackKohm must be > 0");
  if (!isPosNum(spec.r1Kohm)) issues.push("r1Kohm must be > 0");
  if (!isPosNum(spec.r2Kohm)) issues.push("r2Kohm must be > 0");
  if (!isNonNegNum(spec.r3Kohm)) issues.push("r3Kohm must be >= 0");
  if (!isFiniteNum(spec.v1V)) issues.push("v1V must be finite");
  if (!isFiniteNum(spec.v2V)) issues.push("v2V must be finite");
  if (!isFiniteNum(spec.v3V)) issues.push("v3V must be finite");
  if (!isPosNum(spec.vSatV)) issues.push("vSatV must be > 0");
  if (
    issues.length === 0 &&
    spec.mode === "comparator" &&
    Math.abs((spec.v2V as number) - (spec.v1V as number)) < 1e-6
  ) {
    issues.push("comparator mode requires v2V !== v1V");
  }
  return { valid: issues.length === 0, issues };
}

function solveOpampSumDiff(spec: Record<string, unknown>): DomainSolveOutput {
  const mode = spec.mode as "summing" | "difference" | "comparator";
  const rF = spec.rFeedbackKohm as number;
  const r1 = spec.r1Kohm as number;
  const r2 = spec.r2Kohm as number;
  const r3 = spec.r3Kohm as number;
  const v1 = spec.v1V as number;
  const v2 = spec.v2V as number;
  const v3 = spec.v3V as number;
  const vSat = spec.vSatV as number;

  let idealVOutV = 0;
  let totalFeedbackCurrentMa = 0;
  const diffGain = rF / r1;

  if (mode === "summing") {
    const i1 = v1 / r1;
    const i2 = v2 / r2;
    const i3 = r3 > 0 ? v3 / r3 : 0;
    totalFeedbackCurrentMa = i1 + i2 + i3;
    idealVOutV = -rF * totalFeedbackCurrentMa;
  } else if (mode === "difference") {
    // Balanced difference amplifier: V_out = (V_+ - V_-)*(R_f / R_1) where V_+ = v2, V_- = v1
    idealVOutV = diffGain * (v2 - v1);
    totalFeedbackCurrentMa = (v2 - v1) / r1;
  } else {
    idealVOutV = v2 > v1 ? vSat : -vSat;
  }

  const isSaturated =
    mode === "comparator" ? true : Math.abs(idealVOutV) > vSat;
  const clampedVOutV = Math.max(-vSat, Math.min(vSat, idealVOutV));
  const comparatorStateText =
    v2 > v1 ? "positive saturation rail" : "negative saturation rail";

  const quantities: VerifiedQuantityMap = {
    diffGain,
    totalFeedbackCurrentMa,
    idealVOutV,
    clampedVOutV,
    isSaturated,
    comparatorStateText,
    zeroCrosstalkRule:
      "virtual earth holds the summing junction at zero volts so each input branch current depends only on its own voltage and resistor",
    commonModeRejectionRule:
      "equal noise induced on both sensor leads cancels when subtracted by a balanced difference amplifier",
    matchedResistorRule:
      "resistor ratios on inverting and non-inverting paths must match so common-mode signals produce zero output",
  };
  return {
    solverId: "alevel-opt-elec-opamp-summing-diff-v1",
    quantities,
    publicNumbers: [rF, r1, r2, r3, v1, v2, v3, vSat],
  };
}

function renderOpampSumDiffSvg(
  spec: Record<string, unknown>,
  options?: DomainRenderOptions,
): DomainRenderOutput {
  const hidden = extractHiddenSet(spec, options);
  const mode = spec.mode as "summing" | "difference" | "comparator";
  const rF = spec.rFeedbackKohm as number;
  const r1 = spec.r1Kohm as number;
  const r2 = spec.r2Kohm as number;
  const r3 = spec.r3Kohm as number;
  const vSat = spec.vSatV as number;
  const publicNumbers: number[] = [];
  const publicLabels: string[] = [];

  const posRailLbl = `+${fmtEngElecVal(vSat)} V`;
  const negRailLbl = `−${fmtEngElecVal(vSat)} V`;
  if (!hidden.has("vSatV")) {
    publicNumbers.push(vSat, -vSat);
    publicLabels.push(posRailLbl, negRailLbl);
  }

  const opX = 344;
  const opY = 200;
  const opCore = [
    `<polygon points="${opX},${opY - 54} ${opX},${opY + 54} ${opX + 100},${opY}" fill="#f8fafc" stroke="${INK}" stroke-width="2.4"/>`,
    svgText(opX + 16, opY - 20, "−", { size: 18, weight: "700", fill: BLUE }),
    svgText(opX + 16, opY + 30, "+", { size: 17, weight: "700", fill: RED }),
    `<line x1="${opX + 100}" y1="${opY}" x2="548" y2="${opY}" stroke="${INK}" stroke-width="2.2"/>`,
    drawTerminalCircle(548, opY),
    svgSubLabel(560, opY + 4, "V", "out", "", { anchor: "start", size: 14, weight: "700" }),
    svgText(opX + 46, opY - 62, `+${fmtEngElecVal(vSat)} V`, { size: 11, fill: RED, weight: "600" }),
    svgText(opX + 46, opY + 74, `−${fmtEngElecVal(vSat)} V`, { size: 11, fill: BLUE, weight: "600" }),
  ].join("");

  let body = "";
  let title = "Operational amplifier multi-input schematic";

  if (mode === "summing") {
    title = "Op-amp summing amplifier schematic";
    const branches = r3 > 0 ? 3 : 2;
    const ys = branches === 3 ? [136, 174, 212] : [148, 200];
    const rs = [r1, r2, r3];
    const branchSvg: string[] = [];
    for (let i = 0; i < branches; i += 1) {
      const y = ys[i];
      branchSvg.push(
        `<line x1="104" y1="${y}" x2="152" y2="${y}" stroke="${INK}" stroke-width="2"/>`,
        drawResistorH(178, y, 24, 8),
        `<line x1="202" y1="${y}" x2="262" y2="${y}" stroke="${INK}" stroke-width="2"/>`,
        drawTerminalCircle(104, y),
        svgSubLabel(88, y + 4, "V", String(i + 1), "", { anchor: "end", size: 13, fill: BLUE, weight: "700" }),
        svgSubLabel(178, y - 13, "R", String(i + 1), ` = ${fmtEngElecVal(rs[i])} kΩ`, { size: 11, weight: "600" }),
      );
      publicNumbers.push(rs[i]);
    }
    publicNumbers.push(rF);
    body = [
      svgText(320, 26, `${branches}-Input Summing Amplifier`, { size: 14, weight: "700" }),
      opCore,
      ...branchSvg,
      // Vertical summing bus at x = 262
      `<line x1="262" y1="${ys[0]}" x2="262" y2="${ys[ys.length - 1]}" stroke="${INK}" stroke-width="2.2"/>`,
      `<line x1="262" y1="${opY - 26}" x2="${opX}" y2="${opY - 26}" stroke="${INK}" stroke-width="2.2"/>`,
      drawNodeDot(262, opY - 26),
      svgText(278, opY - 34, "X", { size: 13, fill: RED, weight: "700" }),
      // Feedback loop
      `<polyline points="262,${opY - 26} 262,82 362,82" fill="none" stroke="${INK}" stroke-width="2.2"/>`,
      drawResistorH(388, 82, 26, 9),
      `<polyline points="414,82 492,82 492,${opY}" fill="none" stroke="${INK}" stroke-width="2.2"/>`,
      drawNodeDot(492, opY),
      svgSubLabel(388, 63, "R", "f", ` = ${fmtEngElecVal(rF)} kΩ`, { size: 12, weight: "600" }),
      // Ground non-inverting input
      `<polyline points="${opX},${opY + 26} 290,${opY + 26} 290,${opY + 62}" fill="none" stroke="${INK}" stroke-width="2.2"/>`,
      drawGround(290, opY + 62),
    ].join("");
  } else if (mode === "difference") {
    title = "Balanced four-resistor op-amp difference amplifier schematic";
    publicNumbers.push(r1, rF);
    body = [
      svgText(320, 26, "Balanced Difference Amplifier", { size: 14, weight: "700" }),
      opCore,
      // Top input V1 -> R1 -> inverting (-)
      `<line x1="112" y1="${opY - 26}" x2="162" y2="${opY - 26}" stroke="${INK}" stroke-width="2.2"/>`,
      drawResistorH(188, opY - 26, 26, 9),
      `<line x1="214" y1="${opY - 26}" x2="${opX}" y2="${opY - 26}" stroke="${INK}" stroke-width="2.2"/>`,
      drawTerminalCircle(112, opY - 26),
      svgSubLabel(96, opY - 22, "V", "−", "", { anchor: "end", size: 14, fill: BLUE, weight: "700" }),
      svgSubLabel(188, opY - 45, "R", "1", ` = ${fmtEngElecVal(r1)} kΩ`, { size: 12, weight: "600" }),
      // Feedback Rf
      `<polyline points="268,${opY - 26} 268,84 362,84" fill="none" stroke="${INK}" stroke-width="2.2"/>`,
      drawResistorH(388, 84, 26, 9),
      `<polyline points="414,84 492,84 492,${opY}" fill="none" stroke="${INK}" stroke-width="2.2"/>`,
      drawNodeDot(268, opY - 26),
      drawNodeDot(492, opY),
      svgSubLabel(388, 65, "R", "f", ` = ${fmtEngElecVal(rF)} kΩ`, { size: 12, weight: "600" }),
      // Bottom input V2 -> R1 -> non-inverting (+) + Rf to ground
      `<line x1="112" y1="${opY + 26}" x2="162" y2="${opY + 26}" stroke="${INK}" stroke-width="2.2"/>`,
      drawResistorH(188, opY + 26, 26, 9),
      `<line x1="214" y1="${opY + 26}" x2="${opX}" y2="${opY + 26}" stroke="${INK}" stroke-width="2.2"/>`,
      drawTerminalCircle(112, opY + 26),
      svgSubLabel(96, opY + 30, "V", "+", "", { anchor: "end", size: 14, fill: RED, weight: "700" }),
      svgSubLabel(188, opY + 52, "R", "1", ` = ${fmtEngElecVal(r1)} kΩ`, { size: 12, weight: "600" }),
      `<line x1="268" y1="${opY + 26}" x2="268" y2="${opY + 50}" stroke="${INK}" stroke-width="2.2"/>`,
      drawResistorV(268, opY + 74, 9, 22),
      `<line x1="268" y1="${opY + 96}" x2="268" y2="${opY + 108}" stroke="${INK}" stroke-width="2.2"/>`,
      drawGround(268, opY + 108),
      drawNodeDot(268, opY + 26),
      svgSubLabel(292, opY + 78, "R", "f", ` = ${fmtEngElecVal(rF)} kΩ`, { anchor: "start", size: 12, weight: "600" }),
    ].join("");
  } else {
    title = "Open-loop operational amplifier voltage comparator schematic";
    body = [
      svgText(320, 26, "Op-Amp Voltage Comparator", { size: 14, weight: "700" }),
      opCore,
      `<line x1="130" y1="${opY - 26}" x2="${opX}" y2="${opY - 26}" stroke="${INK}" stroke-width="2.2"/>`,
      drawTerminalCircle(130, opY - 26),
      svgSubLabel(116, opY - 22, "V", "−", " (reference)", { anchor: "end", size: 13, fill: BLUE, weight: "700" }),
      `<line x1="130" y1="${opY + 26}" x2="${opX}" y2="${opY + 26}" stroke="${INK}" stroke-width="2.2"/>`,
      drawTerminalCircle(130, opY + 26),
      svgSubLabel(116, opY + 30, "V", "+", " (sensor)", { anchor: "end", size: 13, fill: RED, weight: "700" }),
      svgText(320, 326, "Open-loop operation: no negative feedback path", {
        size: 12,
        fill: MUTED,
      }),
    ].join("");
  }

  return {
    visualFamily: "circuits",
    svgMarkup: wrapSvg({ title, body }),
    rendererVersion: ALEVEL_OPT_EE_RENDERER_VERSION,
    publicNumbers,
    publicLabels,
  };
}

/* ========================================================================== */
/*  10. al-opt-elec-lc-resonance-filters (circuits)                           */
/* ========================================================================== */

const LC_RESONANCE_FIELDS: readonly DomainKindFieldSpec[] = [
  { name: "kind", type: "string", enumValues: ["al-opt-elec-lc-resonance-filters"] },
  { name: "mode", type: "string", enumValues: ["parallel-lc", "series-lc"] },
  { name: "inductanceUh", type: "number", unit: "uH", bounds: "> 0" },
  { name: "capacitancePf", type: "number", unit: "pF", bounds: "> 0" },
  { name: "qFactor", type: "number", bounds: "5..200" },
  { name: "vMaxV", type: "number", unit: "V", bounds: "> 0" },
];

function validateLcResonance(
  spec: Record<string, unknown>,
): DomainValidationResult {
  const issues: string[] = [];
  if (spec.kind !== "al-opt-elec-lc-resonance-filters") {
    issues.push('kind must be "al-opt-elec-lc-resonance-filters"');
  }
  if (spec.mode !== "parallel-lc" && spec.mode !== "series-lc") {
    issues.push('mode must be "parallel-lc" or "series-lc"');
  }
  if (!isPosNum(spec.inductanceUh)) issues.push("inductanceUh must be > 0");
  if (!isPosNum(spec.capacitancePf)) issues.push("capacitancePf must be > 0");
  if (!isFiniteNum(spec.qFactor) || spec.qFactor < 5 || spec.qFactor > 200) {
    issues.push("qFactor must lie in [5, 200]");
  }
  if (!isPosNum(spec.vMaxV)) issues.push("vMaxV must be > 0");
  return { valid: issues.length === 0, issues };
}

function solveLcResonance(spec: Record<string, unknown>): DomainSolveOutput {
  const lUh = spec.inductanceUh as number;
  const cPf = spec.capacitancePf as number;
  const q = spec.qFactor as number;
  const vMax = spec.vMaxV as number;

  const L = lUh * 1e-6;
  const C = cPf * 1e-12;
  const resonantFreqHz = 1 / (2 * Math.PI * Math.sqrt(L * C));
  const resonantFreqKhz = resonantFreqHz / 1e3;
  const bandwidthHz = resonantFreqHz / q;
  const bandwidthKhz = bandwidthHz / 1e3;
  // Strict AQA rule: 0.707 V_max (1/sqrt(2)) half-power level!
  const halfPowerVoltageV = vMax / Math.SQRT2;
  const lowerCutoffKhz = resonantFreqKhz - bandwidthKhz / 2;
  const upperCutoffKhz = resonantFreqKhz + bandwidthKhz / 2;
  const reactanceAtResonanceOhm = 2 * Math.PI * resonantFreqHz * L;

  const quantities: VerifiedQuantityMap = {
    resonantFreqHz,
    resonantFreqKhz,
    bandwidthHz,
    bandwidthKhz,
    halfPowerVoltageV,
    lowerCutoffKhz,
    upperCutoffKhz,
    reactanceAtResonanceOhm,
    qFactorComputed: q,
    halfPowerLevelRule:
      "bandwidth is measured between the frequencies where output voltage drops to 0.707 of maximum",
    parallelImpedanceRule:
      "parallel LC circuit has maximum impedance at resonant frequency",
    seriesImpedanceRule:
      "series LC circuit has minimum impedance at resonant frequency",
    highQTradeoffRule:
      "higher Q factor gives sharper selectivity rejecting adjacent stations but narrows bandwidth so outer sidebands may be attenuated",
  };
  return {
    solverId: "alevel-opt-elec-lc-resonance-filters-v1",
    quantities,
    publicNumbers: [lUh, cPf, q, vMax],
  };
}

function renderLcResonanceSvg(
  spec: Record<string, unknown>,
  options?: DomainRenderOptions,
): DomainRenderOutput {
  const hidden = extractHiddenSet(spec, options);
  const solved = solveLcResonance(spec).quantities;
  const f0 = solved.resonantFreqKhz as number;
  const fb = solved.bandwidthKhz as number;
  const vMax = spec.vMaxV as number;
  const q = spec.qFactor as number;
  const publicNumbers: number[] = [];
  const publicLabels: string[] = [];

  const x0 = 84;
  const x1 = 592;
  const yTop = 54;
  const yBot = 296;
  const spanKhz = Math.max(fb * 4.2, f0 * 0.12);
  const fMin = Math.max(0, f0 - spanKhz / 2);
  const fMax = f0 + spanKhz / 2;

  const mapX = (f: number) => x0 + ((f - fMin) / (fMax - fMin)) * (x1 - x0);
  const mapY = (v: number) => yBot - (v / (vMax * 1.12)) * (yBot - yTop);

  // Sharp high-Q resonance curve & broader low-Q comparison curve
  const lorentz = (f: number, qEff: number): number => {
    const x = qEff * (f / f0 - f0 / f);
    return vMax / Math.sqrt(1 + x * x);
  };
  const highPts: string[] = [];
  const lowPts: string[] = [];
  const N = 160;
  for (let i = 0; i <= N; i += 1) {
    const f = fMin + (i / N) * (fMax - fMin);
    highPts.push(`${i === 0 ? "M" : "L"} ${fc(mapX(f))} ${fc(mapY(lorentz(f, q)))}`);
    lowPts.push(
      `${i === 0 ? "M" : "L"} ${fc(mapX(f))} ${fc(mapY(lorentz(f, q * 0.45)))}`,
    );
  }

  const yVmax = mapY(vMax);
  const yHalf = mapY(vMax / Math.SQRT2);
  const xF0 = mapX(f0);
  const xF1 = mapX(f0 - fb / 2);
  const xF2 = mapX(f0 + fb / 2);

  const hideF0 = hidden.has("resonantFreqKhz") || hidden.has("resonantFreqHz");
  const hideHalfV = hidden.has("halfPowerVoltageV") || hidden.has("halfPowerLevelRule");
  const hideQ = hidden.has("qFactorComputed") || hidden.has("bandwidthKhz") || hidden.has("bandwidthHz");

  if (!hidden.has("vMaxV")) publicNumbers.push(vMax);
  if (!hideF0) publicNumbers.push(f0);

  const f0Label = hideF0 ? "f₀" : `f₀ = ${fmtEngElecVal(f0)} kHz`;
  const vMaxLabel = `${fmtEngElecVal(vMax)} V`;
  const halfLabel = hideHalfV ? "Half-power level" : "0.707 Vmax";
  publicLabels.push(f0Label, vMaxLabel, halfLabel);

  const body = [
    svgText(320, 26, "LC Tuned Circuit Resonance Response", {
      size: 14,
      weight: "700",
    }),
    // Grid lines
    `<line x1="${x0}" y1="${fc(yVmax)}" x2="${x1}" y2="${fc(yVmax)}" stroke="${GRID}" stroke-width="1"/>`,
    `<line x1="${x0}" y1="${fc(yHalf)}" x2="${x1}" y2="${fc(yHalf)}" stroke="${RED}" stroke-width="1.6" stroke-dasharray="6 4"/>`,
    `<line x1="${fc(xF0)}" y1="${yTop}" x2="${fc(xF0)}" y2="${yBot}" stroke="#94a3b8" stroke-width="1.2" stroke-dasharray="4 4"/>`,
    !hideQ
      ? `<line x1="${fc(xF1)}" y1="${fc(yHalf)}" x2="${fc(xF1)}" y2="${yBot}" stroke="${RED}" stroke-width="1.2" stroke-dasharray="3 3"/>` +
        `<line x1="${fc(xF2)}" y1="${fc(yHalf)}" x2="${fc(xF2)}" y2="${yBot}" stroke="${RED}" stroke-width="1.2" stroke-dasharray="3 3"/>`
      : "",
    // Axes
    `<line x1="${x0}" y1="${yTop}" x2="${x0}" y2="${yBot}" stroke="${INK}" stroke-width="2"/>`,
    `<line x1="${x0}" y1="${yBot}" x2="${x1}" y2="${yBot}" stroke="${INK}" stroke-width="2"/>`,
    // Curves
    `<path d="${lowPts.join(" ")}" fill="none" stroke="${MUTED}" stroke-width="2" stroke-dasharray="6 5"/>`,
    `<path d="${highPts.join(" ")}" fill="none" stroke="${BLUE}" stroke-width="2.8"/>`,
    // Labels
    svgText(x0 - 8, yVmax + 4, vMaxLabel, { anchor: "end", size: 11, fill: INK }),
    svgText(x1 - 8, yHalf - 6, halfLabel, { anchor: "end", size: 11, fill: RED, weight: "700" }),
    svgText(xF0, yBot + 18, f0Label, { size: 12, fill: BLUE, weight: "700" }),
    svgText(462, 82, "Solid: Higher Q", { anchor: "start", size: 12, fill: BLUE, weight: "700" }),
    svgText(462, 102, "Dashed: Lower Q", { anchor: "start", size: 12, fill: MUTED, weight: "600" }),
    svgText(336, 342, "Frequency f / kHz", { size: 13, weight: "600" }),
    svgText(24, 178, "Output voltage / V", { size: 13, weight: "600", rotate: -90 }),
  ].join("");

  return {
    visualFamily: "circuits",
    svgMarkup: wrapSvg({
      title: "LC circuit voltage amplitude versus frequency resonance curve",
      body,
    }),
    rendererVersion: ALEVEL_OPT_EE_RENDERER_VERSION,
    publicNumbers,
    publicLabels,
  };
}

/* ========================================================================== */
/*  11. al-opt-elec-timing-astable-555 (circuits)                             */
/* ========================================================================== */

const TIMING_555_FIELDS: readonly DomainKindFieldSpec[] = [
  { name: "kind", type: "string", enumValues: ["al-opt-elec-timing-astable-555"] },
  {
    name: "mode",
    type: "string",
    enumValues: ["555-astable", "555-monostable", "schmitt-astable"],
  },
  { name: "r1Kohm", type: "number", unit: "kOhm", bounds: "> 0" },
  { name: "r2Kohm", type: "number", unit: "kOhm", bounds: "> 0" },
  { name: "capacitanceUf", type: "number", unit: "uF", bounds: "> 0" },
  { name: "supplyVoltageV", type: "number", unit: "V", bounds: "> 0" },
];

function validateTiming555(
  spec: Record<string, unknown>,
): DomainValidationResult {
  const issues: string[] = [];
  if (spec.kind !== "al-opt-elec-timing-astable-555") {
    issues.push('kind must be "al-opt-elec-timing-astable-555"');
  }
  if (
    spec.mode !== "555-astable" &&
    spec.mode !== "555-monostable" &&
    spec.mode !== "schmitt-astable"
  ) {
    issues.push(
      'mode must be "555-astable", "555-monostable", or "schmitt-astable"',
    );
  }
  if (!isPosNum(spec.r1Kohm)) issues.push("r1Kohm must be > 0");
  if (!isPosNum(spec.r2Kohm)) issues.push("r2Kohm must be > 0");
  if (!isPosNum(spec.capacitanceUf)) issues.push("capacitanceUf must be > 0");
  if (!isPosNum(spec.supplyVoltageV)) issues.push("supplyVoltageV must be > 0");
  return { valid: issues.length === 0, issues };
}

function solveTiming555(spec: Record<string, unknown>): DomainSolveOutput {
  const r1 = spec.r1Kohm as number;
  const r2 = spec.r2Kohm as number;
  const cUf = spec.capacitanceUf as number;
  const vs = spec.supplyVoltageV as number;

  // Strict AQA 555 formulas: 0.7 in astable, 1.1 in monostable!
  const tHighMs = 0.7 * (r1 + r2) * cUf;
  const tLowMs = 0.7 * r2 * cUf;
  const periodMs = tHighMs + tLowMs;
  const tHighS = tHighMs * 1e-3;
  const tLowS = tLowMs * 1e-3;
  const periodS = periodMs * 1e-3;
  const prfHz = 1 / periodS;
  const markToSpaceRatio = tHighMs / tLowMs;
  const dutyCyclePct = (tHighMs / periodMs) * 100;

  const pulseDurationMs = 1.1 * r1 * cUf;
  const pulseDurationS = pulseDurationMs * 1e-3;

  const ustV = (2 / 3) * vs;
  const lstV = (1 / 3) * vs;
  const hysteresisBandV = ustV - lstV;
  const rcTimeConstantMs = r1 * cUf;
  const schmittPeriodMs = 2 * rcTimeConstantMs * Math.LN2;
  const schmittFreqHz = 1 / (schmittPeriodMs * 1e-3);

  const quantities: VerifiedQuantityMap = {
    tHighMs,
    tLowMs,
    periodMs,
    tHighS,
    tLowS,
    periodS,
    prfHz,
    markToSpaceRatio,
    dutyCyclePct,
    pulseDurationMs,
    pulseDurationS,
    ustV,
    lstV,
    hysteresisBandV,
    rcTimeConstantMs,
    schmittPeriodMs,
    schmittFreqHz,
    markGreaterThanSpaceRule:
      "capacitor charges through both resistors in series but discharges only through the lower resistor so mark always exceeds space",
    schmittHysteresisRule:
      "separate upper and lower switching thresholds provide hysteresis preventing noisy input signals from causing false switching",
    monostableRoleRule:
      "produces a single output pulse of fixed duration determined by R and C after each trigger",
  };
  return {
    solverId: "alevel-opt-elec-timing-astable-555-v1",
    quantities,
    publicNumbers: [r1, r2, cUf, vs],
  };
}

function renderTiming555Svg(
  spec: Record<string, unknown>,
  options?: DomainRenderOptions,
): DomainRenderOutput {
  const hidden = extractHiddenSet(spec, options);
  const solved = solveTiming555(spec).quantities;
  const mode = spec.mode as "555-astable" | "555-monostable" | "schmitt-astable";
  const vs = spec.supplyVoltageV as number;
  const tH = solved.tHighMs as number;
  const T = solved.periodMs as number;
  const publicNumbers: number[] = [];
  const publicLabels: string[] = [];

  if (!hidden.has("supplyVoltageV")) publicNumbers.push(vs);

  const x0 = 86;
  const x1 = 592;
  const topY0 = 56;
  const topY1 = 162;
  const botY0 = 198;
  const botY1 = 300;
  const spanW = x1 - x0;

  const yUst = topY0 + (topY1 - topY0) * (1 / 3);
  const yLst = topY0 + (topY1 - topY0) * (2 / 3);

  const vcPath: string[] = [];
  const voPath: string[] = [];
  const edgeLines: string[] = [];

  if (mode === "555-monostable") {
    const xTrig = x0 + spanW * 0.2;
    const xEnd = x0 + spanW * 0.72;
    // Exponential charge from 0 to 2/3 Vs
    vcPath.push(`M ${x0} ${topY1} L ${fc(xTrig)} ${topY1}`);
    for (let i = 1; i <= 40; i += 1) {
      const u = i / 40;
      const px = xTrig + u * (xEnd - xTrig);
      const frac = 1 - Math.exp(-1.1 * u);
      const py = topY1 - frac * (topY1 - topY0);
      vcPath.push(`L ${fc(px)} ${fc(py)}`);
    }
    vcPath.push(`L ${fc(xEnd)} ${topY1} L ${x1} ${topY1}`);
    voPath.push(
      `M ${x0} ${botY1} L ${fc(xTrig)} ${botY1} L ${fc(xTrig)} ${botY0 + 16} L ${fc(xEnd)} ${botY0 + 16} L ${fc(xEnd)} ${botY1} L ${x1} ${botY1}`,
    );
    edgeLines.push(
      `<line x1="${fc(xTrig)}" y1="${topY0}" x2="${fc(xTrig)}" y2="${botY1}" stroke="#94a3b8" stroke-width="1.2" stroke-dasharray="4 4"/>`,
      `<line x1="${fc(xEnd)}" y1="${topY0}" x2="${fc(xEnd)}" y2="${botY1}" stroke="#94a3b8" stroke-width="1.2" stroke-dasharray="4 4"/>`,
    );
  } else {
    // Two full cycles of astable oscillation
    const fracH = mode === "schmitt-astable" ? 0.5 : tH / T;
    const cycW = spanW / 2;
    let curX = x0;
    vcPath.push(`M ${fc(curX)} ${fc(yLst)}`);
    voPath.push(`M ${fc(curX)} ${botY1}`);
    for (let c = 0; c < 2; c += 1) {
      const xMid = curX + fracH * cycW;
      const xNext = curX + cycW;
      // Exponential charge from 1/3 to 2/3
      for (let i = 1; i <= 20; i += 1) {
        const u = i / 20;
        const px = curX + u * (xMid - curX);
        const yFrac = 1 / 3 + (2 / 3) * (1 - Math.pow(0.5, u));
        const py = topY1 - yFrac * (topY1 - topY0);
        vcPath.push(`L ${fc(px)} ${fc(py)}`);
      }
      // Exponential discharge from 2/3 to 1/3
      for (let i = 1; i <= 20; i += 1) {
        const u = i / 20;
        const px = xMid + u * (xNext - xMid);
        const yFrac = (2 / 3) * Math.pow(0.5, u);
        const py = topY1 - yFrac * (topY1 - topY0);
        vcPath.push(`L ${fc(px)} ${fc(py)}`);
      }
      voPath.push(
        `L ${fc(curX)} ${botY0 + 16} L ${fc(xMid)} ${botY0 + 16} L ${fc(xMid)} ${botY1} L ${fc(xNext)} ${botY1}`,
      );
      edgeLines.push(
        `<line x1="${fc(xMid)}" y1="${topY0}" x2="${fc(xMid)}" y2="${botY1}" stroke="#cbd5e1" stroke-width="1.2" stroke-dasharray="4 4"/>`,
        `<line x1="${fc(xNext)}" y1="${topY0}" x2="${fc(xNext)}" y2="${botY1}" stroke="#cbd5e1" stroke-width="1.2" stroke-dasharray="4 4"/>`,
      );
      curX = xNext;
    }
  }

  const titleText =
    mode === "555-astable"
      ? "555 Astable Timing Waveforms"
      : mode === "555-monostable"
        ? "555 Monostable Single-Pulse Waveforms"
        : "Schmitt-Trigger RC Astable Waveforms";

  const body = [
    svgText(320, 24, titleText, { size: 14, weight: "700" }),
    ...edgeLines,
    // Threshold lines on top panel
    `<line x1="${x0}" y1="${fc(yUst)}" x2="${x1}" y2="${fc(yUst)}" stroke="${RED}" stroke-width="1.2" stroke-dasharray="5 4"/>`,
    `<line x1="${x0}" y1="${fc(yLst)}" x2="${x1}" y2="${fc(yLst)}" stroke="${AMBER}" stroke-width="1.2" stroke-dasharray="5 4"/>`,
    // Axes
    `<line x1="${x0}" y1="${topY0}" x2="${x0}" y2="${topY1}" stroke="${INK}" stroke-width="2"/>`,
    `<line x1="${x0}" y1="${topY1}" x2="${x1}" y2="${topY1}" stroke="${INK}" stroke-width="1.8"/>`,
    `<line x1="${x0}" y1="${botY0}" x2="${x0}" y2="${botY1}" stroke="${INK}" stroke-width="2"/>`,
    `<line x1="${x0}" y1="${botY1}" x2="${x1}" y2="${botY1}" stroke="${INK}" stroke-width="1.8"/>`,
    // Curves
    `<path d="${vcPath.join(" ")}" fill="none" stroke="${BLUE}" stroke-width="2.5"/>`,
    `<path d="${voPath.join(" ")}" fill="none" stroke="${GREEN}" stroke-width="2.5"/>`,
    // Labels
    svgSubLabel(44, 114, "V", "C", "", { size: 13, fill: BLUE, weight: "700" }),
    svgSubLabel(44, 254, "V", "out", "", { size: 13, fill: GREEN, weight: "700" }),
    svgText(x0 - 8, yUst + 4, "⅔ V", { anchor: "end", size: 10, fill: RED, weight: "600" }),
    svgText(x0 - 8, yLst + 4, "⅓ V", { anchor: "end", size: 10, fill: AMBER, weight: "600" }),
    svgText(x0 - 8, botY0 + 20, "HIGH", { anchor: "end", size: 10, fill: GREEN, weight: "600" }),
    svgText(x0 - 8, botY1, "0 V", { anchor: "end", size: 10, fill: MUTED }),
    mode !== "555-monostable"
      ? svgSubLabel(x0 + spanW * 0.16, botY0 + 52, "t", "H", " (mark)", {
          size: 11,
          fill: GREEN,
          weight: "600",
        }) +
        svgSubLabel(x0 + spanW * 0.41, botY0 + 78, "t", "L", " (space)", {
          size: 11,
          fill: MUTED,
          weight: "600",
        })
      : svgText(x0 + spanW * 0.46, botY0 + 52, "Pulse T = 1.1 RC", {
          size: 12,
          fill: GREEN,
          weight: "700",
        }),
    svgText(340, 336, "Time t", { size: 13, weight: "600" }),
  ].join("");

  return {
    visualFamily: "circuits",
    svgMarkup: wrapSvg({
      title: "Synchronised capacitor voltage and rectangular output timing waveforms",
      body,
    }),
    rendererVersion: ALEVEL_OPT_EE_RENDERER_VERSION,
    publicNumbers,
    publicLabels,
  };
}

/* ========================================================================== */
/*  12. al-opt-elec-combinational-logic (pure-calculation)                    */
/* ========================================================================== */

export type LogicCircuitId =
  | "demorgan-nand-equiv"
  | "demorgan-nor-equiv"
  | "eor-from-gates"
  | "nand-only-or"
  | "three-input-alarm"
  | "three-input-simplify";

const LOGIC_CIRCUIT_IDS: readonly LogicCircuitId[] = [
  "demorgan-nand-equiv",
  "demorgan-nor-equiv",
  "eor-from-gates",
  "nand-only-or",
  "three-input-alarm",
  "three-input-simplify",
];

const COMBINATIONAL_LOGIC_FIELDS: readonly DomainKindFieldSpec[] = [
  { name: "kind", type: "string", enumValues: ["al-opt-elec-combinational-logic"] },
  { name: "circuitId", type: "string", enumValues: LOGIC_CIRCUIT_IDS },
  { name: "inputA", type: "integer", bounds: "0..1" },
  { name: "inputB", type: "integer", bounds: "0..1" },
  { name: "inputC", type: "integer", bounds: "0..1" },
];

function validateCombinationalLogic(
  spec: Record<string, unknown>,
): DomainValidationResult {
  const issues: string[] = [];
  if (spec.kind !== "al-opt-elec-combinational-logic") {
    issues.push('kind must be "al-opt-elec-combinational-logic"');
  }
  if (
    typeof spec.circuitId !== "string" ||
    !(LOGIC_CIRCUIT_IDS as readonly string[]).includes(spec.circuitId)
  ) {
    issues.push(`circuitId must be one of: ${LOGIC_CIRCUIT_IDS.join(", ")}`);
  }
  if (!isIntInRange(spec.inputA, 0, 1)) issues.push("inputA must be 0 or 1");
  if (!isIntInRange(spec.inputB, 0, 1)) issues.push("inputB must be 0 or 1");
  if (spec.inputC !== undefined && !isIntInRange(spec.inputC, 0, 1)) {
    issues.push("inputC must be 0 or 1");
  }
  return { valid: issues.length === 0, issues };
}

function evalLogicCircuit(
  cid: LogicCircuitId,
  a: number,
  b: number,
  c: number,
): { nodeD: number; nodeE: number; outputQ: number } {
  const nA = a === 0 ? 1 : 0;
  const nB = b === 0 ? 1 : 0;
  const nC = c === 0 ? 1 : 0;
  switch (cid) {
    case "demorgan-nand-equiv":
      return { nodeD: nA, nodeE: nB, outputQ: nA | nB };
    case "demorgan-nor-equiv":
      return { nodeD: nA, nodeE: nB, outputQ: nA & nB };
    case "eor-from-gates": {
      const f = nA & b;
      const g = a & nB;
      return { nodeD: f, nodeE: g, outputQ: f | g };
    }
    case "nand-only-or": {
      const d = nA;
      const e = nB;
      const q = (d & e) === 1 ? 0 : 1;
      return { nodeD: d, nodeE: e, outputQ: q };
    }
    case "three-input-alarm": {
      const d = a & b;
      const e = nC;
      return { nodeD: d, nodeE: e, outputQ: d | e };
    }
    case "three-input-simplify": {
      const d = a & b;
      const e = a & nB;
      const f = d | e; // simplifies to A
      return { nodeD: d, nodeE: e, outputQ: f & c };
    }
  }
}

function solveCombinationalLogic(
  spec: Record<string, unknown>,
): DomainSolveOutput {
  const cid = spec.circuitId as LogicCircuitId;
  const a = spec.inputA as number;
  const b = spec.inputB as number;
  const c = isIntInRange(spec.inputC, 0, 1) ? spec.inputC : 0;
  const isThreeInput =
    cid === "three-input-alarm" || cid === "three-input-simplify";

  const { nodeD, nodeE, outputQ } = evalLogicCircuit(cid, a, b, c);
  let highRowCount = 0;
  const totalRows = isThreeInput ? 8 : 4;
  for (let row = 0; row < totalRows; row += 1) {
    const ra = isThreeInput ? (row >> 2) & 1 : (row >> 1) & 1;
    const rb = isThreeInput ? (row >> 1) & 1 : row & 1;
    const rc = isThreeInput ? row & 1 : 0;
    if (evalLogicCircuit(cid, ra, rb, rc).outputQ === 1) highRowCount += 1;
  }

  const metaByCircuit: Record<
    LogicCircuitId,
    {
      gateCount: number;
      singleGate: string;
      simplifiedDesc: string;
    }
  > = {
    "demorgan-nand-equiv": {
      gateCount: 3,
      singleGate: "single two-input NAND gate",
      simplifiedDesc: "NOT of A AND B equivalent to a NAND gate",
    },
    "demorgan-nor-equiv": {
      gateCount: 3,
      singleGate: "single two-input NOR gate",
      simplifiedDesc: "NOT of A OR B equivalent to a NOR gate",
    },
    "eor-from-gates": {
      gateCount: 5,
      singleGate: "single two-input EOR gate",
      simplifiedDesc: "not A and B or A and not B forming an EOR gate",
    },
    "nand-only-or": {
      gateCount: 3,
      singleGate: "single two-input OR gate",
      simplifiedDesc: "A OR B synthesised from three NAND gates",
    },
    "three-input-alarm": {
      gateCount: 3,
      singleGate: "combined AND-NOT-OR alarm network",
      simplifiedDesc: "output is high when both A and B are high or when C is low",
    },
    "three-input-simplify": {
      gateCount: 5,
      singleGate: "single two-input AND gate on inputs A and C",
      simplifiedDesc: "simplifies to A AND C independent of input B",
    },
  };
  const meta = metaByCircuit[cid];

  const quantities: VerifiedQuantityMap = {
    nodeD,
    nodeE,
    outputQ,
    highRowCount,
    totalRows,
    gateCount: meta.gateCount,
    equivalentSingleGate: meta.singleGate,
    simplifiedBooleanDesc: meta.simplifiedDesc,
    nandEconomyRule:
      "building circuits from NAND gates alone uses one type of quad integrated circuit reducing cost and unused gates",
    demorganRule:
      "inverting the inputs and output swaps AND and OR operations according to De Morgan theorem",
  };
  return {
    solverId: "alevel-opt-elec-combinational-logic-v1",
    quantities,
    publicNumbers: isThreeInput ? [a, b, c] : [a, b],
  };
}

function drawNotGate(x: number, y: number): string {
  return [
    `<polygon points="${fc(x)},${fc(y - 16)} ${fc(x)},${fc(y + 16)} ${fc(x + 28)},${fc(y)}" fill="#f8fafc" stroke="${INK}" stroke-width="2.2"/>`,
    `<circle cx="${fc(x + 33)}" cy="${fc(y)}" r="5" fill="#ffffff" stroke="${INK}" stroke-width="2"/>`,
  ].join("");
}

function drawAndGate(x: number, y: number, inverted = false): string {
  return [
    `<path d="M ${fc(x)} ${fc(y - 20)} L ${fc(x + 24)} ${fc(y - 20)} A 20 20 0 0 1 ${fc(x + 24)} ${fc(y + 20)} L ${fc(x)} ${fc(y + 20)} Z" fill="#f8fafc" stroke="${INK}" stroke-width="2.2"/>`,
    inverted
      ? `<circle cx="${fc(x + 49)}" cy="${fc(y)}" r="5" fill="#ffffff" stroke="${INK}" stroke-width="2"/>`
      : "",
  ].join("");
}

function drawOrGate(x: number, y: number, inverted = false): string {
  return [
    `<path d="M ${fc(x)} ${fc(y - 20)} Q ${fc(x + 12)} ${fc(y)} ${fc(x)} ${fc(y + 20)} L ${fc(x + 20)} ${fc(y + 20)} Q ${fc(x + 40)} ${fc(y + 18)} ${fc(x + 48)} ${fc(y)} Q ${fc(x + 40)} ${fc(y - 18)} ${fc(x + 20)} ${fc(y - 20)} Z" fill="#f8fafc" stroke="${INK}" stroke-width="2.2"/>`,
    inverted
      ? `<circle cx="${fc(x + 53)}" cy="${fc(y)}" r="5" fill="#ffffff" stroke="${INK}" stroke-width="2"/>`
      : "",
  ].join("");
}

function renderCombinationalLogicSvg(
  spec: Record<string, unknown>,
  options?: DomainRenderOptions,
): DomainRenderOutput {
  void options;
  const cid = spec.circuitId as LogicCircuitId;
  const publicNumbers: number[] = [];
  const publicLabels: string[] = ["A", "B", "Q"];

  let body = "";
  if (cid === "demorgan-nand-equiv" || cid === "demorgan-nor-equiv") {
    const isOr = cid === "demorgan-nand-equiv";
    body = [
      svgText(320, 26, "Combinational Logic Gate Network", { size: 14, weight: "700" }),
      // Inputs A, B -> NOT gates -> D, E -> final OR/AND -> Q
      `<line x1="90" y1="126" x2="190" y2="126" stroke="${INK}" stroke-width="2.2"/>`,
      `<line x1="90" y1="234" x2="190" y2="234" stroke="${INK}" stroke-width="2.2"/>`,
      drawNotGate(190, 126),
      drawNotGate(190, 234),
      `<polyline points="228,126 300,126 300,168 360,168" fill="none" stroke="${INK}" stroke-width="2.2"/>`,
      `<polyline points="228,234 300,234 300,192 360,192" fill="none" stroke="${INK}" stroke-width="2.2"/>`,
      isOr ? drawOrGate(356, 180) : drawAndGate(360, 180),
      `<line x1="404" y1="180" x2="530" y2="180" stroke="${INK}" stroke-width="2.2"/>`,
      drawTerminalCircle(90, 126),
      drawTerminalCircle(90, 234),
      drawTerminalCircle(530, 180),
      svgText(72, 130, "A", { size: 15, fill: BLUE, weight: "700" }),
      svgText(72, 238, "B", { size: 15, fill: BLUE, weight: "700" }),
      svgText(264, 114, "D", { size: 13, fill: RED, weight: "700" }),
      svgText(264, 254, "E", { size: 13, fill: RED, weight: "700" }),
      svgText(550, 185, "Q", { size: 15, fill: GREEN, weight: "700" }),
    ].join("");
  } else if (cid === "eor-from-gates") {
    body = [
      svgText(320, 26, "Five-Gate Combinational Logic Circuit", {
        size: 14,
        weight: "700",
      }),
      // Rails A (y=108), B (y=252)
      `<line x1="78" y1="108" x2="152" y2="108" stroke="${INK}" stroke-width="2.2"/>`,
      `<line x1="78" y1="252" x2="152" y2="252" stroke="${INK}" stroke-width="2.2"/>`,
      drawTerminalCircle(78, 108),
      drawTerminalCircle(78, 252),
      svgText(60, 113, "A", { size: 15, fill: BLUE, weight: "700" }),
      svgText(60, 257, "B", { size: 15, fill: BLUE, weight: "700" }),
      // NOT A at (152, 108), NOT B at (152, 252)
      drawNotGate(152, 108),
      drawNotGate(152, 252),
      // Tap A down to lower AND; tap B up to upper AND
      drawNodeDot(122, 108),
      drawNodeDot(136, 252),
      `<polyline points="190,108 268,108 268,120 292,120" fill="none" stroke="${INK}" stroke-width="2"/>`,
      `<polyline points="136,252 136,144 292,144" fill="none" stroke="${INK}" stroke-width="2"/>`,
      `<polyline points="122,108 122,216 292,216" fill="none" stroke="${INK}" stroke-width="2"/>`,
      `<polyline points="190,252 268,252 268,240 292,240" fill="none" stroke="${INK}" stroke-width="2"/>`,
      // Upper AND (D), Lower AND (E)
      drawAndGate(292, 132),
      drawAndGate(292, 228),
      // Combine into OR -> Q
      `<polyline points="336,132 396,132 396,168 438,168" fill="none" stroke="${INK}" stroke-width="2.2"/>`,
      `<polyline points="336,228 396,228 396,192 438,192" fill="none" stroke="${INK}" stroke-width="2.2"/>`,
      drawOrGate(434, 180),
      `<line x1="482" y1="180" x2="558" y2="180" stroke="${INK}" stroke-width="2.2"/>`,
      drawTerminalCircle(558, 180),
      svgText(366, 120, "D", { size: 13, fill: RED, weight: "700" }),
      svgText(366, 248, "E", { size: 13, fill: RED, weight: "700" }),
      svgText(576, 185, "Q", { size: 15, fill: GREEN, weight: "700" }),
    ].join("");
  } else if (cid === "nand-only-or") {
    body = [
      svgText(320, 26, "Universal NAND-Only Gate Network", {
        size: 14,
        weight: "700",
      }),
      // Input A tied to both inputs of top NAND; Input B tied to both inputs of bottom NAND
      `<line x1="88" y1="126" x2="152" y2="126" stroke="${INK}" stroke-width="2.2"/>`,
      `<polyline points="152,114 152,138" fill="none" stroke="${INK}" stroke-width="2.2"/>`,
      `<line x1="152" y1="114" x2="186" y2="114" stroke="${INK}" stroke-width="2"/>`,
      `<line x1="152" y1="138" x2="186" y2="138" stroke="${INK}" stroke-width="2"/>`,
      drawNodeDot(152, 126),
      `<line x1="88" y1="234" x2="152" y2="234" stroke="${INK}" stroke-width="2.2"/>`,
      `<polyline points="152,222 152,246" fill="none" stroke="${INK}" stroke-width="2.2"/>`,
      `<line x1="152" y1="222" x2="186" y2="222" stroke="${INK}" stroke-width="2"/>`,
      `<line x1="152" y1="246" x2="186" y2="246" stroke="${INK}" stroke-width="2"/>`,
      drawNodeDot(152, 234),
      drawAndGate(186, 126, true),
      drawAndGate(186, 234, true),
      `<polyline points="240,126 310,126 310,168 358,168" fill="none" stroke="${INK}" stroke-width="2.2"/>`,
      `<polyline points="240,234 310,234 310,192 358,192" fill="none" stroke="${INK}" stroke-width="2.2"/>`,
      drawAndGate(358, 180, true),
      `<line x1="412" y1="180" x2="532" y2="180" stroke="${INK}" stroke-width="2.2"/>`,
      drawTerminalCircle(88, 126),
      drawTerminalCircle(88, 234),
      drawTerminalCircle(532, 180),
      svgText(70, 130, "A", { size: 15, fill: BLUE, weight: "700" }),
      svgText(70, 238, "B", { size: 15, fill: BLUE, weight: "700" }),
      svgText(278, 114, "D", { size: 13, fill: RED, weight: "700" }),
      svgText(278, 254, "E", { size: 13, fill: RED, weight: "700" }),
      svgText(550, 185, "Q", { size: 15, fill: GREEN, weight: "700" }),
    ].join("");
  } else if (cid === "three-input-alarm") {
    publicLabels.push("C");
    body = [
      svgText(320, 26, "Three-Input Control Logic Circuit", {
        size: 14,
        weight: "700",
      }),
      `<line x1="88" y1="112" x2="210" y2="112" stroke="${INK}" stroke-width="2.2"/>`,
      `<line x1="88" y1="140" x2="210" y2="140" stroke="${INK}" stroke-width="2.2"/>`,
      `<line x1="88" y1="242" x2="210" y2="242" stroke="${INK}" stroke-width="2.2"/>`,
      drawTerminalCircle(88, 112),
      drawTerminalCircle(88, 140),
      drawTerminalCircle(88, 242),
      drawAndGate(210, 126),
      drawNotGate(210, 242),
      `<polyline points="254,126 320,126 320,172 372,172" fill="none" stroke="${INK}" stroke-width="2.2"/>`,
      `<polyline points="248,242 320,242 320,196 372,196" fill="none" stroke="${INK}" stroke-width="2.2"/>`,
      drawOrGate(368, 184),
      `<line x1="416" y1="184" x2="534" y2="184" stroke="${INK}" stroke-width="2.2"/>`,
      drawTerminalCircle(534, 184),
      svgText(70, 116, "A", { size: 15, fill: BLUE, weight: "700" }),
      svgText(70, 144, "B", { size: 15, fill: BLUE, weight: "700" }),
      svgText(70, 246, "C", { size: 15, fill: BLUE, weight: "700" }),
      svgText(286, 114, "D", { size: 13, fill: RED, weight: "700" }),
      svgText(286, 260, "E", { size: 13, fill: RED, weight: "700" }),
      svgText(552, 189, "Q", { size: 15, fill: GREEN, weight: "700" }),
    ].join("");
  } else {
    publicLabels.push("C");
    body = [
      svgText(320, 26, "Three-Input Reducible Logic Network", {
        size: 14,
        weight: "700",
      }),
      // A (100), B (170), C (276)
      `<line x1="76" y1="100" x2="220" y2="100" stroke="${INK}" stroke-width="2.2"/>`,
      `<line x1="76" y1="170" x2="140" y2="170" stroke="${INK}" stroke-width="2.2"/>`,
      `<line x1="76" y1="276" x2="466" y2="276" stroke="${INK}" stroke-width="2.2"/>`,
      drawTerminalCircle(76, 100),
      drawTerminalCircle(76, 170),
      drawTerminalCircle(76, 276),
      svgText(58, 105, "A", { size: 15, fill: BLUE, weight: "700" }),
      svgText(58, 175, "B", { size: 15, fill: BLUE, weight: "700" }),
      svgText(58, 281, "C", { size: 15, fill: BLUE, weight: "700" }),
      // B splits: up to D(AND) and through NOT to E(AND)
      drawNodeDot(118, 100),
      drawNodeDot(128, 170),
      `<polyline points="128,170 128,124 220,124" fill="none" stroke="${INK}" stroke-width="2"/>`,
      `<polyline points="118,100 118,188 220,188" fill="none" stroke="${INK}" stroke-width="2"/>`,
      `<polyline points="128,170 128,212 146,212" fill="none" stroke="${INK}" stroke-width="2"/>`,
      drawNotGate(146, 212),
      `<line x1="184" y1="212" x2="220" y2="212" stroke="${INK}" stroke-width="2"/>`,
      drawAndGate(220, 112),
      drawAndGate(220, 200),
      // D and E -> OR (F)
      `<polyline points="264,112 308,112 308,144 338,144" fill="none" stroke="${INK}" stroke-width="2"/>`,
      `<polyline points="264,200 308,200 308,168 338,168" fill="none" stroke="${INK}" stroke-width="2"/>`,
      drawOrGate(334, 156),
      // F and C -> final AND -> Q
      `<polyline points="382,156 432,156 432,208 466,208" fill="none" stroke="${INK}" stroke-width="2.2"/>`,
      `<polyline points="432,276 432,232 466,232" fill="none" stroke="${INK}" stroke-width="2.2"/>`,
      drawAndGate(466, 220),
      `<line x1="510" y1="220" x2="564" y2="220" stroke="${INK}" stroke-width="2.2"/>`,
      drawTerminalCircle(564, 220),
      svgText(286, 100, "D", { size: 12, fill: RED, weight: "700" }),
      svgText(286, 216, "E", { size: 12, fill: RED, weight: "700" }),
      svgText(406, 144, "F", { size: 12, fill: PURPLE, weight: "700" }),
      svgText(582, 225, "Q", { size: 15, fill: GREEN, weight: "700" }),
    ].join("");
  }

  return {
    visualFamily: "circuits",
    svgMarkup: wrapSvg({
      title: "Combinational logic gate schematic with intermediate test nodes",
      body,
    }),
    rendererVersion: ALEVEL_OPT_EE_RENDERER_VERSION,
    publicNumbers,
    publicLabels,
  };
}

/* ========================================================================== */
/*  13. al-opt-elec-sequential-counters (graphs)                              */
/* ========================================================================== */

const SEQUENTIAL_COUNTERS_FIELDS: readonly DomainKindFieldSpec[] = [
  { name: "kind", type: "string", enumValues: ["al-opt-elec-sequential-counters"] },
  {
    name: "mode",
    type: "string",
    enumValues: ["binary-ripple", "modulo-n-bcd", "johnson-decade"],
  },
  { name: "clockFreqHz", type: "number", unit: "Hz", bounds: "> 0" },
  { name: "numStages", type: "integer", bounds: "2..5" },
  { name: "moduloN", type: "integer", bounds: "4..32" },
  { name: "pulseCount", type: "integer", bounds: "1..1000" },
];

function validateSequentialCounters(
  spec: Record<string, unknown>,
): DomainValidationResult {
  const issues: string[] = [];
  if (spec.kind !== "al-opt-elec-sequential-counters") {
    issues.push('kind must be "al-opt-elec-sequential-counters"');
  }
  if (
    spec.mode !== "binary-ripple" &&
    spec.mode !== "modulo-n-bcd" &&
    spec.mode !== "johnson-decade"
  ) {
    issues.push(
      'mode must be "binary-ripple", "modulo-n-bcd", or "johnson-decade"',
    );
  }
  if (!isPosNum(spec.clockFreqHz)) issues.push("clockFreqHz must be > 0");
  if (!isIntInRange(spec.numStages, 2, 5)) {
    issues.push("numStages must be integer in 2..5");
  }
  if (!isIntInRange(spec.moduloN, 4, 32)) {
    issues.push("moduloN must be integer in 4..32");
  }
  if (!isIntInRange(spec.pulseCount, 1, 1000)) {
    issues.push("pulseCount must be integer in 1..1000");
  }
  if (
    issues.length === 0 &&
    spec.mode === "binary-ripple" &&
    spec.moduloN !== 2 ** (spec.numStages as number)
  ) {
    issues.push("binary-ripple mode requires moduloN === 2^numStages");
  }
  if (
    issues.length === 0 &&
    spec.mode === "modulo-n-bcd" &&
    (spec.moduloN as number) > 2 ** (spec.numStages as number)
  ) {
    issues.push("modulo-n-bcd requires moduloN <= 2^numStages");
  }
  return { valid: issues.length === 0, issues };
}

function solveSequentialCounters(
  spec: Record<string, unknown>,
): DomainSolveOutput {
  const mode = spec.mode as "binary-ripple" | "modulo-n-bcd" | "johnson-decade";
  const fClk = spec.clockFreqHz as number;
  const nStages = spec.numStages as number;
  const modN = spec.moduloN as number;
  const pulses = spec.pulseCount as number;

  const outputFreqHz =
    mode === "binary-ripple" ? fClk / 2 ** nStages : fClk / modN;
  const outputPeriodMs = (1 / outputFreqHz) * 1e3;
  const countAfterPulses = pulses % modN;
  const maxDecimalState = modN - 1;

  // Determine active-high reset bits for modulo-N decoding
  const resetBits: string[] = [];
  for (let bit = nStages - 1; bit >= 0; bit -= 1) {
    if ((modN >> bit) & 1) {
      resetBits.push(`Q${bit}`);
    }
  }
  const resetGateDescription =
    resetBits.length >= 2
      ? `${resetBits.join(" and ")} connected to an AND gate driving master reset`
      : `${resetBits[0] ?? "Q3"} driving master reset`;

  const quantities: VerifiedQuantityMap = {
    outputFreqHz,
    outputPeriodMs,
    countAfterPulses,
    maxDecimalState,
    q0Bit: countAfterPulses & 1,
    q1Bit: (countAfterPulses >> 1) & 1,
    q2Bit: (countAfterPulses >> 2) & 1,
    q3Bit: (countAfterPulses >> 3) & 1,
    resetGateDescription,
    dTypeDivideRule:
      "connecting not-Q back to the D input toggles Q on every rising clock edge dividing frequency by two",
    johnsonVsBcdRule:
      "johnson decade counter activates one decoded output sequentially without extra decoding gates whereas a BCD counter outputs binary weights needing a decoder",
    counterLorAnchor:
      "each rising clock edge toggles the first D-type flip-flop to divide frequency by two and an AND gate decodes the target reset state to clear all flip-flops",
  };
  return {
    solverId: "alevel-opt-elec-sequential-counters-v1",
    quantities,
    publicNumbers: [fClk, nStages, modN, pulses],
  };
}

function renderSequentialCountersSvg(
  spec: Record<string, unknown>,
  options?: DomainRenderOptions,
): DomainRenderOutput {
  void options;
  const mode = spec.mode as "binary-ripple" | "modulo-n-bcd" | "johnson-decade";
  const modN = spec.moduloN as number;
  const nStages = spec.numStages as number;
  const publicNumbers: number[] = [];
  const publicLabels: string[] = ["CLK", "Q₀", "Q₁", "Q₂"];

  const cycles = mode === "modulo-n-bcd" ? Math.min(modN + 1, 11) : 8;
  const x0 = 86;
  const x1 = 602;
  const stepW = (x1 - x0) / cycles;
  const showQ3 = nStages >= 4 || mode === "johnson-decade";
  if (showQ3) publicLabels.push("Q₃");

  const rowLabels = showQ3
    ? ["CLK", "Q₀", "Q₁", "Q₂", "Q₃"]
    : ["CLK", "Q₀", "Q₁", "Q₂"];
  const rowCount = rowLabels.length;
  const topPad = 56;
  const rowPitch = (324 - topPad) / rowCount;
  const rowAmp = Math.min(28, rowPitch * 0.56);

  const guides: string[] = [];
  for (let c = 0; c <= cycles; c += 1) {
    const gx = x0 + c * stepW;
    guides.push(
      `<line x1="${fc(gx)}" y1="${topPad - 6}" x2="${fc(gx)}" y2="324" stroke="${GRID}" stroke-width="1.2" stroke-dasharray="3 3"/>`,
    );
    if (c < cycles) {
      const tickStr = String(c);
      publicNumbers.push(c);
      publicLabels.push(tickStr);
      guides.push(
        svgText(gx + stepW * 0.5, 44, tickStr, { size: 11, fill: MUTED }),
      );
    }
  }

  const rowColors = [INK, BLUE, GREEN, AMBER, PURPLE];
  const waveforms: string[] = [];

  for (let r = 0; r < rowCount; r += 1) {
    const yLow = topPad + r * rowPitch + rowAmp + 8;
    const yHigh = yLow - rowAmp;
    const pts: string[] = [];

    if (r === 0) {
      // CLK square wave: rising edge at start of each pulse c
      pts.push(`M ${x0} ${fc(yLow)}`);
      for (let c = 0; c < cycles; c += 1) {
        const xs = x0 + c * stepW;
        const xm = xs + stepW * 0.5;
        const xe = xs + stepW;
        pts.push(
          `L ${fc(xs)} ${fc(yHigh)} L ${fc(xm)} ${fc(yHigh)} L ${fc(xm)} ${fc(yLow)} L ${fc(xe)} ${fc(yLow)}`,
        );
      }
    } else {
      const bitIdx = r - 1;
      for (let c = 0; c < cycles; c += 1) {
        const xs = x0 + c * stepW;
        const xe = xs + stepW;
        let bitVal = 0;
        if (mode === "johnson-decade") {
          bitVal = c % modN === bitIdx ? 1 : 0;
        } else {
          const state = c % modN;
          bitVal = (state >> bitIdx) & 1;
        }
        const yVal = bitVal === 1 ? yHigh : yLow;
        if (c === 0) {
          pts.push(`M ${fc(xs)} ${fc(yVal)} L ${fc(xe)} ${fc(yVal)}`);
        } else {
          pts.push(`L ${fc(xs)} ${fc(yVal)} L ${fc(xe)} ${fc(yVal)}`);
        }
      }
    }

    waveforms.push(
      svgText(x0 - 14, (yLow + yHigh) / 2 + 4, rowLabels[r], {
        anchor: "end",
        size: 13,
        fill: rowColors[r],
        weight: "700",
      }),
      `<path d="${pts.join(" ")}" fill="none" stroke="${rowColors[r]}" stroke-width="2.3"/>`,
    );
  }

  const heading =
    mode === "binary-ripple"
      ? "Binary Ripple Counter Timing Diagram"
      : mode === "modulo-n-bcd"
        ? `Modulo-${modN} Counter Timing Diagram`
        : "Johnson Decade Counter Timing Diagram";

  const body = [
    svgText(320, 22, heading, { size: 14, weight: "700" }),
    ...guides,
    ...waveforms,
    svgText(344, 348, "Clock pulse index (rising-edge triggered)", {
      size: 12,
      fill: MUTED,
      weight: "600",
    }),
  ].join("");

  return {
    visualFamily: "graphs",
    svgMarkup: wrapSvg({
      title: "Multi-row digital counter timing diagram aligned on clock edges",
      body,
    }),
    rendererVersion: ALEVEL_OPT_EE_RENDERER_VERSION,
    publicNumbers,
    publicLabels,
  };
}

/* ========================================================================== */
/*  14. al-opt-elec-adc-pcm-comms (waves)                                     */
/* ========================================================================== */

const ADC_PCM_COMMS_FIELDS: readonly DomainKindFieldSpec[] = [
  { name: "kind", type: "string", enumValues: ["al-opt-elec-adc-pcm-comms"] },
  { name: "mode", type: "string", enumValues: ["adc-sampling", "am-fm-spectrum"] },
  { name: "vRangeV", type: "number", unit: "V", bounds: "> 0" },
  { name: "adcBits", type: "integer", bounds: "3..16" },
  { name: "maxAudioFreqHz", type: "number", unit: "Hz", bounds: "> 0" },
  { name: "samplingFreqHz", type: "number", unit: "Hz", bounds: "> 0" },
  { name: "tdmChannels", type: "integer", bounds: "1..64" },
  { name: "carrierFreqKhz", type: "number", unit: "kHz", bounds: "> 0" },
  { name: "freqDeviationKhz", type: "number", unit: "kHz", bounds: "> 0" },
  { name: "modulatingFreqKhz", type: "number", unit: "kHz", bounds: "> 0" },
  { name: "bandWidthAvailableKhz", type: "number", unit: "kHz", bounds: "> 0" },
];

function validateAdcPcmComms(
  spec: Record<string, unknown>,
): DomainValidationResult {
  const issues: string[] = [];
  if (spec.kind !== "al-opt-elec-adc-pcm-comms") {
    issues.push('kind must be "al-opt-elec-adc-pcm-comms"');
  }
  if (spec.mode !== "adc-sampling" && spec.mode !== "am-fm-spectrum") {
    issues.push('mode must be "adc-sampling" or "am-fm-spectrum"');
  }
  if (!isPosNum(spec.vRangeV)) issues.push("vRangeV must be > 0");
  if (!isIntInRange(spec.adcBits, 3, 16)) {
    issues.push("adcBits must be integer in 3..16");
  }
  if (!isPosNum(spec.maxAudioFreqHz)) issues.push("maxAudioFreqHz must be > 0");
  if (!isPosNum(spec.samplingFreqHz)) issues.push("samplingFreqHz must be > 0");
  if (!isIntInRange(spec.tdmChannels, 1, 64)) {
    issues.push("tdmChannels must be integer in 1..64");
  }
  if (!isPosNum(spec.carrierFreqKhz)) issues.push("carrierFreqKhz must be > 0");
  if (!isPosNum(spec.freqDeviationKhz)) {
    issues.push("freqDeviationKhz must be > 0");
  }
  if (!isPosNum(spec.modulatingFreqKhz)) {
    issues.push("modulatingFreqKhz must be > 0");
  }
  if (!isPosNum(spec.bandWidthAvailableKhz)) {
    issues.push("bandWidthAvailableKhz must be > 0");
  }
  return { valid: issues.length === 0, issues };
}

function solveAdcPcmComms(spec: Record<string, unknown>): DomainSolveOutput {
  const vRange = spec.vRangeV as number;
  const bits = spec.adcBits as number;
  const fMax = spec.maxAudioFreqHz as number;
  const fSample = spec.samplingFreqHz as number;
  const channels = spec.tdmChannels as number;
  const fcKhz = spec.carrierFreqKhz as number;
  const dfKhz = spec.freqDeviationKhz as number;
  const fmKhz = spec.modulatingFreqKhz as number;
  const bwAvail = spec.bandWidthAvailableKhz as number;

  // Strict AQA rule: ADC resolution Delta V = V_range / 2^n!
  const quantisationLevels = 2 ** bits;
  const voltageResolutionV = vRange / quantisationLevels;
  const voltageResolutionMv = voltageResolutionV * 1e3;
  const minNyquistFreqHz = 2 * fMax;
  const minNyquistFreqKhz = minNyquistFreqHz / 1e3;
  const pcmBitRateBps = fSample * bits;
  const pcmBitRateKbps = pcmBitRateBps / 1e3;
  const tdmTotalBitRateKbps = pcmBitRateKbps * channels;
  const sampleIntervalUs = (1 / fSample) * 1e6;
  const amBandwidthKhz = 2 * fmKhz;
  const fmBandwidthKhz = 2 * (dfKhz + fmKhz);
  const maxAmStations = Math.floor(bwAvail / amBandwidthKhz);
  const maxFmStations = Math.floor(bwAvail / fmBandwidthKhz);
  const lowerSidebandKhz = fcKhz - fmKhz;
  const upperSidebandKhz = fcKhz + fmKhz;

  const quantities: VerifiedQuantityMap = {
    quantisationLevels,
    voltageResolutionV,
    voltageResolutionMv,
    minNyquistFreqHz,
    minNyquistFreqKhz,
    pcmBitRateBps,
    pcmBitRateKbps,
    tdmTotalBitRateKbps,
    sampleIntervalUs,
    amBandwidthKhz,
    fmBandwidthKhz,
    maxAmStations,
    maxFmStations,
    lowerSidebandKhz,
    upperSidebandKhz,
    aliasingRule:
      "sampling below twice the maximum signal frequency produces false lower-frequency aliasing distortion",
    regeneratorRule:
      "regenerator restores clean digital logic levels removing accumulated noise whereas an analogue amplifier amplifies noise with the signal",
    amVsFmRule:
      "FM provides superior noise immunity and audio fidelity than AM at the cost of wider channel bandwidth and shorter line-of-sight range",
    pcmTdmLorAnchor:
      "analogue signal is sampled above twice the maximum frequency quantised into binary words interleaved by time-division multiplexing and cleaned by regenerators",
    mediaPathwaysLorAnchor:
      "optical fibres provide lower attenuation higher bandwidth and immunity to electromagnetic interference than copper cables while sky waves refract from the ionosphere for long-range links",
  };
  return {
    solverId: "alevel-opt-elec-adc-pcm-comms-v1",
    quantities,
    publicNumbers: [
      vRange,
      bits,
      fMax,
      fMax / 1e3,
      fSample,
      fSample / 1e3,
      channels,
      fcKhz,
      dfKhz,
      fmKhz,
      bwAvail,
    ],
  };
}

function renderAdcPcmCommsSvg(
  spec: Record<string, unknown>,
  options?: DomainRenderOptions,
): DomainRenderOutput {
  const hidden = extractHiddenSet(spec, options);
  const mode = spec.mode as "adc-sampling" | "am-fm-spectrum";
  const vRange = spec.vRangeV as number;
  const fcKhz = spec.carrierFreqKhz as number;
  const fmKhz = spec.modulatingFreqKhz as number;
  const publicNumbers: number[] = [];
  const publicLabels: string[] = [];

  const x0 = 84;
  const x1 = 592;
  const yTop = 58;
  const yBot = 296;
  let body = "";
  let title = "Analogue-to-digital sampling and communications diagram";

  if (mode === "adc-sampling") {
    title = "Analogue waveform overlaid with ADC quantisation levels and periodic samples";
    if (!hidden.has("vRangeV")) publicNumbers.push(vRange);
    const levels = 8; // clean visual representation of quantisation steps
    const gridLines: string[] = [];
    for (let i = 0; i <= levels; i += 1) {
      const gy = yBot - (i / levels) * (yBot - yTop);
      gridLines.push(
        `<line x1="${x0}" y1="${fc(gy)}" x2="${x1}" y2="${fc(gy)}" stroke="${GRID}" stroke-width="1"/>`,
      );
    }

    const wavePts: string[] = [];
    const stems: string[] = [];
    const N = 120;
    const sig = (u: number) =>
      0.5 + 0.34 * Math.sin(2 * Math.PI * 1.2 * u) + 0.12 * Math.cos(2 * Math.PI * 2.4 * u);
    for (let i = 0; i <= N; i += 1) {
      const u = i / N;
      const px = x0 + u * (x1 - x0);
      const py = yBot - sig(u) * (yBot - yTop);
      wavePts.push(`${i === 0 ? "M" : "L"} ${fc(px)} ${fc(py)}`);
    }
    const sampleCount = 12;
    for (let s = 1; s < sampleCount; s += 1) {
      const u = s / sampleCount;
      const px = x0 + u * (x1 - x0);
      const qLevel = Math.round(sig(u) * levels) / levels;
      const py = yBot - qLevel * (yBot - yTop);
      stems.push(
        `<line x1="${fc(px)}" y1="${yBot}" x2="${fc(px)}" y2="${fc(py)}" stroke="${RED}" stroke-width="1.8" stroke-dasharray="3 2"/>`,
        `<circle cx="${fc(px)}" cy="${fc(py)}" r="4.5" fill="${RED}" stroke="#ffffff" stroke-width="1.2"/>`,
      );
    }

    const vRangeLbl = `${fmtEngElecVal(vRange)} V`;
    publicLabels.push(vRangeLbl);

    body = [
      svgText(320, 26, "ADC Sampling and Quantisation Levels", {
        size: 14,
        weight: "700",
      }),
      ...gridLines,
      `<line x1="${x0}" y1="${yTop}" x2="${x0}" y2="${yBot}" stroke="${INK}" stroke-width="2"/>`,
      `<line x1="${x0}" y1="${yBot}" x2="${x1}" y2="${yBot}" stroke="${INK}" stroke-width="2"/>`,
      `<path d="${wavePts.join(" ")}" fill="none" stroke="${BLUE}" stroke-width="2.4"/>`,
      ...stems,
      svgText(x0 - 8, yTop + 4, vRangeLbl, { anchor: "end", size: 11, fill: INK, weight: "600" }),
      svgText(x0 - 8, yBot + 4, "0 V", { anchor: "end", size: 11, fill: MUTED }),
      svgSubLabel(x0 + (x1 - x0) * 0.25, yBot + 20, "T", "s", " (sample interval)", {
        size: 11,
        fill: RED,
        weight: "600",
      }),
      svgText(340, 344, "Time t", { size: 13, weight: "600" }),
      svgText(24, 178, "Voltage V / V", { size: 13, weight: "600", rotate: -90 }),
    ].join("");
  } else {
    title = "Amplitude-modulated radio frequency spectrum with carrier and sidebands";
    if (!hidden.has("carrierFreqKhz")) publicNumbers.push(fcKhz);
    if (!hidden.has("modulatingFreqKhz")) publicNumbers.push(fmKhz);
    const midX = (x0 + x1) / 2;
    const sbOffset = 104;
    const fmOffset = 196;

    const fcLabel = hidden.has("carrierFreqKhz")
      ? "f₀"
      : `${fmtTick(fcKhz)} kHz`;
    publicLabels.push(fcLabel);

    body = [
      svgText(320, 26, "Modulated Carrier Frequency Spectrum", {
        size: 14,
        weight: "700",
      }),
      `<line x1="${x0}" y1="${yTop}" x2="${x0}" y2="${yBot}" stroke="${INK}" stroke-width="2"/>`,
      `<line x1="${x0}" y1="${yBot}" x2="${x1}" y2="${yBot}" stroke="${INK}" stroke-width="2"/>`,
      // Outer FM deviation envelope dashed bracket
      `<rect x="${fc(midX - fmOffset)}" y="196" width="${fc(fmOffset * 2)}" height="100" fill="#f1f5f9" fill-opacity="0.55" stroke="${MUTED}" stroke-width="1.4" stroke-dasharray="6 4"/>`,
      svgText(midX + fmOffset - 6, 214, "FM band span", {
        anchor: "end",
        size: 11,
        fill: MUTED,
        weight: "600",
      }),
      // Carrier spike
      `<line x1="${fc(midX)}" y1="${yBot}" x2="${fc(midX)}" y2="86" stroke="${BLUE}" stroke-width="4"/>`,
      // AM Sidebands
      `<line x1="${fc(midX - sbOffset)}" y1="${yBot}" x2="${fc(midX - sbOffset)}" y2="162" stroke="${RED}" stroke-width="3.2"/>`,
      `<line x1="${fc(midX + sbOffset)}" y1="${yBot}" x2="${fc(midX + sbOffset)}" y2="162" stroke="${RED}" stroke-width="3.2"/>`,
      // Bandwidth span arrow
      `<line x1="${fc(midX - sbOffset)}" y1="138" x2="${fc(midX + sbOffset)}" y2="138" stroke="${GREEN}" stroke-width="2" stroke-dasharray="4 3"/>`,
      svgText(midX, 128, "AM bandwidth = 2 fM".replace("fM", "fₘ"), {
        size: 12,
        fill: GREEN,
        weight: "700",
      }),
      svgText(midX, 76, "Carrier", { size: 12, fill: BLUE, weight: "700" }),
      svgText(midX - sbOffset, 154, "LSB", { size: 12, fill: RED, weight: "700" }),
      svgText(midX + sbOffset, 154, "USB", { size: 12, fill: RED, weight: "700" }),
      svgText(midX, yBot + 18, fcLabel, { size: 12, fill: BLUE, weight: "700" }),
      svgText(midX - sbOffset, yBot + 18, "f₀ − fₘ", { size: 11, fill: RED }),
      svgText(midX + sbOffset, yBot + 18, "f₀ + fₘ", { size: 11, fill: RED }),
      svgText(340, 344, "Frequency f / kHz", { size: 13, weight: "600" }),
      svgText(28, 178, "Relative amplitude", {
        size: 13,
        weight: "600",
        rotate: -90,
      }),
    ].join("");
  }

  return {
    visualFamily: "waves",
    svgMarkup: wrapSvg({ title, body }),
    rendererVersion: ALEVEL_OPT_EE_RENDERER_VERSION,
    publicNumbers,
    publicLabels,
  };
}

/* ========================================================================== */
/*  Exported 14 DomainKindPlugins (Spec D)                                    */
/* ========================================================================== */

export const ALEVEL_OPTIONS_ENG_ELEC_PLUGINS: readonly DomainKindPlugin[] = [
  {
    domain: "mechanics",
    kind: "al-opt-eng-moment-inertia-suvat",
    summary:
      "AQA 3.11 rotational inertia I = sum(m r^2), angular SUVAT, torque T = I alpha = F r, bearing friction, work W = T theta, power P = T omega, and rotational KE.",
    requiredFields: MOMENT_INERTIA_SUVAT_FIELDS,
    physicalConstraints: [
      "hubInertiaKgM2 > 0, rimRadiusM > 0, durationS > 0, forceRadiusM > 0",
      "drive mode requires finalRevPerSec > initialRevPerSec; brake mode requires initialRevPerSec > finalRevPerSec and |I*alpha| > frictionTorqueNm",
    ],
    probeSpecs: [
      {
        kind: "al-opt-eng-moment-inertia-suvat",
        mode: "drive",
        hubInertiaKgM2: 0.45,
        rimMassCount: 4,
        rimMassKg: 0.8,
        rimRadiusM: 0.35,
        initialRevPerSec: 2.0,
        finalRevPerSec: 10.0,
        durationS: 8.0,
        frictionTorqueNm: 0.6,
        forceRadiusM: 0.35,
      },
      {
        kind: "al-opt-eng-moment-inertia-suvat",
        mode: "brake",
        hubInertiaKgM2: 1.2,
        rimMassCount: 6,
        rimMassKg: 1.5,
        rimRadiusM: 0.4,
        initialRevPerSec: 15.0,
        finalRevPerSec: 3.0,
        durationS: 12.0,
        frictionTorqueNm: 1.4,
        forceRadiusM: 0.3,
      },
    ],
    validate: validateMomentInertiaSuvat,
    solve: solveMomentInertiaSuvat,
    renderSvg: renderMomentInertiaSuvatSvg,
  },
  {
    domain: "mechanics",
    kind: "al-opt-eng-flywheel-kers",
    summary:
      "AQA 3.11 flywheel energy exchange 0.5 I (w1^2 - w2^2), KERS hill-climb energy balance with g = 9.81 m s^-2, turning-moment T vs theta smoothing, and composite rim design.",
    requiredFields: FLYWHEEL_KERS_FIELDS,
    physicalConstraints: [
      "flywheelInertiaKgM2 > 0, omegaMaxRadS > omegaMinRadS >= 0",
      "peakTorqueNm > meanLoadTorqueNm > 0",
    ],
    probeSpecs: [
      {
        kind: "al-opt-eng-flywheel-kers",
        mode: "kers",
        flywheelInertiaKgM2: 1.8,
        omegaMaxRadS: 600,
        omegaMinRadS: 200,
        vehicleMassKg: 1200,
        slopeHeightM: 18,
        dragForceN: 240,
        travelDistanceM: 300,
        meanLoadTorqueNm: 85,
        peakTorqueNm: 320,
      },
      {
        kind: "al-opt-eng-flywheel-kers",
        mode: "engine-smoothing",
        flywheelInertiaKgM2: 4.5,
        omegaMaxRadS: 165,
        omegaMinRadS: 145,
        vehicleMassKg: 950,
        slopeHeightM: 10,
        dragForceN: 180,
        travelDistanceM: 120,
        meanLoadTorqueNm: 110,
        peakTorqueNm: 410,
      },
    ],
    validate: validateFlywheelKers,
    solve: solveFlywheelKers,
    renderSvg: renderFlywheelKersSvg,
  },
  {
    domain: "mechanics",
    kind: "al-opt-eng-angular-momentum-impulse",
    summary:
      "AQA 3.11 conservation of angular momentum I1 w1 = I2 w2 (coaxial clutch with thermal loss, retracting radial pods) and signed angular impulse T dt = delta(I w) in N m s.",
    requiredFields: ANGULAR_MOMENTUM_IMPULSE_FIELDS,
    physicalConstraints: [
      "inertia1KgM2 > 0, inertia2KgM2 > 0, impulseDurationS > 0",
      "angular-impulse mode requires omega2RadS !== omega1RadS",
    ],
    probeSpecs: [
      {
        kind: "al-opt-eng-angular-momentum-impulse",
        mode: "coaxial-clutch",
        inertia1KgM2: 0.8,
        omega1RadS: 45,
        inertia2KgM2: 1.2,
        omega2RadS: 0,
        impulseDurationS: 0.6,
      },
      {
        kind: "al-opt-eng-angular-momentum-impulse",
        mode: "retracting-arms",
        inertia1KgM2: 18,
        omega1RadS: 2.5,
        inertia2KgM2: 7.5,
        omega2RadS: 0,
        impulseDurationS: 4.0,
      },
      {
        kind: "al-opt-eng-angular-momentum-impulse",
        mode: "angular-impulse",
        inertia1KgM2: 2.4,
        omega1RadS: 18,
        inertia2KgM2: 2.4,
        omega2RadS: -12,
        impulseDurationS: 1.5,
      },
    ],
    validate: validateAngularMomentumImpulse,
    solve: solveAngularMomentumImpulse,
    renderSvg: renderAngularMomentumImpulseSvg,
  },
  {
    domain: "thermal",
    kind: "al-opt-eng-first-law-adiabatic",
    summary:
      "AQA 3.11 First Law Q = delta U + W (work BY gas), isothermal pV = const, adiabatic pV^gamma = const, isobaric and isochoric ideal-gas processes.",
    requiredFields: FIRST_LAW_ADIABATIC_FIELDS,
    optionalFields: [{ name: "p2Ratio", type: "number", bounds: "> 0" }],
    physicalConstraints: [
      "p1Pa > 0, v1M3 > 0, v2M3 > 0, moles > 0, 1.05 < gamma <= 2.0",
      "non-isochoric modes require v2M3 !== v1M3",
    ],
    probeSpecs: [
      {
        kind: "al-opt-eng-first-law-adiabatic",
        processType: "adiabatic",
        p1Pa: 4.5e5,
        v1M3: 1.2e-3,
        v2M3: 3.6e-3,
        gamma: 1.4,
        moles: 0.15,
      },
      {
        kind: "al-opt-eng-first-law-adiabatic",
        processType: "isothermal",
        p1Pa: 2.4e5,
        v1M3: 2.5e-3,
        v2M3: 5.0e-3,
        gamma: 1.4,
        moles: 0.2,
      },
    ],
    validate: validateFirstLawAdiabatic,
    solve: solveFirstLawAdiabatic,
    renderSvg: renderFirstLawAdiabaticSvg,
  },
  {
    domain: "thermal",
    kind: "al-opt-eng-otto-diesel-engines",
    summary:
      "AQA 3.11 four-stroke Otto and Diesel indicator p-V cycles, cycles/s = (rev/s)/2, indicated/brake/friction/input power, and thermal, mechanical & overall efficiencies.",
    requiredFields: OTTO_DIESEL_FIELDS,
    physicalConstraints: [
      "four-stroke firing frequency equals engineSpeedRevS / 2",
      "0 < brakePowerW < indicatedPowerW < inputPowerW",
    ],
    probeSpecs: [
      {
        kind: "al-opt-eng-otto-diesel-engines",
        mode: "otto",
        loopAreaJ: 420,
        engineSpeedRevS: 60,
        cylinders: 4,
        outputTorqueNm: 105,
        calorificValueJPerKg: 4.4e7,
        fuelFlowRateKgS: 3.2e-3,
        compressionRatio: 10.0,
      },
      {
        kind: "al-opt-eng-otto-diesel-engines",
        mode: "diesel",
        loopAreaJ: 680,
        engineSpeedRevS: 40,
        cylinders: 6,
        outputTorqueNm: 260,
        calorificValueJPerKg: 4.3e7,
        fuelFlowRateKgS: 4.5e-3,
        compressionRatio: 18.0,
      },
    ],
    validate: validateOttoDiesel,
    solve: solveOttoDiesel,
    renderSvg: renderOttoDieselSvg,
  },
  {
    domain: "thermal",
    kind: "al-opt-eng-carnot-cop-heatpump",
    summary:
      "AQA 3.11 Carnot maximum efficiency (T_H - T_C)/T_H in kelvin, CHP utilisation, and reversed heat-engine COP_hp and COP_ref analysis.",
    requiredFields: CARNOT_COP_FIELDS,
    physicalConstraints: [
      "hotTempK > coldTempK > 0 (kelvin only)",
      "actual heat-engine efficiency <= Carnot limit; heat pump 1 < COP <= T_H/(T_H-T_C)",
    ],
    probeSpecs: [
      {
        kind: "al-opt-eng-carnot-cop-heatpump",
        mode: "heat-engine",
        hotTempK: 750,
        coldTempK: 300,
        workJ: 1800,
        actualHeatTransferJ: 4500,
      },
      {
        kind: "al-opt-eng-carnot-cop-heatpump",
        mode: "heat-pump",
        hotTempK: 298,
        coldTempK: 278,
        workJ: 1200,
        actualHeatTransferJ: 5400,
      },
      {
        kind: "al-opt-eng-carnot-cop-heatpump",
        mode: "refrigerator",
        hotTempK: 295,
        coldTempK: 265,
        workJ: 500,
        actualHeatTransferJ: 2100,
      },
    ],
    validate: validateCarnotCop,
    solve: solveCarnotCop,
    renderSvg: renderCarnotCopSvg,
  },
  {
    domain: "circuits",
    kind: "al-opt-elec-discrete-semiconductors",
    summary:
      "AQA 3.13 discrete semiconductor devices: reverse-biased Zener shunt voltage regulator (R_s and no-load P_Z), enhancement MOSFET switching + flyback diode, and photoconductive photodiode.",
    requiredFields: DISCRETE_SEMI_FIELDS,
    optionalFields: [
      { name: "zenerVoltageV", type: "number", unit: "V", bounds: "< supplyVoltageV" },
      { name: "minZenerCurrentMa", type: "number", unit: "mA", bounds: "> 0" },
      { name: "loadCurrentMa", type: "number", unit: "mA", bounds: ">= 0" },
      { name: "seriesResistorOhm", type: "number", unit: "Ohm", bounds: "> 0" },
      { name: "mosfetThresholdV", type: "number", unit: "V", bounds: "> 0" },
      { name: "gateVoltageV", type: "number", unit: "V", bounds: ">= 0" },
      { name: "loadResistanceOhm", type: "number", unit: "Ohm", bounds: "> 0" },
      { name: "photodiodeCurrentUa", type: "number", unit: "uA", bounds: "> 0" },
      { name: "senseResistorKohm", type: "number", unit: "kOhm", bounds: "> 0" },
    ],
    physicalConstraints: [
      "supplyVoltageV > zenerVoltageV > 0 in zener-regulator mode",
      "senseResistorVoltageV < supplyVoltageV in photodiode-sensor mode",
    ],
    probeSpecs: [
      {
        kind: "al-opt-elec-discrete-semiconductors",
        mode: "zener-regulator",
        supplyVoltageV: 12.0,
        zenerVoltageV: 5.6,
        minZenerCurrentMa: 5.0,
        loadCurrentMa: 35.0,
        seriesResistorOhm: 160,
      },
      {
        kind: "al-opt-elec-discrete-semiconductors",
        mode: "mosfet-driver",
        supplyVoltageV: 12.0,
        mosfetThresholdV: 2.4,
        gateVoltageV: 5.0,
        loadResistanceOhm: 15.0,
      },
      {
        kind: "al-opt-elec-discrete-semiconductors",
        mode: "photodiode-sensor",
        supplyVoltageV: 9.0,
        photodiodeCurrentUa: 42.0,
        senseResistorKohm: 120,
      },
    ],
    validate: validateDiscreteSemi,
    solve: solveDiscreteSemi,
    renderSvg: renderDiscreteSemiSvg,
  },
  {
    domain: "circuits",
    kind: "al-opt-elec-opamp-inverting-noninv",
    summary:
      "AQA 3.13 ideal op-amp, inverting (G = -R_f/R_in, virtual earth) and non-inverting (G = 1 + R_f/R_1) amplifiers with strict ±V_sat clipping and Gain-Bandwidth Product.",
    requiredFields: OPAMP_INV_NONINV_FIELDS,
    physicalConstraints: [
      "rInKohm > 0, rFeedbackKohm > 0, vSatV > 0, gbpHz > 0",
      "output clamps strictly to ±vSatV whenever |G * V_in| > vSatV",
    ],
    probeSpecs: [
      {
        kind: "al-opt-elec-opamp-inverting-noninv",
        mode: "inverting",
        rInKohm: 10,
        rFeedbackKohm: 120,
        vInMv: 450,
        vSatV: 13.0,
        gbpHz: 1.2e6,
      },
      {
        kind: "al-opt-elec-opamp-inverting-noninv",
        mode: "non-inverting",
        rInKohm: 4.7,
        rFeedbackKohm: 42.3,
        vInMv: 1800,
        vSatV: 12.0,
        gbpHz: 1.0e6,
      },
    ],
    validate: validateOpampInvNoninv,
    solve: solveOpampInvNoninv,
    renderSvg: renderOpampInvNoninvSvg,
  },
  {
    domain: "circuits",
    kind: "al-opt-elec-opamp-summing-diff",
    summary:
      "AQA 3.13 op-amp summing amplifier via virtual-earth KCL, balanced 4-resistor difference amplifier, and open-loop voltage comparator with strict ±V_sat saturation.",
    requiredFields: OPAMP_SUM_DIFF_FIELDS,
    physicalConstraints: [
      "rFeedbackKohm > 0, r1Kohm > 0, r2Kohm > 0, r3Kohm >= 0, vSatV > 0",
      "comparator mode requires v2V !== v1V",
    ],
    probeSpecs: [
      {
        kind: "al-opt-elec-opamp-summing-diff",
        mode: "summing",
        rFeedbackKohm: 60,
        r1Kohm: 15,
        r2Kohm: 30,
        r3Kohm: 60,
        v1V: 0.8,
        v2V: 1.2,
        v3V: -0.5,
        vSatV: 12.0,
      },
      {
        kind: "al-opt-elec-opamp-summing-diff",
        mode: "difference",
        rFeedbackKohm: 100,
        r1Kohm: 5,
        r2Kohm: 5,
        r3Kohm: 0,
        v1V: 2.15,
        v2V: 2.45,
        v3V: 0,
        vSatV: 12.0,
      },
      {
        kind: "al-opt-elec-opamp-summing-diff",
        mode: "comparator",
        rFeedbackKohm: 10,
        r1Kohm: 10,
        r2Kohm: 10,
        r3Kohm: 0,
        v1V: 4.2,
        v2V: 4.8,
        v3V: 0,
        vSatV: 13.5,
      },
    ],
    validate: validateOpampSumDiff,
    solve: solveOpampSumDiff,
    renderSvg: renderOpampSumDiffSvg,
  },
  {
    domain: "circuits",
    kind: "al-opt-elec-lc-resonance-filters",
    summary:
      "AQA 3.13 LC tuned resonance f0 = 1/(2 pi sqrt(LC)), quality factor Q = f0 / f_B with bandwidth strictly at 0.707 V_max, and parallel vs series LC impedance.",
    requiredFields: LC_RESONANCE_FIELDS,
    physicalConstraints: [
      "inductanceUh > 0, capacitancePf > 0, qFactor in [5, 200], vMaxV > 0",
      "half-power bandwidth level is strictly V_max / sqrt(2) = 0.707 V_max",
    ],
    probeSpecs: [
      {
        kind: "al-opt-elec-lc-resonance-filters",
        mode: "parallel-lc",
        inductanceUh: 220,
        capacitancePf: 180,
        qFactor: 45,
        vMaxV: 8.0,
      },
      {
        kind: "al-opt-elec-lc-resonance-filters",
        mode: "series-lc",
        inductanceUh: 470,
        capacitancePf: 120,
        qFactor: 60,
        vMaxV: 6.0,
      },
    ],
    validate: validateLcResonance,
    solve: solveLcResonance,
    renderSvg: renderLcResonanceSvg,
  },
  {
    domain: "circuits",
    kind: "al-opt-elec-timing-astable-555",
    summary:
      "AQA 3.13 555 astable (t_H = 0.7(R1+R2)C, t_L = 0.7 R2 C, mark:space, PRF), 555 monostable (T = 1.1 RC), and Schmitt-trigger NOT-gate RC oscillator hysteresis.",
    requiredFields: TIMING_555_FIELDS,
    physicalConstraints: [
      "r1Kohm > 0, r2Kohm > 0, capacitanceUf > 0, supplyVoltageV > 0",
      "AQA 555 astable uses 0.7 factor; monostable uses 1.1 factor",
    ],
    probeSpecs: [
      {
        kind: "al-opt-elec-timing-astable-555",
        mode: "555-astable",
        r1Kohm: 12,
        r2Kohm: 24,
        capacitanceUf: 10,
        supplyVoltageV: 9.0,
      },
      {
        kind: "al-opt-elec-timing-astable-555",
        mode: "555-monostable",
        r1Kohm: 47,
        r2Kohm: 10,
        capacitanceUf: 22,
        supplyVoltageV: 12.0,
      },
      {
        kind: "al-opt-elec-timing-astable-555",
        mode: "schmitt-astable",
        r1Kohm: 18,
        r2Kohm: 18,
        capacitanceUf: 4.7,
        supplyVoltageV: 9.0,
      },
    ],
    validate: validateTiming555,
    solve: solveTiming555,
    renderSvg: renderTiming555Svg,
  },
  {
    domain: "pure-calculation",
    kind: "al-opt-elec-combinational-logic",
    summary:
      "AQA 3.13 2- and 3-input combinational logic gate networks, truth tables, Boolean algebra, De Morgan simplification, explicit EOR (not-A.B + A.not-B), and universal NAND-only synthesis.",
    requiredFields: COMBINATIONAL_LOGIC_FIELDS,
    physicalConstraints: [
      "circuitId in supported 6 gate topologies; inputA, inputB, inputC in {0, 1}",
    ],
    probeSpecs: [
      {
        kind: "al-opt-elec-combinational-logic",
        circuitId: "demorgan-nand-equiv",
        inputA: 1,
        inputB: 0,
        inputC: 0,
      },
      {
        kind: "al-opt-elec-combinational-logic",
        circuitId: "eor-from-gates",
        inputA: 1,
        inputB: 0,
        inputC: 0,
      },
      {
        kind: "al-opt-elec-combinational-logic",
        circuitId: "three-input-simplify",
        inputA: 1,
        inputB: 0,
        inputC: 1,
      },
    ],
    validate: validateCombinationalLogic,
    solve: solveCombinationalLogic,
    renderSvg: renderCombinationalLogicSvg,
  },
  {
    domain: "graphs",
    kind: "al-opt-elec-sequential-counters",
    summary:
      "AQA 3.13 edge-triggered D-type flip-flop frequency division, binary ripple counters f/2^n, modulo-N / BCD reset decoding, and Johnson decade counters with multi-row timing SVG.",
    requiredFields: SEQUENTIAL_COUNTERS_FIELDS,
    physicalConstraints: [
      "clockFreqHz > 0, numStages in 2..5, moduloN in 4..32, pulseCount in 1..1000",
      "binary-ripple requires moduloN === 2^numStages; modulo-n-bcd requires moduloN <= 2^numStages",
    ],
    probeSpecs: [
      {
        kind: "al-opt-elec-sequential-counters",
        mode: "binary-ripple",
        clockFreqHz: 1600,
        numStages: 4,
        moduloN: 16,
        pulseCount: 25,
      },
      {
        kind: "al-opt-elec-sequential-counters",
        mode: "modulo-n-bcd",
        clockFreqHz: 500,
        numStages: 4,
        moduloN: 10,
        pulseCount: 37,
      },
      {
        kind: "al-opt-elec-sequential-counters",
        mode: "johnson-decade",
        clockFreqHz: 200,
        numStages: 5,
        moduloN: 10,
        pulseCount: 14,
      },
    ],
    validate: validateSequentialCounters,
    solve: solveSequentialCounters,
    renderSvg: renderSequentialCountersSvg,
  },
  {
    domain: "waves",
    kind: "al-opt-elec-adc-pcm-comms",
    summary:
      "AQA 3.13 ADC resolution Delta V = V_range / 2^n, Nyquist sampling f_s >= 2 f_max, PCM bit rate & TDM, regenerators, AM (2 f_M) vs FM (2(Delta f + f_M)) bandwidth, and transmission media/pathways.",
    requiredFields: ADC_PCM_COMMS_FIELDS,
    physicalConstraints: [
      "vRangeV > 0, adcBits in 3..16, maxAudioFreqHz > 0, samplingFreqHz > 0, tdmChannels in 1..64",
      "carrierFreqKhz > 0, freqDeviationKhz > 0, modulatingFreqKhz > 0, bandWidthAvailableKhz > 0",
    ],
    probeSpecs: [
      {
        kind: "al-opt-elec-adc-pcm-comms",
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
      },
      {
        kind: "al-opt-elec-adc-pcm-comms",
        mode: "am-fm-spectrum",
        vRangeV: 10.24,
        adcBits: 10,
        maxAudioFreqHz: 15000,
        samplingFreqHz: 40000,
        tdmChannels: 8,
        carrierFreqKhz: 1080,
        freqDeviationKhz: 75,
        modulatingFreqKhz: 15,
        bandWidthAvailableKhz: 1800,
      },
    ],
    validate: validateAdcPcmComms,
    solve: solveAdcPcmComms,
    renderSvg: renderAdcPcmCommsSvg,
  },
];

export const ALEVEL_OPTIONS_ENG_ELEC_PLUGINS_BY_KIND: Readonly<
  Record<string, DomainKindPlugin>
> = Object.fromEntries(ALEVEL_OPTIONS_ENG_ELEC_PLUGINS.map((p) => [p.kind, p]));
