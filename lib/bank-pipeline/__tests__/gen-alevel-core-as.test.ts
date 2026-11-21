import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { MathText } from "@/components/sixthphysics/math-text";
import { prepareSvgFigure } from "@/components/sixthphysics/svg-figure-plate";
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
  ALEVEL_CORE_AS_DEFAULT_BASE_SEED,
  ALEVEL_CORE_AS_ID_PREFIX,
  generateAlevelCoreAsCandidates,
} from "@/lib/bank-pipeline/generators/alevel-core-as";
import {
  ALEVEL_CORE_AS_PLUGINS,
  ALEVEL_CORE_AS_SCENARIO_KINDS,
  AQA_G_MS2,
} from "@/lib/visuals/alevel-core-as";

function extractSvgTextNodes(svgMarkup: string): string[] {
  return (svgMarkup.match(/<text\b[\s\S]*?<\/text>/g) ?? []).map((node) =>
    node
      .replace(/<[^>]+>/g, "")
      .replace(/&#8203;/g, "")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'"),
  );
}

const EXPECTED_AS_SUBTOPICS = [
  "alevel-3-1-si-uncertainties-estimation",
  "alevel-3-2-1-particles-quarks",
  "alevel-3-2-2-quantum-phenomena",
  "alevel-3-3-1-progressive-stationary-waves",
  "alevel-3-3-2-refraction-diffraction-interference",
  "alevel-3-4-1-force-energy-momentum",
  "alevel-3-4-2-materials-young-modulus",
  "alevel-3-5-1-current-electricity",
] as const;

describe("A-Level AS Core (Sections 3.1-3.5) plugins, visuals, and generator", () => {
  let candidates: CandidateQuestionInput[];
  let tempDir: string;

  beforeAll(() => {
    resetDomainRegistryToDefaults();
    candidates = generateAlevelCoreAsCandidates();
  });

  afterAll(() => {
    resetDomainRegistryToDefaults();
  });

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "gen-alevel-core-as-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("validates, solves, and renders all 15 al-as-* DomainKindPlugins on every probeSpec with clean XML and zero raw _/^ in SVG text", () => {
    expect(ALEVEL_CORE_AS_PLUGINS).toHaveLength(15);
    expect(ALEVEL_CORE_AS_PLUGINS.map((p) => p.kind)).toEqual([
      ...ALEVEL_CORE_AS_SCENARIO_KINDS,
    ]);

    for (const plugin of ALEVEL_CORE_AS_PLUGINS) {
      expect(plugin.kind.startsWith("al-as-")).toBe(true);
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
        expect(rendered!.svgMarkup).toContain('fill="#ffffff"');
        expect(rendered!.svgMarkup).toContain('viewBox="0 0 640 360"');

        const sanity = inspectSvgSanity(rendered!.svgMarkup);
        expect(sanity.valid).toBe(true);
        expect(sanity.issues).toEqual([]);

        const textNodes = extractSvgTextNodes(rendered!.svgMarkup);
        expect(textNodes.length).toBeGreaterThan(0);
        for (const txt of textNodes) {
          expect(txt).not.toMatch(/[_^]/);
        }

        const prepared = prepareSvgFigure(rendered!.svgMarkup, plugin.kind);
        expect(inspectSvgSanity(prepared).valid).toBe(true);
      }

      // Reject incomplete/invalid spec cleanly
      const badCheck = plugin.validate({ kind: plugin.kind });
      expect(badCheck.valid).toBe(false);
      expect(badCheck.issues.length).toBeGreaterThan(0);
    }
  });

  it("passes 100% of generated candidates through verifyCandidateWithGate, shard ingestion, zero SVG leaks, and valid distillation traces", () => {
    expect(candidates.length).toBeGreaterThanOrEqual(165);
    expect(candidates.length).toBeLessThanOrEqual(180);

    const idSet = new Set<string>();
    const seedSet = new Set<number>();
    const familyCounts = new Map<string, number>();
    let renderedSvgCount = 0;

    for (const cand of candidates) {
      expect(cand.id.startsWith(`${ALEVEL_CORE_AS_ID_PREFIX}-`)).toBe(true);
      expect(idSet.has(cand.id)).toBe(false);
      idSet.add(cand.id);

      expect(cand.seed).toBeGreaterThanOrEqual(ALEVEL_CORE_AS_DEFAULT_BASE_SEED);
      expect(cand.seed).toBeLessThan(75_000_000);
      expect(seedSet.has(cand.seed)).toBe(false);
      seedSet.add(cand.seed);

      expect(cand.templateArchetype.startsWith("al-as-")).toBe(true);
      expect(cand.questionStyle).toBeDefined();
      familyCounts.set(
        cand.templateArchetype,
        (familyCounts.get(cand.templateArchetype) ?? 0) + 1,
      );

      // Zero digits in pre-solve questionPlan
      expect(JSON.stringify(cand.questionPlan)).not.toMatch(/\d/);

      const result = verifyCandidateWithGate(cand);
      if (!result.evaluation.valid) {
        throw new Error(
          `Gate rejected "${cand.id}": ${JSON.stringify(result.evaluation.issues, null, 2)}`,
        );
      }
      expect(result.evaluation.valid).toBe(true);

      if (result.effectiveSvgMarkup) {
        renderedSvgCount += 1;
        const sanity = inspectSvgSanity(result.effectiveSvgMarkup);
        expect(sanity.valid).toBe(true);
        expect(result.effectiveSvgMarkup).toContain('fill="#ffffff"');
        for (const txt of extractSvgTextNodes(result.effectiveSvgMarkup)) {
          expect(txt).not.toMatch(/[_^]/);
        }
      }
    }

    expect(renderedSvgCount).toBe(candidates.length);
    // Every family <= 12 so 100% surface live under web cap
    expect(familyCounts.size).toBe(15);
    for (const [, count] of familyCounts) {
      expect(count).toBeGreaterThanOrEqual(10);
      expect(count).toBeLessThanOrEqual(12);
    }

    // Full shard ingestion checks near-duplicate stems & distillation traces
    const summary = ingestCandidatesIntoShard({
      shardId: "alevel-v3-core-as-test",
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

  it("covers all 8 AS subtopics, >= 65 pure qualitative MCQs, >= 6 distinct 6-mark LoRs, g = 9.81, and zero KaTeX rendering errors", () => {
    expect(AQA_G_MS2).toBe(9.81);

    const seenSubtopics = new Set<string>();
    const pureQualMcqs = candidates.filter(
      (c) => c.format === "mcq" && c.targetMode === "qualitative",
    );
    const lorParts: Array<{ id: string; archetype: string; marks: number }> = [];

    for (const cand of candidates) {
      expect(cand.syllabi).toHaveLength(1);
      const tag = cand.syllabi[0];
      expect(tag.syllabus).toBe("alevel");
      expect(tag.level).toBe("Y12");
      expect(tag.subtopicId).toBeTruthy();
      seenSubtopics.add(tag.subtopicId!);

      for (const part of cand.parts ?? []) {
        if (part.targetQuantityKey) {
          expect(cand.hiddenQuantities).toContain(part.targetQuantityKey);
        }
        if (part.marks === 6 && part.targetMode === "qualitative") {
          expect(part.targetQuantityKey).toBeTruthy();
          const partCriteria = cand.markScheme.filter(
            (m) => m.partId === part.partId,
          );
          expect(partCriteria).toHaveLength(6);
          expect(partCriteria.map((m) => m.code)).toEqual([
            "L1a",
            "L1b",
            "L2a",
            "L2b",
            "L3a",
            "L3b",
          ]);
          for (const crit of partCriteria) {
            expect(crit.marks).toBe(1);
          }
          lorParts.push({
            id: cand.id,
            archetype: cand.templateArchetype,
            marks: part.marks,
          });
        }
      }

      // Check g = 9.81 whenever g appears numerically in prose
      const allTextFields = [
        cand.stem,
        cand.workedSolution,
        ...(cand.options?.flatMap((o) => [o.text, o.distractorRationale ?? ""]) ?? []),
        ...(cand.parts?.flatMap((p) => [p.prompt, p.expectedAnswer, ...p.workingSteps]) ?? []),
        ...cand.markScheme.map((m) => m.criterion),
      ];
      for (const text of allTextFields) {
        expect(text).not.toMatch(/\bg\s*=\s*9\.8(?!1)\b/);
        expect(text).not.toMatch(/\bg\s*=\s*10(?:\.0)?\b/);
        expect(text).not.toContain("${");
        // Every inline LaTeX delimiter `$` must be balanced
        const dollarCount = (text.match(/(?<!\\)\$/g) ?? []).length;
        expect(dollarCount % 2).toBe(0);
        const html = renderToStaticMarkup(React.createElement(MathText, { text }));
        expect(html).not.toContain("katex-error");
        expect(html).not.toContain("$");
        expect(html).not.toMatch(/\\(?:frac|sqrt|mathrm|text)\b/);
      }
    }

    for (const subtopic of EXPECTED_AS_SUBTOPICS) {
      expect(seenSubtopics.has(subtopic)).toBe(true);
    }

    expect(pureQualMcqs.length).toBeGreaterThanOrEqual(65);
    const distinctLorArchetypes = new Set(lorParts.map((p) => p.archetype));
    expect(distinctLorArchetypes.size).toBeGreaterThanOrEqual(6);
    expect(lorParts.length).toBeGreaterThanOrEqual(12);

    // Determinism check
    expect(generateAlevelCoreAsCandidates()).toEqual(candidates);
  });
});
