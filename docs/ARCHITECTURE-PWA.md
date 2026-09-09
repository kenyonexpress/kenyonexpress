# ARCHITECTURE-PWA.md


> <!-- v1-final-banner:2026-09-01 -->
> ⚠️ **This document names tables that do not exist in production.**
>
> | Named here | In production |
> |---|---|
> | `consent_events` | nothing; never built |
> | `notification_events` | `notification_outbox` |
>
> The design below may still be sound; the schema it assumes was not built, or
> was built under another name. Verify against `docs/DATA-MODEL.md` before
> writing a query, and see `docs/SCHEMA-REALITY-CHECK.md` for the full mapping.

KenyonExpress Progressive Web App architecture (binding).

Status: BINDING for `arch/pwa` (2026-07-30)
Worktree: `/Users/ofir/kenyonexpress-web/ke-arch-pwa` only. **Documentation only.**
Stack: Next.js 15 App Router, **Serwist** (service worker), Web App Manifest, Hebrew RTL, brand yellow `#fed700`, product images on R2 / `next/image` CDN.
Companions: `docs/ARCHITECTURE-MOBILE-SUPERAPP.md` (§11.5 PWA bridge), `docs/ARCHITECTURE-NOTIFICATIONS.md` (email today; push later), `docs/ARCHITECTURE-PERFORMANCE.md`, supplier scanner notes in `ARCHITECTURE-SUPPLIER-PORTAL.md`.

Confirm Serwist + App Router wiring against current package docs and `node_modules/next/dist/docs/` before shipping. This repo may track a modified Next build.

---

## 0. Role of the PWA

| Surface | PWA role | Long-term |
|---|---|---|
| Customer storefront (`kenyonexpress.co.il`) | **Bridge** until React Native superapp | Installable shell, offline fallback, optional Web Push, coupon wallet cache |
| Supplier scanner | **Stays PWA** forever | Camera + offline redeem queue; not replaced by customer RN app |
| Admin | Not a PWA | `display: browser` only; no SW registration on `/admin/**` |

Binding from SUPERAPP: TWA / Capacitor wrappers are **rejected**. Store distribution is RN+Expo later. The web PWA is the interim installable experience and the permanent scanner host.

Non-negotiables:

1. Never cache HTML for `/cart`, `/checkout/**`, `/account/**`, `/redeem/**`, `/admin/**`, `/supplier/**` as personalized documents.
2. Money and redemption authority stay on the server. Offline UI is advisory cache only.
3. Push marketing requires consent (30א / existing `consent_events`). No silent re-subscribe from WP OneSignal without a new opt-in.
4. Brand theme color is **`#fed700`** (live-verified; same as `SITE.brand.primary`).

---

## 1. Decision: Serwist, not `next-pwa`

| Option | Verdict |
|---|---|
| **`@serwist/next` (Serwist)** | **Choose.** Maintained Workbox successor, first-class App Router + Turbopack path, TypeScript SW source, runtime caching recipes. Already named in SUPERAPP §11.5 and supplier portal docs. |
| `next-pwa` | **Reject for new work.** Stale for App Router; opaque webpack plugin; harder to keep SW typed alongside RSC. |

```bash
pnpm add @serwist/next serwist
pnpm add -D @serwist/turbopack   # if using Turbopack build path; confirm version matrix
```

If Turbopack support for the chosen Serwist major is incomplete at implement time, build SW with webpack for production only; do not fall back to `next-pwa`.

---

## 2. Web App Manifest

### 2.1 Brand tokens in the manifest

| Field | Value |
|---|---|
| `name` | `קניון אקספרס` |
| `short_name` | `קניון` |
| `lang` / `dir` | `he` / `rtl` |
| `theme_color` | `#fed700` |
| `background_color` | `#fed700` (splash matches brand; content area still white via CSS) |
| `display` | `standalone` |
| `start_url` | `/?utm_source=pwa&utm_medium=a2hs` |
| `scope` | `/` |
| `id` | `https://kenyonexpress.co.il/` |

Icons: maskable + any. Source logo:
`public/logo.png`
and
`public/images/logo.webp`
. Export dedicated PWA sizes (do not serve the wide header logo as the only icon).

