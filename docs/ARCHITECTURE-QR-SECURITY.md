# ארכיטקטורה: אבטחת QR לקופון

Payload חתום, תוקף משובץ, replay prevention, offline ספק, רוטציה בדליפה.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מודל כסף: **No Escrow**. QR אינו מייצג held לספק.

מסמכים קשורים:

```
docs/ARCHITECTURE-FRAUD-PREVENTION.md
docs/ARCHITECTURE-COUPON-REDEMPTION.md
docs/ARCHITECTURE-COUPON-LIFECYCLE.md
docs/RUNBOOK-INCIDENTS.md
```

---

## 1. החלטה

| # | הכרעה |
|---|---|
| Q1 | QR = **payload חתום** (HMAC או Ed25519), לא URL עם service role. |
| Q2 | מימוש אטומי ב-DB; חתימה תקינה ≠ מספיק בלי `status=issued`. |
| Q3 | Replay אחרי redeem → `already_used`. |
| Q4 | `VOUCHER_QR_SECRET` רק בשרת; לא ב-client bundle. |
| Q5 | Offline ספק: תור אופציונלי; commit רק עם רשת. לקוח offline = תצוגה. |
| Q6 | חשד לדליפה → רוטציה + re-sign / grace v1. |
| Q7 | אין PII / מחיר / secret ב-payload QR. |
| Q8 | `/coupon/[id]`: בעלים בלבד; אין QR לאורח. |

---

## 2. חלופות שנדחו

| חלופה | נימוק דחייה |
|---|---|
| QR = URL עם token ב-query | leak ב-referrer/logs; Q1. |
| redeem offline "סופי" לספק | כסף online; Q5. |
| קוד אנושי בלבד בלי חתימה | forge + enumeration. |
| secret ב-client ל-verify | Q4. |
| QR עם face_value / email | Q7 PII/price. |
| ביטול כל QR בלי grace | UX; Q6 grace window. |

---

## 3. סכמת DB

**אין DDL חדש.** שימוש ב:

| טבלה/עמודה | שימוש |
|---|---|
| `vouchers.id` | `vid` ב-payload |
| `vouchers.supplier_id` | `sid` |
| `vouchers.expires_at` | DB מנצח על `exp` ב-QR |
| `vouchers.status` | issued → redeemed |
| `voucher_scan_log` / `coupon_scan_events` | audit + rate limit |
| `qr_payload`, `qr_key_id` | אחסון issued |

פורמט:

```text
KEV1.<base64url(payload_json)>.<base64url(signature)>
```

```json
{"v":1,"vid":"uuid","sid":"uuid","exp":1735689599,"iat":1700000000}
```

---

## 4. Replay ו-offline

| שכבה | מנגנון |
|---|---|
| DB | `UPDATE … WHERE status='issued'` |
| תשובה | `already_used` |
| Idempotency | הצלחה כפולה לא כפל ledger |
| Rate limit | invalid_hmac burst |

Offline ספק: תור מוצפן; flush לפי סדר; TTL 24-48ש; אין "הצלחה סופית" בלי ACK.

---

## 5. מקרי קצה

| # | מצב | התנהגות |
|---|---|---|
| E1 | screenshot sharing | DB חד-פעמיות |
| E2 | exp QR < DB extends | DB מנצח; re-issue |
| E3 | wrong supplier scan | wrong_supplier; anti-enumeration |
| E4 | invalid_hmac burst | rate limit + alert |
| E5 | replay אחרי success | already_used |
| E6 | offline queue stale | drop + re-scan |
| E7 | secret ב-git | rotation Q6 |
| E8 | forged `/redeem/token` | generic reject |

---

## 6. פתוחות

| # | פער | תאריך |
|---|---|---|
| O1 | Ed25519 vs HMAC-SHA256 | HMAC v1; Ed25519 v2 אם נדרש |
| O2 | online-only suppliers day-0 | מדיניות per supplier |
| O3 | re-sign כל issued ברוטציה | grace + `/account/coupons` refresh |

---

## 7. Acceptance

- [ ] Payload חתום exp+vid+sid  
- [ ] Replay → already_used  
- [ ] Secret לא ב-client  
- [ ] Offline supplier מתועד  
- [ ] נוהל רוטציה כתוב  
- [ ] חלופות + DB + קצה + פתוחות  

---

## 8. Revision

| תאריך | שינוי |
|---|---|
| 2026-08-03 | מסמך ראשוני QR security |
| 2026-08-12 | batch-2: BINDING עברית; תבנית חובה |
