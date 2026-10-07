import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { CONSENT_PREPAINT_SCRIPT } from '@/lib/analytics/consent'
import { REMOTE_IMAGE_PATTERNS } from '@/lib/images/remote-hosts'
import { describe, expect, it } from 'vitest'
import {
  ASSET_CONTENT_SECURITY_POLICY,
  ASSET_HEADER_SOURCE,
  CAMERA_PATHS,
  CSP_REPORT_GROUP,
  NONCE_HEADER,
  PAYMENT_FRAME_PATHS,
  PROXY_SKIPPED_PATHS,
  contentSecurityPolicyFor,
  createNonce,
  cspReportUriFromEnv,
  frameOptionsFor,
  isCameraPath,
  isPaymentFramePath,
  permissionsPolicyFor,
  reportingEndpointsHeader,
  sentrySecurityEndpoint,
  vendorSources,
} from './frame-policy'
import {
  CONSENT_PREPAINT_SCRIPT_HASH,
  REACT_RENDER_TIMING_SCRIPT,
  REACT_RENDER_TIMING_SCRIPT_HASH,
  SHELL_INLINE_SCRIPT_HASHES,
} from './shell-script-hashes.mjs'

const NONCE = 'dGVzdC1ub25jZS0xMjM0NQ=='
const policy = (pathname: string) => contentSecurityPolicyFor(pathname, { nonce: NONCE })
const directive = (csp: string, name: string) =>
  csp.split('; ').find((d) => d.startsWith(`${name} `) || d === name) ?? null
const sources = (csp: string, name: string) => (directive(csp, name) ?? '').split(' ').slice(1)

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return `sha256-${Buffer.from(digest).toString('base64')}`
}

describe('isPaymentFramePath', () => {
  it.each(PAYMENT_FRAME_PATHS)('recognises %s', (path) => {
    expect(isPaymentFramePath(path)).toBe(true)
  })

  it('recognises a sub-path of the framable stub', () => {
    expect(isPaymentFramePath('/checkout/frame-return/anything')).toBe(true)
  })

  it.each([
    '/',
    '/cart',
    '/checkout',
    '/account',
    '/admin/orders',
    '/product/anything',
    // The confirmation page is deliberately NOT framable. It needs a session,
    // and a cross-site navigation into a frame would not carry one.
    '/checkout/return',
    '/checkout/failed',
    // The prefix check must not be a bare startsWith: this is a different route
    // that merely begins with the same characters.
    '/checkout/frame-returns-policy',
  ])('does not relax %s', (path) => {
    expect(isPaymentFramePath(path)).toBe(false)
  })
})

describe('contentSecurityPolicyFor: framing', () => {
  it('denies framing everywhere by default', () => {
    expect(policy('/')).toContain("frame-ancestors 'none'")
    expect(policy('/checkout')).toContain("frame-ancestors 'none'")
  })

  it('allows only this origin to frame the payment stub', () => {
    const csp = policy('/checkout/frame-return')
    expect(csp).toContain("frame-ancestors 'self'")
    expect(csp).not.toContain("frame-ancestors 'none'")
  })

  it('emits frame-ancestors exactly once, so the strictest cannot silently win', () => {
    for (const path of ['/', '/checkout/frame-return']) {
      const occurrences = policy(path).match(/frame-ancestors/g) ?? []
      expect(occurrences).toHaveLength(1)
    }
  })

  it('never widens frame-ancestors to a wildcard', () => {
    for (const path of ['/', '/checkout/frame-return', '/checkout/return']) {
      expect(policy(path)).not.toMatch(/frame-ancestors[^;]*\*/)
    }
  })

  it('keeps every other directive identical between the two cases', () => {
    const strip = (csp: string) =>
      csp
        .split('; ')
        .filter((d) => !d.startsWith('frame-ancestors'))
        .join('; ')
    expect(strip(policy('/checkout/frame-return'))).toBe(strip(policy('/')))
  })

  it('still allows Cardcom to be framed by us, which is the other half', () => {
    expect(sources(policy('/checkout'), 'frame-src')).toContain('https://secure.cardcom.solutions')
  })
})

