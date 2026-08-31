# ספר המערכת הנצחית

תאריך: 2026-08-19.
ענף: `phase5/homepage`.
היקף: docs בלבד.

מפת ההישרדות של הלולאה על המק. לא מחליף את
`docs/RUNBOOK-OPS.md`
(בוקר, אתר למטה, webhook). כאן רק: מי מוליד סוכן, מה קורה בריסטארט/קריסה/מכסה/חשמל, פקודת אבחון אחת, ואיך מוסיפים שלב בלי לעצור.

שורש הפרויקט (git):

```
/Users/ofir/kenyonexpress-web/kenyonexpress
```

תיקיית האב (מחוץ ל-git, כאן יושבים forever / דגל הסיום):

```
/Users/ofir/kenyonexpress-web
```

התראות:

```
https://ntfy.sh/kenyon-ofir-limit
```

**כלל ברזל, נמדד 19.08:** spawner אחד בלבד. שני spawners על אותו עץ הולידו שישה `claude` במקביל, כפלו את בלוק היציאה ב-
`AUTOPILOT-PROMPT.md`,
והזיזו את HEAD מתחת לסשן חי. ראה
`STATE.md`
סעיף "ריבוי סוכני קוד".

---

## 1. מפת כל הרכיבים

שלוש שכבות. מה שב-git נקרא מהריפו. מה שמחוץ ל-git נמדד על המק או מצוין כנתיב חיפוש (הענן הזה לא רואה את
`~/Library/LaunchAgents`).

### 1.1 שכבת ההולדה (מי מפעיל `claude`)

| רכיב | נתיב | ב-git? | תפקיד שנמדד |
|---|---|---|---|
| `kenyon-loop.sh` | `/Users/ofir/kenyonexpress-web/kenyonexpress/kenyon-loop.sh` | כן | לולאת `while true`: מריצה `claude --dangerously-skip-permissions --print` עם פרומפט שקורא `STATE.md` → `## המשך מ:`. PID ב-`~/.kenyon-loop.pid`. עצירה ב-`~/.kenyon-loop.stop`. לוג `~/kenyon-loop.log`. מכסה נכשלת → backoff 300s עד 3600s + ntfy |
| `kenyon-forever.sh` | `/Users/ofir/kenyonexpress-web/kenyon-forever.sh` | **לא** (תיקיית אב) | spawner שני. נמדד חי ב-19.08 (PID 52465). הסוכנים שהוא הוליד קיבלו `Read AUTOPILOT-PROMPT.md` או את גוף הקובץ כ-`-p`. **אסור שירוץ יחד עם הלולאה** |
| `kenyon-revive` | לחפש: `/Users/ofir/kenyonexpress-web/kenyon-revive*` וגם `~/bin/kenyon-revive*` | לא ב-git | סקריפט החייאה ש-watchdog אמור לקרוא. אם הקובץ חסר, launchd עדיין יכול להצביע עליו ואז ייכשל בשקט |

הפעלת הלולאה היחידה שמתועדת בריפו (Terminal, מהשורש):

```bash
nohup caffeinate -dims ./kenyon-loop.sh >> ~/kenyon-loop.log 2>&1 &
```

### 1.2 LaunchAgents (שורדים ריסטארט)

שלושה תוויות. קבצי plist חיים אצל המשתמש, לא בריפו:

```
~/Library/LaunchAgents/com.kenyon.forever.plist
~/Library/LaunchAgents/com.kenyon.autosave.plist
~/Library/LaunchAgents/com.kenyon.watchdog.plist
```

| תווית | מה היא אמורה לעשות | סכנה אם חיה במקביל ללולאה |
|---|---|---|
| `com.kenyon.forever` | KeepAlive על `kenyon-forever.sh` אחרי login / קריסה / ריסטארט | מולידה סוכן שני אם גם `kenyon-loop.sh` רץ מ-nohup |
| `com.kenyon.autosave` | שמירה מחזורית (גיבוי / git) בלי סוכן קוד | `git add -A` באמצע סשן חי דורס עץ לא מקומיט. `nightwatch.sh` בריפו עושה commit גורף. **לא להפעיל את שניהם** |
| `com.kenyon.watchdog` | בודק שה-spawner חי, קורא revive אם מת | אם בודק רק forever ומתעלם מ-loop (או להפך), תקום לולאה שנייה |

