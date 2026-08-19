# HANDOVER: שני סוכנים כתבו את אותו תור, ומה לעשות עם זה בבוקר

נכתב: 2026-08-19, ‏07:40 · ענף `docs/architecture-night` · worktree `ke-arch-night`

**מצב: אני עצרתי. הסוכן השני ממשיך.** אופיר הכריע ב-07:39.
הקובץ הזה קיים כדי שהניקוי בבוקר יהיה מחיקה מדודה ולא ניחוש.

---

## 1. מה קרה

שני סוכני Claude קיבלו את **אותו תור סגור של 10 מסמכי ארכיטקטורה** ורצו עליו
במקביל, על אותו ענף ואותו worktree. אין קונפליקט ב-git ולכן לא הייתה שום
אזהרה: **הסוכן האחד כתב לשורש הפרויקט, השני כתב ל-`docs/`.**

הקומיטים משתלבים זה בזה:

```
bda39df6a docs(arch): search and discovery ...        סוכן A, משימה 5
4dbc2324d docs(orders): five status axes ...          סוכן B, משימה 2
32c878532 docs(arch): the admin product form ...      סוכן A, משימה 4
d503f08e2 docs(arch): cancellations and refunds ...   סוכן A, משימה 3
c9534ff11 docs(checkout): the end-to-end Cardcom ...  סוכן B, משימה 1
114871ff6 docs(arch): the four state machines ...     סוכן A, משימה 2
a4ee642d2 docs(arch): end-to-end checkout ...         סוכן A, משימה 1
```

‏**‏A = הסוכן שממשיך** (כותב לשורש). **‏B = הסוכן שעצר** (כתב ל-`docs/`).

‏`STATE.md` נכתב על ידי שנינו לסירוגין. סימון ההמשך שבו הוא של A ונכון.

---

## 2. הכפילויות המדויקות

| נושא | ‏A, בשורש | ‏B, ב-`docs/` |
| --- | --- | --- |
| ‏checkout E2E | `ARCHITECTURE-CHECKOUT-CARDCOM-E2E.md`, ‏779 שורות | `docs/ARCHITECTURE-CHECKOUT-CARDCOM-E2E.md`, ‏578 שורות |
| מכונות מצב | `ARCHITECTURE-ORDER-STATE-MACHINE.md`, ‏554 שורות | `docs/ARCHITECTURE-ORDER-STATE-MACHINE.md`, ‏505 שורות |
| ‏`payment_events` | `migrations/pending/120_payment_events.sql`, ‏215 שורות | `migrations/pending/006-payment-events.sql`, ‏295 שורות |
| שומרי מעברים | אין | `migrations/pending/007-order-transition-guard.sql`, ‏326 שורות |

מסמכים 3, 4, 5 (החזרים, טופס מוצר, חיפוש) קיימים **רק** אצל A. אין להם כפילות.

---

## 3. ‏⚠️ אל תמחקו את הצד של B לפני שקוראים את שלושת הסעיפים האלה

מדידה, לא הערכה. ספירת מופעים בשני העותקים:

| מונח | אצל A | אצל B |
| --- | --- | --- |
| `client_ref` | **0** | 9 |
| `5xx` | **0** | 5 |
| `22P02` | **0** | 1 |
| `wrong_supplier` | 1 | 4 |

כלומר שלושה ממצאים נמצאים אצל B בלבד:

1. **שכבת ה-idempotency של `client_ref`.** `payments.idempotency_key = lp:{client_ref}`,
   מה בדיוק מוחזר בכל אחד משלושת המצבים (`redirected` -> אותו `redirect_url`,
   `succeeded` -> `{kind:'paid'}`, אחרת `IDEMPOTENT_REPLAY`), ומתי הלקוח כן
   מייצר `client_ref` חדש. ‏`docs/ARCHITECTURE-CHECKOUT-CARDCOM-E2E.md` §8.
2. **הכלל שכשל רישום ב-webhook עונה 5xx ולא 200.** זה תיקון של באג אמיתי:
   ‏200 אומר ל-Cardcom להפסיק לנסות שוב, ולכן הכרטיס מחויב, ‏`GetLpResult`
   לעולם לא נקרא, וההזמנה נשארת פתוחה בשקט. §6.2 באותו קובץ.
