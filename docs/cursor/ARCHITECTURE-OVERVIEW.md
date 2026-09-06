# KenyonExpress system map (cursor pack)

This pack lives under
`docs/cursor/`
on branch
`ke-cursor-docs`.
It is markdown only. It does not replace
`docs/ARCHITECTURE-OVERVIEW.md`.
Where this file and an older brief disagree, the live tree on this branch is right.

Measured companions (same worktree, read 2026-09-07):

```
docs/ARCHITECTURE-OVERVIEW.md
docs/DATA-MODEL.md
docs/MONEY-MODEL.md
docs/PAYMENT-FLOW.md
docs/API-REFERENCE.md
docs/DB-SECURITY-MODEL.md
docs/SEARCH-PIPELINE-SPEC.md
docs/ENV-REFERENCE.md
docs/DEAD-CODE.md
docs/adr/0010-no-search-ui-then-header.md
```

Production project:
`ixvwfbuvfxxsjiywhbbb`.
Hosted preview:
`https://kenyonexpress.vercel.app`.
Apex domain
`kenyonexpress.co.il`
still points at WordPress until the owner cuts DNS.

---

## 0. What this product is

KenyonExpress is a Hebrew RTL marketplace. One catalogue, one cart, two money paths.

| Kind | `product_type` | Customer pays on this site | What happens after pay |
|---|---|---|---|
| Coupon | `coupon` | Absolute `coupon_price_ils` (no default, no percent of face) | Platform keeps 100% of the prepayment. Supplier collects `face − coupon_price` in cash at scan. No escrow. No payout. |
| Physical | `physical` | 100% of the charge | Platform keeps snapshotted `platform_percent`. Residual is supplier due. No escrow. |
| Service | `service` | Same settlement as physical | Schema exists. No distinct money path. |
| Recurring | `recurring` | Token charge per period | `subscriptions` / `subscription_charges` (migration 135). `/account/subscriptions`. |

The fact that is written down wrong most often: coupon prepayment is an **absolute shekel amount**, never a percentage. A product without
`coupon_price_ils`
cannot be sold. There is no global platform rate anywhere.

---

## 1. Runtime stack

The brief for this pack said Next.js 15. The tree on this branch is **Next.js 16.2.12**, App Router, React 19.2.4. Anything that still says "middleware.ts" means
`src/proxy.ts`
and the exported function must be named
`proxy`.

| Layer | Choice on this branch |
|---|---|
| Framework | Next.js 16 App Router, React 19, TypeScript strict |
| Package manager | pnpm 11.1.2 only. `npm install` cannot work here. See `AGENTS.md`. |
| Database | Supabase Postgres, project `ixvwfbuvfxxsjiywhbbb` |
| Auth | Supabase Auth. Role lives in `profiles.role`, not `app_metadata`. |
| Client data | `supabase-js` with anon key + session. Admin writes use `src/lib/supabase/admin.ts` (service role, server only). |
| ORM | **Not used at runtime.** See §4. |
| Money | `src/lib/money.ts` re-exports branded types from `src/lib/commerce/money.ts`. There is **no** `packages/money.ts`. There is **no** `packages/` directory. |
| Payments | Cardcom legacy `/Interface/*.aspx`. Low Profile iframe. No HMAC on callbacks. |
| Search engine | Meilisearch when `MEILISEARCH_HOST` + `MEILISEARCH_API_KEY` are set, else Postgres `ILIKE`. Same `ProductCard` shape. |
| Search UI | `/search` exists. Header field was restored 2026-09-02 (ADR 0010) because the pixel refs contain it. There is no marketplace search product: no facet chrome, no typeahead-as-a-destination, no Meilisearch dashboard in the storefront. |
| Queue | Upstash QStash when configured, else inline. |
| Rate limit | Upstash Redis when configured, else Postgres `check_rate_limit` (service_role only after migration 127). |
| Media | Cloudflare R2. Signed PUT from admin. Public read via `R2_PUBLIC_BASE_URL`. |
| Errors | Sentry EU (`@sentry/nextjs`). |
| Hosting | Vercel, region `fra1`. |
| Mobile till | `apps/mobile` is a second RPC caller. Grants audits that grep only `src/` under-count. |

