import { REMOTE_IMAGE_PATTERNS } from '@/lib/images/remote-hosts'
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_CONTENT_SECURITY_POLICY,
  PAYMENT_FRAME_PATHS,
  contentSecurityPolicyFor,
  frameOptionsFor,
  isPaymentFramePath,
  permissionsPolicyFor,
} from './frame-policy'

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

describe('contentSecurityPolicyFor', () => {
  it('denies framing everywhere by default', () => {
    expect(contentSecurityPolicyFor('/')).toContain("frame-ancestors 'none'")
    expect(contentSecurityPolicyFor('/checkout')).toContain("frame-ancestors 'none'")
  })

  it('allows only this origin to frame the payment stub', () => {
    const policy = contentSecurityPolicyFor('/checkout/frame-return')
    expect(policy).toContain("frame-ancestors 'self'")
    expect(policy).not.toContain("frame-ancestors 'none'")
  })

  it('emits frame-ancestors exactly once, so the strictest cannot silently win', () => {
    for (const path of ['/', '/checkout/frame-return']) {
      const occurrences = contentSecurityPolicyFor(path).match(/frame-ancestors/g) ?? []
      expect(occurrences).toHaveLength(1)
    }
  })

  it('never widens frame-ancestors to a wildcard', () => {
    for (const path of ['/', '/checkout/frame-return', '/checkout/return']) {
      expect(contentSecurityPolicyFor(path)).not.toMatch(/frame-ancestors[^;]*\*/)
    }
  })

  it('keeps every other directive identical between the two cases', () => {
    const strip = (policy: string) =>
      policy
        .split('; ')
        .filter((directive) => !directive.startsWith('frame-ancestors'))
        .join('; ')
    expect(strip(contentSecurityPolicyFor('/checkout/frame-return'))).toBe(
      strip(contentSecurityPolicyFor('/')),
    )
  })

  it('still allows Cardcom to be framed by us, which is the other half', () => {
    expect(contentSecurityPolicyFor('/checkout')).toContain(
      'frame-src https://secure.cardcom.solutions',
    )
  })

  it('exports a default that denies framing', () => {
    expect(DEFAULT_CONTENT_SECURITY_POLICY).toContain("frame-ancestors 'none'")
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
    // The [18] failure, as a guard. Three of the six hosts used to be missing
    // from a hand-written img-src, `picsum.photos` among them, and 45 catalogue
    // rows pointed at it: three pages drew BROKEN IMAGES with nothing but a
    // console violation. Adding a seventh host to `remote-hosts.ts` and
    // forgetting this header is the same bug, so it is not possible to forget.
    const csp = contentSecurityPolicyFor('/')
    const imgSrc = csp.split('; ').find((d) => d.startsWith('img-src')) as string
    for (const pattern of REMOTE_IMAGE_PATTERNS) {
      expect(imgSrc).toContain(`${pattern.protocol}://${pattern.hostname}`)
    }
  })

  it('keeps self, data and blob, which the QR and the uploader need', () => {
    // The voucher QR is a data URL in a raw <img>; dropping `data:` blanks the
    // one screen a customer opens at a counter.
    const imgSrc = contentSecurityPolicyFor('/')
      .split('; ')
      .find((d) => d.startsWith('img-src')) as string
    expect(imgSrc).toContain("'self'")
    expect(imgSrc).toContain('data:')
    expect(imgSrc).toContain('blob:')
  })

  it('names no host that is not on the allowlist', () => {
    const imgSrc = contentSecurityPolicyFor('/')
      .split('; ')
      .find((d) => d.startsWith('img-src')) as string
    const hosts = imgSrc
      .split(' ')
      .slice(1)
      .filter((token) => token.startsWith('https://'))
    expect(hosts).toEqual(REMOTE_IMAGE_PATTERNS.map((p) => `${p.protocol}://${p.hostname}`))
  })
})

describe('permissionsPolicyFor', () => {
  it('opens the camera only on the scanner routes', () => {
    expect(permissionsPolicyFor('/scan')).toContain('camera=(self)')
    expect(permissionsPolicyFor('/supplier/scan')).toContain('camera=(self)')
    for (const path of ['/', '/checkout', '/checkout/frame-return', '/supplier', '/scanner-x']) {
      expect(permissionsPolicyFor(path)).toContain('camera=()')
    }
  })

  it('never loosens anything else', () => {
    for (const path of ['/', '/scan']) {
      const policy = permissionsPolicyFor(path)
      expect(policy).toContain('microphone=()')
      expect(policy).toContain('geolocation=()')
      expect(policy).toContain('payment=(self)')
    }
  })
})
