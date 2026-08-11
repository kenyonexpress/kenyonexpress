# ARCHITECTURE: AI Agents

ארכיטקטורת סוכני AI ל-KenyonExpress (עוזר קניות, המלצת קופונים, חיפוש עברי NLP).

Status: **BINDING** · Updated: 2026-08-02  
Scope: docs only.  
Companions:

```
docs/ARCHITECTURE-CATALOG-SEARCH-SEO.md
docs/ARCHITECTURE-PERSONAL-AREA.md
docs/ARCHITECTURE-NOTIFICATIONS.md
docs/ARCHITECTURE-SECURITY.md
```

Stack: Next.js Route Handlers / Server Actions כמארחי tools, Supabase Postgres + RLS, **Claude API** (עברית) עם מפתחות server-only, Meilisearch/Postgres לחיפוש, Cloudflare R2 למדיה, audit ב-`agent_runs` / `agent_run_steps`.

---

## 0. הכרעות כסף ובטיחות (כל סוכן)

| כלל | השלכה |
|---|---|
| קופון = Escrow פנימי (2026-07-27) | "שולם באתר" = `coupon_price`. יתרה בבית העסק. חלק המקדמה לספק ב-held עד מימוש. אין J5 חיצוני. |
| `platform_percent` דינמי | אסור להמציא 5%/10%. קריאה מ-snapshot ב-`order_items` להזמנות עבר; שינוי live רק עם אישור אנושי. |
| כסף ב-tools/logs | integer **agorot**. תצוגה ללקוח: ₪. |
| פלטפורמה | לנקוב בשם הספק; לא להציג את KE כבעל העסק של הדיל. |

איסורים גלובליים:

1. אין כתיבת כסף / publish / redeem / refund / payout בלי שערי אישור אנושי (או בלי tool בכלל).
2. אין Cardcom charge/refund, redeem, או payout כ-tool ללקוח.
3. אין service role בכלים שפונים ללקוח (JWT + RLS בלבד).
4. קודי קופון / `qr_payload`: מסכה בלוגים (4 תווים אחרונים לכל היותר).
5. כל ריצה append-only עם `cost_agorot`.
6. Kill switch: `AI_AGENTS_ENABLED=false`.

---

## 1. קטלוג סוכנים (ליבה מבוקשת + תומכים)

| `agent_type` | משימה | כתיבה בלי אישור? |
|---|---|---|
| `shopping_assistant` | עוזר קניות בעברית: שאלות, השוואת דילים, ניווט לקטלוג | לא (קריאה + הצעות בלבד) |
| `coupon_recommender` | דירוג/המלצת קופונים לפי כוונה, מיקום, תקציב, היסטוריה | לא |
| `hebrew_nlp_search` | הבנת שאילתת חיפוש עברית → שאילתה מובנית לחיפוש | לא (רק rewrite/parse) |
| `product_copy` | טיוטות PDP/SEO מעברית גולמית של ספק | draft בלבד |
| `support_chat` | עזרה על הזמנות/קופונים | בלי כתיבת כסף; escalate |
| `price_monitor` | השוואת מחירים מול אתרי דילים | הצעות בלבד |
| `admin_whatsapp_copilot` | טיוטת מוצר מהודעת WhatsApp | draft + approval queue |

---

## 2. AI shopping assistant

### 2.1 מטרה

צ'אט / פאנל עזרה בקטלוג שעונה בעברית על:

- "יש קופון לארוחה זוגית בתל אביב עד 200?"
- "מה ההבדל בין שולם באתר ליתרה בעסק?"
- "איפה הקופונים שלי?" (עם deep link ל-`/account/coupons` אחרי login)

### 2.2 כלים מותרים (read-only)

| Tool | תפקיד |
|---|---|
| `search_catalog` | קריאה ל-search API (אחרי NLP rewrite) |
| `get_product` | PDP facts: שם, סוג, מחירים באגורות, ספק, תוקף |
| `get_my_orders` / `get_my_vouchers` | רק עם JWT של המשתמש הנוכחי |
| `explain_pricing` | מסביר snapshot: שולם באתר / יתרה / אין אחוז קבוע |
| `open_url` | מחזיר path פנימי בלבד (`/product/...`, `/account/...`) |

אסור: `refund`, `redeem`, `wallet_adjust`, שינוי כתובת משלוח, יצירת הזמנה.

### 2.3 System prompt (חוזה תוכן)

חובה ב-prompt:

1. ענה בעברית; מספרים וקודי הזמנה ב-LTR isolation.
2. לעולם לא להמציא מחיר. רק מ-tool result.
3. להסביר קופון בשני מספרים: שולם באתר + יתרה בבית העסק.
4. לא להבטיח payout לספק או "הכסף אצל נאמן חיצוני".
5. אם חסר login לפעולה אישית: לבקש התחברות עם `next=`.
6. אם הבקשה משפטית/כספית רגישה: escalate לתמיכה אנושית.

### 2.4 UX

- Entry: כפתור "עזרה בקנייה" בקטלוג / חיפוש (לא באנר שיווקי אגרסיבי).
- Rate limit: נמוך ל-RPM למשתמש (ראה fraud doc).
- Audit: כל תשובה עם `run_id` לתמיכה.

---

## 3. Coupon recommendation engine

### 3.1 קלט

| אות | מקור |
|---|---|
| כוונה חופשית | טקסט משתמש / NLP entities |
| קטגוריה / עיר / תגיות | catalog facets |
| תקציב מקסימלי לשולם-באתר | מהמשתמש (agorot אחרי parse) |
| היסטוריית רכישה | `orders`/`vouchers` של המשתמש (RLS) |
| פופולריות | analytics rollups (לא כסף גולמי מאירועים) |

