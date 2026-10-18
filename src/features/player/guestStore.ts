import type { Inventory } from '@/types/inventory';
import type { CreateCharacterInput, Player } from '@/types/player';
import { STARTER_ITEMS, STARTING_CASH } from '@/config/game';
import { validateCreateCharacter } from '@/lib/validation/character';

/**
 * Offline guest profile kept in this browser's localStorage. It lets people try
 * the prototype without an account. It is a local preview only: nothing here is
 * trusted by the server, and it never becomes an online account's balance.
 */
const KEY = 'osl.guest.v1';

interface GuestSave {
  player: Player;
  inventory: Inventory;
}

function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `guest-${Date.now().toString(36)}`;
}

export function loadGuest(): GuestSave | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const save = JSON.parse(raw) as GuestSave;
    return save?.player?.source === 'guest' ? save : null;
  } catch {
    return null; // storage blocked or corrupt — treat as no save
  }
}

export function createGuest(input: CreateCharacterInput): GuestSave {
  const valid = validateCreateCharacter(input);
  if (!valid.ok) throw new Error(valid.errors.join(' '));
  const inventoryId = newId();
  const save: GuestSave = {
    player: {
      id: newId(),
      characterName: valid.value.characterName,
      avatar: valid.value.avatar,
      cash: STARTING_CASH,
      location: 'kuto-starter-apartment',
      inventoryId,
      createdAt: new Date().toISOString(),
      source: 'guest',
    },
    inventory: { id: inventoryId, items: STARTER_ITEMS.map((i) => ({ ...i })) },
  };
  try {
    window.localStorage.setItem(KEY, JSON.stringify(save));
  } catch {
    // Storage unavailable (private mode): the guest still works for this tab.
  }
  return save;
}

export function clearGuest(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