`launchctl` טוען אותם ב-login של המשתמש הגרפי. SSH בלי Aqua לא טוען LaunchAgents אלא אם עשית `bootstrap gui/$UID`.

### 1.3 התור, פרוטוקול היציאה, דגל הסיום

| רכיב | נתיב | ב-git? | תפקיד |
|---|---|---|---|
| מצביע חי | `STATE.md` כותרת `## המשך מ:` | כן | **זה מה שהלולאה ב-git קוראת.** נכון ל-19.08: `(12) PAYMENTS VERIFY` |
| תור AUTOPILOT | `AUTOPILOT-PROMPT.md` | כן | הכותרת אומרת "re-read every cycle". forever מזין אותו כפרומפט. הלולאה ב-git **לא** מזכירה את הקובץ; היא מזריקה פרומפט שמפנה ל-STATE |
| תור 0-9 | `NEXT-GOALS.md` פריטים [1]-[9] | כן | היסטוריה שהושלמה לפני התור הסגור ב-AUTOPILOT. אין שלב ממוספר `(0)` בקובץ |
| תור 10-26 | `AUTOPILOT-PROMPT.md` | כן | התור הסגור של הפרוטוקול. פירוט בטבלה למטה |
| תור 27-29 | **אין** | | פרוטוקול היציאה נורה אחרי 0-26. שלבים 27-29 לא כתובים. להוסיף: סעיף 4, **לפני** דגל הסיום |
| `[FINAL EXIT PROTOCOL]` | אותו קובץ, סוף | כן | אחרי ש-0-26 ירוקים: דוח, brief, tag `v1.0.0`, דגל, ואז רק אימות טסטים. **הבלוק כפול בקובץ** (שני סוכנים כתבו אותו פעמיים, 19.08). לקרוא את הראשון; לא להוסיף שלישי |
| `PROJECT-DONE.flag` | `/Users/ofir/kenyonexpress-web/PROJECT-DONE.flag` | **לא** (מכוון) | קובץ תאריך מחוץ לריפו. אחרי שהוא קיים: אסור עבודה חדשה. **`kenyon-loop.sh` לא בודק את הדגל.** הסוכן חייב לבדוק. spawner ימשיך להוליד מחזורים |

### 1.4 תור AUTOPILOT 0-29 (מפה, לא סטטוס חי)

המצביע החי הוא רק
`STATE.md`.
הטבלה הזו היא אינדקס. לא לדלג לפי הטבלה.

| # | שם | מקור | הערת תפעול |
|---|---|---|---|
| 0-9 | Cart עד integration pass | `NEXT-GOALS.md` [1]-[9] | נסגרו לפני התור ב-AUTOPILOT. פרוטוקול היציאה קורא להם חלק מ-0-26 |
| 10 | DB HARDENING | AUTOPILOT | אודיט הושלם. DDL לפרודקשן לא הורץ. יעד "0 WARN advisors" לא בר-השגה בלי להפיל RLS |
| 11 | AUTH | AUTOPILOT | הושלם 19.08. `docs/AUTH-MODEL.md` |
| 12 | PAYMENTS VERIFY | AUTOPILOT | המצביע החי ב-STATE |
| 13 | VOUCHERS VERIFY | AUTOPILOT | |
| 14 | WHATSAPP+SHARE | AUTOPILOT | |
| 15 | GEO | AUTOPILOT | מיגרציה רק אחרי אישור |
| 16 | WP IMPORT DRY-RUN | AUTOPILOT | בלי כתיבה מרחוק |
| 17 | STOREFRONT VERIFY | AUTOPILOT | compare מתחת ל-11% |
| 18 | GO/NO-GO | AUTOPILOT | tag `v1.0.0-rc1` |
| 19 | ACCOUNT AREA | AUTOPILOT | |
| 20 | SUPPLIER PORTAL | AUTOPILOT | |
| 21 | EMAIL TEMPLATES | AUTOPILOT | Resend בלבד |
| 22 | LEGAL PAGES | AUTOPILOT | נתיבי WP הקנוניים שונים משמות השלב |
| 23 | PIXEL WAVE | AUTOPILOT | אחרי ש-17 עובר |
| 24 | SEED CONTENT WAVE | AUTOPILOT | dry-run ברירת מחדל. בלי כתיבת DB בלי אישור |
| 25 | BACKUP+RECOVERY | AUTOPILOT | |
| 26 | FINAL SWEEP | AUTOPILOT | tag `v1.0.0-rc2` אם ירוק. אחר כך FINAL EXIT → `v1.0.0` |
| 27 | (אין) | | לא להמציא. להוסיף רק לפי סעיף 4 |
| 28 | (אין) | | |
| 29 | (אין) | | |

