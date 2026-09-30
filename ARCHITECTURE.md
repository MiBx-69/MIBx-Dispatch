# MiBx Dispatch — Architecture & Data Flow Documentation

## 1. System Overview
**MiBx Dispatch** is a unified Logistics, Fulfillment, and Dispatch ERP application built for Bangladesh e-commerce operations. It bridges **Shopify** (storefront & orders), **Pathao Courier Hermes API** (third-party delivery & tracking), **FraudSpy** (fraud prevention & customer delivery risk analytics), and **MIM SMS** (automated order & dispatch messaging) into a centralized dashboard with PostgreSQL and Redis.

---

## 2. Technology Stack
- **Framework:** Next.js 16.3.3 (App Router with Turbopack, React 19.2.8)
- **Database & Auth:** Supabase (PostgreSQL 15+, Row Level Security, Supabase Auth with Passkeys & Sessions)
- **Cache & Rate Limiting:** Upstash Redis (REST API)
- **Background Cron & Task Queue:** Upstash QStash + Vercel Serverless Functions (`maxDuration: 120-300s`)
- **UI & Styling:** Tailwind CSS v4, Radix UI Primitives, Lucide Icons, Sonner Notifications, Recharts
- **External Integrations:**
  - **Shopify GraphQL Admin API** (2026-07 / 2024-07)
  - **Pathao Courier Merchant API** (`https://api-hermes.pathao.com`)
  - **FraudSpy API** (Customer return/delivery score lookup & blacklist reports)
  - **MIM SMS Gateway** (Bangla/English transactional SMS)

---

## 3. Data Flow Architecture

```
                                  ┌────────────────────────┐
                                  │   Shopify Webhooks /   │
                                  │   GraphQL Orders API   │
                                  └───────────┬────────────┘
                                              │ Orders Ingestion
                                              ▼
┌─────────────────────────┐       ┌────────────────────────┐       ┌─────────────────────────┐
│  Pathao Merchant API    │◄─────►│   MiBx Dispatch App    │◄─────►│   Supabase PostgreSQL   │
│  (Consignment & Status) │       │   (Next.js 16 Server)  │       │   (Auth, Orders, RLS)   │
└─────────────────────────┘       └───────────┬────────────┘       └─────────────────────────┘
                                              │
                      ┌───────────────────────┼───────────────────────┐
                      ▼                       ▼                       ▼
            ┌───────────────────┐   ┌───────────────────┐   ┌───────────────────┐
            │   Upstash Redis   │   │   FraudSpy API    │   │  SMS Gateway API  │
            │   (Cache & Queue) │   │   (Risk Analytics)│   │  (Customer Alerts)│
            └───────────────────┘   └───────────────────┘   └───────────────────┘
```

### 3.1 Order Ingestion & Sync Flow
1. **Webhooks (`/api/webhooks/shopify`):** Receives `orders/create`, `orders/updated`, `orders/cancelled`, `orders/paid`, `refunds/create`, `returns/*`.
2. **Order Upsert:** Saves order lines, pricing, shipping address, and customer details into `orders` and `customers` tables in Supabase.
3. **Fraud Check:** If enabled in `app_settings`, triggers automatic customer risk scoring via FraudSpy or internal BD phone heuristics, updating Shopify customer/order tags and attributes (`FraudSpy Verified`).

### 3.2 Dispatch Lifecycle Flow
1. **Dispatcher Action (`/api/dispatch`):** Staff selects order, verifies address/phone/pricing, and confirms Pathao store and delivery mode.
2. **Pathao Consignment:** Calls Pathao API to issue consignment ID and calculates delivery fee.
3. **Internal Dispatches Record:** Writes record to `dispatches` table and transitions `orders.internal_status` to `dispatched`.
4. **Shopify Fulfillment:** Generates fulfillment order on Shopify with Pathao tracking number and URL.
5. **Shopify Order Tags:** Appends tracking notes, tags, and FraudSpy attributes.
6. **Automated SMS:** Dispatches notification SMS to customer with tracking link and payable COD amount.

### 3.3 Delivery & Return Status Reconciliation
1. **Inbound Webhook (`/api/webhooks/pathao`):** Pathao posts status events (`Delivered`, `Partial Delivered`, `Returned`, `Paid Return`, `Cancelled`, `Out for Delivery`).
2. **Scheduled Sync (`/api/cron/courier-sync`):** QStash triggers hourly reconciliation for in-flight parcels.
3. **State Transitions:**
   - Full delivery: `internal_status = 'delivered'`, sets `delivered_at`, marks Shopify fulfillment delivered, triggers SMS.
   - Partial delivery: Creates record in `returns` table (`return_type = 'partial'`), adjusts order line items and total, marks partial delivery in Shopify.
   - Return / Paid Return: Creates record in `returns` table, marks `returned`, tracks `return_delivery_fee`.
4. **Cache Invalidation:** Flushes `dashboard:metrics:v1:*` and `dashboard:stats` in Upstash Redis.

---

## 4. Database Schema Structure
The system maintains the following core tables:
- **`profiles`:** User profile mapping to `auth.users`, storing `full_name` and `role` (`admin` or `staff`).
- **`app_settings`:** Global singleton containing API credentials (Shopify, Pathao, FraudSpy, SMS), store configurations, delivery charge defaults, and SMS automation templates.
- **`customers`:** Denormalized Shopify customer database with total orders, total spent, and communication preferences.
- **`orders`:** Central dispatch orders table with Shopify metadata, customer snapshot, line items JSONB, financial status, ERP internal status, and tracking IDs.
- **`dispatches`:** Detailed history of Pathao consignments, shipping fee, courier status timeline (`tracking_history`), and dispatcher profile attribution.
- **`returns`:** Detailed audit table for returns, partial rejections, exchange tracking, restocking status, and courier return charges.
- **`order_events`:** Audit trail for order timeline events (sync, dispatch, delivery, status change).
- **`webhook_logs`:** Inbound and outbound webhook telemetry with payload snapshots and error messages.
- **`sync_logs`:** Historical execution status of background Shopify and courier synchronizations.
- **`shopify_orders`, `shopify_products`, `shopify_collections`, `shopify_line_items`:** Independent reporting tables for sales analytics.
- **`transactions`:** Ledger for financial income/expense entries.

---

## 5. Security & Authentication Flow
- **Session Auth:** Handled via `@supabase/ssr` cookies with `httpOnly`, `secure`, and `sameSite` configuration refreshed by `src/proxy.ts`.
- **RBAC:** `admin` vs `staff`. Sensitive administrative functions (team invitations, system settings, financial mutations) require `admin` role authorization.
- **Webhook Authentications:**
  - Shopify webhooks verify HMAC-SHA256 (`x-shopify-hmac-sha256`) against `SHOPIFY_WEBHOOK_SECRET`.
  - Pathao webhooks verify integration secret and HMAC signatures.
  - QStash cron endpoints verify cryptographic receiver signature (`upstash-signature`).
