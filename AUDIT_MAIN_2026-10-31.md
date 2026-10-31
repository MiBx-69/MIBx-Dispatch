# MiBx Dispatch — Main Branch Logic, Performance & Mobile-First Audit

**Audit target:** `main`  
**Audited commit:** `226afa93286138052750fca4be1cba0b0ad307e6` (2026-10-31)  
**Scope:** Read-only source review of webhook, Pathao status engine, dispatch flow, reporting queries, and shared responsive layout. This document records code-level findings; it is not a claim that runtime tests or a production database were executed.

## Executive summary

The repository has a substantial foundation (Next.js App Router, TypeScript, Supabase, Pathao, Shopify, QStash, Vitest and CI). The highest risk is not a missing feature: it is incorrect interpretation of courier events and money. Fix those before visual polish.

## Confirmed / high-confidence findings

### P0 — Partial delivery is mapped to a full Shopify delivery event
**File:** `src/lib/pathao/status-engine.ts`

`PARTIALLY_DELIVERED` currently has `shopifyFulfillmentEvent: "DELIVERED"`, `internalOrderStatus: "delivered"`, and `isTerminalDelivery: true`.

**Risk:** a parcel with some items delivered and some refused/returned can be represented as a fully delivered Shopify fulfillment. Pathao's generic partial-delivery event is not proof of exact line-item quantities.

**Required fix:**
- Keep an explicit `PARTIALLY_DELIVERED` local/courier state.
- Do not emit Shopify's full-delivery event for this generic event.
- Only create/update Shopify fulfillment quantities when the payload or a verified Pathao order-detail response provides exact SKU/line-item quantities and those quantities reconcile to Shopify's fulfillment-order line items.
- When quantities are absent/ambiguous, store the event, set `reconciliation_required`, and keep Shopify fulfillment unchanged.
- Preserve delivered and undelivered quantities separately; never mark the entire order delivered just because the courier says Partial Delivery.

### P0 — COD settlement can be fabricated from an expected calculation
**File:** `src/lib/pathao/webhook-processor.ts`, PAYMENT_INVOICE_EVENT handling.

The code calculates `expectedSettlement` and then uses it as a fallback for `actualReceivedSettlement` when `settlement_amount` and `received_amount` are absent.

**Risk:** an invoice/status notification without an actual received amount can increase the dashboard's received-cash total, creating false cash reconciliation.

**Required fix:**
- Keep `expected_settlement` and `actual_received_settlement` distinct.
- Actual received amount must be null/unknown until a documented invoice/settlement payload or verified settlement record supplies it.
- Do not use expected settlement as a fallback for actual received settlement.
- Make invoice ingestion idempotent using provider invoice identifier plus merchant/consignment identity.
- Do not mark Shopify financial status as Paid from Delivered or Paid Return courier events.
- Label estimated/unconfirmed values clearly and exclude them from cash-received totals.

### P1 — Dispatch duplicate guard is vulnerable to concurrent requests
**File:** `src/app/api/dispatch/route.ts`, `executeDispatchOrder`.

The code reads the order's active-consignment state, then calls Pathao to create a consignment. Two concurrent requests can both pass the read check before either persists the new consignment.

**Risk:** double parcels and duplicate customer/courier charges.

**Required fix:**
- Add a database-backed atomic dispatch claim/idempotency record per order and dispatch attempt (unique key/constraint).
- Acquire the claim transactionally before calling Pathao; reject other requests while claim is pending or active.
- Use a deterministic merchant request key if Pathao supports it; otherwise, after timeout/unknown response, query Pathao/reconcile before retrying. Never blindly submit a second create request.
- Persist request/response and failure state; release only when it is safe to retry.
- Make redispatch an explicit, audited operation requiring prior consignment cancellation/terminal confirmation, not a generic `force=true` bypass.

### P1 — Fallback City/Zone/Area values can route parcels incorrectly
**File:** `src/app/api/dispatch/route.ts`.

When city/zone names are not matched, the code silently selects Dhaka or the first city/zone ID (and uses ID 1 as a final fallback).

**Risk:** incorrect courier delivery destination while the UI reports dispatch success.

