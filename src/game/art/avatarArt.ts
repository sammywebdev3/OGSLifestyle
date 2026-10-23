/**
 * Character sprite sheets, painted per avatar selection (body, skin, headwear, outfit) the first
 * time that combination appears: a 4-frame walk cycle and a 2-frame idle, facing right (the sprite
 * is mirrored to face left). Characters share one outline colour and the world's light direction.
 */
import type Phaser from 'phaser';
import type { AvatarSelection } from '@/types/player';
import { OUTFIT_COLORS, SKIN_TONES } from '@/config/game';
import { RES, roundRect } from './canvasIso';
import { rgba, shade } from './color';
import { PAL } from './palette';

/** Frame size and the feet anchor inside it (world px). */
export const AVATAR_FRAME = { w: 44, h: 66, ax: 22, ay: 62 };
export const AVATAR_FRAMES = ['idle0', 'idle1', 'walk0', 'walk1', 'walk2', 'walk3'] as const;
type FrameName = (typeof AVATAR_FRAMES)[number];

export const avatarKey = (a: AvatarSelection) => `osl-avatar-${a.body}-${a.skin}-${a.headwear}-${a.outfit}`;

/** Pose per frame: leg swing (-1..1), body bob (px, up is negative), arm swing (-1..1). */
const POSES: Record<FrameName, { leg: number; bob: number; arm: number; breathe: number }> = {
  idle0: { leg: 0, bob: 0, arm: 0, breathe: 0 },
  idle1: { leg: 0, bob: 0, arm: 0, breathe: 0.6 },
  walk0: { leg: 1, bob: 0, arm: -1, breathe: 0 },
  walk1: { leg: 0, bob: -1.5, arm: 0, breathe: 0 },
  walk2: { leg: -1, bob: 0, arm: 1, breathe: 0 },
  walk3: { leg: 0, bob: -1.5, arm: 0, breathe: 0 },
};

type C = CanvasRenderingContext2D;
const OUT = PAL.outline;

function outlined(c: C, fill: string | CanvasGradient, path: () => void, width = 1.1) {
  path(); c.fillStyle = fill; c.fill();
  c.lineWidth = width; c.strokeStyle = OUT; c.lineJoin = 'round'; c.stroke();
}

