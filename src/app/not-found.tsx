import { PageShell } from '@/components/ui/PageShell';
import { ButtonLink } from '@/components/ui/Button';

export default function NotFound() {
  return (
    <PageShell>
      <h1 className="font-display text-3xl font-black">Wrong turn 🛵</h1>
      <p className="mt-2 text-cream/80">Even the okada man doesn&apos;t know this address.</p>
      <ButtonLink href="/" className="mt-6">Back home</ButtonLink>
    </PageShell>
  );
}