There is no Turborepo. There is no
`apps/web`.
There is no
`apps/api`.
The web app is
`src/app/`.
Older documents that sketch that layout are an unexecuted plan.

---

## 2. App Router map

Edge first:
`src/proxy.ts`.
Order is load-bearing.

1. `/monitoring` (Sentry tunnel) forwards first. No session. A broken page must still report.
2. Legacy WordPress redirects on GET/HEAD only, before session refresh. POST is not redirected (a redirected payment callback is a payment nobody hears about).
3. `supabase.auth.getUser()` for cookie rotation.
4. Auth gates: `/account/*`, `/coupon/*`, `/supplier/*` except login and access-denied, `/checkout/*` **sub-routes only**.
5. `/admin/*` optimistic check: `profiles.role` in `{admin, super_admin, content_uploader, support}`. Every page re-gates. Every server action re-checks.

Deliberate exclusions:

- `/checkout` itself is not gated. Guests shop. Sign-in happens on Pay. `/auth/callback` merges the guest cart.
- `/checkout/frame-return` must not be gated. Cardcom navigates the iframe there cross-site. Browsers withhold `SameSite=Lax` cookies. Gating it shows a login form inside a just-paid frame.

### 2.1 Storefront `(store)` / `(main)` / `(legal)`

| Route | Job |
|---|---|
| `/` | Home. Electro home-v7 rhythm. |
| `/products` | Catalogue archive. |
| `/product/[slug]` | PDP. |
| `/category/[slug]` | Category. |
| `/s/[id]` | Short supplier / deal alias. |
| `/city/[slug]` | City landing (seventeen regions). |
| `/search` | Search results. Engine named in the JSON (`meilisearch` or `database`). |
| `/cart` | Cart. Guest allowed. |
| `/checkout` | Checkout. Guest allowed until Pay. |
| `/checkout/return` | Browser return from Low Profile. |
| `/checkout/frame-return` | Iframe return. Ungated on purpose. |
| `/checkout/app-return` | Mobile return. |
| `/checkout/failed` | Declined / abandoned. |
| `/checkout/confirmation` | Paid confirmation. |
| `/gift/[token]` | Gift claim. |
| `/redeem/[token]` | Signed redeem URL. |
| `/coupon/[id]` | Signed-in voucher surface (gated). |
| `/coupons`, `/coupons/[id]` | Public coupon listing / deal. |
| `/suppliers` | Supplier directory. |
| `/about`, `/faq`, `/contact`, `/blog` | Content. |
| `/accessibility`, `/privacy-policy`, `/terms-and-conditions`, `/refund_returns` | Store aliases of legal. |
| `/legal/privacy`, `/legal/terms`, `/legal/returns`, `/legal/accessibility` | Canonical legal. |
| `/offline` | PWA offline tile. `noindex`. |
| `/newsletter/confirm`, `/newsletter/unsubscribe` | Double opt-in / one-click. |

### 2.2 Account `(account)`

All require a session.

`/account`, `/account/details`, `/account/security`, `/account/addresses`, `/account/orders`, `/account/orders/[id]`, `/account/orders/[id]/invoice`, `/account/coupons`, `/account/vouchers`, `/account/my-vouchers`, `/account/wallet`, `/account/tokens`, `/account/referrals`, `/account/subscriptions`, `/account/wishlist`.

### 2.3 Admin `(admin)`

Optimistic gate in the proxy. Per-section
`requireSection`.
content_uploader reaches catalogue sections only. Money sections are admin / super_admin.

Sections present as pages: dashboard, products (list / new / edit), categories, coupons (list / new / lookup / codes), suppliers, vendors, orders, payments, payouts, approvals, reviews, discounts, affiliates, referrals, users, analytics, reports, search, queues, audit-log, status, growth, feature-flags.

Payout **actions** are dead at runtime: production has no `payout_statements` table. Coupon model owes suppliers nothing. See
`docs/API-REFERENCE.md`
§5.

### 2.4 Supplier `(supplier)` / `(supplier-public)`

Membership in
`supplier_members`
(`owner` | `manager` | `scanner`).
This is the coupon-partner layer. It is orthogonal to
`profiles.role`.

`/supplier/login`, `/supplier/access-denied` (public). `/supplier`, `/supplier/orders`, `/supplier/products`, `/supplier/payouts`, `/supplier/redemptions`, `/supplier/scan`, `/scan`.

