/**
 * A character atlas that fails to download (bad network, missing file) must not break the game: the world and the
 * other characters carry on, and the affected character stays a placeholder with its name tag.
 */
import { expect, test } from '@playwright/test';
import { expectClean, labState, openPlay, playerPosition, waitForWorld, walk } from './lab';

test('a failed atlas leaves a placeholder and nothing else breaks', async ({ page }) => {
  const lab = await openPlay(page, 'lab=characters', { deviceMemory: 8, failAtlas: /zainab-hd\.webp/ });
  await waitForWorld(lab);
  await expect.poll(async () => (await labState(page)).failed, { timeout: 30_000 }).toContain('lab-zainab');
  await expect.poll(async () => (await labState(page)).characters.filter((c) => c.loaded).length, { timeout: 30_000 }).toBe(4);
  const s = await labState(page);
  const zainab = s.characters.find((c) => c.name === 'Zainab')!;
  expect(zainab.loaded).toBe(false);
  expect(s.labTextures).not.toContain('lab-zainab');
  // Still on screen as a placeholder: its container keeps the shadow ellipse and the name tag.
  const parts = await page.evaluate(() => {
    const sc = (window as any).__oslLab.scene.scenes[0];
    const r = [...sc.remotes.values()].find((x: any) => x.name === 'Zainab') as any;
    return { visible: r.avatar.container.visible, children: r.avatar.container.list.length };
  });
  expect(parts.visible).toBe(true);
  expect(parts.children).toBeGreaterThanOrEqual(2);
  // The game keeps running: the player moves.
  const a = await playerPosition(page);
  await walk(page, 'down', 700);
  const b = await playerPosition(page);
  expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeGreaterThan(10);
  // The browser logs the failed download itself; nothing else may error.
  expectClean(lab, { allowConsole: /Failed to load resource|net::ERR_FAILED|Failed to process file/ });
});
