# Open questions

This pack lives under
`docs/cursor/`
on branch
`ke-cursor-docs`.
It is markdown only.

Everything below was **ambiguous, contradictory, or undocumented** while writing items 1–18. Each row is a concrete question plus the **best current answer from this worktree**. It is not a request for a meeting. If runtime disagrees, runtime wins and this row is wrong.

---

## Schema, types, pending SQL

### Q1. Are `payout_statements` (and friends) in production?
**Best answer:** `src/types/database.ts`
contains payout types (types-ahead).
`admin/payouts.ts`
is still treated as dead
`42P01`
against historical production. Coupon model owes suppliers 0. **Do not** apply a payout schema to "fix the 500" without a product decision that reverses D3.

### Q2. Why do pending numbers 169–172 each appear twice?
**Best answer:** process failure. Inventory test checks README ↔ filenames, **not** unique `\d{3}_` prefixes (G15). Human apply order is
`APPLY-ORDER.md`.
Agents must not pick a winner.

### Q3. Has 169 been applied?
**Best answer:** treat as **no** until a live probe shows
`purchase`
rows or the whitelist includes server names. CI can be green while production drops
`begin_checkout` /
`purchase` /
`voucher_redeemed` /
`order_refunded`
(G20). Admin "0 sales" is not a closed till.

### Q4. Has 150 / 157 been applied?
**Best answer:** code paths tolerate missing. Deletion falls back if
`fn_anonymize_user`
is
`PGRST202`.
Retention cron returns
`pending: '157_…'`
and stays green. Privacy is incomplete until a human applies them.

### Q5. Which money column generation is production?
**Best answer:** **`ils`** (
`order-money-columns.ts`
probe). A query that hard-codes
`platform_bp`
→
`42703`
on first real pay. Types-ahead can lie.

### Q6. Is Drizzle the ORM?
**Best answer:** No. Runtime is
`supabase-js`.
Four files under
`src/db/schema/`
plus
`drizzle-kit`
in dev. `db push`
is forbidden.

---

## Money behaviour vs leftover prose

### Q7. Does cashback land at scan or at pay?
**Best answer:** **`finalizeOrder`** via
`fn_wallet_transfer`
(`order:<id>:cashback`).
Older voucher essays that credit at QR are wrong. Scanner cannot farm cashback.

### Q8. Do
`percentageOf`
and
`applyBp`
match?
**Best answer:** they should on non-negative integers. Settlement docs tell people to use
`applyBp`.
`commission.ts`
still calls commerce
`percentageOf`.
No shared fixture (G16). Assume they match until a failing vector exists; do not add a third helper.

### Q9. Does
`issue.ts`
still implement C11(a) (supplier gets nothing) as a bug?
**Best answer:** the **file comment** still talks about "supplier's hold" and a 2026-07-27 stamp of 100 bp. Runtime coupon split is 100% platform by product type, not by that comment. Trust
`commission.ts`
+ DATA-FLOW, not the issuer comment.

### Q10. Is there a global platform rate "just for new products"?
**Best answer:** No. Unsellable is the correct failure. Admin form defaults are a violation if they write 10 without a human.

### Q11. `service` vs `physical` money?
**Best answer:** schema exists; settlement is the physical path. No third split.

---

## Security / RLS

### Q12. Guest cookie name?
**Best answer (measured in
`guest-session-cookie.ts`
+
`anon.ts`):** two names. The **browser** cookie is
`ke_session_id`.
The **PostgREST** header
`createGuestCartClient`
sends is
`Cookie: session_id=<uuid>`.
RLS reads
`request.cookies->>'session_id'`.
Analytics maps
`ke_session_id`
→
`anonymous_id`.
Not the browser jar. G17/G21.

### Q13. Can the admin webhooks tab read
`payment_webhook_events`?
**Best answer:** table was zero-policy / 172 comments the bug. Must
`createAdminClient`.
User-scoped client → empty or
`42501`.
G18.

### Q14. Does
`apps/mobile`
carry
`service_role`?
**Best answer:** it **must not**. Architecture: anon + DEFINER RPCs. R26 if a future patch adds the key. Grep
`src/`
alone under-counts.

### Q15. Is the default ntfy topic private?
**Best answer:** default
`kenyon-ofir-limit`
on
`ntfy.sh`
is a **known public-ish channel**. Alerts omit amounts by design. Production should set
`NTFY_TOPIC`
to an unguessable topic. Not verified in this session.

---

## Product surfaces that look finished in docs

### Q16. Is there a search product?
**Best answer:** `/search`
exists; header field exists (ADR 0010, pixel refs). There is **no** facet chrome, no typeahead destination, no Meili dashboard. Meilisearch is a backend.

