# ארכיטקטורה: Scaling (צמיחה)

Upstash Redis, ISR, אינדקסי DB, connection pooling, CDN, עלות.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.  
מודל כסף: **No Escrow**. Redis לא מקור אמת ליתרות.

מסמכים קשורים:

```
docs/DOCS-TEMPLATE-BINDING.md
docs/ARCHITECTURE-SEO-PERFORMANCE.md
docs/ARCHITECTURE-SEARCH-DISCOVERY.md
docs/ARCHITECTURE-FRAUD-PREVENTION.md
docs/ARCHITECTURE-BACKUP-DR.md
```

---

## 0. החלטה (SC1 עד SC6)

| # | הכרעה |
|---|---|
| SC1 | קודם cache נכון לפני שדרוג DB יקר. |
| SC2 | נתיבי כסף fail-closed על rate limit. |
| SC3 | ISR לקטלוג ציבורי; dynamic לחשבון/קופה. |
| SC4 | Redis (Upstash) ל-RL / hot keys; לא מקור אמת להזמנות. |
| SC5 | Pooling ל-Supabase חובה מעל עומס serverless. |
| SC6 | מדידה לפני אופטימיזציה: p95, error rate, DB CPU. |

---

## 1. חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| read replica לפני cache | SC1; עלות |
| wallet balance ב-Redis | SC4; consistency |
| ISR על `/checkout` | stale prices; SC3 |
| fail-open RL under load | SC2; fraud |
| full table scan search at scale | Meili/SQL fallback |

---

## 2. סכמת DB

**אין DDL חדש במסמך זה.** אינדקסים יעד (ליישר למיגרציות):

| שאילתה | אינדקס |
|---|---|
| קטלוג category + published | `(category_id, status)` partial |
| orders by user | `(user_id, created_at DESC)` |
| vouchers by code | UNIQUE code |
| redeem by supplier | `(supplier_id, redeemed_at)` |
| outbox due | `(next_attempt_at) WHERE pending` |

---

## 3. Caching ו-ISR

| שימוש Redis | TTL | הערות |
|---|---|---|
| Rate limit | חלון קצר | checkout/redeem |
| Category ids | 60-120s | + Next data cache |
| Feature flags | 30-60s | |

| Page | revalidate |
|---|---|
| `/` | 120-300s |
| `/product/[slug]` | 120s + top N static |
| `/category/*` | data cache; לא HTML לכל filter |
| `/account`, `/checkout` | dynamic |

Connection pooling: Supabase pooler transaction mode ב-serverless; session mode רק למיגרציות.

---

## 4. מקרי קצה

| # | מצב | התנהגות |
|---|---|---|
| SC-E1 | Redis down at checkout | fail-closed |
| SC-E2 | ISR stale after price change | on-demand revalidate on publish |
| SC-E3 | pool exhaustion 429 | reduce fan-out; SC5 |
| SC-E4 | Meili timeout | degrade UI; SQL limited fallback |
| SC-E5 | campaign spike on redeem | RL supplier tier; לא skip lock |
| SC-E6 | CDN caches `/account` | headers private; no cache |
| SC-E7 | cron notification fan-out | concurrency cap |

---

## 5. עלות ופתוחות

| רכיב | השקה | ×10 traffic |
|---|---|---|
| Vercel Pro | ISR מוריד compute | higher tier |
| Supabase Pro + pooler | קריטי | compute upgrade |
| Upstash | קטן | לינארי ל-RL |

| # | פער | תאריך |
|---|---|---|
| O1 | Upstash wiring ב-production | 2026-08-12 |
| O2 | EXPLAIN ANALYZE top-10 pre-campaign | 2026-08-12 |
| O3 | edge middleware geo scope | 2026-08-12 |

---

## 6. Acceptance

- [ ] Upstash RL על נתיבי כסף
- [ ] ISR matrix מתועדת
- [ ] Pooler בשימוש
- [ ] CDN לא מחזיק דפים פרטיים

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-08-03 | מסמך ראשוני |
| 2026-08-12 | batch-2: DOCS-TEMPLATE-BINDING |
