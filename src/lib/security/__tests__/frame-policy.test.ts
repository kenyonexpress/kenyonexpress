import { describe, expect, it } from 'vitest'
import {
  CAMERA_PATHS,
  contentSecurityPolicyFor,
  frameOptionsFor,
  isCameraPath,
  isPaymentFramePath,
  permissionsPolicyFor,
} from '../frame-policy'

describe('Frame Policy', () => {
  describe('isPaymentFramePath', () => {
    it('returns true for exact payment frame path', () => {
      expect(isPaymentFramePath('/checkout/frame-return')).toBe(true)
    })

    it('returns true for payment frame subpath', () => {
      expect(isPaymentFramePath('/checkout/frame-return/success')).toBe(true)
    })

    it('returns false for other checkout paths', () => {
      expect(isPaymentFramePath('/checkout')).toBe(false)
      expect(isPaymentFramePath('/checkout/return')).toBe(false)
    })

    it('returns false for non-checkout paths', () => {
      expect(isPaymentFramePath('/')).toBe(false)
      expect(isPaymentFramePath('/product/test')).toBe(false)
    })
  })

  describe('isCameraPath', () => {
    it('returns true for camera paths', () => {
      for (const path of CAMERA_PATHS) {
        expect(isCameraPath(path)).toBe(true)
      }
    })

    it('returns true for camera subpaths', () => {
      expect(isCameraPath('/scan/product')).toBe(true)
      expect(isCameraPath('/supplier/scan/voucher')).toBe(true)
    })

    it('returns false for non-camera paths', () => {
      expect(isCameraPath('/')).toBe(false)
      expect(isCameraPath('/scanner')).toBe(false)
      expect(isCameraPath('/supplier')).toBe(false)
    })
  })

  describe('contentSecurityPolicyFor', () => {
    it('includes frame-ancestors none for regular paths', () => {
      const csp = contentSecurityPolicyFor('/')
      expect(csp).toContain("frame-ancestors 'none'")
    })

    it('includes frame-ancestors self for payment frame path', () => {
      const csp = contentSecurityPolicyFor('/checkout/frame-return')
      expect(csp).toContain("frame-ancestors 'self'")
    })

    it('includes unsafe-inline when no nonce provided', () => {
      const csp = contentSecurityPolicyFor('/')
      expect(csp).toContain("'unsafe-inline'")
      expect(csp).not.toContain("'nonce-")
    })

    it('includes nonce and removes unsafe-inline when nonce provided', () => {
      const nonce = 'test-nonce-123'
      const csp = contentSecurityPolicyFor('/', nonce)
      expect(csp).toContain(`'nonce-${nonce}'`)
      expect(csp).not.toContain("'unsafe-inline'")
      expect(csp).toContain("'strict-dynamic'")
    })

    it('includes required directives', () => {
      const csp = contentSecurityPolicyFor('/')
      expect(csp).toContain("default-src 'self'")
      expect(csp).toContain('script-src')
      expect(csp).toContain('style-src')
      expect(csp).toContain('img-src')
      expect(csp).toContain('font-src')
      expect(csp).toContain('connect-src')
      expect(csp).toContain('frame-src')
      expect(csp).toContain("base-uri 'self'")
      expect(csp).toContain('form-action')
      expect(csp).toContain("object-src 'none'")
      expect(csp).toContain('upgrade-insecure-requests')
    })

    it('allows Cloudflare challenges', () => {
      const csp = contentSecurityPolicyFor('/')
      expect(csp).toContain('https://challenges.cloudflare.com')
    })

    it('allows Supabase connections', () => {
      const csp = contentSecurityPolicyFor('/')
      expect(csp).toContain('https://*.supabase.co')
    })

    it('allows Cardcom payment frame', () => {
      const csp = contentSecurityPolicyFor('/')
      expect(csp).toContain('https://secure.cardcom.solutions')
    })
  })

  describe('frameOptionsFor', () => {
    it('returns DENY for regular paths', () => {
      expect(frameOptionsFor('/')).toBe('DENY')
      expect(frameOptionsFor('/product/test')).toBe('DENY')
    })

    it('returns SAMEORIGIN for payment frame path', () => {
      expect(frameOptionsFor('/checkout/frame-return')).toBe('SAMEORIGIN')
    })
  })

  describe('permissionsPolicyFor', () => {
    it('denies camera for regular paths', () => {
      const policy = permissionsPolicyFor('/')
      expect(policy).toContain('camera=()')
    })

    it('allows camera for scanner paths', () => {
      for (const path of CAMERA_PATHS) {
        const policy = permissionsPolicyFor(path)
        expect(policy).toContain('camera=(self)')
      }
    })

    it('includes microphone, geolocation, and payment directives', () => {
      const policy = permissionsPolicyFor('/')
      expect(policy).toContain('microphone=()')
      expect(policy).toContain('geolocation=()')
      expect(policy).toContain('payment=(self)')
    })
  })

  describe('CSP Nonce Integration', () => {
    it('nonce appears in both script-src and style-src', () => {
      const nonce = 'AbC123XyZ=='
      const csp = contentSecurityPolicyFor('/', nonce)

      // Extract directives
      const directives = csp.split('; ')
      const scriptSrc = directives.find((d) => d.startsWith('script-src'))
      const styleSrc = directives.find((d) => d.startsWith('style-src'))

      expect(scriptSrc).toContain(`'nonce-${nonce}'`)
      expect(styleSrc).toContain(`'nonce-${nonce}'`)
    })

    it('strict-dynamic only appears in script-src when nonce is provided', () => {
      const nonce = 'test123'
      const csp = contentSecurityPolicyFor('/', nonce)

      const directives = csp.split('; ')
      const scriptSrc = directives.find((d) => d.startsWith('script-src'))
      const styleSrc = directives.find((d) => d.startsWith('style-src'))

      expect(scriptSrc).toContain("'strict-dynamic'")
      expect(styleSrc).not.toContain("'strict-dynamic'")
    })

    it('does not include strict-dynamic without nonce', () => {
      const csp = contentSecurityPolicyFor('/')
      expect(csp).not.toContain("'strict-dynamic'")
    })
  })

  describe('Path-dependent behavior', () => {
    const testCases = [
      {
        path: '/',
        expectedFrameAncestors: "'none'",
        expectedFrameOptions: 'DENY',
        expectedCamera: '()',
      },
      {
        path: '/checkout/frame-return',
        expectedFrameAncestors: "'self'",
        expectedFrameOptions: 'SAMEORIGIN',
        expectedCamera: '()',
      },
      {
        path: '/scan',
        expectedFrameAncestors: "'none'",
        expectedFrameOptions: 'DENY',
        expectedCamera: '(self)',
      },
      {
        path: '/supplier/scan',
        expectedFrameAncestors: "'none'",
        expectedFrameOptions: 'DENY',
        expectedCamera: '(self)',
      },
    ]

    for (const {
      path,
      expectedFrameAncestors,
      expectedFrameOptions,
      expectedCamera,
    } of testCases) {
      it(`handles ${path} correctly`, () => {
        const csp = contentSecurityPolicyFor(path)
        expect(csp).toContain(`frame-ancestors ${expectedFrameAncestors}`)

        const frameOptions = frameOptionsFor(path)
        expect(frameOptions).toBe(expectedFrameOptions)

        const permissions = permissionsPolicyFor(path)
        expect(permissions).toContain(`camera=${expectedCamera}`)
      })
    }
  })
})
