# ארכיטקטורה: אמון ובטיחות (Trust & Safety)

Rate limits, אנטרופיה של קודי שובר, abuse בסורק, audit אדמין, וצ'קליסט RLS.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.  
מודל כסף: **No Escrow**

מסמכים קשורים:

```
docs/DOCS-TEMPLATE-BINDING.md
docs/ARCHITECTURE-SECURITY.md
docs/ARCHITECTURE-SECURITY-RLS.md
docs/ARCHITECTURE-FRAUD-PREVENTION.md
docs/ARCHITECTURE-COUPON-REDEMPTION.md
docs/INCIDENT-RESPONSE-RUNBOOK.md
docs/CONTRADICTIONS.md
```

**המלצה אחת:** מסלולי כסף ו-redeem: rate limit fail-closed. קודי שובר + HMAC שאינם ניתנים לניחוש. `wrong_supplier` → `not_found` החוצה. כל פעולת אדמין רגישה ב-`audit_log`. RLS + FORCE על כסף.

---

## 0. החלטה (T1 עד T8)

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

## 1. חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| fail-open על rate limit ב-checkout | מאפשר burst fraud; T2 |
| `Math.random` לקוד שובר | ניתן לניחוש; T3 |
| החזרת `wrong_supplier` ללקוח | enumeration + harassment |
| audit mutable (UPDATE/DELETE) | אין ראיות משפטיות; T7 |
| RL רק ב-edge בלי DB fallback | bypass דרך API ישיר; שכבה כפולה |

---

## 2. סכמת DB

**אין DDL חדש במסמך זה.**

| טבלה | שימוש Trust & Safety |
|---|---|
| `audit_log` | append-only; פעולות admin |
| `voucher_redemptions` / scan events | כל ניסיון redeem + outcome |
| `rate_limits` / `user_rate_limits` | counters RL (אם קיים) |
| `security_events` | velocity / abuse flags |
| `vouchers.code` / `coupon_codes` | UNIQUE + entropy |
| `supplier_members` | membership active לסריקה |

Migration מקור: policies ו-RPC redeem במיגרציות vouchers (ראה `ARCHITECTURE-SECURITY-RLS.md`).

---

## 3. Rate limiting ואנטרופיה

| Endpoint / פעולה | מפתח | מגבלה (יעד) | כשל RL |
|---|---|---|---|
| checkout / create LP | user + IP | 10 / דקה | fail-closed |
| redeem / scan RPC | `auth.uid()` | 30 / דקה | `rate_limited` |
| redeem לפי supplier | supplier | 120 / דקה | `rate_limited` |
| ניחוש קוד ידני | IP + user | 5 / דקה | fail-closed |
| Admin refund | admin user | 30 / דקה | fail-closed |
| חיפוש / קטלוג | IP | רך | fail-open מותר |

QR: HMAC עם `VOUCHER_QR_SECRET` (32+ bytes); סיבוב עם `VOUCHER_QR_SECRET_PREVIOUS`.

### Abuse בסורק

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

---

## 4. מקרי קצה

| # | מצב | התנהגות |
|---|---|---|
| TS-E1 | Redis/Upstash down ב-checkout | fail-closed; דחיית תשלום |
| TS-E2 | replay אותו QR תוך שניות | `already_redeemed`; idempotency |
| TS-E3 | RL timeout באמצע redeem | transaction rollback; לא partial |
| TS-E4 | admin מוחק audit (ניסיון) | policy חוסם; alert |
| TS-E5 | brute force 100 קודים/דקה | IP block + security_event |
| TS-E6 | signature עם `PREVIOUS` secret | מקבל בחלון רוטציה |
| TS-E7 | scanner מ-deactivated supplier | `unauthorized` מיידי |

---

## 5. Admin audit (חובה)

| פעולה | meta מינימום |
|---|---|
| אישור/דחיית ספק | application_id, reason |
| Publish / `platform_percent` | product_id, old/new |
| Refund / dispute | order_id, amounts_agorot |
| Freeze/void קופון | voucher_id, reason |
| Payout approve | statement_id, totals |

אסור בלוג/Sentry: PAN, CVV, סיסמאות, service role, IBAN מלא.

---

## 6. פתוחות

| # | פער | תאריך |
|---|---|---|
| O1 | סף RL מדויק per-env (staging vs prod) | 2026-08-12 |
| O2 | Upstash vs in-memory RL ב-dev | 2026-08-12 |
| O3 | tier escalation אוטומטי אחרי N `wrong_supplier` | 2026-08-12 |

---

## 7. Acceptance

- [ ] RL על מסלולי כסף; fail-closed
- [ ] אנטרופיה + HMAC; anti-guessing
- [ ] `wrong_supplier` → `not_found`
- [ ] audit על פעולות §5
- [ ] RLS review ירוק

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-08-12 | batch-2: DOCS-TEMPLATE-BINDING (חלופות, DB, מקרי קצה, פתוחות) |
