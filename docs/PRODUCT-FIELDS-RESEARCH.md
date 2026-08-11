# PRODUCT-FIELDS-RESEARCH.md

Status: **BINDING (research)** · עודכן: 2026-08-12
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`
אין שינוי קוד. אין נגיעה בתיקייה הראשית.
מודל כסף: No Escrow; agorot integer; platform_percent פר מוצר.

---

## 1. החלטה

| # | הכרעה |
|---|---|
| F1 | אין 5%/10% default |
| F2 | קופון: 100% platform keeps |
| F3 | snapshot ב-order_items |
| F4 | DROP escrow_* |

---

## 2. חלופות שנדחו

| חלופה | נימוק |
|---|---|
| numeric ILS amounts | float risk |
| COALESCE percent | C1 |
| release on redeem | C3 |

---

## 3. סכמת DB

| טבלה | שדות יעד |
|---|---|
| products | *_agorot, platform_percent NOT NULL |
| order_items | snapshots, no escrow_* |
| vouchers | face/coupon/remaining agorot |

---

## 4. מקרי קצה

| E1 | publish without percent | fail |
| E2 | dual price columns | UI bug |

---

## 5. פתוחות

| O1 | prod still *_ils | migration pending | 2026-08-12 |

---

## 0. הכרעות (מודל v2)

| # | הכרעה |
|---|---|
| F1 | **אין 5% קבוע** (וגם לא 10%). `products.platform_percent` חובה פר מוצר, `NOT NULL`, בלי `DEFAULT`. |
| F2 | ידית פיצול יחידה לפיזי: `platform_percent`. `commission_percent` = legacy בלבד, לא נקרא ב-checkout. |
| F3 | קופון: לקוח משלם `coupon_price_*` באתר; **100% נשאר בפלטפורמה**; יתרה = face − coupon בבית העסק. |
| F4 | **אין Escrow**: אין `held`, אין שחרור אחרי סריקה, אין supplier payout על קופונים. |
| F5 | אחרי סריקה: voucher → `redeemed` (טרמינלי). הקופון פג לשימוש חוזר. |
| F6 | פיזי: חיוב מלא באתר; פיצול לפי snapshot של `platform_percent` (+ `supplier_split_percent`) ב-`order_items`. |
| F7 | יחידת כסף מומלצת ב-DB/domain: **integer agorot** (1 ₪ = 100). UI מציג שקלים. |
| F8 | אחוזים נשארים `numeric(5,2)` או basis points; רק סכומי כסף עוברים לאגורות. |

מקור: `CONTRADICTIONS.md` C1–C4, C11א; `BUSINESS-MODEL.md`; `CARDCOM-ARCHITECTURE.md` (v2 מ-10.08).

---

## 1. מה בוטל (שרידים שאסור להחזיר)

| שריד | למה מת |
|---|---|
| `commission_percent DEFAULT 5` | C1: אין עמלה גלובלית |
| `COALESCE(product, supplier, 10)` | ממציא אחוז במקום לסרב למכירה |
| Escrow / `held` / `escrow_held_agorot` / שחרור במימוש | C3 + C11א: מקדמת קופון = הכנסת פלטפורמה |
| נוסח "מקדמה + Escrow" / נאמן / J5 | אסור ב-UI, מיילים, אדמין |
| `numeric(12,2)` כסכמה מומלצת לסכומים | יעד: integer agorot (חישוב בלי float) |

---

## 2. מיפוי שדות כסף במוצר

| שדה (יעד) | תפקיד | מי רואה | הערות |
|---|---|---|---|
| `type` | `coupon` / `physical` / (עתיד subscription) | לקוח | קובע מסלול תשלום |
| `price_agorot` | מחירון / face / שווי דיל | לקוח (₪) | לשעבר `price_ils` / `full_price` |
| `compare_at_agorot` | מחיר לפני הנחה (קו חוצה) | לקוח | אופציונלי |
| `coupon_price_agorot` | מה שנגבה באתר בקופון | לקוח | שדה מוחלט, לא אחוז מ-face (C4) |
| `platform_percent` | עמלת פלטפורמה לפיזי; בקופון לביקורת בלבד | פנימי | בלי default; admin only |
| `supplier_split_percent` | משלים ל-100 עם `platform_percent` | פנימי | CHECK: סכום הזוג = 100 |
| `discount_percent` | תווית הנחה לתצוגה | לקוח | לא מקור חיוב (P5) |
| `cashback_percent` | קאשבק על חיוב on-site | פנימי | snapshot לשורה |
| `coupon_expiry_days` | תוקף שובר | לקוח | פר מוצר (C7) |
| `cost_agorot` | עלות פנימית | פנימי | לא ללקוח |

נגזרים (לא עמודות חובה):

- יתרה בעסק = `price_agorot - coupon_price_agorot` (קופון)
- תווית חיסכון % = מחישוב תצוגה מ-`compare_at` / `price` / `coupon_price`

---

## 3. התנהגות לפי סוג מוצר

### 3.1 קופון (No Escrow v2)

```text
charge_on_site = coupon_price_agorot
platform_keeps = charge_on_site          # 100%
supplier_payout_from_platform = 0
balance_at_business = price_agorot - coupon_price_agorot
on_redeem: voucher.status = redeemed     # terminal; no ledger release
```

### 3.2 פיזי

```text
charge_on_site = price_agorot
platform_cut = round(charge_on_site * platform_percent / 100)
supplier_share = charge_on_site - platform_cut
# payout לספק: ראה ARCHITECTURE-PAYOUT-MECHANISM.md (לא חלק משדות המוצר)
```

### 3.3 Snapshot ב-`order_items` (חובה)

מצולמים בקנייה ואינם משתנים אחרי `paid`:

- `platform_percent`, `supplier_split_percent`, `discount_percent`
- `face_value_agorot`, `paid_on_site_agorot`, `platform_cut_agorot`, `supplier_share_agorot`
- קופון: `collect_in_store_agorot` (= יתרה בעסק); פיזי: 0
- **אין** עמודות `escrow_*`

---

## 4. סכמה מומלצת (integer agorot)

יעד DDL. הפרוד עדיין מחזיק עמודות `*_ils` numeric; המיגרציה היא additive ואז cut-over בקוד.

```sql
-- products: money in agorot; percents stay numeric(5,2)
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS price_agorot           integer,
  ADD COLUMN IF NOT EXISTS compare_at_agorot      integer,
  ADD COLUMN IF NOT EXISTS cost_agorot            integer,
  ADD COLUMN IF NOT EXISTS coupon_price_agorot    integer;

