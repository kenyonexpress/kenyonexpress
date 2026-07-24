import SmartImage from '@/components/ui/SmartImage'
import { LOGO_FOOTER } from '@/lib/assets'
import { Headphones } from 'lucide-react'
import Link from 'next/link'

/**
 * kenyonexpress.co.il footer — structure + values extracted from
 * refs/ke_live_home.html (footer-v2) and refs/electro_style.css:
 *  - newsletter bar bg #fed700 (--bs-ec-primary), padding .55em 0
 *  - newsletter title 1.429em, marketing text 1.071em
 *  - submit button bg #333e48, white text
 *  - copyright bar bg #eaeaea
 */

const PERSONAL_LINKS = [
  { label: 'החשבון שלי', href: '/profile' },
  { label: 'סל הקניות', href: '/cart' },
  { label: 'מועדפים', href: '/wishlist' },
  { label: 'הסטוריה', href: '/recently-viewed' },
  { label: 'הזמנות', href: '/orders' },
]

const SERVICE_LINKS = [
  { label: 'צור קשר', href: '/contact' },
  { label: 'תקנון', href: '/terms-and-conditions' },
]

// lucide-react (this project) ships no brand icons — inline simple-icons glyphs.
// RTL order as listed: Telegram (rightmost) … Facebook (leftmost).
const SOCIALS: { label: string; href: string; path: string }[] = [
  {
    label: 'טלגרם',
    href: '#',
    path: 'M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212-.07-.062-.174-.041-.249-.024-.106.024-1.793 1.139-5.061 3.345-.479.329-.913.489-1.302.481-.428-.009-1.252-.242-1.865-.44-.752-.244-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z',
  },
  {
    label: 'יוטיוב',
    href: 'https://www.youtube.com/channel/UCTksP_5SYgaRrqBPgxBehQQ',
    path: 'M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z',
  },
  {
    label: 'אינסטגרם',
    href: 'https://www.instagram.com/kenyonexpress',
    path: 'M12 0C8.74 0 8.333.015 7.053.072 5.775.132 4.905.333 4.14.63c-.789.306-1.459.717-2.126 1.384S.935 3.35.63 4.14C.333 4.905.131 5.775.072 7.053.012 8.333 0 8.74 0 12s.015 3.667.072 4.947c.06 1.277.261 2.148.558 2.913.306.788.717 1.459 1.384 2.126.667.666 1.336 1.079 2.126 1.384.766.296 1.636.499 2.913.558C8.333 23.988 8.74 24 12 24s3.667-.015 4.947-.072c1.277-.06 2.148-.262 2.913-.558.788-.306 1.459-.718 2.126-1.384.666-.667 1.079-1.335 1.384-2.126.296-.765.499-1.636.558-2.913.06-1.28.072-1.687.072-4.947s-.015-3.667-.072-4.947c-.06-1.277-.262-2.149-.558-2.913-.306-.789-.718-1.459-1.384-2.126C21.319 1.347 20.651.935 19.86.63c-.765-.297-1.636-.499-2.913-.558C15.667.012 15.26 0 12 0zm0 2.16c3.203 0 3.585.016 4.85.071 1.17.055 1.805.249 2.227.415.562.217.96.477 1.382.896.419.42.679.819.896 1.381.164.422.36 1.057.413 2.227.057 1.266.07 1.646.07 4.85s-.015 3.585-.074 4.85c-.061 1.17-.256 1.805-.421 2.227-.224.562-.479.96-.899 1.382-.419.419-.824.679-1.38.896-.42.164-1.065.36-2.235.413-1.274.057-1.649.07-4.859.07-3.211 0-3.586-.015-4.859-.074-1.171-.061-1.816-.256-2.236-.421-.569-.224-.96-.479-1.379-.899-.421-.419-.69-.824-.9-1.38-.165-.42-.359-1.065-.42-2.235-.045-1.26-.061-1.649-.061-4.844 0-3.196.016-3.586.061-4.861.061-1.17.255-1.814.42-2.234.21-.57.479-.96.9-1.381.419-.419.81-.689 1.379-.898.42-.166 1.051-.361 2.221-.421 1.275-.045 1.65-.06 4.859-.06l.045.03zm0 3.678c-3.405 0-6.162 2.76-6.162 6.162 0 3.405 2.76 6.162 6.162 6.162 3.405 0 6.162-2.76 6.162-6.162 0-3.405-2.76-6.162-6.162-6.162zM12 16c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4zm7.846-10.405c0 .795-.646 1.44-1.44 1.44-.795 0-1.44-.646-1.44-1.44 0-.794.646-1.439 1.44-1.439.793-.001 1.44.645 1.44 1.439z',
  },
  {
    label: 'וואטסאפ',
    href: 'https://wa.me/972524635550',
    path: 'M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z',
  },
  {
    label: 'טוויטר',
    href: 'https://twitter.com/KenyonExpress',
    path: 'M23.953 4.57a10 10 0 0 1-2.825.775 4.958 4.958 0 0 0 2.163-2.723c-.951.555-2.005.959-3.127 1.184a4.92 4.92 0 0 0-8.384 4.482C7.69 8.095 4.067 6.13 1.64 3.162a4.822 4.822 0 0 0-.666 2.475c0 1.71.87 3.213 2.188 4.096a4.904 4.904 0 0 1-2.228-.616v.06a4.923 4.923 0 0 0 3.946 4.827 4.996 4.996 0 0 1-2.212.085 4.936 4.936 0 0 0 4.604 3.417 9.867 9.867 0 0 1-6.102 2.105c-.39 0-.779-.023-1.17-.067a13.995 13.995 0 0 0 7.557 2.209c9.053 0 13.998-7.496 13.998-13.985 0-.21 0-.42-.015-.63A9.935 9.935 0 0 0 24 4.59z',
  },
  {
    label: 'פייסבוק',
    href: 'https://www.facebook.com/קניון-Express-114398873446854/',
    path: 'M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z',
  },
]

