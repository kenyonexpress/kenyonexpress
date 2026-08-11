# ארכיטקטורה: אסטרטגיית בדיקות

פירמידת בדיקות: Vitest, SQL/RLS, Playwright E2E, עומס, RTL. מסמך אב ל-TESTING-QA ו-TESTING-CICD.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מודל כסף בבדיקות: **No Escrow**. אין assert על held/נאמן/J5.

מסמכים קשורים:

```
docs/ARCHITECTURE-TESTING-QA.md
docs/ARCHITECTURE-TESTING-CICD.md
docs/ARCHITECTURE-E2E-TESTING.md
docs/TESTING-STRATEGY.md
docs/ARCHITECTURE-SECURITY.md
.github/workflows/ci.yml
```

---

## 1. החלטה

| # | הכרעה |
|---|---|
| T1 | הבדיקה הזולה ביותר שיכולה לתפוס את הבאג תופסת אותו (פירמידה). |
| T2 | מסלול כסף: רשימת invariants **סגורה** (M1-M20), לא אחוז כיסוי גלובלי. |
| T3 | 100% coverage על ליבת money/redeem לפי `TESTING-STRATEGY.md`. |
| T4 | RLS ו-race tests ב-`tests/sql/` (D9): חובה לפונקציות כסף. |
| T5 | E2E: Playwright `he-IL`, mock Cardcom ב-CI; אין חיוב אמיתי ב-PR. |
| T6 | אין טסט Escrow held, HMAC גוף Cardcom, או default 5% ל-`platform_percent`. |
| T7 | `src/components/`: חוב לבדוק RTL + מחיר (חור ידוע; יעד סגירה). |
| T8 | עומס k6: staging בלבד; לא ב-CI חוסם merge. |
| T9 | E2E ב-CI חייב לרוץ כש-`CI_SUPABASE_*` קיימים (לא skip שקט). |
| T10 | מיגרציות: harness apply-twice (D6) לפני prod remote. |

---

## 2. חלופות שנדחו

| חלופה | נימוק דחייה |
|---|---|
| 80% coverage גלובלי כשער merge | כיסוי ≠ נכונות; money path ברשימה סגורה. |
| E2E בלבד לכסף | יקר, flaky; unit + SQL מהירים יותר. |
| skip E2E ב-CI "כדי שיהיה ירוק" | T9: שער מטעה גרוע מיעדר שער. |
| assert escrow held | No Escrow; CONTRADICTIONS. |
| HMAC webhook Cardcom ב-E2E | אימות = `?s=` + `GetLpResult`. |
| k6 על production | סיכון + Cardcom; staging בלבד. |

---

## 3. סכמת DB (בדיקות)

**אין DDL חדש.** שימוש ב:

| מיקום | תפקיד |
|---|---|
| `tests/sql/*.sql` | RLS, redeem race, wallet, order lifecycle |
| `tests/sql/90_test_support.sql` | fixtures; לא במיגרציות (D18) |
| `supabase/seed.sql` | seed דטרמיניסטי ל-E2E |
| `pnpm seed:test` | seed לסביבת בדיקות |

Harness יעד: `supabase db reset --local` + apply-twice על `supabase/migrations/*.sql`.

---

## 4. פירמידה (as-built / יעד)

| שכבה | כלי | מצב |
|---|---|---|
| חוקי כסף | Vitest | 56+ קבצים; floors 95% על 6 מודולים |
| Property tests | fast-check | **יעד** (T9 ב-GAPS) |
| SQL / RLS | psql | 4 קבצים |
| E2E | Playwright | 7+ specs; CI skip אם אין secrets |
| רכיב RTL | Vitest + Testing Library | **0** (חוב T7) |
| עומס | k6 | **0** |
| ויזואלי / axe | Playwright | **0** |

Invariants כסף (תמצית): M1 integer agorot; M3 סכום חלקים = שלם; M5 קופון supplier_due=0; M9 percent חסר = throw; M17 אין escrow_holds.

---

## 5. מקרי קצה (בדיקות)

| # | מצב | assert |
|---|---|---|
| E1 | splitPhysical(100, 33) × 3 | platform+supplier=100 (M3/M4) |
| E2 | redeem כפול במקביל | שורת מימוש אחת (R1) |
| E3 | webhook כפול | idempotency; חיוב אחד (R2) |
| E4 | spend ארנק כפול | יתרה ≥ 0 (R4) |
| E5 | `platform_percent` null | throw (M9) |
| E6 | float בפלט money | fail typecheck/test |
| E7 | E2E בלי CI_SUPABASE | skip מפורש + warning, לא pass שקט |
| E8 | seed ב-production | `assert_seeds_allowed` block |

---

## 6. פתוחות

| # | פער | חומרה | תאריך |
|---|---|---|---|
| O1 | E2E CI skip | **קריטי** | 2026-08-12 |
| O2 | harness apply-twice | **קריטי** | 2026-08-12 |
| O3 | 0 component tests | גבוה | 2026-08-12 |
| O4 | property tests fast-check | גבוה | 2026-08-12 |
| O5 | k6 / visual / axe | בינוני | 2026-08-12 |
| O6 | 45 lint errors בחוב | נמוך | 2026-08-12 |

---

## 7. Acceptance

- [ ] invariants M1-M20 מתועדים עם טסט לכל אחד (או פער ב-O*)  
- [ ] אין Escrow/HMAC/default 5% בטסטים  
- [ ] TESTING-QA + TESTING-CICD + E2E-TESTING מקושרים  
- [ ] חלופות + DB + קצה + פתוחות  

---

## 8. Revision

| תאריך | שינוי |
|---|---|
| 2026-07-29 | מסמך mega-docs מקורי |
| 2026-08-12 | batch-2: BINDING עברית; תבנית חובה; No Escrow |
