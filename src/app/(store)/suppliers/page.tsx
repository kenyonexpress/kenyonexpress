import SupplierLeadForm from '@/components/storefront/SupplierLeadForm'
import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'הצטרפו כספקים',
  description:
    'בית עסק שרוצה למכור קופונים ומוצרים בקניון אקספרס: איך זה עובד, מה נדרש, ואיך משאירים פרטים.',
  alternates: { canonical: '/suppliers' },
}

/**
 * The join-us page.
 *
 * WHAT IT PROMISES IS ONLY WHAT THE SYSTEM DOES. No commission rate is quoted:
 * `platform_percent` is per product with no default anywhere in the schema (C1),
 * and printing a number here would be a binding claim the catalogue contradicts
 * product by product. No payout timing is quoted beyond what migration 051
 * actually enforces - T+3 business days, minimum ₪100 - because those two are
 * in the database as `payout_available_at()` and `min_payout_ils`, and a
 * trigger refuses a payout that breaks either.
 *
 * The frame matches `/about` and `/faq`, which were measured against the live
 * template. A marketing page with its own rhythm is what the comparison gate
 * exists to catch.
 */

const STEPS = [
  {
    title: 'משאירים פרטים',
    body: 'ממלאים את הטופס כאן. אנחנו חוזרים אליכם לשיחה קצרה על העסק ועל הדיל.',
  },
  {
    title: 'בונים את הדיל יחד',
    body: 'קובעים מה נמכר, באיזה מחיר, כמה משלמים מראש וכמה נגבה אצלכם בעסק. התוקף נקבע מראש ומוצג ללקוח לפני הרכישה.',
  },
  {
    title: 'הדיל עולה לאתר',
    body: 'הלקוח משלם כאן ומקבל שובר עם קוד QR. פרטי העסק שלכם מוצגים בדף המוצר ונשמרים על ההזמנה כפי שהיו ביום הרכישה.',
  },
  {
    title: 'סורקים ומקבלים תשלום',
    body: 'הלקוח מגיע אליכם, אתם סורקים את ה-QR מהאזור האישי או מהאפליקציה, והשובר נשרף מיידית. יתרה לתשלום, אם יש, נגבית אצלכם.',
  },
] as const

const FACTS = [
  {
    title: 'שובר נסרק פעם אחת',
    body: 'הבדיקה נעשית במסד הנתונים ברגע הסריקה, לא במכשיר. שובר שכבר מומש נדחה גם אם צולם או הועבר.',
  },
  {
    title: 'תשלום T+3',
    body: 'הזיכוי הופך זמין שלושה ימי עסקים אחרי המכירה, לפי לוח השנה הישראלי. מתחת ל-₪100 היתרה מתגלגלת לתשלום הבא.',
  },
  {
    title: 'הכל מתועד',
    body: 'כל סריקה נרשמת עם הזמן, השובר ומי שסרק. אתם רואים את המכירות והסריקות באזור הספקים.',
  },
] as const

export default function SuppliersPage() {
  return (
    <main className="mx-auto w-full max-w-page px-4 py-10">
      <nav aria-label="נתיב ניווט" className="mb-6 text-sm text-heading/80">
        <Link href="/" className="hover:text-heading">
          בית
        </Link>
        <span aria-hidden="true" className="mx-2">
          /
        </span>
        <span className="text-heading">הצטרפו כספקים</span>
      </nav>

      <header className="mb-10 max-w-3xl">
        <h1 className="text-3xl font-bold text-heading">הצטרפו כספקים</h1>
        <p className="mt-4 text-base leading-relaxed text-heading/80">
          קניון אקספרס מוכרת קופונים של בתי עסק ישראליים. הלקוח משלם כאן מקדמה, מגיע אליכם עם שובר
          שנסרק במקום, ואת היתרה משלם אצלכם. אנחנו מביאים את הלקוח, אתם נותנים את השירות.
        </p>
      </header>

      <section className="mb-12 max-w-3xl">
        <h2 className="mb-5 text-xl font-semibold text-heading">איך זה עובד</h2>
        <ol className="space-y-5">
          {STEPS.map((step, index) => (
            <li key={step.title} className="flex gap-4">
              <span
                aria-hidden="true"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand text-sm font-bold text-heading"
              >
                {index + 1}
              </span>
              <div>
                <h3 className="text-base font-semibold text-heading">{step.title}</h3>
                <p className="mt-1 text-base leading-relaxed text-heading/80">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="mb-12 grid max-w-4xl gap-4 sm:grid-cols-3">
        {FACTS.map((fact) => (
          <div key={fact.title} className="rounded-xl border border-heading/10 p-5">
            <h3 className="text-base font-semibold text-heading">{fact.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-heading/75">{fact.body}</p>
          </div>
        ))}
      </section>

      <section className="max-w-3xl">
        <h2 className="mb-2 text-xl font-semibold text-heading">השאירו פרטים</h2>
        <p className="mb-6 text-base leading-relaxed text-heading/80">
          העמלה נקבעת פר דיל ולא לפי טבלה אחידה, ולכן היא חלק מהשיחה ולא מספר שכתוב כאן.
        </p>
        <SupplierLeadForm />
      </section>
    </main>
  )
}
