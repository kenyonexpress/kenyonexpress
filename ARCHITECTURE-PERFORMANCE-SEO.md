# ארכיטקטורה: Performance + SEO (מצביע BINDING)

סקירה קצרה ל-CWV, Lighthouse, SEO. פירוט ב-docs/.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

**מקורות קנוניים:**

```
docs/ARCHITECTURE-SEO-PERFORMANCE.md
docs/ARCHITECTURE-PERFORMANCE.md
docs/ARCHITECTURE-SEO.md
docs/ARCHITECTURE-SEO-SITEMAP.md
docs/PERFORMANCE-BUDGET.md
```

Dump ארוך: git history לפני 2026-08-12.

---

## החלטה

| # | הכרעה |
|---|---|
| SP1 | Budget: LCP <2.5s p75, CLS <0.1, INP <200ms mobile. |
| SP2 | Lighthouse CI: performance ≥85, a11y ≥90. |
| SP3 | Images: Next Image + R2; WebP/AVIF; width/height.explicit. |
| SP4 | Hero LCP: priority preload; לא lazy על LCP. |
| SP5 | Analytics: defer עד consent. |
| SP6 | Compare gate: visual diff home <11% vs live reference. |
| SP7 | RTL עברית; Heebo subset; `font-display: swap`. |

---

## חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| root mega dump | docs/SEO-PERFORMANCE קנוני. |
| full client PDP | RSC + streaming. |
| unoptimized hero GIF 5MB | budget. |
| GA before consent | Consent Mode. |
| skip Lighthouse CI | SP2 release gate. |

---

## סכמת DB

אין DDL. Observability:

```text
seo_redirects (301 מ-WP)
compare.mjs artifacts (local CI)
```

---

## מקרי קצה

| # | מקרה | התנהגות |
|---|---|---|
| CE1 | slow 3G hero | degrade image. |
| CE2 | CLS מ-Cardcom iframe | reserve space. |
| CE3 | R2 image 404 | placeholder; log. |
| CE4 | compare >11% regression | block merge goal. |
| CE5 | consent reject analytics | no third-party block. |

---

## פתוחות

| # | פתוח | הערה |
|---|---|---|
| O1 | RUM dashboard prod | OBSERVABILITY. |
| O2 | PDP ISR revalidate interval | measure. |
| O3 | edge cache tuning | Vercel. |

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-08-03 | dump root |
| 2026-08-12 | batch-2: BINDING מצביע |
