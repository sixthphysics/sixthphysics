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
/*  AQA 7408 Data & Formulae Sheet v1.5 Constants                             */
/* -------------------------------------------------------------------------- */

export const ALEVEL_GRAVITY_MS2 = 9.81;
export const ALEVEL_SPEED_OF_LIGHT_MS = 3.0e8;
export const ALEVEL_PLANCK_JS = 6.63e-34;
export const ALEVEL_ELEMENTARY_CHARGE_C = 1.6e-19;
export const ALEVEL_ELECTRON_MASS_KG = 9.11e-31;
export const ALEVEL_NEWTON_G = 6.67e-11;
export const ALEVEL_STEFAN_BOLTZMANN = 5.67e-8;
export const ALEVEL_HUBBLE_KM_S_MPC = 65;
export const ALEVEL_PARSEC_M = 3.08e16;
export const ALEVEL_MPC_M = 3.08e22;
export const ALEVEL_LIGHT_YEAR_M = 9.46e15;
export const ALEVEL_AU_M = 1.5e11;
export const ALEVEL_SOLAR_MASS_KG = 1.99e30;
export const ALEVEL_EAR_THRESHOLD_I0 = 1.0e-12;
export const ALEVEL_MU_0 = 4 * Math.PI * 1e-7;
export const ALEVEL_EPSILON_0 = 8.85e-12;
export const ALEVEL_HYDROGEN_ION_SPECIFIC_CHARGE = 9.58e7;

export const ALEVEL_OPT_AM_RENDERER_VERSION =
  "sixthphysics/alevel-options-astromed-svg/1.0.0";

export const ALEVEL_OPTIONS_ASTROMED_KINDS = [
  "al-opt-astro-telescope-optics",
  "al-opt-astro-resolution-ccd",
  "al-opt-astro-magnitude-supernovae",
  "al-opt-astro-exoplanets-blackholes",
  "al-opt-med-eye-defects",
  "al-opt-med-retina-ear-db",
  "al-opt-med-ultrasound-ascan",
  "al-opt-med-xray-attenuation",
  "al-opt-med-nuclear-imaging",
  "al-opt-tp-thomson-em",
  "al-opt-tp-millikan-oildrop",
  "al-opt-tp-light-hertz-maxwell",
  "al-opt-tp-electron-microscopy",
  "al-opt-tp-michelson-relativity",
] as const;

export type AlevelOptionsAstromedKind =
  (typeof ALEVEL_OPTIONS_ASTROMED_KINDS)[number];

/* -------------------------------------------------------------------------- */
/*  Shared validation, formatting & XML/SVG helpers                           */
/* -------------------------------------------------------------------------- */

const SVG_W = 640;
const SVG_H = 360;
const SVG_FONT_SANS =
  "'Plus Jakarta Sans', 'Segoe UI', Helvetica, sans-serif";

