import type { TrustStep } from '../_content/trust'
import StepIllustration from './StepIllustration'

/**
 * A three-step flow, drawn as an ordered list.
 *
 * `<ol>` AND NOT A GRID OF DIVS. The order is the content: "pay" before
 * "redeem" is the whole claim the section makes. A screen reader on a div grid
 * hears three unrelated headings, and the same tree with `list-none` still
 * announces "list, 3 items, item 1 of 3". The numerals are painted in the
 * corner of each card and marked `aria-hidden`, because the list already says
 * which one is first.
 *
 * COLOUR. The disc is brand yellow with `text-heading` ink, which is the
 * pairing `src/lib/a11y/brand-contrast.test.ts` allows; white on that yellow is
 * 1.41:1 and is what the gate exists to reject. `StepIllustration` strokes with
 * `currentColor` so the drawing inherits the ink that was checked rather than
 * carrying a second colour of its own.
 */
export default function StepFlow({
  steps,
  ariaLabel,
}: {
  steps: readonly TrustStep[]
  ariaLabel: string
}) {
  return (
    <ol aria-label={ariaLabel} className="mt-6 grid gap-4 md:grid-cols-3">
      {steps.map((step, index) => (
        <li
          key={step.title}
          className="relative flex flex-col rounded-xl border border-heading/10 bg-white p-5"
        >
          {/* A watermark for sighted scanning only; the list already announces
              "item 1 of 3". It sits on the inline-END edge, which under
              dir="rtl" is the left, because the icon disc occupies the start
              corner: placed at `start` it renders UNDER the disc and is
              invisible, which is what the first screenshot showed. */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute top-4 end-5 text-4xl font-bold leading-none text-brand"
          >
            {index + 1}
          </span>

          <span className="relative z-10 flex h-12 w-12 items-center justify-center rounded-full bg-brand text-heading">
            <StepIllustration icon={step.icon} />
          </span>

          <h3 className="mt-4 text-lg font-semibold text-heading">{step.title}</h3>
          <p className="mt-2 text-base leading-relaxed text-heading/80">{step.description}</p>

          {step.note ? (
            // The border sits on the inline-start edge so it reads as a margin
            // rule in Hebrew rather than an underline that ran up the wrong side.
            <p className="mt-3 border-s-2 border-brand ps-3 text-sm leading-relaxed text-heading/70">
              {step.note}
            </p>
          ) : null}
        </li>
      ))}
    </ol>
  )
}
