# Decision log

This pack lives under
`docs/cursor/`
on branch
`ke-cursor-docs`.
It is markdown only.

Short ADRs:
`docs/adr/0001`
…
`0012`.
Longer historical log:
`docs/DECISIONS.md`.
Provisional (unapproved):
`docs/DECISIONS-PROVISIONAL.md`.

This file is what a new engineer needs: **choice, alternative not taken, consequence in this tree**. Status is "in force" unless marked ⚠️ (code diverges) or superseded.

Date is when the tree shows it, not when a meeting happened.

---

## Money and settlement

### D1. Integer agorot, branded types, half-up in one module
**ADR 0001.** Alternative: `numeric` shekels or float. Consequence: display is shekels; arithmetic is integers; DB CHECKs can require exact sums.
`src/lib/money.ts`
re-exports
`src/lib/commerce/money.ts`.
There is no
`packages/money.ts`.

### D2. No escrow
**ADR 0002 / 28.07.2026.** Alternative: hold supplier share until scan (27.07, reversed). Consequence: coupon prepayment stays 100% with the platform; supplier cash is
`face − coupon_price`
at the till;
`supplier_immediate_agorot = 0`
on coupons;
`escrow_holds`
has leftover rows and no writer; enum labels
`escrow_held` /
`escrow_released`
remain because you do not drop production enum values.
`docs/CONTRADICTIONS.md`
is history, not current law.

### D3. No payout system for coupons
Follows D2. Alternative: T+3 payout ledger (C8 in the cancelled 27.07 note). Consequence:
`admin/payouts.ts`
calls missing tables (
`42P01`).
Physical residual is accounting, not a bank file in this repo.

### D4. Coupon price is an absolute shekel amount
Alternative: percent of face. Consequence: missing
`coupon_price_ils`
→ unsellable. Discount % is display, not the charge.

### D5. `platform_percent` mandatory per product, no default
**ADR 0003.** Alternative: global 10%. Consequence: no env, no settings row. Admin must type it. Uploader cannot. Snapshot onto
`order_items`
at
`beginCheckout`.
Settlement never joins live
`products`.

### D6. Supplier residual is subtraction, not a second percent
Alternative: apply `100 − p` to the same base (double round). Consequence: conservation holds; remainder agora on voucher split goes to unit 1.

### D7. VAT extracted by subtraction at 18% (`VAT_RATE_BP = 1800`)
Alternative: compute net and vat independently. Consequence:
`net + vat = gross`.
Booked on **platform commission**, not on the cash the supplier takes at the counter.

### D8. Cashback credited in `finalizeOrder`, not at scan
Alternative: credit when QR succeeds (several old docs). Consequence: unredeemed coupons still grant snapshotted cashback; scanner cannot farm it;
`fn_wallet_transfer`
key
`order:<id>:cashback`.

### D9. Wallet is a payment source, not a commission change
Alternative: wallet spend reduces platform take. Consequence: card charge shrinks; split still uses snapshotted percents on the product money.

### D10. Statutory cancellation fee in CHECKs
Alternative: trust admin math. Consequence: min(5%, ₪100), 0 on defect/duplicate;
`23514`
even for
`service_role`.

---

## Payments

### D11. `finalizeOrder` is the only writer of `paid`
Alternative: webhook updates
`orders`
directly. Consequence: replay-safe; stranded cron can call the same function.

### D12. Cardcom legacy `/Interface/*.aspx`, Low Profile iframe
**ADR 0007.** Alternative: v11 JSON REST (
`docs/CARDCOM-ARCHITECTURE.md`
describes it; this tree does not call it). Consequence: no HMAC; compensating
`?s=`
secret +
`GetLpResult`.
Documents 4/3 issued by Cardcom, not us.

### D13. Compare both webhook secrets, no short-circuit
Alternative: return on first match. Consequence: rotation window; no timing leak of which secret hit.

### D14. Journal before acting
`payment_events`
append-only, then decide. Alternative: log after success (lost on crash). Consequence: 23505 on replay is success.

### D15. Cardcom only
Alternative: Stripe backup. Consequence: no second acquirer; mock/sandbox in production is a kill-the-company switch; boot refuses sandbox when
`NODE_ENV=production`.

### D16. Platform is merchant of record
Alternative: per-supplier Cardcom terminals as default. Consequence: optional extra terminals in a registry; tokens cannot cross terminals;
`cardcom_account_id`
on payments.

---

## Auth, RLS, schema process

### D17. RLS on every table; SQL is the kernel
**ADR 0005.** Alternative: "trust the server action". Consequence:
`service_role`
bypass is the dangerous door; reviews 154-style INSERT policies; DEFINER must not take caller-controlled uid.

### D18. Role lives in `profiles.role`, not JWT `app_metadata`
Alternative: Auth hook claims. Consequence: proxy and
`is_admin()`
read the table. Stale JWT cannot grant admin.

### D19. Four pack roles vs supplier membership
`profiles.role`:
customer, admin, super_admin, content_uploader, support (and friends). Till:
`supplier_members`
orthogonal. Alternative: a `scanner` profile role. Consequence: partners stay
`customer`
in profiles.

### D20. Support must not refund
Alternative: "support tools include refund". Consequence:
`is_admin()`
on
`refundOrder`.

### D21. Guest RLS reads `session_id`, not the Cookie jar
Alternative: forward browser cookies to PostgREST. Consequence: guest client sets a dedicated cookie name; mixing
`ke_session_id`
breaks carts.

### D22. Mobile till is anon + DEFINER RPCs
Alternative: embed
`service_role`.
Consequence: audits that grep only
`src/`
under-count;
`apps/mobile`
is a second caller.

