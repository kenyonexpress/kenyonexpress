import ErrorPageFrame from '@/components/error-pages/ErrorPageFrame'
import OfflineCachedPages from '@/components/error-pages/OfflineCachedPages'
import { t } from '@/lib/i18n/messages'

export const metadata = {
  title: 'אין חיבור',
  /**
   * NOINDEX, for the same reason `not-found.tsx` carries it: this page's entire
   * content is an error message. Nothing links to it -- it is reached only by
   * the service worker substituting it for a failed navigation -- but "nothing
   * links to it" is not how a URL stays out of an index. It is a real 200 at a
   * guessable address, and an indexed one is a brand search result that reads
   * "אין חיבור לאינטרנט".
   *
   * `follow: true`: the crawler should still take the link home from here.
   */
  robots: { index: false, follow: true },
}

/**
 * The document public/sw.js serves when a navigation fails with no network.
 *
 * It must be fully static and must not fetch anything: it is rendered from the
 * cache, on a device that by definition cannot reach the server, so any data
 * fetch here would simply be the same failure one level deeper. What it CAN
 * read is the worker's own page cache, and G7 lists the browse pages found
 * there (OfflineCachedPages), so the last viewed products stay one tap away.
 *
 * The retry is a plain link and not a button with an onClick handler, so it
 * works before hydration -- which matters more here than anywhere else on the
 * site, because the JavaScript chunk it would need may be the very thing that
 * failed to load.
 */
export default function OfflinePage() {
  return (
    <ErrorPageFrame
      title={t('errorPages.offlineTitle')}
      text={t('errorPages.offlineText')}
      actions={
        <a href="/" className="ke-error-page__btn">
          {t('errorPages.retry')}
        </a>
      }
    >
      <OfflineCachedPages />
    </ErrorPageFrame>
  )
}
