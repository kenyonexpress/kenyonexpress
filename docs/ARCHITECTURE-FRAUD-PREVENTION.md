# ARCHITECTURE: Fraud Prevention

מניעת הונאה ב-KenyonExpress: מימוש כפול של קופון, chargebacks, וצילומי מסך / שיתוף QR.

Status: **BINDING** · Updated: 2026-08-03 (rev C)  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-lifecycle`  
אין שינוי קוד. אין נגיעה ב-worktree הראשי (`kenyonexpress`).

עמודי תווך: **מימוש כפול**, **chargebacks**, **צילומי מסך / שיתוף QR**.

Companions:

```
docs/ARCHITECTURE-COUPON-REDEMPTION.md
docs/ARCHITECTURE-ADMIN-DASHBOARD.md
docs/ARCHITECTURE-NOTIFICATIONS.md
docs/RUNBOOK-PRODUCTION.md
docs/ARCHITECTURE-LEGAL-COMPLIANCE.md
```

עקרון: כסף ומניעת כפילות נאכפים ב-**DB אטומי**, לא ב-UI. Rate limits על נתיבי כסף: **fail-closed**.

---

## 0. הכרעות מחייבות

| # | הכרעה |
|---|---|
| F1 | קופון `issued` → `redeemed` פעם אחת בלבד. Replay → `already_used` בלי side effects כספיים. |
| F2 | אימות QR: חתימה (HMAC/Ed25519) + ספק תואם + תוקף + סטטוס `issued`. |
| F3 | צילום מסך / שיתוף QR **לא ניתנים למניעה מוחלטת**; ההגנה היא חד-פעמיות ב-DB + התראות burst. |
| F4 | Chargeback: לא מוחק היסטוריה; ledger + audit + תור `manual_review`. |
| F5 | אין auto-refund מלא בלי מסלול אדמין. Cardcom dashboard אינו מקור אמת יחיד מול DB. |
| F6 | Rate limit על checkout / redeem / login: fail-closed כשמאגר ה-limit נפל. |
| F7 | ספק חדש לא `active` בלי אישור אדמין. |

---

## 1. מימוש כפול (double redemption)

### 1.1 וקטור

שני סורקים / שני מכשירים / replay של אותו payload אחרי הצלחה / race בין שני `POST redeem`.

### 1.2 זרימה אטומית (מחייבת)

```text
POST /api/supplier/vouchers/redeem  (supplier JWT)
  → verify auth + membership active
  → verify signature / code
  → BEGIN
      SELECT voucher FOR UPDATE
      IF status <> 'issued' THEN
           return already_used | expired | invalid
           (no ledger, no notify money)
      UPDATE vouchers
         SET status='redeemed', redeemed_at=now(), …
       WHERE id=:id AND status='issued'
      IF rowcount = 0 THEN already_used
      INSERT redemption audit (member, ip truncated, result)
      -- No Escrow: אין שחרור held לספק מקופון; יתרה נגבית בקופה מחוץ לפלטפורמה
  → COMMIT
  → enqueue coupon_redeemed (outbox; לא חוסם)
```

| הגנה | פרט |
|---|---|
| Row lock | `FOR UPDATE` על שורת ה-voucher |
| Conditional update | `WHERE status='issued'`; rowcount=0 → כבר מומש |
| Unique success | אינדקס/אילוץ שמונע שתי שורות הצלחה לאותו voucher |
| Idempotency | קריאות חוזרות אחרי הצלחה מחזירות `already_used` יציב |
| Wrong supplier | `wrong_supplier` בלי לחשוף יתר פרטי לקוח |
| Rate limit | per `supplier_id` + member; fail-closed |

### 1.3 סיגנלים לתור fraud

| סיגנל | פעולה |
|---|---|
| Burst `already_used` על אותו voucher / ספק | התראת ops + case |
| הרבה `invalid_hmac` מ-IP אחד | lockout קצר + חקירה |
| אותו code מנסה על ספקים רבים | flag קמפיין שיתוף |
| Constraint violation על unique redeem | SEV נמוך ללוגים; אסור "לתקן" ב-SQL ידני בלי audit |

### 1.4 מה אסור

- בדיקת סטטוס ב-UI בלבד ואז UPDATE בלי תנאי  
- Redeem מהאפ של הלקוח  
- סימון `redeemed` מ-SQL ידני בלי audit ו-ledger תואם  
- הודעת שגיאה שמדליפה אם הקוד קיים אצל ספק אחר  

---

## 2. Chargebacks

### 2.1 וקטור

לקוח מבצע chargeback אצל חברת האשראי אחרי הנפקת קופון / אחרי מימוש / אחרי משלוח פיזי.

### 2.2 עקרונות

1. **היסטוריה לא נמחקת.** הזמנה, תשלום, voucher, ledger נשארים עם סטטוס dispute.  
2. מקור אמת פנימי: `payments` + `orders` + ledger. Cardcom הוא ראיה משלימה.  
3. אין refund אוטומטי מלא ברגע הודעת chargeback; נפתח case.  
4. אם הקופון עדיין `issued`: **freeze** (לא ניתן למימוש) עד החלטה.  
5. אם כבר `redeemed`: אין "ביטול מימוש" אוטומטי; טיפול ידני + אפשרות חוב לספק לפי מדיניות.

### 2.3 זרימה

```text
Cardcom / bank notice / admin flag
  → create dispute / manual_review case
  → if voucher.status = issued → freeze (status path או flag blocked_redeem)
  → notify ops (Ntfy/Sentry)
  → gather evidence: paid_at, voucher timeline, redeem log, IP, device
  → outcome:
       lose  → write-off / ledger adjust + audit; voucher void if needed
       win   → unfreeze or close case
       split → admin path documented
