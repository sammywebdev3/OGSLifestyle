import type { Metadata } from 'next';
import { CharacterCreator } from '@/components/character/CharacterCreator';
import { PageShell } from '@/components/ui/PageShell';

export const metadata: Metadata = { title: 'Create your character' };

export default async function CreatePage({ searchParams }: { searchParams: Promise<{ mode?: string }> }) {
  const { mode } = await searchParams;
  return (
    <PageShell wide>
      <CharacterCreator requestedMode={mode === 'guest' ? 'guest' : null} />
    </PageShell>
  );
}
