/**
 * One money-moving attempt in the browser (a wage claim or a shop purchase), as a small state
 * machine (pure, tested). Same rules as the land PurchaseAttempt:
 *
 *  - Nothing is shown as paid or bought until the server says so.
 *  - While a request is in flight, a second click is ignored (no duplicate sends).
 *  - After a network or server failure the outcome is UNKNOWN, so a retry of the SAME action
 *    reuses the SAME request id and the database answers it from the first attempt instead of
 *    paying or charging again.
 *  - A definite answer ends the attempt; trying again later is a new attempt with a new id.
 */
export type Attempt<Code extends string> =
  | { kind: 'idle' }
  | { kind: 'pending'; action: string; requestId: string }
  | { kind: 'unknown'; action: string; requestId: string; message: string }
  | { kind: 'failed'; action: string; code: Code; message: string }
  | { kind: 'done'; action: string; replayed: boolean };

export const isUncertain = (code: string) => code === 'network' || code === 'server';

export class MoneyAttempt<Code extends string> {
  state: Attempt<Code> = { kind: 'idle' };
  private readonly makeId: () => string;

  constructor(makeId: () => string) {
    this.makeId = makeId;
  }

  /** Start (or retry) `action` (e.g. "buy:zobo:2"). Returns the request id to send, or null if one is in flight. */
  start(action: string): string | null {
    const s = this.state;
    if (s.kind === 'pending') return null;
    const requestId = s.kind === 'unknown' && s.action === action ? s.requestId : this.makeId();
    this.state = { kind: 'pending', action, requestId };
    return requestId;
  }

  succeeded(replayed: boolean): void {
    if (this.state.kind === 'pending') this.state = { kind: 'done', action: this.state.action, replayed };
  }

  failed(code: Code | 'network', message: string): void {
    const s = this.state;
    if (s.kind !== 'pending') return;
    this.state = isUncertain(code)
      ? { kind: 'unknown', action: s.action, requestId: s.requestId, message }
      : { kind: 'failed', action: s.action, code: code as Code, message };
  }

  /** Forget a finished attempt. An uncertain one is kept so a retry of it stays safe. */
  reset(): void {
    if (this.state.kind === 'done' || this.state.kind === 'failed') this.state = { kind: 'idle' };
  }
}

/**
 * Seconds left in a shift, measured on the SERVER's clock: `serverNow` was the database time when
 * the board was read at local time `readAtMs`, so a wrong phone clock does not change the countdown.
 */
export function secondsLeft(endsAt: string, serverNow: string, readAtMs: number, nowMs: number): number {
  const serverNowMs = Date.parse(serverNow) + (nowMs - readAtMs);
  const left = Math.ceil((Date.parse(endsAt) - serverNowMs) / 1000);
  return Number.isFinite(left) ? Math.max(0, left) : 0;
}
