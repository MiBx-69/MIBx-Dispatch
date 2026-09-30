# Security Policy

## Reporting Security Issues

We take the security of MiBx Dispatch seriously. If you discover a vulnerability or potential security flaw, please report it responsibly.

**Please DO NOT open a public issue.** Instead, send an email to:
- **Security Contact**: `mib.bappi360@gmail.com` or repository administrators.

Please provide:
- A description of the issue and potential impact
- Step-by-step reproduction instructions or proof-of-concept
- Any suggestions for mitigation or remediation

We will acknowledge receipt within 48 hours and work with you on a patch and responsible disclosure timeline.

---

## Security Architecture & Defenses

### 1. Authentication & Session Management
- **Supabase Auth**: Managed JWT sessions with HTTPS-only cookies.
- **Role-Based Access Control (RBAC)**: All administrative settings, credentials, team invites, and financial mutations require explicit `admin` role verification enforced via server-side guards (`src/lib/auth-guard.ts`).
- **Middleware Boundary**: `src/proxy.ts` rejects unauthenticated access to internal API routes with HTTP 401.

### 2. Webhook & Integration Verification
- **Pathao Courier Webhook**: Verified using constant-time comparison (`crypto.timingSafeEqual`) against configured secrets (`PATHAO_WEBHOOK_SECRET` / `PATHAO_CLIENT_SECRET`). Fails closed on missing or mismatched secret.
- **Shopify Webhooks**: Validated using HMAC-SHA256 digest comparison with constant-time matching (`src/lib/shopify/client.ts`).
- **Scheduled Cron Endpoints**: Guarded with Upstash QStash cryptographic signatures (`Receiver.verify`) or a private `CRON_SECRET` using timing-safe comparisons. Endpoints fail closed if unauthenticated.

### 3. Attack Surface Mitigation
- **Toll Fraud Prevention**: Customer SMS dispatching endpoints require authenticated staff/admin sessions.
- **Open Redirect Guard**: Strict destination URL sanitization rejecting protocol-relative (`//`) or arbitrary scheme redirects on login.
- **Rate Limiting**: Brute-force protection on authentication and public routes via Upstash Redis sliding window.
- **Input Sanitization**: Search and filter queries are sanitized to prevent PostgREST grammar breakage or SQL/filter injection.
- **Security Headers**: Production headers include HSTS, CSP `frame-ancestors` (restricted to verified Shopify domains), `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, and `Permissions-Policy`.
- **Secret Isolation**: Production database credentials and API keys are isolated to Vercel production environments and never committed to source control or exposed to client bundles.
