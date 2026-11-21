import type {
  DomainRenderOptions,
  DomainRenderOutput,
  DomainSolveOutput,
  DomainValidationResult,
} from "@/lib/bank-pipeline/domain-registry";
import type { PhysicsDomainId, VerifiedQuantityMap } from "@/lib/bank-pipeline/types";

export const NCUK_ELEMENTARY_CHARGE_C = 1.6e-19;
export const NCUK_AC4_RENDERER_VERSION = "sixthphysics/ncuk-ac4-svg/1.0.0";

export interface DomainKindFieldSpec {
  readonly name: string;
  readonly type: string;
  readonly unit?: string;
  readonly bounds?: string;
  readonly enumValues?: readonly string[];
  readonly notes?: string;
}

export interface DomainKindPlugin {
  readonly domain: PhysicsDomainId;
  readonly kind: string;
  readonly summary: string;
  readonly requiredFields: readonly DomainKindFieldSpec[];
  readonly optionalFields?: readonly DomainKindFieldSpec[];
  readonly physicalConstraints: readonly string[];
  readonly probeSpecs: readonly Record<string, unknown>[];
  readonly validate: (spec: Record<string, unknown>) => DomainValidationResult;
  readonly solve: (spec: Record<string, unknown>) => DomainSolveOutput;
  readonly renderSvg?: (
    spec: Record<string, unknown>,
    options?: DomainRenderOptions,
  ) => DomainRenderOutput | undefined;
}

/* -------------------------------------------------------------------------- */
/*  Shared validation, formatting & XML/SVG helpers                           */
/* -------------------------------------------------------------------------- */

const SVG_FONT_SANS =
  "'Plus Jakarta Sans', 'Segoe UI', Helvetica, Arial, sans-serif";