```

### 2.4 ראיות לשמירה

| ראיה | מקור |
|---|---|
| תשלום | `payments.provider_*`, webhook events |
| הנפקה | `vouchers` + outbox `coupon_issued` |
| מימוש | redemption log: member, time, result, IP truncated |
| העדפות / התראות | delivery events (בלי להבטיח שהלקוח קרא) |
| Audit אדמין | refunds, freezes, wallet adjusts |

### 2.5 קשר למודל קופון (No Escrow)

Chargeback על מקדמת קופון: החשיפה היא על הפלטפורמה (שמרה את תשלום האתר). אין "held לספק" לביטול.  
לפני מימוש: freeze ל-voucher. אחרי מימוש: אין מחיקת redeem; טיפול ידני / write-off + audit.

---

## 3. צילומי מסך ושיתוף QR

### 3.1 המציאות

אי אפשר למנוע מלקוח לצלם QR, לשלוח בוואטסאפ, או להציג מסך משותף. ההגנה היא **חד-פעמיות כלכלית**, לא DRM ויזואלי.

### 3.2 הגנות מעשיות

| שכבה | מנגנון |
|---|---|
| חד-פעמיות | §1 אטומי; אחרי redeem הראשון כל הסריקות הבאות נכשלות |
| תוקף | `expires_at`; cron פקיעה |
| חתימה | QR לא ניתן לזיוף בלי `VOUCHER_QR_SECRET` |
| ספק תואם | לא ניתן לממש אצל עסק אחר |
| UX | מייל/אפ מזהירים לא לשתף; אחרי redeem נשלח `coupon_redeemed` ללקוח ("אם לא אתם, פנו מיד") |
| Wallet pass | עדכון void אחרי redeem מפחית שימוש חוזר ב-pass ישן |
| Offline display | תצוגה אופליין אצל הלקוח; המימוש תמיד אונליין אצל הספק |

### 3.3 מה לא בונים (ROI נמוך / שביר)

- Watermark דינמי שמתחלף כל שנייה כ"הגנה יחידה"  
- זיהוי screenshot ב-iOS/Android כחובה ל-MVP  
- QR שמתחדש כל N שניות בלי צורך עסקי (מורכב לקופה, לא מונע צילום ברגע הנכון)  
- האשמת לקוח אוטומטית בלי ראיה  

### 3.4 כשמתגלה שיתוף מסיבי

1. Spike ב-`already_used` / ניסיונות cross-supplier → case  
2. אפשרות אדמין: void יתרת `issued` לאותו user/order אם יש חשד גניבת חשבון  
3. אם redeem הצליח אצל הספק הנכון: העסקה תקינה תפעולית; הסכסוך הוא בין שולח/מקבל הצילום, לא "מימוש כפול"  
4. תמיכה: תסריט עברית קבוע ("הקופון חד-פעמי; מימוש ראשון קובע")

### 3.5 מסכים ומדיניות מוצר

- דף קופון / אפ: משפט קצר נגד שיתוף  
- אחרי redeem: המייל/push הוא ערוץ התרעה ללקוח הבעלים  
- אין להבטיח "QR שלא ניתן לצילום"

---

## 4. Rate limiting (תמצית)

| פעולה | מפתח | כיוון גבול | על כשל מאגר |
|---|---|---|---|
| `begin_checkout` | user_id + IP | נמוך לדקה | fail-closed |
| `redeem` | supplier_id + member | הדוק | fail-closed |
| redeem failures | voucher / IP | lockout אחרי N חתימות רעות | |
| login / OTP | IP + email | Supabase + שכבה | |
| admin refund / wallet | admin_id | נמוך + recent auth | fail-closed |

תשובה ללקוח/ספק: הודעה כללית בעברית, בלי לפרט את מנגנון ה-limit.

---

## 5. Manual review queue

```text
manual_review_cases:
  id, kind, user_id?, order_id?, voucher_id?, supplier_id?,
  score, status (open|approved|rejected|escalated),
  notes, assignee_admin_id, created_at, resolved_at
```

טריגרים: velocity כרטיסים, chargeback, spike already_used, ספק חדש + מחזור גבוה, דיווח "לא אני מימשתי".

סגירה עם audit. אין חסימת redeem גלובלית בלי SEV; להעדיף freeze ממוקד.

---

## 6. Logging מינימלי

- Redemption: result, supplier_id, member_id, IP truncated  
- Payments: outcome בלי PAN/CVV  
- Admin money actions: `audit_log`  
- קודי קופון בלוגים: לכל היותר 4 תווים אחרונים  

---

## 7. Acceptance

- [ ] Redeem אטומי: שני בקשות מקבילות → הצלחה אחת + `already_used`
- [ ] Chargeback יוצר case; לא מוחק היסטוריה; freeze ל-`issued`
- [ ] מדיניות צילום מסך מתועדת: חד-פעמיות + התראת בעלים, בלי הבטחת DRM
- [ ] Rate limit fail-closed על checkout/redeem
- [ ] תור `manual_review` מוגדר עם טריגרים

---

## 8. Related

```
docs/ARCHITECTURE-COUPON-REDEMPTION.md
docs/ARCHITECTURE-ADMIN-DASHBOARD.md
docs/ARCHITECTURE-NOTIFICATIONS.md
docs/RUNBOOK-PRODUCTION.md
```

---

## 9. Revision

| Date | Change |
|---|---|
| 2026-08-02 | Duplicate QR, RL, chargeback (טיוטות) |
| 2026-08-03 | Binding ב-`ke-arch`: מימוש כפול אטומי, chargebacks, צילומי מסך QR; docs only |
| 2026-08-03 | rev C: הסרת Escrow release מ-redeem; No Escrow ב-chargeback |