Required icon set:

| File | Size | Purpose |
|---|---|---|
| `public/icons/icon-192.png` | 192×192 | Android / install |
| `public/icons/icon-512.png` | 512×512 | Splash / store-like |
| `public/icons/maskable-512.png` | 512×512 | Safe-zone maskable (logo inset ~20%) |
| `public/icons/apple-touch-icon.png` | 180×180 | iOS home screen |

Icon art: yellow `#fed700` field, dark mark `#1a1a1a` / `#333e48`, no tiny text.

### 2.2 `app/manifest.ts` (full)

```ts
// src/app/manifest.ts
import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: 'https://kenyonexpress.co.il/',
    name: 'קניון אקספרס',
    short_name: 'קניון',
    description: 'קופונים, מבצעים ומוצרים במחיר הכי טוב',
    lang: 'he',
    dir: 'rtl',
    start_url: '/?utm_source=pwa&utm_medium=a2hs',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait-primary',
    background_color: '#fed700',
    theme_color: '#fed700',
    categories: ['shopping', 'lifestyle'],
    icons: [
      {
        src: '/icons/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
    shortcuts: [
      {
        name: 'העגלה שלי',
        short_name: 'עגלה',
        url: '/cart?utm_source=pwa&utm_medium=shortcut',
        icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }],
      },
      {
        name: 'הקופונים שלי',
        short_name: 'קופונים',
        url: '/account/coupons?utm_source=pwa&utm_medium=shortcut',
        icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }],
      },
    ],
  }
}
```

### 2.3 Metadata / Apple tags in root layout

```tsx
// src/app/layout.tsx (metadata excerpt)
import type { Metadata, Viewport } from 'next'

export const viewport: Viewport = {
  themeColor: '#fed700',
  colorScheme: 'light',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export const metadata: Metadata = {
  applicationName: 'קניון אקספרס',
  appleWebApp: {
    capable: true,
    title: 'קניון אקספרס',
    statusBarStyle: 'default',
  },
  formatDetection: { telephone: false },
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180' }],
  },
  // ...existing title/description/metadataBase
}
```

Link the apple touch icon explicitly if needed:

```html
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
```

Next metadata `icons.apple` covers this when configured as above.

### 2.4 Supplier scanner manifest (separate)

Scanner uses a **scoped** manifest so install name differs:

```ts
// src/app/(supplier)/supplier/manifest.ts  OR route segment config
// Prefer a dedicated start_url under /supplier/scan
{
  name: 'קניון אקספרס לעסקים',
  short_name: 'סריקה',
  start_url: '/supplier/scan?utm_source=pwa_supplier',
  scope: '/supplier/',
  display: 'standalone',
  theme_color: '#fed700',
  background_color: '#1a1a1a',
  // dedicated scanner icons (camera glyph on yellow)
}
```

Do not register the customer SW on supplier routes if cache rules differ; either one SW with path-aware runtime caching, or a second Serwist entry for supplier (prefer **one SW**, path conditions).

---

## 3. Service worker (Serwist)

### 3.1 Next config wiring

```ts
// next.config.ts (excerpt)
import type { NextConfig } from 'next'
import withSerwistInit from '@serwist/next'

const withSerwist = withSerwistInit({
  swSrc: 'src/sw.ts',
  swDest: 'public/sw.js',
  disable: process.env.NODE_ENV === 'development',
  // reloadOnOnline: true is fine for catalog; private routes stay network-only
})

const nextConfig: NextConfig = {
  // ...existing images, headers, turbopack.root, etc.
}

export default withSerwist(/* withNextIntl(nextConfig) */)
```

### 3.2 SW source (full)

