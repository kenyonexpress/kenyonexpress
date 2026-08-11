# ארכיטקטורה: חוויית חיפוש

Meilisearch / FTS, השלמות בעברית, תיקון טעויות כתיב, ודירוג בלי boost מעמלה קבועה.

Status: **BINDING** · עודכן: 2026-08-12 · QA: PASS  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2` · batch #42/50  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מסמכים קשורים:

```
docs/ARCHITECTURE-SEARCH.md
docs/ARCHITECTURE-CATEGORIES-TAXONOMY.md
docs/ARCHITECTURE-SEO-PERFORMANCE.md
docs/ARCHITECTURE-PRICING-RULES.md
docs/CONTRADICTIONS.md
```

MVP דירוג: Postgres FTS. Meilisearch = UX (typo, facets, מהירות) + אינדוקס עם DLQ.  
**דירוג לא משתמש בעמלה.** אין boost לפי 5%/10%/`platform_percent`. אין margin boost מ-commission קבוע (כי אין commission קבוע).

מודל תצוגת מחיר: מחיר on-site; קופון = No Escrow (יתרה בעסק מחוץ לדירוג כסף).

---

## 0. הכרעות

| # | הכרעה |
|---|---|
| U1 | תיבה גלובלית RTL; placeholder: "חיפוש דילים ועסקים". |
| U2 | Autocomplete: 150ms debounce, מינימום 2 תווים, abort in-flight. |
| U3 | Meilisearch: typo tolerance לעברית (כשמופעל). |
| U4 | סינונים מ-`search_synonyms` (admin). |
| U5 | טעויות כתיב: Meili typo + fallback `pg_trgm`. |
| U6 | `/search` = noindex. |
| U7 | תוצאות במעטפת listing כמו קטגוריה. |
| U8 | **אין** ranking signal מ-`platform_percent`, DEFAULT commission, או "מרווח פלטפורמה". |
| U9 | מחיר בתוצאות = on-site (agorot→₪); לא face כמחיר יחיד מטעה. |

---

## 1. השלמות בעברית

```text
≥2 תווים → 150ms → GET /api/search/suggest?q=
  → עד 8 הצעות: מוצרים / קטגוריות / עסקים
  → מחיר on-site ב-₪ · סוג קופון/פיזי
```

נרמול: trim, רווחים כפולים; מילת עצירה לבד לא מספיקה.  
לחיצה → PDP או `/search?q=…`.

---

## 2. טעויות כתיב

| שכבה | מנגנון |
|---|---|
| Meilisearch | typoTolerance |
| Postgres | אם FTS חלש → trigram על `name_he` |
| UX | "התכוונת ל…?" כשיש תיקון בטוח |

סינונים לדוגמה: מסעדה↔אוכל, ספא↔עיסוי. עדכון: admin בלבד.

---

## 3. Meilisearch

| נושא | חוזה |
|---|---|
| Searchable | `name_he`, תיאור, עיר, שם ספק, keywords |
| Filterable | type, category, price_agorot, city, published |
| Sort / rank | רלוונטיות עברית + אותות מוצר לגיטימיים (למשל חדש/פופולרי אם קיימים) |
| אסור ב-rank | `platform_percent`, commission default, "margin boost" |
| מסמך | בלי PII; בלי שדות כספיים פנימיים מיותרים |
| אינדוקס | webhook → תור → index-job → DLQ |

כשל Meili → degrade ל-Postgres; לא חוסם קטלוג.

---

## 4. דירוג ו-margin (מפורש)

חיפוש מציג ומדרג לפי התאמת טקסט / קטגוריה / זמינות / אותות מוצר מוסכמים.  
אסור:

- להעלות מוצר כי `platform_percent` גבוה יותר  
- boost קבוע 5% או 10% כאילו זו מדיניות עמלה  
- לערבב "רווחיות פלטפורמה" ב-score של הלקוח  

תמחור והכנסה = PRICING + ledger. חיפוש = גילוי מוצר ללקוח.

---

## 5. Acceptance

- [ ] Suggest RTL 150ms / 2 תווים  
- [ ] Typo path (Meili ו/או trigram)  
- [ ] סינונים פעילים  
- [ ] noindex על `/search`  
- [ ] אין boost לפי platform_percent / commission default  
- [ ] מחיר on-site בתוצאות; No Escrow בנוסח קופון  

---

## 6. Revision

| תאריך | שינוי |
|---|---|
| 2026-08-06 | Meilisearch + השלמות + typo; בלי boost עמלה |
| 2026-08-07 | קישור CONTRADICTIONS |
| 2026-08-12 | batch-2 #42: BINDING; U8/U9 נגד margin boost מעמלה קבועה |
