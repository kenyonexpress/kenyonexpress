import {
  EcSupport,
  FaChevronDown,
  FaFacebook,
  FaInstagram,
  FaWhatsapp,
  FaYoutube,
} from '@/components/icons/electro-icons'
import SmartImage from '@/components/ui/SmartImage'
import { LOGO_FOOTER } from '@/lib/assets'
import { storeWhatsAppLink } from '@/lib/whatsapp'
import Link from 'next/link'

/**
 * kenyonexpress.co.il footer — structure + values extracted from
 * refs/ke_live_home.html (footer-v2) and refs/electro_style.css. Each colour
 * the extraction found is now a token in src/styles/tokens.ts; the token name
 * is given so the mapping back to the reference stays traceable:
 *  - newsletter bar bg = brand-primary (live --bs-ec-primary), padding .55em 0
 *  - newsletter title 1.429em, marketing text 1.071em
 *  - submit button bg = heading, white text
 *  - copyright bar bg = bottom-bar
 */

/**
 * `built: false` means the href has NO page in this app and returns 404.
 *
 * Wishlist and recently-viewed were WP leftovers. They are not features here
 * (import maps both to 410), so the labels were removed in [28] rather than
 * kept as visible 404s. Contact and terms stay listed with prefetch off until
 * real copy exists; inventing a תקנון is not a code task. Tracked in GO-LIVE.md.
 *
 * When a `built: false` page ships, delete the flag and prefetch comes back.
 */
const PERSONAL_LINKS: { label: string; href: string; built?: false }[] = [
  { label: 'החשבון שלי', href: '/account' },
  { label: 'סל הקניות', href: '/cart' },
  { label: 'הזמנות', href: '/account/orders' },
]

const SERVICE_LINKS: { label: string; href: string; built?: false }[] = [
  { label: 'אודות', href: '/about' },
  { label: 'צור קשר', href: '/contact' },
  { label: 'שאלות נפוצות', href: '/faq' },
  { label: 'הבלוג', href: '/blog' },
  // Above the legal block on purpose: this is the one link in the footer aimed
  // at a business rather than a shopper, and burying it under four legal pages
  // is where it stops being found.
  { label: 'הצטרפו כעסקים', href: '/suppliers' },
  // The flag is gone from all five because the pages exist now ([58]). The two
  // long ones are the site's OWN published Hebrew text, migrated out of the
  // WordPress export rather than rewritten.
  //
  // The cookie policy is linked here rather than left as a section inside the
  // privacy policy because a consent banner has to point somewhere specific,
  // and "see the privacy policy" is not that.
  { label: 'תקנון', href: '/terms-and-conditions' },
  { label: 'מדיניות פרטיות', href: '/privacy-policy' },
  { label: 'מדיניות עוגיות', href: '/cookie-policy' },
  { label: 'ביטולים והחזרות', href: '/refund_returns' },
  { label: 'הצהרת נגישות', href: '/accessibility' },
]

// Brand glyphs are Font Awesome as shipped by Electro v7 (fa-youtube, fa-instagram,
// fa-whatsapp, fa-facebook). Telegram and Twitter are not in Electro's footer and
// do not render. RTL order as listed: YouTube (rightmost) ... Facebook (leftmost).
const SOCIALS: { label: string; href: string; Icon: typeof FaFacebook }[] = [
  {
    label: 'יוטיוב',
    href: 'https://www.youtube.com/channel/UCTksP_5SYgaRrqBPgxBehQQ',
    Icon: FaYoutube,
  },
  {
    label: 'אינסטגרם',
    href: 'https://www.instagram.com/kenyonexpress',
    Icon: FaInstagram,
  },
  {
    label: 'וואטסאפ',
    // One source for the store's number ([68]). The literal that used to sit
    // here was the third copy of it, and the only one of the three that did not
    // read the env override.
    href: storeWhatsAppLink() ?? '#',
    Icon: FaWhatsapp,
  },
  {
    label: 'פייסבוק',
    href: 'https://www.facebook.com/קניון-Express-114398873446854/',
    Icon: FaFacebook,
  },
]

