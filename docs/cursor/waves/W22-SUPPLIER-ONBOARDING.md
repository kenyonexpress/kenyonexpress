# W22 Supplier self-serve onboarding

Code-agent spec. Today: admin creates `suppliers` + `supplier_members`. Public `submitSupplierLead`. Architecture: `docs/ARCHITECTURE-SUPPLIER-ONBOARDING.md`.

---

## What the wave builds

1. Lead form (already) → admin approve → create `suppliers` row → `supplier_members` owner row for the applicant uid.
2. KYC light: business name, tax id, city, phone. No Cardcom sub-merchant.
3. Draft products: content_uploader or owner manager; **admin publish** only. Money fields (`platform_percent`, `coupon_price_ils`) are admin-set. Self-serve must not invent a default 10%.
4. Briefing in Hebrew: platform keeps coupon prepaid; cash at till is theirs; no escrow; no payout file for coupon.

---

## Tables

`supplier_leads`, `suppliers`, `supplier_members`, `profiles` (`supplier_id` set by service_role / admin, never self).

---

## RLS

Lead INSERT via action (rate limited). Approve is admin. Owner cannot grant themselves `admin` on `profiles.role`. `member_role` trigger stops privilege escalation (035).

---

## Money invariants

No `default_split_percent` as a checkout rate (see `docs/cursor/money/DEFAULT-SPLIT-PERCENT.md`). Prefill of a new product form is allowed only if the admin still types/confirms `platform_percent`. Unsellable without it.

---

## Tests

Lead spam rate limit. Approve writes membership + audit. Applicant cannot publish. Missing `platform_percent` cannot sell.

---

## Feature flag

Off: hide public lead form, keep admin-created partners. In-flight leads stay pending.

---

## Close

Approved lead can log into `/supplier`. Cannot set platform percent. Coupon briefing matches DATA-FLOW.

---

## Second pass (after contracts and ops)

Binding: `WAVE-INDEX.md`, `contracts/ROLE-VENDOR.md` (till is `supplier_members`), `contracts/LEDGER.md` (integer agorot, cashback at finalize), `contracts/PAYMENT-BOUNDARY.md` (GetLpResult, no HMAC), `contracts/MIGRATION-PLAYBOOK.md` (full pending filenames). Feature flags are env. Do not invent payout or escrow writers. Hebrew UX stays RTL source-of-truth.
