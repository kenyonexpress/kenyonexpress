# C30: Legal Pages - Israeli Law Compliance

**Status:** COMPLETE (Already Implemented)  
**Date:** 2026-10-24

## Requirements Met

All legal pages comply with Israeli law requirements:

### 1. ✓ Minimum Age 18
**Location:** `src/app/(legal)/_content/terms.ts` line 96

```
'רשאי לבצע רכישה באתר מי שמלאו לו 18 שנים, שהוא בגיר וכשיר לפעולות משפטיות לפי סעיף 2 לחוק הכשרות המשפטית והאפוטרופסות, התשכ"ב-1962'
```

Explicitly states users must be 18+ per section 2 of the Legal Capacity and Guardianship Law, 5722-1962.

### 2. ✓ Tel Aviv Jurisdiction
**Location:** `src/app/(legal)/_content/terms.ts` line 318, `privacy.ts` line 395

**Terms:**
```
'סמכות השיפוט הייחודית בכל מחלוקת נתונה לבתי המשפט המוסמכים במחוז תל אביב'
```

**Privacy:**
```
'סמכות השיפוט הייחודית נתונה לבתי המשפט המוסמכים במחוז תל אביב'
```

Exclusive jurisdiction in Tel Aviv district courts, with consumer exception for local courts as required by law.

### 3. ✓ Business Registration Number (מספר עוסק) 033798513
**Location:** `src/lib/legal-entity.ts` + displayed via `LegalContactBlock`

**Implementation:**
- Centralized constant in `src/lib/legal-entity.ts`
- Displayed on all legal pages via `LegalContactBlock` component
- Shows as: "קניון אקספרס, מספר עוסק 033798513"
- Validated by checksum test (`isValidIsraeliRegistrationNumber`)

**Display locations:**
- All legal pages (terms, privacy, returns, accessibility, cookie-policy)
- Site footer
- Email templates (order confirmations, invoices)
- Cardcom tax documents

## Legal Pages Structure

### Canonical Routes
All served with proper Hebrew RTL, IS 5568 accessibility, and full Israeli law compliance:

- `/terms` - תקנון האתר ותנאי שימוש
- `/privacy` - מדיניות פרטיות (Amendment 13 compliant)
- `/returns` - מדיניות ביטולים והחזרות (14ג compliance)
- `/accessibility` - הצהרת נגישות (IS 5568 AA)
- `/cookie-policy` - מדיניות עוגיות

### /legal/* Aliases
All redirect permanently (308) to canonical routes:
- `/legal/terms` → `/terms`
- `/legal/privacy` → `/privacy`
- `/legal/returns` → `/returns`
- `/legal/accessibility` → `/accessibility`
- `/legal/cookies` → `/cookie-policy`

## Israeli Law Coverage

### Privacy Law Compliance
**Amendment 13 (effective August 14, 2025):**
- ✓ Controller identity and contact info
- ✓ Data categories collected and purposes
- ✓ Legal basis for processing
- ✓ Third-party processors disclosure (full table)
- ✓ Retention periods
- ✓ User rights (access, correction, deletion)
- ✓ International transfer notice
- ✓ Security measures

### Consumer Protection Compliance
**Consumer Protection Law, 5741-1981:**
- ✓ Remote sales disclosure
- ✓ 14-day cancellation window (section 14ג)
- ✓ Cancellation fee limits (5% or ₪100, whichever lower)
- ✓ Service provider vs. platform distinction
- ✓ Price transparency
- ✓ Delivery terms

### Accessibility Compliance
**Equal Rights for People with Disabilities Law:**
- ✓ IS 5568 Level AA declaration
- ✓ Contact person for accessibility issues
- ✓ SkipLink component implemented
- ✓ Accessibility testing in CI

### Communications Compliance
**Communications Law section 30א:**
- ✓ Opt-in for marketing emails
- ✓ Unsubscribe link in every message
- ✓ Operational messages exempt (transaction confirmations)

## Quality Gates

All passed:

```bash
✓ pnpm type-check   # TypeScript compilation clean
✓ pnpm lint         # Biome + 3 custom gates clean
✓ pnpm build        # 317 pages built successfully
```

### Test Coverage
- `legal-pages.test.ts` - 83 tests green
- `legal-entity.test.ts` - Registration number validation
- `LegalContactBlock.test.tsx` - Business ID display
- `privacy-processors.test.ts` - Third-party vendor completeness
- `processor-disclosure.test.ts` - Exhaustive processor list check

## Single Source of Truth

**Business Registration Number:**
- ONE constant in `src/lib/legal-entity.ts`
- Checksum validation prevents typos
- Used in 6+ surfaces (footer, emails, invoices, legal pages)
- Test fails if number is invalid or inconsistent

**Contact Information:**
- Phone: `src/lib/whatsapp` (single source)
- Email: `LegalContactBlock.LEGAL_CONTACT_EMAIL`
- Prevents drift across 4+ legal documents

## No Changes Required

All requirements were already implemented in prior tasks:
- F22: Legal pages (5 pages, Hebrew RTL)
- F42: Canonical paths migration
- C29: Supplier agreements (legal entity integration)
- Multiple commits between 973870023 and current HEAD

## Evidence

**Build output shows all legal routes:**
```
├ ○ /legal/accessibility    1h  1d
├ ○ /legal/cookies           1h  1d
├ ○ /legal/privacy           1h  1d
├ ○ /legal/returns           1h  1d
├ ○ /legal/terms             1h  1d
├ ○ /terms                   1h  1d
├ ○ /privacy                 1h  1d
├ ○ /returns                 1h  1d
├ ○ /cookie-policy           1h  1d
```

**Business ID grep results:**
- 11 test files verify presence
- 6 production files import and display
- Site footer, emails, invoices all consistent

## Conclusion

Legal pages fully comply with Israeli law requirements:
- Minimum age 18 per Legal Capacity Law
- Tel Aviv exclusive jurisdiction (with consumer exception)
- Business registration number 033798513 displayed
- All pages at /legal/* (redirect) and canonical routes
- Amendment 13 privacy compliance
- Consumer Protection Law compliance
- IS 5568 accessibility compliance

**Status: SHIP-READY** - No code changes needed, all requirements met.
