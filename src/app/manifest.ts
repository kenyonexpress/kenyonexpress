import { SITE } from '@/styles/tokens'
import type { MetadataRoute } from 'next'

/**
 * Web app manifest, as a metadata route rather than a static public/ file so it
 * is typed and cannot drift from the icons that scripts/generate-pwa-icons.mjs
 * actually produces.
 *
 * `start_url` carries no tracking parameter on purpose. The usual
 * `?utm_source=pwa` makes every launch a distinct URL, which defeats the
 * offline document cache in public/sw.js for the one entry point that most
 * needs to be cached.
 *
 * `display: standalone` and not `fullscreen`: this is a shop, and hiding the
 * status bar on a checkout screen reads as a phishing frame rather than as an
 * app.
 *
 * Two icon purposes, because they are different jobs. `any` is drawn as-is;
 * `maskable` may be clipped to a circle with only the middle 80% kept, so it
 * has its own padded asset. Declaring one tight icon as both is what produces
 * a cropped logo on Android launchers.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'KenyonExpress',
    short_name: 'Kenyon',
    description: 'קופונים ומוצרים מעסקים בישראל',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    // From tokens.ts, not literals: `background_color` is what the OS paints on
    // the splash screen before the first frame, so a value that has drifted
    // from the stylesheet shows up as a flash of the wrong colour.
    theme_color: SITE.brand.primary,
    background_color: SITE.surface.page,
    lang: 'he',
    dir: 'rtl',
    categories: ['shopping'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      {
        src: '/icons/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  }
}
