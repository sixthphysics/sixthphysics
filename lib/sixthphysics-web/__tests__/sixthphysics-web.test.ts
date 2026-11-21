import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  ALEVEL_OPTION_SUBTOPIC_IDS,
  ALEVEL_PAPER1_SUBTOPIC_IDS,
  ALEVEL_PAPER2_SUBTOPIC_IDS,
  MOCK_PAPER_PRESETS,
  PHYSICS_DOMAIN_IDS,
  STUDENT_PROGRESS_STORAGE_KEY,
  SEED_FALLBACK_ITEMS,
  SEED_FALLBACK_MANIFEST,
  advanceDailyStreak,
  assembleOfficialAlevelBlueprint,
  buildMockPaperSession,
  clearProgressState,
  computeOverallSyllabusMastery,
  computeTopicMasteryStats,
  createConfigFromPreset,
  createDefaultProgressState,
  filterIndexRows,
  getFallbackManifest,
  getFallbackQuestionById,
  getFallbackQuestions,
  getMockPresetsForSyllabus,
  isQuestionBookmarked,
  loadBankManifest,
  loadDomainChunk,
  loadProgressState,
  loadQuestionById,
  loadQuestionsByIds,
  prefetchChunk,
  recordCompletedMock,
  recordQuestionAttempt,
  resetBankClientCache,
  resolveEffectiveAlevelLevels,
  resolveEffectiveNcukLevels,
  saveProgressState,
  scoreMockPaperSession,
  setLastQuestionForSyllabus,
  toggleBookmark,
  updateActiveFilters,
  type PublicBankChunkFile,
  type PublicBankItem,
  type PublicBankManifest,
  type PublicQuestionIndexRow,
} from "../index";
import {
  ALEVEL_V3_SHARD_SPECS,
  EXPECTED_FROZEN_MANIFEST_SHA256,
  EXPECTED_TEST_JSONL_SHA256,
  EXPECTED_VAL_JSONL_SHA256,
  inferAlevelV3QuestionStyle,
  parseBuildBankV3AlevelArgs,
} from "../../../scripts/bank-generation/build-bank-v3-alevel";
import {
  buildPublicBankManifest,
  capAndInterleaveRecords,
  compilePublicBank,
  parseCompileCliArgs,
  sanitizeStudentText,
  toPublicBankItem,
  type RawPublicBankInput,
} from "../../../scripts/static-site/compile-public-bank";

class MemoryStorage implements Storage {
  private readonly map = new Map<string, string>();

  get length(): number {
    return this.map.size;
  }

  clear(): void {
    this.map.clear();
  }

  getItem(key: string): string | null {
    return this.map.has(key) ? (this.map.get(key) ?? null) : null;
  }

  key(index: number): string | null {
    return [...this.map.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.map.delete(key);
  }

  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
}

describe("SixthPhysics Static Web Bank, Loader, Mastery Store & Mock Builder", () => {
  beforeEach(() => {
    resetBankClientCache();
  });

  describe("Seed fallback & compiled public bank invariants", () => {
    it("provides 18 verified sample items across IB, UK A-Level, and NCUK IFY with distinct familyGroupKeys and stripped internals", () => {
      expect(SEED_FALLBACK_ITEMS).toHaveLength(18);
      expect(SEED_FALLBACK_MANIFEST.totalItems).toBe(18);
      expect(getFallbackQuestions()).toHaveLength(18);
      expect(getFallbackManifest().totalItems).toBe(18);

      const familyKeys = new Set(
        SEED_FALLBACK_ITEMS.map((item) => item.familyGroupKey),
      );
      expect(familyKeys.size).toBe(18);

      const formats = new Set(SEED_FALLBACK_ITEMS.map((item) => item.format));
      expect(formats.has("mcq")).toBe(true);
      expect(formats.has("structured")).toBe(true);

      const svgItems = SEED_FALLBACK_ITEMS.filter((item) =>
        Boolean(item.svgMarkup && item.svgMarkup.includes("<svg")),
      );
      expect(svgItems.length).toBeGreaterThanOrEqual(16);

      expect(SEED_FALLBACK_MANIFEST.syllabi.ib.gravityConvention).toBe(
        "g = 9.8 m s⁻²",
      );
      expect(SEED_FALLBACK_MANIFEST.syllabi.alevel.gravityConvention).toBe(
        "g = 9.81 m s⁻²",
      );
      expect(SEED_FALLBACK_MANIFEST.syllabi.ncuk.gravityConvention).toBe(
        "g = 9.81 m s⁻²",
      );

      expect(SEED_FALLBACK_MANIFEST.syllabi.ib.questionCount).toBeGreaterThan(
        0,
      );
      expect(
        SEED_FALLBACK_MANIFEST.syllabi.alevel.questionCount,
      ).toBeGreaterThan(0);
      expect(SEED_FALLBACK_MANIFEST.syllabi.ncuk.questionCount).toBeGreaterThan(
        0,
      );

      for (const item of SEED_FALLBACK_ITEMS) {
        const rawRecord = item as unknown as Record<string, unknown>;
        expect(rawRecord.verifiedQuantities).toBeUndefined();
        expect(rawRecord.provenance).toBeUndefined();
        expect(item.conceptId.length).toBeGreaterThan(0);
        expect(getFallbackQuestionById(item.id)?.id).toBe(item.id);
      }
    });

    it("verifies compiled public/sixthphysics-data honors capped web chunks stored once across 11 chunks when present", () => {
      const manifestPath = path.resolve(
        process.cwd(),
        "public/sixthphysics-data/manifest.json",
      );
      if (!fs.existsSync(manifestPath)) {
        return;
      }

      const summaryPath = path.resolve(
        process.cwd(),
        "dataset/sixthphysics-bank/SUMMARY.json",
      );
      const expectedTotal = fs.existsSync(summaryPath)
        ? (
            JSON.parse(fs.readFileSync(summaryPath, "utf8")) as {
              totalCompiledItems: number;
            }
          ).totalCompiledItems
        : 7643;

      const manifest = JSON.parse(
        fs.readFileSync(manifestPath, "utf8"),
      ) as PublicBankManifest;

      expect(manifest.totalItems).toBeGreaterThan(0);
      expect(manifest.totalItems).toBeLessThanOrEqual(expectedTotal);
      expect(manifest.items).toHaveLength(manifest.totalItems);
      expect(manifest.syllabi.ib.questionCount).toBeGreaterThan(0);
      expect(manifest.syllabi.alevel.questionCount).toBeGreaterThan(0);
      expect(manifest.syllabi.ncuk.questionCount).toBeGreaterThan(0);

      if (
        typeof manifest.maxItemsPerFamily === "number" &&
        manifest.maxItemsPerFamily > 0
      ) {
        const familyCounts = new Map<string, number>();
        for (const row of manifest.items) {
          familyCounts.set(
            row.familyGroupKey,
            (familyCounts.get(row.familyGroupKey) ?? 0) + 1,
          );
        }
        for (const count of familyCounts.values()) {
          expect(count).toBeLessThanOrEqual(manifest.maxItemsPerFamily);
        }

        const ac4Rows = filterIndexRows(manifest.items, {
          syllabus: "ncuk",
          topicId: "ncuk-ac4",
        });
        const uniqueAc4Families = new Set(
          ac4Rows.map((row) => row.familyGroupKey),
        );
        if (uniqueAc4Families.size >= 2) {
          for (let i = 1; i < ac4Rows.length; i += 1) {
            expect(ac4Rows[i].familyGroupKey).not.toBe(
              ac4Rows[i - 1].familyGroupKey,
            );
          }
        }
      }

      let totalChunkItems = 0;
      const seenChunkItemIds = new Set<string>();

      for (const domainId of PHYSICS_DOMAIN_IDS) {
        const chunkPath = path.resolve(
          process.cwd(),
          `public/sixthphysics-data/chunks/${domainId}.json`,
        );
        expect(fs.existsSync(chunkPath)).toBe(true);
        const chunk = JSON.parse(
          fs.readFileSync(chunkPath, "utf8"),
        ) as PublicBankChunkFile;
        expect(chunk.chunkKey).toBe(domainId);
        expect(chunk.items).toHaveLength(chunk.itemCount);
        totalChunkItems += chunk.items.length;

        for (const item of chunk.items) {
          expect(seenChunkItemIds.has(item.id)).toBe(false);
          seenChunkItemIds.add(item.id);
          const rawRecord = item as unknown as Record<string, unknown>;
          expect(rawRecord.verifiedQuantities).toBeUndefined();
          expect(rawRecord.provenance).toBeUndefined();
        }
      }

      // Zero 3x syllabus duplication: every compiled web item stored exactly once across chunks
      expect(totalChunkItems).toBe(manifest.totalItems);
      expect(seenChunkItemIds.size).toBe(manifest.totalItems);
    });

    it("compiles cleanly from seed-fallback when dataset/sixthphysics-bank is absent", async () => {
      const tmpOut = fs.mkdtempSync(
        path.join(os.tmpdir(), "sp-compile-fallback-test-"),
      );
      try {
        const res = await compilePublicBank({
          sourceItemsPath: path.join(tmpOut, "nonexistent-all-items.json"),
          outDir: tmpOut,
          writeSeedFallback: false,
        });
        expect(res.usedSeedFallbackInput).toBe(true);
        expect(res.totalItems).toBe(18);
        expect(fs.existsSync(path.join(tmpOut, "manifest.json"))).toBe(true);
        expect(fs.existsSync(path.join(tmpOut, "chunks", "waves.json"))).toBe(
          true,
        );
      } finally {
        fs.rmSync(tmpOut, { recursive: true, force: true });
      }
    });
  });

  describe("Client loader & index filtering", () => {
    it("fetches relative GitHub Pages URLs, deduplicates in-flight chunk requests, and caches items", async () => {
      const requestedUrls: string[] = [];
      const sampleItem = SEED_FALLBACK_ITEMS[0];
      const sampleRow = SEED_FALLBACK_MANIFEST.items.find(
        (r) => r.id === sampleItem.id,
      )!;

      const mockFetch = jest.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        requestedUrls.push(url);
        if (url.endsWith("/manifest.json")) {
          return {
            ok: true,
            status: 200,
            json: async () => SEED_FALLBACK_MANIFEST,
          } as Response;
        }
        if (url.endsWith(`/chunks/${sampleRow.chunkKey}.json`)) {
          const chunkItems = SEED_FALLBACK_ITEMS.filter((it) => {
            const row = SEED_FALLBACK_MANIFEST.items.find(
              (r) => r.id === it.id,
            );
            return row?.chunkKey === sampleRow.chunkKey;
          });
          return {
            ok: true,
            status: 200,
            json: async () => ({
              schemaVersion: "sixthphysics-public-chunk/1.0.0",
              chunkKey: sampleRow.chunkKey,
              generatedAt: SEED_FALLBACK_MANIFEST.generatedAt,
              itemCount: chunkItems.length,
              items: chunkItems,
            }),
          } as Response;
        }
        return {
          ok: false,
          status: 404,
          json: async () => ({}),
        } as Response;
      }) as unknown as typeof fetch;

      const manifest = await loadBankManifest({ fetchImpl: mockFetch });
      expect(manifest.totalItems).toBe(18);
      expect(requestedUrls).toEqual(["./sixthphysics-data/manifest.json"]);

      // Second call uses in-memory cache without re-fetching
      await loadBankManifest({ fetchImpl: mockFetch });
      expect(requestedUrls).toHaveLength(1);

      // Concurrent prefetchChunk + loadQuestionById deduplicate to a single fetch
      const [, loadedItem] = await Promise.all([
        prefetchChunk(sampleRow.chunkKey, { fetchImpl: mockFetch }),
        loadQuestionById(sampleItem.id, manifest, { fetchImpl: mockFetch }),
      ]);

      expect(loadedItem?.id).toBe(sampleItem.id);
      expect(requestedUrls).toEqual([
        "./sixthphysics-data/manifest.json",
        `./sixthphysics-data/chunks/${sampleRow.chunkKey}.json`,
      ]);

      // Batch loading across multiple IDs
      const secondItem = SEED_FALLBACK_ITEMS[1];
      const batch = await loadQuestionsByIds(
        [sampleItem.id, secondItem.id],
        manifest,
        { fetchImpl: mockFetch },
      );
      expect(batch[sampleItem.id]?.id).toBe(sampleItem.id);
      expect(batch[secondItem.id]?.id).toBe(secondItem.id);
    });

    it("falls back cleanly to SEED_FALLBACK_MANIFEST and SEED_FALLBACK_ITEMS on network failure", async () => {
      const failingFetch = jest.fn(async () => {
        throw new Error("Offline");
      }) as unknown as typeof fetch;

      const manifest = await loadBankManifest({ fetchImpl: failingFetch });
      expect(manifest.totalItems).toBe(18);

      const firstId = SEED_FALLBACK_ITEMS[0].id;
      const item = await loadQuestionById(firstId, manifest, {
        fetchImpl: failingFetch,
      });
      expect(item?.id).toBe(firstId);

      const chunk = await loadDomainChunk("mechanics", {
        fetchImpl: failingFetch,
      });
      expect(chunk.length).toBeGreaterThan(0);
    });

    it("filters index rows accurately across syllabus, S1/S2 shorthand levels, format, difficulty, and progress status", () => {
      const rows = SEED_FALLBACK_MANIFEST.items;
      const ibRows = filterIndexRows(rows, { syllabus: "ib" });
      expect(ibRows.length).toBe(SEED_FALLBACK_MANIFEST.syllabi.ib.questionCount);

      const ibMcqRows = filterIndexRows(rows, {
        syllabus: "ib",
        format: "mcq",
      });
      expect(ibMcqRows.every((r) => r.format === "mcq")).toBe(true);

      // Verify NCUK S1 shorthand normalizes to IFY-S1
      const s1Shorthand = filterIndexRows(rows, {
        syllabus: "ncuk",
        level: "S1",
      });
      const s1Canonical = filterIndexRows(rows, {
        syllabus: "ncuk",
        level: "IFY-S1",
      });
      expect(s1Shorthand).toEqual(s1Canonical);

      // Progress status filters: unseen, needs-review, saved
      let progress = createDefaultProgressState();
      const targetId = ibRows[0].id;
      const secondId = ibRows[1].id;

      progress = recordQuestionAttempt(progress, {
        questionId: targetId,
        format: "mcq",
        earnedMarks: 0,
        totalMarks: 1,
        selectedOptionIndex: 0,
        isCorrect: false,
      });
      progress = toggleBookmark(progress, secondId);

      const unseenRows = filterIndexRows(
        rows,
        { syllabus: "ib", status: "unseen" },
        progress,
      );
      expect(unseenRows.some((r) => r.id === targetId)).toBe(false);
      expect(unseenRows).toHaveLength(ibRows.length - 1);

      const reviewRows = filterIndexRows(
        rows,
        { syllabus: "ib", status: "needs-review" },
        progress,
      );
      expect(reviewRows.map((r) => r.id)).toEqual([targetId]);

      const savedRows = filterIndexRows(
        rows,
        { syllabus: "ib", status: "saved" },
        progress,
      );
      expect(savedRows.map((r) => r.id)).toEqual([secondId]);
    });
  });

