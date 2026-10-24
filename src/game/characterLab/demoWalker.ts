/**
 * Character lab (prototype): scripted walkers that stand in for other players, so several characters can be
 * seen moving through the real map. They are fed through the scene's remote-player path (same code as
 * multiplayer), never sent to the server.
 */
const SPEED = 2.2; // tiles per second: a stroll (players move at 3.4)

export class DemoWalker {
  x: number;
  y: number;
  private tx: number;
  private ty: number;
  private wait = 0;
  private readonly home: { x: number; y: number };
  private readonly random: () => number;

  constructor(x: number, y: number, home: { x: number; y: number }, random: () => number = Math.random) {
    this.home = home;
    this.random = random;
    this.x = this.tx = x;
    this.y = this.ty = y;
  }

  /** Advance by dt seconds; walks to random reachable spots near home and pauses at each. */
  step(dt: number, isBlocked: (tx: number, ty: number) => boolean): { x: number; y: number; moving: boolean } {
    if (this.wait > 0) {
      this.wait -= dt;
      return { x: this.x, y: this.y, moving: false };
    }
    const dx = this.tx - this.x; const dy = this.ty - this.y;
    const d = Math.hypot(dx, dy);
    if (d < 0.05) {
      this.pickTarget(isBlocked);
      this.wait = 0.8 + this.random() * 2.2;
      return { x: this.x, y: this.y, moving: false };
    }
    const s = Math.min(d, SPEED * dt);
    this.x += (dx / d) * s; this.y += (dy / d) * s;
    return { x: this.x, y: this.y, moving: true };
  }

  private pickTarget(isBlocked: (tx: number, ty: number) => boolean) {
    for (let tries = 0; tries < 20; tries++) {
      const tx = this.home.x + (this.random() - 0.5) * 7;
      const ty = this.home.y + (this.random() - 0.5) * 7;
      if (clearPath(this.x, this.y, tx, ty, isBlocked)) { this.tx = tx; this.ty = ty; return; }
    }
  }
}

/** Whether a straight walk between two points stays off blocked tiles (sampled every 0.1 tile). */
export function clearPath(x0: number, y0: number, x1: number, y1: number, isBlocked: (tx: number, ty: number) => boolean): boolean {
  const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 0.1));
  for (let i = 0; i <= n; i++) {
    const x = x0 + ((x1 - x0) * i) / n; const y = y0 + ((y1 - y0) * i) / n;
    for (const [ox, oy] of [[0.3, 0], [-0.3, 0], [0, 0.3], [0, -0.3]] as const) if (isBlocked(Math.floor(x + ox), Math.floor(y + oy))) return false;
  }
  return true;
}
