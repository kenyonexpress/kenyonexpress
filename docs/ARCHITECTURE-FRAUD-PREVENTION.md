# ארכיטקטורה: מניעת הונאה

מימוש כפול, צילומי מסך QR, בדיקות velocity, chargebacks, והקפאת קופון (freeze).

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2` · batch #12/50  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מסמכים קשורים:

```
docs/ARCHITECTURE-COUPON-LIFECYCLE.md
docs/ARCHITECTURE-COUPON-REDEMPTION.md
docs/ARCHITECTURE-SUPPLIER-REDEMPTION.md
docs/ARCHITECTURE-REFUNDS-DISPUTES.md
docs/ARCHITECTURE-ADMIN-DASHBOARD.md
docs/ARCHITECTURE-CUSTOMER-SUPPORT.md
docs/ARCHITECTURE-TRUST-SAFETY.md
docs/ARCHITECTURE-LEGAL-COMPLIANCE.md
docs/CONTRADICTIONS.md
docs/BUSINESS-MODEL.md
```

עקרון: מניעת כפילות ב-**DB אטומי**. Rate limits על כסף: **fail-closed**.  
מודל כסף: **No Escrow**. Chargeback/freeze לא "משחררים held" לספק.

---

## 0. הכרעות

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

## 1. מימוש כפול (double redeem)

```text
POST redeem (supplier JWT + PIN session אם נדרש)
  → membership active
  → BEGIN
      SELECT voucher FOR UPDATE
      UPDATE … WHERE status='issued'  -- rowcount 0 → already_redeemed
      INSERT redemption audit
      -- אין ledger release לקופון
  → COMMIT
  → enqueue voucher_redeemed
```

| הגנה | פרט |
|---|---|
| Row lock | `FOR UPDATE` |
| Conditional update | רק `issued` |
| Idempotency | מפתח ניסיון יציב |
| Wrong supplier | נראה כ-`not_found` חיצונית |
| Burst `already_redeemed` | התראת ops (velocity) |

שני מכשירים / שני עובדים במקביל: הצלחה אחת בלבד. אין תשלום כפול לספק ואין גבייה כפולה מהלקוח דרך הפלטפורמה.

---

## 2. צילומי מסך ושיתוף QR

| שכבה | מנגנון |
|---|---|
| חד-פעמיות | §1 |
| תוקף | `expires_at` |
| חתימה | בלי מפתח חתימה אי אפשר לזייף מטען תקף |
| התרעה | `voucher_redeemed` לבעלים: "אם לא אתם, פנו מיד" |
| Wallet / UI | אחרי redeem/refund השובר לא מוצג כבר־לשימוש |

אין להבטיח "QR שלא ניתן לצילום". צילום מסך של חבר שעדיין `issued` הוא שיתוף לגיטימי מבחינת קריפטו; אחרי redeem הראשון, השני נכשל.

סיכונים נלווים:

- שיתוף קוד לפני redeem → מי שמגיע ראשון לספק מנצח; זה סיכון מוצר, לא באג.
- Cross-supplier אותו code → flag שיתוף / enumeration (לוג).

---

## 3. Velocity checks

| בדיקה | מפתח | פעולה בסף |
|---|---|---|
| Checkout attempts | user + IP | fail-closed / delay |
| Redeem failures | supplier + member / IP | lockout קצר |
| PIN failures | member / device | lockout + audit |
| כרטיסים שונים למשתמש חדש | user_id | manual_review |
| Burst `already_redeemed` | voucher / supplier | התראת ops |
| Cross-supplier אותו code | code hash | flag שיתוף |
| הרשמות + רכישות מיידיות (referral abuse) | IP / device | דחיית בונוס |
| Refund storms | user + payment | תור review |

כל התראה נכנסת ל-`manual_review_cases` או `security_events`.  
סף מדויק: קונפיג תפעולי; שינוי סף לא דורש שינוי מודל.

---

## 4. Chargebacks

1. היסטוריה לא נמחקת.  
2. מקור אמת: `payments` + orders + vouchers + scan log.  
3. אין auto-refund מלא ברגע ההודעה.  
4. אם `issued` → **הקפאת קופון** (freeze) עד החלטה.  
5. אם `redeemed` → אין ביטול מימוש אוטומטי; טיפול ידני / dispute.  
6. No Escrow: אין אירוע release לספק על מקדמת קופון.

ראיות לתור: webhook events, timeline voucher, scan log, IP truncated, audit, membership של הסורק.

---

## 5. הקפאת קופון (coupon freeze)

| מצב | משמעות | מי |
|---|---|---|
| `frozen` / `blocked_redeem` | לא ניתן לסרוק; עדיין לא refund | admin / dispute job / chargeback handler |
| `refunded` / `cancelled` | סופי; מייל refund | admin path / legal engine |
| `expired` | פג; אין מימוש | cron |
| `void` | בטל תפעולית (הונאה חמורה) | admin + audit |

כללים:

- אסור UPDATE ידני ב-SQL בלי audit.  
- UI אדמין: "חסום מימוש" / "הקפא" + סיבה חובה.  
- אחרי freeze: redeem מחזיר תוצאת חסימה; QR לא עובר.  
- הסרת freeze רק אדמין, עם נימוק.  
- מסלול refund מ-frozen לפי `ARCHITECTURE-REFUNDS-DISPUTES.md`.

---

## 6. Acceptance

- [ ] שני redeem מקבילים → הצלחה אחת  
- [ ] Velocity מתועד ו-fail-closed על כסף  
- [ ] Chargeback → freeze ל-issued  
- [ ] הקפאת קופון עם audit + הודעה ללקוח  
- [ ] No Escrow בטיפול chargeback/freeze  
- [ ] צילום מסך: אין הבטחת DRM; חד-פעמיות עובדת  

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-08-03 | מימוש כפול, QR, chargebacks, velocity, חסימת קופון |
| 2026-08-12 | batch #12/50: double redeem, screenshots, velocity, chargebacks, freeze; יישור ל-`redeemed` + No Escrow |
