import {
  AI_GRADER_MAX_PART_CHARS,
  AI_GRADER_MAX_TOTAL_CHARS,
  DEFAULT_AI_GRADER_ENDPOINT,
  formatGraderModelLabel,
  gradeStructuredAnswer,
  hasGradableWorking,
  resolveAiGraderEndpoint,
  sanitizePartNotesForGrading,
} from '@/lib/sixthphysics-web/ai-grader';
import type { MarkSchemePoint } from '@/lib/sixthphysics-web/types';

const SAMPLE_MARK_SCHEME: MarkSchemePoint[] = [
  { code: 'M1', partId: 'a', criterion: 'Uses R_p = (R1*R2)/(R1+R2).', marks: 1 },
  { code: 'A1', partId: 'a', criterion: 'Obtains R_tot = 22.0 Ω.', marks: 1 },
  { code: 'M1', partId: 'b', criterion: 'Finds I = V / R_tot = 2.40 A.', marks: 1 },
  { code: 'A1', partId: 'b', criterion: 'Obtains V_p = 28.8 V.', marks: 1 },
];

describe('SixthPhysics AI Grader client', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    delete process.env.NEXT_PUBLIC_SIXTHPHYSICS_GRADER_URL;
  });

  it('sanitizes, trims, strips control chars, and enforces per-part & total length caps', () => {
    expect(hasGradableWorking({})).toBe(false);
    expect(hasGradableWorking({ a: '   \n\t  ' })).toBe(false);
    expect(hasGradableWorking({ a: 'R = 22 ohm' })).toBe(true);

    const longPart = 'x'.repeat(AI_GRADER_MAX_PART_CHARS + 120);
    const res = sanitizePartNotesForGrading({
      a: `  hello\u0000world  `,
      b: longPart,
      c: 'y'.repeat(AI_GRADER_MAX_PART_CHARS),
      d: 'z'.repeat(AI_GRADER_MAX_PART_CHARS),
    });

    expect(res.cleaned.a).toBe('helloworld');
    expect(res.cleaned.b.length).toBe(AI_GRADER_MAX_PART_CHARS);
    expect(res.totalChars).toBeLessThanOrEqual(AI_GRADER_MAX_TOTAL_CHARS);
    expect(res.truncated).toBe(true);
  });

  it('short-circuits empty answers locally without calling fetch', async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await gradeStructuredAnswer({
      questionId: 'sp-circuits-01-structured-015',
      syllabus: 'ib',
      partNotes: { a: '   ', b: '' },
      markScheme: SAMPLE_MARK_SCHEME,
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result).toEqual({
      ok: false,
      code: 'empty_answer',
      message: expect.stringContaining('Type your working'),
      fallbackToManual: false,
    });
  });

  it('resolves endpoint from override, env var, or default APIcuts URL and formats model names', () => {
    expect(resolveAiGraderEndpoint()).toBe(DEFAULT_AI_GRADER_ENDPOINT);
    process.env.NEXT_PUBLIC_SIXTHPHYSICS_GRADER_URL = 'https://example.test/grade';
    expect(resolveAiGraderEndpoint()).toBe('https://example.test/grade');
    expect(resolveAiGraderEndpoint('https://override.test/grade')).toBe(
      'https://override.test/grade'
    );

    expect(formatGraderModelLabel('qwen/qwen3.8-27b')).toBe('Qwen 3.8 27B');
    expect(formatGraderModelLabel('gemini-3.5-flash-lite')).toBe(
      'Gemini 3.5 Flash-Lite'
    );
  });

  it('parses a valid grading response and filters out any unknown criterion keys', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      text: async () =>
        JSON.stringify({
          questionId: 'sp-circuits-01-structured-015',
          provider: 'groq',
          model: 'qwen/qwen3.8-27b',
          cached: false,
          latencyMs: 380,
          earnedMarks: 3,
          totalMarks: 4,
          awardedKeys: ['0:a:M1', '1:a:A1', '2:b:M1', '99:z:A9'],
          criteria: [
            { key: '0:a:M1', code: 'M1', partId: 'a', marks: 1, awarded: true, reason: 'Parallel resistance correct.' },
            { key: '1:a:A1', code: 'A1', partId: 'a', marks: 1, awarded: true, reason: 'Got 22 Ω.' },
            { key: '2:b:M1', code: 'M1', partId: 'b', marks: 1, awarded: true, reason: 'Used I = V/R.' },
            { key: '3:b:A1', code: 'A1', partId: 'b', marks: 1, awarded: false, reason: 'Arithmetic slip on V_p.' },
            { key: '99:z:A9', code: 'A9', partId: 'z', marks: 5, awarded: true, reason: 'Injected bogus key.' },
          ],
          overallFeedback: 'Strong method; recheck final multiplication in part (b).',
          poweredBy: { name: 'APIcuts.ai', url: 'https://apicuts.ai' },
        }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await gradeStructuredAnswer({
      questionId: 'sp-circuits-01-structured-015',
      syllabus: 'ib',
      partNotes: { a: '12 + 10 = 22 ohm', b: 'I = 2.4 A, V = 24 V' },
      markScheme: SAMPLE_MARK_SCHEME,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.data.awardedKeys).toEqual(['0:a:M1', '1:a:A1', '2:b:M1']);
    expect(result.data.criteria).toHaveLength(4);
    expect(result.data.provider).toBe('groq');
    expect(result.data.poweredBy?.url).toBe('https://apicuts.ai');
  });

  it('classifies daily quota exhaustion and network failures as graceful manual fallbacks', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 429,
      headers: new Headers({ 'Retry-After': '60' }),
      text: async () =>
        JSON.stringify({
          error: {
            code: 'quota_exhausted',
            message: 'Daily free AI grading quota reached.',
            fallback: 'manual',
          },
        }),
    }) as unknown as typeof fetch;

    const quotaRes = await gradeStructuredAnswer({
      questionId: 'sp-circuits-01-structured-015',
      syllabus: 'alevel',
      partNotes: { a: '22 ohm' },
      markScheme: SAMPLE_MARK_SCHEME,
    });

    expect(quotaRes).toEqual({
      ok: false,
      code: 'quota_exhausted',
      message: 'Daily free AI grading quota reached.',
      fallbackToManual: true,
      retryAfterSeconds: 60,
    });

    global.fetch = jest.fn().mockRejectedValue(new TypeError('Failed to fetch')) as unknown as typeof fetch;
    const netRes = await gradeStructuredAnswer({
      questionId: 'sp-circuits-01-structured-015',
      syllabus: 'ncuk',
      partNotes: { a: '22 ohm' },
      markScheme: SAMPLE_MARK_SCHEME,
    });

    expect(netRes.ok).toBe(false);
    if (netRes.ok) throw new Error('expected error');
    expect(netRes.code).toBe('network_error');
    expect(netRes.fallbackToManual).toBe(true);
  });
});
