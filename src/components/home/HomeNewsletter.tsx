import NewsletterSignup from '@/components/growth/NewsletterSignup'

/**
 * The newsletter signup for the phone and the tablet.
 *
 * BELOW `lg` ONLY, on purpose. Live ships its newsletter bar in the desktop
 * footer and no newsletter at all in the handheld footer, and `SiteFooter`
 * follows that rule - so a 380px visitor had no way to subscribe. This block
 * is that way in; from `lg` up the footer bar is the one form on the page,
 * and this one is not mounted twice over.
 *
 * It sits under the deals grid, below the 2600px the parity gate scores.
 */
export default function HomeNewsletter() {
  return (
    <section
      aria-label="הרשמה לדיוור"
      dir="rtl"
      className="mx-auto w-full max-w-deals px-deals-pad pb-10 font-sans md:px-deals-pad-md lg:hidden"
    >
      <div className="rounded-lg border border-border bg-white p-4">
        <NewsletterSignup source="home" />
      </div>
    </section>
  )
}
