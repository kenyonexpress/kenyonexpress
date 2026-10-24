import { describe, expect, it } from 'vitest'
import { isMetaWhatsappConfigured, sendWhatsappOtp } from './meta-cloud'

describe('Meta WhatsApp Cloud API sender', () => {
  it('is skipped, not failed, without credentials', async () => {
    const env = {} as NodeJS.ProcessEnv
    expect(isMetaWhatsappConfigured(env)).toBe(false)
    await expect(sendWhatsappOtp('+972501234567', '123456', env)).resolves.toEqual({
      ok: false,
      skipped: true,
      reason: 'META_WABA_* not configured',
    })
  })
})

describe('template rejection', () => {
  it('flags Meta template error codes only', async () => {
    const { isTemplateRejection } = await import('./meta-cloud')
    expect(isTemplateRejection(132001)).toBe(true)
    expect(isTemplateRejection(132015)).toBe(true)
    expect(isTemplateRejection(131047)).toBe(false)
    expect(isTemplateRejection(undefined)).toBe(false)
  })
})
