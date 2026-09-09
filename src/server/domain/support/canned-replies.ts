/**
 * Canned replies.
 *
 * WHAT MAKES A CANNED REPLY WORTH HAVING, AND WHAT MAKES ONE HARMFUL. It is
 * worth having when it states a rule the operator would otherwise paraphrase
 * from memory, differently each time - "a redeemed voucher cannot be refunded"
 * is a property of `planOrderRefund`, and an operator improvising it will
 * eventually improvise it wrong and commit us to a refund we cannot make. It is
 * harmful when it answers a question nobody asked, which is how a support desk
 * teaches customers that writing in is pointless.
 *
 * SO EVERY REPLY BELOW STATES A RULE THAT IS TRUE IN THE CODE TODAY, and each
 * one names where. That is the same standard `content/legal/faq.ts` holds
 * itself to and for the same reason: this text goes out under our name and is
 * read INSTEAD of the truth.
 *
 * NONE OF THEM IS SENT AUTOMATICALLY. They fill the reply box and the operator
 * edits and sends. An auto-reply that fires on a keyword is a machine answering
 * a question it did not read, and the one thing worse than a slow answer is a
 * confident wrong one.
 */

export type CannedReply = {
  id: string
  /** What the operator picks from the list. */
  label: string
  /** What lands in the box, ready to edit. */
  body: string
  /** Where the rule this asserts actually lives. Not shown to the customer. */
  source: string
}

export const CANNED_REPLIES: readonly CannedReply[] = [
  {
    id: 'voucher_not_scanning',
    label: 'השובר לא נסרק בבית העסק',
    source: 'redeem_voucher / voucher state machine',
    body: `שלום,

מצטערים על אי הנוחות. אפשר לממש את השובר גם בלי סריקה: הראו לבית העסק את הקוד
שמופיע בעמוד השובר שלכם, והם יכולים להקליד אותו ידנית במערכת שלהם.

אם זה לא עובד, כתבו לנו את מספר ההזמנה ואת שם בית העסק ונטפל בזה מולם.`,
  },
  {
    id: 'redeemed_no_refund',
    label: 'שובר שכבר מומש אינו ניתן להחזר',
    source: 'planOrderRefund: a redeemed voucher blocks the refund',
    body: `שלום,

בדקנו: השובר בהזמנה הזו כבר מומש בבית העסק, כלומר הערך שלו נצרך. שובר שמומש
אינו ניתן לזיכוי לכרטיס.

אם לדעתכם המימוש נעשה בטעות או לא על ידיכם, כתבו לנו והמשיכו לפרט - נבדוק את
רישום הסריקה מול בית העסק.`,
  },
  {
    id: 'cancellation_fee',
    label: 'ביטול ודמי ביטול',
    source: 'computeCancellationFee: min(5%, ₪100), zero on a defect claim',
    body: `שלום,

לפי חוק הגנת הצרכן, בביטול עסקה נגבים דמי ביטול בגובה הנמוך מבין 5% מסכום
העסקה או ₪100.

אם הביטול נובע מפגם, מאי-התאמה למה שהוצג באתר או מכך שלא קיבלתם את המוצר -
אין דמי ביטול כלל ותקבלו החזר מלא. ספרו לנו מה קרה ונטפל בזה.`,
  },
  {
    id: 'full_refund_defect',
    label: 'החזר מלא בגלל פגם או אי-התאמה',
    source: 'computeCancellationFee(isDefectClaim=true) returns 0',
    body: `שלום,

תודה שסיפרתם לנו. במקרה של פגם או אי-התאמה למה שהוצג באתר, ההחזר הוא מלא -
100% מהסכום ששולם, בלי דמי ביטול.

הזיכוי חוזר לאמצעי התשלום המקורי. בכרטיס אשראי זה לוקח בדרך כלל מספר ימי עסקים
עד שהוא מופיע בדף החשבון, תלוי בחברת האשראי.`,
  },
  {
    id: 'where_is_voucher',
    label: 'השובר לא הגיע למייל',
    source: 'notification_outbox + /account/orders',
    body: `שלום,

השובר תמיד זמין בחשבון שלכם באתר, גם אם המייל לא הגיע: היכנסו ל"ההזמנות שלי",
פתחו את ההזמנה, והשובר עם הקוד וה-QR נמצא שם.

אם המייל לא הגיע, בדקו בבקשה גם בתיקיית הספאם. נשמח לשלוח שוב - כתבו לנו את
מספר ההזמנה.`,
  },
  {
    id: 'balance_at_counter',
    label: 'מה משלמים באתר ומה בבית העסק',
    source: 'order_items: face_value = coupon_price + remaining_amount_due',
    body: `שלום,

המחיר שמופיע באתר הוא התשלום המקדים. אם לשובר יש יתרה לתשלום, היא משולמת ישירות
בבית העסק בזמן המימוש, והסכום המדויק מופיע בעמוד השובר לפני הרכישה ואחריה.

כלומר: אין חיוב נוסף מאיתנו אחרי הרכישה.`,
  },
  {
    id: 'card_not_saved',
    label: 'האם פרטי האשראי נשמרים',
    source: 'payment_tokens holds a Cardcom token, never a PAN',
    body: `שלום,

מספר הכרטיס שלכם לא נשמר אצלנו. התשלום מתבצע מול חברת הסליקה, ומה שנשמר אצלנו
הוא אסימון (טוקן) שמאפשר חיוב חוזר בלבד ואי אפשר לגזור ממנו את מספר הכרטיס.

אפשר להסיר כרטיס שמור בכל רגע מעמוד "אמצעי תשלום" בחשבון שלכם.`,
  },
  {
    id: 'wallet_credit',
    label: 'הארנק וזיכוי לארנק',
    source: 'wallet_entries: an append-only ledger, spendable on site only',
    body: `שלום,

יתרת הארנק ניתנת למימוש ברכישות באתר בלבד, והיא נכנסת אוטומטית כהנחה במסך
התשלום. אי אפשר למשוך אותה למזומן או להעביר אותה לחשבון בנק.

היתרה והתנועות מופיעות בעמוד "הארנק שלי".`,
  },
  {
    id: 'need_order_number',
    label: 'בקשה למספר הזמנה',
    source: 'operational: no rule asserted',
    body: `שלום,

כדי שנוכל לבדוק, נשמח לקבל את מספר ההזמנה. הוא מופיע במייל האישור ובעמוד
"ההזמנות שלי" בחשבון שלכם.

אם אין לכם חשבון באתר, כתבו לנו את הכתובת שאיתה בוצעה ההזמנה ואת התאריך המשוער.`,
  },
  {
    id: 'closing',
    label: 'סגירת פנייה',
    source: 'operational: no rule asserted',
    body: `שלום,

מקווים שהנושא נפתר. אנחנו סוגרים את הפנייה, ואם משהו עדיין לא סגור - פשוט השיבו
להודעה הזו והפנייה תיפתח מחדש.

תודה שבחרתם בקניון אקספרס.`,
  },
]

export function cannedReply(id: string): CannedReply | undefined {
  return CANNED_REPLIES.find((reply) => reply.id === id)
}
