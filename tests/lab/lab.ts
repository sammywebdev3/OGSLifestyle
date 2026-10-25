/**
 * Helpers for the character lab browser tests: open /play as an offline guest (never signed in, no Supabase),
 * optionally pretend to be a device with a given `navigator.deviceMemory`, block every request that leaves
 * localhost, and read the game's state through the lab-only test hook (window.__oslLab, the Phaser game).
 */
import { expect, type Page } from '@playwright/test';

export const GUEST_SAVE = {
  player: {
    id: 'lab-guest', characterName: 'Tolu Kuto',
    avatar: { body: 'masc', skin: 'deep', headwear: 'none', outfit: 'palm' },
    cash: 50000, location: 'kuto-street', inventoryId: 'lab-inv', createdAt: '2026-01-01T00:00:00.000Z', source: 'guest',
  },
  inventory: { id: 'lab-inv', items: [] },
};

export interface AtlasRequest { url: string; file: string; ms: number }

export interface LabPage {
  page: Page;
  /** Requests for prototype character atlases (images and JSON), in request order. */
  atlasRequests: AtlasRequest[];
  /** Requests that would have left localhost (blocked). */
  blocked: string[];
  pageErrors: string[];
  consoleErrors: string[];
  startedAt: number;
}

/**
 * Open /play?<query> as a guest. `deviceMemory` overrides navigator.deviceMemory (GB; null = not reported, as in
 * Firefox and Safari) before any script runs. `failAtlas` makes matching atlas requests fail (network error).
 */
export async function openPlay(page: Page, query: string, opts: { deviceMemory?: number | null; failAtlas?: RegExp } = {}): Promise<LabPage> {
  const lab: LabPage = { page, atlasRequests: [], blocked: [], pageErrors: [], consoleErrors: [], startedAt: 0 };
  await page.addInitScript((save) => localStorage.setItem('osl.guest.v1', JSON.stringify(save)), GUEST_SAVE);
  if (opts.deviceMemory !== undefined) {
    await page.addInitScript((m) => Object.defineProperty(Navigator.prototype, 'deviceMemory', { get: () => m ?? undefined, configurable: true }), opts.deviceMemory);
  }
  // Keep the tests local: anything not on localhost is recorded and refused.
  await page.route('**/*', (route) => {
    const host = new URL(route.request().url()).hostname;
    if (host === 'localhost' || host === '127.0.0.1') return route.fallback();
    lab.blocked.push(route.request().url());
    return route.abort('blockedbyclient');
  });
  if (opts.failAtlas) {
    const fail = opts.failAtlas;
    await page.route(/\/prototype-characters\//, (route) => (fail.test(route.request().url()) ? route.abort('failed') : route.fallback()));
  }
  page.on('request', (r) => {
    if (/\/prototype-characters\//.test(r.url())) {
      lab.atlasRequests.push({ url: r.url(), file: decodeURIComponent(r.url().split('/').pop() ?? ''), ms: Date.now() - lab.startedAt });
    }
  });
  page.on('pageerror', (e) => lab.pageErrors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/swiftshader|GPU stall|WebGL/i.test(m.text())) lab.consoleErrors.push(m.text().slice(0, 200));
  });
  lab.startedAt = Date.now();
  await page.goto(`/play?${query}`);
  return lab;
}

/** Wait until the Phaser scene is running with the world built. Returns the time from navigation (ms). */
export async function waitForWorld(lab: LabPage): Promise<number> {
  await lab.page.waitForFunction(() => {
    const g = (window as any).__oslLab;
    const sc = g?.scene.scenes[0];
    return !!sc && sc.sys.isActive() && sc.children.list.length > 50 && !!sc.player;
  }, null, { timeout: 90_000 });
  return Date.now() - lab.startedAt;
}

/** Wait until every character (the player and the cast) is drawn from its atlases. Returns ms from navigation. */
export async function waitForCharacters(lab: LabPage, timeout = 60_000): Promise<number> {
  await lab.page.waitForFunction(() => {
    const sc = (window as any).__oslLab.scene.scenes[0];
    const all = [sc.player, ...[...sc.remotes.values()].map((r: any) => r.avatar)];
    return all.every((a: any) => a.loaded === undefined || a.loaded);
  }, null, { timeout, polling: 100 });
  return Date.now() - lab.startedAt;
}

export interface CharacterState { name: string; remote: boolean; loaded: boolean | null; textures: string[] }
export interface LabState {
  characters: CharacterState[];
  /** Texture keys of loaded lab atlases ('lab-<atlas>'). */
  labTextures: string[];
  /** Atlases the loader gave up on (Phaser loader errors). */
  failed: string[];
  /** Estimated GPU memory of all textures and of the lab atlases (width x height x 4 bytes), MB. */
  textureMB: number;
  labTextureMB: number;
}

export async function labState(page: Page): Promise<LabState> {
  return page.evaluate(() => {
    const g = (window as any).__oslLab;
    const sc = g.scene.scenes[0];
    const describe = (a: any, name: string, remote: boolean) => ({
      name, remote,
      loaded: a.loaded === undefined ? null : !!a.loaded,
      textures: (a.layers ?? []).map((s: any) => s.texture.key),
    });
    const characters = [describe(sc.player, 'player', false), ...[...sc.remotes.values()].map((r: any) => describe(r.avatar, r.name, true))];
    let t = 0; let lab = 0;
    const labTextures: string[] = [];
    for (const key of g.textures.getTextureKeys()) {
      const src = g.textures.get(key).source[0];
      if (!src) continue;
      const bytes = src.width * src.height * 4;
      t += bytes;
      if (key.startsWith('lab-')) { lab += bytes; labTextures.push(key); }
    }
    return { characters, labTextures: labTextures.sort(), failed: [...(sc.labLoader?.failed ?? [])], textureMB: t / 1048576, labTextureMB: lab / 1048576 };
  });
}

/** Hold a direction key for `ms` through the game's input bus (the same path as the on-screen pad). */
export async function walk(page: Page, direction: 'up' | 'down' | 'left' | 'right', ms: number) {
  await page.evaluate((d) => (window as any).__oslLab.scene.scenes[0].opts.bus.ui.emit('input:direction', { direction: d, pressed: true }), direction);
  await page.waitForTimeout(ms);
  await page.evaluate((d) => (window as any).__oslLab.scene.scenes[0].opts.bus.ui.emit('input:direction', { direction: d, pressed: false }), direction);
}

export async function playerPosition(page: Page): Promise<{ x: number; y: number }> {
  return page.evaluate(() => {
    const c = (window as any).__oslLab.scene.scenes[0].player.container;
    return { x: c.x, y: c.y };
  });
}

/** No page errors, no unexpected console errors and nothing tried to leave localhost. */
export function expectClean(lab: LabPage, opts: { allowConsole?: RegExp } = {}) {
  expect(lab.pageErrors, 'page errors').toEqual([]);
  expect(lab.blocked, 'requests that tried to leave localhost').toEqual([]);
  const consoleErrors = opts.allowConsole ? lab.consoleErrors.filter((e) => !opts.allowConsole!.test(e)) : lab.consoleErrors;
  expect(consoleErrors, 'console errors').toEqual([]);
}

/** Atlas image files requested, by name (e.g. 'tunde-hd.webp'). */
export const atlasImages = (lab: LabPage) => lab.atlasRequests.filter((r) => r.file.endsWith('.webp')).map((r) => r.file);
