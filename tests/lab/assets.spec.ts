/**
 * Character atlas management in the running game: appearance changes, texture sharing, unloading of atlases nobody
 * uses, and characters recovering when they come back into view. ?labgc=fast shortens the delays (an unused atlas
 * is freed 0.6 s after its last user lets go; a character lets go 0.3 s after leaving the view).
 */
import { expect, test, type Page } from '@playwright/test';
import { atlasImages, expectClean, labState, lookAway, lookBack, openPlay, waitForCharacters, waitForWorld } from './lab';

const loaderState = (page: Page) => page.evaluate(() => {
  const sc = (window as any).__oslLab.scene.scenes[0];
  return { stats: { ...sc.labLoader.stats }, snapshot: sc.labLoader.snapshot() as Record<string, { refs: number; state: string; loads: number; unloads: number }> };
});

const setAppearance = (page: Page, id: string, wear: object) =>
  page.evaluate(([i, w]) => (window as any).__oslLab.scene.scenes[0].labSetAppearance(i, w), [id, wear] as const);

/** Every sprite layer of every character draws from a texture that still exists. */
const noDanglingTextures = (page: Page) => page.evaluate(() => {
  const g = (window as any).__oslLab;
  const sc = g.scene.scenes[0];
  return [sc.player, ...[...sc.remotes.values()].map((r: any) => r.avatar)]
    .every((a: any) => a.layers.every((l: any) => g.textures.exists(l.texture.key) && l.texture.key !== '__MISSING'));
});

test('changing appearance swaps layers without blinking out and reuses shared textures', async ({ page }) => {
  const lab = await openPlay(page, 'lab=characters&labgc=fast', { deviceMemory: 8 });
  await waitForWorld(lab);
  await waitForCharacters(lab);
  expect((await labState(page)).characters[0]!.textures).toEqual(['lab-tunde']);

  // Watch the player every 30 ms during the change: it must be drawn the whole time.
  await page.evaluate(() => {
    const w = window as any;
    w.__blinks = 0;
    w.__watch = setInterval(() => { if (!w.__oslLab.scene.scenes[0].player.loaded) w.__blinks++; }, 30);
  });
  expect(await setAppearance(page, 'self', { body: 'tunde', outfit: 'senator', hair: 'fila' })).toBe(true);
  await expect.poll(async () => (await labState(page)).characters[0]!.textures).toEqual(['lab-body-tunde', 'lab-outfit-femi.tunde', 'lab-hair-fila.tunde']);
  // The same change as a real avatar change would carry it (AvatarSelection): Tunde in jersey with a fila.
  await setAppearance(page, 'self', { body: 'masc', skin: 'deep', headwear: 'fila', outfit: 'palm' });
  await expect.poll(async () => (await labState(page)).characters[0]!.textures).toEqual(['lab-body-tunde', 'lab-outfit-tunde.tunde', 'lab-hair-fila.tunde']);
  // A female body with Zainab's outfit and hair fitted to it.
  await setAppearance(page, 'self', { body: 'femme', skin: 'deep', headwear: 'none', outfit: 'ink' });
  await expect.poll(async () => (await labState(page)).characters[0]!.textures).toEqual(['lab-body-amaka', 'lab-outfit-zainab.amaka', 'lab-hair-big_afro.amaka']);
  // Back to the baked Tunde.
  await setAppearance(page, 'self', { body: 'tunde', outfit: 'jersey', hair: 'fade' });
  await expect.poll(async () => (await labState(page)).characters[0]!.textures).toEqual(['lab-tunde']);
  const blinks = await page.evaluate(() => { const w = window as any; clearInterval(w.__watch); return w.__blinks; });
  expect(blinks, 'samples where the player was not drawn').toBe(0);

  // 'lab-tunde' never left: the remote Tunde kept using it, so it was never downloaded again.
  expect(atlasImages(lab).filter((f) => f === 'tunde-hd.webp')).toHaveLength(1);
  // Layers nobody wears any more are freed after the delay; atlases still worn stay.
  await expect.poll(async () => (await labState(page)).labTextures).toEqual(['lab-amaka', 'lab-femi', 'lab-tunde', 'lab-zainab']);
  const { snapshot } = await loaderState(page);
  for (const key of ['tunde', 'femi', 'amaka', 'zainab']) expect(snapshot[key]!.refs, key).toBeGreaterThan(0);
  expect(await noDanglingTextures(page)).toBe(true);
  expectClean(lab);
});

test('characters off screen let go of their atlases and come back drawn when they return', async ({ page }) => {
  const lab = await openPlay(page, 'lab=characters&labmix=1&labgc=fast', { deviceMemory: 8 });
  await waitForWorld(lab);
  await waitForCharacters(lab);
  const before = await labState(page);
  expect(before.labTextures.length).toBeGreaterThan(5);
  const firstLoads = (await loaderState(page)).stats.loads;

  // Look far away from everyone: the cast leaves the view (the local player always keeps its atlases).
  await lookAway(page);
  await expect.poll(async () => (await labState(page)).labTextures, { timeout: 15_000 }).toEqual(['lab-tunde']);
  const away = await labState(page);
  expect(away.characters[0]!.loaded, 'the player is still drawn').toBe(true);
  expect(away.characters.slice(1).every((c) => !c.loaded), 'the cast shows placeholders').toBe(true);
  // 'lab-tunde' is shared by the player and the remote Tunde: freeing the remote's reference must not free it.
  expect((await loaderState(page)).snapshot.tunde!.refs).toBeGreaterThan(0);
  expect(away.labTextureMB).toBeLessThan(before.labTextureMB / 3);
  expect(await noDanglingTextures(page)).toBe(true);

  // Look back: everyone takes their atlases again and is drawn again.
  await lookBack(page);
  await waitForCharacters(lab, 30_000);
  const back = await labState(page);
  expect(back.labTextures).toEqual(before.labTextures);
  expect(back.characters.every((c) => c.loaded)).toBe(true);
  const { stats } = await loaderState(page);
  expect(stats.unloads).toBe(before.labTextures.length - 1); // everything but the player's atlas was freed once
  expect(stats.loads).toBe(firstLoads + stats.unloads); // and loaded again exactly once
  expect(await noDanglingTextures(page)).toBe(true);
  expectClean(lab);
});

