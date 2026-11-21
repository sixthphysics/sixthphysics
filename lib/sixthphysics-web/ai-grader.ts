import type { MarkSchemePoint, SyllabusId } from '@/lib/sixthphysics-web/types';

export const DEFAULT_AI_GRADER_ENDPOINT =
  'https://apicuts.ai/v1/public/sixthphysics/grade';

export const AI_GRADER_MAX_PART_CHARS = 600;
export const AI_GRADER_MAX_TOTAL_CHARS = 1500;
export const AI_GRADER_TIMEOUT_MS = 18_000;

export type AiGraderProvider = 'groq' | 'gemini';

export interface AiGraderCriterionVerdict {
  key: string;
  code: string;
  partId?: string;
  marks: number;
  awarded: boolean;
  reason: string;
}

export interface AiGradeSuccessResponse {
  questionId: string;
  provider: AiGraderProvider;
  model: string;
  cached: boolean;
  latencyMs: number;
  earnedMarks: number;
  totalMarks: number;
  awardedKeys: string[];
  criteria: AiGraderCriterionVerdict[];
  overallFeedback: string;
  poweredBy?: {
    name: string;
    url: string;
  };
}

export type AiGradeErrorCode =
  | 'empty_answer'
  | 'answer_too_long'
  | 'invalid_request'
  | 'question_not_found'
  | 'rate_limited'
  | 'quota_exhausted'
  | 'grader_unavailable'
  | 'network_error'
  | 'aborted';

export type AiGradeResult =
  | { ok: true; data: AiGradeSuccessResponse }
  | {
      ok: false;
      code: AiGradeErrorCode;
      message: string;
      fallbackToManual: boolean;
      retryAfterSeconds?: number;
    };

