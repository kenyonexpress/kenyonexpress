# ארכיטקטורה: אינטגרציות עתידיות (Wolt / Gett בסגנון)

ורטיקלים של משלוחי אוכל והסעות: **בנייה פנימית** בתוך KenyonExpress, webhooks נכנסים, ומיפוי הזמנות לליבת `orders` / תשלומים.

Status: **DESIGN → BINDING על העקרונות** · עודכן: 2026-08-10  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-lifecycle`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מסמכים קשורים:

```
docs/ARCHITECTURE-MOBILE-APP.md
docs/ARCHITECTURE-MOBILE-SUPERAPP.md
docs/ARCHITECTURE-NOTIFICATIONS.md
docs/ARCHITECTURE-API-CONTRACTS.md
docs/CARDCOM-ARCHITECTURE.md
docs/CONTRADICTIONS.md
docs/BUSINESS-MODEL.md
```

עקרון: **לא מחברים את כרטיס הלקוח ל-Wolt/Gett חיצוניים.** בונים יכולות "בסגנון" כורטיקל פנימי, על אותו Supabase + Cardcom + ledger.

---

## 0. הכרעות

| # | הכרעה |
|---|---|
| I1 | ורטיקל = קוד ב-`verticals/<key>` שמקומפל **לתוך** האפ/שרת. אין הורדת JS זר בזמן ריצה (מגבלות חנות + אבטחה). |
| I2 | כסף רק דרך ליבת checkout הקיימת (Cardcom + webhook). ורטיקל לא כותב `payments` / wallet ישירות. |
| I3 | הזמנת ורטיקל = שורת `orders` עם `vertical=<key>` + טבלת פירוט (`delivery_jobs` / `ride_jobs`). |
| I4 | Webhooks **נכנסים** (סטטוס שליח / נהג / ספק מטבח) חתומים + idempotent; נרשמים לפני side effects. |
| I5 | מיפוי סטטוסים חיצוני→פנימי בטבלה אחת; אסור לעדכן `paid` מ-webhook ורטיקל. |
| I6 | קופון חנות נשאר No Escrow; ורטיקל משלוח/נסיעה = חיוב מלא on-site לפי מחיר הוורטיקל (לא מקדמת קופון). |
| I7 | Kill switch: `verticals.status = paused` מוריד UI + deep links בלי שחרור חנות. |

---

## 1. מה בונים (ולא מה מחברים)

| ורטיקל | אנלוגיה | מה פנימי |
|---|---|---|
| `food` | חוויית Wolt | תפריט ספקים, עגלת מנות, שיבוץ שליח, מעקב GPS |
| `rides` | חוויית Gett | בקשת נסיעה, שיבוץ נהג, מעקב, תעריף |
| `shop` | החנות הקיימת | קופונים + פיזי (כבר ליבה) |

אסור בשלב זה:

- OAuth לחשבון Wolt/Gett של הלקוח  
- הטמעת WebView של אפ צד ג' כמסלול תשלום  
- שיתוף `cardcom_token` עם ספק חיצוני  

מותר בעתיד (מסמך נפרד): ייצוא קטלוג / affiliate אם יהיה הסכם מסחרי. לא חלק מהמפרט הזה.

---

## 2. בנייה פנימית (מבנה)

```text
verticals/
  food/
    manifest.ts          # key, permissions, deepLinkPrefixes
    screens/             # Expo Router stack תחת /v/food
    server/              # route handlers scoped: /api/verticals/food/*
  rides/
    ...
packages/shared-types    # VerticalOrderDraft, job status enums
apps/mobile              # core shell מזריק KenyonKit מוגבל הרשאות
apps/web                 # אותם APIs; SEO לורטיקל רק אם הוחלט index
```

Manifest (תמצית; פירוט ב-`ARCHITECTURE-MOBILE-SUPERAPP.md` §4):

```ts
{
  key: "food",
  entry: "/v/food",
  deepLinkPrefixes: ["/food"],
  permissions: ["payments:checkout", "location:foreground", "push:topics"],
  notificationTopics: ["food.job_update", "food.eta"]
}
```

ורטיקל מקבל `KenyonKit.payments.checkout(draft)` בלבד. הליבה יוצרת order, פותחת Cardcom, וממתינה ל-webhook התשלום הקיים.

---

## 3. מיפוי הזמנות

### 3.1 מודל נתונים (יעד)

```sql
-- on orders (additive)
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS vertical text NOT NULL DEFAULT 'shop';
  -- 'shop' | 'food' | 'rides'

-- example detail table
CREATE TABLE IF NOT EXISTS public.delivery_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id),
  external_ref text,                 -- id אצל ספק משלוחים פנימי/קבלן
  status text NOT NULL,              -- see map below
  pickup jsonb,
  dropoff jsonb,
  courier_user_id uuid,
  eta_at timestamptz,
  raw_last_event jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS delivery_jobs_order_uq ON public.delivery_jobs(order_id);
