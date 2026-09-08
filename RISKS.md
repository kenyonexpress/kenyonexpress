# RISKS

Architecture risks for the contract in `ARCHITECTURE.md` and the choices in `DECISIONS.md`.

This is not the incident runbook (`docs/INCIDENT-PLAYBOOKS.md`) and not the full failure catalogue (`docs/FAILURE-MODES.md`). It is the register of **design** risks: things that are true because of how the system is shaped, not because a line of code is wrong.

Likelihood × impact is the ranking. **Certain** means it is the current state, not a prediction.

---

## Register

| ID | Risk | Likelihood | Impact | From |
|---|---|---|---|---|
| R-1 | Dual runtime split (Next vs Workers) | Medium | High | Overview |
| R-2 | CTI discriminator drift | Medium | High | §2, D-1 |
| R-3 | RLS believed; `service_role` or a fat policy used | Medium | Critical | §3, D-7 |
| R-4 | Coupon escrow as a liability | High | Critical | §4, D-3 |
| R-5 | Unsigned Cardcom callback trusted or skipped verify | Medium | Critical | §4, D-3 |
| R-6 | Idempotency table treated as the whole money history | Low | High | D-4 |
| R-7 | Search index drifts from the catalogue | High | Medium | §5, D-2 |
| R-8 | Cron inventory vs the URL the scheduler actually hits | **Certain** (whatsapp 404) | Critical | D-8 |
| R-9 | Signed URL TTL vs CDN cache | Medium | High | §6, D-5 |
| R-10 | Rate limiter fail-open on money | Medium | High | §7, D-6 |
| R-11 | SECURITY DEFINER with caller-controlled uid or unpinned path | Medium | Critical | §9 |
| R-12 | Session cookie theft / refresh not rotated | Medium | High | §9 |
| R-13 | This contract vs live overview | **Certain** | High | header of `ARCHITECTURE.md` |
| R-14 | Hebrew search confidently wrong | Medium | Medium | §5 |
| R-15 | Image pipeline contract vs live widths / size cap | **Certain** | Medium | §6 |
| R-16 | Admin SELECT on raw `payment_webhook_events` | **Certain** | High | §3, D-7 |
| R-17 | Two applied files numbered 172 | **Certain** | Medium | §3 |

---

## R-1 Dual runtime split (Next vs Workers)

**Why it exists.** The contract puts session refresh, rate limits, and possibly IndicatorUrl on Cloudflare Workers (Hono) and checkout / finalize on Next.js 15. Two runtimes, two deploys, two sets of env.

**What breaks.** Worker and Next disagree on the webhook secret, the cookie flags, or the Upstash key prefix. Customer pays; Next never finalizes. Or Next finalizes and the Worker answers 200 to a replay that Next would have treated as new.

**Mitigation.** One secret store. One policy table for rate-limit names. Webhook idempotency in **Postgres**, not in Worker memory. `/api/health` and `/api/ready` on both, or a single probe that Next owns and the Worker only fronts. Do not implement finalize twice.

**Live.** There is no Hono process and no Cloudflare Workers app (`wrangler.toml` is absent). DNS and R2 are the Cloudflare surface. Sentry's "workers" half in `src/instrumentation.ts` is the **same Node process** that serves cron routes. Naming that "Workers" is how R-1 gets implemented by accident: a second finalize on a platform that is not in the tree.

---

## R-2 CTI discriminator drift

**Why it exists.** Class Table Inheritance is only as strong as the type CHECK. A `products` row with `product_type = coupon` and a `physical_products` child (or neither child) is a product the union cannot load.

**What breaks.** Checkout throws. Search indexes a document with missing money. Admin form saves the parent and fails the child; the shopper sees a 404 or a card with ₪0.

**Mitigation.** FK 1:1, type-matching CHECK or trigger, refuse-to-insert. Admin save is one transaction: parent + child. Listing queries stay on the parent; PDP always joins the child required by `product_type`. No `COALESCE` across child money columns.

**Live.** Child tables do not exist. `product_type` on `products` is the discriminator with nullable money on the same row. The Drizzle file `src/db/schema/commerce.ts` is a third shape (`type`, numeric `price_ils`). Moving to CTI without a backfill, and without replacing that projection, is R-2 on day one.

---

## R-3 RLS believed; bypass used

**Why it exists.** Decision 7 puts enforcement in Postgres. `service_role` bypasses RLS. Live grants still allow `authenticated` DML on dozens of tables, so a single over-broad policy is a write hole. Supplier portal TypeScript `eq('supplier_id', …)` looks like security and is not.