### D23. Migrations via pending files, human apply, no `db push`
**ADR 0006.** Alternative: migrate on deploy. Consequence: disk lineage ≠ production (pre-059);
`database.ts`
can be types-ahead; pending duplicate numbers are a process bug (G15).

### D24. Types generated from production
`pnpm db:types`.
Alternative: Drizzle as source of truth. Consequence: Drizzle schema files are a mirror/CHECK sketch, **not** the runtime ORM.

---

## Runtime and product

### D25. Next App Router, `src/proxy.ts` named `proxy`
Alternative:
`middleware.ts`
(Next 15 muscle memory). Consequence: this branch is **16.2.12**. Briefs that say Next 15 are stale.

### D26. pnpm only
Alternative: npm. Consequence: arborist crash; Vercel
`installCommand`
must be pnpm (old linked repo used npm and never built).

### D27. Catalogue cache is `'use cache'` + one tag
**ADR 0009.** Alternative: Redis HTML cache. Consequence: two invalidation mechanisms would drift. Session data stays off that path.

### D28. Search backend without a search product
**ADR 0010.** Alternative: hide `/search` to match an old pixel rule, or ship facets. Consequence: Meilisearch HTTP (no SDK) or ILIKE; header field restored because refs contain it; no Meili dashboard in the storefront.

### D29. Visual parity measured vs `refs/`, content sourced from live WP
**ADR 0011** +
`docs/SOURCING-RULES.md`.
Alternative: Electro as content, or refs as content. Consequence: Electro is geometry; live site is strings/prices/photos;
`refs/`
is a gate output.

### D30. Outbox for customer notifications
**ADR 0008.** Alternative: await Resend in finalize. Consequence: pay succeeds even if mail fails; cron drain; operator mail may go direct.

### D31. Crons on GitHub Actions, not `vercel.json`
Alternative: Vercel cron. Consequence: Hobby silently runs two jobs; twelve jobs are declared in
`scripts/cron-jobs.json`
and tested for inventory.

### D32. HTTP to Upstash / Meilisearch / PostHog / Axiom / ntfy / Twilio / Resend
Alternative: official SDKs. Consequence: edge-safe fetch; worktree
`node_modules`
symlink must not gain a
`pnpm add`
blast radius.

### D33. Sentry for record, ntfy for interrupt, money-only pages
Alternative: page on every 500. Consequence: channel stays readable.

### D34. AI agents off, advise only, never write `platform_percent`
Alternative: auto-price. Consequence:
`@anthropic-ai/sdk`
inert without flags; usage table 153.

### D35. Hebrew RTL storefront; `next-intl` scaffolding
Alternative: real en locale at launch. Consequence: copy is Hebrew literals;
`locales: ['he','en']`
is a footgun until an i18n project (
`POST-LAUNCH-ROADMAP`).

### D36. One code agent per worktree
**ADR 0012.** Alternative: two Cursor agents on
`closeout/v1-final`.
Consequence: this pack stays on
`ke-cursor`
/
`ke-cursor-docs`;
never checkout the code branch here.

### D37. Class-table-ish catalogue
**ADR 0004.** Alternative: one table with every column nullable. Consequence:
`product_type`
branches checkout money; `service` has no distinct path yet.

### D38. Pixel gate <11% at 380/768/1440
Alternative: "looks fine". Consequence:
`compare.mjs`
must write
`docs/UI-PARITY-REPORT.md`;
dirty tree suffix
`-dirty`.

### D39. Master test product blocked in application
Alternative: delete the row (and three real products containing מאסטר). Consequence: id allowlist, not a string match; 172 sets stock 0 (human).

---

## ⚠️ Divergences (decision vs leftover code)

| Decision | Leftover | Consequence |
|---|---|---|
| No escrow | `escrow_holds` rows, enum labels, some comments in
`issue.ts`
still say "hold" | Do not revive writers |
| No payouts | Admin payout UI + types-ahead
`payout_statements` | 42P01 |
| Cashback at finalize | Docs that say "at scan" | This pack wins |
| Next 16 proxy | Docs that say middleware / Next 15 | This pack wins |
| Deletion exists | Root
`DATA-RETENTION.md`
"no endpoint" | `docs/cursor/DATA-RETENTION.md`
wins |
| Production on
`*.vercel.app` | 2026-09-01 "no deployment" essays | Launch blockers still human; the site exists |
| One guest cookie | Two names on purpose | Browser
`ke_session_id`
vs PostgREST
`session_id=` |

### D40. Guest identity uses two cookie names
**Measured 2026-09-07.** Alternative: one cookie forwarded as-is. Consequence: the Next cookie can stay httpOnly and named for the app; PostgREST sees only a UUID under the name the policy was written for; analytics still parses the Next cookie into
`anonymous_id`.

When a leftover wins in **runtime**, file a code-branch bug. When it wins only in a root markdown, ignore the markdown.

### D41. Pack slang "coupon-partner" is wrong
**Measured 2026-09-07.** Alternative: keep teaching four pack roles. Consequence: till is `supplier_members`; `vendor` is optional leftover. See `contracts/ROLE-VENDOR.md`.

### D42. Canonical wave numbers are the 100-item prompt
Alternative: keep W06-NEWSLETTER numbering from the prior pass. Consequence: leftover files remain extra briefs; `waves/WAVE-INDEX.md` is canonical for v7.

### D43. `default_split_percent` must be removed
Alternative: prefill new products from the supplier column. Consequence: looks like a global rate (C1). Strip from forms; drop column after a deploy that does not read it.

