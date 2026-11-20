import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  formatBatchAiGradeSummary,
  MockExamView,
  planBatchAiGradeQueue,
  runBatchAiGrading,
  type BatchAiGradeProgressState,
} from '@/components/sixthphysics/mock-exam-view';
import { QuestionCard } from '@/components/sixthphysics/question-card';
import {
  getMarkSchemeCriterionKey,
  haveMarksDivergedFromAi,
  isAiGraderEnabledForMode,
  resolveGradingSyllabus,
  StructuredInteraction,
} from '@/components/sixthphysics/structured-interaction';
import {
  APICUTS_SPONSOR,
  getFallbackManifest,
  type AiGradeResult,
  type AiGradeSuccessResponse,
  type MockPaperSession,
  type PublicBankItem,
  type PublicQuestionIndexRow,
} from '@/lib/sixthphysics-web';

const STRUCTURED_Q1: PublicBankItem = {
  id: 'waves-diffraction-grating-structured-199',
  familyGroupKey:
    'single-slit-diffraction-gratings::grating-lines-per-mm-diffraction-angle',
  conceptId: 'single-slit-diffraction-gratings',
  syllabi: [
    {
      syllabus: 'ib',
      level: 'HL',
      topicId: 'ib-theme-c',
      subtopicId: 'ib-c3-wave-phenomena',
    },
    {
      syllabus: 'alevel',
      level: 'Y13',
      topicId: 'alevel-sec3-waves',
      subtopicId: 'alevel-3-3-2-refraction-diffraction-interference',
    },
  ],
  format: 'structured',
  difficulty: 'higher',
  visualFamily: 'waves',
  stem: 'A monochromatic beam of wavelength 430 nm strikes a diffraction grating with 300 lines mm⁻¹ placed 1.6 m from a screen.',
  parts: [
    {
      partId: 'a',
      prompt: 'Calculate the slit spacing d in metres.',
      marks: 1,
      expectedAnswer: '3.33 × 10⁻⁶ m',
      workingSteps: ['d = 10⁻³ / 300 = 3.33 × 10⁻⁶ m.'],
    },
    {
      partId: 'b',
      prompt: 'Calculate the diffraction angle θ_3 of the n = 3 maximum.',
      marks: 2,
      expectedAnswer: '22.8°',
      workingSteps: ['sin θ = 3λ / d = 0.387 => θ = 22.8°.'],
    },
    {
      partId: 'c',
      prompt: 'Determine the screen distance y from n = 0 to n = 3.',
      marks: 3,
      expectedAnswer: '0.672 m',
      workingSteps: ['y = D tan θ = 1.6 × tan(22.8°) = 0.672 m.'],
    },
  ],
  workedSolution: '(a) 3.33 × 10⁻⁶ m. (b) 22.8°. (c) 0.672 m.',
  markScheme: [
    {
      code: 'A1',
      partId: 'a',
      criterion: 'Obtains d = 3.33 × 10⁻⁶ m.',
      marks: 1,
    },
    {
      code: 'M1',
      partId: 'b',
      criterion: 'Uses sin θ = nλ / d.',
      marks: 1,
    },
    {
      code: 'A1',
      partId: 'b',
      criterion: 'Obtains θ = 22.8°.',
      marks: 1,
    },
    {
      code: 'M1',
      partId: 'c',
      criterion: 'Recognises large-angle geometry y = D tan θ.',
      marks: 2,
    },
    {
      code: 'A1',
      partId: 'c',
      criterion: 'Obtains y = 0.672 m.',
      marks: 1,
    },
  ],
  totalMarks: 6,
};

const STRUCTURED_Q2: PublicBankItem = {
  ...STRUCTURED_Q1,
  id: 'mechanics-projectile-structured-202',
  familyGroupKey: 'kinematics-projectiles::angled-launch',
  conceptId: 'kinematics-projectiles',
  markScheme: [
    { code: 'M1', partId: 'a', criterion: 'Resolves initial velocity components.', marks: 1 },
    { code: 'A1', partId: 'a', criterion: 'Calculates flight time correctly.', marks: 1 },
  ],
  totalMarks: 2,
};