**What breaks.** Cross-tenant order read. Wallet credit. Catalogue price edit. Silent, because the page still renders for the attacker.

**Mitigation.** User-scoped client by default. `service_role` only behind RBAC + audit. Policy manifest in CI. `redeem_voucher` and `fn_wallet_transfer` read `auth.uid()` themselves. Never pass `p_user_id` into a definer from the caller.

---

## R-4 Coupon escrow as a liability

**Why it exists.** The contract holds a supplier share until redemption. That is a payable. It may be a payment-services question (holding customer money for a merchant). Production currently avoids it: the platform keeps the coupon prepayment and the supplier is paid in cash at the counter (`docs/DECISIONS.md` D-2).

**What breaks.** If the contract is implemented as written: we owe suppliers money we might spend; refunds and expiry must release or forfeit on a ruleset counsel signs; reconciliation must include `escrow_held` ageing. If the contract is **not** implemented but this file is treated as live: operators will look for holds that do not exist and miss that `escrow_held` on old rows is fossil.

**Mitigation.** Do not ship coupon escrow without an explicit owner decision that supersedes D-2. If shipped: conservation CHECK on hold/release, no float, daily recon includes open holds, and a licence answer in `docs/ARCHITECTURE-LEGAL-COMPLIANCE.md`. Until then, treat §4 coupon escrow as **contract, not production**.

---

## R-5 Unsigned Cardcom callback

**Why it exists.** LowProfile callbacks are not HMAC-signed. Authenticity is URL secret + `GetLpResult`.

**What breaks.** Skipping the re-fetch (timeout, "body looks fine") finalizes on an attacker POST. Amount mismatch: we capture the wrong agorot. Replay without the idempotency insert issues a second voucher set.

**Mitigation.** Body never trusted for money. Both current and previous webhook secrets compared, constant-time, no short-circuit. Journal insert before decide. Finalize is the only `paid` writer. Alarm when verify succeeds and finalize does not (`processed_at` null).

---

## R-6 Idempotency table mistaken for event sourcing

**Why it exists.** Decision 4 is deliberately smaller than an event store.

**What breaks.** Someone rebuilds order state by folding `payment_webhook_events` and drops refunds, wallet, and voucher issue that never appeared as Cardcom events. Or they skip the table because "we have `payment_events`" and then a Cardcom retry double-finalizes.

**Mitigation.** Keep the two tables' jobs written down (Cardcom said / we decided). Unique `(provider, external_event_id)` stays. Do not add a generic event-store abstraction on the money path without replacing both.

---

## R-7 Search index drift

**Why it exists.** Meilisearch is derived. Two write paths can both look healthy while the index is wrong (import that skipped the trigger, index recreate, filter change).

**What breaks.** Shopper cannot find a live product, or finds an unpublished one. Facets lie. Hebrew synonyms applied to a stale document.

**Mitigation.** Consumer re-reads Postgres. Outbox in the same transaction as the product write. Drift checker: active product count vs document count, alarm on gap. Rebuild job. Fallback `ILIKE` when Meili is unset, with `engine` named so we do not think typos work.

**Live.** Meilisearch is unset in production. Drift is currently "there is no index". The checker is not missing: `checkSearchDrift` runs from `/api/cron/health` on the five-minute GitHub schedule and returns `skipped` when env is unset. Turning Meili on without reading those skipped results as "not ok" is how R-7 goes silent.

---

## R-8 Cron inventory vs the URL the scheduler hits

**Why it exists.** Decision 8 accepts hours of lag **if a job runs against the deploy that contains the handler**. Vercel is not that clock: Hobby would silently run two daily jobs and drop the rest, so `vercel.json` has no `crons` key on purpose. The clock is GitHub Actions workflow `Scheduled jobs`, gated on `CRON_SCHEDULER_ENABLED=true` plus `CRON_SECRET`. GitHub cron is best-effort (delay under load, a run can be dropped, scheduled workflows disable after 60 days without commits).

**What breaks.** A job that 404s is worse than an unscheduled job: the schedule is green-ish, ntfy may fire, and operators believe expiry / recon / WhatsApp ran. A deploy URL that is behind `main` drops every job added after that deploy. Two schedulers (Actions plus cron-job.org) double-send `notifications`.

**Mitigation.** One scheduler. Manifest `scripts/cron-jobs.json` is the inventory; the workflow, the doc, and `src/app/api/cron/*` must agree (the unit test already fails if they do not). Every new cron route must exist on the URL `CRON_BASE_URL` / `defaultBaseUrl` points at **before** it is added to the five-minute schedule. `/api/ready` does not replace a clock.

