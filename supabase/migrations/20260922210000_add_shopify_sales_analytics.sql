-- Migration: 20260922210000_add_shopify_sales_analytics.sql
-- Description: Creates independent tables for Shopify Sales Analytics & Reporting Module

-- 1. shopify_orders
CREATE TABLE IF NOT EXISTS public.shopify_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shopify_order_id VARCHAR UNIQUE NOT NULL,
  shopify_order_number INTEGER,
  name VARCHAR,
  created_at TIMESTAMPTZ NOT NULL,
  total_price DECIMAL(12, 2) NOT NULL DEFAULT 0,
  subtotal_price DECIMAL(12, 2) DEFAULT 0,
  currency VARCHAR(10) DEFAULT 'BDT',
  customer_id VARCHAR,
  customer_name VARCHAR,
  financial_status VARCHAR,
  fulfillment_status VARCHAR,
  cancelled_at TIMESTAMPTZ,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. shopify_products
CREATE TABLE IF NOT EXISTS public.shopify_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shopify_product_id VARCHAR UNIQUE NOT NULL,
  title VARCHAR NOT NULL,
  vendor VARCHAR,
  product_type VARCHAR,
  collections JSONB DEFAULT '[]'::jsonb,
  variants JSONB DEFAULT '[]'::jsonb,
  image_url TEXT,
  status VARCHAR DEFAULT 'ACTIVE',
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. shopify_collections
CREATE TABLE IF NOT EXISTS public.shopify_collections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shopify_collection_id VARCHAR UNIQUE NOT NULL,
  title VARCHAR NOT NULL,
  handle VARCHAR,
  products_count INTEGER DEFAULT 0,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. shopify_line_items
CREATE TABLE IF NOT EXISTS public.shopify_line_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES public.shopify_orders(id) ON DELETE CASCADE,
  shopify_order_id VARCHAR NOT NULL,
  shopify_product_id VARCHAR,
  product_name VARCHAR NOT NULL,
  vendor VARCHAR,
  variant_id VARCHAR,
  variant_title VARCHAR,
  quantity INTEGER NOT NULL DEFAULT 1,
  price DECIMAL(12, 2) NOT NULL DEFAULT 0,
  sku VARCHAR,
  collection_ids TEXT[] DEFAULT '{}',
  order_created_at TIMESTAMPTZ NOT NULL
);

-- 5. Indexes for fast aggregation and querying
CREATE INDEX IF NOT EXISTS idx_shopify_orders_created_at ON public.shopify_orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_shopify_orders_order_id ON public.shopify_orders(shopify_order_id);
CREATE INDEX IF NOT EXISTS idx_shopify_products_product_id ON public.shopify_products(shopify_product_id);
CREATE INDEX IF NOT EXISTS idx_shopify_products_vendor ON public.shopify_products(vendor);
CREATE INDEX IF NOT EXISTS idx_shopify_collections_id ON public.shopify_collections(shopify_collection_id);
CREATE INDEX IF NOT EXISTS idx_shopify_line_items_order_id ON public.shopify_line_items(order_id);
CREATE INDEX IF NOT EXISTS idx_shopify_line_items_product_id ON public.shopify_line_items(shopify_product_id);
CREATE INDEX IF NOT EXISTS idx_shopify_line_items_vendor ON public.shopify_line_items(vendor);
CREATE INDEX IF NOT EXISTS idx_shopify_line_items_collection_ids ON public.shopify_line_items USING gin(collection_ids);
CREATE INDEX IF NOT EXISTS idx_shopify_line_items_order_created_at ON public.shopify_line_items(order_created_at DESC);

-- 6. Enable RLS
ALTER TABLE public.shopify_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shopify_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shopify_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shopify_line_items ENABLE ROW LEVEL SECURITY;

-- 7. RLS Policies: Allow authenticated users to view data, service_role has full access
DO $$
BEGIN
  -- shopify_orders
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'shopify_orders' AND policyname = 'Allow authenticated read on shopify_orders') THEN
    CREATE POLICY "Allow authenticated read on shopify_orders"
      ON public.shopify_orders FOR SELECT TO authenticated USING (true);
  END IF;
  
  -- shopify_products
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'shopify_products' AND policyname = 'Allow authenticated read on shopify_products') THEN
    CREATE POLICY "Allow authenticated read on shopify_products"
      ON public.shopify_products FOR SELECT TO authenticated USING (true);
  END IF;

  -- shopify_collections
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'shopify_collections' AND policyname = 'Allow authenticated read on shopify_collections') THEN
    CREATE POLICY "Allow authenticated read on shopify_collections"
      ON public.shopify_collections FOR SELECT TO authenticated USING (true);
  END IF;

  -- shopify_line_items
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'shopify_line_items' AND policyname = 'Allow authenticated read on shopify_line_items') THEN
    CREATE POLICY "Allow authenticated read on shopify_line_items"
      ON public.shopify_line_items FOR SELECT TO authenticated USING (true);
  END IF;
END $$;
