import type {
  DomainRenderOptions,
  DomainRenderOutput,
  DomainSolveOutput,
  DomainValidationResult,
} from "@/lib/bank-pipeline/domain-registry";
import type { PhysicsDomainId, VerifiedQuantityMap } from "@/lib/bank-pipeline/types";

export const NCUK_GRAVITY_MS2 = 9.81;
export const NCUK_ATMOSPHERIC_PRESSURE_PA = 1.01e5;
export const NCUK_STATICS_FLUIDS_RENDERER_VERSION =
  "ncuk-statics-fluids-svg/1.0.0";

export interface DomainKindPlugin {
  readonly domain: PhysicsDomainId;
  readonly kind: string;
  readonly summary: string;
  readonly requiredFields: ReadonlyArray<{
    name: string;
    type: string;
    unit?: string;
    bounds?: string;
    enumValues?: readonly string[];
    notes?: string;
  }>;
  readonly optionalFields?: ReadonlyArray<{
    name: string;
    type: string;
    unit?: string;
    bounds?: string;
    enumValues?: readonly string[];
    notes?: string;
  }>;
  readonly physicalConstraints: readonly string[];
  readonly probeSpecs: readonly Record<string, unknown>[];
  readonly validate: (spec: Record<string, unknown>) => DomainValidationResult;
  readonly solve: (spec: Record<string, unknown>) => DomainSolveOutput;
  readonly renderSvg?: (
    spec: Record<string, unknown>,
    options?: DomainRenderOptions,
  ) => DomainRenderOutput | undefined;
}

export const NCUK_STATICS_FLUIDS_KINDS = [
  "beam-single-pivot-moments",
  "beam-two-support-overhang",
  "hinged-rod-angled-wire",
  "two-wire-suspended-bar",
  "alloy-composite-density",
  "hydrostatic-pressure-base-force",
  "hydrostatic-tank-brownian",
] as const;

export type NcukStaticsFluidsKind = (typeof NCUK_STATICS_FLUIDS_KINDS)[number];

const SVG_FONT_FAMILY =
  "'Plus Jakarta Sans', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif";

