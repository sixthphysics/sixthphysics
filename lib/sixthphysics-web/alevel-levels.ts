import { ALEVEL_PHYSICS_SYLLABUS } from "@/lib/constants/syllabi/a-level-physics";
import type { SyllabusTag } from "./types";

const ALEVEL_SUBTOPIC_LEVELS = new Map<string, readonly string[]>();
const ALEVEL_TOPIC_LEVELS = new Map<string, readonly string[]>();

/**
 * Normalizes UK A-Level level tokens so `"AS"`, `"Year 12"`, etc. map cleanly
 * to `"Y12"` and `"A2"`, `"A-Level"`, `"Year 13"` map to `"Y13"`.
 */
export function normalizeAlevelToken(level: string): string {
  const trimmed = level.trim().toUpperCase();
  if (trimmed === "AS" || trimmed === "YEAR 12" || trimmed === "AS/Y12") {
    return "Y12";
  }
  if (
    trimmed === "A2" ||
    trimmed === "A-LEVEL" ||
    trimmed === "YEAR 13" ||
    trimmed === "A2/Y13"
  ) {
    return "Y13";
  }
  return trimmed;
}

const asTopicIds: string[] = [];
const asSubtopicIds: string[] = [];
const optionSubtopicIds: string[] = [];

for (const topic of ALEVEL_PHYSICS_SYLLABUS.topics) {
  const topicLevels = new Set<string>(
    topic.levelsCovered.map((lvl) => normalizeAlevelToken(lvl)),
  );
  ALEVEL_TOPIC_LEVELS.set(topic.id, [...topicLevels]);
  if (topicLevels.has("Y12")) {
    asTopicIds.push(topic.id);
  }

  for (const subtopic of topic.subtopics) {
    const subLevels = new Set<string>(
      subtopic.levelsCovered.map((lvl) => normalizeAlevelToken(lvl)),
    );
    subLevels.add(normalizeAlevelToken(subtopic.level));
    ALEVEL_SUBTOPIC_LEVELS.set(subtopic.id, [...subLevels]);
    if (subLevels.has("Y12")) {
      asSubtopicIds.push(subtopic.id);
    }
    if (subtopic.isOption) {
      optionSubtopicIds.push(subtopic.id);
    }
  }
}

/** Sections 1–5 (AS / Year 12 core, also cumulatively assessed in Year 13). */
export const ALEVEL_AS_TOPIC_IDS: readonly string[] = asTopicIds;

/** Subtopics 3.1–3.5 (AS / Year 12 core, also cumulatively assessed in Year 13). */
export const ALEVEL_AS_SUBTOPIC_IDS: readonly string[] = asSubtopicIds;

/** Optional Paper 3 Section B subtopics (Sections 9–13: 3.9–3.13). */
export const ALEVEL_OPTION_SUBTOPIC_IDS: readonly string[] = optionSubtopicIds;

/**
 * Resolves the authoritative set of UK A-Level level tokens (`"Y12"`, `"Y13"`)
 * covered by a `SyllabusTag`, derived directly from `ALEVEL_PHYSICS_SYLLABUS`.
 *
 * - Sections 1–5 (`alevel-sec1-measurements-errors` through
 *   `alevel-sec5-electricity`, subtopics `3.1`–`3.5`) resolve to
 *   `{"Y12", "Y13"}` because AS / Year 12 content is cumulatively assessed in
 *   full A-Level (Year 13) examinations.
 * - Sections 6–8 (`3.6`–`3.8`) and Options 9–13 (`3.9`–`3.13`) resolve to
 *   `{"Y13"}` only.
 * - Any `"AS"` token is normalized cleanly to `"Y12"`.
 *
 * Keeping both `client-loader.ts` and `compile-public-bank.ts` backed by this
 * single resolver guarantees sidebar `countsByLevel` badges stay in exact
 * lockstep with client-side filtering.
 */
export function resolveEffectiveAlevelLevels(
  tag: SyllabusTag,
): ReadonlySet<string> {
  const normalizedTagLevel = normalizeAlevelToken(tag.level);

  if (tag.syllabus !== "alevel") {
    return new Set<string>(normalizedTagLevel ? [normalizedTagLevel] : []);
  }

  if (tag.subtopicId) {
    const subLevels = ALEVEL_SUBTOPIC_LEVELS.get(tag.subtopicId);
    if (subLevels) {
      return new Set<string>(subLevels);
    }
  }

  const topicLevels = ALEVEL_TOPIC_LEVELS.get(tag.topicId);
  if (topicLevels) {
    return new Set<string>(topicLevels);
  }

  if (normalizedTagLevel === "Y12") {
    return new Set<string>(["Y12", "Y13"]);
  }
  if (normalizedTagLevel === "Y13") {
    return new Set<string>(["Y13"]);
  }
  return new Set<string>(normalizedTagLevel ? [normalizedTagLevel] : ["Y13"]);
}

/**
 * Returns the UK A-Level tier for a tag (`"AS"` for Sections 1–5 covered in
 * both Y12 & Y13, `"A2"` for Year 13-only Sections 6–13, or `null` if not an
 * A-Level tag).
 */
export function resolveAlevelTier(tag: SyllabusTag): "AS" | "A2" | null {
  if (tag.syllabus !== "alevel") {
    return null;
  }
  const levels = resolveEffectiveAlevelLevels(tag);
  if (levels.has("Y12")) return "AS";
  if (levels.has("Y13")) return "A2";
  return null;
}
