/**
 * Tests for Meta WhatsApp Business verification helper.
 * BACKLOG Item 3 implementation.
 */

import { describe, expect, it } from 'vitest'
import {
  type MetaVerificationData,
  formatForMetaApplication,
  generateVerificationChecklist,
} from '../meta-verification-helper'

describe('generateVerificationChecklist', () => {
  it('should return complete=true when all fields are filled', () => {
    const data: MetaVerificationData = {
      businessName: 'Kenyon Express Ltd',
      businessRegistrationNumber: '123456789',
      businessCategory: 'E-commerce',
      websiteUrl: 'https://kenyonexpress.co.il',
      businessEmail: 'info@kenyonexpress.co.il',
      businessPhone: '+972-50-1234567',
      ownerName: 'John Doe',
      businessAddress: 'Tel Aviv, Israel',
    }

    const result = generateVerificationChecklist(data)

    expect(result.complete).toBe(true)
    expect(result.missing).toHaveLength(0)
    expect(result.ready).toHaveLength(8)
  })

  it('should identify missing fields', () => {
    const data: MetaVerificationData = {
      businessName: 'Kenyon Express Ltd',
      businessRegistrationNumber: '',
      businessCategory: 'E-commerce',
      websiteUrl: '',
      businessEmail: 'info@kenyonexpress.co.il',
      businessPhone: '',
      ownerName: 'John Doe',
      businessAddress: 'Tel Aviv, Israel',
    }

    const result = generateVerificationChecklist(data)

    expect(result.complete).toBe(false)
    expect(result.missing).toContain('Registration Number')
    expect(result.missing).toContain('Website URL')
    expect(result.missing).toContain('Business Phone')
    expect(result.missing).toHaveLength(3)
    expect(result.ready).toHaveLength(5)
  })

  it('should treat whitespace-only fields as missing', () => {
    const data: MetaVerificationData = {
      businessName: '   ',
      businessRegistrationNumber: '\t',
      businessCategory: '\n',
      websiteUrl: '',
      businessEmail: '',
      businessPhone: '',
      ownerName: '',
      businessAddress: '',
    }

    const result = generateVerificationChecklist(data)

    expect(result.complete).toBe(false)
    expect(result.missing).toHaveLength(8)
    expect(result.ready).toHaveLength(0)
  })
})

describe('formatForMetaApplication', () => {
  it('should format complete business data for Meta', () => {
    const data: MetaVerificationData = {
      businessName: 'Kenyon Express Ltd',
      businessRegistrationNumber: '123456789',
      businessCategory: 'E-commerce',
      websiteUrl: 'https://kenyonexpress.co.il',
      businessEmail: 'info@kenyonexpress.co.il',
      businessPhone: '+972-50-1234567',
      ownerName: 'John Doe',
      businessAddress: 'Tel Aviv, Israel',
    }

    const result = formatForMetaApplication(data)

    expect(result).toContain('Meta WhatsApp Business Verification Application')
    expect(result).toContain('Kenyon Express Ltd')
    expect(result).toContain('123456789')
    expect(result).toContain('E-commerce')
    expect(result).toContain('https://kenyonexpress.co.il')
    expect(result).toContain('info@kenyonexpress.co.il')
    expect(result).toContain('+972-50-1234567')
    expect(result).toContain('John Doe')
    expect(result).toContain('Tel Aviv, Israel')
  })

  it('should include application date in ISO format', () => {
    const data: MetaVerificationData = {
      businessName: 'Test Business',
      businessRegistrationNumber: '999',
      businessCategory: 'Retail',
      websiteUrl: 'https://test.com',
      businessEmail: 'test@test.com',
      businessPhone: '+1234567890',
      ownerName: 'Test Owner',
      businessAddress: 'Test Address',
    }

    const result = formatForMetaApplication(data)

    // Check for date format YYYY-MM-DD
    expect(result).toMatch(/Application Date: \d{4}-\d{2}-\d{2}/)
  })

  it('should include next steps instructions', () => {
    const data: MetaVerificationData = {
      businessName: 'Test',
      businessRegistrationNumber: '1',
      businessCategory: 'Test',
      websiteUrl: 'https://test.com',
      businessEmail: 'test@test.com',
      businessPhone: '123',
      ownerName: 'Test',
      businessAddress: 'Test',
    }

    const result = formatForMetaApplication(data)

    expect(result).toContain('Next Steps:')
    expect(result).toContain('Upload business registration documents')
    expect(result).toContain('Upload government-issued ID')
    expect(result).toContain('Submit application via Meta Business Manager')
    expect(result).toContain('Await verification')
  })
})
