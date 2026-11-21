import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { MathText } from "@/components/sixthphysics/math-text";
import { prepareSvgFigureParts } from "@/components/sixthphysics/svg-figure-plate";
import {
  CandidateQuestionInput,
  getDomainAdapter,
  ingestCandidatesIntoShard,
  inspectSvgSanity,
  resetDomainRegistryToDefaults,
  validateQwenDistillationTrace,
  verifyCandidateWithGate,
  verifyZeroSplitContamination,
} from "@/lib/bank-pipeline";
import {
  ALEVEL_OPT_AM_DEFAULT_BASE_SEED,
  ALEVEL_OPT_AM_ID_PREFIX,
  generateAlevelOptionsAstromedCandidates,
} from "@/lib/bank-pipeline/generators/alevel-options-astromed";
import {
  ALEVEL_GRAVITY_MS2,
  ALEVEL_OPTIONS_ASTROMED_KINDS,
  ALEVEL_OPTIONS_ASTROMED_PLUGINS,
} from "@/lib/visuals/alevel-options-astromed";

function extractSvgTextContents(svgMarkup: string): string[] {
  return (svgMarkup.match(/<text\b[\s\S]*?<\/text>/g) ?? []).map((node) =>
    node
      .replace(/<[^>]+>/g, "")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'"),
  );
}

function renderMathTextHtml(text: string): string {
  return renderToStaticMarkup(React.createElement(MathText, { text }));
}

