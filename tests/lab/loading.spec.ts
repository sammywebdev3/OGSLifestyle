/** On-demand loading: the world never waits for character atlases, the local player's atlas comes first. */
import { expect, test } from '@playwright/test';
import { atlasImages, expectClean, labState, openPlay, playerPosition, waitForCharacters, waitForWorld, walk } from './lab';

test('every character is drawn from its atlases, the local player first', async ({ page }) => {
  const lab = await openPlay(page, 'lab=characters', { deviceMemory: 8 });
  const worldMs = await waitForWorld(lab);
  const allMs = await waitForCharacters(lab);
  // The guest's painted avatar (masc, palm outfit) maps to Tunde; that atlas is requested before anyone else's.
  expect(atlasImages(lab)[0]).toBe('tunde-hd.webp');
  const s = await labState(page);
  expect(s.characters).toHaveLength(5); // the player and the four-character cast
  for (const ch of s.characters) {
    expect(ch.loaded, `${ch.name} loaded`).toBe(true);
    expect(ch.textures.length, `${ch.name} has sprite layers`).toBeGreaterThan(0);
  }
  // Frames are named "<direction>-<walk|idle><n>" and every layer of a character shows the same frame.
  const frames = await page.evaluate(() => {
    const sc = (window as any).__oslLab.scene.scenes[0];
    return [sc.player, ...[...sc.remotes.values()].map((r: any) => r.avatar)].map((a: any) => a.layers.map((l: any) => l.frame.name));
  });
  for (const layers of frames) {
    expect(new Set(layers).size).toBe(1);
    expect(layers[0]).toMatch(/^[0-7]-(walk[0-7]|idle[0-3])$/);
  }
  test.info().annotations.push({ type: 'timing', description: `world ${worldMs} ms, all characters ${allMs} ms (local build, simulated)` });
  expectClean(lab);
});

test('the player still walks and collides as before', async ({ page }) => {
  const lab = await openPlay(page, 'lab=characters', { deviceMemory: 8 });
  await waitForWorld(lab);
  await waitForCharacters(lab);
  const a = await playerPosition(page);
  await walk(page, 'down', 700);
  const b = await playerPosition(page);
  expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeGreaterThan(10);
  // Walk hard in every direction while sampling the player's tile: it must never stand on a blocked tile (the
  // scene's own collision map), and at least one direction must end against something.
  let stopped = 0;
  for (const dir of ['up', 'left', 'down', 'right'] as const) {
    await page.evaluate((d) => (window as any).__oslLab.scene.scenes[0].opts.bus.ui.emit('input:direction', { direction: d, pressed: true }), dir);
    const samples: { x: number; y: number; blocked: boolean }[] = [];
    for (let t = 0; t < 40; t++) {
      samples.push(await page.evaluate(() => {
        const sc = (window as any).__oslLab.scene.scenes[0];
        return { x: sc.pos.x, y: sc.pos.y, blocked: sc.isBlocked(Math.floor(sc.pos.x), Math.floor(sc.pos.y)) };
      }));
      await page.waitForTimeout(100);
    }
    await page.evaluate((d) => (window as any).__oslLab.scene.scenes[0].opts.bus.ui.emit('input:direction', { direction: d, pressed: false }), dir);
    expect(samples.filter((p) => p.blocked), `standing on a blocked tile while walking ${dir}`).toEqual([]);
    const last = samples.slice(-10);
    if (Math.hypot(last[9]!.x - last[0]!.x, last[9]!.y - last[0]!.y) < 0.05) stopped++;
  }
  expect(stopped, 'directions that ended against an obstacle').toBeGreaterThan(0);
  expectClean(lab);
});

test('the painted comparison downloads no atlases', async ({ page }) => {
  const lab = await openPlay(page, 'lab=painted');
  await waitForWorld(lab);
  await page.waitForTimeout(3000);
  expect(lab.atlasRequests).toEqual([]);
  const s = await labState(page);
  expect(s.labTextures).toEqual([]);
  expect(s.characters.every((ch) => ch.loaded === null)).toBe(true); // painted avatars
  expectClean(lab);
});
