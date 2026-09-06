# Risk register (launch)

Ranked by impact then likelihood. "Certain" means it is the current state, not a prediction.

Companions:
`docs/FAILURE-MODES.md`,
`docs/COPY-AUDIT.md`
(migration 172),
`docs/OWNER-CHECKLIST.md`,
`docs/LAUNCH-RUNBOOK.md`,
`docs/cursor/RLS-CATALOG.md`.

| Likelihood | Meaning |
|---|---|
| Certain | True on 2026-09-07 unless a later note in STATE.md contradicts |
| High | Expected in the first weeks of real traffic |
| Medium | Plausible; this shape of system has seen it |
| Low | Needs an unusual combination |

| Impact | Meaning |
|---|---|
| Catastrophic | Money leaves and cannot be reconstructed, or every session is attacker-owned |
| Critical | No commercial launch, or paid customers without orders / vouchers |
| High | Visible breakage, trust, or a class of orders wrong |
| Medium | Degraded; workaround exists |

---

## R1. Cardcom production credentials missing or mock left on

- **Likelihood:** Certain (owner terminal + four keys still a human step) until the owner pastes production values and proves one live charge on
  `*.vercel.app`
  **before** DNS moves.
- **Impact:** Critical (cannot collect) **or** Catastrophic if
  `CARDCOM_USE_MOCK`
  /
  `CARDCOM_SANDBOX=true`
  is set in Production (looks healthy, no settlement).
- **Mitigation:** Boot refuses sandbox in production. Never set mock. Paste
  `CARDCOM_TERMINAL_NUMBER`,
  `CARDCOM_API_NAME`,
  `CARDCOM_API_PASSWORD`,
  `CARDCOM_WEBHOOK_SECRET`
  (`openssl rand -hex 32`, **we** generate the webhook secret).
  `CHECKOUT_ENABLED=true`
  exact string. Redeploy (env is build-time for some keys). One real ₪ charge, webhook → `orders.paid` → voucher row → Cardcom dashboard match → refund from Cardcom dashboard. Kill switch:
  `CHECKOUT_ENABLED=false`
  + redeploy. Exact clicks:
  `docs/cursor/LAUNCH-BLOCKERS.md`.

---

## R2. DNS cutover while WordPress still owns images and mail

- **Likelihood:** High the moment someone points the apex at Vercel without the pre-steps. Cutover itself is a scheduled human action, not an accident.
- **Impact:** Critical. Two known breaks at TTL: (1) 32 product images on
  `kenyonexpress.co.il/wp-content/uploads/...`
  404; (2) WordPress URLs go away. Email (Resend) stays broken until the sending domain is verified. Googlebot will recrawl.
- **Mitigation:** Pull images to R2 first. Verify Resend DNS (SPF, DKIM, DMARC `p=none` day one) first. Lower TTL the day before. Attach the domain in Vercel **before** changing Cloudflare records. Cloudflare **DNS only** (grey cloud), not proxied. Keep MX. Snapshot
  `dig`
  to Desktop before edit. Rollback: restore previous A/AAAA (propagation, not seconds). Do not cut over on the same day as the first production Cardcom toggle if that can be avoided.

---

## R3. Exposed secret rotation (service_role, webhook, QR, cron)

- **Likelihood:** Low for a fresh leak; Medium for a **bad rotation**. History already recorded a foreign expired service_role in git (treated, not in HEAD).
- **Impact:** Catastrophic for
  `SUPABASE_SERVICE_ROLE_KEY`
  (BYPASSRLS). Critical for
  `CARDCOM_WEBHOOK_SECRET`
  (callbacks 401, paid cards never finalize). High for
  `VOUCHER_QR_SECRET`
  (every issued QR dies unless previous is kept). High for
  `CRON_SECRET`
  (all ten jobs 401; voucher email stops).
- **Mitigation:**
  - Leaky-name guard refuses
    `NEXT_PUBLIC_*SECRET*`
    at boot.
  - Webhook compare is constant-time against **current and retiring**, no short-circuit. Rotate by setting the new value, keeping the old as retiring, then dropping retiring after Cardcom IndicatorUrl is confirmed.
  - QR: move old to
    `VOUCHER_QR_SECRET_PREVIOUS`
    **before** changing current.
  - Cron: set the new secret on Vercel **and** Actions (and cron-job.org if used) in the same window, then redeploy, then flip the scheduler header.
  - service_role: rotate in Supabase, paste Vercel Production, redeploy, then revoke the old. Never
    `NEXT_PUBLIC_`.
  - Assume chat logs, screenshots, and
    `vercel env pull`
    files are leak surfaces.

