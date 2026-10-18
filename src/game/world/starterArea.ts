/**
 * The Phase 1 prototype map: a street corner in Kuto, Abeokuta.
 * Pure data — the scene reads it, so maps can later be loaded from the server
 * or authored in a tool without touching rendering code.
 */
import type { InteractionTarget } from '@/types/game';
import type { LocationId } from '@/types/player';

export type TileKind = 'laterite' | 'grass' | 'road' | 'pavement' | 'gutter' | 'courtyard' | 'slab';

export interface BuildingDef {
  id: string;
  x: number; y: number; w: number; d: number; h: number;
  wall: string; wallShade: string;
  roof: 'flat' | 'zinc';
  roofColor: string;
  windows: number;
  sign?: { text: string; bg: string; fg: string };
  /** Door position along the front (y + d) face, in tiles from x. */
  door?: number;
  tank?: boolean;
}

export interface PropDef { kind: 'palm' | 'generator' | 'okada' | 'board' | 'bench'; x: number; y: number }

export interface InteractableDef extends InteractionTarget {
  x: number; y: number;
  /** Reach in tiles. */
  radius: number;
}

/** The game location this map represents (shown in the HUD). */
export const LOCATION_ID: LocationId = 'kuto-street';

export const MAP_W = 20;
export const MAP_H = 18;
export const SPAWN = { x: 4.5, y: 6.4 };

export function tileAt(x: number, y: number): TileKind {
  if (y === 9 || y === 10) return 'road';
  if (y === 8 || y === 11) return 'pavement';
  if (y === 7) return x === 4 || x === 10 || x === 15 ? 'slab' : 'gutter';
  if (x >= 2 && x <= 6 && y >= 5 && y <= 6) return 'courtyard';
  if ((x + y * 3) % 7 === 0 || (y >= 14 && x >= 14)) return 'grass';
  return 'laterite';
}

export const BUILDINGS: BuildingDef[] = [
  { id: 'kuto-court', x: 2, y: 1, w: 5, d: 4, h: 104, wall: '#f4ead2', wallShade: '#e2d2ae', roof: 'flat', roofColor: '#3a4fb0', windows: 3, door: 2.5, tank: true, sign: { text: 'KUTO COURT', bg: '#1f2f6b', fg: '#fff6e5' } },
  { id: 'buka', x: 9, y: 3, w: 3, d: 3, h: 46, wall: '#cfe8d8', wallShade: '#a9d3b9', roof: 'zinc', roofColor: '#9aa3ad', windows: 1, door: 1.5, sign: { text: 'IYA BASIRA BUKA', bg: '#fff6e5', fg: '#a3401d' } },
  { id: 'pos', x: 14, y: 4, w: 2, d: 2, h: 38, wall: '#f2b632', wallShade: '#d99d1c', roof: 'zinc', roofColor: '#c4552d', windows: 1, door: 1, sign: { text: 'BLESSED POS', bg: '#12935a', fg: '#fff' } },
  { id: 'storey', x: 9, y: 13, w: 5, d: 3, h: 88, wall: '#e7d3c2', wallShade: '#d4b9a1', roof: 'flat', roofColor: '#c4552d', windows: 3, door: 2.5, tank: true },
  { id: 'shop-row', x: 15, y: 13, w: 3, d: 2, h: 40, wall: '#fff6e5', wallShade: '#e9dcc0', roof: 'zinc', roofColor: '#7f8a94', windows: 1, door: 1.5, sign: { text: 'MAMA T STORES', bg: '#3a4fb0', fg: '#fff' } },
];

export const PROPS: PropDef[] = [
  { kind: 'palm', x: 8, y: 2 }, { kind: 'palm', x: 13, y: 2 }, { kind: 'palm', x: 1, y: 13 }, { kind: 'palm', x: 18, y: 6 },
  { kind: 'palm', x: 7, y: 15 }, { kind: 'generator', x: 7, y: 5 }, { kind: 'okada', x: 3, y: 13 }, { kind: 'okada', x: 4, y: 14 },
  { kind: 'board', x: 7, y: 12 }, { kind: 'bench', x: 12, y: 6 },
];

/** Tiles a prop occupies for collision (palms and generator are solid, the bench is not). */
export const SOLID_PROPS: PropDef['kind'][] = ['palm', 'generator', 'okada', 'board'];

export const INTERACTABLES: InteractableDef[] = [
  { id: 'apartment-door', label: 'Your apartment', verb: 'Enter', description: 'Your self-contain on the ground floor of Kuto Court. Go inside to rest and check your things.', x: 4.5, y: 5.6, radius: 1.1 },
  { id: 'buka', label: 'Iya Basira Buka', verb: 'Talk', description: '"Amala, ewedu, gbegiri — hot hot! My kitchen opens properly soon, my dear." (Food and needs arrive in Phase 2.)', x: 10.5, y: 6.6, radius: 1.2 },
  { id: 'pos', label: 'Blessed POS & Recharge', verb: 'Use', description: '"Network is bad today o." Transfers, withdrawals and airtime will work once the server-side economy is built.', x: 15, y: 6.6, radius: 1.1 },
  { id: 'okada-park', label: 'Okada park', verb: 'Look', description: 'A few okadas waiting for passengers. Riding — and hustling as a rider — is planned for a later phase.', x: 5, y: 12.4, radius: 1.4 },
  { id: 'notice-board', label: 'Community notice board', verb: 'Read', description: 'WELCOME TO KUTO! • Landlord meeting on Saturday • Jobs: see the phone app (coming soon) • Keep the gutter clean!', x: 7.5, y: 11.6, radius: 1.1 },
];

/** Static collision map: buildings, solid props and the map edge. (Gutters are shallow — you can step over them.) */
export function buildBlockedSet(): Set<string> {
  const blocked = new Set<string>();
  for (const b of BUILDINGS) for (let x = b.x; x < b.x + b.w; x++) for (let y = b.y; y < b.y + b.d; y++) blocked.add(`${x},${y}`);
  for (const p of PROPS) if (SOLID_PROPS.includes(p.kind)) blocked.add(`${p.x},${p.y}`);
  return blocked;
}

export function isBlockedFn(blocked: Set<string>) {
  return (x: number, y: number) => x < 0 || y < 0 || x >= MAP_W || y >= MAP_H || blocked.has(`${x},${y}`);
}
