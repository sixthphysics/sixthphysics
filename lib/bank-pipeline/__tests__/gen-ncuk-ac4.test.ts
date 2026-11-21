import {
  ExistingStemEntry,
  getDomainAdapter,
  inspectSvgSanity,
  resetDomainRegistryToDefaults,
  verifyCandidateWithGate,
} from "@/lib/bank-pipeline";
import {
  DEFAULT_NCUK_AC4_BASE_SEED,
  generateNcukAc4Candidates,
  NCUK_AC4_ARCHETYPES,
  NCUK_AC4_ID_PREFIX,
} from "@/lib/bank-pipeline/generators/ncuk-ac4";
import { getCompatibleSyllabiForConcept } from "@/lib/constants/syllabi";
import { formatNcukQuantity, NCUK_AC4_PLUGINS } from "@/lib/visuals/ncuk-ac4";

function extractRawSvgTextNodes(svg: string): string[] {
  return (svg.match(/<text\b[\s\S]*?<\/text>/g) ?? []).map((node) =>
    node
      .replace(/<[^>]+>/g, "")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'"),
  );
}

describe("NCUK IFYPH005 AC4.1-AC4.4 plugins and candidate generator", () => {
  beforeAll(() => {
    resetDomainRegistryToDefaults();
  });

  afterAll(() => {
    resetDomainRegistryToDefaults();
  });

  it("exports all 12 disjoint AC4 scenario plugins across the 4 assigned domains", () => {
    expect(NCUK_AC4_PLUGINS).toHaveLength(12);

    const kinds = NCUK_AC4_PLUGINS.map((p) => p.kind);
    expect(new Set(kinds).size).toBe(12);

    const countsByDomain: Record<string, number> = {};
    for (const p of NCUK_AC4_PLUGINS) {
      countsByDomain[p.domain] = (countsByDomain[p.domain] ?? 0) + 1;
    }
    expect(countsByDomain).toEqual({
      "pure-calculation": 4,
      circuits: 3,
      "em-induction": 2,
      graphs: 3,
    });
  });

  it("never zero-clamps atomic/micro physical values in formatNcukQuantity", () => {
    expect(formatNcukQuantity(1.6e-19, "C")).toBe("1.60 × 10⁻¹⁹ C");
    expect(formatNcukQuantity(9.11e-31, "kg")).toBe("9.11 × 10⁻³¹ kg");
    expect(formatNcukQuantity(6.63e-34, "J s")).toBe("6.63 × 10⁻³⁴ J s");
    expect(formatNcukQuantity(0, "V")).toBe("0 V");
  });

  it("validates, solves, and renders every plugin probeSpec cleanly with zero raw _ or ^ in SVG text", () => {
    for (const plugin of NCUK_AC4_PLUGINS) {
      expect(plugin.probeSpecs.length).toBeGreaterThanOrEqual(2);
      const adapter = getDomainAdapter(plugin.domain);

      // Invalid empty spec must fail validation
      const invalidCheck = plugin.validate({ kind: plugin.kind });
      expect(invalidCheck.valid).toBe(false);
      expect(invalidCheck.issues.length).toBeGreaterThan(0);

      for (const probe of plugin.probeSpecs) {
        const check = adapter.validateScenario(probe);
        expect(check).toEqual({ valid: true, issues: [] });

        const solved = adapter.solveScenario(probe);
        expect(Object.keys(solved.quantities).length).toBeGreaterThan(0);
        for (const [k, v] of Object.entries(solved.quantities)) {
          if (typeof v === "number") {
            expect(Number.isFinite(v)).toBe(true);
          } else if (typeof v === "string") {
            expect(v.trim().length).toBeGreaterThan(0);
          }
          expect(k.length).toBeGreaterThan(0);
        }

        if (plugin.renderSvg) {
          const rendered = adapter.renderSvg!(probe, { id: `probe-${plugin.kind}` });
          expect(rendered).toBeDefined();
          const svg = rendered!.svgMarkup;
          const sanity = inspectSvgSanity(svg);
          expect(sanity.valid).toBe(true);
          expect(sanity.issues).toEqual([]);
          expect(svg).toContain('fill="#ffffff"');

          const textNodes = extractRawSvgTextNodes(svg);
          for (const txt of textNodes) {
            expect(txt).not.toMatch(/[_^]/);
          }
        }
      }
    }
  });

  it("is deterministic for a fixed baseSeed and produces 190-240 unique candidates covering all 4 subtopics and both 10-mark flagships", () => {
    const batchA = generateNcukAc4Candidates({ baseSeed: DEFAULT_NCUK_AC4_BASE_SEED });
    const batchB = generateNcukAc4Candidates({ baseSeed: DEFAULT_NCUK_AC4_BASE_SEED });
    expect(batchA).toEqual(batchB);

    expect(batchA.length).toBeGreaterThanOrEqual(190);
    expect(batchA.length).toBeLessThanOrEqual(240);

    // Zero duplicate IDs and valid prefix + seed range
    const idSet = new Set<string>();
    const archetypeCounts = new Map<string, number>();
    const subtopicCounts = new Map<string, number>();
    const kindSet = new Set<string>();
    const structuredMarksSet = new Set<number>();

    for (const cand of batchA) {
      expect(cand.id.startsWith(`${NCUK_AC4_ID_PREFIX}-`)).toBe(true);
      expect(idSet.has(cand.id)).toBe(false);
      idSet.add(cand.id);

      expect(cand.seed).toBeGreaterThanOrEqual(DEFAULT_NCUK_AC4_BASE_SEED);
      expect(cand.seed).toBeLessThan(DEFAULT_NCUK_AC4_BASE_SEED + 1_000_000);

      archetypeCounts.set(
        cand.templateArchetype,
        (archetypeCounts.get(cand.templateArchetype) ?? 0) + 1,
      );
      kindSet.add(String(cand.scenarioSpec.kind));

      if (cand.format === "structured") {
        structuredMarksSet.add(cand.totalMarks);
      }

      // Verify mandatory NCUK IFY-S1 tag + crosswalk compliance on every tag
      const ncukTag = cand.syllabi.find((t) => t.syllabus === "ncuk");
      expect(ncukTag).toBeDefined();
      expect(ncukTag!.level).toBe("IFY-S1");
      expect(ncukTag!.topicId).toBe("ncuk-ac4");
      expect(ncukTag!.subtopicId).toMatch(/^ncuk-ac4-[1-4]$/);
      subtopicCounts.set(
        ncukTag!.subtopicId!,
        (subtopicCounts.get(ncukTag!.subtopicId!) ?? 0) + 1,
      );

      const compatible = getCompatibleSyllabiForConcept(cand.conceptId, {
        format: cand.format,
        excludeOptionTopics: true,
      });
      const compatMap = new Map(compatible.map((m) => [m.syllabus, m]));
      for (const tag of cand.syllabi) {
        const spec = compatMap.get(tag.syllabus);
        expect(spec).toBeDefined();
        expect(spec!.levels).toContain(tag.level);
        expect(spec!.topicIds).toContain(tag.topicId);
        expect(spec!.subtopicIds).toContain(tag.subtopicId!);
      }
    }

    // All 12 kinds and all 17 archetypes represented with 12-16 candidates each
    expect(kindSet.size).toBe(12);
    expect(archetypeCounts.size).toBe(NCUK_AC4_ARCHETYPES.length);
    for (const meta of NCUK_AC4_ARCHETYPES) {
      const count = archetypeCounts.get(meta.id) ?? 0;
      expect(count).toBeGreaterThanOrEqual(12);
      expect(count).toBeLessThanOrEqual(16);
    }

    // All 4 subtopics covered
    expect([...subtopicCounts.keys()].sort()).toEqual([
      "ncuk-ac4-1",
      "ncuk-ac4-2",
      "ncuk-ac4-3",
      "ncuk-ac4-4",
    ]);

    // Mix of 2m, 4m, 5m, 6m, and 10m structured templates
    expect(structuredMarksSet.has(2)).toBe(true);
    expect(structuredMarksSet.has(4)).toBe(true);
    expect(structuredMarksSet.has(5)).toBe(true);
    expect(structuredMarksSet.has(6)).toBe(true);
    expect(structuredMarksSet.has(10)).toBe(true);

    // Both 10-mark flagship templates have exact totalMarks === 10 and 5-6 parts
    const intr10m = batchA.filter(
      (c) => c.templateArchetype === "ncuk-internal-resistance-experiment-10m",
    );
    const rc10m = batchA.filter(
      (c) => c.templateArchetype === "ncuk-switched-rc-multistage-10m",
    );
    expect(intr10m.length).toBeGreaterThanOrEqual(12);
    expect(rc10m.length).toBeGreaterThanOrEqual(12);

    for (const item of [...intr10m, ...rc10m]) {
      expect(item.format).toBe("structured");
      expect(item.totalMarks).toBe(10);
      expect(item.parts!.length).toBeGreaterThanOrEqual(5);
      expect(item.parts!.length).toBeLessThanOrEqual(6);
      const partSum = item.parts!.reduce((acc, p) => acc + p.marks, 0);
      const schemeSum = item.markScheme.reduce((acc, m) => acc + m.marks, 0);
      expect(partSum).toBe(10);
      expect(schemeSum).toBe(10);
    }
  });

  it("passes verifyCandidateWithGate on 100% of generated candidates with 0 rejections, 0 near-duplicates, and 0 raw _/^ in SVG text", () => {
    const candidates = generateNcukAc4Candidates();
    const acceptedStems: ExistingStemEntry[] = [];
    const failures: Array<{ id: string; issues: string[] }> = [];

    for (const cand of candidates) {
      const result = verifyCandidateWithGate(cand, {
        existingShardItems: acceptedStems,
      });

      if (!result.evaluation.valid) {
        failures.push({
          id: cand.id,
          issues: result.evaluation.issues.map(
            (iss) => `[${iss.code}] ${iss.message}`,
          ),
        });
      } else {
        acceptedStems.push({
          id: cand.id,
          stem: cand.stem,
          stemFingerprint: result.evaluation.stemFingerprint,
        });
      }

      if (result.effectiveSvgMarkup) {
        const textNodes = extractRawSvgTextNodes(result.effectiveSvgMarkup);
        for (const txt of textNodes) {
          expect(txt).not.toMatch(/[_^]/);
        }
      }
    }

    expect(failures).toEqual([]);
    expect(acceptedStems).toHaveLength(candidates.length);
  });
});
