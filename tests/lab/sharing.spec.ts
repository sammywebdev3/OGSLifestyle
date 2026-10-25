/**
 * Shared atlases: the layered looks reuse one body atlas and one hair atlas; each atlas is downloaded once and
 * becomes one texture, which every character that needs it draws from.
 */
import { expect, test } from '@playwright/test';
import { expectClean, labState, openPlay, waitForCharacters, waitForWorld } from './lab';

test('each atlas is downloaded once and shared by every character that uses it', async ({ page }) => {
  const lab = await openPlay(page, 'lab=characters&labmix=1&labn=21', { deviceMemory: 8 });
  await waitForWorld(lab);
  await waitForCharacters(lab);
  const counts = new Map<string, number>();
  for (const r of lab.atlasRequests) counts.set(r.file, (counts.get(r.file) ?? 0) + 1);
  for (const [file, n] of counts) expect(n, `${file} requests`).toBe(1);
  const s = await labState(page);
  expect(s.labTextures).toEqual([
    'lab-amaka', 'lab-body-amaka', 'lab-body-tunde', 'lab-femi', 'lab-hair-big_afro.amaka', 'lab-hair-braided_bun.amaka',
    'lab-hair-fade.tunde', 'lab-hair-fila.tunde', 'lab-outfit-amaka.amaka', 'lab-outfit-femi.tunde', 'lab-outfit-tunde.tunde',
    'lab-outfit-zainab.amaka', 'lab-tunde', 'lab-zainab',
  ]);
  expect(s.characters).toHaveLength(22);
  const users = (key: string) => s.characters.filter((c) => c.textures.includes(key)).length;
  expect(users('lab-body-tunde'), 'characters drawn on the shared body atlas').toBeGreaterThanOrEqual(6);
  expect(users('lab-hair-fade.tunde')).toBeGreaterThanOrEqual(2);
  expect(users('lab-body-amaka'), 'characters drawn on the shared female body atlas').toBeGreaterThanOrEqual(6);
  // One texture object per atlas: every sprite using a key holds the very same Phaser texture.
  const distinct = await page.evaluate(() => {
    const sc = (window as any).__oslLab.scene.scenes[0];
    const seen = new Map<string, Set<unknown>>();
    for (const a of [sc.player, ...[...sc.remotes.values()].map((r: any) => r.avatar)]) {
      for (const l of a.layers) {
        if (!seen.has(l.texture.key)) seen.set(l.texture.key, new Set());
        seen.get(l.texture.key)!.add(l.texture);
      }
    }
    return [...seen.values()].every((set) => set.size === 1);
  });
  expect(distinct).toBe(true);
  expectClean(lab);
});
