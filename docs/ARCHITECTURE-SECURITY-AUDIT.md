# ARCHITECTURE-SECURITY-AUDIT.md

תוכנית **ביקורת אבטחה** מעשית ל-KenyonExpress: מה בודקים, איך, באיזו תדירות, ואיך מתעדים ממצאים.

Status: BINDING · worktree

```
/Users/ofir/kenyonexpress-web/ke-arch
```

branch:

```
arch/docs-queue
```

Date: 2026-07-31 (rev A)  
Scope: docs בלבד. הביצוע בפועל דרך שערי Go-Live ו-ops.  
Companions: `ARCHITECTURE-SECURITY-COMPLIANCE.md` (המדיניות והמודל), `ARCHITECTURE-GO-LIVE-CHECKLIST.md` (שערי S), `ARCHITECTURE-INCIDENT-RESPONSE.md`, `ARCHITECTURE-ENV-SECRETS.md`.

חלוקת אחריות בין המסמכים: COMPLIANCE אומר **מה הכלל**; המסמך הזה אומר **איך מוודאים שהכלל מתקיים בפועל**, עם פקודות ותוצאות צפויות.

---

## 0. עקרונות הביקורת

1. ביקורת בלי ראיה = לא בוצעה. כל בדיקה מסתיימת בפלט שמור (לוג, צילום, קובץ) עם timestamp.
2. בודקים כמו תוקף: עם anon key, עם session של משתמש רגיל, עם session של ספק. אף בדיקה לא רצה רק כ-service role.
3. ממצא לא נסגר בצ'אט. הוא נרשם ברישום הממצאים (§6), מקבל דרגה ו-SLA, ונסגר עם commit או שינוי תצורה מזוהה.
4. הביקורת לא נוגעת בייצור בכתיבה. בדיקות הרסניות (rate limit, brute force) רצות על preview/staging בלבד.

---

## 1. לוח תדירויות

| ביקורת | תדירות | טריגר נוסף |
|---|---|---|
| RLS probes (§2) | לפני כל merge של מיגרציה עם policy | שינוי סכימה |
| סריקת client bundle לסודות (§3) | כל deploy production | שינוי env vars |
| Headers + TLS (§4) | חודשי | שינוי middleware / frame policy |
| Dependency audit (§5) | שבועי (אוטומטי) | CVE מתפרסם בחבילת כסף |
| ביקורת הרשאות אדמין וספקים | חודשי | עזיבת עובד / ספק |
| Full audit (כל הסעיפים) | לפני Go-Live, ואז רבעוני | אחרי incident SEV1/SEV2 |

---

## 2. RLS probes (הבדיקה החשובה ביותר)

### 2.1 מתודולוגיה

שלושה הקשרים, לכל אחד סט שאילתות זהה:

```
1. anon (בלי session)
2. authenticated: משתמש רגיל A (יש לו orders/vouchers משלו)
3. authenticated: משתמש B מנסה את הנתונים של A
4. supplier member: מנסה נתוני ספק אחר
```

### 2.2 מטריצת ציפיות

| טבלה | anon | user B על נתוני A | ספק זר |
|---|---|---|---|
| `orders` | 0 שורות | 0 שורות | 0 שורות |
| `order_items` | 0 | 0 | רק שורות של הספק שלו |
| `vouchers` | 0 | 0 | רק אם מיועדים למימוש אצלו, לפי policy |
| `wallet_accounts` / `wallet_entries` | 0 | 0 | 0 |
| `payment_tokens` | 0 | 0, וגם A עצמו בלי עמודת `cardcom_token` | 0 |
| `carts` | רק דרך session token של עצמו | 0 | 0 |
| `profiles` | 0 | 0 | 0 |
| `products` published | קריאה מותרת | קריאה מותרת | קריאה מותרת |
| `suppliers` | שדות תצוגה בלבד (אם בכלל) | כנ"ל | רק את עצמו מלא |

### 2.3 ביצוע

Supabase > SQL Editor (עם `set role` מתאים) או סקריפט עם anon key:

```sql
-- כ-user B (JWT של B), מנסה הזמנה של A:
select id, total_agorot from orders where user_id = '<A_UUID>';
-- צפי: 0 rows, לא שגיאה ולא נתונים
```

תוצאה עם שורות = ממצא CRITICAL, עצירת merge.

---

## 3. סריקת סודות ו-client bundle

### 3.1 Bundle

Terminal (אחרי build ייצור):

```bash
grep -RIl "service_role\|SUPABASE_SECRET\|CARDCOM.*PASSWORD\|RESEND_API" .next/static && echo LEAK || echo CLEAN
```

צפי: CLEAN. כל hit = ממצא CRITICAL.