```ts
// src/sw.ts
import { defaultCache } from '@serwist/next/worker'
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist'
import { CacheFirst, ExpirationPlugin, NetworkFirst, NetworkOnly, Serwist } from 'serwist'

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined
  }
}

declare const self: ServiceWorkerGlobalScope & typeof globalThis & {
  __SW_MANIFEST: (PrecacheEntry | string)[] | undefined
}

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    // Private / money: never cache
    {
      matcher: ({ url, request }) => {
        if (request.mode !== 'navigate') return false
        const p = url.pathname
        return (
          p.startsWith('/cart') ||
          p.startsWith('/checkout') ||
          p.startsWith('/account') ||
          p.startsWith('/redeem') ||
          p.startsWith('/admin') ||
          p.startsWith('/supplier') ||
          p.startsWith('/api/')
        )
      },
      handler: new NetworkOnly(),
    },

    // Public navigations: network first, short fallback to cache, else offline page
    {
      matcher: ({ request }) => request.mode === 'navigate',
      handler: new NetworkFirst({
        cacheName: 'pages-he',
        networkTimeoutSeconds: 3,
        plugins: [
          new ExpirationPlugin({ maxEntries: 32, maxAgeSeconds: 24 * 60 * 60 }),
        ],
      }),
    },

    // Next static assets: cache first (hashed)
    {
      matcher: ({ url }) => url.pathname.startsWith('/_next/static/'),
      handler: new CacheFirst({
        cacheName: 'next-static',
        plugins: [
          new ExpirationPlugin({ maxEntries: 128, maxAgeSeconds: 30 * 24 * 60 * 60 }),
        ],
      }),
    },

    // next/image optimizer + R2 product CDN (see §6)
    {
      matcher: ({ url, request }) => {
        if (request.destination !== 'image') return false
        return (
          url.pathname.startsWith('/_next/image') ||
          url.hostname.endsWith('kenyonexpress.co.il') ||
          url.hostname.endsWith('r2.dev') ||
          url.hostname.endsWith('supabase.co')
        )
      },
      handler: new CacheFirst({
        cacheName: 'product-images',
        plugins: [
          new ExpirationPlugin({
            maxEntries: 200,
            maxAgeSeconds: 30 * 24 * 60 * 60, // 30d; URLs are immutable per rendition
            purgeOnQuotaError: true,
          }),
        ],
      }),
    },

    // Fonts (Heebo self-hosted via next/font → /_next/static/media)
    {
      matcher: ({ request, url }) =>
        request.destination === 'font' || url.pathname.includes('/media/'),
      handler: new CacheFirst({
        cacheName: 'fonts',
        plugins: [
          new ExpirationPlugin({ maxEntries: 20, maxAgeSeconds: 365 * 24 * 60 * 60 }),
        ],
      }),
    },

    // Fall through to Serwist/Next defaults for the rest
    ...defaultCache,
  ],
  fallbacks: {
    entries: [
      {
        url: '/offline',
        matcher({ request }) {
          return request.mode === 'navigate'
        },
      },
    ],
  },
})

serwist.addEventListeners()
```

### 3.3 Register SW from the client (storefront only)

```tsx
// src/components/pwa/SerwistProvider.tsx
'use client'

import { useEffect } from 'react'

export function SerwistProvider() {
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') return
    if (!('serviceWorker' in navigator)) return
    // Do not register on admin host paths if somehow shared layout
    if (window.location.pathname.startsWith('/admin')) return

    void import('serwist').then(async () => {
      const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' })
      // Optional: listen for waiting worker + skipWaiting message
      void reg
    })
  }, [])

  return null
}
```

Prefer Serwist’s generated registration helper from `@serwist/next` if the package version exports one; keep registration out of admin layout.

```tsx
// src/app/(store)/layout.tsx
import { SerwistProvider } from '@/components/pwa/SerwistProvider'
import { InstallPrompt } from '@/components/pwa/InstallPrompt'

export default function StoreLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <SerwistProvider />
      <InstallPrompt />
    </>
  )
}
```

---

## 4. Offline fallback

### 4.1 Page (RSC, static)

```tsx
// src/app/(store)/offline/page.tsx
import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'אין חיבור',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-static'

export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-lg flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="rounded-full bg-brand-primary px-3 py-1 text-sm font-bold text-heading">
        קניון אקספרס
      </p>
      <h1 className="text-2xl font-bold text-heading">אין חיבור לרשת</h1>
      <p className="text-black/60">
        אפשר לחזור לדף הבית כשהרשת חוזרת. עגלה, תשלום ומימוש קופון דורשים חיבור.
      </p>
      <Link
        href="/"
        className="rounded-md bg-brand-primary px-4 py-2 font-bold text-heading"
      >
        לדף הבית
      </Link>
      <button
        type="button"
        className="text-sm underline"
        // hydrate via small client island if needed
      >
        נסה שוב
      </button>
    </main>
  )
}
```

