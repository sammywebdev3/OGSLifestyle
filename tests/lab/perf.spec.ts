/**
 * Performance traces and measurements from the local lab build: `npm run test:lab:perf`.
 *
 * SIMULATED MEASUREMENTS. These run in headless desktop Chromium with software WebGL (SwiftShader) on whatever
 * machine runs the tests. "Phone" scenarios only emulate a phone's viewport, pixel ratio, touch input and
 * navigator.deviceMemory; CPU, GPU, memory limits, thermal throttling and network are the host's. Use them to
 * compare scenarios with each other on the same machine, never as Android results. Real-device steps are in
 * docs/android-test-checklist.md.
 *
 * For each scenario this writes to test-results/lab-perf/:
 *   <scenario>.trace.json   a Chrome performance trace (open in Chrome DevTools > Performance > Load profile)
 *   summary.json / summary.md   the numbers below for every scenario
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test, type Browser } from '@playwright/test';
import { expectClean, labState, openPlay, waitForCharacters, waitForWorld } from './lab';

const OUT = path.join('test-results', 'lab-perf');
const VIEWPORTS = {
  desktop: { viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
} as const;

interface Scenario { name: string; vp: keyof typeof VIEWPORTS; query: string; deviceMemory?: number }
const SCENARIOS: Scenario[] = [
  { name: 'desktop-5-painted', vp: 'desktop', query: 'lab=painted' },
  { name: 'desktop-5-3d-hd', vp: 'desktop', query: 'lab=characters', deviceMemory: 8 },
  { name: 'phone-5-painted', vp: 'phone', query: 'lab=painted' },
  { name: 'phone-5-3d-sd', vp: 'phone', query: 'lab=characters', deviceMemory: 2 },
  { name: 'phone-5-3d-hd', vp: 'phone', query: 'lab=characters', deviceMemory: 8 },
  { name: 'phone-21-painted', vp: 'phone', query: 'lab=painted&labn=20' },
  { name: 'phone-21-3d-sd-mixed', vp: 'phone', query: 'lab=characters&labn=20&labmix=1', deviceMemory: 2 },
  { name: 'phone-21-3d-hd-mixed', vp: 'phone', query: 'lab=characters&labn=20&labmix=1', deviceMemory: 8 },
];

// Trace categories: the main-thread timeline, frames and GPU work (what DevTools' Performance panel records).
const CATEGORIES = ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'disabled-by-default-devtools.timeline.frame',
  'blink.user_timing', 'gpu', 'v8.execute', 'loading'];

const rows: Record<string, unknown>[] = [];

test.describe.configure({ mode: 'serial' });

for (const sc of SCENARIOS) {
  test(`perf: ${sc.name}`, async ({ browser }) => {
    test.setTimeout(240_000);
    const row = await measure(browser, sc);
    rows.push(row);
    expect(row.pageErrors).toBe(0);
  });
}

test.afterAll(() => {
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify({ simulated: true, host: hostInfo(), rows }, null, 1));
  const cols = ['scenario', 'quality', 'characters', 'worldMs', 'allCharactersMs', 'fps', 'frameMedianMs', 'frameP95Ms',
    'longTasks', 'jsHeapMB', 'textureMB', 'labTextureMB', 'atlasKB'];
  const md = [`Simulated in headless Chromium + SwiftShader on ${hostInfo()}. Not Android measurements.`, '',
    `| ${cols.join(' | ')} |`, `| ${cols.map(() => '---').join(' | ')} |`,
    ...rows.map((r) => `| ${cols.map((c) => String(r[c] ?? '')).join(' | ')} |`)].join('\n');
  fs.writeFileSync(path.join(OUT, 'summary.md'), md + '\n');
});

function hostInfo() {
  return `${os.cpus().length} CPU cores (${os.cpus()[0]?.model ?? 'unknown'}), ${Math.round(os.totalmem() / 2 ** 30)} GB RAM`;
}

async function measure(browser: Browser, sc: Scenario) {
  const ctx = await browser.newContext({ ...VIEWPORTS[sc.vp], baseURL: test.info().project.use.baseURL });
  const page = await ctx.newPage();
  const atlasBytes = new Map<string, number>();
  page.on('response', async (r) => {
    if (!/\/prototype-characters\//.test(r.url())) return;
    const body = await r.body().catch(() => null);
    if (body) atlasBytes.set(r.url(), body.length);
  });
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Performance.enable');
  fs.mkdirSync(OUT, { recursive: true });
  const tracePath = path.join(OUT, `${sc.name}.trace.json`);
  await browser.startTracing(page, { path: tracePath, categories: CATEGORIES });

  const lab = await openPlay(page, sc.query, { deviceMemory: sc.deviceMemory });
  const worldMs = await waitForWorld(lab);
  const allCharactersMs = await waitForCharacters(lab);
  await page.waitForTimeout(1500);

  // 6 s of play: the player walks a square while the cast strolls; frame times measured inside the game loop.
  const frames = await page.evaluate(() => new Promise<{ fps: number; median: number; p95: number }>((resolve) => {
    const g = (window as any).__oslLab;
    const bus = g.scene.scenes[0].opts.bus;
    const times: number[] = []; let t = 0; let n = 0; const t0 = performance.now();
    const pre = () => { t = performance.now(); };
    const post = () => { times.push(performance.now() - t); n++; };
    g.events.on('prestep', pre); g.events.on('postrender', post);
    const dirs = ['right', 'down', 'left', 'up']; let k = 0;
    const iv = setInterval(() => {
      dirs.forEach((d) => bus.ui.emit('input:direction', { direction: d, pressed: false }));
      bus.ui.emit('input:direction', { direction: dirs[k++ % 4], pressed: true });
    }, 750);
    setTimeout(() => {
      clearInterval(iv);
      dirs.forEach((d) => bus.ui.emit('input:direction', { direction: d, pressed: false }));
      g.events.off('prestep', pre); g.events.off('postrender', post);
      times.sort((a, b) => a - b);
      resolve({ fps: n / ((performance.now() - t0) / 1000), median: times[Math.floor(times.length / 2)]!, p95: times[Math.floor(times.length * 0.95)]! });
    }, 6000);
  }));
  const metrics = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
  const state = await labState(page);
  await browser.stopTracing();
  const longTasks = countLongTasks(tracePath);
  expectClean(lab);
  const images = lab.atlasRequests.filter((r) => r.file.endsWith('.webp')).map((r) => r.file);
  const quality = images.some((f) => f.endsWith('-sd.webp')) ? 'sd' : images.length ? 'hd' : '-';
  await ctx.close();
  return {
    scenario: sc.name, simulated: true, viewport: sc.vp, deviceMemory: sc.deviceMemory ?? 'not set', quality,
    characters: state.characters.length, worldMs, allCharactersMs,
    fps: +frames.fps.toFixed(1), frameMedianMs: +frames.median.toFixed(2), frameP95Ms: +frames.p95.toFixed(2),
    longTasks, jsHeapMB: +((metrics.JSHeapUsedSize ?? 0) / 2 ** 20).toFixed(1),
    textureMB: +state.textureMB.toFixed(1), labTextureMB: +state.labTextureMB.toFixed(1),
    atlasKB: Math.round([...atlasBytes.values()].reduce((a, b) => a + b, 0) / 1024), atlasFiles: images,
    pageErrors: lab.pageErrors.length, trace: tracePath,
  };
}

/** Main-thread tasks longer than 50 ms in the trace (what DevTools flags as long tasks). */
function countLongTasks(tracePath: string): number {
  const raw = JSON.parse(fs.readFileSync(tracePath, 'utf8')) as { traceEvents?: { name: string; dur?: number; ph: string; tid: number; pid: number; args?: { name?: string } }[] };
  const events = raw.traceEvents ?? [];
  const main = new Set(events.filter((e) => e.name === 'thread_name' && e.args?.name === 'CrRendererMain').map((e) => `${e.pid}:${e.tid}`));
  return events.filter((e) => e.name === 'RunTask' && e.ph === 'X' && (e.dur ?? 0) > 50_000 && main.has(`${e.pid}:${e.tid}`)).length;
}
