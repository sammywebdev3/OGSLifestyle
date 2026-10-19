/**
 * Hand-written row aliases, derived from the GENERATED ./database.types.ts.
 *
 * Kept in their own file so regenerating database.types.ts (which overwrites the
 * whole file) never deletes them. If a regeneration renames or removes a table,
 * `npm run typecheck` fails here, which is the signal to update these aliases.
 */
import type { Database } from './database.types';

type PublicTables = Database['public']['Tables'];

export type PlayerRow = PublicTables['players']['Row'];
export type InventoryRow = PublicTables['inventories']['Row'];
export type InventoryItemRow = PublicTables['inventory_items']['Row'];
