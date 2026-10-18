import type { TileKind } from '../world/starterArea';

/** Hex string → Phaser colour number. */
export const hex = (c: string) => parseInt(c.replace('#', ''), 16);

export const TILE_COLORS: Record<TileKind, [string, string]> = {
  laterite: ['#c96a3c', '#bf6234'],
  grass: ['#5fae4f', '#56a347'],
  road: ['#3b3d46', '#383a42'],
  pavement: ['#b9b4a8', '#aea99d'],
  gutter: ['#3c4b44', '#34423c'],
  courtyard: ['#d9cbb0', '#cfc0a3'],
  slab: ['#8f8a80', '#86817a'],
};
