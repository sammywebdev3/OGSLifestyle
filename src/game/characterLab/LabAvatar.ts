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
 * Until its atlases have loaded, the character shows as a soft shadow under its name tag.
 */
export class LabAvatar {
  readonly container: Phaser.GameObjects.Container;
  private readonly scene: Phaser.Scene;
  private readonly look: LabLook;
  private readonly loader: LabAtlasLoader;
  private readonly scale: number;
  private layers: Phaser.GameObjects.Sprite[] = [];
  private placeholder: Phaser.GameObjects.Ellipse | null;
  private direction = 0;
  private walking = false;
  private clock = 0;

  constructor(scene: Phaser.Scene, look: LabLook, name: string, opts: { remote?: boolean; quality?: LabQuality; loader: LabAtlasLoader }) {
    this.scene = scene;
    this.look = look;
    this.loader = opts.loader;
    this.scale = 1 / LAB_QUALITY[opts.quality ?? 'hd'];
    this.placeholder = scene.add.ellipse(3, 0, 22, 8, 0x2b1a2e, 0.25);
    this.container = scene.add.container(0, 0, [this.placeholder, addNameTag(scene, name, opts.remote ?? false)]);
    this.loader.request(look.atlases);
    this.attach();
  }

  /** Whether the character is drawn from its atlases yet (false while they load). */
  get loaded() {
    return this.layers.length > 0;
  }

  private attach() {
    if (this.loaded || !this.loader.ready(this.look.atlases)) return;
    // Frames are trimmed in the atlases; Phaser measures the origin against each frame's full size, so every
    // layer lands on the same anchor (between the feet).
    this.layers = this.look.atlases.map((atlas) => this.scene.add.sprite(0, 0, labTextureKey(atlas), labFrame(0, LAB_WALK))
      .setOrigin(LAB_FRAME.ax / LAB_FRAME.w, LAB_FRAME.ay / LAB_FRAME.h).setScale(this.scale));
    this.container.addAt(this.layers, 0);
    this.placeholder?.destroy();
    this.placeholder = null;
  }

  /** Face the direction of a screen movement (x right, y down); no movement keeps the current facing. */
  face(screenDx: number, screenDy = 0) {
    const d = pickDirection(screenDx, screenDy);
    if (d !== null) this.direction = d;
  }

  destroy() {
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
    this.attach();
    const column = moving
      ? Math.floor(this.clock * WALK_FPS) % LAB_WALK
      : LAB_WALK + (Math.floor(this.clock * IDLE_FPS) % LAB_IDLE);
    const frame = labFrame(this.direction, column);
    for (const layer of this.layers) layer.setFrame(frame);
  }
}
