# Accessibility Statement / הצהרת נגישות

**IS 5568 level AA · ת"י 5568 ברמה AA**

Bilingual. The Hebrew is the operative text, because the obligation is Israeli
and the users it exists for read Hebrew. The English is a faithful translation.
§C is an engineering appendix that does not appear on the public page.

The published statement lives at **`/legal/accessibility`**, from
`src/app/(legal)/_content/accessibility.ts`. **That page is the statement.**
This document exists so that the measurements behind it, and the gaps between
what it claims and what is verified, are written down somewhere a developer will
find them.

Last measured **2026-08-19**. Reviewed against the code **2026-09-01**.

---

# A. הצהרת נגישות

## א.1 מחויבות

קניון אקספרס רואה בנגישות האתר **חלק מהשירות עצמו ולא תוספת לו**. האתר מונגש
כדי שאנשים עם מוגבלות יוכלו לגלוש, לרכוש ולממש קופונים באופן עצמאי, שוויוני
ומכובד.

ההנגשה נעשית לפי:

- **חוק שוויון זכויות לאנשים עם מוגבלות, התשנ"ח-1998**
- **תקנות שוויון זכויות לאנשים עם מוגבלות (התאמות נגישות לשירות), התשע"ג-2013**
- **ת"י 5568**, המאמץ את הנחיות **WCAG ברמה AA**

## א.2 רמת הנגישות

האתר הונגש **לרמה AA לפי ת"י 5568**. יעד העבודה השוטף הוא עמידה ב-**WCAG 2.2
ברמה AA** בעמודי הליבה: דף הבית, עמוד קטגוריה, עמוד מוצר, עגלת הקניות, מסך
התשלום, האזור האישי ומסך מימוש הקופון.

**הבדיקות מבוצעות מול גרסת הייצור של האתר ולא מול סביבת פיתוח**, כדי שהתוצאה
תשקף את מה שמשתמש מקבל בפועל.

## א.3 מה הותאם

- האתר כולו בעברית ובכיוון **ימין לשמאל (RTL)**, לרבות טפסים, טבלאות, תפריטים
  ורכיבי ניווט.
- **ניווט מלא במקלדת**, כולל טופס ההזמנה והתשלום, וסימון מיקוד גלוי בכל רכיב פעיל.
- **קישור דילוג לתוכן המרכזי** הוא הרכיב הראשון שאליו מגיעים במקלדת בכל עמוד.
- **מבנה כותרות היררכי** בכל עמוד, לניווט בקורא מסך.
- **ניגודיות צבע:** בבדיקת axe אוטומטית, סוג הליקוי היחיד שנמצא היה ניגודיות.
  חמישה צמדי צבעים הוכהו במידה המינימלית הנדרשת ליחס **4.5:1**, ושמונה עשרה
  בדיקות אוטומטיות מונעות נסיגה.
- **טקסט חלופי נדרש לכל תמונה לפני ההעלאה**, ולא כתיקון בדיעבד.
- כפתורי אייקון, ובהם העגלה וסגירת חלוניות, נושאים **תווית קולית בעברית**.
- חלוניות ומגירות **לוכדות את המיקוד** ונסגרות ב-**Escape**.
- הודעות הצלחה ושגיאה **אינן מועברות בצבע בלבד**, ושדות שגויים מקושרים להודעת
  השגיאה שלהם.
- **קוד הקופון מוצג תמיד כטקסט לצד ה-QR**, כך שמימוש אינו מחייב צילום או סריקה.
- מסמכי המדיניות, ובהם עמוד זה, **נכתבים כטקסט בעמוד ולא כקובץ להורדה**, עם
  תוכן עניינים וקישורי עוגן.

> **הבחירה שראויה להסבר.** קוד טקסט לצד כל QR הוא התאמה מהותית ולא נוחות: מימוש
> קופון שמחייב מצלמה שוללת את השירות ממי שאינו יכול לכוון מצלמה. **הטקסט הוא
> המסלול השווה, לא המסלול החלופי.**

## א.4 טכנולוגיות מסייעות

האתר נבנה לעבודה עם הדפדפנים הנפוצים בגרסאותיהם העדכניות ועם קוראי מסך מקובלים
במחשב ובנייד. האתר **אינו כופה גודל טקסט קבוע**, וניתן להגדיל את התצוגה בלי
שהתוכן ייחתך או שפעולות יאבדו.

אם אתם משתמשים בטכנולוגיה מסייעת שאינה נתמכת כראוי, נשמח לשמוע. **מידע כזה הוא
מה שמאפשר לתקן.**

## א.5 מגבלות ידועות

- **טקסט חלופי בקטלוג** מגיע מבתי העסק המפרסמים באתר, ואיכותו תלויה במי שהעלה
  את התמונה. אנו פועלים לשפר זאת באופן שוטף.
- **טרם בוצעה בדיקת נגישות חיצונית על ידי מורשה נגישות שירות.** תוצאותיה
  יעודכנו בהצהרה זו כשתבוצע.
