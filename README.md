<div align="center">

# 🚀 MiBx Dispatch

### Shopify → Fraud Intelligence → Bulk Dispatch → Courier Tracking → SMS → Returns → Finance → Reporting

<p>
  <strong>Production-focused e-commerce dispatch & operations platform built to eliminate repetitive logistics work.</strong>
</p>

<p>
  <a href="https://nextjs.org/"><img src="https://img.shields.io/badge/Next.js-16-black?style=for-the-badge&logo=next.js" alt="Next.js" /></a>
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-5-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" /></a>
  <a href="https://supabase.com/"><img src="https://img.shields.io/badge/Supabase-PostgreSQL%20%7C%20Auth-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white" alt="Supabase" /></a>
  <a href="https://upstash.com/"><img src="https://img.shields.io/badge/Upstash-Redis%20%7C%20QStash-00E699?style=for-the-badge&logo=upstash&logoColor=white" alt="Upstash" /></a>
  <a href="https://tailwindcss.com/"><img src="https://img.shields.io/badge/Tailwind%20CSS-4-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white" alt="Tailwind CSS" /></a>
</p>

<p>
  <img src="https://img.shields.io/badge/Domain-E--commerce%20Operations-111827?style=flat-square" />
  <img src="https://img.shields.io/badge/Architecture-Event--Driven-111827?style=flat-square" />
  <img src="https://img.shields.io/badge/UI-Desktop%20%2B%20Mobile--First-111827?style=flat-square" />
</p>

</div>

---

## 🎯 What is MiBx Dispatch?

**MiBx Dispatch** is a custom Shopify operations platform built around a real e-commerce problem: a growing order volume was being processed with repetitive manual dispatch, delivery, return, reporting, and customer-communication work.

Instead of treating dispatch as a simple order form, the system connects the entire operational chain into one workflow:

> **Shopify Order → Verification → Fraud Intelligence → Operational Review → Bulk Dispatch → Courier Events → Customer SMS → Delivery / Return → Finance → KPI Reporting**

The project combines **business-process automation, API integrations, warehouse-oriented UX, real-time operational data, and secure backend workflows** in a single application.

---

## 💼 The Business Problem

Before MiBx Dispatch, key daily operations depended heavily on manual work:

| Operational problem | What was built |
|---|---|
| 50–100 orders/day required repetitive manual dispatch entry | **One-click bulk dispatch workflow** for high-volume order processing |
| Large batches of orders took significant operator time | **Batch processing** capable of dispatching **1,000+ orders within seconds** under the designed workflow |
| Month-end reporting required manual collection and preparation | **Daily + monthly reporting with live KPI visibility** |
| Delivery and return statuses had to be checked and updated manually | **Courier webhook/event synchronization** with automated status updates |
| Customer updates were repetitive and easy to miss | **Automated SMS communication pipelines** for operational events |
| COD/fraud checks required manual investigation | **Customer history + fraud intelligence workflow** with risk tagging |
| Operational data lived across multiple systems | **Centralized dispatch, finance, reporting, customer and courier operations** |

### 📈 Result

MiBx Dispatch was designed around actual day-to-day business requirements and automated **15+ operational pain points**, reducing repetitive/manual workload by approximately **45%** across the targeted workflows.

---

## ⚡ Flagship Capability: Bulk Dispatch

The most important workflow in the system is the **bulk dispatch engine**.

Instead of entering courier information order-by-order, operators can:

```text
Select eligible orders
        ↓
Run validation / operational checks
        ↓
Bulk dispatch request
        ↓
Courier API integration
        ↓
Waybill / dispatch confirmation
        ↓
Persist status + tracking information
        ↓
Trigger customer communication
```

### Why it matters

- Designed for **high-volume order operations**
- Removes repetitive manual data entry
- Keeps the order lifecycle connected to courier events
- Makes warehouse dispatch a **batch operation instead of a one-order-at-a-time task**
- Supports large operational bursts, with the current README documenting **1,000+ order dispatch processing within seconds**

---

## 🧠 Fraud & Customer Intelligence

MiBx Dispatch does more than move orders between systems.

The platform can evaluate customer/order history through an external fraud-checking workflow and use the result to support operational decisions.

Typical flow:

```text
Shopify Order
    ↓
Customer / Phone History
    ↓
Fraud Intelligence API
    ↓
Risk Assessment
    ↓
Shopify / Dispatch Tags
    ↓
Safe → Dispatch Queue
High Risk → Review / Hold
```

This reduces the amount of manual investigation required before COD fulfillment and gives operators a faster view of customer history, returns, delivery behavior, and order risk.

---

## 📊 Operations & Reporting

The reporting layer was built to replace manual month-end preparation with **continuous operational visibility**.

### Dashboard & KPI visibility

- Daily order volume
- Sales and revenue KPIs
- Dispatch performance
- Delivery performance
- Return activity
- COD / collection information
- Courier operational metrics
- Financial reconciliation data

### Reporting

- Daily performance reporting
- Monthly business reporting
- Operational filtering
- Detailed report views
- CSV / PDF export workflows

The goal is not only to store data—it is to turn operational data into **actionable management information**.