export default function SiteFooter() {
  return (
    <footer dir="rtl" className="w-full font-sans">
      {/* 1. Newsletter bar. Measured on the live single-product template
          (scripts/_footer-probe.mjs): the bar is 80px, its row 65px, and the
          title and marketing line sit side by side on ONE line, not stacked. */}
      {/*
        THE NEWSLETTER BAR IS DESKTOP-ONLY, which is live's rule and not a
        preference. Live ships two different footers -- `.desktop-footer
        .d-none.d-lg-block` and `.handheld-footer.d-lg-none` -- and the handheld
        one contains no newsletter bar and no address block.

        BOTH NUMBERS THIS COMMENT USED TO CARRY WERE STALE, and they are
        corrected here rather than quietly replaced. It said live's mobile
        footer is 355px and ours was 1155px. Re-measured against the live site
        at 380 on 2026-09-03, after the earlier fix had already landed:

          live   612px   widget menu 365 + social 65 + dark bar 137
          ours   274px

        So ours was 338px SHORT of live, not 800px over. The gap was the whole
        `.handheld-footer-bar` -- a 137px dark strip carrying the logo and the
        contact line, which this footer never had. D20 also flipped the link
        columns to `open`, from a measurement of a page the gate never scores;
        D25 flipped them back, because refs/ke_live_computed.json holds the
        widget menu COLLAPSED at 108px on cart and checkout -- the pages the
        gate does score -- at both 380 and 768. See globals.css.

        THE EXTRA LINKS ON THE MENUS ARE DELIBERATE AND NOT GOING AWAY. Live's
        handheld footer lists seven links; ours lists twelve. The five extra are
        אודות, שאלות נפוצות, הבלוג, מדיניות פרטיות, ביטולים והחזרות and
        הצהרת נגישות -- and dropping the last three from the phone to win pixels
        would take the privacy policy, the refunds policy and the accessibility
        statement off the viewport most Israeli shoppers actually use. Live also
        lists הסטוריה (recently-viewed), which this app has no route for; it is
        omitted rather than shipped as a visible 404, which is the same rule the
        `built: false` note above records.

        Note the footer sits BELOW the 2600px compare window, so none of this
        moves the home-page gate. It is a 1:1 gap, not a scoring one.
      */}
      <div className="hidden bg-brand-secondary text-heading lg:block">
        <div className="mx-auto flex min-h-newsletter-bar max-w-store-footer flex-col items-center justify-between gap-4 px-gutter lg:flex-row">
          {/* right side: paper-plane + title + subtitle */}
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-1 text-center lg:justify-start lg:text-start">
            <svg
              viewBox="0 0 24 24"
              width="34"
              height="34"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="shrink-0"
              aria-hidden="true"
            >
              <path d="M22 2 11 13" />
              <path d="M22 2 15 22l-4-9-9-4 20-7z" />
            </svg>
            {/* live: 20.006px / 48.5946px / 500, with the marketing line beside
                it at 14.994px / 25.6997px */}
            <h2 className="m-0 text-newsletter-head font-medium leading-newsletter-head">
              קנה וחסוך, הירשם ל Newsletter
            </h2>
            <span className="text-newsletter-note leading-newsletter-note">
              לקבלת הנחות והטבות $ נוספות . . .
            </span>
          </div>

          {/* left side: white rounded email field + dark הירשם button */}
          {/* live: one 470x41 pill, rounded at both ends, input on the
              inline-start (right) and the submit button on the left */}
          <form
            method="post"
            action="/api/newsletter"
            className="flex h-newsletter-field w-full items-stretch overflow-hidden rounded-full bg-white lg:w-newsletter-min"
          >
            <input
              type="email"
              name="email"
              required
              // The site has TWO newsletter fields. `NewsletterSignup` is LTR
              // and explains why in a comment; this one, the footer's own copy
              // of the same form, was not - the same address flush left on one
              // and flush right on the other.
              dir="ltr"
              placeholder="הזן כתובת Email"
              aria-label="כתובת אימייל לניוזלטר"
              className="min-w-0 flex-1 border-0 bg-white px-5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-inset focus:ring-black/40"
            />
            <button
              type="submit"
              className="shrink-0 bg-footer-bg px-7 text-sm font-normal text-white transition-colors hover:bg-black"
            >
              הירשם
            </button>
          </form>
        </div>
      </div>

      {/* 2. Three columns — white bg, RTL (right col first) */}
      <div className="bg-white text-heading">
        {/* Measured on live: three columns of 492 / 335 / 335 with no gutter of
            their own inside the 1170 content width, and 60px of clearance under
            the newsletter bar before the headings. */}
        <div className="mx-auto grid max-w-store-footer grid-cols-1 gap-y-0 px-gutter pt-0 pb-0 lg:grid-cols-[492fr_335fr_335fr] lg:gap-x-0 lg:gap-y-8 lg:pt-footer-columns-top lg:pb-10">
          {/* right column: logo + contact + address. Desktop-only: live's
              handheld footer carries none of it (see the note above). */}
          <div className="hidden lg:block">
            <SmartImage
              src={LOGO_FOOTER}
              alt="קניון EXPRESS"
              width={190}
              height={50}
              className="mb-5 h-footer-logo-h w-auto object-contain"
              fallbackClassName="mb-5 h-footer-logo-h w-footer-logo-w rounded-md"
            />

            <p className="m-0 text-sm text-heading/80">יש לך שאלות, הצעות או הערות ?</p>
            <Link
              href="/contact"
              className="mt-1.5 inline-flex items-center gap-2 text-lg font-bold text-heading transition-opacity hover:opacity-70"
            >
              <EcSupport size={28} className="shrink-0 text-brand-secondary" aria-hidden="true" />
              צור קשר
            </Link>

            <div className="mt-5">
              <strong className="block font-bold text-heading">כתובתנו :</strong>
              <address className="mt-1 text-sm not-italic leading-relaxed text-heading/80">
                פארק העסקים, התעשייה וההיי-טק.
                <br />
                Air Port City
              </address>
            </div>
          </div>

          {/* middle column: שירות לקוחות.
              Below lg this is one of live's two 49px accordion rows -- CLOSED.
              D20 added `open` from a measurement of a page the gate never
              scores; refs/ke_live_computed.json shows the widget menu collapsed
              at 108px on cart and checkout at 380 and 768, which are the pages
              that are scored. See the note in globals.css. `<details>` and not
              a client component on purpose: the footer is on every page and a
              disclosure widget is not worth a hydration boundary. Open is
              forced from lg up by CSS, so the desktop layout is unchanged. */}
          <details className="footer-disclosure group border-b border-border lg:border-0">
            <summary className="flex h-drawer-row cursor-pointer items-center justify-between text-base font-bold text-heading lg:mb-4 lg:h-auto lg:cursor-default lg:justify-start">
              שירות לקוחות
              <FaChevronDown
                size={18}
                aria-hidden="true"
                className="shrink-0 transition-transform group-open:rotate-180 lg:hidden"
              />
            </summary>
            <ul className="space-y-2.5 pb-4 lg:pb-0">
              {SERVICE_LINKS.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    prefetch={link.built === false ? false : undefined}
                    className="text-sm text-heading/80 transition-colors hover:text-heading"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </details>

          {/* left column: אזור אישי — live's second accordion row below lg,
              closed like the first. */}
          <details className="footer-disclosure group border-b border-border lg:border-0">
            <summary className="flex h-drawer-row cursor-pointer items-center justify-between text-base font-bold text-heading lg:mb-4 lg:h-auto lg:cursor-default lg:justify-start">
              אזור אישי
              <FaChevronDown
                size={18}
                aria-hidden="true"
                className="shrink-0 transition-transform group-open:rotate-180 lg:hidden"
              />
            </summary>
            <ul className="space-y-2.5 pb-4 lg:pb-0">
              {PERSONAL_LINKS.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    prefetch={link.built === false ? false : undefined}
                    className="text-sm text-heading/80 transition-colors hover:text-heading"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </details>
        </div>

        {/* 3. Social icons row — dark circular */}
        <div className="border-t border-border">
          <div className="mx-auto flex max-w-store-footer items-center justify-center gap-3 px-4 py-4 lg:py-6">
            {SOCIALS.map((s) => (
              <a
                key={s.label}
                href={s.href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={s.label}
                className="hit-44 flex size-touch-min items-center justify-center rounded-full bg-footer-bg text-white transition-colors hover:bg-brand-secondary hover:text-heading lg:h-10 lg:w-10"
              >
                <s.Icon size={18} />
              </a>
            ))}
          </div>
        </div>
      </div>

      {/*
        4a. THE HANDHELD DARK BAR — live's `.handheld-footer-bar`, below lg only.
        Measured at 380: 137px on the dark footer ink (--color-footer-bg), carrying the
        190x50 logo and the contact line. This footer had no equivalent at all,
        which was most of the 338px it was short.

        It replaces the light copyright bar below lg rather than stacking on top
        of it, because live's handheld footer ends here and two bottom bars is
        neither live's layout nor a sensible one. The copyright text rides along
        so a phone does not simply lose it.
      */}
      <div className="bg-footer-bg text-white lg:hidden">
        <div className="mx-auto flex max-w-store-footer flex-col items-center gap-0.5 px-gutter py-4 text-center">
          <SmartImage
            src={LOGO_FOOTER}
            alt="קניון EXPRESS"
            width={190}
            height={50}
            className="h-footer-logo-h w-auto object-contain"
            fallbackClassName="h-footer-logo-h w-footer-logo-w rounded-md"
          />
          <p className="m-0 text-sm text-white/80">יש לך שאלות, הצעות או הערות ?</p>
          <Link
            href="/contact"
            className="inline-flex min-h-touch-min items-center gap-2 text-lg font-bold text-white transition-opacity hover:opacity-70"
          >
            <EcSupport size={28} className="shrink-0 text-brand-secondary" aria-hidden="true" />
            צור קשר
          </Link>
          <p className="m-0 text-micro text-white/70">
            כל הזכויות שמורות © <strong className="font-bold">Kenyon Express</strong>
          </p>
        </div>
      </div>

      {/* 4b. Bottom gray bar — bg bottom-bar, copyright (right) + payment (left).
          Desktop only: 4a is live's handheld ending. */}
      <div className="hidden bg-bottom-bar text-heading lg:block">
        <div className="mx-auto flex max-w-store-footer flex-col items-center justify-between gap-3 px-4 py-3 sm:flex-row">
          <p className="m-0 text-sm">
            כל הזכויות שמורות © <strong className="font-bold">Kenyon Express</strong>
          </p>
          <ul className="flex items-center gap-2.5" aria-label="אמצעי תשלום">
            {['Visa', 'Mastercard', 'Discover', 'American Express'].map((label) => (
              <li
                key={label}
                className="rounded border border-black/15 bg-white px-2 py-1 text-micro font-semibold text-heading/80"
              >
                {label}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </footer>
  )
}
