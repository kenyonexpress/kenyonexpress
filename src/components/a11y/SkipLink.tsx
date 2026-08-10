/**
 * "Skip to content", the first focusable thing on the page.
 *
 * WHY IT MATTERS HERE SPECIFICALLY. The store header is a masthead, a search
 * bar, a category menu and a nav row. A keyboard or screen-reader user landing
 * on a product page has to tab through every one of those links before reaching
 * the product, on EVERY page, because the header repeats. Israeli standard 5568
 * adopts WCAG 2.0 AA, and this is 2.4.1 Bypass Blocks.
 *
 * It is visually hidden until focused, which is the whole trick: sighted mouse
 * users never see it, and the first Tab press reveals it. `sr-only` alone would
 * keep it hidden even when focused, so the focus styles restore real geometry
 * rather than only changing colour.
 *
 * RTL: `right-4` rather than `left-4`, because in a right-to-left document the
 * reading origin is the top-right corner and that is where a focused skip link
 * is expected to appear.
 *
 * The target is `#main-content`, which `(store)/layout.tsx` puts on its
 * `<main>`. `tabIndex={-1}` there is required, not optional: without it the
 * browser moves the viewport but leaves FOCUS on the link, so the next Tab
 * returns to the header and the skip silently does nothing for the very users
 * it exists for.
 */
export default function SkipLink() {
  return (
    <a
      href="#main-content"
      className="
        sr-only
        focus:not-sr-only
        focus:fixed focus:top-4 focus:right-4 focus:z-[100]
        focus:h-auto focus:w-auto focus:overflow-visible
        focus:rounded-lg focus:bg-white focus:px-4 focus:py-2
        focus:text-sm focus:font-semibold focus:text-black
        focus:shadow-lg focus:outline-none
        focus:ring-2 focus:ring-black focus:ring-offset-2
      "
    >
      דילוג לתוכן הראשי
    </a>
  )
}
