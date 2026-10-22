/**
 * The purchase request: what the browser sends to POST /api/land/buy and how the
 * server checks it before calling the database. Pure (no Next.js, no Supabase),
 * so it is unit-tested directly.
 *
 * A purchase is identified by { plotKey, requestId } and nothing else. The price,
 * the buyer, their balance and the owner are decided by the database; a body that
 * tries to send any other field is refused rather than ignored.
 */
import { checkSameOriginJson } from '../../lib/http/sameOrigin.ts';
import { isPlotKey } from './plots.ts';

/** Largest accepted body. A real request is about 80 bytes. */
export const MAX_BODY_BYTES = 1024;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export const isRequestId = (v: unknown): v is string => typeof v === 'string' && UUID.test(v);

export interface BuyRequest { plotKey: string; requestId: string }

export type Parsed<T> = { ok: true; value: T } | { ok: false; status: 400 | 403 | 413 | 415; error: string };

const ALLOWED_KEYS = new Set(['plotKey', 'requestId']);

/** Check a decoded JSON body. */
export function validateBuyBody(body: unknown): Parsed<BuyRequest> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return { ok: false, status: 400, error: 'Expected a JSON object.' };
  const extra = Object.keys(body).filter((k) => !ALLOWED_KEYS.has(k));
  if (extra.length > 0) return { ok: false, status: 400, error: 'Only plotKey and requestId may be sent.' };
  const { plotKey, requestId } = body as Record<string, unknown>;
  if (!isPlotKey(plotKey)) return { ok: false, status: 400, error: 'Unknown plot.' };
  if (!isRequestId(requestId)) return { ok: false, status: 400, error: 'Missing or invalid request id.' };
  return { ok: true, value: { plotKey, requestId } };
}

/** Everything the route checks before touching the database: same origin, JSON, size, shape. */
export function parseBuyRequest(headers: { get(name: string): string | null }, bodyText: string): Parsed<BuyRequest> {
  const origin = checkSameOriginJson(headers);
  if (!origin.ok) return { ok: false, status: origin.status, error: origin.reason };
  if (new TextEncoder().encode(bodyText).length > MAX_BODY_BYTES) return { ok: false, status: 413, error: 'Request too large.' };
  let body: unknown;
  try {
    body = JSON.parse(bodyText);
  } catch {
    return { ok: false, status: 400, error: 'Invalid JSON.' };
  }
  return validateBuyBody(body);
}

/** A new idempotency key for one purchase attempt (retries of that attempt reuse it). */
export function newRequestId(): string {
  return crypto.randomUUID();
}