**Live evidence (2026-09-09).** Scheduler is **on**: variable `CRON_SCHEDULER_ENABLED=true`, secret `CRON_SECRET` present, workflow active. Count kenyonexpress `scripts/cron-jobs.json`: **13** jobs, including `whatsapp`. This worktree's copy of that file currently lists **12** and omits `whatsapp`; do not count it. Measured 2026-09-08 22:44 UTC, schedule `*/5 * * * *`, base `https://kenyonexpress.vercel.app`: `notifications` 200, `health` 200, `whatsapp` 404. The `whatsapp` route exists on kenyonexpress main. Older paragraphs that say "nothing calls the cron routes" (including `docs/FAILURE-MODES.md` §2.1 and the 2026-09-01 body of `docs/CRON-EXTERNAL.md`) are stale relative to the 2026-09-02 banner on that same file and relative to this measurement.

---

## R-9 Signed URL TTL vs CDN cache

**Why it exists.** Upload/GET grants last 24 hours. Hashed public objects cache "immutable" for a year.

**What breaks.** A 24h signed PUT leaked in a log is a write window. A public object cached immutable after a "delete" still serves. Mixing signed GET with `Cache-Control: public` lets a CDN cache a private invoice.

**Mitigation.** Hashed keys for public product bytes; new key on replace. Private objects: `private, no-store` on the signed GET, never public ACL. Rotate R2 keys. Do not log the full signed URL.

**Live.** Presigned PUT is 600 seconds. Tightening TTL is safer than the contract; lengthening to 24h without log redaction is R-9.

---

## R-10 Rate limiter fail-open on money

**Why it exists.** Upstash can be down. A limiter that fails open on redeem or checkout is an unmetered till and an unmetered LowProfile factory.

**What breaks.** PIN spray. Voucher code spray. Cardcom deal spam (cost and fraud). After failover to Postgres, **different keys** reset the bucket (the exact bug the policy table exists to prevent).

**Mitigation.** Fail **closed** on checkout and redeem if Upstash **and** Postgres limiter are down. Same logical key strings in both backends. Sign-in 5/min and signup 3/min must not share a prefix. Till limits key on supplier user, not shop NAT IP.

**Live.** Policy numbers differ from the contract. Exact live windows, read from `RATE_LIMIT_POLICIES` on 2026-09-09: login 10/hour, signup 5/hour, customer redeem 60/hour per IP, till `voucher-redeem` 120/hour per supplier user, `begin_checkout` 10 per 60 seconds, search 120 per 5 minutes, `mfa-verify` 10 per 15 minutes, `app-session` 30 per 10 minutes. There is no session-refresh 10/min row. Either ship the contract numbers (5/min, 3/min, 10/min, 1/10 sec) or change the contract. Do not document 1/10 sec and enforce 60/hour without saying so at the call site.

---

## R-11 SECURITY DEFINER footguns

**Why it exists.** Privileged RPCs are how redeem and wallet work without giving `authenticated` a write policy.

**What breaks.** Unpinned `search_path`: attacker creates `public.auth` and steals the definer. Caller-controlled `uid`: attacker passes a victim. `EXECUTE` granted to `anon` on a function that is not a trigger.

**Mitigation.** Pin `search_path` on every definer (live count of unpinned must stay 0). `auth.uid()` inside the function. Grants audit in CI. Trigger functions with leftover public EXECUTE are inert only if they return `trigger` and take no args; do not copy that pattern onto a money RPC.

---

## R-12 Session cookie theft / refresh

**Why it exists.** Session is a cookie. PKCE protects the OAuth bounce, not a stolen cookie later.

**What breaks.** XSS is less useful if httpOnly holds, but a leaked `Set-Cookie` log, a SameSite=None mistake, or refresh that does not rotate leaves a standing token. Strict SameSite breaks Cardcom return and OAuth, so Lax is required and CSRF on mutation must be real (Server Actions origin, not "the cookie is Strict").

**Mitigation.** httpOnly + Secure + SameSite=Lax on the **session** and guest cart. Rotation on refresh. Logout clears cookies. Do not put the session in `localStorage`. The consent cookie is deliberately not httpOnly (the banner writes it). Copying session flags onto consent, or consent flags onto the session, is this risk.

---

## R-13 This contract vs live overview

**Why it exists.** `ARCHITECTURE.md` is a target. `docs/ARCHITECTURE-OVERVIEW.md` is production. They disagree on hosting, CTI tables, escrow, image limits, rate numbers, and search engine.

**What breaks.** An agent (or a human) implements the wrong file. Coupon escrow lands against D-2. Workers are added as a second finalize. Rate limits are "fixed" to 5/min in docs only.

