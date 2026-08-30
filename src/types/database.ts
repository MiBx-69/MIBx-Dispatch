// Auto-generated types for Supabase database tables
// Run `supabase gen types typescript` after migrations to regenerate

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          user_id: string;
          full_name: string | null;
          role: "admin" | "staff";
          avatar_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["profiles"]["Row"], "id" | "created_at" | "updated_at">;
        Update: Partial<Database["public"]["Tables"]["profiles"]["Insert"]>;
      };
      app_settings: {
        Row: {
          id: string;
          system_name: string;
          shopify_shop_domain: string | null;
          shopify_access_token: string | null;
          shopify_webhook_secret: string | null;
          shopify_api_version: string | null;
          pathao_client_id: string | null;
          pathao_client_secret: string | null;
          pathao_username: string | null;
          pathao_password: string | null;
          pathao_store_id: number | null;
          pathao_base_url: string | null;
          fraudspy_api_key: string | null;
          fraud_check_enabled: boolean;
          notification_email: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["app_settings"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["app_settings"]["Row"]>;
      };
      customers: {
        Row: {
          id: string;
          shopify_customer_id: number | null;
          name: string;
          email: string | null;
          phone: string | null;
          default_address: Json | null;
          total_orders: number;
          total_spent: number;
          currency: string;
          shopify_tags: string[];
          sms_opt_in: boolean;
          email_opt_in: boolean;
          whatsapp_opt_in: boolean;
          marketing_tags: string[];
          shopify_created_at: string | null;
          synced_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["customers"]["Row"], "id" | "created_at" | "updated_at">;
        Update: Partial<Database["public"]["Tables"]["customers"]["Insert"]>;
      };
      orders: {
        Row: {
          id: string;
          shopify_order_id: number;
          shopify_order_name: string;
          shopify_order_number: number | null;
          customer_id: string | null;
          customer_shopify_id: number | null;
          customer_name: string;
          customer_phone: string | null;
          customer_email: string | null;
          shipping_address: Json | null;
          line_items: Json;
          total_price: number;
          subtotal_price: number;
          total_tax: number;
          currency: string;
          financial_status: string | null;
          fulfillment_status: string | null;
          shopify_tags: string[];
          internal_status: OrderStatus;
          pathao_consignment_id: string | null;
          pathao_tracking_url: string | null;
          pathao_delivery_status: string | null;
          shopify_fulfillment_id: string | null;
          fraud_score: number | null;
          fraud_status: "safe" | "risky" | "fraud" | "unchecked" | null;
          fraud_data: Json | null;
          note: string | null;
          cancel_reason: string | null;
          shopify_created_at: string | null;
          shopify_updated_at: string | null;
          synced_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["orders"]["Row"], "id" | "created_at" | "updated_at">;
        Update: Partial<Database["public"]["Tables"]["orders"]["Insert"]>;
      };
      dispatches: {
        Row: {
          id: string;
          order_id: string;
          shopify_order_id: number;
          shopify_order_name: string | null;
          consignment_id: string;
          merchant_order_id: string | null;
          pathao_order_status: string | null;
          delivery_fee: number | null;
          recipient_name: string | null;
          recipient_phone: string | null;
          recipient_address: string | null;
          recipient_city: number | null;
          recipient_zone: number | null;
          amount_to_collect: number | null;
          item_weight: number | null;
          item_quantity: number | null;
          delivery_type: number | null;
          item_type: number | null;
          item_description: string | null;
          pathao_response: Json | null;
          tracking_history: Json;
          dispatched_by: string | null;
          is_cancelled: boolean;
          cancel_reason: string | null;
          cancelled_at: string | null;
          dispatched_at: string;
          updated_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["dispatches"]["Row"], "id" | "dispatched_at" | "updated_at">;
        Update: Partial<Database["public"]["Tables"]["dispatches"]["Insert"]>;
      };
      webhook_logs: {
        Row: {
          id: string;
          source: "shopify" | "pathao";
          topic: string | null;
          shopify_order_id: number | null;
          pathao_consignment_id: string | null;
          payload: Json | null;
          processed: boolean;
          error: string | null;
          received_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["webhook_logs"]["Row"], "id">;
        Update: Partial<Database["public"]["Tables"]["webhook_logs"]["Insert"]>;
      };
      sync_logs: {
        Row: {
          id: string;
          sync_type: "full_shopify" | "incremental_shopify" | "pathao_status";
          status: "running" | "completed" | "failed";
          orders_synced: number;
          customers_synced: number;
          errors: number;
          error_details: string | null;
          triggered_by: string | null;
          started_at: string;
          completed_at: string | null;
        };
        Insert: Omit<Database["public"]["Tables"]["sync_logs"]["Row"], "id">;
        Update: Partial<Database["public"]["Tables"]["sync_logs"]["Insert"]>;
      };
      pathao_tokens: {
        Row: {
          id: string;
          access_token: string;
          refresh_token: string;
          expires_at: string;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["pathao_tokens"]["Row"], "id">;
        Update: Partial<Database["public"]["Tables"]["pathao_tokens"]["Insert"]>;
      };
    };
    Views: {
      dashboard_stats: {
        Row: {
          pending_orders: number | null;
          preparing_orders: number | null;
          dispatched_orders: number | null;
          delivered_orders: number | null;
          hold_orders: number | null;
          cancelled_orders: number | null;
          orders_today: number | null;
          dispatched_today: number | null;
          revenue_today: number | null;
        };
      };
    };
    Functions: {};
    Enums: {};
  };
}

// ─── Convenient Type Aliases ──────────────────────────────────────────────────

export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type AppSettings = Database["public"]["Tables"]["app_settings"]["Row"];
export type Customer = Database["public"]["Tables"]["customers"]["Row"];
export type Order = Database["public"]["Tables"]["orders"]["Row"];
export type Dispatch = Database["public"]["Tables"]["dispatches"]["Row"];
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