const SUPERSCRIPT_MAP: Readonly<Record<string, string>> = {
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

function toSup(n: number | string): string {
  return [...String(n)].map((c) => SUPERSCRIPT_MAP[c] ?? c).join("");
}

function isNum(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function isPos(v: unknown): v is number {
  return isNum(v) && v > 0;
}

function inRange(v: unknown, min: number, max: number): v is number {
  return isNum(v) && v >= min && v <= max;
}

function escapeXml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function c(v: number): string {
  const r = Math.round(v * 100) / 100;
  return Object.is(r, -0) ? "0" : String(r);
}

function fmtVal(v: number, sf = 3): string {
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

function fmtTick(v: number): string {
  if (Math.abs(v) < 1e-9) return "0";
  const r = Math.round(v * 1000) / 1000;
  return r < 0 ? `−${Math.abs(r)}` : String(r);
}

function getHiddenSet(
  spec: Record<string, unknown>,
  options?: DomainRenderOptions,
): Set<string> {
  const set = new Set<string>();
  const sh = spec.hiddenQuantities;
  if (Array.isArray(sh)) {
    for (const item of sh) {
      if (typeof item === "string" && item.trim()) set.add(item.trim());
    }
  }
  if (options?.hiddenQuantities) {
    for (const item of options.hiddenQuantities) {
      if (typeof item === "string" && item.trim()) set.add(item.trim());
    }
  }
  return set;
}

function safeMarkerId(prefix: string, options?: DomainRenderOptions): string {
  const raw = (options?.id ?? "optam").replace(/[^A-Za-z0-9-]/g, "").slice(0, 22);
  return `${prefix}-${raw || "fig"}`;
}

function arrowMarkerDef(id: string, color: string): string {
  return `<marker id="${id}" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto-start-reverse"><path d="M 0 1 L 10 5 L 0 9 z" fill="${color}"/></marker>`;
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
    `<g font-family="${SVG_FONT_SANS}">`,
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
    weight?: string;
    rotate?: string;
    publicLabels?: string[];
  } = {},
): string {
  const clean = content.trim();
  if (opts.publicLabels && clean) {
    opts.publicLabels.push(clean);
  }
  const attrs = [
    `x="${c(x)}"`,
    `y="${c(y)}"`,
    `text-anchor="${opts.anchor ?? "middle"}"`,
    `font-size="${opts.size ?? 12.5}"`,
    `fill="${opts.fill ?? "#1e293b"}"`,
    opts.weight ? `font-weight="${opts.weight}"` : "",
    opts.rotate ? `transform="${opts.rotate}"` : "",
  ]
    .filter(Boolean)
    .join(" ");
  return `<text ${attrs}>${escapeXml(clean)}</text>`;
}

function checkKind(
  spec: Record<string, unknown>,
  expected: AlevelOptionsAstromedKind,
  issues: string[],
): void {
  if (spec.kind !== expected) {
    issues.push(`kind must be "${expected}"`);
  }
}

/* ========================================================================== */
/*  1. al-opt-astro-telescope-optics (Option 3.9 — Optics & SHM)              */
/* ========================================================================== */

function validateTelescopeOptics(
  spec: Record<string, unknown>,
): DomainValidationResult {
  const issues: string[] = [];
  checkKind(spec, "al-opt-astro-telescope-optics", issues);
  const mode = spec.mode;
  if (mode !== "refractor" && mode !== "cassegrain") {
    issues.push('mode must be "refractor" or "cassegrain"');
  }
  if (!inRange(spec.objectiveFocalLengthM, 0.2, 40)) {
    issues.push("objectiveFocalLengthM must be in [0.2, 40] m");
  }
  if (!inRange(spec.eyepieceFocalLengthM, 0.002, 0.5)) {
    issues.push("eyepieceFocalLengthM must be in [0.002, 0.5] m");
  }
  if (
    isPos(spec.objectiveFocalLengthM) &&
    isPos(spec.eyepieceFocalLengthM) &&
    spec.objectiveFocalLengthM <= spec.eyepieceFocalLengthM
  ) {
    issues.push("objectiveFocalLengthM must exceed eyepieceFocalLengthM");
  }
  if (!inRange(spec.apertureDiameterM, 0.03, 15)) {
    issues.push("apertureDiameterM must be in [0.03, 15] m");
  }
  if (spec.secondaryDiameterM !== undefined) {
    if (
      !isPos(spec.secondaryDiameterM) ||
      (isPos(spec.apertureDiameterM) &&
        spec.secondaryDiameterM >= spec.apertureDiameterM * 0.7)
    ) {
      issues.push("secondaryDiameterM must be positive and < 0.7 * apertureDiameterM");
    }
  }
  if (
    spec.lensBlueFocalM !== undefined ||
    spec.lensRedFocalM !== undefined
  ) {
    if (
      !isPos(spec.lensBlueFocalM) ||
      !isPos(spec.lensRedFocalM) ||
      spec.lensBlueFocalM >= spec.lensRedFocalM
    ) {
      issues.push("lensBlueFocalM and lensRedFocalM must be positive with f_blue < f_red");
    }
  }
  return { valid: issues.length === 0, issues };
}

function solveTelescopeOptics(spec: Record<string, unknown>): DomainSolveOutput {
  const mode = spec.mode === "cassegrain" ? "cassegrain" : "refractor";
  const fo = Number(spec.objectiveFocalLengthM);
  const fe = Number(spec.eyepieceFocalLengthM);
  const D = Number(spec.apertureDiameterM);

  const angularMagnification = fo / fe;
  const tubeLengthM = fo + fe;
  const fNumber = fo / D;
  const collectingAreaM2 = Math.PI * (D / 2) ** 2;

  const quantities: VerifiedQuantityMap = {
    objectiveFocalLengthM: fo,
    eyepieceFocalLengthM: fe,
    apertureDiameterM: D,
    angularMagnification,
    tubeLengthM,
    fNumber,
    collectingAreaM2,
    primaryMirrorShape:
      mode === "cassegrain"
        ? "concave parabolic primary mirror and convex secondary mirror"
        : "converging objective lens and converging eyepiece lens",
    imageNature: "virtual inverted image formed at infinity",
    aberrationClassification:
      mode === "cassegrain"
        ? "free from chromatic aberration and parabolic primary eliminates spherical aberration"
        : "chromatic aberration because blue light refracts more strongly than red light",
    lorComparisonAnchor:
      "collecting power proportional to aperture diameter squared",
  };

  if (isPos(spec.secondaryDiameterM)) {
    const ds = spec.secondaryDiameterM;
    const blockageFraction = (ds / D) ** 2;
    quantities.secondaryDiameterM = ds;
    quantities.blockageFraction = blockageFraction;
    quantities.blockagePercent = blockageFraction * 100;
    quantities.effectiveCollectingAreaM2 = collectingAreaM2 * (1 - blockageFraction);
  }
  if (isPos(spec.lensBlueFocalM) && isPos(spec.lensRedFocalM)) {
    quantities.chromaticSpreadM = spec.lensRedFocalM - spec.lensBlueFocalM;
    quantities.chromaticSpreadMm =
      (spec.lensRedFocalM - spec.lensBlueFocalM) * 1000;
  }

  return {
    solverId: "sixthphysics/al-opt-astro-telescope-optics/1.0.0",
    quantities,
    publicNumbers: [fo, fe, D],
  };
}

function renderTelescopeOptics(
  spec: Record<string, unknown>,
  options?: DomainRenderOptions,
): DomainRenderOutput {
  const hidden = getHiddenSet(spec, options);
  const mode = spec.mode === "cassegrain" ? "cassegrain" : "refractor";
  const fo = Number(spec.objectiveFocalLengthM);
  const fe = Number(spec.eyepieceFocalLengthM);
  const D = Number(spec.apertureDiameterM);
  const publicNumbers: number[] = [];
  const publicLabels: string[] = [];
  const arrBlue = safeMarkerId("ray-b", options);
  const arrRed = safeMarkerId("ray-r", options);
  const defs = [
    arrowMarkerDef(arrBlue, "#1d4ed8"),
    arrowMarkerDef(arrRed, "#dc2626"),
  ].join("");

  const parts: string[] = [];
  if (mode === "refractor") {
    // Optical axis
    parts.push(
      `<line x1="36" y1="184" x2="604" y2="184" stroke="#64748b" stroke-width="1.4" stroke-dasharray="6,4"/>`,
    );
    // Objective lens (x=150) & Eyepiece lens (x=475)
    parts.push(
      `<path d="M 150 68 Q 168 184 150 300 Q 132 184 150 68 Z" fill="#e0f2fe" stroke="#0369a1" stroke-width="2.2"/>`,
      `<path d="M 475 112 Q 489 184 475 256 Q 461 184 475 112 Z" fill="#e0f2fe" stroke="#0369a1" stroke-width="2.2"/>`,
    );
    // Shared focal plane F_o = F_e at x=385
    parts.push(
      `<line x1="385" y1="78" x2="385" y2="294" stroke="#94a3b8" stroke-width="1.2" stroke-dasharray="4,4"/>`,
      `<circle cx="385" cy="184" r="3.5" fill="#0f172a"/>`,
    );
    // Three parallel off-axis rays arriving from top-left, crossing at (385, 224), emerging parallel from eyepiece
    const yObj = [108, 146, 184];
    const focusY = 228;
    const slopeOut = (focusY - 184) / (475 - 385);
    for (const yo of yObj) {
      const yStart = yo - 24;
      const yEye = yo + ((focusY - yo) * (475 - 150)) / (385 - 150);
      const yEnd = yEye - slopeOut * 95;
      parts.push(
        `<line x1="48" y1="${c(yStart)}" x2="150" y2="${c(yo)}" stroke="#1d4ed8" stroke-width="2" marker-end="url(#${arrBlue})"/>`,
        `<line x1="150" y1="${c(yo)}" x2="475" y2="${c(yEye)}" stroke="#1d4ed8" stroke-width="2"/>`,
        `<line x1="475" y1="${c(yEye)}" x2="570" y2="${c(yEnd)}" stroke="#1d4ed8" stroke-width="2" marker-end="url(#${arrBlue})"/>`,
      );
    }
    // Focal distance brackets
    parts.push(
      `<line x1="150" y1="318" x2="385" y2="318" stroke="#334155" stroke-width="1.5"/>`,
      `<line x1="150" y1="312" x2="150" y2="324" stroke="#334155" stroke-width="1.5"/>`,
      `<line x1="385" y1="312" x2="385" y2="324" stroke="#334155" stroke-width="1.5"/>`,
      `<line x1="385" y1="318" x2="475" y2="318" stroke="#334155" stroke-width="1.5"/>`,
      `<line x1="475" y1="312" x2="475" y2="324" stroke="#334155" stroke-width="1.5"/>`,
    );
    const foLabel = hidden.has("objectiveFocalLengthM")
      ? "fₒ"
      : (publicNumbers.push(fo), `fₒ = ${fmtVal(fo)} m`);
    const feLabel = hidden.has("eyepieceFocalLengthM")
      ? "fₑ"
      : (publicNumbers.push(fe), `fₑ = ${fmtVal(fe)} m`);
    const dLabel = hidden.has("apertureDiameterM")
      ? "Aperture D"
      : (publicNumbers.push(D), `D = ${fmtVal(D)} m`);

    parts.push(
      svgText(320, 28, "Astronomical Refracting Telescope (Normal Adjustment)", {
        size: 14,
        weight: "700",
        publicLabels,
      }),
      svgText(150, 56, "Objective lens", { size: 12, weight: "600", publicLabels }),
      svgText(475, 98, "Eyepiece lens", { size: 12, weight: "600", publicLabels }),
      svgText(385, 70, "Fₒ = Fₑ", { size: 12, fill: "#0369a1", weight: "600", publicLabels }),
      svgText(267, 338, foLabel, { size: 12.5, weight: "600", publicLabels }),
      svgText(430, 338, feLabel, { size: 12.5, weight: "600", publicLabels }),
      svgText(92, 294, dLabel, { size: 12, fill: "#475569", publicLabels }),
      svgText(582, 168, "Eye", { size: 12, fill: "#0f172a", weight: "600", publicLabels }),
    );
  } else {
    // Cassegrain reflecting telescope
    parts.push(
      `<line x1="44" y1="184" x2="604" y2="184" stroke="#64748b" stroke-width="1.4" stroke-dasharray="6,4"/>`,
      // Outer telescope tube outline
      `<line x1="76" y1="72" x2="492" y2="72" stroke="#94a3b8" stroke-width="2"/>`,
      `<line x1="76" y1="296" x2="492" y2="296" stroke="#94a3b8" stroke-width="2"/>`,
      // Concave parabolic primary mirror (upper and lower halves leaving central hole y=166..202)
      `<path d="M 464 76 Q 492 122 496 164" fill="none" stroke="#0f172a" stroke-width="5.5" stroke-linecap="round"/>`,
      `<path d="M 496 204 Q 492 246 464 292" fill="none" stroke="#0f172a" stroke-width="5.5" stroke-linecap="round"/>`,
      // Convex secondary mirror at x=210
      `<path d="M 212 148 Q 226 184 212 220" fill="none" stroke="#0369a1" stroke-width="5" stroke-linecap="round"/>`,
      // Eyepiece lens behind central aperture at x=548
      `<path d="M 548 160 Q 556 184 548 208 Q 540 184 548 160 Z" fill="#e0f2fe" stroke="#0369a1" stroke-width="2"/>`,
      // Upper and lower incoming parallel rays -> primary -> secondary -> central hole -> eyepiece
      `<line x1="56" y1="104" x2="474" y2="104" stroke="#1d4ed8" stroke-width="2.1" marker-end="url(#${arrBlue})"/>`,
      `<line x1="474" y1="104" x2="218" y2="162" stroke="#1d4ed8" stroke-width="2.1" marker-end="url(#${arrBlue})"/>`,
      `<line x1="218" y1="162" x2="544" y2="184" stroke="#dc2626" stroke-width="2.1" marker-end="url(#${arrRed})"/>`,
      `<line x1="56" y1="264" x2="474" y2="264" stroke="#1d4ed8" stroke-width="2.1" marker-end="url(#${arrBlue})"/>`,
      `<line x1="474" y1="264" x2="218" y2="206" stroke="#1d4ed8" stroke-width="2.1" marker-end="url(#${arrBlue})"/>`,
      `<line x1="218" y1="206" x2="544" y2="184" stroke="#dc2626" stroke-width="2.1" marker-end="url(#${arrRed})"/>`,
    );
    const dLabel = hidden.has("apertureDiameterM")
      ? "Aperture D"
      : (publicNumbers.push(D), `Primary aperture D = ${fmtVal(D)} m`);

    parts.push(
      svgText(320, 28, "Cassegrain Reflecting Telescope", {
        size: 14,
        weight: "700",
        publicLabels,
      }),
      svgText(462, 58, "Primary mirror", { size: 12, weight: "600", publicLabels }),
      svgText(214, 134, "Secondary mirror", {
        size: 12,
        fill: "#0369a1",
        weight: "600",
        publicLabels,
      }),
      svgText(554, 148, "Eyepiece", { size: 12, weight: "600", publicLabels }),
      svgText(510, 232, "Central hole", { size: 11.5, fill: "#475569", publicLabels }),
      svgText(320, 332, dLabel, { size: 12.5, weight: "600", publicLabels }),
      svgText(118, 94, "Parallel rays", { size: 11.5, fill: "#1d4ed8", publicLabels }),
    );
  }

  return {
    visualFamily: "optics-shm",
    svgMarkup: wrapSvg({
      title:
        mode === "cassegrain"
          ? "Cassegrain reflecting telescope optical path"
          : "Astronomical refracting telescope ray diagram",
      defs,
      body: parts.join(""),
    }),
    rendererVersion: ALEVEL_OPT_AM_RENDERER_VERSION,
    publicNumbers,
    publicLabels,
  };
}

/* ========================================================================== */
/*  2. al-opt-astro-resolution-ccd (Option 3.9 — Waves)                       */
/* ========================================================================== */

function validateResolutionCcd(
  spec: Record<string, unknown>,
): DomainValidationResult {
  const issues: string[] = [];
  checkKind(spec, "al-opt-astro-resolution-ccd", issues);
  if (spec.mode !== "airy-rayleigh" && spec.mode !== "aperture-compare") {
    issues.push('mode must be "airy-rayleigh" or "aperture-compare"');
  }
  if (!inRange(spec.wavelengthM, 1e-12, 30)) {
    issues.push("wavelengthM must be in [1e-12, 30] m");
  }
  if (!inRange(spec.apertureDiameterM, 0.01, 600)) {
    issues.push("apertureDiameterM must be in [0.01, 600] m");
  }
  if (spec.distanceM !== undefined && !isPos(spec.distanceM)) {
    issues.push("distanceM must be positive");
  }
  if (
    spec.secondApertureDiameterM !== undefined &&
    !inRange(spec.secondApertureDiameterM, 0.01, 600)
  ) {
    issues.push("secondApertureDiameterM must be in [0.01, 600] m");
  }
  if (
    spec.secondWavelengthM !== undefined &&
    !inRange(spec.secondWavelengthM, 1e-12, 30)
  ) {
    issues.push("secondWavelengthM must be in [1e-12, 30] m");
  }
  return { valid: issues.length === 0, issues };
}

function solveResolutionCcd(spec: Record<string, unknown>): DomainSolveOutput {
  const lam = Number(spec.wavelengthM);
  const D = Number(spec.apertureDiameterM);
  const rayleighAngleRad = lam / D; // Strict AQA: theta ≈ lambda / D (NOT 1.22 lambda/D)
  const rayleighAngleArcsec = rayleighAngleRad * (180 / Math.PI) * 3600;
  const collectingAreaM2 = Math.PI * (D / 2) ** 2;
  const meshToleranceM = lam / 20;
  const ccdQe = isPos(spec.ccdQuantumEfficiencyPct)
    ? spec.ccdQuantumEfficiencyPct
    : 75;
  const eyeQe = isPos(spec.eyeQuantumEfficiencyPct)
    ? spec.eyeQuantumEfficiencyPct
    : 1;

  const quantities: VerifiedQuantityMap = {
    wavelengthM: lam,
    apertureDiameterM: D,
    rayleighAngleRad,
    rayleighAngleArcsec,
    collectingAreaM2,
    meshToleranceM,
    qeAdvantageFactor: ccdQe / eyeQe,
    rayleighCriterionRule:
      "central maximum of one diffraction pattern coincides with the first minimum of the other",
    ccdAdvantageAnchor:
      "much higher quantum efficiency linear response and wider spectral sensitivity than the human eye",
    atmospherePositioningAnchor:
      "optical and radio waves pass through atmospheric windows whereas infrared ultraviolet and X-rays are absorbed",
    lorComparisonAnchor:
      "collecting power is proportional to diameter squared while minimum angular resolution equals wavelength divided by diameter",
  };

  if (isPos(spec.distanceM)) {
    const linearResolutionM = spec.distanceM * rayleighAngleRad;
    quantities.distanceM = spec.distanceM;
    quantities.linearResolutionM = linearResolutionM;
    quantities.linearResolutionKm = linearResolutionM / 1000;
  }
  if (isPos(spec.secondApertureDiameterM)) {
    const d2 = spec.secondApertureDiameterM;
    const lam2 = isPos(spec.secondWavelengthM) ? spec.secondWavelengthM : lam;
    const theta2 = lam2 / d2;
    quantities.secondApertureDiameterM = d2;
    quantities.collectingPowerRatio = (d2 / D) ** 2;
    quantities.secondRayleighAngleRad = theta2;
    quantities.resolutionAngleRatio = theta2 / rayleighAngleRad;
  }

  return {
    solverId: "sixthphysics/al-opt-astro-resolution-ccd/1.0.0",
    quantities,
    publicNumbers: [lam, D],
  };
}

function renderResolutionCcd(
  spec: Record<string, unknown>,
  options?: DomainRenderOptions,
): DomainRenderOutput {
  const hidden = getHiddenSet(spec, options);
  const mode = spec.mode === "aperture-compare" ? "aperture-compare" : "airy-rayleigh";
  const lam = Number(spec.wavelengthM);
  const D = Number(spec.apertureDiameterM);
  const publicNumbers: number[] = [];
  const publicLabels: string[] = [];
  const parts: string[] = [];

  if (mode === "airy-rayleigh") {
    const ox = 86;
    const oy = 278;
    const pw = 480;
    const ph = 186;
    const sinc2 = (u: number): number => {
      if (Math.abs(u) < 1e-6) return 1;
      const x = Math.PI * u;
      const s = Math.sin(x) / x;
      return s * s;
    };
    // Axes
    parts.push(
      `<line x1="${ox}" y1="${oy}" x2="${ox + pw}" y2="${oy}" stroke="#334155" stroke-width="1.8"/>`,
      `<line x1="${ox}" y1="${oy}" x2="${ox}" y2="${oy - ph - 18}" stroke="#334155" stroke-width="1.8"/>`,
    );
    const pts1: string[] = [];
    const pts2: string[] = [];
    const ptsSum: string[] = [];
    const uMin = -2.2;
    const uMax = 3.2;
    const nSteps = 160;
    for (let i = 0; i <= nSteps; i += 1) {
      const u = uMin + ((uMax - uMin) * i) / nSteps;
      const px = ox + ((u - uMin) / (uMax - uMin)) * pw;
      const i1 = sinc2(u);
      const i2 = sinc2(u - 1.0);
      const iSum = i1 + i2;
      const y1 = oy - i1 * ph;
      const y2 = oy - i2 * ph;
      const yS = oy - Math.min(1.15, iSum) * ph;
      pts1.push(`${c(px)},${c(y1)}`);
      pts2.push(`${c(px)},${c(y2)}`);
      ptsSum.push(`${c(px)},${c(yS)}`);
    }
    const xPeak1 = ox + ((0 - uMin) / (uMax - uMin)) * pw;
    const xPeak2 = ox + ((1 - uMin) / (uMax - uMin)) * pw;
    parts.push(
      `<polyline points="${pts1.join(" ")}" fill="none" stroke="#1d4ed8" stroke-width="2.2"/>`,
      `<polyline points="${pts2.join(" ")}" fill="none" stroke="#0d9488" stroke-width="2.2"/>`,
      `<polyline points="${ptsSum.join(" ")}" fill="none" stroke="#dc2626" stroke-width="1.8" stroke-dasharray="5,4"/>`,
      `<line x1="${c(xPeak1)}" y1="${c(oy - ph)}" x2="${c(xPeak1)}" y2="${oy}" stroke="#94a3b8" stroke-width="1.2" stroke-dasharray="3,3"/>`,
      `<line x1="${c(xPeak2)}" y1="${c(oy - ph)}" x2="${c(xPeak2)}" y2="${oy}" stroke="#94a3b8" stroke-width="1.2" stroke-dasharray="3,3"/>`,
      `<line x1="${c(xPeak1)}" y1="68" x2="${c(xPeak2)}" y2="68" stroke="#0f172a" stroke-width="1.6"/>`,
      `<line x1="${c(xPeak1)}" y1="62" x2="${c(xPeak1)}" y2="74" stroke="#0f172a" stroke-width="1.6"/>`,
      `<line x1="${c(xPeak2)}" y1="62" x2="${c(xPeak2)}" y2="74" stroke="#0f172a" stroke-width="1.6"/>`,
    );
    parts.push(
      svgText(320, 26, "Rayleigh Criterion: Overlapping Airy Diffraction Peaks", {
        size: 14,
        weight: "700",
        publicLabels,
      }),
      svgText((xPeak1 + xPeak2) / 2, 58, "θ ≈ λ / D", {
        size: 13,
        weight: "700",
        fill: "#0f172a",
        publicLabels,
      }),
      svgText(ox + pw / 2, 314, "Angular position θ", {
        size: 12.5,
        weight: "600",
        publicLabels,
      }),
      svgText(34, oy - ph / 2, "Relative intensity", {
        size: 12.5,
        weight: "600",
        rotate: `rotate(-90 34 ${c(oy - ph / 2)})`,
        publicLabels,
      }),
      svgText(xPeak1, 296, "Source 1", { size: 11.5, fill: "#1d4ed8", publicLabels }),
      svgText(xPeak2, 296, "Source 2", { size: 11.5, fill: "#0d9488", publicLabels }),
      svgText(494, 88, "Combined profile", {
        size: 11.5,
        fill: "#dc2626",
        publicLabels,
      }),
    );
  } else {
    const d2 = isPos(spec.secondApertureDiameterM)
      ? spec.secondApertureDiameterM
      : D * 4;
    // Atmospheric window bar at top
    parts.push(
      `<rect x="52" y="46" width="536" height="32" rx="6" fill="#f1f5f9" stroke="#cbd5e1" stroke-width="1.4"/>`,
      `<rect x="132" y="46" width="84" height="32" fill="#dbeafe" stroke="#3b82f6" stroke-width="1.2"/>`,
      `<rect x="404" y="46" width="150" height="32" fill="#dcfce7" stroke="#16a34a" stroke-width="1.2"/>`,
    );
    // Left: Optical reflector dish
    parts.push(
      `<path d="M 104 236 Q 170 278 236 236" fill="none" stroke="#1d4ed8" stroke-width="5" stroke-linecap="round"/>`,
      `<line x1="104" y1="292" x2="236" y2="292" stroke="#334155" stroke-width="1.5"/>`,
      `<line x1="104" y1="286" x2="104" y2="298" stroke="#334155" stroke-width="1.5"/>`,
      `<line x1="236" y1="286" x2="236" y2="298" stroke="#334155" stroke-width="1.5"/>`,
      `<rect x="158" y="160" width="24" height="14" rx="2" fill="#1e293b"/>`,
      `<line x1="120" y1="112" x2="120" y2="244" stroke="#60a5fa" stroke-width="1.6" stroke-dasharray="4,3"/>`,
      `<line x1="220" y1="112" x2="220" y2="244" stroke="#60a5fa" stroke-width="1.6" stroke-dasharray="4,3"/>`,
    );
    // Right: Large wire-mesh radio dish
    parts.push(
      `<path d="M 332 214 Q 456 290 580 214" fill="none" stroke="#047857" stroke-width="5" stroke-dasharray="9,4" stroke-linecap="round"/>`,
      `<line x1="332" y1="292" x2="580" y2="292" stroke="#334155" stroke-width="1.5"/>`,
      `<line x1="332" y1="286" x2="332" y2="298" stroke="#334155" stroke-width="1.5"/>`,
      `<line x1="580" y1="286" x2="580" y2="298" stroke="#334155" stroke-width="1.5"/>`,
      `<circle cx="456" cy="152" r="8" fill="#047857"/>`,
      `<line x1="358" y1="228" x2="456" y2="152" stroke="#64748b" stroke-width="1.6"/>`,
      `<line x1="554" y1="228" x2="456" y2="152" stroke="#64748b" stroke-width="1.6"/>`,
    );
    const d1Lbl = hidden.has("apertureDiameterM")
      ? "D₁"
      : (publicNumbers.push(D), `D₁ = ${fmtVal(D)} m`);
    const d2Lbl = hidden.has("secondApertureDiameterM")
      ? "D₂"
      : (publicNumbers.push(d2), `D₂ = ${fmtVal(d2)} m`);
    const lamLbl = hidden.has("wavelengthM")
      ? "λ"
      : (publicNumbers.push(lam), `λ₁ = ${fmtVal(lam)} m`);

    parts.push(
      svgText(320, 26, "Optical vs Radio Telescope Apertures & Atmospheric Windows", {
        size: 13.5,
        weight: "700",
        publicLabels,
      }),
      svgText(92, 66, "γ / X / UV", { size: 11, fill: "#64748b", publicLabels }),
      svgText(174, 66, "Optical", { size: 11.5, fill: "#1d4ed8", weight: "600", publicLabels }),
      svgText(308, 66, "IR (mostly absorbed)", { size: 11, fill: "#64748b", publicLabels }),
      svgText(479, 66, "Radio window", { size: 11.5, fill: "#15803d", weight: "600", publicLabels }),
      svgText(170, 146, "CCD detector", { size: 11.5, fill: "#1e293b", publicLabels }),
      svgText(170, 316, d1Lbl, { size: 12.5, weight: "600", publicLabels }),
      svgText(170, 338, lamLbl, { size: 11.5, fill: "#475569", publicLabels }),
      svgText(456, 134, "Receiver antenna", { size: 11.5, fill: "#047857", publicLabels }),
      svgText(456, 316, d2Lbl, { size: 12.5, weight: "600", publicLabels }),
      svgText(456, 338, "Wire mesh dish", { size: 11.5, fill: "#475569", publicLabels }),
    );
  }

  return {
    visualFamily: "waves",
    svgMarkup: wrapSvg({
      title:
        mode === "aperture-compare"
          ? "Optical and radio telescope aperture comparison"
          : "Rayleigh resolution criterion diffraction profile",
      body: parts.join(""),
    }),
    rendererVersion: ALEVEL_OPT_AM_RENDERER_VERSION,
    publicNumbers,
    publicLabels,
  };
}

/* ========================================================================== */
/*  3. al-opt-astro-magnitude-supernovae (Option 3.9 — Grav-Astro)            */
/* ========================================================================== */

function validateMagnitudeSupernovae(
  spec: Record<string, unknown>,
): DomainValidationResult {
  const issues: string[] = [];
  checkKind(spec, "al-opt-astro-magnitude-supernovae", issues);
  if (
    spec.mode !== "supernova-lightcurve" &&
    spec.mode !== "hubble-expansion"
  ) {
    issues.push('mode must be "supernova-lightcurve" or "hubble-expansion"');
  }
  if (!inRange(spec.apparentMagnitude, -30, 30)) {
    issues.push("apparentMagnitude must be in [-30, 30]");
  }
  if (!inRange(spec.absoluteMagnitude, -25, 20)) {
    issues.push("absoluteMagnitude must be in [-25, 20]");
  }
  if (
    spec.secondApparentMagnitude !== undefined &&
    !inRange(spec.secondApparentMagnitude, -30, 30)
  ) {
    issues.push("secondApparentMagnitude must be in [-30, 30]");
  }
  if (spec.redshiftZ !== undefined && !inRange(spec.redshiftZ, 0.0005, 0.5)) {
    issues.push("redshiftZ must be in [0.0005, 0.5]");
  }
  if (
    spec.hubbleConstantKmSMpc !== undefined &&
    !inRange(spec.hubbleConstantKmSMpc, 50, 90)
  ) {
    issues.push("hubbleConstantKmSMpc must be in [50, 90] km s⁻¹ Mpc⁻¹");
  }
  return { valid: issues.length === 0, issues };
}

function solveMagnitudeSupernovae(
  spec: Record<string, unknown>,
): DomainSolveOutput {
  const m = Number(spec.apparentMagnitude);
  const M = Number(spec.absoluteMagnitude);
  const H = isPos(spec.hubbleConstantKmSMpc)
    ? spec.hubbleConstantKmSMpc
    : ALEVEL_HUBBLE_KM_S_MPC;

  const distancePc = 10 * Math.pow(10, (m - M) / 5);
  const distanceMpc = distancePc / 1e6;
  const distanceLy = distancePc * (ALEVEL_PARSEC_M / ALEVEL_LIGHT_YEAR_M);
  const hubbleSI = (H * 1000) / ALEVEL_MPC_M;
  const hubbleAgeS = 1 / hubbleSI;
  const hubbleAgeGyr = hubbleAgeS / (365.25 * 86400 * 1e9);

  const quantities: VerifiedQuantityMap = {
    apparentMagnitude: m,
    absoluteMagnitude: M,
    distanceModulus: m - M,
    distancePc,
    distanceMpc,
    distanceLy,
    hubbleConstantKmSMpc: H,
    hubbleConstantSI: hubbleSI,
    hubbleAgeS,
    hubbleAgeGyr,
    standardCandleAnchor:
      "consistent peak absolute magnitude because white dwarfs explode at the same Chandrasekhar mass limit",
    darkEnergyAnchor:
      "distant type Ia supernovae are dimmer than predicted indicating accelerating expansion driven by dark energy",
    lorCosmologyAnchor:
      "distance modulus from type Ia peak absolute magnitude and recession velocity from spectral redshift determine the Hubble constant",
  };

  if (isNum(spec.secondApparentMagnitude)) {
    const m2 = spec.secondApparentMagnitude;
    quantities.secondApparentMagnitude = m2;
    quantities.brightnessRatio = Math.pow(2.51, m2 - m);
  }
  if (isPos(spec.redshiftZ)) {
    const z = spec.redshiftZ;
    const recessionSpeedKmS = (z * ALEVEL_SPEED_OF_LIGHT_MS) / 1000;
    const hubbleDistanceMpc = recessionSpeedKmS / H;
    quantities.redshiftZ = z;
    quantities.recessionSpeedKmS = recessionSpeedKmS;
    quantities.hubbleDistanceMpc = hubbleDistanceMpc;
  }

  return {
    solverId: "sixthphysics/al-opt-astro-magnitude-supernovae/1.0.0",
    quantities,
    publicNumbers: [H],
  };
}

function renderMagnitudeSupernovae(
  spec: Record<string, unknown>,
  options?: DomainRenderOptions,
): DomainRenderOutput {
  const hidden = getHiddenSet(spec, options);
  const mode =
    spec.mode === "hubble-expansion" ? "hubble-expansion" : "supernova-lightcurve";
  const publicNumbers: number[] = [];
  const publicLabels: string[] = [];
  const parts: string[] = [];

  const ox = 92;
  const oy = 286;
  const pw = 486;
  const ph = 212;

  if (mode === "supernova-lightcurve") {
    // Axes: x = time (0..250 days), y = Absolute magnitude M (-14 at bottom to -20 at top)
    parts.push(
      `<line x1="${ox}" y1="${oy}" x2="${ox + pw}" y2="${oy}" stroke="#334155" stroke-width="1.8"/>`,
      `<line x1="${ox}" y1="${oy}" x2="${ox}" y2="${oy - ph}" stroke="#334155" stroke-width="1.8"/>`,
    );
    for (const day of [0, 50, 100, 150, 200, 250]) {
      const px = ox + (day / 250) * pw;
      parts.push(
        `<line x1="${c(px)}" y1="${oy - ph}" x2="${c(px)}" y2="${oy}" stroke="#e2e8f0" stroke-width="1"/>`,
        `<line x1="${c(px)}" y1="${oy}" x2="${c(px)}" y2="${oy + 5}" stroke="#334155" stroke-width="1.4"/>`,
        svgText(px, oy + 20, String(day), { size: 11.5, publicLabels }),
      );
      publicNumbers.push(day);
    }
    for (const mag of [-14, -16, -18, -20]) {
      const py = oy - ((-14 - mag) / 6) * ph;
      parts.push(
        `<line x1="${ox}" y1="${c(py)}" x2="${ox + pw}" y2="${c(py)}" stroke="#e2e8f0" stroke-width="1"/>`,
        `<line x1="${ox - 5}" y1="${c(py)}" x2="${ox}" y2="${c(py)}" stroke="#334155" stroke-width="1.4"/>`,
        svgText(ox - 10, py + 4, fmtTick(mag), {
          anchor: "end",
          size: 11.5,
          publicLabels,
        }),
      );
      publicNumbers.push(mag);
    }
    // Classic Type Ia light curve peaking near t=20 days, M=-19.3
    const curvePts: Array<[number, number]> = [
      [0, -14.2],
      [8, -17.5],
      [15, -19.0],
      [20, -19.3],
      [28, -19.0],
      [42, -17.9],
      [60, -16.8],
      [90, -16.1],
      [140, -15.4],
      [200, -14.7],
      [245, -14.2],
    ];
    const poly = curvePts
      .map(([d, mag]) => {
        const px = ox + (d / 250) * pw;
        const py = oy - ((-14 - mag) / 6) * ph;
        return `${c(px)},${c(py)}`;
      })
      .join(" ");
    const peakX = ox + (20 / 250) * pw;
    const peakY = oy - ((-14 - -19.3) / 6) * ph;
    parts.push(
      `<polyline points="${poly}" fill="none" stroke="#1d4ed8" stroke-width="2.8" stroke-linejoin="round"/>`,
      `<circle cx="${c(peakX)}" cy="${c(peakY)}" r="4.5" fill="#dc2626"/>`,
      `<line x1="${ox}" y1="${c(peakY)}" x2="${c(peakX)}" y2="${c(peakY)}" stroke="#dc2626" stroke-width="1.3" stroke-dasharray="4,3"/>`,
    );
    const peakLabel = hidden.has("absoluteMagnitude")
      ? "Peak M"
      : "Peak M ≈ −19.3";
    if (!hidden.has("absoluteMagnitude")) publicNumbers.push(-19.3);

    parts.push(
      svgText(320, 28, "Type Ia Supernova Standard Candle Light Curve", {
        size: 14,
        weight: "700",
        publicLabels,
      }),
      svgText(peakX + 74, peakY + 4, peakLabel, {
        size: 12,
        fill: "#dc2626",
        weight: "600",
        publicLabels,
      }),
      svgText(ox + pw / 2, 336, "Time after explosion / days", {
        size: 12.5,
        weight: "600",
        publicLabels,
      }),
      svgText(34, oy - ph / 2, "Absolute magnitude M", {
        size: 12.5,
        weight: "600",
        rotate: `rotate(-90 34 ${c(oy - ph / 2)})`,
        publicLabels,
      }),
    );
  } else {
    // Hubble v vs d plot (d: 0..400 Mpc, v: 0..26000 km s^-1)
    const H = isPos(spec.hubbleConstantKmSMpc)
      ? spec.hubbleConstantKmSMpc
      : ALEVEL_HUBBLE_KM_S_MPC;
    const dMax = 400;
    const vMax = 28000;
    parts.push(
      `<line x1="${ox}" y1="${oy}" x2="${ox + pw}" y2="${oy}" stroke="#334155" stroke-width="1.8"/>`,
      `<line x1="${ox}" y1="${oy}" x2="${ox}" y2="${oy - ph}" stroke="#334155" stroke-width="1.8"/>`,
    );
    for (const d of [0, 100, 200, 300, 400]) {
      const px = ox + (d / dMax) * pw;
      parts.push(
        `<line x1="${c(px)}" y1="${oy - ph}" x2="${c(px)}" y2="${oy}" stroke="#e2e8f0" stroke-width="1"/>`,
        svgText(px, oy + 20, String(d), { size: 11.5, publicLabels }),
      );
      publicNumbers.push(d);
    }
    for (const v of [0, 7000, 14000, 21000, 28000]) {
      const py = oy - (v / vMax) * ph;
      parts.push(
        `<line x1="${ox}" y1="${c(py)}" x2="${ox + pw}" y2="${c(py)}" stroke="#e2e8f0" stroke-width="1"/>`,
        svgText(ox - 10, py + 4, String(v), {
          anchor: "end",
          size: 11.5,
          publicLabels,
        }),
      );
      publicNumbers.push(v);
    }
    const yEndLin = oy - ((H * dMax) / vMax) * ph;
    parts.push(
      `<line x1="${ox}" y1="${oy}" x2="${ox + pw}" y2="${c(yEndLin)}" stroke="#1d4ed8" stroke-width="2.5"/>`,
    );
    // Representative galaxy survey points along Hubble line
    const sampleDs = [55, 118, 175, 240, 315, 370];
    const offsets = [420, -510, 360, -440, 520, -390];
    for (let i = 0; i < sampleDs.length; i += 1) {
      const px = ox + (sampleDs[i] / dMax) * pw;
      const py = oy - ((H * sampleDs[i] + offsets[i]) / vMax) * ph;
      parts.push(`<circle cx="${c(px)}" cy="${c(py)}" r="4" fill="#0f172a"/>`);
    }
    // Dashed accelerating curve hint
    const accPts: string[] = [];
    for (let i = 0; i <= 40; i += 1) {
      const d = (dMax * i) / 40;
      const v = H * d * (1 - 0.14 * (d / dMax) ** 2);
      accPts.push(`${c(ox + (d / dMax) * pw)},${c(oy - (v / vMax) * ph)}`);
    }
    parts.push(
      `<polyline points="${accPts.join(" ")}" fill="none" stroke="#dc2626" stroke-width="1.8" stroke-dasharray="6,4"/>`,
      svgText(320, 28, "Hubble Recession Velocity vs Distance", {
        size: 14,
        weight: "700",
        publicLabels,
      }),
      svgText(462, 102, "Linear Hubble law", {
        size: 11.5,
        fill: "#1d4ed8",
        weight: "600",
        publicLabels,
      }),
      svgText(486, 152, "High-z deviation", {
        size: 11.5,
        fill: "#dc2626",
        publicLabels,
      }),
      svgText(ox + pw / 2, 336, "Distance d / Mpc", {
        size: 12.5,
        weight: "600",
        publicLabels,
      }),
      svgText(28, oy - ph / 2, "Recession speed v / km s⁻¹", {
        size: 12.5,
        weight: "600",
        rotate: `rotate(-90 28 ${c(oy - ph / 2)})`,
        publicLabels,
      }),
    );
  }

  return {
    visualFamily: "grav-astro",
    svgMarkup: wrapSvg({
      title:
        mode === "hubble-expansion"
          ? "Hubble recession velocity versus distance plot"
          : "Type Ia supernova light curve",
      body: parts.join(""),
    }),
    rendererVersion: ALEVEL_OPT_AM_RENDERER_VERSION,
    publicNumbers,
    publicLabels,
  };
}

/* ========================================================================== */
/*  4. al-opt-astro-exoplanets-blackholes (Option 3.9 — Grav-Astro)           */
/* ========================================================================== */

function validateExoplanetsBlackholes(
  spec: Record<string, unknown>,
): DomainValidationResult {
  const issues: string[] = [];
  checkKind(spec, "al-opt-astro-exoplanets-blackholes", issues);
  if (spec.mode === "transit") {
    if (!inRange(spec.starRadiusM, 5e7, 5e11)) {
      issues.push("starRadiusM must be in [5e7, 5e11] m");
    }
    if (
      !isPos(spec.planetRadiusM) ||
      (isPos(spec.starRadiusM) && spec.planetRadiusM >= 0.4 * spec.starRadiusM)
    ) {
      issues.push("planetRadiusM must be positive and < 0.4 * starRadiusM");
    }
    if (!inRange(spec.orbitalPeriodDays, 0.2, 2000)) {
      issues.push("orbitalPeriodDays must be in [0.2, 2000] days");
    }
    if (
      spec.stellarWobbleSpeedMs !== undefined &&
      !inRange(spec.stellarWobbleSpeedMs, 0.1, 5000)
    ) {
      issues.push("stellarWobbleSpeedMs must be in [0.1, 5000] m s⁻¹");
    }
  } else if (spec.mode === "blackhole-quasar") {
    if (!inRange(spec.blackHoleMassSolar, 1, 1e11)) {
      issues.push("blackHoleMassSolar must be in [1, 1e11] solar masses");
    }
    if (
      spec.quasarRedshiftZ !== undefined &&
      !inRange(spec.quasarRedshiftZ, 0.01, 10)
    ) {
      issues.push("quasarRedshiftZ must be in [0.01, 10]");
    }
    if (
      spec.restWavelengthNm !== undefined &&
      !inRange(spec.restWavelengthNm, 100, 1200)
    ) {
      issues.push("restWavelengthNm must be in [100, 1200] nm");
    }
  } else {
    issues.push('mode must be "transit" or "blackhole-quasar"');
  }
  return { valid: issues.length === 0, issues };
}

function solveExoplanetsBlackholes(
  spec: Record<string, unknown>,
): DomainSolveOutput {
  const quantities: VerifiedQuantityMap = {
    transitLimitationAnchor:
      "orbital plane must align closely with the line of sight from Earth",
    radialVelocityAnchor:
      "periodic Doppler shift of stellar absorption lines caused by orbit around the common centre of mass",
    quasarOriginAnchor:
      "supermassive black hole accreting matter at the centre of a distant active galaxy",
    lorQuasarAnchor:
      "large cosmological redshift implies immense distance and vast luminosity from a compact solar system sized active galactic nucleus",
  };
  const publicNumbers: number[] = [];

  if (spec.mode === "transit") {
    const rs = Number(spec.starRadiusM);
    const rp = Number(spec.planetRadiusM);
    const periodDays = Number(spec.orbitalPeriodDays);
    const ratio = rp / rs;
    const dipFraction = ratio * ratio;
    quantities.starRadiusM = rs;
    quantities.planetRadiusM = rp;
    quantities.orbitalPeriodDays = periodDays;
    quantities.orbitalPeriodS = periodDays * 86400;
    quantities.radiusRatio = ratio;
    quantities.transitDipFraction = dipFraction;
    quantities.transitDipPercent = dipFraction * 100;
    quantities.minRelativeIntensity = 1 - dipFraction;
    publicNumbers.push(periodDays);

    if (isPos(spec.stellarWobbleSpeedMs)) {
      const vw = spec.stellarWobbleSpeedMs;
      const refNm = isPos(spec.referenceWavelengthNm)
        ? spec.referenceWavelengthNm
        : 589;
      const dLamNm = refNm * (vw / ALEVEL_SPEED_OF_LIGHT_MS);
      quantities.stellarWobbleSpeedMs = vw;
      quantities.referenceWavelengthNm = refNm;
      quantities.dopplerShiftNm = dLamNm;
      quantities.dopplerShiftPm = dLamNm * 1000;
    }
  } else {
    const mSol = Number(spec.blackHoleMassSolar);
    const mKg = mSol * ALEVEL_SOLAR_MASS_KG;
    const rS =
      (2 * ALEVEL_NEWTON_G * mKg) / (ALEVEL_SPEED_OF_LIGHT_MS ** 2);
    quantities.blackHoleMassSolar = mSol;
    quantities.blackHoleMassKg = mKg;
    quantities.schwarzschildRadiusM = rS;
    quantities.schwarzschildRadiusKm = rS / 1000;
    quantities.schwarzschildRadiusAU = rS / ALEVEL_AU_M;
    publicNumbers.push(mSol);

    if (isPos(spec.quasarRedshiftZ)) {
      const z = spec.quasarRedshiftZ;
      const restNm = isPos(spec.restWavelengthNm) ? spec.restWavelengthNm : 486;
      quantities.quasarRedshiftZ = z;
      quantities.restWavelengthNm = restNm;
      quantities.observedWavelengthNm = restNm * (1 + z);
    }
  }

  return {
    solverId: "sixthphysics/al-opt-astro-exoplanets-blackholes/1.0.0",
    quantities,
    publicNumbers,
  };
}

function renderExoplanetsBlackholes(
  spec: Record<string, unknown>,
  options?: DomainRenderOptions,
): DomainRenderOutput {
  const hidden = getHiddenSet(spec, options);
  const mode = spec.mode === "blackhole-quasar" ? "blackhole-quasar" : "transit";
  const publicNumbers: number[] = [];
  const publicLabels: string[] = [];
  const parts: string[] = [];

  if (mode === "transit") {
    const period = Number(spec.orbitalPeriodDays);
    const ox = 88;
    const oy = 282;
    const pw = 492;
    const ph = 188;
    const yBase = oy - ph + 28;
    const yDip = oy - 62;
    parts.push(
      `<line x1="${ox}" y1="${oy}" x2="${ox + pw}" y2="${oy}" stroke="#334155" stroke-width="1.8"/>`,
      `<line x1="${ox}" y1="${oy}" x2="${ox}" y2="${oy - ph}" stroke="#334155" stroke-width="1.8"/>`,
      `<line x1="${ox}" y1="${c(yBase)}" x2="${ox + pw}" y2="${c(yBase)}" stroke="#e2e8f0" stroke-width="1" stroke-dasharray="4,3"/>`,
      `<line x1="${ox}" y1="${c(yDip)}" x2="${ox + pw}" y2="${c(yDip)}" stroke="#fecaca" stroke-width="1.2" stroke-dasharray="4,3"/>`,
    );
    // Two periodic flat-bottomed dips
    const x1L = ox + 86;
    const x1R = ox + 146;
    const x2L = ox + 322;
    const x2R = ox + 382;
    const poly = [
      [ox + 6, yBase],
      [x1L - 14, yBase],
      [x1L, yDip],
      [x1R, yDip],
      [x1R + 14, yBase],
      [x2L - 14, yBase],
      [x2L, yDip],
      [x2R, yDip],
      [x2R + 14, yBase],
      [ox + pw - 8, yBase],
    ]
      .map(([x, y]) => `${c(x)},${c(y)}`)
      .join(" ");
    parts.push(
      `<polyline points="${poly}" fill="none" stroke="#1d4ed8" stroke-width="2.6" stroke-linejoin="round"/>`,
      // Period bracket between dip centres
      `<line x1="${c((x1L + x1R) / 2)}" y1="${oy - 24}" x2="${c((x2L + x2R) / 2)}" y2="${oy - 24}" stroke="#0f172a" stroke-width="1.5"/>`,
      `<line x1="${c((x1L + x1R) / 2)}" y1="${oy - 30}" x2="${c((x1L + x1R) / 2)}" y2="${oy - 18}" stroke="#0f172a" stroke-width="1.5"/>`,
      `<line x1="${c((x2L + x2R) / 2)}" y1="${oy - 30}" x2="${c((x2L + x2R) / 2)}" y2="${oy - 18}" stroke="#0f172a" stroke-width="1.5"/>`,
      // Inset star + transiting exoplanet
      `<circle cx="526" cy="148" r="24" fill="#fde68a" stroke="#d97706" stroke-width="1.8"/>`,
      `<circle cx="520" cy="152" r="5.5" fill="#1e293b"/>`,
    );

    const tLabel = hidden.has("orbitalPeriodDays")
      ? "Period T"
      : (publicNumbers.push(period), `T = ${fmtVal(period)} d`);
    const dipHidden =
      hidden.has("transitDipFraction") ||
      hidden.has("transitDipPercent") ||
      hidden.has("minRelativeIntensity") ||
      hidden.has("planetRadiusM") ||
      hidden.has("radiusRatio");

    parts.push(
      svgText(320, 28, "Exoplanet Transit Light Curve", {
        size: 14,
        weight: "700",
        publicLabels,
      }),
      svgText(ox - 10, yBase + 4, "1.000", {
        anchor: "end",
        size: 11.5,
        publicLabels,
      }),
      svgText(ox - 10, yDip + 4, dipHidden ? "1 − ΔI/I" : "Min I", {
        anchor: "end",
        size: 11.5,
        fill: "#dc2626",
        publicLabels,
      }),
      svgText((x1L + x1R + x2L + x2R) / 4, oy - 32, tLabel, {
        size: 12,
        weight: "600",
        publicLabels,
      }),
      svgText(526, 188, "Planet silhouette", {
        size: 11,
        fill: "#475569",
        publicLabels,
      }),
      svgText(ox + pw / 2, 326, "Time / days", {
        size: 12.5,
        weight: "600",
        publicLabels,
      }),
      svgText(28, oy - ph / 2, "Relative intensity", {
        size: 12.5,
        weight: "600",
        rotate: `rotate(-90 28 ${c(oy - ph / 2)})`,
        publicLabels,
      }),
    );
    publicNumbers.push(1);
  } else {
    // Supermassive black hole / quasar schematic
    const arrRed = safeMarkerId("jet", options);
    const defs = arrowMarkerDef(arrRed, "#dc2626");
    parts.push(
      // Accretion disc ellipse
      `<ellipse cx="220" cy="192" rx="136" ry="34" fill="#fef3c7" stroke="#d97706" stroke-width="2.4"/>`,
      `<ellipse cx="220" cy="192" rx="88" ry="20" fill="#fed7aa" stroke="#ea580c" stroke-width="1.6"/>`,
      // Relativistic jets
      `<line x1="220" y1="164" x2="220" y2="62" stroke="#dc2626" stroke-width="3.2" marker-end="url(#${arrRed})"/>`,
      `<line x1="220" y1="220" x2="220" y2="322" stroke="#dc2626" stroke-width="3.2" marker-end="url(#${arrRed})"/>`,
      // Event horizon sphere
      `<circle cx="220" cy="192" r="30" fill="#0f172a"/>`,
      `<line x1="220" y1="192" x2="250" y2="192" stroke="#ffffff" stroke-width="1.8"/>`,
      // Right panel: spectral redshift bar
      `<rect x="404" y="96" width="194" height="176" rx="8" fill="#f8fafc" stroke="#cbd5e1" stroke-width="1.6"/>`,
      `<rect x="424" y="138" width="154" height="22" fill="#e2e8f0" stroke="#64748b" stroke-width="1.2"/>`,
      `<line x1="454" y1="138" x2="454" y2="160" stroke="#1d4ed8" stroke-width="3"/>`,
      `<rect x="424" y="206" width="154" height="22" fill="#e2e8f0" stroke="#64748b" stroke-width="1.2"/>`,
      `<line x1="534" y1="206" x2="534" y2="228" stroke="#dc2626" stroke-width="3"/>`,
      `<line x1="458" y1="184" x2="528" y2="184" stroke="#dc2626" stroke-width="2" marker-end="url(#${arrRed})"/>`,
    );
    parts.push(
      svgText(320, 28, "Active Galactic Nucleus (Quasar) & Event Horizon", {
        size: 14,
        weight: "700",
        publicLabels,
      }),
      svgText(236, 186, "Rₛ", { size: 12, fill: "#ffffff", weight: "700", publicLabels }),
      svgText(278, 84, "Relativistic jet", { size: 11.5, fill: "#dc2626", publicLabels }),
      svgText(118, 252, "Accretion disc", { size: 12, fill: "#b45309", weight: "600", publicLabels }),
      svgText(501, 124, "Laboratory line λ₀", { size: 11.5, fill: "#1d4ed8", publicLabels }),
      svgText(501, 248, "Quasar redshifted λ", { size: 11.5, fill: "#dc2626", publicLabels }),
      svgText(494, 178, "Large Δλ", { size: 11, fill: "#dc2626", publicLabels }),
    );
    return {
      visualFamily: "grav-astro",
      svgMarkup: wrapSvg({
        title: "Supermassive black hole quasar accretion disc and spectral redshift",
        defs,
        body: parts.join(""),
      }),
      rendererVersion: ALEVEL_OPT_AM_RENDERER_VERSION,
      publicNumbers,
      publicLabels,
    };
  }

  return {
    visualFamily: "grav-astro",
    svgMarkup: wrapSvg({
      title: "Exoplanet transit light curve diagram",
      body: parts.join(""),
    }),
    rendererVersion: ALEVEL_OPT_AM_RENDERER_VERSION,
    publicNumbers,
    publicLabels,
  };
}

/* ========================================================================== */
/*  5. al-opt-med-eye-defects (Option 3.10 — Optics & SHM)                    */
/* ========================================================================== */

function validateEyeDefects(
  spec: Record<string, unknown>,
): DomainValidationResult {
  const issues: string[] = [];
  checkKind(spec, "al-opt-med-eye-defects", issues);
  if (spec.mode === "myopia") {
    if (!inRange(spec.unaidedFarPointM, 0.25, 12)) {
      issues.push("unaidedFarPointM must be in [0.25, 12] m");
    }
    if (
      spec.unaidedNearPointM !== undefined &&
      (!inRange(spec.unaidedNearPointM, 0.04, 0.5) ||
        (isPos(spec.unaidedFarPointM) &&
          spec.unaidedNearPointM >= spec.unaidedFarPointM))
    ) {
      issues.push("unaidedNearPointM must be in [0.04, 0.5] m and < unaidedFarPointM");
    }
  } else if (spec.mode === "hypermetropia") {
    if (!inRange(spec.unaidedNearPointM, 0.28, 6)) {
      issues.push("unaidedNearPointM must be in [0.28, 6] m");
    }
    if (
      spec.targetNearPointM !== undefined &&
      !inRange(spec.targetNearPointM, 0.2, 0.35)
    ) {
      issues.push("targetNearPointM must be in [0.20, 0.35] m");
    }
  } else if (spec.mode === "astigmatism") {
    if (!isNum(spec.cylinderPowerD) || Math.abs(spec.cylinderPowerD) < 0.25) {
      issues.push("cylinderPowerD must be non-zero with |P| >= 0.25 D");
    }
    if (!inRange(spec.cylinderAxisDeg, 0, 180)) {
      issues.push("cylinderAxisDeg must be in [0, 180] deg");
    }
  } else {
    issues.push('mode must be "myopia", "hypermetropia", or "astigmatism"');
  }
  return { valid: issues.length === 0, issues };
}

function solveEyeDefects(spec: Record<string, unknown>): DomainSolveOutput {
  const quantities: VerifiedQuantityMap = {
    lorEyeAnchor:
      "forms a virtual intermediate image at the unaided far or near point rather than magnifying the object",
  };
  const publicNumbers: number[] = [];

  if (spec.mode === "myopia") {
    const dFar = Number(spec.unaidedFarPointM);
    const focalLengthM = -dFar;
    const correctivePowerD = 1 / focalLengthM;
    quantities.unaidedFarPointM = dFar;
    quantities.focalLengthM = focalLengthM;
    quantities.correctivePowerD = correctivePowerD;
    quantities.correctivePowerMagnitudeD = Math.abs(correctivePowerD);
    quantities.lensTypeAnchor = "diverging concave lens with negative power";
    quantities.defectCauseAnchor =
      "eyeball too long or eye lens too powerful focusing parallel rays in front of the retina";
    publicNumbers.push(dFar);

    if (isPos(spec.unaidedNearPointM)) {
      const dNear = spec.unaidedNearPointM;
      // 1/f = 1/u_new + 1/(-dNear) => 1/u_new = 1/f + 1/dNear
      const correctedNearPointM = 1 / (1 / focalLengthM + 1 / dNear);
      quantities.unaidedNearPointM = dNear;
      quantities.correctedNearPointM = correctedNearPointM;
      quantities.correctedNearPointCm = correctedNearPointM * 100;
      publicNumbers.push(dNear);
    }
  } else if (spec.mode === "hypermetropia") {
    const dNear = Number(spec.unaidedNearPointM);
    const uTarget = isPos(spec.targetNearPointM) ? spec.targetNearPointM : 0.25;
    // Real-is-positive: 1/f = 1/u + 1/v with u = +uTarget, v = -dNear
    const correctivePowerD = 1 / uTarget - 1 / dNear;
    const focalLengthM = 1 / correctivePowerD;
    quantities.unaidedNearPointM = dNear;
    quantities.targetNearPointM = uTarget;
    quantities.correctivePowerD = correctivePowerD;
    quantities.focalLengthM = focalLengthM;
    quantities.correctedFarPointM = focalLengthM;
    quantities.lensTypeAnchor = "converging convex lens with positive power";
    quantities.defectCauseAnchor =
      "eyeball too short or eye lens too weak focusing near rays behind the retina";
    publicNumbers.push(dNear, uTarget);
  } else {
    const pCyl = Number(spec.cylinderPowerD);
    const axis = Number(spec.cylinderAxisDeg);
    quantities.cylinderPowerD = pCyl;
    quantities.cylinderFocalLengthM = 1 / pCyl;
    quantities.cylinderAxisDeg = axis;
    quantities.lensTypeAnchor =
      "cylindrical lens specifying power and axis orientation";
    quantities.defectCauseAnchor =
      "cornea has different radii of curvature in perpendicular planes";
    publicNumbers.push(pCyl, axis);
  }

  return {
    solverId: "sixthphysics/al-opt-med-eye-defects/1.0.0",
    quantities,
    publicNumbers,
  };
}

function renderEyeDefects(
  spec: Record<string, unknown>,
  options?: DomainRenderOptions,
): DomainRenderOutput {
  const mode =
    spec.mode === "hypermetropia"
      ? "hypermetropia"
      : spec.mode === "astigmatism"
        ? "astigmatism"
        : "myopia";
  const publicNumbers: number[] = [];
  const publicLabels: string[] = [];
  const arrBlue = safeMarkerId("eye-b", options);
  const defs = arrowMarkerDef(arrBlue, "#1d4ed8");
  const parts: string[] = [];

  if (mode === "astigmatism") {
    // Two orthogonal meridians (vertical vs horizontal) focusing at different planes
    parts.push(
      `<line x1="44" y1="184" x2="596" y2="184" stroke="#64748b" stroke-width="1.3" stroke-dasharray="6,4"/>`,
      `<ellipse cx="448" cy="184" rx="112" ry="96" fill="#f8fafc" stroke="#334155" stroke-width="2.2"/>`,
      `<path d="M 358 122 Q 382 184 358 246 Q 344 184 358 122 Z" fill="#e0f2fe" stroke="#0369a1" stroke-width="2"/>`,
      // Cylindrical corrective lens at x=258
      `<rect x="250" y="108" width="16" height="152" rx="4" fill="#fef3c7" stroke="#d97706" stroke-width="2"/>`,
      // Vertical meridian rays (blue) vs horizontal meridian rays (red dashed)
      `<line x1="62" y1="132" x2="358" y2="132" stroke="#1d4ed8" stroke-width="2" marker-end="url(#${arrBlue})"/>`,
      `<line x1="358" y1="132" x2="560" y2="184" stroke="#1d4ed8" stroke-width="2"/>`,
      `<line x1="62" y1="236" x2="358" y2="236" stroke="#1d4ed8" stroke-width="2" marker-end="url(#${arrBlue})"/>`,
      `<line x1="358" y1="236" x2="560" y2="184" stroke="#1d4ed8" stroke-width="2"/>`,
      `<line x1="358" y1="146" x2="514" y2="184" stroke="#dc2626" stroke-width="1.8" stroke-dasharray="5,4"/>`,
      `<line x1="358" y1="222" x2="514" y2="184" stroke="#dc2626" stroke-width="1.8" stroke-dasharray="5,4"/>`,
      `<circle cx="514" cy="184" r="3.5" fill="#dc2626"/>`,
      `<circle cx="560" cy="184" r="3.5" fill="#1d4ed8"/>`,
      svgText(320, 28, "Astigmatism: Orthogonal Meridians & Cylindrical Correction", {
        size: 13.5,
        weight: "700",
        publicLabels,
      }),
      svgText(258, 94, "Cylindrical lens", { size: 12, fill: "#b45309", weight: "600", publicLabels }),
      svgText(358, 72, "Uneven cornea / lens", { size: 12, fill: "#0369a1", publicLabels }),
      svgText(560, 78, "Retina", { size: 12, weight: "600", publicLabels }),
      svgText(490, 316, "Red dashed: uncorrected meridian", { size: 11.5, fill: "#dc2626", publicLabels }),
      svgText(200, 316, "Blue solid: corrected focus on retina", { size: 11.5, fill: "#1d4ed8", publicLabels }),
    );
  } else {
    // Eyeball centred at (468, 184) with retina at x=568
    parts.push(
      `<line x1="40" y1="184" x2="598" y2="184" stroke="#64748b" stroke-width="1.3" stroke-dasharray="6,4"/>`,
      `<ellipse cx="468" cy="184" rx="100" ry="88" fill="#f8fafc" stroke="#334155" stroke-width="2.2"/>`,
      `<path d="M 384 128 Q 404 184 384 240 Q 370 184 384 128 Z" fill="#e0f2fe" stroke="#0369a1" stroke-width="2"/>`,
    );
    if (mode === "myopia") {
      // Diverging spectacle lens at x=282
      parts.push(
        `<path d="M 272 114 L 292 114 Q 282 184 292 254 L 272 254 Q 282 184 272 114 Z" fill="#dbeafe" stroke="#1d4ed8" stroke-width="2"/>`,
        // Parallel rays -> diverge at spectacle lens -> focus on retina (568, 184)
        `<line x1="58" y1="138" x2="282" y2="138" stroke="#1d4ed8" stroke-width="2.1" marker-end="url(#${arrBlue})"/>`,
        `<line x1="282" y1="138" x2="384" y2="124" stroke="#1d4ed8" stroke-width="2.1"/>`,
        `<line x1="384" y1="124" x2="568" y2="184" stroke="#1d4ed8" stroke-width="2.1"/>`,
        `<line x1="58" y1="230" x2="282" y2="230" stroke="#1d4ed8" stroke-width="2.1" marker-end="url(#${arrBlue})"/>`,
        `<line x1="282" y1="230" x2="384" y2="244" stroke="#1d4ed8" stroke-width="2.1"/>`,
        `<line x1="384" y1="244" x2="568" y2="184" stroke="#1d4ed8" stroke-width="2.1"/>`,
        // Virtual back-projection to unaided far point at x=128
        `<line x1="282" y1="138" x2="128" y2="184" stroke="#0369a1" stroke-width="1.4" stroke-dasharray="4,4"/>`,
        `<line x1="282" y1="230" x2="128" y2="184" stroke="#0369a1" stroke-width="1.4" stroke-dasharray="4,4"/>`,
        `<circle cx="128" cy="184" r="4" fill="#0369a1"/>`,
        // Unaided focus in front of retina (x=514)
        `<line x1="384" y1="138" x2="514" y2="184" stroke="#dc2626" stroke-width="1.6" stroke-dasharray="5,4"/>`,
        `<line x1="384" y1="230" x2="514" y2="184" stroke="#dc2626" stroke-width="1.6" stroke-dasharray="5,4"/>`,
        `<circle cx="514" cy="184" r="3.5" fill="#dc2626"/>`,
        svgText(320, 28, "Eye Optics: Distant-Ray Ray Trace & Corrective Spectacle Lens", {
          size: 13.5,
          weight: "700",
          publicLabels,
        }),
        svgText(128, 206, "Virtual image", { size: 11.5, fill: "#0369a1", weight: "600", publicLabels }),
        svgText(282, 100, "Corrective lens", { size: 12, fill: "#1d4ed8", weight: "600", publicLabels }),
        svgText(506, 212, "Unaided focus", { size: 11, fill: "#dc2626", publicLabels }),
        svgText(572, 118, "Retina", { size: 12, weight: "600", publicLabels }),
      );
    } else {
      // Hypermetropia: near object O at x=166, virtual image further left at x=76, converging lens at x=282
      parts.push(
        `<path d="M 282 114 Q 296 184 282 254 Q 268 184 282 114 Z" fill="#dbeafe" stroke="#1d4ed8" stroke-width="2"/>`,
        `<circle cx="166" cy="184" r="4.5" fill="#0f172a"/>`,
        `<circle cx="76" cy="184" r="4" fill="#0369a1"/>`,
        // Rays from O -> converging lens -> retina
        `<line x1="166" y1="184" x2="282" y2="132" stroke="#1d4ed8" stroke-width="2.1" marker-end="url(#${arrBlue})"/>`,
        `<line x1="282" y1="132" x2="384" y2="118" stroke="#1d4ed8" stroke-width="2.1"/>`,
        `<line x1="384" y1="118" x2="568" y2="184" stroke="#1d4ed8" stroke-width="2.1"/>`,
        `<line x1="166" y1="184" x2="282" y2="236" stroke="#1d4ed8" stroke-width="2.1" marker-end="url(#${arrBlue})"/>`,
        `<line x1="282" y1="236" x2="384" y2="250" stroke="#1d4ed8" stroke-width="2.1"/>`,
        `<line x1="384" y1="250" x2="568" y2="184" stroke="#1d4ed8" stroke-width="2.1"/>`,
        // Virtual back-projection to unaided near point
        `<line x1="282" y1="132" x2="76" y2="184" stroke="#0369a1" stroke-width="1.4" stroke-dasharray="4,4"/>`,
        `<line x1="282" y1="236" x2="76" y2="184" stroke="#0369a1" stroke-width="1.4" stroke-dasharray="4,4"/>`,
        // Unaided focus behind retina (x=602)
        `<line x1="384" y1="132" x2="602" y2="184" stroke="#dc2626" stroke-width="1.6" stroke-dasharray="5,4"/>`,
        `<line x1="384" y1="236" x2="602" y2="184" stroke="#dc2626" stroke-width="1.6" stroke-dasharray="5,4"/>`,
        svgText(320, 28, "Eye Optics: Near-Object Ray Trace & Corrective Spectacle Lens", {
          size: 13.5,
          weight: "700",
          publicLabels,
        }),
        svgText(166, 206, "Object O", { size: 11.5, weight: "600", publicLabels }),
        svgText(80, 206, "Virtual image", { size: 11.5, fill: "#0369a1", weight: "600", publicLabels }),
        svgText(282, 100, "Corrective lens", { size: 12, fill: "#1d4ed8", weight: "600", publicLabels }),
        svgText(572, 118, "Retina", { size: 12, weight: "600", publicLabels }),
        svgText(540, 304, "Dashed: unaided focus behind retina", {
          size: 11.5,
          fill: "#dc2626",
          publicLabels,
        }),
      );
    }
  }

  return {
    visualFamily: "optics-shm",
    svgMarkup: wrapSvg({
      title: "Human eye refraction and spectacle lens ray diagram",
      defs,
      body: parts.join(""),
    }),
    rendererVersion: ALEVEL_OPT_AM_RENDERER_VERSION,
    publicNumbers,
    publicLabels,
  };
}

/* ========================================================================== */
/*  6. al-opt-med-retina-ear-db (Option 3.10 — Waves)                         */
/* ========================================================================== */

function validateRetinaEarDb(
  spec: Record<string, unknown>,
): DomainValidationResult {
  const issues: string[] = [];
  checkKind(spec, "al-opt-med-retina-ear-db", issues);
  if (spec.mode === "ear-db") {
    if (!inRange(spec.sourcePowerW, 1e-9, 1e5)) {
      issues.push("sourcePowerW must be in [1e-9, 1e5] W");
    }
    if (!inRange(spec.distanceM, 0.1, 5000)) {
      issues.push("distanceM must be in [0.1, 5000] m");
    }
    if (
      spec.secondDistanceM !== undefined &&
      !inRange(spec.secondDistanceM, 0.1, 5000)
    ) {
      issues.push("secondDistanceM must be in [0.1, 5000] m");
    }
    if (
      spec.targetLevelDb !== undefined &&
      !inRange(spec.targetLevelDb, 10, 140)
    ) {
      issues.push("targetLevelDb must be in [10, 140] dB");
    }
  } else if (spec.mode === "retina-cones") {
    if (!inRange(spec.coneDiameterUm, 1.0, 12.0)) {
      issues.push("coneDiameterUm must be in [1.0, 12.0] μm");
    }
    if (!inRange(spec.objectDistanceM, 0.2, 500)) {
      issues.push("objectDistanceM must be in [0.2, 500] m");
    }
    if (
      spec.eyeFocalLengthMm !== undefined &&
      !inRange(spec.eyeFocalLengthMm, 12, 24)
    ) {
      issues.push("eyeFocalLengthMm must be in [12, 24] mm");
    }
  } else {
    issues.push('mode must be "ear-db" or "retina-cones"');
  }
  return { valid: issues.length === 0, issues };
}

function solveRetinaEarDb(spec: Record<string, unknown>): DomainSolveOutput {
  const quantities: VerifiedQuantityMap = {
    dbaScaleAnchor:
      "frequency weighted to match human ear sensitivity peaking near three kilohertz",
    hearingLossAnchor:
      "ageing reduces high frequency hearing whereas excessive noise causes a characteristic dip near four kilohertz",
    coneVsRodAnchor:
      "cones at the fovea have individual nerve connections for sharp colour vision in bright light whereas rods share connections for dim light sensitivity",
    coneResolutionAnchor:
      "at least one unstimulated cone must lie between two stimulated cones",
  };
  const publicNumbers: number[] = [];

  if (spec.mode === "ear-db") {
    const P = Number(spec.sourcePowerW);
    const r = Number(spec.distanceM);
    const intensityWm2 = P / (4 * Math.PI * r * r);
    const intensityLevelDb =
      10 * Math.log10(intensityWm2 / ALEVEL_EAR_THRESHOLD_I0);
    quantities.sourcePowerW = P;
    quantities.distanceM = r;
    quantities.intensityWm2 = intensityWm2;
    quantities.intensityLevelDb = intensityLevelDb;
    publicNumbers.push(P, r);

    if (isPos(spec.secondDistanceM)) {
      const r2 = spec.secondDistanceM;
      const i2 = P / (4 * Math.PI * r2 * r2);
      const db2 = 10 * Math.log10(i2 / ALEVEL_EAR_THRESHOLD_I0);
      quantities.secondDistanceM = r2;
      quantities.secondIntensityWm2 = i2;
      quantities.secondIntensityLevelDb = db2;
      quantities.levelDifferenceDb = Math.abs(intensityLevelDb - db2);
      quantities.intensityRatio = intensityWm2 / i2;
    }
    if (isPos(spec.targetLevelDb)) {
      const lT = spec.targetLevelDb;
      const iT = ALEVEL_EAR_THRESHOLD_I0 * Math.pow(10, lT / 10);
      quantities.targetLevelDb = lT;
      quantities.targetIntensityWm2 = iT;
      quantities.safeDistanceM = Math.sqrt(P / (4 * Math.PI * iT));
    }
  } else {
    const dUm = Number(spec.coneDiameterUm);
    const dist = Number(spec.objectDistanceM);
    const fMm = isPos(spec.eyeFocalLengthMm) ? spec.eyeFocalLengthMm : 17;
    const minRetinalUm = 2 * dUm;
    const minAngleRad = (minRetinalUm * 1e-6) / (fMm * 1e-3);
    const minObjMm = minAngleRad * dist * 1000;
    quantities.coneDiameterUm = dUm;
    quantities.eyeFocalLengthMm = fMm;
    quantities.objectDistanceM = dist;
    quantities.minRetinalSeparationUm = minRetinalUm;
    quantities.minAngularResolutionRad = minAngleRad;
    quantities.minObjectSeparationMm = minObjMm;
    publicNumbers.push(dUm, fMm, dist);
  }

  return {
    solverId: "sixthphysics/al-opt-med-retina-ear-db/1.0.0",
    quantities,
    publicNumbers,
  };
}

function renderRetinaEarDb(
  spec: Record<string, unknown>,
): DomainRenderOutput {
  const mode = spec.mode === "retina-cones" ? "retina-cones" : "ear-db";
  const publicNumbers: number[] = [];
  const publicLabels: string[] = [];
  const parts: string[] = [];
  const ox = 86;
  const oy = 282;
  const pw = 492;
  const ph = 204;

  if (mode === "ear-db") {
    // Log frequency 20 Hz .. 20 kHz vs Intensity level (0..120 dB)
    const logMin = Math.log10(20);
    const logMax = Math.log10(20000);
    const xOfF = (f: number) =>
      ox + ((Math.log10(f) - logMin) / (logMax - logMin)) * pw;
    const yOfDb = (db: number) => oy - (db / 120) * ph;

    parts.push(
      `<line x1="${ox}" y1="${oy}" x2="${ox + pw}" y2="${oy}" stroke="#334155" stroke-width="1.8"/>`,
      `<line x1="${ox}" y1="${oy}" x2="${ox}" y2="${oy - ph}" stroke="#334155" stroke-width="1.8"/>`,
    );
    const fTicks: Array<[number, string]> = [
      [20, "20"],
      [100, "100"],
      [1000, "1 k"],
      [3000, "3 k"],
      [10000, "10 k"],
      [20000, "20 k"],
    ];
    for (const [f, lbl] of fTicks) {
      const px = xOfF(f);
      parts.push(
        `<line x1="${c(px)}" y1="${oy - ph}" x2="${c(px)}" y2="${oy}" stroke="#e2e8f0" stroke-width="1"/>`,
        svgText(px, oy + 20, lbl, { size: 11, publicLabels }),
      );
      publicNumbers.push(f);
    }
    for (const db of [0, 30, 60, 90, 120]) {
      const py = yOfDb(db);
      parts.push(
        `<line x1="${ox}" y1="${c(py)}" x2="${ox + pw}" y2="${c(py)}" stroke="#e2e8f0" stroke-width="1"/>`,
        svgText(ox - 10, py + 4, String(db), {
          anchor: "end",
          size: 11.5,
          publicLabels,
        }),
      );
      publicNumbers.push(db);
    }
    // Threshold of hearing curve (lowest around 3 kHz)
    const thresh: Array<[number, number]> = [
      [20, 74],
      [50, 44],
      [100, 26],
      [250, 13],
      [500, 6],
      [1000, 0],
      [2000, -2],
      [3000, -4],
      [4000, -2],
      [6000, 8],
      [10000, 18],
      [16000, 46],
      [20000, 78],
    ];
    // 60 phon equal-loudness curve
    const phon60: Array<[number, number]> = [
      [20, 108],
      [50, 85],
      [100, 72],
      [250, 64],
      [500, 61],
      [1000, 60],
      [3000, 56],
      [6000, 65],
      [10000, 72],
      [16000, 90],
      [20000, 114],
    ];
    const toPoly = (arr: Array<[number, number]>) =>
      arr
        .map(([f, db]) => `${c(xOfF(f))},${c(yOfDb(Math.max(0, db)))}`)
        .join(" ");
    parts.push(
      `<polyline points="${toPoly(thresh)}" fill="none" stroke="#1d4ed8" stroke-width="2.5"/>`,
      `<polyline points="${toPoly(phon60)}" fill="none" stroke="#0d9488" stroke-width="2.2" stroke-dasharray="6,4"/>`,
      `<line x1="${ox}" y1="${c(yOfDb(60))}" x2="${ox + pw}" y2="${c(yOfDb(60))}" stroke="#94a3b8" stroke-width="1.3" stroke-dasharray="3,3"/>`,
      svgText(320, 28, "Human Ear Response: Equal-Loudness & Threshold of Hearing", {
        size: 13.5,
        weight: "700",
        publicLabels,
      }),
      svgText(xOfF(1800), yOfDb(14), "Threshold of hearing", {
        size: 11.5,
        fill: "#1d4ed8",
        weight: "600",
        publicLabels,
      }),
      svgText(xOfF(2200), yOfDb(72), "Equal loudness (dBA)", {
        size: 11.5,
        fill: "#0d9488",
        weight: "600",
        publicLabels,
      }),
      svgText(ox + pw / 2, 330, "Frequency f / Hz (logarithmic scale)", {
        size: 12.5,
        weight: "600",
        publicLabels,
      }),
      svgText(28, oy - ph / 2, "Intensity level / dB", {
        size: 12.5,
        weight: "600",
        rotate: `rotate(-90 28 ${c(oy - ph / 2)})`,
        publicLabels,
      }),
    );
  } else {
    // RGB Cone spectral absorption curves (400..700 nm)
    const xOfLam = (lam: number) => ox + ((lam - 400) / 300) * pw;
    const gauss = (lam: number, mu: number, sig: number) =>
      Math.exp(-0.5 * ((lam - mu) / sig) ** 2);
    parts.push(
      `<line x1="${ox}" y1="${oy}" x2="${ox + pw}" y2="${oy}" stroke="#334155" stroke-width="1.8"/>`,
      `<line x1="${ox}" y1="${oy}" x2="${ox}" y2="${oy - ph}" stroke="#334155" stroke-width="1.8"/>`,
    );
    for (const lam of [400, 450, 500, 550, 600, 650, 700]) {
      const px = xOfLam(lam);
      parts.push(
        `<line x1="${c(px)}" y1="${oy - ph}" x2="${c(px)}" y2="${oy}" stroke="#e2e8f0" stroke-width="1"/>`,
        svgText(px, oy + 20, String(lam), { size: 11.5, publicLabels }),
      );
      publicNumbers.push(lam);
    }
    const buildCurve = (mu: number, sig: number, color: string) => {
      const pts: string[] = [];
      for (let lam = 400; lam <= 700; lam += 5) {
        const y = oy - gauss(lam, mu, sig) * (ph - 16);
        pts.push(`${c(xOfLam(lam))},${c(y)}`);
      }
      return `<polyline points="${pts.join(" ")}" fill="none" stroke="${color}" stroke-width="2.5"/>`;
    };
    parts.push(
      buildCurve(420, 26, "#2563eb"),
      buildCurve(534, 42, "#16a34a"),
      buildCurve(564, 48, "#dc2626"),
      // Retinal cone resolution inset (top-right)
      `<rect x="444" y="54" width="144" height="62" rx="6" fill="#f8fafc" stroke="#cbd5e1" stroke-width="1.4"/>`,
      `<circle cx="484" cy="84" r="11" fill="#dbeafe" stroke="#1d4ed8" stroke-width="1.8"/>`,
      `<circle cx="516" cy="84" r="11" fill="#ffffff" stroke="#94a3b8" stroke-width="1.6" stroke-dasharray="3,2"/>`,
      `<circle cx="548" cy="84" r="11" fill="#dbeafe" stroke="#1d4ed8" stroke-width="1.8"/>`,
      svgText(516, 108, "Resolved mosaic", { size: 10.5, fill: "#475569", publicLabels }),
      svgText(320, 28, "Retinal Cone Spectral Absorption Curves (Blue, Green, Red)", {
        size: 13.5,
        weight: "700",
        publicLabels,
      }),
      svgText(xOfLam(425), 76, "Blue", { size: 11.5, fill: "#2563eb", weight: "600", publicLabels }),
      svgText(xOfLam(520), 68, "Green", { size: 11.5, fill: "#16a34a", weight: "600", publicLabels }),
      svgText(xOfLam(604), 104, "Red", { size: 11.5, fill: "#dc2626", weight: "600", publicLabels }),
      svgText(ox + pw / 2, 330, "Wavelength λ / nm", {
        size: 12.5,
        weight: "600",
        publicLabels,
      }),
      svgText(28, oy - ph / 2, "Relative absorption", {
        size: 12.5,
        weight: "600",
        rotate: `rotate(-90 28 ${c(oy - ph / 2)})`,
        publicLabels,
      }),
    );
  }

  return {
    visualFamily: "waves",
    svgMarkup: wrapSvg({
      title:
        mode === "retina-cones"
          ? "Retinal cone spectral absorption curves"
          : "Human ear equal-loudness and threshold response",
      body: parts.join(""),
    }),
    rendererVersion: ALEVEL_OPT_AM_RENDERER_VERSION,
    publicNumbers,
    publicLabels,
  };
}

/* ========================================================================== */
/*  7. al-opt-med-ultrasound-ascan (Option 3.10 — Waves)                      */
/* ========================================================================== */

function validateUltrasoundAscan(
  spec: Record<string, unknown>,
): DomainValidationResult {
  const issues: string[] = [];
  checkKind(spec, "al-opt-med-ultrasound-ascan", issues);
  if (spec.mode !== "ascan-echo" && spec.mode !== "impedance-boundary") {
    issues.push('mode must be "ascan-echo" or "impedance-boundary"');
  }
  if (!inRange(spec.density1KgM3, 0.5, 20000)) {
    issues.push("density1KgM3 must be in [0.5, 20000] kg m⁻³");
  }
  if (!inRange(spec.speed1Ms, 200, 10000)) {
    issues.push("speed1Ms must be in [200, 10000] m s⁻¹");
  }
  if (!inRange(spec.density2KgM3, 0.5, 20000)) {
    issues.push("density2KgM3 must be in [0.5, 20000] kg m⁻³");
  }
  if (!inRange(spec.speed2Ms, 200, 10000)) {
    issues.push("speed2Ms must be in [200, 10000] m s⁻¹");
  }
  if (spec.pulseEchoDelayUs !== undefined && !inRange(spec.pulseEchoDelayUs, 2, 400)) {
    issues.push("pulseEchoDelayUs must be in [2, 400] μs");
  }
  if (spec.secondEchoDelayUs !== undefined) {
    if (
      !inRange(spec.secondEchoDelayUs, 5, 600) ||
      (isPos(spec.pulseEchoDelayUs) &&
        spec.secondEchoDelayUs <= spec.pulseEchoDelayUs)
    ) {
      issues.push("secondEchoDelayUs must be > pulseEchoDelayUs and <= 600 μs");
    }
  }
  return { valid: issues.length === 0, issues };
}

function solveUltrasoundAscan(spec: Record<string, unknown>): DomainSolveOutput {
  const rho1 = Number(spec.density1KgM3);
  const c1 = Number(spec.speed1Ms);
  const rho2 = Number(spec.density2KgM3);
  const c2 = Number(spec.speed2Ms);
  const z1 = rho1 * c1;
  const z2 = rho2 * c2;
  const reflFrac = ((z2 - z1) / (z2 + z1)) ** 2;
  const transFrac = 1 - reflFrac;

  const quantities: VerifiedQuantityMap = {
    density1KgM3: rho1,
    speed1Ms: c1,
    density2KgM3: rho2,
    speed2Ms: c2,
    impedance1: z1,
    impedance2: z2,
    reflectionFraction: reflFrac,
    reflectionPercent: reflFrac * 100,
    transmissionFraction: transFrac,
    transmissionPercent: transFrac * 100,
    couplingGelAnchor:
      "displaces air so acoustic impedance closely matches soft tissue minimising reflection at the skin",
    backingBlockAnchor:
      "damps crystal vibrations rapidly to produce short pulses improving axial resolution",
    ascanVsBscanAnchor:
      "A-scan plots echo amplitude against time for one dimensional depth measurement whereas B-scan modulates spot brightness to form a two dimensional cross section",
    lorPiezoAnchor:
      "alternating potential difference causes crystal vibrations at resonance to transmit pulses while returning echoes deform the crystal to produce measurable voltage spikes",
  };

  if (isPos(spec.pulseEchoDelayUs)) {
    const t1 = spec.pulseEchoDelayUs;
    const d1M = (c1 * t1 * 1e-6) / 2;
    quantities.pulseEchoDelayUs = t1;
    quantities.firstBoundaryDepthM = d1M;
    quantities.firstBoundaryDepthMm = d1M * 1000;
    if (isPos(spec.secondEchoDelayUs)) {
      const t2 = spec.secondEchoDelayUs;
      const dt = t2 - t1;
      const thickM = (c2 * dt * 1e-6) / 2;
      quantities.secondEchoDelayUs = t2;
      quantities.echoIntervalUs = dt;
      quantities.organThicknessM = thickM;
      quantities.organThicknessMm = thickM * 1000;
    }
  }
  if (isPos(spec.transducerFreqMHz)) {
    const fMHz = spec.transducerFreqMHz;
    const cCrys = isPos(spec.crystalSpeedMs) ? spec.crystalSpeedMs : 4000;
    quantities.transducerFreqMHz = fMHz;
    quantities.crystalThicknessMm = ((cCrys / (fMHz * 1e6)) / 2) * 1000;
  }

  return {
    solverId: "sixthphysics/al-opt-med-ultrasound-ascan/1.0.0",
    quantities,
    publicNumbers: [rho1, c1, rho2, c2],
  };
}

function renderUltrasoundAscan(
  spec: Record<string, unknown>,
  options?: DomainRenderOptions,
): DomainRenderOutput {
  const hidden = getHiddenSet(spec, options);
  const mode =
    spec.mode === "impedance-boundary" ? "impedance-boundary" : "ascan-echo";
  const publicNumbers: number[] = [];
  const publicLabels: string[] = [];
  const parts: string[] = [];

  if (mode === "ascan-echo") {
    const t1 = isPos(spec.pulseEchoDelayUs) ? spec.pulseEchoDelayUs : 40;
    const t2 = isPos(spec.secondEchoDelayUs) ? spec.secondEchoDelayUs : 110;
    const tMax = Math.ceil((t2 * 1.25) / 20) * 20;
    const ox = 78;
    const oy = 278;
    const pw = 504;
    const ph = 194;
    const xOfT = (t: number) => ox + (t / tMax) * pw;

    // Oscilloscope grid
    parts.push(
      `<rect x="${ox}" y="${oy - ph}" width="${pw}" height="${ph}" fill="#f8fafc" stroke="#334155" stroke-width="1.8"/>`,
    );
    const nGridX = 5;
    for (let i = 0; i <= nGridX; i += 1) {
      const tv = (tMax * i) / nGridX;
      const px = xOfT(tv);
      parts.push(
        `<line x1="${c(px)}" y1="${oy - ph}" x2="${c(px)}" y2="${oy}" stroke="#cbd5e1" stroke-width="1"/>`,
        svgText(px, oy + 20, fmtTick(tv), { size: 11.5, publicLabels }),
      );
      publicNumbers.push(tv);
    }
    for (let j = 1; j < 4; j += 1) {
      const py = oy - (ph * j) / 4;
      parts.push(
        `<line x1="${ox}" y1="${c(py)}" x2="${ox + pw}" y2="${c(py)}" stroke="#cbd5e1" stroke-width="1"/>`,
      );
    }

    // Pulse-echo spikes on baseline y = oy - 24
    const yBase = oy - 24;
    const spike = (tUs: number, height: number): string => {
      const px = xOfT(tUs);
      return `${c(px - 6)},${c(yBase)} ${c(px - 2)},${c(yBase - height * 0.45)} ${c(px)},${c(yBase - height)} ${c(px + 2)},${c(yBase - height * 0.35)} ${c(px + 6)},${c(yBase)}`;
    };
    const tracePts = [
      `${ox},${c(yBase)}`,
      `${c(ox + 6)},${c(yBase - 148)}`,
      `${c(ox + 12)},${c(yBase)}`,
      spike(t1, 108),
      spike(t2, 68),
      `${ox + pw},${c(yBase)}`,
    ].join(" ");

    parts.push(
      `<polyline points="${tracePts}" fill="none" stroke="#1d4ed8" stroke-width="2.4" stroke-linejoin="round"/>`,
      svgText(320, 28, "Ultrasound A-Scan Pulse-Echo Oscilloscope Trace", {
        size: 14,
        weight: "700",
        publicLabels,
      }),
      svgText(ox + 34, oy - 166, "Tx pulse", { size: 11.5, fill: "#1d4ed8", weight: "600", publicLabels }),
      svgText(xOfT(t1), oy - 142, hidden.has("pulseEchoDelayUs") ? "Echo 1" : `Echo 1 (${fmtTick(t1)} μs)`, {
        size: 11.5,
        fill: "#0f172a",
        weight: "600",
        publicLabels,
      }),
      svgText(xOfT(t2), oy - 102, hidden.has("secondEchoDelayUs") ? "Echo 2" : `Echo 2 (${fmtTick(t2)} μs)`, {
        size: 11.5,
        fill: "#0f172a",
        weight: "600",
        publicLabels,
      }),
      svgText(ox + pw / 2, 330, "Time t / μs", {
        size: 12.5,
        weight: "600",
        publicLabels,
      }),
      svgText(28, oy - ph / 2, "Echo amplitude", {
        size: 12.5,
        weight: "600",
        rotate: `rotate(-90 28 ${c(oy - ph / 2)})`,
        publicLabels,
      }),
    );
    if (!hidden.has("pulseEchoDelayUs")) publicNumbers.push(t1);
    if (!hidden.has("secondEchoDelayUs")) publicNumbers.push(t2);
  } else {
    const arrB = safeMarkerId("us-b", options);
    const arrR = safeMarkerId("us-r", options);
    const arrG = safeMarkerId("us-g", options);
    const defs = [
      arrowMarkerDef(arrB, "#1d4ed8"),
      arrowMarkerDef(arrR, "#dc2626"),
      arrowMarkerDef(arrG, "#047857"),
    ].join("");
    parts.push(
      // Transducer + coupling gel + Medium 1 + Medium 2
      `<rect x="64" y="138" width="54" height="92" rx="6" fill="#334155"/>`,
      `<rect x="118" y="138" width="16" height="92" fill="#93c5fd" stroke="#1d4ed8" stroke-width="1.2"/>`,
      `<rect x="134" y="74" width="206" height="220" fill="#f8fafc" stroke="#94a3b8" stroke-width="1.6"/>`,
      `<rect x="340" y="74" width="236" height="220" fill="#eef2ff" stroke="#6366f1" stroke-width="1.8"/>`,
      // Incident, reflected, transmitted arrows
      `<line x1="146" y1="168" x2="332" y2="168" stroke="#1d4ed8" stroke-width="2.8" marker-end="url(#${arrB})"/>`,
      `<line x1="332" y1="204" x2="152" y2="204" stroke="#dc2626" stroke-width="2.4" stroke-dasharray="6,3" marker-end="url(#${arrR})"/>`,
      `<line x1="348" y1="184" x2="544" y2="184" stroke="#047857" stroke-width="2.8" marker-end="url(#${arrG})"/>`,
      svgText(320, 28, "Acoustic Impedance Boundary: Reflection & Transmission", {
        size: 14,
        weight: "700",
        publicLabels,
      }),
      svgText(91, 250, "Probe", { size: 11.5, weight: "600", publicLabels }),
      svgText(126, 126, "Gel", { size: 11, fill: "#1d4ed8", weight: "600", publicLabels }),
      svgText(237, 102, "Medium 1 (Z₁)", { size: 13, weight: "700", publicLabels }),
      svgText(458, 102, "Medium 2 (Z₂)", { size: 13, fill: "#3730a3", weight: "700", publicLabels }),
      svgText(237, 156, "Incident Iᵢ", { size: 12, fill: "#1d4ed8", weight: "600", publicLabels }),
      svgText(237, 224, "Reflected Iᵣ", { size: 12, fill: "#dc2626", weight: "600", publicLabels }),
      svgText(458, 170, "Transmitted Iₜ", { size: 12, fill: "#047857", weight: "600", publicLabels }),
    );
    return {
      visualFamily: "waves",
      svgMarkup: wrapSvg({
        title: "Ultrasound reflection and transmission at an acoustic impedance boundary",
        defs,
        body: parts.join(""),
      }),
      rendererVersion: ALEVEL_OPT_AM_RENDERER_VERSION,
      publicNumbers,
      publicLabels,
    };
  }

  return {
    visualFamily: "waves",
    svgMarkup: wrapSvg({
      title: "Ultrasound A-scan pulse-echo oscilloscope trace",
      body: parts.join(""),
    }),
    rendererVersion: ALEVEL_OPT_AM_RENDERER_VERSION,
    publicNumbers,
    publicLabels,
  };
}

/* ========================================================================== */
/*  8. al-opt-med-xray-attenuation (Option 3.10 — Quantum-Nuclear)            */
/* ========================================================================== */

function validateXrayAttenuation(
  spec: Record<string, unknown>,
): DomainValidationResult {
  const issues: string[] = [];
  checkKind(spec, "al-opt-med-xray-attenuation", issues);
  if (spec.mode !== "spectrum" && spec.mode !== "attenuation") {
    issues.push('mode must be "spectrum" or "attenuation"');
  }
  if (!inRange(spec.tubeVoltageKv, 20, 200)) {
    issues.push("tubeVoltageKv must be in [20, 200] kV");
  }
  if (!inRange(spec.linearAttenCoeffPerM, 1, 20000)) {
    issues.push("linearAttenCoeffPerM must be in [1, 20000] m⁻¹");
  }
  if (!inRange(spec.thicknessMm, 0.05, 250)) {
    issues.push("thicknessMm must be in [0.05, 250] mm");
  }
  if (!inRange(spec.densityKgM3, 100, 25000)) {
    issues.push("densityKgM3 must be in [100, 25000] kg m⁻³");
  }
  return { valid: issues.length === 0, issues };
}

function solveXrayAttenuation(spec: Record<string, unknown>): DomainSolveOutput {
  const kV = Number(spec.tubeVoltageKv);
  const mu = Number(spec.linearAttenCoeffPerM);
  const xMm = Number(spec.thicknessMm);
  const rho = Number(spec.densityKgM3);

  const eMaxJ = kV * 1000 * ALEVEL_ELEMENTARY_CHARGE_C;
  const minLamM = (ALEVEL_PLANCK_JS * ALEVEL_SPEED_OF_LIGHT_MS) / eMaxJ;
  const xM = xMm * 1e-3;
  const transFrac = Math.exp(-mu * xM);
  const hvlM = Math.LN2 / mu;
  const muMass = mu / rho;
  const xTenPctMm = (Math.log(10) / mu) * 1000;

  const quantities: VerifiedQuantityMap = {
    tubeVoltageKv: kV,
    linearAttenCoeffPerM: mu,
    thicknessMm: xMm,
    densityKgM3: rho,
    maxPhotonEnergyKeV: kV,
    maxPhotonEnergyJ: eMaxJ,
    minWavelengthM: minLamM,
    minWavelengthPm: minLamM * 1e12,
    transmissionFraction: transFrac,
    transmissionPercent: transFrac * 100,
    absorbedPercent: (1 - transFrac) * 100,
    halfValueThicknessM: hvlM,
    halfValueThicknessMm: hvlM * 1000,
    massAttenCoeffM2Kg: muMass,
    thicknessForTenPercentMm: xTenPctMm,
    alFilterAnchor:
      "aluminium filter absorbs low energy soft X-rays that would raise patient skin dose without reaching the detector",
    tubeShiftAnchor:
      "increasing anode voltage reduces minimum wavelength and raises intensity while characteristic peak wavelengths stay fixed",
    bariumContrastAnchor:
      "high atomic number barium strongly increases photoelectric absorption creating sharp contrast with soft tissue",
    lorXrayProductionAnchor:
      "decelerating electrons produce continuous bremsstrahlung radiation while inner shell transitions emit sharp characteristic K-line peaks",
  };

  return {
    solverId: "sixthphysics/al-opt-med-xray-attenuation/1.0.0",
    quantities,
    publicNumbers: [kV, mu, xMm, rho],
  };
}

function renderXrayAttenuation(
  spec: Record<string, unknown>,
  options?: DomainRenderOptions,
): DomainRenderOutput {
  const hidden = getHiddenSet(spec, options);
  const mode = spec.mode === "attenuation" ? "attenuation" : "spectrum";
  const publicNumbers: number[] = [];
  const publicLabels: string[] = [];
  const parts: string[] = [];

  if (mode === "spectrum") {
    const ox = 84;
    const oy = 282;
    const pw = 496;
    const ph = 204;
    // Axes: Intensity vs Wavelength (0..100 pm scale)
    parts.push(
      `<line x1="${ox}" y1="${oy}" x2="${ox + pw}" y2="${oy}" stroke="#334155" stroke-width="1.8"/>`,
      `<line x1="${ox}" y1="${oy}" x2="${ox}" y2="${oy - ph}" stroke="#334155" stroke-width="1.8"/>`,
    );
    // Primary X-ray spectrum (cutoff at x=170, characteristic K_beta at 275, K_alpha at 315)
    const specPts: string[] = [];
    for (let i = 0; i <= 140; i += 1) {
      const u = i / 140; // 0..1 across x=170..560
      const px = 170 + u * 390;
      let val = 2.6 * u * Math.exp(-3.1 * u);
      // Characteristic peaks
      val += 0.55 * Math.exp(-(((px - 274) / 4.5) ** 2));
      val += 0.82 * Math.exp(-(((px - 314) / 4.5) ** 2));
      const py = oy - Math.min(0.95, val) * ph;
      specPts.push(`${c(px)},${c(py)}`);
    }
    // Optional shifted (higher V) dashed curve with shorter cutoff at x=132, SAME K peaks
    const shiftPts: string[] = [];
    for (let i = 0; i <= 140; i += 1) {
      const u = i / 140;
      const px = 132 + u * 428;
      let val = 3.2 * u * Math.exp(-2.8 * u);
      val += 0.62 * Math.exp(-(((px - 274) / 4.5) ** 2));
      val += 0.9 * Math.exp(-(((px - 314) / 4.5) ** 2));
      const py = oy - Math.min(0.98, val) * ph;
      shiftPts.push(`${c(px)},${c(py)}`);
    }
    parts.push(
      `<polyline points="${shiftPts.join(" ")}" fill="none" stroke="#dc2626" stroke-width="1.8" stroke-dasharray="5,4"/>`,
      `<polyline points="${specPts.join(" ")}" fill="none" stroke="#1d4ed8" stroke-width="2.5"/>`,
      `<circle cx="170" cy="${oy}" r="3.5" fill="#1d4ed8"/>`,
      svgText(320, 28, "Diagnostic X-Ray Tube Emission Spectrum", {
        size: 14,
        weight: "700",
        publicLabels,
      }),
      svgText(170, oy + 20, "λₘᵢₙ", { size: 12.5, fill: "#1d4ed8", weight: "700", publicLabels }),
      svgText(274, 92, "Kβ", { size: 11.5, fill: "#1d4ed8", weight: "600", publicLabels }),
      svgText(320, 62, "Kα", { size: 11.5, fill: "#1d4ed8", weight: "600", publicLabels }),
      svgText(462, 128, "Bremsstrahlung continuum", {
        size: 11.5,
        fill: "#1d4ed8",
        publicLabels,
      }),
      svgText(462, 102, "Dashed: higher anode pd", {
        size: 11.5,
        fill: "#dc2626",
        publicLabels,
      }),
      svgText(ox + pw / 2, 330, "Wavelength λ", {
        size: 12.5,
        weight: "600",
        publicLabels,
      }),
      svgText(30, oy - ph / 2, "X-ray intensity", {
        size: 12.5,
        weight: "600",
        rotate: `rotate(-90 30 ${c(oy - ph / 2)})`,
        publicLabels,
      }),
    );
  } else {
    const arrB = safeMarkerId("xr-b", options);
    const defs = arrowMarkerDef(arrB, "#1d4ed8");
    const xMm = Number(spec.thicknessMm);
    const xLbl = hidden.has("thicknessMm")
      ? "Thickness x"
      : (publicNumbers.push(xMm), `x = ${fmtVal(xMm)} mm`);

    // Left: collimated beam through absorber slab; Right: exponential decay curve
    parts.push(
      `<rect x="148" y="96" width="84" height="168" fill="#cbd5e1" stroke="#334155" stroke-width="2"/>`,
      `<line x1="48" y1="142" x2="140" y2="142" stroke="#1d4ed8" stroke-width="2.4" marker-end="url(#${arrB})"/>`,
      `<line x1="48" y1="180" x2="140" y2="180" stroke="#1d4ed8" stroke-width="2.4" marker-end="url(#${arrB})"/>`,
      `<line x1="48" y1="218" x2="140" y2="218" stroke="#1d4ed8" stroke-width="2.4" marker-end="url(#${arrB})"/>`,
      `<line x1="234" y1="180" x2="314" y2="180" stroke="#0369a1" stroke-width="2.2" marker-end="url(#${arrB})"/>`,
      // Mini exponential plot on right (x=378..590, y=268..96)
      `<line x1="378" y1="268" x2="592" y2="268" stroke="#334155" stroke-width="1.6"/>`,
      `<line x1="378" y1="268" x2="378" y2="92" stroke="#334155" stroke-width="1.6"/>`,
    );
    const expPts: string[] = [];
    for (let i = 0; i <= 60; i += 1) {
      const u = (3.0 * i) / 60;
      const px = 378 + (u / 3.0) * 204;
      const py = 268 - Math.exp(-u) * 160;
      expPts.push(`${c(px)},${c(py)}`);
    }
    const xHvl = 378 + (Math.LN2 / 3.0) * 204;
    const yHalf = 268 - 80;
    parts.push(
      `<polyline points="${expPts.join(" ")}" fill="none" stroke="#1d4ed8" stroke-width="2.5"/>`,
      `<line x1="378" y1="${c(yHalf)}" x2="${c(xHvl)}" y2="${c(yHalf)}" stroke="#dc2626" stroke-width="1.4" stroke-dasharray="4,3"/>`,
      `<line x1="${c(xHvl)}" y1="${c(yHalf)}" x2="${c(xHvl)}" y2="268" stroke="#dc2626" stroke-width="1.4" stroke-dasharray="4,3"/>`,
      svgText(320, 28, "Exponential X-Ray Attenuation & Half-Value Thickness", {
        size: 14,
        weight: "700",
        publicLabels,
      }),
      svgText(92, 120, "Incident I₀", { size: 12, fill: "#1d4ed8", weight: "600", publicLabels }),
      svgText(274, 166, "Transmitted I", { size: 11.5, fill: "#0369a1", weight: "600", publicLabels }),
      svgText(190, 286, xLbl, { size: 12, weight: "600", publicLabels }),
      svgText(190, 84, "Absorber (μ)", { size: 12, weight: "600", publicLabels }),
      svgText(368, 114, "I₀", { anchor: "end", size: 11.5, publicLabels }),
      svgText(368, yHalf + 4, "0.5 I₀", { anchor: "end", size: 11, fill: "#dc2626", publicLabels }),
      svgText(xHvl, 286, "x₁/₂", { size: 12, fill: "#dc2626", weight: "600", publicLabels }),
      svgText(490, 314, "Absorber thickness x", { size: 12, weight: "600", publicLabels }),
    );
    return {
      visualFamily: "quantum-nuclear",
      svgMarkup: wrapSvg({
        title: "Exponential attenuation of X-rays through an absorber",
        defs,
        body: parts.join(""),
      }),
      rendererVersion: ALEVEL_OPT_AM_RENDERER_VERSION,
      publicNumbers,
      publicLabels,
    };
  }

  return {
    visualFamily: "quantum-nuclear",
    svgMarkup: wrapSvg({
      title: "Diagnostic X-ray emission spectrum",
      body: parts.join(""),
    }),
    rendererVersion: ALEVEL_OPT_AM_RENDERER_VERSION,
    publicNumbers,
    publicLabels,
  };
}

/* ========================================================================== */
/*  9. al-opt-med-nuclear-imaging (Option 3.10 — Quantum-Nuclear)             */
/* ========================================================================== */

function validateNuclearImaging(
  spec: Record<string, unknown>,
): DomainValidationResult {
  const issues: string[] = [];
  checkKind(spec, "al-opt-med-nuclear-imaging", issues);
  if (spec.mode !== "gamma-camera" && spec.mode !== "pet-coincidence") {
    issues.push('mode must be "gamma-camera" or "pet-coincidence"');
  }
  if (!inRange(spec.physicalHalfLifeHours, 0.2, 500)) {
    issues.push("physicalHalfLifeHours must be in [0.2, 500] h");
  }
  if (!inRange(spec.biologicalHalfLifeHours, 0.2, 500)) {
    issues.push("biologicalHalfLifeHours must be in [0.2, 500] h");
  }
  if (!inRange(spec.elapsedHours, 0.2, 200)) {
    issues.push("elapsedHours must be in [0.2, 200] h");
  }
  if (!inRange(spec.initialActivityMBq, 1, 5000)) {
    issues.push("initialActivityMBq must be in [1, 5000] MBq");
  }
  return { valid: issues.length === 0, issues };
}

function solveNuclearImaging(spec: Record<string, unknown>): DomainSolveOutput {
  const tP = Number(spec.physicalHalfLifeHours);
  const tB = Number(spec.biologicalHalfLifeHours);
  const t = Number(spec.elapsedHours);
  const a0 = Number(spec.initialActivityMBq);

  const tE = (tP * tB) / (tP + tB);
  const remA = a0 * Math.pow(0.5, t / tE);

  const quantities: VerifiedQuantityMap = {
    physicalHalfLifeHours: tP,
    biologicalHalfLifeHours: tB,
    elapsedHours: t,
    initialActivityMBq: a0,
    effectiveHalfLifeHours: tE,
    effectiveHalfLifeS: tE * 3600,
    effectiveDecayConstantPerH: Math.LN2 / tE,
    remainingActivityMBq: remA,
    remainingFractionPercent: (remA / a0) * 100,
    annihilationPhotonEnergyKeV: 511,
    tc99mSuitabilityAnchor:
      "emits pure gamma radiation with no alpha or beta particles and a short physical half-life limiting patient dose",
    gammaCameraPartsAnchor:
      "lead collimator selects parallel gamma rays sodium iodide scintillator converts gamma photons into visible light and photomultiplier tubes produce electrical pulses",
    petMechanismAnchor:
      "emitted positron annihilates with an electron producing two opposite 511 keV gamma photons detected in coincidence",
    lorModalityComparisonAnchor:
      "MRI provides non-ionising high soft tissue contrast CT gives detailed X-ray slices with ionising dose and ultrasound is safe portable and real time",
  };

  return {
    solverId: "sixthphysics/al-opt-med-nuclear-imaging/1.0.0",
    quantities,
    publicNumbers: [tP, tB, t, a0],
  };
}

function renderNuclearImaging(
  spec: Record<string, unknown>,
  options?: DomainRenderOptions,
): DomainRenderOutput {
  const mode = spec.mode === "pet-coincidence" ? "pet-coincidence" : "gamma-camera";
  const publicNumbers: number[] = [];
  const publicLabels: string[] = [];
  const arrG = safeMarkerId("gam", options);
  const defs = arrowMarkerDef(arrG, "#dc2626");
  const parts: string[] = [];

  if (mode === "gamma-camera") {
    // Layered schematic: Patient organ -> Lead collimator -> NaI crystal -> PMT array -> Computer
    parts.push(
      // Computer block at top
      `<rect x="210" y="48" width="220" height="32" rx="6" fill="#eff6ff" stroke="#1d4ed8" stroke-width="1.8"/>`,
      // PMT array (5 tubes)
      ...[0, 1, 2, 3, 4].map(
        (i) =>
          `<rect x="${152 + i * 70}" y="102" width="56" height="44" rx="5" fill="#fef3c7" stroke="#d97706" stroke-width="1.8"/>`,
      ),
      // NaI scintillator crystal
      `<rect x="136" y="152" width="368" height="30" rx="3" fill="#dbeafe" stroke="#0369a1" stroke-width="1.8"/>`,
      // Lead collimator septa
      ...[0, 1, 2, 3, 4, 5, 6, 7, 8].map(
        (i) =>
          `<rect x="${144 + i * 42}" y="190" width="14" height="44" fill="#475569"/>`,
      ),
      // Patient tissue & tracer organ
      `<ellipse cx="320" cy="296" rx="146" ry="38" fill="#f8fafc" stroke="#94a3b8" stroke-width="1.8"/>`,
      `<circle cx="320" cy="296" r="14" fill="#fee2e2" stroke="#dc2626" stroke-width="2"/>`,
      // Parallel gamma rays passing through slits, oblique ray absorbed by lead
      `<line x1="320" y1="282" x2="320" y2="186" stroke="#dc2626" stroke-width="2.2" marker-end="url(#${arrG})"/>`,
      `<line x1="362" y1="286" x2="362" y2="186" stroke="#dc2626" stroke-width="2.2" marker-end="url(#${arrG})"/>`,
      `<line x1="308" y1="286" x2="236" y2="234" stroke="#94a3b8" stroke-width="1.6" stroke-dasharray="4,3"/>`,
      svgText(320, 26, "Gamma Camera Cross-Section (Collimator, Scintillator & PMTs)", {
        size: 13.5,
        weight: "700",
        publicLabels,
      }),
      svgText(320, 69, "Position Computer & Display", {
        size: 12,
        fill: "#1d4ed8",
        weight: "600",
        publicLabels,
      }),
      svgText(562, 128, "PMT array", { size: 12, fill: "#b45309", weight: "600", publicLabels }),
      svgText(562, 171, "NaI crystal", { size: 12, fill: "#0369a1", weight: "600", publicLabels }),
      svgText(562, 216, "Lead collimator", { size: 12, fill: "#334155", weight: "600", publicLabels }),
      svgText(320, 300, "γ", { size: 12, fill: "#dc2626", weight: "700", publicLabels }),
      svgText(320, 348, "Radiotracer source in patient", {
        size: 11.5,
        fill: "#475569",
        publicLabels,
      }),
    );
  } else {
    // PET detector ring with opposing 180-degree photons & coincidence unit
    const cx = 248;
    const cy = 192;
    const rRing = 114;
    parts.push(
      `<circle cx="${cx}" cy="${cy}" r="${rRing}" fill="#f8fafc" stroke="#334155" stroke-width="12" stroke-dasharray="22,6"/>`,
      `<ellipse cx="${cx}" cy="${cy}" rx="64" ry="44" fill="#eef2ff" stroke="#6366f1" stroke-width="1.8"/>`,
      // Annihilation point off-centre at (268, 180)
      `<circle cx="268" cy="180" r="5" fill="#dc2626"/>`,
      `<line x1="268" y1="180" x2="352" y2="146" stroke="#dc2626" stroke-width="2.4" marker-end="url(#${arrG})"/>`,
      `<line x1="268" y1="180" x2="144" y2="230" stroke="#dc2626" stroke-width="2.4" marker-end="url(#${arrG})"/>`,
      // Coincidence unit box
      `<rect x="430" y="148" width="166" height="84" rx="8" fill="#eff6ff" stroke="#1d4ed8" stroke-width="1.8"/>`,
      `<line x1="362" y1="146" x2="430" y2="174" stroke="#475569" stroke-width="1.5" stroke-dasharray="4,3"/>`,
      `<line x1="362" y1="216" x2="430" y2="206" stroke="#475569" stroke-width="1.5" stroke-dasharray="4,3"/>`,
      svgText(320, 28, "Positron Emission Tomography (PET) Coincidence Ring", {
        size: 14,
        weight: "700",
        publicLabels,
      }),
      svgText(272, 166, "e⁺ + e⁻", { size: 11.5, fill: "#dc2626", weight: "700", publicLabels }),
      svgText(322, 134, "γ₁", { size: 12, fill: "#dc2626", weight: "700", publicLabels }),
      svgText(174, 240, "γ₂ (180°)", { size: 12, fill: "#dc2626", weight: "700", publicLabels }),
      svgText(513, 182, "Coincidence", { size: 12.5, fill: "#1d4ed8", weight: "700", publicLabels }),
      svgText(513, 202, "Timing & LOR", { size: 12, fill: "#1d4ed8", publicLabels }),
      svgText(248, 336, "Ring of gamma detectors", { size: 12, fill: "#334155", publicLabels }),
    );
  }

  return {
    visualFamily: "quantum-nuclear",
    svgMarkup: wrapSvg({
      title:
        mode === "pet-coincidence"
          ? "PET scanner coincidence detector ring schematic"
          : "Gamma camera layered cross-section schematic",
      defs,
      body: parts.join(""),
    }),
    rendererVersion: ALEVEL_OPT_AM_RENDERER_VERSION,
    publicNumbers,
    publicLabels,
  };
}

/* ========================================================================== */
/*  10. al-opt-tp-thomson-em (Option 3.12 — EM Induction)                     */
/* ========================================================================== */

function validateThomsonEm(
  spec: Record<string, unknown>,
): DomainValidationResult {
  const issues: string[] = [];
  checkKind(spec, "al-opt-tp-thomson-em", issues);
  if (!inRange(spec.magneticFieldT, 1e-4, 0.08)) {
    issues.push("magneticFieldT must be in [1e-4, 0.08] T");
  }
  if (!inRange(spec.orbitRadiusM, 0.01, 0.5)) {
    issues.push("orbitRadiusM must be in [0.01, 0.5] m");
  }
  if (spec.mode === "crossed-fields") {
    if (!inRange(spec.plateVoltageV, 50, 12000)) {
      issues.push("plateVoltageV must be in [50, 12000] V");
    }
    if (!inRange(spec.plateSeparationM, 0.005, 0.2)) {
      issues.push("plateSeparationM must be in [0.005, 0.2] m");
    }
  } else if (spec.mode === "fine-beam") {
    if (!inRange(spec.anodeVoltageV, 50, 12000)) {
      issues.push("anodeVoltageV must be in [50, 12000] V");
    }
  } else {
    issues.push('mode must be "crossed-fields" or "fine-beam"');
  }
  return { valid: issues.length === 0, issues };
}

function solveThomsonEm(spec: Record<string, unknown>): DomainSolveOutput {
  const B = Number(spec.magneticFieldT);
  const r = Number(spec.orbitRadiusM);
  const quantities: VerifiedQuantityMap = {
    magneticFieldT: B,
    orbitRadiusM: r,
    thermionicAnchor:
      "heating the metal filament gives conduction electrons enough thermal kinetic energy to escape the surface",
    hydrogenComparisonAnchor:
      "electron specific charge is roughly eighteen hundred times larger than the hydrogen ion proving electrons have much smaller mass than atoms",
    lorThomsonAnchor:
      "balancing electric and magnetic forces finds beam speed while magnetic circular deflection yields specific charge proving the electron is a sub-atomic particle",
  };
  const publicNumbers: number[] = [B, r];

  if (spec.mode === "crossed-fields") {
    const vp = Number(spec.plateVoltageV);
    const d = Number(spec.plateSeparationM);
    const E = vp / d;
    const v = E / B;
    const em = E / (B * B * r);
    quantities.plateVoltageV = vp;
    quantities.plateSeparationM = d;
    quantities.electricFieldVm = E;
    quantities.electronSpeedMs = v;
    quantities.specificChargeCKg = em;
    quantities.ratioToHydrogenIon = em / ALEVEL_HYDROGEN_ION_SPECIFIC_CHARGE;
    publicNumbers.push(vp, d);
  } else {
    const va = Number(spec.anodeVoltageV);
    const em = (2 * va) / (B * B * r * r);
    const v = Math.sqrt(2 * em * va);
    quantities.anodeVoltageV = va;
    quantities.specificChargeCKg = em;
    quantities.electronSpeedMs = v;
    quantities.ratioToHydrogenIon = em / ALEVEL_HYDROGEN_ION_SPECIFIC_CHARGE;
    publicNumbers.push(va);
  }

  return {
    solverId: "sixthphysics/al-opt-tp-thomson-em/1.0.0",
    quantities,
    publicNumbers,
  };
}

function renderThomsonEm(
  spec: Record<string, unknown>,
  options?: DomainRenderOptions,
): DomainRenderOutput {
  const hidden = getHiddenSet(spec, options);
  const mode = spec.mode === "fine-beam" ? "fine-beam" : "crossed-fields";
  const B = Number(spec.magneticFieldT);
  const r = Number(spec.orbitRadiusM);
  const publicNumbers: number[] = [];
  const publicLabels: string[] = [];
  const arrB = safeMarkerId("th-b", options);
  const defs = arrowMarkerDef(arrB, "#1d4ed8");
  const parts: string[] = [];

  if (mode === "crossed-fields") {
    const vp = Number(spec.plateVoltageV);
    const d = Number(spec.plateSeparationM);
    parts.push(
      // Filament + anode slit
      `<path d="M 58 170 Q 70 184 58 198" fill="none" stroke="#dc2626" stroke-width="3"/>`,
      `<line x1="118" y1="138" x2="118" y2="176" stroke="#334155" stroke-width="4"/>`,
      `<line x1="118" y1="192" x2="118" y2="230" stroke="#334155" stroke-width="4"/>`,
      // Parallel plates (x=176..388, y=126 & y=242)
      `<line x1="176" y1="126" x2="388" y2="126" stroke="#0f172a" stroke-width="4"/>`,
      `<line x1="176" y1="242" x2="388" y2="242" stroke="#0f172a" stroke-width="4"/>`,
      // Magnetic field crosses region
      `<rect x="176" y="132" width="332" height="104" fill="#eff6ff" fill-opacity="0.55" stroke="#93c5fd" stroke-width="1.2" stroke-dasharray="5,4"/>`,
    );
    for (const gx of [210, 270, 330, 390, 450]) {
      for (const gy of [154, 214]) {
        parts.push(
          `<text x="${gx}" y="${gy}" text-anchor="middle" font-size="13" fill="#0369a1">×</text>`,
        );
      }
    }
    // Straight undeflected beam through crossed fields, then circular arc deflection in pure B
    parts.push(
      `<line x1="72" y1="184" x2="388" y2="184" stroke="#1d4ed8" stroke-width="2.4" marker-end="url(#${arrB})"/>`,
      `<path d="M 388 184 Q 466 184 520 250" fill="none" stroke="#dc2626" stroke-width="2.4" stroke-dasharray="6,3"/>`,
      `<line x1="548" y1="96" x2="548" y2="276" stroke="#047857" stroke-width="4"/>`,
    );
    const vpLbl = hidden.has("plateVoltageV")
      ? "Vₚ"
      : (publicNumbers.push(vp), `Vₚ = ${fmtVal(vp)} V`);
    const dLbl = hidden.has("plateSeparationM")
      ? "d"
      : (publicNumbers.push(d), `d = ${fmtVal(d * 100)} cm`);
    const bLbl = hidden.has("magneticFieldT")
      ? "B (into page)"
      : (publicNumbers.push(B), `B = ${fmtVal(B * 1000)} mT (into page)`);

    parts.push(
      svgText(320, 28, "Thomson Crossed Electric & Magnetic Field Electron Tube", {
        size: 13.5,
        weight: "700",
        publicLabels,
      }),
      svgText(70, 224, "Heated cathode", { size: 11, fill: "#dc2626", publicLabels }),
      svgText(118, 126, "Anode", { size: 11.5, weight: "600", publicLabels }),
      svgText(282, 114, `+ plate (${vpLbl})`, { size: 12, weight: "600", publicLabels }),
      svgText(282, 264, `0 V plate (${dLbl})`, { size: 12, publicLabels }),
      svgText(344, 304, bLbl, { size: 12, fill: "#0369a1", weight: "600", publicLabels }),
      svgText(560, 84, "Screen", { size: 11.5, fill: "#047857", weight: "600", publicLabels }),
      svgText(462, 258, "Arc r", { size: 11.5, fill: "#dc2626", weight: "600", publicLabels }),
    );
  } else {
    const va = Number(spec.anodeVoltageV);
    const vaLbl = hidden.has("anodeVoltageV")
      ? "Vₐ"
      : (publicNumbers.push(va), `Vₐ = ${fmtVal(va)} V`);
    const rLbl = hidden.has("orbitRadiusM")
      ? "r"
      : (publicNumbers.push(r), `r = ${fmtVal(r * 100)} cm`);
    const bLbl = hidden.has("magneticFieldT")
      ? "B (into page)"
      : (publicNumbers.push(B), `B = ${fmtVal(B * 1000)} mT`);

    parts.push(
      `<circle cx="320" cy="186" r="126" fill="#f8fafc" stroke="#94a3b8" stroke-width="2"/>`,
      `<circle cx="320" cy="186" r="76" fill="none" stroke="#1d4ed8" stroke-width="2.8"/>`,
      `<circle cx="320" cy="186" r="3.5" fill="#0f172a"/>`,
      `<line x1="320" y1="186" x2="396" y2="186" stroke="#dc2626" stroke-width="1.8" stroke-dasharray="4,3"/>`,
      // Electron gun at bottom of circle
      `<rect x="242" y="254" width="66" height="18" rx="3" fill="#334155"/>`,
      `<line x1="308" y1="262" x2="334" y2="262" stroke="#1d4ed8" stroke-width="2.6" marker-end="url(#${arrB})"/>`,
    );
    for (const gx of [232, 408]) {
      for (const gy of [124, 248]) {
        parts.push(
          `<text x="${gx}" y="${gy}" text-anchor="middle" font-size="14" fill="#0369a1">×</text>`,
        );
      }
    }
    parts.push(
      svgText(320, 28, "Fine-Beam Tube in Uniform Magnetic Field", {
        size: 14,
        weight: "700",
        publicLabels,
      }),
      svgText(358, 176, rLbl, { size: 12.5, fill: "#dc2626", weight: "700", publicLabels }),
      svgText(142, 268, `Electron gun (${vaLbl})`, { size: 12, weight: "600", publicLabels }),
      svgText(514, 152, bLbl, { size: 12.5, fill: "#0369a1", weight: "600", publicLabels }),
      svgText(514, 172, "Uniform B into page", { size: 11.5, fill: "#475569", publicLabels }),
    );
  }

  return {
    visualFamily: "em-induction",
    svgMarkup: wrapSvg({
      title:
        mode === "fine-beam"
          ? "Fine-beam circular electron path in uniform magnetic field"
          : "Thomson crossed electric and magnetic field tube",
      defs,
      body: parts.join(""),
    }),
    rendererVersion: ALEVEL_OPT_AM_RENDERER_VERSION,
    publicNumbers,
    publicLabels,
  };
}

/* ========================================================================== */
/*  11. al-opt-tp-millikan-oildrop (Option 3.12 — Fields)                     */
/* ========================================================================== */

function validateMillikan(
  spec: Record<string, unknown>,
): DomainValidationResult {
  const issues: string[] = [];
  checkKind(spec, "al-opt-tp-millikan-oildrop", issues);
  if (!inRange(spec.oilDensityKgM3, 650, 1200)) {
    issues.push("oilDensityKgM3 must be in [650, 1200] kg m⁻³");
  }
  if (!inRange(spec.airViscosityPaS, 1.4e-5, 2.3e-5)) {
    issues.push("airViscosityPaS must be in [1.4e-5, 2.3e-5] Pa s");
  }
  if (!inRange(spec.terminalSpeedMs, 1e-5, 5e-3)) {
    issues.push("terminalSpeedMs must be in [1e-5, 5e-3] m s⁻¹");
  }
  if (!inRange(spec.plateSeparationM, 0.003, 0.06)) {
    issues.push("plateSeparationM must be in [0.003, 0.06] m");
  }
  if (!inRange(spec.balancingVoltageV, 20, 6000)) {
    issues.push("balancingVoltageV must be in [20, 6000] V");
  }
  return { valid: issues.length === 0, issues };
}

function solveMillikan(spec: Record<string, unknown>): DomainSolveOutput {
  const rho = Number(spec.oilDensityKgM3);
  const eta = Number(spec.airViscosityPaS);
  const v = Number(spec.terminalSpeedMs);
  const d = Number(spec.plateSeparationM);
  const V = Number(spec.balancingVoltageV);
  const g = ALEVEL_GRAVITY_MS2;

  const r = Math.sqrt((9 * eta * v) / (2 * rho * g));
  const vol = (4 / 3) * Math.PI * r ** 3;
  const mass = rho * vol;
  const weight = mass * g;
  const E = V / d;
  const Q = (weight * d) / V;
  const nExact = Q / ALEVEL_ELEMENTARY_CHARGE_C;

  const quantities: VerifiedQuantityMap = {
    oilDensityKgM3: rho,
    airViscosityPaS: eta,
    terminalSpeedMs: v,
    plateSeparationM: d,
    balancingVoltageV: V,
    gravityMs2: g,
    dropletRadiusM: r,
    dropletRadiusUm: r * 1e6,
    dropletMassKg: mass,
    dropletWeightN: weight,
    electricFieldVm: E,
    dropletChargeC: Q,
    elementaryChargeCount: nExact,
    nearestIntegerElectrons: Math.round(nExact),
    stokesAssumptionsAnchor:
      "droplet is spherical moves slowly in laminar airflow and upthrust from air is negligible",
    quantisationConclusionAnchor:
      "all measured droplet charges are integer multiples of the elementary charge proving charge is quantised",
    ionisationShiftAnchor:
      "losing an electron decreases upward electric force so a greater balancing potential difference is required",
    lorMillikanAnchor:
      "terminal velocity with field off yields droplet radius via Stokes law and balancing the stationary droplet with electric field reveals quantised charge",
  };

  return {
    solverId: "sixthphysics/al-opt-tp-millikan-oildrop/1.0.0",
    quantities,
    publicNumbers: [rho, eta, v, d, V, g],
  };
}

function renderMillikan(
  spec: Record<string, unknown>,
  options?: DomainRenderOptions,
): DomainRenderOutput {
  const hidden = getHiddenSet(spec, options);
  const d = Number(spec.plateSeparationM);
  const V = Number(spec.balancingVoltageV);
  const publicNumbers: number[] = [];
  const publicLabels: string[] = [];
  const arrBlue = safeMarkerId("mk-b", options);
  const arrRed = safeMarkerId("mk-r", options);
  const defs = [
    arrowMarkerDef(arrBlue, "#1d4ed8"),
    arrowMarkerDef(arrRed, "#dc2626"),
  ].join("");

  const vLbl = hidden.has("balancingVoltageV")
    ? "pd V"
    : (publicNumbers.push(V), `V = ${fmtVal(V)} V`);
  const dLbl = hidden.has("plateSeparationM")
    ? "d"
    : (publicNumbers.push(d), `d = ${fmtVal(d * 1000)} mm`);

  const body = [
    svgText(320, 28, "Millikan Oil-Drop Experiment: Two-Stage Force Balance", {
      size: 14,
      weight: "700",
      publicLabels,
    }),
    // Left panel: Field OFF (terminal speed)
    `<rect x="44" y="54" width="256" height="270" rx="10" fill="#f8fafc" stroke="#cbd5e1" stroke-width="1.6"/>`,
    svgText(172, 78, "Stage 1: Electric Field OFF", {
      size: 12.5,
      weight: "700",
      publicLabels,
    }),
    `<circle cx="172" cy="192" r="14" fill="#fbbf24" stroke="#b45309" stroke-width="2"/>`,
    `<line x1="172" y1="178" x2="172" y2="112" stroke="#1d4ed8" stroke-width="2.6" marker-end="url(#${arrBlue})"/>`,
    `<line x1="172" y1="206" x2="172" y2="274" stroke="#dc2626" stroke-width="2.6" marker-end="url(#${arrRed})"/>`,
    svgText(230, 140, "6πηrv", { size: 12.5, fill: "#1d4ed8", weight: "700", publicLabels }),
    svgText(214, 250, "mg", { size: 12.5, fill: "#dc2626", weight: "700", publicLabels }),
    svgText(172, 306, "Constant terminal speed v", { size: 11.5, fill: "#475569", publicLabels }),
    // Right panel: Field ON (stationary)
    `<rect x="340" y="54" width="256" height="270" rx="10" fill="#f8fafc" stroke="#cbd5e1" stroke-width="1.6"/>`,
    svgText(468, 78, "Stage 2: Electric Field ON", {
      size: 12.5,
      weight: "700",
      publicLabels,
    }),
    `<line x1="372" y1="104" x2="564" y2="104" stroke="#0f172a" stroke-width="4.5"/>`,
    `<line x1="372" y1="276" x2="564" y2="276" stroke="#0f172a" stroke-width="4.5"/>`,
    `<circle cx="468" cy="192" r="14" fill="#fbbf24" stroke="#b45309" stroke-width="2"/>`,
    `<line x1="468" y1="178" x2="468" y2="122" stroke="#1d4ed8" stroke-width="2.6" marker-end="url(#${arrBlue})"/>`,
    `<line x1="468" y1="206" x2="468" y2="262" stroke="#dc2626" stroke-width="2.6" marker-end="url(#${arrRed})"/>`,
    svgText(516, 146, "QV / d", { size: 12.5, fill: "#1d4ed8", weight: "700", publicLabels }),
    svgText(506, 244, "mg", { size: 12.5, fill: "#dc2626", weight: "700", publicLabels }),
    svgText(468, 97, vLbl, { size: 11.5, fill: "#0f172a", weight: "600", publicLabels }),
    svgText(384, 196, dLbl, { anchor: "start", size: 11.5, fill: "#475569", publicLabels }),
    svgText(468, 306, "Droplet held stationary", { size: 11.5, fill: "#475569", publicLabels }),
  ].join("");

  return {
    visualFamily: "fields",
    svgMarkup: wrapSvg({
      title: "Millikan oil-drop two-stage force balance diagram",
      defs,
      body,
    }),
    rendererVersion: ALEVEL_OPT_AM_RENDERER_VERSION,
    publicNumbers,
    publicLabels,
  };
}

/* ========================================================================== */
/*  12. al-opt-tp-light-hertz-maxwell (Option 3.12 — Waves)                   */
/* ========================================================================== */

function validateLightHertzMaxwell(
  spec: Record<string, unknown>,
): DomainValidationResult {
  const issues: string[] = [];
  checkKind(spec, "al-opt-tp-light-hertz-maxwell", issues);
  if (spec.mode === "hertz-polarisation") {
    if (!inRange(spec.nodeSpacingM, 0.04, 5)) {
      issues.push("nodeSpacingM must be in [0.04, 5] m");
    }
    if (!inRange(spec.detectorAngleDeg, 0, 360)) {
      issues.push("detectorAngleDeg must be in [0, 360] deg");
    }
  } else if (spec.mode === "refraction-corpuscular") {
    if (!inRange(spec.incidentAngleDeg, 10, 80)) {
      issues.push("incidentAngleDeg must be in [10, 80] deg");
    }
    if (!inRange(spec.refractiveIndex, 1.15, 1.8)) {
      issues.push("refractiveIndex must be in [1.15, 1.80]");
    }
  } else if (spec.mode === "fizeau-maxwell") {
    if (!inRange(spec.wheelTeeth, 100, 3000)) {
      issues.push("wheelTeeth must be in [100, 3000]");
    }
    if (!inRange(spec.mirrorDistanceM, 1000, 25000)) {
      issues.push("mirrorDistanceM must be in [1000, 25000] m");
    }
  } else {
    issues.push(
      'mode must be "hertz-polarisation", "refraction-corpuscular", or "fizeau-maxwell"',
    );
  }
  return { valid: issues.length === 0, issues };
}

function solveLightHertzMaxwell(
  spec: Record<string, unknown>,
): DomainSolveOutput {
  const maxwellC = 1 / Math.sqrt(ALEVEL_MU_0 * ALEVEL_EPSILON_0);
  const quantities: VerifiedQuantityMap = {
    maxwellSpeedMs: maxwellC,
    newtonVsHuygensAnchor:
      "Newton corpuscular theory predicted light travels faster in water whereas Huygens wave theory predicted light slows down in water confirmed by Foucault",
    hertzPolarisationAnchor:
      "detected signal varies as magnitude of cosine of rotation angle with maxima at zero and one hundred eighty degrees and zeros at ninety and two hundred seventy degrees proving radio waves are transverse",
    maxwellSignificanceAnchor:
      "calculating electromagnetic wave speed from permittivity and permeability matched the measured speed of light showing light is an electromagnetic wave",
    lorLightNatureAnchor:
      "Young double-slit interference and Foucault speed measurement disproved corpuscular theory while Maxwell equations and Hertz standing radio waves established light as transverse electromagnetic radiation",
  };
  const publicNumbers: number[] = [];

  if (spec.mode === "hertz-polarisation") {
    const nodeSpacing = Number(spec.nodeSpacingM);
    const angle = Number(spec.detectorAngleDeg);
    const peakMv = isPos(spec.peakAmplitudeMv) ? spec.peakAmplitudeMv : 120;
    const lam = 2 * nodeSpacing;
    const freqHz = ALEVEL_SPEED_OF_LIGHT_MS / lam;
    const ampFactor = Math.abs(Math.cos((angle * Math.PI) / 180));
    quantities.nodeSpacingM = nodeSpacing;
    quantities.detectorAngleDeg = angle;
    quantities.peakAmplitudeMv = peakMv;
    quantities.wavelengthM = lam;
    quantities.frequencyHz = freqHz;
    quantities.frequencyMHz = freqHz / 1e6;
    quantities.amplitudeFactor = ampFactor;
    quantities.detectedAmplitudeMv = peakMv * ampFactor;
    publicNumbers.push(nodeSpacing, angle, peakMv);
  } else if (spec.mode === "refraction-corpuscular") {
    const iDeg = Number(spec.incidentAngleDeg);
    const n = Number(spec.refractiveIndex);
    const rDeg =
      (Math.asin(Math.sin((iDeg * Math.PI) / 180) / n) * 180) / Math.PI;
    quantities.incidentAngleDeg = iDeg;
    quantities.refractiveIndex = n;
    quantities.refractedAngleDeg = rDeg;
    quantities.huygensSpeedInMediumMs = ALEVEL_SPEED_OF_LIGHT_MS / n;
    quantities.newtonPredictedSpeedMs = ALEVEL_SPEED_OF_LIGHT_MS * n;
    publicNumbers.push(iDeg, n);
  } else {
    const nTeeth = Number(spec.wheelTeeth);
    const dist = Number(spec.mirrorDistanceM);
    const fRev = ALEVEL_SPEED_OF_LIGHT_MS / (4 * nTeeth * dist);
    quantities.wheelTeeth = nTeeth;
    quantities.mirrorDistanceM = dist;
    quantities.firstEclipseFreqHz = fRev;
    quantities.roundTripTimeS = (2 * dist) / ALEVEL_SPEED_OF_LIGHT_MS;
    publicNumbers.push(nTeeth, dist);
  }

  return {
    solverId: "sixthphysics/al-opt-tp-light-hertz-maxwell/1.0.0",
    quantities,
    publicNumbers,
  };
}

function renderLightHertzMaxwell(
  spec: Record<string, unknown>,
  options?: DomainRenderOptions,
): DomainRenderOutput {
  const mode =
    spec.mode === "refraction-corpuscular"
      ? "refraction-corpuscular"
      : spec.mode === "fizeau-maxwell"
        ? "fizeau-maxwell"
        : "hertz-polarisation";
  const publicNumbers: number[] = [];
  const publicLabels: string[] = [];
  const arrB = safeMarkerId("hz-b", options);
  const defs = arrowMarkerDef(arrB, "#1d4ed8");
  const parts: string[] = [];

  if (mode === "hertz-polarisation") {
    const ox = 86;
    const oy = 278;
    const pw = 492;
    const ph = 188;
    parts.push(
      `<line x1="${ox}" y1="${oy}" x2="${ox + pw}" y2="${oy}" stroke="#334155" stroke-width="1.8"/>`,
      `<line x1="${ox}" y1="${oy}" x2="${ox}" y2="${oy - ph}" stroke="#334155" stroke-width="1.8"/>`,
    );
    for (const deg of [0, 90, 180, 270, 360]) {
      const px = ox + (deg / 360) * pw;
      parts.push(
        `<line x1="${c(px)}" y1="${oy - ph}" x2="${c(px)}" y2="${oy}" stroke="#e2e8f0" stroke-width="1"/>`,
        svgText(px, oy + 20, `${deg}°`, { size: 11.5, publicLabels }),
      );
      publicNumbers.push(deg);
    }
    const pts: string[] = [];
    for (let deg = 0; deg <= 360; deg += 4) {
      const px = ox + (deg / 360) * pw;
      const py = oy - Math.abs(Math.cos((deg * Math.PI) / 180)) * (ph - 16);
      pts.push(`${c(px)},${c(py)}`);
    }
    parts.push(
      `<polyline points="${pts.join(" ")}" fill="none" stroke="#1d4ed8" stroke-width="2.6"/>`,
      svgText(320, 28, "Hertz Radio-Wave Dipole Polarisation Response", {
        size: 14,
        weight: "700",
        publicLabels,
      }),
      svgText(ox + pw / 2, 328, "Detector dipole rotation angle θ", {
        size: 12.5,
        weight: "600",
        publicLabels,
      }),
      svgText(30, oy - ph / 2, "Detected signal amplitude", {
        size: 12.5,
        weight: "600",
        rotate: `rotate(-90 30 ${c(oy - ph / 2)})`,
        publicLabels,
      }),
      svgText(ox + pw * 0.25, oy - 16, "Null", { size: 11, fill: "#dc2626", weight: "600", publicLabels }),
      svgText(ox + pw * 0.75, oy - 16, "Null", { size: 11, fill: "#dc2626", weight: "600", publicLabels }),
    );
  } else if (mode === "refraction-corpuscular") {
    // Air-water boundary at y=184
    parts.push(
      `<rect x="52" y="184" width="536" height="134" fill="#e0f2fe"/>`,
      `<line x1="52" y1="184" x2="588" y2="184" stroke="#0369a1" stroke-width="2.4"/>`,
      `<line x1="320" y1="60" x2="320" y2="314" stroke="#64748b" stroke-width="1.4" stroke-dasharray="5,4"/>`,
      // Incident ray & refracted ray (bending toward normal)
      `<line x1="176" y1="76" x2="320" y2="184" stroke="#1d4ed8" stroke-width="2.6" marker-end="url(#${arrB})"/>`,
      `<line x1="320" y1="184" x2="404" y2="306" stroke="#1d4ed8" stroke-width="2.6" marker-end="url(#${arrB})"/>`,
      // Wavefronts in air (wider spacing) & in water (shorter spacing)
      `<line x1="194" y1="126" x2="236" y2="70" stroke="#0d9488" stroke-width="2"/>`,
      `<line x1="230" y1="154" x2="272" y2="98" stroke="#0d9488" stroke-width="2"/>`,
      `<line x1="326" y1="230" x2="366" y2="202" stroke="#0d9488" stroke-width="2"/>`,
      `<line x1="346" y1="258" x2="386" y2="230" stroke="#0d9488" stroke-width="2"/>`,
      `<line x1="366" y1="286" x2="406" y2="258" stroke="#0d9488" stroke-width="2"/>`,
      svgText(320, 28, "Refraction at Air–Water Boundary: Huygens Wavefronts", {
        size: 14,
        weight: "700",
        publicLabels,
      }),
      svgText(104, 168, "Air (speed c)", { size: 12.5, weight: "600", publicLabels }),
      svgText(112, 212, "Water (refractive index n)", { size: 12.5, fill: "#0369a1", weight: "600", publicLabels }),
      svgText(344, 78, "Normal", { size: 11.5, fill: "#64748b", publicLabels }),
      svgText(298, 140, "θ₁", { size: 12.5, fill: "#1d4ed8", weight: "700", publicLabels }),
      svgText(338, 250, "θ₂", { size: 12.5, fill: "#1d4ed8", weight: "700", publicLabels }),
      svgText(490, 294, "Shorter λ in water", { size: 11.5, fill: "#0d9488", weight: "600", publicLabels }),
    );
  } else {
    // Fizeau toothed wheel & EM wave schematic
    parts.push(
      // Light source -> beam splitter -> toothed wheel -> distant mirror
      `<circle cx="78" cy="242" r="14" fill="#fde68a" stroke="#d97706" stroke-width="2"/>`,
      `<line x1="78" y1="228" x2="78" y2="150" stroke="#dc2626" stroke-width="2"/>`,
      // Semi-silvered mirror at (78, 150) tilted 45 deg
      `<line x1="60" y1="132" x2="96" y2="168" stroke="#334155" stroke-width="3"/>`,
      // Horizontal light beam to distant mirror at x=560
      `<line x1="78" y1="150" x2="554" y2="150" stroke="#1d4ed8" stroke-width="2.4" marker-end="url(#${arrB})"/>`,
      `<line x1="554" y1="158" x2="86" y2="158" stroke="#0d9488" stroke-width="2" stroke-dasharray="6,3"/>`,
      // Rotating toothed wheel at x=216
      `<circle cx="216" cy="204" r="54" fill="#f1f5f9" stroke="#334155" stroke-width="4" stroke-dasharray="10,6"/>`,
      `<circle cx="216" cy="204" r="8" fill="#334155"/>`,
      // Distant mirror at x=558
      `<rect x="556" y="102" width="10" height="96" fill="#0f172a"/>`,
      // Distance bracket d
      `<line x1="216" y1="92" x2="556" y2="92" stroke="#334155" stroke-width="1.5"/>`,
      `<line x1="216" y1="86" x2="216" y2="98" stroke="#334155" stroke-width="1.5"/>`,
      `<line x1="556" y1="86" x2="556" y2="98" stroke="#334155" stroke-width="1.5"/>`,
      svgText(320, 28, "Fizeau Toothed-Wheel Speed of Light & Maxwell EM Wave", {
        size: 13.5,
        weight: "700",
        publicLabels,
      }),
      svgText(78, 276, "Light source", { size: 11.5, publicLabels }),
      svgText(216, 282, "Toothed wheel (n teeth)", { size: 12, weight: "600", publicLabels }),
      svgText(386, 82, "Distance d", { size: 12.5, weight: "600", publicLabels }),
      svgText(554, 220, "Distant mirror", { size: 11.5, weight: "600", publicLabels }),
      svgText(406, 292, "Maxwell: c = 1 / √(μ₀ε₀)", { size: 12.5, fill: "#1d4ed8", weight: "600", publicLabels }),
    );
  }

  return {
    visualFamily: "waves",
    svgMarkup: wrapSvg({
      title: "Turning points wave nature of light, Maxwell, and Hertz diagram",
      defs,
      body: parts.join(""),
    }),
    rendererVersion: ALEVEL_OPT_AM_RENDERER_VERSION,
    publicNumbers,
    publicLabels,
  };
}

/* ========================================================================== */
/*  13. al-opt-tp-electron-microscopy (Option 3.12 — Quantum-Nuclear)         */
/* ========================================================================== */

function validateElectronMicroscopy(
  spec: Record<string, unknown>,
): DomainValidationResult {
  const issues: string[] = [];
  checkKind(spec, "al-opt-tp-electron-microscopy", issues);
  if (spec.mode !== "tem-debroglie" && spec.mode !== "stm-tunnelling") {
    issues.push('mode must be "tem-debroglie" or "stm-tunnelling"');
  }
  if (!inRange(spec.anodeVoltageV, 50, 500000)) {
    issues.push("anodeVoltageV must be in [50, 500000] V");
  }
  if (
    spec.secondAnodeVoltageV !== undefined &&
    !inRange(spec.secondAnodeVoltageV, 50, 500000)
  ) {
    issues.push("secondAnodeVoltageV must be in [50, 500000] V");
  }
  if (spec.decayConstantPerNm !== undefined && !inRange(spec.decayConstantPerNm, 4, 30)) {
    issues.push("decayConstantPerNm must be in [4, 30] nm⁻¹");
  }
  if (spec.deltaGapNm !== undefined && !inRange(spec.deltaGapNm, 0.02, 0.8)) {
    issues.push("deltaGapNm must be in [0.02, 0.8] nm");
  }
  return { valid: issues.length === 0, issues };
}

function solveElectronMicroscopy(
  spec: Record<string, unknown>,
): DomainSolveOutput {
  const V = Number(spec.anodeVoltageV);
  const p = Math.sqrt(2 * ALEVEL_ELECTRON_MASS_KG * ALEVEL_ELEMENTARY_CHARGE_C * V);
  const lamM = ALEVEL_PLANCK_JS / p;
  const speed = p / ALEVEL_ELECTRON_MASS_KG;

  const quantities: VerifiedQuantityMap = {
    anodeVoltageV: V,
    electronMomentumKgMs: p,
    electronSpeedMs: speed,
    deBroglieWavelengthM: lamM,
    deBroglieWavelengthPm: lamM * 1e12,
    temResolutionLimitAnchor:
      "sample thickness slows electrons increasing wavelength and magnetic lens aberrations with spread of speeds blur the image",
    stmTunnellingAnchor:
      "electrons cross the narrow vacuum gap by quantum tunnelling with current decaying exponentially as gap width increases",
    stmModeAnchor:
      "constant current mode uses piezoelectric feedback to adjust tip height whereas constant height mode measures tunnelling current changes",
    lorMicroscopyAnchor:
      "TEM uses high accelerating potential to shorten electron de Broglie wavelength while STM uses exponential quantum tunnelling sensitivity across a nanometre gap",
  };
  const publicNumbers: number[] = [V];

  if (isPos(spec.secondAnodeVoltageV)) {
    const v2 = spec.secondAnodeVoltageV;
    const lam2M =
      ALEVEL_PLANCK_JS /
      Math.sqrt(2 * ALEVEL_ELECTRON_MASS_KG * ALEVEL_ELEMENTARY_CHARGE_C * v2);
    quantities.secondAnodeVoltageV = v2;
    quantities.secondWavelengthPm = lam2M * 1e12;
    quantities.wavelengthRatio = Math.sqrt(V / v2);
    publicNumbers.push(v2);
  }
  if (isPos(spec.decayConstantPerNm) && isPos(spec.deltaGapNm)) {
    const k = spec.decayConstantPerNm;
    const dx = spec.deltaGapNm;
    const i0 = isPos(spec.initialCurrentNa) ? spec.initialCurrentNa : 4.0;
    const ratio = Math.exp(-k * dx);
    quantities.decayConstantPerNm = k;
    quantities.deltaGapNm = dx;
    quantities.initialCurrentNa = i0;
    quantities.tunnellingCurrentRatio = ratio;
    quantities.newCurrentNa = i0 * ratio;
    publicNumbers.push(k, dx, i0);
  }

  return {
    solverId: "sixthphysics/al-opt-tp-electron-microscopy/1.0.0",
    quantities,
    publicNumbers,
  };
}

function renderElectronMicroscopy(
  spec: Record<string, unknown>,
  options?: DomainRenderOptions,
): DomainRenderOutput {
  const hidden = getHiddenSet(spec, options);
  const mode = spec.mode === "stm-tunnelling" ? "stm-tunnelling" : "tem-debroglie";
  const V = Number(spec.anodeVoltageV);
  const publicNumbers: number[] = [];
  const publicLabels: string[] = [];
  const parts: string[] = [];

  if (mode === "tem-debroglie") {
    const vLbl = hidden.has("anodeVoltageV")
      ? "Anode pd V"
      : (publicNumbers.push(V), `V = ${fmtVal(V / 1000)} kV`);
    // Vertical TEM column at x=240
    parts.push(
      `<rect x="132" y="46" width="216" height="284" rx="8" fill="#f8fafc" stroke="#94a3b8" stroke-width="1.8"/>`,
      // Electron gun
      `<rect x="202" y="56" width="76" height="24" rx="4" fill="#334155"/>`,
      // Magnetic lens coils (Condenser y=116, Objective y=200, Projector y=262)
      ...[116, 200, 262].map(
        (ly) =>
          `<rect x="150" y="${ly - 10}" width="52" height="20" rx="4" fill="#dbeafe" stroke="#1d4ed8" stroke-width="1.8"/>` +
          `<rect x="278" y="${ly - 10}" width="52" height="20" rx="4" fill="#dbeafe" stroke="#1d4ed8" stroke-width="1.8"/>`,
      ),
      // Thin specimen at y=160
      `<line x1="196" y1="160" x2="284" y2="160" stroke="#dc2626" stroke-width="3.5"/>`,
      // Fluorescent screen at y=312
      `<line x1="164" y1="312" x2="316" y2="312" stroke="#16a34a" stroke-width="5"/>`,
      // Electron beam envelope
      `<path d="M 240 80 L 218 116 L 222 160 L 210 200 L 236 262 L 182 312" fill="none" stroke="#1d4ed8" stroke-width="2"/>`,
      `<path d="M 240 80 L 262 116 L 258 160 L 270 200 L 244 262 L 298 312" fill="none" stroke="#1d4ed8" stroke-width="2"/>`,
      svgText(320, 28, "Transmission Electron Microscope (TEM) Magnetic-Lens Column", {
        size: 13.5,
        weight: "700",
        publicLabels,
      }),
      svgText(466, 72, `Electron gun (${vLbl})`, { size: 12, weight: "600", publicLabels }),
      svgText(466, 120, "Condenser magnetic lens", { size: 12, fill: "#1d4ed8", publicLabels }),
      svgText(466, 164, "Ultra-thin specimen", { size: 12, fill: "#dc2626", weight: "600", publicLabels }),
      svgText(466, 204, "Objective magnetic lens", { size: 12, fill: "#1d4ed8", publicLabels }),
      svgText(466, 266, "Projector magnetic lens", { size: 12, fill: "#1d4ed8", publicLabels }),
      svgText(466, 316, "Fluorescent viewing screen", { size: 12, fill: "#15803d", weight: "600", publicLabels }),
    );
  } else {
    // Left panel: STM tip above surface atoms; Right panel: exponential I vs gap d
    parts.push(
      `<rect x="36" y="54" width="262" height="270" rx="8" fill="#f8fafc" stroke="#cbd5e1" stroke-width="1.6"/>`,
      // Piezo actuator & sharp tip
      `<rect x="136" y="76" width="62" height="36" rx="4" fill="#fef3c7" stroke="#d97706" stroke-width="1.8"/>`,
      `<polygon points="148,112 186,112 167,196" fill="#64748b" stroke="#1e293b" stroke-width="1.8"/>`,
      // Atomic surface row (step feature on right)
      ...[72, 110, 148, 186].map(
        (ax) => `<circle cx="${ax}" cy="244" r="17" fill="#dbeafe" stroke="#1d4ed8" stroke-width="1.8"/>`,
      ),
      ...[224, 262].map(
        (ax) => `<circle cx="${ax}" cy="224" r="17" fill="#dbeafe" stroke="#1d4ed8" stroke-width="1.8"/>`,
      ),
      // Tunnelling gap dashed bracket
      `<line x1="167" y1="198" x2="167" y2="226" stroke="#dc2626" stroke-width="2" stroke-dasharray="3,2"/>`,
      // Right panel: exponential I vs gap width d plot
      `<line x1="364" y1="280" x2="594" y2="280" stroke="#334155" stroke-width="1.8"/>`,
      `<line x1="364" y1="280" x2="364" y2="86" stroke="#334155" stroke-width="1.8"/>`,
    );
    const expPts: string[] = [];
    for (let i = 0; i <= 50; i += 1) {
      const u = i / 50;
      const px = 374 + u * 212;
      const py = 280 - Math.exp(-4.2 * u) * 176;
      expPts.push(`${c(px)},${c(py)}`);
    }
    parts.push(
      `<polyline points="${expPts.join(" ")}" fill="none" stroke="#dc2626" stroke-width="2.6"/>`,
      svgText(320, 28, "Scanning Tunnelling Microscope (STM) & Exponential Tunnelling", {
        size: 13.5,
        weight: "700",
        publicLabels,
      }),
      svgText(167, 99, "Piezo", { size: 11.5, fill: "#b45309", weight: "700", publicLabels }),
      svgText(214, 166, "Tip", { size: 11.5, weight: "600", publicLabels }),
      svgText(202, 214, "Gap d", { size: 11.5, fill: "#dc2626", weight: "700", publicLabels }),
      svgText(167, 296, "Conducting sample atoms", { size: 11.5, fill: "#1d4ed8", publicLabels }),
      svgText(482, 310, "Vacuum gap width d / nm", { size: 12, weight: "600", publicLabels }),
      svgText(344, 184, "Tunnelling current I", {
        size: 12,
        weight: "600",
        rotate: "rotate(-90 344 184)",
        publicLabels,
      }),
      svgText(496, 134, "Exponential decay", { size: 11.5, fill: "#dc2626", weight: "600", publicLabels }),
    );
  }

  return {
    visualFamily: "quantum-nuclear",
    svgMarkup: wrapSvg({
      title:
        mode === "stm-tunnelling"
          ? "Scanning tunnelling microscope tip and exponential current curve"
          : "Transmission electron microscope magnetic lens column",
      body: parts.join(""),
    }),
    rendererVersion: ALEVEL_OPT_AM_RENDERER_VERSION,
    publicNumbers,
    publicLabels,
  };
}

/* ========================================================================== */
/*  14. al-opt-tp-michelson-relativity (Option 3.12 — Quantum-Nuclear)        */
/* ========================================================================== */

function validateMichelsonRelativity(
  spec: Record<string, unknown>,
): DomainValidationResult {
  const issues: string[] = [];
  checkKind(spec, "al-opt-tp-michelson-relativity", issues);
  if (spec.mode !== "interferometer" && spec.mode !== "bertozzi") {
    issues.push('mode must be "interferometer" or "bertozzi"');
  }
  if (!inRange(spec.speedFractionC, 0.1, 0.9995)) {
    issues.push("speedFractionC must be in [0.10, 0.9995]");
  }
  if (spec.properTimeUs !== undefined && !inRange(spec.properTimeUs, 0.05, 1000)) {
    issues.push("properTimeUs must be in [0.05, 1000] μs");
  }
  if (spec.properLengthM !== undefined && !inRange(spec.properLengthM, 1, 1e6)) {
    issues.push("properLengthM must be in [1, 1e6] m");
  }
  if (
    spec.particleRestMassKg !== undefined &&
    !inRange(spec.particleRestMassKg, 1e-32, 1e-24)
  ) {
    issues.push("particleRestMassKg must be in [1e-32, 1e-24] kg");
  }
  return { valid: issues.length === 0, issues };
}

function solveMichelsonRelativity(
  spec: Record<string, unknown>,
): DomainSolveOutput {
  const beta = Number(spec.speedFractionC);
  const v = beta * ALEVEL_SPEED_OF_LIGHT_MS;
  const gamma = 1 / Math.sqrt(1 - beta * beta);
  const m0 = isPos(spec.particleRestMassKg)
    ? spec.particleRestMassKg
    : ALEVEL_ELECTRON_MASS_KG;
  const restEJ = m0 * ALEVEL_SPEED_OF_LIGHT_MS ** 2;
  const restEMeV = restEJ / (ALEVEL_ELEMENTARY_CHARGE_C * 1e6);
  const totalEJ = gamma * restEJ;
  const totalEMeV = gamma * restEMeV;
  const relKeJ = (gamma - 1) * restEJ;
  const relKeMeV = (gamma - 1) * restEMeV;
  const classKeJ = 0.5 * m0 * v * v;
  const classKeMeV = classKeJ / (ALEVEL_ELEMENTARY_CHARGE_C * 1e6);

  const quantities: VerifiedQuantityMap = {
    speedFractionC: beta,
    speedMs: v,
    lorentzFactor: gamma,
    restEnergyJ: restEJ,
    restEnergyMeV: restEMeV,
    totalEnergyJ: totalEJ,
    totalEnergyMeV: totalEMeV,
    relativisticKeJ: relKeJ,
    relativisticKeMeV: relKeMeV,
    classicalKeJ: classKeJ,
    classicalKeMeV: classKeMeV,
    actualBetaSq: beta * beta,
    einsteinPostulatesAnchor:
      "laws of physics have the same form in all inertial frames and the speed of light in free space is invariant",
    mmNullResultAnchor:
      "zero fringe shift on ninety degree rotation disproved absolute motion through an ether and supported invariant light speed",
    muonFrameAnchor:
      "in Earth frame muon lifetime is time dilated whereas in the muon rest frame atmosphere depth is length contracted",
    bertozziAnchor:
      "electron speed approaches the speed of light asymptotically as kinetic energy increases rather than following the classical straight line",
    lorMichelsonAnchor:
      "splitting coherent light along perpendicular arms and rotating ninety degrees produced a null fringe shift disproving the ether and confirming invariant light speed",
  };
  const publicNumbers: number[] = [beta];

  if (isPos(spec.properTimeUs)) {
    const t0 = spec.properTimeUs;
    const tDil = gamma * t0;
    const distEarthM = v * tDil * 1e-6;
    const distMuonM = distEarthM / gamma;
    quantities.properTimeUs = t0;
    quantities.dilatedTimeUs = tDil;
    quantities.earthFrameDistanceM = distEarthM;
    quantities.muonFrameDistanceM = distMuonM;
    publicNumbers.push(t0);
  }
  if (isPos(spec.properLengthM)) {
    const l0 = spec.properLengthM;
    quantities.properLengthM = l0;
    quantities.contractedLengthM = l0 / gamma;
    publicNumbers.push(l0);
  }

  return {
    solverId: "sixthphysics/al-opt-tp-michelson-relativity/1.0.0",
    quantities,
    publicNumbers,
  };
}

function renderMichelsonRelativity(
  spec: Record<string, unknown>,
  options?: DomainRenderOptions,
): DomainRenderOutput {
  const mode = spec.mode === "bertozzi" ? "bertozzi" : "interferometer";
  const publicNumbers: number[] = [];
  const publicLabels: string[] = [];
  const arrB = safeMarkerId("mm-b", options);
  const defs = arrowMarkerDef(arrB, "#1d4ed8");
  const parts: string[] = [];

  if (mode === "interferometer") {
    // Michelson-Morley apparatus schematic
    parts.push(
      // Light source on left
      `<rect x="52" y="168" width="76" height="32" rx="5" fill="#fef3c7" stroke="#d97706" stroke-width="1.8"/>`,
      // Beam splitter at (290, 184) tilted 45 deg
      `<line x1="262" y1="156" x2="318" y2="212" stroke="#0369a1" stroke-width="4"/>`,
      // Compensator plate parallel to splitter
      `<line x1="334" y1="156" x2="364" y2="186" stroke="#93c5fd" stroke-width="3"/>`,
      // Mirror M1 at top (290, 68), Mirror M2 at right (480, 184)
      `<rect x="248" y="60" width="84" height="10" fill="#0f172a"/>`,
      `<rect x="480" y="142" width="10" height="84" fill="#0f172a"/>`,
      // Observing telescope at bottom (290, 290)
      `<rect x="272" y="286" width="36" height="46" rx="4" fill="#e2e8f0" stroke="#334155" stroke-width="1.8"/>`,
      // Optical paths
      `<line x1="128" y1="184" x2="286" y2="184" stroke="#1d4ed8" stroke-width="2.4" marker-end="url(#${arrB})"/>`,
      `<line x1="290" y1="184" x2="290" y2="74" stroke="#1d4ed8" stroke-width="2.2" marker-end="url(#${arrB})"/>`,
      `<line x1="294" y1="74" x2="294" y2="282" stroke="#dc2626" stroke-width="1.8" stroke-dasharray="5,3"/>`,
      `<line x1="290" y1="184" x2="476" y2="184" stroke="#1d4ed8" stroke-width="2.2" marker-end="url(#${arrB})"/>`,
      `<line x1="476" y1="188" x2="294" y2="188" stroke="#dc2626" stroke-width="1.8" stroke-dasharray="5,3"/>`,
      // Rotation arrow indicating 90 deg rotation of granite table
      `<path d="M 526 246 A 42 42 0 0 1 562 288" fill="none" stroke="#047857" stroke-width="2.2" marker-end="url(#${arrB})"/>`,
      svgText(320, 28, "Michelson–Morley Interferometer Schematic", {
        size: 14,
        weight: "700",
        publicLabels,
      }),
      svgText(90, 188, "Source", { size: 12, fill: "#b45309", weight: "600", publicLabels }),
      svgText(290, 52, "Mirror M₁", { size: 12, weight: "600", publicLabels }),
      svgText(530, 188, "Mirror M₂", { size: 12, weight: "600", publicLabels }),
      svgText(224, 218, "Beam splitter", { size: 11.5, fill: "#0369a1", publicLabels }),
      svgText(392, 152, "Compensator", { size: 11, fill: "#475569", publicLabels }),
      svgText(362, 314, "Observer telescope", { size: 12, weight: "600", publicLabels }),
      svgText(548, 312, "Rotate 90°", { size: 11.5, fill: "#047857", weight: "600", publicLabels }),
    );
  } else {
    // Bertozzi v^2/c^2 vs kinetic energy E_k (MeV) plot
    const ox = 86;
    const oy = 282;
    const pw = 492;
    const ph = 204;
    const ekMax = 4.0; // MeV
    const yMax = 2.0; // v^2 / c^2
    const xOfEk = (ek: number) => ox + (ek / ekMax) * pw;
    const yOfB2 = (b2: number) => oy - (b2 / yMax) * ph;
    const restMeV = 0.511;

    parts.push(
      `<line x1="${ox}" y1="${oy}" x2="${ox + pw}" y2="${oy}" stroke="#334155" stroke-width="1.8"/>`,
      `<line x1="${ox}" y1="${oy}" x2="${ox}" y2="${oy - ph}" stroke="#334155" stroke-width="1.8"/>`,
      // Asymptote v^2/c^2 = 1.0
      `<line x1="${ox}" y1="${c(yOfB2(1.0))}" x2="${ox + pw}" y2="${c(yOfB2(1.0))}" stroke="#047857" stroke-width="1.6" stroke-dasharray="6,4"/>`,
    );
    for (const ek of [0, 1, 2, 3, 4]) {
      const px = xOfEk(ek);
      parts.push(
        `<line x1="${c(px)}" y1="${oy - ph}" x2="${c(px)}" y2="${oy}" stroke="#e2e8f0" stroke-width="1"/>`,
        svgText(px, oy + 20, String(ek), { size: 11.5, publicLabels }),
      );
      publicNumbers.push(ek);
    }
    for (const b2 of [0, 0.5, 1.0, 1.5, 2.0]) {
      const py = yOfB2(b2);
      parts.push(
        `<line x1="${ox}" y1="${c(py)}" x2="${ox + pw}" y2="${c(py)}" stroke="#e2e8f0" stroke-width="1"/>`,
        svgText(ox - 10, py + 4, b2.toFixed(1), {
          anchor: "end",
          size: 11.5,
          publicLabels,
        }),
      );
      publicNumbers.push(b2);
    }
    // Classical straight line: v^2/c^2 = 2 E_k / (m_0 c^2), clipped at y=2.0 (E_k = 0.511 MeV)
    parts.push(
      `<line x1="${ox}" y1="${oy}" x2="${c(xOfEk(0.511))}" y2="${c(yOfB2(2.0))}" stroke="#dc2626" stroke-width="2" stroke-dasharray="6,4"/>`,
    );
    // Relativistic Bertozzi curve: v^2/c^2 = 1 - 1 / (1 + E_k / m_0 c^2)^2
    const relPts: string[] = [];
    for (let i = 0; i <= 80; i += 1) {
      const ek = (ekMax * i) / 80;
      const g = 1 + ek / restMeV;
      const b2 = 1 - 1 / (g * g);
      relPts.push(`${c(xOfEk(ek))},${c(yOfB2(b2))}`);
    }
    parts.push(
      `<polyline points="${relPts.join(" ")}" fill="none" stroke="#1d4ed8" stroke-width="2.8"/>`,
    );
    for (const ekDot of [0.5, 1.0, 1.5, 2.5, 3.6]) {
      const g = 1 + ekDot / restMeV;
      const b2 = 1 - 1 / (g * g);
      parts.push(
        `<circle cx="${c(xOfEk(ekDot))}" cy="${c(yOfB2(b2))}" r="4" fill="#0f172a"/>`,
      );
    }
    parts.push(
      svgText(320, 28, "Bertozzi Experiment: Relativistic vs Classical Electron Speed", {
        size: 13.5,
        weight: "700",
        publicLabels,
      }),
      svgText(xOfEk(0.88), yOfB2(1.74), "Classical prediction", {
        size: 11.5,
        fill: "#dc2626",
        weight: "600",
        publicLabels,
      }),
      svgText(xOfEk(2.7), yOfB2(1.12), "Asymptote v²/c² = 1", {
        size: 11.5,
        fill: "#047857",
        weight: "600",
        publicLabels,
      }),
      svgText(xOfEk(2.6), yOfB2(0.76), "Relativistic curve (Bertozzi data)", {
        size: 11.5,
        fill: "#1d4ed8",
        weight: "600",
        publicLabels,
      }),
      svgText(ox + pw / 2, 330, "Electron kinetic energy Eₖ / MeV", {
        size: 12.5,
        weight: "600",
        publicLabels,
      }),
      svgText(28, oy - ph / 2, "Squared speed ratio v² / c²", {
        size: 12.5,
        weight: "600",
        rotate: `rotate(-90 28 ${c(oy - ph / 2)})`,
        publicLabels,
      }),
    );
  }

  return {
    visualFamily: "quantum-nuclear",
    svgMarkup: wrapSvg({
      title:
        mode === "bertozzi"
          ? "Bertozzi relativistic versus classical kinetic energy curve"
          : "Michelson-Morley interferometer schematic",
      defs,
      body: parts.join(""),
    }),
    rendererVersion: ALEVEL_OPT_AM_RENDERER_VERSION,
    publicNumbers,
    publicLabels,
  };
}

/* ========================================================================== */
/*  Exported 14-Plugin Registry Table (Spec C: Options 3.9, 3.10, 3.12)       */
/* ========================================================================== */

const F = (
  name: string,
  type: string,
  extra: Omit<DomainKindFieldSpec, "name" | "type"> = {},
): DomainKindFieldSpec => ({ name, type, ...extra });

export const ALEVEL_OPTIONS_ASTROMED_PLUGINS: readonly DomainKindPlugin[] = [
  // ---- OPTION 3.9 ASTROPHYSICS (4 plugins) ----
  {
    domain: "optics-shm",
    kind: "al-opt-astro-telescope-optics",
    summary:
      "AQA 3.9 refracting (normal adjustment M = f_o/f_e, L = f_o + f_e) and Cassegrain reflecting telescopes, aberrations, and aperture collecting area.",
    requiredFields: [
      F("mode", "enum", { enumValues: ["refractor", "cassegrain"] }),
      F("objectiveFocalLengthM", "number", { unit: "m", bounds: "0.2..40" }),
      F("eyepieceFocalLengthM", "number", { unit: "m", bounds: "0.002..0.5" }),
      F("apertureDiameterM", "number", { unit: "m", bounds: "0.03..15" }),
    ],
    optionalFields: [
      F("secondaryDiameterM", "number", { unit: "m" }),
      F("lensBlueFocalM", "number", { unit: "m" }),
      F("lensRedFocalM", "number", { unit: "m" }),
    ],
    physicalConstraints: [
      "objectiveFocalLengthM > eyepieceFocalLengthM > 0",
      "Normal adjustment places focal points coincident so L = f_o + f_e and image forms at infinity",
      "Cassegrain uses concave parabolic primary mirror and convex secondary mirror",
    ],
    probeSpecs: [
      {
        kind: "al-opt-astro-telescope-optics",
        mode: "refractor",
        objectiveFocalLengthM: 1.8,
        eyepieceFocalLengthM: 0.03,
        apertureDiameterM: 0.15,
      },
      {
        kind: "al-opt-astro-telescope-optics",
        mode: "cassegrain",
        objectiveFocalLengthM: 12.0,
        eyepieceFocalLengthM: 0.04,
        apertureDiameterM: 2.4,
        secondaryDiameterM: 0.6,
      },
    ],
    validate: validateTelescopeOptics,
    solve: solveTelescopeOptics,
    renderSvg: renderTelescopeOptics,
  },
  {
    domain: "waves",
    kind: "al-opt-astro-resolution-ccd",
    summary:
      "AQA 3.9 Rayleigh criterion (theta ≈ lambda/D), collecting power proportional to D^2, radio vs optical windows, and CCD quantum efficiency.",
    requiredFields: [
      F("mode", "enum", { enumValues: ["airy-rayleigh", "aperture-compare"] }),
      F("wavelengthM", "number", { unit: "m", bounds: "1e-12..30" }),
      F("apertureDiameterM", "number", { unit: "m", bounds: "0.01..600" }),
    ],
    optionalFields: [
      F("distanceM", "number", { unit: "m" }),
      F("secondApertureDiameterM", "number", { unit: "m" }),
      F("secondWavelengthM", "number", { unit: "m" }),
      F("ccdQuantumEfficiencyPct", "number", { unit: "%" }),
      F("eyeQuantumEfficiencyPct", "number", { unit: "%" }),
    ],
    physicalConstraints: [
      "Strict AQA Rayleigh equation: theta ≈ lambda / D (no 1.22 factor)",
      "Collecting power scales with aperture diameter squared",
    ],
    probeSpecs: [
      {
        kind: "al-opt-astro-resolution-ccd",
        mode: "airy-rayleigh",
        wavelengthM: 5.5e-7,
        apertureDiameterM: 2.2,
        distanceM: 3.84e8,
      },
      {
        kind: "al-opt-astro-resolution-ccd",
        mode: "aperture-compare",
        wavelengthM: 0.21,
        apertureDiameterM: 76,
        secondApertureDiameterM: 3.8,
        secondWavelengthM: 5.0e-7,
      },
    ],
    validate: validateResolutionCcd,
    solve: solveResolutionCcd,
    renderSvg: renderResolutionCcd,
  },
  {
    domain: "grav-astro",
    kind: "al-opt-astro-magnitude-supernovae",
    summary:
      "AQA 3.9 apparent/absolute magnitude, distance modulus m - M = 5 lg(d/10), Hipparcos intensity ratio 2.51^Delta_m, Type Ia supernovae, dark energy, and Hubble law (H = 65 km s^-1 Mpc^-1).",
    requiredFields: [
      F("mode", "enum", {
        enumValues: ["supernova-lightcurve", "hubble-expansion"],
      }),
      F("apparentMagnitude", "number", { bounds: "-30..30" }),
      F("absoluteMagnitude", "number", { bounds: "-25..20" }),
    ],
    optionalFields: [
      F("secondApparentMagnitude", "number", { bounds: "-30..30" }),
      F("redshiftZ", "number", { bounds: "0.0005..0.5" }),
      F("hubbleConstantKmSMpc", "number", { unit: "km s⁻¹ Mpc⁻¹", bounds: "50..90" }),
    ],
    physicalConstraints: [
      "Distance d in distance modulus m - M = 5 lg(d/10) is strictly in parsecs",
      "AQA Data Sheet Hubble constant H = 65 km s⁻¹ Mpc⁻¹",
    ],
    probeSpecs: [
      {
        kind: "al-opt-astro-magnitude-supernovae",
        mode: "supernova-lightcurve",
        apparentMagnitude: 15.7,
        absoluteMagnitude: -19.3,
        secondApparentMagnitude: 18.2,
      },
      {
        kind: "al-opt-astro-magnitude-supernovae",
        mode: "hubble-expansion",
        apparentMagnitude: 17.2,
        absoluteMagnitude: -19.3,
        redshiftZ: 0.042,
        hubbleConstantKmSMpc: 65,
      },
    ],
    validate: validateMagnitudeSupernovae,
    solve: solveMagnitudeSupernovae,
    renderSvg: renderMagnitudeSupernovae,
  },
  {
    domain: "grav-astro",
    kind: "al-opt-astro-exoplanets-blackholes",
    summary:
      "AQA 3.9 exoplanet transit light curves (Delta I / I = (r_p/R_s)^2), radial-velocity stellar wobble, Schwarzschild radius R_s = 2GM/c^2, and quasars.",
    requiredFields: [
      F("mode", "enum", { enumValues: ["transit", "blackhole-quasar"] }),
    ],
    optionalFields: [
      F("starRadiusM", "number", { unit: "m" }),
      F("planetRadiusM", "number", { unit: "m" }),
      F("orbitalPeriodDays", "number", { unit: "days" }),
      F("stellarWobbleSpeedMs", "number", { unit: "m s⁻¹" }),
      F("referenceWavelengthNm", "number", { unit: "nm" }),
      F("blackHoleMassSolar", "number", { unit: "M☉" }),
      F("quasarRedshiftZ", "number"),
      F("restWavelengthNm", "number", { unit: "nm" }),
    ],
    physicalConstraints: [
      "Transit fractional dip equals (r_p / R_s)^2 and requires near edge-on alignment",
      "Schwarzschild radius R_s = 2 G M / c^2",
    ],
    probeSpecs: [
      {
        kind: "al-opt-astro-exoplanets-blackholes",
        mode: "transit",
        starRadiusM: 7.4e8,
        planetRadiusM: 7.4e7,
        orbitalPeriodDays: 4.8,
        stellarWobbleSpeedMs: 65,
        referenceWavelengthNm: 589,
      },
      {
        kind: "al-opt-astro-exoplanets-blackholes",
        mode: "blackhole-quasar",
        blackHoleMassSolar: 4.2e8,
        quasarRedshiftZ: 1.45,
        restWavelengthNm: 486,
      },
    ],
    validate: validateExoplanetsBlackholes,
    solve: solveExoplanetsBlackholes,
    renderSvg: renderExoplanetsBlackholes,
  },

  // ---- OPTION 3.10 MEDICAL PHYSICS (5 plugins) ----
  {
    domain: "optics-shm",
    kind: "al-opt-med-eye-defects",
    summary:
      "AQA 3.10 eye defects (myopia, hypermetropia, astigmatism) using real-is-positive 1/f = 1/u + 1/v, lens power P = 1/f in dioptres, and shifted near/far points.",
    requiredFields: [
      F("mode", "enum", {
        enumValues: ["myopia", "hypermetropia", "astigmatism"],
      }),
    ],
    optionalFields: [
      F("unaidedFarPointM", "number", { unit: "m" }),
      F("unaidedNearPointM", "number", { unit: "m" }),
      F("targetNearPointM", "number", { unit: "m" }),
      F("cylinderPowerD", "number", { unit: "D" }),
      F("cylinderAxisDeg", "number", { unit: "deg" }),
    ],
    physicalConstraints: [
      "Real-is-positive sign convention gives virtual image distance v < 0",
      "Myopia requires diverging lens (P < 0); hypermetropia requires converging lens (P > 0)",
    ],
    probeSpecs: [
      {
        kind: "al-opt-med-eye-defects",
        mode: "myopia",
        unaidedFarPointM: 0.8,
        unaidedNearPointM: 0.16,
      },
      {
        kind: "al-opt-med-eye-defects",
        mode: "hypermetropia",
        unaidedNearPointM: 0.75,
        targetNearPointM: 0.25,
      },
      {
        kind: "al-opt-med-eye-defects",
        mode: "astigmatism",
        cylinderPowerD: -1.5,
        cylinderAxisDeg: 110,
      },
    ],
    validate: validateEyeDefects,
    solve: solveEyeDefects,
    renderSvg: renderEyeDefects,
  },
  {
    domain: "waves",
    kind: "al-opt-med-retina-ear-db",
    summary:
      "AQA 3.10 ear intensity level dB = 10 lg(I/I_0) with I_0 = 1.0e-12 W m^-2, dBA weighting (~3 kHz peak), and retinal cone/rod acuity (min separation >= 2 d_cone).",
    requiredFields: [
      F("mode", "enum", { enumValues: ["ear-db", "retina-cones"] }),
    ],
    optionalFields: [
      F("sourcePowerW", "number", { unit: "W" }),
      F("distanceM", "number", { unit: "m" }),
      F("secondDistanceM", "number", { unit: "m" }),
      F("targetLevelDb", "number", { unit: "dB" }),
      F("coneDiameterUm", "number", { unit: "μm" }),
      F("eyeFocalLengthMm", "number", { unit: "mm" }),
      F("objectDistanceM", "number", { unit: "m" }),
    ],
    physicalConstraints: [
      "Threshold of hearing I_0 = 1.0 × 10⁻¹² W m⁻²",
      "Two points resolved on retina require at least one unstimulated cone between stimulated cones (2 d_cone)",
    ],
    probeSpecs: [
      {
        kind: "al-opt-med-retina-ear-db",
        mode: "ear-db",
        sourcePowerW: 0.08,
        distanceM: 4.0,
        secondDistanceM: 16.0,
        targetLevelDb: 75,
      },
      {
        kind: "al-opt-med-retina-ear-db",
        mode: "retina-cones",
        coneDiameterUm: 2.5,
        eyeFocalLengthMm: 17,
        objectDistanceM: 12.0,
      },
    ],
    validate: validateRetinaEarDb,
    solve: solveRetinaEarDb,
    renderSvg: renderRetinaEarDb,
  },
  {
    domain: "waves",
    kind: "al-opt-med-ultrasound-ascan",
    summary:
      "AQA 3.10 medical ultrasound piezoelectric transducer, acoustic impedance Z = rho c, reflection coefficient I_r/I_i = ((Z2-Z1)/(Z2+Z1))^2, and A-scan pulse-echo 2d = c Delta t.",
    requiredFields: [
      F("mode", "enum", { enumValues: ["ascan-echo", "impedance-boundary"] }),
      F("density1KgM3", "number", { unit: "kg m⁻³" }),
      F("speed1Ms", "number", { unit: "m s⁻¹" }),
      F("density2KgM3", "number", { unit: "kg m⁻³" }),
      F("speed2Ms", "number", { unit: "m s⁻¹" }),
    ],
    optionalFields: [
      F("pulseEchoDelayUs", "number", { unit: "μs" }),
      F("secondEchoDelayUs", "number", { unit: "μs" }),
      F("transducerFreqMHz", "number", { unit: "MHz" }),
      F("crystalSpeedMs", "number", { unit: "m s⁻¹" }),
    ],
    physicalConstraints: [
      "Pulse-echo round trip satisfies 2d = c Delta t",
      "Acoustic impedance Z = rho * c in kg m⁻² s⁻¹",
    ],
    probeSpecs: [
      {
        kind: "al-opt-med-ultrasound-ascan",
        mode: "ascan-echo",
        density1KgM3: 1060,
        speed1Ms: 1540,
        density2KgM3: 1080,
        speed2Ms: 1580,
        pulseEchoDelayUs: 38,
        secondEchoDelayUs: 108,
      },
      {
        kind: "al-opt-med-ultrasound-ascan",
        mode: "impedance-boundary",
        density1KgM3: 1.29,
        speed1Ms: 330,
        density2KgM3: 1060,
        speed2Ms: 1540,
        transducerFreqMHz: 4.0,
      },
    ],
    validate: validateUltrasoundAscan,
    solve: solveUltrasoundAscan,
    renderSvg: renderUltrasoundAscan,
  },
  {
    domain: "quantum-nuclear",
    kind: "al-opt-med-xray-attenuation",
    summary:
      "AQA 3.10 diagnostic X-ray tube spectrum (lambda_min = hc/eV, bremsstrahlung + K-lines, Al filter) and exponential attenuation (I = I_0 e^-mu x, mu_m = mu/rho, x_1/2 = ln 2 / mu).",
    requiredFields: [
      F("mode", "enum", { enumValues: ["spectrum", "attenuation"] }),
      F("tubeVoltageKv", "number", { unit: "kV", bounds: "20..200" }),
      F("linearAttenCoeffPerM", "number", { unit: "m⁻¹", bounds: "1..20000" }),
      F("thicknessMm", "number", { unit: "mm", bounds: "0.05..250" }),
      F("densityKgM3", "number", { unit: "kg m⁻³", bounds: "100..25000" }),
    ],
    physicalConstraints: [
      "Minimum X-ray wavelength lambda_min = h c / (e V)",
      "Exponential attenuation I = I_0 exp(-mu x) with half-value thickness x_1/2 = ln(2) / mu",
    ],
    probeSpecs: [
      {
        kind: "al-opt-med-xray-attenuation",
        mode: "spectrum",
        tubeVoltageKv: 85,
        linearAttenCoeffPerM: 42,
        thicknessMm: 18,
        densityKgM3: 1850,
      },
      {
        kind: "al-opt-med-xray-attenuation",
        mode: "attenuation",
        tubeVoltageKv: 110,
        linearAttenCoeffPerM: 2600,
        thicknessMm: 1.2,
        densityKgM3: 11340,
      },
    ],
    validate: validateXrayAttenuation,
    solve: solveXrayAttenuation,
    renderSvg: renderXrayAttenuation,
  },
  {
    domain: "quantum-nuclear",
    kind: "al-opt-med-nuclear-imaging",
    summary:
      "AQA 3.10 medical tracers (1/T_E = 1/T_B + 1/T_P, Tc-99m), gamma camera architecture, PET 511 keV annihilation coincidence, and CT/MRI/ultrasound clinical comparison.",
    requiredFields: [
      F("mode", "enum", { enumValues: ["gamma-camera", "pet-coincidence"] }),
      F("physicalHalfLifeHours", "number", { unit: "h", bounds: "0.2..500" }),
      F("biologicalHalfLifeHours", "number", { unit: "h", bounds: "0.2..500" }),
      F("elapsedHours", "number", { unit: "h", bounds: "0.2..200" }),
      F("initialActivityMBq", "number", { unit: "MBq", bounds: "1..5000" }),
    ],
    physicalConstraints: [
      "Effective half-life satisfies 1/T_E = 1/T_B + 1/T_P so T_E < min(T_B, T_P)",
      "PET positron-electron annihilation produces two opposite 511 keV gamma photons",
    ],
    probeSpecs: [
      {
        kind: "al-opt-med-nuclear-imaging",
        mode: "gamma-camera",
        physicalHalfLifeHours: 6.0,
        biologicalHalfLifeHours: 12.0,
        elapsedHours: 8.0,
        initialActivityMBq: 480,
      },
      {
        kind: "al-opt-med-nuclear-imaging",
        mode: "pet-coincidence",
        physicalHalfLifeHours: 1.83,
        biologicalHalfLifeHours: 5.5,
        elapsedHours: 2.75,
        initialActivityMBq: 320,
      },
    ],
    validate: validateNuclearImaging,
    solve: solveNuclearImaging,
    renderSvg: renderNuclearImaging,
  },

  // ---- OPTION 3.12 TURNING POINTS IN PHYSICS (5 plugins) ----
  {
    domain: "em-induction",
    kind: "al-opt-tp-thomson-em",
    summary:
      "AQA 3.12 thermionic emission, Thomson crossed E/B velocity selector (v = E/B, e/m = E/(B^2 r)), fine-beam circular deflection (e/m = 2V/(B^2 r^2)), and H+ comparison.",
    requiredFields: [
      F("mode", "enum", { enumValues: ["crossed-fields", "fine-beam"] }),
      F("magneticFieldT", "number", { unit: "T", bounds: "1e-4..0.08" }),
      F("orbitRadiusM", "number", { unit: "m", bounds: "0.01..0.5" }),
    ],
    optionalFields: [
      F("plateVoltageV", "number", { unit: "V" }),
      F("plateSeparationM", "number", { unit: "m" }),
      F("anodeVoltageV", "number", { unit: "V" }),
    ],
    physicalConstraints: [
      "Crossed fields undeflected beam satisfies v = E / B = V_p / (B d)",
      "Fine-beam circular path satisfies e/m = 2 V_a / (B^2 r^2)",
    ],
    probeSpecs: [
      {
        kind: "al-opt-tp-thomson-em",
        mode: "crossed-fields",
        plateVoltageV: 1200,
        plateSeparationM: 0.04,
        magneticFieldT: 1.5e-3,
        orbitRadiusM: 0.0758,
      },
      {
        kind: "al-opt-tp-thomson-em",
        mode: "fine-beam",
        anodeVoltageV: 240,
        magneticFieldT: 1.2e-3,
        orbitRadiusM: 0.0435,
      },
    ],
    validate: validateThomsonEm,
    solve: solveThomsonEm,
    renderSvg: renderThomsonEm,
  },
  {
    domain: "fields",
    kind: "al-opt-tp-millikan-oildrop",
    summary:
      "AQA 3.12 Millikan oil-drop determination of elementary charge via Stokes law (6 pi eta r v = (4/3) pi r^3 rho g with g = 9.81 m s^-2) and static electric balance (Q V / d = m g).",
    requiredFields: [
      F("oilDensityKgM3", "number", { unit: "kg m⁻³", bounds: "650..1200" }),
      F("airViscosityPaS", "number", { unit: "Pa s", bounds: "1.4e-5..2.3e-5" }),
      F("terminalSpeedMs", "number", { unit: "m s⁻¹", bounds: "1e-5..5e-3" }),
      F("plateSeparationM", "number", { unit: "m", bounds: "0.003..0.06" }),
      F("balancingVoltageV", "number", { unit: "V", bounds: "20..6000" }),
    ],
    physicalConstraints: [
      "Uses AQA g = 9.81 m s⁻² with negligible air upthrust",
      "Stokes law gives r = sqrt(9 eta v / (2 rho g)); static balance gives Q = m g d / V",
    ],
    probeSpecs: [
      {
        kind: "al-opt-tp-millikan-oildrop",
        oilDensityKgM3: 880,
        airViscosityPaS: 1.81e-5,
        terminalSpeedMs: 1.1e-4,
        plateSeparationM: 0.012,
        balancingVoltageV: 716,
      },
      {
        kind: "al-opt-tp-millikan-oildrop",
        oilDensityKgM3: 920,
        airViscosityPaS: 1.82e-5,
        terminalSpeedMs: 1.8e-4,
        plateSeparationM: 0.015,
        balancingVoltageV: 1170,
      },
    ],
    validate: validateMillikan,
    solve: solveMillikan,
    renderSvg: renderMillikan,
  },
  {
    domain: "waves",
    kind: "al-opt-tp-light-hertz-maxwell",
    summary:
      "AQA 3.12 Newton corpuscular vs Huygens wave refraction, Maxwell c = 1/sqrt(mu_0 epsilon_0), Fizeau toothed wheel (c = 4 n f d), and Hertz standing radio waves & dipole polarisation.",
    requiredFields: [
      F("mode", "enum", {
        enumValues: [
          "hertz-polarisation",
          "refraction-corpuscular",
          "fizeau-maxwell",
        ],
      }),
    ],
    optionalFields: [
      F("nodeSpacingM", "number", { unit: "m" }),
      F("detectorAngleDeg", "number", { unit: "deg" }),
      F("peakAmplitudeMv", "number", { unit: "mV" }),
      F("incidentAngleDeg", "number", { unit: "deg" }),
      F("refractiveIndex", "number"),
      F("wheelTeeth", "number"),
      F("mirrorDistanceM", "number", { unit: "m" }),
    ],
    physicalConstraints: [
      "Hertz standing wave adjacent nodes are separated by lambda / 2",
      "Dipole detector amplitude varies as |cos(theta)| with nulls at 90 deg and 270 deg",
    ],
    probeSpecs: [
      {
        kind: "al-opt-tp-light-hertz-maxwell",
        mode: "hertz-polarisation",
        nodeSpacingM: 0.36,
        detectorAngleDeg: 60,
        peakAmplitudeMv: 140,
      },
      {
        kind: "al-opt-tp-light-hertz-maxwell",
        mode: "refraction-corpuscular",
        incidentAngleDeg: 42,
        refractiveIndex: 1.33,
      },
      {
        kind: "al-opt-tp-light-hertz-maxwell",
        mode: "fizeau-maxwell",
        wheelTeeth: 720,
        mirrorDistanceM: 8630,
      },
    ],
    validate: validateLightHertzMaxwell,
    solve: solveLightHertzMaxwell,
    renderSvg: renderLightHertzMaxwell,
  },
  {
    domain: "quantum-nuclear",
    kind: "al-opt-tp-electron-microscopy",
    summary:
      "AQA 3.12 electron de Broglie wavelength lambda = h/sqrt(2 m e V), TEM magnetic lenses and resolution limits, and STM exponential quantum tunnelling.",
    requiredFields: [
      F("mode", "enum", { enumValues: ["tem-debroglie", "stm-tunnelling"] }),
      F("anodeVoltageV", "number", { unit: "V", bounds: "50..500000" }),
    ],
    optionalFields: [
      F("secondAnodeVoltageV", "number", { unit: "V" }),
      F("decayConstantPerNm", "number", { unit: "nm⁻¹" }),
      F("deltaGapNm", "number", { unit: "nm" }),
      F("initialCurrentNa", "number", { unit: "nA" }),
    ],
    physicalConstraints: [
      "Non-relativistic AQA de Broglie wavelength lambda = h / sqrt(2 m e V) scales as V^(-1/2)",
      "STM tunnelling current decreases exponentially with vacuum gap width",
    ],
    probeSpecs: [
      {
        kind: "al-opt-tp-electron-microscopy",
        mode: "tem-debroglie",
        anodeVoltageV: 45000,
        secondAnodeVoltageV: 180000,
      },
      {
        kind: "al-opt-tp-electron-microscopy",
        mode: "stm-tunnelling",
        anodeVoltageV: 25000,
        decayConstantPerNm: 18,
        deltaGapNm: 0.1,
        initialCurrentNa: 6.0,
      },
    ],
    validate: validateElectronMicroscopy,
    solve: solveElectronMicroscopy,
    renderSvg: renderElectronMicroscopy,
  },
  {
    domain: "quantum-nuclear",
    kind: "al-opt-tp-michelson-relativity",
    summary:
      "AQA 3.12 Michelson-Morley null result, Einstein postulates, time dilation t = gamma t_0, length contraction l = l_0 / gamma, and Bertozzi relativistic energy E_k = (gamma - 1) m_0 c^2.",
    requiredFields: [
      F("mode", "enum", { enumValues: ["interferometer", "bertozzi"] }),
      F("speedFractionC", "number", { bounds: "0.10..0.9995" }),
    ],
    optionalFields: [
      F("properTimeUs", "number", { unit: "μs" }),
      F("properLengthM", "number", { unit: "m" }),
      F("particleRestMassKg", "number", { unit: "kg" }),
    ],
    physicalConstraints: [
      "Lorentz factor gamma = 1 / sqrt(1 - v^2 / c^2) > 1",
      "Relativistic kinetic energy is strictly E_k = (gamma - 1) m_0 c^2 (never 0.5 gamma m_0 v^2)",
    ],
    probeSpecs: [
      {
        kind: "al-opt-tp-michelson-relativity",
        mode: "interferometer",
        speedFractionC: 0.98,
        properTimeUs: 2.2,
        properLengthM: 1200,
      },
      {
        kind: "al-opt-tp-michelson-relativity",
        mode: "bertozzi",
        speedFractionC: 0.92,
      },
    ],
    validate: validateMichelsonRelativity,
    solve: solveMichelsonRelativity,
    renderSvg: renderMichelsonRelativity,
  },
];
