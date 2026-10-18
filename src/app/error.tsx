'use client';

import { PageShell } from '@/components/ui/PageShell';
import { Button } from '@/components/ui/Button';

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <PageShell>
      <h1 className="font-display text-3xl font-black">Something broke</h1>
      <p className="mt-2 text-cream/80">NEPA took light on this page. Try again.</p>
      {error.digest ? <p className="mt-2 text-xs text-cream/50">Ref: {error.digest}</p> : null}
      <Button onClick={reset} className="mt-6">Try again</Button>
    </PageShell>
  );
}
