/** Types shared between the Phaser world and the React UI. */
import type { AvatarSelection, LocationId } from './player';

export type Direction = 'up' | 'down' | 'left' | 'right';

export interface InteractionTarget {
  id: string;
  label: string;
  /** Short verb shown on the prompt, e.g. "Enter", "Talk", "Read". */
  verb: string;
  description: string;
}

/** Events sent from the game world to the UI. */
export interface WorldToUiEvents {
  /** The scene finished loading; it reports which location it represents. */
  ready: { locationId: LocationId };
  'interaction:available': InteractionTarget | null;
  'interaction:triggered': InteractionTarget;
  /** The local player's position, every frame (the multiplayer client decides what to send). */
  'player:state': LocalPlayerState;
}

/** Where the local player is, in grid tiles. */
export interface LocalPlayerState { x: number; y: number; facing: 'left' | 'right'; moving: boolean }

/** Another player in the same room, as the scene should draw them. Position in grid tiles. */
export interface RemotePlayerView extends LocalPlayerState { id: string; name: string; avatar: AvatarSelection }

/** Events sent from the UI to the game world. */
export interface UiToWorldEvents {
  'input:direction': { direction: Direction; pressed: boolean };
  'input:interact': void;
  'world:pause': boolean;
  /** Multiplayer: show, move or remove another player's character. */
  'remote:join': RemotePlayerView;
  'remote:move': LocalPlayerState & { id: string };
  'remote:leave': { id: string };
}
