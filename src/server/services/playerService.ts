import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import type { Inventory } from '@/types/inventory';
import type { Player } from '@/types/player';
import { validateCreateCharacter } from '@/lib/validation/character';
import { toInventory, toPlayer } from '@/server/mappers/player';
import { ServiceError } from './errors';

type Db = SupabaseClient<Database>;

export interface PlayerSnapshot {
  player: Player;
  inventory: Inventory;
}

async function requireUserId(db: Db): Promise<string> {
  // getUser() validates the JWT with Supabase Auth (getSession() would trust the cookie).
  const { data, error } = await db.auth.getUser();
  if (error || !data.user) throw new ServiceError(401, 'Please sign in.');
  return data.user.id;
}

/** The signed-in user's character and inventory, or null if they haven't made one yet. */
export async function getMyPlayer(db: Db): Promise<PlayerSnapshot | null> {
  const userId = await requireUserId(db);
  const { data: row, error } = await db.from('players').select('*').eq('user_id', userId).maybeSingle();
  if (error) throw new ServiceError(500, 'Could not load your character.');
  if (!row) return null;
  const { data: inv, error: invErr } = await db.from('inventories').select('id').eq('player_id', row.id).maybeSingle();
  if (invErr || !inv) throw new ServiceError(500, 'Could not load your inventory.');
  const { data: items, error: itemsErr } = await db.from('inventory_items').select('*').eq('inventory_id', inv.id);
  if (itemsErr) throw new ServiceError(500, 'Could not load your inventory.');
  return { player: toPlayer(row, inv.id), inventory: toInventory(inv.id, items ?? []) };
}

/**
 * Create the signed-in user's character. The request body is validated here and
 * again inside the database function, which alone decides starting cash and items.
 */
export async function createMyCharacter(db: Db, body: unknown): Promise<PlayerSnapshot> {
  await requireUserId(db);
  const input = validateCreateCharacter(body);
  if (!input.ok) throw new ServiceError(400, 'Please fix your character details.', input.errors);
  const { error } = await db.rpc('create_character', { p_name: input.value.characterName, p_avatar: { ...input.value.avatar } });
  if (error) {
    if (error.code === '23505') throw new ServiceError(409, 'You already have a character.');
    if (error.code === '22023') throw new ServiceError(400, error.message);
    throw new ServiceError(500, 'Could not create your character.');
  }
  const snap = await getMyPlayer(db);
  if (!snap) throw new ServiceError(500, 'Character was not saved.');
  return snap;
}
