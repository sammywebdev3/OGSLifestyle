import * as Phaser from 'phaser';
import type { AvatarSelection } from '@/types/player';
import type { Direction, InteractionTarget, LocalPlayerState, PlotView, RemotePlayerView } from '@/types/game';
import { Smoother } from '@/features/multiplayer/motion';
import { BubbleTracker, EMOTE_RANGE, INTERACT_RADIUS, clampBubble, nearestWithin, withinRange, type BubbleKind } from '@/features/multiplayer/bubbles';
import { EMOTES } from '@/features/multiplayer/chat';
import type { GameBus } from '../events';
import { gridToScreen, moveWithCollision, screenDirToGrid } from '../iso/isoMath';
import { characterDepth, staticRanks, type Footprint, type SortItem } from '../iso/depthSort';
import { BUILDINGS, DECOR, INTERACTABLES, LOCATION_ID, MAP_H, MAP_W, PROPS, SPAWN, buildBlockedSet, isBlockedFn, type InteractableDef } from '../world/starterArea';
import { BACKDROP_BUILDINGS, OUTSKIRT_SCENERY } from '../world/scenery';
import { hex } from '../render/colors';
import { baseZoom } from '../render/viewport';
import { PLOT_TARGET_PREFIX } from '@/features/land/plots';
import { fillPoly, isoPoint, strokePoly } from '../render/isoDraw';
import { PlayerAvatar, NAME_TAG_LIFT } from '../entities/PlayerAvatar';
import { LabAvatar } from '../characterLab/LabAvatar';
import { DemoWalker } from '../characterLab/demoWalker';
import { LAB_LOOKS, labCharacterFor, type LabLookId, type LabQuality } from '../characterLab/prototype';
import { LabAtlasLoader } from '../characterLab/atlasLoader';
import { demoCast } from '../characterLab/demoCast';
import { RES } from '../art/canvasIso';
import { GROUND_KEY, GROUND_OFFSET, installGround } from '../art/groundArt';
import { OUTSKIRTS, groundFrame, insideMap } from '../art/groundLayout';
import { addBuilding, installBuilding, releaseShadow, shadowStamp } from '../art/buildingArt';
import { addProp, installProps, type ArtKind } from '../art/propArt';

export interface SceneOptions {
  avatar: AvatarSelection;
  characterName: string;
  bus: GameBus;
  /**
   * Character lab (prototype, off unless enabled for a test build): '3d' draws everyone with the pre-rendered
   * 3D characters, 'painted' keeps the current characters; both add the same scripted walkers, for comparison.
   */
  characterLab?: '3d' | 'painted';
  /** Character lab atlas quality ('sd' for low-memory phones). */
  labQuality?: LabQuality;
  /** Character lab cast: add the layered mixes, and/or repeat the cast up to `count` walkers (stress tests). */
  labCast?: { mix?: boolean; count?: number };
}

type Avatar = PlayerAvatar | LabAvatar;

const SPEED = 3.4; // tiles per second
const RADIUS = 0.28; // player collision radius in tiles

/** Another player's character: drawn from multiplayer updates, never controlled locally. */
interface RemoteAvatar { name: string; avatar: Avatar; motion: Smoother; facing: LocalPlayerState['facing']; moving: boolean }

/** Speech/emote bubble drawn above a character ("self" = the local player). */
interface BubbleView { container: Phaser.GameObjects.Container; width: number; height: number }
const SELF = 'self';
/** Bubble bottom edge, in pixels above the character's feet (clears the name tag). */
const BUBBLE_LIFT = NAME_TAG_LIFT + 20;

/** Plot colours by status: fill, outline, label background. */
const PLOT_STYLE: Record<PlotView['status'], { fill: string; line: string; tag: string; text: string }> = {
  'for-sale': { fill: '#f2b632', line: '#f2b632', tag: '#b98207', text: 'FOR SALE' },
  mine: { fill: '#2fb36f', line: '#12935a', tag: '#0b5e3a', text: 'YOURS' },
  owned: { fill: '#8d9be0', line: '#3a4fb0', tag: '#1f2f6b', text: 'SOLD' },
  unknown: { fill: '#f4ead2', line: '#f4ead2', tag: '#111a3d', text: 'PLOT' },
};