const STRUCTURED_Q3: PublicBankItem = {
  ...STRUCTURED_Q1,
  id: 'electricity-circuits-structured-203',
  familyGroupKey: 'dc-circuits::parallel-divider',
  conceptId: 'dc-circuits',
  markScheme: [
    { code: 'M1', partId: 'a', criterion: 'Finds combined parallel resistance.', marks: 1 },
    { code: 'A1', partId: 'a', criterion: 'Obtains terminal potential difference.', marks: 2 },
  ],
  totalMarks: 3,
};

const SAMPLE_AI_GRADE: AiGradeSuccessResponse = {
  questionId: STRUCTURED_Q1.id,
  provider: 'groq',
  model: 'qwen/qwen3.8-27b',
  cached: true,
  latencyMs: 310,
  earnedMarks: 4,
  totalMarks: 6,
  awardedKeys: [
    getMarkSchemeCriterionKey(STRUCTURED_Q1.markScheme[0], 0),
    getMarkSchemeCriterionKey(STRUCTURED_Q1.markScheme[1], 1),
    getMarkSchemeCriterionKey(STRUCTURED_Q1.markScheme[3], 3),
  ],
  criteria: [
    {
      key: getMarkSchemeCriterionKey(STRUCTURED_Q1.markScheme[0], 0),
      code: 'A1',
      partId: 'a',
      marks: 1,
      awarded: true,
      reason: 'Correctly converts 300 lines mm⁻¹ into d = 3.33 × 10⁻⁶ m.',
    },
    {
      key: getMarkSchemeCriterionKey(STRUCTURED_Q1.markScheme[1], 1),
      code: 'M1',
      partId: 'b',
      marks: 1,
      awarded: true,
      reason: 'Applies the grating equation d sin θ = nλ with n = 3.',
    },
    {
      key: getMarkSchemeCriterionKey(STRUCTURED_Q1.markScheme[2], 2),
      code: 'A1',
      partId: 'b',
      marks: 1,
      awarded: false,
      reason: 'Left angle in radians instead of degrees (expected 22.8°).',
    },
    {
      key: getMarkSchemeCriterionKey(STRUCTURED_Q1.markScheme[3], 3),
      code: 'M1',
      partId: 'c',
      marks: 2,
      awarded: true,
      reason: 'Uses exact y = D tan θ geometry.',
    },
    {
      key: getMarkSchemeCriterionKey(STRUCTURED_Q1.markScheme[4], 4),
      code: 'A1',
      partId: 'c',
      marks: 1,
      awarded: false,
      reason: 'Carry-over arithmetic slip gave 0.61 m instead of 0.672 m.',
    },
  ],
  overallFeedback:
    'Strong physics method across parts (a)–(c). Watch degree mode on $\\sin \\theta = 0.387$.',
  poweredBy: {
    name: APICUTS_SPONSOR.name,
    url: APICUTS_SPONSOR.url,
  },
};

function makeIndexRow(
  id: string,
  format: 'mcq' | 'structured',
  totalMarks: number
): PublicQuestionIndexRow {
  return {
    id,
    syllabi: STRUCTURED_Q1.syllabi,
    format,
    difficulty: 'standard',
    visualFamily: 'waves',
    totalMarks,
    hasSvg: false,
    chunkKey: 'waves',
    conceptId: 'test-concept',
    familyGroupKey: `family::${id}`,
  };
}

