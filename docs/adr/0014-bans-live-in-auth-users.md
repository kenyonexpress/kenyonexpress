# 0014 — חסימת משתמש נכתבת ל-`auth.users.banned_until`, לא ל-`profiles`

**סטטוס:** נאכף. **מאז:** ‏22.09.2026 ‏(SECTIONS 85).

‏GoTrue מסרב לטוקן של משתמש חסום ב-`maybeLoadUserOrSession`, ולכן
‏`supabase.auth.getUser()` נכשל וכל שער בצד השרת ‏(`requireSection`,
‏`lib/supabase/server`) שולח ללוגין בלי שנוספה בו בדיקה. עמודה ב-`profiles`
הייתה דורשת בדיקה בכל שער ובכל ‏route חדש. המחיר: רשימת המשתמשים לא מציגה
עמודת "חסום" ‏(PostgREST לא חושף את ‏`auth`), ודף המשתמש מציג "לא ידוע" עם
השגיאה כשה-API לא ענה. הפעולות ‏`banUser`/`unbanUser` דורשות סיבה וכותבות
‏`status_change` עם ‏`before`/`after`. ‏`docs/ADMIN-OPS.md`.