```tsx
// src/components/pwa/RetryOnlineButton.tsx
'use client'

export function RetryOnlineButton() {
  return (
    <button type="button" className="text-sm underline" onClick={() => location.reload()}>
      נסה שוב
    </button>
  )
}
```

Precache `/offline` via Serwist additionalPrecacheEntries or by linking it from the shell so build includes it:

```ts
// next.config / withSerwist extra option if available:
additionalPrecacheEntries: [{ url: '/offline', revision: '1' }],
```

### 4.2 Offline rules by feature

| Feature | Offline behavior |
|---|---|
| Home / category / PDP (if previously visited) | May show last NetworkFirst cache; else `/offline` |
| Cart / checkout | NetworkOnly → offline page; never stale prices |
| Account coupons list | Optional IndexedDB wallet read-only (SUPERAPP); status may be stale; banner "עודכן לפני…" |
| QR display | Local from cached `qr_token`; redemption still online |
| Supplier scan confirm | Queue `redeem_intents`; **no goods** until online OK |

---

## 5. Add to Home Screen (A2HS)

### 5.1 UX policy

1. Never block first paint with an install modal.
2. Prompt after a **value moment**: second visit, or after first paid order success, or after opening `/account/coupons`.
3. Respect dismissal for 14 days (`localStorage` key `ke_a2hs_dismissed_at`).
4. iOS has no `beforeinstallprompt`: show a short Hebrew sheet (“שתף → הוסף למסך הבית”).
5. Track `utm_source=pwa` on `start_url` for analytics (consent-gated).

### 5.2 Install prompt (full)

```tsx
// src/components/pwa/InstallPrompt.tsx
'use client'

import { useEffect, useState } from 'react'

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISS_KEY = 'ke_a2hs_dismissed_at'
const DISMISS_DAYS = 14

function wasDismissedRecently(): boolean {
  try {
    const raw = localStorage.getItem(DISMISS_KEY)
    if (!raw) return false
    const ts = Number(raw)
    return Date.now() - ts < DISMISS_DAYS * 24 * 60 * 60 * 1000
  } catch {
    return false
  }
}

function isIos(): boolean {
  if (typeof navigator === 'undefined') return false
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS Safari
    ('standalone' in navigator && Boolean((navigator as { standalone?: boolean }).standalone))
  )
}

export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [open, setOpen] = useState(false)
  const [iosHelp, setIosHelp] = useState(false)

  useEffect(() => {
    if (isStandalone() || wasDismissedRecently()) return

    const onBip = (e: Event) => {
      e.preventDefault()
      setDeferred(e as BeforeInstallPromptEvent)
      // Delay open until idle / value moment; here: after 8s on second session heuristic
      const visits = Number(localStorage.getItem('ke_visit_count') ?? '0') + 1
      localStorage.setItem('ke_visit_count', String(visits))
      if (visits >= 2) setOpen(true)
    }

    window.addEventListener('beforeinstallprompt', onBip)

    if (isIos()) {
      const visits = Number(localStorage.getItem('ke_visit_count') ?? '0') + 1
      localStorage.setItem('ke_visit_count', String(visits))
      if (visits >= 2) setIosHelp(true)
    }

    return () => window.removeEventListener('beforeinstallprompt', onBip)
  }, [])

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, String(Date.now()))
    setOpen(false)
    setIosHelp(false)
  }

  async function install() {
    if (!deferred) return
    await deferred.prompt()
    const choice = await deferred.userChoice
    if (choice.outcome === 'dismissed') dismiss()
    else {
      setOpen(false)
      setDeferred(null)
    }
  }

  if (!open && !iosHelp) return null

  return (
    <div
      role="dialog"
      aria-label="הוספה למסך הבית"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-black/10 bg-white p-4 shadow-lg"
    >
      <div className="mx-auto flex max-w-lg flex-col gap-3">
        <div className="flex items-start gap-3">
          <img
            src="/icons/icon-192.png"
            alt=""
            width={48}
            height={48}
            className="rounded-xl bg-brand-primary"
          />
          <div className="text-right">
            <p className="font-bold text-heading">הוסיפו את קניון אקספרס למסך הבית</p>
            <p className="text-sm text-black/60">
              גישה מהירה לקופונים ולמבצעים, גם בלי לפתוח את הדפדפן.
            </p>
          </div>
        </div>

        {iosHelp ? (
          <p className="text-sm text-black/70">
            ב־Safari: לחצו שתף, אחר כך &quot;הוסף למסך הבית&quot;.
          </p>
        ): (
          <button
            type="button"
            onClick={() => void install()}
            className="rounded-md bg-brand-primary px-4 py-2 font-bold text-heading"
          >
            הוסף למסך הבית
          </button>
        )}

        <button type="button" className="text-sm text-black/50 underline" onClick={dismiss}>
          לא עכשיו
        </button>
      </div>
    </div>
  )
}
```

