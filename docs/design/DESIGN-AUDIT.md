# ביקורת עיצוב: האתר החי מול טוקני CSS

תאריך: 2026-09-02.
היקף: docs בלבד.

## מקורות

הקבצים
`refs/ke_live_computed.json`
ו-
`refs/ke_live_home.html`
מופיעים ב-
`.gitignore`
תחת כלל
`refs/`
ולא נמצאים ב-worktree הזה. הביקורת נבנתה מחדש ממדידות שכבר נשמרו בריפו:

| מקור | מה נלקח ממנו |
|---|---|
| `MEASURED-LIVE.md` | getComputedStyle + getBoundingClientRect מ-kenyonexpress.co.il ב-1440×900 וב-375×812 |
| `KE_LIVE_SPEC.md` | מבנה DOM, פלטת האתר החי, סטיות מכוונות |
| `DESIGN-MEASURED.md` | סיכום מדידות לייב + Electro |
| `src/styles/tokens.ts` | שמות המשתנים המותאמים (`SITE_CSS_VARS`, `SITE_CSS_METRICS`, `CATALOG_*`, `PDP_*`) |

כל שורה בטבלאות ממפה ערך שנמדד באתר החי לשם המשתנה בקוד. אם החי והטוקן נפרדים, העמודה "הערות" אומרת מי גובר ולמה.

---

## צבעים