function paintFrame(c: C, a: AvatarSelection, pose: (typeof POSES)[FrameName]) {
  const skin = SKIN_TONES[a.skin].hex; const cloth = OUTFIT_COLORS[a.outfit].hex;
  const femme = a.body === 'femme';
  const accent = a.outfit === 'palm' ? '#3a4fb0' : '#f2b632';
  const trouser = '#2b3550';
  const b = pose.bob;
  // Legs (back leg first, darker).
  const leg = (dx: number, swing: number, back: boolean) => {
    const col = femme ? shade(skin, back ? -0.15 : 0) : shade(trouser, back ? -0.2 : 0);
    outlined(c, col, () => { roundRect(c, dx - 2.6 + swing * 2.2, -16 + b * 0.3, 5.2, 15 - Math.abs(swing) * 0.6, 2); });
    outlined(c, back ? '#1f1a18' : '#2e2622', () => { roundRect(c, dx - 3 + swing * 3, -2.5, 6.5, 3, 1.4); }, 0.9); // shoe
  };
  leg(-3.2, -pose.leg, true); leg(3.2, pose.leg, false);
  // Back arm.
  const arm = (dx: number, swing: number, back: boolean) => {
    c.save(); c.translate(dx, -31 + b); c.rotate(swing * 0.35);
    outlined(c, shade(cloth, back ? -0.3 : -0.1), () => { roundRect(c, -2.4, -1, 4.8, 7, 2); });
    outlined(c, shade(skin, back ? -0.15 : 0), () => { roundRect(c, -2, 5, 4, 9, 2); });
    c.restore();
  };
  arm(-7.5, pose.arm, true);
  // Torso / dress.
  const g = c.createLinearGradient(-8, 0, 8, 0);
  g.addColorStop(0, shade(cloth, 0.12)); g.addColorStop(0.65, cloth); g.addColorStop(1, shade(cloth, -0.25));
  if (femme) {
    outlined(c, g, () => { c.beginPath(); c.moveTo(-6.5, -33 + b); c.lineTo(6.5, -33 + b); c.lineTo(9.5, -12 + b * 0.5); c.quadraticCurveTo(0, -9.5 + b * 0.5, -9.5, -12 + b * 0.5); c.closePath(); });
    c.fillStyle = rgba(accent, 0.85); // ankara print
    for (let i = 0; i < 9; i++) { const x = -6 + (i % 3) * 6 + (Math.floor(i / 3) % 2) * 2; const y = -29 + Math.floor(i / 3) * 6 + b; c.beginPath(); c.arc(x, y, 1.2, 0, Math.PI * 2); c.fill(); }
  } else {
    outlined(c, g, () => { roundRect(c, -7.5, -34 + b, 15, 19, 4); });
    c.fillStyle = rgba(accent, 0.9); c.fillRect(-7, -27 + b, 14, 1.6); c.fillRect(-7, -23 + b, 14, 1.0); // adire band
    outlined(c, trouser, () => { roundRect(c, -7, -17 + b * 0.5, 14, 4, 1.5); }, 0.9); // waist
  }
  c.fillStyle = rgba('#fff', 0.18); c.fillRect(-5.5, -32 + b, 2, 12); // light from the left
  // Neck and head.
  c.fillStyle = shade(skin, -0.12); c.fillRect(-2, -37 + b, 4, 4);
  const hb = b + pose.breathe * 0.5;
  const hg = c.createRadialGradient(-2.5, -45 + hb, 1, 0, -43 + hb, 10);
  hg.addColorStop(0, shade(skin, 0.14)); hg.addColorStop(1, shade(skin, -0.12));
  outlined(c, hg, () => { c.beginPath(); c.ellipse(0.5, -44 + hb, 8.2, 8.6, 0, 0, Math.PI * 2); });
  outlined(c, shade(skin, -0.05), () => { c.beginPath(); c.ellipse(-7.2, -43.5 + hb, 1.6, 2.4, 0, 0, Math.PI * 2); }, 0.8); // ear
  // Face, turned three-quarters to the right.
  c.fillStyle = '#ffffff';
  for (const ex of [0.5, 5.2]) { c.beginPath(); c.ellipse(ex, -44 + hb, 1.7, 2, 0, 0, Math.PI * 2); c.fill(); }
  c.fillStyle = '#1b1310';
  for (const ex of [1.1, 5.8]) { c.beginPath(); c.arc(ex, -43.8 + hb, 1.05, 0, Math.PI * 2); c.fill(); }
  c.strokeStyle = '#1b1310'; c.lineWidth = 0.8;
  for (const ex of [0.5, 5.2]) { c.beginPath(); c.moveTo(ex - 1.6, -47.2 + hb); c.lineTo(ex + 1.6, -47.6 + hb); c.stroke(); } // brows
  c.strokeStyle = shade(skin, -0.45); c.lineWidth = 0.9; c.beginPath(); c.arc(3.4, -40.6 + hb, 2.1, 0.2, Math.PI - 0.4); c.stroke(); // smile
  c.fillStyle = rgba('#e0605a', 0.25); c.beginPath(); c.arc(-1.5, -41.5 + hb, 1.6, 0, Math.PI * 2); c.fill(); // cheek
  // Headwear and hair.
  switch (a.headwear) {
    case 'none':
      outlined(c, '#1b1512', () => { c.beginPath(); c.ellipse(0.2, -47.5 + hb, 8.6, 5.6, 0, Math.PI, 0); c.closePath(); }); break;
    case 'braids':
      outlined(c, '#1b1512', () => { c.beginPath(); c.ellipse(0.2, -47.5 + hb, 8.8, 6, 0, Math.PI, 0); c.closePath(); });
      for (const bx of [-7.5, -5.2]) outlined(c, '#241c18', () => { roundRect(c, bx, -47 + hb, 2.4, 17, 1.2); }, 0.7);
      break;
    case 'fila':
      outlined(c, '#1b1512', () => { c.beginPath(); c.ellipse(0.2, -47 + hb, 8.4, 5, 0, Math.PI, 0); c.closePath(); });
      outlined(c, OUTFIT_COLORS.adire.hex, () => { c.beginPath(); c.moveTo(-8.5, -48 + hb); c.lineTo(8.5, -49 + hb); c.lineTo(10.5, -58 + hb); c.quadraticCurveTo(0, -60 + hb, -6, -55 + hb); c.closePath(); });
      c.fillStyle = rgba('#fff', 0.5); c.fillRect(-7.5, -51 + hb, 15, 1.1);
      break;
    case 'cap':
      outlined(c, '#c4552d', () => { c.beginPath(); c.ellipse(0.2, -48.5 + hb, 8.6, 6.2, 0, Math.PI, 0); c.closePath(); });
      outlined(c, shade('#c4552d', -0.15), () => { roundRect(c, 3, -49.5 + hb, 10, 2.6, 1.2); }, 0.9);
      c.fillStyle = '#fff6e5'; c.beginPath(); c.arc(-1, -53 + hb, 1.2, 0, Math.PI * 2); c.fill();
      break;
    case 'gele': {
      const gc = OUTFIT_COLORS.palm.hex;
      outlined(c, gc, () => { c.beginPath(); c.ellipse(0, -51 + hb, 11, 6.5, -0.1, 0, Math.PI * 2); });
      outlined(c, shade(gc, -0.12), () => { c.beginPath(); c.moveTo(-4, -55 + hb); c.quadraticCurveTo(4, -68 + hb, 13, -60 + hb); c.quadraticCurveTo(7, -57 + hb, 3, -53 + hb); c.closePath(); });
      outlined(c, shade(gc, 0.1), () => { c.beginPath(); c.moveTo(-10, -52 + hb); c.quadraticCurveTo(-14, -60 + hb, -6, -61 + hb); c.quadraticCurveTo(-4, -56 + hb, -3, -53 + hb); c.closePath(); });
      c.strokeStyle = rgba('#8a5a10', 0.55); c.lineWidth = 0.6;
      for (let i = 0; i < 3; i++) { c.beginPath(); c.arc(0, -50 + hb + i * 1.5, 8 - i, Math.PI * 1.1, Math.PI * 1.9); c.stroke(); }
      break;
    }
  }
  // Front arm last.
  arm(7.5, -pose.arm, false);
}