---

## 🔄 Delivery, Returns & Courier Synchronization

MiBx Dispatch connects internal order records with courier-side events.

```text
Courier Event
     ↓
Webhook / Sync Endpoint
     ↓
Validate Event
     ↓
Map Courier Status
     ↓
Update Dispatch Record
     ↓
Update Shopify / Internal State
     ↓
Trigger Relevant Notification
```

This supports a more reliable lifecycle for:

**Pending → Dispatched → In Transit → Out for Delivery → Delivered / Returned**

The architecture also provides a foundation for integrating additional courier providers beyond the current implementation.

---

## 📱 Built for Warehouse Operations

Warehouse teams do not always work from a desktop workstation. MiBx Dispatch therefore includes a **mobile-first operational interface** with touch-friendly navigation and workflows designed around quick actions.

### Desktop

<div align="center">
  <table>
    <tr>
      <td align="center"><b>Dashboard & Analytics</b><br><i>Live KPIs & operations overview</i></td>
      <td align="center"><b>Orders & Dispatching</b><br><i>Filtering, bulk actions & dispatch</i></td>
      <td align="center"><b>Dispatches & Returns</b><br><i>Tracking & return operations</i></td>
    </tr>
    <tr>
      <td><img src="./public/demo-data/dashboard.png" alt="MiBx Dispatch Dashboard" width="300" /></td>
      <td><img src="./public/demo-data/orders.png" alt="MiBx Dispatch Orders" width="300" /></td>
      <td><img src="./public/demo-data/dispatches.png" alt="MiBx Dispatch Dispatches" width="300" /></td>
    </tr>
    <tr>
      <td align="center"><b>Finance & Reconciliation</b><br><i>Cashflow & collection tracking</i></td>
      <td align="center"><b>Reporting</b><br><i>Operational reports & exports</i></td>
      <td align="center"><b>Settings & Integrations</b><br><i>System configuration & rules</i></td>
    </tr>
    <tr>
      <td><img src="./public/demo-data/finance.png" alt="MiBx Dispatch Finance" width="300" /></td>
      <td><img src="./public/demo-data/report.png" alt="MiBx Dispatch Reports" width="300" /></td>
      <td><img src="./public/demo-data/settings.png" alt="MiBx Dispatch Settings" width="300" /></td>
    </tr>
  </table>
</div>

### Mobile / Warehouse UI

<div align="center">
  <table>
    <tr>
      <td align="center"><b>Dashboard</b></td>
      <td align="center"><b>Orders</b></td>
      <td align="center"><b>Reports</b></td>
      <td align="center"><b>Settings</b></td>
    </tr>
    <tr>
      <td><img src="./public/demo-data/mobile-dashboard.png" alt="Mobile Dashboard" width="200" /></td>
      <td><img src="./public/demo-data/mobile-orders.png" alt="Mobile Orders" width="200" /></td>
      <td><img src="./public/demo-data/mobile-report.png" alt="Mobile Reports" width="200" /></td>
      <td><img src="./public/demo-data/mobil-setting.png" alt="Mobile Settings" width="200" /></td>
    </tr>
  </table>
</div>

---

## 🏗️ System Architecture

```text
                         ┌──────────────────────┐
                         │       Shopify        │
                         │ Orders + Webhooks    │
                         └──────────┬───────────┘
                                    │
                                    ▼
                    ┌─────────────────────────────┐
                    │      MiBx Dispatch Core    │
                    │   Next.js App + Server Ops  │
                    └──────────────┬──────────────┘
                                   │
             ┌─────────────────────┼─────────────────────┐
             │                     │                     │
             ▼                     ▼                     ▼
      ┌─────────────┐      ┌───────────────┐      ┌─────────────┐
      │ Fraud /     │      │   Supabase    │      │   Upstash   │
      │ Customer    │      │ PostgreSQL +  │      │ Redis /     │
      │ Intelligence│      │ Auth + RLS    │      │ QStash      │
      └──────┬──────┘      └───────┬───────┘      └──────┬──────┘
             │                     │                     │
             └─────────────────────┼─────────────────────┘
                                   │
                                   ▼
                        ┌─────────────────────┐
                        │ Dispatch / Workflow │
                        │ Automation Layer    │
                        └──────────┬──────────┘
                                   │
                 ┌─────────────────┼─────────────────┐
                 │                 │                 │
                 ▼                 ▼                 ▼
          ┌─────────────┐   ┌────────────┐   ┌─────────────┐
          │ Courier API │   │ SMS / Mail │   │ Reporting & │
          │ + Webhooks  │   │ Pipelines  │   │ Finance     │
          └─────────────┘   └────────────┘   └─────────────┘
```

### Architecture principles

- **Server-side integrations** for sensitive credentials and privileged operations
- **Event-driven workflows** for webhooks and courier events
- **PostgreSQL-backed operational state** for orders, dispatches and reporting
- **Background processing** through QStash for asynchronous jobs
- **Redis caching / rate-limiting** for high-frequency operations
- **Responsive application layer** for desktop management and warehouse mobile usage

---

## 🔐 Security Engineering

