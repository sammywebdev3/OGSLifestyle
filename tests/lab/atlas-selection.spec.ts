/**
 * Atlas quality: low-memory devices (navigator.deviceMemory <= 4 GB) get the SD atlases, others HD; ?labq=hd|sd
 * overrides. Only one quality is ever downloaded. deviceMemory is faked here, so this checks the selection logic in
 * a real browser, not how a real phone behaves.
 */
import { expect, test } from '@playwright/test';
import { atlasImages, expectClean, labState, openPlay, waitForCharacters, waitForWorld } from './lab';

const CASES: { title: string; mem: number | null; q?: string; want: 'hd' | 'sd' }[] = [
  { title: '8 GB device gets HD', mem: 8, want: 'hd' },
  { title: '6 GB device gets HD', mem: 6, want: 'hd' },
  { title: '4 GB device gets SD (boundary)', mem: 4, want: 'sd' },
  { title: '2 GB device gets SD', mem: 2, want: 'sd' },
  { title: 'no deviceMemory reported (Firefox, Safari) gets HD', mem: null, want: 'hd' },
  { title: '?labq=hd overrides a 2 GB device', mem: 2, q: 'hd', want: 'hd' },
  { title: '?labq=sd overrides an 8 GB device', mem: 8, q: 'sd', want: 'sd' },
  { title: 'an unknown ?labq value is ignored', mem: 2, q: 'ultra', want: 'sd' },
];

for (const c of CASES) {
  test(c.title, async ({ page }) => {
    const lab = await openPlay(page, `lab=characters${c.q ? `&labq=${c.q}` : ''}`, { deviceMemory: c.mem });
    await waitForWorld(lab);
    await waitForCharacters(lab);
    const files = lab.atlasRequests.map((r) => r.file);
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) expect(f, `${f} should be the ${c.want} atlas`).toMatch(new RegExp(`-${c.want}\\.(webp|json)$`));
    // The four characters' atlases, each image once.
    expect(atlasImages(lab).sort()).toEqual(['amaka', 'femi', 'tunde', 'zainab'].map((n) => `${n}-${c.want}.webp`));
    const s = await labState(page);
    expect(s.characters.every((ch) => ch.loaded)).toBe(true);
    expectClean(lab);
  });
}
