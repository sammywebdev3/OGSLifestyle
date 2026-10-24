'use client';

import { useEffect, useRef, useState } from 'react';
import type { AvatarSelection } from '@/types/player';
import type { GameBus } from '@/game/events';
import { Spinner } from '@/components/ui/Spinner';

/** Character lab (prototype 3D characters) test builds: made with NEXT_PUBLIC_CHARACTER_LAB=1. Never set for production. */
const LAB_BUILD = process.env.NEXT_PUBLIC_CHARACTER_LAB === '1';

/** In a lab build, ?lab=characters shows the 3D characters and ?lab=painted the same scene with today's characters. */
function characterLab(): '3d' | 'painted' | undefined {
  if (!LAB_BUILD) return undefined;
  const lab = new URLSearchParams(window.location.search).get('lab');
  return lab === 'characters' ? '3d' : lab === 'painted' ? 'painted' : undefined;
}

/** In a lab build: ?labmix=1 adds the layered looks to the cast, ?labn=N repeats the cast up to N walkers. */
function labCast(): { mix?: boolean; count?: number } | undefined {
  if (!LAB_BUILD) return undefined;
  const q = new URLSearchParams(window.location.search);
  return { mix: q.get('labmix') === '1', count: Number(q.get('labn')) || undefined };
}

/**
 * Hosts the Phaser canvas. Phaser is imported inside useEffect, so it is never
 * evaluated during server rendering. Cleans up the game on unmount.
 */
export default function GameCanvas({ avatar, characterName, bus }: { avatar: AvatarSelection; characterName: string; bus: GameBus }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    let cancelled = false;
    let handle: { destroy(): void } | null = null;
    const offReady = bus.world.on('ready', () => !cancelled && setState('ready'));
    import('@/game/createGame')
      .then(({ createGame }) => (hostRef.current && !cancelled ? createGame(hostRef.current, { avatar, characterName, bus, characterLab: characterLab(), labCast: labCast(), exposeForTests: LAB_BUILD }) : null))
      .then((h) => {
        if (cancelled) h?.destroy();
        else handle = h;
      })
      .catch((err: unknown) => {
        console.error('Failed to start the game', err);
        if (!cancelled) setState('error');
      });
    return () => {
      cancelled = true;
      offReady();
      handle?.destroy();
    };
  }, [avatar, characterName, bus]);

  return (
    <div className="absolute inset-0">
      <div ref={hostRef} className="game-host absolute inset-0" aria-label="Game world" />
      {/* Soft vignette: frames the scene and keeps the HUD readable. A CSS gradient costs the game nothing. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_55%,rgba(17,26,61,0.38)_100%)]" />
      {state === 'loading' && <div className="absolute inset-0 grid place-items-center bg-adire-900 bg-adire-dots text-cream [background-size:18px_18px]"><Spinner label="Building Kuto…" /></div>}
      {state === 'error' && (
        <div className="absolute inset-0 grid place-items-center bg-adire-900 p-6 text-center text-cream">
          <div>
            <p className="font-display text-xl font-black">The world couldn&apos;t load.</p>
            <p className="mt-1 text-sm text-cream/70">Your browser may not support WebGL or canvas. Try refreshing.</p>
          </div>
        </div>
      )}
    </div>
  );
}