/** Paint (once) the sprite sheet for this avatar, with its walk and idle animations. */
export function installAvatar(scene: Phaser.Scene, a: AvatarSelection): string {
  const key = avatarKey(a);
  if (scene.textures.exists(key)) return key;
  const { w, h, ax, ay } = AVATAR_FRAME;
  const t = scene.textures.createCanvas(key, w * RES * AVATAR_FRAMES.length, h * RES)!;
  const c = t.getContext();
  AVATAR_FRAMES.forEach((f, i) => {
    c.save();
    c.translate((i * w + ax) * RES, ay * RES); c.scale(RES, RES);
    paintFrame(c, a, POSES[f]);
    c.restore();
    t.add(f, 0, i * w * RES, 0, w * RES, h * RES);
  });
  t.refresh();
  if (!scene.anims.exists(`${key}-walk`)) scene.anims.create({ key: `${key}-walk`, frames: ['walk0', 'walk1', 'walk2', 'walk3'].map((frame) => ({ key, frame })), frameRate: 9, repeat: -1 });
  if (!scene.anims.exists(`${key}-idle`)) scene.anims.create({ key: `${key}-idle`, frames: ['idle0', 'idle1'].map((frame) => ({ key, frame })), frameRate: 1.6, repeat: -1 });
  return key;
}
