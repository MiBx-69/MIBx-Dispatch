# MIBx Dispatch

**Production-grade, mobile-first order dispatch for Shopify merchants shipping through REDX, Pathao, and Steadfast.**

Shopify remains the single source of truth for every order; MIBx Dispatch layers a secure, real-time operational control plane on top of it — so warehouse and fulfillment teams can search, verify, and dispatch orders to the correct courier in seconds, from a phone, without ever touching a spreadsheet or a courier's native dashboard.

---

## The Problem

E-commerce fulfillment in markets served by multiple regional couriers (REDX, Pathao, Steadfast) is a fragmented, manual, and error-prone process:

- **Fragmented tooling** — operators juggle the Shopify admin and three separate courier portals just to book a single shipment.
- **Manual re-keying** — order details are copy-pasted between systems, introducing typos in phone numbers, addresses, and COD amounts that directly cause failed or misrouted deliveries.
- **No single source of truth** — once an order is dispatched, there's no reliable, centralized record of *which* courier has it, its current status, or whether it was dispatched more than once.
- **No safety net for bulk operations** — bulk-dispatching hundreds of orders during a sale event is high-risk with no built-in de-duplication or rollback.
- **Desk-bound workflows** — most courier dashboards are not designed for a warehouse floor; staff need a tool that works one-handed, on a phone, with poor connectivity.
- **Multi-store, multi-tenant chaos** — agencies and larger merchants running several Shopify stores have no unified, access-controlled way to manage dispatch across all of them.

MIBx Dispatch exists to close this gap: **one secure, mobile-first surface that turns "confirmed Shopify order" into "dispatched with the correct courier" in a single verified action.**

---

## Why It Matters

- **Fewer failed deliveries.** Centralizing order and courier data removes the manual re-entry step that is the single biggest source of address/COD errors in last-mile logistics.
- **Operational speed.** A dispatch that used to require switching between four tabs now happens from one mobile-optimized screen — critical during flash sales and peak order volume.
- **Trust and auditability.** Every dispatch, sync, and credential access is scoped, logged, and authorized server-side — giving operations leads and merchants confidence that the system won't silently double-ship or leak courier credentials.
- **Built for the region it serves.** Native, first-class support for REDX, Pathao, and Steadfast — not a generic shipping abstraction retrofitted after the fact.
- **Scales from one store to many.** The multi-organization model means an agency or a merchant with multiple storefronts can operate from a single, permissioned control plane instead of duplicating tooling per store.

---

## Core Functionality

### Order Operations
- Real-time, searchable, filterable order list synchronized from Shopify
- Rich order detail view with full item, customer, and address context
- Live shipment tracking per order
- **Safe bulk dispatch** — select multiple eligible orders and dispatch them to a courier in one guarded action, with de-duplication to prevent double-booking
- Real-time refresh so the team is always looking at current state, not a stale cache

### Interface
- Next.js App Router application, fully responsive:
  - Sidebar navigation on desktop
  - Bottom navigation on mobile — designed for one-handed warehouse use
- Installable as a **Progressive Web App** (PWA manifest included)
- Accessible loading, empty, and error states throughout — no dead ends, no silent failures

### Shopify Integration
- OAuth **authorization-code install flow** with full HMAC and state verification
- Shopify **GraphQL Admin API** for order and product data
- Webhook **registration, signature verification, and deduplication** — protecting against replayed or forged events
- Initial sync + ongoing **reconciliation job queue** to keep local state consistent with Shopify, even after downtime
- Order and product **snapshots**, plus dispatch status tracked via Shopify metafields — so dispatch state is visible back in the Shopify admin itself

### Courier Integration
- Native connections to **REDX**, **Pathao**, and **Steadfast**
- Per-store courier credential management, isolated from client-side code

---

## Security Architecture

Security is treated as a first-class product requirement, not an afterthought:

