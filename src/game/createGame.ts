/**
 * Browser-only entry point for the Phaser world. Import it dynamically from a
 * client component (never at module top level of a page): Phaser touches
 * `window` as soon as it loads.
 */
import type { AvatarSelection } from '@/types/player';
import type { GameBus } from './events';
import { renderScale } from './render/viewport';

export interface GameHandle {
  destroy(): void;
}

export async function createGame(parent: HTMLElement, opts: { avatar: AvatarSelection; characterName: string; bus: GameBus }): Promise<GameHandle> {
  if (typeof window === 'undefined') throw new Error('createGame() must run in the browser');
  const [Phaser, { StarterAreaScene }] = await Promise.all([import('phaser'), import('./scenes/StarterAreaScene')]);
  const nav = navigator as Navigator & { deviceMemory?: number };
  // Render at the device's pixel density (capped), then show the canvas at CSS size: sharp on phones.
  const rs = renderScale(window.devicePixelRatio, nav.hardwareConcurrency, nav.deviceMemory);
  const cssSize = () => ({ w: Math.max(1, parent.clientWidth || 800), h: Math.max(1, parent.clientHeight || 600) });
  const start = cssSize();
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    backgroundColor: '#3b4a36',
    banner: false,
    audio: { noAudio: true },
    scale: { mode: Phaser.Scale.NONE, width: start.w * rs, height: start.h * rs, zoom: 1 / rs },
    render: { antialias: true, roundPixels: false, powerPreference: 'high-performance' },
    callbacks: { preBoot: (g) => { g.registry.set('renderScale', rs); } },
    scene: new StarterAreaScene(opts),
  });
  const observer = new ResizeObserver(() => {
    const { w, h } = cssSize();
    if (Math.floor(w * rs) !== game.scale.width || Math.floor(h * rs) !== game.scale.height) game.scale.resize(w * rs, h * rs);
  });
  observer.observe(parent);
  return { destroy: () => { observer.disconnect(); game.destroy(true); } };
}