שלב שנכשל 3 ניסיונות מלאים: לתעד ב-
`OFIR-RETURN-BRIEF.md`
תחת "חסום", לדלג, להמשיך. לא לעקוף בפתרון שלא נמדד.

### 1.5 רכיבים שנראים דומים ואינם המערכת הנצחית

| קובץ | למה לא לגעת בו כתחליף |
|---|---|
| `nightwatch.sh` | 15 בדיקות, `git add -A`, push. מתנגש עם סוכן חי ועם autosave |
| `.claude/commands/auto.md` | פקודת צ'אט, לא spawner |
| `docs/RUNBOOK-OPS.md` | תפעול יומי של אתר/כסף, לא launchd |

מניעת שינה (חובה ליד הלולאה, לא במקומה):

```
caffeinate -dims
```

---

## 2. מה קורה בכל תרחיש

### 2.1 ריסטארט (Restart של המק, logout/login)

| מה מת | מה קם לבד | מה לא קם |
|---|---|---|
| כל תהליך nohup, כולל `kenyon-loop.sh` ו-`caffeinate` שעטף אותו | LaunchAgents שטעונים ל-gui של המשתמש (`com.kenyon.forever` אם loaded) | הלולאה מ-git, אלא אם forever מפעיל אותה או שה-plist מצביע עליה |
| מחזור `claude --print` באמצע משפט | כלום מהעץ. הקבצים נשארים כמו בדיסק | קומיט שלא נשמר |

אחרי עלייה: spawner **אחד**. אם forever עלה מ-launchd, **לא** להריץ שוב את פקודת ה-nohup של הלולאה.

`STATE.md` הוא נקודת ההמשך. אין "להתחיל מ-10" אחרי ריסטארט.

### 2.2 קריסה (תהליך מת, בלי ריסטארט מכונה)

| מי מת | התנהגות שנמדדה / צפויה |
|---|---|
| `claude` בתוך מחזור, הלולאה חיה | `kenyon-loop.sh`: rc≠0 → ntfy `cycle N exited rc=…` → backoff → מחזור חדש. אותו `המשך מ:` |
| `kenyon-loop.sh` מת, PID file נשאר | ההפעלה הבאה רואה PID מת, כותבת "stale pid file, taking over", ממשיכה. אם forever/watchdog מולידים בינתיים: שני spawners |
| `kenyon-forever.sh` מת | אם `com.kenyon.forever` KeepAlive=true, launchd מחיה אותו. אם הלולאה עדיין חיה: שוב שניים |
| `claude` נתקע בלי לצאת | הלולאה מחכה. אין timeout בקוד של `kenyon-loop.sh`. watchdog חיצוני הוא היחיד שיכול להרוג. בלי watchdog: סעיף 2 ב-RUNBOOK |
| שני spawners חיים | הולדה חוזרת. **עצירה מאושרת.** קודם הורגים spawners, אחר כך עודפי claude. לא הפוך |

### 2.3 מכסה נגמרת

`claude --print` יוצא עם rc≠0. הלולאה לא מסיימת את הפרויקט. היא מחכה 300 שניות, מכפילה עד שעה, שולחת ntfy, ומריצה שוב את **אותו** פרומפט.

הסוכן הבא חייב:

1. לקרוא `STATE.md` → `## המשך מ:`
2. לא לחזור על שלב שמסומן הושלם
3. אם forever מזין את `AUTOPILOT-PROMPT.md` במלואו, עדיין לציית למצביע ב-STATE (הקובץ אומר "continue from STATE.md")

אין קובץ "quota". הסימן בלוג:

```
cycle N failed rc=…, backing off
```

שקט בלי `backing off` וגם בלי `cycle starting` מעל שעתיים: זה לא מכסה, זה תקיעה.

