import * as Phaser from 'phaser';
import type { AvatarSelection } from '@/types/player';
import type { Direction, LocalPlayerState, RemotePlayerView } from '@/types/game';
import { Smoother } from '@/features/multiplayer/motion';
import type { GameBus } from '../events';
import { depthOf, gridToScreen, moveWithCollision, screenDirToGrid } from '../iso/isoMath';
import { BUILDINGS, INTERACTABLES, LOCATION_ID, MAP_H, MAP_W, PROPS, SPAWN, buildBlockedSet, isBlockedFn, tileAt, type BuildingDef, type InteractableDef } from '../world/starterArea';
import { TILE_COLORS, hex } from '../render/colors';
import { drawBuilding, drawProp } from '../render/buildings';
import { tile } from '../render/isoDraw';
import { PlayerAvatar } from '../entities/PlayerAvatar';

export interface SceneOptions {
  avatar: AvatarSelection;
  characterName: string;
  bus: GameBus;
}

const SPEED = 3.4; // tiles per second
const RADIUS = 0.28; // player collision radius in tiles

/** Another player's character: drawn from multiplayer updates, never controlled locally. */
interface RemoteAvatar { avatar: PlayerAvatar; motion: Smoother; facing: LocalPlayerState['facing']; moving: boolean }

/** Kuto street corner: floor, buildings, props, a controllable player and interaction spots. */
export class StarterAreaScene extends Phaser.Scene {
  private opts: SceneOptions;
  private player!: PlayerAvatar;
  private pos = { ...SPAWN };
  private isBlocked = isBlockedFn(buildBlockedSet());
  private keys!: Record<'up' | 'down' | 'left' | 'right' | 'w' | 'a' | 's' | 'd' | 'e' | 'space' | 'enter', Phaser.Input.Keyboard.Key>;
  private touch: Record<Direction, boolean> = { up: false, down: false, left: false, right: false };
  private buildings: { def: BuildingDef; obj: Phaser.GameObjects.Container }[] = [];
  private markers = new Map<string, Phaser.GameObjects.Graphics>();
  private nearby: InteractableDef | null = null;
  private paused = false;
  private facing: LocalPlayerState['facing'] = 'right';
  private remotes = new Map<string, RemoteAvatar>();
  private unsubscribe: (() => void)[] = [];

  constructor(opts: SceneOptions) {
    super('starter-area');
    this.opts = opts;
  }