- **תכנים מוטמעים מגורם שלישי**, למשל מפות או סרטונים, אינם בשליטתנו המלאה.
- **תוכן חדש** נוסף באופן שוטף, וייתכן שטרם עבר את כל בדיקות ההנגשה. תיקון
  מבוצע מיד עם קבלת פנייה.

## א.6 הנגשת השירות מעבר לאתר

השירות מקוון **ואין מקום קבלת קהל**. אם נתקלתם בקושי לבצע פעולה, ובכלל זה רכישה
או מימוש קופון, אנחנו זמינים לסייע בטלפון, בוואטסאפ ובדואר אלקטרוני, **ונוכל
להשלים עבורכם את הפעולה**.

**מימוש הקופון מתבצע בבית העסק**, ונגישות המקום הפיזי היא באחריותו. ניתן לברר
עמו מראש על התאמות, ונשמח לסייע בבירור כזה.

## א.7 פנייה בנושא נגישות

נתקלתם בעמוד, בפעולה או בתוכן שאינם נגישים, נשמח לדעת כדי לתקן. בפנייה ציינו:

1. **את כתובת העמוד** שבו נתקלתם בבעיה;
2. **מה ניסיתם לעשות ומה קרה בפועל**;
3. **באיזו טכנולוגיה מסייעת, מערכת הפעלה ודפדפן** השתמשתם, ככל שידוע לכם.

נטפל בפנייה בהקדם ונשיב על אופן הטיפול. **תיקון שניתן לבצע מיד יבוצע מיד**,
ותיקון מורכב ישולב בעבודה השוטפת ותימסר הערכת מועד.

**‏⚠️ מינוי רכז נגישות ופרסום פרטיו המלאים טעונים אישור בעל האתר וטרם בוצעו.**
ראה §ג.4.

## א.8 תוקף ההצהרה

תאריך העדכון האחרון מופיע בראש העמוד. ההצהרה מתעדכנת **עם כל שינוי מהותי באתר,
עם סיום בדיקת נגישות, ועם תיקון של מגבלה שנרשמה כאן**.

---

# B. Accessibility Statement (English)

## B.1 Commitment

KenyonExpress treats accessibility as **part of the service rather than an
addition to it**. The site is adapted so that people with disabilities can
browse, purchase and redeem coupons independently, equally and with dignity.

Adaptation follows the **Equal Rights for Persons with Disabilities Law,
5758-1998**; the **Equal Rights for Persons with Disabilities (Service
Accessibility Adjustments) Regulations, 5773-2013**; and **IS 5568**, which
adopts the WCAG guidelines at **level AA**.

## B.2 Level

The site is adapted to **level AA under IS 5568**. The ongoing working target is
**WCAG 2.2 level AA** on the core pages: home, category, product, cart,
checkout, account area, and coupon redemption.

**Testing runs against a production build, not a development server**, so the
result reflects what a user actually receives.

## B.3 What has been adapted

Hebrew and right-to-left throughout, including forms, tables, menus and
navigation. Full keyboard navigation with a visible focus indicator on every
interactive element. A skip-to-content link as the first keyboard stop on every
page. A hierarchical heading structure for screen-reader navigation. Colour
contrast: automated axe testing found contrast as the only class of violation;
five colour pairs were darkened by the minimum needed to reach **4.5:1**, and 18
automated tests prevent regression. Alt text is **required before an image can
be uploaded**, not corrected afterwards. Icon-only buttons carry Hebrew
accessible names. Dialogs and drawers trap focus and close on **Escape**. Status
and error messages are never conveyed by colour alone, and invalid fields are
associated with their error message. **The coupon code is always shown as text
beside the QR code**, so redemption never requires a camera. Policy documents,
including that page, are page text rather than downloadable files, with a table
of contents and anchor links.

> **The choice worth explaining.** Text beside every QR code is a substantive
> adjustment, not a convenience: a redemption that requires a camera denies the
> service to anyone who cannot aim one. **The text is the equal path, not the
> alternative path.**

## B.4 Assistive technology

Built for current versions of common browsers and for common screen readers on
desktop and mobile. The site **does not impose a fixed text size**; zooming does
not clip content or lose functionality.

If you use assistive technology that is not properly supported, please tell us.
**That information is what makes a fix possible.**

## B.5 Known limitations

Catalogue alt text comes from the businesses advertising on the site, so its
quality depends on whoever uploaded the image. **No external audit by a
certified service-accessibility expert has been commissioned yet**; its results
will be published here when it is. Third-party embedded content, such as maps or
videos, is not fully under our control. New content is added continuously and
may not yet have passed every accessibility check; a fix is made as soon as it
is reported.

## B.6 Beyond the website

The service is online and **there is no physical location open to the public**.
If you have difficulty completing an action, including a purchase or a
redemption, we are available by phone, WhatsApp and email, **and we can complete
the action for you**.

**Redemption itself happens at the business**, whose physical accessibility is
its own responsibility. You can ask in advance, and we are glad to help ask.

## B.7 Contacting us about accessibility

