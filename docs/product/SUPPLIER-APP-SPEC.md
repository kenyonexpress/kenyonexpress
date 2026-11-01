# מפרט אפליקציית ספק (סורק PWA)

Status: DRAFT · docs only  
Live routes: `/scan`, `/supplier/scan`, `/supplier/login`  
Canonical redeem: RPC `redeem_voucher` (SECURITY DEFINER), QR `KEV1.<body>.<mac>`  
Money: אגורות. קופון: הפלטפורמה שומרת את מחיר הקופון שנגבה באתר. הספק גובה **יתרה בקופה** אחרי מסך ירוק. אין Escrow. אין payout על שורת קופון.

Companion: `docs/product/SUPPLIER-ONBOARDING-HE.md`, `docs/support/SUPPLIER-FAQ-HE.md`, `docs/ARCHITECTURE-COUPON-REDEMPTION.md`, `docs/ARCHITECTURE-PWA.md`.

---

## 0. מה חי ב-HEAD מול מה במפרט

| נושא | חי היום | מפרט v2 (אחרי יציבות מימוש) |
|---|---|---|
| סריקה | `ScanClient`: שלבים `input` → `confirm` (lookup קריאה בלבד) → `result` (POST redeem) | אותו חוזה |
| מצלמה | `BarcodeDetector` אם קיים, אחרת הקלדה | חובה להשאיר הקלדה תמיד |
| אופליין | **אין תור.** בלי רשת אין lookup ואין redeem | תור **בדיקות** בלבד, לא שריפה |
| PWA | storefront installable; סורק אמור להישאר PWA לעד | manifest ייעודי לסורק, בלי קאש HTML מותאם אישית |
| דוחות | CSV / מסכי פורטל לפי מה שקיים | אותם מספרים, בלי GMV פלטפורמה |

כסף ומימוש תמיד בשרת. UI אופליין הוא מייעץ בלבד.

אין לקאש HTML של `/scan`, `/supplier/**`, `/checkout`, `/account`.

---

## 1. סורק PWA

### 1.1 התקנה

- "הוסף למסך הבית" על iOS / Android.
- `theme-color` `#fed700`.
- שם: "קניון Express סריקה" (לא חנות הלקוח).
- אייקון נפרד מהחנות כדי שקופאי לא ייכנס לסל לקוח.

### 1.2 הרשאות מכשיר

- מצלמה רק במסך הסריקה, אחרי מחווה.
- בלי מיקום חובה למימוש.
- בלי התראות שיווקיות. תפעול (כשל מערכת) אופציונלי אחרי v5.1.0.

### 1.3 שלושת השלבים (מחייב, כבר בקוד)

1. **input.** מצלמה או שדה קוד. `parseScanInput` מקבל QR או 10 תווים.
2. **confirm.** `GET/POST lookup` קורא, לא כותב. מציג: שם דיל, יתרה לגבייה (`remaining_amount_due_agorot`) בטיפוגרפיה הגדולה, תוקף, שם לקוח אם יש. בלי יתרה אל תגבו "ניחוש".
3. **result.** POST `/api/supplier/vouchers/redeem` עם `idempotency_key` חדש לכל כוונת מימוש (לא לכל retry רשת של אותו ניסיון). תשובה `replayed: true` = אותו מימוש, לא כפל.

מסך ירוק = ה-UPDATE המותנה החזיר שורה. צילום מסך ירוק ישן אינו מימוש.

---

## 2. תור אופליין (spec, לא מיושם)

### 2.1 מה מותר בתור

- שמירת **טיוטות סריקה**: הקוד שקלטו, חותמת זמן מקומית, מזהה מכשיר.
- סימון "ממתין לרשת לבדיקה".

### 2.2 מה אסור בתור

- לקרוא לקופאי "מומש" לפני תשובת שרת.
- לגבות יתרה על סמך תור.
- לשלוח redeem אוטומטי כשהרשת חוזרת בלי מסך confirm מחדש (היתרה/הסטטוס יכלו להשתנות: פג, הוחזר, נסרק במכשיר אחר).
- לאחסן `qr_payload` גולמי מעבר לנחוץ; למחוק אחרי הצלחה.

### 2.3 אלגוריתם כשהרשת חוזרת

```
for each queued draft:
  lookup(code)
  if not issued or wrong shop or expired:
    mark failed locally, show Hebrew reason, do NOT redeem
  else:
    require cashier confirm again (same till amount from server)
    redeem with new idempotency_key
```

תור ישן מעל 24 שעות: למחוק מקומית, לא לשלוח.

