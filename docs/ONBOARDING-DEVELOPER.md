# מדריך מפתח חדש (Onboarding)

איך נכנסים לקוד בלי לשבור כסף, מיגרציות, או עיצוב.

Status: **GUIDE** · עודכן: 2026-08-10  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-lifecycle`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית בזמן עבודת docs.

קרא קודם (סדר חובה):

```
docs/CONTRADICTIONS.md
docs/TESTING-STRATEGY.md
docs/CODE-REVIEW-CHECKLIST.md
docs/RUNBOOK-PRODUCTION.md
docs/MASTER-INDEX.md
```

---

## 1. מה זה הריפו (לא monorepo קלאסי עדיין)

שורש יחיד עם אפליקציית Next אחת. אין `kenyonexpress/kenyonexpress` מקונן.

| נתיב | תפקיד |
|---|---|
| `src/app/` | App Router (store, account, admin, supplier, auth) |
| `src/components/` | UI |
| `src/lib/` | commerce/money, cart, analytics, … |
| `src/server/` | actions, domain, queries |
| `supabase/migrations/` | DDL + RLS (idempotent) |
| `e2e/` | Playwright |
| `scripts/` | seed, compare.mjs, import, ops |
| `docs/` | ארכיטקטורה ו-runbooks (מקור אמת לתכנון) |
| `refs/` | צילומים/QA מקומיים (בדרך כלל gitignored) |
| `packages/` | יעד עתידי (למשל `packages/money`); היום הכסף ב-`src/lib/commerce/money.ts` |

מנהל חבילות: **pnpm בלבד** (`packageManager: pnpm@11.1.2`). `npm install` נשבר על עץ הסימלינקים.

Next: גרסה בפרויקט שונה ממה שלמדת; לפני API חדש קרא את המדריכים תחת

```
node_modules/next/dist/docs/
```

ראה גם:

```
AGENTS.md
```

---

## 2. כללי ברזל

### 2.1 כסף באגורות

- כל חישוב כסף = **integers באגורות**, לא float.
- המרות רק דרך מודול money (`ilsToAgorot` / `agorotToIls`).
- **No Escrow:** קופון = מקדמה באתר לפלטפורמה + יתרה בעסק; אין held/J5/נאמן.
- `platform_percent` **פר מוצר**, בלי default גלובלי; snapshot להזמנה.

פירוט:

```
docs/CONTRADICTIONS.md
docs/ARCHITECTURE-PRICING-RULES.md
docs/TESTING-STRATEGY.md
```

כיסוי יעד: **100%** על money (+ `packages/money` כשיופרד) ועל נתיב redeem.

### 2.2 מיגרציות רק MCP (prod)

- כתיבת קובץ ב-

```
supabase/migrations/
```

חייבת להיות **idempotent** (IF NOT EXISTS, DROP POLICY לפני CREATE, וכו').

- החלה על **production**: רק דרך **Supabase MCP** apply, קובץ אחד בכל פעם.
- אסור: `supabase db push` לפרוד, מחיקה מ-`schema_migrations`, down-migration.
- Rollback = מיגרציית תיקון חדשה קדימה.

פירוט:

```
docs/RUNBOOK-PRODUCTION.md
```

Skill מקומי (אם עובדים עם Claude/Cursor skills): `.claude/skills/supabase-migrations/`.

### 2.3 `compare.mjs` לפני שינוי UI חנות

אחרי שינוי layout/CSS בדפי חנות:

```bash
PORT=3311 pnpm start &
LOCAL_BASE=http://localhost:3311 node scripts/compare.mjs --page=home
```

צרף תוצאה ל-PR או ל-`refs/`. ראה

```
docs/CODE-REVIEW-CHECKLIST.md
docs/DESIGN-CHECKLIST-FINAL.md
```

### 2.4 Worktrees

| Worktree | מטרה | כלל |
|---|---|---|
| `/Users/ofir/kenyonexpress-web/kenyonexpress` | קוד פרודקשן / פיצ'רים | שורש הקוד היחיד |
| `/Users/ofir/kenyonexpress-web/ke-arch` | docs על `arch/docs-lifecycle` | **אין** לשנות קוד אפליקציה מכאן בלי החלטה מפורשת |

- אל תיצור עותק כפול של הפרויקט (`src copy`, תיקייה מקוננת).
- לפני פקודות: `pwd` חייב להיות השורש הנכון.
- E2E מקבילים: `E2E_PORT` כדי לא להילחם על 3000.

---

## 3. הרצה מקומית

Terminal משורש הפרויקט:

```bash
pnpm install
cp .env.example .env.local   # ואז מלא סודות (לא לקומיט)
pnpm dev                     # http://localhost:3000
```

בדיקות:

```bash
pnpm lint
pnpm type-check
pnpm test
pnpm test:coverage
pnpm test:e2e
```

טיפים:

- בלי Supabase env תקין דפים רבים ייכשלו; השתמש בערכי dev מהצוות.
- `ALLOW_INCOMPLETE_ENV` רק לניסויים מקומיים מודעים, לא לפרוד.
- Cardcom: אל תשלים תשלום אמיתי בטסט ידני; עצור בדף הסליקה.

---

## 4. איך תורמים (PR)

1. Branch קצר מ-`main` (או מהענף הפעיל שהצוות מגדיר).
2. שינוי קטן וממוקד; כסף/RLS/UI = טסטים לפי

```
docs/TESTING-STRATEGY.md
```

3. לפני בקשת review: עבור על

```
docs/CODE-REVIEW-CHECKLIST.md
```

(agorot, RLS, RTL logical CSS, compare.mjs או N/A).

4. תיאור PR: **למה** + איך בדקת.
5. אל תדחוף סודות; אל תשנה `.env` בפרוד מהמחשב בלי נוהל.
6. Docs-only: אפשר על `ke-arch` / `arch/docs-lifecycle`; קוד: על worktree הראשי.

הגדרות GitHub (required checks):

```
docs/GITHUB-SETTINGS.md
```

---

## 5. מפת קריאה לפי נושא (מסמכי 10.08 ומעלה)

| נושא | התחל כאן |
|---|---|
| כסף / checkout / Cardcom | `CONTRADICTIONS`, `CARDCOM-ARCHITECTURE`, `ARCHITECTURE-PAYOUT-MECHANISM` |
| מימוש קופון | `ARCHITECTURE-COUPON-REDEMPTION`, `INCIDENT-PLAYBOOKS` §3 |
| טסטים / review | `TESTING-STRATEGY`, `CODE-REVIEW-CHECKLIST` |
| תפעול / SLA / גיבוי | `SLA-MONITORING`, `BACKUP-RECOVERY`, `INCIDENT-PLAYBOOKS` |
| פרטיות | `DATA-RETENTION-POLICY` (**דורש עו״ד**), `ARCHITECTURE-DATA-EXPORT-GDPR` |
| עיצוב חנות | `DESIGN-CHECKLIST-FINAL`, `PHASE2-3-SPEC` |
| השקה | `LAUNCH-CHECKLIST`, `RUNBOOK-LAUNCH-DAY`, `MARKETING-LAUNCH` |
| מובייל / אינטגרציות | `ARCHITECTURE-MOBILE-APP`, `ARCHITECTURE-INTEGRATIONS` |

אינדקס מלא ממוין:

```
docs/MASTER-INDEX.md
```

---

## 6. RTL

UI ללקוח בעברית; `dir="rtl"`. Tailwind: `ps`/`pe`/`ms`/`me`/`start`/`end` לא `pl`/`pr`/`left`/`right`.

---

## 7. Acceptance ליום ראשון

- [ ] `pnpm dev` עולה מקומית
- [ ] יודע למה אסור float בכסף
- [ ] יודע שמיגרציות prod = MCP בלבד
- [ ] יודע מתי חובה `compare.mjs`
- [ ] יודע באיזה worktree הוא עומד

---

## 8. Revision

| תאריך | שינוי |
|---|---|
| 2026-08-10 | מדריך ראשוני אחרי סבב docs של היום |
