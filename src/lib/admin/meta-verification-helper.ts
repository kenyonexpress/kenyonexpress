export interface MetaVerificationData {
  businessName: string
  businessRegistrationNumber: string
  businessCategory: string
  websiteUrl: string
  businessEmail: string
  businessPhone: string
  ownerName: string
  businessAddress: string
}

/**
 * Generate verification checklist with current data.
 */
export function generateVerificationChecklist(data: MetaVerificationData): {
  complete: boolean
  missing: string[]
  ready: string[]
} {
  const required = [
    { key: 'businessName', label: 'Business Name' },
    { key: 'businessRegistrationNumber', label: 'Registration Number' },
    { key: 'businessCategory', label: 'Business Category' },
    { key: 'websiteUrl', label: 'Website URL' },
    { key: 'businessEmail', label: 'Business Email' },
    { key: 'businessPhone', label: 'Business Phone' },
    { key: 'ownerName', label: 'Owner Name' },
    { key: 'businessAddress', label: 'Business Address' },
  ]

  const missing: string[] = []
  const ready: string[] = []

  for (const field of required) {
    const value = data[field.key as keyof MetaVerificationData]
    if (!value || value.trim() === '') {
      missing.push(field.label)
    } else {
      ready.push(field.label)
    }
  }

  return {
    complete: missing.length === 0,
    missing,
    ready,
  }
}

/**
 * Format business data for Meta verification application.
 */
export function formatForMetaApplication(data: MetaVerificationData): string {
  return `
Meta WhatsApp Business Verification Application
==============================================

Business Information:
- Legal Business Name: ${data.businessName}
- Registration Number: ${data.businessRegistrationNumber}
- Category: ${data.businessCategory}
- Website: ${data.websiteUrl}

Contact Information:
- Business Email: ${data.businessEmail}
- Business Phone: ${data.businessPhone}
- Business Address: ${data.businessAddress}

Owner Information:
- Owner Name: ${data.ownerName}

Application Date: ${new Date().toISOString().split('T')[0]}

Next Steps:
1. Upload business registration documents
2. Upload government-issued ID
3. Submit application via Meta Business Manager
4. Await verification (1-3 business days)
  `.trim()
}
