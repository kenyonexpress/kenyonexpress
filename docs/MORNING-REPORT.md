# דוח בוקר

תאריך שלד: 2026-08-19.
ענף כתיבה: `ke-arch` (docs בלבד בלילה הזה).
ענף קוד קנוני: `phase5/homepage`.
מקור תור: `MISSION-FINAL.md`.

הקובץ הזה מתמלא אחרי כל שלב. מה שמסומן **(שלד)** מחכה לריצה שאינה docs.
שאלות קריטיות תמיד בראש. לא לדפדף בשביל חוסמים.

---

## 0. שאלות קריטיות (למעלה, לא בסוף)

פירוט מלא: `docs/QUESTIONS-FOR-OFIR.md`.
צ'קליסט עלייה: `docs/LAUNCH-CHECKLIST.md`.

אלה עשר השאלות שאי אפשר לעקוף בקוד. בלי תשובה אין כסף אמיתי.

1. **מסוף Cardcom ייצור + ארבעה סודות ב-Vercel Production.** בלי זה אין גבייה ואין שובר. בפרודקשן נמדדו 0 שוברים ו-0 אירועי סליקה.
2. **מפתח Resend תקין + SPF/DKIM ירוקים על `@kenyonexpress.co.il`.** המפתח שנבדק החזיר 400. בלי מייל אין מסמך גילוי ואין קופון אצל הלקוח.
3. **מתי DNS cutover.** הדומיין מגיש עכשיו WordPress דרך Cloudflare (200). לא לנתק לפני (1)+(2) ועסקת smoke.
4. **Production Branch של Vercel הוא `cursor/add-supabase-3c830`, לא `main`.** Push ל-`main` לא משנה את החי.
5. **Hobby מול Pro:** שישה cron, שניים כל חמש דקות. בלי Pro, `notifications` ו-`expire-vouchers` עלולים לא לרוץ.
6. **סיווג הקופון מול 14ח (עו"ד):** 5 שנים לתו קנייה מול 4 חודשים + ארנק. זמנית: 4 חודשים + C6.
7. **דמי ביטול ב-soft-launch:** לגבות 5%/100 או אפס. זמנית: אפס, והעמוד חייב להגיד את זה.
8. **מע"מ 17% ב-ledger מול 18% בחשבוניות.** חשבונית ראשונה תהיה שגויה עד תיקון קוד.
9. **ח.פ, כתובת, רכז נגישות, חתימת עו"ד** על תקנון/פרטיות/ביטולים.
10. **11 ספקים בלי כתובת ובלי לוגו.** אי אפשר לממש קופון, ואי אפשר לשמור מוצר פעיל באדמין.

החלטות זמניות שננעלו בלילה (לא מחכות): C11(א) אין Escrow; soft-launch = קופון בלבד; Google בלבד; Resend+cron בלי QStash; apex קנוני; נתיבי WP קנוניים לעמודים משפטיים.

עצירות אסורות בלילה הזה (לא בוצעו): push לפרודקשן Vercel, מחיקת DB, החלת migration על המרוחק, DNS cutover.

---

## 1. לילה 19.08: מה רץ בפועל

**מצב: docs בלבד.** לא מוזגו ענפים. לא נגענו בקוד. לא הורצו טסטים כשער לילה (אין שינוי קוד).

| שלב | קובץ | קומיט על `ke-arch` | סטטוס |
|---|---|---|---|
| 1 | `docs/QUESTIONS-FOR-OFIR.md` | `40100f5` | נדחף `origin/ke-arch` |
| 2 | `docs/LAUNCH-CHECKLIST.md` | `8425f8f` | נדחף `origin/ke-arch` |
| 3 | `docs/MORNING-REPORT.md` | (הקובץ הזה) | |

`ke-arch` נוצר מ-`phase5/homepage` ב-`fc5829297` (MISSION-FINAL) ולא ממוזג חזרה. זה ענף docs. המיזוג ל-`phase5/homepage` הוא משימה נפרדת, אחרי הלילה, ורק לקבצי המסמכים.

---

## 2. ארבעת ענפי הלילה (MISSION-FINAL שלב 1)

סדר המיזוג שנדרש (כשירוץ, לא הלילה):

```
voucher → wallet → supplier → arch-night
         אל תוך phase5/homepage
         conflicts → טסטים ירוקים אחרי כל merge
```

מדידה מול `phase5/homepage` ב-19.08 בבוקר, לפני כל merge.

### 2.1 voucher

| שדה | ערך |
|---|---|
| ענף היסטורי | `feat/voucher-redemption` (מוזג 24.07) |
| origin היום | `origin/feat/coupon-redemption` |
| ahead / behind | **0 / 499** |
| משמעות | אין קומיטים ייחודיים. הדומיין (שובר, QR, סריקה, `coupon_price_ils`) כבר ב-`phase5/homepage` |
| merge הלילה | **לא נדרש** |
| מה נשאר | E2E חי מול מסוף; 0 שוברים בפרודקשן; פורטל סריקה מעודכן נמצא ב-supplier לא כאן |

**(שלד אחרי merge)** קונפליקטים: אין / היו: ___ . טסטים: ___ .

### 2.2 wallet

| שדה | ערך |
|---|---|
| ענף היסטורי | `feat/account-wallet` (מוזג 24.07) |
| origin קרוב | `origin/feat/personal-area` |
| ahead / behind | **0 / 499** |
| משמעות | ארנק פנימי (`wallet_accounts` / `wallet_entries`), אזור אישי, RLS. כבר ב-homepage |
| merge הלילה | **לא נדרש** |
| מה נשאר | C6 (זיכוי בפקיעה) תלוי cron; אין משיכה מארנק (מוצר, לא פער) |

**(שלד אחרי merge)** קונפליקטים: אין / היו: ___ . טסטים: ___ .

### 2.3 supplier

| שדה | ערך |
|---|---|
| ענף | `feat/supplier-portal` (worktree `ke-supplier`) |
| ahead / behind מול homepage | **15 / 1** |
| merge הלילה | **לא בוצע** (docs בלבד) |
| טיפ | `4e73c88a` feat(supplier): the order queue the portal never had, and the last escrow promise |

קומיטים ייחודיים שחשובים למיזוג הבא (לא לפי גיל, לפי סיכון כסף):

- `8819c5d` / `121a780`: ייבוא WP כתב קיצוץ 10% שלא אף אחד בחר, ו-17 קטגוריות Electro דמו. **חובה לאבד את זה בדרך.**
- `1a663ce`: העגלה מסרבת לסוג מוצר שהיא לא יודעת לתמחר (לא כל מה שאינו פיזי הוא קופון).
- `4e73c88`: תור הזמנות בפורטל + "הבטחת escrow אחרונה" בשם הקומיט. לפני merge: לוודא שההבטחה **לא** מחזירה held לספק על קופון (C11(א)).
- תיקוני redeem alias, בדיקות 3-mode selector.

**סיכון מיזוג.** הענף 1 מאחורי homepage. קודם rebase/merge מ-homepage פנימה, אחר כך כניסה ל-homepage. קונפליקט צפוי ב-STATE.md (הענף נושא יומן ארוך) ובנתיבי ספק/עגלה.

**(שלד אחרי merge)**

- rebase מ-homepage: ___
- קונפליקטים: ___
- `pnpm test`: ___
- `pnpm type-check` / `pnpm lint`: ___
- האם נשאר escrow על קופון: כן/לא, ראיה: ___

### 2.4 arch-night

| שדה | ערך |
|---|---|
| ענף | `docs/architecture-night` (worktree `ke-arch-night`) |
| ahead / behind | **3 / 1** |
| merge הלילה | **לא בוצע** |
| טיפ | `c9534ff` docs(checkout): Cardcom E2E + payment_events journal |

קבצים ייחודיים (3264 שורות, docs + pending SQL, בלי אפליקציה):

```
ARCHITECTURE-CHECKOUT-CARDCOM-E2E.md
ARCHITECTURE-ORDER-STATE-MACHINE.md
ARCHITECTURE-REFUNDS-CANCELLATIONS.md
docs/ARCHITECTURE-CHECKOUT-CARDCOM-E2E.md
migrations/pending/006-payment-events.sql
migrations/pending/120_payment_events.sql
migrations/pending/121_refunds.sql
```

**סיכון מיזוג.** שני קבצי pending ל-`payment_events` (006 ו-120) על אותו רעיון. לפני כניסה ל-homepage: לבחור קובץ אחד, לא להחיל על המרוחק. STATE.md יתנגש (36 שורות).

**(שלד אחרי merge)**

- איזה pending נשאר: 120 / 006 / שניהם מחוקים לטובת ___
- הוחל על Supabase remote? **אסור בלי אישור.** בפועל: לא / כן (חריגה): ___
- טסטים: N/A אם docs בלבד; אם נכנס SQL לבדיקות: ___

---

## 3. טבלת מיזוג (למילוי כששלב 1 של MISSION-FINAL רץ)

| סדר | ענף | ahead לפני | merged? | SHA ב-homepage | טסטים אחרי | הערות |
|---|---|---|---|---|---|---|
| 1 | voucher | 0 | כבר בפנים 24.07 | | N/A | אין מה למזג |
| 2 | wallet | 0 | כבר בפנים 24.07 | | N/A | אין מה למזג |
| 3 | supplier | 15 | לא | | | |
| 4 | arch-night | 3 | לא | | | docs + pending בלבד |

אחרי ארבעתם (כשייגמר): `phase5/homepage` נדחף ל-`origin`, לא ל-Vercel Production.

---

## 4. מה נשאר אחרי הלילה (תור MISSION-FINAL)

המשך מ: **שלב 1** (מיזוג supplier ואז arch-night; voucher/wallet כבר בפנים).

| # | שלב | סטטוס 19.08 בוקר |
|---|---|---|
| 1 | merge 4 ענפי לילה | voucher+wallet בפנים; supplier+arch-night בחוץ |
| 2 | תקן packages/payments | **בטל כמשימה.** החבילה לא קיימת. הסריקה היא על `src/lib/money.ts` + `src/server/payments` (Q16) |
| 3 | Checkout E2E Cardcom sandbox | חסום חלקית: סודות; קוד עגלה קיים; אין שובר חי |
| 4 | איחוד migrations, dry-run מקומי | לא להחיל על remote; 059 אסורה |
| 5 | compare.mjs כל הדפים < 11% | בית/קטגוריה/עגלה עברו 10.08; מוצר 15.58% בבחירה |
| 6 | WP import dry-run | בוצע 01.08; כתיבה אסורה בלי החלטה |
| 7 | QA לפי docs/QA-CHECKLIST.md | לא בלילה הזה |
| 8 | lighthouse + a11y + RTL | a11y נמדד 01.08; לא נסגר כ-GA |
| 9 | עדכון הדוח הזה | השלד הזה |

תור המרתון הישן ב-STATE (עגלה מלאה כשלב 3) **לא נפתח בלילה הזה**. קבצי עגלה שמופיעים כ-dirty ב-working tree אינם חלק מהמסמכים ולא נכללים בקומיטים.

---

## 5. פער השקה בקצרה (כדי לא לפתוח שלושה קבצים)

חוסם כסף: Cardcom prod, Resend DNS, 8 סודות, 11 ספקי חסרים, 0 סליקות חיים, Production branch לא `main`.

חוסם GA לא soft-launch: `/cancel`, חתימת עו"ד, 14ח, מע"מ 18% בכל המסלול, leaked-password protection.

לא ב-v1: פיזי, מנוי, WhatsApp, QStash, חנויות אפליקציה, Escrow.

---

## 6. החלטות אוטומטיות מהלילה

נרשמו ב-`STATE.md` וחזרה כאן:

- C11(א) סופי. מסמכי Escrow ישנים הם שריד.
- soft-launch = קופון בלבד.
- Google בלבד, בלי OTP.
- השקה תפעולית: Resend + Vercel cron. QStash כבוי עד טוקן שנבדק.
- apex קנוני; www → apex.
- עמודים משפטיים: נתיבי WP + aliases הקיימים. לא נתיבים חדשים מקבילים.
- שוברי legacy: אפס עמלה במערכת החדשה.
- payout ידני עד שיש פיזי חי.

---

## 7. Revision

| Date | Change |
|---|---|
| 2026-08-19 | שלד דוח בוקר: שאלות קריטיות, סטטוס 4 ענפים (voucher/wallet כבר merged, supplier 15 ahead, arch-night 3 ahead), תור MISSION-FINAL |
