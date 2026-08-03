# ארכיטקטורה: מניעת הונאה

מימוש כפול, צילומי מסך QR, chargebacks, בדיקות velocity, וחסימת קופון.

Status: **BINDING** · עודכן: 2026-08-03  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-lifecycle`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מסמכים קשורים:

```
docs/ARCHITECTURE-COUPON-REDEMPTION.md
docs/ARCHITECTURE-ADMIN-DASHBOARD.md
docs/ARCHITECTURE-CUSTOMER-SUPPORT.md
docs/ARCHITECTURE-LEGAL-COMPLIANCE.md
```

עקרון: מניעת כפילות ב-**DB אטומי**. Rate limits על כסף: **fail-closed**.

---

## 0. הכרעות

| # | הכרעה |
|---|---|
| F1 | קופון `issued` → `redeemed` פעם אחת. Replay → `already_used` בלי side effects כספיים. |
| F2 | אימות QR: חתימה + ספק תואם + תוקף + סטטוס. |
| F3 | צילום מסך לא נמנע ב-DRM; ההגנה היא חד-פעמיות + התראת בעלים. |
| F4 | Chargeback לא מוחק היסטוריה; תור `manual_review`. |
| F5 | Velocity checks על checkout / redeem / כרטיסים / חשבונות חדשים. |
| F6 | חסימת קופון: freeze / void רק דרך admin או מסלול dispute, עם audit. |
| F7 | No Escrow: אין "שחרור held" לביטול ב-chargeback על קופון. |

---

## 1. מימוש כפול

```text
POST redeem (supplier JWT)
  → membership active
  → BEGIN
      SELECT voucher FOR UPDATE
      UPDATE … WHERE status='issued'  -- rowcount 0 → already_used
      INSERT redemption audit
      -- אין ledger release לקופון
  → COMMIT
  → enqueue coupon_redeemed
```

| הגנה | פרט |
|---|---|
| Row lock | `FOR UPDATE` |
| Conditional update | רק `issued` |
| Idempotency | מפתח ניסיון יציב |
| Wrong supplier | נראה כ-`not_found` חיצונית |

---

## 2. צילומי מסך ושיתוף QR

| שכבה | מנגנון |
|---|---|
| חד-פעמיות | §1 |
| תוקף | `expires_at` |
| חתימה | בלי `VOUCHER_QR_SECRET` אי אפשר לזייף |
| התרעה | `coupon_redeemed` לבעלים: "אם לא אתם, פנו מיד" |
| Wallet | void אחרי redeem/refund |

אין להבטיח "QR שלא ניתן לצילום".

---

## 3. Chargebacks

1. היסטוריה לא נמחקת.  
2. מקור אמת: `payments` + orders + vouchers.  
3. אין auto-refund מלא ברגע ההודעה.  
4. אם `issued` → **חסימת קופון** (freeze) עד החלטה.  
5. אם `redeemed` → אין ביטול מימוש אוטומטי; טיפול ידני.

ראיות: webhook events, timeline voucher, scan log, IP truncated, audit.

---

## 4. Velocity checks

| בדיקה | מפתח | פעולה בסף |
|---|---|---|
| Checkout attempts | user + IP | fail-closed / delay |
| Redeem failures | supplier + member / IP | lockout קצר |
| כרטיסים שונים למשתמש חדש | user_id | manual_review |
| Burst `already_used` | voucher / supplier | התראת ops |
| Cross-supplier אותו code | code hash | flag שיתוף |
| הרשמות + רכישות מיידיות (referral abuse) | IP / device | דחיית בונוס |

כל התראה נכנסת ל-`manual_review_cases` או `security_events`.

---

## 5. חסימת קופון

| מצב | משמעות | מי |
|---|---|---|
| `freeze` / `blocked_redeem` | לא ניתן לסרוק; עדיין לא refund | admin / dispute job |
| `cancelled` / `refunded` | סופי; מייל `coupon_refunded` | admin path / legal engine |
| `expired` | פג; אין מימוש | cron |

אסור UPDATE ידני ב-SQL בלי audit.  
UI אדמין: כפתור "חסום מימוש" + סיבה חובה.

---

## 6. Acceptance

- [ ] שני redeem מקבילים → הצלחה אחת  
- [ ] Velocity מתועד ו-fail-closed על כסף  
- [ ] Chargeback → freeze ל-issued  
- [ ] חסימת קופון עם audit + הודעה ללקוח  

---

## 7. Revision

| תאריך | שינוי |
|---|---|
| 2026-08-03 | מימוש כפול, QR, chargebacks, velocity, חסימת קופון |
