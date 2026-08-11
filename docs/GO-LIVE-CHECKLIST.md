# צ'קליסט Go-Live

תקציר BINDING לשערי עלייה. פירוט:

```
docs/ARCHITECTURE-GO-LIVE-CHECKLIST.md
docs/LAUNCH-CHECKLIST.md
docs/RUNBOOK-LAUNCH-DAY.md
GO-LIVE.md
```

Status: **BINDING (checklist)** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
כסף אמיתי רק כשכל **P0** PASS + ראיה.

---

## החלטה

| # | הכרעה |
|---|---|
| GL1 | P0 חוסם כסף/קופון/אבטחה; P1 soft-open; P2 אחרי השקה. |
| GL2 | DNS + SSL + `NEXT_PUBLIC_APP_URL` prod. |
| GL3 | Vercel env P0: Supabase, Cardcom, `VOUCHER_QR_SECRET`, `CRON_SECRET`, `CHECKOUT_ENABLED=false` עד smoke. |
| GL4 | Cardcom smoke: pay → webhook → GetLpResult → paid → voucher issued. |
| GL5 | DB: PITR; RLS on; **`platform_percent` מלא**; coupon prices מלאים. |
| GL6 | No Escrow בקופי/UI/legal; agorot בקוד. |
| GL7 | רק אחרי smoke: `CHECKOUT_ENABLED=true`. |

---

## חלופות שנדחו

| חלופה | למה |
|---|---|
| checkout live לפני smoke | GL7 |
| db push ביום השיגור | RUNBOOK |
| HSTS day-0 | P1 אחרי 48h |
| payout prod לפני engine | G1; קופון OK |

---

## סכמת DB

בדיקות pre-launch (אין DDL):

```text
products.platform_percent NOT NULL לכל published
products.coupon_price_agorot לקופונים
NOT rowsecurity = 0 on public tables
```

---

## מקרי קצה

| # | מקרה | שער |
|---|---|---|
| CE1 | webhook secret wrong | P0 fail |
| CE2 | percent null on live product | P0 block |
| CE3 | service role in client bundle | P0 fail |
| CE4 | restore untested | P0 until drill |
| CE5 | WP DNS cutover partial | rollback plan |
| CE6 | first real charge before refund test | P0 order |

---

## פתוחות

| # | פתוח |
|---|---|
| O1 | payout bank columns (B2) |
| O2 | Meilisearch prod optional P1 |
| O3 | WhatsApp API P2 |

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-08-12 | batch-2: BINDING |
