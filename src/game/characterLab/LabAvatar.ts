import type Phaser from 'phaser';
import { addNameTag } from '../entities/PlayerAvatar';
import { LAB_FRAME, LAB_IDLE, LAB_QUALITY, LAB_WALK, labFrame, labTextureKey, pickDirection, type LabCharacter, type LabQuality } from './prototype';

const WALK_FPS = 16; // 8 frames: one stride cycle every 0.5 s
const IDLE_FPS = 2.5;

/**
 * Character lab (prototype): a character drawn from a pre-rendered 3D sprite atlas with 8 facing directions.
 * Same interface as PlayerAvatar, and used for both the local player and other players, so everyone looks
 * the same. The contact shadow is part of the rendered frames.
 */
export class LabAvatar {
  readonly container: Phaser.GameObjects.Container;
  private sprite: Phaser.GameObjects.Sprite;
  private direction = 0;
  private walking = false;
  private clock = 0;

  constructor(scene: Phaser.Scene, character: LabCharacter, name: string, opts: { remote?: boolean; quality?: LabQuality } = {}) {
    // Frames are trimmed in the atlas; Phaser measures the origin against each frame's full size.
    this.sprite = scene.add.sprite(0, 0, labTextureKey(character), labFrame(0, LAB_WALK))
      .setOrigin(LAB_FRAME.ax / LAB_FRAME.w, LAB_FRAME.ay / LAB_FRAME.h).setScale(1 / LAB_QUALITY[opts.quality ?? 'hd']);
    this.container = scene.add.container(0, 0, [this.sprite, addNameTag(scene, name, opts.remote ?? false)]);
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
    const column = moving
      ? Math.floor(this.clock * WALK_FPS) % LAB_WALK
      : LAB_WALK + (Math.floor(this.clock * IDLE_FPS) % LAB_IDLE);
    this.sprite.setFrame(labFrame(this.direction, column));
  }
}
