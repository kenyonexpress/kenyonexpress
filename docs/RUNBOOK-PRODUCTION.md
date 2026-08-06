# מדריך תפעול: ייצור

Deploy ל-Vercel, rollback, ומיגרציות **דרך MCP בלבד**.

Status: **BINDING** · עודכן: 2026-08-06  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-lifecycle`  
אין שינוי קוד במסמך זה. אין נגיעה בתיקייה הראשית.

מסמכים קשורים:

```
docs/ARCHITECTURE-BACKUP-DR.md
docs/ARCHITECTURE-OBSERVABILITY.md
docs/ARCHITECTURE-FRAUD-PREVENTION.md
docs/DEPLOY.md
```

Package manager: **pnpm** בלבד.  
שורש אפליקציה מאושר:

```
/Users/ofir/kenyonexpress-web/kenyonexpress
```

עד רכישת טסט: `CHECKOUT_ENABLED=false`.

---

## 0. סדר שיגור

| # | שלב |
|---|---|
| 1 | Freeze + גיבוי/PITR |
| 2 | מיגרציות prod **רק MCP** (§3) |
| 3 | Env Production ב-Vercel |
| 4 | Deploy Vercel |
| 5 | Smoke בלי תשלום |
| 6 | רכישת טסט |
| 7 | Soft-open: `CHECKOUT_ENABLED=true` |

---

## 1. Deploy

לפני (Terminal משורש האפליקציה כשמורשה):

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build
```

Vercel: promote/Production → Ready → Certificate Valid.  
Instant Rollback מובן לפני soft-open.

Env P0: URL, Supabase prod, Cardcom prod, `CHECKOUT_ENABLED`, `CRON_SECRET`, Resend, `VOUCHER_QR_SECRET`.  
אסור Cardcom תחת `NEXT_PUBLIC_`.

Smoke: `/` RTL, PDP עם מחיר אתר + יתרה בעסק, admin מציג `platform_percent`, supplier בלי Escrow UI.

---

## 2. Rollback

| כשל | פעולה |
|---|---|
| באג אפ, כסף תקין | Vercel Instant Rollback |
| כסף שבור | `CHECKOUT_ENABLED=false` ואז rollback |
| Webhook נכשל | כיבוי checkout; לא paid ידני ב-SQL |
| מיגרציה שברה DB | §3.4 + BACKUP-DR |

---

## 3. מיגרציות: MCP בלבד

החלת מיגרציות על production **אך ורק דרך MCP של Supabase** (כלי apply migration של השרת המחובר).

**אסור בייצור:**

```bash
supabase db push
supabase db reset
```

סדר:

1. קבצים ב-`supabase/migrations/` לפי שם.  
2. דרך MCP: קובץ אחד בכל פעם לפי החסר ב-`schema_migrations`.  
3. אחרי כל קובץ: smoke SQL + רישום ב-`STATE.md`.  
4. רק אז Deploy אפ שתלוי בסכמה.  

Rollback מיגרציה: קובץ מתקן חדש דרך MCP. אסור למחוק מ-`schema_migrations`.  
Local בלבד מותר `supabase db reset`.

חריג MCP לא זמין: תיעוד מפורש ב-`STATE.md` לפני SQL Editor.

---

## 4. חירום (תמצית)

| תרחיש | מיידי |
|---|---|
| תשלומים כפולים | כיבוי checkout |
| מימוש כפול חשוד | FRAUD + freeze |
| דליפת מפתח | רוטציה + invalidate |
| אתר למטה | Instant Rollback |
| DB | PITR / DR |

---

## 5. Acceptance

- [ ] Deploy Vercel + smoke  
- [ ] Rollback ידוע  
- [ ] מיגרציות prod רק MCP  
- [ ] אין `db push`/`reset` על prod  

---

## 6. Revision

| תאריך | שינוי |
|---|---|
| 2026-08-06 | Deploy/rollback + מיגרציות MCP בלבד |
