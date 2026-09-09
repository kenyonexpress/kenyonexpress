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
 * WHY THE MARK AND NOT A BARE GREY BOX. A bare grey box reads as a bug and gets
 * ignored. This reads as a slot: the site's own mark, centred on a neutral grey
 * ground (`--color-surface-hover`, #f5f5f5), at the aspect ratio the real
 * photograph will have.
 *
 * The ground was `bg-brand-accent` until 2026-09-06. That token is #eaf4f6, a
 * pale blue tint, and on a page whose brand colour is yellow it read as a
 * deliberate coloured panel rather than as an empty slot. Neutral is the point:
 * nothing about a placeholder should look chosen. `data-awaiting-photography` makes every one of them greppable and
 * countable, and `scripts/template-asset-scan.mjs` fails the build if one of the
 * ten filenames comes back.
 */
export default function BrandPlaceholder({
  className = '',
  markWidth = 160,
  slot,
}: {
  /** Positioning and sizing from the caller; this component owns only its ground. */
  className?: string
  /** The mark's rendered width in px. The slot's own size comes from `className`. */
  markWidth?: number
  /**
   * WHAT THIS SLOT IS FOR, IN HEBREW. Becomes the image's accessible name.
   *
   * It used to be `aria-hidden` with an empty alt, on the reasoning that a
   * placeholder is decoration. That is right for a spacer and wrong for this:
   * a sighted visitor can see that a photograph is missing and a screen-reader
   * user could not, so the slot was silently absent for them rather than
   * visibly empty. Naming it says the same thing to both.
   *
   * Omit it only where the surrounding link already names the destination, in
   * which case the mark really is decoration and repeating it is noise.
   */
  slot?: string
}) {
  const decorative = !slot
  return (
    <div
      data-awaiting-photography=""
      {...(decorative ? { 'aria-hidden': true as const } : {})}
      className={`flex items-center justify-center overflow-hidden bg-surface-hover ${className}`}
    >
      <Image
        src="/images/logo.webp"
        alt={slot ? `${slot} — התמונה טרם צולמה` : ''}
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
