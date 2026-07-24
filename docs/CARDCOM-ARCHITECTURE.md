# CARDCOM-ARCHITECTURE.md
# ארכיטקטורת סליקה — KenyonExpress × Cardcom

> מסמך ארכיטקטורה מלא. מבוסס על מחקר תיעוד רשמי: Swagger v11 של Cardcom
> (`https://secure.cardcom.solutions/swagger/v11/swagger.json`), מרכז התמיכה
> `support.cardcom.solutions`, ומרכזי המפתחים `cardcomapi.zendesk.com` /
> `cardcomapinametovalue.zendesk.com`.
> תאריך: 2026-07-23. גרסת API: **v11 (JSON REST)**.

---

## 1. סקירת ה-APIs הרלוונטיים של Cardcom

Base URL לכל הקריאות:

```
https://secure.cardcom.solutions/api/v11
```

אימות: אין OAuth. כל בקשה נושאת `TerminalNumber` (מספר, לא מחרוזת!) + `ApiName`.
פעולות רגישות (זיכוי, מסמכים, פעולות חשבון) דורשות בנוסף `ApiPassword`.
מסוף בדיקות: `TerminalNumber: 1000`, כרטיס בדיקה `4580000000000000`, כל תוקף עתידי, CVV `123`.

### 1.1 Low Profile — דף תשלום מתארח (iframe / redirect)

| Endpoint | Method | תפקיד |
|---|---|---|
| `/LowProfile/Create` | POST | יצירת session של דף תשלום, מחזיר URL |
| `/LowProfile/GetLpResult` | POST | שליפת תוצאת העסקה לפי `LowProfileId` (שלב אימות חובה) |

שדות בקשה עיקריים ל-`Create`:

```
TerminalNumber      int      (חובה)
ApiName             string   (חובה)
Operation           string   ChargeOnly | ChargeAndCreateToken | CreateTokenOnly |
                             SuspendedDeal | Do3DSAndSubmit
Amount              decimal  (חובה)
ISOCoinId           int      1 = ILS, 2 = USD
Language            string   "he" | "en" | "ru" | "ar"
ReturnValue         string   מזהה פנימי שלנו (עד 250 תווים) — חוזר ב-webhook
SuccessRedirectUrl  string   (חובה)
FailedRedirectUrl   string   (חובה)
WebHookUrl          string   server-to-server notification (חובה אצלנו)
Document            object   יצירת חשבונית אוטומטית (ראה 1.4)
AdvancedDefinition  object   הגדרות UI, תשלומים, 3DS
```

תגובה: `ResponseCode` (0 = הצלחה), `LowProfileId` (GUID), `Url` (דף התשלום),
`UrlToBit`, `UrlToPayPal`, `Description`.

תגובת `GetLpResult`: `ResponseCode`, `ReturnValue`, `TranzactionInfo`
(שים לב לאיות: **Tranzaction** עם z), `TokenInfo` (`Token`, `CardMonth`,
`CardYear`, `TokenExDate`, 4 ספרות אחרונות), `DocumentInfo`, `SuspendedInfo`, `UIValues`.

### 1.2 Transactions — עסקאות server-to-server

| Endpoint | Method | תפקיד |
|---|---|---|
| `/Transactions/Transaction` | POST | חיוב ישיר: טוקן או כרטיס גולמי (לא אצלנו!), J2/J5 |
| `/Transactions/RefundByTransactionId` | POST | זיכוי מלא / חלקי / ביטול |
| `/Transactions/GetTransactionInfoById` | POST | שליפת עסקה |
| `/Transactions/ListTransactions` | POST | רשימת עסקאות (reconciliation) |
| `/Transactions/GetTransactionByExternalUniqTran` | POST | שליפה לפי מזהה ייחודי חיצוני (idempotency) |

שדות `Transaction` עיקריים: `TerminalNumber`, `ApiName`, `Amount`, `Token`,
`CardExpirationMMYY`, `ISOCoinId`, `JValidateType` (2 = בדיקה בלבד ללא תפיסת
מסגרת, 5 = תפיסת מסגרת/אישור), `Advanced.IsCreateToken`,
`Advanced.ApprovalNumber` (חיוב J5 קיים לפי מספר אישור).
עסקאות J2/J5 מחזירות `ResponseCode` **700/701 = הצלחה** (לא רק 0).

שדות `RefundByTransactionId`:

```
ApiName              string   (חובה)
ApiPassword          string   (חובה — רק בזיכויים)
TransactionId        long     (חובה)
PartialSum           decimal  (אופציונלי — זיכוי חלקי; בלעדיו זיכוי מלא)
CancelOnly           boolean  ביטול לפני שידור (אין תנועה כספית)
AllowMultipleRefunds boolean  ברירת מחדל false — הגנה מפני זיכוי כפול
```

תגובה: `ResponseCode`, `NewTranzactionId` (עסקת הזיכוי החדשה), `Description`.

מגבלת זמן זיכוי: ללא מודול מנויים, טוקן לזיכוי נשמר **6 חודשים** בלבד;
עם מודול מנויים — עד תוקף הכרטיס.

### 1.3 עסקה מושהית (J5 / SuspendedDeal)

- `Operation: "SuspendedDeal"` ב-Low Profile תופס מסגרת בלי לחייב.
- **תוקף תפיסת מסגרת: עד שבוע בלבד** (חוץ ממלונאות). זה קריטי למודל Escrow — ראה 3.1.
- חיוב/ביטול עסקה מושהית (ממשקי legacy, עדיין פעילים):
  - חיוב: `https://secure.cardcom.solutions/interface/SuspendedDealActivate.aspx` (או `BillGoldService.asmx` → `SuspendedDealActivateOne`) עם `TerminalNumber`, `UserName`, `UserPassword`, `SuspendedDealID`.
  - ביטול: `https://secure.cardcom.solutions/interface/DeleteSuspendedDeal.aspx`.
