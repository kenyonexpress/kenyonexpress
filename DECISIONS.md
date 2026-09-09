# DECISIONS

Why the architecture in `ARCHITECTURE.md` is this shape and not the obvious alternative.

Each entry: the choice, what it was chosen instead of, why, and the cost. Status is the **contract**. Live divergences are named in `ARCHITECTURE.md` (header table) and in `RISKS.md`.

Dated 2026-09-09 unless a prior ADR already locked the same choice.

---

## 1. Class Table Inheritance vs JSON discriminator

**Choice:** `products` parent plus `coupon_products` and `physical_products` children. Application type is a discriminated union on `product_type`.

**Instead of:** one wide `products` table with a `type` column and a JSONB `attrs`, or a pile of nullable money columns on the parent.

**Why:** coupon money and physical money are different shapes. A JSON discriminator is easy to write and impossible to constrain: Postgres will store a coupon without a face value and a physical without stock, and Drizzle will type the blob as `unknown` or a grab-bag. Class Table Inheritance makes the illegal combination unrepresentable (FK 1:1 plus a type-matching CHECK). Drizzle (and every reader) then gets a real type per child, not a switch on a string that the compiler cannot exhaust.

Shared identity (slug, supplier, status, `platform_percent`, images) stays on the parent so listing queries do not join three tables to draw a card. Child joins happen when the type is already known (PDP, checkout, admin form).

**Cost:** every new product kind is a migration (new child, new CHECK, new union member), not a JSON key. That is the point. A third kind (`service`, `recurring`) must not be stuffed into `physical_products` with nulls; that is the wide table again.

Live Drizzle is not this contract. `src/db/schema/commerce.ts` is a query projection over the wide table: column `type` (not `product_type`), numeric `price_ils`, no child tables. The generated `src/types/database.ts` is the live shape (`product_type` on `products`, nullable coupon money on the same row). Until CTI exists, Drizzle does not give the type safety this decision claims. That is R-2 on the type layer, not a reason to keep the wide table.

**ADR:** `docs/adr/0004-class-table-inheritance.md`.

---

## 2. Meilisearch vs Postgres FTS

**Choice:** Meilisearch as the query engine; Postgres remains the catalogue. Index is filled by a queue consumer plus an outbox floor.

**Instead of:** Postgres full-text search (`simple` + `unaccent` + `pg_trgm`) as the primary engine, which several older briefs bound.

**Why:** three things Postgres FTS on managed Supabase cannot do well at once:

1. **Hebrew.** There is no Hebrew stemmer on this host. FTS with `simple` is an exact-token search. Meilisearch still has no morphology either, but it gives one place to declare synonym groups, prefixed forms, and typo budgets without putting that policy in SQL functions that every reader must remember to call.
2. **Facets.** Category, city, supplier, price, in-stock, geo. Meilisearch filterable attributes are the facet UI. Recreating that with `GROUP BY` plus trigram plus a `tsvector` is possible and is also how the query planner becomes the product.
3. **External index.** Ranking experiments, typo floors, and "in-stock above proximity" stay out of the primary database. A bad search deploy does not take money or RLS with it. Rebuild is a job, not a migration.

**Cost:** the index can drift. That is why the consumer re-reads Postgres, the outbox is in the same transaction as the write, and a drift checker compares counts. When Meilisearch is unset, the query path falls back to Postgres `ILIKE` and names the engine in the response. That fallback is a degraded product (no typos, no synonyms, no facets), not a second source of truth.

---

## 3. Ledger split vs Cardcom split

**Choice:** one Cardcom LowProfile charge, then a split **in our ledger**. Physical: immediate platform fee + supplier residual. Coupon: escrow until redemption.

**Instead of:** asking Cardcom to split the charge atomically to a supplier sub-account (marketplace / split settlement APIs).

**Why:** the Cardcom surface this system uses (`/Interface/*.aspx` LowProfile) **has no atomic marketplace split**. Callbacks are unsigned. There is no documented way to take ₪100 from a customer and land ₪15 / ₪85 in two merchant accounts as one transaction we can prove. Building the product on a split Cardcom cannot perform would mean: charge twice (PCI and UX failure), or reconcile two settlements that can succeed independently (one customer, one success, one missing payout).

The ledger split is a pair of integer postings that a CHECK can conserve: `commission + supplier_due = paid_on_site` (physical) and escrow in/out that sum to the held amount (coupon). `platform_percent` is snapshotted on the line so a later catalogue edit cannot rewrite yesterday's arithmetic. The residual is **subtraction**, not a second rounded percentage; two independent roundings disagree by an agora.

**Cost:** we are the system of record for who is owed. Cardcom only knows the gross. Reconciliation is our job (`DECISIONS.md` §8). Coupon escrow is also a **liability** (see `RISKS.md` R-4). Live code currently has no writer for `escrow_held`; this contract restores it on the coupon path only.

