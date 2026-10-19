/**
 * Movement timing for multiplayer. Pure, so it can be unit-tested.
 *
 * SendPolicy  — how often the local player broadcasts (not every frame).
 * Smoother    — glides a remote sprite towards its latest reported position.
 */
import type { Facing } from './protocol.ts';

export interface LocalState { x: number; y: number; facing: Facing; moving: boolean }

/**
 * Send at most every `minIntervalMs` while something changed, plus a heartbeat
 * every `heartbeatMs` while idle (so others know we are still here).
 */
export class SendPolicy {
  private last: LocalState | null = null;
  private lastAt = Number.NEGATIVE_INFINITY;
  private forced = true;
  private readonly minIntervalMs: number;
  private readonly heartbeatMs: number;

  constructor(minIntervalMs = 100, heartbeatMs = 2_000) {
    this.minIntervalMs = minIntervalMs;
    this.heartbeatMs = heartbeatMs;
  }

  /** Returns true (and records the send) if `state` should be sent now. */
  tick(now: number, state: LocalState): boolean {
    const elapsed = now - this.lastAt;
    let send: boolean;
    if (this.forced || !this.last) send = elapsed >= this.minIntervalMs || !this.last;
    else if (elapsed >= this.heartbeatMs) send = true;
    else if (elapsed < this.minIntervalMs) send = false;
    else send = changed(this.last, state);
    if (send) { this.last = { ...state }; this.lastAt = now; this.forced = false; }
    return send;
  }

  /** Send on the next allowed tick even if nothing changed (e.g. someone just joined). */
  forceNext(): void { this.forced = true; }
}

function changed(a: LocalState, b: LocalState): boolean {
  return Math.abs(a.x - b.x) > 0.01 || Math.abs(a.y - b.y) > 0.01 || a.facing !== b.facing || a.moving !== b.moving;
}

/**
 * Exponential smoothing towards the latest target. Far jumps (reconnect, first
 * update after a pause) snap instead of sliding across the map.
 */
export class Smoother {
  x: number;
  y: number;
  private tx: number;
  private ty: number;
  private readonly rate: number;
  private readonly snapDistance: number;

  constructor(x: number, y: number, rate = 12, snapDistance = 3) {
    this.rate = rate;
    this.snapDistance = snapDistance;
    this.x = this.tx = x;
    this.y = this.ty = y;
  }

  setTarget(x: number, y: number): void {
    this.tx = x; this.ty = y;
    if (Math.hypot(x - this.x, y - this.y) > this.snapDistance) { this.x = x; this.y = y; }
  }

  /** Advance by `dt` seconds. Returns the new position. */
  step(dt: number): { x: number; y: number } {
    const k = 1 - Math.exp(-this.rate * Math.max(0, dt));
    this.x += (this.tx - this.x) * k;
    this.y += (this.ty - this.y) * k;
    if (Math.abs(this.tx - this.x) < 0.001) this.x = this.tx;
    if (Math.abs(this.ty - this.y) < 0.001) this.y = this.ty;
    return { x: this.x, y: this.y };
  }
}
