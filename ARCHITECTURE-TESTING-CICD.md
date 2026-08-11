# ארכיטקטורה: Testing + CI/CD (מצביע BINDING)

סקירה קצרה ל-CI וטסטים. פירוט ב-docs/.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.  
מודל כסף: **No Escrow**; אין DEFAULT 5%; percent מפורש בטסטים.

**מקור קנוני:**

```
docs/ARCHITECTURE-TESTING-CICD.md
docs/ARCHITECTURE-TESTING.md
docs/TESTING-STRATEGY.md
.github/workflows/ci.yml
```

Dump ארוך: git history לפני 2026-08-12.

---

## החלטה

| # | הכרעה |
|---|---|
| C1 | Pipeline: lint → typecheck → test → build → e2e (conditional). |
| C2 | Cardcom CI: mock LP; `?s=` + GetLpResult; בלי HMAC גוף. |
| C3 | אין threshold על escrow; אין DEFAULT_PLATFORM_COMMISSION. |
| C4 | `platform_percent` בטסט: חייב מפורש; null = fail. |
| C5 | Branch protection: lint, typecheck, test, build. |
| C6 | Migrations: MCP; לא `db push` מ-CI. |

---

## חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| root mega dump | docs/TESTING-CICD קנוני. |
| merge עם E2E אדום | skip מפורש עד secrets. |
| HMAC Cardcom ב-CI | לא במודל חי. |
| coverage על escrow.ts | מחוץ למודל. |
| db push מ-CI | MCP בלבד. |

---

## סכמת DB

אין DDL חדש. CI harness:

```text
CI_SUPABASE_URL / anon key
tests/sql/*.sql (post-reset assertions)
supabase start (migrations job יעד)
```

---

## מקרי קצה

| # | מקרה | התנהגות CI |
|---|---|---|
| CE1 | אין CI_SUPABASE_* | e2e skip + warning. |
| CE2 | build ללא env | fail. |
| CE3 | migration לא idempotent | apply-twice fail. |
| CE4 | percent null בטסט | unit fail. |
| CE5 | טסט HMAC ישן | להסיר. |

---

## פתוחות

| # | פתוח | הערה |
|---|---|---|
| O1 | E2E required check | אחרי CI_SUPABASE stable. |
| O2 | migrations job ב-ci.yml | D6. |
| O3 | Lighthouse / axe jobs | post-launch. |

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-07 | dump root עם HMAC/escrow |
| 2026-08-12 | batch-2: BINDING מצביע |
