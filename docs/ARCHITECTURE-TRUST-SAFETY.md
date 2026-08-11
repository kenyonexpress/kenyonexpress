# ארכיטקטורה: אמון ובטיחות (Trust & Safety)

Rate limiting לפי endpoint, אנטרופיה של קודי שובר ומניעת ניחוש, abuse בסורק (`wrong_supplier`, `rate_limited`), כיסוי audit לאדמין, וצ'קליסט סקירת RLS.

Status: **BINDING** · עודכן: 2026-08-11  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-lifecycle`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מסמכים קשורים:

```
docs/ARCHITECTURE-SECURITY.md
docs/ARCHITECTURE-SECURITY-RLS.md
docs/SECURITY-AUDIT-CHECKLIST.md
docs/ARCHITECTURE-FRAUD-PREVENTION.md
docs/ARCHITECTURE-COUPON-REDEMPTION.md
docs/ARCHITECTURE-ADMIN-DASHBOARD.md
docs/INCIDENT-RESPONSE-RUNBOOK.md
docs/CONTRADICTIONS.md
```

---

## 0. המלצה אחת (מחייבת)

**מסלולי כסף ו-redeem: rate limit fail-closed. קודי שובר + HMAC שלא ניתנים לניחוש. `wrong_supplier` נחשף החוצה כ-`not_found`. כל פעולת אדמין על כסף/קופון/ספק ב-`audit_log`. RLS + FORCE על טבלאות כסף.**

---

## 1. הכרעות

| # | הכרעה |
|---|---|
| T1 | Rate limit לפי endpoint (+ מפתח user/IP/supplier לפי הטבלה). |
| T2 | כסף/redeem: כשל תשתית RL = דחייה (fail-closed), לא "עבור בלי מגבלה". |
| T3 | קוד שובר: אנטרופיה גבוהה; אין רצף צפוי; אין קודים קצרים. |
| T4 | QR: חתימה keyed (`VOUCHER_QR_SECRET`); אימות חתימה לפני side effects. |
| T5 | סורק: membership + `supplier_id` מה-DB, לא מה-payload. |
| T6 | `wrong_supplier` פנימי → תשובה חיצונית `not_found` (בלי לדלוף קיום שובר). |
| T7 | Audit append-only לפעולות אדמין רגישות. |
| T8 | סקירת RLS לפני soft-open ואחרי כל טבלה חדשה. |

---

## 2. Rate limiting לפי endpoint

יעד מוצר (מספרים לכוונון; כסף נשאר מחמיר):

| Endpoint / פעולה | מפתח | מגבלה (יעד) | כשל RL |
|---|---|---|---|
| `POST` checkout / create LP | user + IP | 10 / דקה | fail-closed |
| Cardcom webhook / IndicatorUrl | IP + secret | גבוה; אימות secret קודם | reject |
| `POST` redeem / scan RPC | `auth.uid()` (סורק) | 30 / דקה | `rate_limited` |
| Redeem לפי `supplier_id` | supplier | 120 / דקה | `rate_limited` |
| ניסיונות קוד ידני (אם קיים) | IP + user | 5 / דקה | fail-closed |
| Login / OTP | IP + מזהה | לפי Auth + velocity | fail-closed |
| Admin refund / dispute resolve | admin user | 30 / דקה | fail-closed |
| חיפוש / קטלוג ציבורי | IP | רך יותר | fail-open מותר |
| Account wallet read | user | רך | fail-open מותר |

מימוש: Upstash / `rate_limits` / `user_rate_limits` / RPC (`check_user_rate_limit`) לפי הקוד החי; החוזה הוא הטבלה למעלה.

כל ניסיון redeem (כולל כשל) נרשם ב-`coupon_scan_events` (או מקביל) עם outcome.

---

## 3. אנטרופיה של קוד שובר ומניעת ניחוש

| כלל | פירוט |
|---|---|
| יצירה | CSPRNG בשרת בלבד; לא `Math.random` בדפדפן |
| אורך / מרחב | ≥ 128 סיביות אנטרופיה אפקטיבית (או קוד ≥22 תווי alphabet בטוח + בדיקת התנגשויות) |
| Alphabet | בלי תווים דו-משמעיים אם מוקלד ידנית; QR מעדיף payload חתום |
| ייחודיות | UNIQUE ב-DB; retry על התנגשות נדירה |
| אין רצף | אסור `KE-000001`, timestamp גלוי, או user_id גלוי בקוד |
| Anti-guessing | rate limit קשיח על ניחוש; אחרי N כשלים: הארכת חלון / block זמני |
| תשובות | כשל אימות/לא נמצא → אותה צורה חיצונית (`not_found`) כדי לא לדלוף |
| לוגים | לא לרשום קוד מלא ב-Sentry; קיצור / hash |

QR payload: חתימת HMAC (או Ed25519 לפי SECURITY) עם `VOUCHER_QR_SECRET` (32+ bytes). סיבוב מפתח: `VOUCHER_QR_SECRET_PREVIOUS` לחלון קצר.

ממצא ידוע: SEC-QR ב-`ARCHITECTURE-SECURITY.md` חייב להיסגר לפני פרוד מלא.

---

## 4. Abuse בסורק

```text
POST redeem
  → auth + membership active
  → rate limit (user / supplier)
  → verify signature
  → load voucher
  → supplier_id match?
        כן → issued/expiry checks → atomic redeem
        לא → log outcome=wrong_supplier → client sees not_found
