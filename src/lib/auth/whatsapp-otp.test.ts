import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  generateOtpCode,
  sendWhatsAppOtp,
  whatsAppOtpEnabled,
  whatsAppOtpErrorHebrew,
} from './whatsapp-otp'

describe('whatsapp-otp', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  describe('whatsAppOtpEnabled', () => {
    it('returns false when env vars are missing', () => {
      const _env = {}
      vi.stubEnv('META_WHATSAPP_PHONE_NUMBER_ID', '')
      vi.stubEnv('META_WHATSAPP_ACCESS_TOKEN', '')
      expect(whatsAppOtpEnabled()).toBe(false)
    })

    it('returns true when env vars are set', () => {
      vi.stubEnv('META_WHATSAPP_PHONE_NUMBER_ID', '123456789')
      vi.stubEnv('META_WHATSAPP_ACCESS_TOKEN', 'test-token')
      expect(whatsAppOtpEnabled()).toBe(true)
    })
  })

  describe('generateOtpCode', () => {
    it('generates a 6-digit code', () => {
      const code = generateOtpCode()
      expect(code).toHaveLength(6)
      expect(/^\d{6}$/.test(code)).toBe(true)
    })

    it('generates different codes', () => {
      const codes = new Set()
      for (let i = 0; i < 10; i++) {
        codes.add(generateOtpCode())
      }
      expect(codes.size).toBeGreaterThan(1)
    })

    it('generates codes in valid range', () => {
      for (let i = 0; i < 10; i++) {
        const code = generateOtpCode()
        const num = Number.parseInt(code, 10)
        expect(num).toBeGreaterThanOrEqual(100000)
        expect(num).toBeLessThanOrEqual(999999)
      }
    })
  })

  describe('sendWhatsAppOtp', () => {
    beforeEach(() => {
      vi.stubEnv('META_WHATSAPP_PHONE_NUMBER_ID', '123456789')
      vi.stubEnv('META_WHATSAPP_ACCESS_TOKEN', 'test-token')
      global.fetch = vi.fn()
    })

    it('returns error when not configured', async () => {
      vi.stubEnv('META_WHATSAPP_PHONE_NUMBER_ID', '')
      vi.stubEnv('META_WHATSAPP_ACCESS_TOKEN', '')

      const result = await sendWhatsAppOtp('+972501234567', '123456')
      expect(result.success).toBe(false)
      expect(result.error).toContain('not configured')
    })

    it('sends OTP successfully', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          messages: [{ id: 'msg-123' }],
        }),
      })
      global.fetch = mockFetch

      const result = await sendWhatsAppOtp('+972501234567', '123456')
      expect(result.success).toBe(true)
      expect(result.messageId).toBe('msg-123')

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/messages'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token',
            'Content-Type': 'application/json',
          }),
        }),
      )
    })

    it('strips + from phone number', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ messages: [{ id: 'msg-123' }] }),
      })
      global.fetch = mockFetch

      await sendWhatsAppOtp('+972501234567', '123456')

      const callBody = JSON.parse(mockFetch.mock.calls[0]?.[1]?.body || '{}')
      expect(callBody.to).toBe('972501234567')
    })

    it('includes Hebrew message with code', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ messages: [{ id: 'msg-123' }] }),
      })
      global.fetch = mockFetch

      await sendWhatsAppOtp('+972501234567', '123456')

      const callBody = JSON.parse(mockFetch.mock.calls[0]?.[1]?.body || '{}')
      expect(callBody.text.body).toContain('123456')
      expect(callBody.text.body).toContain('קוד האימות')
    })

    it('handles API errors', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({
          error: { message: 'Invalid phone number' },
        }),
      })
      global.fetch = mockFetch

      const result = await sendWhatsAppOtp('+972501234567', '123456')
      expect(result.success).toBe(false)
      expect(result.error).toContain('Invalid phone number')
    })

    it('handles network errors', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'))
      global.fetch = mockFetch

      const result = await sendWhatsAppOtp('+972501234567', '123456')
      expect(result.success).toBe(false)
      expect(result.error).toContain('Network error')
    })
  })

  describe('whatsAppOtpErrorHebrew', () => {
    it('maps "not configured" error', () => {
      const msg = whatsAppOtpErrorHebrew('not configured')
      expect(msg).toBe('שירות WhatsApp אינו זמין כרגע')
    })

    it('maps rate limit errors', () => {
      expect(whatsAppOtpErrorHebrew('rate limit')).toContain('יותר מדי')
      expect(whatsAppOtpErrorHebrew('too many')).toContain('יותר מדי')
    })

    it('maps invalid phone errors', () => {
      expect(whatsAppOtpErrorHebrew('invalid phone')).toContain('לא תקין')
      expect(whatsAppOtpErrorHebrew('Invalid parameter')).toContain('לא תקין')
    })

    it('returns generic error for unknown messages', () => {
      const msg = whatsAppOtpErrorHebrew('unknown error')
      expect(msg).toContain('נכשלה')
    })
  })
})