describe('StructuredInteraction AI Grader helpers & Practice Desk UI', () => {
  it('enforces mode gating, syllabus fallback, and manual edit detection', () => {
    expect(isAiGraderEnabledForMode('practice')).toBe(true);
    expect(isAiGraderEnabledForMode('mock-review')).toBe(true);
    expect(isAiGraderEnabledForMode('practice', false)).toBe(false);
    expect(isAiGraderEnabledForMode('mock-review', false)).toBe(false);
    // mock-live must NEVER enable AI grading regardless of prop override
    expect(isAiGraderEnabledForMode('mock-live')).toBe(false);
    expect(isAiGraderEnabledForMode('mock-live', true)).toBe(false);

    expect(resolveGradingSyllabus(STRUCTURED_Q1, 'alevel')).toBe('alevel');
    expect(resolveGradingSyllabus(STRUCTURED_Q1)).toBe('ib');
    expect(resolveGradingSyllabus({ syllabi: [] })).toBe('ib');

    expect(
      haveMarksDivergedFromAi(['0:a:A1', '1:b:M1'], ['1:b:M1', '0:a:A1'])
    ).toBe(false);
    expect(
      haveMarksDivergedFromAi(['0:a:A1'], ['0:a:A1', '1:b:M1'])
    ).toBe(true);
    expect(
      haveMarksDivergedFromAi(['0:a:A1', '2:b:A1'], ['0:a:A1', '1:b:M1'])
    ).toBe(true);
  });

  it('shows Mark my answer primary and dimmed AI Grade with tooltip when scratchpads are empty', () => {
    const html = renderToStaticMarkup(
      <StructuredInteraction
        item={STRUCTURED_Q1}
        mode="practice"
        onNextQuestion={() => undefined}
      />
    );

    expect(html).toContain('Skip');
    expect(html).toContain('Mark my answer');
    expect(html).toContain('AI Grade');
    expect(html).toContain('title="Write your working above first"');
    expect(html).toContain('aria-disabled="true"');
    expect(html).toContain('sp-key--idle');
    // Must not leak verified answers or rubric before reveal
    expect(html).not.toContain('0.672 m');
    expect(html).not.toContain('Examiner mark scheme');
  });

  it('promotes AI Grade to primary alongside Mark my answer when student typed working', () => {
    const html = renderToStaticMarkup(
      <StructuredInteraction
        item={STRUCTURED_Q1}
        mode="practice"
        defaultPartNotes={{ a: 'd = 1e-3 / 300 = 3.33e-6 m' }}
      />
    );

    expect(html).toContain('data-testid="ai-grade-button"');
    expect(html).toContain('AI Grade');
    expect(html).toContain('Mark my answer');
    expect(html).toContain('aria-disabled="false"');
    expect(html).not.toContain('Examiner mark scheme');
  });

  it('renders AI Examiner Feedback strip, model chip, APIcuts attribution, per-criterion notes, and manual-edit badge', () => {
    const matchingHtml = renderToStaticMarkup(
      <StructuredInteraction
        item={STRUCTURED_Q1}
        mode="mock-review"
        partNotes={{ a: '3.33e-6 m', b: 'sin theta = 0.387' }}
        checkedCriterionKeys={SAMPLE_AI_GRADE.awardedKeys}
        aiGradeResult={SAMPLE_AI_GRADE}
      />
    );

    expect(matchingHtml).toContain('AI Examiner Feedback');
    expect(matchingHtml).toContain('Qwen 3.8 27B');
    expect(matchingHtml).toContain('Cached');
    expect(matchingHtml).toContain('Re-grade with AI');
    expect(matchingHtml).toContain('/apicuts-logo.svg');
    expect(matchingHtml).toContain('href="https://apicuts.ai"');
    expect(matchingHtml).toContain('rel="noopener"');
    expect(matchingHtml).not.toContain('nofollow');
    expect(matchingHtml).toContain('Free AI grading via');
    expect(matchingHtml).toContain('APIcuts.ai');
    expect(matchingHtml).toContain('Strong physics method across parts');
    expect(matchingHtml).toContain('data-testid="ai-criterion-reason-0"');
    expect(matchingHtml).toContain('Correctly converts 300 lines');
    expect(matchingHtml).toContain('Left angle in radians instead of degrees');
    expect(matchingHtml).toContain('data-testid="ai-criterion-reason-4"');
    expect(matchingHtml).toContain('Carry-over arithmetic slip');
    expect(matchingHtml).toContain('4 / 6 marks');
    expect(matchingHtml).not.toContain('Edited manually');
    expect(matchingHtml).not.toContain('katex-error');

    // When student manually overrides a mark, show "Edited manually" badge
    const editedHtml = renderToStaticMarkup(
      <StructuredInteraction
        item={STRUCTURED_Q1}
        mode="mock-review"
        partNotes={{ a: '3.33e-6 m', b: 'sin theta = 0.387' }}
        checkedCriterionKeys={[
          ...SAMPLE_AI_GRADE.awardedKeys,
          getMarkSchemeCriterionKey(STRUCTURED_Q1.markScheme[2], 2),
        ]}
        aiGradeResult={SAMPLE_AI_GRADE}
      />
    );

    expect(editedHtml).toContain('Edited manually');
    expect(editedHtml).toContain('5 / 6 marks');
  });

  it('disables rubric AI Grade button with clear tooltip when mock-review has no typed working', () => {
    const html = renderToStaticMarkup(
      <StructuredInteraction
        item={STRUCTURED_Q1}
        mode="mock-review"
        partNotes={{}}
      />
    );

    expect(html).toContain('data-testid="rubric-ai-grade-button"');
    expect(html).toContain('disabled=""');
    expect(html).toContain('title="No written working to AI-grade"');
  });

  it('leaks ZERO AI grader UI, feedback, or answers in mock-live mode even if props are passed', () => {
    const html = renderToStaticMarkup(
      <QuestionCard
        item={STRUCTURED_Q1}
        mode="mock-live"
        activeSyllabus="ib"
        partNotes={{ a: 'd = 3.33e-6 m' }}
        aiGradeResult={SAMPLE_AI_GRADE}
        enableAiGrader={true}
      />
    );

    expect(html).toContain('d = 3.33e-6 m');
    expect(html).not.toContain('AI Grade');
    expect(html).not.toContain('AI Examiner Feedback');
    expect(html).not.toContain('APIcuts.ai');
    expect(html).not.toContain('Examiner mark scheme');
    expect(html).not.toContain('0.672 m');
  });

  it('forwards AI grade props through QuestionCard in mock-review mode', () => {
    const html = renderToStaticMarkup(
      <QuestionCard
        item={STRUCTURED_Q1}
        mode="mock-review"
        activeSyllabus="alevel"
        partNotes={{ a: '3.33e-6 m' }}
        checkedCriterionKeys={SAMPLE_AI_GRADE.awardedKeys}
        aiGradeResult={SAMPLE_AI_GRADE}
      />
    );

    expect(html).toContain('AI Examiner Feedback');
    expect(html).toContain('Qwen 3.8 27B');
    expect(html).toContain('APIcuts.ai');
  });
});