### 2.5 Auth `(auth)`

`/login`, `/signup`, `/signup/confirm`, `/forgot-password`, `/reset-password`, `/mfa`, `/auth/callback`.

### 2.6 HTTP surfaces outside pages

Route handlers are listed in
`docs/cursor/API-SURFACE.md`.
Cron lives under
`/api/cron/*`
(Bearer
`CRON_SECRET`,
no default). Cardcom webhook:
`/api/payments/cardcom/webhook`.
Search worker:
`/api/search/index-job`
and DLQ.
Feeds:
`/feed.xml`,
`/merchant.xml`.

---

## 3. Supabase schema domains

61 base tables in
`public`,
RLS on every table, 0 disabled, 133 policies (measured 2026-09-01). 12 views, all
`security_invoker`.
72 functions, 61
`SECURITY DEFINER`,
all 61 pin
`search_path`.

### 3.1 Identity and roles

```
auth.users 1:1 profiles
  profiles.role: customer | content_uploader | vendor | admin | super_admin | support
```

Cursor-pack four roles (how this pack talks) mapped onto the live enum:

| Pack name | Live value | Meaning |
|---|---|---|
| customer | `customer` | Default buyer. |
| content-uploader | `content_uploader` | Catalogue write. No money. |
| coupon-partner | `vendor` plus `supplier_members` | The business that accepts the voucher. Scanner is a membership, not a
`profiles.role`. |
| admin | `admin` and `super_admin` | Operations. `support` is a fifth live value: read-expanded, no money write. |

`enforce_profile_privilege_columns` stops a user changing their own
`role`
or
`supplier_id`.
service_role bypasses that trigger because
`auth.uid()`
is NULL. Server code that assigns a role carries the whole responsibility.

### 3.2 Catalogue

`categories`, `products`, `product_variants`, `product_images`, `media_assets`, `suppliers`, `supplier_branches`, `coupon_deals`, `coupons` (empty fossil), `homepage_sections`, `banners`.

Public read predicate for the catalogue, shared with the search indexer:

```
status = 'active' AND deleted_at IS NULL
```

### 3.3 Commerce and money

```
profiles ── orders ── order_items ── vouchers ── voucher_redemptions
                 │           └── settlement_events (server-only)
                 ├── payments ── payment_events (append-only)
                 │            └── payment_webhook_events (server-only)
                 ├── refunds
                 ├── invoices
                 └── stock_reservations (server-only)

wallet_accounts ── wallet_entries     [live]
wallet_balances ── wallet_transactions [fossil, 0 rows]
```

`order_items` is the money row. Settlement never joins back to a live product. Snapshotted: `platform_percent`, `face_value_agorot`, `paid_on_site_agorot`, `balance_due_agorot`, `commission_agorot`, `supplier_immediate_agorot`, `cashback_amount_agorot`, supplier identity by value.

### 3.4 Partner / till

`supplier_members`, `supplier_staff` (bcrypt PIN, not a login), `supplier_leads`, `vendors` (legacy, still referenced by `coupon_deals`).

### 3.5 Growth

`referrals`, `referral_signals` (server), `referral_program_settings`, `affiliates`, `discount_campaigns`, `discount_redemptions`, `abandoned_cart_nudges`, `newsletter_subscribers`, `email_suppressions`, `push_tokens`.

### 3.6 Search plumbing

`search_index_outbox` (no FK on `product_id` on purpose), `search_index_dlq` (server), `search_events`, `popular_searches`, `user_recent_searches`, `seo_redirects`.

### 3.7 Platform

`audit_log` (trigger insert, client DML denied), `notification_outbox`, `rate_limits`, `user_rate_limits`, `legacy_percent_archive_112`, `carts` (the **only** table `anon` may write; lines are `items` jsonb, there is no `cart_items` table).

### 3.8 Other schema

`wp_import` holds WordPress migration tables that **shadow** `public` names (`orders`, `products`, `vouchers`). Always schema-qualify near import.

---

## 4. Drizzle layer

`drizzle-orm` and
`drizzle-kit`
are in
`package.json`.
`drizzle.config.ts`
and
`src/db/schema/`
exist.

