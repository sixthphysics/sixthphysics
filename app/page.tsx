import { SixthPhysicsShell } from '@/components/sixthphysics/sixthphysics-shell';
import { buildRootJsonLd } from '@/lib/sixthphysics-web/seo';
import { loadSeoBankCounts } from '@/lib/sixthphysics-web/seo-counts.server';

export default function HomePage() {
  const { totalItems } = loadSeoBankCounts();
  const structuredData = buildRootJsonLd(totalItems);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <SixthPhysicsShell />
    </>
  );
}