**ADR:** `docs/adr/0007-cardcom-lowprofile.md` (the charge). Split lives in the ledger, not in Cardcom.

---

## 4. Webhook idempotency table vs event sourcing

**Choice:** `payment_webhook_events` with unique `(provider, external_event_id)`. Insert first. Unique violation = replay = HTTP 200 and stop. An append-only `payment_events` journal sits beside it for forensics.

**Instead of:** a full event-sourced money log (event store, projections, replay-to-rebuild, subscriptions) as the operational core.

**Why:** Cardcom retries IndicatorUrl. That is a **dedup** problem, not a "rebuild the business from events" problem. An idempotency table answers "have we seen this provider event?" in one unique index. Finalize then answers "have we already marked this order paid?" via `paid_at`. Together they make a five-delivery webhook issue one voucher set.

Event sourcing would require: a projection that is the orders table, a replay tool operators will not run at 2am, and a story for corrections that is more complicated than "insert refund row". We already have transition-guard triggers and an append-only journal. That is enough evidence for a chargeback. It is not enough reason to make every read a fold over events.

The two tables are not duplicates. `payment_webhook_events` is "what Cardcom said" (including garbage and replays). `payment_events` is "what we decided". Mixing them loses either the raw evidence or the domain trail.

**Cost:** you cannot time-travel the catalogue from the webhook table. You were not going to. Outbox + journal cover the cases we actually replay (finalize, search index, notifications).

---

## 5. R2 vs Vercel Blob

**Choice:** Cloudflare R2 for originals and renditions. Presigned PUT (SigV4, Web Crypto, no AWS SDK). Public CDN read for product images.

**Instead of:** Vercel Blob (or shipping bytes through the Next server, or leaving files in Supabase Storage as the primary).

**Why:** three practical reasons, not a cloud-religion:

1. **Ecosystem.** DNS is already on Cloudflare. Workers, R2, and the future signed-media path share one vendor and one bill. Vercel Blob is fine on Vercel and is a second object store the day the app is not only on Vercel (Workers, till, import jobs).
2. **Cost.** R2 has no egress fees in the pricing this project cares about. Image renditions at four widths and two formats are an egress product. Paying per-byte to leave Vercel Blob on every PDP view is the wrong meter.
3. **Pipeline.** The contract is: browser PUTs to object storage, server never sees the original bytes, hashed keys, AVIF/WebP at 480/768/1200/1440, 24h signed URLs, immutable cache headers. That pipeline is S3-compatible. R2 speaks it. Vercel Blob's API is a different shape and would fork `src/lib/storage`.

Supabase Storage remains the **fallback** when R2 env is missing (local, preview). Two backends, one validation module. A third backend is forbidden.

**Cost:** credentials (`R2_ACCESS_KEY_ID` / secret) are write access to the public CDN bucket. Leak = arbitrary objects on the storefront. Rotate; do not put the secret in a Worker that logs requests.

Live still sends the **original through Next** (`FormData` → `sharp` → PUT renditions). The contract above is browser PUT of the original. Until ingest moves, the 50 MB cap is forbidden on the live path (see `RISKS.md` R-15).

Live also has **two R2 clients**: a hand-rolled SigV4 signer (`src/lib/storage/r2.ts`, comments still describe browser PUT) and an AWS SDK service (`r2-service.ts`, multi-bucket, default PUT 600s / GET 3600s). A third backend remains forbidden. The two must not diverge on account, region (`auto`), or key rules.

---

## 6. Upstash vs DB rate limits

**Choice:** Upstash Redis (REST) as the primary limiter. Postgres `check_rate_limit` as fallback, same logical buckets. Hot limits: sign-in 5/min, signup 3/min, refresh 10/min, redemption 1/10 sec.

**Instead of:** only `rate_limits` / `user_rate_limits` tables, incremented in Postgres on every auth and till request.

**Why:** rate limiting is O(1) and must not contend with checkout. A `SELECT … FOR UPDATE` on a rate-limit row under a login spray is a self-inflicted denial of service on the same database that holds orders. Upstash is off the money path, REST from both Next and Workers, and the key is a policy name plus identifier, not a table the attacker can also query.

Postgres stays as fallback so an Upstash outage does not **reset** every bucket (a limiter that empties when the limiter is down is an open door). The Postgres function is not granted to `anon`. The publishable-key hole (caller picks key **and** threshold) stays closed.

**Cost:** two backends can disagree for one window after a failover. Keys must be the same string in both (`postgresKey` / `redisKey` discipline). Fail closed on redeem and checkout if **both** are down. Fail open on those paths is how a Cardcom-less brute force looks like success.