**Runtime does not use them.** Measured in
`docs/DEAD-CODE.md`
(2026-09-02): zero imports outside
`src/db`
itself. Application reads and writes go through
`supabase-js`.
The schema-as-code that production actually matches is
`src/types/database.ts`
(generated from the live project) plus the SQL files that were applied through MCP.

Treat Drizzle as a frozen sketch. Do not add new query paths through it. Do not delete it from this pack's work: file deletion is a hard stop. A later human commit can
`git rm`
after approval.

`DATABASE_URL` /
`SUPABASE_DB_URL`
are tooling only. Never set them on Vercel.

---

## 5. R2 storage

Admin image pipeline:

```
requestUploadUrl (server action, staff)
  → signed PUT to Cloudflare R2
  → processAndUploadImage
  → media_assets row (path, width, height, alt_he)
  → product_images when attached
```

Required env (all five, Cloudflare dashboard):
`R2_ACCOUNT_ID`,
`R2_BUCKET`,
`R2_ACCESS_KEY_ID`,
`R2_SECRET_ACCESS_KEY`,
`R2_PUBLIC_BASE_URL`.

Without them, upload is unavailable. Wrong public base means the object exists and the storefront 404s.

Launch trap: 32 product images still resolve against
`kenyonexpress.co.il/wp-content/uploads/...`
on the WordPress install. DNS cutover without pulling those objects into R2 ships 19 real products with broken images. See
`docs/cursor/LAUNCH-BLOCKERS.md`.

Rules: no binary in git; Hebrew alt before publish; MIME allowlist jpeg/png/webp/avif; public read; write via signed PUT / service role only.

---

## 6. Upstash Redis and QStash

Two products, two jobs.

| Product | Env | Job | If missing |
|---|---|---|---|
| Redis | `UPSTASH_REDIS_REST_URL` + `_TOKEN` | Rate limits (search, analytics beacon, voucher scan 30/min/user, staff PIN 15/hour/staff) | Postgres `check_rate_limit`, **service_role only** |
| QStash | `QSTASH_TOKEN` plus two rotating HMAC keys | Search index jobs. `Upstash-Signature` JWS verified by `verifyQstashSignature` | `enqueue` runs the worker inline |

`check_rate_limit` used to be callable as anon with a caller-chosen key and threshold. Migration 127 revoked that. A public
`POST /rest/v1/rpc/check_rate_limit`
now returns 401 / 42501.

QStash retries 5 times, then POSTs
`/api/search/index-dlq`
and parks a copy in Upstash's own DLQ. Deletes are idempotent: Meilisearch 404 on DELETE is success.

---

## 7. Meilisearch backend (not a search product)

Two engines, one interface
(`src/lib/search-server.ts`):

```
{ results, total, engine: 'meilisearch' | 'database' }
```

Stage 1 (today if host unset): Postgres `ILIKE`, terms sanitised by
`sanitizeOrTerm`.

Stage 3: Meilisearch. `type` is a filterable attribute so coupon / physical faceting happens in the engine and
`estimatedTotalHits`
stays truthful.

Indexing:

```
products row change
  ├─ fast: Supabase DB webhook → /api/webhooks/products → QStash → /api/search/index-job
  └─ floor: AFTER trigger enqueue_search_index() → search_index_outbox (same transaction)
            → claim_search_index_jobs()  (FOR UPDATE SKIP LOCKED)
```

Webhook payload is a **notification, never data**. The worker re-reads Postgres. Same philosophy as Cardcom `GetLpResult`. A spoofed payload can at worst schedule a no-op.

When Meilisearch is unconfigured every index job is a successful no-op. The pipeline stays wired and silent until
`MEILISEARCH_HOST`
appears.

**No search UI as a product.** There is a header field and a
`/search`
route because the Electro refs contain them (ADR 0010, 2026-09-02). There is no Meilisearch-branded chrome, no admin search-as-a-service screen for customers, no saved-search product. `/admin/search` is an operator index debugger, gated.

Hebrew synonyms live in
`src/lib/search/hebrew-synonyms.ts`.
`fn_record_recent_search`
is granted to anon so a guest's recent searches work.

---

## 8. Cardcom payment boundary

The platform is the merchant. Suppliers are not Cardcom sub-merchants in v1.

