import Link from 'next/link'

/**
 * NOINDEX, AND DELIBERATELY NOT A robots.txt DISALLOW.
 *
 * This document's entire content is "there is no connection". Indexed, it is a
 * thin page competing for the brand's own name, and it was indexable: the file
 * set a title and nothing else, while `/cart` and `/checkout` are both excluded
 * by this project's own convention and `/redeem/[token]` carries the same
 * directive.
 *
 * `follow: true` rather than checkout's `follow: false`: the only link on the
 * page goes to the homepage, so a crawler that lands here should be allowed to
 * leave through it.
 *
 * The disallow is omitted ON PURPOSE. A path blocked in robots.txt is never
 * fetched, so its `noindex` is never read - and a blocked URL that something
 * links to can still be listed, now permanently, because the one instruction
 * that would remove it is the one the crawler is forbidden to see. Blocking and
 * de-indexing are opposites here, and de-indexing is what this page wants.
 *
 * The service worker is unaffected either way: it fetches same-origin from the
 * cache and robots.txt has no bearing on it.
 */
export const metadata = {
  title: 'אין חיבור',
  robots: { index: false, follow: true },
}

/**
 * The document public/sw.js serves when a navigation fails with no network.
 *
 * It must be fully static and must not read anything: it is rendered from the
 * cache, on a device that by definition cannot reach the server, so any data
 * fetch here would simply be the same failure one level deeper.
 *
 * The retry is a plain link and not a button with an onClick handler, so it
 * works before hydration -- which matters more here than anywhere else on the
 * site, because the JavaScript chunk it would need may be the very thing that
 * failed to load.
 */
export default function OfflinePage() {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-6 text-center">
      <div
        aria-hidden="true"
        className="flex size-16 items-center justify-center rounded-2xl bg-brand-primary font-extrabold text-2xl text-heading"
      >
        ⚡
      </div>

      <h1 className="mt-5 font-bold text-2xl text-heading">אין חיבור לאינטרנט</h1>

      <p className="mt-2 text-gray-500 text-sm leading-relaxed">
        לא הצלחנו לטעון את העמוד. בדקו את החיבור ונסו שוב. עמודים שכבר ביקרתם בהם עשויים להיטען גם
        ללא חיבור.
      </p>

      <Link
        href="/"
        className="mt-6 inline-flex min-h-11 items-center rounded-xl bg-brand-primary px-6 font-bold text-heading text-sm transition-opacity hover:opacity-90"
      >
        נסו שוב
      </Link>
    </div>
  )
}
