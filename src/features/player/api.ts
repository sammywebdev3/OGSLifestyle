import type { Inventory } from '@/types/inventory';
import type { CreateCharacterInput, Player } from '@/types/player';

export interface Snapshot {
  player: Player | null;
  inventory: Inventory | null;
}

export class ApiError extends Error {
  constructor(public readonly status: number, message: string, public readonly details: string[] = [], public readonly code?: string) {
    super(message);
  }
}

/** JSON call to our own API. Non-2xx answers become an ApiError with the server's message (and code, if any). */
export async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { ...init, headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) }, cache: 'no-store' });
  const body = (await res.json().catch(() => ({}))) as { error?: string; details?: string[]; code?: string } & T;
  if (!res.ok) throw new ApiError(res.status, body.error ?? `Request failed (${res.status})`, body.details ?? [], body.code);
  return body;
}

export const fetchMyPlayer = () => call<Snapshot>('/api/player');

/** Only name and avatar are sent — cash, ids and location are decided by the server. */
export const postCharacter = (input: CreateCharacterInput) =>
  call<Snapshot>('/api/player', { method: 'POST', body: JSON.stringify({ characterName: input.characterName, avatar: input.avatar }) });
