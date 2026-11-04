'use client'

import { t } from '@/lib/i18n/messages'
import { useState } from 'react'

/**
 * The right of access, next to the right of erasure, because they are the same
 * right read from two directions and a customer looking for one is looking in
 * the same place for the other.
 *
 * IT FETCHES AND SAVES IN THE BROWSER RATHER THAN NAVIGATING. The endpoint is
 * POST - a GET that dumps an entire account is one a link prefetcher or a chat
 * client's preview fetcher would fire unprompted - and a POST cannot be a plain
 * link. A form post would work and would replace the page on any error, showing
 * raw JSON to somebody who pressed a button on their account page. So the
 * response is read here and turned into a download, and a failure stays on the
 * page as a sentence in Hebrew.
 *
 * NO SPINNER STATE BEYOND `pending`. The export is eleven scoped reads of one
 * account; it returns in well under a second on any real account, and a
 * progress UI for it would be furniture.
 */
export default function ExportDataSection() {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function download() {
    setPending(true)
    setError(null)
    try {
      const response = await fetch('/api/account/export', { method: 'POST' })

      if (response.status === 429) {
        // The one status worth its own sentence: the limit is three an hour and
        // "try again" without saying when is what makes a person press twice.
        setError(t('account.export.errorRateLimited'))
        return
      }
      if (!response.ok) {
        setError(t('account.export.errorGeneric'))
        return
      }

      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      // Taken from the response rather than rebuilt here, so the filename in
      // the download and the one the server logged are the same string.
      link.download =
        /filename="([^"]+)"/.exec(response.headers.get('Content-Disposition') ?? '')?.[1] ??
        'kenyonexpress-my-data.json'
      document.body.appendChild(link)
      link.click()
      link.remove()
      // Revoked, or the blob is held for the lifetime of the tab. An account
      // export is the last object worth leaking into a long-lived page.
      URL.revokeObjectURL(url)
    } catch {
      setError(t('account.export.errorNetwork'))
    } finally {
      setPending(false)
    }
  }

  return (
    <section className="account-card">
      <h2 className="account-card__title">{t('account.export.title')}</h2>
      <div className="account-card__body">
        <p>{t('account.export.intro')}</p>
        <p>{t('account.export.cardsNote')}</p>
      </div>
      <button type="button" onClick={download} disabled={pending} className="account-btn">
        {pending ? t('account.export.pending') : t('account.export.button')}
      </button>
      {error && (
        <p className="account-alert account-alert--error" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}