Tell us the **page address**, **what you tried and what happened**, and **which
assistive technology, operating system and browser** you were using, as far as
you know.

**A fix that can be made immediately is made immediately**; a more complex one
is scheduled and you are given an estimate.

**⚠️ An accessibility coordinator has not yet been appointed and their details
are not yet published.** See §C.4.

---

# C. Engineering appendix

Not part of the public statement.

## C.1 What is actually measured

`e2e/a11y.spec.ts`, axe-core with the tags `wcag2a`, `wcag2aa`, `wcag21a`,
`wcag21aa`, across **20 public routes** at **two viewports** (Desktop Chrome and
Pixel 5):

```
/                        /products              /cart
/contact                 /offline               /supplier/login
/coupons                 /suppliers             /login
/signup                  /reset-password        /search?q=…
/category/hot-deals      /legal/terms           /legal/privacy
/legal/returns           /legal/accessibility   /terms-and-conditions
/privacy-policy
```

Plus dedicated checks for RTL at the root element, focus-visible styling, the
consent banner at 320/640/1440, a product page, a coupon page, cart and
checkout.

Unit-level gates: `src/lib/a11y/contrast.ts` with `contrast.test.ts`,
`brand-contrast.test.ts` and `image-alt.test.ts`.

## C.2 The finding that justifies the current scope

On 2026-08-19 the gate covered **six** routes, and all six were green. Running
the same axe configuration over **19** public routes found **`serious`
violations on 10 of the 13 that were not in the gate**.

> A page inside the gate gets fixed; a page outside it does not. **The scope was
> the bug**, not the pages.

The dominant class was the brand yellow `#fed700` used as **text** colour —
**1.41:1** on white against a requirement of 4.5:1 — including **the coupon
price itself** on `/coupons` and `/coupons/[id]`.

The sharpest detail: `brand-contrast.test.ts` had forbidden **white on yellow**
since 2026-07-29. **The same colour pair read the other way round was tested by
nobody.**

Fixes used tokens that already existed and were already measured from the live
site: `--color-link: #0062bd` (6.03:1), `--color-price: #dc3545` (4.53:1),
`text-heading` (10.92:1). All 19 routes are now in the gate, at both viewports.

## C.3 The claim that is weaker than it reads

§A.2 and §B.2 say testing runs **against a production build**. That is true of
`pnpm start` on a developer's machine, which is what the suite drives.

**It is not true of CI, and there is no production site to test.**

| | |
|---|---|
| Both Playwright jobs in CI | **skip.** `CI_SUPABASE_URL` is unset, and it is the switch for "CI may touch a database" — the only database available is production. |
| Vercel deployments | **all 11 are `ERROR`**, including the only production one. |

So the accessibility gate is real, it is thorough, and **it runs only when a
person runs it locally**. Nothing enforces it on a pull request. A regression
merges green. See `docs/RELEASE-PROCESS.md` §3.3 and
`docs/THIRD-PARTY-DEPENDENCIES.md` §0.

**This does not make the statement false.** The measurements happened and the
fixes shipped. It means the statement's currency depends on someone running the
suite, and that dependency is invisible from the public page.

## C.4 What the regulations require and this does not yet have

| Requirement | State |
|---|---|
| Published statement | **Done.** `/legal/accessibility`, page text, anchored. |
| Conformance level named | **Done.** IS 5568 AA. |
| Known limitations named | **Done**, and they are real limitations rather than boilerplate. |
| Contact route for accessibility issues | **Done.** |
| **A named accessibility coordinator with published contact details** | **Not done.** Requires the owner's appointment. |
| **External audit by a certified service-accessibility expert** | **Not done**, and named as a limitation rather than omitted. |
| Statement kept current | Manual. |

The two gaps are declared in the statement itself rather than hidden, which is
the correct handling. **They still have to be closed.**

## C.5 Why the statement is written the way it is

From the docblock in `accessibility.ts`:

> **Every sentence is a measurement or a named limitation.** A copied template
> would claim conformance nobody measured, which is the one failure mode that
> makes a statement worse than none: **it tells a person relying on it that the
> barrier they just hit does not exist.**

That is the rule to keep when editing either page.

## C.6 Two legal sets are served

`/legal/terms` and `/terms-and-conditions`, `/legal/privacy` and
`/privacy-policy`, both live. Which set is binding is an open decision for the
owner. **Until it is made, both are served and both are in the accessibility
gate.** Serving two versions of a binding document is a legal problem before it
is an accessibility one, and it is recorded here because the gate is where it
became visible.

---

## Related

| You want | Read |
|---|---|
| The published statement | `/legal/accessibility` |
| The full sweep | `docs/A11Y-SWEEP-REPORT.md` *(historical, 2026-08-19)* |
| Architecture | `docs/ARCHITECTURE-ACCESSIBILITY.md` |
| Why the gate does not run in CI | `docs/RELEASE-PROCESS.md` §3.3 |
| Retention and privacy rights | `docs/DATA-RETENTION.md` |