- ביט / Apple Pay / Google Pay **לא תומכים** ב-J5 — מחייבים מיידית.
- J2: בדיקת כרטיס בלבד, לא תופס מסגרת (טוב ל-CreateTokenOnly + ולידציה).

### 1.4 Documents — מודול חשבוניות

| Endpoint | תפקיד |
|---|---|
| `/Documents/CreateDocument` | חשבונית/קבלה עצמאית |
| `/Documents/CancelDoc` | ביטול מסמך |
| `/Documents/CreateDocumentUrl` | קבלת URL למסמך |
| `/Documents/GetReport` | דוח מסמכים |

- חשבונית אוטומטית עם עסקה: אובייקט `Document` בתוך `LowProfile/Create` או `Transaction`.
- `DocumentTypeToCreate` הוא **string enum**: `TaxInvoiceAndReceipt`, `Receipt`,
  `TaxInvoice`, `ProformaInvoice`, `Auto`, וריאנטים לזיכוי:
  `TaxInvoiceAndReceiptRefund`, `ReceiptRefund`, וגם `CouponDocumentAndReceipt` (רלוונטי לקופונים!).
- מוקשים באיות (רשמיים, לא באג אצלנו): `Languge` (חסר a), `ISOCoinID`, `TaxId`.
- מע"מ נוכחי: 18%.

### 1.5 Multi-Account: CompanyOperations + Financial (מודל "מאגד")

זה הגילוי המרכזי של המחקר — ל-Cardcom יש API מלא ל-marketplace:

| Endpoint | תפקיד |
|---|---|
| `/CompanyOperations/ValidateCompanyCreation` | ולידציית נתוני ספק לפני פתיחה |
| `/CompanyOperations/NewCompany` | **פתיחת חשבון/מסוף Cardcom לספק חדש דרך API** |
| `/CompanyOperations/OpenDigitalBankToAnExistingSapak` | פתיחת "בנק דיגיטלי" לספק קיים |
| `/CompanyOperations/MeagedAddCompany` / `MeagedGetCompanyInfo` | צירוף ספק תחת מאגד (aggregator) |
| `/CompanyOperations/GetBanks` / `GetBanksBranches` / `GetMainMCCs` | נתוני עזר ל-onboarding |
| `/Financial/TransferFromDigitalBank` | **העברת כספים מהבנק הדיגיטלי לחשבון בנק** (payout לספק) |
| `/Financial/GetMoneyTransfers` / `BankDeposites` / `FinancialTransactions` | reconciliation |

`TransferFromDigitalBank` מקבל: `ApiName`, `ApiPassword`, `TerminalNumber`,
`Amount`, `Description`, `BeneficiaryBankCode`, `BeneficiaryBankBranch`,
`BeneficiaryAccountNumber`. תגובה: boolean.

מסקנה: **אין ל-Cardcom "split payment" אטומי בעסקה אחת**. הפיצול נעשה
ברמת ה-ledger שלנו + payout יזום דרך
`TransferFromDigitalBank`, או בסליקה ישירה למסוף של הספק. הפעלת מודל מאגד
דורשת הסכם מסחרי מול Cardcom (רגולציית מאגדים בישראל) — לסגור מול מנהל תיק.

### 1.6 Webhook (WebHookUrl / IndicatorUrl)

- מגדירים `WebHookUrl` ב-`LowProfile/Create`. Cardcom שולחת POST server-to-server
  עם תוצאת העסקה בסיום התשלום (מבנה זהה ל-`GetLpResult`).
- חובה HTTPS ציבורי (localhost לא עובד — ngrok לפיתוח).
- **אין חתימת HMAC על ה-webhook.** לכן הכלל: ה-webhook הוא טריגר בלבד —
  את האמת שולפים תמיד ב-`GetLpResult` (או `GetTransactionInfoById`) מהשרת. ראה סעיף 5.
- קיימים גם webhooks נפרדים ליצירת מסמכים ולהוראות קבע (מוגדרים במסוף).

---

## 2. השוואת אפשרויות אינטגרציה

| קריטריון | Low Profile (iframe/redirect) | API ישיר (`Transactions/Transaction`) | Multi-Account (מסוף פר ספק / מאגד) |
|---|---|---|---|
| PCI DSS | **SAQ-A** (הכרטיס לא נוגע בשרת) | SAQ-D (כרטיס גולמי בשרת) — אסור לנו | SAQ-A אם הסליקה תמיד ב-Low Profile |
| 3DS | מובנה (`Do3DSAndSubmit`) | באחריותנו | מובנה |
| ביט / Apple Pay / Google Pay | מובנה בדף | אין | מובנה |
| טוקניזציה | `ChargeAndCreateToken` | חיוב טוקן קיים | טוקן קשור למסוף שנוצר בו! |
| J5 (תפיסת מסגרת) | `SuspendedDeal` | `JValidateType: 5` | תלוי מסוף |
| התאמה ל-KenyonExpress | **הצ'קאאוט היחיד** | רק לחיובי טוקן/זיכויים מהשרת | שכבת ההתחשבנות |

**הכרעה:** משלבים את שלושתם —
Low Profile לכל אינטראקציה עם כרטיס; Transactions API לזיכויים ולחיובי טוקן;
מסוף פלטפורמה אחד (merchant of record) + payouts לספקים. פירוט בסעיף 3.