**Mitigation.** Header table in `ARCHITECTURE.md` stays accurate. Index rule: live counts → overview; target shape → this trio. New migrations name which document they implement.

---

## R-14 Hebrew search confidently wrong

**Why it exists.** Synonyms are one-way in Meilisearch unless expanded. Typo budget on short Hebrew matches unrelated products. A synonym that is not a synonym (`מסעדה` = `פיצה`) looks like a good conversion metric.

**What breaks.** Shopper searches one thing, buys another, or sees an empty result for a word that exists with a prefix.

**Mitigation.** Bidirectional group expansion, prefixed forms only on known terms, typos off on sku/slug/barcode, no brand-as-synonym. Golden queries in CI. Drift checker does not catch this; relevance tests do.

---

## R-15 Image pipeline contract vs live

**Why it exists.** Contract: browser PUT of the original to R2, 50 MB cap, four widths, AVIF+WebP each, 24h signed URLs. Live: original arrives as FormData on Next, `sharp` on the server, then Next PUTs renditions to a 600-second presigned URL. Cap 8 MB. WebP at 400/800/1600 (top slot is `min(original, 1600)`). AVIF only on that largest width, never on 800 or 400. PUT 600 s, GET 3600 s. Storefront delivery is `/_next/image` on the largest WebP; the smaller files are an archive nobody reads on the PDP.

**What breaks.** Docs that say 1440 px while the gallery serves 800. An admin uploads 20 MB and is refused without the contract explaining why. A 50 MB cap on the **live** `sharp` path takes the Next instance down (CPU, memory, timeout). Mixing signed GET with `Cache-Control: public` lets a CDN cache a private invoice.

**Mitigation.** Rendition widths are a product decision: either change the pipeline to 480/768/1200/1440 or change this file. **50 MB is only safe after ingest is direct-to-R2.** Do not raise the cap on the current server-side `sharp` path. Switch public delivery to the hashed rendition URL before treating the archive as the CDN.

---

## R-16 Admin SELECT on raw webhook payloads

**Why it exists.** Decision 7 puts enforcement in Postgres. `payment_webhook_events` is supposed to be server-insert only: the replay key, the raw Cardcom body, sometimes a token. File `172_rls_zero_policy_tables.sql` added `payment_webhook_events_admin_read` because the admin payments tab used the user-scoped client and, under deny-all, showed an empty table. The tab now works. The grant is SELECT of the **raw row**.

**What breaks.** Any session that passes `is_admin()` can read provider payloads in the browser (React table, network panel, Next flight data). A token or PAN-adjacent field that landed in the body is then a stored XSS / copy-paste / support-laptop leak, not a Postgres leak. A future "support" role that reuses `is_admin()` inherits it.

**Mitigation.** Keep writes service-role only (already true). Replace the table grant with a SECURITY DEFINER that returns the columns an operator needs (`external_event_id`, status, amounts, timestamps) and redacts tokens. Until then, treat that file as a known live exception, named in the `ARCHITECTURE.md` header, not as the contract.

**Live.** Certain. The grant file is applied. Cite it by filename. `docs/DB-SECURITY-MODEL.md` still describes the pre-grant zero-policy set for this table; do not trust that paragraph for grants.

---

## R-17 Two applied files numbered 172

**Why it exists.** `migrations/applied/` contains both `172_rls_zero_policy_tables.sql` (the admin SELECT) and `172_hide_master_product_test_row.sql` (hide a one-shekel test product). Both appear in `CHECKSUMS.sha256`. A sentence that says "migration 172" is ambiguous.

**What breaks.** An operator rolls back "172" and drops the wrong object. A docs pass attributes the webhook grant to the product hide, or vice versa. `schema_migrations` version strings, if they collide, hide one of the two.

**Mitigation.** Cite the filename, never the number alone. Do not add a third 172.

---

## Document control

| Date | Change |
|---|---|
| 2026-09-09 | Initial register for ARCHITECTURE-DOCS-DECISIONS-RISKS. |
| 2026-09-09 | R-10 and R-15 updated with live ingest path and exact `RATE_LIMIT_POLICIES` windows. |
| 2026-09-09 | R-16 (172 admin SELECT on webhook payloads). R-8 evidence: `vercel.json` has no `crons` key. |
| 2026-09-09 | R-8 rewritten: GitHub Actions scheduler is live; certain failure is `whatsapp` 404 on the Vercel URL, not an absent clock. R-17: two files numbered 172. R-1/R-7/R-10 live notes. |
| 2026-09-09 | Fourth source pass: R-8 names kenyonexpress 13 jobs vs this worktree's 12; R-15 AVIF is largest-width only. |
