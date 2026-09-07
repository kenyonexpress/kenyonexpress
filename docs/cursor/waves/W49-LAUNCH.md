# W49 Launch

Code-agent spec. Human-only ordered steps live in `docs/cursor/business/LAUNCH-BLOCKERS.md` (item 92) and the older `docs/cursor/LAUNCH-BLOCKERS.md`. DNS **last**. Tag `v7.0.0-rc1` only after H1–H6 and this wave's verification.

---

## What it builds

1. Do not treat this markdown as a deploy. Code freeze + human checklist.
2. Cardcom production, Resend, R2, rotated service key, `CHECKOUT_ENABLED=true`, mock unset, sandbox boot-fail, ntfy topic, WhatsApp number, cron Actions + secret, 172 stock 0, 169 optional for ads honesty.
3. Apex still WordPress until Box NS / Cloudflare **live** zone (`derek`/`elma`, not staged `ignat`/`tess`).
4. Vercel watches this GitHub repo, `fra1`, pnpm, root empty.

---

## Tables

No schema change in this wave. 172 and 169 are human applies **before** or as listed in launch blockers, not agent applies.

---

## RLS

Re-measure optional but recommended before cutover.

---

## Money invariants

First real ₪ is H6. Master SKU must not be buyable. Kill switch known.

---

## Tests before close

Human: one paid coupon, one scan, one refund-to-wallet staging. E2E green on start. Visual <11%.

---

## Feature flag

`CHECKOUT_ENABLED`. All kill switches off. `CARDCOM_USE_MOCK` unset.

---

## Docs updated

`LAUNCH-BLOCKERS.md`, `RUNBOOK-DNS-CUTOVER.md`, `ON-CALL-GUIDE.md`.

---

## Edge cases

Two Cloudflare zones. `NEXT_PUBLIC_*` needs rebuild. 32 WP image URLs.

---

## Hebrew UX strings

Launch banner only if needed: האתר במעבר. Prefer none; WP until cutover.

---

## Open questions

| Q | Best answer |
|---|---|
| Does Vercel track this repo? | Confirm dashboard. Live `*.vercel.app` is not proof `main` deploys. |

---

## Second pass

Human list is `business/LAUNCH-BLOCKERS.md`. DNS last (`ops/RUNBOOK-DNS-CUTOVER.md`). Rotate leaked key before H6. 172 before claiming no test deals. ntfy topic unguessable. This docs branch does not tag `v7.0.0-rc1`.
