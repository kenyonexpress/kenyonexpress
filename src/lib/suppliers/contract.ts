import { createHash } from 'node:crypto'

/**
 * The supplier agreement, its version, and the hash that makes an acceptance
 * mean something.
 *
 * WHY THE HASH. "The supplier accepted the terms" is worth nothing if the terms
 * can be edited afterwards - the record would say a version number that now
 * points at different words. Each acceptance stores a SHA-256 of the exact text
 * that was on screen, so a dispute about what was agreed is settled by
 * comparison rather than by trusting that nobody touched the document.
 *
 * THE HASH IS COMPUTED FROM THE CONSTANT, NEVER FROM THE FORM. A hash the
 * browser sends is a hash the browser chose, and an acceptance is exactly the
 * record somebody would want to forge. The server hashes `CONTRACT_TEXT` at
 * the moment of acceptance; the client sends only "I accept" and the version it
 * was shown, and a version mismatch is a refusal rather than a silent overwrite.
 *
 * WHAT THIS IS NOT. It is not legal advice and it is not a lawyer's document.
 * It states the commercial terms this codebase actually implements - the
 * commission is per product and snapshotted at purchase, payouts wait a
 * configurable number of business days, a redeemed voucher cannot be refunded -
 * and it says nothing this software cannot demonstrate. Anything else is for
 * whoever drafts the real agreement to add, with a new version number.
 */

export const CONTRACT_VERSION = 'v1-2026-09-09'

export const CONTRACT_TEXT = `הסכם ספק — קניון אקספרס
גרסה ${'v1-2026-09-09'}

1. מהות ההתקשרות
קניון אקספרס מפעילה זירה שבה לקוחות רוכשים שוברים למוצרים ולשירותים של בית
העסק. בית העסק הוא הספק של השירות עצמו ואחראי לו כלפי הלקוח; קניון אקספרס
אחראית לגבייה, להנפקת השובר ולהעברת התמורה.

2. עמלה
העמלה נקבעת פר מוצר ונשמרת כצילום בזמן ההזמנה. שינוי עמלה עתידי אינו חל על
הזמנות שכבר בוצעו.

3. תמורה ומועדי תשלום
התמורה בגין שובר משולמת לבית העסק לאחר מימוש השובר, בכפוף לתקופת המתנה בימי
עסקים הנקבעת בהסכם המסחרי ולסכום מינימלי לתשלום. פירוט מלא מופיע בדוח התשלומים
בממשק הספק.

4. מימוש שוברים
בית העסק מתחייב לכבד שובר תקף שהוצג לו, ולסרוק או להקליד את הקוד במערכת בעת
המימוש. שובר שמומש אינו ניתן לביטול או להחזר.

5. תוקף
לכל מוצר נקבע תוקף. שובר שפג תוקפו מטופל לפי המדיניות המפורסמת ללקוח.

6. ביטולים והחזרים
ביטול על ידי הלקוח מטופל לפי חוק הגנת הצרכן. בביטול מרצון נגבים דמי ביטול
בגובה הנמוך מבין 5% מסכום העסקה או ₪100. בביטול עקב פגם או אי-התאמה ההחזר מלא
ואינו נושא דמי ביטול.

7. פרטי חשבון בנק
פרטי חשבון הבנק נשמרים מוצפנים. מספר החשבון אינו נשמר כשדה גלוי, ומה שנגיש
לצוות התפעול הוא שם הבנק, מספר הסניף וארבע הספרות האחרונות בלבד.

8. מסמכים
בית העסק מוסר אישור ניהול חשבון ותעודת התאגדות או אישור עוסק. המסמכים נשמרים
באחסון פרטי ונגישים לצוות האישורים בלבד.

9. השעיה וסיום
קניון אקספרס רשאית להשעות בית עסק בעקבות תלונות חוזרות, אי-כיבוד שוברים או
מסירת פרטים שאינם נכונים. שוברים שכבר נמכרו ימשיכו להיות ניתנים למימוש או
יזוכו ללקוח.

10. הגנת פרטיות
כל צד שומר על פרטי הלקוחות שהגיעו אליו במסגרת ההתקשרות ואינו עושה בהם שימוש
מעבר לנדרש לצורך אספקת השירות.`

/**
 * SHA-256 of the text, hex, lowercase. The column CHECK in 204 is
 * `^[0-9a-f]{64}$`, so the casing is part of the contract with the database.
 */
export function contractHash(text: string = CONTRACT_TEXT): string {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

/**
 * The version the client says it was shown must match what we would serve now.
 * A mismatch means the terms changed between rendering and submitting, and the
 * right answer is to show the new ones rather than to record an acceptance of
 * text nobody read.
 */
export function contractVersionMatches(claimed: string | null | undefined): boolean {
  return claimed === CONTRACT_VERSION
}