CREATE UNIQUE INDEX IF NOT EXISTS delivery_jobs_ext_uq
  ON public.delivery_jobs(external_ref) WHERE external_ref IS NOT NULL;
```

כסף בשורות: **agorot integer** (או המרה מ-`*_ils` עד cut-over).  
`platform_percent` לורטיקל פיזי/שירות: פר מוצר/מסלול, בלי default גלובלי.

### 3.2 מיפוי סטטוסים (food לדוגמה)

| אירוע נכנס (ספק/שליח) | `delivery_jobs.status` | `orders` / תשלום |
|---|---|---|
| `quote_created` | `draft` | אין חיוב |
| `customer_paid` | `paid_accepted` | רק אחרי Cardcom succeeded (לא מהשליח) |
| `merchant_accepted` | `preparing` | ללא שינוי תשלום |
| `courier_assigned` | `assigned` | |
| `picked_up` | `picked_up` | |
| `delivered` | `delivered` | מאפשר settlement/payout לפי מדיניות פיזי/שירות |
| `cancelled_by_customer` | `cancelled` | refund לפי LEGAL |
| `failed_delivery` | `failed` | תמיכה + refund/זכות לפי דין |

**I5:** webhook ורטיקל לעולם לא מעביר `orders` ל-`paid`. רק מסלול התשלום הקיים.

### 3.3 Idempotency

```text
idempotency_key = "{vertical}:{external_event_id}"
```

טבלת `vertical_webhook_events (id, vertical, external_event_id UNIQUE, payload, processed_at)`.

---

## 4. Webhooks נכנסים

### 4.1 Endpoint

```text
POST /api/verticals/{key}/webhooks/{provider}
```

| דרישה | פירוט |
|---|---|
| אימות | HMAC / signature header לפי ספק הקבלן; secret ב-env |
| Replay | חלון זמן + nonce / event id ייחודי |
| סדר | עיבוד לפי `occurred_at`; אירועים ישנים לא דורסים חדשים |
| תשובה | `200` אחרי כתיבת האירוע; עיבוד כבד ב-queue אם צריך |
| כישלון אימות | `401`; לא כותבים payload רגיש ללוג גולמי |

Cardcom נשאר ב-`/api/payments/cardcom/webhook` הקיים. לא לערבב.

### 4.2 זרימה

```text
קבלן משלוחים/נהגים
  → POST webhook חתום
  → verify + insert vertical_webhook_events (idempotent)
  → map status → delivery_jobs / ride_jobs
  → notify user (push topic food.* / rides.*)
  → אם delivered: סמן זכאות payout פנימית (לא קופון-Escrow)
```

### 4.3 Outbound (אופציונלי)

קריאות מהשרת לקבלן (שיבוץ, ביטול) רק עם service role בשרת, timeout, ו-circuit breaker. האפ לא מדברת עם הקבלן ישירות.

---

## 5. Deep links ו-Push

| קישור | התנהגות |
|---|---|
| `https://kenyonexpress.co.il/food/...` | אפ אם מותקנת; אחרת web או מסך "בקרוב" |
| `kenyonexpress://v/food/jobs/{id}` | מעקב הזמנה אחרי push |

Push דרך אותו outbox; topics עם קידומת הוורטיקל בלבד (`food.job_update`).

כש-`paused`: כל deep link → מסך "השירות לא זמין כרגע".

---

## 6. כסף ומודל v2

| סוג | כלל |
|---|---|
| חנות `shop` קופון | No Escrow; מקדמה לפלטפורמה; יתרה בעסק |
| `food` / `rides` | חיוב מלא באתר/אפ על מחיר העסקה; פיצול לספק/שליח לפי כללי ורטיקל + snapshot |
| Refund | אותו מנוע Cardcom + LEGAL; ורטיקל לא ממציא זיכוי |

אין J5. אין held לקופון חנות בתוך ורטיקל.

---

## 7. סדר יישום

```text
V0  ליבת shop יציבה באפ (MOBILE-APP M1-M4)
V1  טבלת verticals + kill switch + hub UI ריק
V2  food: הזמנה + Cardcom + job status ידני (בלי קבלן)
V3  webhook נכנס מקבלן משלוחים + מיפוי סטטוסים
V4  rides לפי אותו תבנית
```

---

## 8. Acceptance

- [ ] ורטיקל לא מחזיק Cardcom secrets  
- [ ] אין עדכון `paid` מ-webhook ורטיקל  
- [ ] event id כפול לא יוצר כפל סטטוס  
- [ ] `paused` מנתק deep links תוך דקה (config refresh)  
- [ ] סכומים באגורות / אותו shared-money  
- [ ] אין נוסח Escrow לקופוני חנות בתוך מסכי food/rides  

---

## 9. Out of scope

- חוזה מסחרי עם Wolt/Gett כמותג  
- ביטוח שליחים / רישוי מוניות (משפטי נפרד)  
- תמחור surge מלא (גרסה מאוחרת)  

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-08-10 | מסמך ראשון: בנייה פנימית, webhooks נכנסים, מיפוי הזמנות ל-food/rides |
