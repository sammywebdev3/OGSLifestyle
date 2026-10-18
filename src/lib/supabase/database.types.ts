/**
 * Database types for the tables in supabase/migrations. Insert/Update types exist for
 * typing only: the database itself refuses client writes (see the migration).
 * Hand-written for Phase 1; regenerate with `supabase gen types typescript`
 * once the project is linked.
 */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type PlayerRow = {
  id: string;
  user_id: string;
  character_name: string;
  avatar: Json;
  cash: number;
  location: string;
  created_at: string;
}

export type InventoryRow = {
  id: string;
  player_id: string;
  created_at: string;
}

export type InventoryItemRow = {
  inventory_id: string;
  item_key: string;
  quantity: number;
}

export type Database = {
  public: {
    Tables: {
      players: { Row: PlayerRow; Insert: Partial<PlayerRow>; Update: Partial<PlayerRow>; Relationships: [] };
      inventories: {
        Row: InventoryRow; Insert: Partial<InventoryRow>; Update: Partial<InventoryRow>;
        Relationships: [{ foreignKeyName: 'inventories_player_id_fkey'; columns: ['player_id']; isOneToOne: true; referencedRelation: 'players'; referencedColumns: ['id'] }];
      };
      inventory_items: {
        Row: InventoryItemRow; Insert: Partial<InventoryItemRow>; Update: Partial<InventoryItemRow>;
        Relationships: [{ foreignKeyName: 'inventory_items_inventory_id_fkey'; columns: ['inventory_id']; isOneToOne: false; referencedRelation: 'inventories'; referencedColumns: ['id'] }];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      create_character: { Args: { p_name: string; p_avatar: Json }; Returns: PlayerRow };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
}
