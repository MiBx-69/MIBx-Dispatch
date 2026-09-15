# MiBx Dispatch

**MiBx Dispatch** is a bespoke, single-tenant ERP and logistics middleware built for Shopify. It acts as the central brain between a Shopify storefront and third-party logistics providers (specifically Pathao), automating order ingestion, fraud detection, courier dispatching, bidirectional status syncing, and customer SMS notifications.

Built with **Next.js 14**, **Supabase (PostgreSQL)**, and **Upstash (Redis & QStash)**, this system is designed to handle high-volume e-commerce operations while maintaining a strict, auditable trail of every order event.

---

## 🏗 Architecture & Tech Stack

- **Framework**: [Next.js 14](https://nextjs.org/) (App Router)
- **Database & Auth**: [Supabase](https://supabase.com/) (PostgreSQL with Row-Level Security)
- **Caching & Locks**: [Upstash Redis](https://upstash.com/)
- **Cron & Queues**: [Upstash QStash](https://upstash.com/)
- **Integrations**:
  - **Shopify Admin API**: Order ingestion, fulfillment updates, tagging.
  - **Pathao Courier API**: Consignment creation, tracking, webhook syncing.
  - **FraudSpy API**: Automated phone-number-based fraud probability scoring.
  - **SMS.net.bd**: Customer SMS automation (Dispatch, Out for Delivery, Delivered, Returned).

---

## ✨ Core Features

### 1. Shopify Webhook Ingestion & Processing
- **Secure Verification**: Validates all incoming Shopify webhooks using HMAC-SHA256 signatures.
- **Idempotency**: Prevents duplicate order processing by checking existing records in Supabase.
- **Automated Fraud Scoring**: Asynchronously checks customer phone numbers against the **FraudSpy API**. Caches results to minimize API calls and automatically tags the Shopify order with risk levels (e.g., `Fraud: High`, `Fraud: Safe`) and notes.

### 2. Pathao Courier Integration & Webhooks
- **Consignment Generation**: Automatically or manually pushes Shopify orders to Pathao as consignments.
- **Asynchronous Webhook Processing**: Pathao strictly enforces a 2-second timeout on webhooks. MiBx Dispatch acknowledges the webhook immediately (HTTP 202) and processes the heavy lifting (DB updates, Shopify syncing, SMS dispatch) asynchronously.
- **Bidirectional Sync**: Maps Pathao statuses (e.g., `Partial Delivered`, `Paid Return`, `Out for Delivery`) to internal ERP states and pushes fulfillment updates directly back to Shopify.

### 3. Automated SMS Notifications (SMS.net.bd)
- **Event-Driven Alerts**: Sends localized (Bengali/English) SMS notifications based on courier events (Dispatched, Out for Delivery, Delivered, Returned, On Hold).
- **Strict Deduplication**: Utilizes Upstash Redis locks (`idempotency:sms:<key>`) and Supabase database checks to ensure customers **never** receive duplicate messages for the same event.
- **Sender ID Routing**: Intelligently routes messages through Masked (Sender ID) or Non-Masked routes based on merchant configuration in `app_settings`.

### 4. Background Cron Syncing (Upstash QStash)
- **Fail-safe Synchronization**: Runs a QStash-triggered cron job (`/api/cron/courier-sync`) that scans all dispatches from the last 7 days that haven't reached a terminal state.
- **Security**: Validates requests using Upstash's primary/secondary signing keys, with a fallback to a custom `CRON_SECRET` for manual triggers.

### 5. Single-Tenant Data Model & RLS
- **Authentication**: Uses Supabase Auth. The `profiles` table extends `auth.users` via the `handle_new_user` PostgreSQL trigger.
- **Authorization**: The database is structured as a **single-tenant** system (one store per deployment). Row-Level Security (RLS) is used primarily to gate access between `anonymous` (blocked) and `authenticated` (allowed) users, with specific checks for the `admin` role via a custom `is_admin()` Postgres function.

---

## 🔒 Security & Known Issues

While MiBx Dispatch is designed for production use, the following architectural decisions and known issues should be noted:

- **Async Context in Serverless (Vercel/Cloudflare)**: The Pathao webhook handler returns a 202 immediately and uses a floating promise (`(async () => { ... })()`) to process data. In strict serverless environments (like Vercel), this background process may be prematurely terminated if the function goes to sleep. **Remedy**: Deploy on a long-running Node.js server, or refactor to use `waitUntil()` (Next.js Edge) or offload to a dedicated queue worker (QStash).
- **Webhook Replay Attacks**: While Shopify webhooks are protected via HMAC signatures, Pathao webhooks rely on a static secret header. If this secret is compromised, replay attacks are possible. (Deduplication logic mitigates the impact, but the vector exists).
- **Rate Limiting**: There is an intentional lack of strict rate limiting on incoming webhooks to ensure bulk order updates from Shopify/Pathao are not dropped during peak sales events.
- **Single-Tenant Scope**: The database schema does not include a `tenant_id` or `org_id`. It is strictly designed for one merchant per database instance.

---

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- Supabase Project (Postgres database)
- Upstash Redis & QStash account
- Shopify Custom App credentials
- Pathao Merchant credentials
- SMS.net.bd API Key
- FraudSpy API Key

### Environment Setup
Copy the example environment file and fill in your keys:
```bash
cp .env.example .env.local
```

### Database Initialization
Run the Supabase migrations against your local or remote database:
```bash
# Ensure Supabase CLI is installed
supabase link --project-ref <your-project-ref>
supabase db push
```

### Running Locally
```bash
npm install
npm run dev
```

---

## 📜 License

[MIT License](LICENSE)
