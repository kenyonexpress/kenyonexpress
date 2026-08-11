# ארכיטקטורה: Roadmap (סדר הבנייה)

סדר ביצוע מהיום עד השקה: שערים G0-G7, תלויות, חוסמים מדודים.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.  
מודל כסף: **No Escrow**. `platform_percent` per product, no default.

מסמכים קשורים:

```
docs/DOCS-TEMPLATE-BINDING.md
docs/MASTER-ARCHITECTURE.md
docs/CONTRADICTIONS.md
docs/ARCHITECTURE-OPS.md
docs/ARCHITECTURE-SECURITY.md
docs/ARCHITECTURE-WP-MIGRATION.md
```

כפוף ל-`MASTER-ARCHITECTURE.md`. סותר לוחות זמנים ישנים: **מסמך זה גובר** (מבוסס מדידה).

---

## 0. החלטה (RM1 עד RM8)

| # | הכרעה |
|---|---|
| RM1 | שמונה שערים G0-G7; שער נסגר רק כשכל שורותיו ירוקות. |
| RM2 | G0 (תשתית) לפני G1 (קטלוג); G2 (אבטחת כסף) לפני G3 (שקל ראשון). |
| RM3 | G4/G5/G6 במקביל אחרי G1/G0; G7 רק כשכולם ירוקים. |
| RM4 | אין feature חדש (מנויים, AI, RN) לפני שיגור shop. |
| RM5 | `platform_percent` על כל מוצר: החלטה עסקית, לא default טכני. |
| RM6 | E2E ב-CI חייב `CI_SUPABASE_URL` (לא skip). |
| RM7 | DB forward-only; rollback קוד בלבד. |
| RM8 | שני חוסמים לא-טכניים: 1.1 (61 אחוזים) ו-6.12 (עו״ד). |

---

## 1. חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| soft-open לפני SEC-QR/SEC-WALLET | G2 חוסם G3 |
| cutover לפני redirects WP | G5 חוסם G7 |
| default platform_percent 10% | RM5; C1 |
| Meilisearch לפני Postgres FTS מדוד | out of scope v1 |
| parallel G2 skip | RISK-5 FORCE RLS |

---

## 2. סכמת DB

**אין DDL חדש במסמך זה.** שערים תלויים בסכימה קיימת:

| שער | טבלאות/מיגרציות קריטיות |
|---|---|
| G0 | harness migrations apply-twice |
| G1 | `products.platform_percent`, `categories`, R2 images |
| G2 | RLS FORCE, redeem RPC, wallet REVOKE |
| G3 | `037_legal_compliance`, invoices |
| G5 | `095_seo_redirects` |
| G6 | `orders.terms_version`, legal pages |

---

## 3. שערים (תמצית)

```
G0 קרקע → G1 קטלוג → G2 כסף בטוח → G3 שקל ראשון
                              ├→ G4 SEO
                              ├→ G5 WP
                              └→ G6 ציות → G7 שיגור
```

| שער | מוכיח |
|---|---|
| G0 | prod DB נפרד, backup restored, E2E חי, crons |
| G1 | מוצר אחד `assertPublishable` |
| G2 | SEC-QR, SEC-WALLET, SEC-RL, RLS tests |
| G3 | עסקת אמת + fire drill |
| G4 | structured data + CWV |
| G5 | redirects 301 E2E |
| G6 | legal + accessibility |
| G7 | DNS cutover |

### חוסמים מדודים (B1-B19)

| # | חסר | חוסם |
|---|---|---|
| B1 | `platform_percent` NULL על 61 מוצרים | **כל מכירה** |
| B2 | categories ריק | SEO/nav |
| B3 | RL fail-open על כסף | checkout |
| B7 | אין vercel.json | expire cron |
| B10 | E2E skip ב-CI | כל שער |

---

## 4. מקרי קצה

| # | מצב | התנהגות |
|---|---|---|
| RM-E1 | 1.1 נתקעת שבועות | כל G1-G3 תקוע; התחל category batches |
| RM-E2 | עו״ד אחרי G7 | אסור; 6.12 במקביל ל-G3 |
| RM-E3 | FORCE RLS שובר definer | staged rollout RISK-5 |
| RM-E4 | WP dry-run גרוע | delay cutover; 5.6 מוקדם |
| RM-E5 | Cardcom prod ≠ sandbox | 3.11 מוקדם, סכום קטן |
| RM-E6 | rollback קוד אחרי migration contract | DB לא rollback |
| RM-E7 | harness red אחרי merge | block deploy |

---

## 5. פתוחות

| # | פער | תאריך |
|---|---|---|
| O1 | תאריך cutover target | 2026-08-12 |
| O2 | 61 platform_percent values | 2026-08-12 |
| O3 | עו״ד סבב 6.12 scheduled | 2026-08-12 |

---

## 6. עשר משימות ראשונות (מומלץ)

1. `CI_SUPABASE_URL` (0.10)  
2. `vercel.json` (0.7)  
3. SEC-WALLET REVOKE (2.2)  
4. SEC-UPLOADER (2.4)  
5. פתיחת 1.1 + 5.1 מול גורמים  
6. env.ts + instrumentation  
7. prod Supabase + Pro  
8. LCP priority + image dimensions  
9. Product JSON-LD  
10. migration harness  

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-07-29 | roadmap mega-docs |
| 2026-08-12 | batch-2: DOCS-TEMPLATE-BINDING |
