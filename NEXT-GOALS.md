# NEXT-GOALS

תור יעדים תפעולי אחרי docs BINDING. לא מחליף STATE.md כמקור סשן.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד במסמך זה.

מסמכים קשורים:

```
STATE.md
docs/ARCHITECTURE-ROADMAP-V1.1.md
GO-LIVE.md
docs/GO-LIVE-CHECKLIST.md
```

מודל כסף: **No Escrow**.

---

## 0. החלטה

| # | הכרעה |
|---|---|
| N1 | STATE.md = מקור המשך סשן (`המשך מ:`). |
| N2 | Docs על `arch/docs-batch-2` בלבד עד הוראה אחרת. |
| N3 | אחרי docs: שער GO-LIVE (בדיקות, secrets, RLS, reconcile). |
| N4 | אין migration פרוד / db push בלי אישור מהארבעה החריגים. |
| N5 | מנויים מאחורי דגל; לא חוסמים שיגור קופונים. |

---

## 1. חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| תור יעדים כפול בלי STATE | בלבול בין סשנים. |
| מיזוג Escrow חזרה ליעדים | BUSINESS-MODEL. |
| קוד בזמן docs-freeze | כלל עבודה. |

---

## 2. סכמת DB

אין. יעדי קוד עתידיים מצביעים ל-`migrations/pending` באישור.

---

## 3. תור קצר נוכחי

1. אימות `docs/*.md` בתבנית BINDING (כמעט הושלם).  
2. GO-LIVE checklist + RLS `NOT rowsecurity=0`.  
3. Soft-open קופונים לפי `GO-LIVE.md`.  
4. V1.1a geo/PWA לפי ROADMAP.

---

## 4. מקרי קצה

| קוד | תוצאה |
|---|---|
| `goal_stuck_twice` | דילוג + תיעוד ב-STATE |
| `docs_vs_code_drift` | docs גוברים עד יישום מאושר |
| `second_agent_same_repo` | עצירה לפי חוקי הפרויקט |

---

## 5. פתוחות

| # | פתוח | שמרני |
|---|---|---|
| O1 | תאריך soft-open | בלי הבטחת תאריך במסמך |
| O2 | סדר wallet מול physical ב-V1.1 | ארנק אחרי redeem יציב |

עודכן: 2026-08-12.

---

## 6. Revision

| תאריך | שינוי |
|---|---|
| 2026-08-12 | קיצור BINDING; תור ארוך ישן הוחלף |
