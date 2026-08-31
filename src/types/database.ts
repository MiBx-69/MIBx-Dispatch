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
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
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
  public: {
    Tables: {
      app_settings: {
        Row: {
          created_at: string
          fraud_check_enabled: boolean | null
          fraudspy_api_key: string | null
          id: string
          notification_email: string | null
          pathao_base_url: string | null
          pathao_client_id: string | null
          pathao_client_secret: string | null
          pathao_password: string | null
          pathao_store_id: number | null
          pathao_username: string | null
          pathao_webhook_secret: string | null
          shopify_access_token: string | null
          shopify_api_version: string | null
          shopify_shop_domain: string | null
          shopify_webhook_secret: string | null
          sms_api_key: string | null
          sms_auto_cancelled_enabled: boolean | null
          sms_auto_cancelled_template: string | null
          sms_auto_delivered_enabled: boolean | null
          sms_auto_delivered_template: string | null
          sms_auto_dispatch_enabled: boolean | null
          sms_auto_dispatch_template: string | null
          sms_auto_order_enabled: boolean | null
          sms_auto_order_template: string | null
          sms_sender_id: string | null
          system_name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          fraud_check_enabled?: boolean | null
          fraudspy_api_key?: string | null
          id?: string
          notification_email?: string | null
          pathao_base_url?: string | null
          pathao_client_id?: string | null
          pathao_client_secret?: string | null
          pathao_password?: string | null
          pathao_store_id?: number | null
          pathao_username?: string | null
          pathao_webhook_secret?: string | null
          shopify_access_token?: string | null
          shopify_api_version?: string | null
          shopify_shop_domain?: string | null
          shopify_webhook_secret?: string | null
          sms_api_key?: string | null
          sms_auto_cancelled_enabled?: boolean | null
          sms_auto_cancelled_template?: string | null
          sms_auto_delivered_enabled?: boolean | null
          sms_auto_delivered_template?: string | null
          sms_auto_dispatch_enabled?: boolean | null
          sms_auto_dispatch_template?: string | null
          sms_auto_order_enabled?: boolean | null
          sms_auto_order_template?: string | null
          sms_sender_id?: string | null
          system_name?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          fraud_check_enabled?: boolean | null
          fraudspy_api_key?: string | null
          id?: string
          notification_email?: string | null
          pathao_base_url?: string | null
          pathao_client_id?: string | null
          pathao_client_secret?: string | null
          pathao_password?: string | null
          pathao_store_id?: number | null
          pathao_username?: string | null
          pathao_webhook_secret?: string | null
          shopify_access_token?: string | null
          shopify_api_version?: string | null
          shopify_shop_domain?: string | null
          shopify_webhook_secret?: string | null
          sms_api_key?: string | null
          sms_auto_cancelled_enabled?: boolean | null
          sms_auto_cancelled_template?: string | null
          sms_auto_delivered_enabled?: boolean | null
          sms_auto_delivered_template?: string | null
          sms_auto_dispatch_enabled?: boolean | null
          sms_auto_dispatch_template?: string | null
          sms_auto_order_enabled?: boolean | null
          sms_auto_order_template?: string | null
          sms_sender_id?: string | null
          system_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      customers: {
        Row: {
          created_at: string
          currency: string | null
          default_address: Json | null
          email: string | null
          email_opt_in: boolean | null
          id: string
          marketing_tags: string[] | null
          name: string
          phone: string | null
          shopify_created_at: string | null
          shopify_customer_id: number | null
          shopify_tags: string[] | null
          sms_opt_in: boolean | null
          synced_at: string | null
          total_orders: number | null
          total_spent: number | null
          updated_at: string
          whatsapp_opt_in: boolean | null
        }
        Insert: {
          created_at?: string
          currency?: string | null
          default_address?: Json | null
          email?: string | null
          email_opt_in?: boolean | null
          id?: string
          marketing_tags?: string[] | null
          name: string
          phone?: string | null
          shopify_created_at?: string | null
          shopify_customer_id?: number | null
          shopify_tags?: string[] | null
          sms_opt_in?: boolean | null
          synced_at?: string | null
          total_orders?: number | null
          total_spent?: number | null
          updated_at?: string
          whatsapp_opt_in?: boolean | null
        }
        Update: {
          created_at?: string
          currency?: string | null
          default_address?: Json | null
          email?: string | null
          email_opt_in?: boolean | null
          id?: string
          marketing_tags?: string[] | null
          name?: string
          phone?: string | null
          shopify_created_at?: string | null
          shopify_customer_id?: number | null
          shopify_tags?: string[] | null
          sms_opt_in?: boolean | null
          synced_at?: string | null
          total_orders?: number | null
          total_spent?: number | null
          updated_at?: string
          whatsapp_opt_in?: boolean | null
        }
        Relationships: []
      }
      dispatches: {
        Row: {
          amount_to_collect: number | null
          cancel_reason: string | null
          cancelled_at: string | null
          consignment_id: string
          delivery_fee: number | null
          delivery_type: number | null
          dispatched_at: string
          dispatched_by: string | null
          id: string
          is_cancelled: boolean | null
          item_description: string | null
          item_quantity: number | null
          item_type: number | null
          item_weight: number | null
          merchant_order_id: string | null
          order_id: string
          pathao_order_status: string | null
          pathao_response: Json | null
          recipient_address: string | null
          recipient_city: number | null
          recipient_name: string | null
          recipient_phone: string | null
          recipient_zone: number | null
          shopify_order_id: number
          shopify_order_name: string | null
          tracking_history: Json | null
          updated_at: string
        }
        Insert: {
          amount_to_collect?: number | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          consignment_id: string
          delivery_fee?: number | null
          delivery_type?: number | null
          dispatched_at?: string
          dispatched_by?: string | null
          id?: string
          is_cancelled?: boolean | null
          item_description?: string | null
          item_quantity?: number | null
          item_type?: number | null
          item_weight?: number | null
          merchant_order_id?: string | null
          order_id: string
          pathao_order_status?: string | null
          pathao_response?: Json | null
          recipient_address?: string | null
          recipient_city?: number | null
          recipient_name?: string | null
          recipient_phone?: string | null
          recipient_zone?: number | null
          shopify_order_id: number
          shopify_order_name?: string | null
          tracking_history?: Json | null
          updated_at?: string
        }
        Update: {
          amount_to_collect?: number | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          consignment_id?: string
          delivery_fee?: number | null
          delivery_type?: number | null
          dispatched_at?: string
          dispatched_by?: string | null
          id?: string
          is_cancelled?: boolean | null
          item_description?: string | null
          item_quantity?: number | null
          item_type?: number | null
          item_weight?: number | null
          merchant_order_id?: string | null
          order_id?: string
          pathao_order_status?: string | null
          pathao_response?: Json | null
          recipient_address?: string | null
          recipient_city?: number | null
          recipient_name?: string | null
          recipient_phone?: string | null
          recipient_zone?: number | null
          shopify_order_id?: number
          shopify_order_name?: string | null
          tracking_history?: Json | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dispatches_dispatched_by_fkey"
            columns: ["dispatched_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispatches_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispatches_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders_with_dispatch"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          cancel_reason: string | null
          created_at: string
          currency: string | null
          customer_email: string | null
          customer_id: string | null
          customer_name: string
          customer_phone: string | null
          customer_shopify_id: number | null
          financial_status: string | null
          fraud_data: Json | null
          fraud_risk_level: string | null
          fraud_risk_score: number | null
          fraud_score: number | null
          fraud_status: string | null
          fulfillment_status: string | null
          id: string
          internal_status: string
          is_archived: boolean | null
          line_items: Json
          note: string | null
          pathao_consignment_id: string | null
          pathao_delivery_status: string | null
          pathao_tracking_url: string | null
          shipping_address: Json | null
          shopify_created_at: string | null
          shopify_fulfillment_id: string | null
          shopify_order_id: number
          shopify_order_name: string
          shopify_order_number: number | null
          shopify_tags: string[] | null
          shopify_updated_at: string | null
          subtotal_price: number | null
          synced_at: string | null
          total_price: number | null
          total_tax: number | null
          updated_at: string
        }
        Insert: {
          cancel_reason?: string | null
          created_at?: string
          currency?: string | null
          customer_email?: string | null
          customer_id?: string | null
          customer_name?: string
          customer_phone?: string | null
          customer_shopify_id?: number | null
          financial_status?: string | null
          fraud_data?: Json | null
          fraud_risk_level?: string | null
          fraud_risk_score?: number | null
          fraud_score?: number | null
          fraud_status?: string | null
          fulfillment_status?: string | null
          id?: string
          internal_status?: string
          is_archived?: boolean | null
          line_items?: Json
          note?: string | null
          pathao_consignment_id?: string | null
          pathao_delivery_status?: string | null
          pathao_tracking_url?: string | null
          shipping_address?: Json | null
          shopify_created_at?: string | null
          shopify_fulfillment_id?: string | null
          shopify_order_id: number
          shopify_order_name: string
          shopify_order_number?: number | null
          shopify_tags?: string[] | null
          shopify_updated_at?: string | null
          subtotal_price?: number | null
          synced_at?: string | null
          total_price?: number | null
          total_tax?: number | null
          updated_at?: string
        }
        Update: {
          cancel_reason?: string | null
          created_at?: string
          currency?: string | null
          customer_email?: string | null
          customer_id?: string | null
          customer_name?: string
          customer_phone?: string | null
          customer_shopify_id?: number | null
          financial_status?: string | null
          fraud_data?: Json | null
          fraud_risk_level?: string | null
          fraud_risk_score?: number | null
          fraud_score?: number | null
          fraud_status?: string | null
          fulfillment_status?: string | null
          id?: string
          internal_status?: string
          is_archived?: boolean | null
          line_items?: Json
          note?: string | null
          pathao_consignment_id?: string | null
          pathao_delivery_status?: string | null
          pathao_tracking_url?: string | null
          shipping_address?: Json | null
          shopify_created_at?: string | null
          shopify_fulfillment_id?: string | null
          shopify_order_id?: number
          shopify_order_name?: string
          shopify_order_number?: number | null
          shopify_tags?: string[] | null
          shopify_updated_at?: string | null
          subtotal_price?: number | null
          synced_at?: string | null
          total_price?: number | null
          total_tax?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      pathao_tokens: {
        Row: {
          access_token: string
          created_at: string
          expires_at: string
          id: string
          refresh_token: string
        }
        Insert: {
          access_token: string
          created_at?: string
          expires_at: string
          id?: string
          refresh_token: string
        }
        Update: {
          access_token?: string
          created_at?: string
          expires_at?: string
          id?: string
          refresh_token?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string | null
          id: string
          role: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          role?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          role?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      sync_logs: {
        Row: {
          completed_at: string | null
          customers_synced: number | null
          error_details: string | null
          errors: number | null
          id: string
          orders_synced: number | null
          started_at: string
          status: string
          sync_type: string
          triggered_by: string | null
        }
        Insert: {
          completed_at?: string | null
          customers_synced?: number | null
          error_details?: string | null
          errors?: number | null
          id?: string
          orders_synced?: number | null
          started_at?: string
          status: string
          sync_type: string
          triggered_by?: string | null
        }
        Update: {
          completed_at?: string | null
          customers_synced?: number | null
          error_details?: string | null
          errors?: number | null
          id?: string
          orders_synced?: number | null
          started_at?: string
          status?: string
          sync_type?: string
          triggered_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sync_logs_triggered_by_fkey"
            columns: ["triggered_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          amount: number
          category: string | null
          created_at: string
          created_by: string | null
          date: string
          description: string
          id: string
          type: string
          updated_at: string
        }
        Insert: {
          amount?: number
          category?: string | null
          created_at?: string
          created_by?: string | null
          date?: string
          description: string
          id?: string
          type: string
          updated_at?: string
        }
        Update: {
          amount?: number
          category?: string | null
          created_at?: string
          created_by?: string | null
          date?: string
          description?: string
          id?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      webhook_logs: {
        Row: {
          error: string | null
          id: string
          pathao_consignment_id: string | null
          payload: Json | null
          processed: boolean | null
          received_at: string
          shopify_order_id: number | null
          source: string
          topic: string | null
        }
        Insert: {
          error?: string | null
          id?: string
          pathao_consignment_id?: string | null
          payload?: Json | null
          processed?: boolean | null
          received_at?: string
          shopify_order_id?: number | null
          source: string
          topic?: string | null
        }
        Update: {
          error?: string | null
          id?: string
          pathao_consignment_id?: string | null
          payload?: Json | null
          processed?: boolean | null
          received_at?: string
          shopify_order_id?: number | null
          source?: string
          topic?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      dashboard_stats: {
        Row: {
          cancelled_orders: number | null
          delivered_orders: number | null
          dispatched_orders: number | null
          dispatched_today: number | null
          hold_orders: number | null
          orders_today: number | null
          pending_orders: number | null
          preparing_orders: number | null
          revenue_today: number | null
        }
        Relationships: []
      }
      orders_with_dispatch: {
        Row: {
          cancel_reason: string | null
          consignment_id: string | null
          created_at: string | null
          currency: string | null
          customer_email: string | null
          customer_id: string | null
          customer_name: string | null
          customer_phone: string | null
          customer_shopify_id: number | null
          delivery_fee: number | null
          dispatch_cancelled: boolean | null
          dispatch_status: string | null
          dispatched_at: string | null
          financial_status: string | null
          fraud_data: Json | null
          fraud_score: number | null
          fraud_status: string | null
          fulfillment_status: string | null
          id: string | null
          internal_status: string | null
          line_items: Json | null
          note: string | null
          pathao_consignment_id: string | null
          pathao_delivery_status: string | null
          pathao_tracking_url: string | null
          shipping_address: Json | null
          shopify_created_at: string | null
          shopify_fulfillment_id: string | null
          shopify_order_id: number | null
          shopify_order_name: string | null
          shopify_order_number: number | null
          shopify_tags: string[] | null
          shopify_updated_at: string | null
          subtotal_price: number | null
          synced_at: string | null
          total_price: number | null
          total_tax: number | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
    }
    Enums: {
      [_ in never]: never
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

// ─── Convenient Type Aliases ──────────────────────────────────────────────────

export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type AppSettings = Database["public"]["Tables"]["app_settings"]["Row"];
export type Customer = Database["public"]["Tables"]["customers"]["Row"];
export type Order = Database["public"]["Tables"]["orders"]["Row"];
export type Dispatch = Database["public"]["Tables"]["dispatches"]["Row"];
export type Transaction = Database["public"]["Tables"]["transactions"]["Row"];
export type DashboardStats = Database["public"]["Views"]["dashboard_stats"]["Row"];

export type OrderStatus =
  | "pending"
  | "preparing"
  | "hold"
  | "cancelled"
  | "dispatched"
  | "delivered"
  | "delayed"
  | "returned";

export type PathaoDeliveryStatus =
  | "Pending"
  | "Picked Up"
  | "In Transit"
  | "Out for Delivery"
  | "Delivered"
  | "Return"
  | "Return In Transit"
  | "Return Arrived"
  | "Return Completed"
  | "Partial Delivered";

// ─── Shopify Webhook Payload Types ────────────────────────────────────────────

export interface ShopifyLineItem {
  id: number;
  title: string;
  quantity: number;
  price: string;
  sku: string | null;
  grams: number;
  variant_title: string | null;
}

export interface ShopifyAddress {
  name: string;
  phone: string;
  address1: string;
  address2?: string;
  city: string;
  province?: string;
  zip?: string;
  country: string;
}

export interface ShopifyOrderWebhookPayload {
  id: number;
  name: string;
  order_number: number;
  email: string;
  phone?: string;
  note?: string;
  tags?: string;
  financial_status: string;
  fulfillment_status: string | null;
  total_price: string;
  subtotal_price: string;
  total_tax: string;
  currency: string;
  created_at: string;
  updated_at: string;
  cancelled_at?: string;
  cancel_reason?: string;
  customer?: {
    id: number;
    first_name: string;
    last_name: string;
    email: string;
    phone?: string;
    orders_count: number;
    total_spent: string;
  };
  shipping_address?: ShopifyAddress;
  billing_address?: ShopifyAddress;
  line_items: ShopifyLineItem[];
  fulfillments?: Array<{
    id: number;
    status: string;
    tracking_number?: string;
    tracking_url?: string;
    tracking_company?: string;
  }>;
}
