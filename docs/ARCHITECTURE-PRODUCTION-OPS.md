# ארכיטקטורה: תפעול פרודקשן

תפעול שוטף של KenyonExpress בפרוד: סביבות, env, cron, אבטחה תפעולית, עלות tier, וקאטאובר DNS היסטורי מ-WordPress.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מסמכים קשורים:

```
docs/ARCHITECTURE-BACKUP-DR.md
docs/ARCHITECTURE-OBSERVABILITY.md
docs/ARCHITECTURE-LAUNCH-CHECKLIST.md
docs/ARCHITECTURE-TESTING-CICD.md
docs/ARCHITECTURE-CARDCOM-WEBHOOKS.md
docs/ARCHITECTURE-SECURITY.md
docs/ARCHITECTURE-SEO-PERFORMANCE.md
docs/CONTRADICTIONS.md
```

מודל כסף: **No Escrow**. אין held/נאמן/J5. אין default ל-`platform_percent`.

---

## 0. החלטה (מחייבת)

| # | הכרעה |
|---|---|
| P1 | סטאק חי: Next.js App Router + Supabase + Vercel. WordPress = מיגרציה היסטורית בלבד. |
| P2 | שני פרויקטי Supabase: dev/preview משותף, production נפרד. |
| P3 | Preview **לא** כותב הזמנות כסף אמיתי ל-prod DB. |
| P4 | Supabase Pro + PITR **חובה** לפני תשלום Cardcom ראשון. |
| P5 | Cron routes מוגנים ב-`Authorization: Bearer CRON_SECRET` (constant-time). |
| P6 | קטלוג ISR + `revalidateTag`; cart/checkout/account = `no-store`. |
| P7 | Rate limit: money path fail-closed; אחר fail-open. |
| P8 | Cardcom webhook: persist → verify `?s=` + GetLpResult → finalize; בלי HMAC גוף. |
| P9 | `platform_percent` רק פר מוצר, snapshot ב-`order_items`. |
| P10 | Vercel Pro חובה ל-cron תכוף ולפרוד מסחרי. |

---

## 1. חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| WordPress כסטאק תפעול נוכחי | הוחלף ב-Next+Supabase; WP רק cutover. |
| Supabase branching כחובה ל-MVP | מורכבות; dev/prod נפרדים מספיקים. |
| Free tier Supabase/Vercel לכסף אמיתי | אין PITR/cron אמין; חוסם launch. |
| fail-open על checkout/redeem | סיכון fraud; SECURITY. |
| HMAC על webhook Cardcom | לא קיים אצל הספק; WEBHOOKS. |
| Escrow / default commission | No Escrow; platform_percent פר מוצר. |
| cron ללא CRON_SECRET | endpoint פתוח; חובה bearer. |
| env יחיד לכל הסביבות | דליפת prod ל-preview; scopes נפרדים ב-Vercel. |

---

## 2. סכמת DB (קיים; אין DDL חדש במסמך זה)

| אזור | טבלאות / שדות תפעוליים |
|---|---|
| הזמנות | `orders.status`, `orders.expires_at`, `orders.paid_at` |
| תשלומים | `payments`, `payment_webhook_events` |
| קופונים | `vouchers`, פקיעה יומית |
| התראות | `notification_outbox` (drain cron) |
| SEO | `seo_redirects` (301 מ-WP) |
| כסף | `order_items.platform_percent` snapshot |

מיגרציות prod: MCP, אחת-אחת. אין `db push`.

---

## 3. סביבות

| סביבה | Next | Supabase | דומיין |
|---|---|---|---|
| local | `next dev` | פרויקט dev | localhost |
| preview | Vercel Preview | אותו dev | `*.vercel.app` |
| production | Vercel Production | PROD נפרד | `kenyonexpress.co.il` |

Region מועדף: קרוב ל-IL (`eu-central-1` + Vercel `fra1`).

---

## 4. משתני סביבה (מינימום)