```

| Outcome פנימי | ללקוח/סורק | משמעות |
|---|---|---|
| `wrong_supplier` | `not_found` | סריקה של עסק אחר / קוד שדלף |
| `rate_limited` | `rate_limited` + הודעה עברית | הצפה / סקריפט |
| `invalid_signature` | `not_found` | זיוף / קוד פגום |
| `already_used` | `already_used` | replay אחרי redeem |
| `unauthorized` | `unauthorized` | בלי membership |

הגנות נוספות:

- אין "מימוש אופליין" שמעדכן DB  
- Idempotency key: replay מחזיר תוצאה קודמת בלי side effect  
- Velocity: חשבונות scanner חדשים / נפח חריג → דגל ל-`manual_review` (FRAUD)  
- Deactivate membership חוסם מיד  

הודעות UI בעברית RTL (למשל: "יותר מדי סריקות, המתינו רגע").

---

## 5. כיסוי Admin audit log

טבלה: `audit_log` (append-only; כתיבה דרך definer/service).

חובה לרשום לפחות:

| פעולה | שדות מינימום ב-meta |
|---|---|
| אישור/דחיית ספק | application_id, reason |
| Publish / unpublish מוצר | product_id, platform_percent |
| שינוי `platform_percent` | old, new, agreed_at |
| Refund approve / submit | order_id, amount_agorot, cardcom ids |
| Dispute resolve | dispute_id, resolution_type, amount |
| Freeze / void קופון | voucher_id, reason |
| שינוי membership ספק | user_id, role, is_active |
| Kill switch checkout | old/new `CHECKOUT_ENABLED` |
| Payout batch approve | statement_id, totals |
| עדכון בנק ספק | supplier_id (בלי IBAN מלא בלוג) |

אסור ב-audit/Sentry: PAN, CVV, סיסמאות, service role, גוף כרטיס.

UI: `/admin/audit-log` קריאה בלבד לאדמין.

---

## 6. צ'קליסט סקירת RLS

לפני soft-open / אחרי מיגרציית טבלה:

### 6.1 גלובלי

- [ ] `SELECT count(*) FROM pg_tables WHERE schemaname='public' AND NOT rowsecurity` = **0**  
- [ ] טבלאות כסף: `FORCE ROW LEVEL SECURITY`  
- [ ] אין GRANT מיותר ל-`anon`/`authenticated` על כתיבת כסף  
- [ ] `service_role` רק בשרת; לא ב-bundle  

### 6.2 לפי משטח

| משטח | בדיקה |
|---|---|
| `orders` / `order_items` / `payments` | לקוח: SELECT עצמי בלבד; כתיבה service |
| `vouchers` | בעלים SELECT; redeem רק RPC; אין UPDATE ללקוח |
| `wallet_*` | own SELECT; transfer רק `fn_wallet_transfer` |
| `suppliers` / members | membership ממלאת; אין דליפת אחוזי פלטפורמה לספק ב-API ציבורי לא מורשה |
| `audit_log` | אין UPDATE/DELETE ללקוח; admin SELECT |
| `rate_limits` | אין SELECT ללקוח |
| `notification_outbox` | drain = worker/service |

### 6.3 רגרסיה

- [ ] טסט/שאילתה: משתמש A לא רואה הזמנות של B  
- [ ] scanner של ספק X לא redeem על voucher של Y (`not_found`)  
- [ ] anon לא קורא `payments`  
- [ ] אחרי טבלה חדשה: שורה ב-`ARCHITECTURE-SECURITY-RLS.md` או ticket עדכון מטריצה  

פירוט מטריצה: `ARCHITECTURE-SECURITY-RLS.md`. צ'קליסט השקה: `SECURITY-AUDIT-CHECKLIST.md`.

---

## 7. Acceptance

- [ ] טבלת RL לפי endpoint מיושמת במסלולי כסף  
- [ ] fail-closed על checkout/redeem  
- [ ] אנטרופיה + HMAC לשוברים; anti-guessing  
- [ ] `wrong_supplier` → `not_found`; `rate_limited` גלוי  
- [ ] audit על כל פעולות האדמין בסעיף 5  
- [ ] RLS review: ספירת `NOT rowsecurity` = 0  
- [ ] אין Escrow / held בסכמת האבטחה  

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-08-11 | יצירה: RL, entropy, scanner abuse, audit, RLS checklist |
