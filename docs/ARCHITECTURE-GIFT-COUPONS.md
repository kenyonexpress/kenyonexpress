# ארכיטקטורה: קופון מתנה

רכישה למתנה, ברכה, העברת בעלות, ומימוש. אותם כללי כסף כמו קופון רגיל (No Escrow).

Status: **BINDING** · עודכן: 2026-08-12 · QA: PASS  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2` · batch #14/50  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מסמכים קשורים:

```
docs/ARCHITECTURE-COUPON-LIFECYCLE.md
docs/ARCHITECTURE-COUPON-REDEMPTION.md
docs/ARCHITECTURE-INVENTORY.md
docs/ARCHITECTURE-CHECKOUT-FLOW.md
docs/ARCHITECTURE-NOTIFICATIONS.md
docs/ARCHITECTURE-FRAUD-PREVENTION.md
docs/CONTRADICTIONS.md
```

מודל כסף: **No Escrow**. מקדמה באתר = הכנסת פלטפורמה. העברה/מימוש לא משחררים payout לספק.

---

## 0. הכרעות

| # | הכרעה |
|---|---|
| G1 | תשלום + mint כמו קופון רגיל: רק אחרי order `paid` מאומת ב-GetLpResult. |
| G2 | בעלות ראשונית = הרוכש (`user_id` על ה-voucher). |
| G3 | העברת בעלות רק מ-`issued` → משתמש אחר מאומת; לא מ-`redeemed` / `expired` / `refunded`. |
| G4 | ברכה = מטא-דאטה (טקסט/תבנית); לא משנה סכומים, מכסה, או סטטוס. |
| G5 | מכסה משותפת עם דיל רגיל (I4 ב-INVENTORY). |
| G6 | אחרי transfer: רק הבעלים החדש מציג QR באזור אישי; הישן רואה "הועבר". |
| G7 | Redeem אצל ספק זהה לקופון רגיל (RPC + CAS). |
| G8 | Refund: לפי בעלות נוכחית + סטטוס `issued` בלבד; אחרי redeem אין refund לכרטיס. |

---

## 1. זרימה מקצה לקצה

```text
רוכש מוסיף דיל (דגל gift אופציונלי ב-checkout)
  → beginCheckout + snapshots + LP
  → paid → mint voucher status=issued, owner=buyer
  → (אופציונלי) כתיבת greeting
  → transfer(owner → recipient):
       UPDATE owner WHERE status='issued' AND owner=caller
  → recipient מציג QR
  → ספק סורק → redeemed
```

---

## 2. העברת בעלות

| כלל | פירוט |
|---|---|
| מי מעביר | הבעלים הנוכחי המאומת |
| יעד | user id קיים / הזמנה באימייל+claim לפי מדיניות |
| אטומיות | UPDATE … WHERE status='issued' AND owner=… |
| כפילות | transfer שני נכשל אם כבר לא בעלים |
| Audit | ישן→חדש, timestamp, actor |
| התראות | outbox: gift_received / gift_sent |

אסור: העברה אחרי `redeemed`. אסור: פיצול שובר אחד לשניים.

---

## 3. ברכה ותצוגה

| רכיב | כלל |
|---|---|
| טקסט | אורך מוגבל; סינון XSS בשרת |
| נראות | לבעלים ולנמען אחרי transfer; לא לספק בסריקה (אופציונלי שם קצר) |
| עריכה | רק לפני transfer או לפי מדיניות "עד redeem" |

---

## 4. כסף ומכסה

זהה לקופון רגיל:

```text
charged = coupon_price
platform keeps 100% on-site
balance_at_business = face - coupon
supplier_due_from_platform = 0
```

יחידות gift נספרות ב-`issued` מול אותה `quota`.

---

## 5. כשלים

| קוד | התנהגות |
|---|---|
| `not_owner` | אין transfer |
| `not_issued` | אין transfer / אין הצגת QR פעיל |
| `recipient_invalid` | דחייה; בעלות נשארת |
| `quota` | כמו INVENTORY |
| `already_redeemed` | בסריקה רגילה |

---

## 6. Acceptance

- [ ] Mint רק אחרי paid  
- [ ] Transfer רק מ-issued עם audit  
- [ ] מכסה משותפת  
- [ ] Redeem זהה לרגיל  
- [ ] No Escrow / אין payout על gift  
- [ ] Refund רק לפני redeem  

---

## 7. Revision

| תאריך | שינוי |
|---|---|
| 2026-08-06 | QA-PASS |
| 2026-08-12 | batch-2 #14 stub |
| 2026-08-12 | batch-2 #14 pass-2: transfer, greeting, failures, money |