Security is part of the application design rather than an afterthought.

### Database security

- **Supabase Row Level Security (RLS)** is used to control data access at the database layer.
- Authenticated users can be restricted to authorized organization / tenant data.

### Server-side secret handling

Sensitive operations stay on the server, including:

- Courier API credentials
- Fraud API credentials
- SMS provider credentials
- Service-role database access
- Webhook verification secrets

### Webhook integrity

Incoming integrations are verified before sensitive state changes are accepted.

- **Shopify:** HMAC-SHA256 webhook verification
- **Courier integrations:** secret-based validation / integration checks

### Operational security

- Environment variables for secret configuration
- No production secrets committed to source control
- Scoped service credentials for privileged background operations
- Authentication and authorization enforced around operational data

---

## 🛠️ Technology Stack

| Layer | Technology | Purpose |
| :--- | :--- | :--- |
| **Application** | Next.js 16 | Full-stack React application and server-side workflows |
| **Language** | TypeScript 5 | Type-safe application development |
| **UI** | Tailwind CSS 4 + shadcn/ui | Responsive, reusable operations interface |
| **Database** | Supabase / PostgreSQL | Operational data, reporting and persistence |
| **Authentication** | Supabase Auth | User authentication and session management |
| **Authorization** | PostgreSQL RLS | Database-level access control |
| **Background Jobs** | Upstash QStash | Deferred / asynchronous workflow execution |
| **Caching** | Upstash Redis | Low-latency caching and rate limiting |
| **Charts** | Recharts | KPI and analytics visualizations |
| **Documents** | jsPDF + AutoTable | PDF report generation |
| **Integrations** | Shopify + Courier APIs | Order, dispatch and delivery synchronization |
| **Messaging** | SMS / Email APIs | Automated customer communication |

Current dependency configuration includes Next.js 16.3.3, React 19.2.8, TypeScript 5, Supabase SSR/JS, Upstash QStash/Redis, Tailwind CSS 4 and Recharts. 

---

## 🔌 Core Integrations

### Shopify

- Order ingestion
- Webhook-driven synchronization
- Order tagging
- Fraud / risk metadata
- Operational status updates

### Courier

- Dispatch API integration
- Waybill generation / assignment
- Delivery status synchronization
- Return event handling

### Customer communication

- Automated dispatch notifications
- Delivery status notifications
- Custom operational messaging
- SMS workflow integration

---

## 🚀 Getting Started

### Prerequisites

- **Node.js 18+**
- **Supabase project**
- **Upstash Redis + QStash**
- **Shopify Partner / Custom App credentials**
- **Courier merchant/API credentials**

### 1. Clone

```bash
git clone https://github.com/MiBx-69/MIBx-Dispatch.git
cd MIBx-Dispatch
```

### 2. Install

```bash
npm install
```

### 3. Configure environment variables

```bash
cp .env.example .env
```

Configure the required values for:

- Supabase URL / anon key
- Supabase service role key
- QStash credentials
- Redis credentials
- Shopify API credentials
- Courier API credentials
- SMS provider credentials
- Fraud intelligence API credentials, where enabled

> **Never commit `.env` or production secrets.**

### 4. Prepare the database

```bash
supabase link --project-ref <your-project-ref>
supabase db push
```

### 5. Run locally

```bash
npm run dev
```

Open `http://localhost:3000`.

### Useful scripts

```bash
npm run dev      # development server
npm run build    # production build
npm run start    # production server
npm run lint     # ESLint
```

---

## ☁️ Deployment

The application is designed for modern serverless deployment, including **Vercel + Supabase + Upstash**.

Typical production setup:

```text
Vercel
  ├── Next.js application
  ├── Server-side integrations
  └── Cron / webhook endpoints

Supabase
  ├── PostgreSQL
  ├── Auth
  ├── RLS
  └── Storage

Upstash
  ├── Redis
  └── QStash
```

After deployment, configure all required environment variables and ensure external webhook providers point to the production endpoints.

---

## 📌 Why This Project Matters

MiBx Dispatch demonstrates a practical engineering approach to business automation:

> **Find the repetitive work → model the operational process → connect the systems → automate the bottleneck → expose the right KPIs → secure the workflow.**

This is not a generic demo dashboard. The product was shaped around real e-commerce operations and focuses on measurable reductions in repetitive work, faster dispatch execution, centralized visibility, and more reliable order lifecycle management.

---

## 👨‍💻 Project Context

**MiBx Dispatch** was designed and developed by **Moinul Islam Bappi** as an internal e-commerce operations and automation project.

The broader engineering focus includes:

- E-commerce operations automation
- Shopify systems
- Courier / logistics API integration
- CRM and workflow automation
- Business reporting and KPI dashboards
- AI-assisted development
- Secure web application architecture

### Related profile

- 🌐 Portfolio: https://moinulislam.pro
- 💼 LinkedIn: https://linkedin.com/in/moinul-islam-bappi
- 🏢 MiBrand Agency: https://mibrand.agency

---

<div align="center">

### ⚙️ Built to turn manual e-commerce operations into software.

**Architected for scale. Designed around real operational problems.**

</div>
