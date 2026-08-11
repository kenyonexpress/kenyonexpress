# ארכיטקטורה: Account (סקירה)

סקירת BINDING לאזור האישי. פירוט במסמכי ACCOUNT-*.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד.  
מודל כסף: **No Escrow**; agorot integer.

מסמכים קשורים (מקור מלא):

```
docs/ARCHITECTURE-ACCOUNT-AREA.md
docs/ARCHITECTURE-ACCOUNT-IDENTITY.md
docs/ARCHITECTURE-ACCOUNT-WALLET.md
docs/ARCHITECTURE-PERSONAL-AREA.md
docs/ARCHITECTURE-CART-CHECKOUT.md
```

קוד dumps ישנים (2500+ שורות): git history לפני 2026-08-12.

---

## החלטה

| # | הכרעה |
|---|---|
| AC1 | Route group `(account)`: auth gate ב-layout; redirect `/login?next=`. |
| AC2 | RLS = גבול; request-scoped Supabase client; לא adminClient ל-PII. |
| AC3 | משטחים: overview, orders, coupons/QR, wallet, addresses, tokens, details. |
| AC4 | כסף: agorot; UI ₪ `he-IL`; לא float totals. |
| AC5 | קופון: `issued→used`; QR ב-`/account/coupons`; לא PAN/CVV. |
| AC6 | Wallet: site credit בלבד; לא cash-out; mutations לא מ-UI. |
| AC7 | RTL Hebrew; Asia/Jerusalem dates. |
| AC8 | Soft-delete addresses; orders keep historical `address_id`. |

---

## חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| guest account area | AC1: login required. |
| show full cardcom token | AC5: last4 only. |
| wallet P2P transfer | AC6: policy. |
| monolithic 2500-line spec here | pointer to ACCOUNT-* docs. |
| Escrow balance display | No Escrow model. |

---

## סכמת DB

```text
profiles, orders, order_items, vouchers
wallet_ledger / wallet_transactions
addresses (deleted_at)
payment_tokens (last4, brand; PAN not selectable)
```

אין DDL חדש.

---

## מקרי קצה

| # | מקרה | התנהגות |
|---|---|---|
| CE1 | session expired on /account | redirect login preserve next. |
| CE2 | order belongs to other user | RLS empty/not found. |
| CE3 | coupon expired | tab filter + explain wallet if credited. |
| CE4 | delete address in use | soft delete; order keeps ref. |
| CE5 | OAuth only user no password | details page; logout works. |
| CE6 | QR screenshot share | security: time-limited display policy UX. |

---

## פתוחות

| # | פתוח | הערה |
|---|---|---|
| O1 | pure RLS order joins (no service role) | identity doc target. |
| O2 | notification prefs UI | ACCOUNT-IDENTITY. |
| O3 | merge guest cart edge cases | CART-GUEST. |

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-07-30 | full account spec (dump) |
| 2026-08-12 | batch-2: BINDING overview pointer |
