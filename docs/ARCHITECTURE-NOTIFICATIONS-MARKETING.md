# ארכיטקטורה: התראות שיווק והסכמה

ערוצי שיווק, הפרדה מטרנזקציוני, והסכמה מתועדת (חוק ספאם 30א).

Status: **BINDING** · עודכן: 2026-08-12  
Scope: `arch/docs-batch-2` · batch #28/50  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מסמכים קשורים:

```
docs/ARCHITECTURE-NOTIFICATIONS.md
docs/ARCHITECTURE-EMAIL-TEMPLATES.md
docs/ARCHITECTURE-LEGAL-COMPLIANCE.md
docs/ARCHITECTURE-CART-GUEST.md
docs/CONTRADICTIONS.md
```

---

## 0. המלצה אחת

**הפרדה קשיחה: טרנזקציוני תמיד (לפי העדפות ערוץ); שיווקי רק עם opt-in מתועד ב-`consent_events` + unsubscribe בכל הודעה.**  
דגל `is_marketing` על שורת outbox הוא ההפרדה בדאטה, לא רק בקוד.

---

## 1. הכרעות

| # | הכרעה |
|---|---|
| M1 | שיווק ברירת מחדל **false** לכל ערוץ (`marketing_email` / sms / whatsapp / push). |
| M2 | ראיה משפטית: `consent_events` append-only (מקור, נוסח, IP, זמן). |
| M3 | חריג "לקוח קיים" ב-30א(ג): **לא מנוצל**. רק opt-in מפורש. |
| M4 | מייל: Resend; סאב-דומיין נפרד יעד (`txn.` / `mkt.`) כדי שתלונות שיווק לא יהרסו deliverability. |
| M5 | WhatsApp שיווקי: רק אחרי `marketing_whatsapp` + תבנית Meta מאושרת (עתידי עד הפעלה). |
| M6 | SMS שיווקי: **כבוי** בשלב זה. |
| M7 | Quiet hours לשיווק בלבד: 09:00–21:00 Asia/Jerusalem; בלי שיווק בשבת (שמרני). |
| M8 | Frequency cap: ≤1 שיווקי/יום, ≤3/שבוע פר משתמש. |
| M9 | בדיקת הסכמה גם ב-enqueue וגם ב-send-time; אחרי opt-out → `skipped`. |

---

## 2. סיווג הודעות

| הודעה | סיווג | ברירת מחדל |
|---|---|---|
| `order_paid`, קופון מוכן, מימוש, החזר | טרנזקציוני | דולק |
| תזכורת פקיעה 48h (בלי דילים) | טרנזקציוני (ניתן לכיבוי) | דולק |
| עגלה נטושה | **שיווקי** | כבוי |
| win-back / ניוזלטר / ירידת מחיר | **שיווקי** | כבוי |

כלל אצבע: אם המטרה לגרום לרכישה חדשה, זו פרסומת. תזכורת פקיעה נשארת שירות רק בלי תוכן קידומי.

---

## 3. ערוצים

| ערוץ | שיווק | הערות |
|---|---|---|
| email | כן (opt-in) | subject מתחיל ב-"פרסומת"; List-Unsubscribe + One-Click |
| in-app | לא לשיווק המוני | פעמון לטרנזקציוני |
| push | כן (opt-in נפרד) | בלי push שיווקי בלי הרשאת OS + preference |
| whatsapp | עתידי | Meta Cloud API; לא broadcast בלי תבנית+consent |
| sms | לא (שלב זה) | רק OTP / fallback קריטי |

אין Make/Zapier. אין רשימות קנויות.

---

## 4. הסכמה ו-unsubscribe

### `consent_events` (חוזה)

```text
user_id, channel (email|sms|whatsapp|all),
topic (marketing|order_updates|…),
action (opt_in|opt_out),
source (account_page|checkout|unsubscribe_link|complaint_webhook|…),
wording_version, ip, user_agent, created_at
```

- כתיבה דרך RPC / service role בלבד. אין UPDATE/DELETE.
- שינוי מעדכן `user_notification_preferences` באותה TX.

### הסרה

| ערוץ | מנגנון |
|---|---|
| email | קישור חתום בלי login + כותרות List-Unsubscribe |
| whatsapp | STOP / "הסר" ב-webhook (כשיופעל) |
| complaint | bounce/complaint → suppression + opt-out שיווקי |

דף אישור: "הוסרת. הודעות שירות על הזמנות וקופונים ימשיכו."

---

## 5. מסעות (מינימום)

| Journey | תנאי | הערות |
|---|---|---|
| `abandoned_cart` | cart עם `profile_id`, 1h ואז 24h | רק opt-in; מת אחרי paid; dedupe לפי cart+עדכון |
| `winback` | paid אחרון >90 יום | ≤ פעם ברבעון; dedupe `winback:{user}:{YYYY-Qn}` |
| `coupon_expiry_*` | נכס שנרכש | טרנזקציוני; לא חלק ממכסת שיווק |

אורח בלי חשבון: אין דיוור שיווקי חוקי (אין ערוץ הסכמה).

---

## 6. ציות 30א (כיוון הנדסי)

**[דורש עו״ד]** לפני מדיניות חיצונית.

| דרישה | מימוש |
|---|---|
| הסכמה מראש | preferences false + consent_events |
| סימון פרסומת | prefix בתבנית שיווקית |
| זהות מפרסם | footer: שם, ח.פ., כתובת |
| הסרה פשוטה | §4 |
| תיעוד | append-only |

---

## 7. Acceptance

- [ ] אין enqueue שיווקי בלי preference + consent בתוקף
- [ ] Unsubscribe נאכף ב-send-time
- [ ] Quiet hours + frequency caps לשיווק בלבד
- [ ] טרנזקציוני לא נחסם עקב opt-out שיווקי
- [ ] תבניות שיווק: "פרסומת" + הסרה + RTL

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-08-12 | batch #28/50: ריענון BINDING ממוקד (ערוצים + consent) |
