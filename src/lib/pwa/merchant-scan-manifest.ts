import { SITE } from '@/styles/tokens'
import type { MetadataRoute } from 'next'

/**
 * The manifest for the till, served at /merchant/manifest.webmanifest.
 *
 * Its own manifest and not the shop's, because a manifest has ONE start URL:
 * a cashier who installs the scanner wants the home-screen icon to open the
 * viewfinder, not the storefront. `scope` is /merchant/ so the installed app
 * owns exactly its own pages and a tap on a link to the portal opens in the
 * browser, with its address bar, where a business page belongs.
 *
 * `display: standalone` and not `fullscreen`, for the same reason as the shop:
 * the status bar shows whether the phone HAS a connection, which is the one
 * thing a cashier with a pending queue wants to see.
 *
 * Same icons as the shop, so the sweep that verifies they load covers both.
 * A dedicated glyph is a product question, and a missing 192px PNG is what
 * stops the install prompt from ever appearing.
 */
export function merchantScanManifest(): MetadataRoute.Manifest {
  return {
    name: 'סורק שוברים קניון אקספרס',
    short_name: 'סורק שוברים',
    description: 'סריקת שוברי קופון ומימושם בקופה, גם בלי חיבור',
    id: '/merchant/scan',
    start_url: '/merchant/scan',
    scope: '/merchant/',
    display: 'standalone',
    orientation: 'portrait',
    theme_color: SITE.brand.primary,
    background_color: SITE.surface.page,
    lang: 'he',
    dir: 'rtl',
    categories: ['business', 'utilities'],
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