/** Kuto street corner: floor, buildings, props, a controllable player and interaction spots. */
export class StarterAreaScene extends Phaser.Scene {
  private opts: SceneOptions;
  private player!: Avatar;
  private demoWalkers = new Map<string, DemoWalker>();
  private labLoader: LabAtlasLoader | null = null;
  private labLooks = new Map<string, LabLookId>();
  private pos = { ...SPAWN };
  private isBlocked = isBlockedFn(buildBlockedSet());
  private keys!: Record<'up' | 'down' | 'left' | 'right' | 'w' | 'a' | 's' | 'd' | 'e' | 'space' | 'enter', Phaser.Input.Keyboard.Key>;
  private touch: Record<Direction, boolean> = { up: false, down: false, left: false, right: false };
  /** Everything that stands up from the ground, in draw order (see iso/depthSort). */
  private statics: (SortItem & { obj: Phaser.GameObjects.Image | Phaser.GameObjects.Graphics })[] = [];
  private ranks: number[] = [];
  /** What the camera can ever show (world px): the ground is painted for exactly this area. */
  private view = { x: 0, y: 0, w: 0, h: 0 };
  private markers = new Map<string, Phaser.GameObjects.Graphics>();
  private paused = false;
  private facing: LocalPlayerState['facing'] = 'right';
  private remotes = new Map<string, RemoteAvatar>();
  private bubbles = new BubbleTracker();
  private bubbleViews = new Map<string, BubbleView>();
  private bubbleSerial = 0;
  private nearbyId: string | null = null;
  private plots: PlotView[] = [];
  private plotObjects: Phaser.GameObjects.GameObject[] = [];
  /** Plot labels: a short tag from afar, the full status when you walk close. */
  private plotLabels: { plot: PlotView; text: Phaser.GameObjects.Text; near: boolean }[] = [];
  private nearbyTarget: InteractionTarget | null = null;
  private unsubscribe: (() => void)[] = [];

  constructor(opts: SceneOptions) {
    super('starter-area');
    this.opts = opts;
  }

  preload() {
    if (this.opts.characterLab !== '3d') return;
    // Only the local player's character loads before the world appears; everyone else's loads when they show up.
    this.labLoader = new LabAtlasLoader(this, this.opts.labQuality ?? 'hd');
    this.labLoader.request(LAB_LOOKS[labCharacterFor(this.opts.avatar)].atlases);
  }

  /** The painted character, or in the character lab the pre-rendered 3D one (local and remote alike). */
  private makeAvatar(avatar: AvatarSelection, name: string, opts: { remote?: boolean; look?: LabLookId } = {}): Avatar {
    if (this.opts.characterLab !== '3d' || !this.labLoader) return new PlayerAvatar(this, avatar, name, opts);
    const look = LAB_LOOKS[opts.look ?? labCharacterFor(avatar)];
    return new LabAvatar(this, look, name, { remote: opts.remote, quality: this.opts.labQuality, loader: this.labLoader });
  }

