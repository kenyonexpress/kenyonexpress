# ארכיטקטורה: דפים משפטיים (מימוש)

routes, CMS shape, גרסאות, checkout consent, וטיוטות תוכן בעברית.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
טיוטות תוכן = הנדסה/עסק; **לא ייעוץ משפטי** עד `counselApproved=true`.

מודל כסף: **No Escrow**. קופון: `coupon_price` באתר לפלטפורמה; יתרה בבית העסק.

מסמכים קשורים:

```
docs/ARCHITECTURE-LEGAL-PAGES.md
docs/ARCHITECTURE-LEGAL-COMPLIANCE.md
docs/ARCHITECTURE-COOKIE-CONSENT.md
docs/ARCHITECTURE-ACCESSIBILITY.md
```

---

## החלטה

| # | הכרעה |
|---|---|
| LG1 | שישה routes: `/terms`, `/privacy`, `/cancellation`, `/accessibility`, `/cookies`, `/cancel`. |
| LG2 | תוכן ב-`src/content/legal/*.he.ts`; shell ב-`LegalDocument`. |
| LG3 | `counselApproved=false` → באנר טיוטה; אסור publish production בלי counsel. |
| LG4 | ISR `revalidate=86400`; on-demand אחרי שינוי `wording_version`. |
| LG5 | checkout: `accepted_terms_at` + `terms_version` על order. |
| LG6 | placeholders env: `NEXT_PUBLIC_LEGAL_*` עד מילוי counsel. |
| LG7 | redirects מ-URLs ישנים (terms-and-conditions, privacy-policy). |

### מודל עסק (רקע לנוסח)

| סוג | באתר | אצל ספק |
|---|---|---|
| קופון | `coupon_price` מלא | יתרה (`face - coupon`) במימוש |
| פיזי | מחיר מוזל | אספקה; עמלה `platform_percent` snapshot |

### routes

| Route | H1 | footer | robots |
|---|---|---|---|
| `/terms` | תקנון אתר | כן | index |
| `/privacy` | מדיניות פרטיות | כן | index |
| `/cancellation` | מדיניות ביטולים | כן | index |
| `/accessibility` | הצהרת נגישות | כן | index |
| `/cookies` | מדיניות עוגיות | כן + באנר | index |
| `/cancel` | ביטול עסקה | כן | noindex |

### מבנה קוד

```
src/app/(store)/terms/page.tsx
src/app/(store)/privacy/page.tsx
src/app/(store)/cancellation/page.tsx
src/app/(store)/accessibility/page.tsx
src/app/(store)/cookies/page.tsx
src/app/(store)/cancel/page.tsx
src/content/legal/meta.ts
src/content/legal/terms.he.ts
src/content/legal/privacy.he.ts
src/content/legal/cancellation.he.ts
src/content/legal/accessibility.he.ts
src/content/legal/cookies.he.ts
src/components/legal/LegalDocument.tsx
src/components/legal/LawyerDraftBanner.tsx
```

### meta.ts (גרסאות)

```ts
export const LEGAL = {
  companyNameHe: process.env.NEXT_PUBLIC_LEGAL_COMPANY_NAME_HE ?? '{{COMPANY_NAME_HE}}',
  companyId: process.env.NEXT_PUBLIC_LEGAL_COMPANY_ID ?? '{{COMPANY_ID}}',
  effectiveDate: '2026-07-30',
  termsVersion: 'terms-2026-07-30-DRAFT',
  privacyVersion: 'privacy-2026-07-30-DRAFT',
  cancelVersion: 'cancel-2026-07-30-DRAFT',
  counselApproved: false,
} as const
```

### placeholders counsel

| Placeholder | דוגמה |
|---|---|
| `{{COMPANY_NAME_HE}}` | שם בעברית |
| `{{COMPANY_ID}}` | ח.פ / עוסק |
| `{{COMPANY_ADDRESS}}` | כתובת רשומה |
| `{{DPO_NAME_OR_ROLE}}` | ממונה פרטיות |

---

## חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| CMS headless day-1 | LG2: git + ISR; counsel diff. |
| MDX חופשי ללא version | LG3/LG5: `wording_version` חובה. |
| publish בלי counsel | LG3: באנר + CI gate. |
| תוכן משפטי ב-DB בלבד | LG2: TS + review ב-PR. |
| `/cancel` indexable | noindex: כלי, לא SEO. |
| checkbox בלי snapshot | LG5: `terms_version` על order. |

---

## סכמת DB

```text
orders (
  accepted_terms_at timestamptz,
  terms_version text,
  ...
)

consent_events (
  id uuid PK,
  user_id uuid,
  consent_type text,
  granted boolean,
  wording_version text,
  created_at timestamptz
)

cancellation_requests (
  id uuid PK,
  order_id uuid FK,
  status text,
  created_at timestamptz
)

legal_versions (
  key text PK,
  version text,
  effective_date date,
  counsel_approved boolean
)
```

| אירוע checkout | שדה |
|---|---|
| אישור תקנון | `orders.terms_version` |
| analytics | cookie + `consent_events` |
| דיוור 30א | `consent_events` |

---

## מקרי קצה

| # | מקרה | התנהגות |
|---|---|---|
| CE1 | `counselApproved=false` ב-production | באנר טיוטה; CI alert |
| CE2 | שינוי terms אחרי order | order שומר גרסה ישנה |
| CE3 | redirect ישן | 301 ל-route חדש |
| CE4 | placeholder לא מולא | מוצג {{...}}; חוסם GA |
| CE5 | `/cancel` ללא auth | אימות order+email |
| CE6 | עדכון cookies בלי revalidate | on-demand ISR |

---

## פתוחות

| # | פתוח | הערה |
|---|---|---|
| O1 | `scripts/legal/assert-counsel.ts` CI | לפני release tag |
| O2 | מילוי placeholders env | counsel |
| O3 | טיוטות מלאות ב-`*.he.ts` | [לבדיקת עו"ד] |
| O4 | PDF חתום בארכיון | ops |
| O5 | סקר נגישות → עדכון הצהרה | ACCESSIBILITY |

---

## נספח: LegalDocument shell

```tsx
export function LegalDocument({ title, version, children }) {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      {!LEGAL.counselApproved ? <LawyerDraftBanner /> : null}
      <h1>{title}</h1>
      <p>גרסה: {version} · בתוקף מ: {LEGAL.effectiveDate}</p>
      <article className="prose mt-8 text-start">{children}</article>
    </main>
  )
}
```

## נספח: redirects

```ts
async redirects() {
  return [
    { source: '/terms-and-conditions', destination: '/terms', permanent: true },
    { source: '/privacy-policy', destination: '/privacy', permanent: true },
    { source: '/cancel-policy', destination: '/cancellation', permanent: true },
  ]
}
```

## נספח: צ'קליסט counsel

- [ ] פרטי עוסק מלאים
- [ ] תקנון: תיווך / קופון / פיזי / אחריות
- [ ] פרטיות: תיקון 13, DPO, העברות, שמירה
- [ ] ביטולים: 14 יום, 5%/100 ₪, חריגים קופון
- [ ] נגישות: 5568, רכז, מגבלות אחרי סקר
- [ ] עוגיות: הכרחי vs אנליטיקה, opt-in
- [ ] `counselApproved=true` + הסרת DRAFT

טיוטות תוכן מלאות (terms, privacy, cancellation, a11y, cookies): ראו git history `2026-07-30` או יישום ב-`src/content/legal/`.

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-07-30 | ארכיטקטורה + טיוטות עברית (arch/legal) |
| 2026-08-12 | batch-2: תבנית חובה (5 סעיפים); נספח מקוצר |
