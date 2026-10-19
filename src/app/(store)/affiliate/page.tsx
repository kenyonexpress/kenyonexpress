import Link from 'next/link'

export const metadata = {
  title: 'תוכנית השותפים - קניון אקספרס',
  description: 'ממליצים על דילים מקניון אקספרס ומקבלים עמלה לארנק על הזמנות ששולמו.',
}

export default function AffiliatePage() {
  return (
    <main dir="rtl" className="mx-auto max-w-4xl space-y-8 px-4 py-10">
      {/* Header */}
      <div className="space-y-4">
        <h1 className="text-4xl font-bold text-heading">תוכנית השותפים של קניון אקספרס</h1>
        <p className="text-lg text-gray-700">הרוויח עמלה על כל קנייה שמופנית דרך הקישור השלך</p>
      </div>

      {/* How It Works */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-heading">איך זה עובד</h2>
        <div className="grid md:grid-cols-4 gap-4">
          <div className="border border-gray-200 p-4 rounded">
            <div className="text-2xl font-bold text-blue-600 mb-2">1</div>
            <h3 className="font-semibold mb-2">הצטרף</h3>
            <p className="text-sm text-gray-700">הרשם לתוכנית ותקבל קוד קישור ייחודי</p>
          </div>
          <div className="border border-gray-200 p-4 rounded">
            <div className="text-2xl font-bold text-blue-600 mb-2">2</div>
            <h3 className="font-semibold mb-2">שתף</h3>
            <p className="text-sm text-gray-700">שתף את הקישור עם הקהל שלך</p>
          </div>
          <div className="border border-gray-200 p-4 rounded">
            <div className="text-2xl font-bold text-blue-600 mb-2">3</div>
            <h3 className="font-semibold mb-2">עקוב</h3>
            <p className="text-sm text-gray-700">מעקב אוטומטי של קליקים והזמנות</p>
          </div>
          <div className="border border-gray-200 p-4 rounded">
            <div className="text-2xl font-bold text-blue-600 mb-2">4</div>
            <h3 className="font-semibold mb-2">הרוויח</h3>
            <p className="text-sm text-gray-700">קבל עמלה על כל קנייה מוצלחת</p>
          </div>
        </div>
      </section>

      {/* Rules */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-heading">חוקים</h2>
        <ul className="list-disc space-y-2 ps-5">
          <li>העמלה מחושבת על הסכום ששולם בחנות, לא על מחיר הקטלוג</li>
          <li>העמלה משונמת לכל הזמנה, כך שלא יהיו שתי עמלות לאותו קישור</li>
          <li>העמלה משולמת לאחר שעברו 14 ימי הביטול של ההזמנה</li>
          <li>הזמנה שבוטלה או שהוחזרה אינה מזכה בעמלה</li>
          <li>אתה לא יכול להרויח על הזמנות שלך</li>
        </ul>
      </section>

      {/* FAQ */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-heading">שאלות נפוצות</h2>
        <details className="border border-gray-200 p-4 rounded">
          <summary className="font-semibold cursor-pointer">כמה זמן הקישור שלי תקף?</summary>
          <p className="mt-3 text-gray-700">
            הקישור שלך תקף ל-30 ימים מהביקור. אם משהו יקנה בתוך 30 ימים מהביקור, הקנייה תהיה מיוחסת
            אליך.
          </p>
        </details>
        <details className="border border-gray-200 p-4 rounded">
          <summary className="font-semibold cursor-pointer">מתי אני מקבל את העמלה?</summary>
          <p className="mt-3 text-gray-700">
            העמלה משולמת לאחר שעברו 14 ימים מיום קבלת ההזמנה בחנות, ובתנאי שההזמנה לא בוטלה או
            הוחזרה.
          </p>
        </details>
        <details className="border border-gray-200 p-4 rounded">
          <summary className="font-semibold cursor-pointer">איזה דרכי תשלום זמינות?</summary>
          <p className="mt-3 text-gray-700">
            אנחנו תומכים בעמלה דרך ארנק דיגיטלי על האתר או העברה בנקאית. צור קשר לפרטים נוספים.
          </p>
        </details>
      </section>

      {/* CTA */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 text-center space-y-4">
        <h3 className="text-xl font-bold">מוכן להתחיל?</h3>
        <p className="text-gray-700">הצטרף לתוכנית השותפים שלנו והתחל להרוויח היום</p>
        <Link href="/account/affiliate" className="account-btn inline-block">
          להצטרפות ולקישורים שלי
        </Link>
      </div>
    </main>
  )
}
