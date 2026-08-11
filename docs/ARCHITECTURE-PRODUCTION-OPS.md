# ארכיטקטורה: תפעול פרודקשן

תפעול שוטף של KenyonExpress בפרוד: סביבות, env, cron, אבטחה תפעולית, עלות tier, וקאטאובר DNS היסטורי מ-WordPress.

Status: **BINDING** · עודכן: 2026-08-12 · QA: PASS  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2` · batch #34/50  
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

מודל כסף בתפעול: **No Escrow**. אין held/נאמן/J5. אין עמלה גלובלית ואין default ל-`platform_percent`.

---

## 0. עובדות מוצא (סטאק נוכחי)

המערכת החיה היא **Next.js App Router + Supabase (Postgres/Auth/Storage) + Vercel**.  
WordPress / WooCommerce אינם סטאק תפעול נוכחי. הם מקור מיגרציה היסטורי (WXR, SEO redirects, DNS cutover).

| רכיב | מצב מחייב |
|---|---|
| App | Next.js (App Router), React, `src/proxy.ts` (לא `middleware.ts`) |
| Host | Vercel Production + Preview |
| Data | Supabase Postgres + RLS; Auth; Storage לתמונות |
| Payments | Cardcom Low Profile; finalize רק אחרי אימות שרת (`GetLpResult` / `?s=`) |
| Observability | Sentry + לוגים מובנים + ntfy/alerts (ראה OBSERVABILITY) |
| Search UX | Meilisearch (אופציונלי ב-P1); FTS Postgres כ-MVP |
| CI | GitHub Actions (lint/typecheck/test/build/e2e) |

אין להפעיל פרוד על תשתית WordPress, ואין לתעד WP כ"מערכת נוכחית".

---

## 1. סביבות

| סביבה | Next | Supabase | דומיין |
|---|---|---|---|
| local | `next dev` | פרויקט dev | localhost |
| preview | Vercel Preview | אותו פרויקט dev | `*.vercel.app` |
| production | Vercel Production | פרויקט PROD נפרד | `kenyonexpress.co.il` |

כללים:

1. **שני פרויקטי Supabase** (dev/preview משותף, prod נפרד). לא branching כחובה ל-MVP.  
2. Preview **לא** כותב הזמנות כסף אמיתי ל-prod DB.  
3. Region מועדף ל-prod: קרוב לקהל IL (למשל `eu-central-1`) + Vercel `fra1`.  
4. מיגרציות prod רק דרך MCP, אחת-אחת (ראה BACKUP-DR / RUNBOOK).

---

## 2. משתני סביבה (מינימום)

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
SENTRY_DSN (או מקבילים לפי קונפיג)
```

כללים:

1. בלי `NEXT_PUBLIC_` = סוד server בלבד.  
2. scopes נפרדים ב-Vercel: Production / Preview / Development.  
3. ולידציית env בזמן boot/build (כשל מהיר אם חסר).  
4. `.env.example` בלי ערכים אמיתיים.

---

## 3. DNS cutover (היסטורי מ-WordPress)

WordPress היה האתר הישן על הדומיין. אחרי הקאטאובר הדומיין מצביע ל-Vercel/Next.

```text
TTL נמוך → אימות SSL על Vercel → החלפת A/CNAME → ניטור 24ש → TTL חזרה
רולבק: החזרת DNS ל-WP רק אם WP עדיין חי כגיבוי חלון קצר
```

חובה לפני/בזמן cutover:

- מפת `seo_redirects` (301/410) מנתיבי WP ישנים  
- `sitemap` + `robots` על Next  
- smoke checkout על staging מול PROD DB (או staging DB מוסכם)

אחרי יציבות: WP כבוי. התפעול השוטף הוא Next+Supabase בלבד.

---

## 4. Caching וביצועים (תפעול)

| סוג | מדיניות |
|---|---|
| קטלוג / PDP / קטגוריה | ISR + `revalidateTag` אחרי publish |
| cart / checkout / account / admin | `no-store` |
| תמונות | `next/image` + קבצים pre-optimized ב-Storage |
| CWV | לפי `ARCHITECTURE-SEO-PERFORMANCE.md` + PERFORMANCE-BUDGET |

פיצול header מחובר (session/cart) ל-client כדי לא להפוך את כל הקטלוג ל-dynamic.

---

## 5. הקשחה תפעולית

| נושא | חוזה |
|---|---|
| Headers | HSTS, nosniff, frame denial, Referrer-Policy, CSP עם Cardcom + Supabase |
| Rate limit | money path fail-closed; אחר fail-open |
| Cardcom webhook | persist event → verify `?s=` + `GetLpResult` → finalize; בלי HMAC גוף |
| Secrets rotation | רבעוני או מיד בחשד דליפה |
| Backup | Pro + PITR + offsite `pg_dump` (BACKUP-DR) |

אסור: fail-open על checkout / redeem / refund.

---

## 6. Cron (מינימום פרוד)

| Job | תדירות | תפקיד |
|---|---|---|
| expire pending orders | ~10 דק' | ביטול `pending` אחרי `expires_at` |
| payments reconcile | ~10 דק' | השלמת LP תקועים מול Cardcom |
| expire coupons / vouchers | יומי | פקיעה |
| notifications drain | דק'/דקה | outbox |
| rate-limit cleanup | שעתי | ניקוי טבלאות |
| health / wallet integrity | לפי OBSERVABILITY | התראות |

הגנה: `Authorization: Bearer CRON_SECRET` (השוואה constant-time).

Vercel Hobby מגביל cron: פרוד מסחרי דורש Pro (או מקביל שמריץ את אותם routes).

---

## 7. עלות tier (מתי Pro חובה)

| טריגר | מסקנה |
|---|---|
| אין גיבוי / pause ב-Free | **חוסם** לפני כסף אמיתי |
| egress תמונות + DB גדל | Pro לפני שיגור מלא |
| cron תכוף | Vercel Pro |

**Supabase Pro חובה לפני תשלום Cardcom ראשון.**  
אין להסתמך על Free לחנות שגובה כסף.

---

## 8. תפעול כסף (תזכורת)

1. `platform_percent` רק פר מוצר, snapshot ב-`order_items`. אין default 5%/10%.  
2. קופון: No Escrow; מקדמה באתר = הכנסת פלטפורמה; יתרה בעסק מחוץ לפלטפורמה.  
3. פיזי: חיוב מלא + פיצול לפי snapshot; payout T+N נפרד.  
4. דמי ביטול חוקיים (5% או 100₪ + מע״מ) הם statutory, לא commission.  
5. כסף בדוחות = ledger / snapshots, לא PostHog.

---

## 9. Acceptance

- [ ] סטאק מתועד כ-Next+Supabase+Vercel (WP = היסטוריה בלבד)  
- [ ] שני פרויקטי Supabase + env scopes  
- [ ] Pro + PITR לפני כסף אמיתי  
- [ ] Cron reconcile + expire + notifications  
- [ ] CSP/headers + rate-limit money fail-closed  
- [ ] Webhook בלי HMAC גוף; עם `GetLpResult`  
- [ ] אין Escrow / אין default `platform_percent`  

---

## 10. Revision

| תאריך | שינוי |
|---|---|
| 2026-07-08 | טיוטת תשתית (כולל WP כאתר חי) |
| 2026-08-12 | batch-2 #34: BINDING; סטאק נוכחי = Next+Supabase; WP = cutover היסטורי בלבד |
| 2026-08-12 | batch-2 #34 pass-2: BINDING על arch/docs-batch-2 (המשך תור) |