  describe("SSR-safe progress store & topic mastery calculation", () => {
    it("persists and reloads sixthphysics.progress.v1 cleanly and handles SSR null / corrupt storage safely", () => {
      // SSR-safe null storage
      const ssrState = loadProgressState(null);
      expect(ssrState.schemaVersion).toBe(STUDENT_PROGRESS_STORAGE_KEY);
      expect(() => saveProgressState(ssrState, null)).not.toThrow();

      const storage = new MemoryStorage();
      storage.setItem(STUDENT_PROGRESS_STORAGE_KEY, "{corrupted-json");
      const recovered = loadProgressState(storage);
      expect(recovered.attempts).toEqual({});

      let state = createDefaultProgressState("2026-11-17T10:00:00.000Z");
      state = recordQuestionAttempt(
        state,
        {
          questionId: "q-mcq-1",
          format: "mcq",
          earnedMarks: 1,
          totalMarks: 1,
          selectedOptionIndex: 2,
          isCorrect: true,
        },
        new Date("2026-11-17T10:05:00.000Z"),
      );

      state = recordQuestionAttempt(
        state,
        {
          questionId: "q-struct-1",
          format: "structured",
          earnedMarks: 3,
          totalMarks: 6,
          checkedCriterionKeys: ["a:M1:0", "a:A1:1", "b:M1:2"],
          partNotes: { a: "v = f lambda", b: "0.31 m" },
        },
        new Date("2026-11-18T11:00:00.000Z"),
      );

      state = toggleBookmark(state, "q-struct-1");
      expect(isQuestionBookmarked(state, "q-struct-1")).toBe(true);

      state = updateActiveFilters(state, {
        syllabus: "alevel",
        level: "Y13",
        format: "structured",
      });
      state = setLastQuestionForSyllabus(state, "alevel", "q-struct-1");

      saveProgressState(state, storage);
      const reloaded = loadProgressState(storage);

      expect(reloaded.attempts["q-mcq-1"]?.isCorrect).toBe(true);
      expect(reloaded.attempts["q-mcq-1"]?.needsReview).toBe(false);
      // 3 / 6 = 50% (< 70% structured mastery threshold) -> needsReview: true
      expect(reloaded.attempts["q-struct-1"]?.earnedMarks).toBe(3);
      expect(reloaded.attempts["q-struct-1"]?.needsReview).toBe(true);
      expect(reloaded.attempts["q-struct-1"]?.partNotes?.a).toBe(
        "v = f lambda",
      );
      expect(reloaded.streak.currentDays).toBe(2);
      expect(reloaded.streak.longestDays).toBe(2);
      expect(reloaded.activeFilters.syllabus).toBe("alevel");
      expect(reloaded.lastQuestionIdBySyllabus.alevel).toBe("q-struct-1");

      clearProgressState(storage);
      expect(storage.getItem(STUDENT_PROGRESS_STORAGE_KEY)).toBeNull();
    });

    it("tracks consecutive daily streaks and resets currentDays after multi-day gaps while preserving longestDays", () => {
      let streak = createDefaultProgressState().streak;
      streak = advanceDailyStreak(streak, new Date("2026-11-10T09:00:00Z"));
      expect(streak.currentDays).toBe(1);

      // Same day does not double-increment
      streak = advanceDailyStreak(streak, new Date("2026-11-10T21:00:00Z"));
      expect(streak.currentDays).toBe(1);

      // Consecutive days
      streak = advanceDailyStreak(streak, new Date("2026-11-11T08:00:00Z"));
      streak = advanceDailyStreak(streak, new Date("2026-11-12T08:00:00Z"));
      expect(streak.currentDays).toBe(3);
      expect(streak.longestDays).toBe(3);

      // 3-day gap resets currentDays to 1, keeps longestDays = 3
      streak = advanceDailyStreak(streak, new Date("2026-11-15T08:00:00Z"));
      expect(streak.currentDays).toBe(1);
      expect(streak.longestDays).toBe(3);
    });

    it("computes accurate per-topic and overall syllabus mastery stats", () => {
      const ibRows = filterIndexRows(SEED_FALLBACK_MANIFEST.items, {
        syllabus: "ib",
      });
      const firstRow = ibRows[0];
      const firstTopicId = firstRow.syllabi.find(
        (t) => t.syllabus === "ib",
      )!.topicId;

      let state = createDefaultProgressState();
      state = recordCompletedMock(state, [
        {
          questionId: firstRow.id,
          format: firstRow.format,
          earnedMarks: firstRow.totalMarks,
          totalMarks: firstRow.totalMarks,
          isCorrect: true,
        },
      ]);

      expect(state.completedMockCount).toBe(1);

      const topicStats = computeTopicMasteryStats(
        "ib",
        SEED_FALLBACK_MANIFEST.items,
        state,
        SEED_FALLBACK_MANIFEST.syllabi.ib.topics,
      );
      expect(topicStats[firstTopicId]?.attemptedCount).toBe(1);
      expect(topicStats[firstTopicId]?.masteredCount).toBe(1);
      expect(topicStats[firstTopicId]?.accuracyPercent).toBe(100);

      const overall = computeOverallSyllabusMastery(
        "ib",
        SEED_FALLBACK_MANIFEST.items,
        state,
      );
      expect(overall.attemptedCount).toBe(1);
      expect(overall.accuracyPercent).toBe(100);
    });
  });