### למה לא מסוף Cardcom נפרד לכל ספק כצינור סליקה ראשי?

1. טוקן שנוצר במסוף A לא ניתן לחיוב במסוף B → אי אפשר "כרטיס שמור" רוחבי באתר.
2. עמלת 5% שלנו הייתה דורשת חיוב נגדי של הספק (חשבונית עמלה + הוראת קבע) — סרבול וסיכון גבייה.
3. צ'קאאוט מרובה ספקים (עגלה מעורבת) היה מתפצל ל-N חיובים על כרטיס הלקוח.
4. onboarding של כל ספק = KYC מלא מול Cardcom לפני שהוא מוכר.

לכן: **הפלטפורמה סולקת הכל במסוף שלה; הספקים מקבלים payout.** מסופים פר ספק
נשמרים כאופציה עתידית לספקי-עוגן גדולים (הסכמה שדה `clearing_mode` ב-DB, סעיף 4).

---

## 3. ארכיטקטורה מומלצת

עקרון-על: **Ledger פנימי = מקור אמת. Cardcom = צינור כסף.**
כל שקל שנכנס נרשם בטבלת `ledger_entries` עם פיצול commission/supplier_share,
וה-payout לספק הוא פעולה נפרדת ומבוקרת.

### 3.1 החלטת Escrow לקופונים — האמת על J5

J5 תופס מסגרת **לשבוע בלבד**. מימוש קופון קורה שבועות אחרי הרכישה.
לכן J5 **פסול** כמנגנון Escrow לקופונים. ה-Escrow הנכון:

**חיוב מיידי מלא של המקדמה במסוף הפלטפורמה + החזקת חלק הספק ב-ledger
בסטטוס `held` עד מימוש.** הכסף יושב אצלנו (בנק דיגיטלי / חשבון הפלטפורמה),
משוחרר לספק רק אחרי אימות מימוש. זה escrow חוזי-תפעולי, לא escrow של חברת האשראי —
וזה הפתרון הסטנדרטי בכל marketplace קופונים (Groupon model).

J5 כן שמור אצלנו לתרחיש אחר: הזמנת מוצר פיזי שנשלח תוך ≤ 7 ימים,
אם נרצה לחייב רק במשלוח (אופציונלי, שלב מאוחר).

### 3.2 זרימת קופון (מקדמה + Escrow)

הלקוח משלם באתר רק את המקדמה (למשל 20% שמוגדר בדף המוצר). היתרה משולמת
פיזית אצל הספק במימוש. פרטי הספק מוצגים בדף המוצר.

```
לקוח            Next.js API          Cardcom              Webhook Worker        Ledger/DB
  │  checkout      │                    │                      │                   │
  │───────────────>│                    │                      │                   │
  │                │ INSERT payment_intent (status=created,     │                   │
  │                │   type=coupon, amount=deposit)             │                   │
  │                │ POST /LowProfile/Create                    │                   │
  │                │  Operation=ChargeOnly, Amount=deposit,     │                   │
  │                │  ReturnValue=intent_id, WebHookUrl=...     │                   │
  │                │<──── LowProfileId + Url ────│              │                   │
  │<── redirect ───│  (status=redirected)        │              │                   │
  │── משלם בדף Cardcom (iframe/redirect) ───────>│              │                   │
  │                │                    │── POST webhook ─────>│                   │
  │                │                    │                      │ verify: POST      │
  │                │                    │<─ GetLpResult ───────│  GetLpResult      │
  │                │                    │── TranzactionInfo ──>│                   │
  │                │                    │                      │ tx (idempotent):  │
  │                │                    │                      │  payment=succeeded│
  │                │                    │                      │  ledger:          │
  │                │                    │                      │   commission→earned│
  │                │                    │                      │   supplier_share→HELD (escrow)
  │                │                    │                      │  coupon: issue code│
  │<── SuccessRedirectUrl (מסך "הקופון שלך") ────│              │                   │
  │                │                    │                      │                   │
  ═══ מאוחר יותר: מימוש אצל הספק (סריקת קוד / אישור אדמין) ═══════════════════════
  │                │ POST /api/coupons/redeem                   │                   │
  │                │  → ledger: supplier_share HELD→RELEASED    │                   │
  │                │  → payout run הבא כולל את הסכום            │                   │
  ═══ פקיעה ללא מימוש: לפי מדיניות — refund ללקוח או חילוט (breakage) ═══════════
```

חלוקת המקדמה (דוגמה: קופון 100 ₪ מקדמה על דיל 500 ₪, עמלה 5% מהמקדמה — הנוסחה
המדויקת מוגדרת פר מוצר): `commission = 5.00`, `supplier_share_held = 95.00`.

### 3.3 זרימת מוצר פיזי (תשלום מלא + פיצול מיידי)

```
לקוח            Next.js API          Cardcom              Webhook Worker        Ledger/DB
  │  checkout      │                    │                      │                   │
  │───────────────>│ INSERT payment_intent (type=physical,      │                   │
  │                │   amount=full, commission_pct מדף המוצר)   │                   │
  │                │ POST /LowProfile/Create                    │                   │
  │                │  Operation=ChargeOnly (או Do3DSAndSubmit)  │                   │
  │                │  Amount=full, ReturnValue=intent_id        │                   │
  │                │  Document={TaxInvoiceAndReceipt,...}       │                   │
  │<── redirect ──>│── תשלום ──────────>│── webhook ──────────>│ verify+record     │
  │                │                    │                      │ ledger:           │
  │                │                    │                      │  commission (5% או │
  │                │                    │                      │   pct פר מוצר) →  │
  │                │                    │                      │   platform_earned │
  │                │                    │                      │  supplier_share → │
  │                │                    │                      │   payable (מיידי) │
  ═══ Payout run (cron יומי/שבועי) ═════════════════════════════════════════════
  │                │ סכימת payable per supplier ≥ מינימום       │                   │
  │                │ POST /Financial/TransferFromDigitalBank    │                   │
  │                │  (Beneficiary = פרטי בנק הספק)             │                   │
  │                │ INSERT payout (status=sent) + ledger link  │                   │
```

