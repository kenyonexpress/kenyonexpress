# ארכיטקטורה: Testing ו-CI/CD

שערי CI למיזוג, רצפות כיסוי על נתיבי כסף, חוזה טסטים שתואם מודל הכסף החי.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מודל כסף: **No Escrow**. אין Escrow held בטסטים. אין default 5% ל-`platform_percent`.

מסמכים קשורים:

```
docs/ARCHITECTURE-TESTING.md
docs/ARCHITECTURE-TESTING-QA.md
docs/TESTING-STRATEGY.md
docs/CONTRADICTIONS.md
.github/workflows/ci.yml
vitest.config.ts
```

---

## 1. החלטה

| # | הכרעה |
|---|---|
| C1 | אין אחוז כיסוי גלובלי שפותח merge; invariants כסף סגורים + 100% ליבה. |
| C2 | Pipeline: lint → typecheck → test → build → e2e (conditional). |
| C3 | Cardcom ב-CI: mock LP; אימות `?s=` + `GetLpResult`; **אין** HMAC גוף. |
| C4 | אין threshold על `escrow.ts`; אין `DEFAULT_PLATFORM_COMMISSION`. |
| C5 | `platform_percent` בטסט: חייב מפורש בקלט; חסר = fail. |
| C6 | Branch protection: lint, typecheck, test, build (+ e2e כשמוכן). |
| C7 | מיגרציות remote: MCP בלבד; לא `db push` מ-CI. |
| C8 | Concurrency: `ci-${{ github.ref }}`, cancel-in-progress. |
| C9 | Preview Vercel: לעיון; לא כותב כסף ל-prod DB. |

### 1.1 תיקוני אמת (מחליפים טקסט ישן)

| # | היה שגוי | מצב מחייב |
|---|---|---|
| A | פיצול קופון 10%/90% | `coupon_price` מוחלט; אין יחס קבוע |
| B | E2E webhook HMAC | אין חתימת גוף; `?s=` + GetLpResult |
| C | assert escrow held | No Escrow |
| D | DEFAULT 5% commission | אסור; percent מהמוצר |

---

## 2. חלופות שנדחו

| חלופה | נימוק דחייה |
|---|---|
| merge עם E2E אדום קבוע | מלמד להתעלם; skip מפורש עד secrets |
| lint על כל הריפו כחוסם | 45 שגיאות legacy; diff-scoped |
| HMAC Cardcom כדרישת CI | לא במודל החי |
| coverage על escrow.ts | קובץ מחוץ למודל |
| db push מ-CI | אסור; MCP |
| force push ל-main | branch protection |

---

## 3. סכמת DB (CI)

**אין DDL חדש.** CI משתמש ב:

| משאב | שימוש |
|---|---|
| `CI_SUPABASE_URL` / anon key | build + e2e |
| stack מקומי (supabase start) | migrations job יעד |
| `tests/sql/*.sql` | assertions post-reset |

Harness יעד (D6): apply-twice + SQL tests ב-job `migrations`.

---

## 4. Invariants ו-E2E CI

| מודול | חובה |
|---|---|
| money (agorot) | parse, allocation, no float |
| split/settlement | קופון supplier_due=0; פיזי percent מפורש |
| redemption gate | not_found, already_used, wrong_supplier |
| QR verify | digest tamper fail |

E2E flows: checkout mock LP; redeem once; refund policy.

Stub Cardcom:

```
CHECKOUT_PROVIDER=mock
```

---

## 5. מקרי קצה

| # | מצב | התנהגות CI |
|---|---|---|
| E1 | אין `CI_SUPABASE_*` | e2e skip + warning |
| E2 | build ללא env | fail (לא skip שקט) |
| E3 | migration לא idempotent | apply-twice fail |
| E4 | secret ב-`.next/static` | scan job fail |
| E5 | percent null בטסט | unit fail |
| E6 | טסט HMAC ישן | להסיר; block review |
| E7 | PR concurrent pushes | cancel-in-progress |

---

## 6. פתוחות

| # | פער | תאריך |
|---|---|---|
| O1 | E2E required check | אחרי CI_SUPABASE stable |
| O2 | migrations job ב-ci.yml | D6 |
| O3 | secret bundle scan | 7.4 TESTING |
| O4 | Lighthouse / axe jobs | post-launch |

---

## 7. Acceptance

- [ ] אין DEFAULT 5% / HMAC / Escrow בטסטים  
- [ ] percent מפורש בכל settlement test  
- [ ] lint/typecheck/test/build מתועדים  
- [ ] חלופות + DB + קצה + פתוחות  

---

## 8. Revision

| תאריך | שינוי |
|---|---|
| 2026-07 | טיוטה עם HMAC/escrow (מיושן) |
| 2026-08-12 | batch-2: BINDING מלא; תבנית חובה |