  describe("Mock paper builder & familyGroupKey deduplication", () => {
    it("exposes presets for all 3 syllabi and strictly deduplicates familyGroupKey in every generated mock paper", () => {
      expect(getMockPresetsForSyllabus("ib").length).toBeGreaterThanOrEqual(3);
      expect(getMockPresetsForSyllabus("alevel").length).toBeGreaterThanOrEqual(
        3,
      );
      expect(getMockPresetsForSyllabus("ncuk").length).toBeGreaterThanOrEqual(
        3,
      );

      const manifestPath = path.resolve(
        process.cwd(),
        "public/sixthphysics-data/manifest.json",
      );
      const manifest: PublicBankManifest = fs.existsSync(manifestPath)
        ? (JSON.parse(
            fs.readFileSync(manifestPath, "utf8"),
          ) as PublicBankManifest)
        : SEED_FALLBACK_MANIFEST;

      for (const preset of MOCK_PAPER_PRESETS) {
        const config = createConfigFromPreset(preset, { seed: 20261117 });
        const session = buildMockPaperSession(
          manifest,
          config,
          new Date("2026-11-17T12:00:00Z"),
        );

        expect(session.questionRows.length).toBeGreaterThan(0);
        expect(session.questionIds).toHaveLength(session.questionRows.length);

        const uniqueFamilies = new Set(
          session.questionRows.map((row) => row.familyGroupKey),
        );
        // Zero duplicate familyGroupKeys inside any generated mock paper!
        expect(uniqueFamilies.size).toBe(session.questionRows.length);

        if (fs.existsSync(manifestPath)) {
          if (preset.formatMode === "mcq") {
            expect(session.questionRows).toHaveLength(preset.questionCount);
            expect(
              session.questionRows.every((r) => r.format === "mcq"),
            ).toBe(true);
          } else if (preset.formatMode === "structured") {
            expect(
              session.questionRows.every((r) => r.format === "structured"),
            ).toBe(true);
            const expectedMarks = preset.targetTotalMarks ?? 25;
            expect(session.totalMarks).toBeGreaterThanOrEqual(
              Math.round(expectedMarks * 0.8),
            );
            expect(session.totalMarks).toBeLessThanOrEqual(
              Math.round(expectedMarks * 1.28),
            );
          } else {
            expect(session.questionRows).toHaveLength(preset.questionCount);
          }
        }
      }
    });

    it("scores MCQ + self-marked Paper 2 structured responses and identifies weak topics", () => {
      const config = createConfigFromPreset(
        getMockPresetsForSyllabus("ib")[2],
        {
          questionCount: 4,
          mcqCount: 2,
          structuredCount: 2,
          seed: 42,
        },
      );
      const session = buildMockPaperSession(SEED_FALLBACK_MANIFEST, config);
      const itemsById: Record<string, PublicBankItem> = {};
      for (const item of SEED_FALLBACK_ITEMS) {
        itemsById[item.id] = item;
      }

      const mcqRows = session.questionRows.filter((r) => r.format === "mcq");
      const structRows = session.questionRows.filter(
        (r) => r.format === "structured",
      );

      if (mcqRows[0]) {
        const correctIdx = itemsById[mcqRows[0].id]?.correctOptionIndex ?? 0;
        session.responses[mcqRows[0].id].selectedOptionIndex = correctIdx;
      }
      if (mcqRows[1]) {
        const correctIdx = itemsById[mcqRows[1].id]?.correctOptionIndex ?? 0;
        session.responses[mcqRows[1].id].selectedOptionIndex =
          (correctIdx + 1) % 4;
      }
      if (structRows[0]) {
        session.responses[structRows[0].id].isSelfMarked = true;
        session.responses[structRows[0].id].selfMarkedEarnedMarks =
          structRows[0].totalMarks;
      }
      // Leave structRows[1] unmarked to test unmarkedStructuredCount

      const summary = scoreMockPaperSession(
        session,
        itemsById,
        SEED_FALLBACK_MANIFEST,
      );

      expect(summary.totalQuestions).toBe(session.questionRows.length);
      expect(summary.mcqCorrect).toBe(1);
      expect(summary.mcqTotal).toBe(mcqRows.length);
      expect(summary.unmarkedStructuredCount).toBe(
        Math.max(0, structRows.length - 1),
      );
      expect(summary.topicBreakdown.length).toBeGreaterThan(0);
      expect(summary.weakTopicIds.length).toBeGreaterThan(0);
    });
  });

