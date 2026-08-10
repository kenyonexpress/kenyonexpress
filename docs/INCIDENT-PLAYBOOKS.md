# פלייבוקי תקריות (6 תרחישים)

צעדים מדויקים למפעיל יחיד. אין NOC. סדר קבוע בכל תרחיש: זיהוי → עצירת דימום → תקשורת ללקוחות → שחזור.

Status: **RUNBOOK** · עודכן: 2026-08-10  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-lifecycle`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מסמכים קשורים:

```
docs/SLA-MONITORING.md
docs/ARCHITECTURE-OBSERVABILITY.md
docs/RUNBOOK-PRODUCTION.md
docs/RUNBOOK-LAUNCH-DAY.md
docs/BACKUP-RECOVERY.md
docs/ARCHITECTURE-FRAUD-PREVENTION.md
docs/CUSTOMER-SUPPORT-PLAYBOOK.md
docs/CONTRADICTIONS.md
```

כללים חוצי תרחישים:

| כלל | פירוט |
|---|---|
| כסף | אין הבטחות Escrow / נאמן / J5 / "שחרור held" |
| Kill switch | `CHECKOUT_ENABLED=false` (או מנגנון זהה ב-env) לפני ניסויים ארוכים |
| ראיות | לוגים + Sentry + שורות DB; לא צילומי מסך בלבד |
| תקשורת | עברית; באנר באתר + סטטוס קצר בוואטסאפ/מייל לתמיכה אם יש תור |
| אחרי | רשום ב-`STATE.md` + postmortem קצר (מה, מתי, מה למנוע) |

---

## 1. Cardcom down באמצע יום

**SEV:** 1 · **יעד תגובה:** ≤ 15 דק'

### זיהוי

- Sentry / ntfy: כשל `submitCheckout`, redirect ל-LP, או `GetLpResult` timeout.
- עלייה ב-`checkout/failed` או הזמנות `pending` בלי finalize.
- בדיקה ידנית: Terminal → נסיון תשלום sandbox/prod (בלי לגמור כרטיס אמיתי אם אפשר status page של Cardcom).

### עצירת דימום

1. Vercel → Environment Variables: הגדר `CHECKOUT_ENABLED=false` (Production) → Redeploy או restart לפי הנוהל ב-

```
docs/RUNBOOK-PRODUCTION.md
```

2. אל תמחק הזמנות `pending`; אל תריץ refund המוני בלי audit.
3. עצור קמפיינים שמזרימים ל-checkout (באנר / בוסט ממומן) עד ירוק.

### תקשורת ללקוחות

באנר / הודעת קופה:

> התשלום באתר לא זמין זמנית בגלל תקלה אצל ספק הסליקה. העגלה נשמרת. נעדכן כשהתשלום חוזר.

תמיכה: לא לבקש צילום CVV; להפנות לנסות שוב אחרי ההודעה על חזרה.

### שחזור

1. אמת מול Cardcom ש-API/LP חיים.
2. החזר `CHECKOUT_ENABLED=true` רק אחרי smoke: יצירת הזמנת בדיקה → return → `GetLpResult` → סטטוס paid צפוי.
3. סרוק הזמנות stuck מאז תחילת התקלה; finalize ידני רק לפי נוהל Cardcom + audit.
4. Postmortem: האם חסר מעגל health על Cardcom.

---

## 2. Supabase degraded

**SEV:** 1 אם auth/DB כותבים נכשלים; 2 אם רק latencies · **יעד:** ≤ 15 דק' ל-SEV1

### זיהוי

- Sentry: `Postgres` / Supabase client timeouts, 5xx מ-API routes.
- לוח Supabase: status, CPU, connections, replication lag.
- סימפטום: login נכשל, עגלה לא נשמרת, redeem RPC נכשל.

### עצירת דימום

1. אם כתיבות נכשלות או data-loss risk: `CHECKOUT_ENABLED=false`.
2. אל תריץ מיגרציות / MCP apply באמצע degradation.
3. אם רק read-heavy: שקול להוריד כרונים כבדים (index rebuild, analytics batch) מ-Vercel Cron.
4. אל תמחק project; אל תעשה restore בלי אישור מפורש (ראה BACKUP-RECOVERY).

### תקשורת ללקוחות

> האתר חווה האטה / תקלת מסד נתונים. חלק מהפעולות (תשלום, התחברות, סריקה) עלולות להיכשל. אנחנו על זה.

אם auth מת: הוסף שסריקת ספק עלולה להיחסם עד חזרה.

### שחזור

1. המתן לייצוב בלוח Supabase או פנה לתמיכתם עם project ref.
2. אחרי ירוק: smoke לפי סדר: `/api/health` → login → קריאת מוצר → (אופציונלי) checkout כבוי עדיין → redeem staging אם יש.
3. רק אם איבוד נתונים מוכח: נוהל PITR מ-

```
docs/BACKUP-RECOVERY.md
```

עם RPO/RTO מתועדים.
4. החזר checkout אחרי smoke כתיבה.

---

## 3. קופונים לא נסרקים ארצית

**SEV:** 2 (או 1 אם כל הרשת בשעות שיא) · **יעד:** ≤ 1 שע' עסקים / מיידי אם כסף תקוע אצל לקוחות במקום

### זיהוי

- דיווחי ספקים מרובים + Sentry על `/api/supplier/vouchers/redeem` או RPC `redeem_voucher`.
- לוח: שיעור `invalid_signature` / `already_redeemed` / 5xx חריג.
- בדיקה: QR תקין ידוע בסביבת staging או קוד בדיקה פנימי.

### עצירת דימום

1. אם חתימת QR שבורה אחרי deploy: **Instant Rollback** ל-Vercel deployment קודם ירוק (קוד בלבד).
2. אם Supabase RPC/RLS: אל תפתח מדיניות `true` לכולם; תקן policy ממוקדת.
3. השהה הודעות שיווק שמביאות לקוחות לעסקים עד שיש מסלול ידני (קוד מספרי) או תיקון.
4. תעד רשימת `voucher_id` שנכשלו (בלי לשתף קודים פומבית).

### תקשורת ללקוחות

ללקוחות:

> יש תקלה זמנית בסריקת קופונים. בקשו מהעסק להקליד את הקוד המספרי, או המתינו לעדכון. הקופון שלכם לא נמחק.

לספקים (וואטסאפ/מייל ספקים פעילים):

> הסריקה האוטומטית משובשת. השתמשו בהקלדת קוד ידנית אם זמינה במסך הסריקה. אל תסמנו מימוש מחוץ למערכת.

### שחזור

1. אמת redeem בודד + ניסיון כפול (חייב 409 / already_redeemed על השני).
2. אם הייתה חלון שבו סריקות "הצליחו" פעמיים: עצור והפעל FRAUD playbook; אל תמחק שורות redemption.
3. הודעת "חזרנו" לספקים ולבאנר.
4. Postmortem: deploy / secret rotation / clock skew.

---

## 4. דף בית 500

**SEV:** 2 (1 אם כל הדומיין 500) · **יעד:** ≤ 15–60 דק'

### זיהוי

- Vercel: error rate על `/` או Server Component crash ב-Sentry.
- בדיקה: `curl -I https://kenyonexpress.co.il/` → 5xx; Preview עשוי להיות תקין בזמן ש-Production שבור.