Use `next/image` only if the icon is in the image pipeline; for local `/icons` a plain `img` is fine in this chrome UI.

---

## 6. Product image cache strategy

### 6.1 Goals

| Goal | Tactic |
|---|---|
| Fast repeat PDP / grid | CacheFirst on optimized image responses |
| Correctness after admin replace | **Immutable URLs** (path/version changes on upload); never overwrite bytes at same URL |
| Quota safety | `maxEntries: 200`, `purgeOnQuotaError: true` |
| Privacy | Do not cache authenticated image URLs (there should be none for catalog) |

### 6.2 URL classes

| Class | Example | SW strategy | TTL |
|---|---|---|---|
| `next/image` | `/_next/image?url=...&w=640&q=60` | CacheFirst `product-images` | 30d |
| R2 public | `https://cdn.kenyonexpress.co.il/.../w640.avif` | CacheFirst | 30d |
| Supabase storage public | `*.supabase.co/storage/v1/object/public/...` | CacheFirst | 30d |
| Unsplash / picsum | demo only | remove before prod; if present, NetworkFirst short TTL |

Align with performance doc: `minimumCacheTTL` on Next Image Optimization ≈ 31 days. SW TTL 30d is fine; browser HTTP cache and SW stack.

### 6.3 Helper: warm LCP image (optional)

```ts
// src/lib/pwa/warm-image-cache.ts
export async function warmProductImage(src: string) {
  if (!('caches' in window)) return
  if (!src.startsWith('/') && !src.startsWith('https://')) return
  const cache = await caches.open('product-images')
  const hit = await cache.match(src)
  if (hit) return
  try {
    const res = await fetch(src, { mode: 'no-cors' }) // opaque OK for CDN
    // Prefer cors mode when CDN sends ACAO; adjust per host
    void res
  } catch {
    // ignore
  }
}
```

Prefer letting the SW populate on first real request; warming is optional for featured home rail.

### 6.4 What not to cache as images

- OG dynamic routes that embed user-specific data (none today)
- Blob URLs from camera (supplier scanner): memory only
- Payment / Cardcom assets

---

## 7. Push notifications (future) and OneSignal

### 7.1 Binding decision: **replace OneSignal**, do not port it

| Option | Verdict |
|---|---|
| Keep WordPress OneSignal forever | Reject for the Next storefront |
| Embed OneSignal Web SDK in Next | **Reject.** Third-party SW conflicts with Serwist; consent model forks from `consent_events`; Expo/RN later needs a second pipe anyway |
| First-party Web Push + `push_subscriptions` | **Choose.** Same table as SUPERAPP M7 (`platform: 'web' \| 'expo'`). Fanout through existing notification outbox |
| Dual-run WP OneSignal during cutover | Allowed **read-only** for legacy WP audience until domain cutover; no new KE Next subscribers via OneSignal |

Rationale:

1. Serwist must own `sw.js`. OneSignal wants its own worker or importScripts gymnastics.
2. MASTER / SUPERAPP already specified `push_subscriptions` ownership under notifications domain.
3. RN will use Expo Push, not OneSignal. One stack for consent + outbox.
4. Israeli marketing consent (30א) must stay in our DB, not only in OneSignal segments.