  describe("NCUK semester level-filter parity, web capping/interleaving, sanitizer & official IFYPH005 mocks", () => {
    it("resolves NCUK semester levels accurately so AC1.2 appears in IFY-S1 and AC6.2/6.4/6.5 appear in IFY-S2, matching countsByLevel", () => {
      const ac12Tag = {
        syllabus: "ncuk" as const,
        level: "IFY",
        topicId: "ncuk-ac1",
        subtopicId: "ncuk-ac1-2",
      };
      const ac44Tag = {
        syllabus: "ncuk" as const,
        level: "IFY",
        topicId: "ncuk-ac4",
        subtopicId: "ncuk-ac4-4",
      };
      const ac45Tag = {
        syllabus: "ncuk" as const,
        level: "IFY",
        topicId: "ncuk-ac4",
        subtopicId: "ncuk-ac4-5",
      };
      const ac62Tag = {
        syllabus: "ncuk" as const,
        level: "IFY",
        topicId: "ncuk-ac6",
        subtopicId: "ncuk-ac6-2",
      };
      const ac64Tag = {
        syllabus: "ncuk" as const,
        level: "IFY",
        topicId: "ncuk-ac6",
        subtopicId: "ncuk-ac6-4",
      };
      const ac65Tag = {
        syllabus: "ncuk" as const,
        level: "IFY",
        topicId: "ncuk-ac6",
        subtopicId: "ncuk-ac6-5",
      };

      expect(resolveEffectiveNcukLevels(ac12Tag).has("IFY-S1")).toBe(true);
      expect(resolveEffectiveNcukLevels(ac12Tag).has("IFY")).toBe(true);
      expect(resolveEffectiveNcukLevels(ac12Tag).has("IFY-S2")).toBe(false);

      expect(resolveEffectiveNcukLevels(ac44Tag).has("IFY-S1")).toBe(true);
      expect(resolveEffectiveNcukLevels(ac44Tag).has("IFY-S2")).toBe(false);
      expect(resolveEffectiveNcukLevels(ac45Tag).has("IFY-S2")).toBe(true);
      expect(resolveEffectiveNcukLevels(ac45Tag).has("IFY-S1")).toBe(false);

      for (const s2Tag of [ac62Tag, ac64Tag, ac65Tag]) {
        const levels = resolveEffectiveNcukLevels(s2Tag);
        expect(levels.has("IFY-S2")).toBe(true);
        expect(levels.has("IFY")).toBe(true);
        expect(levels.has("IFY-S1")).toBe(false);
      }

      const rows: PublicQuestionIndexRow[] = [
        {
          id: "q-ac1-2",
          syllabi: [ac12Tag],
          format: "mcq",
          difficulty: "standard",
          visualFamily: "graphs",
          totalMarks: 1,
          hasSvg: true,
          chunkKey: "graphs",
          conceptId: "graphical-linearization-gradients",
          familyGroupKey: "g::ac1-2",
        },
        {
          id: "q-ac4-4",
          syllabi: [ac44Tag],
          format: "structured",
          difficulty: "higher",
          visualFamily: "em-induction",
          totalMarks: 4,
          hasSvg: true,
          chunkKey: "em-induction",
          conceptId: "capacitor-rc-decay",
          familyGroupKey: "em::ac4-4",
        },
        {
          id: "q-ac4-5",
          syllabi: [ac45Tag],
          format: "mcq",
          difficulty: "standard",
          visualFamily: "fields",
          totalMarks: 1,
          hasSvg: true,
          chunkKey: "fields",
          conceptId: "electrostatic-coulomb-uniform-fields",
          familyGroupKey: "f::ac4-5",
        },
        {
          id: "q-ac6-2",
          syllabi: [ac62Tag],
          format: "mcq",
          difficulty: "foundation",
          visualFamily: "waves",
          totalMarks: 1,
          hasSvg: true,
          chunkKey: "waves",
          conceptId: "superposition-standing-waves",
          familyGroupKey: "w::ac6-2",
        },
        {
          id: "q-ac6-4",
          syllabi: [ac64Tag],
          format: "structured",
          difficulty: "standard",
          visualFamily: "waves",
          totalMarks: 4,
          hasSvg: true,
          chunkKey: "waves",
          conceptId: "diffraction-gratings-interference",
          familyGroupKey: "w::ac6-4",
        },
        {
          id: "q-ac6-5",
          syllabi: [ac65Tag],
          format: "mcq",
          difficulty: "higher",
          visualFamily: "optics-shm",
          totalMarks: 1,
          hasSvg: true,
          chunkKey: "optics-shm",
          conceptId: "refraction-snell-tir",
          familyGroupKey: "o::ac6-5",
        },
      ];

      const s1Rows = filterIndexRows(rows, { syllabus: "ncuk", level: "IFY-S1" });
      const s2Rows = filterIndexRows(rows, { syllabus: "ncuk", level: "IFY-S2" });
      const ifyRows = filterIndexRows(rows, { syllabus: "ncuk", level: "IFY" });

      expect(s1Rows.map((r) => r.id)).toEqual(["q-ac1-2", "q-ac4-4"]);
      expect(s2Rows.map((r) => r.id)).toEqual([
        "q-ac4-5",
        "q-ac6-2",
        "q-ac6-4",
        "q-ac6-5",
      ]);
      expect(ifyRows).toHaveLength(6);

      const manifest = buildPublicBankManifest(rows, "2026-11-20T00:00:00.000Z");
      expect(manifest.syllabi.ncuk.countsByLevel["IFY-S1"]).toBe(s1Rows.length);
      expect(manifest.syllabi.ncuk.countsByLevel["IFY-S2"]).toBe(s2Rows.length);
      expect(manifest.syllabi.ncuk.countsByLevel["IFY"]).toBe(ifyRows.length);

      const ac1Topic = manifest.syllabi.ncuk.topics.find((t) => t.id === "ncuk-ac1")!;
      expect(ac1Topic.countsByLevel["IFY-S1"]).toBe(1);
      expect(ac1Topic.countsByLevel["IFY-S2"]).toBe(0);

      const ac4Topic = manifest.syllabi.ncuk.topics.find((t) => t.id === "ncuk-ac4")!;
      expect(ac4Topic.countsByLevel["IFY-S1"]).toBe(1);
      expect(ac4Topic.countsByLevel["IFY-S2"]).toBe(1);
      expect(ac4Topic.countsByLevel["IFY"]).toBe(2);

      const ac6Topic = manifest.syllabi.ncuk.topics.find((t) => t.id === "ncuk-ac6")!;
      expect(ac6Topic.countsByLevel["IFY-S2"]).toBe(3);
      expect(ac6Topic.countsByLevel["IFY-S1"]).toBe(0);
    });

    it("caps each family to <= 12 balanced items and round-robin interleaves with zero consecutive duplicate families", async () => {
      const difficulties = ["foundation", "standard", "higher"] as const;
      const families = [
        "circuits::ohm-ladder",
        "circuits::kirchhoff-loop",
        "circuits::divider-sensor",
        "circuits::internal-resistance",
        "circuits::power-dissipation",
      ];

      const syntheticRaw: RawPublicBankInput[] = [];
      for (const fam of families) {
        for (let i = 0; i < 24; i += 1) {
          const isMcq = i < 15;
          const diff = difficulties[i % 3];
          syntheticRaw.push({
            schemaVersion: "sixthphysics-bank-item/1.0.0",
            id: `${fam.replace(/::/g, "-")}-${String(i).padStart(2, "0")}`,
            familyGroupKey: fam,
            syllabi: [
              {
                syllabus: "ncuk",
                level: "IFY-S1",
                topicId: "ncuk-ac4",
                subtopicId: "ncuk-ac4-2",
              },
            ],
            format: isMcq ? "mcq" : "structured",
            difficulty: diff,
            visualFamily: "circuits",
            stem: `Synthetic circuit item ${fam} #${i}`,
            workedSolution: "Worked solution.",
            markScheme: [{ code: "A1", criterion: "Correct answer.", marks: isMcq ? 1 : 4 }],
            totalMarks: isMcq ? 1 : 4,
            verifiedQuantities: {},
            provenance: {
              domain: "circuits",
              conceptId: fam.split("::")[0],
              templateArchetype: fam.split("::")[1],
              familyGroupKey: fam,
              seed: 1000 + i,
              shardId: "test-shard",
              generatorModel: "deterministic-test",
              solverId: "test-solver",
              stemFingerprint: `fp-${fam}-${i}`,
              split: "train",
              createdAt: "2026-11-20T00:00:00.000Z",
            },
            questionStyle: i % 2 === 0 ? "qualitative" : "calculation",
          });
        }
      }

      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sp-cap-rr-test-"));
      try {
        const srcPath = path.join(tmpDir, "all-items.json");
        fs.writeFileSync(srcPath, JSON.stringify(syntheticRaw), "utf8");

        // Default cap = 12
        const cappedRes = await compilePublicBank({
          sourceItemsPath: srcPath,
          outDir: path.join(tmpDir, "out-capped"),
          writeSeedFallback: false,
        });
        expect(cappedRes.fullBankTotalItems).toBe(120);
        expect(cappedRes.maxItemsPerFamily).toBe(12);
        expect(cappedRes.totalItems).toBe(60);

        const manifest = JSON.parse(
          fs.readFileSync(cappedRes.manifestPath, "utf8"),
        ) as PublicBankManifest;
        expect(manifest.fullBankTotalItems).toBe(120);
        expect(manifest.maxItemsPerFamily).toBe(12);
        expect(manifest.items).toHaveLength(60);

        // Verify per-family cap, 7 MCQ + 5 Structured split, and all 3 difficulties
        for (const fam of families) {
          const famRows = manifest.items.filter((r) => r.familyGroupKey === fam);
          expect(famRows).toHaveLength(12);
          expect(famRows.filter((r) => r.format === "mcq")).toHaveLength(7);
          expect(famRows.filter((r) => r.format === "structured")).toHaveLength(5);
          const famDiffs = new Set(famRows.map((r) => r.difficulty));
          expect(famDiffs.size).toBe(3);
        }

        // Verify ZERO consecutive duplicate families overall AND inside topic/format filters
        for (let i = 1; i < manifest.items.length; i += 1) {
          expect(manifest.items[i].familyGroupKey).not.toBe(
            manifest.items[i - 1].familyGroupKey,
          );
        }
        const mcqOnly = filterIndexRows(manifest.items, {
          syllabus: "ncuk",
          topicId: "ncuk-ac4",
          format: "mcq",
        });
        for (let i = 1; i < mcqOnly.length; i += 1) {
          expect(mcqOnly[i].familyGroupKey).not.toBe(mcqOnly[i - 1].familyGroupKey);
        }

        // Verify questionStyle propagated to manifest rows
        expect(manifest.items.some((r) => r.questionStyle === "qualitative")).toBe(true);
        expect(manifest.items.some((r) => r.questionStyle === "calculation")).toBe(true);

        // Verify CLI flag parsing and unlimited mode (0)
        expect(parseCompileCliArgs(["--max-per-family", "0"])).toEqual({
          maxItemsPerFamily: 0,
        });
        expect(parseCompileCliArgs(["--max-per-family=8"])).toEqual({
          maxItemsPerFamily: 8,
        });

        const unlimitedRes = await compilePublicBank({
          sourceItemsPath: srcPath,
          outDir: path.join(tmpDir, "out-unlimited"),
          writeSeedFallback: false,
          maxItemsPerFamily: 0,
        });
        expect(unlimitedRes.totalItems).toBe(120);
        expect(unlimitedRes.maxItemsPerFamily).toBe(0);

        // Direct capAndInterleaveRecords smoke check for format backfill (MCQ-only family)
        const mcqOnlyRecords = syntheticRaw
          .filter((r) => r.familyGroupKey === families[0] && r.format === "mcq")
          .map((raw) => ({ item: toPublicBankItem(raw), chunkKey: "circuits" as const }));
        expect(capAndInterleaveRecords(mcqOnlyRecords, 12)).toHaveLength(12);
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it("sanitizes student-facing grammar (a electron/electromagnetic/electrostatic) and zero-clamped micro constants without mutating source", () => {
      expect(
        sanitizeStudentText(
          "Inside a electrostatic chamber, a electron enters a electromagnetic rail while acceleration a stays constant.",
        ),
      ).toBe(
        "Inside an electrostatic chamber, an electron enters an electromagnetic rail while acceleration a stays constant.",
      );
      expect(sanitizeStudentText("A electron accelerates in vacuum.")).toBe(
        "An electron accelerates in vacuum.",
      );

      const rawFieldsBug: RawPublicBankInput = {
        schemaVersion: "sixthphysics-bank-item/1.0.0",
        id: "sp-fields-test-001",
        familyGroupKey:
          "electrostatic-coulomb-uniform-fields::parallel-plate-ion-acceleration-speed",
        syllabi: [
          {
            syllabus: "ncuk",
            level: "IFY-S2",
            topicId: "ncuk-ac4",
            subtopicId: "ncuk-ac4-5",
          },
        ],
        format: "mcq",
        difficulty: "standard",
        visualFamily: "fields",
        stem: "In a electrostatic gap, a proton (charge +0 C, mass 0 kg) accelerates from +500 V to 0 V.",
        options: [
          { label: "A", text: "3.10 × 10⁵ m s⁻¹", isCorrect: true },
          { label: "B", text: "2.19 × 10⁵ m s⁻¹", isCorrect: false, distractorRationale: "Applies to a electron instead." },
          { label: "C", text: "4.38 × 10⁵ m s⁻¹", isCorrect: false },
          { label: "D", text: "1.55 × 10⁵ m s⁻¹", isCorrect: false },
        ],
        correctOptionIndex: 0,
        workedSolution:
          "By conservation of energy, ½mv² = qV, so v = √(2qV / m) = √(2 × 0 × 500 / 0) = 3.10 × 10⁵ m s⁻¹ (A).",
        markScheme: [{ code: "A1", criterion: "Uses a electrostatic work relation.", marks: 1 }],
        totalMarks: 1,
        verifiedQuantities: {
          fieldNC: 12500,
          accelerationMs2: 1197604790419.1614,
          workJ: 8e-17,
          finalSpeedMs: 309529.2930136547,
        },
        provenance: {
          domain: "fields",
          conceptId: "electrostatic-coulomb-uniform-fields",
          templateArchetype: "parallel-plate-ion-acceleration-speed",
          familyGroupKey:
            "electrostatic-coulomb-uniform-fields::parallel-plate-ion-acceleration-speed",
          seed: 42,
          shardId: "fields-test",
          generatorModel: "test",
          solverId: "test",
          stemFingerprint: "fp-test",
          split: "val",
          createdAt: "2026-11-20T00:00:00.000Z",
        },
      };

      const cleaned = toPublicBankItem(rawFieldsBug);
      // Source raw item stays completely untouched
      expect(rawFieldsBug.stem).toContain("charge +0 C, mass 0 kg");
      // Student-facing item is clean
      expect(cleaned.stem).toContain("an electrostatic gap");
      expect(cleaned.stem).toContain("charge +1.60 × 10⁻¹⁹ C");
      expect(cleaned.stem).toContain("mass 1.67 × 10⁻²⁷ kg");
      expect(cleaned.stem).not.toContain("+0 C");
      expect(cleaned.stem).not.toContain("mass 0 kg");
      expect(cleaned.workedSolution).toContain(
        "√(2 × 1.60 × 10⁻¹⁹ × 500 / 1.67 × 10⁻²⁷)",
      );
      expect(cleaned.options?.[1].distractorRationale).toContain("an electron");
      expect(cleaned.markScheme[0].criterion).toContain("an electrostatic");

      // Also verify quantum-nuclear locked val/test 0.00 J & 0.00 N s cleanup
      const rawQnBug: RawPublicBankInput = {
        ...rawFieldsBug,
        id: "sp-qn-test-001",
        familyGroupKey: "wave-particle-duality-de-broglie::accelerated-beam-de-broglie-wavelength",
        stem: "A electron is accelerated across 160 V.",
        workedSolution:
          "Kinetic energy Eₖ = qV = 0.00 J. Momentum p = √(2mEₖ) = 0.00 N s. De Broglie wavelength λ = h / p = 97.1 pm.",
        verifiedQuantities: {
          kineticEnergyJ: 2.56e-17,
          momentumNs: 6.829582710532175e-24,
        },
      };
      const cleanedQn = toPublicBankItem(rawQnBug);
      expect(cleanedQn.stem).toBe("An electron is accelerated across 160 V.");
      expect(cleanedQn.workedSolution).toContain("2.56 × 10⁻¹⁷ J");
      expect(cleanedQn.workedSolution).toContain("6.83 × 10⁻²⁴ N s");
      expect(cleanedQn.workedSolution).not.toContain("0.00 J");
      expect(cleanedQn.workedSolution).not.toContain("0.00 N s");
    });

    it("assembles official NCUK IFYPH005 EoS1 (60 marks / 90 min / 22 Qs, S1 only) and Cumulative Final (100 marks / 150 min / 40 Qs) mocks", () => {
      const s1Topics: Array<{ topicId: string; subtopicId: string }> = [
        { topicId: "ncuk-ac1", subtopicId: "ncuk-ac1-1" },
        { topicId: "ncuk-ac2", subtopicId: "ncuk-ac2-1" },
        { topicId: "ncuk-ac3", subtopicId: "ncuk-ac3-2" },
        { topicId: "ncuk-ac4", subtopicId: "ncuk-ac4-2" },
      ];
      const s2Topics: Array<{ topicId: string; subtopicId: string }> = [
        { topicId: "ncuk-ac4", subtopicId: "ncuk-ac4-5" },
        { topicId: "ncuk-ac5", subtopicId: "ncuk-ac5-1" },
        { topicId: "ncuk-ac6", subtopicId: "ncuk-ac6-2" },
        { topicId: "ncuk-ac7", subtopicId: "ncuk-ac7-2" },
        { topicId: "ncuk-ac8", subtopicId: "ncuk-ac8-1" },
      ];

      const rows: PublicQuestionIndexRow[] = [];
      let seq = 0;
      const pushRow = (
        topicId: string,
        subtopicId: string,
        level: string,
        format: "mcq" | "structured",
        marks: number,
        questionStyle: string,
      ) => {
        seq += 1;
        rows.push({
          id: `ncuk-sim-${seq}`,
          syllabi: [{ syllabus: "ncuk", level, topicId, subtopicId }],
          format,
          difficulty: seq % 3 === 0 ? "higher" : seq % 2 === 0 ? "standard" : "foundation",
          visualFamily: "circuits",
          totalMarks: marks,
          hasSvg: true,
          chunkKey: "circuits",
          conceptId: `concept-${topicId}`,
          familyGroupKey: `fam-${topicId}-${format}-${marks}-${seq}`,
          questionStyle,
        });
      };

      // Populate Semester 1 pool (MCQs qual+calc, 2m, 3m, 4m, 10m)
      for (const { topicId, subtopicId } of s1Topics) {
        for (let i = 0; i < 4; i += 1) {
          pushRow(topicId, subtopicId, "IFY-S1", "mcq", 1, i % 2 === 0 ? "qualitative" : "calculation");
        }
        for (let i = 0; i < 3; i += 1) {
          pushRow(topicId, subtopicId, "IFY-S1", "structured", 2, i % 2 === 0 ? "definition" : "calculation");
        }
        for (let i = 0; i < 2; i += 1) {
          pushRow(topicId, subtopicId, "IFY-S1", "structured", 3, "calculation");
          pushRow(topicId, subtopicId, "IFY-S1", "structured", 4, "calculation");
        }
        pushRow(topicId, subtopicId, "IFY-S1", "structured", 10, "mixed-exam");
      }

      // Populate Semester 2 pool (MCQs qual+calc, 2m, 3m, 4m, 10m)
      for (const { topicId, subtopicId } of s2Topics) {
        for (let i = 0; i < 3; i += 1) {
          pushRow(topicId, subtopicId, "IFY-S2", "mcq", 1, i % 2 === 0 ? "qualitative" : "calculation");
        }
        for (let i = 0; i < 2; i += 1) {
          pushRow(topicId, subtopicId, "IFY-S2", "structured", 2, i % 2 === 0 ? "qualitative" : "calculation");
          pushRow(topicId, subtopicId, "IFY-S2", "structured", 3, "calculation");
          pushRow(topicId, subtopicId, "IFY-S2", "structured", 4, "calculation");
        }
        pushRow(topicId, subtopicId, "IFY-S2", "structured", 10, "mixed-exam");
      }

      const fullNcukManifest = buildPublicBankManifest(
        rows,
        "2026-11-20T00:00:00.000Z",
      );

      const eos1Preset = MOCK_PAPER_PRESETS.find((p) => p.id === "ncuk-eos1-official")!;
      expect(eos1Preset).toBeDefined();
      expect(eos1Preset.durationMinutes).toBe(90);
      expect(eos1Preset.targetTotalMarks).toBe(60);
      expect(eos1Preset.questionCount).toBe(22);

      // Even if caller passes level: "IFY-S2" from TopNav, EoS1 stays strictly S1
      const eos1Session = buildMockPaperSession(
        fullNcukManifest,
        createConfigFromPreset(eos1Preset, { level: "IFY-S2", seed: 2026 }),
      );
      expect(eos1Session.questionRows).toHaveLength(22);
      expect(eos1Session.totalMarks).toBe(60);
      expect(eos1Session.durationSeconds).toBe(90 * 60);
      expect(
        new Set(eos1Session.questionRows.map((r) => r.familyGroupKey)).size,
      ).toBe(22);

      // Strictly Semester 1 only (AC1-AC4.4)
      for (const row of eos1Session.questionRows) {
        const tag = row.syllabi.find((t) => t.syllabus === "ncuk")!;
        expect(resolveEffectiveNcukLevels(tag).has("IFY-S1")).toBe(true);
        expect(resolveEffectiveNcukLevels(tag).has("IFY-S2")).toBe(false);
      }

      // Exact IFYPH005 EoS1 section mark breakdown: 10x1m + 5x2m + 5x4m + 2x10m
      const eos1Mcqs = eos1Session.questionRows.slice(0, 10);
      const eos1Short = eos1Session.questionRows.slice(10, 15);
      const eos1App = eos1Session.questionRows.slice(15, 20);
      const eos1Long = eos1Session.questionRows.slice(20, 22);
      expect(eos1Mcqs.every((r) => r.format === "mcq" && r.totalMarks === 1)).toBe(true);
      expect(eos1Mcqs.filter((r) => r.questionStyle === "qualitative")).toHaveLength(5);
      expect(eos1Short.every((r) => r.format === "structured" && r.totalMarks === 2)).toBe(true);
      expect(eos1App.every((r) => r.format === "structured" && r.totalMarks === 4)).toBe(true);
      expect(eos1Long.every((r) => r.format === "structured" && r.totalMarks === 10)).toBe(true);

      // Cumulative Final preset (40 Qs, 100 marks, 150 min)
      const finalPreset = MOCK_PAPER_PRESETS.find((p) => p.id === "ncuk-final-official")!;
      expect(finalPreset).toBeDefined();
      expect(finalPreset.durationMinutes).toBe(150);
      expect(finalPreset.targetTotalMarks).toBe(100);
      expect(finalPreset.questionCount).toBe(40);

      const finalSession = buildMockPaperSession(
        fullNcukManifest,
        createConfigFromPreset(finalPreset, { level: "IFY-S1", seed: 2026 }),
      );
      expect(finalSession.questionRows).toHaveLength(40);
      expect(finalSession.totalMarks).toBe(100);
      expect(finalSession.durationSeconds).toBe(150 * 60);
      expect(
        new Set(finalSession.questionRows.map((r) => r.familyGroupKey)).size,
      ).toBe(40);

      // Spans both Semester 1 and Semester 2 modules
      const finalTopics = new Set(
        finalSession.questionRows.map(
          (r) => r.syllabi.find((t) => t.syllabus === "ncuk")!.topicId,
        ),
      );
      expect(finalTopics.size).toBe(8);
      expect(finalSession.questionRows.slice(0, 20).every((r) => r.format === "mcq")).toBe(true);
      expect(
        finalSession.questionRows.slice(20, 27).reduce((s, r) => s + r.totalMarks, 0),
      ).toBe(15);
      expect(
        finalSession.questionRows.slice(27, 37).reduce((s, r) => s + r.totalMarks, 0),
      ).toBe(35);
      expect(
        finalSession.questionRows.slice(37, 40).reduce((s, r) => s + r.totalMarks, 0),
      ).toBe(30);
    });
  });

  describe("UK A-Level cumulative Y12/Y13 level parity, official AQA 7407/7408 mocks & v3-alevel scaffold", () => {
    it("resolves A-Level Sections 1-5 to BOTH Y12 & Y13, Sections 6-13 to Y13 only, normalizes AS -> Y12, and guarantees badge/filter parity", () => {
      const sec1RawY13 = {
        syllabus: "alevel" as const,
        level: "Y13",
        topicId: "alevel-sec1-measurements-errors",
        subtopicId: "alevel-3-1-si-uncertainties-estimation",
      };
      const sec2ParticlesRawY12 = {
        syllabus: "alevel" as const,
        level: "Y12",
        topicId: "alevel-sec2-particles-radiation",
        subtopicId: "alevel-3-2-1-particles-quarks",
      };
      const sec2QuantumRawAS = {
        syllabus: "alevel" as const,
        level: "AS",
        topicId: "alevel-sec2-particles-radiation",
        subtopicId: "alevel-3-2-2-quantum-phenomena",
      };
      const sec5ElecRawY13 = {
        syllabus: "alevel" as const,
        level: "Y13",
        topicId: "alevel-sec5-electricity",
        subtopicId: "alevel-3-5-1-current-electricity",
      };
      const sec6Shm = {
        syllabus: "alevel" as const,
        level: "Y13",
        topicId: "alevel-sec6-further-mechanics-thermal",
        subtopicId: "alevel-3-6-1-periodic-motion-shm",
      };
      const sec6Thermal = {
        syllabus: "alevel" as const,
        level: "Y13",
        topicId: "alevel-sec6-further-mechanics-thermal",
        subtopicId: "alevel-3-6-2-thermal-physics",
      };
      const sec8Nuclear = {
        syllabus: "alevel" as const,
        level: "Y13",
        topicId: "alevel-sec8-nuclear-physics",
        subtopicId: "alevel-3-8-nuclear-decay-energy",
      };
      const opt13Electronics = {
        syllabus: "alevel" as const,
        level: "Y13",
        topicId: "alevel-options-9-13",
        subtopicId: "alevel-3-13-electronics",
      };

      for (const asTag of [
        sec1RawY13,
        sec2ParticlesRawY12,
        sec2QuantumRawAS,
        sec5ElecRawY13,
      ]) {
        const levels = resolveEffectiveAlevelLevels(asTag);
        expect(levels.has("Y12")).toBe(true);
        expect(levels.has("Y13")).toBe(true);
      }

      for (const a2Tag of [sec6Shm, sec6Thermal, sec8Nuclear, opt13Electronics]) {
        const levels = resolveEffectiveAlevelLevels(a2Tag);
        expect(levels.has("Y13")).toBe(true);
        expect(levels.has("Y12")).toBe(false);
      }

      const rows: PublicQuestionIndexRow[] = [
        {
          id: "al-3-1",
          syllabi: [sec1RawY13],
          format: "mcq",
          difficulty: "foundation",
          visualFamily: "graphs",
          totalMarks: 1,
          hasSvg: true,
          chunkKey: "graphs",
          conceptId: "uncertainties",
          familyGroupKey: "al::3-1",
        },
        {
          id: "al-3-2-1",
          syllabi: [sec2ParticlesRawY12],
          format: "mcq",
          difficulty: "standard",
          visualFamily: "quantum-nuclear",
          totalMarks: 1,
          hasSvg: true,
          chunkKey: "quantum-nuclear",
          conceptId: "particles",
          familyGroupKey: "al::3-2-1",
        },
        {
          id: "al-3-2-2",
          syllabi: [sec2QuantumRawAS],
          format: "structured",
          difficulty: "higher",
          visualFamily: "quantum-nuclear",
          totalMarks: 6,
          hasSvg: true,
          chunkKey: "quantum-nuclear",
          conceptId: "quantum",
          familyGroupKey: "al::3-2-2",
        },
        {
          id: "al-3-5-1",
          syllabi: [sec5ElecRawY13],
          format: "structured",
          difficulty: "standard",
          visualFamily: "circuits",
          totalMarks: 6,
          hasSvg: true,
          chunkKey: "circuits",
          conceptId: "electricity",
          familyGroupKey: "al::3-5-1",
        },
        {
          id: "al-3-6-1",
          syllabi: [sec6Shm],
          format: "mcq",
          difficulty: "higher",
          visualFamily: "optics-shm",
          totalMarks: 1,
          hasSvg: true,
          chunkKey: "optics-shm",
          conceptId: "shm",
          familyGroupKey: "al::3-6-1",
        },
        {
          id: "al-3-6-2",
          syllabi: [sec6Thermal],
          format: "structured",
          difficulty: "standard",
          visualFamily: "thermal",
          totalMarks: 6,
          hasSvg: true,
          chunkKey: "thermal",
          conceptId: "thermal",
          familyGroupKey: "al::3-6-2",
        },
        {
          id: "al-3-8",
          syllabi: [sec8Nuclear],
          format: "structured",
          difficulty: "higher",
          visualFamily: "quantum-nuclear",
          totalMarks: 6,
          hasSvg: true,
          chunkKey: "quantum-nuclear",
          conceptId: "nuclear",
          familyGroupKey: "al::3-8",
        },
        {
          id: "al-3-13",
          syllabi: [opt13Electronics],
          format: "structured",
          difficulty: "higher",
          visualFamily: "circuits",
          totalMarks: 6,
          hasSvg: true,
          chunkKey: "circuits",
          conceptId: "electronics",
          familyGroupKey: "al::3-13",
        },
      ];

      const y12Rows = filterIndexRows(rows, { syllabus: "alevel", level: "Y12" });
      const asShorthandRows = filterIndexRows(rows, { syllabus: "alevel", level: "AS" });
      const y13Rows = filterIndexRows(rows, { syllabus: "alevel", level: "Y13" });

      expect(y12Rows.map((r) => r.id)).toEqual([
        "al-3-1",
        "al-3-2-1",
        "al-3-2-2",
        "al-3-5-1",
      ]);
      expect(asShorthandRows).toEqual(y12Rows);
      // Cumulative Y13 MUST include all 8 items, including Section 2 (3.2)!
      expect(y13Rows).toHaveLength(8);
      expect(y13Rows.some((r) => r.id === "al-3-2-1")).toBe(true);
      expect(y13Rows.some((r) => r.id === "al-3-2-2")).toBe(true);

      const manifest = buildPublicBankManifest(rows, "2026-11-21T00:00:00.000Z");
      expect(manifest.syllabi.alevel.countsByLevel["Y12"]).toBe(y12Rows.length);
      expect(manifest.syllabi.alevel.countsByLevel["Y13"]).toBe(y13Rows.length);

      const sec2Topic = manifest.syllabi.alevel.topics.find(
        (t) => t.id === "alevel-sec2-particles-radiation",
      )!;
      expect(sec2Topic.countsByLevel["Y12"]).toBe(2);
      expect(sec2Topic.countsByLevel["Y13"]).toBe(2);

      const sec6Topic = manifest.syllabi.alevel.topics.find(
        (t) => t.id === "alevel-sec6-further-mechanics-thermal",
      )!;
      expect(sec6Topic.countsByLevel["Y12"]).toBe(0);
      expect(sec6Topic.countsByLevel["Y13"]).toBe(2);
    });

    it("assembles all 5 official AQA 7407/7408 mock papers with strict subtopic isolation (Paper 1 gets 3.6.1 not 3.6.2; Paper 2 gets 3.6.2 not 3.6.1; Paper 3B gets one single option)", () => {
      const subtopicSpecs: Array<{
        topicId: string;
        subtopicId: string;
        level: string;
        chunkKey: PublicQuestionIndexRow["chunkKey"];
      }> = [
        { topicId: "alevel-sec1-measurements-errors", subtopicId: "alevel-3-1-si-uncertainties-estimation", level: "Y12", chunkKey: "graphs" },
        { topicId: "alevel-sec2-particles-radiation", subtopicId: "alevel-3-2-1-particles-quarks", level: "Y12", chunkKey: "quantum-nuclear" },
        { topicId: "alevel-sec2-particles-radiation", subtopicId: "alevel-3-2-2-quantum-phenomena", level: "Y12", chunkKey: "quantum-nuclear" },
        { topicId: "alevel-sec3-waves", subtopicId: "alevel-3-3-1-progressive-stationary-waves", level: "Y12", chunkKey: "waves" },
        { topicId: "alevel-sec3-waves", subtopicId: "alevel-3-3-2-refraction-diffraction-interference", level: "Y12", chunkKey: "waves" },
        { topicId: "alevel-sec4-mechanics-materials", subtopicId: "alevel-3-4-1-force-energy-momentum", level: "Y12", chunkKey: "mechanics" },
        { topicId: "alevel-sec4-mechanics-materials", subtopicId: "alevel-3-4-2-materials-young-modulus", level: "Y12", chunkKey: "mechanics" },
        { topicId: "alevel-sec5-electricity", subtopicId: "alevel-3-5-1-current-electricity", level: "Y12", chunkKey: "circuits" },
        { topicId: "alevel-sec6-further-mechanics-thermal", subtopicId: "alevel-3-6-1-periodic-motion-shm", level: "Y13", chunkKey: "optics-shm" },
        { topicId: "alevel-sec6-further-mechanics-thermal", subtopicId: "alevel-3-6-2-thermal-physics", level: "Y13", chunkKey: "thermal" },
        { topicId: "alevel-sec7-fields-consequences", subtopicId: "alevel-3-7-2-gravitational-fields", level: "Y13", chunkKey: "grav-astro" },
        { topicId: "alevel-sec7-fields-consequences", subtopicId: "alevel-3-7-3-electric-fields", level: "Y13", chunkKey: "fields" },
        { topicId: "alevel-sec7-fields-consequences", subtopicId: "alevel-3-7-4-capacitance", level: "Y13", chunkKey: "em-induction" },
        { topicId: "alevel-sec7-fields-consequences", subtopicId: "alevel-3-7-5-magnetic-fields-induction-ac", level: "Y13", chunkKey: "em-induction" },
        { topicId: "alevel-sec8-nuclear-physics", subtopicId: "alevel-3-8-nuclear-decay-energy", level: "Y13", chunkKey: "quantum-nuclear" },
        { topicId: "alevel-options-9-13", subtopicId: "alevel-3-9-astrophysics", level: "Y13", chunkKey: "grav-astro" },
        { topicId: "alevel-options-9-13", subtopicId: "alevel-3-10-medical-physics", level: "Y13", chunkKey: "optics-shm" },
        { topicId: "alevel-options-9-13", subtopicId: "alevel-3-11-engineering-physics", level: "Y13", chunkKey: "mechanics" },
        { topicId: "alevel-options-9-13", subtopicId: "alevel-3-12-turning-points", level: "Y13", chunkKey: "quantum-nuclear" },
        { topicId: "alevel-options-9-13", subtopicId: "alevel-3-13-electronics", level: "Y13", chunkKey: "circuits" },
      ];

      const rows: PublicQuestionIndexRow[] = [];
      let seq = 0;
      const pushRow = (
        spec: (typeof subtopicSpecs)[number],
        format: "mcq" | "structured",
        marks: number,
        questionStyle: string,
        overrideChunkKey?: PublicQuestionIndexRow["chunkKey"],
      ) => {
        seq += 1;
        rows.push({
          id: `al-sim-${seq}`,
          syllabi: [
            {
              syllabus: "alevel",
              level: spec.level,
              topicId: spec.topicId,
              subtopicId: spec.subtopicId,
            },
          ],
          format,
          difficulty: seq % 3 === 0 ? "higher" : seq % 2 === 0 ? "standard" : "foundation",
          visualFamily: overrideChunkKey ?? spec.chunkKey,
          totalMarks: marks,
          hasSvg: true,
          chunkKey: overrideChunkKey ?? spec.chunkKey,
          conceptId: `concept-${spec.subtopicId}`,
          familyGroupKey: `al-fam-${spec.subtopicId}-${format}-${marks}-${seq}`,
          questionStyle,
        });
      };

      for (const spec of subtopicSpecs) {
        const isOption = spec.topicId === "alevel-options-9-13";
        for (let i = 0; i < 6; i += 1) {
          pushRow(spec, "mcq", 1, i % 2 === 0 ? "qualitative" : "calculation");
        }
        for (let i = 0; i < 3; i += 1) {
          pushRow(spec, "structured", 4, i === 0 && !isOption ? "experimental" : "calculation");
          pushRow(spec, "structured", 5, i === 0 && !isOption ? "experimental" : "calculation");
        }
        for (let i = 0; i < 5; i += 1) {
          pushRow(
            spec,
            "structured",
            6,
            i === 0 && !isOption
              ? "experimental"
              : i % 2 === 0
                ? "qualitative"
                : "calculation",
            i === 0 && !isOption ? "graphs" : undefined,
          );
        }
      }

      const manifest = buildPublicBankManifest(rows, "2026-11-21T00:00:00.000Z");
      const getSubtopic = (r: PublicQuestionIndexRow) =>
        r.syllabi.find((t) => t.syllabus === "alevel")!.subtopicId!;

      // 1. AQA AS Paper 1 (7407/1): 90 min, 70 marks, 12 structured only, Sections 1-5
      const as1Preset = MOCK_PAPER_PRESETS.find((p) => p.id === "alevel-as-paper1-official")!;
      const as1 = buildMockPaperSession(
        manifest,
        createConfigFromPreset(as1Preset, { level: "Y13", seed: 2026 }),
      );
      expect(as1.durationSeconds).toBe(90 * 60);
      expect(as1.questionRows).toHaveLength(12);
      expect(as1.totalMarks).toBe(70);
      expect(as1.questionRows.every((r) => r.format === "structured")).toBe(true);
      expect(new Set(as1.questionRows.map((r) => r.familyGroupKey)).size).toBe(12);
      for (const r of as1.questionRows) {
        expect(resolveEffectiveAlevelLevels(r.syllabi[0]).has("Y12")).toBe(true);
      }

      // 2. AQA AS Paper 2 (7407/2): 90 min, 70 marks, 8 structured (40m) + 30 MCQs (30m), Sections 1-5
      const as2Preset = MOCK_PAPER_PRESETS.find((p) => p.id === "alevel-as-paper2-official")!;
      const as2 = buildMockPaperSession(
        manifest,
        createConfigFromPreset(as2Preset, { level: "Y13", seed: 2026 }),
      );
      expect(as2.durationSeconds).toBe(90 * 60);
      expect(as2.questionRows).toHaveLength(38);
      expect(as2.totalMarks).toBe(70);
      expect(as2.questionRows.filter((r) => r.format === "structured")).toHaveLength(8);
      expect(as2.questionRows.filter((r) => r.format === "mcq")).toHaveLength(30);
      expect(new Set(as2.questionRows.map((r) => r.familyGroupKey)).size).toBe(38);
      for (const r of as2.questionRows) {
        expect(resolveEffectiveAlevelLevels(r.syllabi[0]).has("Y12")).toBe(true);
      }

      // 3. AQA A-Level Paper 1 (7408/1): 120 min, 85 marks, 3.1-3.5 + 3.6.1 ONLY (NEVER 3.6.2!)
      const a2p1Preset = MOCK_PAPER_PRESETS.find((p) => p.id === "alevel-a2-paper1-official")!;
      const a2p1 = buildMockPaperSession(
        manifest,
        createConfigFromPreset(a2p1Preset, { level: "Y12", seed: 2026 }),
      );
      expect(a2p1.durationSeconds).toBe(120 * 60);
      expect(a2p1.questionRows).toHaveLength(35);
      expect(a2p1.totalMarks).toBe(85);
      expect(a2p1.questionRows.filter((r) => r.format === "structured")).toHaveLength(10);
      expect(a2p1.questionRows.filter((r) => r.format === "mcq")).toHaveLength(25);
      expect(new Set(a2p1.questionRows.map((r) => r.familyGroupKey)).size).toBe(35);
      const p1Subs = new Set(a2p1.questionRows.map(getSubtopic));
      expect(p1Subs.has("alevel-3-6-1-periodic-motion-shm")).toBe(true);
      expect(p1Subs.has("alevel-3-6-2-thermal-physics")).toBe(false);
      for (const sub of p1Subs) {
        expect(ALEVEL_PAPER1_SUBTOPIC_IDS).toContain(sub);
      }
      const p1QualMcqs = a2p1.questionRows.filter(
        (r) => r.format === "mcq" && r.questionStyle === "qualitative",
      );
      expect(p1QualMcqs.length).toBeGreaterThanOrEqual(8);

      // 4. AQA A-Level Paper 2 (7408/2): 120 min, 85 marks, 3.6.2 + 3.7 + 3.8 ONLY (NEVER 3.6.1!)
      const a2p2Preset = MOCK_PAPER_PRESETS.find((p) => p.id === "alevel-a2-paper2-official")!;
      const a2p2 = buildMockPaperSession(
        manifest,
        createConfigFromPreset(a2p2Preset, { level: "Y12", seed: 2026 }),
      );
      expect(a2p2.durationSeconds).toBe(120 * 60);
      expect(a2p2.questionRows).toHaveLength(35);
      expect(a2p2.totalMarks).toBe(85);
      expect(a2p2.questionRows.filter((r) => r.format === "structured")).toHaveLength(10);
      expect(a2p2.questionRows.filter((r) => r.format === "mcq")).toHaveLength(25);
      expect(new Set(a2p2.questionRows.map((r) => r.familyGroupKey)).size).toBe(35);
      const p2Subs = new Set(a2p2.questionRows.map(getSubtopic));
      expect(p2Subs.has("alevel-3-6-2-thermal-physics")).toBe(true);
      expect(p2Subs.has("alevel-3-6-1-periodic-motion-shm")).toBe(false);
      for (const sub of p2Subs) {
        expect(ALEVEL_PAPER2_SUBTOPIC_IDS).toContain(sub);
      }

      // 5. AQA A-Level Paper 3 (7408/3): 120 min, 80 marks, Sec A (45m practical) + Sec B (35m ONE option)
      const a2p3Preset = MOCK_PAPER_PRESETS.find((p) => p.id === "alevel-a2-paper3-official")!;
      const a2p3 = buildMockPaperSession(
        manifest,
        createConfigFromPreset(a2p3Preset, { seed: 2026 }),
      );
      expect(a2p3.durationSeconds).toBe(120 * 60);
      expect(a2p3.questionRows).toHaveLength(14);
      expect(a2p3.totalMarks).toBe(80);
      expect(a2p3.questionRows.every((r) => r.format === "structured")).toBe(true);
      expect(new Set(a2p3.questionRows.map((r) => r.familyGroupKey)).size).toBe(14);

      const p3SecA = a2p3.questionRows.slice(0, 8);
      const p3SecB = a2p3.questionRows.slice(8, 14);
      expect(p3SecA.reduce((s, r) => s + r.totalMarks, 0)).toBe(45);
      expect(p3SecB.reduce((s, r) => s + r.totalMarks, 0)).toBe(35);
      expect(
        p3SecA.every((r) => !ALEVEL_OPTION_SUBTOPIC_IDS.includes(getSubtopic(r))),
      ).toBe(true);
      const p3Options = new Set(p3SecB.map(getSubtopic));
      expect(p3Options.size).toBe(1);
      expect(ALEVEL_OPTION_SUBTOPIC_IDS).toContain([...p3Options][0]);

      // Verify explicit option selection via assembleOfficialAlevelBlueprint
      let rngState = 12345;
      const simpleRng = () => {
        rngState = (rngState * 1664525 + 1013904223) >>> 0;
        return rngState / 4294967296;
      };
      const elecPaper3 = assembleOfficialAlevelBlueprint(
        rows,
        "alevel-a2-paper3-official",
        simpleRng,
        { optionSubtopicId: "alevel-3-13-electronics" },
      );
      expect(elecPaper3.selectedOptionSubtopicId).toBe("alevel-3-13-electronics");
      expect(elecPaper3.sectionBStructuredRows).toHaveLength(6);
      expect(
        elecPaper3.sectionBStructuredRows.every(
          (r) => getSubtopic(r) === "alevel-3-13-electronics",
        ),
      ).toBe(true);
    });

    it("exposes build-bank-v3-alevel SHA-256 locks, wired 5-shard specs, CLI parsing, and style inference", () => {
      expect(EXPECTED_FROZEN_MANIFEST_SHA256).toBe(
        "0a0d1bc071c8250107864a4dc7db44575c4d8e5f1c56978ade15b64f124c4c67",
      );
      expect(EXPECTED_VAL_JSONL_SHA256).toBe(
        "a094cab46b48ea1c08300ed172fc13d8660a0a1cc5fe1021e273552d1ac6c846",
      );
      expect(EXPECTED_TEST_JSONL_SHA256).toBe(
        "fd6888e53f0c98ccd0b5f792e1f6bf223f6067ef400b270dd2cb9463310b1252",
      );
      expect(
        ALEVEL_V3_SHARD_SPECS.map((s) => ({
          shardId: s.shardId,
          baseSeed: s.baseSeed,
        })),
      ).toEqual([
        { shardId: "alevel-v3-practicals", baseSeed: 73_000_000 },
        { shardId: "alevel-v3-core-as", baseSeed: 74_000_000 },
        { shardId: "alevel-v3-core-a2", baseSeed: 75_000_000 },
        { shardId: "alevel-v3-options-astromed", baseSeed: 76_000_000 },
        { shardId: "alevel-v3-options-eng-elec", baseSeed: 77_000_000 },
      ]);

      const cliArgs = parseBuildBankV3AlevelArgs([
        "--source-dir",
        "dataset/sixthphysics-bank",
        "--out-dir",
        "dataset/sixthphysics-bank-v3-alevel",
        "--allow-custom-manifest",
      ]);
      expect(cliArgs.sourceBankDir).toMatch(/dataset\/sixthphysics-bank$/);
      expect(cliArgs.outDir).toMatch(/dataset\/sixthphysics-bank-v3-alevel$/);
      expect(cliArgs.allowCustomManifest).toBe(true);

      expect(
        inferAlevelV3QuestionStyle({
          id: "test-prac",
          conceptId: "uncertainties",
          templateArchetype: "al-prac-rp7-shm",
          seed: 73000001,
          syllabi: [],
          format: "structured",
          difficulty: "standard",
          domain: "graphs",
          scenarioSpec: { kind: "al-prac-rp7-shm" },
          hiddenQuantities: [],
          requiredGivens: [],
          stem: "A student performs Required Practical 7 with error bars.",
          workedSolution: "Gradient.",
          markScheme: [],
          totalMarks: 6,
          parts: [
            {
              partId: "a",
              prompt: "Determine the worst-fit gradient.",
              marks: 6,
              expectedAnswer: "4.0",
              workingSteps: [],
            },
          ],
        }),
      ).toBe("experimental");

      expect(
        inferAlevelV3QuestionStyle({
          id: "test-lor",
          conceptId: "photoelectric-effect",
          templateArchetype: "al-as-photoelectric-lor",
          seed: 74000001,
          syllabi: [],
          format: "structured",
          targetMode: "qualitative",
          difficulty: "higher",
          domain: "quantum-nuclear",
          scenarioSpec: { kind: "al-as-photoelectric" },
          hiddenQuantities: [],
          requiredGivens: [],
          stem: "Explain why the wave model fails to explain the photoelectric effect.",
          workedSolution: "Photon model.",
          markScheme: [],
          totalMarks: 6,
          parts: [
            {
              partId: "a",
              prompt: "Explain how the photon model accounts for threshold frequency.",
              marks: 6,
              targetMode: "qualitative",
              expectedAnswer: "One-to-one photon absorption",
              workingSteps: [],
            },
          ],
        }),
      ).toBe("qualitative");
    });
  });
});
