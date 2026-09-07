# W07 Supplier onboarding

Code-agent spec. Today admin creates `suppliers` + `supplier_members`. Public `submitSupplierLead`. Access is membership, not `profiles.role = vendor` alone. See `docs/cursor/contracts/ROLE-VENDOR.md`.

---

## What it builds

1. Lead → admin approve → `suppliers` row → `supplier_members` owner for the applicant uid.
2. KYC light: name, tax id, city, phone. Platform is the Cardcom merchant. No sub-merchant.
3. Draft catalogue; **admin publish**. Applicant cannot set `platform_percent` or invent 10%.
4. Hebrew briefing: coupon prepaid stays on the platform; cash at till is the shop's; no escrow; coupon path has no payout file.

---

## Tables

`supplier_leads`, `suppliers`, `supplier_members`, `profiles.supplier_id` (service/admin only).

---

## RLS

Lead via rate-limited action. Approve admin. Member-role trigger (035): cannot self-grant. `profiles.role` frozen for the user.

---

## Money invariants

`default_split_percent` is **not** a checkout rate. Prefill only if admin still confirms per product. Unsellable without `platform_percent`. Coupon `supplierDue` = 0.

---

## Tests before close

Spam limit on lead. Approve writes membership + `audit_log`. Publish 403 for the applicant. Missing percent cannot sell. Scanner role cannot onboard another shop.

---

## Feature flag

Public lead form off by default until legal copy is ready. Off: hide form, keep admin-created partners. Pending leads stay pending.

---

## Docs updated

`ROLE-VENDOR.md`, `SUPPLIER-STATE-MACHINE.md`, `POST-LAUNCH-ROADMAP.md` P6, `ADMIN-HANDBOOK.md`.

---

## Edge cases

- Duplicate lead same phone: do not create two suppliers.
- Google uid vs later password user: bind email lowercase.
- `vendor` on profiles without membership: portal `access-denied`, not a till.

---

## Hebrew UX strings

| Key | Copy |
|---|---|
| Lead CTA | הרשמת בית עסק |
| Thanks | קיבלנו. נחזור אחרי בדיקה. |
| Access denied | אין לך הרשאה לפורטל הספק |
| Brief coupon | התשלום באתר נשאר אצל הפלטפורמה. היתרה נגבית אצלך במעמד המימוש. |
| Brief no escrow | אין נאמנות ואין חשבון ממתינים. |
| Unsellable | חובה לקבוע עמלת פלטפורמה. אין ברירת מחדל. |

---

## Open questions

| Q | Best answer |
|---|---|
| Self-publish products? | **No** in v1. Admin publish. |
| Payout bank details? | **Not** on coupon path. Do not add `payout_statements` to unbreak a 500. |
