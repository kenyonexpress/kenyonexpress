# ארכיטקטורה: Go-Live Checklist

צ'קליסט **Go-Live** מחייב לשיגור KenyonExpress (כסף אמיתי + קופונים אמיתיים).

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.  
מודל כסף: **No Escrow**; `platform_percent` פר מוצר; קופון = מלוא `coupon_price_ils` באתר.

Companions: `ARCHITECTURE-ENV-SECRETS.md`, `ARCHITECTURE-BACKUP-DR.md`, `ARCHITECTURE-LAUNCH-CHECKLIST.md`, `ARCHITECTURE-CARDCOM-WEBHOOKS.md`.

Host קנוני:

```
https://kenyonexpress.co.il
```

---

## 1. החלטה

| # | הכרעה |
|---|---|
| GL1 | שיגור מותר רק כשכל **P0** PASS עם ראיה (פקודה, צילום, לוג + timestamp). |
| GL2 | P1 חוסם GA מלא; לא soft-launch מוגבל. P2 לא חוסם soft-launch. |
| GL3 | Kill switches מוכנים: `CHECKOUT_ENABLED=false`; `ESCROW_FLOW_ENABLED` unset/false. |
| GL4 | DNS/SSL/Vercel: apex + www; HTTP→HTTPS; host לא-קנוני מפנה; cert valid. |
| GL5 | Env prod: אין סודות תחת `NEXT_PUBLIC_`; preview ≠ prod Cardcom/Supabase. |
| GL6 | Cardcom production: smoke charge → finalize → voucher → refund מתועד. |
| GL7 | Sentry P0: checkout spike alert; אין PII ב-breadcrumbs. |
| GL8 | Backup P0: Supabase PITR; snapshot לפני cutover; restore runbook. |
| GL9 | Schema: `platform_percent` NOT NULL; RLS על כל public; אין escrow holds חדשים. |
| GL10 | Smoke E2E: guest cart → OAuth → pay → voucher → scan → redeem deny replay. |
| GL11 | 72 שעות ראשונות: reconciliation יומי; אנומליית כסף = kill checkout. |
| GL12 | Soft-launch לפני GA; P0+P1 ל-GA. |

---

## 2. חלופות שנדחו

| חלופה | נימוק דחייה |
|---|---|
| GA ביום cutover בלי soft-launch | GL12; GL11 triage window. |
| P0 "oral OK" בלי ראיה | GL1; audit trail. |
| Escrow enabled לlaunch | GL3/GL9; No Escrow binding. |
| sandbox Cardcom על prod host | GL6; refunds/webhooks mismatch. |
| `db push` לפרוד | migrations MCP בלבד; GL9. |
| HSTS preload יום 1 | SSL7 P2; lock-in. |
| skip backup "Supabase מגבה" | GL8 PITR + offsite. |
| Make/Zapier בייצור | N3; outbox native. |

---

## 3. סכמת DB

**אין DDL חדש במסמך.** שערי prod בודקים:

| אובייקט | בדיקה |
|---|---|
| `products.platform_percent` | NOT NULL על live |
| `products.coupon_price_ils` | תקין לקופונים |
| `orders`, `payments`, `vouchers` | smoke path |
| `order_items.platform_percent` | snapshot |
| `payment_webhook_events` | idempotency |
| `wallet_*` | RLS + `fn_wallet_transfer` |
| `pg_tables` (public) | rowsecurity true |
| `order_escrow_holds` | אין רשומות חדשות |

מיגרציות: applied via approved process only (M1).

---

## 4. מקרי קצה

| # | מצב | התנהגות |
|---|---|---|
| E1 | Webhook כפול | no-op voucher duplicate GL6 CC7 |
| E2 | GetLpResult fail אחרי charge | order לא paid; support playbook |
| E3 | Guest cart lost post-OAuth | A2 fail; merge RPC |
| E4 | QR HMAC invalid | V4 deny scan |
| E5 | voucher בלי payment | kill checkout GL11 |
| E6 | Refund partial on coupon | clawback wallet; supplier 0 |
| E7 | DNS flip wrong apex | rollback DNS; CHECKOUT off |
| E8 | Deploy breaks checkout mid-day | Instant Rollback + kill switch |
| E9 | Resend down | N2 fail; transactional queue |
| E10 | RLS leak cross-user | A4 block; SEV1 |

---

## 5. פתוחות

| # | פער | החלטה זמנית | תאריך |
|---|---|---|---|
| O1 | www vs apex canonical | בחר אחד; DOM4 consistent | 2026-08-12 |
| O2 | HSTS enable date | P2 אחרי שבוע יציב | 2026-08-12 |
| O3 | BAK3 restore drill תאריך | לפני GA | 2026-08-12 |
| O4 | חתימות בעלים בטבלה 11 | required לפני GA | 2026-08-12 |

---

## 6. נספח: דומיין, DNS, SSL (P0)

| # | בדיקה | P | ראיה |
|---|---|---|---|
| DOM1 | A/ALIAS apex → Vercel | P0 | `dig kenyonexpress.co.il A +short` |
| DOM2 | CNAME www | P0 | dig CNAME |
| SSL1–SSL5 | HTTPS valid, no mixed, redirect | P0 | curl -I |
| DOM5–DOM10 | Auth redirect, OAuth, Resend SPF/DKIM, Cardcom URLs | P0 | dashboards |

---

## 7. נספח: Vercel production

VCL1–VCL20: project git, production branch, root dir, domains valid, env separation, cron secret, rollback tested, webhooks not blocked.

Runbook יום שיגור: domains → env → deploy → smoke → 60min green → soft-launch.

---

## 8. נספח: Env vars (Production)

ENV1–ENV15: Supabase, Cardcom, Resend, CRON, QR secret, Sentry, `CHECKOUT_ENABLED`, no `NEXT_PUBLIC` secrets.

---

## 9. נספח: Cardcom, Sentry, Backup

CC1–CC12: prod terminal, webhook, smoke, replay, No Escrow settlement, refund.  
SEN1–SEN7: DSN, alerts, no PII.  
BAK1–BAK7: PITR, restore runbook, snapshot pre-cutover.

---

## 10. נספח: Auth, checkout, vouchers

A1–A6, V1–V5: guest cart, OAuth merge, RLS, price parity PDP/cart/Cardcom, voucher QR, scan once, prepaid supplier 0.

Smoke script (יום שיגור): 8 steps ב-8.1 המקורי (cart → pay → account → scan → email → refund).

---

## 11. נספח: התראות, איכות, אבטחה

N1–N6, Q1–Q5, S1–S8: Resend server-only, no Zapier, tsc/vitest/build/e2e, rate limits, RBAC, legal pages, no PAN in logs.

---

## 12. 72 שעות + Soft-launch / GA

| מתי | פעולה |
|---|---|
| 0–1h | Sentry, Ntfy, logs; no deploy |
| 1–24h | Cardcom vs orders reconciliation |
| יום 2 | DLQ drain |
| יום 3 | go/no-go הרחבת קהל |

Soft: P0 PASS. GA: P0+P1 + KPI.

---

## 13. ראיות וחתימות

לכל P0: פקודה+timestamp / לוג / צילום. בלי ראיה = לא PASS.

---

## 14. Revision

| תאריך | שינוי |
|---|---|
| 2026-07-31 | rev A–E: P0/P1 tables, smoke, 72h |
| 2026-08-12 | BINDING מלא: החלטה, חלופות, DB, קצה, פתוחות; נספח שערים (`arch/docs-batch-2`) |
