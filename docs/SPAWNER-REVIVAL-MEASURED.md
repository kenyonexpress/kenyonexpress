# ה-spawner קם לתחייה אחרי kill, וזה נמדד

נמדד 19.08.2026 ב-09:32. תוספת ל-`docs/ETERNAL-OPS.md` §1.2 ו-§5, ותיקון
להוראה שמופיעה ב-`STATE.md` תחת עצירת ריבוי הסוכנים.

## ההוראה הקיימת לא עובדת

‏`STATE.md` מנחה לעצור את ההולדה כך:

```bash
kill 11850 52465          # kenyon-loop.sh, kenyon-forever.sh
```

**‏`kill` על `kenyon-forever.sh` הוא no-op.** ה-LaunchAgent שמפעיל אותו נושא
`KeepAlive = true`, כלומר launchd מחזיר אותו תוך שניות.

## הראיה, לא הערכה

‏`launchctl list`:

```
59087   0   com.kenyon.forever      ← טעון ורץ עכשיו
-       0   com.kenyon.watchdog     ← טעון, לא רץ ברגע זה
-       0   com.kenyon.autosave     ← טעון, לא רץ ברגע זה
```

‏`~/Library/LaunchAgents/com.kenyon.forever.plist`:

```
KeepAlive  = true
RunAtLoad  = true
ProgramArguments = /bin/bash /Users/ofir/kenyonexpress-web/kenyon-forever.sh
```

שרשרת התהליכים:

| PID | PPID | נוצר | מה זה |
| --- | --- | --- | --- |
| 59087 | 1 | 09:32:21 | `kenyon-forever.sh`, ההורה הוא launchd |
| 59088 | 59087 | 09:32:21 | `claude` |
| 59089 | 59088 | 09:32:21 | `caffeinate` |
| 11850 | 1 | 07:30:06 | `kenyon-loop.sh`, מ-nohup. מקור הולדה **שני ונפרד** |

**המחזור נצפה בפועל.** ‏`kenyon-forever.sh` היה PID `52465` ב-09:13. הוא איננו,
ובמקומו `59087` מ-09:32 שההורה שלו הוא `1`. כלומר הוא נהרג ו-launchd החזיר
אותו. זו בדיוק ההתנהגות שהתועדה כסכנה ב-ETERNAL-OPS §1.2, רק שכאן היא נמדדה
קורית.

## מה כן עוצר את זה

לפרוק את ה-LaunchAgent, לא להרוג את התהליך:

```bash
launchctl bootout gui/$UID/com.kenyon.forever
launchctl bootout gui/$UID/com.kenyon.watchdog   # אחרת הוא מחיה spawner שמת
kill 11850                                        # kenyon-loop.sh מ-nohup, בלי KeepAlive
```

‏`com.kenyon.watchdog` חייב לרדת **לפני** או יחד עם השאר. תפקידו המתועד הוא
לבדוק שה-spawner חי ולהחיות אותו אם מת, ולכן הוא מבטל כל צעד אחר ברשימה.

אימות:

```bash
launchctl list | grep -i kenyon        # לא אמור להישאר forever/watchdog
pgrep -fl 'kenyon-loop.sh|kenyon-forever.sh'   # ריק
pgrep -fl 'claude --dangerously'       # לכל היותר אחד
```

## מה הסוכן הזה לא עשה, ולמה

לא פרקתי ולא הרגתי כלום. שתי סיבות:

1. ‏`launchctl bootout` וכיבוי הלולאה הם כיבוי מלא של האוטומציה של אופיר. הוא
   מתועד כלא זמין, ולכן כיבוי כזה משאיר את הפרויקט קפוא עד שהוא חוזר. זו
   החלטה שלו, לא של הסוכן.
2. זיהוי שגוי של PID סוגר לאופיר טרמינל פעיל. ‏`22395` מ-07:54 הוא `claude`
   בלי `-p`, כלומר ככל הנראה הסשן האינטראקטיבי שלו.

## למה זה חשוב מעבר לבזבוז

יש **שני מקורות הולדה בלתי תלויים** על אותה תיקיית עבודה: הלולאה מ-nohup
וה-LaunchAgent. אף אחד מהם לא יודע על השני, ורק לאחד מהם יש KeepAlive. לכן
כל טיפול שמכוון לאחד בלבד נראה כאילו הצליח לרגע, ואז המספר חוזר לעלות.
