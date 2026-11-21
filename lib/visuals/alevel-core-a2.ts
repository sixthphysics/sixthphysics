import type {
  DomainKindFieldSpec,
  DomainKindPlugin,
  DomainRenderOptions,
  DomainRenderOutput,
  DomainSolveOutput,
  DomainValidationResult,
} from "@/lib/bank-pipeline/domain-registry";
import type { VerifiedQuantityMap } from "@/lib/bank-pipeline/types";

export const ALEVEL_CORE_A2_RENDERER_VERSION =
  "sixthphysics/alevel-core-a2-svg/1.0.0";

export const ALEVEL_G_MS2 = 9.81;
export const ALEVEL_EPSILON_0 = 8.85e-12;
export const ALEVEL_BIG_G = 6.67e-11;
export const ALEVEL_MOLAR_GAS_R = 8.31;
export const ALEVEL_BOLTZMANN_K = 1.38e-23;
export const ALEVEL_AVOGADRO_NA = 6.022e23;
export const ALEVEL_ELEMENTARY_E = 1.6e-19;
export const ALEVEL_PLANCK_H = 6.63e-34;
export const ALEVEL_SPEED_C = 3.0e8;
export const ALEVEL_ATOMIC_MASS_U = 1.661e-27;

export const ALEVEL_CORE_A2_SCENARIO_KINDS = [
  "al-a2-damping-resonance-curves",
  "al-a2-damped-oscillation-decay",
  "al-a2-continuous-flow-calorimetry",
  "al-a2-kinetic-theory-assumptions-lor",
  "al-a2-satellite-orbits-comparison",
  "al-a2-grav-vs-electric-fields",
  "al-a2-capacitor-polar-dielectric",
  "al-a2-lenz-law-energy-conservation",
  "al-a2-transformer-losses-design",
  "al-a2-oscilloscope-ac-rms",
  "al-a2-electron-diffraction-vs-rutherford",
  "al-a2-nz-nuclear-stability-curve",
  "al-a2-thermal-nuclear-reactor-lor",
] as const;

export type AlevelCoreA2ScenarioKind =
  (typeof ALEVEL_CORE_A2_SCENARIO_KINDS)[number];

/* -------------------------------------------------------------------------- */
/*  Shared validation, formatting & XML/SVG helpers                           */
/* -------------------------------------------------------------------------- */

const SVG_FONT_SANS =
  "'Plus Jakarta Sans', 'Segoe UI', Helvetica, Arial, sans-serif";

const PALETTE = {
  ink: "#0f172a",
  muted: "#475569",
  subtle: "#94a3b8",
  grid: "#e2e8f0",
  panelBg: "#f8fafc",
  blue: "#1d4ed8",
  blueSoft: "#dbeafe",
  red: "#dc2626",
  redSoft: "#fee2e2",
  teal: "#0f766e",
  tealSoft: "#ccfbf1",
  amber: "#b45309",
  amberSoft: "#fef3c7",
  violet: "#6d28d9",
  violetSoft: "#ede9fe",
} as const;

