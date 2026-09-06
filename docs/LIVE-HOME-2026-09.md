# Live home snapshot (2026-09-07)

Measured with GET on `https://kenyonexpress.co.il/` and `/shop/`. This is the live WordPress storefront. Electro home-v7 supplies **layout**. Hebrew content, prices and images are supposed to come from this host. English Electro demo strings on the live hero are **not** a mandate to restore English on the Next storefront.

Status: binding measurement for this docs pack. Docs only. Do not execute DNS.

## 1. Document chrome

| Field | Live WP 2026-09-07 | Shipped Next (`src/app/(store)/page.tsx`) | Winner |
|---|---|---|---|
| `<title>` | `קניון אקספרס` | `קניון EXPRESS` then U+2014 then `מסדרים לך בילוי` | SEO: live short title is what Google sees today. Brand lockup in chrome: `קניון EXPRESS`. Do not copy U+2014 into new titles (colon) |
| meta description | `המקום למבצעים חמים במגוון תחומים, בילוי, תיירות, צריכה ועוד.` | (layout template / SEO plan) | Live string is the ranked description until counsel/SEO replaces it. Do not invent a second home description on the same URL after cutover without a redirect plan |
| `og:title` | `קניון אקספרס` | follows Next title | same as title |
| `og:description` | same as meta | | same |
| `/shop/` H1 | `חנות` | `/products` H1 `חנות` | agree |
| `/shop/` meta | `מוצרים Archive - קניון אקספרס` | `כל המוצרים, הדילים והקופונים של קניון Express במקום אחד.` | **shipped**. Do not port the English word Archive |

Older research (`PAGE-ANATOMY`, `COPY-HE` `home.metadata`, `HOMEPAGE_SPEC`) recorded the Next title as if it were live. It is not. Live WP title is the short `קניון אקספרס`.

## 2. Hero and USP (Hebrew to keep)

Live paints, among Hebrew:

- `ברוך הבא לעולם של קניון Express`
- `ברוכים הבאים לקניון Express` + `מסדרים לך בילוי`
- USP chips: `לכל חלקי הארץ`, `שירות לקוחות`, `מחירים מנצחים`, `מותגי יוקרה מובילים`
- Auth chrome on live: `התחברות`, `הירשם`

Shipped login uses `כניסה לחשבון` / `יצירת חשבון`. Keep shipped (COPY-HE). Do not mass-rename to live Woo labels.

## 3. Electro English that must not ship

Live hero still contains Electro demo English (`Shop the HottestProducts`, `Shop now`, `Catch Big Deals onThe Consoles`, reversed Latin from RTL extraction). That is reference **structure**, not copy. Next slides come from `ke-live-hero-data` / revslider Hebrew. Do not add `Shop now`.

## 4. Catalogue junk (SEO)

Live loop includes test and broken rows (`קופון טסט`, `Reverse Withdrawal Payment`, empty `₪` prices, `מוצר ראשי מאסטר`). After cutover: unpublished / zero-price / non-sellable must stay out of sitemap and `index,follow`. JSON-LD Product must not emit Offer with missing ILS.

## 5. Auth labels

| Live WP | Shipped |
|---|---|
| התחברות | כניסה / כניסה לחשבון |
| הירשם | יצירת חשבון / הרשמה |

Pixel gate compares layout, not these strings. COPY-HE wins.

## Revision

| Date | Change |
|---|---|
| 2026-09-07 | GET measurement: live title is `קניון אקספרס`; shop H1 `חנות`; shop meta is Woo Archive junk |
