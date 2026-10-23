import { resetConsent } from '@/server/actions/consent'

/**
 * THE CONTROL THE COOKIE POLICY ALREADY PROMISED.
 *
 * The policy says measurement cookies are written only after consent and that
 * "you may withdraw at any time", and names the mechanism: "changing the
 * consent decision: through the consent banner on the site".
 *
 * The banner could not be reached that way. It is hidden before paint the
 * moment the cookie exists, and nothing re-opened it. The first click was
 * final. This is the missing half: clearing the cookie lets the banner ask
 * again, so the mechanism the document names becomes true rather than being
 * rewritten to describe what the code happened to do.
 *
 * A server action and a plain form, matching the banner itself: no client
 * bundle, works without JavaScript, and the decision is still made in exactly
 * one place.
 *
 * IT LIVES HERE AND NOT IN THE FOOTER. The footer is on every route the pixel
 * gate measures, so a new visible control there is a geometry change on seven
 * pages; this page is not one of them. It is also the better home - the
 * promise is made three paragraphs up.
 */
export default function ConsentResetBlock() {
  return (
    <section dir="rtl" className="mt-8 rounded-xl border border-border bg-surface p-5">
      <h2 className="font-bold text-heading text-lg">שינוי החלטת ההסכמה</h2>
      <p className="mt-2 text-muted text-sm leading-relaxed">
        הכפתור מוחק את רישום ההסכמה מהדפדפן ומציג שוב את באנר ההסכמה, כך שתוכלו להחליט מחדש. עוגיות
        המדידה והפרסום מפסיקות להיטען מרגע השינוי. העוגיות ההכרחיות אינן מושפעות, כי בלעדיהן העגלה,
        ההתחברות והתשלום אינם יכולים לפעול.
      </p>
      <form action={resetConsent}>
        <button
          type="submit"
          className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-brand-primary px-6 font-bold text-heading text-sm transition-opacity hover:opacity-90"
        >
          שינוי החלטת ההסכמה
        </button>
      </form>
    </section>
  )
}
