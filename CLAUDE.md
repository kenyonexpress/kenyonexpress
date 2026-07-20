@AGENTS.md

## ⛔ חוקי פרויקט קבועים (חובה)

1. **נתיב יחיד ונכון:** הפרויקט נמצא אך ורק ב-`/Users/ofir/kenyonexpress-web/kenyonexpress`. זהו שורש הפרויקט (כאן `package.json`, `.git`, `src/`). אין מבנה מקונן.
2. **אסור עותקים כפולים:** אין ליצור עותקים של הפרויקט (`kenyonexpress/kenyonexpress/`, `src copy`, `* copy`, וכו'). עותק כפול הוא שורש כל הבלבול — אם נדרש גיבוי, השתמש ב-git/GitHub בלבד.
3. **אסור להריץ פקודות מתיקיות אחרות:** כל פקודה (`pnpm`, `git`, `next`) חייבת לרוץ מהשורש למעלה. **לפני כל פעולה — לוודא `pwd` נכון** (`/Users/ofir/kenyonexpress-web/kenyonexpress`).
4. **commit ו-push רק באישור מפורש:** אסור לבצע `git commit` או `git push` בלי אישור מפורש של Ofir לפני כל אחד מהם. מציגים diff, ממתינים לאישור, ורק אז מבצעים. אחרי commit מאושר — push מיידי ל-`origin` branch `phase5/homepage` (הגיבוי נשאר חובה, רק האישור קודם לו).