  create() {
    this.drawFloor();
    for (const def of BUILDINGS) this.buildings.push({ def, obj: drawBuilding(this, def) });
    for (const p of PROPS) {
      const s = gridToScreen(p.x + 0.5, p.y + 0.5);
      drawProp(this, p).setPosition(s.x, s.y).setDepth(depthOf(p.x + 0.5, p.y + 0.5));
    }
    for (const it of INTERACTABLES) this.markers.set(it.id, this.drawMarker(it));

    this.player = new PlayerAvatar(this, this.opts.avatar, this.opts.characterName);
    this.placePlayer();

    // Camera: follow the player within the map bounds.
    const corners = [gridToScreen(0, 0), gridToScreen(MAP_W, 0), gridToScreen(0, MAP_H), gridToScreen(MAP_W, MAP_H)];
    const minX = Math.min(...corners.map((c) => c.x)); const maxX = Math.max(...corners.map((c) => c.x));
    const minY = Math.min(...corners.map((c) => c.y)); const maxY = Math.max(...corners.map((c) => c.y));
    this.cameras.main.setBounds(minX - 120, minY - 220, maxX - minX + 240, maxY - minY + 320);
    this.cameras.main.startFollow(this.player.container, true, 0.12, 0.12);
    this.cameras.main.setZoom(this.scale.width < 640 ? 0.9 : 1.15);
    this.scale.on('resize', (size: Phaser.Structs.Size) => this.cameras.main.setZoom(size.width < 640 ? 0.9 : 1.15));

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
    );
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.unsubscribe.forEach((u) => u());
      for (const id of [...this.remotes.keys()]) this.removeRemote(id);
    });
    world.emit('ready', { locationId: LOCATION_ID });
  }

  private drawFloor() {
    const g = this.add.graphics().setDepth(-1000);
    for (let x = 0; x < MAP_W; x++) for (let y = 0; y < MAP_H; y++) {
      const kind = tileAt(x, y);
      const [a, b] = TILE_COLORS[kind];
      tile(g, x, y, (x + y) % 2 ? a : b);
    }
    // road markings
    g.fillStyle(hex('#f2b632'));
    for (let x = 0; x < MAP_W; x += 2) {
      const p = gridToScreen(x + 0.5, 10);
      g.fillRect(p.x - 8, p.y - 1, 16, 2);
    }
  }

  private drawMarker(it: InteractableDef) {
    const s = gridToScreen(it.x, it.y);
    const g = this.add.graphics().setPosition(s.x, s.y).setDepth(depthOf(it.x, it.y) - 0.5);
    g.lineStyle(2, hex('#f2b632'), 0.9); g.strokeEllipse(0, 0, 34, 16);
    g.fillStyle(hex('#f2b632'), 0.18); g.fillEllipse(0, 0, 34, 16);
    this.tweens.add({ targets: g, alpha: { from: 0.45, to: 1 }, duration: 800, yoyo: true, repeat: -1 });
    return g;
  }

  private placePlayer() {
    const s = gridToScreen(this.pos.x, this.pos.y);
    this.player.container.setPosition(s.x, s.y).setDepth(depthOf(this.pos.x, this.pos.y));
  }

  /** Show another player. A second join for the same id replaces the old sprite (never duplicates). */
  private addRemote(r: RemotePlayerView) {
    this.removeRemote(r.id);
    const avatar = new PlayerAvatar(this, r.avatar, r.name, { remote: true });
    avatar.face(r.facing === 'left' ? -1 : 1);
    this.remotes.set(r.id, { avatar, motion: new Smoother(r.x, r.y), facing: r.facing, moving: r.moving });
    this.placeRemote(this.remotes.get(r.id)!);
  }

  private removeRemote(id: string) {
    this.remotes.get(id)?.avatar.destroy();
    this.remotes.delete(id);
  }

  private placeRemote(r: RemoteAvatar) {
    const s = gridToScreen(r.motion.x, r.motion.y);
    r.avatar.container.setPosition(s.x, s.y).setDepth(depthOf(r.motion.x, r.motion.y));
  }

  private interact() {
    if (this.paused || !this.nearby) return;
    const { x: _x, y: _y, radius: _r, ...target } = this.nearby;
    this.opts.bus.world.emit('interaction:triggered', target);
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
    if (moving) {
      this.pos = moveWithCollision(this.pos, { x: dir.x * SPEED * dt, y: dir.y * SPEED * dt }, RADIUS, this.isBlocked);
      this.placePlayer();
    }
    this.player.animate(dt, moving, dx);
    if (dx !== 0) this.facing = dx < 0 ? 'left' : 'right';
    // Multiplayer reads this every frame and decides itself when to send.
    this.opts.bus.world.emit('player:state', { x: this.pos.x, y: this.pos.y, facing: this.facing, moving });

    // Other players: glide towards their last reported position. Their updates never touch this.pos.
    for (const r of this.remotes.values()) {
      r.motion.step(dt);
      this.placeRemote(r);
      r.avatar.animate(dt, r.moving, r.facing === 'left' ? -1 : 1);
      if (!r.moving) r.avatar.face(r.facing === 'left' ? -1 : 1);
    }
    this.sortBuildings();
    this.checkInteractions();
  }

  /** Buildings draw behind the player unless the player is behind them (north or west). */
  private sortBuildings() {
    const pd = depthOf(this.pos.x, this.pos.y);
    for (const { def, obj } of this.buildings) {
      const inFront = this.pos.x >= def.x + def.w || this.pos.y >= def.y + def.d;
      obj.setDepth(inFront ? pd - 2 : pd + 2);
    }
  }

  private checkInteractions() {
    let best: InteractableDef | null = null; let bestD = Infinity;
    for (const it of INTERACTABLES) {
      const d = Math.hypot(this.pos.x - it.x, this.pos.y - it.y);
      if (d <= it.radius && d < bestD) { best = it; bestD = d; }
    }
    if (best?.id === this.nearby?.id) return;
    this.nearby = best;
    if (best) { const { x: _x, y: _y, radius: _r, ...target } = best; this.opts.bus.world.emit('interaction:available', target); }
    else this.opts.bus.world.emit('interaction:available', null);
  }
}
