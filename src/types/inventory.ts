export type TransactionType = 'STOCK_IN' | 'STOCK_OUT' | 'ADJUSTMENT_IN' | 'ADJUSTMENT_OUT';

export type ProductStatus = 'active' | 'archived';

export interface InventoryProduct {
  id: string;
  product_name: string;
  sku: string | null;
  style_code: string | null;
  description: string | null;
  status: ProductStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface InventorySourceCategory {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface InventoryTransaction {
  id: string;
  transaction_number: string;
  product_id: string;
  transaction_type: TransactionType;
  quantity: number;
  source_category_id: string | null;
  source_category_snapshot: string | null;
  stock_out_reason: string | null;
  reference_id: string | null;
  brought_by: string | null;
  received_by: string | null;
  unit_cost: number | null;
  total_cost: number | null;
  notes: string | null;
  transaction_date: string;
  created_by: string | null;
  created_at: string;
  // joined fields
  inventory_products?: InventoryProduct | null;
  profiles?: {
    id: string;
    full_name: string | null;
    role: string;
  } | null;
  inventory_source_categories?: InventorySourceCategory | null;
  corrections?: InventoryTransactionCorrection[] | null;
}

export interface InventoryTransactionCorrection {
  id: string;
  original_transaction_id: string;
  correction_transaction_id: string;
  reason: string;
  created_by: string | null;
  created_at: string;
  profiles?: {
    id: string;
    full_name: string | null;
    role: string;
  } | null;
  correction_transaction?: InventoryTransaction | null;
}

export interface ProductStockSummary {
  id: string;
  product_id: string;
  product_name: string;
  sku: string | null;
  style_code: string | null;
  description: string | null;
  status: ProductStatus;
  created_at: string;
  updated_at: string;
  total_stock_in: number;
  total_stock_out: number;
  current_stock: number;
  last_transaction_date: string | null;
  transaction_count?: number;
}

export interface InventoryOverviewStats {
  totalUniqueProducts: number;
  totalStockReceived: number;
  totalStockOut: number;
  currentAvailableStock: number;
  todayStockIn: number;
  todayStockOut: number;
}

