# CHANGELOG (תהליך)

כללי רישום שינויים לפרויקט. רשימת גרסאות מפורטת: git log / GitHub Releases.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`

---

## 0. החלטה

| # | הכרעה |
|---|---|
| CH1 | כל שינוי מוצר/כסף/docs מחייב הודעת commit ברורה. |
| CH2 | שינויי כסף מציינים No Escrow / agorot כשרלוונטי. |
| CH3 | אין להסתיר breaking DB בלי שורת migration pending. |
| CH4 | docs batch-2: commit לכל מסמך. |

---

## 1. חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| CHANGELOG ידני ענק כמקור אמת יחיד | נסחף מול git. |
| שתיקת breaking | שובר deploy. |

---

## 2. סכמת DB

אין. שינויי סכימה = קבצי SQL ב-`migrations/pending` + אישור.

---

## 3. מקרי קצה

| קוד | תוצאה |
|---|---|
| `secret_in_commit` | revert מיידי + rotate |
| `docs_contradict_money` | CONTRADICTIONS + תיקון |

---

## 4. פתוחות

| # | פתוח | שמרני |
|---|---|---|
| O1 | GitHub Releases אוטומטי | git log מספיק כרגע |
| O2 | שמירת היסטוריית CHANGELOG ישנה במלואה | ב-git history |

עודכן: 2026-08-12.

---

## 5. Revision

| תאריך | שינוי |
|---|---|
| 2026-08-12 | הוחלף dump ארוך ב-BINDING תהליך |
