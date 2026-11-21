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
export const ALEVEL_PRACTICALS_RENDERER_VERSION =
  "sixthphysics/alevel-practicals-svg/1.0.0";

export const ALEVEL_PRACTICALS_SCENARIO_KINDS = [
  "al-prac-worst-fit-error-bars",
  "al-prac-instruments-cro",
  "al-prac-log-linearization",
  "al-prac-rp1-stationary-string",
  "al-prac-rp2-slits-grating",
  "al-prac-rp3-freefall-g",
  "al-prac-rp4-young-modulus",
  "al-prac-rp5-rp6-resistivity-emf",
  "al-prac-rp7-shm-pendulum-spring",
  "al-prac-rp8-boyle-charles",
  "al-prac-rp9-capacitor-rc-log",
  "al-prac-rp10-mag-force-balance",
  "al-prac-rp11-search-coil-hall",
  "al-prac-rp12-gamma-inverse-square",
] as const;

export type AlevelPracticalsScenarioKind =
  (typeof ALEVEL_PRACTICALS_SCENARIO_KINDS)[number];

/* -------------------------------------------------------------------------- */
/*  Shared formatting, validation & crisp SVG primitives                      */
/* -------------------------------------------------------------------------- */

const VIEW_W = 640;
const VIEW_H = 360;
const FONT_SANS =
  "'Plus Jakarta Sans', 'Segoe UI', Helvetica, Arial, sans-serif";
const INK = "#0f172a";
const BLUE = "#1d4ed8";
const RED = "#dc2626";
const TEAL = "#0f766e";
const SLATE = "#475569";
const GRID = "#e2e8f0";
const PANEL_BG = "#f8fafc";
const BORDER = "#cbd5e1";

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

function toSub(val: string | number): string {
  return [...String(val)].map((c) => SUB_MAP[c] ?? c).join("");
}