### 3.2 Git history

```bash
git log -p --all -S "SUPABASE_SECRET_KEY=" -- '*.env*' | head
```

סוד שהיה אי פעם ב-git נחשב שרוף: rotation חובה, לא מחיקה מההיסטוריה בלבד.

### 3.3 ריכוז ההגדרות

השוואת רשימת env בפועל (Vercel) מול המטריצה ב-`ARCHITECTURE-ENV-SECRETS.md`. כל משתנה שלא במטריצה = ממצא (או עדכון מטריצה או מחיקה).

---

## 4. Headers, TLS ושטח HTTP

Terminal:

```bash
curl -sI https://kenyonexpress.co.il | grep -i "strict-transport\|x-frame\|content-security\|x-content-type"
```

| בדיקה | צפי |
|---|---|
| `frame-ancestors` / `X-Frame-Options` | חסום, למעט `/checkout/return` לפי frame policy |
| `X-Content-Type-Options` | `nosniff` |
| HTTP → HTTPS | 301/308 |
| CORS על `/api/*` | לא `*` על endpoints עם credentials |
| Webhook Cardcom | דוחה POST בלי secret/אימות (בדיקה על preview) |
| `/scan` | דורש session ספק; anon מקבל redirect, לא דף |

---

## 5. תלויות (supply chain)

```bash
pnpm audit --prod
```

| דרגת CVE | חבילת כסף (supabase, zod, next, payment path) | חבילה אחרת |
|---|---|---|
| Critical | תיקון לפני deploy הבא | 7 ימים |
| High | 7 ימים | 30 יום |
| Moderate ומטה | לפי שיקול | backlog |

חבילה חדשה נכנסת ל-package.json רק דרך המנהל (pnpm add), לא בהעתקת גרסה ידנית, כדי לקבל resolution ו-lockfile עקביים.

---

## 6. רישום ממצאים

קובץ אחד מצטבר:

```
docs/security-findings.md
```

פורמט שורה:

| שדה | דוגמה |
|---|---|
| ID | SEC-2026-001 |
| תאריך גילוי | 2026-07-31 |
| דרגה | CRITICAL / HIGH / MEDIUM / LOW |
| משטח | RLS / bundle / headers / deps / הרשאות |
| תיאור | "user B קורא vouchers של A דרך policy X" |
| SLA | CRITICAL: לפני merge או תוך 24ש בייצור |
| סגירה | commit hash / שינוי תצורה + תאריך + מי אימת |

כלל: ממצא CRITICAL פתוח = `CHECKOUT_ENABLED=false` אם הוא ניתן לניצול בייצור על מסלול כסף.

---

## 7. ביקורת הרשאות תקופתית

| פריט | בדיקה חודשית |
|---|---|
| חשבונות אדמין | רשימה מלאה; כל אחד עדיין מוצדק; 2FA פעיל |
| `supplier_members` | אין members לספקים terminated |
| Supabase Dashboard | רק הבעלים; אין invite ישן פתוח |
| Vercel team | אותו כלל |
| GitHub deploy keys / PATs | תוקף ותחולה מינימלית |
| מפתחות API (Resend, Cardcom, R2) | rotation אחרון מתועד; מפתח לא בשימוש נמחק |

---

## 8. Pentest לפני Go-Live (scope מינימלי)

לא חובה חיצוני ביום 1, אבל חובה שמישהו שאינו הכותב יריץ את התרחישים:

1. שינוי מחיר בצד לקוח (עריכת payload של add-to-cart / checkout) ואימות שהחיוב נגזר רק מהשרת.
2. Replay של webhook תשלום מוצלח פעמיים; צפי: voucher אחד.
3. QR מזויף וגם QR תקין של voucher שכבר מומש; צפי: דחייה בשני המקרים.
4. ניסיון גישה ל-`/admin` ו-`/supplier` עם משתמש רגיל.
5. הזרקת `platform_percent` מהדפדפן על עגלה; צפי: השרת מתעלם וכותב מקריאה טרייה של המוצר.
6. שימוש ב-token כרטיס של משתמש אחר (`token_id` זר ב-checkout); צפי: דחייה לפני חיוב.

כל תרחיש: תוצאה + ראיה ברישום הממצאים, גם כשהתוצאה PASS.

---

## 9. Out of scope

- תקינת PCI מלאה מעבר למינימיזציה שמתועדת ב-COMPLIANCE (הכרטיס חי אצל Cardcom)
- Bug bounty ציבורי
- SOC2 / ISO27001

---

## 10. Revision

| Date | Change |
|---|---|
| 2026-07-31 | rev A: תוכנית ביקורת מלאה: RLS probes, bundle, headers, deps, רישום ממצאים, pentest scope |
