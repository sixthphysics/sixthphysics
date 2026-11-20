import type { Metadata } from 'next';
import { SyllabusLandingPage } from '@/components/sixthphysics/syllabus-landing-page';
import { buildSyllabusMetadata } from '@/lib/sixthphysics-web/seo';
import { loadSeoBankCounts } from '@/lib/sixthphysics-web/seo-counts.server';

export const metadata: Metadata = buildSyllabusMetadata('ncuk');

export default function NcukIfyPhysicsPage() {
  const { syllabi } = loadSeoBankCounts();
  return <SyllabusLandingPage syllabus="ncuk" counts={syllabi.ncuk} />;
}
