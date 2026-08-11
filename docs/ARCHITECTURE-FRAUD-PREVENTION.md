# ARCHITECTURE: Fraud Prevention

וקטורי הונאה והגנות: כרטיסים גנובים ב-Cardcom, ניסיונות מימוש כפול לקופון, ספקים מזויפים, rate limiting, תור ביקורת ידנית.

Status: **BINDING** · Updated: 2026-08-03  
Scope: **docs only** · branch `arch/docs-queue`  
אין שינוי קוד. אין נגיעה ב-worktree הראשי.

Companions:

```
docs/ARCHITECTURE-REFUNDS-DISPUTES.md
docs/ARCHITECTURE-SUPPLIER-ONBOARDING.md
docs/ARCHITECTURE-RBAC.md
docs/RUNBOOK-INCIDENTS.md
docs/ARCHITECTURE-COUPON-REDEMPTION.md
```

עקרון: כסף ומניעת כפילות נאכפים ב-DB (אטומיות), לא ב-UI. Rate limits על נתיבי כסף: **fail-closed**.

---

## 0. הכרעות

| # | הכרעה |
|---|---|
| F1 | קופון `issued` → `redeemed` פעם אחת; replay → `already_used`. |
| F2 | אימות QR: חתימה + ספק תואם + תוקף + סטטוס. |
| F3 | Rate limit: checkout, login, redeem, search, AI. |
| F4 | Chargeback: לא מוחק היסטוריה; ledger + audit. |
| F5 | אין auto-refund מלא בלי מסלול אדמין; Cardcom dashboard לא מקור אמת יחיד. |
| F6 | ספק חדש לא `active` בלי אימות אדמין. |
| F7 | תור `manual_review` לסיגנלים חזקים לפני payout / אחרי חיוב חשוד. |

---

## 1. Stolen cards on Cardcom

### 1.1 וקטורים

- ניסיונות רבים עם כרטיסים שונים לאותו user/IP
- סכומים עגולים חוזרים / רכישות קופון יקרות מיד אחרי הרשמה
- mismatch בין billing ל-geo חריג

### 1.2 הגנות

| הגנה | יישום |
|---|---|
| Cardcom 3DS / issuer auth | לפי הגדרת מסוף |
| Rate limit `begin_checkout` | per user_id + IP |
| Velocity | N כרטיסים / כשלי תשלום למשתמש → השהיית checkout |
| Webhook verify | סיסמה/חתימה; reject → לא paid |
| Post-pay review | דגל ל-manual_review אם score גבוה |
| Chargeback flow | ARCHITECTURE-REFUNDS-DISPUTES |

אסור: שמירת PAN/CVV; לוגים עם מספר כרטיס מלא.

---

## 2. Coupon double-redemption

```text
POST redeem (supplier JWT)
  → verify signature
  → SELECT voucher FOR UPDATE
  → if status <> issued → already_used | expired | invalid (no money side effects)
  → UPDATE redeemed + member + collected
  → ledger release
  → notify
```

| הגנה | פרט |
|---|---|
| אטומיות | `UPDATE … WHERE status = 'issued'` / rowcount |
| Idempotency | dedupe הצלחה על voucher_id |
| Wrong supplier | `wrong_supplier` בלי הדלפת יתר |
| Burst already_used | התראת ops / Fraud queue |
| Screenshot sharing | לא ניתן למנוע; חד-פעמיות ב-DB |

---

## 3. Fake suppliers

| סיכון | הגנה |
|---|---|
| הרשמה עם מסמכים מזויפים | KYC קל + אישור אדמין (Onboarding) |
| מוצרים מטעים / פישינג | approve לפני publish |
| Redeem לעסק פיקטיבי | רק `supplier_members` פעילים |
| הלבנת payout | hold + dispute window + מזעור payout לפני אימות בנק |
| חשבון נפרץ | Google OAuth; השעיה מהירה `suspended` |

---

## 4. Rate limiting strategy

| פעולה | מפתח | גבול התחלתי | על כשל מאגר |
|---|---|---|---|
| `begin_checkout` | user_id | 10 / דקה | fail-closed |
| Cardcom return/webhook | order_id | idempotent + IP burst | |
| `redeem` | supplier_id + member | הדוק (למשל 30/דקה) | fail-closed |
| redeem failures | voucher/IP | lockout קצר אחרי N חתימות כושלות | |
| login / OTP | IP + email | לפי Supabase + שכבה | |
| search | IP | burst protect | degrade |
| admin refund / wallet | admin_id | נמוך + recent auth | fail-closed |

יישום יעד: Upstash Redis `@upstash/ratelimit` או RPC.  
תשובה ללקוח: הודעה כללית בעברית.

---

## 5. Manual review queue

### 5.1 טריגרים לתור

| סיגנל | פעולה |
|---|---|
| Velocity כרטיסים / כשלי תשלום | hold fulfillment / flag order |
| Chargeback חדש | freeze voucher אם issued; case |
| Spike `already_used` / invalid_hmac | חקירת ספק/קמפיין שיתוף |
| ספק חדש + מחזור גבוה | עיכוב payout |
| Refund חוזר לאותו user | review לפני אישור |
| דיווח לקוח "לא אני מימשתי" | fraud ticket |

### 5.2 שדות case (יעד)

```text
manual_review_cases:
  id, kind, user_id?, order_id?, voucher_id?, supplier_id?,
  score, status (open|approved|rejected|escalated),
  notes, assignee_admin_id, created_at, resolved_at
```

הרשאות: admin+. סגירה עם audit.  
לא לחסום redeem לגיטימי גלובלית בלי SEV; להעדיף חסימה ממוקדת.

---

## 6. Logging (מינימום)

- voucher_scan_log: result, supplier_id, member_id, truncated IP
- payment attempts: outcome בלי PAN
- admin actions על כסף: audit_log

מסכות: קודי קופון בלוגים (4 תווים אחרונים לכל היותר).

---

## 7. Acceptance

- [ ] Redeem אטומי + already_used
- [ ] RL fail-closed על checkout/redeem
- [ ] Onboarding חוסם ספק מזויף לפני active
- [ ] תור manual_review מוגדר
- [ ] Chargeback לא מוחק היסטוריה

---

## 8. Revision

| Date | Change |
|---|---|
| 2026-08-02 | Duplicate QR, RL, chargeback |
| 2026-08-03 | Stolen cards, fake suppliers, manual review queue |
