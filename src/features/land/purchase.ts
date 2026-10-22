/**
 * One purchase attempt in the browser, as a small state machine (pure, tested).
 *
 *  - Nothing is shown as bought until the server says so: the UI renders `state`,
 *    and only a server result moves it to "done".
 *  - While a request is in flight, a second click is ignored (no duplicate sends).
 *  - If the network fails or the server errors, the outcome is UNKNOWN: the
 *    purchase may have gone through. A retry therefore reuses the SAME request id,
 *    so the database answers it from the first attempt instead of charging again.
 *  - A definite answer (sold, not enough cash, ...) ends the attempt; trying again
 *    later is a new attempt with a new request id.
 */
import type { LandErrorCode } from './mapping.ts';

export type AttemptState =
  | { kind: 'idle' }
  | { kind: 'pending'; plotKey: string; requestId: string }
  | { kind: 'unknown'; plotKey: string; requestId: string; message: string }
  | { kind: 'failed'; plotKey: string; code: LandErrorCode; message: string }
  | { kind: 'done'; plotKey: string; replayed: boolean };

/** Errors after which the request may or may not have been applied. */
export const isUncertain = (code: LandErrorCode | 'network') => code === 'network' || code === 'server';

export class PurchaseAttempt {
  state: AttemptState = { kind: 'idle' };
  private readonly makeId: () => string;

  constructor(makeId: () => string) {
    this.makeId = makeId;
  }

  /** Start (or retry) buying `plotKey`. Returns the request to send, or null if one is already in flight. */
  start(plotKey: string): { plotKey: string; requestId: string } | null {
    const s = this.state;
    if (s.kind === 'pending') return null;
    // Retrying an uncertain attempt for the same plot: same id, so it cannot be charged twice.
    const requestId = s.kind === 'unknown' && s.plotKey === plotKey ? s.requestId : this.makeId();
    this.state = { kind: 'pending', plotKey, requestId };
    return { plotKey, requestId };
  }

  succeeded(replayed: boolean): void {
    if (this.state.kind === 'pending') this.state = { kind: 'done', plotKey: this.state.plotKey, replayed };
  }

  failed(code: LandErrorCode | 'network', message: string): void {
    const s = this.state;
    if (s.kind !== 'pending') return;
    this.state = isUncertain(code)
      ? { kind: 'unknown', plotKey: s.plotKey, requestId: s.requestId, message }
      : { kind: 'failed', plotKey: s.plotKey, code: code as LandErrorCode, message };
  }

  /** Forget a finished attempt (e.g. the dialog was closed). An uncertain one is kept so a retry stays safe. */
  reset(): void {
    if (this.state.kind === 'done' || this.state.kind === 'failed') this.state = { kind: 'idle' };
  }
}