const SUBSCRIPT_DIGITS: Readonly<Record<string, string>> = {
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

const SUPERSCRIPT_CHARS: Readonly<Record<string, string>> = {
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

function toSubscript(n: number | string): string {
  return [...String(n)].map((c) => SUBSCRIPT_DIGITS[c] ?? c).join("");
}

function toSuperscript(n: number | string): string {
  return [...String(n)].map((c) => SUPERSCRIPT_CHARS[c] ?? c).join("");
}

function isFiniteNum(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function isPosNum(v: unknown): v is number {
  return isFiniteNum(v) && v > 0;
}

function escapeXml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function fmtCoord(v: number): string {
  const r = Math.round(v * 100) / 100;
  return Object.is(r, -0) ? "0" : String(r);
}

function fmtCleanVal(v: number, sf = 3): string {
  if (!Number.isFinite(v)) return "0";
  if (Math.abs(v) < 1e-35) return "0";
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

function fmtTick(v: number): string {
  if (Math.abs(v) < 1e-9) return "0";
  const rounded = Math.round(v * 1000) / 1000;
  const s = String(rounded);
  return rounded < 0 ? `−${s.slice(1)}` : s;
}

function fmtCoeffR(mult: number): string {
  if (Math.abs(mult - 1) < 1e-9) return "R";
  const rounded = Math.round(mult * 100) / 100;
  return `${rounded}R`;
}

function extractHiddenSet(
  spec: Record<string, unknown>,
  options?: DomainRenderOptions,
): Set<string> {
  const set = new Set<string>();
  const specHidden = spec.hiddenQuantities;
  if (Array.isArray(specHidden)) {
    for (const item of specHidden) {
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

function makeMarkerId(prefix: string, options?: DomainRenderOptions): string {
  const cleanId = (options?.id ?? "ncuk")
    .replace(/[^A-Za-z0-9-]/g, "")
    .slice(0, 24);
  return `${prefix}-${cleanId || "fig"}`;
}

function wrapSvg(args: {
  width: number;
  height: number;
  title: string;
  defs?: string;
  body: string;
}): string {
  const titleSafe = escapeXml(args.title);
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${args.width}" height="${args.height}" viewBox="0 0 ${args.width} ${args.height}" role="img" aria-label="${titleSafe}">`,
    `<title>${titleSafe}</title>`,
    args.defs ? `<defs>${args.defs}</defs>` : "",
    `<rect width="${args.width}" height="${args.height}" fill="#ffffff"/>`,
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
    weight?: "normal" | "600" | "700";
    italic?: boolean;
    rotate?: number;
  } = {},
): string {
  const attrs: string[] = [
    `x="${fmtCoord(x)}"`,
    `y="${fmtCoord(y)}"`,
    `text-anchor="${opts.anchor ?? "middle"}"`,
    `font-size="${opts.size ?? 14}"`,
    `fill="${opts.fill ?? "#171b1f"}"`,
  ];
  if (opts.weight && opts.weight !== "normal") {
    attrs.push(`font-weight="${opts.weight}"`);
  }
  if (opts.italic) {
    attrs.push(`font-style="italic"`);
  }
  if (opts.rotate !== undefined) {
    attrs.push(`transform="rotate(${opts.rotate} ${fmtCoord(x)} ${fmtCoord(y)})"`);
  }
  return `<text ${attrs.join(" ")}>${escapeXml(content)}</text>`;
}

/* -------------------------------------------------------------------------- */
/*  Reusable crisp IEC/NCUK circuit primitives                                */
/* -------------------------------------------------------------------------- */

function drawResistorH(cx: number, cy: number, halfW = 34, halfH = 11): string {
  return `<rect x="${fmtCoord(cx - halfW)}" y="${fmtCoord(cy - halfH)}" width="${fmtCoord(halfW * 2)}" height="${fmtCoord(halfH * 2)}" fill="#ffffff" stroke="#171b1f" stroke-width="2.2" rx="1"/>`;
}

function drawResistorV(cx: number, cy: number, halfW = 11, halfH = 30): string {
  return `<rect x="${fmtCoord(cx - halfW)}" y="${fmtCoord(cy - halfH)}" width="${fmtCoord(halfW * 2)}" height="${fmtCoord(halfH * 2)}" fill="#ffffff" stroke="#171b1f" stroke-width="2.2" rx="1"/>`;
}

/**
 * Draws a horizontal DC cell centered at (cx, cy).
 * `positiveSide`: "right" puts long thin plate on right (+), short thick on left (−).
 */
function drawCellH(
  cx: number,
  cy: number,
  positiveSide: "left" | "right",
  gap = 10,
): string {
  const half = gap / 2;
  const xPos = positiveSide === "right" ? cx + half : cx - half;
  const xNeg = positiveSide === "right" ? cx - half : cx + half;
  const parts: string[] = [
    `<rect x="${fmtCoord(cx - half - 2)}" y="${fmtCoord(cy - 22)}" width="${fmtCoord(gap + 4)}" height="44" fill="#ffffff" stroke="none"/>`,
    `<line x1="${fmtCoord(xPos)}" y1="${fmtCoord(cy - 22)}" x2="${fmtCoord(xPos)}" y2="${fmtCoord(cy + 22)}" stroke="#171b1f" stroke-width="2.2"/>`,
    `<line x1="${fmtCoord(xNeg)}" y1="${fmtCoord(cy - 11)}" x2="${fmtCoord(xNeg)}" y2="${fmtCoord(cy + 11)}" stroke="#171b1f" stroke-width="4.4"/>`,
    svgText(xPos + (positiveSide === "right" ? 11 : -11), cy - 16, "+", {
      size: 13,
      weight: "700",
      fill: "#b91c1c",
    }),
    svgText(xNeg + (positiveSide === "right" ? -11 : 11), cy - 16, "−", {
      size: 13,
      weight: "700",
      fill: "#1d4ed8",
    }),
  ];
  return parts.join("");
}

/**
 * Draws a vertical DC cell centered at (cx, cy), positive plate on top.
 */
function drawCellV(cx: number, cy: number, gap = 10): string {
  const half = gap / 2;
  const yPos = cy - half;
  const yNeg = cy + half;
  return [
    `<rect x="${fmtCoord(cx - 24)}" y="${fmtCoord(cy - half - 2)}" width="48" height="${fmtCoord(gap + 4)}" fill="#ffffff" stroke="none"/>`,
    `<line x1="${fmtCoord(cx - 22)}" y1="${fmtCoord(yPos)}" x2="${fmtCoord(cx + 22)}" y2="${fmtCoord(yPos)}" stroke="#171b1f" stroke-width="2.2"/>`,
    `<line x1="${fmtCoord(cx - 11)}" y1="${fmtCoord(yNeg)}" x2="${fmtCoord(cx + 11)}" y2="${fmtCoord(yNeg)}" stroke="#171b1f" stroke-width="4.4"/>`,
    svgText(cx - 24, yPos - 4, "+", { size: 13, weight: "700", fill: "#b91c1c" }),
    svgText(cx - 24, yNeg + 14, "−", { size: 13, weight: "700", fill: "#1d4ed8" }),
  ].join("");
}

function drawCapacitorH(cx: number, cy: number, gap = 10): string {
  const half = gap / 2;
  return [
    `<rect x="${fmtCoord(cx - half - 1)}" y="${fmtCoord(cy - 20)}" width="${fmtCoord(gap + 2)}" height="40" fill="#ffffff" stroke="none"/>`,
    `<line x1="${fmtCoord(cx - half)}" y1="${fmtCoord(cy - 20)}" x2="${fmtCoord(cx - half)}" y2="${fmtCoord(cy + 20)}" stroke="#171b1f" stroke-width="2.8"/>`,
    `<line x1="${fmtCoord(cx + half)}" y1="${fmtCoord(cy - 20)}" x2="${fmtCoord(cx + half)}" y2="${fmtCoord(cy + 20)}" stroke="#171b1f" stroke-width="2.8"/>`,
  ].join("");
}

function drawCapacitorV(cx: number, cy: number, gap = 10): string {
  const half = gap / 2;
  return [
    `<rect x="${fmtCoord(cx - 22)}" y="${fmtCoord(cy - half - 1)}" width="44" height="${fmtCoord(gap + 2)}" fill="#ffffff" stroke="none"/>`,
    `<line x1="${fmtCoord(cx - 20)}" y1="${fmtCoord(cy - half)}" x2="${fmtCoord(cx + 20)}" y2="${fmtCoord(cy - half)}" stroke="#171b1f" stroke-width="2.8"/>`,
    `<line x1="${fmtCoord(cx - 20)}" y1="${fmtCoord(cy + half)}" x2="${fmtCoord(cx + 20)}" y2="${fmtCoord(cy + half)}" stroke="#171b1f" stroke-width="2.8"/>`,
  ].join("");
}

function drawMeter(cx: number, cy: number, letter: "A" | "V", r = 19): string {
  return [
    `<circle cx="${fmtCoord(cx)}" cy="${fmtCoord(cy)}" r="${r}" fill="#ffffff" stroke="#047857" stroke-width="2.2"/>`,
    svgText(cx, cy + 5, letter, {
      size: 16,
      weight: "700",
      fill: "#047857",
    }),
  ].join("");
}

function drawSwitchH(cx: number, cy: number, halfSpan = 20): string {
  const x1 = cx - halfSpan;
  const x2 = cx + halfSpan;
  return [
    `<rect x="${fmtCoord(x1 - 2)}" y="${fmtCoord(cy - 18)}" width="${fmtCoord(halfSpan * 2 + 4)}" height="24" fill="#ffffff" stroke="none"/>`,
    `<line x1="${fmtCoord(x1)}" y1="${fmtCoord(cy)}" x2="${fmtCoord(x2 - 4)}" y2="${fmtCoord(cy - 16)}" stroke="#b91c1c" stroke-width="2.4"/>`,
    `<circle cx="${fmtCoord(x1)}" cy="${fmtCoord(cy)}" r="3.5" fill="#ffffff" stroke="#171b1f" stroke-width="2"/>`,
    `<circle cx="${fmtCoord(x2)}" cy="${fmtCoord(cy)}" r="3.5" fill="#ffffff" stroke="#171b1f" stroke-width="2"/>`,
  ].join("");
}

function drawSwitchV(cx: number, cy: number, halfSpan = 18): string {
  const y1 = cy - halfSpan;
  const y2 = cy + halfSpan;
  return [
    `<rect x="${fmtCoord(cx - 6)}" y="${fmtCoord(y1 - 2)}" width="24" height="${fmtCoord(halfSpan * 2 + 4)}" fill="#ffffff" stroke="none"/>`,
    `<line x1="${fmtCoord(cx)}" y1="${fmtCoord(y1)}" x2="${fmtCoord(cx + 15)}" y2="${fmtCoord(y2 - 3)}" stroke="#b91c1c" stroke-width="2.4"/>`,
    `<circle cx="${fmtCoord(cx)}" cy="${fmtCoord(y1)}" r="3.5" fill="#ffffff" stroke="#171b1f" stroke-width="2"/>`,
    `<circle cx="${fmtCoord(cx)}" cy="${fmtCoord(y2)}" r="3.5" fill="#ffffff" stroke="#171b1f" stroke-width="2"/>`,
  ].join("");
}

function drawJunction(cx: number, cy: number): string {
  return `<circle cx="${fmtCoord(cx)}" cy="${fmtCoord(cy)}" r="4" fill="#171b1f"/>`;
}

function drawTerminal(cx: number, cy: number): string {
  return `<circle cx="${fmtCoord(cx)}" cy="${fmtCoord(cy)}" r="5" fill="#ffffff" stroke="#171b1f" stroke-width="2.4"/>`;
}

function arrowDefs(markerId: string, color = "#1d4ed8"): string {
  return `<marker id="${markerId}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 1 L 9 5 L 0 9 z" fill="${color}"/></marker>`;
}

/* -------------------------------------------------------------------------- */
/*  Reusable Cartesian axes helper for clean NCUK graph SVGs                  */
/* -------------------------------------------------------------------------- */

interface CartesianGridConfig {
  readonly width: number;
  readonly height: number;
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
  readonly xMin: number;
  readonly xMax: number;
  readonly yMin: number;
  readonly yMax: number;
  readonly xTicks: readonly number[];
  readonly yTicks: readonly number[];
  readonly xLabel: string;
  readonly yLabel: string;
  readonly axisMarkerId: string;
}

function computeNiceTicks(minVal: number, maxVal: number, targetSteps = 5): number[] {
  const span = maxVal - minVal;
  if (span <= 0) return [minVal];
  const rawStep = span / targetSteps;
  const pow10 = 10 ** Math.floor(Math.log10(rawStep));
  const scaled = rawStep / pow10;
  let step: number;
  if (scaled <= 1.05) step = 1 * pow10;
  else if (scaled <= 2.05) step = 2 * pow10;
  else if (scaled <= 2.55) step = 2.5 * pow10;
  else if (scaled <= 5.05) step = 5 * pow10;
  else step = 10 * pow10;

  const ticks: number[] = [];
  const startIdx = Math.ceil(minVal / step - 1e-9);
  const endIdx = Math.floor(maxVal / step + 1e-9);
  for (let i = startIdx; i <= endIdx; i += 1) {
    const val = Number((i * step).toPrecision(6));
    if (val >= minVal - 1e-9 && val <= maxVal + 1e-9) {
      ticks.push(Math.abs(val) < 1e-12 ? 0 : val);
    }
  }
  return ticks;
}

function buildCartesianAxesSvg(cfg: CartesianGridConfig): {
  svg: string;
  px: (x: number) => number;
  py: (y: number) => number;
  publicNumbers: number[];
  publicLabels: string[];
} {
  const plotW = cfg.right - cfg.left;
  const plotH = cfg.bottom - cfg.top;
  const px = (x: number) =>
    cfg.left + ((x - cfg.xMin) / (cfg.xMax - cfg.xMin)) * plotW;
  const py = (y: number) =>
    cfg.bottom - ((y - cfg.yMin) / (cfg.yMax - cfg.yMin)) * plotH;

  const parts: string[] = [];
  const publicNumbers: number[] = [];
  const publicLabels: string[] = [cfg.xLabel, cfg.yLabel];

  // Plot frame background
  parts.push(
    `<rect x="${fmtCoord(cfg.left)}" y="${fmtCoord(cfg.top)}" width="${fmtCoord(plotW)}" height="${fmtCoord(plotH)}" fill="#fbfcfd" stroke="#cbd5e1" stroke-width="1"/>`,
  );

  // Minor gridlines (half-step between major ticks)
  for (let i = 0; i + 1 < cfg.xTicks.length; i += 1) {
    const mid = (cfg.xTicks[i] + cfg.xTicks[i + 1]) / 2;
    const xm = px(mid);
    parts.push(
      `<line x1="${fmtCoord(xm)}" y1="${fmtCoord(cfg.top)}" x2="${fmtCoord(xm)}" y2="${fmtCoord(cfg.bottom)}" stroke="#eef2f6" stroke-width="1"/>`,
    );
  }
  for (let i = 0; i + 1 < cfg.yTicks.length; i += 1) {
    const mid = (cfg.yTicks[i] + cfg.yTicks[i + 1]) / 2;
    const ym = py(mid);
    parts.push(
      `<line x1="${fmtCoord(cfg.left)}" y1="${fmtCoord(ym)}" x2="${fmtCoord(cfg.right)}" y2="${fmtCoord(ym)}" stroke="#eef2f6" stroke-width="1"/>`,
    );
  }

  // Major gridlines
  for (const xt of cfg.xTicks) {
    const gx = px(xt);
    parts.push(
      `<line x1="${fmtCoord(gx)}" y1="${fmtCoord(cfg.top)}" x2="${fmtCoord(gx)}" y2="${fmtCoord(cfg.bottom)}" stroke="#d8e1ea" stroke-width="1.1"/>`,
    );
  }
  for (const yt of cfg.yTicks) {
    const gy = py(yt);
    parts.push(
      `<line x1="${fmtCoord(cfg.left)}" y1="${fmtCoord(gy)}" x2="${fmtCoord(cfg.right)}" y2="${fmtCoord(gy)}" stroke="#d8e1ea" stroke-width="1.1"/>`,
    );
  }

  // Axes (placed at y=0 / x=0 if inside domain, otherwise at frame borders)
  const xAxisY =
    cfg.yMin <= 0 && cfg.yMax >= 0 ? py(0) : cfg.bottom;
  const yAxisX =
    cfg.xMin <= 0 && cfg.xMax >= 0 ? px(0) : cfg.left;

  parts.push(
    `<line x1="${fmtCoord(cfg.left)}" y1="${fmtCoord(xAxisY)}" x2="${fmtCoord(cfg.right + 12)}" y2="${fmtCoord(xAxisY)}" stroke="#171b1f" stroke-width="2" marker-end="url(#${cfg.axisMarkerId})"/>`,
    `<line x1="${fmtCoord(yAxisX)}" y1="${fmtCoord(cfg.bottom)}" x2="${fmtCoord(yAxisX)}" y2="${fmtCoord(cfg.top - 12)}" stroke="#171b1f" stroke-width="2" marker-end="url(#${cfg.axisMarkerId})"/>`,
  );

  // Tick marks & numeric labels along outer bottom & left frame edges for clean non-overlap
  for (const xt of cfg.xTicks) {
    const gx = px(xt);
    const lbl = fmtTick(xt);
    publicNumbers.push(xt);
    publicLabels.push(lbl);
    parts.push(
      `<line x1="${fmtCoord(gx)}" y1="${fmtCoord(cfg.bottom)}" x2="${fmtCoord(gx)}" y2="${fmtCoord(cfg.bottom + 6)}" stroke="#171b1f" stroke-width="1.5"/>`,
      svgText(gx, cfg.bottom + 22, lbl, { size: 12, fill: "#334155" }),
    );
  }

  for (const yt of cfg.yTicks) {
    const gy = py(yt);
    const lbl = fmtTick(yt);
    publicNumbers.push(yt);
    publicLabels.push(lbl);
    parts.push(
      `<line x1="${fmtCoord(cfg.left - 6)}" y1="${fmtCoord(gy)}" x2="${fmtCoord(cfg.left)}" y2="${fmtCoord(gy)}" stroke="#171b1f" stroke-width="1.5"/>`,
      svgText(cfg.left - 11, gy + 4, lbl, {
        anchor: "end",
        size: 12,
        fill: "#334155",
      }),
    );
  }

  // Axis captions
  parts.push(
    svgText((cfg.left + cfg.right) / 2, cfg.bottom + 46, cfg.xLabel, {
      size: 14,
      weight: "600",
      fill: "#171b1f",
    }),
    svgText(24, (cfg.top + cfg.bottom) / 2, cfg.yLabel, {
      size: 14,
      weight: "600",
      fill: "#171b1f",
      rotate: -90,
    }),
  );

  return {
    svg: parts.join(""),
    px,
    py,
    publicNumbers,
    publicLabels,
  };
}

function drawCrossMarker(x: number, y: number, r = 4.5, color = "#b91c1c"): string {
  return [
    `<line x1="${fmtCoord(x - r)}" y1="${fmtCoord(y - r)}" x2="${fmtCoord(x + r)}" y2="${fmtCoord(y + r)}" stroke="${color}" stroke-width="2"/>`,
    `<line x1="${fmtCoord(x - r)}" y1="${fmtCoord(y + r)}" x2="${fmtCoord(x + r)}" y2="${fmtCoord(y - r)}" stroke="${color}" stroke-width="2"/>`,
  ].join("");
}

/* ========================================================================== */
/*  1. pure-calculation :: drift-velocity-conduction                          */
/* ========================================================================== */

const DRIFT_VELOCITY_MODES = ["forward-v", "forward-i", "reverse-d"] as const;

const driftVelocityConductionPlugin: DomainKindPlugin = {
  domain: "pure-calculation",
  kind: "drift-velocity-conduction",
  summary:
    "Free-electron conduction current I = nAve in cylindrical metallic wires (forward drift speed, forward current, and reverse diameter).",
  requiredFields: [
    {
      name: "mode",
      type: "string",
      enumValues: DRIFT_VELOCITY_MODES,
      notes: "Which quantity is derived from I = nAve.",
    },
    {
      name: "numberDensityM3",
      type: "number",
      unit: "m⁻³",
      bounds: "1e27..2e29",
    },
  ],
  optionalFields: [
    { name: "diameterMm", type: "number", unit: "mm", bounds: "0.05..10" },
    { name: "currentA", type: "number", unit: "A", bounds: "0.001..50" },
    { name: "driftVelocityMs", type: "number", unit: "m s⁻¹", bounds: "1e-6..0.5" },
  ],
  physicalConstraints: [
    "I = n A v e with e = 1.60e-19 C and A = pi d^2 / 4.",
    "Free electrons drift opposite to conventional current direction.",
  ],
  probeSpecs: [
    {
      kind: "drift-velocity-conduction",
      mode: "forward-v",
      numberDensityM3: 8.5e28,
      diameterMm: 0.8,
      currentA: 2.4,
    },
    {
      kind: "drift-velocity-conduction",
      mode: "reverse-d",
      numberDensityM3: 6.0e28,
      currentA: 1.8,
      driftVelocityMs: 3.5e-4,
    },
    {
      kind: "drift-velocity-conduction",
      mode: "forward-i",
      numberDensityM3: 7.4e28,
      diameterMm: 1.2,
      driftVelocityMs: 1.8e-4,
    },
  ],
  validate(spec) {
    const issues: string[] = [];
    const mode = spec.mode;
    if (
      typeof mode !== "string" ||
      !(DRIFT_VELOCITY_MODES as readonly string[]).includes(mode)
    ) {
      issues.push("mode must be 'forward-v', 'forward-i', or 'reverse-d'");
    }
    if (!isPosNum(spec.numberDensityM3) || spec.numberDensityM3 < 1e24) {
      issues.push("numberDensityM3 must be a positive metallic electron density");
    }
    if (mode === "forward-v") {
      if (!isPosNum(spec.diameterMm)) issues.push("diameterMm must be positive");
      if (!isPosNum(spec.currentA)) issues.push("currentA must be positive");
    } else if (mode === "forward-i") {
      if (!isPosNum(spec.diameterMm)) issues.push("diameterMm must be positive");
      if (!isPosNum(spec.driftVelocityMs)) {
        issues.push("driftVelocityMs must be positive");
      }
    } else if (mode === "reverse-d") {
      if (!isPosNum(spec.currentA)) issues.push("currentA must be positive");
      if (!isPosNum(spec.driftVelocityMs)) {
        issues.push("driftVelocityMs must be positive");
      }
    }
    return { valid: issues.length === 0, issues };
  },
  solve(spec): DomainSolveOutput {
    const mode = spec.mode as (typeof DRIFT_VELOCITY_MODES)[number];
    const n = spec.numberDensityM3 as number;
    const e = NCUK_ELEMENTARY_CHARGE_C;

    let areaM2: number;
    let diameterM: number;
    let diameterMm: number;
    let currentA: number;
    let driftVelocityMs: number;

    if (mode === "forward-v") {
      diameterMm = spec.diameterMm as number;
      diameterM = diameterMm * 1e-3;
      areaM2 = (Math.PI * diameterM * diameterM) / 4;
      currentA = spec.currentA as number;
      driftVelocityMs = currentA / (n * areaM2 * e);
    } else if (mode === "forward-i") {
      diameterMm = spec.diameterMm as number;
      diameterM = diameterMm * 1e-3;
      areaM2 = (Math.PI * diameterM * diameterM) / 4;
      driftVelocityMs = spec.driftVelocityMs as number;
      currentA = n * areaM2 * driftVelocityMs * e;
    } else {
      currentA = spec.currentA as number;
      driftVelocityMs = spec.driftVelocityMs as number;
      areaM2 = currentA / (n * driftVelocityMs * e);
      diameterM = Math.sqrt((4 * areaM2) / Math.PI);
      diameterMm = diameterM * 1e3;
    }

    const quantities: VerifiedQuantityMap = {
      numberDensityM3: n,
      areaM2,
      diameterM,
      diameterMm,
      currentA,
      driftVelocityMs,
      driftVelocityMmS: driftVelocityMs * 1e3,
      electronDriftDirection: "opposite to conventional current",
    };
    return {
      solverId: "sixthphysics/ncuk-ac4/drift-velocity-conduction/1.0.0",
      quantities,
    };
  },
};

/* ========================================================================== */
/*  2. pure-calculation :: charge-electron-count                              */
/* ========================================================================== */

const chargeElectronCountPlugin: DomainKindPlugin = {
  domain: "pure-calculation",
  kind: "charge-electron-count",
  summary:
    "Electric charge Q = It, electron count N_e = Q/|e|, and electrical work W = QV with mA and minute conversions.",
  requiredFields: [
    { name: "currentA", type: "number", unit: "A", bounds: "0.001..20" },
    { name: "timeS", type: "number", unit: "s", bounds: "1..7200" },
    { name: "voltageV", type: "number", unit: "V", bounds: "0.5..250" },
  ],
  physicalConstraints: [
    "Q = I t, N_e = Q / (1.60e-19 C), W = Q V = I V t.",
  ],
  probeSpecs: [
    {
      kind: "charge-electron-count",
      currentA: 0.35,
      timeS: 240,
      voltageV: 12,
    },
    {
      kind: "charge-electron-count",
      currentA: 1.6,
      timeS: 450,
      voltageV: 9,
    },
  ],
  validate(spec) {
    const issues: string[] = [];
    if (!isPosNum(spec.currentA)) issues.push("currentA must be positive");
    if (!isPosNum(spec.timeS)) issues.push("timeS must be positive");
    if (!isPosNum(spec.voltageV)) issues.push("voltageV must be positive");
    return { valid: issues.length === 0, issues };
  },
  solve(spec): DomainSolveOutput {
    const currentA = spec.currentA as number;
    const timeS = spec.timeS as number;
    const voltageV = spec.voltageV as number;
    const chargeC = currentA * timeS;
    const electronCount = chargeC / NCUK_ELEMENTARY_CHARGE_C;
    const workDoneJ = chargeC * voltageV;
    const powerW = currentA * voltageV;

    return {
      solverId: "sixthphysics/ncuk-ac4/charge-electron-count/1.0.0",
      quantities: {
        currentA,
        timeS,
        voltageV,
        chargeC,
        electronCount,
        workDoneJ,
        powerW,
        coulombDefinition:
          "charge passing a point when a steady current of one ampere flows for one second",
      },
    };
  },
};

/* ========================================================================== */
/*  3. pure-calculation :: cuboid-remelt-resistivity                          */
/* ========================================================================== */

const CUBOID_REMELT_MODES = ["cuboid-find-r", "cuboid-find-rho", "remelt"] as const;

const cuboidRemeltResistivityPlugin: DomainKindPlugin = {
  domain: "pure-calculation",
  kind: "cuboid-remelt-resistivity",
  summary:
    "Rectangular bar resistivity (A = w x h) and remelted/redrawn wire volume conservation (cube edge s = cbrt(AL), R_2 = R / k^4).",
  requiredFields: [
    { name: "mode", type: "string", enumValues: CUBOID_REMELT_MODES },
  ],
  optionalFields: [
    { name: "lengthMm", type: "number", unit: "mm", bounds: "5..500" },
    { name: "widthMm", type: "number", unit: "mm", bounds: "0.1..20" },
    { name: "heightMm", type: "number", unit: "mm", bounds: "0.1..20" },
    { name: "lengthM", type: "number", unit: "m", bounds: "0.2..30" },
    { name: "diameterMm", type: "number", unit: "mm", bounds: "0.05..5" },
    { name: "resistivityOhmM", type: "number", unit: "Ω m", bounds: "1e-9..1" },
    { name: "resistanceOhm", type: "number", unit: "Ω", bounds: "0.001..1e6" },
    { name: "voltageV", type: "number", unit: "V", bounds: "1..250" },
    { name: "redrawFactor", type: "number", bounds: "0.25..4" },
  ],
  physicalConstraints: [
    "For a rectangular strip with current along L, A = w * h and R = rho * L / A.",
    "During remelting or redrawing, metal volume V = A * L is conserved.",
  ],
  probeSpecs: [
    {
      kind: "cuboid-remelt-resistivity",
      mode: "cuboid-find-r",
      lengthMm: 50,
      widthMm: 1.2,
      heightMm: 0.5,
      resistivityOhmM: 3.6e-5,
      voltageV: 6,
    },
    {
      kind: "cuboid-remelt-resistivity",
      mode: "cuboid-find-rho",
      lengthMm: 40,
      widthMm: 1.0,
      heightMm: 0.4,
      resistanceOhm: 2.5,
    },
    {
      kind: "cuboid-remelt-resistivity",
      mode: "remelt",
      diameterMm: 0.3,
      lengthM: 4.0,
      resistivityOhmM: 1.1e-6,
      voltageV: 24,
      redrawFactor: 0.5,
    },
  ],
  validate(spec) {
    const issues: string[] = [];
    const mode = spec.mode;
    if (
      typeof mode !== "string" ||
      !(CUBOID_REMELT_MODES as readonly string[]).includes(mode)
    ) {
      issues.push("mode must be 'cuboid-find-r', 'cuboid-find-rho', or 'remelt'");
      return { valid: false, issues };
    }
    if (mode === "cuboid-find-r" || mode === "cuboid-find-rho") {
      if (!isPosNum(spec.lengthMm)) issues.push("lengthMm must be positive");
      if (!isPosNum(spec.widthMm)) issues.push("widthMm must be positive");
      if (!isPosNum(spec.heightMm)) issues.push("heightMm must be positive");
      if (mode === "cuboid-find-r" && !isPosNum(spec.resistivityOhmM)) {
        issues.push("resistivityOhmM must be positive");
      }
      if (mode === "cuboid-find-rho" && !isPosNum(spec.resistanceOhm)) {
        issues.push("resistanceOhm must be positive");
      }
      if (spec.voltageV !== undefined && !isPosNum(spec.voltageV)) {
        issues.push("voltageV must be positive if supplied");
      }
    } else {
      if (!isPosNum(spec.diameterMm)) issues.push("diameterMm must be positive");
      if (!isPosNum(spec.lengthM)) issues.push("lengthM must be positive");
      if (!isPosNum(spec.resistivityOhmM)) {
        issues.push("resistivityOhmM must be positive");
      }
      if (!isPosNum(spec.voltageV)) issues.push("voltageV must be positive");
      if (spec.redrawFactor !== undefined && !isPosNum(spec.redrawFactor)) {
        issues.push("redrawFactor must be positive if supplied");
      }
    }
    return { valid: issues.length === 0, issues };
  },
  solve(spec): DomainSolveOutput {
    const mode = spec.mode as (typeof CUBOID_REMELT_MODES)[number];
    if (mode === "cuboid-find-r" || mode === "cuboid-find-rho") {
      const lengthM = (spec.lengthMm as number) * 1e-3;
      const widthM = (spec.widthMm as number) * 1e-3;
      const heightM = (spec.heightMm as number) * 1e-3;
      const areaM2 = widthM * heightM;
      const resistanceOhm =
        mode === "cuboid-find-r"
          ? ((spec.resistivityOhmM as number) * lengthM) / areaM2
          : (spec.resistanceOhm as number);
      const resistivityOhmM =
        mode === "cuboid-find-r"
          ? (spec.resistivityOhmM as number)
          : (resistanceOhm * areaM2) / lengthM;
      const voltageV = isPosNum(spec.voltageV) ? spec.voltageV : 6;
      const powerW = (voltageV * voltageV) / resistanceOhm;
      const volumeM3 = areaM2 * lengthM;
      const cubeEdgeM = Math.cbrt(volumeM3);
      return {
        solverId: "sixthphysics/ncuk-ac4/cuboid-remelt-resistivity/1.0.0",
        quantities: {
          areaM2,
          resistanceOhm,
          resistivityOhmM,
          powerW,
          volumeM3,
          cubeEdgeM,
          cubeEdgeMm: cubeEdgeM * 1e3,
          resistivityDefinition:
            "resistance of a sample of unit length and unit cross sectional area",
        },
      };
    }

    const diameterMm = spec.diameterMm as number;
    const diameterM = diameterMm * 1e-3;
    const lengthM = spec.lengthM as number;
    const resistivityOhmM = spec.resistivityOhmM as number;
    const voltageV = spec.voltageV as number;
    const k = isPosNum(spec.redrawFactor) ? spec.redrawFactor : 0.5;
    const areaM2 = (Math.PI * diameterM * diameterM) / 4;
    const resistanceOhm = (resistivityOhmM * lengthM) / areaM2;
    const powerW = (voltageV * voltageV) / resistanceOhm;
    const volumeM3 = areaM2 * lengthM;
    const cubeEdgeM = Math.cbrt(volumeM3);
    const cubeEdgeMm = cubeEdgeM * 1e3;
    const redrawnResistanceOhm = resistanceOhm / k ** 4;

    return {
      solverId: "sixthphysics/ncuk-ac4/cuboid-remelt-resistivity/1.0.0",
      quantities: {
        areaM2,
        resistanceOhm,
        powerW,
        volumeM3,
        cubeEdgeM,
        cubeEdgeMm,
        redrawnResistanceOhm,
        volumeConservationRule:
          "total volume of metal stays constant when remelted or redrawn",
      },
    };
  },
};

/* ========================================================================== */
/*  4. pure-calculation :: two-load-battery-bulb                              */
/* ========================================================================== */

const TWO_LOAD_MODES = ["two-load", "appliance-rating"] as const;

const twoLoadBatteryBulbPlugin: DomainKindPlugin = {
  domain: "pure-calculation",
  kind: "two-load-battery-bulb",
  summary:
    "Open-circuit emf plus two-load internal resistance determination, and rated voltage/power appliance calculations.",
  requiredFields: [
    { name: "mode", type: "string", enumValues: TWO_LOAD_MODES },
  ],
  optionalFields: [
    { name: "emfV", type: "number", unit: "V", bounds: "1.5..24" },
    { name: "load1Ohm", type: "number", unit: "Ω", bounds: "0.5..100" },
    { name: "terminalPd1V", type: "number", unit: "V", bounds: "0.5..23" },
    { name: "load2Ohm", type: "number", unit: "Ω", bounds: "0.5..100" },
    { name: "ratedVoltageV", type: "number", unit: "V", bounds: "1.5..400" },
    { name: "ratedPowerW", type: "number", unit: "W", bounds: "0.5..5000" },
    { name: "timeMin", type: "number", unit: "min", bounds: "0.5..120" },
  ],
  physicalConstraints: [
    "In two-load mode, 0 < terminalPd1V < emfV so r > 0.",
    "In appliance-rating mode, I = P / V and R = V^2 / P.",
  ],
  probeSpecs: [
    {
      kind: "two-load-battery-bulb",
      mode: "two-load",
      emfV: 9.0,
      load1Ohm: 8.0,
      terminalPd1V: 7.2,
      load2Ohm: 4.0,
    },
    {
      kind: "two-load-battery-bulb",
      mode: "appliance-rating",
      ratedVoltageV: 12,
      ratedPowerW: 24,
      timeMin: 5,
    },
  ],
  validate(spec) {
    const issues: string[] = [];
    const mode = spec.mode;
    if (
      typeof mode !== "string" ||
      !(TWO_LOAD_MODES as readonly string[]).includes(mode)
    ) {
      issues.push("mode must be 'two-load' or 'appliance-rating'");
      return { valid: false, issues };
    }
    if (mode === "two-load") {
      if (!isPosNum(spec.emfV)) issues.push("emfV must be positive");
      if (!isPosNum(spec.load1Ohm)) issues.push("load1Ohm must be positive");
      if (!isPosNum(spec.terminalPd1V)) {
        issues.push("terminalPd1V must be positive");
      }
      if (!isPosNum(spec.load2Ohm)) issues.push("load2Ohm must be positive");
      if (
        isPosNum(spec.emfV) &&
        isPosNum(spec.terminalPd1V) &&
        spec.terminalPd1V >= spec.emfV
      ) {
        issues.push("terminalPd1V must be strictly less than emfV");
      }
    } else {
      if (!isPosNum(spec.ratedVoltageV)) {
        issues.push("ratedVoltageV must be positive");
      }
      if (!isPosNum(spec.ratedPowerW)) {
        issues.push("ratedPowerW must be positive");
      }
      if (spec.timeMin !== undefined && !isPosNum(spec.timeMin)) {
        issues.push("timeMin must be positive if supplied");
      }
    }
    return { valid: issues.length === 0, issues };
  },
  solve(spec): DomainSolveOutput {
    const mode = spec.mode as (typeof TWO_LOAD_MODES)[number];
    if (mode === "two-load") {
      const emfV = spec.emfV as number;
      const load1Ohm = spec.load1Ohm as number;
      const terminalPd1V = spec.terminalPd1V as number;
      const load2Ohm = spec.load2Ohm as number;

      const current1A = terminalPd1V / load1Ohm;
      const lostVolts1V = emfV - terminalPd1V;
      const internalResistanceOhm = lostVolts1V / current1A;
      const current2A = emfV / (load2Ohm + internalResistanceOhm);
      const terminalPd2V = current2A * load2Ohm;
      const lostVolts2V = current2A * internalResistanceOhm;
      const powerLoad2W = current2A * terminalPd2V;

      return {
        solverId: "sixthphysics/ncuk-ac4/two-load-battery-bulb/1.0.0",
        quantities: {
          emfV,
          current1A,
          lostVolts1V,
          internalResistanceOhm,
          current2A,
          terminalPd2V,
          lostVolts2V,
          powerLoad2W,
          emfDistinction:
            "electromotive force is electrical energy supplied per unit charge by the source whereas terminal potential difference is smaller due to lost volts across internal resistance",
        },
      };
    }

    const ratedVoltageV = spec.ratedVoltageV as number;
    const ratedPowerW = spec.ratedPowerW as number;
    const timeMin = isPosNum(spec.timeMin) ? spec.timeMin : 5;
    const ratedCurrentA = ratedPowerW / ratedVoltageV;
    const resistanceOhm = (ratedVoltageV * ratedVoltageV) / ratedPowerW;
    const energyTransferredJ = ratedPowerW * timeMin * 60;

    return {
      solverId: "sixthphysics/ncuk-ac4/two-load-battery-bulb/1.0.0",
      quantities: {
        ratedVoltageV,
        ratedPowerW,
        ratedCurrentA,
        resistanceOhm,
        energyTransferredJ,
        energyTransferredKJ: energyTransferredJ / 1e3,
        wattDefinition: "rate of energy transfer of one joule per second",
      },
    };
  },
};

/* ========================================================================== */
/*  5. circuits :: multi-loop-kirchhoff-cells                                 */
/* ========================================================================== */

const KIRCHHOFF_MODES = [
  "two-loop",
  "opposing-series",
  "parallel-identical",
] as const;

const multiLoopKirchhoffCellsPlugin: DomainKindPlugin = {
  domain: "circuits",
  kind: "multi-loop-kirchhoff-cells",
  summary:
    "Two-loop Kirchhoff DC network, opposing-polarity series cells loop, and parallel identical cells circuit with deterministic schematic SVG.",
  requiredFields: [
    { name: "mode", type: "string", enumValues: KIRCHHOFF_MODES },
  ],
  optionalFields: [
    { name: "emf1V", type: "number", unit: "V", bounds: "1.5..24" },
    { name: "emf2V", type: "number", unit: "V", bounds: "2.0..24" },
    { name: "r1Ohm", type: "number", unit: "Ω", bounds: "1..20000" },
    { name: "r2Ohm", type: "number", unit: "Ω", bounds: "1..20000" },
    { name: "r3Ohm", type: "number", unit: "Ω", bounds: "1..20000" },
    { name: "i3A", type: "number", unit: "A", bounds: "0.1..5" },
    { name: "v1V", type: "number", unit: "V", bounds: "0.2..20" },
    { name: "timeMin", type: "number", unit: "min", bounds: "1..15" },
    { name: "emfV", type: "number", unit: "V", bounds: "1.5..24" },
    { name: "loadOhm", type: "number", unit: "Ω", bounds: "1..500" },
  ],
  physicalConstraints: [
    "In two-loop mode, emf1V > i3A * r2Ohm so I_1 > 0.10 A.",
    "In opposing-series mode, emf2V > emf1V and emf2V - emf1V > v1V + 0.15 V.",
  ],
  probeSpecs: [
    {
      kind: "multi-loop-kirchhoff-cells",
      mode: "two-loop",
      emf1V: 12.0,
      r1Ohm: 4.0,
      r2Ohm: 6.0,
      r3Ohm: 5.0,
      i3A: 0.8,
    },
    {
      kind: "multi-loop-kirchhoff-cells",
      mode: "opposing-series",
      emf1V: 2.0,
      emf2V: 6.0,
      r1Ohm: 2000,
      v1V: 2.5,
      timeMin: 3,
    },
    {
      kind: "multi-loop-kirchhoff-cells",
      mode: "parallel-identical",
      emfV: 6.0,
      loadOhm: 12.0,
    },
  ],
  validate(spec) {
    const issues: string[] = [];
    const mode = spec.mode;
    if (
      typeof mode !== "string" ||
      !(KIRCHHOFF_MODES as readonly string[]).includes(mode)
    ) {
      issues.push(
        "mode must be 'two-loop', 'opposing-series', or 'parallel-identical'",
      );
      return { valid: false, issues };
    }
    if (mode === "two-loop") {
      if (!isPosNum(spec.emf1V)) issues.push("emf1V must be positive");
      if (!isPosNum(spec.r1Ohm)) issues.push("r1Ohm must be positive");
      if (!isPosNum(spec.r2Ohm)) issues.push("r2Ohm must be positive");
      if (!isPosNum(spec.r3Ohm)) issues.push("r3Ohm must be positive");
      if (!isPosNum(spec.i3A)) issues.push("i3A must be positive");
      if (
        isPosNum(spec.emf1V) &&
        isPosNum(spec.r1Ohm) &&
        isPosNum(spec.r2Ohm) &&
        isPosNum(spec.i3A)
      ) {
        const i1 = (spec.emf1V - spec.i3A * spec.r2Ohm) / (spec.r1Ohm + spec.r2Ohm);
        if (i1 <= 0.1) {
          issues.push("two-loop currents must yield positive I_1 > 0.1 A");
        }
      }
    } else if (mode === "opposing-series") {
      if (!isPosNum(spec.emf1V)) issues.push("emf1V must be positive");
      if (!isPosNum(spec.emf2V)) issues.push("emf2V must be positive");
      if (!isPosNum(spec.r1Ohm)) issues.push("r1Ohm must be positive");
      if (!isPosNum(spec.v1V)) issues.push("v1V must be positive");
      if (
        isPosNum(spec.emf1V) &&
        isPosNum(spec.emf2V) &&
        isPosNum(spec.v1V) &&
        spec.emf2V - spec.emf1V <= spec.v1V + 0.1
      ) {
        issues.push("emf2V - emf1V must exceed v1V by more than 0.1 V");
      }
    } else {
      if (!isPosNum(spec.emfV)) issues.push("emfV must be positive");
      if (!isPosNum(spec.loadOhm)) issues.push("loadOhm must be positive");
    }
    return { valid: issues.length === 0, issues };
  },
  solve(spec): DomainSolveOutput {
    const mode = spec.mode as (typeof KIRCHHOFF_MODES)[number];
    if (mode === "two-loop") {
      const emf1V = spec.emf1V as number;
      const r1Ohm = spec.r1Ohm as number;
      const r2Ohm = spec.r2Ohm as number;
      const r3Ohm = spec.r3Ohm as number;
      const i3A = spec.i3A as number;
      const i1A = (emf1V - i3A * r2Ohm) / (r1Ohm + r2Ohm);
      const i2A = i1A + i3A;
      const vMiddleV = i2A * r2Ohm;
      const emf2V = vMiddleV + i3A * r3Ohm;
      const powerR2W = i2A * i2A * r2Ohm;

      return {
        solverId: "sixthphysics/ncuk-ac4/multi-loop-kirchhoff-cells/1.0.0",
        quantities: {
          emf1V,
          r1Ohm,
          r2Ohm,
          r3Ohm,
          i3A,
          i1A,
          i2A,
          vMiddleV,
          emf2V,
          powerR2W,
          firstLawConservation: "conservation of electric charge",
          secondLawConservation: "conservation of energy",
        },
      };
    }

    if (mode === "opposing-series") {
      const emf1V = spec.emf1V as number;
      const emf2V = spec.emf2V as number;
      const r1Ohm = spec.r1Ohm as number;
      const v1V = spec.v1V as number;
      const timeMin = isPosNum(spec.timeMin) ? spec.timeMin : 3;
      const netEmfV = emf2V - emf1V;
      const currentA = v1V / r1Ohm;
      const v2V = netEmfV - v1V;
      const r2Ohm = v2V / currentA;
      const energyR1J = ((v1V * v1V) / r1Ohm) * timeMin * 60;

      return {
        solverId: "sixthphysics/ncuk-ac4/multi-loop-kirchhoff-cells/1.0.0",
        quantities: {
          emf1V,
          emf2V,
          r1Ohm,
          v1V,
          netEmfV,
          currentA,
          currentMa: currentA * 1e3,
          v2V,
          r2Ohm,
          r2Kohm: r2Ohm / 1e3,
          energyR1J,
          polarityRule:
            "opposing cells subtract to produce a smaller net electromotive force",
        },
      };
    }

    const emfV = spec.emfV as number;
    const loadOhm = spec.loadOhm as number;
    const terminalPdV = emfV;
    const mainCurrentA = emfV / loadOhm;
    const cellCurrentA = mainCurrentA / 2;
    const loadPowerW = (emfV * emfV) / loadOhm;

    return {
      solverId: "sixthphysics/ncuk-ac4/multi-loop-kirchhoff-cells/1.0.0",
      quantities: {
        emfV,
        loadOhm,
        terminalPdV,
        mainCurrentA,
        cellCurrentA,
        loadPowerW,
        parallelCellRule:
          "identical cells in parallel provide the same electromotive force as one cell while sharing the total current",
      },
    };
  },
  renderSvg(spec, options) {
    const mode = spec.mode as (typeof KIRCHHOFF_MODES)[number];
    const hidden = extractHiddenSet(spec, options);
    const arrowId = makeMarkerId("arr-k", options);
    const publicNumbers: number[] = [];
    const publicLabels: string[] = [];

    if (mode === "two-loop") {
      const emf1V = spec.emf1V as number;
      const r1Ohm = spec.r1Ohm as number;
      const r2Ohm = spec.r2Ohm as number;
      const r3Ohm = spec.r3Ohm as number;
      const i3A = spec.i3A as number;

      const lblE1 = `ε₁ = ${fmtCleanVal(emf1V, 3)} V`;
      const lblR1 = `R₁ = ${fmtCleanVal(r1Ohm, 3)} Ω`;
      const lblR2 = `R₂ = ${fmtCleanVal(r2Ohm, 3)} Ω`;
      const lblR3 = `R₃ = ${fmtCleanVal(r3Ohm, 3)} Ω`;
      const lblI3 = `I₃ = ${fmtCleanVal(i3A, 3)} A`;
      const lblE2 = hidden.has("emf2V") ? "ε₂ = ?" : "ε₂";
      const lblI1 = "I₁";
      const lblI2 = "I₂";

      publicNumbers.push(emf1V, r1Ohm, r2Ohm, r3Ohm, i3A);
      publicLabels.push(lblE1, lblR1, lblR2, lblR3, lblI3, lblE2, lblI1, lblI2, "P", "Q");

      const xL = 100;
      const xR = 560;
      const yTop = 80;
      const yMid = 195;
      const yBot = 310;

      const body = [
        // Outer and middle wires
        `<path d="M ${xL} ${yTop} H ${xR} V ${yBot} H ${xL} Z" fill="none" stroke="#171b1f" stroke-width="2.2"/>`,
        `<line x1="${xL}" y1="${yMid}" x2="${xR}" y2="${yMid}" stroke="#171b1f" stroke-width="2.2"/>`,
        drawJunction(xL, yMid),
        drawJunction(xR, yMid),
        svgText(xL - 18, yMid + 5, "P", { size: 15, weight: "700" }),
        svgText(xR + 18, yMid + 5, "Q", { size: 15, weight: "700" }),
        // Top branch: cell ε1 (+ right) + resistor R1
        drawCellH(235, yTop, "right"),
        svgText(235, yTop - 32, lblE1, { size: 14, weight: "600" }),
        drawResistorH(415, yTop),
        svgText(415, yTop - 22, lblR1, { size: 14, weight: "600" }),
        // Current arrow I1 (left-to-right on top rail)
        `<line x1="485" y1="${yTop - 16}" x2="532" y2="${yTop - 16}" stroke="#1d4ed8" stroke-width="2.2" marker-end="url(#${arrowId})"/>`,
        svgText(508, yTop - 25, lblI1, { size: 14, weight: "700", fill: "#1d4ed8" }),
        // Middle branch: resistor R2 + current arrow I2 (right-to-left)
        drawResistorH(330, yMid),
        svgText(330, yMid - 22, lblR2, { size: 14, weight: "600" }),
        `<line x1="485" y1="${yMid - 16}" x2="435" y2="${yMid - 16}" stroke="#1d4ed8" stroke-width="2.2" marker-end="url(#${arrowId})"/>`,
        svgText(460, yMid - 25, lblI2, { size: 14, weight: "700", fill: "#1d4ed8" }),
        // Bottom branch: cell ε2 (+ right) + resistor R3 + current arrow I3 (left-to-right)
        drawCellH(235, yBot, "right"),
        svgText(235, yBot + 42, lblE2, { size: 14, weight: "700", fill: "#b91c1c" }),
        drawResistorH(415, yBot),
        svgText(415, yBot + 34, lblR3, { size: 14, weight: "600" }),
        `<line x1="478" y1="${yBot + 20}" x2="530" y2="${yBot + 20}" stroke="#1d4ed8" stroke-width="2.2" marker-end="url(#${arrowId})"/>`,
        svgText(505, yBot + 40, lblI3, { size: 13, weight: "700", fill: "#1d4ed8" }),
      ].join("");

      return {
        visualFamily: "circuits",
        svgMarkup: wrapSvg({
          width: 660,
          height: 380,
          title: "Two-loop DC circuit with two cells and three resistors",
          defs: arrowDefs(arrowId, "#1d4ed8"),
          body,
        }),
        rendererVersion: NCUK_AC4_RENDERER_VERSION,
        publicNumbers,
        publicLabels,
      };
    }

    if (mode === "opposing-series") {
      const emf1V = spec.emf1V as number;
      const emf2V = spec.emf2V as number;
      const r1Ohm = spec.r1Ohm as number;
      const v1V = spec.v1V as number;
      const r1Label =
        r1Ohm >= 1000
          ? `R₁ = ${fmtCleanVal(r1Ohm / 1000, 3)} kΩ`
          : `R₁ = ${fmtCleanVal(r1Ohm, 3)} Ω`;
      const lblE1 = `ε₁ = ${fmtCleanVal(emf1V, 3)} V`;
      const lblE2 = `ε₂ = ${fmtCleanVal(emf2V, 3)} V`;
      const lblV1 = `V₁ = ${fmtCleanVal(v1V, 3)} V`;
      const lblR2 = "R₂ = ?";

      publicNumbers.push(emf1V, emf2V, r1Ohm, r1Ohm / 1000, v1V);
      publicLabels.push(lblE1, lblE2, r1Label, lblV1, lblR2, "V");

      const xL = 95;
      const xR = 545;
      const yTop = 85;
      const yBot = 230;

      const body = [
        `<rect x="${xL}" y="${yTop}" width="${xR - xL}" height="${yBot - yTop}" fill="none" stroke="#171b1f" stroke-width="2.2"/>`,
        // Opposing cells on top branch: ε1 (+ on right) facing ε2 (+ on left)
        drawCellH(235, yTop, "right"),
        svgText(235, yTop - 34, lblE1, { size: 14, weight: "600" }),
        drawCellH(405, yTop, "left"),
        svgText(405, yTop - 34, lblE2, { size: 14, weight: "600" }),
        // Bottom branch: R1 with parallel voltmeter, and unknown R2
        drawResistorH(225, yBot),
        svgText(225, yBot - 22, r1Label, { size: 14, weight: "600" }),
        // Voltmeter branch across R1
        `<path d="M 165 ${yBot} V 300 H 285 V ${yBot}" fill="none" stroke="#047857" stroke-width="1.9"/>`,
        drawJunction(165, yBot),
        drawJunction(285, yBot),
        drawMeter(225, 300, "V"),
        svgText(225, 338, lblV1, { size: 14, weight: "700", fill: "#047857" }),
        // Unknown resistor R2
        drawResistorH(430, yBot),
        svgText(430, yBot - 22, lblR2, { size: 14, weight: "700", fill: "#b91c1c" }),
      ].join("");

      return {
        visualFamily: "circuits",
        svgMarkup: wrapSvg({
          width: 640,
          height: 365,
          title: "Series DC loop with two opposing cells and two resistors",
          body,
        }),
        rendererVersion: NCUK_AC4_RENDERER_VERSION,
        publicNumbers,
        publicLabels,
      };
    }

    // mode === "parallel-identical"
    const emfV = spec.emfV as number;
    const loadOhm = spec.loadOhm as number;
    const lblE = `ε = ${fmtCleanVal(emfV, 3)} V`;
    const lblR = `R = ${fmtCleanVal(loadOhm, 3)} Ω`;
    publicNumbers.push(emfV, loadOhm);
    publicLabels.push(lblE, lblR, "A", "V");

    const body = [
      // Parallel cell block on left (x = 130..310, y = 80 and y = 160)
      `<path d="M 130 80 H 310 V 160 H 130 Z" fill="none" stroke="#171b1f" stroke-width="2.2"/>`,
      drawCellH(220, 80, "right"),
      svgText(220, 48, lblE, { size: 14, weight: "600" }),
      drawCellH(220, 160, "right"),
      svgText(220, 198, lblE, { size: 14, weight: "600" }),
      // Main wires from left/right midpoints to load and meters
      drawJunction(130, 120),
      drawJunction(310, 120),
      `<path d="M 310 120 H 530 V 280 H 130 V 120" fill="none" stroke="#171b1f" stroke-width="2.2"/>`,
      // Ammeter in main top-right branch
      drawMeter(425, 120, "A"),
      // Load resistor on bottom rail
      drawResistorH(340, 280),
      svgText(340, 314, lblR, { size: 14, weight: "600" }),
      // Voltmeter across the parallel cell terminals
      `<path d="M 130 120 H 65 V 225 H 370 V 120" fill="none" stroke="#047857" stroke-width="1.9" stroke-dasharray="6 4"/>`,
      drawJunction(370, 120),
      drawMeter(220, 225, "V"),
    ].join("");

    return {
      visualFamily: "circuits",
      svgMarkup: wrapSvg({
        width: 600,
        height: 345,
        title: "Two identical cells in parallel connected to a load resistor",
        body,
      }),
      rendererVersion: NCUK_AC4_RENDERER_VERSION,
      publicNumbers,
      publicLabels,
    };
  },
};

/* ========================================================================== */
/*  6. circuits :: symbolic-resistor-ladder                                   */
/* ========================================================================== */

const LADDER_MODES = ["symbolic", "three-stage-numeric"] as const;

const symbolicResistorLadderPlugin: DomainKindPlugin = {
  domain: "circuits",
  kind: "symbolic-resistor-ladder",
  summary:
    "Series-parallel symbolic R-multiple resistor network kR || (R + (mR || nR) + R) and 3-stage equal-resistor ladder between terminals P and Q.",
  requiredFields: [
    { name: "mode", type: "string", enumValues: LADDER_MODES },
  ],
  optionalFields: [
    { name: "topMult", type: "number", bounds: "1..20" },
    { name: "innerMultA", type: "number", bounds: "1..24" },
    { name: "innerMultB", type: "number", bounds: "1..24" },
    { name: "baseResistanceOhm", type: "number", unit: "Ω", bounds: "1..1000" },
    { name: "stage1Count", type: "number", bounds: "1..6" },
    { name: "stage2Count", type: "number", bounds: "1..6" },
    { name: "stage3Count", type: "number", bounds: "1..6" },
    { name: "supplyVoltageV", type: "number", unit: "V", bounds: "1..60" },
  ],
  physicalConstraints: [
    "All resistor multipliers and base resistances must be strictly positive.",
  ],
  probeSpecs: [
    {
      kind: "symbolic-resistor-ladder",
      mode: "symbolic",
      topMult: 4,
      innerMultA: 3,
      innerMultB: 6,
      baseResistanceOhm: 12,
    },
    {
      kind: "symbolic-resistor-ladder",
      mode: "three-stage-numeric",
      baseResistanceOhm: 12,
      stage1Count: 2,
      stage2Count: 3,
      stage3Count: 1,
      supplyVoltageV: 22,
    },
  ],
  validate(spec) {
    const issues: string[] = [];
    const mode = spec.mode;
    if (
      typeof mode !== "string" ||
      !(LADDER_MODES as readonly string[]).includes(mode)
    ) {
      issues.push("mode must be 'symbolic' or 'three-stage-numeric'");
      return { valid: false, issues };
    }
    if (mode === "symbolic") {
      if (!isPosNum(spec.topMult)) issues.push("topMult must be positive");
      if (!isPosNum(spec.innerMultA)) issues.push("innerMultA must be positive");
      if (!isPosNum(spec.innerMultB)) issues.push("innerMultB must be positive");
      if (
        spec.baseResistanceOhm !== undefined &&
        !isPosNum(spec.baseResistanceOhm)
      ) {
        issues.push("baseResistanceOhm must be positive");
      }
    } else {
      if (!isPosNum(spec.baseResistanceOhm)) {
        issues.push("baseResistanceOhm must be positive");
      }
      const s1 = spec.stage1Count ?? 2;
      const s2 = spec.stage2Count ?? 3;
      const s3 = spec.stage3Count ?? 1;
      for (const [label, n] of [
        ["stage1Count", s1],
        ["stage2Count", s2],
        ["stage3Count", s3],
      ] as const) {
        if (typeof n !== "number" || !Number.isInteger(n) || n < 1 || n > 6) {
          issues.push(`${label} must be an integer between 1 and 6`);
        }
      }
    }
    return { valid: issues.length === 0, issues };
  },
  solve(spec): DomainSolveOutput {
    const mode = spec.mode as (typeof LADDER_MODES)[number];
    if (mode === "symbolic") {
      const k = spec.topMult as number;
      const m = spec.innerMultA as number;
      const n = spec.innerMultB as number;
      const rBase = isPosNum(spec.baseResistanceOhm) ? spec.baseResistanceOhm : 1;
      const innerParallelMult = (m * n) / (m + n);
      const lowerBranchMult = 1 + innerParallelMult + 1;
      const equivalentMultiplier = (k * lowerBranchMult) / (k + lowerBranchMult);
      const equivalentResistanceOhm = equivalentMultiplier * rBase;
      const supplyV = isPosNum(spec.supplyVoltageV) ? spec.supplyVoltageV : 12;
      const totalCurrentA = supplyV / equivalentResistanceOhm;

      return {
        solverId: "sixthphysics/ncuk-ac4/symbolic-resistor-ladder/1.0.0",
        quantities: {
          topMult: k,
          innerMultA: m,
          innerMultB: n,
          innerParallelMult,
          lowerBranchMult,
          equivalentMultiplier,
          equivalentResistanceOhm,
          totalCurrentA,
          parallelRule:
            "adding resistors in parallel reduces combined resistance below the smallest individual branch resistance",
        },
      };
    }

    const r0 = spec.baseResistanceOhm as number;
    const s1 = (spec.stage1Count as number | undefined) ?? 2;
    const s2 = (spec.stage2Count as number | undefined) ?? 3;
    const s3 = (spec.stage3Count as number | undefined) ?? 1;
    const stage1Ohm = r0 / s1;
    const stage2Ohm = r0 / s2;
    const stage3Ohm = r0 / s3;
    const equivalentResistanceOhm = stage1Ohm + stage2Ohm + stage3Ohm;
    const supplyV = isPosNum(spec.supplyVoltageV) ? spec.supplyVoltageV : 12;
    const totalCurrentA = supplyV / equivalentResistanceOhm;
    const totalPowerW = supplyV * totalCurrentA;

    return {
      solverId: "sixthphysics/ncuk-ac4/symbolic-resistor-ladder/1.0.0",
      quantities: {
        baseResistanceOhm: r0,
        stage1Ohm,
        stage2Ohm,
        stage3Ohm,
        equivalentResistanceOhm,
        totalCurrentA,
        totalPowerW,
      },
    };
  },
  renderSvg(spec) {
    const mode = spec.mode as (typeof LADDER_MODES)[number];
    const publicNumbers: number[] = [];
    const publicLabels: string[] = ["P", "Q"];

    if (mode === "symbolic") {
      const k = spec.topMult as number;
      const m = spec.innerMultA as number;
      const n = spec.innerMultB as number;
      const lblK = fmtCoeffR(k);
      const lblM = fmtCoeffR(m);
      const lblN = fmtCoeffR(n);
      publicNumbers.push(k, m, n, 1);
      publicLabels.push(lblK, lblM, lblN, "R");

      const body = [
        // Terminals P and Q
        `<line x1="48" y1="165" x2="105" y2="165" stroke="#171b1f" stroke-width="2.2"/>`,
        `<line x1="575" y1="165" x2="632" y2="165" stroke="#171b1f" stroke-width="2.2"/>`,
        drawTerminal(48, 165),
        drawTerminal(632, 165),
        svgText(32, 170, "P", { size: 16, weight: "700" }),
        svgText(648, 170, "Q", { size: 16, weight: "700" }),
        // Outer parallel split (top branch kR, lower branch R + (mR || nR) + R)
        drawJunction(105, 165),
        drawJunction(575, 165),
        `<path d="M 105 165 V 70 H 575 V 165" fill="none" stroke="#171b1f" stroke-width="2.2"/>`,
        `<path d="M 105 165 V 225 H 255 M 425 225 H 575 V 165" fill="none" stroke="#171b1f" stroke-width="2.2"/>`,
        // Top resistor kR
        drawResistorH(340, 70),
        svgText(340, 48, lblK, { size: 15, weight: "700" }),
        // Left series R on lower branch
        drawResistorH(180, 225, 28, 10),
        svgText(180, 205, "R", { size: 15, weight: "700" }),
        // Inner parallel block (mR || nR) between x=255 and x=425
        drawJunction(255, 225),
        drawJunction(425, 225),
        `<path d="M 255 225 V 180 H 425 V 225" fill="none" stroke="#171b1f" stroke-width="2.2"/>`,
        `<path d="M 255 225 V 270 H 425 V 225" fill="none" stroke="#171b1f" stroke-width="2.2"/>`,
        drawResistorH(340, 180, 30, 10),
        svgText(340, 160, lblM, { size: 15, weight: "700" }),
        drawResistorH(340, 270, 30, 10),
        svgText(340, 302, lblN, { size: 15, weight: "700" }),
        // Right series R on lower branch
        drawResistorH(500, 225, 28, 10),
        svgText(500, 205, "R", { size: 15, weight: "700" }),
      ].join("");

      return {
        visualFamily: "circuits",
        svgMarkup: wrapSvg({
          width: 680,
          height: 335,
          title: "Series-parallel resistor network between terminals P and Q",
          body,
        }),
        rendererVersion: NCUK_AC4_RENDERER_VERSION,
        publicNumbers,
        publicLabels,
      };
    }

    // mode === "three-stage-numeric"
    const r0 = spec.baseResistanceOhm as number;
    const s1 = (spec.stage1Count as number | undefined) ?? 2;
    const s2 = (spec.stage2Count as number | undefined) ?? 3;
    const s3 = (spec.stage3Count as number | undefined) ?? 1;
    const lblEach = `${fmtCleanVal(r0, 3)} Ω`;
    const note = `Each resistor = ${lblEach}`;
    publicNumbers.push(r0);
    publicLabels.push(lblEach, note);

    const parts: string[] = [
      svgText(340, 34, note, { size: 14, weight: "600", fill: "#334155" }),
      `<line x1="44" y1="175" x2="92" y2="175" stroke="#171b1f" stroke-width="2.2"/>`,
      `<line x1="600" y1="175" x2="640" y2="175" stroke="#171b1f" stroke-width="2.2"/>`,
      drawTerminal(44, 175),
      drawTerminal(640, 175),
      svgText(28, 180, "P", { size: 16, weight: "700" }),
      svgText(656, 180, "Q", { size: 16, weight: "700" }),
    ];

    const drawStage = (xStart: number, xEnd: number, count: number): void => {
      const cx = (xStart + xEnd) / 2;
      if (count === 1) {
        parts.push(
          `<line x1="${xStart}" y1="175" x2="${xEnd}" y2="175" stroke="#171b1f" stroke-width="2.2"/>`,
          drawResistorH(cx, 175, 28, 10),
          svgText(cx, 156, lblEach, { size: 12, weight: "600" }),
        );
        return;
      }
      const spacing = count <= 2 ? 78 : count === 3 ? 62 : 48;
      const topY = 175 - ((count - 1) * spacing) / 2;
      const botY = 175 + ((count - 1) * spacing) / 2;
      parts.push(
        drawJunction(xStart, 175),
        drawJunction(xEnd, 175),
        `<line x1="${xStart}" y1="${fmtCoord(topY)}" x2="${xStart}" y2="${fmtCoord(botY)}" stroke="#171b1f" stroke-width="2.2"/>`,
        `<line x1="${xEnd}" y1="${fmtCoord(topY)}" x2="${xEnd}" y2="${fmtCoord(botY)}" stroke="#171b1f" stroke-width="2.2"/>`,
      );
      for (let i = 0; i < count; i += 1) {
        const y = topY + i * spacing;
        parts.push(
          `<line x1="${xStart}" y1="${fmtCoord(y)}" x2="${xEnd}" y2="${fmtCoord(y)}" stroke="#171b1f" stroke-width="2.2"/>`,
          drawResistorH(cx, y, 26, 9),
          svgText(cx, y - 14, lblEach, { size: 11, weight: "600" }),
        );
      }
    };

    drawStage(92, 225, s1);
    parts.push(`<line x1="225" y1="175" x2="265" y2="175" stroke="#171b1f" stroke-width="2.2"/>`);
    drawStage(265, 415, s2);
    parts.push(`<line x1="415" y1="175" x2="465" y2="175" stroke="#171b1f" stroke-width="2.2"/>`);
    drawStage(465, 600, s3);

    return {
      visualFamily: "circuits",
      svgMarkup: wrapSvg({
        width: 684,
        height: 330,
        title: "Three-stage equal-resistor network between terminals P and Q",
        body: parts.join(""),
      }),
      rendererVersion: NCUK_AC4_RENDERER_VERSION,
      publicNumbers,
      publicLabels,
    };
  },
};

/* ========================================================================== */
/*  7. circuits :: internal-resistance-experiment (10m IFYPH005 flagship)     */
/* ========================================================================== */

const internalResistanceExperimentPlugin: DomainKindPlugin = {
  domain: "circuits",
  kind: "internal-resistance-experiment",
  summary:
    "IFYPH005 10-mark experimental determination of cell emf and internal resistance with variable resistor, two-point (I, V) data, and connecting-lead resistivity evaluation.",
  requiredFields: [
    { name: "i1A", type: "number", unit: "A", bounds: "0.15..1.5" },
    { name: "v1V", type: "number", unit: "V", bounds: "0.8..12.0" },
    { name: "i2A", type: "number", unit: "A", bounds: "0.6..3.5" },
    { name: "v2V", type: "number", unit: "V", bounds: "0.35..11.0" },
    { name: "wireLengthM", type: "number", unit: "m", bounds: "0.2..1.5" },
    { name: "wireAreaM2", type: "number", unit: "m²", bounds: "1e-7..5e-6" },
    { name: "wireCurrentA", type: "number", unit: "A", bounds: "0.5..5.0" },
    { name: "wireVoltageV", type: "number", unit: "V", bounds: "0.002..0.5" },
    { name: "totalLeadMultiplier", type: "number", bounds: "2..10" },
  ],
  physicalConstraints: [
    "i2A > i1A and v1V > v2V > 0.30 V so r = (v1V - v2V) / (i2A - i1A) > 0.",
    "Connecting-lead resistance R_leads << r so effect on measured emf is negligible.",
  ],
  probeSpecs: [
    {
      kind: "internal-resistance-experiment",
      i1A: 0.4,
      v1V: 5.68,
      i2A: 1.4,
      v2V: 4.88,
      wireLengthM: 0.5,
      wireAreaM2: 8.0e-7,
      wireCurrentA: 2.0,
      wireVoltageV: 0.022,
      totalLeadMultiplier: 5,
    },
    {
      kind: "internal-resistance-experiment",
      i1A: 0.5,
      v1V: 2.6,
      i2A: 1.5,
      v2V: 1.8,
      wireLengthM: 0.6,
      wireAreaM2: 6.0e-7,
      wireCurrentA: 1.5,
      wireVoltageV: 0.027,
      totalLeadMultiplier: 4,
    },
  ],
  validate(spec) {
    const issues: string[] = [];
    for (const k of [
      "i1A",
      "v1V",
      "i2A",
      "v2V",
      "wireLengthM",
      "wireAreaM2",
      "wireCurrentA",
      "wireVoltageV",
      "totalLeadMultiplier",
    ]) {
      if (!isPosNum(spec[k])) issues.push(`${k} must be positive`);
    }
    if (isPosNum(spec.i1A) && isPosNum(spec.i2A) && spec.i2A <= spec.i1A) {
      issues.push("i2A must exceed i1A");
    }
    if (isPosNum(spec.v1V) && isPosNum(spec.v2V) && spec.v1V <= spec.v2V) {
      issues.push("v1V must exceed v2V");
    }
    return { valid: issues.length === 0, issues };
  },
  solve(spec): DomainSolveOutput {
    const i1A = spec.i1A as number;
    const v1V = spec.v1V as number;
    const i2A = spec.i2A as number;
    const v2V = spec.v2V as number;
    const wireLengthM = spec.wireLengthM as number;
    const wireAreaM2 = spec.wireAreaM2 as number;
    const wireCurrentA = spec.wireCurrentA as number;
    const wireVoltageV = spec.wireVoltageV as number;
    const totalLeadMultiplier = spec.totalLeadMultiplier as number;

    const internalResistanceOhm = (v1V - v2V) / (i2A - i1A);
    const emfV = v1V + i1A * internalResistanceOhm;
    const wireResistanceOhm = wireVoltageV / wireCurrentA;
    const wireResistivityOhmM = (wireResistanceOhm * wireAreaM2) / wireLengthM;
    const totalLeadLengthM = totalLeadMultiplier * wireLengthM;
    const totalLeadResistanceOhm = totalLeadMultiplier * wireResistanceOhm;

    return {
      solverId: "sixthphysics/ncuk-ac4/internal-resistance-experiment/1.0.0",
      quantities: {
        i1A,
        v1V,
        i2A,
        v2V,
        internalResistanceOhm,
        emfV,
        wireResistanceOhm,
        wireResistivityOhmM,
        totalLeadLengthM,
        totalLeadResistanceOhm,
        procedureSummary:
          "adjust the variable resistor to obtain a range of ammeter and voltmeter readings and open the switch between readings to minimise cell heating",
        graphFeaturesSummary:
          "straight line with a negative gradient equal to minus the internal resistance and a vertical intercept equal to the electromotive force",
        leadEffectSummary:
          "negligible effect on the measured electromotive force because the lead resistance is very small and produces zero potential drop at zero current",
      },
    };
  },
  renderSvg(_spec, options) {
    const arrowId = makeMarkerId("arr-vr", options);
    const publicLabels = ["ε", "r", "Cell under test", "S", "A", "V", "Variable resistor"];

    const body = [
      // Dashed enclosure for real cell (ε, r)
      `<rect x="175" y="42" width="230" height="84" rx="6" fill="#f8fafc" stroke="#64748b" stroke-width="1.6" stroke-dasharray="6 4"/>`,
      svgText(290, 32, "Cell under test", { size: 13, weight: "600", fill: "#475569" }),
      // Main outer loop (x = 120..520, y = 84..270)
      `<rect x="120" y="84" width="400" height="186" fill="none" stroke="#171b1f" stroke-width="2.2"/>`,
      // Cell ε and internal resistance r inside dashed box
      drawCellH(235, 84, "left"),
      svgText(235, 118, "ε", { size: 15, weight: "700" }),
      drawResistorH(345, 84, 28, 10),
      svgText(345, 115, "r", { size: 15, weight: "700" }),
      // Push switch S on right upper branch
      drawSwitchH(462, 84, 18),
      svgText(462, 58, "S", { size: 14, weight: "700", fill: "#b91c1c" }),
      // Ammeter in series on left vertical wire
      drawMeter(120, 178, "A"),
      // Voltmeter across cell terminals (top parallel branch at y = 178)
      `<path d="M 155 84 V 178 H 425 V 84" fill="none" stroke="#047857" stroke-width="2"/>`,
      drawJunction(155, 84),
      drawJunction(425, 84),
      drawMeter(290, 178, "V"),
      // Variable resistor on bottom rail
      drawResistorH(320, 270, 42, 13),
      `<line x1="274" y1="302" x2="366" y2="238" stroke="#171b1f" stroke-width="2" marker-end="url(#${arrowId})"/>`,
      svgText(320, 322, "Variable resistor", { size: 14, weight: "600" }),
    ].join("");

    return {
      visualFamily: "circuits",
      svgMarkup: wrapSvg({
        width: 600,
        height: 345,
        title: "Experimental circuit for determining cell electromotive force and internal resistance",
        defs: arrowDefs(arrowId, "#171b1f"),
        body,
      }),
      rendererVersion: NCUK_AC4_RENDERER_VERSION,
      publicNumbers: [],
      publicLabels,
    };
  },
};

/* ========================================================================== */
/*  8. em-induction :: switched-rc-multistage (10m IFYPH005 flagship)         */
/* ========================================================================== */

const QUALITATIVE_R_CHANGE = ["smaller", "larger"] as const;

const switchedRcMultistagePlugin: DomainKindPlugin = {
  domain: "em-induction",
  kind: "switched-rc-multistage",
  summary:
    "IFYPH005 10-mark two-stage switched RC discharge circuit: charge to V_0 via Sw A, discharge via R_1 (Sw B), then add parallel R_2 (Sw C).",
  requiredFields: [
    { name: "supplyVoltageV", type: "number", unit: "V", bounds: "4.0..20.0" },
    { name: "capacitanceUf", type: "number", unit: "μF", bounds: "50..1000" },
    { name: "r1Kohm", type: "number", unit: "kΩ", bounds: "10..120" },
    { name: "r2Kohm", type: "number", unit: "kΩ", bounds: "10..120" },
    { name: "stage1TimeS", type: "number", unit: "s", bounds: "1..60" },
    { name: "stage2TimeS", type: "number", unit: "s", bounds: "1..60" },
    {
      name: "qualitativeDirection",
      type: "string",
      enumValues: QUALITATIVE_R_CHANGE,
    },
  ],
  physicalConstraints: [
    "Stage 1: tau_1 = R_1 C, V_1 = V_0 exp(-t_1 / tau_1).",
    "Stage 2: R_eq = R_1 R_2 / (R_1 + R_2), tau_2 = R_eq C, V_2 = V_1 exp(-t_2 / tau_2).",
  ],
  probeSpecs: [
    {
      kind: "switched-rc-multistage",
      supplyVoltageV: 12.0,
      capacitanceUf: 400,
      r1Kohm: 30,
      r2Kohm: 15,
      stage1TimeS: 8.0,
      stage2TimeS: 4.0,
      qualitativeDirection: "smaller",
    },
    {
      kind: "switched-rc-multistage",
      supplyVoltageV: 9.0,
      capacitanceUf: 250,
      r1Kohm: 60,
      r2Kohm: 30,
      stage1TimeS: 10.0,
      stage2TimeS: 6.0,
      qualitativeDirection: "larger",
    },
  ],
  validate(spec) {
    const issues: string[] = [];
    for (const k of [
      "supplyVoltageV",
      "capacitanceUf",
      "r1Kohm",
      "r2Kohm",
      "stage1TimeS",
      "stage2TimeS",
    ]) {
      if (!isPosNum(spec[k])) issues.push(`${k} must be positive`);
    }
    if (
      typeof spec.qualitativeDirection !== "string" ||
      !(QUALITATIVE_R_CHANGE as readonly string[]).includes(
        spec.qualitativeDirection,
      )
    ) {
      issues.push("qualitativeDirection must be 'smaller' or 'larger'");
    }
    return { valid: issues.length === 0, issues };
  },
  solve(spec): DomainSolveOutput {
    const v0 = spec.supplyVoltageV as number;
    const cUf = spec.capacitanceUf as number;
    const r1K = spec.r1Kohm as number;
    const r2K = spec.r2Kohm as number;
    const t1 = spec.stage1TimeS as number;
    const t2 = spec.stage2TimeS as number;
    const dir = spec.qualitativeDirection as (typeof QUALITATIVE_R_CHANGE)[number];

    const cF = cUf * 1e-6;
    const r1Ohm = r1K * 1e3;
    const r2Ohm = r2K * 1e3;
    const tau1S = r1Ohm * cF;
    const v1V = v0 * Math.exp(-t1 / tau1S);
    const rParallelOhm = (r1Ohm * r2Ohm) / (r1Ohm + r2Ohm);
    const rParallelKohm = rParallelOhm / 1e3;
    const tau2S = rParallelOhm * cF;
    const v2V = v1V * Math.exp(-t2 / tau2S);
    const initialChargeC = cF * v0;
    const initialEnergyJ = 0.5 * cF * v0 * v0;

    const qualitativeEffect =
      dir === "smaller"
        ? "smaller final potential difference because the time constant decreases and the capacitor discharges more rapidly"
        : "larger final potential difference because the time constant increases and the capacitor discharges more slowly";

    return {
      solverId: "sixthphysics/ncuk-ac4/switched-rc-multistage/1.0.0",
      quantities: {
        supplyVoltageV: v0,
        capacitanceF: cF,
        tau1S,
        v1V,
        rParallelOhm,
        rParallelKohm,
        tau2S,
        v2V,
        initialChargeC,
        initialEnergyJ,
        faradDefinition:
          "capacitance that stores one coulomb of charge per volt of potential difference across the plates",
        qualitativeEffect,
      },
    };
  },
  renderSvg(spec) {
    const v0 = spec.supplyVoltageV as number;
    const cUf = spec.capacitanceUf as number;
    const r1K = spec.r1Kohm as number;
    const r2K = spec.r2Kohm as number;

    const lblV0 = `V₀ = ${fmtCleanVal(v0, 3)} V`;
    const lblC = `C = ${fmtCleanVal(cUf, 3)} μF`;
    const lblR1 = `R₁ = ${fmtCleanVal(r1K, 3)} kΩ`;
    const lblR2 = `R₂ = ${fmtCleanVal(r2K, 3)} kΩ`;
    const publicNumbers = [v0, cUf, cUf * 1e-6, r1K, r1K * 1e3, r2K, r2K * 1e3];
    const publicLabels = [lblV0, lblC, lblR1, lblR2, "Sw A", "Sw B", "Sw C"];

    const yTop = 76;
    const yBot = 284;
    const xSup = 95;
    const xCap = 265;
    const xR1 = 425;
    const xR2 = 580;

    const body = [
      // Top and bottom bus rails
      `<line x1="${xSup}" y1="${yTop}" x2="${xR2}" y2="${yTop}" stroke="#171b1f" stroke-width="2.2"/>`,
      `<line x1="${xSup}" y1="${yBot}" x2="${xR2}" y2="${yBot}" stroke="#171b1f" stroke-width="2.2"/>`,
      // Vertical branches
      `<line x1="${xSup}" y1="${yTop}" x2="${xSup}" y2="${yBot}" stroke="#171b1f" stroke-width="2.2"/>`,
      `<line x1="${xCap}" y1="${yTop}" x2="${xCap}" y2="${yBot}" stroke="#171b1f" stroke-width="2.2"/>`,
      `<line x1="${xR1}" y1="${yTop}" x2="${xR1}" y2="${yBot}" stroke="#171b1f" stroke-width="2.2"/>`,
      `<line x1="${xR2}" y1="${yTop}" x2="${xR2}" y2="${yBot}" stroke="#171b1f" stroke-width="2.2"/>`,
      // Junctions
      drawJunction(xCap, yTop),
      drawJunction(xCap, yBot),
      drawJunction(xR1, yTop),
      drawJunction(xR1, yBot),
      // Supply V0 on left branch
      drawCellV(xSup, 180),
      svgText(xSup - 16, 146, lblV0, { anchor: "end", size: 13, weight: "600" }),
      // Switch A on top rail between supply and capacitor
      drawSwitchH(180, yTop, 18),
      svgText(180, yTop - 24, "Sw A", { size: 13, weight: "700", fill: "#b91c1c" }),
      // Capacitor C
      drawCapacitorV(xCap, 180),
      svgText(xCap + 26, 185, lblC, { anchor: "start", size: 13, weight: "600" }),
      // Branch R1 with Switch B
      drawSwitchV(xR1, 126, 16),
      svgText(xR1 + 24, 130, "Sw B", { anchor: "start", size: 13, weight: "700", fill: "#b91c1c" }),
      drawResistorV(xR1, 224),
      svgText(xR1 + 20, 229, lblR1, { anchor: "start", size: 13, weight: "600" }),
      // Branch R2 with Switch C
      drawSwitchV(xR2, 126, 16),
      svgText(xR2 + 24, 130, "Sw C", { anchor: "start", size: 13, weight: "700", fill: "#b91c1c" }),
      drawResistorV(xR2, 224),
      svgText(xR2 + 20, 229, lblR2, { anchor: "start", size: 13, weight: "600" }),
    ].join("");

    return {
      visualFamily: "em-induction",
      svgMarkup: wrapSvg({
        width: 720,
        height: 330,
        title: "Switched resistor-capacitor circuit with three switches and two discharge branches",
        body,
      }),
      rendererVersion: NCUK_AC4_RENDERER_VERSION,
      publicNumbers,
      publicLabels,
    };
  },
};

/* ========================================================================== */
/*  9. em-induction :: capacitor-breakdown-rating                             */
/* ========================================================================== */

const capacitorBreakdownRatingPlugin: DomainKindPlugin = {
  domain: "em-induction",
  kind: "capacitor-breakdown-rating",
  summary:
    "Series-parallel 3-capacitor network C_1 in series with (C_2 || C_3) where each capacitor has max voltage rating V_max.",
  requiredFields: [
    { name: "c1Uf", type: "number", unit: "μF", bounds: "10..500" },
    { name: "c2Uf", type: "number", unit: "μF", bounds: "10..500" },
    { name: "c3Uf", type: "number", unit: "μF", bounds: "10..500" },
    { name: "maxRatingV", type: "number", unit: "V", bounds: "10..250" },
  ],
  physicalConstraints: [
    "In series, charge Q is identical so the smaller of C_1 and (C_2 + C_3) reaches V_max first.",
    "V_AB,max = V_max * (1 + min(C_1, C_p) / max(C_1, C_p)).",
  ],
  probeSpecs: [
    {
      kind: "capacitor-breakdown-rating",
      c1Uf: 60,
      c2Uf: 80,
      c3Uf: 40,
      maxRatingV: 50,
    },
    {
      kind: "capacitor-breakdown-rating",
      c1Uf: 120,
      c2Uf: 25,
      c3Uf: 35,
      maxRatingV: 40,
    },
  ],
  validate(spec) {
    const issues: string[] = [];
    for (const k of ["c1Uf", "c2Uf", "c3Uf", "maxRatingV"]) {
      if (!isPosNum(spec[k])) issues.push(`${k} must be positive`);
    }
    return { valid: issues.length === 0, issues };
  },
  solve(spec): DomainSolveOutput {
    const c1Uf = spec.c1Uf as number;
    const c2Uf = spec.c2Uf as number;
    const c3Uf = spec.c3Uf as number;
    const maxRatingV = spec.maxRatingV as number;

    const cParallelUf = c2Uf + c3Uf;
    const cTotalUf = (c1Uf * cParallelUf) / (c1Uf + cParallelUf);
    const cTotalF = cTotalUf * 1e-6;

    const c1LimitsFirst = c1Uf <= cParallelUf;
    const v1AtLimitV = c1LimitsFirst
      ? maxRatingV
      : maxRatingV * (cParallelUf / c1Uf);
    const vpAtLimitV = c1LimitsFirst
      ? maxRatingV * (c1Uf / cParallelUf)
      : maxRatingV;
    const maxSafeTotalV = v1AtLimitV + vpAtLimitV;
    const maxChargeC = cTotalF * maxSafeTotalV;
    const maxEnergyJ = 0.5 * cTotalF * maxSafeTotalV * maxSafeTotalV;

    return {
      solverId: "sixthphysics/ncuk-ac4/capacitor-breakdown-rating/1.0.0",
      quantities: {
        c1Uf,
        c2Uf,
        c3Uf,
        cParallelUf,
        cTotalUf,
        cTotalF,
        maxRatingV,
        v1AtLimitV,
        vpAtLimitV,
        maxSafeTotalV,
        maxChargeC,
        maxChargeMc: maxChargeC * 1e3,
        maxEnergyJ,
        maxEnergyMj: maxEnergyJ * 1e3,
        limitingBlock: c1LimitsFirst
          ? "single series capacitor"
          : "parallel pair of capacitors",
      },
    };
  },
  renderSvg(spec) {
    const c1Uf = spec.c1Uf as number;
    const c2Uf = spec.c2Uf as number;
    const c3Uf = spec.c3Uf as number;
    const maxRatingV = spec.maxRatingV as number;

    const lblC1 = `C₁ = ${fmtCleanVal(c1Uf, 3)} μF`;
    const lblC2 = `C₂ = ${fmtCleanVal(c2Uf, 3)} μF`;
    const lblC3 = `C₃ = ${fmtCleanVal(c3Uf, 3)} μF`;
    const note = `Max safe rating per capacitor: ${fmtCleanVal(maxRatingV, 3)} V`;

    const publicNumbers = [
      c1Uf,
      c1Uf * 1e-6,
      c2Uf,
      c2Uf * 1e-6,
      c3Uf,
      c3Uf * 1e-6,
      maxRatingV,
    ];
    const publicLabels = [lblC1, lblC2, lblC3, note, "A", "B"];

    const body = [
      svgText(320, 36, note, { size: 14, weight: "600", fill: "#b91c1c" }),
      // Left terminal A -> C1 -> junction
      `<line x1="60" y1="165" x2="295" y2="165" stroke="#171b1f" stroke-width="2.2"/>`,
      drawTerminal(60, 165),
      svgText(42, 170, "A", { size: 16, weight: "700" }),
      drawCapacitorH(180, 165),
      svgText(180, 130, lblC1, { size: 14, weight: "600" }),
      // Parallel section (C2 top, C3 bottom) between x = 295 and x = 515
      drawJunction(295, 165),
      drawJunction(515, 165),
      `<path d="M 295 165 V 105 H 515 V 165" fill="none" stroke="#171b1f" stroke-width="2.2"/>`,
      `<path d="M 295 165 V 225 H 515 V 165" fill="none" stroke="#171b1f" stroke-width="2.2"/>`,
      drawCapacitorH(405, 105),
      svgText(405, 76, lblC2, { size: 14, weight: "600" }),
      drawCapacitorH(405, 225),
      svgText(405, 268, lblC3, { size: 14, weight: "600" }),
      // Right terminal B
      `<line x1="515" y1="165" x2="585" y2="165" stroke="#171b1f" stroke-width="2.2"/>`,
      drawTerminal(585, 165),
      svgText(603, 170, "B", { size: 16, weight: "700" }),
    ].join("");

    return {
      visualFamily: "em-induction",
      svgMarkup: wrapSvg({
        width: 640,
        height: 300,
        title: "Series-parallel capacitor network between terminals A and B",
        body,
      }),
      rendererVersion: NCUK_AC4_RENDERER_VERSION,
      publicNumbers,
      publicLabels,
    };
  },
};

/* ========================================================================== */
/*  10. graphs :: component-iv-curve                                          */
/* ========================================================================== */

const IV_CURVE_MODES = [
  "component-characteristic",
  "tabulated-iv-resistivity",
] as const;

const IV_COMPONENTS = [
  "ohmic-resistor",
  "filament-lamp",
  "led-diode",
  "ntc-thermistor",
  "ldr",
] as const;

type IvComponentType = (typeof IV_COMPONENTS)[number];

const componentIvCurvePlugin: DomainKindPlugin = {
  domain: "graphs",
  kind: "component-iv-curve",
  summary:
    "NCUK I-V characteristic graphs (I on y-axis, V on x-axis so gradient = 1/R) for ohmic resistors, filament lamps, LEDs, thermistors/LDRs, and tabulated wire resistivity plots.",
  requiredFields: [
    { name: "mode", type: "string", enumValues: IV_CURVE_MODES },
  ],
  optionalFields: [
    { name: "componentType", type: "string", enumValues: IV_COMPONENTS },
    { name: "maxVoltageV", type: "number", unit: "V", bounds: "2..15" },
    { name: "resistanceOhm", type: "number", unit: "Ω", bounds: "1..500" },
    { name: "thresholdV", type: "number", unit: "V", bounds: "0.5..3.0" },
    { name: "operatingVoltageV", type: "number", unit: "V", bounds: "1..12" },
    { name: "operatingCurrentA", type: "number", unit: "A", bounds: "0.005..3.0" },
    { name: "highStateResistanceOhm", type: "number", unit: "Ω", bounds: "1..200" },
    { name: "lengthM", type: "number", unit: "m", bounds: "0.4..4.0" },
    { name: "areaM2", type: "number", unit: "m²", bounds: "1e-8..1e-6" },
    { name: "scatterSeed", type: "number", bounds: "1..999999" },
  ],
  physicalConstraints: [
    "Current I is plotted on the vertical axis and potential difference V on the horizontal axis so linear gradient = 1/R.",
    "Static resistance at an operating point is R = V / I (not 1/tangent for non-ohmic components).",
  ],
  probeSpecs: [
    {
      kind: "component-iv-curve",
      mode: "component-characteristic",
      componentType: "filament-lamp",
      maxVoltageV: 8,
      operatingVoltageV: 6,
      operatingCurrentA: 0.75,
    },
    {
      kind: "component-iv-curve",
      mode: "component-characteristic",
      componentType: "led-diode",
      maxVoltageV: 3,
      thresholdV: 1.8,
      operatingVoltageV: 2.4,
      operatingCurrentA: 0.02,
    },
    {
      kind: "component-iv-curve",
      mode: "tabulated-iv-resistivity",
      maxVoltageV: 8,
      resistanceOhm: 10,
      lengthM: 1.6,
      areaM2: 8.0e-8,
      scatterSeed: 101,
    },
  ],
  validate(spec) {
    const issues: string[] = [];
    const mode = spec.mode;
    if (
      typeof mode !== "string" ||
      !(IV_CURVE_MODES as readonly string[]).includes(mode)
    ) {
      issues.push("mode must be 'component-characteristic' or 'tabulated-iv-resistivity'");
      return { valid: false, issues };
    }
    if (mode === "component-characteristic") {
      if (
        typeof spec.componentType !== "string" ||
        !(IV_COMPONENTS as readonly string[]).includes(spec.componentType)
      ) {
        issues.push("componentType must be a supported AC4.2 component");
      }
      if (!isPosNum(spec.maxVoltageV)) issues.push("maxVoltageV must be positive");
    } else {
      if (!isPosNum(spec.maxVoltageV)) issues.push("maxVoltageV must be positive");
      if (!isPosNum(spec.resistanceOhm)) {
        issues.push("resistanceOhm must be positive");
      }
      if (!isPosNum(spec.lengthM)) issues.push("lengthM must be positive");
      if (!isPosNum(spec.areaM2)) issues.push("areaM2 must be positive");
    }
    return { valid: issues.length === 0, issues };
  },
  solve(spec): DomainSolveOutput {
    const mode = spec.mode as (typeof IV_CURVE_MODES)[number];
    if (mode === "tabulated-iv-resistivity") {
      const maxVoltageV = spec.maxVoltageV as number;
      const resistanceOhm = spec.resistanceOhm as number;
      const lengthM = spec.lengthM as number;
      const areaM2 = spec.areaM2 as number;
      const gradientAPerV = 1 / resistanceOhm;
      const maxCurrentA = maxVoltageV / resistanceOhm;
      const resistivityOhmM = (resistanceOhm * areaM2) / lengthM;

      return {
        solverId: "sixthphysics/ncuk-ac4/component-iv-curve/1.0.0",
        quantities: {
          maxVoltageV,
          maxCurrentA,
          gradientAPerV,
          resistanceOhm,
          resistivityOhmM,
          resistivityDefinition:
            "resistance of a sample of unit length and unit cross sectional area",
          gradientMeaning: "reciprocal of resistance",
        },
      };
    }

    const comp = spec.componentType as IvComponentType;
    const maxV = spec.maxVoltageV as number;
    const vOp = isPosNum(spec.operatingVoltageV) ? spec.operatingVoltageV : maxV * 0.75;
    const rLow = isPosNum(spec.resistanceOhm) ? spec.resistanceOhm : 10;
    const iOp = isPosNum(spec.operatingCurrentA)
      ? spec.operatingCurrentA
      : vOp / rLow;
    const staticResistanceOhm = vOp / iOp;
    const thresholdV = isPosNum(spec.thresholdV) ? spec.thresholdV : 1.8;
    const rHighState = isPosNum(spec.highStateResistanceOhm)
      ? spec.highStateResistanceOhm
      : rLow * 0.4;

    const behaviorByComp: Record<IvComponentType, string> = {
      "ohmic-resistor":
        "constant resistance because current is directly proportional to potential difference at constant temperature",
      "filament-lamp":
        "resistance increases with potential difference because heating increases lattice ion vibration amplitude and electron collisions",
      "led-diode":
        "conducts sharply above the forward threshold voltage and has very high resistance in reverse bias",
      "ntc-thermistor":
        "resistance decreases as temperature increases because more charge carriers are released so the curve becomes steeper",
      ldr: "resistance decreases as light intensity increases because more charge carriers are released so the curve becomes steeper",
    };

    const componentLabelByComp: Record<IvComponentType, string> = {
      "ohmic-resistor": "ohmic metallic resistor at constant temperature",
      "filament-lamp": "filament lamp",
      "led-diode": "light emitting diode",
      "ntc-thermistor": "negative temperature coefficient thermistor",
      ldr: "light dependent resistor",
    };

    return {
      solverId: "sixthphysics/ncuk-ac4/component-iv-curve/1.0.0",
      quantities: {
        operatingVoltageV: vOp,
        operatingCurrentA: iOp,
        staticResistanceOhm,
        gradientAPerV: 1 / rLow,
        thresholdV,
        highStateResistanceOhm: rHighState,
        componentLabel: componentLabelByComp[comp],
        behaviorSummary: behaviorByComp[comp],
        ledProcedureSummary:
          "connect a potential divider with a series protective resistor an ammeter in series and a voltmeter in parallel across the component and reverse the supply connections for negative readings",
      },
    };
  },
  renderSvg(spec, options) {
    const mode = spec.mode as (typeof IV_CURVE_MODES)[number];
    const axisMarkerId = makeMarkerId("arr-iv", options);

    if (mode === "tabulated-iv-resistivity") {
      const maxV = spec.maxVoltageV as number;
      const resistanceOhm = spec.resistanceOhm as number;
      const maxI = maxV / resistanceOhm;
      const yMaxNice = computeNiceTicks(0, maxI * 1.15, 5).at(-1) ?? maxI * 1.2;
      const xTicks = computeNiceTicks(0, maxV, 5);
      const yTicks = computeNiceTicks(0, yMaxNice, 5);

      const grid = buildCartesianAxesSvg({
        width: 640,
        height: 400,
        left: 88,
        right: 590,
        top: 38,
        bottom: 332,
        xMin: 0,
        xMax: maxV,
        yMin: 0,
        yMax: yMaxNice,
        xTicks,
        yTicks,
        xLabel: "Potential difference V / V",
        yLabel: "Current I / A",
        axisMarkerId,
      });

      const seed = isFiniteNum(spec.scatterSeed) ? Math.trunc(spec.scatterSeed) : 17;
      const lineSvg = `<line x1="${fmtCoord(grid.px(0))}" y1="${fmtCoord(grid.py(0))}" x2="${fmtCoord(grid.px(maxV))}" y2="${fmtCoord(grid.py(maxI))}" stroke="#1d4ed8" stroke-width="2.4"/>`;

      const markers: string[] = [];
      for (let k = 1; k <= 6; k += 1) {
        const vx = (maxV * k) / 6;
        const hash = Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453;
        const jitter = (hash - Math.floor(hash) - 0.5) * 0.04 * maxI;
        const iy = Math.max(0.01 * maxI, Math.min(yMaxNice * 0.96, vx / resistanceOhm + jitter));
        markers.push(drawCrossMarker(grid.px(vx), grid.py(iy)));
      }

      return {
        visualFamily: "graphs",
        svgMarkup: wrapSvg({
          width: 640,
          height: 400,
          title: "Current against potential difference graph for a uniform wire",
          defs: arrowDefs(axisMarkerId, "#171b1f"),
          body: grid.svg + lineSvg + markers.join(""),
        }),
        rendererVersion: NCUK_AC4_RENDERER_VERSION,
        publicNumbers: grid.publicNumbers,
        publicLabels: grid.publicLabels,
      };
    }

    // mode === "component-characteristic"
    const comp = spec.componentType as IvComponentType;
    const maxV = spec.maxVoltageV as number;
    const vOp = isPosNum(spec.operatingVoltageV) ? spec.operatingVoltageV : maxV * 0.75;
    const rLow = isPosNum(spec.resistanceOhm) ? spec.resistanceOhm : 10;
    const iOp = isPosNum(spec.operatingCurrentA) ? spec.operatingCurrentA : vOp / rLow;

    if (comp === "ntc-thermistor" || comp === "ldr") {
      const rHighState = isPosNum(spec.highStateResistanceOhm)
        ? spec.highStateResistanceOhm
        : rLow * 0.4;
      const maxI = maxV / rHighState;
      const yMaxNice = computeNiceTicks(0, maxI * 1.15, 5).at(-1) ?? maxI * 1.2;
      const xTicks = computeNiceTicks(0, maxV, 4);
      const yTicks = computeNiceTicks(0, yMaxNice, 4);
      const grid = buildCartesianAxesSvg({
        width: 640,
        height: 400,
        left: 88,
        right: 590,
        top: 38,
        bottom: 332,
        xMin: 0,
        xMax: maxV,
        yMin: 0,
        yMax: yMaxNice,
        xTicks,
        yTicks,
        xLabel: "Potential difference V / V",
        yLabel: "Current I / A",
        axisMarkerId,
      });

      const i1End = maxV / rLow;
      const i2End = maxV / rHighState;
      const lblP = "Curve P";
      const lblQ = "Curve Q";
      grid.publicLabels.push(lblP, lblQ);

      const curves = [
        `<line x1="${fmtCoord(grid.px(0))}" y1="${fmtCoord(grid.py(0))}" x2="${fmtCoord(grid.px(maxV))}" y2="${fmtCoord(grid.py(i2End))}" stroke="#1d4ed8" stroke-width="2.5"/>`,
        svgText(grid.px(maxV * 0.74), grid.py(i2End * 0.85) - 8, lblP, {
          size: 13,
          weight: "700",
          fill: "#1d4ed8",
        }),
        `<line x1="${fmtCoord(grid.px(0))}" y1="${fmtCoord(grid.py(0))}" x2="${fmtCoord(grid.px(maxV))}" y2="${fmtCoord(grid.py(i1End))}" stroke="#b91c1c" stroke-width="2.5" stroke-dasharray="8 4"/>`,
        svgText(grid.px(maxV * 0.84), grid.py(i1End * 0.8) + 18, lblQ, {
          size: 13,
          weight: "700",
          fill: "#b91c1c",
        }),
      ].join("");

      return {
        visualFamily: "graphs",
        svgMarkup: wrapSvg({
          width: 640,
          height: 400,
          title: "Current against potential difference curves in two operating states",
          defs: arrowDefs(axisMarkerId, "#171b1f"),
          body: grid.svg + curves,
        }),
        rendererVersion: NCUK_AC4_RENDERER_VERSION,
        publicNumbers: grid.publicNumbers,
        publicLabels: grid.publicLabels,
      };
    }

    // 4-quadrant characteristic plot (ohmic-resistor, filament-lamp, led-diode)
    const isLed = comp === "led-diode";
    const iScaleFactor = isLed ? 1000 : 1; // plot LED in mA
    const yLabel = isLed ? "Current I / mA" : "Current I / A";
    const maxIPlot = isLed
      ? Math.max(25, Math.ceil((iOp * 1000 * 1.4) / 10) * 10)
      : computeNiceTicks(0, Math.max(iOp * 1.35, maxV / rLow), 3).at(-1) ?? 1.5;

    const xTicks = computeNiceTicks(-maxV, maxV, 4);
    const yTicks = computeNiceTicks(-maxIPlot, maxIPlot, 4);

    const grid = buildCartesianAxesSvg({
      width: 640,
      height: 400,
      left: 88,
      right: 590,
      top: 38,
      bottom: 332,
      xMin: -maxV,
      xMax: maxV,
      yMin: -maxIPlot,
      yMax: maxIPlot,
      xTicks,
      yTicks,
      xLabel: "Potential difference V / V",
      yLabel,
      axisMarkerId,
    });

    const pts: string[] = [];
    const steps = 60;
    const vTh = isPosNum(spec.thresholdV) ? spec.thresholdV : 1.8;

    for (let s = 0; s <= steps; s += 1) {
      const v = -maxV + (2 * maxV * s) / steps;
      let iPlot = 0;
      if (comp === "ohmic-resistor") {
        iPlot = (v / (vOp / iOp)) * iScaleFactor;
      } else if (comp === "filament-lamp") {
        // S-curve flattening toward V-axis passing cleanly through (vOp, iOp)
        const sgn = v >= 0 ? 1 : -1;
        const norm = Math.abs(v) / vOp;
        const kSat = 1.6;
        iPlot =
          sgn *
          iOp *
          (Math.atan(kSat * norm) / Math.atan(kSat)) *
          iScaleFactor;
      } else {
        // LED: zero in reverse and below vTh, sharp smooth rise through (vOp, iOp)
        if (v <= vTh * 0.92) {
          iPlot = 0;
        } else {
          const span = Math.max(0.2, vOp - vTh * 0.92);
          const u = (v - vTh * 0.92) / span;
          iPlot = Math.min(maxIPlot * 0.96, iOp * iScaleFactor * u * u);
        }
      }
      iPlot = Math.max(-maxIPlot * 0.96, Math.min(maxIPlot * 0.96, iPlot));
      pts.push(
        `${s === 0 ? "M" : "L"}${fmtCoord(grid.px(v))} ${fmtCoord(grid.py(iPlot))}`,
      );
    }

    const opMarker = `<circle cx="${fmtCoord(grid.px(vOp))}" cy="${fmtCoord(grid.py(iOp * iScaleFactor))}" r="4.5" fill="#b91c1c" stroke="#ffffff" stroke-width="1.5"/>`;
    const curveSvg = `<path d="${pts.join(" ")}" fill="none" stroke="#1d4ed8" stroke-width="2.6"/>${opMarker}`;

    return {
      visualFamily: "graphs",
      svgMarkup: wrapSvg({
        width: 640,
        height: 400,
        title: "Current against potential difference characteristic curve",
        defs: arrowDefs(axisMarkerId, "#171b1f"),
        body: grid.svg + curveSvg,
      }),
      rendererVersion: NCUK_AC4_RENDERER_VERSION,
      publicNumbers: grid.publicNumbers,
      publicLabels: grid.publicLabels,
    };
  },
};

/* ========================================================================== */
/*  11. graphs :: capacitor-qv-area                                           */
/* ========================================================================== */

const QV_ORIENTATIONS = ["Q-vs-V", "V-vs-Q"] as const;

const capacitorQvAreaPlugin: DomainKindPlugin = {
  domain: "graphs",
  kind: "capacitor-qv-area",
  summary:
    "Linear capacitor charging graph (Q vs V or V vs Q) with triangular energy area E = 1/2 Q V = 1/2 C V^2 and capacitance from slope.",
  requiredFields: [
    { name: "maxVoltageV", type: "number", unit: "V", bounds: "2..40" },
    { name: "maxChargeMc", type: "number", unit: "mC", bounds: "0.2..30" },
  ],
  optionalFields: [
    { name: "axisOrientation", type: "string", enumValues: QV_ORIENTATIONS },
  ],
  physicalConstraints: [
    "Q = C V is linear through the origin; stored energy E = 1/2 Q V equals the shaded triangular area.",
  ],
  probeSpecs: [
    {
      kind: "capacitor-qv-area",
      maxVoltageV: 12,
      maxChargeMc: 4.8,
      axisOrientation: "Q-vs-V",
    },
    {
      kind: "capacitor-qv-area",
      maxVoltageV: 15,
      maxChargeMc: 6.0,
      axisOrientation: "V-vs-Q",
    },
  ],
  validate(spec) {
    const issues: string[] = [];
    if (!isPosNum(spec.maxVoltageV)) issues.push("maxVoltageV must be positive");
    if (!isPosNum(spec.maxChargeMc)) issues.push("maxChargeMc must be positive");
    if (
      spec.axisOrientation !== undefined &&
      (typeof spec.axisOrientation !== "string" ||
        !(QV_ORIENTATIONS as readonly string[]).includes(spec.axisOrientation))
    ) {
      issues.push("axisOrientation must be 'Q-vs-V' or 'V-vs-Q'");
    }
    return { valid: issues.length === 0, issues };
  },
  solve(spec): DomainSolveOutput {
    const maxVoltageV = spec.maxVoltageV as number;
    const maxChargeMc = spec.maxChargeMc as number;
    const maxChargeC = maxChargeMc * 1e-3;
    const capacitanceF = maxChargeC / maxVoltageV;
    const capacitanceUf = capacitanceF * 1e6;
    const storedEnergyJ = 0.5 * maxChargeC * maxVoltageV;
    const storedEnergyMj = storedEnergyJ * 1e3;

    return {
      solverId: "sixthphysics/ncuk-ac4/capacitor-qv-area/1.0.0",
      quantities: {
        maxVoltageV,
        maxChargeMc,
        maxChargeC,
        capacitanceF,
        capacitanceUf,
        storedEnergyJ,
        storedEnergyMj,
        capacitanceDefinition:
          "charge stored per unit potential difference across the plates",
        areaExplanation:
          "energy stored equals the triangular area under the graph because potential difference increases linearly from zero with charge",
      },
    };
  },
  renderSvg(spec, options) {
    const maxV = spec.maxVoltageV as number;
    const maxQ = spec.maxChargeMc as number;
    const orientation =
      (spec.axisOrientation as (typeof QV_ORIENTATIONS)[number] | undefined) ??
      "Q-vs-V";
    const axisMarkerId = makeMarkerId("arr-qv", options);

    const xVal = orientation === "Q-vs-V" ? maxV : maxQ;
    const yVal = orientation === "Q-vs-V" ? maxQ : maxV;
    const xMaxNice = computeNiceTicks(0, xVal * 1.15, 5).at(-1) ?? xVal * 1.2;
    const yMaxNice = computeNiceTicks(0, yVal * 1.15, 5).at(-1) ?? yVal * 1.2;
    const xTicks = computeNiceTicks(0, xMaxNice, 5);
    const yTicks = computeNiceTicks(0, yMaxNice, 5);

    const grid = buildCartesianAxesSvg({
      width: 640,
      height: 400,
      left: 88,
      right: 590,
      top: 38,
      bottom: 332,
      xMin: 0,
      xMax: xMaxNice,
      yMin: 0,
      yMax: yMaxNice,
      xTicks,
      yTicks,
      xLabel:
        orientation === "Q-vs-V"
          ? "Potential difference V / V"
          : "Charge Q / mC",
      yLabel:
        orientation === "Q-vs-V"
          ? "Charge Q / mC"
          : "Potential difference V / V",
      axisMarkerId,
    });

    const x0 = grid.px(0);
    const y0 = grid.py(0);
    const x1 = grid.px(xVal);
    const y1 = grid.py(yVal);

    const triangle = `<polygon points="${fmtCoord(x0)},${fmtCoord(y0)} ${fmtCoord(x1)},${fmtCoord(y1)} ${fmtCoord(x1)},${fmtCoord(y0)}" fill="#dbeafe" fill-opacity="0.55" stroke="none"/>`;
    const dashedDrop = [
      `<line x1="${fmtCoord(x1)}" y1="${fmtCoord(y1)}" x2="${fmtCoord(x1)}" y2="${fmtCoord(y0)}" stroke="#64748b" stroke-width="1.4" stroke-dasharray="5 4"/>`,
      `<line x1="${fmtCoord(x0)}" y1="${fmtCoord(y1)}" x2="${fmtCoord(x1)}" y2="${fmtCoord(y1)}" stroke="#64748b" stroke-width="1.4" stroke-dasharray="5 4"/>`,
    ].join("");
    const line = `<line x1="${fmtCoord(x0)}" y1="${fmtCoord(y0)}" x2="${fmtCoord(x1)}" y2="${fmtCoord(y1)}" stroke="#1d4ed8" stroke-width="2.6"/>`;
    const endDot = `<circle cx="${fmtCoord(x1)}" cy="${fmtCoord(y1)}" r="4.5" fill="#1d4ed8" stroke="#ffffff" stroke-width="1.5"/>`;

    return {
      visualFamily: "graphs",
      svgMarkup: wrapSvg({
        width: 640,
        height: 400,
        title: "Linear capacitor charging graph showing charge and potential difference",
        defs: arrowDefs(axisMarkerId, "#171b1f"),
        body: grid.svg + triangle + dashedDrop + line + endDot,
      }),
      rendererVersion: NCUK_AC4_RENDERER_VERSION,
      publicNumbers: grid.publicNumbers,
      publicLabels: grid.publicLabels,
    };
  },
};

/* ========================================================================== */
/*  12. graphs :: rc-ln-linearization                                         */
/* ========================================================================== */

const rcLnLinearizationPlugin: DomainKindPlugin = {
  domain: "graphs",
  kind: "rc-ln-linearization",
  summary:
    "Linearized ln(V / V) against time t graph for exponential RC discharge with negative gradient -1/tau and intercept ln(V_0).",
  requiredFields: [
    { name: "initialVoltageV", type: "number", unit: "V", bounds: "3.0..20.0" },
    { name: "resistanceKohm", type: "number", unit: "kΩ", bounds: "5..200" },
    { name: "capacitanceUf", type: "number", unit: "μF", bounds: "50..2000" },
  ],
  optionalFields: [
    { name: "tEndS", type: "number", unit: "s", bounds: "5..200" },
  ],
  physicalConstraints: [
    "ln(V / V) = -(1 / tau) t + ln(V_0), where tau = R C.",
    "Time constant tau = -1 / gradient, initial voltage V_0 = exp(intercept).",
  ],
  probeSpecs: [
    {
      kind: "rc-ln-linearization",
      initialVoltageV: 10.0,
      resistanceKohm: 40,
      capacitanceUf: 500,
      tEndS: 40,
    },
    {
      kind: "rc-ln-linearization",
      initialVoltageV: 7.4,
      resistanceKohm: 25,
      capacitanceUf: 400,
      tEndS: 20,
    },
  ],
  validate(spec) {
    const issues: string[] = [];
    if (!isPosNum(spec.initialVoltageV) || spec.initialVoltageV < 1.5) {
      issues.push("initialVoltageV must be >= 1.5 V");
    }
    if (!isPosNum(spec.resistanceKohm)) {
      issues.push("resistanceKohm must be positive");
    }
    if (!isPosNum(spec.capacitanceUf)) {
      issues.push("capacitanceUf must be positive");
    }
    if (spec.tEndS !== undefined && !isPosNum(spec.tEndS)) {
      issues.push("tEndS must be positive if supplied");
    }
    return { valid: issues.length === 0, issues };
  },
  solve(spec): DomainSolveOutput {
    const v0 = spec.initialVoltageV as number;
    const rK = spec.resistanceKohm as number;
    const cUf = spec.capacitanceUf as number;
    const resistanceOhm = rK * 1e3;
    const capacitanceF = cUf * 1e-6;
    const timeConstantS = resistanceOhm * capacitanceF;
    const gradientPerS = -1 / timeConstantS;
    const gradientMagnitudePerS = 1 / timeConstantS;
    const yInterceptLnV = Math.log(v0);
    const tEndS = isPosNum(spec.tEndS) ? spec.tEndS : Math.round(timeConstantS * 2);
    const lnVAtEnd = yInterceptLnV - tEndS / timeConstantS;

    return {
      solverId: "sixthphysics/ncuk-ac4/rc-ln-linearization/1.0.0",
      quantities: {
        initialVoltageV: v0,
        resistanceKohm: rK,
        resistanceOhm,
        capacitanceUf: cUf,
        capacitanceF,
        timeConstantS,
        gradientPerS,
        gradientMagnitudePerS,
        yInterceptLnV,
        tEndS,
        lnVAtEnd,
        linearizationReason:
          "taking natural logarithms gives a straight line with negative gradient equal to minus the reciprocal of the time constant and vertical intercept equal to the natural logarithm of the initial potential difference",
        reliabilityReason:
          "uses all measured data points along a straight best fit line rather than estimating a single tangent by eye",
      },
    };
  },
  renderSvg(spec, options) {
    const v0 = spec.initialVoltageV as number;
    const rK = spec.resistanceKohm as number;
    const cUf = spec.capacitanceUf as number;
    const tau = rK * 1e3 * (cUf * 1e-6);
    const y0 = Math.log(v0);
    const tEnd = isPosNum(spec.tEndS) ? spec.tEndS : Math.round(tau * 2);
    const yEnd = y0 - tEnd / tau;

    const yMinRaw = Math.min(0, Math.floor((yEnd - 0.25) * 2) / 2);
    const yMaxRaw = Math.ceil((y0 + 0.3) * 2) / 2;
    const xTicks = computeNiceTicks(0, tEnd, 5);
    const yTicks = computeNiceTicks(yMinRaw, yMaxRaw, 5);
    const yMin = yTicks[0] ?? yMinRaw;
    const yMax = yTicks.at(-1) ?? yMaxRaw;
    const axisMarkerId = makeMarkerId("arr-ln", options);

    const grid = buildCartesianAxesSvg({
      width: 640,
      height: 400,
      left: 88,
      right: 590,
      top: 38,
      bottom: 332,
      xMin: 0,
      xMax: tEnd,
      yMin,
      yMax,
      xTicks,
      yTicks,
      xLabel: "Time t / s",
      yLabel: "ln(V / V)",
      axisMarkerId,
    });

    const lineSvg = `<line x1="${fmtCoord(grid.px(0))}" y1="${fmtCoord(grid.py(y0))}" x2="${fmtCoord(grid.px(tEnd))}" y2="${fmtCoord(grid.py(yEnd))}" stroke="#1d4ed8" stroke-width="2.5"/>`;

    const markers: string[] = [];
    for (let k = 0; k <= 5; k += 1) {
      const tk = (tEnd * k) / 5;
      const yk = y0 - tk / tau;
      markers.push(drawCrossMarker(grid.px(tk), grid.py(yk)));
    }

    return {
      visualFamily: "graphs",
      svgMarkup: wrapSvg({
        width: 640,
        height: 400,
        title: "Natural logarithm of capacitor potential difference against discharge time",
        defs: arrowDefs(axisMarkerId, "#171b1f"),
        body: grid.svg + lineSvg + markers.join(""),
      }),
      rendererVersion: NCUK_AC4_RENDERER_VERSION,
      publicNumbers: grid.publicNumbers,
      publicLabels: grid.publicLabels,
    };
  },
};

/* ========================================================================== */
/*  Exported plugin registry array (all 12 AC4.1–AC4.4 kinds)                 */
/* ========================================================================== */

export const NCUK_AC4_PLUGINS: readonly DomainKindPlugin[] = [
  driftVelocityConductionPlugin,
  chargeElectronCountPlugin,
  cuboidRemeltResistivityPlugin,
  twoLoadBatteryBulbPlugin,
  multiLoopKirchhoffCellsPlugin,
  symbolicResistorLadderPlugin,
  internalResistanceExperimentPlugin,
  switchedRcMultistagePlugin,
  capacitorBreakdownRatingPlugin,
  componentIvCurvePlugin,
  capacitorQvAreaPlugin,
  rcLnLinearizationPlugin,
];

export const NCUK_AC4_PLUGINS_BY_KIND: ReadonlyMap<string, DomainKindPlugin> =
  new Map(NCUK_AC4_PLUGINS.map((p) => [p.kind, p]));

export function formatNcukQuantity(
  value: number,
  unit?: string,
  sigFigs = 3,
): string {
  if (!Number.isFinite(value)) {
    throw new Error(`Cannot format non-finite value: ${String(value)}`);
  }
  if (Object.is(value, -0) || Math.abs(value) < 1e-35) {
    if (!unit) return "0";
    return unit === "%" ? "0%" : `0 ${unit}`;
  }
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  const rounded = Number(abs.toPrecision(sigFigs));
  let numStr: string;
  if (rounded >= 1e3 || rounded < 1e-2) {
    let exp = Math.floor(Math.log10(abs));
    let mant = abs / 10 ** exp;
    if (Number(mant.toPrecision(sigFigs)) >= 10) {
      exp += 1;
      mant /= 10;
    }
    numStr = `${sign}${mant.toPrecision(sigFigs)} × 10${toSuperscript(exp)}`;
  } else {
    numStr = `${sign}${abs.toPrecision(sigFigs)}`;
  }
  if (!unit) return numStr;
  if (unit === "%") return `${numStr}%`;
  return `${numStr} ${unit}`;
}

export { toSubscript, toSuperscript };