| תפקיד באתר החי | ערך שנמדד | משתנה CSS | הערות |
|---|---|---|---|
| צהוב מותג (CTA, חיפוש, באדג' סל, ניוזלטר, נקודות הירו) | `#fed700` / rgb(254, 215, 0) | `--color-brand-primary` / `--color-primary` / `--color-brand` / `--cat-brand` / `--pdp-brand` | לא `#FDD700`. ערוץ ירוק 215 = `d7` |
| hover כפתור צהוב | `#fedd26` | `--color-brand-primary-hover` / `--cat-brand-hover` / `--pdp-brand-hover` | לא מופיע בצילום; נלקח מהבריף |
| כותרות, טקסט גוף, פוטר, מחיר רגיל בכרטיס | `#333e48` / rgb(51, 62, 72) | `--color-heading` / `--cat-ink` / `--pdp-ink` | באתר החי זה גם צבע כותרת וגם צבע מחיר במקומות בלי מבצע |
| שם מוצר בכרטיס (קישור) | `#0062bd` / rgb(0, 98, 189) | `--color-link` / `--cat-link` | סטייה מכוונת מהחי: החי כהה, הפרויקט כחול קישור |
| מחיר מבצע (ins) בדף מוצר ובקטגוריה | `#dc3545` / rgb(220, 53, 69) | `--color-price` / `--cat-sale` / `--pdp-sale` | הבריף ביקש `#E4002B`. החי מחזיר `#dc3545`. הטוקן הולך אחרי החי |
| מחיר מחוק בדף מוצר | `#848484` / rgb(132, 132, 132) | `--color-price-strike` / `--pdp-strike` | הטוקן כהה יותר: `#6f6f6f` ל-WCAG AA. החי נכשל בניגודיות |
| מחיר מחוק בכרטיס קטגוריה | `#768b9e` / rgb(118, 139, 158) | `--cat-muted` / `--color-muted-2` | הטוקן כהה יותר: `#657888` |
| באדג' מבצע (רקע) | `#44b81b` / rgb(68, 184, 27) | `--color-sale-badge` / `--cat-badge` | הטוקן כהה יותר: `#328614` כי לבן על `#44b81b` הוא 2.58:1 |
| טקסט באדג' מבצע | `#ffffff` | `--cat-surface` / `--color-surface` | |
| במלאי / הצלחה (חי) | `#198754` | `--color-success` | הטוקן הוא `#5cb85c` (Electro), לא הירוק של Bootstrap החי |
| danger / onsale (חי) | `#dc3545` | `--color-price` | אותו אדום כמו מחיר מבצע |
| טקסט כותרות כהה מאוד (חי) | `#212121` | אין משתנה ייעודי | בפרויקט משתמשים ב-`--color-heading` |
| משטח עמוד, כרטיס, שדה חיפוש | `#ffffff` | `--color-surface` / `--color-background` / `--pdp-surface` | |
| אזור ווידג'טים בפוטר | `#f8f8f8` / rgb(248, 248, 248) | אין משתנה ייעודי | קרוב ל-`--color-surface-hover` (`#f5f5f5`) |
| פס זכויות בפוטר | `#eaeaea` / rgb(234, 234, 234) | `--color-bottom-bar` | |
| רקע פוטר כהה (סטייה מכוונת בפרויקט) | החי בהיר; הפרויקט `#333e48` | `--color-footer-bg` | לא מהחי |
| מסגרת כמות, USP | `#ddd` / `#dddddd` | `--color-border` / `--cat-line` / `--pdp-line` | |
| מסגרת רצועת קטגוריות | `#e7e7e7` | `--color-border-alt` | |
| קו הפרדה מתחת לכותרת טאבים | `#ededed` | `--color-rule` | |
| קו מתחת לבלוק כותרת ב-PDP | `#cccfd1` | `--pdp-rule` | נמדד מ-`refs/live.png` |
| פעולה משנית ב-PDP | לא נמדד ישירות ב-HTML | `--pdp-action` = `#5d7184` | |
| טקסט מושתק Electro USP | `#7e7e7e` / `#767676` | `--color-muted` | הטוקן `#6f6f6f` ל-WCAG |
| אייקון ניווט | `#515151` | `--color-icon` | |
| כפתור עדכון עגלה | `#efecec` | אין משתנה ייעודי | משני בלבד |
| כותרות טבלת עגלה | `#747474` | אין משתנה ייעודי | קרוב ל-`--color-muted` |
| כפתור הסרה בעגלה | `#a7a7a7` | אין משתנה ייעודי | |
| רקע שקופית הירו | `#eef7f9` | `--color-brand-accent` = `#eaf4f6` | קרוב, לא זהה |
| בר בקרת חנות | `#efefef` | `--cat-bar` | |
| אייקוני תצוגה (גריד/רשימה) | `#495057` | `--cat-switcher` | |
| כפתור קנייה מלא (PDP) בחי | `#ee6443` | `--pdp-buy` = `#c94b28` | כהה יותר ל-WCAG; hover `--pdp-buy-hover` = `#b8401f` |
| מחיר בכרטיס דילים | `#2d2d2d` | `--color-deal-price` | כהה מ-`--color-heading` |
| דיו מותג כהה (טקסט על צהוב בפרויקט) | `#1a1a1a` | `--color-brand-dark` / `--color-foreground` / `--color-primary-foreground` | סטייה: החי משתמש ב-`#333e48` על צהוב |
| WhatsApp צף | `#25d366` | `--color-whatsapp` | מותג צד שלישי |
| Facebook | כפתור שיתוף | `--color-facebook` = `#166fe5` | |
| אזהרה פנימית | לא באתר החי | `--color-warning-surface` = `#fffbe6` | אדמין / באנר |
| hover שורה | `#f5f5f5` | `--color-surface-hover` | |
| מסילת גרף | `#f1f2f4` | `--color-track` | אדמין |
| באנר ורוד / סגול / תכלת | `#fff5f5` / `#f5f5ff` / `#f0f7ff` | `--color-promo-rose` / `--color-promo-violet` / `--color-promo-sky` | רכבת שמאל |
| CTA באנר להבה | החי `#ff6b00` | `--color-promo-flame` = `#c24d00` | כהה ל-WCAG |
| כחול Electro דמו | `#B0E0E9` | אין שימוש | אסור באתר. זו פלטת הדמו, לא החי |

---

## גדלי פונט

| תפקיד | גודל שנמדד (דסקטופ) | מובייל כששונה | משקל | גובה שורה | משתנה CSS |
|---|---|---|---|---|---|
| גוף / UI / קישור פוטר | 14px | 14px | 400 | 23.996px | `--text-pdp-body` / `--text-footer-link` / `--leading-pdp-body` / `--cat-body-line` |
| כותרת ווידג'ט פוטר | 16.002px | 16.002px | 700 | | `--text-footer-head` |
| כותרת מוצר (h1) | 25.004px | 25.004px | 500 | 32.0051px | `--text-pdp-title` / `--leading-pdp-title` / `--pdp-title-size` / `--pdp-title-line` / `--cat-title-size` |
| כותרת קטגוריה (h1) | 25.004px | 25.004px | 500 | 40.0064px | `--cat-title-size` / `--cat-title-line` |
| כותרת עגלה | 40px (39.998) | 48px גובה תיבה | 500 | | אין משתנה ייעודי |
| כותרת סקשן / קרוסלה | 21.994px | | 500 | 35.2px | `--text-section-title` = 22px / `--cat-carousel-size` / `--cat-carousel-line` |
| מחיר נוכחי ב-PDP | 35px | 35px | 400 | 45.01px | `--pdp-price-size` / `--pdp-price-line` |
| מחיר מחוק ב-PDP | 21px | 21px | 400 | 31.5px | `--pdp-price-del-size` / `--pdp-price-del-line` |
| מחיר בכרטיס קטגוריה | 20.006px | 16.002px | 400 | 20.006px | `--cat-price-size` |
| מחיר מחוק בכרטיס | 12.0036px | 9.6012px | 400 | | `--cat-price-del-size` |
| כותרת כרטיס | 14px / 700 | 11.998px / 700 | 700 | 18.0001px (דסקטופ) / 14.0017px (מובייל) | `--cat-ptitle-line` |
| תג קטגוריה מעל הכרטיס | 12px / 11.998px | 11.2px | 400 | 12.5979px | `--cat-eyebrow-size` / `--cat-eyebrow-line` |
| מטא PDP | 13.006px | | 400 | 18.0133px | `--pdp-meta-size` / `--pdp-meta-line` |
| באדג' מבצע | 12px / 11.998px | 11.998px | 700 | | `--text-micro` = 11px (קרוב, לא זהה) |
| באדג' סל | 11.991px | 11.991px | | | `--text-micro` |
| טקסט כפתור | 14px | 14px | 700 | 23.996px | `--text-pdp-body` |
| USP כותרת | 15px | | 700 | | אין משתנה; גודל Electro |
| USP תת-כותרת | 13px | | 400 | | `--text-footer-note` = 13px |
| הירו כותרת 1 | 58px | 43px | 300 | | אין משתנה ב-`SITE_CSS_METRICS`; נשמר ב-`ELECTRO_HERO.typography.headline1` |
| הירו כותרת 2 | 51px | 38px | 300 | | `ELECTRO_HERO.typography.headline2` |
| הירו מחיר | 45px | 35px | 700 | | `ELECTRO_HERO.typography.price` |
| הירו תווית FROM | 13px | 12px | 400 | | `ELECTRO_HERO.typography.priceLabel` |
| הירו סלוגן | 19px | 11px | 700 | | `ELECTRO_HERO.typography.tagline` |
| הירו תיאור | 13px | 12px | 400 | | `ELECTRO_HERO.typography.description` |
| באנר צד | 11px / line 13px | | | | `--text-micro` |
| ננו | | | | | `--text-nano` = 10px |
| טלפון פוטר (פרויקט) | 20px | | | | `--text-footer-phone` |

משפחות פונט באתר החי: Inter, Open Sans, Assistant, font-electro לאייקונים. הפרויקט בחר Heebo בכל האתר (סטייה מכוונת ב-
`KE_LIVE_SPEC.md`
).

---

## ריווח

| רכיב | ערך שנמדד | משתנה CSS |
|---|---|---|
| פס עליון (top bar) | גובה 38.34px; `#masthead` מתחיל ב-top 38.34 | `--spacing-header-topbar` = 37.3px |
| כותרת עליונה (`#masthead`) דסקטופ | גובה 109.94px, רוחב מלא 1440 | `--spacing-header-masthead` = 109px |
| גובה כותרת בפרויקט (סטייה) | 54px לפי הבריף, 70px בקוד | `--header-height` = 70px |
| לוגו דסקטופ (חי) | 300 × 78.94, max-width 300 | אין טוקן ל-300; בפרויקט `--spacing-logo-w` = 52px / `--spacing-logo-h` = 40px (סטייה) |
| שדה חיפוש | 534.47 × 41, padding אנכי 4.2, אופקי 29.876 | `--spacing-newsletter-field` = 41px (אותו גובה שדה) |
| כפתור חיפוש | 56 × 41 | אין משתנה ייעודי |
| מרווח בין אייקוני כותרת | margin-inline-end 37.996px | אין משתנה ייעודי |
| באדג' סל | 20.97 × 20.98 | אין משתנה ייעודי |
| gutter אופקי ב-1440 | תוכן מתחיל ב-x=135 (≈120 + 15) | `--pdp-column-gap` = 15px |
| padding סיכום PDP | 15px לכל צד | `--pdp-column-gap` |
| מרווח מתחת ל-h1 ב-PDP | 12.0019px | אין משתנה; נשאר בקומפוננטה |
| מרווח מתחת למחיר ב-PDP | 24.99px / 25px | אין משתנה |
| מרווח מתחת לכותרת related | 34.0054px | חלק מ-`--pdp-related-gap` = 54px (כותרת עד כרטיס) |
| padding כרטיס קטגוריה למעלה | 20.006px | `CATALOG.metric.cardPadTop` |
| padding כרטיס אופקי | 24px | `CATALOG.metric.cardPadInline` |
| padding כרטיס למטה | 14px | `CATALOG.metric.cardPadBottom` |
| מרווח תמונה בכרטיס | 25.96px | `--cat-thumb-gap` |
| מרווח גבה עיניים | 8px | `--cat-eyebrow-gap` |
| מרווח פוטר כרטיס | 10px | `--cat-footer-gap-top` |
| פס בקרה: padding אנכי דסקטופ | 2.8px | `--cat-bar-pad-y` |
| פס בקרה: padding אנכי מובייל | 5.6px | אין משתנה נפרד |
| breadcrumb padding עליון (ארכיון) | 25.004px | `--cat-crumb-pad-top` |
| breadcrumb padding תחתון | 22.4px | `--cat-crumb-pad-bot` |
| breadcrumb גובה ב-PDP | 84px | `--pdp-crumb-h` |
| breadcrumb מובייל | גובה 41.98px, padding 9px | אין משתנה נפרד |
| פוטר ווידג'טים | padding-top 59.92, padding-bottom 62.16 | אין משתנה |
| פס ניוזלטר | גובה 80.38, padding-block 7.7 | `--spacing-newsletter-bar` = 80px |
| פס זכויות | גובה 44.78, padding-block 1.4 | אין משתנה לגובה |
| מרווח כותרת ווידג'ט | margin-bottom 25.6032px | אין משתנה |
| שורת דילים: padding עליון | 30px | `--spacing-deals-top` |
| זנב סיכום PDP | 40px | `--pdp-summary-tail` |
| זנב עמוד לפני פוטר | 80px | `--pdp-page-tail` |
| גובה תוכן PDP (header עד footer) | 1329px | `--pdp-content-h` |
| רצועת קטגוריות: padding פריט | inline 12, top 16 | `ELECTRO_HERO.categoryStrip` |
| רצועת קטגוריות: מרווח תמונה | margin-bottom 10 | אותו אובייקט |
| USP: padding | inline 16, block-start 1.357em, block-end 0.929em, gap 10 | `ELECTRO_HERO.uspBar` |
| select מיון: padding אנכי | 4.16px | `--cat-select-pad-y` |
| כותרת קרוסלה: padding | 8.7976px | `--cat-carousel-pad` |
| מרווח כותרת קרוסלה | 16.996px | `--cat-carousel-gap` |

---

## רוחב מכולה

| הקשר | ערך שנמדד בחי | משתנה CSS | הערות |
|---|---|---|---|
| תוכן ראשי (מוצר, קטגוריה, עגלה, related) ב-1440 | 1170px | `--container-hero-row` / `--pdp-container` / `--cat-container` | x=135 עד x=1305 |
| Electro ≥576 | 540px | אין | Bootstrap |
| Electro ≥768 | 720px | אין | Bootstrap |
| Electro ≥992 | 960px | אין | Bootstrap |
| Electro ≥1200 | 1200px | `--container-store-footer` = 1200px | עמודות פוטר נמדדו 1200 |
| Electro ≥1480 | 1430px | `--container-footer` = 1430px | |
| בחירת הפרויקט (סטייה) | 1320px אחיד | `--container-page` | בין 1200 ל-1430 |
| דילים | 1150px | `--container-deals` | |
| ניוזלטר מינימום שדה | 470px | `--spacing-newsletter-min` | |
| גלריה PDP דסקטופ | 470px | `--pdp-gallery` | x835..1305 |
| סיכום PDP דסקטופ | 700px | `--pdp-summary` | x135..805 |
| עמודת כרטיס קטגוריה דסקטופ | 234px | `--cat-card-col` | 6 בעמודה ב-1170 |
| תוכן כרטיס / תמונה מקס | 186px / 186.03px | `--cat-thumb-max` | |
| רצועת קטגוריות max-width | 728px, offset-inline-end 517 | `ELECTRO_HERO.categoryStrip` | לא ממורכז |
| עמודת מחלקות בהירו | 241px (חי) / 220 בפעם הישנה | `ELECTRO_HERO.categoryColumn.width` | |
| באנרים צד בהירו | 201px | `ELECTRO_HERO.sideBanners.width` | |
| שורת הירו | 1170 רוחב, גובה שורה 512, סליידר 728 | `--container-hero-row` | |
| קו כלל כותרת related | 233px צהוב | `--pdp-related-rule` | |
| לוגו פוטר (פרויקט) | 160 × 42 | `--spacing-footer-logo-w` / `--spacing-footer-logo-h` | |
| מובייל: תוכן | 345px בתוך 375, padding 15 | אין טוקן 380; ראה `docs/design/MOBILE-380-SPEC.md` | ב-380 התוכן הוא 350 |

Breakpoints Electro (לא טוקנים בפרויקט): 576 / 768 / 992 / 1200 / 1480. שער הפיקסלים מודד 380 / 768 / 1440.

---

## סגנון כפתורים

| כפתור | רקע | טקסט | גודל פונט / משקל | padding | רדיוס | מידות | משתנים |
|---|---|---|---|---|---|---|---|
| הוספה לסל PDP דסקטופ | `#fed700` | לבן בחי; `#1a1a1a` בטוקן | 14 / 700 | 14.5 / 48 | 25.2px (חי) | 192 × 53 | `--pdp-brand`, `--pdp-atc-w`, `--pdp-atc-h`, `--color-brand-dark` |
| הוספה לסל PDP hover דסקטופ | `#000000` בחי | לבן | | | | | אין טוקן שחור; `--pdp-brand-hover` = `#fedd26` |
| הוספה לסל PDP מובייל | `#333e48` בחי | לבן | 14 / 700 | 14.5 / 48 | 6px | 345 × 52.98 (full-bleed) | `--pdp-ink` לרקע החי; הפרויקט נשאר צהוב |
| קנייה עכשיו PDP | `#ee6443` בחי | לבן | 14 / 700 | | | גובה 46, רוחב סיכום מלא | `--pdp-buy`, `--pdp-buy-h` |
| קופה בעגלה | `#fed700` | `#333e48` | 14 / 700 | 14.5 / 29.9 | 21.99px | | `--color-brand-primary`, `--color-heading` |
| עדכון עגלה | `#efecec` | `#333e48` | 14 | 14.5 / 29.9 | 22px | | אין טוקן רקע |
| כפתור חיפוש בכותרת | `#fed700` | `#333e48` | 14 | | 22px 0 0 22px (RTL: פינה חיצונית מעוגלת ב-inline-start) | 56 × 41 | `--color-brand-primary`, `--color-heading` |
| שדה חיפוש | לבן, גבול עליון 2px צהוב | | 14 | 4.2 / 29.9 | 0 22px 22px 0 | 449.47 × 41 | `--color-surface`, `--color-brand-primary` |
| אייקון הוספה לסל בכרטיס | שקוף | `#333e48` | 14 | | 22px | 37.14 × 33.88 | `--cat-atc-w`, `--cat-atc-h`, `--cat-ink` |
| Shop now במיני-באנר | `#fed700` | | | | | 26px | `ELECTRO_HERO.sideBanners.shopButtonColor` |
| ניוזלטר "הירשם" | על פס `#fed700` | `#333e48` | | | | שדה 41px | `--spacing-newsletter-bar`, `--spacing-newsletter-field` |
| כמות PDP | לבן, גבול 1px `#ddd` | | 14, text-align start | | 22px | 140 × 45 (חי) / 140 × 41 (טוקן) | `--pdp-qty-w`, `--pdp-qty-h`, `--color-border` |
| כמות עגלה | | | | | 14px | 85 × 40 | אין טוקן |
| select מיון | לבן, גבול 1px | 14 | padding 4.16 / 12 | 20.006px | 174 × 34.3 | `--cat-select-w`, `--cat-select-h` |
| באדג' מבצע | `#44b81b` חי | לבן, 12 / 700 | 2 / 10 | 4px | ≈48 × 28 במובייל | `--cat-badge` |
| נקודת הירו פעילה | `#fed700` | | | 3px | 30 × 8 | `ELECTRO_HERO.dots` |
| נקודת הירו כבויה | `#fed700` | | | 3px | 8 × 8 | אותו |

רדיוס ברירת מחדל לפיל: 22px. Electro דמו משתמש ב-`--` לא; ב-
`ELECTRO.radius.btn`
יש 4px. **לא לאמץ 4px.** החי הוא פיל, לא כפתור מרובע.

---

## מיפוי מהיר: שם משתנה → ערך בקוד

הערכים האלה הם מה ש-
`tokens.test.ts`
אוכף מול
`src/app/globals.css`.
הם לא תמיד זהים לחי, כי חלקם תוקנו לניגודיות.

### צבעי אתר

`--color-brand-primary` `#fed700` · `--color-brand-primary-hover` `#fedd26` · `--color-brand-dark` `#1a1a1a` · `--color-brand-accent` `#eaf4f6` · `--color-price` `#dc3545` · `--color-price-strike` `#6f6f6f` · `--color-deal-price` `#2d2d2d` · `--color-success` `#5cb85c` · `--color-link` `#0062bd` · `--color-heading` `#333e48` · `--color-sale-badge` `#328614` · `--color-border` `#dddddd` · `--color-border-alt` `#e7e7e7` · `--color-rule` `#ededed` · `--color-muted` `#6f6f6f` · `--color-muted-2` `#657888` · `--color-icon` `#515151` · `--color-icon-empty` `#cccccc` · `--color-surface` `#ffffff` · `--color-ink` `#000000` · `--color-surface-hover` `#f5f5f5` · `--color-track` `#f1f2f4` · `--color-bottom-bar` `#eaeaea` · `--color-warning-surface` `#fffbe6` · `--color-footer-bg` `#333e48`

### מטריקה

`--text-nano` 10px · `--text-micro` 11px · `--text-section-title` 22px · `--text-footer-note` 13px · `--text-footer-link` 14px · `--text-footer-head` 16px · `--text-footer-phone` 20px · `--text-pdp-title` 25.004px · `--text-pdp-body` 14px · `--leading-pdp-title` 32.0051px · `--leading-pdp-body` 23.996px · `--header-height` 70px · `--container-page` 1320px · `--container-hero-row` 1170px · `--container-footer` 1430px · `--container-store-footer` 1200px · `--container-deals` 1150px · `--spacing-header-topbar` 37.3px · `--spacing-header-masthead` 109px · `--spacing-logo-h` 40px · `--spacing-logo-w` 52px · `--spacing-newsletter-bar` 80px

---

## סטיות מכוונות (לא באגים)

מתוך
`KE_LIVE_SPEC.md`.
בכל קונפליקט בין "1:1 לחי" לבין הרשימה הזו, הרשימה גוברת, חוץ משער הפיקסלים שרץ מול החי:

| נושא | אתר חי | הוחלט לפרויקט |
|---|---|---|
| פונט | Inter / Open Sans / Assistant | Heebo |
| בורר אזור בכותרת | 16 אזורים | הוסר |
| שדה חיפוש בכותרת | קיים | הוסר (לוגו + 3 אייקונים) |
| צבע מחיר | כחול `#1da1f2` או `#333e48` בהקשרים שונים | אדום דרך `--color-price` (והחי עצמו כבר `#dc3545` ב-ins) |
| גובה כותרת | 110px דסקטופ / 49px handheld | `--header-height` 70px; הבריף אמר 54px |
| רוחב מכולה | 1170 / 1200 / 1430 לפי breakpoint | `--container-page` 1320px |

שער ההשוואה נשאר מתחת ל-11 אחוז דרך
`scripts/compare.mjs`.
טוקן שמתקן WCAG (מחק, באדג', muted) מורשה לזוז מהחי; טוקן צהוב לא.