describe('contentSecurityPolicyFor: the script policy (STEP 30)', () => {
  it('carries the request nonce and no unsafe-inline', () => {
    const scriptSrc = sources(policy('/'), 'script-src')
    expect(scriptSrc).toContain(`'nonce-${NONCE}'`)
    expect(scriptSrc).not.toContain("'unsafe-inline'")
    expect(policy('/')).not.toMatch(/script-src[^;]*unsafe-inline/)
  })

  it("keeps 'self' and omits strict-dynamic, because the cached shell's bootstrap tags carry no nonce", () => {
    // Measured 2026-10-07: 19 parser-inserted <script src> tags per shell,
    // none nonced. 'strict-dynamic' makes browsers ignore 'self' and blocks
    // every one of them; the page paints and never hydrates.
    const scriptSrc = sources(policy('/'), 'script-src')
    expect(scriptSrc).toContain("'self'")
    expect(scriptSrc).not.toContain("'strict-dynamic'")
  })

  it('allows the two constant shell scripts by hash, and nothing else inline', () => {
    const scriptSrc = sources(policy('/'), 'script-src')
    for (const hash of SHELL_INLINE_SCRIPT_HASHES) expect(scriptSrc).toContain(`'${hash}'`)
    const hashes = scriptSrc.filter((s) => s.startsWith("'sha"))
    expect(hashes).toHaveLength(SHELL_INLINE_SCRIPT_HASHES.length)
  })

  it('the consent pre-paint hash is the hash of the live constant', async () => {
    expect(await sha256(CONSENT_PREPAINT_SCRIPT)).toBe(CONSENT_PREPAINT_SCRIPT_HASH)
  })

  it("the React timing hash is the hash of the probe's pinned text", async () => {
    expect(await sha256(REACT_RENDER_TIMING_SCRIPT)).toBe(REACT_RENDER_TIMING_SCRIPT_HASH)
  })

  it('names the worker explicitly rather than through the script-src fallback', () => {
    expect(directive(policy('/'), 'worker-src')).toBe("worker-src 'self'")
  })

  it('states the style exception rather than hiding it', () => {
    expect(directive(policy('/'), 'style-src')).toBe("style-src 'self' 'unsafe-inline'")
  })

  it('starts with default-src and keeps base-uri, form-action and object-src', () => {
    const csp = policy('/')
    expect(csp.startsWith("default-src 'self'; script-src ")).toBe(true)
    expect(directive(csp, 'base-uri')).toBe("base-uri 'self'")
    expect(directive(csp, 'form-action')).toBe(
      "form-action 'self' https://secure.cardcom.solutions",
    )
    expect(directive(csp, 'object-src')).toBe("object-src 'none'")
    expect(directive(csp, 'upgrade-insecure-requests')).toBe('upgrade-insecure-requests')
  })

  it('emits each directive once', () => {
    const names = policy('/')
      .split('; ')
      .map((d) => d.split(' ')[0])
    expect(new Set(names).size).toBe(names.length)
  })
})

describe('createNonce', () => {
  it('is 128 bits of base64 that Next can parse, fresh each time', () => {
    const a = createNonce()
    const b = createNonce()
    expect(a).not.toBe(b)
    for (const nonce of [a, b]) {
      expect(nonce).toMatch(/^[A-Za-z0-9+/]+={0,2}$/)
      expect(Buffer.from(nonce, 'base64')).toHaveLength(16)
      // What Next's getScriptNonceFromHeader accepts.
      expect(`'nonce-${nonce}'`).toMatch(/^'nonce-([A-Za-z0-9+/_-]+={0,2})'$/)
    }
  })

  it('is exposed on the header Next documents', () => {
    expect(NONCE_HEADER).toBe('x-nonce')
  })
})