### עצירת דימום

1. Vercel → Deployments → **Instant Rollback** ל-Production האחרון הירוק.
2. אם ה-500 מ-DB: טפל כ-Supabase degraded (תרחיש 2); rollback קוד לא יעזור לבד.
3. אל תדחוף "hotfix עיוור" מעל production בלי Preview ירוק.

### תקשורת ללקוחות

אם נמשך > 5 דקות אחרי זיהוי:

> האתר לא זמין זמנית. אנחנו משחזרים גרסה יציבה. נסו שוב בעוד מספר דקות.

ערוצים חברתיים: אותה משפט; בלי האשמת ספקים בשמות.

### שחזור

1. אחרי rollback: soft navigate לדף הבית + מוצר + עגלה.
2. מצא root cause ב-Sentry (release + stack); תקן ב-Preview → merge → deploy מבוקר.
3. אם ISR/cache רעיל: purge לפי נוהל Vercel/CDN אם קיים; תעד.
4. רשום ב-STATE אם זה סיסטמי (תלות חסרה ב-env אחרי deploy).

---

## 5. דליפת env var

**SEV:** 1 · **יעד:** מיידי (דקות)

חשודים: מפתח ב-GitHub, לוג Vercel, צ'אט, סקרין-שוט, bundle לקוח (`NEXT_PUBLIC_*` הוא ציבורי בכוונה; דליפה = סודות שרת).

### זיהוי

