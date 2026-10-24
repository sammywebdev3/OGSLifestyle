/**
 * Character lab: who walks around Kuto Street in the lab (never sent to the server). The four characters, optionally
 * the layered mixes (one body wearing different outfits and hairstyles), optionally repeated for stress tests.
 */
import type { AvatarSelection } from '@/types/player';
import type { LabLookId } from './prototype';

export interface CastMember { id: string; name: string; look: LabLookId; painted: AvatarSelection }

const BASE: Omit<CastMember, 'id'>[] = [
  { name: 'Tunde', look: 'tunde', painted: { body: 'masc', skin: 'deep', headwear: 'none', outfit: 'palm' } },
  { name: 'Femi', look: 'femi', painted: { body: 'masc', skin: 'brown', headwear: 'fila', outfit: 'adire' } },
  { name: 'Amaka', look: 'amaka', painted: { body: 'femme', skin: 'deep', headwear: 'braids', outfit: 'laterite' } },
  { name: 'Zainab', look: 'zainab', painted: { body: 'femme', skin: 'warm', headwear: 'none', outfit: 'ink' } },
];
const MIXES: Omit<CastMember, 'id'>[] = [
  { name: 'Tunde · senator', look: 'tunde-senator', painted: { body: 'masc', skin: 'deep', headwear: 'none', outfit: 'adire' } },
  { name: 'Tunde · fila', look: 'tunde-fila', painted: { body: 'masc', skin: 'deep', headwear: 'fila', outfit: 'palm' } },
  { name: 'Tunde · senator + fila', look: 'tunde-senator-fila', painted: { body: 'masc', skin: 'deep', headwear: 'fila', outfit: 'adire' } },
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
