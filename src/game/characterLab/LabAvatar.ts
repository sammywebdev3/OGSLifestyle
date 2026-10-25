import type Phaser from 'phaser';
import { addNameTag } from '../entities/PlayerAvatar';
import type { LabAtlasLoader } from './atlasLoader';
import { LAB_FRAME, LAB_IDLE, LAB_QUALITY, LAB_WALK, labFrame, labTextureKey, pickDirection, type LabLook, type LabQuality } from './prototype';

const WALK_FPS = 16; // 8 frames: one stride cycle every 0.5 s
const IDLE_FPS = 2.5;

/**
 * Character lab (prototype): a character drawn from pre-rendered 3D sprite atlases with 8 facing directions: one
 * baked atlas, or layers (body, outfit, hair) stacked with the same frame. Same interface as PlayerAvatar, and used
 * for both the local player and other players, so everyone looks the same. The contact shadow is in the frames.
 *
 * Atlases: the character holds a reference to each atlas of its look (LabAtlasLoader). Until they have loaded it
 * shows a soft shadow under its name tag. A new look (setLook) is loaded before the old one is dropped, so the
 * character never blinks out. After `releaseAfterMs` off screen it lets go of its atlases (they are freed once no
 * one else uses them) and takes them again when it comes back into view.
 */
export class LabAvatar {
  readonly container: Phaser.GameObjects.Container;
  private readonly scene: Phaser.Scene;
  private readonly loader: LabAtlasLoader;
  private readonly scale: number;
  private look: LabLook;
  private next: LabLook | null = null;
  private held = false;
  private layers: Phaser.GameObjects.Sprite[] = [];
  private placeholder: Phaser.GameObjects.Ellipse | null = null;
  private direction = 0;
  private walking = false;
  private clock = 0;
  private offScreenFor = 0;
  private onScreen = true;

  constructor(scene: Phaser.Scene, look: LabLook, name: string, opts: { remote?: boolean; quality?: LabQuality; loader: LabAtlasLoader }) {
    this.scene = scene;
    this.look = look;
    this.loader = opts.loader;
    this.scale = 1 / LAB_QUALITY[opts.quality ?? 'hd'];
    this.container = scene.add.container(0, 0, [addNameTag(scene, name, opts.remote ?? false)]);
    this.showPlaceholder();
    this.hold();
    this.attach();
  }

  /** Whether the character is drawn from its atlases (false while they load, or while released off screen). */
  get loaded() {
    return this.layers.length > 0;
  }

  /** The atlases this character currently draws (or will draw once loaded). */
  get atlases(): readonly string[] {
    return this.look.atlases;
  }

  /** Change what the character wears. The current look stays on screen until the new one has loaded. */
  setLook(look: LabLook) {
    if (sameAtlases(look, this.next ?? this.look)) return;
    if (this.next) this.loader.release(this.next.atlases);
    this.next = sameAtlases(look, this.look) ? null : look;
    if (this.next && this.held) this.loader.acquire(this.next.atlases);
    if (!this.held) { this.look = this.next ?? this.look; this.next = null; }
  }

  /** Tell the character whether it is inside the camera's view (plus a margin); call every frame before animate. */
  setOnScreen(on: boolean) {
    this.onScreen = on;
  }

  face(screenDx: number, screenDy = 0) {
    const d = pickDirection(screenDx, screenDy);
    if (d !== null) this.direction = d;
  }

  destroy() {
    this.drop();
    this.container.destroy(true);
  }

  /** Call every frame with whether the character moved and its screen movement this frame. */
  animate(dt: number, moving: boolean, screenDx: number, screenDy = 0) {
    if (moving !== this.walking) {
      this.walking = moving;
      this.clock = 0;
    }
    if (moving) this.face(screenDx, screenDy);
    this.clock += dt;
    this.offScreenFor = this.onScreen ? 0 : this.offScreenFor + dt * 1000;
    if (this.held && this.offScreenFor >= this.loader.timing.releaseAfterMs) this.drop();
    if (!this.held && this.onScreen) this.hold();
    this.swapIfReady();
    this.attach();
    const column = moving
      ? Math.floor(this.clock * WALK_FPS) % LAB_WALK
      : LAB_WALK + (Math.floor(this.clock * IDLE_FPS) % LAB_IDLE);
    const frame = labFrame(this.direction, column);
    for (const layer of this.layers) layer.setFrame(frame);
  }

  private hold() {
    this.held = true;
    this.loader.acquire(this.look.atlases);
    if (this.next) this.loader.acquire(this.next.atlases);
  }

  /** Let go of every atlas: the sprites go first, so nothing draws from a texture that may be freed. */
  private drop() {
    if (!this.held) return;
    this.detach();
    this.loader.release(this.look.atlases);
    if (this.next) {
      this.loader.release(this.next.atlases);
      this.look = this.next;
      this.next = null;
    }
    this.held = false;
  }

  private swapIfReady() {
    if (!this.next || !this.loader.ready(this.next.atlases)) return;
    this.detach();
    this.loader.release(this.look.atlases);
    this.look = this.next;
    this.next = null;
  }

  private attach() {
    if (this.loaded || !this.held || !this.loader.ready(this.look.atlases)) return;
    // Frames are trimmed in the atlases; Phaser measures the origin against each frame's full size, so every
    // layer lands on the same anchor (between the feet).
    this.layers = this.look.atlases.map((atlas) => this.scene.add.sprite(0, 0, labTextureKey(atlas), labFrame(this.direction, LAB_WALK))
      .setOrigin(LAB_FRAME.ax / LAB_FRAME.w, LAB_FRAME.ay / LAB_FRAME.h).setScale(this.scale));
    this.container.addAt(this.layers, 0);
    this.placeholder?.destroy();
    this.placeholder = null;
  }

  private detach() {
    for (const l of this.layers) l.destroy();
    this.layers = [];
    this.showPlaceholder();
  }

  private showPlaceholder() {
    if (this.placeholder) return;
    this.placeholder = this.scene.add.ellipse(3, 0, 22, 8, 0x2b1a2e, 0.25);
    this.container.addAt(this.placeholder, 0);
  }
}

const sameAtlases = (a: LabLook, b: LabLook) => a.atlases.length === b.atlases.length && a.atlases.every((x, i) => x === b.atlases[i]);
