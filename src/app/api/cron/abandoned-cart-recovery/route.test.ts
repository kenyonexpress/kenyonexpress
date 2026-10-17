import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { createAdminClient, sendEmail, loadCartProductData, buildCartView } = vi.hoisted(
  () =>
    ({
      createAdminClient: vi.fn(),
      sendEmail: vi.fn(),
      loadCartProductData: vi.fn(),
      buildCartView: vi.fn(),
    }) as const,
)

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient }))
vi.mock('@/lib/growth/resend', () => ({ sendEmail }))
vi.mock('@/lib/cart/load-products', () => ({ loadCartProductData }))
vi.mock('@/lib/cart/pricing', () => ({ buildCartView }))

import { GET } from './route'

function request(auth?: string): NextRequest {
  return new NextRequest('https://example.test/api/cron/abandoned-cart-recovery', {
    headers: auth ? { authorization: auth } : {},
  })
}

describe('abandoned-cart-recovery cron', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('CRON_SECRET', 's3cret')
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://example.test')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  describe('authentication', () => {
    it('rejects request with no credential', async () => {
      expect((await GET(request())).status).toBe(401)
      expect(createAdminClient).not.toHaveBeenCalled()
      expect(sendEmail).not.toHaveBeenCalled()
    })

    it('rejects wrong credential', async () => {
      expect((await GET(request('Bearer wrong'))).status).toBe(401)
      expect(createAdminClient).not.toHaveBeenCalled()
    })

    it('stays closed when CRON_SECRET is unset', async () => {
      vi.stubEnv('CRON_SECRET', '')
      expect((await GET(request('Bearer '))).status).toBe(401)
      expect(createAdminClient).not.toHaveBeenCalled()
    })
  })

  describe('stage 1: +1h recovery emails', () => {
    it('sends stage 1 emails to due carts', async () => {
      const mockAdmin = {
        rpc: vi
          .fn()
          .mockResolvedValueOnce({
            data: [
              {
                cart_id: 'cart-1',
                user_id: 'user-1',
                email: 'test@example.com',
                item_count: 3,
              },
            ],
            error: null,
          })
          .mockResolvedValueOnce({
            data: [],
            error: null,
          }),
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { unsubscribe_token: 'token-123' },
              }),
            })),
          })),
          insert: vi.fn().mockResolvedValue({ error: null }),
          update: vi.fn(() => ({
            eq: vi.fn().mockResolvedValue({ error: null }),
          })),
        })),
      }

      createAdminClient.mockReturnValue(mockAdmin)
      sendEmail.mockResolvedValue({ ok: true, id: 'email-1' })

      const response = await GET(request('Bearer s3cret'))
      const json = await response.json()

      expect(response.status).toBe(200)
      expect(json.ok).toBe(true)
      expect(json.stage1.due).toBe(1)
      expect(json.stage1.sent).toBe(1)
      expect(json.stage1.failed).toBe(0)

      expect(sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'test@example.com',
          subject: 'קופון של 5% על המוצרים שבסל שלך',
          tag: 'abandoned_cart_recovery_1',
        }),
      )
    })

    it('handles email sending failures gracefully', async () => {
      const mockAdmin = {
        rpc: vi
          .fn()
          .mockResolvedValueOnce({
            data: [
              {
                cart_id: 'cart-1',
                user_id: 'user-1',
                email: 'test@example.com',
                item_count: 2,
              },
            ],
            error: null,
          })
          .mockResolvedValueOnce({
            data: [],
            error: null,
          }),
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn().mockResolvedValue({ data: null }),
            })),
          })),
        })),
      }

      createAdminClient.mockReturnValue(mockAdmin)
      sendEmail.mockResolvedValue({ ok: false })

      const response = await GET(request('Bearer s3cret'))
      const json = await response.json()

      expect(json.ok).toBe(true)
      expect(json.stage1.due).toBe(1)
      expect(json.stage1.sent).toBe(0)
      expect(json.stage1.failed).toBe(1)
    })

    it('skips emails when send is skipped (no API key)', async () => {
      const mockAdmin = {
        rpc: vi
          .fn()
          .mockResolvedValueOnce({
            data: [
              {
                cart_id: 'cart-1',
                user_id: 'user-1',
                email: 'test@example.com',
                item_count: 1,
              },
            ],
            error: null,
          })
          .mockResolvedValueOnce({
            data: [],
            error: null,
          }),
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn().mockResolvedValue({ data: null }),
            })),
          })),
        })),
      }

      createAdminClient.mockReturnValue(mockAdmin)
      sendEmail.mockResolvedValue({ skipped: true })

      const response = await GET(request('Bearer s3cret'))
      const json = await response.json()

      expect(json.ok).toBe(true)
      expect(json.stage1.due).toBe(1)
      expect(json.stage1.sent).toBe(0)
      expect(json.stage1.failed).toBe(0)
    })
  })

  describe('stage 2: +24h recovery emails', () => {
    it('sends stage 2 emails to due carts with escalated discount', async () => {
      const mockAdmin = {
        rpc: vi
          .fn()
          .mockResolvedValueOnce({
            data: [],
            error: null,
          })
          .mockResolvedValueOnce({
            data: [
              {
                cart_id: 'cart-2',
                user_id: 'user-2',
                email: 'test2@example.com',
                item_count: 5,
                nudge_id: 'nudge-1',
              },
            ],
            error: null,
          }),
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { unsubscribe_token: 'token-456' },
              }),
            })),
          })),
          insert: vi.fn().mockResolvedValue({ error: null }),
          update: vi.fn(() => ({
            eq: vi.fn().mockResolvedValue({ error: null }),
          })),
        })),
      }

      createAdminClient.mockReturnValue(mockAdmin)
      sendEmail.mockResolvedValue({ ok: true, id: 'email-2' })

      const response = await GET(request('Bearer s3cret'))
      const json = await response.json()

      expect(response.status).toBe(200)
      expect(json.ok).toBe(true)
      expect(json.stage2.due).toBe(1)
      expect(json.stage2.sent).toBe(1)

      const emailCall = sendEmail.mock.calls[0][0]
      expect(emailCall.subject).toBe('עוד הזדמנות: הנחה של 10% על הסל שלך')
      expect(emailCall.tag).toBe('abandoned_cart_recovery_2')
      expect(emailCall.html).toContain('10%')
    })

    it('does not send stage 2 before stage 1', async () => {
      const mockAdmin = {
        rpc: vi
          .fn()
          .mockResolvedValueOnce({
            data: [],
            error: null,
          })
          .mockResolvedValueOnce({
            data: [],
            error: null,
          }),
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn().mockResolvedValue({ data: null }),
            })),
          })),
        })),
      }

      createAdminClient.mockReturnValue(mockAdmin)

      const response = await GET(request('Bearer s3cret'))
      const json = await response.json()

      expect(json.stage1.due).toBe(0)
      expect(json.stage2.due).toBe(0)
      expect(sendEmail).not.toHaveBeenCalled()
    })
  })

  describe('response format', () => {
    it('returns proper structure on success', async () => {
      const mockAdmin = {
        rpc: vi
          .fn()
          .mockResolvedValueOnce({ data: [], error: null })
          .mockResolvedValueOnce({ data: [], error: null }),
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn().mockResolvedValue({ data: null }),
            })),
          })),
        })),
      }

      createAdminClient.mockReturnValue(mockAdmin)

      const response = await GET(request('Bearer s3cret'))
      const json = await response.json()

      expect(json).toEqual({
        ok: true,
        stage1: { due: 0, sent: 0, failed: 0 },
        stage2: { due: 0, sent: 0, failed: 0 },
        timestamp: expect.any(String),
      })
    })

    it('includes timestamp in response', async () => {
      const mockAdmin = {
        rpc: vi
          .fn()
          .mockResolvedValueOnce({ data: [], error: null })
          .mockResolvedValueOnce({ data: [], error: null }),
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn().mockResolvedValue({ data: null }),
            })),
          })),
        })),
      }

      createAdminClient.mockReturnValue(mockAdmin)
      const before = new Date()

      const response = await GET(request('Bearer s3cret'))
      const json = await response.json()
      const after = new Date()

      const timestamp = new Date(json.timestamp)
      expect(timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime())
      expect(timestamp.getTime()).toBeLessThanOrEqual(after.getTime())
    })
  })

  describe('HTML generation', () => {
    it('generates stage 1 HTML with 5% discount', async () => {
      const mockAdmin = {
        rpc: vi
          .fn()
          .mockResolvedValueOnce({
            data: [
              {
                cart_id: 'cart-1',
                user_id: 'user-1',
                email: 'test@example.com',
                item_count: 2,
              },
            ],
            error: null,
          })
          .mockResolvedValueOnce({
            data: [],
            error: null,
          }),
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { unsubscribe_token: 'token' },
              }),
            })),
          })),
          insert: vi.fn().mockResolvedValue({ error: null }),
        })),
      }

      createAdminClient.mockReturnValue(mockAdmin)
      sendEmail.mockResolvedValue({ ok: true, id: 'email-1' })

      await GET(request('Bearer s3cret'))

      const emailCall = sendEmail.mock.calls[0][0]
      expect(emailCall.html).toContain('5%')
      expect(emailCall.html).toContain('הנחה על כל הפריטים בסל')
      expect(emailCall.html).toContain('חזרה לסל שלי')
    })

    it('includes unsubscribe link when token exists', async () => {
      const mockAdmin = {
        rpc: vi
          .fn()
          .mockResolvedValueOnce({
            data: [
              {
                cart_id: 'cart-1',
                user_id: 'user-1',
                email: 'test@example.com',
                item_count: 1,
              },
            ],
            error: null,
          })
          .mockResolvedValueOnce({
            data: [],
            error: null,
          }),
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { unsubscribe_token: 'my-token' },
              }),
            })),
          })),
          insert: vi.fn().mockResolvedValue({ error: null }),
        })),
      }

      createAdminClient.mockReturnValue(mockAdmin)
      sendEmail.mockResolvedValue({ ok: true, id: 'email-1' })

      await GET(request('Bearer s3cret'))

      const emailCall = sendEmail.mock.calls[0][0]
      expect(emailCall.html).toContain('הסרה מרשימת הדיוור')
      expect(emailCall.html).toContain('/newsletter/unsubscribe?token=my-token')
    })
  })
})
