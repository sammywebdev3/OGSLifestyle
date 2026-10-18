'use client';

import { useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import type { Inventory } from '@/types/inventory';
import type { Player } from '@/types/player';
import { usePlayer, type PlayerMode } from '@/features/player/PlayerProvider';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Notice } from '@/components/ui/Notice';
import { Spinner } from '@/components/ui/Spinner';

export interface PlayerSession { player: Player; inventory: Inventory; mode: PlayerMode }

/** Renders children only once a character is loaded; handles loading, errors and redirects. */
export function RequirePlayer({ children }: { children: (session: PlayerSession) => ReactNode }) {
  const router = useRouter();
  const { status, player, inventory, mode, error, refresh, onlineAvailable } = usePlayer();

  useEffect(() => {
    if (status === 'no-character') router.replace('/create');
    if (status === 'signed-out') router.replace(onlineAvailable ? '/login' : '/create?mode=guest');
  }, [status, onlineAvailable, router]);

  if (status === 'error') {
    return (
      <Card className="mx-auto mt-10 max-w-md">
        <Notice tone="error">{error ?? 'Could not load your character.'}</Notice>
        <Button className="mt-4 w-full" onClick={() => void refresh()}>Try again</Button>
      </Card>
    );
  }
  if (status !== 'ready' || !player || !inventory) return <Spinner label="Loading your character…" />;
  return <>{children({ player, inventory, mode })}</>;
}
