'use client'

/**
 * The end-of-day print button.
 *
 * WHY PRINTING IS THE RIGHT ANSWER HERE and a PDF endpoint is not. What a shop
 * does with this is put it in the till drawer next to the cash, so the number
 * on paper can be reconciled against what was taken. That needs a printer, not
 * a file - and `window.print()` with a `@media print` stylesheet gives every
 * device the operating system's own print dialogue, including "save as PDF",
 * without a server route, a font bundle or a layout engine.
 *
 * The stylesheet is what makes it worth having. Printing the page as it stands
 * produces the navigation, the thirty-day card and a table that runs off the
 * paper. `.print-day-only` hides everything the counter does not need on paper,
 * so what comes out is one dated sheet with the count and the amount to
 * collect.
 */
export default function PrintDaySummary() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="min-h-11 rounded-xl border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 print:hidden"
    >
      הדפסת סיכום היום
    </button>
  )
}