describe('the asset policy', () => {
  it('runs no script at all and frames nothing', () => {
    expect(directive(ASSET_CONTENT_SECURITY_POLICY, 'script-src')).toBe("script-src 'none'")
    expect(directive(ASSET_CONTENT_SECURITY_POLICY, 'frame-ancestors')).toBe(
      "frame-ancestors 'none'",
    )
    expect(ASSET_CONTENT_SECURITY_POLICY).not.toContain('nonce-')
  })

  it('is the document policy with script-src swapped, so the two cannot drift', () => {
    const swap = (csp: string) =>
      csp
        .split('; ')
        .filter((d) => !d.startsWith('script-src'))
        .join('; ')
    expect(swap(ASSET_CONTENT_SECURITY_POLICY)).toBe(swap(policy('/')))
  })
})

describe('the proxy and the config split the paths between them', () => {
  const proxySource = readFileSync(resolve(process.cwd(), 'src/proxy.ts'), 'utf8')

  it('the proxy matcher is a literal copy of PROXY_SKIPPED_PATHS', () => {
    // Next requires the matcher to be a literal; this is the only way to keep
    // the literal and the config's lookahead the same string.
    const matcher = proxySource.match(/matcher:\s*\[\s*'([^']+)'/)?.[1]
    expect(matcher).toBeDefined()
    const expected = `/((?!${PROXY_SKIPPED_PATHS}).*)`.replace(/\\/g, '\\\\')
    expect(matcher).toBe(expected)
  })

  it.each([
    '/_next/static/chunks/main.js',
    '/_next/image?url=x',
    '/favicon.ico',
    '/images/logo.svg',
    '/icons/apple-touch-icon.png',
    '/hero.webp',
  ])('%s is an asset to both', (path) => {
    expect(new RegExp(`^/(?!${PROXY_SKIPPED_PATHS})`).test(path)).toBe(false)
    expect(assetSourceMatches(path)).toBe(true)
  })

  it.each(['/', '/cart', '/checkout/frame-return', '/api/health', '/product/a-b', '/svg-guide'])(
    '%s is a document to both',
    (path) => {
      expect(new RegExp(`^/(?!${PROXY_SKIPPED_PATHS})`).test(path)).toBe(true)
      expect(assetSourceMatches(path)).toBe(false)
    },
  )

  it('the proxy sets the policy on the request as well as the response', () => {
    // Next reads the nonce off the REQUEST header while rendering. Set only
    // on the response, no script carries the nonce and hydration is blocked.
    expect(proxySource).toContain("headers.set('content-security-policy', context.csp)")
    expect(proxySource).toContain("response.headers.set('Content-Security-Policy', context.csp)")
  })

  /** ASSET_HEADER_SOURCE as path-to-regexp reads a parenthesised group: a regex. */
  function assetSourceMatches(path: string): boolean {
    const inner = ASSET_HEADER_SOURCE.slice(2, -1)
    return new RegExp(`^/(?:${inner})$`).test(path)
  }
})

describe('vendorSources', () => {
  it('admits nothing when nothing is configured', () => {
    expect(vendorSources({})).toEqual({ script: [], connect: [], img: [], frame: [] })
    expect(sources(policy('/'), 'script-src').filter((s) => s.startsWith('https://'))).toEqual([])
  })

  it('admits GA4 only with a measurement id, and only its hosts', () => {
    const v = vendorSources({ NEXT_PUBLIC_GA4_MEASUREMENT_ID: 'G-ABC1234567' })
    expect(v.script).toEqual(['https://www.googletagmanager.com'])
    expect(v.connect).toContain('https://*.google-analytics.com')
    expect(v.script).not.toContain('https://connect.facebook.net')
  })

  it('admits the Pixel only with a pixel id', () => {
    const v = vendorSources({ NEXT_PUBLIC_META_PIXEL_ID: '123456789012' })
    expect(v.script).toEqual(['https://connect.facebook.net'])
    expect(v.img).toContain('https://www.facebook.com')
  })

  it('admits the PostHog ingest host for events and its assets host for the recorder', () => {
    const v = vendorSources({ NEXT_PUBLIC_POSTHOG_KEY: 'phc_x' })
    expect(v.connect).toEqual(['https://us.i.posthog.com'])
    expect(v.script).toEqual(['https://us-assets.i.posthog.com'])
    const eu = vendorSources({
      NEXT_PUBLIC_POSTHOG_KEY: 'phc_x',
      NEXT_PUBLIC_POSTHOG_HOST: 'https://eu.i.posthog.com/',
    })
    expect(eu.connect).toEqual(['https://eu.i.posthog.com'])
    expect(eu.script).toEqual(['https://eu-assets.i.posthog.com'])
  })

  it('a blank id is no id', () => {
    expect(vendorSources({ NEXT_PUBLIC_GA4_MEASUREMENT_ID: '  ' }).script).toEqual([])
  })

  it('lands in the policy in the matching directives', () => {
    const vendors = vendorSources({
      NEXT_PUBLIC_GA4_MEASUREMENT_ID: 'G-ABC1234567',
      NEXT_PUBLIC_POSTHOG_KEY: 'phc_x',
    })
    const csp = contentSecurityPolicyFor('/', { nonce: NONCE, vendors })
    expect(sources(csp, 'script-src')).toContain('https://www.googletagmanager.com')
    expect(sources(csp, 'script-src')).toContain('https://us-assets.i.posthog.com')
    expect(sources(csp, 'connect-src')).toContain('https://us.i.posthog.com')
    expect(sources(csp, 'img-src')).toContain('https://www.googletagmanager.com')
    // The nonce and the hashes are still there: vendors add, never replace.
    expect(sources(csp, 'script-src')).toContain(`'nonce-${NONCE}'`)
  })
})