test('rapid repeated outfit changes neither re-download atlases nor pile up textures', async ({ page }) => {
  // Real timing (an unused atlas is freed after 8 s), as in the game.
  const lab = await openPlay(page, 'lab=characters', { deviceMemory: 8 });
  await waitForWorld(lab);
  await waitForCharacters(lab);
  await page.evaluate(() => {
    const w = window as any;
    w.__blinks = 0;
    w.__watch = setInterval(() => { if (!w.__oslLab.scene.scenes[0].player.loaded) w.__blinks++; }, 20);
  });
  const looks = [
    { body: 'tunde', outfit: 'senator', hair: 'fila' },
    { body: 'tunde', outfit: 'jersey', hair: 'fila' },
    { body: 'amaka', outfit: 'croptank', hair: 'big_afro' },
    { body: 'amaka', outfit: 'ankara', hair: 'big_afro' },
    { body: 'tunde', outfit: 'jersey', hair: 'fade' },
  ];
  // 40 changes, 60 ms apart: often faster than a download finishes.
  for (let i = 0; i < 40; i++) {
    await setAppearance(page, 'self', looks[i % looks.length]!);
    await page.waitForTimeout(60);
  }
  await expect.poll(async () => (await labState(page)).characters[0]!.textures).toEqual(['lab-tunde']);
  const blinks = await page.evaluate(() => { const w = window as any; clearInterval(w.__watch); return w.__blinks; });
  expect(blinks, 'samples where the player was not drawn').toBe(0);
  // Every atlas file was downloaded once despite 40 changes.
  const counts = new Map<string, number>();
  for (const r of lab.atlasRequests) counts.set(r.file, (counts.get(r.file) ?? 0) + 1);
  for (const [file, n] of counts) expect(n, `${file} requests`).toBe(1);
  // Once the unload delay has passed, only the atlases still worn remain: the texture count is bounded.
  await expect.poll(async () => (await labState(page)).labTextures, { timeout: 20_000, intervals: [1000] })
    .toEqual(['lab-amaka', 'lab-femi', 'lab-tunde', 'lab-zainab']);
  expect(await noDanglingTextures(page)).toBe(true);
  expectClean(lab);
});

test('when atlases are freed and needed again, each download follows a real unload (never a duplicate)', async ({ page }) => {
  // Fast timing (0.6 s) on purpose: atlases are freed between changes, so some are downloaded again.
  const lab = await openPlay(page, 'lab=characters&labgc=fast', { deviceMemory: 8 });
  await waitForWorld(lab);
  await waitForCharacters(lab);
  const looks = [
    { body: 'tunde', outfit: 'senator', hair: 'fila' },
    { body: 'amaka', outfit: 'croptank', hair: 'big_afro' },
    { body: 'tunde', outfit: 'jersey', hair: 'fade' },
  ];
  for (let i = 0; i < 9; i++) {
    await setAppearance(page, 'self', looks[i % looks.length]!);
    await page.waitForTimeout(i % 2 ? 1200 : 100); // sometimes long enough for the old layers to be freed
  }
  await page.waitForTimeout(1500);
  const { snapshot } = await loaderState(page);
  const images = new Map<string, number>();
  for (const r of lab.atlasRequests) if (r.file.endsWith('.webp')) images.set(r.file, (images.get(r.file) ?? 0) + 1);
  for (const [atlas, s] of Object.entries(snapshot)) {
    const requests = images.get(`${atlas}-hd.webp`) ?? 0;
    expect(requests, `${atlas}: downloads match loads`).toBe(s.loads);
    expect(s.loads - s.unloads, `${atlas}: never loaded twice without being freed in between`).toBeGreaterThanOrEqual(0);
    expect(s.loads - s.unloads).toBeLessThanOrEqual(1);
    expect(s.state === 'loaded', `${atlas}: loaded exactly when someone holds it`).toBe(s.refs > 0);
  }
  expect(await noDanglingTextures(page)).toBe(true);
  expectClean(lab);
});

test('device-testing aids: ?labcycle changes the outfit on a timer and ?labhud shows the counters', async ({ page }) => {
  const lab = await openPlay(page, 'lab=characters&labcycle=1&labhud=1', { deviceMemory: 2 });
  await waitForWorld(lab);
  await waitForCharacters(lab);
  // Each change waits for its atlases to arrive, so allow time on a slow (software-rendered) machine.
  const seen = new Set<string>();
  for (let i = 0; i < 80 && seen.size < 3; i++) {
    seen.add((await labState(page)).characters[0]!.textures.join('+'));
    await page.waitForTimeout(500);
  }
  expect(seen.size, 'different looks seen on the player').toBeGreaterThanOrEqual(3);
  const hud = await page.evaluate(() => (window as any).__oslLab.scene.scenes[0].labHud?.text as string | undefined);
  expect(hud).toMatch(/fps \d+ {2}q sd/);
  expect(hud).toMatch(/drawn \d+\/5/);
  expect(hud).toMatch(/loads \d+ unloads \d+ fail 0/);
  expectClean(lab);
});
