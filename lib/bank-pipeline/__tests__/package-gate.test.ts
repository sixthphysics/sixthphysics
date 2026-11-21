import {
  buildQwenDistillationTrace,
} from "@/lib/bank-pipeline/distillation-trace";
import {
  registerVisualModule,
  resetDomainRegistryToDefaults,
} from "@/lib/bank-pipeline/domain-registry";
import {
  computeStemFingerprint,
  extractNumbersFromPhysicsText,
} from "@/lib/bank-pipeline/numeric-checker";
import { verifyCandidateWithGate } from "@/lib/bank-pipeline/package-gate";
import { buildSampleCandidates } from "@/lib/bank-pipeline/sample-candidates";
import {
  CandidateQuestionInput,
  PhysicsDomainId,
  SIXTHPHYSICS_BANK_ITEM_SCHEMA_VERSION,
  SixthPhysicsBankItem,
} from "@/lib/bank-pipeline/types";

describe("package-gate", () => {
  afterEach(() => {
    resetDomainRegistryToDefaults();
  });
  it("accepts all 15 solver-verified sample candidates across all 10 visual domains and pure-calculation", () => {
    const samples = buildSampleCandidates();
    expect(samples).toHaveLength(15);

    for (const candidate of samples) {
      const result = verifyCandidateWithGate(candidate);
      expect({
        id: candidate.id,
        valid: result.evaluation.valid,
        issues: result.evaluation.issues,
      }).toEqual({
        id: candidate.id,
        valid: true,
        issues: [],
      });
    }
  });

  it("rejects candidates when solver fails physical constraints or domain is unknown", () => {
    const base = buildSampleCandidates()[6]; // mechanics collision-loss
    const invalidScenario: CandidateQuestionInput = {
      ...base,
      id: "bad-ramp-height",
      scenarioSpec: {
        kind: "ramp-heating",
        weightN: 90,
        lengthM: 2,
        heightM: 5, // impossible: height > length
        speedMs: 1.2,
      },
    };
    const res = verifyCandidateWithGate(invalidScenario);
    expect(res.evaluation.valid).toBe(false);
    expect(res.evaluation.issues[0].code).toBe("scenario-validation-failed");

    const unknownDomain = verifyCandidateWithGate({
      ...base,
      id: "bad-domain",
      domain: "fluid-dynamics" as unknown as PhysicsDomainId,
    });
    expect(unknownDomain.evaluation.valid).toBe(false);
    expect(unknownDomain.evaluation.issues[0].code).toBe("unknown-domain");
  });

  it("rejects MCQ and structured candidates when answers or mark schemes disagree with solver ground truth", () => {
    const mcqBase = buildSampleCandidates()[2]; // circuits branch-heater, answer = 24.0 W
    const wrongMcq: CandidateQuestionInput = {
      ...mcqBase,
      id: "wrong-mcq-answer",
      options: mcqBase.options!.map((opt) =>
        opt.label === "B" ? { ...opt, text: "31.5 W" } : opt,
      ),
    };
    const resMcq = verifyCandidateWithGate(wrongMcq);
    expect(resMcq.evaluation.valid).toBe(false);
    expect(
      resMcq.evaluation.issues.some((i) => i.code === "ground-truth-mismatch"),
    ).toBe(true);

    const structBase = buildSampleCandidates()[1]; // shuttle-motion, distanceM = 63.0 m
    const wrongStruct: CandidateQuestionInput = {
      ...structBase,
      id: "wrong-struct-answer",
      parts: structBase.parts!.map((p) =>
        p.partId === "a" ? { ...p, expectedAnswer: "75.0 m" } : p,
      ),
    };
    const resStruct = verifyCandidateWithGate(wrongStruct);
    expect(resStruct.evaluation.valid).toBe(false);
    expect(
      resStruct.evaluation.issues.some(
        (i) => i.code === "ground-truth-mismatch",
      ),
    ).toBe(true);
  });

  it("rejects student stems that omit required givens or prematurely leak hidden answers", () => {
    const pureBase = buildSampleCandidates()[8]; // inputPowerW: 800, usefulPowerW: 600, durationS: 20
    const missingGiven: CandidateQuestionInput = {
      ...pureBase,
      id: "missing-duration-given",
      stem: "An electric winch motor draws 800 W of electrical input power and delivers 600 W of useful mechanical output power. How much energy is wasted?",
    };
    const resMissing = verifyCandidateWithGate(missingGiven);
    expect(resMissing.evaluation.valid).toBe(false);
    expect(
      resMissing.evaluation.issues.some(
        (i) => i.code === "missing-required-given",
      ),
    ).toBe(true);

    const leakedInStem: CandidateQuestionInput = {
      ...pureBase,
      id: "leaked-stem-answer",
      stem: `${pureBase.stem} (Note: wasted energy is 4000 J.)`,
    };
    const resLeak = verifyCandidateWithGate(leakedInStem);
    expect(resLeak.evaluation.valid).toBe(false);
    expect(
      resLeak.evaluation.issues.some((i) => i.code === "stem-answer-leak"),
    ).toBe(true);
  });

  it("accepts SI-prefixed givens (e.g. kΩ, nC) while enforcing MCQ option uniqueness and single correct choice", () => {
    const pureBase = buildSampleCandidates()[8];
    const siPrefixedGiven: CandidateQuestionInput = {
      ...pureBase,
      id: "si-prefix-ok",
      stem: "An electric winch motor draws 0.800 kW of electrical input power and delivers 0.600 kW of useful mechanical output power continuously for 20 s. How much energy is wasted to the surroundings in this 20 s interval?",
    };
    expect(verifyCandidateWithGate(siPrefixedGiven).evaluation.valid).toBe(
      true,
    );

    // Duplicate numerical value ("24 W" vs "24.0 W")
    const circuitsMcq = buildSampleCandidates()[2];
    const duplicateNumericMcq: CandidateQuestionInput = {
      ...circuitsMcq,
      id: "dup-num-mcq",
      options: [
        {
          label: "A",
          text: "24 W",
          isCorrect: false,
          distractorRationale: "Formatted without decimal.",
        },
        { label: "B", text: "24.0 W", isCorrect: true },
        {
          label: "C",
          text: "54.0 W",
          isCorrect: false,
          distractorRationale: "Wrong current.",
        },
        {
          label: "D",
          text: "73.5 W",
          isCorrect: false,
          distractorRationale: "Wrong voltage.",
        },
      ],
    };
    const dupRes = verifyCandidateWithGate(duplicateNumericMcq);
    expect(dupRes.evaluation.valid).toBe(false);
    expect(
      dupRes.evaluation.issues.some(
        (i) =>
          i.code === "mcq-duplicate-options" ||
          i.code === "mcq-distractor-matches-answer",
      ),
    ).toBe(true);

    // != 1 correct option
    const twoCorrectMcq: CandidateQuestionInput = {
      ...circuitsMcq,
      id: "two-correct-mcq",
      options: circuitsMcq.options!.map((o, idx) =>
        idx === 0 ? { ...o, isCorrect: true } : o,
      ),
    };
    const twoRes = verifyCandidateWithGate(twoCorrectMcq);
    expect(twoRes.evaluation.valid).toBe(false);
    expect(
      twoRes.evaluation.issues.some((i) => i.code === "mcq-non-unique-correct"),
    ).toBe(true);
  });

  it("rejects structured questions with unbalanced part marks, incomplete mark-scheme coverage, or invalid dependencies", () => {
    const structBase = buildSampleCandidates()[3]; // totalMarks = 6 (2 + 2 + 2)

    const badTotal: CandidateQuestionInput = {
      ...structBase,
      id: "bad-total-marks",
      totalMarks: 7,
    };
    expect(
      verifyCandidateWithGate(badTotal).evaluation.issues.some(
        (i) => i.code === "mark-sum-mismatch",
      ),
    ).toBe(true);

    const uncoveredPart: CandidateQuestionInput = {
      ...structBase,
      id: "uncovered-part-c",
      markScheme: structBase.markScheme.map((m) =>
        m.partId === "c" ? { ...m, partId: "b" } : m,
      ),
    };
    expect(
      verifyCandidateWithGate(uncoveredPart).evaluation.issues.some(
        (i) => i.code === "mark-scheme-coverage-mismatch",
      ),
    ).toBe(true);

    const forwardDep: CandidateQuestionInput = {
      ...structBase,
      id: "forward-dep",
      parts: structBase.parts!.map((p) =>
        p.partId === "a" ? { ...p, dependsOnPartIds: ["c"] } : p,
      ),
    };
    expect(
      verifyCandidateWithGate(forwardDep).evaluation.issues.some(
        (i) => i.code === "structured-dependency-invalid",
      ),
    ).toBe(true);
  });

  it("rejects malformed SVGs and SVGs leaking hiddenQuantities in <text>, <title>, or aria-label", () => {
    const pureBase = buildSampleCandidates()[8]; // wastedEnergyJ = 4000

    const malformedSvg = verifyCandidateWithGate({
      ...pureBase,
      id: "malformed-svg",
      svgMarkupOverride:
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 200"><g><line x1="0" y1="0" x2="10" y2="10"/></svg>',
    });
    expect(malformedSvg.evaluation.valid).toBe(false);
    expect(
      malformedSvg.evaluation.issues.some((i) => i.code === "svg-xml-invalid"),
    ).toBe(true);

    const leakInText = verifyCandidateWithGate({
      ...pureBase,
      id: "leak-svg-text",
      svgMarkupOverride:
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 200"><rect x="10" y="10" width="80" height="40"/><text x="50" y="30">Wasted = 4000 J</text></svg>',
    });
    expect(leakInText.evaluation.valid).toBe(false);
    expect(
      leakInText.evaluation.issues.some((i) => i.code === "svg-answer-leak"),
    ).toBe(true);

    const leakInAriaLabel = verifyCandidateWithGate({
      ...pureBase,
      id: "leak-svg-aria",
      svgMarkupOverride:
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 200" aria-label="Winch diagram showing 4.00e3 J loss"><rect x="10" y="10" width="80" height="40"/></svg>',
    });
    expect(leakInAriaLabel.evaluation.valid).toBe(false);
    expect(
      leakInAriaLabel.evaluation.issues.some(
        (i) => i.code === "svg-answer-leak",
      ),
    ).toBe(true);

    const leakInTitle = verifyCandidateWithGate({
      ...pureBase,
      id: "leak-svg-title",
      svgMarkupOverride:
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 200"><title>wastedEnergyJ = 4000</title><rect x="10" y="10" width="80" height="40"/></svg>',
    });
    expect(leakInTitle.evaluation.valid).toBe(false);
    expect(
      leakInTitle.evaluation.issues.some((i) => i.code === "svg-answer-leak"),
    ).toBe(true);
  });

  it("rejects near-duplicate stems colliding with existing shard items", () => {
    const sample = buildSampleCandidates()[0];
    const first = verifyCandidateWithGate(sample);
    expect(first.evaluation.valid).toBe(true);

    const nearClone: CandidateQuestionInput = {
      ...sample,
      id: "sp-graphs-mcq-clone",
      stem: "An inspection rover travels along a straight rail! The velocity-time graph shows its motion over an 8.0 s interval. What total distance does the rover travel during the 8.0 s?",
    };
    const second = verifyCandidateWithGate(nearClone, {
      existingShardItems: [
        {
          id: sample.id,
          stem: sample.stem,
          stemFingerprint: first.evaluation.stemFingerprint,
        },
      ],
    });
    expect(second.evaluation.valid).toBe(false);
    expect(
      second.evaluation.issues.some((i) => i.code === "near-duplicate-stem"),
    ).toBe(true);
  });

  it("BLOCKER 1 regression: rejects quantitative MCQs missing resolvable targetQuantityKey (0 or 2 hiddenQuantities) and blocks qualitative-mode numeric bypass", () => {
    const graphsMcq = buildSampleCandidates()[0]; // sp-graphs-mcq-001, true distanceM = 27.0 m
    const forgedOptions = graphsMcq.options!.map((opt) =>
      opt.isCorrect ? { ...opt, text: "987654 units" } : opt,
    );

    // Case A: 2 hiddenQuantities, targetQuantityKey removed, wrong option "987654 units"
    const twoHiddenNoTarget: CandidateQuestionInput = {
      ...graphsMcq,
      id: "sp-graphs-mcq-bypass-2hidden",
      targetQuantityKey: undefined,
      hiddenQuantities: ["distanceM", "displacementM"],
      options: forgedOptions,
    };
    const resTwoHidden = verifyCandidateWithGate(twoHiddenNoTarget);
    expect(resTwoHidden.evaluation.valid).toBe(false);
    expect(
      resTwoHidden.evaluation.issues.some(
        (i) => i.code === "ground-truth-mismatch",
      ),
    ).toBe(true);

    // Case B: 0 hiddenQuantities, targetQuantityKey removed, wrong option "987654 units"
    const zeroHiddenNoTarget: CandidateQuestionInput = {
      ...graphsMcq,
      id: "sp-graphs-mcq-bypass-0hidden",
      targetQuantityKey: undefined,
      hiddenQuantities: [],
      options: forgedOptions,
    };
    const resZeroHidden = verifyCandidateWithGate(zeroHiddenNoTarget);
    expect(resZeroHidden.evaluation.valid).toBe(false);
    expect(
      resZeroHidden.evaluation.issues.some(
        (i) => i.code === "ground-truth-mismatch",
      ),
    ).toBe(true);

    // Case C: Attempting to abuse targetMode: "qualitative" with numeric option "987654 units"
    const fakeQualitativeNumeric: CandidateQuestionInput = {
      ...graphsMcq,
      id: "sp-graphs-mcq-fake-qualitative",
      targetMode: "qualitative",
      targetQuantityKey: undefined,
      hiddenQuantities: [],
      options: forgedOptions,
    };
    const resFakeQual = verifyCandidateWithGate(fakeQualitativeNumeric);
    expect(resFakeQual.evaluation.valid).toBe(false);
    expect(
      resFakeQual.evaluation.issues.some(
        (i) => i.code === "ground-truth-mismatch",
      ),
    ).toBe(true);

    // Case D: Legitimate qualitative MCQ verified against a non-numeric solver classification
    registerVisualModule("em-induction", {
      validate: () => ({ valid: true, issues: [] }),
      solve: () => ({
        inducedCurrentSense: "counterclockwise",
      }),
      render: () =>
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 200"><circle cx="150" cy="100" r="50"/></svg>',
    });

    const validQualitativeMcq: CandidateQuestionInput = {
      id: "sp-em-qualitative-ok",
      conceptId: "lenz-law",
      templateArchetype: "increasing-into-page-flux",
      seed: 901,
      syllabi: [{ syllabus: "ib", level: "HL", topicId: "D.3" }],
      format: "mcq",
      targetMode: "qualitative",
      targetQuantityKey: "inducedCurrentSense",
      difficulty: "foundation",
      domain: "em-induction",
      scenarioSpec: { kind: "lenz-ring" },
      hiddenQuantities: ["inducedCurrentSense"],
      requiredGivens: [],
      stem: "A conducting ring lies in the plane of the page while a uniform magnetic field directed into the page increases steadily. What is the sense of the induced current in the ring?",
      options: [
        {
          label: "A",
          text: "Clockwise around the ring",
          isCorrect: false,
          distractorRationale: "Applies right-hand grip rule to the external field rather than the opposing induced field.",
        },
        {
          label: "B",
          text: "Counterclockwise around the ring",
          isCorrect: true,
        },
        {
          label: "C",
          text: "Radially outward",
          isCorrect: false,
          distractorRationale: "Confuses closed-loop induced emf with radial Hall deflection.",
        },
        {
          label: "D",
          text: "Zero induced current",
          isCorrect: false,
          distractorRationale: "Assumes uniform spatial field means constant magnetic flux despite dB/dt > 0.",
        },
      ],
      workedSolution:
        "By Lenz's law, the induced magnetic flux opposes the increasing into-the-page flux, pointing out of the page and driving a counterclockwise current.",
      markScheme: [
        {
          code: "A1",
          criterion: "Identifies counterclockwise induced current by Lenz's law.",
          marks: 1,
        },
      ],
      totalMarks: 1,
    };
    expect(verifyCandidateWithGate(validQualitativeMcq).evaluation.valid).toBe(
      true,
    );

    const wrongQualitativeMcq: CandidateQuestionInput = {
      ...validQualitativeMcq,
      id: "sp-em-qualitative-wrong",
      options: validQualitativeMcq.options!.map((o) =>
        o.label === "A"
          ? { label: "A", text: o.text, isCorrect: true }
          : o.label === "B"
            ? {
                label: "B",
                text: o.text,
                isCorrect: false,
                distractorRationale: "Reversed.",
              }
            : o,
      ),
    };
    const resWrongQual = verifyCandidateWithGate(wrongQualitativeMcq);
    expect(resWrongQual.evaluation.valid).toBe(false);
    expect(
      resWrongQual.evaluation.issues.some(
        (i) => i.code === "ground-truth-mismatch",
      ),
    ).toBe(true);
  });

  it("BLOCKER 2 regression: rejects structured items when numeric parts omit targetQuantityKey or item has zero solver-checked quantitative parts", () => {
    const graphsStruct = buildSampleCandidates()[1]; // sp-graphs-struct-002

    // Case A: Every part's targetQuantityKey removed and expectedAnswer set to "987654 units"
    const allBypassed: CandidateQuestionInput = {
      ...graphsStruct,
      id: "sp-graphs-struct-bypass-all",
      parts: graphsStruct.parts!.map((part) => ({
        ...part,
        targetQuantityKey: undefined,
        expectedAnswer: "987654 units",
      })),
    };
    const resAll = verifyCandidateWithGate(allBypassed);
    expect(resAll.evaluation.valid).toBe(false);
    expect(
      resAll.evaluation.issues.some((i) => i.code === "ground-truth-mismatch"),
    ).toBe(true);

    // Case B: Only part (b) omits targetQuantityKey while claiming numeric answer "987654 units"
    const singlePartBypassed: CandidateQuestionInput = {
      ...graphsStruct,
      id: "sp-graphs-struct-bypass-one",
      parts: graphsStruct.parts!.map((part) =>
        part.partId === "b"
          ? { ...part, targetQuantityKey: undefined, expectedAnswer: "987654 units" }
          : part,
      ),
    };
    const resOne = verifyCandidateWithGate(singlePartBypassed);
    expect(resOne.evaluation.valid).toBe(false);
    expect(
      resOne.evaluation.issues.some((i) => i.code === "ground-truth-mismatch"),
    ).toBe(true);

    // Case C: Quantitative structured item with 0 solver-checked parts even if prose avoids digits
    const zeroCheckedParts: CandidateQuestionInput = {
      ...graphsStruct,
      id: "sp-graphs-struct-zero-quant",
      parts: graphsStruct.parts!.map((part) => ({
        ...part,
        targetQuantityKey: undefined,
        expectedAnswer: "Motion decelerates uniformly along straight rail",
        workingSteps: ["Read slope qualitatively from velocity-time graph"],
      })),
    };
    const resZeroChecked = verifyCandidateWithGate(zeroCheckedParts);
    expect(resZeroChecked.evaluation.valid).toBe(false);
    expect(
      resZeroChecked.evaluation.issues.some(
        (i) => i.code === "ground-truth-mismatch",
      ),
    ).toBe(true);

    // Case D: Mixed structured item with 1 valid qualitative conceptual part + solver-checked quantitative parts passes
    const mixedStructured: CandidateQuestionInput = {
      ...graphsStruct,
      id: "sp-graphs-struct-mixed-ok",
      totalMarks: 6,
      parts: [
        {
          partId: "a",
          prompt: "State the physical feature of the velocity–time graph that represents acceleration.",
          marks: 1,
          targetMode: "qualitative",
          expectedAnswer: "Gradient of the velocity–time line",
          workingSteps: ["Identify acceleration as rate of change of velocity, given by graph gradient."],
        },
        ...graphsStruct.parts!.map((p, idx) => ({
          ...p,
          partId: idx === 0 ? "b" : idx === 1 ? "c" : "d",
          dependsOnPartIds: p.dependsOnPartIds?.map(() => "b"),
        })),
      ],
      markScheme: [
        {
          code: "B1",
          partId: "a",
          criterion: "States gradient (or slope) of the velocity–time graph.",
          marks: 1,
        },
        ...graphsStruct.markScheme.map((m) => ({
          ...m,
          partId: m.partId === "a" ? "b" : m.partId === "b" ? "c" : "d",
        })),
      ],
    };
    expect(verifyCandidateWithGate(mixedStructured).evaluation.valid).toBe(true);
  });

  it("Numeric extraction & qualitative prose regression: ignores kebab-case slugs, ordinals, dimensions, and multi-letter subscripts while preserving real numbers and spaced '2 d'", () => {
    expect(extractNumbersFromPhysicsText("projectile-motion-2d")).toEqual([]);
    expect(extractNumbersFromPhysicsText("dc-4-terminal-sensing")).toEqual([]);
    expect(extractNumbersFromPhysicsText("unseen-post-freeze-4")).toEqual([]);
    expect(extractNumbersFromPhysicsText("4-terminal bridge")).toEqual([]);
    expect(
      extractNumbersFromPhysicsText(
        "According to Newton's 2nd law in 3D (and 2D) motion, KE_1 equals KE_2 and Ek_2 = theta_1",
      ),
    ).toEqual([]);

    // Preserves spaced "2 d", signed decimals "-4.5 m s^-1", SI units "4.00 Ω", and scientific notation "1.01e-3"
    const spacedD = extractNumbersFromPhysicsText("2 d");
    expect(spacedD).toHaveLength(1);
    expect(spacedD[0]).toMatchObject({ rawValue: 2, unitToken: "d" });

    const signedVel = extractNumbersFromPhysicsText("-4.5 m s^-1 and 4.00 Ω and 1.01e-3 T");
    expect(signedVel.map((m) => m.rawValue)).toEqual([-4.5, 4, 1.01e-3]);

    // Qualitative MCQ and qualitative structured subpart with "Newton's 2nd law in 2D motion, KE_1 equals KE_2" pass cleanly
    registerVisualModule("mechanics", {
      validate: () => ({ valid: true, issues: [] }),
      solve: () => ({
        collisionType: "kinetic energy conserved",
        finalSpeedMs: 6.0,
      }),
      render: () =>
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 180"><line x1="10" y1="90" x2="290" y2="90"/></svg>',
    });

    const qualMcqWithOrdinalsAndSubscripts: CandidateQuestionInput = {
      id: "sp-mech-qual-2nd-law-2d",
      conceptId: "elastic-2d-scattering",
      templateArchetype: "equal-mass-2d-glancing",
      seed: 915,
      syllabi: [{ syllabus: "alevel", level: "Y12", topicId: "3.4.1" }],
      format: "mcq",
      targetMode: "qualitative",
      targetQuantityKey: "collisionType",
      difficulty: "standard",
      domain: "mechanics",
      scenarioSpec: { kind: "elastic-2d" },
      hiddenQuantities: ["collisionType"],
      requiredGivens: [],
      stem: "In an isolated elastic collision in 2D space, how does total kinetic energy before impact compare with after impact?",
      options: [
        {
          label: "A",
          text: "According to Newton's 2nd law in 2D motion, KE_1 equals KE_2 (kinetic energy conserved)",
          isCorrect: true,
        },
        {
          label: "B",
          text: "KE_1 is greater than KE_2 in 2D collisions",
          isCorrect: false,
          distractorRationale: "Confuses elastic 2D collisions with inelastic impacts.",
        },
        {
          label: "C",
          text: "KE_1 is less than KE_2",
          isCorrect: false,
          distractorRationale: "Violates conservation of energy.",
        },
        {
          label: "D",
          text: "Only 1st-order momentum components are conserved",
          isCorrect: false,
          distractorRationale: "Ignores kinetic energy conservation in elastic collisions.",
        },
      ],
      workedSolution:
        "In an elastic 2D collision, total kinetic energy conserved means KE_1 equals KE_2.",
      markScheme: [
        {
          code: "A1",
          criterion: "States kinetic energy conserved so KE_1 equals KE_2 (A).",
          marks: 1,
        },
      ],
      totalMarks: 1,
    };
    const qualMcqResult = verifyCandidateWithGate(qualMcqWithOrdinalsAndSubscripts);
    expect({
      valid: qualMcqResult.evaluation.valid,
      issues: qualMcqResult.evaluation.issues,
    }).toEqual({ valid: true, issues: [] });

    // Structured question with a qualitative subpart referencing Newton's 2nd law, 2D, and KE_1 / KE_2 + quantitative subpart
    const structWithQualSubpart: CandidateQuestionInput = {
      id: "sp-mech-struct-2nd-law-2d",
      conceptId: "elastic-2d-scattering",
      templateArchetype: "glider-2d-speed",
      seed: 916,
      syllabi: [{ syllabus: "ib", level: "SL", topicId: "A.2" }],
      format: "structured",
      difficulty: "standard",
      domain: "mechanics",
      scenarioSpec: { kind: "elastic-2d" },
      hiddenQuantities: ["finalSpeedMs"],
      requiredGivens: [],
      stem: "Two gliders interact elastically on a frictionless 2D air table.",
      parts: [
        {
          partId: "a",
          prompt: "State the kinetic energy condition for an elastic 2D collision.",
          marks: 1,
          targetMode: "qualitative",
          expectedAnswer:
            "By Newton's 2nd and 3rd laws in 2D elastic motion, total KE_1 equals total KE_2.",
          workingSteps: ["In a 2D elastic collision, Ek_1 and Ek_2 are equal."],
        },
        {
          partId: "b",
          prompt: "State the final speed of glider X.",
          marks: 1,
          targetQuantityKey: "finalSpeedMs",
          expectedAnswer: "6.00 m s⁻¹",
          workingSteps: ["Final speed = 6.00 m s⁻¹."],
        },
      ],
      workedSolution:
        "(a) Total KE_1 equals KE_2 in an elastic 2D collision. (b) Final speed is 6.00 m s⁻¹.",
      markScheme: [
        { code: "B1", partId: "a", criterion: "KE_1 equals KE_2.", marks: 1 },
        { code: "A1", partId: "b", criterion: "6.00 m s⁻¹.", marks: 1 },
      ],
      totalMarks: 2,
    };
    expect(verifyCandidateWithGate(structWithQualSubpart).evaluation.valid).toBe(
      true,
    );
  });

  it("NCUK v3 qualitative MCQ: allows incidental prose numerals when primaryKey resolves to verified string (>= 3 chars) and option has >= 3 prose words, while still rejecting numeric bypasses", () => {
    registerVisualModule("graphs", {
      validate: () => ({ valid: true, issues: [] }),
      solve: () => ({
        ivBehavior: "straight line through the origin with constant gradient",
        diodeFeature: "sharp rise in forward current above threshold",
        shortTag: "ok",
        bareTag: "units",
      }),
      render: () =>
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 200"><line x1="20" y1="180" x2="280" y2="20"/></svg>',
    });

    const ohmicIvMcq: CandidateQuestionInput = {
      id: "sp-v3-ncuk-qual-iv-001",
      conceptId: "ohms-law-iv-characteristics",
      templateArchetype: "component-iv-curve-and-led-procedure",
      seed: 72_000_001,
      syllabi: [
        {
          syllabus: "ncuk",
          level: "IFY-S1",
          topicId: "ncuk-ac4",
          subtopicId: "ncuk-ac4-2",
        },
      ],
      format: "mcq",
      questionStyle: "qualitative",
      targetMode: "qualitative",
      targetQuantityKey: "ivBehavior",
      difficulty: "foundation",
      domain: "graphs",
      scenarioSpec: { kind: "iv-curve" },
      hiddenQuantities: ["ivBehavior"],
      requiredGivens: [],
      stem: "An ohmic metallic conductor at constant temperature is plotted with current I on the y-axis and potential difference V on the x-axis. Which description matches its I–V graph?",
      options: [
        {
          label: "A",
          text: "A straight line through the origin with constant gradient = 1/R",
          isCorrect: true,
        },
        {
          label: "B",
          text: "A straight line through the origin with constant gradient = R",
          isCorrect: false,
          distractorRationale:
            "Inverts the gradient of an I–V plot (gradient is I/V = 1/R, not V/I).",
        },
        {
          label: "C",
          text: "An S-shaped curve flattening toward the voltage axis at high current",
          isCorrect: false,
          distractorRationale:
            "Describes a non-ohmic filament lamp whose lattice temperature increases.",
        },
        {
          label: "D",
          text: "Negligible current below a 0.6 V knee followed by a steep vertical rise",
          isCorrect: false,
          distractorRationale:
            "Describes a semiconductor diode rather than an ohmic metallic resistor.",
        },
      ],
      workedSolution:
        "For an ohmic conductor at constant temperature, I = V/R gives a straight line through the origin with constant gradient = 1/R (A).",
      markScheme: [
        {
          code: "A1",
          criterion:
            "Identifies straight line through the origin with constant gradient = 1/R (A).",
          marks: 1,
        },
      ],
      totalMarks: 1,
    };

    const ohmicExec = verifyCandidateWithGate(ohmicIvMcq);
    expect({
      valid: ohmicExec.evaluation.valid,
      issues: ohmicExec.evaluation.issues,
    }).toEqual({ valid: true, issues: [] });

    // Verify optional questionStyle propagates into distillation-trace metadata ONLY when set
    const bankItemWithStyle: SixthPhysicsBankItem = {
      schemaVersion: SIXTHPHYSICS_BANK_ITEM_SCHEMA_VERSION,
      id: ohmicIvMcq.id,
      familyGroupKey: `${ohmicIvMcq.conceptId}::${ohmicIvMcq.templateArchetype}`,
      syllabi: ohmicIvMcq.syllabi,
      format: "mcq",
      questionStyle: "qualitative",
      difficulty: ohmicIvMcq.difficulty,
      visualFamily: "graphs",
      stem: ohmicIvMcq.stem,
      svgMarkup: ohmicExec.effectiveSvgMarkup,
      options: ohmicIvMcq.options as SixthPhysicsBankItem["options"],
      correctOptionIndex: ohmicExec.correctOptionIndex,
      workedSolution: ohmicIvMcq.workedSolution,
      markScheme: ohmicIvMcq.markScheme,
      totalMarks: 1,
      verifiedQuantities: ohmicExec.solveOutput!.quantities,
      provenance: {
        domain: "graphs",
        conceptId: ohmicIvMcq.conceptId,
        templateArchetype: ohmicIvMcq.templateArchetype,
        familyGroupKey: `${ohmicIvMcq.conceptId}::${ohmicIvMcq.templateArchetype}`,
        seed: ohmicIvMcq.seed,
        shardId: "ncuk-v3-qual-exam",
        generatorModel: "gemini-4-carbon-high",
        solverId: ohmicExec.solveOutput!.solverId,
        stemFingerprint: ohmicExec.evaluation.stemFingerprint,
        svgFingerprint: ohmicExec.evaluation.svgFingerprint,
        split: "train",
        createdAt: "2026-11-20T18:00:00.000Z",
      },
    };
    const traceWithStyle = buildQwenDistillationTrace({
      candidate: ohmicIvMcq,
      bankItem: bankItemWithStyle,
      split: "train",
    });
    expect(traceWithStyle.metadata.questionStyle).toBe("qualitative");

    const { questionStyle: _dropCandStyle, ...candWithoutStyle } = ohmicIvMcq;
    const { questionStyle: _dropItemStyle, ...itemWithoutStyle } =
      bankItemWithStyle;
    void _dropCandStyle;
    void _dropItemStyle;
    const traceWithoutStyle = buildQwenDistillationTrace({
      candidate: candWithoutStyle,
      bankItem: itemWithoutStyle,
      split: "train",
    });
    expect("questionStyle" in traceWithoutStyle.metadata).toBe(false);

    // Diode knee voltage prose numeral (0.6 V knee) also passes cleanly
    const diodeMcq: CandidateQuestionInput = {
      ...ohmicIvMcq,
      id: "sp-v3-ncuk-qual-iv-002",
      targetQuantityKey: "diodeFeature",
      hiddenQuantities: ["diodeFeature"],
      options: [
        {
          label: "A",
          text: "Zero current in reverse bias and a sharp rise in forward current above threshold near the 0.6 V knee",
          isCorrect: true,
        },
        {
          label: "B",
          text: "Symmetric straight line passing through the origin",
          isCorrect: false,
          distractorRationale: "Describes an ohmic resistor, not a diode.",
        },
        {
          label: "C",
          text: "Constant current independent of applied potential difference",
          isCorrect: false,
          distractorRationale: "Confuses a diode with an ideal current source.",
        },
        {
          label: "D",
          text: "Decreasing current as forward potential difference increases",
          isCorrect: false,
          distractorRationale: "Contradicts forward-bias conduction.",
        },
      ],
      workedSolution:
        "A semiconductor diode exhibits a sharp rise in forward current above threshold (~0.6 V) and negligible reverse-bias current (A).",
      markScheme: [
        {
          code: "A1",
          criterion:
            "States sharp rise in forward current above threshold near 0.6 V (A).",
          marks: 1,
        },
      ],
    };
    expect(verifyCandidateWithGate(diodeMcq).evaluation.valid).toBe(true);

    // Anti-bypass: bare numeric option ("987654 units") is STILL rejected even with a matching string key
    const bareNumericBypass: CandidateQuestionInput = {
      ...ohmicIvMcq,
      id: "sp-v3-ncuk-qual-bypass-bare",
      targetQuantityKey: "bareTag",
      hiddenQuantities: ["bareTag"],
      options: ohmicIvMcq.options!.map((o) =>
        o.isCorrect ? { ...o, text: "987654 units" } : o,
      ),
      workedSolution: "Bypass attempt: 987654 units.",
      markScheme: [{ code: "A1", criterion: "987654 units.", marks: 1 }],
    };
    const bareBypassRes = verifyCandidateWithGate(bareNumericBypass);
    expect(bareBypassRes.evaluation.valid).toBe(false);
    expect(
      bareBypassRes.evaluation.issues.some(
        (i) => i.code === "ground-truth-mismatch",
      ),
    ).toBe(true);

    // Anti-bypass: short (< 3 char) string truth ("ok") cannot unlock incidental numerals
    const shortKeyBypass: CandidateQuestionInput = {
      ...ohmicIvMcq,
      id: "sp-v3-ncuk-qual-bypass-short",
      targetQuantityKey: "shortTag",
      hiddenQuantities: ["shortTag"],
      options: ohmicIvMcq.options!.map((o) =>
        o.isCorrect
          ? { ...o, text: "Answer is ok and equals 42.5 V across load" }
          : o,
      ),
      workedSolution: "Answer is ok and equals 42.5 V.",
      markScheme: [{ code: "A1", criterion: "States ok (A).", marks: 1 }],
    };
    expect(verifyCandidateWithGate(shortKeyBypass).evaluation.valid).toBe(
      false,
    );
  });

  it("NCUK v3 10-mark 5-part IFYPH005 structured item: mixes quantitative + 'Show clearly that' + auxiliary qualitative B1 subparts with prose numerals, while rejecting bypasses & >4m unkeyed parts", () => {
    registerVisualModule("circuits", {
      validate: () => ({ valid: true, issues: [] }),
      solve: () => ({
        internalResistanceOhm: 1.25,
        emfV: 6.02,
        wireResistivityOhmM: 4.8e-7,
      }),
      render: () =>
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 220"><rect x="40" y="40" width="280" height="140"/></svg>',
    });

    const ncuk10MarkExam: CandidateQuestionInput = {
      id: "sp-v3-ncuk-ac4-internal-r-10m-001",
      conceptId: "emf-internal-resistance",
      templateArchetype: "experimental-internal-resistance-and-wire-eval-10m",
      seed: 70_000_012,
      syllabi: [
        {
          syllabus: "ncuk",
          level: "IFY-S1",
          topicId: "ncuk-ac4",
          subtopicId: "ncuk-ac4-3",
        },
      ],
      format: "structured",
      questionStyle: "mixed-exam",
      difficulty: "higher",
      domain: "circuits",
      scenarioSpec: {
        kind: "ncuk-internal-r-experiment-10m",
        i1A: 0.4,
        v1V: 5.52,
        i2A: 1.6,
        v2V: 4.02,
        wireLengthM: 0.5,
        wireAreaM2: 6.0e-7,
        wireVoltageV: 0.4,
        wireCurrentA: 1.0,
      },
      hiddenQuantities: [
        "internalResistanceOhm",
        "emfV",
        "wireResistivityOhmM",
      ],
      requiredGivens: [
        { name: "i1A", value: 0.4, unit: "A", source: "stem" },
        { name: "v1V", value: 5.52, unit: "V", source: "stem" },
        { name: "i2A", value: 1.6, unit: "A", source: "stem" },
        { name: "v2V", value: 4.02, unit: "V", source: "stem" },
      ],
      stem: "A student investigates a DC cell of unknown emf ε and internal resistance r using a variable resistor, switch, ammeter, and high-resistance voltmeter. Two steady pairs of readings are (0.40 A, 5.52 V) and (1.60 A, 4.02 V). A 0.50 m sample of the connecting wire (cross-sectional area 6.0 × 10⁻⁷ m²) drops 0.40 V when carrying 1.0 A.",
      parts: [
        {
          partId: "a-i",
          prompt:
            "Describe the experimental procedure used to obtain a reliable set of current and terminal potential difference readings.",
          marks: 2,
          targetMode: "qualitative",
          expectedAnswer:
            "Adjust the variable resistor across its range to record 5 to 6 pairs of ammeter current and voltmeter p.d. readings, opening the switch between readings to avoid heating or discharging the cell.",
          workingSteps: [
            "Vary resistance in steps and record 5 to 6 paired readings of I and V in a results table.",
            "Close the switch only briefly during each measurement so the cell temperature and emf remain constant.",
          ],
        },
        {
          partId: "a-ii",
          prompt:
            "Describe the shape of the V against I graph and state how ε and r are obtained from it.",
          marks: 2,
          targetMode: "qualitative",
          expectedAnswer:
            "A straight line with negative gradient equal to -r and y-intercept equal to the cell emf ε at I = 0.",
          workingSteps: [
            "From V = ε − Ir, plotting V on the y-axis against I on the x-axis yields a straight line of negative gradient.",
            "The y-intercept at I = 0 equals ε and the magnitude of the gradient equals r.",
          ],
        },
        {
          partId: "a-iii",
          prompt:
            "Using the two readings, calculate r and show clearly that the cell emf is approximately 6.0 V.",
          marks: 3,
          dependsOnPartIds: ["a-ii"],
          targetQuantityKey: "emfV",
          expectedAnswer: "r = 1.25 Ω; ε = 6.02 V (≈ 6.0 V to 2 s.f.)",
          workingSteps: [
            "r = −ΔV / ΔI = (5.52 − 4.02) / (1.60 − 0.40) = 1.50 / 1.20 = 1.25 Ω.",
            "ε = V + Ir = 5.52 + 0.40 × 1.25 = 6.02 V (rounds to 6.0 V).",
          ],
        },
        {
          partId: "b-i",
          prompt: "Calculate the resistivity ρ of the connecting wire.",
          marks: 2,
          targetQuantityKey: "wireResistivityOhmM",
          expectedAnswer: "4.80 × 10⁻⁷ Ω m",
          workingSteps: [
            "R = V / I = 0.40 / 1.0 = 0.40 Ω.",
            "ρ = RA / L = (0.40 × 6.0 × 10⁻⁷) / 0.50 = 4.80 × 10⁻⁷ Ω m.",
          ],
        },
        {
          partId: "b-ii",
          prompt:
            "State and explain whether using 2.25 m of connecting wire significantly affects the measured emf intercept.",
          marks: 1,
          dependsOnPartIds: ["b-i"],
          targetMode: "qualitative",
          expectedAnswer:
            "No significant effect on the measured emf because at the I = 0 intercept no current flows through the 2.25 m leads, so the p.d. dropped across the connecting wire is zero.",
          workingSteps: [
            "At I = 0, wire voltage drop I R_wire = 0 regardless of the 2.25 m length, leaving the y-intercept ε unchanged.",
          ],
        },
      ],
      workedSolution:
        "(a-i) Adjust the variable resistor for 5 to 6 pairs of (I, V) readings, opening the switch between measurements. (a-ii) Straight line of negative gradient (-r) and y-intercept ε. (a-iii) r = 1.50 / 1.20 = 1.25 Ω and ε = 5.52 + 0.40 × 1.25 = 6.02 V (≈ 6.0 V). (b-i) ρ = RA / L = 4.80 × 10⁻⁷ Ω m. (b-ii) At I = 0, zero current flows so the 2.25 m leads drop zero p.d. and do not alter ε.",
      markScheme: [
        {
          code: "B1",
          partId: "a-i",
          criterion:
            "Adjusts variable resistor to take 5 to 6 paired readings of I and V.",
          marks: 1,
        },
        {
          code: "B1",
          partId: "a-i",
          criterion:
            "Opens switch between readings to prevent heating/discharge.",
          marks: 1,
        },
        {
          code: "B1",
          partId: "a-ii",
          criterion: "Straight line with negative gradient equal to -r.",
          marks: 1,
        },
        {
          code: "B1",
          partId: "a-ii",
          criterion: "y-intercept at I = 0 gives emf ε.",
          marks: 1,
        },
        {
          code: "M1",
          partId: "a-iii",
          criterion: "Computes r = (5.52 − 4.02) / (1.60 − 0.40) = 1.25 Ω.",
          marks: 1,
        },
        {
          code: "A1",
          partId: "a-iii",
          criterion: "Substitutes into ε = V + Ir = 5.52 + 0.40 × 1.25.",
          marks: 1,
        },
        {
          code: "A1",
          partId: "a-iii",
          criterion: "Shows clearly ε = 6.02 V (≈ 6.0 V).",
          marks: 1,
        },
        {
          code: "M1",
          partId: "b-i",
          criterion: "Applies R = V/I and ρ = RA/L.",
          marks: 1,
        },
        {
          code: "A1",
          partId: "b-i",
          criterion: "Obtains ρ = 4.80 × 10⁻⁷ Ω m.",
          marks: 1,
        },
        {
          code: "B1",
          partId: "b-ii",
          criterion:
            "Explains that at I = 0 zero p.d. is dropped across the 2.25 m leads, so emf is unaffected.",
          marks: 1,
        },
      ],
      totalMarks: 10,
    };

    const exec = verifyCandidateWithGate(ncuk10MarkExam);
    expect({
      valid: exec.evaluation.valid,
      issues: exec.evaluation.issues,
    }).toEqual({ valid: true, issues: [] });

    // Anti-bypass: attempting to sneak bare numeric answer into targetMode: "qualitative" subpart is REJECTED
    const sneakNumericQualPart: CandidateQuestionInput = {
      ...ncuk10MarkExam,
      id: "sp-v3-ncuk-bypass-bare-qual-part",
      parts: ncuk10MarkExam.parts!.map((p) =>
        p.partId === "b-ii"
          ? {
              ...p,
              expectedAnswer: "42.0 kg m s⁻²",
              workingSteps: ["= 42.0 kg m s⁻²"],
            }
          : p,
      ),
    };
    const sneakRes = verifyCandidateWithGate(sneakNumericQualPart);
    expect(sneakRes.evaluation.valid).toBe(false);
    expect(
      sneakRes.evaluation.issues.some(
        (i) => i.code === "ground-truth-mismatch",
      ),
    ).toBe(true);

    // Unkeyed auxiliary qualitative subpart exceeding 4 marks is REJECTED
    const oversizedAuxQual: CandidateQuestionInput = {
      ...ncuk10MarkExam,
      id: "sp-v3-ncuk-oversized-aux-qual",
      totalMarks: 13,
      parts: ncuk10MarkExam.parts!.map((p) =>
        p.partId === "a-i" ? { ...p, marks: 5 } : p,
      ),
      markScheme: [
        ...ncuk10MarkExam.markScheme,
        {
          code: "B1",
          partId: "a-i",
          criterion: "Extra procedural check 1.",
          marks: 1,
        },
        {
          code: "B1",
          partId: "a-i",
          criterion: "Extra procedural check 2.",
          marks: 1,
        },
        {
          code: "B1",
          partId: "a-i",
          criterion: "Extra procedural check 3.",
          marks: 1,
        },
      ],
    };
    const oversizedRes = verifyCandidateWithGate(oversizedAuxQual);
    expect(oversizedRes.evaluation.valid).toBe(false);
    expect(
      oversizedRes.evaluation.issues.some(
        (i) => i.code === "ground-truth-mismatch",
      ),
    ).toBe(true);
  });

  it("NCUK v3 numeric-checker: supports T/K = θ/°C + 273.2 tolerance and preserves atomic-scale numbers down to 1e-35 in stem fingerprints", () => {
    const celsiusMentions = extractNumbersFromPhysicsText(
      "Gas heated from 0 °C to 27 °C inside a sealed cylinder.",
    );
    expect(celsiusMentions).toHaveLength(2);
    expect(celsiusMentions[0].alternateConvertedValues).toEqual(
      expect.arrayContaining([273.15, 273.2, 273]),
    );
    expect(celsiusMentions[1].alternateConvertedValues).toEqual(
      expect.arrayContaining([300.15, 300.2, 300]),
    );

    // Verify thermal candidate using NCUK T = θ + 273.2 passes gate requiredGivens natively
    registerVisualModule("thermal", {
      validate: () => ({ valid: true, issues: [] }),
      solve: () => ({
        finalPressurePa: 1.2e5,
      }),
      render: () =>
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 180"><rect x="20" y="20" width="260" height="140"/></svg>',
    });

    const ncukKelvinCand: CandidateQuestionInput = {
      id: "sp-v3-ncuk-kelvin-273-2",
      conceptId: "ideal-gas-kinetic-theory",
      templateArchetype: "ncuk-pressure-law-kelvin",
      seed: 72_000_273,
      syllabi: [
        {
          syllabus: "ncuk",
          level: "IFY-S1",
          topicId: "ncuk-ac3",
          subtopicId: "ncuk-ac3-4",
        },
      ],
      format: "mcq",
      difficulty: "foundation",
      domain: "thermal",
      scenarioSpec: {
        kind: "pressure-law",
        initialTempK: 300.2,
        finalTempK: 360.2,
        initialPressurePa: 1.0e5,
      },
      hiddenQuantities: ["finalPressurePa"],
      requiredGivens: [
        { name: "initialTempK", value: 300.2, unit: "K", source: "stem" },
        { name: "finalTempK", value: 360.2, unit: "K", source: "stem" },
        { name: "initialPressurePa", value: 1.0e5, unit: "Pa", source: "stem" },
      ],
      targetQuantityKey: "finalPressurePa",
      stem: "A fixed mass of ideal gas in a rigid vessel at 1.00 × 10⁵ Pa is heated from 27 °C to 87 °C (take T/K = θ/°C + 273.2). What is the final pressure?",
      options: [
        { label: "A", text: "1.20 × 10⁵ Pa", isCorrect: true },
        {
          label: "B",
          text: "3.22 × 10⁵ Pa",
          isCorrect: false,
          distractorRationale: "Uses Celsius ratio 87 / 27 instead of kelvin.",
        },
        {
          label: "C",
          text: "8.33 × 10⁴ Pa",
          isCorrect: false,
          distractorRationale: "Inverts temperature ratio.",
        },
        {
          label: "D",
          text: "2.40 × 10⁵ Pa",
          isCorrect: false,
          distractorRationale: "Doubles pressure erroneously.",
        },
      ],
      workedSolution:
        "T₁ = 27 + 273.2 = 300.2 K, T₂ = 87 + 273.2 = 360.2 K. p₂ = 1.00 × 10⁵ × (360.2 / 300.2) = 1.20 × 10⁵ Pa (A).",
      markScheme: [
        {
          code: "A1",
          criterion: "Converts via +273.2 and obtains 1.20 × 10⁵ Pa (A).",
          marks: 1,
        },
      ],
      totalMarks: 1,
    };
    expect(verifyCandidateWithGate(ncukKelvinCand).evaluation.valid).toBe(true);

    // Stem fingerprint must NOT zero-clamp elementary charge (1.60e-19 C) or electron/proton masses (9.11e-31 / 1.67e-27 kg)
    const fpElectron = computeStemFingerprint(
      "A particle of charge 1.60 × 10⁻¹⁹ C and mass 9.11 × 10⁻³¹ kg accelerates across 500 V.",
    );
    const fpProton = computeStemFingerprint(
      "A particle of charge 1.60 × 10⁻¹⁹ C and mass 1.67 × 10⁻²⁷ kg accelerates across 500 V.",
    );
    const fpAlpha = computeStemFingerprint(
      "A particle of charge 3.20 × 10⁻¹⁹ C and mass 6.64 × 10⁻²⁷ kg accelerates across 500 V.",
    );
    expect(fpElectron).not.toBe(fpProton);
    expect(fpProton).not.toBe(fpAlpha);
  });
});