const SUPERSCRIPT_MAP: Readonly<Record<string, string>> = {
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

function toSuperscript(raw: number | string): string {
  return [...String(raw)].map((c) => SUPERSCRIPT_MAP[c] ?? c).join("");
}

function isFiniteNum(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function isPosNum(v: unknown): v is number {
  return isFiniteNum(v) && v > 0;
}

function isNonEmptyStr(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
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

function fmtSvgNum(v: number, sf = 3): string {
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
  return `${sign}${mant.toPrecision(sf)} × 10${toSuperscript(exp)}`;
}

function svgWrap(title: string, defs: string, body: string): string {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360" width="640" height="360" role="img" aria-label="${escapeXml(title)}">`,
    `  <title>${escapeXml(title)}</title>`,
    defs ? `  <defs>${defs}</defs>` : "",
    `  <rect width="100%" height="100%" fill="#ffffff"/>`,
    body,
    `</svg>`,
  ]
    .filter(Boolean)
    .join("\n");
}

function svgText(
  x: number,
  y: number,
  content: string,
  opts: {
    size?: number;
    weight?: number | string;
    fill?: string;
    anchor?: "start" | "middle" | "end";
    rotate?: string;
    italic?: boolean;
  } = {},
): string {
  const size = opts.size ?? 12;
  const weight = opts.weight ?? 500;
  const fill = opts.fill ?? PALETTE.ink;
  const anchor = opts.anchor ?? "start";
  const transformAttr = opts.rotate ? ` transform="${opts.rotate}"` : "";
  const styleAttr = opts.italic ? ' font-style="italic"' : "";
  return `<text x="${fc(x)}" y="${fc(y)}" font-family="${SVG_FONT_SANS}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}"${styleAttr}${transformAttr}>${escapeXml(content)}</text>`;
}

function arrowMarkerDef(id: string, color: string): string {
  return `<marker id="${id}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 1.5 L 8.5 5 L 0 8.5 z" fill="${color}"/></marker>`;
}

function makeHiddenSet(options?: DomainRenderOptions): Set<string> {
  return new Set((options?.hiddenQuantities ?? []).map((k) => k.trim()));
}

function polylinePath(points: readonly [number, number][]): string {
  return points
    .map(([x, y], idx) => `${idx === 0 ? "M" : "L"}${fc(x)},${fc(y)}`)
    .join(" ");
}

function buildLinearTicks(min: number, max: number, steps: number): number[] {
  const out: number[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const val = min + ((max - min) * i) / steps;
    out.push(Math.round(val * 1000) / 1000);
  }
  return out;
}

/* ========================================================================== */
/*  1. al-a2-damping-resonance-curves (3.6.1, optics-shm)                     */
/* ========================================================================== */

const dampingResonanceFields: readonly DomainKindFieldSpec[] = [
  { name: "kind", type: "string", enumValues: ["al-a2-damping-resonance-curves"] },
  { name: "naturalFreqHz", type: "number", unit: "Hz", bounds: "1 <= f0 <= 25" },
  { name: "staticAmplitudeMm", type: "number", unit: "mm", bounds: "2 <= A0 <= 30" },
  { name: "zetaLight", type: "number", bounds: "0.05 <= zetaLight <= 0.22" },
  { name: "zetaModerate", type: "number", bounds: "0.22 < zetaModerate <= 0.48" },
  { name: "zetaHeavy", type: "number", bounds: "0.48 < zetaHeavy <= 0.85" },
];

const dampingResonanceOptionalFields: readonly DomainKindFieldSpec[] = [
  { name: "probeDriveFreqHz", type: "number", unit: "Hz", bounds: "0.2*f0 <= f <= 2*f0" },
  { name: "showPhaseSubplot", type: "boolean", notes: "Include phase lag 0 -> pi/2 -> pi subplot" },
];

function validateDampingResonance(spec: Record<string, unknown>): DomainValidationResult {
  const issues: string[] = [];
  if (spec.kind !== "al-a2-damping-resonance-curves") {
    issues.push('kind must be "al-a2-damping-resonance-curves"');
  }
  if (!isPosNum(spec.naturalFreqHz) || spec.naturalFreqHz < 1 || spec.naturalFreqHz > 25) {
    issues.push("naturalFreqHz must be within [1, 25] Hz");
  }
  if (!isPosNum(spec.staticAmplitudeMm) || spec.staticAmplitudeMm < 2 || spec.staticAmplitudeMm > 30) {
    issues.push("staticAmplitudeMm must be within [2, 30] mm");
  }
  if (!isPosNum(spec.zetaLight) || spec.zetaLight < 0.05 || spec.zetaLight > 0.22) {
    issues.push("zetaLight must be within [0.05, 0.22]");
  }
  if (!isPosNum(spec.zetaModerate) || spec.zetaModerate <= 0.22 || spec.zetaModerate > 0.48) {
    issues.push("zetaModerate must be within (0.22, 0.48]");
  }
  if (!isPosNum(spec.zetaHeavy) || spec.zetaHeavy <= 0.48 || spec.zetaHeavy > 0.85) {
    issues.push("zetaHeavy must be within (0.48, 0.85]");
  }
  if (
    isPosNum(spec.zetaLight) &&
    isPosNum(spec.zetaModerate) &&
    isPosNum(spec.zetaHeavy) &&
    !(spec.zetaLight < spec.zetaModerate && spec.zetaModerate < spec.zetaHeavy)
  ) {
    issues.push("damping ratios must satisfy zetaLight < zetaModerate < zetaHeavy");
  }
  if (spec.probeDriveFreqHz !== undefined) {
    if (!isPosNum(spec.probeDriveFreqHz)) {
      issues.push("probeDriveFreqHz must be a positive finite number");
    }
  }
  return { valid: issues.length === 0, issues };
}

function drivenAmplitude(a0: number, f: number, f0: number, zeta: number): number {
  const u = f / f0;
  const denom = Math.hypot(1 - u * u, 2 * zeta * u);
  return a0 / denom;
}

function drivenPhaseRad(f: number, f0: number, zeta: number): number {
  const u = f / f0;
  const phi = Math.atan2(2 * zeta * u, 1 - u * u);
  return phi < 0 ? phi + Math.PI : phi;
}

function solveDampingResonance(spec: Record<string, unknown>): DomainSolveOutput {
  const f0 = spec.naturalFreqHz as number;
  const a0 = spec.staticAmplitudeMm as number;
  const zL = spec.zetaLight as number;
  const zM = spec.zetaModerate as number;
  const zH = spec.zetaHeavy as number;
  const fProbe = isPosNum(spec.probeDriveFreqHz) ? spec.probeDriveFreqHz : f0;

  const peakFreqLight = f0 * Math.sqrt(Math.max(0, 1 - 2 * zL * zL));
  const peakFreqModerate = f0 * Math.sqrt(Math.max(0, 1 - 2 * zM * zM));
  const peakFreqHeavy =
    zH < Math.SQRT1_2 ? f0 * Math.sqrt(1 - 2 * zH * zH) : 0;

  const ampAtF0LightMm = a0 / (2 * zL);
  const ampAtF0ModerateMm = a0 / (2 * zM);
  const ampAtF0HeavyMm = a0 / (2 * zH);
  const peakAmpLightMm = a0 / (2 * zL * Math.sqrt(1 - zL * zL));
  const ampAtProbeLightMm = drivenAmplitude(a0, fProbe, f0, zL);
  const phaseAtProbeRad = drivenPhaseRad(fProbe, f0, zL);

  const quantities: VerifiedQuantityMap = {
    naturalFreqF0: f0,
    staticAmplitudeMm: a0,
    peakFreqLight,
    peakFreqModerate,
    peakFreqHeavy,
    ampAtF0LightMm,
    ampAtF0ModerateMm,
    ampAtF0HeavyMm,
    peakAmpLightMm,
    ampAtProbeLightMm,
    phaseAtProbeRad,
    phaseAtResonance: "pi/2 rad",
    phaseLowFreqAnchor: "in phase with the driving force at frequencies well below the natural frequency",
    phaseHighFreqAnchor: "in antiphase lagging the driving force by pi rad at high driving frequencies",
    resonanceConditionAnchor:
      "driving frequency equals the natural frequency giving maximum amplitude and maximum rate of energy transfer",
    dampingEffectAnchor:
      "peak amplitude decreases, the resonance peak broadens, and the peak frequency shifts slightly below the natural frequency",
  };

  return {
    solverId: "sixthphysics/alevel-core-a2/damping-resonance/1.0.0",
    quantities,
    publicNumbers: [f0, a0, zL, zM, zH],
  };
}

function renderDampingResonanceSvg(
  spec: Record<string, unknown>,
  options?: DomainRenderOptions,
): DomainRenderOutput {
  const hidden = makeHiddenSet(options);
  const f0 = spec.naturalFreqHz as number;
  const a0 = spec.staticAmplitudeMm as number;
  const zL = spec.zetaLight as number;
  const zM = spec.zetaModerate as number;
  const zH = spec.zetaHeavy as number;
  const showPhase = spec.showPhaseSubplot !== false;

  const publicNumbers: number[] = [];
  const publicLabels: string[] = [];

  const hideF0Val =
    hidden.has("naturalFreqF0") || hidden.has("peakFreqLight") || hidden.has("peakFreqModerate");
  const hideAmpTicks =
    hidden.has("ampAtF0LightMm") ||
    hidden.has("ampAtF0ModerateMm") ||
    hidden.has("ampAtF0HeavyMm") ||
    hidden.has("peakAmpLightMm") ||
    hidden.has("ampAtProbeLightMm");
  const hidePhaseLabels = hidden.has("phaseAtResonance");

  const x0 = 58;
  const x1 = showPhase ? 395 : 592;
  const yTop = 44;
  const yBot = 304;
  const fMax = f0 * 2.2;
  const aMaxRaw = a0 / (2 * zL * Math.sqrt(1 - zL * zL));
  const aMax = Math.ceil((aMaxRaw * 1.15) / 10) * 10;

  const mapX = (f: number) => x0 + (f / fMax) * (x1 - x0);
  const mapY = (a: number) => yBot - (a / aMax) * (yBot - yTop);

  const lines: string[] = [];
  lines.push(
    `<rect x="${x0}" y="${yTop}" width="${x1 - x0}" height="${yBot - yTop}" fill="${PALETTE.panelBg}" stroke="${PALETTE.grid}" stroke-width="1"/>`,
  );

  // Subtle horizontal grid
  for (let i = 1; i <= 4; i += 1) {
    const gy = yBot - ((yBot - yTop) * i) / 4;
    lines.push(
      `<line x1="${x0}" y1="${fc(gy)}" x2="${x1}" y2="${fc(gy)}" stroke="${PALETTE.grid}" stroke-width="1"/>`,
    );
    if (!hideAmpTicks) {
      const aTick = Math.round(((aMax * i) / 4) * 10) / 10;
      const lbl = fmtSvgNum(aTick, 3);
      publicNumbers.push(aTick);
      publicLabels.push(lbl);
      lines.push(
        svgText(x0 - 8, gy + 4, lbl, { size: 10, fill: PALETTE.muted, anchor: "end" }),
      );
    }
  }
  lines.push(svgText(x0 - 8, yBot + 4, "0", { size: 10, fill: PALETTE.muted, anchor: "end" }));
  publicNumbers.push(0);
  publicLabels.push("0");

  // Natural frequency vertical dashed line
  const xF0 = mapX(f0);
  lines.push(
    `<line x1="${fc(xF0)}" y1="${yTop}" x2="${fc(xF0)}" y2="${yBot}" stroke="${PALETTE.ink}" stroke-width="1.3" stroke-dasharray="5,4"/>`,
  );
  const f0Tag = hideF0Val ? "f₀" : `f₀ = ${fmtSvgNum(f0, 3)} Hz`;
  if (!hideF0Val) publicNumbers.push(f0);
  publicLabels.push(f0Tag);
  lines.push(svgText(xF0, yBot + 17, f0Tag, { size: 11, weight: 700, anchor: "middle" }));

  // Axes
  lines.push(
    `<line x1="${x0}" y1="${yBot}" x2="${x1 + 8}" y2="${yBot}" stroke="${PALETTE.ink}" stroke-width="1.8"/>`,
  );
  lines.push(
    `<line x1="${x0}" y1="${yBot}" x2="${x0}" y2="${yTop - 8}" stroke="${PALETTE.ink}" stroke-width="1.8"/>`,
  );

  // Plot 3 damping curves
  const curves: Array<{ zeta: number; color: string; label: string }> = [
    { zeta: zL, color: PALETTE.blue, label: "Light damping" },
    { zeta: zM, color: PALETTE.teal, label: "Moderate damping" },
    { zeta: zH, color: PALETTE.red, label: "Heavy damping" },
  ];

  for (const curve of curves) {
    const pts: Array<[number, number]> = [];
    const steps = 110;
    for (let i = 0; i <= steps; i += 1) {
      const f = (fMax * i) / steps;
      const amp = drivenAmplitude(a0, f, f0, curve.zeta);
      pts.push([mapX(f), Math.max(yTop, mapY(amp))]);
    }
    lines.push(
      `<path d="${polylinePath(pts)}" fill="none" stroke="${curve.color}" stroke-width="2.4" stroke-linejoin="round"/>`,
    );
    if (curve.zeta < Math.SQRT1_2) {
      const fp = f0 * Math.sqrt(1 - 2 * curve.zeta * curve.zeta);
      const ap = drivenAmplitude(a0, fp, f0, curve.zeta);
      lines.push(
        `<circle cx="${fc(mapX(fp))}" cy="${fc(mapY(ap))}" r="3.4" fill="${curve.color}" stroke="#ffffff" stroke-width="1.2"/>`,
      );
    }
  }

  // Legend inside top-right of amplitude panel
  const legX = x1 - 134;
  const legY = yTop + 10;
  lines.push(
    `<rect x="${legX}" y="${legY}" width="126" height="62" rx="6" fill="#ffffff" fill-opacity="0.94" stroke="${PALETTE.grid}" stroke-width="1"/>`,
  );
  curves.forEach((c, idx) => {
    const cy = legY + 16 + idx * 17;
    lines.push(
      `<line x1="${legX + 10}" y1="${cy - 3}" x2="${legX + 26}" y2="${cy - 3}" stroke="${c.color}" stroke-width="2.5"/>`,
    );
    lines.push(svgText(legX + 32, cy, c.label, { size: 10, weight: 600, fill: PALETTE.ink }));
    publicLabels.push(c.label);
  });

  // Axis labels
  lines.push(
    svgText((x0 + x1) / 2, 342, "Driving frequency f / Hz", {
      size: 12,
      weight: 600,
      anchor: "middle",
    }),
  );
  lines.push(
    svgText(20, (yTop + yBot) / 2, "Amplitude A / mm", {
      size: 12,
      weight: 600,
      anchor: "middle",
      rotate: `rotate(-90 20 ${fc((yTop + yBot) / 2)})`,
    }),
  );
  lines.push(
    svgText((x0 + x1) / 2, 24, "Forced Oscillation Resonance Curves", {
      size: 13,
      weight: 700,
      anchor: "middle",
    }),
  );

  // Optional Phase Lag Subplot (0 -> pi/2 -> pi)
  if (showPhase) {
    const px0 = 454;
    const px1 = 618;
    const pyTop = 64;
    const pyBot = 284;
    const pMapX = (f: number) => px0 + (f / fMax) * (px1 - px0);
    const pMapY = (phi: number) => pyBot - (phi / Math.PI) * (pyBot - pyTop);

    lines.push(
      `<rect x="${px0}" y="${pyTop}" width="${px1 - px0}" height="${pyBot - pyTop}" fill="${PALETTE.panelBg}" stroke="${PALETTE.grid}" stroke-width="1"/>`,
    );
    const yMid = pMapY(Math.PI / 2);
    lines.push(
      `<line x1="${px0}" y1="${fc(yMid)}" x2="${px1}" y2="${fc(yMid)}" stroke="${PALETTE.subtle}" stroke-width="1" stroke-dasharray="4,4"/>`,
    );
    lines.push(
      `<line x1="${fc(pMapX(f0))}" y1="${pyTop}" x2="${fc(pMapX(f0))}" y2="${pyBot}" stroke="${PALETTE.ink}" stroke-width="1.2" stroke-dasharray="4,4"/>`,
    );
    lines.push(
      `<line x1="${px0}" y1="${pyBot}" x2="${px1 + 6}" y2="${pyBot}" stroke="${PALETTE.ink}" stroke-width="1.6"/>`,
    );
    lines.push(
      `<line x1="${px0}" y1="${pyBot}" x2="${px0}" y2="${pyTop - 6}" stroke="${PALETTE.ink}" stroke-width="1.6"/>`,
    );

    const phaseCurves = [
      { zeta: zL, color: PALETTE.blue },
      { zeta: zH, color: PALETTE.red },
    ];
    for (const pc of phaseCurves) {
      const pts: Array<[number, number]> = [];
      for (let i = 0; i <= 80; i += 1) {
        const f = (fMax * i) / 80;
        pts.push([pMapX(f), pMapY(drivenPhaseRad(f, f0, pc.zeta))]);
      }
      lines.push(
        `<path d="${polylinePath(pts)}" fill="none" stroke="${pc.color}" stroke-width="2.1"/>`,
      );
    }

    lines.push(
      `<circle cx="${fc(pMapX(f0))}" cy="${fc(yMid)}" r="3.5" fill="${PALETTE.ink}"/>`,
    );

    lines.push(svgText(px0 - 7, pyBot + 4, "0", { size: 10, fill: PALETTE.muted, anchor: "end" }));
    lines.push(
      svgText(px0 - 7, yMid + 4, hidePhaseLabels ? "φ₀" : "π/2", {
        size: 10,
        weight: 700,
        fill: PALETTE.ink,
        anchor: "end",
      }),
    );
    lines.push(svgText(px0 - 7, pyTop + 4, "π", { size: 10, fill: PALETTE.muted, anchor: "end" }));
    lines.push(svgText(pMapX(f0), pyBot + 16, "f₀", { size: 10, weight: 700, anchor: "middle" }));
    lines.push(
      svgText((px0 + px1) / 2, 342, "Frequency f", { size: 11, weight: 600, anchor: "middle" }),
    );
    lines.push(
      svgText((px0 + px1) / 2, 24, "Phase Lag Behind Driver", {
        size: 12,
        weight: 700,
        anchor: "middle",
      }),
    );
    lines.push(
      svgText(423, (pyTop + pyBot) / 2, "Phase lag φ / rad", {
        size: 11,
        weight: 600,
        anchor: "middle",
        rotate: `rotate(-90 423 ${fc((pyTop + pyBot) / 2)})`,
      }),
    );
  }

  return {
    visualFamily: "optics-shm",
    svgMarkup: svgWrap(
      "Forced oscillation resonance amplitude and phase lag curves for light, moderate, and heavy damping",
      "",
      lines.join("\n"),
    ),
    rendererVersion: ALEVEL_CORE_A2_RENDERER_VERSION,
    publicNumbers,
    publicLabels,
  };
}

/* ========================================================================== */
/*  2. al-a2-damped-oscillation-decay (3.6.1, optics-shm)                     */
/* ========================================================================== */

const DAMPED_REGIMES = ["light", "critical", "heavy"] as const;
type DampedRegime = (typeof DAMPED_REGIMES)[number];

const dampedDecayFields: readonly DomainKindFieldSpec[] = [
  { name: "kind", type: "string", enumValues: ["al-a2-damped-oscillation-decay"] },
  { name: "initialAmplitudeMm", type: "number", unit: "mm", bounds: "10 <= A0 <= 120" },
  { name: "periodS", type: "number", unit: "s", bounds: "0.2 <= T <= 4.0" },
  { name: "amplitudeRatioPerCycle", type: "number", bounds: "0.45 <= r <= 0.92" },
  { name: "cyclesCount", type: "number", bounds: "1 <= n <= 6 (integer)" },
  { name: "regime", type: "string", enumValues: DAMPED_REGIMES },
];

function validateDampedDecay(spec: Record<string, unknown>): DomainValidationResult {
  const issues: string[] = [];
  if (spec.kind !== "al-a2-damped-oscillation-decay") {
    issues.push('kind must be "al-a2-damped-oscillation-decay"');
  }
  if (!isPosNum(spec.initialAmplitudeMm) || spec.initialAmplitudeMm < 10 || spec.initialAmplitudeMm > 120) {
    issues.push("initialAmplitudeMm must be within [10, 120] mm");
  }
  if (!isPosNum(spec.periodS) || spec.periodS < 0.2 || spec.periodS > 4.0) {
    issues.push("periodS must be within [0.2, 4.0] s");
  }
  if (
    !isPosNum(spec.amplitudeRatioPerCycle) ||
    spec.amplitudeRatioPerCycle < 0.45 ||
    spec.amplitudeRatioPerCycle > 0.92
  ) {
    issues.push("amplitudeRatioPerCycle must be within [0.45, 0.92]");
  }
  if (
    !isPosNum(spec.cyclesCount) ||
    !Number.isInteger(spec.cyclesCount) ||
    spec.cyclesCount < 1 ||
    spec.cyclesCount > 6
  ) {
    issues.push("cyclesCount must be an integer within [1, 6]");
  }
  if (!DAMPED_REGIMES.includes(spec.regime as DampedRegime)) {
    issues.push(`regime must be one of ${DAMPED_REGIMES.join(", ")}`);
  }
  return { valid: issues.length === 0, issues };
}

function solveDampedDecay(spec: Record<string, unknown>): DomainSolveOutput {
  const a0 = spec.initialAmplitudeMm as number;
  const periodS = spec.periodS as number;
  const r = spec.amplitudeRatioPerCycle as number;
  const n = spec.cyclesCount as number;
  const regime = spec.regime as DampedRegime;

  const amplitudeAfterNCyclesMm = a0 * r ** n;
  const dampingCoeffGamma = -Math.log(r) / periodS;
  const energyRemainingRatio = r * r;
  const energyLossPerCyclePct = (1 - energyRemainingRatio) * 100;

  const regimeClassification =
    regime === "light"
      ? "exponentially decaying oscillation with approximately constant period"
      : regime === "critical"
        ? "returns to equilibrium in the shortest possible time without oscillating"
        : "slow asymptotic creep back to equilibrium without oscillating";

  const quantities: VerifiedQuantityMap = {
    initialAmplitudeMm: a0,
    periodS,
    logDecrementRatio: r,
    amplitudeAfterNCyclesMm,
    dampingCoeffGamma,
    energyRemainingRatio,
    energyLossPerCyclePct,
    regimeClassification,
    suspensionBridgeAnchor:
      "critical damping returns system to equilibrium in the shortest possible time without oscillating while heavy damping returns more slowly",
    energyDissipationAnchor:
      "resistive damping force continuously transfers mechanical energy of the oscillator into thermal energy in the surroundings",
  };

  return {
    solverId: "sixthphysics/alevel-core-a2/damped-decay/1.0.0",
    quantities,
    publicNumbers: [a0, periodS, r, n],
  };
}

function renderDampedDecaySvg(
  spec: Record<string, unknown>,
  options?: DomainRenderOptions,
): DomainRenderOutput {
  const hidden = makeHiddenSet(options);
  const a0 = spec.initialAmplitudeMm as number;
  const periodS = spec.periodS as number;
  const r = spec.amplitudeRatioPerCycle as number;
  const gamma = -Math.log(r) / periodS;
  const omega = (2 * Math.PI) / periodS;
  const tMax = periodS * 4.2;

  const publicNumbers: number[] = [0];
  const publicLabels: string[] = ["0"];
  const hideNumericTicks =
    hidden.has("amplitudeAfterNCyclesMm") ||
    hidden.has("energyLossPerCyclePct") ||
    hidden.has("logDecrementRatio") ||
    hidden.has("dampingCoeffGamma");

  const x0 = 64;
  const x1 = 602;
  const yTop = 44;
  const yBot = 304;
  const yMid = (yTop + yBot) / 2;
  const halfH = (yBot - yTop) / 2 - 12;

  const mapX = (t: number) => x0 + (t / tMax) * (x1 - x0);
  const mapY = (x: number) => yMid - (x / a0) * halfH;

  const lines: string[] = [];
  lines.push(
    `<rect x="${x0}" y="${yTop}" width="${x1 - x0}" height="${yBot - yTop}" fill="${PALETTE.panelBg}" stroke="${PALETTE.grid}" stroke-width="1"/>`,
  );
  lines.push(
    `<line x1="${x0}" y1="${fc(yMid)}" x2="${x1 + 8}" y2="${fc(yMid)}" stroke="${PALETTE.ink}" stroke-width="1.6"/>`,
  );
  lines.push(
    `<line x1="${x0}" y1="${yBot + 4}" x2="${x0}" y2="${yTop - 8}" stroke="${PALETTE.ink}" stroke-width="1.6"/>`,
  );

  // Exponential decay envelope ±A0 e^(-gamma t)
  const envPos: Array<[number, number]> = [];
  const envNeg: Array<[number, number]> = [];
  const lightPts: Array<[number, number]> = [];
  const critPts: Array<[number, number]> = [];
  const heavyPts: Array<[number, number]> = [];

  const omega0 = omega;
  const steps = 160;
  for (let i = 0; i <= steps; i += 1) {
    const t = (tMax * i) / steps;
    const env = a0 * Math.exp(-gamma * t);
    envPos.push([mapX(t), mapY(env)]);
    envNeg.push([mapX(t), mapY(-env)]);
    lightPts.push([mapX(t), mapY(env * Math.cos(omega * t))]);

    const xCrit = a0 * (1 + omega0 * t) * Math.exp(-omega0 * t);
    critPts.push([mapX(t), mapY(xCrit)]);

    const xHeavy = a0 * Math.exp(-0.24 * omega0 * t);
    heavyPts.push([mapX(t), mapY(xHeavy)]);
  }

  lines.push(
    `<path d="${polylinePath(envPos)}" fill="none" stroke="${PALETTE.blue}" stroke-width="1.1" stroke-dasharray="4,4" opacity="0.65"/>`,
  );
  lines.push(
    `<path d="${polylinePath(envNeg)}" fill="none" stroke="${PALETTE.blue}" stroke-width="1.1" stroke-dasharray="4,4" opacity="0.65"/>`,
  );
  lines.push(
    `<path d="${polylinePath(lightPts)}" fill="none" stroke="${PALETTE.blue}" stroke-width="2.2"/>`,
  );
  lines.push(
    `<path d="${polylinePath(critPts)}" fill="none" stroke="${PALETTE.teal}" stroke-width="2.5"/>`,
  );
  lines.push(
    `<path d="${polylinePath(heavyPts)}" fill="none" stroke="${PALETTE.red}" stroke-width="2.3" stroke-dasharray="8,4"/>`,
  );

  // Axis markers
  const aTopLabel = hideNumericTicks ? "+A₀" : `+${fmtSvgNum(a0, 3)}`;
  const aBotLabel = hideNumericTicks ? "−A₀" : `−${fmtSvgNum(a0, 3)}`;
  if (!hideNumericTicks) publicNumbers.push(a0, -a0);
  publicLabels.push(aTopLabel, aBotLabel);
  lines.push(svgText(x0 - 8, mapY(a0) + 4, aTopLabel, { size: 10, fill: PALETTE.muted, anchor: "end" }));
  lines.push(svgText(x0 - 8, yMid + 4, "0", { size: 10, fill: PALETTE.muted, anchor: "end" }));
  lines.push(svgText(x0 - 8, mapY(-a0) + 4, aBotLabel, { size: 10, fill: PALETTE.muted, anchor: "end" }));

  for (let k = 1; k <= 4; k += 1) {
    const tk = k * periodS;
    const tx = mapX(tk);
    lines.push(`<line x1="${fc(tx)}" y1="${fc(yMid - 4)}" x2="${fc(tx)}" y2="${fc(yMid + 4)}" stroke="${PALETTE.ink}" stroke-width="1.2"/>`);
    const tLbl = hideNumericTicks ? `${k}T` : fmtSvgNum(tk, 3);
    if (!hideNumericTicks) publicNumbers.push(tk);
    publicLabels.push(tLbl);
    lines.push(svgText(tx, yBot + 16, tLbl, { size: 10, fill: PALETTE.muted, anchor: "middle" }));
  }

  // Legend
  const lx = 414;
  const ly = 54;
  lines.push(
    `<rect x="${lx}" y="${ly}" width="178" height="66" rx="6" fill="#ffffff" fill-opacity="0.95" stroke="${PALETTE.grid}" stroke-width="1"/>`,
  );
  const legEntries = [
    { color: PALETTE.blue, dash: "", txt: "Light damping (curve A)" },
    { color: PALETTE.teal, dash: "", txt: "Critical damping (curve B)" },
    { color: PALETTE.red, dash: "6,3", txt: "Heavy damping (curve C)" },
  ];
  legEntries.forEach((e, i) => {
    const ey = ly + 18 + i * 18;
    lines.push(
      `<line x1="${lx + 10}" y1="${ey - 3}" x2="${lx + 30}" y2="${ey - 3}" stroke="${e.color}" stroke-width="2.4"${e.dash ? ` stroke-dasharray="${e.dash}"` : ""}/>`,
    );
    lines.push(svgText(lx + 36, ey, e.txt, { size: 10, weight: 600 }));
    publicLabels.push(e.txt);
  });

  lines.push(svgText((x0 + x1) / 2, 24, "Free Damped Oscillation Regimes", { size: 13, weight: 700, anchor: "middle" }));
  lines.push(svgText((x0 + x1) / 2, 344, "Time t / s", { size: 12, weight: 600, anchor: "middle" }));
  lines.push(
    svgText(20, yMid, "Displacement x / mm", {
      size: 12,
      weight: 600,
      anchor: "middle",
      rotate: `rotate(-90 20 ${fc(yMid)})`,
    }),
  );

  return {
    visualFamily: "optics-shm",
    svgMarkup: svgWrap(
      "Free damped oscillation displacement versus time comparing light, critical, and heavy damping",
      "",
      lines.join("\n"),
    ),
    rendererVersion: ALEVEL_CORE_A2_RENDERER_VERSION,
    publicNumbers,
    publicLabels,
  };
}

/* ========================================================================== */
/*  3. al-a2-continuous-flow-calorimetry (3.6.2, thermal)                     */
/* ========================================================================== */

const continuousFlowFields: readonly DomainKindFieldSpec[] = [
  { name: "kind", type: "string", enumValues: ["al-a2-continuous-flow-calorimetry"] },
  { name: "inletTempC", type: "number", unit: "°C", bounds: "10 <= thetaIn <= 30" },
  { name: "outletTempC", type: "number", unit: "°C", bounds: "thetaIn + 3 <= thetaOut <= 60" },
  { name: "flowRate1KgPerS", type: "number", unit: "kg s⁻¹", bounds: "0.002 <= mDot1 <= 0.03" },
  { name: "flowRate2KgPerS", type: "number", unit: "kg s⁻¹", bounds: "mDot1 < mDot2 <= 0.06" },
  { name: "voltage1V", type: "number", unit: "V", bounds: "4 <= V1 <= 40" },
  { name: "current1A", type: "number", unit: "A", bounds: "0.5 <= I1 <= 15" },
  { name: "voltage2V", type: "number", unit: "V", bounds: "4 <= V2 <= 60" },
  { name: "current2A", type: "number", unit: "A", bounds: "0.5 <= I2 <= 20" },
];

function validateContinuousFlow(spec: Record<string, unknown>): DomainValidationResult {
  const issues: string[] = [];
  if (spec.kind !== "al-a2-continuous-flow-calorimetry") {
    issues.push('kind must be "al-a2-continuous-flow-calorimetry"');
  }
  const tIn = spec.inletTempC;
  const tOut = spec.outletTempC;
  const m1 = spec.flowRate1KgPerS;
  const m2 = spec.flowRate2KgPerS;
  const v1 = spec.voltage1V;
  const i1 = spec.current1A;
  const v2 = spec.voltage2V;
  const i2 = spec.current2A;

  if (!isFiniteNum(tIn) || tIn < 10 || tIn > 30) issues.push("inletTempC must be in [10, 30] °C");
  if (!isFiniteNum(tOut) || !isFiniteNum(tIn) || tOut - tIn < 2 || tOut > 70) {
    issues.push("outletTempC must exceed inletTempC by at least 2 °C and be <= 70 °C");
  }
  if (!isPosNum(m1) || m1 < 0.001 || m1 > 0.04) issues.push("flowRate1KgPerS out of range");
  if (!isPosNum(m2) || !isPosNum(m1) || m2 <= m1 * 1.15 || m2 > 0.08) {
    issues.push("flowRate2KgPerS must significantly exceed flowRate1KgPerS");
  }
  if (!isPosNum(v1) || !isPosNum(i1) || !isPosNum(v2) || !isPosNum(i2)) {
    issues.push("voltages and currents must be positive numbers");
  }

  if (issues.length === 0) {
    const p1 = (v1 as number) * (i1 as number);
    const p2 = (v2 as number) * (i2 as number);
    const dT = (tOut as number) - (tIn as number);
    const dm = (m2 as number) - (m1 as number);
    const c = (p2 - p1) / (dm * dT);
    const h = p1 - (m1 as number) * c * dT;
    if (p2 <= p1) issues.push("Run 2 electrical power must exceed Run 1 electrical power");
    if (!Number.isFinite(c) || c < 400 || c > 9000) {
      issues.push("Derived specific heat capacity must lie within [400, 9000] J kg⁻¹ K⁻¹");
    }
    if (!Number.isFinite(h) || h < -1e-6) {
      issues.push("Thermal loss rate H must be non-negative");
    }
  }
  return { valid: issues.length === 0, issues };
}

function solveContinuousFlow(spec: Record<string, unknown>): DomainSolveOutput {
  const tIn = spec.inletTempC as number;
  const tOut = spec.outletTempC as number;
  const m1 = spec.flowRate1KgPerS as number;
  const m2 = spec.flowRate2KgPerS as number;
  const v1 = spec.voltage1V as number;
  const i1 = spec.current1A as number;
  const v2 = spec.voltage2V as number;
  const i2 = spec.current2A as number;

  const tempRiseK = tOut - tIn;
  const power1W = v1 * i1;
  const power2W = v2 * i2;
  const specificHeatC = (power2W - power1W) / ((m2 - m1) * tempRiseK);
  const heatLossRateH = Math.max(0, power1W - m1 * specificHeatC * tempRiseK);
  const naiveRun1C = power1W / (m1 * tempRiseK);

  const quantities: VerifiedQuantityMap = {
    tempRiseK,
    powerSingleRun: power1W,
    powerRun2W: power2W,
    specificHeatC,
    heatLossRateH,
    naiveRun1C,
    eliminationAnchor:
      "identical inlet and outlet temperatures keep thermal energy loss rate to the surroundings constant so heat loss cancels upon subtraction",
    steadyStateAnchor:
      "outlet temperature remains constant over time indicating thermal equilibrium before recording mass flow rate",
  };

  return {
    solverId: "sixthphysics/alevel-core-a2/continuous-flow/1.0.0",
    quantities,
    publicNumbers: [tIn, tOut, m1, m2, v1, i1, v2, i2],
  };
}

function renderContinuousFlowSvg(
  spec: Record<string, unknown>,
  options?: DomainRenderOptions,
): DomainRenderOutput {
  const hidden = makeHiddenSet(options);
  const tIn = spec.inletTempC as number;
  const tOut = spec.outletTempC as number;
  const liquidName = isNonEmptyStr(spec.liquidName) ? spec.liquidName : "Test liquid";

  const publicNumbers: number[] = [];
  const publicLabels: string[] = [liquidName];
  const hideTemps = hidden.has("tempRiseK") || hidden.has("inletTempC") || hidden.has("outletTempC");

  const defs = arrowMarkerDef("cf-arrow", PALETTE.blue);
  const lines: string[] = [];

  lines.push(svgText(320, 26, "Continuous-Flow Electrical Calorimeter Apparatus", { size: 13, weight: 700, anchor: "middle" }));

  // Constant-head reservoir on left
  lines.push(`<rect x="30" y="92" width="74" height="114" rx="6" fill="${PALETTE.blueSoft}" stroke="${PALETTE.blue}" stroke-width="2"/>`);
  lines.push(`<line x1="30" y1="118" x2="104" y2="118" stroke="${PALETTE.blue}" stroke-width="1.5" stroke-dasharray="4,3"/>`);
  lines.push(svgText(67, 146, "Constant", { size: 10, weight: 700, fill: PALETTE.blue, anchor: "middle" }));
  lines.push(svgText(67, 160, "head tank", { size: 10, weight: 700, fill: PALETTE.blue, anchor: "middle" }));
  lines.push(svgText(67, 182, liquidName, { size: 9, fill: PALETTE.muted, anchor: "middle" }));

  // Glass vacuum jacket around heater tube
  lines.push(`<rect x="148" y="130" width="318" height="92" rx="14" fill="${PALETTE.panelBg}" stroke="${PALETTE.subtle}" stroke-width="1.8" stroke-dasharray="6,4"/>`);
  lines.push(svgText(307, 238, "Evacuated glass jacket (steady heat loss rate H)", { size: 10, fill: PALETTE.muted, anchor: "middle" }));

  // Inner flow pipe
  lines.push(`<path d="M104,176 L496,176" stroke="${PALETTE.blue}" stroke-width="26" stroke-linecap="butt" opacity="0.22"/>`);
  lines.push(`<line x1="104" y1="163" x2="496" y2="163" stroke="${PALETTE.ink}" stroke-width="2"/>`);
  lines.push(`<line x1="104" y1="189" x2="496" y2="189" stroke="${PALETTE.ink}" stroke-width="2"/>`);

  // Flow direction arrows
  lines.push(`<line x1="114" y1="176" x2="152" y2="176" stroke="${PALETTE.blue}" stroke-width="2.2" marker-end="url(#cf-arrow)"/>`);
  lines.push(`<line x1="454" y1="176" x2="494" y2="176" stroke="${PALETTE.blue}" stroke-width="2.2" marker-end="url(#cf-arrow)"/>`);

  // Internal heating coil
  const coilPts: Array<[number, number]> = [];
  for (let i = 0; i <= 12; i += 1) {
    const cx = 228 + i * 13;
    const cy = i % 2 === 0 ? 169 : 183;
    coilPts.push([cx, cy]);
  }
  lines.push(`<path d="${polylinePath(coilPts)}" fill="none" stroke="${PALETTE.red}" stroke-width="2.6" stroke-linejoin="round"/>`);

  // Electrical supply box at bottom with V and I meters
  lines.push(`<path d="M228,176 L228,274 L264,274" fill="none" stroke="${PALETTE.ink}" stroke-width="1.8"/>`);
  lines.push(`<path d="M384,176 L384,274 L350,274" fill="none" stroke="${PALETTE.ink}" stroke-width="1.8"/>`);
  lines.push(`<rect x="264" y="256" width="86" height="36" rx="6" fill="#ffffff" stroke="${PALETTE.red}" stroke-width="2"/>`);
  lines.push(svgText(307, 272, "DC Supply", { size: 10, weight: 700, fill: PALETTE.red, anchor: "middle" }));
  lines.push(svgText(307, 286, "P = V I", { size: 10, weight: 600, fill: PALETTE.ink, anchor: "middle" }));

  // Inlet thermometer
  lines.push(`<line x1="184" y1="78" x2="184" y2="174" stroke="${PALETTE.ink}" stroke-width="4" stroke-linecap="round"/>`);
  lines.push(`<line x1="184" y1="118" x2="184" y2="174" stroke="${PALETTE.teal}" stroke-width="2.2"/>`);
  lines.push(`<circle cx="184" cy="176" r="5" fill="${PALETTE.teal}"/>`);
  const inLabel = hideTemps ? "θᵢₙ" : `θᵢₙ = ${fmtSvgNum(tIn, 3)} °C`;
  if (!hideTemps) publicNumbers.push(tIn);
  publicLabels.push(inLabel);
  lines.push(svgText(184, 66, inLabel, { size: 11, weight: 700, fill: PALETTE.teal, anchor: "middle" }));

  // Outlet thermometer
  lines.push(`<line x1="426" y1="78" x2="426" y2="174" stroke="${PALETTE.ink}" stroke-width="4" stroke-linecap="round"/>`);
  lines.push(`<line x1="426" y1="96" x2="426" y2="174" stroke="${PALETTE.red}" stroke-width="2.2"/>`);
  lines.push(`<circle cx="426" cy="176" r="5" fill="${PALETTE.red}"/>`);
  const outLabel = hideTemps ? "θₒᵤₜ" : `θₒᵤₜ = ${fmtSvgNum(tOut, 3)} °C`;
  if (!hideTemps) publicNumbers.push(tOut);
  publicLabels.push(outLabel);
  lines.push(svgText(426, 66, outLabel, { size: 11, weight: 700, fill: PALETTE.red, anchor: "middle" }));

  // Collector beaker on right
  lines.push(`<path d="M510,176 L548,176 L548,224" fill="none" stroke="${PALETTE.blue}" stroke-width="4"/>`);
  lines.push(`<path d="M512,214 L512,296 L588,296 L588,214" fill="none" stroke="${PALETTE.ink}" stroke-width="2.2"/>`);
  lines.push(`<rect x="514" y="246" width="72" height="48" fill="${PALETTE.blueSoft}" opacity="0.8"/>`);
  lines.push(svgText(550, 274, "Collector", { size: 10, weight: 700, fill: PALETTE.blue, anchor: "middle" }));
  const hideHint = hidden.has("eliminationAnchor");
  lines.push(svgText(550, 314, "Flow rate ṁ", { size: 11, weight: 700, anchor: "middle" }));
  lines.push(
    svgText(
      320,
      338,
      hideHint
        ? "Two steady flow rates recorded with the same apparatus"
        : "Two steady flow rates at identical Δθ = θₒᵤₜ − θᵢₙ eliminate heat loss H",
      { size: 10, fill: PALETTE.muted, anchor: "middle" },
    ),
  );

  return {
    visualFamily: "thermal",
    svgMarkup: svgWrap(
      "Continuous-flow electrical calorimeter showing inlet and outlet thermometers, heating coil, vacuum jacket, and collector",
      defs,
      lines.join("\n"),
    ),
    rendererVersion: ALEVEL_CORE_A2_RENDERER_VERSION,
    publicNumbers,
    publicLabels,
  };
}

/* ========================================================================== */
/*  4. al-a2-kinetic-theory-assumptions-lor (3.6.2, thermal)                  */
/* ========================================================================== */

const kineticTheoryFields: readonly DomainKindFieldSpec[] = [
  { name: "kind", type: "string", enumValues: ["al-a2-kinetic-theory-assumptions-lor"] },
  { name: "cubeSideM", type: "number", unit: "m", bounds: "0.08 <= L <= 1.0" },
  { name: "molarMassKgPerMol", type: "number", unit: "kg mol⁻¹", bounds: "0.002 <= M <= 0.14" },
  { name: "temperatureK", type: "number", unit: "K", bounds: "180 <= T <= 900" },
  { name: "molesN", type: "number", unit: "mol", bounds: "0.1 <= n <= 10" },
];

const kineticTheoryOptionalFields: readonly DomainKindFieldSpec[] = [
  { name: "singleMoleculeSpeedMs", type: "number", unit: "m s⁻¹", bounds: "100 <= u <= 2000" },
  { name: "gasLabel", type: "string" },
];

function validateKineticTheory(spec: Record<string, unknown>): DomainValidationResult {
  const issues: string[] = [];
  if (spec.kind !== "al-a2-kinetic-theory-assumptions-lor") {
    issues.push('kind must be "al-a2-kinetic-theory-assumptions-lor"');
  }
  if (!isPosNum(spec.cubeSideM) || spec.cubeSideM < 0.08 || spec.cubeSideM > 1.0) {
    issues.push("cubeSideM must be in [0.08, 1.0] m");
  }
  if (!isPosNum(spec.molarMassKgPerMol) || spec.molarMassKgPerMol < 0.002 || spec.molarMassKgPerMol > 0.14) {
    issues.push("molarMassKgPerMol must be in [0.002, 0.14] kg mol⁻¹");
  }
  if (!isPosNum(spec.temperatureK) || spec.temperatureK < 180 || spec.temperatureK > 900) {
    issues.push("temperatureK must be in [180, 900] K");
  }
  if (!isPosNum(spec.molesN) || spec.molesN < 0.1 || spec.molesN > 10) {
    issues.push("molesN must be in [0.1, 10] mol");
  }
  if (
    spec.singleMoleculeSpeedMs !== undefined &&
    (!isPosNum(spec.singleMoleculeSpeedMs) ||
      spec.singleMoleculeSpeedMs < 100 ||
      spec.singleMoleculeSpeedMs > 2000)
  ) {
    issues.push("singleMoleculeSpeedMs must be in [100, 2000] m s⁻¹");
  }
  return { valid: issues.length === 0, issues };
}

function solveKineticTheory(spec: Record<string, unknown>): DomainSolveOutput {
  const sideL = spec.cubeSideM as number;
  const molarMass = spec.molarMassKgPerMol as number;
  const tempK = spec.temperatureK as number;
  const molesN = spec.molesN as number;

  const volumeM3 = sideL ** 3;
  const pressurePa = (molesN * ALEVEL_MOLAR_GAS_R * tempK) / volumeM3;
  const meanKineticEnergyJ = 1.5 * ALEVEL_BOLTZMANN_K * tempK;
  const cRmsMs = Math.sqrt((3 * ALEVEL_MOLAR_GAS_R * tempK) / molarMass);
  const moleculeMassKg = molarMass / ALEVEL_AVOGADRO_NA;
  const u = isPosNum(spec.singleMoleculeSpeedMs)
    ? spec.singleMoleculeSpeedMs
    : cRmsMs / Math.sqrt(3);
  const deltaPMomentumChange = -2 * moleculeMassKg * u;
  const collisionTimeS = (2 * sideL) / u;
  const meanWallForceN = (moleculeMassKg * u * u) / sideL;

  const quantities: VerifiedQuantityMap = {
    volumeM3,
    pressurePa,
    meanKineticEnergyJ,
    cRmsMs,
    moleculeMassKg,
    deltaPMomentumChange,
    collisionTimeS,
    meanWallForceN,
    isotropy: "all three orthogonal directions are equally likely giving one-third of mean square speed",
    kineticAnchor:
      "elastic wall collision reverses velocity giving momentum change minus two m u, Newton second and third laws give wall force, and isotropic random motion gives the one-third factor in pV equals one-third N m c rms squared",
    assumptionsAnchor:
      "negligible molecular volume compared with container volume, negligible intermolecular forces except during elastic collisions, and negligible collision duration",
    brownianAnchor:
      "random zigzag motion of larger visible smoke particles caused by uneven random collisions with much smaller fast-moving air molecules",
    realGasDeviationAnchor:
      "ideal gas behaviour breaks down at high pressure and low temperature because finite molecular volume and intermolecular attractive forces become significant",
  };

  return {
    solverId: "sixthphysics/alevel-core-a2/kinetic-theory/1.0.0",
    quantities,
    publicNumbers: [sideL, molarMass, tempK, molesN, u],
  };
}

function renderKineticTheorySvg(
  spec: Record<string, unknown>,
  options?: DomainRenderOptions,
): DomainRenderOutput {
  const hidden = makeHiddenSet(options);
  const sideL = spec.cubeSideM as number;
  const gasLabel = isNonEmptyStr(spec.gasLabel) ? spec.gasLabel : "Ideal gas";

  const publicNumbers: number[] = [];
  const publicLabels: string[] = [gasLabel];

  const defs =
    arrowMarkerDef("kt-blue", PALETTE.blue) + arrowMarkerDef("kt-red", PALETTE.red);
  const lines: string[] = [];

  lines.push(svgText(180, 26, "Elastic Wall Collision in Cube (Side L)", { size: 12, weight: 700, anchor: "middle" }));

  // Isometric cube (front face x: 64..224, y: 112..272; back offset +44, -44)
  const fx0 = 64;
  const fy0 = 112;
  const s = 160;
  const dx = 46;
  const dy = -42;

  // Shaded right collision face
  lines.push(
    `<polygon points="${fx0 + s},${fy0} ${fx0 + s + dx},${fy0 + dy} ${fx0 + s + dx},${fy0 + s + dy} ${fx0 + s},${fy0 + s}" fill="${PALETTE.blueSoft}" stroke="${PALETTE.blue}" stroke-width="2"/>`,
  );
  // Back hidden edges
  lines.push(
    `<line x1="${fx0 + dx}" y1="${fy0 + dy}" x2="${fx0 + dx}" y2="${fy0 + s + dy}" stroke="${PALETTE.subtle}" stroke-width="1.3" stroke-dasharray="4,4"/>`,
  );
  lines.push(
    `<line x1="${fx0 + dx}" y1="${fy0 + s + dy}" x2="${fx0 + s + dx}" y2="${fy0 + s + dy}" stroke="${PALETTE.subtle}" stroke-width="1.3" stroke-dasharray="4,4"/>`,
  );
  lines.push(
    `<line x1="${fx0}" y1="${fy0 + s}" x2="${fx0 + dx}" y2="${fy0 + s + dy}" stroke="${PALETTE.subtle}" stroke-width="1.3" stroke-dasharray="4,4"/>`,
  );
  // Visible cube edges
  lines.push(
    `<rect x="${fx0}" y="${fy0}" width="${s}" height="${s}" fill="none" stroke="${PALETTE.ink}" stroke-width="2"/>`,
  );
  lines.push(
    `<polyline points="${fx0},${fy0} ${fx0 + dx},${fy0 + dy} ${fx0 + s + dx},${fy0 + dy}" fill="none" stroke="${PALETTE.ink}" stroke-width="2"/>`,
  );

  // Molecule rebounding at right wall
  lines.push(`<circle cx="176" cy="182" r="7" fill="${PALETTE.blue}"/>`);
  lines.push(`<line x1="184" y1="176" x2="238" y2="176" stroke="${PALETTE.blue}" stroke-width="2.4" marker-end="url(#kt-blue)"/>`);
  lines.push(svgText(210, 168, "+u", { size: 11, weight: 700, fill: PALETTE.blue, anchor: "middle" }));

  lines.push(`<line x1="238" y1="194" x2="184" y2="194" stroke="${PALETTE.red}" stroke-width="2.4" marker-end="url(#kt-red)"/>`);
  lines.push(svgText(210, 211, "−u", { size: 11, weight: 700, fill: PALETTE.red, anchor: "middle" }));

  lines.push(svgText(254, 152, "Face", { size: 10, weight: 600, fill: PALETTE.blue, anchor: "middle" }));
  lines.push(svgText(254, 166, "A = L²", { size: 10, weight: 700, fill: PALETTE.blue, anchor: "middle" }));

  const hideL = hidden.has("volumeM3") || hidden.has("collisionTimeS") || hidden.has("meanWallForceN");
  const lLabel = hideL ? "L" : `L = ${fmtSvgNum(sideL, 3)} m`;
  if (!hideL) publicNumbers.push(sideL);
  publicLabels.push(lLabel);
  lines.push(svgText(fx0 + s / 2, fy0 + s + 20, lLabel, { size: 11, weight: 700, anchor: "middle" }));
  lines.push(svgText(fx0 + s / 2, fy0 + s + 38, "V = L³  (N molecules, mass m)", { size: 10, fill: PALETTE.muted, anchor: "middle" }));

  // Right subplot: Ideal vs Real gas pV/(nRT) vs p
  const px0 = 368;
  const px1 = 612;
  const pyTop = 68;
  const pyBot = 286;
  const yIdeal = 196;

  lines.push(svgText((px0 + px1) / 2, 26, "Ideal Gas vs Real Gas Deviation", { size: 12, weight: 700, anchor: "middle" }));
  lines.push(`<rect x="${px0}" y="${pyTop}" width="${px1 - px0}" height="${pyBot - pyTop}" fill="${PALETTE.panelBg}" stroke="${PALETTE.grid}" stroke-width="1"/>`);
  lines.push(`<line x1="${px0}" y1="${pyBot}" x2="${px1 + 6}" y2="${pyBot}" stroke="${PALETTE.ink}" stroke-width="1.6"/>`);
  lines.push(`<line x1="${px0}" y1="${pyBot}" x2="${px0}" y2="${pyTop - 6}" stroke="${PALETTE.ink}" stroke-width="1.6"/>`);

  // Ideal gas horizontal line at 1.0
  lines.push(`<line x1="${px0}" y1="${yIdeal}" x2="${px1}" y2="${yIdeal}" stroke="${PALETTE.teal}" stroke-width="2" stroke-dasharray="6,4"/>`);
  lines.push(svgText(px0 - 8, yIdeal + 4, "1.0", { size: 10, weight: 700, fill: PALETTE.teal, anchor: "end" }));
  publicNumbers.push(1.0);
  publicLabels.push("1.0");
  lines.push(svgText(px1 - 6, yIdeal - 8, "Ideal gas", { size: 10, weight: 700, fill: PALETTE.teal, anchor: "end" }));

  // Real gas curve dipping then rising
  const realPts: Array<[number, number]> = [];
  for (let i = 0; i <= 60; i += 1) {
    const f = i / 60;
    const ratio = 1 - 0.34 * f + 1.08 * f * f;
    const gx = px0 + f * (px1 - px0);
    const gy = yIdeal - (ratio - 1) * 140;
    realPts.push([gx, Math.max(pyTop + 6, Math.min(pyBot - 6, gy))]);
  }
  lines.push(`<path d="${polylinePath(realPts)}" fill="none" stroke="${PALETTE.red}" stroke-width="2.4"/>`);
  lines.push(svgText(530, 122, "Real gas", { size: 10, weight: 700, fill: PALETTE.red }));
  lines.push(svgText(530, 136, "(high p / low T)", { size: 9, fill: PALETTE.red }));

  lines.push(svgText((px0 + px1) / 2, 314, "Pressure p", { size: 11, weight: 600, anchor: "middle" }));
  lines.push(
    svgText(334, (pyTop + pyBot) / 2, "Ratio pV / (nRT)", {
      size: 11,
      weight: 600,
      anchor: "middle",
      rotate: `rotate(-90 334 ${fc((pyTop + pyBot) / 2)})`,
    }),
  );

  return {
    visualFamily: "thermal",
    svgMarkup: svgWrap(
      "Kinetic theory cubic container showing elastic wall rebound and ideal versus real gas deviation plot",
      defs,
      lines.join("\n"),
    ),
    rendererVersion: ALEVEL_CORE_A2_RENDERER_VERSION,
    publicNumbers,
    publicLabels,
  };
}

/* ========================================================================== */
/*  5. al-a2-satellite-orbits-comparison (3.7.2, grav-astro)                  */
/* ========================================================================== */

const satelliteFields: readonly DomainKindFieldSpec[] = [
  { name: "kind", type: "string", enumValues: ["al-a2-satellite-orbits-comparison"] },
  { name: "earthMassKg", type: "number", unit: "kg", bounds: "5.9e24 <= M <= 6.1e24" },
  { name: "earthRadiusM", type: "number", unit: "m", bounds: "6.3e6 <= R <= 6.5e6" },
  { name: "geoPeriodS", type: "number", unit: "s", bounds: "86000 <= T <= 86500" },
  { name: "leoAltitudeKm", type: "number", unit: "km", bounds: "200 <= h <= 1600" },
  { name: "satelliteMassKg", type: "number", unit: "kg", bounds: "100 <= m <= 5000" },
];

function validateSatellite(spec: Record<string, unknown>): DomainValidationResult {
  const issues: string[] = [];
  if (spec.kind !== "al-a2-satellite-orbits-comparison") {
    issues.push('kind must be "al-a2-satellite-orbits-comparison"');
  }
  if (!isPosNum(spec.earthMassKg) || spec.earthMassKg < 5.5e24 || spec.earthMassKg > 6.5e24) {
    issues.push("earthMassKg must be close to Earth's mass (5.97e24 kg)");
  }
  if (!isPosNum(spec.earthRadiusM) || spec.earthRadiusM < 6.0e6 || spec.earthRadiusM > 6.8e6) {
    issues.push("earthRadiusM must be close to Earth's radius (6.37e6 m)");
  }
  if (!isPosNum(spec.geoPeriodS) || spec.geoPeriodS < 85000 || spec.geoPeriodS > 87000) {
    issues.push("geoPeriodS must be close to 86400 s (24 h)");
  }
  if (!isPosNum(spec.leoAltitudeKm) || spec.leoAltitudeKm < 200 || spec.leoAltitudeKm > 1600) {
    issues.push("leoAltitudeKm must be within [200, 1600] km");
  }
  if (!isPosNum(spec.satelliteMassKg) || spec.satelliteMassKg < 100 || spec.satelliteMassKg > 5000) {
    issues.push("satelliteMassKg must be within [100, 5000] kg");
  }
  return { valid: issues.length === 0, issues };
}

function solveSatellite(spec: Record<string, unknown>): DomainSolveOutput {
  const mE = spec.earthMassKg as number;
  const rE = spec.earthRadiusM as number;
  const tGeo = spec.geoPeriodS as number;
  const hLeoKm = spec.leoAltitudeKm as number;
  const mSat = spec.satelliteMassKg as number;

  const geoRadiusM = Math.cbrt((ALEVEL_BIG_G * mE * tGeo * tGeo) / (4 * Math.PI * Math.PI));
  const geoAltitudeM = geoRadiusM - rE;
  const geoSpeedMs = Math.sqrt((ALEVEL_BIG_G * mE) / geoRadiusM);

  const leoRadiusM = rE + hLeoKm * 1000;
  const leoSpeedMs = Math.sqrt((ALEVEL_BIG_G * mE) / leoRadiusM);
  const leoPeriodS = 2 * Math.PI * Math.sqrt(leoRadiusM ** 3 / (ALEVEL_BIG_G * mE));
  const leoPeriodMin = leoPeriodS / 60;
  const leoTotalEnergyJ = -(ALEVEL_BIG_G * mE * mSat) / (2 * leoRadiusM);
  const geoTotalEnergyJ = -(ALEVEL_BIG_G * mE * mSat) / (2 * geoRadiusM);
  const energyToRaiseToGeoJ = geoTotalEnergyJ - leoTotalEnergyJ;

  const quantities: VerifiedQuantityMap = {
    geoRadiusM,
    geoAltitudeM,
    geoSpeedMs,
    leoRadiusM,
    leoSpeedMs,
    leoPeriodS,
    leoPeriodMin,
    leoTotalEnergyJ,
    geoTotalEnergyJ,
    energyToRaiseToGeoJ,
    geostationaryConditionsAnchor:
      "twenty-four hour orbital period matching Earth rotation, directly above the equator, and orbiting west-to-east",
    orbitComparisonAnchor:
      "polar low-Earth orbit sweeps the entire Earth surface as Earth rotates beneath giving higher image resolution and lower signal latency",
  };

  return {
    solverId: "sixthphysics/alevel-core-a2/satellite-orbits/1.0.0",
    quantities,
    publicNumbers: [mE, rE, tGeo, hLeoKm, mSat],
  };
}

function renderSatelliteSvg(
  spec: Record<string, unknown>,
  options?: DomainRenderOptions,
): DomainRenderOutput {
  const hidden = makeHiddenSet(options);
  const hLeoKm = spec.leoAltitudeKm as number;

  const publicNumbers: number[] = [];
  const publicLabels: string[] = [];
  const hideLeoAlt = hidden.has("leoRadiusM") || hidden.has("leoAltitudeKm");

  const defs =
    arrowMarkerDef("sat-blue", PALETTE.blue) + arrowMarkerDef("sat-teal", PALETTE.teal);
  const lines: string[] = [];

  const cx = 240;
  const cy = 188;

  lines.push(svgText(320, 26, "Geostationary Equatorial Orbit vs Polar Low-Earth Orbit", { size: 13, weight: 700, anchor: "middle" }));

  // Geostationary equatorial ring (wide tilted ellipse)
  lines.push(`<ellipse cx="${cx}" cy="${cy}" rx="206" ry="62" fill="none" stroke="${PALETTE.blue}" stroke-width="2.2" stroke-dasharray="7,4"/>`);
  // Polar LEO ring (tight vertical ellipse)
  lines.push(`<ellipse cx="${cx}" cy="${cy}" rx="34" ry="88" fill="none" stroke="${PALETTE.teal}" stroke-width="2.4"/>`);

  // Earth sphere
  lines.push(`<circle cx="${cx}" cy="${cy}" r="50" fill="${PALETTE.blueSoft}" stroke="${PALETTE.ink}" stroke-width="2"/>`);
  // Spin axis N-S
  lines.push(`<line x1="${cx}" y1="${cy - 68}" x2="${cx}" y2="${cy + 68}" stroke="${PALETTE.ink}" stroke-width="1.4" stroke-dasharray="4,3"/>`);
  lines.push(svgText(cx + 8, cy - 60, "N", { size: 11, weight: 700 }));
  lines.push(svgText(cx + 8, cy + 68, "S", { size: 11, weight: 700 }));
  // Equatorial band + west-to-east arrow
  lines.push(`<path d="M${cx - 48},${cy + 4} Q${cx},${cy + 20} ${cx + 46},${cy + 4}" fill="none" stroke="${PALETTE.ink}" stroke-width="1.5" marker-end="url(#sat-blue)"/>`);
  lines.push(svgText(cx, cy - 8, "Earth", { size: 12, weight: 700, anchor: "middle" }));
  lines.push(svgText(cx, cy + 29, "W → E spin", { size: 9, weight: 600, fill: PALETTE.blue, anchor: "middle" }));

  // GEO satellite marker
  lines.push(`<rect x="${cx + 194}" y="${cy - 8}" width="16" height="12" rx="2" fill="${PALETTE.blue}"/>`);
  lines.push(`<line x1="${cx + 184}" y1="${cy - 2}" x2="${cx + 220}" y2="${cy - 2}" stroke="${PALETTE.blue}" stroke-width="2.4"/>`);

  // Polar LEO satellite marker
  lines.push(`<circle cx="${cx + 31}" cy="${cy - 54}" r="5" fill="${PALETTE.teal}"/>`);

  // Right-hand summary card (diagrammatic, zero leaked target answers)
  lines.push(`<rect x="464" y="64" width="156" height="114" rx="8" fill="${PALETTE.panelBg}" stroke="${PALETTE.blue}" stroke-width="1.4"/>`);
  lines.push(svgText(476, 86, "Geostationary (GEO)", { size: 11, weight: 700, fill: PALETTE.blue }));
  lines.push(svgText(476, 106, "• Equatorial plane", { size: 10 }));
  lines.push(svgText(476, 124, "• High orbital radius", { size: 10 }));
  lines.push(svgText(476, 142, "• Fixed above ground", { size: 10 }));
  lines.push(svgText(476, 160, "• Fixed dish comms", { size: 10, fill: PALETTE.muted }));

  lines.push(`<rect x="464" y="196" width="156" height="114" rx="8" fill="${PALETTE.panelBg}" stroke="${PALETTE.teal}" stroke-width="1.4"/>`);
  lines.push(svgText(476, 218, "Polar LEO", { size: 11, weight: 700, fill: PALETTE.teal }));
  const leoAltText = hideLeoAlt ? "• Low altitude h" : `• Altitude h = ${fmtSvgNum(hLeoKm, 3)} km`;
  if (!hideLeoAlt) publicNumbers.push(hLeoKm);
  publicLabels.push(leoAltText);
  lines.push(svgText(476, 238, leoAltText, { size: 10 }));
  lines.push(svgText(476, 256, "• Passes over poles", { size: 10 }));
  lines.push(svgText(476, 274, "• Short period, high v", { size: 10 }));
  lines.push(svgText(476, 292, "• Weather & imaging", { size: 10, fill: PALETTE.muted }));

  const scaleNote = "Not to scale (rᴳᴱᴼ ≈ 6.6 Rᴇ)";
  publicNumbers.push(6.6);
  publicLabels.push(scaleNote);
  lines.push(svgText(cx, 340, scaleNote, { size: 10, fill: PALETTE.muted, anchor: "middle" }));

  return {
    visualFamily: "grav-astro",
    svgMarkup: svgWrap(
      "Comparison of equatorial geostationary satellite orbit and low-Earth polar satellite orbit around Earth",
      defs,
      lines.join("\n"),
    ),
    rendererVersion: ALEVEL_CORE_A2_RENDERER_VERSION,
    publicNumbers,
    publicLabels,
  };
}

/* ========================================================================== */
/*  6. al-a2-grav-vs-electric-fields (3.7.3 + 3.7.2, fields)                  */
/* ========================================================================== */

const CHARGE_POLARITIES = ["positive", "negative"] as const;
type ChargePolarity = (typeof CHARGE_POLARITIES)[number];

const gravVsElecFields: readonly DomainKindFieldSpec[] = [
  { name: "kind", type: "string", enumValues: ["al-a2-grav-vs-electric-fields"] },
  { name: "centralMassKg", type: "number", unit: "kg", bounds: "> 0" },
  { name: "centralChargeC", type: "number", unit: "C", bounds: "!= 0" },
  { name: "testMassKg", type: "number", unit: "kg", bounds: "> 0" },
  { name: "testChargeC", type: "number", unit: "C", bounds: "!= 0" },
  { name: "separationM", type: "number", unit: "m", bounds: "> 0" },
  { name: "chargePolarity", type: "string", enumValues: CHARGE_POLARITIES },
];

function validateGravVsElec(spec: Record<string, unknown>): DomainValidationResult {
  const issues: string[] = [];
  if (spec.kind !== "al-a2-grav-vs-electric-fields") {
    issues.push('kind must be "al-a2-grav-vs-electric-fields"');
  }
  if (!isPosNum(spec.centralMassKg)) issues.push("centralMassKg must be > 0");
  if (!isFiniteNum(spec.centralChargeC) || Math.abs(spec.centralChargeC) < 1e-25) {
    issues.push("centralChargeC must be non-zero");
  }
  if (!isPosNum(spec.testMassKg)) issues.push("testMassKg must be > 0");
  if (!isFiniteNum(spec.testChargeC) || Math.abs(spec.testChargeC) < 1e-25) {
    issues.push("testChargeC must be non-zero");
  }
  if (!isPosNum(spec.separationM)) issues.push("separationM must be > 0");
  if (!CHARGE_POLARITIES.includes(spec.chargePolarity as ChargePolarity)) {
    issues.push('chargePolarity must be "positive" or "negative"');
  }
  return { valid: issues.length === 0, issues };
}

function solveGravVsElec(spec: Record<string, unknown>): DomainSolveOutput {
  const m1 = spec.centralMassKg as number;
  const q1Raw = spec.centralChargeC as number;
  const m2 = spec.testMassKg as number;
  const q2 = spec.testChargeC as number;
  const r = spec.separationM as number;
  const polarity = spec.chargePolarity as ChargePolarity;
  const q1 = polarity === "positive" ? Math.abs(q1Raw) : -Math.abs(q1Raw);

  const gravForceN = (ALEVEL_BIG_G * m1 * m2) / (r * r);
  const elecForceN = Math.abs(q1 * q2) / (4 * Math.PI * ALEVEL_EPSILON_0 * r * r);
  const forceRatioFeOverFg = elecForceN / gravForceN;
  const gravFieldNPerKg = (ALEVEL_BIG_G * m1) / (r * r);
  const elecFieldNPerC = Math.abs(q1) / (4 * Math.PI * ALEVEL_EPSILON_0 * r * r);
  const gravPotentialJPerKg = -(ALEVEL_BIG_G * m1) / r;
  const elecPotentialV = q1 / (4 * Math.PI * ALEVEL_EPSILON_0 * r);

  const quantities: VerifiedQuantityMap = {
    gravForceN,
    elecForceN,
    forceRatioFeOverFg,
    gravFieldNPerKg,
    elecFieldNPerC,
    gravPotentialJPerKg,
    elecPotentialV,
    fieldComparisonAnchor:
      "both obey inverse-square laws with zero potential at infinity, but gravitational force is always attractive with negative potential whereas electric force can attract or repel with positive or negative potential",
    equipotentialAnchor:
      "equipotential surfaces are always perpendicular to field lines and zero work is done moving a mass or charge along an equipotential",
    potentialGradientAnchor:
      "field strength equals the negative potential gradient so more closely spaced equipotentials indicate a stronger field",
  };

  return {
    solverId: "sixthphysics/alevel-core-a2/grav-vs-electric/1.0.0",
    quantities,
    publicNumbers: [m1, Math.abs(q1), m2, Math.abs(q2), r],
  };
}

function renderGravVsElecSvg(
  spec: Record<string, unknown>,
  options?: DomainRenderOptions,
): DomainRenderOutput {
  const hidden = makeHiddenSet(options);
  const hideFieldHints =
    hidden.has("fieldComparisonAnchor") ||
    hidden.has("equipotentialAnchor") ||
    hidden.has("potentialGradientAnchor");
  const polarity = spec.chargePolarity as ChargePolarity;
  const outward = polarity === "positive";

  const defs =
    arrowMarkerDef("ge-teal", PALETTE.teal) +
    arrowMarkerDef("ge-blue", PALETTE.blue) +
    arrowMarkerDef("ge-red", PALETTE.red);
  const lines: string[] = [];

  lines.push(svgText(320, 26, "Radial Field Lines & Equipotential Surfaces", { size: 13, weight: 700, anchor: "middle" }));

  // Divider
  lines.push(`<line x1="320" y1="42" x2="320" y2="336" stroke="${PALETTE.grid}" stroke-width="1.5"/>`);

  const drawRadialPanel = (
    cx: number,
    cy: number,
    title: string,
    coreLabel: string,
    coreFill: string,
    lineColor: string,
    markerId: string,
    arrowsOutward: boolean,
    potCaption: string,
  ) => {
    lines.push(svgText(cx, 50, title, { size: 12, weight: 700, fill: lineColor, anchor: "middle" }));
    // Concentric equipotentials (spacing increases with r -> 1/r potential)
    for (const rad of [42, 68, 108]) {
      lines.push(
        `<circle cx="${cx}" cy="${cy}" r="${rad}" fill="none" stroke="${PALETTE.muted}" stroke-width="1.3" stroke-dasharray="5,4"/>`,
      );
    }
    // 8 radial field lines
    for (let k = 0; k < 8; k += 1) {
      const ang = (k * Math.PI) / 4;
      const rInner = 24;
      const rOuter = 118;
      const xIn = cx + rInner * Math.cos(ang);
      const yIn = cy + rInner * Math.sin(ang);
      const xOut = cx + rOuter * Math.cos(ang);
      const yOut = cy + rOuter * Math.sin(ang);
      const xMid = cx + 82 * Math.cos(ang);
      const yMid = cy + 82 * Math.sin(ang);
      if (arrowsOutward) {
        lines.push(`<line x1="${fc(xIn)}" y1="${fc(yIn)}" x2="${fc(xMid)}" y2="${fc(yMid)}" stroke="${lineColor}" stroke-width="1.8" marker-end="url(#${markerId})"/>`);
        lines.push(`<line x1="${fc(xMid)}" y1="${fc(yMid)}" x2="${fc(xOut)}" y2="${fc(yOut)}" stroke="${lineColor}" stroke-width="1.8"/>`);
      } else {
        lines.push(`<line x1="${fc(xOut)}" y1="${fc(yOut)}" x2="${fc(xMid)}" y2="${fc(yMid)}" stroke="${lineColor}" stroke-width="1.8" marker-end="url(#${markerId})"/>`);
        lines.push(`<line x1="${fc(xMid)}" y1="${fc(yMid)}" x2="${fc(xIn)}" y2="${fc(yIn)}" stroke="${lineColor}" stroke-width="1.8"/>`);
      }
    }
    lines.push(`<circle cx="${cx}" cy="${cy}" r="20" fill="${coreFill}" stroke="${lineColor}" stroke-width="2"/>`);
    lines.push(svgText(cx, cy + 5, coreLabel, { size: 13, weight: 700, fill: lineColor, anchor: "middle" }));
    lines.push(svgText(cx, 326, potCaption, { size: 10, fill: PALETTE.muted, anchor: "middle" }));
  };

  drawRadialPanel(
    160,
    186,
    "Gravitational Field (Mass M)",
    "M",
    PALETTE.tealSoft,
    PALETTE.teal,
    "ge-teal",
    false,
    hideFieldHints ? "Radial gravitational field around M" : "Always attractive; V = −GM / r < 0",
  );

  drawRadialPanel(
    480,
    186,
    outward ? "Electric Field (+Q)" : "Electric Field (−Q)",
    outward ? "+Q" : "−Q",
    outward ? PALETTE.redSoft : PALETTE.blueSoft,
    outward ? PALETTE.red : PALETTE.blue,
    outward ? "ge-red" : "ge-blue",
    outward,
    hideFieldHints
      ? outward
        ? "Radial electric field around +Q"
        : "Radial electric field around −Q"
      : outward
        ? "Repels +q; V = +Q / (4πε₀r) > 0"
        : "Attracts +q; V = −|Q| / (4πε₀r) < 0",
  );

  lines.push(
    svgText(
      320,
      348,
      hideFieldHints
        ? "Dashed circles represent concentric equipotential surfaces"
        : "Dashed circles: equipotential surfaces (always 90° to field lines, ΔW = 0 along surface)",
      { size: 10, fill: PALETTE.muted, anchor: "middle" },
    ),
  );

  return {
    visualFamily: "fields",
    svgMarkup: svgWrap(
      "Side-by-side comparison of radial gravitational field lines and electric field lines with orthogonal equipotential circles",
      defs,
      lines.join("\n"),
    ),
    rendererVersion: ALEVEL_CORE_A2_RENDERER_VERSION,
    publicNumbers: [90],
    publicLabels: ["90°"],
  };
}

/* ========================================================================== */
/*  7. al-a2-capacitor-polar-dielectric (3.7.4, fields)                       */
/* ========================================================================== */

const CAP_MODES = ["isolated", "connected"] as const;
type CapMode = (typeof CAP_MODES)[number];

const polarDielectricFields: readonly DomainKindFieldSpec[] = [
  { name: "kind", type: "string", enumValues: ["al-a2-capacitor-polar-dielectric"] },
  { name: "plateAreaCm2", type: "number", unit: "cm²", bounds: "10 <= A <= 1000" },
  { name: "plateSeparationMm", type: "number", unit: "mm", bounds: "0.2 <= d <= 10" },
  { name: "relativePermittivity", type: "number", bounds: "1.5 <= epsR <= 12" },
  { name: "initialVoltageV", type: "number", unit: "V", bounds: "3 <= V0 <= 120" },
  { name: "connectionMode", type: "string", enumValues: CAP_MODES },
];

function validatePolarDielectric(spec: Record<string, unknown>): DomainValidationResult {
  const issues: string[] = [];
  if (spec.kind !== "al-a2-capacitor-polar-dielectric") {
    issues.push('kind must be "al-a2-capacitor-polar-dielectric"');
  }
  if (!isPosNum(spec.plateAreaCm2) || spec.plateAreaCm2 < 10 || spec.plateAreaCm2 > 1000) {
    issues.push("plateAreaCm2 must be within [10, 1000] cm²");
  }
  if (!isPosNum(spec.plateSeparationMm) || spec.plateSeparationMm < 0.2 || spec.plateSeparationMm > 10) {
    issues.push("plateSeparationMm must be within [0.2, 10] mm");
  }
  if (!isPosNum(spec.relativePermittivity) || spec.relativePermittivity < 1.5 || spec.relativePermittivity > 12) {
    issues.push("relativePermittivity must be within [1.5, 12]");
  }
  if (!isPosNum(spec.initialVoltageV) || spec.initialVoltageV < 3 || spec.initialVoltageV > 120) {
    issues.push("initialVoltageV must be within [3, 120] V");
  }
  if (!CAP_MODES.includes(spec.connectionMode as CapMode)) {
    issues.push('connectionMode must be "isolated" or "connected"');
  }
  return { valid: issues.length === 0, issues };
}

function solvePolarDielectric(spec: Record<string, unknown>): DomainSolveOutput {
  const areaM2 = (spec.plateAreaCm2 as number) * 1e-4;
  const dM = (spec.plateSeparationMm as number) * 1e-3;
  const epsR = spec.relativePermittivity as number;
  const v0 = spec.initialVoltageV as number;
  const mode = spec.connectionMode as CapMode;

  const capacitanceAirF = (ALEVEL_EPSILON_0 * areaM2) / dM;
  const capacitanceDielectricF = epsR * capacitanceAirF;
  const initialChargeC = capacitanceAirF * v0;
  const initialEnergyJ = 0.5 * capacitanceAirF * v0 * v0;
  const finalVoltageV = mode === "isolated" ? v0 / epsR : v0;
  const finalChargeC = mode === "isolated" ? initialChargeC : initialChargeC * epsR;
  const finalEnergyJ = mode === "isolated" ? initialEnergyJ / epsR : initialEnergyJ * epsR;
  const batteryWorkInitialJ = initialChargeC * v0;
  const chargingHeatLossInitialJ = 0.5 * initialChargeC * v0;

  const modeEnergyOutcomeAnchor =
    mode === "isolated"
      ? "charge stays constant so potential difference and stored energy decrease by factor relative permittivity"
      : "potential difference stays constant so extra charge flows from the supply and stored energy increases by factor relative permittivity";

  const quantities: VerifiedQuantityMap = {
    capacitanceAirF,
    capacitanceAirPF: capacitanceAirF * 1e12,
    capacitanceDielectricF,
    capacitanceDielectricPF: capacitanceDielectricF * 1e12,
    initialChargeC,
    initialChargeNC: initialChargeC * 1e9,
    initialEnergyJ,
    initialEnergyNJ: initialEnergyJ * 1e9,
    finalVoltageV,
    finalChargeC,
    finalChargeNC: finalChargeC * 1e9,
    finalEnergyJ,
    finalEnergyNJ: finalEnergyJ * 1e9,
    batteryWorkInitialJ,
    chargingHeatLossInitialJ,
    chargingHeatLossInitialNJ: chargingHeatLossInitialJ * 1e9,
    dielectricAnchor:
      "polar molecules rotate to align negative ends toward the positive plate, producing an opposing internal electric field that reduces net field and increases capacitance by relative permittivity",
    chargingEfficiencyAnchor:
      "battery supplies energy Q V while the capacitor stores half Q V so exactly fifty percent is dissipated as thermal energy in circuit resistance regardless of resistance value",
    modeEnergyOutcomeAnchor,
  };

  return {
    solverId: "sixthphysics/alevel-core-a2/polar-dielectric/1.0.0",
    quantities,
    publicNumbers: [
      spec.plateAreaCm2 as number,
      spec.plateSeparationMm as number,
      epsR,
      v0,
    ],
  };
}

function renderPolarDielectricSvg(
  spec: Record<string, unknown>,
  options?: DomainRenderOptions,
): DomainRenderOutput {
  const hidden = makeHiddenSet(options);
  const epsR = spec.relativePermittivity as number;
  const mode = spec.connectionMode as CapMode;
  const hideEpsR =
    hidden.has("relativePermittivity") ||
    hidden.has("capacitanceDielectricF") ||
    hidden.has("capacitanceDielectricPF");

  const publicNumbers: number[] = [];
  const publicLabels: string[] = [];

  const defs =
    arrowMarkerDef("pd-blue", PALETTE.blue) + arrowMarkerDef("pd-red", PALETTE.red);
  const lines: string[] = [];

  lines.push(svgText(178, 26, "Polar Dielectric Between Parallel Plates", { size: 12, weight: 700, anchor: "middle" }));

  // Top + plate
  lines.push(`<rect x="48" y="64" width="260" height="16" rx="2" fill="${PALETTE.redSoft}" stroke="${PALETTE.red}" stroke-width="2"/>`);
  for (let i = 0; i < 6; i += 1) {
    lines.push(svgText(72 + i * 42, 76, "+", { size: 13, weight: 700, fill: PALETTE.red, anchor: "middle" }));
  }

  // Dielectric slab
  lines.push(`<rect x="58" y="92" width="240" height="132" rx="8" fill="${PALETTE.amberSoft}" fill-opacity="0.55" stroke="${PALETTE.amber}" stroke-width="1.6"/>`);

  // Aligned polar molecules (3 rows x 4 cols: − top, + bottom)
  for (let row = 0; row < 3; row += 1) {
    for (let col = 0; col < 4; col += 1) {
      const mx = 96 + col * 54;
      const my = 114 + row * 42;
      lines.push(`<ellipse cx="${mx}" cy="${my}" rx="11" ry="15" fill="#ffffff" stroke="${PALETTE.ink}" stroke-width="1.3"/>`);
      lines.push(svgText(mx, my - 3, "−", { size: 11, weight: 700, fill: PALETTE.blue, anchor: "middle" }));
      lines.push(svgText(mx, my + 11, "+", { size: 11, weight: 700, fill: PALETTE.red, anchor: "middle" }));
    }
  }

  // Applied E0 downward arrow (left side) & opposing Eint upward arrow (right side)
  lines.push(`<line x1="30" y1="96" x2="30" y2="218" stroke="${PALETTE.red}" stroke-width="2.4" marker-end="url(#pd-red)"/>`);
  lines.push(svgText(20, 160, "E₀", { size: 11, weight: 700, fill: PALETTE.red, anchor: "middle" }));

  lines.push(`<line x1="322" y1="218" x2="322" y2="96" stroke="${PALETTE.blue}" stroke-width="2.4" marker-end="url(#pd-blue)"/>`);
  lines.push(svgText(344, 160, "Eᵢₙₜ", { size: 11, weight: 700, fill: PALETTE.blue, anchor: "middle" }));

  // Bottom − plate
  lines.push(`<rect x="48" y="236" width="260" height="16" rx="2" fill="${PALETTE.blueSoft}" stroke="${PALETTE.blue}" stroke-width="2"/>`);
  for (let i = 0; i < 6; i += 1) {
    lines.push(svgText(72 + i * 42, 248, "−", { size: 13, weight: 700, fill: PALETTE.blue, anchor: "middle" }));
  }

  const slabNote = hideEpsR
    ? `Dielectric (relative permittivity εᵣ, ${mode})`
    : `Dielectric εᵣ = ${fmtSvgNum(epsR, 3)} (${mode})`;
  if (!hideEpsR) publicNumbers.push(epsR);
  publicLabels.push(slabNote);
  const hideDielectricHint = hidden.has("dielectricAnchor") || hidden.has("modeEnergyOutcomeAnchor");
  const hideHeatHint =
    hidden.has("chargingEfficiencyAnchor") ||
    hidden.has("chargingHeatLossInitialJ") ||
    hidden.has("chargingHeatLossInitialNJ");
  lines.push(svgText(178, 282, slabNote, { size: 11, weight: 600, anchor: "middle" }));
  lines.push(
    svgText(
      178,
      302,
      hideDielectricHint ? "Polar molecules inside slab" : "Net field E = E₀ − Eᵢₙₜ decreases",
      { size: 10, fill: PALETTE.muted, anchor: "middle" },
    ),
  );

  // Right panel: Q vs V charging energy graph (50% stored vs 50% dissipated)
  const gx0 = 408;
  const gx1 = 602;
  const gyTop = 74;
  const gyBot = 258;

  lines.push(svgText(505, 26, "Charging Energy Balance (Fixed V)", { size: 12, weight: 700, anchor: "middle" }));
  // Upper triangle: heat lost = 1/2 QV
  lines.push(`<polygon points="${gx0},${gyTop} ${gx1},${gyTop} ${gx0},${gyBot}" fill="${PALETTE.redSoft}" opacity="0.65"/>`);
  // Lower triangle: stored in capacitor = 1/2 QV
  lines.push(`<polygon points="${gx0},${gyBot} ${gx1},${gyTop} ${gx1},${gyBot}" fill="${PALETTE.tealSoft}" opacity="0.8"/>`);
  lines.push(`<rect x="${gx0}" y="${gyTop}" width="${gx1 - gx0}" height="${gyBot - gyTop}" fill="none" stroke="${PALETTE.subtle}" stroke-width="1" stroke-dasharray="4,3"/>`);
  lines.push(`<line x1="${gx0}" y1="${gyBot}" x2="${gx1}" y2="${gyTop}" stroke="${PALETTE.teal}" stroke-width="2.6"/>`);
  lines.push(`<line x1="${gx0}" y1="${gyBot}" x2="${gx1 + 10}" y2="${gyBot}" stroke="${PALETTE.ink}" stroke-width="1.8"/>`);
  lines.push(`<line x1="${gx0}" y1="${gyBot}" x2="${gx0}" y2="${gyTop - 10}" stroke="${PALETTE.ink}" stroke-width="1.8"/>`);

  lines.push(svgText(gx0 + 52, gyTop + 42, hideHeatHint ? "Upper region" : "Heat in R", { size: 10, weight: 700, fill: PALETTE.red, anchor: "middle" }));
  if (!hideHeatHint) {
    lines.push(svgText(gx0 + 52, gyTop + 57, "½QV", { size: 11, weight: 700, fill: PALETTE.red, anchor: "middle" }));
  }

  lines.push(svgText(gx1 - 54, gyBot - 40, hideHeatHint ? "Lower region" : "Stored E", { size: 10, weight: 700, fill: PALETTE.teal, anchor: "middle" }));
  if (!hideHeatHint) {
    lines.push(svgText(gx1 - 54, gyBot - 25, "½QV", { size: 11, weight: 700, fill: PALETTE.teal, anchor: "middle" }));
  }

  lines.push(svgText(gx1, gyBot + 16, "Q", { size: 11, weight: 700, anchor: "middle" }));
  lines.push(svgText(gx0 - 10, gyTop + 4, "V", { size: 11, weight: 700, anchor: "end" }));
  lines.push(svgText(505, 290, "Charge Q", { size: 11, weight: 600, anchor: "middle" }));
  lines.push(svgText(505, 310, "Supply work W = QV", { size: 10, fill: PALETTE.muted, anchor: "middle" }));
  lines.push(
    svgText(384, (gyTop + gyBot) / 2, "PD V", {
      size: 11,
      weight: 600,
      anchor: "middle",
      rotate: `rotate(-90 384 ${fc((gyTop + gyBot) / 2)})`,
    }),
  );

  return {
    visualFamily: "fields",
    svgMarkup: svgWrap(
      "Parallel-plate capacitor containing aligned polar dielectric dipoles and Q versus V charging energy balance graph",
      defs,
      lines.join("\n"),
    ),
    rendererVersion: ALEVEL_CORE_A2_RENDERER_VERSION,
    publicNumbers,
    publicLabels,
  };
}

/* ========================================================================== */
/*  8. al-a2-lenz-law-energy-conservation (3.7.5, em-induction)               */
/* ========================================================================== */

const MAGNET_POLES = ["N", "S"] as const;
type MagnetPole = (typeof MAGNET_POLES)[number];

const lenzFields: readonly DomainKindFieldSpec[] = [
  { name: "kind", type: "string", enumValues: ["al-a2-lenz-law-energy-conservation"] },
  { name: "coilTurnsN", type: "number", bounds: "50 <= N <= 2000 (integer)" },
  { name: "peakFluxWb", type: "number", unit: "Wb", bounds: "1e-5 <= Phi <= 5e-3" },
  { name: "entryDurationMs", type: "number", unit: "ms", bounds: "20 <= t1 <= 200" },
  { name: "exitDurationMs", type: "number", unit: "ms", bounds: "10 <= t2 < t1" },
  { name: "coilResistanceOhm", type: "number", unit: "Ω", bounds: "1 <= R <= 100" },
  { name: "leadingPole", type: "string", enumValues: MAGNET_POLES },
];

function validateLenz(spec: Record<string, unknown>): DomainValidationResult {
  const issues: string[] = [];
  if (spec.kind !== "al-a2-lenz-law-energy-conservation") {
    issues.push('kind must be "al-a2-lenz-law-energy-conservation"');
  }
  if (!isPosNum(spec.coilTurnsN) || !Number.isInteger(spec.coilTurnsN) || spec.coilTurnsN < 50 || spec.coilTurnsN > 2000) {
    issues.push("coilTurnsN must be an integer in [50, 2000]");
  }
  if (!isPosNum(spec.peakFluxWb) || spec.peakFluxWb < 1e-5 || spec.peakFluxWb > 5e-3) {
    issues.push("peakFluxWb must be in [1e-5, 5e-3] Wb");
  }
  if (!isPosNum(spec.entryDurationMs) || spec.entryDurationMs < 20 || spec.entryDurationMs > 200) {
    issues.push("entryDurationMs must be in [20, 200] ms");
  }
  if (
    !isPosNum(spec.exitDurationMs) ||
    !isPosNum(spec.entryDurationMs) ||
    spec.exitDurationMs < 10 ||
    spec.exitDurationMs >= spec.entryDurationMs
  ) {
    issues.push("exitDurationMs must be >= 10 ms and strictly less than entryDurationMs");
  }
  if (!isPosNum(spec.coilResistanceOhm) || spec.coilResistanceOhm < 1 || spec.coilResistanceOhm > 100) {
    issues.push("coilResistanceOhm must be in [1, 100] Ω");
  }
  if (!MAGNET_POLES.includes(spec.leadingPole as MagnetPole)) {
    issues.push('leadingPole must be "N" or "S"');
  }
  return { valid: issues.length === 0, issues };
}

function solveLenz(spec: Record<string, unknown>): DomainSolveOutput {
  const n = spec.coilTurnsN as number;
  const phi = spec.peakFluxWb as number;
  const t1s = (spec.entryDurationMs as number) * 1e-3;
  const t2s = (spec.exitDurationMs as number) * 1e-3;
  const rOhm = spec.coilResistanceOhm as number;
  const pole = spec.leadingPole as MagnetPole;

  const maxFluxLinkageWbTurns = n * phi;
  const meanEntryEmfV = maxFluxLinkageWbTurns / t1s;
  const meanExitEmfV = maxFluxLinkageWbTurns / t2s;
  const exitToEntryEmfRatio = t1s / t2s;
  const entryCurrentA = meanEntryEmfV / rOhm;
  const exitCurrentA = meanExitEmfV / rOhm;

  const approachPoleInduced =
    pole === "N"
      ? "north pole induced at the top of the coil repelling the approaching north pole"
      : "south pole induced at the top of the coil repelling the approaching south pole";

  const quantities: VerifiedQuantityMap = {
    maxFluxLinkageWbTurns,
    meanEntryEmfV,
    meanExitEmfV,
    exitToEntryEmfRatio,
    entryCurrentA,
    exitCurrentA,
    approachPoleInduced,
    lenzEnergyAnchor:
      "induced emf opposes the change in magnetic flux linkage producing it so mechanical work done against magnetic opposition converts into electrical thermal energy obeying conservation of energy",
    bipolarPulseAnchor:
      "exit pulse has greater peak emf and shorter duration because the magnet accelerates under gravity while both pulses enclose equal area equal to maximum flux linkage",
  };

  return {
    solverId: "sixthphysics/alevel-core-a2/lenz-energy/1.0.0",
    quantities,
    publicNumbers: [
      n,
      phi,
      spec.entryDurationMs as number,
      spec.exitDurationMs as number,
      rOhm,
    ],
  };
}

function renderLenzSvg(
  spec: Record<string, unknown>,
  options?: DomainRenderOptions,
): DomainRenderOutput {
  const hidden = makeHiddenSet(options);
  const hidePulseHint = hidden.has("bipolarPulseAnchor") || hidden.has("lenzEnergyAnchor");
  const pole = spec.leadingPole as MagnetPole;
  const topPole = pole === "N" ? "S" : "N";

  const defs = arrowMarkerDef("lz-ink", PALETTE.ink);
  const lines: string[] = [];

  lines.push(svgText(146, 26, "Bar Magnet Falling Through Coil", { size: 12, weight: 700, anchor: "middle" }));

  // Vertical bar magnet above coil
  lines.push(`<rect x="128" y="46" width="36" height="36" fill="${topPole === "N" ? PALETTE.redSoft : PALETTE.blueSoft}" stroke="${PALETTE.ink}" stroke-width="1.8"/>`);
  lines.push(`<rect x="128" y="82" width="36" height="36" fill="${pole === "N" ? PALETTE.redSoft : PALETTE.blueSoft}" stroke="${PALETTE.ink}" stroke-width="1.8"/>`);
  lines.push(svgText(146, 69, topPole, { size: 13, weight: 700, fill: topPole === "N" ? PALETTE.red : PALETTE.blue, anchor: "middle" }));
  lines.push(svgText(146, 105, pole, { size: 13, weight: 700, fill: pole === "N" ? PALETTE.red : PALETTE.blue, anchor: "middle" }));

  // Downward motion arrow
  lines.push(`<line x1="184" y1="62" x2="184" y2="112" stroke="${PALETTE.ink}" stroke-width="2.2" marker-end="url(#lz-ink)"/>`);
  lines.push(svgText(196, 92, "v", { size: 12, weight: 700, italic: true }));

  // Solenoid tube & windings
  lines.push(`<rect x="114" y="150" width="64" height="122" rx="6" fill="${PALETTE.panelBg}" stroke="${PALETTE.subtle}" stroke-width="1.6"/>`);
  for (let i = 0; i < 6; i += 1) {
    const wy = 164 + i * 18;
    lines.push(`<ellipse cx="146" cy="${wy}" rx="34" ry="7" fill="none" stroke="${PALETTE.amber}" stroke-width="2.2"/>`);
  }
  // Wires to centre-zero galvanometer
  lines.push(`<polyline points="180,164 228,164 228,196" fill="none" stroke="${PALETTE.ink}" stroke-width="1.8"/>`);
  lines.push(`<polyline points="180,254 228,254 228,224" fill="none" stroke="${PALETTE.ink}" stroke-width="1.8"/>`);
  lines.push(`<circle cx="228" cy="210" r="16" fill="#ffffff" stroke="${PALETTE.ink}" stroke-width="2"/>`);
  lines.push(svgText(228, 215, "G", { size: 12, weight: 700, anchor: "middle" }));
  lines.push(svgText(146, 294, "Solenoid (N turns)", { size: 10, weight: 600, anchor: "middle" }));
  lines.push(svgText(146, 312, "Magnet falls under gravity", { size: 10, fill: PALETTE.muted, anchor: "middle" }));

  // Right panel: Bipolar emf vs time trace (equal areas, exit pulse taller & narrower)
  const gx0 = 310;
  const gx1 = 612;
  const gyTop = 58;
  const gyBot = 296;
  const gyMid = 186;

  lines.push(svgText(460, 26, "Induced EMF ε vs Time t", { size: 12, weight: 700, anchor: "middle" }));
  lines.push(`<rect x="${gx0}" y="${gyTop}" width="${gx1 - gx0}" height="${gyBot - gyTop}" fill="${PALETTE.panelBg}" stroke="${PALETTE.grid}" stroke-width="1"/>`);
  lines.push(`<line x1="${gx0}" y1="${gyMid}" x2="${gx1 + 8}" y2="${gyMid}" stroke="${PALETTE.ink}" stroke-width="1.6"/>`);
  lines.push(`<line x1="${gx0}" y1="${gyBot}" x2="${gx0}" y2="${gyTop - 8}" stroke="${PALETTE.ink}" stroke-width="1.6"/>`);

  // Positive entrance pulse (broader, shorter)
  const enterPts: Array<[number, number]> = [];
  for (let i = 0; i <= 40; i += 1) {
    const f = i / 40;
    const x = gx0 + 20 + f * 124;
    const y = gyMid - 64 * Math.sin(Math.PI * f) ** 1.4;
    enterPts.push([x, y]);
  }
  lines.push(`<path d="${polylinePath(enterPts)} Z" fill="${PALETTE.blueSoft}" opacity="0.7"/>`);
  lines.push(`<path d="${polylinePath(enterPts)}" fill="none" stroke="${PALETTE.blue}" stroke-width="2.5"/>`);

  // Negative exit pulse (narrower, taller, same area!)
  const exitPts: Array<[number, number]> = [];
  for (let i = 0; i <= 40; i += 1) {
    const f = i / 40;
    const x = gx0 + 186 + f * 84;
    const y = gyMid + 94 * Math.sin(Math.PI * f) ** 1.4;
    exitPts.push([x, y]);
  }
  lines.push(`<path d="${polylinePath(exitPts)} Z" fill="${PALETTE.redSoft}" opacity="0.7"/>`);
  lines.push(`<path d="${polylinePath(exitPts)}" fill="none" stroke="${PALETTE.red}" stroke-width="2.5"/>`);

  // Midpoint marker (dPhi/dt = 0)
  lines.push(`<circle cx="${gx0 + 165}" cy="${gyMid}" r="3.6" fill="${PALETTE.ink}"/>`);
  lines.push(svgText(gx0 + 82, gyMid - 72, "Entry (Area A₁)", { size: 10, weight: 700, fill: PALETTE.blue, anchor: "middle" }));
  lines.push(svgText(gx0 + 228, gyMid + 106, "Exit (Area A₂)", { size: 10, weight: 700, fill: PALETTE.red, anchor: "middle" }));
  lines.push(svgText(gx0 + 165, gyMid - 14, "Centre: ε = 0", { size: 9, weight: 600, fill: PALETTE.muted, anchor: "middle" }));
  lines.push(svgText(460, 322, "Time t", { size: 11, weight: 600, anchor: "middle" }));
  lines.push(
    svgText(
      460,
      342,
      hidePulseHint
        ? "Shaded pulses A₁ (entry) and A₂ (exit)"
        : "Equal shaded areas |A₁| = |A₂| = NΦ",
      { size: 10, fill: PALETTE.muted, anchor: "middle" },
    ),
  );
  lines.push(
    svgText(286, gyMid, "Induced emf ε", {
      size: 11,
      weight: 600,
      anchor: "middle",
      rotate: `rotate(-90 286 ${gyMid})`,
    }),
  );

  return {
    visualFamily: "em-induction",
    svgMarkup: svgWrap(
      "Bar magnet falling vertically through a solenoid with bipolar induced emf versus time graph of equal pulse areas",
      defs,
      lines.join("\n"),
    ),
    rendererVersion: ALEVEL_CORE_A2_RENDERER_VERSION,
    publicNumbers: [0],
    publicLabels: ["0", "Centre: ε = 0"],
  };
}

/* ========================================================================== */
/*  9. al-a2-transformer-losses-design (3.7.5, em-induction)                  */
/* ========================================================================== */

const transformerFields: readonly DomainKindFieldSpec[] = [
  { name: "kind", type: "string", enumValues: ["al-a2-transformer-losses-design"] },
  { name: "primaryTurns", type: "number", bounds: "100 <= Np <= 5000 (integer)" },
  { name: "secondaryTurns", type: "number", bounds: "50 <= Ns <= 20000 (integer)" },
  { name: "primaryVoltageV", type: "number", unit: "V", bounds: "12 <= Vp <= 30000" },
  { name: "secondaryCurrentA", type: "number", unit: "A", bounds: "0.2 <= Is <= 200" },
  { name: "efficiencyPct", type: "number", unit: "%", bounds: "75 <= eta <= 99" },
  { name: "lineResistanceOhm", type: "number", unit: "Ω", bounds: "0.5 <= R <= 50" },
  { name: "gridPowerW", type: "number", unit: "W", bounds: "1e5 <= P <= 2e8" },
];

function validateTransformer(spec: Record<string, unknown>): DomainValidationResult {
  const issues: string[] = [];
  if (spec.kind !== "al-a2-transformer-losses-design") {
    issues.push('kind must be "al-a2-transformer-losses-design"');
  }
  if (!isPosNum(spec.primaryTurns) || !Number.isInteger(spec.primaryTurns)) {
    issues.push("primaryTurns must be a positive integer");
  }
  if (!isPosNum(spec.secondaryTurns) || !Number.isInteger(spec.secondaryTurns)) {
    issues.push("secondaryTurns must be a positive integer");
  }
  if (!isPosNum(spec.primaryVoltageV) || spec.primaryVoltageV < 12 || spec.primaryVoltageV > 30000) {
    issues.push("primaryVoltageV must be in [12, 30000] V");
  }
  if (!isPosNum(spec.secondaryCurrentA) || spec.secondaryCurrentA < 0.2 || spec.secondaryCurrentA > 200) {
    issues.push("secondaryCurrentA must be in [0.2, 200] A");
  }
  if (!isPosNum(spec.efficiencyPct) || spec.efficiencyPct < 75 || spec.efficiencyPct > 99) {
    issues.push("efficiencyPct must be in [75, 99]%");
  }
  if (!isPosNum(spec.lineResistanceOhm) || spec.lineResistanceOhm < 0.5 || spec.lineResistanceOhm > 50) {
    issues.push("lineResistanceOhm must be in [0.5, 50] Ω");
  }
  if (!isPosNum(spec.gridPowerW) || spec.gridPowerW < 1e5 || spec.gridPowerW > 2e8) {
    issues.push("gridPowerW must be in [1e5, 2e8] W");
  }
  return { valid: issues.length === 0, issues };
}

function solveTransformer(spec: Record<string, unknown>): DomainSolveOutput {
  const np = spec.primaryTurns as number;
  const ns = spec.secondaryTurns as number;
  const vp = spec.primaryVoltageV as number;
  const isA = spec.secondaryCurrentA as number;
  const eta = (spec.efficiencyPct as number) / 100;
  const rLine = spec.lineResistanceOhm as number;
  const pGrid = spec.gridPowerW as number;

  const secondaryVoltageV = vp * (ns / np);
  const secondaryPowerW = secondaryVoltageV * isA;
  const primaryPowerW = secondaryPowerW / eta;
  const primaryCurrentA = primaryPowerW / vp;
  const corePowerLossW = primaryPowerW - secondaryPowerW;
  const gridCurrentA = pGrid / secondaryVoltageV;
  const gridLineLossW = gridCurrentA * gridCurrentA * rLine;

  const quantities: VerifiedQuantityMap = {
    secondaryVoltageV,
    secondaryPowerW,
    primaryPowerW,
    primaryCurrentA,
    corePowerLossW,
    gridCurrentA,
    gridLineLossW,
    transformerLossAnchor:
      "laminated soft-iron core with insulating layers increases resistance to reduce eddy current heating, soft iron lowers hysteresis loss, thick copper coils cut resistive heating, and a closed core minimises flux leakage",
    laminatedCoreAnchor:
      "thin iron laminations separated by insulating layers increase resistance to eddy current paths reducing thermal energy loss in the core",
    highVoltageGridAnchor:
      "stepping up transmission voltage lowers cable current for the same power so resistive heating in power lines falls as current squared",
  };

  return {
    solverId: "sixthphysics/alevel-core-a2/transformer-losses/1.0.0",
    quantities,
    publicNumbers: [np, ns, vp, isA, spec.efficiencyPct as number, rLine, pGrid],
  };
}

function renderTransformerSvg(
  spec: Record<string, unknown>,
  options?: DomainRenderOptions,
): DomainRenderOutput {
  const hidden = makeHiddenSet(options);
  const np = spec.primaryTurns as number;
  const ns = spec.secondaryTurns as number;
  const vp = spec.primaryVoltageV as number;
  const hideVs = hidden.has("secondaryVoltageV") || hidden.has("primaryCurrentA");

  const publicNumbers: number[] = [];
  const publicLabels: string[] = [];

  const defs = arrowMarkerDef("tr-teal", PALETTE.teal);
  const lines: string[] = [];

  lines.push(svgText(320, 26, "Laminated Soft-Iron Core Transformer", { size: 13, weight: 700, anchor: "middle" }));

  // Outer soft-iron core frame
  lines.push(`<rect x="116" y="70" width="276" height="202" rx="10" fill="#e2e8f0" stroke="${PALETTE.ink}" stroke-width="2.2"/>`);
  // Inner core window
  lines.push(`<rect x="180" y="122" width="148" height="98" rx="4" fill="#ffffff" stroke="${PALETTE.ink}" stroke-width="2"/>`);

  // Lamination edge lines along top & bottom yokes
  for (let i = 1; i <= 4; i += 1) {
    lines.push(`<line x1="120" y1="${70 + i * 10}" x2="388" y2="${70 + i * 10}" stroke="${PALETTE.muted}" stroke-width="0.9" opacity="0.65"/>`);
  }

  // Alternating flux loop inside core
  lines.push(`<rect x="148" y="96" width="212" height="150" rx="6" fill="none" stroke="${PALETTE.teal}" stroke-width="1.8" stroke-dasharray="6,4"/>`);
  lines.push(`<line x1="230" y1="96" x2="266" y2="96" stroke="${PALETTE.teal}" stroke-width="2.2" marker-end="url(#tr-teal)"/>`);
  lines.push(svgText(254, 88, "Alternating flux Φ", { size: 10, weight: 700, fill: PALETTE.teal, anchor: "middle" }));

  // Primary windings on left limb
  for (let i = 0; i < 6; i += 1) {
    const wy = 126 + i * 16;
    lines.push(`<path d="M108,${wy} C114,${wy - 6} 182,${wy - 6} 188,${wy}" fill="none" stroke="${PALETTE.blue}" stroke-width="3"/>`);
  }
  lines.push(`<polyline points="62,126 108,126" fill="none" stroke="${PALETTE.blue}" stroke-width="2"/>`);
  lines.push(`<polyline points="62,206 108,206" fill="none" stroke="${PALETTE.blue}" stroke-width="2"/>`);
  const vpText = `Vₚ = ${fmtSvgNum(vp, 3)} V`;
  const npText = `Nₚ = ${np}`;
  publicNumbers.push(vp, np);
  publicLabels.push(vpText, npText);
  lines.push(svgText(60, 162, vpText, { size: 10, weight: 700, fill: PALETTE.blue, anchor: "middle" }));
  lines.push(svgText(60, 178, npText, { size: 10, fill: PALETTE.muted, anchor: "middle" }));

  // Secondary windings on right limb
  for (let i = 0; i < 8; i += 1) {
    const wy = 122 + i * 13;
    lines.push(`<path d="M320,${wy} C326,${wy - 5} 394,${wy - 5} 400,${wy}" fill="none" stroke="${PALETTE.red}" stroke-width="2.8"/>`);
  }
  lines.push(`<polyline points="400,122 444,122" fill="none" stroke="${PALETTE.red}" stroke-width="2"/>`);
  lines.push(`<polyline points="400,213 444,213" fill="none" stroke="${PALETTE.red}" stroke-width="2"/>`);
  const nsText = `Nₛ = ${ns}`;
  publicNumbers.push(ns);
  publicLabels.push(nsText);
  lines.push(svgText(430, 162, hideVs ? "Vₛ = ?" : "Vₛ output", { size: 10, weight: 700, fill: PALETTE.red, anchor: "middle" }));
  lines.push(svgText(430, 178, nsText, { size: 10, fill: PALETTE.muted, anchor: "middle" }));

  // Right inset: Cutaway laminations breaking eddy-current loops
  lines.push(`<rect x="468" y="66" width="154" height="206" rx="8" fill="${PALETTE.panelBg}" stroke="${PALETTE.grid}" stroke-width="1.4"/>`);
  lines.push(svgText(545, 88, "Laminated Core", { size: 11, weight: 700, anchor: "middle" }));
  lines.push(svgText(545, 104, "Cross-Section", { size: 10, fill: PALETTE.muted, anchor: "middle" }));
  for (let s = 0; s < 5; s += 1) {
    const sx = 492 + s * 22;
    lines.push(`<rect x="${sx}" y="118" width="16" height="106" fill="#cbd5e1" stroke="${PALETTE.ink}" stroke-width="1.2"/>`);
    lines.push(`<ellipse cx="${sx + 8}" cy="171" rx="5" ry="34" fill="none" stroke="${PALETTE.red}" stroke-width="1.2" stroke-dasharray="3,2"/>`);
  }
  const hideLossHints =
    hidden.has("transformerLossAnchor") || hidden.has("laminatedCoreAnchor");
  lines.push(
    svgText(
      545,
      244,
      hideLossHints ? "Thin insulated sheets" : "Insulating varnish",
      { size: 9, weight: 600, fill: PALETTE.ink, anchor: "middle" },
    ),
  );
  lines.push(
    svgText(
      545,
      258,
      hideLossHints ? "stacked core limbs" : "restricts eddy loops",
      { size: 9, fill: PALETTE.red, anchor: "middle" },
    ),
  );

  lines.push(
    svgText(
      254,
      304,
      hideLossHints
        ? "Closed soft-iron core linking primary and secondary coils"
        : "Thick copper coils reduce I²R heating • Soft iron cuts hysteresis loss",
      { size: 10, fill: PALETTE.muted, anchor: "middle" },
    ),
  );

  return {
    visualFamily: "em-induction",
    svgMarkup: svgWrap(
      "Cutaway laminated soft-iron core transformer with primary and secondary coils, flux loop, and insulated laminations",
      defs,
      lines.join("\n"),
    ),
    rendererVersion: ALEVEL_CORE_A2_RENDERER_VERSION,
    publicNumbers,
    publicLabels,
  };
}

/* ========================================================================== */
/*  10. al-a2-oscilloscope-ac-rms (3.7.5, em-induction)                       */
/* ========================================================================== */

const CRO_MODES = ["ac-sinusoid", "timebase-off", "dc-comparison"] as const;
type CroMode = (typeof CRO_MODES)[number];

const croAcFields: readonly DomainKindFieldSpec[] = [
  { name: "kind", type: "string", enumValues: ["al-a2-oscilloscope-ac-rms"] },
  { name: "yGainVPerDiv", type: "number", unit: "V div⁻¹", bounds: "0.2 <= yg <= 20" },
  { name: "timeBaseMsPerDiv", type: "number", unit: "ms div⁻¹", bounds: "0.2 <= tb <= 50" },
  { name: "peakToPeakDivs", type: "number", unit: "div", bounds: "2 <= p2p <= 7" },
  { name: "periodDivs", type: "number", unit: "div", bounds: "2 <= Tdiv <= 8" },
  { name: "loadResistanceOhm", type: "number", unit: "Ω", bounds: "2 <= R <= 500" },
  { name: "displayMode", type: "string", enumValues: CRO_MODES },
];

function validateCroAc(spec: Record<string, unknown>): DomainValidationResult {
  const issues: string[] = [];
  if (spec.kind !== "al-a2-oscilloscope-ac-rms") {
    issues.push('kind must be "al-a2-oscilloscope-ac-rms"');
  }
  if (!isPosNum(spec.yGainVPerDiv) || spec.yGainVPerDiv < 0.2 || spec.yGainVPerDiv > 20) {
    issues.push("yGainVPerDiv must be in [0.2, 20] V div⁻¹");
  }
  if (!isPosNum(spec.timeBaseMsPerDiv) || spec.timeBaseMsPerDiv < 0.2 || spec.timeBaseMsPerDiv > 50) {
    issues.push("timeBaseMsPerDiv must be in [0.2, 50] ms div⁻¹");
  }
  if (!isPosNum(spec.peakToPeakDivs) || spec.peakToPeakDivs < 2 || spec.peakToPeakDivs > 7) {
    issues.push("peakToPeakDivs must be in [2, 7] divisions");
  }
  if (!isPosNum(spec.periodDivs) || spec.periodDivs < 2 || spec.periodDivs > 8) {
    issues.push("periodDivs must be in [2, 8] divisions");
  }
  if (!isPosNum(spec.loadResistanceOhm) || spec.loadResistanceOhm < 2 || spec.loadResistanceOhm > 500) {
    issues.push("loadResistanceOhm must be in [2, 500] Ω");
  }
  if (!CRO_MODES.includes(spec.displayMode as CroMode)) {
    issues.push(`displayMode must be one of ${CRO_MODES.join(", ")}`);
  }
  return { valid: issues.length === 0, issues };
}

function solveCroAc(spec: Record<string, unknown>): DomainSolveOutput {
  const yGain = spec.yGainVPerDiv as number;
  const tbMs = spec.timeBaseMsPerDiv as number;
  const p2pDiv = spec.peakToPeakDivs as number;
  const tDiv = spec.periodDivs as number;
  const rOhm = spec.loadResistanceOhm as number;

  const vPeakToPeakV = p2pDiv * yGain;
  const vPeakV = vPeakToPeakV / 2;
  const vRmsV = vPeakV / Math.SQRT2;
  const periodS = tDiv * tbMs * 1e-3;
  const freqHz = 1 / periodS;
  const meanPowerW = (vRmsV * vRmsV) / rOhm;
  const peakPowerW = (vPeakV * vPeakV) / rOhm;

  const quantities: VerifiedQuantityMap = {
    vPeakToPeakV,
    vPeakV,
    vRmsV,
    periodS,
    freqHz,
    meanPowerW,
    peakPowerW,
    timeBaseOffAnchor:
      "switching off the time base collapses an alternating sinusoid into a vertical central line of length equal to the peak-to-peak voltage",
    rmsDefinitionAnchor:
      "root mean square potential difference equals the steady direct potential difference that dissipates the same mean power in a given resistor",
    timeBaseUncertaintyAnchor:
      "decreasing the time-base setting stretches the waveform horizontally so fewer cycles span the screen and percentage uncertainty in period decreases",
  };

  return {
    solverId: "sixthphysics/alevel-core-a2/oscilloscope-ac-rms/1.0.0",
    quantities,
    publicNumbers: [yGain, tbMs, p2pDiv, tDiv, rOhm],
  };
}

function renderCroAcSvg(
  spec: Record<string, unknown>,
  options?: DomainRenderOptions,
): DomainRenderOutput {
  const hidden = makeHiddenSet(options);
  const yGain = spec.yGainVPerDiv as number;
  const tbMs = spec.timeBaseMsPerDiv as number;
  const p2pDiv = spec.peakToPeakDivs as number;
  const tDiv = spec.periodDivs as number;
  const mode = spec.displayMode as CroMode;

  const publicNumbers: number[] = [yGain, tbMs];
  const publicLabels: string[] = [];

  const sx = 46;
  const sy = 44;
  const divPx = 36;
  const cols = 10;
  const rows = 8;
  const sw = cols * divPx;
  const sh = rows * divPx;
  const cx = sx + sw / 2;
  const cy = sy + sh / 2;

  const lines: string[] = [];
  lines.push(svgText(sx + sw / 2, 26, "Oscilloscope Graticule (10 × 8 div)", { size: 13, weight: 700, anchor: "middle" }));

  // Graticule frame
  lines.push(`<rect x="${sx}" y="${sy}" width="${sw}" height="${sh}" rx="8" fill="#f0fdfa" stroke="${PALETTE.ink}" stroke-width="2.2"/>`);

  // Grid lines
  for (let c = 1; c < cols; c += 1) {
    const gx = sx + c * divPx;
    lines.push(`<line x1="${gx}" y1="${sy}" x2="${gx}" y2="${sy + sh}" stroke="#99f6e4" stroke-width="${c === 5 ? 1.8 : 1}"/>`);
  }
  for (let r = 1; r < rows; r += 1) {
    const gy = sy + r * divPx;
    lines.push(`<line x1="${sx}" y1="${gy}" x2="${sx + sw}" y2="${gy}" stroke="#99f6e4" stroke-width="${r === 4 ? 1.8 : 1}"/>`);
  }
  // Centre axes
  lines.push(`<line x1="${sx}" y1="${cy}" x2="${sx + sw}" y2="${cy}" stroke="${PALETTE.teal}" stroke-width="1.4" opacity="0.65"/>`);
  lines.push(`<line x1="${cx}" y1="${sy}" x2="${cx}" y2="${sy + sh}" stroke="${PALETTE.teal}" stroke-width="1.4" opacity="0.65"/>`);

  const ampPx = (p2pDiv / 2) * divPx;

  if (mode === "timebase-off") {
    lines.push(`<line x1="${cx}" y1="${fc(cy - ampPx)}" x2="${cx}" y2="${fc(cy + ampPx)}" stroke="${PALETTE.blue}" stroke-width="3.6" stroke-linecap="round"/>`);
    lines.push(svgText(cx + 12, cy - ampPx + 14, "Vertical trace", { size: 10, weight: 700, fill: PALETTE.blue }));
  } else {
    const pts: Array<[number, number]> = [];
    const steps = 200;
    for (let i = 0; i <= steps; i += 1) {
      const divX = (cols * i) / steps;
      const x = sx + divX * divPx;
      const y = cy - ampPx * Math.sin((2 * Math.PI * divX) / tDiv);
      pts.push([x, y]);
    }
    lines.push(`<path d="${polylinePath(pts)}" fill="none" stroke="${PALETTE.blue}" stroke-width="2.8" stroke-linejoin="round"/>`);

    if (mode === "dc-comparison") {
      const rmsPx = ampPx / Math.SQRT2;
      lines.push(`<line x1="${sx}" y1="${fc(cy - rmsPx)}" x2="${sx + sw}" y2="${fc(cy - rmsPx)}" stroke="${PALETTE.red}" stroke-width="2.1" stroke-dasharray="6,4"/>`);
      if (!hidden.has("vRmsV")) {
        lines.push(svgText(sx + sw - 8, cy - rmsPx - 6, "Equivalent DC = Vᵣₘₛ", { size: 10, weight: 700, fill: PALETTE.red, anchor: "end" }));
      }
    }
  }

  // Right control panel showing Y-gain & Time-base
  const px = 434;
  lines.push(`<rect x="${px}" y="54" width="184" height="252" rx="10" fill="${PALETTE.panelBg}" stroke="${PALETTE.ink}" stroke-width="1.6"/>`);
  lines.push(svgText(px + 92, 80, "CRO Settings", { size: 12, weight: 700, anchor: "middle" }));

  const ygStr = `${fmtSvgNum(yGain, 3)} V div⁻¹`;
  const tbStr = mode === "timebase-off" ? "OFF" : `${fmtSvgNum(tbMs, 3)} ms div⁻¹`;
  publicLabels.push(ygStr, tbStr);

  lines.push(`<rect x="${px + 16}" y="98" width="152" height="58" rx="6" fill="#ffffff" stroke="${PALETTE.blue}" stroke-width="1.4"/>`);
  lines.push(svgText(px + 92, 118, "Y-gain", { size: 10, weight: 700, fill: PALETTE.muted, anchor: "middle" }));
  lines.push(svgText(px + 92, 142, ygStr, { size: 13, weight: 700, fill: PALETTE.blue, anchor: "middle" }));

  lines.push(`<rect x="${px + 16}" y="172" width="152" height="58" rx="6" fill="#ffffff" stroke="${PALETTE.teal}" stroke-width="1.4"/>`);
  lines.push(svgText(px + 92, 192, "Time-base", { size: 10, weight: 700, fill: PALETTE.muted, anchor: "middle" }));
  lines.push(svgText(px + 92, 216, tbStr, { size: 13, weight: 700, fill: PALETTE.teal, anchor: "middle" }));

  lines.push(svgText(px + 92, 260, "Centre line = 0 V", { size: 10, fill: PALETTE.muted, anchor: "middle" }));
  lines.push(svgText(px + 92, 280, "1 square = 1 div × 1 div", { size: 10, fill: PALETTE.muted, anchor: "middle" }));

  return {
    visualFamily: "em-induction",
    svgMarkup: svgWrap(
      "Cathode-ray oscilloscope 10 by 8 division graticule displaying an alternating waveform with Y-gain and time-base settings",
      "",
      lines.join("\n"),
    ),
    rendererVersion: ALEVEL_CORE_A2_RENDERER_VERSION,
    publicNumbers,
    publicLabels,
  };
}

/* ========================================================================== */
/*  11. al-a2-electron-diffraction-vs-rutherford (3.8, quantum-nuclear)       */
/* ========================================================================== */

const elecDiffFields: readonly DomainKindFieldSpec[] = [
  { name: "kind", type: "string", enumValues: ["al-a2-electron-diffraction-vs-rutherford"] },
  { name: "electronEnergyMeV", type: "number", unit: "MeV", bounds: "120 <= E <= 650" },
  { name: "massNumberA", type: "number", bounds: "12 <= A <= 238 (integer)" },
  { name: "r0Fm", type: "number", unit: "fm", bounds: "1.0 <= r0 <= 1.3" },
  { name: "alphaEnergyMeV", type: "number", unit: "MeV", bounds: "3.0 <= Ea <= 12.0" },
  { name: "targetAtomicNumberZ", type: "number", bounds: "6 <= Z <= 92 (integer)" },
];

function validateElecDiff(spec: Record<string, unknown>): DomainValidationResult {
  const issues: string[] = [];
  if (spec.kind !== "al-a2-electron-diffraction-vs-rutherford") {
    issues.push('kind must be "al-a2-electron-diffraction-vs-rutherford"');
  }
  if (!isPosNum(spec.electronEnergyMeV) || spec.electronEnergyMeV < 120 || spec.electronEnergyMeV > 650) {
    issues.push("electronEnergyMeV must be in [120, 650] MeV");
  }
  if (!isPosNum(spec.massNumberA) || !Number.isInteger(spec.massNumberA) || spec.massNumberA < 12 || spec.massNumberA > 238) {
    issues.push("massNumberA must be an integer in [12, 238]");
  }
  if (!isPosNum(spec.r0Fm) || spec.r0Fm < 1.0 || spec.r0Fm > 1.3) {
    issues.push("r0Fm must be in [1.0, 1.3] fm");
  }
  if (!isPosNum(spec.alphaEnergyMeV) || spec.alphaEnergyMeV < 3.0 || spec.alphaEnergyMeV > 12.0) {
    issues.push("alphaEnergyMeV must be in [3.0, 12.0] MeV");
  }
  if (!isPosNum(spec.targetAtomicNumberZ) || !Number.isInteger(spec.targetAtomicNumberZ) || spec.targetAtomicNumberZ < 6 || spec.targetAtomicNumberZ > 92) {
    issues.push("targetAtomicNumberZ must be an integer in [6, 92]");
  }
  if (issues.length === 0) {
    const eJ = (spec.electronEnergyMeV as number) * 1e6 * ALEVEL_ELEMENTARY_E;
    const lam = (ALEVEL_PLANCK_H * ALEVEL_SPEED_C) / eJ;
    const rad = (spec.r0Fm as number) * 1e-15 * Math.cbrt(spec.massNumberA as number);
    const sinT = (0.61 * lam) / rad;
    if (sinT <= 0.04 || sinT >= 0.92) {
      issues.push("sin(theta_min) = 0.61*lambda/R must lie strictly within (0.04, 0.92)");
    }
  }
  return { valid: issues.length === 0, issues };
}

function solveElecDiff(spec: Record<string, unknown>): DomainSolveOutput {
  const eMeV = spec.electronEnergyMeV as number;
  const massA = spec.massNumberA as number;
  const r0Fm = spec.r0Fm as number;
  const alphaMeV = spec.alphaEnergyMeV as number;
  const zTarget = spec.targetAtomicNumberZ as number;

  const electronEnergyJ = eMeV * 1e6 * ALEVEL_ELEMENTARY_E;
  const deBroglieWavelengthM = (ALEVEL_PLANCK_H * ALEVEL_SPEED_C) / electronEnergyJ;
  const r0M = r0Fm * 1e-15;
  const nuclearRadiusM = r0M * Math.cbrt(massA);
  const sinThetaMin = (0.61 * deBroglieWavelengthM) / nuclearRadiusM;
  const thetaMinDeg = Math.asin(sinThetaMin) * (180 / Math.PI);
  const alphaClosestApproachM =
    (2 * zTarget * ALEVEL_ELEMENTARY_E * ALEVEL_ELEMENTARY_E) /
    (4 * Math.PI * ALEVEL_EPSILON_0 * alphaMeV * 1e6 * ALEVEL_ELEMENTARY_E);
  const nuclearDensityKgPerM3 =
    (3 * ALEVEL_ATOMIC_MASS_U) / (4 * Math.PI * r0M ** 3);

  const quantities: VerifiedQuantityMap = {
    electronEnergyJ,
    deBroglieWavelengthM,
    deBroglieWavelengthFm: deBroglieWavelengthM * 1e15,
    nuclearRadiusM,
    nuclearRadiusFm: nuclearRadiusM * 1e15,
    sinThetaMin,
    thetaMinDeg,
    alphaClosestApproachM,
    alphaClosestApproachFm: alphaClosestApproachM * 1e15,
    nuclearDensityKgPerM3,
    nuclearRadiusAnchor:
      "high-energy electrons are leptons unaffected by the strong nuclear force and diffract to a non-zero first minimum giving radius directly, whereas alpha closest approach only gives an energy-dependent upper bound",
    constantDensityAnchor:
      "nuclear volume is proportional to nucleon number so nuclear density is constant and independent of mass number",
  };

  return {
    solverId: "sixthphysics/alevel-core-a2/electron-diffraction/1.0.0",
    quantities,
    publicNumbers: [eMeV, massA, r0Fm, alphaMeV, zTarget],
  };
}

function renderElecDiffSvg(
  spec: Record<string, unknown>,
  options?: DomainRenderOptions,
): DomainRenderOutput {
  const hidden = makeHiddenSet(options);
  const solved = solveElecDiff(spec).quantities;
  const thetaMin = solved.thetaMinDeg as number;
  const hideTheta =
    hidden.has("thetaMinDeg") ||
    hidden.has("sinThetaMin") ||
    hidden.has("nuclearRadiusM") ||
    hidden.has("nuclearRadiusFm") ||
    hidden.has("deBroglieWavelengthM") ||
    hidden.has("deBroglieWavelengthFm");

  const publicNumbers: number[] = [0];
  const publicLabels: string[] = ["0"];

  const defs = arrowMarkerDef("ed-red", PALETTE.red);
  const lines: string[] = [];

  // Left main graph: Electron diffraction Intensity vs Scattering angle (NON-ZERO first minimum!)
  const gx0 = 58;
  const gx1 = 408;
  const gyTop = 48;
  const gyBot = 298;
  const tMax = Math.max(60, Math.ceil((thetaMin * 2.15) / 10) * 10);

  const mapX = (deg: number) => gx0 + (deg / tMax) * (gx1 - gx0);
  const mapY = (normI: number) => gyBot - normI * (gyBot - gyTop - 16);

  lines.push(svgText((gx0 + gx1) / 2, 26, "High-Energy Electron Diffraction Profile", { size: 12, weight: 700, anchor: "middle" }));
  lines.push(`<rect x="${gx0}" y="${gyTop}" width="${gx1 - gx0}" height="${gyBot - gyTop}" fill="${PALETTE.panelBg}" stroke="${PALETTE.grid}" stroke-width="1"/>`);
  lines.push(`<line x1="${gx0}" y1="${gyBot}" x2="${gx1 + 8}" y2="${gyBot}" stroke="${PALETTE.ink}" stroke-width="1.8"/>`);
  lines.push(`<line x1="${gx0}" y1="${gyBot}" x2="${gx0}" y2="${gyTop - 8}" stroke="${PALETTE.ink}" stroke-width="1.8"/>`);

  // Realistic nuclear electron-diffraction profile: sharp central max + NON-ZERO first minimum + secondary peak
  const pts: Array<[number, number]> = [];
  const steps = 140;
  for (let i = 0; i <= steps; i += 1) {
    const deg = (tMax * i) / steps;
    const u = deg / thetaMin;
    const baseExp = Math.exp(-1.18 * u);
    const osc = Math.cos((Math.PI * u) / 2) ** 2;
    const normI = Math.min(0.96, 0.86 * baseExp * (0.14 + 0.86 * osc) + 0.05 * Math.exp(-0.55 * u));
    pts.push([mapX(deg), mapY(normI)]);
  }
  lines.push(`<path d="${polylinePath(pts)}" fill="none" stroke="${PALETTE.blue}" stroke-width="2.6"/>`);

  // Mark non-zero first minimum clearly above the horizontal axis!
  const xMin = mapX(thetaMin);
  const yMin = mapY(0.86 * Math.exp(-1.18) * 0.14 + 0.05 * Math.exp(-0.55));
  lines.push(`<line x1="${fc(xMin)}" y1="${fc(yMin)}" x2="${fc(xMin)}" y2="${gyBot}" stroke="${PALETTE.red}" stroke-width="1.4" stroke-dasharray="4,4"/>`);
  lines.push(`<circle cx="${fc(xMin)}" cy="${fc(yMin)}" r="3.8" fill="${PALETTE.red}"/>`);
  lines.push(svgText(xMin + 8, yMin - 10, "Non-zero first minimum", { size: 10, weight: 700, fill: PALETTE.red }));

  const thetaLbl = hideTheta ? "θₘᵢₙ" : `θₘᵢₙ = ${fmtSvgNum(thetaMin, 3)}°`;
  if (!hideTheta) publicNumbers.push(thetaMin);
  publicLabels.push(thetaLbl);
  lines.push(svgText(xMin, gyBot + 17, thetaLbl, { size: 10, weight: 700, fill: PALETTE.red, anchor: "middle" }));
  lines.push(svgText(gx0, gyBot + 17, "0", { size: 10, fill: PALETTE.muted, anchor: "middle" }));

  lines.push(svgText((gx0 + gx1) / 2, 342, "Scattering angle θ / °", { size: 11, weight: 600, anchor: "middle" }));
  lines.push(
    svgText(24, (gyTop + gyBot) / 2, "Diffracted electron intensity", {
      size: 11,
      weight: 600,
      anchor: "middle",
      rotate: `rotate(-90 24 ${fc((gyTop + gyBot) / 2)})`,
    }),
  );

  // Right inset: Rutherford α closest approach schematic
  const rx = 434;
  lines.push(`<rect x="${rx}" y="48" width="188" height="250" rx="8" fill="${PALETTE.panelBg}" stroke="${PALETTE.grid}" stroke-width="1.4"/>`);
  lines.push(svgText(rx + 94, 72, "Rutherford α Scattering", { size: 11, weight: 700, anchor: "middle" }));
  lines.push(svgText(rx + 94, 88, "(Upper-Bound Estimate)", { size: 10, fill: PALETTE.muted, anchor: "middle" }));

  // Alpha approaching nucleus head-on
  lines.push(`<circle cx="${rx + 36}" cy="162" r="9" fill="${PALETTE.redSoft}" stroke="${PALETTE.red}" stroke-width="1.8"/>`);
  lines.push(svgText(rx + 36, 166, "α", { size: 11, weight: 700, fill: PALETTE.red, anchor: "middle" }));
  lines.push(`<line x1="${rx + 48}" y1="162" x2="${rx + 104}" y2="162" stroke="${PALETTE.red}" stroke-width="2" marker-end="url(#ed-red)"/>`);
  lines.push(`<line x1="${rx + 112}" y1="146" x2="${rx + 112}" y2="178" stroke="${PALETTE.ink}" stroke-width="1.4" stroke-dasharray="3,3"/>`);

  // Target nucleus
  lines.push(`<circle cx="${rx + 156}" cy="162" r="18" fill="${PALETTE.amberSoft}" stroke="${PALETTE.amber}" stroke-width="2"/>`);
  lines.push(svgText(rx + 156, 166, "+Ze", { size: 10, weight: 700, fill: PALETTE.amber, anchor: "middle" }));

  // r_min bracket
  lines.push(`<line x1="${rx + 112}" y1="192" x2="${rx + 156}" y2="192" stroke="${PALETTE.ink}" stroke-width="1.4"/>`);
  lines.push(svgText(rx + 134, 208, "rₘᵢₙ > R", { size: 10, weight: 700, anchor: "middle" }));
  lines.push(svgText(rx + 94, 240, "Eₖ → Q₁Q₂ / (4πε₀rₘᵢₙ)", { size: 10, fill: PALETTE.ink, anchor: "middle" }));
  lines.push(svgText(rx + 94, 260, "Strong force acts if", { size: 9, fill: PALETTE.muted, anchor: "middle" }));
  lines.push(svgText(rx + 94, 274, "α reaches nuclear edge", { size: 9, fill: PALETTE.muted, anchor: "middle" }));

  return {
    visualFamily: "quantum-nuclear",
    svgMarkup: svgWrap(
      "High-energy electron diffraction intensity versus scattering angle with non-zero first minimum alongside Rutherford alpha closest-approach inset",
      defs,
      lines.join("\n"),
    ),
    rendererVersion: ALEVEL_CORE_A2_RENDERER_VERSION,
    publicNumbers,
    publicLabels,
  };
}

/* ========================================================================== */
/*  12. al-a2-nz-nuclear-stability-curve (3.8, quantum-nuclear)               */
/* ========================================================================== */

const DECAY_CHANNELS = ["alpha", "beta-minus", "beta-plus", "fission-fragment"] as const;
type DecayChannel = (typeof DECAY_CHANNELS)[number];

const nzStabilityFields: readonly DomainKindFieldSpec[] = [
  { name: "kind", type: "string", enumValues: ["al-a2-nz-nuclear-stability-curve"] },
  { name: "parentZ", type: "number", bounds: "6 <= Z <= 96 (integer)" },
  { name: "parentN", type: "number", bounds: "4 <= N <= 152 (integer)" },
  { name: "decayChannel", type: "string", enumValues: DECAY_CHANNELS },
];

function validateNzStability(spec: Record<string, unknown>): DomainValidationResult {
  const issues: string[] = [];
  if (spec.kind !== "al-a2-nz-nuclear-stability-curve") {
    issues.push('kind must be "al-a2-nz-nuclear-stability-curve"');
  }
  if (!isPosNum(spec.parentZ) || !Number.isInteger(spec.parentZ) || spec.parentZ < 6 || spec.parentZ > 96) {
    issues.push("parentZ must be an integer in [6, 96]");
  }
  if (!isPosNum(spec.parentN) || !Number.isInteger(spec.parentN) || spec.parentN < 4 || spec.parentN > 152) {
    issues.push("parentN must be an integer in [4, 152]");
  }
  if (!DECAY_CHANNELS.includes(spec.decayChannel as DecayChannel)) {
    issues.push(`decayChannel must be one of ${DECAY_CHANNELS.join(", ")}`);
  }
  return { valid: issues.length === 0, issues };
}

function solveNzStability(spec: Record<string, unknown>): DomainSolveOutput {
  const z = spec.parentZ as number;
  const n = spec.parentN as number;
  const ch = spec.decayChannel as DecayChannel;

  const daughterZ = ch === "alpha" ? z - 2 : ch === "beta-plus" ? z - 1 : z + 1;
  const daughterN = ch === "alpha" ? n - 2 : ch === "beta-plus" ? n + 1 : n - 1;

  const decayModeText =
    ch === "alpha"
      ? "alpha emission reducing both proton number and neutron number by two"
      : ch === "beta-plus"
        ? "beta-plus emission or electron capture converting a proton into a neutron to increase the N/Z ratio"
        : ch === "fission-fragment"
          ? "neutron-rich fission fragments have a high N/Z ratio and undergo beta-minus decay"
          : "beta-minus emission converting a neutron into a proton to lower the high N/Z ratio";

  const quantities: VerifiedQuantityMap = {
    parentA: z + n,
    parentNtoZRatio: n / z,
    daughterZ,
    daughterN,
    daughterA: daughterZ + daughterN,
    daughterNtoZRatio: daughterN / daughterZ,
    decayModeText,
    stabilityAnchor:
      "above proton number twenty, long-range electrostatic repulsion between all protons grows faster than short-range strong nuclear attraction requiring a higher N/Z ratio",
    strongForceAnchor:
      "strong nuclear force is attractive up to about three femtometres and becomes strongly repulsive below half a femtometre",
  };

  return {
    solverId: "sixthphysics/alevel-core-a2/nz-stability/1.0.0",
    quantities,
    publicNumbers: [z, n],
  };
}

function renderNzStabilitySvg(
  spec: Record<string, unknown>,
  options?: DomainRenderOptions,
): DomainRenderOutput {
  const hidden = makeHiddenSet(options);
  const z = spec.parentZ as number;
  const n = spec.parentN as number;
  const hidePoint = hidden.has("parentZ") || hidden.has("parentN") || hidden.has("daughterZ");

  const publicNumbers: number[] = [];
  const publicLabels: string[] = [];

  const defs =
    arrowMarkerDef("nz-red", PALETTE.red) +
    arrowMarkerDef("nz-blue", PALETTE.blue) +
    arrowMarkerDef("nz-amber", PALETTE.amber);
  const lines: string[] = [];

  const gx0 = 66;
  const gx1 = 446;
  const gyTop = 42;
  const gyBot = 304;
  const zMax = 100;
  const nMax = 150;

  const mapX = (zv: number) => gx0 + (zv / zMax) * (gx1 - gx0);
  const mapY = (nv: number) => gyBot - (nv / nMax) * (gyBot - gyTop);

  lines.push(svgText((gx0 + gx1) / 2, 24, "Nuclear Stability Chart (N vs Z)", { size: 13, weight: 700, anchor: "middle" }));
  lines.push(`<rect x="${gx0}" y="${gyTop}" width="${gx1 - gx0}" height="${gyBot - gyTop}" fill="${PALETTE.panelBg}" stroke="${PALETTE.grid}" stroke-width="1"/>`);

  // Grid ticks
  for (const zt of buildLinearTicks(0, 100, 5)) {
    const x = mapX(zt);
    lines.push(`<line x1="${fc(x)}" y1="${gyTop}" x2="${fc(x)}" y2="${gyBot}" stroke="${PALETTE.grid}" stroke-width="1"/>`);
    const lbl = String(zt);
    publicNumbers.push(zt);
    publicLabels.push(lbl);
    lines.push(svgText(x, gyBot + 16, lbl, { size: 10, fill: PALETTE.muted, anchor: "middle" }));
  }
  for (const nt of buildLinearTicks(0, 150, 5)) {
    const y = mapY(nt);
    lines.push(`<line x1="${gx0}" y1="${fc(y)}" x2="${gx1}" y2="${fc(y)}" stroke="${PALETTE.grid}" stroke-width="1"/>`);
    const lbl = String(nt);
    publicNumbers.push(nt);
    publicLabels.push(lbl);
    lines.push(svgText(gx0 - 8, y + 4, lbl, { size: 10, fill: PALETTE.muted, anchor: "end" }));
  }

  // N = Z dashed reference line
  lines.push(`<line x1="${fc(mapX(0))}" y1="${fc(mapY(0))}" x2="${fc(mapX(100))}" y2="${fc(mapY(100))}" stroke="${PALETTE.muted}" stroke-width="1.5" stroke-dasharray="6,4"/>`);
  lines.push(svgText(mapX(82), mapY(77), "N = Z", { size: 10, weight: 700, fill: PALETTE.muted }));

  // Shaded stability belt polygon from (0,0) -> (20,20) -> (50,68) -> (82,126)
  const upperBelt: Array<[number, number]> = [
    [0, 2],
    [20, 23],
    [40, 53],
    [60, 88],
    [82, 132],
  ];
  const lowerBelt: Array<[number, number]> = [
    [82, 120],
    [60, 79],
    [40, 45],
    [20, 18],
    [0, 0],
  ];
  const beltPts = [...upperBelt, ...lowerBelt].map(([zv, nv]) => `${fc(mapX(zv))},${fc(mapY(nv))}`).join(" ");
  lines.push(`<polygon points="${beltPts}" fill="${PALETTE.teal}" fill-opacity="0.78"/>`);

  // Colour-coded decay region labels
  lines.push(svgText(mapX(36), mapY(96), "Neutron-rich", { size: 10, weight: 700, fill: PALETTE.blue, anchor: "middle" }));
  lines.push(svgText(mapX(36), mapY(85), "(β⁻ emitters)", { size: 10, weight: 600, fill: PALETTE.blue, anchor: "middle" }));

  lines.push(svgText(mapX(68), mapY(46), "Proton-rich", { size: 10, weight: 700, fill: PALETTE.red, anchor: "middle" }));
  lines.push(svgText(mapX(68), mapY(35), "(β⁺ / EC)", { size: 10, weight: 600, fill: PALETTE.red, anchor: "middle" }));

  lines.push(svgText(mapX(91), mapY(140), "α (Z > 82)", { size: 10, weight: 700, fill: PALETTE.amber, anchor: "middle" }));

  // Highlighted parent nuclide dot
  if (!hidePoint) {
    lines.push(`<circle cx="${fc(mapX(z))}" cy="${fc(mapY(n))}" r="4.8" fill="#ffffff" stroke="${PALETTE.ink}" stroke-width="2.2"/>`);
    lines.push(svgText(mapX(z) + 8, mapY(n) - 6, "X", { size: 11, weight: 700, fill: PALETTE.ink }));
  }

  // Axes
  lines.push(`<line x1="${gx0}" y1="${gyBot}" x2="${gx1 + 8}" y2="${gyBot}" stroke="${PALETTE.ink}" stroke-width="1.8"/>`);
  lines.push(`<line x1="${gx0}" y1="${gyBot}" x2="${gx0}" y2="${gyTop - 8}" stroke="${PALETTE.ink}" stroke-width="1.8"/>`);
  lines.push(svgText((gx0 + gx1) / 2, 342, "Proton number Z", { size: 11, weight: 600, anchor: "middle" }));
  lines.push(
    svgText(20, (gyTop + gyBot) / 2, "Neutron number N", {
      size: 11,
      weight: 600,
      anchor: "middle",
      rotate: `rotate(-90 20 ${fc((gyTop + gyBot) / 2)})`,
    }),
  );

  // Right-hand decay vector key panel
  const kx = 468;
  lines.push(`<rect x="${kx}" y="52" width="154" height="244" rx="8" fill="${PALETTE.panelBg}" stroke="${PALETTE.grid}" stroke-width="1.4"/>`);
  lines.push(svgText(kx + 77, 74, "Decay Vectors", { size: 11, weight: 700, anchor: "middle" }));

  // Alpha vector (-2, -2)
  lines.push(`<line x1="${kx + 46}" y1="104" x2="${kx + 22}" y2="128" stroke="${PALETTE.amber}" stroke-width="2.4" marker-end="url(#nz-amber)"/>`);
  lines.push(svgText(kx + 58, 114, "α decay", { size: 10, weight: 700, fill: PALETTE.amber }));
  lines.push(svgText(kx + 58, 128, "ΔZ = −2, ΔN = −2", { size: 9, fill: PALETTE.muted }));

  // Beta-minus vector (+1, -1)
  lines.push(`<line x1="${kx + 22}" y1="164" x2="${kx + 46}" y2="188" stroke="${PALETTE.blue}" stroke-width="2.4" marker-end="url(#nz-blue)"/>`);
  lines.push(svgText(kx + 58, 174, "β⁻ decay", { size: 10, weight: 700, fill: PALETTE.blue }));
  lines.push(svgText(kx + 58, 188, "ΔZ = +1, ΔN = −1", { size: 9, fill: PALETTE.muted }));

  // Beta-plus / EC vector (-1, +1)
  lines.push(`<line x1="${kx + 46}" y1="248" x2="${kx + 22}" y2="224" stroke="${PALETTE.red}" stroke-width="2.4" marker-end="url(#nz-red)"/>`);
  lines.push(svgText(kx + 58, 234, "β⁺ / EC", { size: 10, weight: 700, fill: PALETTE.red }));
  lines.push(svgText(kx + 58, 248, "ΔZ = −1, ΔN = +1", { size: 9, fill: PALETTE.muted }));

  lines.push(`<rect x="${kx + 16}" y="268" width="16" height="10" rx="2" fill="${PALETTE.teal}"/>`);
  lines.push(svgText(kx + 40, 277, "Stable nuclei belt", { size: 10, weight: 600 }));

  publicNumbers.push(-2, 1, -1, 2, 82);
  publicLabels.push("ΔZ = −2, ΔN = −2", "ΔZ = +1, ΔN = −1", "ΔZ = −1, ΔN = +1", "α (Z > 82)");

  return {
    visualFamily: "quantum-nuclear",
    svgMarkup: svgWrap(
      "Nuclear stability N versus Z curve with shaded stable belt, N equals Z reference line, and alpha, beta-minus, and beta-plus decay vectors",
      defs,
      lines.join("\n"),
    ),
    rendererVersion: ALEVEL_CORE_A2_RENDERER_VERSION,
    publicNumbers,
    publicLabels,
  };
}

/* ========================================================================== */
/*  13. al-a2-thermal-nuclear-reactor-lor (3.8, quantum-nuclear)              */
/* ========================================================================== */

const MODERATOR_MATERIALS = ["graphite", "pressurised-water", "heavy-water"] as const;
type ModeratorMaterial = (typeof MODERATOR_MATERIALS)[number];

const REACTOR_FOCUS_AREAS = [
  "moderator",
  "control-rods",
  "shielding",
  "waste-management",
  "full-safety",
] as const;
type ReactorFocusArea = (typeof REACTOR_FOCUS_AREAS)[number];

const reactorFields: readonly DomainKindFieldSpec[] = [
  { name: "kind", type: "string", enumValues: ["al-a2-thermal-nuclear-reactor-lor"] },
  { name: "thermalPowerMW", type: "number", unit: "MW", bounds: "200 <= Pth <= 4000" },
  { name: "efficiencyPct", type: "number", unit: "%", bounds: "25 <= eta <= 45" },
  { name: "energyPerFissionMeV", type: "number", unit: "MeV", bounds: "180 <= Ef <= 220" },
  { name: "moderatorMaterial", type: "string", enumValues: MODERATOR_MATERIALS },
  { name: "moderatorNucleonA", type: "number", bounds: "1 <= A <= 16 (integer)" },
  { name: "focusArea", type: "string", enumValues: REACTOR_FOCUS_AREAS },
];

function validateReactor(spec: Record<string, unknown>): DomainValidationResult {
  const issues: string[] = [];
  if (spec.kind !== "al-a2-thermal-nuclear-reactor-lor") {
    issues.push('kind must be "al-a2-thermal-nuclear-reactor-lor"');
  }
  if (!isPosNum(spec.thermalPowerMW) || spec.thermalPowerMW < 200 || spec.thermalPowerMW > 4000) {
    issues.push("thermalPowerMW must be in [200, 4000] MW");
  }
  if (!isPosNum(spec.efficiencyPct) || spec.efficiencyPct < 25 || spec.efficiencyPct > 45) {
    issues.push("efficiencyPct must be in [25, 45]%");
  }
  if (!isPosNum(spec.energyPerFissionMeV) || spec.energyPerFissionMeV < 180 || spec.energyPerFissionMeV > 220) {
    issues.push("energyPerFissionMeV must be in [180, 220] MeV");
  }
  if (!MODERATOR_MATERIALS.includes(spec.moderatorMaterial as ModeratorMaterial)) {
    issues.push(`moderatorMaterial must be one of ${MODERATOR_MATERIALS.join(", ")}`);
  }
  if (
    !isPosNum(spec.moderatorNucleonA) ||
    !Number.isInteger(spec.moderatorNucleonA) ||
    spec.moderatorNucleonA < 1 ||
    spec.moderatorNucleonA > 16
  ) {
    issues.push("moderatorNucleonA must be an integer in [1, 16]");
  }
  if (!REACTOR_FOCUS_AREAS.includes(spec.focusArea as ReactorFocusArea)) {
    issues.push(`focusArea must be one of ${REACTOR_FOCUS_AREAS.join(", ")}`);
  }
  return { valid: issues.length === 0, issues };
}

function solveReactor(spec: Record<string, unknown>): DomainSolveOutput {
  const pThMW = spec.thermalPowerMW as number;
  const eff = (spec.efficiencyPct as number) / 100;
  const eFissMeV = spec.energyPerFissionMeV as number;
  const modA = spec.moderatorNucleonA as number;

  const electricalPowerMW = pThMW * eff;
  const energyPerFissionJ = eFissMeV * 1e6 * ALEVEL_ELEMENTARY_E;
  const fissionsPerSecond = (pThMW * 1e6) / energyPerFissionJ;
  const maxHeadOnKeFractionTransferred = (4 * modA) / ((1 + modA) * (1 + modA));

  const quantities: VerifiedQuantityMap = {
    electricalPowerMW,
    energyPerFissionJ,
    fissionsPerSecond,
    maxHeadOnKeFractionTransferred,
    moderatorAnchor:
      "moderator slows fast neutrons to thermal speeds via elastic collisions with low-mass nuclei so uranium-235 fission probability increases",
    controlRodsAnchor:
      "boron or cadmium control rods absorb neutrons to maintain a steady critical chain reaction",
    wasteLifecycleAnchor:
      "high-level radioactive fission fragments are handled remotely in cooling ponds, vitrified in glass inside steel canisters, and stored in deep geologically stable underground repositories",
    reactorSafetyAnchor:
      "moderator slows neutrons by elastic collisions, control rods absorb neutrons for criticality, coolant transfers thermal energy, thick concrete shields radiation, and high-level waste moves from cooling ponds to vitrification and deep geological storage",
  };

  return {
    solverId: "sixthphysics/alevel-core-a2/thermal-reactor/1.0.0",
    quantities,
    publicNumbers: [pThMW, spec.efficiencyPct as number, eFissMeV, modA],
  };
}

function renderReactorSvg(
  spec: Record<string, unknown>,
  options?: DomainRenderOptions,
): DomainRenderOutput {
  const hidden = makeHiddenSet(options);
  const hideWasteHints =
    hidden.has("wasteLifecycleAnchor") || hidden.has("reactorSafetyAnchor");
  const modMat = spec.moderatorMaterial as ModeratorMaterial;
  const modLabel =
    modMat === "graphite"
      ? "Graphite moderator"
      : modMat === "heavy-water"
        ? "Heavy-water moderator"
        : "Water moderator";

  const defs =
    arrowMarkerDef("rx-red", PALETTE.red) + arrowMarkerDef("rx-blue", PALETTE.blue);
  const lines: string[] = [];

  lines.push(svgText(320, 24, "Thermal Nuclear Fission Reactor Schematic", { size: 13, weight: 700, anchor: "middle" }));

  // Thick concrete biological shield
  lines.push(`<rect x="52" y="54" width="322" height="266" rx="14" fill="#cbd5e1" stroke="${PALETTE.ink}" stroke-width="2.2"/>`);
  lines.push(svgText(213, 309, "Thick concrete biological shield", { size: 10, weight: 700, anchor: "middle" }));

  // Steel pressure vessel inside concrete
  lines.push(`<rect x="86" y="76" width="254" height="214" rx="10" fill="#e2e8f0" stroke="${PALETTE.ink}" stroke-width="2.4"/>`);
  lines.push(svgText(213, 281, "Steel pressure vessel", { size: 10, weight: 600, fill: PALETTE.muted, anchor: "middle" }));

  // Moderator core block
  lines.push(`<rect x="108" y="108" width="210" height="154" rx="6" fill="${PALETTE.tealSoft}" stroke="${PALETTE.teal}" stroke-width="1.6"/>`);
  lines.push(svgText(213, 254, modLabel, { size: 10, weight: 700, fill: PALETTE.teal, anchor: "middle" }));

  // Fuel rods (red vertical bars)
  for (const fx of [136, 186, 236, 286]) {
    lines.push(`<rect x="${fx - 7}" y="128" width="14" height="106" rx="3" fill="${PALETTE.red}" stroke="${PALETTE.ink}" stroke-width="1"/>`);
  }
  lines.push(svgText(136, 122, "Fuel", { size: 9, weight: 700, fill: PALETTE.red, anchor: "middle" }));

  // Retractable boron control rods (slate bars entering from top)
  for (const cx of [161, 211, 261]) {
    lines.push(`<rect x="${cx - 5}" y="42" width="10" height="132" rx="2" fill="${PALETTE.ink}"/>`);
  }
  lines.push(`<rect x="148" y="38" width="126" height="10" rx="3" fill="${PALETTE.muted}"/>`);
  lines.push(svgText(211, 68, "Boron control rods (retractable)", { size: 9, weight: 700, fill: PALETTE.ink, anchor: "middle" }));

  // Primary coolant pipes to heat exchanger on right
  lines.push(`<polyline points="318,136 446,136 446,164" fill="none" stroke="${PALETTE.red}" stroke-width="4" marker-end="url(#rx-red)"/>`);
  lines.push(`<polyline points="446,216 446,244 326,244" fill="none" stroke="${PALETTE.blue}" stroke-width="4" marker-end="url(#rx-blue)"/>`);
  lines.push(svgText(400, 126, "Hot coolant", { size: 10, weight: 700, fill: PALETTE.red, anchor: "middle" }));
  lines.push(svgText(400, 262, "Cold return", { size: 10, weight: 700, fill: PALETTE.blue, anchor: "middle" }));

  // Heat exchanger / steam generator on right
  lines.push(`<rect x="434" y="138" width="174" height="106" rx="10" fill="${PALETTE.panelBg}" stroke="${PALETTE.ink}" stroke-width="2"/>`);
  lines.push(svgText(521, 162, "Heat Exchanger", { size: 11, weight: 700, anchor: "middle" }));
  lines.push(svgText(521, 178, "& Steam Generator", { size: 10, fill: PALETTE.muted, anchor: "middle" }));
  // Coil inside heat exchanger
  lines.push(`<path d="M454,192 C474,180 494,206 514,192 C534,180 554,206 588,192" fill="none" stroke="${PALETTE.red}" stroke-width="2.5"/>`);
  lines.push(svgText(521, 224, "Steam → Turbine → Grid", { size: 10, weight: 600, fill: PALETTE.teal, anchor: "middle" }));

  if (hideWasteHints) {
    lines.push(svgText(521, 296, "Spent fuel assembly →", { size: 10, fill: PALETTE.muted, anchor: "middle" }));
    lines.push(svgText(521, 314, "Shielded handling & storage", { size: 10, fill: PALETTE.muted, anchor: "middle" }));
  } else {
    lines.push(svgText(521, 290, "Remote fuel handling →", { size: 10, fill: PALETTE.muted, anchor: "middle" }));
    lines.push(svgText(521, 306, "Cooling pond → Vitrification", { size: 10, fill: PALETTE.muted, anchor: "middle" }));
    lines.push(svgText(521, 322, "→ Deep geological storage", { size: 10, fill: PALETTE.muted, anchor: "middle" }));
  }

  return {
    visualFamily: "quantum-nuclear",
    svgMarkup: svgWrap(
      "Cutaway thermal nuclear reactor showing fuel rods, retractable boron control rods, moderator, coolant loop, steel vessel, concrete shield, and heat exchanger",
      defs,
      lines.join("\n"),
    ),
    rendererVersion: ALEVEL_CORE_A2_RENDERER_VERSION,
    publicNumbers: [],
    publicLabels: [modLabel],
  };
}

/* ========================================================================== */
/*  Exported Plugin Registry Array (13 Plugins — Spec B)                      */
/* ========================================================================== */

export const ALEVEL_CORE_A2_PLUGINS: readonly DomainKindPlugin[] = [
  {
    domain: "optics-shm",
    kind: "al-a2-damping-resonance-curves",
    summary:
      "Forced-oscillation resonance amplitude-frequency curves and phase-lag curves across light, moderate, and heavy damping (AQA 3.6.1).",
    requiredFields: dampingResonanceFields,
    optionalFields: dampingResonanceOptionalFields,
    physicalConstraints: [
      "0.05 <= zetaLight < zetaModerate < zetaHeavy <= 0.85",
      "Peak resonant frequency shifts leftward of f0 as f_peak = f0*sqrt(1 - 2*zeta^2)",
      "Phase lag equals pi/2 rad at f = f0",
    ],
    probeSpecs: [
      {
        kind: "al-a2-damping-resonance-curves",
        naturalFreqHz: 5.0,
        staticAmplitudeMm: 8.0,
        zetaLight: 0.12,
        zetaModerate: 0.3,
        zetaHeavy: 0.62,
        probeDriveFreqHz: 5.0,
        showPhaseSubplot: true,
      },
      {
        kind: "al-a2-damping-resonance-curves",
        naturalFreqHz: 8.5,
        staticAmplitudeMm: 12.0,
        zetaLight: 0.1,
        zetaModerate: 0.28,
        zetaHeavy: 0.65,
        probeDriveFreqHz: 6.0,
        showPhaseSubplot: false,
      },
    ],
    validate: validateDampingResonance,
    solve: solveDampingResonance,
    renderSvg: renderDampingResonanceSvg,
  },
  {
    domain: "optics-shm",
    kind: "al-a2-damped-oscillation-decay",
    summary:
      "Free damped oscillations comparing light exponential decay, critical damping, and heavy overdamping (AQA 3.6.1).",
    requiredFields: dampedDecayFields,
    physicalConstraints: [
      "0.45 <= amplitudeRatioPerCycle <= 0.92",
      "Mechanical energy E is proportional to A^2 so fractional energy loss per cycle is 1 - r^2",
    ],
    probeSpecs: [
      {
        kind: "al-a2-damped-oscillation-decay",
        initialAmplitudeMm: 60,
        periodS: 1.2,
        amplitudeRatioPerCycle: 0.8,
        cyclesCount: 3,
        regime: "light",
      },
      {
        kind: "al-a2-damped-oscillation-decay",
        initialAmplitudeMm: 45,
        periodS: 0.8,
        amplitudeRatioPerCycle: 0.72,
        cyclesCount: 4,
        regime: "critical",
      },
    ],
    validate: validateDampedDecay,
    solve: solveDampedDecay,
    renderSvg: renderDampedDecaySvg,
  },
  {
    domain: "thermal",
    kind: "al-a2-continuous-flow-calorimetry",
    summary:
      "Continuous-flow electrical calorimetry eliminating steady thermal loss rate H via two flow rates at identical temperature rise Δθ (AQA 3.6.2).",
    requiredFields: continuousFlowFields,
    physicalConstraints: [
      "outletTempC > inletTempC",
      "flowRate2KgPerS > flowRate1KgPerS and P2 > P1",
      "P2 - P1 = (mDot2 - mDot1) * c * deltaTheta with H >= 0",
    ],
    probeSpecs: [
      {
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
      {
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
    ],
    validate: validateContinuousFlow,
    solve: solveContinuousFlow,
    renderSvg: renderContinuousFlowSvg,
  },
  {
    domain: "thermal",
    kind: "al-a2-kinetic-theory-assumptions-lor",
    summary:
      "Kinetic theory pressure derivation pV = (1/3)Nmc_rms^2 from elastic wall collisions, isotropic random motion, assumptions, and real-gas deviations (AQA 3.6.2).",
    requiredFields: kineticTheoryFields,
    optionalFields: kineticTheoryOptionalFields,
    physicalConstraints: [
      "Elastic wall rebound gives delta_p = -2mu and time between impacts on same wall t = 2L/u",
      "Isotropy gives <u^2> = <v^2> = <w^2> = (1/3)c_rms^2",
    ],
    probeSpecs: [
      {
        kind: "al-a2-kinetic-theory-assumptions-lor",
        cubeSideM: 0.25,
        molarMassKgPerMol: 0.028,
        temperatureK: 300,
        molesN: 1.5,
        singleMoleculeSpeedMs: 480,
        gasLabel: "Nitrogen",
      },
      {
        kind: "al-a2-kinetic-theory-assumptions-lor",
        cubeSideM: 0.4,
        molarMassKgPerMol: 0.004,
        temperatureK: 420,
        molesN: 2.0,
        singleMoleculeSpeedMs: 920,
        gasLabel: "Helium",
      },
    ],
    validate: validateKineticTheory,
    solve: solveKineticTheory,
    renderSvg: renderKineticTheorySvg,
  },
  {
    domain: "grav-astro",
    kind: "al-a2-satellite-orbits-comparison",
    summary:
      "Geostationary equatorial orbits versus polar low-Earth orbits, orbital radius, speed, period, and orbital transfer energy (AQA 3.7.2).",
    requiredFields: satelliteFields,
    physicalConstraints: [
      "Kepler third law: r_geo = (G M_E T^2 / (4 pi^2))^(1/3)",
      "Total circular orbital energy E = -G M m / (2r)",
    ],
    probeSpecs: [
      {
        kind: "al-a2-satellite-orbits-comparison",
        earthMassKg: 5.97e24,
        earthRadiusM: 6.37e6,
        geoPeriodS: 86400,
        leoAltitudeKm: 600,
        satelliteMassKg: 850,
      },
      {
        kind: "al-a2-satellite-orbits-comparison",
        earthMassKg: 5.97e24,
        earthRadiusM: 6.37e6,
        geoPeriodS: 86400,
        leoAltitudeKm: 920,
        satelliteMassKg: 1400,
      },
    ],
    validate: validateSatellite,
    solve: solveSatellite,
    renderSvg: renderSatelliteSvg,
  },
  {
    domain: "fields",
    kind: "al-a2-grav-vs-electric-fields",
    summary:
      "Side-by-side inverse-square gravitational vs electrostatic fields, radial field lines, equipotential surfaces, and force ratios (AQA 3.7.2–3.7.3).",
    requiredFields: gravVsElecFields,
    physicalConstraints: [
      "Both obey inverse-square force laws with zero potential at infinity",
      "Gravitational potential is strictly negative while electric potential matches source charge sign",
    ],
    probeSpecs: [
      {
        kind: "al-a2-grav-vs-electric-fields",
        centralMassKg: 1.673e-27,
        centralChargeC: 1.6e-19,
        testMassKg: 1.673e-27,
        testChargeC: 1.6e-19,
        separationM: 1.0e-10,
        chargePolarity: "positive",
      },
      {
        kind: "al-a2-grav-vs-electric-fields",
        centralMassKg: 5.97e24,
        centralChargeC: -4.0e-6,
        testMassKg: 2.0,
        testChargeC: 1.5e-6,
        separationM: 0.4,
        chargePolarity: "negative",
      },
    ],
    validate: validateGravVsElec,
    solve: solveGravVsElec,
    renderSvg: renderGravVsElecSvg,
  },
  {
    domain: "fields",
    kind: "al-a2-capacitor-polar-dielectric",
    summary:
      "Parallel-plate capacitor with polar dielectric alignment, opposing internal field, isolated vs connected energy changes, and 50% charging heat loss (AQA 3.7.4).",
    requiredFields: polarDielectricFields,
    physicalConstraints: [
      "C = eps_0 * eps_r * A / d",
      "Constant-V charging dissipates exactly 50% (0.5 Q V) as thermal energy in circuit resistance",
    ],
    probeSpecs: [
      {
        kind: "al-a2-capacitor-polar-dielectric",
        plateAreaCm2: 180,
        plateSeparationMm: 1.2,
        relativePermittivity: 4.5,
        initialVoltageV: 18,
        connectionMode: "isolated",
      },
      {
        kind: "al-a2-capacitor-polar-dielectric",
        plateAreaCm2: 240,
        plateSeparationMm: 0.8,
        relativePermittivity: 3.2,
        initialVoltageV: 12,
        connectionMode: "connected",
      },
    ],
    validate: validatePolarDielectric,
    solve: solvePolarDielectric,
    renderSvg: renderPolarDielectricSvg,
  },
  {
    domain: "em-induction",
    kind: "al-a2-lenz-law-energy-conservation",
    summary:
      "Bar magnet falling through a solenoid demonstrating Lenz's law, energy conservation, and equal-area asymmetric bipolar induced emf pulses (AQA 3.7.5).",
    requiredFields: lenzFields,
    physicalConstraints: [
      "exitDurationMs < entryDurationMs due to gravitational acceleration",
      "Equal flux linkage areas |integral emf dt| = N*Phi for entry and exit pulses",
    ],
    probeSpecs: [
      {
        kind: "al-a2-lenz-law-energy-conservation",
        coilTurnsN: 400,
        peakFluxWb: 3.2e-4,
        entryDurationMs: 80,
        exitDurationMs: 50,
        coilResistanceOhm: 12,
        leadingPole: "N",
      },
      {
        kind: "al-a2-lenz-law-energy-conservation",
        coilTurnsN: 650,
        peakFluxWb: 2.4e-4,
        entryDurationMs: 65,
        exitDurationMs: 42,
        coilResistanceOhm: 8,
        leadingPole: "S",
      },
    ],
    validate: validateLenz,
    solve: solveLenz,
    renderSvg: renderLenzSvg,
  },
  {
    domain: "em-induction",
    kind: "al-a2-transformer-losses-design",
    summary:
      "Transformer turns ratio, non-ideal efficiency, laminated core eddy-current/hysteresis/copper/flux-leakage losses, and high-voltage grid transmission (AQA 3.7.5).",
    requiredFields: transformerFields,
    physicalConstraints: [
      "Vs / Vp = Ns / Np; efficiency eta = (Is Vs) / (Ip Vp)",
      "Grid cable thermal power loss P_loss = (P / V)^2 * R_line",
    ],
    probeSpecs: [
      {
        kind: "al-a2-transformer-losses-design",
        primaryTurns: 500,
        secondaryTurns: 2500,
        primaryVoltageV: 230,
        secondaryCurrentA: 4.0,
        efficiencyPct: 92,
        lineResistanceOhm: 8.0,
        gridPowerW: 4.6e6,
      },
      {
        kind: "al-a2-transformer-losses-design",
        primaryTurns: 1200,
        secondaryTurns: 14400,
        primaryVoltageV: 11000,
        secondaryCurrentA: 25,
        efficiencyPct: 96,
        lineResistanceOhm: 12.0,
        gridPowerW: 2.64e7,
      },
    ],
    validate: validateTransformer,
    solve: solveTransformer,
    renderSvg: renderTransformerSvg,
  },
  {
    domain: "em-induction",
    kind: "al-a2-oscilloscope-ac-rms",
    summary:
      "Cathode-ray oscilloscope AC waveform measurement, peak-to-peak to RMS conversion V_rms = V0/sqrt(2), mean power, and time-base OFF behaviour (AQA 3.7.5).",
    requiredFields: croAcFields,
    physicalConstraints: [
      "V_peak = 0.5 * V_pp; V_rms = V_peak / sqrt(2)",
      "Mean resistive power P_mean = V_rms^2 / R = 0.5 * P_peak",
    ],
    probeSpecs: [
      {
        kind: "al-a2-oscilloscope-ac-rms",
        yGainVPerDiv: 2.0,
        timeBaseMsPerDiv: 5.0,
        peakToPeakDivs: 6.0,
        periodDivs: 4.0,
        loadResistanceOhm: 25,
        displayMode: "ac-sinusoid",
      },
      {
        kind: "al-a2-oscilloscope-ac-rms",
        yGainVPerDiv: 5.0,
        timeBaseMsPerDiv: 2.0,
        peakToPeakDivs: 4.0,
        periodDivs: 5.0,
        loadResistanceOhm: 40,
        displayMode: "timebase-off",
      },
    ],
    validate: validateCroAc,
    solve: solveCroAc,
    renderSvg: renderCroAcSvg,
  },
  {
    domain: "quantum-nuclear",
    kind: "al-a2-electron-diffraction-vs-rutherford",
    summary:
      "High-energy electron diffraction sin(theta) ≈ 0.61*lambda/R with non-zero first minimum compared against Rutherford alpha closest approach and constant nuclear density (AQA 3.8).",
    requiredFields: elecDiffFields,
    physicalConstraints: [
      "Relativistic electron wavelength lambda ≈ hc / E",
      "0.04 < sin(theta_min) = 0.61*lambda/R < 0.92; R = R0 * A^(1/3)",
    ],
    probeSpecs: [
      {
        kind: "al-a2-electron-diffraction-vs-rutherford",
        electronEnergyMeV: 420,
        massNumberA: 16,
        r0Fm: 1.05,
        alphaEnergyMeV: 6.0,
        targetAtomicNumberZ: 79,
      },
      {
        kind: "al-a2-electron-diffraction-vs-rutherford",
        electronEnergyMeV: 250,
        massNumberA: 56,
        r0Fm: 1.15,
        alphaEnergyMeV: 5.4,
        targetAtomicNumberZ: 79,
      },
    ],
    validate: validateElecDiff,
    solve: solveElecDiff,
    renderSvg: renderElecDiffSvg,
  },
  {
    domain: "quantum-nuclear",
    kind: "al-a2-nz-nuclear-stability-curve",
    summary:
      "N-Z nuclear stability belt, strong nuclear vs electrostatic force balance, and alpha, beta-minus, beta-plus/EC, and fission-fragment decay regions (AQA 3.8).",
    requiredFields: nzStabilityFields,
    physicalConstraints: [
      "Stable belt follows N = Z up to Z ≈ 20 then curves upward to N/Z ≈ 1.5 near Z = 82",
      "Nucleon conservation holds across alpha, beta-minus, and beta-plus/EC channels",
    ],
    probeSpecs: [
      {
        kind: "al-a2-nz-nuclear-stability-curve",
        parentZ: 56,
        parentN: 88,
        decayChannel: "fission-fragment",
      },
      {
        kind: "al-a2-nz-nuclear-stability-curve",
        parentZ: 92,
        parentN: 146,
        decayChannel: "alpha",
      },
    ],
    validate: validateNzStability,
    solve: solveNzStability,
    renderSvg: renderNzStabilitySvg,
  },
  {
    domain: "quantum-nuclear",
    kind: "al-a2-thermal-nuclear-reactor-lor",
    summary:
      "Thermal nuclear fission reactor components (moderator elastic collisions, boron control rods, coolant, shielding) and high-level radioactive waste management (AQA 3.8).",
    requiredFields: reactorFields,
    physicalConstraints: [
      "Maximum head-on elastic KE transfer fraction = 4A / (1 + A)^2",
      "Fission rate = P_thermal / E_per_fission",
    ],
    probeSpecs: [
      {
        kind: "al-a2-thermal-nuclear-reactor-lor",
        thermalPowerMW: 1800,
        efficiencyPct: 34,
        energyPerFissionMeV: 200,
        moderatorMaterial: "graphite",
        moderatorNucleonA: 12,
        focusArea: "full-safety",
      },
      {
        kind: "al-a2-thermal-nuclear-reactor-lor",
        thermalPowerMW: 2400,
        efficiencyPct: 36,
        energyPerFissionMeV: 205,
        moderatorMaterial: "pressurised-water",
        moderatorNucleonA: 1,
        focusArea: "waste-management",
      },
    ],
    validate: validateReactor,
    solve: solveReactor,
    renderSvg: renderReactorSvg,
  },
];
