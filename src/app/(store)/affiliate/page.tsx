import Link from 'next/link'

export const metadata = {
  title: 'תוכנית השותפים',
  description: 'ממליצים על דילים מקניון EXPRESS ומקבלים עמלה לארנק על הזמנות ששולמו.',
}

export default function AffiliatePage() {
  return (
    <main dir="rtl" className="mx-auto max-w-2xl space-y-4 px-4 py-10">
      <h1 className="text-2xl font-bold text-heading">תוכנית השותפים</h1>
      <p>
        יש לכם קהל שאוהב דילים? מצטרפים, מקבלים קישור אישי, ועל כל הזמנה ששולמה דרכו נכנסת עמלה
        לארנק שלכם באתר.
      </p>
      <ul className="list-disc space-y-1 ps-5">
        <li>העמלה נקבעת לפי הקמפיין ומוצגת לפני שיוצרים קישור.</li>
        <li>העמלה משולמת אחרי שעברו 14 ימי הביטול של ההזמנה.</li>
        <li>הזמנה שבוטלה או שהוחזרה אינה מזכה בעמלה, וגם לא רכישה שלכם עצמכם.</li>
      </ul>
      <Link href="/account/affiliate" className="account-btn inline-block">
        להצטרפות ולקישורים שלי
      </Link>
    </main>
  )
}