### 7.2 Migration from WP OneSignal

1. Export active OneSignal player IDs / emails if needed for campaign continuity (ops).
2. Do **not** silently re-permission users on Next. Show in-app opt-in after login.
3. After cutover, disable OneSignal on WP; keep historical analytics in OneSignal dashboard if useful.
4. Map service templates: order paid, coupon issued, expiry reminder → same `notification_events` catalog as email.

### 7.3 Schema (target)

```sql
-- supabase/migrations/YYYYMMDDHHMMSS_push_subscriptions.sql
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform      text NOT NULL CHECK (platform IN ('web', 'expo')),
  endpoint      text,                  -- web push endpoint
  p256dh        text,                  -- web
  auth          text,                  -- web
  expo_push_token text,              -- expo
  user_agent    text,
  consent_marketing boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz NOT NULL DEFAULT now(),
  revoked_at    timestamptz,
  CONSTRAINT push_subscriptions_web_or_expo CHECK (
    (platform = 'web' AND endpoint IS NOT NULL AND p256dh IS NOT NULL AND auth IS NOT NULL)
    OR (platform = 'expo' AND expo_push_token IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS push_subscriptions_web_endpoint_uidx
  ON public.push_subscriptions (endpoint)
  WHERE platform = 'web' AND revoked_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS push_subscriptions_expo_token_uidx
  ON public.push_subscriptions (expo_push_token)
  WHERE platform = 'expo' AND revoked_at IS NULL;

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY push_subscriptions_select_own ON public.push_subscriptions
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY push_subscriptions_insert_own ON public.push_subscriptions
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY push_subscriptions_update_own ON public.push_subscriptions
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
```

Env (server only):

```
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:ops@kenyonexpress.co.il
```

### 7.4 Client subscribe (full)

```tsx
// src/components/pwa/PushOptIn.tsx
'use client'

import { useState } from 'react'
import { registerWebPush } from '@/lib/pwa/web-push-client'

export function PushOptIn() {
  const [status, setStatus] = useState<'idle' | 'ok' | 'denied' | 'error'>('idle')

  async function onEnable() {
    try {
      const ok = await registerWebPush()
      setStatus(ok ? 'ok' : 'denied')
    } catch {
      setStatus('error')
    }
  }

  return (
    <div className="rounded-xl border border-black/10 p-4">
      <p className="font-bold text-heading">התראות על קופונים והזמנות</p>
      <p className="text-sm text-black/60">
        נשלח רק אם אישרתם. אפשר לבטל בכל רגע מהדפדפן או מהחשבון.
      </p>
      <button
        type="button"
        onClick={() => void onEnable()}
        className="mt-3 rounded-md bg-brand-primary px-4 py-2 font-bold text-heading"
      >
        הפעל התראות
      </button>
      {status === 'ok' ? <p className="mt-2 text-sm text-success">התראות הופעלו</p> : null}
      {status === 'denied' ? (
        <p className="mt-2 text-sm text-price">ההרשאה נחסמה בדפדפן</p>
      ): null}
    </div>
  )
}
```

```ts
// src/lib/pwa/web-push-client.ts
'use client'

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

export async function registerWebPush(): Promise<boolean> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return false

  const reg = await navigator.serviceWorker.ready
  const existing = await reg.pushManager.getSubscription()
  const sub =
    existing ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(
        process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
      ),
    }))

  const json = sub.toJSON()
  const res = await fetch('/api/push/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      endpoint: json.endpoint,
      keys: json.keys,
      consentMarketing: true,
    }),
  })
  return res.ok
}
```

```ts
// src/app/api/push/register/route.ts
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const bodySchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
  consentMarketing: z.boolean(),
})

export async function POST(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const parsed = bodySchema.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: 'invalid' }, { status: 400 })

  const { endpoint, keys, consentMarketing } = parsed.data

  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      user_id: user.id,
      platform: 'web',
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      consent_marketing: consentMarketing,
      revoked_at: null,
      last_seen_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'endpoint' }, // match unique index; adjust to your upsert target
  )

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
```