"פיצול מיידי" = פיצול **ledger** מיידי בזמן ה-webhook; התנועה הבנקאית לספק
רצה ב-payout run (מומלץ: יומי, מינימום 100 ₪, עיכוב מגן T+3 ימים נגד chargebacks).

### 3.4 ביטולים והחזרים — חוק הגנת הצרכן

עסקת מכר מרחוק: ללקוח **14 יום** לביטול (מוצר פיזי — 14 יום מקבלת הנכס; שירות —
14 יום מהעסקה ולפחות 2 ימי עסקים לפני מועד השירות). דמי ביטול מותרים:
**5% או 100 ₪ — הנמוך מביניהם** (אלא אם הביטול עקב פגם/אי-התאמה — אז 0).

מיפוי ל-API:

| תרחיש | פעולה |
|---|---|
| ביטול לפני שידור (אותו יום) | `RefundByTransactionId` + `CancelOnly: true` — אין תנועה כספית, אין עמלת סליקה |
| החזר מלא | `RefundByTransactionId` עם `TransactionId` בלבד |
| החזר בניכוי דמי ביטול | `PartialSum = amount - min(amount*0.05, 100)` |
| החזר נוסף על אותה עסקה | `AllowMultipleRefunds: true` (ברירת מחדל חסומה — טוב) |
| קופון שמומש | אין החזר אוטומטי — resolution ידני מול הספק |

חשוב ל-ledger: החזר על מוצר פיזי אחרי שחלק הספק כבר payable/paid → נרשם
`supplier_debit` שמתקזז מה-payout הבא של הספק. לכן עיכוב T+3 לפני payout ראשון.
זיכוי דרך Cardcom אפשרי עד 6 חודשים מהעסקה (בלי מודול מנויים) — מעבר לזה העברה בנקאית ידנית.

---

## 4. סכמת DB (Drizzle / Postgres, RLS על tenant_id)