---

## R4. Migration 172: master test product still in the catalogue

- **Likelihood:** Certain until applied.
  `migrations/pending/172_hide_master_product_test_row.sql`
  is **not applied**. Row
  `9bb347f8-03ec-48ce-8ff2-2503fb74c895`
  (`restaurants-meat-3`, name contains מאסטר / Master Product):
  `kenyon_price` 1,
  `full_price` 400,
  stock 10, on the homepage grid.
- **Impact:** High. Application guard
  `implausible-discount.ts`
  (ceiling 95%; this row is 99.75%; deepest real discount measured 50% on the 16 actives that carry `full_price`) stops **purchase**. It does **not** hide the row. Direct URL, listings, and homepage still show a ₪1 / ₪400 badge. If anyone ever bypasses the cart pricer, the order is real and there is nothing to fulfil.
- **Mitigation:** Human apply of 172 (sets stock to 0, **not** a delete: `order_items` may reference it). Applying to production is a hard stop for this agent. Until then: do not disable the implausible-discount guard; do not special-case the name "master" (three other live products contain מאסטר). Prove with
  `select stock_quantity from products where id = '9bb347f8-03ec-48ce-8ff2-2503fb74c895'`
  → `0` after apply (
  `docs/RUNBOOK.md`
  A1).

---

## R5. Quota exhaustion (Vercel, Supabase, Upstash, Resend, Cardcom, Meili, GitHub Actions)

- **Likelihood:** Medium in the first traffic spike; Certain on Hobby if ten Vercel crons are ever re-declared (platform silently runs two).
- **Impact:** Critical if cron/notifications stop or Postgres connections saturate during checkout. High if Resend 429s voucher mail. Medium if Meili/Upstash quota falls back (ILIKE / Postgres rate limit) and search/limits degrade.
- **Mitigation:** Keep crons **out** of
  `vercel.json`.
  One scheduler only (`CRON_SCHEDULER_ENABLED`). Watch
  `/api/cron/health`
  and Sentry Uptime. Supabase: connection pooling, no browser service_role. Resend: domain verified, suppressions table. Upstash/Meili missing is a documented degrade, not a crash. Actions minutes: ten jobs, four at 5–10 min, will dominate the free allotment; paid Actions or cron-job.org (after flipping the flag off) is the overflow. Cardcom has its own terminal caps: a declined flood is R8, not quota of ours.

---

## R6. RLS gaps (single-layer grants, fossil wallet DML, public DML policies)

- **Likelihood:** Medium for a regression; Low for a known hole that is already policy-correct **if nobody edits the unified policies carelessly**.
- **Impact:** Catastrophic if a money table policy becomes
  `USING (true)`
  (authenticated already has I/U/D grants on 56 relations). High if fossil
  `wallet_transactions`
  starts receiving client writes. High if
  `product_images`
  inner check is copied as
  `true`.
- **Mitigation:** Catalog:
  `docs/cursor/RLS-CATALOG.md`.
  Never
  `has_role('customer')`
  for ownership. Do not revoke anon EXECUTE on
  `is_admin()` /
  `is_supplier_member()`
  (migration 165 cancelled: anonymous catalogue 42501). Re-run live
  `pg_policies`
  after every apply. CI: anon-catalog and wallet-rls tests (14/14 named in STATE). Adding a read policy on a server-only table must not restore INSERT (grants revoked in 144 on several).

---

## R7. First real payment column mismatch (`42703`)

- **Likelihood:** Named certain in
  `docs/API-REFERENCE.md`
  §5 on 2026-09-01 (
  `orders.cashback_applied_agorot`
  /
  `order_items.unit_price_agorot`
  selected as literals; live names
  `cashback_applied_ils`
  /
  `unit_price_ils_agorot`). Later closeout notes claim money-column fills; **re-verify on the deployment you are launching**, not from memory.
- **Impact:** Critical. Card charged, order not `paid`, no voucher, webhook looks "handled".
- **Mitigation:** `retryFinalizePayment` / stranded-payments cron after a code fix. Do not finalize from the Cardcom POST body. Prove with one ₪ live charge on vercel.app. If 42703 still raises, **stop launch**; it is a code fix, not a human DNS step.

---

## R8. Webhook authenticity / amount mismatch / double charge

- **Likelihood:** Medium (Cardcom unsigned callbacks are the design). High for two-tab double charge if stock reservation races.
- **Impact:** Critical (money vs order diverge) or High (two charges).
- **Mitigation:** `?s=` + GetLpResult. Dedup `(provider, external_event_id)`. Stock TTL 15 min. Idempotent voucher issue (cap per `order_item_id`). Token charge skips redirect. Never short-circuit secret compare (timing oracle on which secret matched).

