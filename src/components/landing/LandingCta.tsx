'use client';

import { ButtonLink } from '@/components/ui/Button';
import { usePlayer } from '@/features/player/PlayerProvider';

/** Call-to-action that adapts to whether this browser already has a character. */
export function LandingCta() {
  const { status, player, onlineAvailable } = usePlayer();
  if (status === 'ready' && player) {
    return (
      <div className="mt-7 flex flex-wrap gap-3">
        <ButtonLink href="/apartment" variant="gold">Continue as {player.characterName} →</ButtonLink>
      </div>
    );
  }
  return (
    <div className="mt-7 flex flex-wrap gap-3">
      <ButtonLink href={onlineAvailable ? '/register' : '/create?mode=guest'} variant="gold">Play now →</ButtonLink>
      {onlineAvailable
        ? <ButtonLink href="/create?mode=guest" variant="secondary">Try as guest</ButtonLink>
        : <ButtonLink href="/register" variant="secondary">Create account</ButtonLink>}
    </div>
  );
}