```typescript
// packages/db/src/schema/payments.ts
import {
  pgTable, uuid, text, integer, numeric, boolean,
  timestamp, jsonb, pgEnum, uniqueIndex, index,
} from "drizzle-orm/pg-core";

export const paymentIntentStatus = pgEnum("payment_intent_status", [
  "created", "redirected", "processing", "succeeded",
  "failed", "expired", "canceled",
]);
export const productKind = pgEnum("product_kind", ["physical", "coupon"]);
export const ledgerEntryType = pgEnum("ledger_entry_type", [
  "platform_commission", "supplier_share", "supplier_debit",
  "refund", "payout", "breakage",
]);
export const ledgerStatus = pgEnum("ledger_status", [
  "held",       // escrow — קופון לפני מימוש
  "payable",    // מוכן ל-payout (פיזי מיידי / קופון אחרי מימוש)
  "paid",       // שולם לספק
  "reversed",   // בוטל עקב refund
]);
export const refundStatus = pgEnum("refund_status", [
  "requested", "approved", "sent_to_cardcom", "succeeded", "failed",
]);
export const payoutStatus = pgEnum("payout_status", [
  "pending", "sent", "confirmed", "failed",
]);
export const clearingMode = pgEnum("clearing_mode", [
  "platform",         // ברירת מחדל: סליקה במסוף הפלטפורמה + payout
  "own_terminal",     // עתידי: מסוף Cardcom של הספק
]);

// חשבונות סליקה/בנק של ספקים
export const supplierAccounts = pgTable("supplier_accounts", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull(),
  supplierId: uuid("supplier_id").notNull(),
  clearingMode: clearingMode("clearing_mode").notNull().default("platform"),
  // payout בנקאי (מוצפן ברמת app או pgcrypto):
  bankCode: text("bank_code"),
  bankBranch: text("bank_branch"),
  bankAccountNumber: text("bank_account_number"),
  beneficiaryName: text("beneficiary_name"),
  // עתידי — מסוף עצמאי:
  cardcomTerminalNumber: integer("cardcom_terminal_number"),
  cardcomApiName: text("cardcom_api_name"),          // secret ref, לא ערך גלוי
  defaultCommissionPct: numeric("default_commission_pct", { precision: 5, scale: 2 })
    .notNull().default("5.00"),
  payoutHoldDays: integer("payout_hold_days").notNull().default(3),
  minPayoutIls: numeric("min_payout_ils", { precision: 10, scale: 2 })
    .notNull().default("100.00"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("supplier_accounts_supplier_uq").on(t.supplierId)]);

// כוונת תשלום — נוצרת לפני הפניה ל-Cardcom
export const paymentIntents = pgTable("payment_intents", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull(),
  orderId: uuid("order_id").notNull(),
  customerId: uuid("customer_id").notNull(),
  kind: productKind("kind").notNull(),
  status: paymentIntentStatus("status").notNull().default("created"),
  // סכומים באגורות?? לא — Cardcom עובד בשקלים עשרוניים; numeric(10,2)
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),      // מה שנסלק בפועל
  fullDealAmount: numeric("full_deal_amount", { precision: 10, scale: 2 }), // קופון: מחיר הדיל המלא
  commissionPct: numeric("commission_pct", { precision: 5, scale: 2 }).notNull(),
  currency: integer("iso_coin_id").notNull().default(1),                 // 1=ILS
  cardcomLowProfileId: text("cardcom_low_profile_id"),
  cardcomTransactionId: text("cardcom_transaction_id"),
  cardcomResponseRaw: jsonb("cardcom_response_raw"),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("payment_intents_lp_uq").on(t.cardcomLowProfileId),
  index("payment_intents_order_idx").on(t.orderId),
]);

// עסקאות שהושלמו (append-only)
export const payments = pgTable("payments", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull(),
  paymentIntentId: uuid("payment_intent_id").notNull()
    .references(() => paymentIntents.id),
  cardcomTransactionId: text("cardcom_transaction_id").notNull(),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  cardLast4: text("card_last4"),
  cardToken: text("card_token"),            // אם ChargeAndCreateToken
  tokenExpiry: text("token_expiry"),        // MMYY
  documentNumber: text("document_number"),  // חשבונית Cardcom
  documentUrl: text("document_url"),
  raw: jsonb("raw").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("payments_cardcom_tx_uq").on(t.cardcomTransactionId)]);

// Ledger — מקור האמת לפיצול ול-escrow. append-only, אין UPDATE על סכומים.
export const ledgerEntries = pgTable("ledger_entries", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull(),
  paymentId: uuid("payment_id").references(() => payments.id),
  supplierId: uuid("supplier_id"),
  type: ledgerEntryType("type").notNull(),
  status: ledgerStatus("status").notNull(),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(), // חיובי/שלילי
  availableAt: timestamp("available_at", { withTimezone: true }),   // hold T+3
  payoutId: uuid("payout_id"),
  memo: text("memo"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("ledger_supplier_status_idx").on(t.supplierId, t.status),
]);

// החזרים
export const refunds = pgTable("refunds", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull(),
  paymentId: uuid("payment_id").notNull().references(() => payments.id),
  status: refundStatus("status").notNull().default("requested"),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  cancellationFee: numeric("cancellation_fee", { precision: 10, scale: 2 })
    .notNull().default("0.00"),               // min(5%, 100₪)
  reason: text("reason").notNull(),
  isDefectClaim: boolean("is_defect_claim").notNull().default(false), // פגם ⇒ אין דמי ביטול
  cardcomRefundTransactionId: text("cardcom_refund_transaction_id"),
  requestedBy: uuid("requested_by").notNull(),
  approvedBy: uuid("approved_by"),
  raw: jsonb("raw"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Payouts לספקים
export const payouts = pgTable("payouts", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull(),
  supplierId: uuid("supplier_id").notNull(),
  status: payoutStatus("status").notNull().default("pending"),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  method: text("method").notNull().default("cardcom_digital_bank"),
  cardcomTransferRef: text("cardcom_transfer_ref"),
  periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
  periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// יומן webhooks — idempotency + audit
export const webhookEvents = pgTable("webhook_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  provider: text("provider").notNull().default("cardcom"),
  dedupeKey: text("dedupe_key").notNull(),   // lowProfileId:terminalNumber
  payload: jsonb("payload").notNull(),
  processedAt: timestamp("processed_at", { withTimezone: true }),
  error: text("error"),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("webhook_events_dedupe_uq").on(t.dedupeKey)]);
```

RLS: כל הטבלאות עם policy על `tenant_id`; `ledger_entries` ו-`payments` —
INSERT-only ל-service-role, ספק (Supplier-View) רואה SELECT בלבד על השורות שלו.

---

## 5. Webhook Handling — אימות, idempotency, retry

**עובדה קשה מהתיעוד: ה-webhook של Cardcom אינו חתום (אין HMAC).** לכן:

1. **Never trust the webhook body.** ה-webhook הוא טריגר. מחלצים ממנו רק
   `LowProfileId` + `ReturnValue`, ואז קוראים `POST /LowProfile/GetLpResult`
   עם ה-credentials שלנו — התשובה הזו היא האמת (המלצה רשמית של Cardcom: "שלב 2 חובה").
2. **הגנת URL:** ה-endpoint חי על Cloudflare Worker עם path סודי ארוך
   (`/webhooks/cardcom/<random-64>`), Cloudflare WAF, ו-rate limit.
3. **Idempotency:** `INSERT ... ON CONFLICT DO NOTHING` על
   `webhook_events.dedupe_key = lowProfileId`. רק ה-insert שהצליח ממשיך לעיבוד.
   בנוסף — עדכון `payment_intents.status` בתנאי
   `WHERE status IN ('created','redirected','processing')` (מכונת מצבים חד-כיוונית).
4. **תשובה ל-Cardcom:** להחזיר `200` מהר (< שניות בודדות). עיבוד כבד — אחרי
   שמירת האירוע (Worker: `ctx.waitUntil`, או תור QStash/Queue).
5. **Retry / miss:** לא לסמוך רק על webhook. שני מנגנוני גיבוי:
   - בדף ה-`SuccessRedirectUrl`: קריאת `GetLpResult` סינכרונית אם ה-intent עדיין לא `succeeded` (מכסה איחור webhook).
   - **Reconciliation cron** כל 10 דקות: כל `payment_intents` ב-`redirected/processing` מעל 5 דקות → `GetLpResult`; מעל שעה בלי תוצאה → `expired`.
6. **סדר אירועים:** ledger נכתב באותה טרנזקציית DB עם עדכון ה-payment —
   או הכל או כלום.

