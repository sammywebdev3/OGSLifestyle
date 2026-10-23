/**
 * Job and shop requests: what the browser sends to the /api/jobs and /api/shop routes and how
 * the server checks them before calling the database. Pure (no Next.js, no Supabase), so it is
 * unit-tested directly.
 *
 * Each request carries only what names the action (a job, an item and how many, a request id).
 * Pay, prices, balances and the player are decided by the database; a body with any other field
 * is refused rather than ignored.
 */
import { checkSameOriginJson } from '../../lib/http/sameOrigin.ts';
import { isRequestId, type Parsed } from '../land/request.ts';

export { isRequestId, newRequestId } from '../land/request.ts';

/** Largest accepted body. A real request is under 120 bytes. */
export const MAX_BODY_BYTES = 1024;

/** Same shape the database accepts for job and item keys. */
const KEY = /^[a-z][a-z0-9-]{1,30}$/;
export const isCatalogueKey = (v: unknown): v is string => typeof v === 'string' && KEY.test(v);

export const SHOP_KEYS = ['buka', 'mama-t-stores'] as const;
export const isShopKey = (v: unknown): v is (typeof SHOP_KEYS)[number] => typeof v === 'string' && (SHOP_KEYS as readonly string[]).includes(v);

/** The database refuses more than 20 of anything in one purchase (and each item may have a lower limit). */
export const MAX_QUANTITY = 20;

export interface StartJobRequest { jobKey: string }
export interface ClaimRequest { requestId: string }
export interface ShopBuyRequest { itemKey: string; quantity: number; requestId: string }

function onlyKeys(body: unknown, allowed: readonly string[]): Parsed<Record<string, unknown>> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return { ok: false, status: 400, error: 'Expected a JSON object.' };
  if (Object.keys(body).some((k) => !allowed.includes(k))) {
    return { ok: false, status: 400, error: allowed.length ? `Only ${allowed.join(', ')} may be sent.` : 'No fields may be sent.' };
  }
  return { ok: true, value: body as Record<string, unknown> };
}

export function validateStartJobBody(body: unknown): Parsed<StartJobRequest> {
  const b = onlyKeys(body, ['jobKey']);
  if (!b.ok) return b;
  if (!isCatalogueKey(b.value.jobKey)) return { ok: false, status: 400, error: 'Unknown job.' };
  return { ok: true, value: { jobKey: b.value.jobKey } };
}

export function validateClaimBody(body: unknown): Parsed<ClaimRequest> {
  const b = onlyKeys(body, ['requestId']);
  if (!b.ok) return b;
  if (!isRequestId(b.value.requestId)) return { ok: false, status: 400, error: 'Missing or invalid request id.' };
  return { ok: true, value: { requestId: b.value.requestId } };
}

export function validateAbandonBody(body: unknown): Parsed<Record<string, never>> {
  const b = onlyKeys(body, []);
  return b.ok ? { ok: true, value: {} } : b;
}

export function validateShopBuyBody(body: unknown): Parsed<ShopBuyRequest> {
  const b = onlyKeys(body, ['itemKey', 'quantity', 'requestId']);
  if (!b.ok) return b;
  const { itemKey, quantity, requestId } = b.value;
  if (!isCatalogueKey(itemKey)) return { ok: false, status: 400, error: 'Unknown item.' };
  if (typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) {
    return { ok: false, status: 400, error: `Quantity must be a whole number from 1 to ${MAX_QUANTITY}.` };
  }
  if (!isRequestId(requestId)) return { ok: false, status: 400, error: 'Missing or invalid request id.' };
  return { ok: true, value: { itemKey, quantity, requestId } };
}

/** Everything a route checks before touching the database: same origin, JSON, size, then `validate`. */
export function parseJsonRequest<T>(headers: { get(name: string): string | null }, bodyText: string, validate: (body: unknown) => Parsed<T>): Parsed<T> {
  const origin = checkSameOriginJson(headers);
  if (!origin.ok) return { ok: false, status: origin.status, error: origin.reason };
  if (new TextEncoder().encode(bodyText).length > MAX_BODY_BYTES) return { ok: false, status: 413, error: 'Request too large.' };
  let body: unknown;
  try {
    body = JSON.parse(bodyText);
  } catch {
    return { ok: false, status: 400, error: 'Invalid JSON.' };
  }
  return validate(body);
}
