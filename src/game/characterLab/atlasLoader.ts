import type Phaser from 'phaser';
import { AtlasRefs, type AtlasStats, type AtlasState } from './atlasRefs';
import { labAtlasUrls, labTextureKey, type LabQuality } from './prototype';

const SCENE_LOADING = 3; // Phaser.Scenes.LOADING: the scene's preload is running

/** How long an unused atlas stays loaded, and how long a character stays off screen before letting go of its atlases. */
export interface LabTiming { unloadDelayMs: number; releaseAfterMs: number }
export const LAB_TIMING: LabTiming = { unloadDelayMs: 8000, releaseAfterMs: 4000 };

/**
 * Character lab: loads character atlases when characters need them and frees them when none does, in the quality
 * chosen for this device. Characters take references (acquire) and give them back (release); an atlas shared by
 * several characters or layered looks is downloaded once, becomes one texture, and stays as long as anyone uses it.
 * The counting rules are in atlasRefs.ts; this class connects them to Phaser's loader and texture manager.
 */
export class LabAtlasLoader {
  private readonly scene: Phaser.Scene;
  private readonly quality: LabQuality;
  private readonly refs: AtlasRefs;
  private readonly timers = new Set<ReturnType<typeof setTimeout>>();
  readonly timing: LabTiming;
  /** Atlases whose last download failed (cleared when a retry succeeds). */
  readonly failed = new Set<string>();

  constructor(scene: Phaser.Scene, quality: LabQuality, timing: LabTiming = LAB_TIMING) {
    this.scene = scene;
    this.quality = quality;
    this.timing = timing;
    const keyOf = (atlas: string) => labTextureKey(atlas);
    const atlasOf = (key: string) => (key.startsWith('lab-') ? key.slice(4) : null);
    this.refs = new AtlasRefs({
      load: (atlas) => {
        const { image, json } = labAtlasUrls(atlas, this.quality);
        this.scene.load.atlas(keyOf(atlas), image, json);
        // During preload the scene starts the loader itself; afterwards it has to be started (files added while it
        // is already running join the current batch).
        if (this.scene.sys.settings.status !== SCENE_LOADING && !this.scene.load.isLoading()) this.scene.load.start();
      },
      unload: (atlas) => this.scene.textures.remove(keyOf(atlas)),
      inUse: (atlas) => this.drawsFrom(keyOf(atlas)),
    }, {
      set: (fn, ms) => {
        const t = setTimeout(() => { this.timers.delete(t); fn(); }, ms);
        this.timers.add(t);
        return t;
      },
      clear: (t) => { clearTimeout(t as ReturnType<typeof setTimeout>); this.timers.delete(t as ReturnType<typeof setTimeout>); },
    }, timing.unloadDelayMs);
    scene.textures.on('addtexture', (key: string) => {
      const atlas = atlasOf(key);
      if (atlas) { this.failed.delete(atlas); this.refs.loaded(atlas); }
    });
    scene.load.on('loaderror', (file: Phaser.Loader.File) => {
      const atlas = atlasOf(file.key);
      if (atlas && this.refs.stateOf(atlas) === 'loading') { this.failed.add(atlas); this.refs.failed(atlas); }
    });
    scene.events.once('shutdown', () => { for (const t of this.timers) clearTimeout(t); this.timers.clear(); });
  }

  acquire(atlases: readonly string[]) {
    this.refs.acquire(atlases);
  }

  release(atlases: readonly string[]) {
    this.refs.release(atlases);
  }

  ready(atlases: readonly string[]) {
    return this.refs.isLoaded(atlases) && atlases.every((a) => this.scene.textures.exists(labTextureKey(a)));
  }

  state(atlas: string): AtlasState {
    return this.refs.stateOf(atlas);
  }

  get stats(): AtlasStats {
    return this.refs.stats;
  }

  snapshot() {
    return this.refs.snapshot();
  }

  /** Whether any sprite in the scene (also inside containers) still draws from a texture. */
  private drawsFrom(textureKey: string): boolean {
    const visit = (objs: Phaser.GameObjects.GameObject[]): boolean => objs.some((o) => {
      const t = (o as Partial<Phaser.GameObjects.Sprite>).texture;
      if (t && t.key === textureKey) return true;
      const children = (o as Partial<Phaser.GameObjects.Container>).list;
      return Array.isArray(children) && visit(children);
    });
    return visit(this.scene.children.list);
  }
}