---

## 6. אבטחה — PCI DSS ומה אסור לגעת

| כלל | פירוט |
|---|---|
| **SAQ-A בלבד** | מספר כרטיס, CVV, תוקף — **לעולם לא עוברים בשרתים שלנו**. רק דף Low Profile של Cardcom נוגע בהם. אסור לבנות טופס כרטיס משלנו, אסור `Transactions/Transaction` עם `CardNumber`. |
| טוקנים | `Token` של Cardcom אינו PAN — מותר לשמור. עדיין: עמודה נפרדת, גישה דרך service-role בלבד. |
| Secrets | `ApiName` / `ApiPassword` / `TerminalNumber` — רק ב-env של Worker/Vercel (server-side). `ApiPassword` נטען רק בקוד זיכויים/מסמכים/payouts. |
| iframe | אם מטמיעים iframe — ה-parent חייב HTTPS; לא מזריקים JS לתוך ה-iframe; קוראים לתוצאה רק דרך redirect/webhook, לא postMessage. |
| 3DS | להפעיל `Do3DSAndSubmit` (מעביר liability shift לחברת האשראי בעסקאות הונאה). |
| לוגים | `cardcomResponseRaw` נשמר אחרי בדיקה שאין בו PAN מלא (Cardcom מחזירה 4 ספרות בלבד — לוודא ב-code review). ב-Sentry: scrub ל-body של קריאות Cardcom. |
| Payout data | פרטי בנק ספקים — הצפנה at-rest (pgcrypto/KMS), הצגה חלקית ב-UI. |
| הפרדת סביבות | מסוף בדיקות (1000) לעולם לא ב-production env; בדיקת `TerminalNumber` בקוד ה-webhook מול env. |

---

## 7. קוד TypeScript לדוגמה

### 7.1 Client + יצירת עסקת Low Profile

```typescript
// packages/payments/src/cardcom/client.ts
const CARDCOM_BASE = "https://secure.cardcom.solutions/api/v11";

interface CardcomConfig {
  terminalNumber: number;       // MUST be a number, not a string
  apiName: string;
  apiPassword?: string;         // only for refunds / documents / payouts
}

export type LowProfileOperation =
  | "ChargeOnly"
  | "ChargeAndCreateToken"
  | "CreateTokenOnly"
  | "SuspendedDeal"
  | "Do3DSAndSubmit";

export interface CreateLowProfileRequest {
  TerminalNumber: number;
  ApiName: string;
  Operation: LowProfileOperation;
  Amount: number;                       // decimal ILS, e.g. 99.9
  ISOCoinId: 1;                         // 1 = ILS
  Language: "he";
  ReturnValue: string;                  // our payment_intent.id (<= 250 chars)
  SuccessRedirectUrl: string;
  FailedRedirectUrl: string;
  WebHookUrl: string;
  Document?: {
    DocumentTypeToCreate:
      | "TaxInvoiceAndReceipt" | "Receipt" | "Auto" | "CouponDocumentAndReceipt";
    Name: string;
    Email?: string;
    IsSendByEmail?: boolean;
    Languge?: "he";                     // official (misspelled) field name
    Products: Array<{ Description: string; UnitCost: number; Quantity?: number }>;
  };
}

export interface CreateLowProfileResponse {
  ResponseCode: number;                 // 0 = OK
  Description?: string;
  LowProfileId: string;                 // GUID
  Url: string;                          // redirect the customer here
  UrlToBit?: string;
}

export class CardcomClient {
  constructor(private cfg: CardcomConfig) {}

  private async post<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${CARDCOM_BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Cardcom HTTP ${res.status} on ${path}`);
    return (await res.json()) as T;
  }

  createLowProfile(req: Omit<CreateLowProfileRequest, "TerminalNumber" | "ApiName">) {
    return this.post<CreateLowProfileResponse>("/LowProfile/Create", {
      TerminalNumber: this.cfg.terminalNumber,
      ApiName: this.cfg.apiName,
      ...req,
    });
  }

  getLpResult(lowProfileId: string) {
    return this.post<GetLpResultResponse>("/LowProfile/GetLpResult", {
      TerminalNumber: this.cfg.terminalNumber,
      ApiName: this.cfg.apiName,
      LowProfileId: lowProfileId,
    });
  }

  refundByTransactionId(args: {
    transactionId: number;
    partialSum?: number;                // omit => full refund
    cancelOnly?: boolean;
    allowMultipleRefunds?: boolean;
  }) {
    if (!this.cfg.apiPassword) throw new Error("ApiPassword required for refunds");
    return this.post<{ ResponseCode: number; Description?: string; NewTranzactionId?: number }>(
      "/Transactions/RefundByTransactionId",
      {
        ApiName: this.cfg.apiName,
        ApiPassword: this.cfg.apiPassword,
        TransactionId: args.transactionId,
        PartialSum: args.partialSum,
        CancelOnly: args.cancelOnly ?? false,
        AllowMultipleRefunds: args.allowMultipleRefunds ?? false,
      },
    );
  }
}

export interface GetLpResultResponse {
  ResponseCode: number;                 // 0 = OK
  Description?: string;
  ReturnValue?: string;                 // our payment_intent.id
  TranzactionId?: number;               // note Cardcom's "z" spelling
  TranzactionInfo?: {
    ResponseCode: number;
    TranzactionId: number;
    Amount: number;
    Last4CardDigits?: string;
    ApprovalNumber?: string;
  };
  TokenInfo?: { Token: string; TokenExDate: string; CardMonth: number; CardYear: number };
  DocumentInfo?: { DocumentNumber?: string; DocumentUrl?: string };
}
```

```typescript
// apps/web/src/app/api/checkout/route.ts (Next.js 15, server only)
import { CardcomClient } from "@kenyon/payments/cardcom/client";
import { db } from "@kenyon/db";
import { paymentIntents } from "@kenyon/db/schema/payments";

