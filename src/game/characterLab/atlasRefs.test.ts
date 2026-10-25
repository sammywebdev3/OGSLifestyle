import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AtlasRefs, type AtlasStore, type Scheduler } from './atlasRefs.ts';

/** A fake store and a manual clock: loads finish when the test says so, timers fire when time is advanced. */
function setup(delay = 1000) {
  const log: string[] = [];
  const using = new Set<string>();
  const store: AtlasStore = { load: (k) => log.push(`load ${k}`), unload: (k) => log.push(`unload ${k}`), inUse: (k) => using.has(k) };
  let now = 0;
  let id = 0;
  const timers = new Map<number, { at: number; fn: () => void }>();
  const scheduler: Scheduler = {
    set: (fn, ms) => { timers.set(++id, { at: now + ms, fn }); return id; },
    clear: (h) => { timers.delete(h as number); },
  };
  const advance = (ms: number) => {
    now += ms;
    for (const [k, t] of [...timers].sort((a, b) => a[1].at - b[1].at)) {
      if (t.at <= now && timers.has(k)) { timers.delete(k); t.fn(); }
    }
  };
  return { refs: new AtlasRefs(store, scheduler, delay), log, using, advance };
}

test('atlas refs: an atlas is loaded once however many characters use it', () => {
  const { refs, log } = setup();
  refs.acquire(['body', 'outfit-a']);
  refs.acquire(['body', 'outfit-b']);
  refs.acquire(['body']);
  assert.deepEqual(log, ['load body', 'load outfit-a', 'load outfit-b']);
  assert.equal(refs.count('body'), 3);
});

test('atlas refs: an atlas is freed only after its last user lets go, and only after the delay', () => {
  const { refs, log, advance } = setup(1000);
  refs.acquire(['body', 'outfit-a']); refs.acquire(['body', 'outfit-b']);
  refs.loaded('body'); refs.loaded('outfit-a'); refs.loaded('outfit-b');
  refs.release(['body', 'outfit-a']);
  advance(5000);
  assert.deepEqual(log.filter((l) => l.startsWith('unload')), ['unload outfit-a']); // body is still used by look b
  refs.release(['body', 'outfit-b']);
  advance(999);
  assert.equal(log.filter((l) => l.startsWith('unload')).length, 1);
  advance(1);
  assert.deepEqual(log.filter((l) => l.startsWith('unload')).sort(), ['unload body', 'unload outfit-a', 'unload outfit-b']);
  assert.equal(refs.stats.unloads, 3);
});

test('atlas refs: coming back within the delay keeps the atlas (no reload, no new texture)', () => {
  const { refs, log, advance } = setup(1000);
  refs.acquire(['tunde']); refs.loaded('tunde');
  refs.release(['tunde']);
  advance(800);
  refs.acquire(['tunde']);
  advance(5000);
  assert.deepEqual(log, ['load tunde']);
  assert.equal(refs.stateOf('tunde'), 'loaded');
});

test('atlas refs: after it was freed, the next user loads it again', () => {
  const { refs, log, advance } = setup(100);
  refs.acquire(['tunde']); refs.loaded('tunde'); refs.release(['tunde']);
  advance(100);
  refs.acquire(['tunde']);
  assert.deepEqual(log, ['load tunde', 'unload tunde', 'load tunde']);
});

test('atlas refs: an atlas still drawn from is never freed, even with no references', () => {
  const { refs, log, using, advance } = setup(100);
  refs.acquire(['tunde']); refs.loaded('tunde');
  using.add('tunde');
  refs.release(['tunde']);
  advance(1000);
  assert.ok(!log.includes('unload tunde'));
  assert.equal(refs.stats.skippedUnloads, 1);
});

test('atlas refs: released while still loading, it is freed after it arrives; extra releases are ignored', () => {
  const { refs, log, advance } = setup(100);
  refs.acquire(['zainab']);
  refs.release(['zainab']); refs.release(['zainab']);
  assert.equal(refs.count('zainab'), 0);
  refs.loaded('zainab');
  advance(100);
  assert.deepEqual(log, ['load zainab', 'unload zainab']);
});

test('atlas refs: a failed load is retried by the next user', () => {
  const { refs, log } = setup();
  refs.acquire(['zainab']);
  refs.failed('zainab');
  assert.equal(refs.stateOf('zainab'), 'failed');
  refs.acquire(['zainab']);
  assert.deepEqual(log, ['load zainab', 'load zainab']);
  assert.equal(refs.stats.failures, 1);
});

test('atlas refs: swapping looks that share layers never frees the shared ones', () => {
  const { refs, log, advance } = setup(100);
  const a = ['body-tunde', 'outfit-tunde.tunde', 'hair-fade.tunde'];
  const b = ['body-tunde', 'outfit-femi.tunde', 'hair-fade.tunde'];
  refs.acquire(a); a.forEach((k) => refs.loaded(k));
  refs.acquire(b); refs.loaded('outfit-femi.tunde'); // the new look is held before the old one is dropped
  refs.release(a);
  advance(1000);
  assert.deepEqual(log.filter((l) => l.startsWith('unload')), ['unload outfit-tunde.tunde']);
  assert.equal(log.filter((l) => l === 'load body-tunde').length, 1);
});
