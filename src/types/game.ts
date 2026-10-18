/** Types shared between the Phaser world and the React UI. */

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
  ready: void;
  'interaction:available': InteractionTarget | null;
  'interaction:triggered': InteractionTarget;
}

/** Events sent from the UI to the game world. */
export interface UiToWorldEvents {
  'input:direction': { direction: Direction; pressed: boolean };
  'input:interact': void;
  'world:pause': boolean;
}