describe('Timed Mock Review Batch AI Auto-Grading queue & resilience', () => {
  const sampleSession: MockPaperSession = {
    sessionId: 'mock-test-1',
    config: {
      title: 'IB Physics Mixed Mock',
      syllabus: 'ib',
      formatMode: 'mixed',
      questionCount: 5,
      durationMinutes: 30,
    },
    questionRows: [
      makeIndexRow('mcq-1', 'mcq', 1),
      makeIndexRow(STRUCTURED_Q1.id, 'structured', 6),
      makeIndexRow('blank-structured-q', 'structured', 4),
      makeIndexRow(STRUCTURED_Q2.id, 'structured', 2),
      makeIndexRow(STRUCTURED_Q3.id, 'structured', 3),
    ],
    questionIds: [
      'mcq-1',
      STRUCTURED_Q1.id,
      'blank-structured-q',
      STRUCTURED_Q2.id,
      STRUCTURED_Q3.id,
    ],
    totalMarks: 16,
    durationSeconds: 1800,
    remainingSeconds: 600,
    status: 'review',
    currentIndex: 0,
    responses: {
      'mcq-1': { questionId: 'mcq-1', selectedOptionIndex: 0, flagged: false },
      [STRUCTURED_Q1.id]: {
        questionId: STRUCTURED_Q1.id,
        partNotes: { a: 'd = 3.33e-6 m' },
        flagged: false,
      },
      'blank-structured-q': {
        questionId: 'blank-structured-q',
        partNotes: { a: '   ' },
        flagged: false,
      },
      [STRUCTURED_Q2.id]: {
        questionId: STRUCTURED_Q2.id,
        partNotes: { a: 'u_y = u sin theta' },
        flagged: false,
      },
      [STRUCTURED_Q3.id]: {
        questionId: STRUCTURED_Q3.id,
        partNotes: { a: 'R_p = 12 ohm' },
        isSelfMarked: true,
        selfMarkedEarnedMarks: 3,
        flagged: false,
      },
    },
    startedAt: '2026-11-20T12:00:00.000Z',
  };

  const itemsById: Record<string, PublicBankItem> = {
    [STRUCTURED_Q1.id]: STRUCTURED_Q1,
    [STRUCTURED_Q2.id]: STRUCTURED_Q2,
    [STRUCTURED_Q3.id]: STRUCTURED_Q3,
  };

  it('plans batch queue by skipping MCQs, already-marked questions, and blank scratchpads', () => {
    const plan = planBatchAiGradeQueue(sampleSession, itemsById);

    expect(plan.gradable.map((g) => g.questionId)).toEqual([
      STRUCTURED_Q1.id,
      STRUCTURED_Q2.id,
    ]);
    expect(plan.gradable.map((g) => g.questionNumber)).toEqual([2, 4]);
    expect(plan.blankQuestionIds).toEqual(['blank-structured-q']);
    expect(plan.missingItemIds).toEqual([]);
  });

  it('grades queued questions sequentially, updates marks live via calculateRubricTally, and reports skipped blanks', async () => {
    const plan = planBatchAiGradeQueue(sampleSession, itemsById);
    const startedOrder: number[] = [];
    const gradedUpdates: Array<{
      questionId: string;
      earnedMarks: number;
      totalMarks: number;
    }> = [];

    const mockGradeFn = jest.fn(
      async ({ questionId }: { questionId: string }): Promise<AiGradeResult> => {
        if (questionId === STRUCTURED_Q1.id) {
          return { ok: true, data: SAMPLE_AI_GRADE };
        }
        return {
          ok: true,
          data: {
            ...SAMPLE_AI_GRADE,
            questionId,
            earnedMarks: 2,
            totalMarks: 2,
            awardedKeys: [
              getMarkSchemeCriterionKey(STRUCTURED_Q2.markScheme[0], 0),
              getMarkSchemeCriterionKey(STRUCTURED_Q2.markScheme[1], 1),
            ],
            criteria: [],
          },
        };
      }
    );

    const controller = new AbortController();
    const finalState = await runBatchAiGrading({
      queue: plan.gradable,
      blankSkippedCount: plan.blankQuestionIds.length,
      syllabus: 'ib',
      signal: controller.signal,
      delayMs: 0,
      gradeFn: mockGradeFn as unknown as Parameters<typeof runBatchAiGrading>[0]['gradeFn'],
      onQuestionStart: ({ questionNumber }) => {
        startedOrder.push(questionNumber);
      },
      onQuestionGraded: ({ questionId, earnedMarks, totalMarks }) => {
        gradedUpdates.push({ questionId, earnedMarks, totalMarks });
      },
    });

    expect(mockGradeFn).toHaveBeenCalledTimes(2);
    expect(startedOrder).toEqual([2, 4]);
    expect(gradedUpdates).toEqual([
      { questionId: STRUCTURED_Q1.id, earnedMarks: 4, totalMarks: 6 },
      { questionId: STRUCTURED_Q2.id, earnedMarks: 2, totalMarks: 2 },
    ]);
    expect(finalState).toEqual({
      status: 'done',
      totalGradable: 2,
      completedCount: 2,
      currentQuestionNumber: null,
      blankSkippedCount: 1,
      failedCount: 0,
      stopReason: 'completed',
    });
    expect(formatBatchAiGradeSummary(finalState)).toBe(
      'AI graded 2 written answers · 1 blank question left for paper self-marking.'
    );
  });

  it('stops batch immediately on mid-batch quota_exhausted while preserving already-graded items', async () => {
    const queue = [
      {
        questionId: STRUCTURED_Q1.id,
        questionNumber: 1,
        item: STRUCTURED_Q1,
        partNotes: { a: '3.33e-6 m' },
      },
      {
        questionId: STRUCTURED_Q2.id,
        questionNumber: 2,
        item: STRUCTURED_Q2,
        partNotes: { a: 'u_y = u sin theta' },
      },
      {
        questionId: STRUCTURED_Q3.id,
        questionNumber: 3,
        item: STRUCTURED_Q3,
        partNotes: { a: 'R_p = 12 ohm' },
      },
    ];

    const gradedIds: string[] = [];
    let calls = 0;
    const mockGradeFn = jest.fn(async (): Promise<AiGradeResult> => {
      calls += 1;
      if (calls === 1) {
        return { ok: true, data: SAMPLE_AI_GRADE };
      }
      return {
        ok: false,
        code: 'quota_exhausted',
        message: 'Daily free AI grading quota reached.',
        fallbackToManual: true,
      };
    });

    const controller = new AbortController();
    const finalState = await runBatchAiGrading({
      queue,
      blankSkippedCount: 0,
      syllabus: 'ib',
      signal: controller.signal,
      delayMs: 0,
      gradeFn: mockGradeFn as unknown as Parameters<typeof runBatchAiGrading>[0]['gradeFn'],
      onQuestionGraded: ({ questionId }) => {
        gradedIds.push(questionId);
      },
    });

    // Q3 must NOT be sent once Q2 returns quota_exhausted
    expect(mockGradeFn).toHaveBeenCalledTimes(2);
    expect(gradedIds).toEqual([STRUCTURED_Q1.id]);
    expect(finalState.stopReason).toBe('quota_exhausted');
    expect(finalState.completedCount).toBe(1);
    expect(formatBatchAiGradeSummary(finalState)).toBe(
      'AI graded 1 of 3 written answers before daily quota was reached — mark the remaining 2 manually below.'
    );
  });

  it('supports mid-batch cancellation via AbortController without grading remaining questions', async () => {
    const queue = [
      {
        questionId: STRUCTURED_Q1.id,
        questionNumber: 1,
        item: STRUCTURED_Q1,
        partNotes: { a: '3.33e-6 m' },
      },
      {
        questionId: STRUCTURED_Q2.id,
        questionNumber: 2,
        item: STRUCTURED_Q2,
        partNotes: { a: 'u_y = u sin theta' },
      },
    ];

    const controller = new AbortController();
    const mockGradeFn = jest.fn(async (): Promise<AiGradeResult> => {
      controller.abort();
      return { ok: true, data: SAMPLE_AI_GRADE };
    });

    const gradedIds: string[] = [];
    const finalState = await runBatchAiGrading({
      queue,
      blankSkippedCount: 0,
      syllabus: 'ib',
      signal: controller.signal,
      delayMs: 0,
      gradeFn: mockGradeFn as unknown as Parameters<typeof runBatchAiGrading>[0]['gradeFn'],
      onQuestionGraded: ({ questionId }) => {
        gradedIds.push(questionId);
      },
    });

    expect(mockGradeFn).toHaveBeenCalledTimes(1);
    expect(gradedIds).toEqual([STRUCTURED_Q1.id]);
    expect(finalState.stopReason).toBe('cancelled');
    expect(formatBatchAiGradeSummary(finalState)).toContain(
      'Stopped after AI grading 1 of 2 written answers'
    );
  });

  it('formats calm summaries for rate_limited, unavailable, and all-graded states and renders MockExamView setup cleanly', () => {
    const rateLimited: BatchAiGradeProgressState = {
      status: 'done',
      totalGradable: 4,
      completedCount: 2,
      currentQuestionNumber: null,
      blankSkippedCount: 0,
      failedCount: 2,
      stopReason: 'rate_limited',
    };
    expect(formatBatchAiGradeSummary(rateLimited)).toContain('rate limit');

    const unavailableZero: BatchAiGradeProgressState = {
      status: 'done',
      totalGradable: 2,
      completedCount: 0,
      currentQuestionNumber: null,
      blankSkippedCount: 0,
      failedCount: 2,
      stopReason: 'grader_unavailable',
    };
    expect(formatBatchAiGradeSummary(unavailableZero)).toContain(
      'temporarily unavailable'
    );

    const allDone: BatchAiGradeProgressState = {
      status: 'done',
      totalGradable: 3,
      completedCount: 3,
      currentQuestionNumber: null,
      blankSkippedCount: 0,
      failedCount: 0,
      stopReason: 'completed',
    };
    expect(formatBatchAiGradeSummary(allDone)).toContain(
      'AI graded all 3 written answers'
    );

    const manifest = getFallbackManifest();
    const html = renderToStaticMarkup(
      <MockExamView
        manifest={manifest}
        activeSyllabus="ib"
        topics={manifest.syllabi.ib.topics}
        bookmarkedIds={[]}
        onToggleBookmark={() => undefined}
        onCompleteMock={() => undefined}
        onRecordQuestionAttempt={() => undefined}
        onPracticeWeakTopics={() => undefined}
      />
    );
    expect(html).toContain('Timed mock exam');
    expect(html).not.toContain('AI Grade all written');
  });
});
