<div align="center">
  <h1>🚀 MiBx Dispatch</h1>
  <p>
    <strong>An Enterprise-Grade Fulfillment, Logistics, and Operations Dashboard for Modern E-Commerce</strong>
  </p>
  <p>
    <a href="https://nextjs.org/"><img src="https://img.shields.io/badge/Next.js-15-black?style=flat-square&logo=next.js" alt="Next.js" /></a>
    <a href="https://supabase.com/"><img src="https://img.shields.io/badge/Supabase-Database%20%26%20Auth-3ECF8E?style=flat-square&logo=supabase&logoColor=white" alt="Supabase" /></a>
    <a href="https://tailwindcss.com/"><img src="https://img.shields.io/badge/Tailwind_CSS-v4-38B2AC?style=flat-square&logo=tailwind-css&logoColor=white" alt="Tailwind CSS" /></a>
    <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-Ready-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript" /></a>
  </p>
</div>

<hr />

## 📖 Overview & The Problem We Solve

In modern e-commerce, the gap between receiving an order and successfully delivering it is fraught with inefficiencies. Brands struggle with disjointed systems—where storefronts (like Shopify), third-party couriers (like Pathao), and customer communication channels remain isolated. This fragmentation leads to manual data entry errors, delayed dispatch times, lack of real-time tracking visibility, and vulnerability to fraudulent orders resulting in expensive return-to-sender (RTS) costs.

**MiBx Dispatch** bridges this gap. 

Designed as a central logistics nervous system, MiBx Dispatch programmatically unifies Shopify, local courier APIs, and SMS gateways. It eliminates manual workflows through automated dispatching, intercepts fraudulent orders using predictive risk analytics, and ensures total operational transparency via real-time dashboards and financial reconciliation.

---

## ✨ Enterprise-Level Features

### 🛡️ Intelligent Fraud Prevention & Risk Analytics
Return-to-sender (RTS) shipments are a massive drain on profit margins. 
- **Predictive Scoring:** Automatically evaluates incoming orders based on historical data, customer purchase behavior, and delivery success rates.
- **FraudSpy Integration:** Cross-references customer phone numbers and addresses to generate a reliable trust score before a label is ever printed.
- **Automated Holds:** High-risk orders are automatically flagged and placed on a review hold, requiring manual operational override before dispatch.

### 🛍️ Deep Shopify & Courier Interoperability
- **Bi-Directional Webhooks:** Listens to Shopify for instant order creation and fulfillment updates while simultaneously pushing courier status changes (e.g., "Out for Delivery", "Delivered") back to the storefront.
- **Pathao (Courier) Automation:** One-click bulk dispatching. Generates waybills, calculates shipping costs dynamically based on delivery zones, and maps delivery statuses back to internal operational states.
- **Asynchronous Processing:** Utilizes **Upstash QStash** to queue and process webhooks asynchronously, ensuring no data is dropped even during massive traffic spikes or courier API downtimes.

### 🔄 Advanced Returns & Reconciliation Management
- **Lifecycle Tracking:** Granular tracking of returned, canceled, and partially delivered packages, ensuring inventory is accurately restocked and accounted for.
- **Financial Reconciliation:** Dashboards that automatically reconcile courier invoices against actual shipped and returned items, immediately surfacing discrepancies and preventing revenue leakage.

### 📱 Automated Customer Engagement
- **Event-Driven SMS:** Triggers localized SMS alerts automatically when orders are confirmed, dispatched, out-for-delivery, or returned.
- **Customization:** Full control over Sender IDs and message templates directly from the settings panel.

---

## 🔒 Security & Architecture

Security is baked into the foundation of MiBx Dispatch to protect sensitive merchant and customer data.

- **Supabase Row-Level Security (RLS):** Database access is heavily restricted at the Postgres engine level. Authenticated users can only read or mutate rows that belong to their explicitly authorized tenant/organization.
- **Next.js Server Actions:** Sensitive operations (like generating courier API tokens, evaluating fraud rules, and triggering SMS) are strictly confined to the server. API keys are never exposed to the client bundle.
- **Cryptographic Webhook Verification:** 
  - **Shopify:** All incoming payloads are verified using HMAC-SHA256 signatures ensuring they originated exclusively from Shopify.
  - **Pathao/Couriers:** Incoming status updates are validated using custom integration secrets.
- **Secure Key Management:** Database migrations, cron jobs, and background workers operate using scoped Service Role Keys that bypass RLS, safely stored in environment variables and never committed to source control.

---

## 🛠️ Technology Stack

| Category | Technology | Description |
| :--- | :--- | :--- |
| **Frontend Framework** | [Next.js (App Router)](https://nextjs.org) | React 19 framework utilizing Server Components for performance and security. |
| **Database & Auth** | [Supabase](https://supabase.com) | Enterprise-grade PostgreSQL database with integrated Authentication and RLS. |
| **Styling & UI** | [Tailwind CSS v4](https://tailwindcss.com) | Utility-first CSS combined with [shadcn/ui](https://ui.shadcn.com) for accessible, premium components. |
| **Message Queue** | [Upstash QStash](https://upstash.com) | Serverless HTTP-based messaging and scheduling for reliable background jobs. |
| **Caching** | [Upstash Redis](https://upstash.com) | Low-latency data store for rate-limiting, session caching, and heavy query optimization. |

---

## 🚀 Getting Started

Follow these instructions to set up the project locally for development or production deployment.

### 1. Prerequisites
- **Node.js** (v18 or higher)
- **Supabase Project** (Database, Auth, and Storage)
- **Upstash Account** (Redis & QStash)
- **Shopify Partner Account** (Custom App credentials and configured webhooks)
- **Courier API Credentials** (e.g., Pathao Merchant Account)

### 2. Installation

Clone the repository and install the dependencies:

```bash
git clone https://github.com/your-username/mibx-dispatch.git
cd mibx-dispatch
npm install
```

### 3. Environment Configuration

Copy the example environment file:
```bash
cp .env.example .env
```
Ensure you carefully populate the following required variables:
- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (Keep this strictly secret!)
- `QSTASH_TOKEN` / `QSTASH_CURRENT_SIGNING_KEY`
- `SHOPIFY_API_KEY` / `SHOPIFY_API_SECRET`
- `PATHAO_CLIENT_ID` / `PATHAO_CLIENT_SECRET` (or respective courier keys)

### 4. Database Initialization

Run the included Supabase migrations to provision your schemas, tables, views, and RLS policies:
```bash
# Using the Supabase CLI
supabase link --project-ref your-project-ref
supabase db push
```

### 5. Start the Development Server

```bash
npm run dev
```
Navigate to [http://localhost:3000](http://localhost:3000) to access the application.

---

## ☁️ Deployment Guide

MiBx Dispatch is architected for edge-ready deployment on [Vercel](https://vercel.com/). 

1. **Connect Repository:** Import the GitHub repository into your Vercel dashboard.
2. **Environment Variables:** Ensure *all* variables from your `.env` are mirrored in Vercel's environment settings.
3. **Cron Jobs:** The system utilizes standard API routes for periodic tasks (e.g., `api/cron/courier-sync`). Ensure your deployment platform or a service like cron-job.org is pinging these endpoints securely.
4. **Deploy:** Trigger the build and deploy.

---

<div align="center">
  <p>Architected for scale. Built for modern e-commerce.</p>
</div>
