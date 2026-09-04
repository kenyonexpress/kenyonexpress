import Image from 'next/image'

/**
 * THE SLOT THAT IS WAITING FOR A PHOTOGRAPH, SAID OUT LOUD.
 *
 * WHAT IT REPLACED. Ten product shots inherited from the Electro template were
 * shipping on the homepage: an iPhone 11 Pro with AirPods, an iPad Pro, a pair
 * of Samsung Gear smartwatches, a red phone, a MacBook, an Apple silhouette, a
 * Tesla mark, and a mockup of Electro's own demo store on two phones -- complete
 * with the word "electro" in its masthead. On a site that sells vouchers for
 * restaurants, spas, hotels, courses and tradespeople.
 *
 * WHY NOT A PHOTO FROM LIVE. Live is this project's source for content, and for
 * these particular slots live has nothing else: it runs the same theme and
 * serves the same ten files out of its own wp-content/uploads. So the rule
 * "every image comes from live" and the rule "no Electro photography survives"
 * point at the same ten files and disagree. The tie goes to the second: shipping
 * a competitor's product photography is a decision, and shipping it because the
 * old site did is not a reason.
 *
 * WHY NOT A GREY BOX. A grey box reads as a bug and gets ignored. This reads as
 * a slot: the mark, on brand-accent, at the aspect ratio the real photograph
 * will have. `data-awaiting-photography` makes every one of them greppable and
 * countable, and `scripts/template-asset-scan.mjs` fails the build if one of the
 * ten filenames comes back.
 */
export default function BrandPlaceholder({
  className = '',
  markWidth = 160,
}: {
  /** Positioning and sizing from the caller; this component owns only its ground. */
  className?: string
  /** The mark's rendered width in px. The slot's own size comes from `className`. */
  markWidth?: number
}) {
  return (
    <div
      data-awaiting-photography=""
      aria-hidden="true"
      className={`flex items-center justify-center overflow-hidden bg-brand-accent ${className}`}
    >
      <Image
        src="/images/logo.webp"
        alt=""
        width={markWidth}
        height={Math.round(markWidth * 0.263)}
        // The site's own mark, and the only image here: 300x79 on live, so the
        // ratio is fixed at 0.263 rather than guessed per call site.
        className="h-auto w-auto max-w-[60%] opacity-40 mix-blend-multiply"
        // Never the LCP candidate: a placeholder must not out-prioritise the
        // real content beside it.
        loading="lazy"
      />
    </div>
  )
}
