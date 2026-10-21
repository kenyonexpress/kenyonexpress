import { createHash } from 'node:crypto'

/**
 * The business agreement a supplier accepts by click-wrap when applying.
 *
 * Bump `SUPPLIER_AGREEMENT_VERSION` with any change to the text. The hash is
 * computed from the text itself, so an edit without a bump still changes the
 * hash and a stale form is refused rather than recorded against new wording.
 * Terms stated here are only the ones the system enforces; the per-deal
 * commission is agreed per product and is deliberately not a number here.
 */
export const SUPPLIER_AGREEMENT_VERSION = '2026-10-21'

export const SUPPLIER_AGREEMENT_CLAUSES: readonly string[] = [
  'העסק מצהיר שהפרטים שמסר נכונים ושהוא מוסמך להתקשר בהסכם זה ולמכור את השירותים שיוצעו באתר.',
  'העמלה נקבעת בנפרד לכל דיל ומוסכמת מראש. היא נשמרת על כל הזמנה כפי שהייתה ביום הרכישה.',
  'הלקוח מציג קוד או QR בבית העסק, והעסק מכבד שובר תקף. שובר נסרק פעם אחת בלבד.',
  'התשלום לעסק מתבצע שלושה ימי עסקים אחרי המכירה. יתרה מתחת ל-₪100 מתגלגלת לתשלום הבא.',
  'ביטול ורכישה חוזרת של שובר כפופים לחוק הגנת הצרכן, ולמדיניות הביטולים המפורסמת באתר.',
  'לקניון אקספרס זכות בלתי מוגבלת להחזיר לכל לקוח את מלוא הסכום ששילם, בכל עת, בכל דיל, ללא צורך באישור העסק וללא חובת הנמקה. סכום שהוחזר ללקוח ושכבר שולם לעסק יקוזז מהתשלום הבא לעסק.',
  'ההסכם כפוף לדין הישראלי, וסמכות השיפוט הבלעדית נתונה לבתי המשפט המוסמכים בתל אביב.',
]

export function supplierAgreementText(): string {
  return `${SUPPLIER_AGREEMENT_VERSION}\n${SUPPLIER_AGREEMENT_CLAUSES.join('\n')}`
}

export function supplierAgreementHash(): string {
  return createHash('sha256').update(supplierAgreementText(), 'utf8').digest('hex')
}