**Required fix:**
- Resolve city/zone/area from verified Pathao IDs or exact normalized names.
- Never guess a city/zone/area ID. If resolution is ambiguous or missing, block dispatch and show a clear field-level validation error.
- Treat recipient area independently; do not leave an invalid fallback ID.
- Validate Bangladesh phone format and recipient address before the courier API call.

### P1 — Partial delivery analytics use the wrong metric
**File:** `src/app/(dashboard)/dispatches/page.tsx`.

The telemetry field `partialDelivery` is assigned `metrics.courierPaidReturnCount`, which is not the partial-delivery count.

**Risk:** operational dashboard misreports partial deliveries.

**Required fix:** create separate exact aggregates for partial delivery, paid return, return-in-transit, and returned-to-merchant. Use status-specific database predicates/normalized status columns.

### P1 — Courier stage telemetry repeats one aggregate in three different buckets
**File:** `src/app/(dashboard)/dispatches/page.tsx`.

`pickedUp`, `inTransit`, and `outForDelivery` all currently use `metrics.courierActiveTotalCount`.

**Risk:** the integration dashboard presents duplicated numbers as distinct stage counts.

**Required fix:** compute each count from its own normalized status set; make categories mutually exclusive and document whether counts represent current parcels or cumulative events.

### P1 — Invoice and dispatch aggregates have a hard 500-row cap
**File:** `src/app/(dashboard)/dispatches/page.tsx`.

The invoice summary fetches `pathao_payment_invoices` with `.limit(500)` and sums only the returned rows.

**Risk:** totals silently become incomplete once more than 500 invoices exist.

**Required fix:** aggregate in PostgreSQL (view/RPC with filters) or paginate through all matching rows. Do not sum a capped page as if it were the complete ledger.

### P1 — Main dispatch page sorts after fetching only one page
**File:** `src/app/(dashboard)/dispatches/page.tsx`.

The query applies an order/range, then the returned page is re-sorted in JavaScript by the numeric part of the Shopify order name.

**Risk:** pagination order and displayed order can disagree; a row belonging on another page cannot be moved into the current page after the limit was applied.

**Required fix:** use a stable database sort (prefer `dispatched_at`, with a deterministic ID tie-breaker), or persist a sortable numeric order sequence. Never re-sort only the fetched page if global ordering matters.

### P2 — Dispatch settings query selects sensitive credential columns for a page
**File:** `src/app/(dashboard)/dispatches/page.tsx`.

The server page selects Pathao client ID, client secret, username, password and webhook secret even though the UI telemetry shown here only needs to know whether configuration exists.

**Risk:** unnecessary exposure of secrets to the page's server component data path and accidental propagation to child props/logs in future edits.

**Required fix:** select only non-secret settings needed for rendering; use a server-only boolean configuration helper and never pass secret values into React props.

### P2 — Dashboard count queries are serial and can become expensive
**File:** `src/app/(dashboard)/orders/page.tsx`.

Several independent exact-count queries execute sequentially after the main order query.

**Risk:** avoidable server response latency and unnecessary database round-trips.

**Required fix:** run independent count queries concurrently with `Promise.all`; consolidate high-traffic metrics into a database view/RPC with correct indexes; use exact counts only where operationally needed.

### P2 — Mobile bottom navigation has too many primary destinations
**File:** `src/components/layout/bottom-nav.tsx`.

The bottom bar maps the entire nav item array (eight links), creating a crowded small-screen navigation.

**Risk:** poor tap accuracy and unreadable labels on common 360–430px devices.

**Required fix:** limit bottom navigation to 4–5 primary tasks (Dashboard, Orders, Dispatch, Returns, More). Put less frequent destinations (Inventory, Reports, Finances, Customers, Settings) under a compact More menu. Respect safe-area insets.

## Additional protocol/security verification required

### Pathao webhook authentication contract
**File:** `src/app/api/webhooks/pathao/route.ts`.

The handler accepts `X-PATHAO-Signature`, `X-Pathao-Merchant-Webhook-Integration-Secret`, or `Authorization` into one variable, then passes each candidate to the same `verifyPathaoWebhook(rawBody, candidate, configuredSecret)` function. It also skips the non-handshake secret check entirely when no secret is configured.

