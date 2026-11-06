# Partners and affiliates spec

Status: DRAFT · docs only  
Companions: `docs/ARCHITECTURE-AFFILIATES-REFERRALS.md`, `docs/ARCHITECTURE-REFERRALS.md`, `docs/ARCHITECTURE-SUPPLIER-ONBOARDING.md`

Two money tracks plus one lead track. Do not mix them.

All new money: integer agorot via `src/lib/money.ts`. Wallet credit only for affiliate and referral. No Bit, PayPal, or bank cash-out on those tracks.

Coupon economics for **suppliers**: the platform keeps the on-site coupon price. The business collects the remainder at the till. Affiliate commission is a cut of **on-site** paid, never of till remainder.

---

## 1. Supplier lead pipeline

### 1.1 Live intake

Route: `/suppliers` · form `SupplierLeadForm` · action `submitSupplierLead` · table `supplier_leads` (admin insert, no anon INSERT). Rate limit: 5 / hour / IP. Honeypot field.

LIVE fields: business_name, contact_name, phone (IL mobile), email, city, category, website, message.

SLA: first human reply within 2 business days (Asia/Jerusalem).

Hebrew submit success:

```
קיבלנו את הפנייה. נחזור אליכם בתוך שני ימי עסקים.
```

Rate limit:

```
יותר מדי פניות. נסו שוב בעוד שעה.
```

### 1.2 Pipeline stages (ops)

| Stage | Meaning | Exit |
|---|---|---|
| `new` | form row | admin claims |
| `contacted` | reply sent | wait on KYC pack |
| `kyc` | ח.פ, owner ID, address, logo | approve or reject |
| `contract` | supplier agreement (counsel) | signed |
| `provisioned` | `suppliers` row + `supplier_members` owner + at least one `scanner` | test scan |
| `live` | first `active` coupon with `platform_percent` set | scan test green |
| `rejected` / `withdrawn` | terminal | no catalog |

Do not create an `active` product without: name, phone, address, logo, scanner member, `platform_percent`, coupon expiry days, redemption instructions.

Onboarding login (customer-facing to the partner):

```
https://kenyonexpress.co.il/supplier/login
https://kenyonexpress.co.il/scan
```

Pitch (Hebrew, 60 seconds): see partnerships docs on other branches. Binding here: no Escrow, no "נעביר 90% אחרי סריקה", no payout on coupon lines.

`platform_percent` is per product, snapshotted to `order_items`. Coupon: used for audit, **does not create a payout row**. Physical (not public launch): percent of on-site charge; T+3 payout, min 100 ILS accrued.

---

## 2. Affiliate program terms

Affiliate ≠ הזמן חבר. Affiliate is an approved partner with `affiliates.status=approved`. Referral is any customer with `profiles.referral_code`.

### 2.1 Attribution

| | Affiliate | Referral |
|---|---|---|
| Link | `/r/a/{code}` (PLANNED; not in tree today) | `/?ref=CODE` LIVE via `ReferralShareCard` |
| Cookie | `ke_aff` 30 days, **first-touch** | claim / `?ref=` |
| Pay | `commission_percent` of on-site paid agorot | fixed agorot both sides from settings |
| Cash-out | wallet only | wallet only |

Same first order: **open referral wins over affiliate**. No double pay.

`commission_percent` required before approve. CHECK ≤50%. No database default percent. Formula:

```
commission_agorot = floor(base_agorot * percent / 100)
base_agorot = charged_on_site (coupon price paid), not face value, not till remainder
```

Idempotency: `affiliate:{order_id}:{affiliate_id}`  
Clawback on refund: `affiliate:{commission_id}:clawback` from wallet. If wallet empty, freeze affiliate until debt is zero. Do not take a card.

Hebrew affiliate terms (customer-facing, for the partner site):

```
עמלה מחושבת רק ממה שהלקוח שילם באתר על הקופון. יתרה ששולמה בבית העסק אינה נכנסת לבסיס. העמלה נכנסת לארנק באתר בלבד. אין משיכה לחשבון בנק.
```

Approval: admin `/admin/affiliates`. Cookie first-touch. Self-deals (same profile, same card fingerprint as referral spec) pay 0.

Status: `pending` → `approved` → `suspended`. Suspended links 404 for attribution (do not leak the reason).

---

## 3. Referral amounts (decision, settings often unseeded)

From growth/master decisions. Live measured 0 settings rows; program inactive until admin seeds `is_active=true`.

| Term | Agorot | Display |
|---|---|---|
| Referrer bonus | 2000 | ₪20 |
| Referred bonus | 1000 | ₪10 |
| Min first order (on-site) | 5000 | ₪50 |
| Qualify window | 14 days | |
| Cap per referrer | 5 / month, 30 / year | |

Clawback if the referred order is refunded inside the window. Self-referral, same device/card/phone: reject (`referral_signals`).

Hebrew (account):

```
הזמינו חבר
אתם מקבלים ₪20 לארנק, החבר מקבל ₪10, אחרי הזמנה ראשונה ששולמה באתר בסך ₪50 לפחות. הזיכוי לארנק באתר בלבד.
```

Do not show those numbers in the UI while settings are inactive.

---

## 4. Commission in agorot (examples)

Assume affiliate 10% and a coupon paid on site 3900 agorot, remainder 16000 at the till:

| | Agorot |
|---|---|
| On-site base | 3900 |
| Affiliate commission | 390 |
| Till remainder | 16000 (not in base) |
| Supplier payout from platform | 0 on coupon |

Physical example (not public launch): on-site 19900, `platform_percent` 15 → platform fee 2985, supplier due 16915. Affiliate 10% of 19900 = 1990 from **platform share**, not stacked on supplier due. If finance forbids affiliate on physical, `commission_agorot = 0` and the UI says affiliates apply to coupons only.

Deprecated `total_earnings_ils` numeric: do not add new writers. Use `total_earnings_agorot`.

---

## 5. Statements

### 5.1 Affiliate statement (PLANNED `/affiliate`)

Columns: date (Asia/Jerusalem), order ref (masked), on-site base agorot, percent, `commission_agorot`, status (`pending` / `credited` / `clawed_back`).

Footer: wallet balance. CTA `לארנק`. This is **not** `payout_statements` (supplier settlement).

Hebrew title: `דוח עמלות`  
Disclaimer: `זה נתוני עזר, לא חשבונית מס.`

Export CSV: integers agorot plus a ₪ formatted column. No customer emails.

### 5.2 Supplier statements

Coupon lines: payout 0, remainder column is informational. Physical: T+3, min ₪100. Admin `/admin/payouts` must not show an empty list because of a missing table (known migration backlog). Spec: fail the page, do not fake zero.

### 5.3 Referral statement

Customer `/account/referrals`: codes, pending, qualified, caps used (5/30). Amounts in ₪ from agorot.

---

## 6. Admin

| Screen | Action |
|---|---|
| `/admin/affiliates` | approve, set percent, suspend |
| `/admin/referrals` | freeze abusive codes |
| `/admin/users/[id]` | wallet ledger, no PAN |

`requireRecentAuth(15)` on approve and on manual wallet credit.

---

## 7. Acceptance

- Lead form rate limited, Hebrew SLA copy.
- Affiliate base = on-site agorot. Remainder excluded.
- Referral 20/10/50 and 5/30 caps only when settings active.
- Statements are ledger + wallet, not tax invoices.
- No double pay vs referral on the same first order.
