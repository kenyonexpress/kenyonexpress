/**
 * The questions this site can answer about ITSELF.
 *
 * Every answer below describes behaviour that exists in the code today: a
 * coupon is issued per unit at payment and carries a QR the business scans, the
 * price on the site is the prepayment and the balance is paid at the counter,
 * validity comes from a mandatory per-product field with no default (finalize
 * REFUSES to issue a voucher for a product without one), wallet credit is
 * spendable on the site only, and a refund is planned by `planOrderRefund`.
 *
 * An FAQ is the easiest page on a site to fill with plausible sentences, and
 * the most expensive to get wrong: it is what a customer reads INSTEAD of
 * contacting support, so a wrong answer here is a silent one. Anything not
 * knowable from the code - delivery times, business hours - is not answered.
 */

export interface FaqEntry {
  question: string
  answer: string
}

export const FAQ_UPDATED_AT = '2026-08-07'

export const faqEntries: readonly FaqEntry[] = [
  {
    question: 'איך עובד קופון בקניון אקספרס?',
    answer:
      'בוחרים דיל, משלמים באתר את מחיר הקופון, ומיד לאחר התשלום מונפק לכם קופון עם קוד ו-QR. את הקופון מציגים בבית העסק, שם סורקים אותו, וזהו. הקופון זמין באזור האישי תחת "הקופונים שלי" ונשלח גם למייל.',
  },
  {
    question: 'המחיר באתר הוא המחיר הסופי?',
    answer:
      'בחלק מהדילים המחיר באתר הוא תשלום מקדמי, ויתרה מסוימת משולמת ישירות בבית העסק בזמן המימוש. הסכום המדויק לתשלום בבית העסק מופיע בדף המוצר, בקופון עצמו ובאזור האישי, לפני התשלום ואחריו.',
  },
  {
    question: 'לכמה זמן הקופון בתוקף?',
    answer:
      'תקופת התוקף נקבעת בכל דיל בנפרד ומופיעה על הקופון עצמו ובדף המוצר. אין תוקף ברירת מחדל: דיל שלא הוגדרה בו תקופת תוקף אינו יכול להימכר במערכת.',
  },
  {
    question: 'מה קורה אם לא הספקתי לממש את הקופון?',
    answer:
      'קופון שפג תוקפו אינו ניתן למימוש בבית העסק. אם התוקף פג בנסיבות שאינן תלויות בכם, פנו אלינו דרך עמוד "צור קשר" ונבדוק כל מקרה לגופו.',
  },
  {
    question: 'איך מבטלים הזמנה ומקבלים החזר?',
    answer:
      'פונים אלינו עם מספר ההזמנה דרך "צור קשר", במייל או בוואטסאפ. פירוט מלא של חלון הביטול, דמי הביטול והמקרים שבהם ההחזר מלא נמצא בעמוד מדיניות הביטולים וההחזרות.',
  },
  {
    question: 'קופון שכבר מומש ניתן לביטול?',
    answer:
      'לא דרך האתר. מרגע שהקופון נסרק בבית העסק השירות או המוצר כבר סופקו. במקרה כזה פנו אלינו ונטפל בפנייה מול בית העסק.',
  },
  {
    question: 'מה זה הארנק שלי באתר?',
    answer:
      'הארנק מרכז זיכויים וקאשבק שנצברו בקנייה. אפשר להשתמש ביתרה כתשלום בקנייה הבאה באתר, והיא מופחתת מהסכום שנגבה בכרטיס. הארנק אינו ניתן להמרה למזומן.',
  },
  {
    question: 'אני מקבל חשבונית?',
    answer:
      'כן. על כל תשלום מונפקת חשבונית מס / קבלה, והיא זמינה להורדה בעמוד ההזמנה באזור האישי. הקישור לחשבונית נשלח גם במייל אישור ההזמנה.',
  },
  {
    question: 'האם פרטי האשראי שלי נשמרים אצלכם?',
    answer:
      'לא. התשלום מתבצע בדף מאובטח של חברת הסליקה, ופרטי הכרטיס אינם עוברים דרך שרתי האתר ואינם נשמרים בהם. אם בחרתם לשמור כרטיס לתשלום עתידי, נשמר אצלנו מזהה מוצפן (טוקן) של חברת הסליקה ולא מספר הכרטיס.',
  },
  {
    question: 'מי אחראי לשירות עצמו?',
    answer:
      'השירות או המוצר מסופקים על ידי בית העסק המפרסם את הדיל. בשאלות על מועדי פעילות, תנאי המקום או טיב השירות יש לפנות ישירות אליו. כל מה שקשור לתשלום, לקופון ולהחזר הכספי מטופל מולנו.',
  },
  {
    question: 'לא קיבלתי את הקופון למייל, מה עושים?',
    answer:
      'קודם כול בדקו את תיקיית הספאם. בכל מקרה הקופון זמין באזור האישי תחת "הקופונים שלי" מיד לאחר התשלום, ואפשר להציג אותו משם בבית העסק גם בלי המייל.',
  },
  {
    question: 'איך מצטרפים כבית עסק?',
    answer:
      'פנו אלינו דרך עמוד "צור קשר" עם פרטי העסק, ונחזור אליכם עם התנאים ועם אופן ההצטרפות לפורטל הספקים.',
  },
]
