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
  ALEVEL_CORE_A2_DEFAULT_BASE_SEED,
  ALEVEL_CORE_A2_ID_PREFIX,
  generateAlevelCoreA2Candidates,
} from "@/lib/bank-pipeline/generators/alevel-core-a2";
import { ALEVEL_PHYSICS_SYLLABUS } from "@/lib/constants/syllabi";
import {
  ALEVEL_CORE_A2_PLUGINS,
  ALEVEL_CORE_A2_SCENARIO_KINDS,
  ALEVEL_G_MS2,
} from "@/lib/visuals/alevel-core-a2";

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

describe("Stage-3 UK A-Level Core A2 (Sections 3.6–3.8) plugins and generator", () => {
  let candidates: CandidateQuestionInput[];
  let tempDir: string;

  beforeAll(() => {
    resetDomainRegistryToDefaults();
    candidates = generateAlevelCoreA2Candidates();
  });

  afterAll(() => {
    resetDomainRegistryToDefaults();
  });

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "gen-alevel-core-a2-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("validates, solves, and renders all 13 al-a2-* DomainKindPlugins on every probeSpec with clean XML and zero raw _/^ in SVG text", () => {
    expect(ALEVEL_G_MS2).toBe(9.81);
    expect(ALEVEL_CORE_A2_PLUGINS).toHaveLength(13);
    expect(ALEVEL_CORE_A2_PLUGINS.map((p) => p.kind)).toEqual([
      ...ALEVEL_CORE_A2_SCENARIO_KINDS,
    ]);

    for (const plugin of ALEVEL_CORE_A2_PLUGINS) {
      expect(plugin.kind.startsWith("al-a2-")).toBe(true);
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

      // Reject incomplete/invalid spec
      const badCheck = plugin.validate({ kind: plugin.kind });
      expect(badCheck.valid).toBe(false);
      expect(badCheck.issues.length).toBeGreaterThan(0);
    }
  });

  it("passes 100% of generated candidates through verifyCandidateWithGate, shard ingestion, distillation traces, and zero SVG leaks", () => {
    expect(candidates.length).toBeGreaterThanOrEqual(150);
    expect(candidates.length).toBeLessThanOrEqual(200);

    const idSet = new Set<string>();
    const seedSet = new Set<number>();
    let svgCount = 0;

    for (const cand of candidates) {
      expect(cand.id.startsWith(`${ALEVEL_CORE_A2_ID_PREFIX}-`)).toBe(true);
      expect(idSet.has(cand.id)).toBe(false);
      idSet.add(cand.id);

      expect(cand.seed).toBeGreaterThanOrEqual(ALEVEL_CORE_A2_DEFAULT_BASE_SEED);
      expect(cand.seed).toBeLessThan(76_000_000);
      expect(seedSet.has(cand.seed)).toBe(false);
      seedSet.add(cand.seed);

      expect(cand.templateArchetype.startsWith("al-a2-")).toBe(true);
      expect(cand.questionStyle).toBeDefined();

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
        svgCount += 1;
        const sanity = inspectSvgSanity(result.effectiveSvgMarkup);
        expect(sanity.valid).toBe(true);
        expect(result.effectiveSvgMarkup).toContain('fill="#ffffff"');
        for (const txt of extractSvgTextContents(result.effectiveSvgMarkup)) {
          expect(txt).not.toMatch(/[_^]/);
        }
      }
    }

    expect(svgCount).toBe(candidates.length);

    // Full shard ingestion (checks near-duplicate stem collision & Qwen distillation traces)
    const summary = ingestCandidatesIntoShard({
      shardId: "alevel-v3-core-a2-test",
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
            distillationTrace: Parameters<typeof validateQwenDistillationTrace>[0];
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

  it("covers all 7 A2 subtopics (3.6.1–3.8) at Y13, hits >=40 pure qual MCQs, >=6 distinct 6-mark LoR templates, uses g = 9.81, and renders with 0 KaTeX errors", () => {
    const validAlevelTopicIds = new Set(
      ALEVEL_PHYSICS_SYLLABUS.topics.map((t) => t.id),
    );
    const validAlevelSubtopicIds = new Set(
      ALEVEL_PHYSICS_SYLLABUS.topics.flatMap((t) => t.subtopics.map((s) => s.id)),
    );

    const expectedA2Subtopics = [
      "alevel-3-6-1-periodic-motion-shm",
      "alevel-3-6-2-thermal-physics",
      "alevel-3-7-2-gravitational-fields",
      "alevel-3-7-3-electric-fields",
      "alevel-3-7-4-capacitance",
      "alevel-3-7-5-magnetic-fields-induction-ac",
      "alevel-3-8-nuclear-decay-energy",
    ];
    const coveredSubtopics = new Set<string>();
    const coveredKinds = new Set<string>();

    for (const cand of candidates) {
      coveredKinds.add(String(cand.scenarioSpec.kind));
      const alTags = cand.syllabi.filter((s) => s.syllabus === "alevel");
      expect(alTags.length).toBeGreaterThanOrEqual(1);
      for (const tag of alTags) {
        expect(tag.level).toBe("Y13");
        expect(validAlevelTopicIds.has(tag.topicId)).toBe(true);
        expect(tag.subtopicId && validAlevelSubtopicIds.has(tag.subtopicId)).toBe(true);
        if (tag.subtopicId) coveredSubtopics.add(tag.subtopicId);
      }

      const ncukTags = cand.syllabi.filter((s) => s.syllabus === "ncuk");
      for (const tag of ncukTags) {
        expect(tag.level).toBe("IFY-S2");
      }

      // Gravity convention hygiene: never use IB g = 9.8 or g = 10
      const allText = [
        cand.stem,
        cand.workedSolution,
        ...(cand.options?.map((o) => `${o.text} ${o.distractorRationale ?? ""}`) ?? []),
        ...(cand.parts?.map((p) => `${p.prompt} ${p.expectedAnswer} ${p.workingSteps.join(" ")}`) ?? []),
        ...cand.markScheme.map((m) => m.criterion),
      ].join(" ");
      expect(allText).not.toMatch(/\bg\s*=\s*9\.8(?!1)\b/);
      expect(allText).not.toMatch(/\bg\s*=\s*10\b/);

      // KaTeX MathText rendering check: 0 katex-error across every text field
      const fieldsToRender: string[] = [
        cand.stem,
        cand.workedSolution,
        ...(cand.options?.map((o) => o.text) ?? []),
        ...(cand.parts?.flatMap((p) => [p.prompt, p.expectedAnswer]) ?? []),
        ...cand.markScheme.map((m) => m.criterion),
      ];
      for (const field of fieldsToRender) {
        const html = renderMathHtml(field);
        expect(html).not.toContain("katex-error");
        expect(html).not.toMatch(/\\(?:frac|sqrt)\b/);
      }
    }

    for (const sub of expectedA2Subtopics) {
      expect(coveredSubtopics.has(sub)).toBe(true);
    }
    expect(coveredKinds.size).toBe(13);

    // Pure qualitative MCQs quota (>= 40)
    const pureQualMcqs = candidates.filter(
      (c) => c.format === "mcq" && c.targetMode === "qualitative",
    );
    expect(pureQualMcqs.length).toBeGreaterThanOrEqual(40);

    // Authentic 6-mark LoR templates quota (>= 6 distinct templates)
    const sixMarkLors = candidates.filter(
      (c) =>
        c.format === "structured" &&
        c.totalMarks === 6 &&
        c.parts?.length === 1 &&
        c.parts[0].marks === 6 &&
        c.parts[0].targetMode === "qualitative" &&
        Boolean(c.parts[0].targetQuantityKey),
    );
    const distinctLorArchetypes = new Set(
      sixMarkLors.map((c) => c.templateArchetype),
    );
    expect(distinctLorArchetypes.size).toBeGreaterThanOrEqual(6);
    expect(sixMarkLors.length).toBeGreaterThanOrEqual(11);

    for (const lor of sixMarkLors) {
      expect(lor.markScheme.map((m) => m.code)).toEqual([
        "L1a",
        "L1b",
        "L2a",
        "L2b",
        "L3a",
        "L3b",
      ]);
      for (const pt of lor.markScheme) {
        expect(pt.marks).toBe(1);
      }
    }

    // Determinism check
    const repeat = generateAlevelCoreA2Candidates();
    expect(repeat).toEqual(candidates);
  });
});
