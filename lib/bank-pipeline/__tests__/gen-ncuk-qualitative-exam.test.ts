import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  CandidateQuestionInput,
  extractNumbersFromPhysicsText,
  getDomainAdapter,
  ingestCandidatesIntoShard,
  inspectSvgSanity,
  resetDomainRegistryToDefaults,
  validateQwenDistillationTrace,
  verifyCandidateWithGate,
  verifyZeroSplitContamination,
} from "@/lib/bank-pipeline";
import {
  generateNcukQualitativeExamCandidates,
  NCUK_QUAL_EXAM_DEFAULT_BASE_SEED,
  NCUK_QUAL_EXAM_ID_PREFIX,
} from "@/lib/bank-pipeline/generators/ncuk-qualitative-exam";
import {
  NCUK_QUAL_EXAM_PLUGINS,
  NCUK_QUAL_EXAM_SCENARIO_KINDS,
} from "@/lib/visuals/ncuk-conceptual";

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

describe("Track C NCUK IFYPH005 qualitative, AC1 graphing, and 10-mark flagship generator", () => {
  let candidates: CandidateQuestionInput[];
  let tempDir: string;

  beforeAll(() => {
    resetDomainRegistryToDefaults();
    candidates = generateNcukQualitativeExamCandidates();
  });

  afterAll(() => {
    resetDomainRegistryToDefaults();
  });

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "gen-ncuk-qual-test-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("validates, solves, and renders all 4 assigned DomainKindPlugins on every probeSpec with clean XML and zero raw _/^ in SVG text", () => {
    expect(NCUK_QUAL_EXAM_PLUGINS.map((p) => p.kind)).toEqual([
      ...NCUK_QUAL_EXAM_SCENARIO_KINDS,
    ]);

    for (const plugin of NCUK_QUAL_EXAM_PLUGINS) {
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

        if (plugin.renderSvg) {
          const rendered = adapter.renderSvg?.(spec, { hiddenQuantities: [] });
          expect(rendered).toBeDefined();
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
      }

      // Reject clearly invalid spec
      const badCheck = plugin.validate({ kind: plugin.kind });
      expect(badCheck.valid).toBe(false);
      expect(badCheck.issues.length).toBeGreaterThan(0);
    }
  });

  it("passes 100% of generated candidates through verifyCandidateWithGate and shard ingestion with zero rejections and valid distillation traces", () => {
    expect(candidates.length).toBeGreaterThanOrEqual(180);
    expect(candidates.length).toBeLessThanOrEqual(240);

    // Check unique IDs and prefix
    const idSet = new Set<string>();
    const seedSet = new Set<number>();
    const svgOutputs: string[] = [];

    for (const cand of candidates) {
      expect(cand.id.startsWith(`${NCUK_QUAL_EXAM_ID_PREFIX}-`)).toBe(true);
      expect(idSet.has(cand.id)).toBe(false);
      idSet.add(cand.id);

      expect(cand.seed).toBeGreaterThanOrEqual(NCUK_QUAL_EXAM_DEFAULT_BASE_SEED);
      expect(seedSet.has(cand.seed)).toBe(false);
      seedSet.add(cand.seed);

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
        svgOutputs.push(result.effectiveSvgMarkup);
      }
    }

    // SVG hygiene check across ALL rendered candidates
    expect(svgOutputs.length).toBeGreaterThanOrEqual(40);
    for (const svg of svgOutputs) {
      const sanity = inspectSvgSanity(svg);
      expect(sanity.valid).toBe(true);
      expect(svg).toContain('fill="#ffffff"');
      for (const txt of extractSvgTextContents(svg)) {
        expect(txt).not.toMatch(/[_^]/);
      }
    }

    // Full shard ingestion (checks near-duplicate stem collision & Qwen distillation traces!)
    const summary = ingestCandidatesIntoShard({
      shardId: "ncuk-v3-qual-exam-test",
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

  it("satisfies Track C balance quotas, NCUK IFY-S1/S2 tagging, zero bare digits in qualitative items, and exact 10-mark flagships", () => {
    const pureQualMcqs = candidates.filter(
      (c) => c.format === "mcq" && c.targetMode === "qualitative",
    );
    const short2mQual = candidates.filter(
      (c) =>
        c.format === "structured" &&
        c.targetMode === "qualitative" &&
        c.totalMarks === 2,
    );
    const short4mQual = candidates.filter(
      (c) =>
        c.format === "structured" &&
        c.targetMode === "qualitative" &&
        c.totalMarks === 4,
    );
    const ac1GraphItems = candidates.filter(
      (c) => c.scenarioSpec.kind === "false-origin-gradient-experiment",
    );
    const thermal10m = candidates.filter(
      (c) =>
        c.scenarioSpec.kind === "thermal-phase-cooling-gas-10m" &&
        c.totalMarks === 10,
    );
    const mechanics10m = candidates.filter(
      (c) =>
        c.scenarioSpec.kind === "synoptic-density-statics-energy-10m" &&
        c.totalMarks === 10,
    );
    const total10m = candidates.filter((c) => c.totalMarks === 10);

    expect(pureQualMcqs.length).toBeGreaterThanOrEqual(60);
    expect(short2mQual.length + short4mQual.length).toBeGreaterThanOrEqual(60);
    expect(short2mQual.length).toBeGreaterThanOrEqual(30);
    expect(short4mQual.length).toBeGreaterThanOrEqual(30);
    expect(ac1GraphItems.length).toBeGreaterThanOrEqual(16);
    expect(thermal10m.length).toBeGreaterThanOrEqual(12);
    expect(mechanics10m.length).toBeGreaterThanOrEqual(12);
    expect(total10m.length).toBeGreaterThanOrEqual(24);

    // Every qualitative MCQ option & every qualitative subpart has zero extracted numbers
    for (const mcq of pureQualMcqs) {
      expect(mcq.targetQuantityKey).toBeTruthy();
      for (const opt of mcq.options ?? []) {
        expect(extractNumbersFromPhysicsText(opt.text)).toEqual([]);
      }
    }

    for (const cand of candidates) {
      // Syllabus tagging check
      expect(cand.syllabi).toHaveLength(1);
      const tag = cand.syllabi[0];
      expect(tag.syllabus).toBe("ncuk");
      expect(tag.subtopicId).toBeTruthy();
      if (tag.subtopicId === "ncuk-ac6-1" || tag.subtopicId === "ncuk-ac4-6") {
        expect(tag.level).toBe("IFY-S2");
      } else {
        expect(tag.level).toBe("IFY-S1");
      }

      // Check qualitative subparts carry verified targetQuantityKey and zero bare digits
      for (const part of cand.parts ?? []) {
        if (part.targetMode === "qualitative") {
          expect(part.targetQuantityKey).toBeTruthy();
          expect(extractNumbersFromPhysicsText(part.expectedAnswer)).toEqual(
            [],
          );
          expect(
            extractNumbersFromPhysicsText(part.workingSteps.join(" ")),
          ).toEqual([]);
        }
      }
    }

    // Verify NCUK constants on flagship 10-mark items
    for (const tItem of thermal10m) {
      expect(tItem.stem).toContain("273.2");
      expect(tItem.parts!.length).toBeGreaterThanOrEqual(5);
      expect(tItem.parts!.some((p) => /Show clearly that/i.test(p.prompt))).toBe(
        true,
      );
    }
    for (const mItem of mechanics10m) {
      expect(mItem.stem).toContain("9.81");
      expect(mItem.parts!.length).toBeGreaterThanOrEqual(5);
      expect(mItem.parts!.some((p) => /show clearly that/i.test(p.prompt))).toBe(
        true,
      );
    }

    // Determinism check
    const repeat = generateNcukQualitativeExamCandidates();
    expect(repeat).toEqual(candidates);
  });
});
