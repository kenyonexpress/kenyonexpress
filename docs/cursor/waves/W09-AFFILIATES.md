# W09 Affiliates

Code-agent spec. Tables `affiliates` exist (RLS 4 policies in the 2026-08-19 manifest). Admin `/admin/affiliates` exists. This wave is **attribution ops**, not a payout rail.

---

## What the wave builds

1. Cookie/query attribution `ke_attr` (already listed in legal cookie tests) bound at first touch, converted only on **paid**.
2. Admin list of affiliates. No self-serve public signup in v1 (fraud).
3. Reporting in agorot from **order snapshots**, never live `products.platform_percent`.

**Do not build.** Paying affiliates through `payout_statements` (types-ahead, 42P01). A global affiliate percent. Mixing affiliates with `fn_complete_referral` (two bonuses on one order needs an explicit product rule; default is **one** growth bonus, referrals win if both present, document it).

---

## Tables

`affiliates`, `orders` (attribution columns if present), `audit_log`. No new money table without a human migration.

---

## RLS

Staff only for affiliate PII. Anon reads nothing. Affiliate portal is out of v1.

---

## Money invariants

Integer agorot. Snapshot at pay. Coupon 100/0 still holds: affiliate fee comes from **platform** take, never from the restaurant's cash-at-till.

---

## Tests

Attribution cookie cannot be set from an open redirect. Paid-only conversion. No double bonus with referrals unless explicitly specified. content_uploader 403.

---

## Feature flag

`affiliates.is_active`. Off: cookie ignored, in-flight paid rows keep their snapshot.

---

## Close

Admin can see attributed paid orders. No payout file. Cookie documented in `GLOSSARY.md` and `DATA-RETENTION.md`.
