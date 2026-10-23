/**
 * Database types — GENERATED, do not edit by hand.
 *
 * Source: supabase/postgres-meta v0.88.0 (the generator behind `supabase gen types`)
 * run against a DISPOSABLE local supabase/postgres:15.8.1.085 database with
 * supabase/migrations/*.sql applied. They describe the migrations, not a live
 * project. After deploying the migrations, regenerate from the real project
 * (requires `npx supabase login` first):
 *   npx supabase gen types typescript --project-id <project-ref> --schema public > src/lib/supabase/database.types.ts
 * This overwrites the whole file. Hand-written aliases live in ./rows.ts, so
 * nothing needs to be re-added; run `npm run typecheck` afterwards.
 *
 * Insert/Update types exist for typing only: the database refuses all client writes.
 */
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      economic_requests: {
        Row: {
          created_at: string
          idempotency_key: string
          kind: string
          player_id: string
          plot_id: string | null
          transaction_id: string
        }
        Insert: {
          created_at?: string
          idempotency_key: string
          kind: string
          player_id: string
          plot_id?: string | null
          transaction_id: string
        }
        Update: {
          created_at?: string
          idempotency_key?: string
          kind?: string
          player_id?: string
          plot_id?: string | null
          transaction_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "economic_requests_player_id_fkey"
            columns: ["player_id"]
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "economic_requests_plot_id_fkey"
            columns: ["plot_id"]
            referencedRelation: "land_plots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "economic_requests_transaction_id_fkey"
            columns: ["transaction_id"]
            referencedRelation: "economy_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      economy_transactions: {
        Row: {
          amount: number
          created_at: string
          id: string
          item_key: string | null
          job_shift_id: string | null
          kind: string
          player_id: string
          plot_id: string | null
          quantity: number | null
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          item_key?: string | null
          job_shift_id?: string | null
          kind: string
          player_id: string
          plot_id?: string | null
          quantity?: number | null
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          item_key?: string | null
          job_shift_id?: string | null
          kind?: string
          player_id?: string
          plot_id?: string | null
          quantity?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "economy_transactions_item_key_fkey"
            columns: ["item_key"]
            referencedRelation: "shop_items"
            referencedColumns: ["item_key"]
          },
          {
            foreignKeyName: "economy_transactions_job_shift_id_fkey"
            columns: ["job_shift_id"]
            referencedRelation: "job_shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "economy_transactions_player_id_fkey"
            columns: ["player_id"]
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "economy_transactions_plot_id_fkey"
            columns: ["plot_id"]
            referencedRelation: "land_plots"
            referencedColumns: ["id"]
          },
        ]
      }
      inventories: {
        Row: {
          created_at: string
          id: string
          player_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          player_id: string
        }
        Update: {
          created_at?: string
          id?: string
          player_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventories_player_id_fkey"
            columns: ["player_id"]
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_items: {
        Row: {
          inventory_id: string
          item_key: string
          quantity: number
        }
        Insert: {
          inventory_id: string
          item_key: string
          quantity: number
        }
        Update: {
          inventory_id?: string
          item_key?: string
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "inventory_items_inventory_id_fkey"
            columns: ["inventory_id"]
            referencedRelation: "inventories"
            referencedColumns: ["id"]
          },
        ]
      }
      job_shifts: {
        Row: {
          ends_at: string
          finished_at: string | null
          id: string
          job_key: string
          pay: number
          player_id: string
          started_at: string
          status: string
          transaction_id: string | null
        }
        Insert: {
          ends_at: string
          finished_at?: string | null
          id?: string
          job_key: string
          pay: number
          player_id: string
          started_at?: string
          status?: string
          transaction_id?: string | null
        }
        Update: {
          ends_at?: string
          finished_at?: string | null
          id?: string
          job_key?: string
          pay?: number
          player_id?: string
          started_at?: string
          status?: string
          transaction_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "job_shifts_job_key_fkey"
            columns: ["job_key"]
            referencedRelation: "jobs"
            referencedColumns: ["job_key"]
          },
          {
            foreignKeyName: "job_shifts_player_id_fkey"
            columns: ["player_id"]
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_shifts_transaction_id_fkey"
            columns: ["transaction_id"]
            referencedRelation: "economy_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          active: boolean
          description: string
          duration_seconds: number
          job_key: string
          location_id: string
          pay: number
          title: string
        }
        Insert: {
          active?: boolean
          description: string
          duration_seconds: number
          job_key: string
          location_id: string
          pay: number
          title: string
        }
        Update: {
          active?: boolean
          description?: string
          duration_seconds?: number
          job_key?: string
          location_id?: string
          pay?: number
          title?: string
        }
        Relationships: []
      }
      land_plots: {
        Row: {
          acquired_at: string | null
          created_at: string
          depth: number
          id: string
          location_id: string
          owner_player_id: string | null
          plot_key: string
          price: number
          tier: string
          tile_x: number
          tile_y: number
          width: number
        }
        Insert: {
          acquired_at?: string | null
          created_at?: string
          depth: number
          id?: string
          location_id: string
          owner_player_id?: string | null
          plot_key: string
          price: number
          tier: string
          tile_x: number
          tile_y: number
          width: number
        }
        Update: {
          acquired_at?: string | null
          created_at?: string
          depth?: number
          id?: string
          location_id?: string
          owner_player_id?: string | null
          plot_key?: string
          price?: number
          tier?: string
          tile_x?: number
          tile_y?: number
          width?: number
        }
        Relationships: [
          {
            foreignKeyName: "land_plots_owner_player_id_fkey"
            columns: ["owner_player_id"]
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      ledger_entries: {
        Row: {
          account: string
          amount: number
          balance_after: number | null
          created_at: string
          id: number
          player_id: string | null
          transaction_id: string
        }
        Insert: {
          account: string
          amount: number
          balance_after?: number | null
          created_at?: string
          id?: never
          player_id?: string | null
          transaction_id: string
        }
        Update: {
          account?: string
          amount?: number
          balance_after?: number | null
          created_at?: string
          id?: never
          player_id?: string | null
          transaction_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ledger_entries_player_id_fkey"
            columns: ["player_id"]
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_entries_transaction_id_fkey"
            columns: ["transaction_id"]
            referencedRelation: "economy_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      players: {
        Row: {
          avatar: Json
          cash: number
          character_name: string
          created_at: string
          id: string
          location: string
          user_id: string
        }
        Insert: {
          avatar: Json
          cash?: number
          character_name: string
          created_at?: string
          id?: string
          location?: string
          user_id: string
        }
        Update: {
          avatar?: Json
          cash?: number
          character_name?: string
          created_at?: string
          id?: string
          location?: string
          user_id?: string
        }
        Relationships: []
      }
      shop_items: {
        Row: {
          active: boolean
          item_key: string
          max_per_purchase: number
          name: string
          price: number
          shop_key: string
        }
        Insert: {
          active?: boolean
          item_key: string
          max_per_purchase?: number
          name: string
          price: number
          shop_key: string
        }
        Update: {
          active?: boolean
          item_key?: string
          max_per_purchase?: number
          name?: string
          price?: number
          shop_key?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      abandon_job_shift: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
      buy_land_plot: {
        Args: {
          p_plot_key: string
          p_idempotency_key: string
        }
        Returns: Json
      }
      buy_shop_item: {
        Args: {
          p_item_key: string
          p_quantity: number
          p_idempotency_key: string
        }
        Returns: Json
      }
      claim_job_shift: {
        Args: {
          p_idempotency_key: string
        }
        Returns: Json
      }
      create_character: {
        Args: {
          p_name: string
          p_avatar: Json
        }
        Returns: {
          avatar: Json
          cash: number
          character_name: string
          created_at: string
          id: string
          location: string
          user_id: string
        }
      }
      get_land_plots: {
        Args: Record<PropertyKey, never>
        Returns: {
          plot_key: string
          location_id: string
          tier: string
          price: number
          tile_x: number
          tile_y: number
          width: number
          depth: number
          owner_name: string
          owned_by_me: boolean
        }[]
      }
      get_my_jobs: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
      get_my_land: {
        Args: Record<PropertyKey, never>
        Returns: {
          plot_key: string
          tier: string
          price_paid: number
          acquired_at: string
          transaction_id: string
        }[]
      }
      get_player_profiles: {
        Args: {
          p_player_ids: string[]
        }
        Returns: {
          player_id: string
          character_name: string
          avatar: Json
        }[]
      }
      get_shop: {
        Args: {
          p_shop_key: string
        }
        Returns: Json
      }
      mp_my_player_id: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      start_job_shift: {
        Args: {
          p_job_key: string
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DefaultSchema = Database[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof Database },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof Database },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof Database }
  ? Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