describe('frameOptionsFor', () => {
  it('moves in step with frame-ancestors', () => {
    // Browsers that honour both enforce both. A DENY left behind on a path
    // whose CSP says 'self' blocks the frame anyway.
    expect(frameOptionsFor('/checkout/frame-return')).toBe('SAMEORIGIN')
    expect(frameOptionsFor('/')).toBe('DENY')
    expect(frameOptionsFor('/checkout')).toBe('DENY')
    expect(frameOptionsFor('/checkout/return')).toBe('DENY')
  })
})

describe('img-src stays tied to the one image-host allowlist', () => {
  it('allows every host next/image is configured to fetch from', () => {
    const imgSrc = directive(policy('/'), 'img-src') as string
    for (const pattern of REMOTE_IMAGE_PATTERNS) {
      expect(imgSrc).toContain(`${pattern.protocol}://${pattern.hostname}`)
    }
  })

  it('keeps self, data and blob, which the QR and the uploader need', () => {
    const imgSrc = sources(policy('/'), 'img-src')
    expect(imgSrc).toContain("'self'")
    expect(imgSrc).toContain('data:')
    expect(imgSrc).toContain('blob:')
  })

  it('names no host that is not on the allowlist', () => {
    const hosts = sources(policy('/'), 'img-src').filter((s) => s.startsWith('https://'))
    const allowed = new Set(REMOTE_IMAGE_PATTERNS.map((p) => `${p.protocol}://${p.hostname}`))
    for (const host of hosts) expect(allowed.has(host)).toBe(true)
  })
})

describe('permissionsPolicyFor', () => {
  it('opens the camera only on the scanner routes', () => {
    for (const path of CAMERA_PATHS) {
      expect(isCameraPath(path)).toBe(true)
      expect(permissionsPolicyFor(path)).toContain('camera=(self)')
    }
    for (const path of ['/', '/checkout', '/checkout/frame-return', '/supplier', '/scanner-x']) {
      expect(permissionsPolicyFor(path)).toContain('camera=()')
    }
  })

  it('includes the merchant scanner, which the list did not until STEP 30', () => {
    expect(CAMERA_PATHS).toContain('/merchant/scan')
  })

  it('opens geolocation for the "near me" tags and payment for this origin', () => {
    // geolocation=() was the header until STEP 30; CityTags calls
    // navigator.geolocation on the home page and was refused every time.
    for (const path of ['/', '/category/spa', '/scan']) {
      const p = permissionsPolicyFor(path)
      expect(p).toContain('geolocation=(self)')
      expect(p).toContain('payment=(self)')
    }
  })

  it('denies everything the code does not call', () => {
    const p = permissionsPolicyFor('/')
    for (const feature of [
      'microphone',
      'accelerometer',
      'gyroscope',
      'magnetometer',
      'midi',
      'usb',
      'serial',
      'bluetooth',
      'hid',
      'display-capture',
      'screen-wake-lock',
      'xr-spatial-tracking',
      'browsing-topics',
      'interest-cohort',
    ]) {
      expect(p).toContain(`${feature}=()`)
    }
  })

  it('does not name the features whose default is already self and which the site uses', () => {
    // Passkeys and the share buttons. Listing them as () would break them;
    // listing them as (self) states the default.
    const p = permissionsPolicyFor('/')
    expect(p).not.toContain('publickey-credentials-get')
    expect(p).not.toContain('web-share')
    expect(p).not.toContain('clipboard-write')
  })

  it('is a well-formed header value', () => {
    for (const entry of permissionsPolicyFor('/').split(', ')) {
      expect(entry).toMatch(/^[a-z-]+=\((self)?\)$/)
    }
  })
})