```
beginCheckout
  validates cart SERVER-SIDE (client sends ids and consent, never prices)
  reserve_order_stock(order, ttl=15min)  (shorter than ORDER_EXPIRY_MINUTES)
  snapshots money + supplier identity onto order_items
  opens Cardcom Low Profile, returns { frame } for the iframe
     OR submitCheckout: saved-card token, server-to-server, no redirect

Cardcom → POST /api/payments/cardcom/webhook?s=<secret>
  Cardcom DOES NOT SIGN callbacks. No HMAC header.
  ?s= compared in constant time against CURRENT and RETIRING secrets, no short-circuit
  POST body is NEVER trusted for money
  GetLpResult re-fetched server-to-server: only trusted amount, status, token
  journal payment_events first
  dedup (provider, external_event_id); replay = 200 no-op

finalizeOrder  (src/server/payments/finalize.ts)
  THE ONLY writer of orders.status → paid
  coupon line: split 100/0, settlement_status split_executed
  one voucher per purchased unit, keyed on order_item_id, capped at quantity
```

Token charge never passes through
`payments.status = redirected`.
It goes
`initiated → succeeded | failed`.

Kill switch:
`CHECKOUT_ENABLED`
must equal the exact string
`true`
in production or the till is closed.
`CARDCOM_USE_MOCK`
must never be set in production (charges succeed without a card).
`CARDCOM_SANDBOX=true`
in production is a boot-fail.

Required Cardcom env:
`CARDCOM_TERMINAL_NUMBER`,
`CARDCOM_API_NAME`,
`CARDCOM_API_PASSWORD`,
`CARDCOM_WEBHOOK_SECRET`
(generated by us,
`openssl rand -hex 32`,
not issued by Cardcom).

---

## 9. Vercel deployment topology

```
Browser (he-IL, RTL, dir=rtl)
        │
Vercel fra1 · Next.js 16
  src/proxy.ts (edge)
  RSC + server actions
  /api/* route handlers
        │
        ├─ Supabase Postgres + Auth   ixvwfbuvfxxsjiywhbbb
        ├─ Cardcom legacy Interface
        ├─ Sentry EU
        ├─ Cloudflare R2
        ├─ optional Meilisearch
        ├─ optional Upstash Redis / QStash
        └─ GitHub Actions cron.yml → GET /api/cron/*  (Bearer CRON_SECRET)
```

`vercel.json`: framework nextjs, install
`pnpm install --no-frozen-lockfile`,
build
`pnpm build`,
output
`.next`,
region
`fra1`.
**No `crons` key.** Hobby would silently run two of ten. The ten jobs moved to
`.github/workflows/cron.yml`.
Status 2026-09-02: Actions scheduler is live when
`CRON_SCHEDULER_ENABLED=true`
and
`CRON_SECRET`
are set on the repo. cron-job.org is optional. Two schedulers at once double-fire every job.

Boot validation:
`src/instrumentation.ts`
→
`src/lib/env.ts`
before the server accepts a request. A missing Cardcom secret must fail the deploy, not the first paying customer.

`NEXT_PUBLIC_*`
is inlined at **build** time. Changing one in the Vercel dashboard requires a redeploy, not a restart. Names matching
`NEXT_PUBLIC_.*(SECRET|PASSWORD|SERVICE_ROLE|PRIVATE_KEY|API_KEY)`
refuse boot: that is already a leak.

DNS is **not** switched. Apex still serves WordPress through Cloudflare (proxied). Cutover is a human step. See
`docs/cursor/LAUNCH-BLOCKERS.md`.

---

## 10. Scheduled jobs (ten GET routes)

All require
`Authorization: Bearer <CRON_SECRET>`.
Missing secret → 401 on every job (safe direction).

| Route | Cadence (intended) | On the money path |
|---|---|---|
| `/api/cron/notifications` | every 5 min | Indirect, critical: **only sender of voucher email** |
| `/api/cron/health` | every 5 min | Pages a human. Seven dependency checks. |
| `/api/cron/invoices` | every 10 min | Yes |
| `/api/cron/stock` | every 10 min | Releases expired reservations |
| `/api/cron/stranded-payments` | every 10 min | Yes: charged but not finalized |
| `/api/cron/abandoned-cart` | hourly | Nudges (post-launch depth in the roadmap) |
| `/api/cron/subscriptions` | 02:30 UTC | Yes |
| `/api/cron/reap-carts` | 03:40 UTC | `fn_reap_expired_carts()` |
| `/api/cron/reconcile` | 04:00 UTC | Yes |
| `/api/cron/expire-vouchers` | 23:15 UTC | Expiry + goodwill credit path |
| `/api/cron/retention` | (added later) | Data retention |
| `/api/cron/weekly-digest` | (added later) | Operator mail |