function SocialGlyph({ path }: { path: string }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
      <path d={path} />
    </svg>
  )
}

export default function SiteFooter() {
  return (
    <footer dir="rtl" className="w-full font-sans">
      {/* 1. Newsletter bar — bg #fed700, padding .55em 0 */}
      <div className="bg-brand-secondary text-heading">
        <div className="mx-auto flex max-w-page flex-col items-center justify-between gap-4 px-4 py-[0.55em] lg:flex-row">
          {/* right side: paper-plane + title + subtitle */}
          <div className="flex items-center gap-4 text-center lg:text-start">
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
            <div>
              <h2 className="m-0 text-[1.429em] font-bold leading-snug">
                קנה וחסוך, הירשם ל Newsletter
              </h2>
              <span className="text-[1.071em]">לקבלת הנחות והטבות $ נוספות . . .</span>
            </div>
          </div>

          {/* left side: white rounded email field + dark הירשם button */}
          <form
            method="post"
            action="/api/newsletter"
            className="flex w-full items-stretch overflow-hidden rounded-none bg-white lg:w-auto lg:min-w-[420px]"
          >
            <input
              type="email"
              name="email"
              required
              placeholder="הזן כתובת Email"
              aria-label="כתובת אימייל לניוזלטר"
              className="h-12 min-w-0 flex-1 border-0 bg-white px-4 text-sm text-gray-900 focus:outline-none"
            />
            <button
              type="submit"
              className="h-12 shrink-0 bg-footer-bg px-7 text-sm font-normal text-white transition-colors hover:bg-black"
            >
              הירשם
            </button>
          </form>
        </div>
      </div>

      {/* 2. Three columns — white bg, RTL (right col first) */}
      <div className="bg-white text-heading">
        <div className="mx-auto grid max-w-page grid-cols-1 gap-8 px-4 py-10 md:grid-cols-[5fr_3.5fr_3.5fr]">
          {/* right column: logo + contact + address */}
          <div>
            <SmartImage
              src={LOGO_FOOTER}
              alt="קניון EXPRESS"
              width={190}
              height={50}
              className="mb-5 h-[42px] w-auto object-contain"
              fallbackClassName="mb-5 h-[42px] w-[160px] rounded-md"
            />

            <p className="m-0 text-sm text-heading/80">יש לך שאלות, הצעות או הערות ?</p>
            <Link
              href="/contact"
              className="mt-1.5 inline-flex items-center gap-2 text-lg font-bold text-heading transition-opacity hover:opacity-70"
            >
              <Headphones
                size={28}
                strokeWidth={1.5}
                className="shrink-0 text-brand-secondary"
                aria-hidden="true"
              />
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

          {/* middle column: שירות לקוחות */}
          <div>
            <h3 className="mb-4 text-base font-bold text-heading">שירות לקוחות</h3>
            <ul className="space-y-2.5">
              {SERVICE_LINKS.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-heading/80 transition-colors hover:text-heading"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* left column: אזור אישי */}
          <div>
            <h3 className="mb-4 text-base font-bold text-heading">אזור אישי</h3>
            <ul className="space-y-2.5">
              {PERSONAL_LINKS.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-heading/80 transition-colors hover:text-heading"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* 3. Social icons row — dark circular */}
        <div className="border-t border-border">
          <div className="mx-auto flex max-w-page items-center justify-center gap-3 px-4 py-6">
            {SOCIALS.map((s) => (
              <a
                key={s.label}
                href={s.href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={s.label}
                className="flex h-11 w-11 min-h-11 min-w-11 items-center justify-center rounded-full bg-footer-bg text-white transition-colors hover:bg-brand-secondary hover:text-heading"
              >
                <SocialGlyph path={s.path} />
              </a>
            ))}
          </div>
        </div>
      </div>

      {/* 4. Bottom gray bar — bg #eaeaea, copyright (right) + payment (left) */}
      <div className="bg-[#eaeaea] text-heading">
        <div className="mx-auto flex max-w-page flex-col items-center justify-between gap-3 px-4 py-3 sm:flex-row">
          <p className="m-0 text-sm">
            כל הזכויות שמורות © <strong className="font-bold">Kenyon Express</strong>
          </p>
          <ul className="flex items-center gap-2.5" aria-label="אמצעי תשלום">
            {['Visa', 'Mastercard', 'Discover', 'American Express'].map((label) => (
              <li
                key={label}
                className="rounded border border-black/15 bg-white px-2 py-1 text-[11px] font-semibold text-heading/70"
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
