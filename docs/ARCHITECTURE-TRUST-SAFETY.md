# ארכיטקטורה: אמון ובטיחות (Trust & Safety)

Rate limits, אנטרופיה של קודי שובר, abuse בסורק, audit אדמין, וצ'קליסט RLS.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: `arch/docs-batch-2` · batch #31/50  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מסמכים קשורים:

```
docs/ARCHITECTURE-SECURITY.md
docs/ARCHITECTURE-SECURITY-RLS.md
docs/ARCHITECTURE-FRAUD-PREVENTION.md
docs/ARCHITECTURE-COUPON-REDEMPTION.md
docs/INCIDENT-RESPONSE-RUNBOOK.md
docs/CONTRADICTIONS.md
```

---

## 0. המלצה אחת

**מסלולי כסף ו-redeem: rate limit fail-closed. קודי שובר + HMAC שאינם ניתנים לניחוש. `wrong_supplier` → `not_found` החוצה. כל פעולת אדמין רגישה ב-`audit_log`. RLS + FORCE על כסף.**

---

## 1. הכרעות

| # | הכרעה |
|---|---|
| T1 | Rate limit לפי endpoint (+ user/IP/supplier). |
| T2 | כסף/redeem: כשל תשתית RL = דחייה (fail-closed). |
| T3 | קוד שובר: CSPRNG; אנטרופיה גבוהה; אין רצף צפוי. |
| T4 | QR: חתימה keyed (`VOUCHER_QR_SECRET`) לפני side effects. |
| T5 | סורק: membership + `supplier_id` מה-DB בלבד. |
| T6 | `wrong_supplier` פנימי → `not_found` חיצוני. |
| T7 | Audit append-only לפעולות אדמין על כסף/קופון/ספק. |
| T8 | סקירת RLS לפני soft-open ואחרי כל טבלה חדשה. |

---

## 2. Rate limiting לפי endpoint

| Endpoint / פעולה | מפתח | מגבלה (יעד) | כשל RL |
|---|---|---|---|
| checkout / create LP | user + IP | 10 / דקה | fail-closed |
| Cardcom webhook | IP + secret | גבוה; סוד קודם | reject על סוד |
| redeem / scan RPC | `auth.uid()` | 30 / דקה | `rate_limited` |
| redeem לפי supplier | supplier | 120 / דקה | `rate_limited` |
| ניחוש קוד ידני | IP + user | 5 / דקה | fail-closed |
| Login / OTP | IP + מזהה | לפי Auth | fail-closed |
| Admin refund / resolve | admin user | 30 / דקה | fail-closed |
| חיפוש / קטלוג | IP | רך | fail-open מותר |

כל ניסיון redeem (כולל כשל) נרשם ב-scan events עם outcome.

---

## 3. אנטרופיה ומניעת ניחוש

| כלל | פירוט |
|---|---|
| יצירה | CSPRNG בשרת; לא `Math.random` בדפדפן |
| מרחב | ≥ 128 סיביות אפקטיביות (או קוד ארוך + UNIQUE + retry) |
| אין רצף | אסור KE-000001 / timestamp / user_id גלוי בקוד |
| Anti-guessing | RL קשיח; אחרי N כשלים: הארכת חלון |
| תשובות | אימות כושל / לא נמצא → אותה צורה (`not_found`) |
| לוגים | לא קוד מלא ב-Sentry; קיצור / hash |

QR: HMAC עם `VOUCHER_QR_SECRET` (32+ bytes); סיבוב עם `VOUCHER_QR_SECRET_PREVIOUS`.  
SEC-QR ב-SECURITY חייב להיסגר לפני פרוד מלא.

---

## 4. Abuse בסורק

```text
POST redeem
  → auth + membership active
  → rate limit (user / supplier)
  → verify signature
  → load voucher
  → supplier match?
        כן → checks → atomic redeem
        לא → log wrong_supplier → client not_found
```

| Outcome פנימי | חיצוני |
|---|---|
| `wrong_supplier` | `not_found` |
| `invalid_signature` | `not_found` |
| `rate_limited` | `rate_limited` |
| `already_used` | `already_used` |
| `unauthorized` | `unauthorized` |

הגנות: אין מימוש אופליין ל-DB; idempotency על replay; deactivate membership חוסם מיד; UI עברית RTL.

---

## 5. Admin audit

טבלה: `audit_log` (append-only). חובה לפחות:

| פעולה | meta מינימום |
|---|---|
| אישור/דחיית ספק | application_id, reason |
| Publish מוצר / שינוי `platform_percent` | product_id, old/new |
| Refund / dispute | order_id, amounts_agorot |
| Freeze/void קופון | voucher_id, reason |
| Membership / kill switch checkout | שדות רלוונטיים בלי סודות |
| Payout approve | statement_id, totals |

אסור בלוג/Sentry: PAN, CVV, סיסמאות, service role, IBAN מלא.

---

## 6. צ'קליסט RLS (תמצית)

- [ ] `NOT rowsecurity` = 0 ב-`public`  
- [ ] FORCE על כסף  
- [ ] אין GRANT כתיבת כסף ל-anon/authenticated  
- [ ] A לא רואה הזמנות של B; scanner X לא redeem על voucher של Y  
- [ ] טבלה חדשה → עדכון SECURITY-RLS  

---

## 7. Acceptance

- [ ] RL לפי §2 על מסלולי כסף; fail-closed  
- [ ] אנטרופיה + HMAC; anti-guessing  
- [ ] `wrong_supplier` → `not_found`; `rate_limited` גלוי  
- [ ] audit על פעולות §5  
- [ ] RLS review ירוק  

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-08-12 | batch #31/50: ריענון BINDING (RL, entropy, abuse) |
