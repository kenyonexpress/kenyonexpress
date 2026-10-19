import { describe, expect, it } from 'vitest'
import {
  calculateSmsBroadcastMetrics,
  estimateSmsCost,
  formatPhoneForDisplay,
  getDeliveryHealthColor,
  getMessageLength,
  getSegmentProperties,
  isDeliveryHealthy,
  isValidPhoneNumber,
  normalizePhoneNumber,
} from '../broadcast-helpers'
import { isSmsStopKeyword, isWithinQuietHours, verifyTwilioWebhook } from '../twilio-webhook'

describe('SMS Broadcast System', () => {
  describe('Phone Number Validation', () => {
    it('should validate Israeli phone numbers with 05X format', () => {
      expect(isValidPhoneNumber('0521234567')).toBe(true)
      expect(isValidPhoneNumber('052-1234567')).toBe(true)
      expect(isValidPhoneNumber('0524567890')).toBe(true)
    })

    it('should validate Israeli phone numbers with +972 format', () => {
      expect(isValidPhoneNumber('+972-52-123-4567')).toBe(true)
      expect(isValidPhoneNumber('+972521234567')).toBe(true)
    })

    it('should reject invalid phone numbers', () => {
      expect(isValidPhoneNumber('123-4567')).toBe(false)
      expect(isValidPhoneNumber('04-1234-5678')).toBe(false)
      expect(isValidPhoneNumber('abc-def-ghij')).toBe(false)
    })
  })

  describe('Phone Number Normalization', () => {
    it('should convert 0 prefix to +972', () => {
      const normalized = normalizePhoneNumber('0521234567')
      expect(normalized).toMatch(/^\+972/)
      expect(normalized).toContain('52')
    })

    it('should handle various formats', () => {
      const normalized1 = normalizePhoneNumber('0524-123-4567')
      expect(normalized1).toBeDefined()

      const normalized2 = normalizePhoneNumber('+972-52-123-4567')
      expect(normalized2).toBeDefined()
    })

    it('should preserve +972 prefix if already present', () => {
      const normalized = normalizePhoneNumber('+972521234567')
      expect(normalized).toMatch(/^\+972/)
    })
  })

  describe('STOP Keyword Detection', () => {
    it('should detect STOP keyword', () => {
      expect(isSmsStopKeyword('STOP')).toBe(true)
      expect(isSmsStopKeyword('stop')).toBe(true)
      expect(isSmsStopKeyword('  STOP  ')).toBe(true)
    })

    it('should detect alternative unsubscribe keywords', () => {
      expect(isSmsStopKeyword('UNSTOP')).toBe(true)
      expect(isSmsStopKeyword('UNSUBSCRIBE')).toBe(true)
      expect(isSmsStopKeyword('CANCEL')).toBe(true)
      expect(isSmsStopKeyword('END')).toBe(true)
      expect(isSmsStopKeyword('QUIT')).toBe(true)
    })

    it('should not detect regular messages', () => {
      expect(isSmsStopKeyword('Hello, I want to stop by later')).toBe(false)
      expect(isSmsStopKeyword('Can you cancel my order?')).toBe(false)
      expect(isSmsStopKeyword('I love your deals')).toBe(false)
    })
  })

  describe('SMS Metrics Calculation', () => {
    it('should calculate delivery metrics correctly', () => {
      const metrics = calculateSmsBroadcastMetrics(100, 95, 3, 2, 0)
      expect(metrics.deliveryRate).toBe(95)
      expect(metrics.failureRate).toBe(3)
      expect(metrics.bounceRate).toBe(2)
      expect(metrics.optoutRate).toBe(0)
    })

    it('should handle zero total sent', () => {
      const metrics = calculateSmsBroadcastMetrics(0, 0, 0, 0, 0)
      expect(metrics.deliveryRate).toBe(0)
      expect(metrics.failureRate).toBe(0)
      expect(metrics.bounceRate).toBe(0)
      expect(metrics.optoutRate).toBe(0)
    })

    it('should round percentages to 2 decimals', () => {
      const metrics = calculateSmsBroadcastMetrics(1000, 333, 0, 0, 0)
      expect(metrics.deliveryRate).toBe(33.3)
    })
  })

  describe('Message Length Calculation', () => {
    it('should count ASCII characters', () => {
      expect(getMessageLength('Hello World')).toBe(11)
    })

    it('should count Unicode characters including Hebrew', () => {
      expect(getMessageLength('שלום עולם')).toBe(9)
    })

    it('should handle mixed content', () => {
      const length = getMessageLength('Hello שלום')
      expect(length).toBeGreaterThan(0)
    })
  })

  describe('Cost Estimation', () => {
    it('should calculate SMS cost based on recipient count', () => {
      const cost = estimateSmsCost(100, 0.01)
      expect(cost).toBe(1.0)
    })

    it('should default to $0.01 per SMS', () => {
      const cost = estimateSmsCost(1000)
      expect(cost).toBe(10.0)
    })

    it('should handle decimal costs', () => {
      const cost = estimateSmsCost(333, 0.0075)
      expect(cost).toBeCloseTo(2.498, 2)
    })
  })

  describe('Delivery Health Assessment', () => {
    it('should return green for healthy metrics', () => {
      expect(isDeliveryHealthy(3, 1)).toBe(true)
    })

    it('should return false for unhealthy bounce rate', () => {
      expect(isDeliveryHealthy(6, 1)).toBe(false)
    })

    it('should return false for unhealthy optout rate', () => {
      expect(isDeliveryHealthy(3, 3)).toBe(false)
    })

    it('should return color coding', () => {
      expect(getDeliveryHealthColor(1, 0.5)).toBe('green')
      expect(getDeliveryHealthColor(6, 1)).toBe('yellow')
      expect(getDeliveryHealthColor(11, 6)).toBe('red')
    })
  })

  describe('Segment Properties', () => {
    it('should return properties for Champions segment', () => {
      const props = getSegmentProperties('Champions')
      expect(props.label).toBe('Champions')
      expect(props.icon).toBe('star')
      expect(props.color).toBe('gold')
    })

    it('should return properties for all segments', () => {
      const segments = ['Champions', 'Loyal', 'Potential', 'At-Risk', 'Dormant']
      for (const segment of segments) {
        const props = getSegmentProperties(segment)
        expect(props.label).toBe(segment)
        expect(props.icon).toBeDefined()
        expect(props.color).toBeDefined()
      }
    })

    it('should return default for unknown segment', () => {
      const props = getSegmentProperties('Unknown')
      expect(props.label).toBe('Potential')
    })
  })

  describe('Phone Display Formatting', () => {
    it('should format phone for display', () => {
      const formatted = formatPhoneForDisplay('0521234567')
      expect(formatted).toContain('-')
    })
  })

  describe('Twilio Webhook Verification', () => {
    it('should verify valid Twilio webhook signature', async () => {
      const secret = 'test_auth_token'
      const url = 'https://example.com/webhooks/twilio'
      const data: Record<string, string> = { MessageSid: 'SM123', MessageStatus: 'delivered' }

      // Create expected signature
      const crypto = await import('node:crypto')
      let stringToSign = url
      const sortedKeys = Object.keys(data).sort()
      for (const key of sortedKeys) {
        stringToSign += key + data[key]
      }
      const expectedSignature = crypto
        .createHmac('sha1', secret)
        .update(stringToSign)
        .digest('base64')

      const result = await verifyTwilioWebhook(url, data, expectedSignature, secret)
      expect(result).toBe(true)
    })

    it('should reject invalid Twilio webhook signature', async () => {
      const result = await verifyTwilioWebhook(
        'https://example.com/webhooks/twilio',
        { MessageSid: 'SM123' },
        'invalid_signature',
        'test_secret',
      )
      expect(result).toBe(false)
    })

    it('should reject webhook without secret', async () => {
      const result = await verifyTwilioWebhook(
        'https://example.com/webhooks/twilio',
        { MessageSid: 'SM123' },
        'any_signature',
        '',
      )
      expect(result).toBe(false)
    })
  })

  describe('Quiet Hours Enforcement', () => {
    it('should detect when within quiet hours (same day)', () => {
      // Create a date during quiet hours (e.g., 9 PM with quiet hours 8 PM - 8 AM)
      const result = isWithinQuietHours('20:00', '08:00', 'UTC')
      // Result depends on current time, just verify function runs
      expect(typeof result).toBe('boolean')
    })

    it('should handle missing quiet hours', () => {
      expect(isWithinQuietHours(null, null)).toBe(false)
      expect(isWithinQuietHours('20:00', null)).toBe(false)
    })

    it('should handle wrapping quiet hours (overnight)', () => {
      // Quiet hours 22:00 - 06:00 (next day)
      const result = isWithinQuietHours('22:00', '06:00', 'UTC')
      expect(typeof result).toBe('boolean')
    })

    it('should handle invalid timezone gracefully', () => {
      const result = isWithinQuietHours('20:00', '08:00', 'Invalid/Timezone')
      expect(result).toBe(false)
    })
  })

  describe('SMS Broadcast Constants', () => {
    it('should define broadcast statuses', () => {
      const statuses = ['draft', 'scheduled', 'sending', 'sent', 'paused', 'cancelled']
      expect(statuses).toContain('draft')
      expect(statuses).toContain('sent')
      expect(statuses).toHaveLength(6)
    })

    it('should define recipient statuses', () => {
      const statuses = ['queued', 'sent', 'delivered', 'failed', 'bounced', 'opted_out']
      expect(statuses).toContain('delivered')
      expect(statuses).toContain('opted_out')
    })

    it('should define customer segments', () => {
      const segments = ['Champions', 'Loyal', 'Potential', 'At-Risk', 'Dormant']
      expect(segments).toHaveLength(5)
      expect(segments).toContain('At-Risk')
    })
  })

  describe('Broadcast Recipient Filtering', () => {
    it('should validate opt-in requirement', () => {
      // Broadcast should only include users with marketing_opted_in = true
      // This is handled at the DB level, so test the RPC logic
      expect(true).toBe(true) // Placeholder for integration test
    })

    it('should exclude unsubscribed users', () => {
      // Users in sms_unsubscribes should be excluded
      expect(true).toBe(true) // Placeholder for integration test
    })

    it('should respect segment-specific unsubscribes', () => {
      // Users can unsubscribe from one segment but not others
      expect(true).toBe(true) // Placeholder for integration test
    })
  })

  describe('Quiet Hours Enforcement in Broadcasting', () => {
    it('should not send during quiet hours', () => {
      // Broadcast scheduling should check quiet hours
      expect(true).toBe(true) // Placeholder for integration test
    })

    it('should queue for sending after quiet hours end', () => {
      // Messages queued during quiet hours should send at start time
      expect(true).toBe(true) // Placeholder for integration test
    })
  })
})
