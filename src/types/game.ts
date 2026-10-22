/** Types shared between the Phaser world and the React UI. */
import type { AvatarSelection, LocationId } from './player';
import type { EmoteId } from '@/features/multiplayer/chat';
import type { PlotStatus } from './land';

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
  /** Another player is within reach (for the emote prompt), or nobody is. */
  proximity: { id: string; name: string } | null;
}

/** Where the local player is, in grid tiles. */
export interface LocalPlayerState { x: number; y: number; facing: 'left' | 'right'; moving: boolean }

/** Another player in the same room, as the scene should draw them. Position in grid tiles. */
export interface RemotePlayerView extends LocalPlayerState { id: string; name: string; avatar: AvatarSelection }

/** A land plot as the scene draws it. Built from the server's land view; drawing only, it authorizes nothing. */
export interface PlotView { key: string; x: number; y: number; w: number; d: number; status: PlotStatus; label: string }

/** Events sent from the UI to the game world. */
export interface UiToWorldEvents {
  'input:direction': { direction: Direction; pressed: boolean };
  'input:interact': void;
  'world:pause': boolean;
  /** Multiplayer: show, move or remove another player's character. */
  'remote:join': RemotePlayerView;
  'remote:move': LocalPlayerState & { id: string };
  'remote:leave': { id: string };
  /** Show a speech bubble above a character: a player id, or "self" for the local player. */
  'bubble:chat': { id: string; text: string };
  /** Show an emote above a character (the scene skips remote emotes from far away). */
  'bubble:emote': { id: string; emote: EmoteId };
  /** The chat box has focus: stop reading WASD/E/Space/Enter as game keys. */
  'input:typing': boolean;
  /** Land plots to draw (replaces the previous set). */
  'land:plots': PlotView[];
}