### 3.2 דירוג (דטרמיניסטי + LLM)

שלב A (SQL/Meilisearch, חובה):

1. סנן `published` + `product_type = coupon` + מלאי/תוקף.
2. סנן תקציץ על `coupon_price_*` (לא על face).
3. העדף התאמת קטגוריה/עיר/תג.
4. הורד מוצרים שכבר מומשו לאחרונה ע"י המשתמש (אופציונלי).

שלב B (LLM, אופציונלי):

- מקבל עד N מועמדים (ids + facts באגורות) ומחזיר דירוג + משפט הסבר בעברית.
- אסור להוסיף מוצר שלא בשלב A.
- אסור לשנות מחיר.

פלט ל-UI:

```json
{
  "items": [
    {
      "product_id": "…",
      "score": 0.91,
      "reason_he": "מתאים לארוחה זוגית בתקציב שציינת",
      "paid_on_site_agorot": 8900,
      "remaining_due_agorot": 21100
    }
  ]
}
```

### 3.3 Idempotency / caching

- Cache המלצות ל-query hash + user bucket ל-15 דק׳ (לא לשבור מחיר חי).
- `dedupe_key` ב-`agent_runs`: `coupon_recommender:{user}:{hash}`.

---

## 4. Hebrew NLP search

### 4.1 בעיה

שאילתות כמו "מסעדה כשר למהדרין בצפון תל אביב עד מאה שח" לא עובדות כ-LIKE פשוט. צריך:

1. נרמול עברית (ניקוד, כתיב מלא/חסר בסיסי, טעויות נפוצות).
2. חילוץ entities: קטגוריה, עיר/אזור, סוג (קופון/פיזי), תקציב, כשרות, מספר סועדים.
3. בניית filters ל-Meilisearch / Postgres FTS.

### 4.2 Pipeline

```text
raw query (he)
  → normalize_he (deterministic)
  → parse_intent (LLM או rules+LLM)
       { q_text, category_slugs[], city, product_type?,
         max_paid_on_site_agorot?, tags[] }
  → search_catalog(filters)
  → results UI (אותו קומפוננט חיפוש כמו היום)
```

`hebrew_nlp_search` **לא** מחליף את מנוע החיפוש. הוא רק מתרגם כוונה ל-filters.  
אם ה-parse נכשל: fallback לחיפוש טקסטual על המחרוזת המנורמלת.

### 4.3 נרמול דטרמיניסטי (לפני LLM)

- trim, collapse spaces, הסרת ניקוד.
- המרת ספרות עבריות נפוצות / "שח" / "₪" → מספר.
- מיפוי מילות מקום בסיסי (ת"א → תל אביב) מטבלת synonyms ב-DB/config.
- אסור שה-LLM יהיה מקור האמת היחיד לתקציב: regex/number parse קודם.

### 4.4 חוזה parse

```ts
type SearchIntent = {
  q_text: string
  category_slugs: string[]
  city: string | null
  product_type: 'coupon' | 'physical' | null
  max_paid_on_site_agorot: number | null
  tags: string[]
  confidence: number // 0..1; מתחת לסף → fallback
}
```

### 4.5 הערכה

סט זהב בעברית (מינימום 50 שאילתות): דיוק filters, recall@10, וזמן p95.  
רגרסיה: שאילתה עם מחיר מומצא מהמודל = כשל בדיקה.

---

## 5. Runtime משותף

```text
Actor
  → Route Handler / Server Action (auth)
  → orchestrator (system prompt + tools + turn cap)
  → Claude API (server key)
  → tool executors (RLS JWT / staff)
  → agent_runs / agent_run_steps (masked)
  → approval_queue רק לכתיבות admin
```

טבלאות יעד: `agent_runs`, `agent_run_steps`, `agent_approvals` (כמו טיוטות קודמות).  
`agent_type` חייב לכלול לפחות: `shopping_assistant`, `coupon_recommender`, `hebrew_nlp_search`.

תקציב: hard stop יומי על `cost_agorot`. העדפה לכללי SQL/Meilisearch לפני קריאת LLM.

---

## 6. אבטחה ופרטיות

- אין מפתחות Anthropic בדפדפן.
- תשובות לא כוללות אימייל/טלפון של משתמשים אחרים.
- Support tools: רק שורות `user_id = auth.uid()` או escalate לצוות.
- PII ב-steps: מינימום; קודי קופון ממוסכים.
- Rate limit נפרד ל-`shopping_assistant` ו-`hebrew_nlp_search` (abuse = עלות).

---

## 7. Acceptance

- [ ] עוזר קניות עונה בעברית בלי להמציא מחירים
- [ ] ממליץ קופונים רק מתוך מועמדים מסוננים; מציג שולם באתר + יתרה
- [ ] NLP search ממיר שאילתת עברית ל-filters; יש fallback בטוח
- [ ] אין tool ל-redeem/refund/payout
- [ ] Kill switch מכבה את כל הסוכנים
- [ ] כל ריצה מבוקרת עם `cost_agorot`

---

## 8. Out of scope (יום 1)

- סוכן שמבצע checkout בשם המשתמש
- שיחת קול
- אימון מודל פרטי על נתוני לקוחות בלי מדיניות מחיקה/הסכמה

---

## 9. Revision

| Date | Change |
|---|---|
| 2026-07-30 | קטלוג סוכנים ראשוני (copy/support/wp) |
| 2026-08-02 | ליבה מחייבת: shopping assistant, coupon recommender, Hebrew NLP search; מודל Escrow 2026-07-27 |
