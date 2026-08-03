# מדריך תפעול: ייצור

Deploy ל-**Vercel**, rollback, **סדר מיגרציות דרך MCP בלבד**, ותרחישי חירום.

Status: **BINDING** · עודכן: 2026-08-03  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-lifecycle`  
אין שינוי קוד במסמך זה. אין נגיעה בתיקייה הראשית מכאן.

מסמכים קשורים:

```
docs/DEPLOY.md
docs/ARCHITECTURE-BACKUP-DR.md
docs/ARCHITECTURE-OBSERVABILITY.md
docs/ARCHITECTURE-FRAUD-PREVENTION.md
```

Package manager: **pnpm** בלבד.  
שורש אפליקציה להרצות מאושרות:

```
/Users/ofir/kenyonexpress-web/kenyonexpress
```

כלל ברזל: עד רכישת טסט עוברת, `CHECKOUT_ENABLED=false`.

---

## 0. סדר שיגור

| # | שלב | יציאה |
|---|---|---|
| 1 | Freeze + גיבוי/PITR | SHA קפוא |
| 2 | מיגרציות על prod **רק דרך MCP** (§3) | schema מעודכן |
| 3 | Env Production ב-Vercel | P0 מלא |
| 4 | Deploy Vercel | Ready |
| 5 | Smoke בלי תשלום | home / PDP / cart / login |
| 6 | רכישת טסט | paid + voucher + מייל |
| 7 | Soft-open | `CHECKOUT_ENABLED=true` |
| 8 | חירום | §4 |

---

## 1. Deploy ל-Vercel

### 1.1 לפני

Terminal (משורש האפליקציה בלבד כשמורשה):

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build
```

CI ירוק על SHA השיגור. רישום ב-

```
STATE.md
```

### 1.2 Vercel

1. מיזוג / promote ל-Production  
2. וידוא Environment Variables  
3. Deploy / Redeploy  
4. Domain + Certificate Valid  
5. Instant Rollback מובן לפני soft-open  

### 1.3 Env P0

`NEXT_PUBLIC_APP_URL`, מפתחות Supabase prod, Cardcom prod, `CHECKOUT_ENABLED`, `CRON_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM`, `VOUCHER_QR_SECRET`.  
אסור Cardcom תחת `NEXT_PUBLIC_`.

### 1.4 Smoke

| בדיקה | צפי |
|---|---|
| `/` | 200, RTL |
| PDP קופון | מחיר אתר + יתרה בעסק; בלי Escrow |
| `/admin/products` | `platform_percent` פר מוצר |
| `/supplier` | בלי כרטיסי held |

---

## 2. Rollback

| כשל | פעולה |
|---|---|
| באג אפליקטיבי, כסף תקין | Vercel **Instant Rollback** |
| כסף שבור אחרי soft-open | `CHECKOUT_ENABLED=false` (+ Redeploy) ואז rollback |
| Webhook Cardcom נכשל | כיבוי checkout; לא לסמן paid ב-SQL |
| מייל נכשל, הזמנה תקינה | לא חוסם soft-open; תיקון outbox |
| מיגרציה שברה DB | §3.4 + BACKUP-DR; לא Instant Rollback לבד |

סדר מומלץ: כיבוי checkout → Instant Rollback → DNS אם צריך → תיעוד order ids → DB רק לפי DR.

---

## 3. מיגרציות: MCP בלבד

### 3.1 כלל מחייב

החלת מיגרציות על **production** (וגם על פרויקט ה-Supabase המקושר לייצור) נעשית **אך ורק דרך MCP של Supabase** בכלי הסוכן / Cursor (למשל כלי apply migration / רשימת מיגרציות של שרת ה-MCP המחובר).

**אסור בייצור:**

```bash
supabase db push
supabase db reset
```

וגם אסור להדביק SQL ידני ב-SQL Editor כ"קיצור" בלי תיעוד MCP, אלא אם MCP אינו זמין ואז: תיעוד חריג ב-

```
STATE.md
```

עם סיבה, ואחריות מפורשת.

Local לאימות קבצים (לא prod):

```bash
supabase start
supabase db reset   # רק local
```

### 3.2 סדר הרצה

1. קבצים תחת `supabase/migrations/` לפי שם (timestamp).  
2. Idempotent ככל האפשר.  
3. דרך MCP: להחיל **קובץ אחד בכל פעם** לפי הסדר החסר ב-`schema_migrations`.  
4. אחרי כל קובץ: smoke SQL (עמודות/constraints) + רישום ב-`STATE.md`.  
5. רק אחר כך Deploy אפליקציה שתלויה בסכמה.  

### 3.3 תיאום app ↔ schema

```text
migration via MCP on prod
  → verify
  → Vercel deploy של SHA שמצפה לסכמה
```

אסור לפרוס אפ שדורש עמודות שטרם הוחלו.

### 3.4 Rollback מיגרציה

Forward-only: מיגרציה מתקנת חדשה דרך MCP.  
אסור למחוק שורות מ-`schema_migrations`.  
קטסטרופה: PITR לפי `ARCHITECTURE-BACKUP-DR.md`.

### 3.5 אסור במיגרציות

- Default מומצא ל-`platform_percent`  
- החזרת Escrow/held לקופונים  
- `db reset` על prod  

---

## 4. תרחישי חירום

| תרחיש | פעולות מיידיות |
|---|---|
| תשלומים כפולים / webhook storm | `CHECKOUT_ENABLED=false`; בדוק `payment_webhook_events`; אל תסמן paid ידני |
| מימוש כפול חשוד | FRAUD playbook; freeze קופונים; audit |
| דליפת מפתח | רוטציה מיידית Cardcom/Supabase/Resend; invalidate sessions |
| אתר למטה (Vercel) | Instant Rollback או Redeploy אחרון הירוק; סטטוס ללקוחות |
| DB למטה / שחיתות | DR: PITR / restore scratch; checkout כבוי |
| Blast מיילים שגוי | כבה worker/cron notifications; תקן תבנית; אל תמחק outbox |
| תקיפת סריקות | rate limit + suspend supplier members |

אחרי אירוע: תחקיר ב-

```
STATE.md
```

+ `security_events`.

---

## 5. Acceptance

- [ ] Deploy Vercel עם CI ירוק + smoke  
- [ ] Rollback ידוע (Vercel + כיבוי checkout)  
- [ ] מיגרציות prod רק דרך MCP, אחת-אחת  
- [ ] תרחישי חירום מתועדים  
- [ ] אין `db push`/`db reset` על prod  

---

## 6. Revision

| תאריך | שינוי |
|---|---|
| 2026-08-03 | Deploy/rollback + מיגרציות MCP בלבד + חירום |