### 2.4 Service worker

- Cache app shell של הסורק (HTML גנרי בלבד).
- Network-first ל-`/api/supplier/vouchers/*`.
- בלי cache של תשובות redeem.

---

## 3. כללי קונפליקט

השרת תמיד מנצח. הסדר:

| מצב | תוצאה לקופאי | נשרף? |
|---|---|---|
| `issued` + אותו עסק + לא פג | ירוק, יתרה מהשרת | כן, פעם אחת |
| אותו `idempotency_key` אחרי הצלחה | ירוק עם `replayed` | לא שוב |
| שני מכשירים, שני keys, ראשון הצליח | שני: כבר מומש | לא |
| עסק אחר | אדום כללי (`not_found` anti-enumeration) | לא |
| `expired` / `refunded` | אדום מתאים | לא |
| lookup הצליח, בינתיים refund | redeem נכשל; לא לגבות יתרה | לא |
| חתימת HMAC נכשלת | סירוב | לא |

ויכוח "סרקנו קודם בלי רשת": התור המקומי אינו ראיה מול `voucher_redemptions`.

אין סריקה הפוכה. ביטול מימוש = תמיכת פלטפורמה + בעלים, לא כפתור בסורק.

---

## 4. תפקידי צוות

טבלה `supplier_members`, enum `supplier_member_role`:

| Role | סריקה | צוות | דוחות / CSV | בנק / payout פיזי |
|---|---|---|---|---|
| `owner` | כן | כן | כן | צפייה; שינוי דרך אדמין פלטפורמה |
| `manager` | כן | מוגבל | כן תפעולי | לא |
| `scanner` | כן | לא | לא | לא |

- בלי שורה בצוות אין סריקה, גם אם `profiles.role = vendor`.
- עובד שעזב: owner מבקש הסרה. הסשן הישן נכשל ב-RLS.
- אפליקציית חנויות (App Store) אינה באופק. PWA בלבד.
- ספק לא רואה `platform_percent` של מוצרים אחרים, לא GMV גלובלי, לא קאשבק לקוחות.

כניסה: Google של אותו אימייל שצורף. אין סיסמת משותפת לקיוסק אם אפשר להימנע; אם כן: משתמש `scanner` ייעודי, לא owner.

---

## 5. דוחות (statements)

### 5.1 קופון

| עמודה | ערך |
|---|---|
| שוברים שהונפקו לעסק | count |
| מומשו | count |
| יתרה שנגבתה בקופה | לא בהכרח במסד הפלטפורמה (מזומן חיצוני). המסך מציג את הסכום שהוצג בזמן הסריקה (`remaining_amount_due_agorot`) לצורכי בקרה, לא כחוב פלטפורמה |
| payout מהאתר | **0** |

אם CSV מציג payout 0 על שורת קופון: זה נכון, לא באג.

### 5.2 פיזי (כשפעיל)

- `supplier_due_agorot` מצילום השורה.
- העברה אחרי T+3 ימי עסקים וסף מינימום (יעד ארכיטקטורה).
- חשבונית על היתרה בקופה: הספק מוציא. הפלטפורמה מוציאה על מה שנגבה באתר.

### 5.3 מחלוקות

ראו FAQ ספק. ראיות: זמן סריקה, קוד, צילום קבלה של היתרה. אין "לתקן סטטוס" ב-SQL.

שעון דוח: חודש קלנדרי `Asia/Jerusalem`.

---

## 6. אבטחה וקצב

- JWT ספק חובה על lookup/redeem.
- Rate limit לפי user+supplier. בלי Redis חי: הגדרה בשרת/DB כפי שקיימת.
- קוד שובר מלא לא בלוגי Sentry ציבוריים.
- מסך אדום לא מגלה אם הקוד קיים אצל עסק אחר.

---

## 7. קריטריון קבלה לסורק

1. Lookup לא משנה `vouchers.status`.
2. Redeem כפול עם אותו key אינו שני used.
3. בלי רשת: אין ירוק. עם תור v2: אין ירוק עד confirm מחדש.
4. יתרה המוצגת = האגורות מהשרת, `dir=ltr`.
5. `scanner` לא מוריד CSV payout.

---

## 8. קישורים

- `docs/ARCHITECTURE-SUPPLIER-PORTAL.md`
- `docs/ops/RUNBOOK-INCIDENTS-HE.md` (פלייבוקים 10 ו-14)
- `docs/product/USER-JOURNEYS-HE.md` (מסעות 4 ו-10)