-- platform_percent / supplier_split_percent / discount_percent / cashback_percent:
-- already present as numeric(5,2); keep. No DEFAULT on platform_percent.
ALTER TABLE public.products
  ALTER COLUMN platform_percent SET NOT NULL;

-- commission_percent: leave readable for old snapshots; stop writing; no DEFAULT 5

ALTER TABLE public.products
  ADD CONSTRAINT products_split_pair_sums_to_100
    CHECK (
      platform_percent IS NULL
      OR supplier_split_percent IS NULL
      OR (platform_percent + supplier_split_percent = 100)
    ),
  ADD CONSTRAINT products_coupon_price_within_face
    CHECK (
      coupon_price_agorot IS NULL
      OR price_agorot IS NULL
      OR (coupon_price_agorot > 0 AND coupon_price_agorot <= price_agorot)
    ),
  ADD CONSTRAINT products_agorot_nonneg
    CHECK (
      COALESCE(price_agorot, 0) >= 0
      AND COALESCE(compare_at_agorot, 0) >= 0
      AND COALESCE(cost_agorot, 0) >= 0
      AND COALESCE(coupon_price_agorot, 0) >= 0
    );

-- order_items: snapshots in agorot (no escrow columns)
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS unit_price_agorot        integer,
  ADD COLUMN IF NOT EXISTS total_price_agorot       integer,
  ADD COLUMN IF NOT EXISTS face_value_agorot        integer,
  ADD COLUMN IF NOT EXISTS paid_on_site_agorot      integer,
  ADD COLUMN IF NOT EXISTS platform_cut_agorot      integer,
  ADD COLUMN IF NOT EXISTS supplier_share_agorot    integer,
  ADD COLUMN IF NOT EXISTS collect_in_store_agorot  integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS coupon_price_agorot      integer;

ALTER TABLE public.order_items
  DROP COLUMN IF EXISTS escrow_held_agorot,
  DROP COLUMN IF EXISTS escrow_release_agorot;

-- vouchers (issued coupon instance)
ALTER TABLE public.vouchers
  ADD COLUMN IF NOT EXISTS face_value_agorot            integer,
  ADD COLUMN IF NOT EXISTS coupon_price_agorot          integer,
  ADD COLUMN IF NOT EXISTS remaining_amount_due_agorot  integer;

ALTER TABLE public.vouchers
  ADD CONSTRAINT vouchers_face_conservation
    CHECK (
      face_value_agorot IS NULL
      OR coupon_price_agorot IS NULL
      OR remaining_amount_due_agorot IS NULL
      OR (face_value_agorot = coupon_price_agorot + remaining_amount_due_agorot)
    );
```

כללי חישוב (domain):

```text
A(ils) = round(ils * 100)   # to agorot
platform_cut = floor(face * platform_percent / 100)  # or banker's round; pick one, test it
supplier_share = face - platform_cut                 # conservation
```

Cardcom wire נשאר בשקלים עשרוניים ב-API; המרה רק בגבול התשלום.

---

## 5. מצב חי מול יעד

| נושא | חי (נמדד ב-`DB-SCHEMA` / מיגרציות) | יעד v2 |
|---|---|---|
| סכומי מוצר | `price_ils`, `coupon_price_ils` numeric | `*_agorot` integer |
| עמלה | `platform_percent` + `commission_percent` (היה DEFAULT 5) | רק `platform_percent`, בלי default |
| קופון | מקדמה באתר; finalize → voucher | כמו חי + במפורש No Escrow / payout=0 |
| Escrow columns | שרידי `escrow_*` / enum labels | DROP / לא לכתוב |
| Snapshot | חלקי ב-`order_items` | מלא באגורות + percent pair |

---

## 6. אדמין / PDP (השלכות UI)

- חובת מילוי `platform_percent` לפני publish (פיזי; קופון לביקורת).
- שדות לקוח בקופון: מחיר דיל, מחיר קופון באתר, יתרה לתשלום בעסק (מחושב).
- אסור להציג "נאמן", "מוחזק", "Escrow", או "עמלה 5% קבועה".
- פיצול מוצג פנימית בלבד (admin/ספק לפי הרשאות).

---

## 7. Acceptance

- [ ] Publish נכשל בלי `platform_percent` (פיזי)
- [ ] אין `DEFAULT` על `platform_percent` / אין קריאת `commission_percent` ב-checkout
- [ ] קופון: ledger/platform keeps 100% של `coupon_price`; redeem בלי payout
- [ ] אין כתיבה ל-`escrow_*`
- [ ] סכומים חדשים בקוד domain באגורות integer
- [ ] UI מציג ₪ מעוגל מ-agorot

---

## 8. Revision

| תאריך | שינוי |
|---|---|
| 2026-08-10 | יצירה/יישור מודל v2: דינמי פר מוצר, No Escrow, סכמה מומלצת באגורות integer |

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-08-12 | BINDING batch-2: החלטה, חלופות, DB, קצה, פתוחות |