describe('CSP violation reporting', () => {
  it('derives the Sentry security endpoint from a DSN', () => {
    expect(
      sentrySecurityEndpoint('https://abc123@o4507.ingest.de.sentry.io/4509', 'production'),
    ).toBe(
      'https://o4507.ingest.de.sentry.io/api/4509/security/?sentry_key=abc123&sentry_environment=production',
    )
  })

  it('omits the environment when none is known', () => {
    expect(sentrySecurityEndpoint('https://k@h.example/7')).toBe(
      'https://h.example/api/7/security/?sentry_key=k',
    )
  })

  it.each([
    '',
    undefined,
    null,
    'not a url',
    'https://h.example/7',
    'https://k@h.example/',
    'https://k@h.example/abc',
  ])('yields nothing for %j', (dsn) => {
    expect(sentrySecurityEndpoint(dsn)).toBeNull()
  })

  it('reads the DSN and the environment off env the same way for the config and the proxy', () => {
    expect(
      cspReportUriFromEnv({
        NEXT_PUBLIC_SENTRY_DSN: 'https://k@h.example/7',
        VERCEL_ENV: 'preview',
      }),
    ).toBe('https://h.example/api/7/security/?sentry_key=k&sentry_environment=preview')
    expect(
      cspReportUriFromEnv({
        SENTRY_DSN: 'https://k@h.example/7',
        SENTRY_ENVIRONMENT: 'production',
      }),
    ).toBe('https://h.example/api/7/security/?sentry_key=k&sentry_environment=production')
    expect(cspReportUriFromEnv({})).toBeNull()
  })

  it('adds report-uri and report-to only when an endpoint is given', () => {
    const uri = 'https://h.example/api/7/security/?sentry_key=k'
    const withReporting = contentSecurityPolicyFor('/', { nonce: NONCE, reportUri: uri })
    expect(withReporting).toContain(`report-uri ${uri}`)
    expect(withReporting).toContain(`report-to ${CSP_REPORT_GROUP}`)
    expect(policy('/')).not.toContain('report-')
    expect(contentSecurityPolicyFor('/', { nonce: NONCE, reportUri: null })).not.toContain(
      'report-',
    )
  })

  it('the reporting directives never touch frame-ancestors', () => {
    const uri = 'https://h.example/api/7/security/?sentry_key=k'
    const occurrences = contentSecurityPolicyFor('/', { nonce: NONCE, reportUri: uri }).match(
      /frame-ancestors/g,
    )
    expect(occurrences).toHaveLength(1)
  })

  it('emits a Reporting-Endpoints header that names the same group', () => {
    const uri = 'https://h.example/api/7/security/?sentry_key=k'
    expect(reportingEndpointsHeader(uri)).toBe(`${CSP_REPORT_GROUP}="${uri}"`)
    expect(reportingEndpointsHeader(null)).toBeNull()
    expect(reportingEndpointsHeader(undefined)).toBeNull()
  })
})

describe('the merchant map embed', () => {
  it('is allowed as a frame, from the origin merchant-map.ts builds', async () => {
    const { MERCHANT_MAP_ORIGIN } = await import('../geo/merchant-map')
    expect(sources(policy('/coupon/spa-day'), 'frame-src')).toContain(MERCHANT_MAP_ORIGIN)
  })
})
