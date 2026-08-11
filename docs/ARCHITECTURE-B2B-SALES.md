# ארכיטקטורה: מכירות B2B

מכירת קופונים בכמות לחברות וועדי עובדים.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מודל כסף: **No Escrow**. כל תשלום הקופון לפלטפורמה; יתרה בעסק על המקבל בזמן מימוש. `platform_percent` פר מוצר, בלי default.

מסמכים קשורים:

```
docs/ARCHITECTURE-ADMIN-DASHBOARD.md
docs/ARCHITECTURE-INVENTORY.md
docs/ARCHITECTURE-PRICING-RULES.md
docs/ARCHITECTURE-GIFT-COUPONS.md
docs/ARCHITECTURE-LEGAL-COMPLIANCE.md
docs/ARCHITECTURE-SUPPLIER-ONBOARDING.md
docs/BUSINESS-MODEL.md
docs/CONTRADICTIONS.md
```

---

## החלטה

| # | הכרעה מחייבת |
|---|---|
| B1 | B2B = הזמנת כמות (bulk) של קופונים לאותו דיל או סל דילים. |
| B2 | תשלום: העברה בנקאית / חשבונית מס + Cardcom לפי הסכם; לא חובה checkout קמעונאי. |
| B3 | מחיר B2B יכול להיות מוזל מול `coupon_price` הקמעונאי; נשמר בהסכם + snapshot על השורה. |
| B4 | `platform_percent` / תנאי הספק נקבעים בהסכם; אין default גלובלי. |
| B5 | הנפקה: אצווה של vouchers `issued`; חלוקה במיילים / קודי claim / פורטל ועד. |
| B6 | מלאי/מכסה: בודקים `quota` לפני אישור האצווה. |
| B7 | **No Escrow:** מקדמת קופון = הכנסת פלטפורמה; ספק מקבל 0 מהפלטפורמה; יתרה בעסק במימוש. |

### זרימה

```text
אדמין / נציג B2B
  → יצירת b2b_account (ועד / חברה)
  → הזמנת כמות + מחיר מוסכם (snapshot)
  → חשבונית / תשלום
  → אחרי paid: הנפקת vouchers באצווה
  → חלוקה: claim codes / מייל לעובד / פורטל ועד
  → מימוש אצל ספק כרגיל (redeem RPC)
```

### ועדי עובדים

| יכולת | פירוט |
|---|---|
| אנשי קשר | בעל תפקיד ב-`b2b_accounts` |
| הקצאה | שיוך voucher לעובד לפני/אחרי הנפקה |
| דוח | הונפקו / נתבעו / מומשו / פגו |
| הגבלה | דומיין אימייל ארגוני אופציונלי |

Refunds B2B: ידני לפי חוזה; לא אותו מנוע 14 יום צרכני אוטומטי (LEGAL לכל הסכם).

---

## חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| Escrow / held על bulk coupons | B7: No Escrow; אותו מודל כמו קמעונאי. |
| מחיר B2B לפי % מ-face בלבד | B3: snapshot מוחלט באגורות על השורה. |
| checkout קמעונאי חובה ל-B2B | B2: wire/invoice/cardcom לפי הסכם. |
| payout לספק מהמקדמה B2B | סותר B7; ספק 0 מהפלטפורמה על קופון. |
| `platform_percent` default 5%/10% | B4: snapshot פר שורה מהסכם. |
| ועד רואה PAN עובדים | לא רלוונטי; הארגון משלם. |

---

## סכמת DB

**טיוטת סכימה.** DDL ב-`migrations/pending` כשיאושר.

```text
b2b_accounts (
  id uuid PK,
  company_name_he text NOT NULL,
  business_id text,
  billing_email text NOT NULL,
  contact_name text,
  contact_phone text,
  status text CHECK (status IN ('active','suspended')),
  created_at timestamptz
)

b2b_orders (
  id uuid PK,
  b2b_account_id uuid FK → b2b_accounts(id),
  status text CHECK (status IN ('draft','invoiced','paid','issued','cancelled')),
  total_agorot bigint NOT NULL,
  payment_method text CHECK (payment_method IN ('wire','cardcom','invoice')),
  contract_ref text,
  created_by_admin_id uuid FK,
  created_at timestamptz
)

b2b_order_lines (
  id uuid PK,
  b2b_order_id uuid FK,
  product_id uuid FK,
  qty int NOT NULL,
  unit_price_agorot bigint NOT NULL,    -- snapshot
  platform_percent numeric(5,2),        -- snapshot אם רלוונטי
  PRIMARY KEY implied via id
)

b2b_allocations (
  id uuid PK,
  b2b_order_line_id uuid FK,
  voucher_id uuid FK → vouchers(id),
  employee_email text,
  claimed_at timestamptz
)
```

כסף: כל הסכומים באגורות integer. מע"מ לפי דין; חשבונית מס לפי ספק חשבוניות.

---

## מקרי קצה

| # | מקרה | התנהגות מחייבת |
|---|---|---|
| CE1 | quota אזל בין draft ל-paid | ביטול/הקטנת qty לפני הנפקה |
| CE2 | voucher הונפק, עובד לא claim | נשאר `issued`; aging report |
| CE3 | refund B2B אחרי חלק מההנפקה | ידני לפי חוזה; vouchers cancelled |
| CE4 | מחיר B2B < עלות ספק (face-coupon) | LEGAL + ONBOARDING; לא auto approve |
| CE5 | שינוי `platform_percent` מוצר אחרי snapshot B2B | לא משפיע על שורות paid |
| CE6 | ועד מקצה voucher לעובד מחוץ לדומיין | אופציונלי block לפי policy |
| CE7 | הנפקה לפני paid | **אסור** |

---

## פתוחות

| # | פתוח | הערה |
|---|---|---|
| O1 | DDL B2B: מתי migration pending | דורש אישור prod |
| O2 | פורטל ועד self-service vs admin-only | v1 admin |
| O3 | claim code format ו-TTL | GIFT-COUPONS |
| O4 | חשבונית מס אוטומטית vs ידנית | LEGAL-COMPLIANCE |

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-08-06 | B2B bulk + ועדי עובדים |
| 2026-08-07 | QA: No Escrow + platform_percent |
| 2026-08-12 | batch-2: כתיבה מחדש BINDING (5 סעיפים) |
