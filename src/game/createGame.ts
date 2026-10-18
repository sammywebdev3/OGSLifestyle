/**
 * Browser-only entry point for the Phaser world. Import it dynamically from a
 * client component (never at module top level of a page): Phaser touches
 * `window` as soon as it loads.
 */
import type { AvatarSelection } from '@/types/player';
import type { GameBus } from './events';

export interface GameHandle {
  destroy(): void;
}

export async function createGame(parent: HTMLElement, opts: { avatar: AvatarSelection; characterName: string; bus: GameBus }): Promise<GameHandle> {
  if (typeof window === 'undefined') throw new Error('createGame() must run in the browser');
  const [Phaser, { StarterAreaScene }] = await Promise.all([import('phaser'), import('./scenes/StarterAreaScene')]);
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    backgroundColor: '#1d2a5a',
    banner: false,
    audio: { noAudio: true },
    scale: { mode: Phaser.Scale.RESIZE, width: parent.clientWidth || 800, height: parent.clientHeight || 600 },
    render: { antialias: true, roundPixels: false },
    scene: new StarterAreaScene(opts),
  });
  return { destroy: () => game.destroy(true) };
}
