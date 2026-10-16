# i18n spec

Status: DRAFT · docs only  
Companions: `src/i18n/routing.ts`, `docs/ARCHITECTURE-SEO.md`, `docs/ARCHITECTURE-GROWTH-SEO.md`, `.claude/skills/rtl-hebrew-ui/SKILL.md`

Storefront today is Hebrew RTL only: `<html lang="he" dir="rtl">`, `og:locale he_IL`, Heebo latin+hebrew. Catalog copy lives in `*_he` columns. `next-intl` is in the repo (`locales: ['he','en']`, `defaultLocale: 'he'`, `localePrefix: 'as-needed'`) with unused `messages/he.json` and `messages/en.json`. Zero `useTranslations` callers. Middleware does not negotiate locale.

This spec adds **he, ru, ar, en**. Hebrew remains default and the only language that may launch the catalog empty of translations.

---

## 1. Locales

| Locale | `lang` | `dir` | Prefix | Catalog fields | Day-1 UI |
|---|---|---|---|---|---|
| `he` | `he` / `he-IL` | `rtl` | none (as-needed) | `*_he` required | LIVE |
| `en` | `en` / `en-IL` | `ltr` | `/en` | `name_en` sparse today | scaffold only |
| `ar` | `ar` / `ar-IL` | `rtl` | `/ar` | none yet | not in routing |
| `ru` | `ru` / `ru-IL` | `ltr` | `/ru` | none yet | not in routing |

Cardcom Low Profile `Language: "he"|"en"|"ru"|"ar"` is the **hosted payment page** language. It is not site i18n. Checkout chrome around the iframe stays Hebrew until the matching locale is complete.

Legal pages: EN/RU/AR translations are counsel-gated. Do not machine-translate TERMS into `/en/legal` and call it binding.

Scanner `/scan`: **Hebrew only**. Cashiers do not switch locale mid-till. `dir=rtl` stays.

Money: ₪ and digits always `dir=ltr` inside every locale. Agorot integer in code.

---

## 2. Routing

Keep existing Hebrew URLs stable. No `/he/` prefix.

```
https://kenyonexpress.co.il/product/{slug}        he (default)
https://kenyonexpress.co.il/en/product/{slug}     en
https://kenyonexpress.co.il/ar/product/{slug}     ar
https://kenyonexpress.co.il/ru/product/{slug}     ru
```

Product `slug` stays Latin (shared). Do not duplicate slugs per language.

`localePrefix: 'as-needed'` as already in `src/i18n/routing.ts`, expanded to four locales.

Cookie/preference: `NEXT_LOCALE` after an explicit toggle. Do not geo-IP force Russian or Arabic. First visit = `he`.

Language switcher: footer. Hebrew label of the target language in its own script (`English` `العربية` `Русский` `עברית`). Switching keeps the path (product/category/city) when a translation exists; otherwise fallback §3.

Do not locale-prefix: `/scan`, `/admin`, `/api/*`, `/gift/{token}`, `/account/orders/[id]/invoice`.

---

## 3. Fallback

Order:

1. Requested locale message / column
2. `he` (defaultLocale)
3. Visible "חסר תרגום" only in admin preview, never on the storefront

Storefront fallback rules:

| Missing | Behavior |
|---|---|
| UI string in `messages/{locale}.json` | use `he` string |
| `name_he` missing | product is unpublished. Do not fall back to English on the Hebrew site |
| `name_en` missing on `/en/product` | show `name_he` with `dir=rtl` on that title only, or 404 if we decide "no EN catalog yet". **v1 of EN: 404 the PDP** until `name_en` is non-empty. Category index lists only translated products |
| City landing without AR/RU body | 404 that locale city page; Hebrew city stays |

`src/i18n/request.ts` already maps unknown locale → `he`. Keep that.

RTL: `ar` and `he` set `dir=rtl` on `<html>`. `en` and `ru` set `dir=ltr`. Logical CSS (`ps`/`pe`, `start`/`end`) required. Physical `left`/`right` is debt (see component library on other branches).

---

## 4. Translation workflow

No TMS in repo. Do not add Crowdin in this spec.

| Layer | How |
|---|---|
| Chrome UI | `messages/{he,en,ar,ru}.json` via next-intl. Keys English. Values translated. PR review |
| Catalog | language-suffixed columns. Add `title_ar`, `description_ar`, … or a `product_translations` table in a **pending migration** (do not `db push`). Until then EN uses sparse `name_en` only |
| Email / WhatsApp | separate template per `(template_key, channel, locale)`. Do not interpolate mixed locales in one Twilio body |
| Legal | counsel. Drafts in `docs/legal/*` are Hebrew |
| AI | may draft `description_en` into `enrichment_suggestions`. Human publish. Prices never from the model |

Uploader UI: Hebrew is required. EN/AR/RU optional fields with `dir` matching the language. Empty optional = that locale PDP 404.

Notification prefs locale CHECK today: `('he','en')`. Expanding to `ar`,`ru` needs a pending migration. Until then, non-he users get `he` transactional mail.

---

## 5. hreflang

Live: canonical only, **no** `languages` map. Growth/performance docs: no hreflang cluster while monolingual.

When a second locale has at least one indexable URL:

```
hreflang=he-IL  → Hebrew URL (unprefixed)
hreflang=en-IL  → /en/...
hreflang=ar-IL  → /ar/...
hreflang=ru-IL  → /ru/...
hreflang=x-default → Hebrew URL
```

Only emit alternates that **exist** (200, indexable). Do not point `en-IL` at a Hebrew page.

`og:locale` matches the page. `og:locale:alternate` for the others that exist.

Sitemap: separate entries per locale URL. Do not put `/en/product/x` in the sitemap if that PDP 404s.

---

## 6. Hebrew UI copy for the switcher

```
שפה
עברית
English
العربية
Русский
```

On EN chrome, the coupon sentence must still be accurate:

```
You pay the coupon price on the site. Any remainder is paid at the business after the QR scan.
```

AR and RU equivalents are translator work, not this file. Do not ship those locales with a machine-translated money sentence.

---

## 7. Acceptance

- Hebrew URLs unchanged. Prefix only `en` `ar` `ru`.
- Fallback to `he` for UI chrome; PDP in a non-he locale 404s without a translated name.
- `/scan` and `/admin` stay Hebrew.
- hreflang only for real 200 pages; `x-default` is Hebrew.
- No legal translation without counsel.
- Money formatting stays agorot → ₪, `dir=ltr`.
