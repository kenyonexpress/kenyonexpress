# ארכיטקטורה: קופון מתנה

רכישה למתנה, ברכה, העברת בעלות, ומימוש. אותם כללי כסף כמו קופון רגיל.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד.

מודל כסף: **No Escrow**. מקדמה באתר = הכנסת פלטפורמה. העברה/מימוש לא משחררים payout לספק.

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

---

## החלטה

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

### זרימה מקצה לקצה

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

### העברת בעלות

| כלל | פירוט |
|---|---|
| מי מעביר | הבעלים הנוכחי המאומת |
| יעד | user id קיים / הזמנה באימייל+claim לפי מדיניות |
| אטומיות | UPDATE … WHERE status='issued' AND owner=… |
| כפילות | transfer שני נכשל אם כבר לא בעלים |
| Audit | ישן→חדש, timestamp, actor |
| התראות | outbox: gift_received / gift_sent |

אסור: העברה אחרי `redeemed`. אסור: פיצול שובר אחד לשניים.

### ברכה ותצוגה

| רכיב | כלל |
|---|---|
| טקסט | אורך מוגבל; סינון XSS בשרת |
| נראות | לבעלים ולנמען אחרי transfer; לא לספק בסריקה |
| עריכה | רק לפני transfer או לפי מדיניות "עד redeem" |

### כסף

```text
charged = coupon_price
platform keeps 100% on-site
balance_at_business = face - coupon
supplier_due_from_platform = 0
```

יחידות gift נספרות ב-`issued` מול אותה `quota`.

---

## חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| mint לפני paid | G1: כמו קופון רגיל. |
| transfer מ-`redeemed` | G3: שובר נשרף; terminal. |
| ברכה משנה סכום | G4: מטא-דאטה בלבד. |
| מכסה נפרדת ל-gift | G5: quota משותפת. |
| payout לספק על gift | No Escrow: supplier_due = 0. |
| פיצול שובר לשניים | אסור: voucher אחד = בעלים אחד. |
| QR לרוכש אחרי transfer | G6: רק בעלים נוכחי. |

---

## סכמת DB

```text
vouchers (
  ...
  user_id uuid NOT NULL,          -- בעלים נוכחי
  is_gift boolean DEFAULT false,
  gift_message text,
  gift_transferred_at timestamptz,
  gift_transferred_from uuid,
  ...
)

voucher_transfers (
  id uuid PK,
  voucher_id uuid FK,
  from_user_id uuid,
  to_user_id uuid,
  actor_user_id uuid,
  created_at timestamptz
)
```

| שדה | שימוש |
|---|---|
| `vouchers.user_id` | בעלות נוכחית (מתעדכן ב-transfer) |
| `gift_message` | ברכה; nullable |
| `voucher_transfers` | audit append-only |

אין שדות held/payout על gift. `platform_percent = 100` על voucher (054).

---

## מקרי קצה

| # | מקרה | התנהגות |
|---|---|---|
| CE1 | transfer כפול במקביל | CAS: רק אחד מצליח |
| CE2 | recipient לא קיים | `recipient_invalid`; בעלות נשארת |
| CE3 | redeem לפני transfer | `already_redeemed` / not_owner |
| CE4 | refund אחרי transfer | לפי בעלים נוכחי + `issued` |
| CE5 | quota מלאה | כמו INVENTORY; אין mint |
| CE6 | greeting ארוך מדי | דחייה בשרת |
| CE7 | XSS בברכה | sanitize; strip tags |

---

## פתוחות

| # | פתוח | הערה |
|---|---|---|
| O1 | claim באימייל לנמען לא רשום | מדיניות onboarding |
| O2 | `voucher_transfers` migration | pending |
| O3 | תבניות ברכה מוכנות | UX phase 2 |
| O4 | עריכת ברכה אחרי transfer | counsel + מוצר |

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-08-06 | QA-PASS |
| 2026-08-12 | batch-2: transfer, greeting, failures, money |
| 2026-08-12 | batch-2: תבנית חובה (5 סעיפים) |