function isFiniteNum(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function isPositiveNum(v: unknown): v is number {
  return isFiniteNum(v) && v > 0;
}

function isNonNegativeNum(v: unknown): v is number {
  return isFiniteNum(v) && v >= 0;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function c(value: number): string {
  return String(Number(value.toFixed(2)));
}

function fmtShort(value: number, decimals = 2): string {
  if (!Number.isFinite(value)) return "0";
  const rounded = Number(value.toFixed(decimals));
  return String(rounded);
}

function fmtCompact(value: number): string {
  const abs = Math.abs(value);
  if (abs === 0) return "0";
  if (abs >= 1000) return String(Math.round(value));
  if (abs >= 100) return fmtShort(value, 1);
  if (abs >= 10) return fmtShort(value, 2);
  return fmtShort(value, 2);
}

function collectHiddenSet(
  spec: Record<string, unknown>,
  options?: DomainRenderOptions,
): Set<string> {
  const set = new Set<string>();
  const specHidden = spec.hiddenQuantities;
  if (Array.isArray(specHidden)) {
    for (const key of specHidden) {
      if (typeof key === "string" && key.trim()) {
        set.add(key.trim());
      }
    }
  }
  if (options?.hiddenQuantities) {
    for (const key of options.hiddenQuantities) {
      if (typeof key === "string" && key.trim()) {
        set.add(key.trim());
      }
    }
  }
  return set;
}

function shouldHideAny(
  hidden: ReadonlySet<string>,
  keys: readonly string[],
): boolean {
  return keys.some((k) => hidden.has(k));
}

function seededPrng(seed: number): () => number {
  let state = Math.trunc(seed) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function commonSvgDefs(): string {
  return [
    "<defs>",
    '<marker id="sf-arr-red" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto-start-reverse"><path d="M 0 1 L 10 5 L 0 9 z" fill="#b91c1c"/></marker>',
    '<marker id="sf-arr-blue" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto-start-reverse"><path d="M 0 1 L 10 5 L 0 9 z" fill="#1d4ed8"/></marker>',
    '<marker id="sf-arr-green" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto-start-reverse"><path d="M 0 1 L 10 5 L 0 9 z" fill="#047857"/></marker>',
    '<marker id="sf-arr-slate" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="5.5" markerHeight="5.5" orient="auto-start-reverse"><path d="M 0 1.5 L 10 5 L 0 8.5 z" fill="#475569"/></marker>',
    '<pattern id="sf-hatch-ground" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="8" stroke="#94a3b8" stroke-width="1.3"/></pattern>',
    '<pattern id="sf-hatch-wall" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)"><line x1="0" y1="0" x2="0" y2="9" stroke="#64748b" stroke-width="1.4"/></pattern>',
    "</defs>",
  ].join("");
}

function drawHorizontalDim(
  x1: number,
  x2: number,
  y: number,
  label: string,
  tickTopY?: number,
): string {
  const left = Math.min(x1, x2);
  const right = Math.max(x1, x2);
  const mid = (left + right) / 2;
  const parts: string[] = [];
  if (tickTopY !== undefined) {
    parts.push(
      `<line x1="${c(left)}" y1="${c(tickTopY)}" x2="${c(left)}" y2="${c(y + 5)}" stroke="#94a3b8" stroke-width="1" stroke-dasharray="3 3"/>`,
      `<line x1="${c(right)}" y1="${c(tickTopY)}" x2="${c(right)}" y2="${c(y + 5)}" stroke="#94a3b8" stroke-width="1" stroke-dasharray="3 3"/>`,
    );
  }
  parts.push(
    `<line x1="${c(left)}" y1="${c(y - 5)}" x2="${c(left)}" y2="${c(y + 5)}" stroke="#475569" stroke-width="1.3"/>`,
    `<line x1="${c(right)}" y1="${c(y - 5)}" x2="${c(right)}" y2="${c(y + 5)}" stroke="#475569" stroke-width="1.3"/>`,
    `<line x1="${c(left + 3)}" y1="${c(y)}" x2="${c(right - 3)}" y2="${c(y)}" stroke="#475569" stroke-width="1.3" marker-start="url(#sf-arr-slate)" marker-end="url(#sf-arr-slate)"/>`,
    `<rect x="${c(mid - Math.max(24, label.length * 4.1))}" y="${c(y - 10)}" width="${c(Math.max(48, label.length * 8.2))}" height="20" rx="3" fill="#ffffff"/>`,
    `<text x="${c(mid)}" y="${c(y + 4)}" text-anchor="middle" font-size="12.5" font-weight="600" fill="#334155">${escapeXml(label)}</text>`,
  );
  return parts.join("");
}

function drawVerticalDim(
  x: number,
  y1: number,
  y2: number,
  label: string,
  side: "left" | "right" = "right",
): string {
  const top = Math.min(y1, y2);
  const bot = Math.max(y1, y2);
  const mid = (top + bot) / 2;
  const textX = side === "right" ? x + 10 : x - 10;
  const anchor = side === "right" ? "start" : "end";
  return [
    `<line x1="${c(x - 5)}" y1="${c(top)}" x2="${c(x + 5)}" y2="${c(top)}" stroke="#475569" stroke-width="1.3"/>`,
    `<line x1="${c(x - 5)}" y1="${c(bot)}" x2="${c(x + 5)}" y2="${c(bot)}" stroke="#475569" stroke-width="1.3"/>`,
    `<line x1="${c(x)}" y1="${c(top + 3)}" x2="${c(x)}" y2="${c(bot - 3)}" stroke="#475569" stroke-width="1.3" marker-start="url(#sf-arr-slate)" marker-end="url(#sf-arr-slate)"/>`,
    `<text x="${c(textX)}" y="${c(mid + 4)}" text-anchor="${anchor}" font-size="12.5" font-weight="600" fill="#334155">${escapeXml(label)}</text>`,
  ].join("");
}

function drawFulcrumTriangle(
  cx: number,
  topY: number,
  label?: string,
): string {
  const halfW = 16;
  const h = 24;
  const baseY = topY + h;
  const parts = [
    `<polygon points="${c(cx)},${c(topY)} ${c(cx - halfW)},${c(baseY)} ${c(cx + halfW)},${c(baseY)}" fill="#cbd5e1" stroke="#1e293b" stroke-width="2"/>`,
    `<rect x="${c(cx - halfW - 10)}" y="${c(baseY)}" width="${c((halfW + 10) * 2)}" height="9" fill="url(#sf-hatch-ground)" stroke="none"/>`,
    `<line x1="${c(cx - halfW - 10)}" y1="${c(baseY)}" x2="${c(cx + halfW + 10)}" y2="${c(baseY)}" stroke="#1e293b" stroke-width="2"/>`,
  ];
  if (label) {
    parts.push(
      `<text x="${c(cx)}" y="${c(baseY + 24)}" text-anchor="middle" font-size="13" font-weight="700" fill="#0f172a">${escapeXml(label)}</text>`,
    );
  }
  return parts.join("");
}

function wrapSvg(
  width: number,
  height: number,
  title: string,
  desc: string,
  body: string,
): string {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(title)}">`,
    `<title>${escapeXml(title)}</title>`,
    `<desc>${escapeXml(desc)}</desc>`,
    commonSvgDefs(),
    `<rect width="${width}" height="${height}" fill="#ffffff"/>`,
    `<g font-family="${SVG_FONT_FAMILY}">`,
    body,
    "</g>",
    "</svg>",
  ].join("");
}

/* ============================================================================
 * 1. MECHANICS: beam-single-pivot-moments
 * ============================================================================ */

type SinglePivotMode =
  | "find-balance-mass"
  | "find-balance-position"
  | "crane-counterweight";

function validateBeamSinglePivot(
  spec: Record<string, unknown>,
): DomainValidationResult {
  const issues: string[] = [];
  if (spec.kind !== "beam-single-pivot-moments") {
    issues.push('kind must be "beam-single-pivot-moments"');
  }
  const mode = (spec.mode ?? "find-balance-mass") as string;
  if (
    mode !== "find-balance-mass" &&
    mode !== "find-balance-position" &&
    mode !== "crane-counterweight"
  ) {
    issues.push(
      'mode must be "find-balance-mass", "find-balance-position", or "crane-counterweight"',
    );
  }
  const L = spec.beamLengthM;
  const mBeam = spec.beamMassKg;
  const xCg = spec.cgFromLeftM;
  const xPiv = spec.pivotFromLeftM;
  const g = spec.gravityMs2 ?? NCUK_GRAVITY_MS2;

  if (!isPositiveNum(L) || L < 0.4 || L > 40) {
    issues.push("beamLengthM must be in [0.4, 40] m");
  }
  if (!isPositiveNum(mBeam) || mBeam < 0.1 || mBeam > 20000) {
    issues.push("beamMassKg must be in [0.1, 20000] kg");
  }
  if (!isPositiveNum(g) || g < 1 || g > 25) {
    issues.push("gravityMs2 must be in [1, 25] m s^-2");
  }
  if (isPositiveNum(L)) {
    if (!isPositiveNum(xCg) || xCg >= L) {
      issues.push("cgFromLeftM must lie strictly inside (0, beamLengthM)");
    }
    if (!isPositiveNum(xPiv) || xPiv >= L) {
      issues.push("pivotFromLeftM must lie strictly inside (0, beamLengthM)");
    }
    if (isPositiveNum(xCg) && isPositiveNum(xPiv) && Math.abs(xCg - xPiv) < 0.05) {
      issues.push("pivotFromLeftM and cgFromLeftM must be separated by at least 0.05 m");
    }
  }

  if (issues.length === 0 && isPositiveNum(L) && isPositiveNum(mBeam) && isPositiveNum(xCg) && isPositiveNum(xPiv)) {
    if (mode === "find-balance-mass") {
      const xLoad = spec.loadFromLeftM;
      if (!isNonNegativeNum(xLoad) || xLoad > L) {
        issues.push("loadFromLeftM must lie in [0, beamLengthM]");
      } else if (Math.abs(xLoad - xPiv) < 0.05) {
        issues.push("loadFromLeftM must be at least 0.05 m from pivotFromLeftM");
      } else if ((xLoad - xPiv) * (xCg - xPiv) >= 0) {
        issues.push("loadFromLeftM must lie on the opposite side of pivotFromLeftM from cgFromLeftM");
      }
    } else if (mode === "find-balance-position") {
      const mLoad = spec.loadMassKg;
      if (!isPositiveNum(mLoad) || mLoad > 50000) {
        issues.push("loadMassKg must be positive");
      } else {
        const cgArm = Math.abs(xCg - xPiv);
        const loadArm = (mBeam * cgArm) / mLoad;
        const xLoad = xCg > xPiv ? xPiv - loadArm : xPiv + loadArm;
        if (xLoad < 0.02 || xLoad > L - 0.02) {
          issues.push(
            `Calculated balancing position (${xLoad.toFixed(3)} m) falls off the beam [0, ${L}] m`,
          );
        }
      }
    } else if (mode === "crane-counterweight") {
      const mCw = spec.counterweightMassKg;
      const xCw = spec.counterweightFromLeftM;
      const xLoad = spec.loadFromLeftM;
      if (!isPositiveNum(mCw)) issues.push("counterweightMassKg must be positive");
      if (!isNonNegativeNum(xCw) || xCw >= xPiv - 0.05) {
        issues.push("counterweightFromLeftM must lie strictly to the left of pivotFromLeftM");
      }
      if (xCg <= xPiv + 0.05) {
        issues.push("cgFromLeftM must lie strictly to the right of pivotFromLeftM in crane-counterweight mode");
      }
      if (!isPositiveNum(xLoad) || xLoad <= xPiv + 0.05 || xLoad > L) {
        issues.push("loadFromLeftM must lie in (pivotFromLeftM + 0.05, beamLengthM]");
      }
      if (isPositiveNum(mCw) && isNonNegativeNum(xCw) && isPositiveNum(xLoad)) {
        const cwTorqueTerm = mCw * (xPiv - xCw);
        const beamTorqueTerm = mBeam * (xCg - xPiv);
        if (cwTorqueTerm <= beamTorqueTerm + 1e-6) {
          issues.push(
            "Counterweight moment must exceed jib beam self-weight moment to carry a positive safe load",
          );
        }
      }
    }
  }

  return { valid: issues.length === 0, issues };
}

function solveBeamSinglePivot(spec: Record<string, unknown>): DomainSolveOutput {
  const mode = (spec.mode ?? "find-balance-mass") as SinglePivotMode;
  const L = spec.beamLengthM as number;
  const mBeam = spec.beamMassKg as number;
  const xCg = spec.cgFromLeftM as number;
  const xPiv = spec.pivotFromLeftM as number;
  const g = (spec.gravityMs2 as number | undefined) ?? NCUK_GRAVITY_MS2;

  const beamWeightN = mBeam * g;
  const cgLeverArmM = Math.abs(xCg - xPiv);
  const beamMomentNm = beamWeightN * cgLeverArmM;
  const turningSenseIfLoadRemoved = xCg > xPiv ? "clockwise" : "anticlockwise";

  const quantities: VerifiedQuantityMap = {
    beamLengthM: L,
    beamMassKg: mBeam,
    cgFromLeftM: xCg,
    pivotFromLeftM: xPiv,
    gravityMs2: g,
    beamWeightN,
    cgLeverArmM,
    beamMomentNm,
    momentDefinitionConcept:
      "force multiplied by the perpendicular distance from the pivot to the line of action",
    equilibriumConditionsConcept:
      "zero resultant force and zero resultant moment about any point",
    turningSenseIfLoadRemoved,
  };

  if (mode === "find-balance-mass") {
    const xLoad = spec.loadFromLeftM as number;
    const loadLeverArmM = Math.abs(xLoad - xPiv);
    const loadWeightN = beamMomentNm / loadLeverArmM;
    const loadMassKg = loadWeightN / g;
    const pivotReactionN = beamWeightN + loadWeightN;
    const loadFromRightM = L - xLoad;
    quantities.loadFromLeftM = xLoad;
    quantities.loadFromRightM = loadFromRightM;
    quantities.loadLeverArmM = loadLeverArmM;
    quantities.loadWeightN = loadWeightN;
    quantities.loadMassKg = loadMassKg;
    quantities.pivotReactionN = pivotReactionN;
  } else if (mode === "find-balance-position") {
    const mLoad = spec.loadMassKg as number;
    const loadWeightN = mLoad * g;
    const loadLeverArmM = beamMomentNm / loadWeightN;
    const loadFromLeftM = xCg > xPiv ? xPiv - loadLeverArmM : xPiv + loadLeverArmM;
    const loadFromRightM = L - loadFromLeftM;
    const pivotReactionN = beamWeightN + loadWeightN;
    quantities.loadMassKg = mLoad;
    quantities.loadWeightN = loadWeightN;
    quantities.loadLeverArmM = loadLeverArmM;
    quantities.loadFromLeftM = loadFromLeftM;
    quantities.loadFromRightM = loadFromRightM;
    quantities.pivotReactionN = pivotReactionN;
  } else {
    const mCw = spec.counterweightMassKg as number;
    const xCw = spec.counterweightFromLeftM as number;
    const xLoad = spec.loadFromLeftM as number;
    const counterweightWeightN = mCw * g;
    const counterweightLeverArmM = xPiv - xCw;
    const counterweightMomentNm = counterweightWeightN * counterweightLeverArmM;
    const loadLeverArmM = xLoad - xPiv;
    const maxSafeLoadWeightN = (counterweightMomentNm - beamMomentNm) / loadLeverArmM;
    const maxSafeLoadMassKg = maxSafeLoadWeightN / g;
    const pivotReactionN = counterweightWeightN + beamWeightN + maxSafeLoadWeightN;
    quantities.counterweightMassKg = mCw;
    quantities.counterweightFromLeftM = xCw;
    quantities.counterweightWeightN = counterweightWeightN;
    quantities.counterweightLeverArmM = counterweightLeverArmM;
    quantities.counterweightMomentNm = counterweightMomentNm;
    quantities.loadFromLeftM = xLoad;
    quantities.loadLeverArmM = loadLeverArmM;
    quantities.maxSafeLoadWeightN = maxSafeLoadWeightN;
    quantities.maxSafeLoadMassKg = maxSafeLoadMassKg;
    quantities.loadMassKg = maxSafeLoadMassKg;
    quantities.loadWeightN = maxSafeLoadWeightN;
    quantities.pivotReactionN = pivotReactionN;
  }

  return {
    solverId: "ncuk-beam-single-pivot-solver/1.0.0",
    quantities,
  };
}

function renderBeamSinglePivotSvg(
  spec: Record<string, unknown>,
  options?: DomainRenderOptions,
): DomainRenderOutput {
  const mode = (spec.mode ?? "find-balance-mass") as SinglePivotMode;
  const solved = solveBeamSinglePivot(spec).quantities;
  const hidden = collectHiddenSet(spec, options);

  const L = solved.beamLengthM as number;
  const mBeam = solved.beamMassKg as number;
  const xCg = solved.cgFromLeftM as number;
  const xPiv = solved.pivotFromLeftM as number;
  const xLoad = solved.loadFromLeftM as number;

  const width = 680;
  const height = 370;
  const beamLeft = 84;
  const beamRight = 596;
  const beamSpanPx = beamRight - beamLeft;
  const beamY = 176;
  const beamH = 16;
  const toX = (m: number) => beamLeft + (m / L) * beamSpanPx;

  const pivPx = toX(xPiv);
  const cgPx = toX(xCg);
  const loadPx = toX(xLoad);

  const publicNumbers: number[] = [L, mBeam];
  const publicLabels: string[] = [];
  const parts: string[] = [];

  // Beam body + end labels A, B
  parts.push(
    `<rect x="${c(beamLeft)}" y="${c(beamY)}" width="${c(beamSpanPx)}" height="${beamH}" rx="2" fill="#e2e8f0" stroke="#1e293b" stroke-width="2.2"/>`,
    `<text x="${c(beamLeft - 14)}" y="${c(beamY + 13)}" text-anchor="end" font-size="14" font-weight="700" fill="#0f172a">A</text>`,
    `<text x="${c(beamRight + 14)}" y="${c(beamY + 13)}" text-anchor="start" font-size="14" font-weight="700" fill="#0f172a">B</text>`,
  );

  // Fulcrum & upward reaction arrow R
  parts.push(drawFulcrumTriangle(pivPx, beamY + beamH, "P"));
  parts.push(
    `<line x1="${c(pivPx)}" y1="${c(beamY - 2)}" x2="${c(pivPx)}" y2="${c(beamY - 56)}" stroke="#047857" stroke-width="2.2" marker-end="url(#sf-arr-green)"/>`,
    `<text x="${c(pivPx)}" y="${c(beamY - 64)}" text-anchor="middle" font-size="13.5" font-weight="700" fill="#047857">R</text>`,
  );

  // CG marker and downward weight vector
  const hideBeamWeight = shouldHideAny(hidden, ["beamMassKg", "beamWeightN"]);
  const beamLabel = hideBeamWeight ? "W" : `m = ${fmtCompact(mBeam)} kg`;
  if (!hideBeamWeight) publicLabels.push(beamLabel);
  parts.push(
    `<circle cx="${c(cgPx)}" cy="${c(beamY + beamH / 2)}" r="4.5" fill="#b91c1c" stroke="#ffffff" stroke-width="1.4"/>`,
    `<text x="${c(cgPx)}" y="${c(beamY - 10)}" text-anchor="middle" font-size="12.5" font-weight="700" fill="#b91c1c">G</text>`,
    `<line x1="${c(cgPx)}" y1="${c(beamY + beamH + 2)}" x2="${c(cgPx)}" y2="${c(beamY + beamH + 62)}" stroke="#b91c1c" stroke-width="2.2" marker-end="url(#sf-arr-red)"/>`,
    `<text x="${c(cgPx)}" y="${c(beamY + beamH + 78)}" text-anchor="middle" font-size="12.5" font-weight="600" fill="#b91c1c">${escapeXml(beamLabel)}</text>`,
  );

  // Counterweight block (crane mode)
  if (mode === "crane-counterweight") {
    const xCw = solved.counterweightFromLeftM as number;
    const mCw = solved.counterweightMassKg as number;
    const cwPx = toX(xCw);
    const cwLabel = shouldHideAny(hidden, ["counterweightMassKg", "counterweightWeightN"])
      ? "M"
      : `${fmtCompact(mCw)} kg`;
    if (!shouldHideAny(hidden, ["counterweightMassKg", "counterweightWeightN"])) {
      publicNumbers.push(mCw);
      publicLabels.push(cwLabel);
    }
    parts.push(
      `<rect x="${c(cwPx - 22)}" y="${c(beamY - 34)}" width="44" height="34" rx="3" fill="#dbeafe" stroke="#1e3a8a" stroke-width="2"/>`,
      `<text x="${c(cwPx)}" y="${c(beamY - 13)}" text-anchor="middle" font-size="11.5" font-weight="700" fill="#1e3a8a">${escapeXml(cwLabel)}</text>`,
      `<line x1="${c(cwPx)}" y1="${c(beamY + beamH + 2)}" x2="${c(cwPx)}" y2="${c(beamY + beamH + 58)}" stroke="#1d4ed8" stroke-width="2.2" marker-end="url(#sf-arr-blue)"/>`,
      `<text x="${c(cwPx)}" y="${c(beamY + beamH + 74)}" text-anchor="middle" font-size="12" font-weight="600" fill="#1d4ed8">Counterweight</text>`,
    );
  }

  // Load block / hanging mass
  const hideLoadMass = shouldHideAny(hidden, [
    "loadMassKg",
    "loadWeightN",
    "maxSafeLoadMassKg",
    "maxSafeLoadWeightN",
  ]);
  const loadMassVal = solved.loadMassKg as number;
  const loadBoxText = hideLoadMass ? "?" : `${fmtCompact(loadMassVal)} kg`;
  if (!hideLoadMass) {
    publicNumbers.push(loadMassVal);
    publicLabels.push(loadBoxText);
  }

  if (mode === "crane-counterweight") {
    // Hanging crane hook load
    parts.push(
      `<line x1="${c(loadPx)}" y1="${c(beamY + beamH)}" x2="${c(loadPx)}" y2="${c(beamY + beamH + 34)}" stroke="#334155" stroke-width="2"/>`,
      `<rect x="${c(loadPx - 22)}" y="${c(beamY + beamH + 34)}" width="44" height="30" rx="3" fill="#fef3c7" stroke="#92400e" stroke-width="2"/>`,
      `<text x="${c(loadPx)}" y="${c(beamY + beamH + 53)}" text-anchor="middle" font-size="12" font-weight="700" fill="#92400e">${escapeXml(loadBoxText)}</text>`,
    );
  } else {
    // Resting block on top of beam
    parts.push(
      `<rect x="${c(loadPx - 20)}" y="${c(beamY - 30)}" width="40" height="30" rx="3" fill="#fef3c7" stroke="#92400e" stroke-width="2"/>`,
      `<text x="${c(loadPx)}" y="${c(beamY - 11)}" text-anchor="middle" font-size="12" font-weight="700" fill="#92400e">${escapeXml(loadBoxText)}</text>`,
      `<line x1="${c(loadPx)}" y1="${c(beamY + beamH + 2)}" x2="${c(loadPx)}" y2="${c(beamY + beamH + 54)}" stroke="#1d4ed8" stroke-width="2.2" marker-end="url(#sf-arr-blue)"/>`,
      `<text x="${c(loadPx)}" y="${c(beamY + beamH + 70)}" text-anchor="middle" font-size="12" font-weight="600" fill="#1d4ed8">Load</text>`,
    );
  }

  // Top total beam length dimension
  const lenLabel = `L = ${fmtCompact(L)} m`;
  publicLabels.push(lenLabel);
  parts.push(drawHorizontalDim(beamLeft, beamRight, 58, lenLabel, beamY));

  // Bottom public distance dimensions (respecting hidden quantities)
  const hideLoadPos = shouldHideAny(hidden, [
    "loadFromLeftM",
    "loadFromRightM",
    "loadLeverArmM",
  ]);
  const pivLabel = `${fmtCompact(xPiv)} m`;
  publicNumbers.push(xPiv);
  publicLabels.push(pivLabel);
  parts.push(drawHorizontalDim(beamLeft, pivPx, 300, pivLabel, beamY + beamH + 26));

  if (mode === "crane-counterweight") {
    const xCw = solved.counterweightFromLeftM as number;
    const cwArm = solved.counterweightLeverArmM as number;
    const loadArm = solved.loadLeverArmM as number;
    const cwArmLabel = `${fmtCompact(cwArm)} m`;
    const loadArmLabel = `${fmtCompact(loadArm)} m`;
    publicNumbers.push(cwArm, loadArm);
    publicLabels.push(cwArmLabel, loadArmLabel);
    parts.push(
      drawHorizontalDim(toX(xCw), pivPx, 336, cwArmLabel, beamY + beamH),
      drawHorizontalDim(pivPx, loadPx, 336, loadArmLabel, beamY + beamH),
    );
  } else if (!hideLoadPos) {
    const armVal = solved.loadLeverArmM as number;
    const armLabel = `${fmtCompact(armVal)} m`;
    publicNumbers.push(armVal);
    publicLabels.push(armLabel);
    parts.push(drawHorizontalDim(loadPx, pivPx, 336, armLabel, beamY + beamH));
  } else {
    parts.push(drawHorizontalDim(loadPx, pivPx, 336, "d = ?", beamY + beamH));
  }

  const cgArmVal = solved.cgLeverArmM as number;
  if (!shouldHideAny(hidden, ["cgFromLeftM", "cgLeverArmM"])) {
    const cgArmLabel = `${fmtCompact(cgArmVal)} m`;
    publicNumbers.push(cgArmVal, xCg);
    publicLabels.push(cgArmLabel);
    parts.push(drawHorizontalDim(pivPx, cgPx, 96, cgArmLabel, beamY));
  }

  const title =
    mode === "crane-counterweight"
      ? "Balanced jib crane beam with counterweight on central mast pivot"
      : "Balanced horizontal beam on a single off-centre pivot";
  const desc =
    "Horizontal rigid beam A to B with centre of gravity G, single pivot P, applied load, and distance annotations.";

  return {
    visualFamily: "mechanics_statics",
    svgMarkup: wrapSvg(width, height, title, desc, parts.join("")),
    rendererVersion: NCUK_STATICS_FLUIDS_RENDERER_VERSION,
    publicNumbers,
    publicLabels,
  };
}

/* ============================================================================
 * 2. MECHANICS: beam-two-support-overhang
 * ============================================================================ */

function validateBeamTwoSupport(
  spec: Record<string, unknown>,
): DomainValidationResult {
  const issues: string[] = [];
  if (spec.kind !== "beam-two-support-overhang") {
    issues.push('kind must be "beam-two-support-overhang"');
  }
  const L = spec.beamLengthM;
  const mBeam = spec.beamMassKg;
  const xCg = spec.cgFromLeftM;
  const xA = spec.supportAFromLeftM;
  const xB = spec.supportBFromLeftM;
  const mLoad = spec.loadMassKg;
  const xLoad = spec.loadFromLeftM;
  const g = spec.gravityMs2 ?? NCUK_GRAVITY_MS2;

  if (!isPositiveNum(L) || L < 1 || L > 30) {
    issues.push("beamLengthM must be in [1, 30] m");
  }
  if (!isPositiveNum(mBeam) || mBeam < 1 || mBeam > 20000) {
    issues.push("beamMassKg must be in [1, 20000] kg");
  }
  if (!isPositiveNum(mLoad) || mLoad < 1 || mLoad > 20000) {
    issues.push("loadMassKg must be in [1, 20000] kg");
  }
  if (!isPositiveNum(g) || g < 1 || g > 25) {
    issues.push("gravityMs2 must be in [1, 25] m s^-2");
  }
  if (
    isPositiveNum(L) &&
    isNonNegativeNum(xA) &&
    isPositiveNum(xB) &&
    isPositiveNum(xCg) &&
    isNonNegativeNum(xLoad)
  ) {
    if (xA >= xB - 0.2) {
      issues.push("supportBFromLeftM must exceed supportAFromLeftM by at least 0.2 m");
    }
    if (xB >= L - 0.2) {
      issues.push("beam must overhang supportBFromLeftM by at least 0.2 m");
    }
    if (xCg <= xA || xCg >= xB) {
      issues.push("cgFromLeftM must lie strictly between supportAFromLeftM and supportBFromLeftM");
    }
    if (xLoad > L) {
      issues.push("loadFromLeftM must lie in [0, beamLengthM]");
    }
    if (isPositiveNum(mBeam) && isPositiveNum(mLoad) && isPositiveNum(g)) {
      const rA =
        ((mBeam * (xB - xCg) + mLoad * (xB - xLoad)) * g) / (xB - xA);
      const rB = (mBeam + mLoad) * g - rA;
      if (rA <= 0.1 || rB <= 0.1) {
        issues.push(
          "Both support reactions R_A and R_B must remain strictly positive in the initial equilibrium position",
        );
      }
    }
  } else {
    issues.push(
      "supportAFromLeftM, supportBFromLeftM, cgFromLeftM, and loadFromLeftM must be finite numbers",
    );
  }

  return { valid: issues.length === 0, issues };
}

function solveBeamTwoSupport(spec: Record<string, unknown>): DomainSolveOutput {
  const L = spec.beamLengthM as number;
  const mBeam = spec.beamMassKg as number;
  const xCg = spec.cgFromLeftM as number;
  const xA = spec.supportAFromLeftM as number;
  const xB = spec.supportBFromLeftM as number;
  const mLoad = spec.loadMassKg as number;
  const xLoad = spec.loadFromLeftM as number;
  const g = (spec.gravityMs2 as number | undefined) ?? NCUK_GRAVITY_MS2;

  const beamWeightN = mBeam * g;
  const loadWeightN = mLoad * g;
  const totalWeightN = beamWeightN + loadWeightN;
  const supportSpanM = xB - xA;
  const overhangLengthM = L - xB;

  const reactionAN =
    (beamWeightN * (xB - xCg) + loadWeightN * (xB - xLoad)) / supportSpanM;
  const reactionBN = totalWeightN - reactionAN;

  const tippingPastBM = (mBeam * (xB - xCg)) / mLoad;
  const tippingFromLeftM = xB + tippingPastBM;
  const tippingFromRightEndM = L - tippingFromLeftM;
  const maxEndLoadMassKg = (mBeam * (xB - xCg)) / overhangLengthM;
  const maxEndLoadWeightN = maxEndLoadMassKg * g;

  return {
    solverId: "ncuk-beam-two-support-overhang-solver/1.0.0",
    quantities: {
      beamLengthM: L,
      beamMassKg: mBeam,
      cgFromLeftM: xCg,
      supportAFromLeftM: xA,
      supportBFromLeftM: xB,
      loadMassKg: mLoad,
      loadFromLeftM: xLoad,
      gravityMs2: g,
      beamWeightN,
      loadWeightN,
      totalWeightN,
      supportSpanM,
      overhangLengthM,
      reactionAN,
      reactionBN,
      tippingPastBM,
      tippingFromLeftM,
      tippingFromRightEndM,
      maxEndLoadMassKg,
      maxEndLoadWeightN,
      tippingConditionConcept:
        "the upward normal reaction force at support A decreases to zero",
      loadMoveRightEffectConcept:
        "the reaction force at support A decreases and the reaction force at support B increases",
      momentsPivotChoiceConcept:
        "taking moments about support B eliminates the unknown reaction at support B from the moment equation",
    },
  };
}

function renderBeamTwoSupportSvg(
  spec: Record<string, unknown>,
  options?: DomainRenderOptions,
): DomainRenderOutput {
  const solved = solveBeamTwoSupport(spec).quantities;
  const hidden = collectHiddenSet(spec, options);

  const L = solved.beamLengthM as number;
  const mBeam = solved.beamMassKg as number;
  const xCg = solved.cgFromLeftM as number;
  const xA = solved.supportAFromLeftM as number;
  const xB = solved.supportBFromLeftM as number;
  const mLoad = solved.loadMassKg as number;
  const xLoad = solved.loadFromLeftM as number;
  const supportSpan = solved.supportSpanM as number;
  const overhang = solved.overhangLengthM as number;

  const width = 680;
  const height = 390;
  const beamLeft = 78;
  const beamRight = 602;
  const spanPx = beamRight - beamLeft;
  const beamY = 180;
  const beamH = 16;
  const toX = (m: number) => beamLeft + (m / L) * spanPx;

  const aPx = toX(xA);
  const bPx = toX(xB);
  const cgPx = toX(xCg);
  const loadPx = toX(xLoad);

  const publicNumbers: number[] = [L, mBeam, supportSpan, overhang];
  const publicLabels: string[] = [];
  const parts: string[] = [];

  // Beam body
  parts.push(
    `<rect x="${c(beamLeft)}" y="${c(beamY)}" width="${c(spanPx)}" height="${beamH}" rx="2" fill="#e2e8f0" stroke="#1e293b" stroke-width="2.2"/>`,
  );

  // Supports A and B + upward reaction arrows
  parts.push(
    drawFulcrumTriangle(aPx, beamY + beamH, "A"),
    drawFulcrumTriangle(bPx, beamY + beamH, "B"),
    `<line x1="${c(aPx)}" y1="${c(beamY - 2)}" x2="${c(aPx)}" y2="${c(beamY - 56)}" stroke="#1d4ed8" stroke-width="2.2" marker-end="url(#sf-arr-blue)"/>`,
    `<text x="${c(aPx)}" y="${c(beamY - 64)}" text-anchor="middle" font-size="13.5" font-weight="700" fill="#1d4ed8">F₁</text>`,
    `<line x1="${c(bPx)}" y1="${c(beamY - 2)}" x2="${c(bPx)}" y2="${c(beamY - 56)}" stroke="#1d4ed8" stroke-width="2.2" marker-end="url(#sf-arr-blue)"/>`,
    `<text x="${c(bPx)}" y="${c(beamY - 64)}" text-anchor="middle" font-size="13.5" font-weight="700" fill="#1d4ed8">F₂</text>`,
  );

  // CG marker & weight arrow
  const cgLabel = `G (${fmtCompact(mBeam)} kg)`;
  publicLabels.push(cgLabel);
  parts.push(
    `<circle cx="${c(cgPx)}" cy="${c(beamY + beamH / 2)}" r="4.5" fill="#b91c1c" stroke="#ffffff" stroke-width="1.3"/>`,
    `<line x1="${c(cgPx)}" y1="${c(beamY + beamH + 2)}" x2="${c(cgPx)}" y2="${c(beamY + beamH + 58)}" stroke="#b91c1c" stroke-width="2.2" marker-end="url(#sf-arr-red)"/>`,
    `<text x="${c(cgPx)}" y="${c(beamY + beamH + 74)}" text-anchor="middle" font-size="12" font-weight="600" fill="#b91c1c">${escapeXml(cgLabel)}</text>`,
  );

  // Load mass block
  const hideLoad = shouldHideAny(hidden, ["loadMassKg", "loadWeightN"]);
  const loadLabel = hideLoad ? "Load" : `${fmtCompact(mLoad)} kg`;
  if (!hideLoad) {
    publicNumbers.push(mLoad);
    publicLabels.push(loadLabel);
  }
  const loadBoxY = beamY - 32;
  parts.push(
    `<rect x="${c(loadPx - 21)}" y="${c(loadBoxY)}" width="42" height="32" rx="3" fill="#fef3c7" stroke="#92400e" stroke-width="2"/>`,
    `<text x="${c(loadPx)}" y="${c(loadBoxY + 20)}" text-anchor="middle" font-size="11.5" font-weight="700" fill="#92400e">${escapeXml(loadLabel)}</text>`,
  );

  // Top total length dimension
  const totalLenLabel = `L = ${fmtCompact(L)} m`;
  publicLabels.push(totalLenLabel);
  parts.push(drawHorizontalDim(beamLeft, beamRight, 52, totalLenLabel, beamY));

  // Load position dimension if well separated from A and not hidden
  if (
    !shouldHideAny(hidden, ["loadFromLeftM"]) &&
    Math.abs(loadPx - beamLeft) > 26
  ) {
    const loadPosLabel = `${fmtCompact(xLoad)} m`;
    publicNumbers.push(xLoad);
    publicLabels.push(loadPosLabel);
    parts.push(drawHorizontalDim(beamLeft, loadPx, 92, loadPosLabel, beamY));
  }

  // Bottom dimensions: A->B span and B->right overhang
  const spanLabel = `${fmtCompact(supportSpan)} m`;
  const overhangLabel = `${fmtCompact(overhang)} m`;
  publicLabels.push(spanLabel, overhangLabel);
  parts.push(
    drawHorizontalDim(aPx, bPx, 316, spanLabel, beamY + beamH + 26),
    drawHorizontalDim(bPx, beamRight, 316, overhangLabel, beamY + beamH + 26),
  );
  if (xA > 0.05) {
    const leftEdgeLabel = `${fmtCompact(xA)} m`;
    publicNumbers.push(xA);
    publicLabels.push(leftEdgeLabel);
    parts.push(drawHorizontalDim(beamLeft, aPx, 354, leftEdgeLabel, beamY + beamH));
  }

  return {
    visualFamily: "mechanics_statics",
    svgMarkup: wrapSvg(
      width,
      height,
      "Overhanging beam resting on two supports A and B",
      "Horizontal beam resting on supports A and B with a right-hand overhang, centre of gravity G, applied load, and support reaction vectors F1 and F2.",
      parts.join(""),
    ),
    rendererVersion: NCUK_STATICS_FLUIDS_RENDERER_VERSION,
    publicNumbers,
    publicLabels,
  };
}

/* ============================================================================
 * 3. MECHANICS: hinged-rod-angled-wire
 * ============================================================================ */

type HingedRodMode = "wall-rod-wire" | "hinged-flap-vertical-lift";

function validateHingedRod(
  spec: Record<string, unknown>,
): DomainValidationResult {
  const issues: string[] = [];
  if (spec.kind !== "hinged-rod-angled-wire") {
    issues.push('kind must be "hinged-rod-angled-wire"');
  }
  const mode = (spec.mode ?? "wall-rod-wire") as string;
  if (mode !== "wall-rod-wire" && mode !== "hinged-flap-vertical-lift") {
    issues.push('mode must be "wall-rod-wire" or "hinged-flap-vertical-lift"');
  }

  const L = spec.rodLengthM;
  const mRod = spec.rodMassKg;
  const xCg = spec.cgFromHingeM;
  const xWire = spec.wireAttachFromHingeM ?? L;
  const extraM = spec.extraLoadMassKg ?? 0;
  const extraX = spec.extraLoadFromHingeM ?? L;
  const angleDeg =
    mode === "hinged-flap-vertical-lift"
      ? 90
      : spec.wireAngleToHorizontalDeg;
  const g = spec.gravityMs2 ?? NCUK_GRAVITY_MS2;

  if (!isPositiveNum(L) || L < 0.2 || L > 15) {
    issues.push("rodLengthM must be in [0.2, 15] m");
  }
  if (!isPositiveNum(mRod) || mRod < 0.2 || mRod > 5000) {
    issues.push("rodMassKg must be in [0.2, 5000] kg");
  }
  if (!isPositiveNum(g) || g < 1 || g > 25) {
    issues.push("gravityMs2 must be in [1, 25] m s^-2");
  }
  if (isPositiveNum(L)) {
    if (!isPositiveNum(xCg) || xCg >= L) {
      issues.push("cgFromHingeM must lie in (0, rodLengthM)");
    }
    if (!isPositiveNum(xWire) || xWire > L) {
      issues.push("wireAttachFromHingeM must lie in (0, rodLengthM]");
    }
    if (!isNonNegativeNum(extraM) || extraM > 5000) {
      issues.push("extraLoadMassKg must be in [0, 5000] kg");
    }
    if (isPositiveNum(extraM) && (!isPositiveNum(extraX) || extraX > L)) {
      issues.push("extraLoadFromHingeM must lie in (0, rodLengthM]");
    }
  }
  if (mode === "wall-rod-wire") {
    if (!isPositiveNum(angleDeg) || angleDeg < 15 || angleDeg > 75) {
      issues.push("wireAngleToHorizontalDeg must be in [15, 75] degrees");
    }
  }
  return { valid: issues.length === 0, issues };
}

function solveHingedRod(spec: Record<string, unknown>): DomainSolveOutput {
  const mode = (spec.mode ?? "wall-rod-wire") as HingedRodMode;
  const L = spec.rodLengthM as number;
  const mRod = spec.rodMassKg as number;
  const xCg = spec.cgFromHingeM as number;
  const xWire = (spec.wireAttachFromHingeM as number | undefined) ?? L;
  const extraM = (spec.extraLoadMassKg as number | undefined) ?? 0;
  const extraX = (spec.extraLoadFromHingeM as number | undefined) ?? L;
  const angleDeg =
    mode === "hinged-flap-vertical-lift"
      ? 90
      : (spec.wireAngleToHorizontalDeg as number);
  const g = (spec.gravityMs2 as number | undefined) ?? NCUK_GRAVITY_MS2;

  const thetaRad = (angleDeg * Math.PI) / 180;
  const rodWeightN = mRod * g;
  const extraLoadWeightN = extraM * g;
  const totalWeightN = rodWeightN + extraLoadWeightN;
  const clockwiseMomentNm = rodWeightN * xCg + extraLoadWeightN * extraX;

  const wireVerticalComponentN = clockwiseMomentNm / xWire;
  const wireTensionN = wireVerticalComponentN / Math.sin(thetaRad);
  const wireHorizontalComponentN =
    mode === "hinged-flap-vertical-lift"
      ? 0
      : wireTensionN * Math.cos(thetaRad);

  const hingeHorizontalN = wireHorizontalComponentN;
  const hingeVerticalN = totalWeightN - wireVerticalComponentN;
  const hingeResultantN = Math.hypot(hingeHorizontalN, hingeVerticalN);
  const hingeAngleAboveHorizontalDeg =
    mode === "hinged-flap-vertical-lift"
      ? 90
      : (Math.atan2(hingeVerticalN, hingeHorizontalN) * 180) / Math.PI;
  const wallAnchorHeightM =
    mode === "hinged-flap-vertical-lift" ? 0 : xWire * Math.tan(thetaRad);

  return {
    solverId: "ncuk-hinged-rod-angled-wire-solver/1.0.0",
    quantities: {
      rodLengthM: L,
      rodMassKg: mRod,
      cgFromHingeM: xCg,
      wireAttachFromHingeM: xWire,
      extraLoadMassKg: extraM,
      extraLoadFromHingeM: extraX,
      wireAngleToHorizontalDeg: angleDeg,
      wireAngleToVerticalDeg: 90 - angleDeg,
      gravityMs2: g,
      rodWeightN,
      extraLoadWeightN,
      totalWeightN,
      clockwiseMomentNm,
      wireVerticalComponentN,
      wireHorizontalComponentN,
      wireTensionN,
      hingeHorizontalN,
      hingeVerticalN,
      hingeResultantN,
      hingeAngleAboveHorizontalDeg,
      wallAnchorHeightM,
      hingeHorizontalExplanationConcept:
        "the angled wire exerts a horizontal component pulling toward the wall so the hinge must provide an equal horizontal force away from the wall for translational equilibrium",
      hingeDirectionSenseConcept:
        hingeVerticalN >= 0
          ? "away from the wall and vertically upwards"
          : "away from the wall and vertically downwards",
      flapHingeEqualityConcept:
        "for a uniform horizontal flap only three vertical forces act and taking moments about the outer end shows the hinge supports half the weight",
      momentDefinitionConcept:
        "force multiplied by the perpendicular distance from the pivot to the line of action",
    },
  };
}

function renderHingedRodSvg(
  spec: Record<string, unknown>,
  options?: DomainRenderOptions,
): DomainRenderOutput {
  const mode = (spec.mode ?? "wall-rod-wire") as HingedRodMode;
  const solved = solveHingedRod(spec).quantities;
  const hidden = collectHiddenSet(spec, options);

  const L = solved.rodLengthM as number;
  const mRod = solved.rodMassKg as number;
  const xCg = solved.cgFromHingeM as number;
  const xWire = solved.wireAttachFromHingeM as number;
  const extraM = solved.extraLoadMassKg as number;
  const extraX = solved.extraLoadFromHingeM as number;
  const angleDeg = solved.wireAngleToHorizontalDeg as number;
  const angleRef = (spec.angleReference as string | undefined) ?? "horizontal";

  const width = 680;
  const height = 400;
  const wallX = 128;
  const rodY = 252;
  const rodH = 14;
  const rodLenPx = 390;
  const toX = (m: number) => wallX + (m / L) * rodLenPx;

  const cgPx = toX(xCg);
  const wirePx = toX(xWire);
  const extraPx = toX(extraX);

  const publicNumbers: number[] = [L, mRod];
  const publicLabels: string[] = [];
  const parts: string[] = [];

  // Vertical hatched wall
  parts.push(
    `<rect x="${c(wallX - 28)}" y="44" width="28" height="292" fill="url(#sf-hatch-wall)" stroke="none"/>`,
    `<line x1="${c(wallX)}" y1="44" x2="${c(wallX)}" y2="336" stroke="#1e293b" stroke-width="2.6"/>`,
  );

  // Horizontal rod
  parts.push(
    `<rect x="${c(wallX)}" y="${c(rodY)}" width="${c(rodLenPx)}" height="${rodH}" rx="2" fill="#e2e8f0" stroke="#1e293b" stroke-width="2.2"/>`,
  );

  // Wall hinge pin O
  parts.push(
    `<circle cx="${c(wallX)}" cy="${c(rodY + rodH / 2)}" r="8" fill="#ffffff" stroke="#1e293b" stroke-width="2.4"/>`,
    `<circle cx="${c(wallX)}" cy="${c(rodY + rodH / 2)}" r="2.6" fill="#1e293b"/>`,
    `<text x="${c(wallX - 38)}" y="${c(rodY + 12)}" text-anchor="end" font-size="14" font-weight="700" fill="#0f172a">O</text>`,
  );

  // CG weight arrow
  const rodLabel = `m = ${fmtCompact(mRod)} kg`;
  publicLabels.push(rodLabel);
  parts.push(
    `<circle cx="${c(cgPx)}" cy="${c(rodY + rodH / 2)}" r="4.5" fill="#b91c1c" stroke="#ffffff" stroke-width="1.3"/>`,
    `<text x="${c(cgPx)}" y="${c(rodY - 9)}" text-anchor="middle" font-size="12.5" font-weight="700" fill="#b91c1c">G</text>`,
    `<line x1="${c(cgPx)}" y1="${c(rodY + rodH + 2)}" x2="${c(cgPx)}" y2="${c(rodY + rodH + 56)}" stroke="#b91c1c" stroke-width="2.2" marker-end="url(#sf-arr-red)"/>`,
    `<text x="${c(cgPx)}" y="${c(rodY + rodH + 72)}" text-anchor="middle" font-size="12" font-weight="600" fill="#b91c1c">${escapeXml(rodLabel)}</text>`,
  );

  // Optional extra sign / hanging load
  if (extraM > 0) {
    const extraLabel = `${fmtCompact(extraM)} kg`;
    publicNumbers.push(extraM);
    publicLabels.push(extraLabel);
    parts.push(
      `<line x1="${c(extraPx)}" y1="${c(rodY + rodH)}" x2="${c(extraPx)}" y2="${c(rodY + rodH + 24)}" stroke="#334155" stroke-width="2"/>`,
      `<rect x="${c(extraPx - 28)}" y="${c(rodY + rodH + 24)}" width="56" height="32" rx="3" fill="#fef3c7" stroke="#92400e" stroke-width="2"/>`,
      `<text x="${c(extraPx)}" y="${c(rodY + rodH + 44)}" text-anchor="middle" font-size="11.5" font-weight="700" fill="#92400e">${escapeXml(extraLabel)}</text>`,
    );
  }

  if (mode === "wall-rod-wire") {
    const visualTan = Math.min(0.62, Math.max(0.28, Math.tan((angleDeg * Math.PI) / 180) * 0.52));
    const anchorY = Math.max(64, rodY - (wirePx - wallX) * visualTan);
    const wireMidX = (wallX + wirePx) / 2;
    const wireMidY = (anchorY + rodY) / 2;

    parts.push(
      `<circle cx="${c(wallX)}" cy="${c(anchorY)}" r="4.5" fill="#1d4ed8"/>`,
      `<line x1="${c(wirePx)}" y1="${c(rodY)}" x2="${c(wallX)}" y2="${c(anchorY)}" stroke="#1d4ed8" stroke-width="2.4"/>`,
      `<line x1="${c(wirePx - (wirePx - wallX) * 0.14)}" y1="${c(rodY - (rodY - anchorY) * 0.14)}" x2="${c(wirePx - (wirePx - wallX) * 0.42)}" y2="${c(rodY - (rodY - anchorY) * 0.42)}" stroke="#1d4ed8" stroke-width="2.6" marker-end="url(#sf-arr-blue)"/>`,
      `<text x="${c(wireMidX + 12)}" y="${c(wireMidY - 12)}" text-anchor="start" font-size="14" font-weight="700" fill="#1d4ed8">T</text>`,
    );

    if (angleRef === "vertical") {
      // Angle α to vertical dashed line at outer attachment
      const alphaDeg = 90 - angleDeg;
      const alphaLabel = `${fmtCompact(alphaDeg)}°`;
      publicNumbers.push(alphaDeg);
      publicLabels.push(alphaLabel);
      const vTopY = rodY - 96;
      const rArc = 42;
      const wireAngleScreen = Math.atan2(rodY - anchorY, wirePx - wallX);
      const ax1 = wirePx;
      const ay1 = rodY - rArc;
      const ax2 = wirePx - rArc * Math.cos(wireAngleScreen);
      const ay2 = rodY - rArc * Math.sin(wireAngleScreen);
      parts.push(
        `<line x1="${c(wirePx)}" y1="${c(rodY)}" x2="${c(wirePx)}" y2="${c(vTopY)}" stroke="#64748b" stroke-width="1.4" stroke-dasharray="5 4"/>`,
        `<path d="M ${c(ax1)} ${c(ay1)} A ${rArc} ${rArc} 0 0 0 ${c(ax2)} ${c(ay2)}" fill="none" stroke="#1d4ed8" stroke-width="1.8"/>`,
        `<text x="${c(wirePx - 24)}" y="${c(rodY - 52)}" text-anchor="middle" font-size="13" font-weight="700" fill="#1d4ed8">${escapeXml(alphaLabel)}</text>`,
      );
    } else {
      const thetaLabel = `${fmtCompact(angleDeg)}°`;
      publicNumbers.push(angleDeg);
      publicLabels.push(thetaLabel);
      const rArc = 48;
      const wireAngleScreen = Math.atan2(rodY - anchorY, wirePx - wallX);
      const ax1 = wirePx - rArc;
      const ay1 = rodY;
      const ax2 = wirePx - rArc * Math.cos(wireAngleScreen);
      const ay2 = rodY - rArc * Math.sin(wireAngleScreen);
      parts.push(
        `<path d="M ${c(ax1)} ${c(ay1)} A ${rArc} ${rArc} 0 0 1 ${c(ax2)} ${c(ay2)}" fill="none" stroke="#1d4ed8" stroke-width="1.8"/>`,
        `<text x="${c(wirePx - 66)}" y="${c(rodY - 13)}" text-anchor="end" font-size="13" font-weight="700" fill="#1d4ed8">${escapeXml(thetaLabel)}</text>`,
      );
    }

    // Subtle green hinge force symbol R
    parts.push(
      `<line x1="${c(wallX + 6)}" y1="${c(rodY - 4)}" x2="${c(wallX + 54)}" y2="${c(rodY - 42)}" stroke="#047857" stroke-width="2" stroke-dasharray="5 3" marker-end="url(#sf-arr-green)"/>`,
      `<text x="${c(wallX + 60)}" y="${c(rodY - 46)}" text-anchor="start" font-size="13.5" font-weight="700" fill="#047857">R</text>`,
    );
  } else {
    // Vertical lift force F at outer end of hinged flap
    parts.push(
      `<line x1="${c(wirePx)}" y1="${c(rodY - 2)}" x2="${c(wirePx)}" y2="${c(rodY - 76)}" stroke="#1d4ed8" stroke-width="2.4" marker-end="url(#sf-arr-blue)"/>`,
      `<text x="${c(wirePx + 10)}" y="${c(rodY - 64)}" text-anchor="start" font-size="14" font-weight="700" fill="#1d4ed8">F</text>`,
      `<line x1="${c(wallX + 10)}" y1="${c(rodY - 2)}" x2="${c(wallX + 10)}" y2="${c(rodY - 62)}" stroke="#047857" stroke-width="2.2" marker-end="url(#sf-arr-green)"/>`,
      `<text x="${c(wallX + 20)}" y="${c(rodY - 52)}" text-anchor="start" font-size="13.5" font-weight="700" fill="#047857">R</text>`,
    );
  }

  // Bottom dimensions
  const lenLabel = `L = ${fmtCompact(L)} m`;
  publicLabels.push(lenLabel);
  parts.push(drawHorizontalDim(wallX, wallX + rodLenPx, 366, lenLabel, rodY + rodH));
  if (!shouldHideAny(hidden, ["cgFromHingeM"])) {
    const cgDistLabel = `${fmtCompact(xCg)} m`;
    publicNumbers.push(xCg);
    publicLabels.push(cgDistLabel);
    parts.push(drawHorizontalDim(wallX, cgPx, 332, cgDistLabel, rodY + rodH));
  }

  const title =
    mode === "hinged-flap-vertical-lift"
      ? "Wall-hinged horizontal flap supported by a vertical upward force"
      : "Wall-hinged horizontal rod supported by an angled wire";
  const desc =
    "Horizontal rod hinged at wall pin O with centre of gravity G, supporting wire tension T, and hinge reaction force R.";

  return {
    visualFamily: "mechanics_statics",
    svgMarkup: wrapSvg(width, height, title, desc, parts.join("")),
    rendererVersion: NCUK_STATICS_FLUIDS_RENDERER_VERSION,
    publicNumbers,
    publicLabels,
  };
}

/* ============================================================================
 * 4. MECHANICS: two-wire-suspended-bar
 * ============================================================================ */

type TwoWireMode = "vertical-wires" | "angled-wires" | "couple-torque";

function validateTwoWireBar(
  spec: Record<string, unknown>,
): DomainValidationResult {
  const issues: string[] = [];
  if (spec.kind !== "two-wire-suspended-bar") {
    issues.push('kind must be "two-wire-suspended-bar"');
  }
  const mode = (spec.mode ?? "vertical-wires") as string;
  if (
    mode !== "vertical-wires" &&
    mode !== "angled-wires" &&
    mode !== "couple-torque"
  ) {
    issues.push('mode must be "vertical-wires", "angled-wires", or "couple-torque"');
  }

  if (mode === "couple-torque") {
    const F = spec.coupleForceN;
    const d = spec.coupleSeparationM;
    const ang = spec.forceAngleDeg ?? 90;
    if (!isPositiveNum(F) || F > 50000) issues.push("coupleForceN must be in (0, 50000] N");
    if (!isPositiveNum(d) || d > 20) issues.push("coupleSeparationM must be in (0, 20] m");
    if (!isPositiveNum(ang) || ang < 20 || ang > 90) {
      issues.push("forceAngleDeg must be in [20, 90] degrees");
    }
    return { valid: issues.length === 0, issues };
  }

  const L = spec.barLengthM;
  const mBar = spec.barMassKg;
  const xCg = spec.cgFromLeftM;
  const xA = spec.wireAFromLeftM;
  const xB = spec.wireBFromLeftM;
  const extraM = spec.extraLoadMassKg ?? 0;
  const extraX = spec.extraLoadFromLeftM ?? xCg;
  const g = spec.gravityMs2 ?? NCUK_GRAVITY_MS2;

  if (!isPositiveNum(L) || L < 0.5 || L > 20) issues.push("barLengthM must be in [0.5, 20] m");
  if (!isPositiveNum(mBar) || mBar < 0.5 || mBar > 5000) {
    issues.push("barMassKg must be in [0.5, 5000] kg");
  }
  if (!isPositiveNum(g) || g < 1 || g > 25) issues.push("gravityMs2 must be in [1, 25] m s^-2");

  if (
    isPositiveNum(L) &&
    isNonNegativeNum(xA) &&
    isPositiveNum(xB) &&
    isPositiveNum(xCg)
  ) {
    if (xA >= xB - 0.15) issues.push("wireBFromLeftM must exceed wireAFromLeftM by >= 0.15 m");
    if (xB > L) issues.push("wireBFromLeftM must be <= barLengthM");
    if (xCg <= xA + 0.02 || xCg >= xB - 0.02) {
      issues.push("cgFromLeftM must lie strictly between wireAFromLeftM and wireBFromLeftM");
    }
    if (!isNonNegativeNum(extraM) || extraM > 5000) {
      issues.push("extraLoadMassKg must be in [0, 5000] kg");
    }
    if (isPositiveNum(extraM) && (!isNonNegativeNum(extraX) || extraX > L)) {
      issues.push("extraLoadFromLeftM must lie in [0, barLengthM]");
    }
    if (isPositiveNum(mBar) && isNonNegativeNum(extraM) && isPositiveNum(g)) {
      const tAVert =
        ((mBar * (xB - xCg) + extraM * (xB - (extraX as number))) * g) / (xB - xA);
      const tBVert = (mBar + extraM) * g - tAVert;
      if (tAVert <= 0.1 || tBVert <= 0.1) {
        issues.push("Both vertical wire tension components must be strictly positive");
      }
    }
  } else {
    issues.push("wireAFromLeftM, wireBFromLeftM, and cgFromLeftM must be finite numbers");
  }

  if (mode === "angled-wires") {
    const angleADeg = spec.angleADeg;
    if (!isPositiveNum(angleADeg) || angleADeg < 25 || angleADeg > 78) {
      issues.push("angleADeg must be in [25, 78] degrees for angled-wires mode");
    }
  }

  return { valid: issues.length === 0, issues };
}

function solveTwoWireBar(spec: Record<string, unknown>): DomainSolveOutput {
  const mode = (spec.mode ?? "vertical-wires") as TwoWireMode;

  if (mode === "couple-torque") {
    const F = spec.coupleForceN as number;
    const d = spec.coupleSeparationM as number;
    const forceAngleDeg = (spec.forceAngleDeg as number | undefined) ?? 90;
    const perpSepM = d * Math.sin((forceAngleDeg * Math.PI) / 180);
    const coupleTorqueNm = F * perpSepM;
    return {
      solverId: "ncuk-two-wire-suspended-bar-solver/1.0.0",
      quantities: {
        coupleForceN: F,
        coupleSeparationM: d,
        forceAngleDeg,
        perpendicularSeparationM: perpSepM,
        coupleTorqueNm,
        resultantForceN: 0,
        coupleDefinitionConcept:
          "two equal and opposite parallel forces whose lines of action do not coincide",
        coupleEquilibriumConcept:
          "zero resultant force but a non-zero resultant torque causing rotational motion",
        equilibriumConditionsConcept:
          "zero resultant force and zero resultant moment about any point",
      },
    };
  }

  const L = spec.barLengthM as number;
  const mBar = spec.barMassKg as number;
  const xCg = spec.cgFromLeftM as number;
  const xA = spec.wireAFromLeftM as number;
  const xB = spec.wireBFromLeftM as number;
  const extraM = (spec.extraLoadMassKg as number | undefined) ?? 0;
  const extraX = (spec.extraLoadFromLeftM as number | undefined) ?? xCg;
  const g = (spec.gravityMs2 as number | undefined) ?? NCUK_GRAVITY_MS2;

  const barWeightN = mBar * g;
  const extraLoadWeightN = extraM * g;
  const totalWeightN = barWeightN + extraLoadWeightN;
  const wireSpanM = xB - xA;
  const tensionAVerticalN =
    (barWeightN * (xB - xCg) + extraLoadWeightN * (xB - extraX)) / wireSpanM;
  const tensionBVerticalN = totalWeightN - tensionAVerticalN;

  let tensionAN = tensionAVerticalN;
  let tensionBN = tensionBVerticalN;
  let horizontalComponentN = 0;
  let angleADeg = 90;
  let angleBDeg = 90;

  if (mode === "angled-wires") {
    angleADeg = spec.angleADeg as number;
    const radA = (angleADeg * Math.PI) / 180;
    tensionAN = tensionAVerticalN / Math.sin(radA);
    horizontalComponentN = tensionAN * Math.cos(radA);
    tensionBN = Math.hypot(horizontalComponentN, tensionBVerticalN);
    angleBDeg = (Math.atan2(tensionBVerticalN, horizontalComponentN) * 180) / Math.PI;
  }

  const higherTensionWireConcept =
    Math.abs(tensionAN - tensionBN) / Math.max(tensionAN, tensionBN) < 0.01
      ? "both wires carry equal tension because the centre of gravity is midway between them"
      : tensionAN > tensionBN
        ? "wire A carries the greater tension because the centre of gravity is closer to wire A"
        : "wire B carries the greater tension because the centre of gravity is closer to wire B";

  return {
    solverId: "ncuk-two-wire-suspended-bar-solver/1.0.0",
    quantities: {
      barLengthM: L,
      barMassKg: mBar,
      cgFromLeftM: xCg,
      wireAFromLeftM: xA,
      wireBFromLeftM: xB,
      extraLoadMassKg: extraM,
      extraLoadFromLeftM: extraX,
      gravityMs2: g,
      barWeightN,
      extraLoadWeightN,
      totalWeightN,
      wireSpanM,
      tensionAVerticalN,
      tensionBVerticalN,
      horizontalComponentN,
      tensionAN,
      tensionBN,
      tensionRatioAB: tensionAN / tensionBN,
      angleADeg,
      angleBDeg,
      higherTensionWireConcept,
      equilibriumConditionsConcept:
        "zero resultant force and zero resultant moment about any point",
    },
  };
}

function renderTwoWireBarSvg(
  spec: Record<string, unknown>,
  options?: DomainRenderOptions,
): DomainRenderOutput {
  const mode = (spec.mode ?? "vertical-wires") as TwoWireMode;
  const solved = solveTwoWireBar(spec).quantities;
  const hidden = collectHiddenSet(spec, options);
  const width = 680;
  const height = 380;
  const publicNumbers: number[] = [];
  const publicLabels: string[] = [];
  const parts: string[] = [];

  if (mode === "couple-torque") {
    const F = solved.coupleForceN as number;
    const d = solved.coupleSeparationM as number;
    const ang = solved.forceAngleDeg as number;
    const cx = 340;
    const cy = 190;
    const halfLen = 148;
    const rad = (ang * Math.PI) / 180;

    // Bar & central pivot O
    parts.push(
      `<rect x="${c(cx - halfLen)}" y="${c(cy - 8)}" width="${c(halfLen * 2)}" height="16" rx="8" fill="#e2e8f0" stroke="#1e293b" stroke-width="2.2"/>`,
      `<circle cx="${c(cx)}" cy="${c(cy)}" r="7" fill="#ffffff" stroke="#1e293b" stroke-width="2.2"/>`,
      `<text x="${c(cx)}" y="${c(cy - 16)}" text-anchor="middle" font-size="13" font-weight="700" fill="#0f172a">O</text>`,
    );

    const arrowLen = 96;
    const dx = arrowLen * Math.cos(rad);
    const dy = arrowLen * Math.sin(rad);

    // Left end: force pointing up-right (or straight up if 90°)
    const lx = cx - halfLen + 8;
    const rx = cx + halfLen - 8;
    const hideF = shouldHideAny(hidden, ["coupleForceN"]);
    const fLabel = hideF ? "F" : `F = ${fmtCompact(F)} N`;
    if (!hideF) {
      publicNumbers.push(F);
      publicLabels.push(fLabel);
    }

    parts.push(
      `<line x1="${c(lx)}" y1="${c(cy)}" x2="${c(lx + dx)}" y2="${c(cy - dy)}" stroke="#b91c1c" stroke-width="2.6" marker-end="url(#sf-arr-red)"/>`,
      `<text x="${c(lx + dx - 8)}" y="${c(cy - dy - 10)}" text-anchor="middle" font-size="13" font-weight="700" fill="#b91c1c">${escapeXml(fLabel)}</text>`,
      `<line x1="${c(rx)}" y1="${c(cy)}" x2="${c(rx - dx)}" y2="${c(cy + dy)}" stroke="#1d4ed8" stroke-width="2.6" marker-end="url(#sf-arr-blue)"/>`,
      `<text x="${c(rx - dx + 8)}" y="${c(cy + dy + 18)}" text-anchor="middle" font-size="13" font-weight="700" fill="#1d4ed8">${escapeXml(fLabel)}</text>`,
    );

    if (ang < 89) {
      const angLabel = `${fmtCompact(ang)}°`;
      publicNumbers.push(ang);
      publicLabels.push(angLabel);
      const rArc = 34;
      parts.push(
        `<path d="M ${c(lx + rArc)} ${c(cy)} A ${rArc} ${rArc} 0 0 0 ${c(lx + rArc * Math.cos(rad))} ${c(cy - rArc * Math.sin(rad))}" fill="none" stroke="#b91c1c" stroke-width="1.6"/>`,
        `<text x="${c(lx + 46)}" y="${c(cy - 14)}" text-anchor="start" font-size="12.5" font-weight="700" fill="#b91c1c">${escapeXml(angLabel)}</text>`,
      );
    }

    const dLabel = `d = ${fmtCompact(d)} m`;
    publicNumbers.push(d);
    publicLabels.push(dLabel);
    parts.push(drawHorizontalDim(lx, rx, 326, dLabel, cy + 10));

    return {
      visualFamily: "mechanics_statics",
      svgMarkup: wrapSvg(
        width,
        height,
        "Rigid bar subjected to a torque couple",
        "Horizontal pivoted bar acted upon by two equal opposite parallel forces F separated by distance d.",
        parts.join(""),
      ),
      rendererVersion: NCUK_STATICS_FLUIDS_RENDERER_VERSION,
      publicNumbers,
      publicLabels,
    };
  }

  // Vertical or angled two-wire suspension
  const L = solved.barLengthM as number;
  const mBar = solved.barMassKg as number;
  const xCg = solved.cgFromLeftM as number;
  const xA = solved.wireAFromLeftM as number;
  const xB = solved.wireBFromLeftM as number;
  const extraM = solved.extraLoadMassKg as number;
  const extraX = solved.extraLoadFromLeftM as number;
  const angleADeg = solved.angleADeg as number;
  const angleBDeg = solved.angleBDeg as number;

  const barLeft = 96;
  const barRight = 584;
  const barSpanPx = barRight - barLeft;
  const ceilingY = 58;
  const barY = 210;
  const barH = 16;
  const toX = (m: number) => barLeft + (m / L) * barSpanPx;

  const aPx = toX(xA);
  const bPx = toX(xB);
  const cgPx = toX(xCg);

  publicNumbers.push(L, mBar);

  // Hatched ceiling
  parts.push(
    `<rect x="52" y="${c(ceilingY - 16)}" width="576" height="16" fill="url(#sf-hatch-ground)" stroke="none"/>`,
    `<line x1="52" y1="${c(ceilingY)}" x2="628" y2="${c(ceilingY)}" stroke="#1e293b" stroke-width="2.4"/>`,
  );

  // Ceiling wires
  const wireDrop = barY - ceilingY;
  const topAX =
    mode === "angled-wires"
      ? Math.max(66, aPx - Math.min(72, wireDrop / Math.tan((angleADeg * Math.PI) / 180) * 0.45))
      : aPx;
  const topBX =
    mode === "angled-wires"
      ? Math.min(614, bPx + Math.min(72, wireDrop / Math.tan((angleBDeg * Math.PI) / 180) * 0.45))
      : bPx;

  parts.push(
    `<line x1="${c(aPx)}" y1="${c(barY)}" x2="${c(topAX)}" y2="${c(ceilingY)}" stroke="#1d4ed8" stroke-width="2.3"/>`,
    `<line x1="${c(aPx + (topAX - aPx) * 0.25)}" y1="${c(barY - wireDrop * 0.25)}" x2="${c(aPx + (topAX - aPx) * 0.62)}" y2="${c(barY - wireDrop * 0.62)}" stroke="#1d4ed8" stroke-width="2.5" marker-end="url(#sf-arr-blue)"/>`,
    `<text x="${c((aPx + topAX) / 2 - 14)}" y="${c(barY - wireDrop * 0.52)}" text-anchor="end" font-size="14" font-weight="700" fill="#1d4ed8">T₁</text>`,
    `<line x1="${c(bPx)}" y1="${c(barY)}" x2="${c(topBX)}" y2="${c(ceilingY)}" stroke="#047857" stroke-width="2.3"/>`,
    `<line x1="${c(bPx + (topBX - bPx) * 0.25)}" y1="${c(barY - wireDrop * 0.25)}" x2="${c(bPx + (topBX - bPx) * 0.62)}" y2="${c(barY - wireDrop * 0.62)}" stroke="#047857" stroke-width="2.5" marker-end="url(#sf-arr-green)"/>`,
    `<text x="${c((bPx + topBX) / 2 + 14)}" y="${c(barY - wireDrop * 0.52)}" text-anchor="start" font-size="14" font-weight="700" fill="#047857">T₂</text>`,
  );

  if (mode === "angled-wires") {
    const aAngLabel = `${fmtCompact(angleADeg)}°`;
    publicNumbers.push(angleADeg);
    publicLabels.push(aAngLabel);
    parts.push(
      `<text x="${c(aPx - 14)}" y="${c(barY - 12)}" text-anchor="end" font-size="12.5" font-weight="700" fill="#1d4ed8">${escapeXml(aAngLabel)}</text>`,
    );
    if (!shouldHideAny(hidden, ["angleBDeg"])) {
      const bAngLabel = `${fmtCompact(angleBDeg)}°`;
      publicNumbers.push(angleBDeg);
      publicLabels.push(bAngLabel);
      parts.push(
        `<text x="${c(bPx + 14)}" y="${c(barY - 12)}" text-anchor="start" font-size="12.5" font-weight="700" fill="#047857">${escapeXml(bAngLabel)}</text>`,
      );
    } else {
      parts.push(
        `<text x="${c(bPx + 14)}" y="${c(barY - 12)}" text-anchor="start" font-size="12.5" font-weight="700" fill="#047857">θ₂</text>`,
      );
    }
  }

  // Horizontal bar & attachment dots C, E
  parts.push(
    `<rect x="${c(barLeft)}" y="${c(barY)}" width="${c(barSpanPx)}" height="${barH}" rx="2" fill="#e2e8f0" stroke="#1e293b" stroke-width="2.2"/>`,
    `<circle cx="${c(aPx)}" cy="${c(barY)}" r="4" fill="#1d4ed8"/>`,
    `<circle cx="${c(bPx)}" cy="${c(barY)}" r="4" fill="#047857"/>`,
    `<text x="${c(aPx)}" y="${c(barY + barH + 16)}" text-anchor="middle" font-size="12.5" font-weight="700" fill="#1d4ed8">A</text>`,
    `<text x="${c(bPx)}" y="${c(barY + barH + 16)}" text-anchor="middle" font-size="12.5" font-weight="700" fill="#047857">B</text>`,
  );

  // CG weight arrow
  const cgLabel = `G (${fmtCompact(mBar)} kg)`;
  publicLabels.push(cgLabel);
  parts.push(
    `<circle cx="${c(cgPx)}" cy="${c(barY + barH / 2)}" r="4.5" fill="#b91c1c" stroke="#ffffff" stroke-width="1.3"/>`,
    `<line x1="${c(cgPx)}" y1="${c(barY + barH + 2)}" x2="${c(cgPx)}" y2="${c(barY + barH + 56)}" stroke="#b91c1c" stroke-width="2.2" marker-end="url(#sf-arr-red)"/>`,
    `<text x="${c(cgPx)}" y="${c(barY + barH + 72)}" text-anchor="middle" font-size="12" font-weight="600" fill="#b91c1c">${escapeXml(cgLabel)}</text>`,
  );

  if (extraM > 0) {
    const exPx = toX(extraX);
    const exLabel = `${fmtCompact(extraM)} kg`;
    publicNumbers.push(extraM);
    publicLabels.push(exLabel);
    parts.push(
      `<line x1="${c(exPx)}" y1="${c(barY + barH)}" x2="${c(exPx)}" y2="${c(barY + barH + 22)}" stroke="#334155" stroke-width="1.8"/>`,
      `<rect x="${c(exPx - 20)}" y="${c(barY + barH + 22)}" width="40" height="24" rx="3" fill="#fef3c7" stroke="#92400e" stroke-width="1.8"/>`,
      `<text x="${c(exPx)}" y="${c(barY + barH + 38)}" text-anchor="middle" font-size="11" font-weight="700" fill="#92400e">${escapeXml(exLabel)}</text>`,
    );
  }

  // Bottom dimensions
  const spanLabel = `${fmtCompact(xB - xA)} m`;
  const lenLabel = `L = ${fmtCompact(L)} m`;
  publicNumbers.push(xB - xA);
  publicLabels.push(spanLabel, lenLabel);
  parts.push(
    drawHorizontalDim(aPx, bPx, 316, spanLabel, barY + barH + 18),
    drawHorizontalDim(barLeft, barRight, 352, lenLabel, barY + barH),
  );

  return {
    visualFamily: "mechanics_statics",
    svgMarkup: wrapSvg(
      width,
      height,
      "Horizontal bar suspended by two ceiling wires",
      "Horizontal rigid bar suspended from a ceiling by wires A and B with centre of gravity G and wire tension arrows T1 and T2.",
      parts.join(""),
    ),
    rendererVersion: NCUK_STATICS_FLUIDS_RENDERER_VERSION,
    publicNumbers,
    publicLabels,
  };
}

/* ============================================================================
 * 5. PURE-CALCULATION: alloy-composite-density
 * ============================================================================ */

type AlloyDensityMode =
  | "mass-fraction-alloy"
  | "volume-fraction-alloy"
  | "annular-washer"
  | "drawn-wire-remelt"
  | "sphere-density";

function validateAlloyDensity(
  spec: Record<string, unknown>,
): DomainValidationResult {
  const issues: string[] = [];
  if (spec.kind !== "alloy-composite-density") {
    issues.push('kind must be "alloy-composite-density"');
  }
  const mode = (spec.mode ?? "mass-fraction-alloy") as string;
  if (
    mode !== "mass-fraction-alloy" &&
    mode !== "volume-fraction-alloy" &&
    mode !== "annular-washer" &&
    mode !== "drawn-wire-remelt" &&
    mode !== "sphere-density"
  ) {
    issues.push("Unsupported mode for alloy-composite-density");
  }

  if (mode === "mass-fraction-alloy") {
    const r1 = spec.density1KgM3;
    const r2 = spec.density2KgM3;
    const m = spec.totalMassKg;
    const w1 = spec.massFraction1;
    if (!isPositiveNum(r1) || !isPositiveNum(r2)) {
      issues.push("density1KgM3 and density2KgM3 must be positive");
    } else if (Math.abs(r1 - r2) < 200) {
      issues.push("density1KgM3 and density2KgM3 must differ by at least 200 kg m^-3");
    }
    if (!isPositiveNum(m)) issues.push("totalMassKg must be positive");
    if (!isPositiveNum(w1) || w1 <= 0.05 || w1 >= 0.95) {
      issues.push("massFraction1 must lie in (0.05, 0.95)");
    }
  } else if (mode === "volume-fraction-alloy") {
    const r1 = spec.density1KgM3;
    const r2 = spec.density2KgM3;
    const f1 = spec.volumeFraction1;
    const lCm = spec.lengthCm;
    const wCm = spec.widthCm;
    const hCm = spec.heightCm;
    if (!isPositiveNum(r1) || !isPositiveNum(r2)) {
      issues.push("density1KgM3 and density2KgM3 must be positive");
    }
    if (!isPositiveNum(f1) || f1 <= 0.05 || f1 >= 0.95) {
      issues.push("volumeFraction1 must lie in (0.05, 0.95)");
    }
    if (!isPositiveNum(lCm) || !isPositiveNum(wCm) || !isPositiveNum(hCm)) {
      issues.push("lengthCm, widthCm, and heightCm must be positive");
    }
  } else if (mode === "annular-washer") {
    const dOut = spec.outerDiameterMm;
    const dIn = spec.innerDiameterMm;
    const h = spec.thicknessMm;
    const rho = spec.materialDensityKgM3;
    const frac = spec.fractionOfFullCircle ?? 1;
    if (!isPositiveNum(dOut) || !isPositiveNum(dIn) || dIn >= dOut) {
      issues.push("outerDiameterMm must be strictly greater than positive innerDiameterMm");
    }
    if (!isPositiveNum(h)) issues.push("thicknessMm must be positive");
    if (!isPositiveNum(rho)) issues.push("materialDensityKgM3 must be positive");
    if (!isPositiveNum(frac) || frac > 1) {
      issues.push("fractionOfFullCircle must lie in (0, 1]");
    }
  } else if (mode === "drawn-wire-remelt") {
    const m = spec.massKg;
    const rho = spec.materialDensityKgM3;
    const dWire = spec.wireDiameterMm;
    if (!isPositiveNum(m)) issues.push("massKg must be positive");
    if (!isPositiveNum(rho)) issues.push("materialDensityKgM3 must be positive");
    if (!isPositiveNum(dWire)) issues.push("wireDiameterMm must be positive");
  } else if (mode === "sphere-density") {
    const m = spec.massKg;
    const d = spec.diameterM;
    if (!isPositiveNum(m)) issues.push("massKg must be positive");
    if (!isPositiveNum(d)) issues.push("diameterM must be positive");
  }

  return { valid: issues.length === 0, issues };
}

function solveAlloyDensity(spec: Record<string, unknown>): DomainSolveOutput {
  const mode = (spec.mode ?? "mass-fraction-alloy") as AlloyDensityMode;
  const quantities: VerifiedQuantityMap = {
    densityDefinitionConcept: "mass per unit volume of a material",
    additiveVolumeAssumptionConcept:
      "the total volume of the alloy equals the sum of the separate constituent volumes with no volume change on mixing",
    volumeConservationAssumptionConcept:
      "density remains constant and no mass is lost when remelting or redrawing the metal",
  };

  if (mode === "mass-fraction-alloy") {
    const r1 = spec.density1KgM3 as number;
    const r2 = spec.density2KgM3 as number;
    const totalMassKg = spec.totalMassKg as number;
    const w1 = spec.massFraction1 as number;
    const w2 = 1 - w1;
    const mass1Kg = totalMassKg * w1;
    const mass2Kg = totalMassKg * w2;
    const volume1M3 = mass1Kg / r1;
    const volume2M3 = mass2Kg / r2;
    const totalVolumeM3 = volume1M3 + volume2M3;
    const totalVolumeCm3 = totalVolumeM3 * 1e6;
    const alloyDensityKgM3 = totalMassKg / totalVolumeM3;
    const alloyDensityGCm3 = alloyDensityKgM3 / 1000;
    const naiveArithmeticDensityKgM3 = w1 * r1 + w2 * r2;
    Object.assign(quantities, {
      density1KgM3: r1,
      density2KgM3: r2,
      totalMassKg,
      massFraction1: w1,
      mass1Kg,
      mass2Kg,
      volume1M3,
      volume2M3,
      totalVolumeM3,
      totalVolumeCm3,
      alloyDensityKgM3,
      alloyDensityGCm3,
      naiveArithmeticDensityKgM3,
    });
  } else if (mode === "volume-fraction-alloy") {
    const r1 = spec.density1KgM3 as number;
    const r2 = spec.density2KgM3 as number;
    const f1 = spec.volumeFraction1 as number;
    const f2 = 1 - f1;
    const lengthCm = spec.lengthCm as number;
    const widthCm = spec.widthCm as number;
    const heightCm = spec.heightCm as number;
    const totalVolumeCm3 = lengthCm * widthCm * heightCm;
    const totalVolumeM3 = totalVolumeCm3 * 1e-6;
    const volume1M3 = totalVolumeM3 * f1;
    const volume2M3 = totalVolumeM3 * f2;
    const mass1Kg = r1 * volume1M3;
    const mass2Kg = r2 * volume2M3;
    const totalMassKg = mass1Kg + mass2Kg;
    const totalMassG = totalMassKg * 1000;
    const alloyDensityKgM3 = totalMassKg / totalVolumeM3;
    const alloyDensityGCm3 = alloyDensityKgM3 / 1000;
    const naiveHarmonicDensityKgM3 = 1 / (f1 / r1 + f2 / r2);
    Object.assign(quantities, {
      density1KgM3: r1,
      density2KgM3: r2,
      volumeFraction1: f1,
      lengthCm,
      widthCm,
      heightCm,
      totalVolumeCm3,
      totalVolumeM3,
      volume1M3,
      volume2M3,
      mass1Kg,
      mass2Kg,
      totalMassKg,
      totalMassG,
      alloyDensityKgM3,
      alloyDensityGCm3,
      naiveHarmonicDensityKgM3,
    });
  } else if (mode === "annular-washer") {
    const dOutMm = spec.outerDiameterMm as number;
    const dInMm = spec.innerDiameterMm as number;
    const thickMm = spec.thicknessMm as number;
    const rho = spec.materialDensityKgM3 as number;
    const frac = (spec.fractionOfFullCircle as number | undefined) ?? 1;
    const outerRadiusM = (dOutMm * 1e-3) / 2;
    const innerRadiusM = (dInMm * 1e-3) / 2;
    const thicknessM = thickMm * 1e-3;
    const crossSectionAreaM2 =
      frac * Math.PI * (outerRadiusM ** 2 - innerRadiusM ** 2);
    const volumeM3 = crossSectionAreaM2 * thicknessM;
    const volumeCm3 = volumeM3 * 1e6;
    const massKg = rho * volumeM3;
    const massG = massKg * 1000;
    Object.assign(quantities, {
      outerDiameterMm: dOutMm,
      innerDiameterMm: dInMm,
      thicknessMm: thickMm,
      materialDensityKgM3: rho,
      fractionOfFullCircle: frac,
      crossSectionAreaM2,
      volumeM3,
      volumeCm3,
      massKg,
      massG,
    });
  } else if (mode === "drawn-wire-remelt") {
    const massKg = spec.massKg as number;
    const rho = spec.materialDensityKgM3 as number;
    const wireDiameterMm = spec.wireDiameterMm as number;
    const volumeM3 = massKg / rho;
    const volumeCm3 = volumeM3 * 1e6;
    const wireRadiusM = (wireDiameterMm * 1e-3) / 2;
    const wireCrossSectionAreaM2 = Math.PI * wireRadiusM ** 2;
    const wireLengthM = volumeM3 / wireCrossSectionAreaM2;
    const cubeEdgeM = Math.cbrt(volumeM3);
    const cubeEdgeCm = cubeEdgeM * 100;
    Object.assign(quantities, {
      massKg,
      materialDensityKgM3: rho,
      wireDiameterMm,
      volumeM3,
      volumeCm3,
      wireCrossSectionAreaM2,
      wireLengthM,
      cubeEdgeM,
      cubeEdgeCm,
    });
  } else {
    const massKg = spec.massKg as number;
    const diameterM = spec.diameterM as number;
    const radiusM = diameterM / 2;
    const volumeM3 = (4 / 3) * Math.PI * radiusM ** 3;
    const densityKgM3 = massKg / volumeM3;
    const densityGCm3 = densityKgM3 / 1000;
    Object.assign(quantities, {
      massKg,
      diameterM,
      radiusM,
      volumeM3,
      densityKgM3,
      densityGCm3,
    });
  }

  return {
    solverId: "ncuk-alloy-composite-density-solver/1.0.0",
    quantities,
  };
}

/* ============================================================================
 * 6. PURE-CALCULATION: hydrostatic-pressure-base-force
 * ============================================================================ */

type HydrostaticCalcMode =
  | "tank-base-force"
  | "archimedes-buoyancy"
  | "solution-concentration";

function validateHydrostaticCalc(
  spec: Record<string, unknown>,
): DomainValidationResult {
  const issues: string[] = [];
  if (spec.kind !== "hydrostatic-pressure-base-force") {
    issues.push('kind must be "hydrostatic-pressure-base-force"');
  }
  const mode = (spec.mode ?? "tank-base-force") as string;
  if (
    mode !== "tank-base-force" &&
    mode !== "archimedes-buoyancy" &&
    mode !== "solution-concentration"
  ) {
    issues.push("Unsupported mode for hydrostatic-pressure-base-force");
  }

  const g = spec.gravityMs2 ?? NCUK_GRAVITY_MS2;
  if (!isPositiveNum(g) || g < 1 || g > 25) {
    issues.push("gravityMs2 must be in [1, 25] m s^-2");
  }

  if (mode === "tank-base-force") {
    if (!isPositiveNum(spec.fluidDensityKgM3)) {
      issues.push("fluidDensityKgM3 must be positive");
    }
    if (!isPositiveNum(spec.depthM)) issues.push("depthM must be positive");
    if (!isPositiveNum(spec.baseAreaM2)) issues.push("baseAreaM2 must be positive");
    const pAtm = spec.atmosphericPressurePa ?? NCUK_ATMOSPHERIC_PRESSURE_PA;
    if (!isNonNegativeNum(pAtm)) {
      issues.push("atmosphericPressurePa must be non-negative");
    }
  } else if (mode === "archimedes-buoyancy") {
    if (!isPositiveNum(spec.fluidDensityKgM3)) {
      issues.push("fluidDensityKgM3 must be positive");
    }
    if (!isPositiveNum(spec.objectMassKg)) {
      issues.push("objectMassKg must be positive");
    }
    if (!isPositiveNum(spec.objectDensityKgM3)) {
      issues.push("objectDensityKgM3 must be positive");
    }
  } else if (mode === "solution-concentration") {
    const p = spec.soluteMassPercent;
    if (!isPositiveNum(p) || p >= 60) {
      issues.push("soluteMassPercent must lie in (0, 60)");
    }
    if (!isPositiveNum(spec.solutionDensityKgM3)) {
      issues.push("solutionDensityKgM3 must be positive");
    }
    if (!isPositiveNum(spec.targetSoluteMassKg)) {
      issues.push("targetSoluteMassKg must be positive");
    }
  }

  return { valid: issues.length === 0, issues };
}

function solveHydrostaticCalc(
  spec: Record<string, unknown>,
): DomainSolveOutput {
  const mode = (spec.mode ?? "tank-base-force") as HydrostaticCalcMode;
  const g = (spec.gravityMs2 as number | undefined) ?? NCUK_GRAVITY_MS2;
  const quantities: VerifiedQuantityMap = {
    gravityMs2: g,
    pressureDefinitionConcept: "normal force per unit cross-sectional area",
    hydrostaticOriginConcept:
      "pressure in a static fluid increases linearly with depth because of the weight of the fluid column above",
    archimedesPrincipleConcept:
      "the upward buoyancy force equals the weight of fluid displaced by the body",
  };

  if (mode === "tank-base-force") {
    const rho = spec.fluidDensityKgM3 as number;
    const h = spec.depthM as number;
    const A = spec.baseAreaM2 as number;
    const pAtm =
      (spec.atmosphericPressurePa as number | undefined) ??
      NCUK_ATMOSPHERIC_PRESSURE_PA;
    const gaugePressurePa = rho * g * h;
    const gaugePressureKPa = gaugePressurePa / 1e3;
    const absolutePressurePa = pAtm + gaugePressurePa;
    const absolutePressureKPa = absolutePressurePa / 1e3;
    const gaugeForceN = gaugePressurePa * A;
    const totalBaseForceN = absolutePressurePa * A;
    const totalBaseForceKN = totalBaseForceN / 1e3;
    Object.assign(quantities, {
      fluidDensityKgM3: rho,
      depthM: h,
      baseAreaM2: A,
      atmosphericPressurePa: pAtm,
      gaugePressurePa,
      gaugePressureKPa,
      absolutePressurePa,
      absolutePressureKPa,
      gaugeForceN,
      totalBaseForceN,
      totalBaseForceKN,
    });
  } else if (mode === "archimedes-buoyancy") {
    const rhoFluid = spec.fluidDensityKgM3 as number;
    const mObj = spec.objectMassKg as number;
    const rhoObj = spec.objectDensityKgM3 as number;
    const objectVolumeM3 = mObj / rhoObj;
    const objectVolumeCm3 = objectVolumeM3 * 1e6;
    const objectWeightN = mObj * g;
    const sinks = rhoObj > rhoFluid;
    const floatingSubmergedFraction = sinks ? 1 : rhoObj / rhoFluid;
    const submergedVolumeM3 = objectVolumeM3 * floatingSubmergedFraction;
    const upthrustN = rhoFluid * submergedVolumeM3 * g;
    const apparentWeightN = sinks ? objectWeightN - upthrustN : 0;
    const buoyancyOutcomeConcept = sinks
      ? "the object sinks because its weight is greater than the maximum upthrust"
      : "the object floats with the weight of displaced fluid equal to its total weight";
    Object.assign(quantities, {
      fluidDensityKgM3: rhoFluid,
      objectMassKg: mObj,
      objectDensityKgM3: rhoObj,
      objectVolumeM3,
      objectVolumeCm3,
      objectWeightN,
      floatingSubmergedFraction,
      floatingSubmergedPercent: floatingSubmergedFraction * 100,
      submergedVolumeM3,
      upthrustN,
      apparentWeightN,
      buoyancyOutcomeConcept,
    });
  } else {
    const solutePct = spec.soluteMassPercent as number;
    const rhoSol = spec.solutionDensityKgM3 as number;
    const targetSoluteKg = spec.targetSoluteMassKg as number;
    const solutionMassKg = targetSoluteKg / (solutePct / 100);
    const solutionVolumeM3 = solutionMassKg / rhoSol;
    const solutionVolumeL = solutionVolumeM3 * 1000;
    const soluteConcentrationKgM3 = (solutePct / 100) * rhoSol;
    Object.assign(quantities, {
      soluteMassPercent: solutePct,
      solutionDensityKgM3: rhoSol,
      targetSoluteMassKg: targetSoluteKg,
      solutionMassKg,
      solutionVolumeM3,
      solutionVolumeL,
      soluteConcentrationKgM3,
    });
  }

  return {
    solverId: "ncuk-hydrostatic-pressure-base-force-solver/1.0.0",
    quantities,
  };
}

/* ============================================================================
 * 7. THERMAL: hydrostatic-tank-brownian (visual: layered tank, U-tube,
 *    particle states, and Brownian smoke-cell random walk)
 * ============================================================================ */

type HydrostaticTankBrownianMode =
  | "layered-tank"
  | "u-tube-manometer"
  | "particle-states"
  | "brownian-smoke-cell";

function validateHydrostaticTankBrownian(
  spec: Record<string, unknown>,
): DomainValidationResult {
  const issues: string[] = [];
  if (spec.kind !== "hydrostatic-tank-brownian") {
    issues.push('kind must be "hydrostatic-tank-brownian"');
  }
  const mode = (spec.mode ?? "layered-tank") as string;
  if (
    mode !== "layered-tank" &&
    mode !== "u-tube-manometer" &&
    mode !== "particle-states" &&
    mode !== "brownian-smoke-cell"
  ) {
    issues.push(
      'mode must be "layered-tank", "u-tube-manometer", "particle-states", or "brownian-smoke-cell"',
    );
  }

  if (mode === "layered-tank") {
    const r1 = spec.upperDensityKgM3;
    const r2 = spec.lowerDensityKgM3;
    const h1 = spec.upperDepthM;
    const h2 = spec.lowerDepthM;
    const g = spec.gravityMs2 ?? NCUK_GRAVITY_MS2;
    if (!isPositiveNum(r1) || !isPositiveNum(r2) || r2 <= r1) {
      issues.push("lowerDensityKgM3 must be strictly greater than positive upperDensityKgM3");
    }
    if (!isPositiveNum(h1) || !isPositiveNum(h2)) {
      issues.push("upperDepthM and lowerDepthM must be positive");
    }
    if (!isPositiveNum(g) || g < 1 || g > 25) {
      issues.push("gravityMs2 must be in [1, 25] m s^-2");
    }
    if (spec.baseAreaM2 !== undefined && !isPositiveNum(spec.baseAreaM2)) {
      issues.push("baseAreaM2 must be positive when provided");
    }
  } else if (mode === "u-tube-manometer") {
    const rDense = spec.denseDensityKgM3;
    const hLight = spec.lightColumnHeightM;
    const solveFor = (spec.solveFor ?? "light-density") as string;
    const g = spec.gravityMs2 ?? NCUK_GRAVITY_MS2;
    if (!isPositiveNum(rDense)) issues.push("denseDensityKgM3 must be positive");
    if (!isPositiveNum(hLight)) issues.push("lightColumnHeightM must be positive");
    if (!isPositiveNum(g) || g < 1 || g > 25) issues.push("gravityMs2 must be in [1, 25] m s^-2");
    if (solveFor === "light-density") {
      const hDense = spec.denseColumnHeightM;
      if (!isPositiveNum(hDense) || (isPositiveNum(hLight) && hDense >= hLight)) {
        issues.push(
          "denseColumnHeightM must be positive and strictly less than lightColumnHeightM",
        );
      }
    } else if (solveFor === "dense-height") {
      const rLight = spec.lightDensityKgM3;
      if (!isPositiveNum(rLight) || (isPositiveNum(rDense) && rLight >= rDense)) {
        issues.push(
          "lightDensityKgM3 must be positive and strictly less than denseDensityKgM3",
        );
      }
    } else {
      issues.push('solveFor must be "light-density" or "dense-height"');
    }
  } else if (mode === "particle-states") {
    const labelsMode = (spec.panelLabelsMode ?? "named") as string;
    if (labelsMode !== "named" && labelsMode !== "anonymous") {
      issues.push('panelLabelsMode must be "named" or "anonymous"');
    }
  } else if (mode === "brownian-smoke-cell") {
    const medium = (spec.fluidMedium ?? "air") as string;
    if (medium !== "air" && medium !== "water") {
      issues.push('fluidMedium must be "air" or "water"');
    }
  }

  return { valid: issues.length === 0, issues };
}

function solveHydrostaticTankBrownian(
  spec: Record<string, unknown>,
): DomainSolveOutput {
  const mode = (spec.mode ?? "layered-tank") as HydrostaticTankBrownianMode;

  if (mode === "layered-tank") {
    const r1 = spec.upperDensityKgM3 as number;
    const r2 = spec.lowerDensityKgM3 as number;
    const h1 = spec.upperDepthM as number;
    const h2 = spec.lowerDepthM as number;
    const baseAreaM2 = (spec.baseAreaM2 as number | undefined) ?? 1.0;
    const pAtm =
      (spec.atmosphericPressurePa as number | undefined) ??
      NCUK_ATMOSPHERIC_PRESSURE_PA;
    const g = (spec.gravityMs2 as number | undefined) ?? NCUK_GRAVITY_MS2;

    const upperLayerPressurePa = r1 * g * h1;
    const lowerLayerPressurePa = r2 * g * h2;
    const totalGaugePressurePa = upperLayerPressurePa + lowerLayerPressurePa;
    const interfaceAbsolutePressurePa = pAtm + upperLayerPressurePa;
    const bottomAbsolutePressurePa = pAtm + totalGaugePressurePa;
    const bottomAbsolutePressureKPa = bottomAbsolutePressurePa / 1e3;
    const totalBaseForceN = bottomAbsolutePressurePa * baseAreaM2;
    const totalBaseForceKN = totalBaseForceN / 1e3;

    return {
      solverId: "ncuk-hydrostatic-tank-brownian-solver/1.0.0",
      quantities: {
        upperDensityKgM3: r1,
        lowerDensityKgM3: r2,
        upperDepthM: h1,
        lowerDepthM: h2,
        baseAreaM2,
        atmosphericPressurePa: pAtm,
        gravityMs2: g,
        upperLayerPressurePa,
        lowerLayerPressurePa,
        totalGaugePressurePa,
        interfaceAbsolutePressurePa,
        bottomAbsolutePressurePa,
        bottomAbsolutePressureKPa,
        totalBaseForceN,
        totalBaseForceKN,
        immiscibleLayerOrderingConcept:
          "the less dense liquid floats on top of the denser immiscible liquid",
      },
    };
  }

  if (mode === "u-tube-manometer") {
    const rDense = spec.denseDensityKgM3 as number;
    const hLight = spec.lightColumnHeightM as number;
    const solveFor = (spec.solveFor as string | undefined) ?? "light-density";
    const g = (spec.gravityMs2 as number | undefined) ?? NCUK_GRAVITY_MS2;

    const rLight =
      solveFor === "light-density"
        ? (rDense * (spec.denseColumnHeightM as number)) / hLight
        : (spec.lightDensityKgM3 as number);
    const hDense =
      solveFor === "light-density"
        ? (spec.denseColumnHeightM as number)
        : (rLight * hLight) / rDense;

    const interfaceGaugePressurePa = rDense * g * hDense;
    const heightDifferenceM = hLight - hDense;

    return {
      solverId: "ncuk-hydrostatic-tank-brownian-solver/1.0.0",
      quantities: {
        denseDensityKgM3: rDense,
        lightDensityKgM3: rLight,
        lightColumnHeightM: hLight,
        denseColumnHeightM: hDense,
        gravityMs2: g,
        interfaceGaugePressurePa,
        heightDifferenceM,
        equalLevelPrincipleConcept:
          "pressures are equal at the same horizontal level within a continuous static liquid",
      },
    };
  }

  if (mode === "particle-states") {
    return {
      solverId: "ncuk-hydrostatic-tank-brownian-solver/1.0.0",
      quantities: {
        solidArrangementConcept:
          "particles are closely packed in a regular fixed lattice and vibrate about fixed positions",
        liquidArrangementConcept:
          "particles are closely packed in an irregular arrangement and can slide past one another",
        gasArrangementConcept:
          "particles are widely spaced and move rapidly and randomly in all directions with negligible intermolecular forces",
        gasCompressibilityConcept:
          "large empty spaces between widely separated molecules allow the gas volume to decrease easily under pressure",
        stateWithFixedVolumeNoFixedShape: "liquid",
        stateWithFixedShapeAndVolume: "solid",
        stateThatFillsContainer: "gas",
        anonymousMiddlePanelState: "liquid",
        anonymousRightPanelState: "gas",
        anonymousLeftPanelState: "solid",
      },
    };
  }

  // brownian-smoke-cell
  const medium = (spec.fluidMedium as string | undefined) ?? "air";
  const moleculeWord = medium === "water" ? "water molecules" : "air molecules";
  return {
    solverId: "ncuk-hydrostatic-tank-brownian-solver/1.0.0",
    quantities: {
      fluidMedium: medium,
      brownianObservationConcept:
        "bright specks move continuously along erratic irregular jagged random paths",
      brownianCauseConcept: `uneven rapid random collisions by much smaller invisible moving ${moleculeWord} transferring momentum to the suspended speck`,
      brownianEvidenceConcept:
        "direct experimental evidence that fluid molecules are in continuous random thermal motion",
      brownianTemperatureEffectConcept:
        "higher temperature increases average molecular speed so collisions become more frequent and vigorous and the erratic motion becomes faster",
      brownianSizeComparisonConcept:
        "fluid molecules are much smaller and move much faster than the visible suspended smoke specks",
    },
  };
}

function renderHydrostaticTankBrownianSvg(
  spec: Record<string, unknown>,
  options?: DomainRenderOptions,
): DomainRenderOutput {
  const mode = (spec.mode ?? "layered-tank") as HydrostaticTankBrownianMode;
  const solved = solveHydrostaticTankBrownian(spec).quantities;
  const hidden = collectHiddenSet(spec, options);
  const width = 680;
  const height = 390;
  const publicNumbers: number[] = [];
  const publicLabels: string[] = [];
  const parts: string[] = [];

  if (mode === "layered-tank") {
    const r1 = solved.upperDensityKgM3 as number;
    const r2 = solved.lowerDensityKgM3 as number;
    const h1 = solved.upperDepthM as number;
    const h2 = solved.lowerDepthM as number;
    const totalH = h1 + h2;

    const tankX = 168;
    const tankW = 280;
    const tankTopY = 74;
    const tankBotY = 326;
    const liquidTopY = 104;
    const liquidSpan = tankBotY - liquidTopY;
    const upperPx = Math.max(58, Math.min(liquidSpan - 58, (h1 / totalH) * liquidSpan));
    const interfaceY = liquidTopY + upperPx;

    // Upper oil layer (amber tint) + lower water/brine layer (blue tint)
    parts.push(
      `<rect x="${tankX}" y="${c(liquidTopY)}" width="${tankW}" height="${c(interfaceY - liquidTopY)}" fill="#fef3c7" stroke="none"/>`,
      `<rect x="${tankX}" y="${c(interfaceY)}" width="${tankW}" height="${c(tankBotY - interfaceY)}" fill="#dbeafe" stroke="none"/>`,
      `<line x1="${tankX}" y1="${c(liquidTopY)}" x2="${tankX + tankW}" y2="${c(liquidTopY)}" stroke="#b45309" stroke-width="2"/>`,
      `<line x1="${tankX}" y1="${c(interfaceY)}" x2="${tankX + tankW}" y2="${c(interfaceY)}" stroke="#1d4ed8" stroke-width="1.8" stroke-dasharray="6 4"/>`,
      // Open tank walls
      `<polyline points="${tankX},${tankTopY} ${tankX},${tankBotY} ${tankX + tankW},${tankBotY} ${tankX + tankW},${tankTopY}" fill="none" stroke="#1e293b" stroke-width="3"/>`,
      // Atmospheric pressure arrow at top
      `<line x1="${c(tankX + tankW / 2)}" y1="44" x2="${c(tankX + tankW / 2)}" y2="${c(liquidTopY - 6)}" stroke="#475569" stroke-width="2" marker-end="url(#sf-arr-slate)"/>`,
      `<text x="${c(tankX + tankW / 2 + 10)}" y="68" text-anchor="start" font-size="13" font-weight="700" fill="#334155">p₀ (atmosphere)</text>`,
    );

    const upperLabel = `ρ₁ = ${fmtCompact(r1)} kg m⁻³`;
    const lowerLabel = `ρ₂ = ${fmtCompact(r2)} kg m⁻³`;
    publicNumbers.push(r1, r2, h1, h2);
    publicLabels.push(upperLabel, lowerLabel);

    parts.push(
      `<text x="${c(tankX + tankW / 2)}" y="${c((liquidTopY + interfaceY) / 2 + 4)}" text-anchor="middle" font-size="13" font-weight="700" fill="#92400e">${escapeXml(upperLabel)}</text>`,
      `<text x="${c(tankX + tankW / 2)}" y="${c((interfaceY + tankBotY) / 2 + 4)}" text-anchor="middle" font-size="13" font-weight="700" fill="#1e3a8a">${escapeXml(lowerLabel)}</text>`,
      // Interface point X and base point Y
      `<circle cx="${c(tankX + 34)}" cy="${c(interfaceY)}" r="4.5" fill="#1e293b"/>`,
      `<text x="${c(tankX + 20)}" y="${c(interfaceY + 4)}" text-anchor="end" font-size="13" font-weight="700" fill="#0f172a">X</text>`,
      `<circle cx="${c(tankX + 34)}" cy="${c(tankBotY - 5)}" r="4.5" fill="#b91c1c"/>`,
      `<text x="${c(tankX + 20)}" y="${c(tankBotY - 2)}" text-anchor="end" font-size="13" font-weight="700" fill="#b91c1c">Y</text>`,
    );

    const h1Label = `h₁ = ${fmtCompact(h1)} m`;
    const h2Label = `h₂ = ${fmtCompact(h2)} m`;
    publicLabels.push(h1Label, h2Label);
    parts.push(
      drawVerticalDim(tankX + tankW + 24, liquidTopY, interfaceY, h1Label, "right"),
      drawVerticalDim(tankX + tankW + 24, interfaceY, tankBotY, h2Label, "right"),
      `<text x="${c(tankX + tankW / 2)}" y="${c(tankBotY + 26)}" text-anchor="middle" font-size="12.5" font-weight="600" fill="#334155">Tank base</text>`,
    );

    return {
      visualFamily: "thermal_hydrostatics",
      svgMarkup: wrapSvg(
        width,
        height,
        "Open tank containing two immiscible liquid layers",
        "Cutaway open hydrostatic tank with upper liquid layer rho1 of depth h1 resting above denser liquid layer rho2 of depth h2.",
        parts.join(""),
      ),
      rendererVersion: NCUK_STATICS_FLUIDS_RENDERER_VERSION,
      publicNumbers,
      publicLabels,
    };
  }

  if (mode === "u-tube-manometer") {
    const rDense = solved.denseDensityKgM3 as number;
    const rLight = solved.lightDensityKgM3 as number;
    const hLight = solved.lightColumnHeightM as number;
    const hDense = solved.denseColumnHeightM as number;

    const leftCx = 240;
    const rightCx = 440;
    const tubeHalf = 22;
    const topY = 66;
    const bendY = 300;
    const datumY = 264;
    const maxColPx = 166;
    const lightTopY = datumY - maxColPx;
    const denseTopY = datumY - Math.max(46, Math.min(maxColPx - 28, (hDense / hLight) * maxColPx));

    // Fill liquids inside U-tube arms
    parts.push(
      // Lower U-bend + right dense column
      `<path d="M ${leftCx - tubeHalf} ${datumY} L ${leftCx - tubeHalf} ${bendY} A 122 64 0 0 0 ${rightCx + tubeHalf} ${bendY} L ${rightCx + tubeHalf} ${c(denseTopY)} L ${rightCx - tubeHalf} ${c(denseTopY)} L ${rightCx - tubeHalf} ${bendY} A 78 36 0 0 1 ${leftCx + tubeHalf} ${bendY} L ${leftCx + tubeHalf} ${datumY} Z" fill="#bfdbfe" stroke="none"/>`,
      // Left lighter liquid column above datum
      `<rect x="${leftCx - tubeHalf}" y="${c(lightTopY)}" width="${tubeHalf * 2}" height="${c(datumY - lightTopY)}" fill="#fde68a" stroke="none"/>`,
      // Glass U-tube outline
      `<path d="M ${leftCx - tubeHalf} ${topY} L ${leftCx - tubeHalf} ${bendY} A 122 64 0 0 0 ${rightCx + tubeHalf} ${bendY} L ${rightCx + tubeHalf} ${topY}" fill="none" stroke="#1e293b" stroke-width="2.6"/>`,
      `<path d="M ${leftCx + tubeHalf} ${topY} L ${leftCx + tubeHalf} ${bendY} A 78 36 0 0 1 ${rightCx - tubeHalf} ${bendY} L ${rightCx - tubeHalf} ${topY}" fill="none" stroke="#1e293b" stroke-width="2.6"/>`,
      // Horizontal reference datum P--Q
      `<line x1="158" y1="${datumY}" x2="522" y2="${datumY}" stroke="#b91c1c" stroke-width="1.6" stroke-dasharray="6 4"/>`,
      `<circle cx="${leftCx}" cy="${datumY}" r="4" fill="#b91c1c"/>`,
      `<circle cx="${rightCx}" cy="${datumY}" r="4" fill="#b91c1c"/>`,
      `<text x="${leftCx}" y="${datumY + 18}" text-anchor="middle" font-size="12.5" font-weight="700" fill="#b91c1c">P</text>`,
      `<text x="${rightCx}" y="${datumY + 18}" text-anchor="middle" font-size="12.5" font-weight="700" fill="#b91c1c">Q</text>`,
      // Open-top labels
      `<text x="${leftCx}" y="${topY - 10}" text-anchor="middle" font-size="12" font-weight="600" fill="#475569">Open (p₀)</text>`,
      `<text x="${rightCx}" y="${topY - 10}" text-anchor="middle" font-size="12" font-weight="600" fill="#475569">Open (p₀)</text>`,
    );

    const hideLightRho = shouldHideAny(hidden, ["lightDensityKgM3"]);
    const lightRhoLabel = hideLightRho ? "ρ₁ = ?" : `ρ₁ = ${fmtCompact(rLight)} kg m⁻³`;
    if (!hideLightRho) {
      publicNumbers.push(rLight);
      publicLabels.push(lightRhoLabel);
    }
    const denseRhoLabel = `ρ₂ = ${fmtCompact(rDense)} kg m⁻³`;
    publicNumbers.push(rDense);
    publicLabels.push(denseRhoLabel);

    parts.push(
      `<text x="${leftCx - 46}" y="${c(lightTopY - 8)}" text-anchor="end" font-size="12" font-weight="700" fill="#92400e">${escapeXml(lightRhoLabel)}</text>`,
      `<text x="${rightCx + 46}" y="${c(denseTopY - 8)}" text-anchor="start" font-size="12" font-weight="700" fill="#1e3a8a">${escapeXml(denseRhoLabel)}</text>`,
    );

    const h1Label = `h₁ = ${fmtCompact(hLight)} m`;
    publicNumbers.push(hLight);
    publicLabels.push(h1Label);
    parts.push(drawVerticalDim(leftCx - 44, lightTopY, datumY, h1Label, "left"));

    const hideDenseH = shouldHideAny(hidden, ["denseColumnHeightM", "heightDifferenceM"]);
    const h2Label = hideDenseH ? "h₂ = ?" : `h₂ = ${fmtCompact(hDense)} m`;
    if (!hideDenseH) {
      publicNumbers.push(hDense);
      publicLabels.push(h2Label);
    }
    parts.push(drawVerticalDim(rightCx + 44, denseTopY, datumY, h2Label, "right"));

    return {
      visualFamily: "thermal_hydrostatics",
      svgMarkup: wrapSvg(
        width,
        height,
        "Open U-tube containing two immiscible liquids in hydrostatic balance",
        "Open glass U-tube with lighter liquid column h1 in the left arm balancing denser liquid column h2 in the right arm above horizontal datum P to Q.",
        parts.join(""),
      ),
      rendererVersion: NCUK_STATICS_FLUIDS_RENDERER_VERSION,
      publicNumbers,
      publicLabels,
    };
  }

  if (mode === "particle-states") {
    const anonymous = (spec.panelLabelsMode ?? "named") === "anonymous";
    const labels = anonymous
      ? ["State X", "State Y", "State Z"]
      : ["Solid", "Liquid", "Gas"];
    const boxW = 172;
    const boxH = 196;
    const topY = 92;
    const xs = [46, 254, 462];
    const rng = seededPrng(Number(spec.seed ?? 7101));

    // Panel titles & frames
    for (let i = 0; i < 3; i += 1) {
      parts.push(
        `<rect x="${xs[i]}" y="${topY}" width="${boxW}" height="${boxH}" rx="10" fill="#f8fafc" stroke="#334155" stroke-width="2.2"/>`,
        `<text x="${c(xs[i] + boxW / 2)}" y="${topY - 14}" text-anchor="middle" font-size="14" font-weight="700" fill="#0f172a">${escapeXml(labels[i])}</text>`,
      );
    }

    // Panel 1: Solid (regular 5 x 5 close-packed lattice)
    const r = 11.5;
    for (let row = 0; row < 5; row += 1) {
      for (let col = 0; col < 5; col += 1) {
        const px = xs[0] + 34 + col * 26;
        const py = topY + 56 + row * 26;
        parts.push(
          `<circle cx="${c(px)}" cy="${c(py)}" r="${r}" fill="#3b82f6" stroke="#1e3a8a" stroke-width="1.5"/>`,
        );
      }
    }

    // Panel 2: Liquid (close-packed disordered particles filling lower 75%)
    const liquidCoords: Array<[number, number]> = [
      [28, 174], [55, 173], [83, 175], [111, 173], [139, 174],
      [40, 149], [68, 151], [97, 148], [126, 150], [150, 154],
      [26, 126], [56, 125], [84, 128], [114, 124], [142, 127],
      [42, 102], [72, 100], [100, 103], [130, 99],
      [58, 76], [89, 78], [118, 75],
    ];
    for (const [dx, dy] of liquidCoords) {
      const jx = (rng() - 0.5) * 4;
      const jy = (rng() - 0.5) * 4;
      parts.push(
        `<circle cx="${c(xs[1] + dx + jx)}" cy="${c(topY + dy + jy)}" r="${r}" fill="#0ea5e9" stroke="#0369a1" stroke-width="1.5"/>`,
      );
    }

    // Panel 3: Gas (widely spaced fast-moving particles with velocity arrows)
    const gasSpecs: Array<[number, number, number, number]> = [
      [34, 42, 26, 14],
      [130, 38, -22, 18],
      [82, 92, 24, -18],
      [38, 142, 20, -24],
      [134, 148, -26, -12],
      [88, 166, 18, -22],
    ];
    for (const [dx, dy, vx, vy] of gasSpecs) {
      const px = xs[2] + dx;
      const py = topY + dy;
      parts.push(
        `<line x1="${c(px)}" y1="${c(py)}" x2="${c(px + vx)}" y2="${c(py + vy)}" stroke="#b91c1c" stroke-width="1.8" marker-end="url(#sf-arr-red)"/>`,
        `<circle cx="${c(px)}" cy="${c(py)}" r="8.5" fill="#f97316" stroke="#9a3412" stroke-width="1.5"/>`,
      );
    }

    parts.push(
      `<text x="340" y="330" text-anchor="middle" font-size="12.5" font-weight="600" fill="#475569">Particle arrangement and motion across three states of matter</text>`,
    );

    return {
      visualFamily: "thermal_particle_model",
      svgMarkup: wrapSvg(
        width,
        height,
        "Particle model comparison of three states of matter",
        "Three-panel microscopic particle diagram comparing regular lattice, disordered close-packed fluid, and widely spaced rapidly moving particles.",
        parts.join(""),
      ),
      rendererVersion: NCUK_STATICS_FLUIDS_RENDERER_VERSION,
      publicNumbers,
      publicLabels,
    };
  }

  // brownian-smoke-cell
  const seed = Number(spec.seed ?? 7105);
  const medium = (spec.fluidMedium as string | undefined) ?? "air";
  const rng = seededPrng(seed);

  // Left panel: experimental smoke-cell / microscope setup schematic
  parts.push(
    `<rect x="34" y="54" width="248" height="282" rx="10" fill="#f8fafc" stroke="#cbd5e1" stroke-width="1.6"/>`,
    `<text x="158" y="80" text-anchor="middle" font-size="13.5" font-weight="700" fill="#0f172a">Viewing apparatus</text>`,
    // Microscope tube above cell
    `<rect x="142" y="100" width="32" height="58" rx="3" fill="#cbd5e1" stroke="#1e293b" stroke-width="2"/>`,
    `<rect x="136" y="96" width="44" height="10" rx="2" fill="#475569"/>`,
    `<text x="158" y="176" text-anchor="middle" font-size="12" font-weight="600" fill="#334155">Microscope</text>`,
    // Glass cell
    `<rect x="116" y="196" width="84" height="56" rx="4" fill="${medium === "water" ? "#e0f2fe" : "#fefce8"}" stroke="#1e293b" stroke-width="2"/>`,
    `<text x="158" y="274" text-anchor="middle" font-size="12" font-weight="600" fill="#334155">${medium === "water" ? "Water cell" : "Smoke cell"}</text>`,
    // Side light beam
    `<polygon points="52,212 116,219 116,229 52,236" fill="#fde047" opacity="0.65"/>`,
    `<line x1="52" y1="224" x2="112" y2="224" stroke="#ca8a04" stroke-width="2" marker-end="url(#sf-arr-slate)"/>`,
    `<text x="76" y="256" text-anchor="middle" font-size="11.5" font-weight="600" fill="#854d0e">Light beam</text>`,
    // Tiny dots inside cell
    `<circle cx="144" cy="222" r="2.2" fill="#ca8a04"/>`,
    `<circle cx="164" cy="216" r="2.2" fill="#ca8a04"/>`,
    `<circle cx="176" cy="232" r="2.2" fill="#ca8a04"/>`,
    `<circle cx="152" cy="236" r="2.2" fill="#ca8a04"/>`,
  );

  // Right panel: magnified circular microscope eyepiece showing jagged random walk
  const eyeCx = 486;
  const eyeCy = 196;
  const eyeR = 128;
  parts.push(
    `<circle cx="${eyeCx}" cy="${eyeCy}" r="${eyeR}" fill="#0f172a" stroke="#334155" stroke-width="3.5"/>`,
    `<text x="${eyeCx}" y="52" text-anchor="middle" font-size="13.5" font-weight="700" fill="#0f172a">Magnified eyepiece view</text>`,
  );

  // Generate deterministic jagged 7-vertex random walk safely inside eyepiece circle
  const angles = [0.4, 2.3, -0.8, 1.9, -2.5, 0.7, -1.6];
  const pts: Array<{ x: number; y: number }> = [
    { x: eyeCx - 54 + (rng() - 0.5) * 16, y: eyeCy + 42 + (rng() - 0.5) * 16 },
  ];
  for (let i = 0; i < angles.length; i += 1) {
    const prev = pts[pts.length - 1];
    const stepLen = 36 + rng() * 24;
    const ang = angles[i] + (rng() - 0.5) * 0.65;
    let nx = prev.x + stepLen * Math.cos(ang);
    let ny = prev.y + stepLen * Math.sin(ang);
    // Keep strictly inside inner radius (eyeR - 26)
    const dist = Math.hypot(nx - eyeCx, ny - eyeCy);
    if (dist > eyeR - 28) {
      const pull = (eyeR - 36) / dist;
      nx = eyeCx + (nx - eyeCx) * pull;
      ny = eyeCy + (ny - eyeCy) * pull;
    }
    pts.push({ x: nx, y: ny });
  }

  for (let i = 0; i < pts.length - 1; i += 1) {
    const p0 = pts[i];
    const p1 = pts[i + 1];
    parts.push(
      `<line x1="${c(p0.x)}" y1="${c(p0.y)}" x2="${c(p1.x)}" y2="${c(p1.y)}" stroke="#facc15" stroke-width="2.2" stroke-linecap="round"/>`,
    );
  }
  const vertexLetters = ["P", "Q", "R", "S", "T", "U", "V", "W"];
  for (let i = 0; i < pts.length; i += 1) {
    const p = pts[i];
    const isEnd = i === 0 || i === pts.length - 1;
    parts.push(
      `<circle cx="${c(p.x)}" cy="${c(p.y)}" r="${isEnd ? 5.2 : 3.2}" fill="${isEnd ? "#fef08a" : "#fde047"}" stroke="#854d0e" stroke-width="1"/>`,
    );
    if (i === 0 || i === 3 || i === pts.length - 1) {
      parts.push(
        `<text x="${c(p.x + 9)}" y="${c(p.y - 7)}" text-anchor="start" font-size="12" font-weight="700" fill="#fef08a">${vertexLetters[i]}</text>`,
      );
    }
  }

  parts.push(
    `<text x="${eyeCx}" y="352" text-anchor="middle" font-size="12.5" font-weight="600" fill="#475569">Observed path of a single illuminated speck</text>`,
  );

  return {
    visualFamily: "thermal_particle_model",
    svgMarkup: wrapSvg(
      width,
      height,
      "Brownian motion microscope observation of an illuminated speck",
      "Schematic showing side illumination of a microscope viewing cell alongside a magnified eyepiece view of a single speck following a jagged irregular random walk.",
      parts.join(""),
    ),
    rendererVersion: NCUK_STATICS_FLUIDS_RENDERER_VERSION,
    publicNumbers,
    publicLabels,
  };
}

/* ============================================================================
 * Exported Plugin Registry Array (All 7 Disjoint Kinds)
 * ============================================================================ */

export const NCUK_STATICS_FLUIDS_PLUGINS: readonly DomainKindPlugin[] = [
  {
    domain: "mechanics",
    kind: "beam-single-pivot-moments",
    summary:
      "Horizontal beam on a single off-centre pivot (unknown balancing mass, unknown balancing position from end B, or crane counterweight safe-load equilibrium) with deterministic engineering SVG.",
    requiredFields: [
      { name: "kind", type: "string", enumValues: ["beam-single-pivot-moments"] },
      { name: "beamLengthM", type: "number", unit: "m", bounds: "[0.4, 40]" },
      { name: "beamMassKg", type: "number", unit: "kg", bounds: "[0.1, 20000]" },
      { name: "cgFromLeftM", type: "number", unit: "m", bounds: "(0, beamLengthM)" },
      { name: "pivotFromLeftM", type: "number", unit: "m", bounds: "(0, beamLengthM)" },
    ],
    optionalFields: [
      {
        name: "mode",
        type: "string",
        enumValues: ["find-balance-mass", "find-balance-position", "crane-counterweight"],
      },
      { name: "loadFromLeftM", type: "number", unit: "m" },
      { name: "loadMassKg", type: "number", unit: "kg" },
      { name: "counterweightMassKg", type: "number", unit: "kg" },
      { name: "counterweightFromLeftM", type: "number", unit: "m" },
      { name: "gravityMs2", type: "number", unit: "m s^-2", bounds: "[1, 25]" },
    ],
    physicalConstraints: [
      "pivotFromLeftM must differ from cgFromLeftM by at least 0.05 m",
      "Balancing load must oppose the beam weight moment about the pivot",
      "NCUK IFYPH005 uses g = 9.81 m s^-2",
    ],
    probeSpecs: [
      {
        kind: "beam-single-pivot-moments",
        mode: "find-balance-mass",
        beamLengthM: 4.0,
        beamMassKg: 18,
        cgFromLeftM: 2.0,
        pivotFromLeftM: 1.4,
        loadFromLeftM: 0.4,
        gravityMs2: 9.81,
      },
      {
        kind: "beam-single-pivot-moments",
        mode: "find-balance-position",
        beamLengthM: 3.6,
        beamMassKg: 12,
        cgFromLeftM: 1.8,
        pivotFromLeftM: 1.3,
        loadMassKg: 10,
        gravityMs2: 9.81,
      },
      {
        kind: "beam-single-pivot-moments",
        mode: "crane-counterweight",
        beamLengthM: 18.0,
        beamMassKg: 600,
        cgFromLeftM: 9.5,
        pivotFromLeftM: 6.0,
        counterweightMassKg: 2400,
        counterweightFromLeftM: 1.5,
        loadFromLeftM: 16.0,
        gravityMs2: 9.81,
      },
    ],
    validate: validateBeamSinglePivot,
    solve: solveBeamSinglePivot,
    renderSvg: renderBeamSinglePivotSvg,
  },
  {
    domain: "mechanics",
    kind: "beam-two-support-overhang",
    summary:
      "Horizontal overhanging beam resting on two supports A and B: computes both support reactions, reaction shifts, and lift-off tipping limit where reaction at A falls to zero.",
    requiredFields: [
      { name: "kind", type: "string", enumValues: ["beam-two-support-overhang"] },
      { name: "beamLengthM", type: "number", unit: "m", bounds: "[1, 30]" },
      { name: "beamMassKg", type: "number", unit: "kg", bounds: "[1, 20000]" },
      { name: "cgFromLeftM", type: "number", unit: "m" },
      { name: "supportAFromLeftM", type: "number", unit: "m" },
      { name: "supportBFromLeftM", type: "number", unit: "m" },
      { name: "loadMassKg", type: "number", unit: "kg" },
      { name: "loadFromLeftM", type: "number", unit: "m" },
    ],
    optionalFields: [
      { name: "gravityMs2", type: "number", unit: "m s^-2", bounds: "[1, 25]" },
    ],
    physicalConstraints: [
      "0 <= supportAFromLeftM < cgFromLeftM < supportBFromLeftM < beamLengthM",
      "Both support reactions R_A and R_B must remain positive in initial equilibrium",
      "Tipping about support B occurs when R_A = 0",
    ],
    probeSpecs: [
      {
        kind: "beam-two-support-overhang",
        beamLengthM: 6.0,
        beamMassKg: 40,
        cgFromLeftM: 3.0,
        supportAFromLeftM: 0.5,
        supportBFromLeftM: 4.0,
        loadMassKg: 60,
        loadFromLeftM: 2.5,
        gravityMs2: 9.81,
      },
      {
        kind: "beam-two-support-overhang",
        beamLengthM: 5.0,
        beamMassKg: 36,
        cgFromLeftM: 2.5,
        supportAFromLeftM: 0.0,
        supportBFromLeftM: 3.2,
        loadMassKg: 50,
        loadFromLeftM: 1.8,
        gravityMs2: 9.81,
      },
    ],
    validate: validateBeamTwoSupport,
    solve: solveBeamTwoSupport,
    renderSvg: renderBeamTwoSupportSvg,
  },
  {
    domain: "mechanics",
    kind: "hinged-rod-angled-wire",
    summary:
      "Wall-hinged horizontal rod, shop sign, or non-uniform trapdoor supported by an angled wire or vertical outer lift force: computes tension, hinge components R_x and R_y, and full hinge resultant magnitude and angle.",
    requiredFields: [
      { name: "kind", type: "string", enumValues: ["hinged-rod-angled-wire"] },
      { name: "rodLengthM", type: "number", unit: "m", bounds: "[0.2, 15]" },
      { name: "rodMassKg", type: "number", unit: "kg", bounds: "[0.2, 5000]" },
      { name: "cgFromHingeM", type: "number", unit: "m", bounds: "(0, rodLengthM)" },
    ],
    optionalFields: [
      { name: "mode", type: "string", enumValues: ["wall-rod-wire", "hinged-flap-vertical-lift"] },
      { name: "wireAngleToHorizontalDeg", type: "number", unit: "deg", bounds: "[15, 75]" },
      { name: "angleReference", type: "string", enumValues: ["horizontal", "vertical"] },
      { name: "wireAttachFromHingeM", type: "number", unit: "m" },
      { name: "extraLoadMassKg", type: "number", unit: "kg" },
      { name: "extraLoadFromHingeM", type: "number", unit: "m" },
      { name: "gravityMs2", type: "number", unit: "m s^-2", bounds: "[1, 25]" },
    ],
    physicalConstraints: [
      "0 < cgFromHingeM < rodLengthM and 0 < wireAttachFromHingeM <= rodLengthM",
      "wireAngleToHorizontalDeg in [15, 75] degrees for wall-rod-wire mode",
      "Hinge exerts horizontal and vertical reaction components satisfying ΣF_x = 0 and ΣF_y = 0",
    ],
    probeSpecs: [
      {
        kind: "hinged-rod-angled-wire",
        mode: "wall-rod-wire",
        rodLengthM: 2.4,
        rodMassKg: 14,
        cgFromHingeM: 1.0,
        wireAttachFromHingeM: 2.4,
        wireAngleToHorizontalDeg: 35,
        angleReference: "horizontal",
        gravityMs2: 9.81,
      },
      {
        kind: "hinged-rod-angled-wire",
        mode: "wall-rod-wire",
        rodLengthM: 1.8,
        rodMassKg: 8.0,
        cgFromHingeM: 0.9,
        wireAttachFromHingeM: 1.8,
        extraLoadMassKg: 6.0,
        extraLoadFromHingeM: 1.5,
        wireAngleToHorizontalDeg: 42,
        angleReference: "vertical",
        gravityMs2: 9.81,
      },
      {
        kind: "hinged-rod-angled-wire",
        mode: "hinged-flap-vertical-lift",
        rodLengthM: 0.9,
        rodMassKg: 6.4,
        cgFromHingeM: 0.45,
        wireAttachFromHingeM: 0.9,
        gravityMs2: 9.81,
      },
    ],
    validate: validateHingedRod,
    solve: solveHingedRod,
    renderSvg: renderHingedRodSvg,
  },
  {
    domain: "mechanics",
    kind: "two-wire-suspended-bar",
    summary:
      "Asymmetric horizontal bar suspended by two vertical or angled ceiling wires, plus rigid-bar torque of a couple τ = F d sin θ with crisp engineering SVG.",
    requiredFields: [
      { name: "kind", type: "string", enumValues: ["two-wire-suspended-bar"] },
    ],
    optionalFields: [
      { name: "mode", type: "string", enumValues: ["vertical-wires", "angled-wires", "couple-torque"] },
      { name: "barLengthM", type: "number", unit: "m" },
      { name: "barMassKg", type: "number", unit: "kg" },
      { name: "cgFromLeftM", type: "number", unit: "m" },
      { name: "wireAFromLeftM", type: "number", unit: "m" },
      { name: "wireBFromLeftM", type: "number", unit: "m" },
      { name: "angleADeg", type: "number", unit: "deg", bounds: "[25, 78]" },
      { name: "extraLoadMassKg", type: "number", unit: "kg" },
      { name: "extraLoadFromLeftM", type: "number", unit: "m" },
      { name: "coupleForceN", type: "number", unit: "N" },
      { name: "coupleSeparationM", type: "number", unit: "m" },
      { name: "forceAngleDeg", type: "number", unit: "deg", bounds: "[20, 90]" },
      { name: "gravityMs2", type: "number", unit: "m s^-2" },
    ],
    physicalConstraints: [
      "For suspended-bar modes, CG lies between wire A and wire B so both tensions are positive",
      "For angled-wires mode, angleBDeg is derived from exact horizontal balance T_A cos θ_A = T_B cos θ_B",
      "For couple-torque mode, resultant force is zero and torque equals F d sin θ",
    ],
    probeSpecs: [
      {
        kind: "two-wire-suspended-bar",
        mode: "vertical-wires",
        barLengthM: 3.0,
        barMassKg: 16,
        cgFromLeftM: 1.2,
        wireAFromLeftM: 0.4,
        wireBFromLeftM: 2.6,
        gravityMs2: 9.81,
      },
      {
        kind: "two-wire-suspended-bar",
        mode: "angled-wires",
        barLengthM: 2.8,
        barMassKg: 12,
        cgFromLeftM: 1.1,
        wireAFromLeftM: 0.3,
        wireBFromLeftM: 2.5,
        angleADeg: 55,
        gravityMs2: 9.81,
      },
      {
        kind: "two-wire-suspended-bar",
        mode: "couple-torque",
        coupleForceN: 45,
        coupleSeparationM: 0.36,
        forceAngleDeg: 90,
      },
    ],
    validate: validateTwoWireBar,
    solve: solveTwoWireBar,
    renderSvg: renderTwoWireBarSvg,
  },
  {
    domain: "pure-calculation",
    kind: "alloy-composite-density",
    summary:
      "Composite alloy density (mass-ratio harmonic mean vs volume-fraction arithmetic mean), annular washer/pipe volume & mass, drawn wire / remelted cube conservation, and planetary/nuclear sphere density.",
    requiredFields: [
      { name: "kind", type: "string", enumValues: ["alloy-composite-density"] },
      {
        name: "mode",
        type: "string",
        enumValues: [
          "mass-fraction-alloy",
          "volume-fraction-alloy",
          "annular-washer",
          "drawn-wire-remelt",
          "sphere-density",
        ],
      },
    ],
    optionalFields: [
      { name: "density1KgM3", type: "number", unit: "kg m^-3" },
      { name: "density2KgM3", type: "number", unit: "kg m^-3" },
      { name: "totalMassKg", type: "number", unit: "kg" },
      { name: "massFraction1", type: "number", bounds: "(0.05, 0.95)" },
      { name: "volumeFraction1", type: "number", bounds: "(0.05, 0.95)" },
      { name: "lengthCm", type: "number", unit: "cm" },
      { name: "widthCm", type: "number", unit: "cm" },
      { name: "heightCm", type: "number", unit: "cm" },
      { name: "outerDiameterMm", type: "number", unit: "mm" },
      { name: "innerDiameterMm", type: "number", unit: "mm" },
      { name: "thicknessMm", type: "number", unit: "mm" },
      { name: "materialDensityKgM3", type: "number", unit: "kg m^-3" },
      { name: "massKg", type: "number", unit: "kg" },
      { name: "wireDiameterMm", type: "number", unit: "mm" },
      { name: "diameterM", type: "number", unit: "m" },
    ],
    physicalConstraints: [
      "Mass-fraction alloys obey harmonic mean density ρ = 1 / (w₁/ρ₁ + w₂/ρ₂)",
      "Volume-fraction alloys obey arithmetic mean density ρ = f₁ρ₁ + f₂ρ₂",
      "Annular washer requires outerDiameterMm > innerDiameterMm > 0",
    ],
    probeSpecs: [
      {
        kind: "alloy-composite-density",
        mode: "mass-fraction-alloy",
        density1KgM3: 8930,
        density2KgM3: 7140,
        totalMassKg: 2.5,
        massFraction1: 0.65,
      },
      {
        kind: "alloy-composite-density",
        mode: "volume-fraction-alloy",
        density1KgM3: 19300,
        density2KgM3: 10500,
        volumeFraction1: 0.75,
        lengthCm: 5.0,
        widthCm: 4.0,
        heightCm: 2.0,
      },
      {
        kind: "alloy-composite-density",
        mode: "annular-washer",
        outerDiameterMm: 48,
        innerDiameterMm: 24,
        thicknessMm: 12,
        materialDensityKgM3: 7870,
      },
      {
        kind: "alloy-composite-density",
        mode: "drawn-wire-remelt",
        massKg: 1.8,
        materialDensityKgM3: 8930,
        wireDiameterMm: 1.4,
      },
      {
        kind: "alloy-composite-density",
        mode: "sphere-density",
        massKg: 5.97e24,
        diameterM: 1.274e7,
      },
    ],
    validate: validateAlloyDensity,
    solve: solveAlloyDensity,
  },
  {
    domain: "pure-calculation",
    kind: "hydrostatic-pressure-base-force",
    summary:
      "Hydrostatic gauge and absolute pressure (Δp = ρgh, p_abs = p_atm + ρgh), total base force F = pA, Archimedes upthrust & floating fractions, and aqueous solution concentration density chains (g = 9.81 m s^-2).",
    requiredFields: [
      { name: "kind", type: "string", enumValues: ["hydrostatic-pressure-base-force"] },
      {
        name: "mode",
        type: "string",
        enumValues: ["tank-base-force", "archimedes-buoyancy", "solution-concentration"],
      },
    ],
    optionalFields: [
      { name: "fluidDensityKgM3", type: "number", unit: "kg m^-3" },
      { name: "depthM", type: "number", unit: "m" },
      { name: "baseAreaM2", type: "number", unit: "m^2" },
      { name: "atmosphericPressurePa", type: "number", unit: "Pa" },
      { name: "objectMassKg", type: "number", unit: "kg" },
      { name: "objectDensityKgM3", type: "number", unit: "kg m^-3" },
      { name: "soluteMassPercent", type: "number", unit: "%", bounds: "(0, 60)" },
      { name: "solutionDensityKgM3", type: "number", unit: "kg m^-3" },
      { name: "targetSoluteMassKg", type: "number", unit: "kg" },
      { name: "gravityMs2", type: "number", unit: "m s^-2", bounds: "[1, 25]" },
    ],
    physicalConstraints: [
      "Uses NCUK g = 9.81 m s^-2 and standard p_atm = 1.01 × 10^5 Pa",
      "Upthrust equals weight of displaced fluid ρ_fluid V_sub g",
    ],
    probeSpecs: [
      {
        kind: "hydrostatic-pressure-base-force",
        mode: "tank-base-force",
        fluidDensityKgM3: 1025,
        depthM: 18,
        baseAreaM2: 1.6,
        atmosphericPressurePa: 1.01e5,
        gravityMs2: 9.81,
      },
      {
        kind: "hydrostatic-pressure-base-force",
        mode: "archimedes-buoyancy",
        fluidDensityKgM3: 1025,
        objectMassKg: 14,
        objectDensityKgM3: 2700,
        gravityMs2: 9.81,
      },
      {
        kind: "hydrostatic-pressure-base-force",
        mode: "solution-concentration",
        soluteMassPercent: 3.5,
        solutionDensityKgM3: 1026,
        targetSoluteMassKg: 1.4,
      },
    ],
    validate: validateHydrostaticCalc,
    solve: solveHydrostaticCalc,
  },
  {
    domain: "thermal",
    kind: "hydrostatic-tank-brownian",
    summary:
      "Visual AC3.1 fluid & particle-model suite with crisp deterministic SVGs: two-layer immiscible hydrostatic tank, open U-tube manometer, three-state particle arrangement comparison, and Brownian smoke-cell random walk.",
    requiredFields: [
      { name: "kind", type: "string", enumValues: ["hydrostatic-tank-brownian"] },
      {
        name: "mode",
        type: "string",
        enumValues: [
          "layered-tank",
          "u-tube-manometer",
          "particle-states",
          "brownian-smoke-cell",
        ],
      },
    ],
    optionalFields: [
      { name: "upperDensityKgM3", type: "number", unit: "kg m^-3" },
      { name: "lowerDensityKgM3", type: "number", unit: "kg m^-3" },
      { name: "upperDepthM", type: "number", unit: "m" },
      { name: "lowerDepthM", type: "number", unit: "m" },
      { name: "baseAreaM2", type: "number", unit: "m^2" },
      { name: "atmosphericPressurePa", type: "number", unit: "Pa" },
      { name: "denseDensityKgM3", type: "number", unit: "kg m^-3" },
      { name: "lightDensityKgM3", type: "number", unit: "kg m^-3" },
      { name: "lightColumnHeightM", type: "number", unit: "m" },
      { name: "denseColumnHeightM", type: "number", unit: "m" },
      { name: "solveFor", type: "string", enumValues: ["light-density", "dense-height"] },
      { name: "panelLabelsMode", type: "string", enumValues: ["named", "anonymous"] },
      { name: "fluidMedium", type: "string", enumValues: ["air", "water"] },
      { name: "seed", type: "number" },
      { name: "gravityMs2", type: "number", unit: "m s^-2" },
    ],
    physicalConstraints: [
      "layered-tank requires lowerDensityKgM3 > upperDensityKgM3 > 0",
      "u-tube-manometer requires ρ_light h_light = ρ_dense h_dense with ρ_light < ρ_dense",
      "particle-states and brownian-smoke-cell return verified non-numeric qualitative classifications",
    ],
    probeSpecs: [
      {
        kind: "hydrostatic-tank-brownian",
        mode: "layered-tank",
        upperDensityKgM3: 840,
        lowerDensityKgM3: 1030,
        upperDepthM: 0.9,
        lowerDepthM: 1.6,
        baseAreaM2: 1.5,
        atmosphericPressurePa: 1.01e5,
        gravityMs2: 9.81,
      },
      {
        kind: "hydrostatic-tank-brownian",
        mode: "u-tube-manometer",
        solveFor: "light-density",
        denseDensityKgM3: 1000,
        lightColumnHeightM: 0.25,
        denseColumnHeightM: 0.20,
        gravityMs2: 9.81,
      },
      {
        kind: "hydrostatic-tank-brownian",
        mode: "particle-states",
        panelLabelsMode: "anonymous",
        seed: 7101,
      },
      {
        kind: "hydrostatic-tank-brownian",
        mode: "brownian-smoke-cell",
        fluidMedium: "air",
        seed: 7109,
      },
    ],
    validate: validateHydrostaticTankBrownian,
    solve: solveHydrostaticTankBrownian,
    renderSvg: renderHydrostaticTankBrownianSvg,
  },
];