### Q17. Are wishlist / reviews shipped?
**Best answer:** routes and actions exist; post-launch doc still treats PDP reviews and heart-on-card as unfinished product. Empty museum until paid orders (H6) and moderation. Do not advertise them as launch features.

### Q18. Is English a supported locale?
**Best answer:**
`next-intl`
routing declares
`he` + `en`.
UI copy is Hebrew literals. Enabling `/en` would be a half-translated site. i18n is post-launch.

### Q19. Are `@dnd-kit/*` and Radix toast used?
**Best answer:** dnd-kit: **zero**
`src/`
imports. Radix toast: call sites use
`sonner`.
Abandoned until a code-branch grep says otherwise.

---

## Deploy and launch (human-owned)

### Q20. Does Vercel watch this GitHub repo?
**Best answer as of this pack:** preview
`https://kenyonexpress.vercel.app`
is the hosted app this pack talks to. Root
`docs/THIRD-PARTY-DEPENDENCIES.md`
(2026-09-01) described a project linked to
`kenyonexpress-web`
that never built. **Those two sentences cannot both be the present.** Prefer live HTTP to that essay. Confirm in the Vercel dashboard before treating a
`main`
merge as a production deploy. Launch blockers still require production Cardcom, Resend, R2, DNS last.

### Q21. Two Cloudflare zones: which one is live?
**Best answer:** registrar delegates
`derek` /
`elma`.
Staged
`ignat` /
`tess`
returns API success and changes nothing. Editing the wrong zone is a silent no-op. DNS is last (
`LAUNCH-BLOCKERS`
H0).

### Q22. How many cron jobs?
**Best answer:** **twelve** in
`scripts/cron-jobs.json`
(inventory test). Older architecture text says ten. The JSON is the contract.

### Q23. Does legal/returns still say escrow/נאמנות?
**Best answer:** this pack forbids that copy. If the RSC page still says it, it is a **cutover trust risk**, not a money path. Check
`src/app/(legal)/`
on a code branch; this pack does not edit TSX.

---

## Deletion / privacy leftovers

### Q24. Must account deletion hash gift recipients?
**Best answer:**
`DELETION_EFFECTS`
does not list
`orders.gift_recipient_*`
or voucher gift columns. Books vs third-party PII. Conservative: hash gift contact on **sent** gifts when the sender is erased; keep the voucher row. Not implemented in the fallback loop. Confirm 150.

### Q25. Who ages
`voucher_redemptions.ip_address`?
**Best answer:** nobody. 157 only nulls
`audit_log`
IPs. Redemption IPs are D-shaped data on a C clock.

### Q26. Is
`DELETION_EFFECTS`
equal to 150?
**Best answer:** it is the UI/test contract. Fallback TS loop is a subset. Divergence is a privacy bug. Keep them identical on a code branch.

---

## Observability and tests

### Q27. If Sentry DSN is unset, do money alerts still fire?
**Best answer:**
`capturePaymentError`
no-ops without DSN.
`alertMoneyFailure`
/ ntfy is a **separate** path and was fixed so it does not early-return on missing Sentry (comment in
`sentry.ts`).
Verify with a staging ntfy before launch. Do not assume Sentry implies pager or vice versa.

### Q28. Does
`registry-matches-migration.test.ts`
prove production ingest?
**Best answer:** No. It diffs names against the **pending SQL file**. Production can still skip server events (Q3, G20).

### Q29. Next 15 vs 16?
**Best answer:** **16.2.12**,
`src/proxy.ts`,
export name
`proxy`.
The original brief for this pack said 15. The tree wins.

### Q30. Is coupon-partner a role?
**Best answer:** No. `supplier_members`. `vendor` is an enum leftover.

### Q31. Hash chain on audit_log?
**Best answer:** Unverified. Do not claim Merkle until 169 audit SQL is read.

### Q32. Cashback engine vs product percent?
**Best answer:** Checkout sends product `cashback_percent`. Treat `cashback/engine.ts` as unused until a caller is found.

### Q33. Twilio in production?
**Best answer:** Not required. Click-to-chat + optional Meta. Twilio down runbook is mostly no-op.

### Q34. Which 169/170/171/172?
**Best answer:** Full filename. Analytics vs audit. Indexes vs reporting. FTS vs shekel name. Hide SKU vs zero-policy RLS.

### Q35. When does cashback credit?
**Best answer:** `finalizeOrder` via `fn_wallet_transfer`, key `order:<id>:cashback`. Not at scan.

---

## How to close a question

1. Measure production (SQL or HTTP), or read the exact function, not an
   `ARCHITECTURE-*.md`
   from May.
2. If it needs a migration, it is a **human** apply.
3. If it needs TypeScript, it is the **code** worktree, not this branch.
4. Update this file in the same commit as the pack file that cited the wrong answer.

Until then, the conservative behaviour in
`docs/cursor/ONBOARDING.md`
§5 is the working assumption.
