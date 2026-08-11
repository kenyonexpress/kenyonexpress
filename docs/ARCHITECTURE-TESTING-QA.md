# ארכיטקטורה: Testing & QA (פירמידה מונורפו)

פירמידת בדיקות למונורפו KenyonExpress: Vitest unit, integration מול Supabase branch DB, Playwright e2e לזרימות קריטיות, מטריצת GitHub Actions, ושערי coverage על קבצים ששונו (בלי לסתור את שערי הכסף ב-`TESTING-STRATEGY.md`).

Status: **BINDING** · עודכן: 2026-08-11  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-lifecycle`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

**יחס למסמכים קיימים (חובה):**

| מסמך | תפקיד |
|---|---|
| `docs/TESTING-STRATEGY.md` | **BINDING (policy)** לשערי merge ו-**100% על money + redeem**. מסמך זה לא מוריד רף. |
| `docs/ARCHITECTURE-TESTING-CICD.md` | פירוט היסטורי + תרחישים; QA-PASS על תיקוני No Escrow / אין HMAC Cardcom / אין `escrow.ts`. |
| `docs/ARCHITECTURE-TESTING-QA.md` (כאן) | פירמידה מלאה + מטריצת CI + coverage diff-scoped + מיפוי e2e קריטי. |

מסמכים קשורים נוספים:

```
docs/CODE-REVIEW-CHECKLIST.md
docs/GITHUB-SETTINGS.md
docs/CONTRADICTIONS.md
docs/ARCHITECTURE-COUPON-REDEMPTION.md
docs/ARCHITECTURE-REFUNDS-DISPUTES.md
.github/workflows/ci.yml
```

מודל כסף בבדיקות: **No Escrow**. אין לכתוב/לצפות ל-escrow held. אין לבנות גוף webhook Cardcom "חתום HMAC" (לא קיים). אימות תשלום = `?s=` + `GetLpResult`.

---

## 1. Current-state audit (ריפו אמיתי)

נבדק READ-ONLY מול
`/Users/ofir/kenyonexpress-web/kenyonexpress`
(2026-08-11).

### 1.1 Unit (Vitest)

| פריט | מצב |
|---|---|
| Runner | Vitest 3.x, jsdom, `vitest.config.ts`, alias `@ -> src` |
| Include | `src/**/*.test.ts(x)` (+ בריפו הראשי גם `scripts/wp-import/**`, `scripts/seed/**`) |
| Money floors בקונפיג | 95% על `money.ts`, `commission.ts`, `split.ts`, `settlement.ts`, `state-machine.ts`, וגם על `escrow.ts` **שאינו קיים** |
| מדיניות docs | `TESTING-STRATEGY.md` דורש **100%** על money + redeem core; הקונפיג עדיין לא יושר |
| דוגמאות קיימות | commerce, redemption, settlement, refund unit, checkout-flow, push, observability, analytics |

### 1.2 Integration

| פריט | מצב |
|---|---|
| SQL lifecycle | `tests/sql/` (למשל voucher RLS / redemption lifecycle) |
| Supabase branch DB כ-job CI ייעודי | **לא** קיים כשער נפרד במטריצה |
| E2E כבר נוגע ב-DB אמיתי | כן, כש-`CI_SUPABASE_*` מוגדרים; אחרת e2e נדלג |

### 1.3 E2E (Playwright)

קיים תחת
`e2e/`
(locale `he-IL`, Chromium):

| Spec (אינדיקטיבי) | כיסוי חלקי |
|---|---|
| `checkout.spec.ts`, `purchase-flow.spec.ts` | checkout עד mock / לפני סליקה אמיתית |
| `coupon-scan.spec.ts`, `full-purchase-redeem.spec.ts`, `coupons.spec.ts` | קופון + סריקה |
| `cart`, `home`, `product`, `category`, `auth`, `a11y`, `rtl-mobile` | חנות / RTL |
| refund e2e ייעודי | **חסר** כ-spec קריטי סגור (יש unit: `refund.test.ts`) |
| checkout physical split כ-spec נפרד | **חסר** כזרימה מתויגת; לוגיקת split מכוסה בעיקר ב-unit |

`CARDCOM_USE_MOCK=true` ב-CI. אין חיוב אמיתי מ-PR.

### 1.4 CI matrix (GitHub Actions)

קובץ:
`.github/workflows/ci.yml`

| Job | תפקיד |
|---|---|
| `lint` | Biome + tsc על changed files + lint/typecheck לכל הריפו |
| `typecheck` | typecheck:changed |
| `test` | `pnpm test:coverage` + artifact |
| `build` | `pnpm build` (צריך secrets Supabase ל-build; Sentry maps אופציונלי) |
| `e2e` | Playwright אחרי build; **skip** אם אין `CI_SUPABASE_URL` |

Diff-scoped כבר קיים ל-lint/typecheck/hardcoded. Coverage floors ב-test job עדיין **per-file money path**, לא "רק קבצים ששונו" לכל `src/`.

### 1.5 חוב מתועד

1. רף 95% + סף על `escrow.ts` המת בקונפיג מול מדיניות 100% ב-`TESTING-STRATEGY.md`.
2. אין job integration ייעודי על Supabase preview/branch.
3. ארבעת e2e הקריטיים למטה עדיין לא כולם specs סגורים ונפרדים.
4. `apps/mobile` מחוץ לשערי השורש (מכוון; ראה MOBILE-APP).

---

## 2. Target architecture

### 2.1 פירמידה (יעד)

```text
        /\
       /E2E\          מעט, יציבים, he-IL, mock Cardcom
      /------\
     / Integr.\       Supabase branch / preview DB + RPC/RLS
    /----------\
   / Unit Vitest \    רוב הנפח; טהור בלי I/O כשאפשר
  /----------------\
```

| שכבה | כלי | חובה |
|---|---|---|
| Unit | Vitest | כל שינוי money/redeem/split/refund logic |
| Integration | Vitest + Supabase branch DB (או SQL runner מול branch) | RLS, `redeem_voucher` race, finalize אחרי GetLpResult |
| E2E | Playwright | ארבע הזרימות הקריטיות בסעיף 2.3 |

יחס נפח: הרבה unit → פחות integration → מעט E2E.

### 2.2 Vitest unit (חוזה)

- בלי רשת Cardcom ובלי DB כשניתן.
- רשימת invariants סגורה נשארת ב-`ARCHITECTURE-TESTING-CICD.md` + שערי `TESTING-STRATEGY.md`.
- **Money / redeem:** coverage **100%** על קבצי הליבה שמוגדרים כשער (לא מורידים ל-95%). יישור `vitest.config.ts` = משימת קוד נפרדת; עד אז docs גוברים על רף חסר/`escrow.ts`.
- שאר `src/`: דיווח; אין אחוז גלובלי כשער merge.

### 2.3 Integration מול Supabase branch DB

יעד:

1. לכל PR שנוגע ב-SQL/RLS/RPC: Supabase branch (או DB ייעודי ל-CI) עם מיגרציות מיושמות.
2. סוויטת integration מינימלית:
   - RLS: לקוח לא קורא הזמנות של אחר; ספק לא מממש קופון של ספק אחר.
   - `redeem_voucher` כפול במקביל → מימוש אחד.
   - Webhook/return: `?s=` + אימות `GetLpResult` (בלי HMAC מזויף).
   - Refund path: כתיבת ledger / `settlement_events` צפויה לפי `ARCHITECTURE-REFUNDS-DISPUTES.md`.
3. Secrets: `CI_SUPABASE_*` או branch connection מ-GitHub Environment; אין service role בלוגי בדיקות בדפדפן.

גשר זמני עד branch אוטומטי: `tests/sql/*` + e2e עם seed על DB CI קיים.

### 2.4 Playwright e2e (זרימות קריטיות)

כל זרימה = spec (או project) יציב, עברית RTL, בלי Cardcom אמיתי:

| # | זרימה | מה חייב להיבדק | הערות |
|---|---|---|---|
| E1 | checkout voucher | עגלה → checkout → mock LP return → הזמנה/קופון `issued` | No Escrow בנוסח/assert |
| E2 | checkout physical split | מוצר פיזי → פיצול לפי אחוזי מוצר → finalize | assert על סכומים מ-API/DB, לא על "held" |
| E3 | redeem scan | ספק מממש QR/קוד פעם אחת; ניסיון שני נכשל | יישור ל-`coupon-scan` / `full-purchase-redeem` |
| E4 | refund | בקשת החזר לפני/אחרי כללי המדיניות → סטטוס + אירוע settlement | היום בעיקר unit; e2e חובה ביעד |

אסור: תשלום אמיתי ב-PR, HMAC webhook בדיוני, assert על escrow held.

### 2.5 CI matrix (יעד)

```text
lint (diff + repo) ──┐
typecheck (diff)  ──┼──► test (unit+money floors) ──► build ──► e2e (optional until secrets)
                    │
                    └──► integration (Supabase branch)   [חדש]
```

| Job | חוסם merge? |
|---|---|
| lint / typecheck / test (money floors) | כן |
| build | כן (כשהסודות קיימים; אחרת לפי GITHUB-SETTINGS) |
| integration (branch DB) | כן אחרי הפעלה |
| e2e | כן אחרי `CI_SUPABASE_*`; עד אז skip עם אזהרה (מצב נוכחי) |

Concurrency: `ci-${{ github.ref }}`, cancel-in-progress (כמו היום).

### 2.6 Coverage gates על קבצים ששונו

שני רבדים (לא מחליפים זה את זה):

| רובד | כלל |
|---|---|
| A. Money/redeem BINDING | על קבצי הליבה ברשימה הסגורה: **100%** תמיד כשהם ב-diff או כש-CI מריץ את סוויטת הכסף. גובר על כל כלל diff-scoped. |
| B. Changed-files gate (שאר הקוד) | ל-PR: מודדים coverage רק על קבצי `src/**` ששונו ב-`CI_DIFF_RANGE`. שער מינימלי מדווח (למשל אין ירידה בכיסוי של קובץ שנגעו בו אם היה לו טסט). **אין** דרישת 80% גלובלי. |

עקרון: diff-scoped מונע רעש; money path נשאר שער מוחלט לפי `TESTING-STRATEGY.md`.

יישום יעד (קוד, לא במסמך זה):

1. `pnpm test:coverage` נשאר ל-money floors.
2. שלב נוסף `coverage:changed` (למשל Vitest + רשימת קבצים מ-`git diff`) כשער לא-כספי.
3. להסיר סף על `escrow.ts`; להעלות money/redeem ל-100% בקונפיג.

---

## 3. Numbered migration path

1. **יישור קונפיג ל-policy:** להסיר `escrow.ts` מה-thresholds; להעלות money + redeem core ל-100% לפי `TESTING-STRATEGY.md`.
2. **סגירת פערי e2e:** specs נפרדים ל-E1–E4 (voucher checkout, physical split, redeem scan, refund) עם mock Cardcom בלבד.
3. **הפעלת e2e כשער קבוע:** לוודא `CI_SUPABASE_*` + `seed:test` יציבים; לסמן required check ב-`GITHUB-SETTINGS.md`.
4. **Integration על Supabase branch:** workflow שיוצר/משתמש ב-branch, מריץ מיגרציות, רץ `tests/sql` + Vitest integration.
5. **Coverage changed-files:** הוספת job/שלב `coverage:changed` שאינו מוריד את רף הכסף.
6. **מטריצה למובייל (אופציונלי מאוחר):** typecheck נפרד ל-`apps/mobile` בלי לערבב workspace pnpm של Next.
7. **ניקוי docs ישנים:** כל תרחיש ב-`ARCHITECTURE-TESTING-CICD.md` שסותר No Escrow / HMAC נשאר מסומן כמתוקן; מסמך זה + `TESTING-STRATEGY.md` גוברים.

---

## 4. Acceptance

- [ ] אין PR כספי בלי unit ירוק על money/redeem לפי BINDING  
- [ ] אין טסט שמצפה ל-Escrow held או HMAC webhook Cardcom  
- [ ] E1–E4 קיימים כ-e2e יציבים (או מסומנים חסרים עם תאריך יעד בקוד)  
- [ ] CI מריץ lint/typecheck/test/build; e2e/integration לפי secrets  
- [ ] Coverage diff-scoped לא מחליף 100% money/redeem  

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-08-11 | יצירה: audit → target → migration; פירמידה, branch DB, E1–E4, CI matrix, coverage changed-files; קישור ל-TESTING-STRATEGY / TESTING-CICD |
