# ARCHITECTURE: Scaling

תוכנית צמיחה: Upstash Redis, כוונון ISR, אינדקסי DB, connection pooling, CDN ב-Vercel Edge, הערכות עלות.

Status: **BINDING** · Updated: 2026-08-03  
Scope: **docs only** · branch `arch/docs-queue`  
אין שינוי קוד. אין נגיעה ב-worktree הראשי.

Companions:

```
docs/ARCHITECTURE-SEO-PERFORMANCE.md
docs/ARCHITECTURE-SEARCH-DISCOVERY.md
docs/ARCHITECTURE-BACKUP-DR.md
docs/ARCHITECTURE-FRAUD-PREVENTION.md
docs/LAUNCH-DAY.md
```

---

## 0. הכרעות מחייבות

| # | הכרעה |
|---|---|
| SC1 | קודם cache נכון לפני שדרוג DB יקר. |
| SC2 | נתיבי כסף (checkout, redeem, wallet) **fail-closed** על rate limit; לא fail-open. |
| SC3 | ISR לקטלוג ציבורי; dynamic לחשבון/קופה. |
| SC4 | Redis (Upstash) ל-rate limit / session bits / hot keys; לא מקור אמת להזמנות. |
| SC5 | Pooling ל-Supabase/Postgres חובה מעל עומס serverless. |
| SC6 | מדידה לפני אופטימיזציה: p95 latency, error rate, DB CPU, Meili qps. |

---

## 1. Caching strategy (Upstash Redis)

| שימוש | מפתח לדוגמה | TTL | הערות |
|---|---|---|---|
| Rate limit | `rl:{route}:{id}` | חלון קצר | checkout/redeem/login |
| Category product ids | `cat:{slug}:v{n}` | 60–120s | לצד data cache של Next |
| Feature flags | `ff:{name}` | 30–60s | |
| Idempotency short lock | `idem:{key}` | דקות | מונע כפל לחיצה |
| Hot PDP fragment | אופציונלי | ≤120s | עדיף Next data cache / ISR |

אסור ב-Redis כמקור אמת: יתרת ארנק, סטטוס voucher, ledger.

SDK יעד: `@upstash/redis` + `@upstash/ratelimit`.

---

## 2. ISR tuning

מתוך SEO-PERFORMANCE + כוונון צמיחה:

| Page | עכשיו / יעד | תחת עומס |
|---|---|---|
| `/` | `revalidate = 120` | אפשר 300 אם תוכן יציב |
| `/product/[slug]` | 120 + `generateStaticParams` top N | להרחיב N עם פופולריות; on-demand ב-publish |
| `/category/[slug]` | force-dynamic עם filters | cache data layer; לא HTML אחד לכל filter |
| `/sitemap.xml` | 3600 | OK |

On-demand: `revalidatePath` / `revalidateTag` אחרי publish.  
לא להעלות revalidate על דפי כסף.

---

## 3. DB indexes

אינדקסים קריטיים (לוגיים; לאס ליישר למיגרציות):

| שאילתה | אינדקס יעד |
|---|---|
| קטלוג לפי category + published | `(category_id, status)` / partial published |
| מוצר לפי slug | UNIQUE slug |
| הזמנות למשתמש | `(user_id, created_at DESC)` |
| paid_at / webhook | `(status, paid_at)` |
| vouchers למשתמש | `(user_id, status)` |
| vouchers לפי code | UNIQUE code |
| redeem by supplier | `(supplier_id, redeemed_at)` |
| outbox due | `(next_attempt_at) WHERE status=pending` |
| order_items by supplier | `(supplier_id, order_id)` |

בדיקה: `EXPLAIN ANALYZE` על top 10 queries לפני קמפיין.

---

## 4. Connection pooling

| סביבה | גישה |
|---|---|
| Vercel serverless | Supabase pooler (transaction mode) לרוב ה-API |
| Migrations / long tx | session mode / direct בזהירות |
| Edge | לא לפתוח pool כבד; העדף REST/RPC קצרים |

כללים:

- לא ליצור `createClient` עם חיבורים ללא הגבלה בכל request בלי reuse של ה-SDK
- הגבלת concurrency על cron כבדים (notifications, index, expiry)

---

## 5. CDN / Vercel Edge

| שכבה | תפקיד |
|---|---|
| Vercel CDN | HTML ISR + static assets |
| `next/image` + R2 | תמונות; cache headers ארוכים ל-immutable hashes |
| Edge middleware | auth gate קל, geo אופציונלי; לא business logic כבד |
| Meilisearch | אזור קרוב (EU) ל-latency מישראל |

Headers: cache-control נכון ל-private vs public.  
אין CDN cache ל-`/account`, `/checkout`, `/api` רגיש.

---

## 6. Search under load

- Meili: replicas / גדול מופע כש-qps עולה
- Debounce client; rate limit `/api/search`
- Fallback: SQL `ilike` מוגבל רק אם Meili down (הודעת "חיפוש מוגבל")

---

## 7. Cost projections (סדר גודל)

הערכות גסות לתכנון (לא הצעת מחיר):

| רכיב | שלב השקה | ×10 טראפיק | הערות |
|---|---|---|---|
| Vercel | Pro | Pro / higher | ISR מוריד compute |
| Supabase | Pro | Compute upgrade | pooling קריטי |
| Upstash | Pay-as-you-go קטן | גדילה לינארית ל-RL | זול מול DB |
| Meilisearch Cloud / VPS | קטן | medium | אינדקס קטלוג לא ענק בהתחלה |
| Resend | לפי אימייל טרנזקציוני | לינארי להזמנות | |
| Cardcom | עמלה לעסקה | לינארי | לא infra |
| R2 | אחסון תמונות | גדילה איטית | egress דרך CDN |

עקרון עלות: כל page_view לא צריך hit ל-Postgres. כל search לא צריך full table scan.

---

## 8. Capacity playbook

| סימפטום | פעולה ראשונה |
|---|---|
| TTFB גבוה ב-PDP | בדוק ISR hit ratio; origin DB |
| 429 מ-Supabase | pooling + הקטנת fan-out |
| Redeem איטי | אינדקס + פחות joins; rate limit הוגן |
| Checkout spike | RL + queue webhooks; לא לשבור idempotency |
| Meili timeout | scale Meili; degrade UI |

---

## 9. Acceptance

- [ ] Upstash RL על נתיבי כסף
- [ ] ISR matrix מתועדת ומכווננת
- [ ] אינדקסי DB לרשימת השאילתות החמות
- [ ] Pooler בשימוש ב-serverless
- [ ] CDN לא מחזיק דפים פרטיים
- [ ] הערכות עלות מעודכנות לפני קמפיין גדול

---

## 10. Revision

| Date | Change |
|---|---|
| 2026-08-03 | מסמך ראשוני על arch/docs-queue |
