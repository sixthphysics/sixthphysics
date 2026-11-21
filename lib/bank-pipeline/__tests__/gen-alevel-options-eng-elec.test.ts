import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { MathText } from "@/components/sixthphysics/math-text";
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
  ALEVEL_OPT_EE_DEFAULT_BASE_SEED,
  ALEVEL_OPT_EE_ID_PREFIX,
  generateAlevelOptionsEngElecCandidates,
} from "@/lib/bank-pipeline/generators/alevel-options-eng-elec";
import {
  ALEVEL_OPTIONS_ENG_ELEC_PLUGINS,
  ALEVEL_OPTIONS_ENG_ELEC_SCENARIO_KINDS,
} from "@/lib/visuals/alevel-options-eng-elec";

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

function renderMathHtml(text: string): string {
  return renderToStaticMarkup(React.createElement(MathText, { text }));
}

describe("UK A-Level Options 3.11 Engineering & 3.13 Electronics plugins and generator (Spec D)", () => {
  let candidates: CandidateQuestionInput[];
  let tempDir: string;

  beforeAll(() => {
    resetDomainRegistryToDefaults();
    candidates = generateAlevelOptionsEngElecCandidates();
  });

  afterAll(() => {
    resetDomainRegistryToDefaults();
  });

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "gen-al-optee-test-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("validates, solves, and renders all 14 Spec D DomainKindPlugins on every probeSpec with clean 640x360 SVG and zero raw _/^", () => {
    expect(ALEVEL_OPTIONS_ENG_ELEC_PLUGINS).toHaveLength(14);
    expect(ALEVEL_OPTIONS_ENG_ELEC_PLUGINS.map((p) => p.kind)).toEqual([
      ...ALEVEL_OPTIONS_ENG_ELEC_SCENARIO_KINDS,
    ]);

    for (const plugin of ALEVEL_OPTIONS_ENG_ELEC_PLUGINS) {
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
        expect(rendered!.svgMarkup).toContain('fill="#ffffff"');

        const sanity = inspectSvgSanity(rendered!.svgMarkup);
        expect(sanity.valid).toBe(true);
        expect(sanity.issues).toEqual([]);

        const textNodes = extractSvgTextContents(rendered!.svgMarkup);
        expect(textNodes.length).toBeGreaterThan(0);
        for (const txt of textNodes) {
          expect(txt).not.toMatch(/[_^]/);
        }
      }

      // Reject incomplete/invalid specs
      const badCheck = plugin.validate({ kind: plugin.kind });
      expect(badCheck.valid).toBe(false);
      expect(badCheck.issues.length).toBeGreaterThan(0);
    }
  });

  it("passes 100% of generated candidates through verifyCandidateWithGate, shard ingestion, Qwen trace validation, and zero split contamination", () => {
    expect(candidates.length).toBeGreaterThanOrEqual(155);
    expect(candidates.length).toBeLessThanOrEqual(180);

    const idSet = new Set<string>();
    const seedSet = new Set<number>();
    const svgOutputs: string[] = [];

    for (const cand of candidates) {
      expect(cand.id.startsWith(`${ALEVEL_OPT_EE_ID_PREFIX}-`)).toBe(true);
      expect(idSet.has(cand.id)).toBe(false);
      idSet.add(cand.id);

      expect(cand.seed).toBeGreaterThanOrEqual(ALEVEL_OPT_EE_DEFAULT_BASE_SEED);
      expect(cand.seed).toBeLessThan(78_000_000);
      expect(seedSet.has(cand.seed)).toBe(false);
      seedSet.add(cand.seed);

      expect(cand.questionStyle).toBeTruthy();
      expect(
        cand.templateArchetype.startsWith("al-opt-eng-") ||
          cand.templateArchetype.startsWith("al-opt-elec-"),
      ).toBe(true);

      // Zero digits in pre-solve questionPlan
      expect(JSON.stringify(cand.questionPlan)).not.toMatch(/\d/);

      const result = verifyCandidateWithGate(cand);
      if (!result.evaluation.valid) {
        throw new Error(
          `Gate rejected "${cand.id}": ${JSON.stringify(result.evaluation.issues, null, 2)}`,
        );
      }
      expect(result.evaluation.valid).toBe(true);
      expect(result.effectiveSvgMarkup).toBeDefined();
      svgOutputs.push(result.effectiveSvgMarkup!);
    }

    expect(svgOutputs).toHaveLength(candidates.length);
    for (const svg of svgOutputs) {
      const sanity = inspectSvgSanity(svg);
      expect(sanity.valid).toBe(true);
      expect(svg).toContain('fill="#ffffff"');
      for (const txt of extractSvgTextContents(svg)) {
        expect(txt).not.toMatch(/[_^]/);
      }
    }

    // Full shard ingestion (checks near-duplicate stems & Qwen distillation traces)
    const summary = ingestCandidatesIntoShard({
      shardId: "alevel-v3-opt-eng-elec-test",
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
      const traceCheck = validateQwenDistillationTrace(rec.distillationTrace);
      expect(traceCheck).toEqual({ valid: true, issues: [] });
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

  it("satisfies Spec D coverage quotas across 3.11 Engineering & 3.13 Electronics, 6-mark LoR rubric contract, qualitative MCQs, g = 9.81, and <= 12/family cap", () => {
    const engItems = candidates.filter(
      (c) => c.syllabi[0]?.subtopicId === "alevel-3-11-engineering-physics",
    );
    const elecItems = candidates.filter(
      (c) => c.syllabi[0]?.subtopicId === "alevel-3-13-electronics",
    );
    const engRotKinds = new Set([
      "al-opt-eng-moment-inertia-suvat",
      "al-opt-eng-flywheel-kers",
      "al-opt-eng-angular-momentum-impulse",
    ]);
    const engRotMcqs = engItems.filter(
      (c) => c.format === "mcq" && engRotKinds.has(c.templateArchetype),
    );
    const engRotStruct = engItems.filter(
      (c) => c.format === "structured" && engRotKinds.has(c.templateArchetype),
    );
    const elecMcqs = elecItems.filter((c) => c.format === "mcq");
    const elecStruct = elecItems.filter((c) => c.format === "structured");

    const pureQualMcqs = candidates.filter(
      (c) => c.format === "mcq" && c.targetMode === "qualitative",
    );
    const engLors = engItems.filter(
      (c) =>
        c.format === "structured" &&
        c.parts?.some((p) => p.marks === 6 && p.targetMode === "qualitative"),
    );
    const elecLors = elecItems.filter(
      (c) =>
        c.format === "structured" &&
        c.parts?.some((p) => p.marks === 6 && p.targetMode === "qualitative"),
    );

    expect(engItems.length).toBeGreaterThanOrEqual(60);
    expect(elecItems.length).toBeGreaterThanOrEqual(85);
    expect(engRotMcqs.length).toBeGreaterThanOrEqual(15);
    expect(engRotStruct.length).toBeGreaterThanOrEqual(10);
    expect(elecMcqs.length).toBeGreaterThanOrEqual(45);
    expect(elecStruct.length).toBeGreaterThanOrEqual(25);
    expect(pureQualMcqs.length).toBeGreaterThanOrEqual(35);
    expect(engLors.length).toBeGreaterThanOrEqual(2);
    expect(elecLors.length).toBeGreaterThanOrEqual(2);

    // Every single 6-mark LoR enforces marks===6, targetMode==="qualitative", solver string key, and 6x1 L1/L2/L3 criteria
    for (const lor of [...engLors, ...elecLors]) {
      const lorPart = lor.parts!.find((p) => p.marks === 6)!;
      expect(lorPart.targetMode).toBe("qualitative");
      expect(lorPart.targetQuantityKey).toBeTruthy();
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

    // Verify exact Y13 syllabus tagging and <= 12 per plugin family cap
    const countsByKind = new Map<string, number>();
    for (const cand of candidates) {
      expect(cand.syllabi).toHaveLength(1);
      const tag = cand.syllabi[0];
      expect(tag.syllabus).toBe("alevel");
      expect(tag.level).toBe("Y13");
      expect(tag.topicId).toBe("alevel-options-9-13");
      expect([
        "alevel-3-11-engineering-physics",
        "alevel-3-13-electronics",
      ]).toContain(tag.subtopicId);
      countsByKind.set(
        cand.templateArchetype,
        (countsByKind.get(cand.templateArchetype) ?? 0) + 1,
      );
    }
    expect(countsByKind.size).toBe(14);
    for (const [, count] of countsByKind) {
      expect(count).toBeLessThanOrEqual(12);
      expect(count).toBeGreaterThanOrEqual(10);
    }

    // Confirm g = 9.81 m s^-2 on gravitational KERS hill-climb items (never IB 9.8)
    const gravItems = candidates.filter((c) => /9\.81/.test(c.stem));
    expect(gravItems.length).toBeGreaterThanOrEqual(5);
    for (const cand of candidates) {
      expect(cand.stem).not.toMatch(/g\s*=\s*9\.8(?!1)/);
    }

    // Determinism check
    expect(generateAlevelOptionsEngElecCandidates()).toEqual(candidates);
  });

  it("renders every text field across all generated candidates through <MathText /> with zero katex-error and zero stray _/^", () => {
    const failures: string[] = [];
    for (const item of candidates) {
      const fields: Array<{ label: string; value: string | undefined }> = [
        { label: "stem", value: item.stem },
        { label: "workedSolution", value: item.workedSolution },
      ];
      item.options?.forEach((opt, i) => {
        fields.push({ label: `options[${i}].text`, value: opt.text });
        fields.push({
          label: `options[${i}].distractorRationale`,
          value: opt.distractorRationale,
        });
      });
      item.parts?.forEach((part, i) => {
        fields.push({ label: `parts[${i}].prompt`, value: part.prompt });
        fields.push({
          label: `parts[${i}].expectedAnswer`,
          value: part.expectedAnswer,
        });
        part.workingSteps.forEach((step, j) => {
          fields.push({ label: `parts[${i}].workingSteps[${j}]`, value: step });
        });
      });
      item.markScheme.forEach((ms, i) => {
        fields.push({ label: `markScheme[${i}].criterion`, value: ms.criterion });
      });

      for (const f of fields) {
        if (!f.value) continue;
        const html = renderMathHtml(f.value);
        if (html.includes("katex-error")) {
          failures.push(`${item.id} (${f.label}): katex-error in "${f.value}"`);
        }
        if (/\\(?:frac|dfrac|tfrac|sqrt)\b/.test(html)) {
          failures.push(`${item.id} (${f.label}): raw \\frac/\\sqrt leak`);
        }
        const visibleText = html.replace(/<[^>]+>/g, "");
        if (visibleText.includes("_") || visibleText.includes("^")) {
          failures.push(
            `${item.id} (${f.label}): unformatted _/^ in visible text "${visibleText}"`,
          );
        }
        if (visibleText.includes("$") || /\$\{/.test(f.value)) {
          failures.push(
            `${item.id} (${f.label}): stray literal $ or uninterpolated template in "${f.value}"`,
          );
        }
        if (/\\(?:mathrm|text|Delta|Omega|gamma|eta|omega|alpha|theta|bar|overline)\b/.test(visibleText)) {
          failures.push(
            `${item.id} (${f.label}): raw LaTeX command leaked into visible text "${visibleText}"`,
          );
        }
      }
    }
    expect(failures).toEqual([]);
  });
});