Live windows are **mixed**, not one scale. Auth is mostly hour-scale (login 10/hour, signup 5/hour). `begin_checkout` is already 10 per 60 seconds. Search is 120 per 5 minutes. `mfa-verify` is 10 per 15 minutes. There is no `refresh` 10/min policy. Shipping the contract numbers (5/min, 3/min, 10/min, 1/10 sec) is a policy-table change, not a docs-only edit (`RISKS.md` R-10).

---

## 7. Supplier-View RLS vs app-level

**Choice:** a supplier sees other people's rows only through RLS (and SECURITY DEFINER RPCs that re-check `is_supplier_member`). The Next supplier portal is a UI. It is not the security boundary.

**Instead of:** `createAdminClient()` in every supplier server action, filter `eq('supplier_id', session.supplierId)` in TypeScript, and trust that no one will forget the `eq`.

**Why:** app-level filters are bypassable by construction. Anyone with the anon key and a user JWT talks to PostgREST. A missing `eq` in one action is a cross-tenant read. RLS on `supplier_members` is evaluated in Postgres for every statement, including ones we have not written yet, including the mobile till, including a future Worker. It cannot be skipped by omitting a line of TypeScript.

`service_role` still bypasses RLS. That is why it never ships to a browser and why supplier actions should prefer the user-scoped client. When a definer is required (`redeem_voucher`), it reads `auth.uid()` itself and joins `supplier_members`. A definer that accepts `p_user_id` from the caller is an RLS bypass with extra steps.

**Cost:** policies are harder to read than an `eq`. Helpers (`is_supplier_member`, `is_supplier_order`) must stay `STABLE SECURITY DEFINER` with a pinned `search_path`, or the policy becomes recursive or attacker-writable. CI must keep a manifest of policies so a drop does not ship as "all tests passed, the page still renders".

Live file `172_rls_zero_policy_tables.sql` granted **admin SELECT** on `payment_webhook_events` because the payments tab used the request-scoped client and returned zero rows under deny-all. That is the right *symptom* (operators need to see callbacks) solved with the wrong *object* (raw provider payloads in the browser). The contract in `ARCHITECTURE.md` §3 still denies client roles on that table; a redacting RPC is the compatible fix. See `RISKS.md` R-16. A second applied file, `172_hide_master_product_test_row.sql`, shares the number and is unrelated.

**ADR:** `docs/adr/0005-rls-everywhere.md`.

---

## 8. Daily cron reconciliation vs real-time

**Choice:** a **daily** reconciliation job (Cardcom settlement vs `payments` vs orders vs ledger splits / escrow). Webhook + finalize remain the live path. Cron is the net.

**Instead of:** a real-time consumer on every Cardcom event, a streaming settlement feed, or blocking checkout on "Cardcom and ledger agree this second".

**Why:** the lag is **acceptable**. Cardcom's own settlement file is not a per-second stream on the legacy API we use. The webhook already finalizes the customer. What reconciliation catches is the residue: callback never arrived, `GetLpResult` said success and finalize threw, amount off by an agora, duplicate succeeded rows. Those are overnight problems. They are not problems a customer should wait on while 3DS returns.

Real-time reconciliation would couple availability: if the reconsumer is down, do we freeze checkout? If we do not freeze, we do not have real-time. If we freeze, Cardcom being slow becomes our outage. Daily-plus-alarm (`verified_against_api = true AND processed_at IS NULL` is already a live DLQ shape) is the same catch with a bounded window.

**Cost:** a missed webhook can sit until the job runs. That is why finalize is idempotent and why `/api/ready` plus ntfy exist: the window is hours, not "we will never know". GitHub cron is best-effort (delay under load, a run can be dropped). The live recon job diffs a 48-hour Cardcom window so a midnight-edge charge is seen twice rather than never.

Vercel is **not** that clock. `vercel.json` has no `crons` key on purpose: Hobby registers two daily jobs and silently ignores the rest. The clock is GitHub Actions workflow `Scheduled jobs`, gated on `CRON_SCHEDULER_ENABLED=true` plus `CRON_SECRET`. Both are set. Count kenyonexpress `scripts/cron-jobs.json`: **13** jobs, including `whatsapp`. This worktree's copy currently lists **12** and omits `whatsapp`. Measured 2026-09-08 22:44 UTC and again 2026-09-09: `whatsapp` 404 on `https://kenyonexpress.vercel.app` (the route exists on kenyonexpress main). Same day, `/api/health` 200. The remaining certain failure is a job inventory the production URL does not serve, not an absent scheduler. See `RISKS.md` R-8.

---

## How this file relates to `docs/DECISIONS.md`

`docs/DECISIONS.md` is the long register (D-1 money as agorot, D-2 no-escrow as currently **enforced in production**, Cardcom callback rules, voucher HMAC, and so on). This file is the eight structural choices the architecture contract is built on. If they conflict on coupon escrow: production currently implements D-2 (no writer for `escrow_held`); `ARCHITECTURE.md` §4 is the contract to restore coupon escrow in the ledger. Do not silently mix the two in a new migration.
