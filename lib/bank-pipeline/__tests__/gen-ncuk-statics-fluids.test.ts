import { prepareSvgFigureParts } from "@/components/sixthphysics/svg-figure-plate";
import {
  buildDistillationTrace,
  buildFamilyGroupKey,
  checkSvgHiddenQuantityLeaks,
  computeStemSimilarity,
  ExistingStemEntry,
  getDomainAdapter,
  inspectSvgSanity,
  resetDomainRegistryToDefaults,
  SIXTHPHYSICS_BANK_ITEM_SCHEMA_VERSION,
  SixthPhysicsBankItem,
  validateQwenDistillationTrace,
  verifyCandidateWithGate,
} from "@/lib/bank-pipeline";
import {
  generateNcukStaticsFluidsCandidates,
  NCUK_STATICS_FLUIDS_ARCHETYPES,
  NCUK_STATICS_FLUIDS_BASE_SEED,
  NCUK_STATICS_FLUIDS_ID_PREFIX,
} from "@/lib/bank-pipeline/generators/ncuk-statics-fluids";
import {
  NCUK_STATICS_FLUIDS_KINDS,
  NCUK_STATICS_FLUIDS_PLUGINS,
} from "@/lib/visuals/ncuk-statics-fluids";

function extractSvgTextNodes(svgMarkup: string): string[] {
  return (svgMarkup.match(/<text\b[\s\S]*?<\/text>/g) ?? []).map((node) =>
    node
      .replace(/<[^>]+>/g, "")
      .replace(/&#8203;/g, "")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">"),
  );
}

describe("NCUK AC2.3 Statics & AC3.1 Density/Hydrostatics plugins and generator", () => {
  beforeAll(() => {
    resetDomainRegistryToDefaults();
  });

  afterAll(() => {
    resetDomainRegistryToDefaults();
  });

  it("exports all 7 disjoint DomainKindPlugins and validates, solves, and renders every probeSpec cleanly", () => {
    expect(NCUK_STATICS_FLUIDS_PLUGINS).toHaveLength(7);
    expect(NCUK_STATICS_FLUIDS_PLUGINS.map((p) => p.kind)).toEqual([
      ...NCUK_STATICS_FLUIDS_KINDS,
    ]);

    const mechanicsKinds = NCUK_STATICS_FLUIDS_PLUGINS.filter(
      (p) => p.domain === "mechanics",
    );
    const pureCalcKinds = NCUK_STATICS_FLUIDS_PLUGINS.filter(
      (p) => p.domain === "pure-calculation",
    );
    const thermalKinds = NCUK_STATICS_FLUIDS_PLUGINS.filter(
      (p) => p.domain === "thermal",
    );
    expect(mechanicsKinds).toHaveLength(4);
    expect(pureCalcKinds).toHaveLength(2);
    expect(thermalKinds).toHaveLength(1);

    for (const plugin of NCUK_STATICS_FLUIDS_PLUGINS) {
      expect(plugin.probeSpecs.length).toBeGreaterThanOrEqual(2);
      const adapter = getDomainAdapter(plugin.domain);
      expect(adapter.supportedScenarioKinds).toContain(plugin.kind);

      for (const probe of plugin.probeSpecs) {
        const validation = adapter.validateScenario(probe);
        expect({
          kind: plugin.kind,
          valid: validation.valid,
          issues: validation.issues,
        }).toEqual({
          kind: plugin.kind,
          valid: true,
          issues: [],
        });

        const solved = adapter.solveScenario(probe);
        expect(Object.keys(solved.quantities).length).toBeGreaterThan(3);
        for (const [k, v] of Object.entries(solved.quantities)) {
          if (typeof v === "number") {
            expect(Number.isFinite(v)).toBe(true);
          } else {
            expect(k.length).toBeGreaterThan(0);
          }
        }

        if (plugin.renderSvg) {
          const rendered = adapter.renderSvg?.(probe, { id: `probe-${plugin.kind}` });
          expect(rendered).toBeDefined();
          const sanity = inspectSvgSanity(rendered!.svgMarkup);
          expect({
            kind: plugin.kind,
            valid: sanity.valid,
            issues: sanity.issues,
          }).toEqual({
            kind: plugin.kind,
            valid: true,
            issues: [],
          });
          for (const textNode of extractSvgTextNodes(rendered!.svgMarkup)) {
            expect(textNode).not.toMatch(/[_^]/);
            expect(textNode).not.toMatch(/\d\s+°/);
          }
          expect(rendered!.svgMarkup).not.toMatch(/font-family="Arial/i);
        } else {
          expect(adapter.renderSvg?.(probe)).toBeUndefined();
        }
      }

      // Negative validation guard: empty/malformed spec must fail cleanly
      const bad = plugin.validate({ kind: plugin.kind });
      expect(bad.valid).toBe(false);
    }
  });

  it("generates >= 60 verified items each for ncuk-ac2-3 and ncuk-ac3-1 with 100% gate pass rate, strict g=9.81, zero SVG leaks/raw scripts, and valid Qwen traces", () => {
    const candidates = generateNcukStaticsFluidsCandidates();
    expect(NCUK_STATICS_FLUIDS_ARCHETYPES).toHaveLength(14);
    expect(candidates.length).toBeGreaterThanOrEqual(150);
    expect(candidates.length).toBeLessThanOrEqual(210);

    const seenIds = new Set<string>();
    const existingStems: ExistingStemEntry[] = [];
    let ac23Count = 0;
    let ac31Count = 0;
    let mcqQuantCount = 0;
    let mcqQualCount = 0;
    let structCount = 0;
    let longStaticsCount = 0;
    let showThatCount = 0;
    let svgCheckedCount = 0;

    for (const candidate of candidates) {
      // Unique ID prefix and disjoint seed range
      expect(candidate.id.startsWith(`${NCUK_STATICS_FLUIDS_ID_PREFIX}-`)).toBe(true);
      expect(seenIds.has(candidate.id)).toBe(false);
      seenIds.add(candidate.id);
      expect(candidate.seed).toBeGreaterThanOrEqual(NCUK_STATICS_FLUIDS_BASE_SEED);

      // Strict NCUK IFY-S1 tagging and g = 9.81 m s^-2
      const ncukTags = candidate.syllabi.filter((s) => s.syllabus === "ncuk");
      expect(ncukTags).toHaveLength(1);
      expect(ncukTags[0].level).toBe("IFY-S1");
      expect(["ncuk-ac2-3", "ncuk-ac3-1"]).toContain(ncukTags[0].subtopicId);
      if (ncukTags[0].subtopicId === "ncuk-ac2-3") {
        expect(ncukTags[0].topicId).toBe("ncuk-ac2");
        ac23Count += 1;
      } else {
        expect(ncukTags[0].topicId).toBe("ncuk-ac3");
        ac31Count += 1;
      }
      expect(candidate.syllabi.some((s) => s.syllabus === "ib")).toBe(false);

      if (candidate.scenarioSpec.gravityMs2 !== undefined) {
        expect(candidate.scenarioSpec.gravityMs2).toBe(9.81);
      }

      // Zero digits in pre-solve questionPlan
      expect(/\d/.test(JSON.stringify(candidate.questionPlan ?? {}))).toBe(false);

      // Full deterministic verification gate (including intra-batch near-duplicate check)
      const exec = verifyCandidateWithGate(candidate, {
        existingShardItems: existingStems,
        nearDuplicateSimilarityThreshold: 0.9,
      });
      expect({
        id: candidate.id,
        archetype: candidate.templateArchetype,
        valid: exec.evaluation.valid,
        issues: exec.evaluation.issues,
      }).toEqual({
        id: candidate.id,
        archetype: candidate.templateArchetype,
        valid: true,
        issues: [],
      });

      existingStems.push({
        id: candidate.id,
        stem: candidate.stem,
        stemFingerprint: exec.evaluation.stemFingerprint,
      });

      // Format & rubric tallies
      if (candidate.format === "mcq") {
        if (candidate.targetMode === "qualitative") {
          mcqQualCount += 1;
        } else {
          mcqQuantCount += 1;
        }
      } else {
        structCount += 1;
        if (ncukTags[0].subtopicId === "ncuk-ac2-3" && candidate.totalMarks >= 8) {
          longStaticsCount += 1;
        }
        if (
          candidate.parts?.some((p) => /show clearly that/i.test(p.prompt))
        ) {
          showThatCount += 1;
        }
      }

      // Strict SVG hygiene & SvgFigurePlate typesetting compatibility
      if (exec.effectiveSvgMarkup) {
        svgCheckedCount += 1;
        const rawTextNodes = extractSvgTextNodes(exec.effectiveSvgMarkup);
        for (const text of rawTextNodes) {
          expect(text).not.toMatch(/[_^]/);
          expect(text).not.toMatch(/\d\s+°/);
        }
        expect(exec.effectiveSvgMarkup).not.toMatch(/font-family="Arial/i);

        const leaks = checkSvgHiddenQuantityLeaks({
          svgMarkup: exec.effectiveSvgMarkup,
          hiddenQuantities: candidate.hiddenQuantities,
          verifiedQuantities: exec.solveOutput!.quantities,
          publicNumbers: exec.renderOutput?.publicNumbers ?? [],
          publicLabels: exec.renderOutput?.publicLabels ?? [],
        });
        expect(leaks).toEqual([]);

        const prepared = prepareSvgFigureParts(
          exec.effectiveSvgMarkup,
          candidate.id,
        );
        for (const text of extractSvgTextNodes(prepared.markup)) {
          expect(text).not.toMatch(/[_^]/);
          expect(text).not.toMatch(/\d\s+°/);
        }
      }

      // Full 5-message Qwen/Qwen3.5-9B distillation trace check
      const familyGroupKey = buildFamilyGroupKey({
        conceptId: candidate.conceptId,
        templateArchetype: candidate.templateArchetype,
      });
      const bankItem: SixthPhysicsBankItem = {
        schemaVersion: SIXTHPHYSICS_BANK_ITEM_SCHEMA_VERSION,
        id: candidate.id,
        familyGroupKey,
        syllabi: candidate.syllabi,
        format: candidate.format,
        difficulty: candidate.difficulty,
        visualFamily: exec.renderOutput?.visualFamily ?? "pure_calculation",
        stem: candidate.stem,
        ...(exec.effectiveSvgMarkup
          ? { svgMarkup: exec.effectiveSvgMarkup }
          : {}),
        ...(candidate.format === "mcq" && candidate.options
          ? {
              options: candidate.options as NonNullable<
                SixthPhysicsBankItem["options"]
              >,
              correctOptionIndex: exec.correctOptionIndex,
            }
          : {}),
        ...(candidate.format === "structured" && candidate.parts
          ? { parts: candidate.parts }
          : {}),
        workedSolution: candidate.workedSolution,
        markScheme: candidate.markScheme,
        totalMarks: candidate.totalMarks,
        verifiedQuantities: exec.solveOutput!.quantities,
        provenance: {
          domain: candidate.domain,
          conceptId: candidate.conceptId,
          templateArchetype: candidate.templateArchetype,
          familyGroupKey,
          seed: candidate.seed,
          shardId: "ncuk-v3-statics-fluids",
          generatorModel: candidate.generatorModel ?? "gemini-4-carbon-high",
          solverId: exec.solveOutput!.solverId,
          rendererVersion: exec.renderOutput?.rendererVersion,
          stemFingerprint: exec.evaluation.stemFingerprint,
          svgFingerprint: exec.evaluation.svgFingerprint,
          split: "train",
          createdAt: "2026-11-20T17:45:00.000Z",
        },
      };
      const trace = buildDistillationTrace({
        candidate,
        bankItem,
        split: "train",
        publicVisualLabels: exec.renderOutput?.publicLabels,
      });
      const traceValid = validateQwenDistillationTrace(trace);
      expect({
        id: candidate.id,
        valid: traceValid.valid,
        issues: traceValid.issues,
      }).toEqual({
        id: candidate.id,
        valid: true,
        issues: [],
      });
    }

    // Coverage thresholds
    expect(ac23Count).toBeGreaterThanOrEqual(60);
    expect(ac31Count).toBeGreaterThanOrEqual(60);
    expect(mcqQuantCount).toBeGreaterThanOrEqual(60);
    expect(mcqQualCount).toBeGreaterThanOrEqual(20);
    expect(structCount).toBeGreaterThanOrEqual(70);
    expect(longStaticsCount).toBeGreaterThanOrEqual(8);
    expect(showThatCount).toBeGreaterThanOrEqual(10);
    expect(svgCheckedCount).toBeGreaterThanOrEqual(120);

    // Pairwise stem similarity stays strictly below near-duplicate threshold
    let maxSim = 0;
    for (let i = 0; i < candidates.length; i += 1) {
      for (let j = i + 1; j < candidates.length; j += 1) {
        const sim = computeStemSimilarity(
          candidates[i].stem,
          candidates[j].stem,
        );
        if (sim > maxSim) maxSim = sim;
      }
    }
    expect(maxSim).toBeLessThan(0.9);
  });
});
