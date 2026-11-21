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
  ALEVEL_PRACTICALS_DEFAULT_BASE_SEED,
  ALEVEL_PRACTICALS_ID_PREFIX,
  generateAlevelPracticalsCandidates,
} from "@/lib/bank-pipeline/generators/alevel-practicals";
import { ALEVEL_PHYSICS_SYLLABUS } from "@/lib/constants/syllabi";
import {
  ALEVEL_GRAVITY_MS2,
  ALEVEL_PRACTICALS_PLUGINS,
  ALEVEL_PRACTICALS_SCENARIO_KINDS,
} from "@/lib/visuals/alevel-practicals";

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

function renderMathText(text: string): string {
  return renderToStaticMarkup(React.createElement(MathText, { text }));
}

describe("AQA A-Level Paper 3A & Required Practicals (RP1–RP12) generator and plugins", () => {
  let candidates: CandidateQuestionInput[];
  let tempDir: string;

  beforeAll(() => {
    resetDomainRegistryToDefaults();
    candidates = generateAlevelPracticalsCandidates();
  });

  afterAll(() => {
    resetDomainRegistryToDefaults();
  });

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "gen-alevel-prac-test-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("validates, solves, and renders all 14 al-prac-* plugins across every probeSpec with white background, valid XML, and zero raw _/^ in SVG text", () => {
    expect(ALEVEL_PRACTICALS_PLUGINS).toHaveLength(14);
    expect(ALEVEL_PRACTICALS_PLUGINS.map((p) => p.kind)).toEqual([
      ...ALEVEL_PRACTICALS_SCENARIO_KINDS,
    ]);
    expect(ALEVEL_GRAVITY_MS2).toBe(9.81);

    for (const plugin of ALEVEL_PRACTICALS_PLUGINS) {
      expect(plugin.kind.startsWith("al-prac-")).toBe(true);
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

  it("verifies 100% of generated candidates through verifyCandidateWithGate, shard ingestion, and Qwen distillation trace validation", () => {
    expect(candidates.length).toBeGreaterThanOrEqual(160);
    expect(candidates.length).toBeLessThanOrEqual(210);

    const idSet = new Set<string>();
    const seedSet = new Set<number>();
    const svgOutputs: string[] = [];

    const gateFailures: string[] = [];

    for (const cand of candidates) {
      expect(cand.id.startsWith(`${ALEVEL_PRACTICALS_ID_PREFIX}-`)).toBe(true);
      expect(idSet.has(cand.id)).toBe(false);
      idSet.add(cand.id);

      expect(cand.seed).toBeGreaterThanOrEqual(
        ALEVEL_PRACTICALS_DEFAULT_BASE_SEED,
      );
      expect(cand.seed).toBeLessThan(74_000_000);
      expect(seedSet.has(cand.seed)).toBe(false);
      seedSet.add(cand.seed);

      expect(cand.templateArchetype.startsWith("al-prac-")).toBe(true);
      expect(cand.questionStyle).toBeTruthy();

      // Zero digits in pre-solve questionPlan
      expect(JSON.stringify(cand.questionPlan)).not.toMatch(/\d/);

      const result = verifyCandidateWithGate(cand);
      if (!result.evaluation.valid) {
        gateFailures.push(
          `Gate rejected "${cand.id}": ${JSON.stringify(result.evaluation.issues)}`,
        );
      } else if (result.effectiveSvgMarkup) {
        svgOutputs.push(result.effectiveSvgMarkup);
      }
    }
    expect(gateFailures).toEqual([]);

    // SVG hygiene across ALL rendered candidates
    expect(svgOutputs).toHaveLength(candidates.length);
    for (const svg of svgOutputs) {
      const sanity = inspectSvgSanity(svg);
      expect(sanity.valid).toBe(true);
      expect(svg).toContain('fill="#ffffff"');
      for (const txt of extractSvgTextContents(svg)) {
        expect(txt).not.toMatch(/[_^]/);
      }
    }

    // Full shard ingestion (checks near-duplicate stems & Qwen traces)
    const summary = ingestCandidatesIntoShard({
      shardId: "alevel-v3-practicals-test",
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

  it("covers Paper 3A and all 12 AQA Required Practicals (RP1–RP12), includes authentic 6-mark LoRs, valid syllabus tags, g = 9.81, and zero KaTeX errors", () => {
    // Every one of the 14 al-prac-* plugin kinds is represented
    const kindsPresent = new Set(
      candidates.map((c) => String(c.scenarioSpec.kind)),
    );
    for (const kind of ALEVEL_PRACTICALS_SCENARIO_KINDS) {
      expect(kindsPresent.has(kind)).toBe(true);
    }

    // Both RP5 and RP6 represented cleanly under distinct archetypes
    expect(
      candidates.some(
        (c) =>
          c.scenarioSpec.kind === "al-prac-rp5-rp6-resistivity-emf" &&
          c.scenarioSpec.mode === "rp5-resistivity",
      ),
    ).toBe(true);
    expect(
      candidates.some(
        (c) =>
          c.scenarioSpec.kind === "al-prac-rp5-rp6-resistivity-emf" &&
          c.scenarioSpec.mode === "rp6-emf",
      ),
    ).toBe(true);

    // Authentic 6-mark experimental LoRs (>= 2; we produce 14 across 7 practicals!)
    const lor6m = candidates.filter(
      (c) =>
        c.format === "structured" &&
        c.totalMarks === 6 &&
        c.parts?.length === 1 &&
        c.parts[0].marks === 6 &&
        c.parts[0].targetMode === "qualitative",
    );
    expect(lor6m.length).toBeGreaterThanOrEqual(2);
    for (const lor of lor6m) {
      expect(lor.parts![0].targetQuantityKey).toBeTruthy();
      expect(lor.markScheme).toHaveLength(6);
      expect(lor.markScheme.map((m) => m.code)).toEqual([
        "L1a",
        "L1b",
        "L2a",
        "L2b",
        "L3a",
        "L3b",
      ]);
      expect(lor.markScheme.every((m) => m.marks === 1)).toBe(true);
    }

    // Valid ALEVEL_PHYSICS_SYLLABUS topicId & subtopicId on every candidate
    const validTopics = new Map<string, Set<string>>();
    for (const topic of ALEVEL_PHYSICS_SYLLABUS.topics) {
      validTopics.set(
        topic.id,
        new Set(topic.subtopics.map((sub) => sub.id)),
      );
    }

    for (const cand of candidates) {
      const alTag = cand.syllabi.find((s) => s.syllabus === "alevel");
      expect(alTag).toBeDefined();
      expect(["Y12", "Y13"]).toContain(alTag!.level);
      expect(validTopics.has(alTag!.topicId)).toBe(true);
      expect(validTopics.get(alTag!.topicId)!.has(alTag!.subtopicId!)).toBe(
        true,
      );

      // Never cite IB g = 9.8 m s^-2
      const combined = [
        cand.stem,
        cand.workedSolution,
        ...cand.markScheme.map((m) => m.criterion),
      ].join(" ");
      expect(combined).not.toMatch(/g\s*=\s*9\.8(?!1)\b/);
    }

    // KaTeX hygiene check across EVERY text field of EVERY generated candidate
    const katexFailures: string[] = [];
    for (const cand of candidates) {
      const fields: Array<{ label: string; value: string | undefined }> = [
        { label: "stem", value: cand.stem },
        { label: "workedSolution", value: cand.workedSolution },
      ];
      cand.options?.forEach((o, idx) => {
        fields.push({ label: `options[${idx}].text`, value: o.text });
        fields.push({
          label: `options[${idx}].distractorRationale`,
          value: o.distractorRationale,
        });
      });
      cand.parts?.forEach((p, idx) => {
        fields.push({ label: `parts[${idx}].prompt`, value: p.prompt });
        fields.push({
          label: `parts[${idx}].expectedAnswer`,
          value: p.expectedAnswer,
        });
        p.workingSteps.forEach((ws, wi) => {
          fields.push({
            label: `parts[${idx}].workingSteps[${wi}]`,
            value: ws,
          });
        });
      });
      cand.markScheme.forEach((m, idx) => {
        fields.push({
          label: `markScheme[${idx}].criterion`,
          value: m.criterion,
        });
      });

      for (const f of fields) {
        if (!f.value) continue;
        if (f.value.includes("${")) {
          katexFailures.push(`${cand.id} (${f.label}): literal template interpolation leak in "${f.value}"`);
        }
        const dollarCount = (f.value.match(/\$/g) ?? []).length;
        if (dollarCount % 2 !== 0) {
          katexFailures.push(`${cand.id} (${f.label}): unbalanced $ delimiters (${dollarCount}) in "${f.value}"`);
        }
        const html = renderMathText(f.value);
        if (html.includes("katex-error")) {
          katexFailures.push(`${cand.id} (${f.label}): katex-error in "${f.value}"`);
        }
        if (/\\(?:frac|dfrac|tfrac|sqrt|mathrm|text)\b/.test(html)) {
          katexFailures.push(`${cand.id} (${f.label}): raw TeX leak in "${f.value}"`);
        }
        const visible = html.replace(/<[^>]+>/g, "");
        if (visible.includes("_") || visible.includes("^") || visible.includes("$") || visible.includes("\\")) {
          katexFailures.push(
            `${cand.id} (${f.label}): unformatted _, ^, $, or \\ in "${visible}"`,
          );
        }
      }
    }
    expect(katexFailures).toEqual([]);

    // Determinism check
    expect(generateAlevelPracticalsCandidates()).toEqual(candidates);
  });
});
