/**
 * A normal build (NEXT_PUBLIC_CHARACTER_LAB unset), opened with every lab query parameter: the prototype must stay
 * completely inert, with no atlas requests, no test hook and no errors.
 */
import { expect, test } from '@playwright/test';
import { expectClean, openPlay } from './lab';

test('lab query parameters do nothing in a normal build', async ({ page }) => {
  const lab = await openPlay(page, 'lab=characters&labmix=1&labq=hd&labn=20', { deviceMemory: 8 });
  await expect(page.getByLabel('Game world')).toBeVisible();
  await expect(page.getByText('Kuto Street').first()).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(6000); // long enough for any lazy atlas request to show up
  expect(lab.atlasRequests).toEqual([]);
  expect(await page.evaluate(() => typeof (window as any).__oslLab)).toBe('undefined');
  expectClean(lab);
});