Public:

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
NEXT_PUBLIC_APP_URL
```

Server secrets:

```
SUPABASE_SERVICE_ROLE_KEY
CARDCOM_TERMINAL_NUMBER
CARDCOM_API_NAME
CARDCOM_API_PASSWORD
CARDCOM_WEBHOOK_SECRET
RESEND_API_KEY
CRON_SECRET
SENTRY_DSN
```

כללים: בלי `NEXT_PUBLIC_` = server בלבד; scopes נפרדים ב-Vercel; `.env.example` בלי ערכים אמיתיים.

---

## 5. DNS cutover (היסטורי מ-WordPress)

```text
TTL נמוך → SSL על Vercel → החלפת A/CNAME → ניטור 24ש → TTL חזרה
```

חובה: `seo_redirects`, sitemap, robots, smoke checkout.  
אחרי יציבות: WP כבוי; תפעול = Next+Supabase.

---

## 6. Caching וביצועים

| סוג | מדיניות |
|---|---|
| קטלוג / PDP / קטגוריה | ISR + `revalidateTag` |
| cart / checkout / account / admin | `no-store` |
| תמונות | `next/image` + Storage |
| CWV | `ARCHITECTURE-PERFORMANCE.md` |

---

## 7. הקשחה תפעולית

| נושא | חוזה |
|---|---|
| Headers | HSTS, nosniff, frame denial, CSP + Cardcom + Supabase |
| Rate limit | money fail-closed |
| Secrets | rotation רבעוני או מיד בחשד |
| Backup | Pro + PITR + offsite `pg_dump` |

---

## 8. Cron (מינימום פרוד)

| Job | תדירות | תפקיד |
|---|---|---|
| expire pending orders | ~10 דק' | ביטול pending אחרי expires_at |
| payments reconcile | ~10 דק' | LP תקועים מול Cardcom |
| expire coupons / vouchers | יומי | פקיעה |
| notifications drain | דק'/דקה | outbox |
| rate-limit cleanup | שעתי | ניקוי |
| health / wallet integrity | לפי OBSERVABILITY | התראות |

Vercel Hobby מגביל cron: Pro חובה.

---

## 9. עלות tier

| טריגר | מסקנה |
|---|---|
| אין גיבוי / pause ב-Free | **חוסם** לפני כסף |
| egress + DB גדל | Pro לפני שיגור מלא |
| cron תכוף | Vercel Pro |

---

## 10. מקרי קצה (טבלת תפעול)

| קוד | סימפטום | תגובה |
|---|---|---|
| `preview_prod_db` | preview כותב ל-prod | חסימת env; incident |
| `cron_no_secret` | 401 על cron | תיקון Vercel env |
| `cron_secret_leak` | CRON_SECRET ב-git | rotation + audit routes |
| `migration_direct_prod` | db push על prod | אסור; rollback policy |
| `wp_dns_rollback` | cutover נכשל | DNS חזרה; TTL נמוך |
| `isr_stale_price` | מחיר ישן ב-PDP | revalidateTag product |
| `free_tier_pause` | Supabase paused | Pro לפני launch |
| `cardcom_env_wrong` | terminal staging ב-prod | env scope fix |
| `backup_missing` | אין pg_dump | PITR + offsite חובה |
| `platform_percent_default` | 5% גלובלי בקוד | bug; אין default |

---

## 11. פתוחות

| # | פתוח | הערה |
|---|---|---|
| O1 | region Supabase סופי ל-IL latency | eu-central vs closer |
| O2 | Meilisearch בפרוד: מתי | אופציונלי P1 |
| O3 | multi-region Vercel | לא MVP |
| O4 | automated pg_dump schedule | BACKUP-DR |
| O5 | status page ללקוחות | INCIDENT-RESPONSE O4 |

עודכן: 2026-08-12.

---

## 12. Acceptance

- [ ] סטאק Next+Supabase+Vercel (WP = היסטוריה)
- [ ] שני Supabase + env scopes
- [ ] Pro + PITR לפני כסף
- [ ] Cron reconcile + expire + notifications
- [ ] CSP/headers + rate-limit money fail-closed
- [ ] אין Escrow / אין default platform_percent
- [ ] חלופות שנדחו + סכמת DB + מקרי קצה + פתוחות

---

## 13. Revision

| תאריך | שינוי |
|---|---|
| 2026-07-08 | טיוטת תשתית |
| 2026-08-12 | batch-2 #34: BINDING; Next+Supabase |
| 2026-08-12 | batch-2 pass-2: שכתוב לפי תבנית חובה |