### 7.5 SW push handler

```ts
// append to src/sw.ts (inside same file, after Serwist setup) OR use serwist options
self.addEventListener('push', (event: PushEvent) => {
  const data = event.data?.json() as {
    title?: string
    body?: string
    url?: string
  } | undefined

  const title = data?.title ?? 'קניון אקספרס'
  const body = data?.body ?? ''
  const url = data?.url ?? '/'

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { url },
      lang: 'he',
      dir: 'rtl',
    }),
  )
})

self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close()
  const url = (event.notification.data as { url?: string } | undefined)?.url ?? '/'
  event.waitUntil(self.clients.openWindow(url))
})
```

### 7.6 Server send (sketch)

```ts
// src/server/push/send-web-push.ts
import 'server-only'
import webpush from 'web-push'

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT!,
  process.env.VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!,
)

export async function sendWebPush(input: {
  endpoint: string
  p256dh: string
  auth: string
  title: string
  body: string
  url: string
}) {
  await webpush.sendNotification(
    {
      endpoint: input.endpoint,
      keys: { p256dh: input.p256dh, auth: input.auth },
    },
    JSON.stringify({ title: input.title, body: input.body, url: input.url }),
  )
}
```

Wire from notifications worker after email channel (same `notification_log` fanout, channel `push`). Push is **phase after** Resend email is live; this section is the contract, not day-one scope.

### 7.7 Push phase gate

| Phase | Ship |
|---|---|
| PWA-1 | Manifest + Serwist + offline + A2HS + image cache |
| PWA-2 | IndexedDB coupon wallet read cache (optional) |
| PWA-3 | Web Push opt-in + `push_subscriptions` + SW handlers |
| PWA-4 | Retire WP OneSignal; Expo tokens on RN |

---

## 8. Security / headers interaction

Existing CSP in `next.config.ts` / `frame-policy` must allow:

- `worker-src 'self'` (or equivalent) for SW
- `manifest-src 'self'`
- No OneSignal domains (`onesignal.com`, `cdn.onesignal.com`) on the Next origin after cutover

Private Cache-Control from performance architecture still wins for HTML on money routes; SW `NetworkOnly` matches that.

---

## 9. Testing checklist

- [ ] `manifest.webmanifest` serves theme `#fed700`, RTL, Hebrew name
- [ ] Icons 192 / 512 / maskable / apple-touch present
- [ ] Lighthouse PWA installable (Chromium)
- [ ] Offline: kill network → navigate → `/offline` for cold; cached public page may show for warm
- [ ] `/checkout` with network off does not show a stale paid shell
- [ ] Product image repeat visit hits `product-images` cache (Application tab)
- [ ] A2HS prompt respects 14-day dismiss
- [ ] Admin layout does not register SW
- [ ] No OneSignal script tags in storefront HTML
- [ ] Push (PWA-3): permission denied path is quiet; granted path upserts row

---

## 10. File map (implementation PR)

```
src/app/manifest.ts
src/app/(store)/offline/page.tsx
src/app/(store)/layout.tsx          # SerwistProvider + InstallPrompt
src/sw.ts
src/components/pwa/SerwistProvider.tsx
src/components/pwa/InstallPrompt.tsx
src/components/pwa/PushOptIn.tsx      # PWA-3
src/lib/pwa/web-push-client.ts        # PWA-3
src/app/api/push/register/route.ts    # PWA-3
public/icons/icon-192.png
public/icons/icon-512.png
public/icons/maskable-512.png
public/icons/apple-touch-icon.png
next.config.ts                        # withSerwist
supabase/migrations/*_push_subscriptions.sql  # PWA-3
```

---

## 11. Out of scope

- React Native / Expo store apps (SUPERAPP)
- Supplier offline redeem queue details (supplier portal / redemption docs)
- Email / Resend pipeline (notifications arch)
- Changing brand yellow away from `#fed700`

---

## 12. Revision

| Date | Change |
|---|---|
| 2026-07-30 | Initial binding PWA architecture on `arch/pwa`: Serwist, `#fed700` manifest, offline, A2HS, image CacheFirst, replace OneSignal with first-party Web Push |
