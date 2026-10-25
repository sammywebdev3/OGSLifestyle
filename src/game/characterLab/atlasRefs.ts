/**
 * Character lab: reference counting for character atlases (pure logic, no Phaser; see atlasLoader.ts for the glue).
 *
 * Every character that draws from an atlas holds a reference to it. An atlas is loaded on its first reference and
 * may be unloaded only when nobody references it: after `unloadDelayMs` without references (so a character walking
 * off screen and straight back, or one look replacing another that shares layers, never reloads anything), and only
 * if the store confirms nothing still draws from it. A load that fails is forgotten, so the next reference retries.
 */
export type AtlasState = 'idle' | 'loading' | 'loaded' | 'failed';

export interface AtlasStore {
  /** Start loading an atlas; the store calls loaded(key) or failed(key) later. */
  load(key: string): void;
  /** Free the atlas's texture. */
  unload(key: string): void;
  /** Whether anything still draws from the atlas (a last safety check before unloading). */
  inUse(key: string): boolean;
}

export interface Scheduler {
  set(fn: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}

export interface AtlasStats { loads: number; unloads: number; failures: number; skippedUnloads: number }

export class AtlasRefs {
  private readonly refs = new Map<string, number>();
  private readonly state = new Map<string, AtlasState>();
  private readonly timers = new Map<string, unknown>();
  private readonly counts = new Map<string, { loads: number; unloads: number }>();
  private readonly store: AtlasStore;
  private readonly scheduler: Scheduler;
  private readonly unloadDelayMs: number;
  readonly stats: AtlasStats = { loads: 0, unloads: 0, failures: 0, skippedUnloads: 0 };

  constructor(store: AtlasStore, scheduler: Scheduler, unloadDelayMs: number) {
    this.store = store;
    this.scheduler = scheduler;
    this.unloadDelayMs = unloadDelayMs;
  }

  /** Take one reference to each atlas (an atlas listed twice is referenced twice). Starts loads as needed. */
  acquire(keys: readonly string[]) {
    for (const key of keys) {
      this.refs.set(key, (this.refs.get(key) ?? 0) + 1);
      this.cancelUnload(key);
      const s = this.stateOf(key);
      if (s === 'idle' || s === 'failed') {
        this.state.set(key, 'loading');
        this.stats.loads++;
        this.tally(key).loads++;
        this.store.load(key);
      }
    }
  }

  /** Give back one reference to each atlas. Releasing more than was acquired is ignored. */
  release(keys: readonly string[]) {
    for (const key of keys) {
      const n = this.refs.get(key) ?? 0;
      if (n <= 0) continue;
      if (n === 1) this.refs.delete(key);
      else this.refs.set(key, n - 1);
      if (n === 1 && this.stateOf(key) === 'loaded') this.scheduleUnload(key);
    }
  }

  /** The store finished loading an atlas. If everyone let go of it meanwhile, it is scheduled for unloading. */
  loaded(key: string) {
    this.state.set(key, 'loaded');
    if (!this.count(key)) this.scheduleUnload(key);
  }

  failed(key: string) {
    this.state.set(key, 'failed');
    this.stats.failures++;
  }

  count(key: string) {
    return this.refs.get(key) ?? 0;
  }

  stateOf(key: string): AtlasState {
    return this.state.get(key) ?? 'idle';
  }

  isLoaded(keys: readonly string[]) {
    return keys.every((k) => this.stateOf(k) === 'loaded');
  }

  /** Every atlas seen so far: references, state, and how often it was loaded and freed (tests, diagnostics). */
  snapshot(): Record<string, { refs: number; state: AtlasState; loads: number; unloads: number }> {
    const out: Record<string, { refs: number; state: AtlasState; loads: number; unloads: number }> = {};
    for (const [key, state] of this.state) out[key] = { refs: this.count(key), state, ...this.tally(key) };
    return out;
  }

  private tally(key: string) {
    let t = this.counts.get(key);
    if (!t) this.counts.set(key, (t = { loads: 0, unloads: 0 }));
    return t;
  }

  private scheduleUnload(key: string) {
    this.cancelUnload(key);
    this.timers.set(key, this.scheduler.set(() => {
      this.timers.delete(key);
      // Re-check at the last moment: a reference may have come back, or something may still draw from it.
      if (this.count(key) > 0 || this.stateOf(key) !== 'loaded') return;
      if (this.store.inUse(key)) {
        // Something still draws from it without a reference: never free it under that, but look again later so
        // the texture is not kept for ever once it is really unused.
        this.stats.skippedUnloads++;
        this.scheduleUnload(key);
        return;
      }
      this.state.set(key, 'idle');
      this.stats.unloads++;
      this.tally(key).unloads++;
      this.store.unload(key);
    }, this.unloadDelayMs));
  }

  private cancelUnload(key: string) {
    const t = this.timers.get(key);
    if (t !== undefined) {
      this.scheduler.clear(t);
      this.timers.delete(key);
    }
  }
}