describe("A-Level Options 3.9 Astrophysics, 3.10 Medical Physics & 3.12 Turning Points (Spec C)", () => {
  let candidates: CandidateQuestionInput[];
  let tempDir: string;

  beforeAll(() => {
    resetDomainRegistryToDefaults();
    candidates = generateAlevelOptionsAstromedCandidates();
  });

  afterAll(() => {
    resetDomainRegistryToDefaults();
  });

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "gen-alevel-optam-test-"));
  });

  afterEach(() => {
    if (tempDir) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("validates, solves, and renders all 14 Spec C DomainKindPlugins on every probeSpec with clean 640x360 XML and zero raw _/^ in SVG text", () => {
    expect(ALEVEL_OPTIONS_ASTROMED_PLUGINS).toHaveLength(14);
    expect(ALEVEL_OPTIONS_ASTROMED_PLUGINS.map((p) => p.kind)).toEqual([
      ...ALEVEL_OPTIONS_ASTROMED_KINDS,
    ]);
    expect(ALEVEL_GRAVITY_MS2).toBe(9.81);

    for (const plugin of ALEVEL_OPTIONS_ASTROMED_PLUGINS) {
      expect(plugin.probeSpecs.length).toBeGreaterThanOrEqual(2);
      const adapter = getDomainAdapter(plugin.domain);
      expect(adapter.supportedScenarioKinds).toContain(plugin.kind);

      for (const spec of plugin.probeSpecs) {
        const validation = adapter.validateScenario(spec);
        expect(validation).toEqual({ valid: true, issues: [] });

        const solved = adapter.solveScenario(spec);
        expect(Object.keys(solved.quantities).length).toBeGreaterThan(0);
        for (const val of Object.values(solved.quantities)) {
          if (typeof val === "number") {
            expect(Number.isFinite(val)).toBe(true);
          }
        }

        expect(plugin.renderSvg).toBeDefined();
        const rendered = adapter.renderSvg?.(spec, { hiddenQuantities: [] });
        expect(rendered).toBeDefined();
        expect(rendered!.svgMarkup).toContain('viewBox="0 0 640 360"');
        expect(rendered!.svgMarkup).toContain(
          '<rect width="100%" height="100%" fill="#ffffff"/>',
        );

        const sanity = inspectSvgSanity(rendered!.svgMarkup);
        expect(sanity.valid).toBe(true);
        expect(sanity.issues).toEqual([]);

        const textNodes = extractSvgTextContents(rendered!.svgMarkup);
        expect(textNodes.length).toBeGreaterThan(0);
        for (const txt of textNodes) {
          expect(txt).not.toMatch(/[_^]/);
        }

        // Verify SvgFigurePlate typesetting + auto-framing succeeds cleanly
        const plateParts = prepareSvgFigureParts(
          rendered!.svgMarkup,
          `probe-${plugin.kind}`,
        );
        expect(plateParts.markup).toContain("<svg");
        for (const txt of extractSvgTextContents(plateParts.markup)) {
          expect(txt).not.toMatch(/[_^]/);
        }
      }

      // Reject incomplete/invalid spec
      const invalidCheck = plugin.validate({ kind: plugin.kind });
      expect(invalidCheck.valid).toBe(false);
      expect(invalidCheck.issues.length).toBeGreaterThan(0);
    }
  });

  it("enforces exact AQA Data Sheet v1.5 equations (Rayleigh lambda/D, m-M=5lg(d/10), H=65, I0=1e-12, 2d=c dt, g=9.81, E_k=(gamma-1)m0c^2)", () => {
    const resPlugin = ALEVEL_OPTIONS_ASTROMED_PLUGINS.find(
      (p) => p.kind === "al-opt-astro-resolution-ccd",
    )!;
    const resSolved = resPlugin.solve({
      kind: "al-opt-astro-resolution-ccd",
      mode: "airy-rayleigh",
      wavelengthM: 5.0e-7,
      apertureDiameterM: 2.0,
    });
    // Strict AQA theta ≈ lambda / D = 2.5e-7 rad (NOT 1.22 * 2.5e-7)
    expect(resSolved.quantities.rayleighAngleRad).toBeCloseTo(2.5e-7, 12);

    const magPlugin = ALEVEL_OPTIONS_ASTROMED_PLUGINS.find(
      (p) => p.kind === "al-opt-astro-magnitude-supernovae",
    )!;
    const magSolved = magPlugin.solve({
      kind: "al-opt-astro-magnitude-supernovae",
      mode: "supernova-lightcurve",
      apparentMagnitude: 15.7,
      absoluteMagnitude: -19.3,
    });
    expect(magSolved.quantities.distancePc).toBeCloseTo(1e8, 2);
    expect(magSolved.quantities.hubbleConstantKmSMpc).toBe(65);

    const eyePlugin = ALEVEL_OPTIONS_ASTROMED_PLUGINS.find(
      (p) => p.kind === "al-opt-med-eye-defects",
    )!;
    const myoSolved = eyePlugin.solve({
      kind: "al-opt-med-eye-defects",
      mode: "myopia",
      unaidedFarPointM: 0.5,
    });
    expect(myoSolved.quantities.correctivePowerD).toBeCloseTo(-2.0, 6);

    const hypSolved = eyePlugin.solve({
      kind: "al-opt-med-eye-defects",
      mode: "hypermetropia",
      unaidedNearPointM: 0.5,
      targetNearPointM: 0.25,
    });
    expect(hypSolved.quantities.correctivePowerD).toBeCloseTo(2.0, 6);

    const millikanPlugin = ALEVEL_OPTIONS_ASTROMED_PLUGINS.find(
      (p) => p.kind === "al-opt-tp-millikan-oildrop",
    )!;
    const milSolved = millikanPlugin.solve(millikanPlugin.probeSpecs[0]);
    expect(milSolved.quantities.gravityMs2).toBe(9.81);

    const relPlugin = ALEVEL_OPTIONS_ASTROMED_PLUGINS.find(
      (p) => p.kind === "al-opt-tp-michelson-relativity",
    )!;
    const relSolved = relPlugin.solve({
      kind: "al-opt-tp-michelson-relativity",
      mode: "bertozzi",
      speedFractionC: 0.6,
    });
    // gamma = 1 / 0.8 = 1.25 => E_k = 0.25 * m_0 c^2 (NOT 0.5 * 1.25 * 0.36 = 0.225 m_0 c^2)
    expect(relSolved.quantities.lorentzFactor).toBeCloseTo(1.25, 8);
    expect(
      (relSolved.quantities.relativisticKeJ as number) /
        (relSolved.quantities.restEnergyJ as number),
    ).toBeCloseTo(0.25, 8);
  });

  it("passes 100% of generated candidates through verifyCandidateWithGate, shard ingestion, zero leaks, and valid distillation traces", () => {
    expect(candidates.length).toBeGreaterThanOrEqual(155);
    expect(candidates.length).toBeLessThanOrEqual(180);

    const idSet = new Set<string>();
    const seedSet = new Set<number>();
    let svgCount = 0;

    for (const cand of candidates) {
      expect(cand.id.startsWith(`${ALEVEL_OPT_AM_ID_PREFIX}-`)).toBe(true);
      expect(idSet.has(cand.id)).toBe(false);
      idSet.add(cand.id);

      expect(cand.seed).toBeGreaterThanOrEqual(ALEVEL_OPT_AM_DEFAULT_BASE_SEED);
      expect(cand.seed).toBeLessThan(ALEVEL_OPT_AM_DEFAULT_BASE_SEED + 1_000_000);
      expect(seedSet.has(cand.seed)).toBe(false);
      seedSet.add(cand.seed);

      // Zero digits inside pre-solve questionPlan
      expect(JSON.stringify(cand.questionPlan)).not.toMatch(/\d/);

      // Required metadata
      expect(cand.questionStyle).toBeTruthy();
      expect(cand.syllabi).toHaveLength(1);
      expect(cand.syllabi[0].syllabus).toBe("alevel");
      expect(cand.syllabi[0].level).toBe("Y13");
      expect(cand.syllabi[0].topicId).toBe("alevel-options-9-13");
      expect(cand.syllabi[0].subtopicId).toMatch(
        /^alevel-3-(?:9-astrophysics|10-medical-physics|12-turning-points)$/,
      );

      const res = verifyCandidateWithGate(cand);
      if (!res.evaluation.valid) {
        throw new Error(
          `Gate rejected "${cand.id}": ${JSON.stringify(res.evaluation.issues, null, 2)}`,
        );
      }
      expect(res.evaluation.valid).toBe(true);

      if (res.effectiveSvgMarkup) {
        svgCount += 1;
        const sanity = inspectSvgSanity(res.effectiveSvgMarkup);
        expect(sanity.valid).toBe(true);
        expect(res.effectiveSvgMarkup).toContain(
          '<rect width="100%" height="100%" fill="#ffffff"/>',
        );
        for (const txt of extractSvgTextContents(res.effectiveSvgMarkup)) {
          expect(txt).not.toMatch(/[_^]/);
        }
      }
    }

    expect(svgCount).toBe(candidates.length);

    // Shard ingestion checks near-duplicate stems & builds distillation traces
    const summary = ingestCandidatesIntoShard({
      shardId: "alevel-v3-opt-am-test",
      shardsDir: tempDir,
      candidates,
    });
    expect(summary.rejectedCount).toBe(0);
    expect(summary.ingestedCount).toBe(candidates.length);

    const shardLines = fs
      .readFileSync(summary.shardFilePath, "utf8")
      .trim()
      .split("\n")
      .map(
        (line) =>
          JSON.parse(line) as {
            bankItem: {
              id: string;
              familyGroupKey: string;
              provenance: {
                conceptId: string;
                templateArchetype: string;
                split: "train" | "val" | "test";
                stemFingerprint: string;
                sourceParentId?: string;
              };
            };
            distillationTrace: Parameters<
              typeof validateQwenDistillationTrace
            >[0];
          },
      );

    expect(shardLines).toHaveLength(candidates.length);
    for (const rec of shardLines) {
      expect(validateQwenDistillationTrace(rec.distillationTrace)).toEqual({
        valid: true,
        issues: [],
      });
    }

    const splitReport = verifyZeroSplitContamination(
      shardLines.map((r) => ({
        id: r.bankItem.id,
        familyGroupKey: r.bankItem.familyGroupKey,
        split: r.bankItem.provenance.split,
        conceptId: r.bankItem.provenance.conceptId,
        templateArchetype: r.bankItem.provenance.templateArchetype,
        stemFingerprint: r.bankItem.provenance.stemFingerprint,
        sourceParentId: r.bankItem.provenance.sourceParentId,
      })),
    );
    expect(splitReport.valid).toBe(true);
    expect(splitReport.violations).toEqual([]);
  });

  it("covers all 14 kinds (<= 12/family cap), >= 35 pure qualitative MCQs, authentic 6-mark LoRs across 3.9, 3.10, 3.12, g=9.81, and 0 KaTeX errors", () => {
    const bySubtopic = new Map<string, CandidateQuestionInput[]>();
    const byKind = new Map<string, number>();

    for (const cand of candidates) {
      const sub = cand.syllabi[0].subtopicId!;
      bySubtopic.set(sub, [...(bySubtopic.get(sub) ?? []), cand]);
      const k = String(cand.scenarioSpec.kind);
      byKind.set(k, (byKind.get(k) ?? 0) + 1);
    }

    // All 14 kinds covered with <= 12 per archetype so 100% surface live
    for (const kind of ALEVEL_OPTIONS_ASTROMED_KINDS) {
      const count = byKind.get(kind) ?? 0;
      expect(count).toBeGreaterThanOrEqual(11);
      expect(count).toBeLessThanOrEqual(12);
    }

    // Every option (3.9, 3.10, 3.12) has MCQs, Structured, AND >= 1 authentic 6-mark LoR
    for (const sub of [
      "alevel-3-9-astrophysics",
      "alevel-3-10-medical-physics",
      "alevel-3-12-turning-points",
    ]) {
      const list = bySubtopic.get(sub) ?? [];
      expect(list.length).toBeGreaterThanOrEqual(44);
      const mcqs = list.filter((c) => c.format === "mcq");
      const structs = list.filter((c) => c.format === "structured");
      const lors = structs.filter((c) =>
        (c.parts ?? []).some(
          (p) => p.marks === 6 && p.targetMode === "qualitative" && Boolean(p.targetQuantityKey),
        ),
      );
      expect(mcqs.length).toBeGreaterThanOrEqual(24);
      expect(structs.length).toBeGreaterThanOrEqual(16);
      expect(lors.length).toBeGreaterThanOrEqual(4);

      for (const lor of lors) {
        const lorPart = lor.parts!.find((p) => p.marks === 6)!;
        const partCriteria = lor.markScheme.filter((m) => m.partId === lorPart.partId);
        expect(partCriteria).toHaveLength(6);
        expect(partCriteria.map((m) => m.code)).toEqual([
          "L1",
          "L1",
          "L2",
          "L2",
          "L3",
          "L3",
        ]);
        expect(partCriteria.every((m) => m.marks === 1)).toBe(true);
      }
    }

    // Pure qualitative MCQs quota >= 35
    const qualMcqs = candidates.filter(
      (c) => c.format === "mcq" && c.targetMode === "qualitative",
    );
    expect(qualMcqs.length).toBeGreaterThanOrEqual(35);

    // Millikan items explicitly reference g = 9.81
    const millikanCalc = candidates.filter(
      (c) =>
        c.scenarioSpec.kind === "al-opt-tp-millikan-oildrop" &&
        c.questionStyle !== "qualitative",
    );
    expect(millikanCalc.length).toBeGreaterThanOrEqual(6);
    expect(millikanCalc.some((c) => c.stem.includes("9.81"))).toBe(true);

    // Zero KaTeX errors or unformatted _ / ^ across EVERY text field of EVERY candidate
    const katexFailures: string[] = [];
    for (const cand of candidates) {
      const textFields: Array<[string, string | undefined]> = [
        ["stem", cand.stem],
        ["workedSolution", cand.workedSolution],
        ...(cand.options ?? []).flatMap((o, i): Array<[string, string | undefined]> => [
          [`options[${i}].text`, o.text],
          [`options[${i}].distractorRationale`, o.distractorRationale],
        ]),
        ...(cand.parts ?? []).flatMap((p, i): Array<[string, string | undefined]> => [
          [`parts[${i}].prompt`, p.prompt],
          [`parts[${i}].expectedAnswer`, p.expectedAnswer],
          ...p.workingSteps.map((s, j): [string, string] => [
            `parts[${i}].workingSteps[${j}]`,
            s,
          ]),
        ]),
        ...cand.markScheme.map((m, i): [string, string] => [
          `markScheme[${i}].criterion`,
          m.criterion,
        ]),
      ];

      for (const [label, value] of textFields) {
        if (!value) continue;
        const html = renderMathTextHtml(value);
        if (html.includes("katex-error")) {
          katexFailures.push(`${cand.id} (${label}): katex-error in "${value}"`);
        }
        if (/\\(?:frac|dfrac|tfrac|sqrt)\b/.test(html)) {
          katexFailures.push(`${cand.id} (${label}): raw macro leak`);
        }
        const visible = html.replace(/<[^>]+>/g, "");
        if (visible.includes("_") || visible.includes("^")) {
          katexFailures.push(
            `${cand.id} (${label}): unformatted _/^ in "${visible}"`,
          );
        }
        if (visible.includes("$") || /\\[A-Za-z]+/.test(visible)) {
          katexFailures.push(
            `${cand.id} (${label}): literal $ or raw LaTeX command in "${visible}"`,
          );
        }
      }
    }
    expect(katexFailures).toEqual([]);

    // Determinism check
    expect(generateAlevelOptionsAstromedCandidates()).toEqual(candidates);
  });
});
