import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type { AvatarSelection } from '@/types/player';
import { APPEARANCE_BODIES, APPEARANCE_HAIR, APPEARANCE_OUTFITS, BAKED, LAYERED, allAppearanceAtlases, appearanceFor, resolveLook } from './appearance.ts';

const BODY = ['masc', 'femme'] as const;
const SKIN = ['deep', 'brown', 'warm', 'light'] as const;
const HEADWEAR = ['none', 'fila', 'gele', 'cap', 'braids'] as const;
const OUTFIT = ['ogun', 'adire', 'laterite', 'palm', 'cream', 'ink'] as const;
const everyAvatar = (): AvatarSelection[] =>
  BODY.flatMap((body) => SKIN.flatMap((skin) => HEADWEAR.flatMap((headwear) => OUTFIT.map((outfit) => ({ body, skin, headwear, outfit })))));

test('appearance: every existing avatar choice (240) maps to an appearance that can be drawn', () => {
  const avatars = everyAvatar();
  assert.equal(avatars.length, 240);
  for (const a of avatars) {
    const ap = appearanceFor(a);
    assert.ok(APPEARANCE_BODIES.includes(ap.body) && APPEARANCE_OUTFITS.includes(ap.outfit) && APPEARANCE_HAIR.includes(ap.hair), JSON.stringify(a));
    const female = ap.body === 'amaka' || ap.body === 'zainab';
    assert.equal(female, a.body === 'femme', JSON.stringify(a)); // body type is always respected
    const r = resolveLook(ap);
    assert.ok(r.look.atlases.length === 1 || r.look.atlases.length === 3);
    assert.equal(r.drawn.body, ap.body, 'the body (face, skin) is never swapped for another');
  }
});

test('appearance: the four baked characters resolve to their single baked atlas', () => {
  for (const body of APPEARANCE_BODIES) {
    const r = resolveLook(BAKED[body]);
    assert.deepEqual(r.look.atlases, [body]);
    assert.equal(r.exact, true);
    assert.equal(r.kind, 'baked');
  }
  // The guest default (masc, deep, no headwear, palm) is Tunde.
  assert.deepEqual(resolveLook(appearanceFor({ body: 'masc', skin: 'deep', headwear: 'none', outfit: 'palm' })).look.atlases, ['tunde']);
});

test('appearance: other combinations on a layered body stack body, outfit and hair layers', () => {
  const r = resolveLook({ body: 'tunde', outfit: 'senator', hair: 'fila' });
  assert.deepEqual(r.look.atlases, ['body-tunde', 'outfit-femi.tunde', 'hair-fila.tunde']);
  assert.equal(r.exact, true);
  const a = resolveLook({ body: 'amaka', outfit: 'croptank', hair: 'big_afro' });
  assert.deepEqual(a.look.atlases, ['body-amaka', 'outfit-zainab.amaka', 'hair-big_afro.amaka']);
  // Every combination available on a layered body is exact.
  for (const [body, l] of Object.entries(LAYERED)) {
    for (const outfit of l!.outfits) for (const hair of l!.hair) {
      assert.equal(resolveLook({ body: body as never, outfit, hair }).exact, true, `${body} ${outfit} ${hair}`);
    }
  }
});

test('appearance: combinations that were not rendered fall back to the closest look and say so', () => {
  // Femi's body has no layers: any change falls back to his baked look.
  const f = resolveLook({ body: 'femi', outfit: 'jersey', hair: 'fade' });
  assert.deepEqual(f.look.atlases, ['femi']);
  assert.equal(f.exact, false);
  // Tunde has no ankara outfit: he keeps his body and hair, and wears his own outfit instead.
  const t = resolveLook({ body: 'tunde', outfit: 'ankara', hair: 'fila' });
  assert.deepEqual(t.look.atlases, ['body-tunde', 'outfit-tunde.tunde', 'hair-fila.tunde']);
  assert.equal(t.exact, false);
});

test('appearance: every atlas an appearance can resolve to exists in public/prototype-characters (HD and SD)', () => {
  const dir = path.join(process.cwd(), 'public', 'prototype-characters');
  for (const atlas of allAppearanceAtlases()) {
    for (const q of ['hd', 'sd']) {
      for (const ext of ['webp', 'json']) assert.ok(fs.existsSync(path.join(dir, `${atlas}-${q}.${ext}`)), `${atlas}-${q}.${ext}`);
    }
  }
});
