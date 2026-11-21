import Link from 'next/link';
import {
  BookOpen,
  Check,
  ChevronRight,
  Clock,
  FileText,
  List,
  Target,
} from 'lucide-react';
import { ApicutsLogoMark } from '@/components/sixthphysics/apicuts-logo';
import {
  SIXTHPHYSICS_EXTERNAL_LINKS,
  SIXTHPHYSICS_INDEPENDENCE_DISCLAIMER,
  SYLLABUS_SEO_CONFIGS,
  SYLLABUS_SEO_LIST,
  buildSyllabusJsonLd,
  type SyllabusSeoCounts,
} from '@/lib/sixthphysics-web/seo';
import type { SyllabusId } from '@/lib/sixthphysics-web/types';

export interface SyllabusLandingPageProps {
  syllabus: SyllabusId;
  counts: SyllabusSeoCounts;
}

export function SyllabusLandingPage({
  syllabus,
  counts,
}: SyllabusLandingPageProps) {
  const cfg = SYLLABUS_SEO_CONFIGS[syllabus];
  const structuredData = buildSyllabusJsonLd(syllabus, counts);
  const siblingSyllabi = SYLLABUS_SEO_LIST.filter(
    (item) => item.syllabus !== syllabus
  );
  const levelEntries = Object.entries(counts.countsByLevel);

  return (
    <div className="min-h-screen bg-[var(--sp-bg)] text-[var(--sp-ink)]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />

      {/* Sticky header matching the SixthPhysics tactile study desk */}
      <header className="sticky top-0 z-30 border-b-2 border-[var(--sp-border)] bg-[var(--sp-surface)]/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link
            href="/"
            className="group inline-flex items-center gap-2.5 rounded-xl py-0.5 text-left"
          >
            <span
              aria-hidden="true"
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] bg-[var(--sp-accent)] text-white shadow-[0_3px_0_var(--sp-accent-lip)] transition-transform duration-100 group-hover:-translate-y-px"
            >
              <svg
                viewBox="0 0 20 20"
                fill="none"
                className="h-5 w-5"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="10" cy="10" r="6.5" strokeOpacity="0.45" />
                <path d="M4.2 10c1.8-3.4 3.9-3.4 5.8 0s4 3.4 5.8 0" />
              </svg>
            </span>
            <span className="text-[17px] font-extrabold tracking-tight text-[var(--sp-ink)]">
              SixthPhysics
            </span>
          </Link>

          <nav
            aria-label="Syllabi"
            className="flex flex-wrap items-center gap-1.5"
          >
            {SYLLABUS_SEO_LIST.map((item) => {
              const isCurrent = item.syllabus === syllabus;
              return (
                <Link
                  key={item.syllabus}
                  href={item.path}
                  aria-current={isCurrent ? 'page' : undefined}
                  className={
                    isCurrent
                      ? 'rounded-xl border-2 border-[var(--sp-accent)] bg-[var(--sp-accent-tint)] px-3 py-1.5 text-[13px] font-bold text-[var(--sp-accent-ink)]'
                      : 'rounded-xl border-2 border-transparent px-3 py-1.5 text-[13px] font-semibold text-[var(--sp-muted)] transition-colors hover:border-[var(--sp-border)] hover:bg-[var(--sp-surface-subtle)] hover:text-[var(--sp-ink)]'
                  }
                >
                  {item.navLabel}
                </Link>
              );
            })}
            <Link
              href={`/?syllabus=${syllabus}`}
              className="sp-key sp-key--primary ml-1 inline-flex h-9 items-center gap-1.5 rounded-xl px-3.5 text-[13px] font-extrabold"
            >
              Practice Desk
              <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </nav>
        </div>
      </header>

      <main
        id="main-content"
        className="mx-auto max-w-[1200px] space-y-10 px-4 py-8 sm:px-6 sm:py-12"
      >
        {/* Breadcrumb */}
        <nav
          aria-label="Breadcrumb"
          className="flex items-center gap-2 text-[13px] font-semibold text-[var(--sp-muted)]"
        >
          <Link href="/" className="hover:text-[var(--sp-ink)]">
            SixthPhysics
          </Link>
          <span aria-hidden="true">/</span>
          <span className="text-[var(--sp-ink)]">{cfg.navLabel}</span>
        </nav>

        {/* Hero card */}
        <section className="sp-card p-6 sm:p-9">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--sp-border)] bg-[var(--sp-accent-tint)] px-3 py-1 text-[12px] font-bold text-[var(--sp-accent-ink)]">
              <Target className="h-3.5 w-3.5" aria-hidden="true" />
              {cfg.examBoardBadge}
            </span>
            <span className="inline-flex items-center rounded-full border border-[var(--sp-border)] bg-[var(--sp-surface-subtle)] px-3 py-1 font-mono text-[12px] font-semibold text-[var(--sp-ink)]">
              {cfg.gravityBadge}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-[var(--sp-border)] bg-[var(--sp-success-tint)] px-3 py-1 text-[12px] font-bold text-[var(--sp-success-ink)]">
              <Check className="h-3.5 w-3.5" aria-hidden="true" />
              100% Free · No Login Required
            </span>
          </div>

          <h1 className="mt-4 text-[28px] leading-tight font-extrabold tracking-tight text-[var(--sp-ink)] sm:text-[38px]">
            {cfg.title}
          </h1>
          <p className="mt-3 max-w-[74ch] text-[15.5px] leading-relaxed text-[var(--sp-muted)] sm:text-[16.5px]">
            {cfg.heroSummary}
          </p>

          {/* Primary launch CTAs */}
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Link
              href={`/?syllabus=${syllabus}`}
              className="sp-key sp-key--primary inline-flex h-11 items-center gap-2 rounded-2xl px-5 text-[14.5px] font-extrabold"
            >
              <BookOpen className="h-4 w-4" aria-hidden="true" />
              Start {cfg.navLabel} Practice
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <Link
              href={`/?mode=mock&syllabus=${syllabus}`}
              className="sp-key inline-flex h-11 items-center gap-2 rounded-2xl px-4 text-[14px] font-bold text-[var(--sp-ink)]"
            >
              <Clock className="h-4 w-4 text-[var(--sp-accent)]" aria-hidden="true" />
              Timed Mock Exam
            </Link>
            <Link
              href={`/?mode=pdf&syllabus=${syllabus}`}
              className="sp-key inline-flex h-11 items-center gap-2 rounded-2xl px-4 text-[14px] font-bold text-[var(--sp-ink)]"
            >
              <FileText
                className="h-4 w-4 text-[var(--sp-accent)]"
                aria-hidden="true"
              />
              Build PDF Mock Paper
            </Link>
          </div>

          {/* Verified Bank Metrics */}
          <dl className="mt-7 grid grid-cols-2 gap-3 border-t-2 border-[var(--sp-border)] pt-6 sm:grid-cols-4">
            <div className="rounded-2xl border-2 border-[var(--sp-border)] bg-[var(--sp-surface-subtle)] p-4">
              <dt className="text-[12px] font-bold tracking-wide text-[var(--sp-muted)] uppercase">
                Verified Questions
              </dt>
              <dd className="mt-1 text-[24px] font-extrabold tabular-nums text-[var(--sp-ink)]">
                {counts.questionCount.toLocaleString('en-US')}
              </dd>
            </div>
            <div className="rounded-2xl border-2 border-[var(--sp-border)] bg-[var(--sp-surface-subtle)] p-4">
              <dt className="text-[12px] font-bold tracking-wide text-[var(--sp-muted)] uppercase">
                Multiple Choice
              </dt>
              <dd className="mt-1 text-[24px] font-extrabold tabular-nums text-[var(--sp-ink)]">
                {counts.mcqCount.toLocaleString('en-US')}
              </dd>
            </div>
            <div className="rounded-2xl border-2 border-[var(--sp-border)] bg-[var(--sp-surface-subtle)] p-4">
              <dt className="text-[12px] font-bold tracking-wide text-[var(--sp-muted)] uppercase">
                Long-Answer
              </dt>
              <dd className="mt-1 text-[24px] font-extrabold tabular-nums text-[var(--sp-ink)]">
                {counts.structuredCount.toLocaleString('en-US')}
              </dd>
            </div>
            <div className="rounded-2xl border-2 border-[var(--sp-border)] bg-[var(--sp-surface-subtle)] p-4">
              <dt className="text-[12px] font-bold tracking-wide text-[var(--sp-muted)] uppercase">
                Levels Covered
              </dt>
              <dd className="mt-1.5 flex flex-wrap gap-1.5">
                {levelEntries.map(([level, count]) => (
                  <Link
                    key={level}
                    href={`/?syllabus=${syllabus}&level=${encodeURIComponent(level)}`}
                    className="inline-flex items-center gap-1 rounded-lg border border-[var(--sp-border)] bg-[var(--sp-surface)] px-2 py-0.5 text-[12px] font-bold text-[var(--sp-ink)] hover:border-[var(--sp-accent)]"
                  >
                    <span>{level}</span>
                    <span className="tabular-nums text-[var(--sp-muted)]">
                      {count.toLocaleString('en-US')}
                    </span>
                  </Link>
                ))}
              </dd>
            </div>
          </dl>
        </section>

        {/* Full Topic & Subtopic Directory */}
        <section aria-labelledby="topics-heading" className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2
                id="topics-heading"
                className="flex items-center gap-2 text-[22px] font-extrabold tracking-tight text-[var(--sp-ink)]"
              >
                <List
                  className="h-5 w-5 text-[var(--sp-accent)]"
                  aria-hidden="true"
                />
                Syllabus Topics &amp; Subtopics
              </h2>
              <p className="mt-1 text-[14.5px] text-[var(--sp-muted)]">
                Jump straight into solver-verified multiple-choice and
                long-answer structured questions for any{' '}
                {cfg.catalogue.specificationCode} topic.
              </p>
            </div>
            <div className="flex items-center gap-2 text-[13px] font-bold">
              <Link
                href={`/?syllabus=${syllabus}&format=mcq`}
                className="rounded-xl border-2 border-[var(--sp-border)] bg-[var(--sp-surface)] px-3 py-1.5 text-[var(--sp-ink)] hover:border-[var(--sp-accent)]"
              >
                All MCQs
              </Link>
              <Link
                href={`/?syllabus=${syllabus}&format=structured`}
                className="rounded-xl border-2 border-[var(--sp-border)] bg-[var(--sp-surface)] px-3 py-1.5 text-[var(--sp-ink)] hover:border-[var(--sp-accent)]"
              >
                All Structured
              </Link>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {cfg.catalogue.topics.map((topic) => {
              const topicCount = counts.topicCounts[topic.id] ?? 0;
              return (
                <article
                  key={topic.id}
                  className="sp-card flex flex-col justify-between p-5"
                >
                  <div>
                    <div className="flex items-start justify-between gap-3">
                      <span className="inline-flex rounded-lg bg-[var(--sp-accent-tint)] px-2.5 py-1 font-mono text-[12px] font-bold text-[var(--sp-accent-ink)]">
                        {topic.code}
                      </span>
                      <span className="text-[13px] font-bold tabular-nums text-[var(--sp-muted)]">
                        {topicCount.toLocaleString('en-US')} questions
                      </span>
                    </div>

                    <h3 className="mt-3 text-[18px] font-extrabold text-[var(--sp-ink)]">
                      <Link
                        href={`/?syllabus=${syllabus}&topic=${encodeURIComponent(topic.id)}`}
                        className="hover:text-[var(--sp-accent)] hover:underline"
                      >
                        {topic.title}
                      </Link>
                    </h3>
                    <p className="mt-1.5 text-[14px] leading-relaxed text-[var(--sp-muted)]">
                      {topic.summary}
                    </p>

                    <ul className="mt-3.5 flex flex-wrap gap-1.5">
                      {topic.subtopics.map((subtopic) => (
                        <li key={subtopic.id}>
                          <Link
                            href={`/?syllabus=${syllabus}&topic=${encodeURIComponent(topic.id)}&subtopic=${encodeURIComponent(subtopic.id)}`}
                            className="inline-flex items-center gap-1 rounded-lg border border-[var(--sp-border)] bg-[var(--sp-surface-subtle)] px-2.5 py-1 text-[12px] font-semibold text-[var(--sp-ink)] transition-colors hover:border-[var(--sp-accent)] hover:text-[var(--sp-accent)]"
                          >
                            <span className="font-mono text-[11px] text-[var(--sp-muted)]">
                              {subtopic.code}
                            </span>
                            <span>{subtopic.title}</span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="mt-4 flex items-center justify-between border-t border-[var(--sp-border)] pt-3.5 text-[13px] font-bold">
                    <span className="text-[var(--sp-muted)]">
                      Levels: {topic.levelsCovered.join(', ')}
                    </span>
                    <Link
                      href={`/?syllabus=${syllabus}&topic=${encodeURIComponent(topic.id)}`}
                      className="inline-flex items-center gap-1 text-[var(--sp-accent)] hover:underline"
                    >
                      Practice topic
                      <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        {/* Assessment Structure & Exam Conventions */}
        <section
          aria-labelledby="assessment-heading"
          className="grid grid-cols-1 gap-6 lg:grid-cols-5"
        >
          <div className="sp-card p-6 lg:col-span-3">
            <h2
              id="assessment-heading"
              className="text-[19px] font-extrabold text-[var(--sp-ink)]"
            >
              Exam Paper Structure ({cfg.catalogue.specificationCode})
            </h2>
            <div className="mt-4 space-y-3">
              {cfg.catalogue.papers.map((paper) => (
                <div
                  key={paper.paperId}
                  className="rounded-xl border-2 border-[var(--sp-border)] bg-[var(--sp-surface-subtle)] p-3.5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-[14.5px] font-extrabold text-[var(--sp-ink)]">
                      {paper.title}
                    </h3>
                    <span className="font-mono text-[12px] font-bold text-[var(--sp-accent-ink)]">
                      {paper.durationMinutes} min · {paper.maxMarks} marks ·{' '}
                      {paper.weightingPercent}%
                    </span>
                  </div>
                  <p className="mt-1 text-[13.5px] text-[var(--sp-muted)]">
                    {paper.notes}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="sp-card p-6 lg:col-span-2">
            <h2 className="text-[19px] font-extrabold text-[var(--sp-ink)]">
              Conventions &amp; Standards
            </h2>
            <dl className="mt-4 space-y-3.5 text-[14px]">
              <div>
                <dt className="text-[12px] font-bold tracking-wide text-[var(--sp-muted)] uppercase">
                  Gravitational Acceleration
                </dt>
                <dd className="mt-0.5 font-semibold text-[var(--sp-ink)]">
                  {cfg.catalogue.conventions.gravitationalAccelerationStandard}
                </dd>
              </div>
              <div>
                <dt className="text-[12px] font-bold tracking-wide text-[var(--sp-muted)] uppercase">
                  Unit Formatting
                </dt>
                <dd className="mt-0.5 text-[var(--sp-ink)]">
                  {cfg.catalogue.conventions.unitFormattingStyle}
                </dd>
              </div>
              <div>
                <dt className="text-[12px] font-bold tracking-wide text-[var(--sp-muted)] uppercase">
                  Significant Figures
                </dt>
                <dd className="mt-0.5 text-[var(--sp-ink)]">
                  {cfg.catalogue.conventions.significantFiguresRule}
                </dd>
              </div>
              <div>
                <dt className="text-[12px] font-bold tracking-wide text-[var(--sp-muted)] uppercase">
                  Awarding Body
                </dt>
                <dd className="mt-0.5 text-[var(--sp-ink)]">
                  {cfg.catalogue.awardingBody} ({cfg.catalogue.specificationVersion})
                </dd>
              </div>
            </dl>
          </div>
        </section>

        {/* Frequently Asked Questions */}
        <section aria-labelledby="faq-heading" className="sp-card p-6 sm:p-8">
          <h2
            id="faq-heading"
            className="text-[20px] font-extrabold text-[var(--sp-ink)]"
          >
            Frequently Asked Questions
          </h2>
          <div className="mt-4 divide-y-2 divide-[var(--sp-border)]">
            {cfg.faqs.map((faq) => (
              <div key={faq.question} className="py-4 first:pt-1 last:pb-0">
                <h3 className="text-[15.5px] font-extrabold text-[var(--sp-ink)]">
                  {faq.question}
                </h3>
                <p className="mt-1.5 text-[14.5px] leading-relaxed text-[var(--sp-muted)]">
                  {faq.answer}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Cross-links to sibling syllabi & open-source project */}
        <footer className="space-y-4 border-t-2 border-[var(--sp-border)] pt-6 text-[13.5px] text-[var(--sp-muted)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <Link
              href="/"
              className="font-bold text-[var(--sp-ink)] hover:text-[var(--sp-accent)]"
            >
              Interactive Practice Desk
            </Link>
            {siblingSyllabi.map((other) => (
              <Link
                key={other.syllabus}
                href={other.path}
                className="font-semibold hover:text-[var(--sp-ink)]"
              >
                {other.navLabel}
              </Link>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <a
              href={SIXTHPHYSICS_EXTERNAL_LINKS.apicutsSponsor}
              target="_blank"
              rel="noopener"
              className="inline-flex items-center gap-1.5 font-semibold text-[var(--sp-muted)] transition-colors hover:text-[var(--sp-ink)]"
            >
              <ApicutsLogoMark className="h-3.5 w-3.5 shrink-0" />
              <span>
                Free AI grading via{' '}
                <span className="font-bold text-[var(--sp-ink)]">
                  APIcuts.ai
                </span>
              </span>
            </a>
            <a
              href={SIXTHPHYSICS_EXTERNAL_LINKS.githubRepo}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold hover:text-[var(--sp-ink)]"
            >
              GitHub Source
            </a>
            <a
              href={SIXTHPHYSICS_EXTERNAL_LINKS.huggingFaceGguf}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold hover:text-[var(--sp-ink)]"
            >
              Qwen3.5-9B GGUF
            </a>
            <a
              href={SIXTHPHYSICS_EXTERNAL_LINKS.huggingFaceDataset}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold hover:text-[var(--sp-ink)]"
            >
              Dataset &amp; Benchmark
            </a>
          </div>
          </div>
          <p className="border-t border-[var(--sp-border)]/70 pt-3.5 text-[12px] leading-relaxed text-[var(--sp-muted)]">
            {SIXTHPHYSICS_INDEPENDENCE_DISCLAIMER}
          </p>
        </footer>
      </main>
    </div>
  );
}
