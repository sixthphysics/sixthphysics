import type { Metadata } from 'next';
import { SyllabusLandingPage } from '@/components/sixthphysics/syllabus-landing-page';
import { buildSyllabusMetadata } from '@/lib/sixthphysics-web/seo';
import { loadSeoBankCounts } from '@/lib/sixthphysics-web/seo-counts.server';

export const metadata: Metadata = buildSyllabusMetadata('alevel');

export default function ALevelPhysicsPage() {
  const { syllabi } = loadSeoBankCounts();
  return <SyllabusLandingPage syllabus="alevel" counts={syllabi.alevel} />;
}
