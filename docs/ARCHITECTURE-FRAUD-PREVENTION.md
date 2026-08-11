# ארכיטקטורה: מניעת הונאה

מימוש כפול, צילומי מסך QR, בדיקות velocity, chargebacks, והקפאת קופון (freeze).

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.  
מודל כסף: **No Escrow**

מסמכים קשורים:

```
docs/DOCS-TEMPLATE-BINDING.md
docs/ARCHITECTURE-COUPON-LIFECYCLE.md
docs/ARCHITECTURE-COUPON-REDEMPTION.md
docs/ARCHITECTURE-TRUST-SAFETY.md
docs/ARCHITECTURE-REFUNDS-DISPUTES.md
docs/CONTRADICTIONS.md
```

עקרון: מניעת כפילות ב-**DB אטומי**. Rate limits על כסף: **fail-closed**.

---

## 0. החלטה (F1 עד F7)

| # | הכרעה |
|---|---|
| F1 | קופון `issued` → `redeemed` פעם אחת. Replay → `already_redeemed` בלי side effects כספיים. |
| F2 | אימות QR: חתימה + ספק תואם + תוקף + סטטוס. |
| F3 | צילום מסך לא נמנע ב-DRM; ההגנה היא חד-פעמיות + התראת בעלים. |
| F4 | Chargeback לא מוחק היסטוריה; תור `manual_review`. |
| F5 | Velocity checks על checkout / redeem / כרטיסים / חשבונות חדשים. |
| F6 | חסימת קופון: freeze / void רק דרך admin או מסלול dispute, עם audit. |
| F7 | No Escrow: אין "שחרור held" לביטול ב-chargeback על קופון. |

---

## 1. חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| optimistic locking בלי `FOR UPDATE` | race double redeem |
| DRM / watermark על QR | לא מונע screenshot; F3 |
| auto-refund מלא ב-chargeback | F4; דורש review |
| soft-delete redemption rows | שובר ראיות; append-only |
| held balance לספק ב-chargeback | סותר No Escrow; F7 |

---

## 2. סכמת DB

**אין DDL חדש במסמך זה.**

| טבלה | שימוש fraud |
|---|---|
| `vouchers` | `status`, `expires_at`, conditional UPDATE |
| `voucher_redemptions` | append-only; idempotency |
| `payments` | chargeback source |
| `payment_webhook_events` | dedup + timeline |
| `manual_review_cases` / `security_events` | velocity alerts |
| `audit_log` | freeze/void/refund |

Migration מקור: redeem RPC + voucher status enum במיגרציות קיימות.

---

## 3. מימוש כפול ו-velocity

```text
POST redeem
  → BEGIN
      SELECT voucher FOR UPDATE
      UPDATE … WHERE status='issued'  -- rowcount 0 → already_redeemed
      INSERT redemption audit
  → COMMIT
```

| בדיקה | מפתח | פעולה בסף |
|---|---|---|
| Checkout attempts | user + IP | fail-closed / delay |
| Redeem failures | supplier + member | lockout קצר |
| Burst `already_redeemed` | voucher / supplier | התראת ops |
| Cross-supplier אותו code | code hash | flag שיתוף |
| Refund storms | user + payment | תור review |

### Chargeback ו-freeze

1. אם `issued` → **הקפאת קופון** עד החלטה.  
2. אם `redeemed` → טיפול ידני; אין ביטול מימוש אוטומטי.  
3. No Escrow: אין release לספק על מקדמת קופון.

| מצב voucher | משמעות |
|---|---|
| `frozen` / `blocked_redeem` | לא ניתן לסרוק |
| `refunded` / `cancelled` | סופי |
| `void` | admin + audit (הונאה חמורה) |

---

## 4. מקרי קצה

| # | מצב | התנהגות |
|---|---|---|
| FP-E1 | שני עובדים סורקים במקביל | הצלחה אחת; השני `already_redeemed` |
| FP-E2 | screenshot לפני redeem | מי שמגיע ראשון לספק מנצח (סיכון מוצר) |
| FP-E3 | chargeback על order עם 3 vouchers | freeze כל `issued`; review per voucher |
| FP-E4 | webhook replay Cardcom | dedup `external_event_id` |
| FP-E5 | referral abuse (הרשמה+רכישה מיידית) | דחיית בונוס; F5 |
| FP-E6 | admin freeze בלי reason | UI חוסם; audit חובה |
| FP-E7 | velocity false positive (אירוע) | manual_review; לא auto-ban |

---

## 5. פתוחות

| # | פער | תאריך |
|---|---|---|
| O1 | סף burst `already_redeemed` ל-alert | 2026-08-12 |
| O2 | אינטגרציה Cardcom dispute API (אם קיים) | 2026-08-12 |
| O3 | ML scoring ל-referral (מאוחר) | 2026-08-12 |

---

## 6. Acceptance

- [ ] שני redeem מקבילים → הצלחה אחת
- [ ] Velocity מתועד ו-fail-closed על כסף
- [ ] Chargeback → freeze ל-issued
- [ ] No Escrow בטיפול chargeback/freeze

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-08-03 | מימוש כפול, QR, chargebacks, velocity |
| 2026-08-12 | batch-2: DOCS-TEMPLATE-BINDING |
