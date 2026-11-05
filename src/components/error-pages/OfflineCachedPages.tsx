'use client'

import { t } from '@/lib/i18n/messages'
import { type CachedPageLink, cachedPageLinks } from '@/lib/offline/cached-pages'
import { useEffect, useState } from 'react'

/**
 * The browse pages the service worker already holds, listed on the offline
 * page so a lost connection still leaves the last viewed products one tap
 * away. Reads the Cache API only (`<version>-pages`, see public/sw.js); no
 * network, no storage writes. Renders nothing until the list is known, so the
 * static document the worker serves is unchanged when caches are empty.
 */
export default function OfflineCachedPages() {
  const [links, setLinks] = useState<CachedPageLink[] | null>(null)

  useEffect(() => {
    let cancelled = false
    async function read() {
      if (typeof caches === 'undefined') return setLinks([])
      try {
        const names = (await caches.keys()).filter((n) => n.endsWith('-pages'))
        const urls: string[] = []
        for (const name of names) {
          const cache = await caches.open(name)
          for (const req of await cache.keys()) urls.push(req.url)
        }
        if (!cancelled) setLinks(cachedPageLinks(urls, window.location.origin))
      } catch {
        if (!cancelled) setLinks([])
      }
    }
    void read()
    return () => {
      cancelled = true
    }
  }, [])

  if (links === null) return null
  return (
    <section className="ke-error-page__cached" aria-labelledby="offline-cached-title">
      <h2 id="offline-cached-title">{t('errorPages.cachedTitle')}</h2>
      {links.length === 0 ? (
        <p className="ke-error-page__text">{t('errorPages.cachedEmpty')}</p>
      ) : (
        <ul>
          {links.map((link) => (
            <li key={link.href}>
              <a href={link.href}>
                {link.kind === 'catalogue' ? t('errorPages.cachedCatalogue') : link.label}
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
