import 'server-only';
import type { InventoryItemRow, PlayerRow } from '@/lib/supabase/database.types';
import type { Inventory, InventoryItem, ItemKey } from '@/types/inventory';
import type { AvatarSelection, LocationId, Player } from '@/types/player';
import { DEFAULT_AVATAR, ITEMS, LOCATIONS } from '@/config/game';
import { validateAvatar } from '@/lib/validation/character';

/** Database row → app model. Unknown or corrupt values fall back to safe defaults. */
export function toPlayer(row: PlayerRow, inventoryId: string): Player {
  const avatar = validateAvatar(row.avatar);
  const location = (row.location in LOCATIONS ? row.location : 'kuto-starter-apartment') as LocationId;
  return {
    id: row.id,
    characterName: row.character_name,
    avatar: avatar.ok ? (avatar.value as AvatarSelection) : DEFAULT_AVATAR,
    cash: Number(row.cash),
    location,
    inventoryId,
    createdAt: row.created_at,
    source: 'server',
  };
}

export function toInventory(inventoryId: string, rows: InventoryItemRow[]): Inventory {
  const items: InventoryItem[] = rows
    .filter((r) => r.item_key in ITEMS && r.quantity > 0)
    .map((r) => ({ key: r.item_key as ItemKey, quantity: r.quantity }));
  return { id: inventoryId, items };
}
