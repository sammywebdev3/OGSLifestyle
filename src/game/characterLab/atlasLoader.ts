import type Phaser from 'phaser';

const SCENE_LOADING = 3; // Phaser.Scenes.LOADING: the scene's preload is running
import { labAtlasUrls, labTextureKey, type LabQuality } from './prototype';

/**
 * Character lab: loads character atlases when a character first needs them (the local player's before the world
 * starts, everyone else's when they appear), each at most once, in the quality chosen for this device.
 */
export class LabAtlasLoader {
  private readonly scene: Phaser.Scene;
  private readonly quality: LabQuality;
  private readonly requested = new Set<string>();
  readonly failed = new Set<string>();

  constructor(scene: Phaser.Scene, quality: LabQuality) {
    this.scene = scene;
    this.quality = quality;
    scene.load.on('loaderror', (file: Phaser.Loader.File) => this.failed.add(file.key));
  }

  /** Queue atlases that are neither loaded nor already requested; starts the loader if it is idle. */
  request(atlases: readonly string[]) {
    let added = false;
    for (const atlas of atlases) {
      const key = labTextureKey(atlas);
      if (this.requested.has(key) || this.scene.textures.exists(key)) continue;
      this.requested.add(key);
      const { image, json } = labAtlasUrls(atlas, this.quality);
      this.scene.load.atlas(key, image, json);
      added = true;
    }
    // During preload the scene starts the loader itself; afterwards it has to be started (files added while it
    // is already running join the current batch).
    if (added && this.scene.sys.settings.status !== SCENE_LOADING && !this.scene.load.isLoading()) {
      this.scene.load.start();
    }
  }

  ready(atlases: readonly string[]) {
    return atlases.every((a) => this.scene.textures.exists(labTextureKey(a)));
  }
}