export interface GradeStructuredAnswerInput {
  questionId: string;
  syllabus: SyllabusId;
  partNotes: Record<string, string>;
  markScheme?: MarkSchemePoint[];
  endpoint?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export function resolveAiGraderEndpoint(override?: string): string {
  const candidate =
    override?.trim() ||
    (typeof process !== 'undefined'
      ? process.env.NEXT_PUBLIC_SIXTHPHYSICS_GRADER_URL?.trim()
      : undefined) ||
    DEFAULT_AI_GRADER_ENDPOINT;
  return candidate;
}

export function sanitizePartNotesForGrading(
  partNotes: Record<string, string> | undefined
): {
  cleaned: Record<string, string>;
  totalChars: number;
  truncated: boolean;
} {
  if (!partNotes) {
    return { cleaned: {}, totalChars: 0, truncated: false };
  }

  const cleaned: Record<string, string> = {};
  let totalChars = 0;
  let truncated = false;

  for (const [rawKey, rawVal] of Object.entries(partNotes)) {
    const key = rawKey.trim();
    if (!key || typeof rawVal !== 'string') continue;

    // Strip control chars except tabs/newlines and collapse excess blank space.
    const normalized = rawVal
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
      .trim();

    if (!normalized) continue;

    const remaining = AI_GRADER_MAX_TOTAL_CHARS - totalChars;
    if (remaining <= 0) {
      truncated = true;
      break;
    }

    const allowedLen = Math.min(AI_GRADER_MAX_PART_CHARS, remaining);
    let value = normalized;
    if (value.length > allowedLen) {
      value = value.slice(0, allowedLen).trimEnd();
      truncated = true;
    }

    if (value.length > 0) {
      cleaned[key] = value;
      totalChars += value.length;
    }
  }

  return { cleaned, totalChars, truncated };
}

export function hasGradableWorking(
  partNotes: Record<string, string> | undefined
): boolean {
  return sanitizePartNotesForGrading(partNotes).totalChars > 0;
}

export function formatGraderModelLabel(model: string): string {
  const lower = model.toLowerCase();
  if (lower.includes('qwen3.8-27b')) return 'Qwen 3.8 27B';
  if (lower.includes('qwen3.6-27b')) return 'Qwen 3.6 27B';
  if (lower.includes('gemini-3.5-flash-lite')) return 'Gemini 3.5 Flash-Lite';
  if (lower.includes('gemini-2.5-flash-lite')) return 'Gemini 2.5 Flash-Lite';
  return model.replace(/^[^/]+\//, '');
}

function normalizeServerCriteria(
  raw: unknown,
  markScheme?: MarkSchemePoint[]
): {
  awardedKeys: string[];
  criteria: AiGraderCriterionVerdict[];
} | null {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  const rawCriteria = Array.isArray(record.criteria) ? record.criteria : [];
  const allowedKeys = markScheme
    ? new Set(
        markScheme.map(
          (pt, idx) => `${idx}:${pt.partId ?? 'q'}:${pt.code}`
        )
      )
    : null;

  const criteria: AiGraderCriterionVerdict[] = [];
  const awardedKeys: string[] = [];

  for (const entry of rawCriteria) {
    if (!entry || typeof entry !== 'object') continue;
    const item = entry as Record<string, unknown>;
    const key = typeof item.key === 'string' ? item.key.trim() : '';
    if (!key) continue;
    if (allowedKeys && !allowedKeys.has(key)) continue;

    const awarded = Boolean(item.awarded);
    const code = typeof item.code === 'string' ? item.code : '';
    const partId =
      typeof item.partId === 'string' && item.partId.trim().length > 0
        ? item.partId.trim()
        : undefined;
    const marks =
      typeof item.marks === 'number' && Number.isFinite(item.marks) && item.marks > 0
        ? Math.round(item.marks)
        : 1;
    const reason =
      typeof item.reason === 'string' ? item.reason.trim().slice(0, 220) : '';

    criteria.push({ key, code, partId, marks, awarded, reason });
    if (awarded) {
      awardedKeys.push(key);
    }
  }

  // Fallback if server only returned awardedKeys
  if (criteria.length === 0 && Array.isArray(record.awardedKeys)) {
    for (const k of record.awardedKeys) {
      if (typeof k === 'string' && (!allowedKeys || allowedKeys.has(k))) {
        awardedKeys.push(k);
      }
    }
  }

  return { awardedKeys, criteria };
}

export async function gradeStructuredAnswer(
  input: GradeStructuredAnswerInput
): Promise<AiGradeResult> {
  const { cleaned, totalChars } = sanitizePartNotesForGrading(input.partNotes);
  if (totalChars === 0) {
    return {
      ok: false,
      code: 'empty_answer',
      message: 'Type your working or final answer in at least one part before using AI grading.',
      fallbackToManual: false,
    };
  }

  const endpoint = resolveAiGraderEndpoint(input.endpoint);
  const timeoutMs = input.timeoutMs ?? AI_GRADER_TIMEOUT_MS;
  const controller = new AbortController();

  const onExternalAbort = () => controller.abort();
  if (input.signal) {
    if (input.signal.aborted) {
      return {
        ok: false,
        code: 'aborted',
        message: 'AI grading was cancelled.',
        fallbackToManual: false,
      };
    }
    input.signal.addEventListener('abort', onExternalAbort, { once: true });
  }

  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        questionId: input.questionId,
        syllabus: input.syllabus,
        partNotes: cleaned,
      }),
      signal: controller.signal,
    });

    const rawText = await response.text();
    let parsed: Record<string, unknown> | null = null;
    try {
      parsed = rawText ? (JSON.parse(rawText) as Record<string, unknown>) : null;
    } catch {
      parsed = null;
    }

    if (!response.ok) {
      const errObj =
        parsed && typeof parsed.error === 'object' && parsed.error !== null
          ? (parsed.error as Record<string, unknown>)
          : null;
      const serverCode =
        typeof errObj?.code === 'string' ? errObj.code : undefined;
      const serverMsg =
        typeof errObj?.message === 'string' ? errObj.message : undefined;
      const retryAfterHeader = response.headers.get('Retry-After');
      const retryAfterSeconds =
        typeof errObj?.retryAfterSeconds === 'number'
          ? errObj.retryAfterSeconds
          : retryAfterHeader && /^\d+$/.test(retryAfterHeader)
            ? Number.parseInt(retryAfterHeader, 10)
            : undefined;

      if (response.status === 429) {
        const isDailyQuota = serverCode === 'quota_exhausted';
        return {
          ok: false,
          code: isDailyQuota ? 'quota_exhausted' : 'rate_limited',
          message:
            serverMsg ||
            (isDailyQuota
              ? 'Free daily AI grading quota has been reached — you can still self-mark manually below.'
              : 'Too many AI grading requests right now — wait a moment or self-mark manually below.'),
          fallbackToManual: true,
          retryAfterSeconds,
        };
      }

      if (response.status === 400 && serverCode === 'empty_answer') {
        return {
          ok: false,
          code: 'empty_answer',
          message:
            serverMsg ||
            'Type your working in at least one part before using AI grading.',
          fallbackToManual: false,
        };
      }

      if (response.status === 404) {
        return {
          ok: false,
          code: 'question_not_found',
          message:
            serverMsg ||
            'This question is not in the live grader catalog yet — self-mark manually below.',
          fallbackToManual: true,
        };
      }

      return {
        ok: false,
        code: 'grader_unavailable',
        message:
          serverMsg ||
          'Free AI grader is temporarily unavailable — self-mark manually below.',
        fallbackToManual: true,
      };
    }

    const normalized = normalizeServerCriteria(parsed, input.markScheme);
    if (!parsed || !normalized) {
      return {
        ok: false,
        code: 'grader_unavailable',
        message:
          'Received an unexpected response from the AI grader — self-mark manually below.',
        fallbackToManual: true,
      };
    }

    const provider: AiGraderProvider =
      parsed.provider === 'gemini' ? 'gemini' : 'groq';
    const model =
      typeof parsed.model === 'string' && parsed.model.trim().length > 0
        ? parsed.model.trim()
        : 'qwen/qwen3.8-27b';
    const earnedMarks =
      typeof parsed.earnedMarks === 'number' && Number.isFinite(parsed.earnedMarks)
        ? Math.max(0, Math.round(parsed.earnedMarks))
        : normalized.criteria.reduce(
            (sum, item) => sum + (item.awarded ? item.marks : 0),
            0
          );
    const totalMarks =
      typeof parsed.totalMarks === 'number' && Number.isFinite(parsed.totalMarks)
        ? Math.max(0, Math.round(parsed.totalMarks))
        : normalized.criteria.reduce((sum, item) => sum + item.marks, 0);
    const overallFeedback =
      typeof parsed.overallFeedback === 'string'
        ? parsed.overallFeedback.trim().slice(0, 320)
        : '';
    const poweredByRaw =
      parsed.poweredBy && typeof parsed.poweredBy === 'object'
        ? (parsed.poweredBy as Record<string, unknown>)
        : null;
    const poweredBy =
      typeof poweredByRaw?.name === 'string' &&
      typeof poweredByRaw?.url === 'string'
        ? {
            name: poweredByRaw.name,
            url: poweredByRaw.url,
          }
        : undefined;

    return {
      ok: true,
      data: {
        questionId:
          typeof parsed.questionId === 'string'
            ? parsed.questionId
            : input.questionId,
        provider,
        model,
        cached: Boolean(parsed.cached),
        latencyMs:
          typeof parsed.latencyMs === 'number' && Number.isFinite(parsed.latencyMs)
            ? Math.max(0, Math.round(parsed.latencyMs))
            : 0,
        earnedMarks,
        totalMarks,
        awardedKeys: normalized.awardedKeys,
        criteria: normalized.criteria,
        overallFeedback,
        ...(poweredBy ? { poweredBy } : {}),
      },
    };
  } catch (error: unknown) {
    if (input.signal?.aborted) {
      return {
        ok: false,
        code: 'aborted',
        message: 'AI grading was cancelled.',
        fallbackToManual: false,
      };
    }

    const isTimeout =
      error instanceof Error && error.name === 'AbortError';
    return {
      ok: false,
      code: isTimeout ? 'grader_unavailable' : 'network_error',
      message: isTimeout
        ? 'AI grader timed out — self-mark manually below.'
        : 'Could not reach the free AI grader — self-mark manually below.',
      fallbackToManual: true,
    };
  } finally {
    clearTimeout(timeoutHandle);
    input.signal?.removeEventListener('abort', onExternalAbort);
  }
}