- התראה מ-GitHub secret scanning / דוח חיצוני / מפתח ב-commit.
- הופעת `SUPABASE_SERVICE_ROLE_KEY`, `CARDCOM_API_PASSWORD`, `CRON_SECRET`, `VOUCHER_QR_SECRET`, וכו' מחוץ ל-Vercel.

### עצירת דימום

1. **סובב מיד** את הסודות שנחשפו (Supabase service role, Cardcom API password, webhook/QR secrets, R2, Resend, Sentry auth). אל תדחה ל-"אחרי הסופ״ש".
2. הסר את הסוד מהמקום שדלף (force אינו תחליף לסיבוב אם כבר נדחף ל-remote).
3. Vercel: עדכן Environment Variables בערכים החדשים → Redeploy Production.
4. אם נדלף service role: בדוק לוגים לשימוש חריג; שקול pause פרויקט רק אם יש exfiltration פעיל.
5. `CHECKOUT_ENABLED=false` עד סיבוב Cardcom + smoke.

### תקשורת ללקוחות

אם אין אינדיקציה לגישה לנתוני לקוחות:

> ביצענו סיבוב מפתחות אבטחה כחלק מתחזוקה דחופה. אין צורך בפעולה מצדכם כרגע.

אם יש חשד לגישה ל-PII: הודעה לפי LEGAL/GDPR (לא לנסח לבד בלי המסמך המחייב); תעד זמן גילוי.

פנימית: רשום מי קיבל את הסוד ובאיזה ערוץ.

### שחזור

1. Smoke: login, checkout sandbox/disabled path, redeem עם סוד QR חדש (סוד ישן ב-`VOUCHER_QR_SECRET_PREVIOUS` רק לחלון קצר מתועד).
2. סרוק repo להיסטוריית הסוד; הוסף ל-`.gitignore` / secret scanning אם חסר.
3. Postmortem חובה ב-STATE + מניעה (מי הרשה הדפסה ללוג).

---

## 6. מתקפת bots על checkout

**SEV:** 2→1 אם כסף/rate-limit נשבר · **יעד:** ≤ 15–60 דק'

### זיהוי

- Vercel Analytics / logs: spike ל-`/checkout`, `submitCheckout`, יצירת הזמנות ריקות.
- Cardcom: ניסיונות LP חריגים; rate-limit errors.
- Sentry: עומס / timeouts בלי עלייה אורגנית בקטלוג.

### עצירת דימום

1. הפעל / החזק rate limit על checkout ו-API הזמנות (אל תשאיר fail-open אם ידוע כחוב).
2. זמנית: `CHECKOUT_ENABLED=false` אם העומס מאיים על DB או על מסגרת Cardcom.
3. חסום ASN / IP ranges ב-Vercel Firewall / WAF אם זמין; אל תחסום את כל ישראל.
4. כבה זמנית הודעות שיווק שמזין בוטים (טופס פתוח בלי captcha).

### תקשורת ללקוחות

רק אם checkout כבוי או איטי מאוד:

> עקב עומס חריג הושהה התשלום זמנית. נסו שוב בקרוב. העגלה נשמרת.

אל תפרסם פרטי חסימות IP.

### שחזור

1. אמת שבוטים ירדו; לקוח אמיתי עובר עד redirect Cardcom.
2. החזר checkout; השאר rate limit הדוק יותר כברירת מחדל אם אפשר.
3. סרוק הזמנות spam `pending`: סגור/בטל לפי נוהל בלי לגעת בהזמנות לקוח אמיתי.
4. הוסף לרשימת FRAUD: velocity על יצירת הזמנות (קישור ל-

```
docs/ARCHITECTURE-FRAUD-PREVENTION.md
```

).

---

## טבלת סיכום

| # | תרחיש | Kill switch טיפוסי | Rollback קוד? | Restore DB? |
|---|---|---|---|---|
| 1 | Cardcom down | checkout off | לא (ספק חיצוני) | לא |
| 2 | Supabase degraded | checkout off | רק אם באג אפליקציה | רק אם אובדן מוכח |
| 3 | Redeem ארצי | לעיתים | כן אם רגרסיית deploy | נדיר |
| 4 | בית 500 | לא חובה | כן ראשון | לא |
| 5 | דליפת env | checkout off + rotate | redeploy אחרי rotate | לא |
| 6 | Bots checkout | checkout off + rate limit | לא אלא אם באג | לא |

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-08-10 | שישה פלייבוקים: Cardcom, Supabase, redeem, בית 500, env leak, bots |
