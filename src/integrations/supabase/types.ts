export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      custom_analyses: {
        Row: {
          created_at: string
          id: string
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      custom_analysis_items: {
        Row: {
          analysis_id: string
          created_at: string
          id: string
          prod_code: string
        }
        Insert: {
          analysis_id: string
          created_at?: string
          id?: string
          prod_code: string
        }
        Update: {
          analysis_id?: string
          created_at?: string
          id?: string
          prod_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "custom_analysis_items_analysis_id_fkey"
            columns: ["analysis_id"]
            isOneToOne: false
            referencedRelation: "custom_analyses"
            referencedColumns: ["id"]
          },
        ]
      }
      import_log: {
        Row: {
          imported_at: string
          imported_by: string | null
          row_count: number
          sale_date: string
        }
        Insert: {
          imported_at?: string
          imported_by?: string | null
          row_count?: number
          sale_date: string
        }
        Update: {
          imported_at?: string
          imported_by?: string | null
          row_count?: number
          sale_date?: string
        }
        Relationships: []
      }
      products: {
        Row: {
          last_seen: string | null
          prod_code: string
          prod_name: string
        }
        Insert: {
          last_seen?: string | null
          prod_code: string
          prod_name: string
        }
        Update: {
          last_seen?: string | null
          prod_code?: string
          prod_name?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          id: string
          status: Database["public"]["Enums"]["user_status"]
        }
        Insert: {
          created_at?: string
          email: string
          id: string
          status?: Database["public"]["Enums"]["user_status"]
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          status?: Database["public"]["Enums"]["user_status"]
        }
        Relationships: []
      }
      sales: {
        Row: {
          depto: string | null
          grupo: string | null
          id: number
          prod_code: string
          prod_name: string
          sale_date: string
          secao: string | null
          store_code: string
          store_name: string
          subgrupo: string | null
          val_vda: number
        }
        Insert: {
          depto?: string | null
          grupo?: string | null
          id?: number
          prod_code: string
          prod_name: string
          sale_date: string
          secao?: string | null
          store_code: string
          store_name: string
          subgrupo?: string | null
          val_vda?: number
        }
        Update: {
          depto?: string | null
          grupo?: string | null
          id?: number
          prod_code?: string
          prod_name?: string
          sale_date?: string
          secao?: string | null
          store_code?: string
          store_name?: string
          subgrupo?: string | null
          val_vda?: number
        }
        Relationships: []
      }
      sales_daily_agg: {
        Row: {
          depto: string | null
          grupo: string | null
          item_count: number
          sale_date: string
          secao: string | null
          store_code: string
          store_name: string
          subgrupo: string | null
          val_vda: number
        }
        Insert: {
          depto?: string | null
          grupo?: string | null
          item_count?: number
          sale_date: string
          secao?: string | null
          store_code: string
          store_name: string
          subgrupo?: string | null
          val_vda?: number
        }
        Update: {
          depto?: string | null
          grupo?: string | null
          item_count?: number
          sale_date?: string
          secao?: string | null
          store_code?: string
          store_name?: string
          subgrupo?: string | null
          val_vda?: number
        }
        Relationships: []
      }
      stores: {
        Row: {
          store_code: string
          store_name: string
        }
        Insert: {
          store_code: string
          store_name: string
        }
        Update: {
          store_code?: string
          store_name?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      area_analysis: {
        Args: {
          p_date_from: string
          p_date_to: string
          p_depto?: string
          p_grupo?: string
          p_prev_from?: string
          p_prev_to?: string
          p_secao?: string
          p_store?: string
          p_subgrupo?: string
        }
        Returns: Json
      }
      custom_analysis_results: {
        Args: {
          p_analysis_id: string
          p_date_from: string
          p_date_to: string
          p_deptos?: string[]
          p_grupos?: string[]
          p_secoes?: string[]
          p_stores?: string[]
          p_subgrupos?: string[]
        }
        Returns: Json
      }
      dashboard_metrics: {
        Args: {
          p_date_from: string
          p_date_to: string
          p_deptos?: string[]
          p_grupos?: string[]
          p_secoes?: string[]
          p_stores?: string[]
          p_subgrupos?: string[]
        }
        Returns: Json
      }
      dashboard_rankings: {
        Args: {
          p_date_from: string
          p_date_to: string
          p_deptos?: string[]
          p_grupos?: string[]
          p_limit?: number
          p_secoes?: string[]
          p_stores?: string[]
          p_subgrupos?: string[]
        }
        Returns: Json
      }
      filter_options: {
        Args: {
          p_date_from: string
          p_date_to: string
          p_deptos?: string[]
          p_grupos?: string[]
          p_secoes?: string[]
          p_stores?: string[]
        }
        Returns: Json
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      imported_dates: {
        Args: never
        Returns: {
          imported_at: string
          row_count: number
          sale_date: string
        }[]
      }
      is_approved: { Args: { _user_id: string }; Returns: boolean }
      product_analysis: {
        Args: {
          p_prod_code: string
          p_ref_date?: string
          p_store_code?: string
        }
        Returns: Json
      }
      product_search: {
        Args: { p_q: string }
        Returns: {
          prod_code: string
          prod_name: string
        }[]
      }
      products_in_decline: {
        Args: {
          p_date_from: string
          p_date_to: string
          p_deptos?: string[]
          p_prod_codes?: string[]
          p_secoes?: string[]
          p_stores?: string[]
        }
        Returns: Json
      }
      refresh_sales_daily_agg: { Args: { p_date: string }; Returns: undefined }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
    }
    Enums: {
      app_role: "admin" | "user"
      user_status: "pending" | "approved" | "blocked"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
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
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
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
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
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
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user"],
      user_status: ["pending", "approved", "blocked"],
    },
  },
} as const
