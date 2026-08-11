# COUPON-LIFECYCLE-SPEC.md
# מחזור חיי קופון: מכונת מצבים מלאה

סטטוסים, מעברים מותרים, וצדדים (מייל / ledger / UI).

Status: **SPEC** · עודכן: 2026-08-11  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-lifecycle`

מסמכים קשורים:

```
docs/ARCHITECTURE-COUPON-REDEMPTION.md
docs/REFUNDS-CANCELLATION-POLICY.md
docs/EMAIL-TEMPLATES-SPEC.md
docs/ARCHITECTURE-FRAUD-PREVENTION.md
docs/FRAUD-PREVENTION-SPEC.md
docs/CONTRADICTIONS.md
```

מקור enum בפרוד (מיגרציה 054):

```text
issued | redeemed | expired | refunded
```

---

## 0. סטטוסים קנוניים

| סטטוס | משמעות | טרמינלי למימוש? |
|---|---|---|
| `issued` | הונפק אחרי `paid`; ניתן לסריקה | לא |
| `redeemed` | מומש אצל ספק (חד-פעמי) | כן |
| `expired` | פג תוקף בלי מימוש | כן |
| `refunded` | בוטל/הוחזר ללקוח | כן |

| שם במסמכים ישנים | קנוני בפרוד |
|---|---|
| `used` | **`redeemed`** (alias לקריאה בלבד; כתיבה חדשה = `redeemed`) |
| `coupon_redeemed` (אירוע אנליטיקה) | אירוע ≠ סטטוס DB |

אופציונלי תפעולי: `frozen_at` על שורת `issued` לחסימה זמנית ב-chargeback (בלי enum נפרד חובה).

---

## 1. דיאגרמת מעברים

```text
                 mint אחרי paid
                      │
                      ▼
                  ┌────────┐
         ┌───────▶│ issued │◀──────── freeze/unfreeze (admin)
         │        └───┬────┘
         │            │
         │   redeem   │ expire cron │ refund/cancel
         │    atomic  │             │
         │            ▼             ▼
         │      ┌──────────┐  ┌──────────┐
         │      │ redeemed │  │ refunded │
         │      └──────────┘  └──────────┘
         │            │
         │            X (אין unwind אוטומטי)
         │
         └─ expire ──▶ ┌─────────┐
                       │ expired │
                       └─────────┘
```

טרמינליים למימוש: `redeemed`, `expired`, `refunded`.  
מ-`redeemed` אין חזרה ל-`issued`.  
מ-`refunded` אין מימוש.

---

## 2. טבלת מעברים

| מ | אל | טריגר | תנאים |
|---|---|---|---|
| (none) | `issued` | הנפקה אחרי order paid | snapshots כסף + QR חתום |
| `issued` | `redeemed` | סריקת ספק אטומית | `FOR UPDATE` + `WHERE status='issued'` |
| `issued` | `expired` | cron / בדיקת תוקף | `expires_at <= now()` |
| `issued` | `refunded` | ביטול מאושר + Cardcom | טרם מימוש |
| `issued` | freeze | chargeback / fraud | דגל; בלי payout קופון |
| `redeemed` | (אין) | (אין) | מחלוקת ידנית בלבד |
| `expired` | `issued` | הארכת admin נדירה | audit חובה |
| `refunded` | (אין) | (אין) | טרמינלי |

---

## 2.1 מעברים אסורים (חייב להיכשל)

| ניסיון | תוצאה צפויה |
|---|---|
| `redeemed` → `issued` | דחייה; אין unwind אוטומטי |
| `redeemed` → `refunded` | דחייה; מחלוקת ידנית בלבד |
| `refunded` → `redeemed` | דחייה |
| `expired` → `redeemed` | דחייה |
| סריקה כפולה על אותו voucher | `already_redeemed`; בלי side effects |
| refund על `issued` בלי אישור Cardcom | דחייה; אין שינוי סטטוס |

---

## 3. Side effects לפי מעבר

| מעבר | מייל | אחר |
|---|---|---|
| → `issued` | `coupon_issued` | אזור אישי / Wallet pass אופציונלי |
| → `redeemed` | `coupon_redeemed` | audit redemption; **אין** payout קופון |
| → `expired` | `coupon_expired` | void Wallet; אופציונלי זיכוי ארנק לפי מדיניות |
| → `refunded` | `coupon_refunded` | Cardcom refund; QR מת |

---

## 4. כללי כסף (No Escrow)

- מקדמת קופון נשארת אצל הפלטפורמה; אין held לספק.  
- במימוש (`redeemed`): הלקוח משלם יתרה בעסק; הפלטפורמה לא "משחררת" מקדמה.  
- ב-`refunded`: מחזירים את ששולם באתר (פחות דמי ביטול אם חלים).  

---

## 5. אימות סריקה (תמצית)

סדר בדיקות: חתימה → ספק תואם → `status=issued` → `expires_at` → עדכון אטומי ל-`redeemed` (+ `redeemed_at`, `redeemed_by_*`).  
כשל: `already_redeemed` / `expired` / `refunded` / `not_found` בלי side effects.

פירוט: `ARCHITECTURE-COUPON-REDEMPTION.md` + `FRAUD-PREVENTION-SPEC.md`.

---

## 6. Acceptance

- [ ] Enum פרוד = `issued|redeemed|expired|refunded`  
- [ ] קוראים ישנים שמכירים `used` ממופים ל-`redeemed`  
- [ ] אין double-redeem תחת עומס  
- [ ] refund על `redeemed` נחסם אוטומטית  
- [ ] מיילים לכל מעבר ליבה  

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-08-11 | מכונת מצבים ראשונה (עם alias used) |
| 2026-08-11 | יישור לפרוד 054: קנוני `redeemed` (לא `used`) |
| 2026-08-11 | טבלת מעברים אסורים |
