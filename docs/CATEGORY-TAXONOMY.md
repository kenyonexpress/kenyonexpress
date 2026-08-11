# עץ קטגוריות לשוק הישראלי (תוכן מלא)

Status: **BINDING (CONTENT)** · עודכן: 2026-08-12
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`
אין שינוי קוד. אין נגיעה בתיקייה הראשית.
מודל כסף: No Escrow; קטגוריה לא קובעת `platform_percent`.

---

## 1. החלטה

| # | הכרעה |
|---|---|
| T1 | עץ יעד 3 רמות; slugs **E** יציבים |
| T2 | Collections נפרדות מ-taxonomy |
| T3 | L3 דורש depth guard=3 לפני prod |
| T4 | Primary taxonomy אחד לכל מוצר |
| T5 | **E**=exists, **P**=proposed |

---

## 2. חלופות שנדחו

| חלופה | נימוק |
|---|---|
| slug עברית | CHECK DB + SEO |
| עמלה לפי קטגוריה | platform_percent פר מוצר |
| L1 health נפרד מיד | שובר URL |

---

## 3. סכמת DB

**קיים:** `categories`, trigger depth≤2, seed `018_*`.
**יעד:** depth≤3; אין DDL במסמך.

---

## 4. מקרי קצה

| # | מצב | התנהגות |
|---|---|---|
| E1 | L3 לפני מיגרציה | reject |
| E2 | שינוי slug E | 301 חובה |
| E3 | מוצר בלי primary | publish fail |

---

## 5. פתוחות

| O1 | מיגרציה depth=3 | pending MCP | 2026-08-12 |

---

## 0. מה קיים ב-DB היום

מקורות: `018_seed_categories.sql`, `supabase/seed/categories.sql` (ישן), `KE_LIVE_CATEGORIES` ב-

```
src/lib/ke-live-hero-data.ts
```

מיגרציה `030_catalog.sql`: `kind` taxonomy|collection + **depth guard ≤ 2** (אב+בן בלבד).

### 0.1 Collections (לא עץ taxonomy)

| slug | name_he | kind | סטטוס |
|---|---|---|---|
| `hot-deals` | דילים חמים | collection | **exists** |
| `under-99` | עד ₪99 | collection | **exists** |
| `new` | החדשים | collection | **exists** |

### 0.2 שורשי taxonomy שטוחים (קיימים)

| slug | name_he | סטטוס |
|---|---|---|
| `restaurants-cafes` | מסעדות ובתי קפה | **exists** |
| `beauty-health` | יופי בריאות וטיפוח | **exists** |
| `phones-computers` | טלפונים מחשבים ואביזרים | **exists** |
| `baby-kids` | תינוקות וילדים | **exists** |
| `vacation` | צימרים מלונות ונופש | **exists** |
| `pets` | ציוד ומזון לבעלי חיים | **exists** |
| `professionals` | בעלי מקצוע | **exists** |
| `courses` | קורסים Express בקרוב | **exists** |
| `general` | (מופיע בנתיבי אתר / fallback) | קיים בניתוב; לא תמיד בסיד |

שורשים אלה נשארים **יציבים ב-URL**. בעץ 3 הרמות הם הופכים לרמה 1 או 2 לפי המיפוי למטה (בלי לשבור slug קיים).

### 0.3 פער עומק

| נושא | מצב |
|---|---|
| יעד המסמך | 3 רמות (L1 → L2 → L3) |
| DB היום | trigger אוסר סבא (מקס 2) |
| פעולה נדרשת בקוד (מחוץ למסמך) | להרחיב `enforce_category_depth` ל-3 **לפני** הכנסת L3 ל-prod |

עד אז: אפשר לפרסם L1+L2 בלבד; L3 = תכנון / תגיות / סינון עד המיגרציה.

סימון בעץ:

- **E** = slug קיים ב-DB (אל תשנו)
- **P** = מוצע (טרם ב-DB)

---

## 1. מסעדות ובתי קפה

L1 **E** `restaurants-cafes` · מסעדות ובתי קפה

| L2 slug | L2 name_he | L3 slug | L3 name_he | סטטוס |
|---|---|---|---|---|
| `meat` | בשרי | `meat-grill` | גריל וברביקיו | P |
| | | `meat-steakhouse` | סטייקיה | P |
| | | `meat-burger` | המבורגר | P |
| | | `meat-shawarma-falafel` | שווארמה / פלאפל | P |
| `dairy` | חלבי | `dairy-cafe` | בית קפה | P |
| | | `dairy-breakfast` | ארוחות בוקר | P |
| | | `dairy-italian` | איטלקי / פיצה / פסטה | P |
| | | `dairy-bakery` | מאפייה ומתוקים | P |
| `asian` | אסייתי | `asian-sushi` | סושי | P |
| | | `asian-noodles` | אטריות / ווק | P |
| | | `asian-thai-indian` | תאילנדי / הודי | P |
| `seafood` | דגים ופירות ים | `seafood-fish` | דגים | P |
| | | `seafood-mixed` | פירות ים | P |
| `delivery-takeaway` | משלוחים ואיסוף | `delivery-only` | משלוחים | P |
| | | `takeaway` | איסוף עצמי | P |
| `fine-dining` | שף ומסעדת בוטיק | `chef-menu` | תפריט שף | P |
| `bars-nightlife` | ברים ולילה | `bars-cocktails` | קוקטיילים | P |
| | | `bars-pubs` | פאבים | P |

מיפוי מוצרים קיימים: נשארים תחת `restaurants-cafes` עד שממלאים L2/L3 ב-admin.

---

## 2. יופי, ספא ובריאות

ב-DB היום שורש אחד **E** `beauty-health`. בעץ היעד מפצלים תוכן ליופי/ספא מול בריאות (L2), בלי לשבור את ה-slug הראשי.

L1 **E** `beauty-health` · יופי בריאות וטיפוח

| L2 slug | L2 name_he | L3 slug | L3 name_he | סטטוס |
|---|---|---|---|---|
| `spa` | ספא ועיסוי | `spa-massage` | עיסוי | P |
| | | `spa-hammam` | חמאם / סאונה | P |
| | | `spa-couples` | זוגי | P |
| `beauty` | יופי וטיפוח | `beauty-facial` | טיפולי פנים | P |
| | | `beauty-nails` | ציפורניים | P |
| | | `beauty-makeup` | איפור | P |
| | | `beauty-cosmetics` | קוסמטיקה / מוצרים | P |
| `hair` | שיער | `hair-cut` | תספורת | P |
| | | `hair-color` | צבע / החלקה | P |
| | | `hair-barber` | מספרת גברים | P |
| `health` | בריאות | `health-clinic` | מרפאות / בדיקות | P |
| | | `health-dental` | שיניים | P |
| | | `health-nutrition` | תזונה | P |
| | | `health-therapy` | טיפולים משלימים | P |

אלטרנטיבה עתידית (לא לשבור URL): L1 נפרד `health` **P** עם redirect מ-`beauty-health/health/*` רק אחרי החלטת SEO.

---

## 3. אטרקציות ופנאי

אין שורש אטרקציות ב-DB. מוצע L1 חדש לפי ארכיטקטורה T6.

L1 **P** `attred` · אטרקציות ופנאי

| L2 slug | L2 name_he | L3 slug | L3 name_he | סטטוס |
|---|---|---|---|---|
| `tickets` | כרטיסים | `tickets-shows` | הופעות | P |
| | | `tickets-museum` | מוזיאונים | P |
| | | `tickets-park` | פארקים | P |
| `workshops` | סדנאות | `workshops-cooking` | בישול | P |
| | | `workshops-craft` | יצירה | P |
| `experiences` | חוויות | `experiences-adventure` | אקסטרים | P |
| | | `experiences-family` | משפחתי | P |
| | | `experiences-date` | זוגי | P |

L1 **E** `courses` נשאר לצד: קורסים Express (אוסף / בקרוב), לא מחליף אטרקציות.

---

## 4. חופשות ונופש

L1 **E** `vacation` · צימרים מלונות ונופש

| L2 slug | L2 name_he | L3 slug | L3 name_he | סטטוס |
|---|---|---|---|---|
| `zimmer` | צימרים | `zimmer-north` | צפון | P |
| | | `zimmer-south` | דרום | P |
| | | `zimmer-center` | מרכז | P |
| `hotels` | מלונות | `hotels-boutique` | בוטיק | P |
| | | `hotels-city` | עירוני | P |
| | | `hotels-resort` | ריזורט | P |
| `packages` | חבילות נופש | `packages-weekend` | סופ״ש | P |
| | | `packages-breakfast` | כולל ארוחת בוקר | P |
| `abroad` | חו״ל (אם יימכר) | `abroad-short` | קצר | P |

---

## 5. לבית ולגן

אין `home` ב-DB. מוצע.

L1 **P** `home` · לבית ולגן

| L2 slug | L2 name_he | L3 slug | L3 name_he | סטטוס |
|---|---|---|---|---|
| `furniture` | ריהוט | `furniture-living` | סלון | P |
| | | `furniture-bedroom` | חדר שינה | P |
| `appliances` | חשמל ביתי | `appliances-kitchen` | מטבח | P |
| | | `appliances-cleaning` | ניקיון | P |
| `garden` | גינה וחצר | `garden-tools` | כלי גינון | P |
| | | `garden-outdoor` | ריהוט חוץ | P |
| `decor` | עיצוב ודקור | `decor-lighting` | תאורה | P |

אלקטרוניקה קיימת בנפרד: **E** `phones-computers` (לא תחת home).

---

## 6. רכב

אין שורש רכב. חלק מבעלי מקצוע יכולים לכסות שירותי רכב זמנית.

L1 **P** `auto` · רכב ותחבורה

| L2 slug | L2 name_he | L3 slug | L3 name_he | סטטוס |
|---|---|---|---|---|
| `auto-service` | שירות ותחזוקה | `auto-garage` | מוסך | P |
| | | `auto-detailing` | ניקוי / פוליש | P |
| `auto-gear` | אביזרים | `auto-electronics` | אלקטרוניקה לרכב | P |
| | | `auto-care` | טיפוח רכב | P |
| `driving` | נהיגה | `driving-lessons` | שיעורי נהיגה | P |

מיפוי ביניים: שירותי רכב תחת **E** `professionals` עד יצירת `auto`.

---

## 7. בריאות (פירוט נוסף)

כשרוצים L1 ייעודי (מעבר ל-L2 `health` תחת beauty-health):

L1 **P** `health` · בריאות ורפואה משלימה

| L2 slug | L2 name_he | L3 slug | L3 name_he | סטטוס |
|---|---|---|---|---|
| `medical` | רפואי | `medical-checks` | בדיקות | P |
| | | `medical-dental` | שיניים | P |
| `wellness` | וולנס | `wellness-yoga` | יוגה / פילאטיס | P |
| | | `wellness-nutrition` | תזונה | P |
| `mental` | נפשי / ייעוץ | `mental-coaching` | אימון אישי | P |

עד ההפרדה: כל מוצרי הבריאות נשארים תחת **E** `beauty-health`.

---

## 8. שורשים קיימים נוספים (נשמרים)

| L1 slug | name_he | L2 מוצע (P) | הערה |
|---|---|---|---|
| `phones-computers` **E** | טלפונים מחשבים ואביזרים | `mobile`, `computers`, `accessories` | אלקטרוניקה |
| `baby-kids` **E** | תינוקות וילדים | `diapers`, `toys`, `kids-fashion` | |
| `pets` **E** | ציוד ומזון לבעלי חיים | `dogs`, `cats`, `pet-food` | |
| `professionals` **E** | בעלי מקצוע | `home-services`, `office`, `auto-service` (זמני) | |
| `courses` **E** | קורסים Express | `courses-online`, `courses-local` | |

---

## 9. כללי slug ו-URL

| כלל | פירוט |
|---|---|
| פורמט | `^[a-z0-9]+(-[a-z0-9]+)*$` (כמו CHECK ב-DB) |
| שפה | slug באנגלית; `name_he` בעברית בלבד ללקוח |
| יציבות | **אסור** לשנות slug של שורת **E** בלי redirect 301 |
| נתיב | `/category/{slug}` (הילד; breadcrumb מההורים) |
| Primary | כל מוצר חייב taxonomy ראשי אחד (T4) |

---

## 10. סדר הטמעה מומלץ

1. להרחיב depth guard ל-3 (מיגרציה MCP).  
2. להוסיף L2 תחת `restaurants-cafes`, `beauty-health`, `vacation` (הכי חמים).  
3. L1 חדשים: `home`, `attred`, `auto` לפי מלאי.  
4. L3 רק אחרי שיש מספיק מוצרים בכל ענף.  
5. Collections נשארות כפי שהן.

---

## 11. Acceptance

- [ ] כל slug **E** מופיע ושמור
- [ ] עץ מתועד ב-3 רמות לפחות למסעדות / יופי / חופשות
- [ ] אין עמלה על קטגוריה
- [ ] ברור ש-L3 דורש שינוי depth ב-DB לפני insert

---

## 12. Revision

| תאריך | שינוי |
|---|---|
| 2026-08-10 | עץ מלא 3 רמות + מיפוי exists מול DB/seed/hero |

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-08-12 | BINDING batch-2: החלטה, חלופות, DB, קצה, פתוחות |

