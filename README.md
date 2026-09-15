# MiBx Dispatch

MiBx Dispatch is a robust logistics and fulfillment management dashboard built to streamline e-commerce operations. It integrates seamlessly with Shopify, local couriers (like Pathao), and SMS gateways to automate order dispatching, reporting, tracking, and customer communications.

## Features

- **Shopify Integration:** Automatically syncs orders, products, and customer details via Webhooks. Pushes fulfillment updates back to Shopify.
- **Courier Integration (Pathao):** Automates the delivery process by pushing order details to Pathao and retrieving real-time statuses.
- **SMS Notifications:** Automated SMS alerts to customers for order confirmation, dispatch, out-for-delivery, and returns.
- **Fraud Detection:** Evaluates orders for potential fraud or return risks using custom algorithms and historical data.
- **Return Management:** Track returned packages and manage fulfillment lifecycles.
- **Role-Based Access Control:** Secure access leveraging Supabase authentication and Row-Level Security (RLS).
- **Comprehensive Reporting & Analytics:** Dashboards, revenue charts, fulfillment stats, and Pathao reconciliation.

## Tech Stack

- **Framework:** [Next.js](https://nextjs.org/) 15 (App Router, React 19)
- **Database & Auth:** [Supabase](https://supabase.com/) (PostgreSQL)
- **Styling:** [Tailwind CSS](https://tailwindcss.com/) & [shadcn/ui](https://ui.shadcn.com/)
- **Background Jobs:** [Upstash QStash](https://upstash.com/) for cron tasks and asynchronous webhooks processing.
- **Caching:** [Upstash Redis](https://upstash.com/)

## Getting Started

### Prerequisites

- Node.js >= 18
- Supabase project
- Upstash Redis & QStash account
- Shopify Partner account & Custom App credentials
- Pathao Courier credentials

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/your-username/mibx-dispatch.git
   cd mibx-dispatch
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Set up environment variables:**
   Copy `.env.example` to `.env` and fill in the required keys.
   ```bash
   cp .env.example .env
   ```

4. **Run the development server:**
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000) with your browser to see the application.

## Deployment

This project is optimized for deployment on [Vercel](https://vercel.com). Ensure all environment variables are correctly configured in your deployment platform's settings.
