import {
  ALEVEL_OPTION_SUBTOPIC_IDS,
  ALEVEL_PAPER1_SUBTOPIC_IDS,
  ALEVEL_PAPER2_SUBTOPIC_IDS,
  buildDefaultPaperTitle,
  buildExamPaperDraft,
  buildExamPaperDraftFromSession,
  buildExamPdfFilename,
  buildMockPaperSession,
  calculateRecommendedMinutes,
  createDefaultExamPaperOptions,
  estimateExamPaperPages,
  estimateStructuredLineCount,
  getDefaultPresetForSyllabus,
  getExamPaperPresetsForSyllabus,
  getFallbackManifest,
  getSyllabusExamMetadata,
  moveQuestionInDraft,
  removeQuestionFromDraft,
  selectBookletEquationsForPaper,
  swapQuestionInDraft,
  type PublicBankManifest,
  type PublicQuestionIndexRow,
  type SyllabusId,
} from '@/lib/sixthphysics-web';
import { buildPublicBankManifest } from '../../../scripts/static-site/compile-public-bank';

describe('pdf-paper generator logic', () => {
  const manifest = getFallbackManifest();

  it('provides course-matched presets for every syllabus including official NCUK IFYPH005 papers', () => {
    const syllabi: SyllabusId[] = ['ib', 'alevel', 'ncuk'];
    for (const syllabus of syllabi) {
      const presets = getExamPaperPresetsForSyllabus(syllabus);
      expect(presets.length).toBeGreaterThanOrEqual(4);
      const recommended = getDefaultPresetForSyllabus(syllabus);
      expect(recommended.syllabus).toBe(syllabus);
      expect(recommended.recommended).toBe(true);
    }

    const ncukPresets = getExamPaperPresetsForSyllabus('ncuk');
    const eos1 = ncukPresets.find((p) => p.id === 'ncuk-eos1-official');
    const finalPaper = ncukPresets.find((p) => p.id === 'ncuk-final-official');
    expect(eos1).toMatchObject({
      shortTitle: 'NCUK IFY EoS1 Exam',
      durationMinutes: 90,
      targetTotalMarks: 60,
      mcqCount: 10,
      structuredCount: 12,
      level: 'IFY-S1',
    });
    expect(finalPaper).toMatchObject({
      shortTitle: 'NCUK IFY Cumulative Final',
      durationMinutes: 150,
      targetTotalMarks: 100,
      mcqCount: 20,
      structuredCount: 20,
    });
  });

  it('builds a family-deduplicated mixed paper with deterministic seed', () => {
    const draftA = buildExamPaperDraft(manifest, {
      syllabus: 'ib',
      level: 'all',
      formatMode: 'mixed',
      mcqCount: 4,
      structuredCount: 2,
      difficultyMix: 'exam-mix',
      seed: 123456,
    });
    const draftB = buildExamPaperDraft(manifest, {
      syllabus: 'ib',
      level: 'all',
      formatMode: 'mixed',
      mcqCount: 4,
      structuredCount: 2,
      difficultyMix: 'exam-mix',
      seed: 123456,
    });

    expect(draftA.questionRows.map((r) => r.id)).toEqual(
      draftB.questionRows.map((r) => r.id)
    );
    expect(draftA.paperCode).toBe(draftB.paperCode);
    expect(draftA.paperCode).toMatch(/^SP-IB25-[A-Z0-9]{4}$/);

    const uniqueFamilies = new Set(
      draftA.questionRows.map((r) => r.familyGroupKey)
    );
    expect(uniqueFamilies.size).toBe(draftA.questionRows.length);
    expect(draftA.mcqRows.length).toBeGreaterThan(0);
    expect(draftA.structuredRows.length).toBeGreaterThan(0);
    expect(draftA.totalMarks).toBe(draftA.mcqMarks + draftA.structuredMarks);
  });

  it('respects formatMode mcq-only and structured-only', () => {
    const mcqOnly = buildExamPaperDraft(manifest, {
      syllabus: 'alevel',
      formatMode: 'mcq',
      mcqCount: 5,
      structuredCount: 4,
      difficultyMix: 'exam-mix',
      seed: 99,
    });
    expect(mcqOnly.structuredRows).toHaveLength(0);
    expect(mcqOnly.mcqRows.length).toBeGreaterThan(0);

    const structuredOnly = buildExamPaperDraft(manifest, {
      syllabus: 'ncuk',
      formatMode: 'structured',
      mcqCount: 10,
      structuredCount: 3,
      difficultyMix: 'exam-mix',
      seed: 99,
    });
    expect(structuredOnly.mcqRows).toHaveLength(0);
    expect(structuredOnly.structuredRows.length).toBeGreaterThan(0);
  });

  it('swaps, moves, and removes questions while preserving uniqueness and invariants', () => {
    const draft = buildExamPaperDraft(manifest, {
      syllabus: 'ib',
      formatMode: 'mixed',
      mcqCount: 3,
      structuredCount: 2,
      difficultyMix: 'exam-mix',
      seed: 4242,
    });

    expect(draft.questionRows.length).toBeGreaterThanOrEqual(3);

    const swapped = swapQuestionInDraft(manifest, draft, 0, 7777);
    if (swapped) {
      expect(swapped.questionRows).toHaveLength(draft.questionRows.length);
      expect(swapped.questionRows[0].id).not.toBe(draft.questionRows[0].id);
      const famSet = new Set(swapped.questionRows.map((r) => r.familyGroupKey));
      expect(famSet.size).toBe(swapped.questionRows.length);
    }

    const moved = moveQuestionInDraft(draft, 0, 1);
    expect(moved.questionRows[0].id).toBe(draft.questionRows[1].id);
    expect(moved.questionRows[1].id).toBe(draft.questionRows[0].id);

    const removed = removeQuestionFromDraft(draft, 0);
    expect(removed.questionRows).toHaveLength(draft.questionRows.length - 1);

    // Refuses to remove the last remaining question
    let single = removed;
    while (single.questionRows.length > 1) {
      single = removeQuestionFromDraft(single, 0);
    }
    expect(single.questionRows).toHaveLength(1);
    expect(removeQuestionFromDraft(single, 0).questionRows).toHaveLength(1);
  });

  it('converts an interactive MockPaperSession cleanly into an ExamPaperDraft', () => {
    const session = buildMockPaperSession(manifest, {
      title: 'IB HL Custom Mock',
      syllabus: 'ib',
      level: 'all',
      formatMode: 'mixed',
      questionCount: 5,
      durationMinutes: 35,
      seed: 888,
    });

    const draft = buildExamPaperDraftFromSession(session);
    expect(draft.questionRows.map((r) => r.id)).toEqual(session.questionIds);
    expect(draft.totalMarks).toBe(session.totalMarks);
    expect(draft.durationMinutes).toBe(35);
    expect(draft.syllabus).toBe('ib');
  });

  it('calculates smart timing, line counts, page estimates, and safe PDF filenames', () => {
    const draft = buildExamPaperDraft(manifest, {
      syllabus: 'alevel',
      formatMode: 'mixed',
      mcqCount: 4,
      structuredCount: 2,
      difficultyMix: 'exam-mix',
      seed: 101,
    });

    const mins = calculateRecommendedMinutes(draft.questionRows);
    expect(mins).toBeGreaterThanOrEqual(10);
    expect(mins % 5).toBe(0);

    expect(estimateStructuredLineCount(1, 'exam-lines')).toBe(3);
    expect(estimateStructuredLineCount(3, 'exam-lines')).toBe(7);
    expect(estimateStructuredLineCount(3, 'compact')).toBeLessThan(
      estimateStructuredLineCount(3, 'exam-lines')
    );

    const opts = createDefaultExamPaperOptions('alevel', 'Y13', 'mixed');
    const pages = estimateExamPaperPages(draft, opts);
    expect(pages).toBeGreaterThanOrEqual(3);

    const paperFile = buildExamPdfFilename(
      draft,
      'A-Level Physics · Y13 · Core Mock Paper',
      'paper'
    );
    const msFile = buildExamPdfFilename(
      draft,
      'A-Level Physics · Y13 · Core Mock Paper',
      'markscheme'
    );
    expect(paperFile).toContain(draft.paperCode);
    expect(paperFile).toMatch(/Question-Paper$/);
    expect(msFile).toMatch(/Mark-Scheme$/);
    expect(paperFile).not.toMatch(/[·/:*?"<>|]/);
  });

  it('returns course-accurate gravity conventions and mark brackets for all three syllabi', () => {
    const ib = getSyllabusExamMetadata(
      'ib',
      'HL',
      { mcqCount: 10, structuredCount: 3, totalMarks: 28 },
      true
    );
    expect(ib.gravityText).toContain('9.8 m');
    expect(ib.formatMarkTag(3)).toBe('[3]');

    const alevel = getSyllabusExamMetadata(
      'alevel',
      'Y13',
      { mcqCount: 10, structuredCount: 3, totalMarks: 28 },
      true
    );
    expect(alevel.gravityText).toContain('9.81 m');
    expect(alevel.formatMarkTag(1)).toBe('[1 mark]');
    expect(alevel.formatMarkTag(3)).toBe('[3 marks]');

    const ncuk = getSyllabusExamMetadata(
      'ncuk',
      'IFY-S1',
      { mcqCount: 10, structuredCount: 3, totalMarks: 28 },
      false
    );
    expect(ncuk.gravityText).toContain('9.81 m');
    expect(ncuk.formatMarkTag(2)).toBe('(2 marks)');
    expect(buildDefaultPaperTitle('ncuk', 'IFY-S1', 'mcq')).toContain('S1');

    const eos1Meta = getSyllabusExamMetadata(
      'ncuk',
      'IFY-S1',
      { mcqCount: 10, structuredCount: 12, totalMarks: 60 },
      true,
      'ncuk-eos1-official'
    );
    expect(eos1Meta.boardMasthead).toContain('END OF SEMESTER 1');
    expect(eos1Meta.sectionATitle).toContain('Section 1');
    expect(eos1Meta.sectionATitle).toContain('Q1–Q10');
    expect(eos1Meta.sectionBTitle).toContain('Sections 2–4');
    expect(eos1Meta.specSubtitle).toContain('90 minutes');
    expect(eos1Meta.specSubtitle).toContain('60 marks');
    expect(eos1Meta.officialSections).toHaveLength(4);

    const finalMeta = getSyllabusExamMetadata(
      'ncuk',
      'all',
      { mcqCount: 20, structuredCount: 20, totalMarks: 100 },
      true,
      'ncuk-final-official'
    );
    expect(finalMeta.boardMasthead).toContain('CUMULATIVE FINAL');
    expect(finalMeta.sectionATitle).toContain('Q1–Q20');
    expect(finalMeta.sectionBTitle).toContain('Q21–Q40');
    expect(finalMeta.specSubtitle).toContain('150 minutes');
    expect(finalMeta.specSubtitle).toContain('100 marks');
    expect(finalMeta.officialSections).toHaveLength(4);

    const eos1Draft = buildExamPaperDraft(manifest, {
      syllabus: 'ncuk',
      level: 'all',
      presetId: 'ncuk-eos1-official',
      formatMode: 'mixed',
      mcqCount: 10,
      structuredCount: 12,
      difficultyMix: 'exam-mix',
      seed: 2026,
    });
    expect(eos1Draft.durationMinutes).toBe(90);
    expect(eos1Draft.level).toBe('IFY-S1');

    const finalDraft = buildExamPaperDraft(manifest, {
      syllabus: 'ncuk',
      level: 'IFY-S1',
      presetId: 'ncuk-final-official',
      formatMode: 'mixed',
      mcqCount: 20,
      structuredCount: 20,
      difficultyMix: 'exam-mix',
      seed: 2026,
    });
    expect(finalDraft.durationMinutes).toBe(150);
    expect(finalDraft.level).toBe('all');
  });

  it('selects only in-booklet equations matching the paper topics and level', () => {
    const ibSlGroups = selectBookletEquationsForPaper(
      'ib',
      'SL',
      ['ib-theme-a', 'ib-theme-c'],
      4
    );
    expect(ibSlGroups.length).toBeGreaterThan(0);
    for (const group of ibSlGroups) {
      expect(['ib-theme-a', 'ib-theme-c']).toContain(group.topicId);
      for (const eq of group.equations) {
        expect(eq.inDataBooklet).toBe(true);
        expect(eq.level).toBe('SL');
      }
    }
  });

  it('exposes all 5 official AQA 7407/7408 PDF presets, exam metadata, section headers, and subtopic-isolated drafts', () => {
    const alevelPresets = getExamPaperPresetsForSyllabus('alevel');
    const as1 = alevelPresets.find((p) => p.id === 'alevel-as-paper1-official');
    const as2 = alevelPresets.find((p) => p.id === 'alevel-as-paper2-official');
    const a2p1 = alevelPresets.find((p) => p.id === 'alevel-a2-paper1-official');
    const a2p2 = alevelPresets.find((p) => p.id === 'alevel-a2-paper2-official');
    const a2p3 = alevelPresets.find((p) => p.id === 'alevel-a2-paper3-official');

    expect(as1).toMatchObject({
      shortTitle: 'AQA AS Paper 1 (7407/1)',
      formatMode: 'structured',
      level: 'Y12',
      durationMinutes: 90,
      targetTotalMarks: 70,
      mcqCount: 0,
      structuredCount: 12,
    });
    expect(as2).toMatchObject({
      shortTitle: 'AQA AS Paper 2 (7407/2)',
      formatMode: 'mixed',
      level: 'Y12',
      durationMinutes: 90,
      targetTotalMarks: 70,
      mcqCount: 30,
      structuredCount: 8,
    });
    expect(a2p1).toMatchObject({
      shortTitle: 'AQA A-Level Paper 1 (7408/1)',
      formatMode: 'mixed',
      level: 'Y13',
      durationMinutes: 120,
      targetTotalMarks: 85,
      mcqCount: 25,
      structuredCount: 10,
    });
    expect(a2p2).toMatchObject({
      shortTitle: 'AQA A-Level Paper 2 (7408/2)',
      formatMode: 'mixed',
      level: 'Y13',
      durationMinutes: 120,
      targetTotalMarks: 85,
      mcqCount: 25,
      structuredCount: 10,
    });
    expect(a2p3).toMatchObject({
      shortTitle: 'AQA A-Level Paper 3 (7408/3)',
      formatMode: 'structured',
      level: 'Y13',
      durationMinutes: 120,
      targetTotalMarks: 80,
      mcqCount: 0,
      structuredCount: 14,
    });

    // Metadata & official section headers for all 5 official AQA papers
    const as1Meta = getSyllabusExamMetadata(
      'alevel',
      'Y12',
      { mcqCount: 0, structuredCount: 12, totalMarks: 70 },
      true,
      'alevel-as-paper1-official'
    );
    expect(as1Meta.boardMasthead).toContain('7407/1');
    expect(as1Meta.officialSections).toHaveLength(1);
    expect(as1Meta.officialSections?.[0].marks).toBe(70);

    const as2Meta = getSyllabusExamMetadata(
      'alevel',
      'Y12',
      { mcqCount: 30, structuredCount: 8, totalMarks: 70 },
      true,
      'alevel-as-paper2-official'
    );
    expect(as2Meta.boardMasthead).toContain('7407/2');
    expect(as2Meta.officialSections).toHaveLength(3);

    const a2p1Meta = getSyllabusExamMetadata(
      'alevel',
      'Y13',
      { mcqCount: 25, structuredCount: 10, totalMarks: 85 },
      true,
      'alevel-a2-paper1-official'
    );
    expect(a2p1Meta.boardMasthead).toContain('7408/1');
    expect(a2p1Meta.specSubtitle).toContain('6.1 Periodic Motion');
    expect(a2p1Meta.officialSections).toHaveLength(2);

    const a2p2Meta = getSyllabusExamMetadata(
      'alevel',
      'Y13',
      { mcqCount: 25, structuredCount: 10, totalMarks: 85 },
      true,
      'alevel-a2-paper2-official'
    );
    expect(a2p2Meta.boardMasthead).toContain('7408/2');
    expect(a2p2Meta.specSubtitle).toContain('6.2 Thermal');
    expect(a2p2Meta.officialSections).toHaveLength(2);

    const a2p3Meta = getSyllabusExamMetadata(
      'alevel',
      'Y13',
      { mcqCount: 0, structuredCount: 14, totalMarks: 80 },
      true,
      'alevel-a2-paper3-official'
    );
    expect(a2p3Meta.boardMasthead).toContain('7408/3');
    expect(a2p3Meta.officialSections).toHaveLength(2);
    expect(a2p3Meta.officialSections?.[0].marks).toBe(45);
    expect(a2p3Meta.officialSections?.[1].marks).toBe(35);

    // Build synthetic full A-Level bank to verify PDF draft subtopic isolation
    const rows: PublicQuestionIndexRow[] = [];
    const specs: Array<{
      topicId: string;
      subtopicId: string;
      level: string;
      chunkKey: PublicQuestionIndexRow['chunkKey'];
    }> = [
      { topicId: 'alevel-sec1-measurements-errors', subtopicId: 'alevel-3-1-si-uncertainties-estimation', level: 'Y12', chunkKey: 'graphs' },
      { topicId: 'alevel-sec2-particles-radiation', subtopicId: 'alevel-3-2-1-particles-quarks', level: 'Y12', chunkKey: 'quantum-nuclear' },
      { topicId: 'alevel-sec3-waves', subtopicId: 'alevel-3-3-1-progressive-stationary-waves', level: 'Y12', chunkKey: 'waves' },
      { topicId: 'alevel-sec4-mechanics-materials', subtopicId: 'alevel-3-4-1-force-energy-momentum', level: 'Y12', chunkKey: 'mechanics' },
      { topicId: 'alevel-sec5-electricity', subtopicId: 'alevel-3-5-1-current-electricity', level: 'Y12', chunkKey: 'circuits' },
      { topicId: 'alevel-sec6-further-mechanics-thermal', subtopicId: 'alevel-3-6-1-periodic-motion-shm', level: 'Y13', chunkKey: 'optics-shm' },
      { topicId: 'alevel-sec6-further-mechanics-thermal', subtopicId: 'alevel-3-6-2-thermal-physics', level: 'Y13', chunkKey: 'thermal' },
      { topicId: 'alevel-sec7-fields-consequences', subtopicId: 'alevel-3-7-3-electric-fields', level: 'Y13', chunkKey: 'fields' },
      { topicId: 'alevel-sec7-fields-consequences', subtopicId: 'alevel-3-7-5-magnetic-fields-induction-ac', level: 'Y13', chunkKey: 'em-induction' },
      { topicId: 'alevel-sec8-nuclear-physics', subtopicId: 'alevel-3-8-nuclear-decay-energy', level: 'Y13', chunkKey: 'quantum-nuclear' },
      { topicId: 'alevel-options-9-13', subtopicId: 'alevel-3-9-astrophysics', level: 'Y13', chunkKey: 'grav-astro' },
      { topicId: 'alevel-options-9-13', subtopicId: 'alevel-3-11-engineering-physics', level: 'Y13', chunkKey: 'mechanics' },
    ];
    let seq = 0;
    for (const spec of specs) {
      for (let i = 0; i < 8; i += 1) {
        seq += 1;
        rows.push({
          id: `pdf-al-m-${seq}`,
          syllabi: [{ syllabus: 'alevel', level: spec.level, topicId: spec.topicId, subtopicId: spec.subtopicId }],
          format: 'mcq',
          difficulty: 'standard',
          visualFamily: spec.chunkKey,
          totalMarks: 1,
          hasSvg: true,
          chunkKey: spec.chunkKey,
          conceptId: spec.subtopicId,
          familyGroupKey: `pdf-fam-m-${spec.subtopicId}-${seq}`,
          questionStyle: i % 2 === 0 ? 'qualitative' : 'calculation',
        });
      }
      for (let i = 0; i < 6; i += 1) {
        seq += 1;
        rows.push({
          id: `pdf-al-s-${seq}`,
          syllabi: [{ syllabus: 'alevel', level: spec.level, topicId: spec.topicId, subtopicId: spec.subtopicId }],
          format: 'structured',
          difficulty: 'standard',
          visualFamily: spec.chunkKey,
          totalMarks: i === 5 ? 5 : 6,
          hasSvg: true,
          chunkKey: spec.chunkKey,
          conceptId: spec.subtopicId,
          familyGroupKey: `pdf-fam-s-${spec.subtopicId}-${seq}`,
          questionStyle:
            (i === 0 || i === 5) && spec.topicId !== 'alevel-options-9-13'
              ? 'experimental'
              : 'calculation',
        });
      }
    }

    const fullManifest: PublicBankManifest = buildPublicBankManifest(
      rows,
      '2026-11-21T00:00:00.000Z'
    );
    const getSub = (row: PublicQuestionIndexRow) =>
      row.syllabi.find((t) => t.syllabus === 'alevel')!.subtopicId!;

    const p1Draft = buildExamPaperDraft(fullManifest, {
      syllabus: 'alevel',
      level: 'Y12',
      presetId: 'alevel-a2-paper1-official',
      formatMode: 'mixed',
      mcqCount: 25,
      structuredCount: 10,
      difficultyMix: 'exam-mix',
      seed: 2026,
    });
    expect(p1Draft.durationMinutes).toBe(120);
    expect(p1Draft.level).toBe('Y13');
    expect(p1Draft.totalMarks).toBe(85);
    expect(new Set(p1Draft.questionRows.map((r) => r.familyGroupKey)).size).toBe(35);
    expect(p1Draft.questionRows.some((r) => getSub(r) === 'alevel-3-6-1-periodic-motion-shm')).toBe(true);
    expect(p1Draft.questionRows.every((r) => ALEVEL_PAPER1_SUBTOPIC_IDS.includes(getSub(r)))).toBe(true);

    const p2Draft = buildExamPaperDraft(fullManifest, {
      syllabus: 'alevel',
      level: 'Y12',
      presetId: 'alevel-a2-paper2-official',
      formatMode: 'mixed',
      mcqCount: 25,
      structuredCount: 10,
      difficultyMix: 'exam-mix',
      seed: 2026,
    });
    expect(p2Draft.durationMinutes).toBe(120);
    expect(p2Draft.level).toBe('Y13');
    expect(p2Draft.totalMarks).toBe(85);
    expect(new Set(p2Draft.questionRows.map((r) => r.familyGroupKey)).size).toBe(35);
    expect(p2Draft.questionRows.some((r) => getSub(r) === 'alevel-3-6-2-thermal-physics')).toBe(true);
    expect(p2Draft.questionRows.every((r) => ALEVEL_PAPER2_SUBTOPIC_IDS.includes(getSub(r)))).toBe(true);

    const p3Draft = buildExamPaperDraft(fullManifest, {
      syllabus: 'alevel',
      level: 'Y13',
      presetId: 'alevel-a2-paper3-official',
      formatMode: 'structured',
      mcqCount: 0,
      structuredCount: 14,
      difficultyMix: 'exam-mix',
      topicIds: ['alevel-3-11-engineering-physics'],
      seed: 2026,
    });
    expect(p3Draft.durationMinutes).toBe(120);
    expect(p3Draft.mcqRows).toHaveLength(0);
    expect(p3Draft.structuredRows).toHaveLength(14);
    expect(p3Draft.totalMarks).toBe(80);
    expect(new Set(p3Draft.questionRows.map((r) => r.familyGroupKey)).size).toBe(14);
    const p3OptionRows = p3Draft.structuredRows.filter((r) =>
      ALEVEL_OPTION_SUBTOPIC_IDS.includes(getSub(r))
    );
    expect(p3OptionRows).toHaveLength(6);
    expect(p3OptionRows.every((r) => getSub(r) === 'alevel-3-11-engineering-physics')).toBe(true);
  });
});
