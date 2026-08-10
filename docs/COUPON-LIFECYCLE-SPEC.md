# COUPON-LIFECYCLE-SPEC.md
# מחזור חיי קופון: מכונת מצבים

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

---

## 0. סטטוסים קנוניים

Enum יעד:

```text
issued | used | expired | refunded
```

| שם במסמכים/UI ישנים | קנוני |
|---|---|
| `redeemed` | **`used`** (alias לקריאה; כתיבה חדשה רק `used`) |
| `issued` | `issued` |
| `expired` | `expired` |
| `refunded` | `refunded` |

אופציונלי תפעולי (לא חובה ב-enum אם ממומש בדגל): `frozen` לחסימה זמנית ב-chargeback (או `issued` + `frozen_at`).

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
         │     redeem │ expire cron │ refund/cancel
         │      atomic│             │
         │            ▼             ▼
         │        ┌──────┐    ┌──────────┐
         │        │ used │    │ refunded │
         │        └──────┘    └──────────┘
         │            │
         │            X (טרמינלי למימוש)
         │
         └─ expire ──▶ ┌─────────┐
                       │ expired │
                       └─────────┘
```

טרמינליים למימוש: `used`, `expired`, `refunded`.  
מ-`used` אין חזרה ל-`issued`.  
מ-`refunded` אין מימוש.

---

## 2. טבלת מעברים

| מ | אל | טריגר | תנאים |
|---|---|---|---|
| (none) | `issued` | הנפקה אחרי order paid | snapshots כסף + QR חתום |
| `issued` | `used` | סריקת ספק אטומית | `FOR UPDATE` + `WHERE status='issued'` |
| `issued` | `expired` | cron / בדיקת תוקף | `expires_at <= now()` |
| `issued` | `refunded` | ביטול מאושר + Cardcom | טרם מימוש |
| `issued` | freeze | chargeback / fraud | בלי side-effect כסף לספק קופון |
| `used` | (אין) | (אין) | אין מעבר; מחלוקת ידנית בלבד |
| `expired` | `issued` | הארכת admin נדירה | audit חובה |
| `refunded` | (אין) | (אין) | טרמינלי |

---

## 3. Side effects לפי מעבר

| מעבר | מייל | אחר |
|---|---|---|
| → issued | `coupon_issued` | הצגה באזור אישי / Wallet pass אופציונלי |
| → used | `coupon_redeemed` | audit redemption; **אין** payout קופון |
| → expired | `coupon_expired` | void Wallet; אופציונלי זיכוי ארנק לפי מדיניות |
| → refunded | `coupon_refunded` | Cardcom refund; QR מת |

---

## 4. כללי כסף (No Escrow)

- מקדמת קופון נשארת אצל הפלטפורמה; אין held לספק.  
- במימוש: הלקוח משלם יתרה בעסק; הפלטפורמה לא "משחררת" מקדמה.  
- ב-refund: מחזירים את ששולם באתר (פחות דמי ביטול אם חלים).  

---

## 5. אימות סריקה (תמצית)

סדר בדיקות: חתימה → ספק תואם → `status=issued` → `expires_at` → עדכון אטומי ל-`used`.  
כשל: `already_used` / `expired` / `refunded` / `not_found` בלי side effects.

פירוט: ARCHITECTURE-COUPON-REDEMPTION + FRAUD.

---

## 6. Acceptance

- [ ] קוראים מתייחסים ל-`redeemed` כ-`used`  
- [ ] אין double-redeem תחת עומס  
- [ ] refund על used נחסם אוטומטית  
- [ ] מיילים לכל מעבר ליבה  

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-08-11 | מכונת מצבים issued/used/expired/refunded + alias redeemed |