**Required fix:**
- Confirm the exact Pathao production webhook contract for the current merchant integration.
- Validate the documented request signature using the exact algorithm and canonical raw body; do not treat an integration response secret or generic Authorization header as interchangeable with an HMAC signature.
- Fail closed in production if webhook authentication is not configured.
- Always return the configured integration-secret response header exactly as required by the Pathao handshake contract; do not echo a client-provided secret.
- Test missing, malformed, invalid, valid, replayed, and rotated-secret scenarios.
- Set a maximum request body size and reject unsupported content types before parsing.
- Persist the raw event durably before acknowledging it; enqueue failure must leave a retryable pending record.

## Performance and mobile-first improvement specification

1. **Route-level loading:** add route-level `loading.tsx` skeletons for Orders, Dispatches, Returns, Inventory and Reports. Keep skeleton dimensions stable to avoid layout shift.
2. **Server-first rendering:** keep data fetching and secrets on the server. Use client components only for interactions; avoid shipping entire data sets into client state.
3. **Pagination:** use server-side pagination with stable sort keys. Add debounced search (250–350 ms), abort stale requests, and preserve URL query state.
4. **Database:** inspect `EXPLAIN (ANALYZE, BUFFERS)` on real representative queries before adding indexes. Add composite/partial indexes that match filters + order clauses. Avoid fetching unused columns and unbounded nested relations.
5. **Caching:** cache only safely cacheable reference data (Pathao city/zone/area lists and dashboard aggregates with explicit invalidation). Never cache auth-dependent or customer-private data across users.
6. **Mutations:** use optimistic UI only when rollback is reliable; disable submit controls while pending; protect every mutation with server-side auth/RBAC, Zod validation, idempotency and clear error states.
7. **Mobile layout:** design at 360px first, then 390px, 430px, tablet and desktop. No horizontal body overflow. Replace wide tables with compact order/dispatch cards on mobile; retain dense table view on desktop.
8. **Touch/accessibility:** 44–48px targets, visible focus, semantic labels, keyboard access, sufficient contrast, safe-area padding, sticky but non-obstructive action bars.
9. **Warehouse flows:** allow staff to search by Shopify order number, phone, consignment ID and barcode; make order status, COD amount, delivery stage and primary action immediately scannable.
10. **Network resilience:** show last-synced time, stale-data state, retry action and request errors. Do not pretend background sync succeeded when QStash or courier calls fail.
11. **Bundle:** inspect route chunks with build analyzer before adding dependencies; dynamically import chart/PDF/export code; use server pagination and avoid rendering huge lists.
12. **Observability:** add request correlation IDs, structured redacted logs, webhook queue age, retries, dead-letter visibility and sync freshness metrics.

## Required test matrix before production deploy

- Partial delivery with no item quantities: must not full-fulfill Shopify.
- Partial delivery with exact quantities: delivered and returned quantities reconcile exactly; no quantity can be delivered/returned twice.
- Duplicate and out-of-order webhooks: no double financial/return/fulfillment side effects.
- Payment invoice without actual settlement amount: actual received remains unknown, not expected amount.
- Duplicate invoice webhook: one invoice/settlement record.
- Two simultaneous dispatch attempts: exactly one Pathao create call.
- Pathao create timeout after remote success: reconciliation before retry.
- Unknown city/zone/area: dispatch blocked, no guessed numeric defaults.
- Delivered vs COD settlement: delivered does not mean cash received.
- More than 500 invoices: exact total remains correct.
- Mobile 360px and 390px: no horizontal overflow, buttons reachable above safe area, primary tasks fit in bottom navigation.
- Role enforcement: staff cannot mutate admin-only settings/finance; unauthenticated API/server actions fail closed.
- CI must run `npm run typecheck`, `npm test`, `npm run lint`, and `npm run build`.

## Out of scope / business rules to preserve

- Do not add product purchase cost, COGS, supplier accounting, procurement accounting or inventory valuation.
- Keep returns limited to **Partial Return** and **Full Return**. Do not invent additional return classifications or manual approval layers.
- Shopify refund is a separate action from a courier return; never auto-refund because Pathao reports Return/Paid Return.
- Keep Pathao parcel status, Shopify fulfillment, Shopify financial status, COD collected, and merchant bank settlement as separate states.
- Do not remove working business features while refactoring.
