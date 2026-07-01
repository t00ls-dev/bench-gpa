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
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      filter_hierarchy: {
        Row: {
          depto: string | null
          grupo: string | null
          secao: string | null
          store_code: string
          store_name: string
          subgrupo: string | null
        }
        Insert: {
          depto?: string | null
          grupo?: string | null
          secao?: string | null
          store_code: string
          store_name: string
          subgrupo?: string | null
        }
        Update: {
          depto?: string | null
          grupo?: string | null
          secao?: string | null
          store_code?: string
          store_name?: string
          subgrupo?: string | null
        }
        Relationships: []
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
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
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
          p_deptos?: string[]
          p_grupos?: string[]
          p_prod_codes?: string[]
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
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      email_queue_dispatch: { Args: never; Returns: undefined }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
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
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
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
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      refresh_filter_hierarchy: { Args: never; Returns: undefined }
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
