import type Phaser from 'phaser';
import type { AvatarSelection } from '@/types/player';
import { OUTFIT_COLORS, SKIN_TONES } from '@/config/game';
import { hex } from '../render/colors';

/**
 * The player's in-world sprite, drawn from the AvatarSelection with Graphics so
 * there are no image assets to load. Swap `draw()` for a spritesheet later.
 */
export class PlayerAvatar {
  readonly container: Phaser.GameObjects.Container;
  private legs: Phaser.GameObjects.Graphics;
  private body: Phaser.GameObjects.Graphics;
  private walkTime = 0;

  /** `remote`: another player's character (different name tag colour). */
  constructor(scene: Phaser.Scene, avatar: AvatarSelection, name: string, opts: { remote?: boolean } = {}) {
    const skin = hex(SKIN_TONES[avatar.skin].hex);
    const outfit = hex(OUTFIT_COLORS[avatar.outfit].hex);
    const femme = avatar.body === 'femme';

    const shadow = scene.add.graphics();
    shadow.fillStyle(0x000000, 0.28); shadow.fillEllipse(0, 0, 26, 10);

    this.legs = scene.add.graphics();

    const body = (this.body = scene.add.graphics());
    if (femme) { body.fillStyle(outfit, 0.9); body.fillTriangle(-10, -12, 10, -12, 0, -30); body.fillRect(-10, -16, 20, 6); }
    body.fillStyle(outfit); body.fillRoundedRect(-10, -40, 20, 26, 6);
    body.fillStyle(skin); body.fillRoundedRect(-14, -38, 5, 18, 2); body.fillRoundedRect(9, -38, 5, 18, 2);
    body.fillStyle(skin); body.fillCircle(0, -48, 9);
    body.fillStyle(0x111111); body.fillCircle(-3, -48, 1.3); body.fillCircle(3, -48, 1.3);
    switch (avatar.headwear) {
      case 'none': body.fillStyle(0x111111); body.slice(0, -48, 9.5, Math.PI, 0, false); body.fillPath(); break;
      case 'fila': body.fillStyle(hex(OUTFIT_COLORS.adire.hex)); body.fillRoundedRect(-9, -60, 18, 8, 3); break;
      case 'cap': body.fillStyle(hex('#c4552d')); body.fillRoundedRect(-9, -59, 18, 7, 3); body.fillRect(4, -54, 10, 3); break;
      case 'gele': body.fillStyle(hex(OUTFIT_COLORS.palm.hex)); body.fillEllipse(0, -58, 26, 12); body.fillTriangle(-4, -62, 10, -72, 8, -58); break;
      case 'braids': body.fillStyle(0x111111); body.slice(0, -48, 9.5, Math.PI, 0, false); body.fillPath(); body.fillRect(-11, -50, 3, 18); body.fillRect(8, -50, 3, 18); break;
    }

    const label = scene.add.text(0, -76, name, {
      fontFamily: 'Trebuchet MS, sans-serif', fontSize: '11px', fontStyle: 'bold', color: '#fff6e5',
      backgroundColor: opts.remote ? 'rgba(18,147,90,0.85)' : 'rgba(17,26,61,0.75)', padding: { x: 4, y: 1 },
    }).setOrigin(0.5, 1);

    this.container = scene.add.container(0, 0, [shadow, this.legs, body, label]);
    this.drawLegs(0);
  }

  private drawLegs(swing: number) {
    this.legs.clear();
    this.legs.fillStyle(0x2a3a5c);
    this.legs.fillRoundedRect(-8, -16 - Math.max(0, swing) * 3, 6, 16, 2);
    this.legs.fillRoundedRect(2, -16 - Math.max(0, -swing) * 3, 6, 16, 2);
  }

  /** Turn to face left (negative) or right (positive) on screen, e.g. while standing still. */
  face(screenDx: number) {
    if (screenDx !== 0) this.body.scaleX = screenDx < 0 ? -1 : 1;
  }

  destroy() {
    this.container.destroy(true);
  }

  /** Call every frame with whether the player moved and the horizontal screen direction. */
  animate(dt: number, moving: boolean, screenDx: number) {
    if (moving) {
      this.walkTime += dt * 10;
      this.drawLegs(Math.sin(this.walkTime));
      if (screenDx !== 0) this.body.scaleX = screenDx < 0 ? -1 : 1;
    } else if (this.walkTime !== 0) {
      this.walkTime = 0;
      this.drawLegs(0);
    }
  }
}