| Layer | Protection |
|---|---|
| **Data isolation** | Row-Level Security (RLS) enforced on **every** tenant and security-sensitive Supabase table — no tenant can see another tenant's data at the database layer, independent of application logic |
| **Credential storage** | Courier and Shopify credentials are never exposed to authenticated or anonymous database grants; protected additionally with **AES-256-GCM envelope encryption** at rest |
| **Authentication** | Supabase Auth with email login as the reliable baseline, plus an **experimental passkey (WebAuthn) flow**, deliberately isolated in its own module (`src/lib/auth/passkeys.ts`) so it can evolve independently of core auth |
| **Authorization** | Server-side authorization enforced on every privileged action — the client is never trusted to self-report permissions |
| **Shopify trust boundary** | Installation and webhook flows verify **HMAC signatures and OAuth state** on every request, and webhook events are deduplicated to prevent replay-driven side effects |
| **Secrets hygiene** | Hard rule: service-role keys, Shopify access tokens, courier credentials, and the encryption key must **never** be exposed via `NEXT_PUBLIC_*` environment variables |
| **Verification** | A dedicated RLS test suite (`supabase/tests/tenant_isolation.sql`) asserts tenant isolation is actually active — not just assumed |
| **Multi-tenancy** | Full multi-organization / multi-store model with role-based access, so permissions are scoped per store, not global |

> **Design principle:** every layer — database, API, and application — independently enforces authorization. A bug in one layer should never be sufficient, on its own, to leak another tenant's data or credentials.

---

## Tech Stack

- **Frontend / App Framework:** Next.js (App Router), PWA-enabled
- **Backend / Data Layer:** Supabase (Postgres + Row-Level Security)
- **Commerce Platform:** Shopify GraphQL Admin API, OAuth, Webhooks
- **Auth:** Supabase Auth (email) + experimental WebAuthn/passkey support
- **Encryption:** AES-256-GCM envelope encryption for stored secrets

---

## Getting Started

```bash
npm run dev
```

1. Sign in by email
2. Connect your `.myshopify.com` store from **Settings**
3. Register a passkey (optional, experimental)
4. Run **Sync Now** to pull orders from Shopify
5. Test the courier connection for REDX, Pathao, or Steadfast
6. Dispatch an eligible real order to confirm the end-to-end flow

### Quality & Verification Commands

```bash
npm run typecheck    # Static type verification
npm run lint          # Code quality checks
npm test              # Unit / integration test suite
npm run test:rls      # Row-Level Security policy tests
npm run build         # Production build
```

For a database-level RLS verification against a local Supabase stack:

```bash
supabase test db
```

> The included `supabase/tests/tenant_isolation.sql` asserts RLS is active. Before a production release, extend it with real, locally-seeded User A / User B JWT fixtures to fully validate tenant isolation under realistic conditions.

---

## Production Readiness Checklist

Before shipping to production, confirm the following are explicitly configured — none of these are safe defaults:

- [ ] Production URLs configured with HTTPS enforced end-to-end
- [ ] Supabase Auth redirect URL allow-list locked down
- [ ] Shopify OAuth callback and webhook URLs set to production endpoints
- [ ] Content-Security-Policy `frame-ancestors` configured
- [ ] SMTP provider configured for transactional email
- [ ] Error monitoring / observability wired in
- [ ] Automated database backups enabled
- [ ] A real cron-based consumer running for the reconciliation job queue
- [ ] A production-grade **external** rate-limit store in place — the in-process limiter is intentionally development-only and will not survive multi-instance deployment

---

## Who This Is For

- Shopify merchants in markets served by REDX, Pathao, or Steadfast who need reliable, error-resistant dispatch
- Fulfillment and warehouse teams who need a mobile-first tool, not a desk-bound admin panel
- Agencies and multi-store operators who need centralized, role-based control across several Shopify storefronts
- Operations leads who need auditability and confidence that dispatch actions are safe, authorized, and non-duplicative

---

## License

Add license details here.

---

*This README reflects the current architecture and operational model of MIBx Dispatch. Contributions should preserve the security invariants above — particularly RLS coverage, credential isolation, and the fail-loud posture on Shopify webhook/install verification.*