3. **‏`deriveOrderStatus` מחזיר `SettlementState` ולא `order_status`.**
   ‏`split_executed` ו-`redeemed` אינם חברים ב-enum ‏`order_status`, וכתיבה
   שלהם תיתן `22P02`. השדה נקרא `orderStatus` בתוך `RefundPlan`, וזה בדיוק איך
   שמישהו יעשה את זה בסוף. `docs/ARCHITECTURE-ORDER-STATE-MACHINE.md` §3.5.

**המלצה:** להעביר את שלושת הסעיפים לגרסאות שבשורש, ורק אז למחוק את
`docs/ARCHITECTURE-CHECKOUT-CARDCOM-E2E.md` ו-`docs/ARCHITECTURE-ORDER-STATE-MACHINE.md`.

---

## 4. שתי הטיוטות ל-`payment_events`, ומה ההבדל

שתיהן **לא הורצו**. שתיהן יוצרות טבלת יומן לאותו צורך.

| | `120_payment_events.sql` (A) | `006-payment-events.sql` (B) |
| --- | --- | --- |
| שורות | 215 | 295 |
| ‏append-only | ראה בקובץ | **טריגר שחוסם UPDATE ו-DELETE** |
| ‏FK ל-`payments` | ראה בקובץ | **אין, במכוון**: קולבק לתשלום שאין לו שורה הוא בדיוק האירוע שהכי צריך רישום |
| ‏`event_type` | ראה בקובץ | ‏`text` עם `CHECK`, ‏38 ערכים, כדי שהוספת מצב כשל חדש תהיה `ALTER` יחיד |
| אינדקסים | ראה בקובץ | חלקי על 10 סוגי האירועים הקריטיים בלבד |

**אחת מהן צריכה למות לפני שמריצים משהו.** שתי טבלאות יומן לאותו מסלול כסף הן
בדיוק הפגם ש-`PENDING-money-integer-fix.sql` קיים כדי להתיר.

**המלצת המספור:** `migrations/pending/` ממספרת `003-`, `004-`, `005-`, וה-README
שלה אומר במפורש שהיא **אינה** חלק משרשרת `NNN_` של `supabase/migrations`. לפי
זה `006-` הוא הנכון ו-`120_` הוא זליגה של מוסכמה מהתיקייה השנייה.

---

## 5. `007-order-transition-guard.sql`, שאין לו כפילות

טיוטה, **לא הורצה**. טריגרים שחוסמים מעברי סטטוס בלתי חוקיים על `orders`,
`order_items`, `payments`, `vouchers`, ועוד שני טריגרים שהופכים את `audit_log`
ל-append-only.

**למה הוא לא מיותר למרות ש-`.eq('status', from)` כבר קיים בכל כתיבה:**
‏`service_role` עוקף RLS, וזה מה שרצים תחתיו ה-webhook, ה-DLQ, כל cron וכל
סקריפט תיקון עתידי. שם אין `.eq`.

הקובץ **לא כותב כלום**, ולכן ה-rollback לא מאבד נתונים. יש בסופו בלוק שאילתות
ספירה שחייבים להריץ לפני ההחלה, כי שורות legacy ב-`escrow_held` וב-`platform_settled`
חייבות להישאר ניתנות לזיכוי.

---

## 6. מה לא נגעתי בו

- אין נגיעה ב-`src/`.
- אין נגיעה במיגרציה קיימת.
- לא הורצה שום SQL, לא מקומית ולא בפרודקשן.
- לא נמחק אף קובץ ולא נעצר אף תהליך.

## 7. שני דברים שכדאי לתקן כדי שזה לא יקרה שוב

1. **‏`ke-arch-night` הוא worktree משותף בפועל.** שני סוכנים קיבלו את אותו תור
   לאותו ענף. תור אחד, סוכן אחד, ענף אחד.
2. **הבעלות על `docs/` שנויה במחלוקת.** הפרומפט של תהליך ה-autopilot אומר
   במפורש "נגיעה בתיקיית `docs/` שייכת לסוכן Cursor", ובאותו זמן `docs/`
   מכילה כ-80 מסמכי ארכיטקטורה ואת `MASTER-ARCHITECTURE-v2.md`. שני סוכנים
   שקוראים כללי בעלות שונים על אותה תיקייה ייכתבו זה על זה.
