# ארכיטקטורה: SEO Performance

Core Web Vitals, Lighthouse gates, ISR, image pipeline, a11y score.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד.

מסמכים קשורים:

```
docs/ARCHITECTURE-PERFORMANCE.md
docs/ARCHITECTURE-IMAGE-PIPELINE.md
docs/ARCHITECTURE-ACCESSIBILITY-IL.md
docs/PERFORMANCE-BUDGET.md
```

---

## החלטה

| # | הכרעה |
|---|---|
| SP1 | Budget: LCP <2.5s p75, CLS <0.1, INP <200ms (mobile). |
| SP2 | Lighthouse CI: performance ≥85, a11y ≥90 on home/PDP sample. |
| SP3 | Images: Next Image + R2; WebP/AVIF; explicit width/height. |
| SP4 | Hero LCP image: priority preload; no lazy on LCP. |
| SP5 | Third-party: defer analytics until consent; Cardcom iframe isolated. |
| SP6 | Font: Heebo subset Hebrew; `font-display: swap`. |
| SP7 | Compare gate: visual diff home <11% vs live reference script. |
| SP8 | Admin/storefront bundle split; no recharts on storefront. |

---

## חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| full client PDP | RSC + streaming. |
| unoptimized hero GIF 5MB | SP4: budget. |
| GA before consent | SP5: Consent Mode. |
| infinite JS on category | pagination / virtualize. |
| skip Lighthouse CI | SP2: release gate. |

---

## סכמת DB

אין DDL. Observability:

```text
vercel analytics / web vitals export (optional)
compare.mjs artifacts (local CI)
```

---

## מקרי קצה

| # | מקרה | התנהגות |
|---|---|---|
| CE1 | slow 3G hero | still LCP target or degrade image. |
| CE2 | CLS from Cardcom iframe | reserve space. |
| CE3 | R2 image 404 | placeholder; log. |
| CE4 | font FOIT | swap + fallback. |
| CE5 | compare >11% regression | block merge docs goal. |
| CE6 | consent reject analytics | no third-party block render. |

---

## פתוחות

| # | פתוח | הערה |
|---|---|---|
| O1 | RUM dashboard prod | OBSERVABILITY. |
| O2 | edge cache tuning | Vercel config. |
| O3 | PDP ISR revalidate interval | measure. |

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-08-03 | SEO performance gates |
| 2026-08-12 | batch-2: BINDING 5 סעיפים |