const cardcom = new CardcomClient({
  terminalNumber: Number(process.env.CARDCOM_TERMINAL_NUMBER),
  apiName: process.env.CARDCOM_API_NAME!,
});

export async function POST(req: Request) {
  const { orderId, customerId, product, isCoupon } = await req.json();

  // coupon => charge only the deposit; physical => full amount
  const amount = isCoupon ? product.depositAmount : product.price;

  const [intent] = await db.insert(paymentIntents).values({
    tenantId: product.tenantId,
    orderId,
    customerId,
    kind: isCoupon ? "coupon" : "physical",
    amount: amount.toFixed(2),
    fullDealAmount: isCoupon ? product.price.toFixed(2) : null,
    commissionPct: (product.commissionPct ?? 5).toFixed(2),
  }).returning();

  const lp = await cardcom.createLowProfile({
    Operation: "ChargeOnly",
    Amount: Number(amount.toFixed(2)),
    ISOCoinId: 1,
    Language: "he",
    ReturnValue: intent.id,
    SuccessRedirectUrl: `${process.env.APP_URL}/checkout/success?intent=${intent.id}`,
    FailedRedirectUrl: `${process.env.APP_URL}/checkout/failed?intent=${intent.id}`,
    WebHookUrl: `${process.env.WORKER_URL}/webhooks/cardcom/${process.env.CARDCOM_WEBHOOK_SECRET_PATH}`,
    Document: {
      DocumentTypeToCreate: isCoupon ? "CouponDocumentAndReceipt" : "TaxInvoiceAndReceipt",
      Name: product.customerName,
      Email: product.customerEmail,
      IsSendByEmail: true,
      Products: [{ Description: product.title, UnitCost: Number(amount.toFixed(2)) }],
    },
  });

  if (lp.ResponseCode !== 0) {
    return Response.json({ error: lp.Description }, { status: 502 });
  }

  await db.update(paymentIntents)
    .set({ cardcomLowProfileId: lp.LowProfileId, status: "redirected" })
    .where(eq(paymentIntents.id, intent.id));

  return Response.json({ redirectUrl: lp.Url });
}
```

### 7.2 Webhook Worker (Cloudflare + Hono)

```typescript
// apps/worker/src/routes/cardcom-webhook.ts
import { Hono } from "hono";
import { CardcomClient } from "@kenyon/payments/cardcom/client";

export const cardcomWebhook = new Hono<{ Bindings: Env }>();

cardcomWebhook.post("/webhooks/cardcom/:secret", async (c) => {
  // 1. Secret-path gate (Cardcom webhooks are NOT signed)
  if (c.req.param("secret") !== c.env.CARDCOM_WEBHOOK_SECRET_PATH) {
    return c.text("not found", 404);
  }

  const payload = await c.req.json().catch(() => ({}));
  const lowProfileId: string | undefined =
    payload.LowProfileId ?? payload.lowprofilecode;
  if (!lowProfileId) return c.text("ok", 200); // never let Cardcom retry-loop on us

  // 2. Idempotency gate — first writer wins
  const inserted = await c.env.DB.insertWebhookEventIfNew({
    dedupeKey: `cardcom:${lowProfileId}`,
    payload,
  });
  if (!inserted) return c.text("duplicate", 200);

  // 3. Ack fast, process async
  c.executionCtx.waitUntil(processCardcomEvent(c.env, lowProfileId));
  return c.text("ok", 200);
});

async function processCardcomEvent(env: Env, lowProfileId: string) {
  const cardcom = new CardcomClient({
    terminalNumber: Number(env.CARDCOM_TERMINAL_NUMBER),
    apiName: env.CARDCOM_API_NAME,
  });

  // 4. NEVER trust the webhook body — fetch the truth from Cardcom
  const result = await cardcom.getLpResult(lowProfileId);
  const intentId = result.ReturnValue;
  const tx = result.TranzactionInfo;
  const ok = result.ResponseCode === 0 && tx && tx.ResponseCode === 0;

  await env.DB.transaction(async (dbTx) => {
    // 5. One-way state machine guard (also idempotent by unique cardcomTransactionId)
    const intent = await dbTx.lockIntentForUpdate(intentId);
    if (!intent || intent.status === "succeeded") return;

    if (!ok) {
      await dbTx.markIntentFailed(intentId, result.Description);
      return;
    }

    const payment = await dbTx.insertPayment({
      paymentIntentId: intentId,
      cardcomTransactionId: String(tx.TranzactionId),
      amount: tx.Amount,
      cardLast4: tx.Last4CardDigits,
      documentNumber: result.DocumentInfo?.DocumentNumber,
      documentUrl: result.DocumentInfo?.DocumentUrl,
      raw: result,
    });

    // 6. Split ledger — commission stays, supplier share held or payable
    const commission = round2(tx.Amount * (Number(intent.commissionPct) / 100));
    const supplierShare = round2(tx.Amount - commission);
    const isCoupon = intent.kind === "coupon";

    await dbTx.insertLedgerEntries([
      {
        paymentId: payment.id,
        type: "platform_commission",
        status: "payable",
        amount: commission,
      },
      {
        paymentId: payment.id,
        supplierId: intent.supplierId,
        type: "supplier_share",
        status: isCoupon ? "held" : "payable",          // ESCROW for coupons
        amount: supplierShare,
        availableAt: isCoupon ? null : addDays(new Date(), 3), // T+3 chargeback guard
      },
    ]);

    await dbTx.markIntentSucceeded(intentId);
    if (isCoupon) await dbTx.issueCouponCode(intent.orderId); // voucher issuance
  });
}