function toSup(val: string | number): string {
  return [...String(val)].map((c) => SUP_MAP[c] ?? c).join("");
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

function sanitizeSvgLabel(raw: string): string {
  return escapeXml(raw.replace(/[_^]/g, " "));
}

function f2(v: number): string {
  const r = Math.round(v * 100) / 100;
  return Object.is(r, -0) ? "0" : String(r);
}

function fmtTick(v: number, decimals = 2): string {
  if (!Number.isFinite(v) || Math.abs(v) < 1e-10) return "0";
  const p = 10 ** decimals;
  const r = Math.round(v * p) / p;
  if (Math.abs(r) < 1e-10) return "0";
  const s = Number.isInteger(r) ? String(r) : String(r);
  return r < 0 ? `−${s.slice(1)}` : s;
}

function fmtVal(v: number, sf = 3): string {
  if (!Number.isFinite(v) || Math.abs(v) < 1e-35) return "0";
  const sign = v < 0 ? "−" : "";
  const abs = Math.abs(v);
  const rounded = Number(abs.toPrecision(sf));
  if (rounded >= 1e-2 && rounded < 1e4) {
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

function makeId(prefix: string, options?: DomainRenderOptions): string {
  const clean = (options?.id ?? "alprac")
    .replace(/[^A-Za-z0-9-]/g, "")
    .slice(0, 22);
  return `${prefix}-${clean || "fig"}`;
}

function wrapSvg(
  title: string,
  defs: string,
  body: string,
): string {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${VIEW_W}" height="${VIEW_H}" viewBox="0 0 ${VIEW_W} ${VIEW_H}" role="img" aria-label="${sanitizeSvgLabel(title)}">`,
    `<title>${sanitizeSvgLabel(title)}</title>`,
    defs ? `<defs>${defs}</defs>` : "",
    `<rect width="100%" height="100%" fill="#ffffff"/>`,
    body,
    "</svg>",
  ]
    .filter(Boolean)
    .join("");
}

function svgText(
  x: number,
  y: number,
  content: string,
  opts?: {
    size?: number;
    weight?: number | string;
    fill?: string;
    anchor?: "start" | "middle" | "end";
    italic?: boolean;
    rotate?: string;
  },
): string {
  const size = opts?.size ?? 12;
  const weight = opts?.weight ?? 500;
  const fill = opts?.fill ?? INK;
  const anchor = opts?.anchor ?? "start";
  const styleAttr = opts?.italic ? ' font-style="italic"' : "";
  const transformAttr = opts?.rotate ? ` transform="${opts.rotate}"` : "";
  return `<text x="${f2(x)}" y="${f2(y)}" font-family="${FONT_SANS}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}"${styleAttr}${transformAttr}>${sanitizeSvgLabel(content)}</text>`;
}

function svgRawText(
  x: number,
  y: number,
  innerXml: string,
  opts?: {
    size?: number;
    weight?: number | string;
    fill?: string;
    anchor?: "start" | "middle" | "end";
    rotate?: string;
  },
): string {
  const size = opts?.size ?? 12;
  const weight = opts?.weight ?? 500;
  const fill = opts?.fill ?? INK;
  const anchor = opts?.anchor ?? "start";
  const transformAttr = opts?.rotate ? ` transform="${opts.rotate}"` : "";
  return `<text x="${f2(x)}" y="${f2(y)}" font-family="${FONT_SANS}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}"${transformAttr}>${innerXml}</text>`;
}

function arrowMarkerDef(id: string, color: string): string {
  return `<marker id="${id}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 1 L 10 5 L 0 9 z" fill="${color}"/></marker>`;
}

function makeValidationResult(issues: string[]): DomainValidationResult {
  return { valid: issues.length === 0, issues };
}

/* -------------------------------------------------------------------------- */
/*  1. al-prac-worst-fit-error-bars (Paper 3A, 3.1, Y12, graphs)              */
/* -------------------------------------------------------------------------- */

interface WorstFitSolved {
  points: Array<{ x: number; y: number; dx: number; dy: number }>;
  mBest: number;
  cBest: number;
  mMax: number;
  cMin: number;
  mMin: number;
  cMax: number;
  deltaM: number;
  pctUncM: number;
  deltaC: number;
  spanPct: number;
  errorBarTrendVerdict: string;
}

function computeWorstFit(spec: Record<string, unknown>): WorstFitSolved {
  const barType = String(spec.barType);
  const xStart = Number(spec.xStart);
  const xStep = Number(spec.xStep);
  const mBest = Number(spec.mBest);
  const cBest = Number(spec.cBest);
  const dxAbs = Number(spec.dxAbs);
  const dyBase = Number(spec.dyBase);
  const pctUncY = isPosNum(spec.pctUncY) ? Number(spec.pctUncY) : 8;

  const points: Array<{ x: number; y: number; dx: number; dy: number }> = [];
  for (let i = 0; i < 5; i += 1) {
    const x = xStart + i * xStep;
    const y = mBest * x + cBest;
    const dy =
      barType === "constant-pct"
        ? Math.abs(y) * (pctUncY / 100)
        : dyBase;
    points.push({ x, y, dx: dxAbs, dy });
  }

  const p0 = points[0];
  const p4 = points[4];

  // Steepest line passes through (x0 + dx0, y0 - dy0) and (x4 - dx4, y4 + dy4)
  const sx1 = p0.x + p0.dx;
  const sy1 = p0.y - p0.dy;
  const sx2 = p4.x - p4.dx;
  const sy2 = p4.y + p4.dy;
  const mMax = (sy2 - sy1) / (sx2 - sx1);
  const cMin = sy1 - mMax * sx1;

  // Shallowest line passes through (x0 - dx0, y0 + dy0) and (x4 + dx4, y4 - dy4)
  const lx1 = p0.x - p0.dx;
  const ly1 = p0.y + p0.dy;
  const lx2 = p4.x + p4.dx;
  const ly2 = p4.y - p4.dy;
  const mMin = (ly2 - ly1) / (lx2 - lx1);
  const cMax = ly1 - mMin * lx1;

  const deltaM = 0.5 * Math.abs(mMax - mMin);
  const pctUncM = (deltaM / Math.abs(mBest)) * 100;
  const deltaC = 0.5 * Math.abs(cMax - cMin);
  const spanPct = ((p4.x - p0.x) / (p4.x + 0.5 * xStep)) * 100;

  const errorBarTrendVerdict =
    barType === "constant-pct"
      ? "vertical error bars grow proportionally with the dependent variable because percentage uncertainty is constant"
      : "all error bars have identical constant size because absolute uncertainty is fixed";

  return {
    points,
    mBest,
    cBest,
    mMax,
    cMin,
    mMin,
    cMax,
    deltaM,
    pctUncM,
    deltaC,
    spanPct,
    errorBarTrendVerdict,
  };
}

const WORST_FIT_ERROR_BARS_PLUGIN: DomainKindPlugin = {
  domain: "graphs",
  kind: "al-prac-worst-fit-error-bars",
  summary:
    "Paper 3A scatter plot with symmetric I-shaped error bars, best-fit line, and steepest/shallowest worst-fit lines for gradient and intercept uncertainty.",
  requiredFields: [
    {
      name: "barType",
      type: "string",
      enumValues: ["constant-abs", "constant-pct"],
    },
    { name: "xStart", type: "number", bounds: "> 0" },
    { name: "xStep", type: "number", bounds: "> 0" },
    { name: "mBest", type: "number", bounds: "> 0" },
    { name: "cBest", type: "number", bounds: ">= 0" },
    { name: "dxAbs", type: "number", bounds: ">= 0" },
    { name: "dyBase", type: "number", bounds: "> 0" },
    { name: "xLabel", type: "string" },
    { name: "yLabel", type: "string" },
  ],
  optionalFields: [
    { name: "pctUncY", type: "number", unit: "%", bounds: "2..25" },
  ],
  physicalConstraints: [
    "Steepest and shallowest worst-fit lines must pass through every plotted error bar.",
    "dxAbs must be strictly less than 0.4 * xStep so adjacent horizontal error bars remain distinct.",
    "Gradient triangle spans more than 50% of the plotted data range.",
  ],
  probeSpecs: [
    {
      kind: "al-prac-worst-fit-error-bars",
      barType: "constant-abs",
      xStart: 1.0,
      xStep: 1.0,
      mBest: 4.2,
      cBest: 1.5,
      dxAbs: 0.1,
      dyBase: 1.2,
      xLabel: "x / m",
      yLabel: "y / N",
    },
    {
      kind: "al-prac-worst-fit-error-bars",
      barType: "constant-pct",
      xStart: 2.0,
      xStep: 2.0,
      mBest: 2.5,
      cBest: 0.8,
      dxAbs: 0.15,
      dyBase: 0.5,
      pctUncY: 10,
      xLabel: "I / A",
      yLabel: "V / V",
    },
  ],
  validate(spec) {
    const issues: string[] = [];
    if (spec.barType !== "constant-abs" && spec.barType !== "constant-pct") {
      issues.push('barType must be "constant-abs" or "constant-pct"');
    }
    if (!isPosNum(spec.xStart)) issues.push("xStart must be positive");
    if (!isPosNum(spec.xStep)) issues.push("xStep must be positive");
    if (!isPosNum(spec.mBest)) issues.push("mBest must be positive");
    if (!isNonNegNum(spec.cBest)) issues.push("cBest must be non-negative");
    if (!isNonNegNum(spec.dxAbs)) issues.push("dxAbs must be non-negative");
    if (!isPosNum(spec.dyBase)) issues.push("dyBase must be positive");
    if (!isNonEmptyStr(spec.xLabel) || !isNonEmptyStr(spec.yLabel)) {
      issues.push("xLabel and yLabel must be non-empty strings");
    }
    if (
      isPosNum(spec.xStep) &&
      isNonNegNum(spec.dxAbs) &&
      spec.dxAbs >= 0.4 * spec.xStep
    ) {
      issues.push("dxAbs must be smaller than 0.4 * xStep");
    }
    if (
      spec.barType === "constant-pct" &&
      spec.pctUncY !== undefined &&
      (!isPosNum(spec.pctUncY) || spec.pctUncY > 25)
    ) {
      issues.push("pctUncY must be in (0, 25]");
    }
    if (issues.length === 0) {
      const s = computeWorstFit(spec);
      if (!(s.mMax > s.mBest && s.mBest > s.mMin && s.mMin > 0)) {
        issues.push("Worst-fit slopes must satisfy mMax > mBest > mMin > 0");
      }
    }
    return makeValidationResult(issues);
  },
  solve(spec): DomainSolveOutput {
    const s = computeWorstFit(spec);
    const quantities: VerifiedQuantityMap = {
      mBest: s.mBest,
      cBest: s.cBest,
      mMax: s.mMax,
      mMin: s.mMin,
      deltaM: s.deltaM,
      pctUncM: s.pctUncM,
      cMax: s.cMax,
      cMin: s.cMin,
      deltaC: s.deltaC,
      errorBarTrendVerdict: s.errorBarTrendVerdict,
      worstFitRuleAnchor:
        "worst fit lines must pass through every error bar and the gradient triangle must span more than half of the plotted line",
    };
    return {
      solverId: "sixthphysics/al-prac-worst-fit/1.0.0",
      quantities,
      publicNumbers: s.points.flatMap((p) => [p.x, p.y, p.dx, p.dy]),
    };
  },
  renderSvg(spec, options): DomainRenderOutput {
    const s = computeWorstFit(spec);
    const xLabel = String(spec.xLabel);
    const yLabel = String(spec.yLabel);

    const padL = 74;
    const padR = 175;
    const padT = 34;
    const padB = 54;
    const plotW = VIEW_W - padL - padR;
    const plotH = VIEW_H - padT - padB;

    const pLast = s.points[4];
    const xMaxPlot = Math.ceil((pLast.x + pLast.dx) * 1.12 * 10) / 10;
    const yMaxVal = Math.max(
      pLast.y + pLast.dy,
      s.mMax * xMaxPlot + s.cMin,
    );
    const yMaxPlot = Math.ceil(yMaxVal * 1.12 * 10) / 10;

    const sx = (x: number): number => padL + (x / xMaxPlot) * plotW;
    const sy = (y: number): number => padT + plotH - (y / yMaxPlot) * plotH;

    const parts: string[] = [];
    const publicNumbers: number[] = [];
    const publicLabels: string[] = [];

    // Grid & ticks
    const nx = 5;
    const ny = 5;
    for (let i = 0; i <= nx; i += 1) {
      const xv = (xMaxPlot * i) / nx;
      const px = sx(xv);
      parts.push(
        `<line x1="${f2(px)}" y1="${padT}" x2="${f2(px)}" y2="${padT + plotH}" stroke="${GRID}" stroke-width="1"/>`,
      );
      const tLbl = fmtTick(xv, 1);
      parts.push(
        svgText(px, padT + plotH + 18, tLbl, {
          size: 10,
          fill: SLATE,
          anchor: "middle",
        }),
      );
      publicNumbers.push(xv);
      publicLabels.push(tLbl);
    }
    for (let j = 0; j <= ny; j += 1) {
      const yv = (yMaxPlot * j) / ny;
      const py = sy(yv);
      parts.push(
        `<line x1="${padL}" y1="${f2(py)}" x2="${padL + plotW}" y2="${f2(py)}" stroke="${GRID}" stroke-width="1"/>`,
      );
      const tLbl = fmtTick(yv, 1);
      parts.push(
        svgText(padL - 8, py + 3.5, tLbl, {
          size: 10,
          fill: SLATE,
          anchor: "end",
        }),
      );
      publicNumbers.push(yv);
      publicLabels.push(tLbl);
    }

    // Axes
    parts.push(
      `<line x1="${padL}" y1="${padT}" x2="${padL}" y2="${padT + plotH}" stroke="${INK}" stroke-width="1.8"/>`,
      `<line x1="${padL}" y1="${padT + plotH}" x2="${padL + plotW}" y2="${padT + plotH}" stroke="${INK}" stroke-width="1.8"/>`,
    );

    // Clip path for lines
    const clipId = makeId("wf-clip", options);
    const defs = `<clipPath id="${clipId}"><rect x="${padL}" y="${padT}" width="${plotW}" height="${plotH}"/></clipPath>`;

    // Worst-fit and best-fit lines
    const drawLine = (
      m: number,
      c: number,
      stroke: string,
      width: number,
      dash?: string,
    ): string => {
      const xA = 0;
      const yA = c;
      const xB = xMaxPlot;
      const yB = m * xB + c;
      const dashAttr = dash ? ` stroke-dasharray="${dash}"` : "";
      return `<line x1="${f2(sx(xA))}" y1="${f2(sy(yA))}" x2="${f2(sx(xB))}" y2="${f2(sy(yB))}" stroke="${stroke}" stroke-width="${width}"${dashAttr} clip-path="url(#${clipId})"/>`;
    };

    parts.push(
      drawLine(s.mMax, s.cMin, RED, 1.5, "6,4"),
      drawLine(s.mMin, s.cMax, TEAL, 1.5, "4,4"),
      drawLine(s.mBest, s.cBest, BLUE, 2.2),
    );

    // Gradient triangle spanning > 50% of best-fit line
    const gx1 = s.points[0].x;
    const gy1 = s.points[0].y;
    const gx2 = s.points[4].x;
    const gy2 = s.points[4].y;
    parts.push(
      `<polyline points="${f2(sx(gx1))},${f2(sy(gy1))} ${f2(sx(gx2))},${f2(sy(gy1))} ${f2(sx(gx2))},${f2(sy(gy2))}" fill="none" stroke="${SLATE}" stroke-width="1.1" stroke-dasharray="3,3"/>`,
      svgText(sx((gx1 + gx2) / 2), sy(gy1) + 13, "Δx", {
        size: 10,
        fill: SLATE,
        anchor: "middle",
        italic: true,
      }),
      svgText(sx(gx2) + 8, sy((gy1 + gy2) / 2) + 3, "Δy", {
        size: 10,
        fill: SLATE,
        anchor: "start",
        italic: true,
      }),
    );

    // Data points with I-shaped error bars
    for (const pt of s.points) {
      const cx = sx(pt.x);
      const cy = sy(pt.y);
      const yTop = sy(pt.y + pt.dy);
      const yBot = sy(pt.y - pt.dy);
      parts.push(
        `<line x1="${f2(cx)}" y1="${f2(yTop)}" x2="${f2(cx)}" y2="${f2(yBot)}" stroke="${INK}" stroke-width="1.3"/>`,
        `<line x1="${f2(cx - 4)}" y1="${f2(yTop)}" x2="${f2(cx + 4)}" y2="${f2(yTop)}" stroke="${INK}" stroke-width="1.3"/>`,
        `<line x1="${f2(cx - 4)}" y1="${f2(yBot)}" x2="${f2(cx + 4)}" y2="${f2(yBot)}" stroke="${INK}" stroke-width="1.3"/>`,
      );
      if (pt.dx > 0) {
        const xL = sx(pt.x - pt.dx);
        const xR = sx(pt.x + pt.dx);
        parts.push(
          `<line x1="${f2(xL)}" y1="${f2(cy)}" x2="${f2(xR)}" y2="${f2(cy)}" stroke="${INK}" stroke-width="1.3"/>`,
          `<line x1="${f2(xL)}" y1="${f2(cy - 3.5)}" x2="${f2(xL)}" y2="${f2(cy + 3.5)}" stroke="${INK}" stroke-width="1.3"/>`,
          `<line x1="${f2(xR)}" y1="${f2(cy - 3.5)}" x2="${f2(xR)}" y2="${f2(cy + 3.5)}" stroke="${INK}" stroke-width="1.3"/>`,
        );
      }
      parts.push(
        `<circle cx="${f2(cx)}" cy="${f2(cy)}" r="3" fill="${BLUE}" stroke="#ffffff" stroke-width="1"/>`,
      );
    }

    // Axis titles
    parts.push(
      svgText(padL + plotW / 2, VIEW_H - 14, xLabel, {
        size: 12,
        weight: 600,
        anchor: "middle",
      }),
      svgText(20, padT + plotH / 2, yLabel, {
        size: 12,
        weight: 600,
        anchor: "middle",
        rotate: `rotate(-90 20 ${f2(padT + plotH / 2)})`,
      }),
    );

    // Legend box on right
    const lx = padL + plotW + 14;
    parts.push(
      `<rect x="${lx}" y="44" width="148" height="122" rx="6" fill="${PANEL_BG}" stroke="${BORDER}" stroke-width="1"/>`,
      svgText(lx + 10, 64, "Lines of Fit", { size: 11, weight: 700 }),
      `<line x1="${lx + 10}" y1="82" x2="${lx + 34}" y2="82" stroke="${BLUE}" stroke-width="2.2"/>`,
      svgText(lx + 40, 86, "Best-fit line", { size: 10.5 }),
      `<line x1="${lx + 10}" y1="106" x2="${lx + 34}" y2="106" stroke="${RED}" stroke-width="1.6" stroke-dasharray="6,4"/>`,
      svgText(lx + 40, 110, "Steepest worst-fit", { size: 10.5 }),
      `<line x1="${lx + 10}" y1="130" x2="${lx + 34}" y2="130" stroke="${TEAL}" stroke-width="1.6" stroke-dasharray="4,4"/>`,
      svgText(lx + 40, 134, "Shallowest worst-fit", { size: 10.5 }),
      svgText(lx + 10, 155, "Error bars: ±Δx, ±Δy", {
        size: 10,
        fill: SLATE,
      }),
    );

    const svgMarkup = wrapSvg(
      "Error bars with best-fit and worst-fit straight lines",
      defs,
      parts.join(""),
    );
    return {
      visualFamily: "al-prac-worst-fit-error-bars",
      svgMarkup,
      rendererVersion: ALEVEL_PRACTICALS_RENDERER_VERSION,
      publicNumbers,
      publicLabels,
    };
  },
};

/* -------------------------------------------------------------------------- */
/*  2. al-prac-instruments-cro (Paper 3A, 3.1, Y12, pure-calculation)         */
/* -------------------------------------------------------------------------- */

const INSTRUMENTS_CRO_PLUGIN: DomainKindPlugin = {
  domain: "pure-calculation",
  kind: "al-prac-instruments-cro",
  summary:
    "Precision laboratory instrument readings: micrometer screw gauge (0.01 mm), Vernier callipers, and cathode-ray oscilloscope (CRO) 10x8 graticule traces.",
  requiredFields: [
    {
      name: "mode",
      type: "string",
      enumValues: ["micrometer", "vernier", "cro-waveform"],
    },
  ],
  optionalFields: [
    { name: "mainScaleMm", type: "number", unit: "mm" },
    { name: "thimbleDiv", type: "number", bounds: "0..49" },
    { name: "vernierCoincidence", type: "number", bounds: "1..19" },
    { name: "resolutionMm", type: "number", unit: "mm" },
    { name: "zeroErrorMm", type: "number", unit: "mm" },
    { name: "timeBaseMsPerDiv", type: "number", unit: "ms div^-1" },
    { name: "yGainVPerDiv", type: "number", unit: "V div^-1" },
    { name: "divsPerCycle", type: "number", bounds: "1.5..8" },
    { name: "peakToPeakDivs", type: "number", bounds: "2..7" },
  ],
  physicalConstraints: [
    "Micrometer pitch is 0.5 mm with 50 thimble divisions (0.01 mm resolution).",
    "Corrected reading equals raw reading minus signed zero error.",
    "CRO peak voltage equals half peak-to-peak voltage; rms equals peak divided by sqrt(2).",
  ],
  probeSpecs: [
    {
      kind: "al-prac-instruments-cro",
      mode: "micrometer",
      mainScaleMm: 3.5,
      thimbleDiv: 28,
      zeroErrorMm: 0.04,
      resolutionMm: 0.01,
    },
    {
      kind: "al-prac-instruments-cro",
      mode: "vernier",
      mainScaleMm: 18,
      vernierCoincidence: 7,
      resolutionMm: 0.05,
      zeroErrorMm: -0.05,
    },
    {
      kind: "al-prac-instruments-cro",
      mode: "cro-waveform",
      timeBaseMsPerDiv: 2.0,
      yGainVPerDiv: 1.5,
      divsPerCycle: 4.0,
      peakToPeakDivs: 5.0,
    },
  ],
  validate(spec) {
    const issues: string[] = [];
    const mode = spec.mode;
    if (mode === "micrometer") {
      if (!isNonNegNum(spec.mainScaleMm) || spec.mainScaleMm > 20) {
        issues.push("mainScaleMm must be in [0, 20]");
      }
      if (
        !isNonNegNum(spec.thimbleDiv) ||
        spec.thimbleDiv >= 50 ||
        !Number.isInteger(spec.thimbleDiv)
      ) {
        issues.push("thimbleDiv must be an integer in 0..49");
      }
      if (!isFiniteNum(spec.zeroErrorMm) || Math.abs(spec.zeroErrorMm) > 0.2) {
        issues.push("zeroErrorMm must be finite in [-0.2, 0.2]");
      }
    } else if (mode === "vernier") {
      if (
        !isPosNum(spec.mainScaleMm) ||
        !Number.isInteger(spec.mainScaleMm) ||
        spec.mainScaleMm > 80
      ) {
        issues.push("mainScaleMm must be an integer in 1..80");
      }
      if (!isPosNum(spec.resolutionMm) || spec.resolutionMm > 0.2) {
        issues.push("resolutionMm must be in (0, 0.2]");
      }
      if (
        !isPosNum(spec.vernierCoincidence) ||
        !Number.isInteger(spec.vernierCoincidence)
      ) {
        issues.push("vernierCoincidence must be a positive integer");
      }
      if (!isFiniteNum(spec.zeroErrorMm) || Math.abs(spec.zeroErrorMm) > 0.5) {
        issues.push("zeroErrorMm must be finite in [-0.5, 0.5]");
      }
    } else if (mode === "cro-waveform") {
      if (!isPosNum(spec.timeBaseMsPerDiv)) {
        issues.push("timeBaseMsPerDiv must be positive");
      }
      if (!isPosNum(spec.yGainVPerDiv)) {
        issues.push("yGainVPerDiv must be positive");
      }
      if (
        !isPosNum(spec.divsPerCycle) ||
        spec.divsPerCycle < 1.5 ||
        spec.divsPerCycle > 8
      ) {
        issues.push("divsPerCycle must be in [1.5, 8]");
      }
      if (
        !isPosNum(spec.peakToPeakDivs) ||
        spec.peakToPeakDivs < 2 ||
        spec.peakToPeakDivs > 7
      ) {
        issues.push("peakToPeakDivs must be in [2, 7]");
      }
    } else {
      issues.push('mode must be "micrometer", "vernier", or "cro-waveform"');
    }
    return makeValidationResult(issues);
  },
  solve(spec): DomainSolveOutput {
    const mode = String(spec.mode);
    if (mode === "micrometer") {
      const mainScaleMm = Number(spec.mainScaleMm);
      const thimbleDiv = Number(spec.thimbleDiv);
      const zeroErrorMm = Number(spec.zeroErrorMm);
      const resMm = isPosNum(spec.resolutionMm)
        ? Number(spec.resolutionMm)
        : 0.01;
      const rawReadingMm = mainScaleMm + thimbleDiv * resMm;
      const correctedMm = rawReadingMm - zeroErrorMm;
      const pctUnc = (resMm / correctedMm) * 100;
      const pctUncArea = 2 * pctUnc;
      return {
        solverId: "sixthphysics/al-prac-instruments-cro/1.0.0",
        quantities: {
          rawReadingMm,
          zeroErrorMm,
          correctedMm,
          absUncMm: resMm,
          pctUnc,
          pctUncArea,
          precautionAnchor:
            "use the ratchet to avoid over tightening or compressing the wire and repeat orthogonal diameter measurements along the length",
        },
      };
    }
    if (mode === "vernier") {
      const mainScaleMm = Number(spec.mainScaleMm);
      const vernierCoincidence = Number(spec.vernierCoincidence);
      const resMm = Number(spec.resolutionMm);
      const zeroErrorMm = Number(spec.zeroErrorMm);
      const rawReadingMm = mainScaleMm + vernierCoincidence * resMm;
      const correctedMm = rawReadingMm - zeroErrorMm;
      const pctUnc = (resMm / correctedMm) * 100;
      return {
        solverId: "sixthphysics/al-prac-instruments-cro/1.0.0",
        quantities: {
          rawReadingMm,
          zeroErrorMm,
          correctedMm,
          absUncMm: resMm,
          pctUnc,
          precautionAnchor:
            "record any zero error with the jaws closed and view the coinciding vernier division perpendicularly to eliminate parallax",
        },
      };
    }
    const timeBaseMsPerDiv = Number(spec.timeBaseMsPerDiv);
    const yGainVPerDiv = Number(spec.yGainVPerDiv);
    const divsPerCycle = Number(spec.divsPerCycle);
    const peakToPeakDivs = Number(spec.peakToPeakDivs);
    const periodMs = divsPerCycle * timeBaseMsPerDiv;
    const periodS = periodMs * 1e-3;
    const freqHz = 1 / periodS;
    const vPeakToPeakV = peakToPeakDivs * yGainVPerDiv;
    const vPeakV = vPeakToPeakV / 2;
    const vRmsV = vPeakV / Math.SQRT2;
    return {
      solverId: "sixthphysics/al-prac-instruments-cro/1.0.0",
      quantities: {
        periodMs,
        periodS,
        freqHz,
        vPeakToPeakV,
        vPeakV,
        vRmsV,
        precautionAnchor:
          "reduce the time base setting to stretch the waveform horizontally for lower percentage uncertainty and switching time base off produces a vertical line of height peak to peak voltage",
      },
    };
  },
  renderSvg(spec, options): DomainRenderOutput {
    const mode = String(spec.mode);
    const hidden = extractHiddenSet(spec, options);
    const parts: string[] = [];
    const publicNumbers: number[] = [];
    const publicLabels: string[] = [];

    if (mode === "micrometer") {
      const mainMm = Number(spec.mainScaleMm);
      const thimbleDiv = Number(spec.thimbleDiv);
      const zeroErrorMm = Number(spec.zeroErrorMm);
      const baseMm = Math.max(0, Math.floor(mainMm) - 3);
      const sleeveLeft = 90;
      const sleeveRight = 350;
      const datumY = 175;
      const pxPerMm = 36;

      parts.push(
        svgText(320, 34, "Micrometer Screw Gauge (0.5 mm pitch, 50 thimble divisions)", {
          size: 13,
          weight: 700,
          anchor: "middle",
        }),
        // Barrel / sleeve body
        `<rect x="${sleeveLeft}" y="110" width="${sleeveRight - sleeveLeft}" height="130" fill="${PANEL_BG}" stroke="${INK}" stroke-width="2"/>`,
        // Datum line
        `<line x1="${sleeveLeft + 10}" y1="${datumY}" x2="${sleeveRight}" y2="${datumY}" stroke="${INK}" stroke-width="1.8"/>`,
      );

      // Millimetre upper ticks and 0.5 mm lower ticks up to mainMm
      const edgeX = sleeveRight;
      for (let m = baseMm; m <= mainMm + 0.01; m += 0.5) {
        const dxFromEdge = (mainMm - m) * pxPerMm + 12;
        const tx = edgeX - dxFromEdge;
        if (tx < sleeveLeft + 14) continue;
        const isWhole = Math.abs(m - Math.round(m)) < 1e-6;
        if (isWhole) {
          parts.push(
            `<line x1="${f2(tx)}" y1="${datumY}" x2="${f2(tx)}" y2="${datumY - 26}" stroke="${INK}" stroke-width="1.6"/>`,
          );
          const lbl = String(Math.round(m));
          parts.push(
            svgText(tx, datumY - 32, lbl, {
              size: 11,
              weight: 600,
              anchor: "middle",
            }),
          );
          publicNumbers.push(Math.round(m));
          publicLabels.push(lbl);
        } else {
          parts.push(
            `<line x1="${f2(tx)}" y1="${datumY}" x2="${f2(tx)}" y2="${datumY + 20}" stroke="${BLUE}" stroke-width="1.4"/>`,
          );
        }
      }

      // Thimble beveled nose + cylinder + ratchet
      parts.push(
        `<polygon points="${sleeveRight},110 ${sleeveRight + 32},94 ${sleeveRight + 32},256 ${sleeveRight},240" fill="#e2e8f0" stroke="${INK}" stroke-width="2"/>`,
        `<rect x="${sleeveRight + 32}" y="94" width="118" height="162" fill="#f1f5f9" stroke="${INK}" stroke-width="2"/>`,
        `<rect x="${sleeveRight + 150}" y="128" width="52" height="94" rx="5" fill="#cbd5e1" stroke="${INK}" stroke-width="1.8"/>`,
        svgText(sleeveRight + 176, 179, "Ratchet", {
          size: 10.5,
          weight: 600,
          anchor: "middle",
        }),
      );

      // Thimble divisions around thimbleDiv
      const pxPerDiv = 10;
      for (let offset = -6; offset <= 6; offset += 1) {
        const divNum = (((thimbleDiv + offset) % 50) + 50) % 50;
        const ty = datumY - offset * pxPerDiv;
        const isMajor = divNum % 5 === 0;
        const tickLen = isMajor ? 26 : 14;
        parts.push(
          `<line x1="${sleeveRight + 32}" y1="${f2(ty)}" x2="${sleeveRight + 32 + tickLen}" y2="${f2(ty)}" stroke="${offset === 0 ? RED : INK}" stroke-width="${offset === 0 ? 2 : 1.2}"/>`,
        );
        if (isMajor) {
          const lbl = String(divNum);
          parts.push(
            svgText(sleeveRight + 64, ty + 4, lbl, {
              size: 11,
              weight: 600,
              fill: INK,
            }),
          );
          publicNumbers.push(divNum);
          publicLabels.push(lbl);
        }
      }
      // Red indicator arrow on datum
      parts.push(
        `<polygon points="${sleeveRight - 2},${datumY} ${sleeveRight - 10},${datumY - 5} ${sleeveRight - 10},${datumY + 5}" fill="${RED}"/>`,
        svgText(210, 290, "Main sleeve (mm upper, 0.5 mm lower)", {
          size: 11,
          fill: SLATE,
          anchor: "middle",
        }),
      );
      publicLabels.push(
        "Micrometer Screw Gauge (0.5 mm pitch, 50 thimble divisions)",
        "Main sleeve (mm upper, 0.5 mm lower)",
      );
      if (!hidden.has("zeroErrorMm") && Math.abs(zeroErrorMm) > 1e-9) {
        const zStr = `Zero error: ${zeroErrorMm > 0 ? "+" : "−"}${Math.abs(zeroErrorMm).toFixed(2)} mm`;
        parts.push(
          svgText(320, 322, zStr, {
            size: 11.5,
            weight: 600,
            fill: TEAL,
            anchor: "middle",
          }),
        );
        publicNumbers.push(zeroErrorMm);
        publicLabels.push(zStr);
      }

      return {
        visualFamily: "al-prac-instruments-cro",
        svgMarkup: wrapSvg(
          "Magnified micrometer screw gauge scale reading",
          "",
          parts.join(""),
        ),
        rendererVersion: ALEVEL_PRACTICALS_RENDERER_VERSION,
        publicNumbers,
        publicLabels,
      };
    }

    if (mode === "vernier") {
      const mainMm = Number(spec.mainScaleMm);
      const coin = Number(spec.vernierCoincidence);
      const resMm = Number(spec.resolutionMm);
      const zeroErrorMm = Number(spec.zeroErrorMm);
      const numVernierDivs = Math.round(1 / resMm);
      const pxPerMm = 20;
      const startMm = Math.max(0, mainMm - 6);
      const xOrigin = 64;
      const mainY = 152;
      const vernierY = 154;

      parts.push(
        svgText(
          320,
          36,
          `Vernier Calliper Scale (resolution ${resMm.toFixed(2)} mm)`,
          { size: 13, weight: 700, anchor: "middle" },
        ),
        `<rect x="44" y="88" width="552" height="64" fill="${PANEL_BG}" stroke="${INK}" stroke-width="1.8"/>`,
      );
      publicNumbers.push(resMm);

      // Main scale mm ticks
      for (let mm = startMm; mm <= startMm + 25; mm += 1) {
        const tx = xOrigin + (mm - startMm) * pxPerMm;
        const isTen = mm % 10 === 0;
        const isFive = mm % 5 === 0;
        const h = isTen ? 32 : isFive ? 22 : 14;
        parts.push(
          `<line x1="${f2(tx)}" y1="${mainY}" x2="${f2(tx)}" y2="${f2(mainY - h)}" stroke="${INK}" stroke-width="${isTen ? 1.8 : 1.1}"/>`,
        );
        if (isTen) {
          const lbl = `${mm} mm`;
          parts.push(
            svgText(tx, mainY - 38, lbl, {
              size: 11,
              weight: 600,
              anchor: "middle",
            }),
          );
          publicNumbers.push(mm);
          publicLabels.push(lbl);
        }
      }

      // Sliding vernier body starting at mainMm + coin*resMm
      const vZeroX = xOrigin + (mainMm - startMm + coin * resMm) * pxPerMm;
      const vSpanMm = numVernierDivs === 10 ? 9 : 19;
      const vStepPx = (vSpanMm / numVernierDivs) * pxPerMm;
      const vBodyW = Math.min(540 - vZeroX + 44, vSpanMm * pxPerMm + 42);

      parts.push(
        `<rect x="${f2(vZeroX - 18)}" y="${vernierY}" width="${f2(Math.max(180, vBodyW))}" height="68" fill="#eff6ff" stroke="${BLUE}" stroke-width="1.8"/>`,
      );

      const maxDrawDivs = Math.min(numVernierDivs, 14);
      for (let d = 0; d <= maxDrawDivs; d += 1) {
        const vx = vZeroX + d * vStepPx;
        if (vx > 584) break;
        const isCoin = d === coin;
        const isLabel = d === 0 || d % 5 === 0 || isCoin;
        parts.push(
          `<line x1="${f2(vx)}" y1="${vernierY}" x2="${f2(vx)}" y2="${f2(vernierY + (isLabel ? 26 : 16))}" stroke="${isCoin ? RED : BLUE}" stroke-width="${isCoin ? 2.2 : 1.2}"/>`,
        );
        if (isLabel) {
          const lbl = String(d);
          parts.push(
            svgText(vx, vernierY + 42, lbl, {
              size: 10.5,
              weight: isCoin ? 700 : 500,
              fill: isCoin ? RED : BLUE,
              anchor: "middle",
            }),
          );
          publicNumbers.push(d);
          publicLabels.push(lbl);
        }
      }

      // Coincidence pointer arrow
      const coinX = vZeroX + coin * vStepPx;
      parts.push(
        `<line x1="${f2(coinX)}" y1="234" x2="${f2(coinX)}" y2="262" stroke="${RED}" stroke-width="1.8"/>`,
        svgText(coinX, 278, "Aligned vernier mark", {
          size: 11,
          weight: 700,
          fill: RED,
          anchor: "middle",
        }),
        svgText(320, 314, "Main scale (top) and sliding Vernier scale (bottom)", {
          size: 11,
          fill: SLATE,
          anchor: "middle",
        }),
      );
      if (!hidden.has("zeroErrorMm") && Math.abs(zeroErrorMm) > 1e-9) {
        const zStr = `Zero error: ${zeroErrorMm > 0 ? "+" : "−"}${Math.abs(zeroErrorMm).toFixed(2)} mm`;
        parts.push(
          svgText(320, 338, zStr, {
            size: 11.5,
            weight: 600,
            fill: TEAL,
            anchor: "middle",
          }),
        );
        publicNumbers.push(zeroErrorMm);
        publicLabels.push(zStr);
      }

      return {
        visualFamily: "al-prac-instruments-cro",
        svgMarkup: wrapSvg(
          "Magnified Vernier calliper scale reading",
          "",
          parts.join(""),
        ),
        rendererVersion: ALEVEL_PRACTICALS_RENDERER_VERSION,
        publicNumbers,
        publicLabels,
      };
    }

    // CRO waveform (10 x 8 graticule)
    const timeBase = Number(spec.timeBaseMsPerDiv);
    const yGain = Number(spec.yGainVPerDiv);
    const divsPerCycle = Number(spec.divsPerCycle);
    const p2pDivs = Number(spec.peakToPeakDivs);

    const gx = 54;
    const gy = 38;
    const cell = 36;
    const gw = 10 * cell;
    const gh = 8 * cell;

    parts.push(
      `<rect x="${gx}" y="${gy}" width="${gw}" height="${gh}" rx="8" fill="#f8fafc" stroke="${INK}" stroke-width="2.2"/>`,
    );
    for (let c = 1; c < 10; c += 1) {
      const lx = gx + c * cell;
      parts.push(
        `<line x1="${lx}" y1="${gy}" x2="${lx}" y2="${gy + gh}" stroke="${c === 5 ? "#94a3b8" : GRID}" stroke-width="${c === 5 ? 1.4 : 1}"/>`,
      );
    }
    for (let r = 1; r < 8; r += 1) {
      const ly = gy + r * cell;
      parts.push(
        `<line x1="${gx}" y1="${ly}" x2="${gx + gw}" y2="${ly}" stroke="${r === 4 ? "#94a3b8" : GRID}" stroke-width="${r === 4 ? 1.4 : 1}"/>`,
      );
    }
    // Fine centre-axis subdivision ticks
    for (let s = 1; s < 50; s += 1) {
      const tx = gx + (s / 5) * cell;
      parts.push(
        `<line x1="${f2(tx)}" y1="${gy + 4 * cell - 3}" x2="${f2(tx)}" y2="${gy + 4 * cell + 3}" stroke="#94a3b8" stroke-width="0.9"/>`,
      );
    }
    for (let s = 1; s < 40; s += 1) {
      const ty = gy + (s / 5) * cell;
      parts.push(
        `<line x1="${gx + 5 * cell - 3}" y1="${f2(ty)}" x2="${gx + 5 * cell + 3}" y2="${f2(ty)}" stroke="#94a3b8" stroke-width="0.9"/>`,
      );
    }

    // Sinusoidal waveform trace
    const ampPx = (p2pDivs / 2) * cell;
    const midY = gy + 4 * cell;
    const pts: string[] = [];
    const steps = 200;
    for (let i = 0; i <= steps; i += 1) {
      const divX = (i / steps) * 10;
      const px = gx + divX * cell;
      const py = midY - ampPx * Math.sin((2 * Math.PI * divX) / divsPerCycle);
      pts.push(`${f2(px)},${f2(py)}`);
    }
    parts.push(
      `<polyline points="${pts.join(" ")}" fill="none" stroke="${TEAL}" stroke-width="2.6"/>`,
      svgText(gx + gw / 2, gy + gh + 22, "CRO Graticule (10 × 8 divisions)", {
        size: 11.5,
        weight: 600,
        fill: SLATE,
        anchor: "middle",
      }),
    );

    // Control panel on right
    const px = gx + gw + 22;
    const tbLabel = `${fmtTick(timeBase, 2)} ms div⁻¹`;
    const ygLabel = `${fmtTick(yGain, 2)} V div⁻¹`;
    parts.push(
      `<rect x="${px}" y="${gy}" width="184" height="${gh}" rx="8" fill="${PANEL_BG}" stroke="${BORDER}" stroke-width="1.4"/>`,
      svgText(px + 92, gy + 28, "CRO Settings", {
        size: 13,
        weight: 700,
        anchor: "middle",
      }),
      `<circle cx="${px + 92}" cy="${gy + 92}" r="26" fill="#ffffff" stroke="${INK}" stroke-width="1.8"/>`,
      `<line x1="${px + 92}" y1="${gy + 92}" x2="${px + 109}" y2="${gy + 76}" stroke="${BLUE}" stroke-width="2.4"/>`,
      svgText(px + 92, gy + 136, "Time-base", {
        size: 11,
        weight: 600,
        fill: SLATE,
        anchor: "middle",
      }),
      svgText(px + 92, gy + 154, tbLabel, {
        size: 12,
        weight: 700,
        fill: BLUE,
        anchor: "middle",
      }),
      `<circle cx="${px + 92}" cy="${gy + 206}" r="26" fill="#ffffff" stroke="${INK}" stroke-width="1.8"/>`,
      `<line x1="${px + 92}" y1="${gy + 206}" x2="${px + 74}" y2="${gy + 190}" stroke="${RED}" stroke-width="2.4"/>`,
      svgText(px + 92, gy + 250, "Y-gain", {
        size: 11,
        weight: 600,
        fill: SLATE,
        anchor: "middle",
      }),
      svgText(px + 92, gy + 268, ygLabel, {
        size: 12,
        weight: 700,
        fill: RED,
        anchor: "middle",
      }),
    );
    publicNumbers.push(timeBase, yGain, divsPerCycle, p2pDivs);
    publicLabels.push(tbLabel, ygLabel);

    return {
      visualFamily: "al-prac-instruments-cro",
      svgMarkup: wrapSvg(
        "Oscilloscope graticule showing sinusoidal AC trace with time-base and Y-gain settings",
        "",
        parts.join(""),
      ),
      rendererVersion: ALEVEL_PRACTICALS_RENDERER_VERSION,
      publicNumbers,
      publicLabels,
    };
  },
};

/* -------------------------------------------------------------------------- */
/*  3. al-prac-log-linearization (Paper 3A, 3.1, Y13, graphs)                 */
/* -------------------------------------------------------------------------- */

const LOG_LINEARIZATION_PLUGIN: DomainKindPlugin = {
  domain: "graphs",
  kind: "al-prac-log-linearization",
  summary:
    "Log-log (lg y vs lg x) and semi-log (ln y vs t) linearization plots with deliberate false origin requiring c = y1 - m x1 extraction.",
  requiredFields: [
    { name: "lawType", type: "string", enumValues: ["power-lg", "exp-ln"] },
    { name: "xMin", type: "number", bounds: "> 0" },
    { name: "x1", type: "number", bounds: "> xMin" },
    { name: "y1", type: "number" },
    { name: "x2", type: "number", bounds: "> x1" },
    { name: "y2", type: "number" },
    { name: "xAxisTitle", type: "string" },
    { name: "yAxisTitle", type: "string" },
  ],
  physicalConstraints: [
    "False origin xMin > 0 means the vertical axis crossing is NOT at x = 0.",
    "For power-lg, gradient = n and k = 10^(y1 - n*x1).",
    "For exp-ln, gradient = -lambda < 0 and A = exp(y1 + lambda*x1).",
  ],
  probeSpecs: [
    {
      kind: "al-prac-log-linearization",
      lawType: "power-lg",
      xMin: 0.6,
      x1: 0.7,
      y1: 0.25,
      x2: 1.5,
      y2: 1.45,
      xAxisTitle: "lg(L / cm)",
      yAxisTitle: "lg(T / ms)",
    },
    {
      kind: "al-prac-log-linearization",
      lawType: "exp-ln",
      xMin: 10,
      x1: 15,
      y1: 2.6,
      x2: 55,
      y2: 1.0,
      xAxisTitle: "t / s",
      yAxisTitle: "ln(V / V)",
    },
  ],
  validate(spec) {
    const issues: string[] = [];
    if (spec.lawType !== "power-lg" && spec.lawType !== "exp-ln") {
      issues.push('lawType must be "power-lg" or "exp-ln"');
    }
    if (!isPosNum(spec.xMin)) issues.push("xMin must be positive (false origin)");
    if (!isFiniteNum(spec.x1) || !isFiniteNum(spec.x2)) {
      issues.push("x1 and x2 must be finite numbers");
    }
    if (!isFiniteNum(spec.y1) || !isFiniteNum(spec.y2)) {
      issues.push("y1 and y2 must be finite numbers");
    }
    if (
      isPosNum(spec.xMin) &&
      isFiniteNum(spec.x1) &&
      isFiniteNum(spec.x2) &&
      !(spec.x1 > spec.xMin && spec.x2 > spec.x1)
    ) {
      issues.push("Must satisfy xMin < x1 < x2");
    }
    if (
      spec.lawType === "exp-ln" &&
      isFiniteNum(spec.y1) &&
      isFiniteNum(spec.y2) &&
      !(spec.y2 < spec.y1)
    ) {
      issues.push("For exp-ln decay, y2 must be strictly less than y1");
    }
    if (
      spec.lawType === "power-lg" &&
      isFiniteNum(spec.y1) &&
      isFiniteNum(spec.y2) &&
      Math.abs(spec.y2 - spec.y1) < 1e-6
    ) {
      issues.push("For power-lg, y2 must differ from y1");
    }
    if (!isNonEmptyStr(spec.xAxisTitle) || !isNonEmptyStr(spec.yAxisTitle)) {
      issues.push("xAxisTitle and yAxisTitle must be non-empty strings");
    }
    return makeValidationResult(issues);
  },
  solve(spec): DomainSolveOutput {
    const lawType = String(spec.lawType);
    const xMin = Number(spec.xMin);
    const x1 = Number(spec.x1);
    const y1 = Number(spec.y1);
    const x2 = Number(spec.x2);
    const y2 = Number(spec.y2);
    const gradient = (y2 - y1) / (x2 - x1);
    const trueIntercept = y1 - gradient * x1;
    const naiveInterceptAtXMin = gradient * xMin + trueIntercept;

    if (lawType === "power-lg") {
      const coeffK = 10 ** trueIntercept;
      const naiveCoeffK = 10 ** naiveInterceptAtXMin;
      return {
        solverId: "sixthphysics/al-prac-log-linearization/1.0.0",
        quantities: {
          exponentN: gradient,
          lgK: trueIntercept,
          coeffK,
          naiveInterceptAtXMin,
          naiveCoeffK,
          linearFormAnchor:
            "taking base ten logarithms gives lg y equals n lg x plus lg k and a false origin requires substituting a point on the line to find the intercept",
        },
        publicNumbers: [xMin, x1, y1, x2, y2],
      };
    }

    const decayConst = -gradient;
    const initialA = Math.exp(trueIntercept);
    const halfLifeS = Math.LN2 / decayConst;
    const naiveInitialA = Math.exp(naiveInterceptAtXMin);
    return {
      solverId: "sixthphysics/al-prac-log-linearization/1.0.0",
      quantities: {
        gradLnYvsT: gradient,
        decayConst,
        lnA: trueIntercept,
        initialA,
        halfLifeS,
        naiveInterceptAtXMin,
        naiveInitialA,
        linearFormAnchor:
          "taking natural logarithms gives ln y equals ln A minus lambda t and the false origin requires substituting a point on the line rather than reading the vertical axis crossing",
      },
      publicNumbers: [xMin, x1, y1, x2, y2],
    };
  },
  renderSvg(spec, options): DomainRenderOutput {
    const xMin = Number(spec.xMin);
    const x1 = Number(spec.x1);
    const y1 = Number(spec.y1);
    const x2 = Number(spec.x2);
    const y2 = Number(spec.y2);
    const xAxisTitle = String(spec.xAxisTitle);
    const yAxisTitle = String(spec.yAxisTitle);

    const m = (y2 - y1) / (x2 - x1);
    const c = y1 - m * x1;
    const xSpan = x2 - x1;
    const xMax = x2 + 0.25 * xSpan;
    const yAtMin = m * xMin + c;
    const yAtMax = m * xMax + c;
    const yLo = Math.min(yAtMin, yAtMax);
    const yHi = Math.max(yAtMin, yAtMax);
    const yPad = Math.max(0.25, (yHi - yLo) * 0.22);
    const yMin = yLo - yPad;
    const yMax = yHi + yPad;

    const padL = 82;
    const padR = 44;
    const padT = 36;
    const padB = 56;
    const plotW = VIEW_W - padL - padR;
    const plotH = VIEW_H - padT - padB;

    const sx = (x: number): number =>
      padL + ((x - xMin) / (xMax - xMin)) * plotW;
    const sy = (y: number): number =>
      padT + plotH - ((y - yMin) / (yMax - yMin)) * plotH;

    const parts: string[] = [];
    const publicNumbers: number[] = [xMin, x1, y1, x2, y2];
    const publicLabels: string[] = [];

    // Gridlines
    for (let i = 0; i <= 5; i += 1) {
      const xv = xMin + ((xMax - xMin) * i) / 5;
      const px = sx(xv);
      parts.push(
        `<line x1="${f2(px)}" y1="${padT}" x2="${f2(px)}" y2="${padT + plotH}" stroke="${GRID}" stroke-width="1"/>`,
      );
      const tLbl = fmtTick(xv, 2);
      parts.push(
        svgText(px, padT + plotH + 18, tLbl, {
          size: 10,
          fill: SLATE,
          anchor: "middle",
        }),
      );
      publicNumbers.push(xv);
      publicLabels.push(tLbl);
    }
    for (let j = 0; j <= 5; j += 1) {
      const yv = yMin + ((yMax - yMin) * j) / 5;
      const py = sy(yv);
      parts.push(
        `<line x1="${padL}" y1="${f2(py)}" x2="${padL + plotW}" y2="${f2(py)}" stroke="${GRID}" stroke-width="1"/>`,
      );
      const tLbl = fmtTick(yv, 2);
      parts.push(
        svgText(padL - 8, py + 3.5, tLbl, {
          size: 10,
          fill: SLATE,
          anchor: "end",
        }),
      );
      publicNumbers.push(yv);
      publicLabels.push(tLbl);
    }

    // Axes + false-origin zig-zag break indicator
    parts.push(
      `<line x1="${padL}" y1="${padT}" x2="${padL}" y2="${padT + plotH}" stroke="${INK}" stroke-width="1.8"/>`,
      `<line x1="${padL}" y1="${padT + plotH}" x2="${padL + plotW}" y2="${padT + plotH}" stroke="${INK}" stroke-width="1.8"/>`,
      `<polyline points="${padL - 12},${padT + plotH} ${padL - 8},${padT + plotH - 5} ${padL - 4},${padT + plotH + 5} ${padL},${padT + plotH}" fill="none" stroke="${RED}" stroke-width="1.6"/>`,
      svgText(padL + 4, padT + 14, "False origin (x ≠ 0)", {
        size: 10,
        weight: 600,
        fill: RED,
      }),
    );

    const clipId = makeId("log-clip", options);
    const defs = `<clipPath id="${clipId}"><rect x="${padL}" y="${padT}" width="${plotW}" height="${plotH}"/></clipPath>`;

    // Best-fit line
    parts.push(
      `<line x1="${f2(sx(xMin))}" y1="${f2(sy(yAtMin))}" x2="${f2(sx(xMax))}" y2="${f2(sy(yAtMax))}" stroke="${BLUE}" stroke-width="2.3" clip-path="url(#${clipId})"/>`,
    );

    // 5 synthetic data crosses along best-fit line
    for (let k = 0; k < 5; k += 1) {
      const px = x1 + ((x2 - x1) * k) / 4;
      const py = m * px + c;
      const cx = sx(px);
      const cy = sy(py);
      parts.push(
        `<line x1="${f2(cx - 4)}" y1="${f2(cy - 4)}" x2="${f2(cx + 4)}" y2="${f2(cy + 4)}" stroke="${INK}" stroke-width="1.5"/>`,
        `<line x1="${f2(cx - 4)}" y1="${f2(cy + 4)}" x2="${f2(cx + 4)}" y2="${f2(cy - 4)}" stroke="${INK}" stroke-width="1.5"/>`,
      );
    }

    // Large gradient triangle between (x1, y1) and (x2, y2)
    const gx1 = sx(x1);
    const gy1 = sy(y1);
    const gx2 = sx(x2);
    const gy2 = sy(y2);
    const cornerX = m >= 0 ? gx2 : gx1;
    const cornerY = m >= 0 ? gy1 : gy2;
    parts.push(
      `<polyline points="${f2(gx1)},${f2(gy1)} ${f2(cornerX)},${f2(cornerY)} ${f2(gx2)},${f2(gy2)}" fill="none" stroke="${TEAL}" stroke-width="1.6" stroke-dasharray="5,4"/>`,
      `<circle cx="${f2(gx1)}" cy="${f2(gy1)}" r="4" fill="${RED}"/>`,
      `<circle cx="${f2(gx2)}" cy="${f2(gy2)}" r="4" fill="${RED}"/>`,
    );

    const lblP1 = `(${fmtTick(x1, 2)}, ${fmtTick(y1, 2)})`;
    const lblP2 = `(${fmtTick(x2, 2)}, ${fmtTick(y2, 2)})`;
    parts.push(
      svgText(gx1 + 10, gy1 - 8, lblP1, {
        size: 10.5,
        weight: 600,
        fill: RED,
      }),
      svgText(gx2 - 10, gy2 + (m >= 0 ? -10 : 18), lblP2, {
        size: 10.5,
        weight: 600,
        fill: RED,
        anchor: "end",
      }),
    );
    publicLabels.push(lblP1, lblP2);

    // Axis titles
    parts.push(
      svgText(padL + plotW / 2, VIEW_H - 14, xAxisTitle, {
        size: 12,
        weight: 600,
        anchor: "middle",
      }),
      svgText(22, padT + plotH / 2, yAxisTitle, {
        size: 12,
        weight: 600,
        anchor: "middle",
        rotate: `rotate(-90 22 ${f2(padT + plotH / 2)})`,
      }),
    );

    return {
      visualFamily: "al-prac-log-linearization",
      svgMarkup: wrapSvg(
        "Logarithmic linearization plot with false origin and gradient triangle",
        defs,
        parts.join(""),
      ),
      rendererVersion: ALEVEL_PRACTICALS_RENDERER_VERSION,
      publicNumbers,
      publicLabels,
    };
  },
};

/* -------------------------------------------------------------------------- */
/*  4. al-prac-rp1-stationary-string (RP1, 3.3.1, Y12, waves)                 */
/* -------------------------------------------------------------------------- */

const RP1_STATIONARY_STRING_PLUGIN: DomainKindPlugin = {
  domain: "waves",
  kind: "al-prac-rp1-stationary-string",
  summary:
    "AQA Required Practical 1: Stationary waves on a stretched string driven by a vibration generator with bridge, bench pulley, and hanging slotted masses.",
  requiredFields: [
    { name: "hangingMassKg", type: "number", unit: "kg", bounds: "0.1..5.0" },
    { name: "stringLengthM", type: "number", unit: "m", bounds: "0.4..2.0" },
    {
      name: "linearDensityKgPerM",
      type: "number",
      unit: "kg m^-1",
      bounds: "1e-4..0.02",
    },
    { name: "harmonicN", type: "number", bounds: "1..3" },
    { name: "pctUncMass", type: "number", unit: "%", bounds: "0.2..5" },
    { name: "pctUncLength", type: "number", unit: "%", bounds: "0.1..5" },
    { name: "pctUncFreq", type: "number", unit: "%", bounds: "0.1..5" },
  ],
  physicalConstraints: [
    "Tension T = m g with g = 9.81 m s^-2.",
    "Wave speed v = sqrt(T / mu); harmonic frequency f_n = n v / (2 L).",
    "Gradient of f_1 vs 1/L equals v / 2.",
  ],
  probeSpecs: [
    {
      kind: "al-prac-rp1-stationary-string",
      hangingMassKg: 0.4,
      stringLengthM: 1.2,
      linearDensityKgPerM: 0.0012,
      harmonicN: 1,
      pctUncMass: 1.5,
      pctUncLength: 0.4,
      pctUncFreq: 0.8,
    },
    {
      kind: "al-prac-rp1-stationary-string",
      hangingMassKg: 0.65,
      stringLengthM: 0.9,
      linearDensityKgPerM: 0.0018,
      harmonicN: 3,
      pctUncMass: 1.0,
      pctUncLength: 0.5,
      pctUncFreq: 0.6,
    },
  ],
  validate(spec) {
    const issues: string[] = [];
    if (!isPosNum(spec.hangingMassKg) || spec.hangingMassKg > 5) {
      issues.push("hangingMassKg must be in (0, 5]");
    }
    if (
      !isPosNum(spec.stringLengthM) ||
      spec.stringLengthM < 0.3 ||
      spec.stringLengthM > 2.5
    ) {
      issues.push("stringLengthM must be in [0.3, 2.5]");
    }
    if (
      !isPosNum(spec.linearDensityKgPerM) ||
      spec.linearDensityKgPerM < 1e-4 ||
      spec.linearDensityKgPerM > 0.05
    ) {
      issues.push("linearDensityKgPerM must be in [1e-4, 0.05]");
    }
    if (
      !Number.isInteger(spec.harmonicN) ||
      Number(spec.harmonicN) < 1 ||
      Number(spec.harmonicN) > 3
    ) {
      issues.push("harmonicN must be integer 1, 2, or 3");
    }
    if (
      !isPosNum(spec.pctUncMass) ||
      !isPosNum(spec.pctUncLength) ||
      !isPosNum(spec.pctUncFreq)
    ) {
      issues.push("Percentage uncertainties must be positive");
    }
    return makeValidationResult(issues);
  },
  solve(spec): DomainSolveOutput {
    const m = Number(spec.hangingMassKg);
    const L = Number(spec.stringLengthM);
    const mu = Number(spec.linearDensityKgPerM);
    const n = Number(spec.harmonicN);
    const pM = Number(spec.pctUncMass);
    const pL = Number(spec.pctUncLength);
    const pF = Number(spec.pctUncFreq);

    const tensionN = m * ALEVEL_GRAVITY_MS2;
    const waveSpeed = Math.sqrt(tensionN / mu);
    const fundamentalFreqHz = waveSpeed / (2 * L);
    const harmonicFreqHz = n * fundamentalFreqHz;
    const gradFvsInvL = waveSpeed / 2;
    const pctUncV = pF + pL;
    const pctUncMu = pM + 2 * pF + 2 * pL;

    return {
      solverId: "sixthphysics/al-prac-rp1-string/1.0.0",
      quantities: {
        tensionN,
        waveSpeed,
        fundamentalFreqHz,
        harmonicFreqHz,
        gradFvsInvL,
        linearDensityMu: mu,
        pctUncV,
        pctUncMu,
        rp1Anchor:
          "measure the vibrating length between the wooden bridge and pulley nodes because the first harmonic frequency equals wave speed divided by twice that length",
      },
      publicNumbers: [m, L, n],
    };
  },
  renderSvg(spec, options): DomainRenderOutput {
    const m = Number(spec.hangingMassKg);
    const L = Number(spec.stringLengthM);
    const n = Number(spec.harmonicN);
    const hidden = extractHiddenSet(spec, options);
    const parts: string[] = [];
    const publicNumbers: number[] = [];
    const publicLabels: string[] = [];

    const benchY = 236;
    const bridgeX = 156;
    const pulleyX = 486;
    const stringY = 166;
    const spanW = pulleyX - bridgeX;

    parts.push(
      svgText(320, 30, "RP1: Stationary Waves on a Stretched String", {
        size: 13.5,
        weight: 700,
        anchor: "middle",
      }),
      // Lab bench
      `<rect x="44" y="${benchY}" width="466" height="16" fill="#cbd5e1" stroke="${INK}" stroke-width="1.5"/>`,
      `<rect x="64" y="${benchY + 16}" width="18" height="90" fill="#94a3b8" stroke="${INK}" stroke-width="1.2"/>`,
      `<rect x="466" y="${benchY + 16}" width="18" height="90" fill="#94a3b8" stroke="${INK}" stroke-width="1.2"/>`,
      // Vibration generator
      `<rect x="64" y="182" width="66" height="54" rx="5" fill="${PANEL_BG}" stroke="${INK}" stroke-width="1.8"/>`,
      svgText(97, 206, "Vibration", { size: 10, weight: 600, anchor: "middle" }),
      svgText(97, 220, "generator", { size: 10, weight: 600, anchor: "middle" }),
      `<line x1="97" y1="182" x2="97" y2="${stringY}" stroke="${INK}" stroke-width="2.2"/>`,
      // Wooden bridge
      `<polygon points="${bridgeX - 12},${benchY} ${bridgeX + 12},${benchY} ${bridgeX},${stringY}" fill="#d97706" stroke="${INK}" stroke-width="1.5"/>`,
      svgText(bridgeX, benchY + 34, "Bridge", {
        size: 10.5,
        fill: SLATE,
        anchor: "middle",
      }),
      // Pulley
      `<line x1="${pulleyX}" y1="${benchY}" x2="${pulleyX + 20}" y2="${stringY + 16}" stroke="${INK}" stroke-width="2.4"/>`,
      `<circle cx="${pulleyX + 20}" cy="${stringY + 16}" r="16" fill="${PANEL_BG}" stroke="${INK}" stroke-width="1.8"/>`,
      `<circle cx="${pulleyX + 20}" cy="${stringY + 16}" r="3.5" fill="${INK}"/>`,
      svgText(pulleyX + 20, stringY - 10, "Pulley", {
        size: 10.5,
        fill: SLATE,
        anchor: "middle",
      }),
      // Drive segment from generator to bridge
      `<line x1="97" y1="${stringY}" x2="${bridgeX}" y2="${stringY}" stroke="${INK}" stroke-width="1.8"/>`,
      // Vertical hanging cord + slotted masses
      `<line x1="${pulleyX + 36}" y1="${stringY + 16}" x2="${pulleyX + 36}" y2="278" stroke="${INK}" stroke-width="1.8"/>`,
      `<rect x="${pulleyX + 14}" y="278" width="44" height="36" rx="3" fill="#e2e8f0" stroke="${INK}" stroke-width="1.6"/>`,
      `<line x1="${pulleyX + 14}" y1="290" x2="${pulleyX + 58}" y2="290" stroke="${SLATE}" stroke-width="1"/>`,
      `<line x1="${pulleyX + 14}" y1="302" x2="${pulleyX + 58}" y2="302" stroke="${SLATE}" stroke-width="1"/>`,
    );

    if (!hidden.has("hangingMassKg")) {
      const mLbl = `m = ${fmtTick(m, 2)} kg`;
      parts.push(
        svgText(pulleyX + 36, 332, mLbl, {
          size: 11,
          weight: 600,
          anchor: "middle",
        }),
      );
      publicNumbers.push(m);
      publicLabels.push(mLbl);
    }

    // Standing-wave envelope (n loops between bridgeX and pulleyX)
    const upperPts: string[] = [];
    const lowerPts: string[] = [];
    const amp = 26;
    for (let i = 0; i <= 120; i += 1) {
      const u = i / 120;
      const px = bridgeX + u * spanW;
      const env = amp * Math.sin(n * Math.PI * u);
      upperPts.push(`${f2(px)},${f2(stringY - env)}`);
      lowerPts.push(`${f2(px)},${f2(stringY + env)}`);
    }
    parts.push(
      `<line x1="${bridgeX}" y1="${stringY}" x2="${pulleyX + 20}" y2="${stringY}" stroke="${BORDER}" stroke-width="1.2" stroke-dasharray="4,3"/>`,
      `<polyline points="${upperPts.join(" ")}" fill="none" stroke="${BLUE}" stroke-width="2.2"/>`,
      `<polyline points="${lowerPts.join(" ")}" fill="none" stroke="${BLUE}" stroke-width="1.8" stroke-dasharray="5,3"/>`,
    );

    // Node & antinode markers
    for (let k = 0; k <= n; k += 1) {
      const nx = bridgeX + (k / n) * spanW;
      parts.push(
        `<circle cx="${f2(nx)}" cy="${stringY}" r="3.5" fill="${RED}"/>`,
        svgText(nx, stringY - 34, "N", {
          size: 10.5,
          weight: 700,
          fill: RED,
          anchor: "middle",
        }),
      );
    }
    for (let k = 0; k < n; k += 1) {
      const ax = bridgeX + ((k + 0.5) / n) * spanW;
      parts.push(
        svgText(ax, stringY + 42, "A", {
          size: 10.5,
          weight: 700,
          fill: TEAL,
          anchor: "middle",
        }),
      );
    }

    // Metre ruler & length L dimension arrow
    const arrId = makeId("rp1-arr", options);
    const defs = arrowMarkerDef(arrId, INK);
    const lLbl = hidden.has("stringLengthM")
      ? "L (node to node)"
      : `L = ${fmtTick(L, 2)} m`;
    if (!hidden.has("stringLengthM")) {
      publicNumbers.push(L);
      publicLabels.push(lLbl);
    }
    parts.push(
      `<line x1="${bridgeX}" y1="84" x2="${pulleyX}" y2="84" stroke="${INK}" stroke-width="1.4" marker-start="url(#${arrId})" marker-end="url(#${arrId})"/>`,
      svgText((bridgeX + pulleyX) / 2, 74, lLbl, {
        size: 11.5,
        weight: 600,
        anchor: "middle",
      }),
      `<rect x="${bridgeX}" y="220" width="${spanW}" height="12" fill="#fef3c7" stroke="${INK}" stroke-width="1"/>`,
      svgText((bridgeX + pulleyX) / 2, 230, "Metre ruler", {
        size: 9,
        fill: SLATE,
        anchor: "middle",
      }),
    );

    return {
      visualFamily: "al-prac-rp1-stationary-string",
      svgMarkup: wrapSvg(
        "Required Practical 1 stationary wave apparatus on a stretched string",
        defs,
        parts.join(""),
      ),
      rendererVersion: ALEVEL_PRACTICALS_RENDERER_VERSION,
      publicNumbers,
      publicLabels,
    };
  },
};

/* -------------------------------------------------------------------------- */
/*  5. al-prac-rp2-slits-grating (RP2, 3.3.2, Y12, waves)                     */
/* -------------------------------------------------------------------------- */

const RP2_SLITS_GRATING_PLUGIN: DomainKindPlugin = {
  domain: "waves",
  kind: "al-prac-rp2-slits-grating",
  summary:
    "AQA Required Practical 2: Laser interference using Young's double slits (w = lambda D / s) or a diffraction grating (d sin theta = n lambda) with symmetric 2h span.",
  requiredFields: [
    { name: "mode", type: "string", enumValues: ["double-slit", "grating"] },
    { name: "screenDistanceM", type: "number", unit: "m", bounds: "0.5..5.0" },
  ],
  optionalFields: [
    { name: "slitSeparationMm", type: "number", unit: "mm", bounds: "0.1..1.5" },
    { name: "numFringeSpaces", type: "number", bounds: "4..15" },
    { name: "totalSpanMm", type: "number", unit: "mm", bounds: "5..120" },
    { name: "uncSpanMm", type: "number", unit: "mm" },
    { name: "uncDistanceM", type: "number", unit: "m" },
    { name: "uncSlitMm", type: "number", unit: "mm" },
    { name: "linesPerMm", type: "number", unit: "mm^-1", bounds: "100..1000" },
    { name: "orderN", type: "number", bounds: "1..3" },
    { name: "halfSpanM", type: "number", unit: "m", bounds: "0.1..2.0" },
  ],
  physicalConstraints: [
    "Double-slit: (n + 1) consecutive bright fringes span n fringe spaces (w = x_n / n).",
    "Diffraction grating: d = 1/N, tan(theta) = h/D, lambda = d sin(theta) / n, maxOrder = floor(d / lambda).",
  ],
  probeSpecs: [
    {
      kind: "al-prac-rp2-slits-grating",
      mode: "double-slit",
      slitSeparationMm: 0.4,
      screenDistanceM: 2.2,
      numFringeSpaces: 8,
      totalSpanMm: 28.0,
      uncSpanMm: 0.5,
      uncDistanceM: 0.01,
      uncSlitMm: 0.01,
    },
    {
      kind: "al-prac-rp2-slits-grating",
      mode: "grating",
      linesPerMm: 300,
      screenDistanceM: 1.5,
      orderN: 2,
      halfSpanM: 0.615,
    },
  ],
  validate(spec) {
    const issues: string[] = [];
    if (
      !isPosNum(spec.screenDistanceM) ||
      spec.screenDistanceM < 0.4 ||
      spec.screenDistanceM > 6
    ) {
      issues.push("screenDistanceM must be in [0.4, 6]");
    }
    if (spec.mode === "double-slit") {
      if (!isPosNum(spec.slitSeparationMm) || spec.slitSeparationMm > 2) {
        issues.push("slitSeparationMm must be in (0, 2]");
      }
      if (
        !Number.isInteger(spec.numFringeSpaces) ||
        Number(spec.numFringeSpaces) < 3 ||
        Number(spec.numFringeSpaces) > 20
      ) {
        issues.push("numFringeSpaces must be an integer in 3..20");
      }
      if (!isPosNum(spec.totalSpanMm) || spec.totalSpanMm > 200) {
        issues.push("totalSpanMm must be in (0, 200]");
      }
    } else if (spec.mode === "grating") {
      if (
        !isPosNum(spec.linesPerMm) ||
        spec.linesPerMm < 50 ||
        spec.linesPerMm > 1200
      ) {
        issues.push("linesPerMm must be in [50, 1200]");
      }
      if (
        !Number.isInteger(spec.orderN) ||
        Number(spec.orderN) < 1 ||
        Number(spec.orderN) > 4
      ) {
        issues.push("orderN must be an integer in 1..4");
      }
      if (!isPosNum(spec.halfSpanM) || spec.halfSpanM > 3) {
        issues.push("halfSpanM must be in (0, 3]");
      }
    } else {
      issues.push('mode must be "double-slit" or "grating"');
    }
    return makeValidationResult(issues);
  },
  solve(spec): DomainSolveOutput {
    const D = Number(spec.screenDistanceM);
    if (spec.mode === "double-slit") {
      const sMm = Number(spec.slitSeparationMm);
      const nSpaces = Number(spec.numFringeSpaces);
      const spanMm = Number(spec.totalSpanMm);
      const uncSpanMm = isPosNum(spec.uncSpanMm) ? Number(spec.uncSpanMm) : 0.5;
      const uncDM = isPosNum(spec.uncDistanceM)
        ? Number(spec.uncDistanceM)
        : 0.01;
      const uncSMm = isPosNum(spec.uncSlitMm) ? Number(spec.uncSlitMm) : 0.01;

      const fringeSpacingMm = spanMm / nSpaces;
      const wavelengthM = ((fringeSpacingMm * 1e-3) * (sMm * 1e-3)) / D;
      const wavelengthNm = wavelengthM * 1e9;
      const pctUncSpan = (uncSpanMm / spanMm) * 100;
      const pctUncD = (uncDM / D) * 100;
      const pctUncS = (uncSMm / sMm) * 100;
      const pctUncLambda = pctUncSpan + pctUncD + pctUncS;

      return {
        solverId: "sixthphysics/al-prac-rp2-slits-grating/1.0.0",
        quantities: {
          numBrightFringes: nSpaces + 1,
          fringeSpacingMm,
          wavelengthM,
          wavelengthNm,
          pctUncLambda,
          rp2SafetyAnchor:
            "avoid looking directly into the laser beam remove reflective surfaces and measure across many fringe spaces to reduce percentage uncertainty",
        },
        publicNumbers: [D, sMm, nSpaces, spanMm],
      };
    }

    const N = Number(spec.linesPerMm);
    const orderN = Number(spec.orderN);
    const h = Number(spec.halfSpanM);
    const dM = 1e-3 / N;
    const thetaRad = Math.atan(h / D);
    const angleThetaDeg = (thetaRad * 180) / Math.PI;
    const twoThetaDeg = 2 * angleThetaDeg;
    const fullSpan2hM = 2 * h;
    const wavelengthM = (dM * Math.sin(thetaRad)) / orderN;
    const wavelengthNm = wavelengthM * 1e9;
    const maxOrder = Math.floor(dM / wavelengthM);

    return {
      solverId: "sixthphysics/al-prac-rp2-slits-grating/1.0.0",
      quantities: {
        gratingSpacingM: dM,
        angleThetaDeg,
        twoThetaDeg,
        fullSpan2hM,
        wavelengthM,
        wavelengthNm,
        maxOrder,
        rp2SafetyAnchor:
          "align the grating perpendicular to the beam with a set square measure the symmetric span between matching orders and never look directly into the laser",
      },
      publicNumbers: [D, N, orderN, h, fullSpan2hM],
    };
  },
  renderSvg(spec, options): DomainRenderOutput {
    const mode = String(spec.mode);
    const D = Number(spec.screenDistanceM);
    const hidden = extractHiddenSet(spec, options);
    const parts: string[] = [];
    const publicNumbers: number[] = [];
    const publicLabels: string[] = [];

    const arrId = makeId("rp2-arr", options);
    const defs = arrowMarkerDef(arrId, INK);

    const laserX = 48;
    const opticX = 186;
    const screenX = 524;
    const midY = 186;

    parts.push(
      svgText(
        320,
        30,
        mode === "double-slit"
          ? "RP2: Laser Double-Slit Interference Apparatus"
          : "RP2: Diffraction Grating Symmetric Order Measurement",
        { size: 13.5, weight: 700, anchor: "middle" },
      ),
      // Laser unit
      `<rect x="${laserX}" y="${midY - 18}" width="84" height="36" rx="5" fill="#1e293b" stroke="${INK}" stroke-width="1.5"/>`,
      svgText(laserX + 42, midY + 4, "Class 2 Laser", {
        size: 10,
        weight: 600,
        fill: "#ffffff",
        anchor: "middle",
      }),
      // Incident laser beam
      `<line x1="${laserX + 84}" y1="${midY}" x2="${opticX}" y2="${midY}" stroke="${RED}" stroke-width="2.4"/>`,
      // Screen
      `<rect x="${screenX}" y="64" width="12" height="244" fill="#e2e8f0" stroke="${INK}" stroke-width="1.6"/>`,
      svgText(screenX + 22, 186, "Screen", {
        size: 11,
        weight: 600,
        fill: SLATE,
        anchor: "middle",
        rotate: `rotate(-90 ${screenX + 22} 186)`,
      }),
    );

    if (mode === "double-slit") {
      const nSpaces = Number(spec.numFringeSpaces);
      const spanMm = Number(spec.totalSpanMm);
      const sMm = Number(spec.slitSeparationMm);
      // Slit barrier with two narrow apertures
      parts.push(
        `<line x1="${opticX}" y1="112" x2="${opticX}" y2="${midY - 14}" stroke="${INK}" stroke-width="4"/>`,
        `<line x1="${opticX}" y1="${midY - 6}" x2="${opticX}" y2="${midY + 6}" stroke="${INK}" stroke-width="4"/>`,
        `<line x1="${opticX}" y1="${midY + 14}" x2="${opticX}" y2="260" stroke="${INK}" stroke-width="4"/>`,
        svgText(opticX, 102, "Double slit", {
          size: 10.5,
          weight: 600,
          anchor: "middle",
        }),
      );
      if (!hidden.has("slitSeparationMm")) {
        const sLbl = `s = ${fmtTick(sMm, 2)} mm`;
        parts.push(
          svgText(opticX, 278, sLbl, {
            size: 10.5,
            fill: BLUE,
            anchor: "middle",
          }),
        );
        publicNumbers.push(sMm);
        publicLabels.push(sLbl);
      }

      // Diverging beam envelope + bright fringes on screen
      parts.push(
        `<polygon points="${opticX},${midY - 10} ${screenX},88 ${screenX},284 ${opticX},${midY + 10}" fill="#fee2e2" fill-opacity="0.45" stroke="none"/>`,
      );
      const shownFringes = Math.min(nSpaces + 1, 9);
      const topY = 98;
      const botY = 274;
      for (let i = 0; i < shownFringes; i += 1) {
        const fy = topY + (i / (shownFringes - 1)) * (botY - topY);
        parts.push(
          `<rect x="${screenX - 4}" y="${f2(fy - 4)}" width="8" height="8" rx="2" fill="${RED}"/>`,
        );
      }
      // Span callout on screen
      const spanLbl = hidden.has("totalSpanMm")
        ? `${nSpaces} spaces`
        : `${nSpaces} spaces = ${fmtTick(spanMm, 1)} mm`;
      if (!hidden.has("totalSpanMm")) {
        publicNumbers.push(spanMm, nSpaces);
        publicLabels.push(spanLbl);
      }
      parts.push(
        `<line x1="${screenX - 24}" y1="${topY}" x2="${screenX - 24}" y2="${botY}" stroke="${BLUE}" stroke-width="1.4" marker-start="url(#${arrId})" marker-end="url(#${arrId})"/>`,
        svgText(screenX - 32, midY, spanLbl, {
          size: 10.5,
          weight: 600,
          fill: BLUE,
          anchor: "end",
        }),
      );
    } else {
      const N = Number(spec.linesPerMm);
      const orderN = Number(spec.orderN);
      const full2h = 2 * Number(spec.halfSpanM);
      // Diffraction grating plate + set square normal check
      parts.push(
        `<rect x="${opticX - 3}" y="128" width="6" height="116" fill="${BLUE}" stroke="${INK}" stroke-width="1.2"/>`,
        // Set-square triangle verifying 90 deg alignment
        `<polygon points="${opticX + 3},${midY + 56} ${opticX + 33},${midY + 56} ${opticX + 3},${midY + 26}" fill="#fef9c3" stroke="${SLATE}" stroke-width="1.2"/>`,
        svgText(opticX + 20, midY + 72, "Set square (90°)", {
          size: 9.5,
          fill: SLATE,
          anchor: "middle",
        }),
      );
      if (!hidden.has("linesPerMm")) {
        const nLbl = `${N} lines mm⁻¹`;
        parts.push(
          svgText(opticX, 118, nLbl, {
            size: 10.5,
            weight: 600,
            fill: BLUE,
            anchor: "middle",
          }),
        );
        publicNumbers.push(N);
        publicLabels.push(nLbl);
      }

      // Central ray + symmetric ±1, ±orderN diffracted rays
      const dyOrder = 86;
      const dyInner = 43;
      parts.push(
        `<line x1="${opticX}" y1="${midY}" x2="${screenX}" y2="${midY}" stroke="${RED}" stroke-width="1.8" stroke-dasharray="4,3"/>`,
        `<line x1="${opticX}" y1="${midY}" x2="${screenX}" y2="${midY - dyOrder}" stroke="${RED}" stroke-width="2"/>`,
        `<line x1="${opticX}" y1="${midY}" x2="${screenX}" y2="${midY + dyOrder}" stroke="${RED}" stroke-width="2"/>`,
        `<line x1="${opticX}" y1="${midY}" x2="${screenX}" y2="${midY - dyInner}" stroke="${RED}" stroke-width="1.1" stroke-dasharray="3,3"/>`,
        `<line x1="${opticX}" y1="${midY}" x2="${screenX}" y2="${midY + dyInner}" stroke="${RED}" stroke-width="1.1" stroke-dasharray="3,3"/>`,
        // Angle arc for theta
        `<path d="M ${opticX + 70} ${midY} A 70 70 0 0 0 ${opticX + 67} ${midY - 18}" fill="none" stroke="${TEAL}" stroke-width="1.5"/>`,
        svgText(opticX + 82, midY - 6, "θ", {
          size: 12,
          weight: 700,
          fill: TEAL,
          italic: true,
        }),
        // Order spots
        `<circle cx="${screenX}" cy="${midY}" r="4.5" fill="${RED}"/>`,
        `<circle cx="${screenX}" cy="${midY - dyOrder}" r="4.5" fill="${RED}"/>`,
        `<circle cx="${screenX}" cy="${midY + dyOrder}" r="4.5" fill="${RED}"/>`,
        svgText(screenX + 42, midY - dyOrder + 4, `n = +${orderN}`, {
          size: 10.5,
          weight: 600,
          fill: RED,
        }),
        svgText(screenX + 42, midY + 4, "n = 0", {
          size: 10.5,
          fill: SLATE,
        }),
        svgText(screenX + 42, midY + dyOrder + 4, `n = −${orderN}`, {
          size: 10.5,
          weight: 600,
          fill: RED,
        }),
      );
      const spanLbl = hidden.has("fullSpan2hM") || hidden.has("halfSpanM")
        ? "2h"
        : `2h = ${fmtTick(full2h, 3)} m`;
      if (!hidden.has("fullSpan2hM") && !hidden.has("halfSpanM")) {
        publicNumbers.push(full2h);
        publicLabels.push(spanLbl);
      }
      parts.push(
        `<line x1="${screenX - 18}" y1="${midY - dyOrder}" x2="${screenX - 18}" y2="${midY + dyOrder}" stroke="${BLUE}" stroke-width="1.4" marker-start="url(#${arrId})" marker-end="url(#${arrId})"/>`,
        svgText(screenX - 26, midY - 12, spanLbl, {
          size: 10.5,
          weight: 600,
          fill: BLUE,
          anchor: "end",
        }),
      );
    }

    // Distance D arrow at bottom
    const dLbl = hidden.has("screenDistanceM")
      ? "D"
      : `D = ${fmtTick(D, 2)} m`;
    if (!hidden.has("screenDistanceM")) {
      publicNumbers.push(D);
      publicLabels.push(dLbl);
    }
    parts.push(
      `<line x1="${opticX}" y1="322" x2="${screenX}" y2="322" stroke="${INK}" stroke-width="1.5" marker-start="url(#${arrId})" marker-end="url(#${arrId})"/>`,
      svgText((opticX + screenX) / 2, 342, dLbl, {
        size: 11.5,
        weight: 600,
        anchor: "middle",
      }),
    );

    return {
      visualFamily: "al-prac-rp2-slits-grating",
      svgMarkup: wrapSvg(
        "Required Practical 2 laser interference and diffraction grating apparatus",
        defs,
        parts.join(""),
      ),
      rendererVersion: ALEVEL_PRACTICALS_RENDERER_VERSION,
      publicNumbers,
      publicLabels,
    };
  },
};

/* -------------------------------------------------------------------------- */
/*  6. al-prac-rp3-freefall-g (RP3, 3.4.1, Y12, mechanics)                    */
/* -------------------------------------------------------------------------- */

const RP3_FREEFALL_G_PLUGIN: DomainKindPlugin = {
  domain: "mechanics",
  kind: "al-prac-rp3-freefall-g",
  summary:
    "AQA Required Practical 3: Free-fall determination of g via two light gates (2h/t = g t + 2u) or electromagnet-and-trapdoor (h = 1/2 g t^2) with plumb-line ruler alignment.",
  requiredFields: [
    { name: "mode", type: "string", enumValues: ["two-gates", "trapdoor"] },
  ],
  optionalFields: [
    { name: "grad2hOverTvsT", type: "number", unit: "m s^-2", bounds: "8.5..10.8" },
    { name: "intercept2u", type: "number", unit: "m s^-1", bounds: "0.4..6.0" },
    { name: "pctUncGrad", type: "number", unit: "%", bounds: "0.5..8" },
    { name: "dropHeightM", type: "number", unit: "m", bounds: "0.4..2.0" },
    { name: "gradHvsT2", type: "number", unit: "m s^-2", bounds: "4.2..5.3" },
    { name: "sysDelayMs", type: "number", unit: "ms", bounds: "2..40" },
  ],
  physicalConstraints: [
    "Two light gates: 2h/t = g t + 2u eliminates unknown speed u at the upper gate.",
    "Trapdoor: h = (1/2) g t^2 has gradient g/2; electromagnet release delay increases measured t.",
  ],
  probeSpecs: [
    {
      kind: "al-prac-rp3-freefall-g",
      mode: "two-gates",
      grad2hOverTvsT: 9.72,
      intercept2u: 2.36,
      pctUncGrad: 2.4,
    },
    {
      kind: "al-prac-rp3-freefall-g",
      mode: "trapdoor",
      dropHeightM: 1.2,
      gradHvsT2: 4.78,
      sysDelayMs: 14,
    },
  ],
  validate(spec) {
    const issues: string[] = [];
    if (spec.mode === "two-gates") {
      if (
        !isPosNum(spec.grad2hOverTvsT) ||
        spec.grad2hOverTvsT < 8 ||
        spec.grad2hOverTvsT > 11
      ) {
        issues.push("grad2hOverTvsT must be in [8, 11]");
      }
      if (!isPosNum(spec.intercept2u) || spec.intercept2u > 8) {
        issues.push("intercept2u must be in (0, 8]");
      }
      if (!isPosNum(spec.pctUncGrad) || spec.pctUncGrad > 15) {
        issues.push("pctUncGrad must be in (0, 15]");
      }
    } else if (spec.mode === "trapdoor") {
      if (
        !isPosNum(spec.dropHeightM) ||
        spec.dropHeightM < 0.3 ||
        spec.dropHeightM > 2.5
      ) {
        issues.push("dropHeightM must be in [0.3, 2.5]");
      }
      if (
        !isPosNum(spec.gradHvsT2) ||
        spec.gradHvsT2 < 4.0 ||
        spec.gradHvsT2 > 5.5
      ) {
        issues.push("gradHvsT2 must be in [4.0, 5.5]");
      }
      if (!isPosNum(spec.sysDelayMs) || spec.sysDelayMs > 60) {
        issues.push("sysDelayMs must be in (0, 60]");
      }
    } else {
      issues.push('mode must be "two-gates" or "trapdoor"');
    }
    return makeValidationResult(issues);
  },
  solve(spec): DomainSolveOutput {
    if (spec.mode === "two-gates") {
      const gMeasured = Number(spec.grad2hOverTvsT);
      const intercept2u = Number(spec.intercept2u);
      const pctUncGrad = Number(spec.pctUncGrad);
      const initialSpeedU = intercept2u / 2;
      const pctDiffG =
        (Math.abs(gMeasured - ALEVEL_GRAVITY_MS2) / ALEVEL_GRAVITY_MS2) * 100;
      const absUncG = (pctUncGrad / 100) * gMeasured;
      return {
        solverId: "sixthphysics/al-prac-rp3-freefall/1.0.0",
        quantities: {
          gMeasured,
          initialSpeedU,
          pctDiffG,
          absUncG,
          rp3Anchor:
            "use a plumb line to align the metre ruler vertically and plot two h over t against t so the gradient equals gravitational field strength independently of initial speed",
        },
        publicNumbers: [gMeasured, intercept2u, pctUncGrad],
      };
    }

    const h = Number(spec.dropHeightM);
    const gradHvsT2 = Number(spec.gradHvsT2);
    const sysDelayMs = Number(spec.sysDelayMs);
    const gMeasured = 2 * gradHvsT2;
    const idealTimeS = Math.sqrt((2 * h) / ALEVEL_GRAVITY_MS2);
    const measuredTimeS = idealTimeS + sysDelayMs * 1e-3;
    const gSingleDrop = (2 * h) / (measuredTimeS * measuredTimeS);
    const pctDiffG =
      (Math.abs(gMeasured - ALEVEL_GRAVITY_MS2) / ALEVEL_GRAVITY_MS2) * 100;

    return {
      solverId: "sixthphysics/al-prac-rp3-freefall/1.0.0",
      quantities: {
        gMeasured,
        idealTimeS,
        measuredTimeS,
        gSingleDrop,
        pctDiffG,
        sysDelayMs,
        rp3Anchor:
          "residual magnetism in the electromagnet delays sphere release making the recorded fall time too large and producing a systematic underestimate of g",
      },
      publicNumbers: [h, gradHvsT2, sysDelayMs],
    };
  },
  renderSvg(spec, options): DomainRenderOutput {
    const mode = String(spec.mode);
    const arrId = makeId("rp3-arr", options);
    const defs = arrowMarkerDef(arrId, INK);
    const parts: string[] = [];

    parts.push(
      svgText(
        320,
        28,
        mode === "two-gates"
          ? "RP3: Determination of g Using Two Light Gates"
          : "RP3: Determination of g Using Electromagnet and Trapdoor",
        { size: 13.5, weight: 700, anchor: "middle" },
      ),
      // Left apparatus panel
      `<rect x="28" y="46" width="290" height="292" rx="8" fill="${PANEL_BG}" stroke="${BORDER}" stroke-width="1.2"/>`,
      // Retort stand
      `<rect x="52" y="314" width="110" height="10" fill="#64748b" stroke="${INK}" stroke-width="1.2"/>`,
      `<line x1="72" y1="74" x2="72" y2="314" stroke="${INK}" stroke-width="4"/>`,
      // Top arm & electromagnet / drop release
      `<line x1="72" y1="86" x2="148" y2="86" stroke="${INK}" stroke-width="3"/>`,
      `<rect x="134" y="76" width="32" height="22" rx="3" fill="#334155" stroke="${INK}" stroke-width="1.4"/>`,
      svgText(150, 68, mode === "two-gates" ? "Release clamp" : "Electromagnet", {
        size: 9.5,
        weight: 600,
        anchor: "middle",
      }),
      // Falling steel ball
      `<circle cx="150" cy="112" r="9" fill="#94a3b8" stroke="${INK}" stroke-width="1.5"/>`,
      // Metre ruler + plumb line
      `<rect x="218" y="84" width="14" height="224" fill="#fef3c7" stroke="${INK}" stroke-width="1.2"/>`,
      svgText(252, 196, "Metre ruler", {
        size: 9.5,
        fill: SLATE,
        anchor: "middle",
        rotate: "rotate(-90 252 196)",
      }),
      `<line x1="274" y1="84" x2="274" y2="294" stroke="${TEAL}" stroke-width="1.2" stroke-dasharray="3,2"/>`,
      `<polygon points="269,294 279,294 274,308" fill="${TEAL}"/>`,
      svgText(298, 298, "Plumb", { size: 9, fill: TEAL, anchor: "middle" }),
      svgText(298, 309, "line", { size: 9, fill: TEAL, anchor: "middle" }),
    );

    if (mode === "two-gates") {
      parts.push(
        `<rect x="122" y="144" width="56" height="14" rx="2" fill="${BLUE}" stroke="${INK}" stroke-width="1.2"/>`,
        svgText(98, 154, "Gate 1", { size: 9.5, weight: 600, fill: BLUE, anchor: "end" }),
        `<rect x="122" y="266" width="56" height="14" rx="2" fill="${BLUE}" stroke="${INK}" stroke-width="1.2"/>`,
        svgText(98, 276, "Gate 2", { size: 9.5, weight: 600, fill: BLUE, anchor: "end" }),
        `<line x1="194" y1="151" x2="194" y2="273" stroke="${INK}" stroke-width="1.3" marker-start="url(#${arrId})" marker-end="url(#${arrId})"/>`,
        svgText(206, 214, "h", { size: 12, weight: 700, italic: true }),
      );
    } else {
      parts.push(
        `<line x1="126" y1="296" x2="178" y2="296" stroke="${RED}" stroke-width="4"/>`,
        `<circle cx="126" cy="296" r="3" fill="${INK}"/>`,
        svgText(150, 312, "Trapdoor switch", {
          size: 9.5,
          weight: 600,
          fill: RED,
          anchor: "middle",
        }),
        `<line x1="194" y1="121" x2="194" y2="294" stroke="${INK}" stroke-width="1.3" marker-start="url(#${arrId})" marker-end="url(#${arrId})"/>`,
        svgText(206, 210, "h", { size: 12, weight: 700, italic: true }),
      );
    }

    // Right linearized graph inset
    const gx = 378;
    const gy = 76;
    const gw = 224;
    const gh = 204;
    parts.push(
      `<rect x="334" y="46" width="282" height="292" rx="8" fill="#ffffff" stroke="${BORDER}" stroke-width="1.2"/>`,
      svgText(475, 66, mode === "two-gates" ? "Linearized Plot: 2h/t vs t" : "Linearized Plot: h vs t²", {
        size: 11.5,
        weight: 700,
        anchor: "middle",
      }),
      `<line x1="${gx}" y1="${gy}" x2="${gx}" y2="${gy + gh}" stroke="${INK}" stroke-width="1.6"/>`,
      `<line x1="${gx}" y1="${gy + gh}" x2="${gx + gw}" y2="${gy + gh}" stroke="${INK}" stroke-width="1.6"/>`,
    );

    if (mode === "two-gates") {
      parts.push(
        `<line x1="${gx}" y1="${gy + gh - 38}" x2="${gx + gw - 16}" y2="${gy + 22}" stroke="${BLUE}" stroke-width="2.2"/>`,
        svgText(gx + 10, gy + gh - 44, "2u", {
          size: 10.5,
          weight: 700,
          fill: RED,
        }),
        svgText(gx + gw / 2, gy + gh + 28, "t / s", {
          size: 11,
          weight: 600,
          anchor: "middle",
        }),
        svgText(gx - 26, gy + gh / 2, "2h/t / m s⁻¹", {
          size: 10.5,
          weight: 600,
          anchor: "middle",
          rotate: `rotate(-90 ${gx - 26} ${f2(gy + gh / 2)})`,
        }),
        svgText(gx + 128, gy + 108, "gradient = g", {
          size: 10.5,
          weight: 600,
          fill: BLUE,
        }),
      );
    } else {
      parts.push(
        `<line x1="${gx}" y1="${gy + gh}" x2="${gx + gw - 16}" y2="${gy + 20}" stroke="${BLUE}" stroke-width="2.2"/>`,
        `<line x1="${gx + 16}" y1="${gy + gh}" x2="${gx + gw - 8}" y2="${gy + 34}" stroke="${RED}" stroke-width="1.6" stroke-dasharray="5,3"/>`,
        svgText(gx + gw / 2, gy + gh + 28, "t² / s²", {
          size: 11,
          weight: 600,
          anchor: "middle",
        }),
        svgText(gx - 26, gy + gh / 2, "h / m", {
          size: 11,
          weight: 600,
          anchor: "middle",
          rotate: `rotate(-90 ${gx - 26} ${f2(gy + gh / 2)})`,
        }),
        svgText(gx + 110, gy + 82, "Ideal (grad = ½g)", {
          size: 10,
          weight: 600,
          fill: BLUE,
        }),
        svgText(gx + 114, gy + 150, "With release delay", {
          size: 10,
          fill: RED,
        }),
      );
    }

    return {
      visualFamily: "al-prac-rp3-freefall-g",
      svgMarkup: wrapSvg(
        "Required Practical 3 free-fall apparatus and linearized graph",
        defs,
        parts.join(""),
      ),
      rendererVersion: ALEVEL_PRACTICALS_RENDERER_VERSION,
      publicNumbers: [],
      publicLabels: [],
    };
  },
};

/* -------------------------------------------------------------------------- */
/*  7. al-prac-rp4-young-modulus (RP4, 3.4.2, Y12, mechanics)                 */
/* -------------------------------------------------------------------------- */

const RP4_YOUNG_MODULUS_PLUGIN: DomainKindPlugin = {
  domain: "mechanics",
  kind: "al-prac-rp4-young-modulus",
  summary:
    "AQA Required Practical 4: Searle's dual-wire determination of the Young modulus with reference wire, Vernier scale, orthogonal micrometer diameters, and F vs e plot.",
  requiredFields: [
    { name: "wireLengthM", type: "number", unit: "m", bounds: "1.2..3.5" },
    { name: "d1Mm", type: "number", unit: "mm", bounds: "0.2..1.5" },
    { name: "d2Mm", type: "number", unit: "mm", bounds: "0.2..1.5" },
    { name: "d3Mm", type: "number", unit: "mm", bounds: "0.2..1.5" },
    {
      name: "gradFvsE_NPerMm",
      type: "number",
      unit: "N mm^-1",
      bounds: "4..80",
    },
    { name: "uncLengthMm", type: "number", unit: "mm", bounds: "0.5..5" },
    { name: "uncDiameterMm", type: "number", unit: "mm", bounds: "0.005..0.03" },
    { name: "pctUncGrad", type: "number", unit: "%", bounds: "0.5..6" },
  ],
  physicalConstraints: [
    "Cross-sectional area A = pi d_mean^2 / 4.",
    "Young modulus E = (L / A) * (F / e).",
    "Percentage uncertainty %E = %L + 2 * %d + %grad.",
  ],
  probeSpecs: [
    {
      kind: "al-prac-rp4-young-modulus",
      wireLengthM: 2.4,
      d1Mm: 0.42,
      d2Mm: 0.44,
      d3Mm: 0.43,
      gradFvsE_NPerMm: 12.2,
      uncLengthMm: 2,
      uncDiameterMm: 0.01,
      pctUncGrad: 2.0,
    },
    {
      kind: "al-prac-rp4-young-modulus",
      wireLengthM: 1.85,
      d1Mm: 0.36,
      d2Mm: 0.35,
      d3Mm: 0.37,
      gradFvsE_NPerMm: 6.4,
      uncLengthMm: 1,
      uncDiameterMm: 0.01,
      pctUncGrad: 1.8,
    },
  ],
  validate(spec) {
    const issues: string[] = [];
    if (!isPosNum(spec.wireLengthM) || spec.wireLengthM > 5) {
      issues.push("wireLengthM must be in (0, 5]");
    }
    for (const k of ["d1Mm", "d2Mm", "d3Mm"]) {
      const v = spec[k];
      if (!isPosNum(v) || v < 0.1 || v > 3) {
        issues.push(`${k} must be in [0.1, 3]`);
      }
    }
    if (!isPosNum(spec.gradFvsE_NPerMm) || spec.gradFvsE_NPerMm > 200) {
      issues.push("gradFvsE_NPerMm must be in (0, 200]");
    }
    if (
      !isPosNum(spec.uncLengthMm) ||
      !isPosNum(spec.uncDiameterMm) ||
      !isPosNum(spec.pctUncGrad)
    ) {
      issues.push("Uncertainty inputs must be positive");
    }
    return makeValidationResult(issues);
  },
  solve(spec): DomainSolveOutput {
    const L = Number(spec.wireLengthM);
    const d1 = Number(spec.d1Mm);
    const d2 = Number(spec.d2Mm);
    const d3 = Number(spec.d3Mm);
    const gradNPerMm = Number(spec.gradFvsE_NPerMm);
    const uncLMm = Number(spec.uncLengthMm);
    const uncDMm = Number(spec.uncDiameterMm);
    const pctUncGrad = Number(spec.pctUncGrad);

    const dMeanMm = (d1 + d2 + d3) / 3;
    const dMeanM = dMeanMm * 1e-3;
    const crossSectionAreaM2 = (Math.PI * dMeanM * dMeanM) / 4;
    const gradNPerM = gradNPerMm * 1000;
    const youngModulusPa = (L * gradNPerM) / crossSectionAreaM2;
    const youngModulusGPa = youngModulusPa / 1e9;
    const pctUncLength = ((uncLMm * 1e-3) / L) * 100;
    const pctUncDiameter = (uncDMm / dMeanMm) * 100;
    const pctUncArea = 2 * pctUncDiameter;
    const pctUncE = pctUncLength + pctUncArea + pctUncGrad;

    return {
      solverId: "sixthphysics/al-prac-rp4-young-modulus/1.0.0",
      quantities: {
        dMeanMm,
        crossSectionAreaM2,
        gradFvsE_NPerM: gradNPerM,
        youngModulusPa,
        youngModulusGPa,
        pctUncLength,
        pctUncDiameter,
        pctUncArea,
        pctUncE,
        rp4PrecautionAnchor:
          "an identical reference wire compensates both ceiling sag and thermal expansion while orthogonal micrometer diameter measurements reduce cross sectional area uncertainty",
      },
      publicNumbers: [L, d1, d2, d3, gradNPerMm, uncLMm, uncDMm, pctUncGrad],
    };
  },
  renderSvg(spec, options): DomainRenderOutput {
    const L = Number(spec.wireLengthM);
    const hidden = extractHiddenSet(spec, options);
    const parts: string[] = [];
    const publicNumbers: number[] = [];
    const publicLabels: string[] = [];

    parts.push(
      svgText(320, 28, "RP4: Searle's Dual-Wire Young Modulus Apparatus", {
        size: 13.5,
        weight: 700,
        anchor: "middle",
      }),
      // Left apparatus panel
      `<rect x="28" y="44" width="300" height="296" rx="8" fill="${PANEL_BG}" stroke="${BORDER}" stroke-width="1.2"/>`,
      // Ceiling beam
      `<rect x="64" y="60" width="212" height="14" fill="#64748b" stroke="${INK}" stroke-width="1.5"/>`,
      svgText(170, 55, "Rigid ceiling support", {
        size: 10,
        fill: SLATE,
        anchor: "middle",
      }),
      // Reference wire (left) and test wire (right)
      `<line x1="126" y1="74" x2="126" y2="246" stroke="${TEAL}" stroke-width="2"/>`,
      `<line x1="210" y1="74" x2="210" y2="262" stroke="${BLUE}" stroke-width="2"/>`,
      svgText(86, 146, "Reference", { size: 10, weight: 600, fill: TEAL, anchor: "middle" }),
      svgText(86, 159, "wire", { size: 10, weight: 600, fill: TEAL, anchor: "middle" }),
      svgText(254, 146, "Test wire", { size: 10, weight: 600, fill: BLUE, anchor: "middle" }),
      // Vernier bridge scale
      `<rect x="116" y="186" width="104" height="30" rx="3" fill="#ffffff" stroke="${INK}" stroke-width="1.4"/>`,
      `<line x1="168" y1="186" x2="168" y2="216" stroke="${RED}" stroke-width="1.4"/>`,
      svgText(168, 205, "Main | Vernier", { size: 9.5, weight: 600, anchor: "middle" }),
      // Constant tension weight on reference wire
      `<rect x="110" y="246" width="32" height="24" rx="2" fill="#cbd5e1" stroke="${INK}" stroke-width="1.2"/>`,
      svgText(126, 284, "Control", { size: 9, fill: SLATE, anchor: "middle" }),
      svgText(126, 294, "mass", { size: 9, fill: SLATE, anchor: "middle" }),
      // Slotted masses on test wire
      `<rect x="192" y="262" width="36" height="32" rx="2" fill="#93c5fd" stroke="${INK}" stroke-width="1.4"/>`,
      `<line x1="192" y1="273" x2="228" y2="273" stroke="${INK}" stroke-width="0.9"/>`,
      `<line x1="192" y1="284" x2="228" y2="284" stroke="${INK}" stroke-width="0.9"/>`,
      svgText(268, 280, "Slotted masses", { size: 9.5, fill: BLUE, anchor: "middle" }),
      // Sand tray
      `<rect x="172" y="314" width="76" height="16" rx="2" fill="#fde68a" stroke="${INK}" stroke-width="1.2"/>`,
      svgText(210, 326, "Sand tray", { size: 9.5, weight: 600, anchor: "middle" }),
    );

    if (!hidden.has("wireLengthM")) {
      const lLbl = `L = ${fmtTick(L, 2)} m`;
      parts.push(
        svgText(254, 164, lLbl, { size: 10, fill: SLATE, anchor: "middle" }),
      );
      publicNumbers.push(L);
      publicLabels.push(lLbl);
    }

    // Right F vs e plot panel
    const gx = 384;
    const gy = 78;
    const gw = 218;
    const gh = 198;
    parts.push(
      `<rect x="342" y="44" width="272" height="296" rx="8" fill="#ffffff" stroke="${BORDER}" stroke-width="1.2"/>`,
      svgText(478, 66, "Elastic Region: Force vs Extension", {
        size: 11.5,
        weight: 700,
        anchor: "middle",
      }),
      `<line x1="${gx}" y1="${gy}" x2="${gx}" y2="${gy + gh}" stroke="${INK}" stroke-width="1.6"/>`,
      `<line x1="${gx}" y1="${gy + gh}" x2="${gx + gw}" y2="${gy + gh}" stroke="${INK}" stroke-width="1.6"/>`,
      `<line x1="${gx}" y1="${gy + gh}" x2="${gx + gw - 18}" y2="${gy + 22}" stroke="${BLUE}" stroke-width="2.2"/>`,
      `<polyline points="${gx + 40},${gy + gh - 34} ${gx + gw - 40},${gy + gh - 34} ${gx + gw - 40},${gy + 42}" fill="none" stroke="${TEAL}" stroke-width="1.3" stroke-dasharray="4,3"/>`,
      svgText(gx + gw / 2, gy + gh + 28, "Extension e / mm", {
        size: 11,
        weight: 600,
        anchor: "middle",
      }),
      svgText(gx - 26, gy + gh / 2, "Load F / N", {
        size: 11,
        weight: 600,
        anchor: "middle",
        rotate: `rotate(-90 ${gx - 26} ${f2(gy + gh / 2)})`,
      }),
      svgText(gx + 104, gy + 114, "grad = EA / L", {
        size: 10.5,
        weight: 600,
        fill: BLUE,
      }),
      svgText(478, 326, "Unload check verifies elastic limit", {
        size: 9.5,
        fill: SLATE,
        anchor: "middle",
      }),
    );

    return {
      visualFamily: "al-prac-rp4-young-modulus",
      svgMarkup: wrapSvg(
        "Required Practical 4 Searle dual-wire apparatus and force-extension graph",
        "",
        parts.join(""),
      ),
      rendererVersion: ALEVEL_PRACTICALS_RENDERER_VERSION,
      publicNumbers,
      publicLabels,
    };
  },
};

/* -------------------------------------------------------------------------- */
/*  8. al-prac-rp5-rp6-resistivity-emf (RP5 & RP6, 3.5.1, Y12, circuits)      */
/* -------------------------------------------------------------------------- */

const RP5_RP6_RESISTIVITY_EMF_PLUGIN: DomainKindPlugin = {
  domain: "circuits",
  kind: "al-prac-rp5-rp6-resistivity-emf",
  summary:
    "AQA Required Practical 5 (resistivity of constantan wire via R = (rho/A)L + R_c) and Required Practical 6 (cell emf and internal resistance via V = emf - I r).",
  requiredFields: [
    {
      name: "mode",
      type: "string",
      enumValues: ["rp5-resistivity", "rp6-emf"],
    },
  ],
  optionalFields: [
    { name: "wireDiameterMm", type: "number", unit: "mm", bounds: "0.15..1.2" },
    { name: "gradRvsL_OhmPerM", type: "number", unit: "ohm m^-1", bounds: "0.5..30" },
    { name: "contactResistanceOhm", type: "number", unit: "ohm", bounds: "0.05..2.0" },
    { name: "pctUncGrad", type: "number", unit: "%", bounds: "0.5..6" },
    { name: "uncDiameterMm", type: "number", unit: "mm", bounds: "0.005..0.03" },
    { name: "emfV", type: "number", unit: "V", bounds: "1.2..12.0" },
    { name: "internalResistanceOhm", type: "number", unit: "ohm", bounds: "0.2..6.0" },
    { name: "protectiveResistanceOhm", type: "number", unit: "ohm", bounds: "1.0..15.0" },
    { name: "i1A", type: "number", unit: "A", bounds: "0.05..1.5" },
    { name: "i2A", type: "number", unit: "A", bounds: "0.1..2.5" },
  ],
  physicalConstraints: [
    "RP5: R = (rho / A) L + R_contact; non-zero intercept equals lead and crocodile-clip contact resistance.",
    "RP6: V = emf - I r; negative gradient equals -r and protective resistor limits maximum current.",
  ],
  probeSpecs: [
    {
      kind: "al-prac-rp5-rp6-resistivity-emf",
      mode: "rp5-resistivity",
      wireDiameterMm: 0.32,
      gradRvsL_OhmPerM: 6.1,
      contactResistanceOhm: 0.24,
      pctUncGrad: 2.2,
      uncDiameterMm: 0.01,
    },
    {
      kind: "al-prac-rp5-rp6-resistivity-emf",
      mode: "rp6-emf",
      emfV: 1.56,
      internalResistanceOhm: 0.85,
      protectiveResistanceOhm: 2.2,
      i1A: 0.12,
      i2A: 0.44,
    },
  ],
  validate(spec) {
    const issues: string[] = [];
    if (spec.mode === "rp5-resistivity") {
      if (!isPosNum(spec.wireDiameterMm) || spec.wireDiameterMm > 2) {
        issues.push("wireDiameterMm must be in (0, 2]");
      }
      if (!isPosNum(spec.gradRvsL_OhmPerM) || spec.gradRvsL_OhmPerM > 100) {
        issues.push("gradRvsL_OhmPerM must be in (0, 100]");
      }
      if (!isNonNegNum(spec.contactResistanceOhm)) {
        issues.push("contactResistanceOhm must be non-negative");
      }
      if (!isPosNum(spec.pctUncGrad) || !isPosNum(spec.uncDiameterMm)) {
        issues.push("pctUncGrad and uncDiameterMm must be positive");
      }
    } else if (spec.mode === "rp6-emf") {
      if (!isPosNum(spec.emfV) || spec.emfV > 24) {
        issues.push("emfV must be in (0, 24]");
      }
      if (!isPosNum(spec.internalResistanceOhm) || spec.internalResistanceOhm > 20) {
        issues.push("internalResistanceOhm must be in (0, 20]");
      }
      if (!isPosNum(spec.protectiveResistanceOhm)) {
        issues.push("protectiveResistanceOhm must be positive");
      }
      if (!isPosNum(spec.i1A) || !isPosNum(spec.i2A) || !(spec.i2A > spec.i1A)) {
        issues.push("Must satisfy 0 < i1A < i2A");
      }
      if (
        isPosNum(spec.emfV) &&
        isPosNum(spec.internalResistanceOhm) &&
        isPosNum(spec.i2A) &&
        spec.emfV - spec.i2A * spec.internalResistanceOhm <= 0.05
      ) {
        issues.push("Terminal voltage at i2A must stay strictly positive");
      }
    } else {
      issues.push('mode must be "rp5-resistivity" or "rp6-emf"');
    }
    return makeValidationResult(issues);
  },
  solve(spec): DomainSolveOutput {
    if (spec.mode === "rp5-resistivity") {
      const dMm = Number(spec.wireDiameterMm);
      const grad = Number(spec.gradRvsL_OhmPerM);
      const rc = Number(spec.contactResistanceOhm);
      const pctGrad = Number(spec.pctUncGrad);
      const uncDMm = Number(spec.uncDiameterMm);

      const areaM2 = (Math.PI * (dMm * 1e-3) ** 2) / 4;
      const resistivityRho = grad * areaM2;
      const pctUncD = (uncDMm / dMm) * 100;
      const pctUncRho = pctGrad + 2 * pctUncD;

      return {
        solverId: "sixthphysics/al-prac-rp5-rp6/1.0.0",
        quantities: {
          areaM2,
          resistivityRho,
          contactResistanceRc: rc,
          pctUncD,
          pctUncRho,
          elecPrecautionAnchor:
            "keep the current low and open the switch between readings to prevent wire heating while the non zero intercept represents contact and lead resistance",
        },
        publicNumbers: [dMm, grad, rc, pctGrad, uncDMm],
      };
    }

    const emfV = Number(spec.emfV);
    const r = Number(spec.internalResistanceOhm);
    const rProt = Number(spec.protectiveResistanceOhm);
    const i1 = Number(spec.i1A);
    const i2 = Number(spec.i2A);

    const v1V = emfV - i1 * r;
    const v2V = emfV - i2 * r;
    const shortCircuitCurrentA = emfV / r;
    const maxSafeCurrentA = emfV / (r + rProt);

    return {
      solverId: "sixthphysics/al-prac-rp5-rp6/1.0.0",
      quantities: {
        emfV,
        internalResistanceR: r,
        gradVvsI: -r,
        v1V,
        v2V,
        shortCircuitCurrentA,
        maxSafeCurrentA,
        elecPrecautionAnchor:
          "include a protective series resistor and open the switch between readings to avoid heating the cell so internal resistance stays constant",
      },
      publicNumbers: [i1, i2, v1V, v2V, rProt],
    };
  },
  renderSvg(spec, options): DomainRenderOutput {
    const mode = String(spec.mode);
    const hidden = extractHiddenSet(spec, options);
    const parts: string[] = [];
    const publicNumbers: number[] = [];
    const publicLabels: string[] = [];

    if (mode === "rp5-resistivity") {
      parts.push(
        svgText(320, 28, "RP5: Resistivity of a Wire Using a Metre Ruler and Flying Lead", {
          size: 13,
          weight: 700,
          anchor: "middle",
        }),
        // Circuit box
        `<rect x="26" y="46" width="302" height="292" rx="8" fill="${PANEL_BG}" stroke="${BORDER}" stroke-width="1.2"/>`,
        // Top wire + power supply + switch + ammeter
        `<line x1="60" y1="98" x2="118" y2="98" stroke="${INK}" stroke-width="1.8"/>`,
        // Cell symbol
        `<line x1="118" y1="82" x2="118" y2="114" stroke="${INK}" stroke-width="2"/>`,
        `<line x1="126" y1="90" x2="126" y2="106" stroke="${INK}" stroke-width="3.5"/>`,
        svgText(122, 74, "Low-V DC", { size: 9.5, fill: SLATE, anchor: "middle" }),
        `<line x1="126" y1="98" x2="178" y2="98" stroke="${INK}" stroke-width="1.8"/>`,
        // Open switch
        `<circle cx="178" cy="98" r="2.8" fill="${INK}"/>`,
        `<line x1="178" y1="98" x2="202" y2="85" stroke="${RED}" stroke-width="1.8"/>`,
        `<circle cx="206" cy="98" r="2.8" fill="${INK}"/>`,
        svgText(192, 76, "Switch", { size: 9.5, fill: RED, anchor: "middle" }),
        `<line x1="206" y1="98" x2="250" y2="98" stroke="${INK}" stroke-width="1.8"/>`,
        // Ammeter
        `<circle cx="268" cy="98" r="16" fill="#ffffff" stroke="${BLUE}" stroke-width="1.8"/>`,
        svgText(268, 102, "A", { size: 12, weight: 700, fill: BLUE, anchor: "middle" }),
        `<line x1="284" y1="98" x2="298" y2="98" stroke="${INK}" stroke-width="1.8"/>`,
        `<line x1="298" y1="98" x2="298" y2="210" stroke="${INK}" stroke-width="1.8"/>`,
        `<line x1="60" y1="98" x2="60" y2="232" stroke="${INK}" stroke-width="1.8"/>`,
        // Constantan wire on metre ruler
        `<rect x="60" y="236" width="238" height="16" fill="#fef3c7" stroke="${INK}" stroke-width="1.2"/>`,
        svgText(179, 248, "Metre ruler", { size: 9.5, fill: SLATE, anchor: "middle" }),
        `<line x1="60" y1="232" x2="298" y2="232" stroke="${RED}" stroke-width="2.6"/>`,
        svgText(179, 268, "Constantan wire (length L)", {
          size: 10.5,
          weight: 600,
          fill: RED,
          anchor: "middle",
        }),
        // Flying lead jockey at x=228
        `<line x1="298" y1="210" x2="228" y2="210" stroke="${INK}" stroke-width="1.8"/>`,
        `<polygon points="224,210 232,210 228,231" fill="${INK}"/>`,
        svgText(264, 202, "Flying lead", { size: 9.5, fill: SLATE, anchor: "middle" }),
        // Parallel voltmeter across length L (60 to 228)
        `<line x1="60" y1="232" x2="60" y2="300" stroke="${TEAL}" stroke-width="1.6"/>`,
        `<line x1="228" y1="232" x2="228" y2="300" stroke="${TEAL}" stroke-width="1.6"/>`,
        `<line x1="60" y1="300" x2="128" y2="300" stroke="${TEAL}" stroke-width="1.6"/>`,
        `<line x1="160" y1="300" x2="228" y2="300" stroke="${TEAL}" stroke-width="1.6"/>`,
        `<circle cx="144" cy="300" r="16" fill="#ffffff" stroke="${TEAL}" stroke-width="1.8"/>`,
        svgText(144, 304, "V", { size: 12, weight: 700, fill: TEAL, anchor: "middle" }),
      );

      // Right R vs L plot
      const gx = 382;
      const gy = 78;
      const gw = 220;
      const gh = 198;
      parts.push(
        `<rect x="340" y="46" width="274" height="292" rx="8" fill="#ffffff" stroke="${BORDER}" stroke-width="1.2"/>`,
        svgText(477, 66, "Resistance vs Length Plot", {
          size: 11.5,
          weight: 700,
          anchor: "middle",
        }),
        `<line x1="${gx}" y1="${gy}" x2="${gx}" y2="${gy + gh}" stroke="${INK}" stroke-width="1.6"/>`,
        `<line x1="${gx}" y1="${gy + gh}" x2="${gx + gw}" y2="${gy + gh}" stroke="${INK}" stroke-width="1.6"/>`,
        `<line x1="${gx}" y1="${gy + gh - 30}" x2="${gx + gw - 16}" y2="${gy + 22}" stroke="${BLUE}" stroke-width="2.2"/>`,
        `<circle cx="${gx}" cy="${gy + gh - 30}" r="4" fill="${RED}"/>`,
        svgRawText(
          gx + 10,
          gy + gh - 26,
          'R<tspan dy="3" font-size="8.5">c</tspan><tspan dy="-3"> (contact)</tspan>',
          { size: 10, weight: 600, fill: RED },
        ),
        svgText(gx + 114, gy + 110, "grad = ρ / A", {
          size: 10.5,
          weight: 600,
          fill: BLUE,
        }),
        svgText(gx + gw / 2, gy + gh + 28, "Length L / m", {
          size: 11,
          weight: 600,
          anchor: "middle",
        }),
        svgText(gx - 26, gy + gh / 2, "R / Ω", {
          size: 11,
          weight: 600,
          anchor: "middle",
          rotate: `rotate(-90 ${gx - 26} ${f2(gy + gh / 2)})`,
        }),
      );
    } else {
      // RP6: emf and internal resistance
      const rProt = Number(spec.protectiveResistanceOhm);
      parts.push(
        svgText(320, 28, "RP6: Cell EMF and Internal Resistance Investigation", {
          size: 13.5,
          weight: 700,
          anchor: "middle",
        }),
        `<rect x="26" y="46" width="302" height="292" rx="8" fill="${PANEL_BG}" stroke="${BORDER}" stroke-width="1.2"/>`,
        // Dashed cell box (emf + r)
        `<rect x="78" y="74" width="152" height="58" rx="4" fill="#ffffff" stroke="${SLATE}" stroke-width="1.2" stroke-dasharray="5,3"/>`,
        `<line x1="54" y1="103" x2="112" y2="103" stroke="${INK}" stroke-width="1.8"/>`,
        `<line x1="112" y1="86" x2="112" y2="120" stroke="${INK}" stroke-width="2"/>`,
        `<line x1="120" y1="94" x2="120" y2="112" stroke="${INK}" stroke-width="3.5"/>`,
        `<line x1="120" y1="103" x2="152" y2="103" stroke="${INK}" stroke-width="1.8"/>`,
        `<rect x="152" y="93" width="52" height="20" fill="#fee2e2" stroke="${RED}" stroke-width="1.5"/>`,
        svgText(178, 107, "r", { size: 11, weight: 700, fill: RED, anchor: "middle", italic: true }),
        svgText(116, 82, "ε", { size: 11, weight: 700, anchor: "middle", italic: true }),
        `<line x1="204" y1="103" x2="294" y2="103" stroke="${INK}" stroke-width="1.8"/>`,
        // Voltmeter across cell terminals
        `<line x1="64" y1="103" x2="64" y2="176" stroke="${TEAL}" stroke-width="1.6"/>`,
        `<line x1="242" y1="103" x2="242" y2="176" stroke="${TEAL}" stroke-width="1.6"/>`,
        `<line x1="64" y1="176" x2="137" y2="176" stroke="${TEAL}" stroke-width="1.6"/>`,
        `<line x1="169" y1="176" x2="242" y2="176" stroke="${TEAL}" stroke-width="1.6"/>`,
        `<circle cx="153" cy="176" r="16" fill="#ffffff" stroke="${TEAL}" stroke-width="1.8"/>`,
        svgText(153, 180, "V", { size: 12, weight: 700, fill: TEAL, anchor: "middle" }),
        // Outer loop: ammeter, protective resistor, variable resistor, switch
        `<line x1="54" y1="103" x2="54" y2="278" stroke="${INK}" stroke-width="1.8"/>`,
        `<line x1="294" y1="103" x2="294" y2="278" stroke="${INK}" stroke-width="1.8"/>`,
        `<circle cx="294" cy="190" r="16" fill="#ffffff" stroke="${BLUE}" stroke-width="1.8"/>`,
        svgText(294, 194, "A", { size: 12, weight: 700, fill: BLUE, anchor: "middle" }),
        `<line x1="54" y1="278" x2="88" y2="278" stroke="${INK}" stroke-width="1.8"/>`,
        `<rect x="88" y="268" width="54" height="20" fill="#ffffff" stroke="${INK}" stroke-width="1.5"/>`,
        `<line x1="142" y1="278" x2="174" y2="278" stroke="${INK}" stroke-width="1.8"/>`,
        `<rect x="174" y="268" width="60" height="20" fill="#eff6ff" stroke="${BLUE}" stroke-width="1.5"/>`,
        `<line x1="184" y1="296" x2="224" y2="260" stroke="${BLUE}" stroke-width="1.5"/>`,
        `<line x1="234" y1="278" x2="294" y2="278" stroke="${INK}" stroke-width="1.8"/>`,
        svgText(204, 306, "Rheostat", { size: 9.5, fill: BLUE, anchor: "middle" }),
      );
      const rpLbl = hidden.has("protectiveResistanceOhm")
        ? "Protective R"
        : `${fmtTick(rProt, 1)} Ω`;
      if (!hidden.has("protectiveResistanceOhm")) {
        publicNumbers.push(rProt);
        publicLabels.push(rpLbl);
      }
      parts.push(
        svgText(115, 282, rpLbl, { size: 9.5, weight: 600, anchor: "middle" }),
        svgText(115, 306, "Protective R", { size: 9.5, fill: SLATE, anchor: "middle" }),
      );

      // Right V vs I negative-slope plot
      const gx = 382;
      const gy = 78;
      const gw = 220;
      const gh = 198;
      parts.push(
        `<rect x="340" y="46" width="274" height="292" rx="8" fill="#ffffff" stroke="${BORDER}" stroke-width="1.2"/>`,
        svgText(477, 66, "Terminal p.d. V vs Current I", {
          size: 11.5,
          weight: 700,
          anchor: "middle",
        }),
        `<line x1="${gx}" y1="${gy}" x2="${gx}" y2="${gy + gh}" stroke="${INK}" stroke-width="1.6"/>`,
        `<line x1="${gx}" y1="${gy + gh}" x2="${gx + gw}" y2="${gy + gh}" stroke="${INK}" stroke-width="1.6"/>`,
        `<line x1="${gx}" y1="${gy + 26}" x2="${gx + gw - 20}" y2="${gy + gh - 28}" stroke="${BLUE}" stroke-width="2.2"/>`,
        `<circle cx="${gx}" cy="${gy + 26}" r="4" fill="${RED}"/>`,
        svgText(gx + 10, gy + 24, "y-intercept = ε", {
          size: 10.5,
          weight: 600,
          fill: RED,
        }),
        svgText(gx + 108, gy + 102, "gradient = −r", {
          size: 10.5,
          weight: 600,
          fill: BLUE,
        }),
        svgText(gx + gw / 2, gy + gh + 28, "Current I / A", {
          size: 11,
          weight: 600,
          anchor: "middle",
        }),
        svgText(gx - 26, gy + gh / 2, "Terminal V / V", {
          size: 11,
          weight: 600,
          anchor: "middle",
          rotate: `rotate(-90 ${gx - 26} ${f2(gy + gh / 2)})`,
        }),
      );
    }

    return {
      visualFamily: "al-prac-rp5-rp6-resistivity-emf",
      svgMarkup: wrapSvg(
        mode === "rp5-resistivity"
          ? "Required Practical 5 resistivity wire circuit and R against L plot"
          : "Required Practical 6 cell emf and internal resistance circuit and V against I plot",
        "",
        parts.join(""),
      ),
      rendererVersion: ALEVEL_PRACTICALS_RENDERER_VERSION,
      publicNumbers,
      publicLabels,
    };
  },
};

/* -------------------------------------------------------------------------- */
/*  9. al-prac-rp7-shm-pendulum-spring (RP7, 3.6.1, Y13, graphs)              */
/* -------------------------------------------------------------------------- */

const RP7_SHM_PENDULUM_SPRING_PLUGIN: DomainKindPlugin = {
  domain: "graphs",
  kind: "al-prac-rp7-shm-pendulum-spring",
  summary:
    "AQA Required Practical 7: Simple harmonic motion of a simple pendulum (T^2 vs L) or mass-spring oscillator (T^2 vs m) with fiducial marker, anomaly rejection, and end offset.",
  requiredFields: [
    { name: "mode", type: "string", enumValues: ["pendulum", "mass-spring"] },
    { name: "numOscillations", type: "number", bounds: "10..30" },
    { name: "t1S", type: "number", unit: "s", bounds: "4..80" },
    { name: "t2S", type: "number", unit: "s", bounds: "4..80" },
    { name: "t3S", type: "number", unit: "s", bounds: "4..80" },
    { name: "tAnomalyS", type: "number", unit: "s", bounds: "4..100" },
    { name: "timingUncS", type: "number", unit: "s", bounds: "0.05..0.5" },
    { name: "gradT2vsX", type: "number", bounds: "0.5..12" },
    { name: "endOffset", type: "number", bounds: "0..60" },
  ],
  physicalConstraints: [
    "Discard anomalous timing trial before computing mean T_N and period T = T_N / N.",
    "Pendulum: T^2 = (4 pi^2 / g) L -> g = 4 pi^2 / gradient; angle < 10-15 deg, L to centre of mass.",
    "Mass-spring: T^2 = (4 pi^2 / k)(m + m_eff) -> k = 4 pi^2 / gradient.",
  ],
  probeSpecs: [
    {
      kind: "al-prac-rp7-shm-pendulum-spring",
      mode: "pendulum",
      numOscillations: 20,
      t1S: 32.1,
      t2S: 31.8,
      t3S: 32.4,
      tAnomalyS: 36.9,
      timingUncS: 0.2,
      gradT2vsX: 4.04,
      endOffset: 12,
    },
    {
      kind: "al-prac-rp7-shm-pendulum-spring",
      mode: "mass-spring",
      numOscillations: 20,
      t1S: 17.8,
      t2S: 18.1,
      t3S: 17.9,
      tAnomalyS: 14.2,
      timingUncS: 0.2,
      gradT2vsX: 1.58,
      endOffset: 18,
    },
  ],
  validate(spec) {
    const issues: string[] = [];
    if (spec.mode !== "pendulum" && spec.mode !== "mass-spring") {
      issues.push('mode must be "pendulum" or "mass-spring"');
    }
    if (
      !Number.isInteger(spec.numOscillations) ||
      Number(spec.numOscillations) < 5 ||
      Number(spec.numOscillations) > 40
    ) {
      issues.push("numOscillations must be an integer in 5..40");
    }
    for (const k of ["t1S", "t2S", "t3S", "tAnomalyS"]) {
      if (!isPosNum(spec[k])) issues.push(`${k} must be positive`);
    }
    if (!isPosNum(spec.timingUncS) || spec.timingUncS > 1) {
      issues.push("timingUncS must be in (0, 1]");
    }
    if (!isPosNum(spec.gradT2vsX) || spec.gradT2vsX > 20) {
      issues.push("gradT2vsX must be in (0, 20]");
    }
    if (!isNonNegNum(spec.endOffset)) {
      issues.push("endOffset must be non-negative");
    }
    if (issues.length === 0) {
      const meanClean = (Number(spec.t1S) + Number(spec.t2S) + Number(spec.t3S)) / 3;
      if (Math.abs(Number(spec.tAnomalyS) - meanClean) / meanClean < 0.08) {
        issues.push("tAnomalyS must deviate by at least 8% from the consistent triad");
      }
    }
    return makeValidationResult(issues);
  },
  solve(spec): DomainSolveOutput {
    const N = Number(spec.numOscillations);
    const t1 = Number(spec.t1S);
    const t2 = Number(spec.t2S);
    const t3 = Number(spec.t3S);
    const tAnom = Number(spec.tAnomalyS);
    const timingUncS = Number(spec.timingUncS);
    const grad = Number(spec.gradT2vsX);
    const endOffset = Number(spec.endOffset);

    const meanTN = (t1 + t2 + t3) / 3;
    const naiveMeanWithAnomaly = (t1 + t2 + t3 + tAnom) / 4;
    const periodT = meanTN / N;
    const periodSquared = periodT * periodT;
    const gOrK = (4 * Math.PI * Math.PI) / grad;
    const pctUncT = (timingUncS / meanTN) * 100;

    return {
      solverId: "sixthphysics/al-prac-rp7-shm/1.0.0",
      quantities: {
        meanTN,
        naiveMeanWithAnomaly,
        periodT,
        periodSquared,
        gOrK,
        pctUncT,
        endOffset,
        fiducialAnchor:
          "place the fiducial marker at equilibrium where speed is maximum discard anomalous timings before averaging and time many oscillations to reduce reaction time uncertainty",
      },
      publicNumbers: [N, t1, t2, t3, tAnom, timingUncS, grad],
    };
  },
  renderSvg(spec, options): DomainRenderOutput {
    const mode = String(spec.mode);
    const arrId = makeId("rp7-arr", options);
    const defs = arrowMarkerDef(arrId, INK);
    const parts: string[] = [];

    parts.push(
      svgText(
        320,
        28,
        mode === "pendulum"
          ? "RP7: Simple Pendulum SHM Apparatus and T² vs L Graph"
          : "RP7: Vertical Mass-Spring Oscillator and T² vs m Graph",
        { size: 13.5, weight: 700, anchor: "middle" },
      ),
      `<rect x="28" y="46" width="286" height="292" rx="8" fill="${PANEL_BG}" stroke="${BORDER}" stroke-width="1.2"/>`,
    );

    if (mode === "pendulum") {
      parts.push(
        // Split cork clamp
        `<rect x="136" y="66" width="56" height="16" fill="#d97706" stroke="${INK}" stroke-width="1.4"/>`,
        `<line x1="164" y1="66" x2="164" y2="82" stroke="${INK}" stroke-width="1.4"/>`,
        svgText(164, 59, "Split-cork clamp", { size: 9.5, weight: 600, anchor: "middle" }),
        // Equilibrium dashed vertical
        `<line x1="164" y1="82" x2="164" y2="274" stroke="${SLATE}" stroke-width="1.2" stroke-dasharray="4,3"/>`,
        // Displaced string (< 15 deg) + bob
        `<line x1="164" y1="82" x2="212" y2="262" stroke="${BLUE}" stroke-width="2"/>`,
        `<circle cx="212" cy="262" r="14" fill="#93c5fd" stroke="${INK}" stroke-width="1.6"/>`,
        `<circle cx="212" cy="262" r="2.2" fill="${INK}"/>`,
        svgText(254, 266, "CoM of bob", { size: 9.5, fill: BLUE, anchor: "middle" }),
        // Small angle arc
        `<path d="M 164 134 A 52 52 0 0 0 177 132" fill="none" stroke="${TEAL}" stroke-width="1.5"/>`,
        svgText(190, 144, "θ < 15°", { size: 10, weight: 600, fill: TEAL }),
        // Length L arrow to CoM
        `<line x1="108" y1="82" x2="108" y2="262" stroke="${INK}" stroke-width="1.3" marker-start="url(#${arrId})" marker-end="url(#${arrId})"/>`,
        svgText(92, 176, "L", { size: 12, weight: 700, italic: true }),
        // Fiducial pin at equilibrium
        `<polygon points="164,282 158,302 170,302" fill="${RED}"/>`,
        svgText(164, 320, "Fiducial marker (equilibrium)", {
          size: 10,
          weight: 600,
          fill: RED,
          anchor: "middle",
        }),
      );
    } else {
      // Mass-spring
      const springPts: string[] = ["164,82", "164,98"];
      for (let i = 0; i < 8; i += 1) {
        const yMid = 104 + i * 14;
        springPts.push(`${i % 2 === 0 ? 148 : 180},${yMid}`);
      }
      springPts.push("164,220", "164,234");
      parts.push(
        `<rect x="120" y="66" width="88" height="16" fill="#64748b" stroke="${INK}" stroke-width="1.4"/>`,
        `<polyline points="${springPts.join(" ")}" fill="none" stroke="${BLUE}" stroke-width="2.2"/>`,
        `<rect x="142" y="234" width="44" height="36" rx="3" fill="#cbd5e1" stroke="${INK}" stroke-width="1.6"/>`,
        `<line x1="142" y1="246" x2="186" y2="246" stroke="${SLATE}" stroke-width="1"/>`,
        `<line x1="142" y1="258" x2="186" y2="258" stroke="${SLATE}" stroke-width="1"/>`,
        svgText(164, 286, "Slotted masses m", { size: 10, weight: 600, anchor: "middle" }),
        // Fiducial pointer at equilibrium
        `<line x1="192" y1="252" x2="232" y2="252" stroke="${RED}" stroke-width="2"/>`,
        `<polygon points="192,252 200,247 200,257" fill="${RED}"/>`,
        svgText(246, 240, "Fiducial pin", { size: 9.5, weight: 600, fill: RED, anchor: "middle" }),
        svgText(246, 253, "(equilibrium)", { size: 9.5, fill: RED, anchor: "middle" }),
        // Oscillation amplitude arrows
        `<line x1="112" y1="226" x2="112" y2="278" stroke="${TEAL}" stroke-width="1.5" marker-start="url(#${arrId})" marker-end="url(#${arrId})"/>`,
        svgText(84, 256, "Vertical", { size: 9.5, fill: TEAL, anchor: "middle" }),
        svgText(84, 267, "SHM", { size: 9.5, fill: TEAL, anchor: "middle" }),
      );
    }

    // Right T^2 vs L or T^2 vs m plot
    const gx = 382;
    const gy = 78;
    const gw = 220;
    const gh = 198;
    parts.push(
      `<rect x="334" y="46" width="280" height="292" rx="8" fill="#ffffff" stroke="${BORDER}" stroke-width="1.2"/>`,
      svgText(474, 66, mode === "pendulum" ? "T² vs Length L" : "T² vs Slotted Mass m", {
        size: 11.5,
        weight: 700,
        anchor: "middle",
      }),
      `<line x1="${gx}" y1="${gy}" x2="${gx}" y2="${gy + gh}" stroke="${INK}" stroke-width="1.6"/>`,
      `<line x1="${gx}" y1="${gy + gh}" x2="${gx + gw}" y2="${gy + gh}" stroke="${INK}" stroke-width="1.6"/>`,
      `<line x1="${gx}" y1="${gy + gh - 18}" x2="${gx + gw - 16}" y2="${gy + 22}" stroke="${BLUE}" stroke-width="2.2"/>`,
      svgText(gx + 96, gy + 106, mode === "pendulum" ? "grad = 4π² / g" : "grad = 4π² / k", {
        size: 10.5,
        weight: 600,
        fill: BLUE,
      }),
      svgText(gx + gw / 2, gy + gh + 28, mode === "pendulum" ? "Length L / m" : "Mass m / kg", {
        size: 11,
        weight: 600,
        anchor: "middle",
      }),
      svgText(gx - 26, gy + gh / 2, "T² / s²", {
        size: 11,
        weight: 600,
        anchor: "middle",
        rotate: `rotate(-90 ${gx - 26} ${f2(gy + gh / 2)})`,
      }),
      svgText(
        474,
        326,
        mode === "pendulum"
          ? "Small intercept reveals zero/CoM offset"
          : "Small intercept reveals effective spring mass",
        { size: 9.5, fill: SLATE, anchor: "middle" },
      ),
    );

    return {
      visualFamily: "al-prac-rp7-shm-pendulum-spring",
      svgMarkup: wrapSvg(
        "Required Practical 7 SHM oscillator apparatus and T-squared graph",
        defs,
        parts.join(""),
      ),
      rendererVersion: ALEVEL_PRACTICALS_RENDERER_VERSION,
      publicNumbers: [],
      publicLabels: [],
    };
  },
};

/* -------------------------------------------------------------------------- */
/*  10. al-prac-rp8-boyle-charles (RP8, 3.6.2, Y13, thermal)                  */
/* -------------------------------------------------------------------------- */

const RP8_BOYLE_CHARLES_PLUGIN: DomainKindPlugin = {
  domain: "thermal",
  kind: "al-prac-rp8-boyle-charles",
  summary:
    "AQA Required Practical 8: Boyle's law (isothermal p vs 1/V oil-column/syringe pressure gauge) and Charles's law (water-bath capillary tube with concentrated H2SO4 bead extrapolating to absolute zero).",
  requiredFields: [
    { name: "mode", type: "string", enumValues: ["boyle", "charles"] },
  ],
  optionalFields: [
    { name: "p1KPa", type: "number", unit: "kPa", bounds: "90..350" },
    { name: "v1Cm3", type: "number", unit: "cm^3", bounds: "8..60" },
    { name: "p2KPa", type: "number", unit: "kPa", bounds: "90..450" },
    { name: "deadVolCm3", type: "number", unit: "cm^3", bounds: "0..6" },
    { name: "theta1C", type: "number", unit: "deg C", bounds: "5..35" },
    { name: "length1Mm", type: "number", unit: "mm", bounds: "50..180" },
    { name: "theta2C", type: "number", unit: "deg C", bounds: "50..95" },
    { name: "length2Mm", type: "number", unit: "mm", bounds: "60..240" },
  ],
  physicalConstraints: [
    "Boyle: p (V + V_0) = constant at fixed temperature and mass of trapped dry air.",
    "Charles: L = m theta + L_0 extrapolates linearly to L = 0 near -273 deg C.",
  ],
  probeSpecs: [
    {
      kind: "al-prac-rp8-boyle-charles",
      mode: "boyle",
      p1KPa: 104,
      v1Cm3: 42.0,
      p2KPa: 182,
      deadVolCm3: 2.0,
    },
    {
      kind: "al-prac-rp8-boyle-charles",
      mode: "charles",
      theta1C: 18,
      length1Mm: 112,
      theta2C: 82,
      length2Mm: 136.8,
    },
  ],
  validate(spec) {
    const issues: string[] = [];
    if (spec.mode === "boyle") {
      if (!isPosNum(spec.p1KPa) || !isPosNum(spec.p2KPa)) {
        issues.push("p1KPa and p2KPa must be positive");
      }
      if (!isPosNum(spec.v1Cm3)) issues.push("v1Cm3 must be positive");
      if (!isNonNegNum(spec.deadVolCm3) || spec.deadVolCm3 > 10) {
        issues.push("deadVolCm3 must be in [0, 10]");
      }
      if (issues.length === 0) {
        const c = Number(spec.p1KPa) * (Number(spec.v1Cm3) + Number(spec.deadVolCm3));
        const v2 = c / Number(spec.p2KPa) - Number(spec.deadVolCm3);
        if (!(v2 > 1)) {
          issues.push("Computed v2Cm3 must exceed 1 cm^3");
        }
      }
    } else if (spec.mode === "charles") {
      if (!isFiniteNum(spec.theta1C) || !isFiniteNum(spec.theta2C) || !(spec.theta2C > spec.theta1C + 20)) {
        issues.push("theta2C must exceed theta1C by more than 20 deg C");
      }
      if (!isPosNum(spec.length1Mm) || !isPosNum(spec.length2Mm) || !(spec.length2Mm > spec.length1Mm)) {
        issues.push("length2Mm must exceed length1Mm");
      }
    } else {
      issues.push('mode must be "boyle" or "charles"');
    }
    return makeValidationResult(issues);
  },
  solve(spec): DomainSolveOutput {
    if (spec.mode === "boyle") {
      const p1 = Number(spec.p1KPa);
      const v1 = Number(spec.v1Cm3);
      const p2 = Number(spec.p2KPa);
      const v0 = Number(spec.deadVolCm3);
      const pVConstKPaCm3 = p1 * (v1 + v0);
      const pVConstJ = pVConstKPaCm3 * 1e-3;
      const v2Cm3 = pVConstKPaCm3 / p2 - v0;
      const invV1 = 1 / (v1 + v0);
      const invV2 = 1 / (v2Cm3 + v0);
      return {
        solverId: "sixthphysics/al-prac-rp8-gas-laws/1.0.0",
        quantities: {
          pVConstKPaCm3,
          pVConstJ,
          v2Cm3,
          deadVolV0Cm3: v0,
          invV1,
          invV2,
          gradPvsInvV: pVConstKPaCm3,
          gasLawAnchor:
            "change the pressure slowly and wait for thermal equilibrium so the trapped air temperature remains constant and isothermal boyle behaviour holds",
        },
        publicNumbers: [p1, v1, p2, v0],
      };
    }

    const th1 = Number(spec.theta1C);
    const L1 = Number(spec.length1Mm);
    const th2 = Number(spec.theta2C);
    const L2 = Number(spec.length2Mm);
    const gradLvsTheta = (L2 - L1) / (th2 - th1);
    const lengthAt0CMm = L1 - gradLvsTheta * th1;
    const absZeroC = th1 - L1 / gradLvsTheta;
    const absZeroMagC = Math.abs(absZeroC);
    const pctDiffAbsZero = (Math.abs(absZeroC - -273.15) / 273.15) * 100;

    return {
      solverId: "sixthphysics/al-prac-rp8-gas-laws/1.0.0",
      quantities: {
        gradLvsTheta,
        lengthAt0CMm,
        absZeroC,
        absZeroMagC,
        pctDiffAbsZero,
        gasLawAnchor:
          "the concentrated sulfuric acid bead traps dry air at constant atmospheric pressure and absorbs water vapour while stirring the water bath keeps temperature uniform",
      },
      publicNumbers: [th1, L1, th2, L2],
    };
  },
  renderSvg(spec): DomainRenderOutput {
    const mode = String(spec.mode);
    const parts: string[] = [];

    if (mode === "boyle") {
      parts.push(
        svgText(320, 28, "RP8: Boyle's Law Isothermal Gas Apparatus & p vs 1/V Plot", {
          size: 13.5,
          weight: 700,
          anchor: "middle",
        }),
        `<rect x="26" y="46" width="292" height="292" rx="8" fill="${PANEL_BG}" stroke="${BORDER}" stroke-width="1.2"/>`,
        // Vertical sealed glass column (air above, oil below)
        `<rect x="92" y="72" width="28" height="176" rx="3" fill="#e0f2fe" stroke="${INK}" stroke-width="1.8"/>`,
        `<rect x="92" y="162" width="28" height="86" fill="#f59e0b" fill-opacity="0.75" stroke="${INK}" stroke-width="1.2"/>`,
        svgText(106, 118, "Dry air", { size: 9, weight: 600, fill: BLUE, anchor: "middle" }),
        svgText(106, 208, "Oil", { size: 9, weight: 600, fill: INK, anchor: "middle" }),
        // Volume scale beside tube
        `<line x1="74" y1="76" x2="74" y2="242" stroke="${INK}" stroke-width="1.2"/>`,
        svgText(56, 158, "Volume", {
          size: 9.5,
          fill: SLATE,
          anchor: "middle",
          rotate: "rotate(-90 56 158)",
        }),
        // Oil reservoir + Bourdon gauge + pump valve
        `<rect x="74" y="248" width="136" height="58" rx="6" fill="#fde68a" stroke="${INK}" stroke-width="1.8"/>`,
        svgText(142, 282, "Oil reservoir", { size: 10, weight: 600, anchor: "middle" }),
        // Bourdon gauge
        `<line x1="186" y1="248" x2="186" y2="162" stroke="${INK}" stroke-width="2.4"/>`,
        `<circle cx="186" cy="134" r="28" fill="#ffffff" stroke="${INK}" stroke-width="1.8"/>`,
        `<line x1="186" y1="134" x2="204" y2="120" stroke="${RED}" stroke-width="2.2"/>`,
        `<circle cx="186" cy="134" r="3" fill="${INK}"/>`,
        svgText(186, 100, "Bourdon gauge", { size: 9.5, weight: 600, anchor: "middle" }),
        svgText(186, 178, "p (kPa)", { size: 9.5, fill: RED, anchor: "middle" }),
        // Pump connection on right
        `<line x1="210" y1="278" x2="262" y2="278" stroke="${INK}" stroke-width="2.2"/>`,
        `<rect x="262" y="266" width="44" height="24" rx="4" fill="#cbd5e1" stroke="${INK}" stroke-width="1.4"/>`,
        svgText(284, 282, "Pump", { size: 9.5, weight: 600, anchor: "middle" }),
        svgText(172, 326, "Wait after each change for constant T", {
          size: 9.5,
          fill: TEAL,
          anchor: "middle",
        }),
      );

      // Right p vs 1/V plot
      const gx = 380;
      const gy = 78;
      const gw = 222;
      const gh = 198;
      parts.push(
        `<rect x="334" y="46" width="280" height="292" rx="8" fill="#ffffff" stroke="${BORDER}" stroke-width="1.2"/>`,
        svgText(474, 66, "Pressure p vs Inverse Volume 1/V", {
          size: 11.5,
          weight: 700,
          anchor: "middle",
        }),
        `<line x1="${gx}" y1="${gy}" x2="${gx}" y2="${gy + gh}" stroke="${INK}" stroke-width="1.6"/>`,
        `<line x1="${gx}" y1="${gy + gh}" x2="${gx + gw}" y2="${gy + gh}" stroke="${INK}" stroke-width="1.6"/>`,
        `<line x1="${gx}" y1="${gy + gh}" x2="${gx + gw - 16}" y2="${gy + 20}" stroke="${BLUE}" stroke-width="2.2"/>`,
        svgText(gx + 104, gy + 106, "pV = nRT (const T)", {
          size: 10.5,
          weight: 600,
          fill: BLUE,
        }),
        svgText(gx + gw / 2, gy + gh + 28, "1 / V (cm⁻³)", {
          size: 11,
          weight: 600,
          anchor: "middle",
        }),
        svgText(gx - 26, gy + gh / 2, "Pressure p / kPa", {
          size: 11,
          weight: 600,
          anchor: "middle",
          rotate: `rotate(-90 ${gx - 26} ${f2(gy + gh / 2)})`,
        }),
      );
    } else {
      // Charles's law
      parts.push(
        svgText(320, 28, "RP8: Charles's Law Water-Bath Capillary & Extrapolation", {
          size: 13.5,
          weight: 700,
          anchor: "middle",
        }),
        `<rect x="26" y="46" width="292" height="292" rx="8" fill="${PANEL_BG}" stroke="${BORDER}" stroke-width="1.2"/>`,
        // Tall water bath beaker
        `<rect x="64" y="102" width="196" height="198" rx="4" fill="#dbeafe" fill-opacity="0.6" stroke="${INK}" stroke-width="2"/>`,
        svgText(162, 318, "Well-stirred water bath", {
          size: 10,
          weight: 600,
          fill: SLATE,
          anchor: "middle",
        }),
        // Ruler + capillary tube with H2SO4 bead
        `<rect x="112" y="84" width="14" height="202" fill="#fef3c7" stroke="${INK}" stroke-width="1.1"/>`,
        `<rect x="132" y="84" width="12" height="202" fill="#ffffff" stroke="${INK}" stroke-width="1.4"/>`,
        // Concentrated H2SO4 index bead
        `<rect x="133" y="148" width="10" height="18" fill="${RED}"/>`,
        svgText(138, 224, "L", { size: 11, weight: 700, fill: BLUE, anchor: "middle", italic: true }),
        svgText(86, 158, "H₂SO₄", { size: 9.5, weight: 700, fill: RED, anchor: "middle" }),
        svgText(86, 170, "bead", { size: 9.5, fill: RED, anchor: "middle" }),
        // Thermometer
        `<rect x="188" y="76" width="8" height="186" rx="4" fill="#ffffff" stroke="${INK}" stroke-width="1.2"/>`,
        `<circle cx="192" cy="264" r="7" fill="${RED}" stroke="${INK}" stroke-width="1"/>`,
        `<line x1="192" y1="140" x2="192" y2="262" stroke="${RED}" stroke-width="3"/>`,
        svgText(232, 134, "Thermometer", { size: 9.5, fill: INK, anchor: "middle" }),
        // Stirrer loop
        `<line x1="234" y1="76" x2="234" y2="246" stroke="${TEAL}" stroke-width="2"/>`,
        `<ellipse cx="234" cy="252" rx="16" ry="6" fill="none" stroke="${TEAL}" stroke-width="2"/>`,
        svgText(234, 69, "Stirrer", { size: 9.5, weight: 600, fill: TEAL, anchor: "middle" }),
      );

      // Right L vs theta extrapolation plot
      const gx = 374;
      const gy = 78;
      const gw = 228;
      const gh = 198;
      const xZero = gx + 126;
      parts.push(
        `<rect x="334" y="46" width="280" height="292" rx="8" fill="#ffffff" stroke="${BORDER}" stroke-width="1.2"/>`,
        svgText(474, 66, "Air Column Length L vs θ / °C", {
          size: 11.5,
          weight: 700,
          anchor: "middle",
        }),
        `<line x1="${xZero}" y1="${gy}" x2="${xZero}" y2="${gy + gh}" stroke="${INK}" stroke-width="1.5"/>`,
        `<line x1="${gx}" y1="${gy + gh}" x2="${gx + gw}" y2="${gy + gh}" stroke="${INK}" stroke-width="1.6"/>`,
        // Extrapolated dashed portion back to absolute zero
        `<line x1="${gx + 14}" y1="${gy + gh}" x2="${xZero}" y2="${gy + 114}" stroke="${RED}" stroke-width="1.8" stroke-dasharray="5,4"/>`,
        // Measured solid data line for theta > 0
        `<line x1="${xZero}" y1="${gy + 114}" x2="${gx + gw - 14}" y2="${gy + 32}" stroke="${BLUE}" stroke-width="2.3"/>`,
        `<circle cx="${gx + 14}" cy="${gy + gh}" r="4" fill="${RED}"/>`,
        svgText(gx + 34, gy + gh - 12, "Absolute zero", {
          size: 9.5,
          weight: 600,
          fill: RED,
        }),
        svgText(xZero, gy + gh + 15, "0", { size: 10, fill: SLATE, anchor: "middle" }),
        svgText(gx + gw / 2, gy + gh + 32, "Temperature θ / °C", {
          size: 11,
          weight: 600,
          anchor: "middle",
        }),
        svgText(xZero - 14, gy + 16, "L / mm", {
          size: 10.5,
          weight: 600,
          anchor: "end",
        }),
      );
    }

    return {
      visualFamily: "al-prac-rp8-boyle-charles",
      svgMarkup: wrapSvg(
        mode === "boyle"
          ? "Required Practical 8 Boyle law oil-column apparatus and p against inverse volume plot"
          : "Required Practical 8 Charles law capillary water-bath apparatus and absolute zero extrapolation",
        "",
        parts.join(""),
      ),
      rendererVersion: ALEVEL_PRACTICALS_RENDERER_VERSION,
      publicNumbers: [],
      publicLabels: [],
    };
  },
};

/* -------------------------------------------------------------------------- */
/*  11. al-prac-rp9-capacitor-rc-log (RP9, 3.7.4, Y13, circuits)              */
/* -------------------------------------------------------------------------- */

const RP9_CAPACITOR_RC_LOG_PLUGIN: DomainKindPlugin = {
  domain: "circuits",
  kind: "al-prac-rp9-capacitor-rc-log",
  summary:
    "AQA Required Practical 9: Capacitor charge/discharge through a resistor using a two-way switch, electrolytic capacitor polarity, high-R voltmeter, and ln V vs t linearization.",
  requiredFields: [
    { name: "initialVoltageV", type: "number", unit: "V", bounds: "4..15" },
    { name: "resistanceKOhm", type: "number", unit: "kohm", bounds: "10..200" },
    { name: "capacitanceUF", type: "number", unit: "uF", bounds: "100..2200" },
    { name: "t1S", type: "number", unit: "s", bounds: "2..40" },
    { name: "t2S", type: "number", unit: "s", bounds: "10..120" },
    {
      name: "voltmeterResistanceMOhm",
      type: "number",
      unit: "Mohm",
      bounds: "0.2..20",
    },
  ],
  physicalConstraints: [
    "ln V = ln V_0 - t / (RC); gradient = -1 / tau.",
    "Time to halve T_1/2 = RC ln 2.",
    "Finite voltmeter resistance R_V in parallel gives R_eff = R R_V / (R + R_V) < R.",
  ],
  probeSpecs: [
    {
      kind: "al-prac-rp9-capacitor-rc-log",
      initialVoltageV: 9.0,
      resistanceKOhm: 47,
      capacitanceUF: 470,
      t1S: 10,
      t2S: 50,
      voltmeterResistanceMOhm: 1.0,
    },
    {
      kind: "al-prac-rp9-capacitor-rc-log",
      initialVoltageV: 12.0,
      resistanceKOhm: 100,
      capacitanceUF: 330,
      t1S: 15,
      t2S: 75,
      voltmeterResistanceMOhm: 0.5,
    },
  ],
  validate(spec) {
    const issues: string[] = [];
    if (!isPosNum(spec.initialVoltageV) || spec.initialVoltageV > 30) {
      issues.push("initialVoltageV must be in (0, 30]");
    }
    if (!isPosNum(spec.resistanceKOhm) || spec.resistanceKOhm > 1000) {
      issues.push("resistanceKOhm must be in (0, 1000]");
    }
    if (!isPosNum(spec.capacitanceUF) || spec.capacitanceUF > 10000) {
      issues.push("capacitanceUF must be in (0, 10000]");
    }
    if (!isPosNum(spec.t1S) || !isPosNum(spec.t2S) || !(spec.t2S > spec.t1S)) {
      issues.push("Must satisfy 0 < t1S < t2S");
    }
    if (!isPosNum(spec.voltmeterResistanceMOhm)) {
      issues.push("voltmeterResistanceMOhm must be positive");
    }
    return makeValidationResult(issues);
  },
  solve(spec): DomainSolveOutput {
    const V0 = Number(spec.initialVoltageV);
    const R = Number(spec.resistanceKOhm) * 1e3;
    const C = Number(spec.capacitanceUF) * 1e-6;
    const t1 = Number(spec.t1S);
    const t2 = Number(spec.t2S);
    const Rv = Number(spec.voltmeterResistanceMOhm) * 1e6;

    const timeConstantS = R * C;
    const gradLnVvsT = -1 / timeConstantS;
    const tHalfS = timeConstantS * Math.LN2;
    const vAtT1 = V0 * Math.exp(-t1 / timeConstantS);
    const vAtT2 = V0 * Math.exp(-t2 / timeConstantS);
    const lnV1 = Math.log(vAtT1);
    const lnV2 = Math.log(vAtT2);
    const rEffOhm = (R * Rv) / (R + Rv);
    const effectiveTauWithMeterS = rEffOhm * C;
    const pctDropTauFromMeter =
      ((timeConstantS - effectiveTauWithMeterS) / timeConstantS) * 100;

    return {
      solverId: "sixthphysics/al-prac-rp9-rc-log/1.0.0",
      quantities: {
        timeConstantS,
        gradLnVvsT,
        capacitanceF: C,
        capacitanceUF: Number(spec.capacitanceUF),
        tHalfS,
        vAtT1,
        vAtT2,
        lnV1,
        lnV2,
        effectiveTauWithMeterS,
        pctDropTauFromMeter,
        voltmeterLoadingAnchor:
          "observe electrolytic capacitor polarity and use a very high resistance voltmeter so negligible parallel current discharges the capacitor and lowers the measured time constant",
      },
      publicNumbers: [V0, Number(spec.resistanceKOhm), t1, t2, lnV1, lnV2],
    };
  },
  renderSvg(spec, options): DomainRenderOutput {
    const V0 = Number(spec.initialVoltageV);
    const Rk = Number(spec.resistanceKOhm);
    const hidden = extractHiddenSet(spec, options);
    const parts: string[] = [];
    const publicNumbers: number[] = [];
    const publicLabels: string[] = [];

    parts.push(
      svgText(320, 28, "RP9: Capacitor Discharge Circuit and ln(V / V) vs t Plot", {
        size: 13.5,
        weight: 700,
        anchor: "middle",
      }),
      `<rect x="26" y="46" width="298" height="292" rx="8" fill="${PANEL_BG}" stroke="${BORDER}" stroke-width="1.2"/>`,
      // DC supply on left
      `<line x1="64" y1="104" x2="64" y2="152" stroke="${INK}" stroke-width="1.8"/>`,
      `<line x1="50" y1="152" x2="78" y2="152" stroke="${INK}" stroke-width="2"/>`,
      `<line x1="56" y1="162" x2="72" y2="162" stroke="${INK}" stroke-width="3.6"/>`,
      `<line x1="64" y1="162" x2="64" y2="294" stroke="${INK}" stroke-width="1.8"/>`,
      // Two-way switch at top
      `<line x1="64" y1="104" x2="112" y2="104" stroke="${INK}" stroke-width="1.8"/>`,
      `<circle cx="114" cy="104" r="3" fill="${BLUE}"/>`,
      svgText(114, 92, "1 (Charge)", { size: 9, fill: BLUE, anchor: "middle" }),
      `<circle cx="156" cy="104" r="3" fill="${INK}"/>`,
      `<line x1="156" y1="104" x2="176" y2="122" stroke="${RED}" stroke-width="2"/>`,
      `<circle cx="180" cy="126" r="3" fill="${RED}"/>`,
      svgText(224, 128, "2 (Discharge)", { size: 9, fill: RED }),
      // Capacitor branch (middle vertical x=156)
      `<line x1="156" y1="104" x2="156" y2="172" stroke="${INK}" stroke-width="1.8"/>`,
      `<line x1="138" y1="172" x2="174" y2="172" stroke="${BLUE}" stroke-width="2.6"/>`,
      `<line x1="138" y1="184" x2="174" y2="184" stroke="${BLUE}" stroke-width="2.6"/>`,
      svgText(128, 170, "+", { size: 12, weight: 700, fill: RED, anchor: "end" }),
      svgText(128, 194, "−", { size: 12, weight: 700, fill: BLUE, anchor: "end" }),
      svgText(122, 182, "C", { size: 11, weight: 700, anchor: "end", italic: true }),
      `<line x1="156" y1="184" x2="156" y2="294" stroke="${INK}" stroke-width="1.8"/>`,
      // Discharge resistor branch (x=226)
      `<line x1="180" y1="126" x2="180" y2="146" stroke="${INK}" stroke-width="1.8"/>`,
      `<line x1="180" y1="146" x2="226" y2="146" stroke="${INK}" stroke-width="1.8"/>`,
      `<line x1="226" y1="146" x2="226" y2="168" stroke="${INK}" stroke-width="1.8"/>`,
      `<rect x="216" y="168" width="20" height="54" fill="#ffffff" stroke="${INK}" stroke-width="1.6"/>`,
      `<line x1="226" y1="222" x2="226" y2="294" stroke="${INK}" stroke-width="1.8"/>`,
      // High-R voltmeter across capacitor/resistor (x=286)
      `<line x1="226" y1="146" x2="286" y2="146" stroke="${TEAL}" stroke-width="1.5"/>`,
      `<line x1="286" y1="146" x2="286" y2="178" stroke="${TEAL}" stroke-width="1.5"/>`,
      `<circle cx="286" cy="194" r="16" fill="#ffffff" stroke="${TEAL}" stroke-width="1.8"/>`,
      svgText(286, 198, "V", { size: 12, weight: 700, fill: TEAL, anchor: "middle" }),
      `<line x1="286" y1="210" x2="286" y2="294" stroke="${TEAL}" stroke-width="1.5"/>`,
      // Common return rail
      `<line x1="64" y1="294" x2="286" y2="294" stroke="${INK}" stroke-width="1.8"/>`,
      svgText(175, 322, "Electrolytic polarity (+/−) & high-R voltmeter", {
        size: 9.5,
        fill: SLATE,
        anchor: "middle",
      }),
    );

    if (!hidden.has("initialVoltageV")) {
      const vLbl = `${fmtTick(V0, 1)} V`;
      parts.push(
        svgText(44, 160, vLbl, { size: 10, weight: 600, anchor: "end" }),
      );
      publicNumbers.push(V0);
      publicLabels.push(vLbl);
    }
    if (!hidden.has("resistanceKOhm")) {
      const rLbl = `${fmtTick(Rk, 1)} kΩ`;
      parts.push(
        svgText(242, 198, rLbl, { size: 9.5, weight: 600, fill: INK }),
      );
      publicNumbers.push(Rk);
      publicLabels.push(rLbl);
    }

    // Right ln V vs t plot
    const gx = 382;
    const gy = 78;
    const gw = 220;
    const gh = 198;
    parts.push(
      `<rect x="338" y="46" width="276" height="292" rx="8" fill="#ffffff" stroke="${BORDER}" stroke-width="1.2"/>`,
      svgText(476, 66, "Semi-Log Plot: ln(V / V) vs t", {
        size: 11.5,
        weight: 700,
        anchor: "middle",
      }),
      `<line x1="${gx}" y1="${gy}" x2="${gx}" y2="${gy + gh}" stroke="${INK}" stroke-width="1.6"/>`,
      `<line x1="${gx}" y1="${gy + gh}" x2="${gx + gw}" y2="${gy + gh}" stroke="${INK}" stroke-width="1.6"/>`,
      `<line x1="${gx}" y1="${gy + 22}" x2="${gx + gw - 16}" y2="${gy + gh - 26}" stroke="${BLUE}" stroke-width="2.2"/>`,
      svgText(gx + 10, gy + 20, "intercept = ln V₀", {
        size: 10,
        weight: 600,
        fill: RED,
      }),
      svgText(gx + 104, gy + 102, "grad = −1 / RC", {
        size: 10.5,
        weight: 600,
        fill: BLUE,
      }),
      svgText(gx + gw / 2, gy + gh + 28, "Time t / s", {
        size: 11,
        weight: 600,
        anchor: "middle",
      }),
      svgText(gx - 26, gy + gh / 2, "ln(V / V)", {
        size: 11,
        weight: 600,
        anchor: "middle",
        rotate: `rotate(-90 ${gx - 26} ${f2(gy + gh / 2)})`,
      }),
    );

    return {
      visualFamily: "al-prac-rp9-capacitor-rc-log",
      svgMarkup: wrapSvg(
        "Required Practical 9 capacitor discharge circuit and semi-log ln V against t graph",
        "",
        parts.join(""),
      ),
      rendererVersion: ALEVEL_PRACTICALS_RENDERER_VERSION,
      publicNumbers,
      publicLabels,
    };
  },
};

/* -------------------------------------------------------------------------- */
/*  12. al-prac-rp10-mag-force-balance (RP10, 3.7.5, Y13, em-induction)       */
/* -------------------------------------------------------------------------- */

const RP10_MAG_FORCE_BALANCE_PLUGIN: DomainKindPlugin = {
  domain: "em-induction",
  kind: "al-prac-rp10-mag-force-balance",
  summary:
    "AQA Required Practical 10: Magnetic force on a current-carrying wire using slab magnets on a steel yoke atop a 0.01 g top-pan balance (M = M_0 + (BL/g) I).",
  requiredFields: [
    { name: "fluxDensityMT", type: "number", unit: "mT", bounds: "15..120" },
    { name: "wireLengthMm", type: "number", unit: "mm", bounds: "30..100" },
    { name: "yokeMassG", type: "number", unit: "g", bounds: "60..280" },
    { name: "maxCurrentA", type: "number", unit: "A", bounds: "1.0..6.0" },
    { name: "tared", type: "boolean" },
  ],
  physicalConstraints: [
    "By Newton's 3rd law, downward magnetic force on magnet yoke equals B I L = Delta m * g (g = 9.81 m s^-2).",
    "Gradient of balance mass M (g) vs current I (A) equals 1000 B L / g.",
    "When untared, y-intercept M_0 equals the mass of the steel yoke and magnets.",
  ],
  probeSpecs: [
    {
      kind: "al-prac-rp10-mag-force-balance",
      fluxDensityMT: 54,
      wireLengthMm: 60,
      yokeMassG: 142.5,
      maxCurrentA: 4.5,
      tared: true,
    },
    {
      kind: "al-prac-rp10-mag-force-balance",
      fluxDensityMT: 72,
      wireLengthMm: 50,
      yokeMassG: 168.4,
      maxCurrentA: 4.0,
      tared: false,
    },
  ],
  validate(spec) {
    const issues: string[] = [];
    if (!isPosNum(spec.fluxDensityMT) || spec.fluxDensityMT > 500) {
      issues.push("fluxDensityMT must be in (0, 500]");
    }
    if (!isPosNum(spec.wireLengthMm) || spec.wireLengthMm > 200) {
      issues.push("wireLengthMm must be in (0, 200]");
    }
    if (!isPosNum(spec.yokeMassG) || spec.yokeMassG > 1000) {
      issues.push("yokeMassG must be in (0, 1000]");
    }
    if (!isPosNum(spec.maxCurrentA) || spec.maxCurrentA > 15) {
      issues.push("maxCurrentA must be in (0, 15]");
    }
    if (typeof spec.tared !== "boolean") {
      issues.push("tared must be a boolean");
    }
    return makeValidationResult(issues);
  },
  solve(spec): DomainSolveOutput {
    const B_mT = Number(spec.fluxDensityMT);
    const B = B_mT * 1e-3;
    const L_mm = Number(spec.wireLengthMm);
    const L = L_mm * 1e-3;
    const yokeMassG = Number(spec.yokeMassG);
    const Imax = Number(spec.maxCurrentA);
    const tared = Boolean(spec.tared);

    const gradMvsI_gPerA = ((B * L) / ALEVEL_GRAVITY_MS2) * 1000;
    const deltaMassAtMaxIG = gradMvsI_gPerA * Imax;
    const yokeMassM0G = tared ? 0 : yokeMassG;
    const readingAtMaxIG = yokeMassM0G + deltaMassAtMaxIG;
    const forceAtMaxIN = B * Imax * L;

    return {
      solverId: "sixthphysics/al-prac-rp10-balance/1.0.0",
      quantities: {
        fluxDensityT: B,
        fluxDensityMT: B_mT,
        gradMvsI_gPerA,
        yokeMassM0G,
        deltaMassAtMaxIG,
        readingAtMaxIG,
        forceAtMaxIN,
        rp10Anchor:
          "by newton third law the equal and opposite downward magnetic force on the magnet yoke increases the top pan balance reading proportionally to current",
      },
      publicNumbers: [L_mm, Imax, ...(tared ? [] : [yokeMassG])],
    };
  },
  renderSvg(spec, options): DomainRenderOutput {
    const tared = Boolean(spec.tared);
    const Lmm = Number(spec.wireLengthMm);
    const hidden = extractHiddenSet(spec, options);
    const parts: string[] = [];
    const publicNumbers: number[] = [];
    const publicLabels: string[] = [];

    parts.push(
      svgText(320, 28, "RP10: Top-Pan Balance Current-Force Apparatus (F = BIl)", {
        size: 13.5,
        weight: 700,
        anchor: "middle",
      }),
      `<rect x="26" y="46" width="298" height="292" rx="8" fill="${PANEL_BG}" stroke="${BORDER}" stroke-width="1.2"/>`,
      // Digital top-pan balance
      `<rect x="74" y="246" width="202" height="58" rx="6" fill="#e2e8f0" stroke="${INK}" stroke-width="1.8"/>`,
      `<rect x="92" y="238" width="166" height="8" rx="2" fill="#94a3b8" stroke="${INK}" stroke-width="1.2"/>`,
      `<rect x="108" y="260" width="96" height="28" rx="3" fill="#ecfdf5" stroke="${TEAL}" stroke-width="1.4"/>`,
      svgText(156, 279, "0.01 g LCD", {
        size: 10.5,
        weight: 700,
        fill: TEAL,
        anchor: "middle",
      }),
      `<rect x="218" y="264" width="42" height="20" rx="3" fill="#cbd5e1" stroke="${INK}" stroke-width="1"/>`,
      svgText(239, 278, "TARE", { size: 9, weight: 700, anchor: "middle" }),
      // U-shaped steel yoke + N/S slab magnets
      `<path d="M 116 142 L 116 238 L 234 238 L 234 142 L 222 142 L 222 226 L 128 226 L 128 142 Z" fill="#64748b" stroke="${INK}" stroke-width="1.4"/>`,
      `<rect x="128" y="150" width="20" height="58" fill="${RED}" stroke="${INK}" stroke-width="1.2"/>`,
      svgText(138, 183, "N", { size: 11, weight: 700, fill: "#ffffff", anchor: "middle" }),
      `<rect x="202" y="150" width="20" height="58" fill="${BLUE}" stroke="${INK}" stroke-width="1.2"/>`,
      svgText(212, 183, "S", { size: 11, weight: 700, fill: "#ffffff", anchor: "middle" }),
      // Uniform B field arrows N -> S
      `<line x1="152" y1="164" x2="198" y2="164" stroke="${SLATE}" stroke-width="1.1" stroke-dasharray="3,2"/>`,
      `<line x1="152" y1="194" x2="198" y2="194" stroke="${SLATE}" stroke-width="1.1" stroke-dasharray="3,2"/>`,
      svgText(175, 158, "B", { size: 10, weight: 700, fill: SLATE, anchor: "middle", italic: true }),
      // Clamped horizontal stiff copper rod perpendicular to B (cross-section circle with dot/cross)
      `<line x1="42" y1="179" x2="168" y2="179" stroke="#b45309" stroke-width="3.2"/>`,
      `<line x1="182" y1="179" x2="306" y2="179" stroke="#b45309" stroke-width="3.2"/>`,
      `<circle cx="175" cy="179" r="7" fill="#fef3c7" stroke="#b45309" stroke-width="2"/>`,
      `<circle cx="175" cy="179" r="2.2" fill="#b45309"/>`,
      svgText(175, 96, "Clamped stiff copper rod (⊥ to B)", {
        size: 10,
        weight: 600,
        fill: "#92400e",
        anchor: "middle",
      }),
      // DC supply / ammeter label
      svgText(175, 322, "Retort clamp isolates rod from balance pan", {
        size: 9.5,
        fill: SLATE,
        anchor: "middle",
      }),
    );

    if (!hidden.has("wireLengthMm")) {
      const lLbl = `Active length L = ${fmtTick(Lmm, 0)} mm`;
      parts.push(
        svgText(175, 114, lLbl, { size: 10, fill: BLUE, anchor: "middle" }),
      );
      publicNumbers.push(Lmm);
      publicLabels.push(lLbl);
    }

    // Right M vs I plot
    const gx = 382;
    const gy = 78;
    const gw = 220;
    const gh = 198;
    const startY = tared ? gy + gh : gy + gh - 42;
    parts.push(
      `<rect x="338" y="46" width="276" height="292" rx="8" fill="#ffffff" stroke="${BORDER}" stroke-width="1.2"/>`,
      svgText(
        476,
        66,
        tared ? "Balance Reading Δm vs I (Tared)" : "Balance Reading M vs I (Untared)",
        { size: 11.5, weight: 700, anchor: "middle" },
      ),
      `<line x1="${gx}" y1="${gy}" x2="${gx}" y2="${gy + gh}" stroke="${INK}" stroke-width="1.6"/>`,
      `<line x1="${gx}" y1="${gy + gh}" x2="${gx + gw}" y2="${gy + gh}" stroke="${INK}" stroke-width="1.6"/>`,
      `<line x1="${gx}" y1="${startY}" x2="${gx + gw - 16}" y2="${gy + 22}" stroke="${BLUE}" stroke-width="2.2"/>`,
      svgText(gx + 102, gy + 116, "grad = BL / g", {
        size: 10.5,
        weight: 600,
        fill: BLUE,
      }),
      svgText(gx + gw / 2, gy + gh + 28, "Current I / A", {
        size: 11,
        weight: 600,
        anchor: "middle",
      }),
      svgText(gx - 26, gy + gh / 2, tared ? "Δm / g" : "Mass M / g", {
        size: 11,
        weight: 600,
        anchor: "middle",
        rotate: `rotate(-90 ${gx - 26} ${f2(gy + gh / 2)})`,
      }),
    );
    if (!tared) {
      parts.push(
        `<circle cx="${gx}" cy="${startY}" r="4" fill="${RED}"/>`,
        svgText(gx + 10, startY + 4, "M₀ (yoke + magnets)", {
          size: 9.5,
          weight: 600,
          fill: RED,
        }),
      );
    }

    return {
      visualFamily: "al-prac-rp10-mag-force-balance",
      svgMarkup: wrapSvg(
        "Required Practical 10 top-pan balance magnetic force apparatus and M against I plot",
        "",
        parts.join(""),
      ),
      rendererVersion: ALEVEL_PRACTICALS_RENDERER_VERSION,
      publicNumbers,
      publicLabels,
    };
  },
};

/* -------------------------------------------------------------------------- */
/*  13. al-prac-rp11-search-coil-hall (RP11, 3.7.5, Y13, em-induction)        */
/* -------------------------------------------------------------------------- */

const RP11_SEARCH_COIL_HALL_PLUGIN: DomainKindPlugin = {
  domain: "em-induction",
  kind: "al-prac-rp11-search-coil-hall",
  summary:
    "AQA Required Practical 11: Magnetic flux linkage N Phi = B A N cos theta investigated with a rotatable search coil inside a 50 Hz AC Helmholtz/circular coil and CRO (contrasted with a DC Hall probe).",
  requiredFields: [
    { name: "acFreqHz", type: "number", unit: "Hz", bounds: "40..200" },
    { name: "searchCoilTurns", type: "number", bounds: "100..5000" },
    { name: "searchCoilAreaCm2", type: "number", unit: "cm^2", bounds: "0.5..12" },
    { name: "fluxDensityMT", type: "number", unit: "mT", bounds: "0.5..25" },
    { name: "angleThetaDeg", type: "number", unit: "deg", bounds: "0..75" },
    { name: "yGainMvPerDiv", type: "number", unit: "mV div^-1", bounds: "5..200" },
  ],
  physicalConstraints: [
    "Peak induced emf epsilon_0 = 2 pi f B A N cos theta; CRO V_pp = 2 epsilon_0.",
    "V_pp vs cos theta is linear through the origin with gradient 4 pi f B A N.",
    "Search coil requires changing/AC flux; a Hall probe measures static DC flux density.",
  ],
  probeSpecs: [
    {
      kind: "al-prac-rp11-search-coil-hall",
      acFreqHz: 50,
      searchCoilTurns: 2000,
      searchCoilAreaCm2: 1.5,
      fluxDensityMT: 4.0,
      angleThetaDeg: 35,
      yGainMvPerDiv: 100,
    },
    {
      kind: "al-prac-rp11-search-coil-hall",
      acFreqHz: 60,
      searchCoilTurns: 1500,
      searchCoilAreaCm2: 2.0,
      fluxDensityMT: 3.2,
      angleThetaDeg: 50,
      yGainMvPerDiv: 100,
    },
  ],
  validate(spec) {
    const issues: string[] = [];
    if (!isPosNum(spec.acFreqHz) || spec.acFreqHz > 500) {
      issues.push("acFreqHz must be in (0, 500]");
    }
    if (!isPosNum(spec.searchCoilTurns) || spec.searchCoilTurns > 10000) {
      issues.push("searchCoilTurns must be in (0, 10000]");
    }
    if (!isPosNum(spec.searchCoilAreaCm2) || spec.searchCoilAreaCm2 > 50) {
      issues.push("searchCoilAreaCm2 must be in (0, 50]");
    }
    if (!isPosNum(spec.fluxDensityMT) || spec.fluxDensityMT > 100) {
      issues.push("fluxDensityMT must be in (0, 100]");
    }
    if (!isNonNegNum(spec.angleThetaDeg) || spec.angleThetaDeg >= 90) {
      issues.push("angleThetaDeg must be in [0, 90)");
    }
    if (!isPosNum(spec.yGainMvPerDiv)) {
      issues.push("yGainMvPerDiv must be positive");
    }
    return makeValidationResult(issues);
  },
  solve(spec): DomainSolveOutput {
    const f = Number(spec.acFreqHz);
    const N = Number(spec.searchCoilTurns);
    const A = Number(spec.searchCoilAreaCm2) * 1e-4;
    const B_mT = Number(spec.fluxDensityMT);
    const B = B_mT * 1e-3;
    const thetaDeg = Number(spec.angleThetaDeg);
    const yGain = Number(spec.yGainMvPerDiv);

    const cosTheta = Math.cos((thetaDeg * Math.PI) / 180);
    const peakEmfMaxV = 2 * Math.PI * f * B * A * N;
    const vPeakToPeakMaxMv = 2 * peakEmfMaxV * 1000;
    const gradVppVsCosThetaMv = vPeakToPeakMaxMv;
    const peakEmfMv = peakEmfMaxV * cosTheta * 1000;
    const vPeakToPeakMv = 2 * peakEmfMv;
    const peakToPeakDivs = vPeakToPeakMv / yGain;

    return {
      solverId: "sixthphysics/al-prac-rp11-search-coil/1.0.0",
      quantities: {
        fluxDensityT: B,
        fluxDensityMT: B_mT,
        cosTheta,
        angleThetaDeg: thetaDeg,
        peakEmfMv,
        vPeakToPeakMv,
        vPeakToPeakMaxMv,
        gradVppVsCosThetaMv,
        peakToPeakDivs,
        hallVsSearchAnchor:
          "a search coil requires an alternating magnetic field to induce an emf whereas a hall probe measures static direct current magnetic flux density",
      },
      publicNumbers: [f, N, Number(spec.searchCoilAreaCm2), thetaDeg, yGain],
    };
  },
  renderSvg(spec, options): DomainRenderOutput {
    const f = Number(spec.acFreqHz);
    const thetaDeg = Number(spec.angleThetaDeg);
    const hidden = extractHiddenSet(spec, options);
    const parts: string[] = [];
    const publicNumbers: number[] = [];
    const publicLabels: string[] = [];

    const cx = 174;
    const cy = 166;
    const rad = (thetaDeg * Math.PI) / 180;
    const dx = 28 * Math.sin(rad);
    const dy = 28 * Math.cos(rad);

    parts.push(
      svgText(320, 28, "RP11: Search Coil in AC Magnetic Field & Vpp vs cos θ Plot", {
        size: 13.5,
        weight: 700,
        anchor: "middle",
      }),
      `<rect x="26" y="46" width="298" height="292" rx="8" fill="${PANEL_BG}" stroke="${BORDER}" stroke-width="1.2"/>`,
      // Large circular / Helmholtz AC coil ring
      `<circle cx="${cx}" cy="${cy}" r="88" fill="none" stroke="#b45309" stroke-width="6"/>`,
      `<circle cx="${cx}" cy="${cy}" r="82" fill="none" stroke="#f59e0b" stroke-width="2"/>`,
      // Uniform horizontal B field lines
      `<line x1="${cx - 72}" y1="${cy - 34}" x2="${cx + 72}" y2="${cy - 34}" stroke="${SLATE}" stroke-width="1.1" stroke-dasharray="4,3"/>`,
      `<line x1="${cx - 72}" y1="${cy}" x2="${cx + 72}" y2="${cy}" stroke="${SLATE}" stroke-width="1.2" stroke-dasharray="4,3"/>`,
      `<line x1="${cx - 72}" y1="${cy + 34}" x2="${cx + 72}" y2="${cy + 34}" stroke="${SLATE}" stroke-width="1.1" stroke-dasharray="4,3"/>`,
      svgText(cx + 58, cy - 42, "AC B", { size: 10, weight: 700, fill: SLATE }),
      // Protractor semicircle
      `<path d="M ${cx - 46} ${cy} A 46 46 0 0 1 ${cx + 46} ${cy}" fill="#fef9c3" fill-opacity="0.55" stroke="${SLATE}" stroke-width="1"/>`,
      // Rotated search coil bar + normal vector
      `<line x1="${f2(cx - dx)}" y1="${f2(cy - dy)}" x2="${f2(cx + dx)}" y2="${f2(cy + dy)}" stroke="${BLUE}" stroke-width="5"/>`,
      `<line x1="${cx}" y1="${cy}" x2="${f2(cx + 38 * Math.cos(rad))}" y2="${f2(cy - 38 * Math.sin(rad))}" stroke="${RED}" stroke-width="2"/>`,
      svgText(cx + 22, cy - 16, "θ", { size: 11.5, weight: 700, fill: RED, italic: true }),
      svgText(cx, cy + 56, "Rotatable search coil on protractor", {
        size: 9.5,
        weight: 600,
        fill: BLUE,
        anchor: "middle",
      }),
      // AC supply & CRO boxes
      `<rect x="40" y="274" width="112" height="28" rx="4" fill="#ffffff" stroke="${INK}" stroke-width="1.4"/>`,
      svgText(96, 292, `${fmtTick(f, 0)} Hz AC supply`, {
        size: 10,
        weight: 600,
        anchor: "middle",
      }),
      `<rect x="192" y="274" width="116" height="28" rx="4" fill="#ecfdf5" stroke="${TEAL}" stroke-width="1.4"/>`,
      svgText(250, 292, "CRO (measures Vpp)", {
        size: 9.5,
        weight: 600,
        fill: TEAL,
        anchor: "middle",
      }),
      svgText(175, 326, "DC static field contrast: use Hall probe", {
        size: 9.5,
        fill: SLATE,
        anchor: "middle",
      }),
    );
    if (!hidden.has("acFreqHz")) {
      publicNumbers.push(f);
      publicLabels.push(`${fmtTick(f, 0)} Hz AC supply`);
    }

    // Right Vpp vs cos theta linear plot
    const gx = 382;
    const gy = 78;
    const gw = 220;
    const gh = 198;
    parts.push(
      `<rect x="338" y="46" width="276" height="292" rx="8" fill="#ffffff" stroke="${BORDER}" stroke-width="1.2"/>`,
      svgRawText(
        476,
        66,
        'V<tspan dy="3" font-size="8.5">pp</tspan><tspan dy="-3"> vs cos θ (Linear Through Origin)</tspan>',
        { size: 11.5, weight: 700, anchor: "middle" },
      ),
      `<line x1="${gx}" y1="${gy}" x2="${gx}" y2="${gy + gh}" stroke="${INK}" stroke-width="1.6"/>`,
      `<line x1="${gx}" y1="${gy + gh}" x2="${gx + gw}" y2="${gy + gh}" stroke="${INK}" stroke-width="1.6"/>`,
      `<line x1="${gx}" y1="${gy + gh}" x2="${gx + gw - 16}" y2="${gy + 22}" stroke="${BLUE}" stroke-width="2.2"/>`,
      svgText(gx + 92, gy + 114, "grad = 4πf B A N", {
        size: 10.5,
        weight: 600,
        fill: BLUE,
      }),
      svgText(gx + gw / 2, gy + gh + 28, "cos θ", {
        size: 11,
        weight: 600,
        anchor: "middle",
      }),
      svgRawText(
        gx - 26,
        gy + gh / 2,
        'V<tspan dy="3" font-size="8.5">pp</tspan><tspan dy="-3"> / mV</tspan>',
        {
          size: 11,
          weight: 600,
          anchor: "middle",
          rotate: `rotate(-90 ${gx - 26} ${f2(gy + gh / 2)})`,
        },
      ),
    );

    publicLabels.push("grad = 4πf B A N");

    return {
      visualFamily: "al-prac-rp11-search-coil-hall",
      svgMarkup: wrapSvg(
        "Required Practical 11 rotatable search coil inside AC coil with Vpp against cos theta plot",
        "",
        parts.join(""),
      ),
      rendererVersion: ALEVEL_PRACTICALS_RENDERER_VERSION,
      publicNumbers,
      publicLabels,
    };
  },
};

/* -------------------------------------------------------------------------- */
/*  14. al-prac-rp12-gamma-inverse-square (RP12, 3.8, Y13, quantum-nuclear)   */
/* -------------------------------------------------------------------------- */

const RP12_GAMMA_INVERSE_SQUARE_PLUGIN: DomainKindPlugin = {
  domain: "quantum-nuclear",
  kind: "al-prac-rp12-gamma-inverse-square",
  summary:
    "AQA Required Practical 12: Inverse-square law for gamma radiation with background subtraction and 1/sqrt(C_corr) vs x plot revealing hidden systematic offset x_0.",
  requiredFields: [
    { name: "bgCount", type: "number", bounds: "150..900" },
    { name: "bgTimeMin", type: "number", unit: "min", bounds: "10..25" },
    { name: "constK", type: "number", unit: "s^-1 m^2", bounds: "0.5..12" },
    { name: "sourceOffsetX0Mm", type: "number", unit: "mm", bounds: "8..45" },
    { name: "x1Mm", type: "number", unit: "mm", bounds: "80..250" },
    { name: "x2Mm", type: "number", unit: "mm", bounds: "260..600" },
  ],
  physicalConstraints: [
    "Background count rate C_bg = N_bg / t_bg measured over a long duration (15-20 min) to cut random % uncertainty.",
    "C_corr = C_raw - C_bg = k / (x + x_0)^2.",
    "1 / sqrt(C_corr) = (1 / sqrt(k)) x + x_0 / sqrt(k) has negative x-intercept at x = -x_0.",
  ],
  probeSpecs: [
    {
      kind: "al-prac-rp12-gamma-inverse-square",
      bgCount: 360,
      bgTimeMin: 15,
      constK: 2.25,
      sourceOffsetX0Mm: 24,
      x1Mm: 120,
      x2Mm: 360,
    },
    {
      kind: "al-prac-rp12-gamma-inverse-square",
      bgCount: 540,
      bgTimeMin: 20,
      constK: 4.0,
      sourceOffsetX0Mm: 18,
      x1Mm: 150,
      x2Mm: 450,
    },
  ],
  validate(spec) {
    const issues: string[] = [];
    if (!isPosNum(spec.bgCount) || spec.bgCount > 5000) {
      issues.push("bgCount must be in (0, 5000]");
    }
    if (!isPosNum(spec.bgTimeMin) || spec.bgTimeMin < 5 || spec.bgTimeMin > 60) {
      issues.push("bgTimeMin must be in [5, 60]");
    }
    if (!isPosNum(spec.constK) || spec.constK > 50) {
      issues.push("constK must be in (0, 50]");
    }
    if (!isPosNum(spec.sourceOffsetX0Mm) || spec.sourceOffsetX0Mm > 100) {
      issues.push("sourceOffsetX0Mm must be in (0, 100]");
    }
    if (
      !isPosNum(spec.x1Mm) ||
      !isPosNum(spec.x2Mm) ||
      !(spec.x2Mm > spec.x1Mm + 50)
    ) {
      issues.push("Must satisfy x2Mm > x1Mm + 50");
    }
    return makeValidationResult(issues);
  },
  solve(spec): DomainSolveOutput {
    const bgCount = Number(spec.bgCount);
    const bgTimeMin = Number(spec.bgTimeMin);
    const constK = Number(spec.constK);
    const x0Mm = Number(spec.sourceOffsetX0Mm);
    const x1Mm = Number(spec.x1Mm);
    const x2Mm = Number(spec.x2Mm);

    const bgRatePerS = bgCount / (bgTimeMin * 60);
    const x0M = x0Mm * 1e-3;
    const x1M = x1Mm * 1e-3;
    const x2M = x2Mm * 1e-3;

    const cCorr1 = constK / (x1M + x0M) ** 2;
    const cCorr2 = constK / (x2M + x0M) ** 2;
    const cRaw1 = cCorr1 + bgRatePerS;
    const cRaw2 = cCorr2 + bgRatePerS;
    const invSqrtC1 = 1 / Math.sqrt(cCorr1);
    const invSqrtC2 = 1 / Math.sqrt(cCorr2);
    const gradInvSqrtCPerM = 1 / Math.sqrt(constK);
    const yInterceptInvSqrtC = x0M / Math.sqrt(constK);
    const ratioCheckC1x1sq = cCorr1 * (x1M + x0M) ** 2;
    const ratioCheckC2x2sq = cCorr2 * (x2M + x0M) ** 2;

    return {
      solverId: "sixthphysics/al-prac-rp12-gamma/1.0.0",
      quantities: {
        bgRatePerS,
        cRaw1,
        cRaw2,
        cCorr1,
        cCorr2,
        invSqrtC1,
        invSqrtC2,
        gradInvSqrtCPerM,
        yInterceptInvSqrtC,
        sourceOffsetX0Mm: x0Mm,
        constK,
        ratioCheckC1x1sq,
        ratioCheckC2x2sq,
        rp12SafetyAnchor:
          "handle the sealed gamma source with long tongs maximise distance minimise exposure time outside lead storage and plot one over square root corrected count rate against x to reveal systematic offset",
      },
      publicNumbers: [bgCount, bgTimeMin, x1Mm, x2Mm, cRaw1, cRaw2],
    };
  },
  renderSvg(spec, options): DomainRenderOutput {
    const arrId = makeId("rp12-arr", options);
    const defs = arrowMarkerDef(arrId, INK);
    const parts: string[] = [];

    parts.push(
      svgText(320, 28, "RP12: Inverse-Square Law for Gamma Radiation", {
        size: 13.5,
        weight: 700,
        anchor: "middle",
      }),
      // Left apparatus panel
      `<rect x="26" y="46" width="298" height="292" rx="8" fill="${PANEL_BG}" stroke="${BORDER}" stroke-width="1.2"/>`,
      // Sealed gamma source holder
      `<rect x="46" y="138" width="46" height="44" rx="4" fill="#475569" stroke="${INK}" stroke-width="1.6"/>`,
      `<circle cx="72" cy="160" r="8" fill="${RED}" stroke="#ffffff" stroke-width="1.2"/>`,
      svgText(69, 128, "Sealed γ source", { size: 9.5, weight: 600, fill: RED, anchor: "middle" }),
      // Diverging gamma rays
      `<line x1="92" y1="160" x2="210" y2="144" stroke="${RED}" stroke-width="1.3" stroke-dasharray="4,3"/>`,
      `<line x1="92" y1="160" x2="210" y2="160" stroke="${RED}" stroke-width="1.6" stroke-dasharray="4,3"/>`,
      `<line x1="92" y1="160" x2="210" y2="176" stroke="${RED}" stroke-width="1.3" stroke-dasharray="4,3"/>`,
      // GM tube + counter
      `<rect x="210" y="142" width="76" height="36" rx="4" fill="#cbd5e1" stroke="${INK}" stroke-width="1.6"/>`,
      `<line x1="210" y1="142" x2="210" y2="178" stroke="${BLUE}" stroke-width="3.2"/>`,
      svgText(248, 164, "GM tube", { size: 10.5, weight: 700, anchor: "middle" }),
      `<line x1="248" y1="178" x2="248" y2="262" stroke="${INK}" stroke-width="1.8"/>`,
      `<rect x="188" y="262" width="118" height="36" rx="5" fill="#ecfdf5" stroke="${TEAL}" stroke-width="1.5"/>`,
      svgText(247, 284, "Counter / Timer", { size: 10, weight: 700, fill: TEAL, anchor: "middle" }),
      // Metre ruler below source and GM tube
      `<rect x="46" y="218" width="240" height="16" fill="#fef3c7" stroke="${INK}" stroke-width="1.2"/>`,
      svgText(166, 230, "Metre ruler", { size: 9.5, fill: SLATE, anchor: "middle" }),
      // Measured separation x + hidden internal offset x0
      `<line x1="92" y1="200" x2="210" y2="200" stroke="${INK}" stroke-width="1.4" marker-start="url(#${arrId})" marker-end="url(#${arrId})"/>`,
      svgText(151, 194, "Measured x", { size: 10, weight: 600, anchor: "middle" }),
      svgText(69, 200, "x₀", { size: 10, weight: 700, fill: BLUE, anchor: "middle", italic: true }),
      svgText(175, 322, "Long tongs · max distance · lead storage box", {
        size: 9.5,
        fill: RED,
        anchor: "middle",
      }),
    );

    // Right 1/sqrt(C_corr) vs x plot showing negative x-intercept -x0
    const gx = 382;
    const gy = 78;
    const gw = 220;
    const gh = 198;
    const yAxisX = gx + 48;
    parts.push(
      `<rect x="338" y="46" width="276" height="292" rx="8" fill="#ffffff" stroke="${BORDER}" stroke-width="1.2"/>`,
      svgRawText(
        476,
        66,
        '1 / √C<tspan dy="3" font-size="8.5">corr</tspan><tspan dy="-3"> vs Measured Distance x</tspan>',
        { size: 11.5, weight: 700, anchor: "middle" },
      ),
      `<line x1="${yAxisX}" y1="${gy}" x2="${yAxisX}" y2="${gy + gh}" stroke="${INK}" stroke-width="1.6"/>`,
      `<line x1="${gx}" y1="${gy + gh}" x2="${gx + gw}" y2="${gy + gh}" stroke="${INK}" stroke-width="1.6"/>`,
      // Dashed negative extrapolation to -x0
      `<line x1="${gx + 14}" y1="${gy + gh}" x2="${yAxisX}" y2="${gy + gh - 34}" stroke="${RED}" stroke-width="1.8" stroke-dasharray="5,4"/>`,
      // Solid measured straight line for x >= 0
      `<line x1="${yAxisX}" y1="${gy + gh - 34}" x2="${gx + gw - 14}" y2="${gy + 24}" stroke="${BLUE}" stroke-width="2.3"/>`,
      `<circle cx="${gx + 14}" cy="${gy + gh}" r="4" fill="${RED}"/>`,
      svgText(gx + 14, gy + gh + 16, "−x₀", {
        size: 10.5,
        weight: 700,
        fill: RED,
        anchor: "middle",
      }),
      svgText(yAxisX, gy + gh + 16, "0", {
        size: 10,
        fill: SLATE,
        anchor: "middle",
      }),
      svgText(yAxisX + 64, gy + 114, "grad = 1 / √k", {
        size: 10.5,
        weight: 600,
        fill: BLUE,
      }),
      svgText(gx + gw / 2 + 12, gy + gh + 32, "Measured distance x / m", {
        size: 11,
        weight: 600,
        anchor: "middle",
      }),
      svgRawText(
        gx - 12,
        gy + gh / 2,
        '1 / √C<tspan dy="3" font-size="8.5">corr</tspan><tspan dy="-3"> (s¹/²)</tspan>',
        {
          size: 10.5,
          weight: 600,
          anchor: "middle",
          rotate: `rotate(-90 ${gx - 12} ${f2(gy + gh / 2)})`,
        },
      ),
    );

    return {
      visualFamily: "al-prac-rp12-gamma-inverse-square",
      svgMarkup: wrapSvg(
        "Required Practical 12 gamma inverse-square apparatus and one over square root corrected count rate graph",
        defs,
        parts.join(""),
      ),
      rendererVersion: ALEVEL_PRACTICALS_RENDERER_VERSION,
      publicNumbers: [],
      publicLabels: [],
    };
  },
};

/* -------------------------------------------------------------------------- */
/*  Exported Plugin Registry Array (14 Plugins)                               */
/* -------------------------------------------------------------------------- */

export const ALEVEL_PRACTICALS_PLUGINS: readonly DomainKindPlugin[] = [
  WORST_FIT_ERROR_BARS_PLUGIN,
  INSTRUMENTS_CRO_PLUGIN,
  LOG_LINEARIZATION_PLUGIN,
  RP1_STATIONARY_STRING_PLUGIN,
  RP2_SLITS_GRATING_PLUGIN,
  RP3_FREEFALL_G_PLUGIN,
  RP4_YOUNG_MODULUS_PLUGIN,
  RP5_RP6_RESISTIVITY_EMF_PLUGIN,
  RP7_SHM_PENDULUM_SPRING_PLUGIN,
  RP8_BOYLE_CHARLES_PLUGIN,
  RP9_CAPACITOR_RC_LOG_PLUGIN,
  RP10_MAG_FORCE_BALANCE_PLUGIN,
  RP11_SEARCH_COIL_HALL_PLUGIN,
  RP12_GAMMA_INVERSE_SQUARE_PLUGIN,
];

export function getAlevelPracticalsPlugin(
  kind: AlevelPracticalsScenarioKind,
): DomainKindPlugin {
  const found = ALEVEL_PRACTICALS_PLUGINS.find((p) => p.kind === kind);
  if (!found) {
    throw new Error(`Unknown A-Level practicals plugin kind: ${kind}`);
  }
  return found;
}

export type AlevelPracticalsFieldSpec = DomainKindFieldSpec;

export { fmtVal as formatAlevelPracticalValue, toSub, toSup };
