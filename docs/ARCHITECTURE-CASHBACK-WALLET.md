# ARCHITECTURE: Cashback Wallet

ארנק קאשבק **פנימי בלבד**: ledger כפול-רישום באגורות integer, בלי משיכה החוצה.

Status: **BINDING** · Updated: 2026-08-03 (pack-20)  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-lifecycle`  
אין שינוי קוד. אין נגיעה ב-worktree הראשי (`kenyonexpress`).

Companions:

```
docs/ARCHITECTURE-WALLET-LEDGER.md
docs/ARCHITECTURE-REFERRAL.md
docs/ARCHITECTURE-NOTIFICATIONS.md
docs/ARCHITECTURE-SECURITY-RLS.md
docs/BUSINESS-MODEL.md
```

מסמך זה הוא החוזה המוצרי ל-cashback. פירוט טכני של `fn_wallet_transfer`: ראה `ARCHITECTURE-WALLET-LEDGER.md`.

---

## 0. הכרעות

| # | הכרעה |
|---|---|
| C1 | הארנק הוא אשראי פנימי לשימוש באתר/באפ בלבד. |
| C2 | **אין משיכה החוצה**, אין P2P, אין cash-out. |
| C3 | יתרות ותנועות: **integer agorot**. |
| C4 | כל תנועה = journal כפול-רישום דרך `fn_wallet_transfer`. |
| C5 | קאשבק מחושב מ-`paid_on_site_agorot` (מה שנגבה באתר), לא מ-face של קופון. |
| C6 | מקדמת קופון עצמה **אינה** נכנסת לארנק הלקוח כ-escrow; No Escrow. |
| C7 | זיכוי referral משתמש באותו ledger (`reason=referral_bonus`). |

---

## 1. זרימת earn

```text
order paid (finalize / webhook)
  → rule = active cashback_rules for product_type
  → cashback_agorot = floor(paid_on_site_agorot * percent / 100)
  → fn_wallet_transfer(
       from: platform:cashback_reserve,
       to: user available,
       reason: order_cashback,
       idempotency: cashback:{order_id}
     )
  → optional notify wallet_activity
```

כשל העברה אחרי paid: retry עם אותו idempotency; לא מבטל paid.

---

## 2. Spend (עתידי / כשמופעל)

| כלל | פירוט |
|---|---|
| מקסימום | לא יותר מיתרה; לא יותר מאחוז מ-order on-site (אם מוגדר cap) |
| יישום | לפני Cardcom charge: הפחתה מ-`amount_to_charge`; journal `order_spend` |
| קופון | מותר רק על החלק שמשולם באתר |
| Refund | החזר יחסי ליתרה פנימית (`order_refund_credit`) לפי מדיניות |

---

## 3. UI

| מקום | תוכן |
|---|---|
| `/account/wallet` | יתרה ₪, היסטוריה, משפט "לשימוש באתר בלבד" |
| Checkout | הצגת יתרה למימוש (אם flag) |
| Admin | adjust רק super_admin + recent auth + reason + audit |

אין כפתור משיכה.

---

## 4. Acceptance

- [ ] Earn אחרי paid עם idempotency
- [ ] Double-entry בלבד
- [ ] אין API משיכה
- [ ] UI מציג ₪; DB agorot
- [ ] קשר ל-referral מתועד

---

## 5. Revision

| Date | Change |
|---|---|
| 2026-08-03 | pack-20: cashback wallet פנימי + ledger binding |