---

## R9. Scheduler silent-stop (voucher email, invoices, stranded, reconcile)

- **Likelihood:** Medium (second scheduler, secret drift, Actions disabled, Hobby crons re-added).
- **Impact:** Critical for
  `notifications`
  (paid customer, no email). Critical for stranded-payments if finalize failed once.
- **Mitigation:** Probe without secret expects 401; with secret expects 200. One scheduler. Failure mails on the scheduler. Health cron pages a human.

---

## R10. QR secret / till replay / wrong supplier

- **Likelihood:** Medium at first partner onboarding (wrong shop, screenshot QR, network retry).
- **Impact:** High (free meal / double consume) if RPC `WHERE status = 'issued'` is bypassed. Low if the RPC is the only writer.
- **Mitigation:** `redeem_voucher` DEFINER + idempotency. Lookup without consume for "is this valid?". Partner cannot SELECT issued inventory. PIN is not a login.

---

## R11. Resend key / unverified domain

- **Likelihood:** Certain until dashboard is green. STATE historically:
  `400 API key is invalid`.
- **Impact:** Critical for the voucher email path (cron can drain and still fail provider).
- **Mitigation:** New key in Vercel Production, domain verify, one real purchase email before DNS. DMARC `p=none` day one.

---

## R12. Checkout kill-switch / mock / sandbox confusion

- **Likelihood:** Medium on the morning of launch (someone sets
  `TRUE`
  or
  `1`
  or leaves mock from preview).
- **Impact:** Critical (till closed) or Catastrophic (fake success).
- **Mitigation:** Exact
  `true`.
  Mock unset. Sandbox boot-fail. Preview may sandbox; Production must not. Not the same day as DNS if possible.

---

## R13. Meilisearch / QStash unset at launch

- **Likelihood:** Certain if env never pasted. Degrades, does not crash.
- **Impact:** Medium. Search is ILIKE, no typo tolerance. Index jobs no-op successfully. Header `/search` still exists.
- **Mitigation:** Accept ILIKE for coupon-only soft launch, or set host+key and confirm one product webhook reindex. Not a commercial blocker if catalogue is small (80 products).

---

## R14. Physical fulfilment / payout fiction

- **Likelihood:** High if physical is sold before a real payout ledger exists.
- **Impact:** High (partner owed, admin payout actions `42P01`).
- **Mitigation:** Soft-launch coupon-only until payout exists **or** physical volume is manual. Do not call
  `admin/payouts.ts`
  as if it worked.

---

## R15. Database / Vercel plan capacity

- **Likelihood:** Low pre-launch (tiny row counts). Medium after marketing.
- **Impact:** Critical if checkout cannot reserve stock or write `payment_events`.
- **Mitigation:**
  `docs/CAPACITY.md`.
  Pooler. No `db push`. No seed on production.

---

## Order to burn down before taking money on the apex

1. R1 + R12 (terminal, no mock)
2. R11 (mail)
3. R4 (172, human apply)
4. R7 (one live ₪ on vercel.app)
5. R9 (scheduler proven 200)
6. R3 hygiene (no leaky names, retiring secrets understood)
7. R2 last (DNS)
8. R6 watch (do not edit policies in the launch window)
9. R5 / R13 / R14 accepted or deferred in writing
10. R16 (live Cloudflare zone only) before any DNS click
11. R17 (no surprise SQL) during the freeze

---

## R16. Editing the staged Cloudflare zone (silent no-op)

- **Likelihood:** High if the operator holds a token for account `13a3f166…` and follows
  `docs/DNS-CUTOVER-PLAN.md`
  without the 2026-09-02 banner.
- **Impact:** Critical. Dashboards show success. Apex still WordPress. Hours lost during the cutover window. If someone then "fixes" it by switching registrar NS to the staged zone, mail SPF `include[...].nses.com` becomes `permerror` the same day.
- **Mitigation:** Launch H0. Confirm `derek` / `elma`. Treat staged-zone API success as a failed cutover until public `dig` shows `76.76.21.21`.

---

## R17. Parallel production SQL without a human ticket

- **Likelihood:** Already happened (STATE 2026-09-04: 166–168 applied by a parallel agent). Pattern can repeat.
- **Impact:** High (schema moves under a freeze) to Critical (a revoke like the cancelled 165).
- **Mitigation:** One code agent per repo (ADR 0012). This pack does not apply SQL. 172 stays pending until the owner applies it.
