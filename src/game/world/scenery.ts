/**
 * Scenery outside the playable map: the rest of the neighbourhood, seen in the distance. Purely
 * visual: the player can never reach it (the map edge is blocked), so it has no collision.
 * Distant buildings sit only beyond the north and west edges, where they are always behind the
 * player; beyond the south and east edges there are only low bushes and trees.
 */
import type { BuildingDef } from './starterArea.ts';

export const BACKDROP_BUILDINGS: BuildingDef[] = [
  { id: 'bg-n1', x: 1, y: -5, w: 4, d: 3, h: 70, wall: '#e9dcc8', wallShade: '#d1bfa4', roof: 'flat', roofColor: '#12935a', windows: 2, tank: true },
  { id: 'bg-n2', x: 7, y: -4, w: 3, d: 3, h: 44, wall: '#f0c9a8', wallShade: '#d9a982', roof: 'zinc', roofColor: '#8a939d', windows: 1 },
  { id: 'bg-n3', x: 12, y: -6, w: 5, d: 3, h: 92, wall: '#dfe6ee', wallShade: '#bcc8d4', roof: 'flat', roofColor: '#3a4fb0', windows: 3, tank: true },
  { id: 'bg-n4', x: 18, y: -4, w: 3, d: 2, h: 40, wall: '#f6e3a5', wallShade: '#dcc47f', roof: 'zinc', roofColor: '#a0522d', windows: 1 },
  { id: 'bg-w1', x: -5, y: 1, w: 3, d: 4, h: 56, wall: '#d7ecd9', wallShade: '#b3d4b7', roof: 'zinc', roofColor: '#7f8a94', windows: 2 },
  { id: 'bg-w2', x: -6, y: 13, w: 4, d: 3, h: 66, wall: '#f4ead2', wallShade: '#e2d2ae', roof: 'flat', roofColor: '#d4693d', windows: 2, tank: true },
];

export interface SceneryDef { kind: 'tree' | 'bush' | 'palm'; x: number; y: number }

export const OUTSKIRT_SCENERY: SceneryDef[] = [
  { kind: 'tree', x: -2, y: -2 }, { kind: 'palm', x: 5, y: -2 }, { kind: 'tree', x: 10, y: -2 }, { kind: 'palm', x: 21, y: -2 },
  { kind: 'tree', x: -3, y: 6 }, { kind: 'palm', x: -2, y: 16 },
  { kind: 'bush', x: 2, y: 19 }, { kind: 'bush', x: 6, y: 19 }, { kind: 'tree', x: 11, y: 20 }, { kind: 'bush', x: 16, y: 19 },
  { kind: 'bush', x: 21, y: 2 }, { kind: 'tree', x: 22, y: 14 }, { kind: 'bush', x: 21, y: 17 }, { kind: 'palm', x: 22, y: 5 },
];