const round2 = (n: number) => Math.round(n * 100) / 100;
```

### 7.3 שחרור Escrow במימוש קופון

```typescript
// packages/payments/src/escrow.ts
export async function redeemCoupon(db: DB, couponId: string, redeemedBy: string) {
  return db.transaction(async (tx) => {
    const coupon = await tx.lockCoupon(couponId);
    if (coupon.status !== "active") throw new Error("coupon not redeemable");

    await tx.updateCouponStatus(couponId, "redeemed", redeemedBy);
    // held -> payable; enters next payout run
    await tx.releaseHeldLedgerEntries({
      paymentId: coupon.paymentId,
      from: "held",
      to: "payable",
      availableAt: new Date(),
    });
  });
}
```

---

## 8. שלבי הטמעה

| שלב | תוכן | תלות |
|---|---|---|
| **0. מסחרי** | פתיחת מסוף Cardcom production + מסוף בדיקות; לסגור מול מנהל תיק: מודול מסמכים, מודול מנויים (טוקנים > 6 חודשים), בנק דיגיטלי + הרשאת `TransferFromDigitalBank`, והאם נדרש הסדר מאגד למודל marketplace | — |
| **1. תשתית** | `packages/payments`: CardcomClient + טיפוסים + Zod על תגובות; env secrets ב-Vercel/Worker | 0 |
| **2. DB** | סכמת Drizzle מסעיף 4 + RLS + migrations | 1 |
| **3. Happy path פיזי** | checkout → LowProfile/Create → webhook Worker → GetLpResult → payment + ledger split. בדיקות מול מסוף 1000 + ngrok | 2 |
| **4. קופון + Escrow** | מקדמה בלבד, ledger `held`, הנפקת קוד קופון, מסך מימוש לספק, שחרור ל-`payable` | 3 |
| **5. Reconciliation** | success-page fallback (GetLpResult סינכרוני), cron 10 דקות ל-intents תקועים, `ListTransactions` יומי מול `payments` | 3 |
| **6. Refunds** | UI בקשת ביטול ללקוח, חישוב דמי ביטול `min(5%, 100₪)`, אישור אדמין, `RefundByTransactionId`, ledger reversal + `supplier_debit` | 3 |
| **7. Payouts** | cron יומי: aggregate `payable` per supplier (availableAt < now, סכום ≥ מינימום) → `TransferFromDigitalBank` → `payouts` + סימון `paid`; דוח ספק (Supplier-View) | 4,6 |
| **8. חשבוניות** | `Document` בכל עסקה (`CouponDocumentAndReceipt` לקופון), חשבונית זיכוי אוטומטית בהחזר, חשבונית עמלה חודשית לספק | 3 |
| **9. הקשחה** | 3DS (`Do3DSAndSubmit`), Sentry scrubbing, WAF על ה-webhook path, load test ל-idempotency, runbook ל-chargeback | 3–8 |
| **10. עתידי** | `clearing_mode = own_terminal` לספקי עוגן; `CompanyOperations/NewCompany` ל-onboarding ספקים אוטומטי אם נכנסים להסדר מאגד | 7 |

---

## נספח: מוקשים שנמצאו במחקר (לא לשכוח)

1. `TerminalNumber` = **number** ב-JSON, לא string.
2. איותים רשמיים שגויים: `Tranzaction`, `Languge` — לא לתקן, ככה ה-API.
3. הצלחה = `ResponseCode === 0` (וגם 700/701 בעסקאות J2/J5). לבדוק גם את
   ה-`ResponseCode` הפנימי של `TranzactionInfo`, לא רק את החיצוני.
4. `ApiPassword` נשלח **רק** בזיכויים/מסמכים/פעולות חשבון — לא בחיוב רגיל.
5. J5 תופס מסגרת לשבוע בלבד ⇒ לא Escrow לקופונים. ביט/Apple Pay/Google Pay לא תומכים J5 בכלל.
6. Webhook לא חתום ⇒ תמיד `GetLpResult` לפני כתיבה ל-DB.
7. זיכוי דרך Cardcom מוגבל ל-6 חודשים בלי מודול מנויים.
8. טוקן קשור למסוף שיצר אותו — לא עביר בין מסופים.
9. דמי ביטול חוקיים: הנמוך מבין 5% או 100 ₪; אפס בפגם/אי-התאמה.
10. מע"מ 18% — לוודא שהגדרות המסמכים במסוף מעודכנות.

## מקורות

- Swagger רשמי v11: `https://secure.cardcom.solutions/swagger/v11/swagger.json` (+ Docs UI: `https://secure.cardcom.solutions/Api/v11/Docs`)
- Low Profile שלב 1+2: `https://cardcomapinametovalue.zendesk.com/hc/he/articles/27008964534162`
- מדריך עסקה מושהית J5: `https://support.cardcom.solutions/hc/he/articles/360006736954`
- חיוב/ביטול עסקה מושהית ב-API: `https://cardcomapinametovalue.zendesk.com/hc/he/articles/26960944471058`
- חיוב/זיכוי במסוף וירטואלי (מגבלת 6 חודשים): `https://support.cardcom.solutions/hc/he/articles/360002246894`
- Webhook מסמכים: `https://support.cardcom.solutions/hc/he/articles/360007138014`
