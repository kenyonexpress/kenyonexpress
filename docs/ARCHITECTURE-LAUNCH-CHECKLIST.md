# ארכיטקטורה: צ'קליסט השקה (Launch gates)

שערי Go-Live מחייבים לפני כסף אמיתי על Next + Supabase + Vercel.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.  
מודל כסף: **No Escrow**. אין held. אין default ל-`platform_percent`.

מסמכים קשורים:

```
docs/ARCHITECTURE-GO-LIVE-CHECKLIST.md
docs/GO-LIVE-CHECKLIST.md
docs/LAUNCH-WEEK-RUNBOOK.md
docs/ARCHITECTURE-PRODUCTION-OPS.md
docs/ARCHITECTURE-CARDCOM-WEBHOOKS.md
docs/ARCHITECTURE-PRICING-RULES.md
```

כלל: **כסף אמיתי רק אחרי שכל שערי P0 מסומנים PASS עם ראיה** (צילום / לוג / timestamp).

---

## 1. החלטה

| # | הכרעה |
|---|---|
| LG1 | ששת שערי P0 חוסמים: Resend, Cardcom prod, Sentry, Vercel domains, Backup PITR, 10 קופוני השקה. |
| LG2 | כל P0 דורש ראיה מתועדת; לא "נראה בסדר". |
| LG3 | `CHECKOUT_ENABLED=true` רק אחרי Cardcom smoke charge + refund. |
| LG4 | 10 קופונים: `platform_percent` **מפורש** פר מוצר; אסור default 5%/10%. |
| LG5 | No Escrow: PDP מציג מחיר אתר + יתרה בעסק; לא held. |
| LG6 | Cardcom webhook: `?s=` + `GetLpResult`; אין HMAC על גוף. |
| LG7 | P1 לא חוסם soft-launch; P2 לא חוסם כסף מוגבל. |
| LG8 | `ESCROW_FLOW_ENABLED` חייב unset/false. |
| LG9 | HSTS preload: P1/P2 בלבד; לא יום 1. |
| LG10 | סדר הפעלה: domains → backup → Cardcom → Resend → Sentry → coupons → checkout on. |

### 1.1 Resend (P0)

דומיין SPF/DKIM; From עברית RTL; smoke `order_paid`; אין שיווק בלי opt-in.

### 1.2 Cardcom (P0)

מסוף production; env prod; webhook HTTPS; smoke paid → voucher `issued` + refund.

### 1.3 Sentry (P0)

DSN prod; alerts checkout/redeem/DLQ/Cardcom; אין PAN/PII.

### 1.4 Vercel (P0)

דומיין קנוני + SSL; `NEXT_PUBLIC_APP_URL`; rollback ידוע; preview ≠ prod secrets.

### 1.5 Backup (P0)

Supabase Pro + PITR; offsite dump; RLS על כל `public`; בלי PITR = אין כסף.

### 1.6 10 coupons (P0)

published, תמונה, מחיר, percent, ספק, קנייה אמיתית אחת.

### 1.7 P1 (שיגור מלא)

Meilisearch, notification drain, analytics consent, 2FA admin, legal cancellations, SEO 301 smoke.

### 1.8 סדר הפעלה

```text
1. Vercel domains + env
2. Backup / PITR
3. Cardcom + smoke
4. Resend + מייל
5. Sentry alerts
6. 10 קופונים
7. CHECKOUT_ENABLED=true
8. קנייה + redeem בשטח
```

---

## 2. חלופות שנדחו

| חלופה | נימוק דחייה |
|---|---|
| soft-launch בלי Cardcom prod | LG3; refunds/onboarding נכשלים. |
| default `platform_percent` | LG4; PRICING-RULES; snapshot שגוי. |
| Escrow "זמני" לlaunch | LG5/LG8; מודל No Escrow מחייב. |
| HMAC webhook body בלבד | LG6; Cardcom contract = `?s=` + GetLpResult. |
| skip PITR "נשדרג אחר כך" | LG5; אין rollback DB. |
| HSTS preload יום 1 | LG9; lock-in לפני יציבות. |
| paid marketing לפני P0 | LAUNCH-MARKETING LM2. |

---

## 3. סכמת DB

**אין DDL חדש.** שערים קוראים:

| טבלה | בדיקה |
|---|---|
| `products` | 10 launch coupons; `platform_percent` NOT NULL; `status` |
| `suppliers` | linked publish-ready |
| `orders`, `payments`, `vouchers` | smoke `order_id`, `paid`, `issued` |
| `order_items` | `platform_percent` snapshot |
| `pg_tables` (public) | `rowsecurity = true` |

אסור: `order_escrow_holds` חדשים; `ESCROW_FLOW_ENABLED=true`.

---

## 4. מקרי קצה

| # | מצב | התנהגות |
|---|---|---|
| E1 | Cardcom charge OK, refund fail (no API_PASSWORD) | block LG3; fix env |
| E2 | Webhook replay | idempotent; voucher אחד |
| E3 | CHECKOUT on לפני smoke | rollback; kill switch |
| E4 | coupon בלי platform_percent | block publish LG4 |
| E5 | Preview env עם prod Cardcom | VCL13 fail; rotate keys |
| E6 | Resend unverified domain | transactional fail; block launch |
| E7 | PITR expired mid-launch | renew Pro לפני flip |
| E8 | 10 coupons אך redeem לא tested | LG10 step 8 חובה |
| E9 | Sentry alert silent | test notification לפני flip |
| E10 | Instant Rollback untested | LG Vercel gate; תרגול |

---

## 5. פתוחות

| # | פער | החלטה זמנית | תאריך |
|---|---|---|---|
| O1 | Meilisearch P0 vs P1 | P1; search degrade OK soft-launch | 2026-08-12 |
| O2 | GA4 vs PostHog only | consent + one primary | 2026-08-12 |
| O3 | statutory fee legal sign-off | P1 blocker full launch | 2026-08-12 |
| O4 | monorepo Root Directory `apps/web` | GO-LIVE VCL3 when M1 lands | 2026-08-12 |

---

## 6. Acceptance (P0)

- [ ] Resend verified  
- [ ] Cardcom prod + smoke charge/refund  
- [ ] Sentry alerts חיים  
- [ ] Vercel domain + HTTPS + APP_URL  
- [ ] PITR + מדיניות גיבוי  
- [ ] 10 קופונים עם percent פר מוצר  
- [ ] No Escrow בנוסח ובתשלום  

---

## 7. Revision

| תאריך | שינוי |
|---|---|
| 2026-08-11 | ששת שערי P0 |
| 2026-08-12 | BINDING מלא: החלטה, חלופות, DB, קצה, פתוחות (`arch/docs-batch-2`) |