GitHub Actions
`cron.yml`
is the live scheduler of record as of 2026-09-02. Confirm
`CRON_SCHEDULER_ENABLED`
before adding a second caller.

---

## 11. What this pack will not do

- Open
`/Users/ofir/kenyonexpress-web/kenyonexpress`
or
`ke-arch`.
- Checkout
`closeout/v1-final`
or
`docs/ui-design-system`.
- Run pnpm, builds, or apply migrations.
- Edit
`.ts`,
`.tsx`,
`.sql`,
`.json`.

Money, RLS, APIs, risks, human launch steps, and post-launch work have their own files in this directory.

---

## 12. Pack index (this directory)

| File | Question it answers |
|---|---|
| `ARCHITECTURE-OVERVIEW.md` | What runs where |
| `DATA-FLOW.md` | Which table each money step writes, which policy |
| `MONEY-INVARIANTS.md` | Agorot contract. There is no `packages/money.ts` |
| `RLS-CATALOG.md` | Four pack roles × every public table |
| `API-SURFACE.md` | Handlers, actions, auth, failures |
| `RISK-REGISTER.md` | Ranked launch breakage |
| `LAUNCH-BLOCKERS.md` | Human-only ordered steps. DNS last |
| `POST-LAUNCH-ROADMAP.md` | Reviews, wishlist, abandoned cart, Twilio WhatsApp, i18n, self-serve partners |

---

## 13. Facts learned while writing the rest of this pack

**Two Cloudflare zones.** Registrar NS are `derek` / `elma`. Account `13a3f166…` also holds a staged zone (`ignat` / `tess`, never activated). Editing the staged zone is a silent no-op. Launch H0 is "open the live zone".

**Test catalogue row.** Id `9bb347f8-03ec-48ce-8ff2-2503fb74c895` is a ₪1 / ₪400 "Master Product". Application refuses the sale (95% discount ceiling). Migration 172 (stock 0, not delete) is unapplied. Homepage can still render it.

**Cron count.** Ten jobs in the original money set; this tree also has `/api/cron/retention` and `/api/cron/weekly-digest`. Scheduler of record is GitHub Actions, not `vercel.json`.

**Payout.** Admin actions exist. Production has no payout tables. Coupon partners are owed nothing on the coupon path. Physical residual is accounting, not a live ledger.

**Search UI vs engine.** Meilisearch is the backend. `/search` + header field exist for Electro pixel refs (ADR 0010). That is not a search product.

**Next.js 15 vs 16.** Brief said 15. This branch is 16.2.12. `src/proxy.ts` replaces `middleware.ts`.

---

## 14. `apps/mobile` (till), not a second web

The till app is an RPC client of the same Postgres. It calls
`redeem_voucher`,
`verify_supplier_staff_pin`,
`supplier_app_context`.
It is not a Cardcom merchant. It must not embed the service role. Grants audits that only grep
`src/`
miss this caller.

---

## 15. Boot and leak guards

`src/instrumentation.ts`
runs
`src/lib/env.ts`
before the first request.
`ALLOW_INCOMPLETE_ENV`
exists because
`next start`
on a laptop is
`NODE_ENV=production`
(Lighthouse, Playwright). Production Vercel must not set that escape hatch.

Any name matching
`NEXT_PUBLIC_.*(SECRET|PASSWORD|SERVICE_ROLE|PRIVATE_KEY|API_KEY)`
refuses boot: the leak already shipped in the bundle.

Legal URLs: canonical
`/legal/*`
plus storefront aliases
`/privacy-policy`,
`/terms-and-conditions`,
`/refund_returns`,
`/accessibility`.
`/offline`
is the PWA tile,
`noindex`.
Neither legal nor offline is in the pixel compare set. Returns copy must not mention escrow.
