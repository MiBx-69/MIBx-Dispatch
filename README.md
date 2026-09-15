<div align="center">
  <h1>🚀 MiBx Dispatch</h1>
  <p>
    <strong>A high-performance logistics, fulfillment, and operations dashboard for modern e-commerce.</strong>
  </p>
  <p>
    <a href="https://nextjs.org/"><img src="https://img.shields.io/badge/Next.js-15-black?style=flat-square&logo=next.js" alt="Next.js" /></a>
    <a href="https://supabase.com/"><img src="https://img.shields.io/badge/Supabase-Database%20%26%20Auth-3ECF8E?style=flat-square&logo=supabase&logoColor=white" alt="Supabase" /></a>
    <a href="https://tailwindcss.com/"><img src="https://img.shields.io/badge/Tailwind_CSS-v4-38B2AC?style=flat-square&logo=tailwind-css&logoColor=white" alt="Tailwind CSS" /></a>
    <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-Ready-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript" /></a>
  </p>
</div>

<hr />

## 📖 Overview

**MiBx Dispatch** is a comprehensive fulfillment and logistics management system designed to sit between your Shopify storefront and your local courier partners. It automates the tedious parts of e-commerce logistics, offering intelligent fraud detection, seamless courier dispatching, real-time SMS notifications, and rich analytics—all wrapped in a premium, responsive UI.

---

## ✨ Core Capabilities

### 🛍️ Deep Shopify Integration
- **Real-Time Sync:** Leverages Shopify Webhooks to instantly sync orders, products, and customer profiles.
- **Fulfillment Automation:** Pushes delivery updates, tracking numbers, and fulfillment events back to Shopify automatically.

### 🚚 Courier Automation (Pathao & more)
- **Instant Dispatch:** Send orders directly to Pathao or other integrated logistics partners with a single click.
- **Status Tracking:** Automatically pulls real-time delivery statuses to keep your team and customers informed.

### 📱 Customer Engagement (SMS)
- **Automated Alerts:** Trigger custom SMS messages based on order lifecycle events (Order Confirmed, Dispatched, Out for Delivery, Returned).
- **Custom Sender IDs:** Fully configurable SMS gateway settings right from the dashboard.

### 🛡️ Intelligent Fraud Prevention
- **Risk Analytics:** Employs custom algorithms and historical data to flag potentially fraudulent orders before they ship.
- **FraudSpy Integration:** Cross-references customer data to calculate a reliable trust score.

### 🔄 Returns Management
- **Lifecycle Tracking:** Granular tracking of returned packages ensuring accurate inventory reconciliation.
- **Partial Returns:** Native support for managing partial deliveries and customized return flows.

### 📊 Advanced Reporting
- **Financial Dashboards:** Track revenue, shipping costs, and profit margins.
- **Reconciliation:** Easily reconcile courier invoices against actual shipped and returned items to prevent revenue leakage.

---

## 🛠️ Technology Stack

Our architecture is built for speed, security, and scale:

| Category | Technology | Description |
| :--- | :--- | :--- |
| **Frontend Framework** | [Next.js (App Router)](https://nextjs.org) | React 19 powered framework for server-side rendering and static generation. |
| **Database & Auth** | [Supabase](https://supabase.com) | Enterprise-grade Postgres database with robust Row-Level Security (RLS). |
| **Styling & UI** | [Tailwind CSS v4](https://tailwindcss.com) | Utility-first CSS framework combined with [shadcn/ui](https://ui.shadcn.com) for accessible components. |
| **Background Jobs** | [Upstash QStash](https://upstash.com) | Reliable serverless task scheduling and asynchronous webhook processing. |
| **Caching** | [Upstash Redis](https://upstash.com) | Low-latency caching for heavy queries and rate-limiting. |

---

## 🚀 Getting Started

Follow these instructions to set up the project locally.

### 1. Prerequisites

Ensure you have the following installed and configured:
- **Node.js** (v18 or higher)
- **Git**
- A **Supabase** Project
- An **Upstash** Account (Redis & QStash)
- **Shopify Partner Account** (for Custom App credentials)
- **Pathao Courier Credentials**

### 2. Installation

Clone the repository and install the dependencies:

```bash
# Clone the repo
git clone https://github.com/your-username/mibx-dispatch.git
cd mibx-dispatch

# Install dependencies using npm (or yarn/pnpm)
npm install
```

### 3. Environment Configuration

Copy the example environment file and configure it with your credentials:

```bash
cp .env.example .env
```

**Key Environment Variables to configure:**
- `NEXT_PUBLIC_SUPABASE_URL` & `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (for secure server-side operations)
- `QSTASH_TOKEN` & `QSTASH_CURRENT_SIGNING_KEY`
- `SHOPIFY_API_KEY` & `SHOPIFY_API_SECRET`

### 4. Database Setup

Ensure you run the included Supabase migrations to set up your schemas, tables, and RLS policies:
```bash
# Assuming you have the Supabase CLI installed
supabase link --project-ref your-project-ref
supabase db push
```

### 5. Start the Development Server

```bash
npm run dev
```
Navigate to [http://localhost:3000](http://localhost:3000) to access the dashboard.

---

## 🔒 Security & Architecture

- **Row Level Security (RLS):** All database interactions are protected via Supabase RLS, ensuring users only access authorized data.
- **Server Actions:** Secure server-side mutations in Next.js prevent sensitive logic and keys from leaking to the client.
- **Webhook Verification:** All incoming webhooks (Shopify, Pathao) are cryptographically verified to ensure authenticity.

---

## ☁️ Deployment

MiBx Dispatch is optimized for seamless deployment on [Vercel](https://vercel.com/). 

1. Push your code to your GitHub repository.
2. Import the project into Vercel.
3. Add all required environment variables in the Vercel dashboard.
4. Deploy!

---

<div align="center">
  <p>Built with ❤️ for modern e-commerce operations.</p>
</div>
