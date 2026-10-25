/**
 * Character lab: who walks around Kuto Street in the lab (never sent to the server). Each walker is described only
 * by an AvatarSelection, exactly like a real remote player, so its look comes from the same appearanceFor /
 * resolveLook rules as everyone else's. The base cast is the four baked characters; `mix` adds layered combinations
 * (one body wearing other outfits and hairstyles); `count` repeats the cast for stress tests.
 */
import type { AvatarSelection } from '@/types/player';

export interface CastMember { id: string; name: string; avatar: AvatarSelection }

const BASE: Omit<CastMember, 'id'>[] = [
  { name: 'Tunde', avatar: { body: 'masc', skin: 'deep', headwear: 'none', outfit: 'palm' } },
  { name: 'Femi', avatar: { body: 'masc', skin: 'brown', headwear: 'fila', outfit: 'adire' } },
  { name: 'Amaka', avatar: { body: 'femme', skin: 'deep', headwear: 'braids', outfit: 'adire' } },
  { name: 'Zainab', avatar: { body: 'femme', skin: 'warm', headwear: 'none', outfit: 'ink' } },
];
const MIXES: Omit<CastMember, 'id'>[] = [
  { name: 'Tunde · senator', avatar: { body: 'masc', skin: 'deep', headwear: 'none', outfit: 'adire' } },
  { name: 'Tunde · fila', avatar: { body: 'masc', skin: 'deep', headwear: 'fila', outfit: 'palm' } },
  { name: 'Tunde · senator + fila', avatar: { body: 'masc', skin: 'deep', headwear: 'fila', outfit: 'cream' } },
  { name: 'Amaka · crop tank', avatar: { body: 'femme', skin: 'deep', headwear: 'braids', outfit: 'ink' } },
  { name: 'Amaka · afro', avatar: { body: 'femme', skin: 'brown', headwear: 'none', outfit: 'ogun' } },
  { name: 'Amaka · tank + afro', avatar: { body: 'femme', skin: 'deep', headwear: 'none', outfit: 'laterite' } },
];

/** The cast: `mix` adds the layered looks, `count` (if larger) repeats the cast with numbered names. */
export function demoCast(opts: { mix?: boolean; count?: number } = {}): CastMember[] {
  const pool = opts.mix ? [...BASE, ...MIXES] : BASE;
  const n = Math.max(pool.length, Math.min(opts.count ?? 0, 60));
  return Array.from({ length: n }, (_, i) => {
    const m = pool[i % pool.length]!;
    const round = Math.floor(i / pool.length);
    return { ...m, id: `lab-${i}`, name: round ? `${m.name} ${round + 1}` : m.name };
  });
}
