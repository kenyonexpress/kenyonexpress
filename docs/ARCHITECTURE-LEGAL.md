# ARCHITECTURE-LEGAL.md

ארכיטקטורת **משפטי / ציות לקוח** (מסגרת מוצר; לא ייעוץ משפטי).

Status: BINDING product checklist · `ke-arch` · Date: 2026-07-31 · docs only.  
Counsel must review before GA.

## Required public pages
| Page | Purpose |
|---|---|
| תנאי שימוש | חוזה צרכן/ספק ברמת פלטפורמה |
| מדיניות פרטיות | עוגיות, Google, Cardcom, WhatsApp |
| מדיניות ביטול/החזרות | חלונות חוק הגנת הצרכן + קופונים |
| נגישות | הצהרה + יעדי WCAG |

## Product bindings that copy must match
1. קופון: תשלום באתר = `coupon_price`; יתרה בבית העסק; אין Escrow.  
2. ארנק: קרדיט אתר בלבד, לא משיכה.  
3. פקיעת קופון: זיכוי ארנק (מדיניות C6) אלא אם counsel משנה.  
4. שמירת כרטיס: טוקן Cardcom בלבד.

## Consent
- Marketing email/WhatsApp: opt-in + unsubscribe (`consent_events`).  
- Transactional purchase/QR: allowed under transactional rules; still honor hard suppressions.

## Account deletion
Self-serve request → grace period → anonymize profiles; keep money records as required by bookkeeping law (counsel).

## Revision
| Date | Change |
|---|---|
| 2026-07-31 | Legal product checklist in `ke-arch` (`arch/docs-queue`) |
