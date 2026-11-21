import { NCUK_PHYSICS_SYLLABUS } from "@/lib/constants/syllabi/ncuk-physics";
import type { SyllabusTag } from "./types";

const NCUK_SUBTOPIC_LEVELS = new Map<string, readonly string[]>();
const NCUK_TOPIC_LEVELS = new Map<string, readonly string[]>();

function normalizeNcukToken(level: string): string {
  const trimmed = level.trim().toUpperCase();
  if (trimmed === "S1") return "IFY-S1";
  if (trimmed === "S2") return "IFY-S2";
  return trimmed;
}

for (const topic of NCUK_PHYSICS_SYLLABUS.topics) {
  const topicLevels = new Set<string>(
    topic.levelsCovered.map((lvl) => normalizeNcukToken(lvl)),
  );
  topicLevels.add("IFY");
  NCUK_TOPIC_LEVELS.set(topic.id, [...topicLevels]);

  for (const subtopic of topic.subtopics) {
    const subLevels = new Set<string>(
      subtopic.levelsCovered.map((lvl) => normalizeNcukToken(lvl)),
    );
    subLevels.add(normalizeNcukToken(subtopic.level));
    subLevels.add("IFY");
    NCUK_SUBTOPIC_LEVELS.set(subtopic.id, [...subLevels]);
  }
}

/**
 * Resolves the authoritative set of NCUK IFY level tokens (`"IFY"`, `"IFY-S1"`,
 * `"IFY-S2"`) covered by a `SyllabusTag`, derived directly from
 * `NCUK_PHYSICS_SYLLABUS`.
 *
 * - Semester 1 (`ncuk-ac1`, `ncuk-ac2`, `ncuk-ac3`, `ncuk-ac4-1..ncuk-ac4-4`)
 *   resolves to `{"IFY-S1", "IFY"}`.
 * - Semester 2 (`ncuk-ac4-5`, `ncuk-ac4-6`, `ncuk-ac5..ncuk-ac8`)
 *   resolves to `{"IFY-S2", "IFY"}`.
 *
 * This guarantees legacy items tagged with bare `"IFY"` still appear when a
 * student filters by `IFY-S1` or `IFY-S2`, and keeps sidebar badge counts in
 * lockstep with client-side filtering.
 */
export function resolveEffectiveNcukLevels(
  tag: SyllabusTag,
): ReadonlySet<string> {
  const normalizedTagLevel = normalizeNcukToken(tag.level);

  if (tag.syllabus !== "ncuk") {
    return new Set<string>(normalizedTagLevel ? [normalizedTagLevel] : []);
  }

  if (tag.subtopicId) {
    const subLevels = NCUK_SUBTOPIC_LEVELS.get(tag.subtopicId);
    if (subLevels) {
      return new Set<string>(subLevels);
    }
  }

  const topicLevels = NCUK_TOPIC_LEVELS.get(tag.topicId);
  if (topicLevels) {
    // AC4 spans both S1 (AC4.1-4.4) and S2 (AC4.5-4.6); if subtopicId is
    // omitted and the tag explicitly specifies a single semester, honor it.
    if (
      tag.topicId === "ncuk-ac4" &&
      (normalizedTagLevel === "IFY-S1" || normalizedTagLevel === "IFY-S2")
    ) {
      return new Set<string>([normalizedTagLevel, "IFY"]);
    }
    return new Set<string>(topicLevels);
  }

  const fallback = new Set<string>(["IFY"]);
  if (normalizedTagLevel) {
    fallback.add(normalizedTagLevel);
  }
  return fallback;
}

/**
 * Returns the NCUK teaching semester for a tag (`"S1"`, `"S2"`, `"both"`, or
 * `null` if not an NCUK tag).
 */
export function resolveNcukSemester(
  tag: SyllabusTag,
): "S1" | "S2" | "both" | null {
  if (tag.syllabus !== "ncuk") {
    return null;
  }
  const levels = resolveEffectiveNcukLevels(tag);
  const hasS1 = levels.has("IFY-S1");
  const hasS2 = levels.has("IFY-S2");
  if (hasS1 && hasS2) return "both";
  if (hasS1) return "S1";
  if (hasS2) return "S2";
  return null;
}
