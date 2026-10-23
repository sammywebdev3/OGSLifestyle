import type Phaser from 'phaser';
import type { AvatarSelection } from '@/types/player';
import { AVATAR_FRAME, installAvatar } from '../art/avatarArt';
import { RES } from '../art/canvasIso';

/** Height of the name tag's bottom edge above the feet (px). */
export const NAME_TAG_LIFT = 64;

/**
 * A character in the world: a painted sprite sheet (walk and idle animations) with a soft shadow
 * and a name tag. Other players' tags are green, yours is indigo.
 */
export class PlayerAvatar {
  readonly container: Phaser.GameObjects.Container;
  private sprite: Phaser.GameObjects.Sprite;
  private key: string;
  private walking = false;

  /** `remote`: another player's character (different name tag colour). */
  constructor(scene: Phaser.Scene, avatar: AvatarSelection, name: string, opts: { remote?: boolean } = {}) {
    this.key = installAvatar(scene, avatar);
    const shadow = scene.add.ellipse(1.5, 0, 22, 8, 0x2b1a2e, 0.32);
    this.sprite = scene.add.sprite(0, 0, this.key, 'idle0')
      .setOrigin(AVATAR_FRAME.ax / AVATAR_FRAME.w, AVATAR_FRAME.ay / AVATAR_FRAME.h).setScale(1 / RES);
    this.sprite.play(`${this.key}-idle`);

    const label = scene.add.text(0, 0, name, {
      fontFamily: '"Trebuchet MS", "Segoe UI", sans-serif', fontSize: '10px', fontStyle: 'bold', color: '#fff6e5', resolution: 2,
    }).setOrigin(0.5, 0.5);
    const w = Math.ceil(label.width) + 12; const h = 15;
    const tag = scene.add.graphics();
    tag.fillStyle(0x000000, 0.2); tag.fillRoundedRect(-w / 2 + 1, -h / 2 + 1.5, w, h, 7.5);
    tag.fillStyle(opts.remote ? 0x0e7a4b : 0x1f2f6b, 0.92); tag.fillRoundedRect(-w / 2, -h / 2, w, h, 7.5);
    tag.lineStyle(1, opts.remote ? 0x2fb36f : 0x8d9be0, 0.9); tag.strokeRoundedRect(-w / 2, -h / 2, w, h, 7.5);
    const nameTag = scene.add.container(0, -NAME_TAG_LIFT - h / 2, [tag, label]);

    this.container = scene.add.container(0, 0, [shadow, this.sprite, nameTag]);
  }

  /** Turn to face left (negative) or right (positive) on screen, e.g. while standing still. */
  face(screenDx: number) {
    if (screenDx !== 0) this.sprite.setFlipX(screenDx < 0);
  }

  destroy() {
    this.container.destroy(true);
  }

  /** Call every frame with whether the character moved and the horizontal screen direction. */
  animate(_dt: number, moving: boolean, screenDx: number) {
    if (moving !== this.walking) {
      this.walking = moving;
      this.sprite.play(`${this.key}-${moving ? 'walk' : 'idle'}`);
    }
    this.face(screenDx);
  }
}