  create() {
    // All art is painted once into textures here (no image files to download), then drawn as quads.
    const corners = [gridToScreen(0, 0), gridToScreen(MAP_W, 0), gridToScreen(0, MAP_H), gridToScreen(MAP_W, MAP_H)];
    const minX = Math.min(...corners.map((c) => c.x)); const maxX = Math.max(...corners.map((c) => c.x));
    const minY = Math.min(...corners.map((c) => c.y)); const maxY = Math.max(...corners.map((c) => c.y));
    this.view = { x: minX - 160, y: minY - 240, w: maxX - minX + 320, h: maxY - minY + 360 };

    installGround(this);
    installProps(this);
    for (const def of BACKDROP_BUILDINGS) installBuilding(this, def, { backdrop: true });
    for (const def of BUILDINGS) installBuilding(this, def);
    this.drawFloor();
    const tile = (x: number, y: number): Footprint => ({ x0: x, y0: y, x1: x + 1, y1: y + 1 });
    for (const def of [...BACKDROP_BUILDINGS, ...BUILDINGS]) this.addStatic({ x0: def.x, y0: def.y, x1: def.x + def.w, y1: def.y + def.d }, addBuilding(this, def));
    for (const p of PROPS) this.addStatic(tile(p.x, p.y), this.placeArt(p.kind, p.x, p.y));
    for (const d of DECOR) this.addStatic(tile(d.x, d.y), this.placeArt(d.kind, d.x, d.y));
    for (const o of OUTSKIRT_SCENERY) this.addStatic(tile(o.x, o.y), this.placeArt(o.kind, o.x, o.y));
    for (const it of INTERACTABLES) this.markers.set(it.id, this.drawMarker(it));
    this.ranks = staticRanks(this.statics);
    this.statics.forEach((st, i) => st.obj.setDepth(this.ranks[i]!));

    this.player = this.makeAvatar(this.opts.avatar, this.opts.characterName);
    this.placePlayer();
    if (this.opts.characterLab) this.addDemoWalkers();

    // Camera: follow the player within the map (plus a margin of outskirts).
    this.cameras.main.setBounds(this.view.x, this.view.y, this.view.w, this.view.h);
    this.cameras.main.startFollow(this.player.container, true, 0.12, 0.12);
    // The canvas is rendered at renderScale × CSS pixels (see createGame), so zoom by the same factor.
    const rs = (this.registry.get('renderScale') as number | undefined) ?? 1;
    const zoomFor = (gameWidth: number) => baseZoom(gameWidth / rs) * rs;
    this.cameras.main.setZoom(zoomFor(this.scale.width));
    this.scale.on('resize', (size: Phaser.Structs.Size) => this.cameras.main.setZoom(zoomFor(size.width)));

    // Keyboard: arrows or WASD to move, E / Space / Enter to interact.
    const kb = this.input.keyboard!;
    this.keys = kb.addKeys({ up: 'UP', down: 'DOWN', left: 'LEFT', right: 'RIGHT', w: 'W', a: 'A', s: 'S', d: 'D', e: 'E', space: 'SPACE', enter: 'ENTER' }) as typeof this.keys;
    for (const k of ['e', 'space', 'enter'] as const) this.keys[k].on('down', () => this.interact());

    // Touch / UI controls arrive over the bus.
    const { ui, world } = this.opts.bus;
    this.unsubscribe.push(
      ui.on('input:direction', ({ direction, pressed }) => { this.touch[direction] = pressed; }),
      ui.on('input:interact', () => this.interact()),
      ui.on('world:pause', (p) => { this.paused = p; if (p) this.touch = { up: false, down: false, left: false, right: false }; }),
      ui.on('remote:join', (r) => this.addRemote(r)),
      ui.on('remote:move', ({ id, x, y, facing, moving }) => {
        const r = this.remotes.get(id);
        if (!r) return;
        r.motion.setTarget(x, y); r.facing = facing; r.moving = moving;
      }),
      ui.on('remote:leave', ({ id }) => this.removeRemote(id)),
      ui.on('bubble:chat', ({ id, text }) => this.showBubble(id, 'chat', text)),
      ui.on('bubble:emote', ({ id, emote }) => {
        // Emotes are for players nearby: remote ones from far away are not shown.
        const r = this.remotes.get(id);
        if (id !== SELF && (!r || !withinRange(r.motion, this.pos, EMOTE_RANGE))) return;
        this.showBubble(id, 'emote', EMOTES[emote].icon);
      }),
      ui.on('land:plots', (plots) => this.setPlots(plots)),
      ui.on('input:typing', (typing) => {
        const kb = this.input.keyboard;
        if (!kb) return;
        kb.enabled = !typing;
        if (typing) { kb.disableGlobalCapture(); kb.resetKeys(); this.touch = { up: false, down: false, left: false, right: false }; }
        else kb.enableGlobalCapture();
      }),
    );
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.unsubscribe.forEach((u) => u());
      for (const id of [...this.remotes.keys()]) this.removeRemote(id);
      this.hideBubble(SELF);
      this.setPlots([]);
    });
    world.emit('ready', { locationId: LOCATION_ID });
  }

  /**
   * The ground. Tiles are laid with a Blitter (overhanging grass tufts layered back to front), the
   * buildings' soft shadows are laid over them, and the result is painted once into a few chunk textures covering exactly what the camera can show, so at run time
   * every screen pixel of ground is drawn once. Chunks are sized to the render scale (sharp on HiDPI
   * phones) and at most 1024 px a side, which every phone GPU accepts.
   */
  private drawFloor() {
    const rs = (this.registry.get('renderScale') as number | undefined) ?? 1;
    const tiles = this.make.blitter({ key: GROUND_KEY }, false);
    const v = this.view;
    const reach = 40; // grid range to scan; only tiles whose picture touches the view are laid
    for (let s = -2 * reach; s <= 2 * reach + MAP_W + MAP_H; s++) { // back to front, so tufts layer correctly
      for (let x = -reach; x < MAP_W + reach; x++) {
        const y = s - x;
        if (y < -reach || y >= MAP_H + reach) continue;
        const p = gridToScreen(x, y);
        if (p.x + 40 < v.x || p.x - 40 > v.x + v.w || p.y + 40 < v.y || p.y - 8 > v.y + v.h) continue;
        const bob = tiles.create((p.x + GROUND_OFFSET.x) * RES, (p.y + GROUND_OFFSET.y) * RES, groundFrame(x, y));
        if (!insideMap(x, y)) { // the outskirts dim and cool towards the haze
          const out = Math.max(-x, -y, x - MAP_W + 1, y - MAP_H + 1, 0);
          const k = Math.min(1, out / OUTSKIRTS);
          const c = Math.round(255 - 70 * k); const b = Math.round(255 - 40 * k);
          bob.setTint((c << 16) | (c << 8) | b);
        }
      }
    }
    const shadows = [...BACKDROP_BUILDINGS, ...BUILDINGS].map((b) => {
      const st = shadowStamp(this, b);
      return { img: this.make.image({ key: st.key, origin: 0 }, false), x: st.x, y: st.y };
    });
    const chunk = Math.floor(1024 / rs) - 2; // world px per chunk; +2 overlap hides seams
    let n = 0;
    for (let cy = v.y; cy < v.y + v.h; cy += chunk) for (let cx = v.x; cx < v.x + v.w; cx += chunk) {
      const w = Math.min(chunk + 2, v.x + v.w - cx); const h = Math.min(chunk + 2, v.y + v.h - cy);
      const key = `osl-floor-${n++}`;
      if (this.textures.exists(key)) this.textures.remove(key);
      const dt = this.textures.addDynamicTexture(key, Math.ceil(w * rs), Math.ceil(h * rs))!;
      // A Blitter ignores its own scale, so scale with the texture's camera instead (bobs are at RES px per world px).
      dt.camera.setOrigin(0, 0).setZoom(rs / RES);
      dt.draw(tiles, -cx * RES, -cy * RES);
      for (const sh of shadows) dt.draw(sh.img, (sh.x - cx) * RES, (sh.y - cy) * RES);
      this.add.image(cx, cy, key).setOrigin(0).setScale(1 / rs).setDepth(-1000);
    }
    tiles.destroy();
    for (const sh of shadows) sh.img.destroy();
    for (const b of [...BACKDROP_BUILDINGS, ...BUILDINGS]) releaseShadow(this, b);
  }

  private addStatic(fp: Footprint, obj: Phaser.GameObjects.Image | Phaser.GameObjects.Graphics, box?: SortItem['box']) {
    const b = box ?? (() => { const r = (obj as Phaser.GameObjects.Image).getBounds(); return { x: r.x, y: r.y, w: r.width, h: r.height }; })();
    this.statics.push({ fp, box: b, obj });
  }

  /** A prop, piece of decor or scenery standing on tile (x, y). Palms and trees sway a little. */
  private placeArt(kind: ArtKind, x: number, y: number) {
    const s = gridToScreen(x + 0.5, y + 0.5);
    const img = addProp(this, kind, s.x, s.y);
    if (kind === 'palm' || kind === 'tree') {
      this.tweens.add({ targets: img, angle: { from: -1.2, to: 1.2 }, duration: 2600 + ((x * 7 + y * 13) % 9) * 180, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    }
    return img;
  }

  /** A glowing ring on the ground with a bobbing chevron: "something to do here". */
  private drawMarker(it: InteractableDef) {
    const s = gridToScreen(it.x, it.y);
    const ring = this.add.graphics();
    ring.fillStyle(hex('#f2b632'), 0.16); ring.fillEllipse(0, 0, 40, 19);
    ring.lineStyle(2, hex('#ffd978'), 0.95); ring.strokeEllipse(0, 0, 34, 16);
    ring.lineStyle(1, hex('#fff6e5'), 0.6); ring.strokeEllipse(0, 0, 24, 11);
    const chevron = this.add.graphics();
    chevron.fillStyle(0x000000, 0.25); chevron.fillTriangle(-6, -1, 7, -1, 0.5, 8);
    chevron.fillStyle(hex('#ffd978'), 1); chevron.fillTriangle(-6, -3, 6, -3, 0, 5);
    chevron.lineStyle(1.2, hex('#2a1d1b'), 0.8); chevron.strokeTriangle(-6, -3, 6, -3, 0, 5);
    // The ring lies on the ground (under everything standing); the chevron is sorted like a thin post on the spot.
    ring.setPosition(s.x, s.y).setDepth(-990);
    chevron.setPosition(s.x, s.y - 30);
    this.addStatic({ x0: it.x, y0: it.y, x1: it.x, y1: it.y }, chevron, { x: s.x - 8, y: s.y - 36, w: 16, h: 16 });
    this.tweens.add({ targets: ring, alpha: { from: 0.55, to: 1 }, scaleX: { from: 0.94, to: 1.04 }, scaleY: { from: 0.94, to: 1.04 }, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    this.tweens.add({ targets: chevron, y: { from: s.y - 30, to: s.y - 24 }, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    return ring;
  }

  /** Draw the land plots on the ground (replacing the previous set). Purely visual. */
  private setPlots(plots: PlotView[]) {
    this.plotObjects.forEach((o) => o.destroy());
    this.plotObjects = [];
    this.plotLabels = [];
    this.plots = plots.filter((p) => p.x >= 0 && p.y >= 0 && p.w > 0 && p.d > 0 && p.x + p.w <= MAP_W && p.y + p.d <= MAP_H);
    for (const p of this.plots) {
      const style = PLOT_STYLE[p.status];
      const corners = [isoPoint(p.x, p.y), isoPoint(p.x + p.w, p.y), isoPoint(p.x + p.w, p.y + p.d), isoPoint(p.x, p.y + p.d)];
      const inner = [isoPoint(p.x + 0.12, p.y + 0.12), isoPoint(p.x + p.w - 0.12, p.y + 0.12), isoPoint(p.x + p.w - 0.12, p.y + p.d - 0.12), isoPoint(p.x + 0.12, p.y + p.d - 0.12)];
      const g = this.add.graphics().setDepth(-999);
      fillPoly(g, style.fill, corners, p.status === 'mine' ? 0.32 : 0.2);
      strokePoly(g, style.line, inner, 2, 0.95);
      // Corner pegs, like a surveyed plot.
      g.fillStyle(hex('#fff6e5'), 0.95);
      for (const c of inner) g.fillRect(c.x - 2, c.y - 5, 4, 6);
      const c = gridToScreen(p.x + p.w / 2, p.y + p.d / 2);
      const label = this.add.text(c.x, c.y, p.key.slice(-2), {
        fontFamily: '"Trebuchet MS", "Segoe UI", sans-serif', fontSize: '9px', fontStyle: 'bold', color: '#fff6e5', backgroundColor: style.tag, padding: { x: 4, y: 2 }, resolution: 2,
      }).setOrigin(0.5).setDepth(-998).setAlpha(0.85);
      this.plotObjects.push(g, label);
      this.plotLabels.push({ plot: p, text: label, near: false });
    }
  }

  /**
   * Character lab: the cast strolls around the spawn point, through the remote-player path (never sent anywhere).
   * In the 'painted' comparison the same cast wears the closest painted look.
   */
  private addDemoWalkers() {
    const cast = demoCast(this.opts.labCast);
    const offsets: [number, number][] = [[1.2, 0.8], [-1.0, 1.1], [0.6, -1.2], [-0.4, 2.0], [1.8, -0.4], [-1.6, -0.6], [0.2, 1.6]];
    cast.forEach((m, i) => {
      let [ox, oy] = offsets[i % offsets.length]!;
      const ring = 1 + Math.floor(i / offsets.length) * 0.35;
      ox *= ring; oy *= ring;
      // Start on a free tile near the planned spot.
      for (let t = 0; t < 12 && this.isBlocked(Math.floor(SPAWN.x + ox), Math.floor(SPAWN.y + oy)); t++) { ox *= 0.8; oy *= 0.8; }
      const x = SPAWN.x + ox; const y = SPAWN.y + oy;
      this.labLooks.set(m.id, m.look);
      this.demoWalkers.set(m.id, new DemoWalker(x, y, { x: SPAWN.x, y: SPAWN.y }));
      this.addRemote({ id: m.id, name: m.name, avatar: m.painted, x, y, facing: 'right', moving: false });
    });
  }

  private placePlayer() {
    const s = gridToScreen(this.pos.x, this.pos.y);
    this.player.container.setPosition(s.x, s.y).setDepth(this.characterDepthAt(this.pos.x, this.pos.y, s.x, s.y));
  }

  /** Show another player. A second join for the same id replaces the old sprite (never duplicates). */
  private addRemote(r: RemotePlayerView) {
    this.removeRemote(r.id);
    const avatar = this.makeAvatar(r.avatar, r.name, { remote: true, look: this.labLooks.get(r.id) });
    avatar.face(r.facing === 'left' ? -1 : 1);
    this.remotes.set(r.id, { name: r.name, avatar, motion: new Smoother(r.x, r.y), facing: r.facing, moving: r.moving });
    this.placeRemote(this.remotes.get(r.id)!);
  }

  private removeRemote(id: string) {
    this.hideBubble(id); // a player who leaves takes their bubble with them
    this.remotes.get(id)?.avatar.destroy();
    this.remotes.delete(id);
  }

  /** Draw (or replace) the bubble above a character. Text is drawn by Phaser: never HTML. */
  private showBubble(ownerId: string, kind: BubbleKind, content: string) {
    if (ownerId !== SELF && !this.remotes.has(ownerId)) return;
    const bubble = this.bubbles.show(ownerId, kind, content, this.time.now);
    this.bubbleViews.get(ownerId)?.container.destroy(true);
    const text = this.add.text(0, 0, bubble.lines.join('\n'), {
      fontFamily: '"Trebuchet MS", "Segoe UI", sans-serif', fontSize: kind === 'emote' ? '22px' : '12px', color: '#111a3d', align: 'center', lineSpacing: 2, resolution: 2,
    }).setOrigin(0.5, 1);
    const width = Math.ceil(text.width) + 16;
    const height = Math.ceil(text.height) + 10;
    const g = this.add.graphics();
    g.fillStyle(hex('#fff6e5'), 0.97);
    g.lineStyle(1.5, hex('#111a3d'), 0.3);
    g.fillRoundedRect(-width / 2, -height - 6, width, height, 8);
    g.strokeRoundedRect(-width / 2, -height - 6, width, height, 8);
    g.fillTriangle(-6, -7, 6, -7, 0, 0); // tail pointing at the speaker
    text.setPosition(0, -11);
    // Newest bubble on top when characters overlap; always above the world.
    const container = this.add.container(0, 0, [g, text]).setDepth(100_000 + ++this.bubbleSerial);
    this.bubbleViews.set(ownerId, { container, width, height: height + 6 });
    this.placeBubble(ownerId);
  }

  private hideBubble(ownerId: string) {
    this.bubbles.remove(ownerId);
    this.bubbleViews.get(ownerId)?.container.destroy(true);
    this.bubbleViews.delete(ownerId);
  }

  /** Follow the speaker, but stay inside the camera view. */
  private placeBubble(ownerId: string) {
    const view = this.bubbleViews.get(ownerId);
    const anchor = ownerId === SELF ? this.player.container : this.remotes.get(ownerId)?.avatar.container;
    if (!view || !anchor) return;
    const cam = this.cameras.main.worldView;
    const p = clampBubble(anchor.x, anchor.y - BUBBLE_LIFT, view.width, view.height, { x: cam.x, y: cam.y, width: cam.width, height: cam.height });
    view.container.setPosition(p.x, p.y);
  }

  private updateBubbles() {
    for (const id of this.bubbles.expire(this.time.now)) {
      this.bubbleViews.get(id)?.container.destroy(true);
      this.bubbleViews.delete(id);
    }
    for (const id of this.bubbleViews.keys()) this.placeBubble(id);
  }

  /** Tell the UI when another player comes within reach (or nobody is). Positions are cosmetic only. */
  private updateProximity() {
    const others = [...this.remotes].map(([id, r]) => ({ id, name: r.name, x: r.motion.x, y: r.motion.y }));
    const near = nearestWithin(this.pos, others, INTERACT_RADIUS);
    if ((near?.id ?? null) === this.nearbyId) return;
    this.nearbyId = near?.id ?? null;
    this.opts.bus.world.emit('proximity', near ? { id: near.id, name: near.name } : null);
  }

  private placeRemote(r: RemoteAvatar) {
    const s = gridToScreen(r.motion.x, r.motion.y);
    r.avatar.container.setPosition(s.x, s.y).setDepth(this.characterDepthAt(r.motion.x, r.motion.y, s.x, s.y));
  }

  private interact() {
    if (this.paused || !this.nearbyTarget) return;
    this.opts.bus.world.emit('interaction:triggered', this.nearbyTarget);
  }

  update(_time: number, deltaMs: number) {
    const dt = Math.min(deltaMs, 50) / 1000;
    const k = this.keys;
    let dx = 0; let dy = 0;
    if (!this.paused) {
      if (k.left.isDown || k.a.isDown || this.touch.left) dx -= 1;
      if (k.right.isDown || k.d.isDown || this.touch.right) dx += 1;
      if (k.up.isDown || k.w.isDown || this.touch.up) dy -= 1;
      if (k.down.isDown || k.s.isDown || this.touch.down) dy += 1;
    }
    const dir = screenDirToGrid(dx, dy);
    const moving = dir.x !== 0 || dir.y !== 0;
    const before = gridToScreen(this.pos.x, this.pos.y);
    if (moving) {
      this.pos = moveWithCollision(this.pos, { x: dir.x * SPEED * dt, y: dir.y * SPEED * dt }, RADIUS, this.isBlocked);
      this.placePlayer();
    }
    const after = gridToScreen(this.pos.x, this.pos.y);
    // Facing comes from the actual screen movement (sliding along a wall faces along the wall).
    this.player.animate(dt, moving, after.x - before.x || dx, after.y - before.y);
    if (dx !== 0) this.facing = dx < 0 ? 'left' : 'right';
    // Multiplayer reads this every frame and decides itself when to send.
    this.opts.bus.world.emit('player:state', { x: this.pos.x, y: this.pos.y, facing: this.facing, moving });

    // Other players: glide towards their last reported position. Their updates never touch this.pos.
    for (const [id, w] of this.demoWalkers) {
      const r = this.remotes.get(id);
      if (!r) continue;
      const p = w.step(dt, this.isBlocked);
      const sdx = gridToScreen(p.x, p.y).x - gridToScreen(r.motion.x, r.motion.y).x;
      if (Math.abs(sdx) > 0.01) r.facing = sdx < 0 ? 'left' : 'right'; // what the protocol would carry
      r.motion.setTarget(p.x, p.y); r.moving = p.moving;
    }
    for (const r of this.remotes.values()) {
      const from = gridToScreen(r.motion.x, r.motion.y);
      r.motion.step(dt);
      this.placeRemote(r);
      const to = gridToScreen(r.motion.x, r.motion.y);
      if (r.avatar instanceof LabAvatar) {
        // The protocol only says left or right; the 3D characters face their actual movement on screen.
        r.avatar.animate(dt, r.moving, to.x - from.x, to.y - from.y);
      } else {
        r.avatar.animate(dt, r.moving, r.facing === 'left' ? -1 : 1);
        if (!r.moving) r.avatar.face(r.facing === 'left' ? -1 : 1);
      }
    }
    this.updateBubbles();
    this.updateProximity();
    this.updatePlotLabels();
    this.checkInteractions();
  }

  /** Plot tags show just the number from afar, and the number with the status when you are close. */
  private updatePlotLabels() {
    for (const l of this.plotLabels) {
      const { plot } = l;
      const dx = Math.max(plot.x - this.pos.x, 0, this.pos.x - (plot.x + plot.w));
      const dy = Math.max(plot.y - this.pos.y, 0, this.pos.y - (plot.y + plot.d));
      const near = Math.hypot(dx, dy) < 2;
      if (near === l.near) continue;
      l.near = near;
      l.text.setText(near ? `${plot.key.slice(-2)} · ${PLOT_STYLE[plot.status].text}` : plot.key.slice(-2)).setAlpha(near ? 1 : 0.85);
    }
  }

  /** A character at grid (x, y), drawn at screen (sx, sy): slotted between the statics it overlaps. */
  private characterDepthAt(x: number, y: number, sx: number, sy: number) {
    return characterDepth(x, y, { x: sx - 14, y: sy - 82, w: 28, h: 84 }, this.statics, this.ranks);
  }

  private checkInteractions() {
    let best: InteractableDef | null = null; let bestD = Infinity;
    for (const it of INTERACTABLES) {
      const d = Math.hypot(this.pos.x - it.x, this.pos.y - it.y);
      if (d <= it.radius && d < bestD) { best = it; bestD = d; }
    }
    let target: InteractionTarget | null = null;
    if (best) { const { x: _x, y: _y, radius: _r, ...t } = best; target = t; }
    else {
      // Standing on a plot offers to look at it. This is a shortcut only: the server decides every purchase.
      const plot = this.plots.find((p) => this.pos.x >= p.x && this.pos.x < p.x + p.w && this.pos.y >= p.y && this.pos.y < p.y + p.d);
      if (plot) target = { id: `${PLOT_TARGET_PREFIX}${plot.key}`, label: plot.label, verb: 'View', description: '' };
    }
    if ((target?.id ?? null) === (this.nearbyTarget?.id ?? null) && target?.label === this.nearbyTarget?.label) return;
    this.nearbyTarget = target;
    this.opts.bus.world.emit('interaction:available', target);
  }
}
