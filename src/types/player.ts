/**
 * Player data model shared by the client, the server services and the database layer.
 *
 * Money is stored as whole Naira in an integer (never a float). The browser may
 * *display* these values, but only server-side services may change them.
 */

export type PlayerId = string;
export type InventoryId = string;

export type SkinTone = 'deep' | 'brown' | 'warm' | 'light';
export type BodyType = 'masc' | 'femme';
export type Headwear = 'none' | 'fila' | 'gele' | 'cap' | 'braids';
export type OutfitColor = 'ogun' | 'adire' | 'laterite' | 'palm' | 'cream' | 'ink';

/** What the character looks like. Stored as JSON. */
export interface AvatarSelection {
  body: BodyType;
  skin: SkinTone;
  headwear: Headwear;
  outfit: OutfitColor;
}

/** Ids of the places a player can be. Phase 1 only has the starter area. */
export type LocationId = 'kuto-starter-apartment' | 'kuto-street';

export interface Player {
  id: PlayerId;
  characterName: string;
  avatar: AvatarSelection;
  /** Virtual cash in whole Naira. Authoritative only when `source` is "server". */
  cash: number;
  location: LocationId;
  inventoryId: InventoryId;
  /** ISO-8601 timestamp. */
  createdAt: string;
  /**
   * Where this record came from. "guest" records live in the browser and are
   * a local preview only — they are never trusted by the server.
   */
  source: 'server' | 'guest';
}

/** Input accepted when creating a character. Cash, ids and location are never client input. */
export interface CreateCharacterInput {
  characterName: string;
  avatar: AvatarSelection;
}