### 2.4 חשמל נופל

כמו ריסטארט, פלוס:

- עץ git יכול להישאר dirty / merge באמצע / `MERGE_HEAD`
- קומיט שלא הספיק `git push` קיים רק מקומית
- `PROJECT-DONE.flag` לא נוצר באמצע. אם נוצר לפני הניתוק, הסוכן הבא רק מאמת טסטים
- LaunchAgents קמים אחרי login, לא ברגע חיבור החשמל (לפני שהמשתמש נכנס)

לפני שמחיים spawner אחרי הפסקת חשמל: `git status -sb` ו-`test -f .git/MERGE_HEAD`. אם יש merge פתוח: לא להוליד סוכן שני. לסיים את ה-merge או לתעד ב-STATE ולעצור (זה אחד מארבעת הקריטיים אם כבר רץ סוכן אחר).

---

## 3. פקודת אבחון אחת לכל בעיה

Terminal על המק. כל שורה היא הפקודה היחידה לאותו כשל. ירוק = התסמין לא קיים.

| בעיה | פקודה אחת |
|---|---|
| הלולאה מתה | `pgrep -fl kenyon-loop.sh` |
| forever חי (spawner שני) | `pgrep -fl kenyon-forever.sh` |
| שני spawners יחד | `pgrep -fl 'kenyon-loop.sh|kenyon-forever.sh'` |
| יותר מדי claude על העץ | `pgrep -fl 'claude --dangerously'` |
| מכסה / backoff | `grep -E 'backing off|cycle .* starting|rc=' ~/kenyon-loop.log \| tail -n 20` |
| לולאה שותקת | `python3 -c 'import os,time; p=os.path.expanduser("~/kenyon-loop.log"); print("age_sec", int(time.time()-os.path.getmtime(p)) if os.path.exists(p) else "NO_LOG")'` |
| דגל עצירה נשכח | `ls -l ~/.kenyon-loop.stop 2>/dev/null \|\| echo 'no stop file'` |
| PID מיושן | `cat ~/.kenyon-loop.pid 2>/dev/null; kill -0 "$(cat ~/.kenyon-loop.pid 2>/dev/null)" 2>/dev/null && echo alive \|\| echo dead-or-missing` |
| LaunchAgents לא טעונים | `launchctl list \| grep -i kenyon` |
| plist חסר / שבור | `ls -la ~/Library/LaunchAgents/com.kenyon.*.plist 2>/dev/null \|\| echo 'no kenyon plists'` |
| revive לא נמצא | `ls -la /Users/ofir/kenyonexpress-web/kenyon-revive* 2>/dev/null \|\| echo 'no revive script'` |
| דגל סיום קיים | `cat /Users/ofir/kenyonexpress-web/PROJECT-DONE.flag 2>/dev/null \|\| echo 'no PROJECT-DONE.flag'` |
| מצביע התור קפא | `git -C /Users/ofir/kenyonexpress-web/kenyonexpress log -1 --format='%h %ci %s' && grep -n '^## המשך מ:' /Users/ofir/kenyonexpress-web/kenyonexpress/STATE.md` |
| merge פתוח אחרי חשמל | `test -f /Users/ofir/kenyonexpress-web/kenyonexpress/.git/MERGE_HEAD && echo MERGE_OPEN \|\| echo no-merge` |
| FINAL EXIT כפול בקובץ | `grep -c '\[FINAL EXIT PROTOCOL\]' /Users/ofir/kenyonexpress-web/kenyonexpress/AUTOPILOT-PROMPT.md` |
| המכונה נרדמת | `pgrep -fl 'caffeinate -dims'; pmset -g \| grep -i sleep` |
| autosave / nightwatch דוחפים באמצע עבודה | `pgrep -fl 'nightwatch.sh|autosave'` |

צפי ל-`grep -c FINAL EXIT`: **1**. נמדד 2 אחרי הכפלה. לא 0 (חסר פרוטוקול) ולא 3+.

---

## 4. איך מוסיפים שלב לתור בלי לעצור את הלולאה

לא
`touch ~/.kenyon-loop.stop`,
לא
`pkill`,
לא הפעלה מחדש של forever, לא סוכן קוד שני.

### 4.1 מה לערוך

1. **`AUTOPILOT-PROMPT.md`**: שורה חדשה **אחרי** `(26)` ו-**לפני** `[FINAL EXIT PROTOCOL]`. המספר הבא הפנוי הוא 27 (28, 29, …). אותה תבנית: מספר, שם, יציאה מדידה.
2. **`STATE.md`**: אם המצביע החי עדיין על שלב קודם, **לא** להחליף את `## המשך מ:`. להוסיף את השלב לרשימת התור מתחת, בסוף. אם כל 10-26 כבר ירוקים ועדיין אין דגל, אפשר להצביע על 27.
3. **לא לגעת** בפרומפט הקשיח בתוך
   `kenyon-loop.sh`
   אלא אם רוצים לשנות את ההתנהגות של **כל** מחזור עתידי (זה לא הוספת שלב, זה שינוי מערכת).
4. **לא ליצור** `PROJECT-DONE.flag` אם הוספת 27+. הדגל אומר "התור נגמר".
5. **לא** להוסיף בלוק `[FINAL EXIT PROTOCOL]` נוסף. לעדכן את הסף במקום ("When ALL steps 0-N") בשני העותקים אם עדיין כפולים, או למחוק את הכפיל אחרי גיבוי git.

### 4.2 commit בלי להעיר את השכנים

```bash
cd /Users/ofir/kenyonexpress-web/kenyonexpress
git add AUTOPILOT-PROMPT.md STATE.md
git commit -m "docs(autopilot): queue step 27: <short English name>"
git push origin phase5/homepage
```

המחזור שרץ עכשיו ממשיך עם הפרומפט שכבר בזיכרון. הוא יראה את STATE אחרי שהוא מסיים goal (טקס הסיום כולל קריאת המצביע הבא) או במחזור הבא.

אין `git pull` בתוך `kenyon-loop.sh`. העריכה חייבת להיות **באותו worktree** שה-spawner רץ עליו, או שהמחזור הבא לא יראה אותה עד pull ידני.

### 4.3 מה אסור כדי "שיקלוט מהר"

- לפתוח Cursor agent שני על אותו נתיב.
- להריץ `kenyon-forever.sh` נוסף.
- להריץ `nightwatch.sh` / autosave שעושים `git add -A`.
- לשנות את המצביע ל-27 בזמן ש-(12) חי. הסוכן יקפוץ בתור.

### 4.4 אחרי שהשלב החדש נגמר

אותו טקס כמו כל goal: טסטים, commit, push, `המשך מ:` הבא, ntfy, מיד הבא. אחרי האחרון שקבעת: FINAL EXIT, tag, דגל מחוץ לריפו.

---

## 5. כיבוי והדלקה בטוחים (רק כשצריך)

סדר כיבוי כשיש שני spawners (מתוך המדידה ב-STATE, לא להעתיק PID ישנים):

1. לעצור spawners (loop + forever).
2. להשאיר לכל היותר `claude` אחד על הנתיב. לא להרוג סשן אינטראקטיבי בלי `-p`.
3. `pgrep -fl 'kenyon-loop.sh|kenyon-forever.sh'` ריק.
4. `pgrep -fl 'claude --dangerously'` לכל היותר אחד.
5. להדליק **אחד**: או nohup של הלולאה, או forever מ-launchd, לא שניהם.
6. אם `com.kenyon.forever` טעון, nohup של הלולאה אסור.

הדלקת לולאה בלבד (כש-forever **לא** טעון):

```bash
rm -f ~/.kenyon-loop.stop
cd /Users/ofir/kenyonexpress-web/kenyonexpress
nohup caffeinate -dims ./kenyon-loop.sh >> ~/kenyon-loop.log 2>&1 &
```

צפי בלוג: `loop started` ואז `cycle N starting`. ntfy: `kenyon-loop: started`.

---

## מסמכים קשורים

| קובץ | מתי |
|---|---|
| `docs/RUNBOOK-OPS.md` | בוקר, אתר, Cardcom, Vercel |
| `kenyon-loop.sh` | מקור האמת להתנהגות backoff / stop / pid |
| `AUTOPILOT-PROMPT.md` | תור 10-26 + FINAL EXIT |
| `STATE.md` | מצביע חי + מדידת התנגשות spawners |
| `CLAUDE.md` | ארבע עצירות, טקס סיום goal |
